import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createServer } from 'node:http';
import ts from 'typescript';
import { chromium } from '@playwright/test';
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
