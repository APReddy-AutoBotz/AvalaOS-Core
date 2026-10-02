import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import { handleOptions } from './http.ts';
import {
  handlePrCControlledHumanSyntheticGeneration,
  parsePrCControlledHumanSyntheticGenerationCommand,
  PR_C_SYNTHETIC_DIRECT_GENERATION_CONTRACT_VERSION,
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

const directBody = {
  ...body,
  contractVersion: PR_C_SYNTHETIC_DIRECT_GENERATION_CONTRACT_VERSION,
  catalogBindingToken: `sha256:${'1'.repeat(64)}`,
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

test('parses the exact direct PDD generation envelope with its completed catalog binding', () => {
  const parsed = parsePrCControlledHumanSyntheticGenerationCommand(directBody, U[0]);
  assert.equal(parsed.contractVersion, PR_C_SYNTHETIC_DIRECT_GENERATION_CONTRACT_VERSION);
  assert.equal(parsed.actorId, U[0]);
  assert.equal(parsed.artifactId, body.artifactId);
  assert.equal(parsed.catalogBindingToken, directBody.catalogBindingToken);
});

test('direct generation requires the exact binding token and rejects it on the original contract', () => {
  const missing = structuredClone(directBody) as Record<string, unknown>;
  delete missing.catalogBindingToken;
  assert.throws(() => parsePrCControlledHumanSyntheticGenerationCommand(missing, U[0]));
  assert.throws(() => parsePrCControlledHumanSyntheticGenerationCommand({ ...body, catalogBindingToken: directBody.catalogBindingToken }, U[0]));
  assert.throws(() => parsePrCControlledHumanSyntheticGenerationCommand({ ...directBody, catalogBindingToken: '1'.repeat(64) }, U[0]));
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

test('native browser reads synthetic generation success, replay, and denied responses after preflight', async () => {
  let commits = 0;
  let preflights = 0;
  const origin = createServer((_request, response) => { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Synthetic preview</title>'); });
  const api = createServer(async (incoming, outgoing) => {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const nativeRequest = new Request(`http://127.0.0.1${incoming.url}`, {
      method: incoming.method, headers: incoming.headers as Record<string, string>,
      ...(incoming.method === 'POST' ? { body: Buffer.concat(chunks).toString() } : {}),
    });
    if (incoming.method === 'OPTIONS') preflights += 1;
    const response = handleOptions(nativeRequest) ?? await handlePrCControlledHumanSyntheticGeneration(nativeRequest, {
      authenticate: async () => { if (incoming.url === '/denied') throw new Error('No synthetic session'); return { id: U[0] }; },
      execute: async () => { const outcome = commits ? 'replayed' : 'committed'; if (!commits) commits += 1; return { ...result, outcome }; },
    });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(await response.text());
  });
  await new Promise<void>(resolve => origin.listen(0, '127.0.0.1', resolve));
  await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve));
  const port = (server: typeof api) => (server.address() as { port: number }).port;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port(origin)}`);
    const fetchGeneration = (path: string, payload: unknown) => page.evaluate(async ({ url, payload }) => {
      try {
        const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer synthetic-test-token', apikey: 'synthetic-public-key', 'x-client-info': 'synthetic-test' }, body: JSON.stringify(payload) });
        return { readable: true, status: response.status, body: await response.json() };
      } catch { return { readable: false }; }
    }, { url: `http://127.0.0.1:${port(api)}${path}`, payload });
    const committed = await fetchGeneration('/generation', body);
    assert.equal(commits, 1, 'the authenticated synthetic command committed');
    assert.equal(committed.readable, true, 'a committed response must remain readable across the preview origin');
    assert.equal(committed.status, 201);
    assert.equal(committed.body.commandOutcome, 'committed');
    const replay = await fetchGeneration('/generation', body);
    assert.equal(replay.readable, true);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.commandOutcome, 'replayed');
    const denied = await fetchGeneration('/denied', body);
    assert.equal(denied.readable, true);
    assert.equal(denied.status, 401);
    assert.equal(denied.body.ok, false);
    const malformed = await fetchGeneration('/invalid', {});
    assert.equal(malformed.readable, true);
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.ok, false);
    assert.equal(commits, 1, 'replay and rejected requests add no committed effect');
    assert(preflights > 0, 'native browser exercised the deployed preflight policy');
  } finally {
    await browser.close();
    await Promise.all([origin, api].map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))));
  }
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
