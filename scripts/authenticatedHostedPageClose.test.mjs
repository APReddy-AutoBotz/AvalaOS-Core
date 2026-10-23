import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createServer } from 'node:http';
import ts from 'typescript';
import { chromium, devices } from '@playwright/test';
import { AuthenticatedHostedBrowserActionTracker } from './authenticatedHostedBrowserRequestClassifier.mjs';
const exports = {};
new Function('exports', 'require', ts.transpileModule(fs.readFileSync('tests/browser/authenticatedHostedNetwork.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports, () => ({ AuthenticatedHostedBrowserActionTracker }));
const { installAuthenticatedHostedNetwork, authenticatedLifecycleSettleActorNavigationBoundary, authenticatedHostedClosePageAfterOwnedNetwork } = exports;
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
