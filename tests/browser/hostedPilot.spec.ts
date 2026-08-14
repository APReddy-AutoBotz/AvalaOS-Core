import { expect, test } from '@playwright/test';

const expectedHead = process.env.EXPECTED_RELEASE_SHA;
const expectedDeployId = process.env.EXPECTED_NETLIFY_DEPLOY_ID;

test.beforeAll(() => {
  expect(expectedHead, 'EXPECTED_RELEASE_SHA must bind acceptance to an exact release').toMatch(/^[0-9a-f]{40}$/);
  expect(expectedDeployId, 'EXPECTED_NETLIFY_DEPLOY_ID must bind acceptance to an exact Netlify deploy').toMatch(/^[0-9a-f]{24}$/);
});

test('hosted shell is exact-release, exact-deploy, non-production, responsive, and cannot mint authority', async ({ page }) => {
  const response = await page.goto('/', { waitUntil: 'networkidle' });
  expect(response?.ok()).toBeTruthy();
  expect(response?.headers()['x-avalaos-release']).toBe(expectedHead);
  expect(response?.headers()['x-avalaos-environment']).toBe('hosted_nonproduction_pilot');
  expect(response?.headers()['x-avalaos-netlify-deploy-id']).toBe(expectedDeployId);
  await expect(page.locator('#root')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/production authorized|customer data loaded/i);
  const authority = await page.evaluate(() => ({
    local: Object.keys(window['local' + 'Storage']), session: Object.keys(window['session' + 'Storage']),
    globals: Object.keys(globalThis).filter((key) => /service.?role|approval.?authority|provider.?secret/i.test(key)),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect([...authority.local, ...authority.session, ...authority.globals].join(' ')).not.toMatch(/service.?role|environment.?authority|release.?authority|provider.?secret/i);
  expect(authority.overflow).toBeLessThanOrEqual(1);
});

test('offline navigation never renders a false success', async ({ page, context }) => {
  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(response?.ok()).toBeTruthy();
  expect(response?.headers()['x-avalaos-release']).toBe(expectedHead);
  expect(response?.headers()['x-avalaos-environment']).toBe('hosted_nonproduction_pilot');
  expect(response?.headers()['x-avalaos-netlify-deploy-id']).toBe(expectedDeployId);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await expect(page.locator('body')).not.toContainText(/successfully (saved|approved|promoted|completed)/i);
});
