import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export const STUDIO_DELIVERY_MONITOR_CASE_ASSERTIONS = Object.freeze({
  'DELIVERY-001': ['persisted-docs-import-committed', 'exact-source-lineage-visible'],
  'DELIVERY-002': ['server-task-created', 'committed-task-visible-after-reload'],
  'DELIVERY-003': ['assigned-actor-update-committed', 'protected-fields-unchanged'],
  'DELIVERY-004': ['unauthorized-delete-denied', 'retained-task-unchanged'],
  'DELIVERY-005': ['valid-status-transition-committed', 'transition-visible-after-reload'],
  'DELIVERY-006': ['invalid-status-transition-denied', 'status-unchanged-after-reload'],
  'DELIVERY-009': ['pack-from-authoritative-tasks', 'exact-tenant-source-ancestry'],
  'MONITOR-001': ['exact-ancestry-visible', 'foreign-ancestry-undisclosed'],
  'MONITOR-002': ['recorded-label-detail-status-exact', 'no-inferred-or-fallback-outcome'],
  'MONITOR-003': ['exact-recorded-blocker-visible', 'foreign-blocker-undisclosed'],
  'MONITOR-004': ['projection-unavailable-visible', 'no-legacy-success-substitution'],
  'E2E-001': ['production-lifecycle-commands-completed', 'approved-studio-to-legacy-docs-published', 'delivery-to-monitor-exact-lineage'],
  'E2E-007': ['production-hitl-decision', 'required-human-approval-preserved-downstream'],
} as const);

type DownstreamCaseId = keyof typeof STUDIO_DELIVERY_MONITOR_CASE_ASSERTIONS;
type DownstreamAssertionId = (typeof STUDIO_DELIVERY_MONITOR_CASE_ASSERTIONS)[DownstreamCaseId][number];

export type EnterpriseLifecycleActor = Readonly<{
  token: string;
  user: Readonly<{ id: string; email: string }>;
}>;

export type EnterpriseLifecycleDownstreamSetup = Readonly<{
  journeyBinding: string;
  deliveryProject: Readonly<{ id: string; name: string }>;
  actors: Readonly<Record<'author' | 'reviewer' | 'approver' | 'outsider', EnterpriseLifecycleActor>>;
}>;

export type StudioDeliveryDownstreamTask = Readonly<{
  id: string;
  version: number;
  title: string;
  description: string;
  status: string;
  assigneeIds: readonly string[];
  projectId: string;
  documentGenerationId: string | null;
  importId: string | null;
  sourceProcessId: string | null;
  sourceAssessmentId: string | null;
  sourceItemIndex: number | null;
  retentionState: string;
}>;

export type StudioDeliveryDownstreamFrame = Readonly<{
  projectName: string;
  counts: Readonly<{
    publications: number;
    documentGenerations: number;
    imports: number;
    activeTasks: number;
    retainedTasks: number;
    outcomeAggregates: number;
    outcomeVersions: number;
    commandReceipts: number;
    audits: number;
    packSnapshots: number;
  }>;
  publication: Readonly<{
    publicationId: string;
    documentGenerationId: string;
    projectId: string;
    artifactId: string;
    artifactVersionId: string;
    sourceProcessId: string;
    sourceAssessmentId: string;
    workItemDigest: string;
    workItemCount: number;
  }> | null;
  tasks: readonly StudioDeliveryDownstreamTask[];
  outcomes: readonly Readonly<{
    outcomeId: string;
    version: number;
    taskId: string;
    taskVersion: number;
    status: string;
    label: string;
    detail: string;
    documentGenerationId: string;
    importId: string;
    artifactVersionId: string;
  }>[];
  latestPack: Readonly<{
    id: string;
    version: number;
    projectId: string;
    taskCount: number;
    boundTaskCount: number;
    taskSetHash: string;
    receiptId: string;
    auditEventId: string;
  }> | null;
  foreignProbe: Readonly<{
    status: number;
    disclosedIdentifiers: boolean;
    disclosedBlocker: boolean;
  }> | null;
  lineage: Readonly<{ chainCount: number; completeCount: number; complete: boolean; digest: string }>;
  protections: Readonly<{ publicationImmutable: boolean; outcomeVersionImmutable: boolean; importLineageProtected: boolean }>;
  writeFingerprint: string;
}>;

export type StudioDeliveryMonitorObservation = Readonly<{
  caseId: DownstreamCaseId;
  assertionId: DownstreamAssertionId;
  observed: true;
}>;

export type StudioDeliveryMonitorJourneyResult = Readonly<{
  observations: readonly StudioDeliveryMonitorObservation[];
  cases: readonly StudioDeliveryMonitorCaseResult[];
  accessibility: readonly StudioDeliveryAccessibilityResult[];
  finalFrame: StudioDeliveryDownstreamFrame;
}>;

export type StudioDeliveryAccessibilityResult = Readonly<{
  surface: string;
  viewport: Readonly<{ width: number; height: number }>;
  violations: readonly Readonly<{ id: string; impact: string; nodeCount: number }>[];
}>;

export type StudioDeliveryMonitorCaseResult = Readonly<{
  testId: DownstreamCaseId;
  assertions: readonly Readonly<{ id: DownstreamAssertionId; status: 'passed' }>[];
  observations: Readonly<{
    browser: Readonly<{ actions: readonly string[]; result: string }>;
    api: Readonly<{ productionRoutes: readonly string[]; responses: readonly string[] }>;
  }>;
  measurements: Readonly<{
    setupExcluded: true;
    before: StudioDeliveryDownstreamFrame;
    after: StudioDeliveryDownstreamFrame;
    delta: Readonly<Record<string, number>>;
    stateBeforeHash: string;
    stateAfterHash: string;
    targetBeforeHash?: string;
    targetAfterHash?: string;
  }>;
}>;

type Control = <T>(pathname: string, body?: unknown) => Promise<T>;
type EnterAs = (page: Page, actor: EnterpriseLifecycleActor) => Promise<void>;
type ClickProduct = (page: Page, label: string) => Promise<void>;
type SelectProjectScope = (page: Page, projectName: string) => Promise<void>;

export type StudioDeliveryMonitorJourneyInput = Readonly<{
  page: Page;
  projectName: string;
  project: string;
  setup: EnterpriseLifecycleDownstreamSetup;
  control: Control;
  enterAs: EnterAs;
  clickProduct: ClickProduct;
  selectProjectScope: SelectProjectScope;
}>;

type ScenarioDecision = Readonly<{
  decisionId: string;
  decisionVersion: string;
  ruleSetVersion: string;
  validationStatus: string;
  outputHash: string;
  confidence: string;
  processReadiness: string;
  interactionDecisions: readonly Readonly<{ interactionId: string; approvalBoundActions: readonly string[]; prohibitedActions: readonly string[] }>[];
  sourceInteractions: readonly Readonly<{ interactionId: string; mode: string; highImpact: boolean; financialAction: boolean }>[];
  targetHash: string;
}>;

const itemTitles = Object.freeze({
  epic: 'Governed downstream acceptance',
  assignment: 'Assign the accountable acceptance owner',
  blocker: 'Resolve the controlled downstream dependency',
  created: 'Browser-created authoritative task',
});
const approvedPrimaryTitle = 'Synthetic governed lifecycle BRD';
const outcome = Object.freeze({
  status: 'not_achieved',
  label: 'Blocked by controlled downstream dependency',
  detail: 'Blocker: the controlled downstream dependency remains unresolved. This is an explicit human record.',
});

const expectDigest = (value: string) => expect(value).toMatch(/^sha256:[a-f0-9]{64}$/u);
const expectUuid = (value: string) => expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
type ObservedProductionResponse = Readonly<{ route: string; status: number }>;
const waitForLegacyDeliveryCommand = (page: Page, action: string) => page.waitForResponse(response => {
  if (new URL(response.url()).pathname !== '/functions/v1/legacy-delivery-command'
    || response.request().method() !== 'POST') return false;
  try {
    return (response.request().postDataJSON() as { action?: unknown }).action === action;
  } catch { return false; }
});
const measuredResponses = (
  log: readonly ObservedProductionResponse[], start: number, routes: readonly string[],
  additional: readonly ObservedProductionResponse[] = [],
) => {
  const observed = [...log.slice(start), ...additional].filter(item => routes.includes(item.route));
  for (const route of routes) {
    expect(observed.some(item => item.route === route), `No actual response was observed for ${route}`).toBe(true);
  }
  return observed.map(item => `${item.status} ${item.route}`);
};
const protectedTaskBinding = (task: StudioDeliveryDownstreamTask) => ({
  id: task.id,
  projectId: task.projectId,
  documentGenerationId: task.documentGenerationId,
  importId: task.importId,
  sourceProcessId: task.sourceProcessId,
  sourceAssessmentId: task.sourceAssessmentId,
  sourceItemIndex: task.sourceItemIndex,
  retentionState: task.retentionState,
});

const openTask = async (page: Page, title: string) => {
  await page.getByText(title, { exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
};

const closeTask = async (page: Page, title: string) => {
  await page.getByRole('button', { name: `Close ${title}`, exact: true }).click();
  await expect(page.getByRole('dialog', { name: title, exact: true })).toBeHidden();
};

const openProjectProduct = async (
  page: Page,
  project: Readonly<{ id: string; name: string }>,
  selectProjectScope: SelectProjectScope,
  clickProduct: ClickProduct,
  label: string,
) => {
  await selectProjectScope(page, project.name);
  await clickProduct(page, label);
};

const enterProjectBacklog = async (
  page: Page,
  project: Readonly<{ id: string; name: string }>,
  selectProjectScope: SelectProjectScope,
  clickProduct: ClickProduct,
) => {
  await openProjectProduct(page, project, selectProjectScope, clickProduct, 'Delivery');
  await clickProduct(page, 'Backlog');
  await expect(page.getByText('Server context active', { exact: true })).toBeVisible();
};

const getFrame = (control: Control, projectName: string) => control<StudioDeliveryDownstreamFrame>(
  '/control/downstream-frame', { projectName },
);

const observeEvery = (observations: StudioDeliveryMonitorObservation[], caseId: DownstreamCaseId) => {
  for (const assertionId of STUDIO_DELIVERY_MONITOR_CASE_ASSERTIONS[caseId]) {
    observations.push({ caseId, assertionId, observed: true });
  }
};

const countDelta = (before: StudioDeliveryDownstreamFrame, after: StudioDeliveryDownstreamFrame) => Object.fromEntries(
  Object.entries(after.counts).map(([key, value]) => [key, value - before.counts[key as keyof typeof before.counts]]),
);

const recordCase = (
  cases: StudioDeliveryMonitorCaseResult[], testId: DownstreamCaseId,
  before: StudioDeliveryDownstreamFrame, after: StudioDeliveryDownstreamFrame,
  actions: readonly string[], result: string, productionRoutes: readonly string[], responses: readonly string[],
  targetBeforeHash?: string, targetAfterHash?: string,
) => {
  expectDigest(before.writeFingerprint); expectDigest(after.writeFingerprint);
  if (targetBeforeHash) expectDigest(targetBeforeHash);
  if (targetAfterHash) expectDigest(targetAfterHash);
  cases.push({ testId,
    assertions: STUDIO_DELIVERY_MONITOR_CASE_ASSERTIONS[testId].map(id => ({ id, status: 'passed' as const })),
    observations: { browser: { actions, result }, api: { productionRoutes, responses } },
    measurements: { setupExcluded: true, before, after, delta: countDelta(before, after), stateBeforeHash: before.writeFingerprint,
      stateAfterHash: after.writeFingerprint, ...(targetBeforeHash ? { targetBeforeHash } : {}), ...(targetAfterHash ? { targetAfterHash } : {}) },
  });
};

const scanAffectedSurface = async (page: Page, surface: string, selector: string): Promise<StudioDeliveryAccessibilityResult> => {
  const target = page.locator(selector);
  await expect(target).toBeVisible();
  const viewport = page.viewportSize();
  expect(viewport, `${surface} must run with an explicit Playwright viewport`).not.toBeNull();
  const box = await target.boundingBox();
  expect(box, `${surface} must have a measurable visible box`).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  const raw = await new AxeBuilder({ page }).include(selector).analyze();
  const violations = raw.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')
    .map(item => ({ id: item.id, impact: item.impact ?? 'unknown', nodeCount: item.nodes.length }));
  expect(violations, `${surface} serious/critical accessibility violations: ${JSON.stringify(violations)}`).toEqual([]);
  return { surface, viewport: viewport!, violations };
};

export const runStudioDeliveryMonitorJourney = async ({
  page, projectName, project, setup, control, enterAs, clickProduct, selectProjectScope,
}: StudioDeliveryMonitorJourneyInput): Promise<StudioDeliveryMonitorJourneyResult> => {
  expect(project).toMatch(/^(chromium-desktop|chromium-mobile)$/u);
  const observations: StudioDeliveryMonitorObservation[] = [];
  const cases: StudioDeliveryMonitorCaseResult[] = [];
  const accessibility: StudioDeliveryAccessibilityResult[] = [];
  const dialogs: string[] = [];
  const productionResponses: ObservedProductionResponse[] = [];
  page.on('response', response => {
    const route = new URL(response.url()).pathname;
    if (route.startsWith('/functions/v1/')) productionResponses.push({ route, status: response.status() });
  });
  page.on('dialog', async dialog => {
    dialogs.push(dialog.message());
    await dialog.accept();
  });

  const binding = await control<Readonly<{
    bound: true;
    project: Readonly<{ id: string }>;
    source: Readonly<{ processId: string; assessmentId: string }>;
  }>>(
    '/control/bind-delivery-project-source', { projectName },
  );
  expect(binding.bound).toBe(true);
  expect(binding.project.id).toBe(setup.deliveryProject.id);
  expectUuid(binding.source.processId);
  expectUuid(binding.source.assessmentId);
  const hitlDecisionBefore = await control<ScenarioDecision>('/control/scenario-decision', { projectName });
  expectUuid(hitlDecisionBefore.decisionId);
  expect(hitlDecisionBefore.outputHash).toMatch(/^[a-f0-9]{64}$/u);
  expectDigest(hitlDecisionBefore.targetHash);
  expect(hitlDecisionBefore.validationStatus).toBe('reviewer-ready');
  expect(hitlDecisionBefore.sourceInteractions.some(item => item.mode === 'write' && item.highImpact && item.financialAction)).toBe(true);
  expect(hitlDecisionBefore.interactionDecisions.some(item => item.approvalBoundActions.length > 0 && item.prohibitedActions.length > 0)).toBe(true);

  await enterAs(page, setup.actors.approver);
  await openProjectProduct(page, setup.deliveryProject, selectProjectScope, clickProduct, 'Studio');
  const publisher = page.getByTestId('studio-approved-artifact-publish');
  await expect(publisher).toBeVisible();
  accessibility.push(await scanAffectedSurface(page, 'approved Studio artifact publication', '[data-testid="studio-approved-artifact-publish"]'));
  const workItems = publisher.getByTestId('studio-approved-work-items').getByRole('group');
  await expect(workItems).toHaveCount(1);
  await workItems.nth(0).getByRole('combobox', { name: 'Type', exact: true }).selectOption('Epic');
  await workItems.nth(0).getByLabel('Title', { exact: true }).fill(itemTitles.epic);
  await workItems.nth(0).getByLabel('Description', { exact: true }).fill('A human-approved container for the bounded downstream acceptance work.');
  await workItems.nth(0).getByLabel('Acceptance criteria · one per line', { exact: true }).fill('Exact approved Studio ancestry is retained.');
  await publisher.getByRole('button', { name: 'Add human-authored work item', exact: true }).click();
  await publisher.getByRole('button', { name: 'Add human-authored work item', exact: true }).click();
  await expect(workItems).toHaveCount(3);
  for (const [index, title, detail] of [
    [1, itemTitles.assignment, 'Assign one accountable human owner without changing protected source ancestry.'],
    [2, itemTitles.blocker, 'Resolve the bounded downstream dependency and record its human outcome.'],
  ] as const) {
    await workItems.nth(index).getByRole('combobox', { name: 'Type', exact: true }).selectOption('Task');
    await workItems.nth(index).getByLabel('Title', { exact: true }).fill(title);
    await workItems.nth(index).getByLabel('Description', { exact: true }).fill(detail);
    await workItems.nth(index).getByLabel('Acceptance criteria · one per line', { exact: true }).fill('The committed result remains visible after reload.');
  }
  const beforePublish = await getFrame(control, projectName);
  const publishResponseStart = productionResponses.length;
  await publisher.getByTestId('publish-approved-studio-artifact').click();
  await expect(publisher.getByRole('status')).toContainText('Published 3 approved work items');
  const afterPublish = await getFrame(control, projectName);
  expect(afterPublish.counts.publications).toBe(beforePublish.counts.publications + 1);
  expect(afterPublish.counts.documentGenerations).toBe(beforePublish.counts.documentGenerations + 1);
  expect(afterPublish.counts.commandReceipts).toBe(beforePublish.counts.commandReceipts + 1);
  expect(afterPublish.counts.audits).toBe(beforePublish.counts.audits + 1);
  expect(afterPublish.publication).not.toBeNull();
  expect(afterPublish.publication).toMatchObject({
    projectId: setup.deliveryProject.id,
    sourceProcessId: binding.source.processId,
    sourceAssessmentId: binding.source.assessmentId,
    workItemCount: 3,
  });
  expectUuid(afterPublish.publication!.documentGenerationId);
  expectUuid(afterPublish.publication!.artifactId);
  expectUuid(afterPublish.publication!.artifactVersionId);
  expectDigest(afterPublish.publication!.workItemDigest);
  const hitlDecisionAfter = await control<ScenarioDecision>('/control/scenario-decision', { projectName });
  expect(hitlDecisionAfter).toEqual(hitlDecisionBefore);
  recordCase(cases, 'E2E-007', beforePublish, afterPublish,
    ['Read the exact finalized high-impact financial decision', 'Published its independently approved Studio version through the production control'],
    'The persisted HITL decision retained approval-bound and prohibited actions while one downstream publication committed.',
    ['/functions/v1/studio-delivery-authority-command'], measuredResponses(productionResponses, publishResponseStart, ['/functions/v1/studio-delivery-authority-command']),
    hitlDecisionBefore.targetHash, hitlDecisionAfter.targetHash);
  observeEvery(observations, 'E2E-007');
  const importResponseStart = productionResponses.length;
  await clickProduct(page, 'Document Vault');
  await expect(page.getByRole('heading', { name: 'Document Repository', exact: true })).toBeVisible();
  const generatedTitle = page.getByRole('heading', { name: approvedPrimaryTitle, exact: true });
  const generatedCard = page.locator('.card').filter({ has: generatedTitle });
  await expect(generatedCard).toHaveCount(1);
  await expect(generatedCard.getByRole('heading', { name: approvedPrimaryTitle, exact: true })).toBeVisible();
  await generatedCard.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('button', { name: 'Work Items', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Work Items', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Import to Backlog', exact: true }).click();
  const importDialog = page.getByRole('dialog', { name: 'Import Work Items to Backlog', exact: true });
  await expect(importDialog.getByText('3 / 3 selected', { exact: true })).toBeVisible();
  const beforeImport = await getFrame(control, projectName);
  await importDialog.getByRole('button', { name: 'Import 3 Items', exact: true }).click();
  await expect(importDialog).toBeHidden();
  await expect(page.getByText(itemTitles.assignment, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(itemTitles.blocker, { exact: true }).first()).toBeVisible();
  const afterImport = await getFrame(control, projectName);
  expect(afterImport.counts.imports).toBe(beforeImport.counts.imports + 1);
  expect(afterImport.counts.activeTasks).toBe(beforeImport.counts.activeTasks + 2);
  const importedTask = afterImport.tasks.find(task => task.title === itemTitles.blocker);
  expect(importedTask).toBeDefined();
  expect(importedTask).toMatchObject({
    projectId: setup.deliveryProject.id,
    documentGenerationId: afterPublish.publication!.documentGenerationId,
    sourceProcessId: binding.source.processId,
    sourceAssessmentId: binding.source.assessmentId,
    status: 'To Do',
    retentionState: 'active',
  });
  expectUuid(importedTask!.importId!);
  recordCase(cases, 'DELIVERY-001', beforeImport, afterImport,
    ['Opened the published Docs generation', 'Selected its three structured work items', 'Imported the bounded selection to Delivery'],
    'The server committed one import and two non-Epic authoritative tasks with exact source lineage.',
    ['/functions/v1/legacy-delivery-query', '/functions/v1/legacy-delivery-command'], measuredResponses(productionResponses, importResponseStart,
      ['/functions/v1/legacy-delivery-query', '/functions/v1/legacy-delivery-command']),
    beforeImport.lineage.digest, afterImport.lineage.digest);
  observeEvery(observations, 'DELIVERY-001');

  await page.getByRole('button', { name: 'Add a task', exact: true }).first().click();
  await page.getByPlaceholder('Enter a title for this task...').fill(itemTitles.created);
  const beforeCreate = await getFrame(control, projectName);
  const createResponseStart = productionResponses.length;
  const [createResponse] = await Promise.all([
    waitForLegacyDeliveryCommand(page, 'task.create'),
    page.getByRole('button', { name: 'Add', exact: true }).click(),
  ]);
  expect(createResponse.status()).toBe(200);
  await expect(page.getByPlaceholder('Enter a title for this task...')).toBeHidden();
  await expect(page.getByText(itemTitles.created, { exact: true })).toBeVisible();
  const afterCreate = await getFrame(control, projectName);
  expect(afterCreate.counts.activeTasks).toBe(beforeCreate.counts.activeTasks + 1);
  const createdTask = afterCreate.tasks.find(task => task.title === itemTitles.created);
  expect(createdTask).toBeDefined();
  expect(createdTask).toMatchObject({ projectId: setup.deliveryProject.id, documentGenerationId: null, importId: null });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(itemTitles.created, { exact: true })).toBeVisible();
  recordCase(cases, 'DELIVERY-002', beforeCreate, afterCreate,
    ['Opened the production task composer', 'Created a bounded project task', 'Reloaded the Delivery backlog'],
    'The authoritative task was committed and remained visible after reload.',
    ['/functions/v1/legacy-delivery-command', '/functions/v1/legacy-delivery-query'], measuredResponses(productionResponses, createResponseStart,
      ['/functions/v1/legacy-delivery-command', '/functions/v1/legacy-delivery-query']));
  observeEvery(observations, 'DELIVERY-002');

  let taskDialog = await openTask(page, itemTitles.blocker);
  await taskDialog.getByRole('button', { name: 'Edit', exact: true }).click();
  await taskDialog.getByLabel('Reviewer', { exact: true }).check();
  const beforeAssignment = (await getFrame(control, projectName)).tasks.find(task => task.id === importedTask!.id)!;
  await taskDialog.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(taskDialog.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  const afterAssignment = (await getFrame(control, projectName)).tasks.find(task => task.id === importedTask!.id)!;
  expect(afterAssignment.version).toBe(beforeAssignment.version + 1);
  expect(afterAssignment.assigneeIds).toContain(setup.actors.reviewer.user.id);
  expect(protectedTaskBinding(afterAssignment)).toEqual(protectedTaskBinding(beforeAssignment));
  await closeTask(page, itemTitles.blocker);

  const restrictedAuthority = await control<Readonly<{
    enabled: true;
    actor: 'reviewer';
    authorizationVersion: number;
    organizationId: string;
    workspaceId: string;
  }>>('/control/restricted-delete', { projectName, enabled: true });
  expect(restrictedAuthority).toMatchObject({ enabled: true, actor: 'reviewer' });
  expect(restrictedAuthority.authorizationVersion).toBeGreaterThan(0);
  expectUuid(restrictedAuthority.organizationId);
  expectUuid(restrictedAuthority.workspaceId);
  try {
    await enterAs(page, setup.actors.reviewer);
    await enterProjectBacklog(page, setup.deliveryProject, selectProjectScope, clickProduct);
    taskDialog = await openTask(page, itemTitles.blocker);
    await taskDialog.getByRole('button', { name: 'Edit', exact: true }).click();
    const ownDescription = 'Reviewer-owned update: the assigned actor confirmed the bounded dependency detail.';
    await taskDialog.getByLabel('Description', { exact: true }).fill(ownDescription);
    const beforeOwnUpdateFrame = await getFrame(control, projectName);
    const beforeOwnUpdate = beforeOwnUpdateFrame.tasks.find(task => task.id === importedTask!.id)!;
    const ownUpdateResponseStart = productionResponses.length;
    await taskDialog.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await expect(taskDialog.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    const afterOwnUpdateFrame = await getFrame(control, projectName);
    const afterOwnUpdate = afterOwnUpdateFrame.tasks.find(task => task.id === importedTask!.id)!;
    expect(afterOwnUpdate.version).toBe(beforeOwnUpdate.version + 1);
    expect(afterOwnUpdate.description).toBe(ownDescription);
    expect(afterOwnUpdate.assigneeIds).toContain(setup.actors.reviewer.user.id);
    expect(protectedTaskBinding(afterOwnUpdate)).toEqual(protectedTaskBinding(beforeOwnUpdate));
    recordCase(cases, 'DELIVERY-003', beforeOwnUpdateFrame, afterOwnUpdateFrame,
      ['Entered as the assigned restricted reviewer', 'Changed only the task description', 'Saved through the production task editor'],
      'The assigned actor committed exactly one own-task update while protected source binding stayed unchanged.',
      ['/functions/v1/legacy-delivery-command'], measuredResponses(productionResponses, ownUpdateResponseStart,
        ['/functions/v1/legacy-delivery-command']));
    observeEvery(observations, 'DELIVERY-003');

    const beforeDeniedDelete = await getFrame(control, projectName);
    const dialogCount = dialogs.length;
    const deniedDeleteResponseStart = productionResponses.length;
    await taskDialog.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(taskDialog).toBeVisible();
    expect(dialogs.some(message => message.includes('Remove this task from active delivery views?'))).toBe(true);
    expect(dialogs.slice(dialogCount).some(message => !message.includes('Remove this task from active delivery views?'))).toBe(true);
    const requestId = crypto.randomUUID();
    const deniedDeleteResponse = await page.request.post('/functions/v1/legacy-delivery-command', {
      headers: {
        authorization: `Bearer ${setup.actors.reviewer.token}`,
        'content-type': 'application/json',
      },
      data: {
        schemaVersion: 'legacy-delivery-command.v1', action: 'task.delete',
        organizationId: restrictedAuthority.organizationId, workspaceId: restrictedAuthority.workspaceId,
        expectedAuthorizationVersion: restrictedAuthority.authorizationVersion,
        requestId, idempotencyKey: `authenticated.delivery.delete.denied.${requestId}`,
        payload: {
          taskId: beforeOwnUpdate.id, expectedVersion: afterOwnUpdate.version,
          deletionReason: 'Verify that the assigned restricted actor cannot remove governed Delivery work.',
        },
      },
    });
    expect([403, 404]).toContain(deniedDeleteResponse.status());
    const deniedDeleteBody = await deniedDeleteResponse.text();
    expect(deniedDeleteBody).not.toContain(beforeOwnUpdate.id);
    expect(deniedDeleteBody).not.toContain(setup.deliveryProject.id);
    const afterDeniedDelete = await getFrame(control, projectName);
    expect(afterDeniedDelete.writeFingerprint).toBe(beforeDeniedDelete.writeFingerprint);
    expect(afterDeniedDelete.counts.activeTasks).toBe(beforeDeniedDelete.counts.activeTasks);
    expect(afterDeniedDelete.counts.retainedTasks).toBe(beforeDeniedDelete.counts.retainedTasks);
    expect(afterDeniedDelete.tasks.find(task => task.id === importedTask!.id)?.retentionState).toBe('active');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(itemTitles.blocker, { exact: true }).first()).toBeVisible();
    recordCase(cases, 'DELIVERY-004', beforeDeniedDelete, afterDeniedDelete,
      ['Attempted removal through the guarded UI as the restricted assigned reviewer',
        'Sent an authenticated delete request to the production boundary', 'Reloaded the production backlog'],
      'The UI and server boundary denied deletion without writes, and the same active task remained visible.',
      ['/functions/v1/legacy-delivery-command', '/functions/v1/legacy-delivery-query'], measuredResponses(productionResponses, deniedDeleteResponseStart,
        ['/functions/v1/legacy-delivery-command', '/functions/v1/legacy-delivery-query'],
        [{ route: '/functions/v1/legacy-delivery-command', status: deniedDeleteResponse.status() }]));
    observeEvery(observations, 'DELIVERY-004');
  } finally {
    await control('/control/restricted-delete', { projectName, enabled: false });
  }

  await enterAs(page, setup.actors.approver);
  await enterProjectBacklog(page, setup.deliveryProject, selectProjectScope, clickProduct);
  taskDialog = await openTask(page, itemTitles.blocker);
  await taskDialog.getByRole('button', { name: 'Edit', exact: true }).click();
  await taskDialog.getByLabel('Status', { exact: true }).selectOption('In Progress');
  const beforeValidTransitionFrame = await getFrame(control, projectName);
  const beforeValidTransition = beforeValidTransitionFrame.tasks.find(task => task.id === importedTask!.id)!;
  const validTransitionResponseStart = productionResponses.length;
  const [validTransitionResponse] = await Promise.all([
    waitForLegacyDeliveryCommand(page, 'task.update'),
    taskDialog.getByRole('button', { name: 'Save Changes', exact: true }).click(),
  ]);
  expect(validTransitionResponse.status()).toBe(200);
  await expect(taskDialog.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(taskDialog.getByText('In Progress', { exact: true }).first()).toBeVisible();
  const afterValidTransitionFrame = await getFrame(control, projectName);
  const afterValidTransition = afterValidTransitionFrame.tasks.find(task => task.id === importedTask!.id)!;
  expect(afterValidTransition.version).toBe(beforeValidTransition.version + 1);
  expect(afterValidTransition.status).toBe('In Progress');
  await closeTask(page, itemTitles.blocker);
  await page.reload({ waitUntil: 'domcontentloaded' });
  taskDialog = await openTask(page, itemTitles.blocker);
  await expect(taskDialog.getByText('In Progress', { exact: true }).first()).toBeVisible();
  recordCase(cases, 'DELIVERY-005', beforeValidTransitionFrame, afterValidTransitionFrame,
    ['Selected the valid To Do to In Progress transition', 'Saved and reloaded the task'],
    'The authoritative task advanced one version and retained the valid status after reload.',
    ['/functions/v1/legacy-delivery-command', '/functions/v1/legacy-delivery-query'], measuredResponses(productionResponses, validTransitionResponseStart,
      ['/functions/v1/legacy-delivery-command', '/functions/v1/legacy-delivery-query']));
  observeEvery(observations, 'DELIVERY-005');

  await taskDialog.getByRole('button', { name: 'Edit', exact: true }).click();
  await taskDialog.getByLabel('Status', { exact: true }).selectOption('Done');
  const beforeInvalidTransitionFrame = await getFrame(control, projectName);
  const beforeInvalidTransition = beforeInvalidTransitionFrame.tasks.find(task => task.id === importedTask!.id)!;
  const invalidTransitionResponseStart = productionResponses.length;
  await taskDialog.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(taskDialog.getByRole('alert')).toContainText('could not be confirmed');
  const afterInvalidTransitionFrame = await getFrame(control, projectName);
  const afterInvalidTransition = afterInvalidTransitionFrame.tasks.find(task => task.id === importedTask!.id)!;
  expect(afterInvalidTransition).toEqual(beforeInvalidTransition);
  await page.reload({ waitUntil: 'domcontentloaded' });
  taskDialog = await openTask(page, itemTitles.blocker);
  await expect(taskDialog.getByText('In Progress', { exact: true }).first()).toBeVisible();
  recordCase(cases, 'DELIVERY-006', beforeInvalidTransitionFrame, afterInvalidTransitionFrame,
    ['Attempted the disallowed In Progress to Done transition', 'Reloaded the task'],
    'The transition was denied with zero state change and In Progress remained authoritative.',
    ['/functions/v1/legacy-delivery-command', '/functions/v1/legacy-delivery-query'], measuredResponses(productionResponses, invalidTransitionResponseStart,
      ['/functions/v1/legacy-delivery-command', '/functions/v1/legacy-delivery-query']));
  observeEvery(observations, 'DELIVERY-006');

  await closeTask(page, itemTitles.blocker);
  const beforeEmptyMonitor = await getFrame(control, projectName);
  expect(beforeEmptyMonitor.outcomes).toHaveLength(0);
  await clickProduct(page, 'Monitor');
  let monitor = page.getByTestId('authoritative-delivery-outcomes');
  await expect(monitor).toBeVisible();
  await expect(monitor.getByText('No human outcome is recorded for an authoritative imported task in this project.', { exact: true })).toBeVisible();
  expect((await getFrame(control, projectName)).writeFingerprint).toBe(beforeEmptyMonitor.writeFingerprint);

  await enterProjectBacklog(page, setup.deliveryProject, selectProjectScope, clickProduct);
  taskDialog = await openTask(page, itemTitles.blocker);
  const outcomeEditor = taskDialog.getByTestId('delivery-outcome-editor');
  await expect(outcomeEditor).toBeVisible();
  accessibility.push(await scanAffectedSurface(page, 'human Delivery outcome editor', '[data-testid="delivery-outcome-editor"]'));
  await outcomeEditor.getByRole('combobox', { name: 'Outcome status', exact: true }).selectOption(outcome.status);
  await outcomeEditor.getByLabel('Outcome label', { exact: true }).fill(outcome.label);
  await outcomeEditor.getByLabel('Recorded outcome detail', { exact: true }).fill(outcome.detail);
  const beforeOutcome = await getFrame(control, projectName);
  await outcomeEditor.getByTestId('record-delivery-outcome').click();
  await expect(outcomeEditor.getByRole('status')).toContainText('Recorded outcome version 1');
  const afterOutcome = await getFrame(control, projectName);
  expect(afterOutcome.counts.outcomeAggregates).toBe(beforeOutcome.counts.outcomeAggregates + 1);
  expect(afterOutcome.counts.outcomeVersions).toBe(beforeOutcome.counts.outcomeVersions + 1);
  const recorded = afterOutcome.outcomes.find(item => item.taskId === importedTask!.id);
  expect(recorded).toMatchObject({
    version: 1,
    status: outcome.status,
    label: outcome.label,
    detail: outcome.detail,
    documentGenerationId: afterPublish.publication!.documentGenerationId,
    importId: importedTask!.importId,
    artifactVersionId: afterPublish.publication!.artifactVersionId,
  });
  expect(afterOutcome.lineage).toMatchObject({ chainCount: 2, completeCount: 2, complete: true });
  expectDigest(afterOutcome.lineage.digest);
  expect(afterOutcome.protections).toEqual({
    publicationImmutable: true,
    outcomeVersionImmutable: true,
    importLineageProtected: true,
  });
  await closeTask(page, itemTitles.blocker);

  await clickProduct(page, 'Delivery Pack');
  await expect(page.getByRole('heading', { name: `${setup.deliveryProject.name} Governed Delivery Pack`, exact: true })).toBeVisible();
  const packLineage = page.getByLabel('Delivery pack work items', { exact: true });
  await expect(packLineage.getByText(itemTitles.blocker, { exact: true })).toBeVisible();
  await expect(packLineage.getByText('Linked', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(afterPublish.publication!.documentGenerationId, { exact: false })).toBeVisible();
  const beforePackSnapshot = await getFrame(control, projectName);
  const packResponseStart = productionResponses.length;
  const packSnapshotAction = page.getByTestId('delivery-pack-snapshot-action');
  await expect(packSnapshotAction).toBeVisible();
  accessibility.push(await scanAffectedSurface(page, 'saved Delivery Pack state', '[data-testid="delivery-pack-snapshot-action"]'));
  await packSnapshotAction.getByTestId('save-delivery-pack-snapshot').click();
  await expect(packSnapshotAction.getByRole('status')).toContainText('Saved point-in-time Delivery Pack version 1');
  const afterPackSnapshot = await getFrame(control, projectName);
  expect(afterPackSnapshot.counts.packSnapshots).toBe(beforePackSnapshot.counts.packSnapshots + 1);
  expect(afterPackSnapshot.counts.commandReceipts).toBe(beforePackSnapshot.counts.commandReceipts + 1);
  expect(afterPackSnapshot.counts.audits).toBe(beforePackSnapshot.counts.audits + 1);
  expect(afterPackSnapshot.latestPack).toMatchObject({
    version: 1, projectId: setup.deliveryProject.id, taskCount: afterPackSnapshot.counts.activeTasks,
  });
  expect(afterPackSnapshot.latestPack!.boundTaskCount).toBeGreaterThanOrEqual(2);
  expectDigest(afterPackSnapshot.latestPack!.taskSetHash);
  expectUuid(afterPackSnapshot.latestPack!.receiptId);
  expectUuid(afterPackSnapshot.latestPack!.auditEventId);
  recordCase(cases, 'DELIVERY-009', beforePackSnapshot, afterPackSnapshot,
    ['Opened the current Delivery Pack', 'Saved one point-in-time state through the production control'],
    'The server committed one immutable snapshot from current authoritative tasks and exact Studio/import ancestry.',
    ['/functions/v1/studio-delivery-outcome-query', '/functions/v1/studio-delivery-authority-command'], measuredResponses(productionResponses, packResponseStart,
      ['/functions/v1/studio-delivery-outcome-query', '/functions/v1/studio-delivery-authority-command']),
    beforePackSnapshot.lineage.digest, afterPackSnapshot.lineage.digest);
  observeEvery(observations, 'DELIVERY-009');

  const monitorResponseStart = productionResponses.length;
  await clickProduct(page, 'Monitor');
  monitor = page.getByTestId('authoritative-delivery-outcomes');
  await expect(monitor).toBeVisible();
  await expect(monitor).toHaveAttribute('data-monitor-mode', 'read-only');
  await expect(monitor.getByText(outcome.label, { exact: true })).toBeVisible();
  await expect(monitor.getByText(outcome.detail, { exact: true })).toBeVisible();
  accessibility.push(await scanAffectedSurface(page, 'populated authoritative Delivery outcomes', '[data-testid="authoritative-delivery-outcomes"]'));
  await expect(monitor).toContainText(`Exact task ${importedTask!.id}`);
  await expect(monitor).toContainText(`document ${afterPublish.publication!.documentGenerationId}`);
  await expect(monitor).toContainText(`Studio version ${afterPublish.publication!.artifactVersionId}`);
  const apiBaseUrl = process.env.ENTERPRISE_LIFECYCLE_API_BASE_URL ?? '';
  const apiUrl = new URL(apiBaseUrl);
  expect(apiUrl.protocol).toBe('http:');
  expect(['127.0.0.1', 'localhost']).toContain(apiUrl.hostname);
  const foreignResponse = await fetch(`${apiBaseUrl.replace(/\/$/u, '')}/functions/v1/studio-delivery-outcome-query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${setup.actors.outsider.token}` },
    body: JSON.stringify({
      schemaVersion: 'studio-delivery-outcome-query.v1',
      organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      workspaceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      expectedAuthorizationVersion: 1,
      projectId: setup.deliveryProject.id,
      limit: 100,
      cursor: null,
    }),
  });
  expect([403, 404]).toContain(foreignResponse.status);
  const foreignBody = await foreignResponse.text();
  expect(foreignBody).not.toContain(setup.deliveryProject.id);
  expect(foreignBody).not.toContain(outcome.label);
  expect(foreignBody).not.toContain(outcome.detail);
  const afterMonitor = await getFrame(control, projectName);
  expect(afterMonitor.writeFingerprint).toBe(afterPackSnapshot.writeFingerprint);
  expect(afterMonitor.foreignProbe).toEqual({
    status: foreignResponse.status,
    disclosedIdentifiers: false,
    disclosedBlocker: false,
  });
  recordCase(cases, 'MONITOR-001', afterPackSnapshot, afterMonitor,
    ['Opened Monitor', 'Verified exact task/document/Studio identifiers', 'Probed the same project as a foreign actor'],
    'Monitor displayed exact local ancestry while the foreign request disclosed no identifier.',
    ['/functions/v1/studio-delivery-outcome-query'], measuredResponses(productionResponses, monitorResponseStart,
      ['/functions/v1/studio-delivery-outcome-query'], [{ route: '/functions/v1/studio-delivery-outcome-query', status: foreignResponse.status }]),
    afterPackSnapshot.lineage.digest, afterMonitor.lineage.digest);
  recordCase(cases, 'MONITOR-002', afterPackSnapshot, afterMonitor,
    ['Read the explicit human outcome in Monitor'],
    'Status, label, and detail exactly matched the recorded outcome with no inferred fallback.',
    ['/functions/v1/studio-delivery-outcome-query'], measuredResponses(productionResponses, monitorResponseStart,
      ['/functions/v1/studio-delivery-outcome-query']));
  recordCase(cases, 'MONITOR-003', afterPackSnapshot, afterMonitor,
    ['Read the explicit blocker detail', 'Verified foreign response body omitted blocker text'],
    'The exact recorded blocker was visible only inside the authorized tenant/project scope.',
    ['/functions/v1/studio-delivery-outcome-query'], measuredResponses(productionResponses, monitorResponseStart,
      ['/functions/v1/studio-delivery-outcome-query'], [{ route: '/functions/v1/studio-delivery-outcome-query', status: foreignResponse.status }]));
  observeEvery(observations, 'MONITOR-001');
  observeEvery(observations, 'MONITOR-002');
  observeEvery(observations, 'MONITOR-003');

  await page.route('**/functions/v1/studio-delivery-outcome-query', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Projection unavailable.' } }),
  }));
  const unavailableResponseStart = productionResponses.length;
  await clickProduct(page, 'Delivery');
  await clickProduct(page, 'Monitor');
  await expect(page.getByTestId('authoritative-delivery-outcomes').getByRole('alert')).toHaveText(
    'Recorded outcomes are unavailable. Legacy task state is not substituted.',
  );
  await expect(page.getByText(outcome.label, { exact: true })).toHaveCount(0);
  const afterUnavailableMonitor = await getFrame(control, projectName);
  expect(afterUnavailableMonitor.writeFingerprint).toBe(afterMonitor.writeFingerprint);
  recordCase(cases, 'MONITOR-004', afterMonitor, afterUnavailableMonitor,
    ['Forced the production projection route unavailable', 'Reopened Monitor'],
    'Monitor displayed an explicit unavailable state and did not substitute legacy task success.',
    ['/functions/v1/studio-delivery-outcome-query'], measuredResponses(productionResponses, unavailableResponseStart,
      ['/functions/v1/studio-delivery-outcome-query']));
  observeEvery(observations, 'MONITOR-004');
  recordCase(cases, 'E2E-001', beforePublish, afterOutcome,
    ['Published the approved Studio artifact', 'Imported exact Docs work items', 'Updated an authoritative task', 'Recorded a human Delivery outcome'],
    'The actual UI journey preserved approved Studio ancestry through Docs, Delivery, and the explicit outcome projection.',
    ['/functions/v1/studio-delivery-authority-command', '/functions/v1/legacy-delivery-command', '/functions/v1/studio-delivery-outcome-query'],
    measuredResponses(productionResponses, publishResponseStart,
      ['/functions/v1/studio-delivery-authority-command', '/functions/v1/legacy-delivery-command', '/functions/v1/studio-delivery-outcome-query']),
    beforePublish.lineage.digest, afterOutcome.lineage.digest);
  observeEvery(observations, 'E2E-001');

  const expectedObservations = Object.values(STUDIO_DELIVERY_MONITOR_CASE_ASSERTIONS)
    .reduce((total, assertionIds) => total + assertionIds.length, 0);
  expect(observations).toHaveLength(expectedObservations);
  expect(cases).toHaveLength(Object.keys(STUDIO_DELIVERY_MONITOR_CASE_ASSERTIONS).length);
  return { observations, cases, accessibility, finalFrame: afterUnavailableMonitor };
};
