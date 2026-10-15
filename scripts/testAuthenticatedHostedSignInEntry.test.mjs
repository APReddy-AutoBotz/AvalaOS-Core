import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS,
  AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_SCOPE,
  assertAuthenticatedHostedSignInEntryLoopbackUrl,
  authenticatedHostedSignInEntryChildEnvironment,
  startAuthenticatedHostedSignInEntryFixture,
} from './testAuthenticatedHostedSignInEntry.mjs';

test('child environment admits only operational keys plus explicit synthetic overrides', () => {
  assert.deepEqual(authenticatedHostedSignInEntryChildEnvironment({
    PATH: 'path-value',
    SystemRoot: 'system-root',
    GITHUB_TOKEN: 'must-not-pass',
    AUTHENTICATED_HOSTED_PASSWORD: 'must-not-pass',
  }, { ENTERPRISE_LIFECYCLE_HOSTED_REAL_AUTH: 'true' }), {
    PATH: 'path-value',
    SystemRoot: 'system-root',
    ENTERPRISE_LIFECYCLE_HOSTED_REAL_AUTH: 'true',
  });
});

test('runner accepts exact loopback origins and rejects broader targets', () => {
  assert.equal(assertAuthenticatedHostedSignInEntryLoopbackUrl('http://127.0.0.1:43123'), 'http://127.0.0.1:43123');
  for (const value of [
    'https://127.0.0.1:43123',
    'http://localhost:43123',
    'http://127.0.0.1:43123/path',
    'http://user@127.0.0.1:43123',
    'https://example.invalid',
  ]) assert.throws(() => assertAuthenticatedHostedSignInEntryLoopbackUrl(value), /NON_LOOPBACK_URL_REJECTED/u);
});

test('fixture rejects unrecognized process seed modes before opening local services', async () => {
  await assert.rejects(startAuthenticatedHostedSignInEntryFixture({ processSeedMode: 'unbounded' }),
    /AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROCESS_SEED_MODE_REJECTED/u);
});

test('inert fixture emits a bounded rejection diagnostic without creating a binding', async () => {
  const fixture = await startAuthenticatedHostedSignInEntryFixture();
  try {
    const rejected = await fetch(`${fixture.baseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'rejected.desktop-chromium@local.invalid', password: 'synthetic-rejected-password' }),
    });
    assert.equal(rejected.status, 401);
    assert.deepEqual(await rejected.json(), { error_code: 'invalid_credentials', message: 'Invalid credentials' });
    await fetch(`${fixture.controlBaseUrl}/control/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-enterprise-lifecycle-control': fixture.controlToken },
      body: JSON.stringify({ projectName: 'desktop-chromium' }),
    });
    const diagnostic = await fetch(`${fixture.controlBaseUrl}/control/browser-diagnostic`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-enterprise-lifecycle-control': fixture.controlToken },
      body: JSON.stringify({
        projectName: 'desktop-chromium',
        diagnostic: { operation: 'SIGN_IN', category: 'CREDENTIAL_REJECTED', upstreamCode: 'invalid_credentials' },
      }),
    });
    assert.equal(diagnostic.status, 200);
    const observation = await fetch(`${fixture.controlBaseUrl}/control/sign-in-entry-observation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-enterprise-lifecycle-control': fixture.controlToken },
      body: JSON.stringify({ projectName: 'desktop-chromium' }),
    });
    assert.equal(observation.status, 200);
    assert.deepEqual(await observation.json(), {
      passwordRequests: [{ actor: 'rejected', outcome: 'rejected' }],
      bindings: [],
      attestationRequests: 0,
      processCommandRequests: 0,
      anonymousProcessCommandRequests: 0,
      processAtomicCalls: 0,
      verifySessionCalls: [],
      controlSequence: [],
      permits: [],
      diagnostic: { source: 'browser', project: 'desktop-chromium', operation: 'SIGN_IN', category: 'CREDENTIAL_REJECTED', upstreamCode: 'invalid_credentials' },
      actions: [],
      browserCases: 0,
      serverCases: 0,
    });
  } finally {
    assert.equal(await fixture.close(), true);
  }
});

test('an aborted late arm request can leave an armed permit until authoritative cleanup revokes it', async () => {
  const fixture = await startAuthenticatedHostedSignInEntryFixture();
  let closed = false;
  const control = (pathname, body, signal) => fetch(`${fixture.controlBaseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-enterprise-lifecycle-control': fixture.controlToken },
    body: JSON.stringify(body),
    signal,
  });
  try {
    const projectName = 'desktop-chromium';
    const setup = await (await control('/control/setup', { projectName })).json();
    const signIn = await fetch(`${fixture.baseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'author.desktop-chromium@local.invalid',
        password: 'synthetic-author-password',
      }),
    });
    const session = await signIn.json();
    assert.equal((await control('/control/bind-browser-session', {
      projectName,
      persona: 'author',
      accessToken: session.access_token,
    })).status, 200);
    const requestId = randomUUID();
    const requestBody = {
      requestId,
      idempotencyKey: `process.update.${requestId}`,
      commandType: 'process.update',
      organizationId: AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_SCOPE.organizationId,
      workspaceId: AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_SCOPE.workspaceId,
      authorizationVersion: 1,
      expectedVersion: 1,
      payload: {
        processId: setup.processId,
        name: 'Late arm remains cleanup-owned',
        description: 'Synthetic authenticated acceptance process.',
        department: 'Operations',
        criticality: 'High',
      },
    };
    assert.equal((await control('/control/sign-in-entry-arm-gate', {
      projectName,
      mode: 'stall-next',
    })).status, 200);
    await assert.rejects(control('/control/arm-browser-fault', {
      projectName,
      persona: 'author',
      kind: 'process_server_error_precommit',
      commandType: 'process.update',
      requestBody,
      accessToken: session.access_token,
    }, AbortSignal.timeout(20)), /aborted|timeout/iu);
    let observation;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      observation = await (await control('/control/sign-in-entry-observation', { projectName })).json();
      if (observation.controlSequence.includes('permit-arm-held')) break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(observation.processCommandRequests, 0);
    assert.equal(observation.processAtomicCalls, 0);
    assert.deepEqual(observation.permits.map(permit => ({ state: permit.state, consumed: permit.consumed })), [
      { state: 'armed', consumed: 0 },
    ]);
    assert.equal(await fixture.close(), true);
    closed = true;
  } finally {
    if (!closed) await fixture.close().catch(() => undefined);
  }
});

test('inert fixture returns only scoped retained and current process rows with one shared fixture suffix', async () => {
  const fixture = await startAuthenticatedHostedSignInEntryFixture();
  try {
    const setupResponse = await fetch(`${fixture.controlBaseUrl}/control/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-enterprise-lifecycle-control': fixture.controlToken },
      body: JSON.stringify({ projectName: 'desktop-chromium' }),
    });
    assert.equal(setupResponse.status, 200);
    const setup = await setupResponse.json();
    const suffix = /\[run 12345[.]1 [0-9a-f]{12}\]$/u.exec(setup.aliases.process)?.[0];
    assert.ok(suffix);
    assert.equal(setup.deliveryProject.name.endsWith(suffix), true);

    const signIn = await fetch(`${fixture.baseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'reviewer.desktop-chromium@local.invalid',
        password: 'synthetic-reviewer-password',
      }),
    });
    assert.equal(signIn.status, 200);
    const session = await signIn.json();
    const headers = { authorization: `Bearer ${session.access_token}`, apikey: fixture.publicAnonKey };
    const scopedQuery = new URLSearchParams({
      org_id: `eq.${AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_SCOPE.organizationId}`,
      workspace_id: `eq.${AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_SCOPE.workspaceId}`,
    });
    const missingApiKey = await fetch(`${fixture.baseUrl}/rest/v1/assess_processes?${scopedQuery}`, {
      headers: { authorization: `Bearer ${session.access_token}` },
    });
    assert.equal(missingApiKey.status, 401);
    const scoped = await fetch(`${fixture.baseUrl}/rest/v1/assess_processes?${scopedQuery}`, { headers });
    assert.equal(scoped.status, 200);
    const rows = await scoped.json();
    assert.equal(rows.length, 3);
    assert.equal(rows[0].name, setup.aliases.process);
    assert.equal(rows[1].name, 'desktop-chromium connected lifecycle');
    assert.equal(rows[2].name, `${setup.aliases.process} prefix decoy`);

    const foreignQuery = new URLSearchParams({
      org_id: `eq.${AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_SCOPE.organizationId}`,
      workspace_id: 'eq.30000000-0000-4000-8000-000000000099',
    });
    const foreign = await fetch(`${fixture.baseUrl}/rest/v1/assess_processes?${foreignQuery}`, { headers });
    assert.equal(foreign.status, 200);
    assert.deepEqual(await foreign.json(), []);
  } finally {
    assert.equal(await fixture.close(), true);
  }
});

test('inert reviewer session omits process update authority and rejects only a valid current-row command', async () => {
  const fixture = await startAuthenticatedHostedSignInEntryFixture();
  try {
    const setupResponse = await fetch(`${fixture.controlBaseUrl}/control/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-enterprise-lifecycle-control': fixture.controlToken },
      body: JSON.stringify({ projectName: 'desktop-chromium' }),
    });
    assert.equal(setupResponse.status, 200);
    const setup = await setupResponse.json();
    const signIn = await fetch(`${fixture.baseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'reviewer.desktop-chromium@local.invalid', password: 'synthetic-reviewer-password',
      }),
    });
    const session = await signIn.json();
    const headers = {
      'content-type': 'application/json', authorization: `Bearer ${session.access_token}`, apikey: fixture.publicAnonKey,
    };
    const tenant = await fetch(`${fixture.baseUrl}/functions/v1/tenant-session`, {
      method: 'POST', headers, body: '{}',
    });
    assert.equal(tenant.status, 200);
    const context = (await tenant.json()).contexts[0];
    assert.deepEqual(context.capabilities, ['assess.read']);
    const query = new URLSearchParams({ org_id: `eq.${context.organizationId}`, workspace_id: `eq.${context.workspaceId}` });
    const rows = await (await fetch(`${fixture.baseUrl}/rest/v1/assess_processes?${query}`, { headers })).json();
    const process = rows.find(row => row.name === setup.aliases.process);
    assert.ok(process);
    const requestId = randomUUID();
    const valid = {
      requestId,
      idempotencyKey: `process.update.${requestId}`,
      commandType: 'process.update',
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      authorizationVersion: context.authorizationVersion,
      expectedVersion: process.authority_version,
      payload: {
        processId: process.id,
        name: 'Unauthorized process rename',
        description: process.description,
        department: process.department,
        criticality: process.criticality,
      },
    };
    const denied = await fetch(`${fixture.baseUrl}/functions/v1/process-command`, {
      method: 'POST', headers, body: JSON.stringify(valid),
    });
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), { ok: false, error: {
      code: 'PERMISSION_DENIED', message: 'Process update could not be completed.',
    } });
    const malformed = await fetch(`${fixture.baseUrl}/functions/v1/process-command`, {
      method: 'POST', headers, body: JSON.stringify({ ...valid, expectedVersion: process.authority_version + 1 }),
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: { code: 'INVALID_COMMAND' } });
  } finally {
    assert.equal(await fixture.close(), true);
  }
});

test('shared helper retains the scrub navigation and enters the actual sign-in route', async () => {
  const [source, runnerSource, viteSource] = await Promise.all([
    readFile('tests/browser/authenticatedLifecycleHarness.ts', 'utf8'),
    readFile('scripts/testAuthenticatedHostedSignInEntry.mjs', 'utf8'),
    readFile('vite.authenticated-hosted-sign-in-entry.config.ts', 'utf8'),
  ]);
  const realAuthBranch = source.slice(
    source.indexOf('export const authenticatedLifecycleEnterAs'),
    source.indexOf('export const authenticatedLifecycleClickProduct'),
  );
  assert.match(realAuthBranch, /await page[.]goto\('\/'\);[\s\S]*await page[.]goto\('\/sign-in', \{ waitUntil: 'domcontentloaded' \}\);/u);
  assert.equal((realAuthBranch.match(/await page[.]goto\('\/sign-in'/gu) ?? []).length, 1);
  assert.match(runnerSource, /--config', 'vite[.]authenticated-hosted-sign-in-entry[.]config[.]ts'/u);
  assert.match(runnerSource, /VITE_PR_C_CONTROLLED_HUMAN_ENABLED: 'authorized'/u);
  assert.match(runnerSource, /startAuthenticatedHostedControllerServer/u);
  assert.match(viteSource, /envDir: false as const/u);
  assert.deepEqual(AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS, ['desktop-chromium', 'pixel-7-chromium']);
});
