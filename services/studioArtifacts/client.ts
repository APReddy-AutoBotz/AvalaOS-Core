import type { TenantContextProjection } from '../../types';
import { beginControlledHumanCommand, completeControlledHumanCommand, prepareControlledHumanOfflineLineage, supabase } from '../supabaseClient';
import {
  STUDIO_ARTIFACT_LIFECYCLES,
  STUDIO_ARTIFACT_TYPES,
  STUDIO_COMMAND_TYPES,
  STUDIO_ARTIFACT_CONTRACT_VERSION,
  STUDIO_WORKSPACE_CONTRACT_VERSION,
  decodeStudioArtifactV2Ancestry,
  type StudioArtifactApprovalDto,
  type StudioArtifactProjectionDto,
  type StudioArtifactReviewDto,
  type StudioArtifactType,
  type StudioArtifactSummaryPageDto,
  type StudioArtifactWorkspaceProjectionDto,
  type StudioCommandEnvelope,
  type StudioCommandResponse,
  type StudioCommandType,
  type StudioGovernedCommandType,
} from './contracts';
import { decodeStudioWorkspaceProjection, type StudioWorkspaceProjection } from './workspaceModel';
import { adaptStudioWorkspaceRpcProjection } from './workspaceRpcAdapter';

export const STUDIO_SAFE_ERROR_CODES = [
  'RESOURCE_NOT_AVAILABLE', 'AUTHORITY_STALE', 'PERMISSION_DENIED', 'VERSION_CONFLICT',
  'IDEMPOTENCY_CONFLICT', 'SEPARATION_OF_DUTY', 'FEATURE_DISABLED', 'READ_ONLY',
  'INVALID_COMMAND', 'GENERATION_FAILED', 'COMMAND_UNAVAILABLE',
  'SOURCE_PACKAGE_STALE', 'TEMPLATE_STALE', 'HANDOFF_STALE', 'HANDOFF_EXPIRED',
  'PROVIDER_UNAVAILABLE', 'MALFORMED_RESULT', 'CANCELLED', 'COMMAND_IN_PROGRESS',
  'HANDOFF_NOT_ELIGIBLE', 'SOURCE_COVERAGE_INCOMPLETE', 'BUDGET_EXHAUSTED', 'RECEIPT_FINALIZATION_FAILED',
  'STUDIO_FEATURE_DISABLED', 'STUDIO_READ_ONLY', 'STUDIO_SEPARATION_OF_DUTY', 'SESSION_EXPIRED',
] as const;
export type StudioSafeErrorCode = (typeof STUDIO_SAFE_ERROR_CODES)[number];
const STUDIO_SAFE_ERROR_ALIASES:Record<string,StudioSafeErrorCode>={RESOURCE_STALE:'SOURCE_PACKAGE_STALE',TEMPLATE_NOT_APPROVED:'TEMPLATE_STALE',PROVIDER_ROUTE_UNAVAILABLE:'PROVIDER_UNAVAILABLE'};

export class StudioArtifactBoundaryError extends Error {
  constructor(public readonly code: StudioSafeErrorCode) { super(code); this.name = 'StudioArtifactBoundaryError'; }
}

export interface StudioHandoffOption { id: string; caseId: string; label: string; sourcePackageHash: string }
export interface StudioEligibleReviewer { actorId: string; displayName: string }
export interface StudioArtifactTransport {
  readHandoffs(context: TenantContextProjection): Promise<unknown>;
  readProjection(context: TenantContextProjection, handoffId: string, artifactType: StudioArtifactType): Promise<unknown>;
  readEligibleReviewers(context: TenantContextProjection, artifactId: string, artifactVersionId: string): Promise<unknown>;
  invoke(envelope: StudioCommandEnvelope<Record<string, unknown>>): Promise<unknown>;
  readWorkspace?(context: TenantContextProjection, page: number): Promise<unknown>;
  invokeWorkspace?(envelope: StudioWorkspaceCommandEnvelope): Promise<unknown>;
  commitStudioSourceSet?(input:{organizationId:string;workspaceId:string;label:string;description?:string;members:Array<{sourceId:string;versionSelector:string;role:'primary'|'supporting'|'contradictory'|'reference';ordinal:number}>}):Promise<unknown>;
  lockStudioInputBundle?(input:{organizationId:string;workspaceId:string;sourceSetVersionSelectors:string[];label:string}):Promise<unknown>;
  readArtifactV2?(context:TenantContextProjection,artifactId:string):Promise<unknown>;
  readSourcePackage?(context:TenantContextProjection,artifactId:string):Promise<unknown>;
  readArtifactWorkspace?(context:TenantContextProjection,artifactId:string,offset:number,limit:number):Promise<unknown>;
  readArtifactSummaries?(context:TenantContextProjection,offset:number,limit:number):Promise<unknown>;
}

export const STUDIO_WORKSPACE_COMMAND_TYPES: readonly StudioGovernedCommandType[] = [
  'studio.source-package.create',
  'studio.template.create', 'studio.template.revise', 'studio.template.review.submit', 'studio.template.review.resolve',
  'studio.template.approval.resolve', 'studio.template.deprecate', 'studio.template.replace',
  'studio.handoff.request', 'studio.handoff.review.resolve', 'studio.handoff.approval.resolve',
  'studio.handoff.withdraw', 'studio.handoff.consume', 'studio.generation.request',
] as const;
export type StudioWorkspaceCommandType = StudioGovernedCommandType;
export interface StudioControlledHumanCommandContext {
  /**
   * Control-plane-only source version for an Assess -> Studio request anchor.
   * This value is never copied into the production command envelope or payload.
   */
  handoffSourceVersion?: number;
}
export interface StudioWorkspaceCommandEnvelope {
  contractVersion: typeof STUDIO_ARTIFACT_CONTRACT_VERSION;
  requestId: string;
  idempotencyKey: string;
  commandType: StudioWorkspaceCommandType;
  organizationId: string;
  workspaceId: string;
  authorizationVersion: number;
  expectedAggregateVersion: number;
  expectedArtifactVersion: number | null;
  payload: Record<string, unknown>;
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const hash = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
const date = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const unavailable = (): never => { throw new StudioArtifactBoundaryError('RESOURCE_NOT_AVAILABLE'); };

const ancestryKeys = ['organizationId','workspaceId','caseId','sourceCaseVersionId','sourceCaseVersion','decisionId','decisionVersion','reviewResolutionId','governResolutionId','studioHandoffId','sourcePackageHash','sourceSchemaVersion','ruleSetVersion','reviewSchemaVersion','reviewSequence'] as const;
const decodeLegacyAncestry = (value: unknown) => {
  if (!object(value) || !exact(value, ancestryKeys) || !uuid(value.organizationId) || !uuid(value.workspaceId) || !uuid(value.caseId) || !uuid(value.sourceCaseVersionId) || !positive(value.sourceCaseVersion) || !uuid(value.decisionId) || !text(value.decisionVersion) || !uuid(value.reviewResolutionId) || !uuid(value.governResolutionId) || !uuid(value.studioHandoffId) || !hash(value.sourcePackageHash) || !text(value.sourceSchemaVersion) || !text(value.ruleSetVersion) || !text(value.reviewSchemaVersion) || !positive(value.reviewSequence)) unavailable();
  return value as unknown as StudioArtifactProjectionDto['ancestry'];
};
const versionKeys = ['id','version','parentVersionId','lifecycle','templateVersion','contentSchemaVersion','projectionVersion','content','contentHash','authorId','createdAt'] as const;
const decodeVersion = (value: unknown) => {
  if (!object(value) || !exact(value, versionKeys) || !uuid(value.id) || !positive(value.version) || !(value.parentVersionId === null || uuid(value.parentVersionId)) || !STUDIO_ARTIFACT_LIFECYCLES.includes(value.lifecycle as never) || !text(value.templateVersion) || !text(value.contentSchemaVersion) || !text(value.projectionVersion) || !object(value.content) || !hash(value.contentHash) || !uuid(value.authorId) || !date(value.createdAt)) unavailable();
  return value as unknown as StudioArtifactProjectionDto['currentVersion'];
};
const conditions = (value: unknown): value is readonly string[] => Array.isArray(value) && value.length <= 20 && value.every(item => text(item) && item.length <= 500);
const arrayValue = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) unavailable();
  return value as unknown[];
};
const decodeReview = (value: unknown): StudioArtifactReviewDto | null => {
  if (value === null) return null;
  const keys=['assignmentId','reviewerId','outcome','rationale','conditions'] as const;
  if (!object(value)||!exact(value,keys)||!uuid(value.assignmentId)||!uuid(value.reviewerId)||!(value.outcome===null||['approved','changes_requested','rejected'].includes(value.outcome as string))||!(value.rationale===null||text(value.rationale))||!conditions(value.conditions)) unavailable();
  return value as unknown as StudioArtifactReviewDto;
};
const decodeApproval = (value: unknown): StudioArtifactApprovalDto | null => {
  if (value === null) return null;
  const keys=['approverId','outcome','rationale','conditions','supersededVersionId'] as const;
  if (!object(value)||!exact(value,keys)||!uuid(value.approverId)||!['approved','rejected'].includes(value.outcome as string)||!text(value.rationale)||!conditions(value.conditions)||!(value.supersededVersionId===null||uuid(value.supersededVersionId))) unavailable();
  return value as unknown as StudioArtifactApprovalDto;
};
const decodeSourcePackage=(value:unknown)=>{const item=object(value)?value:unavailable();const keys=['contractVersion','id','version','sourceMode','assessmentLabel','planningLabel','assessHandoff','studioInputBundle','manualBriefPresent','coverage','stale'] as const;if(!exact(item,keys)||item.contractVersion!==STUDIO_ARTIFACT_CONTRACT_VERSION||!uuid(item.id)||!positive(item.version)||!['assess_handoff','direct_transcript_bundle','assess_plus_transcript_bundle','manual_brief'].includes(String(item.sourceMode))||!['assessed','mixed','not_assessed'].includes(String(item.assessmentLabel))||!['governed_assessed','planning_only'].includes(String(item.planningLabel))||typeof item.manualBriefPresent!=='boolean'||typeof item.stale!=='boolean')unavailable();if(item.assessHandoff!==null){const handoff=object(item.assessHandoff)?item.assessHandoff:unavailable();if(!exact(handoff,['id','version','status','sourceLabel'])||!uuid(handoff.id)||!positive(handoff.version)||!text(handoff.sourceLabel))unavailable();}if(item.studioInputBundle!==null){const bundle=object(item.studioInputBundle)?item.studioInputBundle:unavailable();if(!exact(bundle,['id','version','sourceCount','sourceLabels'])||!uuid(bundle.id)||!positive(bundle.version)||!Number.isSafeInteger(bundle.sourceCount)||Number(bundle.sourceCount)<1||!Array.isArray(bundle.sourceLabels)||!bundle.sourceLabels.every(text))unavailable();}const coverage=object(item.coverage)?item.coverage:unavailable();if(!exact(coverage,['selectedSources','coveredSources','complete','blockers'])||!Number.isSafeInteger(coverage.selectedSources)||!Number.isSafeInteger(coverage.coveredSources)||typeof coverage.complete!=='boolean'||!Array.isArray(coverage.blockers)||!coverage.blockers.every(text))unavailable();if((item.planningLabel==='planning_only')!==(item.assessmentLabel==='not_assessed'))unavailable();return item as unknown as NonNullable<StudioArtifactProjectionDto['sourcePackage']>;};
const templateProjectionActions=['studio.generation.request','studio.template.revise','studio.template.review.submit','studio.template.review.resolve','studio.template.approval.resolve','studio.template.deprecate','studio.template.replace'] as const;
const decodeTemplateProjection=(value:unknown)=>{const item=object(value)?value:unavailable();const keys=['ownership','templateId','templateVersionId','version','name','description','artifactClass','lifecycle','templateHash','rendererVersion','contentSchemaVersion','sections','replacement','actions'] as const;if(!exact(item,keys)||!['system','tenant'].includes(String(item.ownership))||!uuid(item.templateId)||!uuid(item.templateVersionId)||(item.ownership==='system'?!text(item.version):!positive(item.version))||!text(item.name)||typeof item.description!=='string'||!['brd','frd','pdd','custom'].includes(String(item.artifactClass))||!['draft','reviewer_ready','in_review','changes_requested','rejected','approval_ready','approved','deprecated','replaced'].includes(String(item.lifecycle))||!hash(item.templateHash)||!text(item.rendererVersion)||!text(item.contentSchemaVersion))unavailable();const sections=arrayValue(item.sections),actions=arrayValue(item.actions);if(!actions.every(action=>text(action)&&templateProjectionActions.includes(action as typeof templateProjectionActions[number])))unavailable();for(const sectionValue of sections){const section=object(sectionValue)?sectionValue:unavailable();if(!exact(section,['id','title','required','fieldKind'])||!text(section.id)||!text(section.title)||typeof section.required!=='boolean'||!['narrative','requirements','rules','controls','risks','interfaces','acceptance_criteria'].includes(String(section.fieldKind)))unavailable();}if(item.replacement!==null){const replacement=object(item.replacement)?item.replacement:unavailable();if(!exact(replacement,['templateId','templateVersionId','version'])||!uuid(replacement.templateId)||!uuid(replacement.templateVersionId)||(item.ownership==='system'?!text(replacement.version):!positive(replacement.version)))unavailable();}return item as unknown as NonNullable<StudioArtifactProjectionDto['template']>;};
const decodeSections = (value: unknown) => {
  const sectionValues = arrayValue(value);
  if (sectionValues.length > 100) unavailable();
  return sectionValues.map(sectionValue => {
    const section = object(sectionValue) ? sectionValue : unavailable();
    if (!exact(section, ['id','title','body','sourceAnchors','labels']) || !text(section.id) || !text(section.title) || typeof section.body !== 'string') unavailable();
    const anchors = arrayValue(section.sourceAnchors), labels = arrayValue(section.labels);
    if (anchors.length > 200 || labels.length > 3 || !labels.every(label => ['human_authored','template_required','assumption'].includes(String(label)))) unavailable();
    for (const anchorValue of anchors) {
      const anchor = object(anchorValue) ? anchorValue : unavailable();
      if (!exact(anchor, ['sourceVersionId','locator','anchorHash']) || !uuid(anchor.sourceVersionId) || !text(anchor.locator) || !hash(anchor.anchorHash)) unavailable();
    }
    if (anchors.length === 0 && labels.length === 0) unavailable();
    return section;
  }) as unknown as NonNullable<StudioArtifactProjectionDto['sections']>;
};

const workspaceProjectionActions = [
  ...STUDIO_COMMAND_TYPES,
  ...STUDIO_WORKSPACE_COMMAND_TYPES,
] as const;

export const decodeStudioArtifactSummaryPage = (
  value: unknown,
  context: Pick<TenantContextProjection, 'organizationId' | 'workspaceId'>,
): StudioArtifactSummaryPageDto => {
  const root=object(value)?value:unavailable();
  if(!exact(root,['contractVersion','organizationId','workspaceId','items','total','offset','limit','hasMore'])
    ||root.contractVersion!=='studio-artifact-summary-2'||root.organizationId!==context.organizationId||root.workspaceId!==context.workspaceId
    ||!Number.isSafeInteger(root.total)||Number(root.total)<0||!Number.isSafeInteger(root.offset)||Number(root.offset)<0
    ||!Number.isSafeInteger(root.limit)||Number(root.limit)<1||Number(root.limit)>50||typeof root.hasMore!=='boolean')unavailable();
  const rawItems=arrayValue(root.items);
  if(rawItems.length>Number(root.limit)||rawItems.length>Number(root.total)||root.hasMore!==(Number(root.offset)+rawItems.length<Number(root.total)))unavailable();
  const items=rawItems.map(raw=>{
    const item=object(raw)?raw:unavailable();
    if(!exact(item,['id','artifactType','aggregateVersion','lifecycle','currentVersionId','currentApprovedVersionId','sourceMode','lineageClassification','planningOnly','displayLabel','updatedAt','actions'])
      ||!uuid(item.id)||!STUDIO_ARTIFACT_TYPES.includes(item.artifactType as never)||!Number.isSafeInteger(item.aggregateVersion)||Number(item.aggregateVersion)<0
      ||!STUDIO_ARTIFACT_LIFECYCLES.includes(item.lifecycle as never)||!(item.currentVersionId===null||uuid(item.currentVersionId))
      ||!(item.currentApprovedVersionId===null||uuid(item.currentApprovedVersionId))||!['assess_handoff','direct_transcript_bundle','assess_plus_transcript_bundle','manual_brief'].includes(String(item.sourceMode))
      ||!['assessed','mixed','not_assessed'].includes(String(item.lineageClassification))||typeof item.planningOnly!=='boolean'||!text(item.displayLabel)||!date(item.updatedAt))unavailable();
    const actions=arrayValue(item.actions);
    if(actions.length>1||new Set(actions).size!==actions.length||!actions.every(action=>action==='studio.artifact.draft.revise'))unavailable();
    const planningMode=item.sourceMode==='direct_transcript_bundle'||item.sourceMode==='manual_brief';
    if(planningMode!==item.planningOnly||(item.planningOnly?item.lineageClassification!=='not_assessed':item.lineageClassification==='not_assessed')
      ||(Number(item.aggregateVersion)===0)!==(item.currentVersionId===null)||(item.currentApprovedVersionId!==null&&item.currentVersionId===null))unavailable();
    return item;
  });
  return{contractVersion:'studio-artifact-summary-2',organizationId:context.organizationId,workspaceId:context.workspaceId,items:items as unknown as StudioArtifactSummaryPageDto['items'],total:root.total as number,offset:root.offset as number,limit:root.limit as number,hasMore:root.hasMore as boolean};
};
export const decodeStudioArtifactWorkspaceProjection = (
  value: unknown,
  context: Pick<TenantContextProjection, 'organizationId' | 'workspaceId'>,
): StudioArtifactWorkspaceProjectionDto => {
  const root = object(value) ? value : unavailable();
  if (!exact(root, ['contractVersion','organizationId','workspaceId','artifact','sourcePackage','selectedSources','coverage','providerAvailability','actions'])
    || root.contractVersion !== STUDIO_WORKSPACE_CONTRACT_VERSION || root.organizationId !== context.organizationId || root.workspaceId !== context.workspaceId) unavailable();

  const artifact = object(root.artifact) ? root.artifact : unavailable();
  if (!exact(artifact, ['id','artifactType','aggregateVersion','lifecycle','currentVersionId','currentApprovedVersionId','sections'])
    || !uuid(artifact.id) || !STUDIO_ARTIFACT_TYPES.includes(artifact.artifactType as never)
    || !Number.isSafeInteger(artifact.aggregateVersion) || Number(artifact.aggregateVersion) < 0
    || !STUDIO_ARTIFACT_LIFECYCLES.includes(artifact.lifecycle as never)
    || !(artifact.currentVersionId === null || uuid(artifact.currentVersionId))
    || !(artifact.currentApprovedVersionId === null || uuid(artifact.currentApprovedVersionId))) unavailable();
  const sections = decodeSections(artifact.sections);
  if ((Number(artifact.aggregateVersion) === 0) !== (artifact.currentVersionId === null) || (artifact.currentApprovedVersionId !== null && artifact.currentVersionId === null)) unavailable();

  const sourcePackage = object(root.sourcePackage) ? root.sourcePackage : unavailable();
  if (!exact(sourcePackage, ['id','version','hash','mode','lineageClassification','planningOnly','inputBundle'])
    || !uuid(sourcePackage.id) || !positive(sourcePackage.version) || !hash(sourcePackage.hash)
    || !['assess_handoff','direct_transcript_bundle','assess_plus_transcript_bundle','manual_brief'].includes(String(sourcePackage.mode))
    || !['assessed','mixed','not_assessed'].includes(String(sourcePackage.lineageClassification)) || typeof sourcePackage.planningOnly !== 'boolean') unavailable();
  let inputBundle: StudioArtifactWorkspaceProjectionDto['sourcePackage']['inputBundle'] = null;
  if (sourcePackage.inputBundle !== null) {
    const item = object(sourcePackage.inputBundle) ? sourcePackage.inputBundle : unavailable();
    if (!exact(item, ['id','versionId','version']) || !uuid(item.id) || !uuid(item.versionId) || !positive(item.version)) unavailable();
    inputBundle = { id: item.id as string, versionId: item.versionId as string, version: item.version as number };
  }
  const planningMode = sourcePackage.mode === 'direct_transcript_bundle' || sourcePackage.mode === 'manual_brief';
  if (planningMode !== sourcePackage.planningOnly || (sourcePackage.planningOnly ? sourcePackage.lineageClassification !== 'not_assessed' : sourcePackage.lineageClassification === 'not_assessed')
    || ((sourcePackage.mode === 'direct_transcript_bundle' || sourcePackage.mode === 'assess_plus_transcript_bundle') !== (inputBundle !== null))) unavailable();

  const selected = object(root.selectedSources) ? root.selectedSources : unavailable();
  if (!exact(selected, ['items','total','offset','limit','hasMore']) || !Number.isSafeInteger(selected.total) || Number(selected.total) < 0
    || !Number.isSafeInteger(selected.offset) || Number(selected.offset) < 0 || !Number.isSafeInteger(selected.limit) || Number(selected.limit) < 1 || Number(selected.limit) > 50
    || typeof selected.hasMore !== 'boolean') unavailable();
  const selectedItems = arrayValue(selected.items);
  if (selectedItems.length > Number(selected.limit) || selectedItems.length > Number(selected.total)
    || selected.hasMore !== (Number(selected.offset) + selectedItems.length < Number(selected.total))) unavailable();
  const items = selectedItems.map(raw => {
    const item = object(raw) ? raw : unavailable();
    if (!exact(item, ['sourceId','sourceVersionId','sourceVersion','label','sourceKind','semanticRoles']) || !uuid(item.sourceId) || !uuid(item.sourceVersionId)
      || !positive(item.sourceVersion) || !text(item.label) || !text(item.sourceKind)) unavailable();
    const semanticRoles = arrayValue(item.semanticRoles);
    if (semanticRoles.length < 1 || semanticRoles.length > 4 || new Set(semanticRoles).size !== semanticRoles.length
      || !semanticRoles.every(role => ['primary','supporting','contradictory','reference'].includes(String(role)))) unavailable();
    return { sourceId: item.sourceId, sourceVersionId: item.sourceVersionId, sourceVersion: item.sourceVersion, label: item.label, sourceKind: item.sourceKind, semanticRoles };
  });

  const coverage = object(root.coverage) ? root.coverage : unavailable();
  if (!exact(coverage, ['selectedSourceVersionIds','coveredSourceVersionIds','uncoveredSourceVersionIds','complete','citations','conflicts']) || typeof coverage.complete !== 'boolean') unavailable();
  const selectedIds = arrayValue(coverage.selectedSourceVersionIds), coveredIds = arrayValue(coverage.coveredSourceVersionIds), uncoveredIds = arrayValue(coverage.uncoveredSourceVersionIds);
  if (![selectedIds, coveredIds, uncoveredIds].every(ids => ids.length <= 2_000 && ids.every(uuid) && new Set(ids).size === ids.length)
    || coveredIds.some(id => !selectedIds.includes(id)) || uncoveredIds.some(id => !selectedIds.includes(id))
    || coveredIds.some(id => uncoveredIds.includes(id)) || coverage.complete !== (uncoveredIds.length === 0)) unavailable();
  const citations = arrayValue(coverage.citations).map(raw => {
    const item = object(raw) ? raw : unavailable();
    if (!exact(item, ['sectionId','sourceVersionId','locator','anchorHash']) || !text(item.sectionId) || !uuid(item.sourceVersionId) || !text(item.locator) || !hash(item.anchorHash)
      || !selectedIds.includes(item.sourceVersionId)) unavailable();
    return item as unknown as StudioArtifactWorkspaceProjectionDto['coverage']['citations'][number];
  });
  const conflicts = arrayValue(coverage.conflicts).map(raw => {
    const item = object(raw) ? raw : unavailable();
    if (!exact(item, ['conflictKey','sourceVersionIds','status']) || !text(item.conflictKey) || !['unresolved','resolved'].includes(String(item.status))) unavailable();
    const sourceVersionIds = arrayValue(item.sourceVersionIds);
    if (sourceVersionIds.length < 2 || sourceVersionIds.length > 20 || !sourceVersionIds.every(uuid) || sourceVersionIds.some(id => !selectedIds.includes(id))) unavailable();
    return item as unknown as StudioArtifactWorkspaceProjectionDto['coverage']['conflicts'][number];
  });

  const provider = object(root.providerAvailability) ? root.providerAvailability : unavailable();
  if (!exact(provider, ['available','reason']) || typeof provider.available !== 'boolean'
    || !['available','feature_disabled','read_only','permission_denied','route_unavailable','source_stale','template_unavailable'].includes(String(provider.reason))
    || provider.available !== (provider.reason === 'available')) unavailable();
  const actions = arrayValue(root.actions);
  if (actions.length > 30 || new Set(actions).size !== actions.length || !actions.every(action => typeof action === 'string' && workspaceProjectionActions.includes(action as never))) unavailable();

  return {
    contractVersion: STUDIO_WORKSPACE_CONTRACT_VERSION,
    organizationId: context.organizationId,
    workspaceId: context.workspaceId,
    artifact: { id: artifact.id as string, artifactType: artifact.artifactType as StudioArtifactType, aggregateVersion: artifact.aggregateVersion as number, lifecycle: artifact.lifecycle as StudioArtifactProjectionDto['lifecycle'], currentVersionId: artifact.currentVersionId as string | null, currentApprovedVersionId: artifact.currentApprovedVersionId as string | null, sections },
    sourcePackage: { id: sourcePackage.id as string, version: sourcePackage.version as number, hash: sourcePackage.hash as string, mode: sourcePackage.mode as StudioArtifactWorkspaceProjectionDto['sourcePackage']['mode'], lineageClassification: sourcePackage.lineageClassification as StudioArtifactWorkspaceProjectionDto['sourcePackage']['lineageClassification'], planningOnly: sourcePackage.planningOnly as boolean, inputBundle },
    selectedSources: { items: items as StudioArtifactWorkspaceProjectionDto['selectedSources']['items'], total: selected.total as number, offset: selected.offset as number, limit: selected.limit as number, hasMore: selected.hasMore as boolean },
    coverage: { selectedSourceVersionIds: selectedIds as string[], coveredSourceVersionIds: coveredIds as string[], uncoveredSourceVersionIds: uncoveredIds as string[], complete: coverage.complete as boolean, citations, conflicts },
    providerAvailability: { available: provider.available as boolean, reason: provider.reason as StudioArtifactWorkspaceProjectionDto['providerAvailability']['reason'] },
    actions: actions as string[],
  };
};

export const decodeStudioArtifactProjection = (value: unknown, context: Pick<TenantContextProjection,'organizationId'|'workspaceId'>): StudioArtifactProjectionDto => {
  const legacyKeys = ['id','artifactType','aggregateVersion','lifecycle','ancestry','currentVersion','currentApprovedVersion','versions','review','approval','readOnly'] as const;
  const prBKeys = [...legacyKeys,'contractVersion','sourcePackage','template','sections','assessmentLabel','planningLabel'] as const;
  const prB=object(value)&&value.contractVersion===STUDIO_ARTIFACT_CONTRACT_VERSION;const keys=prB?prBKeys:legacyKeys;
  if (!object(value) || !exact(value, keys) || !uuid(value.id) || !STUDIO_ARTIFACT_TYPES.includes(value.artifactType as never) || !(prB?Number.isSafeInteger(value.aggregateVersion)&&Number(value.aggregateVersion)>=0:positive(value.aggregateVersion)) || !STUDIO_ARTIFACT_LIFECYCLES.includes(value.lifecycle as never) || !Array.isArray(value.versions) || typeof value.readOnly !== 'boolean') unavailable();
  const record=value as Record<string,unknown>;
  let ancestry:StudioArtifactProjectionDto['ancestry'];try{ancestry=prB?decodeStudioArtifactV2Ancestry(record.ancestry):decodeLegacyAncestry(record.ancestry);}catch{unavailable();}const currentVersion=decodeVersion(record.currentVersion), currentApprovedVersion=record.currentApprovedVersion===null?null:decodeVersion(record.currentApprovedVersion), versions=(record.versions as unknown[]).map(decodeVersion), review=decodeReview(record.review), approval=decodeApproval(record.approval);
  const ordered=versions.every((item,index)=>index===0||versions[index-1].version<item.version);
  const currentMembership=versions.some(item=>item.id===currentVersion.id&&item.version===currentVersion.version);
  if (ancestry.organizationId!==context.organizationId||ancestry.workspaceId!==context.workspaceId||currentVersion.lifecycle!==record.lifecycle||!(prB?currentMembership:versions.at(-1)?.id===currentVersion.id)||!ordered||(currentApprovedVersion&&(currentApprovedVersion.lifecycle!=='approved'||!versions.some(item=>item.id===currentApprovedVersion.id)))) unavailable();
  if(prB){if(!['assessed','mixed','not_assessed'].includes(String(record.assessmentLabel))||!['governed_assessed','planning_only'].includes(String(record.planningLabel))||(record.planningLabel==='planning_only')!==(record.assessmentLabel==='not_assessed'))unavailable();const sourcePackage=decodeSourcePackage(record.sourcePackage),template=decodeTemplateProjection(record.template),sections=decodeSections(record.sections);if(sourcePackage.assessmentLabel!==record.assessmentLabel||sourcePackage.planningLabel!==record.planningLabel)unavailable();return{id:record.id as string,artifactType:record.artifactType as StudioArtifactType,aggregateVersion:record.aggregateVersion as number,lifecycle:record.lifecycle as StudioArtifactProjectionDto['lifecycle'],ancestry,currentVersion,currentApprovedVersion,versions,review,approval,readOnly:record.readOnly as boolean,contractVersion:STUDIO_ARTIFACT_CONTRACT_VERSION,sourcePackage,template,sections,assessmentLabel:record.assessmentLabel as StudioArtifactProjectionDto['assessmentLabel'],planningLabel:record.planningLabel as StudioArtifactProjectionDto['planningLabel']};}
  return {id:record.id as string,artifactType:record.artifactType as StudioArtifactType,aggregateVersion:record.aggregateVersion as number,lifecycle:record.lifecycle as StudioArtifactProjectionDto['lifecycle'],ancestry,currentVersion,currentApprovedVersion,versions,review,approval,readOnly:record.readOnly as boolean};
};

export const decodeStudioHandoffs = (value: unknown): StudioHandoffOption[] => {
  if (!Array.isArray(value)) unavailable();
  return (value as unknown[]).map(item=>{const keys=['id','caseId','label','sourcePackageHash'];if(!object(item)||!exact(item,keys)||!uuid(item.id)||!uuid(item.caseId)||!text(item.label)||!hash(item.sourcePackageHash)) unavailable();return item as unknown as StudioHandoffOption;});
};
export const decodeStudioEligibleReviewers = (value: unknown): StudioEligibleReviewer[] => {
  if(!Array.isArray(value)) unavailable();
  return (value as unknown[]).map(item=>{if(!object(item)||!exact(item,['actorId','displayName'])||!uuid(item.actorId)||!text(item.displayName)) unavailable();return item as unknown as StudioEligibleReviewer;});
};

export const decodeStudioSafeError = (value: unknown): StudioArtifactBoundaryError => {
  const candidates:unknown[]=[value];
  if(object(value)){candidates.push(value.code,value.errorCode,value.details);if(object(value.error))candidates.push(value.error.code,value.error.errorCode);}
  const raw=candidates.find(candidate=>typeof candidate==='string'&&(STUDIO_SAFE_ERROR_ALIASES[candidate]||STUDIO_SAFE_ERROR_CODES.includes(candidate as StudioSafeErrorCode)));
  const code=typeof raw==='string'?(STUDIO_SAFE_ERROR_ALIASES[raw]??raw as StudioSafeErrorCode):'COMMAND_UNAVAILABLE';
  return new StudioArtifactBoundaryError(code);
};
const decodeInvocationError=async(error:unknown):Promise<StudioArtifactBoundaryError>=>{
  if(object(error)&&object(error.context)&&typeof error.context.json==='function'){
    try{return decodeStudioSafeError(await (error.context.json as ()=>Promise<unknown>)());}catch{return new StudioArtifactBoundaryError('COMMAND_UNAVAILABLE');}
  }
  return decodeStudioSafeError(error);
};
const retryableStudioTransportError=(error:unknown)=>{const name=object(error)&&'name' in error?String(error.name):'';return name==='AbortError'||name==='FunctionsFetchError'||name==='FunctionsRelayError';};
const receiptBoundHttpOutcome=async(error:unknown):Promise<StudioCommandResponse|null>=>{if(!object(error)||error.name!=='FunctionsHttpError'||!object(error.context))return null;try{const source=typeof error.context.clone==='function'?(error.context.clone as()=>unknown)():error.context;if(!object(source)||typeof source.json!=='function')return null;const decoded=decodeStudioCommandResponse(await(source.json as()=>Promise<unknown>)());return ['generation_stale','generation_uncertain','command_in_progress'].includes(decoded.outcome)?decoded:null;}catch{return null;}};

export const decodeStudioCommandResponse = (value:unknown):StudioCommandResponse => {
  const keys=['ok','outcome','receiptId','resourceId','resource'] as const;
  if(!object(value)||!exact(value,keys)||value.ok!==true||!['committed','replayed','generation_completed','generation_failed','generation_stale','generation_uncertain','command_in_progress'].includes(value.outcome as string)||!uuid(value.receiptId)||!uuid(value.resourceId)||!object(value.resource)) unavailable();
  return value as unknown as StudioCommandResponse;
};

export const studioArtifactDefaultTransport:StudioArtifactTransport={
  async readHandoffs(context){const {data,error}=await supabase.rpc('studio_artifact_handoffs',{p_org_id:context.organizationId,p_workspace_id:context.workspaceId});if(error)throw decodeStudioSafeError(error);return data;},
  async readProjection(context,handoffId,artifactType){const {data,error}=await supabase.rpc('studio_artifact_projection',{p_org_id:context.organizationId,p_workspace_id:context.workspaceId,p_handoff_id:handoffId,p_artifact_type:artifactType});if(error)throw decodeStudioSafeError(error);return data;},
  async readEligibleReviewers(context,artifactId,artifactVersionId){const {data,error}=await supabase.rpc('studio_artifact_eligible_reviewers',{p_org_id:context.organizationId,p_workspace_id:context.workspaceId,p_artifact_id:artifactId,p_artifact_version_id:artifactVersionId});if(error)throw decodeStudioSafeError(error);return data;},
  async invoke(envelope){const {data,error}=await supabase.functions.invoke('studio-artifact-command',{body:envelope});if(error){const receipt=await receiptBoundHttpOutcome(error);if(receipt)return receipt;throw await decodeInvocationError(error);}return data;},
  async readWorkspace(context,page){
    if(page!==1)throw new StudioArtifactBoundaryError('RESOURCE_NOT_AVAILABLE');
    const reads=[
      context.capabilities.includes('studio.sources.read')?supabase.rpc('enterprise_transcript_module_projection',{p_org:context.organizationId,p_workspace:context.workspaceId,p_owner_module:'studio'}):null,
      context.capabilities.includes('studio.templates.read')?supabase.rpc('studio_tenant_template_projection',{p_org:context.organizationId,p_workspace:context.workspaceId}):null,
      context.capabilities.includes('studio.handoffs.read')?supabase.rpc('enterprise_assess_studio_handoff_projection',{p_org:context.organizationId,p_workspace:context.workspaceId}):null,
    ] as const;
    const settled=await Promise.all(reads.map(async request=>{if(!request)return null;try{return await request;}catch{return null;}}));
    const values=settled.map(result=>result&&!result.error?result.data:null);
    const attempted=reads.filter(Boolean).length,available=values.filter(value=>value!==null).length;
    if(attempted===0||available===0)throw new StudioArtifactBoundaryError('RESOURCE_NOT_AVAILABLE');
    return{projection:adaptStudioWorkspaceRpcProjection(values[0],values[1],values[2],context)};
  },
  async invokeWorkspace(envelope){let lastError:unknown;for(let attempt=0;attempt<2;attempt+=1){try{const invocation=await supabase.functions.invoke('studio-artifact-command',{body:envelope});if(!invocation.error)return invocation.data;const receipt=await receiptBoundHttpOutcome(invocation.error);if(receipt)return receipt;lastError=invocation.error;if(!retryableStudioTransportError(invocation.error)||attempt===1)throw await decodeInvocationError(invocation.error);}catch(error){if(error instanceof StudioArtifactBoundaryError)throw error;const receipt=await receiptBoundHttpOutcome(error);if(receipt)return receipt;lastError=error;if(!retryableStudioTransportError(error)||attempt===1)throw await decodeInvocationError(error);}}throw await decodeInvocationError(lastError);},
  async readArtifactV2(context,artifactId){const {data,error}=await supabase.rpc('studio_artifact_projection_v2',{p_org:context.organizationId,p_workspace:context.workspaceId,p_artifact:artifactId});if(error)throw decodeStudioSafeError(error);return data;},
  async readSourcePackage(context,artifactId){const {data,error}=await supabase.rpc('studio_artifact_source_package_projection',{p_org:context.organizationId,p_workspace:context.workspaceId,p_artifact:artifactId});if(error)throw decodeStudioSafeError(error);return data;},
  async readArtifactWorkspace(context,artifactId,offset,limit){const {data,error}=await supabase.rpc('studio_artifact_workspace_projection_v2',{p_org:context.organizationId,p_workspace:context.workspaceId,p_artifact:artifactId,p_source_offset:offset,p_source_limit:limit});if(error)throw decodeStudioSafeError(error);return data;},
  async readArtifactSummaries(context,offset,limit){const {data,error}=await supabase.rpc('studio_artifact_summary_projection_v2',{p_org:context.organizationId,p_workspace:context.workspaceId,p_offset:offset,p_limit:limit});if(error)throw decodeStudioSafeError(error);return data;},
};
export const readStudioHandoffs=async(context:TenantContextProjection,transport=studioArtifactDefaultTransport)=>decodeStudioHandoffs(await transport.readHandoffs(context));
export const readStudioArtifact=async(context:TenantContextProjection,handoffId:string,type:StudioArtifactType,transport=studioArtifactDefaultTransport)=>decodeStudioArtifactProjection(await transport.readProjection(context,handoffId,type),context);
export const readStudioEligibleReviewers=async(context:TenantContextProjection,artifactId:string,versionId:string,transport=studioArtifactDefaultTransport)=>decodeStudioEligibleReviewers(await transport.readEligibleReviewers(context,artifactId,versionId));
export const executeStudioArtifactCommand=async(context:TenantContextProjection,commandType:StudioCommandType,projection:StudioArtifactProjectionDto|null,payload:Record<string,unknown>,idempotencyKey:string,transport=studioArtifactDefaultTransport):Promise<StudioCommandResponse>=>{
  const artifactId=projection?.id??(typeof payload.artifactId==='string'?payload.artifactId:'');const expectedAggregateVersion=projection?.aggregateVersion??0;
  const canonicalJson=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonicalJson).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonicalJson((value as Record<string,unknown>)[key])}`).join(',')}}`:JSON.stringify(value);
  const digest=async(value:unknown)=>`sha256:${Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJson(value))))).map(byte=>byte.toString(16).padStart(2,'0')).join('')}`;
  const selectors=commandType==='studio.artifact.review.resolve'||commandType==='studio.artifact.approval.resolve'?{
    artifactId,artifactVersionId:payload.artifactVersionId,outcome:payload.outcome,
    rationaleDigest:await digest(payload.rationale),conditionsDigest:await digest(payload.conditions??[]),
  }:{artifactVersionId:typeof payload.artifactVersionId==='string'?payload.artifactVersionId:null};
  const anchor=await beginControlledHumanCommand({action:commandType,targetFamily:'studio_artifact',targetId:artifactId,expectedVersion:expectedAggregateVersion,selectorBindings:selectors});
  const envelope:StudioCommandEnvelope<Record<string,unknown>>={requestId:anchor?.requestId??crypto.randomUUID(),idempotencyKey:anchor?.businessIdempotencyKey??idempotencyKey,commandType,organizationId:context.organizationId,workspaceId:context.workspaceId,authorizationVersion:context.authorizationVersion,expectedAggregateVersion,expectedArtifactVersion:commandType==='studio.artifact.generation.request'?null:projection?.currentVersion.version??null,payload};
  try{const result=decodeStudioCommandResponse(await transport.invoke(envelope));if(anchor)await completeControlledHumanCommand(anchor);return result;}catch(error){if(error instanceof StudioArtifactBoundaryError)throw error;throw decodeStudioSafeError(error);}
};

export const readStudioWorkspace = async (context: TenantContextProjection, page = 1, transport: StudioArtifactTransport = studioArtifactDefaultTransport): Promise<StudioWorkspaceProjection | null> => {
  if (!transport.readWorkspace) return null;
  if (!Number.isSafeInteger(page) || page < 1) throw new StudioArtifactBoundaryError('INVALID_COMMAND');
  const value = await transport.readWorkspace(context, page);
  const body = object(value) && exact(value, ['projection']) ? value.projection : value;
  try { return decodeStudioWorkspaceProjection(body, context); } catch { throw new StudioArtifactBoundaryError('RESOURCE_NOT_AVAILABLE'); }
};

export interface StudioSourcePackageIdentity {artifactId:string;aggregateVersion:number;currentVersionId:string|null;currentApprovedVersionId:string|null;sourcePackageId:string;sourcePackageVersion:number;sourcePackageHash:string;sourceMode:'assess_handoff'|'direct_transcript_bundle'|'assess_plus_transcript_bundle'|'manual_brief';version:number;lineageClassification:'assessed'|'mixed'|'not_assessed';planningOnly:boolean;hasAssessAncestry:boolean;hasStudioTranscriptBundle:boolean;hasManualBrief:boolean;routePolicyVersion:number;createdAt:string}
export const decodeStudioSourcePackageIdentity=(value:unknown):StudioSourcePackageIdentity=>{const keys=['artifactId','aggregateVersion','currentVersionId','currentApprovedVersionId','sourcePackageId','sourcePackageVersion','sourcePackageHash','sourceMode','version','lineageClassification','planningOnly','hasAssessAncestry','hasStudioTranscriptBundle','hasManualBrief','routePolicyVersion','createdAt'] as const;const item=object(value)?value:unavailable();if(!exact(item,keys)||!uuid(item.artifactId)||!Number.isSafeInteger(item.aggregateVersion)||Number(item.aggregateVersion)<0||!(item.currentVersionId===null||uuid(item.currentVersionId))||!(item.currentApprovedVersionId===null||uuid(item.currentApprovedVersionId))||!uuid(item.sourcePackageId)||!positive(item.sourcePackageVersion)||!hash(item.sourcePackageHash)||!['assess_handoff','direct_transcript_bundle','assess_plus_transcript_bundle','manual_brief'].includes(String(item.sourceMode))||!positive(item.version)||item.sourcePackageVersion!==item.version||!['assessed','mixed','not_assessed'].includes(String(item.lineageClassification))||typeof item.planningOnly!=='boolean'||typeof item.hasAssessAncestry!=='boolean'||typeof item.hasStudioTranscriptBundle!=='boolean'||typeof item.hasManualBrief!=='boolean'||!positive(item.routePolicyVersion)||!date(item.createdAt))unavailable();if((item.aggregateVersion===0&&(item.currentVersionId!==null||item.currentApprovedVersionId!==null))||(Number(item.aggregateVersion)>0&&item.currentVersionId===null))unavailable();const flags=[item.hasAssessAncestry,item.hasStudioTranscriptBundle,item.hasManualBrief] as const;const validMode=item.sourceMode==='assess_handoff'?flags[0]&&!flags[1]&&!flags[2]&&item.lineageClassification==='assessed'&&!item.planningOnly:item.sourceMode==='direct_transcript_bundle'?!flags[0]&&flags[1]&&!flags[2]&&item.lineageClassification==='not_assessed'&&item.planningOnly:item.sourceMode==='assess_plus_transcript_bundle'?flags[0]&&flags[1]&&!flags[2]&&item.lineageClassification==='mixed'&&!item.planningOnly:!flags[0]&&!flags[1]&&flags[2]&&item.lineageClassification==='not_assessed'&&item.planningOnly;if(!validMode)unavailable();return item as unknown as StudioSourcePackageIdentity;};
export const readStudioArtifactV2=async(context:TenantContextProjection,artifactId:string,transport:StudioArtifactTransport=studioArtifactDefaultTransport)=>{if(!uuid(artifactId)||!transport.readArtifactV2)throw new StudioArtifactBoundaryError('COMMAND_UNAVAILABLE');return decodeStudioArtifactProjection(await transport.readArtifactV2(context,artifactId),context);};
export const readStudioSourcePackageIdentity=async(context:TenantContextProjection,artifactId:string,transport:StudioArtifactTransport=studioArtifactDefaultTransport)=>{if(!uuid(artifactId)||!transport.readSourcePackage)throw new StudioArtifactBoundaryError('COMMAND_UNAVAILABLE');return decodeStudioSourcePackageIdentity(await transport.readSourcePackage(context,artifactId));};
export const readStudioArtifactWorkspace = async (
  context: TenantContextProjection,
  artifactId: string,
  offset = 0,
  limit = 20,
  transport: StudioArtifactTransport = studioArtifactDefaultTransport,
): Promise<StudioArtifactWorkspaceProjectionDto> => {
  if (!uuid(artifactId) || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50 || !transport.readArtifactWorkspace) throw new StudioArtifactBoundaryError('COMMAND_UNAVAILABLE');
  return decodeStudioArtifactWorkspaceProjection(await transport.readArtifactWorkspace(context, artifactId, offset, limit), context);
};

export const readStudioArtifactSummaries = async (
  context: TenantContextProjection,
  offset = 0,
  limit = 20,
  transport: StudioArtifactTransport = studioArtifactDefaultTransport,
): Promise<StudioArtifactSummaryPageDto> => {
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>50||!transport.readArtifactSummaries)throw new StudioArtifactBoundaryError('COMMAND_UNAVAILABLE');
  return decodeStudioArtifactSummaryPage(await transport.readArtifactSummaries(context,offset,limit),context);
};

export const controlledHumanStudioTarget = (
  context: TenantContextProjection,
  commandType: StudioWorkspaceCommandType,
  expectedVersion: number,
  payload: Record<string, unknown>,
  controlledHuman?: StudioControlledHumanCommandContext,
) => {
  const inputBundle=payload.studioInputBundle&&typeof payload.studioInputBundle==='object'&&!Array.isArray(payload.studioInputBundle)
    ? payload.studioInputBundle as Record<string,unknown>:null;
  if(commandType==='studio.source-package.create') return payload.sourceMode==='direct_transcript_bundle'
    ? {family:'input_bundle',id:typeof inputBundle?.id==='string'?inputBundle.id:'',version:Number(inputBundle?.version??-1)}
    : {family:'workspace',id:context.workspaceId,version:context.authorizationVersion};
  if(commandType==='studio.handoff.request') return {family:'assess_studio_handoff',id:typeof payload.upstreamHandoffId==='string'?payload.upstreamHandoffId:'',version:Number(controlledHuman?.handoffSourceVersion??expectedVersion)};
  if(commandType.startsWith('studio.handoff.')) return {family:'module_handoff',id:typeof payload.handoffId==='string'?payload.handoffId:'',version:expectedVersion};
  return {family:'studio_artifact',id:typeof payload.artifactId==='string'?payload.artifactId:'',version:expectedVersion};
};

export const executeStudioWorkspaceCommand = async (
  context: TenantContextProjection,
  commandType: StudioWorkspaceCommandType,
  expectedVersion: number,
  payload: Record<string, unknown>,
  idempotencyKey: string,
  transport: StudioArtifactTransport = studioArtifactDefaultTransport,
  controlledHuman?: StudioControlledHumanCommandContext,
): Promise<StudioCommandResponse> => {
  if (!transport.invokeWorkspace || !STUDIO_WORKSPACE_COMMAND_TYPES.includes(commandType) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0
    || (controlledHuman?.handoffSourceVersion!==undefined && (commandType!=='studio.handoff.request'||!Number.isSafeInteger(controlledHuman.handoffSourceVersion)||controlledHuman.handoffSourceVersion<1))) throw new StudioArtifactBoundaryError('COMMAND_UNAVAILABLE');
  const createLike = ['studio.source-package.create','studio.handoff.request','studio.template.create','studio.generation.request'].includes(commandType);
  const inputBundle=payload.studioInputBundle&&typeof payload.studioInputBundle==='object'&&!Array.isArray(payload.studioInputBundle)
    ? payload.studioInputBundle as Record<string,unknown>:null;
  const target=controlledHumanStudioTarget(context,commandType,expectedVersion,payload,controlledHuman);
  const canonicalJson=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonicalJson).join(',')}]`
    :value&&typeof value==='object'?`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonicalJson((value as Record<string,unknown>)[key])}`).join(',')}}`
    :JSON.stringify(value);
  const digest=async(value:unknown)=>`sha256:${Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJson(value))))).map(byte=>byte.toString(16).padStart(2,'0')).join('')}`;
  const textDigest=async(value:unknown)=>{
    if(typeof value!=='string')throw new StudioArtifactBoundaryError('COMMAND_UNAVAILABLE');
    return `sha256:${Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(byte=>byte.toString(16).padStart(2,'0')).join('')}`;
  };
  let selectorBindings:Record<string,unknown>|null=null;
  if(commandType==='studio.source-package.create')selectorBindings=payload.sourceMode==='manual_brief'
    ? {sourceMode:payload.sourceMode,artifactType:payload.artifactType,manualBriefDigest:await textDigest(payload.manualBrief)}
    : {sourceMode:payload.sourceMode,artifactType:payload.artifactType,studioInputBundleId:inputBundle?.id,studioInputBundleVersionId:inputBundle?.versionId,studioInputBundleVersion:inputBundle?.version};
  else if(commandType==='studio.handoff.request'){
    const targetBundle=payload.targetInputBundle&&typeof payload.targetInputBundle==='object'&&!Array.isArray(payload.targetInputBundle)
      ? payload.targetInputBundle as Record<string,unknown>:null;
    selectorBindings={upstreamHandoffId:payload.upstreamHandoffId,artifactType:payload.artifactType,
      targetInputBundleId:targetBundle?.id??null,targetInputBundleVersionId:targetBundle?.versionId??null,targetInputBundleVersion:targetBundle?.version??null};
  } else if(commandType==='studio.handoff.review.resolve'||commandType==='studio.handoff.approval.resolve')selectorBindings={
    handoffId:payload.handoffId,handoffVersion:payload.handoffVersion,outcome:payload.outcome,
    rationaleDigest:await digest(payload.rationale),conditionsDigest:await digest(payload.conditions??[]),
  };
  else if(commandType==='studio.handoff.consume')selectorBindings={handoffId:payload.handoffId,handoffVersion:payload.handoffVersion};
  else if(commandType==='studio.generation.request')selectorBindings={
    artifactId:payload.artifactId,sourcePackageId:payload.sourcePackageId,sourcePackageVersion:payload.sourcePackageVersion,
    templateKind:(payload.template as Record<string,unknown>)?.kind,templateId:(payload.template as Record<string,unknown>)?.templateId,
    templateVersionId:(payload.template as Record<string,unknown>)?.templateVersionId,templateVersion:(payload.template as Record<string,unknown>)?.version,
    templateHash:(payload.template as Record<string,unknown>)?.templateHash,expectedCurrentVersionId:payload.expectedCurrentVersionId,
    expectedApprovedVersionId:payload.expectedApprovedVersionId,
  };
  // Commands outside the controlled-human catalog retain their normal
  // production path. The exercise hook is additive and must never narrow the
  // established Studio command surface when the controlled runtime is off.
  if(commandType==='studio.source-package.create'&&payload.sourceMode==='direct_transcript_bundle')
    await prepareControlledHumanOfflineLineage(String(inputBundle?.id??''),Number(inputBundle?.version??-1));
  const controlledAction=commandType.startsWith('studio.handoff.')?commandType.replace(/^studio\./u,''):commandType;
  const anchor=selectorBindings?await beginControlledHumanCommand({action:controlledAction,targetFamily:target.family,targetId:target.id,expectedVersion:target.version,selectorBindings}):null;
  const envelope: StudioWorkspaceCommandEnvelope = { contractVersion: STUDIO_ARTIFACT_CONTRACT_VERSION, requestId: anchor?.requestId??crypto.randomUUID(), idempotencyKey:anchor?.businessIdempotencyKey??idempotencyKey, commandType, organizationId: context.organizationId, workspaceId: context.workspaceId, authorizationVersion: context.authorizationVersion, expectedAggregateVersion: expectedVersion, expectedArtifactVersion: createLike ? null : expectedVersion, payload };
  try { const result=decodeStudioCommandResponse(await transport.invokeWorkspace(envelope));if(anchor)await completeControlledHumanCommand(anchor);return result; } catch (error) { if (error instanceof StudioArtifactBoundaryError) throw error; throw decodeStudioSafeError(error); }
};
