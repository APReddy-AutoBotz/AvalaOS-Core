import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildProcessCreateEnvelope } from '../../../services/processCreationContract.ts';
import { handleProcessCreationRequest } from './processCreationCommand.ts';
import { handleSyntheticAdminRequest } from './syntheticAdminEndpoint.ts';
import { CreationAccessBodyError, readBoundedCreationJson } from './creationAccessRequestBody.ts';

const URL = 'https://synthetic.invalid/functions/v1/process-command';
const bodyRequest = (body: BodyInit, headers?: HeadersInit) =>
  new Request(URL, { method: 'POST', body, headers, duplex: 'half' } as RequestInit);
const invalid = (error: unknown) => error instanceof CreationAccessBodyError;

test('declared and streamed byte limits reject before parsing', async () => {
  await assert.rejects(() => readBoundedCreationJson(bodyRequest('{}', { 'Content-Length': '32769' }),
    { maxBytes: 32768 }), invalid);
  await assert.rejects(() => readBoundedCreationJson(bodyRequest('{}', { 'Content-Length': 'not-an-integer' }),
    { maxBytes: 32768 }), invalid);
  const streamed = bodyRequest(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(8193)); controller.close(); },
  }));
  await assert.rejects(() => readBoundedCreationJson(streamed, { maxBytes: 8192 }), invalid);
});

test('stalled ingress hits bounded deadline and cancellation does not block finalizer', async () => {
  let cancelled = false;
  const request = bodyRequest(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode('{')); },
    cancel() { cancelled = true; return new Promise<void>(() => undefined); },
  }));
  const started = Date.now();
  await assert.rejects(() => readBoundedCreationJson(request, { maxBytes: 8192, timeoutMs: 20 }), invalid);
  assert.ok(Date.now() - started < 1000);
  assert.equal(cancelled, true);
});

test('invalid UTF-8, invalid JSON, and invalid raw code-unit length fail closed', async () => {
  await assert.rejects(() => readBoundedCreationJson(bodyRequest(new Uint8Array([0xff, 0xfe])),
    { maxBytes: 8192 }), invalid);
  await assert.rejects(() => readBoundedCreationJson(bodyRequest('{'), { maxBytes: 8192 }), invalid);
  await assert.rejects(() => readBoundedCreationJson(bodyRequest('"' + 'x'.repeat(4096) + '"'),
    { maxBytes: 8192, maxCodeUnits: 4096 }), invalid);
  assert.deepEqual(await readBoundedCreationJson(bodyRequest('{"ok":true}'), { maxBytes: 8192 }), { ok: true });
});

test('process endpoint accepts valid escaped Unicode at 4000 code units and preserves exact binding', async () => {
  const context = { userId: '11111111-1111-4111-8111-111111111111',
    organizationId: '22222222-2222-4222-8222-222222222222', organizationName: 'Synthetic',
    workspaceId: '33333333-3333-4333-8333-333333333333', workspaceName: 'Controlled',
    authorizationVersion: 7, capabilities: ['assess.read', 'assess.process.create'] };
  const description = '🧠'.repeat(2000);
  const envelope = buildProcessCreateEnvelope(context,
    { name: 'Synthetic process', description, department: 'Engineering', criticality: 'Medium' },
    { requestId: '55555555-5555-4555-8555-555555555555', processId: '44444444-4444-4444-8444-444444444444',
      idempotencyKey: 'process.create.synthetic-0001' });
  const escaped = JSON.stringify(envelope).replaceAll('🧠', '\\ud83e\\udde0');
  assert.ok(new TextEncoder().encode(escaped).byteLength < 32768);
  let atomic = 0;
  const response = await handleProcessCreationRequest(bodyRequest(escaped), {
    authenticate: async () => ({ id: context.userId }), authority: async () => context,
    atomic: async (_actor, observed) => {
      atomic++;
      assert.equal(observed.payload.description, description);
      return { ok: true, outcome: 'committed', resource: {
        id: observed.payload.processId, orgId: context.organizationId, workspaceId: context.workspaceId,
        ownerId: context.userId, name: observed.payload.name, description, department: observed.payload.department,
        criticality: 'Medium', status: 'Not Started', templateId: null, version: 1,
        receiptId: '66666666-6666-4666-8666-666666666666', requestId: observed.requestId,
        idempotencyKey: observed.idempotencyKey, createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z',
      } };
    },
  });
  assert.equal(response.status, 200);
  assert.equal(atomic, 1);
});

test('both new endpoints reject oversized ingress before Auth or SQL effects', async () => {
  let effects = 0;
  const oversized = bodyRequest('{}', { 'Content-Length': '32769' });
  const processResponse = await handleProcessCreationRequest(oversized, {
    authenticate: async () => { effects++; return { id: 'actor' }; },
    authority: async () => { effects++; return null; },
    atomic: async () => { effects++; return null; },
  });
  assert.equal(processResponse.status, 400);
  assert.equal((await processResponse.json()).error.code, 'INVALID_COMMAND');
  const adminResponse = await handleSyntheticAdminRequest(bodyRequest('{}', { 'Content-Length': '8193' }), {
    targetConfig: () => ({ enabled: true, fingerprint: `sha256:${'a'.repeat(64)}` }),
    getUser: async () => { effects++; return { id: 'actor' }; },
    rpc: async () => { effects++; return { status: 'listed', roster: [] }; },
  } as any);
  assert.equal(adminResponse.status, 400);
  assert.equal((await adminResponse.json()).errorCode, 'INVALID_REQUEST');
  assert.equal(effects, 0);
});
