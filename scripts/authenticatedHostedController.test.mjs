import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { request as httpRequest } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AuthenticatedHostedController,
  authenticatedHostedDigest,
  controllerProfile,
  startAuthenticatedHostedControllerServer,
  validateAuthenticatedHostedControllerEnvironment,
} from './authenticatedHostedController.mjs';
import { deriveLocalAcceptanceExerciseDigest } from './localAcceptanceBuild.mjs';
import { authenticatedEvidenceDigest } from './authenticatedBrowserCorrelation.mjs';
import { authenticatedHostedRequestBinding } from './authenticatedHostedObservationAdapter.mjs';
import { canonicalDigest } from './assessV1OracleEvidence.mjs';
import { createAuthenticatedHostedIdentityAdapter, createAuthenticatedHostedPostgresAdapter,
  readAuthenticatedHostedCleanupControls } from './authenticatedHostedControllerAdapters.mjs';
import { verifyAuthenticatedHostedCheckoutState } from './authenticatedHostedCheckout.mjs';
import { runAuthenticatedHostedAcceptance, validateAuthenticatedDatabaseTarget,
  verifyAuthenticatedHostedCheckout, verifyAuthenticatedSecretBackend } from './runAuthenticatedHostedAcceptance.mjs';
import { AUTHENTICATED_V2_RELOAD_CHECKPOINT_SCHEMA, AUTHENTICATED_V2_RELOAD_COUNT_KEYS,
  emptyAuthenticatedV2ReloadReadStages } from './authenticatedV2ReloadDiagnostic.mjs';
const emptyTransportFailures = () => ({ aborted: 0, timeout: 0, connection: 0, protocol: 0, blocked: 0, other: 0 });

const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const id = () => randomUUID();
// Deterministic fixture identity; never a configured hosted project.
const fixtureProjectRef = 'abcdefghijklmnopqrst';
const tokenFor = (actorId, sessionId) => `${Buffer.from('{}').toString('base64url')}.${
  Buffer.from(JSON.stringify({ sub: actorId, session_id: sessionId })).toString('base64url')}.${'x'.repeat(48)}`;
const v2DiagnosticCounts = value => Object.fromEntries(AUTHENTICATED_V2_RELOAD_COUNT_KEYS.map(key => [key, value]));
const v2DiagnosticBrowser = (overrides = {}) => ({ sessionObserved: true, selectedScopeObserved: true,
  selectedProcessObserved: true, serverContextObserved: true, resumedDraftRendered: false,
  failureRendered: false, readStages: emptyAuthenticatedV2ReloadReadStages(), ...overrides });

const createFinalizeProofHarness = async ({ commandType='assessment.finalize', route='/functions/v1/assess-command',
  provideProof=true, mutateProof=value=>value, overlap=false }={}) => {
  const config=validateAuthenticatedHostedControllerEnvironment(baseEnvironment());
  const actorId=id();const sessionId=id();const assessmentId=id();const requestId=id();const receiptId=id();
  const actorHash=digest(actorId);const sessionHash=digest(sessionId);const commandIdHash=digest(assessmentId);
  const receiptIdHash=digest(receiptId);
  const requestBody={requestId,idempotencyKey:`assessment.finalize.${requestId}`,commandType,
    organizationId:config.scope.organizationId,workspaceId:config.scope.workspaceId,authorizationVersion:3,
    expectedVersion:2,payload:{assessmentId}};
  const binding=authenticatedHostedRequestBinding({requestId,actorHash,commandType,payload:requestBody,requireUuid:true});
  const assessmentRecordHash=digest('finalize-assessment-record');
  const receiptRecordHash=digest('finalize-receipt-record');
  const auditRecordHash=digest('finalize-audit-record');
  const beforeAssessment={source:'assessments',recordHash:assessmentRecordHash,rowHash:digest('assessment-before'),
    active:false,effectKind:'domain'};
  const correlated=(source,recordHash,rowHash,effectKind)=>({source,recordHash,rowHash,active:false,effectKind,
    actorHash,sessionHash,requestIdHash:binding.requestIdHash,commandBindingHash:binding.commandBindingHash,
    commandIdHash,receiptIdHash,auditIdHash:effectKind==='audit'?digest('finalize-audit-id'):null});
  const afterRecords=[
    correlated('assessments',assessmentRecordHash,digest('assessment-after'),'domain'),
    correlated('assess_command_receipts',receiptRecordHash,digest('receipt-after'),'receipt'),
    correlated('privileged_audit_events',auditRecordHash,digest('audit-after'),'audit'),
  ];
  if(overlap)afterRecords.push(correlated('assess_command_receipts',digest('overlap-record'),digest('overlap-row'),'receipt'));
  const frames=[
    {capturedAt:'2026-10-10T00:00:00.000Z',records:[beforeAssessment]},
    {capturedAt:'2026-10-10T00:00:02.000Z',records:afterRecords},
  ];
  const proof={schemaVersion:'authenticated-assessment-finalize-proof-v1',verified:true,
    requestIdHash:binding.requestIdHash,commandBindingHash:binding.commandBindingHash,actorHash,sessionHash,
    assessmentRecordHash,assessmentBeforeRowHash:beforeAssessment.rowHash,
    assessmentAfterRowHash:afterRecords[0].rowHash,receiptRecordHash,receiptRowHash:afterRecords[1].rowHash,
    receiptIdHash,auditRecordHash,auditRowHash:afterRecords[2].rowHash,commandIdHash,
    expectedVersion:2,committedVersion:3,scoreVersion:'assess-core-2026-05',
    beforeCapturedAt:frames[0].capturedAt,afterCapturedAt:frames[1].capturedAt};
  let capture=0;
  const adapter={bindSession:async()=>{},observe:async()=>frames[capture++],
    ...(provideProof?{verifyAssessmentFinalizeCase:async input=>{
      assert.deepEqual(input.before,frames[0],'finalize proof needs the original before-frame');
      assert.deepEqual(input.after,frames[1],'finalize proof needs the freshly captured after-frame');
      return mutateProof(structuredClone(proof));
    }}:{})};
  const controller=new AuthenticatedHostedController({config,adapter,
    identity:{verifySession:async()=>({actorId,sessionId})}});
  controller.active = true;
  controller.exerciseId=id();
  controller.projects.set('desktop-chromium',{processId:id(),identities:{author:{id:actorId}},
    lastBoundaryAt:'2026-10-09T23:59:59.000Z'});
  const started=await controller.beginBrowserAction({projectName:'desktop-chromium',accessToken:tokenFor(actorId,sessionId),
    route,requestBody});
  await controller.finishBrowserAction({projectName:'desktop-chromium',actionId:started.actionId,status:200,
    responseBody:{ok:true,outcome:'committed',resource:{assessmentId,version:3,status:'Ready for Review',
      scoreVersion:'assess-core-2026-05'}}});
  const record=()=>controller.recordBrowserCase({projectName:'desktop-chromium',actionIds:[started.actionId],
    row:{testId:'ASSESS-003',controls:{assertions:[
      {id:'persisted-discovery-inputs-scored',status:'passed'},
      {id:'production-completion-committed',status:'passed'},
    ]}}});
  return {controller,record,proof};
};

test('real loopback controller streams bounded JSON before dispatch', async () => {
  const calls = [];
  const server = await startAuthenticatedHostedControllerServer({
    controlToken: 'fixture-loopback-token',
    control: async (pathname, input) => { calls.push({ pathname, input }); return { accepted: true }; },
  });
  try {
    const good = await fetch(`${server.baseUrl}/control/setup`, { method: 'POST', headers: {
      'content-type': 'application/json', 'x-enterprise-lifecycle-control': server.controlToken,
    }, body: JSON.stringify({ projectName: 'desktop-chromium' }) });
    assert.equal(good.status, 200);
    assert.deepEqual(await good.json(), { accepted: true });
    assert.deepEqual(calls, [{ pathname: '/control/setup', input: { projectName: 'desktop-chromium' } }]);

    const invalid = await fetch(`${server.baseUrl}/control/setup`, { method: 'POST', headers: {
      'content-type': 'application/json', 'x-enterprise-lifecycle-control': server.controlToken,
    }, body: '{' });
    assert.equal(invalid.status, 409);
    assert.deepEqual(await invalid.json(), { error: 'AUTHENTICATED_HOSTED_CONTROLLER_REQUEST_JSON_REJECTED' });

    const oversized = await fetch(`${server.baseUrl}/control/setup`, { method: 'POST', headers: {
      'content-type': 'application/json', 'x-enterprise-lifecycle-control': server.controlToken,
    }, body: 'x'.repeat(2_000_001) });
    assert.equal(oversized.status, 409);
    assert.deepEqual(await oversized.json(), { error: 'AUTHENTICATED_HOSTED_CONTROLLER_REQUEST_TOO_LARGE' });
    assert.equal(calls.length, 1);
  } finally { await server.close(); }
});

test('server stop cancels and joins a held request body before controller cleanup can begin', async () => {
  let controlCalls = 0;
  const server = await startAuthenticatedHostedControllerServer({
    controlToken: 'fixture-loopback-token',
    control: async () => { controlCalls += 1; return { accepted: true }; },
  }, { settlementTimeoutMs: 500 });
  const clientError = new Promise(resolve => {
    const request = httpRequest(`${server.baseUrl}/control/setup`, { method: 'POST', headers: {
      'content-type': 'application/json', 'content-length': '100',
      'x-enterprise-lifecycle-control': server.controlToken,
    } });
    request.on('error', resolve);
    request.write('{"projectName":"desktop');
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(await server.stopAndDrain(), { settled: true });
  await clientError;
  assert.equal(controlCalls, 0);
});

test('server and controller join an accepted handler before cleanup verification', async () => {
  let releaseOperation;
  let startedOperation;
  const operationStarted = new Promise(resolve => { startedOperation = resolve; });
  const operationGate = new Promise(resolve => { releaseOperation = resolve; });
  const events = [];
  const cleanupResult = { activeSessions: 0, activeIdentities: 0, activeMemberships: 0, armedPermits: 0,
    activeSecretMaterial: 0, unapprovedActiveResidue: 0, nonExerciseChanged: false, immutableHistoryPreserved: true };
  const controller = new AuthenticatedHostedController({
    config: validateAuthenticatedHostedControllerEnvironment(baseEnvironment()),
    identity: { revokeAll: async () => events.push('revoke') },
    adapter: {
      control: async (_pathname, input) => {
        events.push('operation-start');
        input.signal.addEventListener('abort', () => events.push('operation-abort'), { once: true });
        startedOperation();
        await operationGate;
        events.push('operation-end');
        return { accepted: true };
      },
      quiesce: async () => events.push('quiesce'),
      cleanup: async () => events.push('cleanup'),
      verifyCleanup: async () => { events.push('verify'); return cleanupResult; },
    },
  });
  controller.active = true;
  const server = await startAuthenticatedHostedControllerServer(controller, { settlementTimeoutMs: 1_000 });
  const request = fetch(`${server.baseUrl}/control/custom`, { method: 'POST', headers: {
    'content-type': 'application/json', 'x-enterprise-lifecycle-control': server.controlToken,
  }, body: '{}' }).catch(() => null);
  await operationStarted;
  let lifecycleSettled = false;
  const lifecycle = (async () => {
    await server.stopAndDrain();
    await controller.abortAndQuiesce();
    lifecycleSettled = true;
  })();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(lifecycleSettled, false);
  assert.equal(events.includes('verify'), false);
  releaseOperation();
  await lifecycle;
  await request;
  assert.deepEqual(events, ['operation-start', 'operation-abort', 'operation-end', 'quiesce', 'revoke', 'cleanup', 'verify']);
});

test('late session binding cannot commit after intake stops', async () => {
  const actorId = id(); const sessionId = id();
  let releaseBinding; let bindingStarted;
  const bindingGate = new Promise(resolve => { releaseBinding = resolve; });
  const started = new Promise(resolve => { bindingStarted = resolve; });
  const events = [];
  const controller = new AuthenticatedHostedController({
    config: validateAuthenticatedHostedControllerEnvironment(baseEnvironment()),
    identity: { verifySession: async () => ({ actorId, sessionId }), revokeAll: async () => events.push('revoke') },
    adapter: {
      bindSession: async () => { bindingStarted(); await bindingGate; events.push('bind-returned'); },
      quiesce: async () => events.push('quiesce'), cleanup: async () => events.push('cleanup'),
      verifyCleanup: async () => ({ activeSessions: 0, activeIdentities: 0, activeMemberships: 0, armedPermits: 0,
        activeSecretMaterial: 0, unapprovedActiveResidue: 0, nonExerciseChanged: false, immutableHistoryPreserved: true }),
    },
  });
  controller.active = true;
  controller.projects.set('desktop-chromium', { identities: { author: { id: actorId } } });
  const operation = controller.control('/control/bind-browser-session', {
    projectName: 'desktop-chromium', persona: 'author', accessToken: tokenFor(actorId, sessionId),
  });
  await started;
  const cleanup = controller.abortAndQuiesce();
  releaseBinding();
  await assert.rejects(operation, /INTAKE_CLOSED/u);
  await cleanup;
  assert.equal(controller.boundSessions.size, 0);
  assert.deepEqual(events, ['bind-returned', 'quiesce', 'revoke', 'cleanup']);
});

test('a project committed while intake stops remains owned for revocation and cleanup', async () => {
  const identities = Object.fromEntries(['author', 'reviewer', 'approver', 'outsider']
    .map(persona => [persona, { id: id(), email: `${persona}@example.invalid`, password: `fixture-${persona}` }]));
  let releaseSetup; let setupStarted;
  const setupGate = new Promise(resolve => { releaseSetup = resolve; });
  const started = new Promise(resolve => { setupStarted = resolve; });
  const cleanupProjects = [];
  const revokedProjects = [];
  const controller = new AuthenticatedHostedController({
    config: validateAuthenticatedHostedControllerEnvironment(baseEnvironment()),
    identity: {
      provisionProject: async () => identities,
      revokeAll: async input => revokedProjects.push(...input.projects),
    },
    adapter: {
      setupProject: async ({ projectName }) => {
        setupStarted();
        await setupGate;
        return { projectName, processId: id(), projectId: id(), deliveryProject: { id: id(), name: 'fixture' }, aliases: {} };
      },
      quiesce: async () => undefined,
      cleanup: async input => cleanupProjects.push(...input.projects),
      verifyCleanup: async () => ({ activeSessions: 0, activeIdentities: 0, activeMemberships: 0, armedPermits: 0,
        activeSecretMaterial: 0, unapprovedActiveResidue: 0, nonExerciseChanged: false, immutableHistoryPreserved: true }),
    },
  });
  controller.active = true;
  const operation = controller.control('/control/setup', { projectName: 'desktop-chromium' });
  await started;
  const cleanup = controller.abortAndQuiesce();
  releaseSetup();
  await assert.rejects(operation, /INTAKE_CLOSED/u);
  await cleanup;
  assert.equal(controller.projects.size, 0);
  assert.equal(cleanupProjects.length, 1);
  assert.equal(revokedProjects.length, 1);
  assert.equal(cleanupProjects[0].projectName, 'desktop-chromium');
});
const baseEnvironment = () => ({
  GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'APReddy-AutoBotz/AvalaOS-Core',
  GITHUB_WORKFLOW_REF: 'APReddy-AutoBotz/AvalaOS-Core/.github/workflows/authenticated-product-acceptance.yml@refs/heads/main',
  GITHUB_JOB: 'hosted-authenticated', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2',
  RELEASE_SHA: 'a'.repeat(40), GITHUB_SHA: 'a'.repeat(40), HOSTED_PILOT_URL: 'https://avalaos-pilot.netlify.app',
  NETLIFY_DEPLOY_ID: 'b'.repeat(24), AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND: 'hosted_authenticated_synthetic',
  AUTHENTICATED_ACCEPTANCE_AUTH_KIND: 'supabase_auth', AUTHENTICATED_ACCEPTANCE_SUPABASE_URL: `https://${fixtureProjectRef}.supabase.co`,
  AUTHENTICATED_ACCEPTANCE_EXPECTED_PROJECT_REF: 'abcdefghijklmnopqrst', AUTHENTICATED_ACCEPTANCE_TARGET_PUBLIC_DIGEST: digest('target'),
  AUTHENTICATED_ACCEPTANCE_SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value-longer-than-thirty-two-characters',
  AUTHENTICATED_ACCEPTANCE_DATABASE_URL: 'postgresql://postgres:synthetic-password@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full',
  AUTHENTICATED_ACCEPTANCE_BACKEND_DIGEST: digest('backend'), AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION: '20261011053000',
  AUTHENTICATED_ACCEPTANCE_MIGRATION_DIGEST: digest('migration'), AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST: digest('exercise'),
  AUTHENTICATED_ACCEPTANCE_CATALOG_DIGEST: digest('catalog'), AUTHENTICATED_ACCEPTANCE_SOURCE_DIGEST: digest('source'),
  AUTHENTICATED_ACCEPTANCE_BASELINE_DIGEST: digest('baseline'), AUTHENTICATED_ACCEPTANCE_SYNTHETIC_ONLY: 'true',
  AUTHENTICATED_ACCEPTANCE_PRODUCTION: 'false', AUTHENTICATED_ACCEPTANCE_CUSTOMER_DATA: 'false',
  AUTHENTICATED_ACCEPTANCE_PROVIDERS_ENABLED: 'false', AUTHENTICATED_ACCEPTANCE_PAID_CALLS: 'false',
  AUTHENTICATED_ACCEPTANCE_SECRET_BACKEND: 'supabase_vault', AVALA_PROVIDER_SECRET_BACKEND: 'supabase_vault',
  AUTHENTICATED_ACCEPTANCE_SCOPE: JSON.stringify({ organizationId: id(), workspaceId: id(),
    roleIds: { author: id(), reviewer: id(), approver: id(), outsider: id() } }),
});

test('local real-backend controller binds build bytes, null deployment and derived exercise identity', async () => {
  const approvedExerciseDigest = digest('approved-local-exercise');
  const buildDigest = digest('local-build');
  const environment = {
    ...baseEnvironment(),
    ACCEPTANCE_EXECUTION_KIND: 'local_real_backend',
    AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND: 'local_real_backend_authenticated',
    HOSTED_PILOT_URL: 'http://127.0.0.1:4173',
    NETLIFY_DEPLOY_ID: '',
    AUTHENTICATED_ACCEPTANCE_BUILD_DIGEST: buildDigest,
    AUTHENTICATED_ACCEPTANCE_APPROVED_EXERCISE_DIGEST: approvedExerciseDigest,
    LOCAL_ACCEPTANCE_BUILD_ROOT: path.join(os.tmpdir(), 'avalaos-local-acceptance-fixture'),
  };
  environment.AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST = deriveLocalAcceptanceExerciseDigest({
    approvedExerciseDigest, buildDigest, releaseSha: environment.RELEASE_SHA,
  });
  const config = validateAuthenticatedHostedControllerEnvironment(environment);
  assert.equal(config.executionKind, 'local_real_backend_authenticated');
  assert.equal(config.deploymentId, null);
  assert.equal(config.buildDigest, buildDigest);
  const profile = controllerProfile(config, { startedAt: '2026-10-19T00:00:00.000Z',
    completedAt: '2026-10-19T00:00:01.000Z' }, [{ persona: 'author', project: 'desktop-chromium',
    actorHash: digest('actor'), sessionHash: digest('session') }]);
  assert.equal(profile.schemaVersion, 'local-real-backend-authenticated-profile-v1');
  assert.equal(profile.executionKind, 'local_real_backend_authenticated');
  assert.equal(profile.deploymentId, null);
  assert.equal(profile.buildDigest, buildDigest);
  await assert.rejects(async () => validateAuthenticatedHostedControllerEnvironment({ ...environment,
    AUTHENTICATED_ACCEPTANCE_BUILD_DIGEST: digest('different-build') }), /DIGEST_REJECTED/u);

  let activation;
  const controller = new AuthenticatedHostedController({ config, identity: {}, adapter: {
    preflight: async () => ({ syntheticTarget: true, production: false, releaseSha: config.releaseSha,
      deploymentId: null, executionKind: config.executionKind, buildDigest, migrationVersion: config.migrationVersion,
      backendDigest: config.backendDigest, providersEnabled: false, runtimeReady: true,
      secretBackendKind: config.secretBackendKind, secretBackendWritable: true,
      publicTargetDigest: config.targetPublicDigest, baselineDigest: config.baselineDigest,
      customerRows: 0, unapprovedActiveResidue: 0, scopeReady: true,
      observationStartedAt: '2026-10-19T00:00:00.000Z' }),
    activate: async input => { activation = input; },
  } });
  await controller.preflightAndActivate();
  assert.equal(activation.deploymentId, null);
  assert.equal(activation.executionKind, 'local_real_backend_authenticated');
  assert.equal(activation.buildDigest, buildDigest);
  assert.equal(activation.profileVersion, 'local-real-backend-authenticated-profile-v1');
});

test('focused V2 diagnostic binds exact checkpoint order, original author session and safe frame deltas', async () => {
  const environment = { ...baseEnvironment(), AUTHENTICATED_ACCEPTANCE_MODE: 'v2_primary_prefix_diagnostic' };
  const config = validateAuthenticatedHostedControllerEnvironment(environment);
  const actorId = id(); const sessionId = id(); const accessToken = tokenFor(actorId, sessionId);
  const frames = [v2DiagnosticCounts(0), v2DiagnosticCounts(1), v2DiagnosticCounts(1)];
  let frameIndex = 0;
  let observationIndex = 0;
  const controller = new AuthenticatedHostedController({ config,
    identity: { verifySession: async () => ({ actorId, sessionId }) },
    adapter: { frame: async pathname => {
      assert.equal(pathname, '/control/lifecycle-frame');
      return { ...frames[frameIndex++], targetHash: digest('private-frame') };
    }, observe: async () => ({
      capturedAt: `2026-10-16T00:00:0${++observationIndex}.000Z`,
      records: [],
    }) },
  });
  controller.active = true;
  controller.projects.set('desktop-chromium', { identities: { author: { id: actorId } },
    lastBoundaryAt: '2026-10-16T00:00:00.000Z' });
  controller.boundSessions.set('desktop-chromium:author', { actorId, sessionId,
    actorHash: digest('diagnostic-actor'), sessionHash: digest('diagnostic-session'), persona: 'author' });
  const checkpoint = (phase, browser = v2DiagnosticBrowser()) => controller.control('/control/v2-reload-diagnostic', {
    schemaVersion: AUTHENTICATED_V2_RELOAD_CHECKPOINT_SCHEMA, phase, projectName: 'desktop-chromium', persona: 'author',
    accessToken, browser,
  });
  assert.deepEqual(await checkpoint('before-create'), { recorded: true, phase: 'before-create',
    sessionContinuity: 'verified', continue: true });
  assert.deepEqual(await checkpoint('before-reload'), { recorded: true, phase: 'before-reload',
    sessionContinuity: 'verified', continue: true });
  const inFlight = await controller.beginBrowserAction({ projectName: 'desktop-chromium', accessToken,
    route: '/rest/v1/rpc/diagnostic_read', requestBody: { method: 'GET' } });
  const passedStages = emptyAuthenticatedV2ReloadReadStages().map(row => ({ ...row, status: 'passed', httpStatus: 200,
    rowCount: ['case-discovery', 'case', 'draft-head'].includes(row.stage) ? 1 : 0,
    lifecycle: { requested: 1, responseStarted: 1, completed: 1, transportFailed: 0, pending: 0,
      bodyCompleted: 1, bodyFailed: 0, bodyPending: 0, transportFailures: emptyTransportFailures() } }));
  assert.deepEqual(await checkpoint('after-reload', v2DiagnosticBrowser({ resumedDraftRendered: true,
    readStages: passedStages })), { recorded: true, phase: 'after-reload', sessionContinuity: 'verified', continue: false });
  await assert.rejects(controller.control('/control/browser-action-start', { projectName: 'desktop-chromium' }),
    /V2_RELOAD_DIAGNOSTIC_TERMINAL/u);
  await assert.rejects(controller.control('/control/arm-browser-fault', { projectName: 'desktop-chromium' }),
    /V2_RELOAD_DIAGNOSTIC_TERMINAL/u);
  await assert.rejects(controller.control('/control/assess-v2-runtime', { enabled: false }),
    /V2_RELOAD_DIAGNOSTIC_TERMINAL/u);
  await assert.rejects(controller.control('/control/browser-diagnostic', {}),
    /V2_RELOAD_DIAGNOSTIC_TERMINAL/u);
  assert.deepEqual(await controller.control('/control/browser-action', { projectName: 'desktop-chromium',
    actionId: inFlight.actionId, status: 200, responseBody: {} }), { recorded: true, actionId: inFlight.actionId });
  await assert.rejects(controller.control('/control/browser-case', { projectName: 'desktop-chromium', row: {},
    actionIds: [inFlight.actionId] }), error => /BROWSER_CASE_REJECTED/u.test(error.message)
      && !/V2_RELOAD_DIAGNOSTIC_TERMINAL/u.test(error.message));
  controller.quiesced = true;
  const result = controller.v2ReloadDiagnosticResult();
  assert.equal(result.observedOutcome, 'draft_resumed');
  assert.equal(result.acceptancePromoted, false);
  assert.equal(result.reloadProjectionUnchanged, true);
  assert.equal(result.creationDelta.cases, 1);
  assert.doesNotMatch(JSON.stringify(result), /private-frame|accessToken|targetHash/iu);
});

test('post-reload missing session is evidence, while pre-reload loss and full-mode endpoint use fail closed', async () => {
  const actorId = id(); const sessionId = id();
  const diagnosticConfig = validateAuthenticatedHostedControllerEnvironment({ ...baseEnvironment(),
    AUTHENTICATED_ACCEPTANCE_MODE: 'v2_primary_prefix_diagnostic' });
  const controller = new AuthenticatedHostedController({ config: diagnosticConfig,
    identity: { verifySession: async () => ({ actorId, sessionId }) },
    adapter: { frame: async () => ({ ...v2DiagnosticCounts(0), targetHash: digest('frame') }) },
  });
  controller.active = true;
  controller.projects.set('desktop-chromium', { identities: { author: { id: actorId } } });
  controller.boundSessions.set('desktop-chromium:author', { actorId, sessionId });
  await assert.rejects(controller.setupProject('pixel-7-chromium'), /V2_RELOAD_DIAGNOSTIC_PROJECT_REJECTED/u);
  const input = phase => ({ schemaVersion: AUTHENTICATED_V2_RELOAD_CHECKPOINT_SCHEMA, phase,
    projectName: 'desktop-chromium', persona: 'author', accessToken: tokenFor(actorId, sessionId),
    browser: v2DiagnosticBrowser() });
  await controller.recordV2ReloadDiagnosticCheckpoint(input('before-create'));
  await assert.rejects(controller.recordV2ReloadDiagnosticCheckpoint({ ...input('before-reload'), accessToken: null }),
    /CHECKPOINT_REJECTED/u);
  await controller.recordV2ReloadDiagnosticCheckpoint(input('before-reload'));
  assert.deepEqual(await controller.recordV2ReloadDiagnosticCheckpoint({ ...input('after-reload'), accessToken: null,
    browser: v2DiagnosticBrowser({ sessionObserved: false, selectedScopeObserved: false,
      selectedProcessObserved: false, serverContextObserved: false }) }),
  { recorded: true, phase: 'after-reload', sessionContinuity: 'missing', continue: false });

  const fullController = new AuthenticatedHostedController({
    config: validateAuthenticatedHostedControllerEnvironment(baseEnvironment()), adapter: {}, identity: {},
  });
  fullController.active = true;
  await assert.rejects(fullController.recordV2ReloadDiagnosticCheckpoint(input('before-create')),
    /V2_RELOAD_DIAGNOSTIC_NOT_ACTIVE/u);
});

test('concurrent duplicate diagnostic checkpoints cannot pass the post-capture phase fence', async () => {
  const actorId = id(); const sessionId = id();
  const config = validateAuthenticatedHostedControllerEnvironment({ ...baseEnvironment(),
    AUTHENTICATED_ACCEPTANCE_MODE: 'v2_primary_prefix_diagnostic' });
  const controller = new AuthenticatedHostedController({ config,
    identity: { verifySession: async () => ({ actorId, sessionId }) },
    adapter: { frame: async () => {
      await new Promise(resolve => setImmediate(resolve));
      return { ...v2DiagnosticCounts(0), targetHash: digest('concurrent-frame') };
    } },
  });
  controller.active = true;
  controller.projects.set('desktop-chromium', { identities: { author: { id: actorId } } });
  controller.boundSessions.set('desktop-chromium:author', { actorId, sessionId });
  const input = { schemaVersion: AUTHENTICATED_V2_RELOAD_CHECKPOINT_SCHEMA, phase: 'before-create',
    projectName: 'desktop-chromium', persona: 'author', accessToken: tokenFor(actorId, sessionId),
    browser: v2DiagnosticBrowser() };
  const outcomes = await Promise.allSettled([
    controller.recordV2ReloadDiagnosticCheckpoint(input), controller.recordV2ReloadDiagnosticCheckpoint(input),
  ]);
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(outcome => outcome.status === 'rejected'
    && /V2_RELOAD_DIAGNOSTIC_PHASE_REJECTED/u.test(outcome.reason?.message)).length, 1);
  assert.equal(controller.v2ReloadCheckpoints.length, 1);
  assert.equal(controller.v2ReloadTargetHashes.length, 1);
});

test('ASSESS-003 records only an independently verified exact assessment.finalize boundary', async () => {
  const harness=await createFinalizeProofHarness();
  await harness.record();
  const action=harness.controller.browserCases[0].actions[0];
  assert.equal(action.commandBindingHash,harness.proof.commandBindingHash);
  assert.equal(action.response.classification,'COMMITTED');
  assert.equal(action.response.receiptIdHash,harness.proof.receiptIdHash);
  assert.equal(Object.hasOwn(action,'assessmentFinalizeProof'),false);
  assert.equal(Object.hasOwn(action,'actorId'),false);
  assert.equal(Object.hasOwn(action,'sessionId'),false);
  assert.equal(Object.hasOwn(action,'commandType'),false);
});

test('ASSESS-003 rejects missing proof and command substitutions before artifact creation', async () => {
  for (const options of [
    {provideProof:false},
    {commandType:'process.update'},
    {commandType:'assessment.response.upsert'},
    {route:'/functions/v1/process-command'},
  ]) {
    const harness=await createFinalizeProofHarness(options);
    await assert.rejects(harness.record(),/ASSESSMENT_FINALIZE_PROOF_REJECTED/u);
    assert.equal(harness.controller.browserCases.length,0);
    assert.equal(harness.controller.serverCases.length,0);
  }
});

test('ASSESS-003 rejects proof drift in resource, version, session and action window', async () => {
  const mutations=[
    proof=>({...proof,commandIdHash:digest('wrong-assessment')}),
    proof=>({...proof,expectedVersion:1}),
    proof=>({...proof,committedVersion:4}),
    proof=>({...proof,sessionHash:digest('wrong-session')}),
    proof=>({...proof,afterCapturedAt:'2026-10-10T00:00:03.000Z'}),
  ];
  for (const mutateProof of mutations) {
    const harness=await createFinalizeProofHarness({mutateProof});
    await assert.rejects(harness.record(),/ASSESSMENT_FINALIZE_PROOF_REJECTED/u);
    assert.equal(harness.controller.browserCases.length,0);
  }
});

test('ASSESS-003 rejects an earlier asynchronous receipt completing inside the finalize window', async () => {
  const harness=await createFinalizeProofHarness({overlap:true});
  await assert.rejects(harness.record(),/ASSESSMENT_FINALIZE_PROOF_REJECTED/u);
  assert.equal(harness.controller.browserCases.length,0);
  assert.equal(harness.controller.serverCases.length,0);
});

test('hosted environment binds the raw authenticated caller and canonical producer', () => {
  const config = validateAuthenticatedHostedControllerEnvironment(baseEnvironment());
  assert.deepEqual(config.workflow, {
    repository: 'APReddy-AutoBotz/AvalaOS-Core',
    producer: { path: '.github/workflows/exhaustive-acceptance.yml',
      ref: 'APReddy-AutoBotz/AvalaOS-Core/.github/workflows/exhaustive-acceptance.yml@refs/heads/main', job: 'acceptance' },
    caller: { path: '.github/workflows/authenticated-product-acceptance.yml',
      ref: 'APReddy-AutoBotz/AvalaOS-Core/.github/workflows/authenticated-product-acceptance.yml@refs/heads/main',
      event: 'workflow_dispatch', job: 'hosted-authenticated' },
    runId: '123', attempt: '2',
  });
  for (const changed of [
    { GITHUB_JOB: 'acceptance' }, { GITHUB_EVENT_NAME: 'pull_request' },
    { AUTHENTICATED_ACCEPTANCE_PROVIDERS_ENABLED: 'true' }, { HOSTED_PILOT_URL: 'https://example.invalid' },
  ]) assert.throws(() => validateAuthenticatedHostedControllerEnvironment({ ...baseEnvironment(), ...changed }), /AUTHENTICATED_HOSTED_CONTROLLER_/u);
});

test('a failed browser assertion remains actual false instead of becoming proof', async () => {
  const config = validateAuthenticatedHostedControllerEnvironment(baseEnvironment());
  let tick = 0;
  const controller = new AuthenticatedHostedController({ config, adapter: {}, identity: {},
    now: () => new Date(Date.UTC(2026, 9, 10, 0, 0, tick++)) });
  controller.active = true;
  const projectName = 'desktop-chromium';
  controller.projects.set(projectName, { lastBoundaryAt: '2026-10-09T23:59:59.000Z' });
  const actionId = digest('action');
  controller.browserActions.set(projectName, [{ actionId, occurredAt: '2026-10-10T00:00:01.000Z',
    actorHash: digest('actor'), sessionHash: digest('session'), requestIdHash: digest('request'),
    browserPayloadHash: digest('payload'), commandBindingHash: digest('binding'),
    response: { status: 403, classification: 'PERMISSION_DENIED', commandIdHash: null, receiptIdHash: null },
    persona: 'author', route: '/functions/v1/process-command', status: 403, complete: true,
    before: { capturedAt: '2026-10-10T00:00:00.000Z', records: [] },
    after: { capturedAt: '2026-10-10T00:00:02.000Z', records: [] } }]);
  await controller.recordBrowserCase({ projectName, row: { testId: 'ASSESS-002', controls: { assertions: [
    { id: 'persisted-process-edit-denied', status: 'passed' },
    { id: 'unchanged-process-after-reload', status: 'failed' },
  ] } }, actionIds: [actionId] });
  assert.equal(controller.browserCases[0].assertions[0].actual, true);
  assert.equal(controller.browserCases[0].assertions[1].actual, false);
});

test('permit arming never forwards caller-authored deterministic content', async () => {
  let received;
  const config = validateAuthenticatedHostedControllerEnvironment(baseEnvironment());
  const controller = new AuthenticatedHostedController({ config,
    adapter: { armPermit: async input => { received = input; return { armed: true }; } }, identity: {} });
  controller.active = true;
  await controller.armPermit({ kind: 'studio_deterministic_success', commandType: 'studio.generation.request',
    actorId: id(), sessionId: id(), requestId: id(), payloadHash: digest('payload').slice(7), expectedVersion: 0,
    deterministicOutput: { forbidden: 'browser-authored' } });
  assert.equal(Object.hasOwn(received, 'deterministicOutput'), false);
  await assert.rejects(controller.armPermit({ kind: 'studio_deterministic_success', commandType: 'studio.generation.request',
    actorId: id(), sessionId: id(), requestId: id(), payloadHash: digest('payload').slice(7), expectedVersion: null }), /PERMIT_REJECTED/u);
});

test('real session binding is idempotent and namespaces the browser project persona', async () => {
  const actorId=id();const sessionId=id();const calls=[];
  const controller=new AuthenticatedHostedController({config:validateAuthenticatedHostedControllerEnvironment(baseEnvironment()),
    identity:{verifySession:async()=>({actorId,sessionId})},adapter:{bindSession:async input=>calls.push(input)}});
  controller.active = true;
  controller.projects.set('desktop-chromium',{identities:{author:{id:actorId}}});
  const accessToken=tokenFor(actorId,sessionId);
  await controller.bindBrowserSession({projectName:'desktop-chromium',persona:'author',accessToken});
  await controller.bindBrowserSession({projectName:'desktop-chromium',persona:'author',accessToken});
  assert.equal(calls.length,1);assert.equal(calls[0].persona,'author_desktop-chromium');
});

test('cached browser actions reverify the exact presented token before observation', async () => {
  const actorId=id();const sessionId=id();const validToken=tokenFor(actorId,sessionId);
  const forgedToken=`${validToken.slice(0,validToken.lastIndexOf('.')+1)}${'y'.repeat(48)}`;
  let observeCalls=0;let verifyCalls=0;
  const controller=new AuthenticatedHostedController({config:validateAuthenticatedHostedControllerEnvironment(baseEnvironment()),
    identity:{verifySession:async({accessToken})=>{verifyCalls+=1;if(accessToken!==validToken)throw new Error('SESSION_REJECTED');
      return {actorId,sessionId};}},adapter:{bindSession:async()=>{},observe:async()=>{observeCalls+=1;
      return {capturedAt:'2026-10-10T00:00:00.000Z',records:[]};}}});
  controller.active = true;
  controller.projects.set('desktop-chromium',{processId:'process',identities:{author:{id:actorId}}});
  await controller.bindBrowserSession({projectName:'desktop-chromium',persona:'author',accessToken:validToken});
  await assert.rejects(controller.beginBrowserAction({projectName:'desktop-chromium',accessToken:forgedToken,
    route:'/functions/v1/process-command',requestBody:{requestId:id(),commandType:'process.update'}}),/SESSION_REJECTED/u);
  assert.equal(verifyCalls,2);assert.equal(observeCalls,0);
});

test('cached browser actions reject a stale session before observation', async () => {
  const actorId=id();const sessionId=id();const accessToken=tokenFor(actorId,sessionId);let active=true;let observeCalls=0;
  const controller=new AuthenticatedHostedController({config:validateAuthenticatedHostedControllerEnvironment(baseEnvironment()),
    identity:{verifySession:async()=>{if(!active)throw new Error('SESSION_STALE');return {actorId,sessionId};}},
    adapter:{bindSession:async()=>{},observe:async()=>{observeCalls+=1;return {capturedAt:'2026-10-10T00:00:00.000Z',records:[]};}}});
  controller.active = true;
  controller.projects.set('desktop-chromium',{processId:'process',identities:{author:{id:actorId}}});
  await controller.bindBrowserSession({projectName:'desktop-chromium',persona:'author',accessToken});
  active=false;
  await assert.rejects(controller.beginBrowserAction({projectName:'desktop-chromium',accessToken,
    route:'/functions/v1/process-command',requestBody:{requestId:id(),commandType:'process.update'}}),/SESSION_STALE/u);
  assert.equal(observeCalls,0);
});

test('browser fault arming rejects a valid alternate session before permit effects', async () => {
  const actorId=id();const boundSessionId=id();const alternateSessionId=id();let permitCalls=0;
  const controller=new AuthenticatedHostedController({config:validateAuthenticatedHostedControllerEnvironment(baseEnvironment()),
    identity:{verifySession:async({sessionId})=>({actorId,sessionId})},adapter:{armPermit:async()=>{permitCalls+=1;return {armed:true};}}});
  controller.active=true;controller.projects.set('desktop-chromium',{identities:{author:{id:actorId}}});
  controller.boundSessions.set('desktop-chromium:author',{project:'desktop-chromium',persona:'author',actorId,
    sessionId:boundSessionId,actorHash:digest(actorId),sessionHash:digest(boundSessionId)});
  await assert.rejects(controller.armBrowserFault({projectName:'desktop-chromium',persona:'author',kind:'studio_deterministic_success',
    commandType:'studio.generation.request',accessToken:tokenFor(actorId,alternateSessionId),requestBody:{requestId:id(),
      commandType:'studio.generation.request',expectedAggregateVersion:7,payload:{source:'server-bound'}}}),
  /SESSION_ROTATION_REJECTED|SESSION_VERIFY_REJECTED/u);
  assert.equal(permitCalls,0);
});

test('browser fault arming requires a prior exact binding without creating one', async () => {
  const actorId=id();const sessionId=id();let bindCalls=0;let permitCalls=0;
  const controller=new AuthenticatedHostedController({config:validateAuthenticatedHostedControllerEnvironment(baseEnvironment()),
    identity:{verifySession:async()=>({actorId,sessionId})},adapter:{bindSession:async()=>{bindCalls+=1;},
      armPermit:async()=>{permitCalls+=1;return {armed:true};}}});
  controller.active=true;controller.projects.set('desktop-chromium',{identities:{author:{id:actorId}}});
  await assert.rejects(controller.armBrowserFault({projectName:'desktop-chromium',persona:'author',kind:'studio_deterministic_success',
    commandType:'studio.generation.request',accessToken:tokenFor(actorId,sessionId),requestBody:{requestId:id(),
      commandType:'studio.generation.request',expectedAggregateVersion:7,payload:{source:'server-bound'}}}),
  /SESSION_VERIFY_REJECTED/u);
  assert.equal(bindCalls,0);assert.equal(permitCalls,0);assert.equal(controller.boundSessions.size,0);
});

test('browser action binding rejects an unknown project with a bounded controller error', async () => {
  const actorId=id();const sessionId=id();
  const controller=new AuthenticatedHostedController({config:validateAuthenticatedHostedControllerEnvironment(baseEnvironment()),
    identity:{verifySession:async()=>({actorId,sessionId})},adapter:{}});
  await assert.rejects(controller.resolveBrowserActionBinding({projectName:'missing-project',accessToken:tokenFor(actorId,sessionId)}),
    /^Error: AUTHENTICATED_HOSTED_CONTROLLER_PROJECT_NOT_FOUND$/u);
});

test('snapshot controls require an explicit registered project and preserve its observation scope', async () => {
  const config=validateAuthenticatedHostedControllerEnvironment(baseEnvironment());
  const calls=[];
  const snapshot={reviewAssignments:2,governResolutions:1,commandReceipts:4,privilegedAudits:4};
  const controller=new AuthenticatedHostedController({config,identity:{},adapter:{
    frame:async (pathname,input)=>{calls.push({pathname,input});return snapshot;},
  }});
  const desktop={processId:id()};const pixel={processId:id()};
  controller.active=true;
  controller.projects.set('desktop-chromium',desktop);
  controller.projects.set('pixel-7',pixel);
  for (const input of [{},{projectName:'unregistered-project'}]) {
    await assert.rejects(controller.control('/control/snapshot',input),
      /^Error: AUTHENTICATED_HOSTED_CONTROLLER_PROJECT_NOT_FOUND$/u);
  }
  assert.equal(calls.length,0,'missing scope must never default to another project');
  assert.deepEqual(await controller.control('/control/snapshot',{projectName:'desktop-chromium'}),snapshot);
  assert.equal(calls.length,1);
  assert.equal(calls[0].pathname,'/control/snapshot');
  assert.equal(calls[0].input.project,desktop);
  assert.equal(calls[0].input.scope,config.scope);
});

test('Studio fault arming uses the production expectedAggregateVersion envelope', async () => {
  const actorId=id();const sessionId=id();let permit;
  const controller=new AuthenticatedHostedController({config:validateAuthenticatedHostedControllerEnvironment(baseEnvironment()),
    identity:{verifySession:async()=>({actorId,sessionId})},adapter:{armPermit:async input=>{permit=input;return {armed:true};}}});
  controller.active=true;controller.projects.set('desktop-chromium',{identities:{author:{id:actorId}}});
  controller.boundSessions.set('desktop-chromium:author',{project:'desktop-chromium',persona:'author',actorId,sessionId,
    actorHash:digest(actorId),sessionHash:digest(sessionId)});
  await controller.armBrowserFault({projectName:'desktop-chromium',persona:'author',kind:'studio_deterministic_success',
    commandType:'studio.generation.request',accessToken:tokenFor(actorId,sessionId),requestBody:{requestId:id(),
      commandType:'studio.generation.request',expectedAggregateVersion:7,payload:{source:'server-bound'}}});
  assert.equal(permit.expectedVersion,7);
});

test('browser action captures a pre-request frame and requires its explicit case binding', async () => {
  const actorId=id();const sessionId=id();const actionRequest=id();let captures=0;
  const frames=[{capturedAt:'2026-10-10T00:00:00.000Z',records:[]},{capturedAt:'2026-10-10T00:00:02.000Z',records:[]}];
  const controller=new AuthenticatedHostedController({config:validateAuthenticatedHostedControllerEnvironment(baseEnvironment()),
    now:()=>new Date('2026-10-10T00:00:01.000Z'),identity:{verifySession:async()=>({actorId,sessionId})},adapter:{
      bindSession:async()=>{},observe:async input=>{assert.equal(input.project.processId,'process');
        assert.equal(Object.hasOwn(input,'to'),false);return frames[captures++];},
    }});
  controller.active = true;
  controller.startedAt='2026-10-09T23:59:59.000Z';controller.projects.set('desktop-chromium',{processId:'process',
    identities:{author:{id:actorId}},lastBoundaryAt:controller.startedAt});
  const accessToken=tokenFor(actorId,sessionId);
  const started=await controller.beginBrowserAction({projectName:'desktop-chromium',accessToken,
    route:'/functions/v1/process-command',requestBody:{requestId:actionRequest,commandType:'process.update',payload:{name:'x'}}});
  await controller.finishBrowserAction({projectName:'desktop-chromium',actionId:started.actionId,status:403,
    responseBody:{error:{code:'PERMISSION_DENIED'}}});
  await assert.rejects(controller.recordBrowserCase({projectName:'desktop-chromium',row:{testId:'ASSESS-002',controls:{assertions:[
    {id:'persisted-process-edit-denied',status:'passed'},{id:'unchanged-process-after-reload',status:'passed'}]}}}),
  /ACTION_BINDING_REJECTED/u);
  await controller.recordBrowserCase({projectName:'desktop-chromium',actionIds:[started.actionId],row:{testId:'ASSESS-002',
    controls:{assertions:[{id:'persisted-process-edit-denied',status:'passed'},{id:'unchanged-process-after-reload',status:'passed'}]}}});
  assert.equal(captures,2);assert.equal(controller.serverCases[0].before.capturedAt,frames[0].capturedAt);
});

test('database target tuple rejects username substrings and query host overrides', () => {
  const config=validateAuthenticatedHostedControllerEnvironment(baseEnvironment());
  assert.equal(validateAuthenticatedDatabaseTarget(config),true);
  for(const databaseUrl of [
    'postgresql://postgres.abcdefghijklmnopqrst.impostor:p@aws-0.pooler.supabase.com:6543/postgres?sslmode=verify-full',
    'postgresql://postgres:p@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full&host=foreign.invalid',
  ]) assert.throws(()=>validateAuthenticatedDatabaseTarget({...config,databaseUrl}),/DATABASE_TARGET_REJECTED/u);
});

test('failed runs quiesce, revoke and verify cleanup', async () => {
  const calls = [];
  const config = validateAuthenticatedHostedControllerEnvironment(baseEnvironment());
  const controller = new AuthenticatedHostedController({ config, identity: { revokeAll: async () => calls.push('revoke') }, adapter: {
    quiesce: async () => calls.push('quiesce'), cleanup: async () => calls.push('cleanup'),
    verifyCleanup: async () => ({ activeSessions: 0, activeIdentities:0,activeMemberships: 0, armedPermits: 0,
      activeSecretMaterial: 0, unapprovedActiveResidue: 0, nonExerciseChanged: false, immutableHistoryPreserved: true }),
  } });
  controller.active = true;
  assert.deepEqual(await controller.abortAndQuiesce(), { quiesced: true });
  assert.deepEqual(calls, ['quiesce', 'revoke', 'cleanup']);
});

test('cleanup before any committed setup leaves existing workspace controls untouched', async () => {
  const commands=[];
  const config=validateAuthenticatedHostedControllerEnvironment(baseEnvironment());
  const adapter=createAuthenticatedHostedPostgresAdapter({config,db:{query:async sql=>{
    commands.push(sql);return {rows:[]};
  }}});
  await adapter.cleanup({exerciseId:id(),projects:[]});
  assert.equal(commands.some(sql=>/\b(?:UPDATE|DELETE FROM) public\.(?:legacy_delivery_workspace_controls|studio_delivery_workspace_controls|enterprise_transcript_workspace_flags)\b/u.test(sql)),false);
});

test('cleanup control reads serialize on the single PostgreSQL client', async () => {
  let inFlight=false;const calls=[];
  const query=async sql=>{
    assert.equal(inFlight,false,'cleanup queries must not overlap on pg.Client');inFlight=true;calls.push(sql);
    await new Promise(resolve=>setTimeout(resolve,2));inFlight=false;return {rows:[]};
  };
  await readAuthenticatedHostedCleanupControls(query,[id(),id()]);
  assert.equal(calls.length,4);
  assert.match(calls[0],/legacy_delivery_workspace_controls/u);
  assert.match(calls[1],/studio_delivery_workspace_controls/u);
  assert.match(calls[2],/enterprise_transcript_workspace_flags/u);
  assert.match(calls[3],/assess_v2_runtime_control/u);
});

test('trusted parent identity diagnostic takes precedence over browser reporting', () => {
  const controller=new AuthenticatedHostedController({config:validateAuthenticatedHostedControllerEnvironment(baseEnvironment()),
    adapter:{},identity:{}});
  controller.recordIdentityDiagnostic({projectName:'desktop-chromium',
    diagnostic:{operation:'PROVISION',category:'IDENTITY_INPUT_REJECTED',upstreamCode:'email_address_invalid'}},'parent');
  controller.recordIdentityDiagnostic({projectName:'desktop-chromium',
    diagnostic:{operation:'SIGN_IN',category:'CREDENTIAL_REJECTED',upstreamCode:'invalid_credentials'}},'browser');
  assert.deepEqual(controller.failureDiagnostic(),{source:'parent',project:'desktop-chromium',operation:'PROVISION',
    category:'IDENTITY_INPUT_REJECTED',upstreamCode:'email_address_invalid'});
  assert.throws(()=>controller.recordIdentityDiagnostic({projectName:'desktop-chromium',diagnostic:{operation:'SIGN_IN',
    category:'CREDENTIAL_REJECTED',upstreamCode:'raw-upstream-body'}},'browser'),/BROWSER_DIAGNOSTIC_REJECTED/u);
});

test('identity adapter maps 400 to input rejection and keeps only allowlisted upstream code', async () => {
  const config=validateAuthenticatedHostedControllerEnvironment(baseEnvironment());
  const adapter=createAuthenticatedHostedIdentityAdapter({config,db:{},fetchImpl:async()=>({ok:false,status:400,
    json:async()=>({error_code:'email_address_invalid',message:'fixture-sensitive-value'})})});
  await assert.rejects(adapter.provisionProject({projectName:'desktop-chromium',exerciseDigest:digest('exercise'),
    personas:['author']}),error=>{
    assert.equal(error.message,'AUTHENTICATED_HOSTED_IDENTITY_IDENTITY_INPUT_REJECTED');
    assert.deepEqual(error.authenticatedHostedIdentityDiagnostic,{operation:'PROVISION',
      category:'IDENTITY_INPUT_REJECTED',upstreamCode:'email_address_invalid'});
    assert.equal(JSON.stringify(error.authenticatedHostedIdentityDiagnostic).includes('fixture-sensitive-value'),false);
    return true;
  });
});

test('cancelled identity creation records an unknown mutation outcome instead of certifying cleanup', async () => {
  const config = validateAuthenticatedHostedControllerEnvironment(baseEnvironment());
  let observedSignal;
  const adapter = createAuthenticatedHostedIdentityAdapter({ config, db: {}, fetchImpl: async (_url, init) => {
    observedSignal = init.signal;
    return new Promise((_resolve, reject) => observedSignal.addEventListener('abort',
      () => reject(new Error('private cancelled creation')), { once: true }));
  } });
  const abort = new AbortController();
  const provisioning = adapter.provisionProject({ projectName: 'desktop-chromium', exerciseDigest: digest('exercise'),
    personas: ['author'], signal: abort.signal });
  abort.abort();
  await assert.rejects(provisioning, /IDENTITY_TRANSPORT_FAILURE/u);
  assert.equal(adapter.created.size, 0);
  assert.deepEqual([...adapter.unknownMutationOutcomes], ['PROVISION']);

  const controller = new AuthenticatedHostedController({ config, identity: adapter, adapter: {
    quiesce: async () => undefined, cleanup: async () => undefined,
    verifyCleanup: async () => ({ activeSessions: 0, activeIdentities: 0, activeMemberships: 0, armedPermits: 0,
      activeSecretMaterial: 0, unapprovedActiveResidue: 0, nonExerciseChanged: false, immutableHistoryPreserved: true }),
  } });
  controller.active = true;
  await assert.rejects(controller.abortAndQuiesce(), /ABORT_CLEANUP_REJECTED/u);
  assert.equal(controller.quiesced, false);
});

test('abort cannot certify cleanup if unrelated state changed or retained history was lost', async () => {
  for(const failed of [{nonExerciseChanged:true},{immutableHistoryPreserved:false}]){
    const controller=new AuthenticatedHostedController({config:validateAuthenticatedHostedControllerEnvironment(baseEnvironment()),
      identity:{revokeAll:async()=>{}},adapter:{quiesce:async()=>{},cleanup:async()=>{},
        verifyCleanup:async()=>({activeSessions:0,activeIdentities:0,activeMemberships:0,armedPermits:0,
          activeSecretMaterial:0,unapprovedActiveResidue:0,nonExerciseChanged:false,immutableHistoryPreserved:true,...failed})}});
    controller.active=true;
    await assert.rejects(()=>controller.abortAndQuiesce(),/ABORT_CLEANUP_REJECTED/u);
    assert.equal(controller.quiesced,false);
  }
});

test('runner reports cleanup-incomplete instead of swallowing abort cleanup failure', async () => {
  const environment=baseEnvironment();const config=validateAuthenticatedHostedControllerEnvironment(environment);
  const adapter={preflight:async()=>({syntheticTarget:true,production:false,releaseSha:config.releaseSha,
    deploymentId:config.deploymentId,migrationVersion:config.migrationVersion,backendDigest:config.backendDigest,
    providersEnabled:false,runtimeReady:true,secretBackendKind:'supabase_vault',secretBackendWritable:true,
    publicTargetDigest:config.targetPublicDigest,baselineDigest:config.baselineDigest,
    customerRows:0,unapprovedActiveResidue:0,scopeReady:true,
    observationStartedAt:'2026-10-10T00:00:00.000Z'}),
  activate:async()=>{},quiesce:async()=>{throw new Error('sanitized cleanup failure');}};
  await assert.rejects(runAuthenticatedHostedAcceptance(environment,{database:{},verifyCheckout:async()=>{},
    createPostgresAdapter:()=>adapter,createIdentityAdapter:()=>({revokeAll:async()=>{}}),
    startServer:async()=>({baseUrl:'http://127.0.0.1:1',controlToken:'token',close:async()=>{}}),
    runPlaywright:async()=>{throw new Error('browser failed');}}),/AUTHENTICATED_HOSTED_RUNNER_CLEANUP_INCOMPLETE/u);
});

test('checkout state diagnostics distinguish exact-head and full-porcelain failures without paths', async () => {
  const expectedHead = 'a'.repeat(40);
  const cases = [
    { name: 'head mismatch', head: 'b'.repeat(40), status: '',
      code: 'HEAD_MISMATCH_TRACKED_0_UNTRACKED_0' },
    { name: 'tracked dirt', head: expectedHead, status: ' M scripts/example.mjs\n',
      code: 'TRACKED_DIRTY_TRACKED_1_UNTRACKED_0' },
    { name: 'untracked dirt', head: expectedHead, status: '?? acceptance-results/example.json\n',
      code: 'UNTRACKED_DIRTY_TRACKED_0_UNTRACKED_1' },
    { name: 'mixed dirt', head: expectedHead,
      status: ' M scripts/example.mjs\n?? acceptance-results/example.json\n',
      code: 'MIXED_DIRTY_TRACKED_1_UNTRACKED_1' },
  ];
  for (const fixture of cases) {
    const calls = [];
    const git = async (command, args, options) => {
      calls.push({ command, args, options });
      return { stdout: args[0] === 'rev-parse' ? `${fixture.head}\n` : fixture.status };
    };
    await assert.rejects(
      verifyAuthenticatedHostedCheckoutState(expectedHead, { git }),
      error => {
        assert.equal(error.message,
          `AUTHENTICATED_HOSTED_RUNNER_CHECKOUT_NOT_EXACT_CLEAN_RELEASE_${fixture.code}`,
          fixture.name);
        assert.equal(error.message.includes('scripts/example.mjs'), false);
        assert.equal(error.message.includes('acceptance-results/example.json'), false);
        return true;
      },
    );
    assert.deepEqual(calls, [
      { command: 'git', args: ['rev-parse', 'HEAD'], options: { cwd: process.cwd(), encoding: 'utf8' } },
      { command: 'git', args: ['status', '--porcelain=v1', '--untracked-files=all'],
        options: { cwd: process.cwd(), encoding: 'utf8' } },
    ]);
  }
  assert.deepEqual(await verifyAuthenticatedHostedCheckoutState(expectedHead, { git: async (_command, args) => ({
    stdout: args[0] === 'rev-parse' ? `${expectedHead}\n` : '',
  }) }), { classification: 'CLEAN', trackedCount: 0, untrackedCount: 0 });
  await assert.rejects(
    verifyAuthenticatedHostedCheckoutState(expectedHead, { git: async () => { throw new Error('private detail'); } }),
    error => error.message
      === 'AUTHENTICATED_HOSTED_RUNNER_CHECKOUT_NOT_EXACT_CLEAN_RELEASE_GIT_INSPECTION_REJECTED_TRACKED_0_UNTRACKED_0',
  );
});

test('checkout verification rejects tracked and original oracle-manifest contamination before protected digests', async () => {
  const env = baseEnvironment();
  const catalog = JSON.parse(fs.readFileSync('tests/acceptance/catalog/test-catalog.json', 'utf8'));
  const provenance = JSON.parse(fs.readFileSync('tests/acceptance/source-provenance.json', 'utf8'));
  env.AUTHENTICATED_ACCEPTANCE_CATALOG_DIGEST = canonicalDigest(catalog);
  env.AUTHENTICATED_ACCEPTANCE_SOURCE_DIGEST = canonicalDigest(provenance.sourceDigests);
  const config = validateAuthenticatedHostedControllerEnvironment(env);
  for (const dirtyStatus of [
    ' M scripts/runAuthenticatedHostedAcceptance.mjs\n',
    '?? acceptance-results/sut-oracle-results.json\n',
  ]) {
    const calls = [];
    const git = async (command, args, options) => {
      calls.push({ command, args, options });
      return { stdout: args[0] === 'rev-parse' ? `${config.releaseSha}\n` : dirtyStatus };
    };
    const classification = dirtyStatus.startsWith('?? ') ? 'UNTRACKED_DIRTY_TRACKED_0_UNTRACKED_1'
      : 'TRACKED_DIRTY_TRACKED_1_UNTRACKED_0';
    await assert.rejects(verifyAuthenticatedHostedCheckout(config, { git }), error => error.message
      === `AUTHENTICATED_HOSTED_RUNNER_CHECKOUT_NOT_EXACT_CLEAN_RELEASE_${classification}`);
    assert.deepEqual(calls, [
      { command: 'git', args: ['rev-parse', 'HEAD'], options: { cwd: process.cwd(), encoding: 'utf8' } },
      { command: 'git', args: ['status', '--porcelain=v1', '--untracked-files=all'],
        options: { cwd: process.cwd(), encoding: 'utf8' } },
    ]);
  }
});

test('Vault preflight uses capabilities-self and requires create update delete', async () => {
  const seen = [];
  const organizationId='11111111-1111-4111-8111-111111111111';
  const capabilityPath='secret/data/avalaos/authenticated/11111111111141118111111111111111/*';
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    if(url.startsWith('https://api.supabase.com/')) return {ok:true,json:async()=>[
      {name:'AVALA_VAULT_ADDR',value:digest('https://vault.example.invalid').slice(7)},
      {name:'AVALA_VAULT_TOKEN',value:digest('synthetic-token-material').slice(7)},
      {name:'AVALA_VAULT_PROVIDER_SECRET_PATH',value:digest('secret/data/avalaos/authenticated').slice(7)},
    ]};
    return { ok: true, json: async () => ({ capabilities: ['create','read','update','delete'] }) };
  };
  assert.deepEqual(await verifyAuthenticatedSecretBackend({ AVALA_VAULT_ADDR: 'https://vault.example.invalid',
    AVALA_VAULT_TOKEN: 'synthetic-token-material', AUTHENTICATED_ACCEPTANCE_SUPABASE_MANAGEMENT_TOKEN:'management-token-value',
    AUTHENTICATED_ACCEPTANCE_SECRET_BACKEND:'hashicorp_vault',AVALA_PROVIDER_SECRET_BACKEND:'hashicorp_vault',
    AUTHENTICATED_ACCEPTANCE_VAULT_SECRET_PATH: 'secret/data/avalaos/authenticated' }, { fetchImpl,projectRef:'abcdefghijklmnopqrst',organizationId }),
  { kind: 'hashicorp_vault', writable: true });
  assert.equal(seen[1].url, 'https://vault.example.invalid/v1/sys/capabilities-self');
  await assert.rejects(verifyAuthenticatedSecretBackend({ AVALA_VAULT_ADDR: 'https://vault.example.invalid',
    AVALA_VAULT_TOKEN: 'synthetic-token-material', AUTHENTICATED_ACCEPTANCE_SUPABASE_MANAGEMENT_TOKEN:'management-token-value',
    AUTHENTICATED_ACCEPTANCE_SECRET_BACKEND:'hashicorp_vault',AVALA_PROVIDER_SECRET_BACKEND:'hashicorp_vault',
    AUTHENTICATED_ACCEPTANCE_VAULT_SECRET_PATH: 'secret/data/avalaos/authenticated' },
  {projectRef:'abcdefghijklmnopqrst',organizationId,fetchImpl:async url=>url.startsWith('https://api.supabase.com/')
    ?({ok:true,json:async()=>[{name:'AVALA_VAULT_ADDR',digest:digest('https://vault.example.invalid')},
      {name:'AVALA_VAULT_TOKEN',digest:digest('synthetic-token-material')},{name:'AVALA_VAULT_PROVIDER_SECRET_PATH',digest:digest('secret/data/avalaos/authenticated')} ]})
    :({ ok: true, json: async () => ({ capabilities: ['read'] }) }) }), /CAPABILITY_REJECTED/u);
});

test('native Vault preflight requires the explicit deployed selector, wrapper ACL and zero incompatible residue', async () => {
  const environment={AUTHENTICATED_ACCEPTANCE_SECRET_BACKEND:'supabase_vault',
    AVALA_PROVIDER_SECRET_BACKEND:'supabase_vault',AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION:'20261011053000',
    AUTHENTICATED_ACCEPTANCE_SUPABASE_MANAGEMENT_TOKEN:'management-token-value'};
  const fetchImpl=async()=>({ok:true,json:async()=>[{name:'AVALA_PROVIDER_SECRET_BACKEND',
    digest:digest('supabase_vault')}]});
  const database={query:async sql=>{
    if(sql.includes('enterprise_provider_secret_backend_capability() value'))return {rows:[{value:{
      backendKind:'supabase_vault',available:true,migrationTip:'20261011053000',exerciseActive:false,
      providerCallsAuthorized:false}}]};
    if(sql.includes('WITH wrappers(signature)'))return {rows:[{wrapper_count:8,service_execute:true,anon_execute:false,
      authenticated_execute:false,anon_vault_usage:false,authenticated_vault_usage:false,anon_secret_read:false,
      authenticated_secret_read:false,anon_decrypted_read:false,authenticated_decrypted_read:false}]};
    if(sql.includes('unfinished_cleanup'))return {rows:[{unfinished_cleanup:0,unfinished_managed_writes:0,
      native_material_residue:0,incompatible_enabled_routes:0}]};
    throw new Error('unexpected query');
  }};
  assert.deepEqual(await verifyAuthenticatedSecretBackend(environment,{fetchImpl,database,
    projectRef:'abcdefghijklmnopqrst'}),{kind:'supabase_vault',writable:true});
  await assert.rejects(verifyAuthenticatedSecretBackend(environment,{fetchImpl:async()=>({ok:true,json:async()=>[]}),
    database,projectRef:'abcdefghijklmnopqrst'}),/REMOTE_SECRET_CONFIGURATION_REJECTED/u);
  await assert.rejects(verifyAuthenticatedSecretBackend({...environment,AVALA_PROVIDER_SECRET_BACKEND:'hashicorp_vault'},
    {fetchImpl,database,projectRef:'abcdefghijklmnopqrst'}),/SELECTOR_REJECTED/u);
  const residueDatabase={query:async sql=>sql.includes('enterprise_provider_secret_backend_capability() value')
    ?database.query(sql):sql.includes('WITH wrappers(signature)')?database.query(sql)
      :({rows:[{unfinished_cleanup:1,unfinished_managed_writes:0,native_material_residue:0,
        incompatible_enabled_routes:0}]})};
  await assert.rejects(verifyAuthenticatedSecretBackend(environment,{fetchImpl,database:residueDatabase,
    projectRef:'abcdefghijklmnopqrst'}),/RESIDUE_REJECTED/u);
});
