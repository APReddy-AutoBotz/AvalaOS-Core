import { completeAiJob, createAiJob } from '../_shared/audit.ts';
import { loadDecisionPackExportAuthority } from '../_shared/exportDb.ts';
import { executeExport } from '../_shared/exportHandler.ts';
import {
  asExportControlError,
  exportError,
  exportErrorResponseBody,
  parseDecisionPackExportRequest,
} from '../_shared/exportPolicy.ts';
import { renderDecisionPackJson, renderDecisionPackMarkdown } from '../_shared/export.ts';
import { handleOptions, jsonResponse } from '../_shared/http.ts';
import { getAuthUser } from '../_shared/supabase.ts';
import { uploadTextArtifact } from '../_shared/storage.ts';

const DECISION_PACK_EXPORT_STATUSES = [
  'Approved',
  'Completed',
  'Handed Off to Docs',
  'Handed Off to Delivery',
] as const;

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

    const parsedRequest = parseDecisionPackExportRequest(body);
    const result = await executeExport({
      request: parsedRequest,
      runtimeConfig: {
        enabled: Deno.env.get('EDGE_EXPORTS_ENABLED'),
        bucket: Deno.env.get('EXPORTS_BUCKET'),
        bucketAllowlist: Deno.env.get('EXPORTS_BUCKET_ALLOWLIST'),
      },
      jobType: 'export_decision_pack',
      artifactType: 'decision-pack',
      allowedStatuses: DECISION_PACK_EXPORT_STATUSES,
      dependencies: {
        authenticate: () => getAuthUser(request),
        loadAuthority: loadDecisionPackExportAuthority,
        createRequiredAudit: createAiJob,
        completeRequiredAudit: completeAiJob,
        render: (row, format) => format === 'json'
          ? renderDecisionPackJson(row)
          : renderDecisionPackMarkdown(row),
        upload: uploadTextArtifact,
      },
    });

    return jsonResponse({
      data: {
        exportArtifactId: result.artifact.artifactId,
        downloadReference: {
          bucket: result.artifact.bucket,
          path: result.artifact.path,
        },
        assessmentId: result.resourceId,
        scoreSetId: result.version,
        exportType: result.exportType,
      },
    });
  } catch (error) {
    const controlled = asExportControlError(error);
    return jsonResponse(exportErrorResponseBody(controlled), controlled.status);
  }
});
