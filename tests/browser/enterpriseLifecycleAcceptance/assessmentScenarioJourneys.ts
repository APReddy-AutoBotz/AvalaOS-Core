import { expect, test, type Page, type Request } from '@playwright/test';
import type { FitBand } from '../../../services/assessV2/types';
import {
  authenticatedLifecycleAttestEverySubmittedEvidence as attestEvidence,
  authenticatedLifecycleClickProduct as clickProduct,
  authenticatedLifecycleCommitEligibleStudioHandoffRequest as commitEligibleHandoff,
  authenticatedLifecycleCommitPersistedStudioHandoffAction as commitPersistedHandoff,
  authenticatedLifecycleCompleteRequiredAssessmentFacts as completeFacts,
  authenticatedLifecycleControl as control,
  authenticatedLifecycleEnterAs as enterAs,
  authenticatedLifecycleOpenConnectedProcess as openConnectedProcess,
  authenticatedLifecycleEnterStudioAs as enterStudioAs,
  authenticatedLifecycleFinalizeDecisionPack as finalizeDecision,
  authenticatedLifecycleResolveEveryGovernControl as resolveGovernControls,
  authenticatedLifecycleSelectProjectScope as selectProjectScope,
  authenticatedLifecycleSelectReviewer as selectReviewer,
  authenticatedLifecyclePersistedHandoffTargetFromResponse as persistedHandoffTargetFromResponse,
  authenticatedLifecycleValidateSetupLabels as validateSetupLabels,
  type AuthenticatedAssessmentVariant,
  type AuthenticatedLifecycleSetup,
} from '../authenticatedLifecycleHarness';
import type { StudioDeliveryDownstreamFrame } from './studioDeliveryMonitorJourney';
import { authenticatedHostedActionIds } from '../authenticatedLifecycleHarness';
import { runV1AssessmentCompletion } from './v1AssessmentCompletion';

type ScenarioCaseId = 'E2E-005' | 'E2E-006';
const hostedAuthenticatedAcceptance = process.env.ENTERPRISE_LIFECYCLE_HOSTED_REAL_AUTH === 'true';
const ASSERTIONS: Record<ScenarioCaseId, readonly string[]> = {
  'E2E-005': ['production-low-suitability-decision', 'low-suitability-downstream-policy-preserved'],
  'E2E-006': ['production-strong-automation-decision', 'governed-downstream-approval-preserved'],
};

const enterProcessAs = async (
  page: Page,
  actor: AuthenticatedLifecycleSetup['actors']['author'],
  processLabel: string,
) => {
  await enterAs(page, actor);
  if (!(await page.getByRole('heading', { name: 'Process Catalog', exact: true }).isVisible().catch(() => false))) {
    await clickProduct(page, 'Assess');
  }
  return openConnectedProcess(page, processLabel);
};

type LifecycleFrame = Readonly<{
  decisions: number;
  approvedReviews: number;
  governResolutions: number;
  handoffs: number;
  sourcePackages: number;
  artifacts: number;
  artifactVersions: number;
  receipts: number;
  audits: number;
  targetHash: string;
}>;

type ScenarioDecision = Readonly<{
  decisionId: string;
  decisionVersion: string;
  ruleSetVersion: string;
  validationStatus: string;
  outputHash: string;
  confidence: string;
  processReadiness: string;
  candidateEvaluations: readonly Readonly<{ fit: FitBand }>[];
  gateResults: readonly Readonly<{ status: string }>[];
  interactionDecisions: readonly Readonly<{
    interactionId: string;
    readiness: Readonly<Record<string, string>>;
    approvalBoundActions: readonly string[];
    prohibitedActions: readonly string[];
  }>[];
  controlRequirements: readonly unknown[];
  sourceInteractions: readonly Readonly<{ interactionId: string; mode: string; highImpact: boolean; financialAction: boolean }>[];
  targetHash: string;
}>;

export type AssessmentScenarioCaseResult = Readonly<{
  testId: ScenarioCaseId;
  assertions: readonly Readonly<{ id: string; status: 'passed' }>[];
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
    targetBeforeHash: string;
    targetAfterHash: string;
  }>;
}>;

const expectDigest = (value: string) => expect(value).toMatch(/^sha256:[a-f0-9]{64}$/u);
type ObservedProductionResponse = Readonly<{ route: string; status: number; actionId?: Promise<string | null> }>;
type StudioArtifactCommandType =
  | 'studio.artifact.review.submit'
  | 'studio.artifact.review.assign'
  | 'studio.artifact.review.resolve'
  | 'studio.artifact.approval.resolve';
const waitForStudioArtifactCommand = (page: Page, commandType: StudioArtifactCommandType) => page.waitForResponse(response => {
  if (new URL(response.url()).pathname !== '/functions/v1/studio-artifact-command' || response.request().method() !== 'POST') return false;
  try { return (response.request().postDataJSON() as { commandType?: unknown }).commandType === commandType; }
  catch { return false; }
});
const commitStudioArtifactCommand = async (
  page: Page,
  commandType: StudioArtifactCommandType,
  click: () => Promise<void>,
  committedMessage: string,
) => {
  const [response] = await Promise.all([waitForStudioArtifactCommand(page, commandType), click()]);
  expect(response.status()).toBe(201);
  await expect(page.getByText(committedMessage, { exact: true })).toBeVisible();
};
const measuredResponses = (log: readonly ObservedProductionResponse[], start: number, routes: readonly string[]) => {
  const observed = log.slice(start).filter(item => routes.includes(item.route));
  for (const route of routes) {
    expect(observed.some(item => item.route === route), `No actual response was observed for ${route}`).toBe(true);
  }
  const result=observed.map(item => `${item.status} ${item.route}`);
  Object.defineProperty(result,authenticatedHostedActionIds,{value:observed.map(item=>item.actionId??Promise.resolve(null))});
  return result;
};
const createAndFinalizeDecision = async (
  page: Page,
  setup: AuthenticatedLifecycleSetup,
  variant: AuthenticatedAssessmentVariant,
  actionReference: (request: Request) => Promise<string | null>,
) => {
  const processId = await enterProcessAs(page, setup.actors.author, setup.aliases.process);
  await runV1AssessmentCompletion({
    page,
    identity: { actorId: setup.actors.author.user.id, processId },
    actionReference,
    runStep: (title, operation) => test.step(title, operation),
  });
  await page.getByRole('button', { name: 'Back to Process', exact: true }).click();
  await page.getByRole('button', { name: 'New assessment (V2)', exact: true }).click();
  await expect(page.getByText('V2 case created. Add the minimum assessment structure before finalization.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add minimum working structure', exact: true }).click();
  await completeFacts(page, variant);
  await page.getByRole('button', { name: 'Save V2 draft', exact: true }).click();
  await expect(page.getByText('Draft saved as a new immutable authoring version.', { exact: true })).toBeVisible();
  const before = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName: setup.projectName });
  await finalizeDecision(page);
  await expect(page.getByText('Reviewer-ready Decision Pack finalized. It is read-only.', { exact: true })).toBeVisible();
  const after = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName: setup.projectName });
  expect(after.decisions).toBe(before.decisions + 1);
  return control<ScenarioDecision>('/control/scenario-decision', { projectName: setup.projectName });
};

const approveGovernStudio = async (page: Page, setup: AuthenticatedLifecycleSetup) => {
  await enterProcessAs(page, setup.actors.reviewer, setup.aliases.process);
  let review = page.getByTestId('assess-v2-review-workspace');
  await selectReviewer(page, setup.actors.reviewer);
  await review.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click();
  expect(await attestEvidence(page, 'Scenario evidence independently verified.')).toBeGreaterThan(0);
  await review.getByLabel('Review rationale', { exact: true }).fill('The exact scenario decision and evidence are independently approved.');
  await review.getByRole('button', { name: 'Approve reviewed decision', exact: true }).click();
  await expect(page.getByText('Review resolution committed: Approved.', { exact: true })).toBeVisible();

  await enterProcessAs(page, setup.actors.approver, setup.aliases.process);
  review = page.getByTestId('assess-v2-review-workspace');
  expect(await resolveGovernControls(page)).toBeGreaterThan(0);
  await review.getByLabel('Govern rationale', { exact: true }).fill('Independent resolver confirmed every required scenario control.');
  await review.getByRole('button', { name: 'Resolve Govern controls', exact: true }).click();
  await expect(page.getByText('Govern resolution committed.', { exact: true })).toBeVisible();
  await review.getByRole('button', { name: 'Create durable Studio handoff', exact: true }).click();
  await expect(page.getByText('Studio handoff committed.', { exact: true })).toBeVisible();

  await enterStudioAs(page, setup.actors.approver);
  const requestedResponse = await commitEligibleHandoff(page);
  const requestedTarget = await persistedHandoffTargetFromResponse(requestedResponse, 'requested');
  await expect(page.getByText(/Handoff decision committed \(receipt .+\)\./u)).toBeVisible();
  await enterStudioAs(page, setup.actors.reviewer);
  const reviewedResponse = await commitPersistedHandoff(
    page,
    requestedTarget,
    'Approve review',
    'Independent scenario handoff review approved.',
  );
  const reviewedTarget = await persistedHandoffTargetFromResponse(reviewedResponse, 'approval_ready', requestedTarget);
  await expect(page.getByText(/Handoff decision committed \(receipt .+\)\./u)).toBeVisible();
  await enterStudioAs(page, setup.actors.author);
  const acceptedResponse = await commitPersistedHandoff(
    page,
    reviewedTarget,
    'Final accept',
    'Independent final acceptance for the scenario.',
  );
  const acceptedTarget = await persistedHandoffTargetFromResponse(acceptedResponse, 'approved', reviewedTarget);
  await expect(page.getByText(/Handoff decision committed \(receipt .+\)\./u)).toBeVisible();
  await enterStudioAs(page, setup.actors.approver);
  const consumedResponse = await commitPersistedHandoff(page, acceptedTarget, 'Start Studio draft', undefined, 'Outbox');
  await persistedHandoffTargetFromResponse(consumedResponse, 'consumed', acceptedTarget);
  await expect(page.getByText(/Handoff consumed and exact source package verified \(receipt .+\)\. Approval alone did not create a document\./u)).toBeVisible();
  const studio = page.getByTestId('studio-artifact-workspace');
  const template = studio.getByLabel('Exact approved Studio template', { exact: true });
  await template.selectOption({ index: 1 });
  await studio.getByRole('button', { name: 'Generate governed package draft', exact: true }).click();
  await expect(page.getByText(/Draft committed from exact Studio Source Package v\d+; v2 projection reloaded\./u)).toBeVisible();
  await commitStudioArtifactCommand(
    page,
    'studio.artifact.review.submit',
    () => page.getByRole('button', { name: 'Submit for review', exact: true }).click(),
    'Reviewer ready committed.',
  );
  await enterStudioAs(page, setup.actors.author);
  await page.getByLabel('Eligible independent reviewer', { exact: true }).selectOption(setup.actors.reviewer.user.id);
  await commitStudioArtifactCommand(
    page,
    'studio.artifact.review.assign',
    () => page.getByRole('button', { name: 'Assign reviewer', exact: true }).click(),
    'In review committed.',
  );
  await enterStudioAs(page, setup.actors.reviewer);
  await page.getByLabel('Rationale', { exact: true }).fill('Independent scenario Studio review approved.');
  await commitStudioArtifactCommand(
    page,
    'studio.artifact.review.resolve',
    () => page.getByRole('button', { name: 'Approve review', exact: true }).click(),
    'Approval ready committed.',
  );
  await enterStudioAs(page, setup.actors.author);
  await page.getByLabel('Rationale', { exact: true }).fill('Final approval binds the exact scenario version.');
  await commitStudioArtifactCommand(
    page,
    'studio.artifact.approval.resolve',
    () => page.getByRole('button', { name: 'Final approve', exact: true }).click(),
    'Approved committed.',
  );
};

const countDelta = (before: StudioDeliveryDownstreamFrame, after: StudioDeliveryDownstreamFrame) => Object.fromEntries(
  Object.entries(after.counts).map(([key, value]) => [key, value - before.counts[key as keyof typeof before.counts]]),
);

const runScenario = async (
  page: Page, project: string, variant: 'low-suitability' | 'strong-automation',
  productionResponses: readonly ObservedProductionResponse[],
  actionReference: (request: Request) => Promise<string | null>,
): Promise<AssessmentScenarioCaseResult> => {
  const testId: ScenarioCaseId = variant === 'low-suitability' ? 'E2E-005' : 'E2E-006';
  const responseStart = productionResponses.length;
  const projectName = `${project}-${variant}`;
  const setup = await control<AuthenticatedLifecycleSetup>('/control/setup', { projectName });
  validateSetupLabels(setup, projectName, hostedAuthenticatedAcceptance);
  const decisionBefore = await createAndFinalizeDecision(page, setup, variant, actionReference);
  expect(decisionBefore.outputHash).toMatch(/^[a-f0-9]{64}$/u); expectDigest(decisionBefore.targetHash);
  expect(decisionBefore.validationStatus).toBe('reviewer-ready');
  const writeDecisions = decisionBefore.interactionDecisions.filter(item => decisionBefore.sourceInteractions
    .some(source => source.interactionId === item.interactionId && source.mode === 'write'));
  expect(writeDecisions).toHaveLength(1);
  if (variant === 'low-suitability') {
    expect(writeDecisions[0].readiness.write).toBe('Prohibited');
    expect(decisionBefore.candidateEvaluations.some(item => item.fit === 'Ineligible')).toBe(true);
  } else {
    expect(writeDecisions[0].readiness.write).toBe('Ready');
    expect(decisionBefore.candidateEvaluations.some(item => item.fit === 'Strong Fit')).toBe(true);
    expect(writeDecisions[0].approvalBoundActions).toHaveLength(0);
    expect(writeDecisions[0].prohibitedActions).toHaveLength(0);
  }
  await approveGovernStudio(page, setup);
  await control('/control/bind-delivery-project-source', { projectName });
  await enterAs(page, setup.actors.approver);
  await selectProjectScope(page, setup.deliveryProject.name);
  await clickProduct(page, 'Studio');
  const publisher = page.getByTestId('studio-approved-artifact-publish');
  const item = publisher.getByTestId('studio-approved-work-items').getByRole('group').first();
  await item.getByRole('combobox', { name: 'Type', exact: true }).selectOption('Task');
  await item.getByLabel('Title', { exact: true }).fill(`${testId} governed scenario work item`);
  await item.getByLabel('Description', { exact: true }).fill('Human-authored downstream work bound to the exact finalized scenario decision.');
  await item.getByLabel('Acceptance criteria · one per line', { exact: true }).fill('The exact scenario policy and lineage remain preserved.');
  const before = await control<StudioDeliveryDownstreamFrame>('/control/downstream-frame', { projectName });
  const publicationResponseStart = productionResponses.length;
  await publisher.getByTestId('publish-approved-studio-artifact').click();
  await expect(publisher.getByRole('status')).toContainText('Published 1 approved work item');
  const after = await control<StudioDeliveryDownstreamFrame>('/control/downstream-frame', { projectName });
  expect(after.counts.publications).toBe(before.counts.publications + 1);
  expect(after.publication?.projectId).toBe(setup.deliveryProject.id);
  const decisionAfter = await control<ScenarioDecision>('/control/scenario-decision', { projectName });
  expect(decisionAfter).toEqual(decisionBefore);
  const publicationResponses = measuredResponses(productionResponses, publicationResponseStart,
    ['/functions/v1/studio-delivery-authority-command']);
  const result: AssessmentScenarioCaseResult = {
    testId, assertions: ASSERTIONS[testId].map(id => ({ id, status: 'passed' as const })),
    observations: {
      browser: { actions: ['Completed deterministic scenario facts', 'Finalized and independently approved the decision',
        'Resolved Govern controls', 'Generated and approved Studio output', 'Published one exact downstream work item'],
        result: variant === 'low-suitability'
          ? 'Persisted write readiness remained Prohibited and the exact low-suitability policy survived downstream publication.'
          : 'Persisted write readiness remained Ready with a Strong Fit candidate and governed approval survived downstream publication.' },
      api: { productionRoutes: ['/functions/v1/assess-v2-command', '/functions/v1/studio-artifact-command', '/functions/v1/studio-delivery-authority-command'],
        responses: measuredResponses(productionResponses, responseStart,
          ['/functions/v1/assess-v2-command', '/functions/v1/studio-artifact-command', '/functions/v1/studio-delivery-authority-command']) },
    },
    measurements: { setupExcluded: true, before, after, delta: countDelta(before, after), stateBeforeHash: before.writeFingerprint,
      stateAfterHash: after.writeFingerprint, targetBeforeHash: decisionBefore.targetHash, targetAfterHash: decisionAfter.targetHash },
  };
  Object.defineProperty(result,authenticatedHostedActionIds,{value:
    (publicationResponses as unknown as Record<symbol,Promise<string|null>[]>)[authenticatedHostedActionIds]??[]});
  return result;
};

export const runAssessmentScenarioJourneys = async (page: Page, project: string,
  startTrackedRequest?: (request: Request)=>Promise<string|null>) => {
  const productionResponses: ObservedProductionResponse[] = [];
  page.on('response', response => {
    const route = new URL(response.url()).pathname;
    if (route.startsWith('/functions/v1/')) productionResponses.push({ route, status: response.status(),
      actionId:startTrackedRequest?.(response.request()) });
  });
  const actionReference = (request: Request) => startTrackedRequest?.(request) ?? Promise.resolve(null);
  return [
    await runScenario(page, project, 'low-suitability', productionResponses, actionReference),
    await runScenario(page, project, 'strong-automation', productionResponses, actionReference),
  ] as const;
};
