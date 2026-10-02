import type { TenantContextProjection } from '../../types.ts';
import type { StudioArtifactSectionDto, StudioCanonicalSourceAnchorDto, StudioSectionNonSourceLabel, StudioWorkspaceSelectedSourceDto } from './contracts.ts';

export interface StudioAuthorityTicket { readonly identity: string; readonly epoch: number }
export const studioAuthorityIdentity = (context: Pick<TenantContextProjection, 'organizationId' | 'workspaceId' | 'userId' | 'authorizationVersion'>) => (
  `${context.organizationId}:${context.workspaceId}:${context.userId}:${context.authorizationVersion}`
);

/**
 * Invalidates every asynchronous continuation when any authority-bearing
 * context field changes. The server remains authoritative; this only prevents
 * an older browser request from repopulating a newly authorized view.
 */
export class StudioAuthorityEpoch {
  private identity: string;
  private epoch = 0;

  constructor(context: Pick<TenantContextProjection, 'organizationId' | 'workspaceId' | 'userId' | 'authorizationVersion'>) {
    this.identity = studioAuthorityIdentity(context);
  }

  rebind(context: Pick<TenantContextProjection, 'organizationId' | 'workspaceId' | 'userId' | 'authorizationVersion'>): boolean {
    const next = studioAuthorityIdentity(context);
    if (next === this.identity) return false;
    this.identity = next;
    this.epoch += 1;
    return true;
  }

  issue(): StudioAuthorityTicket { return { identity: this.identity, epoch: this.epoch }; }
  accepts(ticket: StudioAuthorityTicket): boolean { return ticket.identity === this.identity && ticket.epoch === this.epoch; }
}

export type StudioInputMode = 'unconfigured' | 'direct_studio' | 'accepted_assess_handoff' | 'hybrid' | 'manual_brief';
export type StudioSuggestionStatus = 'accepted' | 'rejected' | 'unresolved';
export type StudioTemplateLifecycle = 'draft' | 'reviewer_ready' | 'in_review' | 'changes_requested' | 'rejected' | 'approval_ready' | 'approved' | 'deprecated' | 'replaced';
export type StudioHandoffState = 'eligible' | 'reviewer_ready' | 'changes_requested' | 'rejected' | 'approval_ready' | 'approved' | 'accepted' | 'consumed' | 'withdrawn' | 'stale' | 'expired';

export interface StudioSelectedSource {
  sourceId: string;
  sourceVersionId: string;
  version: number;
  label: string;
  family: 'assess' | 'studio';
  role: 'primary' | 'supporting' | 'contradictory' | 'reference';
  selected: boolean;
  suggestionStatus: StudioSuggestionStatus;
  citationCount: number;
  conflictCount: number;
}

export interface StudioSourceVersionOption {
  sourceId: string; sourceVersionId: string; version: number; label: string; sourceKind: string;
  mimeType: string; characterCount: number; createdAt: string;
}
export interface StudioSourceSetMember {
  sourceId: string; sourceVersionId: string; version: number; label: string; ordinal: number;
  role: 'primary' | 'supporting' | 'contradictory' | 'reference'; note: string | null;
}
export interface StudioSourceSetSummary {
  sourceSetId: string; currentVersionId: string; currentVersion: number; displayLabel: string;
  description: string | null; manifestHash: string; status: string; sourceCount: number;
  extractedCharacterCount: number; members: readonly StudioSourceSetMember[]; createdAt: string; updatedAt: string;
}
export interface StudioInputBundleSummary {
  inputBundleId: string; inputBundleVersionId: string; currentVersion: number; bundleHash: string; status: string;
  sourceSetVersions: readonly {sourceSetId:string;sourceSetVersionId:string;sourceSetVersion:number;manifestHash:string;ordinal:number;purpose:string}[];
  createdAt: string; updatedAt: string;
}
export interface StudioSourceAuthorityProjection {
  enabled: boolean; disabledReason: string | null; sourceVersions: readonly StudioSourceVersionOption[];
  sourceSets: readonly StudioSourceSetSummary[]; inputBundles: readonly StudioInputBundleSummary[];
}

export interface StudioSourceFlowSource {
  sourceId: string; versionSelector: string; displayName: string; versionLabel: string; mimeType: string;
  extractedCharacterCount: number; state: 'pending'|'ready'|'failed'|'deleted'; selectable: boolean;
  reuseState: 'unused'|'already_selected_elsewhere';
}
export interface StudioSourceFlowMember {
  sourceId: string; versionSelector: string; displayName: string; versionLabel: string; ordinal: number;
  role: 'primary'|'supporting'|'contradictory'|'reference'; note?: string; extractedCharacterCount: number;
  state: 'ready'|'failed'|'deleted'|'missing';
}
export interface StudioSourceFlowSet {
  id: string; versionSelector: string; version: number; ownerModule: 'studio'; label: string; description?: string;
  versionLabel: string; status: 'draft'|'locked'|'superseded'|'archived'; sourceCount: number;
  extractedCharacterCount: number; members: readonly StudioSourceFlowMember[]; lockState: 'ready'|'locked'|'blocked';
  blockers: readonly string[]; updatedAt: string;
}
export interface StudioSourceFlowBundle {
  id: string; versionSelector: string; version: number; ownerModule: 'studio'; label: string; versionLabel: string;
  status: 'draft'|'locked'|'superseded'; sourceSetIds: readonly string[];
  sourceSetVersions: readonly {sourceSetId:string;sourceSetVersionSelector:string;sourceSetVersion:number;ordinal:number}[];
  sourceVersionSelectors: readonly string[]; sourceCount: number; extractedCharacterCount: number; lockedAt?: string;
}
export interface StudioSourceFlowJob {
  id: string; inputBundleId: string; inputBundleVersionId: string; inputBundleVersion: number;
  status: 'requested'|'running'|'staged'|'succeeded'|'failed'|'uncertain'; candidateCount: number;
  bindingCount: number; createdAt: string; completedAt?: string;
}
export interface StudioSourceFlowCandidate {
  id: string; candidateVersion: number; inputBundleId: string; inputBundleVersionId: string; inputBundleVersion: number;
  extractionBindingId: string; extractionJobId: string; sourceSetId: string; sourceSetVersionId: string;
  sourceSetVersion: number; sourceId: string; sourceVersionId: string; sourceLabel: string; sourceVersionLabel: string;
  field: string; value: string; safeExcerpt?: string; sourceLocator: string; confidence: number;
  status: 'suggested'|'accepted'|'rejected'|'edited'; provenanceState: 'anchored'|'incomplete';
  reviewState: 'pending'|'reviewed_by_you'|'reviewed_by_another'; editCount: number; reviewedAt?: string;
}
export interface StudioSourceFlowProjection {
  featureState: {
    sourceMutationsEnabled: boolean;
    providerExtractionEnabled: boolean;
    reason?: 'disabled'|'read_only'|'provider_disabled'|'route_unavailable';
  };
  sources: readonly StudioSourceFlowSource[];
  sourceSets: readonly StudioSourceFlowSet[];
  inputBundles: readonly StudioSourceFlowBundle[];
  extractionJobs: readonly StudioSourceFlowJob[];
  candidates: readonly StudioSourceFlowCandidate[];
}

export const emptyStudioSourceFlowProjection = (): StudioSourceFlowProjection => ({
  featureState: { sourceMutationsEnabled: false, providerExtractionEnabled: false, reason: 'disabled' },
  sources: [],
  sourceSets: [],
  inputBundles: [],
  extractionJobs: [],
  candidates: [],
});

export interface StudioTemplateSummary {
  templateId: string;
  templateVersionId: string;
  version: string | number;
  name: string;
  artifactType: 'brd' | 'frd' | 'pdd' | 'custom';
  ownership: 'system' | 'tenant';
  lifecycle: StudioTemplateLifecycle;
  templateHash: string | null;
  immutable: boolean;
  replacementTemplateVersionId: string | null;
  actions: readonly string[];
}

export interface StudioHandoffSummary {
  kind: 'eligible' | 'persisted';
  handoffId: string | null;
  handoffVersionId: string | null;
  upstreamHandoffId: string;
  version: number | null;
  direction: 'inbox' | 'outbox';
  state: StudioHandoffState;
  status: string | null;
  sourceModule: 'assess';
  targetModule: 'studio';
  artifactType: 'brd' | 'frd' | 'pdd' | null;
  artifactTypes: readonly ('brd' | 'frd' | 'pdd')[];
  sourceVersion: number | null;
  resourceLabel: string;
  lineageLabel: 'assessed' | 'not_assessed' | 'mixed' | null;
  planningOnly: boolean | null;
  hasStudioTranscriptBundle: boolean | null;
  requestorLabel: string;
  targetWorkspaceLabel: string;
  requestedAt: string | null;
  updatedAt: string | null;
  handedOffAt: string | null;
  expiresAt: string | null;
  actions: readonly string[];
}

export interface StudioWorkspaceProjection {
  schemaVersion: 'studio-workspace-projection-1';
  organizationId: string;
  workspaceId: string;
  mode: StudioInputMode;
  sourcePackageId: string | null;
  sourcePackageVersionId: string | null;
  sourcePackageVersion: number | null;
  sourcePackageHash: string | null;
  inputBundleVersionId: string | null;
  inputBundleVersion: number | null;
  selectedSources: readonly StudioSelectedSource[];
  sourceAuthority: StudioSourceAuthorityProjection;
  totalSelectedSourceCount: number;
  sourcePage: number;
  sourcePageCount: number;
  template: StudioTemplateSummary | null;
  lineageLabel: 'assessed' | 'not_assessed' | 'mixed';
  planningOnly: boolean;
  citations: number;
  uncoveredSections: number;
  conflicts: number;
  blockers: readonly string[];
  provider: { available: boolean; label: string; functionalBounds: string };
  templates: readonly StudioTemplateSummary[];
  inbox: readonly StudioHandoffSummary[];
  outbox: readonly StudioHandoffSummary[];
  readOnly: boolean;
}

export class StudioWorkspaceProjectionError extends Error {
  readonly code = 'RESOURCE_NOT_AVAILABLE';
  constructor() { super('RESOURCE_NOT_AVAILABLE'); this.name = 'StudioWorkspaceProjectionError'; }
}

const fail = (): never => { throw new StudioWorkspaceProjectionError(); };
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail();
const exact = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) fail();
};
const uuid = (value: unknown): string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : fail();
const text = (value: unknown, max = 500): string => typeof value === 'string' && value.trim().length > 0 && Array.from(value).length <= max ? value : fail();
const bool = (value: unknown): boolean => typeof value === 'boolean' ? value : fail();
const integer = (value: unknown, min = 0): number => Number.isSafeInteger(value) && Number(value) >= min ? Number(value) : fail();
const hash = (value: unknown): string => typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value) ? value : fail();
const oneOf = <T extends string>(value: unknown, values: readonly T[]): T => typeof value === 'string' && values.includes(value as T) ? value as T : fail();
const optionalUuid = (value: unknown) => value === null ? null : uuid(value);
const optionalPositive = (value: unknown) => value === null ? null : integer(value, 1);
const optionalHash = (value: unknown) => value === null ? null : hash(value);
const strings = (value: unknown, limit = 50): readonly string[] => Array.isArray(value) && value.length <= limit ? value.map(item => text(item, 1_000)) : fail();
const allowed = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) => {
  const keys = Object.keys(value);
  if (required.some(key => !(key in value)) || keys.some(key => !required.includes(key) && !optional.includes(key))) fail();
};
const decimal = (value: unknown, minimum: number, maximum: number): number => typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum ? value : fail();

const sourceFlowRootKeys = ['featureState','sources','sourceSets','inputBundles','extractionJobs','candidates'] as const;
const sourceFlowFeatureKeys = ['sourceMutationsEnabled','providerExtractionEnabled'] as const;
const sourceFlowSourceKeys = ['sourceId','versionSelector','displayName','versionLabel','mimeType','extractedCharacterCount','state','selectable','reuseState'] as const;
const sourceFlowSetKeys = ['id','versionSelector','version','ownerModule','label','versionLabel','status','sourceCount','extractedCharacterCount','members','lockState','blockers','updatedAt'] as const;
const sourceFlowMemberKeys = ['sourceId','versionSelector','displayName','versionLabel','ordinal','role','extractedCharacterCount','state'] as const;
const sourceFlowBundleKeys = ['id','versionSelector','version','ownerModule','label','versionLabel','status','sourceSetIds','sourceSetVersions','sourceVersionSelectors','sourceCount','extractedCharacterCount'] as const;
const sourceFlowBundleSetKeys = ['sourceSetId','sourceSetVersionSelector','sourceSetVersion','ordinal'] as const;
const sourceFlowJobKeys = ['id','inputBundleId','inputBundleVersionId','inputBundleVersion','status','candidateCount','bindingCount','createdAt'] as const;
const sourceFlowCandidateKeys = ['id','candidateVersion','inputBundleId','inputBundleVersionId','inputBundleVersion','extractionBindingId','extractionJobId','sourceSetId','sourceSetVersionId','sourceSetVersion','sourceId','sourceVersionId','sourceLabel','sourceVersionLabel','field','value','sourceLocator','confidence','status','provenanceState','reviewState','editCount'] as const;

export const decodeStudioSourceFlowProjection = (value: unknown): StudioSourceFlowProjection => {
  const root=record(value);exact(root,sourceFlowRootKeys);
  const feature=record(root.featureState);allowed(feature,sourceFlowFeatureKeys,['reason']);
  const sourceMutationsEnabled=bool(feature.sourceMutationsEnabled),providerExtractionEnabled=bool(feature.providerExtractionEnabled);
  const reason=feature.reason===undefined?undefined:oneOf(feature.reason,['disabled','read_only','provider_disabled','route_unavailable'] as const);
  if(sourceMutationsEnabled&&reason==='disabled')fail();
  if(providerExtractionEnabled&&(reason==='provider_disabled'||reason==='route_unavailable'))fail();
  const sources=Array.isArray(root.sources)&&root.sources.length<=2000?root.sources.map(value=>{const item=record(value);exact(item,sourceFlowSourceKeys);return{sourceId:uuid(item.sourceId),versionSelector:uuid(item.versionSelector),displayName:text(item.displayName,240),versionLabel:text(item.versionLabel,120),mimeType:text(item.mimeType,160),extractedCharacterCount:integer(item.extractedCharacterCount),state:oneOf(item.state,['pending','ready','failed','deleted'] as const),selectable:bool(item.selectable),reuseState:oneOf(item.reuseState,['unused','already_selected_elsewhere'] as const)};}):fail();
  const sourceByVersion=new Map(sources.map(source=>[source.versionSelector,source]));if(sourceByVersion.size!==sources.length)fail();
  const sourceSets=Array.isArray(root.sourceSets)&&root.sourceSets.length<=400?root.sourceSets.map(value=>{const item=record(value);allowed(item,sourceFlowSetKeys,['description']);const members=Array.isArray(item.members)&&item.members.length>=1&&item.members.length<=20?item.members.map((value,index)=>{const member=record(value);allowed(member,sourceFlowMemberKeys,['note']);const ordinal=integer(member.ordinal,1);if(ordinal!==index+1)fail();const versionSelector=uuid(member.versionSelector),sourceId=uuid(member.sourceId),source=sourceByVersion.get(versionSelector);if(!source||source.sourceId!==sourceId)fail();return{sourceId,versionSelector,displayName:text(member.displayName,240),versionLabel:text(member.versionLabel,120),ordinal,role:oneOf(member.role,['primary','supporting','contradictory','reference'] as const),...(member.note===undefined?{}:{note:text(member.note,500)}),extractedCharacterCount:integer(member.extractedCharacterCount),state:oneOf(member.state,['ready','failed','deleted','missing'] as const)};}):fail();const sourceCount=integer(item.sourceCount,1);if(sourceCount!==members.length||new Set(members.map(member=>member.versionSelector)).size!==members.length)fail();return{id:uuid(item.id),versionSelector:uuid(item.versionSelector),version:integer(item.version,1),ownerModule:oneOf(item.ownerModule,['studio'] as const),label:text(item.label,240),...(item.description===undefined?{}:{description:text(item.description,1000)}),versionLabel:text(item.versionLabel,120),status:oneOf(item.status,['draft','locked','superseded','archived'] as const),sourceCount,extractedCharacterCount:integer(item.extractedCharacterCount),members,lockState:oneOf(item.lockState,['ready','locked','blocked'] as const),blockers:strings(item.blockers,50),updatedAt:date(item.updatedAt)};}):fail();
  const setByVersion=new Map(sourceSets.map(set=>[set.versionSelector,set]));if(setByVersion.size!==sourceSets.length)fail();
  const inputBundles=Array.isArray(root.inputBundles)&&root.inputBundles.length<=400?root.inputBundles.map(value=>{const item=record(value);allowed(item,sourceFlowBundleKeys,['lockedAt']);const sourceSetIds=Array.isArray(item.sourceSetIds)&&item.sourceSetIds.length>=1&&item.sourceSetIds.length<=20?item.sourceSetIds.map(uuid):fail();const sourceSetVersions=Array.isArray(item.sourceSetVersions)&&item.sourceSetVersions.length===sourceSetIds.length?item.sourceSetVersions.map((value,index)=>{const set=record(value);exact(set,sourceFlowBundleSetKeys);const ordinal=integer(set.ordinal,1),sourceSetId=uuid(set.sourceSetId),sourceSetVersionSelector=uuid(set.sourceSetVersionSelector),projected=setByVersion.get(sourceSetVersionSelector);if(ordinal!==index+1||sourceSetIds[index]!==sourceSetId||(projected&&(projected.id!==sourceSetId||projected.version!==integer(set.sourceSetVersion,1))))fail();return{sourceSetId,sourceSetVersionSelector,sourceSetVersion:integer(set.sourceSetVersion,1),ordinal};}):fail();const sourceVersionSelectors=Array.isArray(item.sourceVersionSelectors)&&item.sourceVersionSelectors.length>=1&&item.sourceVersionSelectors.length<=20?item.sourceVersionSelectors.map(uuid):fail();const sourceCount=integer(item.sourceCount,1);if(new Set(sourceSetIds).size!==sourceSetIds.length||new Set(sourceVersionSelectors).size!==sourceVersionSelectors.length||sourceCount!==sourceVersionSelectors.length)fail();return{id:uuid(item.id),versionSelector:uuid(item.versionSelector),version:integer(item.version,1),ownerModule:oneOf(item.ownerModule,['studio'] as const),label:text(item.label,240),versionLabel:text(item.versionLabel,120),status:oneOf(item.status,['draft','locked','superseded'] as const),sourceSetIds,sourceSetVersions,sourceVersionSelectors,sourceCount,extractedCharacterCount:integer(item.extractedCharacterCount),...(item.lockedAt===undefined?{}:{lockedAt:date(item.lockedAt)})};}):fail();
  const bundleByVersion=new Map(inputBundles.map(bundle=>[bundle.versionSelector,bundle]));if(bundleByVersion.size!==inputBundles.length)fail();
  const extractionJobs=Array.isArray(root.extractionJobs)&&root.extractionJobs.length<=400?root.extractionJobs.map(value=>{const item=record(value);allowed(item,sourceFlowJobKeys,['completedAt']);const inputBundleId=uuid(item.inputBundleId),inputBundleVersionId=uuid(item.inputBundleVersionId),inputBundleVersion=integer(item.inputBundleVersion,1),bundle=bundleByVersion.get(inputBundleVersionId);if(!bundle||bundle.id!==inputBundleId||bundle.version!==inputBundleVersion)fail();return{id:uuid(item.id),inputBundleId,inputBundleVersionId,inputBundleVersion,status:oneOf(item.status,['requested','running','staged','succeeded','failed','uncertain'] as const),candidateCount:integer(item.candidateCount),bindingCount:integer(item.bindingCount),createdAt:date(item.createdAt),...(item.completedAt===undefined?{}:{completedAt:date(item.completedAt)})};}):fail();
  const jobById=new Map(extractionJobs.map(job=>[job.id,job]));if(jobById.size!==extractionJobs.length)fail();
  const candidates=Array.isArray(root.candidates)&&root.candidates.length<=2000?root.candidates.map(value=>{const item=record(value);allowed(item,sourceFlowCandidateKeys,['safeExcerpt','reviewedAt']);const inputBundleId=uuid(item.inputBundleId),inputBundleVersionId=uuid(item.inputBundleVersionId),inputBundleVersion=integer(item.inputBundleVersion,1),extractionJobId=uuid(item.extractionJobId),job=jobById.get(extractionJobId),bundle=bundleByVersion.get(inputBundleVersionId);if(!job||!bundle||job.inputBundleId!==inputBundleId||job.inputBundleVersionId!==inputBundleVersionId||job.inputBundleVersion!==inputBundleVersion)fail();const sourceSetId=uuid(item.sourceSetId),sourceSetVersionId=uuid(item.sourceSetVersionId),sourceSetVersion=integer(item.sourceSetVersion,1),sourceId=uuid(item.sourceId),sourceVersionId=uuid(item.sourceVersionId),set=setByVersion.get(sourceSetVersionId);if(!set||set.id!==sourceSetId||set.version!==sourceSetVersion||!bundle.sourceSetVersions.some(binding=>binding.sourceSetId===sourceSetId&&binding.sourceSetVersionSelector===sourceSetVersionId&&binding.sourceSetVersion===sourceSetVersion)||!bundle.sourceVersionSelectors.includes(sourceVersionId)||!set.members.some(member=>member.sourceId===sourceId&&member.versionSelector===sourceVersionId))fail();const status=oneOf(item.status,['suggested','accepted','rejected','edited'] as const),reviewState=oneOf(item.reviewState,['pending','reviewed_by_you','reviewed_by_another'] as const);if((status==='suggested')!==(reviewState==='pending')||(status==='suggested')!==(item.reviewedAt===undefined))fail();return{id:uuid(item.id),candidateVersion:integer(item.candidateVersion,1),inputBundleId,inputBundleVersionId,inputBundleVersion,extractionBindingId:uuid(item.extractionBindingId),extractionJobId,sourceSetId,sourceSetVersionId,sourceSetVersion,sourceId,sourceVersionId,sourceLabel:text(item.sourceLabel,240),sourceVersionLabel:text(item.sourceVersionLabel,120),field:text(item.field,240),value:text(item.value,12000),...(item.safeExcerpt===undefined?{}:{safeExcerpt:text(item.safeExcerpt,500)}),sourceLocator:text(item.sourceLocator,500),confidence:decimal(item.confidence,0,1),status,provenanceState:oneOf(item.provenanceState,['anchored','incomplete'] as const),reviewState,editCount:integer(item.editCount),...(item.reviewedAt===undefined?{}:{reviewedAt:date(item.reviewedAt)})};}):fail();
  if(new Set(candidates.map(candidate=>candidate.id)).size!==candidates.length)fail();
  return{featureState:{sourceMutationsEnabled,providerExtractionEnabled,...(reason?{reason}:{})},sources,sourceSets,inputBundles,extractionJobs,candidates};
};

export const studioDirectPackageEligibility = (projection: StudioSourceFlowProjection, inputBundleVersionId: string) => {
  const bundle=projection.inputBundles.find(item=>item.versionSelector===inputBundleVersionId&&item.status==='locked');
  if(!bundle)return{eligible:false,message:'Select an exact locked Studio bundle.'};
  const jobs=projection.extractionJobs.filter(job=>job.inputBundleId===bundle.id&&job.inputBundleVersionId===bundle.versionSelector&&job.inputBundleVersion===bundle.version)
    .sort((left,right)=>Date.parse(right.createdAt)-Date.parse(left.createdAt));
  if(!jobs.length)return{eligible:false,message:'Run governed Studio extraction for this exact bundle.'};
  const candidatesFor=(job:StudioSourceFlowJob)=>projection.candidates.filter(candidate=>
    candidate.extractionJobId===job.id
    && candidate.inputBundleId===bundle.id
    && candidate.inputBundleVersionId===bundle.versionSelector
    && candidate.inputBundleVersion===bundle.version
    && bundle.sourceVersionSelectors.includes(candidate.sourceVersionId));
  const coverageFor=(job:StudioSourceFlowJob)=>{
    const candidates=candidatesFor(job);
    if(candidates.length!==job.candidateCount||job.bindingCount!==bundle.sourceCount)return{complete:false,candidates,missing:bundle.sourceVersionSelectors};
    if(candidates.some(candidate=>candidate.status==='suggested'||candidate.reviewState==='pending'))return{complete:false,candidates,missing:bundle.sourceVersionSelectors};
    const covered=new Set(candidates.filter(candidate=>['accepted','edited'].includes(candidate.status)&&candidate.provenanceState==='anchored').map(candidate=>candidate.sourceVersionId));
    const missing=bundle.sourceVersionSelectors.filter(sourceVersionId=>!covered.has(sourceVersionId));
    return{complete:missing.length===0,candidates,missing};
  };
  const acceptedJob=jobs.find(job=>job.status==='succeeded'&&coverageFor(job).complete);
  if(acceptedJob)return{eligible:true,message:'Every exact selected source has reviewed, accepted grounded coverage.'};
  const job=jobs[0];
  if(job.status==='uncertain')return{eligible:false,message:'Extraction outcome is uncertain. Reload and reconcile before continuing.'};
  if(job.status!=='succeeded')return{eligible:false,message:`Extraction is ${job.status}. A direct package is not yet eligible.`};
  const result=coverageFor(job);
  if(result.candidates.length!==job.candidateCount||job.bindingCount!==bundle.sourceCount)return{eligible:false,message:'The exact extraction projection is incomplete. Reload committed state.'};
  if(result.candidates.some(candidate=>candidate.status==='suggested'||candidate.reviewState==='pending'))return{eligible:false,message:'Review every grounded candidate before creating the package.'};
  return{eligible:false,message:`Accepted grounded coverage is missing for ${result.missing.length} selected source${result.missing.length===1?'':'s'}.`};
};

const sourceKeys = ['sourceId','sourceVersionId','version','label','family','role','selected','suggestionStatus','citationCount','conflictCount'] as const;
const decodeSource = (value: unknown): StudioSelectedSource => {
  const item = record(value); exact(item, sourceKeys);
  return { sourceId: uuid(item.sourceId), sourceVersionId: uuid(item.sourceVersionId), version: integer(item.version, 1), label: text(item.label, 240), family: oneOf(item.family, ['assess','studio']), role: oneOf(item.role, ['primary','supporting','contradictory','reference']), selected: bool(item.selected), suggestionStatus: oneOf(item.suggestionStatus, ['accepted','rejected','unresolved']), citationCount: integer(item.citationCount), conflictCount: integer(item.conflictCount) };
};

const date = (value: unknown): string => { const result=text(value,64); if(Number.isNaN(Date.parse(result)))fail(); return result; };
const sourceAuthorityKeys=['enabled','disabledReason','sourceVersions','sourceSets','inputBundles'] as const;
const sourceVersionKeys=['sourceId','sourceVersionId','version','label','sourceKind','mimeType','characterCount','createdAt'] as const;
const sourceSetKeys=['sourceSetId','currentVersionId','currentVersion','displayLabel','description','manifestHash','status','sourceCount','extractedCharacterCount','members','createdAt','updatedAt'] as const;
const sourceSetMemberKeys=['sourceId','sourceVersionId','version','label','ordinal','role','note'] as const;
const inputBundleKeys=['inputBundleId','inputBundleVersionId','currentVersion','bundleHash','status','sourceSetVersions','createdAt','updatedAt'] as const;
const bundleSetKeys=['sourceSetId','sourceSetVersionId','sourceSetVersion','manifestHash','ordinal','purpose'] as const;
const decodeSourceAuthority=(value:unknown):StudioSourceAuthorityProjection=>{const item=record(value);exact(item,sourceAuthorityKeys);const sourceVersions=Array.isArray(item.sourceVersions)&&item.sourceVersions.length<=200?item.sourceVersions.map(value=>{const source=record(value);exact(source,sourceVersionKeys);return{sourceId:uuid(source.sourceId),sourceVersionId:uuid(source.sourceVersionId),version:integer(source.version,1),label:text(source.label,240),sourceKind:text(source.sourceKind,80),mimeType:text(source.mimeType,160),characterCount:integer(source.characterCount,1),createdAt:date(source.createdAt)};}):fail();const sourceSets=Array.isArray(item.sourceSets)&&item.sourceSets.length<=100?item.sourceSets.map(value=>{const set=record(value);exact(set,sourceSetKeys);const members=Array.isArray(set.members)&&set.members.length<=20?set.members.map((value,index)=>{const member=record(value);exact(member,sourceSetMemberKeys);const ordinal=integer(member.ordinal,1);if(ordinal!==index+1)fail();return{sourceId:uuid(member.sourceId),sourceVersionId:uuid(member.sourceVersionId),version:integer(member.version,1),label:text(member.label,240),ordinal,role:oneOf(member.role,['primary','supporting','contradictory','reference'] as const),note:member.note===null?null:text(member.note,500)};}):fail();return{sourceSetId:uuid(set.sourceSetId),currentVersionId:uuid(set.currentVersionId),currentVersion:integer(set.currentVersion,1),displayLabel:text(set.displayLabel,240),description:set.description===null?null:text(set.description,1000),manifestHash:hash(set.manifestHash),status:text(set.status,80),sourceCount:integer(set.sourceCount,1),extractedCharacterCount:integer(set.extractedCharacterCount,1),members,createdAt:date(set.createdAt),updatedAt:date(set.updatedAt)};}):fail();const inputBundles=Array.isArray(item.inputBundles)&&item.inputBundles.length<=100?item.inputBundles.map(value=>{const bundle=record(value);exact(bundle,inputBundleKeys);const sourceSetVersions=Array.isArray(bundle.sourceSetVersions)&&bundle.sourceSetVersions.length<=20?bundle.sourceSetVersions.map((value,index)=>{const set=record(value);exact(set,bundleSetKeys);const ordinal=integer(set.ordinal,1);if(ordinal!==index+1)fail();return{sourceSetId:uuid(set.sourceSetId),sourceSetVersionId:uuid(set.sourceSetVersionId),sourceSetVersion:integer(set.sourceSetVersion,1),manifestHash:hash(set.manifestHash),ordinal,purpose:text(set.purpose,500)};}):fail();return{inputBundleId:uuid(bundle.inputBundleId),inputBundleVersionId:uuid(bundle.inputBundleVersionId),currentVersion:integer(bundle.currentVersion,1),bundleHash:hash(bundle.bundleHash),status:text(bundle.status,80),sourceSetVersions,createdAt:date(bundle.createdAt),updatedAt:date(bundle.updatedAt)};}):fail();return{enabled:bool(item.enabled),disabledReason:item.disabledReason===null?null:text(item.disabledReason,500),sourceVersions,sourceSets,inputBundles};};

const templateKeys = ['templateId','templateVersionId','version','name','artifactType','ownership','lifecycle','templateHash','immutable','replacementTemplateVersionId','actions'] as const;
const decodeTemplate = (value: unknown): StudioTemplateSummary => {
  const item = record(value); exact(item, templateKeys);
  const ownership = oneOf(item.ownership, ['system','tenant']);
  const version = ownership === 'system' ? text(item.version, 120) : integer(item.version, 1);
  const lifecycle = oneOf(item.lifecycle, ['draft','reviewer_ready','in_review','changes_requested','rejected','approval_ready','approved','deprecated','replaced']);
  const immutable = bool(item.immutable);
  if ((lifecycle === 'approved' || lifecycle === 'deprecated' || lifecycle === 'replaced') && !immutable) fail();
  if (ownership === 'system' && (lifecycle !== 'approved' || !immutable)) fail();
  return { templateId: uuid(item.templateId), templateVersionId: uuid(item.templateVersionId), version, name: text(item.name, 240), artifactType: oneOf(item.artifactType, ['brd','frd','pdd','custom']), ownership, lifecycle, templateHash: item.templateHash === null ? null : hash(item.templateHash), immutable, replacementTemplateVersionId: optionalUuid(item.replacementTemplateVersionId), actions: strings(item.actions, 20) };
};

const handoffKeys = ['kind','handoffId','handoffVersionId','upstreamHandoffId','version','direction','state','status','sourceModule','targetModule','artifactType','artifactTypes','sourceVersion','resourceLabel','lineageLabel','planningOnly','hasStudioTranscriptBundle','requestorLabel','targetWorkspaceLabel','requestedAt','updatedAt','handedOffAt','expiresAt','actions'] as const;
const handoffActions = ['studio.handoff.request','studio.handoff.review.resolve','studio.handoff.approval.resolve','studio.handoff.withdraw','studio.handoff.consume'] as const;
const optionalDate = (value: unknown): string | null => { if (value === null) return null; const result=text(value,64); if (Number.isNaN(Date.parse(result))) fail(); return result; };
const decodeHandoff = (value: unknown): StudioHandoffSummary => {
  const item = record(value); exact(item, handoffKeys);
  const kind=oneOf(item.kind,['eligible','persisted']);
  const handoffId=item.handoffId===null?null:uuid(item.handoffId),handoffVersionId=item.handoffVersionId===null?null:uuid(item.handoffVersionId),version=item.version===null?null:integer(item.version,1);
  const state=oneOf(item.state,['eligible','reviewer_ready','changes_requested','rejected','approval_ready','approved','accepted','consumed','withdrawn','stale','expired']);
  const artifactType=item.artifactType===null?null:oneOf(item.artifactType,['brd','frd','pdd']);
  const artifactTypes=Array.isArray(item.artifactTypes)&&item.artifactTypes.length<=3?item.artifactTypes.map(value=>oneOf(value,['brd','frd','pdd'] as const)):fail();
  const actions=strings(item.actions,10).map(action=>handoffActions.includes(action as typeof handoffActions[number])?action:fail()).sort();
  const lineageLabel=item.lineageLabel===null?null:oneOf(item.lineageLabel,['assessed','not_assessed','mixed']);
  const planningOnly=item.planningOnly===null?null:bool(item.planningOnly),hasStudioTranscriptBundle=item.hasStudioTranscriptBundle===null?null:bool(item.hasStudioTranscriptBundle),sourceVersion=item.sourceVersion===null?null:integer(item.sourceVersion,1);
  if(kind==='eligible'&&(handoffId!==null||handoffVersionId!==null||version!==null||state!=='eligible'||artifactType!==null||lineageLabel!==null||planningOnly!==null||hasStudioTranscriptBundle!==null||sourceVersion===null))fail();
  if(kind==='persisted'&&(handoffId===null||handoffVersionId===null||version===null||state==='eligible'||artifactType===null||lineageLabel===null||planningOnly===null||hasStudioTranscriptBundle===null||sourceVersion!==null||artifactTypes.length!==0))fail();
  return {kind,handoffId,handoffVersionId,upstreamHandoffId:uuid(item.upstreamHandoffId),version,direction:oneOf(item.direction,['inbox','outbox']),state,status:item.status===null?null:text(item.status,80),sourceModule:oneOf(item.sourceModule,['assess']),targetModule:oneOf(item.targetModule,['studio']),artifactType,artifactTypes,sourceVersion,resourceLabel:text(item.resourceLabel,240),lineageLabel,planningOnly,hasStudioTranscriptBundle,requestorLabel:text(item.requestorLabel,240),targetWorkspaceLabel:text(item.targetWorkspaceLabel,240),requestedAt:optionalDate(item.requestedAt),updatedAt:optionalDate(item.updatedAt),handedOffAt:optionalDate(item.handedOffAt),expiresAt:optionalDate(item.expiresAt),actions};
};

const workspaceKeys = ['schemaVersion','organizationId','workspaceId','mode','sourcePackageId','sourcePackageVersionId','sourcePackageVersion','sourcePackageHash','inputBundleVersionId','inputBundleVersion','selectedSources','sourceAuthority','totalSelectedSourceCount','sourcePage','sourcePageCount','template','lineageLabel','planningOnly','citations','uncoveredSections','conflicts','blockers','provider','templates','inbox','outbox','readOnly'] as const;
export const decodeStudioWorkspaceProjection = (value: unknown, context: Pick<TenantContextProjection, 'organizationId' | 'workspaceId'>): StudioWorkspaceProjection => {
  const item = record(value); exact(item, workspaceKeys);
  if (item.schemaVersion !== 'studio-workspace-projection-1' || uuid(item.organizationId) !== context.organizationId || uuid(item.workspaceId) !== context.workspaceId) fail();
  const mode = oneOf(item.mode, ['unconfigured','direct_studio','accepted_assess_handoff','hybrid','manual_brief']);
  const sourcePackageId = optionalUuid(item.sourcePackageId), sourcePackageVersionId = optionalUuid(item.sourcePackageVersionId), sourcePackageVersion = optionalPositive(item.sourcePackageVersion), sourcePackageHash = optionalHash(item.sourcePackageHash);
  const inputBundleVersionId = optionalUuid(item.inputBundleVersionId), inputBundleVersion = optionalPositive(item.inputBundleVersion);
  const lineageLabel = oneOf(item.lineageLabel, ['assessed','not_assessed','mixed']);
  const planningOnly = bool(item.planningOnly);
  if ((sourcePackageId === null) !== (sourcePackageVersionId === null) || (sourcePackageVersionId === null) !== (sourcePackageVersion === null) || (sourcePackageVersion === null) !== (sourcePackageHash === null)) fail();
  if ((inputBundleVersionId === null) !== (inputBundleVersion === null)) fail();
  if ((mode === 'direct_studio' || mode === 'manual_brief') && (!planningOnly || lineageLabel !== 'not_assessed')) fail();
  if(mode==='unconfigured'&&(planningOnly||lineageLabel!=='not_assessed'))fail();
  const selectedSources = Array.isArray(item.selectedSources) && item.selectedSources.length <= 50 ? item.selectedSources.map(decodeSource) : fail();
  if (selectedSources.some(source => !source.selected)) fail();
  const providerValue = record(item.provider); exact(providerValue, ['available','label','functionalBounds']);
  const templates = Array.isArray(item.templates) && item.templates.length <= 100 ? item.templates.map(decodeTemplate) : fail();
  const inbox = Array.isArray(item.inbox) && item.inbox.length <= 50 ? item.inbox.map(decodeHandoff) : fail();
  const outbox = Array.isArray(item.outbox) && item.outbox.length <= 50 ? item.outbox.map(decodeHandoff) : fail();
  if (inbox.some(item => item.direction !== 'inbox') || outbox.some(item => item.direction !== 'outbox')) fail();
  return { schemaVersion: 'studio-workspace-projection-1', organizationId: context.organizationId, workspaceId: context.workspaceId, mode, sourcePackageId, sourcePackageVersionId, sourcePackageVersion, sourcePackageHash, inputBundleVersionId, inputBundleVersion, selectedSources, sourceAuthority:decodeSourceAuthority(item.sourceAuthority), totalSelectedSourceCount: integer(item.totalSelectedSourceCount), sourcePage: integer(item.sourcePage, 1), sourcePageCount: integer(item.sourcePageCount, 1), template: item.template === null ? null : decodeTemplate(item.template), lineageLabel, planningOnly, citations: integer(item.citations), uncoveredSections: integer(item.uncoveredSections), conflicts: integer(item.conflicts), blockers: strings(item.blockers), provider: { available: bool(providerValue.available), label: text(providerValue.label, 240), functionalBounds: text(providerValue.functionalBounds, 500) }, templates, inbox, outbox, readOnly: bool(item.readOnly) };
};

export interface StructuredStudioSection {
  id: string;
  title: string;
  body: string;
  sourceAnchors: StudioDisplaySourceAnchor[];
  labels: StudioSectionNonSourceLabel[];
}

export interface StudioDisplaySourceAnchor extends StudioCanonicalSourceAnchorDto {
  sourceLabel: string;
  sourceVersion: number | null;
}

const safeLabels = (value: unknown): StudioSectionNonSourceLabel[] => Array.isArray(value)
  ? value.filter((entry): entry is StudioSectionNonSourceLabel => ['human_authored', 'template_required', 'assumption'].includes(String(entry))).slice(0, 3)
  : [];
const safeAnchors = (value: unknown): StudioCanonicalSourceAnchorDto[] => Array.isArray(value)
  ? value.flatMap(entry => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    return typeof item.sourceVersionId === 'string' && typeof item.locator === 'string' && typeof item.anchorHash === 'string'
      ? [{ sourceVersionId: item.sourceVersionId, locator: item.locator, anchorHash: item.anchorHash }]
      : [];
  }).slice(0, 200)
  : [];
const enrichAnchors = (anchors: readonly StudioCanonicalSourceAnchorDto[], selectedSources: readonly StudioWorkspaceSelectedSourceDto[] = []): StudioDisplaySourceAnchor[] => {
  const sources=new Map(selectedSources.map(source=>[source.sourceVersionId,source]));
  return anchors.map(anchor=>{const source=sources.get(anchor.sourceVersionId);return{...anchor,sourceLabel:source?.label??`Exact source ${anchor.sourceVersionId}`,sourceVersion:source?.sourceVersion??null};});
};
export const contentToStructuredSections = (
  content: Record<string, unknown>,
  projectedSections?: readonly StudioArtifactSectionDto[],
  selectedSources?: readonly StudioWorkspaceSelectedSourceDto[],
): StructuredStudioSection[] => {
  if (projectedSections?.length) return projectedSections.map(section => ({
    id: section.id,
    title: section.title,
    body: section.body,
    sourceAnchors: enrichAnchors(section.sourceAnchors, selectedSources),
    labels: [...section.labels],
  }));
  const rawSections = Array.isArray(content.sections) ? content.sections.slice(0, 100) : [];
  const sections = rawSections.map((value, index) => {
    const item = value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const title = typeof item.title === 'string' ? item.title : `Section ${index + 1}`;
    const body = typeof item.body === 'string' ? item.body : typeof item.content === 'string' ? item.content : '';
    const sourceAnchors = enrichAnchors(safeAnchors(item.sourceAnchors), selectedSources);
    const labels = safeLabels(item.labels);
    return {
      id: typeof item.id === 'string' && item.id ? item.id : `section-${index + 1}`,
      title,
      body,
      sourceAnchors,
      labels: sourceAnchors.length || labels.length ? labels : ['human_authored'] as StudioSectionNonSourceLabel[],
    };
  });
  if (sections.length > 0) return sections;
  return [{ id: 'section-1', title: typeof content.title === 'string' ? content.title : 'Document overview', body: typeof content.body === 'string' ? content.body : '', sourceAnchors: [], labels: ['human_authored'] }];
};

export const structuredSectionsToContent = (prior: Record<string, unknown>, sections: readonly StructuredStudioSection[]) => ({
  ...prior,
  title: sections[0]?.title || 'Untitled document',
  sections: sections.map(section => ({
    id: section.id,
    title: section.title.trim(),
    body: section.body,
    // Labels and source-version numbers are presentation enrichment from the
    // tenant-safe workspace projection. Persist only the provider/schema
    // contract's exact three-key anchor so a human revision cannot write
    // browser-enriched metadata back into canonical JSON.
    sourceAnchors: section.sourceAnchors.map((anchor): StudioCanonicalSourceAnchorDto => ({
      sourceVersionId: anchor.sourceVersionId,
      locator: anchor.locator,
      anchorHash: anchor.anchorHash,
    })),
    labels: [...section.labels],
  })),
});
