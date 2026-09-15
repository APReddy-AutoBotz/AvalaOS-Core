import { expect, test, type Page } from '@playwright/test';

const LOCAL_ORIGIN = process.env.LOCAL_CONTROLLED_BOUNDARY_BASE_URL;
if (!/^http:\/\/127[.]0[.]0[.]1:\d{2,5}$/u.test(LOCAL_ORIGIN ?? '')) {
  throw new Error('LOCAL_CONTROLLED_BOUNDARY_EXACT_ORIGIN_REQUIRED');
}
const BACKEND_OR_PROVIDER = /(?:\/auth\/v1\/|\/rest\/v1\/|\/functions\/v1\/|supabase[.]co|127[.]0[.]0[.]1:59999|api[.]openai[.]com|generativelanguage[.]googleapis[.]com)/u;
const blockedStatic = (url: URL, method: string, resourceType: string) => method === 'GET' && (
  (url.hostname === 'fonts.googleapis.com' && url.pathname === '/css2' && resourceType === 'stylesheet')
  || (url.hostname === 'fonts.gstatic.com' && url.pathname.startsWith('/s/') && resourceType === 'font')
  || (url.hostname === 'cdn.jsdelivr.net' && resourceType === 'script' && [
    '/npm/mermaid@10/dist/mermaid.min.js',
    '/npm/js-yaml@4.1.0/dist/js-yaml.min.js',
    '/npm/marked/marked.min.js',
  ].includes(url.pathname))
);

const observeBoundary = async (page: Page) => {
  const pageErrors: string[] = [];
  const backendOrProviderRequests: string[] = [];
  const unexpectedExternalRequests: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.name));
  page.on('request', request => {
    const url = new URL(request.url());
    if (BACKEND_OR_PROVIDER.test(url.href)) backendOrProviderRequests.push(url.pathname);
  });
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (BACKEND_OR_PROVIDER.test(url.href)) {
      return route.abort();
    }
    if (url.origin === LOCAL_ORIGIN) return route.continue();
    // Existing public static fonts/CDN are denied, never fetched by this test.
    if (!blockedStatic(url, request.method(), request.resourceType())) {
      unexpectedExternalRequests.push(url.hostname);
    }
    return route.abort();
  });
  return () => {
    expect(pageErrors).toEqual([]);
    expect(backendOrProviderRequests).toEqual([]);
    expect(unexpectedExternalRequests).toEqual([]);
  };
};

const assertBlockedAccess = async (page: Page) => {
  await expect(page.getByRole('heading', { name: 'Sign in to an organization.' })).toBeVisible();
  await expect(page.getByTestId('controlled-human-environment-blocked')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign-in blocked' })).toBeDisabled();
  await expect(page.getByRole('group', { name: 'Choose a sandbox persona' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Workspace access blocked' })).toHaveCount(0);
  await expect(page.locator('#app-main')).toHaveCount(0);
  await expect(page.getByTestId('enterprise-session-boundary')).toHaveCount(0);
  await expect(page.getByText('Loading workspace...', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-testid="workspace-selector"], [data-testid="persona-selector"]')).toHaveCount(0);
};

test('blocked controlled binding stays public and inert on /sandbox', async ({ page }) => {
  const assertNetwork = await observeBoundary(page);
  await page.goto('/sandbox');
  await assertBlockedAccess(page);
  assertNetwork();
});

test('blocked controlled binding stays public and inert on unexpected sandbox deep link', async ({ page }) => {
  const assertNetwork = await observeBoundary(page);
  await page.goto('/sandbox/unexpected-deep-link');
  await assertBlockedAccess(page);
  assertNetwork();
});

test('wrong-origin controlled /sign-in disables authentication without page error', async ({ page }) => {
  const assertNetwork = await observeBoundary(page);
  await page.goto('/sign-in');
  await assertBlockedAccess(page);
  assertNetwork();
});

test('public CTA routes to blocked /sign-in and does not expose a persona or workspace', async ({ page }) => {
  const assertNetwork = await observeBoundary(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Evaluate before you automate/u })).toBeVisible();
  await page.getByRole('button', { name: 'Access AvalaOS' }).first().click();
  await expect(page).toHaveURL(/\/sign-in$/u);
  await assertBlockedAccess(page);
  assertNetwork();
});
