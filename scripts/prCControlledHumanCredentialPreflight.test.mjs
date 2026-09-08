import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sha256 } from './prCControlledHumanEnvironment.mjs';
import { PostgresEnvironmentMigrationAdapter, loadMigration } from './prCControlledHumanEnvironmentMigration.mjs';
import { CONTROLLED_HUMAN_PHASE_SECRETS, CONTROLLED_HUMAN_SECRET_SENTINEL, validateControlledHumanWorkflowSecrets } from './prCControlledHumanWorkflowSecrets.mjs';
import { PR_C_BASE_SHA, PR_C_WORKFLOW_PATH } from './transcriptFlowPrCEvidenceScope.mjs';
import {
  PREFLIGHT_COMMAND, PREFLIGHT_FILE, PREFLIGHT_JOB, PREFLIGHT_LABEL, PREFLIGHT_OUTPUT,
  createCredentialPreflightReport, derivePreflightIdentity, inspectPreflightTargetReadOnly,
  observePreflightPreview, validateNonPatPreflightInputs, verifyCredentialPreflightBundle, verifyCredentialPreflightReport,
} from './prCControlledHumanCredentialPreflight.mjs';

const key = 'fixture-only-pr264-credential-preflight-authority';
const measuredScenarios = new Set();
const head = 'a'.repeat(40);
const ref = 'syntheticfixtureonly';
const origin = `https://${ref}.supabase.co`;
const source = { head, dirty: '', command: PREFLIGHT_COMMAND, nodeMajor: 22, governedFileCount: 215, governedWorkingTreeDigest: 'e'.repeat(64) };
const publicTargetDigest = sha256(`pr-c-controlled-human-public-target\0${origin}`);
const env = {
  GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'pull_request', GITHUB_REPOSITORY: 'APReddy-AutoBotz/AvalaOS-Core',
  GITHUB_REF: 'refs/pull/264/merge', GITHUB_HEAD_REF: 'controller/governed-delivery-monitor-pr-c-20260831', GITHUB_BASE_REF: 'main',
  GITHUB_WORKFLOW_REF: `APReddy-AutoBotz/AvalaOS-Core/${PR_C_WORKFLOW_PATH}@refs/pull/264/merge`, GITHUB_JOB: PREFLIGHT_JOB,
  GITHUB_ACTOR: 'APReddy-AutoBotz', GITHUB_TRIGGERING_ACTOR: 'APReddy-AutoBotz', GITHUB_RUN_ID: '700002', GITHUB_RUN_ATTEMPT: '1',
  PR_C_CONTROLLED_HUMAN_RELEASE_SHA: head, PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA: head, PR_C_CONTROLLED_HUMAN_PR_NUMBER: '264',
  PR_C_CONTROLLED_HUMAN_ENVIRONMENT_CLASS: 'hosted_nonproduction_pilot', PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN: 'https://deploy-preview-264--avalaos-pilot.netlify.app',
  PR_C_CONTROLLED_HUMAN_DEPLOY_ID: 'b'.repeat(24), PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST: `sha256:${'c'.repeat(64)}`,
  PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT: `sha256:${'d'.repeat(64)}`, PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST: publicTargetDigest,
  PR_C_CONTROLLED_HUMAN_CI_RUN_ID: '700001', PR_C_CONTROLLED_HUMAN_CI_RUN_ATTEMPT: '2',
  PR_C_CONTROLLED_HUMAN_CI_ARTIFACT_NAME: 'governed-delivery-monitor-pr-c-700001-2', PR_C_CONTROLLED_HUMAN_CI_ARTIFACT_DIGEST: `sha256:${'f'.repeat(64)}`,
  PR_C_CONTROLLED_HUMAN_DATABASE_URL: `postgresql://postgres.fixture:fixture-only-local-test@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`,
  PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY: key, PR_C_CONTROLLED_HUMAN_EXERCISE_ID: '22222222-2222-4222-a222-222222222222',
  PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF: ref, PR_C_CONTROLLED_HUMAN_SUPABASE_URL: origin,
  PR_C_CONTROLLED_HUMAN_SUPABASE_SERVICE_ROLE_KEY: 'fixture-only-not-an-authentication-proof',
  PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_JSON: JSON.stringify({ requester: 'fixture-requester-only-123', reviewer: 'fixture-reviewer-only-456' }),
};
env.PR_C_CONTROLLED_HUMAN_DATABASE_URL = env.PR_C_CONTROLLED_HUMAN_DATABASE_URL.replace('postgres.fixture', `postgres.${ref}`);
const event = { action: 'labeled', label: { name: PREFLIGHT_LABEL }, sender: { login: 'APReddy-AutoBotz' }, pull_request: {
  number: 264, state: 'open', head: { sha: head, ref: env.GITHUB_HEAD_REF, repo: { full_name: env.GITHUB_REPOSITORY } },
  base: { ref: 'main', repo: { full_name: env.GITHUB_REPOSITORY } },
} };
const identity = derivePreflightIdentity(env, event, source);
const fixtureState = { personas: [{ key: 'requester' }, { key: 'reviewer' }] };
const bootstrapPayload = { status: 'bindings_derived', exactHead: head, reviewHeadSha: head,
  exerciseDigest: identity.exerciseDigest, targetFingerprint: identity.targetFingerprint, publicTargetDigest,
  priorMigrationTip: '20260831062024', productionAuthorized: false, customerDataAuthorized: false, realProviderCallsAuthorized: false };
const bootstrap = { ...bootstrapPayload, bootstrapDigest: sha256(bootstrapPayload) };
const makeReport = () => createCredentialPreflightReport({ identity, bootstrap,
  inputChecks: validateNonPatPreflightInputs(env, fixtureState), databaseChecks: { databaseTransactionReadOnly: true, databaseTransactionRolledBack: true },
  previewChecks: { previewIdentityValid: true }, sourceUnchanged: true, pinnedTls: true,
  observedAt: '2026-09-08T01:00:30.000Z', signingKey: key });
const expected = { identity, bootstrapDigest: bootstrap.bootstrapDigest, runStartedAt: '2026-09-08T01:00:00.000Z', runCompletedAt: '2026-09-08T01:01:00.000Z' };

test('credential preflight signs only the fixed exact runtime and independent bootstrap envelope', () => {
  const report = makeReport();
  assert.equal(verifyCredentialPreflightReport(report, expected, key).status, 'verified_credential_transport_only');
  assert.deepEqual(report.zeroMutations, { migrations: 0, databaseWrites: 0, authMutations: 0, functionDeployments: 0, providerCalls: 0 });
  assert.ok(report.notRun.includes('human-testing'));
  assert.ok(report.notRun.includes('service-credential-authentication'));
  for (const name of CONTROLLED_HUMAN_PHASE_SECRETS.preflight) assert.equal(JSON.stringify(report).includes(env[name]), false, name);
});

test('runtime authority rejects unrelated events, actors, jobs, workflows and stale source before credential use', () => {
  for (const [name, value] of [
    ['GITHUB_ACTIONS', 'false'], ['GITHUB_EVENT_NAME', 'workflow_dispatch'], ['GITHUB_REPOSITORY', 'other/repo'],
    ['GITHUB_REF', 'refs/heads/main'], ['GITHUB_HEAD_REF', 'main'], ['GITHUB_BASE_REF', 'other'], ['GITHUB_JOB', 'controlled_human_edge'],
    ['GITHUB_WORKFLOW_REF', `APReddy-AutoBotz/AvalaOS-Core/.github/workflows/pr264-controlled-human-edge-deploy.yml@refs/pull/264/merge`],
    ['GITHUB_ACTOR', 'automation-bot'], ['GITHUB_TRIGGERING_ACTOR', 'another-user'], ['GITHUB_RUN_ATTEMPT', '0'],
    ['PR_C_CONTROLLED_HUMAN_RELEASE_SHA', 'b'.repeat(40)], ['PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA', 'b'.repeat(40)],
    ['PR_C_CONTROLLED_HUMAN_CI_ARTIFACT_NAME', 'governed-delivery-monitor-pr-c-700001-1'], ['PR_C_CONTROLLED_HUMAN_PR_NUMBER', '265'],
    ['PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN', 'https://avalaos.com'], ['PR_C_CONTROLLED_HUMAN_ENVIRONMENT_CLASS', 'production'],
  ]) assert.throws(() => derivePreflightIdentity({ ...env, [name]: value }, event, source), name);
  for (const mutate of [
    value => { value.action = 'synchronize'; }, value => { value.label.name = 'pr264-controlled-human-edge'; },
    value => { value.sender.login = 'another-user'; }, value => { value.pull_request.number = 265; },
    value => { value.pull_request.head.repo.full_name = 'foreign/fork'; }, value => { value.pull_request.state = 'closed'; },
    value => { value.pull_request.head.sha = 'b'.repeat(40); }, value => { value.pull_request.base.repo.full_name = 'other/repo'; },
  ]) { const changed = structuredClone(event); mutate(changed); assert.throws(() => derivePreflightIdentity(env, changed, source)); }
  assert.throws(() => derivePreflightIdentity(env, event, { ...source, dirty: 'modified' }));
  assert.throws(() => derivePreflightIdentity(env, event, { ...source, head: 'b'.repeat(40) }));
  assert.throws(() => derivePreflightIdentity(env, event, { ...source, governedFileCount: 0 }));
  assert.throws(() => derivePreflightIdentity(env, event, { ...source, command: 'node substituted.mjs' }));
  assert.throws(() => derivePreflightIdentity(env, event, { ...source, nodeMajor: 20 }));
  assert.equal(identity.baseSha, PR_C_BASE_SHA);
});

test('every non-PAT field and six downstream phase guards reject absent blank sentinel and wrong-type input without value disclosure', () => {
  for (const phase of ['unknown', 'toString', '__proto__', 'constructor']) assert.throws(() => validateControlledHumanWorkflowSecrets(phase, {}), error => error.message === 'PR264_CONTROLLED_HUMAN_WORKFLOW_SECRET_REJECTED:unknown-phase:invalid-input:invalid-input');
  for (const [phase, names] of Object.entries(CONTROLLED_HUMAN_PHASE_SECRETS)) {
    const good = Object.fromEntries(names.map(name => [name, 'fixture-only-present-value']));
    assert.equal(validateControlledHumanWorkflowSecrets(phase, good, { exact: true }).status, 'present');
    for (const name of names) for (const [value, reason] of [[undefined, 'absent'], [null, 'absent'], ['', 'blank'], [' \t\n ', 'blank'], [CONTROLLED_HUMAN_SECRET_SENTINEL, 'sentinel'], [` ${CONTROLLED_HUMAN_SECRET_SENTINEL} `, 'sentinel'], [7, 'invalid-type']]) {
      assert.throws(() => validateControlledHumanWorkflowSecrets(phase, { ...good, [name]: value }, { exact: true }), error => error.message === `PR264_CONTROLLED_HUMAN_WORKFLOW_SECRET_REJECTED:${phase}:${name}:${reason}`);
    }
    assert.throws(() => validateControlledHumanWorkflowSecrets(phase, { ...good, FORBIDDEN: 'fixture-value' }, { exact: true }));
  }
  for (const name of ['SUPABASE_ACCESS_TOKEN', 'PR_C_CONTROLLED_HUMAN_SUPABASE_ACCESS_TOKEN', 'OPENAI_API_KEY', 'GROQ_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY']) {
    assert.throws(() => validateNonPatPreflightInputs({ ...env, [name]: 'fixture-only-unexpected' }, fixtureState), /forbidden-credential/u);
  }
  for (const value of ['{}', '[]', '{', JSON.stringify({ requester: 'same-fixture-value-123', reviewer: 'same-fixture-value-123' }), JSON.stringify({ requester: 'short', reviewer: 'fixture-reviewer-value' })]) {
    assert.throws(() => validateNonPatPreflightInputs({ ...env, PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_JSON: value }, fixtureState));
  }
  for (const value of [7, null, { nested: 'fixture-only' }, 'x'.repeat(129)]) {
    assert.throws(() => validateNonPatPreflightInputs({ ...env, PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_JSON: JSON.stringify({ requester: value, reviewer: 'fixture-reviewer-value-123' }) }, fixtureState));
  }
  measuredScenarios.add('password-non-string');
  measuredScenarios.add('password-over-128');
  for (const value of [` ${key}`, `${key} `, 'x'.repeat(31), 'x'.repeat(4097)]) {
    assert.throws(() => validateNonPatPreflightInputs({ ...env, PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY: value }, fixtureState));
  }
  measuredScenarios.add('signing-key-leading-trailing-whitespace');
  measuredScenarios.add('signing-key-under-32-over-4096');
  assert.throws(() => validateNonPatPreflightInputs({ ...env, PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST: `sha256:${'a'.repeat(64)}` }, fixtureState));
  assert.throws(() => validateNonPatPreflightInputs({ ...env, PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF: 'b'.repeat(20) }, fixtureState));
  assert.throws(() => validateNonPatPreflightInputs({ ...env, PR_C_CONTROLLED_HUMAN_DATABASE_URL: env.PR_C_CONTROLLED_HUMAN_DATABASE_URL.replace('verify-full', 'require') }, fixtureState));
});

const fakeAdapter = ({ readOnly = 'on', inspectFailure = false, rollbackFailure = false, closeFailure = false, connectFailure = false } = {}) => {
  const calls = [];
  return { calls, connect: async () => { calls.push('connect'); if (connectFailure) throw new Error('fixture-sensitive-connect-message'); }, close: async () => { calls.push('close'); if (closeFailure) throw new Error('fixture-sensitive-close-message'); },
    inspect: async () => { calls.push('inspect'); if (inspectFailure) throw new Error('fixture-sensitive-database-message'); return { actualTargetFingerprint: identity.targetFingerprint }; },
    client: { query: async query => { calls.push(query); if (query === 'ROLLBACK' && rollbackFailure) throw new Error('fixture-sensitive-rollback-message'); return { rows: [{ transaction_read_only: readOnly }] }; } },
  };
};

test('database inspection verifies read-only transaction and rolls back before producing any evidence', async () => {
  const adapter = fakeAdapter();
  const result = await inspectPreflightTargetReadOnly(adapter);
  assert.equal(result.databaseTransactionReadOnly, true);
  assert.equal(result.databaseTransactionRolledBack, true);
  assert.deepEqual(adapter.calls, ['connect', 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY', 'SHOW transaction_read_only', "SET LOCAL statement_timeout = '15000ms'", "SET LOCAL idle_in_transaction_session_timeout = '20000ms'", 'inspect', 'ROLLBACK', 'close']);
  for (const options of [{ readOnly: 'off' }, { inspectFailure: true }, { rollbackFailure: true }, { closeFailure: true }]) {
    const failed = fakeAdapter(options);
    await assert.rejects(inspectPreflightTargetReadOnly(failed));
    assert.equal(failed.calls.at(-1), 'close');
    assert.ok(failed.calls.includes('ROLLBACK'));
    if (options.readOnly === 'off') assert.equal(failed.calls.includes('inspect'), false);
  }
  const connectionFailure = fakeAdapter({ connectFailure: true });
  await assert.rejects(inspectPreflightTargetReadOnly(connectionFailure));
  assert.deepEqual(connectionFailure.calls, ['connect', 'close']);
});

test('production preflight client pins verified-full TLS and bounds queries without changing pooled session defaults', async () => {
  const migration = await loadMigration();
  const adapter = new PostgresEnvironmentMigrationAdapter(env.PR_C_CONTROLLED_HUMAN_DATABASE_URL, migration.sql, { readOnly: true });
  assert.equal(adapter.client.connectionParameters.options, undefined);
  assert.equal(adapter.client.connectionParameters.ssl.rejectUnauthorized, true);
  assert.equal(adapter.client.connectionParameters.ssl.servername, 'aws-1-ap-south-1.pooler.supabase.com');
  assert.equal(adapter.client.connectionParameters.statement_timeout, false);
  assert.equal(adapter.client.connectionParameters.query_timeout, 20000);
  await assert.rejects(adapter.apply({}, migration), /READ_ONLY_MUTATION_REJECTED/u);
  assert.throws(() => new PostgresEnvironmentMigrationAdapter('postgresql://postgres:fixture@127.0.0.1:5432/postgres', migration.sql, { readOnly: true }));
  await adapter.close();
});

test('preview checks only exact non-redirecting public origin and cancels bodies on success and rejection', async () => {
  for (const mode of ['valid', 'status', 'head', 'deploy', 'environment']) {
    let cancelled = false;
    const observe = () => observePreflightPreview(identity, async (url, options) => {
      assert.equal(url, identity.previewOrigin); assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, undefined);
      return { status: mode === 'status' ? 302 : 200, headers: new Headers({
        'x-avalaos-release': mode === 'head' ? 'b'.repeat(40) : head,
        'x-avalaos-netlify-deploy-id': mode === 'deploy' ? 'c'.repeat(24) : identity.deployId,
        'x-avalaos-environment': mode === 'environment' ? 'production' : identity.environmentClass,
      }), body: { cancel: async () => { cancelled = true; } } };
    });
    if (mode === 'valid') assert.equal((await observe()).previewIdentityValid, true); else await assert.rejects(observe());
    assert.equal(cancelled, true);
  }
  await assert.rejects(observePreflightPreview(identity, async () => { throw new Error('fixture-sensitive-network-error'); }));
});

test('signed evidence rejects substituted command context stale attempt fake source target signature and omitted assertions', () => {
  for (const mutate of [
    report => { report.identity.runAttempt = 2; }, report => { report.identity.runId = '700003'; },
    report => { report.identity.command = 'node substituted.mjs'; }, report => { report.identity.nodeMajor = 20; },
    report => { report.identity.jobKey = 'controlled_human_edge'; }, report => { report.identity.workflowPath = '.github/workflows/pr264-controlled-human-edge-deploy.yml'; },
    report => { report.identity.exactHead = 'b'.repeat(40); }, report => { report.identity.governedWorkingTreeDigest = 'f'.repeat(64); },
    report => { report.identity.ciArtifactDigest = `sha256:${'a'.repeat(64)}`; }, report => { report.identity.publicTargetDigest = `sha256:${'b'.repeat(64)}`; },
    report => { report.identity.targetFingerprint = `sha256:${'a'.repeat(64)}`; }, report => { report.identity.exerciseDigest = `sha256:${'a'.repeat(64)}`; },
    report => { report.bootstrapDigest = `sha256:${'a'.repeat(64)}`; }, report => { report.signature = `hmac-sha256:${'0'.repeat(64)}`; },
    report => { report.signature = 'not-signed'; }, report => { delete report.checks.previewIdentityValid; },
    report => { report.checks.databaseTransactionReadOnly = false; }, report => { report.checks.sourceUnchanged = false; },
    report => { report.zeroMutations.authMutations = 1; }, report => { report.notRun = []; },
    report => { report.observedAt = '2026-09-07T01:00:30.000Z'; }, report => { report.rawLog = 'forbidden'; },
  ]) { const changed = structuredClone(makeReport()); mutate(changed); assert.throws(() => verifyCredentialPreflightReport(changed, expected, key)); }
  assert.throws(() => verifyCredentialPreflightReport(makeReport(), expected, 'different-fixture-only-authority-123'));
  assert.throws(() => verifyCredentialPreflightReport(makeReport(), { ...expected, identity: { ...identity, runAttempt: 2 } }, key));
  assert.throws(() => verifyCredentialPreflightReport(makeReport(), { ...expected, runCompletedAt: '2026-09-08T00:59:59.000Z' }, key));
  assert.throws(() => createCredentialPreflightReport({ identity, bootstrap, inputChecks: {}, databaseChecks: {}, previewChecks: {}, sourceUnchanged: true, pinnedTls: true, observedAt: '2026-09-08T01:00:30.000Z', signingKey: key }));
});

test('artifact verifier rejects green-without-report duplicate substituted and malformed output', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pr264-credential-preflight-contract-'));
  try {
    await assert.rejects(verifyCredentialPreflightBundle(directory, expected, key), /artifact-file-set/u);
    await writeFile(path.join(directory, PREFLIGHT_FILE), JSON.stringify(makeReport()));
    assert.equal((await verifyCredentialPreflightBundle(directory, expected, key)).status, 'verified_credential_transport_only');
    await writeFile(path.join(directory, PREFLIGHT_FILE), `${JSON.stringify(makeReport())}${' '.repeat(16385)}`);
    await assert.rejects(verifyCredentialPreflightBundle(directory, expected, key), /artifact-size/u);
    measuredScenarios.add('artifact-over-16-kib');
    await writeFile(path.join(directory, PREFLIGHT_FILE), JSON.stringify(makeReport()));
    await writeFile(path.join(directory, 'duplicate.json'), JSON.stringify(makeReport()));
    await assert.rejects(verifyCredentialPreflightBundle(directory, expected, key), /artifact-file-set/u);
    await rm(path.join(directory, 'duplicate.json'));
    await writeFile(path.join(directory, PREFLIGHT_FILE), '{');
    await assert.rejects(verifyCredentialPreflightBundle(directory, expected, key));
    await rm(path.join(directory, PREFLIGHT_FILE));
    await mkdir(path.join(directory, PREFLIGHT_FILE));
    await assert.rejects(verifyCredentialPreflightBundle(directory, expected, key), /artifact-file-set/u);
  } finally {
    const absolute = await realpath(directory);
    assert.equal(absolute, path.resolve(directory));
    assert.equal(path.dirname(absolute), await realpath(os.tmpdir()));
    assert.match(path.basename(absolute), /^pr264-credential-preflight-contract-[A-Za-z0-9]+$/u);
    await rm(absolute, { recursive: true, force: true });
  }
});

test('CLI accepts no caller-provided proof or adapter and exposes only one fixed diagnostic', async () => {
  const command = path.resolve('scripts/prCControlledHumanCredentialPreflight.mjs');
  const run = spawnSync(process.execPath, [command, '--inventory', 'fixture-sensitive-argument'], { encoding: 'utf8', env: { ...process.env, PR_C_CONTROLLED_HUMAN_PREFLIGHT_OUTPUT: PREFLIGHT_OUTPUT } });
  assert.equal(run.status, 1); assert.equal(run.stdout, ''); assert.equal(run.stderr, 'PR264_CREDENTIAL_PREFLIGHT_FAILED\n');
  const script = await readFile(command, 'utf8');
  assert.match(script, /new PostgresEnvironmentMigrationAdapter\([^;]+\{ readOnly: true \}\)/u);
  assert.doesNotMatch(script, /SET SESSION|SET default_transaction_read_only/u);
  assert.doesNotMatch(script, /\.auth\.|functions deploy|adapter[.]apply\(|migrationApply\(|process[.]stderr[.]write\([^)]*(?:error|stack|message)/u);
});

test('credential-preflight unit scenarios publish an exact measured-run contract', async () => {
  const directory = process.env.PR_C_CONTROL_SCRIPT_SCENARIO_REPORT_DIRECTORY;
  if (!directory) return;
  const names = [...measuredScenarios].sort();
  assert.deepEqual(names, [
    'artifact-over-16-kib',
    'password-non-string',
    'password-over-128',
    'signing-key-leading-trailing-whitespace',
    'signing-key-under-32-over-4096',
  ]);
  await writeFile(path.join(directory, 'credential-preflight-unit-scenarios.json'), `${JSON.stringify({
    contractVersion: 'pr-c-control-script-scenarios-1',
    producer: 'scripts/prCControlledHumanCredentialPreflight.test.mjs',
    scenarios: names.map(name => ({ name, status: 'passed' })),
  })}\n`, { flag: 'wx' });
});
