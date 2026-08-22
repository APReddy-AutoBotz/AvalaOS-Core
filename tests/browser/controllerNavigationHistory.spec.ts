import { expect, test, type Page } from '@playwright/test';
import { CANONICAL_AP_PROJECT_ID, CANONICAL_AP_WORKFLOW_NAME } from '../../data/mockData';

const releaseSha = process.env.ACCEPTANCE_RELEASE_SHA ?? process.env.EXPECTED_RELEASE_SHA;
const deployId = process.env.NETLIFY_DEPLOY_ID;

const canonicalBoardsNavigation = {
  urlView: 'boards',
  urlScope: 'project',
  urlProjectId: CANONICAL_AP_PROJECT_ID,
  persistedView: 'boards',
  persistedScopeType: 'project',
  persistedProjectId: CANONICAL_AP_PROJECT_ID,
  persistedProjectName: CANONICAL_AP_WORKFLOW_NAME,
};

const canonicalDeliveryPackNavigation = {
  ...canonicalBoardsNavigation,
  urlView: 'delivery_pack',
  persistedView: 'delivery_pack',
};

const assertHostedResponseIdentity = (response: Awaited<ReturnType<Page['goto']>>) => {
  expect(response?.ok(), 'hosted response').toBeTruthy();
  const headers = response?.headers() ?? {};
  expect(headers['x-avalaos-release'], 'exact hosted release').toBe(releaseSha);
  expect(headers['x-avalaos-environment'], 'hosted nonproduction environment').toBe('hosted_nonproduction_pilot');
  expect(headers['x-avalaos-netlify-deploy-id'], 'exact hosted Netlify deployment').toBe(deployId);
};

const readDurableProjectNavigation = async (page: Page) => page.evaluate(() => {
  const url = new URL(window.location.href);
  let scope: any = null;
  try {
    scope = JSON.parse(localStorage.getItem('avalaos-core-v1-scope') || 'null');
  } catch {
    scope = null;
  }
  return {
    urlView: url.searchParams.get('view'),
    urlScope: url.searchParams.get('scope'),
    urlProjectId: url.searchParams.get('projectId'),
    persistedView: JSON.parse(localStorage.getItem('avalaos-core-v1-view') || 'null'),
    persistedScopeType: scope?.type ?? null,
    persistedProjectId: scope?.id ?? null,
    persistedProjectName: scope?.name ?? null,
  };
});

const enterDeliveryLead = async (page: Page) => {
  const response = await page.goto('/sandbox', { waitUntil: 'domcontentloaded' });
  assertHostedResponseIdentity(response);
  const group = page.getByRole('group', { name: 'Choose a sandbox persona' });
  await expect(group).toBeVisible();
  const choice = group.getByRole('button').filter({ hasText: 'Delivery Lead' });
  await expect(choice).toHaveCount(1);
  await choice.click();
  await page.getByRole('button', { name: 'Enter sandbox as Delivery Lead' }).click();
  await expect(page.getByRole('button', { name: 'Toggle theme' })).toBeVisible({ timeout: 15_000 });
};

const selectCanonicalProject = async (page: Page) => {
  const switcher = page.getByRole('button', { name: 'Switch workspace context' });
  await expect(switcher).toBeVisible();
  await switcher.click();
  const project = page.getByRole('button', { name: CANONICAL_AP_WORKFLOW_NAME, exact: true });
  await expect(project).toBeVisible();
  await project.click();
};

const openProductNavigation = async (page: Page) => {
  const opener = page.getByRole('button', { name: 'Open navigation' });
  if (!(await opener.isVisible().catch(() => false))) return;
  const mobileIdentity = page.getByTestId('mobile-current-user');
  if (await mobileIdentity.isVisible().catch(() => false)) return;
  await opener.click();
  await expect(mobileIdentity).toBeVisible({ timeout: 15_000 });
};

const clickProductNav = async (page: Page, label: string) => {
  let target = page.getByRole('button', { name: label, exact: true });
  if (!(await target.isVisible().catch(() => false))) {
    await openProductNavigation(page);
    target = page.getByRole('button', { name: label, exact: true });
  }
  await expect(target).toBeVisible();
  await target.click();
};

test.beforeAll(() => {
  expect(releaseSha, 'controller history probe must bind to an exact release SHA').toMatch(/^[0-9a-f]{40}$/u);
  expect(deployId, 'controller history probe must bind to an exact Netlify deployment ID').toMatch(/^[0-9a-f]{24}$/u);
});

test('[CONTROLLER-NAV-HISTORY-001] user navigation is traversable with browser Back and Forward', async ({ page }) => {
  await enterDeliveryLead(page);
  await selectCanonicalProject(page);
  await expect.poll(
    () => readDurableProjectNavigation(page),
    { message: 'Project selection must settle on canonical Boards navigation before history testing.' },
  ).toEqual(canonicalBoardsNavigation);

  const baselineHistoryLength = await page.evaluate(() => window.history.length);
  await clickProductNav(page, 'Delivery');
  await clickProductNav(page, 'Delivery Pack');
  await expect(page.getByRole('heading', { name: 'AP Invoice Exception Workflow Governed Delivery Pack', exact: true })).toBeVisible();
  await expect.poll(() => readDurableProjectNavigation(page)).toEqual(canonicalDeliveryPackNavigation);

  const navigatedHistoryLength = await page.evaluate(() => window.history.length);
  expect(
    navigatedHistoryLength,
    'A user-initiated product navigation transition must create a browser-history entry rather than replace the only product state.',
  ).toBeGreaterThan(baselineHistoryLength);

  await page.goBack();
  await expect.poll(
    () => readDurableProjectNavigation(page),
    { message: 'Back must reconstruct the prior authorized Boards state in URL and durable scope.' },
  ).toEqual(canonicalBoardsNavigation);
  await expect(page.getByText('AP Invoice Exception Workflow delivery board', { exact: false })).toBeVisible();

  await page.goForward();
  await expect.poll(
    () => readDurableProjectNavigation(page),
    { message: 'Forward must reconstruct the authorized Delivery Pack state in URL and durable scope.' },
  ).toEqual(canonicalDeliveryPackNavigation);
  await expect(page.getByRole('heading', { name: 'AP Invoice Exception Workflow Governed Delivery Pack', exact: true })).toBeVisible();
});
