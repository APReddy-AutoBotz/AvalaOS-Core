import assert from 'node:assert/strict';
import { buildDeliveryMonitorSelectorPayload, DeliveryMonitorCommandInputError } from './commands';
import { DELIVERY_MONITOR_FIXTURE_IDS } from './fixtures';
import { emitPrCAssertion } from '../../supabase/functions/_shared/deliveryMonitorPrCTestEvidence';

const runtimeContext = { persona: { id: '30000006-0000-4000-8000-000000000006', state: 'active', capabilities: ['delivery.handoff.request', 'delivery.package.manage', 'project.read'] }, organizationId: DELIVERY_MONITOR_FIXTURE_IDS.organizationId, workspaceId: DELIVERY_MONITOR_FIXTURE_IDS.workspaceId, handoffId: DELIVERY_MONITOR_FIXTURE_IDS.handoffId, packageId: DELIVERY_MONITOR_FIXTURE_IDS.packageId, itemAggregateId: DELIVERY_MONITOR_FIXTURE_IDS.itemAggregateId, classification: 'not_assessed' };
const marker = (testId: string, assertionId: string) => emitPrCAssertion({ testId, assertionId, fixture: 'delivery-command-selector-v1', owner: 'client', runtimeContext: { ...runtimeContext, ...(testId.startsWith('HANDOFF-') ? { edge: 'studio_to_delivery' } : {}) } });
const capabilityMarker = (testId: string, assertionId: string, personaId: string, capabilities: string[]) => emitPrCAssertion({
  testId, assertionId, fixture: 'delivery-command-selector-v1', owner: 'client',
  runtimeContext: { ...runtimeContext, persona: { id: personaId, state: 'active', capabilities }, ...(testId.startsWith('HANDOFF-') ? { edge: 'studio_to_delivery' } : {}) },
});

const handoff = buildDeliveryMonitorSelectorPayload({
  action: 'delivery.handoff.request', studioArtifactId: DELIVERY_MONITOR_FIXTURE_IDS.artifactId,
  studioArtifactVersionId: DELIVERY_MONITOR_FIXTURE_IDS.artifactVersionId, targetWorkspaceId: DELIVERY_MONITOR_FIXTURE_IDS.targetWorkspaceId,
  expectedAggregateVersion: 1, expectedCurrentVersionId: DELIVERY_MONITOR_FIXTURE_IDS.artifactVersionId,
  expectedApprovedVersionId: DELIVERY_MONITOR_FIXTURE_IDS.artifactVersionId,
});
assert.deepEqual(Object.keys(handoff).sort(), ['expectedAggregateVersion', 'expectedApprovedVersionId', 'expectedCurrentVersionId', 'studioArtifactId', 'studioArtifactVersionId', 'targetWorkspaceId']);
marker('HANDOFF-001', 'client-request-binds-exact-source-target-selectors');
marker('HANDOFF-002', 'client-request-excludes-server-derived-proposal-authority');

const rejected = buildDeliveryMonitorSelectorPayload({ action: 'delivery.handoff.review.resolve', handoffId: DELIVERY_MONITOR_FIXTURE_IDS.handoffId, expectedVersion: 1, outcome: 'rejected', rationale: 'The proposed route needs revision.' });
assert.equal(rejected.outcome, 'rejected');
capabilityMarker('HANDOFF-003', 'client-target-rejection-selector-only', '30000004-0000-4000-8000-000000000004', ['delivery.handoff.review', 'project.read']);

const consumed = buildDeliveryMonitorSelectorPayload({ action: 'delivery.handoff.consume', handoffId: DELIVERY_MONITOR_FIXTURE_IDS.handoffId, expectedVersion: 3 });
assert.equal(consumed.expectedHandoffVersion, 3);
capabilityMarker('HANDOFF-004', 'client-consume-expected-version', '30000005-0000-4000-8000-000000000005', ['delivery.handoff.consume', 'project.read']);

const expectedItems = [{ itemAggregateId: DELIVERY_MONITOR_FIXTURE_IDS.itemAggregateId, expectedAggregateVersion: 1, expectedItemVersionId: DELIVERY_MONITOR_FIXTURE_IDS.itemVersionId }];
assert.throws(() => buildDeliveryMonitorSelectorPayload({ action: 'delivery.package.revision.commit', workPackageId: DELIVERY_MONITOR_FIXTURE_IDS.packageId, expectedPackageVersion: 1, expectedPackageVersionId: DELIVERY_MONITOR_FIXTURE_IDS.packageVersionId, expectedPackageAggregateVersion: 3, expectedItems, itemRevisions: [
  { itemAggregateId: DELIVERY_MONITOR_FIXTURE_IDS.itemAggregateId, expectedAggregateVersion: 1, expectedItemVersionId: DELIVERY_MONITOR_FIXTURE_IDS.itemVersionId, rationale: 'Clarify this governed item.', authored: { type: 'task', title: 'One', description: 'One description', acceptanceCriteria: [], nonFunctionalRequirements: [] } },
  { itemAggregateId: DELIVERY_MONITOR_FIXTURE_IDS.itemAggregateId, expectedAggregateVersion: 1, expectedItemVersionId: DELIVERY_MONITOR_FIXTURE_IDS.itemVersionId, rationale: 'Duplicate aggregate should fail.', authored: { type: 'task', title: 'Two', description: 'Two description', acceptanceCriteria: [], nonFunctionalRequirements: [] } },
] }), DeliveryMonitorCommandInputError);
marker('DELIVERY-TR-003', 'client-duplicate-revision-selector-rejected');

const revision = buildDeliveryMonitorSelectorPayload({ action: 'delivery.package.revision.commit', workPackageId: DELIVERY_MONITOR_FIXTURE_IDS.packageId,
  expectedPackageVersion: 1, expectedPackageVersionId: DELIVERY_MONITOR_FIXTURE_IDS.packageVersionId, expectedPackageAggregateVersion: 3, expectedItems,
  itemRevisions: [{ itemAggregateId: DELIVERY_MONITOR_FIXTURE_IDS.itemAggregateId, expectedAggregateVersion: 1, expectedItemVersionId: DELIVERY_MONITOR_FIXTURE_IDS.itemVersionId,
    rationale: 'Resolve the independent review blocker.', authored: { type: 'task', title: 'Materially revised', description: 'Changed description', acceptanceCriteria: [], nonFunctionalRequirements: [] } }] });
assert.deepEqual(Object.keys(revision).sort(), ['expectedItems', 'expectedPackageAggregateVersion', 'expectedPackageVersion', 'expectedPackageVersionId', 'itemRevisions', 'workPackageId']);
assert.throws(() => buildDeliveryMonitorSelectorPayload({ action: 'delivery.package.revision.commit', workPackageId: DELIVERY_MONITOR_FIXTURE_IDS.packageId,
  expectedPackageVersion: 1, expectedPackageVersionId: DELIVERY_MONITOR_FIXTURE_IDS.packageVersionId, expectedPackageAggregateVersion: 3, expectedItems: [],
  itemRevisions: [{ itemAggregateId: DELIVERY_MONITOR_FIXTURE_IDS.itemAggregateId, expectedAggregateVersion: 1, expectedItemVersionId: DELIVERY_MONITOR_FIXTURE_IDS.itemVersionId,
    rationale: 'Cannot submit partial knowledge.', authored: { type: 'task', title: 'Changed', description: 'Changed', acceptanceCriteria: [], nonFunctionalRequirements: [] } }] }), DeliveryMonitorCommandInputError);
assert.throws(() => buildDeliveryMonitorSelectorPayload({ action: 'delivery.package.revision.commit', workPackageId: DELIVERY_MONITOR_FIXTURE_IDS.packageId,
  expectedPackageVersion: 1, expectedPackageVersionId: DELIVERY_MONITOR_FIXTURE_IDS.packageVersionId, expectedPackageAggregateVersion: 3,
  expectedItems: [expectedItems[0], { ...expectedItems[0], itemAggregateId: expectedItems[0].itemAggregateId.toUpperCase() }],
  itemRevisions: [{ itemAggregateId: DELIVERY_MONITOR_FIXTURE_IDS.itemAggregateId, expectedAggregateVersion: 1, expectedItemVersionId: DELIVERY_MONITOR_FIXTURE_IDS.itemVersionId,
    rationale: 'Case variants cannot disguise a duplicate identity.', authored: { type: 'task', title: 'Changed', description: 'Changed', acceptanceCriteria: [], nonFunctionalRequirements: [] } }] }), DeliveryMonitorCommandInputError);
marker('DELIVERY-TR-005', 'client-recovery-binds-package-generation-and-complete-descendant-identities');

const manual = buildDeliveryMonitorSelectorPayload({ action: 'delivery.package.create.manual', manualBrief: 'Manual planning package', items: [{ type: 'task', title: 'Manual task', description: 'Manually authored planning work.', acceptanceCriteria: [], nonFunctionalRequirements: [] }] });
assert.equal('studioArtifactId' in manual, false);
assert.equal('assessCaseId' in manual, false);
marker('PATH-004', 'client-manual-payload-has-no-fabricated-ancestry');
