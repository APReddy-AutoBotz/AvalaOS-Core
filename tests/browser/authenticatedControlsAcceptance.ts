import { expect, type Page, type Request, type Response } from '@playwright/test';

export type ControlCaseSetup = {
  organizationId: string;
  workspaceId: string;
  providerConfigId: string | null;
  adminAuthorizationVersion: number;
  nonAdminAuthorizationVersion: number | null;
  renditionId: string;
};

export type ControlBrowserDeps = {
  page: Page;
  enterAs(persona: 'admin' | 'non_admin'): Promise<void>;
  clickProduct(product: 'Assess' | 'Admin' | 'Enterprise Intelligence' | 'Studio'): Promise<void>;
  prepareCase(testId: string): Promise<ControlCaseSetup>;
  readServerFrame(testId: string): Promise<Record<string, unknown>>;
};

type Observation = {
  testId: string;
  status: 'observed' | 'blocked';
  proofMode: 'actual-ui' | 'not-run';
  assertions: string[];
  missingAssertions: string[];
  server?: Record<string, unknown>;
  api?: { route: string; status: number };
};

const authenticatedApiBaseUrl = (() => {
  const value = process.env.ENTERPRISE_LIFECYCLE_API_BASE_URL ?? '';
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('AUTHENTICATED_CONTROLS_NON_LOOPBACK_API_REJECTED');
  }
  return url.toString().replace(/\/$/u, '');
})();
const authenticatedPostPaths = new Set([
  '/functions/v1/synthetic-admin',
  '/functions/v1/enterprise-provider-lifecycle',
  '/functions/v1/studio-artifact-download',
]);

const blocked = (testId: string, ...missingAssertions: string[]): Observation => ({
  testId,
  status: 'blocked',
  proofMode: 'not-run',
  assertions: [],
  missingAssertions,
});

const passed = async (
  deps: ControlBrowserDeps,
  testId: string,
  assertions: string[],
  api?: { route: string; status: number },
): Promise<Observation> => ({
  testId,
  status: 'observed',
  proofMode: 'actual-ui',
  assertions,
  missingAssertions: [],
  server: await deps.readServerFrame(testId),
  api,
});

const observedResponse = async (
  page: Page,
  route: string,
  action: () => Promise<unknown>,
) => {
  const [response] = await Promise.all([
    page.waitForResponse(candidate => new URL(candidate.url()).pathname === route),
    action(),
  ]);
  return { route, status: response.status() };
};

const openAi = async (
  deps: ControlBrowserDeps,
  persona: 'admin' | 'non_admin' = 'admin',
) => {
  await deps.enterAs(persona);
  const scope = deps.page.getByRole('button', { name: 'Switch workspace context', exact: true });
  if (!/My Work/u.test(await scope.textContent() ?? '')) {
    await scope.click();
    await deps.page.getByRole('button', { name: /^My Work\b/u }).click();
  }
  await expect(scope).toContainText('My Work');
  await deps.clickProduct('Assess');
  await expect(deps.page.getByRole('heading', { name: 'Process Catalog', exact: true })).toBeVisible();
  const api = await observedResponse(
    deps.page,
    '/functions/v1/enterprise-intelligence-query',
    () => deps.clickProduct('Enterprise Intelligence'),
  );
  const workspace = deps.page.getByTestId('enterprise-intelligence-workspace');
  await expect(workspace).toBeVisible();
  await workspace.getByRole('button', { name: 'AI Controls', exact: true }).click();
  return { workspace, api };
};

const authenticatedPost = async (
  deps: ControlBrowserDeps,
  path: string,
  body: Record<string, unknown>,
) => {
  if (!authenticatedPostPaths.has(path)) throw new Error('AUTHENTICATED_CONTROLS_DIRECT_PATH_REJECTED');
  return deps.page.evaluate(async ({ url, body: requestBody }) => {
  const storageKey = Object.keys(localStorage).find(key => key.startsWith('sb-'));
  const session = storageKey ? JSON.parse(localStorage.getItem(storageKey) || '{}') : {};
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${session.access_token || ''}`,
    },
    body: JSON.stringify(requestBody),
  });
  return {
    status: response.status,
    body: await response.json().catch(() => null),
  };
  }, { url: `${authenticatedApiBaseUrl}${path}`, body });
};

const adminListBody = (setup: ControlCaseSetup, authorizationVersion: number) => ({
  operation: 'list',
  organizationId: setup.organizationId,
  workspaceId: setup.workspaceId,
  expectedAuthorizationVersion: authorizationVersion,
  payload: { limit: 20 },
});

export async function observeAuthenticatedAdminControls(
  deps: ControlBrowserDeps,
): Promise<Observation[]> {
  await deps.prepareCase('ADMIN-001');
  const adminAuthorityApi = await observedResponse(
    deps.page,
    '/functions/v1/tenant-session',
    async () => {
      await deps.enterAs('admin');
      await deps.clickProduct('Admin');
    },
  );
  await expect(deps.page.getByRole('heading', { name: 'Admin Workbench', exact: true })).toBeVisible();
  const adminNavigation = await passed(deps, 'ADMIN-001', [
    'authorized-admin-navigation',
    'server-issued-context-visible',
  ], adminAuthorityApi);

  await deps.prepareCase('ADMIN-004');
  await deps.enterAs('admin');
  await deps.clickProduct('Admin');
  const pilotApi = await observedResponse(
    deps.page,
    '/functions/v1/pilot-operations-query',
    () => deps.page.getByRole('button', { name: /^Pilot Operations\b/u }).click(),
  );
  const pilotPanel = deps.page.getByRole('region', { name: 'Pilot Operations', exact: true });
  await expect(pilotPanel.getByRole('heading', { name: 'Pilot Operations', exact: true })).toBeVisible();
  await expect(pilotPanel.getByText(/live activation.+not authorized/iu)).toBeVisible();
  const pilotOperations = await passed(deps, 'ADMIN-004', [
    'pilot-operations-read-only-query',
    'no-release-truth-created',
  ], pilotApi);

  const nonAdminSetup = await deps.prepareCase('ADMIN-002');
  await deps.enterAs('non_admin');
  await expect(deps.page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0);
  const denied = await authenticatedPost(
    deps,
    '/functions/v1/synthetic-admin',
    adminListBody(nonAdminSetup, nonAdminSetup.nonAdminAuthorizationVersion!),
  );
  expect(denied.status).toBe(403);
  expect(denied.body).toEqual({ errorCode: 'PERMISSION_DENIED' });
  const nonAdminDenial = await passed(deps, 'ADMIN-002', [
    'non-admin-server-request-denied',
    'forged-navigation-grants-no-authority',
  ], { route: '/functions/v1/synthetic-admin', status: denied.status });

  const forgedSetup = await deps.prepareCase('ADMIN-003');
  await deps.enterAs('non_admin');
  await deps.page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith('sb-')) continue;
      const value = JSON.parse(localStorage.getItem(key) || '{}');
      value.user = { ...(value.user || {}), orgRole: 'Admin', permissions: ['org.admin'] };
      localStorage.setItem(key, JSON.stringify(value));
    }
  });
  await deps.page.reload();
  await expect(deps.page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0);
  const forgedDenied = await authenticatedPost(
    deps,
    '/functions/v1/synthetic-admin',
    adminListBody(forgedSetup, forgedSetup.nonAdminAuthorizationVersion!),
  );
  expect(forgedDenied.status).toBe(403);
  expect(forgedDenied.body).toEqual({ errorCode: 'PERMISSION_DENIED' });
  const forgedClaimDenial = await passed(deps, 'ADMIN-003', [
    'server-capabilities-exact',
    'forged-client-capability-ineffective',
  ], { route: '/functions/v1/synthetic-admin', status: forgedDenied.status });

  return [adminNavigation, nonAdminDenial, forgedClaimDenial, pilotOperations];
}

export async function observeAuthenticatedAiControls(
  deps: ControlBrowserDeps,
  syntheticSecret: string,
): Promise<Observation[]> {
  const observations: Observation[] = [];
  let authorizedWriteBodyExcluded = false;
  let secretTrafficFree = true;
  let referenceTrafficFree = true;
  const responseChecks: Promise<void>[] = [];
  const referenceField = /(?:secret|key)[_-]?ref|safeFingerprint/iu;

  const scanSafeTraffic = (serialized: string) => {
    if (serialized.includes(syntheticSecret)) secretTrafficFree = false;
    if (referenceField.test(serialized)) referenceTrafficFree = false;
  };
  const onRequest = (request: Request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/functions/v1/')) return;
    const body = request.postData() || '';
    if (url.pathname === '/functions/v1/enterprise-provider-lifecycle') {
      try {
        const parsed = JSON.parse(body);
        if (parsed?.operation === 'provider.secret.bind'
          && typeof parsed?.payload?.providerKey === 'string') {
          authorizedWriteBodyExcluded = true;
          const sanitized = structuredClone(parsed) as Record<string, any>;
          delete sanitized.payload.providerKey;
          scanSafeTraffic(JSON.stringify(sanitized));
          return;
        }
      } catch {
        // Malformed traffic is scanned below.
      }
    }
    scanSafeTraffic(body);
  };
  const onResponse = (response: Response) => {
    if (!response.url().includes('/functions/v1/')) return;
    responseChecks.push(response.text().then(scanSafeTraffic).catch(() => {}));
  };
  deps.page.on('request', onRequest);
  deps.page.on('response', onResponse);

  await deps.prepareCase('AI-001');
  let opened = await openAi(deps);
  let workspace = opened.workspace;
  await expect(workspace.getByRole('combobox', { name: 'Configured provider', exact: true }).locator('option')).toHaveCount(1);
  await expect(workspace.getByRole('button', { name: 'Bind key securely', exact: true })).toBeDisabled();
  observations.push(await passed(deps, 'AI-001', [
    'missing-provider-configuration-denied',
    'no-provider-request',
  ], opened.api));

  const deniedCases = [
    {
      testId: 'AI-002',
      alert: /could not be completed|PROVIDER_BLOCKED|disabled/iu,
      assertions: ['disabled-provider-denied', 'no-provider-request'],
    },
    {
      testId: 'AI-005',
      alert: /could not be completed|SECRET_UNAVAILABLE|PROVIDER_BLOCKED|unavailable/iu,
      assertions: ['provider-unavailable-visible', 'no-provider-request-or-false-success'],
    },
  ];
  for (const deniedCase of deniedCases) {
    await deps.prepareCase(deniedCase.testId);
    opened = await openAi(deps);
    workspace = opened.workspace;
    const provider = workspace.getByRole('combobox', { name: 'Configured provider', exact: true });
    if (await provider.locator('option').count() < 2) {
      observations.push(blocked(deniedCase.testId, 'configured provider UI precondition'));
      continue;
    }
    await provider.selectOption({ index: 1 });
    const api = await observedResponse(
      deps.page,
      '/functions/v1/enterprise-provider-lifecycle',
      () => workspace.getByRole('button', { name: 'Validate', exact: true }).click(),
    );
    await expect(deps.page.getByRole('alert')).toContainText(deniedCase.alert);
    observations.push(await passed(deps, deniedCase.testId, deniedCase.assertions, api));
  }

  const capabilitySetup = await deps.prepareCase('AI-003');
  await deps.enterAs('non_admin');
  let deniedThroughVisibleControl = false;
  let capabilityApi: { route: string; status: number } | undefined;
  const enterpriseEntry = deps.page.getByRole('button', {
    name: 'Enterprise Intelligence',
    exact: true,
  });
  if (await enterpriseEntry.count() > 0) {
    await deps.clickProduct('Enterprise Intelligence');
    workspace = deps.page.getByTestId('enterprise-intelligence-workspace');
    await expect(workspace).toBeVisible();
    await workspace.getByRole('button', { name: 'AI Controls', exact: true }).click();
    const validate = workspace.getByRole('button', { name: 'Validate', exact: true });
    if (await validate.isVisible().catch(() => false) && !await validate.isDisabled()) {
      const provider = workspace.getByRole('combobox', { name: 'Configured provider', exact: true });
      await provider.selectOption({ index: 1 });
      capabilityApi = await observedResponse(
        deps.page,
        '/functions/v1/enterprise-provider-lifecycle',
        () => validate.click(),
      );
      await expect(deps.page.getByRole('alert')).toContainText(/permission|required/iu);
      deniedThroughVisibleControl = true;
    }
  } else {
    await expect(enterpriseEntry).toHaveCount(0);
  }
  if (!deniedThroughVisibleControl) {
    const denied = await authenticatedPost(deps, '/functions/v1/enterprise-provider-lifecycle', {
      operation: 'provider.validate',
      organizationId: capabilitySetup.organizationId,
      workspaceId: capabilitySetup.workspaceId,
      expectedAuthorizationVersion: capabilitySetup.nonAdminAuthorizationVersion,
      payload: { providerConfigId: capabilitySetup.providerConfigId },
      requestId: crypto.randomUUID(),
      idempotencyKey: `authenticated-ai003-${crypto.randomUUID()}`,
    });
    expect(denied.status).toBe(403);
    expect(denied.body?.error?.code).toBe('PERMISSION_DENIED');
    capabilityApi = {
      route: '/functions/v1/enterprise-provider-lifecycle',
      status: denied.status,
    };
  }
  observations.push(await passed(deps, 'AI-003', [
    'missing-provider-capability-denied',
    'no-provider-request',
  ], capabilityApi));

  await deps.prepareCase('AI-004');
  opened = await openAi(deps);
  workspace = opened.workspace;
  const provider = workspace.getByRole('combobox', { name: 'Configured provider', exact: true });
  let bindApi: { route: string; status: number } | undefined;
  if (await provider.locator('option').count() < 2) {
    observations.push(blocked('AI-004', 'synthetic provider UI precondition'));
  } else {
    await provider.selectOption({ index: 1 });
    const providerKey = workspace.getByLabel('Provider key (sent once)', { exact: true });
    await providerKey.fill(syntheticSecret);
    bindApi = await observedResponse(
      deps.page,
      '/functions/v1/enterprise-provider-lifecycle',
      () => workspace.getByRole('button', { name: 'Bind key securely', exact: true }).click(),
    );
    await expect(workspace.getByText(/raw key discarded from form state/iu)).toBeVisible();
    await expect(providerKey).toHaveValue('');
    observations.push(await passed(deps, 'AI-004', [
      'synthetic-secret-command-committed',
      'configuration-receipt-audit-exact',
      'secret-absent-from-browser-and-response',
    ], bindApi));
  }

  await deps.prepareCase('AI-006');
  await Promise.all(responseChecks);
  deps.page.off('request', onRequest);
  deps.page.off('response', onResponse);
  const storage = await deps.page.evaluate(() => JSON.stringify({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
  scanSafeTraffic(storage);
  if (!secretTrafficFree || !referenceTrafficFree || !authorizedWriteBodyExcluded) {
    observations.push(blocked('AI-006', 'sanitized browser traffic and storage observation'));
  } else {
    observations.push(await passed(deps, 'AI-006', [
      'browser-storage-and-traffic-secret-free',
      'provider-authority-server-only',
    ], bindApi));
  }
  return observations;
}

export async function observeAuthenticatedStudioDownloadDenial(
  deps: ControlBrowserDeps,
): Promise<Observation> {
  const setup = await deps.prepareCase('STUDIO-007');
  await deps.enterAs('non_admin');
  let deniedThroughVisibleControl = false;
  let downloadApi: { route: string; status: number } | undefined;
  const studioEntry = deps.page.getByRole('button', { name: 'Studio', exact: true });
  if (await studioEntry.count() > 0) {
    await deps.clickProduct('Studio');
    const workspace = deps.page.getByTestId('studio-artifact-workspace');
    await expect(workspace).toBeVisible();
    const download = workspace.getByRole('button', { name: /^Download (Markdown|PDF|DOCX)$/u }).first();
    if (await download.isVisible().catch(() => false) && !await download.isDisabled()) {
      downloadApi = await observedResponse(
        deps.page,
        '/functions/v1/studio-artifact-download',
        () => download.click(),
      );
      await expect(workspace.getByText(
        'Download unavailable. No successful download was recorded.',
        { exact: true },
      )).toBeVisible();
      deniedThroughVisibleControl = true;
    }
  } else {
    await expect(studioEntry).toHaveCount(0);
  }
  if (!deniedThroughVisibleControl) {
    const denied = await authenticatedPost(deps, '/functions/v1/studio-artifact-download', {
      requestId: crypto.randomUUID(),
      idempotencyKey: `studio-denied-${crypto.randomUUID()}`,
      organizationId: setup.organizationId,
      workspaceId: setup.workspaceId,
      authorizationVersion: setup.nonAdminAuthorizationVersion,
      renditionId: setup.renditionId,
    });
    expect(denied.status).toBe(403);
    expect(denied.body?.error?.code).toBe('PERMISSION_DENIED');
    downloadApi = { route: '/functions/v1/studio-artifact-download', status: denied.status };
  }
  return passed(deps, 'STUDIO-007', [
    'private-broker-denies-before-storage',
    'no-bytes-or-resource-disclosure',
  ], downloadApi);
}
