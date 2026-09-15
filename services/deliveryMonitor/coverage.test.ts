import assert from 'node:assert/strict';
import {
  decodeDeliveryWorkspaceProjection,
  decodeMonitorApprovedBaselinesProjection,
  DeliveryMonitorContractError,
} from './contracts';
import {
  buildDeliveryMonitorSelectorPayload,
  DeliveryMonitorCommandInputError,
  type DeliveryItemAuthoredFields,
  type DeliveryMonitorCommandInput,
} from './commands';
import { createDeliveryWorkspaceFixture, createMonitorBaselinesFixture, DELIVERY_MONITOR_FIXTURE_IDS as ids } from './fixtures';
import { baselineMatchesDeliveryPackage, currentAcceptedDeliveryItems, packageDecisionBlockers } from './workspace';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const authored: DeliveryItemAuthoredFields & { type: 'task' } = {
  type: 'task', title: 'Bounded item', description: 'Bounded authored fields.', acceptanceCriteria: ['Done'], nonFunctionalRequirements: ['Safe'],
};

const commands: DeliveryMonitorCommandInput[] = [
  { action: 'delivery.handoff.request', targetWorkspaceId: ids.targetWorkspaceId, studioArtifactId: ids.artifactId, studioArtifactVersionId: ids.artifactVersionId, expectedAggregateVersion: 1, expectedCurrentVersionId: ids.artifactVersionId, expectedApprovedVersionId: ids.artifactVersionId },
  { action: 'delivery.handoff.review.resolve', handoffId: ids.handoffId, expectedVersion: 1, outcome: 'approved', rationale: 'Reviewed.' },
  { action: 'delivery.handoff.approval.resolve', handoffId: ids.handoffId, expectedVersion: 2, outcome: 'approved', rationale: 'Approved.' },
  { action: 'delivery.handoff.withdraw', handoffId: ids.handoffId, expectedVersion: 1, rationale: 'Withdrawn.' },
  { action: 'delivery.handoff.consume', handoffId: ids.handoffId, expectedVersion: 3 },
  { action: 'delivery.package.create.manual', manualBrief: 'Manual planning input.', items: [{ ...authored }, { ...authored, title: 'Child', parentOrdinal: 1 }] },
  { action: 'delivery.item.review', itemAggregateId: ids.itemAggregateId, expectedAggregateVersion: 2, expectedItemVersionId: ids.itemVersionId, outcome: 'edited', rationale: 'Edited.', authored },
  { action: 'delivery.item.review', itemAggregateId: ids.itemAggregateId, expectedAggregateVersion: 2, expectedItemVersionId: ids.itemVersionId, outcome: 'accepted', rationale: 'Accepted.' },
  { action: 'delivery.package.revision.commit', workPackageId: ids.packageId, expectedPackageVersion: 1, expectedPackageVersionId: ids.packageVersionId,
    expectedPackageAggregateVersion: 2, expectedItems: [{ itemAggregateId: ids.itemAggregateId, expectedAggregateVersion: 2, expectedItemVersionId: ids.itemVersionId }],
    itemRevisions: [{ itemAggregateId: ids.itemAggregateId, expectedAggregateVersion: 2, expectedItemVersionId: ids.itemVersionId, rationale: 'Revised.', authored }] },
  { action: 'delivery.package.review.resolve', workPackageId: ids.packageId, expectedPackageVersion: 1, expectedPackageVersionId: ids.packageVersionId, expectedPackageAggregateVersion: 2, outcome: 'changes_requested', rationale: 'Changes.' },
  { action: 'delivery.package.approval.resolve', workPackageId: ids.packageId, expectedPackageVersion: 1, expectedPackageVersionId: ids.packageVersionId, expectedPackageAggregateVersion: 2, outcome: 'rejected', rationale: 'Rejected.' },
  { action: 'monitor.baseline.create', workPackageId: ids.packageId, expectedPackageVersion: 1, expectedPackageVersionId: ids.packageVersionId },
];
for (const command of commands) assert.ok(buildDeliveryMonitorSelectorPayload(command));

for (const invalid of [
  { action: 'delivery.handoff.consume', handoffId: 'bad', expectedVersion: 1 },
  { action: 'delivery.package.create.manual', manualBrief: '', items: [{ ...authored }] },
  { action: 'delivery.package.create.manual', manualBrief: 'Manual', items: [] },
  { action: 'delivery.package.create.manual', manualBrief: 'Manual', items: [{ ...authored, type: 'bad' }] },
  { action: 'delivery.package.create.manual', manualBrief: 'Manual', items: [{ ...authored, parentOrdinal: 0 }] },
  { action: 'monitor.baseline.create', workPackageId: ids.packageId, expectedPackageVersion: 0, expectedPackageVersionId: ids.packageVersionId },
  { action: 'monitor.baseline.create', workPackageId: ids.packageId, expectedPackageVersion: 1, expectedPackageVersionId: ids.packageVersionId, milestones: ['browser-authored'] },
  { action: 'delivery.item.review', itemAggregateId: ids.itemAggregateId, expectedAggregateVersion: 2, expectedItemVersionId: ids.itemVersionId, outcome: 'accepted', rationale: 'Accepted.', authored },
  { action: 'delivery.package.review.resolve', workPackageId: ids.packageId, expectedPackageVersion: 1, expectedPackageVersionId: ids.packageVersionId, outcome: 'approved', rationale: 'Missing snapshot selector.' },
]) assert.throws(() => buildDeliveryMonitorSelectorPayload(invalid as never), DeliveryMonitorCommandInputError);

assert.throws(() => buildDeliveryMonitorSelectorPayload({
  action: 'delivery.handoff.request', targetWorkspaceId: ids.targetWorkspaceId, studioArtifactId: ids.artifactId,
  studioArtifactVersionId: ids.artifactVersionId, expectedAggregateVersion: 1, expectedCurrentVersionId: ids.artifactVersionId,
  expectedApprovedVersionId: ids.artifactVersionId, proposedItems: [{ ...authored, sourceSectionLocator: 'unmanifested' }],
} as never), DeliveryMonitorCommandInputError);

const delivery = decodeDeliveryWorkspaceProjection(createDeliveryWorkspaceFixture());
const monitor = decodeMonitorApprovedBaselinesProjection(createMonitorBaselinesFixture());
assert.equal(delivery.outbox.length, 1);
assert.equal(delivery.packages[0].reviewHistory.length, 1);
assert.equal(delivery.packages[0].approvalHistory.length, 1);
assert.equal(delivery.packages[0].items[0].diffs.length, 1);
assert.equal(baselineMatchesDeliveryPackage(monitor.baselines[0], delivery.packages[0]), true);
for (const mutate of [
  (baseline: any) => { baseline.workPackageId = ids.handoffId; },
  (baseline: any) => { baseline.workPackageVersion = 2; },
  (baseline: any) => { baseline.acceptedItemCount = 2; },
  (baseline: any) => { baseline.lineageClassification = 'assessed'; baseline.planningOnly = false; },
  (baseline: any) => { baseline.planningOnly = false; },
]) {
  const changed = clone(monitor.baselines[0]) as any;
  mutate(changed);
  assert.equal(baselineMatchesDeliveryPackage(changed, delivery.packages[0]), false);
}
const missingAcceptedCount = clone(delivery.packages[0]);
delete missingAcceptedCount.acceptedItemCount;
assert.equal(baselineMatchesDeliveryPackage(monitor.baselines[0], missingAcceptedCount), false);
const wrongManifest = clone(delivery.packages[0]);
wrongManifest.items[0].title = 'Different accepted title';
assert.equal(baselineMatchesDeliveryPackage(monitor.baselines[0], wrongManifest), false);
const wrongCount = clone(delivery.packages[0]);
wrongCount.items = [];
assert.equal(baselineMatchesDeliveryPackage(monitor.baselines[0], wrongCount), false);

const manual = clone(createDeliveryWorkspaceFixture()) as any;
manual.handoffs[0].direction = 'inbox';
manual.handoffs[0].history[0].rationale = 'Moved to target review.';
manual.handoffs[0].reviewHistory = [{ handoffVersion: 1, outcome: 'changes_requested', rationale: 'Clarify.', createdAt: '2026-08-31T06:31:00.000Z' }];
manual.handoffs[0].approvalHistory = [{ handoffVersion: 2, outcome: 'rejected', rationale: 'Rejected.', createdAt: '2026-08-31T06:32:00.000Z' }];
const source = manual.packages[0].sourcePackage;
for (const key of ['studioArtifactId', 'studioArtifactType', 'studioArtifactVersionId', 'studioArtifactVersion', 'studioArtifactHash', 'studioSourcePackageId', 'studioSourcePackageHash', 'templateKind', 'templateVersion', 'templateHash']) delete source[key];
Object.assign(source, { sourceMode: 'manual', lineageClassification: 'not_assessed', planningOnly: true });
const current = manual.packages[0].items[0];
delete current.sourceCitation; delete current.parentAggregateId; delete current.decision; delete current.rationale;
current.status = 'proposed';
current.history = [current.history[0]];
manual.packages[0].reviewHistory = [];
manual.packages[0].approvalHistory = [];
manual.packages[0].actions = ['delivery.item.review'];
manual.packages[0].itemPage = { limit: 1, hasMore: true, cursorApplied: false, isComplete: false, nextCursor: { version: 1, itemId: ids.itemAggregateId } };
const decodedManual = decodeDeliveryWorkspaceProjection(manual);
assert.equal(decodedManual.inbox.length, 1);
assert.equal(decodedManual.packages[0].sourcePackage.sourceMode, 'manual');
assert.equal(currentAcceptedDeliveryItems(decodedManual.packages[0]), null);
assert.equal(packageDecisionBlockers(decodedManual.packages[0]).length, 1);
assert.equal(baselineMatchesDeliveryPackage(monitor.baselines[0], decodedManual.packages[0]), true);

const invalidBlockerCount = clone(createDeliveryWorkspaceFixture()) as any;
invalidBlockerCount.packages[0].blockers = ['Server blocker'];
invalidBlockerCount.packages[0].blockerCount = 0;
assert.throws(() => decodeDeliveryWorkspaceProjection(invalidBlockerCount), DeliveryMonitorContractError);
const truncatedBlockers = clone(createDeliveryWorkspaceFixture()) as any;
truncatedBlockers.packages[0].blockers = ['Server blocker'];
truncatedBlockers.packages[0].blockerCount = 2;
assert.equal(decodeDeliveryWorkspaceProjection(truncatedBlockers).packages[0].blockerCount, 2);

const pluralHandoff = clone(createDeliveryWorkspaceFixture()) as any;
pluralHandoff.handoffs[0].targetItems.push({ ...pluralHandoff.handoffs[0].targetItems[0], clientKey: 'item-0002', parentClientKey: 'item-0001', sourceSectionLocator: 'brd.sections.2', ordinal: 2 });
assert.equal(decodeDeliveryWorkspaceProjection(pluralHandoff).outbox[0].preview.sourceCoverageLabel, '2/2 exact cited BRD proposals');

const assessedBaseline = clone(createMonitorBaselinesFixture()) as any;
assessedBaseline.baselines[0].lineageClassification = 'assessed';
assessedBaseline.baselines[0].planningOnly = false;
assessedBaseline.baselines[0].readiness = 'review_required';
assert.equal(decodeMonitorApprovedBaselinesProjection(assessedBaseline).baselines[0].readiness, 'review_required');
const invalidReadiness = clone(createMonitorBaselinesFixture()) as any;
invalidReadiness.baselines[0].readiness = 'review_required';
assert.throws(() => decodeMonitorApprovedBaselinesProjection(invalidReadiness), DeliveryMonitorContractError);
const duplicateCandidate = clone(createDeliveryWorkspaceFixture()) as any;
duplicateCandidate.eligibleStudioArtifacts[0].proposalItems.push({ ...duplicateCandidate.eligibleStudioArtifacts[0].proposalItems[0] });
assert.throws(() => decodeDeliveryWorkspaceProjection(duplicateCandidate), DeliveryMonitorContractError);

const emptyPackage = clone(decodedManual.packages[0]);
emptyPackage.items = [];
emptyPackage.itemPage = { limit: 1, hasMore: false, cursorApplied: false, isComplete: true };
assert.deepEqual(packageDecisionBlockers(emptyPackage), []);
const unresolvedPackage = clone(emptyPackage);
unresolvedPackage.items = [decodedManual.packages[0].items[0]];
unresolvedPackage.blockers = ['1 work item decision unresolved.'];
unresolvedPackage.actions = unresolvedPackage.actions.filter(action => action !== 'monitor.baseline.create');
assert.deepEqual(packageDecisionBlockers(unresolvedPackage), ['1 work item decision unresolved.']);
assert.equal(unresolvedPackage.actions.includes('monitor.baseline.create'), false);

const split = clone(createDeliveryWorkspaceFixture()) as any;
split.inbox = [];
split.outbox = split.handoffs;
delete split.handoffs;
assert.equal(decodeDeliveryWorkspaceProjection(split).outbox.length, 1);
const ambiguous = clone(createDeliveryWorkspaceFixture()) as any;
ambiguous.inbox = [];
ambiguous.outbox = [];
assert.throws(() => decodeDeliveryWorkspaceProjection(ambiguous), DeliveryMonitorContractError);

const pendingApproval = clone(createDeliveryWorkspaceFixture()) as any;
pendingApproval.packages[0].status = 'review';
pendingApproval.packages[0].approvalHistory = [];
pendingApproval.packages[0].acceptedItemCount = null;
assert.equal(decodeDeliveryWorkspaceProjection(pendingApproval).packages[0].approvalState, 'pending');

for (const invalid of [null, undefined, [], {}, { ...createDeliveryWorkspaceFixture(), actions: ['delivery.handoff.request', 'delivery.handoff.request'] }]) {
  assert.throws(() => decodeDeliveryWorkspaceProjection(invalid), DeliveryMonitorContractError);
}
for (const invalid of [null, undefined, [], {}, { ...createMonitorBaselinesFixture(), liveTelemetryConnected: true }]) {
  assert.throws(() => decodeMonitorApprovedBaselinesProjection(invalid), DeliveryMonitorContractError);
}

for (const forbiddenKey of ['packageHash', 'itemHash', 'actorId', 'sourcePackageId']) {
  const substituted = clone(createDeliveryWorkspaceFixture()) as any;
  substituted.packages[0][forbiddenKey] = forbiddenKey.endsWith('Hash') ? 'f'.repeat(64) : ids.actorId;
  assert.throws(() => decodeDeliveryWorkspaceProjection(substituted), DeliveryMonitorContractError);
}

console.log('ok - PR C Delivery/Monitor coverage branches');
