import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Locator, type Page, type Response as PlaywrightResponse, type TestInfo } from '@playwright/test';
import type {
  AuthenticatedLifecycleActor,
  AuthenticatedLifecycleSetup,
} from '../authenticatedLifecycleHarness';
import {
  approvedBusinessOutputMarkdown,
  validateApprovedDeliveryItemEvidence,
} from './canonicalBusinessOutputEvidence';

const COMMAND_ROUTE = '/functions/v1/enterprise-intelligence-command';
const QUERY_ROUTE = '/functions/v1/enterprise-intelligence-query';
const AP_ITEM_TITLE = 'Implement governed AP invoice exception triage';

export const awaitCanonicalProjectIndexRead = async <Result>(
  page: Page,
  navigation: () => Promise<Result>,
): Promise<Result> => {
  const deadline = Date.now() + 15_000;
  const projectRead = page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === 'GET' && url.pathname === '/rest/v1/projects';
  }, { timeout: Math.max(1, deadline - Date.now()) });
  const [result, response] = await Promise.all([navigation(), projectRead]);
  expect(response.status(), 'CANONICAL_PROJECT_INDEX_READ_STATUS_REJECTED').toBe(200);
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw new Error('CANONICAL_PROJECT_INDEX_READ_BODY_TIMEOUT');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const bodyCompletion = await Promise.race([
    response.finished(),
    new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('CANONICAL_PROJECT_INDEX_READ_BODY_TIMEOUT')), remainingMs);
    }),
  ]).finally(() => clearTimeout(timeout));
  expect(bodyCompletion, 'CANONICAL_PROJECT_INDEX_READ_NOT_FINISHED').toBeNull();
  return result;
};

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

export type CanonicalApprovedStudioArtifact = Readonly<{
  artifactId: string;
  artifactVersionId: string;
}>;

export type CanonicalCommandReceipt = Readonly<{
  ok: true;
  outcome: 'committed' | 'replayed';
  receiptId: string;
  action: CanonicalCommand;
  resourceId: string;
  resourceVersion: number;
  workPackageId?: string;
  packageVersionId?: string;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const STUDIO_COMMAND_ROUTE = '/functions/v1/studio-artifact-command';
const CONTROLLED_HUMAN_ANCHOR_ROUTE = '/rest/v1/rpc/pr_c_controlled_human_anchor_step';
const STUDIO_APPROVAL_ACTION = 'studio.artifact.approval.resolve';

const studioApprovalRequest = (response: PlaywrightResponse, requestId?: string) => {
  if (new URL(response.url()).pathname !== STUDIO_COMMAND_ROUTE
    || response.request().method() !== 'POST') return false;
  try {
    const request = response.request().postDataJSON() as { commandType?: unknown; requestId?: unknown };
    return request.commandType === STUDIO_APPROVAL_ACTION
      && (requestId === undefined || request.requestId === requestId);
  } catch {
    return false;
  }
};

export const observeCanonicalStudioApprovalResponse = async (
  page: Page,
  action: () => Promise<void>,
  options: Readonly<{ controlledHuman: boolean; stageTimeoutMs?: number }>,
): Promise<PlaywrightResponse> => {
  const stageTimeoutMs = options.stageTimeoutMs ?? 15_000;
  if (!Number.isSafeInteger(stageTimeoutMs) || stageTimeoutMs < 1 || stageTimeoutMs > 15_000) {
    throw new Error('CANONICAL_STUDIO_APPROVAL_BOUNDARY_REJECTED');
  }
  if (!options.controlledHuman) {
    const responsePromise = page.waitForResponse(
      response => studioApprovalRequest(response),
      { timeout: stageTimeoutMs },
    );
    void responsePromise.catch(() => {});
    await action();
    return responsePromise;
  }

  // The controlled-human pre-anchor is a separate server-authorized stage. Keep
  // each stage inside the existing 15 second boundary without charging the
  // product response for time spent obtaining its causal request identity.
  const observed: PlaywrightResponse[] = [];
  const waiters = new Set<() => void>();
  let disposed = false;
  const onResponse = (response: PlaywrightResponse) => {
    observed.push(response);
    for (const wake of [...waiters]) wake();
  };
  page.on('response', onResponse);

  const waitForChange = (remainingMs: number, timeoutCode: string) => new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wake = () => {
      clearTimeout(timer);
      waiters.delete(wake);
      if (disposed) reject(new Error('CANONICAL_STUDIO_APPROVAL_OBSERVER_DISPOSED'));
      else resolve();
    };
    waiters.add(wake);
    timer = setTimeout(() => {
      waiters.delete(wake);
      reject(new Error(timeoutCode));
    }, remainingMs);
  });
  const waitForObserved = async (
    predicate: (response: PlaywrightResponse) => boolean,
    timeoutCode: string,
    deadline: number,
    startIndex = 0,
  ) => {
    let cursor = startIndex;
    while (true) {
      while (cursor < observed.length) {
        const index = cursor++;
        const response = observed[index];
        if (predicate(response)) return { response, index };
      }
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) throw new Error(timeoutCode);
      await waitForChange(remainingMs, timeoutCode);
    }
  };
  const withinDeadline = async <Value>(promise: Promise<Value>, deadline: number, timeoutCode: string) => {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new Error(timeoutCode);
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutCode)), remainingMs);
      }),
    ]).finally(() => clearTimeout(timer));
  };

  const actionPromise = Promise.resolve().then(action);
  // Attach rejection handling immediately; the anchor waiter may win the race.
  void actionPromise.catch(() => {});
  try {
    const anchorDeadline = Date.now() + stageTimeoutMs;
    const anchorWait = waitForObserved(response => {
      const url = new URL(response.url());
      return response.request().method() === 'POST' && url.pathname === CONTROLLED_HUMAN_ANCHOR_ROUTE;
    }, 'CANONICAL_STUDIO_APPROVAL_ANCHOR_TIMEOUT', anchorDeadline);
    const actionFailure = actionPromise.then<never>(
      () => new Promise<never>(() => {}),
      error => Promise.reject(error),
    );
    const { response: anchorResponse, index: anchorResponseIndex } = await Promise.race([anchorWait, actionFailure]);
    if (anchorResponse.status() !== 200) throw new Error('CANONICAL_STUDIO_APPROVAL_ANCHOR_REJECTED');
    let anchorBody: Record<string, unknown>;
    try {
      anchorBody = await withinDeadline(anchorResponse.json(), anchorDeadline,
        'CANONICAL_STUDIO_APPROVAL_ANCHOR_TIMEOUT') as Record<string, unknown>;
    } catch (error) {
      if (error instanceof Error && error.message === 'CANONICAL_STUDIO_APPROVAL_ANCHOR_TIMEOUT') throw error;
      throw new Error('CANONICAL_STUDIO_APPROVAL_ANCHOR_REJECTED');
    }
    const safeAnchor = anchorBody?.safeAnchor;
    const execution = anchorBody?.execution;
    if (anchorBody === null || typeof anchorBody !== 'object' || Array.isArray(anchorBody)
      || safeAnchor === null || typeof safeAnchor !== 'object' || Array.isArray(safeAnchor)
      || execution === null || typeof execution !== 'object' || Array.isArray(execution)
      || (safeAnchor as Record<string, unknown>).action !== STUDIO_APPROVAL_ACTION
      || typeof (execution as Record<string, unknown>).requestId !== 'string'
      || !UUID.test((execution as Record<string, unknown>).requestId as string)) {
      throw new Error('CANONICAL_STUDIO_APPROVAL_ANCHOR_REJECTED');
    }
    const requestId = (execution as Record<string, unknown>).requestId as string;
    const targetDeadline = Date.now() + stageTimeoutMs;
    const targetWait = waitForObserved(
      response => studioApprovalRequest(response, requestId),
      'CANONICAL_STUDIO_APPROVAL_RESPONSE_TIMEOUT',
      targetDeadline,
      anchorResponseIndex + 1,
    );
    const { response: targetResponse } = await Promise.race([targetWait, actionFailure]);
    await withinDeadline(actionPromise, targetDeadline, 'CANONICAL_STUDIO_APPROVAL_ACTION_TIMEOUT');
    return targetResponse;
  } finally {
    disposed = true;
    page.off('response', onResponse);
    for (const wake of [...waiters]) wake();
  }
};

const canonicalRecord = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('CANONICAL_COMMAND_RECEIPT_REJECTED');
  }
  return value as Record<string, unknown>;
};

export const decodeCanonicalApprovedStudioArtifact = (value: unknown): CanonicalApprovedStudioArtifact => {
  const body = canonicalRecord(value);
  // The production adapter preserves the SQL receipt inside the public resource.
  // Require both receipt identities before reading its artifact projection.
  const receipt = canonicalRecord(body.resource);
  const resource = canonicalRecord(receipt.resource);
  const current = canonicalRecord(resource.currentVersion);
  const approved = canonicalRecord(resource.currentApprovedVersion);
  if (body.ok !== true || !['committed', 'replayed'].includes(String(body.outcome))
    || receipt.outcome !== body.outcome
    || typeof body.receiptId !== 'string' || !UUID.test(body.receiptId)
    || receipt.receiptId !== body.receiptId
    || typeof body.resourceId !== 'string' || !UUID.test(body.resourceId)
    || receipt.resourceId !== body.resourceId || resource.id !== body.resourceId
    || resource.lifecycle !== 'approved'
    || typeof current.id !== 'string' || !UUID.test(current.id)
    || current.lifecycle !== 'approved' || approved.id !== current.id
    || approved.lifecycle !== 'approved') {
    throw new Error('CANONICAL_APPROVED_STUDIO_RESPONSE_REJECTED');
  }
  return Object.freeze({ artifactId: body.resourceId, artifactVersionId: current.id });
};

export const decodeCanonicalCommandReceipt = (
  value: unknown,
  expectedAction: CanonicalCommand,
): CanonicalCommandReceipt => {
  const record = canonicalRecord(value);
  if (record.ok !== true
    || !['committed', 'replayed'].includes(String(record.outcome))
    || record.action !== expectedAction
    || typeof record.receiptId !== 'string' || !UUID.test(record.receiptId)
    || typeof record.resourceId !== 'string' || !UUID.test(record.resourceId)
    || !Number.isSafeInteger(record.resourceVersion) || Number(record.resourceVersion) < 1
    || (record.workPackageId !== undefined
      && (typeof record.workPackageId !== 'string' || !UUID.test(record.workPackageId)))
    || (record.packageVersionId !== undefined
      && (typeof record.packageVersionId !== 'string' || !UUID.test(record.packageVersionId)))) {
    throw new Error('CANONICAL_COMMAND_RECEIPT_REJECTED');
  }
  const workPackageId = typeof record.workPackageId === 'string' ? record.workPackageId : undefined;
  const packageVersionId = typeof record.packageVersionId === 'string' ? record.packageVersionId : undefined;
  return Object.freeze({
    ok: true,
    outcome: record.outcome as 'committed' | 'replayed',
    receiptId: record.receiptId,
    action: expectedAction,
    resourceId: record.resourceId,
    resourceVersion: Number(record.resourceVersion),
    ...(workPackageId === undefined ? {} : { workPackageId }),
    ...(packageVersionId === undefined ? {} : { packageVersionId }),
  });
};

export const requireCanonicalReceiptBinding = (
  receipt: CanonicalCommandReceipt,
  expected: Readonly<{
    resourceId?: string;
    resourceVersion?: number;
    workPackageId?: string;
    packageVersionId?: string;
  }>,
) => {
  for (const [key, value] of Object.entries(expected)) {
    if (receipt[key as keyof CanonicalCommandReceipt] !== value) {
      throw new Error(`CANONICAL_COMMAND_RECEIPT_BINDING_REJECTED:${key}`);
    }
  }
  return receipt;
};

export const requireCanonicalExactLocator = async (
  locator: Locator,
  boundary: string,
): Promise<Locator> => {
  // Navigation can render the workspace shell before its exact projection.
  // Wait only for this receipt-bound target within the existing actor limit.
  if (await locator.count() === 0) {
    try { await locator.first().waitFor({ state: 'attached', timeout: 15_000 }); }
    catch { throw new Error(`${boundary}:0`); }
  }
  const count = await locator.count();
  if (count !== 1) throw new Error(`${boundary}:${count}`);
  return locator;
};

export type CanonicalInvoiceExceptionProofBoundary = Readonly<{
  application: 'production UI and handlers';
  providers: 'off';
  hostedProviders: false;
  deployment: false;
  database: 'disposable PostgreSQL' | 'existing synthetic nonproduction Supabase';
  authentication: 'synthetic Supabase-compatible password session' | 'real Supabase password session';
  generation: 'deterministic synthetic test-provider output; providers off';
  frontend: 'local production build' | 'runner-local exact release build';
  hostedAuth: boolean;
}>;

export type CanonicalHostedDatabaseEvidence = Readonly<{
  baselineCount: 1;
  exactApprovedPackage: true;
  exactEditedStudioVersion: true;
  exactAssessGovernAncestry: true;
  singleHandoffConsumption: true;
  independentPackageApproval: true;
  exactAcceptedItemVersions: true;
  readOnlyMonitorTruth: true;
  singleBaselineEffect: true;
  providersOff: true;
}>;

const HOSTED_DATABASE_BOOLEAN_KEYS = Object.freeze([
  'exactApprovedPackage', 'exactEditedStudioVersion', 'exactAssessGovernAncestry',
  'singleHandoffConsumption', 'independentPackageApproval', 'exactAcceptedItemVersions',
  'readOnlyMonitorTruth', 'singleBaselineEffect', 'providersOff',
] as const);

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
    completeApprovedBusinessOutputs: true;
    syntheticContentLabeled: true;
    providersOff: true;
    actorBoundary15000ms: true;
  }>;
  proofBoundary: CanonicalInvoiceExceptionProofBoundary;
  databaseEvidence: CanonicalHostedDatabaseEvidence | null;
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
  expectedRequestPayload: Readonly<Record<string, string | number>> = {},
) => {
  const responsePromise = responseCommand(page, commandType);
  await action();
  const response = await responsePromise;
  expect([200, 201]).toContain(response.status());
  const request = canonicalRecord(response.request().postDataJSON());
  const requestPayload = canonicalRecord(request.payload);
  for (const [key, value] of Object.entries(expectedRequestPayload)) {
    if (requestPayload[key] !== value) {
      throw new Error(`CANONICAL_COMMAND_REQUEST_BINDING_REJECTED:${key}`);
    }
  }
  const committed = decodeCanonicalCommandReceipt(await response.json(), commandType);
  if (commandType === 'monitor.baseline.create') {
    // Replay the exact authenticated browser command through the real handler.
    // Keep its token/identifiers in memory; evidence contains only the assertion.
    const replay = await page.request.fetch(response.request());
    expect(replay.status()).toBe(200);
    const replayed = decodeCanonicalCommandReceipt(await replay.json(), commandType);
    requireCanonicalReceiptBinding(replayed, {
      resourceId: committed.resourceId,
      resourceVersion: committed.resourceVersion,
      workPackageId: committed.workPackageId,
      packageVersionId: committed.packageVersionId,
    });
  }
  await expect(page.getByTestId('governed-delivery-workspace').getByRole('status').filter({ hasText: `${commandType} committed and exact Delivery/Monitor projection reloaded.` })).toBeVisible();
  return committed;
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

const exactOutboxHandoff = async (page: Page, handoffId: string) => {
  const outbox = await requireCanonicalExactLocator(
    page.getByRole('tab', { name: /^Outbox \(\d+\)$/u }),
    'CANONICAL_EXACT_OUTBOX_TAB_REJECTED',
  );
  await outbox.click();
  return requireCanonicalExactLocator(
    page.locator(`[data-handoff-id="${handoffId}"]`),
    'CANONICAL_EXACT_HANDOFF_REJECTED',
  );
};

const selectExactPackage = async (page: Page, packageId: string, packageVersion: number) => {
  const selector = await requireCanonicalExactLocator(
    page.getByRole('list', { name: 'Delivery packages', exact: true })
      .locator(`button[data-package-id="${packageId}"]`),
    'CANONICAL_EXACT_PACKAGE_SELECTOR_REJECTED',
  );
  await selector.click();
  const article = await requireCanonicalExactLocator(
    page.getByTestId(`delivery-package-${packageId}`),
    'CANONICAL_EXACT_PACKAGE_REJECTED',
  );
  await expect(article).toHaveAttribute('data-package-id', packageId);
  await expect(article).toHaveAttribute('data-package-version', String(packageVersion));
  return article;
};

const selectExactBaseline = async (
  page: Page,
  baselineId: string,
  packageId: string,
  packageVersion: number,
) => {
  const monitor = page.getByTestId('canonical-monitor-baselines');
  const selector = await requireCanonicalExactLocator(
    monitor.locator(`button[data-baseline-id="${baselineId}"]`),
    'CANONICAL_EXACT_BASELINE_SELECTOR_REJECTED',
  );
  await selector.click();
  const article = await requireCanonicalExactLocator(
    monitor.getByTestId(`monitor-baseline-${baselineId}`),
    'CANONICAL_EXACT_BASELINE_REJECTED',
  );
  await expect(article).toHaveAttribute('data-baseline-id', baselineId);
  await expect(article).toHaveAttribute('data-package-id', packageId);
  await expect(article).toHaveAttribute('data-package-version', String(packageVersion));
  return article;
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
  approvedStudioArtifact,
  proofBoundary,
  readHostedDatabaseEvidence,
  upstreamOutputs = [],
}: Readonly<{
  page: Page;
  testInfo: TestInfo;
  setup: AuthenticatedLifecycleSetup;
  outputDirectory: string;
  enterAs: EnterAs;
  settleActorTransitionEvidence: () => Promise<void>;
  clickProduct: (page: Page, label: string) => Promise<void>;
  approvedStudioArtifact: CanonicalApprovedStudioArtifact;
  proofBoundary: CanonicalInvoiceExceptionProofBoundary;
  readHostedDatabaseEvidence?: () => Promise<unknown>;
  upstreamOutputs?: readonly string[];
}>): Promise<CanonicalInvoiceExceptionJourneyResult> => {
  if (proofBoundary.hostedAuth) {
    if (proofBoundary.database !== 'existing synthetic nonproduction Supabase'
      || proofBoundary.authentication !== 'real Supabase password session'
      || proofBoundary.frontend !== 'runner-local exact release build') {
      throw new Error('CANONICAL_REAL_AUTH_PROOF_BOUNDARY_REJECTED');
    }
  } else if (proofBoundary.database !== 'disposable PostgreSQL'
    || proofBoundary.authentication !== 'synthetic Supabase-compatible password session'
    || proofBoundary.frontend !== 'local production build') {
    throw new Error('CANONICAL_DISPOSABLE_PROOF_BOUNDARY_REJECTED');
  }
  if (proofBoundary.hostedAuth !== Boolean(readHostedDatabaseEvidence)) {
    throw new Error('CANONICAL_DATABASE_EVIDENCE_READER_BOUNDARY_REJECTED');
  }
  if (!UUID.test(approvedStudioArtifact.artifactId)
    || !UUID.test(approvedStudioArtifact.artifactVersionId)) {
    throw new Error('CANONICAL_APPROVED_STUDIO_ARTIFACT_REJECTED');
  }
  const deliveryOwner = setup.actors.deliveryOwner;
  if (!deliveryOwner) throw new Error('CANONICAL_INDEPENDENT_DELIVERY_OWNER_REQUIRED');
  for (const actor of [setup.actors.author, setup.actors.reviewer, setup.actors.approver]) {
    expect(deliveryOwner.user.id).not.toBe(actor.user.id);
  }
  const commands: CanonicalCommand[] = [];
  const committed = async (
    commandType: CanonicalCommand,
    action: () => Promise<void>,
    expectedRequestPayload: Readonly<Record<string, string | number>> = {},
  ) => {
    const receipt = await expectCommitted(page, commandType, action, expectedRequestPayload);
    commands.push(commandType);
    return receipt;
  };
  const decided = async (commandType: CanonicalCommand, open: () => Promise<void>, rationale?: string) => {
    const receipt = await confirmDecision(page, commandType, open, rationale);
    commands.push(commandType);
    return receipt;
  };

  await enterDeliveryAs(page, setup.actors.author, enterAs, settleActorTransitionEvidence, clickProduct);
  const candidate = page.getByRole('combobox', { name: 'Eligible exact Studio artifact', exact: true });
  const candidateOption = await requireCanonicalExactLocator(
    candidate.locator(`option[value="${approvedStudioArtifact.artifactVersionId}"]`),
    'CANONICAL_EXACT_STUDIO_ARTIFACT_REJECTED',
  );
  await expect(candidateOption).toContainText('BRD v2');
  await candidate.selectOption(approvedStudioArtifact.artifactVersionId);
  await expect(candidate).toHaveValue(approvedStudioArtifact.artifactVersionId);
  const requestReceipt = await committed(
    'delivery.handoff.request',
    () => page.getByRole('button', { name: 'Request handoff', exact: true }).click(),
    {
      studioArtifactId: approvedStudioArtifact.artifactId,
      studioArtifactVersionId: approvedStudioArtifact.artifactVersionId,
      expectedCurrentVersionId: approvedStudioArtifact.artifactVersionId,
      expectedApprovedVersionId: approvedStudioArtifact.artifactVersionId,
    },
  );
  requireCanonicalReceiptBinding(requestReceipt, { resourceVersion: 1 });
  const handoffId = requestReceipt.resourceId;
  let handoffArticle = await exactOutboxHandoff(page, handoffId);
  await expect(handoffArticle).toContainText('handoff v1');

  await enterDeliveryAs(page, setup.actors.reviewer, enterAs, settleActorTransitionEvidence, clickProduct);
  handoffArticle = await exactOutboxHandoff(page, handoffId);
  await expect(handoffArticle.getByRole('button', { name: 'Final handoff approval', exact: true })).toHaveCount(0);
  const reviewReceipt = await decided(
    'delivery.handoff.review.resolve',
    () => handoffArticle.getByRole('button', { name: 'Approve review', exact: true }).click(),
    'Independent Delivery reviewer approved the exact AP invoice exception handoff.',
  );
  requireCanonicalReceiptBinding(reviewReceipt, { resourceId: handoffId, resourceVersion: 2 });
  await expect(handoffArticle).toContainText('handoff v2');
  await expect(handoffArticle.getByRole('button', { name: 'Final handoff approval', exact: true })).toHaveCount(0);

  await enterDeliveryAs(page, setup.actors.approver, enterAs, settleActorTransitionEvidence, clickProduct);
  handoffArticle = await exactOutboxHandoff(page, handoffId);
  const approvalReceipt = await decided(
    'delivery.handoff.approval.resolve',
    () => handoffArticle.getByRole('button', { name: 'Final handoff approval', exact: true }).click(),
    'Independent approver accepted the exact reviewed AP invoice exception handoff.',
  );
  requireCanonicalReceiptBinding(approvalReceipt, { resourceId: handoffId, resourceVersion: 3 });
  await expect(handoffArticle).toContainText('handoff v3');
  await expect(handoffArticle.getByRole('button', { name: 'Start Delivery draft', exact: true })).toHaveCount(0);

  await enterDeliveryAs(page, deliveryOwner, enterAs, settleActorTransitionEvidence, clickProduct);
  handoffArticle = await exactOutboxHandoff(page, handoffId);
  const consumeReceipt = await decided(
    'delivery.handoff.consume',
    () => handoffArticle.getByRole('button', { name: 'Start Delivery draft', exact: true }).click(),
  );
  if (!consumeReceipt.packageVersionId) throw new Error('CANONICAL_CONSUMED_PACKAGE_VERSION_REJECTED');
  const packageId = consumeReceipt.resourceId;
  const packageVersionId = consumeReceipt.packageVersionId;
  const packageVersion = consumeReceipt.resourceVersion;
  requireCanonicalReceiptBinding(consumeReceipt, { resourceVersion: 1, packageVersionId });
  await expect(handoffArticle).toContainText('handoff v4');
  let packageArticle = await selectExactPackage(page, packageId, packageVersion);
  await expect(packageArticle).toContainText('Studio handoff');
  await expect(packageArticle.getByLabel('Exact source citation').first()).toContainText('BRD artifact v2');

  const editedItem = await requireCanonicalExactLocator(
    packageArticle.locator('article[data-testid^="delivery-item-"][data-item-citation="brd.sections.requirements"]'),
    'CANONICAL_REQUIREMENTS_ITEM_REJECTED',
  );
  const editedItemTestId = await editedItem.getAttribute('data-testid');
  if (!editedItemTestId?.startsWith('delivery-item-')) throw new Error('CANONICAL_EDITED_ITEM_ID_REJECTED');
  const editedItemId = editedItemTestId.slice('delivery-item-'.length);
  if (!UUID.test(editedItemId)) throw new Error('CANONICAL_EDITED_ITEM_ID_REJECTED');
  await editedItem.getByRole('button', { name: 'Edit immutable descendant', exact: true }).click();
  const editDialog = page.getByRole('dialog', { name: 'Confirm governed decision', exact: true });
  await editDialog.getByLabel('Item title', { exact: true }).fill(AP_ITEM_TITLE);
  await editDialog.getByRole('textbox', { name: 'Description', exact: true }).fill('Route unmatched or tolerance-breaching invoices to an accountable AP specialist with evidence, reason code, and source-system trace.');
  await editDialog.getByRole('textbox', { name: 'Acceptance criteria · one per line', exact: true }).fill('Exact invoice and exception evidence remain linked\nDuplicate action is prevented\nHuman approval remains required for financial release');
  await editDialog.getByRole('textbox', { name: 'Non-functional requirements · one per line', exact: true }).fill('No autonomous payment execution\nTenant and workspace isolation\nAuditable idempotent commands');
  await editDialog.getByRole('textbox', { name: /^Decision rationale\b/u }).fill('Make the canonical Delivery item specific enough for AP business review.');
  const editReceipt = await committed(
    'delivery.item.review',
    () => editDialog.getByRole('button', { name: 'Confirm', exact: true }).click(),
  );
  requireCanonicalReceiptBinding(editReceipt, { resourceId: editedItemId, workPackageId: packageId });
  await expect(packageArticle.getByText(AP_ITEM_TITLE, { exact: true })).toBeVisible();
  await settleActorTransitionEvidence();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('enterprise-intelligence-workspace')).toBeVisible();
  await page.getByRole('button', { name: 'Work Package', exact: true }).click();
  packageArticle = await selectExactPackage(page, packageId, packageVersion);
  await expect(packageArticle.getByText(AP_ITEM_TITLE, { exact: true })).toBeVisible();

  const pendingItems = packageArticle.locator('[data-item-status="proposed"], [data-item-status="edited"]');
  const pendingItemCount = await pendingItems.count();
  expect(pendingItemCount).toBeGreaterThan(0);
  for (let index = 0; index < pendingItemCount; index += 1) {
    const item = pendingItems.first();
    const itemTestId = await item.getAttribute('data-testid');
    expect(itemTestId).toMatch(/^delivery-item-/u);
    const itemId = itemTestId!.slice('delivery-item-'.length);
    if (!UUID.test(itemId)) throw new Error('CANONICAL_ACCEPTED_ITEM_ID_REJECTED');
    const itemReceipt = await decided(
      'delivery.item.review',
      () => item.getByRole('button', { name: 'Accept proposal', exact: true }).click(),
      'Delivery owner accepted the exact current AP invoice exception proposal.',
    );
    requireCanonicalReceiptBinding(itemReceipt, { resourceId: itemId, workPackageId: packageId });
    await expect(page.getByTestId(itemTestId!)).toHaveAttribute('data-item-status', 'accepted');
  }
  await expect(pendingItems).toHaveCount(0);
  await expect(packageArticle.getByRole('button', { name: 'Approve package review', exact: true })).toHaveCount(0);

  await enterDeliveryAs(page, setup.actors.reviewer, enterAs, settleActorTransitionEvidence, clickProduct);
  packageArticle = await selectExactPackage(page, packageId, packageVersion);
  const packageReviewReceipt = await decided(
    'delivery.package.review.resolve',
    () => packageArticle.getByRole('button', { name: 'Approve package review', exact: true }).click(),
    'Independent package reviewer verified every accepted AP invoice exception item and its exact source citation.',
  );
  requireCanonicalReceiptBinding(packageReviewReceipt, {
    resourceVersion: packageVersion, workPackageId: packageId, packageVersionId,
  });
  await expect(packageArticle.getByRole('button', { name: 'Final package approval', exact: true })).toHaveCount(0);

  await enterDeliveryAs(page, setup.actors.approver, enterAs, settleActorTransitionEvidence, clickProduct);
  packageArticle = await selectExactPackage(page, packageId, packageVersion);
  const packageApprovalReceipt = await decided(
    'delivery.package.approval.resolve',
    () => packageArticle.getByRole('button', { name: 'Final package approval', exact: true }).click(),
    'Independent approver accepted the exact reviewed package version for the AP invoice exception baseline.',
  );
  requireCanonicalReceiptBinding(packageApprovalReceipt, {
    resourceVersion: packageVersion, workPackageId: packageId, packageVersionId,
  });
  await expect(packageArticle.getByText(/Approved identity: \d+ server-counted items\./u)).toBeVisible();
  await settleActorTransitionEvidence();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('enterprise-intelligence-workspace')).toBeVisible();
  await page.getByRole('button', { name: 'Work Package', exact: true }).click();
  packageArticle = await selectExactPackage(page, packageId, packageVersion);
  await expect(packageArticle.getByText(/Approved identity: \d+ server-counted items\./u)).toBeVisible();
  const packageItems = packageArticle.locator(
    'article[data-testid^="delivery-item-"][data-item-title][data-item-status][data-item-citation]',
  );
  const packageItemCount = await packageItems.count();
  expect(packageItemCount).toBe(5);
  await expect(packageItems).toHaveCount(5);
  await expect(packageArticle.locator(
    'article[data-testid^="delivery-item-"][data-item-title][data-item-status="accepted"][data-item-citation]',
  )).toHaveCount(5);
  const history = packageArticle.locator('details').first();
  await history.locator('summary').click();
  const deliverySections: { heading: string; body: string }[] = [{
    heading: 'Package identity, lineage, review, and approval',
    body: [
      await packageArticle.locator(':scope > div').first().innerText(),
      ...(await packageArticle.locator(':scope > p').allTextContents()),
      await history.innerText(),
    ].join('\n'),
  }];
  const deliveryItemEvidence = [];
  for (let index = 0; index < packageItemCount; index += 1) {
    const item = packageItems.nth(index);
    await item.getByRole('button', { name: 'Version diff and history', exact: true }).click();
    const title = await item.locator(':scope > h4').innerText();
    const description = await item.locator(':scope > h4 + p').innerText();
    const acceptanceCriteria = await item.locator('section[aria-label="Acceptance criteria"] li').allTextContents();
    const nonFunctionalRequirements = await item
      .locator('section[aria-label="Non-functional requirements"] li').allTextContents();
    const sourceCitation = await item.getByLabel('Exact source citation', { exact: true }).innerText();
    const decision = await item.locator(':scope > p').filter({ hasText: /^Decision: accepted\b/u }).innerText();
    const itemHistory = await item.getByText('Immutable history', { exact: true }).locator('..').innerText();
    deliveryItemEvidence.push({
      title, description, acceptanceCriteria, nonFunctionalRequirements,
      sourceCitation, decision, history: itemHistory,
    });
    deliverySections.push({
      heading: `Accepted item ${index + 1}: ${title}`,
      body: [
        `Description: ${description}`,
        `Acceptance criteria:\n${acceptanceCriteria.length
          ? acceptanceCriteria.map(value => `- ${value}`).join('\n')
          : 'None in the exact approved baseline.'}`,
        `Non-functional requirements:\n${nonFunctionalRequirements.length
          ? nonFunctionalRequirements.map(value => `- ${value}`).join('\n')
          : 'None in the exact approved baseline.'}`,
        sourceCitation,
        decision,
        itemHistory,
      ].join('\n\n'),
    });
  }
  validateApprovedDeliveryItemEvidence(deliveryItemEvidence);
  const itemsWithoutAcceptanceCriteria = deliveryItemEvidence
    .filter(item => item.acceptanceCriteria.length === 0).map(item => item.title);
  const itemsWithoutNonFunctionalRequirements = deliveryItemEvidence
    .filter(item => item.nonFunctionalRequirements.length === 0).map(item => item.title);
  const deliveryText = approvedBusinessOutputMarkdown({
    title: 'Approved AP Invoice Exception Delivery Package',
    approvalState: `Independent package review and final approval committed for ${packageItemCount} server-counted accepted items; the approved package survived reload before capture.`,
    contentOrigin: 'Providers were OFF. The package is a deterministic synthetic planning projection from the approved BRD; one item was test-authored through the normal UI and every item was accepted by the Delivery owner before independent review and approval. This is not live AI generation or human UAT sign-off.',
    sections: deliverySections,
    remainingGaps: [
      'Business owners must assign real owners, dates, milestones, dependencies, and delivery sequencing before execution.',
      'Tolerance values, regional tax rules, ERP connector priorities, and operational service levels remain open business decisions.',
      ...(itemsWithoutAcceptanceCriteria.length ? [
        `${itemsWithoutAcceptanceCriteria.length} of ${packageItemCount} accepted items have no acceptance criteria in the exact approved baseline: ${itemsWithoutAcceptanceCriteria.join('; ')}.`,
      ] : []),
      ...(itemsWithoutNonFunctionalRequirements.length ? [
        `${itemsWithoutNonFunctionalRequirements.length} of ${packageItemCount} accepted items have no non-functional requirements in the exact approved baseline: ${itemsWithoutNonFunctionalRequirements.join('; ')}.`,
      ] : []),
      'This package contains planning outputs only; it does not authorize payment, automation execution, provider use, or production rollout.',
    ],
  });
  await mkdir(outputDirectory, { recursive: true });
  const deliveryOutput = `${testInfo.project.name}-ap-invoice-exception-delivery-package.md`;
  await writeFile(path.join(outputDirectory, deliveryOutput), deliveryText, 'utf8');
  await testInfo.attach(deliveryOutput, {
    path: path.join(outputDirectory, deliveryOutput), contentType: 'text/markdown',
  });
  const deliveryScreenshot = await screenshot(
    packageArticle, testInfo, outputDirectory, 'ap-invoice-exception-delivery-package.png',
  );

  const baselineEligibility = await requireCanonicalExactLocator(
    page.getByTestId('baseline-eligibility-selectors').locator(`li[data-package-id="${packageId}"]`),
    'CANONICAL_EXACT_BASELINE_ELIGIBILITY_REJECTED',
  );
  const baselineReceipt = await decided(
    'monitor.baseline.create',
    () => baselineEligibility.getByRole('button', { name: 'Create read-only Monitor baseline', exact: true }).click(),
  );
  requireCanonicalReceiptBinding(baselineReceipt, {
    resourceVersion: 1, workPackageId: packageId, packageVersionId,
  });
  const baselineId = baselineReceipt.resourceId;
  await expect(page.getByTestId('baseline-eligibility-selectors')
    .locator(`li[data-package-id="${packageId}"]`)).toHaveCount(0);
  await page.getByRole('button', { name: 'Monitor Baseline', exact: true }).click();
  const monitor = page.getByTestId('canonical-monitor-baselines');
  await expect(monitor).toHaveAttribute('data-monitor-usable', 'true');
  const monitorBaseline = await selectExactBaseline(page, baselineId, packageId, packageVersion);
  await expect(monitorBaseline).toContainText('Canonical accepted set');
  await expect(monitor).toContainText('Read only · telemetry disabled');
  const monitorScreenshot = await screenshot(
    monitorBaseline, testInfo, outputDirectory, 'ap-invoice-exception-monitor-baseline.png', [
      monitorBaseline.getByText('Baseline identity', { exact: true }).locator('..').locator('dd'),
      monitorBaseline.getByText('Exact package', { exact: true }).locator('..').locator('dd'),
    ],
  );

  await settleActorTransitionEvidence();
  await signOutAndIn(page, setup.actors.approver);
  await openDelivery(page, clickProduct);
  await page.getByRole('button', { name: 'Monitor Baseline', exact: true }).click();
  const persistedMonitorBaseline = await selectExactBaseline(page, baselineId, packageId, packageVersion);
  await expect(page.getByTestId('canonical-monitor-baselines')).toContainText('Read only · telemetry disabled');
  await expect(persistedMonitorBaseline).toContainText('Canonical accepted set');

  let databaseEvidence: CanonicalHostedDatabaseEvidence | null = null;
  let databaseEvidenceOutput: string | null = null;
  if (readHostedDatabaseEvidence) {
    const candidate = await readHostedDatabaseEvidence();
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error('CANONICAL_HOSTED_DATABASE_EVIDENCE_REJECTED');
    }
    const record = candidate as Record<string, unknown>;
    const expectedKeys = ['baselineCount', ...HOSTED_DATABASE_BOOLEAN_KEYS].sort();
    if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(expectedKeys)
      || record.baselineCount !== 1
      || HOSTED_DATABASE_BOOLEAN_KEYS.some(key => record[key] !== true)) {
      throw new Error('CANONICAL_HOSTED_DATABASE_EVIDENCE_REJECTED');
    }
    databaseEvidence = Object.freeze(record) as CanonicalHostedDatabaseEvidence;
    databaseEvidenceOutput = `${testInfo.project.name}-ap-invoice-exception-database-evidence.json`;
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, databaseEvidenceOutput),
      `${JSON.stringify(databaseEvidence, null, 2)}\n`, 'utf8');
    await testInfo.attach(databaseEvidenceOutput, {
      path: path.join(outputDirectory, databaseEvidenceOutput), contentType: 'application/json',
    });
  }

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
      completeApprovedBusinessOutputs: true,
      syntheticContentLabeled: true,
      providersOff: true,
      actorBoundary15000ms: true,
    }),
    proofBoundary: Object.freeze({ ...proofBoundary }),
    databaseEvidence,
    commands: Object.freeze([...commands]),
    outputs: Object.freeze([
      ...upstreamOutputs, deliveryOutput, deliveryScreenshot, monitorScreenshot,
      ...(databaseEvidenceOutput ? [databaseEvidenceOutput] : []),
    ]),
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
