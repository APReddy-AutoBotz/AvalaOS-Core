import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, link, lstat, mkdir, open, readFile, readdir, rename, rm, stat, symlink, unlink, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';

import { bootstrapCheckoutIdentity } from './derivePrCControlledHumanBootstrap.mjs';
import { PREFLIGHT_COMMAND, PREFLIGHT_FAILURE_PHASES, PREFLIGHT_OUTPUT, derivePreflightIdentity, validateNonPatPreflightInputs } from './prCControlledHumanCredentialPreflight.mjs';
import { loadFixture } from './prCControlledHumanEnvironment.mjs';
import { calculatePrCWorkingTreeDigest, collectChangedPrCFiles, PR_C_BASE_SHA } from './transcriptFlowPrCEvidenceScope.mjs';
import {
  buildCredentialPreflightEntryEnvironment,
  assertCredentialPreflightFixtureGitResultForTest,
  assertCredentialPreflightFixtureIdentityClaimsForTest,
  assertCredentialPreflightFixtureResolvedRootForTest,
  assertCredentialPreflightEnvironmentOverridesForTest,
  assertCredentialPreflightEnvironmentReferencesForTest,
  assertCredentialPreflightObjectInventoryAuthorityForTest,
  assertCredentialPreflightObjectInventoryClaimsForTest,
  assertCredentialPreflightOidClosureClaimsForTest,
  assertCredentialPreflightPackFilesForTest,
  createCredentialPreflightEntryFixture,
  createCredentialPreflightEntrySeed,
  getCredentialPreflightFixtureDiagnostics,
  PR_C_INTENDED_REMOVED_WORKFLOWS,
  parseCredentialPreflightOidClosureForTest,
  readCredentialPreflightEntryArtifact,
  removeCredentialPreflightEntryFixture,
  removeCredentialPreflightEntrySeed,
  runCredentialPreflightEntry,
  sanitizeCredentialPreflightPathForTest,
  verifyCredentialPreflightEntryFixture,
  verifyCredentialPreflightEntrySeed,
} from './prCControlledHumanCredentialPreflightEntryFixture.mjs';
import { sanitizeControlScriptStartupFailure } from './runPrCControlledHumanScriptCoverage.mjs';

const scenarios = [];
let candidateSeed;
let candidateSeedCreated = false;
before(async () => {
  try {
    candidateSeed = await createCredentialPreflightEntrySeed(process.cwd());
    candidateSeedCreated = true;
  } catch (error) {
    throw new Error(`PR_C_CONTROL_SCRIPT_STARTUP_FAILED:${sanitizeControlScriptStartupFailure(error)}`);
  }
});
after(async () => {
  if (!candidateSeedCreated) return;
  await removeCredentialPreflightEntrySeed(candidateSeed);
  const diagnostics = getCredentialPreflightFixtureDiagnostics();
  assert.equal(diagnostics.actualFullIntegrityChecks, 9);
  assert.equal(diagnostics.actualObjectInventoryVerifications, 95);
});
const HOSTILE_CANARY = 'PR264_HOSTILE_SEMANTIC_INPUT_CANARY_MUST_NOT_APPEAR';
const exists = target => readFile(target).then(() => true, error => {
  if (error.code === 'ENOENT') return false;
  throw error;
});
const removeExactDirectoryLink = async target => {
  const before = await lstat(target);
  assert.equal(before.isSymbolicLink(), true, 'only an exact symbolic directory link may be unlinked');
  await unlink(target);
  await assert.rejects(lstat(target), error => error.code === 'ENOENT');
};
const passed = name => scenarios.push({ name, status: 'passed' });
const assertSanitizedFailure = (result, phase, context = phase) => {
  assert.equal(result.status, 1, context);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, `PR264_CREDENTIAL_PREFLIGHT_FAILED:${phase}\n`);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(HOSTILE_CANARY, 'u'), context);
};
const assertNoArtifact = async fixture => {
  await assert.rejects(readdir(path.join(fixture.repositoryRoot, PREFLIGHT_OUTPUT)), error => error.code === 'ENOENT');
};
const sha256 = value => createHash('sha256').update(value).digest('hex');
const gitText = (root, args, environment) => execFileSync('git', args, {
  cwd: root, env: { ...environment },
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
}).trim();
const expectedSeedGovernedInventory = async sourceRoot => {
  const files = [...new Set([...collectChangedPrCFiles(sourceRoot), ...PR_C_INTENDED_REMOVED_WORKFLOWS])].sort();
  const entries = {};
  for (const relative of files) {
    const target = path.join(sourceRoot, relative);
    entries[relative] = await readFile(target).then(value => sha256(value), error => error.code === 'ENOENT' ? null : Promise.reject(error));
  }
  return { files, digest: `sha256:${sha256(JSON.stringify(entries))}` };
};
const assertSeedAndPrivateClone = async (seed, sourceRoot, sourceGitEnvironment, expectedChanged) => {
  const expected = await expectedSeedGovernedInventory(sourceRoot);
  const sourceHead = gitText(sourceRoot, ['rev-parse', 'HEAD'], sourceGitEnvironment);
  const sourceTree = gitText(sourceRoot, ['rev-parse', 'HEAD^{tree}'], sourceGitEnvironment);
  assert.equal(seed.sourceHead, sourceHead);
  assert.deepEqual([...seed.governedFiles], expected.files);
  assert.equal(seed.governedDigest, expected.digest);
  assert.deepEqual([...seed.changed], expectedChanged);
  assert.deepEqual([...seed.deletions], []);
  if (expectedChanged.length === 0) {
    assert.equal(seed.candidateHead, sourceHead);
    assert.equal(seed.candidateTree, sourceTree);
  } else {
    assert.notEqual(seed.candidateHead, sourceHead);
    assert.notEqual(seed.candidateTree, sourceTree);
  }
  await verifyCredentialPreflightEntrySeed(seed);
  const clone = await createCredentialPreflightEntryFixture(seed, { purpose: 'adversarial' });
  try {
    assert.equal(clone.head, seed.candidateHead);
    assert.equal(clone.candidateTree, seed.candidateTree);
    assert.deepEqual([...clone.changed], expectedChanged);
    assert.equal(clone.governedDigest, expected.digest);
    await verifyCredentialPreflightEntryFixture(clone);
  } finally { await removeCredentialPreflightEntryFixture(clone); }
};

test('entry fixture preserves an already clean committed source without requiring an empty commit', async () => {
  const firstOid = 'a'.repeat(40);
  const secondOid = 'b'.repeat(40);
  assert.deepEqual(parseCredentialPreflightOidClosureForTest(`${secondOid}\n${firstOid}\n`), [firstOid, secondOid]);
  for (const malformed of ['', firstOid, `${firstOid}\r\n`, `${firstOid} path\n`, `${firstOid.toUpperCase()}\n`,
    `${firstOid}\n${firstOid}\n`, `${'0'.repeat(40)}\n`, `${HOSTILE_CANARY}\n`]) {
    assert.throws(() => parseCredentialPreflightOidClosureForTest(malformed), /OID_CLOSURE_REJECTED/u);
  }
  assert.equal(assertCredentialPreflightOidClosureClaimsForTest([firstOid], [firstOid]), true);
  assert.throws(() => assertCredentialPreflightOidClosureClaimsForTest([firstOid], [secondOid]), /OID_CLOSURE_MISMATCH_REJECTED/u);
  assert.equal(assertCredentialPreflightPackFilesForTest([`pack-${firstOid}.pack`, `pack-${firstOid}.idx`], firstOid), true);
  for (const names of [[`pack-${firstOid}.pack`], [`pack-${firstOid}.pack`, `pack-${firstOid}.idx`, 'pack-hostile.rev'],
    [`pack-${firstOid}.pack`, `pack-${secondOid}.idx`], [HOSTILE_CANARY]]) {
    assert.throws(() => assertCredentialPreflightPackFilesForTest(names, firstOid), /PACK_SET_REJECTED/u);
  }
  assert.throws(() => assertCredentialPreflightPackFilesForTest([`pack-${'0'.repeat(40)}.pack`, `pack-${'0'.repeat(40)}.idx`],
    '0'.repeat(40)), /PACK_SET_REJECTED/u);
  const fixture = await createCredentialPreflightEntryFixture(process.cwd(), { committedSourceOnly: true });
  let cleanSeed;
  try {
    const headFiles = new Set(fixture.sourceHeadFiles);
    assert.equal(fixture.head, fixture.sourceHead);
    assert.deepEqual(fixture.changed, []);
    for (const relative of PR_C_INTENDED_REMOVED_WORKFLOWS) {
      assert.equal(await exists(path.join(fixture.repositoryRoot, relative)), headFiles.has(relative), relative);
    }
    const rejectMetadata = async (relative, bytes, expected) => {
      const target = path.join(fixture.repositoryRoot, '.git', ...relative.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: 'wx' });
      try {
        await assert.rejects(createCredentialPreflightEntryFixture(fixture.repositoryRoot, { committedSourceOnly: true }), error => {
          assert.doesNotMatch(error.message, new RegExp(HOSTILE_CANARY, 'u'));
          return expected.test(error.message);
        });
      } finally { await unlink(target); }
    };
    await rejectMetadata('shallow', `${fixture.head}\n`, /SHALLOW_REJECTED/u);
    await rejectMetadata('info/grafts', `${fixture.head}\n`, /GRAFT_REJECTED/u);
    await rejectMetadata('objects/info/alternates', `${fixture.repositoryRoot}\n`, /ALTERNATE_REJECTED/u);
    await rejectMetadata('objects/info/http-alternates', `${HOSTILE_CANARY}\n`, /ALTERNATE_REJECTED/u);
    await rejectMetadata(`refs/replace/${fixture.head}`, `${fixture.head}\n`, /REPLACEMENT_REJECTED/u);
    await rejectMetadata('objects/pack/canary.promisor', HOSTILE_CANARY, /PROMISOR_REJECTED/u);
    const configPath = path.join(fixture.repositoryRoot, '.git', 'config');
    const configBytes = await readFile(configPath);
    for (const configEntry of [
      '\n[remote "canary"]\n\tpromisor = true\n',
      '\n[remote "canary"]\n\tpartialCloneFilter = blob:none\n',
      '\n[extensions]\n\tpartialClone = canary\n',
    ]) {
      try {
        const baseConfig = configBytes.toString('utf8');
        const configured = configEntry.includes('[extensions]')
          ? `${baseConfig.replace('repositoryformatversion = 0', 'repositoryformatversion = 1')}${configEntry}`
          : `${baseConfig}${configEntry}`;
        await writeFile(configPath, configured);
        await assert.rejects(createCredentialPreflightEntryFixture(fixture.repositoryRoot, { committedSourceOnly: true }), error => {
          assert.doesNotMatch(error.message, new RegExp(HOSTILE_CANARY, 'u'));
          return /PROMISOR_REJECTED/u.test(error.message);
        });
      } finally { await writeFile(configPath, configBytes); }
    }
    cleanSeed = await createCredentialPreflightEntrySeed(fixture.repositoryRoot);
    await assertSeedAndPrivateClone(cleanSeed, fixture.repositoryRoot, fixture.gitEnvironment, []);
    await removeCredentialPreflightEntrySeed(cleanSeed); cleanSeed = null;
  } finally {
    if (cleanSeed) await removeCredentialPreflightEntrySeed(cleanSeed);
    await removeCredentialPreflightEntryFixture(fixture);
  }

  const dirtySource = await createCredentialPreflightEntryFixture(process.cwd(), { committedSourceOnly: true });
  let dirtySeed;
  try {
    await appendFile(path.join(dirtySource.repositoryRoot, 'package.json'), '\n');
    assert.equal(gitText(dirtySource.repositoryRoot, ['diff', '--name-only', 'HEAD', '--'], dirtySource.gitEnvironment), 'package.json');
    dirtySeed = await createCredentialPreflightEntrySeed(dirtySource.repositoryRoot);
    await assertSeedAndPrivateClone(dirtySeed, dirtySource.repositoryRoot, dirtySource.gitEnvironment, ['package.json']);
    await removeCredentialPreflightEntrySeed(dirtySeed); dirtySeed = null;
  } finally {
    if (dirtySeed) await removeCredentialPreflightEntrySeed(dirtySeed);
    await removeCredentialPreflightEntryFixture(dirtySource);
  }
});

test('entry fixture overlays all exact intended workflow deletions and commits an equivalent clean candidate', async () => {
  const fixture = await createCredentialPreflightEntryFixture(candidateSeed);
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
  const fixture = await createCredentialPreflightEntryFixture(candidateSeed);
  try {
    const env = await buildCredentialPreflightEntryEnvironment(fixture);
    const npmPrefixedPath = `${path.join(fixture.sourceRoot, 'node_modules', '.bin')}${path.delimiter}${fixture.gitEnvironment.PATH}`;
    assert.equal(sanitizeCredentialPreflightPathForTest(npmPrefixedPath,
      [fixture.sourceRoot, candidateSeed.repositoryRoot]), fixture.gitEnvironment.PATH);
    assert.equal(env.PATH, fixture.gitEnvironment.PATH);
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

test('production credential-preflight entrypoint accepts an exact installed migration only when every mutable authority table is empty', async () => {
  const fixture = await createCredentialPreflightEntryFixture(candidateSeed);
  try {
    const env = await buildCredentialPreflightEntryEnvironment(fixture, { PR_C_PREFLIGHT_FIXTURE_MODE: 'current-empty-success' });
    const result = runCredentialPreflightEntry(fixture, env);
    const trace = await readFile(env.PR_C_PREFLIGHT_FIXTURE_TRACE_PATH, 'utf8');
    assert.equal(result.status, 0, `${result.stderr}${trace}`);
    assert.equal(result.stderr, '');
    const { report } = await readCredentialPreflightEntryArtifact(fixture);
    assert.equal(report.schemaVersion, 'pr264-controlled-human-credential-preflight-2');
    assert.equal(report.inventoryDisposition, 'current_empty');
    assert.equal(report.observedMigrationTip, '20260904120000');
    assert.equal(report.installedMigrationDigest, 'sha256:9fae1ff1ba74c734d947cf03022207669abd8c2e92d227f6377358ab3e98490e');
    assert.equal(report.checks.validatedMigrationAndEmptySyntheticState, true);
    for (const marker of ['begin-read-only', 'show-read-only', 'inspect-history-tip', 'inspect-bootstrap-mutable-count', 'inspect-provider-state', 'inspect-exercise-history', 'inspect-unsafe-deprovisioned', 'rollback', 'close']) {
      assert.match(trace, new RegExp(`(?:^|\\n)${marker}(?:\\n|$)`, 'u'), marker);
    }
    passed('production-entry-current-empty-happy-path');
  } finally {
    await removeCredentialPreflightEntryFixture(fixture);
  }
});

test('production credential-preflight entrypoint rejects wrong output path before transport', async () => {
  const fixture = await createCredentialPreflightEntryFixture(candidateSeed);
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
  const fixture = await createCredentialPreflightEntryFixture(candidateSeed);
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
  const fixture = await createCredentialPreflightEntryFixture(candidateSeed, { nonAncestor: true });
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

test('production credential-preflight entrypoint emits only the fixed event-authority phase', async () => {
  const fixture = await createCredentialPreflightEntryFixture(candidateSeed);
  try {
    const env = await buildCredentialPreflightEntryEnvironment(fixture, { GITHUB_ACTOR: 'hostile-fixture-actor' });
    assertSanitizedFailure(runCredentialPreflightEntry(fixture, env), PREFLIGHT_FAILURE_PHASES.eventAuthority, 'production-entry-event-authority-failure');
    assert.equal(await readFile(env.PR_C_PREFLIGHT_FIXTURE_TRACE_PATH, 'utf8'), 'transport-installed\n');
    await assertNoArtifact(fixture);
    passed('production-entry-event-authority-failure');
  } finally {
    await removeCredentialPreflightEntryFixture(fixture);
  }
});

test('seven non-PAT semantic failures execute the real production entrypoint and stop before transport', async () => {
  const semanticScenarios = [
    {
      name: 'production-entry-nonpat-required-fields-failure',
      phase: PREFLIGHT_FAILURE_PHASES.nonPatRequiredFields,
      mutate: env => { env.PR_C_CONTROLLED_HUMAN_SUPABASE_SERVICE_ROLE_KEY = ''; },
    },
    {
      name: 'production-entry-nonpat-forbidden-credential-failure',
      phase: PREFLIGHT_FAILURE_PHASES.nonPatForbiddenCredential,
      mutate: env => { env.PR_C_CONTROLLED_HUMAN_SUPABASE_ACCESS_TOKEN = HOSTILE_CANARY; },
    },
    {
      name: 'production-entry-nonpat-signing-authority-failure',
      phase: PREFLIGHT_FAILURE_PHASES.nonPatSigningAuthority,
      mutate: env => { env.PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY = ` ${HOSTILE_CANARY}`; },
    },
    {
      name: 'production-entry-nonpat-target-tuple-failure',
      phase: PREFLIGHT_FAILURE_PHASES.nonPatTargetTuple,
      mutate: env => { env.PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF = HOSTILE_CANARY; },
    },
    {
      name: 'production-entry-nonpat-password-json-failure',
      phase: PREFLIGHT_FAILURE_PHASES.nonPatPasswordJson,
      mutate: env => { env.PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_JSON = `{"${HOSTILE_CANARY}"`; },
    },
    {
      name: 'production-entry-nonpat-password-persona-set-failure',
      phase: PREFLIGHT_FAILURE_PHASES.nonPatPasswordPersonaSet,
      mutate: env => {
        const bundle = JSON.parse(env.PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_JSON);
        bundle[HOSTILE_CANARY] = 'fixture-only-unexpected-persona-password';
        env.PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_JSON = JSON.stringify(bundle);
      },
    },
    {
      name: 'production-entry-nonpat-password-values-failure',
      phase: PREFLIGHT_FAILURE_PHASES.nonPatPasswordValues,
      mutate: env => {
        const bundle = JSON.parse(env.PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_JSON);
        bundle[Object.keys(bundle)[0]] = { canary: HOSTILE_CANARY };
        env.PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_JSON = JSON.stringify(bundle);
      },
    },
  ];
  for (const scenario of semanticScenarios) {
    const fixture = await createCredentialPreflightEntryFixture(candidateSeed);
    try {
      const env = await buildCredentialPreflightEntryEnvironment(fixture, { PR_C_PREFLIGHT_HOSTILE_CANARY: HOSTILE_CANARY });
      scenario.mutate(env);
      const result = runCredentialPreflightEntry(fixture, env);
      assertSanitizedFailure(result, scenario.phase, scenario.name);
      const trace = await readFile(env.PR_C_PREFLIGHT_FIXTURE_TRACE_PATH, 'utf8');
      assert.equal(trace, 'transport-installed\n', scenario.name);
      assert.doesNotMatch(trace, new RegExp(HOSTILE_CANARY, 'u'), scenario.name);
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
    const fixture = await createCredentialPreflightEntryFixture(candidateSeed);
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

test('production credential-preflight entrypoint rejects untrusted installed history and orphan mutable authority rows after read-only cleanup', async () => {
  const cases = [
    { name: 'production-entry-current-empty-wrong-installed-digest', mode: 'current-empty-wrong-installed-digest' },
    { name: 'production-entry-current-empty-null-installed-digest', mode: 'current-empty-null-installed-digest' },
    { name: 'production-entry-current-empty-statement-count-failure', mode: 'current-empty-statement-count-failure' },
    { name: 'production-entry-current-empty-orphan-mutable-row', mode: 'current-empty-orphan-mutable-row' },
  ];
  for (const scenario of cases) {
    const fixture = await createCredentialPreflightEntryFixture(candidateSeed);
    try {
      const env = await buildCredentialPreflightEntryEnvironment(fixture, { PR_C_PREFLIGHT_FIXTURE_MODE: scenario.mode });
      assertSanitizedFailure(runCredentialPreflightEntry(fixture, env), PREFLIGHT_FAILURE_PHASES.bootstrapBinding, scenario.name);
      const trace = await readFile(env.PR_C_PREFLIGHT_FIXTURE_TRACE_PATH, 'utf8');
      for (const marker of ['begin-read-only', 'show-read-only', 'inspect-history-tip', 'inspect-bootstrap-mutable-count', 'rollback', 'close']) {
        assert.match(trace, new RegExp(`(?:^|\\n)${marker}(?:\\n|$)`, 'u'), `${scenario.name}:${marker}`);
      }
      assert.doesNotMatch(trace, /preview-fetch/u);
      await assertNoArtifact(fixture);
      passed(scenario.name);
    } finally {
      await removeCredentialPreflightEntryFixture(fixture);
    }
  }
});

test('production credential-preflight entrypoint rejects source changed during execution and retains no artifact', async () => {
  const fixture = await createCredentialPreflightEntryFixture(candidateSeed);
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

test('fixture identity and bounded Git validators reject every substituted claim without diagnostic disclosure', () => {
  const identity = {
    head: 'a'.repeat(40), tree: 'b'.repeat(40), ancestry: true,
    changed: ['scripts/a.mjs'], deletions: ['obsolete.yml'], inventoryDigest: `sha256:${'c'.repeat(64)}`,
    inventoryEntries: { 'scripts/a.mjs': 'd'.repeat(64), 'obsolete.yml': null }, headFiles: ['scripts/a.mjs'],
  };
  const mutations = [
    value => { value.head = 'e'.repeat(40); },
    value => { value.tree = 'e'.repeat(40); },
    value => { value.ancestry = false; },
    value => { value.changed.push('scripts/substituted.mjs'); },
    value => { value.deletions = []; },
    value => { value.inventoryDigest = `sha256:${'e'.repeat(64)}`; },
    value => { value.inventoryEntries['scripts/a.mjs'] = 'e'.repeat(64); },
    value => { value.headFiles.push('scripts/extra.mjs'); },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(identity);
    mutate(changed);
    assert.throws(() => assertCredentialPreflightFixtureIdentityClaimsForTest(identity, changed), /IDENTITY_CLAIMS_REJECTED/u);
  }

  const canary = 'GIT_PRIVATE_DIAGNOSTIC_CANARY';
  const rejected = [
    () => assertCredentialPreflightFixtureGitResultForTest([], { status: 0, stdout: '', stderr: '' }),
    () => assertCredentialPreflightFixtureGitResultForTest(['status', `bad\0${canary}`], { status: 0, stdout: '', stderr: '' }),
    () => assertCredentialPreflightFixtureGitResultForTest(['status'], { status: 1, stdout: '', stderr: canary }),
    () => assertCredentialPreflightFixtureGitResultForTest(['status'], { status: null, signal: 'SIGTERM', stdout: '', stderr: canary }),
    () => assertCredentialPreflightFixtureGitResultForTest(['status'], { status: null, error: { code: 'ETIMEDOUT', message: canary }, stdout: '', stderr: '' }),
    () => assertCredentialPreflightFixtureGitResultForTest(['status'], { status: null, error: { code: 'ENOBUFS', message: canary }, stdout: '', stderr: '' }),
    () => assertCredentialPreflightFixtureGitResultForTest(['status'], { status: 0, stdout: 'x'.repeat(4 * 1024 * 1024 + 1), stderr: canary }),
  ];
  for (const reject of rejected) {
    assert.throws(reject, error => error instanceof Error && error.message.startsWith('PR_C_PREFLIGHT_FIXTURE_GIT_REJECTED:')
      && !error.message.includes(canary));
  }

  const objectInventory = {
    digest: `sha256:${'a'.repeat(64)}`,
    entries: [{ path: 'pack/pack-a.pack', size: 128, sha256: 'b'.repeat(64) }],
  };
  const objectMutations = [
    value => { value.digest = `sha256:${'c'.repeat(64)}`; },
    value => { value.entries[0].path = 'pack/pack-substituted.pack'; },
    value => { value.entries[0].size = 127; },
    value => { value.entries[0].sha256 = 'c'.repeat(64); },
    value => { value.entries = []; },
    value => { value.entries.push({ path: 'info/extra', size: 1, sha256: 'd'.repeat(64) }); },
  ];
  assert.equal(assertCredentialPreflightObjectInventoryClaimsForTest(objectInventory, structuredClone(objectInventory)), true);
  for (const mutate of objectMutations) {
    const changed = structuredClone(objectInventory);
    mutate(changed);
    assert.throws(() => assertCredentialPreflightObjectInventoryClaimsForTest(objectInventory, changed), /OBJECT_INVENTORY_REJECTED/u);
  }
});

test('fixture child environment strips source authority from PATH and rejects protected overrides or encoded references', async () => {
  assert.equal(
    sanitizeCredentialPreflightPathForTest('/srv/avalaos/node_modules/.bin:/srv/avalaos/..bin:/usr/bin:/srv/avalaos-sibling/bin', ['/srv/avalaos'], 'linux'),
    '/usr/bin:/srv/avalaos-sibling/bin',
  );
  assert.equal(
    sanitizeCredentialPreflightPathForTest(
      'd:\\avalaos\\node_modules\\.bin;D:\\AvalaOS\\..bin;C:\\Program Files\\Git\\cmd;D:\\AvalaOS-sibling\\bin;D:/AVALAOS/scripts',
      ['D:\\AvalaOS'], 'win32',
    ),
    'C:\\Program Files\\Git\\cmd;D:\\AvalaOS-sibling\\bin',
  );
  assert.equal(assertCredentialPreflightEnvironmentReferencesForTest(
    { PATH: '/usr/bin:/srv/avalaos-sibling/bin', VALUE: 'safe' }, ['/srv/avalaos'], 'linux'), true);
  assert.throws(() => assertCredentialPreflightEnvironmentReferencesForTest(
    { GITHUB_ACTOR: JSON.stringify({ source: 'd:\\AVALAOS\\node_modules\\.bin' }) }, ['D:\\AvalaOS'], 'win32'),
  /CHILD_ENVIRONMENT_REJECTED/u);
  assert.equal(assertCredentialPreflightEnvironmentOverridesForTest({
    GITHUB_ACTOR: 'synthetic-negative', PR_C_PREFLIGHT_FIXTURE_MODE: 'database-connect-failure',
  }), true);
  for (const overrides of [
    { PATH: '/substituted' }, { Path: 'C:\\substituted' }, { GIT_OBJECT_DIRECTORY: '/substituted' },
    { GIT_CONFIG_KEY_0: 'credential.helper' }, { NODE_OPTIONS: '--import=substituted' }, { UNSUPPORTED: 'value' },
  ]) assert.throws(() => assertCredentialPreflightEnvironmentOverridesForTest(overrides), /ENVIRONMENT_OVERRIDE_REJECTED/u);

  const linkRoot = path.join(candidateSeed.temporaryRoot, 'control', 'retargeted-path-link');
  const safeTarget = path.join(candidateSeed.temporaryRoot, 'control', 'retargeted-path-safe-target');
  const systemPath = path.dirname(process.execPath);
  await mkdir(safeTarget, { recursive: true });
  await symlink(safeTarget, linkRoot, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    const frozenPath = `${linkRoot}${path.delimiter}${systemPath}`;
    assert.equal(sanitizeCredentialPreflightPathForTest(frozenPath, [candidateSeed.repositoryRoot]), frozenPath);
    await removeExactDirectoryLink(linkRoot);
    await symlink(candidateSeed.repositoryRoot, linkRoot, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(sanitizeCredentialPreflightPathForTest(frozenPath, [candidateSeed.repositoryRoot]), systemPath);
  } finally {
    await lstat(linkRoot).then(() => removeExactDirectoryLink(linkRoot), error => {
      if (error.code !== 'ENOENT') throw error;
    });
    await rm(safeTarget, { recursive: true, force: true });
  }
});

test('single seed and a private adversarial clone reject tampering, shared objects, remotes, contamination, and stale cleanup', async () => {
  await verifyCredentialPreflightEntrySeed(candidateSeed);
  const seedHeadPath = path.join(candidateSeed.repositoryRoot, '.git', 'HEAD');
  const originalSeedHead = await readFile(seedHeadPath);
  try {
    assert.notEqual(candidateSeed.candidateHead, PR_C_BASE_SHA);
    await writeFile(seedHeadPath, `${PR_C_BASE_SHA}\n`);
    await assert.rejects(verifyCredentialPreflightEntrySeed(candidateSeed));
  } finally {
    await writeFile(seedHeadPath, originalSeedHead);
  }
  await verifyCredentialPreflightEntrySeed(candidateSeed);
  const seedCandidatePath = path.join(candidateSeed.repositoryRoot, 'package.json');
  const originalCandidateBytes = await readFile(seedCandidatePath);
  try {
    await appendFile(seedCandidatePath, '\n');
    await assert.rejects(verifyCredentialPreflightEntrySeed(candidateSeed));
  } finally {
    await writeFile(seedCandidatePath, originalCandidateBytes);
  }
  await verifyCredentialPreflightEntrySeed(candidateSeed);

  const fixture = await createCredentialPreflightEntryFixture(candidateSeed, { purpose: 'adversarial' });
  let removed = false;
  try {
    assert.equal(assertCredentialPreflightObjectInventoryAuthorityForTest(fixture), true);
    assert.throws(() => assertCredentialPreflightObjectInventoryAuthorityForTest(Object.freeze({ ...fixture })), /INVENTORY_AUTHORITY_REJECTED/u);
    const env = await buildCredentialPreflightEntryEnvironment(fixture);
    const gitEnvironmentText = JSON.stringify(fixture.gitEnvironment);
    assert.equal(gitEnvironmentText.includes(candidateSeed.sourceRoot), false);
    assert.equal(gitEnvironmentText.includes(candidateSeed.repositoryRoot), false);
    assert.equal(env.UNRELATED_INHERITED_VALUE, undefined);
    const sourceLink = path.join(fixture.controlRoot, 'outside-link-to-seed');
    await symlink(candidateSeed.repositoryRoot, sourceLink, process.platform === 'win32' ? 'junction' : 'dir');
    try {
      assert.equal(sanitizeCredentialPreflightPathForTest(
        `${sourceLink}${path.delimiter}${fixture.gitEnvironment.PATH}`,
        [fixture.sourceRoot, candidateSeed.repositoryRoot]), fixture.gitEnvironment.PATH);
    } finally { await removeExactDirectoryLink(sourceLink); }
    const encodedSource = JSON.stringify(process.platform === 'win32' ? fixture.sourceRoot.toUpperCase() : fixture.sourceRoot);
    await assert.rejects(buildCredentialPreflightEntryEnvironment(fixture, { GITHUB_ACTOR: encodedSource }), /CHILD_ENVIRONMENT_REJECTED/u);
    await assert.rejects(buildCredentialPreflightEntryEnvironment(fixture, { PATH: fixture.gitEnvironment.PATH }), /ENVIRONMENT_OVERRIDE_REJECTED/u);
    await assert.rejects(buildCredentialPreflightEntryEnvironment(fixture, { GIT_CONFIG_GLOBAL: 'substituted' }), /ENVIRONMENT_OVERRIDE_REJECTED/u);
    assert.throws(() => runCredentialPreflightEntry(fixture, { ...env, PATH: fixture.sourceRoot }), /CHILD_ENVIRONMENT_REJECTED/u);
    await verifyCredentialPreflightEntryFixture(fixture);
    await assert.rejects(removeCredentialPreflightEntrySeed(candidateSeed), /ACTIVE_CLONES_REJECTED/u);
    await assert.rejects(removeCredentialPreflightEntryFixture(Object.freeze({ ...fixture })), /CLEANUP_AUTHORITY_REJECTED/u);

    const contamination = path.join(fixture.repositoryRoot, 'fixture-contamination.txt');
    await writeFile(contamination, 'fixture-only');
    await assert.rejects(verifyCredentialPreflightEntryFixture(fixture), /CONTAMINATION_REJECTED/u);
    await unlink(contamination);

    const configPath = path.join(fixture.repositoryRoot, '.git', 'config');
    const configBytes = await readFile(configPath);
    try {
      await appendFile(configPath, '\n[remote "hostile"]\n\turl = https://example.invalid/repository.git\n');
      await assert.rejects(verifyCredentialPreflightEntryFixture(fixture), /REMOTE_REJECTED/u);
    } finally { await writeFile(configPath, configBytes); }

    const alternatesPath = path.join(fixture.repositoryRoot, '.git', 'objects', 'info', 'alternates');
    await writeFile(alternatesPath, path.join(candidateSeed.repositoryRoot, '.git', 'objects'));
    await assert.rejects(verifyCredentialPreflightEntryFixture(fixture), /ALTERNATE_REJECTED/u);
    await unlink(alternatesPath);

    const packRoot = path.join(fixture.repositoryRoot, '.git', 'objects', 'pack');
    const packName = (await readdir(packRoot)).find(name => name.endsWith('.pack'));
    assert.equal(typeof packName, 'string');
    const packPath = path.join(packRoot, packName);
    const hardlinkPath = path.join(fixture.controlRoot, 'object-hardlink');
    await link(packPath, hardlinkPath);
    await assert.rejects(verifyCredentialPreflightEntryFixture(fixture), /HARDLINK_REJECTED/u);
    await unlink(hardlinkPath);

    const packStat = await stat(packPath);
    const packHandle = await open(packPath, 'r+');
    const originalByte = Buffer.alloc(1);
    try {
      const { bytesRead } = await packHandle.read(originalByte, 0, 1, 64);
      assert.equal(bytesRead, 1);
      await packHandle.write(Buffer.from([originalByte[0] ^ 0xff]), 0, 1, 64);
    } finally { await packHandle.close(); }
    await utimes(packPath, packStat.atime, packStat.mtime);
    try { await assert.rejects(verifyCredentialPreflightEntryFixture(fixture), /OBJECT_INVENTORY_REJECTED/u); }
    finally {
      const restoreHandle = await open(packPath, 'r+');
      try { await restoreHandle.write(originalByte, 0, 1, 64); }
      finally { await restoreHandle.close(); }
      await utimes(packPath, packStat.atime, packStat.mtime);
    }

    const extraObjectRoot = path.join(fixture.repositoryRoot, '.git', 'objects', 'info');
    const extraObjectPath = path.join(extraObjectRoot, 'fixture-extra-object');
    await mkdir(extraObjectRoot, { recursive: true });
    await writeFile(extraObjectPath, 'fixture-only');
    try { await assert.rejects(verifyCredentialPreflightEntryFixture(fixture), /OBJECT_INVENTORY_REJECTED/u); }
    finally { await unlink(extraObjectPath); }

    const missingPackPath = path.join(fixture.controlRoot, 'missing-object-pack');
    await rename(packPath, missingPackPath);
    try { await assert.rejects(verifyCredentialPreflightEntryFixture(fixture), /OBJECT_INVENTORY_REJECTED/u); }
    finally { await rename(missingPackPath, packPath); }
    await verifyCredentialPreflightEntryFixture(fixture);
    await removeCredentialPreflightEntryFixture(fixture);
    removed = true;
    assert.throws(() => assertCredentialPreflightObjectInventoryAuthorityForTest(fixture), /INVENTORY_AUTHORITY_REJECTED/u);
    await assert.rejects(removeCredentialPreflightEntryFixture(fixture), /CLEANUP_AUTHORITY_REJECTED/u);
  } finally {
    if (!removed) await removeCredentialPreflightEntryFixture(fixture);
  }
});

test('cleanup rejects resolved-root escape and a missing active clone root without losing retry authority', async () => {
  const osRoot = path.resolve(os.tmpdir());
  assert.equal(assertCredentialPreflightFixtureResolvedRootForTest(osRoot, path.join(osRoot, 'owned'), path.join(osRoot, 'owned')), true);
  assert.throws(() => assertCredentialPreflightFixtureResolvedRootForTest(osRoot, path.join(osRoot, 'owned'), path.join(osRoot, 'foreign')),
    /CLEANUP_AUTHORITY_REJECTED/u);
  assert.throws(() => assertCredentialPreflightFixtureResolvedRootForTest(osRoot, path.join(osRoot, 'owned'), path.resolve(osRoot, '..', 'escaped')));

  const fixture = await createCredentialPreflightEntryFixture(candidateSeed, { purpose: 'adversarial' });
  const displaced = `${fixture.temporaryRoot}-displaced`;
  await rename(fixture.temporaryRoot, displaced);
  try { await assert.rejects(removeCredentialPreflightEntryFixture(fixture), /CLEANUP_AUTHORITY_REJECTED/u); }
  finally { await rename(displaced, fixture.temporaryRoot); }
  await removeCredentialPreflightEntryFixture(fixture);
});

test('production entry scenarios publish an exact measured-run contract', async t => {
  assert.deepEqual(scenarios.map(item => item.name), [
    'production-entry-source-identity-happy-path',
    'production-entry-existing-output-collision',
    'production-entry-current-empty-happy-path',
    'production-entry-wrong-output-path',
    'production-entry-dirty-source',
    'production-entry-nonancestor-base',
    'production-entry-event-authority-failure',
    'production-entry-nonpat-required-fields-failure',
    'production-entry-nonpat-forbidden-credential-failure',
    'production-entry-nonpat-signing-authority-failure',
    'production-entry-nonpat-target-tuple-failure',
    'production-entry-nonpat-password-json-failure',
    'production-entry-nonpat-password-persona-set-failure',
    'production-entry-nonpat-password-values-failure',
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
    'production-entry-current-empty-wrong-installed-digest',
    'production-entry-current-empty-null-installed-digest',
    'production-entry-current-empty-statement-count-failure',
    'production-entry-current-empty-orphan-mutable-row',
    'production-entry-source-change-during-execution',
  ]);
  assert.equal(scenarios.length, 32);
  const diagnostics = getCredentialPreflightFixtureDiagnostics();
  assert.equal(diagnostics.actualOverlayBuilds, 3);
  assert.equal(diagnostics.actualCampaignClones, 32);
  assert.equal(diagnostics.actualCommittedSourceFixtures, 2);
  assert.equal(diagnostics.actualAdversarialClones, 4);
  assert.equal(diagnostics.actualEntryRuns, 32);
  assert.equal(diagnostics.actualFullIntegrityChecks, 8);
  assert.equal(diagnostics.actualObjectInventoryVerifications, 93);
  assert.equal(diagnostics.seedElapsedMs.length, 3);
  assert.equal(diagnostics.cloneElapsedMs.length, 36);
  assert.equal(diagnostics.entryElapsedMs.length, 32);
  assert.ok([...diagnostics.seedElapsedMs, ...diagnostics.cloneElapsedMs, ...diagnostics.entryElapsedMs]
    .every(value => Number.isSafeInteger(value) && value >= 0));
  t.diagnostic(`PR264_FIXTURE_OPERATION_PROJECTION ${JSON.stringify(diagnostics)}`);
  const directory = process.env.PR_C_CONTROL_SCRIPT_SCENARIO_REPORT_DIRECTORY;
  if (!directory) return;
  await writeFile(path.join(directory, 'credential-preflight-entry-scenarios.json'), `${JSON.stringify({
    contractVersion: 'pr-c-control-script-scenarios-1',
    producer: 'scripts/prCControlledHumanCredentialPreflightEntry.test.mjs',
    scenarios,
  })}\n`, { flag: 'wx' });
});
