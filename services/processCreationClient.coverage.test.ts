import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildProcessCreateEnvelope, ProcessCreateError } from './processCreationContract';
import { defaultProcessCreateTransport } from './processCreationClient';

const context = { userId: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  organizationName: 'Synthetic', workspaceName: 'Controlled',
  workspaceId: '33333333-3333-4333-8333-333333333333', authorizationVersion: 7,
  capabilities: ['assess.read', 'assess.process.create'] };
const envelope = buildProcessCreateEnvelope(context, { name: 'Synthetic process', description: '', department: '', criticality: 'Medium' },
  { requestId: '55555555-5555-4555-8555-555555555555', processId: '44444444-4444-4444-8444-444444444444',
    idempotencyKey: 'process.create.synthetic-0001' });
const unavailable = (error: unknown) => error instanceof ProcessCreateError && error.code === 'COMMAND_UNAVAILABLE';
const clearMocks = () => {
  delete (globalThis as any).__creationCoverageInvoke;
  delete (globalThis as any).__creationCoverageRead;
};

test('default invoke sends one exact envelope and accepts controlled domain error only', async () => {
  try {
    (globalThis as any).__creationCoverageInvoke = (name: string, options: Record<string, unknown>) => {
      assert.equal(name, 'process-command');
      assert.equal(options.body, envelope);
      return { data: { ok: true, outcome: 'committed' }, error: null };
    };
    assert.deepEqual(await defaultProcessCreateTransport.invoke(envelope), { ok: true, outcome: 'committed' });
    (globalThis as any).__creationCoverageInvoke = () => ({ data: null, error: {
      context: new Response(JSON.stringify({ error: { code: 'PERMISSION_DENIED' } }), { status: 403 }),
    } });
    await assert.rejects(() => defaultProcessCreateTransport.invoke(envelope),
      (error: unknown) => error instanceof ProcessCreateError && error.code === 'PERMISSION_DENIED');
    (globalThis as any).__creationCoverageInvoke = () => ({ data: null, error: {
      context: new Response(JSON.stringify({ error: { code: 'raw-SQL' } }), { status: 500 }),
    } });
    await assert.rejects(() => defaultProcessCreateTransport.invoke(envelope), unavailable);
    (globalThis as any).__creationCoverageInvoke = () => ({ data: null, error: {
      context: new Response('not json', { status: 500 }),
    } });
    await assert.rejects(() => defaultProcessCreateTransport.invoke(envelope), unavailable);
  } finally { clearMocks(); }
});

test('default read is exact scope-fenced and maps only bound committed row', async () => {
  try {
    const row = {
      id: envelope.payload.processId, org_id: envelope.organizationId, workspace_id: envelope.workspaceId,
      owner_id: context.userId, name: envelope.payload.name, description: envelope.payload.description,
      department: envelope.payload.department, criticality: envelope.payload.criticality,
      status: 'Not Started', template_id: null, creation_receipt_id: '66666666-6666-4666-8666-666666666666',
      creation_request_id: envelope.requestId, creation_idempotency_key: envelope.idempotencyKey,
      created_at: '2026-09-15T00:00:00Z', updated_at: '2026-09-15T00:00:00Z',
    };
    (globalThis as any).__creationCoverageRead = (table: string, filters: unknown[]) => {
      assert.equal(table, 'assess_processes');
      assert.deepEqual(filters.filter((filter: any) => filter[0] === 'eq'), [
        ['eq', 'id', envelope.payload.processId], ['eq', 'org_id', envelope.organizationId],
        ['eq', 'workspace_id', envelope.workspaceId],
      ]);
      assert.deepEqual(filters.at(-1), ['is', 'deleted_at', null]);
      return { data: row, error: null };
    };
    const observed = await defaultProcessCreateTransport.read(envelope) as Record<string, unknown>;
    assert.equal(observed.id, row.id);
    assert.equal(observed.receiptId, row.creation_receipt_id);
    assert.equal(observed.version, 1);
    (globalThis as any).__creationCoverageRead = () => ({ data: null, error: null });
    assert.equal(await defaultProcessCreateTransport.read(envelope), null);
    (globalThis as any).__creationCoverageRead = () => ({ data: null, error: { message: 'raw sql' } });
    await assert.rejects(() => defaultProcessCreateTransport.read(envelope), unavailable);
  } finally { clearMocks(); }
});
