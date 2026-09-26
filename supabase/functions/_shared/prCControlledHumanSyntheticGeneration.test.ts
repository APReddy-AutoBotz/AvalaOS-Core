import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handlePrCControlledHumanSyntheticGeneration,
  parsePrCControlledHumanSyntheticGenerationCommand,
  PR_C_SYNTHETIC_GENERATION_CONTRACT_VERSION,
  type PrCControlledHumanSyntheticGenerationCommand,
} from './prCControlledHumanSyntheticGeneration.ts';

const U = Array.from({ length: 12 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
const releaseSha = 'a'.repeat(40);
const body = {
  contractVersion: PR_C_SYNTHETIC_GENERATION_CONTRACT_VERSION,
  requestId: U[1],
  idempotencyKey: 'pr264:synthetic:generation:one',
  organizationId: U[2],
  workspaceId: U[3],
  authorizationVersion: 7,
  environmentClass: 'hosted_nonproduction_pilot',
  prNumber: 264,
  releaseSha,
  reviewHeadSha: releaseSha,
  deployId: 'b'.repeat(24),
  deployOrigin: 'https://deploy-preview-264--avalaos-pilot.netlify.app',
  exerciseDigest: `sha256:${'c'.repeat(64)}`,
  targetFingerprint: `sha256:${'d'.repeat(64)}`,
  artifactId: U[4],
  sourcePackageId: U[5],
  sourcePackageVersion: 2,
  sourcePackageHash: 'e'.repeat(64),
  expectedAggregateVersion: 3,
  expectedCurrentVersionId: U[6],
  expectedApprovedVersionId: null,
  template: { kind: 'tenant', templateId: U[7], versionId: U[8], version: 4, hash: 'f'.repeat(64) },
};

const result = {
  outcome: 'committed',
  receiptId: U[9],
  resourceId: U[4],
  resource: {
    artifactId: U[4],
    versionId: U[10],
    version: 5,
    sourcePackageId: U[5],
    sourcePackageVersion: 2,
    sourcePackageHash: 'e'.repeat(64),
    templateVersionId: U[8],
    templateVersion: 4,
    templateHash: 'f'.repeat(64),
    generationKind: 'synthetic_controlled_human',
    synthetic: true,
  },
};

const request = (value: unknown, method = 'POST') => new Request('https://function.invalid', {
  method,
  headers: { 'content-type': 'application/json', authorization: 'Bearer redacted-test-token' },
  ...(method === 'POST' ? { body: JSON.stringify(value) } : {}),
});

test('parses only the exact PR 264 synthetic generation envelope and server actor', () => {
  const parsed = parsePrCControlledHumanSyntheticGenerationCommand(body, U[0]);
  assert.equal(parsed.actorId, U[0]);
  assert.equal(parsed.environmentClass, 'hosted_nonproduction_pilot');
  assert.equal(parsed.prNumber, 264);
  assert.deepEqual(parsed.template, body.template);
});

test('commits and returns only the exact synthetic result', async () => {
  let executed: PrCControlledHumanSyntheticGenerationCommand | null = null;
  const response = await handlePrCControlledHumanSyntheticGeneration(request(body), {
    authenticate: async () => ({ id: U[0] }),
    execute: async command => { executed = command; return result; },
  });
  assert.equal(response.status, 201);
  assert.equal(executed?.actorId, U[0]);
  assert.deepEqual(await response.json(), { ok: true, outcome: 'generation_completed', commandOutcome: 'committed', ...result, outcome: 'generation_completed' });
});

test('replay is represented without a second effect', async () => {
  let calls = 0;
  const response = await handlePrCControlledHumanSyntheticGeneration(request(body), {
    authenticate: async () => ({ id: U[0] }),
    execute: async () => { calls += 1; return { ...result, outcome: 'replayed' }; },
  });
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal((await response.json()).commandOutcome, 'replayed');
});

test('authentication and method failures stop before execution', async () => {
  let calls = 0;
  const dependencies = {
    authenticate: async () => { throw new Error('no session'); },
    execute: async () => { calls += 1; return result; },
  };
  assert.equal((await handlePrCControlledHumanSyntheticGeneration(request(body), dependencies)).status, 401);
  assert.equal((await handlePrCControlledHumanSyntheticGeneration(request(body, 'GET'), dependencies)).status, 405);
  assert.equal(calls, 0);
});

test('adversarial binding, lineage, authorization, source, template, and substitution mutations fail before execution', async () => {
  const mutations: Array<[string, (value: Record<string, unknown>) => void]> = [
    ['runtime', value => { value.environmentClass = 'production'; }],
    ['pr', value => { value.prNumber = 263; }],
    ['head', value => { value.reviewHeadSha = '9'.repeat(40); }],
    ['deploy', value => { value.deployId = 'short'; }],
    ['origin', value => { value.deployOrigin = 'https://avalaos.com'; }],
    ['exercise', value => { value.exerciseDigest = `sha256:${'c'.repeat(63)}`; }],
    ['target', value => { value.targetFingerprint = `sha256:${'d'.repeat(63)}`; }],
    ['scope', value => { value.workspaceId = 'foreign'; }],
    ['authorization', value => { value.authorizationVersion = 0; }],
    ['source package', value => { value.sourcePackageId = 'foreign'; }],
    ['source version', value => { value.sourcePackageVersion = 0; }],
    ['source hash', value => { value.sourcePackageHash = 'e'.repeat(63); }],
    ['aggregate', value => { value.expectedAggregateVersion = -1; }],
    ['template', value => { value.template = { ...(value.template as object), hash: 'f'.repeat(63) }; }],
    ['idempotency substitution', value => { value.idempotencyKey = '../substitute'; }],
    ['extra claim', value => { value.provider = 'openai'; }],
  ];
  for (const [label, mutate] of mutations) {
    let calls = 0;
    const candidate = structuredClone(body) as Record<string, unknown>;
    mutate(candidate);
    const response = await handlePrCControlledHumanSyntheticGeneration(request(candidate), {
      authenticate: async () => ({ id: U[0] }),
      execute: async () => { calls += 1; return result; },
    });
    assert.equal(response.status, 400, label);
    assert.equal(calls, 0, `${label} must stop before RPC`);
  }
});

test('malformed or non-synthetic result cannot be reported as success', async () => {
  for (const candidate of [
    { ...result, resource: { ...result.resource, synthetic: false } },
    { ...result, resource: { ...result.resource, generationKind: 'provider' } },
    { ...result, resourceId: U[11] },
    { ...result, resource: { ...result.resource, providerOperationId: 'forbidden' } },
  ]) {
    const response = await handlePrCControlledHumanSyntheticGeneration(request(body), {
      authenticate: async () => ({ id: U[0] }), execute: async () => candidate,
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).ok, false);
  }
});
