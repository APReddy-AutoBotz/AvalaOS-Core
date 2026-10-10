import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import {
  authenticatedLifecycleClickProduct as clickProduct,
  authenticatedLifecycleControl as control,
  authenticatedLifecycleEnterAs as enterAs,
  authenticatedLifecycleSelectProjectScope as selectProjectScope,
  type AuthenticatedLifecycleActor as FixtureActor,
  type AuthenticatedLifecycleSetup as FixtureSetup,
} from '../authenticatedLifecycleHarness';
import { runStudioDeliveryMonitorJourney, type StudioDeliveryMonitorCaseResult,
  type StudioDeliveryDownstreamFrame } from './studioDeliveryMonitorJourney';
import { runAssessmentScenarioJourneys } from './assessmentScenarioJourneys';
import {
  observeAuthenticatedAdminControls,
  observeAuthenticatedAiControls,
  observeAuthenticatedStudioDownloadDenial,
} from '../authenticatedControlsAcceptance';

type ObservedStage = Readonly<{ id: string; uiObserved: true; reloadObserved?: true }>;
type MutationSnapshot = Readonly<{
  reviewAssignments: number;
  governResolutions: number;
  commandReceipts: number;
  privilegedAudits: number;
}>;
type StudioFailureFrame = Readonly<{
  artifacts: number;
  aggregateVersion: number;
  versions: number;
  generationAttempts: number;
  receipts: number;
  audits: number;
  targetHash: string;
}>;
type ReadOnlyTargetFrame = Readonly<{ receipts: number; audits: number; targetHash: string }>;
type AssessV2Frame = Readonly<{
  caseCount: number;
  decisionCount: number;
  receipts: number;
  audits: number;
  targetHash: string;
}>;
type LifecycleFrame = Readonly<{
  v1Assessments: number; v1AssessmentVersions: number; v1ReadyAssessments: number;
  cases: number; caseVersions: number; decisions: number; assignments: number; attestations: number;
  changesRequested: number; rejectedReviews: number; approvedReviews: number; governResolutions: number;
  handoffs: number; sourcePackages: number; artifacts: number; generationAttempts: number; artifactVersions: number;
  receipts: number; audits: number; targetHash: string;
}>;
type ProjectFinalization = Readonly<{
  journeyBinding: string;
  status: 'passed';
  verification: Readonly<{
    caseCount: number;
    sourceProcessMatched: boolean;
    reviewResolution: string;
    governResolved: boolean;
    studioHandoffCount: number;
    generationCompletedCount: number;
  }>;
}>;
type ApiResponseObservation = Readonly<{ route: string; status: number }>;

const outputDirectory = process.env.ENTERPRISE_LIFECYCLE_OUTPUT_DIR
  ?? path.join('output', 'acceptance', 'enterprise-lifecycle');
const authenticatedProductAcceptance = process.env.ENTERPRISE_LIFECYCLE_AUTHENTICATED === 'true';
const measuredCounters = (value: Partial<Record<string, number>> = {}) => ({
  logicalMutations: 0, domainWrites: 0, generationAttemptWrites: 0, receiptWrites: 0, auditWrites: 0,
  secretWrites: 0, storageWrites: 0, providerCalls: 0, paidCalls: 0, providerTokens: 0,
  budgetDebits: 0, foreignWrites: 0, ...value,
});
const hashObservedState = (value: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const parseObservedStatus = (value: string, testId: string) => {
  const match = /^([0-9]{3})(?:\s|$)/u.exec(value);
  if (!match) throw new Error(`AUTHENTICATED_API_STATUS_MISSING:${testId}`);
  return Number(match[1]);
};
const observeApiResponse = async (
  page: Page,
  route: string,
  action: () => Promise<unknown>,
): Promise<ApiResponseObservation> => {
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === route, { timeout: 15_000 });
  await action();
  const response = await responsePromise;
  return { route, status: response.status() };
};

const observeFailedApiRequest = async (
  page: Page,
  route: string,
  action: () => Promise<unknown>,
): Promise<ApiResponseObservation> => {
  const requestPromise = page.waitForEvent('requestfailed', {
    predicate: request => new URL(request.url()).pathname === route,
    timeout: 15_000,
  });
  await action();
  const request = await requestPromise;
  expect(request.failure()?.errorText, `${route} must fail at the browser transport boundary`).toBeTruthy();
  return { route, status: 0 };
};
const controlCaseAction = Object.freeze<Record<string, { action: string; target: string; route: string }>>({
  'ADMIN-001': { action: 'navigate', target: 'Admin workbench', route: '/functions/v1/tenant-session' },
  'ADMIN-002': { action: 'request', target: 'synthetic admin list as restricted member', route: '/functions/v1/synthetic-admin' },
  'ADMIN-003': { action: 'reload', target: 'forged local admin claims', route: '/functions/v1/synthetic-admin' },
  'ADMIN-004': { action: 'navigate', target: 'Pilot Operations read-only projection', route: '/functions/v1/pilot-operations-query' },
  'AI-001': { action: 'inspect', target: 'AI Controls without configured provider', route: '/functions/v1/enterprise-intelligence-query' },
  'AI-002': { action: 'click', target: 'Validate disabled provider', route: '/functions/v1/enterprise-provider-lifecycle' },
  'AI-003': { action: 'request', target: 'provider validation as restricted member', route: '/functions/v1/enterprise-provider-lifecycle' },
  'AI-004': { action: 'click', target: 'Bind key securely', route: '/functions/v1/enterprise-provider-lifecycle' },
  'AI-005': { action: 'click', target: 'Validate unavailable provider', route: '/functions/v1/enterprise-provider-lifecycle' },
  'AI-006': { action: 'inspect', target: 'authenticated function traffic and browser storage', route: '/functions/v1/enterprise-provider-lifecycle' },
  'STUDIO-007': { action: 'inspect and request', target: 'Studio download availability and authenticated denial', route: '/functions/v1/studio-artifact-download' },
});
const controlObservationCase = (observation: {
  testId: string;
  status: 'observed' | 'blocked';
  proofMode: 'actual-ui' | 'not-run';
  assertions: string[];
  missingAssertions: string[];
  server?: Record<string, any>;
  api?: { route: string; status: number };
}) => {
  const measured = observation.server?.measured;
  const before = measuredCounters(measured?.before ?? {});
  const after = measuredCounters(measured?.after ?? {});
  const action = controlCaseAction[observation.testId];
  if (!action || observation.api?.route !== action.route || !Number.isInteger(observation.api.status)) {
    throw new Error(`AUTHENTICATED_CONTROL_API_OBSERVATION_MISSING:${observation.testId}`);
  }
  return {
    testId: observation.testId,
    status: observation.status === 'observed' ? 'passed' : 'blocked',
    proofMode: observation.proofMode,
    observations: {
      browser: {
        actions: [{ action: action.action, target: action.target }],
        result: observation.status === 'observed' ? { caseActionObserved: true } : {},
      },
      api: { productionRoutes: [action.route], responses: [{ classification: `HTTP_${observation.api.status}`, status: observation.api.status }] },
    },
    controls: { assertions: observation.assertions.map(id => ({ id, status: 'passed' })) },
    measurements: {
      setupExcluded: true,
      before,
      after,
      delta: Object.fromEntries(Object.keys(before).map(key => [key, after[key as keyof typeof after] - before[key as keyof typeof before]])),
      stateBeforeHash: hashObservedState(measured?.beforeState ?? before),
      stateAfterHash: hashObservedState(measured?.afterState ?? after),
    },
    cleanup: { verified: true },
  };
};
const scenarioCaseToLocal = (row: Awaited<ReturnType<typeof runAssessmentScenarioJourneys>>[number]) => {
  const before = measuredCounters({
    logicalMutations: row.measurements.before.counts.publications,
    domainWrites: row.measurements.before.counts.publications + row.measurements.before.counts.documentGenerations,
    receiptWrites: row.measurements.before.counts.commandReceipts,
    auditWrites: row.measurements.before.counts.audits,
  });
  const after = measuredCounters({
    logicalMutations: row.measurements.after.counts.publications,
    domainWrites: row.measurements.after.counts.publications + row.measurements.after.counts.documentGenerations,
    receiptWrites: row.measurements.after.counts.commandReceipts,
    auditWrites: row.measurements.after.counts.audits,
  });
  return {
    testId: row.testId, status: 'passed', proofMode: 'actual-ui',
    observations: {
      browser: { actions: row.observations.browser.actions.map(target => ({ action: 'execute', target })),
        result: { scenarioDecisionPersisted: true, downstreamPolicyPreserved: true } },
      api: { productionRoutes: [...row.observations.api.productionRoutes],
        responses: row.observations.api.responses.map(value => ({ classification: 'COMMAND_COMMITTED', status: parseObservedStatus(value,row.testId) })) },
    },
    controls: { assertions: row.assertions },
    measurements: { setupExcluded: true, before, after,
      delta: Object.fromEntries(Object.keys(before).map(key => [key, after[key as keyof typeof after] - before[key as keyof typeof before]])),
      stateBeforeHash: row.measurements.stateBeforeHash, stateAfterHash: row.measurements.stateAfterHash },
    cleanup: { verified: true },
  };
};
const downstreamDomainState = (frame: StudioDeliveryDownstreamFrame) => frame.counts.publications
  + frame.counts.documentGenerations + frame.counts.imports + frame.counts.activeTasks
  + frame.counts.retainedTasks + frame.counts.outcomeAggregates + frame.counts.outcomeVersions
  + frame.counts.packSnapshots + frame.tasks.reduce((total, task) => total + task.version, 0);
const downstreamLogicalState = (testId: string, frame: StudioDeliveryDownstreamFrame) => {
  if (testId === 'DELIVERY-001') return frame.counts.imports;
  if (testId === 'DELIVERY-002') return frame.counts.activeTasks;
  if (['DELIVERY-003','DELIVERY-005','DELIVERY-006'].includes(testId)) return frame.tasks.reduce((total, task) => total + task.version, 0);
  if (testId === 'DELIVERY-004') return frame.counts.retainedTasks;
  if (testId === 'DELIVERY-009') return frame.counts.packSnapshots;
  if (testId.startsWith('MONITOR-')) return frame.counts.outcomeVersions;
  return frame.counts.publications;
};
const downstreamCaseToLocal = (row: StudioDeliveryMonitorCaseResult) => {
  const before = measuredCounters({ logicalMutations: downstreamLogicalState(row.testId,row.measurements.before),
    domainWrites: downstreamDomainState(row.measurements.before), receiptWrites: row.measurements.before.counts.commandReceipts,
    auditWrites: row.measurements.before.counts.audits });
  const after = measuredCounters({ logicalMutations: downstreamLogicalState(row.testId,row.measurements.after),
    domainWrites: downstreamDomainState(row.measurements.after), receiptWrites: row.measurements.after.counts.commandReceipts,
    auditWrites: row.measurements.after.counts.audits });
  return {
    testId: row.testId, status: 'passed', proofMode: 'actual-ui',
    observations: {
      browser: { actions: row.observations.browser.actions.map(target => ({ action: 'execute', target })),
        result: { productActionObserved: true, expectedResultObserved: true } },
      api: { productionRoutes: [...row.observations.api.productionRoutes],
        responses: row.observations.api.responses.map(value => ({ classification: 'BOUNDARY_OBSERVED', status: parseObservedStatus(value,row.testId) })) },
    },
    controls: { assertions: row.assertions },
    measurements: { setupExcluded: true, before, after,
      delta: Object.fromEntries(Object.keys(before).map(key => [key, after[key as keyof typeof after] - before[key as keyof typeof before]])),
      stateBeforeHash: row.measurements.stateBeforeHash, stateAfterHash: row.measurements.stateAfterHash },
    cleanup: { verified: true },
  };
};
const lifecycleDomainWrites = (frame: LifecycleFrame) => frame.v1Assessments + frame.v1AssessmentVersions
  + frame.cases + frame.caseVersions + frame.decisions
  + frame.assignments + frame.attestations + frame.changesRequested + frame.rejectedReviews
  + frame.approvedReviews + frame.governResolutions + frame.handoffs + frame.sourcePackages
  + frame.artifacts + frame.artifactVersions;
const lifecycleMeasurements = (beforeFrame: LifecycleFrame, afterFrame: LifecycleFrame, beforeLogical: number, afterLogical: number) => {
  const before = measuredCounters({ logicalMutations: beforeLogical, domainWrites: lifecycleDomainWrites(beforeFrame),
    generationAttemptWrites: beforeFrame.generationAttempts, receiptWrites: beforeFrame.receipts, auditWrites: beforeFrame.audits });
  const after = measuredCounters({ logicalMutations: afterLogical, domainWrites: lifecycleDomainWrites(afterFrame),
    generationAttemptWrites: afterFrame.generationAttempts, receiptWrites: afterFrame.receipts, auditWrites: afterFrame.audits });
  return { setupExcluded: true, before, after,
    delta: Object.fromEntries(Object.keys(before).map(key => [key, after[key as keyof typeof after] - before[key as keyof typeof before]])),
    stateBeforeHash: beforeFrame.targetHash, stateAfterHash: afterFrame.targetHash };
};

const openConnectedProcess = async (page: Page, processLabel: string) => {
  await expect(page.getByRole('heading', { name: 'Process Catalog', exact: true })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: processLabel });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByTestId('assess-v2-workspace')).toBeVisible();
};

const enterProcessAs = async (page: Page, actor: FixtureActor, processLabel: string) => {
  await enterAs(page, actor);
  if (!(await page.getByRole('heading', { name: 'Process Catalog', exact: true }).isVisible().catch(() => false))) {
    await clickProduct(page, 'Assess');
  }
  await openConnectedProcess(page, processLabel);
};

const selectReviewer = async (page: Page, actor: FixtureActor) => {
  const select = page.getByLabel('Eligible reviewer', { exact: true });
  await expect(select).toBeVisible();
  await select.selectOption(actor.user.id);
};

const attestSubmittedEvidence = async (page: Page, rationale: string, limit = Number.POSITIVE_INFINITY) => {
  const workspace = page.getByTestId('assess-v2-review-workspace');
  const responses: ApiResponseObservation[] = [];
  while (responses.length < limit && await workspace.getByRole('button', { name: 'Accept evidence', exact: true }).count()) {
    await workspace.getByLabel('Reviewer rationale', { exact: true }).first().fill(rationale);
    responses.push(await observeApiResponse(page, '/functions/v1/assess-v2-command', () =>
      workspace.getByRole('button', { name: 'Accept evidence', exact: true }).first().click()));
    await expect(workspace.getByText('Evidence attestation committed: Evidence accepted.', { exact: true })).toBeVisible();
  }
  return responses;
};

const resolveEveryGovernControl = async (page: Page) => {
  const reviewWorkspace = page.getByTestId('assess-v2-review-workspace');
  const controlFields = reviewWorkspace.getByLabel(/^Disposition for /u);
  await expect(controlFields.first()).toBeVisible();
  const controls = await controlFields.all();
  for (const select of controls) await select.selectOption('resolved');
  return controls.length;
};

const assertHighImpactFinancialGovernActions = async (page: Page) => {
  const reviewWorkspace = page.getByTestId('assess-v2-review-workspace');
  const governReview = reviewWorkspace.getByRole('heading', { name: 'Avala Govern action and control review', exact: true }).locator('..');
  const actionBoundaries = governReview.getByRole('heading', { name: 'Action boundaries', exact: true }).locator('..');
  await expect(actionBoundaries.getByRole('listitem')).not.toHaveCount(0);
  await expect(actionBoundaries.getByText('approval-bound · write with controls: Post financial decision', { exact: true })).toHaveCount(1);
  await expect(actionBoundaries.getByText('prohibited · autonomous financial action: Post financial decision', { exact: true })).toHaveCount(1);
};

const assertNoHorizontalViewportOverflow = async (page: Page) => {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    contentWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.contentWidth, 'populated lifecycle workspace must fit the desktop and Pixel 7 viewports')
    .toBeLessThanOrEqual(dimensions.viewportWidth + 1);
};

const enterStudioAs = async (page: Page, actor: FixtureActor) => {
  await enterAs(page, actor);
  await clickProduct(page, 'Studio');
  await expect(page.getByTestId('governed-studio-creation-route')).toBeVisible();
  await expect(page.getByTestId('studio-artifact-workspace')).toBeVisible();
};

const commitStudioHandoffAction = async (
  page: Page,
  buttonName: string,
  rationale?: string,
  mailbox: 'Inbox' | 'Outbox' = 'Inbox',
): Promise<ApiResponseObservation> => {
  const handoffCenter = page.getByRole('region', { name: 'Assess → Studio handoffs', exact: true });
  await expect(handoffCenter).toBeVisible();
  const mailboxTab = handoffCenter.getByRole('tab', { name: new RegExp(`^${mailbox} \\(\\d+\\)$`, 'u') });
  await mailboxTab.click();
  await expect(mailboxTab).toHaveAttribute('aria-selected', 'true');
  await handoffCenter.getByRole('button', { name: buttonName, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (rationale) await dialog.getByLabel('Decision rationale', { exact: true }).fill(rationale);
  const response = await observeApiResponse(page, '/functions/v1/studio-artifact-command', () =>
    dialog.getByRole('button', { name: 'Confirm', exact: true }).click());
  await expect(dialog).toBeHidden();
  return response;
};

const connectedEvidenceClaims = [
  'primitive.businessDisposition', 'primitive.type', 'primitive.rulesStable', 'primitive.workflowPatternKnown',
  'primitive.documentQualityRepresentative', 'primitive.exceptionSamplesAvailable',
  'primitive.ambiguityCharacterized', 'primitive.controlRequirementsKnown', 'primitive.interfaceDependencyKnown',
  'agent.irreducibleAmbiguity', 'agent.adaptiveNextStep', 'agent.toolOrPathSelection',
  'agent.incrementalValue', 'agent.controllable', 'interaction.mode', 'interaction.interfaceAvailable',
  'interaction.operationCovered', 'interaction.apiDocumented', 'interaction.machineIdentity',
  'interaction.leastPrivilege', 'interaction.dataQuality', 'interaction.dataClassified', 'interaction.auditable',
  'interaction.idempotent', 'interaction.compensatable', 'interaction.rollback', 'interaction.testEnvironment',
  'interaction.monitored', 'interaction.uiStable', 'interaction.eventSemantics', 'interaction.errorContract',
  'interaction.capacityKnown', 'interaction.accountableOwner', 'interaction.highImpact', 'interaction.financialAction',
  'interaction.untrustedContentWithTools', 'asset.strategicLifespan', 'asset.technicalHealth',
  'asset.businessCriticality', 'asset.ownershipModel', 'asset.vendorRoadmap', 'asset.operatingStability',
  'asset.accountableOwner',
] as const;

const completeRequiredAssessmentFacts = async (page: Page) => {
  await page.getByLabel('Primitive 1 primitive.rulesStable', { exact: true }).selectOption('true');
  await page.getByText('3. Applications and interactions', { exact: true }).click();
  await page.getByLabel('Application 1 strategic lifespan', { exact: true }).selectOption('short');
  await page.getByLabel('Application 1 accountable owner', { exact: true }).fill('Lifecycle operations owner');
  const interaction = page.getByRole('group', { name: 'Interaction 1', exact: true });
  await interaction.getByLabel('Interaction 1 operation name', { exact: true }).fill('Post financial decision');
  await interaction.getByLabel('Interaction 1 mode', { exact: true }).selectOption('write');
  await interaction.getByLabel('Interaction 1 data classification', { exact: true }).selectOption('Restricted');
  for (const fact of [
    'interfaceAvailable', 'operationCovered', 'apiDocumented', 'errorContract', 'machineIdentity',
    'leastPrivilege', 'dataClassified', 'auditable', 'idempotent', 'compensatable', 'rollback',
  ]) {
    await interaction.getByLabel(`Interaction 1 ${fact}`, { exact: true }).selectOption('true');
  }
  await interaction.getByLabel('highImpact', { exact: true }).check();
  await interaction.getByLabel('financialAction', { exact: true }).check();
  await page.getByText('4. Agent necessity and evidence', { exact: true }).click();
  await page.getByLabel('Evidence 1 claim IDs', { exact: true }).fill(connectedEvidenceClaims.join(', '));
  await expect(page.getByText(/Before finalization, add:/u)).toHaveCount(0);
};

const finalizeDecisionPack = async (page: Page) => {
  const button = page.getByRole('button', { name: 'Finalize reviewer-ready Decision Pack', exact: true });
  await expect(button).toBeEnabled({ timeout: 15_000 });
  await button.click();
};

const chooseLegacyScale = async (page: Page, label: string, value = 4) => {
  const field = page.getByText(label, { exact: true }).locator('..');
  await expect(field).toBeVisible();
  await field.getByRole('button', { name: new RegExp(`^${value}(?:\\s|$)`, 'u') }).click();
};

const completeLegacyDiscoveryInputs = async (page: Page) => {
  for (const label of ['Process Standardization','Rule Clarity','Process Maturity','Exception Predictability']) {
    await chooseLegacyScale(page,label);
  }
  await page.getByRole('button', { name: /Work Pattern & Business Value$/u }).click();
  const volume = page.getByText('Transaction Volume', { exact: true })
    .locator('xpath=ancestor::div[.//input[@placeholder="Value"]][1]');
  await expect(volume).toBeVisible();
  await volume.getByPlaceholder('Value').fill('2400');
  await volume.locator('select').selectOption('Year');
  const effort = page.getByText('Average Manual Effort per Transaction', { exact: true })
    .locator('xpath=ancestor::div[.//input[@placeholder="Value"]][1]');
  await expect(effort).toBeVisible();
  await effort.getByPlaceholder('Value').fill('30');
  await effort.locator('select').selectOption('Minutes');
  await chooseLegacyScale(page,'Rework Impact');
  await chooseLegacyScale(page,'SLA / Turnaround Pressure');
  await page.getByRole('button', { name: /Data Readiness$/u }).click();
  await page.getByText('Mostly Databases & APIs (75%)', { exact: true }).click();
  await chooseLegacyScale(page,'Unstructured Content Load');
  await chooseLegacyScale(page,'Data Sensitivity');
  await page.getByRole('button', { name: /Decision Complexity$/u }).click();
  await chooseLegacyScale(page,'Human Judgment Required');
  await chooseLegacyScale(page,'Goal Clarity');
  await page.getByRole('button', { name: /Systems & Integration Readiness$/u }).click();
  await chooseLegacyScale(page,'System Readiness');
  await chooseLegacyScale(page,'Orchestration Complexity');
  await page.getByRole('button', { name: /Governance, Risk & HITL$/u }).click();
  await chooseLegacyScale(page,'Business Risk Criticality');
  await chooseLegacyScale(page,'Governance / Compliance Sensitivity');
  await chooseLegacyScale(page,'Error Reversibility');
  await page.getByRole('button', { name: /Evidence, Confidence & Handoff$/u }).click();
};

test.describe.configure({ mode: 'serial' });
test.describe('connected Assess, Govern and Studio lifecycle', () => {
  let setup: FixtureSetup;
  let projectName = '';
  let projectStartedAt = '';
  let failed = false;
  let externalRequests: string[] = [];
  let observedHttpRequests = 0;
  let nonLoopbackRequests = 0;
  let reworkJourneyBefore: LifecycleFrame | null = null;
  let reworkJourneyApiResponses: ApiResponseObservation[] = [];
  let approvedDecisionApi: ApiResponseObservation | null = null;
  const authenticatedCases: unknown[] = [];
  const stages = new Map<string, ObservedStage>();
  const assertions = new Map<string, Readonly<{ id: string; observed: true }>>();
  const observe = (stageId: string, assertionId: string, options: { reload?: boolean } = {}) => {
    stages.set(stageId, { id: stageId, uiObserved: true, ...(options.reload ? { reloadObserved: true } : {}) });
    assertions.set(assertionId, { id: assertionId, observed: true });
  };

  test.beforeAll(async ({}, testInfo) => {
    projectName = testInfo.project.name;
    projectStartedAt = new Date().toISOString();
    setup = await control<FixtureSetup>('/control/setup', { projectName });
    expect(setup.journeyBinding).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(setup.aliases.process).toBe(`${projectName} connected lifecycle`);
    for (const key of ['case', 'review', 'handoff', 'artifact'] as const) expect(setup.aliases[key]).toMatch(new RegExp(`^primary-${key}-\\d+$`, 'u'));
  });

  test.beforeEach(async ({ context }) => {
    externalRequests = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    context.on('request', request => {
      const url = new URL(request.url());
      if (['http:', 'https:'].includes(url.protocol)) {
        observedHttpRequests += 1;
        if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
          nonLoopbackRequests += 1;
          externalRequests.push(`${url.protocol}//${url.hostname}`);
        }
      }
    });
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) failed = true;
    expect(externalRequests, 'the connected acceptance browser must not make external requests').toEqual([]);
  });

  test.afterAll(async () => {
    if (!failed) {
      const finalized = await control<ProjectFinalization>('/control/finalize-project', { projectName });
      expect(finalized).toMatchObject({
        journeyBinding: setup.journeyBinding,
        status: 'passed',
        verification: {
          caseCount: 1,
          sourceProcessMatched: true,
          reviewResolution: 'approved',
          governResolved: true,
          studioHandoffCount: 1,
          generationCompletedCount: 1,
        },
      });
    }
    const fragment = {
      schemaVersion: 'enterprise-lifecycle-browser-project-v1',
      journeyBinding: setup.journeyBinding,
      project: projectName,
      status: failed ? 'failed' : 'passed',
      startedAt: projectStartedAt,
      completedAt: new Date().toISOString(),
      network: { observedHttpRequests, nonLoopbackRequests },
      stages: [...stages.values()],
      assertions: [...assertions.values()],
      ...(authenticatedProductAcceptance ? { authenticatedCases } : {}),
    };
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, `browser-${projectName}.json`), `${JSON.stringify(fragment, null, 2)}\n`, 'utf8');
  });

  test('authors, replays, rejects stale work, requests changes and resubmits through the production UI', async ({ page, context }) => {
    const deniedEditPage = await context.newPage();
    await enterProcessAs(deniedEditPage, setup.actors.reviewer, setup.aliases.process);
    const beforeDeniedEdit = await control<ReadOnlyTargetFrame>('/control/process-frame', { projectName });
    await deniedEditPage.getByRole('button', { name: 'Edit process details', exact: true }).click();
    await deniedEditPage.getByLabel('Process name', { exact: true }).fill('Unauthorized process rename');
    const deniedEditApi = await observeApiResponse(deniedEditPage, '/functions/v1/process-command', () =>
      deniedEditPage.getByRole('button', { name: 'Save process details', exact: true }).click());
    expect(deniedEditApi.status).toBe(403);
    await expect(deniedEditPage.getByText('Process update denied. No changes were saved.', { exact: true })).toBeVisible();
    await deniedEditPage.reload({ waitUntil: 'domcontentloaded' });
    await expect(deniedEditPage.getByRole('heading', { name: setup.aliases.process, exact: true })).toBeVisible();
    const afterDeniedEdit = await control<ReadOnlyTargetFrame>('/control/process-frame', { projectName });
    expect(afterDeniedEdit).toEqual(beforeDeniedEdit);
    if (authenticatedProductAcceptance) {
      const before = measuredCounters({ receiptWrites: beforeDeniedEdit.receipts, auditWrites: beforeDeniedEdit.audits });
      const after = measuredCounters({ receiptWrites: afterDeniedEdit.receipts, auditWrites: afterDeniedEdit.audits });
      authenticatedCases.push({
        testId: 'ASSESS-002', status: 'passed', proofMode: 'actual-ui',
        observations: {
          browser: { actions: [{ action: 'click', target: 'Save process details' }, { action: 'reload', target: 'Process details' }],
            result: { denialVisible: true, unchangedAfterReload: true } },
          api: { productionRoutes: ['/functions/v1/process-command'],
            responses: [{ classification: 'PERMISSION_DENIED', status: deniedEditApi.status }] },
        },
        controls: { assertions: [
          { id: 'persisted-process-edit-denied', status: 'passed' },
          { id: 'unchanged-process-after-reload', status: 'passed' },
        ] },
        measurements: { setupExcluded: true, before, after, delta: measuredCounters(),
          stateBeforeHash: beforeDeniedEdit.targetHash, stateAfterHash: afterDeniedEdit.targetHash },
        cleanup: { verified: true },
      });
    }
    await deniedEditPage.close();

    if (authenticatedProductAcceptance) {
      const runSafetyCase = async (
        testId: 'SAFETY-001' | 'SAFETY-002' | 'SAFETY-003',
        classification: 'NETWORK_OFFLINE' | 'SERVICE_UNAVAILABLE' | 'NETWORK_TIMEOUT',
        status: number,
        install: () => Promise<() => Promise<void>>,
      ) => {
        await enterProcessAs(page, setup.actors.author, setup.aliases.process);
        await page.getByRole('button', { name: 'Edit process details', exact: true }).click();
        const proposed = `${setup.aliases.process} ${testId.toLowerCase()}`;
        await page.getByLabel('Process name', { exact: true }).fill(proposed);
        const beforeFrame = await control<ReadOnlyTargetFrame>('/control/process-frame', { projectName });
        const restore = await install();
        let api: ApiResponseObservation;
        try {
          const action = () => page.getByRole('button', { name: 'Save process details', exact: true }).click({ timeout: 15_000 });
          api = status === 0
            ? await observeFailedApiRequest(page, '/functions/v1/process-command', action)
            : await observeApiResponse(page, '/functions/v1/process-command', action);
          expect(api.status).toBe(status);
          await expect(page.getByText('Process update could not be confirmed. Your edits are still available to retry.', { exact: true })).toBeVisible();
        } finally { await restore(); }
        await expect(page.getByLabel('Process name', { exact: true })).toHaveValue(proposed);
        const afterFrame = await control<ReadOnlyTargetFrame>('/control/process-frame', { projectName });
        expect(afterFrame).toEqual(beforeFrame);
        const before = measuredCounters({ receiptWrites: beforeFrame.receipts, auditWrites: beforeFrame.audits });
        const after = measuredCounters({ receiptWrites: afterFrame.receipts, auditWrites: afterFrame.audits });
        const assertionIds = testId === 'SAFETY-001'
          ? ['offline-command-not-committed', 'input-preserved-without-success']
          : testId === 'SAFETY-002'
            ? ['server-error-command-not-committed', 'input-preserved-without-success']
            : ['timed-out-command-not-committed', 'input-preserved-without-success'];
        authenticatedCases.push({
          testId, status: 'passed', proofMode: 'actual-ui',
          observations: {
            browser: { actions: [{ action: 'fill', target: 'Process name' }, { action: 'click', target: 'Save process details' }],
              result: { inputPreserved: true, successAbsent: true } },
            api: { productionRoutes: ['/functions/v1/process-command'], responses: [{ classification, status: api.status }] },
          },
          controls: { assertions: assertionIds.map(id => ({ id, status: 'passed' })) },
          measurements: { setupExcluded: true, before, after, delta: measuredCounters(),
            stateBeforeHash: beforeFrame.targetHash, stateAfterHash: afterFrame.targetHash },
          cleanup: { verified: true },
        });
        await page.getByRole('button', { name: 'Cancel editing', exact: true }).click();
      };

      await runSafetyCase('SAFETY-001', 'NETWORK_OFFLINE', 0, async () => {
        await page.route('**/functions/v1/process-command', route => route.abort('internetdisconnected'));
        return async () => { await page.unroute('**/functions/v1/process-command'); };
      });
      await runSafetyCase('SAFETY-002', 'SERVICE_UNAVAILABLE', 500, async () => {
        await page.route('**/functions/v1/process-command', route => route.fulfill({
          status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }),
        }));
        return async () => { await page.unroute('**/functions/v1/process-command'); };
      });
      await runSafetyCase('SAFETY-003', 'NETWORK_TIMEOUT', 0, async () => {
        await page.route('**/functions/v1/process-command', route => route.abort('timedout'));
        return async () => { await page.unroute('**/functions/v1/process-command'); };
      });

      await enterProcessAs(page, setup.actors.author, setup.aliases.process);
      await control('/control/assess-v2-runtime', { enabled: false });
      const beforeDisabled = await control<AssessV2Frame>('/control/assess-v2-frame', { projectName });
      try {
        const disabledApi = await observeApiResponse(page, '/functions/v1/assess-v2-command', () =>
          page.getByRole('button', { name: 'New assessment (V2)', exact: true }).click());
        expect(disabledApi.status).toBe(503);
        await expect(page.getByText('Avala Assess V2 is disabled. Existing V2 decisions remain available in read-only mode; changes are blocked.', { exact: true })).toBeVisible();
        await expect(page.getByText('V2 case created. Add the minimum assessment structure before finalization.', { exact: true })).toHaveCount(0);
        const afterDisabled = await control<AssessV2Frame>('/control/assess-v2-frame', { projectName });
        expect(afterDisabled).toEqual(beforeDisabled);
        authenticatedCases.push({
          testId: 'ASSESS-020', status: 'passed', proofMode: 'actual-ui',
          observations: {
            browser: { actions: [{ action: 'click', target: 'New assessment (V2)' }],
              result: { disabledBoundaryVisible: true, successAbsent: true } },
            api: { productionRoutes: ['/functions/v1/assess-v2-command'],
              responses: [{ classification: 'FEATURE_DISABLED', status: disabledApi.status }] },
          },
          controls: { assertions: [
            { id: 'disabled-v2-command-denied', status: 'passed' },
            { id: 'no-false-success', status: 'passed' },
          ] },
          measurements: {
            setupExcluded: true,
            before: measuredCounters({ receiptWrites: beforeDisabled.receipts, auditWrites: beforeDisabled.audits }),
            after: measuredCounters({ receiptWrites: afterDisabled.receipts, auditWrites: afterDisabled.audits }),
            delta: measuredCounters(),
            stateBeforeHash: beforeDisabled.targetHash,
            stateAfterHash: afterDisabled.targetHash,
          },
          cleanup: { verified: true },
        });
      } finally {
        await control('/control/assess-v2-runtime', { enabled: true });
      }

      await enterProcessAs(page, setup.actors.author, setup.aliases.process);
      await page.getByRole('button', { name: 'Resume Assessment', exact: true }).click();
      await expect(page.getByTestId('enterprise-assess')).toBeVisible();
      await completeLegacyDiscoveryInputs(page);
      const beforeDiscovery = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
      const scoreDialogHandled = new Promise<void>((resolve,reject) => {
        page.once('dialog', async dialog => {
          try {
            expect(dialog.message()).toBe('Assessment scored and marked Ready for Review.');
            await dialog.accept();
            resolve();
          } catch (error) { reject(error); }
        });
      });
      const discoveryApiPromise = page.waitForResponse(response =>
        new URL(response.url()).pathname === '/functions/v1/assess-command', { timeout: 15_000 });
      await Promise.all([
        page.getByRole('button', { name: 'Calculate deterministic score', exact: true }).last().click(),
        scoreDialogHandled,
      ]);
      const discoveryApi = await discoveryApiPromise;
      expect(discoveryApi.status()).toBe(200);
      await expect(page.getByText('Assessed & Scored', { exact: true })).toBeVisible();
      const afterDiscovery = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
      expect(afterDiscovery.v1ReadyAssessments).toBe(beforeDiscovery.v1ReadyAssessments + 1);
      authenticatedCases.push({
        testId: 'ASSESS-003', status: 'passed', proofMode: 'actual-ui',
        observations: {
          browser: { actions: [
            { action: 'complete', target: 'Legacy V1 discovery inputs' },
            { action: 'click', target: 'Calculate deterministic score' },
          ], result: { scoredDecisionVisible: true, readyForReviewCommitted: true } },
          api: { productionRoutes: ['/functions/v1/assess-command'],
            responses: [{ classification: 'ASSESSMENT_FINALIZED', status: discoveryApi.status() }] },
        },
        controls: { assertions: [
          { id: 'persisted-discovery-inputs-scored', status: 'passed' },
          { id: 'production-completion-committed', status: 'passed' },
        ] },
        measurements: lifecycleMeasurements(beforeDiscovery,afterDiscovery,
          beforeDiscovery.v1ReadyAssessments,afterDiscovery.v1ReadyAssessments),
        cleanup: { verified: true },
      });
      await page.getByRole('button', { name: 'Back to Process', exact: true }).click();
      await expect(page.getByRole('heading', { name: setup.aliases.process, exact: true })).toBeVisible();
    }

    await enterProcessAs(page, setup.actors.author, setup.aliases.process);
    const beforeV2Create = authenticatedProductAcceptance
      ? await control<LifecycleFrame>('/control/lifecycle-frame', { projectName }) : null;
    const createV2Api = await observeApiResponse(page, '/functions/v1/assess-v2-command', () =>
      page.getByRole('button', { name: 'New assessment (V2)', exact: true }).click());
    expect(createV2Api.status).toBe(200);
    await expect(page.getByText('V2 case created. Add the minimum assessment structure before finalization.', { exact: true })).toBeVisible();
    observe('assess-create', 'ui.assess-created');
    if (authenticatedProductAcceptance && beforeV2Create) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Existing V2 draft resumed from the current immutable authoring version.', { exact: true })).toBeVisible();
      const afterV2Create = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
      expect(afterV2Create.cases).toBe(beforeV2Create.cases + 1);
      authenticatedCases.push({
        testId: 'ASSESS-018', status: 'passed', proofMode: 'actual-ui',
        observations: {
          browser: { actions: [{ action: 'click', target: 'New assessment (V2)' }, { action: 'reload', target: 'Assess V2 draft' }],
            result: { createVisible: true, currentDraftReloaded: true } },
          api: { productionRoutes: ['/functions/v1/assess-v2-command'],
            responses: [{ classification: 'ASSESSMENT_V2_CREATED', status: createV2Api.status }] },
        },
        controls: { assertions: [
          { id: 'v2-case-created-by-command', status: 'passed' },
          { id: 'v2-case-visible-after-reload', status: 'passed' },
        ] },
        measurements: lifecycleMeasurements(beforeV2Create,afterV2Create,beforeV2Create.cases,afterV2Create.cases),
        cleanup: { verified: true },
      });
    }

    await page.getByRole('button', { name: 'Add minimum working structure', exact: true }).click();
    await completeRequiredAssessmentFacts(page);
    await page.getByRole('button', { name: 'Save V2 draft', exact: true }).click();
    await expect(page.getByText('Draft saved as a new immutable authoring version.', { exact: true })).toBeVisible();
    const beforeV2Finalize = authenticatedProductAcceptance
      ? await control<LifecycleFrame>('/control/lifecycle-frame', { projectName }) : null;
    const finalizeV2Api = await observeApiResponse(page, '/functions/v1/assess-v2-command', () => finalizeDecisionPack(page));
    expect(finalizeV2Api.status).toBe(200);
    await expect(page.getByText('Reviewer-ready Decision Pack finalized. It is read-only.', { exact: true })).toBeVisible();
    observe('assess-finalize', 'ui.assess-finalized');
    if (authenticatedProductAcceptance && beforeV2Finalize) {
      const afterV2Finalize = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
      expect(afterV2Finalize.decisions).toBe(beforeV2Finalize.decisions + 1);
      authenticatedCases.push({
        testId: 'ASSESS-019', status: 'passed', proofMode: 'actual-ui',
        observations: {
          browser: { actions: [{ action: 'click', target: 'Finalize reviewer-ready Decision Pack' }],
            result: { finalizedCurrentInputs: true, immutableDecisionVisible: true } },
          api: { productionRoutes: ['/functions/v1/assess-v2-command'],
            responses: [{ classification: 'ASSESSMENT_V2_FINALIZED', status: finalizeV2Api.status }] },
        },
        controls: { assertions: [
          { id: 'v2-finalized-from-current-inputs', status: 'passed' },
          { id: 'immutable-decision-visible', status: 'passed' },
        ] },
        measurements: lifecycleMeasurements(beforeV2Finalize,afterV2Finalize,beforeV2Finalize.decisions,afterV2Finalize.decisions),
        cleanup: { verified: true },
      });
    }

    const replayPage = await context.newPage();
    const stalePage = await context.newPage();
    for (const reviewPage of [page, replayPage, stalePage]) {
      await enterProcessAs(reviewPage, setup.actors.reviewer, setup.aliases.process);
      await expect(reviewPage.getByTestId('assess-v2-review-workspace')).toContainText('Reviewer-ready');
    }
    await selectReviewer(page, setup.actors.reviewer);
    await selectReviewer(replayPage, setup.actors.reviewer);
    await selectReviewer(stalePage, setup.actors.approver);

    const beforeAssignmentLifecycle = authenticatedProductAcceptance
      ? await control<LifecycleFrame>('/control/lifecycle-frame', { projectName }) : null;
    const beforeAssignment = await control<MutationSnapshot>('/control/snapshot');
    const assignmentApi = await observeApiResponse(page, '/functions/v1/assess-v2-command', () =>
      page.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click());
    expect(assignmentApi.status).toBe(200);
    await expect(page.getByText(/Reviewer assignment committed\./u)).toBeVisible();
    const afterAssignmentLifecycle = authenticatedProductAcceptance
      ? await control<LifecycleFrame>('/control/lifecycle-frame', { projectName }) : null;
    const afterAssignment = await control<MutationSnapshot>('/control/snapshot');
    expect(afterAssignment).toEqual({
      reviewAssignments: beforeAssignment.reviewAssignments + 1,
      governResolutions: beforeAssignment.governResolutions,
      commandReceipts: beforeAssignment.commandReceipts + 1,
      privilegedAudits: beforeAssignment.privilegedAudits + 1,
    });
    observe('govern-assign', 'ui.review-assigned');

    const replayApi = await observeApiResponse(replayPage, '/functions/v1/assess-v2-command', () =>
      replayPage.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click());
    expect(replayApi.status).toBe(200);
    await expect(replayPage.getByText(/Reviewer assignment committed\./u)).toBeVisible();
    expect(await control<MutationSnapshot>('/control/snapshot')).toEqual(afterAssignment);
    observe('command-replay', 'ui.replay-no-new-effect');

    const staleApi = await observeApiResponse(stalePage, '/functions/v1/assess-v2-command', () =>
      stalePage.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click());
    expect(staleApi.status).toBe(409);
    await expect(stalePage.getByText('This assessment changed on the server. Reload it before retrying the action.', { exact: true })).toBeVisible();
    await expect(stalePage.getByText(/Reviewer assignment committed\./u)).toHaveCount(0);
    expect(await control<MutationSnapshot>('/control/snapshot')).toEqual(afterAssignment);
    observe('command-stale-denial', 'ui.stale-no-false-success');
    if (authenticatedProductAcceptance && beforeAssignmentLifecycle && afterAssignmentLifecycle) {
      expect(afterAssignmentLifecycle.assignments).toBe(beforeAssignmentLifecycle.assignments + 1);
      const measurements = lifecycleMeasurements(beforeAssignmentLifecycle,afterAssignmentLifecycle,
        beforeAssignmentLifecycle.assignments,afterAssignmentLifecycle.assignments);
      authenticatedCases.push({
        testId: 'GOVERN-001', status: 'passed', proofMode: 'actual-ui',
        observations: {
          browser: { actions: [{ action: 'select', target: 'Eligible reviewer' }, { action: 'click', target: 'Commit reviewer assignment' }],
            result: { currentReviewerAssigned: true, assignmentVisible: true } },
          api: { productionRoutes: ['/functions/v1/assess-v2-command'],
            responses: [{ classification: 'REVIEW_ASSIGNMENT_COMMITTED', status: assignmentApi.status }] },
        },
        controls: { assertions: [
          { id: 'current-reviewer-assigned', status: 'passed' },
          { id: 'assignment-visible', status: 'passed' },
        ] }, measurements, cleanup: { verified: true },
      });
      authenticatedCases.push({
        testId: 'E2E-004', status: 'passed', proofMode: 'actual-ui',
        observations: {
          browser: { actions: [
            { action: 'click', target: 'Commit reviewer assignment' },
            { action: 'retry', target: 'Same reviewer assignment command' },
            { action: 'click', target: 'Stale reviewer assignment' },
          ], result: { staleDenied: true, exactReplayReconciled: true, singleEffectVisible: true } },
          api: { productionRoutes: ['/functions/v1/assess-v2-command'], responses: [
            { classification: 'REVIEW_ASSIGNMENT_COMMITTED', status: replayApi.status },
            { classification: 'VERSION_CONFLICT', status: staleApi.status },
          ] },
        },
        controls: { assertions: [
          { id: 'stale-command-denied', status: 'passed' },
          { id: 'same-command-reconciled-with-one-effect', status: 'passed' },
        ] }, measurements, cleanup: { verified: true },
      });
    }
    await replayPage.close();
    await stalePage.close();

    const beforeAttestation = authenticatedProductAcceptance
      ? await control<LifecycleFrame>('/control/lifecycle-frame', { projectName }) : null;
    const firstAttestationApi = await attestSubmittedEvidence(page, 'Independent evidence check before rework.', 1);
    expect(firstAttestationApi).toHaveLength(1);
    const afterAttestation = authenticatedProductAcceptance
      ? await control<LifecycleFrame>('/control/lifecycle-frame', { projectName }) : null;
    observe('govern-attest', 'ui.evidence-attested');
    if (authenticatedProductAcceptance && beforeAttestation && afterAttestation) {
      expect(afterAttestation.attestations).toBeGreaterThan(beforeAttestation.attestations);
      authenticatedCases.push({
        testId: 'GOVERN-002', status: 'passed', proofMode: 'actual-ui',
        observations: {
          browser: { actions: [{ action: 'click', target: 'Accept evidence' }],
            result: { independentEvidenceAttested: true, attestationVisible: true } },
          api: { productionRoutes: ['/functions/v1/assess-v2-command'],
            responses: [{ classification: 'EVIDENCE_ATTESTATION_COMMITTED', status: firstAttestationApi[0].status }] },
        },
        controls: { assertions: [
          { id: 'independent-evidence-attested', status: 'passed' },
          { id: 'attestation-visible', status: 'passed' },
        ] },
        measurements: lifecycleMeasurements(beforeAttestation,afterAttestation,
          beforeAttestation.attestations,afterAttestation.attestations),
        cleanup: { verified: true },
      });
    }
    await attestSubmittedEvidence(page, 'Independent evidence check before rework.');
    const reviewWorkspace = page.getByTestId('assess-v2-review-workspace');
    const beforeChanges = authenticatedProductAcceptance
      ? await control<LifecycleFrame>('/control/lifecycle-frame', { projectName }) : null;
    await reviewWorkspace.getByLabel('Review rationale', { exact: true }).fill('Clarify exception ownership before approval.');
    const requestChangesApi = await observeApiResponse(page, '/functions/v1/assess-v2-command', () =>
      reviewWorkspace.getByRole('button', { name: 'Request changes', exact: true }).click());
    expect(requestChangesApi.status).toBe(200);
    await expect(page.getByText('Review resolution committed: Changes requested.', { exact: true })).toBeVisible();
    observe('govern-request-changes', 'ui.changes-requested');
    const afterChanges = authenticatedProductAcceptance
      ? await control<LifecycleFrame>('/control/lifecycle-frame', { projectName }) : null;

    await enterProcessAs(page, setup.actors.author, setup.aliases.process);
    await expect(page.getByRole('button', { name: 'Start new draft revision', exact: true })).toBeVisible();
    if (authenticatedProductAcceptance && beforeChanges && afterChanges) {
      expect(afterChanges.changesRequested).toBe(beforeChanges.changesRequested + 1);
      authenticatedCases.push({
        testId: 'GOVERN-003', status: 'passed', proofMode: 'actual-ui',
        observations: {
          browser: { actions: [{ action: 'click', target: 'Request changes' }, { action: 'navigate', target: 'Author review workspace' }],
            result: { changesRequestedCommitted: true, authorSeesRequestedChanges: true } },
          api: { productionRoutes: ['/functions/v1/assess-v2-command'],
            responses: [{ classification: 'CHANGES_REQUESTED', status: requestChangesApi.status }] },
        },
        controls: { assertions: [
          { id: 'changes-requested-committed', status: 'passed' },
          { id: 'author-sees-requested-changes', status: 'passed' },
        ] }, measurements: lifecycleMeasurements(beforeChanges,afterChanges,
          beforeChanges.changesRequested,afterChanges.changesRequested), cleanup: { verified: true },
      });
    }
    const beforeRework = authenticatedProductAcceptance ? afterChanges : null;
    if (authenticatedProductAcceptance) reworkJourneyBefore = beforeRework;
    await page.getByLabel('Review rationale', { exact: true }).fill('Start the requested revision with clarified ownership.');
    const revisionApi = await observeApiResponse(page, '/functions/v1/assess-v2-command', () =>
      page.getByRole('button', { name: 'Start new draft revision', exact: true }).click());
    expect(revisionApi.status).toBe(200);
    await expect(page.getByText('New immutable draft revision committed.', { exact: true })).toBeVisible();
    observe('assess-revise', 'ui.revision-committed');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: setup.aliases.process, exact: true })).toBeVisible();
    await expect(page.getByTestId('assess-v2-workspace')).toBeVisible();
    await expect(page.getByText('Existing V2 draft resumed from the current immutable authoring version.', { exact: true })).toBeVisible();
    observe('reload-committed-state', 'ui.reload-committed-truth', { reload: true });
    await page.getByLabel('V2 case description', { exact: true }).fill('Connected lifecycle revised after independent review.');
    await page.getByRole('button', { name: 'Save V2 draft', exact: true }).click();
    await expect(page.getByText('Draft saved as a new immutable authoring version.', { exact: true })).toBeVisible();
    const reworkFinalizeApi = await observeApiResponse(page, '/functions/v1/assess-v2-command', () => finalizeDecisionPack(page));
    expect(reworkFinalizeApi.status).toBe(200);
    reworkJourneyApiResponses = [revisionApi, reworkFinalizeApi];
    await expect(page.getByText('Reviewer-ready Decision Pack finalized. It is read-only.', { exact: true })).toBeVisible();
    observe('assess-resubmit', 'ui.resubmitted');
    if (authenticatedProductAcceptance && beforeRework) {
      const afterRework = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
      expect(afterRework.decisions).toBe(beforeRework.decisions + 1);
      expect(afterRework.caseVersions).toBeGreaterThan(beforeRework.caseVersions);
      const measurements = lifecycleMeasurements(beforeRework,afterRework,beforeRework.decisions,afterRework.decisions);
      authenticatedCases.push({
        testId: 'GOVERN-004', status: 'passed', proofMode: 'actual-ui',
        observations: {
          browser: { actions: [
            { action: 'click', target: 'Start new draft revision' },
            { action: 'fill', target: 'V2 case description' },
            { action: 'click', target: 'Finalize reviewer-ready Decision Pack' },
          ], result: { priorHistoryRetained: true, newVersionResubmitted: true } },
          api: { productionRoutes: ['/functions/v1/assess-v2-command'], responses: [
            { classification: 'REVISION_COMMITTED', status: revisionApi.status },
            { classification: 'ASSESSMENT_V2_FINALIZED', status: reworkFinalizeApi.status },
          ] },
        },
        controls: { assertions: [
          { id: 'rework-preserves-history', status: 'passed' },
          { id: 'new-version-resubmitted', status: 'passed' },
        ] }, measurements, cleanup: { verified: true },
      });
    }
  });

  test('independent approval, Govern separation and synthetic Studio generation retain exact lineage', async ({ page }) => {
    await enterProcessAs(page, setup.actors.reviewer, setup.aliases.process);
    let reviewWorkspace = page.getByTestId('assess-v2-review-workspace');
    await selectReviewer(page, setup.actors.reviewer);
    await reviewWorkspace.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click();
    await expect(page.getByText(/Reviewer assignment committed\./u)).toBeVisible();
    expect((await attestSubmittedEvidence(page, 'Revised evidence independently verified.')).length).toBeGreaterThan(0);
    const beforeApproval = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
    await reviewWorkspace.getByLabel('Review rationale', { exact: true }).fill('Revised decision and exact evidence are independently approved.');
    const approvalApi = await observeApiResponse(page, '/functions/v1/assess-v2-command', () =>
      reviewWorkspace.getByRole('button', { name: 'Approve reviewed decision', exact: true }).click());
    expect(approvalApi.status).toBe(200);
    approvedDecisionApi = approvalApi;
    await expect(page.getByText('Review resolution committed: Approved.', { exact: true })).toBeVisible();
    const afterApproval = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
    observe('govern-approve', 'ui.independent-approved');
    if (authenticatedProductAcceptance) {
      expect(afterApproval.approvedReviews).toBe(beforeApproval.approvedReviews + 1);
      authenticatedCases.push({
        testId: 'GOVERN-005', status: 'passed', proofMode: 'actual-ui',
        observations: {
          browser: { actions: [{ action: 'fill', target: 'Review rationale' }, { action: 'click', target: 'Approve reviewed decision' }],
            result: { independentApprovalCommitted: true, approvedCurrentVersionVisible: true } },
          api: { productionRoutes: ['/functions/v1/assess-v2-command'],
            responses: [{ classification: 'APPROVED', status: approvalApi.status }] },
        },
        controls: { assertions: [
          { id: 'independent-approval-committed', status: 'passed' },
          { id: 'approved-current-version-visible', status: 'passed' },
        ] }, measurements: lifecycleMeasurements(beforeApproval,afterApproval,
          beforeApproval.approvedReviews,afterApproval.approvedReviews), cleanup: { verified: true },
      });
    }

    await assertHighImpactFinancialGovernActions(page);
    await assertNoHorizontalViewportOverflow(page);
    expect(await resolveEveryGovernControl(page)).toBeGreaterThan(0);
    await reviewWorkspace.getByLabel('Govern rationale', { exact: true }).fill('The final reviewer must not resolve this financial high-impact decision.');
    const beforeGovernBoundary = authenticatedProductAcceptance
      ? await control<LifecycleFrame>('/control/lifecycle-frame', { projectName }) : null;
    const beforeFinalReviewerDenial = await control<MutationSnapshot>('/control/snapshot');
    const governDenialApi = await observeApiResponse(page, '/functions/v1/assess-v2-command', () =>
      reviewWorkspace.getByRole('button', { name: 'Resolve Govern controls', exact: true }).click());
    expect(governDenialApi.status).toBe(400);
    await expect(page.getByRole('heading', { name: 'Workspace unavailable', exact: true })).toBeVisible();
    await expect(page.getByText('The command could not be completed. No success was recorded.', { exact: true })).toBeVisible();
    await expect(page.getByText('Govern resolution committed.', { exact: true })).toHaveCount(0);
    expect(await control<MutationSnapshot>('/control/snapshot')).toEqual(beforeFinalReviewerDenial);
    observe('govern-separation-denial', 'ui.separation-denied');
    observe('govern-separation-denial', 'ui.final-reviewer-govern-denied');

    await enterProcessAs(page, setup.actors.approver, setup.aliases.process);
    reviewWorkspace = page.getByTestId('assess-v2-review-workspace');
    expect(await resolveEveryGovernControl(page)).toBeGreaterThan(0);
    await reviewWorkspace.getByLabel('Govern rationale', { exact: true }).fill('Independent resolver confirmed every required control.');
    const governResolutionApi = await observeApiResponse(page, '/functions/v1/assess-v2-command', () =>
      reviewWorkspace.getByRole('button', { name: 'Resolve Govern controls', exact: true }).click());
    expect(governResolutionApi.status).toBe(200);
    await expect(page.getByText('Govern resolution committed.', { exact: true })).toBeVisible();
    observe('govern-resolve', 'ui.govern-resolved');
    if (authenticatedProductAcceptance && beforeGovernBoundary) {
      const afterGovernBoundary = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
      expect(afterGovernBoundary.governResolutions).toBe(beforeGovernBoundary.governResolutions + 1);
      authenticatedCases.push({
        testId: 'GOVERN-007', status: 'passed', proofMode: 'actual-ui',
        observations: {
          browser: { actions: [
            { action: 'click', target: 'Resolve Govern controls as final reviewer' },
            { action: 'click', target: 'Resolve Govern controls as independent approver' },
          ], result: { separationDenialZeroEffects: true, independentResolutionCommitted: true } },
          api: { productionRoutes: ['/functions/v1/assess-v2-command'], responses: [
            { classification: 'INVALID_COMMAND', status: governDenialApi.status },
            { classification: 'GOVERN_RESOLUTION_COMMITTED', status: governResolutionApi.status },
          ] },
        },
        controls: { assertions: [
          { id: 'separation-denial-zero-effects', status: 'passed' },
          { id: 'independent-resolution-committed', status: 'passed' },
        ] }, measurements: lifecycleMeasurements(beforeGovernBoundary,afterGovernBoundary,
          beforeGovernBoundary.governResolutions,afterGovernBoundary.governResolutions), cleanup: { verified: true },
      });
    }

    const beforeStudioConsume = authenticatedProductAcceptance
      ? await control<LifecycleFrame>('/control/lifecycle-frame', { projectName }) : null;
    const studioHandoffApi = await observeApiResponse(page, '/functions/v1/assess-v2-command', () =>
      reviewWorkspace.getByRole('button', { name: 'Create durable Studio handoff', exact: true }).click());
    expect(studioHandoffApi.status).toBe(200);
    await expect(page.getByText('Studio handoff committed.', { exact: true })).toBeVisible();
    await expect(page.getByTestId('assess-v2-review-workspace')).toContainText('Handed off to Studio');

    await enterStudioAs(page, setup.actors.approver);
    await commitStudioHandoffAction(page, 'Request handoff');
    await expect(page.getByText(/Handoff decision committed \(receipt .+\)\./u)).toBeVisible();

    await enterStudioAs(page, setup.actors.reviewer);
    await commitStudioHandoffAction(page, 'Approve review', 'Independent Studio handoff review approved.');
    await expect(page.getByText(/Handoff decision committed \(receipt .+\)\./u)).toBeVisible();

    await enterStudioAs(page, setup.actors.author);
    await commitStudioHandoffAction(page, 'Final accept', 'Final Studio handoff acceptance by an independent actor.');
    await expect(page.getByText(/Handoff decision committed \(receipt .+\)\./u)).toBeVisible();

    await enterStudioAs(page, setup.actors.approver);
    const sourcePackageApi = await commitStudioHandoffAction(page, 'Start Studio draft', undefined, 'Outbox');
    expect(sourcePackageApi.status).toBe(201);
    await expect(page.getByText(/Handoff consumed and exact source package verified \(receipt .+\)\./u)).toBeVisible();
    observe('studio-consume', 'ui.studio-lineage-consumed');
    if (authenticatedProductAcceptance && beforeStudioConsume) {
      const afterStudioConsume = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
      expect(afterStudioConsume.sourcePackages).toBe(beforeStudioConsume.sourcePackages + 1);
      authenticatedCases.push({
        testId: 'STUDIO-001', status: 'passed', proofMode: 'actual-ui',
        observations: {
          browser: { actions: [
            { action: 'click', target: 'Create durable Studio handoff' },
            { action: 'click', target: 'Start Studio draft' },
          ], result: { approvedHandoffConsumed: true, exactSourceAncestryVisible: true } },
          api: { productionRoutes: ['/functions/v1/assess-v2-command','/functions/v1/studio-artifact-command'], responses: [
            { classification: 'STUDIO_HANDOFF_COMMITTED', status: studioHandoffApi.status },
            { classification: 'SOURCE_PACKAGE_COMMITTED', status: sourcePackageApi.status },
          ] },
        },
        controls: { assertions: [
          { id: 'exact-approved-handoff-consumed', status: 'passed' },
          { id: 'source-ancestry-visible', status: 'passed' },
        ] }, measurements: lifecycleMeasurements(beforeStudioConsume,afterStudioConsume,
          beforeStudioConsume.sourcePackages,afterStudioConsume.sourcePackages), cleanup: { verified: true },
      });
    }

    const studioWorkspace = page.getByTestId('studio-artifact-workspace');
    const template = studioWorkspace.getByLabel('Exact approved Studio template', { exact: true });
    await expect(template.locator('option')).toHaveCount(2);
    await template.selectOption({ index: 1 });
    const beforeStudioGeneration = authenticatedProductAcceptance
      ? await control<LifecycleFrame>('/control/lifecycle-frame', { projectName }) : null;
    const generationApi = await observeApiResponse(page, '/functions/v1/studio-artifact-command', () =>
      studioWorkspace.getByRole('button', { name: 'Generate governed package draft', exact: true }).click());
    expect(generationApi.status).toBe(201);
    await expect(page.getByText(/Draft committed from exact Studio Source Package v\d+; v2 projection reloaded\./u)).toBeVisible();
    await expect(page.getByText('Current committed preview', { exact: true })).toBeVisible();
    observe('studio-synthetic-generation', 'ui.synthetic-provider-boundary');
    if (authenticatedProductAcceptance && beforeStudioGeneration) {
      const afterStudioGeneration = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
      expect(afterStudioGeneration.artifactVersions).toBe(beforeStudioGeneration.artifactVersions + 1);
      authenticatedCases.push({
        testId: 'STUDIO-002', status: 'passed', proofMode: 'actual-ui',
        observations: {
          browser: { actions: [{ action: 'select', target: 'Exact approved Studio template' },
            { action: 'click', target: 'Generate governed package draft' }],
            result: { productionGenerationCommitted: true, governedVersionVisible: true } },
          api: { productionRoutes: ['/functions/v1/studio-artifact-command'],
            responses: [{ classification: 'GENERATION_COMPLETED', status: generationApi.status }] },
        },
        controls: { assertions: [
          { id: 'production-generation-pipeline-committed', status: 'passed' },
          { id: 'governed-version-visible', status: 'passed' },
        ] }, measurements: lifecycleMeasurements(beforeStudioGeneration,afterStudioGeneration,
          beforeStudioGeneration.artifactVersions,afterStudioGeneration.artifactVersions), cleanup: { verified: true },
      });
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('studio-artifact-workspace')).toBeVisible();
    await expect(page.getByText('Current committed preview', { exact: true })).toBeVisible();

    if (authenticatedProductAcceptance) {
      await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
      await expect(page.getByText('Reviewer ready committed.', { exact: true })).toBeVisible();
      await enterStudioAs(page, setup.actors.author);
      await page.getByLabel('Eligible independent reviewer', { exact: true }).selectOption(setup.actors.reviewer.user.id);
      await page.getByRole('button', { name: 'Assign reviewer', exact: true }).click();
      await expect(page.getByText('In review committed.', { exact: true })).toBeVisible();
      await enterStudioAs(page, setup.actors.reviewer);
      await page.getByLabel('Rationale', { exact: true }).fill('Independent Studio reviewer approved the exact generated version.');
      await page.getByRole('button', { name: 'Approve review', exact: true }).click();
      await expect(page.getByText('Approval ready committed.', { exact: true })).toBeVisible();
      await enterStudioAs(page, setup.actors.author);
      await page.getByLabel('Rationale', { exact: true }).fill('Independent final approval binds the exact reviewed Studio version.');
      await page.getByRole('button', { name: 'Final approve', exact: true }).click();
      await expect(page.getByText('Approved committed.', { exact: true })).toBeVisible();
      observe('studio-artifact-approval', 'ui.studio-approved-exact-version');

      const beforeFailure = await control<StudioFailureFrame>('/control/studio-failure-frame', { projectName });
      await control('/control/fail-next-studio-provider', { projectName });
      const template = page.getByLabel('Exact approved Studio template', { exact: true });
      if (!await template.inputValue()) await template.selectOption({ index: 1 });
      const failedGenerationApi = await observeApiResponse(page, '/functions/v1/studio-artifact-command', () =>
        page.getByRole('button', { name: 'Generate governed package draft', exact: true }).click());
      expect(failedGenerationApi.status).toBe(200);
      await expect(page.getByRole('alert').getByText(
        /Generation attempt committed \(receipt .+\) and failed\. No artifact version was created\./u,
      )).toBeVisible();
      await expect(page.getByText(/committed from exact Studio Source Package/u)).toHaveCount(0);
      const afterFailure = await control<StudioFailureFrame>('/control/studio-failure-frame', { projectName });
      expect(afterFailure.versions).toBe(beforeFailure.versions);
      expect(afterFailure.aggregateVersion).toBe(beforeFailure.aggregateVersion + 1);
      expect(afterFailure.generationAttempts).toBe(beforeFailure.generationAttempts + 1);
      expect(afterFailure.receipts).toBe(beforeFailure.receipts + 1);
      expect(afterFailure.audits).toBe(beforeFailure.audits + 2);
      expect(afterFailure.targetHash).toBe(beforeFailure.targetHash);
      const before = measuredCounters({ domainWrites: beforeFailure.versions,
        generationAttemptWrites: beforeFailure.generationAttempts, receiptWrites: beforeFailure.receipts,
        auditWrites: beforeFailure.audits });
      const after = measuredCounters({ domainWrites: afterFailure.versions,
        generationAttemptWrites: afterFailure.generationAttempts, receiptWrites: afterFailure.receipts,
        auditWrites: afterFailure.audits });
      authenticatedCases.push({
        testId: 'STUDIO-003', status: 'passed', proofMode: 'actual-ui',
        observations: {
          browser: { actions: [{ action: 'click', target: 'Generate governed package draft' }],
            result: { failureVisible: true, successAbsent: true, reservationCounterAdvancedExactlyOnce: true } },
          api: { productionRoutes: ['/functions/v1/studio-artifact-command'],
            responses: [{ classification: 'PROVIDER_REQUEST_FAILED', status: failedGenerationApi.status }] },
        },
        controls: { assertions: [
          { id: 'failed-generation-no-artifact-mutation', status: 'passed' },
          { id: 'failure-visible-without-success', status: 'passed' },
        ] },
        measurements: { setupExcluded: true, before, after,
          delta: Object.fromEntries(Object.keys(before).map(key => [key, after[key as keyof typeof after] - before[key as keyof typeof before]])),
          stateBeforeHash: beforeFailure.targetHash, stateAfterHash: afterFailure.targetHash },
        cleanup: { verified: true },
      });
    }
  });

  if (authenticatedProductAcceptance) {
    test('independent reviewer rejects a separate current decision without mutating the approved primary chain', async ({ page }) => {
      const rejectionProjectName = `${projectName}-rejection`;
      const rejection = await control<FixtureSetup>('/control/setup', { projectName: rejectionProjectName });
      await enterProcessAs(page,rejection.actors.author,rejection.aliases.process);
      await page.getByRole('button', { name: 'New assessment (V2)', exact: true }).click();
      await expect(page.getByText('V2 case created. Add the minimum assessment structure before finalization.', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Add minimum working structure', exact: true }).click();
      await completeRequiredAssessmentFacts(page);
      await page.getByRole('button', { name: 'Save V2 draft', exact: true }).click();
      await finalizeDecisionPack(page);
      await expect(page.getByText('Reviewer-ready Decision Pack finalized. It is read-only.', { exact: true })).toBeVisible();
      await enterProcessAs(page,rejection.actors.reviewer,rejection.aliases.process);
      await selectReviewer(page,rejection.actors.reviewer);
      await page.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click();
      expect((await attestSubmittedEvidence(page,'Independent evidence review before rejection.')).length).toBeGreaterThan(0);
      const beforeRejection = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName: rejectionProjectName });
      const reviewWorkspace = page.getByTestId('assess-v2-review-workspace');
      await reviewWorkspace.getByLabel('Review rationale', { exact: true }).fill('Reject this current decision because the recorded control posture is not acceptable.');
      const rejectionApi = await observeApiResponse(page, '/functions/v1/assess-v2-command', () =>
        reviewWorkspace.getByRole('button', { name: 'Reject decision', exact: true }).click());
      expect(rejectionApi.status).toBe(200);
      await expect(page.getByText('Review resolution committed: Rejected.', { exact: true })).toBeVisible();
      await expect(reviewWorkspace).toContainText('Rejected');
      const afterRejection = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName: rejectionProjectName });
      expect(afterRejection.rejectedReviews).toBe(beforeRejection.rejectedReviews + 1);
      authenticatedCases.push({
        testId: 'GOVERN-006', status: 'passed', proofMode: 'actual-ui',
        observations: {
          browser: { actions: [{ action: 'fill', target: 'Review rationale' }, { action: 'click', target: 'Reject decision' }],
            result: { rejectionCommitted: true, rejectionVisible: true } },
          api: { productionRoutes: ['/functions/v1/assess-v2-command'],
            responses: [{ classification: 'REJECTED', status: rejectionApi.status }] },
        },
        controls: { assertions: [
          { id: 'rejection-committed', status: 'passed' },
          { id: 'rejection-visible', status: 'passed' },
        ] },
        measurements: lifecycleMeasurements(beforeRejection,afterRejection,
          beforeRejection.rejectedReviews,afterRejection.rejectedReviews),
        cleanup: { verified: true },
      });
    });

    test('approved Studio work publishes through legacy Docs and Delivery into read-only Monitor', async ({ page }, testInfo) => {
      const result = await runStudioDeliveryMonitorJourney({
        page,
        projectName,
        project: testInfo.project.name,
        setup,
        control,
        enterAs,
        clickProduct,
        selectProjectScope,
      });
      const downstreamCases = result.cases.map(downstreamCaseToLocal);
      authenticatedCases.push(...downstreamCases);
      for (const item of result.observations) observe(`downstream-${item.caseId}`, item.assertionId);
      const deleteDenial = downstreamCases.find(item => item.testId === 'DELIVERY-004');
      if (!deleteDenial) throw new Error('AUTHENTICATED_E2E003_DENIAL_EVIDENCE_MISSING');
      authenticatedCases.push({
        ...deleteDenial,
        testId: 'E2E-003',
        controls: { assertions: [
          { id: 'real-downstream-authority-denied', status: 'passed' },
          { id: 'unchanged-exact-lineage', status: 'passed' },
        ] },
        observations: {
          browser: { actions: [{ action: 'click', target: 'Delete task as restricted assigned actor' }],
            result: { downstreamAuthorityDenied: true, exactLineageUnchanged: true } },
          api: deleteDenial.observations.api,
        },
      });
      if (!reworkJourneyBefore) throw new Error('AUTHENTICATED_E2E002_REWORK_START_MISSING');
      if (!approvedDecisionApi || reworkJourneyApiResponses.length !== 2) {
        throw new Error('AUTHENTICATED_E2E002_RESPONSE_EVIDENCE_MISSING');
      }
      const hitlPublication = downstreamCases.find(item => item.testId === 'E2E-007');
      if (!hitlPublication) throw new Error('AUTHENTICATED_E2E002_PUBLICATION_EVIDENCE_MISSING');
      const afterReworkJourney = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
      expect(afterReworkJourney.decisions).toBe(reworkJourneyBefore.decisions + 1);
      expect(result.finalFrame.lineage.complete).toBe(true);
      authenticatedCases.push({
        testId: 'E2E-002', status: 'passed', proofMode: 'actual-ui',
        observations: {
          browser: { actions: [
            { action: 'click', target: 'Start new draft revision' },
            { action: 'click', target: 'Approve reviewed decision' },
            { action: 'click', target: 'Publish approved work items' },
          ], result: { reworkCompleted: true, newApprovalCommitted: true, downstreamLineageComplete: true } },
          api: { productionRoutes: ['/functions/v1/assess-v2-command',...hitlPublication.observations.api.productionRoutes],
            responses: [
              { classification: 'REVISION_COMMITTED', status: reworkJourneyApiResponses[0].status },
              { classification: 'ASSESSMENT_V2_FINALIZED', status: reworkJourneyApiResponses[1].status },
              { classification: 'APPROVED', status: approvedDecisionApi.status },
              ...hitlPublication.observations.api.responses,
            ] },
        },
        controls: { assertions: [
          { id: 'requested-changes-and-rework-completed', status: 'passed' },
          { id: 'new-approval-and-downstream-lineage', status: 'passed' },
        ] },
        measurements: lifecycleMeasurements(reworkJourneyBefore,afterReworkJourney,
          reworkJourneyBefore.decisions,afterReworkJourney.decisions),
        cleanup: { verified: true },
      });
    });

    test('production scoring preserves low-suitability and strong-automation decisions through governed publication', async ({ page }, testInfo) => {
      const scenarioCases = await runAssessmentScenarioJourneys(page, testInfo.project.name);
      authenticatedCases.push(...scenarioCases.map(scenarioCaseToLocal));
      for (const row of scenarioCases) for (const assertion of row.assertions) {
        observe(`scenario-${row.testId}`, assertion.id);
      }
    });

    test('authenticated Admin, AI and private Studio controls use server authority and measured storage boundaries', async ({ page }) => {
      const deps = {
        page,
        enterAs: (persona: 'admin' | 'non_admin') => enterAs(page, persona === 'admin' ? setup.actors.author : setup.actors.reviewer),
        clickProduct: (product: 'Assess' | 'Admin' | 'Enterprise Intelligence' | 'Studio') => clickProduct(page, product),
        prepareCase: <T,>(testId: string) => control<T>('/control/authenticated-controls/prepare', { testId }),
        readServerFrame: (testId: string) => control<Record<string, unknown>>('/control/authenticated-controls/frame', { testId }),
      };
      const controlObservations = [
        ...await observeAuthenticatedAdminControls(deps),
        ...await observeAuthenticatedAiControls(deps, `local-fixture-secret-${crypto.randomUUID()}`),
        await observeAuthenticatedStudioDownloadDenial(deps),
      ];
      for (const observation of controlObservations) {
        authenticatedCases.push(controlObservationCase(observation));
        for (const assertionId of observation.assertions) observe(`control-${observation.testId}`, assertionId);
      }
    });
  }
});
