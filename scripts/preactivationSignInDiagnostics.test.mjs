import assert from 'node:assert/strict';
import { mkdir, mkdtemp, copyFile, lstat, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import {
  PREACTIVATION_SIGN_IN_CHILD_SCHEMA,
  PREACTIVATION_SIGN_IN_PHASES,
  PREACTIVATION_SIGN_IN_SOURCE_PATHS,
  PREACTIVATION_SIGN_IN_SUMMARY_SCHEMA,
  createPreactivationSignInDiagnosticSession,
  preactivationSignInDiagnosticPaths,
  preactivationSignInSourceBindings,
  readPreactivationSignInChild,
  readPreactivationSignInParent,
  resolvePreactivationSignInIdentity,
  validatePreactivationSignInChild,
  validatePreactivationSignInParent,
  writePreactivationSignInChild,
  writePreactivationSignInSummary,
} from './preactivationSignInDiagnostics.mjs';
import PreactivationSignInPlaywrightReporter from './preactivationSignInPlaywrightReporter.mjs';
import { createPreactivationSignInRequestCorrelationCollector,
  PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_ANNOTATION } from './preactivationSignInRequestCorrelation.mjs';
import { runPreactivationSignInDiagnosticPhase } from './testAuthenticatedHostedSignInEntry.mjs';
import { verifyPreactivationSignInDiagnostics } from './verifyPreactivationSignInDiagnostics.mjs';

const nonce = 'a'.repeat(64);
const localIdentity = resolvePreactivationSignInIdentity({}, nonce);
const knownTitle = 'actual application uses the shared real-auth helper for rejected, cold and cached sign-in';

const workspace = async (t, { copySources = false } = {}) => {
  const parent = path.resolve('output/local-private');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'preactivation-signin-diagnostics-unit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  if (copySources) {
    for (const source of PREACTIVATION_SIGN_IN_SOURCE_PATHS) {
      const destination = path.join(root, source);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(path.resolve(source), destination);
    }
  }
  return root;
};
const bindings = () => preactivationSignInSourceBindings(process.cwd());
const testCase = (title = knownTitle, project = 'desktop-chromium', annotations = []) => ({
  title, annotations, parent: { project: () => ({ name: project }) },
});
const correlationSnapshot = () => {
  const collector = createPreactivationSignInRequestCorrelationCollector();
  const request = { url: () => 'https://backend.example.invalid/functions/v1/tenant-session' };
  collector.requestDiagnostics.onRoute(request);
  collector.requestDiagnostics.onRequest(request);
  collector.actionDiagnostics.onStart(request, { route: '/functions/v1/tenant-session' });
  return collector.freeze({ targetRequest: request, gate: { armed: false, waiting: true, released: false },
    pendingActionStarts: 1, activeActionCount: 0 });
};
const summary = (identity, phase, phaseNonce, terminalCases = {
  total: 4, passed: 4, failed: 0, timedOut: 0, skipped: 0, interrupted: 0,
}) => ({ schemaVersion: PREACTIVATION_SIGN_IN_SUMMARY_SCHEMA, identity, phase, phaseNonce, terminalCases });

test('identity requires explicit local context or exact release workflow identity', () => {
  assert.equal(localIdentity.environment, 'local');
  const ci = resolvePreactivationSignInIdentity({
    GITHUB_ACTIONS: 'true', RELEASE_SHA: 'b'.repeat(40), GITHUB_SHA: 'c'.repeat(40),
    GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '2',
    GITHUB_WORKFLOW: 'Authenticated Product Acceptance Preparation', GITHUB_JOB: 'preactivation-checkout',
  }, nonce);
  assert.equal(ci.headSha, 'b'.repeat(40));
  for (const altered of [
    { RELEASE_SHA: '', GITHUB_SHA: 'c'.repeat(40) },
    { GITHUB_WORKFLOW: 'substituted' },
    { GITHUB_JOB: 'substituted' },
    { GITHUB_RUN_ID: '1'.repeat(21) },
  ]) assert.throws(() => resolvePreactivationSignInIdentity({
    GITHUB_ACTIONS: 'true', RELEASE_SHA: 'b'.repeat(40), GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '2',
    GITHUB_WORKFLOW: 'Authenticated Product Acceptance Preparation', GITHUB_JOB: 'preactivation-checkout',
    ...altered,
  }, nonce), /CI_IDENTITY_REJECTED/u);
});

test('parent schema rejects extra fields and forged passed checkpoints', async t => {
  const root = await workspace(t);
  const session = await createPreactivationSignInDiagnosticSession({ workspaceRoot: root,
    identity: localIdentity, sourceBindings: await bindings() });
  const parent = session.snapshot();
  assert.equal(validatePreactivationSignInParent({ ...parent, injected: true }), null);
  parent.status = 'passed';
  parent.phases.forEach(phase => { phase.status = 'passed'; });
  assert.equal(validatePreactivationSignInParent(parent), null);
});

test('session rejects stale parent and private output', async t => {
  const root = await workspace(t);
  const sourceBindings = await bindings();
  await createPreactivationSignInDiagnosticSession({ workspaceRoot: root,
    identity: localIdentity, sourceBindings });
  await assert.rejects(createPreactivationSignInDiagnosticSession({ workspaceRoot: root,
    identity: localIdentity, sourceBindings }), /STALE_OUTPUT/u);
});

test('child reader rejects cross-phase nonce and oversized or malformed child', async t => {
  const root = await workspace(t);
  const child = {
    schemaVersion: PREACTIVATION_SIGN_IN_CHILD_SCHEMA, identity: localIdentity,
    phase: 'entry', phaseNonce: 'b'.repeat(64), project: 'desktop-chromium',
    testCategory: 'authenticated-sign-in', status: 'failed', durationMs: 12,
    failure: { code: 'CONTROL_TIMEOUT' },
    requestCorrelation: { state: 'unavailable', reason: 'MISSING', detail: null },
  };
  await writePreactivationSignInChild(child, { workspaceRoot: root });
  assert.equal((await readPreactivationSignInChild(localIdentity, 'entry', 'c'.repeat(64),
    { workspaceRoot: root })).reason, 'NONCE');
  assert.equal((await readPreactivationSignInChild(localIdentity, 'safety', 'b'.repeat(64),
    { workspaceRoot: root })).reason, 'MISSING');
  const malformedRoot = await workspace(t);
  const malformed = preactivationSignInDiagnosticPaths(malformedRoot, 'entry');
  await mkdir(malformed.phaseRoot, { recursive: true });
  await writeFile(malformed.childPath, '{');
  assert.equal((await readPreactivationSignInChild(localIdentity, 'entry', 'b'.repeat(64),
    { workspaceRoot: malformedRoot })).reason, 'MALFORMED');
  const oversizedRoot = await workspace(t);
  const oversized = preactivationSignInDiagnosticPaths(oversizedRoot, 'entry');
  await mkdir(oversized.phaseRoot, { recursive: true });
  await writeFile(oversized.childPath, 'x'.repeat(4097));
  assert.equal((await readPreactivationSignInChild(localIdentity, 'entry', 'b'.repeat(64),
    { workspaceRoot: oversizedRoot })).reason, 'OVERSIZE');
});

test('reporter ignores caught passing errors and redacts unknown or ambiguous terminal failures', async t => {
  const root = await workspace(t);
  const options = { workspaceRoot: root, identity: localIdentity, phase: 'entry', phaseNonce: 'b'.repeat(64) };
  const caughtReporter = new PreactivationSignInPlaywrightReporter(options);
  const caught = { message: 'Bearer caught-secret', location: { file: path.join(root,
    'tests/browser/authenticatedHostedSignInEntry.spec.ts'), line: 7 } };
  caughtReporter.onTestBegin(); caughtReporter.onStepEnd({}, {}, { error: caught });
  caughtReporter.onTestEnd(testCase(), { status: 'passed', duration: 5, errors: [caught] });
  await caughtReporter.onEnd();
  const paths = preactivationSignInDiagnosticPaths(root, 'entry');
  await assert.rejects(readFile(paths.childPath), /ENOENT/u);
  assert.equal(JSON.parse(await readFile(paths.summaryPath, 'utf8')).terminalCases.passed, 1);

  const failureRoot = await workspace(t);
  const reporter = new PreactivationSignInPlaywrightReporter({ ...options, workspaceRoot: failureRoot });
  const canary = { message: 'Bearer raw-secret https://example.invalid body={} 00000000-0000-0000-0000-000000000000',
    location: { file: path.join(failureRoot, 'tests/browser/authenticatedHostedSignInEntry.spec.ts'), line: 9 } };
  reporter.onTestBegin(); reporter.onStepEnd({}, {}, { error: canary });
  reporter.onTestEnd(testCase('dynamic private title', 'dynamic-project'),
    { status: 'failed', duration: 8, error: canary, errors: [canary, { message: 'second' }] });
  await reporter.onEnd();
  const serialized = await readFile(preactivationSignInDiagnosticPaths(failureRoot, 'entry').childPath, 'utf8');
  const result = JSON.parse(serialized);
  assert.deepEqual(result.failure, { code: 'REDACTED' });
  for (const value of ['raw-secret', 'example.invalid', '00000000-0000-0000-0000-000000000000', 'dynamic private']) {
    assert.equal(serialized.includes(value), false);
  }
});

test('reporter accepts one strict targeted correlation annotation and redacts malformed or duplicate canaries', async t => {
  const snapshot = correlationSnapshot();
  const validRoot = await workspace(t);
  const valid = new PreactivationSignInPlaywrightReporter({ workspaceRoot: validRoot,
    identity: localIdentity, phase: 'entry', phaseNonce: 'c'.repeat(64) });
  const error = { message: 'ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TIMEOUT',
    location: { file: path.join(validRoot, 'tests/browser/authenticatedHostedSignInEntry.spec.ts'), line: 472 } };
  valid.onTestBegin();
  valid.onTestEnd(testCase(knownTitle, 'desktop-chromium', [{
    type: PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_ANNOTATION,
    description: JSON.stringify(snapshot),
  }]), { status: 'failed', duration: 7, error, errors: [error] });
  await valid.onEnd();
  const captured = (await readPreactivationSignInChild(localIdentity, 'entry', 'c'.repeat(64),
    { workspaceRoot: validRoot })).child;
  assert.equal(captured.requestCorrelation.state, 'available');
  assert.deepEqual(captured.requestCorrelation.detail, snapshot);

  for (const [reason, annotations] of [
    ['SCHEMA', [{ type: PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_ANNOTATION,
      description: JSON.stringify({ ...snapshot, raw: 'Bearer annotation-secret https://private.invalid' }) }]],
    ['DUPLICATE', [
      { type: PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_ANNOTATION, description: JSON.stringify(snapshot) },
      { type: PREACTIVATION_SIGN_IN_REQUEST_CORRELATION_ANNOTATION, description: 'annotation-secret' },
    ]],
    ['MISSING', []],
  ]) {
    const root = await workspace(t);
    const reporter = new PreactivationSignInPlaywrightReporter({ workspaceRoot: root,
      identity: localIdentity, phase: 'entry', phaseNonce: 'd'.repeat(64) });
    reporter.onTestBegin();
    reporter.onTestEnd(testCase(knownTitle, 'pixel-7-chromium', annotations),
      { status: 'failed', duration: 9, error, errors: [error] });
    await reporter.onEnd();
    const serialized = await readFile(preactivationSignInDiagnosticPaths(root, 'entry').childPath, 'utf8');
    const child = JSON.parse(serialized);
    assert.equal(child.requestCorrelation.reason, reason);
    assert.equal(serialized.includes('annotation-secret'), false);
    assert.equal(serialized.includes('private.invalid'), false);
  }
});

test('parent embeds captured request correlation and makes missing targeted correlation incomplete', async t => {
  for (const [label, requestCorrelation, expectedStatus] of [
    ['captured', { state: 'available', reason: 'CAPTURED', detail: correlationSnapshot() }, 'failed'],
    ['missing', { state: 'unavailable', reason: 'MISSING', detail: null }, 'incomplete'],
  ]) {
    const root = await workspace(t);
    const identity = resolvePreactivationSignInIdentity({}, label === 'captured' ? 'e'.repeat(64) : 'f'.repeat(64));
    const session = await createPreactivationSignInDiagnosticSession({ workspaceRoot: root,
      identity, sourceBindings: await bindings() });
    const operations = {
      setup: async () => undefined, build: async () => undefined, preview: async () => undefined,
      tls: async () => undefined,
      browser: async ({ phaseNonce }) => {
        await writePreactivationSignInSummary(summary(identity, 'entry', phaseNonce, {
          total: 4, passed: 3, failed: 1, timedOut: 0, skipped: 0, interrupted: 0,
        }), { workspaceRoot: root });
        await writePreactivationSignInChild({ schemaVersion: PREACTIVATION_SIGN_IN_CHILD_SCHEMA,
          identity, phase: 'entry', phaseNonce, project: 'desktop-chromium',
          testCategory: 'authenticated-sign-in', status: 'failed', durationMs: 3,
          failure: { code: 'CONTROL_TIMEOUT' }, requestCorrelation }, { workspaceRoot: root });
        throw new Error(`PRIMARY_${label}`);
      },
      cleanupPreview: async () => 'passed', cleanupFixture: async () => 'passed',
      cleanupTls: async () => 'passed', cleanupTemporary: async () => 'passed',
    };
    await assert.rejects(runPreactivationSignInDiagnosticPhase({ phase: 'entry', session, operations }),
      new RegExp(`PRIMARY_${label}`, 'u'));
    const phase = session.snapshot().phases[1];
    assert.equal(phase.status, expectedStatus);
    assert.deepEqual(phase.browserDiagnostic.detail.requestCorrelation, requestCorrelation);
    if (label === 'captured') {
      const parent = session.snapshot();
      const substitutedProject = structuredClone(parent);
      substitutedProject.phases[1].browserDiagnostic.detail.project = 'unknown';
      assert.equal(validatePreactivationSignInParent(substitutedProject), null);
      const substitutedCategory = structuredClone(parent);
      substitutedCategory.phases[1].browserDiagnostic.detail.testCategory = 'anonymous-admission';
      assert.equal(validatePreactivationSignInParent(substitutedCategory), null);
    }
  }
});

test('child correlation is semantically bound to entry, exact sign-in category and known project', () => {
  const base = { schemaVersion: PREACTIVATION_SIGN_IN_CHILD_SCHEMA, identity: localIdentity,
    phase: 'entry', phaseNonce: '9'.repeat(64), project: 'desktop-chromium',
    testCategory: 'authenticated-sign-in', status: 'failed', durationMs: 1,
    failure: { code: 'CONTROL_TIMEOUT' },
    requestCorrelation: { state: 'available', reason: 'CAPTURED', detail: correlationSnapshot() } };
  assert.equal(validatePreactivationSignInChild(base), base);
  assert.equal(validatePreactivationSignInChild({ ...base, phase: 'safety' }), null);
  assert.equal(validatePreactivationSignInChild({ ...base, project: 'unknown' }), null);
  assert.equal(validatePreactivationSignInChild({ ...base, testCategory: 'anonymous-admission' }), null);
  const unknown = { ...base, project: 'unknown',
    requestCorrelation: { state: 'invalid', reason: 'AMBIGUOUS', detail: null } };
  assert.equal(validatePreactivationSignInChild(unknown), unknown);
});

test('each operational failure preserves the primary and attempts every cleanup', async () => {
  for (const failureStage of ['setup', 'build', 'preview', 'tls', 'browser']) {
    const events = [];
    const session = {
      identity: localIdentity,
      startPhase: async () => 'b'.repeat(64),
      startStage: async (_phase, stage) => events.push(`start:${stage}`),
      finishStage: async (_phase, stage, state) => events.push(`finish:${stage}:${state}`),
      recordFailure: async (_phase, stage) => events.push(`failure:${stage}`),
      observeBrowserChild: async () => events.push('observe'),
      setCleanup: async (_phase, resource, state) => events.push(`cleanup:${resource}:${state}`),
      finishPhase: async () => events.push('phase-finished'),
    };
    const operations = Object.fromEntries(['setup', 'build', 'preview', 'tls', 'browser'].map(stage =>
      [stage, async () => { if (stage === failureStage) throw new Error(`PRIMARY_${stage}`); }]));
    Object.assign(operations, {
      cleanupPreview: async () => 'passed', cleanupFixture: async () => 'passed',
      cleanupTls: async () => 'passed', cleanupTemporary: async () => 'passed',
    });
    await assert.rejects(runPreactivationSignInDiagnosticPhase({ phase: 'entry', session, operations }),
      new RegExp(`PRIMARY_${failureStage}`, 'u'));
    for (const resource of ['preview', 'fixture', 'tls', 'temporary']) {
      assert.ok(events.includes(`cleanup:${resource}:passed`));
    }
  }
});

test('diagnostic write failure after setup cannot skip independent cleanup attempts', async () => {
  const events = [];
  const session = {
    identity: localIdentity,
    startPhase: async () => 'b'.repeat(64),
    startStage: async (_phase, stage) => { if (stage === 'build') throw new Error('WRITE_FAILED'); },
    finishStage: async () => undefined, recordFailure: async () => undefined,
    observeBrowserChild: async () => undefined, setCleanup: async () => undefined,
    finishPhase: async () => undefined,
  };
  const operations = {
    setup: async () => events.push('setup'), build: async () => undefined, preview: async () => undefined,
    tls: async () => undefined, browser: async () => undefined,
    cleanupPreview: async () => { events.push('preview'); return 'passed'; },
    cleanupFixture: async () => { events.push('fixture'); return 'passed'; },
    cleanupTls: async () => { events.push('tls'); return 'passed'; },
    cleanupTemporary: async () => { events.push('temporary'); return 'passed'; },
  };
  await assert.rejects(runPreactivationSignInDiagnosticPhase({ phase: 'entry', session, operations }),
    /WRITE_FAILED/u);
  assert.deepEqual(events, ['setup', 'preview', 'fixture', 'tls', 'temporary']);
});

test('specialized parent-disabled execution still fails returned failed or unknown cleanup', async () => {
  for (const returned of ['failed', 'unknown']) {
    const operations = {
      setup: async () => undefined, build: async () => undefined, preview: async () => undefined,
      tls: async () => undefined, browser: async () => undefined,
      cleanupPreview: async () => returned, cleanupFixture: async () => 'passed',
      cleanupTls: async () => 'passed', cleanupTemporary: async () => 'passed',
    };
    await assert.rejects(runPreactivationSignInDiagnosticPhase({ phase: 'specialized',
      session: null, operations }), /CLEANUP_FAILED/u);
  }
});

test('missing failure child remains validated incomplete and retain-incomplete does not promote it', async t => {
  const root = await workspace(t, { copySources: true });
  const identity = resolvePreactivationSignInIdentity({}, 'd'.repeat(64));
  const session = await createPreactivationSignInDiagnosticSession({ workspaceRoot: root, identity });
  const operations = {
    setup: async () => undefined, build: async () => undefined, preview: async () => undefined,
    tls: async () => undefined, browser: async () => { throw new Error('BROWSER_PRIMARY'); },
    cleanupPreview: async () => 'passed', cleanupFixture: async () => 'passed',
    cleanupTls: async () => 'passed', cleanupTemporary: async () => 'passed',
  };
  await assert.rejects(runPreactivationSignInDiagnosticPhase({ phase: 'entry', session, operations }),
    /BROWSER_PRIMARY/u);
  await session.finalize();
  const parent = (await readPreactivationSignInParent(root)).parent;
  assert.equal(parent.status, 'incomplete');
  assert.equal(parent.phases[1].browserDiagnostic.reason, 'MISSING');
  const verified = await verifyPreactivationSignInDiagnostics({ workspaceRoot: root,
    environment: {}, retainIncomplete: true });
  assert.deepEqual(verified, { status: 'incomplete', terminal: false, retainedIncomplete: true });
});

test('unexpected failure child on a passing browser makes the parent incomplete', async t => {
  const root = await workspace(t);
  const identity = resolvePreactivationSignInIdentity({}, 'e'.repeat(64));
  const session = await createPreactivationSignInDiagnosticSession({ workspaceRoot: root,
    identity, sourceBindings: await bindings() });
  const operations = {
    setup: async () => undefined, build: async () => undefined, preview: async () => undefined,
    tls: async () => undefined,
    browser: async ({ phaseNonce }) => {
      await writePreactivationSignInSummary(summary(identity, 'entry', phaseNonce), { workspaceRoot: root });
      await writePreactivationSignInChild({ schemaVersion: PREACTIVATION_SIGN_IN_CHILD_SCHEMA,
        identity, phase: 'entry', phaseNonce, project: 'desktop-chromium',
        testCategory: 'authenticated-sign-in', status: 'failed', durationMs: 4,
        failure: { code: 'CONTROL_TIMEOUT' },
        requestCorrelation: { state: 'unavailable', reason: 'MISSING', detail: null } }, { workspaceRoot: root });
    },
    cleanupPreview: async () => 'passed', cleanupFixture: async () => 'passed',
    cleanupTls: async () => 'passed', cleanupTemporary: async () => 'passed',
  };
  await assert.rejects(runPreactivationSignInDiagnosticPhase({ phase: 'entry', session, operations }),
    /DIAGNOSTIC_PHASE_INCOMPLETE/u);
  assert.equal(session.snapshot().phases[1].status, 'incomplete');
});

test('missing summary after a passing browser is incomplete and nonzero', async t => {
  const root = await workspace(t);
  const session = await createPreactivationSignInDiagnosticSession({ workspaceRoot: root,
    identity: resolvePreactivationSignInIdentity({}, 'f'.repeat(64)), sourceBindings: await bindings() });
  const operations = {
    setup: async () => undefined, build: async () => undefined, preview: async () => undefined,
    tls: async () => undefined, browser: async () => undefined,
    cleanupPreview: async () => 'passed', cleanupFixture: async () => 'passed',
    cleanupTls: async () => 'passed', cleanupTemporary: async () => 'passed',
  };
  await assert.rejects(runPreactivationSignInDiagnosticPhase({ phase: 'entry', session, operations }),
    /DIAGNOSTIC_PHASE_INCOMPLETE/u);
  assert.equal(session.snapshot().phases[1].status, 'incomplete');
});

test('verifier rejects CI-local substitution and changed bound source', async t => {
  const root = await workspace(t, { copySources: true });
  const session = await createPreactivationSignInDiagnosticSession({ workspaceRoot: root,
    identity: resolvePreactivationSignInIdentity({}, '1'.repeat(64)) });
  await assert.rejects(verifyPreactivationSignInDiagnostics({ workspaceRoot: root,
    environment: { GITHUB_ACTIONS: 'true', RELEASE_SHA: 'b'.repeat(40), GITHUB_RUN_ID: '42',
      GITHUB_RUN_ATTEMPT: '1', GITHUB_WORKFLOW: 'Authenticated Product Acceptance Preparation',
      GITHUB_JOB: 'preactivation-checkout' }, retainIncomplete: true }), /IDENTITY_REJECTED/u);
  await writeFile(path.join(root, PREACTIVATION_SIGN_IN_SOURCE_PATHS[0]), '\n', { flag: 'a' });
  await assert.rejects(verifyPreactivationSignInDiagnostics({ workspaceRoot: root,
    environment: {}, retainIncomplete: true }), /SOURCE_REJECTED/u);
  assert.equal(session.snapshot().status, 'running');
});

test('child rejects extra fields and symlink substitution when supported', async t => {
  const root = await workspace(t);
  const paths = preactivationSignInDiagnosticPaths(root, 'entry');
  await mkdir(paths.phaseRoot, { recursive: true });
  const child = { schemaVersion: PREACTIVATION_SIGN_IN_CHILD_SCHEMA, identity: localIdentity,
    phase: 'entry', phaseNonce: 'b'.repeat(64), project: 'desktop-chromium',
    testCategory: 'authenticated-sign-in', status: 'failed', durationMs: 1,
    failure: { code: 'CONTROL_TIMEOUT' },
    requestCorrelation: { state: 'unavailable', reason: 'MISSING', detail: null }, extra: true };
  await writeFile(paths.childPath, JSON.stringify(child));
  assert.equal((await readPreactivationSignInChild(localIdentity, 'entry', 'b'.repeat(64),
    { workspaceRoot: root })).reason, 'SCHEMA');
  await rm(paths.childPath, { force: true });
  const target = path.join(root, 'target.json');
  await writeFile(target, '{}');
  try {
    await symlink(target, paths.childPath, 'file');
  } catch (error) {
    if (['EPERM', 'EACCES'].includes(error?.code)) return;
    throw error;
  }
  assert.equal((await readPreactivationSignInChild(localIdentity, 'entry', 'b'.repeat(64),
    { workspaceRoot: root })).reason, 'SYMLINK');
});

test('diagnostic parent and private paths stay inside the selected workspace', async t => {
  const root = await workspace(t);
  const paths = preactivationSignInDiagnosticPaths(root, 'entry');
  assert.equal(paths.parentPath.startsWith(root), true);
  assert.equal(paths.childPath.startsWith(paths.privateRoot), true);
  assert.equal((await lstat(root)).isDirectory(), true);
  assert.equal(PREACTIVATION_SIGN_IN_PHASES.length, 5);
});
