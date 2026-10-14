import { expect, test, type Route } from '@playwright/test';
import { AuthenticatedHostedBrowserActionTracker } from '../../scripts/authenticatedHostedBrowserRequestClassifier.mjs';
import {
  authenticatedLifecycleControl,
  authenticatedLifecycleAttemptUnauthorizedProcessUpdate,
  authenticatedLifecycleEnterAs,
  authenticatedLifecycleOpenConnectedProcess,
  authenticatedLifecycleValidateSetupLabels,
  type AuthenticatedLifecycleActor,
} from './authenticatedLifecycleHarness';
import { installAuthenticatedHostedNetwork } from './authenticatedHostedNetwork';

const appOrigin = new URL(process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_APP_URL ?? '').origin;
const apiOrigin = new URL(process.env.ENTERPRISE_LIFECYCLE_API_BASE_URL ?? '').origin;
const localAppOrigin = new URL(process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_LOCAL_APP_URL ?? '').origin;
const localApiOrigin = new URL(process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_LOCAL_BACKEND_URL ?? '').origin;
const processSeedMode = process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROCESS_SEED_MODE ?? '';
const syntheticProjectRef = 'abcdefghijklmnopqrst';
if (appOrigin !== 'https://deploy-preview-264--avalaos-pilot.netlify.app'
  || apiOrigin !== `https://${syntheticProjectRef}.supabase.co`
  || !/^http:\/\/127[.]0[.]0[.]1:\d+$/u.test(localAppOrigin)
  || !/^http:\/\/127[.]0[.]0[.]1:\d+$/u.test(localApiOrigin)
  || !['valid', 'nullable-reproduction'].includes(processSeedMode)) {
  throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROXY_BINDING_REJECTED');
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

test.beforeEach(async ({ context }) => {
  await context.route('**/*', route => route.abort('blockedbyclient'));
});

const dispatchToLocalProxy = async (route: Route) => {
  const request = route.request();
  const requested = new URL(request.url());
  const targetOrigin = requested.origin === appOrigin ? localAppOrigin
    : requested.origin === apiOrigin ? localApiOrigin : null;
  if (!targetOrigin) throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROXY_ORIGIN_REJECTED');
  const headers = await request.allHeaders();
  for (const name of ['host', 'content-length', 'accept-encoding']) delete headers[name];
  const response = await fetch(`${targetOrigin}${requested.pathname}${requested.search}`, {
    method: request.method(),
    headers,
    body: ['GET', 'HEAD'].includes(request.method()) ? undefined : request.postDataBuffer(),
    redirect: 'manual',
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROXY_REDIRECT_REJECTED');
  }
  const responseHeaders = Object.fromEntries(response.headers);
  for (const name of ['content-encoding', 'content-length', 'transfer-encoding']) delete responseHeaders[name];
  await route.fulfill({ status: response.status, headers: responseHeaders, body: Buffer.from(await response.arrayBuffer()) });
};

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
  const queueNetworkAction = (operation: () => Promise<unknown>) => {
    networkActionTail = networkActionTail.then(operation).catch(error => {
      if (!networkActionError) networkActionError = error;
    });
  };
  const tracker = new AuthenticatedHostedBrowserActionTracker({
    backendOrigin: apiOrigin,
    appOrigin,
    startAction: input => authenticatedLifecycleControl<{ actionId: string }>('/control/browser-action-start', {
      projectName,
      ...input,
    }),
    finishAction: input => authenticatedLifecycleControl('/control/browser-action', { projectName, ...input }),
  });
  await installAuthenticatedHostedNetwork({
    context: page.context(),
    hosted: true,
    allowedOrigins: new Set([appOrigin, apiOrigin]),
    tracker,
    queueNetworkAction,
    onExternalRequest: origin => unexpectedOrigins.push(origin),
    onHttpRequest: () => { observedHttpRequests += 1; },
    onTrackerError: error => { if (!networkActionError) networkActionError = error; },
    dispatchAllowedRequest: async route => {
      proxiedOrigins.push(new URL(route.request().url()).origin);
      await dispatchToLocalProxy(route);
    },
  });
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.name));

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
  await networkActionTail;
  expect(networkActionError).toBeInstanceOf(Error);
  expect((networkActionError as Error).message).toBe('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_SESSION_REJECTED');
  networkActionError = null;
  const anonymousObservation = await authenticatedLifecycleControl<{
    actions: unknown[]; anonymousProcessCommandRequests: number;
  }>('/control/sign-in-entry-observation', { projectName });
  expect(anonymousObservation.actions).toEqual([]);
  expect(anonymousObservation.anonymousProcessCommandRequests).toBe(0);

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

  await expect(authenticatedLifecycleEnterAs(page, actor(projectName, 'rejected')))
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

  await authenticatedLifecycleEnterAs(page, actor(projectName, 'A'));
  await authenticatedLifecycleEnterAs(page, actor(projectName, 'B'));
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
  let selectedProcessId: string;
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
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: setup.aliases.process, exact: true })).toBeVisible();
  await expect(page.getByTestId('process-edit-form')).toHaveCount(0);
  await authenticatedLifecycleEnterAs(page, actor(projectName, 'A'));
  await networkActionTail;
  if (networkActionError) throw networkActionError;
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
  const deniedActions = observation.actions.filter(action => action.route === '/functions/v1/process-command');
  expect(deniedActions).toHaveLength(1);
  expect(deniedActions[0]).toMatchObject({ persona: 'reviewer', complete: true, status: 403 });
  expect(observation.processCommandRequests).toBe(1);
  expect(observation.anonymousProcessCommandRequests).toBe(0);
  expect(observation.actions.every(action => action.route !== '/rest/v1/rpc/pr_c_controlled_human_public_attestation'
    && !action.route.startsWith('/auth/'))).toBe(true);
  expect(observation.browserCases).toBe(0);
  expect(observation.serverCases).toBe(0);

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
  await networkActionTail;
  if (networkActionError) throw networkActionError;
  expect(observedHttpRequests).toBeGreaterThan(0);
  expect(proxiedOrigins.length).toBeGreaterThan(0);
  expect(proxiedOrigins.every(origin => origin === appOrigin || origin === apiOrigin)).toBe(true);
  expect(unexpectedOrigins).toEqual([]);
  expect(pageErrors).toEqual([]);
});
