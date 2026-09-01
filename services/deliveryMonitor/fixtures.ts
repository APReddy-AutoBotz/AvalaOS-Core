export const DELIVERY_MONITOR_FIXTURE_IDS = {
  organizationId: '00000001-0000-4000-8000-000000000001',
  workspaceId: '00000002-0000-4000-8000-000000000002',
  targetWorkspaceId: '00000003-0000-4000-8000-000000000003',
  artifactId: '10000000-0000-4000-8000-000000000004',
  artifactVersionId: '10000000-0000-4000-8000-000000000005',
  studioSourcePackageId: '10000000-0000-4000-8000-000000000006',
  handoffId: '10000000-0000-4000-8000-000000000007',
  deliverySourcePackageId: '10000000-0000-4000-8000-000000000008',
  packageId: '10000000-0000-4000-8000-000000000009',
  packageVersionId: '10000000-0000-4000-8000-00000000000a',
  itemAggregateId: '10000000-0000-4000-8000-00000000000b',
  itemVersionId: '10000000-0000-4000-8000-00000000000c',
  priorItemVersionId: '10000000-0000-4000-8000-00000000000f',
  approvalId: '10000000-0000-4000-8000-00000000000d',
  baselineId: '10000000-0000-4000-8000-00000000000e',
  reviewId: '10000000-0000-4000-8000-000000000010',
  handoffVersionId: '10000000-0000-4000-8000-000000000011',
  actorId: '30000006-0000-4000-8000-000000000006',
} as const;

export const DELIVERY_MONITOR_FIXTURE_HASHES = {
  package: '1'.repeat(64), acceptedSet: '2'.repeat(64), baseline: '3'.repeat(64),
} as const;

const fixtureUuid = (value: number) => `${String(value).padStart(8, '0')}-0000-4000-8000-${String(value).padStart(12, '0')}`;
const fixtureItemTypes = ['Milestone', 'Dependency', 'Risk', 'Story', 'Epic', 'Task'] as const;

export const deliveryItemPageCursorForItem = (index: number) => ({
  version: 1,
  id: fixtureUuid(1_000 + index),
});

export const createDeliveryWorkspaceFixture = () => ({
  contractVersion: 'enterprise-delivery-workspace-2',
  organizationId: DELIVERY_MONITOR_FIXTURE_IDS.organizationId,
  workspaceId: DELIVERY_MONITOR_FIXTURE_IDS.workspaceId,
  featureFlags: { moduleHandoffsEnabled: true, directDeliveryPlanningEnabled: true, deliveryItemReviewEnabled: true, monitorApprovedBaselineEnabled: true },
  readOnly: false,
  page: { packageLimit: 25, packageHasMore: false, handoffLimit: 50, handoffHasMore: false, itemHistoryLimit: 25, eventHistoryLimit: 50, handoffTargetItemLimit: 250,
    baselineEligibilityLimit: 100, baselineEligibilityHasMore: false, baselineEligibilityCursorApplied: false },
  eligibleStudioArtifacts: [{
    studioArtifactId: DELIVERY_MONITOR_FIXTURE_IDS.artifactId, artifactType: 'brd', aggregateVersion: 1,
    studioArtifactVersionId: DELIVERY_MONITOR_FIXTURE_IDS.artifactVersionId, studioArtifactVersion: 1,
    lineageClassification: 'not_assessed', planningOnly: true,
    proposalItems: [{ clientKey: 'studio-section-1', itemType: 'Epic', title: 'Validate the governed handoff', description: 'Verify exact lineage.', acceptanceCriteria: [], nonFunctionalRequirements: [], sourceSectionLocator: 'brd.sections.1' }],
  }],
  handoffs: [{
    id: DELIVERY_MONITOR_FIXTURE_IDS.handoffId, direction: 'outbox', edge: 'studio_to_delivery',
    targetWorkspaceId: DELIVERY_MONITOR_FIXTURE_IDS.targetWorkspaceId, status: 'requested', currentVersion: 1,
    requestedAt: '2026-08-31T06:30:00.000Z', expiresAt: '2026-09-01T06:30:00.000Z',
    source: { artifactType: 'brd', studioArtifactVersion: 1, templateKind: 'system', templateVersion: '1', lineageClassification: 'not_assessed', planningOnly: true },
    targetItems: [{ clientKey: 'item-0001', itemType: 'Task', title: 'Validate the governed handoff', description: 'Verify exact lineage.',
      acceptanceCriteria: ['Canonical identifiers match.'], nonFunctionalRequirements: ['No live execution.'], sourceSectionLocator: 'brd.sections.1', ordinal: 1 }],
    history: [{ version: 1, status: 'requested', rationale: null, createdAt: '2026-08-31T06:30:00.000Z' }],
    reviewHistory: [], approvalHistory: [], blockers: [], historyPage: { eventLimit: 50, historyHasMore: false, reviewHasMore: false, approvalHasMore: false }, actions: ['delivery.handoff.withdraw'],
  }],
  packages: [{
    id: DELIVERY_MONITOR_FIXTURE_IDS.packageId, currentVersionId: DELIVERY_MONITOR_FIXTURE_IDS.packageVersionId, currentVersion: 1,
    aggregateVersion: 1, status: 'approved', sourcePackage: {
      version: 1, sourceMode: 'studio_handoff',
      lineageClassification: 'not_assessed', planningOnly: true,
      studioArtifactType: 'brd', studioArtifactVersion: 1, templateKind: 'system', templateVersion: '1',
    },
    items: [{
      itemAggregateId: DELIVERY_MONITOR_FIXTURE_IDS.itemAggregateId, aggregateVersion: 2, itemVersionId: DELIVERY_MONITOR_FIXTURE_IDS.itemVersionId, version: 2,
      status: 'accepted', itemType: 'Task', title: 'Validate the governed handoff', description: 'Verify the exact accepted item lineage.',
      acceptanceCriteria: ['Canonical identifiers match.'], nonFunctionalRequirements: ['No live execution.'],
      sourceCitation: { artifactType: 'brd', artifactVersion: 1, sectionLocator: 'brd.sections.1' },
      decision: 'accepted', rationale: 'Required for the approved planning package.',
      history: [
        { version: 1, status: 'proposed', itemType: 'Task', title: 'Validate handoff', description: 'Verify the lineage.', acceptanceCriteria: ['Canonical identifiers match.'], nonFunctionalRequirements: ['No live execution.'], createdAt: '2026-08-31T06:30:00.000Z' },
        { version: 2, status: 'accepted', itemType: 'Task', title: 'Validate the governed handoff', description: 'Verify the exact accepted item lineage.', acceptanceCriteria: ['Canonical identifiers match.'], nonFunctionalRequirements: ['No live execution.'], rationale: 'Required for approval.', createdAt: '2026-08-31T06:31:00.000Z', decision: 'accepted', decisionRationale: 'Required for the approved planning package.', diff: { fromVersion: 1, toVersion: 2, changedFields: ['title', 'description'] } },
      ],
    }],
    itemPage: { limit: 50, hasMore: false, nextCursor: null, cursorApplied: false, isComplete: true },
    acceptedItemCount: 1,
    blockers: [], blockerCount: 0,
    historyPage: { limit: 50, reviewHasMore: false, approvalHasMore: false },
    reviewHistory: [{ packageVersion: 1, acceptedItemCount: 1, outcome: 'approved', rationale: 'Reviewed.', createdAt: '2026-08-31T06:32:00.000Z' }],
    approvalHistory: [{ packageVersion: 1, acceptedItemCount: 1, outcome: 'approved', rationale: 'Approved.', createdAt: '2026-08-31T06:33:00.000Z' }],
    actions: ['monitor.baseline.create'],
  }],
  baselineEligibility: [{ workPackageId: DELIVERY_MONITOR_FIXTURE_IDS.packageId, workPackageVersionId: DELIVERY_MONITOR_FIXTURE_IDS.packageVersionId,
    workPackageVersion: 1, acceptedItemCount: 1, lineageClassification: 'not_assessed', planningOnly: true, action: 'monitor.baseline.create' }],
  actions: ['delivery.handoff.request', 'delivery.package.create.manual'],
});

export const createDeliveryItemPageFixture = ({
  start,
  count,
  total = 250,
}: {
  start: number;
  count: number;
  total?: number;
}) => {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count) || !Number.isSafeInteger(total)
    || start < 1 || count < 1 || count > 100 || total < start + count - 1 || total > 250) {
    throw new Error('DELIVERY_ITEM_PAGE_FIXTURE_INVALID');
  }
  const workspace = createDeliveryWorkspaceFixture();
  const end = start + count - 1;
  const hasMore = end < total;
  const deliveryPackage = {
    ...workspace.packages[0],
    status: 'draft',
    items: Array.from({ length: count }, (_, offset) => {
      const index = start + offset;
      const title = `Canonical work item ${String(index).padStart(3, '0')}`;
      return {
        itemAggregateId: fixtureUuid(1_000 + index),
        aggregateVersion: 1,
        itemVersionId: fixtureUuid(2_000 + index),
        version: 1,
        status: 'proposed',
        itemType: fixtureItemTypes[(index - 1) % fixtureItemTypes.length],
        title,
        description: `Deterministic governed proposal ${index}.`,
        acceptanceCriteria: [`Exact proposal ${index} is reviewed by a human.`],
        nonFunctionalRequirements: ['No execution or live telemetry authority.'],
        sourceCitation: {
          artifactType: 'brd',
          artifactVersion: 4,
          sectionLocator: `brd.sections.requirements-${String(index).padStart(3, '0')}`,
        },
        history: [{
          version: 1,
          status: 'proposed',
          itemType: fixtureItemTypes[(index - 1) % fixtureItemTypes.length],
          title,
          description: `Deterministic governed proposal ${index}.`,
          acceptanceCriteria: [`Exact proposal ${index} is reviewed by a human.`],
          nonFunctionalRequirements: ['No execution or live telemetry authority.'],
          createdAt: '2026-08-31T06:30:00.000Z',
        }],
      };
    }),
    itemPage: {
      limit: 100,
      hasMore,
      nextCursor: hasMore ? { version: 1, itemId: fixtureUuid(1_000 + end) } : null,
      cursorApplied: start > 1,
      isComplete: start === 1 && !hasMore,
    },
    acceptedItemCount: null,
    blockers: [`${total} work item decisions unresolved.`],
    blockerCount: total,
    reviewHistory: [],
    approvalHistory: [],
    actions: ['delivery.item.review', 'delivery.package.revision.commit'],
  };
  return { ...workspace, packages: [deliveryPackage], baselineEligibility: [] };
};

export const createMonitorBaselinesFixture = () => ({
  contractVersion: 'enterprise-monitor-approved-baselines-2', organizationId: DELIVERY_MONITOR_FIXTURE_IDS.organizationId,
  workspaceId: DELIVERY_MONITOR_FIXTURE_IDS.workspaceId, featureFlags: { monitorApprovedBaselineEnabled: true },
  readOnly: true, liveTelemetryConnected: false,
  baselines: [{
    id: DELIVERY_MONITOR_FIXTURE_IDS.baselineId, version: 1, status: 'approved', readiness: 'not_ready',
    contract: 'delivery-monitor-2', lineageClassification: 'not_assessed', planningOnly: true, workPackageId: DELIVERY_MONITOR_FIXTURE_IDS.packageId,
    workPackageVersion: 1, acceptedItemCount: 1,
    acceptedItems: [{ itemVersion: 2, itemType: 'Task', title: 'Validate the governed handoff', status: 'accepted' }],
    milestones: [], dependencies: [], blockers: [], risks: [], liveTelemetryConnected: false,
  }], actions: [],
});
