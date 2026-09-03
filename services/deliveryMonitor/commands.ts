import { DELIVERY_ACTIONS, DELIVERY_ITEM_TYPES, type DeliveryAction, type DeliveryItemType } from './contracts';

export type DeliveryMonitorCommandInput =
  | { action: 'delivery.handoff.request'; targetWorkspaceId: string; studioArtifactId: string; studioArtifactVersionId: string; expectedAggregateVersion: number; expectedCurrentVersionId: string; expectedApprovedVersionId: string }
  | { action: 'delivery.handoff.review.resolve'; handoffId: string; expectedVersion: number; outcome: 'approved' | 'changes_requested' | 'rejected'; rationale: string }
  | { action: 'delivery.handoff.approval.resolve'; handoffId: string; expectedVersion: number; outcome: 'approved' | 'rejected'; rationale: string }
  | { action: 'delivery.handoff.withdraw'; handoffId: string; expectedVersion: number; rationale: string }
  | { action: 'delivery.handoff.consume'; handoffId: string; expectedVersion: number }
  | { action: 'delivery.package.create.manual'; manualBrief: string; items: ManualDeliveryItemInput[] }
  | { action: 'delivery.item.review'; itemAggregateId: string; expectedAggregateVersion: number; expectedItemVersionId: string; outcome: 'edited'; rationale: string; authored: DeliveryItemAuthoredFields & { type: DeliveryItemType } }
  | { action: 'delivery.item.review'; itemAggregateId: string; expectedAggregateVersion: number; expectedItemVersionId: string; outcome: 'accepted' | 'rejected'; rationale: string }
  | { action: 'delivery.package.revision.commit'; workPackageId: string; expectedPackageVersion: number; expectedPackageVersionId: string; expectedPackageAggregateVersion: number; expectedItems: DeliveryItemIdentityInput[]; itemRevisions: Array<{ itemAggregateId: string; expectedAggregateVersion: number; expectedItemVersionId: string; rationale: string; authored: DeliveryItemAuthoredFields & { type: DeliveryItemType } }> }
  | { action: 'delivery.package.review.resolve'; workPackageId: string; expectedPackageVersion: number; expectedPackageVersionId: string; expectedPackageAggregateVersion: number; outcome: 'approved' | 'changes_requested' | 'rejected'; rationale: string }
  | { action: 'delivery.package.approval.resolve'; workPackageId: string; expectedPackageVersion: number; expectedPackageVersionId: string; expectedPackageAggregateVersion: number; outcome: 'approved' | 'rejected'; rationale: string }
  | { action: 'monitor.baseline.create'; workPackageId: string; expectedPackageVersion: number; expectedPackageVersionId: string };

export interface DeliveryItemAuthoredFields {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  nonFunctionalRequirements: string[];
}

export interface DeliveryItemIdentityInput {
  itemAggregateId: string;
  expectedAggregateVersion: number;
  expectedItemVersionId: string;
}

export interface ManualDeliveryItemInput extends DeliveryItemAuthoredFields {
  type: DeliveryItemType;
  parentOrdinal?: number;
}

export class DeliveryMonitorCommandInputError extends Error {
  constructor(public readonly code: 'INVALID_PAYLOAD') {
    super(code);
    this.name = 'DeliveryMonitorCommandInputError';
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id = (value: string) => {
  if (!uuid.test(value)) throw new DeliveryMonitorCommandInputError('INVALID_PAYLOAD');
  return value.toLowerCase();
};
const integer = (value: number, allowZero = false) => {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) throw new DeliveryMonitorCommandInputError('INVALID_PAYLOAD');
  return value;
};
const text = (value: string, min: number, max: number) => {
  const normalized = value.trim();
  const size = Array.from(normalized).length;
  if (size < min || size > max) throw new DeliveryMonitorCommandInputError('INVALID_PAYLOAD');
  return normalized;
};
const list = (values: string[], maxItems: number, maxLength: number) => {
  if (!Array.isArray(values) || values.length > maxItems) throw new DeliveryMonitorCommandInputError('INVALID_PAYLOAD');
  return values.map(value => text(value, 1, maxLength));
};
const authored = (value: DeliveryItemAuthoredFields): DeliveryItemAuthoredFields => ({
  title: text(value.title, 1, 240),
  description: text(value.description, 1, 12_000),
  acceptanceCriteria: list(value.acceptanceCriteria, 100, 2_000),
  nonFunctionalRequirements: list(value.nonFunctionalRequirements, 100, 2_000),
});
const sqlItemType = (value: DeliveryItemType) => `${value[0].toUpperCase()}${value.slice(1)}`;
const exactInputKeys = (value: object, allowed: readonly string[]) => {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new DeliveryMonitorCommandInputError('INVALID_PAYLOAD');
};
const itemIdentities = (values: DeliveryItemIdentityInput[]) => {
  if (!Array.isArray(values) || values.length < 1 || values.length > 250) throw new DeliveryMonitorCommandInputError('INVALID_PAYLOAD');
  const decoded = values.map(value => {
    exactInputKeys(value, ['itemAggregateId', 'expectedAggregateVersion', 'expectedItemVersionId']);
    return { itemAggregateId: id(value.itemAggregateId), expectedAggregateVersion: integer(value.expectedAggregateVersion), expectedItemVersionId: id(value.expectedItemVersionId) };
  }).sort((left, right) => left.itemAggregateId.localeCompare(right.itemAggregateId));
  if (new Set(decoded.map(value => value.itemAggregateId)).size !== decoded.length) throw new DeliveryMonitorCommandInputError('INVALID_PAYLOAD');
  return decoded;
};
const items = (values: ManualDeliveryItemInput[]) => {
  if (!Array.isArray(values) || values.length < 1 || values.length > 250) throw new DeliveryMonitorCommandInputError('INVALID_PAYLOAD');
  return values.map((item, index) => {
    if (!DELIVERY_ITEM_TYPES.includes(item.type)) throw new DeliveryMonitorCommandInputError('INVALID_PAYLOAD');
    const clientKey = `item-${String(index + 1).padStart(4, '0')}`;
    const parentOrdinal = item.parentOrdinal === undefined ? undefined : integer(item.parentOrdinal);
    if (parentOrdinal !== undefined && parentOrdinal >= index + 1) throw new DeliveryMonitorCommandInputError('INVALID_PAYLOAD');
    const parentClientKey = parentOrdinal === undefined ? undefined : `item-${String(parentOrdinal).padStart(4, '0')}`;
    if ('sourceSectionLocator' in item) throw new DeliveryMonitorCommandInputError('INVALID_PAYLOAD');
    return {
      clientKey, itemType: sqlItemType(item.type), ...authored(item),
      ...(parentClientKey ? { parentClientKey } : {}),
    };
  });
};

export const buildDeliveryMonitorSelectorPayload = (input: DeliveryMonitorCommandInput): Record<string, unknown> => {
  if (!DELIVERY_ACTIONS.includes(input.action as DeliveryAction)) throw new DeliveryMonitorCommandInputError('INVALID_PAYLOAD');
  switch (input.action) {
    case 'delivery.handoff.request':
      exactInputKeys(input, ['action', 'targetWorkspaceId', 'studioArtifactId', 'studioArtifactVersionId', 'expectedAggregateVersion', 'expectedCurrentVersionId', 'expectedApprovedVersionId']);
      return {
        targetWorkspaceId: id(input.targetWorkspaceId), studioArtifactId: id(input.studioArtifactId), studioArtifactVersionId: id(input.studioArtifactVersionId),
        expectedAggregateVersion: integer(input.expectedAggregateVersion), expectedCurrentVersionId: id(input.expectedCurrentVersionId),
        expectedApprovedVersionId: id(input.expectedApprovedVersionId),
      };
    case 'delivery.handoff.review.resolve':
    case 'delivery.handoff.approval.resolve':
      exactInputKeys(input, ['action', 'handoffId', 'expectedVersion', 'outcome', 'rationale']);
      return { handoffId: id(input.handoffId), expectedHandoffVersion: integer(input.expectedVersion), outcome: input.outcome, rationale: text(input.rationale, 1, 4_000) };
    case 'delivery.handoff.withdraw':
      exactInputKeys(input, ['action', 'handoffId', 'expectedVersion', 'rationale']);
      return { handoffId: id(input.handoffId), expectedHandoffVersion: integer(input.expectedVersion), rationale: text(input.rationale, 1, 4_000) };
    case 'delivery.handoff.consume':
      exactInputKeys(input, ['action', 'handoffId', 'expectedVersion']);
      return { handoffId: id(input.handoffId), expectedHandoffVersion: integer(input.expectedVersion) };
    case 'delivery.package.create.manual': {
      exactInputKeys(input, ['action', 'manualBrief', 'items']);
      return { manualBrief: text(input.manualBrief, 1, 20_000), items: items(input.items) };
    }
    case 'delivery.item.review':
      exactInputKeys(input, input.outcome === 'edited'
        ? ['action', 'itemAggregateId', 'expectedAggregateVersion', 'expectedItemVersionId', 'outcome', 'rationale', 'authored']
        : ['action', 'itemAggregateId', 'expectedAggregateVersion', 'expectedItemVersionId', 'outcome', 'rationale']);
      return {
        itemAggregateId: id(input.itemAggregateId), expectedAggregateVersion: integer(input.expectedAggregateVersion), expectedItemVersionId: id(input.expectedItemVersionId),
        outcome: input.outcome, rationale: text(input.rationale, 1, 4_000), ...(input.outcome === 'edited' ? { item: { itemType: sqlItemType(input.authored.type), ...authored(input.authored) } } : {}),
      };
    case 'delivery.package.revision.commit':
      exactInputKeys(input, ['action', 'workPackageId', 'expectedPackageVersion', 'expectedPackageVersionId', 'expectedPackageAggregateVersion', 'expectedItems', 'itemRevisions']);
      if (input.itemRevisions.length < 1 || input.itemRevisions.length > 250) {
        throw new DeliveryMonitorCommandInputError('INVALID_PAYLOAD');
      }
      const expectedItems = itemIdentities(input.expectedItems);
      const expectedById = new Map(expectedItems.map(value => [value.itemAggregateId, value]));
      const itemRevisions = input.itemRevisions.map(item => ({
        itemAggregateId: id(item.itemAggregateId), expectedAggregateVersion: integer(item.expectedAggregateVersion), expectedItemVersionId: id(item.expectedItemVersionId), rationale: text(item.rationale, 1, 4_000), item: { itemType: sqlItemType(item.authored.type), ...authored(item.authored) },
      })).sort((left, right) => left.itemAggregateId.localeCompare(right.itemAggregateId));
      if (new Set(itemRevisions.map(item => item.itemAggregateId)).size !== itemRevisions.length
        || itemRevisions.some(value => {
          const identity = expectedById.get(value.itemAggregateId);
          return !identity || identity.expectedAggregateVersion !== value.expectedAggregateVersion || identity.expectedItemVersionId !== value.expectedItemVersionId;
        })) throw new DeliveryMonitorCommandInputError('INVALID_PAYLOAD');
      return { workPackageId: id(input.workPackageId), expectedPackageVersion: integer(input.expectedPackageVersion), expectedPackageVersionId: id(input.expectedPackageVersionId), expectedPackageAggregateVersion: integer(input.expectedPackageAggregateVersion), expectedItems, itemRevisions };
    case 'delivery.package.review.resolve':
    case 'delivery.package.approval.resolve':
      exactInputKeys(input, ['action', 'workPackageId', 'expectedPackageVersion', 'expectedPackageVersionId', 'expectedPackageAggregateVersion', 'outcome', 'rationale']);
      return { workPackageId: id(input.workPackageId), expectedPackageVersion: integer(input.expectedPackageVersion), expectedPackageVersionId: id(input.expectedPackageVersionId),
        expectedPackageAggregateVersion: integer(input.expectedPackageAggregateVersion), outcome: input.outcome, rationale: text(input.rationale, 1, 4_000) };
    case 'monitor.baseline.create':
      exactInputKeys(input, ['action', 'workPackageId', 'expectedPackageVersion', 'expectedPackageVersionId']);
      return { workPackageId: id(input.workPackageId), expectedPackageVersion: integer(input.expectedPackageVersion), expectedPackageVersionId: id(input.expectedPackageVersionId) };
  }
};
