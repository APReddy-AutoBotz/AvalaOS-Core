import { completeAiJob, createAiJob, recordAiUsage } from '../_shared/audit.ts';
import { assertSupportedProvider, generateDocumentWithProvider } from '../_shared/ai.ts';
import { handleOptions, jsonResponse, safeErrorMessage } from '../_shared/http.ts';
import { getAuthUser, resolveOrgId } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  let jobId: string | undefined;
  let orgId: string | undefined;
  let userId: string | undefined;
  let provider = 'groq';

  try {
    const user = await getAuthUser(request);
    userId = user.id;
    const body = await request.json();
    orgId = await resolveOrgId(user.id, body.organizationId);
    provider = assertSupportedProvider(body.providerType || 'groq');

    const projectDetails = body.projectDetails || {};
    const source = body.source || {};
    const job = await createAiJob({
      orgId,
      userId,
      jobType: 'generate_document',
      provider,
      inputRefs: {
        templateId: projectDetails.templateId,
        fileName: source.fileName || 'N/A',
        sourceProvided: Boolean(source.text?.trim()),
      },
    });
    jobId = job?.id;

    const result = await generateDocumentWithProvider(
      provider,
      projectDetails,
      source.fileName || 'N/A',
      source.text || null,
    );

    await recordAiUsage({
      orgId,
      userId,
      jobId,
      provider,
      model: result.usage.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
      outputArtifactType: 'generated_document',
      metadata: { sourceProvided: Boolean(source.text?.trim()) },
    });
    await completeAiJob(jobId, 'succeeded', { artifactType: 'generated_document' });

    return jsonResponse({
      data: {
        ...result.artifacts,
        generationJobId: jobId,
      },
    });
  } catch (error) {
    const message = safeErrorMessage(error);
    await completeAiJob(jobId, 'failed', {}, message);
    return jsonResponse({ error: message }, 400);
  }
});
