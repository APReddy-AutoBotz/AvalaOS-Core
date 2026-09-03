import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runtimeContextMatches, validatePrCRegistryStructure } from './transcriptFlowPrCEvidenceContract.mjs';
import { collectChangedPrCFiles, PR_C_BASE_SHA, PR_C_WORKFLOW_PATH } from './transcriptFlowPrCEvidenceScope.mjs';

const requiredIds = [
  ...Array.from({ length: 6 }, (_, index) => `DELIVERY-TR-00${index + 1}`),
  ...Array.from({ length: 4 }, (_, index) => `MONITOR-TR-00${index + 1}`),
  'PATH-003', 'PATH-004',
  ...Array.from({ length: 8 }, (_, index) => `HANDOFF-00${index + 1}`),
  'PERF-001', 'PERF-002-B',
];
const notRunIds = [
  'PERF-003', 'PERF-004', 'CONTROLLED-HUMAN', 'EXACT-HEAD-GITHUB-CI', 'NETLIFY-HOSTED-PREVIEW',
  'REAL-PROVIDER-VERIFICATION', 'DEPLOYMENT-VERIFICATION',
  'SECURITY-CERTIFICATION', 'COMPLIANCE-CERTIFICATION',
];

const personaCatalog = JSON.parse(readFileSync('testing/process-lifecycle/fixtures/delivery-monitor-pr-c/personas.json', 'utf8'));
const canonicalRegistry = JSON.parse(readFileSync('testing/process-lifecycle/contracts/pr-c-assertion-registry.json', 'utf8'));
const requiredPersonas = personaCatalog.personas.filter(persona => persona.evidenceRequired);
const governedWorkspace = personaCatalog.workspaces.find(workspace => workspace.key === 'governed-delivery');

const runtime = (testId, index) => ({
  persona: {
    id: requiredPersonas[index % requiredPersonas.length].id,
    state: requiredPersonas[index % requiredPersonas.length].state,
    capabilities: requiredPersonas[index % requiredPersonas.length].capabilities,
  },
  organizationId: governedWorkspace.organizationId,
  workspaceId: governedWorkspace.id,
  ...(testId.startsWith('HANDOFF-') ? { edge: 'studio_to_delivery' } : {}),
  ...(testId === 'PERF-002-B' ? { performance: { sampleCount: 20, itemCount: 250, budgetMs: 200 } } : {}),
});

const makeContract = () => ({
  registry: {
    contractVersion: 'governed-delivery-monitor-pr-c-registry-2',
    workflowPath: PR_C_WORKFLOW_PATH,
    provenancePath: 'testing/process-lifecycle/contracts/pr-c-source-provenance.json',
    fixtureRegistryPath: 'testing/process-lifecycle/fixtures/delivery-monitor-pr-c/fixture-registry.json',
    personasRegistryPath: 'testing/process-lifecycle/fixtures/delivery-monitor-pr-c/personas.json',
    commands: [{ id: 'focused', command: 'npm run test:focused', environment: 'controlled-node-22' }],
    owners: {
      domain: { path: 'services/deliveryMonitor/workspaceModel.test.ts', sha256: 'a'.repeat(64) },
      boundary: { path: 'docs/quality/governed-delivery-monitor-pr-c-evidence.md', sha256: 'b'.repeat(64) },
    },
    assertions: requiredIds.map((testId, index) => ({
      commandId: 'focused', owner: 'domain', testId,
      assertionId: `assertion-${index + 1}`, fixture: `FIXTURE-${index + 1}`,
      testName: `${testId} causal assertion`,
      expectedRuntimeContext: runtime(testId, index),
    })),
    notRun: notRunIds.map(testId => ({
      testId, owner: 'boundary', testName: `${testId} explicit boundary`, command: null,
      reason: `${testId} remains outside the executed PR C evidence boundary.`,
      applicableExecutionClassifications: testId === 'EXACT-HEAD-GITHUB-CI'
        ? ['local_candidate']
        : ['github_candidate', 'local_candidate'],
    })),
  },
  provenance: {
    contractVersion: 'governed-delivery-monitor-pr-c-provenance-1',
    acceptedMainBaseline: PR_C_BASE_SHA,
    sourceDigests: {},
  },
});

const validates = value => validatePrCRegistryStructure(process.cwd(), value.registry, value.provenance, { verifyDigests: false });

test('accepts a complete assertion-owned PR C boundary', () => {
  const contract = makeContract();
  assert.deepEqual(validates(contract), {
    commandCount: 1,
    assertionCount: requiredIds.length,
    ownerCount: 2,
    notRunCount: notRunIds.length,
    personaCount: personaCatalog.personas.length,
    requiredPersonaCount: requiredPersonas.length,
  });
});

test('rejects a missing required Test ID', () => {
  const contract = makeContract();
  contract.registry.assertions.shift();
  assert.throws(() => validates(contract), /PR_C_TEST_ID_UNOWNED:DELIVERY-TR-001/u);
});

test('rejects a duplicate causal assertion', () => {
  const contract = makeContract();
  contract.registry.assertions.push(structuredClone(contract.registry.assertions[0]));
  assert.throws(() => validates(contract), /PR_C_ASSERTION_DUPLICATE/u);
});

test('rejects an inferred Assess-to-Studio marker for the PR C edge', () => {
  const contract = makeContract();
  contract.registry.assertions.find(item => item.testId === 'HANDOFF-001').expectedRuntimeContext.edge = 'assess_to_studio';
  assert.throws(() => validates(contract), /PR_C_HANDOFF_EDGE/u);
});

test('rejects substituted PERF-002-B measurement parameters', () => {
  const contract = makeContract();
  contract.registry.assertions.find(item => item.testId === 'PERF-002-B').expectedRuntimeContext.performance.sampleCount = 19;
  assert.throws(() => validates(contract), /PR_C_PERF_CONTEXT/u);
});

test('rejects a missing explicit not-run boundary', () => {
  const contract = makeContract();
  contract.registry.notRun.pop();
  assert.throws(() => validates(contract), /PR_C_NOT_RUN_BOUNDARY/u);
});

test('rejects a command attached to a not-run result', () => {
  const contract = makeContract();
  contract.registry.notRun[0].command = 'npm test';
  assert.throws(() => validates(contract), /PR_C_NOT_RUN_COMMAND/u);
});

test('rejects GitHub exact-head or hosted-preview not-run scope substitution', () => {
  const contract = makeContract();
  contract.registry.notRun.find(item => item.testId === 'EXACT-HEAD-GITHUB-CI').applicableExecutionClassifications = ['github_candidate', 'local_candidate'];
  assert.throws(() => validates(contract), /PR_C_EXACT_HEAD_NOT_RUN_SCOPE/u);
  const preview = makeContract();
  preview.registry.notRun.find(item => item.testId === 'NETLIFY-HOSTED-PREVIEW').applicableExecutionClassifications = ['local_candidate'];
  assert.throws(() => validates(preview), /PR_C_PREVIEW_NOT_RUN_SCOPE/u);
});

test('rejects a live or deployment mutation command', () => {
  const contract = makeContract();
  contract.registry.commands[0].command = 'supabase db push';
  assert.throws(() => validates(contract), /PR_C_LIVE_COMMAND_FORBIDDEN/u);
});

test('rejects missing tenant runtime context', () => {
  const contract = makeContract();
  delete contract.registry.assertions[0].expectedRuntimeContext.workspaceId;
  assert.throws(() => validates(contract), /PR_C_ASSERTION_WORKSPACE/u);
});

test('rejects an unknown or unsorted persona capability', () => {
  const contract = makeContract();
  contract.registry.assertions[0].expectedRuntimeContext.persona.capabilities = ['project.read', 'delivery.handoff.request'];
  assert.throws(() => validates(contract), /PR_C_ASSERTION_CAPABILITIES_ORDER/u);
  contract.registry.assertions[0].expectedRuntimeContext.persona.capabilities = ['unknown.capability'];
  assert.throws(() => validates(contract), /PR_C_ASSERTION_CAPABILITY_UNKNOWN/u);
});

test('rejects an unregistered persona or altered canonical state and capabilities', () => {
  const contract = makeContract();
  contract.registry.assertions[0].expectedRuntimeContext.persona.id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  assert.throws(() => validates(contract), /PR_C_ASSERTION_PERSONA_UNREGISTERED/u);

  const changedState = makeContract();
  changedState.registry.assertions[0].expectedRuntimeContext.persona.state = 'revoked';
  assert.throws(() => validates(changedState), /PR_C_ASSERTION_PERSONA_STATE_SUBSTITUTED/u);

  const changedCapabilities = makeContract();
  changedCapabilities.registry.assertions[0].expectedRuntimeContext.persona.capabilities = ['project.read'];
  assert.throws(() => validates(changedCapabilities), /PR_C_ASSERTION_PERSONA_CAPABILITIES_SUBSTITUTED/u);
});

test('rejects partial required-persona coverage', () => {
  const contract = makeContract();
  const missing = requiredPersonas.at(-1);
  const replacement = requiredPersonas[0];
  for (const assertion of contract.registry.assertions) {
    if (assertion.expectedRuntimeContext.persona.id === missing.id) {
      assertion.expectedRuntimeContext.persona = { id: replacement.id, state: replacement.state, capabilities: replacement.capabilities };
    }
  }
  assert.throws(() => validates(contract), new RegExp(`PR_C_PERSONA_COVERAGE_MISSING:${missing.id}`, 'u'));
});

test('rejects an unregistered or mismatched fixture scope', () => {
  const contract = makeContract();
  contract.registry.assertions[0].expectedRuntimeContext.workspaceId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  assert.throws(() => validates(contract), /PR_C_ASSERTION_WORKSPACE_UNREGISTERED/u);
  const mismatched = makeContract();
  mismatched.registry.assertions[0].expectedRuntimeContext.organizationId = '20000001-0000-4000-8000-000000000001';
  assert.throws(() => validates(mismatched), /PR_C_ASSERTION_SCOPE_SUBSTITUTED/u);
});

test('rejects a missing persona state', () => {
  const contract = makeContract();
  delete contract.registry.assertions[0].expectedRuntimeContext.persona.state;
  assert.throws(() => validates(contract), /PR_C_ASSERTION_PERSONA_FIELDS/u);
});

test('rejects sensitive evidence keys', () => {
  const contract = makeContract();
  contract.registry.assertions[0].expectedRuntimeContext.api_key = 'redacted-but-forbidden';
  assert.throws(() => validates(contract), /PR_C_EVIDENCE_SENSITIVE_KEY/u);
});

test('rejects a credential-shaped value without misclassifying the risk-register path', () => {
  const contract = makeContract();
  contract.registry.assertions[0].expectedRuntimeContext.providerReference = 'sk-proj-fixture1234567890';
  assert.throws(() => validates(contract), /PR_C_EVIDENCE_SECRET_VALUE/u);
  const safe = makeContract();
  safe.provenance.sourceDigests['docs/quality/gpt-5.6-sol-enterprise-risk-and-evidence-register.md'] = `sha256:${'a'.repeat(64)}`;
  assert.doesNotThrow(() => validates(safe));
});

test('validates canonical participant identities and capabilities', () => {
  const contract = makeContract();
  const participant = requiredPersonas[1];
  contract.registry.assertions[0].expectedRuntimeContext.participants = [{ id: participant.id, state: participant.state, capabilities: participant.capabilities }];
  assert.doesNotThrow(() => validates(contract));
  contract.registry.assertions[0].expectedRuntimeContext.participants[0].capabilities = [];
  assert.throws(() => validates(contract), /PR_C_ASSERTION_PERSONA_CAPABILITIES_SUBSTITUTED/u);
});

test('rejects a substituted accepted baseline', () => {
  const contract = makeContract();
  contract.provenance.acceptedMainBaseline = 'b'.repeat(40);
  assert.throws(() => validates(contract), /PR_C_PROVENANCE_BASE/u);
});

test('rejects an unregistered assertion owner', () => {
  const contract = makeContract();
  contract.registry.assertions[0].owner = 'suite-exit';
  assert.throws(() => validates(contract), /PR_C_ASSERTION_OWNER/u);
});

test('matches dynamic timing evidence only inside its registered budget', () => {
  runtimeContextMatches(
    { sampleCount: 3, samplesMs: [41, 52, 63], medianMs: 52 },
    {
      sampleCount: 3,
      samplesMs: { $numberArray: { length: 3, min: 0, maxExclusive: 2500 } },
      medianMs: { $number: { min: 0, maxExclusive: 2500 } },
    },
  );
  assert.throws(() => runtimeContextMatches(
    { sampleCount: 3, samplesMs: [41, 52, 2500], medianMs: 52 },
    {
      sampleCount: 3,
      samplesMs: { $numberArray: { length: 3, min: 0, maxExclusive: 2500 } },
      medianMs: { $number: { min: 0, maxExclusive: 2500 } },
    },
  ), /PR_C_RUNTIME_NUMBER_ARRAY_RANGE/u);
  runtimeContextMatches([0, 4.25, 19], { $finiteNonNegativeArray: { length: 3 } });
  runtimeContextMatches(31.5, { $finiteNonNegative: true });
  assert.throws(() => runtimeContextMatches(-1, { $finiteNonNegative: true }), /PR_C_RUNTIME_FINITE_NONNEGATIVE/u);
});

test('matches generated PostgreSQL identifiers and digests by type without accepting malformed substitutions', () => {
  runtimeContextMatches('f98d6c13-f68d-49cd-ac2d-ab6a8b8b2e6b', { $uuid: true });
  runtimeContextMatches('061f89c1ab33f5472a10a6a26f43a4ca39b14167e425482d78b3215627a3791d', { $sha256: true });
  runtimeContextMatches('fulfilled', { $oneOf: ['fulfilled', 'rejected'] });
  runtimeContextMatches('rejected', { $oneOf: ['fulfilled', 'rejected'] });
  assert.throws(() => runtimeContextMatches('not-a-uuid', { $uuid: true }), /PR_C_RUNTIME_UUID/u);
  assert.throws(() => runtimeContextMatches('0'.repeat(63), { $sha256: true }), /PR_C_RUNTIME_SHA256/u);
  assert.throws(() => runtimeContextMatches('pending', { $oneOf: ['fulfilled', 'rejected'] }), /PR_C_RUNTIME_ONE_OF/u);
  assert.throws(() => runtimeContextMatches('fulfilled', { $oneOf: ['fulfilled', 'fulfilled'] }), /PR_C_RUNTIME_ONE_OF_DUPLICATE/u);
});

test('accepts either exact eligible PostgreSQL receipt winner and rejects substitutions', () => {
  const assertion = canonicalRegistry.assertions.find(candidate => (
    candidate.commandId === 'pr-c-postgres'
    && candidate.testId === 'IDEMP-003'
    && candidate.assertionId === 'PG16-CONCURRENT-SAME-KEY-ONE-EFFECT-EQUIVALENT-REPLAY'
  ));
  assert.ok(assertion);
  const eligibleReceiptIds = assertion.expectedRuntimeContext.receipt.eligibleReceiptIds;
  assert.deepEqual(assertion.expectedRuntimeContext.receipt.id, { $oneOf: eligibleReceiptIds });
  for (const receiptId of eligibleReceiptIds) runtimeContextMatches(receiptId, assertion.expectedRuntimeContext.receipt.id);
  assert.throws(
    () => runtimeContextMatches('96000000-0000-4000-8000-000000009999', assertion.expectedRuntimeContext.receipt.id),
    /PR_C_RUNTIME_ONE_OF/u,
  );
});

test('fails closed when governed base-tracked source is deleted or renamed', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'avalaos-pr-c-scope-'));
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  try {
    git(['init', '--quiet']);
    git(['config', 'user.email', 'pr-c-evidence@example.invalid']);
    git(['config', 'user.name', 'PR C evidence test']);
    writeFileSync(path.join(root, 'delete-me.txt'), 'base deletion fixture\n', 'utf8');
    writeFileSync(path.join(root, 'rename-me.txt'), 'base rename fixture\n', 'utf8');
    git(['add', 'delete-me.txt', 'rename-me.txt']);
    git(['commit', '--quiet', '-m', 'base fixtures']);
    const baseGitSha = git(['rev-parse', 'HEAD']);

    rmSync(path.join(root, 'delete-me.txt'));
    assert.throws(
      () => collectChangedPrCFiles(root, baseGitSha),
      /PR_C_SCOPED_DELETION_UNSUPPORTED:.*delete-me\.txt/u,
    );

    writeFileSync(path.join(root, 'delete-me.txt'), 'base deletion fixture\n', 'utf8');
    renameSync(path.join(root, 'rename-me.txt'), path.join(root, 'renamed.txt'));
    assert.throws(
      () => collectChangedPrCFiles(root, baseGitSha),
      /PR_C_SCOPED_DELETION_UNSUPPORTED:.*rename-me\.txt/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
