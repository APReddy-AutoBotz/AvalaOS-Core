import { completeAiJob, createAiJob } from '../_shared/audit.ts';
import { handleOptions, jsonResponse, safeErrorMessage } from '../_shared/http.ts';
import { getAuthUser, resolveOrgId } from '../_shared/supabase.ts';
import { assertTenantStoragePath, downloadStoredFile, resolveSourceUploadsBucket } from '../_shared/storage.ts';

const supportedTextTypes = new Set(['txt', 'md', 'markdown', 'csv', 'json', 'text/plain', 'text/markdown', 'application/json']);

const chunkText = (text: string, chunkSize = 3000) => {
  const chunks: { index: number; text: string }[] = [];
  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push({ index: chunks.length, text: text.slice(index, index + chunkSize) });
  }
  return chunks;
};

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  let jobId: string | undefined;

  try {
    const user = await getAuthUser(request);
    const body = await request.json();
    const orgId = await resolveOrgId(user.id, body.organizationId);
    const fileId = String(body.fileId || '');
    const storagePath = String(body.storagePath || '');
    const fileType = String(body.fileType || '').toLowerCase();
    const bucket = resolveSourceUploadsBucket();

    if (!fileId) throw new Error('fileId is required.');
    assertTenantStoragePath(orgId, storagePath);

    const job = await createAiJob({
      orgId,
      userId: user.id,
      jobType: 'extract_document_text',
      inputRefs: { fileId, storagePath, fileType },
    });
    jobId = job?.id;

    if (!supportedTextTypes.has(fileType)) {
      throw new Error('Only text, Markdown, CSV, and JSON extraction are implemented in this Edge Function source. Binary PDF/DOCX extraction requires a dedicated extractor before pilot use.');
    }

    const blob = await downloadStoredFile({ orgId, bucket, storagePath });
    const text = await blob.text();
    const chunks = chunkText(text);

    await completeAiJob(jobId, 'succeeded', { fileId, chunkCount: chunks.length, status: 'extracted' });

    return jsonResponse({
      data: {
        fileId,
        text,
        chunks,
        status: 'extracted',
        warnings: chunks.length ? [] : ['The extracted text is empty.'],
      },
    });
  } catch (error) {
    const message = safeErrorMessage(error);
    await completeAiJob(jobId, 'failed', {}, message);
    return jsonResponse({ error: message }, 400);
  }
});
