import { expect, test, type Page } from '@playwright/test';
import { openProductNavigation } from './productNavigationReadiness';

const LOCAL_ORIGIN = process.env.LOCAL_ASSETS_BASE_URL;
if (!/^http:\/\/127[.]0[.]0[.]1:\d{2,5}$/u.test(LOCAL_ORIGIN ?? '')) {
  throw new Error('LOCAL_ASSETS_EXACT_LOOPBACK_ORIGIN_REQUIRED');
}

type BlockedRequest = Readonly<{ resourceType: string }>;

const observeNetwork = async (page: Page) => {
  const pageErrors: string[] = [];
  const blocked: BlockedRequest[] = [];
  const blockedWebSockets: string[] = [];
  const localScripts: string[] = [];
  const context = page.context();
  page.on('pageerror', error => pageErrors.push(error.name));
  context.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === LOCAL_ORIGIN && request.resourceType() === 'script') localScripts.push(url.pathname);
  });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === LOCAL_ORIGIN) return route.continue();
    blocked.push({ resourceType: request.resourceType() });
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket(/.*/u, async socket => {
    blockedWebSockets.push('websocket');
    await socket.close({ code: 1008, reason: 'Loopback browser proof blocks WebSockets' });
  });
  return {
    blocked,
    blockedWebSockets,
    localScripts,
    assertSafe: () => {
      expect(pageErrors).toEqual([]);
      expect(blockedWebSockets).toEqual([]);
    },
  };
};

const injectExternalRequests = async (page: Page) => {
  await page.evaluate(async () => {
    const script = document.createElement('script');
    script.src = 'https://local-assets.invalid/injected.js';
    document.head.append(script);
    const image = document.createElement('img');
    image.src = 'https://local-assets.invalid/injected.png';
    image.alt = '';
    document.body.append(image);
    await fetch('https://local-assets.invalid/injected.json').catch(() => undefined);
  });
};

const enterDeliverySandbox = async (page: Page) => {
  await page.goto('/sandbox', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Explore with synthetic data.' })).toBeVisible();
  const personas = page.getByRole('group', { name: 'Choose a sandbox persona' });
  const choice = personas.getByRole('button').filter({ hasText: 'Delivery Lead' });
  await choice.click();
  await page.getByRole('button', { name: 'Enter sandbox as Delivery Lead' }).click();
  await expect(page.getByRole('button', { name: 'Toggle theme' })).toBeVisible({ timeout: 15_000 });
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

const selectProject = async (page: Page) => {
  await page.getByRole('button', { name: 'Switch workspace context' }).click();
  await page.getByRole('button', { name: 'AP Invoice Exception Workflow', exact: true }).click();
};

const mermaidCoreRequests = (requests: string[]) => requests.filter(url => /\/mermaid(?:-parser)?[.]core-/u.test(url));

test('ordinary production public and sign-in assets stay local and injected egress is stopped', async ({ page }) => {
  const network = await observeNetwork(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: /Evaluate before you automate/u })).toBeVisible();
  expect(network.blocked).toEqual([]);
  expect(mermaidCoreRequests(network.localScripts)).toEqual([]);

  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/sign-in$/u);
  await expect(page.getByRole('heading', { name: 'Explore with synthetic data.' })).toBeVisible();
  await expect(page.locator('img[src^="http"]')).toHaveCount(0);
  expect(network.blocked).toEqual([]);

  await injectExternalRequests(page);
  await expect.poll(() => network.blocked.length).toBe(3);
  expect(network.blocked.map(request => request.resourceType).sort()).toEqual(['fetch', 'image', 'script']);
  network.assertSafe();
});

test('ordinary production Sandbox renders marked and Mermaid locally in light and dark themes', async ({ page }) => {
  const network = await observeNetwork(page);
  await enterDeliverySandbox(page);
  expect(network.blocked).toEqual([]);
  expect(mermaidCoreRequests(network.localScripts)).toEqual([]);

  await selectProject(page);
  await clickProductNav(page, 'Studio');
  await clickProductNav(page, 'Document Vault');
  await expect(page.getByRole('heading', { name: 'Document Repository' })).toBeVisible();
  await page.getByRole('button', { name: 'View', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Generated Artifacts' })).toBeVisible();
  await expect(page.locator('.doc-section').first()).toContainText('AP analysts triage invoice exceptions');
  await expect(page.locator('.doc-section script, .doc-section img, .doc-section [onerror], .doc-section a[href^="javascript:"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Diagrams', exact: true }).click();
  const diagrams = page.locator('.mermaid-container svg');
  await expect(diagrams).toHaveCount(2, { timeout: 15_000 });
  await expect.poll(() => mermaidCoreRequests(network.localScripts).length).toBeGreaterThan(0);
  expect(network.blocked).toEqual([]);

  const hostileResult = await page.evaluate(async () => {
    const resources = performance.getEntriesByType('resource').map(entry => entry.name);
    const safeMarkdownUrl = resources.find(url => /\/safeMarkdown-[^/]+[.]js$/u.test(url));
    const mermaidUrl = resources.find(url => /\/mermaid[.]core-[^/]+[.]js$/u.test(url));
    if (!safeMarkdownUrl || !mermaidUrl) throw new Error('LOCAL_ASSET_MODULE_URL_MISSING');
    const safeModule = await import(safeMarkdownUrl);
    const mermaidModule = await import(mermaidUrl);
    const functions = Object.values(safeModule).filter((value): value is (source: string) => string => typeof value === 'function');
    const hostileMarkdown = '# Safe heading\n\n[blocked](javascript:alert(1)) <img src=x onerror=alert(1)> <script>alert(1)</script>';
    const markdownMatches = functions.map(candidate => {
      try { return candidate(hostileMarkdown); } catch { return ''; }
    }).filter(result => typeof result === 'string' && result.includes('<h1>Safe heading</h1>'));
    if (markdownMatches.length !== 1) throw new Error(`LOCAL_MARKED_RENDERER_EXPORT_COUNT_${markdownMatches.length}`);
    const markdownHtml = markdownMatches[0];
    const markdownTemplate = document.createElement('template');
    markdownTemplate.innerHTML = markdownHtml;
    const unsafeMarkdownNodes = markdownTemplate.content.querySelectorAll('script, img, [onerror], [onload], [onclick], a[href^="javascript:"]').length;

    mermaidModule.default.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      flowchart: { htmlLabels: false },
      suppressErrorRendering: true,
    });
    const renderId = `local-assets-hostile-${crypto.randomUUID()}`;
    const hostileDiagram = 'flowchart LR\n  Start["<img src=x onerror=alert(1)>"] --> Review[Human review]\n  click Start "javascript:alert(1)"';
    const rendered = await mermaidModule.default.render(renderId, hostileDiagram);
    const rawHostileSvg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><foreignObject><img src="x" onerror="alert(1)" /></foreignObject><a href="javascript:alert(1)"><text onclick="alert(1)">unsafe</text></a><text>safe</text></svg>';
    const sanitizerMatches = functions.map(candidate => {
      try { return candidate(rawHostileSvg); } catch { return ''; }
    }).filter(result => typeof result === 'string' && result.includes('<svg'));
    if (sanitizerMatches.length !== 1) throw new Error(`LOCAL_MERMAID_SANITIZER_EXPORT_COUNT_${sanitizerMatches.length}`);
    const sanitizer = functions.find(candidate => {
      try { return candidate(rawHostileSvg) === sanitizerMatches[0]; } catch { return false; }
    });
    if (!sanitizer) throw new Error('LOCAL_MERMAID_SANITIZER_EXPORT_MISSING');
    const sanitizedHostileSvg = sanitizerMatches[0];
    const sanitizedRenderedSvg = sanitizer(rendered.svg);
    const inspectSvg = (source: string) => {
      const document_ = new DOMParser().parseFromString(source, 'image/svg+xml');
      const elements = [...document_.querySelectorAll('*')];
      return {
        parserErrors: document_.querySelectorAll('parsererror').length,
        forbiddenTags: document_.querySelectorAll('script, foreignObject, style').length,
        dangerousAttributes: elements.flatMap(element => [...element.attributes]).filter(attribute => (
          /^on/iu.test(attribute.name) || /^(?:javascript|data):/iu.test(attribute.value.trim())
        )).length,
      };
    };
    document.getElementById(renderId)?.remove();
    document.getElementById(`d${renderId}`)?.remove();
    document.getElementById(`i${renderId}`)?.remove();
    return {
      markdownHtml,
      unsafeMarkdownNodes,
      hostileSvgInspection: inspectSvg(sanitizedHostileSvg),
      renderedSvgInspection: inspectSvg(sanitizedRenderedSvg),
    };
  });
  expect(hostileResult.markdownHtml).toContain('<h1>Safe heading</h1>');
  expect(hostileResult.unsafeMarkdownNodes).toBe(0);
  expect(hostileResult.hostileSvgInspection).toEqual({ parserErrors: 0, forbiddenTags: 0, dangerousAttributes: 0 });
  expect(hostileResult.renderedSvgInspection).toEqual({ parserErrors: 0, forbiddenTags: 0, dangerousAttributes: 0 });

  const svg = diagrams.first();
  await expect(svg.locator('script, foreignObject, [onload], [onclick], a[href^="javascript:"]')).toHaveCount(0);
  const lightSvg = await svg.innerHTML();
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/u);
  await expect(diagrams).toHaveCount(2, { timeout: 15_000 });
  await expect.poll(() => svg.innerHTML()).not.toBe(lightSvg);
  expect(network.blocked).toEqual([]);
  network.assertSafe();
});
