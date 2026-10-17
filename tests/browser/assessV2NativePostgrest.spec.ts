import { expect, test, type Page } from '@playwright/test';
import {
  authenticatedLifecycleAttestEverySubmittedEvidence as attestEvidence,
  authenticatedLifecycleClickProduct as clickProduct,
  authenticatedLifecycleCompleteRequiredAssessmentFacts as completeFacts,
  authenticatedLifecycleControl as control,
  authenticatedLifecycleEnterAs as enterAs,
  authenticatedLifecycleFinalizeDecisionPack as finalizeDecision,
  authenticatedLifecycleOpenConnectedProcess as openConnectedProcess,
  authenticatedLifecycleReadProcessNavigation as readProcessNavigation,
  authenticatedLifecycleSelectReviewer as selectReviewer,
  authenticatedLifecycleAttemptUnauthorizedProcessUpdate as attemptUnauthorizedProcessUpdate,
  authenticatedLifecycleValidateProcessNavigation as validateProcessNavigation,
  type AuthenticatedLifecycleSetup,
} from './authenticatedLifecycleHarness';
import {
  authenticatedHostedConfigureChromiumDurableResponseBodies,
  authenticatedLifecycleSettleActorNavigationBoundary as settleActorNavigationBoundary,
  installAuthenticatedHostedNetwork,
} from './authenticatedHostedNetwork';
import { AuthenticatedHostedBrowserActionTracker } from '../../scripts/authenticatedHostedBrowserRequestClassifier.mjs';
import {
  createV2ReloadBrowserCheckpointBuilder,
  installV2ReloadReadObserver,
  observeV2ReloadRenderOutcome,
} from './v2ReloadDiagnosticObserver';

const appOrigin = new URL(process.env.ENTERPRISE_LIFECYCLE_APP_BASE_URL ?? 'http://127.0.0.1:4431').origin;
const apiOrigin = new URL(process.env.ENTERPRISE_LIFECYCLE_API_BASE_URL ?? 'http://127.0.0.1:4432').origin;
const authStorageKey = process.env.ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY ?? 'sb-127-auth-token';
if (appOrigin === apiOrigin) throw new Error('ASSESS_V2_NATIVE_ORIGINS_NOT_DISTINCT');

type NativeStreamStats = Readonly<{
  active: number;
  requests: number;
  responses: number;
  completed: number;
  cancelled: number;
  failed: number;
  stream: null | Readonly<{
    resource: 'assess_v2_cases' | 'assess_processes';
    mode: 'hold-headers' | 'hold-body';
    entered: boolean;
    held: boolean;
  }>;
}>;

type DirectReadState = Readonly<{
  headers: boolean;
  completed: boolean;
  failed: boolean;
  status: number | null;
}>;

type ProcessFrame = Readonly<{
  receipts: number;
  audits: number;
  targetHash: string;
}>;

const startDirectRead = async (page: Page, key: string, processId: string) => page.evaluate((input) => {
  const stored = JSON.parse(localStorage.getItem(input.authStorageKey) ?? '{}');
  const accessToken = stored.access_token ?? stored.currentSession?.access_token;
  if (typeof accessToken !== 'string' || !accessToken) throw new Error('ASSESS_V2_NATIVE_DIRECT_READ_SESSION_MISSING');
  const controller = new AbortController();
  const state = { headers: false, completed: false, failed: false, status: null as number | null };
  Reflect.set(globalThis, input.key, { controller, state });
  const url = new URL('/rest/v1/assess_v2_cases', input.apiOrigin);
  url.searchParams.set('select', 'id');
  url.searchParams.set('process_id', `eq.${input.processId}`);
  void fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, apikey: 'local-native-browser-fixture' },
    signal: controller.signal,
  }).then(async response => {
    state.headers = true;
    state.status = response.status;
    await response.json();
    state.completed = true;
  }).catch(() => { state.failed = true; });
}, { apiOrigin, authStorageKey, key, processId });

const directReadState = (page: Page, key: string) => page.evaluate((inputKey) => {
  const value = Reflect.get(globalThis, inputKey) as { state?: DirectReadState } | undefined;
  return value?.state ?? { headers: false, completed: false, failed: false, status: null };
}, key);

const abortDirectRead = (page: Page, key: string) => page.evaluate((inputKey) => {
  const value = Reflect.get(globalThis, inputKey) as { controller?: AbortController } | undefined;
  value?.controller?.abort();
}, key);

const enterProcess = async (
  page: Page,
  actor: AuthenticatedLifecycleSetup['actors']['author'],
  processName: string,
  beforeActorNavigation: () => Promise<void>,
) => {
  await enterAs(page, actor, beforeActorNavigation);
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
  let networkLifecycle: Awaited<ReturnType<typeof installAuthenticatedHostedNetwork>> | null = null;
  const settleActorTransitionEvidence = async () => {
    if (!networkLifecycle) throw new Error('ASSESS_V2_NATIVE_NETWORK_LIFECYCLE_MISSING');
    await settleActorNavigationBoundary({
      settleResponseBodies: networkLifecycle.settleResponseBodies,
      drainNetworkActions: async () => {
        for (;;) {
          const current = networkActionTail;
          await current;
          if (current === networkActionTail) break;
        }
        if (trackerError) throw trackerError;
      },
      activeActionCount: () => activeActions.size,
    });
  };

  test.beforeAll(async ({}, testInfo) => {
    projectName = `native-${testInfo.project.name}`;
    setup = await control<AuthenticatedLifecycleSetup>('/control/setup', { projectName });
  });

  test.beforeEach(async ({ context, page }) => {
    observedHttpRequests = 0;
    nonLoopbackRequests = 0;
    trackerStarts = 0;
    trackerFinishes = 0;
    trackerError = null;
    networkActionTail = Promise.resolve();
    activeActions = new Set();
    networkLifecycle = null;
    await authenticatedHostedConfigureChromiumDurableResponseBodies(context, page);
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
    networkLifecycle = await installAuthenticatedHostedNetwork({
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
    if (!networkLifecycle) throw new Error('ASSESS_V2_NATIVE_NETWORK_LIFECYCLE_MISSING');
    const deadline = Date.now() + 15_000;
    let boundaryError: unknown = trackerError;
    for (;;) {
      try { await networkLifecycle.settleResponseBodies(); }
      catch (error) { boundaryError ??= error; }
      for (;;) {
        const current = networkActionTail;
        await current;
        if (current === networkActionTail) break;
      }
      try { await networkLifecycle.settleResponseBodies(); }
      catch (error) { boundaryError ??= error; }
      boundaryError ??= trackerError;
      if (activeActions.size === 0 || Date.now() >= deadline) break;
      // Preserve the original bounded readiness window for requests which
      // started before response headers and therefore are not yet represented
      // in the response-body set or serialized finish tail.
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    // Surface the causal fixed-code network/body failure before the secondary
    // action-balance symptom while still completing the bounded cleanup above.
    if (boundaryError) throw boundaryError;
    expect(activeActions.size).toBe(0);
    expect(trackerStarts).toBeGreaterThan(0);
    expect(trackerFinishes).toBe(trackerStarts);
    expect(nonLoopbackRequests).toBe(0);
    expect(observedHttpRequests).toBeGreaterThan(0);
  });

  test('create, save, finalize and requested revision survive hard reloads', async ({ page }) => {
    await enterProcess(page, setup.actors.author, setup.aliases.process, settleActorTransitionEvidence);
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

    await enterProcess(page, setup.actors.reviewer, setup.aliases.process, settleActorTransitionEvidence);
    await expect(page.getByTestId('assess-v2-review-workspace')).toContainText('Reviewer-ready');
    await selectReviewer(page, setup.actors.reviewer);
    await page.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click();
    await expect(page.getByText(/Reviewer assignment committed\./u)).toBeVisible();
    await attestEvidence(page, 'Native PostgREST independent evidence review.');
    const reviewWorkspace = page.getByTestId('assess-v2-review-workspace');
    await reviewWorkspace.getByLabel('Review rationale', { exact: true }).fill('Clarify ownership before approval.');
    await reviewWorkspace.getByRole('button', { name: 'Request changes', exact: true }).click();
    await expect(page.getByText('Review resolution committed: Changes requested.', { exact: true })).toBeVisible();

    await enterProcess(page, setup.actors.author, setup.aliases.process, settleActorTransitionEvidence);
    await page.getByLabel('Review rationale', { exact: true }).fill('Begin requested revision.');
    await page.getByRole('button', { name: 'Start new draft revision', exact: true }).click();
    await expect(page.getByText('New immutable draft revision committed.', { exact: true })).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Existing V2 draft resumed from the current immutable authoring version.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Primitive 1 name', { exact: true })).toHaveValue('Native persisted capture');
  });

  test('read observer retains pending headers, held bodies, cancellation and mixed duplicate lifecycle', async ({ page }) => {
    await enterProcess(page, setup.actors.author, setup.aliases.process, settleActorTransitionEvidence);
    await expect(page.getByText('Existing V2 draft resumed from the current immutable authoring version.', { exact: true })).toBeVisible();
    const processId = new URL(page.url()).searchParams.get('processId');
    expect(processId).toMatch(/^[0-9a-f-]{36}$/u);
    const stats = () => control<NativeStreamStats>('/control/native-postgrest-stats', { projectName });
    const arm = (mode: 'hold-headers' | 'hold-body') => control('/control/native-postgrest-stream', {
      projectName, resource: 'assess_v2_cases', mode,
    });
    const release = () => control('/control/native-postgrest-stream-release', { projectName });
    await expect.poll(async () => (await stats()).active).toBe(0);

    await test.step('pending headers remain distinct and the snapshot is immutable after release', async () => {
      const baseline = await stats();
      let armed = false;
      let observer: ReturnType<typeof installV2ReloadReadObserver> | null = null;
      let observerCompleted = false;
      try {
        await arm('hold-headers');
        armed = true;
        observer = installV2ReloadReadObserver(page);
        await startDirectRead(page, '__v2PendingHeaders', processId!);
        await expect.poll(async () => (await stats()).active).toBe(baseline.active + 1);
        const completion = await observer.complete();
        observerCompleted = true;
        expect(completion.observerFailure).toBe(false);
        const row = completion.observation.readStages.find(item => item.stage === 'case-discovery');
        expect(row).toMatchObject({
          status: 'failed', httpStatus: null, rowCount: null,
          lifecycle: { requested: 1, responseStarted: 0, completed: 0, transportFailed: 0, pending: 1,
            bodyCompleted: 0, bodyFailed: 0, bodyPending: 0 },
        });
        const retained = structuredClone(completion);
        await release();
        armed = false;
        await expect.poll(() => directReadState(page, '__v2PendingHeaders')).toMatchObject({
          headers: true, completed: true, failed: false, status: 200,
        });
        expect(completion).toEqual(retained);
      } finally {
        if (observer && !observerCompleted) await observer.complete().catch(() => undefined);
        if (armed) await release().catch(() => undefined);
      }
    });

    await test.step('held body retains response status and body-pending state', async () => {
      const baseline = await stats();
      let armed = false;
      let observer: ReturnType<typeof installV2ReloadReadObserver> | null = null;
      let observerCompleted = false;
      try {
        await arm('hold-body');
        armed = true;
        observer = installV2ReloadReadObserver(page);
        await startDirectRead(page, '__v2HeldBody', processId!);
        await expect.poll(() => directReadState(page, '__v2HeldBody')).toMatchObject({
          headers: true, completed: false, failed: false, status: 200,
        });
        expect((await stats()).completed).toBe(baseline.completed);
        const completion = await observer.complete();
        observerCompleted = true;
        expect(completion.observerFailure).toBe(false);
        const row = completion.observation.readStages.find(item => item.stage === 'case-discovery');
        expect(row).toMatchObject({
          status: 'failed', httpStatus: 200, rowCount: null,
          lifecycle: { requested: 1, responseStarted: 1, completed: 0, transportFailed: 0, pending: 1,
            bodyCompleted: 0, bodyFailed: 0, bodyPending: 1 },
        });
        const retained = structuredClone(completion);
        await release();
        armed = false;
        await expect.poll(() => directReadState(page, '__v2HeldBody')).toMatchObject({ completed: true, failed: false });
        expect(completion).toEqual(retained);
      } finally {
        if (observer && !observerCompleted) await observer.complete().catch(() => undefined);
        if (armed) await release().catch(() => undefined);
      }
    });

    await test.step('client cancellation cancels the upstream stream and retains an allowlisted class', async () => {
      const baseline = await stats();
      let armed = false;
      let observer: ReturnType<typeof installV2ReloadReadObserver> | null = null;
      let observerCompleted = false;
      try {
        await arm('hold-body');
        armed = true;
        observer = installV2ReloadReadObserver(page);
        await startDirectRead(page, '__v2CancelledBody', processId!);
        await expect.poll(() => directReadState(page, '__v2CancelledBody')).toMatchObject({ headers: true });
        await abortDirectRead(page, '__v2CancelledBody');
        await expect.poll(() => directReadState(page, '__v2CancelledBody')).toMatchObject({ failed: true });
        await expect.poll(async () => (await stats()).cancelled).toBe(baseline.cancelled + 1);
        const completion = await observer.complete();
        observerCompleted = true;
        expect(completion.observerFailure).toBe(false);
        const row = completion.observation.readStages.find(item => item.stage === 'case-discovery');
        expect(row).toMatchObject({
          status: 'failed', httpStatus: 200, rowCount: null,
          lifecycle: { requested: 1, responseStarted: 1, completed: 0, transportFailed: 1, pending: 0,
            bodyCompleted: 0, bodyFailed: 1, bodyPending: 0,
            transportFailures: { aborted: 1, timeout: 0, connection: 0, protocol: 0, blocked: 0, other: 0 } },
        });
        await release();
        armed = false;
      } finally {
        if (observer && !observerCompleted) await observer.complete().catch(() => undefined);
        if (armed) await release().catch(() => undefined);
      }
    });

    await test.step('one pending duplicate cannot be hidden by one completed duplicate', async () => {
      let armed = false;
      let observer: ReturnType<typeof installV2ReloadReadObserver> | null = null;
      let observerCompleted = false;
      try {
        await arm('hold-body');
        armed = true;
        observer = installV2ReloadReadObserver(page);
        await startDirectRead(page, '__v2MixedHeld', processId!);
        await expect.poll(() => directReadState(page, '__v2MixedHeld')).toMatchObject({ headers: true, completed: false });
        await startDirectRead(page, '__v2MixedComplete', processId!);
        await expect.poll(() => directReadState(page, '__v2MixedComplete')).toMatchObject({
          completed: true, failed: false, status: 200,
        });
        const completion = await observer.complete();
        observerCompleted = true;
        expect(completion.observerFailure).toBe(false);
        const row = completion.observation.readStages.find(item => item.stage === 'case-discovery');
        expect(row).toMatchObject({
          status: 'failed', httpStatus: 200, rowCount: null,
          lifecycle: { requested: 2, responseStarted: 2, completed: 1, transportFailed: 0, pending: 1,
            bodyCompleted: 1, bodyFailed: 0, bodyPending: 1 },
        });
        const retained = structuredClone(completion);
        await release();
        armed = false;
        await expect.poll(() => directReadState(page, '__v2MixedHeld')).toMatchObject({ completed: true, failed: false });
        expect(completion).toEqual(retained);
      } finally {
        if (observer && !observerCompleted) await observer.complete().catch(() => undefined);
        if (armed) await release().catch(() => undefined);
      }
    });
  });

  test('denied child read never shows a resumed case or allows duplicate creation', async ({ page }) => {
    await enterProcess(page, setup.actors.author, setup.aliases.process, settleActorTransitionEvidence);
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
    await enterProcess(page, setup.actors.author, setup.aliases.process, settleActorTransitionEvidence);
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

  test('restricted reviewer process denial survives its authority reload and the outer unchanged-state reload', async ({ page }) => {
    await control('/control/restricted-delete', { projectName, enabled: true });
    let held = false;
    const processCommands: string[] = [];
    const observeProcessCommand = (request: import('@playwright/test').Request) => {
      const url = new URL(request.url());
      if (url.origin === apiOrigin && url.pathname === '/functions/v1/process-command'
        && request.method() === 'POST') processCommands.push(request.url());
    };
    try {
      await enterProcess(page, setup.actors.reviewer, setup.aliases.process, settleActorTransitionEvidence);
      const before = await control<ProcessFrame>('/control/process-frame', { projectName });
      expect(before.receipts).toBe(0);
      expect(before.audits).toBe(0);

      const denied = await attemptUnauthorizedProcessUpdate(page, setup.aliases.process);
      expect(denied.status).toBe(403);
      expect(denied.body).toEqual({ ok: false, error: {
        code: 'PERMISSION_DENIED', message: 'Process update could not be completed.',
      } });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: setup.aliases.process, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Edit process details', exact: true })).toBeDisabled();
      await expect(page.getByTestId('process-edit-form')).toHaveCount(0);
      expect(await control<ProcessFrame>('/control/process-frame', { projectName })).toEqual(before);

      const currentNavigation = validateProcessNavigation(await readProcessNavigation(page));
      await control('/control/native-postgrest-stream', {
        projectName, resource: 'assess_processes', mode: 'hold-body', skip: 1,
      });
      held = true;
      page.on('request', observeProcessCommand);
      let pendingFailure: unknown;
      const pendingDenial = attemptUnauthorizedProcessUpdate(page, setup.aliases.process).catch(error => {
        pendingFailure = error;
        return null;
      });
      let heldDenied: Awaited<ReturnType<typeof attemptUnauthorizedProcessUpdate>> | null = null;
      try {
        await expect.poll(async () => (await control<NativeStreamStats>(
          '/control/native-postgrest-stats', { projectName },
        )).stream).toEqual({
          resource: 'assess_processes', mode: 'hold-body', entered: true, held: true,
        });
        validateProcessNavigation(
          await readProcessNavigation(page), currentNavigation.processId, currentNavigation.scope,
        );
        await expect(page.getByRole('heading', { name: setup.aliases.process, exact: true })).toHaveCount(0);
        await expect(page.getByText('Loading process...', { exact: true })).toBeVisible();
        expect(processCommands).toHaveLength(0);
        await control('/control/native-postgrest-stream-release', { projectName });
        held = false;
        heldDenied = await pendingDenial;
      } finally {
        if (held) {
          await control('/control/native-postgrest-stream-release', { projectName }).catch(() => undefined);
          held = false;
          await pendingDenial;
        }
      }
      if (pendingFailure) throw pendingFailure;
      if (!heldDenied) throw new Error('ASSESS_V2_NATIVE_HELD_PROCESS_DENIAL_MISSING');
      expect(heldDenied.status).toBe(403);
      expect(heldDenied.body).toEqual({ ok: false, error: {
        code: 'PERMISSION_DENIED', message: 'Process update could not be completed.',
      } });
      expect(processCommands).toHaveLength(1);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: setup.aliases.process, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Edit process details', exact: true })).toBeDisabled();
      await expect(page.getByTestId('process-edit-form')).toHaveCount(0);
      expect(await control<ProcessFrame>('/control/process-frame', { projectName })).toEqual(before);
    } finally {
      page.off('request', observeProcessCommand);
      if (held) await control('/control/native-postgrest-stream-release', { projectName }).catch(() => undefined);
      await control('/control/restricted-delete', { projectName, enabled: false }).catch(() => undefined);
    }
  });

  test('completed empty and denied process detail reads leave the loading state without command effects', async ({ page }) => {
    await control('/control/restricted-delete', { projectName, enabled: true });
    let processCommands = 0;
    const observeProcessCommand = (request: import('@playwright/test').Request) => {
      const url = new URL(request.url());
      if (url.origin === apiOrigin && url.pathname === '/functions/v1/process-command'
        && request.method() === 'POST') processCommands += 1;
    };
    page.on('request', observeProcessCommand);
    try {
      await enterProcess(page, setup.actors.reviewer, setup.aliases.process, settleActorTransitionEvidence);
      const before = await control<ProcessFrame>('/control/process-frame', { projectName });

      await control('/control/native-postgrest-fault', {
        projectName, resource: 'assess_processes', outcome: 'empty', status: 200, skip: 1,
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Loading process...', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Process not found or you do not have permission.', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Edit process details', exact: true })).toHaveCount(0);
      await expect(page.getByTestId('process-edit-form')).toHaveCount(0);
      expect(processCommands).toBe(0);
      expect(await control<ProcessFrame>('/control/process-frame', { projectName })).toEqual(before);

      await control('/control/native-postgrest-fault', {
        projectName, resource: 'assess_processes', outcome: 'denied', status: 403, skip: 1,
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Loading process...', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('alert').filter({
        hasText: 'Process details could not be loaded. Go back and try again.',
      })).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Edit process details', exact: true })).toHaveCount(0);
      await expect(page.getByTestId('process-edit-form')).toHaveCount(0);
      expect(processCommands).toBe(0);
      expect(await control<ProcessFrame>('/control/process-frame', { projectName })).toEqual(before);
    } finally {
      page.off('request', observeProcessCommand);
      await control('/control/restricted-delete', { projectName, enabled: false }).catch(() => undefined);
    }
  });
});
