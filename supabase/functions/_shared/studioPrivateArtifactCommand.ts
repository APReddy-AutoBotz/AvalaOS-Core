import type {
  StudioPrivateArtifactCommandEnvelope,
  StudioPrivateArtifactCommandPayloads,
  StudioPrivateArtifactCommandResponse,
  StudioPrivateArtifactCommandType,
  StudioPrivateArtifactFormat,
} from '../../../services/studioArtifacts/privateArtifactContracts.ts';

export type StudioPrivateArtifactJson = Record<string, unknown>;
export type StudioPrivateArtifactAuthority = Readonly<{
  actorId: string;
  authorizationVersion: number;
  capabilities: readonly string[];
}>;
export type StudioPrivateArtifactAtomicCommand =
  StudioPrivateArtifactCommandEnvelope<StudioPrivateArtifactJson> & { actorId: string };
export type StudioPrivateArtifactAtomicResult = Pick<
  StudioPrivateArtifactCommandResponse,
  'outcome' | 'receiptId' | 'resourceId' | 'resource'
> & {
  renditionClaim?: StudioPrivateArtifactJson;
  deletionClaim?: StudioPrivateArtifactJson;
};

export const STUDIO_PRIVATE_ARTIFACT_DOMAIN_ERROR_CODES = [
  'RESOURCE_NOT_AVAILABLE',
  'AUTHORITY_STALE',
  'PERMISSION_DENIED',
  'VERSION_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'SEPARATION_OF_DUTY',
  'RETENTION_BLOCKED',
  'LEGAL_HOLD_BLOCKED',
  'DOWNLOAD_UNAVAILABLE',
  'RENDERING_FAILED',
  'STORAGE_FAILED',
  'DELETION_FAILED',
  'FEATURE_DISABLED',
  'READ_ONLY',
  'INVALID_COMMAND',
  'COMMAND_UNAVAILABLE',
] as const;
export type StudioPrivateArtifactDomainErrorCode =
  (typeof STUDIO_PRIVATE_ARTIFACT_DOMAIN_ERROR_CODES)[number];
export type StudioPrivateArtifactErrorCode =
  | 'METHOD_NOT_ALLOWED'
  | 'AUTHENTICATION_REQUIRED'
  | 'COMMAND_NOT_SUPPORTED'
  | StudioPrivateArtifactDomainErrorCode;

const statuses: Record<StudioPrivateArtifactErrorCode, number> = {
  METHOD_NOT_ALLOWED: 405,
  AUTHENTICATION_REQUIRED: 401,
  INVALID_COMMAND: 400,
  COMMAND_NOT_SUPPORTED: 400,
  RESOURCE_NOT_AVAILABLE: 404,
  AUTHORITY_STALE: 409,
  PERMISSION_DENIED: 403,
  VERSION_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  SEPARATION_OF_DUTY: 409,
  RETENTION_BLOCKED: 409,
  LEGAL_HOLD_BLOCKED: 409,
  DOWNLOAD_UNAVAILABLE: 404,
  RENDERING_FAILED: 502,
  STORAGE_FAILED: 502,
  DELETION_FAILED: 502,
  FEATURE_DISABLED: 503,
  READ_ONLY: 503,
  COMMAND_UNAVAILABLE: 503,
};

export class StudioPrivateArtifactError extends Error {
  constructor(public readonly code: StudioPrivateArtifactErrorCode) {
    super(code);
    this.name = 'StudioPrivateArtifactError';
  }
  get status() {
    return statuses[this.code];
  }
}

const bad = (): never => {
  throw new StudioPrivateArtifactError('INVALID_COMMAND');
};
const object = (value: unknown): StudioPrivateArtifactJson =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as StudioPrivateArtifactJson)
    : bad();
const exact = (value: StudioPrivateArtifactJson, keys: readonly string[]) => {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some(key => !(key in value)) ||
    Object.keys(value).some(key => !keys.includes(key))
  ) bad();
};
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = (value: unknown) =>
  typeof value === 'string' && UUID.test(value) ? value : bad();
const positiveInteger = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : bad();
const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max
    ? value
    : bad();
const artifactType = (value: unknown) =>
  value === 'brd' || value === 'frd' || value === 'pdd' ? value : bad();
const format = (value: unknown): StudioPrivateArtifactFormat =>
  value === 'markdown' || value === 'pdf' || value === 'docx' ? value : bad();
const date = (value: unknown) => {
  const candidate = text(value, 40);
  return !Number.isNaN(Date.parse(candidate)) && candidate === new Date(candidate).toISOString()
    ? candidate
    : bad();
};
const idempotencyKey = (value: unknown) => {
  const candidate = text(value, 128);
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(candidate) ? candidate : bad();
};

const commands: readonly StudioPrivateArtifactCommandType[] = [
  'studio.rendition.generate',
  'studio.retention.policy.publish',
  'studio.rendition.retention.extend',
  'studio.legal_hold.place',
  'studio.legal_hold.release',
  'studio.rendition.deletion.request',
  'studio.rendition.deletion.resolve',
];

export const requiredStudioPrivateArtifactCapability = (
  command: StudioPrivateArtifactCommandType,
) =>
  ({
    'studio.rendition.generate': 'studio.artifacts.rendition.generate',
    'studio.retention.policy.publish': 'studio.artifacts.retention.manage',
    'studio.rendition.retention.extend': 'studio.artifacts.retention.manage',
    'studio.legal_hold.place': 'studio.artifacts.legal_hold.manage',
    'studio.legal_hold.release': 'studio.artifacts.legal_hold.manage',
    'studio.rendition.deletion.request': 'studio.artifacts.delete.request',
    'studio.rendition.deletion.resolve': 'studio.artifacts.delete.approve',
  })[command];

const parsePayload = (
  command: StudioPrivateArtifactCommandType,
  raw: unknown,
): StudioPrivateArtifactJson => {
  const payload = object(raw);
  if (command === 'studio.rendition.generate') {
    exact(payload, ['artifactId', 'artifactVersionId', 'format']);
    return {
      artifactId: uuid(payload.artifactId),
      artifactVersionId: uuid(payload.artifactVersionId),
      format: format(payload.format),
    } satisfies StudioPrivateArtifactCommandPayloads[typeof command];
  }
  if (command === 'studio.retention.policy.publish') {
    exact(payload, ['artifactType', 'retentionDays', 'reason']);
    const retentionDays =
      payload.retentionDays === null
        ? null
        : typeof payload.retentionDays === 'number' &&
            Number.isSafeInteger(payload.retentionDays) &&
            payload.retentionDays >= 1 &&
            payload.retentionDays <= 36_500
          ? payload.retentionDays
          : bad();
    return {
      artifactType: artifactType(payload.artifactType),
      retentionDays,
      reason: text(payload.reason, 4000),
    } satisfies StudioPrivateArtifactCommandPayloads[typeof command];
  }
  if (command === 'studio.rendition.retention.extend') {
    exact(payload, ['renditionId', 'retentionUntil', 'reason']);
    return {
      renditionId: uuid(payload.renditionId),
      retentionUntil:
        payload.retentionUntil === null ? null : date(payload.retentionUntil),
      reason: text(payload.reason, 4000),
    } satisfies StudioPrivateArtifactCommandPayloads[typeof command];
  }
  if (command === 'studio.legal_hold.place' || command === 'studio.legal_hold.release') {
    exact(payload, ['renditionId', 'reason']);
    return {
      renditionId: uuid(payload.renditionId),
      reason: text(payload.reason, 4000),
    };
  }
  if (command === 'studio.rendition.deletion.request') {
    exact(payload, ['renditionId', 'reason']);
    return {
      renditionId: uuid(payload.renditionId),
      reason: text(payload.reason, 4000),
    } satisfies StudioPrivateArtifactCommandPayloads[typeof command];
  }
  exact(payload, ['renditionId', 'deletionRequestId', 'outcome', 'reason']);
  if (payload.outcome !== 'approve' && payload.outcome !== 'reject') bad();
  return {
    renditionId: uuid(payload.renditionId),
    deletionRequestId: uuid(payload.deletionRequestId),
    outcome: payload.outcome as 'approve' | 'reject',
    reason: text(payload.reason, 4000),
  } satisfies StudioPrivateArtifactCommandPayloads['studio.rendition.deletion.resolve'];
};

export const parseStudioPrivateArtifactEnvelope = (
  value: unknown,
): StudioPrivateArtifactCommandEnvelope<StudioPrivateArtifactJson> => {
  const envelope = object(value);
  exact(envelope, [
    'requestId',
    'idempotencyKey',
    'commandType',
    'organizationId',
    'workspaceId',
    'authorizationVersion',
    'expectedArtifactVersion',
    'expectedRenditionVersion',
    'payload',
  ]);
  if (
    typeof envelope.commandType !== 'string' ||
    !commands.includes(envelope.commandType as StudioPrivateArtifactCommandType)
  ) {
    throw new StudioPrivateArtifactError(
      typeof envelope.commandType === 'string'
        ? 'COMMAND_NOT_SUPPORTED'
        : 'INVALID_COMMAND',
    );
  }
  const commandType = envelope.commandType as StudioPrivateArtifactCommandType;
  const expectsArtifact = commandType !== 'studio.retention.policy.publish';
  const expectsRendition =
    commandType !== 'studio.rendition.generate' &&
    commandType !== 'studio.retention.policy.publish';
  return {
    requestId: uuid(envelope.requestId),
    idempotencyKey: idempotencyKey(envelope.idempotencyKey),
    commandType,
    organizationId: uuid(envelope.organizationId),
    workspaceId: uuid(envelope.workspaceId),
    authorizationVersion: positiveInteger(envelope.authorizationVersion),
    expectedArtifactVersion: expectsArtifact
      ? positiveInteger(envelope.expectedArtifactVersion)
      : envelope.expectedArtifactVersion === null
        ? null
        : bad(),
    expectedRenditionVersion: expectsRendition
      ? positiveInteger(envelope.expectedRenditionVersion)
      : envelope.expectedRenditionVersion === null
        ? null
        : bad(),
    payload: parsePayload(commandType, envelope.payload),
  };
};

export const studioPrivateArtifactErrorBody = (error: StudioPrivateArtifactError) => ({
  ok: false,
  outcome: 'failed_before_commit' as const,
  error: {
    code: error.code,
    message: 'The private-artifact operation could not be completed.',
  },
});
export const asStudioPrivateArtifactError = (error: unknown) =>
  error instanceof StudioPrivateArtifactError
    ? error
    : new StudioPrivateArtifactError('COMMAND_UNAVAILABLE');
