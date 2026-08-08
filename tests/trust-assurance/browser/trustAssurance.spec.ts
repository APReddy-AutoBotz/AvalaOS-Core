import { expect, test } from '@playwright/test';

test('canonical pilot runtime mounts the governed real journey', async ({ page }) => {
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html');
  await expect(page.getByRole('heading', { name: 'Trust and Assurance Evidence Hub', exact: true })).toBeVisible();
  const views = page.getByRole('navigation', { name: 'Trust Assurance views', exact: true });

  await views.getByRole('button', { name: 'Claims', exact: true }).click();
  await expect(page.getByText(/CURRENT_CONTRADICTION/)).toBeVisible();
  await views.getByRole('button', { name: 'Evidence', exact: true }).click();
  await expect(page.getByText(/expired/)).toBeVisible();
  await views.getByRole('button', { name: 'Buyer-safe preview', exact: true }).click();
  await expect(page.getByText(/No published snapshot/)).toBeVisible();

  await page.getByRole('button', { name: 'Build snapshot', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Build snapshot', exact: true })).toBeDisabled();
  await expect(page.getByText('Durable change committed.', { exact: true })).toBeVisible();
  await views.getByRole('button', { name: 'Publication history', exact: true }).click();
  await expect(page.getByText(/draft/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?tenant-context=1');
  await page.getByRole('navigation', { name: 'Trust Assurance views', exact: true }).getByRole('button', { name: 'Claims', exact: true }).click();
  await expect(page.getByText('Workspace B assurance', { exact: true })).toBeVisible();
  const callLog = page.getByTestId('trust-call-log');
  await expect(callLog).toContainText('query:internal:30000000-0000-4000-8000-000000000013');
  await expect(callLog).toContainText('query:buyer:30000000-0000-4000-8000-000000000013');
  await expect(callLog).not.toContainText('30000000-0000-4000-8000-000000000003');
  await page.getByRole('button', { name: 'Build snapshot', exact: true }).click();
  await page.getByRole('button', { name: 'Select workspace A', exact: true }).click();
  await expect(page.getByText('Workspace B assurance', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Loading server-authoritative assurance evidence/)).toBeVisible();
  await page.getByRole('button', { name: 'Release workspace A query', exact: true }).click();
  await expect(page.getByText('Workspace A assurance', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Release workspace B command', exact: true }).click();
  await expect(callLog).toContainText('command-complete:snapshot.create:30000000-0000-4000-8000-000000000013');
  await expect(page.getByText('Workspace A assurance', { exact: true })).toBeVisible();
  await expect(callLog).toContainText('command:snapshot.create:30000000-0000-4000-8000-000000000013');
  await page.getByRole('button', { name: 'Build snapshot', exact: true }).click();
  await expect(callLog).toContainText('command:snapshot.create:30000000-0000-4000-8000-000000000003');
  await expect(callLog).toContainText('command-complete:snapshot.create:30000000-0000-4000-8000-000000000003');
  await page.getByRole('button', { name: 'Clear call log', exact: true }).click();
  await page.getByRole('button', { name: 'Select workspace A without Trust', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('revoked');
  await page.waitForTimeout(400);
  await expect(callLog).toHaveText('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('revoked and version conflict remain explicit', async ({ page }) => {
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?revoked=1');
  await expect(page.getByRole('alert')).toContainText('revoked');
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?conflict=1');
  await page.getByRole('button', { name: 'Build snapshot', exact: true }).click();
  await expect(page.getByText('VERSION_CONFLICT', { exact: true })).toBeVisible();
  await expect(page.getByText(/No publication/)).toBeVisible();
});

test('server-projected read-only mode disables every governed mutation', async ({ page }) => {
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?readonly=1');
  await expect(page.getByRole('status')).toContainText('Read-only mode');
  const controls = page.getByRole('region', { name: 'Trust Assurance commands' }).getByRole('button');
  await expect(controls).toHaveCount(9);
  for (let index = 0; index < await controls.count(); index += 1) await expect(controls.nth(index)).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
