import { completeAiJob, createAiJob } from '../_shared/audit.ts';
import { renderDecisionPackJson, renderDecisionPackMarkdown } from '../_shared/export.ts';
import { handleOptions, jsonResponse, safeErrorMessage } from '../_shared/http.ts';
import { getAuthUser, postgrest, resolveOrgId } from '../_shared/supabase.ts';
import { uploadTextArtifact } from '../_shared/storage.ts';

const normalizeExportType = (value: unknown) => String(value || 'json').toLowerCase();

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  let jobId: string | undefined;

  try {
    const user = await getAuthUser(request);
    const body = await request.json();
    const orgId = await resolveOrgId(user.id, body.organizationId);
    const assessmentId = String(body.assessmentId || '');
    const scoreSetId = body.scoreSetId ? String(body.scoreSetId) : undefined;
    const exportType = normalizeExportType(body.exportType);

    if (!assessmentId) throw new Error('assessmentId is required.');
    if (!['markdown', 'md', 'json'].includes(exportType)) {
      throw new Error('Only Markdown and JSON Decision Pack exports are implemented in this Edge Function source. Server-side PDF rendering remains pending.');
    }

    const rows = await postgrest<Record<string, unknown>[]>(
      `assessments?select=*&id=eq.${encodeURIComponent(assessmentId)}&org_id=eq.${encodeURIComponent(orgId)}`,
      { method: 'GET' },
    );
    const assessmentRow = rows[0];
    if (!assessmentRow) throw new Error('Assessment was not found for this organization.');

    const job = await createAiJob({
      orgId,
      userId: user.id,
      jobType: 'export_decision_pack',
      inputRefs: { assessmentId, scoreSetId, exportType },
    });
    jobId = job?.id;

    const isJson = exportType === 'json';
    const content = isJson ? renderDecisionPackJson(assessmentRow) : renderDecisionPackMarkdown(assessmentRow);
    const artifact = await uploadTextArtifact({
      orgId,
      artifactType: 'decision-pack',
      extension: isJson ? 'json' : 'md',
      contentType: isJson ? 'application/json' : 'text/markdown',
      content,
    });

    await completeAiJob(jobId, 'succeeded', {
      artifactId: artifact.artifactId,
      bucket: artifact.bucket,
      path: artifact.path,
      assessmentId,
      scoreSetId,
      exportType,
    });

    return jsonResponse({
      data: {
        exportArtifactId: artifact.artifactId,
        downloadReference: {
          bucket: artifact.bucket,
          path: artifact.path,
        },
        assessmentId,
        scoreSetId,
        exportType,
      },
    });
  } catch (error) {
    const message = safeErrorMessage(error);
    await completeAiJob(jobId, 'failed', {}, message);
    return jsonResponse({ error: message }, 400);
  }
});
