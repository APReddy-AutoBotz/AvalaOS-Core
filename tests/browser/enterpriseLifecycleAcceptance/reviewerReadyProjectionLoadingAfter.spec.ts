import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type BrowserContext, type Page, type Request, type Route } from '@playwright/test';
import {
  authenticatedLifecycleClickProduct as clickProduct,
  authenticatedLifecycleCompleteRequiredAssessmentFacts as completeRequiredAssessmentFacts,
  authenticatedLifecycleControl as control,
  authenticatedLifecycleEnterAs as enterAs,
  authenticatedLifecycleFinalizeDecisionPack as finalizeDecisionPack,
  authenticatedLifecycleOpenConnectedProcess as openConnectedProcess,
  authenticatedLifecycleSelectReviewer as selectReviewer,
  createAuthenticatedLifecycleWorkQueue,
  type AuthenticatedLifecycleActor,
  type AuthenticatedLifecycleSetup,
} from '../authenticatedLifecycleHarness';
import {
  authenticatedLifecycleSettleActorNavigationBoundary as settleActorNavigationBoundary,
  installAuthenticatedHostedNetwork,
} from '../authenticatedHostedNetwork';
import { primeV2FullPrefixFixtureSession } from '../../../scripts/v2FullPrefixReproduction.mjs';

const outputDirectory = process.env.REVIEWER_READY_AFTER_RESULT_DIRECTORY;
if (!outputDirectory) throw new Error('REVIEWER_READY_AFTER_RESULT_DIRECTORY_REQUIRED');
const eligibleRoute = '/rest/v1/rpc/assess_v2_eligible_reviewers';
const workspaceRoute = '/rest/v1/rpc/assess_v2_review_workspace';
const digest = (value: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
type MutationSnapshot = Readonly<{ reviewAssignments: number; governResolutions: number; commandReceipts: number; privilegedAudits: number }>;
type ReviewResolutionFrame = Readonly<{ changesRequested: number; rejectedReviews: number }>;

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
    context, hosted: false, allowedOrigins, tracker: null,
    queueNetworkAction: (operation, ownedWork) => queue.enqueue(operation, ownedWork),
    onExternalRequest: () => undefined, onHttpRequest: () => undefined,
    onTrackerError: error => queue.enqueue(async () => { throw error; }),
  });
  return async () => settleActorNavigationBoundary({
    settleActionAdmissions: lifecycle.settleActionAdmissions,
    settleResponseBodies: lifecycle.settleResponseBodies,
    drainNetworkActions: queue.drain,
    activeActionCount: () => 0,
  });
};

const enterProcess = async (page: Page, actor: AuthenticatedLifecycleActor, processLabel: string, settleBoundary: () => Promise<void>) => {
  await enterAs(page, actor, settleBoundary);
  if (!(await page.getByRole('heading', { name: 'Process Catalog', exact: true }).isVisible().catch(() => false))) await clickProduct(page, 'Assess');
  return openConnectedProcess(page, processLabel);
};

const prepareReviewerReady = async (context: BrowserContext, page: Page, projectName: string) => {
  const setup = await control<AuthenticatedLifecycleSetup>('/control/setup', { projectName });
  const settleBoundary = await installLocalNetworkBoundary(context);
  const fixtureSessionPrimed = await primeV2FullPrefixFixtureSession(
    page, setup.actors.author, process.env.ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY ?? 'sb-127-auth-token',
  );
  await enterProcess(page, setup.actors.author, setup.aliases.process, settleBoundary);
  expect((await observe(page, '/functions/v1/assess-v2-command', () =>
    page.getByRole('button', { name: 'New assessment (V2)', exact: true }).click())).status()).toBe(200);
  await page.getByRole('button', { name: 'Add minimum working structure', exact: true }).click();
  await completeRequiredAssessmentFacts(page, 'hitl');
  expect((await observe(page, '/functions/v1/assess-v2-command', () =>
    page.getByRole('button', { name: 'Save V2 draft', exact: true }).click())).status()).toBe(200);
  expect((await observe(page, '/functions/v1/assess-v2-command', () => finalizeDecisionPack(page))).status()).toBe(200);
  return { setup, settleBoundary, fixtureSessionPrimed };
};

test('committed reviewer-ready projection remains visible while candidates fail closed and stale responses are discarded', async ({ context, page }, testInfo) => {
  const projectSlug = testInfo.project.name.replaceAll(/[^a-z0-9-]/giu, '-').toLowerCase();
  const outputPath = path.join(outputDirectory, `after-browser-${projectSlug}.json`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const checkpoint = async (phase: string) => writeFile(outputPath, `${JSON.stringify({
    schemaVersion: 'reviewer-ready-projection-loading-after-browser-v1', status: 'running', phase,
    project: testInfo.project.name,
    executionMode: 'actual-chromium-production-ui-production-handlers-disposable-postgresql',
    actorLimitMs: 15_000, providersEnabled: false, hostedRun: false, fullAcceptance: false, rawLogsRetained: false,
  }, null, 2)}\n`, 'utf8');
  await checkpoint('control-setup');
  const setup = await control<AuthenticatedLifecycleSetup>('/control/setup', {
    projectName: `reviewer-ready-projection-after-${projectSlug}`,
  });
  const settleBoundary = await installLocalNetworkBoundary(context);
  const fixtureSessionPrimed = await primeV2FullPrefixFixtureSession(
    page, setup.actors.author, process.env.ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY ?? 'sb-127-auth-token',
  );

  await checkpoint('author-finalize');
  await enterProcess(page, setup.actors.author, setup.aliases.process, settleBoundary);
  expect((await observe(page, '/functions/v1/assess-v2-command', () =>
    page.getByRole('button', { name: 'New assessment (V2)', exact: true }).click())).status()).toBe(200);
  await page.getByRole('button', { name: 'Add minimum working structure', exact: true }).click();
  await completeRequiredAssessmentFacts(page, 'hitl');
  expect((await observe(page, '/functions/v1/assess-v2-command', () =>
    page.getByRole('button', { name: 'Save V2 draft', exact: true }).click())).status()).toBe(200);
  expect((await observe(page, '/functions/v1/assess-v2-command', () => finalizeDecisionPack(page))).status()).toBe(200);

  const before = await control<MutationSnapshot>('/control/snapshot', { projectName: setup.projectName });
  const reviewerAuthorization = `Bearer ${setup.actors.reviewer.token}`;
  const isReviewerRequest = (headers: Record<string, string>) => headers.authorization === reviewerAuthorization;
  let releaseFirst!: () => void;
  const firstRelease = new Promise<void>(resolve => { releaseFirst = resolve; });
  let firstEntered!: () => void;
  const firstEntry = new Promise<void>(resolve => { firstEntered = resolve; });
  let releaseUnmount!: () => void;
  const unmountRelease = new Promise<void>(resolve => { releaseUnmount = resolve; });
  let unmountEntered!: () => void;
  const unmountEntry = new Promise<void>(resolve => { unmountEntered = resolve; });
  let unmountSettled!: () => void;
  const unmountSettlement = new Promise<void>(resolve => { unmountSettled = resolve; });
  let heldRequest: Request | null = null;
  let unmountRequest: Request | null = null;
  let candidateRequests = 0;
  let actualCandidateForwards = 0;
  let controlledCandidateFailures = 0;
  let assignmentRequests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/functions/v1/assess-v2-command'
      && request.postDataJSON()?.commandType === 'assessment_v2.review.assign') assignmentRequests += 1;
  });
  const candidateHandler = async (route: Route) => {
    if (!isReviewerRequest(route.request().headers())) { await route.fallback(); return; }
    candidateRequests += 1;
    if (candidateRequests === 1) {
      heldRequest = route.request(); firstEntered(); await firstRelease;
      actualCandidateForwards += 1; await route.fallback(); return;
    }
    if (candidateRequests === 2) { controlledCandidateFailures += 1; await route.abort('failed'); return; }
    if (candidateRequests === 4) {
      unmountRequest = route.request();
      unmountEntered(); await unmountRelease;
      try { actualCandidateForwards += 1; await route.fallback(); } finally { unmountSettled(); }
      return;
    }
    actualCandidateForwards += 1; await route.fallback();
  };
  await page.route(`**${eligibleRoute}`, candidateHandler);

  try {
    await checkpoint('pending-candidate');
    const workspaceResponsePromise = page.waitForResponse(response =>
      new URL(response.url()).pathname === workspaceRoute && response.status() === 200
        && isReviewerRequest(response.request().headers()), { timeout: 15_000 });
    await enterProcess(page, setup.actors.reviewer, setup.aliases.process, settleBoundary);
    const workspaceProjection = await (await workspaceResponsePromise).json() as { status?: unknown };
    expect(workspaceProjection.status).toBe('reviewer_ready');
    await firstEntry;
    const reviewWorkspace = page.getByTestId('assess-v2-review-workspace');
    await expect(reviewWorkspace).toContainText('Reviewer-ready', { timeout: 15_000 });
    await expect(reviewWorkspace.getByText('Loading eligible reviewers.', { exact: true })).toBeVisible();
    await expect(reviewWorkspace.getByRole('button', { name: 'Commit reviewer assignment', exact: true })).toHaveCount(0);
    expect(assignmentRequests).toBe(0);
    expect(await control<MutationSnapshot>('/control/snapshot', { projectName: setup.projectName })).toEqual(before);

    await checkpoint('candidate-failure');
    await reviewWorkspace.getByRole('button', { name: 'Reload committed state', exact: true }).click();
    await expect(reviewWorkspace).toContainText('Reviewer-ready');
    await expect(reviewWorkspace.getByText(/Eligible reviewers are unavailable\./u)).toBeVisible();
    await expect(reviewWorkspace.getByLabel('Eligible reviewer', { exact: true })).toHaveCount(0);
    await expect(reviewWorkspace.getByRole('button', { name: 'Commit reviewer assignment', exact: true })).toHaveCount(0);

    await checkpoint('stale-response');
    if (!heldRequest) throw new Error('REVIEWER_READY_HELD_REQUEST_MISSING');
    const heldResponse = page.waitForResponse(response => response.request() === heldRequest && response.status() === 200, { timeout: 15_000 });
    releaseFirst();
    const heldHttpResponse = await heldResponse;
    expect(await heldHttpResponse.finished()).toBeNull();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(reviewWorkspace.getByText(/Eligible reviewers are unavailable\./u)).toBeVisible();
    await expect(reviewWorkspace.getByLabel('Eligible reviewer', { exact: true })).toHaveCount(0);
    expect(await control<MutationSnapshot>('/control/snapshot', { projectName: setup.projectName })).toEqual(before);

    await checkpoint('candidate-recovery');
    await reviewWorkspace.getByRole('button', { name: 'Reload committed state', exact: true }).click();
    await expect(reviewWorkspace.getByLabel('Eligible reviewer', { exact: true }).locator('option')).toHaveCount(1);

    await checkpoint('unmount-stale-response');
    await reviewWorkspace.getByRole('button', { name: 'Reload committed state', exact: true }).click();
    await unmountEntry;
    await clickProduct(page, 'Studio');
    await expect(page.getByTestId('assess-v2-review-workspace')).toHaveCount(0);
    if (!unmountRequest) throw new Error('REVIEWER_READY_UNMOUNT_REQUEST_MISSING');
    const unmountResponse = page.waitForResponse(response => response.request() === unmountRequest && response.status() === 200, { timeout: 15_000 });
    releaseUnmount();
    await unmountSettlement;
    const unmountHttpResponse = await unmountResponse;
    expect(await unmountHttpResponse.finished()).toBeNull();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByLabel('Eligible reviewer', { exact: true })).toHaveCount(0);
    expect(candidateRequests).toBe(4);
    expect(controlledCandidateFailures).toBe(1);
    expect(actualCandidateForwards).toBe(3);
    const result = {
      schemaVersion: 'reviewer-ready-projection-loading-after-browser-v1',
      status: 'passed',
      project: testInfo.project.name,
      executionMode: 'actual-chromium-production-ui-production-handlers-disposable-postgresql',
      fixtureSessionPrimed,
      pending: { committedWorkspaceStatus: workspaceProjection.status, reviewerReadyVisible: true, candidateLoadingVisible: true, assignmentFailClosed: true },
      failure: { committedReviewRetained: true, candidateLabelsCleared: true, assignmentFailClosed: true, controlledTransportFailureCount: controlledCandidateFailures },
      staleCandidateResponse: { discarded: true, candidateLabelsCleared: true },
      unmountCandidateResponse: { discarded: true, candidateLabelsAbsent: true },
      recovery: { eligibleReviewerCount: 1, candidateRequests, actualHandlerForwards: actualCandidateForwards },
      mutationDelta: 0,
      proofDigest: digest({ candidateRequests, actualCandidateForwards, controlledCandidateFailures, assignmentRequests }),
      evidenceBoundary: { fixtureAuth: 'local-loopback-only', historicalHostedExclusiveCauseProven: false },
      actorLimitMs: 15_000, providersEnabled: false, hostedRun: false, fullAcceptance: false, rawLogsRetained: false,
    };
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  } finally {
    releaseFirst(); releaseUnmount();
    await page.unroute(`**${eligibleRoute}`, candidateHandler).catch(() => undefined);
  }
});

test('real assignment is committed once, replayed once and stale resolution remains denied', async ({ context, page }, testInfo) => {
  const projectSlug = testInfo.project.name.replaceAll(/[^a-z0-9-]/giu, '-').toLowerCase();
  const outputPath = path.join(outputDirectory, `after-commands-${projectSlug}.json`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const checkpoint = async (phase: string) => writeFile(outputPath, `${JSON.stringify({
    schemaVersion: 'reviewer-ready-server-commands-after-browser-v1', status: 'running', phase,
    project: testInfo.project.name,
    executionMode: 'actual-chromium-production-ui-production-handlers-disposable-postgresql',
    actorLimitMs: 15_000, providersEnabled: false, hostedRun: false, fullAcceptance: false, rawLogsRetained: false,
  }, null, 2)}\n`, 'utf8');
  await checkpoint('author-finalize');
  const { setup, settleBoundary, fixtureSessionPrimed } = await prepareReviewerReady(
    context, page, `reviewer-ready-commands-after-${projectSlug}`,
  );
  const replayPage = await context.newPage();
  const stalePage = await context.newPage();
  try {
    await checkpoint('reviewer-entry');
    for (const reviewPage of [page, replayPage, stalePage]) {
      await enterProcess(reviewPage, setup.actors.reviewer, setup.aliases.process, settleBoundary);
      await expect(reviewPage.getByTestId('assess-v2-review-workspace')).toContainText('Reviewer-ready');
      await expect(reviewPage.getByLabel('Eligible reviewer', { exact: true }).locator('option')).toHaveCount(1);
    }
    const before = await control<MutationSnapshot>('/control/snapshot', { projectName: setup.projectName });
    await selectReviewer(page, setup.actors.reviewer);
    await selectReviewer(replayPage, setup.actors.reviewer);

    await checkpoint('assignment');
    const assignmentResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/functions/v1/assess-v2-command'
        && response.request().postDataJSON()?.commandType === 'assessment_v2.review.assign');
    await page.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click();
    const assignmentStatus = (await assignmentResponse).status();
    expect(assignmentStatus).toBe(200);
    await expect(page.getByText(/Reviewer assignment committed\./u)).toBeVisible();
    const afterAssignment = await control<MutationSnapshot>('/control/snapshot', { projectName: setup.projectName });
    expect(afterAssignment).toEqual({
      reviewAssignments: before.reviewAssignments + 1, governResolutions: before.governResolutions,
      commandReceipts: before.commandReceipts + 1, privilegedAudits: before.privilegedAudits + 1,
    });

    await checkpoint('assignment-replay');
    const replayResponse = replayPage.waitForResponse(response =>
      new URL(response.url()).pathname === '/functions/v1/assess-v2-command'
        && response.request().postDataJSON()?.commandType === 'assessment_v2.review.assign');
    await replayPage.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click();
    const replayHttpResponse = await replayResponse;
    const replayPayload = await replayHttpResponse.json();
    expect(replayHttpResponse.status()).toBe(200);
    expect(replayPayload.outcome).toBe('replayed');
    expect(await control<MutationSnapshot>('/control/snapshot', { projectName: setup.projectName })).toEqual(afterAssignment);

    await checkpoint('stale-server-command');
    const staleWorkspace = stalePage.getByTestId('assess-v2-review-workspace');
    await staleWorkspace.getByLabel('Review rationale', { exact: true }).fill('Reject the stale reviewer-ready snapshot.');
    const beforeStaleFrame = await control<ReviewResolutionFrame>('/control/lifecycle-frame', { projectName: setup.projectName });
    const staleResponse = stalePage.waitForResponse(response =>
      new URL(response.url()).pathname === '/functions/v1/assess-v2-command'
        && response.request().postDataJSON()?.commandType === 'assessment_v2.review.resolve');
    await staleWorkspace.getByRole('button', { name: 'Request changes', exact: true }).click();
    const staleHttpResponse = await staleResponse;
    const stalePayload = await staleHttpResponse.json();
    expect(staleHttpResponse.status()).toBe(409);
    expect(stalePayload.error?.code).toBe('VERSION_CONFLICT');
    expect(await control<MutationSnapshot>('/control/snapshot', { projectName: setup.projectName })).toEqual(afterAssignment);
    expect(await control<ReviewResolutionFrame>('/control/lifecycle-frame', { projectName: setup.projectName })).toEqual(beforeStaleFrame);

    await writeFile(outputPath, `${JSON.stringify({
      schemaVersion: 'reviewer-ready-server-commands-after-browser-v1', status: 'passed', fixtureSessionPrimed,
      project: testInfo.project.name,
      executionMode: 'actual-chromium-production-ui-production-handlers-disposable-postgresql',
      assignmentStatus, replayStatus: replayHttpResponse.status(), replayOutcome: replayPayload.outcome,
      staleStatus: staleHttpResponse.status(), staleErrorCode: stalePayload.error?.code,
      assignmentDelta: 1, receiptDelta: 1, auditDelta: 1,
      proofDigest: digest({ assignmentStatus, replayOutcome: replayPayload.outcome, staleStatus: staleHttpResponse.status() }),
      actorLimitMs: 15_000, providersEnabled: false, hostedRun: false, fullAcceptance: false, rawLogsRetained: false,
    }, null, 2)}\n`, 'utf8');
  } finally {
    await replayPage.close();
    await stalePage.close();
  }
});
