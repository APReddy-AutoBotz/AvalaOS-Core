import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request, type TestInfo } from '@playwright/test';
import type { WebSocket as PlaywrightWebSocket } from '@playwright/test';
import fs from 'node:fs';
import { CANONICAL_AP_PROJECT_ID, CANONICAL_AP_WORKFLOW_NAME } from '../../data/mockData';
import {
  createFullPageContrastAttachment,
  decodeAcceptanceExecutionProfile,
  summarizeFullPageColorContrast,
} from '../../scripts/acceptanceExecutionProfile.mjs';
import { createAuthorityRequestObserver } from './authorityRequestObserver';

const executionProfile = decodeAcceptanceExecutionProfile(process.env, {
  expectedCheckoutSha: process.env.ACCEPTANCE_EXECUTION_KIND === 'local_source_fixture'
    ? process.env.ACCEPTANCE_CHECKOUT_SHA
    : undefined,
});
const releaseSha = executionProfile.releaseSha;
const deployId = executionProfile.deployId;
const hostedOrigin = executionProfile.targetOrigin;
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
const SCREEN_ANIMATION_NAME = 'kp-screen-in';
const READABLE_MOTION_TARGET_SELECTOR = '#app-main [aria-label="Home attention summary"] .av-stat-strip:first-child .av-eyebrow';
const READABLE_MOTION_TARGET_TEXT = 'Open work';
const SCREEN_ANIMATION_DECLARED_DURATION_MS = 360;
const SCREEN_ANIMATION_SAMPLE_MS = [0, 60, 90, 117, 120, 180, 360] as const;
const SCREEN_ANIMATION_CONTRAST_SAMPLE_MS = new Set([0, 117, 360]);
const MAX_SCREEN_ANIMATION_DURATION_MS = 1_000;
const MAX_FULL_PAGE_CONTRAST_INCOMPLETE_RESULTS = 4;
type ReducedMotionPreference = 'no-preference' | 'reduce';
type MainAnimationRestoreState = {
  currentTime: number | null;
  playbackRate: number;
  playState: AnimationPlayState;
};

type NetworkViolationCategory = 'credential-header' | 'non-read-method' | 'unexpected-origin' | 'unexpected-document-route' | 'authority-request' | 'unexpected-resource';
type NetworkViolation = { method: string; category: NetworkViolationCategory; resourceType: string; originClass: string };
const MAX_NETWORK_VIOLATION_SAMPLES = 25;
const POST_SIGN_OUT_QUIET_PERIOD_MS = 750;
const POST_SIGN_OUT_QUIESCENCE_TIMEOUT_MS = 5_000;
const SEVEN_PERSONA_SCENARIOS = new Set([
  'persona-matrix',
  'local-authority',
  'network-safety',
  'desktop-layout',
  'mobile-layout',
  'keyboard-a11y',
  'serious-critical-a11y',
]);
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
const classifyNetworkWebSocket = (socket: PlaywrightWebSocket): NetworkViolationCategory => {
  const url = new URL(socket.url());
  return hostedOrigin && url.origin === hostedOrigin ? 'authority-request' : 'unexpected-origin';
};

test.beforeAll(() => {
  if (executionProfile.executionKind === 'declaration_only') throw new Error('ACCEPTANCE_DECLARATION_IS_NOT_EXECUTABLE');
  expect(releaseSha, 'acceptance must bind to an exact release SHA').toMatch(/^[0-9a-f]{40}$/u);
  if (executionProfile.executionKind === 'hosted_preview') {
    expect(deployId, 'hosted execution must bind to an exact Netlify deployment ID').toMatch(/^[0-9a-f]{24}$/u);
    expect(hostedOrigin, 'hosted execution must bind to an exact hosted origin').toMatch(/^https:\/\//u);
  } else if (executionProfile.executionKind === 'local_source_fixture') {
    expect(deployId, 'local source fixture must not synthesize a Netlify deployment ID').toBeNull();
    expect(hostedOrigin, 'local source fixture must bind the owned loopback origin').toMatch(/^http:\/\/127\.0\.0\.1:/u);
    expect(executionProfile.checkoutSha, 'local source fixture must bind the exact checkout').toBe(releaseSha);
  }
  expect(declaredGoogleStylesheetUrls.size, 'hosted acceptance must bind Google Fonts to index.html stylesheet declarations').toBeGreaterThan(0);
  expect(declaredJsDelivrScriptPaths.size, 'hosted acceptance must bind jsDelivr to index.html script declarations').toBeGreaterThan(0);
  expect(declaredAiStudioScriptRules.length, 'hosted acceptance must bind AI Studio CDN to index.html import-map declarations').toBeGreaterThan(0);
});

const assertHostedResponseIdentity = (response: Awaited<ReturnType<Page['goto']>>) => {
  expect(response?.ok(), 'hosted response').toBeTruthy();
  const headers = response?.headers() ?? {};
  if (executionProfile.executionKind === 'hosted_preview') {
    expect(headers['x-avalaos-release'], 'exact hosted release').toBe(releaseSha);
    expect(headers['x-avalaos-environment'], 'hosted nonproduction environment').toBe('hosted_nonproduction_pilot');
    expect(headers['x-avalaos-netlify-deploy-id'], 'exact hosted Netlify deployment').toBe(deployId);
  } else if (executionProfile.executionKind === 'local_source_fixture') {
    expect(new URL(response!.url()).origin, 'local source fixture response origin').toBe(hostedOrigin);
    expect(headers['x-avalaos-release'], 'local source fixture must not synthesize hosted release headers').toBeUndefined();
    expect(headers['x-avalaos-environment'], 'local source fixture must not synthesize hosted environment headers').toBeUndefined();
    expect(headers['x-avalaos-netlify-deploy-id'], 'local source fixture must not synthesize hosted deploy headers').toBeUndefined();
  } else {
    throw new Error('ACCEPTANCE_DECLARATION_IS_NOT_EXECUTABLE');
  }
};

let startupScopeMutationSequence = 0;
const reloadWithPersistedScopeAtDocumentStart = async (page: Page, persistedScope: string | null) => {
  const marker = `avalaos-safety-004-scope-mutation-${++startupScopeMutationSequence}`;
  await page.addInitScript(({ marker, persistedScope }) => {
    if (sessionStorage.getItem(marker) !== 'armed') return;
    if (persistedScope === null) localStorage.removeItem('avalaos-core-v1-scope');
    else localStorage.setItem('avalaos-core-v1-scope', persistedScope);
    sessionStorage.setItem(`${marker}:applied`, localStorage.getItem('avalaos-core-v1-scope') ?? '<missing>');
    sessionStorage.removeItem(marker);
  }, { marker, persistedScope });
  await page.evaluate(value => sessionStorage.setItem(value, 'armed'), marker);
  const response = await page.reload({ waitUntil: 'domcontentloaded' });
  const appliedScope = await page.evaluate(value => sessionStorage.getItem(`${value}:applied`), marker);
  expect(appliedScope, 'the adversarial persisted scope mutation must execute before application startup').toBe(persistedScope ?? '<missing>');
  return response;
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
    webSocket: {
      page,
      classify: socket => classifyNetworkWebSocket(socket as PlaywrightWebSocket),
      sample: (socket, category) => ({
        method: 'CONNECT',
        category: category as NetworkViolationCategory,
        resourceType: 'websocket',
        originClass: classifyDiagnosticOrigin((socket as PlaywrightWebSocket).url()),
      }),
    },
    maxSamples: MAX_NETWORK_VIOLATION_SAMPLES,
  });
  return {
    assertSafe: () => expect(observer.snapshot(), 'Sandbox network traffic must remain inside the explicit static/navigation allowlist').toEqual({ totalViolations: 0, samples: [] }),
    stopAfterQuiescence: observer.stopAfterQuiescence,
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
const closeProductNavigation = async (page: Page) => {
  const close = page.getByRole('button', { name: 'Close primary navigation' });
  if (await close.isVisible().catch(() => false)) await close.click();
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

const selectMyWorkScope = async (page: Page) => {
  const switcher = page.getByRole('button', { name: 'Switch workspace context' });
  await expect(switcher).toBeVisible();
  await switcher.click();
  const myWork = page.getByRole('button').filter({
    has: page.getByText('Tasks and decisions assigned to you', { exact: true }),
  });
  await expect(myWork).toBeVisible();
  await myWork.click();
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

const settleLazyLoadedSurface = async (page: Page) => {
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
};

const readMainScreenAnimationState = async (page: Page): Promise<MainAnimationRestoreState> => page.evaluate((animationName) => {
  const main = document.querySelector<HTMLElement>('#app-main');
  if (!main) throw new Error('APP_MAIN_MISSING');
  const animations = main.getAnimations().filter(candidate => (
    'animationName' in candidate && (candidate as CSSAnimation).animationName === animationName
  ));
  if (animations.length !== 1) throw new Error(`EXPECTED_ONE_SCREEN_ANIMATION_GOT_${animations.length}`);
  const animation = animations[0] as CSSAnimation;
  return {
    currentTime: typeof animation.currentTime === 'number' ? animation.currentTime : null,
    playbackRate: animation.playbackRate,
    playState: animation.playState,
  };
}, SCREEN_ANIMATION_NAME);

const pauseMainScreenAnimation = async (page: Page): Promise<number> => page.evaluate(({ animationName, maxDurationMs }) => {
  const main = document.querySelector<HTMLElement>('#app-main');
  if (!main) throw new Error('APP_MAIN_MISSING');
  const animations = main.getAnimations().filter(candidate => (
    'animationName' in candidate && (candidate as CSSAnimation).animationName === animationName
  ));
  if (animations.length !== 1) throw new Error(`EXPECTED_ONE_SCREEN_ANIMATION_GOT_${animations.length}`);
  const animation = animations[0] as CSSAnimation;
  const duration = animation.effect?.getComputedTiming().duration;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0 || duration > maxDurationMs) {
    throw new Error('SCREEN_ANIMATION_DURATION_OUT_OF_BOUNDS');
  }
  animation.pause();
  return duration;
}, { animationName: SCREEN_ANIMATION_NAME, maxDurationMs: MAX_SCREEN_ANIMATION_DURATION_MS });

const restoreMainScreenAnimation = async (page: Page, restoreState: MainAnimationRestoreState) => page.evaluate(({ animationName, state }) => {
  const main = document.querySelector<HTMLElement>('#app-main');
  if (!main) throw new Error('APP_MAIN_MISSING');
  const animations = main.getAnimations().filter(candidate => (
    'animationName' in candidate && (candidate as CSSAnimation).animationName === animationName
  ));
  if (animations.length !== 1) throw new Error(`EXPECTED_ONE_SCREEN_ANIMATION_GOT_${animations.length}`);
  const animation = animations[0] as CSSAnimation;
  animation.playbackRate = state.playbackRate;
  if (state.playState === 'idle') {
    animation.cancel();
    return;
  }
  if (state.playState === 'finished') {
    animation.finish();
    return;
  }
  animation.currentTime = state.currentTime;
  if (state.playState === 'running') animation.play();
  else animation.pause();
}, { animationName: SCREEN_ANIMATION_NAME, state: restoreState });

const seekMainScreenAnimation = async (page: Page, elapsedMs: number) => page.evaluate(({ animationName, boundedElapsedMs, maxDurationMs }) => {
  if (!Number.isFinite(boundedElapsedMs) || boundedElapsedMs < 0 || boundedElapsedMs > maxDurationMs) {
    throw new Error('SCREEN_ANIMATION_SAMPLE_OUT_OF_BOUNDS');
  }
  const main = document.querySelector<HTMLElement>('#app-main');
  if (!main) throw new Error('APP_MAIN_MISSING');
  const animations = main.getAnimations().filter(candidate => (
    'animationName' in candidate && (candidate as CSSAnimation).animationName === animationName
  ));
  if (animations.length !== 1) throw new Error(`EXPECTED_ONE_SCREEN_ANIMATION_GOT_${animations.length}`);
  const animation = animations[0] as CSSAnimation;
  const duration = animation.effect?.getComputedTiming().duration;
  if (typeof duration !== 'number' || boundedElapsedMs > duration) throw new Error('SCREEN_ANIMATION_SAMPLE_EXCEEDS_DURATION');
  animation.currentTime = boundedElapsedMs;
  const style = getComputedStyle(main);
  const bounds = main.getBoundingClientRect();
  return {
    animationName: animation.animationName,
    filter: style.filter,
    focused: document.activeElement === main,
    opacity: Number(style.opacity),
    rendered: bounds.width > 0 && bounds.height > 0 && style.display !== 'none' && style.visibility === 'visible',
  };
}, { animationName: SCREEN_ANIMATION_NAME, boundedElapsedMs: elapsedMs, maxDurationMs: MAX_SCREEN_ANIMATION_DURATION_MS });

const analyzeMainColorContrast = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .include(READABLE_MOTION_TARGET_SELECTOR)
    .withRules(['color-contrast'])
    .analyze();
  return {
    incompleteCount: results.incomplete
      .filter(item => item.id === 'color-contrast')
      .reduce((count, item) => count + item.nodes.length, 0),
    positiveNodeCount: results.passes
      .filter(item => item.id === 'color-contrast')
      .reduce((count, item) => count + item.nodes.length, 0),
    violationCount: results.violations
      .filter(item => item.id === 'color-contrast')
      .reduce((count, item) => count + item.nodes.length, 0),
  };
};

const assertMainColorContrastResult = (contrast: Awaited<ReturnType<typeof analyzeMainColorContrast>>, context: string) => {
  expect(contrast.violationCount, `${context}: readable-motion target color contrast violations`).toBe(0);
  expect(contrast.incompleteCount, `${context}: readable-motion target color contrast incomplete nodes`).toBe(0);
  expect(contrast.positiveNodeCount, `${context}: Axe must pass exactly the real readable-motion target`).toBe(1);
};

const assertPositiveMainColorContrast = async (page: Page, context: string) => {
  assertMainColorContrastResult(await analyzeMainColorContrast(page), context);
};

const assertReadableMotionTarget = async (page: Page) => {
  const target = page.locator(READABLE_MOTION_TARGET_SELECTOR);
  await expect(target, 'the real Home readable-motion target must be unique').toHaveCount(1);
  await expect(target, 'the real Home readable-motion target must use exact product copy').toHaveText(READABLE_MOTION_TARGET_TEXT);
  await expect(target, 'the real Home readable-motion target must be visible').toBeVisible();
  const state = await target.evaluate((element) => {
    const parseColor = (source: string) => {
      const value = source.trim().toLowerCase();
      const hex = value.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/u);
      if (hex) {
        const channels = hex[1].match(/.{2}/gu)!.map(channel => Number.parseInt(channel, 16));
        return [...channels, hex[2] ? Number.parseInt(hex[2], 16) / 255 : 1];
      }
      const functional = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/u);
      return functional ? [Number(functional[1]), Number(functional[2]), Number(functional[3]), functional[4] === undefined ? 1 : Number(functional[4])] : null;
    };
    const main = document.querySelector<HTMLElement>('#app-main');
    const strip = element.parentElement;
    const bounds = element.getBoundingClientRect();
    const targetStyle = getComputedStyle(element);
    const stripStyle = strip ? getComputedStyle(strip) : null;
    const subtleToken = getComputedStyle(document.documentElement).getPropertyValue('--av-color-text-subtle').trim();
    const targetColor = parseColor(targetStyle.color);
    const tokenColor = parseColor(subtleToken);
    const stripBackground = stripStyle ? parseColor(stripStyle.backgroundColor) : null;
    return {
      backgroundImage: stripStyle?.backgroundImage ?? null,
      backgroundOpaque: stripBackground?.[3] === 1,
      foregroundMatchesSubtleToken: targetColor !== null && tokenColor !== null && targetColor.every((channel, index) => channel === tokenColor[index]),
      insideActualMain: main !== null && main.contains(element),
      rendered: bounds.width > 0 && bounds.height > 0 && targetStyle.display !== 'none' && targetStyle.visibility === 'visible',
      stripIsActualParent: strip?.matches('.av-stat-strip') ?? false,
    };
  });
  expect(state.insideActualMain, 'the readable-motion target must be inside the actual application main').toBe(true);
  expect(state.stripIsActualParent, 'the readable-motion target must use the actual av-stat-strip parent').toBe(true);
  expect(state.rendered, 'the readable-motion target must have rendered geometry').toBe(true);
  expect(state.backgroundOpaque, 'the actual av-stat-strip background must be opaque').toBe(true);
  expect(state.backgroundImage, 'the actual av-stat-strip background must not use an image or gradient').toBe('none');
  expect(state.foregroundMatchesSubtleToken, 'the target foreground must resolve from --av-color-text-subtle').toBe(true);
};

type FullPageAxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;

const retainFullPageColorContrastEvidence = async (
  results: FullPageAxeResults,
  testInfo: TestInfo,
  persona: string,
  profile: 'initial-entry' | 'representative-surface',
) => {
  const attachment = createFullPageContrastAttachment({
    results,
    metadata: testInfo.config.metadata,
    persona,
    profile,
    project: testInfo.project.name,
    test: testInfo.title,
    observedAt: new Date().toISOString(),
  });
  await testInfo.attach(attachment.name, { body: attachment.body, contentType: attachment.contentType });

  const summary = summarizeFullPageColorContrast(results);
  expect(summary.observedNodeCount, `${profile}: full-page contrast scan must observe real nodes`).toBeGreaterThan(0);
  expect(summary.violationNodeCount, `${profile}: full-page contrast scan must have zero real violations`).toBe(0);
  expect(summary.incompleteResultCount, 'full-page color-contrast incomplete result groups must remain bounded').toBeLessThanOrEqual(MAX_FULL_PAGE_CONTRAST_INCOMPLETE_RESULTS);
  if (summary.incompleteNodeCount > 0) {
    expect(summary.classification, `${profile}: incomplete full-page contrast remains unresolved`).toBe('unresolved_manual');
  } else {
    expect(summary.classification, `${profile}: a complete nonempty full-page contrast scan may resolve`).toBe('resolved');
  }
};

const assertMainScreenAnimationTimeline = async (
  page: Page,
  reducedMotion: ReducedMotionPreference,
) => {
  const originalReducedMotion: ReducedMotionPreference = await page.evaluate(() => (
    matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'no-preference'
  ));
  const restoreState = await readMainScreenAnimationState(page);
  try {
    await page.emulateMedia({ reducedMotion });
    const durationMs = await pauseMainScreenAnimation(page);
    if (reducedMotion === 'no-preference') {
      expect(durationMs, 'normal-motion screen animation must retain its declared duration').toBe(SCREEN_ANIMATION_DECLARED_DURATION_MS);
    } else {
      expect(durationMs, 'reduced-motion screen animation must retain a positive effective duration').toBeGreaterThan(0);
      expect(durationMs, 'reduced-motion screen animation must use the existing near-instant rule').toBeCloseTo(0.01, 5);
    }
    for (const declaredElapsedMs of SCREEN_ANIMATION_SAMPLE_MS) {
      const normalizedElapsedMs = (declaredElapsedMs / SCREEN_ANIMATION_DECLARED_DURATION_MS) * durationMs;
      expect(normalizedElapsedMs, 'normalized animation samples must remain finite and non-negative').toBeGreaterThanOrEqual(0);
      expect(normalizedElapsedMs, 'normalized animation samples must not exceed the effective duration').toBeLessThanOrEqual(durationMs);
      const state = await seekMainScreenAnimation(page, normalizedElapsedMs);
      expect(state.animationName, `${reducedMotion} ${declaredElapsedMs}ms must sample the expected CSS animation`).toBe(SCREEN_ANIMATION_NAME);
      expect(state.rendered, `${reducedMotion} ${declaredElapsedMs}ms main must remain rendered`).toBe(true);
      expect(state.opacity, `${reducedMotion} ${declaredElapsedMs}ms main must remain fully opaque`).toBe(1);
      expect(state.filter, `${reducedMotion} ${declaredElapsedMs}ms main must not be blurred`).toBe('none');
      expect(state.focused, `${reducedMotion} ${declaredElapsedMs}ms main must retain skip-link focus`).toBe(true);
      if (SCREEN_ANIMATION_CONTRAST_SAMPLE_MS.has(declaredElapsedMs)) {
        await assertPositiveMainColorContrast(page, `${reducedMotion} ${declaredElapsedMs}ms`);
      }
    }
  } finally {
    try {
      await page.emulateMedia({ reducedMotion: originalReducedMotion });
    } finally {
      await restoreMainScreenAnimation(page, restoreState);
    }
  }
};

const activateSkipLinkWithKeyboard = async (page: Page) => {
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
};

const assertContrastOracleRejectsOccludedMotion = async (page: Page) => {
  const originalReducedMotion: ReducedMotionPreference = await page.evaluate(() => (
    matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'no-preference'
  ));
  const restoreState = await readMainScreenAnimationState(page);
  try {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.id = 'qa-adversarial-kp-screen-in';
      style.textContent = '@keyframes kp-screen-in { from { opacity: 0; transform: translateY(8px); filter: blur(3px); } to { opacity: 1; transform: translateY(0); filter: blur(0); } }';
      document.head.append(style);
    });
    const durationMs = await pauseMainScreenAnimation(page);
    expect(durationMs, 'adversarial motion must exercise the declared production duration').toBe(SCREEN_ANIMATION_DECLARED_DURATION_MS);

    const invisibleState = await seekMainScreenAnimation(page, 0);
    const invisibleContrast = await analyzeMainColorContrast(page);
    expect(invisibleState.opacity, 'the adversarial 0ms frame must reproduce an invisible main').toBe(0);
    expect(invisibleContrast.violationCount, 'the adversarial 0ms frame reproduces Axe empty-scan false green').toBe(0);
    expect(invisibleContrast.incompleteCount, 'the adversarial 0ms empty scan must not be reclassified as incomplete').toBe(0);
    expect(invisibleContrast.positiveNodeCount, 'the positive-node oracle must reject an empty 0ms Axe scan').toBe(0);
    expect(() => assertMainColorContrastResult(invisibleContrast, 'adversarial 0ms'))
      .toThrow(/Axe must pass exactly the real readable-motion target/u);

    const vulnerableState = await seekMainScreenAnimation(page, 90);
    const vulnerableContrast = await analyzeMainColorContrast(page);
    expect(vulnerableState.opacity, 'the adversarial early frame must reproduce partial opacity').toBeGreaterThan(0);
    expect(vulnerableState.opacity, 'the adversarial early frame must remain partially opaque').toBeLessThan(1);
    expect(vulnerableContrast.violationCount, 'the real contrast oracle must reject the adversarial early frame').toBeGreaterThan(0);
    expect(vulnerableContrast.incompleteCount, 'the adversarial early target scan must resolve as a violation, not incomplete').toBe(0);
    expect(() => assertMainColorContrastResult(vulnerableContrast, 'adversarial 90ms'))
      .toThrow(/readable-motion target color contrast violations/u);
  } finally {
    await page.evaluate(() => document.querySelector('#qa-adversarial-kp-screen-in')?.remove());
    try {
      await page.emulateMedia({ reducedMotion: originalReducedMotion });
    } finally {
      await restoreMainScreenAnimation(page, restoreState);
    }
  }

  await expect(page.locator('#qa-adversarial-kp-screen-in'), 'the adversarial keyframe override must be absent after cleanup').toHaveCount(0);
  await assertMainScreenAnimationTimeline(page, 'no-preference');
};

const ENTERPRISE_INTELLIGENCE_SANDBOX_BOUNDARY = 'Enterprise Intelligence requires a server-authorized workspace. The local synthetic sandbox sends no provider or persistence requests.';
const assertEnterpriseIntelligenceSandboxBoundary = async (page: Page) => {
  await expect(page.getByRole('heading', { name: 'Enterprise Intelligence unavailable', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(ENTERPRISE_INTELLIGENCE_SANDBOX_BOUNDARY, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('enterprise-intelligence-workspace')).toHaveCount(0);
};

const exerciseRepresentativePersonaPath = async (page: Page, label: string) => {
  if (label === 'Process Analyst' || label === 'AP Process Owner') {
    await clickProductNav(page, 'Assess');
    await expect(page.getByTestId('process-catalog-view')).toBeVisible({ timeout: 15_000 });
  } else if (label === 'Delivery Lead' || label === 'Control Reviewer' || label === 'Automation Contributor') {
    await clickProductNav(page, 'Delivery');
    await expect(page.getByLabel('Delivery work board')).toBeVisible({ timeout: 15_000 });
  } else if (label === 'Buyer Viewer') {
    await closeProductNavigation(page);
    await selectMyWorkScope(page);
    await clickProductNav(page, 'Monitor');
    await expect(page.getByTestId('monitor-overview')).toBeVisible({ timeout: 15_000 });
  } else if (label === 'Platform Admin') {
    await openProductNavigation(page);
    const admin = page.getByRole('button', { name: 'Admin / Intelligence' });
    await expect(admin).toBeVisible({ timeout: 15_000 });
    await admin.click();
    await assertEnterpriseIntelligenceSandboxBoundary(page);
  } else {
    throw new Error(`No representative feature path is bound to persona ${label}`);
  }
  await settleLazyLoadedSurface(page);
};

const runObservedPersonaJourney = async (
  page: Page,
  label: string,
  userName: string,
  assertSurface?: () => Promise<void>,
) => {
  const observer = observeAuthorityRequests(page);
  await enterPersona(page, label);
  await assertActivePersona(page, userName);
  await exerciseRepresentativePersonaPath(page, label);
  await assertSurface?.();
  await signOutToSandbox(page);
  await observer.stopAfterQuiescence({
    quietPeriodMs: POST_SIGN_OUT_QUIET_PERIOD_MS,
    timeoutMs: POST_SIGN_OUT_QUIESCENCE_TIMEOUT_MS,
  });
  observer.assertSafe();
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
        await runObservedPersonaJourney(page, label, userName);
      }
      return;
    }
    case 'network-safety': {
      for (const [label, userName] of personas) {
        await runObservedPersonaJourney(page, label, userName);
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
      for (const [personaIndex, [label, userName]] of personas.entries()) {
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await enterPersona(page, label);
        await assertActivePersona(page, userName);
        await activateSkipLinkWithKeyboard(page);
        const results = await new AxeBuilder({ page }).analyze();
        await retainFullPageColorContrastEvidence(results, testInfo, label, 'initial-entry');
        expect(results.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);

        await closeProductNavigation(page);
        await selectMyWorkScope(page);
        await clickProductNav(page, 'Home');
        await closeProductNavigation(page);
        await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
        await expect(page.locator(READABLE_MOTION_TARGET_SELECTOR)).toBeVisible();
        await assertReadableMotionTarget(page);
        await activateSkipLinkWithKeyboard(page);
        await assertMainScreenAnimationTimeline(page, 'no-preference');
        await assertMainScreenAnimationTimeline(page, 'reduce');
        if (personaIndex === 0) await assertContrastOracleRejectsOccludedMotion(page);
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
        await assertEnterpriseIntelligenceSandboxBoundary(page);
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
        await assertEnterpriseIntelligenceSandboxBoundary(page);
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
      const invalidBoardsResponse = await reloadWithPersistedScopeAtDocumentStart(page, JSON.stringify({
        type: 'project',
        id: 'stale-different-project',
        name: 'Stale Different Project',
      }));
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
        const invalidResponse = await reloadWithPersistedScopeAtDocumentStart(page, invalidScope);
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
      for (const [label, userName] of personas) {
        await runObservedPersonaJourney(page, label, userName, async () => {
          const results = await new AxeBuilder({ page }).analyze();
          await retainFullPageColorContrastEvidence(results, testInfo, label, 'representative-surface');
          expect(results.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
        });
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
  const title = executionProfile.executionKind === 'local_source_fixture'
    ? `[SYNTHETIC-REGRESSION:${binding.testId}] ${testCase.title}`
    : `[${binding.testId}] ${testCase.title}`;
  test(title, async ({ page }, testInfo) => {
    test.skip(!binding.projects.includes(testInfo.project.name), `Not required in ${testInfo.project.name}`);
    test.skip(!binding.scenario, binding.blockedReason || 'No deterministic hosted scenario exposed.');
    if (binding.scenario && SEVEN_PERSONA_SCENARIOS.has(binding.scenario)) testInfo.setTimeout(180_000);
    await runScenario(binding.scenario!, page, testInfo);
  });
}
