import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildProcessCreateEnvelope, ProcessCreateError } from '../../../services/processCreationContract.ts';
import { createProcessAtomicRpcAdapter, processCreationDependencies } from './processCreationDb.ts';

const context = { userId: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  organizationName: 'Synthetic', workspaceName: 'Controlled',
  workspaceId: '33333333-3333-4333-8333-333333333333', authorizationVersion: 7,
  capabilities: ['assess.read', 'assess.process.create'] };
const envelope = buildProcessCreateEnvelope(context, { name: 'Synthetic process', description: '', department: '', criticality: 'Medium' },
  { requestId: '55555555-5555-4555-8555-555555555555', processId: '44444444-4444-4444-8444-444444444444',
    idempotencyKey: 'process.create.synthetic-0001' });
const transport = (fetcher: typeof fetch, timeoutMs = 80) =>
  createProcessAtomicRpcAdapter({ url: 'https://synthetic.invalid', serviceRoleKey: 'test-only', fetcher, timeoutMs });
const unavailable = (error: unknown) => error instanceof ProcessCreateError && error.code === 'COMMAND_UNAVAILABLE';

test('atomic RPC binds server actor and exact envelope without accepting client-provided actor', async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const atomic = transport(async (url, init) => {
    seen = { url: String(url), init: init ?? {} };
    return new Response(JSON.stringify({ ok: true, outcome: 'committed' }), { status: 200 });
  });
  assert.deepEqual(await atomic(context.userId, envelope), { ok: true, outcome: 'committed' });
  assert.equal(seen?.url, 'https://synthetic.invalid/rest/v1/rpc/create_assess_process');
  assert.equal(seen?.init.method, 'POST');
  assert.equal(seen?.init.redirect, 'error');
  assert.ok(seen?.init.signal instanceof AbortSignal);
  assert.equal((seen?.init.headers as Record<string, string>).apikey, 'test-only');
  const body = JSON.parse(String(seen?.init.body));
  assert.equal(body.p_actor_id, context.userId);
  assert.equal(body.p_org_id, context.organizationId);
  assert.equal(body.p_workspace_id, context.workspaceId);
  assert.equal(body.p_authorization_version, 7);
  assert.equal(body.p_request_id, envelope.requestId);
  assert.equal(body.p_idempotency_key, envelope.idempotencyKey);
  assert.equal(body.p_process_id, envelope.payload.processId);
  assert.equal(body.p_template_id, null);
});

test('atomic RPC returns unknown for 204 and sanitizes failure, malformed, and oversized response', async () => {
  assert.equal(await transport(async () => new Response(null, { status: 204 }))(context.userId, envelope), undefined);
  await assert.rejects(() => transport(async () => new Response('raw SQL with identifiers', { status: 403 }))(context.userId, envelope), unavailable);
  await assert.rejects(() => transport(async () => new Response('not JSON', { status: 200 }))(context.userId, envelope), unavailable);
  await assert.rejects(() => transport(async () => new Response('{}', { headers: { 'Content-Length': '32769' } }))(context.userId, envelope), unavailable);
  await assert.rejects(() => transport(async () => new Response('x'.repeat(32769)))(context.userId, envelope), unavailable);
});

test('atomic RPC deadline covers hanging fetch and a stalled response stream', async () => {
  let signal: AbortSignal | undefined;
  await assert.rejects(() => transport(async (_url, init) => {
    signal = init?.signal ?? undefined;
    return await new Promise<Response>(() => undefined);
  }, 20)(context.userId, envelope), unavailable);
  assert.equal(signal?.aborted, true);
  await assert.rejects(() => transport(async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode('{')); },
  })), 20)(context.userId, envelope), unavailable);
});

test('concrete dependency authenticates bearer, resolves fresh tenant, and rejects foreign scope', async () => {
  const priorFetch = globalThis.fetch;
  const priorDeno = (globalThis as any).Deno;
  (globalThis as any).Deno = { env: { get: (key: string) => ({ SUPABASE_URL: 'https://synthetic.invalid',
    SUPABASE_ANON_KEY: 'test-anon', SUPABASE_SERVICE_ROLE_KEY: 'test-service' } as Record<string, string>)[key] } };
  const seen: string[] = [];
  const request = new Request('https://synthetic.invalid/process-command', { headers: { Authorization: 'Bearer test-user' } });
  try {
    globalThis.fetch = (async (url) => {
      const target = String(url); seen.push(target);
      if (target.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: context.userId }));
      if (target.endsWith('/rpc/get_tenant_context')) return new Response(JSON.stringify({
        userId: context.userId, organizationId: context.organizationId, workspaceId: context.workspaceId,
        authorizationVersion: context.authorizationVersion, capabilities: context.capabilities,
      }));
      throw new Error('UNEXPECTED_LIVE_COVERAGE_TRANSPORT');
    }) as typeof fetch;
    assert.equal((await processCreationDependencies.authenticate(request)).id, context.userId);
    const authority = await processCreationDependencies.authority(request, context.userId, envelope);
    assert.equal(authority?.userId, context.userId);
    assert.deepEqual(authority?.capabilities, ['assess.process.create', 'assess.read']);
    assert.deepEqual(seen, ['https://synthetic.invalid/auth/v1/user', 'https://synthetic.invalid/rest/v1/rpc/get_tenant_context']);
    assert.equal(await processCreationDependencies.authority(request, context.organizationId, envelope), null);
    globalThis.fetch = (async () => new Response(null, { status: 403 })) as typeof fetch;
    assert.equal(await processCreationDependencies.authority(request, context.userId, envelope), null);
  } finally { globalThis.fetch = priorFetch; (globalThis as any).Deno = priorDeno; }
});
