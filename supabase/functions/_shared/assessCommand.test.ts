import assert from 'node:assert/strict';
import { calculateAssessmentScores as browserScore } from '../../../services/scoringEngine.ts';
import { calculateAssessmentScores as serverScore, CURRENT_SCORE_VERSION } from './assessScoring.ts';
import {
  AssessAtomicCommand,
  AssessCommandDependencies,
  AssessCommandError,
  AssessCommandEnvelope,
  parseAssessEnvelope,
} from './assessCommand.ts';
import { executeAssessCommand } from './assessHandlers.ts';
import { handleAssessRequest } from './assessRouter.ts';

const orgId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';
const assessmentId = '44444444-4444-4444-8444-444444444444';
const processId = '55555555-5555-4555-8555-555555555555';

const baseEnvelope: AssessCommandEnvelope = {
  requestId: '66666666-6666-4666-8666-666666666666',
  idempotencyKey: 'idem-key-0001',
  commandType: 'assessment.create',
  organizationId: orgId,
  workspaceId,
  authorizationVersion: 7,
  payload: { processId },
};

const commands: AssessAtomicCommand[] = [];
const dependencies = (): AssessCommandDependencies => ({
  authenticate: async () => ({ id: actorId }),
  loadFreshAuthority: async input => ({
    actorId: input.actorId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    authorizationVersion: 7,
    permissions: ['assess.create', 'assess.response.write', 'assess.finalize'],
  }),
  loadAssessmentForFinalize: async input => ({
    assessmentId: input.assessmentId,
    processId,
    version: input.expectedVersion,
    responses: baseResponses,
    metadata,
    evidenceItems: [],
    assumptions: [],
  }),
  executeAtomicCommand: async command => {
    commands.push(command);
    return { outcome: 'committed', resource: { id: command.resourceId ?? assessmentId, version: 1 } };
  },
});

const request = (body: unknown) => new Request('http://localhost/assess-command', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer omitted-test-token' },
  body: JSON.stringify(body),
});

const rejectsCode = async (operation: () => Promise<unknown>, code: string) => assert.rejects(
  operation,
  (error: unknown) => error instanceof AssessCommandError && error.code === code,
);

const baseResponses = {
  processStructure: { standardization: 4, ruleDeterminism: 4, exceptionPredictability: 3, processMaturity: 4 },
  workPattern: { volume: 1200, manualEffort: 0.75, averageHourlyCost: 65, reworkPain: 3, cycleTimePain: 4 },
  dataProfile: { inputStructure: 80, unstructuredLoad: 2, dataSensitivity: 2 },
  judgment: { judgmentIntensity: 2, goalAmbiguity: 2 },
  systems: { systemReadiness: 4, orchestrationComplexity: 3 },
  risk: { riskCriticality: 2, governanceSensitivity: 2, errorReversibility: 4 },
};
const metadata = { completionQuality: 90, templateFit: true, stakeholderCoverage: 4, evidenceQuality: 4, assumptionQuality: 4 };

const withoutTimes = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutTimes);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !['calculatedAt', 'createdAt', 'generatedAt'].includes(key))
    .map(([key, item]) => [key, withoutTimes(item)]));
};

const main = async () => {
  commands.length = 0;
  const parsed = parseAssessEnvelope(baseEnvelope);
  const created = await executeAssessCommand(request(baseEnvelope), parsed, dependencies());
  assert.equal(created.outcome, 'committed');
  assert.deepEqual(commands[0], {
    requestId: baseEnvelope.requestId,
    idempotencyKey: baseEnvelope.idempotencyKey,
    commandType: 'assessment.create',
    actorId,
    organizationId: orgId,
    workspaceId,
    authorizationVersion: 7,
    resourceId: baseEnvelope.requestId,
    payload: { processId },
  });

  for (const [mutate, code] of [
    [(deps: AssessCommandDependencies) => { deps.authenticate = async () => { throw new Error('token detail'); }; }, 'AUTHENTICATION_REQUIRED'],
    [(deps: AssessCommandDependencies) => { deps.loadFreshAuthority = async () => null; }, 'RESOURCE_NOT_AVAILABLE'],
    [(deps: AssessCommandDependencies) => { deps.loadFreshAuthority = async () => ({ actorId, organizationId: orgId, workspaceId, authorizationVersion: 8, permissions: ['assess.create'] }); }, 'AUTHORITY_STALE'],
    [(deps: AssessCommandDependencies) => { deps.loadFreshAuthority = async () => ({ actorId, organizationId: orgId, workspaceId, authorizationVersion: 7, permissions: [] }); }, 'PERMISSION_DENIED'],
  ] as const) {
    const deps = dependencies();
    mutate(deps);
    await rejectsCode(() => executeAssessCommand(request(baseEnvelope), parsed, deps), code);
  }

  assert.throws(() => parseAssessEnvelope({ ...baseEnvelope, actorId }), (error: unknown) => error instanceof AssessCommandError && error.code === 'INVALID_COMMAND');
  assert.throws(() => parseAssessEnvelope({ ...baseEnvelope, commandType: 'govern.resolve' }), (error: unknown) => error instanceof AssessCommandError && error.code === 'COMMAND_NOT_SUPPORTED');

  const upsert: AssessCommandEnvelope = {
    ...baseEnvelope,
    commandType: 'assessment.response.upsert',
    expectedVersion: 3,
    payload: { assessmentId, responses: baseResponses, metadata },
  };
  commands.length = 0;
  await executeAssessCommand(request(upsert), upsert, dependencies());
  assert.equal(commands[0].resourceId, assessmentId);
  assert.equal(commands[0].expectedVersion, 3);
  assert.equal('organizationId' in commands[0].payload, false);

  const finalize: AssessCommandEnvelope = {
    ...baseEnvelope,
    commandType: 'assessment.finalize',
    expectedVersion: 4,
    payload: { assessmentId },
  };
  commands.length = 0;
  await executeAssessCommand(request(finalize), finalize, dependencies());
  assert.equal((commands[0].payload.scores as { scoreVersion: string }).scoreVersion, 'assess-core-2026-05');
  assert.equal(((commands[0].payload.scores as { handoffPack: { organizationId: string } }).handoffPack.organizationId), orgId);

  const fixtures = [
    baseResponses,
    { ...baseResponses, judgment: { judgmentIntensity: 5, goalAmbiguity: 5 }, risk: { riskCriticality: 5, governanceSensitivity: 5, errorReversibility: 1 } },
    { ...baseResponses, workPattern: { volume: 10, manualEffort: 0.1, averageHourlyCost: 45, reworkPain: 1, cycleTimePain: 1 } },
  ];
  for (const fixture of fixtures) {
    assert.deepEqual(withoutTimes(serverScore(fixture, metadata)), withoutTimes(browserScore(fixture, metadata)));
  }
  assert.equal(CURRENT_SCORE_VERSION, 'assess-core-2026-05');

  const dbConflict = dependencies();
  dbConflict.executeAtomicCommand = async () => { throw new AssessCommandError('IDEMPOTENCY_CONFLICT'); };
  const conflictResponse = await handleAssessRequest(request(baseEnvelope), dbConflict);
  assert.equal(conflictResponse.status, 409);
  assert.deepEqual(await conflictResponse.json(), { ok: false, error: { code: 'IDEMPOTENCY_CONFLICT', message: 'The command could not be completed.' } });

  const rawFailure = dependencies();
  rawFailure.executeAtomicCommand = async () => { throw new Error('database object org-secret detail'); };
  const unavailable = await handleAssessRequest(request(baseEnvelope), rawFailure);
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(await unavailable.text(), /database|secret|org-secret/);

  const replay = dependencies();
  replay.executeAtomicCommand = async () => ({ outcome: 'replayed', resource: { id: assessmentId, version: 1 } });
  const replayResponse = await handleAssessRequest(request(baseEnvelope), replay);
  assert.equal(replayResponse.status, 200);
  assert.equal((await replayResponse.json()).outcome, 'replayed');

  console.log('Assess command handlers and locked scoring parity regression suite passed.');
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
