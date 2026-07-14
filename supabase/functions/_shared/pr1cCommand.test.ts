import assert from 'node:assert/strict';
import {
  AssessAtomicCommand,
  AssessCommandDependencies,
  AssessCommandEnvelope,
  AssessCommandError,
  parseAssessEnvelope,
} from './assessCommand.ts';
import { executeAssessCommand } from './assessHandlers.ts';
import { handleAssessRequest } from './assessRouter.ts';
import { handleTenantSessionRequest } from './tenantSession.ts';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';
const assessmentId = '44444444-4444-4444-8444-444444444444';
const requestId = '55555555-5555-4555-8555-555555555555';

const request = (body: unknown) => new Request('https://example.test/assess-command', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer omitted' },
  body: JSON.stringify(body),
});

const commands: AssessAtomicCommand[] = [];
const dependencies = (): AssessCommandDependencies => ({
  authenticate: async () => ({ id: actorId }),
  loadFreshAuthority: async () => ({
    actorId,
    organizationId,
    workspaceId,
    authorizationVersion: 9,
    permissions: ['govern.resolve', 'studio.handoff.create'],
  }),
  loadAssessmentForFinalize: async () => null,
  executeAtomicCommand: async command => {
    commands.push(command);
    return {
      outcome: 'committed',
      resource: {
        assessmentId,
        version: (command.expectedVersion || 0) + 1,
        status: command.commandType === 'studio_handoff.create' ? 'Handed Off to Docs' : 'Approved',
      },
    };
  },
});

const envelope = (
  commandType: AssessCommandEnvelope['commandType'],
  payload: Record<string, unknown>,
): AssessCommandEnvelope => ({
  requestId,
  idempotencyKey: `pr1c-test-${commandType.replace(/[^a-z]/g, '-')}`,
  commandType,
  organizationId,
  workspaceId,
  authorizationVersion: 9,
  expectedVersion: 4,
  payload,
});

const rejectCode = async (run: () => Promise<unknown>, code: string) => {
  await assert.rejects(run, error => error instanceof AssessCommandError && error.code === code);
};

const main = async () => {
  commands.length = 0;
  const govern = envelope('govern.resolve', { assessmentId, resolution: 'approve', reason: 'Human reviewer accepted the governed decision.' });
  const governed = await executeAssessCommand(request(govern), parseAssessEnvelope(govern), dependencies());
  assert.equal(governed.outcome, 'committed');
  assert.deepEqual(commands[0], {
    requestId,
    idempotencyKey: govern.idempotencyKey,
    commandType: 'govern.resolve',
    actorId,
    organizationId,
    workspaceId,
    authorizationVersion: 9,
    expectedVersion: 4,
    resourceId: assessmentId,
    payload: { resolution: 'approve', reason: 'Human reviewer accepted the governed decision.' },
  });

  for (const invalid of [
    envelope('govern.resolve', { assessmentId, resolution: 'request_changes', reason: null }),
    envelope('govern.resolve', { assessmentId, resolution: 'bypass', reason: 'invalid' }),
    envelope('govern.resolve', { assessmentId, resolution: 'approve', reason: 'x'.repeat(1001) }),
  ]) {
    await rejectCode(() => executeAssessCommand(request(invalid), invalid, dependencies()), 'INVALID_COMMAND');
  }

  const denied = dependencies();
  denied.loadFreshAuthority = async () => ({
    actorId,
    organizationId,
    workspaceId,
    authorizationVersion: 9,
    permissions: ['assess.read'],
  });
  await rejectCode(() => executeAssessCommand(request(govern), govern, denied), 'PERMISSION_DENIED');

  commands.length = 0;
  const handoff = envelope('studio_handoff.create', { assessmentId, reason: 'Create governed Studio source context.' });
  await executeAssessCommand(request(handoff), handoff, dependencies());
  assert.equal(commands[0].commandType, 'studio_handoff.create');
  assert.equal(commands[0].expectedVersion, 4);
  assert.deepEqual(commands[0].payload, { reason: 'Create governed Studio source context.' });

  const unavailable = dependencies();
  unavailable.executeAtomicCommand = async () => { throw new Error('database detail must not escape'); };
  const failed = await handleAssessRequest(request(handoff), unavailable);
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), {
    ok: false,
    error: { code: 'COMMAND_UNAVAILABLE', message: 'The command could not be completed.' },
  });

  const session = await handleTenantSessionRequest(request({}), {
    authenticate: async () => ({ id: actorId }),
    loadAvailableContexts: async () => [{
      userId: actorId,
      organizationId,
      organizationName: 'Avala Enterprise',
      workspaceId,
      workspaceName: 'Governed Assess',
      authorizationVersion: 9,
      capabilities: ['studio.handoff.create', 'govern.resolve'],
    }],
  });
  assert.equal(session.status, 200);
  assert.deepEqual(await session.json(), {
    contexts: [{
      userId: actorId,
      organizationId,
      organizationName: 'Avala Enterprise',
      workspaceId,
      workspaceName: 'Governed Assess',
      authorizationVersion: 9,
      capabilities: ['govern.resolve', 'studio.handoff.create'],
    }],
  });

  const expired = await handleTenantSessionRequest(request({}), {
    authenticate: async () => { throw new Error('expired'); },
    loadAvailableContexts: async () => [],
  });
  assert.equal(expired.status, 401);

  const forged = await handleTenantSessionRequest(request({ actorId }), {
    authenticate: async () => ({ id: actorId }),
    loadAvailableContexts: async () => [],
  });
  assert.equal(forged.status, 400);

  console.log('PR 1C tenant session, Govern resolution, Studio handoff, and false-success tests passed.');
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
