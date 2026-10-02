import assert from 'node:assert/strict';
import { handleProcessCreationRequest, type ProcessCreationDependencies } from './processCreationCommand.ts';
import { buildProcessCreateEnvelope } from '../../../services/processCreationContract.ts';

const actor = '11111111-1111-4111-8111-111111111111';
const org = '22222222-2222-4222-8222-222222222222';
const workspace = '33333333-3333-4333-8333-333333333333';
const context = { userId: actor, organizationId: org, organizationName: 'Synthetic', workspaceId: workspace,
  workspaceName: 'Controlled', authorizationVersion: 7, capabilities: ['assess.read', 'assess.process.create'] };
const envelope = buildProcessCreateEnvelope(context, { name: 'Test process', description: '', department: '', criticality: 'Medium' },
  { requestId: '55555555-5555-4555-8555-555555555555', processId: '44444444-4444-4444-8444-444444444444', idempotencyKey: 'process.create.synthetic-0001' });
const resource = { id: envelope.payload.processId, orgId: org, workspaceId: workspace, ownerId: actor,
  name: envelope.payload.name, description: '', department: '', criticality: 'Medium', status: 'Not Started', templateId: null,
  version: 1, receiptId: '66666666-6666-4666-8666-666666666666', requestId: envelope.requestId,
  idempotencyKey: envelope.idempotencyKey, createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z' };
const request = (body: unknown) => new Request('https://example.test/process-command', { method: 'POST', body: JSON.stringify(body) });
const exercise = async (overrides: Partial<ProcessCreationDependencies>, expected: number, expectedAtomic: number) => {
  let atomic = 0;
  const atomicHandler = overrides.atomic ?? (async () => ({ ok: true, outcome: 'committed', resource }));
  const dependencies: ProcessCreationDependencies = {
    authenticate: overrides.authenticate ?? (async () => ({ id: actor })),
    authority: overrides.authority ?? (async () => context),
    atomic: async (actorId, command) => { atomic++; return atomicHandler(actorId, command); },
  };
  const response = await handleProcessCreationRequest(request(envelope), dependencies);
  assert.equal(response.status, expected);
  assert.equal(atomic, expectedAtomic);
  return response.json();
};
const main = async () => {
assert.equal((await exercise({}, 200, 1)).ok, true);
assert.equal((await exercise({ authenticate: async () => { throw new Error('no session'); } }, 401, 0)).error.code, 'AUTHENTICATION_REQUIRED');
assert.equal((await exercise({ authority: async () => null }, 403, 0)).error.code, 'PERMISSION_DENIED');
assert.equal((await exercise({ authority: async () => ({ ...context, organizationId: workspace }) }, 403, 0)).error.code, 'PERMISSION_DENIED');
assert.equal((await exercise({ authority: async () => ({ ...context, authorizationVersion: 8 }) }, 409, 0)).error.code, 'AUTHORITY_STALE');
assert.equal((await exercise({ authority: async () => ({ ...context, capabilities: ['assess.read'] }) }, 403, 0)).error.code, 'PERMISSION_DENIED');
assert.equal((await exercise({ authority: async () => ({ ...context, capabilities: ['assess.process.create'] }) }, 403, 0)).error.code, 'PERMISSION_DENIED');
assert.equal((await exercise({ atomic: async () => ({ ok: true, outcome: 'committed', resource: { ...resource, ownerId: org } }) }, 503, 1)).error.code, 'COMMAND_UNAVAILABLE');
assert.equal((await exercise({ atomic: async () => ({ ok: false, error: { code: 'FEATURE_DISABLED' } }) }, 503, 1)).error.code, 'FEATURE_DISABLED');
let called = false;
const invalid = await handleProcessCreationRequest(request({ ...envelope, actorId: actor }), {
  authenticate: async () => ({ id: actor }), authority: async () => context,
  atomic: async () => { called = true; return null; },
});
assert.equal(invalid.status, 400);
assert.equal(called, false);
console.log('process creation command: positive and adversarial authority cases passed');
};
main().catch(error => { console.error(error); process.exitCode = 1; });
