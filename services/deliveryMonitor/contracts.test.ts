import assert from 'node:assert/strict';
import { decodeDeliveryWorkspaceProjection, decodeMonitorApprovedBaselinesProjection, validateCanonicalDeliveryWorkspaceProjection, validateCanonicalMonitorApprovedBaselinesProjection, DeliveryMonitorContractError } from './contracts';
import { createDeliveryWorkspaceFixture, createMonitorBaselinesFixture, DELIVERY_MONITOR_FIXTURE_HASHES, DELIVERY_MONITOR_FIXTURE_IDS } from './fixtures';
import { baselineMatchesDeliveryPackage, currentAcceptedDeliveryItems, packageDecisionBlockers } from './workspace';
import { emitPrCAssertion } from '../../supabase/functions/_shared/deliveryMonitorPrCTestEvidence';

const context = {
  persona: { id: '30000007-0000-4000-8000-000000000007', state: 'active', capabilities: ['delivery.package.review', 'project.read'] }, organizationId: DELIVERY_MONITOR_FIXTURE_IDS.organizationId, workspaceId: DELIVERY_MONITOR_FIXTURE_IDS.workspaceId,
  sourcePackageId: DELIVERY_MONITOR_FIXTURE_IDS.deliverySourcePackageId, packageId: DELIVERY_MONITOR_FIXTURE_IDS.packageId,
  packageVersionId: DELIVERY_MONITOR_FIXTURE_IDS.packageVersionId, itemAggregateId: DELIVERY_MONITOR_FIXTURE_IDS.itemAggregateId,
  itemVersionId: DELIVERY_MONITOR_FIXTURE_IDS.itemVersionId, acceptedSetHash: DELIVERY_MONITOR_FIXTURE_HASHES.acceptedSet,
  baselineId: DELIVERY_MONITOR_FIXTURE_IDS.baselineId, classification: 'not_assessed', planningOnly: true,
};
const marker = (testId: string, assertionId: string) => emitPrCAssertion({ testId, assertionId, fixture: 'delivery-monitor-safe-projection-v1', owner: 'domain', runtimeContext: context });
const monitorMarker = (testId: string, assertionId: string) => emitPrCAssertion({
  testId, assertionId, fixture: 'delivery-monitor-safe-projection-v1', owner: 'domain',
  runtimeContext: { ...context, persona: { id: '30000009-0000-4000-8000-000000000009', state: 'active', capabilities: ['monitor.read'] } },
});

const workspace = decodeDeliveryWorkspaceProjection(createDeliveryWorkspaceFixture());
assert.equal(workspace.packages[0].currentVersionId, DELIVERY_MONITOR_FIXTURE_IDS.packageVersionId);
assert.equal(workspace.packages[0].items[0].sourceCitation?.sectionLocator, 'brd.sections.1');
marker('DELIVERY-TR-001', 'domain-exact-current-package-version');
marker('DELIVERY-TR-002', 'domain-item-citation-exact-artifact-version-locator');

assert.equal(workspace.packages[0].items[0].history.length, 2);
assert.equal(workspace.packages[0].items[0].history[1].version, 2);
assert.deepEqual(workspace.packages[0].items[0].diffs[0].changedFields, ['title', 'description']);
marker('DELIVERY-TR-003', 'domain-item-history-immutable-version');

assert.equal(currentAcceptedDeliveryItems(workspace.packages[0])?.length, 1);
assert.deepEqual(packageDecisionBlockers(workspace.packages[0]), []);
marker('DELIVERY-TR-004', 'domain-terminal-decision-with-rationale');

assert.equal(workspace.packages[0].sourcePackage.lineageClassification, 'not_assessed');
assert.equal(workspace.packages[0].sourcePackage.planningOnly, true);
marker('DELIVERY-TR-006', 'domain-planning-only-lineage-preserved');
marker('PATH-003', 'domain-direct-studio-planning-lineage');

const monitor = decodeMonitorApprovedBaselinesProjection(createMonitorBaselinesFixture());
assert.deepEqual(validateCanonicalDeliveryWorkspaceProjection(workspace), workspace);
assert.deepEqual(validateCanonicalMonitorApprovedBaselinesProjection(monitor), monitor);
for (const changed of [
  (value: typeof workspace) => { (value.eligibleStudioArtifacts[0].proposalItems[0] as unknown as Record<string, unknown>).itemType = 'Epic'; },
  (value: typeof workspace) => { (value.eligibleStudioArtifacts[0].proposalItems[0] as unknown as Record<string, unknown>).type = 'Epic'; },
  (value: typeof workspace) => { value.outbox[0].preview.proposedItemCount = 2; },
  (value: typeof workspace) => { value.packages[0].label = 'Verified package'; },
  (value: typeof workspace) => { value.packages[0].items[0].sourceCitation!.sectionLocator = ''; },
]) {
  const mutated = structuredClone(workspace);
  changed(mutated);
  assert.throws(() => validateCanonicalDeliveryWorkspaceProjection(mutated), DeliveryMonitorContractError);
}
const forgedCanonicalBaseline = structuredClone(monitor);
forgedCanonicalBaseline.baselines[0].readiness = 'review_required';
assert.throws(() => validateCanonicalMonitorApprovedBaselinesProjection(forgedCanonicalBaseline), DeliveryMonitorContractError);
assert.equal(monitor.baselines[0].acceptedItems.length, 1);
assert.equal(baselineMatchesDeliveryPackage(monitor.baselines[0], workspace.packages[0]), true);
monitorMarker('MONITOR-TR-001', 'domain-baseline-exact-package-accepted-set');
assert.equal(monitor.liveTelemetryConnected, false);
assert.deepEqual(monitor.actions, []);
monitorMarker('MONITOR-TR-002', 'domain-live-telemetry-literal-false');
monitorMarker('MONITOR-TR-003', 'domain-monitor-action-allowlist-empty');
monitorMarker('MONITOR-TR-004', 'domain-canonical-baseline-parity');

const unsafe = { ...createDeliveryWorkspaceFixture(), secretReference: 'never' };
assert.throws(() => decodeDeliveryWorkspaceProjection(unsafe), DeliveryMonitorContractError);

const malformedManual = createDeliveryWorkspaceFixture();
malformedManual.packages[0].sourcePackage.sourceMode = 'manual';
assert.throws(() => decodeDeliveryWorkspaceProjection(malformedManual), DeliveryMonitorContractError);
marker('PATH-004', 'domain-manual-no-fabricated-ancestry');

const eligibilityId = (value: number) => `${String(value).padStart(8, '0')}-0000-4000-8000-${String(value).padStart(12, '0')}`;
const eligibilityTemplate = createDeliveryWorkspaceFixture();
const eligibilityBoundary = {
  ...eligibilityTemplate,
  baselineEligibility: Array.from({ length: 100 }, (_, index) => ({
    ...eligibilityTemplate.baselineEligibility[0],
    workPackageId: eligibilityId(10_000 + index),
    workPackageVersionId: eligibilityId(20_000 + index),
  })),
  page: {
    ...eligibilityTemplate.page,
    baselineEligibilityLimit: 100,
    baselineEligibilityHasMore: true,
    baselineEligibilityNextCursor: {
    updatedAt: '2026-08-31T06:30:00.000Z',
      workPackageId: eligibilityId(10_099),
    },
  },
};
const decodedEligibilityBoundary = decodeDeliveryWorkspaceProjection(eligibilityBoundary);
assert.equal(decodedEligibilityBoundary.baselineEligibility.length, 100);
assert.equal(decodedEligibilityBoundary.page.baselineEligibilityHasMore, true);
const eligibilityOverflow = { ...eligibilityBoundary, baselineEligibility: [...eligibilityBoundary.baselineEligibility, {
  ...eligibilityBoundary.baselineEligibility[0], workPackageId: eligibilityId(30_000), workPackageVersionId: eligibilityId(40_000),
}] };
assert.throws(() => decodeDeliveryWorkspaceProjection(eligibilityOverflow), DeliveryMonitorContractError);
monitorMarker('MONITOR-TR-001', 'domain-baseline-eligibility-100-boundary-101-rejected');
