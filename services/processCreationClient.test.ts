import assert from 'node:assert/strict';
import { createProcessViaCommand, type ProcessCreateTransport } from './processCreationClient';
import { ProcessCreateError } from './processCreationContract';

const context = { userId: '11111111-1111-4111-8111-111111111111', organizationId: '22222222-2222-4222-8222-222222222222', organizationName: 'Synthetic',
  workspaceId: '33333333-3333-4333-8333-333333333333', workspaceName: 'Controlled', authorizationVersion: 7,
  capabilities: ['assess.read', 'assess.process.create'] };
const input = { name: 'Test process', description: '', department: '', criticality: 'Medium' as const };
const anchor = { requestId: '55555555-5555-4555-8555-555555555555', processId: '44444444-4444-4444-8444-444444444444', idempotencyKey: 'process.create.synthetic-0001' };
const resource = { id: anchor.processId, orgId: context.organizationId, workspaceId: context.workspaceId, ownerId: context.userId,
  name: input.name, description: '', department: '', criticality: 'Medium', status: 'Not Started', templateId: null,
  version: 1, receiptId: '66666666-6666-4666-8666-666666666666', requestId: anchor.requestId,
  idempotencyKey: anchor.idempotencyKey, createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z' };
let reads = 0;
const transport = (invoke: ProcessCreateTransport['invoke'], read: ProcessCreateTransport['read']): ProcessCreateTransport => ({ invoke, read });
const main = async () => {
const success = await createProcessViaCommand(context, input, transport(
  async () => ({ ok: true, outcome: 'committed', resource }), async () => { reads++; return resource; }), anchor);
assert.equal(success.process.id, anchor.processId);
assert.equal(reads, 1);
const recovered = await createProcessViaCommand(context, input, transport(
  async () => { throw new ProcessCreateError('COMMAND_UNAVAILABLE'); }, async () => resource), anchor);
assert.equal(recovered.process.id, anchor.processId);
for (const substituted of [{...resource, workspaceId: context.organizationId}, {...resource, requestId: context.organizationId}, {...resource, ownerId: context.organizationId}, {...resource, idempotencyKey: 'wrong'}, null]) {
  await assert.rejects(() => createProcessViaCommand(context, input, transport(
    async () => { throw new ProcessCreateError('COMMAND_UNAVAILABLE'); }, async () => substituted), anchor),
    (error: any) => error.code === 'COMMAND_UNAVAILABLE');
}
reads = 0;
await assert.rejects(() => createProcessViaCommand(context, input, transport(
  async () => ({ ok: false, error: { code: 'PERMISSION_DENIED' } }), async () => { reads++; return resource; }), anchor),
  (error: any) => error.code === 'PERMISSION_DENIED');
assert.equal(reads, 0);
await assert.rejects(() => createProcessViaCommand(context, input, transport(
  async () => ({ ok: true, outcome: 'committed', resource }), async () => ({ ...resource, receiptId: context.organizationId })), anchor),
  (error: any) => error.code === 'COMMAND_UNAVAILABLE');
console.log('process creation client: commit, unknown recovery, and substituted readback cases passed');
};
main().catch(error => { console.error(error); process.exitCode = 1; });
