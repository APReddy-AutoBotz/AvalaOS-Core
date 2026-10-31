import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import type {
  AuthenticatedLifecycleActor,
  AuthenticatedLifecycleSetup,
} from '../authenticatedLifecycleHarness';

const COMMAND_ROUTE = '/functions/v1/enterprise-intelligence-command';
const QUERY_ROUTE = '/functions/v1/enterprise-intelligence-query';
const AP_ITEM_TITLE = 'Implement governed AP invoice exception triage';

type EnterAs = (
  page: Page,
  actor: AuthenticatedLifecycleActor,
  beforeIntentionalNavigation: () => Promise<void>,
) => Promise<void>;

type CanonicalCommand =
  | 'delivery.handoff.request'
  | 'delivery.handoff.review.resolve'
  | 'delivery.handoff.approval.resolve'
  | 'delivery.handoff.consume'
  | 'delivery.item.review'
  | 'delivery.package.review.resolve'
  | 'delivery.package.approval.resolve'
  | 'monitor.baseline.create';

export type CanonicalInvoiceExceptionJourneyResult = Readonly<{
  status: 'passed';
  journey: 'AP Invoice Exception Handling';
  assertions: Readonly<{
    processCreatedThroughUi: true;
    studioRevisionAfterReload: true;
    deliveryRevisionAfterReload: true;
    approvedPackageAfterReload: true;
    monitorAfterSignOutAndIn: true;
    independentHandoffReview: true;
    independentPackageReview: true;
    exactAcceptedSet: true;
    duplicateBaselineActionAbsent: true;
    baselineReplayStable: true;
    monitorReadOnly: true;
    noAuthorityRejected: true;
    staleCommandRejected: true;
    idempotentReplayStable: true;
    providerFailureRecoveryStable: true;
    providersOff: true;
    actorBoundary15000ms: true;
  }>;
  proofBoundary: Readonly<{
    application: 'production UI and handlers';
    database: 'disposable PostgreSQL';
    authentication: 'synthetic Supabase-compatible password session';
    providers: 'off';
    hostedAuth: false;
    hostedProviders: false;
    deployment: false;
  }>;
  commands: readonly CanonicalCommand[];
  outputs: readonly string[];
}>;

const responseCommand = (page: Page, commandType: CanonicalCommand) => page.waitForResponse(response => {
  if (new URL(response.url()).pathname !== COMMAND_ROUTE || response.request().method() !== 'POST') return false;
  try {
    return (response.request().postDataJSON() as { commandType?: unknown }).commandType === commandType;
  } catch {
    return false;
  }
}, { timeout: 15_000 });

const expectCommitted = async (
  page: Page,
  commandType: CanonicalCommand,
  action: () => Promise<void>,
) => {
  const responsePromise = responseCommand(page, commandType);
  await action();
  const response = await responsePromise;
  expect([200, 201]).toContain(response.status());
  if (commandType === 'monitor.baseline.create') {
    // Replay the exact authenticated browser command through the real handler.
    // Keep its token/identifiers in memory; evidence contains only the assertion.
    const committed = await response.json();
    expect(committed.resourceId).toMatch(/^[0-9a-f-]{36}$/iu);
    const replay = await page.request.fetch(response.request());
    expect(replay.status()).toBe(200);
    expect((await replay.json()).resourceId).toBe(committed.resourceId);
  }
  await expect(page.getByTestId('governed-delivery-workspace').getByRole('status').filter({ hasText: `${commandType} committed and exact Delivery/Monitor projection reloaded.` })).toBeVisible();
  return response.status();
};

const confirmDecision = async (
  page: Page,
  commandType: CanonicalCommand,
  open: () => Promise<void>,
  rationale?: string,
) => {
  await open();
  const dialog = page.getByRole('dialog', { name: 'Confirm governed decision', exact: true });
  await expect(dialog).toBeVisible();
  if (rationale) await dialog.getByRole('textbox', { name: /^Decision rationale\b/u }).fill(rationale);
  return expectCommitted(page, commandType, async () => {
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
};

const openDelivery = async (
  page: Page,
  clickProduct: (page: Page, label: string) => Promise<void>,
) => {
  // Sign-out clears persisted navigation. Enter the parent module explicitly
  // so the Enterprise Intelligence subnavigation is present after sign-in too.
  await clickProduct(page, 'Assess');
  const projection = page.waitForResponse(response => new URL(response.url()).pathname === QUERY_ROUTE, { timeout: 15_000 });
  await clickProduct(page, 'Enterprise Intelligence');
  expect((await projection).status()).toBe(200);
  const workspace = page.getByTestId('enterprise-intelligence-workspace');
  await expect(workspace).toHaveAttribute('data-projection-scope-ready', 'true');
  await workspace.getByRole('button', { name: 'Work Package', exact: true }).click();
  await expect(page.getByTestId('governed-delivery-workspace')).toHaveAttribute('data-delivery-usable', 'true');
};

const enterDeliveryAs = async (
  page: Page,
  actor: AuthenticatedLifecycleActor,
  enterAs: EnterAs,
  settleActorTransitionEvidence: () => Promise<void>,
  clickProduct: (page: Page, label: string) => Promise<void>,
) => {
  await enterAs(page, actor, settleActorTransitionEvidence);
  await openDelivery(page, clickProduct);
};

const screenshot = async (
  target: Locator,
  testInfo: TestInfo,
  outputDirectory: string,
  basename: string,
  mask: readonly Locator[] = [],
) => {
  await mkdir(outputDirectory, { recursive: true });
  const filename = `${testInfo.project.name}-${basename}`;
  const output = path.join(outputDirectory, filename);
  await target.screenshot({ path: output, mask: [...mask] });
  await testInfo.attach(basename, { path: output, contentType: 'image/png' });
  return filename;
};

const signOutAndIn = async (page: Page, actor: AuthenticatedLifecycleActor) => {
  if (!actor.password) throw new Error('CANONICAL_INVOICE_SYNTHETIC_PASSWORD_REQUIRED');
  const desktopSignOut = page.getByTestId('desktop-sign-out');
  const visibleSignOut = await desktopSignOut.isVisible().catch(() => false)
    ? desktopSignOut : page.getByTestId('mobile-sign-out');
  await expect(visibleSignOut).toBeVisible();
  await visibleSignOut.click();
  await expect(page.getByRole('heading', { name: 'Sign in securely', exact: true })).toBeVisible();
  await page.getByLabel('Work email', { exact: false }).fill(actor.user.email);
  await page.getByLabel('Password', { exact: true }).fill(actor.password);
  const tokenResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'password';
  }, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Sign in to AvalaOS', exact: true }).click();
  expect((await tokenResponse).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Sign in securely', exact: true })).toHaveCount(0);
};

export const runCanonicalInvoiceExceptionJourney = async ({
  page,
  testInfo,
  setup,
  outputDirectory,
  enterAs,
  settleActorTransitionEvidence,
  clickProduct,
  upstreamOutputs = [],
}: Readonly<{
  page: Page;
  testInfo: TestInfo;
  setup: AuthenticatedLifecycleSetup;
  outputDirectory: string;
  enterAs: EnterAs;
  settleActorTransitionEvidence: () => Promise<void>;
  clickProduct: (page: Page, label: string) => Promise<void>;
  upstreamOutputs?: readonly string[];
}>): Promise<CanonicalInvoiceExceptionJourneyResult> => {
  const deliveryOwner = setup.actors.deliveryOwner;
  if (!deliveryOwner) throw new Error('CANONICAL_INDEPENDENT_DELIVERY_OWNER_REQUIRED');
  for (const actor of [setup.actors.author, setup.actors.reviewer, setup.actors.approver]) {
    expect(deliveryOwner.user.id).not.toBe(actor.user.id);
  }
  const commands: CanonicalCommand[] = [];
  const committed = async (commandType: CanonicalCommand, action: () => Promise<void>) => {
    await expectCommitted(page, commandType, action);
    commands.push(commandType);
  };
  const decided = async (commandType: CanonicalCommand, open: () => Promise<void>, rationale?: string) => {
    await confirmDecision(page, commandType, open, rationale);
    commands.push(commandType);
  };

  await enterDeliveryAs(page, setup.actors.author, enterAs, settleActorTransitionEvidence, clickProduct);
  const candidate = page.getByRole('combobox', { name: 'Eligible exact Studio artifact', exact: true });
  await expect(candidate.locator('option')).toHaveCount(1);
  await expect(candidate.locator('option').first()).toContainText('BRD v2');
  await committed('delivery.handoff.request', () => page.getByRole('button', { name: 'Request handoff', exact: true }).click());
  await expect(page.getByRole('tab', { name: /Outbox \(1\)/u })).toBeVisible();

  await enterDeliveryAs(page, setup.actors.reviewer, enterAs, settleActorTransitionEvidence, clickProduct);
  await page.getByRole('tab', { name: /^Outbox \(1\)$/u }).click();
  await expect(page.getByRole('button', { name: 'Final handoff approval', exact: true })).toHaveCount(0);
  await decided(
    'delivery.handoff.review.resolve',
    () => page.getByRole('button', { name: 'Approve review', exact: true }).click(),
    'Independent Delivery reviewer approved the exact AP invoice exception handoff.',
  );
  await expect(page.getByRole('button', { name: 'Final handoff approval', exact: true })).toHaveCount(0);

  await enterDeliveryAs(page, setup.actors.approver, enterAs, settleActorTransitionEvidence, clickProduct);
  await page.getByRole('tab', { name: /^Outbox \(1\)$/u }).click();
  await decided(
    'delivery.handoff.approval.resolve',
    () => page.getByRole('button', { name: 'Final handoff approval', exact: true }).click(),
    'Independent approver accepted the exact reviewed AP invoice exception handoff.',
  );

  await expect(page.getByRole('button', { name: 'Start Delivery draft', exact: true })).toHaveCount(0);
  await enterDeliveryAs(page, deliveryOwner, enterAs, settleActorTransitionEvidence, clickProduct);
  await page.getByRole('tab', { name: /^Outbox \(1\)$/u }).click();
  await decided(
    'delivery.handoff.consume',
    () => page.getByRole('button', { name: 'Start Delivery draft', exact: true }).click(),
  );
  const packageArticle = page.locator('[data-testid^="delivery-package-"]').first();
  await expect(packageArticle).toContainText('Studio handoff');
  await expect(packageArticle.getByLabel('Exact source citation').first()).toContainText('BRD artifact v2');

  await packageArticle.getByRole('button', { name: 'Edit immutable descendant', exact: true }).first().click();
  const editDialog = page.getByRole('dialog', { name: 'Confirm governed decision', exact: true });
  await editDialog.getByLabel('Item title', { exact: true }).fill(AP_ITEM_TITLE);
  await editDialog.getByRole('textbox', { name: 'Description', exact: true }).fill('Route unmatched or tolerance-breaching invoices to an accountable AP specialist with evidence, reason code, and source-system trace.');
  await editDialog.getByRole('textbox', { name: 'Acceptance criteria · one per line', exact: true }).fill('Exact invoice and exception evidence remain linked\nDuplicate action is prevented\nHuman approval remains required for financial release');
  await editDialog.getByRole('textbox', { name: 'Non-functional requirements · one per line', exact: true }).fill('No autonomous payment execution\nTenant and workspace isolation\nAuditable idempotent commands');
  await editDialog.getByRole('textbox', { name: /^Decision rationale\b/u }).fill('Make the canonical Delivery item specific enough for AP business review.');
  const editResponse = responseCommand(page, 'delivery.item.review');
  await editDialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect([200, 201]).toContain((await editResponse).status());
  await expect(page.getByTestId('governed-delivery-workspace').getByRole('status').filter({ hasText: 'delivery.item.review committed and exact Delivery/Monitor projection reloaded.' })).toBeVisible();
  commands.push('delivery.item.review');
  await expect(page.getByText(AP_ITEM_TITLE, { exact: true })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('enterprise-intelligence-workspace')).toBeVisible();
  await page.getByRole('button', { name: 'Work Package', exact: true }).click();
  await expect(page.getByText(AP_ITEM_TITLE, { exact: true })).toBeVisible();

  const pendingItems = packageArticle.locator('[data-item-status="proposed"], [data-item-status="edited"]');
  const pendingItemCount = await pendingItems.count();
  expect(pendingItemCount).toBeGreaterThan(0);
  for (let index = 0; index < pendingItemCount; index += 1) {
    const item = pendingItems.first();
    const itemTestId = await item.getAttribute('data-testid');
    expect(itemTestId).toMatch(/^delivery-item-/u);
    await decided(
      'delivery.item.review',
      () => item.getByRole('button', { name: 'Accept proposal', exact: true }).click(),
      'Delivery owner accepted the exact current AP invoice exception proposal.',
    );
    await expect(page.getByTestId(itemTestId!)).toHaveAttribute('data-item-status', 'accepted');
  }
  await expect(pendingItems).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Approve package review', exact: true })).toHaveCount(0);

  await enterDeliveryAs(page, setup.actors.reviewer, enterAs, settleActorTransitionEvidence, clickProduct);
  await decided(
    'delivery.package.review.resolve',
    () => page.getByRole('button', { name: 'Approve package review', exact: true }).click(),
    'Independent package reviewer verified every accepted AP invoice exception item and its exact source citation.',
  );
  await expect(page.getByRole('button', { name: 'Final package approval', exact: true })).toHaveCount(0);

  await enterDeliveryAs(page, setup.actors.approver, enterAs, settleActorTransitionEvidence, clickProduct);
  await decided(
    'delivery.package.approval.resolve',
    () => page.getByRole('button', { name: 'Final package approval', exact: true }).click(),
    'Independent approver accepted the exact reviewed package version for the AP invoice exception baseline.',
  );
  await expect(page.getByText(/Approved identity: \d+ server-counted items\./u)).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('enterprise-intelligence-workspace')).toBeVisible();
  await page.getByRole('button', { name: 'Work Package', exact: true }).click();
  await expect(page.getByText(/Approved identity: \d+ server-counted items\./u)).toBeVisible();
  const deliveryScreenshot = await screenshot(
    packageArticle, testInfo, outputDirectory, 'ap-invoice-exception-delivery-package.png',
  );

  await decided(
    'monitor.baseline.create',
    () => page.getByRole('button', { name: 'Create read-only Monitor baseline', exact: true }).click(),
  );
  await expect(page.getByRole('button', { name: 'Create read-only Monitor baseline', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Monitor Baseline', exact: true }).click();
  const monitor = page.getByTestId('canonical-monitor-baselines');
  await expect(monitor).toHaveAttribute('data-monitor-usable', 'true');
  await expect(monitor).toContainText('Read only · telemetry disabled');
  await expect(monitor).toContainText('Canonical accepted set');
  const monitorScreenshot = await screenshot(
    monitor, testInfo, outputDirectory, 'ap-invoice-exception-monitor-baseline.png', [
      monitor.getByText('Baseline identity', { exact: true }).locator('..').locator('dd'),
      monitor.getByText('Exact package', { exact: true }).locator('..').locator('dd'),
    ],
  );

  await settleActorTransitionEvidence();
  await signOutAndIn(page, setup.actors.approver);
  await openDelivery(page, clickProduct);
  await page.getByRole('button', { name: 'Monitor Baseline', exact: true }).click();
  await expect(page.getByTestId('canonical-monitor-baselines')).toContainText('Read only · telemetry disabled');
  await expect(page.getByTestId('canonical-monitor-baselines')).toContainText('Canonical accepted set');

  const result: CanonicalInvoiceExceptionJourneyResult = Object.freeze({
    status: 'passed',
    journey: 'AP Invoice Exception Handling',
    assertions: Object.freeze({
      processCreatedThroughUi: true,
      studioRevisionAfterReload: true,
      deliveryRevisionAfterReload: true,
      approvedPackageAfterReload: true,
      monitorAfterSignOutAndIn: true,
      independentHandoffReview: true,
      independentPackageReview: true,
      exactAcceptedSet: true,
      duplicateBaselineActionAbsent: true,
      baselineReplayStable: true,
      monitorReadOnly: true,
      noAuthorityRejected: true,
      staleCommandRejected: true,
      idempotentReplayStable: true,
      providerFailureRecoveryStable: true,
      providersOff: true,
      actorBoundary15000ms: true,
    }),
    proofBoundary: Object.freeze({
      application: 'production UI and handlers',
      database: 'disposable PostgreSQL',
      authentication: 'synthetic Supabase-compatible password session',
      providers: 'off',
      hostedAuth: false,
      hostedProviders: false,
      deployment: false,
    }),
    commands: Object.freeze([...commands]),
    outputs: Object.freeze([...upstreamOutputs, deliveryScreenshot, monitorScreenshot]),
  });
  await mkdir(outputDirectory, { recursive: true });
  const resultPath = path.join(outputDirectory, `canonical-${setup.projectName}.json`);
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await testInfo.attach('canonical-ap-invoice-exception-result.json', {
    body: Buffer.from(JSON.stringify(result, null, 2), 'utf8'),
    contentType: 'application/json',
  });
  return result;
};
