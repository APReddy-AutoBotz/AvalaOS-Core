import { expect, test, type Page } from '@playwright/test';
import {
  authenticatedLifecycleAttestEverySubmittedEvidence as attestEvidence,
  authenticatedLifecycleClickProduct as clickProduct,
  authenticatedLifecycleCompleteRequiredAssessmentFacts as completeFacts,
  authenticatedLifecycleControl as control,
  authenticatedLifecycleEnterAs as enterAs,
  authenticatedLifecycleFinalizeDecisionPack as finalizeDecision,
  authenticatedLifecycleOpenConnectedProcess as openConnectedProcess,
  authenticatedLifecycleSelectReviewer as selectReviewer,
  type AuthenticatedLifecycleSetup,
} from './authenticatedLifecycleHarness';
import { installAuthenticatedHostedNetwork } from './authenticatedHostedNetwork';
import { AuthenticatedHostedBrowserActionTracker } from '../../scripts/authenticatedHostedBrowserRequestClassifier.mjs';
import {
  createV2ReloadBrowserCheckpointBuilder,
  installV2ReloadReadObserver,
  observeV2ReloadRenderOutcome,
} from './v2ReloadDiagnosticObserver';

const appOrigin = new URL(process.env.ENTERPRISE_LIFECYCLE_APP_BASE_URL ?? 'http://127.0.0.1:4431').origin;
const apiOrigin = new URL(process.env.ENTERPRISE_LIFECYCLE_API_BASE_URL ?? 'http://127.0.0.1:4432').origin;
if (appOrigin === apiOrigin) throw new Error('ASSESS_V2_NATIVE_ORIGINS_NOT_DISTINCT');

const enterProcess = async (
  page: Page,
  actor: AuthenticatedLifecycleSetup['actors']['author'],
  processName: string,
) => {
  await enterAs(page, actor);
  if (!(await page.getByRole('heading', { name: 'Process Catalog', exact: true }).isVisible().catch(() => false))) {
    await clickProduct(page, 'Assess');
  }
  await openConnectedProcess(page, processName);
};

test.describe.configure({ mode: 'serial' });
test.describe('Assess V2 native PostgREST reload contract', () => {
  let setup: AuthenticatedLifecycleSetup;
  let projectName = '';
  let observedHttpRequests = 0;
  let nonLoopbackRequests = 0;
  let trackerStarts = 0;
  let trackerFinishes = 0;
  let trackerError: unknown = null;
  let networkActionTail: Promise<void> = Promise.resolve();
  let activeActions = new Set<string>();

  test.beforeAll(async ({}, testInfo) => {
    projectName = `native-${testInfo.project.name}`;
    setup = await control<AuthenticatedLifecycleSetup>('/control/setup', { projectName });
  });

  test.beforeEach(async ({ context }) => {
    observedHttpRequests = 0;
    nonLoopbackRequests = 0;
    trackerStarts = 0;
    trackerFinishes = 0;
    trackerError = null;
    networkActionTail = Promise.resolve();
    activeActions = new Set();
    const registeredTokens = new Set(Object.values(setup.actors).map(actor => actor.token));
    const tracker = new AuthenticatedHostedBrowserActionTracker({
      backendOrigin: apiOrigin,
      appOrigin,
      startAction: ({ accessToken, route }: { accessToken: string; route: string }) => {
        if (!registeredTokens.has(accessToken)
          || (!route.startsWith('/functions/v1/') && !route.startsWith('/rest/v1/rpc/'))) {
          throw new Error('ASSESS_V2_NATIVE_TRACKER_ACTION_REJECTED');
        }
        const actionId = `local-native-action-${++trackerStarts}`;
        activeActions.add(actionId);
        return { actionId };
      },
      finishAction: ({ actionId, status }: { actionId: string; status: number }) => {
        if (!activeActions.delete(actionId) || !Number.isInteger(status)
          || (status !== 0 && (status < 100 || status > 599))) {
          throw new Error('ASSESS_V2_NATIVE_TRACKER_FINISH_REJECTED');
        }
        trackerFinishes += 1;
      },
    });
    await installAuthenticatedHostedNetwork({
      context,
      hosted: true,
      allowedOrigins: new Set([appOrigin, apiOrigin]),
      tracker,
      queueNetworkAction: operation => {
        const queued = networkActionTail.then(async () => { await operation(); });
        networkActionTail = queued.catch(error => { if (!trackerError) trackerError = error; });
      },
      onExternalRequest: () => { nonLoopbackRequests += 1; },
      onHttpRequest: () => { observedHttpRequests += 1; },
      onTrackerError: error => { if (!trackerError) trackerError = error; },
    });
  });

  test.afterEach(async () => {
    await expect.poll(async () => {
      await networkActionTail;
      return activeActions.size;
    }, { timeout: 15_000 }).toBe(0);
    for (;;) {
      const current = networkActionTail;
      await current;
      if (current === networkActionTail) break;
    }
    expect(trackerError).toBeNull();
    expect(activeActions.size).toBe(0);
    expect(trackerStarts).toBeGreaterThan(0);
    expect(trackerFinishes).toBe(trackerStarts);
    expect(nonLoopbackRequests).toBe(0);
    expect(observedHttpRequests).toBeGreaterThan(0);
  });

  test('create, save, finalize and requested revision survive hard reloads', async ({ page }) => {
    await enterProcess(page, setup.actors.author, setup.aliases.process);
    const checkpoints = createV2ReloadBrowserCheckpointBuilder(page, { projectName, persona: 'author' });
    const beforeCreate = await checkpoints.checkpoint('before-create');
    expect(beforeCreate.browser.serverContextObserved).toBe(true);
    expect(beforeCreate.browser.selectedScopeObserved).toBe(true);
    expect(beforeCreate.browser.selectedProcessObserved).toBe(true);
    const createResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/functions/v1/assess-v2-command'
        && response.request().postDataJSON()?.commandType === 'assessment_v2.create');
    await page.getByRole('button', { name: 'New assessment (V2)', exact: true }).click();
    expect((await createResponse).status()).toBe(200);
    await expect(page.getByText('V2 case created. Add the minimum assessment structure before finalization.', { exact: true })).toBeVisible();

    expect((await checkpoints.checkpoint('before-reload')).browser.serverContextObserved).toBe(true);
    const reloadObserver = installV2ReloadReadObserver(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const reloadOutcome = await observeV2ReloadRenderOutcome(page);
    const completion = await reloadObserver.complete();
    expect(completion.observerFailure).toBe(false);
    expect(reloadOutcome).toBe('resumed');
    expect(completion.observation.readStages).toHaveLength(11);
    expect(completion.observation.readStages.every(stage => stage.status === 'passed')).toBe(true);
    const afterReload = await checkpoints.checkpoint('after-reload', {
      readObservation: completion.observation, renderOutcome: reloadOutcome,
    });
    expect(afterReload.browser.serverContextObserved).toBe(true);
    expect(afterReload.browser.selectedScopeObserved).toBe(true);
    expect(afterReload.browser.selectedProcessObserved).toBe(true);
    await expect(page.getByText('Existing V2 draft resumed from the current immutable authoring version.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New assessment (V2)', exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Add minimum working structure', exact: true }).click();
    await page.getByLabel('Primitive 1 name', { exact: true }).fill('Native persisted capture');
    await completeFacts(page, 'strong-automation');
    const saveResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/functions/v1/assess-v2-command'
        && response.request().postDataJSON()?.commandType === 'assessment_v2.draft.upsert');
    await page.getByRole('button', { name: 'Save V2 draft', exact: true }).click();
    expect((await saveResponse).status()).toBe(200);
    await expect(page.getByText('Draft saved as a new immutable authoring version.', { exact: true })).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Existing V2 draft resumed from the current immutable authoring version.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Primitive 1 name', { exact: true })).toHaveValue('Native persisted capture');

    const finalizeResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/functions/v1/assess-v2-command'
        && response.request().postDataJSON()?.commandType === 'assessment_v2.finalize');
    await finalizeDecision(page);
    expect((await finalizeResponse).status()).toBe(200);
    await expect(page.getByText('Reviewer-ready Decision Pack finalized. It is read-only.', { exact: true })).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Existing reviewer-ready Decision Pack reopened in read-only mode.', { exact: true })).toBeVisible();
    await expect(page.getByTestId('assess-v2-decision-pack')).toBeVisible();

    await enterProcess(page, setup.actors.reviewer, setup.aliases.process);
    await expect(page.getByTestId('assess-v2-review-workspace')).toContainText('Reviewer-ready');
    await selectReviewer(page, setup.actors.reviewer);
    await page.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click();
    await expect(page.getByText(/Reviewer assignment committed\./u)).toBeVisible();
    await attestEvidence(page, 'Native PostgREST independent evidence review.');
    const reviewWorkspace = page.getByTestId('assess-v2-review-workspace');
    await reviewWorkspace.getByLabel('Review rationale', { exact: true }).fill('Clarify ownership before approval.');
    await reviewWorkspace.getByRole('button', { name: 'Request changes', exact: true }).click();
    await expect(page.getByText('Review resolution committed: Changes requested.', { exact: true })).toBeVisible();

    await enterProcess(page, setup.actors.author, setup.aliases.process);
    await page.getByLabel('Review rationale', { exact: true }).fill('Begin requested revision.');
    await page.getByRole('button', { name: 'Start new draft revision', exact: true }).click();
    await expect(page.getByText('New immutable draft revision committed.', { exact: true })).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Existing V2 draft resumed from the current immutable authoring version.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Primitive 1 name', { exact: true })).toHaveValue('Native persisted capture');
  });

  test('denied child read never shows a resumed case or allows duplicate creation', async ({ page }) => {
    await enterProcess(page, setup.actors.author, setup.aliases.process);
    await expect(page.getByText('Existing V2 draft resumed from the current immutable authoring version.', { exact: true })).toBeVisible();
    const before = await control<{
      caseCount: number; decisionCount: number; receipts: number; audits: number; targetHash: string;
    }>('/control/assess-v2-frame', { projectName });
    expect(before.caseCount).toBe(1);

    await test.step('failure:denied-child-read:no-false-resume', async () => {
      await control('/control/native-postgrest-fault', {
        projectName, resource: 'assess_v2_primitives', status: 403,
      });
      const reloadObserver = installV2ReloadReadObserver(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      expect(await observeV2ReloadRenderOutcome(page)).toBe('workspace_error');
      const completion = await reloadObserver.complete();
      expect(completion.observerFailure).toBe(false);
      expect(completion.observation.readStages.find(stage => stage.stage === 'primitives')).toMatchObject({
        status: 'failed', httpStatus: 403, rowCount: null,
      });
      await expect(page.getByTestId('enterprise-session-boundary')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Workspace unavailable', exact: true })).toBeVisible();
      await expect(page.getByText('The command could not be completed. No success was recorded.', { exact: true })).toBeVisible();
      await expect(page.getByText('Existing V2 draft resumed from the current immutable authoring version.', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'New assessment (V2)', exact: true })).toHaveCount(0);
      expect(await control('/control/assess-v2-frame', { projectName })).toEqual(before);
    });
  });

  test('missing session reload never shows a resumed case or allows duplicate creation', async ({ page }) => {
    await enterProcess(page, setup.actors.author, setup.aliases.process);
    await expect(page.getByText('Existing V2 draft resumed from the current immutable authoring version.', { exact: true })).toBeVisible();
    const before = await control<{
      caseCount: number; decisionCount: number; receipts: number; audits: number; targetHash: string;
    }>('/control/assess-v2-frame', { projectName });
    expect(before.caseCount).toBe(1);

    await test.step('failure:missing-session:no-false-resume', async () => {
      await page.evaluate(() => {
        for (const key of Object.keys(localStorage)) if (key.startsWith('sb-')) localStorage.removeItem(key);
        sessionStorage.clear();
      });
      const reloadObserver = installV2ReloadReadObserver(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      expect(await observeV2ReloadRenderOutcome(page)).toBe('public_screen');
      const completion = await reloadObserver.complete();
      expect(completion.observerFailure).toBe(false);
      expect(completion.observation.readStages.every(stage => stage.status === 'not_reached')).toBe(true);
      await expect(page.getByRole('heading', { name: /Evaluate before you automate/u })).toBeVisible();
      await expect(page.getByText('Existing V2 draft resumed from the current immutable authoring version.', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'New assessment (V2)', exact: true })).toHaveCount(0);
      expect(await control('/control/assess-v2-frame', { projectName })).toEqual(before);
    });
  });
});
