import assert from 'node:assert/strict';
import { buildProcessUpdateEnvelope, parseProcessUpdateEnvelope, parseProcessUpdateResource, ProcessUpdateError } from './processUpdateContract';

const actor = '11111111-1111-4111-8111-111111111111';
const context = { userId: actor, organizationId: '22222222-2222-4222-8222-222222222222', organizationName: 'Synthetic',
  workspaceId: '33333333-3333-4333-8333-333333333333', workspaceName: 'Controlled', authorizationVersion: 9,
  capabilities: ['assess.read', 'assess.process.update'] };
const anchor = { requestId: '44444444-4444-4444-8444-444444444444', idempotencyKey: 'process.update.contract-0001' };
const envelope = buildProcessUpdateEnvelope(context, '55555555-5555-4555-8555-555555555555', 2,
  { name: 'Updated', description: '', department: 'Finance', criticality: 'High' }, anchor);
assert.deepEqual(parseProcessUpdateEnvelope(envelope), envelope);
for (const invalid of [
  { ...envelope, actorId: actor },
  { ...envelope, expectedVersion: 0 },
  { ...envelope, payload: { ...envelope.payload, status: 'Completed' } },
  { ...envelope, payload: { ...envelope.payload, name: '' } },
]) assert.throws(() => parseProcessUpdateEnvelope(invalid), ProcessUpdateError);
const resource = { id: envelope.payload.processId, orgId: context.organizationId, workspaceId: context.workspaceId, ownerId: actor,
  name: 'Updated', description: '', department: 'Finance', criticality: 'High', status: 'Not Started', templateId: null,
  version: 3, receiptId: '66666666-6666-4666-8666-666666666666', requestId: anchor.requestId,
  idempotencyKey: anchor.idempotencyKey, createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:01:00Z' };
assert.equal(parseProcessUpdateResource(resource,envelope,actor).version,3);
assert.throws(() => parseProcessUpdateResource({ ...resource, status: 'Completed', unexpected: true },envelope,actor), ProcessUpdateError);
console.log('process update contract: exact envelopes and resources passed');
