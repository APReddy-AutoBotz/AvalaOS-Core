import { expect, type Page } from '@playwright/test';
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

const controlToken = process.env.ENTERPRISE_LIFECYCLE_CONTROL_TOKEN ?? '';
const apiBaseUrl = process.env.ENTERPRISE_LIFECYCLE_API_BASE_URL ?? '';
const controlBaseUrl = process.env.ENTERPRISE_LIFECYCLE_CONTROL_URL ?? apiBaseUrl;
const authStorageKey = process.env.ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY ?? 'sb-127-auth-token';
const hostedRealAuth = process.env.ENTERPRISE_LIFECYCLE_HOSTED_REAL_AUTH === 'true';
const hostedSessionCache = new Map<string, Readonly<{ key: string; value: string }>>();
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

export const authenticatedLifecycleControl = async <T>(pathname: string, body?: unknown): Promise<T> => {
  const response = await fetch(`${loopbackBaseUrl(controlBaseUrl)}${pathname}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      'x-enterprise-lifecycle-control': required(controlToken, 'CONTROL_TOKEN'),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`ENTERPRISE_LIFECYCLE_CONTROL_FAILED:${pathname}:${response.status}`);
  return response.json() as Promise<T>;
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

export const authenticatedLifecycleOpenConnectedProcess = async (page: Page, processLabel: string) => {
  await expect(page.getByRole('heading', { name: 'Process Catalog', exact: true })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: processLabel });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByTestId('assess-v2-workspace')).toBeVisible();
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
