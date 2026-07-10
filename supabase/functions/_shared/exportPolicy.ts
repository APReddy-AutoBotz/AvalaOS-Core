import { selectExportsBucket } from './storageBoundary.ts';

export const EXPORT_PERMISSION = 'docs.export';

export type ExportErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'INVALID_EXPORT_REQUEST'
  | 'EXPORT_DISABLED'
  | 'EXPORT_NOT_AVAILABLE'
  | 'EXPORT_AUTHORITY_UNAVAILABLE'
  | 'EXPORT_AUDIT_UNAVAILABLE'
  | 'EXPORT_FAILED';

const errorMessages: Record<ExportErrorCode, string> = {
  AUTHENTICATION_REQUIRED: 'Authentication is required.',
  INVALID_EXPORT_REQUEST: 'Export request is invalid.',
  EXPORT_DISABLED: 'Export is disabled.',
  EXPORT_NOT_AVAILABLE: 'Export is not available.',
  EXPORT_AUTHORITY_UNAVAILABLE: 'Export authorization is unavailable.',
  EXPORT_AUDIT_UNAVAILABLE: 'Required export audit is unavailable.',
  EXPORT_FAILED: 'Export could not be completed.',
};

const errorStatuses: Record<ExportErrorCode, number> = {
  AUTHENTICATION_REQUIRED: 401,
  INVALID_EXPORT_REQUEST: 400,
  EXPORT_DISABLED: 503,
  EXPORT_NOT_AVAILABLE: 404,
  EXPORT_AUTHORITY_UNAVAILABLE: 503,
  EXPORT_AUDIT_UNAVAILABLE: 503,
  EXPORT_FAILED: 503,
};

export class ExportControlError extends Error {
  readonly code: ExportErrorCode;
  readonly status: number;

  constructor(code: ExportErrorCode) {
    super(errorMessages[code]);
    this.name = 'ExportControlError';
    this.code = code;
    this.status = errorStatuses[code];
  }
}

export const exportError = (code: ExportErrorCode): never => {
  throw new ExportControlError(code);
};

export const asExportControlError = (error: unknown) => (
  error instanceof ExportControlError
    ? error
    : new ExportControlError('EXPORT_FAILED')
);

export type ExportRuntimeConfig = {
  enabled?: string;
  bucket?: string;
  bucketAllowlist?: string;
};

export const resolveExportRuntimeConfig = (input: ExportRuntimeConfig) => {
  if (input.enabled !== 'true') exportError('EXPORT_DISABLED');

  try {
    return { bucket: selectExportsBucket(input.bucket, input.bucketAllowlist) };
  } catch {
    return exportError('EXPORT_DISABLED');
  }
};

export type ExportFormat = 'markdown' | 'md' | 'json';

export type ParsedExportRequest = {
  organizationId?: string;
  resourceId: string;
  version: string;
  exportType: ExportFormat;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const versionPattern = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,199}$/;
const formats = new Set<ExportFormat>(['markdown', 'md', 'json']);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const readUuid = (value: unknown): string => {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    return exportError('INVALID_EXPORT_REQUEST');
  }
  return value;
};

const readVersion = (value: unknown): string => {
  if (typeof value !== 'string' || value !== value.trim() || !versionPattern.test(value)) {
    return exportError('INVALID_EXPORT_REQUEST');
  }
  return value;
};

const readFormat = (value: unknown): ExportFormat => {
  if (typeof value !== 'string' || !formats.has(value as ExportFormat)) {
    exportError('INVALID_EXPORT_REQUEST');
  }
  return value as ExportFormat;
};

const assertOnlyKeys = (record: Record<string, unknown>, allowedKeys: readonly string[]) => {
  const allowed = new Set(allowedKeys);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    exportError('INVALID_EXPORT_REQUEST');
  }
};

const readOptionalOrganizationId = (value: unknown): string | undefined => (
  value === undefined ? undefined : readUuid(value)
);

export const parseDocumentExportRequest = (body: unknown): ParsedExportRequest => {
  if (!isRecord(body)) return exportError('INVALID_EXPORT_REQUEST');
  const record = body as Record<string, unknown>;
  assertOnlyKeys(record, ['organizationId', 'documentId', 'versionId', 'exportType']);

  return {
    organizationId: readOptionalOrganizationId(record.organizationId),
    resourceId: readUuid(record.documentId),
    version: readVersion(record.versionId),
    exportType: readFormat(record.exportType),
  };
};

export const parseDecisionPackExportRequest = (body: unknown): ParsedExportRequest => {
  if (!isRecord(body)) return exportError('INVALID_EXPORT_REQUEST');
  const record = body as Record<string, unknown>;
  assertOnlyKeys(record, ['organizationId', 'assessmentId', 'scoreSetId', 'exportType']);

  return {
    organizationId: readOptionalOrganizationId(record.organizationId),
    resourceId: readUuid(record.assessmentId),
    version: readVersion(record.scoreSetId),
    exportType: readFormat(record.exportType),
  };
};

export type ExportResource<T> = {
  id: string;
  orgId: string;
  workspaceId: string | null;
  status: string;
  deletedAt: string | null;
  version: string;
  payload: T;
};

export type ExportAuthoritySnapshot<T> = {
  requestedOrganizationId: string;
  profileActive: boolean;
  organizationActive: boolean;
  organizationMembershipActive: boolean;
  organizationRolePermissions: readonly string[];
  workspaceActive: boolean;
  workspaceMembershipActive: boolean;
  workspaceRolePermissions: readonly string[];
  resource: ExportResource<T> | null;
};

export const assertExportAuthorized = <T>(
  request: ParsedExportRequest,
  snapshot: ExportAuthoritySnapshot<T>,
  allowedStatuses: readonly string[],
): ExportResource<T> => {
  const resource = snapshot.resource;
  const permissions = new Set([
    ...snapshot.organizationRolePermissions,
    ...snapshot.workspaceRolePermissions,
  ]);

  if (
    (request.organizationId !== undefined && request.organizationId !== snapshot.requestedOrganizationId) ||
    !snapshot.profileActive ||
    !snapshot.organizationActive ||
    !snapshot.organizationMembershipActive ||
    !snapshot.workspaceActive ||
    !snapshot.workspaceMembershipActive ||
    !permissions.has(EXPORT_PERMISSION) ||
    !resource ||
    resource.id !== request.resourceId ||
    resource.orgId !== snapshot.requestedOrganizationId ||
    !resource.workspaceId ||
    resource.deletedAt !== null ||
    !allowedStatuses.includes(resource.status) ||
    resource.version !== request.version
  ) {
    exportError('EXPORT_NOT_AVAILABLE');
  }

  return resource;
};

export const exportErrorResponseBody = (error: ExportControlError) => ({
  error: {
    code: error.code,
    message: error.message,
  },
});
