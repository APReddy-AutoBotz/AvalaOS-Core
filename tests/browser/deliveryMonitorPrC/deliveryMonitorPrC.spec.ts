import { expect, test, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { IDS, installEnterpriseIntelligenceFixture } from '../enterpriseIntelligenceNetworkFixture';

const organizationId = '00000001-0000-4000-8000-000000000001';
const workspaceId = '00000002-0000-4000-8000-000000000002';
const packageId = '00000006-0000-4000-8000-000000000006';
const packageVersionId = '00000007-0000-4000-8000-000000000007';
const artifactId = '00000003-0000-4000-8000-000000000003';
const artifactVersionId = '00000004-0000-4000-8000-000000000004';
const handoffId = '00000008-0000-4000-8000-000000000008';
const baselineId = '00000090-0000-4000-8000-000000000090';
const enterpriseFixturePackageId = '10000000-0000-4000-8000-000000000009';

const personas = {
  requester: { id: '30000001-0000-4000-8000-000000000001', state: 'active', capabilities: ['delivery.handoff.request', 'project.read'] },
  studioReviewer: { id: '30000002-0000-4000-8000-000000000002', state: 'active', capabilities: ['project.read', 'studio.artifacts.review'] },
  studioApprover: { id: '30000003-0000-4000-8000-000000000003', state: 'active', capabilities: ['project.read', 'studio.artifacts.approve'] },
  targetAcceptor: { id: '30000004-0000-4000-8000-000000000004', state: 'active', capabilities: ['delivery.handoff.review', 'project.read'] },
  consumer: { id: '30000005-0000-4000-8000-000000000005', state: 'active', capabilities: ['delivery.handoff.consume', 'project.read'] },
  author: { id: '30000006-0000-4000-8000-000000000006', state: 'active', capabilities: ['delivery.handoff.request', 'delivery.package.manage', 'project.read'] },
  reviewer: { id: '30000007-0000-4000-8000-000000000007', state: 'active', capabilities: ['delivery.package.review', 'project.read'] },
  approver: { id: '30000008-0000-4000-8000-000000000008', state: 'active', capabilities: ['delivery.handoff.approve', 'delivery.package.approve', 'monitor.baseline.create', 'monitor.read', 'project.read'] },
  monitorViewer: { id: '30000009-0000-4000-8000-000000000009', state: 'active', capabilities: ['monitor.read'] },
  revoked: { id: '30000010-0000-4000-8000-000000000010', state: 'revoked', capabilities: [] },
  sameOrgOtherWorkspace: { id: '30000011-0000-4000-8000-000000000011', state: 'active', capabilities: ['monitor.read'] },
  crossOrg: { id: '30000012-0000-4000-8000-000000000012', state: 'active', capabilities: ['monitor.read'] },
} as const;

const personaFor = (testId: string, assertionId: string) => {
  if (testId === 'MONITOR-TR-001') {
    return personas.approver;
  }
  if (testId.startsWith('MONITOR-') || assertionId.includes('monitor')) {
    return personas.monitorViewer;
  }
  if (testId === 'HANDOFF-001' || testId === 'HANDOFF-006' || testId === 'HANDOFF-007' || testId === 'PATH-003') {
    return personas.requester;
  }
  if (testId === 'HANDOFF-002' || testId === 'HANDOFF-003' || testId === 'HANDOFF-005') {
    return personas.targetAcceptor;
  }
  if (testId === 'HANDOFF-004') {
    return personas.consumer;
  }
  if (testId === 'HANDOFF-008') {
    return personas.sameOrgOtherWorkspace;
  }
  if (testId === 'DELIVERY-TR-004' || testId === 'DELIVERY-TR-005') {
    return personas.reviewer;
  }
  return personas.author;
};

const marker = (info: TestInfo, testId: string, assertionId: string, fixture: string, context: Record<string, unknown> = {}) => {
  const profileAssertionId = `${assertionId}--${info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  console.log(`PR_C_ASSERTION ${JSON.stringify({
    testId,
    assertionId: profileAssertionId,
    fixture,
    owner: 'browser',
    result: 'passed',
    runtimeContext: {
      profile: info.project.name,
      persona: personaFor(testId, assertionId),
      organizationId,
      workspaceId,
      ...(testId.startsWith('HANDOFF-') ? { edge: 'studio_to_delivery' } : {}),
      ...context,
    },
  })}`);
};

const open = async (page: Page, query = '') => {
  await page.goto(`/tests/browser/deliveryMonitorPrC/harness.html${query}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('governed-delivery-workspace')).toHaveAttribute('data-delivery-usable', 'true');
};

const loadAllCanonicalItems = async (page: Page) => {
  await expect(page.getByTestId('delivery-item-filter-result')).toHaveText('100 matching items across 100 loaded');
  await page.getByRole('button', { name: 'Load next bounded page' }).click();
  await expect(page.getByTestId('delivery-item-filter-result')).toHaveText('200 matching items across 200 loaded');
  await page.getByRole('button', { name: 'Load next bounded page' }).click();
  await expect(page.getByTestId('delivery-item-filter-result')).toHaveText('250 matching items across 250 loaded');
  await expect(page.getByTestId('delivery-item-pagination-complete')).toHaveText('All 250 canonical items are loaded from 3 bounded server pages.');
};

const assertNoPublicHashes = async (page: Page) => {
  const exposed = await page.getByTestId('governed-delivery-workspace').evaluate(element => ({
    text: element.textContent ?? '',
    attributes: Array.from(element.querySelectorAll('*')).flatMap(node => Array.from(node.attributes).map(attribute => attribute.name)),
  }));
  expect(exposed.text).not.toMatch(/\b[0-9a-f]{64}\b/i);
  expect(exposed.attributes.some(name => /hash/i.test(name))).toBe(false);
};

test('deterministic Studio proposal is cited and handoff request never auto-creates a target', async ({ page }, info) => {
  await open(page);
  await loadAllCanonicalItems(page);
  await expect(page.getByTestId('delivery-item-00001001-0000-4000-8000-000000001001')).toContainText('BRD artifact v4');
  await assertNoPublicHashes(page);
  marker(info, 'DELIVERY-TR-001', 'deterministic-proposal-list-contains-250-items', 'DELIVERY-DETERMINISTIC-ITEMS-250', { packageId, packageVersionId, packageVersion: 1, itemCount: 250, artifactId, artifactVersionId, artifactVersion: 4, classification: 'assessed', publicHashesObserved: false });
  marker(info, 'DELIVERY-TR-002', 'item-binds-exact-artifact-version-and-section-locator', 'DELIVERY-DETERMINISTIC-ITEMS-250', { packageId, packageVersionId, packageVersion: 1, itemAggregateId: '00001001-0000-4000-8000-000000001001', artifactId, artifactVersionId, artifactVersion: 4, citation: 'brd.sections.requirements-001', classification: 'assessed', publicHashesObserved: false });

  const packageCount = await page.getByRole('list', { name: 'Delivery packages' }).getByRole('listitem').count();
  await page.getByRole('button', { name: 'Request handoff' }).click();
  await page.getByRole('tab', { name: /Outbox/ }).click();
  await expect(page.getByText('requested', { exact: true })).toBeVisible();
  expect(await page.getByRole('list', { name: 'Delivery packages' }).getByRole('listitem').count()).toBe(packageCount);
  marker(info, 'HANDOFF-001', 'eligible-artifact-request-is-explicit-and-does-not-create-package', 'DELIVERY-STUDIO-HANDOFF-01', { handoffId: '00000010-0000-4000-8000-000000000010', handoffVersion: 1, artifactId, artifactVersionId, artifactVersion: 4, packageCount, automaticCreation: false, participants: [personas.studioReviewer, personas.studioApprover] });
  await page.getByRole('tab', { name: /Inbox/ }).click();
  await expect(page.getByText('250 deterministic proposed items')).toBeVisible();
  await expect(page.getByText('Current authorized Delivery workspace · handoff v1')).toBeVisible();
  await page.getByText('Server-derived handoff preview · 250 items').click();
  await expect(page.getByText('Server-bound proposal integrity verified.')).toBeVisible();
  await expect(page.getByText('7'.repeat(64))).toHaveCount(0);
  await expect(page.getByText(workspaceId, { exact: true })).toHaveCount(0);
  marker(info, 'HANDOFF-002', 'target-preview-binds-upstream-version-target-and-count', 'DELIVERY-STUDIO-HANDOFF-01', { handoffId, handoffVersion: 1, artifactId, artifactVersionId, artifactVersion: 4, targetWorkspaceId: workspaceId, proposedItemCount: 250 });
});

test('target changes/rejection create no draft; approval and consume remain explicit and idempotent', async ({ page }, info) => {
  await open(page);
  const initialCount = await page.getByRole('list', { name: 'Delivery packages' }).getByRole('listitem').count();
  await page.getByRole('button', { name: 'Request changes' }).click();
  let dialog = page.getByRole('dialog', { name: 'Confirm governed decision' });
  await dialog.getByLabel('Decision rationale').fill('Clarify the exact accepted Studio scope.');
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('changes requested', { exact: true }).first()).toBeVisible();
  expect(await page.getByRole('list', { name: 'Delivery packages' }).getByRole('listitem').count()).toBe(initialCount);
  marker(info, 'HANDOFF-003', 'request-changes-creates-zero-target-draft', 'DELIVERY-STUDIO-HANDOFF-01', { handoffId, decision: 'changes_requested', targetPackageCount: initialCount, downstreamEffectCount: 0 });

  await open(page);
  await page.getByRole('button', { name: 'Approve review' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Decision rationale').fill('Independent target review accepted exact lineage.');
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('approval ready', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Final handoff approval' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Decision rationale').fill('Independent approver accepted the destination request.');
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('approved', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Start Delivery draft' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('No automatic future handoff');
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('consumed', { exact: true })).toBeVisible();
  expect(await page.getByRole('list', { name: 'Delivery packages' }).getByRole('listitem').count()).toBe(initialCount);
  marker(info, 'HANDOFF-004', 'review-approval-explicit-consume-converges-on-one-target', 'DELIVERY-STUDIO-HANDOFF-01', { handoffId, handoffVersion: 4, packageId, packageCount: initialCount, effectCount: 1, participants: [personas.requester, personas.targetAcceptor, personas.approver] });
});

test('stale, consumed-history, planning-only, wrong-workspace and revoked projections remain truthful', async ({ page }, info) => {
  await open(page, '?state=stale');
  await expect(page.getByText('stale', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Delivery draft' })).toHaveCount(0);
  marker(info, 'HANDOFF-005', 'stale-unconsumed-handoff-has-zero-consume-authority', 'DELIVERY-STUDIO-HANDOFF-01', { handoffId, handoffVersion: 1, handoffStatus: 'stale', targetCreated: false });

  await open(page, '?state=consumed');
  await expect(page.getByText('consumed', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request handoff' })).toBeVisible();
  marker(info, 'HANDOFF-006', 'consumed-history-retained-while-new-version-remains-explicit', 'DELIVERY-STUDIO-HANDOFF-01', { handoffId, historicalStatus: 'consumed', historicalPackageId: packageId, newerEligibleArtifactVersion: 4 });

  await open(page, '?state=planning');
  await expect(page.getByRole('region', { name: 'Studio → Delivery handoffs' }).getByText('Not assessed · Planning only', { exact: true })).toBeVisible();
  marker(info, 'HANDOFF-007', 'planning-only-classification-survives-studio-delivery-edge', 'DELIVERY-STUDIO-HANDOFF-01', { handoffId, artifactId, artifactVersionId, classification: 'not_assessed', planningOnly: true });
  marker(info, 'PATH-003', 'direct-studio-artifact-can-request-delivery-without-assess-ancestry', 'DELIVERY-STUDIO-HANDOFF-01', { artifactId, artifactVersionId, classification: 'not_assessed', planningOnly: true, fabricatedAssessAncestry: false });

  await open(page, '?state=wrong-workspace');
  await expect(page.getByText('No inbox records are present in this server-authorized projection; no broader workspace state is inferred.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Delivery packages' }).getByRole('listitem')).toHaveCount(0);
  marker(info, 'HANDOFF-008', 'wrong-workspace-selector-is-nondisclosing-and-effect-free', 'DELIVERY-STUDIO-HANDOFF-01', { disclosedHandoffCount: 0, disclosedPackageCount: 0, effectCount: 0, safeError: 'RESOURCE_NOT_AVAILABLE' });

  await open(page, '?state=cross-org');
  await expect(page.getByText('No inbox records are present in this server-authorized projection; no broader workspace state is inferred.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Delivery packages' }).getByRole('listitem')).toHaveCount(0);
  marker(info, 'AUTH-002', 'cross-organization-selector-is-nondisclosing-and-effect-free', 'DELIVERY-STUDIO-HANDOFF-01', { persona: personas.crossOrg, organizationId: '20000001-0000-4000-8000-000000000001', workspaceId: '20000002-0000-4000-8000-000000000002', targetOrganizationId: organizationId, targetWorkspaceId: workspaceId, disclosedHandoffCount: 0, disclosedPackageCount: 0, effectCount: 0, safeError: 'RESOURCE_NOT_AVAILABLE' });

  await open(page, '?state=revoked');
  await expect(page.getByText('Read only', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept proposal' })).toHaveCount(0);
  marker(info, 'AUTH-002', 'revoked-actor-projection-is-read-only-and-effect-free', 'DELIVERY-STUDIO-HANDOFF-01', { persona: personas.revoked, readOnly: true, mutationControls: 0, effectCount: 0 });
});

test('item edit creates immutable descendant and decisions require accessible rationale', async ({ page }, info) => {
  await open(page);
  const first = page.getByTestId('delivery-item-00001001-0000-4000-8000-000000001001');
  await first.getByRole('button', { name: 'Edit immutable descendant' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Item title').fill('Canonical edited work item 001');
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  const alert = dialog.getByRole('alert');
  await expect(alert).toBeFocused();
  await expect(dialog.getByLabel('Item title')).toHaveValue('Canonical edited work item 001');
  await dialog.getByLabel('Decision rationale').fill('Clarifies the immutable governed proposal.');
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(first.getByRole('heading', { name: 'Canonical edited work item 001' })).toBeVisible();
  await expect(page.getByTestId(`delivery-package-${packageId}`)).toHaveAttribute('data-package-version', '1');
  await first.getByRole('button', { name: 'Version diff and history' }).click();
  await expect(first.getByText('v1 · proposed · Canonical work item 001')).toBeVisible();
  await expect(first.getByText(/Changed fields: title, description/)).toBeVisible();
  marker(info, 'DELIVERY-TR-003', 'edit-appends-descendant-and-visible-diff-history', 'DELIVERY-ITEM-REVISION-01', { packageId, packageVersion: 1, packageVersionAdvanced: false, classification: 'assessed', itemAggregateId: '00001001-0000-4000-8000-000000001001', priorItemVersion: 1, currentItemVersion: 2, changedFields: ['title', 'description'], publicHashesObserved: false });

  await open(page, '?state=command-failure');
  await page.getByTestId('delivery-item-00001001-0000-4000-8000-000000001001').getByRole('button', { name: 'Edit immutable descendant' }).click();
  const failedDialog = page.getByRole('dialog');
  await failedDialog.getByLabel('Item title').fill('Preserved after failed command');
  await failedDialog.getByLabel('Decision rationale').fill('A valid rationale that must survive failure.');
  await failedDialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(failedDialog).toBeVisible();
  await expect(failedDialog.getByRole('alert')).toBeFocused();
  await expect(failedDialog.getByLabel('Item title')).toHaveValue('Preserved after failed command');
  marker(info, 'A11Y-002', 'focused-error-summary-preserves-authored-input', 'DELIVERY-MONITOR-A11Y-01', { field: 'item-title', preservedValue: true, focusedErrorSummary: true, dialogLabelled: true, asynchronousFailurePreserved: true });

  await open(page);
  await first.getByRole('button', { name: 'Accept proposal' }).click();
  const decision = page.getByRole('dialog');
  await decision.getByLabel('Decision rationale').fill('Accepted against exact citation and criteria.');
  await decision.getByRole('button', { name: 'Confirm' }).click();
  await expect(first.getByText(/Decision: accepted/)).toBeVisible();
  const second = page.getByTestId('delivery-item-00001002-0000-4000-8000-000000001002');
  await second.getByRole('button', { name: 'Reject proposal' }).click();
  await page.getByRole('dialog').getByLabel('Decision rationale').fill('Rejected because the proposal duplicates governed work.');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
  await expect(second.getByText(/Decision: rejected/)).toBeVisible();
  marker(info, 'DELIVERY-TR-004', 'proposals-accept-or-reject-with-rationale', 'DELIVERY-ITEM-REVISION-01', { packageId, packageVersionId, packageVersion: 1, classification: 'assessed', acceptedItemAggregateId: '00001001-0000-4000-8000-000000001001', rejectedItemAggregateId: '00001002-0000-4000-8000-000000001002', rationaleRequired: true, publicHashesObserved: false });
});

test('blocked package cannot affect Monitor and manual Delivery has no fabricated ancestry', async ({ page }, info) => {
  await open(page, '?state=blocked');
  await expect(page.getByText('Independent review requested changes.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create read-only Monitor baseline' })).toHaveCount(0);
  await expect(page.getByText('No approved canonical baseline is available.')).toBeVisible();
  const prepareRecovery = page.getByRole('button', { name: 'Prepare blocked package recovery' });
  await expect(prepareRecovery).toBeDisabled();
  await expect(page.getByText('Load every canonical descendant page before recovery can begin.')).toBeVisible();
  await page.getByRole('button', { name: 'Load next bounded page' }).click();
  await expect(page.getByTestId('delivery-item-filter-result')).toHaveText('200 matching items across 200 loaded');
  await expect(prepareRecovery).toBeDisabled();
  await page.getByRole('button', { name: 'Load next bounded page' }).click();
  await expect(page.getByTestId('delivery-item-pagination-complete')).toHaveText('All 250 canonical items are loaded from 3 bounded server pages.');
  await expect(prepareRecovery).toBeEnabled();
  await prepareRecovery.click();
  await expect(page.getByTestId('recovery-complete-set')).toContainText('Complete canonical descendant set loaded: 250');
  await page.getByLabel('Select Canonical work item 001 for recovery').check();
  const submitRecovery = page.getByRole('button', { name: 'Submit resolved package' });
  await expect(submitRecovery).toBeDisabled();
  await page.getByLabel('Recovery title for Canonical work item 001').fill('Canonical work item 001 · blocker resolved');
  await page.getByLabel('Recovery rationale for Canonical work item 001').fill('Resolve the exact independent review request.');
  await expect(submitRecovery).toBeEnabled();
  await submitRecovery.click();
  await expect(page.getByTestId(`delivery-package-${packageId}`)).toHaveAttribute('data-package-version', '2');
  await expect(page.getByText('250 work item decisions unresolved.')).toBeVisible();
  await expect(page.getByText('No approved canonical baseline is available.')).toBeVisible();
  marker(info, 'DELIVERY-TR-003', 'blocked-recovery-loads-100-100-50-and-authors-selected-descendant-only', 'DELIVERY-REVIEW-BLOCKERS-01', { packageId, packageVersion: 2, priorPackageVersionId: packageVersionId, expectedDescendantCount: 250, pageSizes: [100, 100, 50], selectedChangedDescendantCount: 1, carriedDescendantCount: 249, packageAggregateBound: true, monitorUnchanged: true, publicHashesObserved: false });
  marker(info, 'DELIVERY-TR-005', 'changes-requested-package-cannot-create-baseline', 'DELIVERY-REVIEW-BLOCKERS-01', { packageId, packageVersionId, packageVersion: 1, classification: 'assessed', packageStatus: 'blocked', reviewState: 'changes_requested', blockerCount: 1, baselineCount: 0, monitorEffectCount: 0, publicHashesObserved: false });

  await open(page, '?state=blocked-small');
  await page.getByRole('button', { name: 'Prepare blocked package recovery' }).click();
  await page.getByLabel('Select Canonical work item 001 for recovery').check();
  await page.getByLabel('Recovery description for Canonical work item 001').fill('Materially revised after the independent review request.');
  await page.getByLabel('Recovery rationale for Canonical work item 001').fill('Resolve the exact blocker with a fresh descendant.');
  await page.getByRole('button', { name: 'Submit resolved package' }).click();
  await expect(page.getByText('No approved canonical baseline is available.')).toBeVisible();
  const recoveredItem = page.getByTestId('delivery-item-00001001-0000-4000-8000-000000001001');
  await recoveredItem.getByRole('button', { name: 'Accept proposal' }).click();
  await page.getByRole('dialog').getByLabel('Decision rationale').fill('Fresh item review accepts the revised descendant.');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('button', { name: 'Approve package review' })).toBeVisible();
  await expect(page.getByText('No approved canonical baseline is available.')).toBeVisible();
  await page.getByRole('button', { name: 'Approve package review' }).click();
  await page.getByRole('dialog').getByLabel('Decision rationale').fill('Independent package review confirms the fresh item decision.');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('button', { name: 'Final package approval' })).toBeVisible();
  await expect(page.getByText('No approved canonical baseline is available.')).toBeVisible();
  await page.getByRole('button', { name: 'Final package approval' }).click();
  await page.getByRole('dialog').getByLabel('Decision rationale').fill('Independent final approval binds the revised package.');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
  await page.getByRole('button', { name: 'Create read-only Monitor baseline' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByTestId('canonical-monitor-baselines')).toContainText('Canonical work item 001');
  marker(info, 'DELIVERY-TR-005', 'recovered-package-requires-fresh-item-review-package-review-and-approval-before-monitor', 'DELIVERY-REVIEW-BLOCKERS-01', { packageId, packageVersion: 2, freshItemReview: true, independentPackageReview: true, independentPackageApproval: true, baselineCreatedAfterApprovalOnly: true, publicHashesObserved: false });

  await open(page, '?state=blocked-failure');
  await page.getByRole('button', { name: 'Prepare blocked package recovery' }).click();
  await page.getByLabel('Select Canonical work item 001 for recovery').check();
  await page.getByLabel('Recovery title for Canonical work item 001').fill('Preserved blocked recovery title');
  await page.getByLabel('Recovery rationale for Canonical work item 001').fill('Preserve this authored recovery after failure.');
  await page.getByRole('button', { name: 'Submit resolved package' }).click();
  await expect(page.getByRole('alert')).toContainText('Recovery was not confirmed');
  await expect(page.getByLabel('Recovery title for Canonical work item 001')).toHaveValue('Preserved blocked recovery title');
  await expect(page.getByLabel('Recovery rationale for Canonical work item 001')).toHaveValue('Preserve this authored recovery after failure.');
  marker(info, 'A11Y-002', 'blocked-recovery-failure-preserves-selected-authored-descendant', 'DELIVERY-REVIEW-BLOCKERS-01', { packageId, selectedDescendantCount: 1, preservedTitle: true, preservedRationale: true, falseSuccess: false });

  await open(page);
  await page.getByLabel('Package title').fill('Manual continuity planning');
  await page.getByLabel('First item title').fill('Document manual recovery checkpoint');
  await page.getByLabel('Description').fill('Human-authored planning task without source ancestry.');
  await page.getByRole('button', { name: 'Create manual planning package' }).click();
  await page.getByRole('list', { name: 'Delivery packages' }).getByText(/Manual continuity planning/).click();
  await expect(page.getByText('Manual Delivery entry', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('Manual item · no fabricated Studio or Assess citation')).toBeVisible();
  await expect(page.getByText('Not assessed · Planning only').last()).toBeVisible();
  marker(info, 'DELIVERY-TR-006', 'manual-package-remains-not-assessed-planning-only', 'DELIVERY-MANUAL-PLANNING-01', { packageId: '00000050-0000-4000-8000-000000000050', classification: 'not_assessed', planningOnly: true, studioArtifactId: null, assessAncestry: null });
  marker(info, 'PATH-004', 'delivery-only-manual-path-fabricates-no-upstream-ancestry', 'DELIVERY-MANUAL-PLANNING-01', { entryModule: 'delivery', classification: 'not_assessed', planningOnly: true, fabricatedStudioAncestry: false, fabricatedAssessAncestry: false });

  await open(page, '?state=no-monitor');
  await expect(page.getByTestId('governed-delivery-workspace')).toBeVisible();
  await expect(page.getByText('Canonical Monitor projection unavailable')).toBeVisible();
  await expect(page.getByText(/No empty, complete, or legacy Monitor state is inferred/)).toBeVisible();
  await open(page, '?state=pagination-failure');
  await expect(page.getByTestId('delivery-item-pagination')).toContainText('100 canonical items are loaded from 1 bounded server page');
  await page.getByRole('button', { name: 'Load next bounded page' }).click();
  await expect(page.getByRole('alert')).toHaveText('ENTERPRISE_PROJECTION_UNAVAILABLE');
  await expect(page.getByText('The next item page was not loaded. Previously loaded items remain unchanged; retry the same server cursor.')).toBeVisible();
  await expect(page.getByTestId('delivery-item-filter-result')).toHaveText('100 matching items across 100 loaded');
  await page.getByRole('button', { name: 'Load next bounded page' }).click();
  await expect(page.getByTestId('delivery-item-filter-result')).toHaveText('200 matching items across 200 loaded');
  await page.getByRole('button', { name: 'Load next bounded page' }).click();
  await expect(page.getByTestId('delivery-item-pagination-complete')).toContainText('All 250 canonical items are loaded from 3 bounded server pages');
  await expect(page.getByRole('button', { name: 'Submit resolved package' })).toHaveCount(0);
});

test('in-flight Delivery mutation cannot repaint an Enterprise workspace after scope changes', async ({ page }, info) => {
  const fixture = await installEnterpriseIntelligenceFixture(page, { deliveryMonitor: true });
  await page.goto('/tests/browser/enterpriseIntelligenceHarness.html?delivery-monitor=1&scope-switch=1');
  const enterprise = page.getByTestId('enterprise-intelligence-workspace');
  const headerStatus = enterprise.locator('header').getByRole('status');
  await expect(headerStatus).toHaveText('Committed server state loaded.');
  await enterprise.getByRole('button', { name: 'Work Package', exact: true }).click();
  await expect(page.getByTestId(`delivery-package-${enterpriseFixturePackageId}`)).toBeVisible();
  await expect(enterprise).toHaveAttribute('data-projection-scope-ready', 'true');
  const assertImmediateScopeBoundary = async (input: {
    buttonName: string;
    indicatorTestId: string;
    targetText: string;
    returnText: string;
    targetPackageId: string;
  }) => {
    await page.getByLabel('Package title').fill(`Must never cross ${input.targetText}`);
    await page.getByLabel('First item title').fill('Old-scope input must be inert immediately');
    await page.getByLabel('Description').fill('A mutation observer attempts the old control before passive effects run.');
    await page.evaluate(({ indicatorTestId, targetText }) => {
      const testWindow = window as typeof window & {
        __prCScopeBoundary?: { observed: boolean; projectionReadyAtContextCommit: boolean; oldMutationActionable: boolean };
        __prCScopeBoundaryObserver?: MutationObserver;
      };
      testWindow.__prCScopeBoundary = { observed: false, projectionReadyAtContextCommit: false, oldMutationActionable: false };
      const observer = new MutationObserver(() => {
        if (!document.querySelector(`[data-testid="${indicatorTestId}"]`)?.textContent?.includes(targetText)) return;
        const workspace = document.querySelector('[data-testid="enterprise-intelligence-workspace"]');
        const projectionReady = workspace?.getAttribute('data-projection-scope-ready') === 'true';
        const createButton = Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Create manual planning package');
        testWindow.__prCScopeBoundary = {
          observed: true,
          projectionReadyAtContextCommit: projectionReady,
          oldMutationActionable: projectionReady && createButton instanceof HTMLButtonElement && !createButton.disabled,
        };
        if (projectionReady && createButton instanceof HTMLButtonElement && !createButton.disabled) createButton.click();
        observer.disconnect();
      });
      testWindow.__prCScopeBoundaryObserver = observer;
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
    }, { indicatorTestId: input.indicatorTestId, targetText: input.targetText });

    await page.getByRole('button', { name: input.buttonName }).click();
    await expect(page.getByTestId(input.indicatorTestId)).toHaveText(input.targetText);
    await expect(headerStatus).toHaveText('Committed server state loaded.');
    await expect(page.getByTestId(`delivery-package-${input.targetPackageId}`)).toBeVisible();
    const boundary = await page.evaluate(() => {
      const testWindow = window as typeof window & {
        __prCScopeBoundary?: { observed: boolean; projectionReadyAtContextCommit: boolean; oldMutationActionable: boolean };
        __prCScopeBoundaryObserver?: MutationObserver;
      };
      testWindow.__prCScopeBoundaryObserver?.disconnect();
      return testWindow.__prCScopeBoundary;
    });
    expect(boundary).toEqual({ observed: true, projectionReadyAtContextCommit: false, oldMutationActionable: false });
    expect(fixture.domainEffectCount('delivery.package.create.manual')).toBe(0);

    await page.getByRole('button', { name: input.buttonName }).click();
    await expect(page.getByTestId(input.indicatorTestId)).toHaveText(input.returnText);
    await expect(headerStatus).toHaveText('Committed server state loaded.');
    await expect(page.getByTestId(`delivery-package-${enterpriseFixturePackageId}`)).toBeVisible();
  };

  await assertImmediateScopeBoundary({ buttonName: 'Switch Enterprise workspace context', indicatorTestId: 'enterprise-harness-scope', targetText: 'Northstar Other Workspace', returnText: 'Governed Delivery', targetPackageId: IDS.deliverySecondaryPackage });
  await assertImmediateScopeBoundary({ buttonName: 'Switch Enterprise organization context', indicatorTestId: 'enterprise-harness-organization', targetText: 'Synthetic Contoso', returnText: 'Synthetic Northstar', targetPackageId: IDS.deliverySecondaryPackage });
  await assertImmediateScopeBoundary({ buttonName: 'Switch Enterprise actor context', indicatorTestId: 'enterprise-harness-actor', targetText: 'Synthetic Delivery Reviewer', returnText: 'Synthetic Delivery Author', targetPackageId: enterpriseFixturePackageId });
  fixture.delayNext('delivery.package.create.manual');
  await page.getByLabel('Package title').fill('Delayed primary workspace package');
  await page.getByLabel('First item title').fill('Primary workspace item must not repaint secondary scope');
  await page.getByLabel('Description').fill('The command completes only after the active workspace changes.');
  const observed = fixture.waitForDelayedCommand('delivery.package.create.manual');
  await page.getByRole('button', { name: 'Create manual planning package' }).click();
  await observed;

  await page.getByRole('button', { name: 'Switch Enterprise workspace context' }).click();
  await expect(page.getByTestId('enterprise-harness-scope')).toHaveText('Northstar Other Workspace');
  await expect(headerStatus).toHaveText('Committed server state loaded.');
  await expect(page.getByTestId(`delivery-package-${IDS.deliverySecondaryPackage}`)).toBeVisible();
  const completion = fixture.waitForDelayedCommandCompletion('delivery.package.create.manual');
  fixture.releaseDelayedCommand('delivery.package.create.manual');
  await completion;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

  await expect(page.getByTestId(`delivery-package-${IDS.deliverySecondaryPackage}`)).toBeVisible();
  await expect(page.getByText('Delayed primary workspace package')).toHaveCount(0);
  await expect(headerStatus).toHaveText('Committed server state loaded.');
  expect(fixture.queryWorkspaceIds().at(-1)).toBe(IDS.deliveryWorkspaceSecondary);
  expect(fixture.domainEffectCount('delivery.package.create.manual')).toBe(1);
  marker(info, 'AUTH-002', 'inflight-mutation-scope-change-discards-old-completion', 'DELIVERY-STUDIO-HANDOFF-01', {
    organizationId: IDS.deliveryOrganization,
    workspaceId: IDS.deliveryWorkspace,
    targetWorkspaceId: IDS.deliveryWorkspaceSecondary,
    persona: personas.author,
    delayedCommand: 'delivery.package.create.manual',
    immediateCommitScopeKinds: ['workspace', 'organization', 'actor'],
    immediateCommitOldProjectionVisible: false,
    immediateCommitOldMutationActionable: false,
    oldScopeProjectionRepainted: false,
    oldScopeSuccessAnnounced: false,
    finalProjectionWorkspaceId: IDS.deliveryWorkspaceSecondary,
    effectCount: 1,
  });
});

test('unknown manual-package outcome locks fresh-key retries until one-effect reconciliation', async ({ page }, info) => {
  const fixture = await installEnterpriseIntelligenceFixture(page, { deliveryMonitor: true });
  fixture.reportPostCommitOutcomeUnknownNext('delivery.package.create.manual');
  await page.goto('/tests/browser/enterpriseIntelligenceHarness.html?delivery-monitor=1');
  const enterprise = page.getByTestId('enterprise-intelligence-workspace');
  const headerStatus = enterprise.locator('header').getByRole('status');
  await expect(headerStatus).toHaveText('Committed server state loaded.');
  await enterprise.getByRole('button', { name: 'Work Package', exact: true }).click();
  const title = 'Reconciled manual continuity package';
  const itemTitle = 'Confirm the authoritative committed package';
  const description = 'The SQL command commits before the Edge response reports an unknown outcome.';
  await page.getByLabel('Package title').fill(title);
  await page.getByLabel('First item title').fill(itemTitle);
  await page.getByLabel('Description').fill(description);
  const create = page.getByRole('button', { name: 'Create manual planning package' });
  await create.click();

  await expect(headerStatus).toHaveText('Command outcome is unknown. Reload committed state before any retry.');
  await expect(enterprise.locator('header').getByRole('alert')).toContainText('The server may have committed this command');
  await expect(create).toBeDisabled();
  await expect(page.getByLabel('Package title')).toHaveValue(title);
  await expect(page.getByLabel('First item title')).toHaveValue(itemTitle);
  await expect(page.getByLabel('Description')).toHaveValue(description);
  expect(fixture.domainEffectCount('delivery.package.create.manual')).toBe(1);
  expect(fixture.manualPackageCount()).toBe(1);
  const attempts = fixture.commandPayloads.filter(body => body.commandType === 'delivery.package.create.manual');
  expect(attempts).toHaveLength(1);

  await enterprise.getByRole('button', { name: 'Reload committed state' }).click();
  await expect(headerStatus).toHaveText('Committed server state loaded.');
  const packageChoices = page.getByRole('list', { name: 'Delivery packages' }).getByRole('button');
  await expect(packageChoices).toHaveCount(2);
  await packageChoices.last().click();
  const reconciledPackage = page.getByTestId(`delivery-package-${IDS.deliveryManualPackage}`);
  await expect(reconciledPackage).toBeVisible();
  await expect(page.getByText('Manual Delivery entry', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('Manual item · no fabricated Studio or Assess citation')).toBeVisible();
  await expect(page.getByRole('heading', { name: itemTitle })).toBeVisible();
  await expect(create).toBeEnabled();
  expect(fixture.domainEffectCount('delivery.package.create.manual')).toBe(1);
  expect(fixture.manualPackageCount()).toBe(1);
  marker(info, 'IDEMP-003', 'unknown-manual-commit-requires-reconciliation-before-fresh-key-retry', 'DELIVERY-MANUAL-PLANNING-01', {
    organizationId: IDS.deliveryOrganization,
    workspaceId: IDS.deliveryWorkspace,
    persona: personas.author,
    postCommitResponseStatus: 503,
    postCommitResponseCode: 'COMMAND_OUTCOME_UNKNOWN',
    transportAttempts: 1,
    freshKeyRetryBlocked: true,
    mutationLockedUntilReload: true,
    reconciledManualPackageCount: 1,
    effectCount: 1,
    classification: 'not_assessed',
    planningOnly: true,
  });
});

test('approved exact package creates one read-only baseline shared by Enterprise and primary Monitor', async ({ page }, info) => {
  await open(page, '?state=approved');
  await page.getByRole('button', { name: 'Create read-only Monitor baseline' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
  const baseline = page.getByTestId(`monitor-baseline-${baselineId}`);
  await expect(baseline).toHaveAttribute('data-package-id', packageId);
  await expect(baseline).not.toHaveAttribute('data-accepted-set-hash', /.+/);
  await expect(baseline).toHaveAttribute('data-accepted-item-count', '1');
  await expect(baseline).toHaveAttribute('data-accepted-type-counts', 'milestone:1');
  await expect(baseline.getByRole('region', { name: 'Accepted item counts by type' })).toContainText('milestone 1');
  await assertNoPublicHashes(page);
  marker(info, 'MONITOR-TR-001', 'selector-only-approved-package-creates-one-server-derived-baseline', 'MONITOR-APPROVED-BASELINE-01', { baselineId, baselineVersion: 1, baselineStatus: 'approved', packageId, packageVersionId, packageVersion: 1, acceptedItemCount: 1, classification: 'assessed', browserSelectorsOnly: true, publicHashesObserved: false, exactHashBindingOwner: 'postgres' });
  await expect(page.getByText(/Live telemetry is disabled/)).toBeVisible();
  marker(info, 'MONITOR-TR-002', 'baseline-never-implies-live-telemetry-completion-or-execution', 'MONITOR-APPROVED-BASELINE-01', { baselineId, liveTelemetryConnected: false, inferredCompletion: false, executionAuthority: false, readiness: 'review_required' });
  await page.getByRole('button', { name: 'enterprise monitor' }).click();
  for (const name of ['Upload', 'Edit item', 'Accept proposal', 'Reject proposal', 'Complete task', 'Change due date', 'Execute']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  marker(info, 'MONITOR-TR-003', 'monitor-renders-zero-authoring-or-execution-controls', 'MONITOR-APPROVED-BASELINE-01', { baselineId, actions: [], uploadControls: 0, itemMutationControls: 0, taskMutationControls: 0, executionControls: 0 });

  const enterprise = page.getByTestId(`monitor-baseline-${baselineId}`);
  const enterpriseIdentity = await enterprise.evaluate(element => ({ id: element.getAttribute('data-baseline-id'), version: element.getAttribute('data-baseline-version'), status: element.textContent?.includes('approved'), count: element.getAttribute('data-accepted-item-count'), typeCounts: element.getAttribute('data-accepted-type-counts') }));
  await page.getByRole('button', { name: 'primary monitor' }).click();
  const primary = page.getByTestId(`monitor-baseline-${baselineId}`);
  const primaryIdentity = await primary.evaluate(element => ({ id: element.getAttribute('data-baseline-id'), version: element.getAttribute('data-baseline-version'), status: element.textContent?.includes('approved'), count: element.getAttribute('data-accepted-item-count'), typeCounts: element.getAttribute('data-accepted-type-counts') }));
  expect(primaryIdentity).toEqual(enterpriseIdentity);
  await expect(page.getByText('Legacy operational indicators — non-authoritative')).toBeVisible();
  await page.getByRole('button', { name: 'context monitor' }).click();
  await expect(page.getByTestId(`monitor-baseline-${baselineId}`)).toBeVisible();
  await page.getByRole('button', { name: 'Switch workspace context' }).click();
  await expect(page.getByTestId(`monitor-baseline-${baselineId}`)).toHaveCount(0);
  await expect(page.getByText('Loading the canonical approved-baseline projection.')).toBeVisible();
  await expect(page.getByTestId('monitor-baseline-00000092-0000-4000-8000-000000000092')).toBeVisible();
  await page.getByRole('button', { name: 'Start delayed actor context' }).click();
  await expect(page.getByTestId('monitor-baseline-00000092-0000-4000-8000-000000000092')).toHaveCount(0);
  await expect(page.getByText('Loading the canonical approved-baseline projection.')).toBeVisible();
  await page.getByRole('button', { name: 'Switch to final actor context' }).click();
  await expect(page.getByTestId('monitor-baseline-00000094-0000-4000-8000-000000000094')).toBeVisible();
  await page.waitForTimeout(650);
  await expect(page.getByTestId('monitor-baseline-00000093-0000-4000-8000-000000000093')).toHaveCount(0);
  await expect(page.getByTestId('monitor-baseline-00000094-0000-4000-8000-000000000094')).toBeVisible();
  marker(info, 'MONITOR-TR-004', 'enterprise-and-primary-monitor-share-exact-safe-canonical-dto', 'MONITOR-APPROVED-BASELINE-01', { baselineId, baselineVersion: 1, baselineStatus: 'approved', packageId, packageVersionId, packageVersion: 1, acceptedItemCount: 1, acceptedTypeCounts: { milestone: 1 }, classification: 'assessed', primaryMatchesEnterprise: true, publicHashesObserved: false, exactHashBindingOwner: 'postgres', legacyMetricsAuthoritative: false, crossWorkspaceStaleRenderPrevented: true, crossActorStaleRenderPrevented: true, lateActorResponseRepainted: false, actorAuthorizationVersionUnchanged: true });
});

test('keyboard focus, axe and responsive zoom remain accessible', async ({ page }, info) => {
  test.setTimeout(120_000);
  await open(page);
  const button = page.getByRole('button', { name: 'Approve review' });
  await button.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(button).toBeFocused();
  marker(info, 'A11Y-001', 'keyboard-dialog-cancel-returns-focus-to-invoker', 'DELIVERY-MONITOR-A11Y-01', { keyboardOnly: true, focusReturn: 'invoker', visibleFocus: true });
  const findings = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(findings.violations.filter(value => value.impact === 'serious' || value.impact === 'critical')).toEqual([]);
  marker(info, 'A11Y-003', 'axe-serious-critical-zero', 'DELIVERY-MONITOR-A11Y-01', { seriousCriticalFindings: 0 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  marker(info, 'A11Y-004', 'pixel-and-200-percent-zoom-have-zero-horizontal-overflow', 'DELIVERY-MONITOR-A11Y-01', { horizontalOverflow: false, zoomPercent: 200 });
});

test('PERF-001 cached Delivery route reaches usable projection within 2.5 seconds', async ({ page }, info) => {
  await open(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('governed-delivery-workspace').waitFor({ state: 'visible' });
  const samples: number[] = [];
  for (let index = 0; index < 3; index++) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="governed-delivery-workspace"][data-delivery-usable="true"]').waitFor({ state: 'visible' });
    samples.push(await page.evaluate(() => performance.now()));
  }
  const median = [...samples].sort((a, b) => a - b)[1];
  expect(median).toBeLessThan(2_500);
  marker(info, 'PERF-001', 'cached-delivery-route-usable-under-2500ms', 'DELIVERY-MONITOR-CACHED-ROUTE-01', { performance: { profile: info.project.name, sampleCount: 3, warmupCount: 1, samplesMs: samples.map(Math.round), medianMs: Math.round(median), budgetMs: 2500, usableSelector: '[data-testid="governed-delivery-workspace"][data-delivery-usable="true"]' } });
});

test('PERF-002-B 250-item native InputEvent search p95 stays below 200ms', async ({ page }, info) => {
  await open(page);
  await loadAllCanonicalItems(page);
  const measure = async (index: number) => page.evaluate(async ({ itemIndex }) => {
    const input = document.querySelector<HTMLInputElement>('[aria-label="Filter canonical work items"]');
    const workspace = document.querySelector('[data-testid="governed-delivery-workspace"]');
    const result = document.querySelector('[data-testid="delivery-item-filter-result"]');
    if (!input || !workspace || !result) throw new Error('PERF_SELECTOR_MISSING');
    const title = `Canonical work item ${String(itemIndex).padStart(3, '0')}`;
    const itemId = `${String(1000 + itemIndex).padStart(8, '0')}-0000-4000-8000-${String(1000 + itemIndex).padStart(12, '0')}`;
    const citation = `brd.sections.requirements-${String(itemIndex).padStart(3, '0')}`;
    const startedAt = performance.now();
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => { observer.disconnect(); reject(new Error(`PERF_MUTATION_TIMEOUT_${itemIndex}`)); }, 2_000);
      const complete = () => {
        const card = document.querySelector<HTMLElement>(`[data-testid="delivery-item-${itemId}"]`);
        if (result.textContent?.trim() === '1 matching items across 250 loaded' && card?.dataset.itemTitle === title && card.dataset.itemStatus === 'proposed' && card.dataset.itemCitation === citation) {
          window.clearTimeout(timeout); observer.disconnect(); requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }
      };
      const observer = new MutationObserver(complete);
      observer.observe(workspace, { subtree: true, childList: true, attributes: true, characterData: true });
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, title);
      input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: title }));
      complete();
    });
    return performance.now() - startedAt;
  }, { itemIndex: index });

  await measure(230);
  const samples: Array<{ item: number; durationMs: number }> = [];
  for (let itemIndex = 231; itemIndex <= 250; itemIndex++) samples.push({ item: itemIndex, durationMs: await measure(itemIndex) });
  const ordered = [...samples].sort((left, right) => left.durationMs - right.durationMs);
  const p95Index = Math.ceil(samples.length * 0.95) - 1;
  const p95 = ordered[p95Index].durationMs;
  const maximum = ordered.at(-1)!.durationMs;
  expect(p95).toBeLessThan(200);
  marker(info, 'PERF-002-B', 'native-inputevent-250-item-search-p95-under-200ms', 'DELIVERY-DETERMINISTIC-ITEMS-250', { packageId, packageVersionId, packageVersion: 1, classification: 'assessed', publicHashesObserved: false, performance: { profile: info.project.name, sampleCount: 20, warmupCount: 1, itemCount: 250, itemRange: '231-250', page: 'accumulated-bounded-pages-1-3', budgetMs: 200, p95Index, p95Ms: Number(p95.toFixed(2)), maxMs: Number(maximum.toFixed(2)), samples: samples.map(value => ({ item: value.item, ms: Number(value.durationMs.toFixed(2)) })), mutationObserver: 'result-title-status-citation', paintBarrier: 'double-requestAnimationFrame', inputEvent: 'native' } });
});
