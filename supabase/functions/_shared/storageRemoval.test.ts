import assert from 'node:assert/strict';
import { removeTextArtifact } from './storage';

const main = async () => {
  const orgId = '11111111-1111-4111-8111-111111111111';
  const artifact = { artifactId: 'a1', bucket: 'private-exports', path: `${orgId}/generated-document/a1.json` };
  const env = new Map([['SUPABASE_URL', 'https://example.supabase.co'], ['SUPABASE_ANON_KEY', 'test-anon'], ['SUPABASE_SERVICE_ROLE_KEY', 'test-service-role']]);
  (globalThis as any).Deno = { env: { get: (key: string) => env.get(key) } };
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  globalThis.fetch = (async (url, init) => {
    calls.push([url, init]);
    return new Response(JSON.stringify([{ name: artifact.path, bucket_id: artifact.bucket }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  await removeTextArtifact(artifact, orgId);
  assert.equal(String(calls[0][0]), 'https://example.supabase.co/storage/v1/object/private-exports');
  assert.equal(calls[0][1]?.method, 'DELETE');
  assert.equal(calls[0][1]?.redirect, 'error');
  assert.equal(calls[0][1]?.body, JSON.stringify({ prefixes: [artifact.path] }));
  const headers = calls[0][1]?.headers as Record<string, string>;
  assert.ok(headers.apikey); assert.match(headers.Authorization, /^Bearer /); assert.equal(headers['Content-Type'], 'application/json');
  await assert.rejects(() => removeTextArtifact({ ...artifact, path: 'other/a1.json' }, orgId), /scoped/);
  globalThis.fetch = (async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
  await removeTextArtifact(artifact, orgId);
  for (const response of [new Response('provider detail', { status: 500 }), new Response('{broken', { status: 200 })]) {
    globalThis.fetch = (async () => response) as typeof fetch;
    await assert.rejects(() => removeTextArtifact(artifact, orgId), error => error instanceof Error && error.message === 'Storage compensation failed.');
  }
  console.log('Storage removal fetch-contract suite passed.');
};
main().catch(error => { console.error(error); process.exitCode = 1; });
