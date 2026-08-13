const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const bad = (status, error) => new Response(JSON.stringify({ error }), { status, headers: jsonHeaders });

function verifierUpstream() {
  const raw = process.env.HOSTED_PILOT_VERIFIER_UPSTREAM;
  if (!raw) throw new Error('HOSTED_PILOT_VERIFIER_UPSTREAM_MISSING');
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || !url.hostname.endsWith('.supabase.co')
    || url.pathname !== '/functions/v1/hosted-pilot-github-verifier') {
    throw new Error('HOSTED_PILOT_VERIFIER_UPSTREAM_INVALID');
  }
  return url.toString();
}

export default async function handler(request) {
  try {
    if (request.method !== 'POST') return bad(405, 'METHOD_NOT_ALLOWED');
    const authorization = request.headers.get('authorization') ?? '';
    if (!authorization.startsWith('Bearer ') || authorization.length > 13000) return bad(401, 'OIDC_TOKEN_REQUIRED');
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('application/json')) return bad(415, 'CONTENT_TYPE_REQUIRED');
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 32768) return bad(413, 'REQUEST_TOO_LARGE');

    const response = await fetch(verifierUpstream(), {
      method: 'POST',
      headers: {
        authorization,
        'content-type': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(20000),
    });
    const responseBody = await response.text();
    return new Response(responseBody, {
      status: response.status,
      headers: jsonHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'HOSTED_PILOT_VERIFIER_PROXY_FAILED';
    const publicCode = message.replace(/[^A-Z0-9_]/g, '_').slice(0, 96) || 'HOSTED_PILOT_VERIFIER_PROXY_FAILED';
    console.error(publicCode);
    return bad(502, publicCode);
  }
}
