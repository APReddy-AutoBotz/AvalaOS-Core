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
  authenticatedLifecycleEnterStudioAs as enterStudioAs,
  authenticatedLifecycleFinalizeDecisionPack as finalizeDecisionPack,
  authenticatedLifecycleOpenConnectedProcess as openConnectedProcess,
  authenticatedLifecycleOpenStudioHandoffDecision as openStudioHandoffDecision,
  authenticatedLifecycleResolveEveryGovernControl as resolveEveryGovernControl,
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

const outputDirectory = process.env.STUDIO_HANDOFF_PERSONA_RESULT_DIRECTORY;
if (!outputDirectory) throw new Error('STUDIO_HANDOFF_PERSONA_RESULT_DIRECTORY_REQUIRED');
const digest = (value: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

type LifecycleFrame = Readonly<{
  handoffs: number;
  sourcePackages: number;
}>;
type DirectAuthorDenial = Readonly<{
  denied: boolean;
  status: number;
  errorCode: string;
  zeroEffects: boolean;
  projectionReadRefused: boolean;
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

const commitStudioDecision = async (
  page: Page,
  buttonName: string,
  rationale?: string,
  mailbox: 'Inbox' | 'Outbox' = 'Inbox',
) => {
  const dialog = await openStudioHandoffDecision(page, buttonName, rationale, mailbox);
  const response = await observe(page, '/functions/v1/studio-artifact-command', () =>
    dialog.getByRole('button', { name: 'Confirm', exact: true }).click());
  await expect(dialog).toBeHidden();
  return response;
};

test('exact Studio handoff personas preserve three-party authority in production UI', async ({ context, page }, testInfo) => {
  const projectSlug = testInfo.project.name.replaceAll(/[^a-z0-9-]/giu, '-').toLowerCase();
  const outputPath = path.join(outputDirectory, `browser-${projectSlug}.json`);
  const setup = await control<AuthenticatedLifecycleSetup>('/control/setup', {
    projectName: `studio-handoff-persona-${projectSlug}`,
  });
  const settleBoundary = await installLocalNetworkBoundary(context);
  const fixtureSessionPrimed = await primeV2FullPrefixFixtureSession(
    page,
    setup.actors.author,
    process.env.ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY ?? 'sb-127-auth-token',
  );

  await enterProcess(page, setup.actors.author, setup.aliases.process, settleBoundary);
  expect((await observe(page, '/functions/v1/assess-v2-command', () =>
    page.getByRole('button', { name: 'New assessment (V2)', exact: true }).click())).status()).toBe(200);
  await page.getByRole('button', { name: 'Add minimum working structure', exact: true }).click();
  await completeRequiredAssessmentFacts(page, 'hitl');
  expect((await observe(page, '/functions/v1/assess-v2-command', () =>
    page.getByRole('button', { name: 'Save V2 draft', exact: true }).click())).status()).toBe(200);
  expect((await observe(page, '/functions/v1/assess-v2-command', () => finalizeDecisionPack(page))).status()).toBe(200);

  await enterProcess(page, setup.actors.reviewer, setup.aliases.process, settleBoundary);
  let reviewWorkspace = page.getByTestId('assess-v2-review-workspace');
  await selectReviewer(page, setup.actors.reviewer);
  expect((await observe(page, '/functions/v1/assess-v2-command', () =>
    reviewWorkspace.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click())).status()).toBe(200);
  await expect(page.getByText(/Reviewer assignment committed\./u)).toBeVisible();
  expect(await attestEverySubmittedEvidence(page, 'Exact evidence independently verified.')).toBeGreaterThan(0);
  await reviewWorkspace.getByLabel('Review rationale', { exact: true }).fill('Exact decision independently approved.');
  expect((await observe(page, '/functions/v1/assess-v2-command', () =>
    reviewWorkspace.getByRole('button', { name: 'Approve reviewed decision', exact: true }).click())).status()).toBe(200);

  await enterProcess(page, setup.actors.approver, setup.aliases.process, settleBoundary);
  reviewWorkspace = page.getByTestId('assess-v2-review-workspace');
  expect(await resolveEveryGovernControl(page)).toBeGreaterThan(0);
  await reviewWorkspace.getByLabel('Govern rationale', { exact: true }).fill('Independent resolver confirmed every required control.');
  expect((await observe(page, '/functions/v1/assess-v2-command', () =>
    reviewWorkspace.getByRole('button', { name: 'Resolve Govern controls', exact: true }).click())).status()).toBe(200);
  expect((await observe(page, '/functions/v1/assess-v2-command', () =>
    reviewWorkspace.getByRole('button', { name: 'Create durable Studio handoff', exact: true }).click())).status()).toBe(200);

  const before = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName: setup.projectName });
  expect(before.sourcePackages).toBe(0);

  await enterStudioAs(page, setup.actors.author, settleBoundary);
  const requestResponse = await test.step('local:studio-handoff:author-request', () =>
    commitStudioDecision(page, 'Request handoff'));
  expect(requestResponse.status()).toBe(201);

  await enterStudioAs(page, setup.actors.reviewer, settleBoundary);
  const reviewResponse = await test.step('local:studio-handoff:reviewer-review', () =>
    commitStudioDecision(page, 'Approve review', 'Independent Studio handoff review approved.'));
  expect(reviewResponse.status()).toBe(201);

  const directDenial = await control<DirectAuthorDenial>('/control/studio-final-accept-direct-denial', {
    projectName: setup.projectName,
  });
  expect(directDenial).toEqual({
    denied: true,
    status: 403,
    errorCode: 'PERMISSION_DENIED',
    zeroEffects: true,
    projectionReadRefused: false,
  });

  await enterStudioAs(page, setup.actors.approver, settleBoundary);
  const acceptanceResponse = await test.step('local:studio-handoff:approver-final-accept', () =>
    commitStudioDecision(page, 'Final accept', 'Independent Studio handoff approval accepted.'));
  expect(acceptanceResponse.status()).toBe(201);
  const consumeResponse = await test.step('local:studio-handoff:approver-consume-inbox', () =>
    commitStudioDecision(page, 'Start Studio draft', undefined, 'Inbox'));
  expect(consumeResponse.status()).toBe(201);

  const after = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName: setup.projectName });
  expect(after.sourcePackages).toBe(1);
  expect(after.sourcePackages - before.sourcePackages).toBe(1);
  const result = {
    schemaVersion: 'studio-handoff-persona-browser-v1',
    status: 'passed',
    project: projectSlug,
    mode: 'actual-chromium-production-ui-production-handlers-disposable-postgresql',
    fixtureSessionPrimed,
    actorSequence: ['author-request', 'reviewer-review', 'approver-final-accept', 'approver-consume-inbox'],
    responseStatuses: {
      request: requestResponse.status(),
      review: reviewResponse.status(),
      finalAccept: acceptanceResponse.status(),
      consume: consumeResponse.status(),
    },
    directAuthorApproval: directDenial,
    sourcePackages: { before: before.sourcePackages, after: after.sourcePackages, delta: after.sourcePackages - before.sourcePackages },
    proofDigest: digest({ actorSequence: ['author-request', 'reviewer-review', 'approver-final-accept', 'approver-consume-inbox'], sourcePackageDelta: 1 }),
    actorLimitMs: 15_000,
    providersEnabled: false,
    hostedRun: false,
    fullAcceptance: false,
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
});
