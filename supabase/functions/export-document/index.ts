import { completeAiJob, createAiJob } from '../_shared/audit.ts';
import { renderGeneratedDocumentMarkdown } from '../_shared/export.ts';
import { handleOptions, jsonResponse, safeErrorMessage } from '../_shared/http.ts';
import { getAuthUser, postgrest, resolveOrgId } from '../_shared/supabase.ts';
import { uploadTextArtifact } from '../_shared/storage.ts';

const normalizeExportType = (value: unknown) => String(value || 'markdown').toLowerCase();

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  let jobId: string | undefined;

  try {
    const user = await getAuthUser(request);
    const body = await request.json();
    const orgId = await resolveOrgId(user.id, body.organizationId);
    const documentId = String(body.documentId || '');
    const versionId = body.versionId ? String(body.versionId) : undefined;
    const exportType = normalizeExportType(body.exportType);

    if (!documentId) throw new Error('documentId is required.');
    if (!['markdown', 'md', 'json'].includes(exportType)) {
      throw new Error('Only Markdown and JSON document exports are implemented in this Edge Function source. Server-side DOCX/PDF rendering remains pending.');
    }

    const rows = await postgrest<Record<string, unknown>[]>(
      `document_generations?select=*&id=eq.${encodeURIComponent(documentId)}&org_id=eq.${encodeURIComponent(orgId)}`,
      { method: 'GET' },
    );
    const documentRow = rows[0];
    if (!documentRow) throw new Error('Generated document was not found for this organization.');

    const job = await createAiJob({
      orgId,
      userId: user.id,
      jobType: 'export_document',
      inputRefs: { documentId, versionId, exportType },
    });
    jobId = job?.id;

    const isJson = exportType === 'json';
    const content = isJson ? JSON.stringify(documentRow, null, 2) : renderGeneratedDocumentMarkdown(documentRow);
    const artifact = await uploadTextArtifact({
      orgId,
      artifactType: 'generated-document',
      extension: isJson ? 'json' : 'md',
      contentType: isJson ? 'application/json' : 'text/markdown',
      content,
    });

    await completeAiJob(jobId, 'succeeded', {
      artifactId: artifact.artifactId,
      bucket: artifact.bucket,
      path: artifact.path,
      documentId,
      versionId,
      exportType,
    });

    return jsonResponse({
      data: {
        exportArtifactId: artifact.artifactId,
        downloadReference: {
          bucket: artifact.bucket,
          path: artifact.path,
        },
        documentId,
        versionId,
        exportType,
      },
    });
  } catch (error) {
    const message = safeErrorMessage(error);
    await completeAiJob(jobId, 'failed', {}, message);
    return jsonResponse({ error: message }, 400);
  }
});
