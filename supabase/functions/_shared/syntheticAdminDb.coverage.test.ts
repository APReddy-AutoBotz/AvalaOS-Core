import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SyntheticAdminError } from '../../../services/syntheticAdminContract.ts';
import { createSyntheticAdminRpcAdapter, sqlScope } from './syntheticAdminDb.ts';

const transport = (fetcher: typeof fetch, timeoutMs = 80) =>
  createSyntheticAdminRpcAdapter({ url: 'https://synthetic.invalid', serviceRoleKey: 'test-only', fetcher, timeoutMs });
const failure = (code: string) => (error: unknown) => error instanceof SyntheticAdminError && error.errorCode === code;

test('RPC sends exact service-only POST binding and accepts bounded committed JSON', async () => {
  let request: { url: string; init: RequestInit } | undefined;
  const rpc = transport(async (url, init) => {
    request = { url: String(url), init: init ?? {} };
    return new Response(JSON.stringify({ status: 'reserved', version: 1 }), { status: 200 });
  });
  const args = sqlScope({ actorId: 'actor', organizationId: 'org', workspaceId: 'workspace',
    expectedAuthorizationVersion: 7, targetFingerprint: 'pinned-target' });
  assert.deepEqual(await rpc('synthetic_admin_reserve', args), { status: 'reserved', version: 1 });
  assert.equal(request?.url, 'https://synthetic.invalid/rest/v1/rpc/synthetic_admin_reserve');
  assert.equal(request?.init.method, 'POST');
  assert.equal(request?.init.redirect, 'error');
  assert.ok(request?.init.signal instanceof AbortSignal);
  assert.equal((request?.init.headers as Record<string, string>).apikey, 'test-only');
  assert.deepEqual(JSON.parse(String(request?.init.body)), args);
});

test('RPC discards raw SQL error and maps only fixed domain signal', async () => {
  const known = transport(async () => new Response(JSON.stringify({ message: 'SYNTHETIC_ADMIN_QUOTA_EXCEEDED', detail: 'raw sql' }),
    { status: 409 }));
  await assert.rejects(() => known('synthetic_admin_reserve', {}), failure('QUOTA_EXCEEDED'));
  const unknown = transport(async () => new Response(JSON.stringify({ message: 'raw sql with identifiers' }), { status: 500 }));
  await assert.rejects(() => unknown('synthetic_admin_reserve', {}), failure('TEMPORARY_FAILURE'));
  const malformed = transport(async () => new Response('not json', { status: 500 }));
  await assert.rejects(() => malformed('synthetic_admin_reserve', {}), failure('TEMPORARY_FAILURE'));
  const thrown = transport(async () => { throw new Error('private transport value'); });
  await assert.rejects(() => thrown('synthetic_admin_reserve', {}), failure('TEMPORARY_FAILURE'));
});

test('RPC caps declared and streamed response before decoding on success and failure', async () => {
  const declared = transport(async () => new Response('{}', { status: 200, headers: { 'Content-Length': '32769' } }));
  await assert.rejects(() => declared('synthetic_admin_list', {}), failure('TEMPORARY_FAILURE'));
  const oversized = transport(async () => new Response('x'.repeat(32769), { status: 500 }));
  await assert.rejects(() => oversized('synthetic_admin_list', {}), failure('TEMPORARY_FAILURE'));
  const badUtf8 = transport(async () => new Response(new Uint8Array([0xff, 0xfe]), { status: 200 }));
  await assert.rejects(() => badUtf8('synthetic_admin_list', {}), failure('TEMPORARY_FAILURE'));
});

test('RPC deadline covers hanging fetch and a stalled response stream', async () => {
  let signal: AbortSignal | undefined;
  const hanging = transport(async (_url, init) => {
    signal = init?.signal ?? undefined;
    return await new Promise<Response>(() => undefined);
  }, 20);
  await assert.rejects(() => hanging('synthetic_admin_reserve', {}), failure('TEMPORARY_FAILURE'));
  assert.equal(signal?.aborted, true);
  const stalled = transport(async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode('{')); },
  }), { status: 200 }), 20);
  await assert.rejects(() => stalled('synthetic_admin_reserve', {}), failure('TEMPORARY_FAILURE'));
});
