import { completeAiJob, createAiJob, failAiJobBestEffort, recordAiUsageBestEffort } from '../_shared/audit.ts';
import { generateDocumentWithProvider, type ProviderType } from '../_shared/ai.ts';
import { handleOptions, jsonResponse, safeErrorMessage } from '../_shared/http.ts';
import { runProviderGovernedOperation } from '../_shared/providerResolverIntegration.ts';
import { getAuthUser, resolveOrgId } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  let jobId: string | undefined;
  let orgId: string | undefined;
  let userId: string | undefined;
  let provider: ProviderType = 'groq';

  try {
    const user = await getAuthUser(request);
    userId = user.id;
    const body = await request.json();
    orgId = await resolveOrgId(user.id, body.organizationId);

    const projectDetails = body.projectDetails || {};
    const source = body.source || {};
    const governed = await runProviderGovernedOperation({
      operation: 'generate_document',
      orgId,
      actorId: userId,
      requestedProvider: body.providerType || body.requestedProvider,
      requestedProviderConfigId: body.providerConfigId,
      workspaceId: body.workspaceId,
      evidenceRef: body.evidenceRef,
      correlationId: body.correlationId,
      scannerReference: 'supabase/functions/ai-generate-document/index.ts',
      runAllowed: async ({ provider: resolvedProvider, apiKey }) => {
        provider = resolvedProvider;
        const job = await createAiJob({
          orgId: orgId!,
          userId: userId!,
          jobType: 'generate_document',
          provider,
          inputRefs: {
            templateId: projectDetails.templateId,
            fileName: source.fileName || 'N/A',
            sourceProvided: Boolean(source.text?.trim()),
          },
        });
        jobId = job.id;

        return generateDocumentWithProvider(
          provider,
          projectDetails,
          source.fileName || 'N/A',
          source.text || null,
          apiKey,
        );
      },
    });

    if (governed.status === 'blocked') {
      return jsonResponse(governed.body, governed.httpStatus);
    }

    const result = governed.value;

    await recordAiUsageBestEffort({
      orgId,
      userId,
      jobId,
      provider: governed.provider,
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
    await failAiJobBestEffort(jobId, message);
    return jsonResponse({ error: message }, 400);
  }
});
