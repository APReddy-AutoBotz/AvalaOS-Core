/**
 * Strict browser-safe contracts for governed Delivery and read-only Monitor.
 *
 * Canonical hashes and raw actor/source identities remain server-side evidence.
 * The browser receives only opaque selectors needed for authorized commands and
 * minimized human-readable projections. Mutation payloads are separate.
 */

export const DELIVERY_WORKSPACE_CONTRACT_VERSION = 'enterprise-delivery-workspace-2' as const;
export const MONITOR_BASELINE_CONTRACT_VERSION = 'enterprise-monitor-approved-baselines-2' as const;

export const DELIVERY_ITEM_TYPES = [
  'epic', 'story', 'task', 'milestone', 'dependency', 'risk',
] as const;

export type DeliveryItemType = typeof DELIVERY_ITEM_TYPES[number];
export type DeliveryLineageClassification = 'assessed' | 'mixed' | 'not_assessed';
export type DeliverySourceMode = 'studio_handoff' | 'manual';
export type DeliveryPackageStatus =
  | 'draft'
  | 'review'
  | 'approved'
  | 'rejected'
  | 'stale'
  | 'blocked';
export type DeliveryHandoffStatus =
  | 'requested'
  | 'target_review'
  | 'changes_requested'
  | 'rejected'
  | 'approval_ready'
  | 'approved'
  | 'consumed'
  | 'withdrawn'
  | 'stale';

export const DELIVERY_ACTIONS = [
  'delivery.handoff.request',
  'delivery.handoff.review.resolve',
  'delivery.handoff.approval.resolve',
  'delivery.handoff.withdraw',
  'delivery.handoff.consume',
  'delivery.package.create.manual',
  'delivery.item.review',
  'delivery.package.revision.commit',
  'delivery.package.review.resolve',
  'delivery.package.approval.resolve',
  'monitor.baseline.create',
] as const;

export type DeliveryAction = typeof DELIVERY_ACTIONS[number];

export const DELIVERY_ITEM_PAGE_MAX = 100 as const;
export const DELIVERY_PACKAGE_ITEM_MAX = 250 as const;

export interface DeliveryItemPageCursor {
  version: number;
  id: string;
}

export interface DeliveryItemPageRequest {
  packageId: string;
  cursor: DeliveryItemPageCursor;
  limit: number;
}

export interface DeliveryBaselineEligibilityPageCursor {
  updatedAt: string;
  workPackageId: string;
}

export interface DeliveryBaselineEligibilityPageRequest {
  cursor: DeliveryBaselineEligibilityPageCursor;
  limit: number;
}

export interface DeliveryFeatureFlagsProjection {
  moduleHandoffsEnabled: boolean;
  directDeliveryPlanningEnabled: boolean;
  deliveryItemReviewEnabled: boolean;
  monitorApprovedBaselineEnabled: boolean;
}

export interface DeliverySourceCitationProjection {
  artifactVersion: number;
  artifactType: 'brd' | 'frd' | 'pdd';
  sectionLocator: string;
}

export interface DeliveryItemDecisionProjection {
  outcome: 'accepted' | 'rejected';
  rationale: string;
}

export interface DeliveryItemVersionProjection {
  version: number;
  status: 'proposed' | 'edited' | 'accepted' | 'rejected' | 'superseded';
  title: string;
  description: string;
  acceptanceCriteria: string[];
  nonFunctionalRequirements: string[];
  rationale?: string;
  createdAt: string;
}

export interface DeliveryItemDiffProjection {
  fromVersion: number;
  toVersion: number;
  changedFields: Array<'type' | 'title' | 'description' | 'acceptanceCriteria' | 'nonFunctionalRequirements'>;
}

export interface DeliveryItemProjection {
  aggregateId: string;
  currentVersionId: string;
  aggregateVersion: number;
  version: number;
  status: DeliveryItemVersionProjection['status'];
  type: DeliveryItemType;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  nonFunctionalRequirements: string[];
  sourceCitation?: DeliverySourceCitationProjection;
  parentAggregateId?: string;
  decision?: DeliveryItemDecisionProjection;
  history: DeliveryItemVersionProjection[];
  diffs: DeliveryItemDiffProjection[];
  actions: DeliveryAction[];
}

export interface DeliverySourcePackageProjection {
  version: number;
  sourceMode: DeliverySourceMode;
  lineageClassification: DeliveryLineageClassification;
  planningOnly: boolean;
  studioArtifactVersion?: number;
  studioArtifactType?: 'brd' | 'frd' | 'pdd';
  templateKind?: 'system' | 'tenant';
  templateVersion?: string;
}

export interface DeliveryPackageDecisionProjection {
  packageVersion: number;
  acceptedItemCount: number;
  outcome: 'approved' | 'changes_requested' | 'rejected';
  rationale: string;
  createdAt: string;
}

export interface DeliveryPackageProjection {
  id: string;
  currentVersionId: string;
  currentVersion: number;
  aggregateVersion: number;
  status: DeliveryPackageStatus;
  label: string;
  sourcePackage: DeliverySourcePackageProjection;
  items: DeliveryItemProjection[];
  itemPage: {
    limit: number;
    hasMore: boolean;
    cursorApplied: boolean;
    isComplete: boolean;
    nextCursor?: DeliveryItemPageCursor;
  };
  acceptedItemCount?: number;
  historyPage: { limit: number; reviewHasMore: boolean; approvalHasMore: boolean };
  reviewState: 'not_requested' | 'in_review' | 'changes_requested' | 'approved' | 'rejected';
  approvalState: 'not_requested' | 'pending' | 'approved' | 'rejected';
  blockers: string[];
  blockerCount: number;
  reviewHistory: DeliveryPackageDecisionProjection[];
  approvalHistory: DeliveryPackageDecisionProjection[];
  actions: DeliveryAction[];
}

export interface DeliveryHandoffProjection {
  id: string;
  version: number;
  direction: 'inbox' | 'outbox';
  status: DeliveryHandoffStatus;
  sourceArtifactVersion: number;
  targetWorkspaceId: string;
  lineageClassification: DeliveryLineageClassification;
  planningOnly: boolean;
  preview: {
    artifactType: 'brd' | 'frd' | 'pdd';
    proposedItemCount: number;
    sourceCoverageLabel: string;
    blockers: string[];
  };
  actions: DeliveryAction[];
  createdAt: string;
  targetItems: Array<ManualDeliveryProjectionItem & { clientKey: string; parentClientKey?: string; ordinal: number; sourceSectionLocator: string }>;
  history: Array<{ version: number; status: DeliveryHandoffStatus; rationale?: string; createdAt: string }>;
  reviewHistory: Array<{ handoffVersion: number; outcome: 'approved' | 'changes_requested' | 'rejected'; rationale: string; createdAt: string }>;
  approvalHistory: Array<{ handoffVersion: number; outcome: 'approved' | 'rejected'; rationale: string; createdAt: string }>;
  historyPage: { eventLimit: number; historyHasMore: boolean; reviewHasMore: boolean; approvalHasMore: boolean };
}

interface ManualDeliveryProjectionItem {
  type: DeliveryItemType;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  nonFunctionalRequirements: string[];
}

export interface EligibleStudioHandoffCandidateProjection {
  studioArtifactId: string;
  artifactType: 'brd' | 'frd' | 'pdd';
  aggregateVersion: number;
  studioArtifactVersionId: string;
  studioArtifactVersion: number;
  lineageClassification: DeliveryLineageClassification;
  planningOnly: boolean;
  proposalItems: Array<ManualDeliveryProjectionItem & { clientKey: string; sourceSectionLocator: string }>;
}

export interface MonitorBaselineEligibilityProjection {
  workPackageId: string;
  workPackageVersionId: string;
  workPackageVersion: number;
  acceptedItemCount: number;
  lineageClassification: DeliveryLineageClassification;
  planningOnly: boolean;
  action: 'monitor.baseline.create';
}

export interface DeliveryWorkspaceProjection {
  contractVersion: typeof DELIVERY_WORKSPACE_CONTRACT_VERSION;
  organizationId: string;
  workspaceId: string;
  featureFlags: DeliveryFeatureFlagsProjection;
  readOnly: boolean;
  page: {
    packageLimit: number;
    packageHasMore: boolean;
    handoffLimit: number;
    handoffHasMore: boolean;
    itemHistoryLimit: number;
    eventHistoryLimit: number;
    handoffTargetItemLimit: number;
    baselineEligibilityLimit: number;
    baselineEligibilityHasMore: boolean;
    baselineEligibilityCursorApplied: boolean;
    baselineEligibilityNextCursor?: DeliveryBaselineEligibilityPageCursor;
  };
  eligibleStudioArtifacts: EligibleStudioHandoffCandidateProjection[];
  inbox: DeliveryHandoffProjection[];
  outbox: DeliveryHandoffProjection[];
  packages: DeliveryPackageProjection[];
  baselineEligibility: MonitorBaselineEligibilityProjection[];
  actions: DeliveryAction[];
}

export interface MonitorAcceptedItemProjection {
  version: number;
  type: DeliveryItemType;
  title: string;
  status: 'accepted';
}

export interface MonitorApprovedBaselineProjection {
  id: string;
  version: number;
  status: 'approved';
  readiness: 'not_ready' | 'review_required';
  lineageClassification: DeliveryLineageClassification;
  planningOnly: boolean;
  workPackageId: string;
  workPackageVersion: number;
  acceptedItemCount: number;
  acceptedItems: MonitorAcceptedItemProjection[];
  milestones: string[];
  dependencies: string[];
  blockers: string[];
  risks: string[];
}

export interface MonitorApprovedBaselinesProjection {
  contractVersion: typeof MONITOR_BASELINE_CONTRACT_VERSION;
  organizationId: string;
  workspaceId: string;
  featureFlags: Pick<DeliveryFeatureFlagsProjection, 'monitorApprovedBaselineEnabled'>;
  readOnly: true;
  liveTelemetryConnected: false;
  baselines: MonitorApprovedBaselineProjection[];
  actions: [];
}

export class DeliveryMonitorContractError extends Error {
  constructor(public readonly code: 'PROJECTION_UNAVAILABLE' | 'PROJECTION_INVALID') {
    super(code);
    this.name = 'DeliveryMonitorContractError';
  }
}

type JsonRecord = Record<string, unknown>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unsafeKey = /secret|token|credential|storage(path|key)|raw(content|source|prompt|completion)|provider(payload|response)/i;
const rawEvidenceKey = /hash$|^(?:actor|reviewer|approvedBy|createdBy|requestedBy|sourceWorkspaceId|studioSourcePackageId|sourcePackageId|packageApprovalId)$/i;
const record = (value: unknown): JsonRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
  return value as JsonRecord;
};
const exact = (value: JsonRecord, required: readonly string[], optional: readonly string[] = []) => {
  const allowed = new Set([...required, ...optional]);
  if (required.some(key => !(key in value)) || Object.keys(value).some(key => !allowed.has(key) || unsafeKey.test(key) || rawEvidenceKey.test(key))) {
    throw new DeliveryMonitorContractError('PROJECTION_INVALID');
  }
  return value;
};
const string = (value: unknown, max = 4_000, min = 1) => {
  if (typeof value !== 'string' || Array.from(value).length < min || Array.from(value).length > max) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
  return value;
};
const timestamp = (value: unknown) => {
  const result = string(value, 80);
  if (!Number.isFinite(Date.parse(result))) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
  return result;
};
const id = (value: unknown) => {
  const result = string(value, 128);
  if (!uuid.test(result)) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
  return result;
};
const integer = (value: unknown, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
  return Number(value);
};
const boolean = (value: unknown) => {
  if (typeof value !== 'boolean') throw new DeliveryMonitorContractError('PROJECTION_INVALID');
  return value;
};
const literal = <T extends string>(value: unknown, values: readonly T[]): T => {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
  return value as T;
};
const strings = (value: unknown, maxItems = 250, maxLength = 4_000) => {
  if (!Array.isArray(value) || value.length > maxItems) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
  return value.map(item => string(item, maxLength));
};
const actions = (value: unknown): DeliveryAction[] => {
  if (!Array.isArray(value) || value.length > DELIVERY_ACTIONS.length) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
  const decoded = value.map(action => literal(action, DELIVERY_ACTIONS));
  if (new Set(decoded).size !== decoded.length) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
  return decoded;
};
const array = (value: unknown, max: number, min = 0): unknown[] => {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
  return value;
};
const lineage = (classificationValue: unknown, planningOnlyValue: unknown) => {
  const classification = literal(classificationValue, ['assessed', 'mixed', 'not_assessed'] as const);
  const planningOnly = boolean(planningOnlyValue);
  if (planningOnly !== (classification === 'not_assessed')) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
  return { classification, planningOnly };
};

const decodeFlags = (value: unknown): DeliveryFeatureFlagsProjection => {
  const row = exact(record(value), ['moduleHandoffsEnabled', 'directDeliveryPlanningEnabled', 'deliveryItemReviewEnabled', 'monitorApprovedBaselineEnabled']);
  return {
    moduleHandoffsEnabled: boolean(row.moduleHandoffsEnabled),
    directDeliveryPlanningEnabled: boolean(row.directDeliveryPlanningEnabled),
    deliveryItemReviewEnabled: boolean(row.deliveryItemReviewEnabled),
    monitorApprovedBaselineEnabled: boolean(row.monitorApprovedBaselineEnabled),
  };
};

const decodeCitation = (value: unknown): DeliverySourceCitationProjection => {
  const row = exact(record(value), ['artifactVersion', 'artifactType', 'sectionLocator']);
  return {
    artifactVersion: integer(row.artifactVersion), artifactType: literal(row.artifactType, ['brd', 'frd', 'pdd'] as const),
    sectionLocator: string(row.sectionLocator, 1_000),
  };
};

const decodeItemType = (value: unknown): DeliveryItemType => literal(value, ['Epic', 'Story', 'Task', 'Milestone', 'Dependency', 'Risk'] as const).toLowerCase() as DeliveryItemType;

const decodeItemVersion = (value: unknown): DeliveryItemVersionProjection => {
  const row = exact(record(value), ['version', 'status', 'itemType', 'title', 'description', 'acceptanceCriteria', 'nonFunctionalRequirements', 'createdAt'], ['rationale', 'decision', 'decisionRationale', 'diff']);
  decodeItemType(row.itemType);
  if (row.decision !== undefined) literal(row.decision, ['accepted', 'rejected'] as const);
  if (row.decisionRationale !== undefined) string(row.decisionRationale, 4_000);
  return {
    version: integer(row.version), status: literal(row.status, ['proposed', 'edited', 'accepted', 'rejected', 'superseded'] as const),
    title: string(row.title, 400), description: string(row.description, 20_000, 0), acceptanceCriteria: strings(row.acceptanceCriteria, 100, 2_000),
    nonFunctionalRequirements: strings(row.nonFunctionalRequirements, 100, 2_000),
    ...(row.rationale === undefined ? {} : { rationale: string(row.rationale, 4_000) }),
    createdAt: timestamp(row.createdAt),
  };
};

const decodeItem = (value: unknown): DeliveryItemProjection => {
  const row = exact(record(value), ['itemAggregateId', 'aggregateVersion', 'itemVersionId', 'version', 'status', 'itemType', 'title', 'description', 'acceptanceCriteria', 'nonFunctionalRequirements', 'history'], ['sourceCitation', 'parentAggregateId', 'decision', 'rationale']);
  const rawHistory = array(row.history, 250, 1);
  const history = rawHistory.map(decodeItemVersion);
  const diffs = rawHistory.flatMap(value => {
    const historyRow = record(value);
    if (historyRow.diff === undefined || historyRow.diff === null) return [];
    const diff = exact(record(historyRow.diff), ['fromVersion', 'toVersion', 'changedFields']);
    return [{ fromVersion: integer(diff.fromVersion), toVersion: integer(diff.toVersion), changedFields: array(diff.changedFields, 5).map(field => {
      const decoded = literal(field, ['itemType', 'title', 'description', 'acceptanceCriteria', 'nonFunctionalRequirements'] as const);
      return decoded === 'itemType' ? 'type' as const : decoded;
    }) }];
  });
  const decision = row.decision === undefined || row.decision === null ? undefined : {
    outcome: literal(row.decision, ['accepted', 'rejected'] as const), rationale: string(row.rationale, 4_000),
  };
  return {
    aggregateId: id(row.itemAggregateId), currentVersionId: id(row.itemVersionId), aggregateVersion: integer(row.aggregateVersion), version: integer(row.version),
    status: literal(row.status, ['proposed', 'edited', 'accepted', 'rejected', 'superseded'] as const), type: decodeItemType(row.itemType),
    title: string(row.title, 400), description: string(row.description, 20_000, 0), acceptanceCriteria: strings(row.acceptanceCriteria, 100, 2_000),
    nonFunctionalRequirements: strings(row.nonFunctionalRequirements, 100, 2_000),
    ...(row.sourceCitation === undefined || row.sourceCitation === null ? {} : { sourceCitation: decodeCitation(row.sourceCitation) }),
    ...(row.parentAggregateId === undefined || row.parentAggregateId === null ? {} : { parentAggregateId: id(row.parentAggregateId) }),
    ...(decision ? { decision } : {}), history, diffs, actions: [],
  };
};

const decodeSourcePackage = (value: unknown): DeliverySourcePackageProjection => {
  const row = exact(record(value), ['version', 'sourceMode', 'lineageClassification', 'planningOnly'], ['studioArtifactType', 'studioArtifactVersion', 'templateKind', 'templateVersion']);
  const sourceMode = literal(row.sourceMode, ['studio_handoff', 'manual'] as const);
  const sourceLineage = lineage(row.lineageClassification, row.planningOnly);
  const result: DeliverySourcePackageProjection = {
    version: integer(row.version), sourceMode,
    lineageClassification: sourceLineage.classification,
    planningOnly: sourceLineage.planningOnly,
    ...(row.studioArtifactVersion === undefined || row.studioArtifactVersion === null ? {} : { studioArtifactVersion: integer(row.studioArtifactVersion) }),
    ...(row.studioArtifactType === undefined || row.studioArtifactType === null ? {} : { studioArtifactType: literal(row.studioArtifactType, ['brd', 'frd', 'pdd'] as const) }),
    ...(row.templateKind === undefined || row.templateKind === null ? {} : { templateKind: literal(row.templateKind, ['system', 'tenant'] as const) }),
    ...(row.templateVersion === undefined || row.templateVersion === null ? {} : { templateVersion: string(row.templateVersion, 120) }),
  };
  const hasStudio = Boolean(result.studioArtifactType && result.studioArtifactVersion);
  if ((sourceMode === 'studio_handoff') !== hasStudio || (sourceMode === 'manual' && (!result.planningOnly || result.lineageClassification !== 'not_assessed'))) {
    throw new DeliveryMonitorContractError('PROJECTION_INVALID');
  }
  return result;
};

const decodeHandoff = (value: unknown): DeliveryHandoffProjection => {
  const row = exact(record(value), ['id', 'direction', 'edge', 'targetWorkspaceId', 'status', 'currentVersion', 'requestedAt', 'expiresAt', 'source', 'targetItems', 'history', 'reviewHistory', 'approvalHistory', 'blockers', 'historyPage', 'actions']);
  if (row.edge !== 'studio_to_delivery') throw new DeliveryMonitorContractError('PROJECTION_INVALID');
  timestamp(row.requestedAt); timestamp(row.expiresAt);
  const source = exact(record(row.source), ['studioArtifactVersion', 'artifactType', 'templateKind', 'templateVersion', 'lineageClassification', 'planningOnly']);
  literal(source.templateKind, ['system', 'tenant'] as const); string(source.templateVersion, 120);
  const sourceLineage = lineage(source.lineageClassification, source.planningOnly);
  const targetItems = array(row.targetItems, 250, 1).map((value, index) => { const target = exact(record(value), ['clientKey', 'itemType', 'title', 'description', 'acceptanceCriteria', 'nonFunctionalRequirements', 'sourceSectionLocator', 'ordinal'], ['parentClientKey']); const clientKey = string(target.clientKey, 120); const parentClientKey = target.parentClientKey === undefined ? undefined : string(target.parentClientKey, 120); if (integer(target.ordinal) !== index + 1 || (parentClientKey && !array(row.targetItems, 250).slice(0, index).some(entry => record(entry).clientKey === parentClientKey))) throw new DeliveryMonitorContractError('PROJECTION_INVALID'); return { type: decodeItemType(target.itemType), title: string(target.title, 400), description: string(target.description, 20_000, 0), acceptanceCriteria: strings(target.acceptanceCriteria, 100, 2_000), nonFunctionalRequirements: strings(target.nonFunctionalRequirements, 100, 2_000), sourceSectionLocator: string(target.sourceSectionLocator, 1_000), ordinal: integer(target.ordinal), ...(parentClientKey ? { parentClientKey } : {}), clientKey }; });
  const history = array(row.history, 250, 1).map(value => { const event = exact(record(value), ['version', 'status', 'rationale', 'createdAt']); return { version: integer(event.version), status: literal(event.status, ['requested', 'target_review', 'changes_requested', 'rejected', 'approval_ready', 'approved', 'consumed', 'withdrawn', 'stale'] as const), ...(event.rationale === null ? {} : { rationale: string(event.rationale, 4_000) }), createdAt: timestamp(event.createdAt) }; });
  const reviewHistory = array(row.reviewHistory, 250).map(value => { const event = exact(record(value), ['handoffVersion', 'outcome', 'rationale', 'createdAt']); return { handoffVersion: integer(event.handoffVersion), outcome: literal(event.outcome, ['approved', 'changes_requested', 'rejected'] as const), rationale: string(event.rationale, 4_000), createdAt: timestamp(event.createdAt) }; });
  const approvalHistory = array(row.approvalHistory, 250).map(value => { const event = exact(record(value), ['handoffVersion', 'outcome', 'rationale', 'createdAt']); return { handoffVersion: integer(event.handoffVersion), outcome: literal(event.outcome, ['approved', 'rejected'] as const), rationale: string(event.rationale, 4_000), createdAt: timestamp(event.createdAt) }; });
  const historyPage = exact(record(row.historyPage), ['eventLimit', 'historyHasMore', 'reviewHasMore', 'approvalHasMore']);
  return {
    id: id(row.id), version: integer(row.currentVersion), direction: literal(row.direction, ['inbox', 'outbox'] as const),
    status: literal(row.status, ['requested', 'target_review', 'changes_requested', 'rejected', 'approval_ready', 'approved', 'consumed', 'withdrawn', 'stale'] as const),
    sourceArtifactVersion: integer(source.studioArtifactVersion),
    targetWorkspaceId: id(row.targetWorkspaceId), lineageClassification: sourceLineage.classification, planningOnly: sourceLineage.planningOnly,
    preview: { artifactType: literal(source.artifactType, ['brd', 'frd', 'pdd'] as const), proposedItemCount: targetItems.length,
      sourceCoverageLabel: `${targetItems.length}/${targetItems.length} exact cited ${String(source.artifactType).toUpperCase()} proposal${targetItems.length === 1 ? '' : 's'}`,
      blockers: strings(row.blockers, 250, 500) },
    actions: actions(row.actions), createdAt: timestamp(row.requestedAt), targetItems, history, reviewHistory, approvalHistory,
    historyPage: { eventLimit: integer(historyPage.eventLimit, 1, 250), historyHasMore: boolean(historyPage.historyHasMore), reviewHasMore: boolean(historyPage.reviewHasMore), approvalHasMore: boolean(historyPage.approvalHasMore) },
  };
};

const decodeEligibleStudioArtifact = (value: unknown): EligibleStudioHandoffCandidateProjection => {
  const row = exact(record(value), ['studioArtifactId', 'artifactType', 'aggregateVersion', 'studioArtifactVersionId', 'studioArtifactVersion', 'lineageClassification', 'planningOnly', 'proposalItems']);
  const artifactType = literal(row.artifactType, ['brd', 'frd', 'pdd'] as const);
  const candidateLineage = lineage(row.lineageClassification, row.planningOnly);
  const clientKeys = new Set<string>();
  const proposalItems = array(row.proposalItems, 250, 1).map(value => {
    const item = exact(record(value), ['clientKey', 'itemType', 'title', 'description', 'acceptanceCriteria', 'nonFunctionalRequirements', 'sourceSectionLocator']);
    const clientKey = string(item.clientKey, 120);
    const sourceSectionLocator = string(item.sourceSectionLocator, 1_000);
    if (clientKeys.has(clientKey) || !sourceSectionLocator.startsWith(`${artifactType}.sections.`)) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
    clientKeys.add(clientKey);
    return { clientKey, type: decodeItemType(item.itemType), title: string(item.title, 240), description: string(item.description, 12_000, 0),
      acceptanceCriteria: strings(item.acceptanceCriteria, 100, 2_000), nonFunctionalRequirements: strings(item.nonFunctionalRequirements, 100, 2_000), sourceSectionLocator };
  });
  return {
    studioArtifactId: id(row.studioArtifactId), artifactType, aggregateVersion: integer(row.aggregateVersion), studioArtifactVersionId: id(row.studioArtifactVersionId),
    studioArtifactVersion: integer(row.studioArtifactVersion), lineageClassification: candidateLineage.classification, planningOnly: candidateLineage.planningOnly,
    proposalItems,
  };
};

export const decodeDeliveryWorkspaceProjection = (value: unknown): DeliveryWorkspaceProjection => {
  if (value === null || value === undefined) throw new DeliveryMonitorContractError('PROJECTION_UNAVAILABLE');
  const row = exact(record(value), ['contractVersion', 'organizationId', 'workspaceId', 'featureFlags', 'readOnly', 'page', 'eligibleStudioArtifacts', 'packages', 'baselineEligibility', 'actions'], ['inbox', 'outbox', 'handoffs']);
  if (row.contractVersion !== DELIVERY_WORKSPACE_CONTRACT_VERSION) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
  const hasCombinedHandoffs = row.handoffs !== undefined;
  const hasSplitHandoffs = row.inbox !== undefined || row.outbox !== undefined;
  if (hasCombinedHandoffs && hasSplitHandoffs) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
  const rawHandoffs = hasCombinedHandoffs ? array(row.handoffs, 100).map(decodeHandoff) : [];
  const inbox = hasSplitHandoffs ? array(row.inbox, 100).map(decodeHandoff) : rawHandoffs.filter(item => item.direction === 'inbox');
  const outbox = hasSplitHandoffs ? array(row.outbox, 100).map(decodeHandoff) : rawHandoffs.filter(item => item.direction === 'outbox');
  if (inbox.some(item => item.direction !== 'inbox') || outbox.some(item => item.direction !== 'outbox')) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
  const page = exact(record(row.page), ['packageLimit', 'packageHasMore', 'handoffLimit', 'handoffHasMore', 'itemHistoryLimit', 'eventHistoryLimit', 'handoffTargetItemLimit',
    'baselineEligibilityLimit', 'baselineEligibilityHasMore', 'baselineEligibilityCursorApplied'], ['baselineEligibilityNextCursor']);
  const baselineEligibilityLimit = integer(page.baselineEligibilityLimit, 1, 100);
  const baselineEligibilityHasMore = boolean(page.baselineEligibilityHasMore);
  const baselineEligibilityCursorApplied = boolean(page.baselineEligibilityCursorApplied);
  const rawBaselineEligibilityCursor = page.baselineEligibilityNextCursor === undefined || page.baselineEligibilityNextCursor === null
    ? undefined
    : exact(record(page.baselineEligibilityNextCursor), ['updatedAt', 'workPackageId']);
  const baselineEligibilityNextCursor = rawBaselineEligibilityCursor ? {
    updatedAt: timestamp(rawBaselineEligibilityCursor.updatedAt),
    workPackageId: id(rawBaselineEligibilityCursor.workPackageId),
  } : undefined;
  if (baselineEligibilityHasMore !== Boolean(baselineEligibilityNextCursor)) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
  const baselineEligibility = array(row.baselineEligibility, 100).map(value => {
    const eligible = exact(record(value), ['workPackageId', 'workPackageVersionId', 'workPackageVersion', 'acceptedItemCount', 'lineageClassification', 'planningOnly', 'action']);
    const eligibleLineage = lineage(eligible.lineageClassification, eligible.planningOnly);
    if (eligible.action !== 'monitor.baseline.create') throw new DeliveryMonitorContractError('PROJECTION_INVALID');
    return { workPackageId: id(eligible.workPackageId), workPackageVersionId: id(eligible.workPackageVersionId), workPackageVersion: integer(eligible.workPackageVersion),
      acceptedItemCount: integer(eligible.acceptedItemCount, 1, 250), lineageClassification: eligibleLineage.classification, planningOnly: eligibleLineage.planningOnly,
      action: 'monitor.baseline.create' as const };
  });
  if (baselineEligibilityHasMore && baselineEligibility.length !== baselineEligibilityLimit) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
  return {
    contractVersion: DELIVERY_WORKSPACE_CONTRACT_VERSION, organizationId: id(row.organizationId), workspaceId: id(row.workspaceId),
    featureFlags: decodeFlags(row.featureFlags), readOnly: boolean(row.readOnly), inbox, outbox,
    page: { packageLimit: integer(page.packageLimit, 1, 100), packageHasMore: boolean(page.packageHasMore), handoffLimit: integer(page.handoffLimit, 1, 100),
      handoffHasMore: boolean(page.handoffHasMore), itemHistoryLimit: integer(page.itemHistoryLimit, 1, 250), eventHistoryLimit: integer(page.eventHistoryLimit, 1, 250),
      handoffTargetItemLimit: integer(page.handoffTargetItemLimit, 1, 250), baselineEligibilityLimit, baselineEligibilityHasMore,
      baselineEligibilityCursorApplied, ...(baselineEligibilityNextCursor ? { baselineEligibilityNextCursor } : {}) },
    eligibleStudioArtifacts: array(row.eligibleStudioArtifacts, 25).map(decodeEligibleStudioArtifact),
    packages: array(row.packages, 100).map(value => {
      const pkg = exact(record(value), ['id', 'currentVersion', 'currentVersionId', 'aggregateVersion', 'status', 'sourcePackage', 'items', 'itemPage', 'reviewHistory', 'approvalHistory', 'acceptedItemCount', 'blockers', 'blockerCount', 'historyPage', 'actions']);
      const aggregateVersion = integer(pkg.aggregateVersion);
      const page = exact(record(pkg.itemPage), ['limit', 'hasMore', 'cursorApplied', 'isComplete'], ['nextCursor']);
      const next = page.nextCursor === undefined || page.nextCursor === null ? undefined : exact(record(page.nextCursor), ['version', 'itemId']);
      const hasMore = boolean(page.hasMore);
      const cursorApplied = boolean(page.cursorApplied);
      const isComplete = boolean(page.isComplete);
      if (isComplete !== (!cursorApplied && !hasMore) || hasMore !== Boolean(next)) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
      const packageActions = actions(pkg.actions);
      const reviewHistory = array(pkg.reviewHistory, 50).map(entry => { const event = exact(record(entry), ['packageVersion', 'acceptedItemCount', 'outcome', 'rationale', 'createdAt']); return { packageVersion: integer(event.packageVersion), acceptedItemCount: integer(event.acceptedItemCount, 0, 250), outcome: literal(event.outcome, ['approved', 'changes_requested', 'rejected'] as const), rationale: string(event.rationale, 4_000), createdAt: timestamp(event.createdAt) }; });
      const approvalHistory = array(pkg.approvalHistory, 50).map(entry => { const event = exact(record(entry), ['packageVersion', 'acceptedItemCount', 'outcome', 'rationale', 'createdAt']); return { packageVersion: integer(event.packageVersion), acceptedItemCount: integer(event.acceptedItemCount, 0, 250), outcome: literal(event.outcome, ['approved', 'rejected'] as const), rationale: string(event.rationale, 4_000), createdAt: timestamp(event.createdAt) }; });
      const historyPage = exact(record(pkg.historyPage), ['limit', 'reviewHasMore', 'approvalHasMore']);
      const acceptedItemCount = pkg.acceptedItemCount === null || pkg.acceptedItemCount === undefined ? undefined : integer(pkg.acceptedItemCount, 1, 250);
      const status = literal(pkg.status, ['draft', 'review', 'approved', 'rejected', 'stale', 'blocked'] as const);
      const blockers = strings(pkg.blockers, 250, 500);
      const blockerCount = integer(pkg.blockerCount, 0);
      if (blockerCount < blockers.length || (blockerCount === 0) !== (blockers.length === 0)) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
      return {
        id: id(pkg.id), currentVersionId: id(pkg.currentVersionId), currentVersion: integer(pkg.currentVersion), aggregateVersion, status,
        label: `Delivery package v${integer(pkg.currentVersion)}`, sourcePackage: decodeSourcePackage(pkg.sourcePackage),
        items: array(pkg.items, DELIVERY_ITEM_PAGE_MAX).map(decodeItem).map(item => ({ ...item, actions: packageActions.includes('delivery.item.review') ? ['delivery.item.review'] : [] })),
        itemPage: { limit: integer(page.limit, 1, DELIVERY_ITEM_PAGE_MAX), hasMore, cursorApplied, isComplete, ...(next ? { nextCursor: { version: integer(next.version), id: id(next.itemId) } } : {}) },
        ...(acceptedItemCount === undefined ? {} : { acceptedItemCount }), historyPage: { limit: integer(historyPage.limit, 1, 250), reviewHasMore: boolean(historyPage.reviewHasMore), approvalHasMore: boolean(historyPage.approvalHasMore) },
        reviewState: reviewHistory.length ? (reviewHistory.at(-1)?.outcome === 'changes_requested' ? 'changes_requested' : reviewHistory.at(-1)?.outcome) : 'not_requested',
        approvalState: approvalHistory.length ? approvalHistory.at(-1)?.outcome
          : status === 'review' && reviewHistory.at(-1)?.outcome === 'approved' ? 'pending' : 'not_requested',
        blockers, blockerCount, reviewHistory, approvalHistory, actions: packageActions,
      };
    }),
    baselineEligibility,
    actions: actions(row.actions),
  };
};

export const decodeMonitorApprovedBaselinesProjection = (value: unknown): MonitorApprovedBaselinesProjection => {
  if (value === null || value === undefined) throw new DeliveryMonitorContractError('PROJECTION_UNAVAILABLE');
  const row = exact(record(value), ['contractVersion', 'organizationId', 'workspaceId', 'featureFlags', 'readOnly', 'liveTelemetryConnected', 'baselines', 'actions']);
  if (row.contractVersion !== MONITOR_BASELINE_CONTRACT_VERSION || row.readOnly !== true || row.liveTelemetryConnected !== false
    || !Array.isArray(row.actions) || row.actions.length !== 0 || !Array.isArray(row.baselines)) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
  const flags = exact(record(row.featureFlags), ['monitorApprovedBaselineEnabled']);
  return {
    contractVersion: MONITOR_BASELINE_CONTRACT_VERSION, organizationId: id(row.organizationId), workspaceId: id(row.workspaceId),
    featureFlags: { monitorApprovedBaselineEnabled: boolean(flags.monitorApprovedBaselineEnabled) }, readOnly: true, liveTelemetryConnected: false,
    baselines: array(row.baselines, 100).map(value => {
      const baseline = exact(record(value), ['id', 'version', 'contract', 'status', 'readiness', 'lineageClassification', 'planningOnly', 'workPackageId', 'workPackageVersion', 'acceptedItemCount', 'acceptedItems', 'milestones', 'dependencies', 'blockers', 'risks', 'liveTelemetryConnected']);
      if (baseline.contract !== 'delivery-monitor-2' || baseline.liveTelemetryConnected !== false) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
      const baselineLineage = lineage(baseline.lineageClassification, baseline.planningOnly);
      const readiness = literal(baseline.readiness, ['not_ready', 'review_required'] as const);
      if (readiness !== (baselineLineage.planningOnly ? 'not_ready' : 'review_required')) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
      const acceptedItems = array(baseline.acceptedItems, 250, 1);
      const acceptedItemCount = integer(baseline.acceptedItemCount, 1, 250);
      if (acceptedItems.length !== acceptedItemCount) throw new DeliveryMonitorContractError('PROJECTION_INVALID');
      return {
        id: id(baseline.id), version: integer(baseline.version), status: literal(baseline.status, ['approved'] as const), readiness,
        lineageClassification: baselineLineage.classification, planningOnly: baselineLineage.planningOnly,
        workPackageId: id(baseline.workPackageId), workPackageVersion: integer(baseline.workPackageVersion), acceptedItemCount,
        acceptedItems: acceptedItems.map(item => { const accepted = exact(record(item), ['itemVersion', 'itemType', 'title', 'status']); return { version: integer(accepted.itemVersion), type: decodeItemType(accepted.itemType), title: string(accepted.title, 400), status: literal(accepted.status, ['accepted'] as const) }; }),
        milestones: strings(baseline.milestones, 250, 500), dependencies: strings(baseline.dependencies, 250, 500), blockers: strings(baseline.blockers, 250, 500), risks: strings(baseline.risks, 250, 500),
      };
    }),
    actions: [],
  };
};
