import { expect, test } from '@playwright/test';

test('real bounded Trust journey', async ({ page }) => {
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
});

test('revoked and version conflict remain explicit', async ({ page }) => {
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?revoked=1');
  await expect(page.getByRole('alert')).toContainText('revoked');
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?conflict=1');
  await page.getByRole('button', { name: 'Build snapshot', exact: true }).click();
  await expect(page.getByText('VERSION_CONFLICT', { exact: true })).toBeVisible();
  await expect(page.getByText(/No publication/)).toBeVisible();
});
