import { generateDocumentWithProvider } from '../_shared/ai.ts';
import { handleOptions, jsonResponse, safeErrorMessage } from '../_shared/http.ts';
import { runProviderGovernedOperation } from '../_shared/providerResolverIntegration.ts';
import { getAuthUser, resolveOrgId } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const user = await getAuthUser(request);
    const body = await request.json();
    const orgId = await resolveOrgId(user.id, body.organizationId);

    const governed = await runProviderGovernedOperation({
      operation: 'test_provider_connection',
      orgId,
      actorId: user.id,
      requestedProvider: body.providerType || body.requestedProvider,
      requestedProviderConfigId: body.providerConfigId,
      workspaceId: body.workspaceId,
      evidenceRef: body.evidenceRef,
      correlationId: body.correlationId,
      scannerReference: 'supabase/functions/ai-provider-test-connection/index.ts',
      runAllowed: async ({ provider, apiKey }) => {
        await generateDocumentWithProvider(
          provider,
          { company: 'Connection Test', project: 'Provider Connection Test', domain: 'AI governance' },
          'connection-test.txt',
          'Return a minimal valid document pack for a provider connection test.',
          apiKey,
        );
        return { provider };
      },
    });

    if (governed.status === 'blocked') {
      return jsonResponse({
        data: {
          connected: false,
          message: governed.body.error,
          correlationId: governed.body.correlationId,
          safeUiMessageCategory: governed.body.safeUiMessageCategory,
          retryCategory: governed.body.retryCategory,
          failureClass: governed.body.failureClass,
        },
      }, 200);
    }

    return jsonResponse({ data: { connected: true, provider: governed.provider } });
  } catch (error) {
    return jsonResponse({ data: { connected: false, message: safeErrorMessage(error) } }, 200);
  }
});
