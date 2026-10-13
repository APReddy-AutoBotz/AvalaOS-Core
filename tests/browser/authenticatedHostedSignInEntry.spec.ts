import { expect, test, type Page } from '@playwright/test';
import {
  authenticatedLifecycleControl,
  authenticatedLifecycleEnterAs,
  type AuthenticatedLifecycleActor,
} from './authenticatedLifecycleHarness';

const appOrigin = new URL(process.env.AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_APP_URL ?? '').origin;
const apiOrigin = new URL(process.env.ENTERPRISE_LIFECYCLE_API_BASE_URL ?? '').origin;

const actor = (
  projectName: string,
  actorName: 'A' | 'B' | 'rejected',
): AuthenticatedLifecycleActor => {
  const definition = actorName === 'A'
    ? { id: projectName === 'desktop-chromium'
      ? '10000000-0000-4000-8000-000000000001' : '10000000-0000-4000-8000-000000000003',
      email: `author.${projectName}@local.invalid`, persona: 'author' as const, password: 'synthetic-author-password' }
    : actorName === 'B'
      ? { id: projectName === 'desktop-chromium'
        ? '10000000-0000-4000-8000-000000000002' : '10000000-0000-4000-8000-000000000004',
        email: `reviewer.${projectName}@local.invalid`, persona: 'reviewer' as const, password: 'synthetic-reviewer-password' }
      : { id: '10000000-0000-4000-8000-000000000009',
        email: `rejected.${projectName}@local.invalid`, persona: 'outsider' as const, password: 'synthetic-rejected-password' };
  return {
    token: 'unused-real-auth-input',
    authKind: 'supabase_auth',
    projectName,
    persona: definition.persona,
    password: definition.password,
    user: { id: definition.id, email: definition.email },
  };
};

const installLoopbackGuard = async (page: Page) => {
  const unexpectedOrigins: string[] = [];
  await page.route('**/*', route => {
    const origin = new URL(route.request().url()).origin;
    if (origin === appOrigin || origin === apiOrigin) return route.continue();
    unexpectedOrigins.push(origin);
    return route.abort('blockedbyclient');
  });
  return unexpectedOrigins;
};

test('actual application uses the shared real-auth helper for rejected, cold and cached sign-in', async ({ page }, testInfo) => {
  const projectName = testInfo.project.name;
  const unexpectedOrigins = await installLoopbackGuard(page);
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.name));

  // The preserved first navigation is the session-scrub entry. The real app
  // maps it to PublicWebsite, demonstrating why the subsequent entry must use /sign-in.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Evaluate before you automate/u })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in securely', exact: true })).toHaveCount(0);

  await expect(authenticatedLifecycleEnterAs(page, actor(projectName, 'rejected')))
    .rejects.toThrow('ENTERPRISE_LIFECYCLE_BROWSER_IDENTITY_CREDENTIAL_REJECTED');
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('sb-')))).toEqual([]);
  const rejectedObservation = await authenticatedLifecycleControl<{
    passwordRequests: unknown[];
    diagnostics: unknown[];
    bindings: unknown[];
  }>(`/control/sign-in-entry-observation?projectName=${encodeURIComponent(projectName)}`);
  expect(rejectedObservation).toEqual({
    passwordRequests: [{ actor: 'rejected', outcome: 'rejected' }],
    diagnostics: [{ operation: 'SIGN_IN', category: 'CREDENTIAL_REJECTED', upstreamCode: 'invalid_credentials' }],
    bindings: [],
  });

  await authenticatedLifecycleEnterAs(page, actor(projectName, 'A'));
  await authenticatedLifecycleEnterAs(page, actor(projectName, 'B'));
  await authenticatedLifecycleEnterAs(page, actor(projectName, 'A'));
  const storedSessions = await page.evaluate(() => Object.entries(localStorage)
    .filter(([key]) => key.startsWith('sb-'))
    .map(([key, value]) => ({ key, value: JSON.parse(value) })));
  expect(storedSessions).toHaveLength(1);
  expect(storedSessions[0]?.value.access_token ?? storedSessions[0]?.value.currentSession?.access_token)
    .toBe(`loopback-${projectName}-token-a`);

  const observation = await authenticatedLifecycleControl<{
    passwordRequests: unknown[];
    diagnostics: unknown[];
    bindings: unknown[];
  }>(`/control/sign-in-entry-observation?projectName=${encodeURIComponent(projectName)}`);
  expect(observation).toEqual({
    passwordRequests: [
      { actor: 'rejected', outcome: 'rejected' },
      { actor: 'A', outcome: 'accepted' },
      { actor: 'B', outcome: 'accepted' },
    ],
    diagnostics: [{ operation: 'SIGN_IN', category: 'CREDENTIAL_REJECTED', upstreamCode: 'invalid_credentials' }],
    bindings: [
      { actor: 'A', persona: 'author', token: `loopback-${projectName}-token-a` },
      { actor: 'B', persona: 'reviewer', token: `loopback-${projectName}-token-b` },
      { actor: 'A', persona: 'author', token: `loopback-${projectName}-token-a` },
    ],
  });
  expect(unexpectedOrigins).toEqual([]);
  expect(pageErrors).toEqual([]);
});
