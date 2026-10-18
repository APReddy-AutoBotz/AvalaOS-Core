import { createServer, type Server } from 'node:http';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { AuthenticatedHostedBrowserActionTracker } from '../../scripts/authenticatedHostedBrowserRequestClassifier.mjs';
import { installAuthenticatedHostedNetwork } from './authenticatedHostedNetwork';
import { installV2ReloadReadObserver } from './v2ReloadDiagnosticObserver';

type Deferred = Readonly<{ promise: Promise<void>; resolve: () => void }>;
type Scenario = {
  mode: 'pending-headers' | 'held-body' | 'abort-body' | 'mixed-duplicate';
  started: Deferred;
  released: Deferred;
  requests: number;
  cancelled: number;
};

const deferred = (): Deferred => {
  let resolve = () => undefined;
  const promise = new Promise<void>(done => { resolve = done; });
  return Object.freeze({ promise, resolve });
};

const listen = (server: Server) => new Promise<string>((resolve, reject) => {
  server.once('error', reject);
  server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
    const address = server.address();
    if (!address || typeof address === 'string') reject(new Error('V2_TRANSPORT_LOOPBACK_ADDRESS_REJECTED'));
    else resolve(`http://127.0.0.1:${address.port}`);
  });
});

const close = (server: Server | null) => server === null ? Promise.resolve() : new Promise<void>(resolve => {
  server.close(() => resolve());
});

const startRead = async (page: Page, apiOrigin: string, key: string) => page.evaluate((input) => {
  const controller = new AbortController();
  const state = { headers: false, completed: false, failed: false, status: null as number | null };
  Reflect.set(globalThis, input.key, { controller, state });
  const url = new URL('/rest/v1/assess_v2_cases?select=id', input.apiOrigin);
  void fetch(url, { signal: controller.signal }).then(async response => {
    state.headers = true;
    state.status = response.status;
    await response.json();
    state.completed = true;
  }).catch(() => { state.failed = true; });
}, { apiOrigin, key });

const readState = (page: Page, key: string) => page.evaluate(inputKey => {
  const value = Reflect.get(globalThis, inputKey) as {
    state?: { headers: boolean; completed: boolean; failed: boolean; status: number | null };
  } | undefined;
  return value?.state ?? { headers: false, completed: false, failed: false, status: null };
}, key);

const abortRead = (page: Page, key: string) => page.evaluate(inputKey => {
  const value = Reflect.get(globalThis, inputKey) as { controller?: AbortController } | undefined;
  value?.controller?.abort();
}, key);

test.describe('V2 reload transport lifecycle observer', () => {
  let appServer: Server | null = null;
  let apiServer: Server | null = null;
  let appOrigin = '';
  let apiOrigin = '';
  let scenario: Scenario | null = null;

  test.beforeAll(async () => {
    appServer = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end('<!doctype html><title>V2 transport lifecycle</title>');
    });
    appOrigin = await listen(appServer);
    apiServer = createServer(async (request, response) => {
      response.setHeader('access-control-allow-origin', appOrigin);
      response.setHeader('access-control-allow-headers', 'authorization,content-type');
      response.setHeader('access-control-allow-methods', 'GET,OPTIONS');
      response.setHeader('cache-control', 'no-store');
      if (request.method === 'OPTIONS') {
        response.writeHead(204);
        response.end();
        return;
      }
      const url = new URL(request.url ?? '/', apiOrigin);
      if (url.pathname === '/functions/v1/tenant-session') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"active":true}');
        return;
      }
      if (url.pathname !== '/rest/v1/assess_v2_cases' || request.method !== 'GET'
        || url.searchParams.get('select') !== 'id' || scenario === null) {
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end('{"error":"NOT_FOUND"}');
        return;
      }
      const current = scenario;
      current.requests += 1;
      current.started.resolve();
      response.once('close', () => {
        if (!response.writableEnded) current.cancelled += 1;
      });
      const hold = current.mode !== 'mixed-duplicate' || current.requests === 1;
      if (current.mode === 'pending-headers' && hold) await current.released.promise;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.flushHeaders();
      if (['held-body', 'abort-body', 'mixed-duplicate'].includes(current.mode) && hold) {
        await current.released.promise;
      }
      if (!response.destroyed) response.end('[{"id":"bounded"}]');
    });
    apiOrigin = await listen(apiServer);
  });

  test.afterAll(async () => {
    scenario?.released.resolve();
    await Promise.all([close(apiServer), close(appServer)]);
  });

  test('real Chromium retains each bounded lifecycle and keeps the installed tracker balanced', async ({ page, context }) => {
    let trackerStarts = 0;
    let trackerFinishes = 0;
    let trackerError: unknown = null;
    let networkTail: Promise<void> = Promise.resolve();
    const activeActions = new Set<string>();
    const install = async (browserContext: BrowserContext) => installAuthenticatedHostedNetwork({
      context: browserContext,
      hosted: true,
      allowedOrigins: new Set([appOrigin, apiOrigin]),
      tracker: new AuthenticatedHostedBrowserActionTracker({
        backendOrigin: apiOrigin,
        appOrigin,
        startAction: ({ accessToken }: { accessToken: string }) => {
          if (accessToken !== 'local-tracker-token') throw new Error('V2_TRANSPORT_TRACKER_TOKEN_REJECTED');
          const actionId = `bounded-${++trackerStarts}`;
          activeActions.add(actionId);
          return { actionId };
        },
        finishAction: ({ actionId }: { actionId: string }) => {
          if (!activeActions.delete(actionId)) throw new Error('V2_TRANSPORT_TRACKER_FINISH_REJECTED');
          trackerFinishes += 1;
        },
      }),
      queueNetworkAction: operation => {
        const queued = networkTail.then(async () => { await operation(); });
        networkTail = queued.catch(error => { if (!trackerError) trackerError = error; });
      },
      onExternalRequest: () => { throw new Error('V2_TRANSPORT_EXTERNAL_REQUEST_REJECTED'); },
      onHttpRequest: () => undefined,
      onTrackerError: error => { if (!trackerError) trackerError = error; },
    });
    await install(context);
    await page.goto(appOrigin);
    await page.evaluate(async origin => {
      const response = await fetch(new URL('/functions/v1/tenant-session', origin), {
        headers: { Authorization: 'Bearer local-tracker-token' },
      });
      await response.json();
    }, apiOrigin);
    await networkTail;
    expect(activeActions.size).toBe(0);
    expect(trackerStarts).toBe(1);
    expect(trackerFinishes).toBe(1);

    const begin = (mode: Scenario['mode']) => {
      scenario = { mode, started: deferred(), released: deferred(), requests: 0, cancelled: 0 };
      return scenario;
    };
    const stage = (completion: Awaited<ReturnType<ReturnType<typeof installV2ReloadReadObserver>['complete']>>) =>
      completion.observation.readStages.find(row => row.stage === 'case-discovery');

    await test.step('pending headers', async () => {
      const current = begin('pending-headers');
      const observer = installV2ReloadReadObserver(page);
      let observerCompleted = false;
      try {
        await startRead(page, apiOrigin, '__pendingHeaders');
        await current.started.promise;
        const completion = await observer.complete();
        observerCompleted = true;
        expect(completion.observerFailure).toBe(false);
        expect(stage(completion)).toMatchObject({
          status: 'failed', httpStatus: null, rowCount: null,
          lifecycle: { requested: 1, responseStarted: 0, completed: 0, transportFailed: 0, pending: 1,
            bodyCompleted: 0, bodyFailed: 0, bodyPending: 0 },
        });
        const retained = structuredClone(completion);
        current.released.resolve();
        await expect.poll(() => readState(page, '__pendingHeaders')).toMatchObject({ completed: true, failed: false });
        expect(completion).toEqual(retained);
      } finally {
        current.released.resolve();
        if (!observerCompleted) await observer.complete().catch(() => undefined);
      }
    });

    await test.step('held body', async () => {
      const current = begin('held-body');
      const observer = installV2ReloadReadObserver(page);
      let observerCompleted = false;
      try {
        await startRead(page, apiOrigin, '__heldBody');
        await expect.poll(() => readState(page, '__heldBody')).toMatchObject({
          headers: true, completed: false, failed: false, status: 200,
        });
        const completion = await observer.complete();
        observerCompleted = true;
        expect(completion.observerFailure).toBe(false);
        expect(stage(completion)).toMatchObject({
          status: 'failed', httpStatus: 200, rowCount: null,
          lifecycle: { requested: 1, responseStarted: 1, completed: 0, transportFailed: 0, pending: 1,
            bodyCompleted: 0, bodyFailed: 0, bodyPending: 1 },
        });
        const retained = structuredClone(completion);
        current.released.resolve();
        await expect.poll(() => readState(page, '__heldBody')).toMatchObject({ completed: true, failed: false });
        expect(completion).toEqual(retained);
      } finally {
        current.released.resolve();
        if (!observerCompleted) await observer.complete().catch(() => undefined);
      }
    });

    await test.step('client abort', async () => {
      const current = begin('abort-body');
      const observer = installV2ReloadReadObserver(page);
      let observerCompleted = false;
      await startRead(page, apiOrigin, '__abortBody');
      try {
        await expect.poll(() => readState(page, '__abortBody')).toMatchObject({ headers: true, completed: false });
        await abortRead(page, '__abortBody');
        await expect.poll(() => readState(page, '__abortBody')).toMatchObject({ failed: true });
        await expect.poll(() => current.cancelled).toBe(1);
        const completion = await observer.complete();
        observerCompleted = true;
        expect(completion.observerFailure).toBe(false);
        expect(stage(completion)).toMatchObject({
          status: 'failed', httpStatus: 200, rowCount: null,
          lifecycle: { requested: 1, responseStarted: 1, completed: 0, transportFailed: 1, pending: 0,
            bodyCompleted: 0,
            transportFailures: { aborted: 1, timeout: 0, connection: 0, protocol: 0, blocked: 0, other: 0 } },
        });
        // Snapshot body settlement independently from the terminal transport event.
        const row = stage(completion)!;
        expect([[1, 0], [0, 1]]).toContainEqual([row.lifecycle.bodyFailed, row.lifecycle.bodyPending]);
      } finally {
        current.released.resolve();
        if (!observerCompleted) await observer.complete().catch(() => undefined);
      }
    });

    await test.step('mixed duplicate', async () => {
      const current = begin('mixed-duplicate');
      const observer = installV2ReloadReadObserver(page);
      let observerCompleted = false;
      await startRead(page, apiOrigin, '__mixedHeld');
      try {
        await expect.poll(() => readState(page, '__mixedHeld')).toMatchObject({ headers: true, completed: false });
        await startRead(page, apiOrigin, '__mixedComplete');
        await expect.poll(() => readState(page, '__mixedComplete')).toMatchObject({ completed: true, failed: false });
        const completion = await observer.complete();
        observerCompleted = true;
        expect(completion.observerFailure).toBe(false);
        expect(stage(completion)).toMatchObject({
          status: 'failed', httpStatus: 200, rowCount: null,
          lifecycle: { requested: 2, responseStarted: 2, completed: 1, transportFailed: 0, pending: 1,
            bodyCompleted: 1, bodyFailed: 0, bodyPending: 1 },
        });
        const retained = structuredClone(completion);
        current.released.resolve();
        await expect.poll(() => readState(page, '__mixedHeld')).toMatchObject({ completed: true, failed: false });
        expect(completion).toEqual(retained);
      } finally {
        current.released.resolve();
        if (!observerCompleted) await observer.complete().catch(() => undefined);
      }
    });

    await networkTail;
    expect(trackerError).toBeNull();
    expect(activeActions.size).toBe(0);
    expect(trackerFinishes).toBe(trackerStarts);
  });
});
