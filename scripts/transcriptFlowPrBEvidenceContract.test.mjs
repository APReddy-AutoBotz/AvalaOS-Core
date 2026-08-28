import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertSanitized,
  loadEvidenceContract,
  validateCommandMarkers,
  validateEvidenceContract,
  validateEvidenceResultCardinality,
} from './transcriptFlowPrBEvidenceContract.mjs';
import { validatePrBProvenance } from './transcriptFlowPrBEvidenceScope.mjs';
import {
  cleanupPrBEvidenceCompilerOutput,
  createPrBEvidenceCompilerOutputCleanup,
  PR_B_EVIDENCE_COMPILER_OUTPUT,
  PR_B_EVIDENCE_COMPILER_OUTPUTS,
} from './runTranscriptFlowPrBEvidenceTempCleanup.mjs';

const root = process.cwd();
const baseGitSha = '11e670003a73b0ab5a28650b70afac4b267760f4';
const baseline = () => loadEvidenceContract(root);
const clone = value => structuredClone(value);

const emittedForCommand = (validated, commandId) => validated.registry.assertions
  .filter(item => item.commandId === commandId)
  .map(item => ({
    testId: item.testId,
    assertionId: item.assertionId,
    fixture: item.fixture,
    result: 'passed',
    runtimeContext: clone(item.expectedRuntimeContext),
  }));

const materializeRuntimeMatchers = value => {
  if (Array.isArray(value)) return value.map(materializeRuntimeMatchers);
  if (!value || typeof value !== 'object') return value;
  const keys = Object.keys(value);
  const matcherKeys = keys.filter(key => key.startsWith('$'));
  if (matcherKeys.length > 0) {
    assert.equal(keys.length, 1, 'TEST_RUNTIME_MATCHER_SHAPE');
    const matcher = keys[0];
    if (matcher === '$uuidV4') {
      assert.equal(value.$uuidV4, true, 'TEST_RUNTIME_UUID_V4_MATCHER');
      return 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    }
    if (matcher === '$sha256') {
      assert.equal(value.$sha256, true, 'TEST_RUNTIME_SHA256_MATCHER');
      return 'a'.repeat(64);
    }
    if (matcher === '$integer') {
      assert.deepEqual(Object.keys(value.$integer).sort(), ['maxExclusive', 'min'], 'TEST_RUNTIME_INTEGER_MATCHER');
      return value.$integer.min;
    }
    if (matcher === '$numberArray') {
      assert.deepEqual(Object.keys(value.$numberArray).sort(), ['length', 'maxExclusive', 'min'], 'TEST_RUNTIME_NUMBER_ARRAY_MATCHER');
      return Array.from({ length: value.$numberArray.length }, () => value.$numberArray.min);
    }
    assert.fail(`TEST_RUNTIME_MATCHER_UNKNOWN:${matcher}`);
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materializeRuntimeMatchers(item)]));
};

test('PR B registry binds every required assertion to exact commands, owners, fixtures, and runtime lineage', () => {
  const validated = validateEvidenceContract(root, baseline(), { baseGitSha });
  assert.equal(validated.registry.commands.length, 61);
  assert.ok(validated.registry.assertions.length >= 55);
});

test('registry rejects a substituted canonical command', () => {
  const contract = baseline();
  contract.registry.commands[0].command = 'npm run build';
  assert.throws(() => validateEvidenceContract(root, contract, { skipProvenance: true }), /PR_B_COMMAND_SOURCE_CONTRACT/u);
});

test('registry rejects fake owner paths and hashes', () => {
  const fakePath = baseline();
  const ownerKey = fakePath.registry.assertions.find(item => item.testId === 'AUTH-001')?.owner;
  assert.ok(ownerKey);
  fakePath.registry.owners[ownerKey].path = 'supabase/functions/_shared/not-real.test.ts';
  assert.throws(() => validateEvidenceContract(root, fakePath, { skipProvenance: true }), /PR_B_OWNER_PATH/u);
  const fakeHash = baseline();
  fakeHash.registry.owners[ownerKey].sha256 = '0'.repeat(64);
  assert.throws(() => validateEvidenceContract(root, fakeHash, { skipProvenance: true }), /PR_B_OWNER_HASH/u);
});

test('registry rejects dead, missing, and oracle-free fixtures', () => {
  const dead = baseline();
  dead.fixtures.fixtures.push({ id: 'dead-fixture', oracle: 'must be rejected', sourcePaths: ['package.json'] });
  assert.throws(() => validateEvidenceContract(root, dead, { skipProvenance: true }), /PR_B_FIXTURE_DEAD/u);
  const missing = baseline();
  missing.fixtures.fixtures[0].sourcePaths = ['testing/process-lifecycle/fixtures/studio-pr-b/not-real.json'];
  assert.throws(() => validateEvidenceContract(root, missing, { skipProvenance: true }), /PR_B_FIXTURE_SOURCE_MISSING/u);
  const noOracle = baseline();
  noOracle.fixtures.fixtures[0].oracle = '';
  assert.throws(() => validateEvidenceContract(root, noOracle, { skipProvenance: true }), /PR_B_FIXTURE_ORACLE/u);
});

test('AUTH assertions are API-owned and cannot be reassigned to PostgreSQL', () => {
  const contract = baseline();
  const auth = contract.registry.assertions.find(item => item.testId === 'AUTH-001');
  assert.ok(auth);
  auth.commandId = 'pr-b-postgres';
  auth.owner = 'postgres';
  assert.throws(() => validateEvidenceContract(root, contract, { skipProvenance: true }), /PR_B_AUTH_COMMAND_OWNER|PR_B_AUTH_SOURCE_OWNER/u);
});

test('a green command cannot replace, omit, duplicate, or substitute an exact assertion marker', () => {
  const validated = validateEvidenceContract(root, baseline(), { baseGitSha });
  const markers = emittedForCommand(validated, 'pr-b-api');
  assert.ok(markers.length > 0);
  assert.doesNotThrow(() => validateCommandMarkers(validated, 'pr-b-api', markers));
  assert.throws(() => validateCommandMarkers(validated, 'pr-b-api', markers.slice(1)), /PR_B_MARKER_COUNT|PR_B_MARKER_MISSING/u);
  assert.throws(() => validateCommandMarkers(validated, 'pr-b-api', [...markers, clone(markers[0])]), /PR_B_MARKER_DUPLICATE/u);
  const fabricated = clone(markers);
  fabricated[0].assertionId = 'fabricated-green-assertion';
  assert.throws(() => validateCommandMarkers(validated, 'pr-b-api', fabricated), /PR_B_MARKER_UNREGISTERED/u);
});

test('runtime marker rejects substituted persona, capabilities, organization, workspace, and lineage', () => {
  const validated = validateEvidenceContract(root, baseline(), { baseGitSha });
  for (const mutate of [
    context => { context.persona.id = 'substituted-persona'; },
    context => { context.persona.capabilities = []; },
    context => { context.organizationId = 'substituted-organization'; },
    context => { context.workspaceId = 'substituted-workspace'; },
    context => { context.lineage = { substituted: true }; },
  ]) {
    const markers = emittedForCommand(validated, 'pr-b-api');
    mutate(markers[0].runtimeContext);
    assert.throws(() => validateCommandMarkers(validated, 'pr-b-api', markers), /PR_B_RUNTIME_/u);
  }
});

test('performance evidence gates the median while retaining bounded individual samples', () => {
  const validated = validateEvidenceContract(root, baseline(), { baseGitSha });
  const markers = emittedForCommand(validated, 'pr-b-performance').map(marker => ({
    ...marker,
    runtimeContext: materializeRuntimeMatchers(marker.runtimeContext),
  }));
  const desktop = markers.find(item => item.assertionId === 'cached-studio-loaded-governed-projection-under-2500ms-desktop-chrome');
  assert.ok(desktop);
  desktop.runtimeContext.lineage.samplesMs = [2935, 348, 346];
  desktop.runtimeContext.lineage.medianMs = 348;
  assert.doesNotThrow(() => validateCommandMarkers(validated, 'pr-b-performance', markers));

  const medianBreach = clone(markers);
  medianBreach.find(item => item.assertionId === desktop.assertionId).runtimeContext.lineage.medianMs = 2500;
  assert.throws(() => validateCommandMarkers(validated, 'pr-b-performance', medianBreach), /PR_B_RUNTIME_INTEGER_RANGE/u);

  const sampleBeyondTestTimeout = clone(markers);
  sampleBeyondTestTimeout.find(item => item.assertionId === desktop.assertionId).runtimeContext.lineage.samplesMs = [90000, 348, 346];
  assert.throws(() => validateCommandMarkers(validated, 'pr-b-performance', sampleBeyondTestTimeout), /PR_B_RUNTIME_NUMBER_ARRAY_RANGE/u);
});

const postgresTypedMatcherFixture = () => {
  const contract = baseline();
  const assertion = contract.registry.assertions.find(item => item.commandId === 'pr-b-postgres'
    && item.testId === 'MIGRATION-003'
    && item.assertionId === 'POPULATED-LEGACY-BACKFILL-EXACTLY-ONCE');
  assert.ok(assertion);
  const stableHandoffId = assertion.expectedRuntimeContext.lineage.handoff.id;
  assertion.expectedRuntimeContext.lineage.sourcePackage.id = { $uuidV4: true };
  assertion.expectedRuntimeContext.lineage.sourcePackage.hash = { $sha256: true };
  const validated = validateEvidenceContract(root, contract, { skipProvenance: true });
  const markers = emittedForCommand(validated, 'pr-b-postgres').map(marker => ({
    ...marker,
    runtimeContext: materializeRuntimeMatchers(marker.runtimeContext),
  }));
  const marker = markers.find(item => item.testId === assertion.testId && item.assertionId === assertion.assertionId);
  assert.ok(marker);
  return { validated, markers, marker, stableHandoffId };
};

test('PostgreSQL lineage typed matchers accept only valid UUID v4 and SHA-256 leaves while stable authority remains exact', () => {
  const fixture = postgresTypedMatcherFixture();
  assert.doesNotThrow(() => validateCommandMarkers(fixture.validated, 'pr-b-postgres', fixture.markers));
  assert.equal(fixture.marker.runtimeContext.lineage.handoff.id, fixture.stableHandoffId);
  for (const mutate of [
    marker => { marker.runtimeContext.persona.id = 'substituted-persona'; },
    marker => { marker.runtimeContext.persona.capabilities = []; },
    marker => { marker.runtimeContext.organizationId = 'substituted-organization'; },
    marker => { marker.runtimeContext.workspaceId = 'substituted-workspace'; },
    marker => { marker.runtimeContext.lineage.handoff.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; },
  ]) {
    const changed = postgresTypedMatcherFixture();
    mutate(changed.marker);
    assert.throws(() => validateCommandMarkers(changed.validated, 'pr-b-postgres', changed.markers), /PR_B_RUNTIME_/u);
  }
});

test('PostgreSQL lineage typed matchers reject invalid UUID and SHA-256 substitutions', () => {
  for (const mutate of [
    marker => { marker.runtimeContext.lineage.sourcePackage.id = 'not-a-uuid'; },
    marker => { marker.runtimeContext.lineage.sourcePackage.id = 'aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaaa'; },
    marker => { marker.runtimeContext.lineage.sourcePackage.id = 'aaaaaaaa-aaaa-4aaa-7aaa-aaaaaaaaaaaa'; },
    marker => { marker.runtimeContext.lineage.sourcePackage.hash = '0'.repeat(63); },
    marker => { marker.runtimeContext.lineage.sourcePackage.hash = 'G'.repeat(64); },
  ]) {
    const changed = postgresTypedMatcherFixture();
    mutate(changed.marker);
    assert.throws(() => validateCommandMarkers(changed.validated, 'pr-b-postgres', changed.markers), /PR_B_RUNTIME_(?:UUID_V4|SHA256)/u);
  }
});

test('runtime contract rejects malformed, unknown, root, authority, and non-PostgreSQL UUID/SHA matcher placement', () => {
  const mutatePostgresMatcher = value => {
    const contract = baseline();
    const assertion = contract.registry.assertions.find(item => item.commandId === 'pr-b-postgres' && item.testId === 'MIGRATION-003');
    assert.ok(assertion);
    assertion.expectedRuntimeContext.lineage.sourcePackage.id = value;
    return contract;
  };
  for (const [contract, code] of [
    [mutatePostgresMatcher({ $uuidV4: true, extra: true }), /PR_B_RUNTIME_MATCHER_SHAPE/u],
    [mutatePostgresMatcher({ $uuidV4: false }), /PR_B_RUNTIME_MATCHER_VALUE/u],
    [mutatePostgresMatcher({ $sha256: 'yes' }), /PR_B_RUNTIME_MATCHER_VALUE/u],
    [mutatePostgresMatcher({ $anything: true }), /PR_B_RUNTIME_MATCHER_UNKNOWN/u],
  ]) assert.throws(() => validateEvidenceContract(root, contract, { skipProvenance: true }), code);

  const rootMatcher = baseline();
  const postgres = rootMatcher.registry.assertions.find(item => item.commandId === 'pr-b-postgres');
  assert.ok(postgres);
  postgres.expectedRuntimeContext.lineage = { $uuidV4: true };
  assert.throws(() => validateEvidenceContract(root, rootMatcher, { skipProvenance: true }), /PR_B_RUNTIME_MATCHER_PLACEMENT/u);

  const authorityMatcher = baseline();
  const authorityAssertion = authorityMatcher.registry.assertions.find(item => item.commandId === 'pr-b-postgres');
  assert.ok(authorityAssertion);
  authorityAssertion.expectedRuntimeContext.organizationId = { $uuidV4: true };
  assert.throws(() => validateEvidenceContract(root, authorityMatcher, { skipProvenance: true }), /PR_B_RUNTIME_ORGANIZATION/u);

  const apiMatcher = baseline();
  const apiAssertion = apiMatcher.registry.assertions.find(item => item.commandId === 'pr-b-api');
  assert.ok(apiAssertion);
  apiAssertion.expectedRuntimeContext.lineage.syntheticDatabaseId = { $uuidV4: true };
  assert.throws(() => validateEvidenceContract(root, apiMatcher, { skipProvenance: true }), /PR_B_RUNTIME_MATCHER_COMMAND/u);
});

test('sanitization rejects raw credentials, database URLs, provider payloads, and signed URLs', () => {
  for (const unsafe of [
    'Bearer synthetic-but-forbidden',
    'postgresql://user:password@localhost/db',
    'sk-thisMustNeverEnterEvidence',
    'rawProviderPayload',
    'https://storage.invalid/file?X-Amz-Signature=abc',
  ]) assert.throws(() => assertSanitized(unsafe, 'adversarial'), /PR_B_UNSANITIZED/u);
});

const cardinalityFixture = validated => {
  const passed = validated.registry.assertions.map(item => ({
    result: 'passed',
    command: { id: item.commandId },
    testId: item.testId,
    assertion: { marker: { testId: item.testId, assertionId: item.assertionId, fixture: item.fixture, result: 'passed' } },
  }));
  const notRun = validated.registry.notRun.map(item => ({ result: 'not_run', testId: item.testId }));
  return { results: [...passed, ...notRun], manifest: { assertionCount: passed.length + notRun.length } };
};

test('independent cardinality rejects duplicate or missing passed and not-run evidence', () => {
  const validated = validateEvidenceContract(root, baseline(), { baseGitSha });
  const duplicate = cardinalityFixture(validated);
  duplicate.results.splice(1, 1, clone(duplicate.results[0]));
  assert.throws(() => validateEvidenceResultCardinality(duplicate.results, duplicate.manifest, validated), /PR_B_PASSED_EVIDENCE_DUPLICATE/u);
  const missing = cardinalityFixture(validated);
  missing.results.pop();
  assert.throws(() => validateEvidenceResultCardinality(missing.results, missing.manifest, validated), /PR_B_NOT_RUN_EVIDENCE_EXACT_SET/u);
});

test('source provenance rejects omitted and substituted source digests', () => {
  const contract = baseline();
  const omitted = clone(contract.provenance);
  delete omitted.sourceDigests[Object.keys(omitted.sourceDigests)[0]];
  assert.throws(() => validatePrBProvenance(root, baseGitSha, contract.registry, omitted), /PR_B_PROVENANCE_FILE_SET/u);
  const substituted = clone(contract.provenance);
  const source = Object.keys(substituted.sourceDigests)[0];
  substituted.sourceDigests[source] = `sha256:${'0'.repeat(64)}`;
  assert.throws(() => validatePrBProvenance(root, baseGitSha, contract.registry, substituted), /PR_B_PROVENANCE_HASH/u);
});

test('Studio PR B cache, Playwright output, and retained command outputs are rooted outside the repository', () => {
  const config = readFileSync(path.join(root, 'vite.studio-pr-b.config.ts'), 'utf8');
  assert.match(config, /import \{ tmpdir \} from 'node:os';/u);
  assert.match(config, /cacheDir:\s*path\.join\(tmpdir\(\), 'avalaos-studio-pr-b-vite-cache'\)/u);
  assert.doesNotMatch(config, /process\.env\.TEMP\s*\|\|\s*process\.cwd\(\)/u);

  const playwright = readFileSync(path.join(root, 'playwright.studio-pr-b.config.ts'), 'utf8');
  assert.match(playwright, /import \{ tmpdir \} from 'node:os';/u);
  assert.match(playwright, /outputDir:\s*path\.join\(tmpdir\(\),\s*'avalaos-studio-pr-b-playwright'/u);
  assert.doesNotMatch(playwright, /process\.env\.TEMP\s*\|\|\s*process\.cwd\(\)/u);

  const runner = readFileSync(path.join(root, 'scripts', 'runTranscriptFlowPrBEvidence.mjs'), 'utf8');
  assert.match(runner, /import \{ tmpdir \} from 'node:os';/u);
  assert.match(runner, /const commandTempDir = path\.resolve\(tmpdir\(\)\);/u);
  assert.match(runner, /throw new Error\('PR_B_COMMAND_TEMP_INSIDE_REPOSITORY'\);/u);
  for (const variable of ['TEMP', 'TMP', 'TMPDIR']) {
    assert.match(runner, new RegExp(`${variable}:\\s*commandTempDir`, 'u'));
  }
});

test('PR B evidence runner removes only disposable compiler output before provenance inspection', () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'pr-b-evidence-runner-cleanup-'));
  try {
    const generated = PR_B_EVIDENCE_COMPILER_OUTPUTS.map(relative => path.join(temporaryRoot, relative));
    const sibling = path.join(temporaryRoot, '.agent', 'pre-existing-state');
    for (const directory of generated) mkdirSync(directory, { recursive: true });
    mkdirSync(sibling, { recursive: true });
    for (const directory of generated) {
      const generatedFile = path.join(directory, 'compiler-artifact.js');
      writeFileSync(generatedFile, 'generated');
      chmodSync(generatedFile, 0o444);
    }
    writeFileSync(path.join(sibling, 'sentinel.txt'), 'preserve');

    assert.equal(cleanupPrBEvidenceCompilerOutput(temporaryRoot), true);
    for (const directory of generated) assert.equal(existsSync(directory), false);
    assert.equal(existsSync(path.join(sibling, 'sentinel.txt')), true);
    const provenanceCandidates = [
      '.agent/pre-existing-state/sentinel.txt',
    ].filter(relative => existsSync(path.join(temporaryRoot, relative)));
    assert.equal(provenanceCandidates.some(relative => relative.startsWith(`${PR_B_EVIDENCE_COMPILER_OUTPUT}/`)), false);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

const seedRejectedCleanupTree = temporaryRoot => {
  const targets = PR_B_EVIDENCE_COMPILER_OUTPUTS.map(relative => path.join(temporaryRoot, relative));
  for (const target of targets) {
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, 'preserve-sentinel.txt'), 'preserve');
  }
  const outside = path.join(temporaryRoot, 'outside-preserved');
  mkdirSync(outside, { recursive: true });
  writeFileSync(path.join(outside, 'outside-sentinel.txt'), 'preserve');
  return { targets, outside };
};

const assertRejectedCleanupPreserved = ({ targets, outside }, additionalOutside = []) => {
  for (const target of targets) {
    assert.equal(existsSync(target), true);
    assert.equal(existsSync(path.join(target, 'preserve-sentinel.txt')), true);
  }
  assert.equal(existsSync(path.join(outside, 'outside-sentinel.txt')), true);
  for (const sentinel of additionalOutside) assert.equal(existsSync(sentinel), true);
};

const directoryLinkType = process.platform === 'win32' ? 'junction' : 'dir';

test('PR B evidence runner rejects an .agent junction or symlink without deleting targets or outside state', () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'pr-b-evidence-agent-link-'));
  try {
    const linkedAgent = path.join(temporaryRoot, 'linked-agent');
    mkdirSync(linkedAgent, { recursive: true });
    symlinkSync(linkedAgent, path.join(temporaryRoot, '.agent'), directoryLinkType);
    const seeded = seedRejectedCleanupTree(temporaryRoot);
    assert.throws(() => cleanupPrBEvidenceCompilerOutput(temporaryRoot), /PR_B_TEMP_CLEANUP_AGENT_LINK/u);
    assertRejectedCleanupPreserved(seeded);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('PR B evidence runner rejects an allowlisted target junction or symlink without deleting any target', () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'pr-b-evidence-target-link-'));
  try {
    const seeded = seedRejectedCleanupTree(temporaryRoot);
    const target = seeded.targets.at(-1);
    rmSync(target, { recursive: true, force: true });
    writeFileSync(path.join(seeded.outside, 'preserve-sentinel.txt'), 'preserve');
    symlinkSync(seeded.outside, target, directoryLinkType);
    assert.throws(() => cleanupPrBEvidenceCompilerOutput(temporaryRoot), /PR_B_TEMP_CLEANUP_TARGET_LINK/u);
    assertRejectedCleanupPreserved(seeded);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('PR B evidence runner rejects a nested link and preserves every target and outside sentinel', () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'pr-b-evidence-nested-link-'));
  try {
    const seeded = seedRejectedCleanupTree(temporaryRoot);
    symlinkSync(seeded.outside, path.join(seeded.targets.at(-1), 'nested-link'), directoryLinkType);
    assert.throws(() => cleanupPrBEvidenceCompilerOutput(temporaryRoot), /PR_B_TEMP_CLEANUP_NESTED_LINK/u);
    assertRejectedCleanupPreserved(seeded);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('PR B evidence runner rejects a hardlink and preserves every target and outside sentinel', () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'pr-b-evidence-hardlink-'));
  try {
    const seeded = seedRejectedCleanupTree(temporaryRoot);
    const outsideHardlink = path.join(seeded.outside, 'outside-hardlink-sentinel.txt');
    writeFileSync(outsideHardlink, 'preserve');
    linkSync(outsideHardlink, path.join(seeded.targets.at(-1), 'compiler-hardlink.js'));
    assert.throws(() => cleanupPrBEvidenceCompilerOutput(temporaryRoot), /PR_B_TEMP_CLEANUP_HARDLINK/u);
    assertRejectedCleanupPreserved(seeded, [outsideHardlink]);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('PR B evidence runner rejects a deterministic realpath escape and preserves all state', () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'pr-b-evidence-realpath-escape-'));
  try {
    const seeded = seedRejectedCleanupTree(temporaryRoot);
    const escapedTarget = path.resolve(seeded.targets.at(-1));
    const escapedRealpath = path.resolve(seeded.outside, 'escaped-target');
    const cleanupWithInjectedRealpath = createPrBEvidenceCompilerOutputCleanup({
      chmodSync,
      existsSync,
      lstatSync,
      readdirSync,
      realpathSync: value => path.resolve(value) === escapedTarget ? escapedRealpath : realpathSync(value),
      rmSync,
    });
    assert.throws(() => cleanupWithInjectedRealpath(temporaryRoot), /PR_B_TEMP_CLEANUP_REALPATH/u);
    assertRejectedCleanupPreserved(seeded);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('PR B evidence runner rejects tracked paths outside the exact allowlist and preserves all state', () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'pr-b-evidence-tracked-scope-'));
  try {
    const seeded = seedRejectedCleanupTree(temporaryRoot);
    assert.throws(
      () => cleanupPrBEvidenceCompilerOutput(temporaryRoot, ['docs/outside-allowlist.txt']),
      /PR_B_TEMP_CLEANUP_TRACKED_SCOPE/u,
    );
    assertRejectedCleanupPreserved(seeded);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('PR B evidence runner refuses to delete tracked state in its exact compiler-output path', () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'pr-b-evidence-runner-tracked-'));
  try {
    const generated = path.join(temporaryRoot, PR_B_EVIDENCE_COMPILER_OUTPUT);
    const tracked = `${PR_B_EVIDENCE_COMPILER_OUTPUT}/tracked-sentinel.js`;
    mkdirSync(generated, { recursive: true });
    writeFileSync(path.join(temporaryRoot, tracked), 'preserve');
    assert.throws(
      () => cleanupPrBEvidenceCompilerOutput(temporaryRoot, [tracked]),
      /PR_B_TEMP_CLEANUP_TRACKED_STATE/u,
    );
    assert.equal(existsSync(path.join(temporaryRoot, tracked)), true);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
