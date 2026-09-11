import type { DeliveryMonitorDatabase } from './deliveryMonitorDb.ts';

export const DELIVERY_MONITOR_COMMANDS = [
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

export type DeliveryMonitorCommandType = typeof DELIVERY_MONITOR_COMMANDS[number];

export const DELIVERY_MONITOR_CAPABILITIES: Record<DeliveryMonitorCommandType, readonly string[]> = {
  'delivery.handoff.request': ['delivery.handoff.request'],
  'delivery.handoff.review.resolve': ['delivery.handoff.review'],
  'delivery.handoff.approval.resolve': ['delivery.handoff.approve'],
  'delivery.handoff.withdraw': ['delivery.handoff.request'],
  'delivery.handoff.consume': ['delivery.handoff.consume'],
  'delivery.package.create.manual': ['delivery.package.manage'],
  'delivery.item.review': ['delivery.package.manage'],
  'delivery.package.revision.commit': ['delivery.package.manage'],
  'delivery.package.review.resolve': ['delivery.package.review'],
  'delivery.package.approval.resolve': ['delivery.package.approve'],
  'monitor.baseline.create': ['monitor.baseline.create'],
};

type JsonRecord = Record<string, unknown>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256 = /^[0-9a-f]{64}$/;

export class DeliveryMonitorCommandError extends Error {
  constructor(public readonly code:
    | 'INVALID_PAYLOAD'
    | 'RESOURCE_NOT_FOUND'
    | 'RESOURCE_STALE'
    | 'COMMAND_BLOCKED'
    | 'COMMAND_UNAVAILABLE'
    | 'RECEIPT_FINALIZATION_FAILED') {
    super(code);
    this.name = 'DeliveryMonitorCommandError';
  }
}

const record = (value: unknown): JsonRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
  return value as JsonRecord;
};
const exact = (value: JsonRecord, required: readonly string[], optional: readonly string[] = []) => {
  const allowed = new Set([...required, ...optional]);
  if (required.some(key => !(key in value)) || Object.keys(value).some(key => !allowed.has(key))) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
  return value;
};
const string = (value: unknown, min: number, max: number) => {
  if (typeof value !== 'string') throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
  const normalized = value.trim();
  const size = Array.from(normalized).length;
  if (size < min || size > max) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
  return normalized;
};
const id = (value: unknown) => {
  const result = string(value, 1, 128);
  if (!uuid.test(result)) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
  return result.toLowerCase();
};
const integer = (value: unknown, allowZero = false) => {
  if (!Number.isSafeInteger(value) || Number(value) < (allowZero ? 0 : 1)) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
  return Number(value);
};
const literal = <T extends string>(value: unknown, values: readonly T[]): T => {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
  return value as T;
};
const textList = (value: unknown, maxItems: number, maxLength: number) => {
  if (!Array.isArray(value) || value.length > maxItems) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
  return value.map(item => string(item, 1, maxLength));
};
const authored = (value: unknown) => {
  const row = exact(record(value), ['title', 'description', 'acceptanceCriteria', 'nonFunctionalRequirements'], ['itemType', 'clientKey', 'parentClientKey', 'sourceSectionLocator']);
  return { title: string(row.title, 1, 240), description: string(row.description, 1, 12_000),
    acceptanceCriteria: textList(row.acceptanceCriteria, 100, 2_000), nonFunctionalRequirements: textList(row.nonFunctionalRequirements, 100, 2_000) };
};
const item = (value: unknown) => {
  const row = exact(record(value), ['clientKey', 'itemType', 'title', 'description', 'acceptanceCriteria', 'nonFunctionalRequirements'], ['parentClientKey', 'sourceSectionLocator']);
  if (row.sourceSectionLocator !== undefined) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
  return {
    clientKey: string(row.clientKey, 1, 120), itemType: literal(row.itemType, ['Epic', 'Story', 'Task', 'Milestone', 'Dependency', 'Risk'] as const),
    ...authored(row), ...(row.parentClientKey === undefined ? {} : { parentClientKey: string(row.parentClientKey, 1, 120) }),
  };
};
const itemList = (value: unknown) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 250) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
  const decoded = value.map(entry => item(entry));
  if (new Set(decoded.map(entry => entry.clientKey)).size !== decoded.length) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
  const priorKeys = new Set<string>();
  for (const entry of decoded) {
    if (entry.parentClientKey !== undefined && !priorKeys.has(entry.parentClientKey)) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
    priorKeys.add(entry.clientKey);
  }
  return decoded;
};
const expectedItemIdentities = (value: unknown) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 250) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
  const decoded = value.map(entry => {
    const identity = exact(record(entry), ['itemAggregateId', 'expectedAggregateVersion', 'expectedItemVersionId']);
    return { itemAggregateId: id(identity.itemAggregateId), expectedAggregateVersion: integer(identity.expectedAggregateVersion), expectedItemVersionId: id(identity.expectedItemVersionId) };
  }).sort((left, right) => left.itemAggregateId.localeCompare(right.itemAggregateId));
  if (new Set(decoded.map(entry => entry.itemAggregateId)).size !== decoded.length) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
  return decoded;
};
export const parseDeliveryMonitorPayload = (
  action: DeliveryMonitorCommandType,
  value: unknown,
): JsonRecord => {
  const payload = record(value);
  switch (action) {
    case 'delivery.handoff.request': {
      const row = exact(payload, ['targetWorkspaceId', 'studioArtifactId', 'studioArtifactVersionId', 'expectedAggregateVersion', 'expectedCurrentVersionId', 'expectedApprovedVersionId']);
      return { targetWorkspaceId: id(row.targetWorkspaceId), studioArtifactId: id(row.studioArtifactId), studioArtifactVersionId: id(row.studioArtifactVersionId),
        expectedAggregateVersion: integer(row.expectedAggregateVersion), expectedCurrentVersionId: id(row.expectedCurrentVersionId), expectedApprovedVersionId: id(row.expectedApprovedVersionId) };
    }
    case 'delivery.handoff.review.resolve': {
      const row = exact(payload, ['handoffId', 'expectedHandoffVersion', 'outcome', 'rationale']);
      return { handoffId: id(row.handoffId), expectedHandoffVersion: integer(row.expectedHandoffVersion), outcome: literal(row.outcome, ['approved', 'changes_requested', 'rejected'] as const), rationale: string(row.rationale, 1, 4_000) };
    }
    case 'delivery.handoff.approval.resolve': {
      const row = exact(payload, ['handoffId', 'expectedHandoffVersion', 'outcome', 'rationale']);
      return { handoffId: id(row.handoffId), expectedHandoffVersion: integer(row.expectedHandoffVersion), outcome: literal(row.outcome, ['approved', 'rejected'] as const), rationale: string(row.rationale, 1, 4_000) };
    }
    case 'delivery.handoff.withdraw': {
      const row = exact(payload, ['handoffId', 'expectedHandoffVersion', 'rationale']);
      return { handoffId: id(row.handoffId), expectedHandoffVersion: integer(row.expectedHandoffVersion), rationale: string(row.rationale, 1, 4_000) };
    }
    case 'delivery.handoff.consume': {
      const row = exact(payload, ['handoffId', 'expectedHandoffVersion']);
      return { handoffId: id(row.handoffId), expectedHandoffVersion: integer(row.expectedHandoffVersion) };
    }
    case 'delivery.package.create.manual': {
      const row = exact(payload, ['manualBrief', 'items']);
      return { manualBrief: string(row.manualBrief, 1, 20_000), items: itemList(row.items) };
    }
    case 'delivery.item.review': {
      const row = exact(payload, ['itemAggregateId', 'expectedAggregateVersion', 'expectedItemVersionId', 'outcome', 'rationale'], ['item']);
      const outcome = literal(row.outcome, ['edited', 'accepted', 'rejected'] as const);
      if ((outcome === 'edited') !== (row.item !== undefined)) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
      const edited = row.item === undefined ? undefined : exact(record(row.item), ['itemType', 'title', 'description', 'acceptanceCriteria', 'nonFunctionalRequirements']);
      return { itemAggregateId: id(row.itemAggregateId), expectedAggregateVersion: integer(row.expectedAggregateVersion), expectedItemVersionId: id(row.expectedItemVersionId), outcome,
        rationale: string(row.rationale, 1, 4_000), ...(edited ? { item: { itemType: literal(edited.itemType, ['Epic', 'Story', 'Task', 'Milestone', 'Dependency', 'Risk'] as const), ...authored(edited) } } : {}) };
    }
    case 'delivery.package.revision.commit': {
      const row = exact(payload, ['workPackageId', 'expectedPackageVersion', 'expectedPackageVersionId', 'expectedPackageAggregateVersion', 'expectedItems', 'itemRevisions']);
      if (!Array.isArray(row.itemRevisions) || row.itemRevisions.length < 1 || row.itemRevisions.length > 250) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
      const expectedItems = expectedItemIdentities(row.expectedItems);
      const expectedById = new Map(expectedItems.map(entry => [entry.itemAggregateId, entry]));
      const itemRevisions = row.itemRevisions.map(entry => { const revision = exact(record(entry), ['itemAggregateId', 'expectedAggregateVersion', 'expectedItemVersionId', 'rationale', 'item']); const revisionItem = exact(record(revision.item), ['itemType', 'title', 'description', 'acceptanceCriteria', 'nonFunctionalRequirements']); return { itemAggregateId: id(revision.itemAggregateId), expectedAggregateVersion: integer(revision.expectedAggregateVersion), expectedItemVersionId: id(revision.expectedItemVersionId), rationale: string(revision.rationale, 1, 4_000), item: { itemType: literal(revisionItem.itemType, ['Epic', 'Story', 'Task', 'Milestone', 'Dependency', 'Risk'] as const), ...authored(revisionItem) } }; }).sort((left, right) => left.itemAggregateId.localeCompare(right.itemAggregateId));
      if (new Set(itemRevisions.map(item => item.itemAggregateId)).size !== itemRevisions.length) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
      if (itemRevisions.some(item => {
        const identity = expectedById.get(item.itemAggregateId);
        return !identity || identity.expectedAggregateVersion !== item.expectedAggregateVersion || identity.expectedItemVersionId !== item.expectedItemVersionId;
      })) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
      return { workPackageId: id(row.workPackageId), expectedPackageVersion: integer(row.expectedPackageVersion), expectedPackageVersionId: id(row.expectedPackageVersionId), expectedPackageAggregateVersion: integer(row.expectedPackageAggregateVersion), expectedItems, itemRevisions };
    }
    case 'delivery.package.review.resolve': {
      const row = exact(payload, ['workPackageId', 'expectedPackageVersion', 'expectedPackageVersionId', 'expectedPackageAggregateVersion', 'outcome', 'rationale']);
      return { workPackageId: id(row.workPackageId), expectedPackageVersion: integer(row.expectedPackageVersion), expectedPackageVersionId: id(row.expectedPackageVersionId),
        expectedPackageAggregateVersion: integer(row.expectedPackageAggregateVersion), outcome: literal(row.outcome, ['approved', 'changes_requested', 'rejected'] as const), rationale: string(row.rationale, 1, 4_000) };
    }
    case 'delivery.package.approval.resolve': {
      const row = exact(payload, ['workPackageId', 'expectedPackageVersion', 'expectedPackageVersionId', 'expectedPackageAggregateVersion', 'outcome', 'rationale']);
      return { workPackageId: id(row.workPackageId), expectedPackageVersion: integer(row.expectedPackageVersion), expectedPackageVersionId: id(row.expectedPackageVersionId),
        expectedPackageAggregateVersion: integer(row.expectedPackageAggregateVersion), outcome: literal(row.outcome, ['approved', 'rejected'] as const), rationale: string(row.rationale, 1, 4_000) };
    }
    case 'monitor.baseline.create': {
      const row = exact(payload, ['workPackageId', 'expectedPackageVersion', 'expectedPackageVersionId']);
      return { workPackageId: id(row.workPackageId), expectedPackageVersion: integer(row.expectedPackageVersion), expectedPackageVersionId: id(row.expectedPackageVersionId) };
    }
  }
};

export interface DeliveryMonitorExecutionAuthority {
  actorId: string;
  organizationId: string;
  workspaceId: string;
  authorizationVersion: number;
}

export interface DeliveryMonitorReceiptBinding {
  id: string;
  requestId: string;
  idempotencyKey: string;
  executionToken: string;
  executionFence: number;
}

export interface DeliveryMonitorCanonicalResult extends JsonRecord {
  ok: true;
  outcome: 'committed' | 'replayed';
  receiptId: string;
  action: DeliveryMonitorCommandType;
  resourceId: string;
  resourceVersion?: number;
  resourceHash?: string;
  milestones?: string[];
  dependencies?: string[];
  blockers?: string[];
  risks?: string[];
}

export interface DeliveryMonitorPublicResult extends JsonRecord {
  ok: true;
  outcome: 'committed' | 'replayed';
  receiptId: string;
  action: DeliveryMonitorCommandType;
  resourceId: string;
  resourceVersion: number;
}

const canonicalBaseKeys = ['ok', 'outcome', 'receiptId', 'action', 'resourceId', 'resourceVersion'] as const;
const canonicalFields: Record<DeliveryMonitorCommandType, readonly string[]> = {
  'delivery.handoff.request': ['sourceWorkspaceId', 'targetWorkspaceId', 'studioArtifactId', 'studioArtifactType', 'studioArtifactVersionId', 'studioArtifactHash', 'lineageClassification', 'planningOnly', 'routePolicyVersion', 'routePolicyHash', 'expiresAt', 'targetPackageHash', 'proposedItemCount'],
  'delivery.handoff.review.resolve': ['status'],
  'delivery.handoff.approval.resolve': ['status'],
  'delivery.handoff.withdraw': ['status'],
  'delivery.handoff.consume': ['packageVersionId', 'packageHash', 'sourcePackageId', 'sourcePackageHash', 'lineageClassification', 'planningOnly', 'items'],
  'delivery.package.create.manual': ['packageVersionId', 'packageHash', 'sourcePackageId', 'sourcePackageHash', 'lineageClassification', 'planningOnly', 'items'],
  'delivery.item.review': ['itemVersionId', 'itemHash', 'status', 'workPackageId'],
  'delivery.package.revision.commit': ['packageVersionId', 'packageHash', 'items'],
  'delivery.package.review.resolve': ['workPackageId', 'packageVersionId', 'packageHash', 'acceptedSetHash', 'acceptedItemCount', 'status'],
  'delivery.package.approval.resolve': ['workPackageId', 'packageVersionId', 'packageHash', 'acceptedSetHash', 'acceptedItemCount', 'status'],
  'monitor.baseline.create': ['workPackageId', 'packageVersionId', 'packageHash', 'packageApprovalId', 'acceptedSetHash', 'acceptedItemCount', 'resourceHash', 'lineageClassification', 'planningOnly', 'milestones', 'dependencies', 'blockers', 'risks', 'readiness', 'liveTelemetryConnected'],
};

const canonicalHash = (value: unknown) => {
  if (typeof value !== 'string' || !sha256.test(value)) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
};
const canonicalItems = (value: unknown, kind: 'initial' | 'revision') => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 250) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
  const aggregateIds = new Set<string>();
  const versionIds = new Set<string>();
  for (const itemValue of value) {
    const entry = record(itemValue);
    if (kind === 'initial') {
      const initial = exact(entry, ['clientKey', 'aggregateId', 'versionId', 'version', 'hash']);
      string(initial.clientKey, 1, 120);
      const aggregateId = id(initial.aggregateId);
      const versionId = id(initial.versionId);
      integer(initial.version);
      canonicalHash(initial.hash);
      if (aggregateIds.has(aggregateId) || versionIds.has(versionId)) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
      aggregateIds.add(aggregateId);
      versionIds.add(versionId);
    } else {
      const revised = exact(entry, ['itemAggregateId', 'itemVersionId', 'version', 'itemHash', 'status']);
      const aggregateId = id(revised.itemAggregateId);
      const versionId = id(revised.itemVersionId);
      integer(revised.version);
      canonicalHash(revised.itemHash);
      literal(revised.status, ['edited', 'proposed'] as const);
      if (aggregateIds.has(aggregateId) || versionIds.has(versionId)) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
      aggregateIds.add(aggregateId);
      versionIds.add(versionId);
    }
  }
};

interface DeliveryMonitorResultBinding {
  receiptId?: string;
  payload: JsonRecord;
}

const bindCanonicalResult = (
  result: DeliveryMonitorCanonicalResult,
  expectedAction: DeliveryMonitorCommandType,
  binding?: DeliveryMonitorResultBinding,
) => {
  if (!binding) return;
  if (binding.receiptId !== undefined && result.receiptId !== binding.receiptId) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
  const payload = binding.payload;
  if (expectedAction === 'delivery.package.revision.commit') {
    if (result.resourceId !== payload.workPackageId
      || result.resourceVersion !== Number(payload.expectedPackageVersion) + 1
      || result.packageVersionId === payload.expectedPackageVersionId) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
    const expected = expectedItemIdentities(payload.expectedItems);
    const expectedById = new Map(expected.map(item => [item.itemAggregateId, item]));
    const predecessorVersionIds = new Set(expected.map(item => item.expectedItemVersionId));
    const selectedIds = new Set((payload.itemRevisions as JsonRecord[]).map(item => id(item.itemAggregateId)));
    const descendants = (result.items as JsonRecord[]).map(item => ({
      itemAggregateId: id(item.itemAggregateId),
      itemVersionId: id(item.itemVersionId),
      version: integer(item.version),
      status: literal(item.status, ['edited', 'proposed'] as const),
    })).sort((left, right) => left.itemAggregateId.localeCompare(right.itemAggregateId));
    if (expected.length !== descendants.length) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
    descendants.forEach((descendant, index) => {
      const identity = expected[index];
      if (descendant.itemAggregateId !== identity.itemAggregateId
        || descendant.version !== identity.expectedAggregateVersion + 1
        || predecessorVersionIds.has(descendant.itemVersionId)
        || descendant.status !== (selectedIds.has(descendant.itemAggregateId) ? 'edited' : 'proposed')
        || !expectedById.has(descendant.itemAggregateId)) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
    });
  } else if (expectedAction === 'delivery.item.review') {
    if (result.resourceId !== payload.itemAggregateId) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
  } else if (expectedAction === 'delivery.package.review.resolve' || expectedAction === 'delivery.package.approval.resolve') {
    if (result.workPackageId !== payload.workPackageId || result.packageVersionId !== payload.expectedPackageVersionId || result.resourceVersion !== payload.expectedPackageVersion) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
  } else if (expectedAction === 'monitor.baseline.create') {
    if (result.workPackageId !== payload.workPackageId || result.packageVersionId !== payload.expectedPackageVersionId) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
  } else if (expectedAction === 'delivery.handoff.review.resolve' || expectedAction === 'delivery.handoff.approval.resolve' || expectedAction === 'delivery.handoff.withdraw') {
    if (result.resourceId !== payload.handoffId || result.resourceVersion !== Number(payload.expectedHandoffVersion) + 1) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
  } else if (expectedAction === 'delivery.handoff.request') {
    if (result.targetWorkspaceId !== payload.targetWorkspaceId || result.studioArtifactId !== payload.studioArtifactId || result.studioArtifactVersionId !== payload.studioArtifactVersionId) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
  }
};

const validateCanonicalResult = (value: unknown, expectedAction: DeliveryMonitorCommandType): DeliveryMonitorCanonicalResult => {
  const row = exact(record(value), canonicalBaseKeys, canonicalFields[expectedAction]);
  if (row.ok !== true || row.action !== expectedAction || (row.outcome !== 'committed' && row.outcome !== 'replayed')) {
    throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
  }
  id(row.receiptId);
  id(row.resourceId);
  integer(row.resourceVersion);
  switch (expectedAction) {
    case 'delivery.handoff.request': {
      id(row.sourceWorkspaceId); id(row.targetWorkspaceId); id(row.studioArtifactId); id(row.studioArtifactVersionId);
      literal(row.studioArtifactType, ['brd', 'frd', 'pdd'] as const); canonicalHash(row.studioArtifactHash);
      const classification = literal(row.lineageClassification, ['assessed', 'mixed', 'not_assessed'] as const);
      if (typeof row.planningOnly !== 'boolean' || row.planningOnly !== (classification === 'not_assessed')) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
      integer(row.routePolicyVersion); canonicalHash(row.routePolicyHash); canonicalHash(row.targetPackageHash);
      integer(row.proposedItemCount, false);
      if (typeof row.expiresAt !== 'string' || !Number.isFinite(Date.parse(row.expiresAt))) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
      break;
    }
    case 'delivery.handoff.review.resolve':
      literal(row.status, ['approval_ready', 'changes_requested', 'rejected'] as const); break;
    case 'delivery.handoff.approval.resolve':
      literal(row.status, ['approved', 'rejected'] as const); break;
    case 'delivery.handoff.withdraw':
      literal(row.status, ['withdrawn'] as const); break;
    case 'delivery.handoff.consume':
    case 'delivery.package.create.manual': {
      id(row.packageVersionId); canonicalHash(row.packageHash); id(row.sourcePackageId); canonicalHash(row.sourcePackageHash);
      const classification = literal(row.lineageClassification, ['assessed', 'mixed', 'not_assessed'] as const);
      if (typeof row.planningOnly !== 'boolean' || row.planningOnly !== (classification === 'not_assessed')) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
      canonicalItems(row.items, 'initial');
      break;
    }
    case 'delivery.item.review':
      id(row.itemVersionId); canonicalHash(row.itemHash); id(row.workPackageId);
      literal(row.status, ['edited', 'accepted', 'rejected'] as const); break;
    case 'delivery.package.revision.commit':
      id(row.packageVersionId); canonicalHash(row.packageHash); canonicalItems(row.items, 'revision'); break;
    case 'delivery.package.review.resolve':
      id(row.workPackageId); id(row.packageVersionId); canonicalHash(row.packageHash); canonicalHash(row.acceptedSetHash);
      integer(row.acceptedItemCount);
      literal(row.status, ['approved', 'changes_requested', 'rejected'] as const); break;
    case 'delivery.package.approval.resolve':
      id(row.workPackageId); id(row.packageVersionId); canonicalHash(row.packageHash); canonicalHash(row.acceptedSetHash);
      integer(row.acceptedItemCount);
      literal(row.status, ['approved', 'rejected'] as const); break;
    case 'monitor.baseline.create': {
      id(row.workPackageId); id(row.packageVersionId); id(row.packageApprovalId);
      canonicalHash(row.packageHash); canonicalHash(row.acceptedSetHash); canonicalHash(row.resourceHash);
      integer(row.acceptedItemCount);
      const classification = literal(row.lineageClassification, ['assessed', 'mixed', 'not_assessed'] as const);
      if (typeof row.planningOnly !== 'boolean' || row.planningOnly !== (classification === 'not_assessed')) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
      const readiness = literal(row.readiness, ['not_ready', 'review_required'] as const);
      if (readiness !== (row.planningOnly ? 'not_ready' : 'review_required')) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
      textList(row.milestones, 250, 500); textList(row.dependencies, 250, 500); textList(row.risks, 250, 500);
      if (textList(row.blockers, 250, 500).length !== 0) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
      if (row.liveTelemetryConnected !== false) throw new DeliveryMonitorCommandError('INVALID_PAYLOAD');
      break;
    }
  }
  return value as DeliveryMonitorCanonicalResult;
};

export const decodeDeliveryMonitorCanonicalResult = (
  value: unknown,
  expectedAction: DeliveryMonitorCommandType,
  binding?: DeliveryMonitorResultBinding,
): DeliveryMonitorCanonicalResult => {
  try {
    const result = validateCanonicalResult(value, expectedAction);
    bindCanonicalResult(result, expectedAction, binding);
    return result;
  } catch {
    throw new DeliveryMonitorCommandError('RECEIPT_FINALIZATION_FAILED');
  }
};

export const projectDeliveryMonitorPublicResult = (
  value: unknown,
  expectedAction: DeliveryMonitorCommandType,
  binding?: DeliveryMonitorResultBinding,
): DeliveryMonitorPublicResult => {
  const canonical = decodeDeliveryMonitorCanonicalResult(value, expectedAction, binding);
  const projected: DeliveryMonitorPublicResult = {
    ok: true,
    outcome: canonical.outcome,
    receiptId: canonical.receiptId,
    action: canonical.action,
    resourceId: canonical.resourceId,
    resourceVersion: canonical.resourceVersion as number,
  };
  for (const key of ['status', 'workPackageId', 'packageVersionId', 'acceptedItemCount', 'lineageClassification', 'planningOnly', 'readiness', 'liveTelemetryConnected'] as const) {
    if (canonical[key] !== undefined) projected[key] = canonical[key];
  }
  return projected;
};

export const executeDeliveryMonitorCommand = async (input: {
  action: DeliveryMonitorCommandType;
  payload: unknown;
  authority: DeliveryMonitorExecutionAuthority;
  receipt: DeliveryMonitorReceiptBinding;
  database: Pick<DeliveryMonitorDatabase, 'execute'>;
}): Promise<DeliveryMonitorPublicResult> => {
  const payload = parseDeliveryMonitorPayload(input.action, input.payload);
  const result = await input.database.execute({
    action: input.action,
    actorId: id(input.authority.actorId),
    organizationId: id(input.authority.organizationId),
    workspaceId: id(input.authority.workspaceId),
    authorizationVersion: integer(input.authority.authorizationVersion),
    receiptId: id(input.receipt.id),
    requestId: id(input.receipt.requestId),
    idempotencyKey: string(input.receipt.idempotencyKey, 8, 128),
    executionToken: id(input.receipt.executionToken),
    executionFence: integer(input.receipt.executionFence),
    ...payload,
  });
  // The database may return the first canonical receipt for an equivalent
  // concurrent attempt. Bind the business selectors here; SQL binds that
  // canonical receipt to the exact actor/action/idempotency/payload hash.
  return projectDeliveryMonitorPublicResult(result, input.action, { payload });
};
