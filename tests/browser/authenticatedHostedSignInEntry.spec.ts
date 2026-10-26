import { expect, test, type Request, type Route } from '@playwright/test';
import { appendFile } from 'node:fs/promises';
import { AuthenticatedHostedBrowserActionTracker } from '../../scripts/authenticatedHostedBrowserRequestClassifier.mjs';
import {
  authenticatedLifecycleControl,
  authenticatedLifecycleAttemptUnauthorizedProcessUpdate,
  authenticatedLifecycleEnterAs,
  authenticatedLifecycleOpenConnectedProcess,
  authenticatedLifecycleValidateSetupLabels,
  createAuthenticatedLifecycleControl,
  type AuthenticatedLifecycleActor,
} from './authenticatedLifecycleHarness';
import {
  authenticatedHostedClosePageAfterOwnedNetwork,
  authenticatedHostedConfigureChromiumDurableResponseBodies,
  authenticatedLifecycleSettleActorNavigationBoundary,
  installAuthenticatedHostedNetwork,
} from './authenticatedHostedNetwork';
import {
  runV1AssessmentCompletion,
  V1_ASSESSMENT_COMPLETION_TIMEOUT,
} from './enterpriseLifecycleAcceptance/v1AssessmentCompletion';

const appOrigin = new URL(process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_APP_URL ?? '').origin;
const apiOrigin = new URL(process.env.ENTERPRISE_LIFECYCLE_API_BASE_URL ?? '').origin;
const localAppOrigin = new URL(process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_LOCAL_APP_URL ?? '').origin;
const localApiOrigin = new URL(process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_LOCAL_BACKEND_URL ?? '').origin;
const processSeedMode = process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROCESS_SEED_MODE ?? '';
const processReadStateOnly = process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROCESS_READ_STATE_ONLY === 'true';
const scopedNavigationOnly = process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_SCOPED_NAVIGATION_ONLY === 'true';
const contractPhase = process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_CONTRACT_PHASE ?? '';
if (!['session-persistence', 'entry', 'assessment-negatives', 'assessment-positives', 'safety', 'specialized']
  .includes(contractPhase)) {
  throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_CONTRACT_PHASE_REJECTED');
}
if ((processSeedMode === 'nullable-reproduction' || processReadStateOnly || scopedNavigationOnly)
  !== (contractPhase === 'specialized')) {
  throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_CONTRACT_PHASE_MODE_REJECTED');
}
const scopedNavigationEvidencePath = process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_SCOPED_NAVIGATION_EVIDENCE_PATH ?? '';
const tokenGateUrl = process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_TOKEN_GATE_URL ?? '';
const tokenGateToken = process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_TOKEN_GATE_TOKEN ?? '';
const syntheticProjectRef = 'abcdefghijklmnopqrst';
if (appOrigin !== 'https://deploy-preview-264--avalaos-pilot.netlify.app'
  || apiOrigin !== `https://${syntheticProjectRef}.supabase.co`
  || !/^http:\/\/127[.]0[.]0[.]1:\d+$/u.test(localAppOrigin)
  || !/^http:\/\/127[.]0[.]0[.]1:\d+$/u.test(localApiOrigin)
  || !['valid', 'nullable-reproduction'].includes(processSeedMode)) {
  throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROXY_BINDING_REJECTED');
}
if (contractPhase === 'session-persistence') {
  const parsedTokenGate = new URL(tokenGateUrl);
  if (parsedTokenGate.protocol !== 'http:' || parsedTokenGate.hostname !== '127.0.0.1'
    || !/^\d+$/u.test(parsedTokenGate.port) || parsedTokenGate.pathname !== '/'
    || parsedTokenGate.search || parsedTokenGate.hash || !/^[a-f0-9]{64}$/u.test(tokenGateToken)) {
    throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_TOKEN_GATE_REJECTED');
  }
} else if (tokenGateUrl || tokenGateToken) {
  throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_TOKEN_GATE_UNEXPECTED');
}

const actor = (
  projectName: string,
  actorName: 'A' | 'B' | 'rejected',
): AuthenticatedLifecycleActor => {
  const definition = actorName === 'A'
    ? { id: projectName === 'desktop-chromium'
      ? '10000000-0000-4000-8000-000000000001' : '10000000-0000-4000-8000-000000000003',
      email: `author.${projectName}@local.invalid`, persona: 'author' as const, password: 'synthetic-author-password' }
    : actorName === 'B'
      ? { id: projectName === 'desktop-chromium'
        ? '10000000-0000-4000-8000-000000000002' : '10000000-0000-4000-8000-000000000004',
        email: `reviewer.${projectName}@local.invalid`, persona: 'reviewer' as const, password: 'synthetic-reviewer-password' }
      : { id: '10000000-0000-4000-8000-000000000009',
        email: `rejected.${projectName}@local.invalid`, persona: 'outsider' as const, password: 'synthetic-rejected-password' };
  return {
    token: 'unused-real-auth-input',
    authKind: 'supabase_auth',
    projectName,
    persona: definition.persona,
    password: definition.password,
    user: { id: definition.id, email: definition.email },
  };
};

test.beforeEach(async ({ context, page }) => {
  await authenticatedHostedConfigureChromiumDurableResponseBodies(context, page);
  await context.route('**/*', route => route.abort('blockedbyclient'));
});

const dispatchToLocalProxy = async (route: Route) => {
  const request = route.request();
  const requested = new URL(request.url());
  const targetOrigin = requested.origin === appOrigin ? localAppOrigin
    : requested.origin === apiOrigin ? localApiOrigin : null;
  if (!targetOrigin) throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROXY_ORIGIN_REJECTED');
  await route.continue();
};

test('anonymous business actions retain their rejected admission inside an isolated network lifecycle', async ({ context, page }, testInfo) => {
  const projectName = testInfo.project.name;
  await authenticatedLifecycleControl('/control/setup', { projectName });
  let networkActionError: unknown = null;
  let networkActionTail: Promise<unknown> = Promise.resolve();
  const queueNetworkAction = (operation: () => Promise<unknown>) => {
    networkActionTail = networkActionTail.then(operation).catch(error => {
      if (!networkActionError) networkActionError = error;
    });
  };
  const tracker = new AuthenticatedHostedBrowserActionTracker({
    backendOrigin: apiOrigin,
    appOrigin,
    startAction: input => authenticatedLifecycleControl<{ actionId: string }>('/control/browser-action-start', {
      projectName, ...input,
    }),
    finishAction: input => authenticatedLifecycleControl('/control/browser-action', { projectName, ...input }),
  });
  const proxiedOrigins: string[] = [];
  const networkLifecycle = await installAuthenticatedHostedNetwork({
    context,
    hosted: true,
    allowedOrigins: new Set([appOrigin, apiOrigin]),
    tracker,
    queueNetworkAction,
    onExternalRequest: () => undefined,
    onHttpRequest: () => undefined,
    onTrackerError: error => { if (!networkActionError) networkActionError = error; },
    dispatchAllowedRequest: async route => {
      proxiedOrigins.push(new URL(route.request().url()).origin);
      await dispatchToLocalProxy(route);
    },
  });
  const anonymousFailure = context.waitForEvent('requestfailed', {
    predicate: request => request.url() === `${apiOrigin}/functions/v1/process-command`,
  });
  const anonymousOutcome = await page.evaluate(async backendOrigin => {
    try {
      await fetch(`${backendOrigin}/functions/v1/process-command`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ commandType: 'process.update' }),
      });
      return 'reached-backend';
    } catch { return 'blocked-before-backend'; }
  }, apiOrigin);
  expect(anonymousOutcome).toBe('blocked-before-backend');
  await anonymousFailure;
  await expect(networkLifecycle.settleActionAdmissions())
    .rejects.toThrow('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_SESSION_REJECTED');
  await expect(networkLifecycle.settleActionAdmissions())
    .rejects.toThrow('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_SESSION_REJECTED');
  await networkLifecycle.settleResponseBodies();
  for (;;) {
    const current = networkActionTail;
    await current;
    if (current === networkActionTail) break;
  }
  expect(networkActionError).toBeInstanceOf(Error);
  expect((networkActionError as Error).message).toBe('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_SESSION_REJECTED');
  expect(proxiedOrigins).toEqual([]);
  const anonymousObservation = await authenticatedLifecycleControl<{
    actions: unknown[]; anonymousProcessCommandRequests: number;
  }>('/control/sign-in-entry-observation', { projectName });
  expect(anonymousObservation.actions).toEqual([]);
  expect(anonymousObservation.anonymousProcessCommandRequests).toBe(0);
});

test('actual application uses the shared real-auth helper for rejected, cold and cached sign-in', async ({ context, page }, testInfo) => {
  const containmentProbe = await context.newPage();
  try {
    await expect(containmentProbe.goto(`${localApiOrigin}/__containment_probe__`, { waitUntil: 'domcontentloaded' }))
      .rejects.toThrow(/ERR_BLOCKED_BY_CLIENT/u);
  } finally {
    await containmentProbe.close();
  }
  const projectName = testInfo.project.name;
  const setup = await authenticatedLifecycleControl<{
    projectName: string;
    aliases: { process: string };
    deliveryProject: { name: string };
  }>('/control/setup', { projectName });
  authenticatedLifecycleValidateSetupLabels(setup, projectName, true);
  const unexpectedOrigins: string[] = [];
  const proxiedOrigins: string[] = [];
  let observedHttpRequests = 0;
  let networkActionError: unknown = null;
  let networkActionTail: Promise<unknown> = Promise.resolve();
  const activeActions = new Set<string>();
  let pendingActionStarts = 0;
  type AdmissionGate = {
    armed: boolean;
    waiting: boolean;
    released: boolean;
    request: Request | null;
    wait: Promise<void>;
    onWait: () => void;
    release: () => void;
  };
  let admissionGate: AdmissionGate | null = null;
  const gatedRequests = new WeakMap<Request, Request>();
  const queueNetworkAction = (operation: () => Promise<unknown>) => {
    networkActionTail = networkActionTail.then(operation).catch(error => {
      if (!networkActionError) networkActionError = error;
    });
  };
  const tracker = new AuthenticatedHostedBrowserActionTracker({
    backendOrigin: apiOrigin,
    appOrigin,
    startAction: async input => {
      pendingActionStarts += 1;
      try {
        const result = await authenticatedLifecycleControl<{ actionId: string }>('/control/browser-action-start', {
          projectName, ...input,
        });
        activeActions.add(result.actionId);
        return result;
      } finally { pendingActionStarts -= 1; }
    },
    finishAction: async input => {
      const result = await authenticatedLifecycleControl('/control/browser-action', { projectName, ...input });
      activeActions.delete(input.actionId);
      return result;
    },
  });
  const gatedRequestFor = (request: Request) => {
    const existing = gatedRequests.get(request);
    if (existing) return existing;
    const gated = new Proxy(request, {
      get(target, property) {
        if (property === 'allHeaders') return async () => {
          const gate = admissionGate;
          if (gate?.armed && new URL(target.url()).pathname === '/functions/v1/tenant-session') {
            gate.armed = false;
            gate.waiting = true;
            gate.request = target;
            gate.onWait();
            await gate.wait;
            gate.waiting = false;
          }
          return target.allHeaders();
        };
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    gatedRequests.set(request, gated);
    return gated;
  };
  const networkTracker = {
    classify: (request: Request) => tracker.classify(gatedRequestFor(request)),
    begin: (request: Request) => tracker.begin(gatedRequestFor(request)),
    reference: (request: Request) => tracker.reference(gatedRequestFor(request)),
    prepare: (request: Request, status: number, body: unknown) => tracker.prepare(gatedRequestFor(request), status, body),
    finish: (request: Request, status: number, body: unknown) => tracker.finish(gatedRequestFor(request), status, body),
  } as AuthenticatedHostedBrowserActionTracker;
  const networkLifecycle = await installAuthenticatedHostedNetwork({
    context: page.context(),
    hosted: true,
    allowedOrigins: new Set([appOrigin, apiOrigin]),
    tracker: networkTracker,
    queueNetworkAction,
    onExternalRequest: origin => unexpectedOrigins.push(origin),
    onHttpRequest: () => { observedHttpRequests += 1; },
    onTrackerError: error => { if (!networkActionError) networkActionError = error; },
    dispatchAllowedRequest: async route => {
      proxiedOrigins.push(new URL(route.request().url()).origin);
      await dispatchToLocalProxy(route);
    },
  });
  const settleActorTransitionEvidence = () => authenticatedLifecycleSettleActorNavigationBoundary({
    settleActionAdmissions: networkLifecycle.settleActionAdmissions,
    settleResponseBodies: networkLifecycle.settleResponseBodies,
    drainNetworkActions: async () => {
      for (;;) {
        const current = networkActionTail;
        await current;
        if (current === networkActionTail) break;
      }
      if (networkActionError) throw networkActionError;
    },
    activeActionCount: () => activeActions.size + pendingActionStarts,
  });
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.name));

  if (contractPhase === 'session-persistence') {
    type TokenGateState = Readonly<{
      mode: string;
      headersSent: boolean;
      waiting: boolean;
      released: boolean;
      automaticRelease: boolean;
      requests: number;
      completed: number;
    }>;
    const tokenGate = async (action: 'arm' | 'release' | 'inspect') => {
      const response = await fetch(`${tokenGateUrl}/control/token-body-gate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-authenticated-sign-in-gate': tokenGateToken },
        body: JSON.stringify({ action }),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status !== 200) throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_TOKEN_GATE_REJECTED');
      return await response.json() as TokenGateState;
    };
    const before = await authenticatedLifecycleControl<{
      passwordRequests: unknown[];
      bindings: unknown[];
      processAtomicCalls: number;
    }>('/control/sign-in-entry-observation', { projectName });
    await tokenGate('arm');
    let entrySettled = false;
    let sessionPendingObserved = false;
    const entry = authenticatedLifecycleEnterAs(page, actor(projectName, 'B'), settleActorTransitionEvidence, {
      onHostedSessionPending: () => { sessionPendingObserved = true; },
    })
      .finally(() => { entrySettled = true; });
    try {
      await expect.poll(() => sessionPendingObserved, { timeout: 15_000 }).toBe(true);
      await expect.poll(() => tokenGate('inspect'), { timeout: 15_000 }).toMatchObject({
        mode: 'holding', headersSent: true, waiting: true, released: false,
        automaticRelease: false, requests: 1, completed: 0,
      });
      const held = await authenticatedLifecycleControl<{
        passwordRequests: unknown[];
        bindings: unknown[];
        processAtomicCalls: number;
      }>('/control/sign-in-entry-observation', { projectName });
      expect(entrySettled).toBe(false);
      expect(held.passwordRequests.slice(before.passwordRequests.length)).toEqual([
        { actor: 'B', outcome: 'accepted' },
      ]);
      expect(held.bindings).toHaveLength(before.bindings.length);
      expect(held.processAtomicCalls).toBe(before.processAtomicCalls);
      expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('sb-')))).toEqual([]);
      await tokenGate('release');
      await entry;
      expect(await tokenGate('inspect')).toMatchObject({
        mode: 'released', headersSent: true, waiting: false, released: true,
        automaticRelease: false, requests: 1, completed: 1,
      });
      const after = await authenticatedLifecycleControl<{
        bindings: Array<{ actor: string; persona: string }>;
        processAtomicCalls: number;
      }>('/control/sign-in-entry-observation', { projectName });
      expect(after.bindings.slice(before.bindings.length)).toEqual([
        { actor: 'B', persona: 'reviewer', sessionHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u) },
      ]);
      expect(after.processAtomicCalls).toBe(before.processAtomicCalls);
      await settleActorTransitionEvidence();
      await networkActionTail;
      if (networkActionError) throw networkActionError;
      expect(pageErrors).toEqual([]);
      expect(unexpectedOrigins).toEqual([]);
      return;
    } finally {
      await tokenGate('release').catch(() => undefined);
      await entry.catch(() => undefined);
    }
  }

  let selectedProcessId: string;
  if (['assessment-negatives', 'assessment-positives', 'safety'].includes(contractPhase)) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await authenticatedLifecycleEnterAs(page, actor(projectName, 'A'), settleActorTransitionEvidence);
    await networkActionTail;
    if (networkActionError) throw networkActionError;
    selectedProcessId = await authenticatedLifecycleOpenConnectedProcess(page, setup.aliases.process);
    await networkActionTail;
    if (networkActionError) throw networkActionError;
  } else {

  const loopbackFailure = context.waitForEvent('requestfailed', {
    predicate: request => request.url() === `${localApiOrigin}/functions/v1/process-command`,
  });
  const arbitraryLoopbackOutcome = await page.evaluate(async origin => {
    try {
      await fetch(`${origin}/functions/v1/process-command`, { method: 'POST' });
      return 'reached-loopback';
    } catch { return 'blocked-before-loopback'; }
  }, localApiOrigin);
  expect(arbitraryLoopbackOutcome).toBe('blocked-before-loopback');
  await loopbackFailure;
  await expect.poll(() => unexpectedOrigins).toContain(localApiOrigin);
  expect(proxiedOrigins).not.toContain(localApiOrigin);
  await networkActionTail;
  expect(networkActionError).toBeInstanceOf(Error);
  expect((networkActionError as Error).message).toBe('AUTHENTICATED_BROWSER_PRODUCT_ORIGIN_REJECTED');
  networkActionError = null;
  unexpectedOrigins.length = 0;

  // The preserved first navigation is the session-scrub entry. The real app
  // maps it to PublicWebsite, demonstrating why the subsequent entry must use /sign-in.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Evaluate before you automate/u })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in securely', exact: true })).toHaveCount(0);

  const foreignFailure = context.waitForEvent('requestfailed', {
    predicate: request => request.url() === 'https://foreign.example/functions/v1/process-command',
  });
  const foreignOutcome = await page.evaluate(async () => {
    try {
      await fetch('https://foreign.example/functions/v1/process-command', { method: 'POST' });
      return 'reached-network';
    } catch { return 'blocked-before-network'; }
  });
  expect(foreignOutcome).toBe('blocked-before-network');
  await foreignFailure;
  await expect.poll(() => unexpectedOrigins).toContain('https://foreign.example');
  await networkActionTail;
  expect(networkActionError).toBeInstanceOf(Error);
  expect((networkActionError as Error).message).toBe('AUTHENTICATED_BROWSER_PRODUCT_ORIGIN_REJECTED');
  networkActionError = null;
  unexpectedOrigins.length = 0;

  await expect(authenticatedLifecycleEnterAs(page, actor(projectName, 'rejected'), settleActorTransitionEvidence))
    .rejects.toThrow('ENTERPRISE_LIFECYCLE_BROWSER_IDENTITY_CREDENTIAL_REJECTED');
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('sb-')))).toEqual([]);
  const rejectedObservation = await authenticatedLifecycleControl<{
    passwordRequests: unknown[];
    diagnostic: unknown;
    bindings: unknown[];
    actions: unknown[];
    attestationRequests: number;
  }>('/control/sign-in-entry-observation', { projectName });
  expect(rejectedObservation).toMatchObject({
    passwordRequests: [{ actor: 'rejected', outcome: 'rejected' }],
    diagnostic: { source: 'browser', operation: 'SIGN_IN', category: 'CREDENTIAL_REJECTED', upstreamCode: 'invalid_credentials' },
    bindings: [],
    actions: [],
  });
  expect(rejectedObservation.attestationRequests).toBeGreaterThan(0);

  await authenticatedLifecycleEnterAs(page, actor(projectName, 'A'), settleActorTransitionEvidence);
  await settleActorTransitionEvidence();
  const authorEntryObservation = await authenticatedLifecycleControl<{
    actions: Array<{ route: string; persona: string; complete: boolean; status: number | null }>;
  }>('/control/sign-in-entry-observation', { projectName });
  {
    let releaseAdmission!: () => void;
    const admissionWait = new Promise<void>(resolve => { releaseAdmission = resolve; });
    let automaticRelease: ReturnType<typeof setTimeout> | undefined;
    admissionGate = {
      armed: true,
      waiting: false,
      released: false,
      request: null,
      wait: admissionWait,
      onWait: () => {
        automaticRelease = setTimeout(() => admissionGate?.release(), 2_000);
      },
      release: () => {
        if (admissionGate?.released) return;
        if (admissionGate) admissionGate.released = true;
        releaseAdmission();
      },
    };
    const requestOutcome = page.evaluate(async backendOrigin => {
      const key = Object.keys(localStorage).find(candidate => candidate.startsWith('sb-'));
      const stored = key ? JSON.parse(localStorage.getItem(key) || '{}') : {};
      const accessToken = stored.access_token ?? stored.currentSession?.access_token ?? '';
      const response = await fetch(`${backendOrigin}/functions/v1/tenant-session`, {
        method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: '{}',
      });
      await response.json();
      return response.status;
    }, apiOrigin).then(
      status => Object.freeze({ state: 'fulfilled' as const, status }),
      error => Object.freeze({ state: 'rejected' as const, error }),
    );
    let boundaryOutcome: Promise<Readonly<{ state: 'fulfilled' }> | Readonly<{ state: 'rejected'; error: unknown }>> | null = null;
    try {
      await expect.poll(() => admissionGate?.waiting).toBe(true);
      expect(pendingActionStarts).toBe(0);
      expect(activeActions.size).toBe(0);
      let boundaryResult: Readonly<{ state: 'fulfilled' }> | Readonly<{ state: 'rejected'; error: unknown }> | null = null;
      boundaryOutcome = settleActorTransitionEvidence().then(
        () => (boundaryResult = Object.freeze({ state: 'fulfilled' as const })),
        error => (boundaryResult = Object.freeze({ state: 'rejected' as const, error })),
      );
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(boundaryResult).toBeNull();
      expect(admissionGate.released).toBe(false);
      const settledBoundary = await boundaryOutcome;
      if (settledBoundary.state === 'rejected') throw settledBoundary.error;
      expect(admissionGate.released).toBe(true);
      const settledRequest = await requestOutcome;
      if (settledRequest.state === 'rejected') throw settledRequest.error;
      expect(settledRequest.status).toBe(200);
      await settleActorTransitionEvidence();
      const heldRequest = admissionGate.request;
      expect(heldRequest).not.toBeNull();
      const heldActionId = await networkTracker.reference(heldRequest as Request);
      expect(typeof heldActionId).toBe('string');
      expect(activeActions.has(heldActionId as string)).toBe(false);
      const afterAdmission = await authenticatedLifecycleControl<{
        actions: Array<{ route: string; persona: string; complete: boolean; status: number | null }>;
      }>('/control/sign-in-entry-observation', { projectName });
      const admittedActions = afterAdmission.actions.slice(authorEntryObservation.actions.length);
      expect(admittedActions.every(action => action.complete && action.status !== null)).toBe(true);
      expect(admittedActions.filter(action => action.route === '/functions/v1/tenant-session'
        && action.persona === 'author')).toEqual([
        expect.objectContaining({ complete: true, status: 200 }),
      ]);
      expect(pendingActionStarts).toBe(0);
      expect(activeActions.size).toBe(0);
    } finally {
      if (automaticRelease !== undefined) clearTimeout(automaticRelease);
      admissionGate?.release();
      await boundaryOutcome?.catch(() => undefined);
      await requestOutcome.catch(() => undefined);
      admissionGate = null;
    }
  }
  await authenticatedLifecycleEnterAs(page, actor(projectName, 'B'), settleActorTransitionEvidence);
  const reviewerColdObservation = await authenticatedLifecycleControl<{
    passwordRequests: unknown[]; bindings: unknown[]; verifySessionCalls: unknown[];
  }>('/control/sign-in-entry-observation', { projectName });
  expect(reviewerColdObservation.passwordRequests).toEqual([
    { actor: 'rejected', outcome: 'rejected' },
    { actor: 'A', outcome: 'accepted' },
    { actor: 'B', outcome: 'accepted' },
  ]);
  expect(reviewerColdObservation.bindings).toEqual([
    expect.objectContaining({ actor: 'A', persona: 'author' }),
    expect.objectContaining({ actor: 'B', persona: 'reviewer' }),
  ]);
  expect(reviewerColdObservation.verifySessionCalls).toContainEqual({ actor: 'B', outcome: 'verified' });
  await expect(page.getByRole('heading', { name: 'Process Catalog', exact: true })).toBeVisible();
  {
    type ObserverGate = Readonly<{ mode: string; waiting: number }>;
    const observerGate = (mode: 'hold-next' | 'release') => authenticatedLifecycleControl<ObserverGate>(
      '/control/sign-in-entry-observe-gate', { projectName, mode },
    );
    const actionObservation = () => authenticatedLifecycleControl<{
      actions: Array<{ complete: boolean }>;
    }>('/control/sign-in-entry-observation', { projectName });
    const auxiliaryPage = await context.newPage();
    await authenticatedHostedConfigureChromiumDurableResponseBodies(context, auxiliaryPage);
    await auxiliaryPage.goto('/', { waitUntil: 'domcontentloaded' });
    await settleActorTransitionEvidence();
    const before = await actionObservation();
    await observerGate('hold-next');
    const request = auxiliaryPage.evaluate(async backendOrigin => {
      const key = Object.keys(localStorage).find(candidate => candidate.startsWith('sb-'));
      const stored = key ? JSON.parse(localStorage.getItem(key) || '{}') : {};
      const accessToken = stored.access_token ?? stored.currentSession?.access_token ?? '';
      const response = await fetch(`${backendOrigin}/functions/v1/tenant-session`, {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: '{}',
      });
      await response.json();
      return response.status;
    }, apiOrigin).then(
      status => Object.freeze({ state: 'fulfilled' as const, status }),
      error => Object.freeze({ state: 'rejected' as const, error }),
    );
    await expect.poll(() => pendingActionStarts).toBeGreaterThan(0);
    let closeOutcome: Readonly<{ state: 'closed' }> | Readonly<{ state: 'rejected'; error: unknown }> | null = null;
    const close = authenticatedHostedClosePageAfterOwnedNetwork({
      settleOwnedNetwork: settleActorTransitionEvidence,
      closePage: () => auxiliaryPage.close(),
    }).then(
      () => { closeOutcome = Object.freeze({ state: 'closed' as const }); },
      error => { closeOutcome = Object.freeze({ state: 'rejected' as const, error }); },
    );
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(closeOutcome).toBeNull();
      expect(auxiliaryPage.isClosed()).toBe(false);
      expect(pendingActionStarts).toBeGreaterThan(0);
      await observerGate('release');
      const requestOutcome = await request;
      if (requestOutcome.state === 'rejected') throw requestOutcome.error;
      expect(requestOutcome.status).toBe(200);
      await close;
      if (closeOutcome?.state === 'rejected') throw closeOutcome.error;
      expect(closeOutcome).toEqual({ state: 'closed' });
      expect(auxiliaryPage.isClosed()).toBe(true);
      const after = await actionObservation();
      expect(after.actions.length).toBe(before.actions.length + 1);
      expect(after.actions.at(-1)?.complete).toBe(true);
      expect(pendingActionStarts).toBe(0);
      expect(activeActions.size).toBe(0);
      await authenticatedLifecycleEnterAs(page, actor(projectName, 'B'), settleActorTransitionEvidence);
      await expect(page.getByRole('heading', { name: 'Process Catalog', exact: true })).toBeVisible();
      await settleActorTransitionEvidence();
    } finally {
      await observerGate('release').catch(() => undefined);
      await request.catch(() => undefined);
      await close;
      await auxiliaryPage.close().catch(() => undefined);
    }
  }
  await page.evaluate(() => {
    const gatedWindow = window as unknown as Record<string, unknown>;
    const originalPushState = window.history.pushState;
    let held: Parameters<History['pushState']> | null = null;
    let captureCount = 0;
    let releaseCount = 0;
    window.history.pushState = function gatedProcessDetailPush(...args) {
      const candidate = new URL(String(args[2] ?? window.location.href), window.location.href);
      if (!held && candidate.searchParams.get('view') === 'process_detail') {
        held = args;
        captureCount += 1;
        return;
      }
      return originalPushState.apply(window.history, args);
    };
    gatedWindow.__avalaosProcessDetailGate = {
      captured: () => held !== null,
      release: () => {
        const released = held;
        window.history.pushState = originalPushState;
        if (!released) return { captureCount, releaseCount };
        held = null;
        releaseCount += 1;
        originalPushState.apply(window.history, released);
        return { captureCount, releaseCount };
      },
    };
  });
  let openSettled = false;
  const openPromise = authenticatedLifecycleOpenConnectedProcess(page, setup.aliases.process).then(processId => {
    openSettled = true;
    return processId;
  });
  try {
    await expect.poll(() => page.evaluate(() => {
      const gate = (window as unknown as Record<string, {
        captured?: () => boolean;
      }>).__avalaosProcessDetailGate;
      return gate?.captured?.() ?? false;
    })).toBe(true);
    await expect(page.getByTestId('assess-v2-workspace')).toBeVisible();
    expect(openSettled).toBe(false);
    const unsettled = await page.evaluate(() => ({
      search: window.location.search,
      persistedView: JSON.parse(localStorage.getItem('avalaos-core-v1-view') || 'null'),
      persistedScope: JSON.parse(localStorage.getItem('avalaos-core-v1-scope') || 'null'),
    }));
    expect(new URLSearchParams(unsettled.search).get('view')).toBe('process_catalog');
    expect(unsettled.persistedView).toBe('process_detail');
    expect(unsettled.persistedScope).toEqual({ type: 'my_work' });
    const released = await page.evaluate(() => {
      const gate = (window as unknown as Record<string, {
        release?: () => { captureCount: number; releaseCount: number };
      }>).__avalaosProcessDetailGate;
      return gate?.release?.() ?? null;
    });
    expect(released).toEqual({ captureCount: 1, releaseCount: 1 });
    selectedProcessId = await openPromise;
  } finally {
    await page.evaluate(() => {
      const gate = (window as unknown as Record<string, {
        release?: () => unknown;
      }>).__avalaosProcessDetailGate;
      gate?.release?.();
    });
    await openPromise.catch(() => undefined);
  }
  expect(selectedProcessId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  const editProcess = page.getByRole('button', { name: 'Edit process details', exact: true });
  await expect(editProcess).toBeDisabled();
  await expect(editProcess).toHaveAttribute('title', 'Process editing is not authorized for this role.');
  await expect(page.getByTestId('process-edit-form')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save process details', exact: true })).toHaveCount(0);
  if (processSeedMode === 'nullable-reproduction') {
    await expect(authenticatedLifecycleAttemptUnauthorizedProcessUpdate(page, setup.aliases.process))
      .rejects.toThrow('ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_AUTHORITY_REJECTED');
    const reproduction = await authenticatedLifecycleControl<{
      actions: Array<{ route: string }>;
      processCommandRequests: number;
      anonymousProcessCommandRequests: number;
    }>('/control/sign-in-entry-observation', { projectName });
    expect(reproduction.actions.filter(action => action.route === '/functions/v1/process-command')).toEqual([]);
    expect(reproduction.processCommandRequests).toBe(0);
    expect(reproduction.anonymousProcessCommandRequests).toBe(0);
    return;
  }
  const denied = await authenticatedLifecycleAttemptUnauthorizedProcessUpdate(page, setup.aliases.process);
  expect(denied.status).toBe(403);
  expect(denied.body).toEqual({ ok: false, error: {
    code: 'PERMISSION_DENIED', message: 'Process update could not be completed.',
  } });
  if (scopedNavigationOnly) {
    type DeliveryTaskGate = {
      mode: string; waiting: number; requests: number; completed: number; terminal: number;
      committed: number; aborted: number; terminalSignals: number; duplicateTerminalSignals: number;
      terminalOutcomes: Array<{ outcome: 'committed' | 'aborted'; status: number | null }>;
      held: number;
      actors: string[]; authorityVersions: number[];
    };
    const deliveryTaskGate = (action: 'hold-next' | 'release' | 'reject' | 'inspect') =>
      authenticatedLifecycleControl<DeliveryTaskGate>('/control/sign-in-entry-delivery-task-gate', { projectName, action });
    type ReadinessObservation = {
      tenantSessionRequests: number; tenantSessionCompleted: number;
      processReadRequests: number; processReadCompleted: number;
      projectIndexRequests: number; projectIndexCompleted: number;
    };
    // Finish prior-document reads before the next reload owns the held request.
    await settleActorTransitionEvidence();
    const beforeHold = await deliveryTaskGate('inspect');
    const beforeReadiness = await authenticatedLifecycleControl<ReadinessObservation>(
      '/control/sign-in-entry-observation', { projectName },
    );
    const beforeFrame = await authenticatedLifecycleControl<{
      targetHash: string; receipts: number; audits: number; processVersion: number;
    }>('/control/process-frame', { projectName });
    await deliveryTaskGate('hold-next');
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect.poll(() => deliveryTaskGate('inspect')).toMatchObject({
        mode: 'held', waiting: 1, requests: beforeHold.requests + 1,
        completed: beforeHold.completed, held: beforeHold.held + 1,
      });
      await expect.poll(async () => {
        const observation = await authenticatedLifecycleControl<ReadinessObservation>(
          '/control/sign-in-entry-observation', { projectName },
        );
        return {
          tenantSessionRequests: observation.tenantSessionRequests,
          tenantSessionCompleted: observation.tenantSessionCompleted,
          projectIndexRequests: observation.projectIndexRequests,
          projectIndexCompleted: observation.projectIndexCompleted,
          processReadsSettled: observation.processReadRequests === observation.processReadCompleted,
          processReadDelta: observation.processReadRequests - beforeReadiness.processReadRequests,
        };
      }).toMatchObject({
        tenantSessionRequests: beforeReadiness.tenantSessionRequests + 1,
        tenantSessionCompleted: beforeReadiness.tenantSessionCompleted + 1,
        projectIndexRequests: beforeReadiness.projectIndexRequests + 1,
        projectIndexCompleted: beforeReadiness.projectIndexCompleted + 1,
        processReadsSettled: true,
      });
      const heldReadiness = await authenticatedLifecycleControl<ReadinessObservation>(
        '/control/sign-in-entry-observation', { projectName },
      );
      expect(heldReadiness.processReadRequests - beforeReadiness.processReadRequests).toBeGreaterThanOrEqual(1);
      const heldSearch = new URL(page.url()).search;
      expect(new URLSearchParams(heldSearch).get('view')).toBe('process_detail');
      expect(new URLSearchParams(heldSearch).get('processId')).toBe(selectedProcessId);
      await expect(page.getByRole('heading', { name: setup.aliases.process, exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('button', { name: 'Edit process details', exact: true })).toBeDisabled();
      expect(await authenticatedLifecycleControl('/control/process-frame', { projectName })).toEqual(beforeFrame);
    } finally {
      await deliveryTaskGate('reject');
    }
    await expect(page.getByRole('heading', { name: setup.aliases.process, exact: true })).toBeVisible();
    await expect(page.getByRole('alert').filter({
      hasText: 'Delivery data could not be loaded:',
    })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit process details', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Edit process details', exact: true }))
      .toHaveAttribute('title', 'Process editing is not authorized for this role.');
    expect(await authenticatedLifecycleControl('/control/process-frame', { projectName })).toEqual(beforeFrame);
    await expect.poll(() => deliveryTaskGate('inspect')).toMatchObject({
      mode: 'open', waiting: 0, requests: beforeHold.requests + 2,
      completed: beforeHold.completed + 2, held: beforeHold.held + 1,
    });

    for (const outcome of ['empty', 'denied'] as const) {
      const beforeFault = await authenticatedLifecycleControl<{
        outcome: string | null; skip: number; remaining: number; consumed: number; completed: number;
      }>('/control/sign-in-entry-process-read', { projectName, action: 'inspect' });
      await authenticatedLifecycleControl('/control/sign-in-entry-process-read', {
        projectName, action: 'arm', outcome, skip: 0,
      });
      const responsePromise = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.origin === apiOrigin && url.pathname === '/rest/v1/assess_processes'
          && response.request().method() === 'GET';
      });
      const [processResponse] = await Promise.all([
        responsePromise,
        page.reload({ waitUntil: 'domcontentloaded' }),
      ]);
      expect(await processResponse.finished()).toBeNull();
      expect(processResponse.status()).toBe(outcome === 'empty' ? 200 : 403);
      await expect.poll(async () => authenticatedLifecycleControl<{
        outcome: string | null; skip: number; remaining: number; consumed: number; completed: number;
      }>('/control/sign-in-entry-process-read', { projectName, action: 'inspect' })).toMatchObject({
        outcome, remaining: 0, consumed: beforeFault.consumed + 1, completed: beforeFault.completed + 1,
      });
      if (outcome === 'empty') {
        await expect(page.getByRole('heading', { name: 'Process Catalog', exact: true })).toBeVisible();
        await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('process_catalog');
        expect(new URL(page.url()).searchParams.has('processId')).toBe(false);
        await authenticatedLifecycleEnterAs(page, actor(projectName, 'B'), settleActorTransitionEvidence);
        await authenticatedLifecycleOpenConnectedProcess(page, setup.aliases.process);
      } else {
        await expect(page.getByRole('alert').filter({ hasText: 'Process data could not be loaded for this workspace.' })).toBeVisible();
        const settledSearch = new URL(page.url()).searchParams;
        expect(settledSearch.get('view')).toBe('process_detail');
        expect(settledSearch.get('processId')).toBe(selectedProcessId);
      }
    }

    // An older admitted read must not consume hold-next and be cancelled by reload.
    await settleActorTransitionEvidence();
    const beforeAuthoritySwitch = await deliveryTaskGate('inspect');
    await deliveryTaskGate('hold-next');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(async () => {
      const gate = await deliveryTaskGate('inspect');
      const actors = gate.actors.slice(beforeAuthoritySwitch.actors.length);
      const versions = gate.authorityVersions.slice(beforeAuthoritySwitch.authorityVersions.length);
      return {
        mode: gate.mode,
        waiting: gate.waiting,
        held: gate.held,
        requestStarted: gate.requests > beforeAuthoritySwitch.requests,
        exactlyOnePending: gate.requests === gate.terminal + 1,
        allTerminalsCommitted: gate.terminal - beforeAuthoritySwitch.terminal === gate.committed - beforeAuthoritySwitch.committed
          && gate.completed - beforeAuthoritySwitch.completed === gate.committed - beforeAuthoritySwitch.committed
          && gate.aborted === beforeAuthoritySwitch.aborted,
        actorsAreReviewer: actors.length > 0 && actors.every(actorName => actorName === 'reviewer'),
        versionsAreOne: versions.length > 0 && versions.every(version => version === 1),
      };
    }).toMatchObject({
      mode: 'held', waiting: 1, held: beforeAuthoritySwitch.held + 1,
      requestStarted: true, exactlyOnePending: true, allTerminalsCommitted: true, actorsAreReviewer: true, versionsAreOne: true,
    });
    let priorAuthorityReleased = false;
    try {
      expect(await authenticatedLifecycleControl('/control/sign-in-entry-authority-version', {
        projectName, action: 'advance',
      })).toEqual({ current: 2, priorRead: 1 });
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect.poll(async () => {
        const gate = await deliveryTaskGate('inspect');
        const actors = gate.actors.slice(beforeAuthoritySwitch.actors.length);
        const versions = gate.authorityVersions.slice(beforeAuthoritySwitch.authorityVersions.length);
        return {
          mode: gate.mode,
          waiting: gate.waiting,
          held: gate.held,
          exactlyOnePending: gate.requests === gate.terminal + 1,
          allTerminalsCommitted: gate.terminal - beforeAuthoritySwitch.terminal === gate.committed - beforeAuthoritySwitch.committed
            && gate.completed - beforeAuthoritySwitch.completed === gate.committed - beforeAuthoritySwitch.committed
            && gate.aborted === beforeAuthoritySwitch.aborted,
          actorsAreReviewer: actors.length > 0 && actors.every(actorName => actorName === 'reviewer'),
          versionsAreScoped: versions.length > 0 && versions.every(version => version === 1 || version === 2),
          currentAuthorityObserved: versions.includes(2),
        };
      }).toMatchObject({
        mode: 'held', waiting: 1, held: beforeAuthoritySwitch.held + 1,
        exactlyOnePending: true, allTerminalsCommitted: true, actorsAreReviewer: true, versionsAreScoped: true,
        currentAuthorityObserved: true,
      });
      const latePriorAuthorityResponseResult = page.waitForResponse(response => {
        const url = new URL(response.url());
        if (url.origin !== apiOrigin || url.pathname !== '/functions/v1/legacy-delivery-query'
          || response.request().method() !== 'POST' || response.status() !== 503) return false;
        try {
          return response.request().postDataJSON()?.expectedAuthorizationVersion === 1;
        } catch {
          return false;
        }
      }).then(
        response => ({ response, error: null }),
        error => ({ response: null, error }),
      );
      await deliveryTaskGate('reject');
      priorAuthorityReleased = true;
      const latePriorAuthorityResult = await latePriorAuthorityResponseResult;
      if (latePriorAuthorityResult.error) throw latePriorAuthorityResult.error;
      const latePriorAuthorityResponse = latePriorAuthorityResult.response;
      if (!latePriorAuthorityResponse) {
        throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_DELIVERY_RESPONSE_NOT_COMMITTED');
      }
      expect(await latePriorAuthorityResponse.finished()).toBeNull();
      expect(latePriorAuthorityResponse.status()).toBe(503);
      expect(await latePriorAuthorityResponse.json()).toEqual({ ok: false, error: {
        code: 'QUERY_UNAVAILABLE', message: 'Delivery data could not be loaded.',
      } });
      await expect(page.getByRole('heading', { name: setup.aliases.process, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Edit process details', exact: true })).toBeDisabled();
    } finally {
      if (!priorAuthorityReleased) await deliveryTaskGate('reject').catch(() => undefined);
    }
    await expect.poll(async () => {
      const gate = await deliveryTaskGate('inspect');
      const actors = gate.actors.slice(beforeAuthoritySwitch.actors.length);
      const versions = gate.authorityVersions.slice(beforeAuthoritySwitch.authorityVersions.length);
      return {
        mode: gate.mode,
        waiting: gate.waiting,
        held: gate.held,
        settled: gate.requests === gate.completed,
        actorsAreReviewer: actors.length > 0 && actors.every(actorName => actorName === 'reviewer'),
        versionsAreScoped: versions.length > 0 && versions.every(version => version === 1 || version === 2),
        currentAuthorityObserved: versions.includes(2),
      };
    }).toMatchObject({
      mode: 'open', waiting: 0, held: beforeAuthoritySwitch.held + 1,
      settled: true, actorsAreReviewer: true, versionsAreScoped: true, currentAuthorityObserved: true,
    });
    const settledAuthority = await deliveryTaskGate('inspect');
    const requestDelta = settledAuthority.requests - beforeAuthoritySwitch.requests;
    const completedDelta = settledAuthority.completed - beforeAuthoritySwitch.completed;
    const terminalDelta = settledAuthority.terminal - beforeAuthoritySwitch.terminal;
    const committedDelta = settledAuthority.committed - beforeAuthoritySwitch.committed;
    const abortedDelta = settledAuthority.aborted - beforeAuthoritySwitch.aborted;
    if (requestDelta < 2 || completedDelta !== requestDelta || terminalDelta !== requestDelta
      || committedDelta !== requestDelta || abortedDelta !== 0) {
      throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_DELIVERY_RESPONSE_NOT_COMMITTED');
    }
    const observedAuthorityVersions = settledAuthority.authorityVersions
      .slice(beforeAuthoritySwitch.authorityVersions.length);
    await expect(page.getByRole('heading', { name: setup.aliases.process, exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('view')).toBe('process_detail');
    expect(new URL(page.url()).searchParams.get('processId')).toBe(selectedProcessId);
    await expect(page.getByRole('alert').filter({
      hasText: 'Delivery data could not be loaded:',
    })).toHaveCount(0);
    expect(await authenticatedLifecycleControl('/control/process-frame', { projectName })).toEqual(beforeFrame);
    await settleActorTransitionEvidence();
    expect(pageErrors).toEqual([]);
    if (!scopedNavigationEvidencePath) throw new Error('SCOPED_NAVIGATION_EVIDENCE_PATH_REQUIRED');
    await appendFile(scopedNavigationEvidencePath, `${JSON.stringify({
      schemaVersion: 'scoped-navigation-readiness.v1',
      phase: 'corrected',
      browserProject: projectName,
      exactApplication: true,
      registeredSameWorkspaceProject: true,
      heldDeliveryResponseBeforeHeaders: true,
      tenantProcessAndProjectIndexCompletedWhileHeld: true,
      durableProcessRoutePreservedWhileHeld: true,
      processRenderedWithinOriginalBoundWhileUnrelatedTaskPending: true,
      renderBoundMs: 20_000,
      processRemainedRenderedAfterUnrelatedTaskRejection: true,
      deliveryErrorVisibleAfterCurrentAuthorityTaskFailure: true,
      latePriorAuthorityResponseReleasedWithoutVisibleError: true,
      sameActorAuthorizationVersionRefresh: true,
      authorityRefreshRequestCount: requestDelta,
      authorityRefreshCompletedCount: completedDelta,
      authorityRefreshTerminalCount: terminalDelta,
      authorityRefreshCommittedCount: committedDelta,
      authorityRefreshAbortedCount: abortedDelta,
      latePriorAuthorityResponseStatus: 503,
      latePriorAuthorityResponseCommitted: true,
      authorityRefreshObservedVersions: observedAuthorityVersions,
      serverFrameUnchanged: true,
      restrictedEditorRemainedDisabled: true,
      processEmptyCanonicalizedAsMissing: true,
      processReadErrorPreservedDurableRoute: true,
      historicalHostedCauseProven: false,
    })}\n`, 'utf8');
    return;
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: setup.aliases.process, exact: true })).toBeVisible();
  await expect(page.getByTestId('process-edit-form')).toHaveCount(0);
  if (processReadStateOnly) {
    const beforeProcessReadFrame = await authenticatedLifecycleControl<{
      targetHash: string; receipts: number; audits: number; processVersion: number;
    }>('/control/process-frame', { projectName });
    const beforeProcessReadObservation = await authenticatedLifecycleControl<{
      processCommandRequests: number;
    }>('/control/sign-in-entry-observation', { projectName });
    for (const outcome of ['empty', 'denied'] as const) {
      await authenticatedLifecycleEnterAs(page, actor(projectName, 'B'), settleActorTransitionEvidence);
      await expect(page.getByRole('heading', { name: 'Process Catalog', exact: true })).toBeVisible();
      const beforeFault = await authenticatedLifecycleControl<{
        outcome: string | null; skip: number; remaining: number; consumed: number; completed: number;
      }>('/control/sign-in-entry-process-read', { projectName, action: 'inspect' });
      const exactProcessButton = page.getByRole('button', { name: setup.aliases.process, exact: true });
      const processRow = page.getByRole('row').filter({ has: exactProcessButton });
      await expect(processRow).toHaveCount(1);
      await authenticatedLifecycleControl('/control/sign-in-entry-process-read', {
        projectName, action: 'arm', outcome, skip: 0,
      });
      const processResponsePromise = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.origin === apiOrigin && url.pathname === '/rest/v1/assess_processes'
          && response.request().method() === 'GET';
      });
      const [processResponse] = await Promise.all([
        processResponsePromise,
        processRow.getByRole('button', { name: 'View', exact: true }).click(),
      ]);
      expect(await processResponse.finished()).toBeNull();
      expect(processResponse.status()).toBe(outcome === 'empty' ? 200 : 403);
      expect(await processResponse.json()).toEqual(outcome === 'empty' ? [] : { code: 'PERMISSION_DENIED' });
      await expect.poll(async () => authenticatedLifecycleControl<{
        outcome: string | null; skip: number; remaining: number; consumed: number; completed: number;
      }>('/control/sign-in-entry-process-read', { projectName, action: 'inspect' })).toMatchObject({
        outcome, skip: 0, remaining: 0,
        consumed: beforeFault.consumed + 1,
        completed: beforeFault.completed + 1,
      });
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(page.getByText('Loading process...', { exact: true })).toHaveCount(0);
      if (outcome === 'empty') {
        await expect(page.getByText('Process not found or you do not have permission.', { exact: true })).toBeVisible();
      } else {
        await expect(page.getByRole('alert').filter({
          hasText: 'Process details could not be loaded. Go back and try again.',
        })).toHaveCount(1);
      }
      await expect(page.getByRole('button', { name: 'Edit process details', exact: true })).toHaveCount(0);
      await expect(page.getByTestId('process-edit-form')).toHaveCount(0);
      expect(await authenticatedLifecycleControl('/control/process-frame', { projectName })).toEqual(beforeProcessReadFrame);
      const readObservation = await authenticatedLifecycleControl<{
        processCommandRequests: number; anonymousProcessCommandRequests: number;
      }>('/control/sign-in-entry-observation', { projectName });
      expect(readObservation.processCommandRequests).toBe(beforeProcessReadObservation.processCommandRequests);
      expect(readObservation.anonymousProcessCommandRequests).toBe(0);
    }
    await settleActorTransitionEvidence();
    expect(observedHttpRequests).toBeGreaterThan(0);
    expect(proxiedOrigins.length).toBeGreaterThan(0);
    expect(proxiedOrigins.every(origin => origin === appOrigin || origin === apiOrigin)).toBe(true);
    expect(unexpectedOrigins).toEqual([]);
    expect(pageErrors).toEqual([]);
    return;
  }
  if (contractPhase === 'specialized') {
    throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_SPECIALIZED_MODE_INCOMPLETE');
  }
  const entryObservation = await authenticatedLifecycleControl<{
    passwordRequests: unknown[];
    diagnostic: unknown;
    bindings: unknown[];
    actions: Array<{ route: string; persona: string; complete: boolean; status: number | null }>;
    processCommandRequests: number;
    anonymousProcessCommandRequests: number;
    browserCases: number;
    serverCases: number;
  }>('/control/sign-in-entry-observation', { projectName });
  expect(entryObservation).toMatchObject({
    passwordRequests: [
      { actor: 'rejected', outcome: 'rejected' },
      { actor: 'A', outcome: 'accepted' },
      { actor: 'B', outcome: 'accepted' },
    ],
    diagnostic: { source: 'browser', operation: 'SIGN_IN', category: 'CREDENTIAL_REJECTED', upstreamCode: 'invalid_credentials' },
    bindings: [
      { actor: 'A', persona: 'author' },
      { actor: 'B', persona: 'reviewer' },
    ],
  });
  expect(entryObservation.actions.filter(action => action.route === '/functions/v1/process-command')).toEqual([
    expect.objectContaining({ persona: 'reviewer', complete: true, status: 403 }),
  ]);
  expect(entryObservation.processCommandRequests).toBe(1);
  expect(entryObservation.anonymousProcessCommandRequests).toBe(0);
  expect(entryObservation.actions.every(action => action.route !== '/rest/v1/rpc/pr_c_controlled_human_public_attestation'
    && !action.route.startsWith('/auth/'))).toBe(true);
  expect(entryObservation.browserCases).toBe(0);
  expect(entryObservation.serverCases).toBe(0);
  await settleActorTransitionEvidence();
  expect(observedHttpRequests).toBeGreaterThan(0);
  expect(proxiedOrigins.length).toBeGreaterThan(0);
  expect(proxiedOrigins.every(origin => origin === appOrigin || origin === apiOrigin)).toBe(true);
  expect(unexpectedOrigins).toEqual([]);
  expect(pageErrors).toEqual([]);
  return;
  }

  type AssessmentControl = Readonly<{
    mode: string;
    status: string | null;
    version: number | null;
    commandTypes: string[];
    finalizedReadbacks: number;
    waiting: number;
  }>;
  const assessmentControl = (input: Record<string, unknown>) =>
    authenticatedLifecycleControl<AssessmentControl>('/control/sign-in-entry-assessment', { projectName, ...input });
  const resetAssessment = async (mode: string, seedDraft: boolean) => {
    await assessmentControl({ action: 'reset', mode, seedDraft });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: setup.aliases.process, exact: true })).toBeVisible();
  };
  const exitAssessment = async () => {
    const backToProcess = page.getByRole('button', { name: 'Back to Process', exact: true });
    const backToCatalog = page.getByRole('button', { name: 'Back to Process Catalog', exact: true });
    if (await backToProcess.isVisible().catch(() => false)) await backToProcess.click();
    else if (await backToCatalog.isVisible().catch(() => false)) await backToCatalog.click();
    const discard = page.getByRole('button', { name: 'Discard Changes', exact: true });
    if (await discard.isVisible().catch(() => false)) await discard.click();
    if (await page.getByRole('heading', { name: 'Process Catalog', exact: true }).isVisible().catch(() => false)) {
      await authenticatedLifecycleOpenConnectedProcess(page, setup.aliases.process);
    }
    if (!(await page.getByRole('heading', { name: setup.aliases.process, exact: true }).isVisible().catch(() => false))) {
      await authenticatedLifecycleEnterAs(page, actor(projectName, 'A'), settleActorTransitionEvidence);
      await authenticatedLifecycleOpenConnectedProcess(page, setup.aliases.process);
    }
    await expect(page.getByRole('heading', { name: setup.aliases.process, exact: true })).toBeVisible();
  };
  const completeV1 = (timeoutMs = 8_000) => runV1AssessmentCompletion({
    page,
    identity: { actorId: actor(projectName, 'A').user.id, processId: selectedProcessId },
    actionReference: request => networkTracker.reference(request),
    runStep: (title, operation) => test.step(title, operation),
    timeoutMs,
  });
  const completePositiveV1 = async (label: string) => {
    try {
      return await test.step(label, () => completeV1(15_000));
    } catch (error) {
      const state = await assessmentControl({ action: 'inspect' });
      throw new Error(`AUTHENTICATED_V1_POSITIVE_FAILED:${label}:${state.status ?? 'none'}:${state.commandTypes.length}:${state.finalizedReadbacks}`, { cause: error });
    }
  };
  const expectDraftFinalizeFailure = (state: AssessmentControl) => {
    expect(state.status).toBe('Draft');
    expect(state.commandTypes.at(-1)).toBe('assessment.finalize');
    expect(state.commandTypes.filter(type => type === 'assessment.finalize')).toHaveLength(1);
    expect(state.commandTypes.slice(0, -1).length).toBeGreaterThan(0);
    expect(state.commandTypes.slice(0, -1).every(type => type === 'assessment.response.upsert')).toBe(true);
    expect(state.version).toBe(state.commandTypes.length);
  };

  const assertAssessmentOnlyObservation = async () => {
    await settleActorTransitionEvidence();
    const phaseObservation = await authenticatedLifecycleControl<{
      passwordRequests: unknown[];
      diagnostic: unknown;
      bindings: unknown[];
      actions: Array<{ route: string }>;
      processCommandRequests: number;
      anonymousProcessCommandRequests: number;
      browserCases: number;
      serverCases: number;
    }>('/control/sign-in-entry-observation', { projectName });
    expect(phaseObservation).toMatchObject({
      passwordRequests: [{ actor: 'A', outcome: 'accepted' }],
      diagnostic: null,
      bindings: [{ actor: 'A', persona: 'author' }],
    });
    expect(phaseObservation.actions.filter(action => action.route === '/functions/v1/process-command')).toEqual([]);
    expect(phaseObservation.processCommandRequests).toBe(0);
    expect(phaseObservation.anonymousProcessCommandRequests).toBe(0);
    expect(phaseObservation.actions.every(action => action.route !== '/rest/v1/rpc/pr_c_controlled_human_public_attestation'
      && !action.route.startsWith('/auth/'))).toBe(true);
    expect(phaseObservation.browserCases).toBe(0);
    expect(phaseObservation.serverCases).toBe(0);
    expect(observedHttpRequests).toBeGreaterThan(0);
    expect(proxiedOrigins.length).toBeGreaterThan(0);
    expect(proxiedOrigins.every(origin => origin === appOrigin || origin === apiOrigin)).toBe(true);
    expect(unexpectedOrigins).toEqual([]);
    expect(pageErrors).toEqual([]);
  };

  if (contractPhase === 'assessment-negatives') {
  await resetAssessment('reject-finalize', true);
  let legacyDialogObserverSettled = false;
  const legacyDialogObserver = () => { legacyDialogObserverSettled = true; };
  page.once('dialog', legacyDialogObserver);
  await expect(completeV1()).rejects.toThrow('V1_ASSESSMENT_FINALIZE_REJECTED');
  await page.waitForTimeout(50);
  expect(legacyDialogObserverSettled).toBe(false);
  page.off('dialog', legacyDialogObserver);
  expectDraftFinalizeFailure(await assessmentControl({ action: 'inspect' }));
  await expect(page.getByText('Assessed & Scored', { exact: true })).toHaveCount(0);
  await exitAssessment();

  await resetAssessment('single-readback', false);
  const delayedDiscovery = await page.addStyleTag({
    content: '[data-testid="enterprise-assess"] { visibility: hidden !important; }',
  });
  await expect(completeV1(300)).rejects.toThrow(V1_ASSESSMENT_COMPLETION_TIMEOUT);
  await delayedDiscovery.evaluate(node => (node as Element).remove());
  await expect(page.getByTestId('enterprise-assess')).toBeVisible();
  await page.waitForTimeout(100);
  expect(await assessmentControl({ action: 'inspect' })).toMatchObject({
    status: null, version: null, commandTypes: [], finalizedReadbacks: 0, waiting: 0,
  });
  await exitAssessment();

  await resetAssessment('stall-finalize', true);
  const stalledCompletion = completeV1(4_000);
  await expect.poll(async () => (await assessmentControl({ action: 'inspect' })).waiting).toBe(1);
  await expect(stalledCompletion).rejects.toThrow(V1_ASSESSMENT_COMPLETION_TIMEOUT);
  const stalledBeforeRelease = await assessmentControl({ action: 'inspect' });
  expect(stalledBeforeRelease.waiting).toBe(1);
  expectDraftFinalizeFailure(stalledBeforeRelease);
  await assessmentControl({ action: 'release-stall' });
  await expect.poll(async () => (await assessmentControl({ action: 'inspect' })).waiting).toBe(0);
  await page.waitForTimeout(50);
  expectDraftFinalizeFailure(await assessmentControl({ action: 'inspect' }));
  await expect(page.getByText('Assessed & Scored', { exact: true })).toHaveCount(0);
  await exitAssessment();

  await resetAssessment('missing-readback', true);
  await expect(completeV1()).rejects.toThrow('V1_ASSESSMENT_READBACK_MISSING');
  const missingReadback = await assessmentControl({ action: 'inspect' });
  expect(missingReadback.status).toBe('Ready for Review');
  expect(missingReadback.finalizedReadbacks).toBe(1);
  expect(missingReadback.commandTypes.at(-1)).toBe('assessment.finalize');
  expect(missingReadback.commandTypes.filter(type => type === 'assessment.finalize')).toHaveLength(1);
  expect(missingReadback.commandTypes.slice(0, -1).every(type => type === 'assessment.response.upsert')).toBe(true);
  expect(missingReadback.version).toBe(missingReadback.commandTypes.length + 1);
  await expect(page.getByText('Assessed & Scored', { exact: true })).toHaveCount(0);
  await exitAssessment();
  await assertAssessmentOnlyObservation();
  return;
  }

  if (contractPhase === 'assessment-positives') {
  await resetAssessment('single-readback', true);
  const existingDraftCompletion = await completePositiveV1('actual-app:v1-existing-draft-success');
  expect(existingDraftCompletion.commandTypes[0]).toBe('assessment.response.upsert');
  expect(existingDraftCompletion.commandTypes.at(-1)).toBe('assessment.finalize');
  expect(existingDraftCompletion.commandTypes.includes('assessment.create')).toBe(false);
  expect(existingDraftCompletion.commandTypes.filter(type => type === 'assessment.finalize')).toHaveLength(1);
  expect(existingDraftCompletion.commandTypes.slice(0, -1)
    .every(type => type === 'assessment.response.upsert')).toBe(true);
  expect(await existingDraftCompletion.finalizationActionId).toMatch(/^sha256:[a-f0-9]{64}$/u);
  const completedExistingDraft = await assessmentControl({ action: 'inspect' });
  expect(completedExistingDraft.status).toBe('Ready for Review');
  expect(completedExistingDraft.finalizedReadbacks).toBe(1);
  expect(completedExistingDraft.commandTypes).toEqual(existingDraftCompletion.commandTypes);
  expect(completedExistingDraft.version).toBe(completedExistingDraft.commandTypes.length + 1);
  await exitAssessment();

  await resetAssessment('single-readback', false);
  const v1Completion = await completePositiveV1('actual-app:v1-create-if-needed-success');
  expect(v1Completion.commandTypes[0]).toBe('assessment.create');
  expect(v1Completion.commandTypes.at(-1)).toBe('assessment.finalize');
  expect(v1Completion.commandTypes.filter(type => type === 'assessment.create')).toHaveLength(1);
  expect(v1Completion.commandTypes.filter(type => type === 'assessment.finalize')).toHaveLength(1);
  expect(v1Completion.commandTypes.slice(1, -1).every(type => type === 'assessment.response.upsert')).toBe(true);
  expect(v1Completion.logicalMutations).toBe(1);
  expect(await v1Completion.finalizationActionId).toMatch(/^sha256:[a-f0-9]{64}$/u);
  const completedAssessment = await assessmentControl({ action: 'inspect' });
  expect(completedAssessment.status).toBe('Ready for Review');
  expect(completedAssessment.finalizedReadbacks).toBe(1);
  expect(completedAssessment.commandTypes).toEqual(v1Completion.commandTypes);
  expect(completedAssessment.version).toBe(completedAssessment.commandTypes.length);
  await exitAssessment();
  await assertAssessmentOnlyObservation();
  return;
  }
  if (contractPhase !== 'safety') {
    throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_CONTRACT_PHASE_UNREACHABLE');
  }
  await networkActionTail;
  if (networkActionError) throw networkActionError;

  const beforeSafetyFrame = await authenticatedLifecycleControl<{
    targetHash: string; receipts: number; audits: number; processVersion: number;
  }>('/control/process-frame', { projectName });
  await page.getByRole('button', { name: 'Edit process details', exact: true }).click();
  const safetyName = `${setup.aliases.process} safety-002`;
  await page.getByLabel('Process name', { exact: true }).fill(safetyName);
  const beforeSafetyObservation = await authenticatedLifecycleControl<{
    processCommandRequests: number; controlSequence: string[];
  }>('/control/sign-in-entry-observation', { projectName });
  await authenticatedLifecycleControl('/control/sign-in-entry-observe-gate', {
    projectName,
    mode: 'hold-next',
  });
  const safetyRoute = async (route: Route) => {
    try {
      await networkTracker.begin(route.request());
      const requestBody = route.request().postDataJSON();
      const headers = await route.request().allHeaders();
      await authenticatedLifecycleControl('/control/arm-browser-fault', {
        projectName,
        persona: 'author',
        kind: 'process_server_error_precommit',
        commandType: requestBody.commandType ?? 'process.update',
        requestBody,
        accessToken: (headers.authorization ?? '').replace(/^Bearer\s+/iu, ''),
      });
    } catch (error) {
      if (!networkActionError) networkActionError = error;
      await route.abort('failed');
      return;
    }
    await route.fallback();
  };
  await page.route('**/functions/v1/process-command', safetyRoute);
  const safetyResponsePromise = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/functions/v1/process-command');
  const safetySave = page.getByRole('button', { name: 'Save process details', exact: true }).click();
  await expect.poll(async () => (await authenticatedLifecycleControl<{
    controlSequence: string[];
  }>('/control/sign-in-entry-observation', { projectName })).controlSequence
    .slice(beforeSafetyObservation.controlSequence.length).includes('observe-held')).toBe(true);
  const heldSafetyObservation = await authenticatedLifecycleControl<{
    processCommandRequests: number; permits: unknown[];
  }>('/control/sign-in-entry-observation', { projectName });
  expect(heldSafetyObservation.processCommandRequests).toBe(beforeSafetyObservation.processCommandRequests);
  expect(heldSafetyObservation.permits).toEqual([]);
  await authenticatedLifecycleControl('/control/sign-in-entry-observe-gate', {
    projectName,
    mode: 'release',
  });
  const safetyResponse = await safetyResponsePromise;
  await safetySave;
  expect(safetyResponse.status()).toBe(503);
  expect(await safetyResponse.json()).toEqual({ ok: false, error: {
    code: 'COMMAND_UNAVAILABLE', message: 'Process update could not be completed.',
  } });
  await networkActionTail;
  if (networkActionError) throw networkActionError;
  await page.unroute('**/functions/v1/process-command', safetyRoute);
  await expect(page.getByText(
    'Process update could not be confirmed. Your edits are still available to retry.',
    { exact: true },
  )).toBeVisible();
  await expect(page.getByLabel('Process name', { exact: true })).toHaveValue(safetyName);
  const afterSafetyFrame = await authenticatedLifecycleControl('/control/process-frame', { projectName });
  expect(afterSafetyFrame).toEqual(beforeSafetyFrame);
  const afterSafetyObservation = await authenticatedLifecycleControl<{
    processCommandRequests: number;
    processAtomicCalls: number;
    permits: Array<{ state: string; consumed: number }>;
    controlSequence: string[];
    actions: Array<{ route: string; complete: boolean; status: number | null }>;
  }>('/control/sign-in-entry-observation', { projectName });
  expect(afterSafetyObservation.processCommandRequests).toBe(beforeSafetyObservation.processCommandRequests + 1);
  expect(afterSafetyObservation.processAtomicCalls).toBe(0);
  expect(afterSafetyObservation.permits).toEqual([
    expect.objectContaining({ state: 'consumed', consumed: 1 }),
  ]);
  const safetySequence = afterSafetyObservation.controlSequence.slice(beforeSafetyObservation.controlSequence.length);
  expect(safetySequence.indexOf('observe-held')).toBeLessThan(safetySequence.indexOf('observe-released'));
  expect(safetySequence.indexOf('observe-released')).toBeLessThan(safetySequence.indexOf('permit-arm'));
  expect(safetySequence.indexOf('permit-arm')).toBeLessThan(safetySequence.indexOf('backend-arrival'));
  expect(safetySequence.indexOf('backend-arrival')).toBeLessThan(safetySequence.indexOf('permit-consume'));
  expect(safetySequence.indexOf('permit-consume')).toBeLessThan(safetySequence.indexOf('action-finish'));
  expect(afterSafetyObservation.actions.filter(action => action.route === '/functions/v1/process-command'
    && action.status === 503)).toHaveLength(1);

  const boundedControl = createAuthenticatedLifecycleControl({
    baseUrl: process.env.ENTERPRISE_LIFECYCLE_CONTROL_URL ?? '',
    token: process.env.ENTERPRISE_LIFECYCLE_CONTROL_TOKEN ?? '',
    timeoutMs: 50,
    runOperation: (title, operation) => test.step(title, operation),
  });
  await authenticatedLifecycleControl('/control/sign-in-entry-arm-gate', {
    projectName,
    mode: 'stall-next',
  });
  let stalledArmFailure: unknown = null;
  const stalledRoute = async (route: Route) => {
    try {
      await networkTracker.begin(route.request());
      const requestBody = route.request().postDataJSON();
      const headers = await route.request().allHeaders();
      await boundedControl('/control/arm-browser-fault', {
        projectName,
        persona: 'author',
        kind: 'process_server_error_precommit',
        commandType: requestBody.commandType ?? 'process.update',
        requestBody,
        accessToken: (headers.authorization ?? '').replace(/^Bearer\s+/iu, ''),
      });
      stalledArmFailure = new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_STALLED_ARM_DISPATCHED');
      await route.fallback();
    } catch (error) {
      stalledArmFailure = error;
      await route.abort('failed');
    }
  };
  const beforeStalledCommands = afterSafetyObservation.processCommandRequests;
  await page.route('**/functions/v1/process-command', stalledRoute);
  await page.getByRole('button', { name: 'Save process details', exact: true }).click();
  await expect.poll(() => stalledArmFailure instanceof Error).toBe(true);
  expect((stalledArmFailure as Error).message).toBe('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TIMEOUT');
  const stalledObservation = await authenticatedLifecycleControl<{
    processCommandRequests: number; processAtomicCalls: number;
    permits: Array<{ state: string; consumed: number }>;
  }>('/control/sign-in-entry-observation', { projectName });
  expect(stalledObservation.processCommandRequests).toBe(beforeStalledCommands);
  expect(stalledObservation.processAtomicCalls).toBe(0);
  expect(stalledObservation.permits).toEqual([expect.objectContaining({ state: 'armed', consumed: 0 })]);
  await authenticatedLifecycleControl('/control/sign-in-entry-arm-gate', { projectName, mode: 'release' });
  await expect.poll(async () => (await authenticatedLifecycleControl<{
    controlSequence: string[];
  }>('/control/sign-in-entry-observation', { projectName })).controlSequence.includes('permit-arm-released')).toBe(true);
  await page.unroute('**/functions/v1/process-command', stalledRoute);
  await networkActionTail;
  if (networkActionError) throw networkActionError;
  await page.getByRole('button', { name: 'Cancel editing', exact: true }).click();
  const storedSessions = await page.evaluate(() => Object.entries(localStorage)
    .filter(([key]) => key.startsWith('sb-'))
    .map(([key, value]) => ({ key, value: JSON.parse(value) })));
  expect(storedSessions).toHaveLength(1);
  const storedAccessToken = storedSessions[0]?.value.access_token ?? storedSessions[0]?.value.currentSession?.access_token;
  const storedClaims = JSON.parse(Buffer.from(String(storedAccessToken).split('.')[1] ?? '', 'base64url').toString('utf8'));
  expect(storedClaims.sub).toBe(actor(projectName, 'A').user.id);

  const observation = await authenticatedLifecycleControl<{
    passwordRequests: unknown[];
    diagnostic: unknown;
    bindings: unknown[];
    actions: Array<{ route: string; persona: string; complete: boolean; status: number | null; actorHash: string; sessionHash: string }>;
    processCommandRequests: number;
    anonymousProcessCommandRequests: number;
    browserCases: number;
    serverCases: number;
  }>('/control/sign-in-entry-observation', { projectName });
  expect(observation).toMatchObject({
    passwordRequests: [
      { actor: 'A', outcome: 'accepted' },
    ],
    diagnostic: null,
    bindings: [
      { actor: 'A', persona: 'author' },
    ],
  });
  const processActions = observation.actions.filter(action => action.route === '/functions/v1/process-command');
  expect(processActions).toHaveLength(2);
  expect(processActions).toEqual([
    expect.objectContaining({ persona: 'author', complete: true, status: 503 }),
    expect.objectContaining({ persona: 'author', complete: true, status: 0 }),
  ]);
  expect(observation.processCommandRequests).toBe(1);
  expect(observation.anonymousProcessCommandRequests).toBe(0);
  expect(observation.actions.every(action => action.route !== '/rest/v1/rpc/pr_c_controlled_human_public_attestation'
    && !action.route.startsWith('/auth/'))).toBe(true);
  expect(observation.browserCases).toBe(0);
  expect(observation.serverCases).toBe(0);

  await authenticatedLifecycleEnterAs(page, actor(projectName, 'A'), settleActorTransitionEvidence);
  await networkActionTail;
  if (networkActionError) throw networkActionError;
  await authenticatedLifecycleControl('/control/sign-in-entry-process-duplicate', { projectName, enabled: true });
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Process Catalog', exact: true })).toBeVisible();
    await expect(authenticatedLifecycleOpenConnectedProcess(page, setup.aliases.process))
      .rejects.toThrow('ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_AMBIGUOUS');
    await expect(page.getByTestId('assess-v2-workspace')).toHaveCount(0);
  } finally {
    await authenticatedLifecycleControl('/control/sign-in-entry-process-duplicate', { projectName, enabled: false });
  }
  await settleActorTransitionEvidence();
  expect(observedHttpRequests).toBeGreaterThan(0);
  expect(proxiedOrigins.length).toBeGreaterThan(0);
  expect(proxiedOrigins.every(origin => origin === appOrigin || origin === apiOrigin)).toBe(true);
  expect(unexpectedOrigins).toEqual([]);
  expect(pageErrors).toEqual([]);
});
