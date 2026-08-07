import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { enterpriseDocumentFixtures } from '../fixtures/enterpriseIntelligenceDocuments';
import { IDS, installEnterpriseIntelligenceFixture } from './enterpriseIntelligenceNetworkFixture';

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const DIGEST = /\b[0-9a-f]{64}\b/i;
const PRIVATE_VALUE = /(?:sk-private-browser-fixture|raw-private-evidence-sentinel|Bearer\s+fixture-token)/i;

const workspace = (page: Page) => page.getByTestId('enterprise-intelligence-workspace');
const tab = (page: Page, name: string) => workspace(page).getByRole('button', { name, exact: true });
const activeSection = (page: Page) => workspace(page).locator('section:visible').first();

const chooseFirst = async (section: Locator) => {
  const selector = section.locator('select').first();
  await expect(selector).toBeVisible();
  const value = await selector.locator('option:not([disabled])').evaluateAll(options => (
    options.map(option => (option as HTMLOptionElement).value).find(Boolean) || ''
  ));
  expect(value).not.toBe('');
  await selector.selectOption(value);
};

const assertSafeBrowserProjection = async (page: Page) => {
  const surface = workspace(page);
  const attributes = await surface.locator('input, textarea').evaluateAll(elements => elements.map(element => [
    element.getAttribute('name'), element.getAttribute('placeholder'), element.getAttribute('aria-label'),
    element.closest('label')?.textContent,
  ].filter(Boolean).join(' ')).join('\n'));
  expect(attributes).not.toMatch(/(?:uuid|raw\s+id|content\s+hash|sha-?256|version\s+id|comma[- ]separated|item\s+ids?)/i);
  const visibleText = await surface.innerText();
  expect(visibleText).not.toMatch(UUID);
  expect(visibleText).not.toMatch(DIGEST);
  expect(visibleText).not.toMatch(PRIVATE_VALUE);
};

const assertA11yAndOverflow = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).include('[data-testid="enterprise-intelligence-workspace"]').analyze();
  expect(axe.violations.filter(violation => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
};

test('application startup removes only the historical browser provider key once', async ({ page }) => {
  await page.goto('/');
  await page.evaluate((seed) => {
    for (const [name, value] of Object.entries(seed)) localStorage.setItem(name, value);
  }, {
    'avalaos-core-v1-api-key': 'historical-browser-secret',
    'avalaos-core-v1-theme': JSON.stringify('dark'),
  });
  await page.addInitScript(() => {
    const providerKey = 'avalaos-core-v1-api-key';
    const original = Storage.prototype.removeItem;
    (window as typeof window & { __legacyProviderRemovalCount?: number }).__legacyProviderRemovalCount = 0;
    Storage.prototype.removeItem = function removeItem(key: string) {
      if (key === providerKey) {
        (window as typeof window & { __legacyProviderRemovalCount?: number }).__legacyProviderRemovalCount =
          ((window as typeof window & { __legacyProviderRemovalCount?: number }).__legacyProviderRemovalCount || 0) + 1;
      }
      return original.call(this, key);
    };
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('avalaos-core-v1-api-key'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('avalaos-core-v1-theme'))).toBe(JSON.stringify('dark'));
  expect(await page.evaluate(() => (window as typeof window & { __legacyProviderRemovalCount?: number }).__legacyProviderRemovalCount)).toBe(1);
});

test('deterministic compressed PDF and DOCX fixtures are representative and stable', async () => {
  const [pdf, docx] = enterpriseDocumentFixtures.map(fixture => fixture.create());
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.includes(Buffer.from('/FlateDecode'))).toBeTruthy();
  expect(docx.readUInt32LE(0)).toBe(0x04034b50);
  expect(docx.includes(Buffer.from('word/document.xml'))).toBeTruthy();
  expect(enterpriseDocumentFixtures[0].create().equals(pdf)).toBeTruthy();
  expect(enterpriseDocumentFixtures[1].create().equals(docx)).toBeTruthy();
});

test('provider, evidence, Delivery, Monitor, and Assemble remain projection-driven after reload', async ({ page }) => {
  const fixture = await installEnterpriseIntelligenceFixture(page);
  await page.goto('/tests/browser/enterpriseIntelligenceHarness.html');
  await expect(workspace(page)).toContainText('Synthetic drafting provider');
  await assertSafeBrowserProjection(page);

  const controls = activeSection(page);
  fixture.transportFailNext('provider.validate');
  await controls.getByRole('button', { name: /^Validate$/i }).click();
  await expect(workspace(page)).toContainText(/validated/i);
  await controls.getByRole('button', { name: /^Validate$/i }).click();
  await controls.getByRole('button', { name: /^Activate$/i }).click();
  await expect(workspace(page)).toContainText(/active/i);
  await controls.getByRole('button', { name: /enable.*route/i }).click();
  await expect(workspace(page)).toContainText(/ready/i);
  await controls.getByRole('button', { name: /disable.*route/i }).click();
  await controls.getByRole('button', { name: /enable.*route/i }).click();
  const routeToggle = fixture.commandPayloads.find(request => request.operation === 'provider.route.toggle') as { payload?: { allowedRoles?: string[] } } | undefined;
  expect(routeToggle?.payload?.allowedRoles).toEqual([IDS.routeRole]);

  await tab(page, 'Evidence Intake').click();
  const intake = activeSection(page);
  const pdf = enterpriseDocumentFixtures[0];
  await intake.locator('input[type="file"]').setInputFiles({ name: pdf.name, mimeType: pdf.mimeType, buffer: pdf.create() });
  await intake.getByRole('button', { name: /store private source|(?:commit|upload).*source/i }).click();
  await expect(workspace(page)).toContainText('Synthetic compressed evidence');
  await intake.getByRole('button', { name: /run governed extraction|extract.*candidate/i }).click();

  await tab(page, 'Candidate Review').click();
  const review = activeSection(page);
  await review.getByRole('button', { name: /^Accept$/i }).click();
  await chooseFirst(review);
  await review.getByRole('checkbox', { name: 'Select for promotion', exact: true }).check();
  await review.getByRole('button', { name: /promote.*assess/i }).click();
  await expect(workspace(page).getByRole('status')).toContainText('Selected evidence promoted into a new Assess draft version.');
  await expect(review).toContainText('Idempotency: committed');

  await tab(page, 'Studio Handoff').click();
  const handoff = activeSection(page);
  await chooseFirst(handoff);
  await handoff.getByRole('button', { name: /create delivery draft|create.*work.package/i }).click();
  await expect(workspace(page).getByRole('status')).toContainText('Approved Studio document handed off to a governed Delivery draft.');
  await tab(page, 'Work Package').click();
  await expect(workspace(page)).toContainText('New synthetic Delivery draft');

  await tab(page, 'Monitor Baseline').click();
  const monitor = activeSection(page);
  await chooseFirst(monitor);
  await monitor.getByRole('button', { name: /(?:create|stage).*baseline/i }).click();
  await expect(workspace(page)).toContainText('Synthetic read-only baseline');

  await tab(page, 'Assemble Blueprint').click();
  const assemble = activeSection(page);
  await chooseFirst(assemble);
  await assemble.locator('input:not([type="hidden"])').first().fill('Synthetic governed blueprint');
  await assemble.getByRole('button', { name: /create.*blueprint/i }).click();
  await expect(workspace(page)).toContainText('Synthetic governed blueprint');
  await expect(workspace(page)).toContainText(/Agent Tools.*disabled/is);

  await workspace(page).getByRole('button', { name: 'Reload committed state', exact: true }).click();
  await page.reload();
  await tab(page, 'Work Package').click();
  await expect(workspace(page)).toContainText('New synthetic Delivery draft');
  await tab(page, 'Monitor Baseline').click();
  await expect(workspace(page)).toContainText('Synthetic read-only baseline');
  await tab(page, 'Assemble Blueprint').click();
  await expect(workspace(page)).toContainText('Synthetic governed blueprint');
  await assertSafeBrowserProjection(page);
  await assertA11yAndOverflow(page);
  expect(fixture.operations).toEqual(expect.arrayContaining([
    'provider.validate', 'provider.activate', 'provider.route.toggle', 'evidence.source.create',
    'evidence.extract', 'evidence.candidate.review', 'evidence.assess.promote',
    'studio.delivery.handoff', 'monitor.baseline.create', 'assemble.blueprint.create',
  ]));
  const actionBodies = fixture.commandPayloads as Array<{
    operation?: string;
    commandType?: string;
    requestId?: string;
    idempotencyKey?: string;
    payload?: Record<string, unknown>;
  }>;
  const validationBodies = actionBodies.filter(body => body.operation === 'provider.validate');
  expect(validationBodies).toHaveLength(3);
  expect(validationBodies[0]).toEqual(validationBodies[1]);
  expect(validationBodies[2].idempotencyKey).not.toBe(validationBodies[1].idempotencyKey);
  expect(validationBodies[2].requestId).not.toBe(validationBodies[1].requestId);
  const routeBodies = actionBodies.filter(body => body.operation === 'provider.route.toggle');
  expect(routeBodies.map(body => body.payload?.enabled)).toEqual([true, false, true]);
  expect(new Set(routeBodies.map(body => body.idempotencyKey)).size).toBe(3);
  for (const body of actionBodies) {
    const operation = body.operation || body.commandType;
    expect(body.idempotencyKey).toMatch(new RegExp(`^ei:${String(operation).replaceAll('.', '\\.')}:`));
  }
  expect(fixture.unexpectedRequests).toEqual([]);
});

test('provider secret actions recover stale authority as the same in-memory browser action', async ({ page }) => {
  const fixture = await installEnterpriseIntelligenceFixture(page);
  const browserMessages: string[] = [];
  page.on('console', message => browserMessages.push(message.text()));
  await page.goto('/tests/browser/enterpriseIntelligenceHarness.html');
  const controls = activeSection(page);
  const keyInput = controls.getByLabel('Provider key (sent once)');

  for (const action of [
    { operation: 'provider.secret.bind' as const, button: /bind key securely/i, key: 'sk-private-browser-fixture-bind' },
    { operation: 'provider.secret.rotate' as const, button: /rotate key/i, key: 'sk-private-browser-fixture-rotate' },
  ]) {
    fixture.staleProviderAfterManagedWriteNext(action.operation);
    fixture.transportFailProviderAuthorityRecheckNext();
    await keyInput.fill(action.key);
    await controls.getByRole('button', { name: action.button }).click();
    await expect(workspace(page).getByRole('status')).toContainText(action.operation.endsWith('bind') ? /secret bound/i : /key rotated/i);
    await expect(keyInput).toHaveValue('');

    const bodies = fixture.commandPayloads.filter(body => body.operation === action.operation) as Array<{
      expectedAuthorizationVersion: number;
      idempotencyKey: string;
      requestId: string;
      payload: Record<string, unknown>;
    }>;
    expect(bodies).toHaveLength(2);
    expect(bodies[1].idempotencyKey).toBe(bodies[0].idempotencyKey);
    expect(bodies[1].requestId).toBe(bodies[0].requestId);
    expect(bodies[1].payload).toEqual(bodies[0].payload);
    expect(bodies[1].expectedAuthorizationVersion).toBe(bodies[0].expectedAuthorizationVersion + 1);
    expect(Object.keys(bodies[1]).filter(key => JSON.stringify(bodies[1][key as keyof typeof bodies[number]]) !== JSON.stringify(bodies[0][key as keyof typeof bodies[number]]))).toEqual(['expectedAuthorizationVersion']);
    const rechecks = fixture.authorityRecheckPayloads.filter(body => body.operation === action.operation);
    expect(rechecks).toHaveLength(2);
    expect(rechecks[0]).toEqual(rechecks[1]);
    expect(rechecks[0]).toEqual({
      operation: action.operation,
      organizationId: IDS.organization,
      workspaceId: IDS.workspace,
      providerConfigId: IDS.provider,
    });
    expect(JSON.stringify(rechecks)).not.toMatch(PRIVATE_VALUE);
  }

  expect(fixture.providerRecoveryCounts()).toEqual({
    managedSecretWrites: 2,
    providerValidations: 2,
    providerEffects: 2,
    strandedManagedSecrets: 0,
  });

  fixture.revokeProviderAuthorityOnStaleNext('provider.validate');
  const validationCount = fixture.commandPayloads.filter(body => body.operation === 'provider.validate').length;
  await controls.getByRole('button', { name: /^Validate$/i }).click();
  await expect(workspace(page).getByRole('alert')).toContainText(/do not have.*capability|permission/i);
  expect(fixture.commandPayloads.filter(body => body.operation === 'provider.validate')).toHaveLength(validationCount + 1);
  expect(fixture.authorityRecheckPayloads.filter(body => body.operation === 'provider.validate')).toHaveLength(1);
  fixture.restoreProviderAuthority();

  const persisted = await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
  }));
  expect(JSON.stringify(persisted)).not.toMatch(PRIVATE_VALUE);
  expect(browserMessages.join('\n')).not.toMatch(PRIVATE_VALUE);
});

test('keyboard navigation, DOCX intake, and command failure never show false success', async ({ page }) => {
  const fixture = await installEnterpriseIntelligenceFixture(page);
  await page.goto('/tests/browser/enterpriseIntelligenceHarness.html');
  await tab(page, 'Evidence Intake').focus();
  await page.keyboard.press('Enter');
  await expect(tab(page, 'Evidence Intake')).toHaveAttribute('aria-current', 'page');
  const docx = enterpriseDocumentFixtures[1];
  await activeSection(page).locator('input[type="file"]').setInputFiles({ name: docx.name, mimeType: docx.mimeType, buffer: docx.create() });
  await expect(workspace(page)).toContainText(/DOCX|synthetic-evidence\.docx/i);

  fixture.failNext('studio.delivery.handoff', 'RESOURCE_STALE');
  await tab(page, 'Studio Handoff').click();
  const handoff = activeSection(page);
  await chooseFirst(handoff);
  await handoff.getByRole('button', { name: /create delivery draft|create.*work.package/i }).click();
  await expect(workspace(page).getByRole('alert')).toContainText(/unavailable|no fallback/i);
  await tab(page, 'Work Package').click();
  await expect(workspace(page)).not.toContainText('New synthetic Delivery draft');
  await workspace(page).getByRole('button', { name: 'Reload committed state', exact: true }).click();
  await tab(page, 'Work Package').click();
  await expect(workspace(page)).not.toContainText('New synthetic Delivery draft');
  await assertSafeBrowserProjection(page);
  await assertA11yAndOverflow(page);
});

for (const scenario of [
  { projectionFailure: 'stale', expected: /projection.*unavailable|not replaced with local data/i },
  { projectionFailure: 'denied', expected: /projection.*unavailable|not replaced with local data/i },
  { projectionFailure: 'unavailable', expected: /projection.*unavailable|not replaced with local data/i },
] as const) {
  test(`${scenario.projectionFailure} projection fails closed and recovers only by explicit reload`, async ({ page }) => {
    const fixture = await installEnterpriseIntelligenceFixture(page, { projectionFailure: scenario.projectionFailure });
    await page.goto('/tests/browser/enterpriseIntelligenceHarness.html');
    await expect(page.getByRole('alert')).toContainText(scenario.expected);
    for (const button of await page.locator('[data-testid="enterprise-intelligence-workspace"] section button').all()) {
      expect(await button.isDisabled()).toBeTruthy();
    }
    fixture.recoverProjection();
    await page.getByRole('button', { name: 'Reload committed state', exact: true }).click();
    await expect(workspace(page)).toContainText('Synthetic drafting provider');
    await assertSafeBrowserProjection(page);
  });
}

test('no-BYOK and provider-unavailable projections are explicit and block extraction', async ({ page }) => {
  await installEnterpriseIntelligenceFixture(page, { noByok: true });
  await page.goto('/tests/browser/enterpriseIntelligenceHarness.html');
  const noByokControls = activeSection(page);
  await expect(noByokControls.locator('select').nth(1).locator('option')).toHaveCount(1);
  await expect(noByokControls.getByRole('button', { name: /^Validate$/i })).toBeDisabled();
  await expect(noByokControls.getByRole('button', { name: /^Activate$/i })).toBeDisabled();
  await tab(page, 'Evidence Intake').click();
  await expect(activeSection(page).getByRole('button', { name: /extract/i })).toBeDisabled();
  await assertSafeBrowserProjection(page);

  await page.unrouteAll({ behavior: 'wait' });
  await installEnterpriseIntelligenceFixture(page, { providerUnavailable: true });
  await page.reload();
  await expect(activeSection(page)).toContainText(/provider unavailable/i);
  await tab(page, 'Evidence Intake').click();
  await expect(activeSection(page).getByRole('button', { name: /extract/i })).toBeDisabled();
  await assertA11yAndOverflow(page);
});

test('missing tenant context has no browser fallback', async ({ page }) => {
  await installEnterpriseIntelligenceFixture(page);
  await page.goto('/tests/browser/enterpriseIntelligenceHarness.html?missing-context=1');
  await expect(page.getByRole('heading', { name: 'Enterprise Intelligence unavailable' })).toBeVisible();
  await expect(page.getByText(/no local authority fallback/i)).toBeVisible();
  await expect(workspace(page)).toHaveCount(0);
});
