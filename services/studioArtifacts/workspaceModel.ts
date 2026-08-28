import type { TenantContextProjection } from '../../types';
import type { StudioArtifactSectionDto, StudioCanonicalSourceAnchorDto, StudioSectionNonSourceLabel, StudioWorkspaceSelectedSourceDto } from './contracts';

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
