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
}>;

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
        const responseBody = await response.json().catch(() => ({}));
        await tracker.finish(request, response.status(), responseBody);
      });
    });
    context.on('requestfailed', request => finishProductAction(request, 0, {
      error: { code: 'BROWSER_TRANSPORT_FAILURE' },
    }));
  }

  return Object.freeze({ startProductAction, finishProductAction });
};
