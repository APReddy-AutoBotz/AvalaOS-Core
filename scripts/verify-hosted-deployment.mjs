import { pathToFileURL } from 'node:url';
import { validateHostedUrl } from './verify-hosted-pilot-evidence.mjs';

export async function verifyHostedDeployment({ hostedUrl, expectedHead, fetchImpl = fetch }) {
  if (!/^[0-9a-f]{40}$/.test(expectedHead)) throw new Error('expected head must be a full Git SHA');
  const origin = validateHostedUrl(hostedUrl);
  const response = await fetchImpl(origin, { redirect: 'error', headers: { Accept: 'text/html', 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`hosted target returned HTTP ${response.status}`);
  const release = response.headers.get('x-avalaos-release');
  const environment = response.headers.get('x-avalaos-environment');
  if (release !== expectedHead || environment !== 'hosted_nonproduction_pilot') throw new Error('hosted target release/environment identity mismatch');
  const body = await response.text();
  if (!body.includes('<div id="root"></div>') || /service[_-]?role|SUPABASE_DB_URL|PRODUCTION_AUTHORIZED/i.test(body)) throw new Error('hosted response contract failed');
  return { origin, release, environment };
}

async function main() {
  const result = await verifyHostedDeployment({ hostedUrl: process.env.HOSTED_PILOT_URL, expectedHead: process.env.EXPECTED_RELEASE_SHA });
  console.log(JSON.stringify({ status: 'passed', release: result.release, environment: result.environment }));
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((error) => { console.error(`HOSTED_DEPLOYMENT_REJECTED: ${error.message}`); process.exitCode = 1; });
