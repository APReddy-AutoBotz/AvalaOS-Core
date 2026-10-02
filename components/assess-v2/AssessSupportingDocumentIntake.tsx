import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { assessDocumentQueueError } from './assessDocumentUploadQueue';
import type { TenantContextProjection } from '../../types';
import {
  classifyEvidenceFile,
  type EnterpriseIntelligenceProjection,
} from '../../services/enterpriseIntelligence';
import {
  bytesToBase64,
  EnterpriseIntelligenceClientError,
  enterpriseIntelligenceClient,
} from '../../services/enterpriseIntelligenceClient';
import type {
  AssessMappingConflictProjection,
  AssessMappingJsonValue,
  AssessMappingTargetDescriptor,
} from '../../services/assessImport/contracts';

type PendingFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  contentBase64: string;
  note: string;
};

type Props = {
  key?: React.Key;
  tenantContext: TenantContextProjection;
  processId: string;
  caseId: string;
  caseVersion: number;
  hasUnsavedChanges: boolean;
  readOnly: boolean;
  onCommitted(): Promise<void>;
};

const CONTEXT_CAPABILITIES = ['assess.v2.read', 'assess.v2.draft.write', 'transcript.sources.read'] as const;
const UPLOAD_CAPABILITIES = [...CONTEXT_CAPABILITIES, 'evidence.write'] as const;
const SOURCE_SET_CAPABILITIES = [...CONTEXT_CAPABILITIES, 'transcript.sources.manage'] as const;
const ANALYZE_CAPABILITIES = [...CONTEXT_CAPABILITIES, 'evidence.write'] as const;
const REVIEW_CAPABILITIES = [...CONTEXT_CAPABILITIES, 'evidence.review'] as const;
const APPLY_CAPABILITIES = [...CONTEXT_CAPABILITIES, 'transcript.assess.apply'] as const;
const fileAccept = '.txt,.md,.markdown,.csv,.vtt,.srt,.pdf,.docx,.xlsx';
const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005ea8]';
const inputClass = `mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-white ${focusRing}`;
const primaryClass = `inline-flex min-h-10 items-center justify-center rounded-xl bg-[#ffbc03] px-4 text-sm font-black text-[#002C4B] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
const secondaryClass = `inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 ${focusRing}`;

const formatValue = (value: AssessMappingJsonValue | undefined): string => {
  if (value === undefined) return 'Not recorded';
  if (value === null) return 'Unknown';
  if (Array.isArray(value)) return value.map(item => formatValue(item)).join(', ');
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key.replace(/([a-z])([A-Z])/g, '$1 $2')}: ${formatValue(item)}`).join(' · ');
  return String(value);
};

const asRecord = (value: AssessMappingJsonValue): Record<string, AssessMappingJsonValue> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

function MappingValueEditor({ descriptor, value, onChange, idPrefix }: {
  descriptor: AssessMappingTargetDescriptor;
  value: AssessMappingJsonValue;
  onChange(value: AssessMappingJsonValue): void;
  idPrefix: string;
}) {
  const setMember = (key: string, member: AssessMappingJsonValue) => onChange({ ...asRecord(value), [key]: member });
  const textField = (key: string, label: string, multiline = false) => {
    const member = asRecord(value)[key];
    const props = { id: `${idPrefix}-${key}`, className: inputClass, value: typeof member === 'string' ? member : '', onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setMember(key, event.target.value) };
    return <label className="text-xs font-black" htmlFor={props.id}>{label}{multiline ? <textarea {...props} rows={2} /> : <input {...props} />}</label>;
  };
  const listField = (key: string, label: string) => {
    const member = asRecord(value)[key];
    return <label className="text-xs font-black" htmlFor={`${idPrefix}-${key}`}>{label}<textarea id={`${idPrefix}-${key}`} className={inputClass} rows={2} value={Array.isArray(member) ? member.filter(item => typeof item === 'string').join('\n') : ''} onChange={event => setMember(key, event.target.value.split('\n').map(item => item.trim()).filter(Boolean))} /><span className="mt-1 block font-semibold text-slate-500">One item per line.</span></label>;
  };

  if (descriptor.valueType === 'evidence') return <p className="text-sm font-semibold">This suggestion links cited evidence without changing an authored value.</p>;
  if (descriptor.valueType === 'boolean') return <label className="text-xs font-black" htmlFor={`${idPrefix}-boolean`}>Suggested value<select id={`${idPrefix}-boolean`} className={inputClass} value={value === true ? 'true' : value === false ? 'false' : 'unknown'} onChange={event => onChange(event.target.value === 'unknown' ? null : event.target.value === 'true')}><option value="unknown">Unknown</option><option value="true">Yes</option><option value="false">No</option></select></label>;
  if (descriptor.valueType === 'ratio') return <label className="text-xs font-black" htmlFor={`${idPrefix}-ratio`}>Suggested ratio (0–1)<input id={`${idPrefix}-ratio`} className={inputClass} type="number" min="0" max="1" step="0.01" value={typeof value === 'number' ? value : ''} onChange={event => onChange(event.target.value === '' ? null : Number(event.target.value))} /></label>;
  if (descriptor.valueType === 'number') return <label className="text-xs font-black" htmlFor={`${idPrefix}-number`}>Suggested numeric value<input id={`${idPrefix}-number`} className={inputClass} type="number" min="0" max="10000000" step="any" value={typeof value === 'number' ? value : ''} onChange={event => onChange(event.target.value === '' ? null : Number(event.target.value))} /></label>;
  if (descriptor.valueType === 'text_list') return <label className="text-xs font-black" htmlFor={`${idPrefix}-list`}>Suggested items<textarea id={`${idPrefix}-list`} className={inputClass} rows={3} value={Array.isArray(value) ? value.filter(item => typeof item === 'string').join('\n') : ''} onChange={event => onChange(event.target.value.split('\n').map(item => item.trim()).filter(Boolean))} /><span className="mt-1 block font-semibold text-slate-500">One item per line.</span></label>;
  if (descriptor.allowedValues?.length && !descriptor.valueType.endsWith('_constructor')) return <label className="text-xs font-black" htmlFor={`${idPrefix}-choice`}>Suggested value<select id={`${idPrefix}-choice`} className={inputClass} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)}><option value="">Choose a value</option>{descriptor.allowedValues.map(option => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}</select></label>;
  if (descriptor.valueType === 'primitive_constructor') return <div className="grid gap-3 sm:grid-cols-2">{textField('name', 'Primitive name')}{textField('description', 'Description', true)}{textField('trigger', 'Trigger')}{textField('owner', 'Owner')}{listField('inputs', 'Inputs')}{listField('outputs', 'Outputs')}{listField('rules', 'Rules')}<p className="text-xs font-semibold text-slate-500 sm:col-span-2">Primitive type: {descriptor.allowedValues?.[0]?.replaceAll('_', ' ') || 'server-bound type'}.</p></div>;
  if (descriptor.valueType === 'asset_constructor') return <div className="grid gap-3 sm:grid-cols-2">{textField('name', 'Application name')}{textField('accountableOwner', 'Accountable owner')}</div>;
  if (descriptor.valueType === 'interaction_constructor') {
    const record = asRecord(value);
    const riskChoice = (key: 'highImpact' | 'financialAction' | 'untrustedContentWithTools', label: string) => <label className="text-xs font-black" htmlFor={`${idPrefix}-${key}`}>{label}<select id={`${idPrefix}-${key}`} className={inputClass} value={typeof record[key] === 'boolean' ? String(record[key]) : ''} onChange={event => setMember(key, event.target.value === '' ? null : event.target.value === 'true')}><option value="">Review required</option><option value="true">Yes</option><option value="false">No</option></select></label>;
    return <div className="grid gap-3 sm:grid-cols-3">{textField('operationName', 'Operation name')}<label className="text-xs font-black" htmlFor={`${idPrefix}-mode`}>Mode<select id={`${idPrefix}-mode`} className={inputClass} value={typeof record.mode === 'string' ? record.mode : ''} onChange={event => setMember('mode', event.target.value)}><option value="">Choose</option>{['read','write','event','ui','operational'].map(option => <option key={option}>{option}</option>)}</select></label><label className="text-xs font-black" htmlFor={`${idPrefix}-classification`}>Data classification<select id={`${idPrefix}-classification`} className={inputClass} value={typeof record.dataClassification === 'string' ? record.dataClassification : ''} onChange={event => setMember('dataClassification', event.target.value)}><option value="">Choose</option>{['Unknown','Public','Internal','Confidential','Restricted'].map(option => <option key={option}>{option}</option>)}</select></label>{riskChoice('highImpact', 'High-impact action')}{riskChoice('financialAction', 'Financial action')}{riskChoice('untrustedContentWithTools', 'Uses untrusted content with tools')}<p className="text-xs font-semibold text-slate-500 sm:col-span-3">Review all three safety facts explicitly. Missing facts are not treated as “No”.</p></div>;
  }
  if (descriptor.valueType === 'decision_constructor') return <div className="grid gap-3 sm:grid-cols-2">{textField('name', 'Decision name')}{textField('ruleDescription', 'Decision rule', true)}{listField('outcomeLabels', 'Outcome labels')}</div>;
  if (descriptor.valueType === 'exception_constructor') return <div className="grid gap-3 sm:grid-cols-2">{textField('name', 'Exception name')}{textField('trigger', 'Exception trigger', true)}</div>;
  return <label className="text-xs font-black" htmlFor={`${idPrefix}-text`}>Suggested value<textarea id={`${idPrefix}-text`} className={inputClass} rows={3} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)} /></label>;
}

export default function AssessSupportingDocumentIntake({ tenantContext, processId, caseId, caseVersion, hasUnsavedChanges, readOnly, onCommitted }: Props) {
  const scopeKey = `${tenantContext.userId}:${tenantContext.organizationId}:${tenantContext.workspaceId}:${tenantContext.authorizationVersion}:${processId}:${caseId}:${caseVersion}`;
  const [projection, setProjection] = useState<EnterpriseIntelligenceProjection | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [selectedSourceVersions, setSelectedSourceVersions] = useState<string[]>([]);
  const [sourceSetLabel, setSourceSetLabel] = useState('Assessment supporting documents');
  const [selectedSourceSets, setSelectedSourceSets] = useState<string[]>([]);
  const [bundleLabel, setBundleLabel] = useState('Assessment document bundle');
  const [bundleToken, setBundleToken] = useState('');
  const [selectedProposalIds, setSelectedProposalIds] = useState<string[]>([]);
  const [editingProposalId, setEditingProposalId] = useState('');
  const [editedValue, setEditedValue] = useState<AssessMappingJsonValue>('');
  const [editReason, setEditReason] = useState('');
  const [conflictRationale, setConflictRationale] = useState<Record<string, string>>({});
  const [conflictChoice, setConflictChoice] = useState<Record<string, string>>({});
  const [authoredConflictValue, setAuthoredConflictValue] = useState<Record<string, AssessMappingJsonValue>>({});
  const [busy, setBusy] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [status, setStatus] = useState('Loading committed supporting-document state.');
  const [error, setError] = useState('');
  const requestEpoch = useRef(0);
  const fileEpoch = useRef(0);
  const activeScope = useRef(scopeKey);
  const editRegionRef = useRef<HTMLDivElement | null>(null);
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [restoreEditFocusId, setRestoreEditFocusId] = useState('');
  activeScope.current = scopeKey;

  useEffect(() => {
    if (!editingProposalId) return;
    editRegionRef.current?.querySelector<HTMLElement>('input, textarea, select')?.focus();
  }, [editingProposalId]);

  useEffect(() => {
    if (editingProposalId || !restoreEditFocusId) return;
    const button = editButtonRefs.current.get(restoreEditFocusId);
    if (!button) return;
    button.focus({ preventScroll: true });
    setRestoreEditFocusId('');
  }, [editingProposalId, restoreEditFocusId]);

  const load = useCallback(async (isCurrent?: () => boolean, exactBundleToken = '') => {
    const [inputBundleId, inputBundleVersionId] = exactBundleToken.split(':');
    const next = await enterpriseIntelligenceClient.loadProjection({
      organizationId: tenantContext.organizationId,
      workspaceId: tenantContext.workspaceId,
      expectedAuthorizationVersion: tenantContext.authorizationVersion,
      assessDocumentMappingScope: {
        caseId,
        caseVersion,
        ...(inputBundleId && inputBundleVersionId ? { inputBundleId, inputBundleVersionId } : {}),
      },
    });
    if (isCurrent && !isCurrent()) return null;
    setProjection(next);
    setReloadRequired(false);
    return next;
  }, [caseId, caseVersion, tenantContext.authorizationVersion, tenantContext.organizationId, tenantContext.workspaceId]);

  useEffect(() => {
    const epoch = ++requestEpoch.current;
    fileEpoch.current += 1;
    const expectedScope = scopeKey;
    const isCurrent = () => epoch === requestEpoch.current && expectedScope === activeScope.current;
    setProjection(null); setPendingFiles([]); setSelectedSourceVersions([]); setSelectedSourceSets([]); setBundleToken('');
    setSelectedProposalIds([]); setEditingProposalId(''); setRestoreEditFocusId(''); setConflictRationale({}); setConflictChoice({}); setAuthoredConflictValue({});
    setBusy(true); setReloadRequired(false); setError(''); setStatus('Loading committed supporting-document state.');
    void load(isCurrent).then(next => {
      if (next && isCurrent()) setStatus('Committed supporting-document state loaded.');
    }).catch(cause => {
      if (!isCurrent()) return;
      setReloadRequired(true); setError(cause instanceof Error ? cause.message : 'Supporting-document state is unavailable.');
      setStatus('Committed state could not be loaded. No local fallback is active.');
    }).finally(() => { if (isCurrent()) setBusy(false); });
    return () => { requestEpoch.current += 1; fileEpoch.current += 1; };
  }, [load, scopeKey]);

  const mutate = async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
    if (!projection || reloadRequired) return false;
    const epoch = ++requestEpoch.current;
    const expectedScope = scopeKey;
    const isCurrent = () => epoch === requestEpoch.current && expectedScope === activeScope.current;
    setBusy(true); setError(''); setStatus('Submitting one server-authorized command.');
    try {
      await action();
      if (!isCurrent()) return false;
      await load(isCurrent, bundleToken);
      if (!isCurrent()) return false;
      setStatus(success);
      return true;
    } catch (cause) {
      if (!isCurrent()) return false;
      const uncertain = cause instanceof EnterpriseIntelligenceClientError && cause.code === 'COMMAND_OUTCOME_UNKNOWN';
      setReloadRequired(uncertain);
      setStatus(uncertain ? 'Command outcome is unknown. Reload committed state before retrying.' : 'The command was not confirmed. No success state is shown.');
      setError(cause instanceof Error ? cause.message : 'The governed command failed.');
      return false;
    } finally { if (isCurrent()) setBusy(false); }
  };

  const reloadManually = async () => {
    const epoch = ++requestEpoch.current;
    const expectedScope = scopeKey;
    const isCurrent = () => epoch === requestEpoch.current && expectedScope === activeScope.current;
    setBusy(true); setError('');
    try {
      const next = await load(isCurrent, bundleToken);
      if (next && isCurrent()) setStatus('Committed supporting-document state reloaded.');
    } catch (cause) {
      if (!isCurrent()) return;
      setReloadRequired(true);
      setError(cause instanceof Error ? cause.message : 'Reload failed.');
      setStatus('Committed state could not be reloaded. No local fallback is active.');
    } finally { if (isCurrent()) setBusy(false); }
  };

  const selectBundle = async (nextBundleToken: string) => {
    setBundleToken(nextBundleToken);
    setSelectedProposalIds([]);
    setEditingProposalId('');
    setRestoreEditFocusId('');
    const epoch = ++requestEpoch.current;
    const expectedScope = scopeKey;
    const isCurrent = () => epoch === requestEpoch.current && expectedScope === activeScope.current;
    setBusy(true); setError(''); setStatus('Loading the exact selected-bundle mapping state.');
    try {
      const next = await load(isCurrent, nextBundleToken);
      if (next && isCurrent()) setStatus(nextBundleToken ? 'Exact selected-bundle mapping state loaded.' : 'Case mapping state loaded.');
    } catch (cause) {
      if (!isCurrent()) return;
      setReloadRequired(true);
      setError(cause instanceof Error ? cause.message : 'Selected-bundle mapping state is unavailable.');
      setStatus('Exact selected-bundle state could not be loaded. No local fallback is active.');
    } finally { if (isCurrent()) setBusy(false); }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const epoch = ++fileEpoch.current;
    const expectedScope = scopeKey;
    const isCurrent = () => epoch === fileEpoch.current && expectedScope === activeScope.current;
    setError('');
    const selectedFiles = Array.from(files);
    const queueError = assessDocumentQueueError(pendingFiles, selectedFiles);
    if (queueError) { setError(queueError); return; }
    const next: PendingFile[] = [];
    for (const file of selectedFiles) {
      const support = classifyEvidenceFile(file.name, file.type, file.size);
      if (!support.supported || !support.mimeType) {
        if (isCurrent()) setError(`${file.name}: ${support.message}`);
        continue;
      }
      try {
        const bytes = await file.arrayBuffer();
        if (!isCurrent()) return;
        next.push({ id: crypto.randomUUID(), name: file.name, mimeType: support.mimeType, size: file.size, contentBase64: bytesToBase64(new Uint8Array(bytes)), note: support.message });
      } catch (cause) {
        if (isCurrent()) setError(cause instanceof Error ? `${file.name}: ${cause.message}` : `${file.name}: the browser could not read this file.`);
      }
    }
    if (isCurrent()) setPendingFiles(current => [...current, ...next]);
  };

  const hasFreshCapability = (capability: string) => tenantContext.capabilities.includes(capability)
    && projection?.capabilities.includes(capability) === true;
  const missingFreshCapabilities = (capabilities: readonly string[]) => capabilities.filter(capability => !hasFreshCapability(capability));
  const uploadMissing = missingFreshCapabilities(UPLOAD_CAPABILITIES);
  const sourceSetMissing = missingFreshCapabilities(SOURCE_SET_CAPABILITIES);
  const analyzeMissing = missingFreshCapabilities(ANALYZE_CAPABILITIES);
  const reviewMissing = missingFreshCapabilities(REVIEW_CAPABILITIES);
  const applyMissing = missingFreshCapabilities(APPLY_CAPABILITIES);
  const featureEnabled = projection?.documentMapping.features.enabled === true;
  const providerReady = projection?.providers.some(provider => provider.status === 'active' && provider.routes.some(route => route.capability === 'assess.evidence.extract' && route.enabled && route.availability === 'ready')) || false;
  const unavailable = !projection || ['blocked', 'stale', 'unavailable'].includes(projection.availability);
  const commonLocked = busy || reloadRequired || readOnly || hasUnsavedChanges || !featureEnabled || unavailable;
  const uploadLocked = commonLocked || uploadMissing.length > 0;
  const sourceSetLocked = commonLocked || sourceSetMissing.length > 0;
  const analyzeLocked = commonLocked || analyzeMissing.length > 0;
  const reviewLocked = commonLocked || reviewMissing.length > 0;
  const applyLocked = commonLocked || applyMissing.length > 0;
  const sourceVersions = projection?.transcriptFlow.sourceVersions.filter(source => source.selectable && source.state === 'ready') || [];
  const sourceSets = projection?.transcriptFlow.sourceSets.filter(set => set.ownerModule === 'assess' && set.lockState !== 'blocked') || [];
  const bundles = projection?.transcriptFlow.inputBundles.filter(bundle => bundle.ownerModule === 'assess' && bundle.status === 'locked') || [];
  const selectedBundle = bundles.find(bundle => `${bundle.id}:${bundle.versionSelector}` === bundleToken);
  const latestRun = projection?.documentMapping.runs
    .filter(item => item.caseId === caseId && item.caseVersion === caseVersion && item.inputBundleId === selectedBundle?.id && item.inputBundleVersionId === selectedBundle?.versionSelector)
    .toSorted((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
  const mappingProjectionComplete = latestRun?.projectionComplete === true;
  const catalog = projection?.documentMapping.catalogs.find(item => item.id === latestRun?.catalogId)
    ?? projection?.documentMapping.catalogs.find(item => item.caseId === caseId && item.caseVersion === caseVersion && item.status === 'current');
  const descriptors = useMemo<Map<string, AssessMappingTargetDescriptor>>(
    () => new Map((catalog?.targets ?? []).map(target => [target.selectorId, target] as const)),
    [catalog],
  );
  const proposals = mappingProjectionComplete
    ? projection?.documentMapping.proposals.filter(item => item.caseId === caseId && item.caseVersion === caseVersion && item.catalogId === catalog?.id && item.inputBundleId === selectedBundle?.id && item.inputBundleVersionId === selectedBundle?.versionSelector) || []
    : [];
  const selectedProposals = proposals.filter(item => selectedProposalIds.includes(item.id) && ['accepted', 'edited'].includes(item.status) && descriptors.has(item.targetSelectorId));
  const latestPreviewCandidate = mappingProjectionComplete
    ? projection?.documentMapping.previews.find(item => item.caseId === caseId && item.expectedCaseVersion === caseVersion && item.catalogId === latestRun?.catalogId && item.inputBundleId === selectedBundle?.id && item.inputBundleVersionId === selectedBundle?.versionSelector)
    : undefined;
  const previewUnresolvedCount = latestPreviewCandidate?.conflicts.filter(conflict => conflict.resolution === 'unresolved').length;
  const latestPreview = latestPreviewCandidate?.projectionComplete === true
    && latestPreviewCandidate.manifest.unresolvedConflictCount === previewUnresolvedCount
    ? latestPreviewCandidate
    : undefined;
  const unresolvedMaterialConflict = latestPreview?.conflicts.some(conflict => conflict.material && conflict.resolution === 'unresolved') || false;

  const analyze = async () => {
    if (!selectedBundle) return;
    const sourceSelections = selectedBundle.sourceSetVersions.flatMap(lineage => {
      const set = sourceSets.find(item => item.id === lineage.sourceSetId && item.versionSelector === lineage.sourceSetVersionSelector && item.version === lineage.sourceSetVersion);
      return set?.members.map(member => ({
        sourceSetId: lineage.sourceSetId,
        sourceSetVersionId: lineage.sourceSetVersionSelector,
        expectedSourceSetVersion: lineage.sourceSetVersion,
        sourceId: member.sourceId,
        sourceVersionId: member.versionSelector,
      })) || [];
    });
    if (sourceSelections.length !== selectedBundle.sourceVersionSelectors.length) {
      setError('Exact source-set lineage is incomplete. Reload committed state before analysis.');
      return;
    }
    await mutate(() => enterpriseIntelligenceClient.analyzeAssessDocuments({
      organizationId: tenantContext.organizationId, workspaceId: tenantContext.workspaceId,
      caseId, expectedCaseVersion: caseVersion, inputBundleId: selectedBundle.id,
      inputBundleVersionId: selectedBundle.versionSelector, expectedInputBundleVersion: selectedBundle.version,
      selections: sourceSelections,
    }), 'AI suggestions are ready for human review. No Assess field was changed.');
  };

  const resolveConflict = async (conflict: AssessMappingConflictProjection, resolution: 'choose_candidate' | 'retain_manual' | 'authored_resolution') => {
    const rationale = (conflictRationale[conflict.id] || '').trim();
    const descriptor = descriptors.get(conflict.targetSelectorId);
    if (!descriptor || rationale.length < 4) return;
    await mutate(() => enterpriseIntelligenceClient.resolveAssessDocumentMappingConflict({
      organizationId: tenantContext.organizationId, workspaceId: tenantContext.workspaceId,
      conflictId: conflict.id, resolutionVersion: conflict.resolutionVersion, resolution,
      ...(resolution === 'choose_candidate' ? { proposalId: conflictChoice[conflict.id] || conflict.proposalIds[0] } : {}),
      ...(resolution === 'authored_resolution' ? { authoredValue: authoredConflictValue[conflict.id] ?? '' } : {}),
      rationale,
    }), 'Conflict resolution and rationale committed.');
  };

  const closeEditor = (proposalId: string) => {
    setRestoreEditFocusId(proposalId);
    setEditingProposalId('');
    setEditReason('');
  };

  const apply = async () => {
    if (!latestPreview || !catalog || !selectedBundle) return;
    const epoch = ++requestEpoch.current;
    const expectedScope = scopeKey;
    const isCurrent = () => epoch === requestEpoch.current && expectedScope === activeScope.current;
    setBusy(true); setError(''); setStatus('Applying the reviewed batch as one immutable Assess version.');
    try {
      await enterpriseIntelligenceClient.commitAssessDocumentMapping({
        organizationId: tenantContext.organizationId, workspaceId: tenantContext.workspaceId,
        previewBatchId: latestPreview.id, catalogId: catalog.id, catalogHash: catalog.catalogHash,
        caseId, expectedCaseVersion: caseVersion, inputBundleId: selectedBundle.id, inputBundleVersionId: selectedBundle.versionSelector,
        previewManifest: latestPreview.manifest,
      });
      if (!isCurrent()) return;
      try {
        await onCommitted();
        if (!isCurrent()) return;
        setStatus('Reviewed suggestions were committed as one immutable Assess version and reloaded.');
      } catch (reloadError) {
        if (!isCurrent()) return;
        setReloadRequired(true);
        setStatus('The apply command returned, but the authoritative Assess reload failed. Reload before any retry.');
        setError(reloadError instanceof Error ? reloadError.message : 'The committed Assess version could not be reloaded.');
      }
    } catch (cause) {
      if (!isCurrent()) return;
      const uncertain = cause instanceof EnterpriseIntelligenceClientError && cause.code === 'COMMAND_OUTCOME_UNKNOWN';
      setReloadRequired(uncertain);
      setStatus(uncertain ? 'Apply outcome is unknown. Reload authoritative Assess state before retrying.' : 'Apply was not confirmed. No success state is shown.');
      setError(cause instanceof Error ? cause.message : 'The reviewed batch could not be applied.');
    } finally { if (isCurrent()) setBusy(false); }
  };

  return <section className="rounded-2xl border border-slate-200 p-3 sm:p-5 dark:border-slate-700" data-testid="assess-supporting-document-intake" aria-labelledby="assess-supporting-document-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#9a6a00] dark:text-[#ffcf45]">Human-reviewed AI assistance</p><h3 id="assess-supporting-document-title" className="mt-1 text-lg font-black">Map supporting documents into this assessment</h3><p className="mt-2 max-w-4xl text-sm font-semibold text-slate-600 dark:text-slate-300">Upload private source documents, choose the exact source set, then review grounded suggestions. Nothing changes the assessment until you explicitly apply a reviewed preview.</p></div><button type="button" className={secondaryClass} disabled={busy} onClick={() => void reloadManually()}>Reload committed state</button></div>
    <p className="mt-3 text-xs font-semibold text-slate-500">Supported: TXT, Markdown, CSV, VTT/SRT, DOCX main-document text, text-layer PDF, and bounded non-macro XLSX. OCR, audio/video, old DOC/XLS, formulas, macros, external workbook data, and hidden sheets are not imported.</p>
    <p className="mt-2 text-xs font-semibold text-slate-500">Queue up to 20 documents and 12,000,000 bytes total at a time. Store queued sources before adding more. Large extracted source sets may exceed the analysis limit; nothing is silently truncated.</p>
    <p className="mt-3 text-sm font-semibold" role="status" aria-live="polite">{status}</p>
    {error ? <p className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-bold text-rose-800" role="alert">{error}</p> : null}
    {hasUnsavedChanges ? <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950" role="status">Save or reload the current manual Assess changes before uploading, analyzing, previewing, or applying document suggestions.</p> : null}
    {readOnly ? <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950" role="status">This Assess version is read-only. Supporting-document mapping is unavailable.</p> : null}
    {projection && !featureEnabled ? <p className="mt-3 rounded-xl bg-slate-100 p-3 text-sm font-bold" role="status">{projection.documentMapping.features.disabledReason || 'Supporting-document mapping is disabled for this workspace.'}</p> : null}
    {uploadMissing.length ? <p className="mt-3 text-xs font-semibold text-slate-500" role="status">Upload is unavailable: {uploadMissing.join(', ')}.</p> : null}
    {sourceSetMissing.length ? <p className="mt-2 text-xs font-semibold text-slate-500" role="status">Source-set and bundle creation are unavailable: {sourceSetMissing.join(', ')}.</p> : null}
    {analyzeMissing.length ? <p className="mt-2 text-xs font-semibold text-slate-500" role="status">Analysis is unavailable: {analyzeMissing.join(', ')}.</p> : null}
    {reviewMissing.length ? <p className="mt-2 text-xs font-semibold text-slate-500" role="status">Suggestion review is unavailable: {reviewMissing.join(', ')}.</p> : null}
    {applyMissing.length ? <p className="mt-2 text-xs font-semibold text-slate-500" role="status">Preview, conflict resolution, and apply are unavailable: {applyMissing.join(', ')}.</p> : null}
    {projection && [uploadMissing, sourceSetMissing, analyzeMissing, reviewMissing, applyMissing].some(missing => missing.length) ? <p className="mt-2 text-xs font-semibold text-slate-500">Fresh server capabilities control each stage independently.</p> : null}

    <details open className="mt-5 rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><summary className="cursor-pointer font-black">1. Upload private supporting documents</summary><label className="mt-3 block text-xs font-black" htmlFor="assess-supporting-files">Supporting documents<input id="assess-supporting-files" className="mt-2 block w-full text-sm" type="file" multiple accept={fileAccept} disabled={uploadLocked} onChange={event => void onFiles(event.target.files)} /></label><div className="mt-3 grid gap-2">{pendingFiles.map(file => <article key={file.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950"><p className="break-all text-sm font-black">{file.name} · {Math.ceil(file.size / 1024)} KB</p><p className="mt-1 text-xs font-semibold text-slate-500">{file.note}</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" className={primaryClass} disabled={uploadLocked} onClick={async () => { const stored = await mutate(() => enterpriseIntelligenceClient.createEvidenceSource({ organizationId: tenantContext.organizationId, workspaceId: tenantContext.workspaceId, displayName: file.name, filename: file.name, mimeType: file.mimeType, contentBase64: file.contentBase64 }), `${file.name} was stored as a private immutable source.`); if (stored) setPendingFiles(current => current.filter(item => item.id !== file.id)); }}>Store private source</button><button type="button" className={secondaryClass} disabled={busy} onClick={() => setPendingFiles(current => current.filter(item => item.id !== file.id))}>Remove from this browser</button></div></article>)}</div></details>

    <details open className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><summary className="cursor-pointer font-black">2. Select exact sources</summary><p className="mt-2 text-xs font-semibold text-slate-500">Only successfully decoded immutable versions can be selected. Files from Studio are not selected automatically.</p><fieldset className="mt-3"><legend className="sr-only">Ready supporting-document versions</legend><div className="grid gap-2 sm:grid-cols-2">{sourceVersions.map(source => <label key={source.versionSelector} className="flex min-h-11 items-start gap-2 rounded-lg border border-slate-200 bg-white p-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950"><input className="mt-1" type="checkbox" disabled={sourceSetLocked} checked={selectedSourceVersions.includes(source.versionSelector)} onChange={() => setSelectedSourceVersions(current => current.includes(source.versionSelector) ? current.filter(id => id !== source.versionSelector) : [...current, source.versionSelector])} /><span>{source.displayName}<span className="block text-xs text-slate-500">{source.versionLabel} · {source.extractedCharacterCount.toLocaleString()} extracted characters</span></span></label>)}</div></fieldset><div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="text-xs font-black" htmlFor="assess-source-set-label">Source-set label<input id="assess-source-set-label" className={inputClass} disabled={sourceSetLocked} value={sourceSetLabel} onChange={event => setSourceSetLabel(event.target.value)} /></label><button type="button" className={`${primaryClass} self-end`} disabled={sourceSetLocked || !sourceSetLabel.trim() || !selectedSourceVersions.length} onClick={() => void mutate(() => enterpriseIntelligenceClient.commitTranscriptSourceSet({ organizationId: tenantContext.organizationId, workspaceId: tenantContext.workspaceId, label: sourceSetLabel, description: `Supporting documents selected for ${processId}`, members: selectedSourceVersions.map((versionSelector, index) => { const source = sourceVersions.find(item => item.versionSelector === versionSelector)!; return { sourceId: source.sourceId, versionSelector, role: index === 0 ? 'primary' as const : 'supporting' as const }; }) }), 'Immutable Assess source set committed. Select it below to create a locked analysis bundle.')}>Commit source set</button></div>
      <fieldset className="mt-4"><legend className="text-xs font-black">Committed Assess source sets</legend><div className="mt-2 grid gap-2">{sourceSets.map(set => <label key={set.versionSelector} className="flex min-h-11 items-start gap-2 rounded-lg border border-slate-200 bg-white p-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950"><input className="mt-1" type="checkbox" disabled={sourceSetLocked} checked={selectedSourceSets.includes(set.versionSelector)} onChange={() => setSelectedSourceSets(current => current.includes(set.versionSelector) ? current.filter(id => id !== set.versionSelector) : [...current, set.versionSelector])} /><span>{set.label} · {set.versionLabel}<span className="block text-xs text-slate-500">{set.sourceCount} sources · {set.extractedCharacterCount.toLocaleString()} characters</span></span></label>)}</div></fieldset><div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="text-xs font-black" htmlFor="assess-bundle-label">Analysis bundle label<input id="assess-bundle-label" className={inputClass} disabled={sourceSetLocked} value={bundleLabel} onChange={event => setBundleLabel(event.target.value)} /></label><button type="button" className={`${primaryClass} self-end`} disabled={sourceSetLocked || !bundleLabel.trim() || !selectedSourceSets.length} onClick={() => void mutate(() => enterpriseIntelligenceClient.lockTranscriptInputBundle({ organizationId: tenantContext.organizationId, workspaceId: tenantContext.workspaceId, sourceSetVersionSelectors: selectedSourceSets, label: bundleLabel }), 'Exact supporting-document bundle locked. It can now be analyzed.')}>Lock analysis bundle</button></div>
    </details>

    <details open className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><summary className="cursor-pointer font-black">3. Analyze and review AI suggestions</summary><div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="text-xs font-black" htmlFor="assess-document-bundle">Locked source bundle<select id="assess-document-bundle" className={inputClass} value={bundleToken} disabled={analyzeLocked} onChange={event => void selectBundle(event.target.value)}><option value="">Select one exact bundle</option>{bundles.map(bundle => <option key={bundle.versionSelector} value={`${bundle.id}:${bundle.versionSelector}`}>{bundle.label} · {bundle.versionLabel} · {bundle.sourceCount} sources</option>)}</select></label><button type="button" className={`${primaryClass} self-end`} disabled={analyzeLocked || !providerReady || !selectedBundle} onClick={() => void analyze()}>Analyze selected documents</button></div>{projection && !providerReady ? <p className="mt-2 text-sm font-bold text-amber-800" role="status">No authorized, active Assess evidence route is ready. An administrator must validate and enable a governed provider route; browser keys are never accepted.</p> : null}<p className="mt-2 text-xs font-semibold text-slate-500">Analysis makes one governed provider request over the exact locked bundle. AI only proposes server-issued typed fields; it cannot calculate scores, approve, or change deterministic decisions.</p>
      {latestRun ? <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950"><p className="font-black" role="status">Analysis {latestRun.state.replaceAll('_', ' ')} · {latestRun.proposalCount} grounded suggestions · {latestRun.extractionJobIds.length} exact source jobs</p>{latestRun.failureCode ? <p className="mt-2 font-bold text-rose-700" role="alert">Analysis stopped: {latestRun.failureCode.replaceAll('_', ' ').toLocaleLowerCase()}. No Assess values were changed.</p> : null}{latestRun.warnings?.length ? <div className="mt-2"><p className="text-xs font-black">Analysis disclosures</p><ul className="mt-1 list-disc space-y-1 pl-5 text-xs font-semibold text-amber-900">{latestRun.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></div> : null}{latestRun.analyzedSources?.length ? <div className="mt-3 grid gap-2"><p className="text-xs font-black">Source-specific parser disclosures</p>{latestRun.analyzedSources.map(source => { const sourceLabel = sourceVersions.find(item => item.sourceId === source.sourceId && item.versionSelector === source.sourceVersionId)?.displayName || 'Bound source version'; return <article key={source.sourceVersionId} className="rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-900"><p className="font-black">{sourceLabel}</p><p className="mt-1 font-semibold text-slate-500">{source.parserVersion} · {source.extractedByteCount.toLocaleString()} extracted bytes · {source.sheetCount} sheets · {source.cellCount} cells</p>{source.warnings.length ? <ul className="mt-1 list-disc space-y-1 pl-5 font-semibold text-amber-900">{source.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul> : <p className="mt-1 font-semibold text-slate-500">No parser exclusions were reported.</p>}</article>; })}</div> : null}</div> : null}
      {latestRun && !mappingProjectionComplete ? <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950" role="alert">The latest analysis projection is incomplete. Reload committed state; suggestions, preview, conflicts, and apply remain unavailable.</p> : null}
      <div className="mt-4 grid gap-3">{proposals.map(proposal => { const descriptor = descriptors.get(proposal.targetSelectorId); if (!descriptor) return null; const editing = editingProposalId === proposal.id; const selected = selectedProposalIds.includes(proposal.id); return <article key={`${proposal.id}:${proposal.version}`} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950" aria-labelledby={`proposal-${proposal.id}`}><div className="flex flex-wrap items-start justify-between gap-2"><div><h4 id={`proposal-${proposal.id}`} className="font-black">{descriptor.label}</h4><p className="text-xs font-semibold text-slate-500">{descriptor.contextLabel} · {Math.round(proposal.confidence * 100)}% AI confidence · {proposal.status.replaceAll('_', ' ')}</p></div><span className="rounded-full border px-2 py-1 text-[10px] font-black uppercase">{proposal.relationship}</span></div><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-xs font-black text-slate-500">Current manual value</dt><dd className="break-words font-semibold">{formatValue(descriptor.currentValue)}</dd></div><div><dt className="text-xs font-black text-slate-500">AI suggestion</dt><dd className="break-words font-semibold">{formatValue(proposal.effectiveValue)}</dd></div></dl><blockquote className="mt-3 border-l-2 border-slate-300 pl-3 text-xs font-semibold text-slate-600 dark:text-slate-300" aria-label={`Source citation for ${descriptor.label}`}>{proposal.sourceAnchor.safeExcerpt || 'No browser-safe excerpt supplied.'}<span className="mt-1 block">Location: {proposal.sourceAnchor.locator}</span></blockquote>{editing ? <div ref={editRegionRef} role="group" aria-label={`Edit ${descriptor.label}`} className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><MappingValueEditor descriptor={descriptor} value={editedValue} onChange={setEditedValue} idPrefix={`proposal-edit-${proposal.id}`} /><label className="text-xs font-black" htmlFor={`proposal-reason-${proposal.id}`}>Reason for edit<input id={`proposal-reason-${proposal.id}`} className={inputClass} value={editReason} onChange={event => setEditReason(event.target.value)} /></label><div className="flex flex-wrap gap-2"><button type="button" className={primaryClass} disabled={reviewLocked || editReason.trim().length < 4} onClick={async () => { const saved = await mutate(() => enterpriseIntelligenceClient.reviewAssessDocumentProposal({ organizationId: tenantContext.organizationId, workspaceId: tenantContext.workspaceId, proposalId: proposal.id, proposalVersion: proposal.version, catalogId: catalog!.id, targetSelectorId: descriptor.selectorId, caseId, expectedCaseVersion: caseVersion, status: 'edited', editedValue, reason: editReason.trim() }), 'Edited suggestion and rationale committed as immutable review history.'); if (saved) closeEditor(proposal.id); }}>Save reviewed edit</button><button type="button" className={secondaryClass} disabled={busy} onClick={() => closeEditor(proposal.id)}>Cancel</button></div></div> : <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={primaryClass} disabled={reviewLocked || proposal.status === 'accepted'} onClick={() => void mutate(() => enterpriseIntelligenceClient.reviewAssessDocumentProposal({ organizationId: tenantContext.organizationId, workspaceId: tenantContext.workspaceId, proposalId: proposal.id, proposalVersion: proposal.version, catalogId: catalog!.id, targetSelectorId: descriptor.selectorId, caseId, expectedCaseVersion: caseVersion, status: 'accepted' }), 'Suggestion accepted for preview; the Assess draft is unchanged.')}>Accept</button><button ref={node => { if (node) editButtonRefs.current.set(proposal.id, node); else editButtonRefs.current.delete(proposal.id); }} type="button" className={secondaryClass} disabled={reviewLocked} onClick={() => { setRestoreEditFocusId(''); setEditingProposalId(proposal.id); setEditedValue(proposal.effectiveValue); setEditReason(''); }}>Edit</button><button type="button" className={secondaryClass} disabled={reviewLocked || proposal.status === 'rejected'} onClick={() => void mutate(() => enterpriseIntelligenceClient.reviewAssessDocumentProposal({ organizationId: tenantContext.organizationId, workspaceId: tenantContext.workspaceId, proposalId: proposal.id, proposalVersion: proposal.version, catalogId: catalog!.id, targetSelectorId: descriptor.selectorId, caseId, expectedCaseVersion: caseVersion, status: 'rejected' }), 'Suggestion rejected; the Assess draft is unchanged.')}>Reject</button>{['accepted','edited'].includes(proposal.status) ? <label className="flex min-h-10 items-center gap-2 text-sm font-black"><input type="checkbox" disabled={applyLocked} checked={selected} onChange={() => setSelectedProposalIds(current => selected ? current.filter(id => id !== proposal.id) : [...current, proposal.id])} />Include in preview</label> : null}</div>}</article>; })}</div>
      {selectedBundle && proposals.length === 0 ? <p className="mt-3 text-sm font-semibold text-slate-500" role="status">No grounded suggestions are available for this case and exact bundle version. Run analysis or review the reported failure state.</p> : null}
      <button type="button" className={`${primaryClass} mt-4`} disabled={applyLocked || !catalog || !selectedBundle || selectedProposals.length === 0 || selectedProposals.length > 100} onClick={() => catalog && selectedBundle && void mutate(() => enterpriseIntelligenceClient.previewAssessDocumentMapping({ organizationId: tenantContext.organizationId, workspaceId: tenantContext.workspaceId, catalogId: catalog.id, catalogHash: catalog.catalogHash, caseId, expectedCaseVersion: caseVersion, inputBundleId: selectedBundle.id, inputBundleVersionId: selectedBundle.versionSelector, selections: selectedProposals.map(proposal => ({ proposalId: proposal.id, proposalVersion: proposal.version, targetSelectorId: proposal.targetSelectorId, effectiveValue: proposal.effectiveValue })) }), 'Exact Assess changes previewed. The draft is still unchanged.')}>Preview {selectedProposals.length || ''} reviewed suggestion{selectedProposals.length === 1 ? '' : 's'}</button>
    </details>

    {latestPreviewCandidate && !latestPreview ? <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950" role="alert">The latest preview projection is incomplete. Reload committed state; no displayed change or apply action is authoritative.</p> : null}
    {latestPreview ? <details open className="mt-4 rounded-xl border border-slate-300 p-3 dark:border-slate-700" data-testid="assess-mapping-preview"><summary className="cursor-pointer font-black">4. Resolve conflicts and apply one immutable version</summary><p className="mt-2 text-sm font-semibold" role="status">Preview {latestPreview.status} · {latestPreview.changes.length} changes · {latestPreview.conflicts.length} conflicts. Manual values are retained unless you explicitly resolve a material difference.</p><ul className="mt-3 list-disc space-y-1 pl-5 text-sm font-semibold">{latestPreview.changes.map(change => <li key={`${change.proposalId}:${change.targetSelectorId}`}>{change.label}: {formatValue(change.currentValue)} → {formatValue(change.proposedValue)} ({change.conflictState.replaceAll('_', ' ')})</li>)}</ul><div className="mt-4 grid gap-3">{latestPreview.conflicts.map(conflict => { const descriptor = descriptors.get(conflict.targetSelectorId); if (!descriptor) return null; const rationale = conflictRationale[conflict.id] || ''; return <article key={conflict.id} className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950"><h4 className="font-black">{conflict.label}</h4><p className="mt-1 text-sm font-semibold">Current manual value: {formatValue(conflict.currentValue)} · {conflict.resolution.replaceAll('_', ' ')}</p>{conflict.resolution === 'unresolved' ? <div className="mt-3 grid gap-3"><label className="text-xs font-black" htmlFor={`conflict-rationale-${conflict.id}`}>Required resolution rationale<input id={`conflict-rationale-${conflict.id}`} className={inputClass} value={rationale} onChange={event => setConflictRationale(current => ({ ...current, [conflict.id]: event.target.value }))} /></label><label className="text-xs font-black" htmlFor={`conflict-choice-${conflict.id}`}>Candidate suggestion<select id={`conflict-choice-${conflict.id}`} className={inputClass} value={conflictChoice[conflict.id] || conflict.proposalIds[0] || ''} onChange={event => setConflictChoice(current => ({ ...current, [conflict.id]: event.target.value }))}>{conflict.proposalIds.map(id => { const proposal = proposals.find(item => item.id === id); return <option key={id} value={id}>{proposal ? formatValue(proposal.effectiveValue) : 'Bound reviewed suggestion'}</option>; })}</select></label><div className="rounded-lg bg-white p-2"><MappingValueEditor descriptor={descriptor} value={authoredConflictValue[conflict.id] ?? conflict.currentValue ?? ''} onChange={value => setAuthoredConflictValue(current => ({ ...current, [conflict.id]: value }))} idPrefix={`conflict-authored-${conflict.id}`} /></div><div className="flex flex-wrap gap-2"><button type="button" className={secondaryClass} disabled={applyLocked || rationale.trim().length < 4 || !conflict.proposalIds.length} onClick={() => void resolveConflict(conflict, 'choose_candidate')}>Use selected suggestion</button><button type="button" className={secondaryClass} disabled={applyLocked || rationale.trim().length < 4 || conflict.currentValue === undefined} onClick={() => void resolveConflict(conflict, 'retain_manual')}>Retain manual value</button><button type="button" className={secondaryClass} disabled={applyLocked || rationale.trim().length < 4} onClick={() => void resolveConflict(conflict, 'authored_resolution')}>Use edited resolution</button></div></div> : <div className="mt-2 grid gap-2 text-xs font-bold"><p>Resolution v{conflict.resolutionVersion}: {conflict.rationale}</p><dl><dt className="text-amber-800">Final resolved value</dt><dd className="mt-1 break-words text-sm">{formatValue(conflict.resolvedValue)}</dd></dl></div>}</article>; })}</div><button type="button" className={`${primaryClass} mt-4`} disabled={applyLocked || latestPreview.status !== 'ready' || unresolvedMaterialConflict} onClick={() => void apply()}>Apply reviewed batch to Assess</button>{unresolvedMaterialConflict ? <p className="mt-2 text-sm font-bold text-rose-700" role="alert">Resolve every material conflict before apply.</p> : null}</details> : null}
  </section>;
}
