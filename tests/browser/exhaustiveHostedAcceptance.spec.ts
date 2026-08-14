import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request, type TestInfo } from '@playwright/test';
import fs from 'node:fs';

const releaseSha = process.env.ACCEPTANCE_RELEASE_SHA ?? process.env.EXPECTED_RELEASE_SHA;
const catalog = JSON.parse(fs.readFileSync('tests/acceptance/catalog/test-catalog.json', 'utf8'));
const bindings = JSON.parse(fs.readFileSync('tests/acceptance/execution-bindings.json', 'utf8'));
const catalogById = new Map(catalog.cases.map((item: any) => [item.testId, item]));
const forbiddenRemoteAuthority = /(?:supabase\.co|functions\/v1|generativelanguage|gemini|groq|api\.openai|anthropic)/iu;
const personas: Array<[string, string]> = [
  ['Process Analyst', 'Maya Patel'],
  ['AP Process Owner', 'Priya Nair'],
  ['Delivery Lead', 'Alicia Morgan'],
  ['Control Reviewer', 'Emily White'],
  ['Automation Contributor', 'Frank Miller'],
  ['Buyer Viewer', 'Sarah Chen'],
  ['Platform Admin', 'Henry Wilson'],
];

test.beforeAll(() => {
  expect(releaseSha, 'acceptance must bind to an exact release SHA').toMatch(/^[0-9a-f]{40}$/u);
});

const observeAuthorityRequests = (page: Page) => {
  const forbidden: Array<{ method: string; url: string; sensitiveHeaders: string[] }> = [];
  const inspect = (request: Request) => {
    const headers = request.headers();
    const sensitiveHeaders = Object.keys(headers).filter(name => /^(?:authorization|apikey|x-api-key)$/iu.test(name));
    if (forbiddenRemoteAuthority.test(request.url()) || sensitiveHeaders.length) {
      forbidden.push({
        method: request.method(),
        url: request.url().replace(/[?#].*$/u, ''),
        sensitiveHeaders,
      });
    }
  };
  page.on('request', inspect);
  return {
    assertSafe: () => expect(forbidden, 'Sandbox must not contact server authority or real AI providers').toEqual([]),
    stop: () => page.off('request', inspect),
  };
};

const openSandbox = async (page: Page) => {
  const response = await page.goto('/sandbox', { waitUntil: 'domcontentloaded' });
  expect(response?.ok(), 'hosted Sandbox response').toBeTruthy();
  expect(response?.headers()['x-avalaos-release'], 'exact hosted release').toBe(releaseSha);
  await expect(page.getByRole('heading', { name: 'Explore with synthetic data.' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Choose a sandbox persona' })).toBeVisible();
  await expect(page.getByText('Sandbox data is synthetic and local to this product exploration.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in to an organization.' })).toHaveCount(0);
};

const enterPersona = async (page: Page, label: string) => {
  await openSandbox(page);
  const choice = page.getByRole('button', { name: new RegExp(`^${label}\\b`, 'u') });
  await choice.click();
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: `Enter sandbox as ${label}` }).click();
  await expect(page.getByRole('button', { name: 'Toggle theme' })).toBeVisible({ timeout: 15_000 });
};

const openProductNavigation = async (page: Page) => {
  const opener = page.getByRole('button', { name: 'Open navigation' });
  if (await opener.isVisible().catch(() => false)) await opener.click();
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

const assertNoOverflow = async (page: Page) => {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(1);
};

const runScenario = async (scenario: string, page: Page, testInfo: TestInfo) => {
  switch (scenario) {
    case 'sandbox-access':
      await openSandbox(page);
      return;
    case 'persona-matrix':
      for (const [label, userName] of personas) {
        await openSandbox(page);
        const choice = page.getByRole('button', { name: new RegExp(`^${label}\\b`, 'u') });
        await choice.click();
        await page.getByRole('button', { name: `Enter sandbox as ${label}` }).click();
        await expect(page.getByText(userName, { exact: true })).toBeVisible({ timeout: 15_000 });
        await page.getByRole('button', { name: 'Sign Out' }).click();
        await expect(page.getByRole('heading', { name: 'Explore with synthetic data.' })).toBeVisible();
      }
      return;
    case 'local-authority': {
      const observer = observeAuthorityRequests(page);
      await enterPersona(page, 'Process Analyst');
      await expect(page.getByTestId('process-catalog-view')).toBeVisible();
      observer.assertSafe();
      observer.stop();
      return;
    }
    case 'network-safety': {
      for (const [label, userName] of personas) {
        const observer = observeAuthorityRequests(page);
        await enterPersona(page, label);
        await expect(page.getByText(userName, { exact: true })).toBeVisible({ timeout: 15_000 });
        observer.assertSafe();
        observer.stop();
        await page.getByRole('button', { name: 'Sign Out' }).click();
        await expect(page.getByRole('heading', { name: 'Explore with synthetic data.' })).toBeVisible();
      }
      return;
    }
    case 'sign-in-separation':
      await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Sign in to an organization.' })).toBeVisible();
      await expect(page.getByRole('group', { name: 'Choose a sandbox persona' })).toHaveCount(0);
      await expect(page.getByText('Server-authenticated access')).toBeVisible();
      return;
    case 'desktop-layout':
    case 'mobile-layout':
      await openSandbox(page);
      await assertNoOverflow(page);
      return;
    case 'keyboard-a11y': {
      await openSandbox(page);
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Skip to access' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#access-main')).toBeFocused();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      return;
    }
    case 'public-landing':
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: /Evaluate before you automate\./u })).toBeVisible();
      await expect(page.getByText('Synthetic sandbox for product exploration. No live execution.')).toBeVisible();
      return;
    case 'sandbox-descendant':
      await page.goto('/sandbox/unexpected-deep-link', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Explore with synthetic data.' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Sign in to an organization.' })).toHaveCount(0);
      return;
    case 'release-identity': {
      const response = await page.goto('/sandbox', { waitUntil: 'domcontentloaded' });
      expect(response?.headers()['x-avalaos-release']).toBe(releaseSha);
      return;
    }
    case 'process-create': {
      await enterPersona(page, 'Process Analyst');
      await expect(page.getByTestId('process-catalog-view')).toBeVisible();
      await page.getByRole('button', { name: 'New process' }).click();
      const name = `QA Synthetic Process ${releaseSha?.slice(0, 7)}`;
      await page.getByLabel('Process Name *').fill(name);
      await page.getByLabel('Description').fill('Deterministic synthetic acceptance fixture; no customer data.');
      await page.getByLabel('Department').fill('Synthetic QA');
      await page.getByRole('button', { name: 'Create Process' }).click();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
      return;
    }
    case 'completed-assessment': {
      await enterPersona(page, 'Process Analyst');
      const row = page.getByRole('row').filter({ hasText: 'AP Invoice Exception Handling' });
      await expect(row).toContainText('Completed');
      await expect(row).toContainText('High');
      return;
    }
    case 'incomplete-assessment': {
      await enterPersona(page, 'Process Analyst');
      await page.getByRole('button', { name: 'New process' }).click();
      const name = `QA Incomplete ${releaseSha?.slice(0, 7)}`;
      await page.getByLabel('Process Name *').fill(name);
      await page.getByRole('button', { name: 'Create Process' }).click();
      const row = page.getByRole('row').filter({ hasText: name });
      await expect(row).toContainText('Not Started');
      return;
    }
    case 'delivery-pack':
      await enterPersona(page, 'Delivery Lead');
      await clickProductNav(page, 'Delivery Pack');
      await expect(page.getByText('Governed Delivery Pack')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Markdown' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'JSON' })).toBeDisabled();
      await expect(page.locator('body')).toContainText('AP Invoice Exception');
      return;
    case 'monitor-lineage':
      await enterPersona(page, 'Buyer Viewer');
      await expect(page.getByTestId('monitor-overview')).toBeVisible();
      await expect(page.getByText('Handoff lineage')).toBeVisible();
      return;
    case 'monitor-value':
      await enterPersona(page, 'Buyer Viewer');
      await expect(page.getByTestId('monitor-overview')).toBeVisible();
      await expect(page.getByText(/Recorded outcome|readiness signals/iu).first()).toBeVisible();
      return;
    case 'monitor-blockers':
      await enterPersona(page, 'Buyer Viewer');
      await expect(page.getByTestId('monitor-overview')).toBeVisible();
      await expect(page.getByText('Blocked work')).toBeVisible();
      await expect(page.getByText('Delivery blockers')).toBeVisible();
      return;
    case 'admin-navigation':
      await enterPersona(page, 'Platform Admin');
      await openProductNavigation(page);
      {
        const admin = page.getByRole('button', { name: 'Admin / Intelligence' });
        await expect(admin).toBeVisible();
        await admin.click();
        await expect(admin).toHaveAttribute('aria-current', 'page');
      }
      return;
    case 'non-admin-denial':
      await enterPersona(page, 'Process Analyst');
      await openProductNavigation(page);
      await expect(page.getByRole('button', { name: 'Admin / Intelligence' })).toHaveCount(0);
      return;
    case 'admin-capability-view':
      await enterPersona(page, 'Platform Admin');
      await openProductNavigation(page);
      {
        const admin = page.getByRole('button', { name: 'Admin / Intelligence' });
        await expect(admin).toBeVisible();
        await admin.click();
        await expect(page.locator('body')).toContainText(/Enterprise Intelligence|Administration|Provider|Role/iu);
      }
      return;
    case 'reload-reconstruction':
      await openSandbox(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('group', { name: 'Choose a sandbox persona' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Sign in to an organization.' })).toHaveCount(0);
      return;
    case 'horizontal-overflow':
      await enterPersona(page, 'Process Analyst');
      await assertNoOverflow(page);
      return;
    case 'serious-critical-a11y': {
      for (const [label] of personas) {
        const observer = observeAuthorityRequests(page);
        await enterPersona(page, label);
        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
        observer.assertSafe();
        observer.stop();
        await page.getByRole('button', { name: 'Sign Out' }).click();
        await expect(page.getByRole('heading', { name: 'Explore with synthetic data.' })).toBeVisible();
      }
      return;
    }
    default:
      throw new Error(`Unknown hosted acceptance scenario: ${scenario} (${testInfo.project.name})`);
  }
};

for (const binding of bindings.hostedTests as Array<{ testId: string; scenario: string | null; projects: string[]; blockedReason?: string }>) {
  const testCase = catalogById.get(binding.testId) as any;
  if (!testCase) throw new Error(`Hosted binding references unknown Test ID ${binding.testId}`);
  const title = `[${binding.testId}] ${testCase.title}`;
  test(title, async ({ page }, testInfo) => {
    test.skip(!binding.projects.includes(testInfo.project.name), `Not required in ${testInfo.project.name}`);
    test.skip(!binding.scenario, binding.blockedReason || 'No deterministic hosted scenario exposed.');
    await runScenario(binding.scenario!, page, testInfo);
  });
}
