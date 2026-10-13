import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { chromium } from '@playwright/test';

import { AuthenticatedHostedBrowserActionTracker,
  AUTHENTICATED_HOSTED_PUBLIC_ATTESTATION_PATH,
  createAuthenticatedHostedRequestClassifier } from './authenticatedHostedBrowserRequestClassifier.mjs';
import { AuthenticatedHostedController,
  startAuthenticatedHostedControllerServer } from './authenticatedHostedController.mjs';

const execFileAsync = promisify(execFile);
const actorId = '10000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000002';
const projectName = 'desktop-chromium-preauth';
const token = `${Buffer.from('{}').toString('base64url')}.${
  Buffer.from(JSON.stringify({ sub: actorId, session_id: sessionId })).toString('base64url')}.${'x'.repeat(48)}`;

const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') return reject(new Error('PREAUTH_SERVER_ADDRESS_REJECTED'));
    resolve(`http://127.0.0.1:${address.port}`);
  });
});
const close = server => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
const gitStatus = async () => (await execFileAsync('git', ['-c', 'core.fsmonitor=false', 'status', '--porcelain=v1',
  '--untracked-files=all'], { cwd: process.cwd(), maxBuffer: 8 * 1024 * 1024 })).stdout;
const readJson = request => new Promise((resolve, reject) => {
  const chunks = [];
  request.on('data', chunk => chunks.push(Buffer.from(chunk)));
  request.once('error', reject);
  request.once('end', () => {
    try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (error) { reject(error); }
  });
});

const main = async () => {
  const beforeStatus = await gitStatus();
  const ownedTemp = await mkdtemp(path.join(os.tmpdir(), 'authenticated-preauth-tracking-'));
  let controllerServer = null;
  let backendServer = null;
  let appServer = null;
  let browser = null;
  try {
  let tick = Date.parse('2026-10-13T00:00:00.000Z');
  const observations = [];
  const sessionBindings = [];
  const controller = new AuthenticatedHostedController({ config: { scope: {} },
    now: () => new Date(tick),
    adapter: {
      observe: async () => ({ capturedAt: new Date(tick += 1_000).toISOString(), records: [] }),
      bindSession: async value => { sessionBindings.push(value); },
      recordBrowserAction: async value => { observations.push({ route: value.route, status: value.status }); },
    },
    identity: { verifySession: async value => ({ actorId: value.actorId, sessionId: value.sessionId }) },
  });
  controller.projects.set(projectName, {
    identities: { author: { id: actorId, email: 'fixture-author@example.invalid' } },
  });
  controllerServer = await startAuthenticatedHostedControllerServer(controller);
  const postControlRaw = async (pathname, body) => {
    const response = await fetch(`${controllerServer.baseUrl}${pathname}`, { method: 'POST', headers: {
      'content-type': 'application/json', 'x-enterprise-lifecycle-control': controllerServer.controlToken,
    }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const postControl = async (pathname, body) => {
    const result = await postControlRaw(pathname, body);
    if (result.status !== 200) throw new Error(result.body.error ?? 'PREAUTH_CONTROLLER_REJECTED');
    return result.body;
  };

  let appOrigin = '';
  let serverClassifier = null;
  const backendClassifications = [];
  const arrivals = { preflight: 0, publicAttestation: 0, business: 0, signIn: 0 };
  backendServer = createServer(async (request, response) => {
    response.setHeader('access-control-allow-origin', appOrigin);
    response.setHeader('access-control-allow-methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    response.setHeader('access-control-allow-headers', 'authorization, apikey, content-type');
    response.setHeader('content-type', 'application/json');
    if (serverClassifier) backendClassifications.push(serverClassifier({
      url: `${backendOrigin}${request.url}`, method: request.method, headers: request.headers,
    }));
    if (request.method === 'OPTIONS') { arrivals.preflight += 1; response.writeHead(204); return response.end(); }
    const url = new URL(request.url, 'http://backend.invalid');
    if (request.method === 'POST' && url.pathname === AUTHENTICATED_HOSTED_PUBLIC_ATTESTATION_PATH) {
      arrivals.publicAttestation += 1; await readJson(request); response.writeHead(200);
      return response.end(JSON.stringify({ status: 'attested' }));
    }
    if (request.method === 'POST' && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      arrivals.signIn += 1; await readJson(request); response.writeHead(200);
      return response.end(JSON.stringify({ access_token: token, user: { id: actorId } }));
    }
    if (request.method === 'POST' && url.pathname === '/functions/v1/process-command') {
      arrivals.business += 1; await readJson(request); response.writeHead(403);
      return response.end(JSON.stringify({ error: { code: 'PERMISSION_DENIED' } }));
    }
    response.writeHead(404); response.end(JSON.stringify({ error: 'NOT_FOUND' }));
  });
  const backendOrigin = await listen(backendServer);
  appServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    response.end('<!doctype html><html><body><main>pre-auth tracking fixture</main></body></html>');
  });
  appOrigin = (await listen(appServer)).replace('127.0.0.1', 'localhost');
  serverClassifier = createAuthenticatedHostedRequestClassifier({ backendOrigin, appOrigin });

    const classifications = [];
    const expectedAuthorityRejections = new WeakSet();
    const eventTasks = [];
    const eventErrors = [];
    const queueEvent = promise => eventTasks.push(Promise.resolve(promise).catch(error => {
      eventErrors.push(error);
    }));
    let oldPathnameRejection = null;
    const tracker = new AuthenticatedHostedBrowserActionTracker({ backendOrigin, appOrigin,
      startAction: input => postControl('/control/browser-action-start', { projectName, ...input }),
      finishAction: input => postControl('/control/browser-action', { projectName, ...input }),
    });
    browser = await chromium.launch({ downloadsPath: ownedTemp });
    const probeContext = await browser.newContext({ serviceWorkers: 'block' });
    const probeTasks = [];
    probeContext.on('request', request => {
      probeTasks.push(tracker.classify(request).then(classification => {
        const url = new URL(request.url());
        classifications.push({ kind: classification.kind, method: request.method(), pathname: url.pathname });
      }));
    });
    const probePage = await probeContext.newPage();
    await probePage.goto(appOrigin);
    assert.equal(await probePage.evaluate(async ({ backend, attestationPath }) => {
      const response = await fetch(`${backend}${attestationPath}`, { method: 'POST', headers: {
        apikey: 'fixture-public-key', 'content-type': 'application/json',
      }, body: JSON.stringify({ release: 'preflight-probe' }) });
      return response.status;
    }, { backend: backendOrigin, attestationPath: AUTHENTICATED_HOSTED_PUBLIC_ATTESTATION_PATH }), 200);
    await Promise.all(probeTasks);
    await probeContext.close();
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)
        || ![appOrigin, backendOrigin].includes(url.origin)) return route.abort('blockedbyclient');
      const classification = await tracker.classify(request);
      classifications.push({ kind: classification.kind, method: request.method(), pathname: url.pathname });
      if (classification.kind === 'public-attestation' && oldPathnameRejection === null) {
        oldPathnameRejection = await postControlRaw('/control/browser-action-start', { projectName,
          accessToken: '', requestBody: { method: request.method(), route: classification.route },
          route: classification.route });
      }
      try { await tracker.begin(request); }
      catch (error) {
        const headers = await request.allHeaders();
        if (classification.kind === 'business-action' && !headers.authorization) {
          expectedAuthorityRejections.add(request);
          return route.abort('blockedbyclient');
        }
        throw error;
      }
      return route.continue();
    });
    context.on('response', response => {
      const request = response.request();
      queueEvent((async () => {
        const classification = await tracker.classify(request);
        if (classification.kind !== 'business-action') return;
        await tracker.finish(request, response.status(), await response.json().catch(() => ({})));
      })());
    });
    context.on('requestfailed', request => {
      if (expectedAuthorityRejections.has(request)) return;
      queueEvent(tracker.finish(request, 0, { error: { code: 'BROWSER_TRANSPORT_FAILURE' } }));
    });
    const page = await context.newPage();
    await page.goto(appOrigin);
    const result = await page.evaluate(async ({ backend, attestationPath }) => {
      const publicResponse = await fetch(`${backend}${attestationPath}`, { method: 'POST', headers: {
        apikey: 'fixture-public-key', 'content-type': 'application/json',
      }, body: JSON.stringify({ release: 'fixture' }) });
      const signIn = await fetch(`${backend}/auth/v1/token?grant_type=password`, { method: 'POST', headers: {
        apikey: 'fixture-public-key', 'content-type': 'application/json',
      }, body: JSON.stringify({ email: 'fixture-author@example.invalid', password: 'fixture-password' }) });
      const session = await signIn.json();
      const denied = await fetch(`${backend}/functions/v1/process-command`, { method: 'POST', headers: {
        authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json',
      }, body: JSON.stringify({ requestId: '30000000-0000-4000-8000-000000000003', commandType: 'process.update' }) });
      let unauthenticatedRejected = false;
      try {
        await fetch(`${backend}/functions/v1/process-command`, { method: 'POST', headers: {
          'content-type': 'application/json',
        }, body: JSON.stringify({ requestId: '40000000-0000-4000-8000-000000000004', commandType: 'process.update' }) });
      } catch { unauthenticatedRejected = true; }
      return { publicStatus: publicResponse.status, signInStatus: signIn.status,
        deniedStatus: denied.status, unauthenticatedRejected };
    }, { backend: backendOrigin, attestationPath: AUTHENTICATED_HOSTED_PUBLIC_ATTESTATION_PATH });
    for (let processed = 0; processed < eventTasks.length;) {
      const pending = eventTasks.slice(processed); processed = eventTasks.length; await Promise.all(pending);
    }
    if (eventErrors.length) throw eventErrors[0];
    assert.deepEqual(result, { publicStatus: 200, signInStatus: 200, deniedStatus: 403,
      unauthenticatedRejected: true });
    assert.equal(oldPathnameRejection?.status, 409);
    assert.equal(oldPathnameRejection?.body?.error, 'AUTHENTICATED_HOSTED_CONTROLLER_SESSION_TOKEN_REJECTED');
    assert.equal(arrivals.publicAttestation, 2);
    assert.equal(arrivals.signIn, 1);
    assert.equal(arrivals.business, 1, 'the unauthenticated business POST must be rejected before the backend');
    assert.ok(arrivals.preflight >= 1);
    assert.ok(classifications.some(value => value.kind === 'public-attestation'
      && value.method === 'POST' && value.pathname === AUTHENTICATED_HOSTED_PUBLIC_ATTESTATION_PATH));
    assert.ok(backendClassifications.some(value => value.kind === 'cors-preflight'
      && value.route === AUTHENTICATED_HOSTED_PUBLIC_ATTESTATION_PATH));
    assert.equal(sessionBindings.length, 1);
    assert.deepEqual(observations, [{ route: '/functions/v1/process-command', status: 403 }]);
    const actions = controller.browserActions.get(projectName) ?? [];
    assert.equal(actions.length, 1);
    assert.equal(actions[0].complete, true);
    assert.equal(actions[0].status, 403);
    await context.close();
  } finally {
    const cleanupErrors = [];
    try { await browser?.close(); } catch (error) { cleanupErrors.push(error); }
    const closures = [];
    if (appServer?.listening) closures.push(close(appServer));
    if (backendServer?.listening) closures.push(close(backendServer));
    if (controllerServer) closures.push(controllerServer.close());
    const closed = await Promise.allSettled(closures);
    for (const result of closed) if (result.status === 'rejected') cleanupErrors.push(result.reason);
    try { await rm(ownedTemp, { recursive: true, force: true }); } catch (error) { cleanupErrors.push(error); }
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'AUTHENTICATED_PREAUTH_TRACKING_CLEANUP_FAILED');
  }
  assert.equal(await gitStatus(), beforeStatus, 'the browser proof must not change checkout state');
  console.log('authenticated hosted pre-auth tracking: real two-origin browser boundary passed; transport-only, no hosted acceptance PASS');
};

await main();
