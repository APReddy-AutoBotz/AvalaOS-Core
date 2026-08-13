import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request } from '@playwright/test';

const releaseSha = process.env.ACCEPTANCE_RELEASE_SHA ?? process.env.EXPECTED_RELEASE_SHA;
const sandboxPersonas = [
  'Process Analyst',
  'AP Process Owner',
  'Delivery Lead',
  'Control Reviewer',
  'Automation Contributor',
  'Buyer Viewer',
  'Platform Admin',
] as const;
const forbiddenRemoteAuthority = /(?:supabase|functions\/v1|generativelanguage|gemini|groq|openai|anthropic)/iu;
const falseSuccess = /successfully\s+(?:saved|approved|generated|promoted|completed|deleted|submitted)/iu;

test.beforeAll(() => {
  expect(releaseSha, 'acceptance must bind to an exact release SHA').toMatch(/^[0-9a-f]{40}$/u);
});

const observeAuthorityRequests = (page: Page) => {
  const forbidden: Array<{ method: string; url: string; headers: string[] }> = [];
  const inspect = (request: Request) => {
    const headers = request.headers();
    const sensitiveHeaders = Object.keys(headers).filter(name => /^(?:authorization|apikey|x-api-key)$/iu.test(name));
    if (forbiddenRemoteAuthority.test(request.url()) || sensitiveHeaders.length > 0) {
      forbidden.push({ method: request.method(), url: request.url().replace(/[?#].*$/u, ''), headers: sensitiveHeaders });
    }
  };
  page.on('request', inspect);
  return {
    assertSafe: () => expect(forbidden, 'Sandbox must not contact server authority or real AI providers').toEqual([]),
    stop: () => page.off('request', inspect),
  };
};

const openSandboxAccess = async (page: Page) => {
  const response = await page.goto('/sandbox', { waitUntil: 'networkidle' });
  expect(response?.ok(), '[SANDBOX-ACCESS-001] hosted Sandbox response').toBeTruthy();
  expect(response?.headers()['x-avalaos-release'], '[SANDBOX-ACCESS-002] exact hosted release').toBe(releaseSha);
  await expect(page.getByRole('heading', { name: 'Explore with synthetic data.' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Choose a sandbox persona' })).toBeVisible();
  await expect(page.getByText('Sandbox data is synthetic and local to this product exploration.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in to an organization.' })).toHaveCount(0);
};

test('[SANDBOX-ACCESS-001] /sandbox is synthetic, release-bound, and network-safe', async ({ page }) => {
  const requests = observeAuthorityRequests(page);
  await openSandboxAccess(page);
  await expect(page.getByRole('button', { name: /^Enter sandbox as /u })).toBeEnabled();
  requests.assertSafe();
  requests.stop();
});

for (const persona of sandboxPersonas) {
  test(`[SANDBOX-PERSONA-${persona.toUpperCase().replaceAll(' ', '-')}-001] ${persona} enters the real hosted synthetic workspace`, async ({ page }) => {
    const requests = observeAuthorityRequests(page);
    await openSandboxAccess(page);
    const choice = page.getByRole('button', { name: new RegExp(`^${persona}\\b`, 'u') });
    await choice.click();
    await expect(choice).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: `Enter sandbox as ${persona}` }).click();
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).not.toContainText(falseSuccess);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    requests.assertSafe();
    requests.stop();
  });
}

test('[SANDBOX-DEEPLINK-001] normal sign-in cannot acquire synthetic Sandbox authority', async ({ page }) => {
  const response = await page.goto('/sign-in', { waitUntil: 'networkidle' });
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Sign in to an organization.' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Choose a sandbox persona' })).toHaveCount(0);
  await expect(page.getByText('Server-authenticated access')).toBeVisible();
});

test('[SANDBOX-DEEPLINK-002] Sandbox descendant routes retain the explicit synthetic boundary', async ({ page }) => {
  await page.goto('/sandbox/unexpected-deep-link', { waitUntil: 'networkidle' });
  await expect(page.getByRole('group', { name: 'Choose a sandbox persona' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in to an organization.' })).toHaveCount(0);
});

test('[SANDBOX-A11Y-001] access is keyboard-operable with visible focus and no serious axe findings', async ({ page }) => {
  await openSandboxAccess(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to access' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#access-main')).toBeFocused();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('[SANDBOX-OFFLINE-001] offline reload never reports success or silently enters a persona', async ({ page, context }) => {
  await openSandboxAccess(page);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await expect(page.locator('body')).not.toContainText(falseSuccess);
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(0);
});
