import { completeAiJob, createAiJob, recordAiUsage } from '../_shared/audit.ts';
import { refineSectionWithProvider } from '../_shared/ai.ts';
import { handleOptions, jsonResponse, safeErrorMessage } from '../_shared/http.ts';
import { runProviderGovernedOperation } from '../_shared/providerResolverIntegration.ts';
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

    const sectionTitle = body.sectionTitle || 'Document section';
    const currentContent = body.currentContent || '';
    const instructions = body.instructions || '';
    if (!instructions.trim()) throw new Error('Refinement instruction is required.');

    const governed = await runProviderGovernedOperation({
      operation: 'refine_section',
      orgId,
      actorId: userId,
      requestedProvider: body.providerType || body.requestedProvider,
      requestedProviderConfigId: body.providerConfigId,
      workspaceId: body.workspaceId,
      evidenceRef: body.evidenceRef,
      correlationId: body.correlationId,
      scannerReference: 'supabase/functions/ai-refine-section/index.ts',
      runAllowed: async ({ provider: resolvedProvider, apiKey }) => {
        provider = resolvedProvider;
        const job = await createAiJob({
          orgId: orgId!,
          userId: userId!,
          jobType: 'refine_section',
          provider,
          inputRefs: {
            documentId: body.documentId,
            versionId: body.versionId,
            sectionId: body.sectionId,
            sectionTitle,
          },
        });
        jobId = job?.id;

        return refineSectionWithProvider(provider, sectionTitle, currentContent, instructions, apiKey);
      },
    });

    if (governed.status === 'blocked') {
      return jsonResponse(governed.body, governed.httpStatus);
    }

    const result = governed.value;

    await recordAiUsage({
      orgId,
      userId,
      jobId,
      provider: governed.provider,
      model: result.usage.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
      outputArtifactType: 'document_section',
      metadata: {
        documentId: body.documentId,
        versionId: body.versionId,
        sectionId: body.sectionId,
      },
    });
    await completeAiJob(jobId, 'succeeded', { artifactType: 'document_section' });

    return jsonResponse({
      data: {
        refinedContent: result.refinedContent,
        generationJobId: jobId,
      },
    });
  } catch (error) {
    const message = safeErrorMessage(error);
    await completeAiJob(jobId, 'failed', {}, message);
    return jsonResponse({ error: message }, 400);
  }
});
