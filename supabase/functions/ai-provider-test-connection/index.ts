import { assertSupportedProvider, generateDocumentWithProvider } from '../_shared/ai.ts';
import { handleOptions, jsonResponse, safeErrorMessage } from '../_shared/http.ts';
import { getAuthUser, resolveOrgId } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const user = await getAuthUser(request);
    const body = await request.json();
    await resolveOrgId(user.id, body.organizationId);
    const provider = assertSupportedProvider(body.providerType || 'groq');

    await generateDocumentWithProvider(
      provider,
      { company: 'Connection Test', project: 'Provider Connection Test', domain: 'AI governance' },
      'connection-test.txt',
      'Return a minimal valid document pack for a provider connection test.',
    );

    return jsonResponse({ data: { connected: true, provider } });
  } catch (error) {
    return jsonResponse({ data: { connected: false, message: safeErrorMessage(error) } }, 200);
  }
});
