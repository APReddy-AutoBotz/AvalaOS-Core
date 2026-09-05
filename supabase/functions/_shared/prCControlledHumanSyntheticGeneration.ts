/**
 * Exact PR #264 controlled-human Studio generation boundary.
 *
 * This boundary has deliberately no provider, secret, route, resolver, prompt,
 * source-fetch, or arbitrary output dependency. PostgreSQL owns the synthetic
 * document, receipt, immutable version, lineage, audit, and replay transaction.
 */
export const PR_C_SYNTHETIC_GENERATION_CONTRACT_VERSION =
  'pr-c-controlled-human-synthetic-studio-generation-1' as const;

export const PR_C_SYNTHETIC_GENERATION_KIND = 'synthetic_controlled_human' as const;

type JsonObject = Record<string, unknown>;

export type PrCControlledHumanTemplateSelector =
  | { kind: 'system'; versionId: string; version: string; hash: string }
  | { kind: 'tenant'; templateId: string; versionId: string; version: number; hash: string };

export type PrCControlledHumanSyntheticGenerationCommand = Readonly<{
  contractVersion: typeof PR_C_SYNTHETIC_GENERATION_CONTRACT_VERSION;
  actorId: string;
  requestId: string;
  idempotencyKey: string;
  organizationId: string;
  workspaceId: string;
  authorizationVersion: number;
  environmentClass: 'hosted_nonproduction_pilot';
  prNumber: 264;
  releaseSha: string;
  reviewHeadSha: string;
  deployId: string;
  deployOrigin: 'https://deploy-preview-264--avalaos-pilot.netlify.app';
  exerciseDigest: string;
  targetFingerprint: string;
  artifactId: string;
  sourcePackageId: string;
  sourcePackageVersion: number;
  sourcePackageHash: string;
  expectedAggregateVersion: number;
  expectedCurrentVersionId: string | null;
  expectedApprovedVersionId: string | null;
  template: PrCControlledHumanTemplateSelector;
}>;

export type PrCControlledHumanSyntheticGenerationResult = Readonly<{
  outcome: 'committed' | 'replayed';
  receiptId: string;
  resourceId: string;
  resource: {
    artifactId: string;
    versionId: string;
    version: number;
    sourcePackageId: string;
    sourcePackageVersion: number;
    sourcePackageHash: string;
    templateVersionId: string;
    templateVersion: string | number;
    templateHash: string;
    generationKind: typeof PR_C_SYNTHETIC_GENERATION_KIND;
    synthetic: true;
  };
}>;

export type PrCControlledHumanSyntheticGenerationDependencies = Readonly<{
  authenticate(request: Request): Promise<{ id: string }>;
  execute(command: PrCControlledHumanSyntheticGenerationCommand): Promise<unknown>;
}>;

export type PrCControlledHumanSyntheticGenerationErrorCode =
  | 'METHOD_NOT_ALLOWED'
  | 'AUTHENTICATION_REQUIRED'
  | 'INVALID_COMMAND'
  | 'RESOURCE_NOT_AVAILABLE'
  | 'AUTHORITY_STALE'
  | 'PERMISSION_DENIED'
  | 'VERSION_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'SOURCE_PACKAGE_STALE'
  | 'TEMPLATE_STALE'
  | 'READ_ONLY'
  | 'FEATURE_DISABLED'
  | 'COMMAND_UNAVAILABLE';

const STATUS: Readonly<Record<PrCControlledHumanSyntheticGenerationErrorCode, number>> = {
  METHOD_NOT_ALLOWED: 405,
  AUTHENTICATION_REQUIRED: 401,
  INVALID_COMMAND: 400,
  RESOURCE_NOT_AVAILABLE: 404,
  AUTHORITY_STALE: 409,
  PERMISSION_DENIED: 403,
  VERSION_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  SOURCE_PACKAGE_STALE: 409,
  TEMPLATE_STALE: 409,
  READ_ONLY: 503,
  FEATURE_DISABLED: 503,
  COMMAND_UNAVAILABLE: 503,
};

const SAFE_CODES = new Set<PrCControlledHumanSyntheticGenerationErrorCode>(
  Object.keys(STATUS) as PrCControlledHumanSyntheticGenerationErrorCode[],
);

export class PrCControlledHumanSyntheticGenerationError extends Error {
  constructor(readonly code: PrCControlledHumanSyntheticGenerationErrorCode) {
    super(code);
    this.name = 'PrCControlledHumanSyntheticGenerationError';
  }

  get status() { return STATUS[this.code]; }
}

const invalid = (): never => {
  throw new PrCControlledHumanSyntheticGenerationError('INVALID_COMMAND');
};
const object = (value: unknown): JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as JsonObject
  : invalid();
const exact = (value: JsonObject, keys: readonly string[]) => {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key)) || keys.some(key => !(key in value))) invalid();
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA = /^[0-9a-f]{40}$/u;
const DEPLOY_ID = /^[0-9a-f]{24}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const uuid = (value: unknown): string => typeof value === 'string' && UUID.test(value) ? value : invalid();
const nullableUuid = (value: unknown): string | null => value === null ? null : uuid(value);
const positive = (value: unknown): number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : invalid();
const nonNegative = (value: unknown): number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : invalid();
const matching = (value: unknown, pattern: RegExp): string => typeof value === 'string' && pattern.test(value) ? value : invalid();

const parseTemplate = (value: unknown): PrCControlledHumanTemplateSelector => {
  const item = object(value);
  if (item.kind === 'system') {
    exact(item, ['kind', 'versionId', 'version', 'hash']);
    if (typeof item.version !== 'string' || item.version.length < 1 || item.version.length > 80) invalid();
    const version = item.version as string;
    return { kind: 'system', versionId: uuid(item.versionId), version, hash: matching(item.hash, HASH) };
  }
  if (item.kind === 'tenant') {
    exact(item, ['kind', 'templateId', 'versionId', 'version', 'hash']);
    return { kind: 'tenant', templateId: uuid(item.templateId), versionId: uuid(item.versionId), version: positive(item.version), hash: matching(item.hash, HASH) };
  }
  return invalid();
};

const BODY_KEYS = [
  'contractVersion', 'requestId', 'idempotencyKey', 'organizationId', 'workspaceId', 'authorizationVersion', 'environmentClass', 'prNumber',
  'releaseSha', 'reviewHeadSha', 'deployId', 'deployOrigin', 'exerciseDigest', 'targetFingerprint',
  'artifactId', 'sourcePackageId', 'sourcePackageVersion', 'sourcePackageHash', 'expectedAggregateVersion',
  'expectedCurrentVersionId', 'expectedApprovedVersionId', 'template',
] as const;

export const parsePrCControlledHumanSyntheticGenerationCommand = (
  value: unknown,
  actorId: string,
): PrCControlledHumanSyntheticGenerationCommand => {
  const item = object(value);
  exact(item, BODY_KEYS);
  if (item.contractVersion !== PR_C_SYNTHETIC_GENERATION_CONTRACT_VERSION
    || item.environmentClass !== 'hosted_nonproduction_pilot'
    || item.prNumber !== 264
    || item.deployOrigin !== 'https://deploy-preview-264--avalaos-pilot.netlify.app') invalid();
  const releaseSha = matching(item.releaseSha, SHA);
  const reviewHeadSha = matching(item.reviewHeadSha, SHA);
  if (releaseSha !== reviewHeadSha || typeof item.idempotencyKey !== 'string' || !IDEMPOTENCY_KEY.test(item.idempotencyKey)) invalid();
  const idempotencyKey = item.idempotencyKey as string;
  return {
    contractVersion: PR_C_SYNTHETIC_GENERATION_CONTRACT_VERSION,
    actorId: uuid(actorId),
    requestId: uuid(item.requestId),
    idempotencyKey,
    organizationId: uuid(item.organizationId),
    workspaceId: uuid(item.workspaceId),
    authorizationVersion: positive(item.authorizationVersion),
    environmentClass: 'hosted_nonproduction_pilot',
    prNumber: 264,
    releaseSha,
    reviewHeadSha,
    deployId: matching(item.deployId, DEPLOY_ID),
    deployOrigin: 'https://deploy-preview-264--avalaos-pilot.netlify.app',
    exerciseDigest: matching(item.exerciseDigest, DIGEST),
    targetFingerprint: matching(item.targetFingerprint, DIGEST),
    artifactId: uuid(item.artifactId),
    sourcePackageId: uuid(item.sourcePackageId),
    sourcePackageVersion: positive(item.sourcePackageVersion),
    sourcePackageHash: matching(item.sourcePackageHash, HASH),
    expectedAggregateVersion: nonNegative(item.expectedAggregateVersion),
    expectedCurrentVersionId: nullableUuid(item.expectedCurrentVersionId),
    expectedApprovedVersionId: nullableUuid(item.expectedApprovedVersionId),
    template: parseTemplate(item.template),
  };
};

const RESULT_KEYS = ['outcome', 'receiptId', 'resourceId', 'resource'] as const;
const RESOURCE_KEYS = [
  'artifactId', 'versionId', 'version', 'sourcePackageId', 'sourcePackageVersion', 'sourcePackageHash',
  'templateVersionId', 'templateVersion', 'templateHash', 'generationKind', 'synthetic',
] as const;

const decodeResult = (
  value: unknown,
): PrCControlledHumanSyntheticGenerationResult => {
  const item = object(value);
  exact(item, RESULT_KEYS);
  if (item.outcome !== 'committed' && item.outcome !== 'replayed') invalid();
  const outcome = item.outcome as 'committed' | 'replayed';
  const resource = object(item.resource);
  exact(resource, RESOURCE_KEYS);
  const templateVersion = resource.templateVersion;
  if (!(typeof templateVersion === 'string' && templateVersion.length > 0 && templateVersion.length <= 80)
    && !(typeof templateVersion === 'number' && Number.isSafeInteger(templateVersion) && templateVersion > 0)) invalid();
  const exactTemplateVersion = templateVersion as string | number;
  const result: PrCControlledHumanSyntheticGenerationResult = {
    outcome,
    receiptId: uuid(item.receiptId),
    resourceId: uuid(item.resourceId),
    resource: {
      artifactId: uuid(resource.artifactId),
      versionId: uuid(resource.versionId),
      version: positive(resource.version),
      sourcePackageId: uuid(resource.sourcePackageId),
      sourcePackageVersion: positive(resource.sourcePackageVersion),
      sourcePackageHash: matching(resource.sourcePackageHash, HASH),
      templateVersionId: uuid(resource.templateVersionId),
      templateVersion: exactTemplateVersion,
      templateHash: matching(resource.templateHash, HASH),
      generationKind: resource.generationKind === PR_C_SYNTHETIC_GENERATION_KIND ? resource.generationKind : invalid(),
      synthetic: resource.synthetic === true ? true : invalid(),
    },
  };
  if (result.resourceId !== result.resource.artifactId) invalid();
  return result;
};

export const decodePrCControlledHumanSyntheticGenerationResult = (
  value: unknown,
): PrCControlledHumanSyntheticGenerationResult => {
  try { return decodeResult(value); }
  catch { throw new PrCControlledHumanSyntheticGenerationError('COMMAND_UNAVAILABLE'); }
};

const safeError = (error: unknown): PrCControlledHumanSyntheticGenerationError => {
  if (error instanceof PrCControlledHumanSyntheticGenerationError) return error;
  const candidate = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  for (const value of [candidate.code, candidate.message, candidate.details, candidate.hint]) {
    if (typeof value === 'string' && SAFE_CODES.has(value.trim() as PrCControlledHumanSyntheticGenerationErrorCode)) {
      return new PrCControlledHumanSyntheticGenerationError(value.trim() as PrCControlledHumanSyntheticGenerationErrorCode);
    }
  }
  return new PrCControlledHumanSyntheticGenerationError('COMMAND_UNAVAILABLE');
};

const failure = (error: PrCControlledHumanSyntheticGenerationError) => Response.json({
  ok: false,
  outcome: 'failed_before_commit',
  error: { code: error.code, message: 'The synthetic controlled-human command could not be completed.' },
}, { status: error.status });

export const handlePrCControlledHumanSyntheticGeneration = async (
  request: Request,
  dependencies: PrCControlledHumanSyntheticGenerationDependencies,
): Promise<Response> => {
  try {
    if (request.method !== 'POST') throw new PrCControlledHumanSyntheticGenerationError('METHOD_NOT_ALLOWED');
    let actor: { id: string };
    try { actor = await dependencies.authenticate(request); } catch { throw new PrCControlledHumanSyntheticGenerationError('AUTHENTICATION_REQUIRED'); }
    let body: unknown;
    try { body = await request.json(); } catch { throw new PrCControlledHumanSyntheticGenerationError('INVALID_COMMAND'); }
    const command = parsePrCControlledHumanSyntheticGenerationCommand(body, actor.id);
    const result = decodePrCControlledHumanSyntheticGenerationResult(await dependencies.execute(command));
    return Response.json({
      ok: true,
      outcome: 'generation_completed',
      commandOutcome: result.outcome,
      receiptId: result.receiptId,
      resourceId: result.resourceId,
      resource: result.resource,
    }, { status: result.outcome === 'replayed' ? 200 : 201 });
  } catch (error) {
    return failure(safeError(error));
  }
};
