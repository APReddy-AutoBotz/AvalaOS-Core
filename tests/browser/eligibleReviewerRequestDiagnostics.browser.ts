import { createServer, type Server, type ServerResponse } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { AuthenticatedHostedBrowserActionTracker } from '../../scripts/authenticatedHostedBrowserRequestClassifier.mjs';
import { ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTIC_ATTACHMENT } from '../../scripts/eligibleReviewerRequestDiagnostic.mjs';
import { installAuthenticatedHostedNetwork } from './authenticatedHostedNetwork';
import { createEligibleReviewerRequestDiagnostics } from './eligibleReviewerRequestDiagnostics';

const listen = (server: Server) => new Promise<number>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port));
});
const close = (server: Server | null) => server ? new Promise<void>((resolve, reject) => {
  server.closeAllConnections?.();
  server.close(error => error ? reject(error) : resolve());
}) : Promise.resolve();

test.describe.configure({ mode: 'serial' });
test.describe('eligible reviewer request diagnostics loopback', () => {
  let app: Server | null = null, api: Server | null = null;
  let appOrigin = '', apiOrigin = '';
  let eligibleResponse: ServerResponse | null = null;
  let releaseEligible = () => {};
  let settleNetwork: (() => Promise<void>) | null = null;
  let drainActions: (() => Promise<void>) | null = null;
  const cleanup = { eligibleReleased: false, networkSettled: false, actionsDrained: false,
    appClosed: false, apiClosed: false, providersEnabled: false };

  test.beforeAll(async () => {
    app = createServer((_request, response) => {
      response.setHeader('content-type', 'text/html');
      response.end(`<!doctype html><html><body><main data-testid="assess-v2-review-workspace"></main><script>
        Promise.all([
          fetch('${apiOrigin}/rest/v1/rpc/assess_v2_review_queue',{method:'POST'}),
          fetch('${apiOrigin}/rest/v1/rpc/assess_v2_review_workspace',{method:'POST'}),
          fetch('${apiOrigin}/rest/v1/rpc/assess_v2_eligible_reviewers',{method:'POST'})
        ]).catch(()=>{});
      </script></body></html>`);
    });
    appOrigin = `http://127.0.0.1:${await listen(app)}`;
    api = createServer((request, response) => {
      response.setHeader('access-control-allow-origin', '*');
      response.setHeader('content-type', 'application/json');
      if (request.url === '/rest/v1/rpc/assess_v2_eligible_reviewers') {
        eligibleResponse = response;
        releaseEligible = () => {
          if (!eligibleResponse) return;
          cleanup.eligibleReleased = true;
          eligibleResponse.end(JSON.stringify([{ actorId: 'synthetic', label: 'Synthetic Reviewer', authorizationVersion: 1 }]));
          eligibleResponse = null;
        };
        return;
      }
      response.end('[]');
    });
    apiOrigin = `http://127.0.0.1:${await listen(api)}`;
  });

  test.afterEach(async () => {
    releaseEligible();
    await settleNetwork?.(); cleanup.networkSettled = true;
    await drainActions?.(); cleanup.actionsDrained = true;
  });

  test.afterAll(async () => {
    releaseEligible();
    await close(api); cleanup.apiClosed = true;
    await close(app); cleanup.appClosed = true;
    const destination = process.env.ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTICS_CLEANUP_PATH;
    if (!destination) throw new Error('ELIGIBLE_REVIEWER_DIAGNOSTICS_CLEANUP_PATH_REQUIRED');
    await writeFile(destination, `${JSON.stringify(cleanup)}\n`, { encoding: 'utf8', mode: 0o600 });
  });

  test('independent approval, Govern separation and synthetic Studio generation retain exact lineage', async ({ context, page }, testInfo) => {
    let actionOrdinal = 0;
    const tracker = new AuthenticatedHostedBrowserActionTracker({ backendOrigin: apiOrigin, appOrigin,
      startAction: async () => ({ actionId: `local-${++actionOrdinal}` }), finishAction: async () => {} });
    let tail = Promise.resolve();
    const diagnostics = createEligibleReviewerRequestDiagnostics({ backendOrigin: apiOrigin });
    diagnostics.registerPage(page);
    const lifecycle = await installAuthenticatedHostedNetwork({ context, hosted: true,
      allowedOrigins: new Set([appOrigin, apiOrigin]), tracker,
      queueNetworkAction: (operation, ownedWork) => {
        tail = tail.then(async () => { if (ownedWork) await ownedWork; await operation(); });
      },
      onExternalRequest: () => { throw new Error('ELIGIBLE_REVIEWER_DIAGNOSTICS_EXTERNAL_REQUEST'); },
      onHttpRequest: () => {}, onTrackerError: error => { tail = tail.then(async () => { throw error; }); },
      requestDiagnostics: diagnostics,
    });
    settleNetwork = async () => { await lifecycle.settleActionAdmissions(); await lifecycle.settleResponseBodies(); };
    drainActions = async () => { await tail; };
    const selection = diagnostics.beginSelection(page);
    await page.goto(appOrigin);
    const selector = page.getByLabel('Eligible reviewer', { exact: true });
    try {
      await test.step('hosted:govern-studio:eligible-reviewer-visible', () =>
        expect(selector).toBeVisible({ timeout: 15_000 }));
    } catch (error) {
      try {
        const value = diagnostics.freeze(selection, testInfo.project.name,
          { workspace: 'unknown', candidates: 'unknown' });
        if (value) await testInfo.attach(ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTIC_ATTACHMENT,
          { body: Buffer.from(JSON.stringify(value)), contentType: 'application/json' });
      } catch { /* preserve the exact assertion error */ }
      throw error;
    }
  });
});
