import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import vm from 'node:vm';
import { chromium } from '@playwright/test';

import { attachSyntheticBrowserApi } from './prCSyntheticBrowserApi.mjs';
import {
  deriveSyntheticApplicationActorDigest,
  deriveSyntheticApplicationSessionDigest,
} from './prCSyntheticIdentity.mjs';

const PREVIEW = 'https://deploy-preview-264--avalaos-pilot.netlify.app';
const SUPABASE = `https://${'a'.repeat(20)}.supabase.co`;
const PUBLIC_KEY = 'sb_publishable_synthetic_test_value';
const EXERCISE = `sha256:${'1'.repeat(64)}`;
const USER = '11111111-1111-4111-a111-111111111111';
const SESSION = '22222222-2222-4222-a222-222222222222';
const ORG = '33333333-3333-4333-a333-333333333333';
const WORKSPACE = '44444444-4444-4444-a444-444444444444';
const REQUEST = '55555555-5555-4555-a555-555555555555';
const RECEIPT = '66666666-6666-4666-a666-666666666666';
const RESOURCE = '77777777-7777-4777-a777-777777777777';
const CHALLENGE = `sha256:${'8'.repeat(64)}`;
const BUSINESS_KEY = 'synthetic-replay-key-0001';

const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const base64url = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (userId = USER, sessionId = SESSION) => `${base64url({ alg: 'none' })}.${base64url({ sub: userId, session_id: sessionId })}.signature`;

class Storage {
  #values = new Map();
  get length() { return this.#values.size; }
  key(index) { return [...this.#values.keys()][index] ?? null; }
  getItem(key) { return this.#values.get(String(key)) ?? null; }
  setItem(key, value) { this.#values.set(String(key), String(value)); }
  removeItem(key) { this.#values.delete(String(key)); }
}

class VmPage {
  constructor(fetch) {
    this.localStorage = new Storage();
    this.sessionStorage = new Storage();
    this.context = vm.createContext({
      atob: value => Buffer.from(value, 'base64').toString('binary'),
      btoa: value => Buffer.from(value, 'binary').toString('base64'),
      console,
      crypto: webcrypto,
      fetch,
      Headers,
      localStorage: this.localStorage,
      location: { origin: PREVIEW, href: `${PREVIEW}/` },
      Request,
      Response,
      sessionStorage: this.sessionStorage,
      TextDecoder,
      TextEncoder,
      URL,
    });
  }
  async #run(fn, argument) {
    this.context.__argument = argument;
    return vm.runInContext(`(${fn.toString()})(__argument)`, this.context);
  }
  addInitScript(fn, argument) { return this.#run(fn, argument); }
  evaluate(fn, argument) { return this.#run(fn, argument); }
}

const binding = (publicTargetDigest = sha256(`pr-c-controlled-human-public-target\0${SUPABASE}`)) => ({
  repository: 'APReddy-AutoBotz/AvalaOS-Core',
  prNumber: 264,
  branch: 'controller/governed-delivery-monitor-pr-c-20260831',
  exactHead: 'a'.repeat(40),
  preview: {
    origin: PREVIEW,
    deployId: 'b'.repeat(24),
    releaseSha: 'a'.repeat(40),
    environment: 'hosted_nonproduction_pilot',
    context: 'deploy-preview',
    reviewId: 264,
    siteName: 'avalaos-pilot',
  },
  backend: {
    exerciseDigest: EXERCISE,
    targetFingerprint: `sha256:${'2'.repeat(64)}`,
    publicTargetDigest,
    personaManifestDigest: `sha256:${'3'.repeat(64)}`,
    fixtureManifestDigest: `sha256:${'4'.repeat(64)}`,
    migrationTip: '20260926053818',
  },
});

const identity = (personaKey, userId = USER, sessionId = SESSION) => ({
  applicationActorDigest: deriveSyntheticApplicationActorDigest({ exerciseDigest: EXERCISE, personaKey, authUserId: userId }),
  applicationSessionDigest: deriveSyntheticApplicationSessionDigest({ exerciseDigest: EXERCISE, personaKey, sessionId }),
});

const attestation = candidate => ({
  attested: true,
  contractVersion: 'pr-c-controlled-human-attestation-1',
  environmentClass: 'hosted_nonproduction_pilot',
  prNumber: 264,
  releaseSha: candidate.exactHead,
  reviewHeadSha: candidate.exactHead,
  deployId: candidate.preview.deployId,
  deployOrigin: candidate.preview.origin,
  exerciseDigest: candidate.backend.exerciseDigest,
  targetFingerprint: candidate.backend.targetFingerprint,
  publicTargetDigest: candidate.backend.publicTargetDigest,
  personaManifestDigest: candidate.backend.personaManifestDigest,
  fixtureManifestDigest: candidate.backend.fixtureManifestDigest,
  migrationTip: candidate.backend.migrationTip,
  productionAuthorized: false,
  customerDataAuthorized: false,
  realProviderCallsAuthorized: false,
});

const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

const harness = ({ candidate = binding(), tenantAvailable = true, studioProbe } = {}) => {
  const requests = [];
  const fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    let body = null;
    if (typeof init.body === 'string') body = JSON.parse(init.body);
    requests.push({ url: url.href, pathname: url.pathname, body });
    if (url.pathname === '/functions/v1/studio-artifact-command' && Object.keys(body ?? {}).length === 0 && studioProbe) return studioProbe();
    if (url.pathname.startsWith('/auth/v1/')) return jsonResponse({ user: { id: USER } });
    if (url.pathname.endsWith('/pr_c_controlled_human_public_attestation')) return jsonResponse(attestation(candidate));
    if (url.pathname === '/functions/v1/tenant-session') {
      if (!tenantAvailable) return jsonResponse({ code: 'PERMISSION_DENIED' }, 403);
      return jsonResponse({ contexts: [{ userId: USER, organizationId: ORG, organizationName: 'Synthetic', workspaceId: WORKSPACE, workspaceName: 'Governed', authorizationVersion: 7, capabilities: ['studio.artifacts.read'] }] });
    }
    if (url.pathname.endsWith('/pr_c_controlled_human_anchor_step')) {
      const action = body.p_step_id === 'replay-baseline-creation' ? 'monitor.baseline.create'
        : body.p_step_id.includes('projection') ? 'delivery.workspace.projection'
          : 'delivery.package.create.manual';
      return jsonResponse({ safeAnchor: { action, challengeToken: CHALLENGE }, execution: { requestId: REQUEST, businessIdempotencyKey: BUSINESS_KEY } });
    }
    if (url.pathname.endsWith('/pr_c_controlled_human_complete_step')) return jsonResponse({ result: 'succeeded' });
    if (url.pathname.endsWith('/pr_c_controlled_human_execute_denied_step')) return jsonResponse({ result: 'denied' });
    if (url.pathname.includes('/rest/v1/rpc/')) return jsonResponse({ id: RESOURCE, aggregateVersion: 1 });
    if (url.pathname === '/functions/v1/enterprise-intelligence-query') return jsonResponse({ projection: { organizationId: ORG, workspaceId: WORKSPACE } });
    if (url.pathname.endsWith('-command') || url.pathname.endsWith('-generation')) return jsonResponse({ ok: true, outcome: 'committed', receiptId: RECEIPT, resourceId: RESOURCE, resource: { id: RESOURCE } });
    return jsonResponse({});
  };
  const page = new VmPage(fetch);
  page.localStorage.setItem('sb-synthetic-auth-token', JSON.stringify({ access_token: jwt(), user: { id: USER } }));
  return { page, requests };
};

const observePublicTarget = page => page.evaluate(async ({ origin, apiKey }) => {
  await fetch(`${origin}/auth/v1/user`, { headers: { apikey: apiKey } });
}, { origin: SUPABASE, apiKey: PUBLIC_KEY });

test('checks readable Studio transport with an empty rejected envelope before business mutations', async () => {
  const payload = { ok: false, outcome: 'failed_before_commit', error: { code: 'INVALID_COMMAND' } };
  for (const origin of ['*', PREVIEW]) {
    const candidate = binding();
    const { page, requests } = harness({ candidate, studioProbe: () => new Response(JSON.stringify(payload), {
      status: 400, headers: { 'content-type': 'application/json', 'access-control-allow-origin': origin },
    }) });
    const api = await attachSyntheticBrowserApi({ page, personaKey: 'requester', binding: candidate });
    await observePublicTarget(page); await api.setIdentity(identity('requester'));
    const result = await api.verifyStudioTransport();
    assert.equal(result.readable, true); assert.equal(result.rejectedBeforeCommit, true);
    assert.deepEqual(requests.filter(item => item.pathname === '/functions/v1/studio-artifact-command').map(item => item.body), [{}]);
    assert.equal(await api.lastCommand(), null, 'invalid-envelope probe is never business-command evidence');
  }
});

test('fails Studio transport preflight on unreadable CORS or unexpected success', async () => {
  const cases = [
    [() => { throw new TypeError('Failed to fetch private-target'); }, 'UNREADABLE'],
    [() => new Response(JSON.stringify({ ok: true }), { status: 201, headers: { 'access-control-allow-origin': '*' } }), 'REJECTED'],
  ];
  for (const [studioProbe, code] of cases) {
    const candidate = binding(); const { page } = harness({ candidate, studioProbe });
    const api = await attachSyntheticBrowserApi({ page, personaKey: 'requester', binding: candidate });
    await observePublicTarget(page); await api.setIdentity(identity('requester'));
    await assert.rejects(() => api.verifyStudioTransport(), error => error.message === `PR_C_SYNTHETIC_BROWSER_API_STUDIO_TRANSPORT_${code}`);
  }
});

test('native browser CORS permits the rejected probe without exposing allow-origin and blocks missing CORS', async () => {
  let cors = true;
  const bodies = [];
  const server = createServer(async (request, response) => {
    if (request.url === '/') { response.end('<!doctype html><title>Local transport check</title>'); return; }
    if (cors) {
      response.setHeader('access-control-allow-origin', '*');
      response.setHeader('access-control-allow-headers', 'content-type,apikey,authorization');
      response.setHeader('access-control-allow-methods', 'POST,OPTIONS');
    }
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    let body = ''; for await (const chunk of request) body += chunk;
    bodies.push(body);
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: false, outcome: 'failed_before_commit', error: { code: 'INVALID_COMMAND' } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const browserPage = await browser.newPage();
    const port = server.address().port;
    await browserPage.goto(`http://localhost:${port}/`);
    const studioProbe = async () => {
      const observed = await browserPage.evaluate(async url => {
        const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', apikey: 'dummy', authorization: 'Bearer dummy' }, body: '{}' });
        return { status: response.status, body: await response.text(), visibleAllowOrigin: response.headers.get('access-control-allow-origin') };
      }, `http://127.0.0.1:${port}/probe`);
      assert.equal(observed.visibleAllowOrigin, null, 'CORS headers are not exposed to page JavaScript');
      return new Response(observed.body, { status: observed.status });
    };
    const candidate = binding(); const { page } = harness({ candidate, studioProbe });
    const api = await attachSyntheticBrowserApi({ page, personaKey: 'requester', binding: candidate });
    await observePublicTarget(page); await api.setIdentity(identity('requester'));
    assert.equal((await api.verifyStudioTransport()).rejectedBeforeCommit, true);
    cors = false;
    await assert.rejects(() => api.verifyStudioTransport(), /PR_C_SYNTHETIC_BROWSER_API_STUDIO_TRANSPORT_UNREADABLE/u);
    assert(bodies.length > 0); assert(bodies.every(body => body === '{}'));
    assert.equal(await api.lastCommand(), null);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test('uses the persisted browser identity and fresh tenant context for scoped public reads and prerequisites', async () => {
  const candidate = binding();
  const { page, requests } = harness({ candidate });
  const api = await attachSyntheticBrowserApi({ page, personaKey: 'requester', binding: candidate });
  await observePublicTarget(page);
  await api.setIdentity(identity('requester'));

  const context = await api.context();
  assert.equal(context.organizationId, ORG);
  assert.equal(context.workspaceId, WORKSPACE);
  const projection = await api.rpc('studio_artifact_projection_v2', { p_org: ORG, p_workspace: WORKSPACE, p_artifact: RESOURCE });
  assert.equal(projection.id, RESOURCE);

  const body = {
    commandType: 'studio.artifact.draft.revise', requestId: REQUEST, idempotencyKey: 'synthetic-studio-revise-0001',
    organizationId: ORG, workspaceId: WORKSPACE, authorizationVersion: 7, payload: { artifactId: RESOURCE },
  };
  const result = await api.invoke('studio-artifact-command', body, { checkpointId: 'CH-02', stepId: 'edit-structured-document', action: body.commandType });
  assert.equal(result.outcome, 'committed');
  assert.deepEqual(requests.filter(item => item.pathname === '/functions/v1/studio-artifact-command').at(-1).body, body);
  assert.ok(requests.filter(item => item.pathname === '/functions/v1/tenant-session').length >= 3, 'each scoped operation refreshes tenant authority');

  const reviewerHarness = harness({ candidate });
  const reviewerApi = await attachSyntheticBrowserApi({ page: reviewerHarness.page, personaKey: 'studio_reviewer', binding: candidate });
  await observePublicTarget(reviewerHarness.page);
  await reviewerApi.setIdentity(identity('studio_reviewer'));
  const assignment = { ...body, commandType: 'studio.artifact.review.assign', idempotencyKey: 'synthetic-studio-assign-0001' };
  await reviewerApi.invoke('studio-artifact-command', assignment, { checkpointId: 'CH-03', stepId: 'generate-source-bound-document', action: assignment.commandType });
  assert.deepEqual(reviewerHarness.requests.filter(item => item.pathname === '/functions/v1/studio-artifact-command').at(-1).body, assignment);
});

test('observes only successful UI commands and retains their private request and response bodies', async () => {
  const candidate = binding();
  const { page } = harness({ candidate });
  const api = await attachSyntheticBrowserApi({ page, personaKey: 'requester', binding: candidate });
  await observePublicTarget(page);
  await api.setIdentity(identity('requester'));
  assert.equal(await api.lastCommand(), null);

  const body = { commandType: 'delivery.handoff.request', requestId: REQUEST, idempotencyKey: 'synthetic-ui-command-0001', organizationId: ORG, workspaceId: WORKSPACE, payload: { artifactId: RESOURCE } };
  await page.evaluate(async ({ origin, apiKey, body }) => {
    await fetch(`${origin}/functions/v1/enterprise-intelligence-command`, { method: 'POST', headers: { apikey: apiKey, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }, { origin: SUPABASE, apiKey: PUBLIC_KEY, body });
  const observed = await api.lastCommand();
  assert.equal(observed.functionName, 'enterprise-intelligence-command');
  assert.equal(observed.commandType, body.commandType);
  assert.equal(observed.requestId, body.requestId);
  assert.deepEqual(JSON.parse(JSON.stringify(observed.body)), body);
  assert.equal(observed.response.resourceId, RESOURCE);

  await api.context();
  assert.deepEqual(await api.lastCommand(), observed, 'tenant and attestation reads do not replace the latest UI mutation');
});

test('binds catalog replay to the server anchor request identity before completion', async () => {
  const candidate = binding();
  const { page, requests } = harness({ candidate });
  const api = await attachSyntheticBrowserApi({ page, personaKey: 'delivery_approver', binding: candidate });
  await observePublicTarget(page);
  await api.setIdentity(identity('delivery_approver'));
  const anchor = await api.rpc('pr_c_controlled_human_anchor_step', {
    p_exercise_digest: EXERCISE, p_checkpoint_id: 'CH-08', p_step_id: 'replay-baseline-creation',
    p_target_family: 'delivery_work_package', p_target_id: RESOURCE, p_expected_version: 1, p_selector_bindings: {},
  });
  const replay = {
    commandType: 'monitor.baseline.create', requestId: anchor.execution.requestId, idempotencyKey: anchor.execution.businessIdempotencyKey,
    organizationId: ORG, workspaceId: WORKSPACE, authorizationVersion: 7, payload: { workPackageId: RESOURCE },
  };
  await assert.rejects(() => api.invoke('enterprise-intelligence-command', { ...replay, requestId: '99999999-9999-4999-a999-999999999999' }), /PR_C_SYNTHETIC_BROWSER_API_ACTION_REJECTED/u);
  const expectation = { checkpointId: 'CH-08', stepId: 'replay-baseline-creation', action: replay.commandType };
  await api.invoke('enterprise-intelligence-command', replay, expectation);
  await api.rpc('pr_c_controlled_human_complete_step', { p_exercise_digest: EXERCISE, p_challenge_token: CHALLENGE });
  assert.deepEqual(requests.filter(item => item.pathname === '/functions/v1/enterprise-intelligence-command').at(-1).body, replay);
});

test('supports the authenticated denial RPC without requiring a tenant context', async () => {
  const candidate = binding();
  const { page, requests } = harness({ candidate, tenantAvailable: false });
  const api = await attachSyntheticBrowserApi({ page, personaKey: 'revoked_actor', binding: candidate });
  await observePublicTarget(page);
  await api.setIdentity(identity('revoked_actor'));
  await api.rpc('pr_c_controlled_human_anchor_step', {
    p_exercise_digest: EXERCISE, p_checkpoint_id: 'CH-12', p_step_id: 'revoked-actor-projection-denied',
    p_target_family: 'workspace', p_target_id: WORKSPACE, p_expected_version: 7, p_selector_bindings: {},
  });
  const denied = await api.rpc('pr_c_controlled_human_execute_denied_step', { p_exercise_digest: EXERCISE, p_challenge_token: CHALLENGE });
  assert.equal(denied.result, 'denied');
  assert.equal(requests.filter(item => item.pathname === '/functions/v1/tenant-session').length, 0);
});

test('rejects wrong target, session, actor, endpoint, scope, and action with sanitized errors', async () => {
  const secret = 'never-echo-this-secret-value';
  const candidate = binding();
  const { page } = harness({ candidate });
  const api = await attachSyntheticBrowserApi({ page, personaKey: 'requester', binding: candidate });
  await observePublicTarget(page);
  const wrongActor = identity('delivery_author');
  await assert.rejects(() => api.setIdentity(wrongActor), error => error.message === 'PR_C_SYNTHETIC_BROWSER_API_IDENTITY_REJECTED' && !error.message.includes(secret));
  const wrong = identity('requester', USER, '99999999-9999-4999-a999-999999999999');
  await assert.rejects(() => api.setIdentity(wrong), error => error.message === 'PR_C_SYNTHETIC_BROWSER_API_IDENTITY_REJECTED' && !error.message.includes(secret));
  await api.setIdentity(identity('requester'));
  await assert.rejects(() => api.rpc('admin_delete_everything', { secret }), error => error.message === 'PR_C_SYNTHETIC_BROWSER_API_ENDPOINT_REJECTED' && !error.message.includes(secret));
  await assert.rejects(() => api.rpc('studio_artifact_projection_v2', { p_org: ORG, p_workspace: '99999999-9999-4999-a999-999999999999', p_artifact: RESOURCE }), /PR_C_SYNTHETIC_BROWSER_API_SCOPE_REJECTED/u);
  await assert.rejects(() => api.invoke('studio-artifact-command', {
    commandType: 'studio.artifact.approval.resolve', requestId: REQUEST, idempotencyKey: 'synthetic-forbidden-action', organizationId: ORG, workspaceId: WORKSPACE, payload: { secret },
  }, { checkpointId: 'CH-02', stepId: 'edit-structured-document', action: 'studio.artifact.approval.resolve' }), error => error.message === 'PR_C_SYNTHETIC_BROWSER_API_ACTION_REJECTED' && !error.message.includes(secret));

  const wrongTarget = binding(`sha256:${'f'.repeat(64)}`);
  const targetHarness = harness({ candidate: wrongTarget });
  const targetApi = await attachSyntheticBrowserApi({ page: targetHarness.page, personaKey: 'requester', binding: wrongTarget });
  await observePublicTarget(targetHarness.page);
  await assert.rejects(() => targetApi.setIdentity(identity('requester')), error => error.message === 'PR_C_SYNTHETIC_BROWSER_API_TARGET_REJECTED' && !error.message.includes(PUBLIC_KEY));
});
