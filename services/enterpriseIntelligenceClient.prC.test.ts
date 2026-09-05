import assert from 'node:assert/strict';
import { DeliveryMonitorCommandInputError, buildDeliveryMonitorSelectorPayload, type DeliveryMonitorCommandInput } from './deliveryMonitor/commands';
import { DELIVERY_MONITOR_FIXTURE_IDS as ids } from './deliveryMonitor/fixtures';
import { controlledHumanTarget, enterpriseIntelligenceClient } from './enterpriseIntelligenceClient';
import { emitPrCAssertion } from '../supabase/functions/_shared/deliveryMonitorPrCTestEvidence';

type Invocation = {
  name: string;
  options: { body: Record<string, unknown> };
};

const invocations: Invocation[] = [];
(globalThis as typeof globalThis & {
  __prCInvoke?: (name: string, options: Invocation['options']) => Promise<{ data: unknown; error: unknown }>;
}).__prCInvoke = async (name, options) => {
  invocations.push({ name, options });
  return { data: { ok: true }, error: null };
};

const authored = {
  type: 'task' as const,
  title: 'Governed transport boundary',
  description: 'Exercise the production client without leaking its tenant envelope into the selector.',
  acceptanceCriteria: ['The selector receives only action-owned fields.'],
  nonFunctionalRequirements: ['Unknown fields remain rejected.'],
};

const expectedItem = {
  itemAggregateId: ids.itemAggregateId,
  expectedAggregateVersion: 2,
  expectedItemVersionId: ids.itemVersionId,
};

const cases: Array<{
  method: string;
  command: DeliveryMonitorCommandInput;
  invoke: () => Promise<unknown>;
}> = [
  {
    method: 'requestDeliveryHandoff',
    command: { action: 'delivery.handoff.request', targetWorkspaceId: ids.targetWorkspaceId, studioArtifactId: ids.artifactId,
      studioArtifactVersionId: ids.artifactVersionId, expectedAggregateVersion: 1, expectedCurrentVersionId: ids.artifactVersionId,
      expectedApprovedVersionId: ids.artifactVersionId },
    invoke: () => enterpriseIntelligenceClient.requestDeliveryHandoff({ organizationId: ids.organizationId, workspaceId: ids.workspaceId,
      targetWorkspaceId: ids.targetWorkspaceId, studioArtifactId: ids.artifactId, studioArtifactVersionId: ids.artifactVersionId,
      expectedAggregateVersion: 1, expectedCurrentVersionId: ids.artifactVersionId, expectedApprovedVersionId: ids.artifactVersionId }),
  },
  {
    method: 'resolveDeliveryHandoffReview',
    command: { action: 'delivery.handoff.review.resolve', handoffId: ids.handoffId, expectedVersion: 1, outcome: 'changes_requested', rationale: 'Clarify the governed handoff.' },
    invoke: () => enterpriseIntelligenceClient.resolveDeliveryHandoffReview({ organizationId: ids.organizationId, workspaceId: ids.workspaceId,
      handoffId: ids.handoffId, expectedVersion: 1, outcome: 'changes_requested', rationale: 'Clarify the governed handoff.' }),
  },
  {
    method: 'resolveDeliveryHandoffApproval',
    command: { action: 'delivery.handoff.approval.resolve', handoffId: ids.handoffId, expectedVersion: 2, outcome: 'approved', rationale: 'Approve the exact reviewed handoff.' },
    invoke: () => enterpriseIntelligenceClient.resolveDeliveryHandoffApproval({ organizationId: ids.organizationId, workspaceId: ids.workspaceId,
      handoffId: ids.handoffId, expectedVersion: 2, outcome: 'approved', rationale: 'Approve the exact reviewed handoff.' }),
  },
  {
    method: 'withdrawDeliveryHandoff',
    command: { action: 'delivery.handoff.withdraw', handoffId: ids.handoffId, expectedVersion: 1, rationale: 'Withdraw the stale source request.' },
    invoke: () => enterpriseIntelligenceClient.withdrawDeliveryHandoff({ organizationId: ids.organizationId, workspaceId: ids.workspaceId,
      handoffId: ids.handoffId, expectedVersion: 1, rationale: 'Withdraw the stale source request.' }),
  },
  {
    method: 'consumeDeliveryHandoff',
    command: { action: 'delivery.handoff.consume', handoffId: ids.handoffId, expectedVersion: 3 },
    invoke: () => enterpriseIntelligenceClient.consumeDeliveryHandoff({ organizationId: ids.organizationId, workspaceId: ids.workspaceId,
      handoffId: ids.handoffId, expectedVersion: 3 }),
  },
  {
    method: 'createManualDeliveryPackage',
    command: { action: 'delivery.package.create.manual', manualBrief: 'Create a bounded planning-only package.', items: [authored] },
    invoke: () => enterpriseIntelligenceClient.createManualDeliveryPackage({ organizationId: ids.organizationId, workspaceId: ids.workspaceId,
      manualBrief: 'Create a bounded planning-only package.', items: [authored] }),
  },
  {
    method: 'reviewDeliveryItem:edited',
    command: { action: 'delivery.item.review', ...expectedItem, outcome: 'edited', rationale: 'Author the reviewed descendant.', authored },
    invoke: () => enterpriseIntelligenceClient.reviewDeliveryItem({ organizationId: ids.organizationId, workspaceId: ids.workspaceId,
      ...expectedItem, outcome: 'edited', rationale: 'Author the reviewed descendant.', authored }),
  },
  {
    method: 'reviewDeliveryItem:accepted',
    command: { action: 'delivery.item.review', ...expectedItem, outcome: 'accepted', rationale: 'Accept the exact current item version.' },
    invoke: () => enterpriseIntelligenceClient.reviewDeliveryItem({ organizationId: ids.organizationId, workspaceId: ids.workspaceId,
      ...expectedItem, outcome: 'accepted', rationale: 'Accept the exact current item version.' }),
  },
  {
    method: 'commitDeliveryPackageRevision',
    command: { action: 'delivery.package.revision.commit', workPackageId: ids.packageId, expectedPackageVersion: 1,
      expectedPackageVersionId: ids.packageVersionId, expectedPackageAggregateVersion: 2, expectedItems: [expectedItem],
      itemRevisions: [{ ...expectedItem, rationale: 'Commit one governed descendant revision.', authored }] },
    invoke: () => enterpriseIntelligenceClient.commitDeliveryPackageRevision({ organizationId: ids.organizationId, workspaceId: ids.workspaceId,
      workPackageId: ids.packageId, expectedPackageVersion: 1, expectedPackageVersionId: ids.packageVersionId,
      expectedPackageAggregateVersion: 2, expectedItems: [expectedItem],
      itemRevisions: [{ ...expectedItem, rationale: 'Commit one governed descendant revision.', authored }] }),
  },
  {
    method: 'resolveDeliveryPackageReview',
    command: { action: 'delivery.package.review.resolve', workPackageId: ids.packageId, expectedPackageVersion: 1,
      expectedPackageVersionId: ids.packageVersionId, expectedPackageAggregateVersion: 2, outcome: 'approved',
      rationale: 'Review the complete accepted set.' },
    invoke: () => enterpriseIntelligenceClient.resolveDeliveryPackageReview({ organizationId: ids.organizationId, workspaceId: ids.workspaceId,
      workPackageId: ids.packageId, expectedPackageVersion: 1, expectedPackageVersionId: ids.packageVersionId,
      expectedPackageAggregateVersion: 2, outcome: 'approved', rationale: 'Review the complete accepted set.' }),
  },
  {
    method: 'resolveDeliveryPackageApproval',
    command: { action: 'delivery.package.approval.resolve', workPackageId: ids.packageId, expectedPackageVersion: 1,
      expectedPackageVersionId: ids.packageVersionId, expectedPackageAggregateVersion: 2, outcome: 'approved',
      rationale: 'Approve the independently reviewed package.' },
    invoke: () => enterpriseIntelligenceClient.resolveDeliveryPackageApproval({ organizationId: ids.organizationId, workspaceId: ids.workspaceId,
      workPackageId: ids.packageId, expectedPackageVersion: 1, expectedPackageVersionId: ids.packageVersionId,
      expectedPackageAggregateVersion: 2, outcome: 'approved', rationale: 'Approve the independently reviewed package.' }),
  },
  {
    method: 'createMonitorBaseline',
    command: { action: 'monitor.baseline.create', workPackageId: ids.packageId, expectedPackageVersion: 1,
      expectedPackageVersionId: ids.packageVersionId },
    invoke: () => enterpriseIntelligenceClient.createMonitorBaseline({ organizationId: ids.organizationId, workspaceId: ids.workspaceId,
      workPackageId: ids.packageId, expectedPackageVersion: 1, expectedPackageVersionId: ids.packageVersionId }),
  },
];

const run = async () => {
assert.deepEqual(controlledHumanTarget('delivery.package.revision.commit', ids.workspaceId, {
  workPackageId: ids.packageId, expectedPackageVersion: 7, expectedPackageAggregateVersion: 19,
}), { targetFamily: 'delivery_work_package', targetId: ids.packageId, expectedVersion: 19 });
for (const action of ['delivery.package.review.resolve', 'delivery.package.approval.resolve', 'monitor.baseline.create']) {
  assert.deepEqual(controlledHumanTarget(action, ids.workspaceId, {
    workPackageId: ids.packageId, expectedPackageVersion: 7, expectedPackageAggregateVersion: 19,
  }), { targetFamily: 'delivery_work_package', targetId: ids.packageId, expectedVersion: 7 });
}
for (const testCase of cases) {
  invocations.length = 0;
  await testCase.invoke();
  assert.equal(invocations.length, 1, `${testCase.method} must dispatch exactly once`);
  const invocation = invocations[0];
  assert.equal(invocation.name, 'enterprise-intelligence-command');
  assert.deepEqual(Object.keys(invocation.options.body).sort(), [
    'commandType', 'idempotencyKey', 'organizationId', 'payload', 'requestId', 'workspaceId',
  ]);
  assert.equal(invocation.options.body.commandType, testCase.command.action);
  assert.equal(invocation.options.body.organizationId, ids.organizationId);
  assert.equal(invocation.options.body.workspaceId, ids.workspaceId);
  assert.deepEqual(invocation.options.body.payload, buildDeliveryMonitorSelectorPayload(testCase.command));
  assert.equal('organizationId' in (invocation.options.body.payload as object), false);
  assert.equal('workspaceId' in (invocation.options.body.payload as object), false);
  assert.equal('action' in (invocation.options.body.payload as object), false);
}

invocations.length = 0;
assert.throws(() => enterpriseIntelligenceClient.consumeDeliveryHandoff({
  organizationId: ids.organizationId,
  workspaceId: ids.workspaceId,
  handoffId: ids.handoffId,
  expectedVersion: 3,
  unexpectedBrowserClaim: true,
} as Parameters<typeof enterpriseIntelligenceClient.consumeDeliveryHandoff>[0]), DeliveryMonitorCommandInputError);
assert.equal(invocations.length, 0);

const sharedRuntimeContext = {
  organizationId: ids.organizationId,
  workspaceId: ids.workspaceId,
  productionClientMethodCount: 11,
  commandVariantCount: cases.length,
  transportInvocationCount: cases.length,
  unknownCommandKeyRejectedBeforeTransport: true,
  tenantEnvelopeExcludedFromSelector: true,
};
const deliveryAuthor = { id: ids.actorId, state: 'active' as const, capabilities: ['delivery.handoff.request', 'delivery.package.manage', 'project.read'] };
const targetAcceptor = { id: '30000004-0000-4000-8000-000000000004', state: 'active' as const, capabilities: ['delivery.handoff.review', 'project.read'] };
const deliveryConsumer = { id: '30000005-0000-4000-8000-000000000005', state: 'active' as const, capabilities: ['delivery.handoff.consume', 'project.read'] };
const deliveryReviewer = { id: '30000007-0000-4000-8000-000000000007', state: 'active' as const, capabilities: ['delivery.package.review', 'project.read'] };
const deliveryApprover = { id: '30000008-0000-4000-8000-000000000008', state: 'active' as const,
  capabilities: ['delivery.handoff.approve', 'delivery.package.approve', 'monitor.baseline.create', 'monitor.read', 'project.read'] };
emitPrCAssertion({ testId: 'HANDOFF-001', assertionId: 'production-client-handoff-adapters-isolate-tenant-envelope', fixture: 'delivery-command-selector-v1', owner: 'client-transport',
  runtimeContext: { ...sharedRuntimeContext, persona: deliveryAuthor, participants: [targetAcceptor, deliveryApprover, deliveryConsumer], edge: 'studio_to_delivery' } });
emitPrCAssertion({ testId: 'DELIVERY-TR-003', assertionId: 'production-client-delivery-adapters-isolate-tenant-envelope', fixture: 'delivery-command-selector-v1', owner: 'client-transport',
  runtimeContext: { ...sharedRuntimeContext, persona: deliveryAuthor, participants: [deliveryReviewer, deliveryApprover] } });
emitPrCAssertion({ testId: 'MONITOR-TR-001', assertionId: 'production-client-monitor-adapter-isolates-tenant-envelope', fixture: 'delivery-command-selector-v1', owner: 'client-transport',
  runtimeContext: { ...sharedRuntimeContext, persona: deliveryApprover } });
emitPrCAssertion({ testId: 'HANDOFF-002', assertionId: 'production-client-rejects-unrecognized-command-claim-before-transport', fixture: 'delivery-command-selector-v1', owner: 'client-transport',
  runtimeContext: { ...sharedRuntimeContext, persona: deliveryAuthor, edge: 'studio_to_delivery' } });

delete (globalThis as typeof globalThis & { __prCInvoke?: unknown }).__prCInvoke;
console.log('ok - PR C production Delivery/Monitor client transport boundary');
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
