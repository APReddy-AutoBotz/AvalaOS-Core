import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => console.error(`PR1C_PAGE_ERROR: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') console.error(`PR1C_CONSOLE_ERROR: ${message.text()}`); });
  await page.route(/https?:\/\/(?!127\.0\.0\.1:4173).*/, route => route.abort());
  await page.goto('/browser-harness.html');
});

test('renders explicit stale context without viewport overflow or serious accessibility findings', async ({ page }) => {
  const boundary = page.getByTestId('enterprise-session-boundary');
  await expect(boundary).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Access context changed' })).toBeVisible();
  await expect(boundary).toContainText('Your authorization version changed.');

  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasOverflow).toBe(false);

  const results = await new AxeBuilder({ page }).include('[data-testid="enterprise-session-boundary"]').analyze();
  expect(results.violations.filter(item => item.impact === 'critical' || item.impact === 'serious')).toEqual([]);
});

test('refresh remains an explicit action and does not report a false success', async ({ page }) => {
  await page.getByRole('button', { name: 'Refresh server context' }).click();
  await expect(page.getByTestId('persistence-status')).toHaveText('context-refresh-requested');
  await expect(page.getByTestId('committed')).toHaveText('false');
});

test('production preview navigation stays within the PR 1C performance budget', async ({ page }) => {
  const timing = await page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return { duration: entry.duration, domContentLoaded: entry.domContentLoadedEventEnd };
  });
  expect(timing.duration).toBeLessThan(5000);
  expect(timing.domContentLoaded).toBeLessThan(4000);
});
