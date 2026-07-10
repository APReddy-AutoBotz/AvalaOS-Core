import {
  ExportAuthoritySnapshot,
  ExportControlError,
  ExportRuntimeConfig,
  ParsedExportRequest,
  assertExportAuthorized,
  exportError,
  resolveExportRuntimeConfig,
} from './exportPolicy.ts';

type AuthenticatedUser = { id: string };
type AuditJob = { id: string };

export type ExportArtifact = {
  artifactId: string;
  bucket: string;
  path: string;
};

export type ExportExecutionDependencies<T> = {
  authenticate: () => Promise<AuthenticatedUser>;
  loadAuthority: (
    userId: string,
    request: ParsedExportRequest,
  ) => Promise<ExportAuthoritySnapshot<T>>;
  createRequiredAudit: (input: {
    orgId: string;
    userId: string;
    jobType: string;
    inputRefs: Record<string, unknown>;
  }) => Promise<AuditJob>;
  completeRequiredAudit: (
    jobId: string,
    status: 'succeeded' | 'failed',
    outputRef: Record<string, unknown>,
    errorMessage?: string,
  ) => Promise<void>;
  render: (resource: T, format: ParsedExportRequest['exportType']) => string;
  upload: (input: {
    orgId: string;
    bucket: string;
    artifactType: string;
    extension: string;
    contentType: string;
    content: string;
  }) => Promise<ExportArtifact>;
};

export type ExecuteExportInput<T> = {
  request: ParsedExportRequest;
  runtimeConfig: ExportRuntimeConfig;
  jobType: string;
  artifactType: string;
  allowedStatuses: readonly string[];
  dependencies: ExportExecutionDependencies<T>;
};

export const executeExport = async <T>(input: ExecuteExportInput<T>) => {
  const { bucket } = resolveExportRuntimeConfig(input.runtimeConfig);
  const { dependencies, request } = input;

  let user: AuthenticatedUser;
  try {
    user = await dependencies.authenticate();
  } catch (error) {
    if (error instanceof ExportControlError) throw error;
    return exportError('AUTHENTICATION_REQUIRED');
  }

  let snapshot: ExportAuthoritySnapshot<T>;
  try {
    snapshot = await dependencies.loadAuthority(user.id, request);
  } catch (error) {
    if (error instanceof ExportControlError) throw error;
    return exportError('EXPORT_AUTHORITY_UNAVAILABLE');
  }

  const resource = assertExportAuthorized(request, snapshot, input.allowedStatuses);

  let auditJob: AuditJob;
  try {
    auditJob = await dependencies.createRequiredAudit({
      orgId: snapshot.requestedOrganizationId,
      userId: user.id,
      jobType: input.jobType,
      inputRefs: {
        resourceId: request.resourceId,
        version: request.version,
        exportType: request.exportType,
      },
    });
  } catch {
    return exportError('EXPORT_AUDIT_UNAVAILABLE');
  }

  const isJson = request.exportType === 'json';
  let artifact: ExportArtifact;
  try {
    const content = dependencies.render(resource.payload, request.exportType);
    artifact = await dependencies.upload({
      orgId: snapshot.requestedOrganizationId,
      bucket,
      artifactType: input.artifactType,
      extension: isJson ? 'json' : 'md',
      contentType: isJson ? 'application/json' : 'text/markdown',
      content,
    });
  } catch {
    try {
      await dependencies.completeRequiredAudit(
        auditJob.id,
        'failed',
        {},
        'EXPORT_FAILED',
      );
    } catch {
      return exportError('EXPORT_AUDIT_UNAVAILABLE');
    }
    return exportError('EXPORT_FAILED');
  }

  try {
    await dependencies.completeRequiredAudit(auditJob.id, 'succeeded', {
      artifactId: artifact.artifactId,
      bucket: artifact.bucket,
      path: artifact.path,
      resourceId: request.resourceId,
      version: request.version,
      exportType: request.exportType,
    });
  } catch {
    return exportError('EXPORT_AUDIT_UNAVAILABLE');
  }

  return {
    artifact,
    resourceId: request.resourceId,
    version: request.version,
    exportType: request.exportType,
  };
};
