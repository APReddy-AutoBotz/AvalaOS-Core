import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { connect as connectTls } from 'node:tls';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_CONTRACT_PHASES,
  AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS,
  AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_SCOPE,
  assertAuthenticatedHostedSignInEntryLoopbackUrl,
  authenticatedHostedSignInEntryChildEnvironment,
  startAuthenticatedHostedSignInEntryFixture,
  startAuthenticatedHostedSignInEntryTlsBridge,
} from './testAuthenticatedHostedSignInEntry.mjs';

const BACKEND_HOST = 'abcdefghijklmnopqrst.supabase.co';

const waitFor = async (operation, predicate, message) => {
  const deadline = Date.now() + 2_000;
  let value;
  while (Date.now() < deadline) {
    value = await operation();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(`${message}:${JSON.stringify(value)}`);
};

const startTlsDeliveryRequest = async ({ bridge, ca, accessToken, body,
  requestPath = '/functions/v1/legacy-delivery-query' }) => {
  const proxy = new URL(bridge.origin);
  const socket = await new Promise((resolve, reject) => {
    const candidate = connect({ host: proxy.hostname, port: Number(proxy.port) }, () => {
      candidate.write(`CONNECT ${BACKEND_HOST}:443 HTTP/1.1\r\nHost: ${BACKEND_HOST}:443\r\n\r\n`);
    });
    candidate.once('error', reject);
    candidate.once('data', data => {
      assert.match(data.toString(), /200 Connection Established/u);
      resolve(candidate);
    });
  });
  const encoded = JSON.stringify(body);
  const tls = connectTls({ socket, ca, servername: 'localhost' });
  let resolveHeaders;
  const headers = new Promise(resolve => { resolveHeaders = resolve; });
  const response = new Promise(resolve => {
    const chunks = [];
    let ended = false;
    let headersObserved = false;
    tls.on('data', data => {
      chunks.push(data);
      if (!headersObserved && Buffer.concat(chunks).includes('\r\n\r\n')) {
        headersObserved = true;
        resolveHeaders(Buffer.concat(chunks).toString());
      }
    });
    tls.once('end', () => { ended = true; });
    tls.once('close', () => resolve({ ended, raw: Buffer.concat(chunks).toString() }));
  });
  await new Promise((resolve, reject) => {
    tls.once('secureConnect', resolve);
    tls.once('error', reject);
  });
  tls.write(`POST ${requestPath} HTTP/1.1\r\nHost: ${BACKEND_HOST}\r\nAuthorization: Bearer ${accessToken}\r\napikey: sb_publishable_authenticated_hosted_sign_in_entry\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(encoded)}\r\nConnection: close\r\n\r\n${encoded}`);
  return { response, headers, tls };
};

const assertCommittedDeliverySettlement = (before, after) => {
  const requests = after.requests - before.requests;
  const completed = after.completed - before.completed;
  const terminal = after.terminal - before.terminal;
  const committed = after.committed - before.committed;
  const aborted = after.aborted - before.aborted;
  if (requests < 1 || terminal !== requests || completed !== requests
    || committed !== requests || aborted !== 0) {
    throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_DELIVERY_RESPONSE_NOT_COMMITTED');
  }
  return { requests, completed, terminal, committed, aborted };
};

test('local TLS bridge preserves requests, rejects other targets/redirects and closes owned tunnels', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'avalaos-bridge-test-'));
  let requests = 0;
  const upstream = createServer(async (incoming, outgoing) => {
    requests += 1;
    if (incoming.url === '/redirect') {
      outgoing.writeHead(302, { location: '/must-not-follow' }); outgoing.end(); return;
    }
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    outgoing.writeHead(200, { 'content-type': 'application/json' });
    outgoing.end(JSON.stringify({ method: incoming.method, path: incoming.url,
      body: Buffer.concat(chunks).toString(), authorization: incoming.headers.authorization }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const target = `http://127.0.0.1:${upstream.address().port}`;
  let bridge;
  const sockets = new Set();
  const openTunnel = authority => new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port: Number(new URL(bridge.origin).port) }, () => {
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
    });
    sockets.add(socket);
    socket.once('error', reject);
    socket.once('data', data => resolve({ socket, status: data.toString().split('\r\n')[0] }));
  });
  try {
    await assert.rejects(startAuthenticatedHostedSignInEntryTlsBridge({ directory,
      appBaseUrl: 'https://external.invalid', apiBaseUrl: target }), /NON_LOOPBACK_URL_REJECTED/u);
    bridge = await startAuthenticatedHostedSignInEntryTlsBridge({ directory, appBaseUrl: target, apiBaseUrl: target });
    assert.equal((await fetch(bridge.origin)).status, 403);
    for (const authority of ['external.invalid:443', '127.0.0.1:443', 'constructor:443']) {
      const denied = await openTunnel(authority);
      assert.match(denied.status, /403 Forbidden/u);
      denied.socket.destroy();
    }
    assert.equal(requests, 0);
    const ca = await readFile(path.join(directory, 'loopback-cert.pem'));
    const exchange = async (requestPath, body = '') => {
      const { socket, status } = await openTunnel('abcdefghijklmnopqrst.supabase.co:443');
      assert.match(status, /200 Connection Established/u);
      return new Promise((resolve, reject) => {
        const tls = connectTls({ socket, ca, servername: 'localhost' }, () => {
          tls.write(`POST ${requestPath} HTTP/1.1\r\nHost: abcdefghijklmnopqrst.supabase.co\r\nAuthorization: Bearer synthetic\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
        });
        sockets.add(tls);
        const chunks = [];
        tls.on('data', data => chunks.push(data));
        tls.once('error', reject);
        tls.once('end', () => resolve(Buffer.concat(chunks).toString()));
      });
    };
    const response = await exchange('/request?limit=1', '{"synthetic":true}');
    assert.match(response, /HTTP\/1.1 200/u);
    assert(response.includes('"method":"POST"'));
    assert(response.includes('"path":"/request?limit=1"'));
    assert(response.includes('"authorization":"Bearer synthetic"'));
    assert(response.includes('"body":"{\\"synthetic\\":true}"'));
    assert.match(await exchange('/redirect'), /HTTP\/1.1 502/u);
    assert.equal(requests, 2, 'redirect must not be followed');
    const held = await openTunnel('deploy-preview-264--avalaos-pilot.netlify.app:443');
    const disconnected = new Promise(resolve => held.socket.once('close', resolve));
    const firstClose = bridge.close();
    assert.equal(bridge.close(), firstClose);
    assert.equal(await firstClose, true);
    await disconnected;
    await assert.rejects(fetch(bridge.origin));
  } finally {
    for (const socket of sockets) socket.destroy();
    await bridge?.close();
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert(path.basename(directory).startsWith('avalaos-bridge-test-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('local TLS token gate exposes headers before body and releases within the fixed bound', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'avalaos-token-gate-test-'));
  const marker = 'synthetic-session-body-complete';
  const upstream = createServer(async (incoming, outgoing) => {
    for await (const _chunk of incoming) { /* consume bounded synthetic request */ }
    outgoing.writeHead(200, { 'content-type': 'application/json' });
    outgoing.end(JSON.stringify({ marker }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const target = `http://127.0.0.1:${upstream.address().port}`;
  let bridge;
  let exchange;
  try {
    bridge = await startAuthenticatedHostedSignInEntryTlsBridge({
      directory, appBaseUrl: target, apiBaseUrl: target, tokenBodyGate: true,
    });
    assert.ok(bridge.tokenBodyGate);
    const gate = async action => {
      const response = await fetch(`${bridge.tokenBodyGate.controlUrl}/control/token-body-gate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json',
          'x-authenticated-sign-in-gate': bridge.tokenBodyGate.controlToken },
        body: JSON.stringify({ action }),
      });
      assert.equal(response.status, 200);
      return response.json();
    };
    assert.match(bridge.tokenBodyGate.controlToken, /^[a-f0-9]{64}$/u);
    assert.equal((await gate('arm')).mode, 'armed');
    exchange = await startTlsDeliveryRequest({
      bridge,
      ca: await readFile(path.join(directory, 'loopback-cert.pem')),
      accessToken: 'synthetic',
      requestPath: '/auth/v1/token?grant_type=password',
      body: { email: 'synthetic@local.invalid', password: 'synthetic' },
    });
    const headers = await exchange.headers;
    assert.match(headers, /HTTP\/1.1 200/u);
    assert.equal(headers.includes(marker), false);
    assert.deepEqual(await gate('inspect'), {
      mode: 'holding', headersSent: true, waiting: true, released: false,
      automaticRelease: false, requests: 1, completed: 0,
    });
    await gate('release');
    const completed = await exchange.response;
    assert.equal(completed.ended, true);
    assert(completed.raw.includes(marker));
    assert.deepEqual(await gate('inspect'), {
      mode: 'released', headersSent: true, waiting: false, released: true,
      automaticRelease: false, requests: 1, completed: 1,
    });
  } finally {
    exchange?.tls.destroy();
    await bridge?.close();
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert(path.basename(directory).startsWith('avalaos-token-gate-test-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('held Delivery responses record one committed or aborted terminal outcome through real TLS', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'avalaos-delivery-terminal-test-'));
  let fixture;
  let bridge;
  let primaryFailure = null;
  try {
    fixture = await startAuthenticatedHostedSignInEntryFixture();
    bridge = await startAuthenticatedHostedSignInEntryTlsBridge({
      directory, appBaseUrl: fixture.baseUrl, apiBaseUrl: fixture.baseUrl,
    });
    const ca = await readFile(path.join(directory, 'loopback-cert.pem'));
    const control = async (pathname, body) => {
      const response = await fetch(`${fixture.controlBaseUrl}${pathname}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-enterprise-lifecycle-control': fixture.controlToken },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 200);
      return response.json();
    };
    const prepare = async projectName => {
      const setup = await control('/control/setup', { projectName });
      const signIn = await fetch(`${fixture.baseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: `reviewer.${projectName}@local.invalid`, password: 'synthetic-reviewer-password',
        }),
      });
      assert.equal(signIn.status, 200);
      const session = await signIn.json();
      return {
        accessToken: session.access_token,
        body: {
          schemaVersion: 'legacy-delivery-query.v1',
          organizationId: AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_SCOPE.organizationId,
          workspaceId: AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_SCOPE.workspaceId,
          expectedAuthorizationVersion: 1,
          projectId: setup.deliveryProject.id,
          limit: 100,
          cursor: null,
          sourceGenerationId: null,
          includeRetained: true,
        },
      };
    };
    const inspect = projectName => control('/control/sign-in-entry-delivery-task-gate', {
      projectName, action: 'inspect',
    });
    const gate = (projectName, action) => control('/control/sign-in-entry-delivery-task-gate', {
      projectName, action,
    });
    const abortedProject = 'desktop-chromium';
    const abortedInput = await prepare(abortedProject);
    const abortedBefore = await inspect(abortedProject);
    await gate(abortedProject, 'hold-next');
    const abortedExchange = await startTlsDeliveryRequest({ bridge, ca, ...abortedInput });
    try {
      await waitFor(() => inspect(abortedProject), value => value.mode === 'held' && value.waiting === 1,
        'DELIVERY_ABORTED_REQUEST_NOT_HELD');
    } catch (error) {
      const early = await Promise.race([
        abortedExchange.response,
        new Promise(resolve => setTimeout(() => resolve(null), 250)),
      ]);
      if (early) {
        const status = /^HTTP\/1[.]1 ([0-9]{3})/u.exec(early.raw)?.[1] ?? 'missing';
        const category = early.raw.includes('INVALID_COMMAND') ? 'INVALID_COMMAND'
          : early.raw.includes('AUTHENTICATION_REQUIRED') ? 'AUTHENTICATION_REQUIRED' : 'UNKNOWN';
        throw new Error(`DELIVERY_ABORTED_REQUEST_EARLY_RESPONSE:${status}:${category}`, { cause: error });
      }
      throw error;
    }
    abortedExchange.tls.destroy();
    const disconnected = await abortedExchange.response;
    assert.equal(disconnected.ended, false);
    const abortedTerminal = await waitFor(() => inspect(abortedProject),
      value => value.terminal === abortedBefore.terminal + 1 && value.completed === abortedBefore.completed
        && value.aborted === abortedBefore.aborted + 1,
      'DELIVERY_ABORTED_TERMINAL_OUTCOME_MISSING');
    await gate(abortedProject, 'release');
    await waitFor(() => inspect(abortedProject), value => value.mode === 'open' && value.waiting === 0,
      'DELIVERY_ABORTED_HANDLER_NOT_RELEASED');
    assert.throws(() => assertCommittedDeliverySettlement(abortedBefore, abortedTerminal),
      /AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_DELIVERY_RESPONSE_NOT_COMMITTED/u);

    const committedProject = 'pixel-7-chromium';
    const committedInput = await prepare(committedProject);
    const committedBefore = await inspect(committedProject);
    await gate(committedProject, 'hold-next');
    const committedExchange = await startTlsDeliveryRequest({ bridge, ca, ...committedInput });
    await waitFor(() => inspect(committedProject), value => value.mode === 'held' && value.waiting === 1,
      'DELIVERY_COMMITTED_REQUEST_NOT_HELD');
    await gate(committedProject, 'reject');
    const connected = await committedExchange.response;
    assert.equal(connected.ended, true);
    assert.match(connected.raw, /HTTP\/1[.]1 503 Service Unavailable/u);
    assert.match(connected.raw, /QUERY_UNAVAILABLE/u);
    const committedTerminal = await waitFor(() => inspect(committedProject), value =>
      value.completed === committedBefore.completed + 1 && value.committed === committedBefore.committed + 1
        && value.terminalSignals >= committedBefore.terminalSignals + 2,
    'DELIVERY_COMMITTED_TERMINAL_OUTCOME_MISSING');
    assert.deepEqual(assertCommittedDeliverySettlement(committedBefore, committedTerminal), {
      requests: 1, completed: 1, terminal: 1, committed: 1, aborted: 0,
    });
    assert.equal(committedTerminal.duplicateTerminalSignals - committedBefore.duplicateTerminalSignals, 1,
      'finish plus close must publish one terminal outcome');
  } catch (error) {
    primaryFailure = error;
  }
  const cleanupErrors = [];
  try { if (bridge) assert.equal(await bridge.close(), true); } catch (error) { cleanupErrors.push(error); }
  try { if (fixture) assert.equal(await fixture.close(), true); } catch (error) { cleanupErrors.push(error); }
  try {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert(path.basename(directory).startsWith('avalaos-delivery-terminal-test-'));
    await rm(directory, { recursive: true, force: true });
  } catch (error) { cleanupErrors.push(error); }
  if (primaryFailure) {
    if (cleanupErrors.length) Object.defineProperty(primaryFailure, 'cause', {
      value: new AggregateError(cleanupErrors, 'DELIVERY_TERMINAL_TEST_CLEANUP_FAILED'), configurable: true,
    });
    throw primaryFailure;
  }
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'DELIVERY_TERMINAL_TEST_CLEANUP_FAILED');
});

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
      tenantSessionRequests: 0,
      tenantSessionCompleted: 0,
      processReadRequests: 0,
      processReadCompleted: 0,
      projectIndexRequests: 0,
      projectIndexCompleted: 0,
      anonymousProcessCommandRequests: 0,
      processAtomicCalls: 0,
      verifySessionCalls: [],
      controlSequence: [],
      permits: [],
      diagnostic: { source: 'browser', project: 'desktop-chromium', operation: 'SIGN_IN', category: 'CREDENTIAL_REJECTED', upstreamCode: 'invalid_credentials' },
      actions: [],
      assessment: {
        mode: 'single-readback', status: null, version: null, commandTypes: [],
        finalizedReadbacks: 0, waiting: 0,
      },
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
    const closing = fixture.close();
    assert.equal(fixture.close(), closing, 'concurrent close must join the same cleanup');
    assert.equal(await closing, true);
    closed = true;
    await assert.rejects(fetch(`${fixture.controlBaseUrl}/health`), /fetch failed/iu);
    await assert.rejects(fetch(`${fixture.baseUrl}/health`), /fetch failed/iu);
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

test('inert fixture provisions and binds one distinct canonical Delivery owner session', async () => {
  const fixture = await startAuthenticatedHostedSignInEntryFixture();
  try {
    const projectName='desktop-chromium';
    const setupResponse=await fetch(`${fixture.controlBaseUrl}/control/setup`,{
      method:'POST',headers:{'content-type':'application/json','x-enterprise-lifecycle-control':fixture.controlToken},
      body:JSON.stringify({projectName}),
    });
    assert.equal(setupResponse.status,200);
    const setup=await setupResponse.json();
    const owner=setup.actors.deliveryOwner;
    assert.ok(owner);
    for(const persona of ['author','reviewer','approver','outsider']){
      assert.notEqual(owner.user.id,setup.actors[persona].user.id);
    }
    const signIn=await fetch(`${fixture.baseUrl}/auth/v1/token?grant_type=password`,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({email:`deliveryOwner.${projectName}@local.invalid`,
        password:'synthetic-delivery-owner-password'}),
    });
    assert.equal(signIn.status,200);
    const session=await signIn.json();
    const bound=await fetch(`${fixture.controlBaseUrl}/control/bind-browser-session`,{
      method:'POST',headers:{'content-type':'application/json','x-enterprise-lifecycle-control':fixture.controlToken},
      body:JSON.stringify({projectName,persona:'deliveryOwner',accessToken:session.access_token}),
    });
    assert.equal(bound.status,200);
    const observation=await (await fetch(`${fixture.controlBaseUrl}/control/sign-in-entry-observation`,{
      method:'POST',headers:{'content-type':'application/json','x-enterprise-lifecycle-control':fixture.controlToken},
      body:JSON.stringify({projectName}),
    })).json();
    assert.deepEqual(observation.bindings.map(({actor,persona})=>({actor,persona})),[
      {actor:'E',persona:'deliveryOwner'},
    ]);
  } finally {
    assert.equal(await fixture.close(),true);
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
  const [source, runnerSource, viteSource, specSource, playwrightSource, assessmentSource] = await Promise.all([
    readFile('tests/browser/authenticatedLifecycleHarness.ts', 'utf8'),
    readFile('scripts/testAuthenticatedHostedSignInEntry.mjs', 'utf8'),
    readFile('vite.authenticated-hosted-sign-in-entry.config.ts', 'utf8'),
    readFile('tests/browser/authenticatedHostedSignInEntry.spec.ts', 'utf8'),
    readFile('playwright.authenticated-hosted-sign-in-entry.config.ts', 'utf8'),
    readFile('tests/browser/enterpriseLifecycleAcceptance/v1AssessmentCompletion.ts', 'utf8'),
  ]);
  const realAuthBranch = source.slice(
    source.indexOf('export const authenticatedLifecycleEnterAs'),
    source.indexOf('export const authenticatedLifecycleClickProduct'),
  );
  assert.match(realAuthBranch, /await page[.]goto\('\/', \{ waitUntil: 'domcontentloaded', timeout: 15_000 \}\);[\s\S]*await page[.]goto\('\/sign-in', \{ waitUntil: 'domcontentloaded' \}\);/u);
  assert.equal((realAuthBranch.match(/await page[.]goto\('\/sign-in'/gu) ?? []).length, 1);
  assert.match(runnerSource, /--config', 'vite[.]authenticated-hosted-sign-in-entry[.]config[.]ts'/u);
  assert.match(runnerSource, /VITE_PR_C_CONTROLLED_HUMAN_ENABLED: 'authorized'/u);
  assert.match(runnerSource, /startAuthenticatedHostedControllerServer/u);
  assert.match(runnerSource, /for \(const contractPhase of phases\)[\s\S]*runAuthenticatedHostedSignInEntryPhase/u);
  assert.match(runnerSource, /AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_CONTRACT_PHASE: contractPhase/u);
  assert.deepEqual(AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_CONTRACT_PHASES,
    ['session-persistence', 'entry', 'assessment-negatives', 'assessment-positives', 'safety']);
  assert.match(runnerSource, /tokenBodyGate: contractPhase === 'session-persistence'/u);
  assert.match(runnerSource, /AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_TOKEN_GATE_URL/u);
  assert.match(realAuthBranch, /authenticatedLifecycleExpectedAuthStorageKey/u);
  assert.match(realAuthBranch, /authenticatedLifecycleReadStoredSession/u);
  assert.match(realAuthBranch, /onHostedSessionPending/u);
  assert.match(realAuthBranch, /hostedRealAuthSessionLimitMs/u);
  assert.doesNotMatch(realAuthBranch, /Object[.]keys\(localStorage\)[.]find\(candidate => candidate[.]startsWith\('sb-'\)\)/u);
  assert.match(specSource, /AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_CONTRACT_PHASE_REJECTED/u);
  assert.match(specSource, /contractPhase === 'session-persistence'/u);
  assert.match(specSource, /sessionPendingObserved/u);
  assert.match(specSource, /mode: 'holding', headersSent: true, waiting: true/u);
  assert.match(specSource, /AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_CONTRACT_PHASE_MODE_REJECTED/u);
  assert.match(assessmentSource,
    /scopedTimeoutMs > overallTimeoutMs[\s\S]*V1_ASSESSMENT_DISCOVERY_VISIBILITY_TIMEOUT_INVALID/u);
  assert.match(assessmentSource,
    /await (?:resume|start)[.]click[\s\S]*resolveV1AssessmentDiscoveryVisibilityTimeoutMs\([\s\S]*options[.]discoveryVisibilityTimeoutMs,[\s\S]*deadline[.]remaining\(\)[\s\S]*waitFor\(\{[\s\S]*state: 'visible',[\s\S]*timeout: visibilityTimeoutMs/u);
  assert.match(specSource,
    /\[0, Number[.]NaN, -1, 15_001\][\s\S]*toEqual\(beforeInvalidDiscoveryTimeout\)/u);
  assert.match(specSource,
    /completeV1\(15_000, \{[\s\S]*discoveryVisibilityTimeoutMs: 300,[\s\S]*page[.]waitForTimeout\(350\)[\s\S]*status: null, version: null, commandTypes: \[\], finalizedReadbacks: 0, waiting: 0/u);
  assert.match(playwrightSource, /timeout: 60_000/u);
  assert.match(playwrightSource, /actionTimeout: 10_000/u);
  assert.match(playwrightSource, /navigationTimeout: 20_000/u);
  assert.match(viteSource, /envDir: false as const/u);
  assert.deepEqual(AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS, ['desktop-chromium', 'pixel-7-chromium']);
});
