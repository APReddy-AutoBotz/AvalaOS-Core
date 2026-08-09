import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('projects safe server-projected operations truth without false live success', async ({ page }) => {
  await page.goto('/tests/browser/pilotOperationsHarness.html');
  await expect(page.getByRole('heading', { name: 'Pilot Operations' })).toBeVisible();
  await expect(page.getByText(/Hosted\/live activation is not authorized/)).toBeVisible();
  await expect(page.getByText(/LIVE_ACTIVATION_NOT_AUTHORIZED/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'simulate promotion' })).toBeDisabled();
  await page.getByRole('button', { name: 'read only' }).click();
  await expect(page.getByRole('status')).toContainText('request accepted');
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/credential|database_url|secret reference|project id/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(item => ['serious','critical'].includes(item.impact || ''))).toEqual([]);
});

test('supports keyboard focus and practical projection budget', async ({ page }) => {
  const start = Date.now();
  await page.goto('/tests/browser/pilotOperationsHarness.html');
  await expect(page.getByRole('heading', { name: 'Pilot Operations' })).toBeVisible();
  expect(Date.now() - start).toBeLessThan(2_000);
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
});
