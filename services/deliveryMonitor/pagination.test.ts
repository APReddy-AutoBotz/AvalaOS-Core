import assert from 'node:assert/strict';
import {
  decodeDeliveryWorkspaceProjection,
  DeliveryMonitorContractError,
} from './contracts';
import {
  createDeliveryItemPageFixture,
  deliveryItemPageCursorForItem,
  DELIVERY_MONITOR_FIXTURE_IDS,
} from './fixtures';
import { mergeDeliveryItemPage } from './workspace';
import { emitPrCAssertion } from '../../supabase/functions/_shared/deliveryMonitorPrCTestEvidence';

const paginationContext = {
  persona: {
    id: '30000006-0000-4000-8000-000000000006',
    state: 'active',
    capabilities: ['delivery.handoff.request', 'delivery.package.manage', 'project.read'],
  },
  organizationId: DELIVERY_MONITOR_FIXTURE_IDS.organizationId,
  workspaceId: DELIVERY_MONITOR_FIXTURE_IDS.workspaceId,
  fixtureIds: ['DELIVERY-DETERMINISTIC-ITEMS-250'],
  pagination: { pageLimit: 100, pageSizes: [100, 100, 50], totalCount: 250 },
};

const marker = (testId: string, assertionId: string, runtimeContext: Record<string, unknown>) => emitPrCAssertion({
  testId,
  assertionId,
  fixture: 'DELIVERY-DETERMINISTIC-ITEMS-250',
  owner: 'pagination-domain',
  runtimeContext,
});

const first = decodeDeliveryWorkspaceProjection(createDeliveryItemPageFixture({ start: 1, count: 100 }));
const second = decodeDeliveryWorkspaceProjection(createDeliveryItemPageFixture({ start: 101, count: 100 }));
const third = decodeDeliveryWorkspaceProjection(createDeliveryItemPageFixture({ start: 201, count: 50 }));
const packageId = DELIVERY_MONITOR_FIXTURE_IDS.packageId;

const afterSecond = mergeDeliveryItemPage(first, second, {
  packageId,
  cursor: deliveryItemPageCursorForItem(100),
  limit: 100,
});
assert.equal(afterSecond.packages[0].items.length, 200);
assert.equal(afterSecond.packages[0].itemPage.hasMore, true);
assert.equal(afterSecond.packages[0].itemPage.isComplete, false);

const complete = mergeDeliveryItemPage(afterSecond, third, {
  packageId,
  cursor: deliveryItemPageCursorForItem(200),
  limit: 100,
});
assert.equal(complete.packages[0].items.length, 250);
assert.equal(new Set(complete.packages[0].items.map(item => item.aggregateId)).size, 250);
assert.equal(complete.packages[0].itemPage.hasMore, false);
assert.equal(complete.packages[0].itemPage.isComplete, true);
assert.equal(complete.packages[0].items[249].title, 'Canonical work item 250');
marker('DELIVERY-TR-001', 'pagination-bounded-100-100-50-accumulation', {
  ...paginationContext,
  pagination: { ...paginationContext.pagination, isComplete: true, uniqueItems: 250 },
});

const duplicatePage = structuredClone(second);
duplicatePage.packages[0].items[0] = structuredClone(first.packages[0].items[99]);
assert.throws(() => mergeDeliveryItemPage(first, duplicatePage, {
  packageId,
  cursor: deliveryItemPageCursorForItem(100),
  limit: 100,
}), DeliveryMonitorContractError, 'an overlapping item page must fail closed');

const foreignScope = structuredClone(second);
foreignScope.workspaceId = DELIVERY_MONITOR_FIXTURE_IDS.targetWorkspaceId;
assert.throws(() => mergeDeliveryItemPage(first, foreignScope, {
  packageId,
  cursor: deliveryItemPageCursorForItem(100),
  limit: 100,
}), DeliveryMonitorContractError, 'a stale or foreign workspace page must never enter the current projection');

const stalePackage = structuredClone(second);
stalePackage.packages[0].currentVersion = 2;
assert.throws(() => mergeDeliveryItemPage(first, stalePackage, {
  packageId,
  cursor: deliveryItemPageCursorForItem(100),
  limit: 100,
}), DeliveryMonitorContractError, 'a page for a changed package version must fail closed');

const staleItemSnapshot = structuredClone(second);
staleItemSnapshot.packages[0].aggregateVersion += 1;
assert.throws(() => mergeDeliveryItemPage(first, staleItemSnapshot, {
  packageId,
  cursor: deliveryItemPageCursorForItem(100),
  limit: 100,
}), DeliveryMonitorContractError, 'pages from different current-item snapshot generations must never merge');

assert.throws(() => mergeDeliveryItemPage(first, second, {
  packageId,
  cursor: deliveryItemPageCursorForItem(99),
  limit: 100,
}), DeliveryMonitorContractError, 'the exact server-projected cursor is required');
marker('DELIVERY-TR-002', 'pagination-duplicate-cursor-scope-and-version-guards', {
  ...paginationContext,
  rejectedPageClasses: ['duplicate', 'foreign-scope', 'stale-version', 'stale-item-snapshot', 'non-exact-cursor'],
});
marker('DELIVERY-TR-001', 'pagination-production-precondition-250-items-complete', {
  ...paginationContext,
  pagination: { ...paginationContext.pagination, isComplete: true, performanceMeasurementReady: true },
});

console.log('Governed Delivery pagination: three bounded pages, cursor integrity, duplicate rejection, tenant reset, and stale-version guards passed.');
