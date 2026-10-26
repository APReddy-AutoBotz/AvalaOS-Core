import type { BrowserContext, Page, Request, Route } from '@playwright/test';
import { AuthenticatedHostedBrowserActionTracker } from '../../scripts/authenticatedHostedBrowserRequestClassifier.mjs';

type QueueNetworkAction = (
  operation: () => Promise<unknown>,
  ownedWork?: Promise<unknown>,
) => void;

type InstallAuthenticatedHostedNetworkInput = Readonly<{
  context: BrowserContext;
  hosted: boolean;
  allowedOrigins: ReadonlySet<string>;
  tracker: AuthenticatedHostedBrowserActionTracker | null;
  queueNetworkAction: QueueNetworkAction;
  onExternalRequest: (origin: string) => void;
  onHttpRequest: () => void;
  onTrackerError: (error: unknown) => void;
  dispatchAllowedRequest?: (route: Route) => Promise<void>;
  responseBodyTimeoutMs?: number;
  requestDiagnostics?: Readonly<{
    onRequest: (request: Request) => void;
    onResponse: (request: Request, status: number) => void;
    onResponseBody: (request: Request, body: unknown) => void;
    onRequestFailed: (request: Request) => void;
  }>;
}>;

export const authenticatedHostedResponseBodyTimeoutMs = 30_000;

// The acceptance browser can observe a 12,000,000-byte payload whose JSON or
// base64 envelope remains below 16 MiB. Keep at most four such envelopes in
// Chromium-owned memory while immediate reloads replace the renderer. Nothing
// is persisted and Playwright remains the sole response-body reader.
export const authenticatedHostedDurableResponseBodyResourceBytes = 16 * 1024 * 1024;
export const authenticatedHostedDurableResponseBodyTotalBytes = 64 * 1024 * 1024;

export const authenticatedHostedConfigureChromiumDurableResponseBodies = async (
  context: BrowserContext,
  page: Page,
) => {
  try {
    const session = await context.newCDPSession(page);
    await session.send('Network.enable');
    await session.send('Network.configureDurableMessages', {
      maxTotalBufferSize: authenticatedHostedDurableResponseBodyTotalBytes,
      maxResourceBufferSize: authenticatedHostedDurableResponseBodyResourceBytes,
    });
  } catch {
    throw new Error('AUTHENTICATED_BROWSER_DURABLE_RESPONSE_BODIES_UNAVAILABLE');
  }
};

export const authenticatedHostedClosePageAfterOwnedNetwork = async ({
  settleOwnedNetwork,
  closePage,
}: Readonly<{
  settleOwnedNetwork: () => Promise<void>;
  closePage: () => Promise<void>;
}>) => {
  await settleOwnedNetwork();
  await closePage();
};

export const authenticatedLifecycleSettleCheckpointBoundary = async <Result>({
  settleOwnedNetwork,
  checkpoint,
}: Readonly<{
  settleOwnedNetwork: () => Promise<void>;
  checkpoint: () => Promise<Result>;
}>): Promise<Result> => {
  await settleOwnedNetwork();
  return checkpoint();
};

export const authenticatedLifecycleSettleActorNavigationBoundary = async ({
  settleActionAdmissions,
  settleResponseBodies,
  drainNetworkActions,
  activeActionCount,
  waitForNextObservation = () => new Promise<void>(resolve => setTimeout(resolve, 50)),
  runPhase = (_phase, operation) => operation(),
}: Readonly<{
  settleActionAdmissions: () => Promise<void>;
  settleResponseBodies: () => Promise<void>;
  drainNetworkActions: () => Promise<void>;
  activeActionCount: () => number;
  waitForNextObservation?: () => Promise<void>;
  runPhase?: (phase: 'admissions-first' | 'bodies-first' | 'drain' | 'admissions-last' | 'bodies-last',
    operation: () => Promise<void>) => Promise<void>;
}>) => {
  const deadline = Date.now() + 15_000;
  let stableEmptyObservations = 0;
  let firstFailure: unknown;
  let hasFailure = false;
  const retainFailure = async (operation: () => Promise<void>) => {
    try { await operation(); }
    catch (error) {
      if (!hasFailure) {
        firstFailure = error;
        hasFailure = true;
      }
    }
  };
  for (;;) {
    await retainFailure(() => runPhase('admissions-first', settleActionAdmissions));
    await retainFailure(() => runPhase('bodies-first', settleResponseBodies));
    await retainFailure(() => runPhase('drain', drainNetworkActions));
    await retainFailure(() => runPhase('admissions-last', settleActionAdmissions));
    await retainFailure(() => runPhase('bodies-last', settleResponseBodies));
    const activeActions = activeActionCount();
    const expired = Date.now() >= deadline;
    if (activeActions === 0) {
      if (expired) {
        if (!hasFailure) {
          firstFailure = new Error(stableEmptyObservations === 0
            ? 'AUTHENTICATED_BROWSER_ACTOR_TRANSITION_EMPTY_AFTER_DEADLINE'
            : 'AUTHENTICATED_BROWSER_ACTOR_TRANSITION_STABILITY_AFTER_DEADLINE');
          hasFailure = true;
        }
        throw firstFailure;
      }
      stableEmptyObservations += 1;
      if (stableEmptyObservations >= 2) {
        if (hasFailure) throw firstFailure;
        return;
      }
    } else {
      stableEmptyObservations = 0;
      if (expired) {
        if (!hasFailure) {
          firstFailure = new Error('AUTHENTICATED_BROWSER_ACTOR_TRANSITION_NOT_QUIESCENT');
          hasFailure = true;
        }
        throw firstFailure;
      }
    }
    await waitForNextObservation();
  }
};

export const readAuthenticatedHostedResponseBody = async (
  context: BrowserContext,
  response: Readonly<{ json: () => Promise<unknown> }>,
  timeoutMs = authenticatedHostedResponseBodyTimeoutMs,
) => {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > authenticatedHostedResponseBodyTimeoutMs) {
    throw new Error('AUTHENTICATED_BROWSER_RESPONSE_BODY_TIMEOUT_REJECTED');
  }
  const body = response.json().then(
    value => Object.freeze({ state: 'fulfilled' as const, value }),
    error => Object.freeze({ state: 'rejected' as const, error }),
  );
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<'expired'>(resolve => {
    timeoutHandle = setTimeout(() => resolve('expired'), timeoutMs);
  });
  const first = await Promise.race([body.then(() => 'body' as const), expired]);
  if (first === 'body') {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    const settled = await body;
    if (settled.state === 'rejected') {
      // Playwright implements Response.json() by awaiting the protocol body and
      // then calling JSON.parse. Preserve that fixed distinction: malformed or
      // empty JSON is not a browser transport failure and can never be paired
      // with requestfailed to manufacture a status-zero success frame.
      if (settled.error instanceof SyntaxError) {
        throw new Error('AUTHENTICATED_BROWSER_RESPONSE_BODY_INVALID_JSON');
      }
      throw new Error('AUTHENTICATED_BROWSER_RESPONSE_BODY_READ_FAILED');
    }
    return settled.value;
  }
  const closed = context.close({ reason: 'authenticated response body timeout' }).then(
    () => Object.freeze({ state: 'fulfilled' as const }),
    () => Object.freeze({ state: 'rejected' as const }),
  );
  let cleanupHandle: ReturnType<typeof setTimeout> | undefined;
  const cleanupExpired = new Promise<'expired'>(resolve => {
    cleanupHandle = setTimeout(() => resolve('expired'), timeoutMs);
  });
  const cleanup = Promise.all([body, closed]);
  if (await Promise.race([cleanup.then(() => 'settled' as const), cleanupExpired]) === 'expired') {
    throw new Error('AUTHENTICATED_BROWSER_RESPONSE_BODY_CLEANUP_INCOMPLETE');
  }
  if (cleanupHandle !== undefined) clearTimeout(cleanupHandle);
  const [, closeResult] = await cleanup;
  if (closeResult.state === 'rejected') {
    throw new Error('AUTHENTICATED_BROWSER_RESPONSE_BODY_CLEANUP_INCOMPLETE');
  }
  throw new Error('AUTHENTICATED_BROWSER_RESPONSE_BODY_TIMEOUT');
};

const webProtocol = (protocol: string) => protocol === 'http:' || protocol === 'https:';
const loopback = (hostname: string) => ['127.0.0.1', 'localhost'].includes(hostname);
const allowedWebOrigin = (url: URL, hosted: boolean, allowedOrigins: ReadonlySet<string>) => hosted
  ? allowedOrigins.has(url.origin)
  : loopback(url.hostname);

export const installAuthenticatedHostedNetwork = async ({
  context,
  hosted,
  allowedOrigins,
  tracker,
  queueNetworkAction,
  onExternalRequest,
  onHttpRequest,
  onTrackerError,
  dispatchAllowedRequest,
  responseBodyTimeoutMs = authenticatedHostedResponseBodyTimeoutMs,
  requestDiagnostics,
}: InstallAuthenticatedHostedNetworkInput) => {
  const responseBodies = new Set<Promise<unknown>>();
  const actionAdmissions = new Set<Promise<unknown>>();
  const responseBodyFailures = new Set<Readonly<{ request: Request; error: unknown }>>();
  const ownResponseBody = <T>(operation: Promise<T>) => {
    responseBodies.add(operation);
    void operation.then(
      () => { responseBodies.delete(operation); },
      () => { responseBodies.delete(operation); },
    );
    return operation;
  };
  const settleResponseBodies = async () => {
    for (;;) {
      const snapshot = [...responseBodies];
      if (snapshot.length === 0) break;
      await Promise.allSettled(snapshot);
    }
    // Allow Chromium's paired requestfailed event to be observed before
    // deciding whether a body-read failure is an explicit transport failure.
    await new Promise(resolve => setTimeout(resolve, 0));
    for (const failure of responseBodyFailures) {
      if (!(failure.error instanceof Error
        && failure.error.message === 'AUTHENTICATED_BROWSER_RESPONSE_BODY_READ_FAILED'
        && transportFailed.has(failure.request))) {
        throw failure.error;
      }
    }
  };
  let firstActionAdmissionFailure: unknown;
  let actionAdmissionFailed = false;
  const ownActionAdmission = <T>(operation: Promise<T>) => {
    actionAdmissions.add(operation);
    void operation.then(
      () => { actionAdmissions.delete(operation); },
      error => {
        actionAdmissions.delete(operation);
        if (!actionAdmissionFailed) {
          firstActionAdmissionFailure = error;
          actionAdmissionFailed = true;
        }
      },
    );
    return operation;
  };
  const settleActionAdmissions = async () => {
    for (;;) {
      const snapshot = [...actionAdmissions];
      if (snapshot.length === 0) {
        if (actionAdmissionFailed) throw firstActionAdmissionFailure;
        return;
      }
      await Promise.allSettled(snapshot);
    }
  };
  const startProductAction = (request: Request) => {
    if (!tracker) throw new Error('AUTHENTICATED_BROWSER_ACTION_TRACKER_MISSING');
    return ownActionAdmission(tracker.begin(request));
  };
  const finishProductAction = (request: Request, status: number, responseBody: unknown) => {
    if (!tracker) throw new Error('AUTHENTICATED_BROWSER_ACTION_TRACKER_MISSING');
    const prepared = tracker.prepare(request, status, responseBody);
    queueNetworkAction(async () => {
      await prepared;
      return tracker.finish(request, status, responseBody);
    }, prepared);
  };
  const transportFailed = new WeakSet<Request>();
  const responseObserved = new WeakSet<Request>();

  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (webProtocol(url.protocol) && !allowedWebOrigin(url, hosted, allowedOrigins)) {
      await route.abort('blockedbyclient');
      return;
    }
    if (hosted) {
      try { await startProductAction(route.request()); }
      catch (error) {
        onTrackerError(error);
        await route.abort('failed');
        return;
      }
    }
    if (dispatchAllowedRequest) await dispatchAllowedRequest(route);
    else await route.continue();
  });

  context.on('request', request => {
    const url = new URL(request.url());
    if (!webProtocol(url.protocol)) return;
    onHttpRequest();
    if (!allowedWebOrigin(url, hosted, allowedOrigins)) onExternalRequest(url.origin);
    else if (hosted) {
      try { requestDiagnostics?.onRequest(request); } catch { /* diagnostics never affect the request */ }
      // Playwright can report a navigation-cancelled request before its async
      // route callback reaches the tracker. Prime the same idempotent begin
      // promise at the request event so response/requestfailed observers can
      // never overtake the required action start. The route still awaits this
      // promise and aborts before dispatch when authority rejects it.
      void startProductAction(request).catch(() => undefined);
    }
  });

  if (hosted) {
    context.on('response', response => {
      const request = response.request();
      responseObserved.add(request);
      try { requestDiagnostics?.onResponse(request, response.status()); } catch { /* diagnostics remain passive */ }
      if (!tracker) {
        onTrackerError(new Error('AUTHENTICATED_BROWSER_ACTION_TRACKER_MISSING'));
        return;
      }
      // Begin owning the Playwright response body at the response event. The
      // request route already awaited tracker.begin(), so classification is
      // settled before dispatch and this continuation starts the body read
      // before a test can close its page. Controller writes remain serialized
      // in queue order; body acquisition and subsequent read-only preparation
      // run eagerly, with every accepted preparation owned by that queue.
      const acquired = ownResponseBody((async () => {
        try {
          const classification = await tracker.classify(request);
          if (classification.kind !== 'business-action') {
            return Object.freeze({ state: 'ignored' as const });
          }
          const value = await readAuthenticatedHostedResponseBody(context, response, responseBodyTimeoutMs);
          try { requestDiagnostics?.onResponseBody(request, value); } catch { /* diagnostics remain passive */ }
          return Object.freeze({ state: 'fulfilled' as const, value });
        } catch (error) {
          responseBodyFailures.add(Object.freeze({ request, error }));
          return Object.freeze({ state: 'rejected' as const, error });
        }
      })());
      const terminal = acquired.then(async body => {
        if (body.state === 'ignored') return Object.freeze({ state: 'ignored' as const });
        if (body.state === 'rejected') {
          // Chromium emits requestfailed immediately after a response-body
          // transport failure. Give that paired event one turn to be observed;
          // without it, preserve the fail-closed body error.
          await new Promise(resolve => setTimeout(resolve, 0));
          if (body.error instanceof Error
            && body.error.message === 'AUTHENTICATED_BROWSER_RESPONSE_BODY_READ_FAILED'
            && transportFailed.has(request)) {
            return Object.freeze({ state: 'terminal' as const, status: 0,
              responseBody: { error: { code: 'BROWSER_TRANSPORT_FAILURE' } } });
          }
          throw body.error;
        }
        return Object.freeze({ state: 'terminal' as const, status: response.status(), responseBody: body.value });
      });
      const prepared = terminal.then(value => value.state === 'terminal'
        ? tracker.prepare(request, value.status, value.responseBody) : null);
      queueNetworkAction(async () => {
        const body = await acquired;
        if (body.state === 'ignored') return;
        const value = await terminal;
        if (value.state !== 'terminal') return;
        await prepared;
        await tracker.finish(request, value.status, value.responseBody);
      }, prepared);
    });
    context.on('requestfailed', request => {
      transportFailed.add(request);
      try { requestDiagnostics?.onRequestFailed(request); } catch { /* diagnostics remain passive */ }
      // When response headers were observed, the owned response-body operation
      // has enough information to distinguish a genuine browser transport
      // failure from malformed JSON. It alone may emit status zero. A request
      // which failed before any response still needs this direct completion.
      if (!responseObserved.has(request)) {
        finishProductAction(request, 0, { error: { code: 'BROWSER_TRANSPORT_FAILURE' } });
      }
    });
  }

  return Object.freeze({ startProductAction, finishProductAction, settleActionAdmissions, settleResponseBodies });
};
