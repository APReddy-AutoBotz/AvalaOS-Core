import assert from 'node:assert/strict';
import { updateProcessViaCommand, type ProcessUpdateTransport } from './processUpdateClient';
import { ProcessUpdateError } from './processUpdateContract';

const actor = '11111111-1111-4111-8111-111111111111';
const organizationId = '22222222-2222-4222-8222-222222222222';
const workspaceId = '33333333-3333-4333-8333-333333333333';
const context = { userId: actor, organizationId, organizationName: 'Synthetic', workspaceId, workspaceName: 'Controlled', authorizationVersion: 7,
  capabilities: ['assess.read', 'assess.process.update'] };
const sourceProcess = { id: '44444444-4444-4444-8444-444444444444', orgId: organizationId, workspaceId, ownerId: actor,
  name: 'Before', description: '', department: 'Operations', criticality: 'Medium' as const, status: 'Not Started' as const,
  version: 3, createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z' };
const input = { name: 'After', description: 'Persisted edit', department: 'Finance', criticality: 'High' as const };
const anchor = { requestId: '55555555-5555-4555-8555-555555555555', idempotencyKey: 'process.update.synthetic-0001' };
const resource = { ...sourceProcess, ...input, version: 4, templateId: null, receiptId: '66666666-6666-4666-8666-666666666666',
  requestId: anchor.requestId, idempotencyKey: anchor.idempotencyKey, updatedAt: '2026-10-10T00:01:00Z' };
const transport = (invoke: ProcessUpdateTransport['invoke'], read: ProcessUpdateTransport['read']): ProcessUpdateTransport => ({ invoke, read });

const main = async () => {
  const success = await updateProcessViaCommand(context, sourceProcess, input, transport(
    async () => ({ ok: true, outcome: 'committed', resource }), async () => resource), anchor);
  assert.equal(success.process.name, 'After');
  assert.equal(success.process.version, 4);

  const recovered = await updateProcessViaCommand(context, sourceProcess, input, transport(
    async () => { throw new ProcessUpdateError('COMMAND_UNAVAILABLE'); }, async () => resource), anchor);
  assert.equal(recovered.process.version, 4);

  for (const substituted of [{ ...resource, workspaceId: organizationId }, { ...resource, requestId: organizationId }, { ...resource, version: 5 }, null]) {
    await assert.rejects(() => updateProcessViaCommand(context, sourceProcess, input, transport(
      async () => { throw new ProcessUpdateError('COMMAND_UNAVAILABLE'); }, async () => substituted), anchor),
    (error: any) => error.code === 'COMMAND_UNAVAILABLE');
  }
  await assert.rejects(() => updateProcessViaCommand(context, sourceProcess, input, transport(
    async () => ({ ok: false, error: { code: 'PERMISSION_DENIED' } }), async () => resource), anchor),
  (error: any) => error.code === 'PERMISSION_DENIED');
  console.log('process update client: commit, unknown recovery, and substituted readback cases passed');
};
main().catch(error => { console.error(error); process.exitCode = 1; });
