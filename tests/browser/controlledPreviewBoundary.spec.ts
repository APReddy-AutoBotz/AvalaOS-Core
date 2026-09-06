import { createHash } from 'node:crypto';
import { expect, test, type Page, type Request } from '@playwright/test';
import {
  CONTROLLED_PREVIEW_ORIGIN,
  CONTROLLED_PREVIEW_SCENARIOS,
  createControlledPreviewNetworkObserver,
  controlledPreviewTitle,
  loadControlledPreviewBrowserBinding,
} from '../../scripts/previewBrowserEvidenceContract.mjs';

const expectedHead = process.env.EXPECTED_RELEASE_SHA!;
const expectedDeployId = process.env.EXPECTED_NETLIFY_DEPLOY_ID!;
const immutableOrigin = process.env.CONTROLLED_PREVIEW_IMMUTABLE_URL!;
const ATTESTATION_PATH = '/rest/v1/rpc/pr_c_controlled_human_public_attestation';
const SAFE_DIGEST = /^sha256:[0-9a-f]{64}$/u;
const EXPECTED_ATTESTATION_KEYS = [
  'p_deploy_id',
  'p_deploy_origin',
  'p_exercise_digest',
  'p_public_target_digest',
  'p_release_sha',
  'p_review_head_sha',
];

type BrowserBinding = {
  releaseSha: string;
  reviewHeadSha: string;
  deployId: string;
  deployOrigin: string;
  exerciseDigest: string;
  targetFingerprint: string;
  publicTargetDigest: string;
};

type SanitizedCounts = {
  totalRequests: number;
  apiContextRequests: number;
  attestationRequests: number;
  authRequests: number;
  tokenRequests: number;
  credentialBearingRequests: number;
  workspaceRequests: number;
  providerRequests: number;
  blockedExternalStaticRequests: number;
  blockedPlatformStaticRequests: number;
  closingAllowedRequests: number;
  unexpectedRequests: number;
  unexpectedCategories: Record<string, number>;
  webSockets: number;
  popups: number;
  serviceWorkers: number;
};

const responseIdentity = (response: Awaited<ReturnType<Page['goto']>>, expectedUrl: string) => {
  expect(response?.ok()).toBeTruthy();
  expect(response?.url()).toBe(expectedUrl);
  expect(response?.headers()['x-avalaos-release']).toBe(expectedHead);
  expect(response?.headers()['x-avalaos-environment']).toBe('hosted_nonproduction_pilot');
  expect(response?.headers()['x-avalaos-netlify-deploy-id']).toBe(expectedDeployId);
};

const observeRequests = (page: Page) => createControlledPreviewNetworkObserver({
  page,
  aliasOrigin: CONTROLLED_PREVIEW_ORIGIN,
  immutableOrigin,
  expectedHead,
  expectedDeployId,
});

const loadBrowserBinding = async (
  page: Page,
  observer: Awaited<ReturnType<typeof observeRequests>>,
): Promise<BrowserBinding> => {
  const binding = await loadControlledPreviewBrowserBinding({
    request: page.context().request,
    expectedHead,
    expectedDeployId,
    accountApiContextRequest: observer.accountApiContextRequest,
  }) as BrowserBinding;
  expect(binding.releaseSha).toBe(expectedHead);
  expect(binding.reviewHeadSha).toBe(expectedHead);
  expect(binding.deployId).toBe(expectedDeployId);
  expect(binding.deployOrigin).toBe(CONTROLLED_PREVIEW_ORIGIN);
  expect(binding.exerciseDigest).toMatch(SAFE_DIGEST);
  expect(binding.targetFingerprint).toMatch(SAFE_DIGEST);
  expect(binding.publicTargetDigest).toMatch(SAFE_DIGEST);
  return binding;
};

const attestationFor = (binding: BrowserBinding) => ({
  attested: true,
  contractVersion: 'pr-c-controlled-human-attestation-1',
  environmentClass: 'hosted_nonproduction_pilot',
  prNumber: 264,
  ...binding,
  personaManifestDigest: `sha256:${'1'.repeat(64)}`,
  fixtureManifestDigest: `sha256:${'2'.repeat(64)}`,
  migrationTip: '20260904120000',
  productionAuthorized: false,
  customerDataAuthorized: false,
  realProviderCallsAuthorized: false,
});

const parseAttestationRequest = (request: Request, binding: BrowserBinding) => {
  expect(request.method()).toBe('POST');
  const body = request.postDataJSON() as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(EXPECTED_ATTESTATION_KEYS);
  expect(body).toEqual({
    p_release_sha: binding.releaseSha,
    p_review_head_sha: binding.reviewHeadSha,
    p_deploy_id: binding.deployId,
    p_deploy_origin: binding.deployOrigin,
    p_exercise_digest: binding.exerciseDigest,
    p_public_target_digest: binding.publicTargetDigest,
  });
};

const assertNoAuthority = async (page: Page) => {
  await expect(page.getByRole('group', { name: 'Choose a sandbox persona' })).toHaveCount(0);
  await expect(page.locator('[data-testid="enterprise-intelligence-workspace"]')).toHaveCount(0);
  await expect(page.locator('#app-main')).toHaveCount(0);
};

const assertZeroServerAuthority = (counts: SanitizedCounts) => {
  expect(counts.apiContextRequests).toBe(0);
  expect(counts.attestationRequests).toBe(0);
  expect(counts.authRequests).toBe(0);
  expect(counts.tokenRequests).toBe(0);
  expect(counts.credentialBearingRequests).toBe(0);
  expect(counts.workspaceRequests).toBe(0);
  expect(counts.providerRequests).toBe(0);
  expect(counts.unexpectedCategories).toEqual({});
  expect(counts.unexpectedRequests).toBe(0);
  expect(counts.webSockets).toBe(0);
  expect(counts.popups).toBe(0);
  expect(counts.serviceWorkers).toBe(0);
};

const assertBlockedBeforeCredentials = (counts: SanitizedCounts) => {
  expect(counts.apiContextRequests).toBeGreaterThan(0);
  expect(counts.attestationRequests).toBe(1);
  expect(counts.authRequests).toBe(0);
  expect(counts.tokenRequests).toBe(0);
  expect(counts.credentialBearingRequests).toBe(0);
  expect(counts.workspaceRequests).toBe(0);
  expect(counts.providerRequests).toBe(0);
  expect(counts.unexpectedCategories).toEqual({});
  expect(counts.unexpectedRequests).toBe(0);
  expect(counts.webSockets).toBe(0);
  expect(counts.popups).toBe(0);
  expect(counts.serviceWorkers).toBe(0);
};

const submitDummyCredentials = async (page: Page) => {
  await page.getByLabel('Work email').fill('blocked@dummy.invalid');
  await page.getByLabel('Password').fill('preview-boundary-password');
  await page.getByRole('button', { name: 'Sign in to AvalaOS' }).click();
  await expect(page.getByRole('alert')).toContainText('This runtime is not configured for the requested operation. Contact an administrator.');
};

const bindingDigest = (binding: BrowserBinding) =>
  `sha256:${createHash('sha256').update(JSON.stringify(binding)).digest('hex')}`;

const scenarioById = new Map(CONTROLLED_PREVIEW_SCENARIOS.map(scenario => [scenario.id, scenario]));
type ScenarioId = (typeof CONTROLLED_PREVIEW_SCENARIOS)[number]['id'];
const title = (id: ScenarioId) => controlledPreviewTitle(scenarioById.get(id)!);

test(title('sandbox-root-blocked'), async ({ page }) => {
  const observer = await observeRequests(page);
  const url = `${CONTROLLED_PREVIEW_ORIGIN}/sandbox`;
  responseIdentity(await page.goto(url, { waitUntil: 'domcontentloaded' }), url);
  await expect(page.getByTestId('controlled-human-environment-blocked')).toBeVisible();
  await assertNoAuthority(page);
  assertZeroServerAuthority(await observer.finish());
});

test(title('sandbox-descendant-blocked'), async ({ page }) => {
  const observer = await observeRequests(page);
  const url = `${CONTROLLED_PREVIEW_ORIGIN}/sandbox/unexpected-deep-link`;
  responseIdentity(await page.goto(url, { waitUntil: 'domcontentloaded' }), url);
  await expect(page.getByTestId('controlled-human-environment-blocked')).toBeVisible();
  await expect(page.getByText('Workspace access blocked', { exact: true })).toHaveCount(0);
  await assertNoAuthority(page);
  assertZeroServerAuthority(await observer.finish());
});

test(title('immutable-sign-in-blocked'), async ({ page }) => {
  const observer = await observeRequests(page);
  const url = `${immutableOrigin}/sign-in`;
  responseIdentity(await page.goto(url, { waitUntil: 'domcontentloaded' }), url);
  await expect(page.getByTestId('controlled-human-environment-blocked')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign-in blocked' })).toBeDisabled();
  await assertNoAuthority(page);
  assertZeroServerAuthority(await observer.finish());
});

test(title('malformed-attestation-blocked'), async ({ page }) => {
  const observer = await observeRequests(page);
  const binding = await loadBrowserBinding(page, observer);
  let intercepted = 0;
  await page.route(`**${ATTESTATION_PATH}`, async route => {
    intercepted += 1;
    parseAttestationRequest(route.request(), binding);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...attestationFor(binding), unexpected: true }) });
  });
  const url = `${CONTROLLED_PREVIEW_ORIGIN}/sign-in`;
  responseIdentity(await page.goto(url, { waitUntil: 'domcontentloaded' }), url);
  await submitDummyCredentials(page);
  await assertNoAuthority(page);
  expect(intercepted).toBe(1);
  expect(bindingDigest(binding)).toMatch(SAFE_DIGEST);
  assertBlockedBeforeCredentials(await observer.finish());
});

test(title('wrong-tip-attestation-blocked'), async ({ page }) => {
  const observer = await observeRequests(page);
  const binding = await loadBrowserBinding(page, observer);
  let intercepted = 0;
  await page.route(`**${ATTESTATION_PATH}`, async route => {
    intercepted += 1;
    parseAttestationRequest(route.request(), binding);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...attestationFor(binding), migrationTip: '20260904115959' }) });
  });
  const url = `${CONTROLLED_PREVIEW_ORIGIN}/sign-in`;
  responseIdentity(await page.goto(url, { waitUntil: 'domcontentloaded' }), url);
  await submitDummyCredentials(page);
  await assertNoAuthority(page);
  expect(intercepted).toBe(1);
  expect(bindingDigest(binding)).toMatch(SAFE_DIGEST);
  assertBlockedBeforeCredentials(await observer.finish());
});

test(title('public-cta-sign-in'), async ({ page }) => {
  const observer = await observeRequests(page);
  const url = `${CONTROLLED_PREVIEW_ORIGIN}/`;
  responseIdentity(await page.goto(url, { waitUntil: 'domcontentloaded' }), url);
  await page.getByRole('button', { name: 'Access AvalaOS', exact: true }).first().click();
  await expect(page).toHaveURL(`${CONTROLLED_PREVIEW_ORIGIN}/sign-in`);
  await expect(page.getByRole('heading', { name: 'Sign in securely' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Choose a sandbox persona' })).toHaveCount(0);
  await expect(page.locator('#app-main')).toHaveCount(0);
  assertZeroServerAuthority(await observer.finish());
});
