import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { openProductNavigation } from '../productNavigationReadiness';

type FixtureActor = Readonly<{ token: string; user: Readonly<{ id: string; email: string }> }>;
type FixtureSetup = Readonly<{
  journeyBinding: string;
  aliases: Readonly<Record<'case' | 'review' | 'handoff' | 'artifact' | 'process', string>>;
  actors: Readonly<Record<'author' | 'reviewer' | 'approver', FixtureActor>>;
}>;
type ObservedStage = Readonly<{ id: string; uiObserved: true; reloadObserved?: true }>;
type MutationSnapshot = Readonly<{
  reviewAssignments: number;
  governResolutions: number;
  commandReceipts: number;
  privilegedAudits: number;
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

const controlToken = process.env.ENTERPRISE_LIFECYCLE_CONTROL_TOKEN ?? '';
const apiBaseUrl = process.env.ENTERPRISE_LIFECYCLE_API_BASE_URL ?? '';
const authStorageKey = process.env.ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY ?? 'sb-127-auth-token';
const outputDirectory = process.env.ENTERPRISE_LIFECYCLE_OUTPUT_DIR
  ?? path.join('output', 'acceptance', 'enterprise-lifecycle');
const required = (value: string, name: string) => {
  if (!value) throw new Error(`ENTERPRISE_LIFECYCLE_BROWSER_${name}_REQUIRED`);
  return value;
};
const loopbackBaseUrl = (value: string) => {
  const url = new URL(required(value, 'API_BASE_URL'));
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('ENTERPRISE_LIFECYCLE_BROWSER_NON_LOOPBACK_API_REJECTED');
  }
  return url.toString().replace(/\/$/u, '');
};
const control = async <T>(pathname: string, body?: unknown): Promise<T> => {
  const response = await fetch(`${loopbackBaseUrl(apiBaseUrl)}${pathname}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      'x-enterprise-lifecycle-control': required(controlToken, 'CONTROL_TOKEN'),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`ENTERPRISE_LIFECYCLE_CONTROL_FAILED:${pathname}:${response.status}`);
  return response.json() as Promise<T>;
};

const sessionFor = (actor: FixtureActor) => ({
  access_token: actor.token,
  refresh_token: `${actor.token}-refresh`,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { ...actor.user, aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: { provider: 'fixture' } },
});

const enterAs = async (page: Page, actor: FixtureActor) => {
  await page.goto('/');
  await page.evaluate(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session));
    localStorage.setItem('avalaos-core-v1-view', JSON.stringify('process_catalog'));
    localStorage.setItem('avalaos-core-v1-scope', JSON.stringify({ type: 'my_work' }));
  }, { key: authStorageKey, session: sessionFor(actor) });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
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

const attestEverySubmittedEvidence = async (page: Page, rationale: string) => {
  const workspace = page.getByTestId('assess-v2-review-workspace');
  let committed = 0;
  while (await workspace.getByRole('button', { name: 'Accept evidence', exact: true }).count()) {
    await workspace.getByLabel('Reviewer rationale', { exact: true }).first().fill(rationale);
    await workspace.getByRole('button', { name: 'Accept evidence', exact: true }).first().click();
    await expect(workspace.getByText('Evidence attestation committed: Evidence accepted.', { exact: true })).toBeVisible();
    committed += 1;
  }
  return committed;
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

const clickProduct = async (page: Page, label: string) => {
  let target = page.getByRole('button', { name: label, exact: true });
  if (!(await target.isVisible().catch(() => false))) {
    await openProductNavigation(page);
    target = page.getByRole('button', { name: label, exact: true });
  }
  await expect(target).toBeVisible();
  await target.click();
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
) => {
  const handoffCenter = page.getByRole('region', { name: 'Assess → Studio handoffs', exact: true });
  await expect(handoffCenter).toBeVisible();
  const mailboxTab = handoffCenter.getByRole('tab', { name: new RegExp(`^${mailbox} \\(\\d+\\)$`, 'u') });
  await mailboxTab.click();
  await expect(mailboxTab).toHaveAttribute('aria-selected', 'true');
  await handoffCenter.getByRole('button', { name: buttonName, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (rationale) await dialog.getByLabel('Decision rationale', { exact: true }).fill(rationale);
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(dialog).toBeHidden();
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

test.describe.configure({ mode: 'serial' });
test.describe('connected Assess, Govern and Studio lifecycle', () => {
  let setup: FixtureSetup;
  let projectName = '';
  let projectStartedAt = '';
  let failed = false;
  let externalRequests: string[] = [];
  let observedHttpRequests = 0;
  let nonLoopbackRequests = 0;
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
    };
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, `browser-${projectName}.json`), `${JSON.stringify(fragment, null, 2)}\n`, 'utf8');
  });

  test('authors, replays, rejects stale work, requests changes and resubmits through the production UI', async ({ page, context }) => {
    await enterProcessAs(page, setup.actors.author, setup.aliases.process);
    await page.getByRole('button', { name: 'New assessment (V2)', exact: true }).click();
    await expect(page.getByText('V2 case created. Add the minimum assessment structure before finalization.', { exact: true })).toBeVisible();
    observe('assess-create', 'ui.assess-created');

    await page.getByRole('button', { name: 'Add minimum working structure', exact: true }).click();
    await completeRequiredAssessmentFacts(page);
    await page.getByRole('button', { name: 'Save V2 draft', exact: true }).click();
    await expect(page.getByText('Draft saved as a new immutable authoring version.', { exact: true })).toBeVisible();
    await finalizeDecisionPack(page);
    await expect(page.getByText('Reviewer-ready Decision Pack finalized. It is read-only.', { exact: true })).toBeVisible();
    observe('assess-finalize', 'ui.assess-finalized');

    const replayPage = await context.newPage();
    const stalePage = await context.newPage();
    for (const reviewPage of [page, replayPage, stalePage]) {
      await enterProcessAs(reviewPage, setup.actors.reviewer, setup.aliases.process);
      await expect(reviewPage.getByTestId('assess-v2-review-workspace')).toContainText('Reviewer-ready');
    }
    await selectReviewer(page, setup.actors.reviewer);
    await selectReviewer(replayPage, setup.actors.reviewer);
    await selectReviewer(stalePage, setup.actors.approver);

    const beforeAssignment = await control<MutationSnapshot>('/control/snapshot');
    await page.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click();
    await expect(page.getByText(/Reviewer assignment committed\./u)).toBeVisible();
    const afterAssignment = await control<MutationSnapshot>('/control/snapshot');
    expect(afterAssignment).toEqual({
      reviewAssignments: beforeAssignment.reviewAssignments + 1,
      governResolutions: beforeAssignment.governResolutions,
      commandReceipts: beforeAssignment.commandReceipts + 1,
      privilegedAudits: beforeAssignment.privilegedAudits + 1,
    });
    observe('govern-assign', 'ui.review-assigned');

    await replayPage.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click();
    await expect(replayPage.getByText(/Reviewer assignment committed\./u)).toBeVisible();
    expect(await control<MutationSnapshot>('/control/snapshot')).toEqual(afterAssignment);
    observe('command-replay', 'ui.replay-no-new-effect');

    await stalePage.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click();
    await expect(stalePage.getByText('This assessment changed on the server. Reload it before retrying the action.', { exact: true })).toBeVisible();
    await expect(stalePage.getByText(/Reviewer assignment committed\./u)).toHaveCount(0);
    expect(await control<MutationSnapshot>('/control/snapshot')).toEqual(afterAssignment);
    observe('command-stale-denial', 'ui.stale-no-false-success');
    await replayPage.close();
    await stalePage.close();

    expect(await attestEverySubmittedEvidence(page, 'Independent evidence check before rework.')).toBeGreaterThan(0);
    observe('govern-attest', 'ui.evidence-attested');
    const reviewWorkspace = page.getByTestId('assess-v2-review-workspace');
    await reviewWorkspace.getByLabel('Review rationale', { exact: true }).fill('Clarify exception ownership before approval.');
    await reviewWorkspace.getByRole('button', { name: 'Request changes', exact: true }).click();
    await expect(page.getByText('Review resolution committed: Changes requested.', { exact: true })).toBeVisible();
    observe('govern-request-changes', 'ui.changes-requested');

    await enterProcessAs(page, setup.actors.author, setup.aliases.process);
    await page.getByLabel('Review rationale', { exact: true }).fill('Start the requested revision with clarified ownership.');
    await page.getByRole('button', { name: 'Start new draft revision', exact: true }).click();
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
    await finalizeDecisionPack(page);
    await expect(page.getByText('Reviewer-ready Decision Pack finalized. It is read-only.', { exact: true })).toBeVisible();
    observe('assess-resubmit', 'ui.resubmitted');
  });

  test('independent approval, Govern separation and synthetic Studio generation retain exact lineage', async ({ page }) => {
    await enterProcessAs(page, setup.actors.reviewer, setup.aliases.process);
    let reviewWorkspace = page.getByTestId('assess-v2-review-workspace');
    await selectReviewer(page, setup.actors.reviewer);
    await reviewWorkspace.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click();
    await expect(page.getByText(/Reviewer assignment committed\./u)).toBeVisible();
    expect(await attestEverySubmittedEvidence(page, 'Revised evidence independently verified.')).toBeGreaterThan(0);
    await reviewWorkspace.getByLabel('Review rationale', { exact: true }).fill('Revised decision and exact evidence are independently approved.');
    await reviewWorkspace.getByRole('button', { name: 'Approve reviewed decision', exact: true }).click();
    await expect(page.getByText('Review resolution committed: Approved.', { exact: true })).toBeVisible();
    observe('govern-approve', 'ui.independent-approved');

    await assertHighImpactFinancialGovernActions(page);
    await assertNoHorizontalViewportOverflow(page);
    expect(await resolveEveryGovernControl(page)).toBeGreaterThan(0);
    await reviewWorkspace.getByLabel('Govern rationale', { exact: true }).fill('The final reviewer must not resolve this financial high-impact decision.');
    const beforeFinalReviewerDenial = await control<MutationSnapshot>('/control/snapshot');
    await reviewWorkspace.getByRole('button', { name: 'Resolve Govern controls', exact: true }).click();
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
    await reviewWorkspace.getByRole('button', { name: 'Resolve Govern controls', exact: true }).click();
    await expect(page.getByText('Govern resolution committed.', { exact: true })).toBeVisible();
    observe('govern-resolve', 'ui.govern-resolved');

    await reviewWorkspace.getByRole('button', { name: 'Create durable Studio handoff', exact: true }).click();
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
    await commitStudioHandoffAction(page, 'Start Studio draft', undefined, 'Outbox');
    await expect(page.getByText(/Handoff consumed and exact source package verified \(receipt .+\)\./u)).toBeVisible();
    observe('studio-consume', 'ui.studio-lineage-consumed');

    const studioWorkspace = page.getByTestId('studio-artifact-workspace');
    const template = studioWorkspace.getByLabel('Exact approved Studio template', { exact: true });
    await expect(template.locator('option')).toHaveCount(2);
    await template.selectOption({ index: 1 });
    await studioWorkspace.getByRole('button', { name: 'Generate governed package draft', exact: true }).click();
    await expect(page.getByText(/Draft committed from exact Studio Source Package v\d+; v2 projection reloaded\./u)).toBeVisible();
    await expect(page.getByText('Current committed preview', { exact: true })).toBeVisible();
    observe('studio-synthetic-generation', 'ui.synthetic-provider-boundary');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('studio-artifact-workspace')).toBeVisible();
    await expect(page.getByText('Current committed preview', { exact: true })).toBeVisible();
  });
});
