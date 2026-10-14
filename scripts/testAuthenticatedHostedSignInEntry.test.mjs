import assert from 'node:assert/strict';
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
      verifySessionCalls: [],
      diagnostic: { source: 'browser', project: 'desktop-chromium', operation: 'SIGN_IN', category: 'CREDENTIAL_REJECTED', upstreamCode: 'invalid_credentials' },
      actions: [],
      browserCases: 0,
      serverCases: 0,
    });
  } finally {
    assert.equal(await fixture.close(), true);
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
    const headers = { authorization: `Bearer ${session.access_token}` };
    const scopedQuery = new URLSearchParams({
      org_id: `eq.${AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_SCOPE.organizationId}`,
      workspace_id: `eq.${AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_SCOPE.workspaceId}`,
    });
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
