import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  authenticatedLifecycleEnterAs,
  createAuthenticatedLifecycleWorkQueue,
  type AuthenticatedLifecycleActor,
} from '../authenticatedLifecycleHarness';
import {
  authenticatedLifecycleSettleActorNavigationBoundary,
  installAuthenticatedHostedNetwork,
} from '../authenticatedHostedNetwork';
import { AuthenticatedHostedBrowserActionTracker } from '../../../scripts/authenticatedHostedBrowserRequestClassifier.mjs';
import { awaitCanonicalProjectIndexRead } from './canonicalInvoiceExceptionJourney';

const appOrigin = 'http://127.0.0.1:51998';
const backendOrigin = 'http://localhost:51998';

test.use({ baseURL: appOrigin });

const actors = Object.freeze({
  approver: { token: 'local-approver-token', user: { id: '11111111-1111-4111-8111-111111111111', email: 'approver@example.test' } },
  reviewer: { token: 'local-reviewer-token', user: { id: '22222222-2222-4222-8222-222222222222', email: 'reviewer@example.test' } },
}) satisfies Readonly<Record<string, AuthenticatedLifecycleActor>>;

const actorId = (page: Page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find(candidate => candidate.startsWith('sb-')) ?? '';
  const value = key ? JSON.parse(localStorage.getItem(key) ?? '{}') : {};
  return value.user?.id ?? null;
});

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};

const installTrackedBoundary = async (context: BrowserContext) => {
  const admission = deferred();
  const admissionObserved = deferred();
  const queue = createAuthenticatedLifecycleWorkQueue();
  const finishes: Array<Readonly<{ actionId: string; status: number }>> = [];
  const activeTrackedActionIds = new Set<string>();
  let pendingTrackedActionStarts = 0;
  let expectedActionId = '';
  let released = false;
  const tracker = new AuthenticatedHostedBrowserActionTracker({
    backendOrigin,
    appOrigin,
    startAction: async () => {
      pendingTrackedActionStarts += 1;
      try {
        admissionObserved.resolve();
        await admission.promise;
        if (activeTrackedActionIds.has(expectedActionId)) {
          throw new Error('AUTHENTICATED_BROWSER_ACTION_START_REJECTED');
        }
        activeTrackedActionIds.add(expectedActionId);
        return { actionId: expectedActionId };
      } finally {
        pendingTrackedActionStarts -= 1;
      }
    },
    finishAction: async ({ actionId, status }: Readonly<{ actionId: string; status: number }>) => {
      if (!activeTrackedActionIds.has(actionId)) {
        throw new Error('AUTHENTICATED_BROWSER_ACTION_START_MISSING');
      }
      finishes.push(Object.freeze({ actionId, status }));
      activeTrackedActionIds.delete(actionId);
    },
  });
  const network = await installAuthenticatedHostedNetwork({
    context,
    hosted: true,
    allowedOrigins: new Set([appOrigin, backendOrigin]),
    tracker,
    queueNetworkAction: queue.enqueue,
    onExternalRequest: origin => { throw new Error(`UNEXPECTED_EXTERNAL_ORIGIN:${origin}`); },
    onHttpRequest: () => undefined,
    onTrackerError: error => { throw error; },
    dispatchAllowedRequest: async route => {
      const url = new URL(route.request().url());
      if (url.origin === backendOrigin) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ accepted: true }),
          headers: { 'access-control-allow-origin': appOrigin },
        });
        return;
      }
      await route.fallback();
    },
    responseBodyTimeoutMs: 15_000,
  });
  const settle = () => authenticatedLifecycleSettleActorNavigationBoundary({
    settleActionAdmissions: network.settleActionAdmissions,
    settleResponseBodies: network.settleResponseBodies,
    drainNetworkActions: queue.drain,
    activeActionCount: () => pendingTrackedActionStarts + activeTrackedActionIds.size,
  });
  return Object.freeze({
    arm: async (page: Page, actionId: string) => {
      expectedActionId = actionId;
      await page.evaluate(url => {
        void fetch(url, { method: 'POST', body: JSON.stringify({ operation: 'transition-boundary-probe' }) })
          .catch(() => undefined);
      }, `${backendOrigin}/functions/v1/studio-command`);
      await admissionObserved.promise;
    },
    release: () => {
      if (!released) {
        released = true;
        admission.resolve();
      }
    },
    settle,
    activeActionCount: () => pendingTrackedActionStarts + activeTrackedActionIds.size,
    finishes,
  });
};

test.beforeEach(async ({ context }) => {
  await context.route(`${appOrigin}/**`, route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><h1>Actor workspace ready</h1></body></html>',
  }));
});

test('raw downstream actor entry crosses an actual pending tracked action before settlement', async ({ context, page }) => {
  await authenticatedLifecycleEnterAs(page, actors.approver);
  const tracked = await installTrackedBoundary(context);
  await tracked.arm(page, 'raw-crossed-action');
  try {
    expect(tracked.activeActionCount()).toBe(1);
    await authenticatedLifecycleEnterAs(page, actors.reviewer);
    expect(await actorId(page)).toBe(actors.reviewer.user.id);
    expect(tracked.activeActionCount()).toBe(1);
    expect(tracked.finishes).toEqual([]);
  } finally {
    tracked.release();
    await tracked.settle();
  }
  expect(tracked.activeActionCount()).toBe(0);
  expect(tracked.finishes).toEqual([{ actionId: 'raw-crossed-action', status: 0 }]);
});

test('settled downstream actor entry joins the actual request admission and exact causal completion', async ({ context, page }) => {
  await authenticatedLifecycleEnterAs(page, actors.approver);
  const tracked = await installTrackedBoundary(context);
  await tracked.arm(page, 'settled-action');
  let boundaryEntered = false;
  let transitionCompleted = false;
  const transition = authenticatedLifecycleEnterAs(page, actors.reviewer, async () => {
    boundaryEntered = true;
    await tracked.settle();
  }).then(() => { transitionCompleted = true; });
  try {
    await expect.poll(() => boundaryEntered).toBe(true);
    expect(transitionCompleted).toBe(false);
    expect(await actorId(page)).toBe(actors.approver.user.id);
    expect(tracked.activeActionCount()).toBe(1);
    expect(tracked.finishes).toEqual([]);
    tracked.release();
    await transition;
    expect(tracked.activeActionCount()).toBe(0);
    expect(tracked.finishes).toEqual([{ actionId: 'settled-action', status: 200 }]);
    expect(await actorId(page)).toBe(actors.reviewer.user.id);
  } finally {
    tracked.release();
    const cleanup = await Promise.allSettled([transition, tracked.settle()]);
    expect(cleanup.map(result => result.status)).toEqual(['fulfilled', 'fulfilled']);
  }
});

test('a rejected owned-evidence drain prevents navigation and session replacement', async ({ page }) => {
  await authenticatedLifecycleEnterAs(page, actors.approver);
  const urlBefore = page.url();
  await expect(authenticatedLifecycleEnterAs(page, actors.reviewer, () =>
    authenticatedLifecycleSettleActorNavigationBoundary({
      settleActionAdmissions: async () => undefined,
      settleResponseBodies: async () => undefined,
      drainNetworkActions: async () => { throw new Error('LOCAL_OWNED_EVIDENCE_DRAIN_FAILED'); },
      activeActionCount: () => 0,
      waitForNextObservation: async () => undefined,
    }))).rejects.toThrow('LOCAL_OWNED_EVIDENCE_DRAIN_FAILED');
  expect(page.url()).toBe(urlBefore);
  expect(await actorId(page)).toBe(actors.approver.user.id);
});

for (const nativeResource of ['document_generations', 'projects']) {
  for (const settled of [false, true]) {
    test(`${settled ? 'settled' : 'raw'} refresh accounts for an actual held native ${nativeResource} read`, async ({ context, page: primaryPage }) => {
      const page = nativeResource === 'projects' ? await context.newPage() : primaryPage;
      const resource = `${backendOrigin}/rest/v1/${nativeResource}`;
      const entered = deferred();
      const release = deferred();
      const routeFinished = deferred();
      let active = 0;
      let completed = 0;
      let cancelled = 0;
      let boundaryEntered = false;
      let refreshed = false;
      page.on('requestfinished', request => {
        if (request.url() === resource) { active -= 1; completed += 1; }
      });
      page.on('requestfailed', request => {
        if (request.url() === resource) { active -= 1; cancelled += 1; }
      });
      await context.route(resource, async route => {
        active += 1;
        entered.resolve();
        await release.promise;
        try {
          await route.fulfill({ status: 200, contentType: 'application/json', body: '[]',
            headers: { 'access-control-allow-origin': appOrigin } });
        } catch { /* The raw control intentionally discards the requesting document. */ }
        finally { routeFinished.resolve(); }
      });
      await page.goto(appOrigin);
      await page.evaluate(url => { void fetch(url).catch(() => undefined); }, resource);
      await entered.promise;
      const refresh = (async () => {
        if (settled) await authenticatedLifecycleSettleActorNavigationBoundary({
          settleActionAdmissions: async () => { boundaryEntered = true; },
          settleResponseBodies: async () => undefined,
          drainNetworkActions: async () => undefined,
          activeActionCount: () => active,
        });
        await page.reload({ waitUntil: 'domcontentloaded' });
        refreshed = true;
      })();
      try {
        if (settled) {
          await expect.poll(() => boundaryEntered).toBe(true);
          expect(refreshed).toBe(false);
          expect(active).toBe(1);
          release.resolve();
          await refresh;
          expect(completed).toBe(1);
          expect(cancelled).toBe(0);
        } else {
          await refresh;
          await expect.poll(() => cancelled).toBe(1);
          expect(completed).toBe(0);
        }
      } finally {
        release.resolve();
        await Promise.all([refresh, routeFinished.promise]);
      }
      expect(active).toBe(0);
    });
  }
}

test('canonical auxiliary-page close joins a project read admitted after an initially empty boundary', async ({ context }) => {
  const run = async (protectedRead: boolean) => {
    const page = await context.newPage();
    const resource = `${backendOrigin}/rest/v1/projects?case=${protectedRead ? 'protected' : 'raw'}`;
    const entered = deferred();
    const release = deferred();
    const routeFinished = deferred();
    let active = 0;
    let completed = 0;
    let cancelled = 0;
    page.on('requestfinished', request => {
      if (request.url() === resource) { active -= 1; completed += 1; }
    });
    page.on('requestfailed', request => {
      if (request.url() === resource) { active -= 1; cancelled += 1; }
    });
    await context.route(resource, async route => {
      active += 1;
      entered.resolve();
      await release.promise;
      try {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]',
          headers: { 'access-control-allow-origin': appOrigin } });
      } catch { /* The raw control intentionally closes the requesting page. */ }
      finally { routeFinished.resolve(); }
    });
    await page.goto(appOrigin);
    await authenticatedLifecycleSettleActorNavigationBoundary({
      settleActionAdmissions: async () => undefined,
      settleResponseBodies: async () => undefined,
      drainNetworkActions: async () => undefined,
      activeActionCount: () => active,
    });
    expect(active).toBe(0);
    const admitLateProjectRead = () => page.evaluate(url => {
      void fetch(url).catch(() => undefined);
    }, resource);
    if (protectedRead) {
      let readFinished = false;
      const navigation = awaitCanonicalProjectIndexRead(page, admitLateProjectRead)
        .then(() => { readFinished = true; });
      await entered.promise;
      expect(readFinished).toBe(false);
      expect(active).toBe(1);
      release.resolve();
      await navigation;
      await page.close();
      expect(completed).toBe(1);
      expect(cancelled).toBe(0);
    } else {
      await admitLateProjectRead();
      await entered.promise;
      const refresh = page.reload({ waitUntil: 'domcontentloaded' });
      await refresh;
      release.resolve();
      await expect.poll(() => cancelled).toBe(1);
      expect(completed).toBe(0);
      await page.close();
    }
    release.resolve();
    await routeFinished.promise;
    expect(active).toBe(0);
  };
  await run(false);
  await run(true);
});
