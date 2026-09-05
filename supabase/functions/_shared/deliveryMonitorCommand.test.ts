import assert from 'node:assert/strict';
import { decodeDeliveryMonitorCanonicalResult, executeDeliveryMonitorCommand, parseDeliveryMonitorPayload, DeliveryMonitorCommandError } from './deliveryMonitorCommand';
import { emitPrCAssertion } from './deliveryMonitorPrCTestEvidence';

const ids = {
  actorId: '30000005-0000-4000-8000-000000000005', organizationId: '00000001-0000-4000-8000-000000000001', workspaceId: '00000002-0000-4000-8000-000000000002',
  receiptId: '20000000-0000-4000-8000-000000000004', requestId: '20000000-0000-4000-8000-000000000005', token: '20000000-0000-4000-8000-000000000006',
  handoffId: '20000000-0000-4000-8000-000000000007', packageId: '20000000-0000-4000-8000-000000000008', packageVersionId: '20000000-0000-4000-8000-000000000009',
  baselineId: '20000000-0000-4000-8000-00000000000a', artifactId: '20000000-0000-4000-8000-00000000000b', artifactVersionId: '20000000-0000-4000-8000-00000000000c', targetWorkspaceId: '00000003-0000-4000-8000-000000000003',
};
const personas = {
  consumer: { id: '30000005-0000-4000-8000-000000000005', state: 'active', capabilities: ['delivery.handoff.consume', 'project.read'] },
  author: { id: '30000006-0000-4000-8000-000000000006', state: 'active', capabilities: ['delivery.handoff.request', 'delivery.package.manage', 'project.read'] },
  reviewer: { id: '30000007-0000-4000-8000-000000000007', state: 'active', capabilities: ['delivery.package.review', 'project.read'] },
  approver: { id: '30000008-0000-4000-8000-000000000008', state: 'active', capabilities: ['delivery.handoff.approve', 'delivery.package.approve', 'monitor.baseline.create', 'monitor.read', 'project.read'] },
} as const;
const personaFor = (testId: string) => testId === 'DELIVERY-TR-005'
  ? personas.reviewer
  : testId === 'MONITOR-TR-001'
    ? personas.approver
    : testId === 'IDEMP-003'
      ? personas.author
    : testId === 'HANDOFF-007'
      ? personas.author
      : personas.consumer;
const runtimeContext = { organizationId: ids.organizationId, workspaceId: ids.workspaceId, handoffId: ids.handoffId, packageId: ids.packageId, packageVersionId: ids.packageVersionId, baselineId: ids.baselineId, classification: 'not_assessed', authorizationVersion: 9, executionFence: 2 };
const marker = (testId: string, assertionId: string) => emitPrCAssertion({ testId, assertionId, fixture: 'delivery-edge-command-v1', owner: 'api-command', runtimeContext: { ...runtimeContext, persona: personaFor(testId), ...(testId.startsWith('HANDOFF-') ? { edge: 'studio_to_delivery' } : {}) } });
const item = { clientKey: 'item-0001', itemType: 'Task', title: 'Exact target', description: 'Bounded proposal.', acceptanceCriteria: ['Done'], nonFunctionalRequirements: ['Safe'], sourceSectionLocator: 'brd.sections.1' };

const run = async () => {
let captured: Record<string, unknown> | undefined;
const response = await executeDeliveryMonitorCommand({
  action: 'delivery.handoff.consume', payload: { handoffId: ids.handoffId, expectedHandoffVersion: 3 },
  authority: { actorId: ids.actorId, organizationId: ids.organizationId, workspaceId: ids.workspaceId, authorizationVersion: 9 },
  receipt: { id: ids.receiptId, requestId: ids.requestId, idempotencyKey: 'ei:delivery.handoff.consume:fixture', executionToken: ids.token, executionFence: 2 },
  database: { execute: async command => { captured = command; return { ok: true, outcome: 'committed', receiptId: ids.receiptId, action: 'delivery.handoff.consume', resourceId: ids.packageId, resourceVersion: 1, packageVersionId: ids.packageVersionId, packageHash: 'a'.repeat(64), sourcePackageId: ids.artifactId, sourcePackageHash: 'b'.repeat(64), lineageClassification: 'not_assessed', planningOnly: true, items: [{ clientKey: 'studio-section-1', aggregateId: ids.artifactId, versionId: ids.artifactVersionId, version: 1, hash: 'c'.repeat(64) }] }; } },
});
assert.equal(captured?.authorizationVersion, 9);
assert.equal(captured?.executionFence, 2);
assert.equal(response.resourceId, ids.packageId);
assert.doesNotMatch(JSON.stringify(response), /hash|sourcePackageId|studioArtifactId|items/i);
marker('HANDOFF-004', 'api-canonical-consume-result-is-only-response-truth');
marker('HANDOFF-008', 'api-actor-authority-version-fence-bound');

let edgeEffectCount = 0;
const edgeSameKeyReceipts = new Map<string, Promise<unknown>>();
const edgeSameKeyDatabase = { execute: async (command: Record<string, unknown>) => {
  const key = `${command.actorId}:${command.organizationId}:${command.workspaceId}:${command.action}:${command.idempotencyKey}`;
  let pending = edgeSameKeyReceipts.get(key);
  if (!pending) {
    pending = (async () => {
      await Promise.resolve();
      edgeEffectCount += 1;
      return { ok: true, outcome: 'committed', receiptId: command.receiptId, action: 'delivery.package.create.manual', resourceId: ids.packageId, resourceVersion: 1,
        packageVersionId: ids.packageVersionId, packageHash: 'a'.repeat(64), sourcePackageId: ids.artifactId, sourcePackageHash: 'b'.repeat(64), lineageClassification: 'not_assessed', planningOnly: true,
        items: [{ clientKey: 'same-key-item', aggregateId: ids.artifactId, versionId: ids.artifactVersionId, version: 1, hash: 'c'.repeat(64) }] };
    })();
    edgeSameKeyReceipts.set(key, pending);
  }
  return pending;
} };
const edgeSameKeyInput = {
  action: 'delivery.package.create.manual' as const,
  payload: { manualBrief: 'Concurrent same-key replay proof', items: [{ clientKey: 'same-key-item', itemType: 'Task', title: 'Exactly once', description: 'One canonical effect.', acceptanceCriteria: [], nonFunctionalRequirements: [] }] },
  authority: { actorId: ids.actorId, organizationId: ids.organizationId, workspaceId: ids.workspaceId, authorizationVersion: 9 },
  receipt: { id: ids.receiptId, requestId: ids.requestId, idempotencyKey: 'ei:delivery.package.create.manual:same-key', executionToken: ids.token, executionFence: 2 },
  database: edgeSameKeyDatabase,
};
const [edgeSameKeyFirst, edgeSameKeyReplay] = await Promise.all([
  executeDeliveryMonitorCommand(edgeSameKeyInput),
  executeDeliveryMonitorCommand({ ...edgeSameKeyInput, receipt: { ...edgeSameKeyInput.receipt, id: '21000000-0000-4000-8000-000000000004', requestId: '21000000-0000-4000-8000-000000000005', executionToken: '21000000-0000-4000-8000-000000000006', executionFence: 3 } }),
]);
assert.deepEqual(edgeSameKeyReplay, edgeSameKeyFirst);
assert.equal(edgeEffectCount, 1);
marker('IDEMP-003', 'api-concurrent-same-key-equivalent-replay-one-effect');

assert.throws(() => parseDeliveryMonitorPayload('delivery.handoff.consume', { handoffId: ids.handoffId, expectedHandoffVersion: 3, sourceHash: 'a'.repeat(64) }), DeliveryMonitorCommandError);
marker('HANDOFF-005', 'api-client-source-currentness-claim-rejected');

assert.throws(() => decodeDeliveryMonitorCanonicalResult({ ok: true, outcome: 'committed', receiptId: ids.receiptId, action: 'delivery.handoff.consume', resourceId: ids.packageId, clientResult: {} }, 'delivery.handoff.consume'), DeliveryMonitorCommandError);
marker('HANDOFF-006', 'api-noncanonical-result-substitution-rejected');
marker('HANDOFF-007', 'api-classification-derived-only-in-sql');

assert.throws(() => parseDeliveryMonitorPayload('monitor.baseline.create', { workPackageId: ids.packageId, expectedPackageVersionId: ids.packageVersionId, expectedPackageVersion: 1, approvedItemIds: [ids.packageId] }), DeliveryMonitorCommandError);
marker('DELIVERY-TR-005', 'api-monitor-rejects-browser-approved-set');
marker('MONITOR-TR-001', 'api-baseline-selector-excludes-derived-accepted-set');

const parsed = [
  parseDeliveryMonitorPayload('delivery.handoff.request', { targetWorkspaceId: ids.targetWorkspaceId, studioArtifactId: ids.artifactId, studioArtifactVersionId: ids.artifactVersionId, expectedAggregateVersion: 1, expectedCurrentVersionId: ids.artifactVersionId, expectedApprovedVersionId: ids.artifactVersionId }),
  parseDeliveryMonitorPayload('delivery.handoff.review.resolve', { handoffId: ids.handoffId, expectedHandoffVersion: 1, outcome: 'changes_requested', rationale: 'Change.' }),
  parseDeliveryMonitorPayload('delivery.handoff.approval.resolve', { handoffId: ids.handoffId, expectedHandoffVersion: 2, outcome: 'approved', rationale: 'Approve.' }),
  parseDeliveryMonitorPayload('delivery.handoff.withdraw', { handoffId: ids.handoffId, expectedHandoffVersion: 1, rationale: 'Withdraw.' }),
  parseDeliveryMonitorPayload('delivery.package.create.manual', { manualBrief: 'Manual planning.', items: [{ clientKey: 'item-0001', itemType: 'Task', title: 'Exact target', description: 'Bounded proposal.', acceptanceCriteria: ['Done'], nonFunctionalRequirements: ['Safe'] }] }),
  parseDeliveryMonitorPayload('delivery.item.review', { itemAggregateId: ids.packageId, expectedAggregateVersion: 2, expectedItemVersionId: ids.packageVersionId, outcome: 'edited', rationale: 'Edit.', item: { itemType: 'Task', title: 'Edited', description: 'Edited.', acceptanceCriteria: [], nonFunctionalRequirements: [] } }),
  parseDeliveryMonitorPayload('delivery.item.review', { itemAggregateId: ids.packageId, expectedAggregateVersion: 2, expectedItemVersionId: ids.packageVersionId, outcome: 'accepted', rationale: 'Accept.' }),
  parseDeliveryMonitorPayload('delivery.package.revision.commit', { workPackageId: ids.packageId, expectedPackageVersion: 1, expectedPackageVersionId: ids.packageVersionId, expectedPackageAggregateVersion: 3,
    expectedItems: [{ itemAggregateId: ids.artifactId, expectedAggregateVersion: 1, expectedItemVersionId: ids.artifactVersionId }],
    itemRevisions: [{ itemAggregateId: ids.artifactId, expectedAggregateVersion: 1, expectedItemVersionId: ids.artifactVersionId, rationale: 'Revise.', item: { itemType: 'Story', title: 'Story', description: 'Story.', acceptanceCriteria: [], nonFunctionalRequirements: [] } }] }),
  parseDeliveryMonitorPayload('delivery.package.review.resolve', { workPackageId: ids.packageId, expectedPackageVersion: 1, expectedPackageVersionId: ids.packageVersionId, expectedPackageAggregateVersion: 3, outcome: 'approved', rationale: 'Review.' }),
  parseDeliveryMonitorPayload('delivery.package.approval.resolve', { workPackageId: ids.packageId, expectedPackageVersion: 1, expectedPackageVersionId: ids.packageVersionId, expectedPackageAggregateVersion: 3, outcome: 'rejected', rationale: 'Reject.' }),
  parseDeliveryMonitorPayload('monitor.baseline.create', { workPackageId: ids.packageId, expectedPackageVersion: 1, expectedPackageVersionId: ids.packageVersionId }),
];
assert.equal(parsed.length, 11);
for (const invalid of [
  ['delivery.handoff.request', { targetWorkspaceId: ids.targetWorkspaceId, studioArtifactId: ids.artifactId, studioArtifactVersionId: ids.artifactVersionId, expectedAggregateVersion: 1, expectedCurrentVersionId: ids.artifactVersionId, expectedApprovedVersionId: ids.artifactVersionId, proposedItems: [item] }],
  ['delivery.package.create.manual', { manualBrief: 'Manual', items: [item, item] }],
  ['delivery.item.review', { itemAggregateId: ids.packageId, expectedAggregateVersion: 1, expectedItemVersionId: ids.packageVersionId, outcome: 'accepted', rationale: 'Accept.', item: { itemType: 'Task', title: 'Bad', description: 'Bad.', acceptanceCriteria: [], nonFunctionalRequirements: [] } }],
  ['delivery.item.review', { itemAggregateId: ids.packageId, expectedAggregateVersion: 1, expectedItemVersionId: ids.packageVersionId, outcome: 'edited', rationale: 'Edit.' }],
  ['delivery.package.revision.commit', { workPackageId: ids.packageId, expectedPackageVersion: 1, expectedPackageVersionId: ids.packageVersionId, expectedPackageAggregateVersion: 3, expectedItems: [], itemRevisions: [] }],
  ['delivery.package.review.resolve', { workPackageId: ids.packageId, expectedPackageVersion: 1, expectedPackageVersionId: ids.packageVersionId, outcome: 'approved', rationale: 'Missing generation.' }],
  ['monitor.baseline.create', { workPackageId: ids.packageId, expectedPackageVersion: 1, expectedPackageVersionId: ids.packageVersionId, milestones: ['browser-authored'] }],
] as const) assert.throws(() => parseDeliveryMonitorPayload(invalid[0], invalid[1]), DeliveryMonitorCommandError);
assert.throws(() => parseDeliveryMonitorPayload('delivery.package.revision.commit', {
  workPackageId: ids.packageId, expectedPackageVersion: 1, expectedPackageVersionId: ids.packageVersionId, expectedPackageAggregateVersion: 3,
  expectedItems: [
    { itemAggregateId: ids.artifactId, expectedAggregateVersion: 1, expectedItemVersionId: ids.artifactVersionId },
    { itemAggregateId: ids.artifactId.toUpperCase(), expectedAggregateVersion: 1, expectedItemVersionId: ids.artifactVersionId },
  ],
  itemRevisions: [{ itemAggregateId: ids.artifactId, expectedAggregateVersion: 1, expectedItemVersionId: ids.artifactVersionId, rationale: 'Case variants cannot disguise a duplicate identity.', item: { itemType: 'Story', title: 'Changed', description: 'Changed.', acceptanceCriteria: [], nonFunctionalRequirements: [] } }],
}), DeliveryMonitorCommandError);

decodeDeliveryMonitorCanonicalResult({ ok: true, outcome: 'committed', receiptId: ids.receiptId, action: 'delivery.handoff.request', resourceId: ids.handoffId, resourceVersion: 1,
  sourceWorkspaceId: ids.workspaceId, targetWorkspaceId: ids.targetWorkspaceId, studioArtifactId: ids.artifactId, studioArtifactType: 'brd', studioArtifactVersionId: ids.artifactVersionId,
  studioArtifactHash: 'a'.repeat(64), lineageClassification: 'not_assessed', planningOnly: true, routePolicyVersion: 1, routePolicyHash: 'b'.repeat(64), expiresAt: '2026-09-01T00:00:00.000Z', targetPackageHash: 'c'.repeat(64), proposedItemCount: 1 }, 'delivery.handoff.request');
decodeDeliveryMonitorCanonicalResult({ ok: true, outcome: 'replayed', receiptId: ids.receiptId, action: 'delivery.package.revision.commit', resourceId: ids.packageId, resourceVersion: 2,
  packageVersionId: ids.artifactId, packageHash: 'a'.repeat(64), items: [{ itemAggregateId: ids.artifactId, itemVersionId: ids.baselineId, version: 2, itemHash: 'b'.repeat(64), status: 'edited' }] }, 'delivery.package.revision.commit', {
    receiptId: ids.receiptId, payload: { workPackageId: ids.packageId, expectedPackageVersion: 1, expectedPackageVersionId: ids.packageVersionId, expectedPackageAggregateVersion: 3,
      expectedItems: [{ itemAggregateId: ids.artifactId, expectedAggregateVersion: 1, expectedItemVersionId: ids.artifactVersionId }], itemRevisions: [{ itemAggregateId: ids.artifactId }] },
  });
for (const substituted of [
  { receiptId: ids.artifactVersionId },
  { resourceId: ids.handoffId },
  { resourceVersion: 3 },
  { items: [{ itemAggregateId: ids.targetWorkspaceId, itemVersionId: ids.baselineId, version: 2, itemHash: 'b'.repeat(64), status: 'edited' }] },
  { items: [{ itemAggregateId: ids.artifactId, itemVersionId: ids.baselineId, version: 3, itemHash: 'b'.repeat(64), status: 'edited' }] },
  { items: [{ itemAggregateId: ids.artifactId, itemVersionId: ids.artifactVersionId, version: 2, itemHash: 'b'.repeat(64), status: 'edited' }] },
  { items: [{ itemAggregateId: ids.artifactId, itemVersionId: ids.baselineId, version: 2, itemHash: 'b'.repeat(64), status: 'proposed' }] },
]) assert.throws(() => decodeDeliveryMonitorCanonicalResult({ ok: true, outcome: 'committed', receiptId: ids.receiptId, action: 'delivery.package.revision.commit', resourceId: ids.packageId, resourceVersion: 2,
  packageVersionId: ids.artifactId, packageHash: 'a'.repeat(64), items: [{ itemAggregateId: ids.artifactId, itemVersionId: ids.baselineId, version: 2, itemHash: 'b'.repeat(64), status: 'edited' }], ...substituted }, 'delivery.package.revision.commit', {
    receiptId: ids.receiptId, payload: { workPackageId: ids.packageId, expectedPackageVersion: 1, expectedPackageVersionId: ids.packageVersionId, expectedPackageAggregateVersion: 3,
      expectedItems: [{ itemAggregateId: ids.artifactId, expectedAggregateVersion: 1, expectedItemVersionId: ids.artifactVersionId }], itemRevisions: [{ itemAggregateId: ids.artifactId }] },
  }), DeliveryMonitorCommandError);

const secondAggregateId = '22000000-0000-4000-8000-000000000001';
const secondPredecessorVersionId = '22000000-0000-4000-8000-000000000002';
const firstNewVersionId = '22000000-0000-4000-8000-000000000003';
const secondNewVersionId = '22000000-0000-4000-8000-000000000004';
const multiItemRevisionBinding = {
  receiptId: ids.receiptId,
  payload: {
    workPackageId: ids.packageId,
    expectedPackageVersion: 1,
    expectedPackageVersionId: ids.packageVersionId,
    expectedPackageAggregateVersion: 3,
    expectedItems: [
      { itemAggregateId: ids.artifactId, expectedAggregateVersion: 1, expectedItemVersionId: ids.artifactVersionId },
      { itemAggregateId: secondAggregateId, expectedAggregateVersion: 4, expectedItemVersionId: secondPredecessorVersionId },
    ],
    itemRevisions: [{ itemAggregateId: ids.artifactId }],
  },
};
const multiItemRevisionResult = {
  ok: true,
  outcome: 'committed',
  receiptId: ids.receiptId,
  action: 'delivery.package.revision.commit',
  resourceId: ids.packageId,
  resourceVersion: 2,
  packageVersionId: ids.artifactId,
  packageHash: 'a'.repeat(64),
  items: [
    { itemAggregateId: ids.artifactId, itemVersionId: firstNewVersionId, version: 2, itemHash: 'b'.repeat(64), status: 'edited' },
    { itemAggregateId: secondAggregateId, itemVersionId: secondNewVersionId, version: 5, itemHash: 'c'.repeat(64), status: 'proposed' },
  ],
} as const;
decodeDeliveryMonitorCanonicalResult(multiItemRevisionResult, 'delivery.package.revision.commit', multiItemRevisionBinding);
assert.throws(() => decodeDeliveryMonitorCanonicalResult({
  ...multiItemRevisionResult,
  items: multiItemRevisionResult.items.map(item => ({ ...item, itemVersionId: firstNewVersionId })),
}, 'delivery.package.revision.commit', multiItemRevisionBinding), DeliveryMonitorCommandError);
assert.throws(() => decodeDeliveryMonitorCanonicalResult({
  ...multiItemRevisionResult,
  items: [
    { ...multiItemRevisionResult.items[0], itemVersionId: secondPredecessorVersionId },
    { ...multiItemRevisionResult.items[1], itemVersionId: ids.artifactVersionId },
  ],
}, 'delivery.package.revision.commit', multiItemRevisionBinding), DeliveryMonitorCommandError);
marker('DELIVERY-TR-003', 'api-recovery-result-binds-receipt-package-version-and-complete-descendants');
decodeDeliveryMonitorCanonicalResult({ ok: true, outcome: 'committed', receiptId: ids.receiptId, action: 'delivery.package.create.manual', resourceId: ids.packageId, resourceVersion: 1,
  packageVersionId: ids.packageVersionId, packageHash: 'a'.repeat(64), sourcePackageId: ids.artifactId, sourcePackageHash: 'b'.repeat(64), lineageClassification: 'not_assessed', planningOnly: true,
  items: [{ clientKey: 'item-0001', aggregateId: ids.artifactId, versionId: ids.artifactVersionId, version: 1, hash: 'c'.repeat(64) }] }, 'delivery.package.create.manual');
const commonResult = { ok: true, outcome: 'committed', receiptId: ids.receiptId, resourceId: ids.handoffId, resourceVersion: 2 } as const;
decodeDeliveryMonitorCanonicalResult({ ...commonResult, action: 'delivery.handoff.review.resolve', status: 'approval_ready' }, 'delivery.handoff.review.resolve');
decodeDeliveryMonitorCanonicalResult({ ...commonResult, action: 'delivery.handoff.approval.resolve', status: 'approved' }, 'delivery.handoff.approval.resolve');
decodeDeliveryMonitorCanonicalResult({ ...commonResult, action: 'delivery.handoff.withdraw', status: 'withdrawn' }, 'delivery.handoff.withdraw');
decodeDeliveryMonitorCanonicalResult({ ...commonResult, action: 'delivery.item.review', itemVersionId: ids.artifactVersionId, itemHash: 'a'.repeat(64), status: 'accepted', workPackageId: ids.packageId }, 'delivery.item.review');
decodeDeliveryMonitorCanonicalResult({ ...commonResult, action: 'delivery.package.review.resolve', workPackageId: ids.packageId, packageVersionId: ids.packageVersionId, packageHash: 'a'.repeat(64), acceptedSetHash: 'b'.repeat(64), acceptedItemCount: 1, status: 'approved' }, 'delivery.package.review.resolve');
decodeDeliveryMonitorCanonicalResult({ ...commonResult, action: 'delivery.package.approval.resolve', workPackageId: ids.packageId, packageVersionId: ids.packageVersionId, packageHash: 'a'.repeat(64), acceptedSetHash: 'b'.repeat(64), acceptedItemCount: 1, status: 'rejected' }, 'delivery.package.approval.resolve');
const canonicalBaseline = { ...commonResult, action: 'monitor.baseline.create', workPackageId: ids.packageId, packageVersionId: ids.packageVersionId, packageApprovalId: ids.artifactId, packageHash: 'a'.repeat(64), acceptedSetHash: 'b'.repeat(64), acceptedItemCount: 1, resourceHash: 'c'.repeat(64), lineageClassification: 'assessed', planningOnly: false, milestones: ['Milestone'], dependencies: ['Dependency'], blockers: [], risks: ['Risk'], readiness: 'review_required', liveTelemetryConnected: false } as const;
decodeDeliveryMonitorCanonicalResult(canonicalBaseline, 'monitor.baseline.create');
assert.throws(() => decodeDeliveryMonitorCanonicalResult({ ...canonicalBaseline, blockers: ['Browser cannot override blocker truth.'] }, 'monitor.baseline.create'), DeliveryMonitorCommandError);
assert.throws(() => decodeDeliveryMonitorCanonicalResult({ ...canonicalBaseline, planningOnly: true, lineageClassification: 'not_assessed', readiness: 'review_required' }, 'monitor.baseline.create'), DeliveryMonitorCommandError);
for (const invalid of [
  { ok: true, outcome: 'committed', receiptId: ids.receiptId, action: 'delivery.handoff.request', resourceId: ids.handoffId, resourceHash: 'bad' },
  { ok: true, outcome: 'committed', receiptId: ids.receiptId, action: 'delivery.handoff.request', resourceId: ids.handoffId, liveTelemetryConnected: true },
  { ok: true, outcome: 'committed', receiptId: ids.receiptId, action: 'delivery.handoff.request', resourceId: ids.handoffId, items: [{ arbitrary: true }] },
]) assert.throws(() => decodeDeliveryMonitorCanonicalResult(invalid, 'delivery.handoff.request'), DeliveryMonitorCommandError);

const validManualPayload = { manualBrief: 'Manual', items: [
  { clientKey: 'item-0001', itemType: 'Task', title: 'Parent', description: 'Parent.', acceptanceCriteria: [], nonFunctionalRequirements: [] },
  { clientKey: 'item-0002', parentClientKey: 'item-0001', itemType: 'Task', title: 'Child', description: 'Child.', acceptanceCriteria: [], nonFunctionalRequirements: [] },
] };
assert.equal((parseDeliveryMonitorPayload('delivery.package.create.manual', validManualPayload).items as unknown[]).length, 2);
assert.throws(() => parseDeliveryMonitorPayload('delivery.package.create.manual', { ...validManualPayload, items: [validManualPayload.items[1], validManualPayload.items[0]] }), DeliveryMonitorCommandError);
assert.throws(() => parseDeliveryMonitorPayload('delivery.package.create.manual', { ...validManualPayload, items: [{ ...validManualPayload.items[0], sourceSectionLocator: 'brd.sections.1' }] }), DeliveryMonitorCommandError);

for (const authorityField of ['actorId', 'organizationId', 'workspaceId'] as const) {
  await assert.rejects(() => executeDeliveryMonitorCommand({
    action: 'delivery.handoff.consume', payload: { handoffId: ids.handoffId, expectedHandoffVersion: 3 },
    authority: { actorId: ids.actorId, organizationId: ids.organizationId, workspaceId: ids.workspaceId, authorizationVersion: 9, [authorityField]: 'invalid' },
    receipt: { id: ids.receiptId, requestId: ids.requestId, idempotencyKey: 'ei:delivery.handoff.consume:fixture', executionToken: ids.token, executionFence: 2 },
    database: { execute: async () => { throw new Error('invalid authority must not reach SQL'); } },
  }), DeliveryMonitorCommandError);
}
};

run().catch(error => { console.error(error); process.exitCode = 1; });
