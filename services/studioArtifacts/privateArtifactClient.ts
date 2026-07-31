import type { TenantContextProjection } from '../../types';
import { supabase } from '../supabaseClient';
import {
  STUDIO_PRIVATE_ARTIFACT_COMMAND_TYPES,
  STUDIO_PRIVATE_ARTIFACT_FORMATS,
  STUDIO_PRIVATE_ARTIFACT_PROJECTION_RPC,
  STUDIO_RENDITION_STATES,
  type StudioPrivateArtifactCommandEnvelope,
  type StudioPrivateArtifactCommandPayloads,
  type StudioPrivateArtifactCommandResponse,
  type StudioPrivateArtifactCommandType,
  type StudioPrivateArtifactDownload,
  type StudioPrivateArtifactDownloadRequest,
  type StudioPrivateArtifactProjectionDto,
  type StudioPrivateArtifactFormat,
  type StudioRenditionProjectionDto,
} from './privateArtifactContracts';

export const STUDIO_PRIVATE_ARTIFACT_SAFE_ERROR_CODES = [
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
export type StudioPrivateArtifactSafeErrorCode =
  (typeof STUDIO_PRIVATE_ARTIFACT_SAFE_ERROR_CODES)[number];

export class StudioPrivateArtifactBoundaryError extends Error {
  constructor(public readonly code: StudioPrivateArtifactSafeErrorCode) {
    super(code);
    this.name = 'StudioPrivateArtifactBoundaryError';
  }
}

export interface StudioPrivateArtifactTransport {
  readProjection(
    context: TenantContextProjection,
    artifactId: string,
    artifactVersionId: string,
  ): Promise<unknown>;
  invoke(envelope: StudioPrivateArtifactCommandEnvelope): Promise<unknown>;
  download(request: StudioPrivateArtifactDownloadRequest): Promise<Response>;
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length &&
  Object.keys(value).every(key => keys.includes(key));
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const positive = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;
const nonNegative = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const date = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));
const sha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
const unavailable = (): never => {
  throw new StudioPrivateArtifactBoundaryError('RESOURCE_NOT_AVAILABLE');
};

const RENDITION_KEYS = [
  'id',
  'version',
  'format',
  'state',
  'mimeType',
  'filename',
  'byteLength',
  'sha256',
  'rendererVersion',
  'retentionMode',
  'retentionUntil',
  'legalHoldActive',
  'activeHolds',
  'deletion',
  'failureCode',
  'updatedAt',
] as const;
const MIME_BY_FORMAT: Record<StudioPrivateArtifactFormat, string> = {
  markdown: 'text/markdown; charset=utf-8',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const decodeDeletion = (value: unknown): StudioRenditionProjectionDto['deletion'] => {
  if (value === null) return null;
  const keys = ['requestId', 'state', 'requesterIsCurrentActor'] as const;
  if (
    !object(value) ||
    !exact(value, keys) ||
    !uuid(value.requestId) ||
    !['pending', 'approved', 'rejected'].includes(value.state as string) ||
    typeof value.requesterIsCurrentActor !== 'boolean'
  ) unavailable();
  return value as unknown as StudioRenditionProjectionDto['deletion'];
};

const decodeActiveHolds = (
  value: unknown,
): StudioRenditionProjectionDto['activeHolds'] => {
  if (!Array.isArray(value)) return unavailable();
  const holds = value.map(hold => {
    if (
      !object(hold) ||
      !exact(hold, ['holdId', 'placedAt']) ||
      !uuid(hold.holdId) ||
      !date(hold.placedAt)
    ) unavailable();
    return { holdId: hold.holdId, placedAt: hold.placedAt };
  });
  if (new Set(holds.map(hold => hold.holdId)).size !== holds.length) unavailable();
  return holds;
};

const decodeRendition = (value: unknown): StudioRenditionProjectionDto => {
  const record: Record<string, unknown> = object(value) ? value : unavailable();
  if (
    !exact(record, RENDITION_KEYS) ||
    !uuid(record.id) ||
    !positive(record.version) ||
    !STUDIO_PRIVATE_ARTIFACT_FORMATS.includes(record.format as StudioPrivateArtifactFormat) ||
    !STUDIO_RENDITION_STATES.includes(record.state as StudioRenditionProjectionDto['state']) ||
    !text(record.rendererVersion) ||
    !(
      record.retentionMode === null ||
      ['until', 'indefinite'].includes(record.retentionMode as string)
    ) ||
    typeof record.legalHoldActive !== 'boolean' ||
    !(record.failureCode === null || (text(record.failureCode) && /^[A-Z][A-Z0-9_]{2,63}$/.test(record.failureCode))) ||
    !date(record.updatedAt)
  ) unavailable();
  const state = record.state as StudioRenditionProjectionDto['state'];
  const format = record.format as StudioPrivateArtifactFormat;
  const activeHolds = decodeActiveHolds(record.activeHolds);
  const availableMetadata =
    text(record.mimeType) &&
    record.mimeType === MIME_BY_FORMAT[format] &&
    text(record.filename) &&
    /^[A-Za-z0-9][A-Za-z0-9._ -]{0,119}$/.test(record.filename) &&
    !/[\\/]/.test(record.filename) &&
    positive(record.byteLength) &&
    sha256(record.sha256);
  const metadataMayBeAbsent = [
    'requested',
    'rendering',
    'uploading',
    'reconciliation_required',
    'reconciling',
    'failed',
  ].includes(state);
  const requiresRetentionSnapshot = [
    'available',
    'deletion_requested',
    'deleting',
    'deletion_reconciliation_required',
    'deletion_reconciling',
    'deleted',
    'deletion_failed',
  ].includes(state);
  if (
    (!metadataMayBeAbsent && !availableMetadata) ||
    (metadataMayBeAbsent &&
      !(
        (record.mimeType === null &&
          record.filename === null &&
          record.byteLength === null &&
          record.sha256 === null) ||
        availableMetadata
      )) ||
    (record.retentionMode === null && record.retentionUntil !== null) ||
    (requiresRetentionSnapshot && record.retentionMode === null) ||
    (record.retentionMode === 'until' && !date(record.retentionUntil)) ||
    (record.retentionMode === 'indefinite' && record.retentionUntil !== null) ||
    record.legalHoldActive !== (activeHolds.length > 0) ||
    (state === 'deleted' && activeHolds.length > 0)
  ) unavailable();
  return {
    id: record.id as string,
    version: record.version as number,
    format,
    state,
    mimeType: record.mimeType as string | null,
    filename: record.filename as string | null,
    byteLength: record.byteLength as number | null,
    sha256: record.sha256 as string | null,
    rendererVersion: record.rendererVersion as string,
    retentionMode: record.retentionMode as StudioRenditionProjectionDto['retentionMode'],
    retentionUntil: record.retentionUntil as string | null,
    legalHoldActive: record.legalHoldActive as boolean,
    activeHolds,
    deletion: decodeDeletion(record.deletion),
    failureCode: record.failureCode as string | null,
    updatedAt: record.updatedAt as string,
  };
};

export const decodeStudioPrivateArtifactProjection = (
  value: unknown,
  expected: {
    artifactId: string;
    artifactVersionId: string;
  },
): StudioPrivateArtifactProjectionDto => {
  const record: Record<string, unknown> = object(value) ? value : unavailable();
  const keys = [
    'artifactId',
    'artifactVersionId',
    'artifactVersion',
    'artifactType',
    'approved',
    'readOnly',
    'renditions',
  ] as const;
  if (
    !exact(record, keys) ||
    !uuid(record.artifactId) ||
    !uuid(record.artifactVersionId) ||
    !positive(record.artifactVersion) ||
    !['brd', 'frd', 'pdd'].includes(record.artifactType as string) ||
    record.approved !== true ||
    typeof record.readOnly !== 'boolean' ||
    !Array.isArray(record.renditions) ||
    record.renditions.length > STUDIO_PRIVATE_ARTIFACT_FORMATS.length ||
    record.artifactId !== expected.artifactId ||
    record.artifactVersionId !== expected.artifactVersionId
  ) unavailable();
  const renditions = (record.renditions as unknown[]).map(decodeRendition);
  if (
    new Set(renditions.map(rendition => rendition.id)).size !== renditions.length ||
    new Set(renditions.map(rendition => rendition.format)).size !== renditions.length
  ) unavailable();
  return {
    artifactId: record.artifactId,
    artifactVersionId: record.artifactVersionId,
    artifactVersion: record.artifactVersion,
    artifactType: record.artifactType,
    approved: true,
    readOnly: record.readOnly,
    renditions,
  } as StudioPrivateArtifactProjectionDto;
};

export const decodeStudioPrivateArtifactSafeError = (
  value: unknown,
): StudioPrivateArtifactBoundaryError => {
  const candidates: unknown[] = [value];
  if (object(value)) {
    candidates.push(value.code, value.errorCode);
    if (object(value.error)) candidates.push(value.error.code, value.error.errorCode);
  }
  const code = candidates.find(
    candidate =>
      typeof candidate === 'string' &&
      STUDIO_PRIVATE_ARTIFACT_SAFE_ERROR_CODES.includes(
        candidate as StudioPrivateArtifactSafeErrorCode,
      ),
  );
  return new StudioPrivateArtifactBoundaryError(
    (code as StudioPrivateArtifactSafeErrorCode | undefined) ?? 'COMMAND_UNAVAILABLE',
  );
};

const decodeInvocationError = async (error: unknown) => {
  if (
    object(error) &&
    object(error.context) &&
    typeof error.context.json === 'function'
  ) {
    try {
      return decodeStudioPrivateArtifactSafeError(
        await (error.context.json as () => Promise<unknown>)(),
      );
    } catch {
      return new StudioPrivateArtifactBoundaryError('COMMAND_UNAVAILABLE');
    }
  }
  return decodeStudioPrivateArtifactSafeError(error);
};

export const decodeStudioPrivateArtifactCommandResponse = (
  value: unknown,
): StudioPrivateArtifactCommandResponse => {
  const keys = ['ok', 'outcome', 'receiptId', 'resourceId', 'resource'] as const;
  if (
    !object(value) ||
    !exact(value, keys) ||
    value.ok !== true ||
    ![
      'committed',
      'replayed',
      'rendition_available',
      'rendition_failed',
      'deletion_completed',
      'deletion_failed',
    ].includes(value.outcome as string) ||
    !uuid(value.receiptId) ||
    !uuid(value.resourceId) ||
    !object(value.resource)
  ) unavailable();
  return value as unknown as StudioPrivateArtifactCommandResponse;
};

const filenameFromDisposition = (value: string | null) => {
  if (!value) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(value)?.[1];
  const basic = /filename="([^"]+)"/i.exec(value)?.[1];
  let filename: string;
  try {
    filename = decodeURIComponent(utf8 ?? basic ?? '');
  } catch {
    unavailable();
  }
  if (
    !filename ||
    !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,119}$/.test(filename) ||
    /[\\/]/.test(filename)
  ) unavailable();
  return filename;
};

export const decodeStudioPrivateArtifactDownload = async (
  response: Response,
): Promise<StudioPrivateArtifactDownload> => {
  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Binary and internal provider details are deliberately ignored.
    }
    throw decodeStudioPrivateArtifactSafeError(body);
  }
  if (
    response.headers.get('cache-control')?.toLowerCase() !== 'private, no-store' ||
    response.headers.get('x-content-type-options')?.toLowerCase() !== 'nosniff'
  ) unavailable();
  const mimeType = response.headers.get('content-type');
  const filename = filenameFromDisposition(response.headers.get('content-disposition'));
  if (!mimeType || !Object.values(MIME_BY_FORMAT).includes(mimeType) || !filename) unavailable();
  const bytes = await response.blob();
  if (!nonNegative(bytes.size) || bytes.size === 0 || bytes.type !== mimeType) unavailable();
  return { bytes, filename, mimeType };
};

export const buildStudioPrivateArtifactProjectionRpcArguments = (
  context: TenantContextProjection,
  artifactVersionId: string,
) => ({
  p_org: context.organizationId,
  p_workspace: context.workspaceId,
  p_artifact_version: artifactVersionId,
});

export const studioPrivateArtifactDefaultTransport: StudioPrivateArtifactTransport = {
  async readProjection(context, _artifactId, artifactVersionId) {
    const { data, error } = await supabase.rpc(
      STUDIO_PRIVATE_ARTIFACT_PROJECTION_RPC.name,
      buildStudioPrivateArtifactProjectionRpcArguments(context, artifactVersionId),
    );
    if (error) throw decodeStudioPrivateArtifactSafeError(error);
    return data;
  },
  async invoke(envelope) {
    const { data, error } = await supabase.functions.invoke(
      'studio-private-artifact-command',
      { body: envelope },
    );
    if (error) throw await decodeInvocationError(error);
    return data;
  },
  async download(request) {
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    const { data, error } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (error || !baseUrl || !token) {
      throw new StudioPrivateArtifactBoundaryError('DOWNLOAD_UNAVAILABLE');
    }
    try {
      return await fetch(`${baseUrl}/functions/v1/studio-artifact-download`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });
    } catch {
      throw new StudioPrivateArtifactBoundaryError('DOWNLOAD_UNAVAILABLE');
    }
  },
};

export const readStudioPrivateArtifact = async (
  context: TenantContextProjection,
  artifactId: string,
  artifactVersionId: string,
  transport = studioPrivateArtifactDefaultTransport,
) =>
  decodeStudioPrivateArtifactProjection(
    await transport.readProjection(context, artifactId, artifactVersionId),
    { artifactId, artifactVersionId },
  );

const validatePublicCommandPayload = (
  commandType: StudioPrivateArtifactCommandType,
  value: unknown,
) => {
  const payload: Record<string, unknown> = object(value) ? value : unavailable();
  const reason = (candidate: unknown) =>
    typeof candidate === 'string' &&
    candidate.trim().length > 0 &&
    candidate.length <= 4000;
  if (commandType === 'studio.rendition.generate') {
    if (
      !exact(payload, ['artifactId', 'artifactVersionId', 'format']) ||
      !uuid(payload.artifactId) ||
      !uuid(payload.artifactVersionId) ||
      !STUDIO_PRIVATE_ARTIFACT_FORMATS.includes(
        payload.format as StudioPrivateArtifactFormat,
      )
    ) unavailable();
  } else if (commandType === 'studio.retention.policy.publish') {
    if (
      !exact(payload, ['artifactType', 'retentionDays', 'reason']) ||
      !['brd', 'frd', 'pdd'].includes(payload.artifactType as string) ||
      !(
        payload.retentionDays === null ||
        (Number.isSafeInteger(payload.retentionDays) &&
          Number(payload.retentionDays) >= 1 &&
          Number(payload.retentionDays) <= 36_500)
      ) ||
      !reason(payload.reason)
    ) unavailable();
  } else if (commandType === 'studio.rendition.retention.extend') {
    if (
      !exact(payload, ['renditionId', 'retentionUntil', 'reason']) ||
      !uuid(payload.renditionId) ||
      !(payload.retentionUntil === null || date(payload.retentionUntil)) ||
      !reason(payload.reason)
    ) unavailable();
  } else if (commandType === 'studio.legal_hold.release') {
    if (
      !exact(payload, ['renditionId', 'holdId', 'reason']) ||
      !uuid(payload.renditionId) ||
      !uuid(payload.holdId) ||
      !reason(payload.reason)
    ) unavailable();
  } else if (
    commandType === 'studio.legal_hold.place' ||
    commandType === 'studio.rendition.deletion.request'
  ) {
    if (
      !exact(payload, ['renditionId', 'reason']) ||
      !uuid(payload.renditionId) ||
      !reason(payload.reason)
    ) unavailable();
  } else if (
    !exact(payload, ['renditionId', 'deletionRequestId', 'outcome', 'reason']) ||
    !uuid(payload.renditionId) ||
    !uuid(payload.deletionRequestId) ||
    !['approve', 'reject'].includes(payload.outcome as string) ||
    !reason(payload.reason)
  ) unavailable();
};

export const executeStudioPrivateArtifactCommand = async <
  C extends StudioPrivateArtifactCommandType,
>(
  context: TenantContextProjection,
  commandType: C,
  projection: StudioPrivateArtifactProjectionDto | null,
  rendition: StudioRenditionProjectionDto | null,
  payload: StudioPrivateArtifactCommandPayloads[C],
  idempotencyKey: string,
  transport = studioPrivateArtifactDefaultTransport,
): Promise<StudioPrivateArtifactCommandResponse> => {
  if (!STUDIO_PRIVATE_ARTIFACT_COMMAND_TYPES.includes(commandType)) unavailable();
  validatePublicCommandPayload(commandType, payload);
  const envelope: StudioPrivateArtifactCommandEnvelope = {
    requestId: crypto.randomUUID(),
    idempotencyKey,
    commandType,
    organizationId: context.organizationId,
    workspaceId: context.workspaceId,
    authorizationVersion: context.authorizationVersion,
    expectedArtifactVersion:
      commandType === 'studio.retention.policy.publish'
        ? null
        : projection?.artifactVersion ?? null,
    expectedRenditionVersion:
      commandType === 'studio.rendition.generate' ||
      commandType === 'studio.retention.policy.publish'
        ? null
        : rendition?.version ?? null,
    payload: payload as Record<string, unknown>,
  };
  try {
    return decodeStudioPrivateArtifactCommandResponse(await transport.invoke(envelope));
  } catch (error) {
    if (error instanceof StudioPrivateArtifactBoundaryError) throw error;
    throw decodeStudioPrivateArtifactSafeError(error);
  }
};

export const downloadStudioPrivateArtifact = async (
  context: TenantContextProjection,
  renditionId: string,
  idempotencyKey: string,
  transport = studioPrivateArtifactDefaultTransport,
) => {
  const request: StudioPrivateArtifactDownloadRequest = {
    requestId: crypto.randomUUID(),
    idempotencyKey,
    organizationId: context.organizationId,
    workspaceId: context.workspaceId,
    authorizationVersion: context.authorizationVersion,
    renditionId,
  };
  try {
    return await decodeStudioPrivateArtifactDownload(await transport.download(request));
  } catch (error) {
    if (error instanceof StudioPrivateArtifactBoundaryError) throw error;
    throw decodeStudioPrivateArtifactSafeError(error);
  }
};
