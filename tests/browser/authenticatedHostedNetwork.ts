import type { BrowserContext, Request, Route } from '@playwright/test';
import { AuthenticatedHostedBrowserActionTracker } from '../../scripts/authenticatedHostedBrowserRequestClassifier.mjs';

type QueueNetworkAction = (operation: () => Promise<unknown>) => void;

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
}>;

export const authenticatedHostedResponseBodyTimeoutMs = 30_000;

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
    () => Object.freeze({ state: 'rejected' as const }),
  );
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<'expired'>(resolve => {
    timeoutHandle = setTimeout(() => resolve('expired'), timeoutMs);
  });
  const first = await Promise.race([body.then(() => 'body' as const), expired]);
  if (first === 'body') {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    const settled = await body;
    if (settled.state === 'rejected') throw new Error('AUTHENTICATED_BROWSER_RESPONSE_BODY_READ_FAILED');
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
}: InstallAuthenticatedHostedNetworkInput) => {
  const startProductAction = (request: Request) => {
    if (!tracker) throw new Error('AUTHENTICATED_BROWSER_ACTION_TRACKER_MISSING');
    return tracker.begin(request);
  };
  const finishProductAction = (request: Request, status: number, responseBody: unknown) => {
    if (!tracker) throw new Error('AUTHENTICATED_BROWSER_ACTION_TRACKER_MISSING');
    queueNetworkAction(() => tracker.finish(request, status, responseBody));
  };

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
      queueNetworkAction(async () => {
        if (!tracker) throw new Error('AUTHENTICATED_BROWSER_ACTION_TRACKER_MISSING');
        const classification = await tracker.classify(request);
        if (classification.kind !== 'business-action') return;
        const responseBody = await readAuthenticatedHostedResponseBody(context, response, responseBodyTimeoutMs);
        await tracker.finish(request, response.status(), responseBody);
      });
    });
    context.on('requestfailed', request => finishProductAction(request, 0, {
      error: { code: 'BROWSER_TRANSPORT_FAILURE' },
    }));
  }

  return Object.freeze({ startProductAction, finishProductAction });
};
