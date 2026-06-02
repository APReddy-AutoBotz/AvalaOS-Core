import { recordAiUsage } from '../_shared/audit.ts';
import { handleOptions, jsonResponse, safeErrorMessage } from '../_shared/http.ts';
import { getAuthUser, resolveOrgId } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const user = await getAuthUser(request);
    const body = await request.json();
    const orgId = await resolveOrgId(user.id, body.organizationId);

    await recordAiUsage({
      orgId,
      userId: user.id,
      jobId: body.jobId,
      provider: body.provider || 'unknown',
      model: body.model,
      inputTokens: body.inputTokens || 0,
      outputTokens: body.outputTokens || 0,
      totalTokens: body.totalTokens || 0,
      outputArtifactType: body.outputArtifactType,
      outputArtifactId: body.outputArtifactId,
      metadata: body.metadata || {},
    });

    return jsonResponse({ data: { recorded: true } });
  } catch (error) {
    return jsonResponse({ error: safeErrorMessage(error) }, 400);
  }
});
