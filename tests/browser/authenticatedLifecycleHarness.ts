import { expect, test, type Locator, type Page, type Request, type Response as PlaywrightResponse } from '@playwright/test';
import { StorageKeys } from '../../services/storage';
import { hasDurableProductNavigationAgreement, parseProductNavigationSearch } from '../../services/productNavigationState';
import { areScopesEqual, isValidScope } from '../../services/viewStatePersistence';
import { ScopeType, View, type Scope } from '../../types';
import { openProductNavigation } from './productNavigationReadiness';

export const authenticatedHostedActionIds: unique symbol = Symbol('authenticatedHostedActionIds');

export type AuthenticatedLifecycleActor = Readonly<{
  token: string;
  authKind?: 'fixture_transport' | 'supabase_auth';
  persona?: 'author' | 'reviewer' | 'approver' | 'outsider';
  projectName?: string;
  password?: string;
  user: Readonly<{ id: string; email: string }>;
}>;

type AuthenticatedLifecycleEntryObservation = Readonly<{
  onHostedSessionPending?: () => void;
}>;

export type AuthenticatedLifecycleSetup = Readonly<{
  executionId: string;
  journeyBinding: string;
  projectName: string;
  deliveryProject: Readonly<{ id: string; name: string }>;
  aliases: Readonly<Record<'case' | 'review' | 'handoff' | 'artifact' | 'process', string>>;
  studioTemplate: AuthenticatedLifecycleStudioTemplateBinding;
  actors: Readonly<Record<'author' | 'reviewer' | 'approver' | 'outsider', AuthenticatedLifecycleActor> & { deliveryOwner?: AuthenticatedLifecycleActor }>;
}>;

export type AuthenticatedLifecycleStudioTemplateBinding = Readonly<{
  kind: 'system';
  artifactType: 'brd';
  templateVersionId: string;
  version: string;
}>;

type AuthenticatedLifecycleStudioTemplateOption = Readonly<{ value: string; label: string }>;

export const authenticatedLifecycleValidateStudioTemplateBinding = (
  value: unknown,
): AuthenticatedLifecycleStudioTemplateBinding => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_STUDIO_TEMPLATE_BINDING_REJECTED');
  }
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  if (JSON.stringify(keys) !== JSON.stringify(['artifactType','kind','templateVersionId','version'])
    || candidate.kind !== 'system' || candidate.artifactType !== 'brd'
    || typeof candidate.templateVersionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(candidate.templateVersionId)
    || typeof candidate.version !== 'string' || candidate.version.length < 1 || candidate.version.length > 128
    || !/^[A-Za-z0-9._:-]+$/u.test(candidate.version)) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_STUDIO_TEMPLATE_BINDING_REJECTED');
  }
  return Object.freeze({ kind:'system', artifactType:'brd', templateVersionId:candidate.templateVersionId,
    version:candidate.version });
};

export const authenticatedLifecycleResolveStudioTemplateOption = (
  binding: unknown,
  options: readonly AuthenticatedLifecycleStudioTemplateOption[],
) => {
  const expected = authenticatedLifecycleValidateStudioTemplateBinding(binding);
  if (!Array.isArray(options) || options.some(option => option === null || typeof option !== 'object'
    || typeof option.value !== 'string' || typeof option.label !== 'string')) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_STUDIO_TEMPLATE_OPTIONS_REJECTED');
  }
  const matches = options.filter(option => option.value === expected.templateVersionId);
  const label = `System BRD · v${expected.version} · ${expected.templateVersionId}`;
  if (matches.length !== 1 || matches[0].label !== label) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_STUDIO_TEMPLATE_OPTIONS_REJECTED');
  }
  return Object.freeze({ value:expected.templateVersionId, label });
};

export const authenticatedLifecycleSelectExactStudioTemplate = async (
  template: Locator,
  binding: unknown,
) => {
  const expected = authenticatedLifecycleValidateStudioTemplateBinding(binding);
  await expect(template.locator(`option[value="${expected.templateVersionId}"]`)).toHaveCount(1, {
    timeout:15_000,
  });
  const options = await template.locator('option').evaluateAll(nodes => nodes
    .map(node => ({ value:(node as HTMLOptionElement).value, label:(node as HTMLOptionElement).label }))
    .filter(option => option.value.length > 0));
  const selected = authenticatedLifecycleResolveStudioTemplateOption(expected, options);
  await template.selectOption({ value:selected.value, label:selected.label }, { timeout:15_000 });
  await expect(template).toHaveValue(selected.value, { timeout:15_000 });
  return selected;
};

const hostedSetupSuffix = /^\[run ([1-9][0-9]{0,19})[.]([1-9][0-9]{0,15}) ([a-f0-9]{12})\]$/u;

export const authenticatedLifecycleValidateSetupLabels = (
  setup: Readonly<{
    projectName: string;
    deliveryProject: Readonly<{ name: string }>;
    aliases: Readonly<{ process: string }>;
  }>,
  projectName: string,
  hosted: boolean,
) => {
  const processPrefix = `${projectName} connected lifecycle`;
  const deliveryPrefix = `${projectName} delivery project`;
  const processName = setup?.aliases?.process;
  const deliveryProjectName = setup?.deliveryProject?.name;
  if (setup?.projectName !== projectName || typeof processName !== 'string'
    || typeof deliveryProjectName !== 'string') {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_SETUP_LABELS_REJECTED');
  }
  if (!hosted) {
    if (processName !== processPrefix || deliveryProjectName !== deliveryPrefix) {
      throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_SETUP_LABELS_REJECTED');
    }
    return Object.freeze({ processName, deliveryProjectName, suffix: null });
  }
  const processSuffix = processName.startsWith(`${processPrefix} `)
    ? processName.slice(processPrefix.length + 1) : '';
  const deliverySuffix = deliveryProjectName.startsWith(`${deliveryPrefix} `)
    ? deliveryProjectName.slice(deliveryPrefix.length + 1) : '';
  const match = hostedSetupSuffix.exec(processSuffix);
  if (!match || deliverySuffix !== processSuffix || !Number.isSafeInteger(Number(match[2]))) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_SETUP_LABELS_REJECTED');
  }
  return Object.freeze({ processName, deliveryProjectName, suffix: processSuffix });
};

const controlToken = process.env.ENTERPRISE_LIFECYCLE_CONTROL_TOKEN ?? '';
const apiBaseUrl = process.env.ENTERPRISE_LIFECYCLE_API_BASE_URL ?? '';
const controlBaseUrl = process.env.ENTERPRISE_LIFECYCLE_CONTROL_URL ?? apiBaseUrl;
const authStorageKey = process.env.ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY ?? 'sb-127-auth-token';
const hostedRealAuth = process.env.ENTERPRISE_LIFECYCLE_HOSTED_REAL_AUTH === 'true';
type AuthenticatedLifecycleStoredSession = Readonly<{
  key: string;
  value: string;
  accessToken: string;
  actorId: string;
  sessionId: string;
}>;
const hostedSessionCache = new Map<string, AuthenticatedLifecycleStoredSession>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const hostedRealAuthSessionLimitMs = 15_000;
const identityUpstreamCodes = new Set([
  'bad_jwt', 'email_address_invalid', 'email_address_not_authorized', 'email_not_confirmed', 'invalid_credentials',
  'not_admin', 'over_email_send_rate_limit', 'over_request_rate_limit', 'signup_disabled', 'user_already_exists',
  'user_banned', 'validation_failed',
]);

const required = (value: string, name: string) => {
  if (!value) throw new Error(`ENTERPRISE_LIFECYCLE_BROWSER_${name}_REQUIRED`);
  return value;
};

const loopbackBaseUrl = (value: string) => {
  const url = new URL(required(value, 'API_BASE_URL'));
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_NON_LOOPBACK_API_REJECTED');
  }
  return url.toString().replace(/\/$/u, '');
};

const boundedControlFailure = (payload: unknown) => {
  const controllerCode = payload && typeof payload === 'object' && !Array.isArray(payload)
    && typeof (payload as { error?: unknown }).error === 'string'
    ? (payload as { error: string }).error : '';
  if (/^AUTHENTICATED_HOSTED_CONTROLLER_(?:SESSION_|BROWSER_ACTION_SESSION_)/u.test(controllerCode)) {
    return 'ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_SESSION_REJECTED';
  }
  if (/^AUTHENTICATED_HOSTED_CONTROLLER_PERMIT_/u.test(controllerCode)) {
    return 'ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_PERMIT_REJECTED';
  }
  if (/^AUTHENTICATED_HOSTED_CONTROLLER_(?:BROWSER_ACTION_|AUTHORITY_FRAME_)/u.test(controllerCode)) {
    return 'ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_ACTION_REJECTED';
  }
  return 'ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_REJECTED';
};

const authenticatedLifecycleControlTimeoutMs = 30_000;
const authenticatedLifecycleControlStepTitles = Object.freeze<Record<string, string>>({
  '/control/setup': 'hosted:control:setup',
  '/control/bind-browser-session': 'hosted:control:session-bind',
  '/control/browser-action-start': 'hosted:control:action-start',
  '/control/browser-action': 'hosted:control:action-finish',
  '/control/browser-case': 'hosted:control:case-submit',
  '/control/arm-browser-fault': 'hosted:control:permit-arm',
  '/control/process-frame': 'hosted:control:observe',
  '/control/lifecycle-frame': 'hosted:control:observe',
  '/control/studio-failure-frame': 'hosted:control:observe',
  '/control/assess-v2-frame': 'hosted:control:observe',
  '/control/snapshot': 'hosted:control:observe',
  '/control/sign-in-entry-observation': 'hosted:control:observe',
});
const authenticatedLifecycleControlStepTitle = (pathname: string) =>
  authenticatedLifecycleControlStepTitles[pathname] ?? 'hosted:control:other';

type AuthenticatedLifecycleControlOperationRunner = <T>(title: string, operation: () => Promise<T>) => Promise<T>;

export const createAuthenticatedLifecycleControl = ({
  baseUrl,
  token,
  fetchImpl = fetch,
  timeoutMs = authenticatedLifecycleControlTimeoutMs,
  runOperation = async (_title, operation) => operation(),
}: Readonly<{
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  runOperation?: AuthenticatedLifecycleControlOperationRunner;
}>) => async <T>(
  pathname: string,
  body?: unknown,
): Promise<T> => runOperation(authenticatedLifecycleControlStepTitle(pathname), async () => {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > authenticatedLifecycleControlTimeoutMs) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TIMEOUT_REJECTED');
  }
  const target = `${loopbackBaseUrl(baseUrl)}${pathname}`;
  const controlHeader = required(token, 'CONTROL_TOKEN');
  const abort = new AbortController();
  const timeoutError = new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TIMEOUT');
  let timedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'expired'>(resolve => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      abort.abort();
      resolve('expired');
    }, timeoutMs);
  });
  const settleOwned = async <Value>(operation: Promise<Value>): Promise<Value> => {
    const settled = operation.then(
      value => Object.freeze({ state: 'fulfilled' as const, value }),
      error => Object.freeze({ state: 'rejected' as const, error }),
    );
    const first = await Promise.race([settled.then(() => 'settled' as const), timeout]);
    if (first === 'expired') {
      let cleanupHandle: ReturnType<typeof setTimeout> | undefined;
      const cleanupExpired = new Promise<'expired'>(resolve => {
        cleanupHandle = setTimeout(() => resolve('expired'), timeoutMs);
      });
      if (await Promise.race([settled.then(() => 'settled' as const), cleanupExpired]) === 'expired') {
        throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_CLEANUP_INCOMPLETE');
      }
      if (cleanupHandle !== undefined) clearTimeout(cleanupHandle);
      await settled;
      throw timeoutError;
    }
    const result = await settled;
    if (result.state === 'rejected') throw result.error;
    return result.value;
  };
  let response: Response;
  try {
    response = await settleOwned(fetchImpl(target, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        'x-enterprise-lifecycle-control': controlHeader,
      },
      signal: abort.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
  } catch (error) {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    if (error instanceof Error && error.message === 'ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_CLEANUP_INCOMPLETE') throw error;
    if (timedOut) throw timeoutError;
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TRANSPORT_REJECTED');
  }
  let payload: unknown;
  try {
    payload = await settleOwned(response.json());
  } catch (error) {
    if (error instanceof Error && error.message === 'ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_CLEANUP_INCOMPLETE') throw error;
    if (timedOut) throw timeoutError;
    if (!response.ok) payload = null;
    else throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_RESPONSE_REJECTED');
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
  if (!response.ok) throw new Error(boundedControlFailure(payload));
  return payload as T;
});

export const authenticatedLifecycleControl = createAuthenticatedLifecycleControl({
  baseUrl: controlBaseUrl,
  token: controlToken,
  runOperation: (title, operation) => test.step(title, operation),
});

export type AuthenticatedLifecycleWorkQueue = Readonly<{
  enqueue: (operation: () => Promise<unknown>, ownedWork?: Promise<unknown>) => void;
  drain: () => Promise<void>;
}>;

export const createAuthenticatedLifecycleWorkQueue = (): AuthenticatedLifecycleWorkQueue => {
  let tail: Promise<void> = Promise.resolve();
  let hasFailure = false;
  let firstFailure: unknown;
  const enqueue = (operation: () => Promise<unknown>, ownedWork?: Promise<unknown>) => {
    // Attach settlement handlers immediately so eagerly-started browser work
    // remains owned even when an earlier queued action fails. At this queue
    // position we join that work, but preserve the first failure and never run
    // a later controller commit after failure.
    const ownedSettlement = ownedWork
      ? Promise.resolve(ownedWork).then(() => undefined, () => undefined)
      : Promise.resolve();
    const work = tail.then(async () => {
      await ownedSettlement;
      if (!hasFailure) await operation();
    });
    tail = work.catch(error => {
      if (!hasFailure) {
        hasFailure = true;
        firstFailure = error instanceof Error
          ? error : new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_REJECTED');
      }
    });
  };
  const drain = async () => {
    for (;;) {
      const snapshot = tail;
      await snapshot;
      if (snapshot === tail) break;
    }
    if (hasFailure) throw firstFailure;
  };
  return Object.freeze({ enqueue, drain });
};

const reportIdentityDiagnostic = async (
  projectName: string,
  category: 'CREDENTIAL_REJECTED' | 'ACCESS_DENIED' | 'IDENTITY_ENDPOINT_MISSING' | 'IDENTITY_CONFLICT'
    | 'IDENTITY_INPUT_REJECTED' | 'RATE_LIMITED' | 'UPSTREAM_UNAVAILABLE' | 'TRANSPORT_FAILURE' | 'SESSION_MISSING',
  upstreamCode?: string,
) => {
  await authenticatedLifecycleControl('/control/browser-diagnostic', {
    projectName,
    diagnostic: { operation: 'SIGN_IN', category,
      ...(upstreamCode && identityUpstreamCodes.has(upstreamCode) ? { upstreamCode } : {}) },
  }).catch(() => undefined);
};
const identityCategoryForStatus = (status: number) => status === 400 ? 'IDENTITY_INPUT_REJECTED' as const
  : status === 401 ? 'CREDENTIAL_REJECTED' as const : status === 403 ? 'ACCESS_DENIED' as const
    : status === 404 ? 'IDENTITY_ENDPOINT_MISSING' as const
      : status === 409 ? 'IDENTITY_CONFLICT' as const
        : status === 422 ? 'IDENTITY_INPUT_REJECTED' as const
          : status === 429 ? 'RATE_LIMITED' as const
            : status >= 500 && status <= 599 ? 'UPSTREAM_UNAVAILABLE' as const : 'TRANSPORT_FAILURE' as const;

export const authenticatedLifecycleExpectedAuthStorageKey = (backendUrl: string) => {
  try {
    const backend = new URL(backendUrl);
    const match = /^([a-z0-9]{20})[.]supabase[.]co$/u.exec(backend.hostname);
    if (backend.protocol === 'https:' && match && !backend.username && !backend.password && !backend.port
      && backend.pathname === '/' && !backend.search && !backend.hash) {
      return `sb-${match[1]}-auth-token`;
    }
  } catch {
    // Normalize malformed and non-Supabase inputs to the same fail-closed boundary.
  }
  throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_REAL_AUTH_STORAGE_KEY_REJECTED');
};

export const authenticatedLifecycleValidateStoredSession = (
  entries: ReadonlyArray<Readonly<{ key: string; value: string }>>,
  expectedKey: string,
  expectedActorId: string,
  expectedSessionId?: string,
): AuthenticatedLifecycleStoredSession => {
  if (entries.length !== 1 || entries[0]?.key !== expectedKey || !entries[0].value || !uuid.test(expectedActorId)) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_REAL_AUTH_SESSION_REJECTED');
  }
  try {
    const stored = JSON.parse(entries[0].value) as Record<string, unknown>;
    const currentSession = stored.currentSession && typeof stored.currentSession === 'object'
      ? stored.currentSession as Record<string, unknown> : stored;
    const user = currentSession.user && typeof currentSession.user === 'object'
      ? currentSession.user as Record<string, unknown> : null;
    const accessToken = currentSession.access_token;
    if (typeof accessToken !== 'string' || !accessToken || user?.id !== expectedActorId) {
      throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_REAL_AUTH_SESSION_REJECTED');
    }
    const encoded = accessToken.split('.')[1] ?? '';
    const normalized = encoded.replace(/-/gu, '+').replace(/_/gu, '/');
    const claims = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as Record<string, unknown>;
    const sessionId = claims.session_id;
    if (claims.sub !== expectedActorId || typeof sessionId !== 'string' || !uuid.test(sessionId)
      || (expectedSessionId !== undefined && sessionId !== expectedSessionId)) {
      throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_REAL_AUTH_SESSION_REJECTED');
    }
    return Object.freeze({ key: entries[0].key, value: entries[0].value,
      accessToken, actorId: expectedActorId, sessionId });
  } catch (error) {
    if (error instanceof Error && error.message === 'ENTERPRISE_LIFECYCLE_BROWSER_REAL_AUTH_SESSION_REJECTED') {
      throw error;
    }
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_REAL_AUTH_SESSION_REJECTED');
  }
};

const authenticatedLifecycleReadStoredSession = async (
  page: Page,
  expectedKey: string,
  expectedActorId: string,
  expectedSessionId?: string,
) => authenticatedLifecycleValidateStoredSession(await page.evaluate(() => Object.keys(localStorage)
  .filter(key => key.startsWith('sb-'))
  .map(key => ({ key, value: localStorage.getItem(key) || '' }))), expectedKey, expectedActorId, expectedSessionId);

const authenticatedLifecycleRemainingSessionMs = (deadline: number) => {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_REAL_AUTH_SESSION_REQUIRED');
  return remaining;
};

const sessionFor = (actor: AuthenticatedLifecycleActor) => ({
  access_token: actor.token,
  refresh_token: `${actor.token}-refresh`,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { ...actor.user, aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: { provider: 'fixture' } },
});

export const authenticatedLifecycleEnterAs = async (
  page: Page,
  actor: AuthenticatedLifecycleActor,
  beforeIntentionalNavigation: () => Promise<void> = async () => undefined,
  observation: AuthenticatedLifecycleEntryObservation = {},
) => {
  if (hostedRealAuth) {
    if (actor.authKind !== 'supabase_auth' || !actor.persona || !actor.projectName || !actor.password) {
      throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_REAL_AUTH_ACTOR_REQUIRED');
    }
    const expectedStorageKey = authenticatedLifecycleExpectedAuthStorageKey(required(apiBaseUrl, 'API_BASE_URL'));
    await test.step('hosted:actor:entry-initial', beforeIntentionalNavigation);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await test.step('hosted:actor:entry-canonical', beforeIntentionalNavigation);
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) if (key.startsWith('sb-')) localStorage.removeItem(key);
      localStorage.setItem('avalaos-core-v1-view', JSON.stringify('process_catalog'));
      localStorage.setItem('avalaos-core-v1-scope', JSON.stringify({ type: 'my_work' }));
    });
    await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
    const cacheKey = `${new URL(apiBaseUrl).origin}:${expectedStorageKey}:${actor.projectName}:${actor.user.id}:${actor.persona}`;
    const cached = hostedSessionCache.get(cacheKey);
    let sessionDeadline: number;
    if (cached) {
      sessionDeadline = Date.now() + hostedRealAuthSessionLimitMs;
      try {
        authenticatedLifecycleValidateStoredSession(
          [{ key: cached.key, value: cached.value }], expectedStorageKey, actor.user.id, cached.sessionId,
        );
      } catch {
        hostedSessionCache.delete(cacheKey);
        await reportIdentityDiagnostic(actor.projectName, 'SESSION_MISSING');
        throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_REAL_AUTH_SESSION_REQUIRED');
      }
      await test.step('hosted:actor:entry-cached', beforeIntentionalNavigation);
      await page.evaluate(({ key, value }) => localStorage.setItem(key, value), cached);
      await page.reload({ waitUntil: 'domcontentloaded',
        timeout: authenticatedLifecycleRemainingSessionMs(sessionDeadline) });
    } else {
      await expect(page.getByRole('heading', { name: 'Sign in securely', exact: true })).toBeVisible();
      await page.getByLabel('Work email', { exact: false }).fill(actor.user.email);
      await page.getByLabel('Password', { exact: true }).fill(actor.password);
      sessionDeadline = Date.now() + hostedRealAuthSessionLimitMs;
      const signInResponse = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname.endsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'password';
      }, { timeout: authenticatedLifecycleRemainingSessionMs(sessionDeadline) });
      let response;
      try {
        await page.getByRole('button', { name: 'Sign in to AvalaOS', exact: true }).click();
        response = await signInResponse;
      } catch {
        await reportIdentityDiagnostic(actor.projectName, 'TRANSPORT_FAILURE');
        throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_IDENTITY_TRANSPORT_FAILURE');
      }
      if (response.status() !== 200) {
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        const candidate = [body.error_code, body.code, body.error].find(value => typeof value === 'string');
        const upstreamCode = typeof candidate === 'string' && identityUpstreamCodes.has(candidate) ? candidate : undefined;
        const category = identityCategoryForStatus(response.status());
        await reportIdentityDiagnostic(actor.projectName, category, upstreamCode);
        throw new Error(`ENTERPRISE_LIFECYCLE_BROWSER_IDENTITY_${category}`);
      }
    }
    let stored: AuthenticatedLifecycleStoredSession | null = null;
    let pendingSessionObserved = false;
    try {
      await expect.poll(async () => {
        try {
          stored = await authenticatedLifecycleReadStoredSession(page, expectedStorageKey, actor.user.id,
            cached?.sessionId);
          return true;
        } catch {
          if (!pendingSessionObserved) {
            pendingSessionObserved = true;
            observation.onHostedSessionPending?.();
          }
          return false;
        }
      }, { timeout: authenticatedLifecycleRemainingSessionMs(sessionDeadline) }).toBe(true);
      await expect(page.getByRole('heading', { name: 'Sign in securely', exact: true }))
        .toHaveCount(0, { timeout: authenticatedLifecycleRemainingSessionMs(sessionDeadline) });
      stored = await authenticatedLifecycleReadStoredSession(page, expectedStorageKey, actor.user.id,
        cached?.sessionId);
    } catch {
      if (cached) hostedSessionCache.delete(cacheKey);
      await reportIdentityDiagnostic(actor.projectName, 'SESSION_MISSING');
      throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_REAL_AUTH_SESSION_REQUIRED');
    }
    if (!stored) {
      await reportIdentityDiagnostic(actor.projectName, 'SESSION_MISSING');
      throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_REAL_AUTH_SESSION_REQUIRED');
    }
    if (!cached) hostedSessionCache.set(cacheKey, stored);
    await authenticatedLifecycleControl('/control/bind-browser-session', {
      projectName: actor.projectName,
      persona: actor.persona,
      accessToken: stored.accessToken,
    });
    return;
  }
  await beforeIntentionalNavigation();
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await beforeIntentionalNavigation();
  await page.evaluate(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session));
    localStorage.setItem('avalaos-core-v1-view', JSON.stringify('process_catalog'));
    localStorage.setItem('avalaos-core-v1-scope', JSON.stringify({ type: 'my_work' }));
  }, { key: authStorageKey, session: sessionFor(actor) });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
};

export const authenticatedLifecycleClickProduct = async (page: Page, label: string) => {
  let target = page.getByRole('button', { name: label, exact: true });
  if (!(await target.isVisible().catch(() => false))) {
    await openProductNavigation(page);
    target = page.getByRole('button', { name: label, exact: true });
  }
  await expect(target).toBeVisible();
  await target.click();
};

export const authenticatedLifecycleSelectProjectScope = async (page: Page, projectName: string) => {
  await page.getByRole('button', { name: 'Switch workspace context', exact: true }).click();
  const item = page.getByRole('button', { name: projectName, exact: true });
  await expect(item).toHaveCount(1);
  await item.click();
  await expect(page.getByRole('button', { name: 'Switch workspace context', exact: true })).toContainText(projectName);
};

export type AuthenticatedAssessmentVariant = 'low-suitability' | 'strong-automation' | 'hitl';

const connectedEvidenceClaims = [
  'primitive.businessDisposition', 'primitive.type', 'primitive.rulesStable', 'primitive.workflowPatternKnown',
  'primitive.documentQualityRepresentative', 'primitive.exceptionSamplesAvailable',
  'primitive.ambiguityCharacterized', 'primitive.controlRequirementsKnown', 'primitive.interfaceDependencyKnown',
  'agent.irreducibleAmbiguity', 'agent.adaptiveNextStep', 'agent.toolOrPathSelection',
  'agent.incrementalValue', 'agent.controllable', 'interaction.mode', 'interaction.interfaceAvailable',
  'interaction.operationCovered', 'interaction.apiDocumented', 'interaction.machineIdentity',
  'interaction.leastPrivilege', 'interaction.dataQuality', 'interaction.dataClassified', 'interaction.auditable',
  'interaction.idempotent', 'interaction.compensatable', 'interaction.rollback', 'interaction.testEnvironment',
  'interaction.monitored', 'interaction.uiStable', 'interaction.eventSemantics', 'interaction.errorContract',
  'interaction.capacityKnown', 'interaction.accountableOwner', 'interaction.highImpact', 'interaction.financialAction',
  'interaction.untrustedContentWithTools', 'asset.strategicLifespan', 'asset.technicalHealth',
  'asset.businessCriticality', 'asset.ownershipModel', 'asset.vendorRoadmap', 'asset.operatingStability',
  'asset.accountableOwner',
] as const;

export type AuthenticatedLifecycleProcessNavigation = Readonly<{
  search: string;
  persistedView: unknown;
  persistedScope: unknown;
}>;

const authenticatedLifecycleNavigationKeys = (scope: Scope, process: boolean) => [
  'view', 'scope',
  ...(scope.type === ScopeType.PROJECT || scope.type === ScopeType.TEAM ? ['scopeId', 'scopeName'] : []),
  ...(scope.type === ScopeType.PROJECT ? ['projectId'] : []),
  ...(process ? ['processId'] : []),
].sort();

const authenticatedLifecycleReadNavigationScope = (
  params: URLSearchParams,
  expectedView: View.PROCESS_CATALOG | View.PROCESS_DETAIL,
  process: boolean,
) => {
  const target = parseProductNavigationSearch(params);
  const scope = target.scope;
  const expectedKeys = isValidScope(scope) ? authenticatedLifecycleNavigationKeys(scope, process) : [];
  if (!isValidScope(scope) || params.getAll('view').length !== 1 || params.get('view') !== expectedView
    || [...params.keys()].sort().join(',') !== expectedKeys.join(',')) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_NAVIGATION_REJECTED');
  }
  return scope;
};

export const authenticatedLifecycleValidateProcessCatalogNavigation = (
  navigation: AuthenticatedLifecycleProcessNavigation,
) => {
  const params = new URLSearchParams(navigation.search);
  const scope = authenticatedLifecycleReadNavigationScope(params, View.PROCESS_CATALOG, false);
  if (!hasDurableProductNavigationAgreement(params, navigation.persistedView, navigation.persistedScope)) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_NAVIGATION_REJECTED');
  }
  return Object.freeze({ scope });
};

export const authenticatedLifecycleValidateProcessNavigation = (
  navigation: AuthenticatedLifecycleProcessNavigation,
  expectedProcessId?: string,
  expectedScope?: Scope,
) => {
  const params = new URLSearchParams(navigation.search);
  const processId = params.get('processId');
  const scope = authenticatedLifecycleReadNavigationScope(params, View.PROCESS_DETAIL, true);
  if (params.getAll('processId').length !== 1 || !processId || !uuid.test(processId)
    || (expectedProcessId !== undefined && processId !== expectedProcessId)
    || (expectedScope !== undefined && !areScopesEqual(scope, expectedScope))
    || !hasDurableProductNavigationAgreement(
      params,
      navigation.persistedView,
      navigation.persistedScope,
    )) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_NAVIGATION_REJECTED');
  }
  return Object.freeze({ processId, scope });
};

export const authenticatedLifecycleReadProcessNavigation = (page: Page) => page.evaluate(({ viewKey, scopeKey }) => {
  let persistedView: unknown = null;
  let persistedScope: unknown = null;
  try { persistedView = JSON.parse(localStorage.getItem(viewKey) || 'null'); } catch { /* rejected by validation */ }
  try { persistedScope = JSON.parse(localStorage.getItem(scopeKey) || 'null'); } catch { /* rejected by validation */ }
  return {
    search: window.location.search,
    persistedView,
    persistedScope,
  };
}, { viewKey: StorageKeys.VIEW, scopeKey: StorageKeys.SCOPE });

const authenticatedLifecycleObserveProcessCatalogScope = async (page: Page) => {
  let scope: Scope | null = null;
  try {
    await expect.poll(async () => {
      try {
        scope = authenticatedLifecycleValidateProcessCatalogNavigation(
          await authenticatedLifecycleReadProcessNavigation(page),
        ).scope;
        return true;
      } catch {
        return false;
      }
    }).toBe(true);
  } catch {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_NAVIGATION_REJECTED');
  }
  if (!scope) throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_NAVIGATION_REJECTED');
  return scope;
};

const authenticatedLifecycleObserveProcessNavigation = async (
  page: Page,
  expectedProcessId?: string,
  expectedScope?: Scope,
) => {
  let candidateProcessId: string | null = null;
  try {
    await expect.poll(async () => {
      const navigation = await authenticatedLifecycleReadProcessNavigation(page);
      const params = new URLSearchParams(navigation.search);
      const processId = params.get('processId');
      let routeReady = false;
      try {
        const scope = authenticatedLifecycleReadNavigationScope(params, View.PROCESS_DETAIL, true);
        routeReady = params.getAll('processId').length === 1 && Boolean(processId && uuid.test(processId))
          && (expectedScope === undefined || areScopesEqual(scope, expectedScope));
      } catch { /* keep polling until the exact route tuple exists */ }
      if (routeReady) candidateProcessId = processId;
      return routeReady;
    }).toBe(true);
  } catch {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_NAVIGATION_REJECTED');
  }
  if (!candidateProcessId || (expectedProcessId !== undefined && candidateProcessId !== expectedProcessId)) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_NAVIGATION_REJECTED');
  }
  const processId = candidateProcessId;
  try {
    await expect.poll(async () => {
      try {
        authenticatedLifecycleValidateProcessNavigation(
          await authenticatedLifecycleReadProcessNavigation(page),
          processId,
          expectedScope,
        );
        return true;
      } catch {
        return false;
      }
    }).toBe(true);
  } catch {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_NAVIGATION_REJECTED');
  }
  return processId;
};

export const authenticatedLifecycleOpenConnectedProcess = async (page: Page, processLabel: string) => {
  await expect(page.getByRole('heading', { name: 'Process Catalog', exact: true })).toBeVisible();
  const catalogScope = await authenticatedLifecycleObserveProcessCatalogScope(page);
  const exactProcessButton = page.getByRole('button', { name: processLabel, exact: true });
  const row = page.getByRole('row').filter({ has: exactProcessButton });
  try {
    // Absence can be loading; multiple exact matches are already ambiguous.
    // Never wait for an ambiguous catalog to become a unique selection.
    await expect.poll(() => exactProcessButton.count()).toBeGreaterThan(0);
    if (await exactProcessButton.count() > 1 || await row.count() > 1) {
      throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_AMBIGUOUS');
    }
    await expect(row).toHaveCount(1);
    await expect(row.getByRole('button', { name: processLabel, exact: true })).toHaveCount(1);
  } catch {
    const count = await exactProcessButton.count();
    throw new Error(count === 0
      ? 'ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_NOT_FOUND'
      : 'ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_AMBIGUOUS');
  }
  await row.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByTestId('assess-v2-workspace')).toBeVisible();
  return authenticatedLifecycleObserveProcessNavigation(page, undefined, catalogScope);
};

export const authenticatedLifecycleValidateDeniedProcessAuthority = ({
  selected,
  processRows,
  processLabel,
  selectedProcessId,
  processHeaders,
}: Readonly<{
  selected: Readonly<Record<string, unknown>> | null;
  processRows: readonly unknown[];
  processLabel: string;
  selectedProcessId: string;
  processHeaders: Readonly<Record<string, string>>;
}>) => {
  if (!selected || typeof selected.userId !== 'string' || !uuid.test(selected.userId)
    || typeof selected.organizationId !== 'string' || typeof selected.workspaceId !== 'string'
    || !Number.isSafeInteger(selected.authorizationVersion) || !Array.isArray(selected.capabilities)
    || selected.capabilities.includes('assess.process.update')) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_AUTHORITY_CONTEXT_REJECTED');
  }
  const matches = processRows.filter(row => row && typeof row === 'object' && !Array.isArray(row)
    && (row as Record<string, unknown>).org_id === selected.organizationId
    && (row as Record<string, unknown>).workspace_id === selected.workspaceId
    && (row as Record<string, unknown>).name === processLabel) as Array<Record<string, unknown>>;
  const process = matches.length === 1 ? matches[0] : null;
  const version = process?.authority_version;
  const publicApiKey = processHeaders.apikey;
  if (!process || process.id !== selectedProcessId || !Number.isSafeInteger(version)
    || (version as number) < 1 || typeof process.description !== 'string' || typeof process.department !== 'string'
    || typeof process.criticality !== 'string'
    || !['Low', 'Medium', 'High', 'Critical'].includes(process.criticality)
    || typeof publicApiKey !== 'string' || !publicApiKey) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_AUTHORITY_REJECTED');
  }
  return Object.freeze({
    context: Object.freeze({
      actorId: selected.userId,
      organizationId: selected.organizationId,
      workspaceId: selected.workspaceId,
      authorizationVersion: selected.authorizationVersion as number,
    }),
    process: Object.freeze({
      id: process.id,
      version: version as number,
      description: process.description,
      department: process.department,
      criticality: process.criticality,
    }),
    publicApiKey,
  });
};

export type AuthenticatedLifecycleSessionBinding = Readonly<{ actorId: string; sessionId: string }>;

export const authenticatedLifecycleValidateSessionBinding = (
  current: AuthenticatedLifecycleSessionBinding | null,
  expected?: AuthenticatedLifecycleSessionBinding,
) => {
  if (!current || !uuid.test(current.actorId) || !uuid.test(current.sessionId)
    || (expected !== undefined
      && (current.actorId !== expected.actorId || current.sessionId !== expected.sessionId))) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_SESSION_BINDING_REJECTED');
  }
  return Object.freeze({ actorId: current.actorId, sessionId: current.sessionId });
};

const authenticatedLifecycleReadBrowserSessionBinding = async (page: Page) => {
  const binding = await page.evaluate(() => {
    const storageKeys = Object.keys(localStorage).filter(key => key.startsWith('sb-'));
    if (storageKeys.length !== 1) return null;
    let stored: Record<string, unknown> = {};
    try { stored = JSON.parse(localStorage.getItem(storageKeys[0]) || '{}'); } catch { return null; }
    const currentSession = stored.currentSession && typeof stored.currentSession === 'object'
      ? stored.currentSession as Record<string, unknown> : stored;
    const user = currentSession.user && typeof currentSession.user === 'object'
      ? currentSession.user as Record<string, unknown> : null;
    const accessToken = currentSession.access_token;
    if (typeof user?.id !== 'string' || typeof accessToken !== 'string' || !accessToken) return null;
    try {
      const encoded = accessToken.split('.')[1] ?? '';
      const normalized = encoded.replace(/-/gu, '+').replace(/_/gu, '/');
      const claims = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as Record<string, unknown>;
      return claims.sub === user.id && typeof claims.session_id === 'string'
        ? { actorId: user.id, sessionId: claims.session_id } : null;
    } catch { return null; }
  });
  return authenticatedLifecycleValidateSessionBinding(binding);
};

export const authenticatedLifecycleAttemptUnauthorizedProcessUpdate = async (
  page: Page,
  processLabel: string,
): Promise<Readonly<{ status: number; body: unknown; request: Request; requestId: string }>> => {
  const selectedProcessId = await authenticatedLifecycleObserveProcessNavigation(page);
  const selectedScope = authenticatedLifecycleValidateProcessNavigation(
    await authenticatedLifecycleReadProcessNavigation(page),
    selectedProcessId,
  ).scope;
  const sessionBeforeReload = await authenticatedLifecycleReadBrowserSessionBinding(page);
  const selectedBeforeReload = await page.evaluate(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('avala.enterprise.session.selection') || '{}') as Record<string, unknown>;
      return typeof saved.organizationId === 'string' && typeof saved.workspaceId === 'string'
        ? { organizationId: saved.organizationId, workspaceId: saved.workspaceId } : null;
    } catch { return null; }
  });
  const backend = new URL(required(apiBaseUrl, 'API_BASE_URL'));
  let reloadDocumentStarted = false;
  const requestsAfterReloadStart = new WeakSet<Request>();
  const observeReloadStart = (request: Request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()
      && request.method() === 'GET') {
      reloadDocumentStarted = true;
      return;
    }
    if (reloadDocumentStarted) requestsAfterReloadStart.add(request);
  };
  page.on('request', observeReloadStart);
  const serverContextResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return requestsAfterReloadStart.has(response.request())
      && url.origin === backend.origin && url.pathname === '/functions/v1/tenant-session'
      && response.request().method() === 'POST';
  });
  const processReadResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    const organizationFilter = url.searchParams.getAll('org_id');
    const workspaceFilter = url.searchParams.getAll('workspace_id');
    return requestsAfterReloadStart.has(response.request())
      && url.origin === backend.origin && url.pathname === '/rest/v1/assess_processes'
      && response.request().method() === 'GET'
      && organizationFilter.length === 1 && organizationFilter[0].startsWith('eq.')
      && uuid.test(organizationFilter[0].slice(3))
      && workspaceFilter.length === 1 && workspaceFilter[0].startsWith('eq.')
      && uuid.test(workspaceFilter[0].slice(3));
  });
  let contextResponse: PlaywrightResponse;
  let processResponse: PlaywrightResponse;
  try {
    [contextResponse, processResponse] = await Promise.all([
      serverContextResponse,
      processReadResponse,
      page.reload({ waitUntil: 'domcontentloaded' }),
    ]);
  } finally {
    page.off('request', observeReloadStart);
  }
  const readBoundedJson = async (response: PlaywrightResponse) => {
    let result: Readonly<{ state: 'pending' | 'fulfilled' | 'rejected'; value?: unknown }> = { state: 'pending' };
    const completion = response.json().then(
      value => { result = { state: 'fulfilled', value }; },
      () => { result = { state: 'rejected' }; },
    );
    try {
      await expect.poll(() => result.state).not.toBe('pending');
    } catch {
      throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_AUTHORITY_READ_REJECTED');
    }
    await completion;
    return result;
  };
  const [contextResult, processResult, processHeaders] = await Promise.all([
    readBoundedJson(contextResponse),
    readBoundedJson(processResponse),
    processResponse.request().allHeaders(),
  ]);
  const contextBody = contextResult.value as { contexts?: unknown } | undefined;
  const processBody = processResult.value;
  if (!contextResponse.ok() || contextResult.state !== 'fulfilled' || !contextBody || !Array.isArray(contextBody.contexts)
    || !processResponse.ok() || processResult.state !== 'fulfilled' || !Array.isArray(processBody)) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_AUTHORITY_READ_REJECTED');
  }
  const selected = (selectedBeforeReload ? contextBody.contexts.find((candidate: Record<string, unknown>) =>
    candidate.organizationId === selectedBeforeReload.organizationId
      && candidate.workspaceId === selectedBeforeReload.workspaceId) : undefined)
    ?? (contextBody.contexts.length === 1 ? contextBody.contexts[0] : undefined) as {
    userId?: unknown; organizationId?: unknown; workspaceId?: unknown; authorizationVersion?: unknown; capabilities?: unknown;
  } | undefined;
  const processReadUrl = new URL(processResponse.url());
  if (!selected || processReadUrl.searchParams.get('org_id') !== `eq.${String(selected.organizationId)}`
    || processReadUrl.searchParams.get('workspace_id') !== `eq.${String(selected.workspaceId)}`) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_AUTHORITY_READ_REJECTED');
  }
  const authority = authenticatedLifecycleValidateDeniedProcessAuthority({
    selected: selected ?? null, processRows: processBody, processLabel, selectedProcessId, processHeaders,
  });
  await authenticatedLifecycleObserveProcessNavigation(page, selectedProcessId, selectedScope);
  const sessionAfterReload = await authenticatedLifecycleReadBrowserSessionBinding(page);
  authenticatedLifecycleValidateSessionBinding(sessionAfterReload, sessionBeforeReload);
  authenticatedLifecycleValidateSessionBinding({
    actorId: authority.context.actorId,
    sessionId: sessionAfterReload.sessionId,
  }, sessionAfterReload);
  const heading = page.getByRole('heading', { name: processLabel, exact: true });
  try {
    await expect(heading).toBeVisible();
  } catch (error) {
    const inspectionHeading = page.getByRole('heading', { name: processLabel, exact: true, includeHidden: true });
    let count: number;
    try { count = await inspectionHeading.count(); } catch { throw error; }
    if (count === 0) throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_DETAIL_MISSING');
    if (count !== 1) throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_DETAIL_AMBIGUOUS');
    let visible: boolean;
    try { visible = await inspectionHeading.isVisible(); } catch { throw error; }
    if (!visible) {
      throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_DETAIL_HIDDEN');
    }
    throw error;
  }
  const editProcess = page.getByRole('button', { name: 'Edit process details', exact: true });
  await expect(editProcess).toBeDisabled();
  await expect(editProcess).toHaveAttribute('title', 'Process editing is not authorized for this role.');
  await expect(page.getByTestId('process-edit-form')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save process details', exact: true })).toHaveCount(0);
  const requestId = crypto.randomUUID();
  const processCommandResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    if (url.origin !== backend.origin || url.pathname !== '/functions/v1/process-command'
      || response.request().method() !== 'POST') return false;
    try { return response.request().postDataJSON()?.requestId === requestId; } catch { return false; }
  });
  const resultPromise = page.evaluate(async ({ baseUrl, requestId: exactRequestId, context, currentProcess, apiKey, expectedSession }) => {
    const storageKey = Object.keys(localStorage).find(key => key.startsWith('sb-'));
    const session = storageKey ? JSON.parse(localStorage.getItem(storageKey) || '{}') : {};
    const accessToken = session.access_token ?? session.currentSession?.access_token ?? '';
    if (!accessToken) throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_SESSION_REQUIRED');
    try {
      const encoded = accessToken.split('.')[1] ?? '';
      const normalized = encoded.replace(/-/gu, '+').replace(/_/gu, '/');
      const claims = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')));
      if (claims.sub !== expectedSession.actorId || claims.session_id !== expectedSession.sessionId) {
        throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_SESSION_BINDING_REJECTED');
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'ENTERPRISE_LIFECYCLE_BROWSER_SESSION_BINDING_REJECTED') throw error;
      throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_SESSION_BINDING_REJECTED');
    }
    const response = await fetch(`${baseUrl}/functions/v1/process-command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}`, apikey: apiKey },
      body: JSON.stringify({
        requestId: exactRequestId,
        idempotencyKey: `process.update.${exactRequestId}`,
        commandType: 'process.update',
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        authorizationVersion: context.authorizationVersion,
        expectedVersion: currentProcess.version,
        payload: {
          processId: currentProcess.id,
          name: 'Unauthorized process rename',
          description: currentProcess.description,
          department: currentProcess.department,
          criticality: currentProcess.criticality,
        },
      }),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, {
    baseUrl: backend.origin,
    requestId,
    context: authority.context,
    currentProcess: {
      ...authority.process,
    },
    apiKey: authority.publicApiKey,
    expectedSession: sessionAfterReload,
  });
  const [response, result] = await Promise.all([processCommandResponse, resultPromise]);
  return { ...result, requestId, request: response.request() };
};

export const authenticatedLifecycleEnterProcessAs = async (
  page: Page,
  actor: AuthenticatedLifecycleActor,
  processLabel: string,
) => {
  await authenticatedLifecycleEnterAs(page, actor);
  if (!(await page.getByRole('heading', { name: 'Process Catalog', exact: true }).isVisible().catch(() => false))) {
    await authenticatedLifecycleClickProduct(page, 'Assess');
  }
  await authenticatedLifecycleOpenConnectedProcess(page, processLabel);
};

export const authenticatedLifecycleSelectReviewer = async (page: Page, actor: AuthenticatedLifecycleActor) => {
  const select = page.getByLabel('Eligible reviewer', { exact: true });
  await expect(select).toBeVisible();
  await select.selectOption(actor.user.id);
};

export const authenticatedLifecycleAttestEverySubmittedEvidence = async (page: Page, rationale: string) => {
  const workspace = page.getByTestId('assess-v2-review-workspace');
  const acceptButtons = workspace.getByRole('button', { name: 'Accept evidence', exact: true });
  const acceptedHeadings = workspace.getByRole('heading', { name: 'Evidence accepted', exact: true });
  let committed = 0;
  while (await acceptButtons.count()) {
    const pendingBefore = await acceptButtons.count();
    const acceptedBefore = await acceptedHeadings.count();
    await workspace.getByLabel('Reviewer rationale', { exact: true }).first().fill(rationale);
    const responsePromise = page.waitForResponse(response => {
      if (new URL(response.url()).pathname !== '/functions/v1/assess-v2-command'
        || response.request().method() !== 'POST') return false;
      try {
        const body = response.request().postDataJSON() as { commandType?: unknown; payload?: { outcome?: unknown } };
        return body.commandType === 'assessment_v2.evidence.attest' && body.payload?.outcome === 'accepted';
      } catch { return false; }
    });
    const [response] = await Promise.all([responsePromise, acceptButtons.first().click()]);
    expect(response.status()).toBe(200);
    await expect(acceptButtons).toHaveCount(pendingBefore - 1);
    await expect(acceptedHeadings).toHaveCount(acceptedBefore + 1);
    await expect(workspace.getByText('Evidence attestation committed: Evidence accepted.', { exact: true })).toBeVisible();
    committed += 1;
  }
  return committed;
};

export const authenticatedLifecycleResolveEveryGovernControl = async (page: Page) => {
  const controls = page.getByTestId('assess-v2-review-workspace').getByLabel(/^Disposition for /u);
  await expect(controls.first()).toBeVisible();
  const fields = await controls.all();
  for (const select of fields) await select.selectOption('resolved');
  return fields.length;
};

export const authenticatedLifecycleEnterStudioAs = async (
  page: Page,
  actor: AuthenticatedLifecycleActor,
  beforeActorNavigation: () => Promise<void> = async () => undefined,
) => {
  await authenticatedLifecycleEnterAs(page, actor, beforeActorNavigation);
  await authenticatedLifecycleClickProduct(page, 'Studio');
  await expect(page.getByTestId('governed-studio-creation-route')).toBeVisible();
  await expect(page.getByTestId('studio-artifact-workspace')).toBeVisible();
};

export type AuthenticatedLifecyclePersistedHandoffTarget = Readonly<{
  handoffId: string;
  handoffVersion: number;
}>;

export type AuthenticatedLifecyclePersistedHandoffStatus =
  | 'requested'
  | 'approval_ready'
  | 'approved'
  | 'changes_requested'
  | 'rejected'
  | 'withdrawn'
  | 'consumed';

export type AuthenticatedLifecyclePersistedHandoffAction =
  | 'Approve review'
  | 'Request changes'
  | 'Reject review'
  | 'Final accept'
  | 'Final reject'
  | 'Withdraw'
  | 'Start Studio draft';

const persistedHandoffId = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const persistedHandoffTargetRejected = () => new Error('ENTERPRISE_LIFECYCLE_PERSISTED_HANDOFF_TARGET_REJECTED');
const persistedHandoffResponseRejected = () => new Error('ENTERPRISE_LIFECYCLE_PERSISTED_HANDOFF_RESPONSE_REJECTED');

export const authenticatedLifecycleValidatePersistedHandoffTarget = (
  value: unknown,
): AuthenticatedLifecyclePersistedHandoffTarget => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw persistedHandoffTargetRejected();
  const candidate = value as { handoffId?: unknown; handoffVersion?: unknown };
  if (typeof candidate.handoffId !== 'string' || !persistedHandoffId.test(candidate.handoffId)
    || !Number.isSafeInteger(candidate.handoffVersion) || Number(candidate.handoffVersion) <= 0) {
    throw persistedHandoffTargetRejected();
  }
  return { handoffId: candidate.handoffId, handoffVersion: Number(candidate.handoffVersion) };
};

export const authenticatedLifecycleDecodePersistedHandoffTarget = (
  response: Readonly<{ status: number; body: unknown }>,
  expectedStatus: AuthenticatedLifecyclePersistedHandoffStatus,
  previous?: AuthenticatedLifecyclePersistedHandoffTarget,
): AuthenticatedLifecyclePersistedHandoffTarget => {
  if (response.status !== 201 || !response.body || typeof response.body !== 'object' || Array.isArray(response.body)) {
    throw persistedHandoffResponseRejected();
  }
  const body = response.body as {
    ok?: unknown;
    outcome?: unknown;
    receiptId?: unknown;
    resourceId?: unknown;
    resource?: unknown;
  };
  if (body.ok !== true || body.outcome !== 'committed'
    || typeof body.receiptId !== 'string' || !persistedHandoffId.test(body.receiptId)
    || typeof body.resourceId !== 'string' || !persistedHandoffId.test(body.resourceId)
    || !body.resource || typeof body.resource !== 'object' || Array.isArray(body.resource)) {
    throw persistedHandoffResponseRejected();
  }
  const resource = body.resource as {
    handoffId?: unknown;
    version?: unknown;
    status?: unknown;
    resourceId?: unknown;
    sourcePackageId?: unknown;
  };
  if (resource.status !== expectedStatus) throw persistedHandoffResponseRejected();
  let target: AuthenticatedLifecyclePersistedHandoffTarget;
  try {
    target = authenticatedLifecycleValidatePersistedHandoffTarget({
      handoffId: resource.handoffId,
      handoffVersion: resource.version,
    });
  } catch {
    throw persistedHandoffResponseRejected();
  }
  if (expectedStatus === 'consumed') {
    if (resource.resourceId !== body.resourceId
      || typeof resource.sourcePackageId !== 'string' || !persistedHandoffId.test(resource.sourcePackageId)) {
      throw persistedHandoffResponseRejected();
    }
  } else if (body.resourceId !== target.handoffId) {
    throw persistedHandoffResponseRejected();
  }
  if (previous) {
    let prior: AuthenticatedLifecyclePersistedHandoffTarget;
    try {
      prior = authenticatedLifecycleValidatePersistedHandoffTarget(previous);
    } catch {
      throw persistedHandoffResponseRejected();
    }
    if (target.handoffId !== prior.handoffId || target.handoffVersion !== prior.handoffVersion + 1) {
      throw persistedHandoffResponseRejected();
    }
  }
  return target;
};

export const authenticatedLifecyclePersistedHandoffTargetFromResponse = async (
  response: PlaywrightResponse,
  expectedStatus: AuthenticatedLifecyclePersistedHandoffStatus,
  previous?: AuthenticatedLifecyclePersistedHandoffTarget,
) => authenticatedLifecycleDecodePersistedHandoffTarget({
  status: response.status(),
  body: await response.json().catch(() => null),
}, expectedStatus, previous);

const authenticatedLifecycleSelectStudioMailbox = async (
  page: Page,
  mailbox: 'Inbox' | 'Outbox',
) => {
  const center = page.getByRole('region', { name: 'Assess → Studio handoffs', exact: true });
  await expect(center).toBeVisible();
  const tab = center.getByRole('tab', { name: new RegExp(`^${mailbox} \\(\\d+\\)$`, 'u') });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  const tabpanel = center.getByRole('tabpanel');
  await expect(tabpanel).toHaveCount(1);
  await expect(tabpanel).toBeVisible();
  return tabpanel;
};

export const authenticatedLifecycleOpenEligibleStudioHandoffRequest = async (page: Page) => {
  const tabpanel = await authenticatedLifecycleSelectStudioMailbox(page, 'Inbox');
  const action = tabpanel.getByRole('button', { name: 'Request handoff', exact: true });
  await expect(action).toHaveCount(1);
  await expect(action).toBeVisible();
  await expect(action).toBeEnabled();
  const card = action.locator('xpath=ancestor::li');
  await expect(card).toHaveCount(1);
  const upstreamHandoffId = await card.getAttribute('data-upstream-handoff-id');
  if (!upstreamHandoffId || !persistedHandoffId.test(upstreamHandoffId)) throw persistedHandoffTargetRejected();
  await action.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return { dialog, upstreamHandoffId };
};

export const authenticatedLifecycleCommitEligibleStudioHandoffRequest = async (page: Page) => {
  const { dialog, upstreamHandoffId } = await authenticatedLifecycleOpenEligibleStudioHandoffRequest(page);
  const responsePromise = page.waitForResponse(response => (
    response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/functions/v1/studio-artifact-command'
    && (() => {
      try {
        const request = response.request().postDataJSON() as {
          commandType?: unknown;
          payload?: { upstreamHandoffId?: unknown };
        };
        return request.commandType === 'studio.handoff.request'
          && request.payload?.upstreamHandoffId === upstreamHandoffId;
      } catch { return false; }
    })()
  ), { timeout: 15_000 });
  const [response] = await Promise.all([
    responsePromise,
    dialog.getByRole('button', { name: 'Confirm', exact: true }).click(),
  ]);
  await expect(dialog).toBeHidden();
  return response;
};

export const authenticatedLifecycleOpenPersistedStudioHandoffDecision = async (
  page: Page,
  rawTarget: AuthenticatedLifecyclePersistedHandoffTarget,
  buttonName: AuthenticatedLifecyclePersistedHandoffAction,
  rationale?: string,
  mailbox: 'Inbox' | 'Outbox' = 'Inbox',
) => {
  const target = authenticatedLifecycleValidatePersistedHandoffTarget(rawTarget);
  const tabpanel = await authenticatedLifecycleSelectStudioMailbox(page, mailbox);
  const card = tabpanel.locator(
    `li[data-handoff-id="${target.handoffId}"][data-handoff-version="${target.handoffVersion}"]`,
  );
  await expect(card).toHaveCount(1);
  await expect(card).toBeVisible();
  const action = card.getByRole('button', { name: buttonName, exact: true });
  await expect(action).toHaveCount(1);
  await expect(action).toBeVisible();
  await expect(action).toBeEnabled();
  await action.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (rationale) await dialog.getByLabel('Decision rationale', { exact: true }).fill(rationale);
  return dialog;
};

export const authenticatedLifecycleCommitPersistedStudioHandoffAction = async (
  page: Page,
  target: AuthenticatedLifecyclePersistedHandoffTarget,
  buttonName: AuthenticatedLifecyclePersistedHandoffAction,
  rationale?: string,
  mailbox: 'Inbox' | 'Outbox' = 'Inbox',
) => {
  const validatedTarget = authenticatedLifecycleValidatePersistedHandoffTarget(target);
  const dialog = await authenticatedLifecycleOpenPersistedStudioHandoffDecision(
    page,
    validatedTarget,
    buttonName,
    rationale,
    mailbox,
  );
  const expectedCommand = buttonName === 'Withdraw'
    ? 'studio.handoff.withdraw'
    : buttonName === 'Start Studio draft'
      ? 'studio.handoff.consume'
      : buttonName === 'Final accept' || buttonName === 'Final reject'
        ? 'studio.handoff.approval.resolve'
        : 'studio.handoff.review.resolve';
  const expectedOutcome = buttonName === 'Approve review' || buttonName === 'Final accept'
    ? 'approve'
    : buttonName === 'Request changes'
      ? 'changes_requested'
      : buttonName === 'Reject review' || buttonName === 'Final reject'
        ? 'reject'
        : undefined;
  const responsePromise = page.waitForResponse(response => {
    if (response.request().method() !== 'POST'
      || new URL(response.url()).pathname !== '/functions/v1/studio-artifact-command') return false;
    try {
      const request = response.request().postDataJSON() as {
        commandType?: unknown;
        expectedAggregateVersion?: unknown;
        payload?: { handoffId?: unknown; handoffVersion?: unknown; outcome?: unknown };
      };
      return request.commandType === expectedCommand
        && request.expectedAggregateVersion === validatedTarget.handoffVersion
        && request.payload?.handoffId === validatedTarget.handoffId
        && request.payload?.handoffVersion === validatedTarget.handoffVersion
        && (expectedOutcome === undefined || request.payload?.outcome === expectedOutcome);
    } catch { return false; }
  }, { timeout: 15_000 });
  const [response] = await Promise.all([
    responsePromise,
    dialog.getByRole('button', { name: 'Confirm', exact: true }).click(),
  ]);
  await expect(dialog).toBeHidden();
  return response;
};

export const authenticatedLifecycleConsumeApprovedStudioHandoff = (
  page: Page,
  target: AuthenticatedLifecyclePersistedHandoffTarget,
) => authenticatedLifecycleCommitPersistedStudioHandoffAction(
  page,
  target,
  'Start Studio draft',
  undefined,
  'Inbox',
);

export const authenticatedLifecycleCompleteRequiredAssessmentFacts = async (
  page: Page,
  variant: AuthenticatedAssessmentVariant,
) => {
  const low = variant === 'low-suitability';
  const hitl = variant === 'hitl';
  if (hitl) {
    await page.getByLabel('Primitive 1 primitive.rulesStable', { exact: true }).selectOption('true');
  } else {
    await expect(page.getByLabel('Primitive 2 type', { exact: true })).toHaveValue('Decide');
    await page.getByLabel('Primitive 2 primitive.rulesStable', { exact: true }).selectOption(low ? 'false' : 'true');
  }
  await page.getByText('3. Applications and interactions', { exact: true }).click();
  await page.getByLabel('Application 1 strategic lifespan', { exact: true }).selectOption(low ? 'long' : 'short');
  await page.getByLabel('Application 1 accountable owner', { exact: true }).fill('Lifecycle operations owner');
  const interaction = page.getByRole('group', { name: 'Interaction 1', exact: true });
  await interaction.getByLabel('Interaction 1 operation name', { exact: true }).fill(hitl ? 'Post financial decision' : 'Process governed work item');
  await interaction.getByLabel('Interaction 1 mode', { exact: true }).selectOption('write');
  await interaction.getByLabel('Interaction 1 data classification', { exact: true }).selectOption(hitl ? 'Restricted' : 'Internal');
  for (const fact of [
    'interfaceAvailable', 'operationCovered', 'apiDocumented', 'errorContract', 'machineIdentity',
    'leastPrivilege', 'dataClassified', 'auditable', 'idempotent', 'compensatable', 'rollback',
  ]) {
    await interaction.getByLabel(`Interaction 1 ${fact}`, { exact: true }).selectOption(low ? 'false' : 'true');
  }
  if (hitl) {
    await interaction.getByLabel('highImpact', { exact: true }).check();
    await interaction.getByLabel('financialAction', { exact: true }).check();
  }
  await page.getByText('4. Agent necessity and evidence', { exact: true }).click();
  await page.getByLabel('Evidence 1 claim IDs', { exact: true }).fill(connectedEvidenceClaims.join(', '));
  await expect(page.getByText(/Before finalization, add:/u)).toHaveCount(0);
};

export const authenticatedLifecycleFinalizeDecisionPack = async (page: Page) => {
  const button = page.getByRole('button', { name: 'Finalize reviewer-ready Decision Pack', exact: true });
  await expect(button).toBeEnabled({ timeout: 15_000 });
  await button.click();
};
