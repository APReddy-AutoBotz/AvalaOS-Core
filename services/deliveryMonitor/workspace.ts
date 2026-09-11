import {
  DELIVERY_ITEM_PAGE_MAX,
  DELIVERY_PACKAGE_ITEM_MAX,
  DeliveryMonitorContractError,
  type DeliveryBaselineEligibilityPageRequest,
  type DeliveryItemPageCursor,
  type DeliveryItemPageRequest,
  type DeliveryItemProjection,
  type DeliveryPackageProjection,
  type DeliveryWorkspaceProjection,
  type MonitorApprovedBaselineProjection,
} from './contracts';

const compareCursor = (left: DeliveryItemPageCursor, right: DeliveryItemPageCursor) => (
  left.version === right.version ? left.id.localeCompare(right.id) : left.version - right.version
);

const itemCursor = (item: DeliveryItemProjection): DeliveryItemPageCursor => ({
  version: item.version,
  id: item.aggregateId,
});

const invalidPage = (): never => {
  throw new DeliveryMonitorContractError('PROJECTION_INVALID');
};

const compareBaselineEligibilityCursor = (
  left: DeliveryBaselineEligibilityPageRequest['cursor'],
  right: DeliveryBaselineEligibilityPageRequest['cursor'],
) => {
  const timestampOrder = Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
  return timestampOrder === 0 ? left.workPackageId.localeCompare(right.workPackageId) : timestampOrder;
};

/**
 * Accumulates one strictly decoded server page into the first-page projection.
 * It never grants actions: every item action remains the server-decoded action
 * for that exact page and the package action set remains the first projection.
 */
export const mergeDeliveryItemPage = (
  current: DeliveryWorkspaceProjection,
  page: DeliveryWorkspaceProjection,
  request: DeliveryItemPageRequest,
): DeliveryWorkspaceProjection => {
  if (current.organizationId !== page.organizationId
    || current.workspaceId !== page.workspaceId
    || current.readOnly !== page.readOnly
    || JSON.stringify(current.featureFlags) !== JSON.stringify(page.featureFlags)
    || request.limit < 1
    || request.limit > DELIVERY_ITEM_PAGE_MAX
    || !Number.isSafeInteger(request.limit)
    || page.packages.length !== 1) invalidPage();

  const currentPackage = current.packages.find(value => value.id === request.packageId);
  const pagePackage = page.packages[0];
  const expectedCursor = currentPackage?.itemPage.nextCursor;
  if (!currentPackage
    || !expectedCursor
    || expectedCursor.version !== request.cursor.version
    || expectedCursor.id !== request.cursor.id
    || pagePackage.id !== currentPackage.id
    || pagePackage.currentVersionId !== currentPackage.currentVersionId
    || pagePackage.currentVersion !== currentPackage.currentVersion
    || pagePackage.aggregateVersion !== currentPackage.aggregateVersion
    || pagePackage.status !== currentPackage.status
    || pagePackage.sourcePackage.version !== currentPackage.sourcePackage.version
    || pagePackage.sourcePackage.sourceMode !== currentPackage.sourcePackage.sourceMode
    || pagePackage.sourcePackage.lineageClassification !== currentPackage.sourcePackage.lineageClassification
    || pagePackage.sourcePackage.planningOnly !== currentPackage.sourcePackage.planningOnly
    || pagePackage.sourcePackage.studioArtifactVersion !== currentPackage.sourcePackage.studioArtifactVersion
    || pagePackage.sourcePackage.studioArtifactType !== currentPackage.sourcePackage.studioArtifactType
    || pagePackage.itemPage.limit !== request.limit
    || !pagePackage.itemPage.cursorApplied
    || pagePackage.itemPage.isComplete
    || pagePackage.items.length > request.limit) invalidPage();

  let previous = request.cursor;
  const existingIds = new Set(currentPackage.items.map(item => item.aggregateId));
  for (const item of pagePackage.items) {
    const cursor = itemCursor(item);
    if (existingIds.has(item.aggregateId)
      || compareCursor(cursor, previous) <= 0
      || (item.actions.includes('delivery.item.review') && !currentPackage.actions.includes('delivery.item.review'))) invalidPage();
    existingIds.add(item.aggregateId);
    previous = cursor;
  }
  if (currentPackage.items.length + pagePackage.items.length > DELIVERY_PACKAGE_ITEM_MAX) invalidPage();
  if (pagePackage.itemPage.hasMore) {
    const nextCursor = pagePackage.itemPage.nextCursor;
    if (!nextCursor || pagePackage.items.length !== request.limit || compareCursor(nextCursor, previous) !== 0) invalidPage();
  } else if (pagePackage.itemPage.nextCursor || pagePackage.items.length === 0) invalidPage();

  const mergedPackage: DeliveryPackageProjection = {
    ...currentPackage,
    items: [...currentPackage.items, ...pagePackage.items],
    itemPage: {
      limit: request.limit,
      hasMore: pagePackage.itemPage.hasMore,
      cursorApplied: false,
      isComplete: !pagePackage.itemPage.hasMore,
      ...(pagePackage.itemPage.nextCursor ? { nextCursor: pagePackage.itemPage.nextCursor } : {}),
    },
  };
  return {
    ...current,
    packages: current.packages.map(value => value.id === mergedPackage.id ? mergedPackage : value),
  };
};

/**
 * Replaces only the minimized baseline-eligibility selector page. The broader
 * Delivery projection and its action set remain those of the current snapshot.
 */
export const replaceDeliveryBaselineEligibilityPage = (
  current: DeliveryWorkspaceProjection,
  page: DeliveryWorkspaceProjection,
  request: DeliveryBaselineEligibilityPageRequest,
): DeliveryWorkspaceProjection => {
  const expected = current.page.baselineEligibilityNextCursor;
  const next = page.page.baselineEligibilityNextCursor;
  if (current.organizationId !== page.organizationId
    || current.workspaceId !== page.workspaceId
    || current.readOnly !== page.readOnly
    || JSON.stringify(current.featureFlags) !== JSON.stringify(page.featureFlags)
    || !Number.isSafeInteger(request.limit)
    || request.limit < 1
    || request.limit > 100
    || !expected
    || expected.updatedAt !== request.cursor.updatedAt
    || expected.workPackageId !== request.cursor.workPackageId
    || page.page.baselineEligibilityLimit !== request.limit
    || !page.page.baselineEligibilityCursorApplied
    || page.baselineEligibility.length > request.limit
    || (page.page.baselineEligibilityHasMore && page.baselineEligibility.length !== request.limit)
    || (next && compareBaselineEligibilityCursor(next, request.cursor) >= 0)
    || new Set(page.baselineEligibility.map(value => value.workPackageVersionId)).size !== page.baselineEligibility.length) invalidPage();
  return {
    ...current,
    baselineEligibility: page.baselineEligibility,
    page: {
      ...current.page,
      baselineEligibilityLimit: page.page.baselineEligibilityLimit,
      baselineEligibilityHasMore: page.page.baselineEligibilityHasMore,
      baselineEligibilityCursorApplied: true,
      ...(next ? { baselineEligibilityNextCursor: next } : { baselineEligibilityNextCursor: undefined }),
    },
  };
};

export const currentAcceptedDeliveryItems = (deliveryPackage: DeliveryPackageProjection): DeliveryItemProjection[] | null => (
  deliveryPackage.itemPage.isComplete
    ? deliveryPackage.items.filter(item => item.decision?.outcome === 'accepted' && item.status === 'accepted')
    : null
);

export const packageDecisionBlockers = (deliveryPackage: DeliveryPackageProjection): string[] => {
  const blockers = [...deliveryPackage.blockers];
  if (!deliveryPackage.itemPage.isComplete) {
    blockers.push('Work item page is incomplete; package decision completeness is unavailable.');
    return blockers;
  }
  return blockers;
};

export const baselineMatchesDeliveryPackage = (
  baseline: MonitorApprovedBaselineProjection,
  deliveryPackage: DeliveryPackageProjection,
) => {
  if (deliveryPackage.acceptedItemCount === undefined
    || baseline.workPackageId !== deliveryPackage.id
    || baseline.workPackageVersion !== deliveryPackage.currentVersion
    || baseline.acceptedItemCount !== deliveryPackage.acceptedItemCount
    || baseline.lineageClassification !== deliveryPackage.sourcePackage.lineageClassification
    || baseline.planningOnly !== deliveryPackage.sourcePackage.planningOnly) return false;
  const accepted = currentAcceptedDeliveryItems(deliveryPackage);
  if (accepted === null) return true;
  if (accepted.length !== baseline.acceptedItemCount) return false;
  const packageManifest = accepted.map(item => `${item.version}:${item.type}:${item.title}:${item.status}`).sort();
  const baselineManifest = baseline.acceptedItems.map(item => `${item.version}:${item.type}:${item.title}:${item.status}`).sort();
  return packageManifest.length === baselineManifest.length && packageManifest.every((entry, index) => entry === baselineManifest[index]);
};
