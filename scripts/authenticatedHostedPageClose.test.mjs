import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createServer } from 'node:http';
import ts from 'typescript';
import { chromium, devices } from '@playwright/test';
import { AuthenticatedHostedBrowserActionTracker } from './authenticatedHostedBrowserRequestClassifier.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startAuthenticatedHostedSignInEntryFixture, startAuthenticatedHostedSignInEntryTlsBridge,
    AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_SCOPE } from './testAuthenticatedHostedSignInEntry.mjs';
const exports = {};
new Function('exports', 'require', ts.transpileModule(fs.readFileSync('tests/browser/authenticatedHostedNetwork.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports, () => ({ AuthenticatedHostedBrowserActionTracker }));
const { installAuthenticatedHostedNetwork, authenticatedLifecycleSettleActorNavigationBoundary, authenticatedHostedClosePageAfterOwnedNetwork } = exports;
const closeScopedAdmissionResources = async (operations, primaryFailure) => {
    const failures = [];
    for (const operation of operations) {
        try { await operation(); } catch (error) { failures.push(error); }
    }
    if (primaryFailure) {
        if (failures.length) Object.defineProperty(primaryFailure, 'cause', {
            value: new AggregateError([...(primaryFailure.cause ? [primaryFailure.cause] : []), ...failures],
                'SCOPED_ADMISSION_CLEANUP_FAILED'), configurable: true,
        });
        throw primaryFailure;
    }
    if (failures.length) throw new AggregateError(failures, 'SCOPED_ADMISSION_CLEANUP_FAILED');
};
test('scoped regression cleanup attempts every close and retains the primary failure', async () => {
    const primary = new Error('PRIMARY_TEST_FAILURE'), closing = new Error('OWNED_CLOSE_FAILURE');
    const closed = [];
    const operations = [
        async () => { closed.push('browser'); throw closing; },
        async () => { closed.push('bridge'); },
        async () => { closed.push('fixture'); },
    ];
    await assert.rejects(closeScopedAdmissionResources(operations, primary), error =>
        error === primary && error.cause instanceof AggregateError && error.cause.errors[0] === closing);
    assert.deepEqual(closed, ['browser', 'bridge', 'fixture']);
    closed.length = 0;
    await assert.rejects(closeScopedAdmissionResources(operations), error =>
        error instanceof AggregateError && error.errors[0] === closing);
    assert.deepEqual(closed, ['browser', 'bridge', 'fixture']);
});
test('scoped navigation drains prior-document Delivery work before arming its response gate', { timeout: 45_000 }, async () => {
    const app = createServer((_request, response) => response.end('<title>Scoped navigation lifecycle</title>'));
    await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
    const directory = await mkdtemp(path.join(tmpdir(), 'avalaos-scoped-admission-'));
    const outcomes = [];
    let primaryFailure;
    try {
        for (const drainBeforeArm of [false, true]) {
            let fixture, bridge, browser, releaseDispatch, releaseFresh;
            let armFailure;
            try {
                fixture = await startAuthenticatedHostedSignInEntryFixture();
                bridge = await startAuthenticatedHostedSignInEntryTlsBridge({ directory,
                    appBaseUrl: `http://127.0.0.1:${app.address().port}`, apiBaseUrl: fixture.baseUrl });
                const control = async (pathname, body) => {
                    const response = await fetch(`${fixture.controlBaseUrl}${pathname}`, { method: 'POST',
                        headers: { 'content-type': 'application/json', 'x-enterprise-lifecycle-control': fixture.controlToken },
                        body: JSON.stringify({ projectName: 'desktop-chromium', ...body }) });
                    assert.equal(response.status, 200);
                    return response.json();
                };
                const gate = action => control('/control/sign-in-entry-delivery-task-gate', { action });
                const poll = async predicate => {
                    const deadline = Date.now() + 10_000;
                    while (Date.now() < deadline) {
                        const value = await gate('inspect');
                        if (predicate(value)) return value;
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }
                    assert.fail('SCOPED_ADMISSION_GATE_STATE_NOT_REACHED');
                };
                const setup = await control('/control/setup', {});
                const login = await fetch(`${fixture.baseUrl}/auth/v1/token?grant_type=password`, {
                    method: 'POST', headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ email: 'reviewer.desktop-chromium@local.invalid', password: 'synthetic-reviewer-password' }) });
                assert.equal(login.status, 200);
                const { access_token: accessToken } = await login.json();
                browser = await chromium.launch({ headless: true,
                    args: [`--ignore-certificate-errors-spki-list=${bridge.certificateSpki}`] });
                const context = await browser.newContext({ serviceWorkers: 'block', proxy: { server: bridge.origin } });
                const page = await context.newPage();
                await exports.authenticatedHostedConfigureChromiumDurableResponseBodies(context, page);
                page.setDefaultTimeout(10_000);
                page.setDefaultNavigationTimeout(20_000);
                const active = new Set(), errors = [];
                let starts = 0, finishes = 0, tail = Promise.resolve(), notifyDispatch, notifyFresh, dispatchCount = 0;
                const dispatched = new Promise(resolve => { notifyDispatch = resolve; });
                const dispatch = new Promise(resolve => { releaseDispatch = resolve; });
                const freshDispatched = new Promise(resolve => { notifyFresh = resolve; });
                const freshDispatch = new Promise(resolve => { releaseFresh = resolve; });
                const tracker = new AuthenticatedHostedBrowserActionTracker({ backendOrigin: fixture.backendOrigin,
                    appOrigin: fixture.previewOrigin,
                    startAction: ({ accessToken: token }) => {
                        assert.equal(token, accessToken);
                        const actionId = `scoped-${++starts}`; active.add(actionId); return { actionId };
                    },
                    finishAction: ({ actionId }) => { assert(active.delete(actionId)); finishes += 1; },
                });
                const lifecycle = await installAuthenticatedHostedNetwork({ context, hosted: true,
                    allowedOrigins: new Set([fixture.backendOrigin, fixture.previewOrigin]), tracker,
                    queueNetworkAction: (operation, ownedWork) => {
                        void ownedWork?.catch(error => errors.push(error));
                        tail = tail.then(operation).catch(error => errors.push(error));
                    },
                    onExternalRequest: () => assert.fail('external request'), onHttpRequest: () => {},
                    onTrackerError: error => errors.push(error),
                    dispatchAllowedRequest: async route => {
                        if (route.request().method() === 'POST' && route.request().url().endsWith('/functions/v1/legacy-delivery-query')) {
                            dispatchCount += 1;
                            if (dispatchCount === 1) { notifyDispatch(); await dispatch; }
                            if (dispatchCount === 2) { notifyFresh(); await freshDispatch; }
                        }
                        await route.continue();
                    },
                });
                const settle = () => authenticatedLifecycleSettleActorNavigationBoundary({
                    settleActionAdmissions: lifecycle.settleActionAdmissions,
                    settleResponseBodies: lifecycle.settleResponseBodies,
                    drainNetworkActions: async () => {
                        for (;;) { const current = tail; await current; if (current === tail) break; }
                        if (errors.length) throw errors[0];
                    }, activeActionCount: () => active.size,
                });
                await page.goto(fixture.previewOrigin);
                const query = async version => {
                    const observed = page.waitForRequest(request => request.method() === 'POST'
                        && request.url() === `${fixture.backendOrigin}/functions/v1/legacy-delivery-query`
                        && request.postDataJSON()?.expectedAuthorizationVersion === version);
                    void observed.catch(() => {});
                    await page.evaluate(({ url, accessToken: token, publicAnonKey, body }) => {
                    void fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`,
                        apikey: publicAnonKey, 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(response => response.json()).catch(() => {});
                }, { url: `${fixture.backendOrigin}/functions/v1/legacy-delivery-query`, accessToken,
                    publicAnonKey: fixture.publicAnonKey, body: { schemaVersion: 'legacy-delivery-query.v1',
                        ...AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_SCOPE, expectedAuthorizationVersion: version,
                        projectId: setup.deliveryProject.id, limit: 100, cursor: null, sourceGenerationId: null, includeRetained: true } });
                    return observed;
                };
                const oldRequest = await query(1);
                await dispatched;
                assert.equal(active.size, 1);
                // Delay dispatch only: the old document's real request has already
                // entered the production tracker. Reload supplies the real abort.
                if (drainBeforeArm) {
                    let drained = false;
                    const draining = settle().then(() => { drained = true; });
                    await new Promise(resolve => setImmediate(resolve));
                    assert.equal(drained, false);
                    releaseDispatch();
                    await draining;
                    assert.equal(active.size, 0);
                }
                const before = await gate('inspect');
                await gate('hold-next');
                releaseDispatch();
                if (!drainBeforeArm) await poll(value => value.waiting === 1);
                const oldFailure = !drainBeforeArm ? page.waitForEvent('requestfailed', {
                    predicate: request => request === oldRequest,
                }) : null;
                await page.reload({ waitUntil: 'domcontentloaded' });
                if (!drainBeforeArm) {
                    await oldFailure;
                    assert(oldRequest.failure());
                    await poll(value => value.aborted === 1);
                }
                const beforeFresh = await gate('inspect');
                const freshRequest = await query(1);
                await freshDispatched;
                // The old predicate already passes for the aborted waiter before
                // this fresh request reaches the fixture. Require its own admission.
                assert.equal(beforeFresh.waiting === 1 && beforeFresh.requests === beforeFresh.completed + 1, !drainBeforeArm);
                let freshObserved = false;
                const admittedFresh = poll(value => {
                    const versions = value.authorityVersions.slice(beforeFresh.authorityVersions.length);
                    const completed = drainBeforeArm ? 0 : 1;
                    return versions.length === 1 && versions[0] === 1 && value.requests === beforeFresh.requests + 1
                        && value.completed === beforeFresh.completed + completed && value.terminal === beforeFresh.terminal + completed
                        && value.committed === beforeFresh.committed + completed && value.aborted === beforeFresh.aborted
                        && value.waiting === 1;
                }).then(value => { freshObserved = true; return value; });
                await new Promise(resolve => setImmediate(resolve));
                assert.equal(freshObserved, false);
                releaseFresh();
                await admittedFresh;
                if (!drainBeforeArm) {
                    const response = await freshRequest.response();
                    assert.equal(response.status(), 200);
                    assert.equal(await response.finished(), null);
                }
                assert.deepEqual(await control('/control/sign-in-entry-authority-version', { action: 'advance' }), { current: 2, priorRead: 1 });
                const beforeCurrent = await gate('inspect');
                const currentRequest = await query(2);
                const pending = await poll(value => {
                    const versions = value.authorityVersions.slice(beforeCurrent.authorityVersions.length);
                    return versions.length === 1 && versions[0] === 2 && value.requests === beforeCurrent.requests + 1
                        && value.completed === beforeCurrent.completed + 1 && value.terminal === beforeCurrent.terminal + 1
                        && value.committed === beforeCurrent.committed + 1 && value.aborted === beforeCurrent.aborted
                        && value.waiting === 1;
                });
                const currentResponse = await currentRequest.response();
                assert.equal(currentResponse.status(), 200);
                assert.equal(await currentResponse.finished(), null);
                assert.equal(pending.requests === pending.terminal + 1, drainBeforeArm);
                assert.equal(pending.aborted - before.aborted, drainBeforeArm ? 0 : 1);
                const heldRequest = drainBeforeArm ? freshRequest : oldRequest;
                const late = page.waitForResponse(response => response.request() === heldRequest
                    && response.status() === 503 && response.request().postDataJSON()?.expectedAuthorizationVersion === 1)
                    .then(response => ({ response }), error => ({ error }));
                await gate('reject');
                const result = await late;
                if (drainBeforeArm) {
                    assert.equal(result.error, undefined);
                    assert.equal(await result.response.finished(), null);
                    assert.deepEqual(await result.response.json(), { ok: false, error: {
                        code: 'QUERY_UNAVAILABLE', message: 'Delivery data could not be loaded.' } });
                } else {
                    assert.equal(result.error?.name, 'TimeoutError');
                    assert.match(result.error.message, /page.waitForResponse: Timeout 10000ms exceeded/u);
                }
                await settle();
                const final = await poll(value => value.terminal === value.requests);
                assert.equal(active.size, 0);
                assert.equal(finishes, starts);
                assert.equal(errors.length, 0);
                assert.equal(final.requests, 3);
                assert.equal(starts, 3);
                assert.equal(final.committed, drainBeforeArm ? 3 : 2);
                assert.equal(final.aborted, drainBeforeArm ? 0 : 1);
                outcomes.push({ drainBeforeArm, requests: final.requests, committed: final.committed,
                    aborted: final.aborted, starts, finishes, active: active.size, late503: Boolean(result.response) });
            } catch (error) {
                armFailure = error;
            } finally {
                await closeScopedAdmissionResources([
                    () => releaseDispatch?.(), () => releaseFresh?.(), () => browser?.close(),
                    () => bridge?.close(), () => fixture?.close(),
                ], armFailure);
            }
        }
    } catch (error) {
        primaryFailure = error;
    } finally {
        await closeScopedAdmissionResources([
            () => app.closeAllConnections(),
            () => new Promise((resolve, reject) => app.close(error => error ? reject(error) : resolve())),
            async () => {
                assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
                assert(path.basename(directory).startsWith('avalaos-scoped-admission-'));
                await rm(directory, { recursive: true, force: true });
            },
        ], primaryFailure);
    }
    assert.equal(outcomes.length, 2);
    console.log('SCOPED_ADMISSION_PAIRED_PROOF ' + JSON.stringify(outcomes));
});
test('auxiliary page disposal joins real Chromium header admission before close', { timeout: 15000 }, async () => {
    const server = createServer((req, res) => { res.setHeader('access-control-allow-origin', '*'); res.setHeader('access-control-allow-headers', 'authorization,content-type'); res.setHeader('content-type', req.url === '/' ? 'text/html' : 'application/json'); res.end(req.url === '/' ? '<title>Owned request lifecycle</title>' : '{"ok":true}'); });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    let browser;
    let verifiedModes = 0;
    try {
        browser = await chromium.launch({ headless: true });
        for (const mode of ['direct-close', 'settle-before-close']) {
            const context = await browser.newContext({ serviceWorkers: 'block' });
            const page = await context.newPage();
            await page.goto(origin);
            const errors = [];
            let tail = Promise.resolve(), starts = 0, finishes = 0, held = false;
            let releaseHeaders, notifyHeld;
            const gate = new Promise(r => releaseHeaders = r), ready = new Promise(r => notifyHeld = r);
            const active = new Set();
            // Control scheduling only: call the real Playwright allHeaders after releasing
            // the barrier. No mocked headers or synthesized closed-page error is used.
            context.on('request', request => {
                if (request.url() !== origin + '/functions/v1/lifecycle-proof') return;
                const real = request.allHeaders.bind(request);
                request.allHeaders = async () => {
                    if (!held) {
                        held = true;
                        notifyHeld();
                        await gate;
                    }
                    return real();
                };
            });
            const tracker = new AuthenticatedHostedBrowserActionTracker({
                backendOrigin: origin, appOrigin: 'http://127.0.0.1:1',
                startAction: async value => {
                    assert.equal(value.accessToken, 'local-fixture');
                    const actionId = `a-${++starts}`;
                    active.add(actionId);
                    return { actionId };
                },
                finishAction: async ({ actionId }) => {
                    assert(active.delete(actionId));
                    finishes++;
                },
            });
            const lifecycle = await installAuthenticatedHostedNetwork({
                context, hosted: true, allowedOrigins: new Set([origin]), tracker,
                queueNetworkAction: operation => { tail = tail.then(operation).catch(e => errors.push(e)); },
                onExternalRequest: () => assert.fail('external request'),
                onHttpRequest: () => {},
                onTrackerError: e => errors.push(e),
            });
            const settle = () => authenticatedLifecycleSettleActorNavigationBoundary({
                settleActionAdmissions: lifecycle.settleActionAdmissions,
                settleResponseBodies: lifecycle.settleResponseBodies,
                drainNetworkActions: async () => {
                  for (;;) {
                    const current = tail;
                    await current;
                    if (current === tail) break;
                  }
                  if (errors.length) throw errors[0];
                },
                activeActionCount: () => active.size,
            });
            const fetchResult = page.evaluate(() => { void fetch('/functions/v1/lifecycle-proof', { method: 'POST', headers: { authorization: 'Bearer local-fixture' }, body: '{}' }).catch(() => { }); }).catch(() => { });
            await ready;
            await fetchResult;
            let failure = null;
            if (mode === 'direct-close') {
                await page.close();
                releaseHeaders();
                try {
                    await settle();
                }
                catch (e) {
                    failure = e;
                }
                assert(failure && /request\.allHeaders: Target page, context or browser has been closed/u.test(failure.message), 'EXPECTED_REAL_CLOSED_HEADERS_FAILURE');
            }
            else {
                let closed = false;
                const closing = authenticatedHostedClosePageAfterOwnedNetwork({
                    settleOwnedNetwork: settle,
                    closePage: async () => {
                        assert.equal(starts, 1);
                        assert.equal(finishes, 1);
                        assert.equal(active.size, 0);
                        await page.close();
                        closed = true;
                    },
                });
                await new Promise(r => setImmediate(r));
                assert.equal(closed, false);
                assert.equal(page.isClosed(), false);
                releaseHeaders();
                await closing;
                assert.equal(errors.length, 0);
            }
            await tail;
            assert.equal(page.isClosed(), true);
            verifiedModes += 1;
            await context.close();
        }
    }
    finally {
        await browser?.close();
        server.closeAllConnections();
        await new Promise(r => server.close(r));
    }
    assert.equal(verifiedModes, 2);
});

test('Pixel auxiliary disposal joins work admitted between consecutive page closes', { timeout: 45_000 }, async () => {
    const server = createServer((request, response) => {
        response.setHeader('content-type', request.url === '/' ? 'text/html' : 'application/json');
        response.end(request.url === '/' ? '<title>Pixel disposal lifecycle</title>' : '{"ok":true}');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        for (const mode of ['grouped-close', 'settle-each-page']) {
            const context = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' });
            let releaseDispatch;
            try {
                const [main, replay, stale] = await Promise.all([
                    context.newPage(), context.newPage(), context.newPage(),
                ]);
                await Promise.all([main, replay, stale].map(page => page.goto(origin)));
                const active = new Set();
                const errors = [];
                let starts = 0, finishes = 0, tail = Promise.resolve(), notifyStarted;
                const started = new Promise(resolve => { notifyStarted = resolve; });
                const dispatch = new Promise(resolve => { releaseDispatch = resolve; });
                const tracker = new AuthenticatedHostedBrowserActionTracker({
                    backendOrigin: origin, appOrigin: 'http://127.0.0.1:1',
                    startAction: ({ accessToken }) => {
                        assert.equal(accessToken, 'local-fixture');
                        const actionId = `pixel-${++starts}`;
                        active.add(actionId);
                        notifyStarted();
                        return { actionId };
                    },
                    finishAction: ({ actionId, status }) => {
                        assert.equal(status, 200);
                        assert(active.delete(actionId));
                        finishes += 1;
                    },
                });
                const lifecycle = await installAuthenticatedHostedNetwork({
                    context, hosted: true, allowedOrigins: new Set([origin]), tracker,
                    queueNetworkAction: operation => { tail = tail.then(operation).catch(error => errors.push(error)); },
                    onExternalRequest: () => assert.fail('external request'),
                    onHttpRequest: () => {}, onTrackerError: error => errors.push(error),
                    dispatchAllowedRequest: async route => {
                        if (route.request().url() === `${origin}/functions/v1/pixel-close-proof`) await dispatch;
                        await route.continue();
                    },
                });
                const settle = () => authenticatedLifecycleSettleActorNavigationBoundary({
                    settleActionAdmissions: lifecycle.settleActionAdmissions,
                    settleResponseBodies: lifecycle.settleResponseBodies,
                    drainNetworkActions: async () => {
                        for (;;) {
                            const current = tail;
                            await current;
                            if (current === tail) break;
                        }
                        if (errors.length) throw errors[0];
                    },
                    activeActionCount: () => active.size,
                });
                const closeReplay = async () => {
                    await replay.close();
                    // A real request enters the shared tracker after its previous empty
                    // observation. Hold only dispatch scheduling; headers/events stay real.
                    await stale.evaluate(() => {
                        void fetch('/functions/v1/pixel-close-proof', {
                            method: 'POST', headers: { authorization: 'Bearer local-fixture' }, body: '{}',
                        }).catch(() => {});
                    });
                    await started;
                };
                if (mode === 'grouped-close') {
                    await authenticatedHostedClosePageAfterOwnedNetwork({
                        settleOwnedNetwork: settle,
                        closePage: async () => { await closeReplay(); await stale.close(); releaseDispatch(); },
                    });
                    await assert.rejects(settle, { message: 'AUTHENTICATED_BROWSER_ACTOR_TRANSITION_NOT_QUIESCENT' });
                    assert.equal(starts, 1);
                    assert.equal(finishes, 0);
                    assert.equal(active.size, 1);
                } else {
                    for (const closePage of [closeReplay, () => stale.close()]) {
                        const closing = authenticatedHostedClosePageAfterOwnedNetwork({ settleOwnedNetwork: settle, closePage });
                        if (replay.isClosed()) {
                            await new Promise(resolve => setImmediate(resolve));
                            assert.equal(stale.isClosed(), false);
                            assert.equal(active.size, 1);
                            releaseDispatch();
                        }
                        await closing;
                    }
                    await settle();
                    assert.equal(starts, 1);
                    assert.equal(finishes, 1);
                    assert.equal(active.size, 0);
                }
                assert.equal(replay.isClosed(), true);
                assert.equal(stale.isClosed(), true);
                assert.equal(main.isClosed(), false);
                assert.equal(errors.length, 0);
            } finally {
                releaseDispatch?.();
                await context.close();
            }
        }
    } finally {
        await browser?.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});
