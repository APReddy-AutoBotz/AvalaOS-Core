import { expect, type Page } from '@playwright/test';
import { openProductNavigation } from './productNavigationReadiness';

export type AuthenticatedLifecycleActor = Readonly<{
  token: string;
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
const authStorageKey = process.env.ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY ?? 'sb-127-auth-token';

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
  const response = await fetch(`${loopbackBaseUrl(apiBaseUrl)}${pathname}`, {
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

const sessionFor = (actor: AuthenticatedLifecycleActor) => ({
  access_token: actor.token,
  refresh_token: `${actor.token}-refresh`,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { ...actor.user, aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: { provider: 'fixture' } },
});

export const authenticatedLifecycleEnterAs = async (page: Page, actor: AuthenticatedLifecycleActor) => {
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
  let committed = 0;
  while (await workspace.getByRole('button', { name: 'Accept evidence', exact: true }).count()) {
    await workspace.getByLabel('Reviewer rationale', { exact: true }).first().fill(rationale);
    await workspace.getByRole('button', { name: 'Accept evidence', exact: true }).first().click();
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

