import assert from 'node:assert/strict';
import { removeTextArtifact } from './storage';

const main = async () => {
  const orgId = '11111111-1111-4111-8111-111111111111';
  const artifact = { artifactId: 'a1', bucket: 'private-exports', path: `${orgId}/generated-document/a1.json` };
  const env = new Map([
    ['SUPABASE_URL', 'https://example.supabase.co'],
    ['SUPABASE_ANON_KEY', 'test-anon'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'test-service-role'],
  ]);
  (globalThis as any).Deno = { env: { get: (key: string) => env.get(key) } };

  const response = (body: unknown, status = 200) => new Response(
    typeof body === 'string' ? body : JSON.stringify(body),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
  const setResponse = (next: Response, calls?: Array<[RequestInfo | URL, RequestInit | undefined]>) => {
    globalThis.fetch = (async (url, init) => {
      calls?.push([url, init]);
      return next;
    }) as typeof fetch;
  };
  const rejectsSanitized = async (next: Response) => {
    setResponse(next);
    await assert.rejects(
      () => removeTextArtifact(artifact, orgId),
      error => error instanceof Error && error.message === 'Storage compensation failed.',
    );
  };

  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  setResponse(response([{ name: artifact.path }]), calls);
  await removeTextArtifact(artifact, orgId);
  assert.equal(String(calls[0][0]), 'https://example.supabase.co/storage/v1/object/private-exports');
  assert.equal(calls[0][1]?.method, 'DELETE');
  assert.equal(calls[0][1]?.redirect, 'error');
  assert.equal(calls[0][1]?.body, JSON.stringify({ prefixes: [artifact.path] }));
  const headers = calls[0][1]?.headers as Record<string, string>;
  assert.ok(headers.apikey);
  assert.match(headers.Authorization, /^Bearer /);
  assert.equal(headers['Content-Type'], 'application/json');

  setResponse(response([{ name: artifact.path, bucket_id: artifact.bucket }]));
  await removeTextArtifact(artifact, orgId);
  await rejectsSanitized(response([{ name: artifact.path, bucket_id: 'wrong-bucket' }]));
  await rejectsSanitized(response([{ name: `${orgId}/generated-document/wrong.json` }]));
  setResponse(response([]));
  await removeTextArtifact(artifact, orgId);

  for (const invalid of [
    response({ name: artifact.path }),
    response([null]),
    response([{ name: 42 }]),
    response([{ name: artifact.path, bucket_id: 42 }]),
    response('{broken'),
    response('provider detail', 500),
  ]) await rejectsSanitized(invalid);

  await assert.rejects(
    () => removeTextArtifact({ ...artifact, path: 'other/a1.json' }, orgId),
    /scoped/,
  );
  console.log('Storage removal fetch-contract suite passed.');
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
