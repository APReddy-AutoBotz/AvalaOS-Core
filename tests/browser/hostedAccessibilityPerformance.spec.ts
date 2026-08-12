import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Repository-owned, caller-independent hosted-pilot acceptance contracts. These
// intentionally stay practical rather than acting as an open-ended Lighthouse
// optimization target.
const MAX_NAVIGATION_DURATION_MS = 15_000;
const MAX_DOM_CONTENT_LOADED_MS = 10_000;
const MAX_RESOURCE_COUNT = 300;

const expectedHead = process.env.EXPECTED_RELEASE_SHA;
test.beforeAll(() => expect(expectedHead, 'EXPECTED_RELEASE_SHA must bind acceptance to an exact release').toMatch(/^[0-9a-f]{40}$/));

test('hosted shell has no serious or critical accessibility violations', async ({ page }) => {
  const response = await page.goto('/', { waitUntil: 'networkidle' });
  expect(response?.ok()).toBeTruthy();
  expect(response?.headers()['x-avalaos-release']).toBe(expectedHead);
  expect(response?.headers()['x-avalaos-environment']).toBe('hosted_nonproduction_pilot');
  await expect(page.locator('#root')).toBeVisible();

  const results = await new AxeBuilder({ page }).include('#root').analyze();
  expect(results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([]);
});

test('hosted shell meets the bounded navigation and resource contracts', async ({ page }) => {
  const response = await page.goto('/', { waitUntil: 'networkidle' });
  expect(response?.ok()).toBeTruthy();
  expect(response?.headers()['x-avalaos-release']).toBe(expectedHead);
  expect(response?.headers()['x-avalaos-environment']).toBe('hosted_nonproduction_pilot');
  await expect(page.locator('#root')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (!navigation || !Number.isFinite(navigation.duration) || !Number.isFinite(navigation.domContentLoadedEventEnd)) return null;
    return {
      durationMs: navigation.duration,
      domContentLoadedMs: navigation.domContentLoadedEventEnd,
      resourceCount: performance.getEntriesByType('resource').length,
    };
  });

  expect(metrics, 'complete browser-owned navigation metrics are mandatory').not.toBeNull();
  expect(metrics!.durationMs).toBeLessThanOrEqual(MAX_NAVIGATION_DURATION_MS);
  expect(metrics!.domContentLoadedMs).toBeLessThanOrEqual(MAX_DOM_CONTENT_LOADED_MS);
  expect(metrics!.resourceCount).toBeLessThanOrEqual(MAX_RESOURCE_COUNT);
});
