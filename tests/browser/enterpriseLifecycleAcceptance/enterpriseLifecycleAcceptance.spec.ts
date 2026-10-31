import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { expect, type Page, type Request, type Response as PlaywrightResponse, test } from '@playwright/test';
import {
  authenticatedLifecycleClickProduct as clickProduct,
  authenticatedLifecycleControl as control,
  authenticatedLifecycleAttemptUnauthorizedProcessUpdate as attemptUnauthorizedProcessUpdate,
  authenticatedLifecycleEnterAs as enterAs,
  authenticatedLifecycleEnterStudioAs as enterStudioAs,
  authenticatedLifecycleCommitEligibleStudioHandoffRequest as commitEligibleStudioHandoffRequest,
  authenticatedLifecycleCommitPersistedStudioHandoffAction as commitPersistedStudioHandoffAction,
  authenticatedLifecycleConsumeApprovedStudioHandoff as consumeApprovedStudioHandoff,
  authenticatedLifecycleOpenConnectedProcess as openConnectedProcess,
  authenticatedLifecycleSelectProjectScope as selectProjectScope,
  authenticatedLifecyclePersistedHandoffTargetFromResponse as persistedHandoffTargetFromResponse,
  authenticatedLifecycleValidateSetupLabels as validateSetupLabels,
  authenticatedLifecycleSelectExactStudioTemplate as selectExactStudioTemplate,
  createAuthenticatedLifecycleWorkQueue,
  authenticatedHostedActionIds,
  type AuthenticatedLifecycleActor as FixtureActor,
  type AuthenticatedLifecycleSetup as FixtureSetup,
} from '../authenticatedLifecycleHarness';
import { runStudioDeliveryMonitorJourney, type StudioDeliveryMonitorCaseResult,
  type StudioDeliveryDownstreamFrame } from './studioDeliveryMonitorJourney';
import { runAssessmentScenarioJourneys } from './assessmentScenarioJourneys';
import { runV1AssessmentCompletion } from './v1AssessmentCompletion';
import { runCanonicalInvoiceExceptionJourney } from './canonicalInvoiceExceptionJourney';
import { exerciseReviewerGovernDenial } from './governReviewerDenial';
import { attestSubmittedEvidence } from './evidenceAttestation';
import { AuthenticatedHostedBrowserActionTracker } from '../../../scripts/authenticatedHostedBrowserRequestClassifier.mjs';
import {
  primeV2FullPrefixFixtureSession,
  resolveV2FullPrefixLocalSelection,
} from '../../../scripts/v2FullPrefixReproduction.mjs';
import {
  observeAuthenticatedAdminControls,
  observeAuthenticatedAiControls,
  observeAuthenticatedStudioDownloadDenial,
} from '../authenticatedControlsAcceptance';
import {
  authenticatedHostedClosePageAfterOwnedNetwork,
  authenticatedHostedConfigureChromiumDurableResponseBodies,
  authenticatedLifecycleSettleCheckpointBoundary as settleCheckpointBoundary,
  authenticatedLifecycleSettleActorNavigationBoundary as settleActorNavigationBoundary,
  installAuthenticatedHostedNetwork,
} from '../authenticatedHostedNetwork';
import {
  assertV2ReloadCheckpointResponse,
  createV2ReloadBrowserCheckpointBuilder,
  installV2ReloadReadObserver,
  observeV2ReloadBrowserState,
  observeV2ReloadRenderOutcome,
  resolveAuthenticatedAcceptanceMode,
  type V2ReloadBrowserStateObservation,
  type V2ReloadDiagnosticCheckpointResponse,
  type V2ReloadReadObserverCompletion,
  type V2ReloadReadStageObservation,
  type V2ReloadRenderOutcome,
} from '../v2ReloadDiagnosticObserver';
import { createEligibleReviewerRequestDiagnostics } from '../eligibleReviewerRequestDiagnostics';
import { ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTIC_ATTACHMENT } from '../../../scripts/eligibleReviewerRequestDiagnostic.mjs';

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
type HostedActionReference = Promise<string | null>;
type ApiResponseObservation = Readonly<{
  route: string;
  status: number;
  errorCode?: string;
  actionId: HostedActionReference;
}>;
type V2FullPrefixReproductionVariant = 'immediate' | 'barrier';
const V2_FULL_PRIMARY_EXPECTED_CASE_IDS = Object.freeze([
  'ASSESS-002', 'ASSESS-003', 'ASSESS-018', 'ASSESS-019', 'ASSESS-020', 'E2E-004',
  'GOVERN-001', 'GOVERN-002', 'GOVERN-003', 'GOVERN-004',
  'SAFETY-001', 'SAFETY-002', 'SAFETY-003',
] as const);
type V2FullPrefixReproductionObservation = Readonly<{
  scope: 'desktop-primary-lifecycle';
  variant: V2FullPrefixReproductionVariant;
  navigation: 'passed' | 'failed';
  renderOutcome: V2ReloadRenderOutcome;
  observerFailure: boolean;
  serverContextObserved: boolean;
  sessionObserved: boolean;
  scopeNavigationObserved: boolean;
  processNavigationObserved: boolean;
  readStages: readonly V2ReloadReadStageObservation[];
  barrier: 'none' | 'lifecycle-frame';
  diagnosticCheckpointEquivalent: false;
  lifecycleFrameCaptured: boolean;
  deliveryTaskBodyPending: boolean;
  processVisibleWhileDeliveryPending: boolean;
  v2VisibleWhileDeliveryPending: boolean;
  deliveryPendingFrameStable: boolean;
  caseDelta: number | null;
  caseVersionDelta: number | null;
  failureStage: 'navigation' | 'render' | 'read-observer' | 'browser-state' | 'network-queue'
    | 'lifecycle-frame' | 'assertion' | null;
  primaryCompletion: Readonly<{
    status: 'passed' | 'failed';
    terminalCaseId: 'GOVERN-004' | null;
    lifecycleFrameCaptured: boolean;
    caseIds: readonly string[];
  }>;
}>;
type V2FullPrefixQueueObservation = Readonly<{
  network: 'not_run' | 'passed' | 'failed';
  cases: 'not_run' | 'passed' | 'failed';
}>;
type NativeDeliveryStreamStats = Readonly<{
  stream: Readonly<{
    resource: string;
    mode: 'hold-headers' | 'hold-body';
    entered: boolean;
    held: boolean;
  }> | null;
}>;
let hostedBrowserActionTracker: AuthenticatedHostedBrowserActionTracker | null = null;
const actionReference = (request: Request): HostedActionReference => controllerBackedAcceptance
  ? hostedBrowserActionTracker?.reference(request)
    ?? Promise.reject(new Error('AUTHENTICATED_BROWSER_ACTION_TRACKER_MISSING'))
  : Promise.resolve(null);

const outputDirectory = process.env.ENTERPRISE_LIFECYCLE_OUTPUT_DIR
  ?? path.join('output', 'acceptance', 'enterprise-lifecycle');
const authenticatedProductAcceptance = process.env.ENTERPRISE_LIFECYCLE_AUTHENTICATED === 'true';
const hostedAuthenticatedAcceptance = process.env.ENTERPRISE_LIFECYCLE_HOSTED_REAL_AUTH === 'true';
const authenticatedAcceptanceMode = resolveAuthenticatedAcceptanceMode(process.env.AUTHENTICATED_ACCEPTANCE_MODE);
const v2PrimaryPrefixDiagnostic = authenticatedAcceptanceMode === 'v2_primary_prefix_diagnostic';
const reviewerSelectionDiagnostic = authenticatedAcceptanceMode === 'reviewer_selection_diagnostic';
const governStudioDiagnostic = authenticatedAcceptanceMode === 'govern_studio_diagnostic';
const v2FullPrefixReproductionVariant = resolveV2FullPrefixLocalSelection({
  variant: process.env.ENTERPRISE_LIFECYCLE_V2_FULL_PREFIX_REPRODUCTION,
  authenticated: authenticatedProductAcceptance,
  hosted: hostedAuthenticatedAcceptance,
  mode: authenticatedAcceptanceMode,
});
const v2FullPrefixReproduction = v2FullPrefixReproductionVariant !== null;
const canonicalInvoiceExceptionJourney = process.env.ENTERPRISE_LIFECYCLE_CANONICAL_AP_INVOICE_EXCEPTION === '1';
const controllerBackedAcceptance = hostedAuthenticatedAcceptance || v2FullPrefixReproduction || governStudioDiagnostic;
if ((v2PrimaryPrefixDiagnostic || reviewerSelectionDiagnostic || governStudioDiagnostic)
  && (!authenticatedProductAcceptance || !hostedAuthenticatedAcceptance)) {
  throw new Error('AUTHENTICATED_FOCUSED_DIAGNOSTIC_HOSTED_AUTH_REQUIRED');
}
const hostedAllowedOrigins = new Set([
  process.env.ENTERPRISE_LIFECYCLE_APP_BASE_URL,
  process.env.ENTERPRISE_LIFECYCLE_API_BASE_URL,
  process.env.AUTHENTICATED_ACCEPTANCE_SUPABASE_URL,
].filter((value): value is string => !!value).map(value => new URL(value).origin));
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
  captureErrorCode = false,
): Promise<ApiResponseObservation> => {
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === route, { timeout: 15_000 });
  await action();
  const response = await responsePromise;
  const responseBody = captureErrorCode ? await response.json().catch(() => null) as unknown : null;
  const errorCode = responseBody && typeof responseBody === 'object' && !Array.isArray(responseBody)
    && (responseBody as { error?: unknown }).error
    && typeof (responseBody as { error: { code?: unknown } }).error.code === 'string'
    ? (responseBody as { error: { code: string } }).error.code
    : undefined;
  return { route, status: response.status(), ...(errorCode ? { errorCode } : {}),
    actionId: actionReference(response.request()) };
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
  return { route, status: 0, actionId: actionReference(request) };
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
  'AI-006': { action: 'inspect', target: 'authenticated function traffic and browser storage', route: '/functions/v1/enterprise-intelligence-query' },
  'STUDIO-007': { action: 'inspect and request', target: 'Studio download availability and authenticated denial', route: '/functions/v1/studio-artifact-download' },
});
const controlObservationCase = (observation: {
  testId: string;
  status: 'observed' | 'blocked';
  proofMode: 'actual-ui' | 'not-run';
  assertions: string[];
  missingAssertions: string[];
  server?: Record<string, any>;
  api?: { route: string; status: number; actionId: HostedActionReference };
}) => {
  const measured = observation.server?.measured;
  const before = measuredCounters(measured?.before ?? {});
  const after = measuredCounters(measured?.after ?? {});
  const action = controlCaseAction[observation.testId];
  if (!action || observation.api?.route !== action.route || !Number.isInteger(observation.api.status)) {
    throw new Error(`AUTHENTICATED_CONTROL_API_OBSERVATION_MISSING:${observation.testId}`);
  }
  const result={
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
  Object.defineProperty(result,authenticatedHostedActionIds,{value:[observation.api.actionId]});
  return result;
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
  const result={
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
  Object.defineProperty(result,authenticatedHostedActionIds,{value:
    (row as unknown as Record<symbol,HostedActionReference[]>)[authenticatedHostedActionIds]??[]});
  return result;
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
  const result={
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
  Object.defineProperty(result,authenticatedHostedActionIds,{value:
    (row as unknown as Record<symbol,HostedActionReference[]>)[authenticatedHostedActionIds]??[]});
  return result;
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

const enterProcessAs = async (
  page: Page,
  actor: FixtureActor,
  processLabel: string,
  beforeActorNavigation: () => Promise<void> = async () => undefined,
) => {
  if (v2FullPrefixReproduction) {
    await primeV2FullPrefixFixtureSession(
      page,
      actor,
      process.env.ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY ?? 'sb-127-auth-token',
    );
  }
  await enterAs(page, actor, beforeActorNavigation);
  if (!(await page.getByRole('heading', { name: 'Process Catalog', exact: true }).isVisible().catch(() => false))) {
    await clickProduct(page, 'Assess');
  }
  return openConnectedProcess(page, processLabel);
};

const selectReviewer = async (page: Page, actor: FixtureActor) => {
  const select = page.getByLabel('Eligible reviewer', { exact: true });
  await expect(select).toBeVisible();
  await select.selectOption(actor.user.id);
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
  const action = canonicalInvoiceExceptionJourney ? 'Post approved invoice exception disposition' : 'Post financial decision';
  await expect(actionBoundaries.getByText(`approval-bound · write with controls: ${action}`, { exact: true })).toHaveCount(1);
  await expect(actionBoundaries.getByText(`prohibited · autonomous financial action: ${action}`, { exact: true })).toHaveCount(1);
};

const assertNoHorizontalViewportOverflow = async (page: Page) => {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    contentWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.contentWidth, 'populated lifecycle workspace must fit the desktop and Pixel 7 viewports')
    .toBeLessThanOrEqual(dimensions.viewportWidth + 1);
};

const observeStudioHandoffResponse = (response: PlaywrightResponse): ApiResponseObservation => ({
  route: '/functions/v1/studio-artifact-command',
  status: response.status(),
  actionId: actionReference(response.request()),
});

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
  if (canonicalInvoiceExceptionJourney) {
    await page.getByLabel('Primitive 1 name', { exact: true }).fill('Resolve AP invoice exception');
    await page.getByLabel('Primitive 1 description', { exact: true }).fill(
      'Assess unmatched, duplicate, tax, quantity and tolerance exceptions before financial release.',
    );
  }
  await page.getByLabel('Primitive 1 primitive.rulesStable', { exact: true }).selectOption('true');
  await page.getByText('3. Applications and interactions', { exact: true }).click();
  if (canonicalInvoiceExceptionJourney) {
    await page.getByLabel('Application 1 name', { exact: true }).fill('Synthetic accounts payable ledger');
  }
  await page.getByLabel('Application 1 strategic lifespan', { exact: true }).selectOption('short');
  await page.getByLabel('Application 1 accountable owner', { exact: true }).fill(
    canonicalInvoiceExceptionJourney ? 'Accounts payable operations owner' : 'Lifecycle operations owner',
  );
  const interaction = page.getByRole('group', { name: 'Interaction 1', exact: true });
  await interaction.getByLabel('Interaction 1 operation name', { exact: true }).fill(
    canonicalInvoiceExceptionJourney ? 'Post approved invoice exception disposition' : 'Post financial decision',
  );
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
  let v2FullPrefixObservation: V2FullPrefixReproductionObservation | null = null;
  const canonicalRepresentativeOutputs: string[] = [];
  let v2FullPrefixQueues: V2FullPrefixQueueObservation = Object.freeze({ network: 'not_run', cases: 'not_run' });
  type TestWorkQueues = Readonly<{
    network: ReturnType<typeof createAuthenticatedLifecycleWorkQueue>;
    cases: ReturnType<typeof createAuthenticatedLifecycleWorkQueue>;
  }>;
  let activeTestWorkQueues: TestWorkQueues | null = null;
  let activeNetworkLifecycle: Awaited<ReturnType<typeof installAuthenticatedHostedNetwork>> | null = null;
  let eligibleReviewerRequestDiagnostics: ReturnType<typeof createEligibleReviewerRequestDiagnostics> | null = null;
  const activeTrackedActionIds = new Set<string>();
  let pendingTrackedActionStarts = 0;
  const projectWorkQueues: TestWorkQueues[] = [];
  const queueNetworkAction = (operation: () => Promise<unknown>) => {
    if (!activeTestWorkQueues) throw new Error('AUTHENTICATED_BROWSER_ACTION_TRACKER_MISSING');
    activeTestWorkQueues.network.enqueue(operation);
  };
  const settleActorTransitionEvidence = async () => {
    if (!activeNetworkLifecycle || !activeTestWorkQueues) {
      throw new Error('AUTHENTICATED_BROWSER_ACTION_TRACKER_MISSING');
    }
    // Canonical navigation also owns native legacy reads started by global
    // providers. Count them inside the unchanged 15-second boundary so refresh
    // cannot cancel an untracked REST read. Normal V2 probes retain their lifecycle.
    let canonicalNativeReads = 0;
    await test.step('hosted:actor-boundary', () => settleActorNavigationBoundary({
      settleActionAdmissions: activeNetworkLifecycle.settleActionAdmissions,
      settleResponseBodies: async () => {
        await activeNetworkLifecycle!.settleResponseBodies();
        if (canonicalInvoiceExceptionJourney) {
          const stats = await control<{ active: number; cancelled: number; failed: number }>('/control/native-postgrest-stats', { projectName });
          expect(Number.isSafeInteger(stats.active) && stats.active >= 0).toBe(true);
          expect(stats.cancelled, 'CANONICAL_NATIVE_READ_CANCELLED_BEFORE_BOUNDARY').toBe(0);
          expect(stats.failed, 'CANONICAL_NATIVE_READ_FAILED_BEFORE_BOUNDARY').toBe(0);
          canonicalNativeReads = stats.active;
        }
      },
      drainNetworkActions: activeTestWorkQueues.network.drain,
      activeActionCount: () => pendingTrackedActionStarts + activeTrackedActionIds.size + canonicalNativeReads,
      runPhase: (phase, operation) => test.step(`hosted:actor-phase:${phase}`, operation),
    }));
  };
  const closePageAfterOwnedNetwork = (ownedPage: Page) => authenticatedHostedClosePageAfterOwnedNetwork({
    settleOwnedNetwork: settleActorTransitionEvidence,
    closePage: () => ownedPage.close(),
  });
  const explicitCaseActions = new Map<string, HostedActionReference[]>();
  const bindObservedCase = (testId: string,...actions: HostedActionReference[]) => {
    if(actions.length===0)throw new Error(`AUTHENTICATED_BROWSER_ACTION_CONTRACT_MISSING:${testId}`);
    explicitCaseActions.set(testId,actions);
  };
  const caseActionReferences=(row: unknown): HostedActionReference[] =>
    (row as Record<string | symbol,unknown>)[authenticatedHostedActionIds] as HostedActionReference[]??[];
  const startProductAction = (request: Request) => {
    if (!hostedBrowserActionTracker) throw new Error('AUTHENTICATED_BROWSER_ACTION_TRACKER_MISSING');
    return hostedBrowserActionTracker.begin(request);
  };
  const finishProductAction = (request: Request, status: number, responseBody: unknown) => {
    if (!hostedBrowserActionTracker) throw new Error('AUTHENTICATED_BROWSER_ACTION_TRACKER_MISSING');
    queueNetworkAction(() => hostedBrowserActionTracker!.finish(request, status, responseBody));
  };
  const prepareProductFaultRoute = async (
    route: import('@playwright/test').Route,
    prepare: () => Promise<void>,
  ) => {
    const owningTestWorkQueues = activeTestWorkQueues;
    if (!owningTestWorkQueues) {
      await route.abort('failed').catch(() => undefined);
      throw new Error('AUTHENTICATED_BROWSER_ACTION_TRACKER_MISSING');
    }
    try {
      await prepare();
      return true;
    } catch (error) {
      await route.abort('failed').catch(() => undefined);
      const failure = error instanceof Error
        && /^(?:ENTERPRISE_LIFECYCLE_BROWSER_CONTROL|AUTHENTICATED_BROWSER_)[A-Z0-9_]*$/u.test(error.message)
        ? error : new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_REJECTED');
      owningTestWorkQueues.network.enqueue(async () => { throw failure; });
      return false;
    }
  };
  class AuthenticatedCaseCollector extends Array<unknown> {
    pushWithActions(row: Record<string | symbol, unknown>, ...actions: ApiResponseObservation[]) {
      Object.defineProperty(row, authenticatedHostedActionIds, { value: actions.map(item => item.actionId) });
      return this.push(row);
    }
    override push(...items: unknown[]) {
      const length = super.push(...items);
      if (controllerBackedAcceptance && !v2PrimaryPrefixDiagnostic) {
        for (const row of items) {
          const testId=(row as any)?.testId;
          if (canonicalInvoiceExceptionJourney
            && (typeof testId !== 'string'
              || !(V2_FULL_PRIMARY_EXPECTED_CASE_IDS as readonly string[]).includes(testId))) {
            explicitCaseActions.delete(testId);
            continue;
          }
          const owningTestWorkQueues = activeTestWorkQueues;
          if (!owningTestWorkQueues) throw new Error('AUTHENTICATED_BROWSER_ACTION_TRACKER_MISSING');
          const explicit=explicitCaseActions.get(testId);
          if(explicit){Object.defineProperty(row as object,authenticatedHostedActionIds,{value:explicit});explicitCaseActions.delete(testId);}
          owningTestWorkQueues.cases.enqueue(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
            await test.step('hosted:queue:network-drain', () => owningTestWorkQueues.network.drain());
            const references=(row as Record<string | symbol, unknown>)[authenticatedHostedActionIds];
            if(!Array.isArray(references)||references.length===0)throw new Error(`AUTHENTICATED_BROWSER_ACTION_CONTRACT_MISSING:${(row as any)?.testId??'unknown'}`);
            const actionIds=[...new Set((await Promise.all(references as HostedActionReference[])).filter((item): item is string=>!!item))];
            if(actionIds.length===0)throw new Error(`AUTHENTICATED_BROWSER_ACTION_BINDING_MISSING:${(row as any)?.testId??'unknown'}`);
            return control('/control/browser-case', { projectName, row, actionIds });
          });
        }
      }
      return length;
    }
  }
  const authenticatedCases: unknown[] = new AuthenticatedCaseCollector();
  const stages = new Map<string, ObservedStage>();
  const assertions = new Map<string, Readonly<{ id: string; observed: true }>>();
  const observe = (stageId: string, assertionId: string, options: { reload?: boolean } = {}) => {
    stages.set(stageId, { id: stageId, uiObserved: true, ...(options.reload ? { reloadObserved: true } : {}) });
    assertions.set(assertionId, { id: assertionId, observed: true });
  };

  test.beforeAll(async ({}, testInfo) => {
    projectName = v2FullPrefixReproductionVariant
      ? `${testInfo.project.name}-${v2FullPrefixReproductionVariant}`
      : testInfo.project.name;
    projectStartedAt = new Date().toISOString();
    try { setup = await control<FixtureSetup>('/control/setup', { projectName }); }
    catch (error) { failed = true; throw error; }
    expect(setup.journeyBinding).toMatch(/^sha256:[a-f0-9]{64}$/u);
    if (canonicalInvoiceExceptionJourney) {
      expect(hostedAuthenticatedAcceptance).toBe(false);
      expect(setup.projectName).toBe(projectName);
      expect(setup.aliases.process).toBe(`${projectName} prerequisite process`);
      expect(setup.deliveryProject.name).toBe('AP Invoice Exception Workflow');
    } else validateSetupLabels(setup, projectName, hostedAuthenticatedAcceptance);
    for (const key of ['case', 'review', 'handoff', 'artifact'] as const) expect(setup.aliases[key]).toMatch(new RegExp(`^primary-${key}-\\d+$`, 'u'));
    if (controllerBackedAcceptance) {
      const backendOrigin = new URL(hostedAuthenticatedAcceptance
        ? process.env.AUTHENTICATED_ACCEPTANCE_SUPABASE_URL ?? ''
        : process.env.ENTERPRISE_LIFECYCLE_API_BASE_URL ?? '').origin;
      const appOrigin = new URL(process.env.ENTERPRISE_LIFECYCLE_APP_BASE_URL ?? '').origin;
      hostedBrowserActionTracker = new AuthenticatedHostedBrowserActionTracker({ backendOrigin, appOrigin,
        startAction: async input => {
          pendingTrackedActionStarts += 1;
          try {
            const result = await control<{ actionId: string }>('/control/browser-action-start', { projectName, ...input });
            if (activeTrackedActionIds.has(result.actionId)) {
              throw new Error('AUTHENTICATED_BROWSER_ACTION_START_REJECTED');
            }
            activeTrackedActionIds.add(result.actionId);
            return result;
          } finally {
            pendingTrackedActionStarts -= 1;
          }
        },
        ...(hostedAuthenticatedAcceptance ? { prepareAction: async input =>
          control<{ preparationId: string; responseDigest: string }>('/control/browser-action-prepare', {
            projectName, ...input,
          }) } : {}),
        finishAction: async input => {
          if (!activeTrackedActionIds.has(input.actionId)) {
            throw new Error('AUTHENTICATED_BROWSER_ACTION_START_MISSING');
          }
          await control('/control/browser-action', { projectName, ...input });
          activeTrackedActionIds.delete(input.actionId);
        },
      });
    }
  });

  test.beforeEach(async ({ context, page }, testInfo) => {
    test.skip((v2PrimaryPrefixDiagnostic || v2FullPrefixReproduction)
      && !testInfo.tags.includes('@v2-primary-prefix-diagnostic'),
    'focused V2 execution runs only the original Desktop primary prefix');
    test.skip(reviewerSelectionDiagnostic && !testInfo.tags.includes('@reviewer-selection-diagnostic'),
    'focused reviewer selection execution runs only the standalone Desktop diagnostic');
    test.skip(!reviewerSelectionDiagnostic && testInfo.tags.includes('@reviewer-selection-diagnostic'),
    'standalone reviewer selection diagnostic is excluded from ordinary acceptance');
    test.skip(governStudioDiagnostic && !testInfo.tags.includes('@govern-studio-diagnostic'),
    'focused Govern and Studio execution runs only the two bounded Desktop lifecycle tests');
    if (controllerBackedAcceptance) {
      await authenticatedHostedConfigureChromiumDurableResponseBodies(context, page);
    }
    externalRequests = [];
    const owningTestWorkQueues = Object.freeze({
      network: createAuthenticatedLifecycleWorkQueue(),
      cases: createAuthenticatedLifecycleWorkQueue(),
    });
    activeTestWorkQueues = owningTestWorkQueues;
    projectWorkQueues.push(owningTestWorkQueues);
    eligibleReviewerRequestDiagnostics = null;
    if (controllerBackedAcceptance) {
      const backendOrigin = new URL(hostedAuthenticatedAcceptance
        ? process.env.AUTHENTICATED_ACCEPTANCE_SUPABASE_URL ?? ''
        : process.env.ENTERPRISE_LIFECYCLE_API_BASE_URL ?? '').origin;
      eligibleReviewerRequestDiagnostics = createEligibleReviewerRequestDiagnostics({ backendOrigin });
      eligibleReviewerRequestDiagnostics.registerPage(page);
    }
    activeNetworkLifecycle = await installAuthenticatedHostedNetwork({
      context,
      hosted: controllerBackedAcceptance,
      allowedOrigins: hostedAllowedOrigins,
      tracker: hostedBrowserActionTracker,
      queueNetworkAction: (operation, ownedWork) => owningTestWorkQueues.network.enqueue(operation, ownedWork),
      onExternalRequest: origin => {
        nonLoopbackRequests += 1;
        externalRequests.push(origin);
      },
      onHttpRequest: () => { observedHttpRequests += 1; },
      onTrackerError: error => owningTestWorkQueues.network.enqueue(async () => { throw error; }),
      requestDiagnostics: eligibleReviewerRequestDiagnostics,
    });
  });

  test.afterEach(async ({}, testInfo) => {
    const owningTestWorkQueues = activeTestWorkQueues;
    const owningNetworkLifecycle = activeNetworkLifecycle;
    let boundaryFailure: unknown = null;
    let hasBoundaryFailure = false;
    const retainBoundaryFailure = (error: unknown) => {
      if (!hasBoundaryFailure) { hasBoundaryFailure = true; boundaryFailure = error; }
    };
    if (owningTestWorkQueues && owningNetworkLifecycle) {
      if (canonicalInvoiceExceptionJourney) {
        try { await settleActorTransitionEvidence(); } catch (error) { retainBoundaryFailure(error); }
      }
      await new Promise(resolve => setTimeout(resolve, 0));
      await test.step('hosted:queue:teardown', async () => {
        try {
          await settleActorNavigationBoundary({
            settleActionAdmissions: owningNetworkLifecycle.settleActionAdmissions,
            settleResponseBodies: owningNetworkLifecycle.settleResponseBodies,
            drainNetworkActions: () => test.step('hosted:queue:network-drain', () => owningTestWorkQueues.network.drain()),
            activeActionCount: () => pendingTrackedActionStarts + activeTrackedActionIds.size,
          });
        } catch (error) { retainBoundaryFailure(error); }
        try { await test.step('hosted:queue:case-drain', () => owningTestWorkQueues.cases.drain()); }
        catch (error) { retainBoundaryFailure(error); }
      });
    }
    if (hasBoundaryFailure) failed = true;
    if (testInfo.status !== testInfo.expectedStatus) failed = true;
    let externalRequestFailure: unknown = null;
    try { expect(externalRequests, 'the connected acceptance browser must not make external requests').toEqual([]); }
    catch (error) { failed = true; externalRequestFailure = error; }
    if (hasBoundaryFailure) throw boundaryFailure;
    if (externalRequestFailure) throw externalRequestFailure;
  });

  test.afterAll(async () => {
    if (!setup || !projectName || !projectStartedAt) return;
    let boundaryFailure: unknown = null;
    let hasBoundaryFailure = false;
    let reproductionNetworkQueue: V2FullPrefixQueueObservation['network'] = 'not_run';
    let reproductionCaseQueue: V2FullPrefixQueueObservation['cases'] = 'not_run';
    for (const workQueues of projectWorkQueues) {
      await test.step('hosted:queue:teardown', async () => {
        for (const [title, queue] of [
          ['hosted:queue:network-drain', workQueues.network],
          ['hosted:queue:case-drain', workQueues.cases],
        ] as const) {
          try {
            await test.step(title, () => queue.drain());
            if (v2FullPrefixReproduction) {
              if (title.includes('network') && reproductionNetworkQueue !== 'failed') reproductionNetworkQueue = 'passed';
              else if (!title.includes('network') && reproductionCaseQueue !== 'failed') reproductionCaseQueue = 'passed';
            }
          }
          catch (error) {
            if (v2FullPrefixReproduction) {
              if (title.includes('network')) reproductionNetworkQueue = 'failed';
              else reproductionCaseQueue = 'failed';
            }
            if (!hasBoundaryFailure) { hasBoundaryFailure = true; boundaryFailure = error; }
          }
        }
      });
    }
    if (v2FullPrefixReproduction) {
      v2FullPrefixQueues = Object.freeze({ network: reproductionNetworkQueue, cases: reproductionCaseQueue });
    }
    if (hasBoundaryFailure) failed = true;
    if (v2PrimaryPrefixDiagnostic || reviewerSelectionDiagnostic || governStudioDiagnostic) {
      if (hasBoundaryFailure) throw boundaryFailure;
      return;
    }
    if (!failed && !v2FullPrefixReproduction) {
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
      ...(v2FullPrefixObservation ? { v2FullPrefixReproduction: {
        ...v2FullPrefixObservation,
        queues: v2FullPrefixQueues,
      } } : {}),
    };
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, `browser-${projectName}.json`), `${JSON.stringify(fragment, null, 2)}\n`, 'utf8');
    if (hasBoundaryFailure) throw boundaryFailure;
  });

  test('selects the exact eligible reviewer, commits, replays and rejects a stale review command',
    { tag: '@reviewer-selection-diagnostic' }, async ({ page, context }) => {
    await enterProcessAs(page, setup.actors.author, setup.aliases.process, settleActorTransitionEvidence);
    const created = await observeApiResponse(page, '/functions/v1/assess-v2-command', () =>
      page.getByRole('button', { name: 'New assessment (V2)', exact: true }).click());
    expect(created.status).toBe(200);
    await page.getByRole('button', { name: 'Add minimum working structure', exact: true }).click();
    await completeRequiredAssessmentFacts(page);
    await page.getByRole('button', { name: 'Save V2 draft', exact: true }).click();
    await expect(page.getByText('Draft saved as a new immutable authoring version.', { exact: true })).toBeVisible();
    const finalized = await observeApiResponse(page, '/functions/v1/assess-v2-command', () => finalizeDecisionPack(page));
    expect(finalized.status).toBe(200);
    await expect(page.getByText('Reviewer-ready Decision Pack finalized. It is read-only.', { exact: true })).toBeVisible();

    let candidateProofRecorded = false;
    await page.route('**/rest/v1/rpc/assess_v2_eligible_reviewers', async route => {
      if (!candidateProofRecorded) {
        const headers = await route.request().allHeaders();
        const result = await control<{ recorded: true; candidateCount: 1 }>('/control/reviewer-selection-candidates', {
          projectName,
          accessToken: (headers.authorization ?? '').replace(/^Bearer\s+/iu, ''),
        });
        expect(result).toEqual({ recorded: true, candidateCount: 1 });
        candidateProofRecorded = true;
      }
      await route.fallback();
    });
    const replayPage = await context.newPage();
    const stalePage = await context.newPage();
    await authenticatedHostedConfigureChromiumDurableResponseBodies(context, replayPage);
    await authenticatedHostedConfigureChromiumDurableResponseBodies(context, stalePage);
    for (const reviewPage of [page, replayPage, stalePage]) {
      await enterProcessAs(reviewPage, setup.actors.reviewer, setup.aliases.process, settleActorTransitionEvidence);
      await expect(reviewPage.getByTestId('assess-v2-review-workspace')).toContainText('Reviewer-ready');
      const select = reviewPage.getByLabel('Eligible reviewer', { exact: true });
      await expect(select.locator(`option[value="${setup.actors.reviewer.user.id}"]`)).toHaveCount(1, { timeout: 15_000 });
      const eligibleValues = await select.locator('option').evaluateAll(options => options
        .map(option => (option as HTMLOptionElement).value).filter(Boolean));
      expect(eligibleValues).toEqual([setup.actors.reviewer.user.id]);
      expect(eligibleValues).not.toContain(setup.actors.author.user.id);
      expect(eligibleValues).not.toContain(setup.actors.approver.user.id);
      expect(eligibleValues).not.toContain(setup.actors.outsider.user.id);
    }
    expect(candidateProofRecorded).toBe(true);
    await page.unroute('**/rest/v1/rpc/assess_v2_eligible_reviewers');
    await selectReviewer(page, setup.actors.reviewer);
    await selectReviewer(replayPage, setup.actors.reviewer);

    const before = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
    const assignment = await observeApiResponse(page, '/functions/v1/assess-v2-command', () =>
      page.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click());
    expect(assignment.status).toBe(200);
    await expect(page.getByText(/Reviewer assignment committed\./u)).toBeVisible();
    const replay = await observeApiResponse(replayPage, '/functions/v1/assess-v2-command', () =>
      replayPage.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click());
    expect(replay.status).toBe(200);
    await expect(replayPage.getByText(/Reviewer assignment committed\./u)).toBeVisible();
    const staleWorkspace = stalePage.getByTestId('assess-v2-review-workspace');
    await staleWorkspace.getByLabel('Review rationale', { exact: true })
      .fill('Reject the stale reviewer-ready snapshot.');
    const stale = await observeApiResponse(stalePage, '/functions/v1/assess-v2-command', () =>
      staleWorkspace.getByRole('button', { name: 'Request changes', exact: true }).click(), true);
    expect(stale.status).toBe(409);
    expect(stale.errorCode).toBe('VERSION_CONFLICT');
    await expect(stalePage.getByText(
      'This assessment changed on the server. Reload it before retrying the action.', { exact: true },
    )).toBeVisible();
    await expect(stalePage.getByText(/Review resolution committed:/u)).toHaveCount(0);
    const after = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
    expect(after.assignments).toBe(before.assignments + 1);
    expect(after.changesRequested).toBe(before.changesRequested);
    expect(after.receipts).toBe(before.receipts + 1);
    expect(after.audits).toBe(before.audits + 1);
    const measurements = lifecycleMeasurements(before, after, before.assignments, after.assignments);
    bindObservedCase('E2E-004', assignment.actionId, replay.actionId, stale.actionId);
    authenticatedCases.push({
      testId: 'E2E-004', status: 'passed', proofMode: 'actual-ui',
      observations: {
        browser: { actions: [
          { action: 'click', target: 'Commit reviewer assignment' },
          { action: 'retry', target: 'Same reviewer assignment command' },
          { action: 'click', target: 'Stale review resolution' },
        ], result: { staleDenied: true, exactReplayReconciled: true, singleEffectVisible: true } },
        api: { productionRoutes: ['/functions/v1/assess-v2-command'], responses: [
          { classification: 'REVIEW_ASSIGNMENT_COMMITTED', status: assignment.status },
          { classification: 'REPLAYED', status: replay.status },
          { classification: 'VERSION_CONFLICT', status: stale.status },
        ] },
      },
      controls: { assertions: [
        { id: 'stale-command-denied', status: 'passed' },
        { id: 'same-command-reconciled-with-one-effect', status: 'passed' },
      ] },
      measurements, cleanup: { verified: true },
    });
    await closePageAfterOwnedNetwork(replayPage);
    await closePageAfterOwnedNetwork(stalePage);
  });

  test('creates and reloads the canonical AP Invoice Exception process through the production UI',
    { tag: '@v2-primary-prefix-diagnostic' }, async ({ page }) => {
    test.skip(!canonicalInvoiceExceptionJourney,
      'canonical process creation is an opt-in prerequisite for the AP Invoice Exception journey');
    if (v2FullPrefixReproduction) {
      await primeV2FullPrefixFixtureSession(
        page,
        setup.actors.author,
        process.env.ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY ?? 'sb-127-auth-token',
      );
    }
    await enterAs(page, setup.actors.author, settleActorTransitionEvidence);
    if (!(await page.getByRole('heading', { name: 'Process Catalog', exact: true }).isVisible().catch(() => false))) {
      await clickProduct(page, 'Assess');
    }
    await expect(page.getByRole('heading', { name: 'Process Catalog', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'New process', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New Assess process', exact: true });
    await dialog.getByRole('textbox', { name: 'Process Name *', exact: true }).fill('AP Invoice Exception Handling');
    await dialog.getByRole('textbox', { name: 'Description', exact: true }).fill(
      'Assess unmatched, duplicate, tax, quantity and tolerance invoice exceptions before any financial release.',
    );
    await dialog.getByRole('textbox', { name: 'Department', exact: true }).fill('Finance · Accounts Payable');
    await dialog.getByLabel(/^Assessed Criticality/u).selectOption('High');
    const createResponse = page.waitForResponse(response => {
      if (new URL(response.url()).pathname !== '/functions/v1/process-command'
        || response.request().method() !== 'POST') return false;
      try {
        return (response.request().postDataJSON() as { commandType?: unknown }).commandType === 'process.create';
      } catch { return false; }
    }, { timeout: 15_000 });
    await dialog.getByRole('button', { name: 'Create process', exact: true }).click();
    const response = await createResponse;
    expect([200, 201]).toContain(response.status());
    const request = response.request().postDataJSON() as {
      requestId?: unknown;
      payload?: { processId?: unknown };
    };
    const body = await response.json() as {
      ok?: unknown;
      outcome?: unknown;
      resource?: { id?: unknown; name?: unknown; receiptId?: unknown; requestId?: unknown };
    };
    expect(body.ok).toBe(true);
    expect(['committed', 'replayed']).toContain(body.outcome);
    expect(body.resource?.id).toBe(request.payload?.processId);
    expect(body.resource?.requestId).toBe(request.requestId);
    expect(body.resource?.name).toBe('AP Invoice Exception Handling');
    expect(body.resource?.receiptId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
    await expect(dialog).toHaveCount(0);
    let createdRow = page.getByRole('row').filter({ hasText: 'AP Invoice Exception Handling' });
    await expect(createdRow).toContainText('Finance · Accounts Payable');
    await expect(createdRow).toContainText('High');
    await settleActorTransitionEvidence();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Process Catalog', exact: true })).toBeVisible();
    createdRow = page.getByRole('row').filter({ hasText: 'AP Invoice Exception Handling' });
    await expect(createdRow).toContainText('Finance · Accounts Payable');
    await expect(createdRow).toContainText('High');
    const adopted = await control<{ processId: string; name: string }>('/control/canonical-created-process', {
      projectName,
      processId: body.resource?.id,
    });
    expect(adopted).toEqual({ processId: body.resource?.id, name: 'AP Invoice Exception Handling' });
    setup = Object.freeze({
      ...setup,
      aliases: Object.freeze({ ...setup.aliases, process: adopted.name }),
    });
    observe('canonical-process-create', 'ui.canonical-process-created-and-reloaded');
  });

  test('authors, replays, rejects stale work, requests changes and resubmits through the production UI',
    { tag: ['@v2-primary-prefix-diagnostic', '@govern-studio-diagnostic'] }, async ({ page, context }, testInfo) => test.step('hosted:primary:journey', async () => {
    let diagnosticPrefixComplete = false;
    await test.step('hosted:primary:process-denial', async () => {
      const deniedEditPage = await context.newPage();
      if (controllerBackedAcceptance) {
        await authenticatedHostedConfigureChromiumDurableResponseBodies(context, deniedEditPage);
      }
      await enterProcessAs(deniedEditPage, setup.actors.reviewer, setup.aliases.process, settleActorTransitionEvidence);
      const beforeDeniedEdit = await control<ReadOnlyTargetFrame>('/control/process-frame', { projectName });
      let deniedEditApi: ApiResponseObservation;
      if (controllerBackedAcceptance) {
        const editProcess = deniedEditPage.getByRole('button', { name: 'Edit process details', exact: true });
        await expect(editProcess).toBeDisabled();
        await expect(editProcess).toHaveAttribute('title', 'Process editing is not authorized for this role.');
        await expect(deniedEditPage.getByTestId('process-edit-form')).toHaveCount(0);
        await expect(deniedEditPage.getByRole('button', { name: 'Save process details', exact: true })).toHaveCount(0);
        const denied = await attemptUnauthorizedProcessUpdate(deniedEditPage, setup.aliases.process);
        expect(denied.body).toEqual({ ok: false, error: {
          code: 'PERMISSION_DENIED', message: 'Process update could not be completed.',
        } });
        deniedEditApi = {
          route: '/functions/v1/process-command', status: denied.status, actionId: actionReference(denied.request),
        };
      } else {
        await deniedEditPage.getByRole('button', { name: 'Edit process details', exact: true }).click();
        await deniedEditPage.getByLabel('Process name', { exact: true }).fill('Unauthorized process rename');
        deniedEditApi = await observeApiResponse(deniedEditPage, '/functions/v1/process-command', () =>
          deniedEditPage.getByRole('button', { name: 'Save process details', exact: true }).click());
        await expect(deniedEditPage.getByText('Process update denied. No changes were saved.', { exact: true })).toBeVisible();
      }
      expect(deniedEditApi.status).toBe(403);
      if (canonicalInvoiceExceptionJourney) await settleActorTransitionEvidence();
      await deniedEditPage.reload({ waitUntil: 'domcontentloaded' });
      await expect(deniedEditPage.getByRole('heading', { name: setup.aliases.process, exact: true })).toBeVisible();
      const afterDeniedEdit = await control<ReadOnlyTargetFrame>('/control/process-frame', { projectName });
      expect(afterDeniedEdit).toEqual(beforeDeniedEdit);
      if (authenticatedProductAcceptance) {
        const before = measuredCounters({ receiptWrites: beforeDeniedEdit.receipts, auditWrites: beforeDeniedEdit.audits });
        const after = measuredCounters({ receiptWrites: afterDeniedEdit.receipts, auditWrites: afterDeniedEdit.audits });
        bindObservedCase('ASSESS-002',deniedEditApi.actionId);
        authenticatedCases.push({
          testId: 'ASSESS-002', status: 'passed', proofMode: 'actual-ui',
          observations: {
            browser: { actions: hostedAuthenticatedAcceptance
              ? [{ action: 'observe', target: 'authorization-disabled process editor' },
                { action: 'submit', target: 'same-session process.update denial probe' },
                { action: 'reload', target: 'Process details' }]
              : [{ action: 'click', target: 'Save process details' }, { action: 'reload', target: 'Process details' }],
            result: hostedAuthenticatedAcceptance
              ? { authorizationDisabled: true, unchangedAfterReload: true }
              : { denialVisible: true, unchangedAfterReload: true } },
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
      await closePageAfterOwnedNetwork(deniedEditPage);
    });

    if (authenticatedProductAcceptance) {
      await test.step('hosted:primary:safety-and-runtime', async () => {
        const safetyStatusDiagnostics = Object.freeze({
          'SAFETY-001': 'ENTERPRISE_LIFECYCLE_BROWSER_SAFETY_001_HTTP_STATUS_REJECTED',
          'SAFETY-002': 'ENTERPRISE_LIFECYCLE_BROWSER_SAFETY_002_HTTP_STATUS_REJECTED',
          'SAFETY-003': 'ENTERPRISE_LIFECYCLE_BROWSER_SAFETY_003_HTTP_STATUS_REJECTED',
        } as const);
        const safetyStepTitles = Object.freeze({
          'SAFETY-001': 'hosted:safety:offline',
          'SAFETY-002': 'hosted:safety:server',
          'SAFETY-003': 'hosted:safety:timeout',
        } as const);
        const runSafetyCase = async (
          testId: 'SAFETY-001' | 'SAFETY-002' | 'SAFETY-003',
          classification: 'NETWORK_OFFLINE' | 'COMMAND_UNAVAILABLE' | 'NETWORK_TIMEOUT',
          status: number,
          expectedErrorCode: 'COMMAND_UNAVAILABLE' | null,
          install: () => Promise<() => Promise<void>>,
        ) => test.step(safetyStepTitles[testId], async () => {
          await enterProcessAs(page, setup.actors.author, setup.aliases.process, settleActorTransitionEvidence);
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
              : await observeApiResponse(page, '/functions/v1/process-command', action, expectedErrorCode !== null);
            if (api.status !== status) throw new Error(safetyStatusDiagnostics[testId]);
            if (expectedErrorCode !== null && api.errorCode !== expectedErrorCode) {
              throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_SAFETY_002_RESPONSE_CODE_REJECTED');
            }
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
          bindObservedCase(testId,api.actionId);
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
        });

        await runSafetyCase('SAFETY-001', 'NETWORK_OFFLINE', 0, null, async () => {
          await page.route('**/functions/v1/process-command', async route => {
            const prepared = await prepareProductFaultRoute(route, async () => {
              if (controllerBackedAcceptance) await startProductAction(route.request());
            });
            if (!prepared) return;
            await route.abort('internetdisconnected');
          });
          return async () => { await page.unroute('**/functions/v1/process-command'); };
        });
        await runSafetyCase('SAFETY-002', 'COMMAND_UNAVAILABLE', 503, 'COMMAND_UNAVAILABLE', async () => {
          await page.route('**/functions/v1/process-command', async route => {
            const prepared = await prepareProductFaultRoute(route, async () => {
              if (controllerBackedAcceptance) await startProductAction(route.request());
              const requestBody = route.request().postDataJSON();
              const authorization = await route.request().allHeaders();
              await control('/control/arm-browser-fault', {
                projectName,
                persona: 'author',
                kind: 'process_server_error_precommit',
                commandType: requestBody.commandType ?? 'process.update',
                requestBody,
                accessToken: (authorization.authorization ?? '').replace(/^Bearer\s+/iu, ''),
              });
            });
            if (!prepared) return;
            await route.fallback();
          });
          return async () => { await page.unroute('**/functions/v1/process-command'); };
        });
        await runSafetyCase('SAFETY-003', 'NETWORK_TIMEOUT', 0, null, async () => {
          await page.route('**/functions/v1/process-command', async route => {
            const prepared = await prepareProductFaultRoute(route, async () => {
              if (controllerBackedAcceptance) await startProductAction(route.request());
            });
            if (!prepared) return;
            await route.abort('timedout');
          });
          return async () => { await page.unroute('**/functions/v1/process-command'); };
        });

        await enterProcessAs(page, setup.actors.author, setup.aliases.process, settleActorTransitionEvidence);
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
          bindObservedCase('ASSESS-020',disabledApi.actionId);
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
      });

      const v1ProcessId = await enterProcessAs(page, setup.actors.author, setup.aliases.process, settleActorTransitionEvidence);
      const beforeDiscovery = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
      const discovery = await runV1AssessmentCompletion({
        page,
        identity: { actorId: setup.actors.author.user.id, processId: v1ProcessId },
        actionReference,
        runStep: (title, operation) => test.step(title, operation),
      });
      const afterDiscovery = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
      expect(afterDiscovery.v1ReadyAssessments).toBe(beforeDiscovery.v1ReadyAssessments + 1);
      bindObservedCase('ASSESS-003', discovery.finalizationActionId);
      authenticatedCases.push({
        testId: 'ASSESS-003', status: 'passed', proofMode: 'actual-ui',
        observations: {
          browser: { actions: [
            { action: 'complete', target: 'Legacy V1 discovery inputs' },
            { action: 'click', target: 'Calculate deterministic score' },
          ], result: { scoredDecisionVisible: true, readyForReviewCommitted: true } },
          api: { productionRoutes: ['/functions/v1/assess-command'],
            responses: [{ classification: 'ASSESSMENT_FINALIZED', status: discovery.finalizationResponse.status() }] },
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

    await test.step('hosted:primary:v2-authoring-and-review', async () => {
      await enterProcessAs(page, setup.actors.author, setup.aliases.process, settleActorTransitionEvidence);
      const diagnosticCheckpoint = v2PrimaryPrefixDiagnostic
        ? createV2ReloadBrowserCheckpointBuilder(page, { projectName, persona: 'author' }) : null;
      if (diagnosticCheckpoint) {
        const response = await control<V2ReloadDiagnosticCheckpointResponse>('/control/v2-reload-diagnostic',
          await diagnosticCheckpoint.checkpoint('before-create'));
        assertV2ReloadCheckpointResponse(response, 'before-create');
      }
      const beforeV2Create = authenticatedProductAcceptance
        ? await control<LifecycleFrame>('/control/lifecycle-frame', { projectName }) : null;
      const reproductionReadObserver = v2FullPrefixReproduction
        ? installV2ReloadReadObserver(page) : null;
      let deliveryTaskBodyArmed = false;
      if (v2FullPrefixReproduction) {
        await control('/control/native-postgrest-stream', {
          projectName, resource: 'legacy-delivery-query', mode: 'hold-body',
        });
        deliveryTaskBodyArmed = true;
        await expect.poll(async () => (await control<NativeDeliveryStreamStats>(
          '/control/native-postgrest-stats', { projectName },
        )).stream).toEqual({
          resource: 'legacy-delivery-query', mode: 'hold-body', entered: false, held: false,
        });
      }
      let createV2Api: ApiResponseObservation;
      try {
        createV2Api = await observeApiResponse(page, '/functions/v1/assess-v2-command', () =>
          page.getByRole('button', { name: 'New assessment (V2)', exact: true }).click());
      } catch (error) {
        if (deliveryTaskBodyArmed) {
          await control('/control/native-postgrest-stream-release', { projectName }).catch(() => undefined);
          deliveryTaskBodyArmed = false;
        }
        throw error;
      }
      expect(createV2Api.status).toBe(200);
      await expect(page.getByText('V2 case created. Add the minimum assessment structure before finalization.', { exact: true })).toBeVisible();
      observe('assess-create', 'ui.assess-created');
      if (authenticatedProductAcceptance && beforeV2Create) {
        if (v2FullPrefixReproductionVariant && reproductionReadObserver) {
          let barrier: V2FullPrefixReproductionObservation['barrier'] = 'none';
          let navigation: V2FullPrefixReproductionObservation['navigation'] = 'failed';
          let renderOutcome: V2ReloadRenderOutcome = 'unresolved';
          let readCompletion: V2ReloadReadObserverCompletion | null = null;
          let browserState: V2ReloadBrowserStateObservation = Object.freeze({
            sessionObserved: false,
            scopeNavigationObserved: false,
            processNavigationObserved: false,
            serverContextObserved: false,
          });
          let afterV2Create: LifecycleFrame | null = null;
          let deliveryPendingFrame: LifecycleFrame | null = null;
          let deliveryTaskBodyPending = false;
          let processVisibleWhileDeliveryPending = false;
          let v2VisibleWhileDeliveryPending = false;
          let deliveryPendingFrameStable = false;
          let retainedFailure: unknown = null;
          let failureStage: V2FullPrefixReproductionObservation['failureStage'] = null;
          const retainFailure = (
            stage: Exclude<V2FullPrefixReproductionObservation['failureStage'], null>,
            error: unknown,
          ) => {
            if (failureStage === null) {
              failureStage = stage;
              retainedFailure = error;
            }
          };
          try {
            if (v2FullPrefixReproductionVariant === 'barrier') {
              barrier = 'lifecycle-frame';
              try {
                const barrierFrame = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
                expect(barrierFrame.cases).toBe(beforeV2Create.cases + 1);
                expect(barrierFrame.caseVersions).toBe(beforeV2Create.caseVersions + 1);
              } catch (error) { retainFailure('lifecycle-frame', error); }
            }
            if (retainedFailure === null) {
              try {
                if (canonicalInvoiceExceptionJourney) await settleActorTransitionEvidence();
                await page.reload({ waitUntil: 'domcontentloaded' });
                navigation = 'passed';
              } catch (error) { retainFailure('navigation', error); }
            }
            if (navigation === 'passed') {
              try {
                await expect.poll(async () => (await control<NativeDeliveryStreamStats>(
                  '/control/native-postgrest-stats', { projectName },
                )).stream).toEqual({
                  resource: 'legacy-delivery-query', mode: 'hold-body', entered: true, held: true,
                });
                deliveryTaskBodyPending = true;
                await expect(page.getByRole('heading', { name: setup.aliases.process, exact: true })).toBeVisible();
                processVisibleWhileDeliveryPending = true;
                await expect(page.getByText(
                  'Existing V2 draft resumed from the current immutable authoring version.', { exact: true },
                )).toBeVisible();
                v2VisibleWhileDeliveryPending = true;
                renderOutcome = await observeV2ReloadRenderOutcome(page);
                deliveryPendingFrame = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
              } catch (error) { retainFailure('render', error); }
              finally {
                if (deliveryTaskBodyArmed) {
                  await control('/control/native-postgrest-stream-release', { projectName }).catch(() => undefined);
                  deliveryTaskBodyArmed = false;
                }
              }
            }
            try { readCompletion = await reproductionReadObserver.complete(); }
            catch (error) { retainFailure('read-observer', error); }
            try { browserState = await observeV2ReloadBrowserState(page); }
            catch (error) { retainFailure('browser-state', error); }
            if (!activeTestWorkQueues) retainFailure('network-queue', new Error('AUTHENTICATED_BROWSER_ACTION_TRACKER_MISSING'));
            else {
              try { await activeTestWorkQueues.network.drain(); }
              catch (error) { retainFailure('network-queue', error); }
            }
            try { afterV2Create = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName }); }
            catch (error) { retainFailure('lifecycle-frame', error); }
            if (retainedFailure !== null) throw retainedFailure;
            expect(readCompletion?.observerFailure).toBe(false);
            expect(renderOutcome).toBe('resumed');
            expect(readCompletion?.observation.readStages).toHaveLength(11);
            expect(readCompletion?.observation.readStages.every(stage => stage.status === 'passed')).toBe(true);
            await expect(page.getByText('Existing V2 draft resumed from the current immutable authoring version.', { exact: true })).toBeVisible();
            await expect(page.getByRole('button', { name: 'New assessment (V2)', exact: true })).toHaveCount(0);
            expect(afterV2Create?.cases).toBe(beforeV2Create.cases + 1);
            expect(afterV2Create?.caseVersions).toBe(beforeV2Create.caseVersions + 1);
            expect(deliveryPendingFrame).not.toBeNull();
            expect(afterV2Create).toEqual(deliveryPendingFrame);
            deliveryPendingFrameStable = true;
            bindObservedCase('ASSESS-018',createV2Api.actionId);
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
              measurements: lifecycleMeasurements(beforeV2Create,afterV2Create!,beforeV2Create.cases,afterV2Create!.cases),
              cleanup: { verified: true },
            });
            diagnosticPrefixComplete = true;
          } catch (error) {
            retainFailure('assertion', error);
            throw error;
          } finally {
            if (deliveryTaskBodyArmed) {
              await control('/control/native-postgrest-stream-release', { projectName }).catch(() => undefined);
            }
            v2FullPrefixObservation = Object.freeze({
              scope: 'desktop-primary-lifecycle',
              variant: v2FullPrefixReproductionVariant,
              navigation,
              renderOutcome,
              observerFailure: readCompletion?.observerFailure ?? true,
              serverContextObserved: readCompletion?.observation.serverContextObserved
                ?? browserState.serverContextObserved,
              sessionObserved: browserState.sessionObserved,
              scopeNavigationObserved: browserState.scopeNavigationObserved,
              processNavigationObserved: browserState.processNavigationObserved,
              readStages: readCompletion?.observation.readStages ?? [],
              barrier,
              diagnosticCheckpointEquivalent: false,
              lifecycleFrameCaptured: afterV2Create !== null,
              deliveryTaskBodyPending,
              processVisibleWhileDeliveryPending,
              v2VisibleWhileDeliveryPending,
              deliveryPendingFrameStable,
              caseDelta: afterV2Create ? afterV2Create.cases - beforeV2Create.cases : null,
              caseVersionDelta: afterV2Create ? afterV2Create.caseVersions - beforeV2Create.caseVersions : null,
              failureStage,
              primaryCompletion: Object.freeze({
                status: 'failed', terminalCaseId: null, lifecycleFrameCaptured: false, caseIds: Object.freeze([]),
              }),
            });
          }
        } else if (diagnosticCheckpoint) {
          const beforeReloadResponse = await control<V2ReloadDiagnosticCheckpointResponse>('/control/v2-reload-diagnostic',
            await diagnosticCheckpoint.checkpoint('before-reload'));
          assertV2ReloadCheckpointResponse(beforeReloadResponse, 'before-reload');
          const readObserver = installV2ReloadReadObserver(page);
          let renderOutcome: V2ReloadRenderOutcome = 'unresolved';
          let reloadFailure: unknown = null;
          let renderFailure: unknown = null;
          try { await page.reload({ waitUntil: 'domcontentloaded' }); }
          catch (error) { reloadFailure = error; }
          if (!reloadFailure) {
            try { renderOutcome = await observeV2ReloadRenderOutcome(page); }
            catch (error) { renderFailure = error; }
          }
          const readCompletion = await readObserver.complete();
          let trackerFailure: unknown = null;
          try {
            if (!activeTestWorkQueues) throw new Error('AUTHENTICATED_BROWSER_ACTION_TRACKER_MISSING');
            await activeTestWorkQueues.network.drain();
          } catch (error) { trackerFailure = error; }
          const afterReloadResponse = await control<V2ReloadDiagnosticCheckpointResponse>('/control/v2-reload-diagnostic',
            await diagnosticCheckpoint.checkpoint('after-reload', {
              readObservation: readCompletion.observation,
              renderOutcome,
            }));
          assertV2ReloadCheckpointResponse(afterReloadResponse, 'after-reload');
          if (trackerFailure) throw trackerFailure;
          if (readCompletion.observerFailure) throw new Error('AUTHENTICATED_V2_RELOAD_READ_OBSERVER_REJECTED');
          if (reloadFailure) throw reloadFailure;
          if (renderFailure) throw renderFailure;
          diagnosticPrefixComplete = true;
          return;
        } else {
          await page.reload({ waitUntil: 'domcontentloaded' });
          await expect(page.getByText('Existing V2 draft resumed from the current immutable authoring version.', { exact: true })).toBeVisible();
          const afterV2Create = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
          expect(afterV2Create.cases).toBe(beforeV2Create.cases + 1);
          bindObservedCase('ASSESS-018',createV2Api.actionId);
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
      }

      await test.step('hosted:primary:v2-finalization-and-review', async () => {
      await page.getByRole('button', { name: 'Add minimum working structure', exact: true }).click();
      await completeRequiredAssessmentFacts(page);
      await page.getByRole('button', { name: 'Save V2 draft', exact: true }).click();
      await expect(page.getByText('Draft saved as a new immutable authoring version.', { exact: true })).toBeVisible();
      const beforeV2Finalize = authenticatedProductAcceptance
        ? await control<LifecycleFrame>('/control/lifecycle-frame', { projectName }) : null;
      const finalizeV2Api = await observeApiResponse(page, '/functions/v1/assess-v2-command', () => finalizeDecisionPack(page));
      expect(finalizeV2Api.status).toBe(200);
      await expect(page.getByText('Reviewer-ready Decision Pack finalized. It is read-only.', { exact: true })).toBeVisible();
      if (canonicalInvoiceExceptionJourney) {
        await mkdir(outputDirectory, { recursive: true });
        const decisionPack = page.getByTestId('assess-v2-decision-pack');
        const header = decisionPack.locator(':scope > div').first();
        const executiveSection = decisionPack.getByRole('heading', { name: 'Executive decision', exact: true }).locator('..');
        const controlsSection = decisionPack.getByRole('heading', { name: 'Required controls', exact: true }).first().locator('..');
        const nonClaimsSection = decisionPack.getByRole('heading', { name: 'Explicit non-claims', exact: true }).locator('..');
        const referencesSection = decisionPack.getByRole('heading', { name: 'Immutable references', exact: true }).locator('..');
        const decisionPackText = [
          `# ${await header.getByRole('heading').innerText()}`,
          '',
          `Process: ${setup.aliases.process}`,
          'Captured at deterministic finalization, before independent review and Govern resolution.',
          '',
          await header.locator('p').nth(0).innerText(),
          await header.locator('p').nth(1).innerText(),
          await header.locator('p').nth(2).innerText(),
          await header.locator('p').nth(3).innerText(),
          await header.locator('p').nth(4).innerText(),
          '',
          `## ${await executiveSection.getByRole('heading', { name: 'Executive decision', exact: true }).innerText()}`,
          await executiveSection.locator('p').first().innerText(),
          '',
          `## ${await controlsSection.getByRole('heading', { name: 'Required controls', exact: true }).innerText()}`,
          ...(await controlsSection.locator('li').allTextContents()).map(item => `- ${item}`),
          '',
          '## Canonical source/version labels',
          `- Schema version: ${await referencesSection.locator('dd').nth(0).innerText()}`,
          `- Rule-set version: ${await referencesSection.locator('dd').nth(1).innerText()}`,
          `- Decision version: ${await referencesSection.locator('dd').nth(2).innerText()}`,
          '',
          `## ${await nonClaimsSection.getByRole('heading', { name: 'Explicit non-claims', exact: true }).innerText()}`,
          ...(await nonClaimsSection.locator('p').allTextContents()).map(item => `- ${item}`),
          '',
        ].join('\n');
        expect(decisionPackText).not.toMatch(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/iu);
        const decisionPackOutput = `${testInfo.project.name}-ap-invoice-exception-decision-pack.md`;
        await writeFile(path.join(outputDirectory, decisionPackOutput), decisionPackText, 'utf8');
        canonicalRepresentativeOutputs.push(decisionPackOutput);
        await testInfo.attach(decisionPackOutput, {
          path: path.join(outputDirectory, decisionPackOutput),
          contentType: 'text/markdown',
        });
        const decisionPackScreenshotName = `${testInfo.project.name}-ap-invoice-exception-decision-pack.png`;
        const decisionPackScreenshot = path.join(outputDirectory, decisionPackScreenshotName);
        await header.screenshot({ path: decisionPackScreenshot });
        await testInfo.attach('ap-invoice-exception-decision-pack.png', {
          path: decisionPackScreenshot,
          contentType: 'image/png',
        });
        canonicalRepresentativeOutputs.push(decisionPackScreenshotName);
      }
      observe('assess-finalize', 'ui.assess-finalized');
      if (authenticatedProductAcceptance && beforeV2Finalize) {
        const afterV2Finalize = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
        expect(afterV2Finalize.decisions).toBe(beforeV2Finalize.decisions + 1);
        bindObservedCase('ASSESS-019',finalizeV2Api.actionId);
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
      if (controllerBackedAcceptance) {
        await authenticatedHostedConfigureChromiumDurableResponseBodies(context, replayPage);
        await authenticatedHostedConfigureChromiumDurableResponseBodies(context, stalePage);
      }
      for (const reviewPage of [page, replayPage, stalePage]) {
        await enterProcessAs(reviewPage, setup.actors.reviewer, setup.aliases.process, settleActorTransitionEvidence);
        await expect(reviewPage.getByTestId('assess-v2-review-workspace')).toContainText('Reviewer-ready');
      }
      await selectReviewer(page, setup.actors.reviewer);
      await selectReviewer(replayPage, setup.actors.reviewer);

      const beforeAssignmentLifecycle = authenticatedProductAcceptance
        ? await control<LifecycleFrame>('/control/lifecycle-frame', { projectName }) : null;
      const beforeAssignment = await control<MutationSnapshot>('/control/snapshot', { projectName });
      const assignmentApi = await observeApiResponse(page, '/functions/v1/assess-v2-command', () =>
        page.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click());
      expect(assignmentApi.status).toBe(200);
      await expect(page.getByText(/Reviewer assignment committed\./u)).toBeVisible();
      const afterAssignmentLifecycle = authenticatedProductAcceptance
        ? await control<LifecycleFrame>('/control/lifecycle-frame', { projectName }) : null;
      const afterAssignment = await control<MutationSnapshot>('/control/snapshot', { projectName });
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
      expect(await control<MutationSnapshot>('/control/snapshot', { projectName })).toEqual(afterAssignment);
      observe('command-replay', 'ui.replay-no-new-effect');

      const staleWorkspace = stalePage.getByTestId('assess-v2-review-workspace');
      await staleWorkspace.getByLabel('Review rationale', { exact: true })
        .fill('Reject the stale reviewer-ready snapshot.');
      const staleApi = await observeApiResponse(stalePage, '/functions/v1/assess-v2-command', () =>
        staleWorkspace.getByRole('button', { name: 'Request changes', exact: true }).click(), true);
      expect(staleApi.status).toBe(409);
      expect(staleApi.errorCode).toBe('VERSION_CONFLICT');
      await expect(stalePage.getByText('This assessment changed on the server. Reload it before retrying the action.', { exact: true })).toBeVisible();
      await expect(stalePage.getByText(/Review resolution committed:/u)).toHaveCount(0);
      expect(await control<MutationSnapshot>('/control/snapshot', { projectName })).toEqual(afterAssignment);
      observe('command-stale-denial', 'ui.stale-no-false-success');
      if (authenticatedProductAcceptance && beforeAssignmentLifecycle && afterAssignmentLifecycle) {
        expect(afterAssignmentLifecycle.assignments).toBe(beforeAssignmentLifecycle.assignments + 1);
        const measurements = lifecycleMeasurements(beforeAssignmentLifecycle,afterAssignmentLifecycle,
          beforeAssignmentLifecycle.assignments,afterAssignmentLifecycle.assignments);
        bindObservedCase('GOVERN-001',assignmentApi.actionId);
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
        bindObservedCase('E2E-004',assignmentApi.actionId,replayApi.actionId,staleApi.actionId);
        authenticatedCases.push({
          testId: 'E2E-004', status: 'passed', proofMode: 'actual-ui',
          observations: {
            browser: { actions: [
              { action: 'click', target: 'Commit reviewer assignment' },
              { action: 'retry', target: 'Same reviewer assignment command' },
              { action: 'click', target: 'Stale review resolution' },
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
      await closePageAfterOwnedNetwork(replayPage);
      await closePageAfterOwnedNetwork(stalePage);

      const beforeAttestation = authenticatedProductAcceptance
        ? await control<LifecycleFrame>('/control/lifecycle-frame', { projectName }) : null;
      const firstAttestationApi = await attestSubmittedEvidence(
        page, 'Independent evidence check before rework.', actionReference, 1,
      );
      expect(firstAttestationApi).toHaveLength(1);
      const afterAttestation = authenticatedProductAcceptance
        ? await control<LifecycleFrame>('/control/lifecycle-frame', { projectName }) : null;
      observe('govern-attest', 'ui.evidence-attested');
      if (authenticatedProductAcceptance && beforeAttestation && afterAttestation) {
        expect(afterAttestation.attestations).toBeGreaterThan(beforeAttestation.attestations);
        bindObservedCase('GOVERN-002',firstAttestationApi[0].actionId);
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
      await attestSubmittedEvidence(page, 'Independent evidence check before rework.', actionReference);
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

      await enterProcessAs(page, setup.actors.author, setup.aliases.process, settleActorTransitionEvidence);
      await expect(page.getByRole('button', { name: 'Start new draft revision', exact: true })).toBeVisible();
      if (authenticatedProductAcceptance && beforeChanges && afterChanges) {
        expect(afterChanges.changesRequested).toBe(beforeChanges.changesRequested + 1);
        bindObservedCase('GOVERN-003',requestChangesApi.actionId);
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

      if (canonicalInvoiceExceptionJourney) await settleActorTransitionEvidence();
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
        bindObservedCase('GOVERN-004',reworkFinalizeApi.actionId);
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
    });
    if (v2FullPrefixReproduction && v2FullPrefixObservation) {
      const completionFrame = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
      expect(completionFrame.decisions).toBeGreaterThanOrEqual(2);
      const caseIds = authenticatedCases.map(row => (row as { testId?: unknown }).testId)
        .filter((testId): testId is string => typeof testId === 'string').sort();
      expect(caseIds).toEqual([...V2_FULL_PRIMARY_EXPECTED_CASE_IDS]);
      v2FullPrefixObservation = Object.freeze({
        ...v2FullPrefixObservation,
        primaryCompletion: Object.freeze({
          status: 'passed', terminalCaseId: 'GOVERN-004', lifecycleFrameCaptured: true,
          caseIds: Object.freeze(caseIds),
        }),
      });
    }
    if (diagnosticPrefixComplete || governStudioDiagnostic) return;
  }));

  test('independent approval, Govern separation and synthetic Studio generation retain exact lineage',
    { tag: canonicalInvoiceExceptionJourney
      ? ['@govern-studio-diagnostic', '@v2-primary-prefix-diagnostic'] : '@govern-studio-diagnostic' }, async ({ page }, testInfo) => {
    const reviewerSelection = eligibleReviewerRequestDiagnostics?.beginSelection(page) ?? null;
    await enterProcessAs(page, setup.actors.reviewer, setup.aliases.process, settleActorTransitionEvidence);
    let reviewWorkspace = page.getByTestId('assess-v2-review-workspace');
    const eligibleReviewer = page.getByLabel('Eligible reviewer', { exact: true });
    try {
      await test.step('hosted:govern-studio:eligible-reviewer-visible', () => expect(eligibleReviewer).toBeVisible());
    } catch (error) {
      try {
        const diagnostic = reviewerSelection && eligibleReviewerRequestDiagnostics
          ? eligibleReviewerRequestDiagnostics.freeze(reviewerSelection, testInfo.project.name,
            { workspace: 'unknown', candidates: 'unknown' }) : null;
        if (diagnostic) {
          await testInfo.attach(ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTIC_ATTACHMENT,
            { body: Buffer.from(JSON.stringify(diagnostic), 'utf8'), contentType: 'application/json' });
        }
      } catch { /* diagnostics cannot replace the original assertion */ }
      throw error;
    }
    await eligibleReviewer.selectOption(setup.actors.reviewer.user.id);
    await reviewWorkspace.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click();
    await expect(page.getByText(/Reviewer assignment committed\./u)).toBeVisible();
    expect((await attestSubmittedEvidence(
      page, 'Revised evidence independently verified.', actionReference,
    )).length).toBeGreaterThan(0);
    const beforeApproval = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
    await reviewWorkspace.getByLabel('Review rationale', { exact: true }).fill('Revised decision and exact evidence are independently approved.');
    const approvalApi = await test.step('hosted:govern-studio:reviewer-approval', () =>
      observeApiResponse(page, '/functions/v1/assess-v2-command', () =>
        reviewWorkspace.getByRole('button', { name: 'Approve reviewed decision', exact: true }).click()));
    expect(approvalApi.status).toBe(200);
    approvedDecisionApi = approvalApi;
    await expect(page.getByText('Review resolution committed: Approved.', { exact: true })).toBeVisible();
    const afterApproval = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
    observe('govern-approve', 'ui.independent-approved');
    if (authenticatedProductAcceptance) {
      expect(afterApproval.approvedReviews).toBe(beforeApproval.approvedReviews + 1);
      bindObservedCase('GOVERN-005',approvalApi.actionId);
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
    const beforeGovernBoundary = authenticatedProductAcceptance
      ? await control<LifecycleFrame>('/control/lifecycle-frame', { projectName }) : null;
    const beforeFinalReviewerDenial = await control<MutationSnapshot>('/control/snapshot', { projectName });
    const strictReviewerGovernDenial = hostedAuthenticatedAcceptance
      || process.env.ENTERPRISE_LIFECYCLE_HOSTED_PERSONA_ROLE_PARITY === 'true';
    const reviewerGovernDenial = strictReviewerGovernDenial
      ? await test.step('hosted:govern-studio:reviewer-denial', () => exerciseReviewerGovernDenial({
        page,
        workspace: reviewWorkspace,
        apiBaseUrl: process.env.AUTHENTICATED_ACCEPTANCE_SUPABASE_URL
          ?? process.env.ENTERPRISE_LIFECYCLE_API_BASE_URL ?? '',
        rationale: 'The final reviewer must not resolve this financial high-impact decision.',
      }))
      : null;
    let governDenialApi: ApiResponseObservation;
    if (reviewerGovernDenial) {
      governDenialApi = {
        route: '/functions/v1/assess-v2-command',
        status: reviewerGovernDenial.status,
        ...(reviewerGovernDenial.errorCode ? { errorCode: reviewerGovernDenial.errorCode } : {}),
        actionId: actionReference(reviewerGovernDenial.response.request()),
      };
      expect(governDenialApi.status).toBe(403);
      expect(governDenialApi.errorCode).toBe('PERMISSION_DENIED');
    } else {
      expect(await resolveEveryGovernControl(page)).toBeGreaterThan(0);
      await reviewWorkspace.getByLabel('Govern rationale', { exact: true })
        .fill('The final reviewer must not resolve this financial high-impact decision.');
      governDenialApi = await observeApiResponse(page, '/functions/v1/assess-v2-command', () =>
        reviewWorkspace.getByRole('button', { name: 'Resolve Govern controls', exact: true }).click());
      expect(governDenialApi.status).toBe(400);
      await expect(page.getByRole('heading', { name: 'Workspace unavailable', exact: true })).toBeVisible();
      await expect(page.getByText('The command could not be completed. No success was recorded.', { exact: true })).toBeVisible();
    }
    await expect(page.getByText('Govern resolution committed.', { exact: true })).toHaveCount(0);
    expect(await control<MutationSnapshot>('/control/snapshot', { projectName })).toEqual(beforeFinalReviewerDenial);
    observe('govern-separation-denial', 'ui.separation-denied');
    observe('govern-separation-denial', 'ui.final-reviewer-govern-denied');

    await enterProcessAs(page, setup.actors.approver, setup.aliases.process, settleActorTransitionEvidence);
    reviewWorkspace = page.getByTestId('assess-v2-review-workspace');
    expect(await resolveEveryGovernControl(page)).toBeGreaterThan(0);
    await reviewWorkspace.getByLabel('Govern rationale', { exact: true }).fill('Independent resolver confirmed every required control.');
    const governResolutionApi = await test.step('hosted:govern-studio:approver-resolution', () =>
      observeApiResponse(page, '/functions/v1/assess-v2-command', () =>
        reviewWorkspace.getByRole('button', { name: 'Resolve Govern controls', exact: true }).click()));
    expect(governResolutionApi.status).toBe(200);
    await expect(page.getByText('Govern resolution committed.', { exact: true })).toBeVisible();
    observe('govern-resolve', 'ui.govern-resolved');
    if (authenticatedProductAcceptance && beforeGovernBoundary) {
      const afterGovernBoundary = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
      expect(afterGovernBoundary.governResolutions).toBe(beforeGovernBoundary.governResolutions + 1);
      bindObservedCase('GOVERN-007',governDenialApi.actionId,governResolutionApi.actionId);
      authenticatedCases.push({
        testId: 'GOVERN-007', status: 'passed', proofMode: 'actual-ui',
        observations: {
          browser: { actions: reviewerGovernDenial ? [
            { action: 'inspect', target: 'disabled Resolve Govern controls as final reviewer' },
            { action: 'request', target: 'authenticated Govern resolution as final reviewer' },
            { action: 'click', target: 'Resolve Govern controls as independent approver' },
          ] : [
            { action: 'click', target: 'Resolve Govern controls as final reviewer' },
            { action: 'click', target: 'Resolve Govern controls as independent approver' },
          ], result: reviewerGovernDenial ? {
            reviewerControlDisabled: reviewerGovernDenial.uiDisabled,
            exactCurrentScope: reviewerGovernDenial.exactCurrentScope,
            exactCurrentVersion: reviewerGovernDenial.exactCurrentVersion,
            requestBindingDigest: reviewerGovernDenial.requestDigest,
            separationDenialZeroEffects: true,
            independentResolutionCommitted: true,
          } : { separationDenialZeroEffects: true, independentResolutionCommitted: true } },
          api: { productionRoutes: ['/functions/v1/assess-v2-command'], responses: [
            { classification: reviewerGovernDenial ? 'PERMISSION_DENIED' : 'INVALID_COMMAND', status: governDenialApi.status },
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
    const studioHandoffApi = await test.step('hosted:govern-studio:assess-handoff', () =>
      observeApiResponse(page, '/functions/v1/assess-v2-command', () =>
        reviewWorkspace.getByRole('button', { name: 'Create durable Studio handoff', exact: true }).click()));
    expect(studioHandoffApi.status).toBe(200);
    await expect(page.getByText('Studio handoff committed.', { exact: true })).toBeVisible();
    await expect(page.getByTestId('assess-v2-review-workspace')).toContainText('Handed off to Studio');

    await enterStudioAs(page, setup.actors.author, settleActorTransitionEvidence);
    const studioRequestResponse = await test.step('hosted:govern-studio:studio-request', () =>
      commitEligibleStudioHandoffRequest(page));
    const studioRequestApi = observeStudioHandoffResponse(studioRequestResponse);
    const requestedHandoffTarget = await persistedHandoffTargetFromResponse(studioRequestResponse, 'requested');
    await expect(page.getByText(/Handoff decision committed \(receipt .+\)\./u)).toBeVisible();

    await enterStudioAs(page, setup.actors.reviewer, settleActorTransitionEvidence);
    const studioReviewResponse = await test.step('hosted:govern-studio:studio-review', () =>
      commitPersistedStudioHandoffAction(
        page,
        requestedHandoffTarget,
        'Approve review',
        'Independent Studio handoff review approved.',
      ));
    const studioReviewApi = observeStudioHandoffResponse(studioReviewResponse);
    const reviewedHandoffTarget = await persistedHandoffTargetFromResponse(
      studioReviewResponse,
      'approval_ready',
      requestedHandoffTarget,
    );
    await expect(page.getByText(/Handoff decision committed \(receipt .+\)\./u)).toBeVisible();

    await enterStudioAs(page, setup.actors.approver, settleActorTransitionEvidence);
    const studioFinalAcceptResponse = await test.step('hosted:govern-studio:studio-final-accept', () =>
      commitPersistedStudioHandoffAction(
        page,
        reviewedHandoffTarget,
        'Final accept',
        'Final Studio handoff acceptance by an independent actor.',
      ));
    const studioFinalAcceptApi = observeStudioHandoffResponse(studioFinalAcceptResponse);
    const acceptedHandoffTarget = await persistedHandoffTargetFromResponse(
      studioFinalAcceptResponse,
      'approved',
      reviewedHandoffTarget,
    );
    await expect(page.getByText(/Handoff decision committed \(receipt .+\)\./u)).toBeVisible();

    const sourcePackageResponse = await test.step('hosted:govern-studio:source-consume', () =>
      consumeApprovedStudioHandoff(page, acceptedHandoffTarget));
    const sourcePackageApi = observeStudioHandoffResponse(sourcePackageResponse);
    await persistedHandoffTargetFromResponse(sourcePackageResponse, 'consumed', acceptedHandoffTarget);
    expect(sourcePackageApi.status).toBe(201);
    await expect(page.getByText(/Handoff consumed and exact source package verified \(receipt .+\)\./u)).toBeVisible();
    observe('studio-consume', 'ui.studio-lineage-consumed');
    if (authenticatedProductAcceptance && beforeStudioConsume) {
      const afterStudioConsume = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
      expect(afterStudioConsume.sourcePackages).toBe(beforeStudioConsume.sourcePackages + 1);
      if (governStudioDiagnostic) bindObservedCase('STUDIO-001', studioHandoffApi.actionId,
        studioRequestApi.actionId, studioReviewApi.actionId, studioFinalAcceptApi.actionId, sourcePackageApi.actionId);
      else bindObservedCase('STUDIO-001',sourcePackageApi.actionId);
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

    if (governStudioDiagnostic) {
      await settleCheckpointBoundary({
        settleOwnedNetwork: settleActorTransitionEvidence,
        checkpoint: async () => {
          const actionIds = await Promise.all([
            approvalApi.actionId, governDenialApi.actionId, governResolutionApi.actionId, studioHandoffApi.actionId,
            studioRequestApi.actionId, studioReviewApi.actionId, studioFinalAcceptApi.actionId, sourcePackageApi.actionId,
          ]);
          if (actionIds.some((actionId): actionId is null => actionId === null)) {
            throw new Error('AUTHENTICATED_GOVERN_STUDIO_ACTION_REFERENCE_MISSING');
          }
          await test.step('hosted:govern-studio:checkpoint', () => control('/control/govern-studio-diagnostic', {
            projectName, actionIds,
          }));
        },
      });
      return;
    }

    const studioWorkspace = page.getByTestId('studio-artifact-workspace');
    const template = studioWorkspace.getByLabel('Exact approved Studio template', { exact: true });
    await selectExactStudioTemplate(template, setup.studioTemplate);
    const beforeStudioGeneration = authenticatedProductAcceptance
      ? await control<LifecycleFrame>('/control/lifecycle-frame', { projectName }) : null;
    const hostedSuccessRoute = async (route: import('@playwright/test').Route) => {
      const prepared = await prepareProductFaultRoute(route, async () => {
        await startProductAction(route.request());
        const requestBody = route.request().postDataJSON();
        const headers = await route.request().allHeaders();
        await control('/control/arm-browser-fault', {
          projectName,
          persona: 'approver',
          kind: 'studio_deterministic_success',
          commandType: requestBody.commandType ?? 'studio.document.generate',
          requestBody,
          accessToken: (headers.authorization ?? '').replace(/^Bearer\s+/iu, ''),
        });
      });
      if (!prepared) return;
      await route.fallback();
    };
    if (hostedAuthenticatedAcceptance || canonicalInvoiceExceptionJourney) await page.route('**/functions/v1/studio-artifact-command', hostedSuccessRoute);
    let generationApi: ApiResponseObservation;
    try {
      generationApi = await observeApiResponse(page, '/functions/v1/studio-artifact-command', () =>
        studioWorkspace.getByRole('button', { name: 'Generate governed package draft', exact: true }).click());
    } finally {
      if (hostedAuthenticatedAcceptance || canonicalInvoiceExceptionJourney) await page.unroute('**/functions/v1/studio-artifact-command', hostedSuccessRoute);
    }
    expect(generationApi.status).toBe(201);
    await expect(page.getByText(/Draft committed from exact Studio Source Package v\d+; v2 projection reloaded\./u)).toBeVisible();
    await expect(page.getByText('Current committed preview', { exact: true })).toBeVisible();
    observe('studio-synthetic-generation', 'ui.synthetic-provider-boundary');
    if (authenticatedProductAcceptance && beforeStudioGeneration) {
      const afterStudioGeneration = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName });
      expect(afterStudioGeneration.artifactVersions).toBe(beforeStudioGeneration.artifactVersions + 1);
      bindObservedCase('STUDIO-002',generationApi.actionId);
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

    if (canonicalInvoiceExceptionJourney) await settleActorTransitionEvidence();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('studio-artifact-workspace')).toBeVisible();
    await expect(page.getByText('Current committed preview', { exact: true })).toBeVisible();

    if (canonicalInvoiceExceptionJourney) {
      const structuredEditor = page.getByRole('region', { name: 'Structured section editor', exact: true });
      await expect(structuredEditor).toBeVisible();
      await structuredEditor.getByLabel('Section title', { exact: true }).fill('AP invoice exception handling scope and controls');
      await structuredEditor.getByRole('textbox', { name: 'Section body', exact: true }).fill(
        'Route unmatched, duplicate, tax, quantity and tolerance exceptions to an accountable AP specialist. Preserve invoice, purchase-order and receipt evidence; require human approval before any financial release.',
      );
      const revisionResponse = page.waitForResponse(response => {
        if (new URL(response.url()).pathname !== '/functions/v1/studio-artifact-command') return false;
        try {
          return (response.request().postDataJSON() as { commandType?: unknown }).commandType === 'studio.artifact.draft.revise';
        } catch { return false; }
      }, { timeout: 15_000 });
      await structuredEditor.getByRole('button', { name: 'Commit immutable revision', exact: true }).click();
      expect((await revisionResponse).status()).toBe(201);
      await expect(page.getByText('Draft committed.', { exact: true })).toBeVisible();
      await expect(page.getByText('v2', { exact: true }).first()).toBeVisible();
      await settleActorTransitionEvidence();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Structured section editor', exact: true })).toBeVisible();
      await expect(page.getByLabel('Section title', { exact: true })).toHaveValue('AP invoice exception handling scope and controls');
      await mkdir(outputDirectory, { recursive: true });
      const artifactPreview = page.getByRole('article', { name: 'Artifact preview', exact: true });
      const studioText = [
        '# AP Invoice Exception Handling BRD',
        '',
        `Source label: ${await artifactPreview.getByRole('heading', { name: 'BRD artifact', exact: true }).innerText()}`,
        `Version label: ${await artifactPreview.getByText(/Aggregate v\d+ · Content v2/u).innerText()}`,
        `Section title: ${await page.getByLabel('Section title', { exact: true }).inputValue()}`,
        '',
        '## Committed business content',
        await structuredEditor.getByRole('textbox', { name: 'Section body', exact: true }).inputValue(),
        '',
      ].join('\n');
      expect(studioText).not.toMatch(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/iu);
      const studioOutput = `${testInfo.project.name}-ap-invoice-exception-studio-brd.md`;
      await writeFile(path.join(outputDirectory, studioOutput), studioText, 'utf8');
      canonicalRepresentativeOutputs.push(studioOutput);
      await testInfo.attach(studioOutput, {
        path: path.join(outputDirectory, studioOutput),
        contentType: 'text/markdown',
      });
      const studioScreenshotName = `${testInfo.project.name}-ap-invoice-exception-studio-brd.png`;
      const studioScreenshot = path.join(outputDirectory, studioScreenshotName);
      const businessSection = structuredEditor.getByLabel('Section title', { exact: true })
        .locator('..').locator('..');
      await businessSection.screenshot({ path: studioScreenshot });
      await testInfo.attach('ap-invoice-exception-studio-brd.png', {
        path: studioScreenshot,
        contentType: 'image/png',
      });
      canonicalRepresentativeOutputs.push(studioScreenshotName);
    }

    if (authenticatedProductAcceptance) {
      await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
      await expect(page.getByText('Reviewer ready committed.', { exact: true })).toBeVisible();
      await enterStudioAs(page, setup.actors.author, settleActorTransitionEvidence);
      await page.getByLabel('Eligible independent reviewer', { exact: true }).selectOption(setup.actors.reviewer.user.id);
      await page.getByRole('button', { name: 'Assign reviewer', exact: true }).click();
      await expect(page.getByText('In review committed.', { exact: true })).toBeVisible();
      await enterStudioAs(page, setup.actors.reviewer, settleActorTransitionEvidence);
      await page.getByLabel('Rationale', { exact: true }).fill('Independent Studio reviewer approved the exact generated version.');
      await page.getByRole('button', { name: 'Approve review', exact: true }).click();
      await expect(page.getByText('Approval ready committed.', { exact: true })).toBeVisible();
      await enterStudioAs(page, setup.actors.author, settleActorTransitionEvidence);
      await page.getByLabel('Rationale', { exact: true }).fill('Independent final approval binds the exact reviewed Studio version.');
      await page.getByRole('button', { name: 'Final approve', exact: true }).click();
      await expect(page.getByText('Approved committed.', { exact: true })).toBeVisible();
      observe('studio-artifact-approval', 'ui.studio-approved-exact-version');

      const beforeFailure = await control<StudioFailureFrame>('/control/studio-failure-frame', { projectName });
      await selectExactStudioTemplate(
        page.getByLabel('Exact approved Studio template', { exact: true }), setup.studioTemplate,
      );
      const hostedFailureRoute = async (route: import('@playwright/test').Route) => {
        const prepared = await prepareProductFaultRoute(route, async () => {
          await startProductAction(route.request());
          const requestBody = route.request().postDataJSON();
          const headers = await route.request().allHeaders();
          await control('/control/arm-browser-fault', {
            projectName,
            persona: 'author',
            kind: 'studio_failure_after_claim',
            commandType: requestBody.commandType ?? 'studio.document.generate',
            requestBody,
            accessToken: (headers.authorization ?? '').replace(/^Bearer\s+/iu, ''),
          });
        });
        if (!prepared) return;
        await route.fallback();
      };
      if (hostedAuthenticatedAcceptance || canonicalInvoiceExceptionJourney) {
        await page.route('**/functions/v1/studio-artifact-command', hostedFailureRoute);
      } else {
        await control('/control/fail-next-studio-provider', { projectName });
      }
      let failedGenerationApi: ApiResponseObservation;
      try {
        failedGenerationApi = await observeApiResponse(page, '/functions/v1/studio-artifact-command', () =>
          page.getByRole('button', { name: 'Generate governed package draft', exact: true }).click());
      } finally {
        if (hostedAuthenticatedAcceptance || canonicalInvoiceExceptionJourney) await page.unroute('**/functions/v1/studio-artifact-command', hostedFailureRoute);
      }
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
      bindObservedCase('STUDIO-003',failedGenerationApi.actionId);
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

  test('canonical AP Invoice Exception continues through Delivery package approval and read-only Monitor',
    { tag: '@v2-primary-prefix-diagnostic' }, async ({ page }, testInfo) => {
    test.skip(!canonicalInvoiceExceptionJourney,
      'the canonical AP Invoice Exception continuation is opt-in disposable evidence');
    const result = await runCanonicalInvoiceExceptionJourney({
      page,
      testInfo,
      setup,
      outputDirectory,
      enterAs,
      settleActorTransitionEvidence,
      clickProduct,
      upstreamOutputs: canonicalRepresentativeOutputs,
    });
    expect(result.status).toBe('passed');
    expect(result.assertions.providersOff).toBe(true);
    expect(result.assertions.actorBoundary15000ms).toBe(true);
  });

  if (authenticatedProductAcceptance) {
    test('independent reviewer rejects a separate current decision without mutating the approved primary chain', async ({ page }) => {
      const rejectionProjectName = `${projectName}-rejection`;
      const rejection = await control<FixtureSetup>('/control/setup', { projectName: rejectionProjectName });
      validateSetupLabels(rejection, rejectionProjectName, hostedAuthenticatedAcceptance);
      await enterProcessAs(page,rejection.actors.author,rejection.aliases.process,settleActorTransitionEvidence);
      await page.getByRole('button', { name: 'New assessment (V2)', exact: true }).click();
      await expect(page.getByText('V2 case created. Add the minimum assessment structure before finalization.', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Add minimum working structure', exact: true }).click();
      await completeRequiredAssessmentFacts(page);
      await page.getByRole('button', { name: 'Save V2 draft', exact: true }).click();
      await finalizeDecisionPack(page);
      await expect(page.getByText('Reviewer-ready Decision Pack finalized. It is read-only.', { exact: true })).toBeVisible();
      await enterProcessAs(page,rejection.actors.reviewer,rejection.aliases.process,settleActorTransitionEvidence);
      await selectReviewer(page,rejection.actors.reviewer);
      await page.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click();
      expect((await attestSubmittedEvidence(
        page, 'Independent evidence review before rejection.', actionReference,
      )).length).toBeGreaterThan(0);
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
      bindObservedCase('GOVERN-006',rejectionApi.actionId);
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
        settleActorTransitionEvidence,
        clickProduct,
        selectProjectScope,
        startTrackedRequest: hostedAuthenticatedAcceptance ? startProductAction : undefined,
      });
      const downstreamCases = result.cases.map(downstreamCaseToLocal);
      authenticatedCases.push(...downstreamCases);
      for (const item of result.observations) observe(`downstream-${item.caseId}`, item.assertionId);
      const deleteDenial = downstreamCases.find(item => item.testId === 'DELIVERY-004');
      if (!deleteDenial) throw new Error('AUTHENTICATED_E2E003_DENIAL_EVIDENCE_MISSING');
      bindObservedCase('E2E-003',...caseActionReferences(deleteDenial));
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
      bindObservedCase('E2E-002',...caseActionReferences(hitlPublication));
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
      const scenarioCases = await runAssessmentScenarioJourneys(page, testInfo.project.name,
        settleActorTransitionEvidence,
        hostedAuthenticatedAcceptance?startProductAction:undefined);
      authenticatedCases.push(...scenarioCases.map(scenarioCaseToLocal));
      for (const row of scenarioCases) for (const assertion of row.assertions) {
        observe(`scenario-${row.testId}`, assertion.id);
      }
    });

    test('authenticated Admin, AI and private Studio controls use server authority and measured storage boundaries', async ({ page }) => {
      const deps = {
        page,
        enterAs: (persona: 'admin' | 'non_admin') => enterAs(page,
          persona === 'admin' ? setup.actors.author : setup.actors.reviewer, settleActorTransitionEvidence),
        clickProduct: (product: 'Assess' | 'Admin' | 'Enterprise Intelligence' | 'Studio') => clickProduct(page, product),
        prepareCase: <T,>(testId: string) => control<T>('/control/authenticated-controls/prepare', { testId }),
        readServerFrame: (testId: string) => control<Record<string, unknown>>('/control/authenticated-controls/frame', { testId }),
        actionIdForRequest:actionReference,
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
