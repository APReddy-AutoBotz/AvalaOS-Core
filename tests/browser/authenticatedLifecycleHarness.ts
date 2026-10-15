import { expect, type Page, type Request } from '@playwright/test';
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

export type AuthenticatedLifecycleSetup = Readonly<{
  executionId: string;
  journeyBinding: string;
  projectName: string;
  deliveryProject: Readonly<{ id: string; name: string }>;
  aliases: Readonly<Record<'case' | 'review' | 'handoff' | 'artifact' | 'process', string>>;
  actors: Readonly<Record<'author' | 'reviewer' | 'approver' | 'outsider', AuthenticatedLifecycleActor>>;
}>;

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
const hostedSessionCache = new Map<string, Readonly<{ key: string; value: string }>>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
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

const boundedControlFailure = async (response: Response) => {
  const payload: unknown = await response.json().catch(() => null);
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

export const createAuthenticatedLifecycleControl = ({
  baseUrl,
  token,
  fetchImpl = fetch,
}: Readonly<{ baseUrl: string; token: string; fetchImpl?: typeof fetch }>) => async <T>(
  pathname: string,
  body?: unknown,
): Promise<T> => {
  const target = `${loopbackBaseUrl(baseUrl)}${pathname}`;
  const controlHeader = required(token, 'CONTROL_TOKEN');
  let response: Response;
  try {
    response = await fetchImpl(target, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        'x-enterprise-lifecycle-control': controlHeader,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TRANSPORT_REJECTED');
  }
  if (!response.ok) throw new Error(await boundedControlFailure(response));
  try {
    return await response.json() as T;
  } catch {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_RESPONSE_REJECTED');
  }
};

export const authenticatedLifecycleControl = createAuthenticatedLifecycleControl({
  baseUrl: controlBaseUrl,
  token: controlToken,
});

export type AuthenticatedLifecycleWorkQueue = Readonly<{
  enqueue: (operation: () => Promise<unknown>) => void;
  drain: () => Promise<void>;
}>;

export const createAuthenticatedLifecycleWorkQueue = (): AuthenticatedLifecycleWorkQueue => {
  let tail: Promise<void> = Promise.resolve();
  let hasFailure = false;
  let firstFailure: unknown;
  const enqueue = (operation: () => Promise<unknown>) => {
    const work = tail.then(async () => {
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

const sessionFor = (actor: AuthenticatedLifecycleActor) => ({
  access_token: actor.token,
  refresh_token: `${actor.token}-refresh`,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { ...actor.user, aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: { provider: 'fixture' } },
});

export const authenticatedLifecycleEnterAs = async (page: Page, actor: AuthenticatedLifecycleActor) => {
  if (hostedRealAuth) {
    if (actor.authKind !== 'supabase_auth' || !actor.persona || !actor.projectName || !actor.password) {
      throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_REAL_AUTH_ACTOR_REQUIRED');
    }
    await page.goto('/');
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) if (key.startsWith('sb-')) localStorage.removeItem(key);
      localStorage.setItem('avalaos-core-v1-view', JSON.stringify('process_catalog'));
      localStorage.setItem('avalaos-core-v1-scope', JSON.stringify({ type: 'my_work' }));
    });
    await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
    const cacheKey = `${actor.user.id}:${actor.persona}`;
    const cached = hostedSessionCache.get(cacheKey);
    if (cached) {
      await page.evaluate(({ key, value }) => localStorage.setItem(key, value), cached);
      await page.reload({ waitUntil: 'domcontentloaded' });
    } else {
      await expect(page.getByRole('heading', { name: 'Sign in securely', exact: true })).toBeVisible();
      await page.getByLabel('Work email', { exact: false }).fill(actor.user.email);
      await page.getByLabel('Password', { exact: true }).fill(actor.password);
      const signInResponse = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname.endsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'password';
      });
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
      const stored = await page.evaluate(() => {
        const key = Object.keys(localStorage).find(candidate => candidate.startsWith('sb-'));
        return key ? { key, value: localStorage.getItem(key) || '' } : null;
      });
      if (!stored?.value) {
        await reportIdentityDiagnostic(actor.projectName, 'SESSION_MISSING');
        throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_REAL_AUTH_SESSION_REQUIRED');
      }
      hostedSessionCache.set(cacheKey, stored);
    }
    await expect(page.getByRole('heading', { name: 'Sign in securely', exact: true })).toHaveCount(0);
    const accessToken = await page.evaluate(() => {
      const key = Object.keys(localStorage).find(candidate => candidate.startsWith('sb-'));
      const stored = key ? JSON.parse(localStorage.getItem(key) || '{}') : {};
      return stored.access_token ?? stored.currentSession?.access_token ?? '';
    });
    if (!accessToken) {
      await reportIdentityDiagnostic(actor.projectName, 'SESSION_MISSING');
      throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_REAL_AUTH_SESSION_REQUIRED');
    }
    await authenticatedLifecycleControl('/control/bind-browser-session', {
      projectName: actor.projectName,
      persona: actor.persona,
      accessToken,
    });
    return;
  }
  await page.goto('/');
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

const authenticatedLifecycleReadProcessNavigation = (page: Page) => page.evaluate(({ viewKey, scopeKey }) => {
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
  const backend = new URL(required(apiBaseUrl, 'API_BASE_URL'));
  const serverContextResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === backend.origin && url.pathname === '/functions/v1/tenant-session'
      && response.request().method() === 'POST';
  });
  const processReadResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === backend.origin && url.pathname === '/rest/v1/assess_processes'
      && response.request().method() === 'GET';
  });
  const [contextResponse, processResponse] = await Promise.all([
    serverContextResponse,
    processReadResponse,
    page.reload({ waitUntil: 'domcontentloaded' }),
  ]);
  await authenticatedLifecycleObserveProcessNavigation(page, selectedProcessId, selectedScope);
  await expect(page.getByRole('heading', { name: processLabel, exact: true })).toBeVisible();
  const editProcess = page.getByRole('button', { name: 'Edit process details', exact: true });
  await expect(editProcess).toBeDisabled();
  await expect(editProcess).toHaveAttribute('title', 'Process editing is not authorized for this role.');
  await expect(page.getByTestId('process-edit-form')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save process details', exact: true })).toHaveCount(0);
  const sessionAfterReload = await authenticatedLifecycleReadBrowserSessionBinding(page);
  authenticatedLifecycleValidateSessionBinding(sessionAfterReload, sessionBeforeReload);
  const [contextBody, processBody, processHeaders] = await Promise.all([
    contextResponse.json().catch(() => null),
    processResponse.json().catch(() => null),
    processResponse.request().allHeaders(),
  ]);
  if (!contextResponse.ok() || !contextBody || !Array.isArray(contextBody.contexts)
    || !processResponse.ok() || !Array.isArray(processBody)) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_AUTHORITY_READ_REJECTED');
  }
  const selected = await page.evaluate(contexts => {
    let saved: Record<string, unknown> = {};
    try { saved = JSON.parse(sessionStorage.getItem('avala.enterprise.session.selection') || '{}'); } catch { /* rejected below */ }
    return contexts.find((candidate: Record<string, unknown>) =>
      candidate.organizationId === saved.organizationId && candidate.workspaceId === saved.workspaceId)
      ?? (contexts.length === 1 ? contexts[0] : null);
  }, contextBody.contexts) as {
    userId?: unknown; organizationId?: unknown; workspaceId?: unknown; authorizationVersion?: unknown; capabilities?: unknown;
  } | null;
  const authority = authenticatedLifecycleValidateDeniedProcessAuthority({
    selected, processRows: processBody, processLabel, selectedProcessId, processHeaders,
  });
  authenticatedLifecycleValidateSessionBinding({
    actorId: authority.context.actorId,
    sessionId: sessionAfterReload.sessionId,
  }, sessionAfterReload);
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

export const authenticatedLifecycleEnterStudioAs = async (page: Page, actor: AuthenticatedLifecycleActor) => {
  await authenticatedLifecycleEnterAs(page, actor);
  await authenticatedLifecycleClickProduct(page, 'Studio');
  await expect(page.getByTestId('governed-studio-creation-route')).toBeVisible();
  await expect(page.getByTestId('studio-artifact-workspace')).toBeVisible();
};

export const authenticatedLifecycleCommitStudioHandoffAction = async (
  page: Page,
  buttonName: string,
  rationale?: string,
  mailbox: 'Inbox' | 'Outbox' = 'Inbox',
) => {
  const center = page.getByRole('region', { name: 'Assess → Studio handoffs', exact: true });
  await expect(center).toBeVisible();
  const tab = center.getByRole('tab', { name: new RegExp(`^${mailbox} \\(\\d+\\)$`, 'u') });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await center.getByRole('button', { name: buttonName, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (rationale) await dialog.getByLabel('Decision rationale', { exact: true }).fill(rationale);
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(dialog).toBeHidden();
};

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
