import { completeAiJob, createAiJob } from '../_shared/audit.ts';
import { loadDocumentExportAuthority } from '../_shared/exportDb.ts';
import { executeExport } from '../_shared/exportHandler.ts';
import {
  asExportControlError,
  exportError,
  exportErrorResponseBody,
  parseDocumentExportRequest,
} from '../_shared/exportPolicy.ts';
import { renderGeneratedDocumentMarkdown } from '../_shared/export.ts';
import { handleOptions, jsonResponse } from '../_shared/http.ts';
import { getAuthUser } from '../_shared/supabase.ts';
import { prepareTextArtifact, removeTextArtifact, uploadTextArtifact } from '../_shared/storage.ts';

const DOCUMENT_EXPORT_STATUSES = ['generated', 'draft'] as const;

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      exportError('INVALID_EXPORT_REQUEST');
    }

    const parsedRequest = parseDocumentExportRequest(body);
    const result = await executeExport({
      request: parsedRequest,
      runtimeConfig: {
        enabled: Deno.env.get('EDGE_EXPORTS_ENABLED'),
        bucket: Deno.env.get('EXPORTS_BUCKET'),
        bucketAllowlist: Deno.env.get('EXPORTS_BUCKET_ALLOWLIST'),
      },
      jobType: 'export_document',
      artifactType: 'generated-document',
      allowedStatuses: DOCUMENT_EXPORT_STATUSES,
      dependencies: {
        authenticate: () => getAuthUser(request),
        loadAuthority: loadDocumentExportAuthority,
        createRequiredAudit: createAiJob,
        completeRequiredAudit: completeAiJob,
        render: (row, format) => format === 'json'
          ? JSON.stringify(row, null, 2)
          : renderGeneratedDocumentMarkdown(row),
        prepareArtifact: prepareTextArtifact,
        upload: uploadTextArtifact,
        remove: removeTextArtifact,
      },
    });

    return jsonResponse({
      data: {
        exportArtifactId: result.artifact.artifactId,
        downloadReference: {
          bucket: result.artifact.bucket,
          path: result.artifact.path,
        },
        documentId: result.resourceId,
        versionId: result.version,
        exportType: result.exportType,
      },
    });
  } catch (error) {
    const controlled = asExportControlError(error);
    return jsonResponse(exportErrorResponseBody(controlled), controlled.status);
  }
});
