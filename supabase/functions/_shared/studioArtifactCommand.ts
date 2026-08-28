import {
  LEGACY_STUDIO_ARTIFACT_CONTRACT_VERSION,
  STUDIO_ARTIFACT_CONTRACT_VERSION,
  STUDIO_ARTIFACT_TYPES,
  STUDIO_COMMAND_TYPES,
  STUDIO_GOVERNED_COMMAND_TYPES,
  STUDIO_TEMPLATE_ARTIFACT_CLASSES,
  type StudioArtifactContractVersion,
  type StudioArtifactType,
  type StudioCommandEnvelope,
  type StudioConditions,
  type StudioServerCommandType,
  type StudioTemplateSectionDefinition,
} from '../../../services/studioArtifacts/contracts.ts';

export type JsonObject = Record<string, unknown>;
export type StudioArtifactAuthority = Readonly<{
  actorId: string;
  authorizationVersion: number;
  capabilities: readonly string[];
  roleNames?: readonly string[];
}>;
export type StudioArtifactAtomicCommand = StudioCommandEnvelope<JsonObject, StudioServerCommandType> & { actorId: string };
export type StudioAtomicCommandResult = {
  outcome: 'committed' | 'replayed' | 'command_in_progress';
  receiptId: string;
  resourceId: string;
  resource: JsonObject;
  generationClaim?: JsonObject;
};

export const STUDIO_SAFE_ERROR_CODES = [
  'RESOURCE_NOT_AVAILABLE', 'AUTHORITY_STALE', 'PERMISSION_DENIED', 'VERSION_CONFLICT',
  'IDEMPOTENCY_CONFLICT', 'SEPARATION_OF_DUTY', 'FEATURE_DISABLED', 'READ_ONLY',
  'INVALID_COMMAND', 'GENERATION_FAILED', 'COMMAND_UNAVAILABLE', 'RESOURCE_STALE',
  'SOURCE_COVERAGE_INCOMPLETE', 'MODULE_ROUTE_NOT_ALLOWED', 'HANDOFF_NOT_ELIGIBLE',
  'HANDOFF_STALE', 'HANDOFF_EXPIRED', 'TEMPLATE_NOT_APPROVED', 'PROVIDER_ROUTE_UNAVAILABLE',
  'BUDGET_EXHAUSTED', 'COMMAND_IN_PROGRESS', 'RECEIPT_FINALIZATION_FAILED',
] as const;
export type StudioArtifactDomainErrorCode = typeof STUDIO_SAFE_ERROR_CODES[number];
export type StudioArtifactErrorCode = 'METHOD_NOT_ALLOWED' | 'AUTHENTICATION_REQUIRED' | 'COMMAND_NOT_SUPPORTED' | StudioArtifactDomainErrorCode;
const statuses: Record<StudioArtifactErrorCode, number> = {
  METHOD_NOT_ALLOWED: 405, AUTHENTICATION_REQUIRED: 401, INVALID_COMMAND: 400, COMMAND_NOT_SUPPORTED: 400,
  RESOURCE_NOT_AVAILABLE: 404, AUTHORITY_STALE: 409, PERMISSION_DENIED: 403, VERSION_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409, SEPARATION_OF_DUTY: 409, FEATURE_DISABLED: 503, READ_ONLY: 503,
  GENERATION_FAILED: 502, COMMAND_UNAVAILABLE: 503, RESOURCE_STALE: 409, SOURCE_COVERAGE_INCOMPLETE: 422,
  MODULE_ROUTE_NOT_ALLOWED: 403, HANDOFF_NOT_ELIGIBLE: 409, HANDOFF_STALE: 409, HANDOFF_EXPIRED: 409,
  TEMPLATE_NOT_APPROVED: 409,
  PROVIDER_ROUTE_UNAVAILABLE: 503, BUDGET_EXHAUSTED: 429, COMMAND_IN_PROGRESS: 409,
  RECEIPT_FINALIZATION_FAILED: 503,
};
export class StudioArtifactError extends Error {
  constructor(public readonly code: StudioArtifactErrorCode) { super(code); this.name = 'StudioArtifactError'; }
  get status() { return statuses[this.code]; }
}

const bad = (): never => { throw new StudioArtifactError('INVALID_COMMAND'); };
const object = (value: unknown): JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : bad();
const exact = (value: JsonObject, keys: readonly string[]) => {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || keys.some(key => !(key in value)) || actual.some(key => !keys.includes(key))) bad();
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SAFE_KEY = /^[a-z][a-z0-9_.-]{0,79}$/;
const uuid = (value: unknown) => typeof value === 'string' && UUID.test(value) ? value : bad();
const nullableUuid = (value: unknown) => value === null ? null : uuid(value);
const positiveInteger = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : bad();
const nonNegativeInteger = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : bad();
const text = (value: unknown, maximum: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= maximum ? value : bad();
const nullableText = (value: unknown, maximum: number) => value === null ? null : text(value, maximum);
const artifactType = (value: unknown): StudioArtifactType => STUDIO_ARTIFACT_TYPES.includes(value as StudioArtifactType) ? value as StudioArtifactType : bad();
const conditions = (value: unknown): StudioConditions => Array.isArray(value) && value.length <= 20 ? value.map(item => text(item, 500)) : bad();

const safeJson = (value: unknown, depth = 0): unknown => {
  if (depth > 12) bad();
  if (value === null || typeof value === 'boolean' || typeof value === 'string' && value.length <= 20_000
    || typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value) && value.length <= 200) return value.map(item => safeJson(item, depth + 1));
  const candidate = object(value);
  if (Object.keys(candidate).length > 200) bad();
  return Object.fromEntries(Object.entries(candidate).map(([key, item]) => [text(key, 120), safeJson(item, depth + 1)]));
};

const nullableBundleSelector = (value: unknown) => {
  if (value === null) return null;
  const item = object(value); exact(item, ['id', 'versionId', 'version']);
  return { id: uuid(item.id), versionId: uuid(item.versionId), version: positiveInteger(item.version) };
};

const templateSelector = (value: unknown): JsonObject => {
  const item = object(value);
  if (item.kind === 'system') {
    exact(item, ['kind', 'versionId', 'version']);
    return { kind: 'system', versionId: uuid(item.versionId), version: text(item.version, 80) };
  }
  if (item.kind === 'tenant') {
    exact(item, ['kind', 'templateId', 'versionId', 'version']);
    return { kind: 'tenant', templateId: uuid(item.templateId), versionId: uuid(item.versionId), version: positiveInteger(item.version) };
  }
  return bad();
};

const sectionDefinitions = (value: unknown): StudioTemplateSectionDefinition[] => {
  const items = Array.isArray(value) ? value : bad();
  if (items.length < 1 || items.length > 50) bad();
  const seen = new Set<string>();
  return items.map(raw => {
    const item = object(raw); exact(item, ['id', 'title', 'required', 'fieldKind']);
    const id = typeof item.id === 'string' && SAFE_KEY.test(item.id) ? item.id : bad();
    if (seen.has(id)) bad(); seen.add(id);
    const kinds = ['narrative', 'requirements', 'rules', 'controls', 'risks', 'interfaces', 'acceptance_criteria'];
    if (typeof item.required !== 'boolean' || !kinds.includes(String(item.fieldKind))) bad();
    return { id, title: text(item.title, 160), required: item.required, fieldKind: item.fieldKind } as StudioTemplateSectionDefinition;
  });
};

const resolution = (value: JsonObject, outcomes: readonly string[]) => {
  if (!outcomes.includes(String(value.outcome))) bad();
  return { outcome: value.outcome, rationale: text(value.rationale, 4_000), conditions: conditions(value.conditions) };
};

const parseLegacyPayload = (command: StudioServerCommandType, raw: unknown): JsonObject => {
  const payload = object(raw);
  if (command === 'studio.artifact.generation.request') {
    exact(payload, ['studioHandoffId', 'artifactType']);
    return { studioHandoffId: uuid(payload.studioHandoffId), artifactType: artifactType(payload.artifactType) };
  }
  if (command === 'studio.artifact.draft.revise') {
    exact(payload, ['artifactId', 'parentVersionId', 'content']);
    const content = safeJson(payload.content);
    if (!content || typeof content !== 'object' || Array.isArray(content) || JSON.stringify(content).length > 500_000) bad();
    return { artifactId: uuid(payload.artifactId), parentVersionId: uuid(payload.parentVersionId), content };
  }
  if (command === 'studio.artifact.review.submit') {
    exact(payload, ['artifactId', 'artifactVersionId']);
    return { artifactId: uuid(payload.artifactId), artifactVersionId: uuid(payload.artifactVersionId) };
  }
  if (command === 'studio.artifact.review.assign') {
    exact(payload, ['artifactId', 'artifactVersionId', 'reviewerId']);
    return { artifactId: uuid(payload.artifactId), artifactVersionId: uuid(payload.artifactVersionId), reviewerId: uuid(payload.reviewerId) };
  }
  if (command === 'studio.artifact.review.resolve' || command === 'studio.artifact.approval.resolve') {
    exact(payload, ['artifactId', 'artifactVersionId', 'outcome', 'rationale', 'conditions']);
    return {
      artifactId: uuid(payload.artifactId), artifactVersionId: uuid(payload.artifactVersionId),
      ...resolution(payload, command === 'studio.artifact.review.resolve' ? ['approve', 'changes_requested', 'reject'] : ['approve', 'reject']),
    };
  }
  return bad();
};

const parseGovernedPayload = (command: StudioServerCommandType, raw: unknown): JsonObject => {
  const payload = object(raw);
  if (command === 'studio.source-package.create') {
    exact(payload, ['sourceMode', 'artifactType', 'studioInputBundle', 'manualBrief']);
    if (payload.sourceMode !== 'direct_transcript_bundle' && payload.sourceMode !== 'manual_brief') bad();
    const studioInputBundle = nullableBundleSelector(payload.studioInputBundle);
    const manualBrief = nullableText(payload.manualBrief, 20_000);
    const valid = payload.sourceMode === 'direct_transcript_bundle' && studioInputBundle && !manualBrief
      || payload.sourceMode === 'manual_brief' && !studioInputBundle && manualBrief;
    if (!valid) bad();
    return { sourceMode: payload.sourceMode, artifactType: artifactType(payload.artifactType), studioInputBundle, manualBrief };
  }
  if (command === 'studio.handoff.request') {
    exact(payload, ['upstreamHandoffId', 'artifactType', 'targetInputBundle']);
    return { upstreamHandoffId: uuid(payload.upstreamHandoffId), artifactType: artifactType(payload.artifactType), targetInputBundle: nullableBundleSelector(payload.targetInputBundle) };
  }
  if (command === 'studio.handoff.review.resolve' || command === 'studio.handoff.approval.resolve') {
    exact(payload, ['handoffId', 'handoffVersion', 'outcome', 'rationale', 'conditions']);
    return { handoffId: uuid(payload.handoffId), handoffVersion: positiveInteger(payload.handoffVersion), ...resolution(payload, command === 'studio.handoff.review.resolve' ? ['approve', 'changes_requested', 'reject'] : ['approve', 'reject']) };
  }
  if (command === 'studio.handoff.withdraw') {
    exact(payload, ['handoffId', 'handoffVersion', 'rationale']);
    return { handoffId: uuid(payload.handoffId), handoffVersion: positiveInteger(payload.handoffVersion), rationale: text(payload.rationale, 4_000) };
  }
  if (command === 'studio.handoff.consume') {
    exact(payload, ['handoffId', 'handoffVersion']);
    return { handoffId: uuid(payload.handoffId), handoffVersion: positiveInteger(payload.handoffVersion) };
  }
  if (command === 'studio.template.create') {
    exact(payload, ['name', 'description', 'artifactClass', 'rendererVersion', 'sections']);
    if (!STUDIO_TEMPLATE_ARTIFACT_CLASSES.includes(payload.artifactClass as never)) bad();
    return { name: text(payload.name, 160), description: text(payload.description, 1_000), artifactClass: payload.artifactClass, rendererVersion: text(payload.rendererVersion, 80), sections: sectionDefinitions(payload.sections) };
  }
  if (command === 'studio.template.revise') {
    exact(payload, ['templateId', 'parentVersionId', 'name', 'description', 'rendererVersion', 'sections']);
    return { templateId: uuid(payload.templateId), parentVersionId: uuid(payload.parentVersionId), name: text(payload.name, 160), description: text(payload.description, 1_000), rendererVersion: text(payload.rendererVersion, 80), sections: sectionDefinitions(payload.sections) };
  }
  if (command === 'studio.template.review.submit') {
    exact(payload, ['templateId', 'templateVersionId']);
    return { templateId: uuid(payload.templateId), templateVersionId: uuid(payload.templateVersionId) };
  }
  if (command === 'studio.template.review.resolve' || command === 'studio.template.approval.resolve') {
    exact(payload, ['templateId', 'templateVersionId', 'outcome', 'rationale', 'conditions']);
    return { templateId: uuid(payload.templateId), templateVersionId: uuid(payload.templateVersionId), ...resolution(payload, command === 'studio.template.review.resolve' ? ['approve', 'changes_requested', 'reject'] : ['approve', 'reject']) };
  }
  if (command === 'studio.template.deprecate') {
    exact(payload, ['templateId', 'templateVersionId', 'rationale']);
    return { templateId: uuid(payload.templateId), templateVersionId: uuid(payload.templateVersionId), rationale: text(payload.rationale, 4_000) };
  }
  if (command === 'studio.template.replace') {
    exact(payload, ['templateId', 'templateVersionId', 'replacementTemplateId', 'replacementTemplateVersionId', 'rationale']);
    const templateId = uuid(payload.templateId); const replacementTemplateId = uuid(payload.replacementTemplateId);
    if (templateId === replacementTemplateId) bad();
    return { templateId, templateVersionId: uuid(payload.templateVersionId), replacementTemplateId, replacementTemplateVersionId: uuid(payload.replacementTemplateVersionId), rationale: text(payload.rationale, 4_000) };
  }
  if (command === 'studio.generation.request') {
    exact(payload, ['artifactId', 'sourcePackageId', 'sourcePackageVersion', 'template', 'expectedCurrentVersionId', 'expectedApprovedVersionId']);
    return {
      artifactId: uuid(payload.artifactId), sourcePackageId: uuid(payload.sourcePackageId),
      sourcePackageVersion: positiveInteger(payload.sourcePackageVersion), template: templateSelector(payload.template),
      expectedCurrentVersionId: nullableUuid(payload.expectedCurrentVersionId),
      expectedApprovedVersionId: nullableUuid(payload.expectedApprovedVersionId),
    };
  }
  return bad();
};

const allCommands = new Set<StudioServerCommandType>([...STUDIO_COMMAND_TYPES, ...STUDIO_GOVERNED_COMMAND_TYPES]);
const governedCommands = new Set<StudioServerCommandType>(STUDIO_GOVERNED_COMMAND_TYPES);
export const requiredStudioCapability = (command: StudioServerCommandType) => ({
  'studio.artifact.generation.request': 'studio.artifacts.generate',
  'studio.artifact.draft.revise': 'studio.artifacts.edit',
  'studio.artifact.review.submit': 'studio.artifacts.edit',
  'studio.artifact.review.assign': 'studio.artifacts.review',
  'studio.artifact.review.resolve': 'studio.artifacts.review',
  'studio.artifact.approval.resolve': 'studio.artifacts.approve',
  'studio.source-package.create': 'studio.artifacts.generate',
  'studio.handoff.request': 'studio.handoffs.request',
  'studio.handoff.review.resolve': 'studio.handoffs.review',
  'studio.handoff.approval.resolve': 'studio.handoffs.approve',
  'studio.handoff.withdraw': 'studio.handoffs.request',
  'studio.handoff.consume': 'studio.handoffs.consume',
  'studio.template.create': 'studio.templates.manage',
  'studio.template.revise': 'studio.templates.manage',
  'studio.template.review.submit': 'studio.templates.manage',
  'studio.template.review.resolve': 'studio.templates.review',
  'studio.template.approval.resolve': 'studio.templates.approve',
  'studio.template.deprecate': 'studio.templates.approve',
  'studio.template.replace': 'studio.templates.approve',
  'studio.generation.request': 'studio.artifacts.generate',
} satisfies Record<StudioServerCommandType, string>)[command];

export const parseStudioArtifactEnvelope = (value: unknown): StudioCommandEnvelope<JsonObject, StudioServerCommandType> => {
  const envelope = object(value);
  const hasVersion = 'contractVersion' in envelope;
  exact(envelope, hasVersion
    ? ['contractVersion', 'requestId', 'idempotencyKey', 'commandType', 'organizationId', 'workspaceId', 'authorizationVersion', 'expectedAggregateVersion', 'expectedArtifactVersion', 'payload']
    : ['requestId', 'idempotencyKey', 'commandType', 'organizationId', 'workspaceId', 'authorizationVersion', 'expectedAggregateVersion', 'expectedArtifactVersion', 'payload']);
  if (typeof envelope.commandType !== 'string' || !allCommands.has(envelope.commandType as StudioServerCommandType)) {
    throw new StudioArtifactError(typeof envelope.commandType === 'string' ? 'COMMAND_NOT_SUPPORTED' : 'INVALID_COMMAND');
  }
  const commandType = envelope.commandType as StudioServerCommandType;
  const governed = governedCommands.has(commandType);
  const contractVersion: StudioArtifactContractVersion = hasVersion
    ? envelope.contractVersion === STUDIO_ARTIFACT_CONTRACT_VERSION || envelope.contractVersion === LEGACY_STUDIO_ARTIFACT_CONTRACT_VERSION ? envelope.contractVersion : bad()
    : LEGACY_STUDIO_ARTIFACT_CONTRACT_VERSION;
  if (governed && contractVersion !== STUDIO_ARTIFACT_CONTRACT_VERSION) bad();
  if (!governed && hasVersion && contractVersion !== LEGACY_STUDIO_ARTIFACT_CONTRACT_VERSION) bad();
  const key = text(envelope.idempotencyKey, 128); if (!KEY.test(key)) bad();
  const createLike = commandType === 'studio.artifact.generation.request' || commandType === 'studio.generation.request'
    || commandType === 'studio.source-package.create' || commandType === 'studio.handoff.request' || commandType === 'studio.template.create';
  const expectedArtifactVersion = createLike ? envelope.expectedArtifactVersion === null ? null : bad() : positiveInteger(envelope.expectedArtifactVersion);
  return {
    ...(hasVersion ? { contractVersion } : {}), requestId: uuid(envelope.requestId), idempotencyKey: key, commandType,
    organizationId: uuid(envelope.organizationId), workspaceId: uuid(envelope.workspaceId),
    authorizationVersion: positiveInteger(envelope.authorizationVersion),
    expectedAggregateVersion: nonNegativeInteger(envelope.expectedAggregateVersion), expectedArtifactVersion,
    payload: governed ? parseGovernedPayload(commandType, envelope.payload) : parseLegacyPayload(commandType, envelope.payload),
  };
};

export const studioArtifactErrorBody = (error: StudioArtifactError) => ({
  ok: false, outcome: 'failed_before_commit' as const,
  error: { code: error.code, message: 'The command could not be completed.' },
});
export const asStudioArtifactError = (error: unknown) => error instanceof StudioArtifactError ? error : new StudioArtifactError('COMMAND_UNAVAILABLE');
