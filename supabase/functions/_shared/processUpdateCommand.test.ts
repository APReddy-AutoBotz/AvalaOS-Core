import assert from 'node:assert/strict';
import { executeProcessUpdateRequest, type ProcessUpdateDependencies } from './processUpdateCommand.ts';
import { buildProcessUpdateEnvelope } from '../../../services/processUpdateContract.ts';

const actor = '11111111-1111-4111-8111-111111111111';
const org = '22222222-2222-4222-8222-222222222222';
const workspace = '33333333-3333-4333-8333-333333333333';
const context = { userId: actor, organizationId: org, organizationName: 'Synthetic', workspaceId: workspace,
  workspaceName: 'Controlled', authorizationVersion: 7, capabilities: ['assess.read', 'assess.process.update'] };
const envelope = buildProcessUpdateEnvelope(context,'44444444-4444-4444-8444-444444444444',2,
  { name: 'Updated', description: '', department: 'Finance', criticality: 'High' },
  { requestId: '55555555-5555-4555-8555-555555555555', idempotencyKey: 'process.update.synthetic-0001' });
const resource = { id: envelope.payload.processId, orgId: org, workspaceId: workspace, ownerId: actor,
  name: 'Updated', description: '', department: 'Finance', criticality: 'High', status: 'Not Started', templateId: null,
  version: 3, receiptId: '66666666-6666-4666-8666-666666666666', requestId: envelope.requestId,
  idempotencyKey: envelope.idempotencyKey, createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:01:00Z' };
const request = new Request('https://example.test/process-command',{method:'POST'});
const exercise = async (overrides: Partial<ProcessUpdateDependencies>, expected: number, expectedAtomic: number) => {
  let atomic = 0;
  const dependencies: ProcessUpdateDependencies = {
    authenticate: overrides.authenticate ?? (async () => ({ id: actor })),
    authority: overrides.authority ?? (async () => context),
    atomic: async (actorId, command) => { atomic++; return (overrides.atomic ?? (async () => ({ ok: true, outcome: 'committed', resource })))(actorId,command); },
  };
  const response = await executeProcessUpdateRequest(request,envelope,dependencies);
  assert.equal(response.status,expected);
  assert.equal(atomic,expectedAtomic);
  return response.json() as Promise<any>;
};

const main = async () => {
  assert.equal((await exercise({},200,1)).resource.version,3);
  await exercise({ authenticate: async () => { throw new Error('no'); } },401,0);
  await exercise({ authority: async () => ({ ...context, capabilities: ['assess.read'] }) },403,0);
  await exercise({ authority: async () => ({ ...context, authorizationVersion: 8 }) },409,0);
  assert.equal((await exercise({ atomic: async () => ({ ok:false,error:{code:'VERSION_CONFLICT'} }) },409,1)).error.code,'VERSION_CONFLICT');
  assert.equal((await exercise({ atomic: async () => ({ ok:true,outcome:'committed',resource:{...resource,workspaceId:org} }) },503,1)).error.code,'COMMAND_UNAVAILABLE');
  console.log('process update command: positive and adversarial authority cases passed');
};
main().catch(error => { console.error(error); process.exitCode=1; });
