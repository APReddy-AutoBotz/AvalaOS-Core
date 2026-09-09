import assert from 'node:assert/strict';
import { appendFile, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { bootstrapCheckoutIdentity } from './derivePrCControlledHumanBootstrap.mjs';
import { PREFLIGHT_COMMAND, PREFLIGHT_FAILURE_PHASES, PREFLIGHT_OUTPUT, derivePreflightIdentity, validateNonPatPreflightInputs } from './prCControlledHumanCredentialPreflight.mjs';
import { loadFixture } from './prCControlledHumanEnvironment.mjs';
import { calculatePrCWorkingTreeDigest, collectChangedPrCFiles, PR_C_BASE_SHA } from './transcriptFlowPrCEvidenceScope.mjs';
import {
  buildCredentialPreflightEntryEnvironment,
  createCredentialPreflightEntryFixture,
  PR_C_INTENDED_REMOVED_WORKFLOWS,
  readCredentialPreflightEntryArtifact,
  removeCredentialPreflightEntryFixture,
  runCredentialPreflightEntry,
} from './prCControlledHumanCredentialPreflightEntryFixture.mjs';

const scenarios = [];
const exists = target => readFile(target).then(() => true, error => {
  if (error.code === 'ENOENT') return false;
  throw error;
});
const passed = name => scenarios.push({ name, status: 'passed' });
const assertSanitizedFailure = (result, phase, context = phase) => {
  assert.equal(result.status, 1, context);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, `PR264_CREDENTIAL_PREFLIGHT_FAILED:${phase}\n`);
};
const assertNoArtifact = async fixture => {
  await assert.rejects(readdir(path.join(fixture.repositoryRoot, PREFLIGHT_OUTPUT)), error => error.code === 'ENOENT');
};

test('entry fixture preserves an already clean committed source without requiring an empty commit', async () => {
  const fixture = await createCredentialPreflightEntryFixture(process.cwd(), { committedSourceOnly: true });
  try {
    const headFiles = new Set(fixture.sourceHeadFiles);
    assert.equal(fixture.head, fixture.sourceHead);
    assert.deepEqual(fixture.changed, []);
    for (const relative of PR_C_INTENDED_REMOVED_WORKFLOWS) {
      assert.equal(await exists(path.join(fixture.repositoryRoot, relative)), headFiles.has(relative), relative);
    }
  } finally {
    await removeCredentialPreflightEntryFixture(fixture);
  }
});

test('entry fixture overlays all exact intended workflow deletions and commits an equivalent clean candidate', async () => {
  const fixture = await createCredentialPreflightEntryFixture();
  try {
    const headFiles = new Set(fixture.sourceHeadFiles);
    for (const relative of PR_C_INTENDED_REMOVED_WORKFLOWS) {
      assert.equal(await exists(path.join(process.cwd(), relative)), false, `candidate:${relative}`);
      assert.equal(await exists(path.join(fixture.repositoryRoot, relative)), false, `fixture:${relative}`);
      assert.equal(fixture.changed.includes(relative), headFiles.has(relative), `overlay:${relative}`);
    }
    assert.equal(fixture.changed.length > 0 ? fixture.head !== fixture.sourceHead : fixture.head === fixture.sourceHead, true);
  } finally {
    await removeCredentialPreflightEntryFixture(fixture);
  }
});

test('production credential-preflight entrypoint binds actual clean source identity and writes one exclusive artifact', async () => {
  const fixture = await createCredentialPreflightEntryFixture();
  try {
    const env = await buildCredentialPreflightEntryEnvironment(fixture);
    const checkout = bootstrapCheckoutIdentity(fixture.repositoryRoot);
    const governedFiles = collectChangedPrCFiles(fixture.repositoryRoot);
    const source = { ...checkout, command: PREFLIGHT_COMMAND, nodeMajor: 22, governedFileCount: governedFiles.length,
      governedWorkingTreeDigest: calculatePrCWorkingTreeDigest(fixture.repositoryRoot, governedFiles) };
    const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
    derivePreflightIdentity(env, event, source);
    validateNonPatPreflightInputs(env, await loadFixture(path.join(fixture.repositoryRoot, 'testing/process-lifecycle/fixtures/delivery-monitor-pr-c/controlled-human-environment.json')));
    const result = runCredentialPreflightEntry(fixture, env);
    const diagnosticTrace = await readFile(env.PR_C_PREFLIGHT_FIXTURE_TRACE_PATH, 'utf8').catch(() => 'no-transport-trace');
    assert.equal(result.status, 0, `${result.stderr}${diagnosticTrace}`);
    assert.deepEqual(JSON.parse(result.stdout), { status: 'credential_transport_passed', runId: '700002', runAttempt: 1 });
    assert.equal(result.stderr, '');
    const artifact = await readCredentialPreflightEntryArtifact(fixture);
    assert.deepEqual(await readdir(artifact.outputRoot), ['credential-preflight.json']);
    assert.equal(artifact.report.identity.exactHead, fixture.head);
    assert.equal(artifact.report.identity.baseSha, PR_C_BASE_SHA);
    assert.equal(artifact.report.identity.command, PREFLIGHT_COMMAND);
    assert.equal(artifact.report.identity.nodeMajor, 22);
    assert.equal(artifact.report.identity.governedWorkingTreeDigest,
      calculatePrCWorkingTreeDigest(fixture.repositoryRoot, collectChangedPrCFiles(fixture.repositoryRoot)));
    assert.equal(artifact.report.checks.sourceUnchanged, true);
    assert.equal(artifact.report.checks.databaseTransactionReadOnly, true);
    assert.equal(artifact.report.checks.databaseTransactionRolledBack, true);
    const trace = await readFile(env.PR_C_PREFLIGHT_FIXTURE_TRACE_PATH, 'utf8');
    for (const marker of ['begin-read-only', 'show-read-only', 'inspect-target', 'inspect-marker', 'inspect-domain-counts', 'inspect-provider-count', 'rollback', 'close', 'preview-fetch', 'preview-body-cancelled']) {
      assert.match(trace, new RegExp(`(?:^|\\n)${marker}(?:\\n|$)`, 'u'));
    }
    passed('production-entry-source-identity-happy-path');

    const collision = runCredentialPreflightEntry(fixture, env);
    assertSanitizedFailure(collision, PREFLIGHT_FAILURE_PHASES.artifactWrite);
    assert.deepEqual(await readdir(artifact.outputRoot), ['credential-preflight.json']);
    assert.deepEqual(await readFile(path.join(artifact.outputRoot, 'credential-preflight.json')), artifact.bytes);
    passed('production-entry-existing-output-collision');
  } finally {
    await removeCredentialPreflightEntryFixture(fixture);
  }
});

test('production credential-preflight entrypoint rejects wrong output path before transport', async () => {
  const fixture = await createCredentialPreflightEntryFixture();
  try {
    const env = await buildCredentialPreflightEntryEnvironment(fixture, { PR_C_CONTROLLED_HUMAN_PREFLIGHT_OUTPUT: `${PREFLIGHT_OUTPUT}-substituted` });
    assertSanitizedFailure(runCredentialPreflightEntry(fixture, env), PREFLIGHT_FAILURE_PHASES.outputPath);
    assert.equal(await readFile(env.PR_C_PREFLIGHT_FIXTURE_TRACE_PATH, 'utf8'), 'transport-installed\n');
    await assertNoArtifact(fixture);
    passed('production-entry-wrong-output-path');
  } finally {
    await removeCredentialPreflightEntryFixture(fixture);
  }
});

test('production credential-preflight entrypoint rejects dirty source before transport', async () => {
  const fixture = await createCredentialPreflightEntryFixture();
  try {
    const env = await buildCredentialPreflightEntryEnvironment(fixture);
    const source = path.join(fixture.repositoryRoot, 'scripts/prCControlledHumanCredentialPreflight.mjs');
    await appendFile(source, '\n');
    assertSanitizedFailure(runCredentialPreflightEntry(fixture, env), PREFLIGHT_FAILURE_PHASES.sourceIdentity);
    assert.equal(await readFile(env.PR_C_PREFLIGHT_FIXTURE_TRACE_PATH, 'utf8'), 'transport-installed\n');
    await assertNoArtifact(fixture);
    passed('production-entry-dirty-source');
  } finally {
    await removeCredentialPreflightEntryFixture(fixture);
  }
});

test('production credential-preflight entrypoint rejects a clean nonancestor checkout before transport', async () => {
  const fixture = await createCredentialPreflightEntryFixture(process.cwd(), { nonAncestor: true });
  try {
    const env = await buildCredentialPreflightEntryEnvironment(fixture);
    assertSanitizedFailure(runCredentialPreflightEntry(fixture, env), PREFLIGHT_FAILURE_PHASES.sourceIdentity);
    assert.equal(await readFile(env.PR_C_PREFLIGHT_FIXTURE_TRACE_PATH, 'utf8'), 'transport-installed\n');
    await assertNoArtifact(fixture);
    passed('production-entry-nonancestor-base');
  } finally {
    await removeCredentialPreflightEntryFixture(fixture);
  }
});

test('production credential-preflight entrypoint emits only fixed early authority and input phases', async () => {
  for (const scenario of [
    { name: 'production-entry-event-authority-failure', phase: PREFLIGHT_FAILURE_PHASES.eventAuthority, override: { GITHUB_ACTOR: 'hostile-fixture-actor' } },
    { name: 'production-entry-nonpat-input-failure', phase: PREFLIGHT_FAILURE_PHASES.nonPatInputs, override: { PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY: ' fixture-only-pr264-credential-preflight-authority' } },
  ]) {
    const fixture = await createCredentialPreflightEntryFixture();
    try {
      const env = await buildCredentialPreflightEntryEnvironment(fixture, scenario.override);
      assertSanitizedFailure(runCredentialPreflightEntry(fixture, env), scenario.phase, scenario.name);
      assert.equal(await readFile(env.PR_C_PREFLIGHT_FIXTURE_TRACE_PATH, 'utf8'), 'transport-installed\n');
      await assertNoArtifact(fixture);
      passed(scenario.name);
    } finally {
      await removeCredentialPreflightEntryFixture(fixture);
    }
  }
});

test('production credential-preflight entrypoint preserves the failing database or preview phase and completes bounded cleanup', async () => {
  const cases = [
    { name: 'production-entry-database-configuration-failure', mode: 'database-configuration-failure', phase: PREFLIGHT_FAILURE_PHASES.databaseConfiguration,
      present: ['client-created'], absent: ['connect', 'close', 'preview-fetch'] },
    { name: 'production-entry-database-connect-failure', mode: 'database-connect-failure', phase: PREFLIGHT_FAILURE_PHASES.databaseConnect,
      present: ['client-created', 'connect', 'close'], absent: ['begin-read-only', 'preview-fetch'] },
    { name: 'production-entry-database-begin-failure', mode: 'database-begin-failure', phase: PREFLIGHT_FAILURE_PHASES.databaseBeginReadOnly,
      present: ['connect', 'begin-read-only', 'close'], absent: ['show-read-only', 'rollback', 'preview-fetch'] },
    { name: 'production-entry-database-show-failure', mode: 'database-show-failure', phase: PREFLIGHT_FAILURE_PHASES.databaseVerifyReadOnly,
      present: ['connect', 'begin-read-only', 'show-read-only', 'rollback', 'close'], absent: ['inspect-target', 'preview-fetch'] },
    { name: 'production-entry-database-statement-timeout-failure', mode: 'database-statement-timeout-failure', phase: PREFLIGHT_FAILURE_PHASES.databaseTimeouts,
      present: ['show-read-only', 'statement-timeout', 'rollback', 'close'], absent: ['idle-timeout', 'inspect-target', 'preview-fetch'] },
    { name: 'production-entry-database-idle-timeout-failure', mode: 'database-idle-timeout-failure', phase: PREFLIGHT_FAILURE_PHASES.databaseTimeouts,
      present: ['statement-timeout', 'idle-timeout', 'rollback', 'close'], absent: ['inspect-target', 'preview-fetch'] },
    { name: 'production-entry-database-inventory-failure', mode: 'database-inventory-failure', phase: PREFLIGHT_FAILURE_PHASES.databaseInventory,
      present: ['show-read-only', 'statement-timeout', 'idle-timeout', 'inspect-target', 'rollback', 'close'], absent: ['preview-fetch'] },
    { name: 'production-entry-database-inventory-cleanup-failure', mode: 'database-inventory-cleanup-failure', phase: PREFLIGHT_FAILURE_PHASES.databaseInventory,
      present: ['inspect-target', 'rollback', 'close'], absent: ['preview-fetch'] },
    { name: 'production-entry-database-rollback-failure', mode: 'database-rollback-failure', phase: PREFLIGHT_FAILURE_PHASES.databaseRollback,
      present: ['inspect-provider-count', 'rollback', 'close'], absent: ['preview-fetch'] },
    { name: 'production-entry-database-rollback-falsy-failure', mode: 'database-rollback-failure-falsy', phase: PREFLIGHT_FAILURE_PHASES.databaseRollback,
      present: ['inspect-provider-count', 'rollback', 'close'], absent: ['preview-fetch'] },
    { name: 'production-entry-database-close-failure', mode: 'database-close-failure', phase: PREFLIGHT_FAILURE_PHASES.databaseClose,
      present: ['inspect-provider-count', 'rollback', 'close'], absent: ['preview-fetch'] },
    { name: 'production-entry-bootstrap-binding-failure', phase: PREFLIGHT_FAILURE_PHASES.bootstrapBinding,
      override: { PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST: `sha256:${'0'.repeat(64)}` },
      present: ['inspect-provider-count', 'rollback', 'close'], absent: ['preview-fetch'] },
    { name: 'production-entry-preview-failure', mode: 'preview-failure', phase: PREFLIGHT_FAILURE_PHASES.preview,
      present: ['inspect-provider-count', 'rollback', 'close', 'preview-fetch'], absent: ['preview-body-cancelled'] },
  ];
  for (const scenario of cases) {
    const fixture = await createCredentialPreflightEntryFixture();
    try {
      const overrides = { ...(scenario.mode ? { PR_C_PREFLIGHT_FIXTURE_MODE: scenario.mode } : {}), ...(scenario.override ?? {}) };
      const env = await buildCredentialPreflightEntryEnvironment(fixture, overrides);
      assertSanitizedFailure(runCredentialPreflightEntry(fixture, env), scenario.phase, scenario.name);
      const trace = await readFile(env.PR_C_PREFLIGHT_FIXTURE_TRACE_PATH, 'utf8');
      for (const marker of scenario.present) assert.match(trace, new RegExp(`(?:^|\\n)${marker}(?:\\n|$)`, 'u'), `${scenario.name}:${marker}`);
      for (const marker of scenario.absent) assert.doesNotMatch(trace, new RegExp(`(?:^|\\n)${marker}(?:\\n|$)`, 'u'), `${scenario.name}:${marker}`);
      await assertNoArtifact(fixture);
      passed(scenario.name);
    } finally {
      await removeCredentialPreflightEntryFixture(fixture);
    }
  }
});

test('production credential-preflight entrypoint rejects source changed during execution and retains no artifact', async () => {
  const fixture = await createCredentialPreflightEntryFixture();
  try {
    const env = await buildCredentialPreflightEntryEnvironment(fixture, { PR_C_PREFLIGHT_FIXTURE_MODE: 'source-change' });
    assertSanitizedFailure(runCredentialPreflightEntry(fixture, env), PREFLIGHT_FAILURE_PHASES.sourceRecheck);
    assert.match(await readFile(env.PR_C_PREFLIGHT_FIXTURE_TRACE_PATH, 'utf8'), /source-changed/u);
    await assertNoArtifact(fixture);
    passed('production-entry-source-change-during-execution');
  } finally {
    await removeCredentialPreflightEntryFixture(fixture);
  }
});

test('production entry scenarios publish an exact measured-run contract', async () => {
  const directory = process.env.PR_C_CONTROL_SCRIPT_SCENARIO_REPORT_DIRECTORY;
  if (!directory) return;
  assert.deepEqual(scenarios.map(item => item.name), [
    'production-entry-source-identity-happy-path',
    'production-entry-existing-output-collision',
    'production-entry-wrong-output-path',
    'production-entry-dirty-source',
    'production-entry-nonancestor-base',
    'production-entry-event-authority-failure',
    'production-entry-nonpat-input-failure',
    'production-entry-database-configuration-failure',
    'production-entry-database-connect-failure',
    'production-entry-database-begin-failure',
    'production-entry-database-show-failure',
    'production-entry-database-statement-timeout-failure',
    'production-entry-database-idle-timeout-failure',
    'production-entry-database-inventory-failure',
    'production-entry-database-inventory-cleanup-failure',
    'production-entry-database-rollback-failure',
    'production-entry-database-rollback-falsy-failure',
    'production-entry-database-close-failure',
    'production-entry-bootstrap-binding-failure',
    'production-entry-preview-failure',
    'production-entry-source-change-during-execution',
  ]);
  await writeFile(path.join(directory, 'credential-preflight-entry-scenarios.json'), `${JSON.stringify({
    contractVersion: 'pr-c-control-script-scenarios-1',
    producer: 'scripts/prCControlledHumanCredentialPreflightEntry.test.mjs',
    scenarios,
  })}\n`, { flag: 'wx' });
});
