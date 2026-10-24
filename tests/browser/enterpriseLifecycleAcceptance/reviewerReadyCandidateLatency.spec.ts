import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import {
  authenticatedLifecycleClickProduct as clickProduct,
  authenticatedLifecycleCompleteRequiredAssessmentFacts as completeRequiredAssessmentFacts,
  authenticatedLifecycleControl as control,
  authenticatedLifecycleEnterAs as enterAs,
  authenticatedLifecycleFinalizeDecisionPack as finalizeDecisionPack,
  authenticatedLifecycleOpenConnectedProcess as openConnectedProcess,
  createAuthenticatedLifecycleWorkQueue,
  type AuthenticatedLifecycleActor,
  type AuthenticatedLifecycleSetup,
} from '../authenticatedLifecycleHarness';
import {
  authenticatedLifecycleSettleActorNavigationBoundary as settleActorNavigationBoundary,
  installAuthenticatedHostedNetwork,
} from '../authenticatedHostedNetwork';
import { primeV2FullPrefixFixtureSession } from '../../../scripts/v2FullPrefixReproduction.mjs';

const outputDirectory = process.env.REVIEWER_READY_RESULT_DIRECTORY;
if (!outputDirectory) throw new Error('REVIEWER_READY_RESULT_DIRECTORY_REQUIRED');
const eligibleRoute = '/rest/v1/rpc/assess_v2_eligible_reviewers';
const workspaceRoute = '/rest/v1/rpc/assess_v2_review_workspace';
const digest = (value: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

type MutationSnapshot = Readonly<{
  reviewAssignments: number;
  governResolutions: number;
  commandReceipts: number;
  privilegedAudits: number;
}>;

const observe = async (page: Page, route: string, action: () => Promise<unknown>) => {
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === route, { timeout: 15_000 });
  const [response, actionResult] = await Promise.allSettled([responsePromise, action()]);
  if (actionResult.status === 'rejected') throw actionResult.reason;
  if (response.status === 'rejected') throw response.reason;
  return response.value;
};

const installLocalNetworkBoundary = async (context: BrowserContext) => {
  const queue = createAuthenticatedLifecycleWorkQueue();
  const allowedOrigins = new Set([
    process.env.ENTERPRISE_LIFECYCLE_APP_BASE_URL,
    process.env.ENTERPRISE_LIFECYCLE_API_BASE_URL,
  ].filter((value): value is string => Boolean(value)).map(value => new URL(value).origin));
  const lifecycle = await installAuthenticatedHostedNetwork({
    context,
    hosted: false,
    allowedOrigins,
    tracker: null,
    queueNetworkAction: (operation, ownedWork) => queue.enqueue(operation, ownedWork),
    onExternalRequest: () => undefined,
    onHttpRequest: () => undefined,
    onTrackerError: error => queue.enqueue(async () => { throw error; }),
  });
  return async () => settleActorNavigationBoundary({
    settleActionAdmissions: lifecycle.settleActionAdmissions,
    settleResponseBodies: lifecycle.settleResponseBodies,
    drainNetworkActions: queue.drain,
    activeActionCount: () => 0,
  });
};

const enterProcess = async (
  page: Page,
  actor: AuthenticatedLifecycleActor,
  processLabel: string,
  settleBoundary: () => Promise<void>,
) => {
  await enterAs(page, actor, settleBoundary);
  if (!(await page.getByRole('heading', { name: 'Process Catalog', exact: true }).isVisible().catch(() => false))) {
    await clickProduct(page, 'Assess');
  }
  return openConnectedProcess(page, processLabel);
};

test('committed reviewer-ready projection is hidden by only the pending real candidate RPC before the fix', async ({ context, page }, testInfo) => {
  const projectSlug = testInfo.project.name.replaceAll(/[^a-z0-9-]/giu, '-').toLowerCase();
  const outputPath = path.join(outputDirectory, `before-browser-${projectSlug}.json`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({
    schemaVersion: 'reviewer-ready-candidate-latency-before-browser-v1', status: 'running', phase: 'control-setup',
    actorLimitMs: 15_000, providersEnabled: false, hostedRun: false, fullAcceptance: false, rawLogsRetained: false,
  }, null, 2)}\n`, 'utf8');
  const setup = await control<AuthenticatedLifecycleSetup>('/control/setup', {
    projectName: `reviewer-ready-candidate-latency-${projectSlug}`,
  });
  const settleBoundary = await installLocalNetworkBoundary(context);
  await writeFile(outputPath, `${JSON.stringify({
    schemaVersion: 'reviewer-ready-candidate-latency-before-browser-v1', status: 'running', phase: 'fixture-session-prime',
    actorLimitMs: 15_000, providersEnabled: false, hostedRun: false, fullAcceptance: false, rawLogsRetained: false,
  }, null, 2)}\n`, 'utf8');
  const fixtureSessionPrimed = await primeV2FullPrefixFixtureSession(
    page,
    setup.actors.author,
    process.env.ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY ?? 'sb-127-auth-token',
  );
  const checkpoint = async (phase: string) => {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify({
      schemaVersion: 'reviewer-ready-candidate-latency-before-browser-v1',
      status: 'running',
      phase,
      fixtureSessionPrimed,
      actorLimitMs: 15_000,
      providersEnabled: false,
      hostedRun: false,
      fullAcceptance: false,
      rawLogsRetained: false,
    }, null, 2)}\n`, 'utf8');
  };

  await checkpoint('author-entry');
  await enterProcess(page, setup.actors.author, setup.aliases.process, settleBoundary);
  expect((await observe(page, '/functions/v1/assess-v2-command', () =>
    page.getByRole('button', { name: 'New assessment (V2)', exact: true }).click())).status()).toBe(200);
  await page.getByRole('button', { name: 'Add minimum working structure', exact: true }).click();
  await completeRequiredAssessmentFacts(page, 'hitl');
  expect((await observe(page, '/functions/v1/assess-v2-command', () =>
    page.getByRole('button', { name: 'Save V2 draft', exact: true }).click())).status()).toBe(200);
  expect((await observe(page, '/functions/v1/assess-v2-command', () => finalizeDecisionPack(page))).status()).toBe(200);

  await checkpoint('reviewer-entry');
  const before = await control<MutationSnapshot>('/control/snapshot', { projectName: setup.projectName });
  let releaseCandidate!: () => void;
  const candidateRelease = new Promise<void>(resolve => { releaseCandidate = resolve; });
  let candidateEntered!: () => void;
  const candidateEntry = new Promise<void>(resolve => { candidateEntered = resolve; });
  let eligibleRequests = 0;
  let assignmentRequests = 0;
  const reviewerAuthorization = `Bearer ${setup.actors.reviewer.token}`;
  const isReviewerRequest = (headers: Record<string, string>) => headers.authorization === reviewerAuthorization;
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/functions/v1/assess-v2-command'
      && request.postDataJSON()?.commandType === 'assessment_v2.review.assign') assignmentRequests += 1;
  });
  const candidateHandler = async (route: Route) => {
    if (!isReviewerRequest(route.request().headers())) { await route.fallback(); return; }
    eligibleRequests += 1;
    candidateEntered();
    await candidateRelease;
    await route.fallback();
  };
  await page.route(`**${eligibleRoute}`, candidateHandler);

  const workspaceResponsePromise = page.waitForResponse(response =>
    new URL(response.url()).pathname === workspaceRoute && response.status() === 200
      && isReviewerRequest(response.request().headers()), { timeout: 15_000 });
  let timedOut = false;
  let elapsedMs = 0;
  let workspaceStatus: unknown = null;
  try {
    await enterProcess(page, setup.actors.reviewer, setup.aliases.process, settleBoundary);
    await checkpoint('workspace-observation');
    const workspaceResponse = await workspaceResponsePromise;
    const workspaceProjection = await workspaceResponse.json() as { status?: unknown };
    workspaceStatus = workspaceProjection.status;
    expect(workspaceStatus).toBe('reviewer_ready');
    await candidateEntry;

    await checkpoint('blocked-ui-assertion');
    const reviewWorkspace = page.getByTestId('assess-v2-review-workspace');
    const startedAt = Date.now();
    try {
      await expect(reviewWorkspace).toContainText('Reviewer-ready', { timeout: 15_000 });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      timedOut = true;
    }
    elapsedMs = Date.now() - startedAt;
    expect(timedOut).toBe(true);
    expect(elapsedMs).toBeGreaterThanOrEqual(14_500);
    expect(await reviewWorkspace.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).count()).toBe(0);
    expect(assignmentRequests).toBe(0);
    expect(await control<MutationSnapshot>('/control/snapshot', { projectName: setup.projectName })).toEqual(before);

    await checkpoint('candidate-release');
    const eligibleResponsePromise = page.waitForResponse(response =>
      new URL(response.url()).pathname === eligibleRoute && response.status() === 200
        && isReviewerRequest(response.request().headers()), { timeout: 15_000 });
    releaseCandidate();
    await eligibleResponsePromise;
    await expect(reviewWorkspace).toContainText('Reviewer-ready');
    const select = reviewWorkspace.getByLabel('Eligible reviewer', { exact: true });
    await expect(select.locator('option')).toHaveCount(1);
    expect(eligibleRequests).toBe(1);
    expect(assignmentRequests).toBe(0);
    expect(await control<MutationSnapshot>('/control/snapshot', { projectName: setup.projectName })).toEqual(before);
  } finally {
    releaseCandidate();
    await page.unroute(`**${eligibleRoute}`, candidateHandler).catch(() => undefined);
  }

  const result = {
    schemaVersion: 'reviewer-ready-candidate-latency-before-browser-v1',
    status: 'reproduced',
    mode: 'actual-chromium-production-ui-production-handlers-disposable-postgresql',
    fixtureSessionPrimed,
    committedWorkspaceStatus: workspaceStatus,
    candidateGate: { route: 'eligible-reviewers-rpc', actualHandlerForwardedAfterRelease: true, requestCount: eligibleRequests },
    beforeRelease: {
      reviewerReadyAssertionTimedOut: timedOut,
      assertionTimeoutMs: 15_000,
      assertionElapsedAtLeastMs: 14_500,
      observedElapsedMs: elapsedMs,
      assignmentActionVisible: false,
      assignmentRequestCount: assignmentRequests,
      mutationDelta: 0,
    },
    afterRelease: { reviewerReadyVisible: true, eligibleReviewerCount: 1, mutationDelta: 0 },
    proofDigest: digest({ timedOut, eligibleRequests, assignmentRequests, before, elapsedAtLeast: elapsedMs >= 14_500 }),
    evidenceBoundary: {
      fixtureAuth: 'local-loopback-only',
      latency: 'controlled-candidate-rpc-delay',
      historicalHostedExclusiveCauseProven: false,
    },
    actorLimitMs: 15_000,
    providersEnabled: false,
    hostedRun: false,
    fullAcceptance: false,
    rawLogsRetained: false,
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
});
