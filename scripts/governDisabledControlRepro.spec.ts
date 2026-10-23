import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  authenticatedLifecycleAttestEverySubmittedEvidence as attestEverySubmittedEvidence,
  authenticatedLifecycleClickProduct as clickProduct,
  authenticatedLifecycleCompleteRequiredAssessmentFacts as completeRequiredAssessmentFacts,
  authenticatedLifecycleControl as control,
  authenticatedLifecycleEnterAs as enterAs,
  authenticatedLifecycleFinalizeDecisionPack as finalizeDecisionPack,
  authenticatedLifecycleOpenConnectedProcess as openConnectedProcess,
  authenticatedLifecycleResolveEveryGovernControl as resolveEveryGovernControl,
  authenticatedLifecycleSelectReviewer as selectReviewer,
  createAuthenticatedLifecycleWorkQueue,
  type AuthenticatedLifecycleSetup,
  type AuthenticatedLifecycleActor,
} from '../tests/browser/authenticatedLifecycleHarness';
import {
  authenticatedLifecycleSettleActorNavigationBoundary as settleActorNavigationBoundary,
  installAuthenticatedHostedNetwork,
} from '../tests/browser/authenticatedHostedNetwork';
import { exerciseReviewerGovernDenial } from '../tests/browser/enterpriseLifecycleAcceptance/governReviewerDenial';
import { primeV2FullPrefixFixtureSession } from './v2FullPrefixReproduction.mjs';

const outputDirectory = process.env.GOVERN_DISABLED_REPRO_BROWSER_RESULT_DIRECTORY;
if (!outputDirectory) throw new Error('GOVERN_DISABLED_REPRO_BROWSER_RESULT_DIRECTORY_REQUIRED');
const screenshotDirectory = process.env.GOVERN_DISABLED_REPRO_SCREENSHOT_DIRECTORY;
if (!screenshotDirectory) throw new Error('GOVERN_DISABLED_REPRO_SCREENSHOT_DIRECTORY_REQUIRED');

const hash = (value: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
type MutationSnapshot = Readonly<{
  reviewAssignments: number;
  governResolutions: number;
  commandReceipts: number;
  privilegedAudits: number;
}>;
const observeCommand = async (page: Page, action: () => Promise<unknown>) => {
  const responsePromise = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/functions/v1/assess-v2-command', { timeout: 15_000 });
  const [response, actionResult] = await Promise.allSettled([responsePromise, action()]);
  if (actionResult.status === 'rejected') throw actionResult.reason;
  if (response.status === 'rejected') throw response.reason;
  return response.value;
};

const installLocalNetworkBoundary = async (context: BrowserContext) => {
  const networkQueue = createAuthenticatedLifecycleWorkQueue();
  const allowedOrigins = new Set([
    process.env.ENTERPRISE_LIFECYCLE_APP_BASE_URL,
    process.env.ENTERPRISE_LIFECYCLE_API_BASE_URL,
  ].filter((value): value is string => Boolean(value)).map(value => new URL(value).origin));
  const lifecycle = await installAuthenticatedHostedNetwork({
    context,
    hosted: false,
    allowedOrigins,
    tracker: null,
    queueNetworkAction: (operation, ownedWork) => networkQueue.enqueue(operation, ownedWork),
    onExternalRequest: () => undefined,
    onHttpRequest: () => undefined,
    onTrackerError: error => networkQueue.enqueue(async () => { throw error; }),
  });
  return async () => settleActorNavigationBoundary({
    settleActionAdmissions: lifecycle.settleActionAdmissions,
    settleResponseBodies: lifecycle.settleResponseBodies,
    drainNetworkActions: networkQueue.drain,
    activeActionCount: () => 0,
  });
};

const enterProcessWithBoundary = async (
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

test('verifies disabled reviewer UI, authenticated denial and independent resolution', async ({ context, page }, testInfo) => {
  const projectSlug = testInfo.project.name.replaceAll(/[^a-z0-9-]/giu, '-').toLowerCase();
  const outputPath = path.join(outputDirectory, `browser-${projectSlug}.json`);
  const screenshotPath = path.join(screenshotDirectory, `reviewer-denial-${projectSlug}.png`);
  const safeNetwork: Array<{ route: string; status?: number; failed?: boolean; errorText?: string }> = [];
  const safeConsoleCategories = new Set<string>();
  page.on('console', message => {
    const value = message.text();
    if (/cors/iu.test(value)) safeConsoleCategories.add('cors');
    if (/x-supabase-api-version/iu.test(value)) safeConsoleCategories.add('x-supabase-api-version');
    if (/blocked by client/iu.test(value)) safeConsoleCategories.add('blocked-by-client');
  });
  const safeRoute = (url: string) => {
    const pathname = new URL(url).pathname;
    return ['/auth/v1/user', '/functions/v1/tenant-session'].includes(pathname) ? pathname : null;
  };
  page.on('response', response => {
    const route = safeRoute(response.url());
    if (route) safeNetwork.push({ route, status: response.status() });
  });
  page.on('requestfailed', request => {
    const route = safeRoute(request.url());
    if (route) safeNetwork.push({ route, failed: true, errorText: request.failure()?.errorText });
  });
  const setup = await control<AuthenticatedLifecycleSetup>('/control/setup', {
    projectName: `govern-reviewer-denial-after-${projectSlug}`,
  });
  const settleBoundary = await installLocalNetworkBoundary(context);
  const fixtureSessionPrimed = await primeV2FullPrefixFixtureSession(
    page,
    setup.actors.author,
    process.env.ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY ?? 'sb-127-auth-token',
  );
  try { await enterProcessWithBoundary(page, setup.actors.author, setup.aliases.process, settleBoundary); }
  catch (error) {
    const bodyText = await page.locator('body').innerText().catch(() => '');
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify({
      schemaVersion: 'govern-reviewer-denial-browser-after-v1', status: 'setup_blocked',
      setupFailure: {
        message: error instanceof Error ? error.message : String(error), url: page.url(),
        safeNetwork, safeConsoleCategories: [...safeConsoleCategories].sort(), bodyTextDigest: hash(bodyText),
      },
    }, null, 2)}\n`, 'utf8');
    throw error;
  }
  expect((await observeCommand(page, () =>
    page.getByRole('button', { name: 'New assessment (V2)', exact: true }).click())).status()).toBe(200);
  await page.getByRole('button', { name: 'Add minimum working structure', exact: true }).click();
  await completeRequiredAssessmentFacts(page, 'hitl');
  expect((await observeCommand(page, () =>
    page.getByRole('button', { name: 'Save V2 draft', exact: true }).click())).status()).toBe(200);
  expect((await observeCommand(page, () => finalizeDecisionPack(page))).status()).toBe(200);

  await enterProcessWithBoundary(page, setup.actors.reviewer, setup.aliases.process, settleBoundary);
  const workspace = page.getByTestId('assess-v2-review-workspace');
  await selectReviewer(page, setup.actors.reviewer);
  expect((await observeCommand(page, () =>
    workspace.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click())).status()).toBe(200);
  await expect(page.getByText(/Reviewer assignment committed\./u)).toBeVisible();
  expect(await attestEverySubmittedEvidence(page, 'Revised evidence independently verified.')).toBeGreaterThan(0);
  await workspace.getByLabel('Review rationale', { exact: true })
    .fill('Revised decision and exact evidence are independently approved.');
  const approvalStatus = (await observeCommand(page, () =>
    workspace.getByRole('button', { name: 'Approve reviewed decision', exact: true }).click())).status();
  expect(approvalStatus).toBe(200);
  await expect(page.getByText('Review resolution committed: Approved.', { exact: true })).toBeVisible();

  const before = await control<MutationSnapshot>('/control/snapshot', { projectName: setup.projectName });
  let reviewerCommandRequests = 0;
  const countTarget = (request: import('@playwright/test').Request) => {
    if (new URL(request.url()).pathname === '/functions/v1/assess-v2-command') reviewerCommandRequests += 1;
  };
  page.on('request', countTarget);
  const reviewerDenial = await exerciseReviewerGovernDenial({
    page,
    workspace: page.getByTestId('assess-v2-review-workspace'),
    apiBaseUrl: process.env.ENTERPRISE_LIFECYCLE_API_BASE_URL ?? '',
    rationale: 'The final reviewer must not resolve this financial high-impact decision.',
  });
  page.off('request', countTarget);
  expect(reviewerDenial.status).toBe(403);
  expect(reviewerDenial.errorCode).toBe('PERMISSION_DENIED');
  expect(reviewerCommandRequests).toBe(1);
  const afterDenial = await control<MutationSnapshot>('/control/snapshot', { projectName: setup.projectName });
  expect(afterDenial).toEqual(before);
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });

  await enterProcessWithBoundary(page, setup.actors.approver, setup.aliases.process, settleBoundary);
  const approverWorkspace = page.getByTestId('assess-v2-review-workspace');
  const resolvedControlCount = await resolveEveryGovernControl(page);
  expect(resolvedControlCount).toBeGreaterThan(0);
  await approverWorkspace.getByLabel('Govern rationale', { exact: true })
    .fill('Independent resolver confirmed every required control.');
  const approverStatus = (await observeCommand(page, () =>
    approverWorkspace.getByRole('button', { name: 'Resolve Govern controls', exact: true }).click())).status();
  expect(approverStatus).toBe(200);
  await expect(page.getByText('Govern resolution committed.', { exact: true })).toBeVisible();
  const afterResolution = await control<MutationSnapshot>('/control/snapshot', { projectName: setup.projectName });
  const resolutionDelta = {
    reviewAssignments: afterResolution.reviewAssignments - before.reviewAssignments,
    governResolutions: afterResolution.governResolutions - before.governResolutions,
    commandReceipts: afterResolution.commandReceipts - before.commandReceipts,
    privilegedAudits: afterResolution.privilegedAudits - before.privilegedAudits,
  };
  const result = {
    schemaVersion: 'govern-reviewer-denial-browser-after-v1',
    status: reviewerDenial.status === 403 && reviewerDenial.errorCode === 'PERMISSION_DENIED'
      && reviewerCommandRequests === 1 && JSON.stringify(before) === JSON.stringify(afterDenial)
      && approverStatus === 200 && resolutionDelta.reviewAssignments === 0
      && resolutionDelta.governResolutions === 1 && resolutionDelta.commandReceipts === 1
      && resolutionDelta.privilegedAudits === 1 ? 'passed' : 'failed',
    prerequisite: {
      mode: 'actual-production-ui-and-handlers',
      fixtureSessionPrimed,
      stages: ['author-create', 'author-draft', 'author-finalize', 'reviewer-assign', 'reviewer-attest', 'reviewer-approve'],
      approvalStatus,
      approvedStateVisible: true,
      resolvedControlCount,
      governStateBeforeAttempt: 'pending',
    },
    reviewerDenial: {
      control: 'Resolve Govern controls',
      uiDisabled: reviewerDenial.uiDisabled,
      status: reviewerDenial.status,
      errorCode: reviewerDenial.errorCode,
      exactCurrentScope: reviewerDenial.exactCurrentScope,
      exactCurrentVersion: reviewerDenial.exactCurrentVersion,
      requestDigest: reviewerDenial.requestDigest,
      requestCount: reviewerCommandRequests,
      zeroEffects: JSON.stringify(before) === JSON.stringify(afterDenial),
    },
    independentResolution: { status: approverStatus, resolutionDelta },
    mutation: {
      beforeHash: hash(before),
      afterDenialHash: hash(afterDenial),
      afterResolutionHash: hash(afterResolution),
    },
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  expect(result.status).toBe('passed');
});
