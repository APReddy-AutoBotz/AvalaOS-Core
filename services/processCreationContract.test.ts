import assert from 'node:assert/strict';
import { buildProcessCreateEnvelope, parseProcessCreateEnvelope, parseProcessCreateResource, ProcessCreateError } from './processCreationContract';

const actor = '11111111-1111-4111-8111-111111111111';
const org = '22222222-2222-4222-8222-222222222222';
const workspace = '33333333-3333-4333-8333-333333333333';
const processId = '44444444-4444-4444-8444-444444444444';
const requestId = '55555555-5555-4555-8555-555555555555';
const receiptId = '66666666-6666-4666-8666-666666666666';
const context = { userId: actor, organizationId: org, organizationName: 'Synthetic', workspaceId: workspace,
  workspaceName: 'Controlled', authorizationVersion: 7, capabilities: ['assess.read', 'assess.process.create'] };
const input = { name: 'Test process', description: 'Synthetic review', department: 'Finance', criticality: 'Medium' as const };
const anchor = { processId, requestId, idempotencyKey: 'process.create.synthetic-0001' };
const envelope = buildProcessCreateEnvelope(context, input, anchor);
assert.deepEqual(parseProcessCreateEnvelope(JSON.parse(JSON.stringify(envelope))), envelope);
const resource = { id: processId, orgId: org, workspaceId: workspace, ownerId: actor,
  name: input.name, description: input.description, department: input.department,
  criticality: input.criticality, status: 'Not Started', templateId: null,
  version: 1, receiptId, requestId, idempotencyKey: anchor.idempotencyKey,
  createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z' };
assert.equal(parseProcessCreateResource(resource, envelope, actor).id, processId);

const bad = (mutate: (value: any) => void) => {
  const value = structuredClone(envelope);
  mutate(value);
  assert.throws(() => parseProcessCreateEnvelope(value), (error: any) => error instanceof ProcessCreateError && error.code === 'INVALID_COMMAND');
};
bad(value => { value.actorId = actor; });
bad(value => { value.payload.ownerId = actor; });
bad(value => { value.payload.name = 'x'.repeat(201); });
bad(value => { value.payload.criticality = 'Approved'; });
bad(value => { value.payload.templateId = 'fake-template'; });
bad(value => { value.expectedVersion = 1; });
bad(value => { value.idempotencyKey = 'bad'; });
bad(value => { value.authorizationVersion = -1; });
for (const changed of [{workspaceId: org},{orgId: workspace},{ownerId: org},{requestId: org},{idempotencyKey: 'process.create.substitute'},{receiptId: 'fake'},{status: 'Approved'},{templateId:'fake-template'},{name:'different'}]) {
  assert.throws(() => parseProcessCreateResource({ ...resource, ...changed }, envelope, actor));
}
assert.throws(() => buildProcessCreateEnvelope({ ...context, capabilities: ['assess.read'] }, input, anchor),
  (error: any) => error.code === 'PERMISSION_DENIED');
assert.throws(() => buildProcessCreateEnvelope({ ...context, capabilities: ['assess.process.create'] }, input, anchor),
  (error: any) => error.code === 'PERMISSION_DENIED');
console.log('process creation contract: positive and adversarial cases passed');
