import assert from 'node:assert/strict';
import { createDeliveryWorkspaceFixture, createMonitorBaselinesFixture, DELIVERY_MONITOR_FIXTURE_HASHES, DELIVERY_MONITOR_FIXTURE_IDS } from '../../../services/deliveryMonitor/fixtures';
import { decodeDeliveryWorkspaceProjection, decodeMonitorApprovedBaselinesProjection } from '../../../services/deliveryMonitor/contracts';
import { buildEnterpriseIntelligenceProjection, createEnterpriseIntelligenceQueryDatabase } from './enterpriseIntelligenceQuery';
import { emitPrCAssertion } from './deliveryMonitorPrCTestEvidence';

const USER = '30000000-0000-4000-8000-000000000001';
const delivery = decodeDeliveryWorkspaceProjection(createDeliveryWorkspaceFixture());
const monitor = decodeMonitorApprovedBaselinesProjection(createMonitorBaselinesFixture());
const context = { persona: { id: '30000009-0000-4000-8000-000000000009', state: 'active', capabilities: ['monitor.read'] }, organizationId: delivery.organizationId, workspaceId: delivery.workspaceId, packageId: DELIVERY_MONITOR_FIXTURE_IDS.packageId, packageVersionId: DELIVERY_MONITOR_FIXTURE_IDS.packageVersionId, acceptedSetHash: DELIVERY_MONITOR_FIXTURE_HASHES.acceptedSet, baselineId: DELIVERY_MONITOR_FIXTURE_IDS.baselineId, classification: 'not_assessed', liveTelemetryConnected: false };
const marker = (testId: string, assertionId: string) => emitPrCAssertion({ testId, assertionId, fixture: 'delivery-monitor-query-routing-v1', owner: 'api-query', runtimeContext: context });
const deliveryMarker = (testId: string, assertionId: string) => emitPrCAssertion({ testId, assertionId, fixture: 'delivery-monitor-query-routing-v1', owner: 'api-query', runtimeContext: { ...context, persona: { id: '30000006-0000-4000-8000-000000000006', state: 'active', capabilities: ['delivery.handoff.request', 'delivery.package.manage', 'project.read'] } } });
const handoffMarker = (testId: string, assertionId: string) => emitPrCAssertion({ testId, assertionId, fixture: 'delivery-monitor-query-routing-v1', owner: 'api-query', runtimeContext: { ...context, persona: { id: '30000001-0000-4000-8000-000000000001', state: 'active', capabilities: ['delivery.handoff.request', 'project.read'] }, edge: 'studio_to_delivery' } });

const calls: Array<{ kind: string; query?: Record<string, unknown> }> = [];
const db = createEnterpriseIntelligenceQueryDatabase(
  (async () => []) as never,
  {
    execute: async () => { throw new Error('not used'); },
    loadDeliveryProjection: async (_organizationId, _workspaceId, query) => { calls.push({ kind: 'delivery', query }); return createDeliveryWorkspaceFixture(); },
    loadMonitorProjection: async (_organizationId, _workspaceId, query) => { calls.push({ kind: 'monitor', query }); return createMonitorBaselinesFixture(); },
  },
);

const run = async () => {
const monitorAuthority = { userId: USER, organizationId: delivery.organizationId, workspaceId: delivery.workspaceId, authorizationVersion: 7, capabilities: ['monitor.read'] };
const monitorRows = await db.loadProjectionRows(monitorAuthority);
assert.equal(calls.filter(call => call.kind === 'delivery').length, 0);
assert.equal(calls.filter(call => call.kind === 'monitor').length, 1);
assert.deepEqual(calls.find(call => call.kind === 'monitor')?.query, { actorId: USER, authorizationVersion: 7, limit: 100 });
marker('MONITOR-TR-003', 'api-query-monitor-cannot-load-general-delivery');

const enterpriseMonitor = buildEnterpriseIntelligenceProjection(monitorAuthority, monitorRows, new Date('2026-08-31T07:00:00.000Z'));
assert.equal(enterpriseMonitor.monitorBaselines[0].id, monitor.baselines[0].id);
assert.equal(enterpriseMonitor.monitorApprovedBaselines?.baselines[0].workPackageId, monitor.baselines[0].workPackageId);
assert.equal(enterpriseMonitor.monitorBaselines[0].approvedItemCount, monitor.baselines[0].acceptedItemCount);
assert.equal(enterpriseMonitor.monitorApprovedBaselines?.liveTelemetryConnected, false);
assert.doesNotMatch(JSON.stringify(enterpriseMonitor.monitorApprovedBaselines), /hash|actorId|sourcePackageId/i);
marker('MONITOR-TR-004', 'api-query-enterprise-and-primary-monitor-use-same-dto');
marker('MONITOR-TR-002', 'api-query-monitor-never-projects-live-telemetry');

const deliveryAuthority = { ...monitorAuthority, capabilities: ['delivery.handoff.request', 'delivery.package.manage', 'project.read'] };
const deliveryRows = await db.loadProjectionRows(deliveryAuthority);
assert.equal(calls.filter(call => call.kind === 'delivery').length, 1);
assert.equal(calls.filter(call => call.kind === 'monitor').length, 1);
const enterpriseDelivery = buildEnterpriseIntelligenceProjection(deliveryAuthority, deliveryRows, new Date('2026-08-31T07:00:00.000Z'));
assert.equal(enterpriseDelivery.deliveryWorkspace?.packages[0].currentVersionId, DELIVERY_MONITOR_FIXTURE_IDS.packageVersionId);
assert.equal(enterpriseDelivery.deliveryPackages[0].items.length, 1);
assert.doesNotMatch(JSON.stringify(enterpriseDelivery.deliveryWorkspace), /hash|actorId|sourcePackageId/i);
deliveryMarker('DELIVERY-TR-001', 'api-query-joins-exact-canonical-current-version');
deliveryMarker('DELIVERY-TR-002', 'api-query-package-scoped-item-page-no-global-truncation');

const handoffAuthority = { ...monitorAuthority, capabilities: ['delivery.handoff.request', 'project.read'] };
const handoffRows = await db.loadProjectionRows(handoffAuthority);
assert.equal(calls.filter(call => call.kind === 'delivery').length, 2);
assert.equal(calls.filter(call => call.kind === 'monitor').length, 1);
const enterpriseHandoff = buildEnterpriseIntelligenceProjection(handoffAuthority, handoffRows, new Date('2026-08-31T07:00:00.000Z'));
assert.notEqual(enterpriseHandoff.availability, 'blocked');
assert.equal(enterpriseHandoff.deliveryWorkspace?.eligibleStudioArtifacts.length, 1);
assert.equal(enterpriseHandoff.monitorApprovedBaselines, undefined);
handoffMarker('HANDOFF-001', 'api-query-dedicated-requester-receives-server-candidate-without-monitor');
};

run().catch(error => { console.error(error); process.exitCode = 1; });
