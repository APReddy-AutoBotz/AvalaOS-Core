import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';

import { chromium } from 'playwright';

import { executeSyntheticResponseLoss } from './prCSyntheticBrowserResponseLoss.mjs';

const ORG = '11111111-1111-4111-a111-111111111111';
const WORKSPACE = '22222222-2222-4222-a222-222222222222';
const PACKAGE = '33333333-3333-4333-a333-333333333333';
const PACKAGE_VERSION = '44444444-4444-4444-a444-444444444444';
const ITEM = '55555555-5555-4555-a555-555555555555';
const ITEM_VERSION = '66666666-6666-4666-a666-666666666666';
const REQUEST_ONE = '77777777-7777-4777-a777-777777777777';
const REQUEST_TWO = '88888888-8888-4888-a888-888888888888';
const RECEIPT = '99999999-9999-4999-a999-999999999999';
const publicDigest = origin => `sha256:${createHash('sha256').update(`pr-c-controlled-human-public-target\0${origin}`).digest('hex')}`;

const command = requestId => ({
  commandType: 'delivery.package.revision.commit',
  requestId,
  idempotencyKey: 'synthetic-response-loss-fixed-key',
  organizationId: ORG,
  workspaceId: WORKSPACE,
  payload: {
    workPackageId: PACKAGE,
    expectedPackageVersion: 3,
    expectedPackageVersionId: PACKAGE_VERSION,
    expectedPackageAggregateVersion: 7,
    expectedItems: [{ itemAggregateId: ITEM, expectedAggregateVersion: 2, expectedItemVersionId: ITEM_VERSION }],
    itemRevisions: [{ itemAggregateId: ITEM, expectedAggregateVersion: 2, expectedItemVersionId: ITEM_VERSION, rationale: 'Synthetic response-loss revision.', item: { itemType: 'Task', title: 'Synthetic revision', description: 'Exact response-loss fixture.', acceptanceCriteria: ['One committed effect.'], nonFunctionalRequirements: ['Preserve idempotency.'] } }],
  },
});

const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address()));
});
const close = server => new Promise(resolve => server.close(resolve));

test('forwards one UI commit, loses its response, and observes the production-shaped retry as one effect', async t => {
  const posts = [];
  const server = createServer(async (request, response) => {
    if (request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><title>response loss</title>'); return;
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' }); response.end(); return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    posts.push(body);
    const revisionAttempt = posts.filter(item => item.commandType === 'delivery.package.revision.commit').length;
    const result = body.commandType === 'delivery.package.revision.commit'
      ? { ok: true, outcome: revisionAttempt === 1 ? 'committed' : 'replayed', receiptId: RECEIPT, action: body.commandType, resourceId: PACKAGE, resourceVersion: 4 }
      : { ok: true, outcome: 'committed', receiptId: RECEIPT, action: body.commandType, resourceId: PACKAGE, resourceVersion: 1 };
    response.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); response.end(JSON.stringify(result));
  });
  const address = await listen(server);
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await close(server); });
  const page = await browser.newPage();
  await page.goto(origin);

  const result = await executeSyntheticResponseLoss({
    page, organizationId: ORG, workspaceId: WORKSPACE, publicTargetDigest: publicDigest(origin),
    execute: () => page.evaluate(async ({ endpoint, unrelated, first, second }) => {
      await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(unrelated) });
      let lost = false;
      try { await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(first) }); }
      catch { lost = true; }
      if (!lost) throw new Error('first response was not lost');
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(second) });
      const value = await response.json();
      if (value.outcome !== 'replayed') throw new Error('retry was not replayed');
      return value.outcome;
    }, {
      endpoint: `${origin}/functions/v1/enterprise-intelligence-command`,
      unrelated: { commandType: 'enterprise.read.only.fixture' },
      first: command(REQUEST_ONE), second: command(REQUEST_TWO),
    }),
  });

  assert.equal(posts.length, 3);
  assert.equal(result.original.body.requestId, REQUEST_ONE);
  assert.equal(result.original.response.outcome, 'committed');
  assert.equal(result.retry.body.requestId, REQUEST_TWO);
  assert.equal(result.retry.response.outcome, 'replayed');
  assert.deepEqual(result.facts, {
    action: 'delivery.package.revision.commit', attemptCount: 2, sameIdempotency: true,
    samePayload: true, differentRequestId: true, sameReceipt: true, oneCommittedEffect: true,
  });
});

test('rejects retry identity drift with a sanitized error and always removes the route', async () => {
  let handler;
  let unrouteCount = 0;
  const response = body => ({
    async json() { return { ok: true, outcome: body.requestId === REQUEST_ONE ? 'committed' : 'replayed', receiptId: RECEIPT, action: body.commandType, resourceId: PACKAGE, resourceVersion: 4 }; },
    ok() { return true; }, status() { return 200; },
  });
  const page = {
    async route(_pattern, value) { handler = value; },
    async unroute(_pattern, value) { assert.equal(value, handler); unrouteCount += 1; },
  };
  const routeFor = body => ({
    request: () => ({ method: () => 'POST', url: () => 'https://synthetic.invalid/functions/v1/enterprise-intelligence-command', postDataJSON: () => body }),
    fetch: async () => response(body),
    abort: async () => undefined,
    continue: async () => undefined,
    fulfill: async () => undefined,
  });
  const origin = 'https://synthetic.invalid';
  await assert.rejects(() => executeSyntheticResponseLoss({
    page, organizationId: ORG, workspaceId: WORKSPACE, publicTargetDigest: publicDigest(origin),
    execute: async () => {
      await handler(routeFor(command(REQUEST_ONE)));
      await handler(routeFor({ ...command(REQUEST_TWO), idempotencyKey: 'different-retry-identity' }));
    },
  }), error => error.message === 'PR_C_SYNTHETIC_RESPONSE_LOSS_RETRY_IDENTITY_REJECTED'
    && !error.message.includes(REQUEST_ONE) && !error.message.includes('different-retry-identity'));
  assert.equal(unrouteCount, 1);
});

test('rejects wrong action scope and missing retry without forwarding a synthetic mutation', async () => {
  let handler;
  let fetchCount = 0;
  const page = {
    async route(_pattern, value) { handler = value; },
    async unroute() {},
  };
  const wrong = { ...command(REQUEST_ONE), workspaceId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' };
  const route = {
    request: () => ({ method: () => 'POST', url: () => 'https://synthetic.invalid/functions/v1/enterprise-intelligence-command', postDataJSON: () => wrong }),
    fetch: async () => { fetchCount += 1; throw new Error('must not forward'); },
    abort: async () => undefined,
    continue: async () => undefined,
  };
  await assert.rejects(() => executeSyntheticResponseLoss({
    page, organizationId: ORG, workspaceId: WORKSPACE,
    publicTargetDigest: publicDigest('https://synthetic.invalid'),
    execute: () => handler(route),
  }), /PR_C_SYNTHETIC_RESPONSE_LOSS_REQUEST_REJECTED/u);
  assert.equal(fetchCount, 0);
});
