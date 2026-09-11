import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TenantContextProjection } from '../../types';
import {
  STUDIO_ARTIFACT_TYPES,
  type StudioArtifactProjectionDto,
  type StudioArtifactSummaryDto,
  type StudioArtifactSummaryPageDto,
  type StudioArtifactWorkspaceProjectionDto,
  type StudioArtifactType,
  type StudioCommandResponse,
  type StudioCommandType,
} from '../../services/studioArtifacts/contracts';
import {
  executeStudioArtifactCommand,
  readStudioArtifact,
  readStudioEligibleReviewers,
  readStudioHandoffs,
  readStudioArtifactV2,
  readStudioArtifactWorkspace,
  readStudioArtifactSummaries,
  readStudioSourcePackageIdentity,
  readStudioWorkspace,
  executeStudioWorkspaceCommand,
  StudioArtifactBoundaryError,
  type StudioArtifactTransport,
  type StudioEligibleReviewer,
  type StudioHandoffOption,
  type StudioSourcePackageIdentity,
} from '../../services/studioArtifacts/client';
import type { StudioWorkspaceProjection } from '../../services/studioArtifacts/workspaceModel';
import { StudioAuthorityEpoch, studioAuthorityIdentity, type StudioAuthorityTicket } from '../../services/studioArtifacts/workspaceModel';
import { enterpriseIntelligenceClient } from '../../services/enterpriseIntelligenceClient';
import StudioArtifactRenditions from './StudioArtifactRenditions';
import StudioSourceCoverage from './StudioSourceCoverage';
import StructuredArtifactEditor from './StructuredArtifactEditor';
import StudioHandoffCenter from './StudioHandoffCenter';
import StudioSourcePackageBuilder, { type StudioSourceSetDraft } from './StudioSourcePackageBuilder';
import StatusBadge from '../shared/ui/StatusBadge';
import { validateStudioDraftContent } from '../../services/studioArtifacts/draftValidation';
import { isControlledHumanRuntimeEnabled } from '../../services/supabaseClient';
import { executePrCControlledHumanSyntheticGeneration, PrCControlledHumanSyntheticGenerationBoundaryError } from '../../services/studioArtifacts/prCControlledHumanSyntheticGeneration';

interface Props {
  /** React remount key used when the tenant/workspace scope changes. */
  key?: React.Key;
  context: TenantContextProjection;
  capabilities?: readonly string[];
  online?: boolean;
  captureMode?: boolean;
  transport?: StudioArtifactTransport;
}

type ViewState =
  | 'loading'
  | 'empty'
  | 'generating'
  | 'generation_failed'
  | 'draft'
  | 'reviewer_ready'
  | 'in_review'
  | 'changes_requested'
  | 'review_rejected'
  | 'approval_ready'
  | 'approved'
  | 'approval_rejected'
  | 'superseded'
  | 'offline'
  | 'stale'
  | 'version_conflict'
  | 'authorization_revoked'
  | 'read_only'
  | 'command_failed'
  | 'committed_reload_failed';

const labels: Record<StudioArtifactProjectionDto['lifecycle'], string> = {
  draft: 'Draft',
  reviewer_ready: 'Reviewer ready',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  review_rejected: 'Review rejected',
  approval_ready: 'Approval ready',
  approved: 'Approved',
  approval_rejected: 'Approval rejected',
  superseded: 'Superseded',
};

const capability: Record<StudioCommandType, string> = {
  'studio.artifact.generation.request': 'studio.artifacts.generate',
  'studio.artifact.draft.revise': 'studio.artifacts.edit',
  'studio.artifact.review.submit': 'studio.artifacts.edit',
  'studio.artifact.review.assign': 'studio.artifacts.review',
  'studio.artifact.review.resolve': 'studio.artifacts.review',
  'studio.artifact.approval.resolve': 'studio.artifacts.approve',
};

const stateForError = (error: unknown, generation = false): { state: ViewState; message: string } => {
  if (error instanceof PrCControlledHumanSyntheticGenerationBoundaryError) {
    return { state: 'generation_failed', message: error.code === 'MALFORMED_RESULT'
      ? 'Synthetic generation returned a mismatched exact binding. No success is recorded; retry the same exact operation to reconcile.'
      : 'Synthetic controlled-human generation is unavailable for this exact exercise. No success is recorded; retry the same exact operation to reconcile.' };
  }
  if (!navigator.onLine) return { state: 'offline', message: 'Offline. No command was submitted.' };
  if (error instanceof StudioArtifactBoundaryError) {
    if (error.code === 'VERSION_CONFLICT') return { state: 'version_conflict', message: 'Version conflict. Reload the current committed state.' };
    if (error.code === 'SOURCE_PACKAGE_STALE' || error.code === 'TEMPLATE_STALE' || error.code === 'HANDOFF_STALE') return { state: 'stale', message: 'The exact source, template, or handoff version changed. The prior committed artifact is preserved.' };
    if (error.code === 'HANDOFF_EXPIRED' || error.code === 'SESSION_EXPIRED') return { state: 'authorization_revoked', message: 'The handoff or session expired. No target document was created.' };
    if (error.code === 'AUTHORITY_STALE' || error.code === 'PERMISSION_DENIED') return { state: 'authorization_revoked', message: 'Authorization was revoked or became stale. Mutations are blocked.' };
    if (error.code === 'READ_ONLY' || error.code === 'FEATURE_DISABLED' || error.code === 'STUDIO_READ_ONLY' || error.code === 'STUDIO_FEATURE_DISABLED') return { state: 'read_only', message: 'Read-only maintenance. Committed canonical artifacts remain available.' };
    if (error.code === 'PROVIDER_UNAVAILABLE') return { state: 'generation_failed', message: 'Provider unavailable. No artifact version was created.' };
    if (error.code === 'SOURCE_COVERAGE_INCOMPLETE') return { state: 'command_failed', message: 'Source coverage is incomplete. No command was committed.' };
    if (error.code === 'BUDGET_EXHAUSTED') return { state: 'command_failed', message: 'The governed generation budget is exhausted. No artifact version was created.' };
    if (error.code === 'HANDOFF_NOT_ELIGIBLE') return { state: 'command_failed', message: 'This handoff is not eligible for the requested action. No target document was created.' };
    if (error.code === 'RECEIPT_FINALIZATION_FAILED') return { state: 'command_failed', message: 'Receipt finalization failed before a committed result was available. No success is recorded.' };
    if (error.code === 'GENERATION_FAILED') return { state: 'generation_failed', message: 'The committed generation attempt failed. No artifact version was created.' };
  }
  return { state: generation ? 'generation_failed' : 'command_failed', message: 'Command failed before commit. No success was recorded.' };
};

const sequence: StudioArtifactProjectionDto['lifecycle'][] = ['draft', 'reviewer_ready', 'in_review', 'approval_ready', 'approved'];

export default function StudioArtifactWorkspace({ context, capabilities = context.capabilities, online = true, captureMode = false, transport }: Props) {
  const [handoffs, setHandoffs] = useState<StudioHandoffOption[]>([]);
  const [handoffId, setHandoffId] = useState('');
  const [artifactType, setArtifactType] = useState<StudioArtifactType>('brd');
  const [artifact, setArtifact] = useState<StudioArtifactProjectionDto | null>(null);
  const [workspace, setWorkspace] = useState<StudioWorkspaceProjection | null>(null);
  const [artifactWorkspace, setArtifactWorkspace] = useState<StudioArtifactWorkspaceProjectionDto | null>(null);
  const [artifactSummaries, setArtifactSummaries] = useState<StudioArtifactSummaryPageDto | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState('');
  const selectedArtifactIdRef = useRef('');
  const [state, setState] = useState<ViewState>('loading');
  const [message, setMessage] = useState('Loading committed Studio sources.');
  const [receipt, setReceipt] = useState<StudioCommandResponse | null>(null);
  const [draft, setDraft] = useState('');
  const [draftValidationError, setDraftValidationError] = useState<string | null>(null);
  const [reviewers, setReviewers] = useState<StudioEligibleReviewer[]>([]);
  const [reviewerId, setReviewerId] = useState('');
  const [rationale, setRationale] = useState('');
  const [conditionsText, setConditionsText] = useState('');
  const [desiredExit, setDesiredExit] = useState<'studio'|'delivery'|'monitor'>('studio');
  const [selectedBundleVersionId,setSelectedBundleVersionId]=useState('');
  const [governedSelection,setGovernedSelection]=useState<{artifactId:string;sourcePackage:StudioSourcePackageIdentity}|null>(null);
  const [selectedTemplateVersionId,setSelectedTemplateVersionId]=useState('');
  const authorityIdentity = studioAuthorityIdentity(context);
  const authorityEpoch = useRef(new StudioAuthorityEpoch(context));
  const syntheticGenerationAttemptRef = useRef<{fingerprint:string;idempotencyKey:string;requestId:string}|null>(null);
  authorityEpoch.current.rebind(context);
  const accepts = useCallback((ticket: StudioAuthorityTicket) => authorityEpoch.current.accepts(ticket), []);
  const canReadArtifacts = capabilities.includes('studio.artifacts.read');
  const canReadWorkspace = capabilities.some(item => ['studio.sources.read', 'studio.handoffs.read', 'studio.templates.read'].includes(item));
  const offline = !online || !navigator.onLine;
  const blockedByReload = state==='committed_reload_failed';
  const blocked = offline || blockedByReload || ['loading', 'generating', 'stale', 'version_conflict', 'authorization_revoked', 'read_only', 'command_failed', 'generation_failed'].includes(state) || artifact?.readOnly === true || workspace?.readOnly === true;
  const conditions = useMemo(() => conditionsText.split('\n').map(item => item.trim()).filter(Boolean), [conditionsText]);
  const controlledHumanSyntheticGeneration = isControlledHumanRuntimeEnabled();

  const clearProjection = useCallback(() => {
    setArtifact(null);
    setArtifactWorkspace(null);
    setArtifactSummaries(null);
    selectedArtifactIdRef.current='';
    setSelectedArtifactId('');
    setWorkspace(null);
    setReceipt(null);
    setReviewers([]);
    setReviewerId('');
    setHandoffs([]);
    setHandoffId('');
    setDraft('');
    setDraftValidationError(null);
    setRationale('');
    setConditionsText('');
    setGovernedSelection(null);
    setSelectedBundleVersionId('');
    setSelectedTemplateVersionId('');
    syntheticGenerationAttemptRef.current=null;
  }, []);

  const loadGovernedSummary = useCallback(async (summary: StudioArtifactSummaryDto, ticket: StudioAuthorityTicket) => {
    const [sourcePackage, exactWorkspace, value] = await Promise.all([
      readStudioSourcePackageIdentity(context, summary.id, transport),
      readStudioArtifactWorkspace(context, summary.id, 0, 20, transport),
      summary.currentVersionId ? readStudioArtifactV2(context, summary.id, transport) : Promise.resolve(null),
    ]);
    if (!accepts(ticket)) return;
    if (sourcePackage.artifactId !== summary.id || sourcePackage.aggregateVersion !== summary.aggregateVersion
      || sourcePackage.sourceMode !== summary.sourceMode || sourcePackage.lineageClassification !== summary.lineageClassification
      || sourcePackage.planningOnly !== summary.planningOnly || exactWorkspace.artifact.id !== summary.id
      || exactWorkspace.artifact.aggregateVersion !== summary.aggregateVersion || exactWorkspace.sourcePackage.id !== sourcePackage.sourcePackageId
      || exactWorkspace.sourcePackage.version !== sourcePackage.sourcePackageVersion || exactWorkspace.sourcePackage.hash !== sourcePackage.sourcePackageHash
      || exactWorkspace.sourcePackage.mode !== summary.sourceMode || exactWorkspace.sourcePackage.lineageClassification !== summary.lineageClassification
      || exactWorkspace.sourcePackage.planningOnly !== summary.planningOnly) throw new StudioArtifactBoundaryError('MALFORMED_RESULT');
    if (value && (value.id !== summary.id || value.aggregateVersion !== summary.aggregateVersion
      || value.lifecycle !== summary.lifecycle || value.currentVersion.id !== summary.currentVersionId
      || (value.currentApprovedVersion?.id ?? null) !== summary.currentApprovedVersionId)) throw new StudioArtifactBoundaryError('MALFORMED_RESULT');
    selectedArtifactIdRef.current=summary.id;setSelectedArtifactId(summary.id);
    setGovernedSelection({ artifactId: summary.id, sourcePackage });
    setArtifactWorkspace(exactWorkspace);
    setArtifact(value);
    setState(value?.readOnly ? 'read_only' : value?.lifecycle ?? 'empty');
    setMessage(value
      ? `${summary.displayLabel} reloaded from the server artifact index.`
      : `${summary.displayLabel} source package reloaded. Select an approved template to generate its first immutable version.`);
    if (value && ['reviewer_ready', 'in_review'].includes(value.lifecycle)) {
      const eligible = await readStudioEligibleReviewers(context, value.id, value.currentVersion.id, transport);
      if (!accepts(ticket)) return;
      setReviewers(eligible);
      setReviewerId(current => eligible.some(item => item.actorId === current) ? current : (eligible[0]?.actorId ?? ''));
    } else {
      setReviewers([]);
      setReviewerId('');
    }
  }, [accepts, context, transport]);

  const load = useCallback(async (selected = '', type = artifactType, preserveProjection = true) => {
    const ticket = authorityEpoch.current.issue();
    if (offline) {
      setState('offline');
      setMessage('Offline. Committed content remains visible; mutations are blocked.');
      return;
    }
    if (!preserveProjection) {
      clearProjection();
    }
    setState('loading');
    try {
      const [artifactResult, workspaceResult, summaryResult] = await Promise.all([
        canReadArtifacts
          ? readStudioHandoffs(context, transport).then(value => ({ value, unavailable: false })).catch(() => ({ value: [] as StudioHandoffOption[], unavailable: true }))
          : Promise.resolve({ value: [] as StudioHandoffOption[], unavailable: false }),
        canReadWorkspace
          ? readStudioWorkspace(context, 1, transport).then(value => ({ value, unavailable: false })).catch(() => ({ value: null, unavailable: true }))
          : Promise.resolve({ value: null, unavailable: false }),
        canReadArtifacts
          ? readStudioArtifactSummaries(context, 0, 20, transport).then(value => ({ value, unavailable: false })).catch(() => ({ value: null, unavailable: true }))
          : Promise.resolve({ value: null, unavailable: false }),
      ]);
      if (!accepts(ticket)) return;
      const workspaceProjection = workspaceResult.value;
      setArtifactSummaries(summaryResult.value);
      setWorkspace(workspaceProjection);
      setSelectedTemplateVersionId(current=>workspaceProjection?.templates.some(item=>item.templateVersionId===current&&item.lifecycle==='approved'&&(item.artifactType===type||item.artifactType==='custom'))?current:'');
      const sources = artifactResult.value;
      setHandoffs(sources);
      const id = selected || sources[0]?.id || '';
      setHandoffId(id);
      if (!canReadArtifacts) {
        setState('empty');
        setMessage(workspaceProjection ? 'Authorized governed Studio projections loaded. Artifact content is not available to this capability set.' : 'No authorized Studio projection is available to this capability set.');
        return;
      }
      const summary = summaryResult.value?.items.find(item => item.id === selectedArtifactIdRef.current)
        ?? summaryResult.value?.items[0];
      if (summary) {
        await loadGovernedSummary(summary, ticket);
        return;
      }
      if (!id) {
        setState('empty');
        setMessage(artifactResult.unavailable ? 'Artifact discovery is unavailable. Other authorized Studio projections remain usable.' : 'No accepted governed Studio handoffs are available.');
        return;
      }
      try {
        const value = await readStudioArtifact(context, id, type, transport);
        if (!accepts(ticket)) return;
        setArtifact(value);
        if (value.contractVersion === 'studio-artifact-2') {
          const exactWorkspace = await readStudioArtifactWorkspace(context, value.id, 0, 20, transport);
          if (!accepts(ticket)) return;
          setArtifactWorkspace(exactWorkspace);
        }
        setState(value.readOnly ? 'read_only' : value.lifecycle);
        setMessage(captureMode ? 'Synthetic capture fixture · AP Invoice Exception Handling control brief. No persisted artifact state is changed.' : value.readOnly ? 'Read-only maintenance. Committed canonical artifacts remain available.' : workspaceResult.unavailable ? 'Current committed legacy artifact loaded. Optional multi-source projections are unavailable for this authority context.' : 'Current committed artifact loaded.');
        if (['reviewer_ready', 'in_review'].includes(value.lifecycle)) {
          const eligible = await readStudioEligibleReviewers(context, value.id, value.currentVersion.id, transport);
          if (!accepts(ticket)) return;
          setReviewers(eligible);
          setReviewerId(current => eligible.some(item => item.actorId === current) ? current : (eligible[0]?.actorId ?? ''));
        }
      } catch (error) {
        if (error instanceof StudioArtifactBoundaryError && error.code === 'RESOURCE_NOT_AVAILABLE') {
          setState('empty');
          setMessage('No canonical artifact exists for this source and type.');
        } else {
          throw error;
        }
      }
    } catch (error) {
      if (!accepts(ticket)) return;
      const next = stateForError(error);
      setState(next.state === 'command_failed' ? 'stale' : next.state);
      setMessage(next.state === 'command_failed' ? 'Studio authority is unavailable. Reload the current committed state.' : next.message);
    }
  }, [accepts, artifactType, canReadArtifacts, canReadWorkspace, captureMode, clearProjection, context, loadGovernedSummary, offline, transport]);

  useEffect(() => {
    void load('', artifactType, false);
  }, [artifactType, context.authorizationVersion, context.organizationId, context.userId, context.workspaceId, load]);

  useEffect(()=>{setGovernedSelection(null);setSelectedBundleVersionId('');setSelectedTemplateVersionId('');setArtifactWorkspace(null);},[artifactType,authorityIdentity]);

  const run = async (commandType: StudioCommandType, payload: Record<string, unknown>) => {
    const ticket = authorityEpoch.current.issue();
    if (blocked) return;
    if (offline) {
      setState('offline');
      setMessage('Offline. No command was submitted.');
      return;
    }
    setState(commandType === 'studio.artifact.generation.request' ? 'generating' : 'loading');
    setMessage('Submitting. Success appears only after commit and projection reload.');
    try {
      const result = await executeStudioArtifactCommand(context, commandType, artifact, payload, crypto.randomUUID(), transport);
      if (!accepts(ticket)) return;
      setReceipt(result);
      if (result.outcome === 'generation_failed') {
        setState('generation_failed');
        setMessage(`Generation attempt committed (receipt ${result.receiptId}) and later failed. No artifact version was created.`);
        return;
      }
      try {
        const value = artifact?.contractVersion==='studio-artifact-2'
          ? await readStudioArtifactV2(context,artifact.id,transport)
          : await readStudioArtifact(context, handoffId, artifactType, transport);
        if (!accepts(ticket)) return;
        if(artifact?.contractVersion==='studio-artifact-2'&&value.id!==artifact.id)throw new StudioArtifactBoundaryError('MALFORMED_RESULT');
        const exactWorkspace = value.contractVersion === 'studio-artifact-2'
          ? await readStudioArtifactWorkspace(context, value.id, 0, 20, transport)
          : null;
        if (!accepts(ticket)) return;
        setArtifact(value);
        setArtifactWorkspace(exactWorkspace);
        setState(value.readOnly ? 'read_only' : value.lifecycle);
        setMessage(`${labels[value.lifecycle]} committed.`);
        if(['reviewer_ready','in_review'].includes(value.lifecycle)){
          const eligible=await readStudioEligibleReviewers(context,value.id,value.currentVersion.id,transport);
          if (!accepts(ticket)) return;
          setReviewers(eligible);setReviewerId(eligible[0]?.actorId??'');
        }
      } catch {
        if (!accepts(ticket)) return;
        setState('committed_reload_failed');
        setMessage(`Command committed (receipt ${result.receiptId}), but projection reload failed. Mutations are blocked.`);
      }
    } catch (error) {
      if (!accepts(ticket)) return;
      const next = stateForError(error, commandType === 'studio.artifact.generation.request');
      setState(next.state);
      setMessage(next.message);
    }
  };

  const revise = () => {
    const validation = validateStudioDraftContent(draft);
    if (!validation.valid) {
      setDraftValidationError(validation.error);
      return;
    }
    setDraftValidationError(null);
    void run('studio.artifact.draft.revise', {artifactId: artifact!.id,parentVersionId:artifact!.currentVersion.id,content:validation.content});
  };

  const reviseStructured = (content: Record<string, unknown>) => {
    setDraft(JSON.stringify(content));
    setDraftValidationError(null);
    void run('studio.artifact.draft.revise', {artifactId: artifact!.id,parentVersionId:artifact!.currentVersion.id,content});
  };

  const loadWorkspacePage = async (page: number) => {
    const ticket = authorityEpoch.current.issue();
    try {
      if (artifactWorkspace && artifact) {
        const next = await readStudioArtifactWorkspace(context, artifact.id, (page - 1) * artifactWorkspace.selectedSources.limit, artifactWorkspace.selectedSources.limit, transport);
        if (accepts(ticket)) setArtifactWorkspace(next);
      } else {
        const next = await readStudioWorkspace(context,page,transport);
        if (accepts(ticket)) setWorkspace(next);
      }
    } catch { if (accepts(ticket)) setMessage('Source coverage page could not be loaded. The committed artifact remains visible.'); }
  };

  const selectGovernedArtifact = async (artifactId: string) => {
    const summary=artifactSummaries?.items.find(item=>item.id===artifactId);
    if(!summary)return;
    const ticket=authorityEpoch.current.issue();
    setState('loading');setMessage('Reloading exact governed artifact from the server index.');
    try{await loadGovernedSummary(summary,ticket);}catch(error){if(!accepts(ticket))return;const next=stateForError(error);setState(next.state);setMessage(next.message);}
  };

  const loadArtifactSummaryPage = async (page: number) => {
    if(!artifactSummaries)return;
    const ticket=authorityEpoch.current.issue(),offset=(page-1)*artifactSummaries.limit;
    try{const next=await readStudioArtifactSummaries(context,offset,artifactSummaries.limit,transport);if(!accepts(ticket))return;setArtifactSummaries(next);const first=next.items[0];if(first)await loadGovernedSummary(first,ticket);}catch{if(accepts(ticket))setMessage('Artifact index page could not be loaded. The committed artifact remains visible.');}
  };

  const reloadWorkspaceAfterSourceCommit=async(success:string,ticket:StudioAuthorityTicket)=>{const next=await readStudioWorkspace(context,1,transport);if(!accepts(ticket))return;if(!next){setState('committed_reload_failed');setMessage('Source command committed, but projection reload failed. Mutations are blocked.');throw new Error('reload');}setWorkspace(next);setMessage(success);};
  const commitStudioSourceSet=async(draft:StudioSourceSetDraft)=>{const ticket=authorityEpoch.current.issue();if(!capabilities.includes('studio.sources.manage'))throw new StudioArtifactBoundaryError('PERMISSION_DENIED');const invoke=transport?.commitStudioSourceSet??((input)=>enterpriseIntelligenceClient.commitStudioTranscriptSourceSet(input));await invoke({organizationId:context.organizationId,workspaceId:context.workspaceId,...draft});if(!accepts(ticket))return;await reloadWorkspaceAfterSourceCommit('Immutable Studio source-set version committed and reloaded.',ticket);};
  const lockStudioInputBundle=async(sourceSetVersionSelectors:string[])=>{const ticket=authorityEpoch.current.issue();if(!capabilities.includes('studio.sources.manage'))throw new StudioArtifactBoundaryError('PERMISSION_DENIED');const invoke=transport?.lockStudioInputBundle??((input)=>enterpriseIntelligenceClient.lockStudioTranscriptInputBundle(input));await invoke({organizationId:context.organizationId,workspaceId:context.workspaceId,sourceSetVersionSelectors,label:'Studio transcript bundle'});if(!accepts(ticket))return;await reloadWorkspaceAfterSourceCommit('Exact Studio input bundle locked and reloaded.',ticket);};
  const exactPackageFromResult=async(result:StudioCommandResponse,ticket:StudioAuthorityTicket,expectedMode?:StudioSourcePackageIdentity['sourceMode'])=>{const resource=result.resource as Record<string,unknown>;const artifactId=typeof resource.artifactId==='string'?resource.artifactId:result.resourceId;const sourcePackageId=typeof resource.sourcePackageId==='string'?resource.sourcePackageId:'';if(artifactId!==result.resourceId||!sourcePackageId)throw new StudioArtifactBoundaryError('MALFORMED_RESULT');const sourcePackage=await readStudioSourcePackageIdentity(context,artifactId,transport);if(!accepts(ticket))throw new StudioArtifactBoundaryError('AUTHORITY_STALE');if(sourcePackage.artifactId!==artifactId||sourcePackage.sourcePackageId!==sourcePackageId||sourcePackage.sourcePackageVersion!==sourcePackage.version||(expectedMode&&sourcePackage.sourceMode!==expectedMode))throw new StudioArtifactBoundaryError('SOURCE_PACKAGE_STALE');setGovernedSelection({artifactId,sourcePackage});selectedArtifactIdRef.current=artifactId;setSelectedArtifactId(artifactId);const exactWorkspace=await readStudioArtifactWorkspace(context,artifactId,0,20,transport);if(!accepts(ticket))throw new StudioArtifactBoundaryError('AUTHORITY_STALE');setArtifactWorkspace(exactWorkspace);if(canReadArtifacts){try{const summaries=await readStudioArtifactSummaries(context,0,20,transport);if(accepts(ticket))setArtifactSummaries(summaries);}catch{/* The committed package remains usable by exact command result identity. */}}return{artifactId,sourcePackage};};
  const createStudioSourcePackage=async(input:{mode:'direct';bundleVersionId:string}|{mode:'manual';manualBrief:string})=>{const ticket=authorityEpoch.current.issue();if(!workspace)throw new StudioArtifactBoundaryError('COMMAND_UNAVAILABLE');const bundle=input.mode==='direct'?workspace.sourceAuthority.inputBundles.find(item=>item.inputBundleVersionId===input.bundleVersionId):null;if(input.mode==='direct'&&!bundle)throw new StudioArtifactBoundaryError('SOURCE_PACKAGE_STALE');const payload=input.mode==='direct'?{sourceMode:'direct_transcript_bundle',artifactType,studioInputBundle:{id:bundle!.inputBundleId,versionId:bundle!.inputBundleVersionId,version:bundle!.currentVersion},manualBrief:null}:{sourceMode:'manual_brief',artifactType,studioInputBundle:null,manualBrief:input.manualBrief};const result=await executeStudioWorkspaceCommand(context,'studio.source-package.create',0,payload,crypto.randomUUID(),transport);if(!accepts(ticket))return;setReceipt(result);const verified=await exactPackageFromResult(result,ticket,input.mode==='direct'?'direct_transcript_bundle':'manual_brief');if(!verified.sourcePackage.planningOnly||verified.sourcePackage.lineageClassification!=='not_assessed'||verified.sourcePackage.hasAssessAncestry||(input.mode==='manual'?!verified.sourcePackage.hasManualBrief:!verified.sourcePackage.hasStudioTranscriptBundle))throw new StudioArtifactBoundaryError('MALFORMED_RESULT');if(accepts(ticket))setMessage('Exact Studio Source Package committed and verified · Not assessed · planning only.');};

  const generateGovernedPackage=async()=>{
    const ticket=authorityEpoch.current.issue();
    if(!workspace||!governedSelection||blocked||!capabilities.includes('studio.artifacts.generate'))return;
    const selectedTemplate=workspace.templates.find(item=>item.templateVersionId===selectedTemplateVersionId);
    if(!selectedTemplate||selectedTemplate.lifecycle!=='approved'||!selectedTemplate.actions.includes('studio.generation.request')||(selectedTemplate.artifactType!==artifactType&&selectedTemplate.artifactType!=='custom')){
      setState('command_failed');setMessage('Select an available approved exact template version for this artifact type. The prior source package remains committed.');return;
    }
    const template=selectedTemplate.ownership==='system'?{kind:'system' as const,versionId:selectedTemplate.templateVersionId,version:String(selectedTemplate.version)}:{kind:'tenant' as const,templateId:selectedTemplate.templateId,versionId:selectedTemplate.templateVersionId,version:Number(selectedTemplate.version)};
    const syntheticTemplate=selectedTemplate.ownership==='system'
      ? {kind:'system' as const,versionId:selectedTemplate.templateVersionId,version:String(selectedTemplate.version),hash:selectedTemplate.templateHash}
      : {kind:'tenant' as const,templateId:selectedTemplate.templateId,versionId:selectedTemplate.templateVersionId,version:Number(selectedTemplate.version),hash:selectedTemplate.templateHash};
    let committed=false;setState('generating');setMessage('Reloading exact source package heads before generation. Success appears only after the committed v2 projection reloads.');
    try{
      const sourcePackage=await readStudioSourcePackageIdentity(context,governedSelection.artifactId,transport);
      if(!accepts(ticket))return;
      if(sourcePackage.artifactId!==governedSelection.artifactId||sourcePackage.sourcePackageId!==governedSelection.sourcePackage.sourcePackageId||sourcePackage.sourcePackageVersion!==governedSelection.sourcePackage.sourcePackageVersion)throw new StudioArtifactBoundaryError('SOURCE_PACKAGE_STALE');
      const syntheticAttempt=controlledHumanSyntheticGeneration?(()=>{const fingerprint=[sourcePackage.artifactId,sourcePackage.aggregateVersion,sourcePackage.sourcePackageId,sourcePackage.sourcePackageVersion,sourcePackage.sourcePackageHash,sourcePackage.currentVersionId??'',sourcePackage.currentApprovedVersionId??'',selectedTemplate.templateVersionId,selectedTemplate.templateHash].join(':');const retained=syntheticGenerationAttemptRef.current;if(retained?.fingerprint===fingerprint)return retained;const created={fingerprint,idempotencyKey:`pr264.${crypto.randomUUID()}`,requestId:crypto.randomUUID()};syntheticGenerationAttemptRef.current=created;return created;})():null;
      const result=controlledHumanSyntheticGeneration
        ? await executePrCControlledHumanSyntheticGeneration(context,{sourcePackage,template:syntheticTemplate,requestId:syntheticAttempt!.requestId},syntheticAttempt!.idempotencyKey)
        : await executeStudioWorkspaceCommand(context,'studio.generation.request',sourcePackage.aggregateVersion,{artifactId:sourcePackage.artifactId,sourcePackageId:sourcePackage.sourcePackageId,sourcePackageVersion:sourcePackage.sourcePackageVersion,template,expectedCurrentVersionId:sourcePackage.currentVersionId,expectedApprovedVersionId:sourcePackage.currentApprovedVersionId},crypto.randomUUID(),transport);
      if(!accepts(ticket))return;
      if(controlledHumanSyntheticGeneration)syntheticGenerationAttemptRef.current=null;
      committed=true;setReceipt(result);
      if(result.outcome==='generation_failed'){setState('generation_failed');setMessage(`Generation attempt committed (receipt ${result.receiptId}) and failed. No artifact version was created.`);return;}
      if(result.outcome==='generation_stale'){setState('stale');setMessage(`Generation attempt committed (receipt ${result.receiptId}) but the exact source or template became stale. No current artifact version moved.`);return;}
      if(result.outcome==='generation_uncertain'||result.outcome==='command_in_progress'){setState('generation_failed');setMessage(`Generation receipt ${result.receiptId} is not terminally reloadable. No success is claimed.`);return;}
      const [value, exactWorkspace]=await Promise.all([readStudioArtifactV2(context,sourcePackage.artifactId,transport),readStudioArtifactWorkspace(context,sourcePackage.artifactId,0,20,transport)]);if(!accepts(ticket))return;const projectedPackage=value.sourcePackage,projectedTemplate=value.template;
      if(!projectedPackage||!projectedTemplate||value.contractVersion!=='studio-artifact-2'||!('sourcePackageId' in value.ancestry)||value.id!==sourcePackage.artifactId||value.ancestry.sourcePackageId!==sourcePackage.sourcePackageId||value.ancestry.sourcePackageVersion!==sourcePackage.sourcePackageVersion||value.ancestry.sourcePackageHash!==sourcePackage.sourcePackageHash||projectedPackage.id!==sourcePackage.sourcePackageId||projectedPackage.version!==sourcePackage.sourcePackageVersion||projectedTemplate.templateVersionId!==selectedTemplate.templateVersionId||projectedTemplate.version!==selectedTemplate.version||projectedTemplate.templateHash!==selectedTemplate.templateHash)throw new StudioArtifactBoundaryError('MALFORMED_RESULT');
      if(exactWorkspace.artifact.id!==value.id||exactWorkspace.artifact.currentVersionId!==value.currentVersion.id||exactWorkspace.sourcePackage.id!==sourcePackage.sourcePackageId||exactWorkspace.sourcePackage.version!==sourcePackage.sourcePackageVersion||exactWorkspace.sourcePackage.hash!==sourcePackage.sourcePackageHash)throw new StudioArtifactBoundaryError('MALFORMED_RESULT');
      setArtifact(value);setArtifactWorkspace(exactWorkspace);setGovernedSelection({artifactId:sourcePackage.artifactId,sourcePackage});setState(value.readOnly?'read_only':value.lifecycle);setMessage(controlledHumanSyntheticGeneration?`${labels[value.lifecycle]} committed as visibly marked synthetic controlled-human output from exact Studio Source Package v${sourcePackage.sourcePackageVersion}; no provider route or provider call was used.`:`${labels[value.lifecycle]} committed from exact Studio Source Package v${sourcePackage.sourcePackageVersion}; v2 projection reloaded.`);
    }catch(error){if(!accepts(ticket))return;if(committed){setState('committed_reload_failed');setMessage('Generation command committed, but the exact v2 projection reload failed or mismatched. Mutations are blocked.');return;}const next=stateForError(error,true);setState(next.state);setMessage(next.message);}
  };

  const handoffAction = async (handoff: NonNullable<StudioWorkspaceProjection>['inbox'][number], action: 'request'|'review-approve'|'request-changes'|'review-reject'|'final-approve'|'final-reject'|'withdraw'|'consume', rationale: string) => {
    const ticket=authorityEpoch.current.issue();
    if (!workspace || blocked) return;
    const requiredCapability=action==='request'||action==='withdraw'?'studio.handoffs.request':action.startsWith('review-')||action==='request-changes'?'studio.handoffs.review':action.startsWith('final-')?'studio.handoffs.approve':'studio.handoffs.consume';
    if(!capabilities.includes(requiredCapability)){setMessage('Current capability does not permit this handoff action. No command was submitted.');return;}
    if(action==='request'&&!handoff.artifactTypes.includes(artifactType)){setMessage(`${artifactType.toUpperCase()} is not eligible for this upstream handoff. Select a supported artifact type before requesting.`);return;}
    const targetBundle=selectedBundleVersionId?workspace.sourceAuthority.inputBundles.find(item=>item.inputBundleVersionId===selectedBundleVersionId):null;
    const command = action==='request'?'studio.handoff.request':action==='consume'?'studio.handoff.consume':action==='withdraw'?'studio.handoff.withdraw':action.startsWith('final-')?'studio.handoff.approval.resolve':'studio.handoff.review.resolve';
    const payload = action==='request'
      ? {upstreamHandoffId:handoff.upstreamHandoffId,artifactType,targetInputBundle:targetBundle?{id:targetBundle.inputBundleId,versionId:targetBundle.inputBundleVersionId,version:targetBundle.currentVersion}:null}
      : action==='consume'
        ? {handoffId:handoff.handoffId,handoffVersion:handoff.version}
        : action==='withdraw'
          ? {handoffId:handoff.handoffId,handoffVersion:handoff.version,rationale}
          : {handoffId:handoff.handoffId,handoffVersion:handoff.version,outcome:action==='review-approve'||action==='final-approve'?'approve':action==='request-changes'?'changes_requested':'reject',rationale,conditions:[]};
    setMessage('Submitting handoff decision. No target exists until a committed consume response is reloaded.');
    let result;
    const commandVersion=action==='request'?0:handoff.version;
    if(action==='request'&&(!Number.isSafeInteger(handoff.sourceVersion)||Number(handoff.sourceVersion)<1)){setMessage('The exact upstream source version is unavailable. Reload before performing this handoff action.');return;}
    if(action!=='request'&&(!Number.isSafeInteger(commandVersion)||Number(commandVersion)<1)){setMessage('The exact handoff version is unavailable. Reload before performing this handoff action.');return;}
    try { result = await executeStudioWorkspaceCommand(context,command,Number(commandVersion),payload,crypto.randomUUID(),transport,action==='request'?{handoffSourceVersion:Number(handoff.sourceVersion)}:undefined); }
    catch(error) { if(!accepts(ticket))return;const next=stateForError(error); setState(next.state); setMessage(next.message); return; }
    if(!accepts(ticket))return;
    try { if(action==='consume')await exactPackageFromResult(result,ticket);const next=await readStudioWorkspace(context,workspace.sourcePage,transport);if(!accepts(ticket))return;if(!next) throw new Error('reload'); setWorkspace(next); setMessage(action==='consume'?`Handoff consumed and exact source package verified (receipt ${result.receiptId}). Approval alone did not create a document.`:`Handoff decision committed (receipt ${result.receiptId}).`); } catch { if(!accepts(ticket))return;setState('committed_reload_failed'); setMessage(`Handoff decision committed (receipt ${result.receiptId}), but exact projection reload failed. Mutations are blocked.`); }
  };

  const handleDraftChange = (value: string) => {
    setDraft(value);
    if (draftValidationError && validateStudioDraftContent(value).valid) {
      setDraftValidationError(null);
    }
  };

  const can = (command: StudioCommandType) => !blocked && capabilities.includes(capability[command]);
  const canHandoffAction=(action:'request'|'review-approve'|'request-changes'|'review-reject'|'final-approve'|'final-reject'|'withdraw'|'consume')=>capabilities.includes(action==='request'||action==='withdraw'?'studio.handoffs.request':action.startsWith('review-')||action==='request-changes'?'studio.handoffs.review':action.startsWith('final-')?'studio.handoffs.approve':'studio.handoffs.consume');
  const exact = (...states: StudioArtifactProjectionDto['lifecycle'][]) => Boolean(artifact && states.includes(artifact.lifecycle));
  const legacyProjection = Boolean(artifact && artifact.contractVersion !== 'studio-artifact-2');
  const editableArtifact = exact('draft','changes_requested','review_rejected','approval_rejected');
  const showStructuredEditor = Boolean(artifact && (artifact.contractVersion === 'studio-artifact-2' || editableArtifact));

  return (
    <section data-testid="studio-artifact-workspace" data-studio-usable={state !== 'loading' && Boolean(artifact || workspace) ? 'true' : 'false'} data-studio-projection-state={artifact ? 'artifact-ready' : workspace ? 'workspace-ready' : state === 'loading' ? 'loading' : 'empty-ready'} aria-labelledby="studio-artifact-title" className="av-surface mt-6 overflow-hidden">
      <header className="border-b border-[var(--av-color-border)] bg-[var(--av-color-bg-subtle)]/70 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="av-eyebrow">Avala Studio · governed artifact</p><h2 id="studio-artifact-title" className="mt-1 text-2xl font-bold text-[var(--av-color-text)]">Artifact workspace</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--av-color-text-muted)]">Structured content is committed by server authority. Business users see the governed artifact first; exact JSON, hashes, ancestry, and receipts remain available under advanced details.</p></div><StatusBadge tone="info">{captureMode ? 'Synthetic fixture' : 'Committed source'}</StatusBadge></div>
      </header>

      {workspace && <div className="px-4 sm:px-5">{controlledHumanSyntheticGeneration&&<p role="status" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">Synthetic controlled-human test output only · exact PR #264 exercise · no provider route, key, or provider call.</p>}<section aria-labelledby="studio-journey-intent-title" className="av-surface mt-4 p-4"><h3 id="studio-journey-intent-title" className="text-lg font-bold text-[var(--av-color-text)]">Journey navigation intent</h3><div className="mt-3 flex flex-wrap items-end gap-3"><label className="av-form-label min-w-52">Desired exit<select aria-label="Desired exit" value={desiredExit} onChange={event=>setDesiredExit(event.target.value as typeof desiredExit)} className="av-input mt-2"><option value="studio">Studio</option><option value="delivery">Delivery</option><option value="monitor">Monitor</option></select></label><label className="av-form-label min-w-72">Exact approved template<select aria-label="Exact approved Studio template" value={selectedTemplateVersionId} onChange={event=>{const versionId=event.target.value;setSelectedTemplateVersionId(versionId);setWorkspace(current=>current?{...current,template:current.templates.find(item=>item.templateVersionId===versionId)??null}:current);}} className="av-input mt-2"><option value="">Select exact template version</option>{workspace.templates.filter(item=>item.lifecycle==='approved'&&item.actions.includes('studio.generation.request')&&(item.artifactType===artifactType||item.artifactType==='custom')).map(item=><option key={item.templateVersionId} value={item.templateVersionId}>{item.name} · v{item.version} · {item.templateVersionId}</option>)}</select></label><p role="status" className="pb-2 text-sm font-semibold text-[var(--av-color-text-muted)]">Exit after {desiredExit}. Navigation intent only; no domain resource was created or changed.</p></div></section><StudioSourcePackageBuilder projection={workspace.sourceAuthority} artifactType={artifactType} disabled={blocked||workspace.readOnly} canManageSources={capabilities.includes('studio.sources.manage')} canCreatePackage={capabilities.includes('studio.artifacts.generate')} selectedBundleVersionId={selectedBundleVersionId} onSelectBundle={setSelectedBundleVersionId} onCommitSourceSet={commitStudioSourceSet} onLockInputBundle={lockStudioInputBundle} onCreatePackage={createStudioSourcePackage}/><StudioSourceCoverage projection={workspace} artifactProjection={artifactWorkspace} onPage={page => void loadWorkspacePage(page)} /><StudioHandoffCenter inbox={workspace.inbox} outbox={workspace.outbox} disabled={blocked || workspace.readOnly} canAction={canHandoffAction} onAction={handoffAction} /></div>}

      {['generation_failed', 'command_failed', 'version_conflict', 'authorization_revoked', 'stale'].includes(state) && (
        <div role="alert" className="mx-4 mt-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 sm:mx-5 sm:flex-row sm:items-center sm:justify-between">
          <span>{message} The last committed artifact remains visible.</span>
          {state !== 'authorization_revoked' && <button type="button" onClick={() => void load(handoffId, artifactType, true)} className="btn-ghost min-h-10 shrink-0 px-3 text-xs font-bold">Reload current committed state</button>}
        </div>
      )}

      <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[240px_minmax(0,1fr)_280px]">
        <aside className="space-y-4" aria-label="Studio source context"><div className="av-surface p-4"><p className="av-eyebrow">Source context</p>{artifactSummaries&&<><label className="av-form-label mt-4">Governed artifact<select aria-label="Governed artifact" value={selectedArtifactId} onChange={event=>void selectGovernedArtifact(event.target.value)} className="av-input mt-2"><option value="">Select committed artifact</option>{artifactSummaries.items.map(item=><option key={item.id} value={item.id}>{item.displayLabel} · {item.lifecycle.replace('_',' ')}</option>)}</select></label><div className="mt-2 flex items-center justify-between gap-2 text-xs font-semibold text-[var(--av-color-text-muted)]"><button type="button" disabled={artifactSummaries.offset===0} onClick={()=>void loadArtifactSummaryPage(Math.floor(artifactSummaries.offset/artifactSummaries.limit))} className="btn-ghost min-h-9 px-2 disabled:opacity-50">Previous</button><span>{artifactSummaries.total} governed artifact{artifactSummaries.total===1?'':'s'}</span><button type="button" disabled={!artifactSummaries.hasMore} onClick={()=>void loadArtifactSummaryPage(Math.floor(artifactSummaries.offset/artifactSummaries.limit)+2)} className="btn-ghost min-h-9 px-2 disabled:opacity-50">Next</button></div></>} {handoffs.length>0&&<label className="av-form-label mt-4">Committed Studio handoff<select aria-label="Committed Studio handoff" value={handoffId} onChange={event => { setHandoffId(event.target.value); void load(event.target.value, artifactType, false); }} className="av-input mt-2">{handoffs.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}<label className="av-form-label mt-4">Artifact type<select aria-label="Artifact type" value={artifactType} onChange={event => setArtifactType(event.target.value as StudioArtifactType)} className="av-input mt-2">{STUDIO_ARTIFACT_TYPES.map(type => <option key={type} value={type}>{type.toUpperCase()}</option>)}</select></label></div>{artifact && <div className="av-surface p-4"><p className="av-eyebrow">Version history</p><ol className="mt-3 space-y-2">{[...artifact.versions].reverse().map(version => <li key={version.id} className={`rounded-lg border px-3 py-2 text-xs ${version.id === artifact.currentVersion.id ? 'border-[var(--av-color-brand-primary)] bg-[var(--av-color-bg-subtle)]' : 'border-[var(--av-color-border)]'}`}><p className="font-bold text-[var(--av-color-text)]">v{version.version} · {labels[version.lifecycle]}</p><p className="mt-1 truncate text-[10px] text-[var(--av-color-text-subtle)]" title={version.contentHash}>{version.contentHash}</p></li>)}</ol></div>}</aside>

        <article className="min-w-0" aria-label="Artifact preview"><div className="min-h-[360px] rounded-[var(--av-radius-panel)] border border-[var(--av-color-border)] bg-[var(--av-color-bg)] p-5 sm:p-7">{offline && <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">Offline. Committed content remains visible; mutations are blocked.</p>}{(artifact?.readOnly || state === 'read_only') && <p role="status" className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200">Read-only maintenance. Committed canonical artifacts remain available.</p>}<p role="status" aria-live="polite" className="text-sm font-semibold text-[var(--av-color-text-muted)]">{message}</p>{state === 'loading' && <div aria-label="Loading Studio artifact" className="mt-6 h-48 animate-pulse rounded-xl bg-[var(--av-color-bg-subtle)]" />}{state === 'committed_reload_failed' && <button type="button" onClick={() => void load()} className="btn-primary mt-4 min-h-10 px-3 text-sm font-bold">Reload explicitly committed state</button>}{artifact ? <><div className="mt-6 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--av-color-border)] pb-5"><div><p className="av-eyebrow">Current committed preview</p><h3 className="mt-2 text-2xl font-bold text-[var(--av-color-text)]">{artifact.artifactType.toUpperCase()} artifact</h3><p className="mt-1 text-sm text-[var(--av-color-text-muted)]">Aggregate v{artifact.aggregateVersion} · Content v{artifact.currentVersion.version}</p></div><StatusBadge tone={artifact.lifecycle === 'approved' ? 'success' : artifact.lifecycle.includes('reject') ? 'danger' : 'warning'}>{labels[artifact.lifecycle]}</StatusBadge></div><div className="mt-6 grid gap-4 sm:grid-cols-3"><div><p className="av-eyebrow">Lifecycle</p><p className="mt-1 text-sm font-bold text-[var(--av-color-text)]">{labels[artifact.lifecycle]}</p></div><div><p className="av-eyebrow">Current version</p><p className="mt-1 text-sm font-bold text-[var(--av-color-text)]">v{artifact.currentVersion.version}</p></div><div><p className="av-eyebrow">Approved version</p><p className="mt-1 text-sm font-bold text-[var(--av-color-text)]">{artifact.currentApprovedVersion ? `v${artifact.currentApprovedVersion.version}` : 'Not recorded'}</p></div></div><div className="mt-8 rounded-xl border border-[var(--av-color-border)] bg-[var(--av-color-surface)] p-4"><p className="text-sm font-bold text-[var(--av-color-text)]">Human-readable artifact preview</p><p className="mt-2 text-sm leading-6 text-[var(--av-color-text-muted)]">This committed version is available for review. Use Advanced structured content when exact JSON inspection or a strict revision is required.</p><details className="mt-4"><summary className="cursor-pointer text-sm font-bold text-[var(--av-color-brand-primary)]">Advanced structured content</summary><pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">{JSON.stringify(artifact.currentVersion.content, null, 2)}</pre></details></div></> : state === 'empty' ? <div className="grid min-h-[280px] place-items-center text-center"><div><p className="av-eyebrow">No committed artifact</p><h3 className="mt-2 text-xl font-bold text-[var(--av-color-text)]">Select a governed handoff to begin.</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--av-color-text-muted)]">Generation and revision actions appear only when the current authority and lifecycle allow them.</p></div></div> : null}</div></article>

        <aside className="space-y-4" aria-label="Artifact governance context"><div className="av-surface p-4"><div className="flex items-start justify-between gap-3"><div><p className="av-eyebrow">Lifecycle status</p><h3 className="mt-2 text-lg font-bold text-[var(--av-color-text)]">{artifact ? labels[artifact.lifecycle] : 'Awaiting source'}</h3></div><span className={`mt-1 h-3 w-3 rounded-full ${artifact?.lifecycle === 'approved' ? 'bg-emerald-500' : artifact ? 'bg-amber-500' : 'bg-slate-300'}`} aria-hidden="true" /></div><div className="mt-5 space-y-3 border-l border-[var(--av-color-border-strong)] pl-4 text-xs font-semibold text-[var(--av-color-text-muted)]">{sequence.map(item => <div key={item} className={artifact && artifact.lifecycle === item ? 'font-bold text-[var(--av-color-brand-primary)]' : ''}>{labels[item]}</div>)}</div></div>{reviewers.length > 0 && <div className="av-surface p-4"><p className="av-eyebrow">Review assignment</p><label className="av-form-label mt-3">Eligible independent reviewer<select aria-label="Eligible independent reviewer" value={reviewerId} onChange={event => setReviewerId(event.target.value)} className="av-input mt-2">{reviewers.map(person => <option key={person.actorId} value={person.actorId}>{person.displayName}</option>)}</select></label></div>}<div className="av-surface p-4"><p className="av-eyebrow">Authority context</p><p className="mt-2 text-sm leading-6 text-[var(--av-color-text-muted)]">{blocked ? 'Mutations are blocked. Existing committed records remain available.' : 'Commands require the current capability, exact version, and a committed projection reload.'}</p></div></aside>
      </div>

      {artifact && showStructuredEditor && <div className="px-4 pb-4 sm:px-5"><StructuredArtifactEditor content={artifact.currentVersion.content} projectedSections={artifactWorkspace?.artifact.id === artifact.id && artifactWorkspace.artifact.currentVersionId === artifact.currentVersion.id ? artifactWorkspace.artifact.sections : artifact.sections} selectedSources={artifactWorkspace?.selectedSources.items} readOnly={blocked || !can('studio.artifact.draft.revise') || !editableArtifact} saving={state === 'loading'} announceStatus={!legacyProjection} onCommit={reviseStructured} /></div>}

      <div className="border-t border-[var(--av-color-border)] bg-[var(--av-color-surface)]/95 p-4 sm:p-5">
        <div className="mx-auto grid max-w-7xl gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid gap-3 sm:grid-cols-2">
            <details open={legacyProjection && editableArtifact ? true : undefined} className="rounded-xl border border-[var(--av-color-border)] p-3">
              <summary className="cursor-pointer text-sm font-bold text-[var(--av-color-text)]">Advanced canonical JSON import</summary>
            <label className="av-form-label mt-3">
              {legacyProjection ? 'Draft revision (strict structured JSON)' : 'Canonical JSON'}
              <textarea
                value={draft}
                onChange={event => handleDraftChange(event.target.value)}
                aria-invalid={Boolean(draftValidationError)}
                aria-describedby={draftValidationError ? 'studio-draft-validation-error' : undefined}
                rows={3}
                className="av-input mt-2 min-h-[86px] resize-y font-mono text-xs"
              />
              {draftValidationError && <span id="studio-draft-validation-error" role="alert" className="mt-2 block text-xs font-semibold text-red-700 dark:text-red-300">{draftValidationError} No command was submitted; the committed artifact remains unchanged.</span>}
            </label>
            </details>
            <div className="space-y-3">
              <label className="av-form-label">Rationale<textarea value={rationale} onChange={event => setRationale(event.target.value)} rows={2} className="av-input mt-2 min-h-[68px] resize-y" /></label>
              <label className="av-form-label">Conditions<textarea value={conditionsText} onChange={event => setConditionsText(event.target.value)} maxLength={10000} rows={2} className="av-input mt-2 min-h-[68px] resize-y" placeholder="One bounded condition per line" /></label>
            </div>
          </div>
          <div className="flex flex-wrap content-start items-start gap-2">
            <button type="button" disabled={blocked||!capabilities.includes('studio.artifacts.generate')||!governedSelection||!selectedTemplateVersionId||state==='generating'} onClick={()=>void generateGovernedPackage()} className="btn-primary min-h-10 px-3 text-xs font-bold disabled:opacity-50">{controlledHumanSyntheticGeneration?'Generate synthetic controlled-human draft':'Generate governed package draft'}</button>
            <button type="button" disabled={!handoffId||!can('studio.artifact.generation.request') || state === 'generating' || Boolean(artifact && !['draft', 'changes_requested', 'review_rejected', 'approval_rejected', 'approved'].includes(artifact.lifecycle))} onClick={() => void run('studio.artifact.generation.request', { studioHandoffId: handoffId, artifactType })} className="btn-ghost min-h-10 px-3 text-xs font-bold disabled:opacity-50">{legacyProjection ? 'Generate draft' : 'Generate legacy accepted-handoff draft'}</button>
            <button type="button" disabled={!can('studio.artifact.draft.revise') || !artifact || !draft || !exact('draft', 'changes_requested', 'review_rejected', 'approval_rejected')} onClick={revise} className="btn-ghost min-h-10 px-3 text-xs font-bold disabled:opacity-50">Commit revision</button>
            <button type="button" disabled={!can('studio.artifact.review.submit') || !exact('draft')} onClick={() => void run('studio.artifact.review.submit', { artifactId: artifact!.id, artifactVersionId: artifact!.currentVersion.id })} className="btn-ghost min-h-10 px-3 text-xs font-bold disabled:opacity-50">Submit for review</button>
            <button type="button" disabled={!can('studio.artifact.review.assign') || !exact('reviewer_ready') || !reviewerId} onClick={() => void run('studio.artifact.review.assign', { artifactId: artifact!.id, artifactVersionId: artifact!.currentVersion.id, reviewerId })} className="btn-ghost min-h-10 px-3 text-xs font-bold disabled:opacity-50">Assign reviewer</button>
            <button type="button" disabled={!can('studio.artifact.review.resolve') || !exact('in_review') || !rationale} onClick={() => void run('studio.artifact.review.resolve', {artifactId: artifact!.id,artifactVersionId: artifact!.currentVersion.id,outcome:'approve',rationale,conditions})} className="btn-ghost min-h-10 px-3 text-xs font-bold disabled:opacity-50">Approve review</button>
            <button type="button" disabled={!can('studio.artifact.review.resolve') || !exact('in_review') || !rationale} onClick={() => void run('studio.artifact.review.resolve', {artifactId: artifact!.id,artifactVersionId: artifact!.currentVersion.id,outcome:'changes_requested',rationale,conditions})} className="btn-ghost min-h-10 px-3 text-xs font-bold disabled:opacity-50">Request changes</button>
            <button type="button" disabled={!can('studio.artifact.review.resolve') || !exact('in_review') || !rationale} onClick={() => void run('studio.artifact.review.resolve', {artifactId: artifact!.id,artifactVersionId: artifact!.currentVersion.id,outcome:'reject',rationale,conditions})} className="btn-ghost min-h-10 px-3 text-xs font-bold disabled:opacity-50">Reject review</button>
            <button type="button" disabled={!can('studio.artifact.approval.resolve') || !exact('approval_ready') || !rationale} onClick={() => void run('studio.artifact.approval.resolve', {artifactId: artifact!.id,artifactVersionId: artifact!.currentVersion.id,outcome:'approve',rationale,conditions})} className="btn-primary min-h-10 px-3 text-xs font-bold disabled:opacity-50">Final approve</button>
            <button type="button" disabled={!can('studio.artifact.approval.resolve') || !exact('approval_ready') || !rationale} onClick={() => void run('studio.artifact.approval.resolve', {artifactId: artifact!.id,artifactVersionId: artifact!.currentVersion.id,outcome:'reject',rationale,conditions})} className="btn-ghost min-h-10 px-3 text-xs font-bold disabled:opacity-50">Final reject</button>
          </div>
        </div>
      </div>
      {artifact?.currentApprovedVersion ? <StudioArtifactRenditions context={context} artifact={artifact} capabilities={capabilities} online={online} /> : <p className="mx-4 mb-4 rounded-xl border border-[var(--av-color-border)] bg-[var(--av-color-bg-subtle)] p-3 text-sm font-semibold text-[var(--av-color-text-muted)] sm:mx-5">Private export and governed download require an approved canonical artifact version. The restriction applies only to non-approved versions.</p>}
      {receipt && <p className="sr-only">Last committed receipt {receipt.receiptId}; resource {receipt.resourceId}</p>}
    </section>
  );
}
