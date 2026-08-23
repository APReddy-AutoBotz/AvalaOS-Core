import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request, type TestInfo } from '@playwright/test';
import fs from 'node:fs';
import { CANONICAL_AP_PROJECT_ID, CANONICAL_AP_WORKFLOW_NAME } from '../../data/mockData';
import { createAuthorityRequestObserver } from './authorityRequestObserver';

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

const readDurableProjectNavigation = async (page: Page) => page.evaluate(() => {
  const url = new URL(window.location.href);
  let persistedScope = null;
  try {
    persistedScope = JSON.parse(localStorage.getItem('avalaos-core-v1-scope') || 'null');
  } catch {
    // Malformed storage is deliberately represented as absent, never repaired evidence.
  }
  const urlProjectId = url.searchParams.get('projectId');
  const persistedProjectId = persistedScope?.id ?? null;
  return {
    urlView: url.searchParams.get('view'),
    urlScope: url.searchParams.get('scope'),
    urlProjectId,
    persistedView: JSON.parse(localStorage.getItem('avalaos-core-v1-view') || 'null'),
    persistedScopeType: persistedScope?.type ?? null,
    persistedProjectId,
    persistedProjectName: persistedScope?.name ?? null,
    projectRepresentationsConverged: urlProjectId !== null && urlProjectId === persistedProjectId,
  };
});

const canonicalDeliveryPackNavigation = {
  urlView: 'delivery_pack',
  urlScope: 'project',
  urlProjectId: CANONICAL_AP_PROJECT_ID,
  persistedView: 'delivery_pack',
  persistedScopeType: 'project',
  persistedProjectId: CANONICAL_AP_PROJECT_ID,
  persistedProjectName: CANONICAL_AP_WORKFLOW_NAME,
  projectRepresentationsConverged: true,
};

const canonicalBoardsNavigation = {
  ...canonicalDeliveryPackNavigation,
  urlView: 'boards',
  persistedView: 'boards',
};

const observeAuthorityRequests = (page: Page) => {
  const classifyDiagnosticOrigin = createDiagnosticOriginClassifier();
  const observer = createAuthorityRequestObserver<Request,NetworkViolation>({
    page,
    classify: classifyNetworkRequest,
    sample: (request, category) => ({
      method: request.method().toUpperCase(),
      category: category as NetworkViolationCategory,
      resourceType: request.resourceType(),
      originClass: classifyDiagnosticOrigin(request.url()),
    }),
    maxSamples: MAX_NETWORK_VIOLATION_SAMPLES,
  });
  return {
    assertSafe: () => expect(observer.snapshot(), 'Sandbox network traffic must remain inside the explicit static/navigation allowlist').toEqual({ totalViolations: 0, samples: [] }),
    stop: observer.stop,
  };
};

const openSandbox = async (page: Page) => {
  if (new URL(page.url()).pathname !== '/sandbox') {
    const response = await page.goto('/sandbox', { waitUntil: 'domcontentloaded' });
    assertHostedResponseIdentity(response);
  }
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
        await signOutToSandbox(page);
        observer.assertSafe();
        observer.stop();
      }
      return;
    }
    case 'network-safety': {
      for (const [label, userName] of personas) {
        const observer = observeAuthorityRequests(page);
        await enterPersona(page, label);
        await assertActivePersona(page, userName);
        await signOutToSandbox(page);
        observer.assertSafe();
        observer.stop();
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
      for (const [label, userName] of personas) {
        await enterPersona(page, label);
        await assertActivePersona(page, userName);
        await assertNoOverflow(page);
        await signOutToSandbox(page);
      }
      return;
    case 'keyboard-a11y': {
      for (const [label, userName] of personas) {
        await enterPersona(page, label);
        await assertActivePersona(page, userName);
        const skipLink = page.getByRole('link', { name: 'Skip to main content' });
        const isFirstSequentialTabStop = await skipLink.evaluate(target => {
          const candidates = [...document.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]')]
            .filter(element => element.tabIndex >= 0 && !element.hidden && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden');
          const ordered = candidates.map((element, index) => ({ element, index })).sort((left, right) => {
            const leftOrder = left.element.tabIndex > 0 ? left.element.tabIndex : Number.MAX_SAFE_INTEGER;
            const rightOrder = right.element.tabIndex > 0 ? right.element.tabIndex : Number.MAX_SAFE_INTEGER;
            return leftOrder - rightOrder || left.index - right.index;
          });
          return ordered[0]?.element === target;
        });
        expect(isFirstSequentialTabStop, 'skip link must remain the first sequential keyboard target').toBe(true);
        await skipLink.focus();
        await expect(skipLink).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.locator('#app-main')).toBeFocused();
        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
        await signOutToSandbox(page);
      }
      return;
    }
    case 'public-landing': {
      const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
      assertHostedResponseIdentity(response);
      await expect(page.getByRole('heading', { name: /Evaluate before you automate\./u })).toBeVisible();
      await expect(page.getByText('Synthetic sandbox for product exploration. No live execution.')).toBeVisible();
      return;
    }
    case 'sandbox-accepted-descendant': {
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
      await expect.poll(
        () => readDurableProjectNavigation(page),
        { message: 'The project-switch Boards destination must persist the exact URL and project identity.' },
      ).toEqual(canonicalBoardsNavigation);
      await page.evaluate(() => localStorage.setItem('avalaos-core-v1-scope', JSON.stringify({
        type: 'project',
        id: 'stale-different-project',
        name: 'Stale Different Project',
      })));
      const invalidBoardsResponse = await page.reload({ waitUntil: 'domcontentloaded' });
      assertHostedResponseIdentity(invalidBoardsResponse);
      await expect(page).not.toHaveURL(/projectId=/u, { timeout: 15_000 });
      await selectProjectScope(page, 'AP Invoice Exception Workflow');
      await expect.poll(() => readDurableProjectNavigation(page)).toEqual(canonicalBoardsNavigation);
      await clickProductNav(page, 'Delivery');
      await clickProductNav(page, 'Delivery Pack');
      await expect(page.getByRole('heading', { name: 'AP Invoice Exception Workflow Governed Delivery Pack', exact: true })).toBeVisible();
      await expect.poll(
        () => readDurableProjectNavigation(page),
        { message: 'The exact Delivery Pack project identity must be durable in the URL and persisted scope before reload.' },
      ).toEqual(canonicalDeliveryPackNavigation);

      const canonicalPersistedScope = await page.evaluate(() => localStorage.getItem('avalaos-core-v1-scope'));
      expect(canonicalPersistedScope, 'the canonical project scope must exist before stale-scope rejection coverage').not.toBeNull();
      const canonicalUrl = page.url();
      const invalidPersistedScopes = [
        JSON.stringify({ type: 'project', id: 'stale-different-project', name: 'Stale Different Project' }),
        null,
        '{malformed',
      ];
      for (const invalidScope of invalidPersistedScopes) {
        const invalidNavigationResponse = page.waitForResponse(response => (
          response.request().isNavigationRequest()
          && response.request().frame() === page.mainFrame()
        ));
        await page.evaluate(scope => {
          if (scope === null) localStorage.removeItem('avalaos-core-v1-scope');
          else localStorage.setItem('avalaos-core-v1-scope', scope);
          window.location.reload();
        }, invalidScope);
        const invalidResponse = await invalidNavigationResponse;
        await page.waitForLoadState('domcontentloaded');
        assertHostedResponseIdentity(invalidResponse);
        await expect(page).not.toHaveURL(/projectId=/u, { timeout: 15_000 });
        await expect(page.getByRole('heading', { name: 'AP Invoice Exception Workflow Governed Delivery Pack', exact: true })).toHaveCount(0);

        await page.evaluate(scope => {
          localStorage.setItem('avalaos-core-v1-scope', scope!);
          localStorage.setItem('avalaos-core-v1-view', JSON.stringify('delivery_pack'));
        }, canonicalPersistedScope);
        const setupResponse = await page.goto(canonicalUrl, { waitUntil: 'domcontentloaded' });
        assertHostedResponseIdentity(setupResponse);
        await expect.poll(() => readDurableProjectNavigation(page)).toEqual(canonicalDeliveryPackNavigation);
      }

      const response = await page.reload({ waitUntil: 'domcontentloaded' });
      assertHostedResponseIdentity(response);
      await assertActivePersona(page, 'Alicia Morgan');
      await expect(page.getByRole('heading', { name: 'AP Invoice Exception Workflow Governed Delivery Pack', exact: true })).toBeVisible();
      await expect.poll(
        () => readDurableProjectNavigation(page),
        { message: 'Reload must reconstruct the same exact Delivery Pack project identity in both representations.' },
      ).toEqual(canonicalDeliveryPackNavigation);
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
        await signOutToSandbox(page);
        observer.assertSafe();
        observer.stop();
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
    if (binding.scenario === 'keyboard-a11y') testInfo.setTimeout(180_000);
    await runScenario(binding.scenario!, page, testInfo);
  });
}
