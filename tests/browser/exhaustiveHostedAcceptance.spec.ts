import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request, type TestInfo } from '@playwright/test';
import fs from 'node:fs';

const releaseSha = process.env.ACCEPTANCE_RELEASE_SHA ?? process.env.EXPECTED_RELEASE_SHA;
const deployId = process.env.NETLIFY_DEPLOY_ID;
const rawHostedUrl = process.env.HOSTED_PILOT_URL;
const hostedOrigin = rawHostedUrl ? new URL(rawHostedUrl).origin : null;
const catalog = JSON.parse(fs.readFileSync('tests/acceptance/catalog/test-catalog.json', 'utf8'));
const bindings = JSON.parse(fs.readFileSync('tests/acceptance/execution-bindings.json', 'utf8'));
const indexHtml = fs.readFileSync('index.html', 'utf8');
const importMapMatch = indexHtml.match(/<script\b[^>]*\btype=["']importmap["'][^>]*>([\s\S]*?)<\/script>/iu);
if (!importMapMatch) throw new Error('Hosted acceptance requires the declared index.html import map.');
const importMap = JSON.parse(importMapMatch[1]) as { imports?: Record<string, string> };
const declaredGoogleStylesheetUrls = new Set(
  [...indexHtml.matchAll(/<link\b[^>]*\bhref=["'](https:\/\/fonts\.googleapis\.com[^"']+)["'][^>]*>/giu)]
    .map(([, source]) => new URL(source).toString()),
);
const declaredJsDelivrScriptPaths = new Set(
  [...indexHtml.matchAll(/<script\b[^>]*\bsrc=["'](https:\/\/cdn\.jsdelivr\.net[^"']+)["'][^>]*>/giu)]
    .map(([, source]) => new URL(source).pathname),
);
const declaredAiStudioScriptRules = Object.values(importMap.imports ?? {})
  .map(source => ({ source, url: new URL(source) }))
  .filter(({ url }) => url.origin === 'https://aistudiocdn.com')
  .map(({ source, url }) => ({ pathname: url.pathname, prefix: source.endsWith('/') }));
const catalogById = new Map(catalog.cases.map((item: any) => [item.testId, item]));
const personas: Array<[string, string]> = [
  ['Process Analyst', 'Maya Patel'],
  ['AP Process Owner', 'Priya Nair'],
  ['Delivery Lead', 'Alicia Morgan'],
  ['Control Reviewer', 'Emily White'],
  ['Automation Contributor', 'Frank Miller'],
  ['Buyer Viewer', 'Sarah Chen'],
  ['Platform Admin', 'Henry Wilson'],
];

type NetworkViolationCategory = 'credential-header' | 'non-read-method' | 'unexpected-origin' | 'unexpected-document-route' | 'authority-request' | 'unexpected-resource';
type NetworkViolation = { method: string; category: NetworkViolationCategory; resourceType: string; originClass: string };
const MAX_NETWORK_VIOLATION_SAMPLES = 25;
const UNAVAILABLE_NETWORK_ORIGIN_CLASS = 'unavailable-origin';
const HOSTED_NETWORK_ORIGIN_CLASS = 'hosted-origin';
const EXTERNAL_NETWORK_ORIGIN_OVERFLOW_CLASS = 'external-origin-overflow';
const safeDocumentPath = (pathname: string): boolean => pathname === '/' || pathname === '/sandbox' || pathname === '/sign-in' || pathname.startsWith('/sandbox/');
const safeStaticPath = (pathname: string): boolean => pathname.startsWith('/assets/') || /^\/(?:favicon(?:\.ico|\.svg)?|apple-touch-icon\.png|manifest\.webmanifest|robots\.txt)$/u.test(pathname);
const isDeclaredAiStudioScript = (url: URL): boolean => declaredAiStudioScriptRules.some(rule => (
  rule.prefix ? url.pathname.startsWith(rule.pathname) : url.pathname === rule.pathname
));
const safeExternalStaticResource = (url: URL, resourceType: string): boolean => {
  if (url.origin === 'https://fonts.googleapis.com') {
    // Axe re-reads the exact declared cross-origin stylesheet through XHR while
    // inspecting accessibility. The request remains a read-only static asset
    // and must still match the URL declared in index.html exactly.
    return (resourceType === 'stylesheet' || resourceType === 'xhr') && declaredGoogleStylesheetUrls.has(url.toString());
  }
  if (url.origin === 'https://fonts.gstatic.com') return resourceType === 'font' && url.pathname.startsWith('/s/');
  if (url.origin === 'https://cdn.jsdelivr.net') return resourceType === 'script' && declaredJsDelivrScriptPaths.has(url.pathname);
  if (url.origin === 'https://aistudiocdn.com') return resourceType === 'script' && isDeclaredAiStudioScript(url);
  return false;
};
const createDiagnosticOriginClassifier = () => {
  const externalOriginClasses = new Map<string, string>();
  return (requestUrl: string): string => {
    try {
      const url = new URL(requestUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return UNAVAILABLE_NETWORK_ORIGIN_CLASS;
      if (hostedOrigin && url.origin === hostedOrigin) return HOSTED_NETWORK_ORIGIN_CLASS;
      const existing = externalOriginClasses.get(url.origin);
      if (existing) return existing;
      if (externalOriginClasses.size >= MAX_NETWORK_VIOLATION_SAMPLES) return EXTERNAL_NETWORK_ORIGIN_OVERFLOW_CLASS;
      const originClass = `external-origin-${externalOriginClasses.size + 1}`;
      externalOriginClasses.set(url.origin, originClass);
      return originClass;
    } catch {
      return UNAVAILABLE_NETWORK_ORIGIN_CLASS;
    }
  };
};
const classifyNetworkRequest = (request: Request): NetworkViolationCategory | null => {
  const method = request.method().toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return 'non-read-method';
  const headers = request.headers();
  if (Object.keys(headers).some(name => /^(?:authorization|apikey|x-api-key)$/iu.test(name))) return 'credential-header';
  const url = new URL(request.url());
  const resourceType = request.resourceType();
  if (!hostedOrigin || url.origin !== hostedOrigin) return safeExternalStaticResource(url, resourceType) ? null : 'unexpected-origin';
  if (resourceType === 'document') return safeDocumentPath(url.pathname) ? null : 'unexpected-document-route';
  if (resourceType === 'fetch' || resourceType === 'xhr' || resourceType === 'websocket' || resourceType === 'eventsource') return 'authority-request';
  if (['script', 'stylesheet', 'font', 'image', 'media', 'other'].includes(resourceType) && safeStaticPath(url.pathname)) return null;
  return 'unexpected-resource';
};

test.beforeAll(() => {
  expect(releaseSha, 'acceptance must bind to an exact release SHA').toMatch(/^[0-9a-f]{40}$/u);
  expect(deployId, 'hosted execution must bind to an exact Netlify deployment ID').toMatch(/^[0-9a-f]{24}$/u);
  expect(hostedOrigin, 'hosted execution must bind to an exact hosted origin').toMatch(/^https:\/\//u);
  expect(declaredGoogleStylesheetUrls.size, 'hosted acceptance must bind Google Fonts to index.html stylesheet declarations').toBeGreaterThan(0);
  expect(declaredJsDelivrScriptPaths.size, 'hosted acceptance must bind jsDelivr to index.html script declarations').toBeGreaterThan(0);
  expect(declaredAiStudioScriptRules.length, 'hosted acceptance must bind AI Studio CDN to index.html import-map declarations').toBeGreaterThan(0);
});

const assertHostedResponseIdentity = (response: Awaited<ReturnType<Page['goto']>>) => {
  expect(response?.ok(), 'hosted response').toBeTruthy();
  const headers = response?.headers() ?? {};
  expect(headers['x-avalaos-release'], 'exact hosted release').toBe(releaseSha);
  expect(headers['x-avalaos-environment'], 'hosted nonproduction environment').toBe('hosted_nonproduction_pilot');
  expect(headers['x-avalaos-netlify-deploy-id'], 'exact hosted Netlify deployment').toBe(deployId);
};

const observeAuthorityRequests = (page: Page) => {
  const samples: NetworkViolation[] = [];
  const classifyDiagnosticOrigin = createDiagnosticOriginClassifier();
  let totalViolations = 0;
  const inspect = (request: Request) => {
    const category = classifyNetworkRequest(request);
    if (category) {
      totalViolations += 1;
      if (samples.length < MAX_NETWORK_VIOLATION_SAMPLES) {
        samples.push({
          method: request.method().toUpperCase(),
          category,
          resourceType: request.resourceType(),
          originClass: classifyDiagnosticOrigin(request.url()),
        });
      }
    }
  };
  page.on('request', inspect);
  return {
    assertSafe: () => expect({ totalViolations, samples }, 'Sandbox network traffic must remain inside the explicit static/navigation allowlist').toEqual({ totalViolations: 0, samples: [] }),
    stop: () => page.off('request', inspect),
  };
};

const openSandbox = async (page: Page) => {
  const response = await page.goto('/sandbox', { waitUntil: 'domcontentloaded' });
  assertHostedResponseIdentity(response);
  await expect(page.getByRole('heading', { name: 'Explore with synthetic data.' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Choose a sandbox persona' })).toBeVisible();
  await expect(page.getByText('Sandbox data is synthetic and local to this product exploration.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in to an organization.' })).toHaveCount(0);
};

const personaChoice = (page: Page, label: string) => page
  .getByRole('group', { name: 'Choose a sandbox persona' })
  .getByRole('button')
  .filter({ hasText: label });

const enterPersona = async (page: Page, label: string) => {
  await openSandbox(page);
  const choice = personaChoice(page, label);
  await expect(choice).toHaveCount(1);
  await choice.click();
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: `Enter sandbox as ${label}` }).click();
  await expect(page.getByRole('button', { name: 'Toggle theme' })).toBeVisible({ timeout: 15_000 });
};

const openProductNavigation = async (page: Page) => {
  const opener = page.getByRole('button', { name: 'Open navigation' });
  if (!(await opener.isVisible().catch(() => false))) return;
  const mobileIdentity = page.getByTestId('mobile-current-user');
  if (await mobileIdentity.isVisible().catch(() => false)) return;
  await opener.click();
  await expect(mobileIdentity).toBeVisible({ timeout: 15_000 });
};
const assertActivePersona = async (page: Page, userName: string) => {
  await openProductNavigation(page);
  const mobileIdentity = page.getByTestId('mobile-current-user');
  if (await mobileIdentity.isVisible().catch(() => false)) {
    await expect(mobileIdentity.getByText(userName, { exact: true })).toBeVisible({ timeout: 15_000 });
    return;
  }
  await expect(page.getByTestId('desktop-current-user').getByText(userName, { exact: true })).toBeVisible({ timeout: 15_000 });
};

const signOutToSandbox = async (page: Page) => {
  await openProductNavigation(page);
  const mobileSignOut = page.getByTestId('mobile-sign-out');
  if (await mobileSignOut.isVisible().catch(() => false)) {
    await mobileSignOut.click();
  } else {
    await page.getByTestId('desktop-current-user').getByRole('button', { name: 'Sign Out' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Explore with synthetic data.' })).toBeVisible({ timeout: 15_000 });
};

const selectProjectScope = async (page: Page, projectName: string) => {
  const switcher = page.getByRole('button', { name: 'Switch workspace context' });
  await expect(switcher).toBeVisible();
  await switcher.click();
  const project = page.getByRole('button', { name: projectName, exact: true });
  await expect(project).toBeVisible();
  await project.click();
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
        const choice = personaChoice(page, label);
        await expect(choice).toHaveCount(1);
        await choice.click();
        await page.getByRole('button', { name: `Enter sandbox as ${label}` }).click();
        await assertActivePersona(page, userName);
        await signOutToSandbox(page);
      }
      return;
    case 'local-authority': {
      for (const [label, userName] of personas) {
        const observer = observeAuthorityRequests(page);
        await enterPersona(page, label);
        await assertActivePersona(page, userName);
        if (label === 'Process Analyst') {
          await clickProductNav(page, 'Assess');
          await expect(page.getByTestId('process-catalog-view')).toBeVisible();
        }
        observer.assertSafe();
        observer.stop();
        await signOutToSandbox(page);
      }
      return;
    }
    case 'network-safety': {
      for (const [label, userName] of personas) {
        const observer = observeAuthorityRequests(page);
        await enterPersona(page, label);
        await assertActivePersona(page, userName);
        observer.assertSafe();
        observer.stop();
        await signOutToSandbox(page);
      }
      return;
    }
    case 'sign-in-separation': {
      const response = await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
      assertHostedResponseIdentity(response);
      await expect(page.getByRole('heading', { name: 'Sign in to an organization.' })).toBeVisible();
      await expect(page.getByRole('group', { name: 'Choose a sandbox persona' })).toHaveCount(0);
      await expect(page.getByText('Server-authenticated access')).toBeVisible();
      return;
    }
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
    case 'public-landing': {
      const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
      assertHostedResponseIdentity(response);
      await expect(page.getByRole('heading', { name: /Evaluate before you automate\./u })).toBeVisible();
      await expect(page.getByText('Synthetic sandbox for product exploration. No live execution.')).toBeVisible();
      return;
    }
    case 'sandbox-descendant': {
      const response = await page.goto('/sandbox/unexpected-deep-link', { waitUntil: 'domcontentloaded' });
      assertHostedResponseIdentity(response);
      await expect(page.getByRole('heading', { name: 'Explore with synthetic data.' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Sign in to an organization.' })).toHaveCount(0);
      return;
    }
    case 'release-identity': {
      const response = await page.goto('/sandbox', { waitUntil: 'domcontentloaded' });
      assertHostedResponseIdentity(response);
      return;
    }
    case 'process-create': {
      await enterPersona(page, 'Process Analyst');
      await clickProductNav(page, 'Assess');
      await expect(page.getByTestId('process-catalog-view')).toBeVisible();
      await page.getByRole('button', { name: 'New process' }).click();
      const name = `QA Synthetic Process ${releaseSha?.slice(0, 7)}`;
      await page.getByLabel('Process Name *').fill(name);
      await page.getByLabel('Description').fill('Deterministic synthetic acceptance fixture; no customer data.');
      await page.getByLabel('Department').fill('Synthetic QA');
      await page.getByLabel('Assessed Criticality').selectOption('High');
      await page.getByRole('button', { name: 'Create Process' }).click();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
      return;
    }
    case 'completed-assessment': {
      await enterPersona(page, 'Process Analyst');
      await clickProductNav(page, 'Assess');
      const row = page.getByRole('row').filter({ hasText: 'AP Invoice Exception Handling' });
      await expect(row).toContainText('Completed');
      await expect(row).toContainText('High');
      return;
    }
    case 'incomplete-assessment': {
      await enterPersona(page, 'Process Analyst');
      await clickProductNav(page, 'Assess');
      await page.getByRole('button', { name: 'New process' }).click();
      const name = `QA Incomplete ${releaseSha?.slice(0, 7)}`;
      await page.getByLabel('Process Name *').fill(name);
      await page.getByRole('button', { name: 'Create Process' }).click();
      const row = page.getByRole('row').filter({ hasText: name });
      await expect(row).toContainText('Draft');
      return;
    }
    case 'delivery-pack':
      await enterPersona(page, 'Delivery Lead');
      await selectProjectScope(page, 'AP Invoice Exception Workflow');
      await clickProductNav(page, 'Delivery');
      await clickProductNav(page, 'Delivery Pack');
      await expect(page.getByRole('heading', { name: 'AP Invoice Exception Workflow Governed Delivery Pack', exact: true })).toBeVisible();
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
        await expect(page.getByRole('heading', { name: 'Enterprise Intelligence', exact: true })).toBeVisible();
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
        await expect(page.getByRole('heading', { name: 'Enterprise Intelligence', exact: true })).toBeVisible();
      }
      return;
    case 'reload-reconstruction': {
      await enterPersona(page, 'Delivery Lead');
      await selectProjectScope(page, 'AP Invoice Exception Workflow');
      await assertActivePersona(page, 'Alicia Morgan');
      await clickProductNav(page, 'Delivery');
      await clickProductNav(page, 'Delivery Pack');
      await expect(page.getByRole('heading', { name: 'AP Invoice Exception Workflow Governed Delivery Pack', exact: true })).toBeVisible();
      await expect.poll(async () => {
        const url = new URL(page.url());
        const persisted = await page.evaluate(() => ({
          view: JSON.parse(localStorage.getItem('avalaos-core-v1-view') || 'null'),
          scope: JSON.parse(localStorage.getItem('avalaos-core-v1-scope') || 'null'),
        }));
        return {
          urlView: url.searchParams.get('view'),
          urlScope: url.searchParams.get('scope'),
          hasProjectId: Boolean(url.searchParams.get('projectId')),
          persistedView: persisted.view,
          persistedScopeType: persisted.scope?.type ?? null,
        };
      }, { message: 'Delivery Pack navigation must be durable before reload.' }).toEqual({
        urlView: 'delivery_pack',
        urlScope: 'project',
        hasProjectId: true,
        persistedView: 'delivery_pack',
        persistedScopeType: 'project',
      });
      const response = await page.reload({ waitUntil: 'domcontentloaded' });
      assertHostedResponseIdentity(response);
      await assertActivePersona(page, 'Alicia Morgan');
      await expect(page.getByRole('heading', { name: 'AP Invoice Exception Workflow Governed Delivery Pack', exact: true })).toBeVisible();
      await expect(page.getByRole('group', { name: 'Choose a sandbox persona' })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Sign in to an organization.' })).toHaveCount(0);
      return;
    }
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
        await signOutToSandbox(page);
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
