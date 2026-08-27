import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  calculatePrAWorkingTreeDigest, collectPrAProvenanceFiles,
} from './transcriptFlowEvidenceScope.mjs';
import {
  assertRuntimeContextDigest, canonicalSourceSha256, loadEvidenceContract, validateEvidenceContract, validateProvenance, validateCommandMarkers,
  validateEvidenceDirectory, validateEvidenceResultCardinality, runtimeContextSha256, parseExactMarkers,
} from './transcriptFlowEvidenceContract.mjs';

const root = process.cwd();
const clone = value => structuredClone(value);
const baseline = () => loadEvidenceContract(root);

test('registry binds every canonical Test ID to an exact command, owner hash, scenario, fixture, and complete persona', () => {
  const validated = validateEvidenceContract(root);
  assert.equal(validated.registry.commands.length, 33);
  assert.equal(validated.assertions.length > 100, true);
});

test('registry rejects dead fixtures and missing scenario fixtures', () => {
  const dead = baseline();
  dead.fixtures.fixtures.push({ id: 'dead-fixture', path: 'testing/process-lifecycle/fixtures/sources/assess/ASSESS-CLEAN-01.vtt' });
  assert.throws(() => validateEvidenceContract(root, dead), /PR_A_FIXTURE_DEAD:dead-fixture/u);
  const missing = baseline(); missing.scenarios.scenarios[0].fixtureIds.push('missing-fixture');
  assert.throws(() => validateEvidenceContract(root, missing), /PR_A_SCENARIO_FIXTURE_MISSING/u);
});

test('registry rejects partial personas and cross-organization workspace assignments', () => {
  const partial = baseline(); delete partial.identities.personas[0].capabilities;
  assert.throws(() => validateEvidenceContract(root, partial), /PR_A_PERSONA_CAPABILITIES/u);
  const crossed = baseline(); crossed.identities.personas[0].workspaceId = '30000000-0000-4000-8000-000000000001';
  assert.throws(() => validateEvidenceContract(root, crossed), /PR_A_PERSONA_WORKSPACE/u);
});

test('registry validates persona capabilities against the ordered canonical migration inventory', () => {
  const unknown = baseline(); unknown.identities.personas[0].capabilities.push('transcript.sources.write'); unknown.identities.personas[0].capabilities.sort();
  assert.throws(() => validateEvidenceContract(root, unknown), /PR_A_PERSONA_CAPABILITY_UNKNOWN/u);
  const duplicate = baseline(); duplicate.identities.personas[0].capabilities.push(duplicate.identities.personas[0].capabilities.at(-1));
  assert.throws(() => validateEvidenceContract(root, duplicate), /PR_A_PERSONA_CAPABILITIES_ORDER/u);
  const unsorted = baseline(); unsorted.identities.personas[0].capabilities.reverse();
  assert.throws(() => validateEvidenceContract(root, unsorted), /PR_A_PERSONA_CAPABILITIES_ORDER/u);
});

test('registry rejects duplicate assertion ownership and duplicate Test-ID marker ownership', () => {
  const duplicate = baseline(); duplicate.assertions.push(clone(duplicate.assertions[0]));
  assert.throws(() => validateEvidenceContract(root, duplicate), /PR_A_ASSERTION_DUPLICATE/u);
});

test('registry rejects fake owner paths and substituted owner hashes', () => {
  const fakePath = baseline(); fakePath.owners.browser.path = 'tests/browser/not-real.spec.ts';
  assert.throws(() => validateEvidenceContract(root, fakePath), /PR_A_OWNER_PATH/u);
  const fakeHash = baseline(); fakeHash.owners.browser.sha256 = '0'.repeat(64);
  assert.throws(() => validateEvidenceContract(root, fakeHash), /PR_A_OWNER_HASH/u);
});

test('independent command source contract rejects a substituted canonical command', () => {
  const substituted = baseline(); substituted.registry.commands[0].command = 'npm run build';
  assert.throws(() => validateEvidenceContract(root, substituted), /PR_A_COMMAND_SOURCE_CONTRACT|PR_A_COMMAND_DUPLICATE_STRING/u);
});

test('provenance rejects omitted and fake-hash PR-A sources, including the forward migration', () => {
  const baseGitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const provenance = JSON.parse(readFileSync(path.join(root, 'tests/acceptance/source-provenance.json'), 'utf8'));
  for (const file of collectPrAProvenanceFiles(root)) provenance.sourceDigests[file] = `sha256:${canonicalSourceSha256(path.join(root, file))}`;
  const omitted = clone(provenance); delete omitted.sourceDigests['supabase/migrations/20260826151538_governed_transcript_authority_forward_fix.sql'];
  assert.throws(() => validateProvenance(root, baseGitSha, omitted), /PR_A_PROVENANCE_MISSING/u);
  const fake = clone(provenance); fake.sourceDigests['tests/browser/transcriptFlowPrA.spec.ts'] = `sha256:${'0'.repeat(64)}`;
  assert.throws(() => validateProvenance(root, baseGitSha, fake), /PR_A_PROVENANCE_HASH/u);
});

test('successful exit cannot replace exact registered assertion markers', () => {
  const validated = validateEvidenceContract(root);
  assert.throws(() => validateCommandMarkers(validated, 'pr-a-performance', []), /PR_A_MARKER_MISSING/u);
  assert.throws(() => validateCommandMarkers(validated, 'pr-a-performance', [{ testId: 'PERF-002-A', assertionId: 'fabricated', fixture: 'browser-chromium-desktop', result: 'passed', runtimeContext: {} }]), /PR_A_MARKER_UNREGISTERED/u);
});

const emittedMarker = (validated, commandId, testId) => {
  const item = validated.assertions.find(assertion => assertion.commandId === commandId && assertion.marker.testId === testId);
  assert.ok(item);
  return { ...item.marker, runtimeContext: clone(item.expectedRuntimeContext) };
};

test('runtime markers reject substituted persona, capabilities, organization, workspace, and executed lineage', () => {
  const validated = validateEvidenceContract(root);
  for (const [label, mutate] of [
    ['persona', context => { context.persona.id = '10000000-0000-4000-8000-000000000004'; }],
    ['capability', context => { context.persona.capabilities = []; }],
    ['organization', context => { context.organizationId = '20000000-0000-4000-8000-000000000001'; }],
    ['workspace', context => { context.workspaceId = '30000000-0000-4000-8000-000000000001'; }],
    ['lineage', context => { context.lineage.sourceVersionSelectors = ['ffffffff-ffff-4fff-8fff-ffffffffffff']; }],
  ]) {
    const marker = emittedMarker(validated, 'pr-a-api', 'AUTH-001'); mutate(marker.runtimeContext);
    assert.throws(() => validateCommandMarkers(validated, 'pr-a-api', [marker]), /PR_A_RUNTIME_/u, label);
  }
});

test('runtime-context digest rejects a static or substituted context', () => {
  const validated = validateEvidenceContract(root);
  const marker = emittedMarker(validated, 'pr-a-api', 'AUTH-001');
  const digest = runtimeContextSha256(marker.runtimeContext);
  marker.runtimeContext.lineage.sourceVersionSelectors = [];
  assert.throws(() => assertRuntimeContextDigest(marker.runtimeContext, digest, 'adversarial'), /PR_A_RUNTIME_CONTEXT_DIGEST/u);
});

test('provider producer emits executed persona, capability, and tenant substitutions so governed evidence rejects static context', () => {
  const substituted = {
    personaId: '10000000-0000-4000-8000-000000000006',
    organizationId: '20000000-0000-4000-8000-000000000001',
    workspaceId: '30000000-0000-4000-8000-000000000001',
    capabilities: ['evidence.write'],
  };
  const output = execFileSync(process.execPath, [
    'scripts/runEnterpriseIntelligenceTest.mjs',
    'supabase/functions/deno.d.ts',
    'services/enterpriseIntelligence.ts',
    'supabase/functions/_shared/enterpriseIntelligenceAi.ts',
    'supabase/functions/_shared/enterpriseIntelligenceAi.test.ts',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PR_A_RUNTIME_TEST_PERSONA_ID: substituted.personaId,
      PR_A_RUNTIME_TEST_ORGANIZATION_ID: substituted.organizationId,
      PR_A_RUNTIME_TEST_WORKSPACE_ID: substituted.workspaceId,
      PR_A_RUNTIME_TEST_PERSONA_CAPABILITIES: substituted.capabilities.join(','),
    },
  });
  const markers = parseExactMarkers(output);
  assert.ok(markers.length > 0);
  for (const marker of markers) {
    assert.deepEqual(marker.runtimeContext.persona, {
      id: substituted.personaId, state: 'active', capabilities: substituted.capabilities,
    });
    assert.equal(marker.runtimeContext.organizationId, substituted.organizationId);
    assert.equal(marker.runtimeContext.workspaceId, substituted.workspaceId);
  }
  const validated = validateEvidenceContract(root);
  assert.throws(() => validateCommandMarkers(validated, 'pr-a-provider', markers), /PR_A_RUNTIME_/u);
});

test('PostgreSQL executed lineage rejects a different valid UUID, not just a malformed shape', () => {
  const validated = validateEvidenceContract(root);
  const marker = emittedMarker(validated, 'pr-a-postgres', 'SRCSET-001');
  marker.runtimeContext.lineage.sourceSets[0].versionSelector = '96000000-0000-4000-8000-999999999999';
  assert.throws(() => validateCommandMarkers(validated, 'pr-a-postgres', [marker]), /PR_A_RUNTIME_CONTEXT_MISMATCH/u);
});

test('browser default-off evidence rejects a substituted all-capability or full-lineage runtime context', () => {
  const validated = validateEvidenceContract(root);
  const defaultRegistered = validated.assertions.find(item => item.commandId === 'pr-a-browser'
    && item.marker.testId === 'A11Y-003' && item.marker.assertionId.startsWith('default-off-boundary'));
  assert.ok(defaultRegistered);
  const defaultOff = { ...defaultRegistered.marker, runtimeContext: clone(defaultRegistered.expectedRuntimeContext) };
  const enabled = validated.assertions.find(item => item.commandId === 'pr-a-browser'
    && item.marker.assertionId.startsWith('exact-lineage-conflict-replay') && item.marker.fixture === defaultOff.fixture);
  assert.ok(enabled);

  const allCapabilities = clone(defaultOff);
  allCapabilities.runtimeContext.persona.capabilities = clone(enabled.expectedRuntimeContext.persona.capabilities);
  assert.throws(() => validateCommandMarkers(validated, 'pr-a-browser', [allCapabilities]), /PR_A_RUNTIME_CONTEXT_MISMATCH/u);

  const fullLineage = clone(defaultOff);
  fullLineage.runtimeContext.lineage = clone(enabled.expectedRuntimeContext.lineage);
  assert.throws(() => validateCommandMarkers(validated, 'pr-a-browser', [fullLineage]), /PR_A_RUNTIME_CONTEXT_MISMATCH/u);
});

test('AUTH assertions are API-owned exact markers and a green API exit cannot replace a missing assertion', () => {
  const validated = validateEvidenceContract(root);
  const auth = emittedMarker(validated, 'pr-a-api', 'AUTH-001');
  assert.throws(() => validateCommandMarkers(validated, 'pr-a-postgres', [auth]), /PR_A_MARKER_UNREGISTERED/u);
  const unrelated = { ...auth, assertionId: 'unrelated-green-assertion' };
  assert.throws(() => validateCommandMarkers(validated, 'pr-a-api', [unrelated]), /PR_A_MARKER_UNREGISTERED/u);
  const missingOne = ['AUTH-001', 'AUTH-002', 'AUTH-003'].map(testId => emittedMarker(validated, 'pr-a-api', testId));
  assert.throws(() => validateCommandMarkers(validated, 'pr-a-api', missingOne), /PR_A_MARKER_MISSING/u);
});

const cardinalityFixture = validated => {
  const passed = validated.assertions.map(item => ({
    result: 'passed', command: { id: item.commandId }, assertion: { marker: clone(item.marker) }, testId: item.marker.testId,
  }));
  const notRun = validated.registry.notRun.map(item => ({ result: 'not_run', testId: item.testId }));
  return { results: [...passed, ...notRun], manifest: { assertionCount: passed.length + notRun.length } };
};

test('independent verifier rejects duplicate passed evidence keys and duplicate not-run Test IDs', () => {
  const validated = validateEvidenceContract(root);
  const duplicatePass = cardinalityFixture(validated);
  duplicatePass.results.splice(1, 1, clone(duplicatePass.results[0]));
  assert.throws(() => validateEvidenceResultCardinality(duplicatePass.results, duplicatePass.manifest, validated), /PR_A_PASSED_EVIDENCE_DUPLICATE/u);

  const duplicateNotRun = cardinalityFixture(validated);
  duplicateNotRun.results.push(clone(duplicateNotRun.results.at(-1)));
  duplicateNotRun.manifest.assertionCount += 1;
  assert.throws(() => validateEvidenceResultCardinality(duplicateNotRun.results, duplicateNotRun.manifest, validated), /PR_A_NOT_RUN_EVIDENCE_DUPLICATE/u);
});

test('independent verifier rejects passed, not-run, total, and manifest count drift', () => {
  const validated = validateEvidenceContract(root);
  const missingPass = cardinalityFixture(validated);
  missingPass.results.shift();
  assert.throws(() => validateEvidenceResultCardinality(missingPass.results, missingPass.manifest, validated), /PR_A_PASSED_EVIDENCE_COUNT/u);

  const missingNotRun = cardinalityFixture(validated);
  missingNotRun.results.pop();
  assert.throws(() => validateEvidenceResultCardinality(missingNotRun.results, missingNotRun.manifest, validated), /PR_A_NOT_RUN_EVIDENCE_COUNT/u);

  const wrongManifest = cardinalityFixture(validated);
  wrongManifest.manifest.assertionCount -= 1;
  assert.throws(() => validateEvidenceResultCardinality(wrongManifest.results, wrongManifest.manifest, validated), /PR_A_MANIFEST_ASSERTION_COUNT/u);
});

const identityFixture = overrides => {
  const baseGitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const digest = calculatePrAWorkingTreeDigest(root);
  const runAttempt = `mutation-${process.pid}`;
  const directory = path.join(root, 'output', 'process-lifecycle', baseGitSha, digest, runAttempt);
  mkdirSync(directory, { recursive: true });
  const manifest = {
    contractVersion: 'process-lifecycle-pr-a-manifest-3', baseGitSha, headGitSha: baseGitSha, workingTreeDigest: digest, runAttempt,
    workflow: { path: '.github/workflows/transcript-flow-pr-a.yml', runId: 'local', runAttempt }, evidenceFiles: [],
    hostedVerification: 'not_run', realProviderVerification: 'not_run', ...overrides,
  };
  writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(path.join(directory, 'command-results.json'), JSON.stringify({}));
  return { directory, baseGitSha, digest, runAttempt };
};

test('verifier rejects stale workflow attempts and wrong base, head, or scoped digest', () => {
  const first = identityFixture({});
  try {
    assert.throws(() => validateEvidenceDirectory(root, first.directory, { baseGitSha: first.baseGitSha, headGitSha: first.baseGitSha, workingTreeDigest: first.digest, runId: 'local', runAttempt: 'new-attempt' }), /PR_A_WORKFLOW_ATTEMPT_STALE/u);
  } finally { rmSync(first.directory, { recursive: true, force: true }); }
  for (const [field, value, pattern] of [['baseGitSha', '1'.repeat(40), /PR_A_BASE_SHA_MISMATCH/u], ['headGitSha', '2'.repeat(40), /PR_A_HEAD_SHA_MISMATCH/u], ['workingTreeDigest', '3'.repeat(64), /PR_A_TREE_DIGEST_MISMATCH/u]]) {
    const fixture = identityFixture({ [field]: value });
    try { assert.throws(() => validateEvidenceDirectory(root, fixture.directory, { baseGitSha: fixture.baseGitSha, headGitSha: fixture.baseGitSha, workingTreeDigest: fixture.digest }), pattern); }
    finally { rmSync(fixture.directory, { recursive: true, force: true }); }
  }
});

test('verifier rejects fabricated evidence placed in an arbitrary ignored output directory', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'pr-a-fabricated-evidence-'));
  const baseGitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const digest = calculatePrAWorkingTreeDigest(root);
  writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({
    contractVersion: 'process-lifecycle-pr-a-manifest-3', baseGitSha, headGitSha: baseGitSha, workingTreeDigest: digest, runAttempt: 'fabricated',
    workflow: { path: '.github/workflows/transcript-flow-pr-a.yml', runId: 'fake', runAttempt: 'fabricated' }, evidenceFiles: [],
  }));
  writeFileSync(path.join(directory, 'command-results.json'), '{}');
  try { assert.throws(() => validateEvidenceDirectory(root, directory, { baseGitSha, headGitSha: baseGitSha, workingTreeDigest: digest }), /PR_A_EVIDENCE_PATH_UNBOUND/u); }
  finally { rmSync(directory, { recursive: true, force: true }); }
});
