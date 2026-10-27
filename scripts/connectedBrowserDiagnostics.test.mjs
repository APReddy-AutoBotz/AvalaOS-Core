import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  CONNECTED_BROWSER_CHILD_BYTE_CAP,
  CONNECTED_BROWSER_CHILD_SCHEMA,
  CONNECTED_BROWSER_SOURCE_PATHS,
  atomicWriteConnectedBrowserJson,
  connectedBrowserDiagnosticPaths,
  connectedBrowserSourceBindings,
  createConnectedBrowserDiagnosticSession,
  readConnectedBrowserChildDiagnostic,
  resolveConnectedBrowserDiagnosticIdentity,
  validateConnectedBrowserChildDiagnostic,
  validateConnectedBrowserDiagnostic,
  validateConnectedBrowserIdentity,
  writeConnectedBrowserChildDiagnostic,
} from './connectedBrowserDiagnostics.mjs';
import ConnectedBrowserPlaywrightReporter, {
  connectedBrowserFailureCode,
} from './connectedBrowserPlaywrightReporter.mjs';
import { runConnectedBrowserDiagnosticOrchestration } from './runEnterpriseLifecycleAcceptanceBrowser.mjs';
import { verifyConnectedBrowserDiagnostics } from './verifyConnectedBrowserDiagnostics.mjs';

// Local artifact fixtures must not inherit the CI runner's identity context.
const localEnvironment = Object.freeze({});
const nonce = 'a'.repeat(64);
const localIdentity = Object.freeze({ headSha: 'local-working-tree', runId: 'local-123', runAttempt: '1',
  workflow: 'local', logicalJob: 'local',
  command: 'node scripts/runEnterpriseLifecycleAcceptanceBrowser.mjs --authenticated', environment: 'local', nonce });
const knownTitle = 'authors, replays, rejects stale work, requests changes and resubmits through the production UI';
const testCase = (title = knownTitle, project = 'chromium-desktop') => ({ title,
  parent: { project: () => ({ name: project }) } });

const workspace = async t => {
  const parent = path.resolve('output/local-private/connected-browser-diagnostics-unit');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'attempt-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [index, source] of CONNECTED_BROWSER_SOURCE_PATHS.entries()) {
    const target = path.join(root, source);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, index % 2 ? 'alpha\r\nbeta\r\n' : 'alpha\nbeta\n', 'utf8');
  }
  return root;
};

const completeFailure = async (session, phase = 'fixture', cleanup = { preview: 'not-attempted', fixture: 'not-attempted' }) => {
  await session.start(phase);
  await session.fail(phase, phase === 'fixture' ? 'FIXTURE_FAILED' : undefined);
  await session.start('cleanup');
  await session.setCleanup(cleanup);
  if (Object.values(cleanup).some(value => ['unknown', 'failed'].includes(value))) {
    await session.fail('cleanup', 'CLEANUP_FAILED');
  } else await session.pass('cleanup');
  return session.finalize('failed');
};

test('identity and schemas reject coercion, extra keys and malformed nested values', () => {
  assert.equal(validateConnectedBrowserIdentity(localIdentity), true);
  for (const invalid of [
    { ...localIdentity, environment: 'preview' },
    { ...localIdentity, runAttempt: 1 },
    { ...localIdentity, runId: 123 },
    { ...localIdentity, extra: 'canary' },
  ]) assert.equal(validateConnectedBrowserIdentity(invalid), false);
  assert.equal(validateConnectedBrowserDiagnostic(null), null);
  assert.equal(validateConnectedBrowserDiagnostic({}), null);
  assert.equal(validateConnectedBrowserChildDiagnostic(null), null);
  assert.equal(validateConnectedBrowserChildDiagnostic({ schemaVersion: CONNECTED_BROWSER_CHILD_SCHEMA }), null);
  assert.equal(connectedBrowserFailureCode({ message: 'ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TIMEOUT' }, 'failed'),
    'CONTROL_TIMEOUT');
  assert.equal(connectedBrowserFailureCode(
    { message: 'ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TIMEOUT:private-canary' }, 'failed'), 'REDACTED');
});

test('source bindings normalize line endings and stay exact and ordered', async t => {
  const root = await workspace(t);
  const bindings = await connectedBrowserSourceBindings(root);
  assert.deepEqual(bindings.map(binding => binding.path), CONNECTED_BROWSER_SOURCE_PATHS);
  assert.equal(new Set(bindings.map(binding => binding.sha256)).size, 1);
});

test('child boundary rejects missing, malformed, oversized, stale, extra-key and path escape inputs', async t => {
  const root = await workspace(t), paths = connectedBrowserDiagnosticPaths(root);
  await mkdir(paths.privateRoot, { recursive: true });
  assert.deepEqual(await readConnectedBrowserChildDiagnostic(localIdentity, { workspaceRoot: root }),
    { state: 'unavailable', reason: 'MISSING' });
  await writeFile(paths.childPath, '{', 'utf8');
  assert.equal((await readConnectedBrowserChildDiagnostic(localIdentity, { workspaceRoot: root })).reason, 'MALFORMED');
  await writeFile(paths.childPath, 'x'.repeat(CONNECTED_BROWSER_CHILD_BYTE_CAP + 1), 'utf8');
  assert.equal((await readConnectedBrowserChildDiagnostic(localIdentity, { workspaceRoot: root })).reason, 'OVERSIZE');
  const valid = { schemaVersion: CONNECTED_BROWSER_CHILD_SCHEMA, identity: localIdentity,
    project: 'chromium-desktop', testCategory: 'primary-lifecycle', status: 'failed',
    failure: { code: 'CONTROL_TIMEOUT' } };
  await writeFile(paths.childPath, JSON.stringify({ ...valid, raw: 'private-canary' }), 'utf8');
  assert.equal((await readConnectedBrowserChildDiagnostic(localIdentity, { workspaceRoot: root })).reason, 'SCHEMA');
  await writeFile(paths.childPath, JSON.stringify({ ...valid,
    identity: { ...localIdentity, nonce: 'b'.repeat(64) } }), 'utf8');
  assert.equal((await readConnectedBrowserChildDiagnostic(localIdentity, { workspaceRoot: root })).reason, 'NONCE');
  await assert.rejects(atomicWriteConnectedBrowserJson(path.join(root, 'escape.json'), valid, paths.privateRoot),
    /PATH_REJECTED/u);
  await rm(paths.childPath);
  const target = path.join(root, 'outside-directory');
  await mkdir(target);
  await symlink(target, paths.childPath, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    assert.equal((await readConnectedBrowserChildDiagnostic(localIdentity, { workspaceRoot: root })).reason, 'SYMLINK');
  } finally { await unlink(paths.childPath); }
  await symlink(target, paths.finalPath, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    await assert.rejects(verifyConnectedBrowserDiagnostics({ workspaceRoot: root, environment: localEnvironment }), /FILE_REJECTED/u);
  } finally { await unlink(paths.finalPath); }
});

test('session rejects stale final or private output and records early failure without borrowing a manifest', async t => {
  const root = await workspace(t), paths = connectedBrowserDiagnosticPaths(root);
  await mkdir(path.dirname(paths.finalPath), { recursive: true });
  await writeFile(paths.finalPath, '{}', 'utf8');
  await assert.rejects(createConnectedBrowserDiagnosticSession({ workspaceRoot: root, identity: localIdentity }),
    /STALE_OUTPUT/u);
  await rm(paths.finalPath);
  await mkdir(paths.privateRoot, { recursive: true });
  await writeFile(paths.childPath, '{}', 'utf8');
  await assert.rejects(createConnectedBrowserDiagnosticSession({ workspaceRoot: root, identity: localIdentity }),
    /STALE_OUTPUT/u);
  await rm(paths.childPath);
  const session = await createConnectedBrowserDiagnosticSession({ workspaceRoot: root, identity: localIdentity });
  const final = await completeFailure(session);
  assert.equal(final.status, 'failed');
  assert.deepEqual(final.failure, { phase: 'fixture', code: 'FIXTURE_FAILED' });
  assert.deepEqual(final.cleanup, { preview: 'not-attempted', fixture: 'not-attempted' });
  assert.equal((await verifyConnectedBrowserDiagnostics({ workspaceRoot: root, environment: localEnvironment })).status, 'failed');
});

test('a successful browser exit cannot hide an unexpected child diagnostic', async t => {
  for (const serialized of ['{}', '{', 'x'.repeat(2049)]) {
    const root = await workspace(t), paths = connectedBrowserDiagnosticPaths(root);
    const session = await createConnectedBrowserDiagnosticSession({ workspaceRoot: root, identity: localIdentity });
    const operations = Object.fromEntries(['fixture', 'build', 'preview', 'browser', 'inventory', 'aggregation', 'manifest']
      .map(phase => [phase, async () => {}]));
    operations.browser = async () => { await writeFile(paths.childPath, serialized); };
    operations.cleanupPreview = async () => 'passed';
    operations.cleanupFixture = async () => 'passed';
    await assert.rejects(runConnectedBrowserDiagnosticOrchestration({ session, operations }), /UNEXPECTED_CHILD/u);
    await assert.rejects(verifyConnectedBrowserDiagnostics({ workspaceRoot: root, environment: localEnvironment }), /SCHEMA_REJECTED/u);
    const retained = JSON.parse(await readFile(paths.finalPath, 'utf8'));
    assert.equal(retained.status, 'incomplete');
    assert.deepEqual(retained.cleanup, { preview: 'passed', fixture: 'passed' });
  }
});

test('unknown cleanup makes the terminal incomplete and verifier rejects it', async t => {
  const root = await workspace(t);
  const session = await createConnectedBrowserDiagnosticSession({ workspaceRoot: root, identity: localIdentity });
  const final = await completeFailure(session, 'fixture', { preview: 'not-attempted', fixture: 'unknown' });
  assert.equal(final.status, 'incomplete');
  assert.equal(final.failure.phase, 'fixture');
  await assert.rejects(verifyConnectedBrowserDiagnostics({ workspaceRoot: root, environment: localEnvironment }), /INCOMPLETE/u);
  assert.equal((await verifyConnectedBrowserDiagnostics({ workspaceRoot: root, environment: localEnvironment, retainIncomplete: true })).status, 'incomplete');
});

test('retention validates interrupted checkpoints without accepting unsafe contents or substituted sources', async t => {
  const root = await workspace(t), paths = connectedBrowserDiagnosticPaths(root);
  const session = await createConnectedBrowserDiagnosticSession({ workspaceRoot: root, identity: localIdentity });
  await session.start('fixture');
  await assert.rejects(verifyConnectedBrowserDiagnostics({ workspaceRoot: root, environment: localEnvironment }), /SCHEMA_REJECTED/u);
  const interrupted = await verifyConnectedBrowserDiagnostics({ workspaceRoot: root, environment: localEnvironment, retainIncomplete: true });
  assert.equal(interrupted.status, 'incomplete');
  assert.equal(interrupted.phase, 'fixture');
  assert.equal(interrupted.cleanup.fixture, 'unknown');
  await writeFile(paths.finalPath, JSON.stringify({ ...interrupted, rawMessage: 'private-canary' }));
  await assert.rejects(verifyConnectedBrowserDiagnostics({ workspaceRoot: root, environment: localEnvironment, retainIncomplete: true }), /SCHEMA_REJECTED/u);
  await writeFile(paths.finalPath, JSON.stringify(interrupted));
  await writeFile(path.join(root, CONNECTED_BROWSER_SOURCE_PATHS[0]), 'changed');
  await assert.rejects(verifyConnectedBrowserDiagnostics({ workspaceRoot: root, environment: localEnvironment, retainIncomplete: true }), /SOURCE_REJECTED/u);
});

test('early missing database produces a failed diagnostic with both cleanups positively not attempted', async t => {
  const root = await workspace(t);
  const session = await createConnectedBrowserDiagnosticSession({ workspaceRoot: root, identity: localIdentity });
  const error = new Error('private database detail'); error.diagnosticCode = 'DATABASE_URL_REQUIRED';
  const unreachable = async () => { throw new Error('UNREACHABLE'); };
  const operations = { fixture: async () => { throw error; }, build: unreachable, preview: unreachable,
    browser: unreachable, inventory: unreachable, aggregation: unreachable, manifest: unreachable,
    cleanupPreview: async () => 'not-attempted', cleanupFixture: async () => 'not-attempted' };
  await assert.rejects(runConnectedBrowserDiagnosticOrchestration({ session, operations }), candidate => candidate === error);
  const final = JSON.parse(await readFile(connectedBrowserDiagnosticPaths(root).finalPath, 'utf8'));
  assert.equal(final.status, 'failed');
  assert.deepEqual(final.failure, { phase: 'fixture', code: 'DATABASE_URL_REQUIRED' });
  assert.deepEqual(final.cleanup, { preview: 'not-attempted', fixture: 'not-attempted' });
  assert.equal(JSON.stringify(final).includes('private database detail'), false);
  assert.equal((await verifyConnectedBrowserDiagnostics({ workspaceRoot: root, environment: localEnvironment })).status, 'failed');
});

test('verifier derives CI context before trusting artifact classification', async t => {
  const root = await workspace(t);
  const session = await createConnectedBrowserDiagnosticSession({ workspaceRoot: root, identity: localIdentity });
  await completeFailure(session);
  await assert.rejects(verifyConnectedBrowserDiagnostics({ workspaceRoot: root, environment: {
    GITHUB_ACTIONS: 'true', GITHUB_WORKFLOW: 'Authenticated Product Acceptance Preparation',
    GITHUB_JOB: 'connected-browser', GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '1',
    PILOT_ACCEPTANCE_HEAD: 'c'.repeat(40),
  } }), /IDENTITY_REJECTED/u);
});

test('verifier accepts exact CI identity and rejects substituted execution context', async t => {
  const root = await workspace(t);
  const environment = Object.freeze({
    GITHUB_ACTIONS: 'true', GITHUB_WORKFLOW: 'Authenticated Product Acceptance Preparation',
    GITHUB_JOB: 'connected-browser', GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '1',
    PILOT_ACCEPTANCE_HEAD: 'c'.repeat(40),
  });
  const identity = resolveConnectedBrowserDiagnosticIdentity(environment, nonce);
  const session = await createConnectedBrowserDiagnosticSession({ workspaceRoot: root, identity });
  await completeFailure(session);
  assert.equal((await verifyConnectedBrowserDiagnostics({ workspaceRoot: root, environment })).status, 'failed');
  for (const changed of [
    { PILOT_ACCEPTANCE_HEAD: 'd'.repeat(40) }, { GITHUB_RUN_ID: '43' }, { GITHUB_RUN_ATTEMPT: '2' },
    { GITHUB_WORKFLOW: 'Other workflow' }, { GITHUB_JOB: 'other-job' },
  ]) {
    await assert.rejects(verifyConnectedBrowserDiagnostics({
      workspaceRoot: root, environment: { ...environment, ...changed },
    }), /IDENTITY_REJECTED/u);
  }
});

test('local fixture contracts stay isolated under ambient CI while CI rejection remains strict', { timeout: 15000 }, () => {
  const environment = { ...process.env, GITHUB_ACTIONS: 'true' };
  // The selected child tests exclude this subprocess regression itself.
  delete environment.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, [
    '--test', '--test-timeout=15000', '--test-reporter=tap',
    '--test-name-pattern=^(session rejects stale|unknown cleanup makes|retention validates interrupted|early missing database|verifier derives CI context)',
    fileURLToPath(import.meta.url),
  ], { env: environment, encoding: 'utf8', timeout: 15000, maxBuffer: 256 * 1024, windowsHide: true });
  assert.equal(child.error, undefined, 'AMBIENT_CI_FIXTURE_CHILD_FAILED');
  assert.equal(child.status, 0, 'AMBIENT_CI_FIXTURE_REGRESSION_FAILED');
  assert.match(child.stdout, /^# pass 5$/mu);
  assert.match(child.stdout, /^# fail 0$/mu);
});

test('reporter writes only a correlated terminal failure and ignores caught, unknown-title and unknown-project errors', async t => {
  const root = await workspace(t), paths = connectedBrowserDiagnosticPaths(root);
  const caughtReporter = new ConnectedBrowserPlaywrightReporter({ workspaceRoot: root, identity: localIdentity });
  const caught = { message: 'private-caught-canary',
    location: { file: path.join(root, 'tests/browser/authenticatedLifecycleHarness.ts'), line: 9 } };
  caughtReporter.onTestBegin(); caughtReporter.onStepEnd({}, {}, { error: caught });
  caughtReporter.onTestEnd(testCase(), { status: 'passed', errors: [caught] });
  await caughtReporter.onEnd();
  assert.equal((await readConnectedBrowserChildDiagnostic(localIdentity, { workspaceRoot: root })).reason, 'MISSING');
  for (const candidate of [testCase('dynamic private title'), testCase(knownTitle, 'dynamic-project')]) {
    const reporter = new ConnectedBrowserPlaywrightReporter({ workspaceRoot: root, identity: localIdentity });
    reporter.onTestBegin(); reporter.onTestEnd(candidate, { status: 'failed', error: caught }); await reporter.onEnd();
    assert.equal((await readConnectedBrowserChildDiagnostic(localIdentity, { workspaceRoot: root })).reason, 'MISSING');
  }
  const error = { message: 'ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TIMEOUT',
    location: { file: path.join(root,
      'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts'), line: 77 } };
  const reporter = new ConnectedBrowserPlaywrightReporter({ workspaceRoot: root, identity: localIdentity });
  reporter.onTestBegin(); reporter.onStepEnd({}, {}, { error });
  reporter.onTestEnd(testCase(), { status: 'failed', error: { message: error.message } });
  await reporter.onEnd();
  const child = JSON.parse(await readFile(paths.childPath, 'utf8'));
  assert.deepEqual(child.failure, { code: 'CONTROL_TIMEOUT', location: {
    source: 'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts', line: 77 } });
  assert.equal(JSON.stringify(child).includes('private-caught-canary'), false);
  assert.ok(Buffer.byteLength(await readFile(paths.childPath)) <= CONNECTED_BROWSER_CHILD_BYTE_CAP);
});

test('reporter omits location when cloned terminal failure ambiguously matches multiple steps', async t => {
  const root = await workspace(t), paths = connectedBrowserDiagnosticPaths(root);
  const message = 'ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TIMEOUT';
  const reporter = new ConnectedBrowserPlaywrightReporter({ workspaceRoot: root, identity: localIdentity });
  reporter.onTestBegin();
  reporter.onStepEnd({}, {}, { error: { message, location: { file: path.join(root,
    'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts'), line: 31 } } });
  reporter.onStepEnd({}, {}, { error: { message, location: { file: path.join(root,
    'tests/browser/authenticatedLifecycleHarness.ts'), line: 42 } } });
  reporter.onTestEnd(testCase(), { status: 'failed', error: { message } });
  await reporter.onEnd();
  const child = JSON.parse(await readFile(paths.childPath, 'utf8'));
  assert.deepEqual(child.failure, { code: 'CONTROL_TIMEOUT' });
});

test('identity resolver binds exact CI or sanitized alternate CI without retaining names', () => {
  const exact = resolveConnectedBrowserDiagnosticIdentity({ GITHUB_ACTIONS: 'true',
    GITHUB_WORKFLOW: 'Authenticated Product Acceptance Preparation', GITHUB_JOB: 'connected-browser',
    GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '2', PILOT_ACCEPTANCE_HEAD: 'd'.repeat(40) }, nonce);
  assert.equal(exact.workflow, 'authenticated-product-acceptance');
  const alternate = resolveConnectedBrowserDiagnosticIdentity({ GITHUB_ACTIONS: 'true',
    GITHUB_WORKFLOW: 'private-dynamic-name', GITHUB_JOB: 'private-dynamic-job',
    GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '2', PILOT_ACCEPTANCE_HEAD: 'd'.repeat(40) }, nonce);
  assert.equal(alternate.workflow, 'other-ci'); assert.equal(alternate.logicalJob, 'other-ci');
  assert.equal(JSON.stringify(alternate).includes('private-dynamic'), false);
});
