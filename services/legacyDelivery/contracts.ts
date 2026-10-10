export const LEGACY_DELIVERY_COMMAND_SCHEMA_VERSION = 'legacy-delivery-command.v1' as const;
export const LEGACY_DELIVERY_QUERY_SCHEMA_VERSION = 'legacy-delivery-query.v1' as const;

export const LEGACY_DELIVERY_ACTIONS = ['import', 'task.create', 'task.update', 'task.delete'] as const;
export type LegacyDeliveryAction = typeof LEGACY_DELIVERY_ACTIONS[number];

export const LEGACY_DELIVERY_TASK_STATUSES = [
  'To Do', 'In Progress', 'In Review', 'Testing', 'Ready for Release', 'Done', 'Blocked', 'On Hold',
] as const;
export type LegacyDeliveryTaskStatus = typeof LEGACY_DELIVERY_TASK_STATUSES[number];
export const LEGACY_DELIVERY_TASK_PRIORITIES = ['High', 'Medium', 'Low'] as const;
export type LegacyDeliveryTaskPriority = typeof LEGACY_DELIVERY_TASK_PRIORITIES[number];
export const LEGACY_DELIVERY_TASK_TYPES = ['Story', 'Task', 'Bug', 'Subtask'] as const;
export type LegacyDeliveryTaskType = typeof LEGACY_DELIVERY_TASK_TYPES[number];

export type LegacyDeliveryImportPayload = {
  projectId: string;
  sourceGenerationId: string;
  expectedSourceDigest: string;
  sourceItemIndices: number[];
};
export type LegacyDeliveryTaskCreatePayload = {
  projectId: string;
  task: {
    title: string;
    description: string;
    priority: LegacyDeliveryTaskPriority;
    type: LegacyDeliveryTaskType;
    assigneeIds: string[];
    dependencyIds: string[];
  };
};
export type LegacyDeliveryTaskPatch = Partial<{
  title: string;
  description: string;
  priority: LegacyDeliveryTaskPriority;
  status: LegacyDeliveryTaskStatus;
  assigneeIds: string[];
  dependencyIds: string[];
}>;
export type LegacyDeliveryTaskUpdatePayload = { taskId: string; expectedVersion: number; patch: LegacyDeliveryTaskPatch };
export type LegacyDeliveryTaskDeletePayload = { taskId: string; expectedVersion: number; deletionReason: string };
export type LegacyDeliveryPayloadByAction = {
  import: LegacyDeliveryImportPayload;
  'task.create': LegacyDeliveryTaskCreatePayload;
  'task.update': LegacyDeliveryTaskUpdatePayload;
  'task.delete': LegacyDeliveryTaskDeletePayload;
};

export type LegacyDeliveryCommandEnvelope<A extends LegacyDeliveryAction = LegacyDeliveryAction> = {
  schemaVersion: typeof LEGACY_DELIVERY_COMMAND_SCHEMA_VERSION;
  action: A;
  organizationId: string;
  workspaceId: string;
  expectedAuthorizationVersion: number;
  requestId: string;
  idempotencyKey: string;
  payload: LegacyDeliveryPayloadByAction[A];
};

export type LegacyDeliverySourceItem = {
  sourceIndex: number;
  type: 'Epic' | 'Story' | 'Task';
  title: string;
  description: string;
  acceptanceCriteria: string[];
};
export type LegacyDeliverySourceProjection = { id: string; digest: string; items: LegacyDeliverySourceItem[] };

export type LegacyDeliveryTaskLineage = {
  schemaVersion: 'legacy-delivery-lineage.v1';
  importId: string;
  documentGenerationId: string;
  documentSourceDigest: string;
  sourceItemIndex: number;
  sourceProcessId: string;
  sourceAssessmentId: string;
  sourceEpicIndex: number | null;
  sourceEpicTitle: string | null;
};

export type LegacyDeliveryTaskProjection = {
  id: string;
  version: number | null;
  mutable: boolean;
  projectId: string;
  title: string;
  description: string;
  status: LegacyDeliveryTaskStatus;
  priority: LegacyDeliveryTaskPriority;
  type: LegacyDeliveryTaskType;
  assigneeIds: string[];
  dependencyIds: string[];
  ownerId: string | null;
  reporterId: string | null;
  sourceLineage: LegacyDeliveryTaskLineage | null;
  sourceEpicIndex: number | null;
  sourceEpicTitle: string | null;
  retentionState: 'active' | 'soft_deleted' | 'retained';
  retentionClass: 'none' | 'dependency' | 'lineage' | 'terminal';
  retentionReason: string | null;
  deletionRequestedAt: string | null;
  deletionRequestedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LegacyDeliveryImportResource = {
  importId: string;
  projectId: string;
  sourceGenerationId: string;
  sourceDigest: string;
  selectionDigest: string;
  itemCount: number;
  items: LegacyDeliveryTaskProjection[];
};
export type LegacyDeliveryResourceByAction = {
  import: LegacyDeliveryImportResource;
  'task.create': LegacyDeliveryTaskProjection;
  'task.update': LegacyDeliveryTaskProjection;
  'task.delete': LegacyDeliveryTaskProjection;
};
export type LegacyDeliveryCommandSuccess<A extends LegacyDeliveryAction = LegacyDeliveryAction> = {
  ok: true;
  schemaVersion: typeof LEGACY_DELIVERY_COMMAND_SCHEMA_VERSION;
  action: A;
  resource: LegacyDeliveryResourceByAction[A];
};

export const LEGACY_DELIVERY_ERROR_CODES = [
  'INVALID_COMMAND', 'AUTHENTICATION_REQUIRED', 'RESOURCE_UNAVAILABLE', 'AUTHORIZATION_STALE',
  'IDEMPOTENCY_CONFLICT', 'VERSION_CONFLICT', 'FEATURE_DISABLED', 'READ_ONLY',
  'COMMAND_IN_PROGRESS', 'PERSISTENCE_UNAVAILABLE',
] as const;
export type LegacyDeliveryErrorCode = typeof LEGACY_DELIVERY_ERROR_CODES[number];
export type LegacyDeliveryErrorResponse = { ok: false; error: { code: LegacyDeliveryErrorCode; message: string } };

export type LegacyDeliveryQueryRequest = {
  schemaVersion: typeof LEGACY_DELIVERY_QUERY_SCHEMA_VERSION;
  organizationId: string;
  workspaceId: string;
  expectedAuthorizationVersion: number;
  projectId: string;
  limit: number;
  cursor: string | null;
  sourceGenerationId: string | null;
  includeRetained: boolean;
};
export type LegacyDeliveryQueryResult = {
  ok: true;
  schemaVersion: typeof LEGACY_DELIVERY_QUERY_SCHEMA_VERSION;
  projectId: string;
  items: LegacyDeliveryTaskProjection[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
  source: LegacyDeliverySourceProjection | null;
};

export class LegacyDeliveryContractError extends Error {
  constructor() { super('LEGACY_DELIVERY_CONTRACT_INVALID'); this.name = 'LegacyDeliveryContractError'; }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const invalid = (): never => { throw new LegacyDeliveryContractError(); };
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
};
const exact = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) invalid();
};
const id = (value: unknown): string => {
  if (typeof value !== 'string' || !uuidPattern.test(value)) invalid();
  return (value as string).toLowerCase();
};
const nullableId = (value: unknown): string | null => value === null ? null : id(value);
const positiveInteger = (value: unknown, maximum = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) invalid();
  return value as number;
};
const nonNegativeInteger = (value: unknown, maximum = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) invalid();
  return value as number;
};
const text = (value: unknown, maximum: number, allowEmpty = false): string => {
  if (typeof value !== 'string' || value.length > maximum || (!allowEmpty && !value.trim())) invalid();
  return value as string;
};
const nullableText = (value: unknown, maximum: number): string | null => value === null ? null : text(value, maximum, true);
const oneOf = <T extends string>(value: unknown, allowed: readonly T[]) => {
  if (typeof value !== 'string' || !allowed.includes(value as T)) invalid();
  return value as T;
};
const ids = (value: unknown, maximum: number) => {
  if (!Array.isArray(value) || value.length > maximum) invalid();
  const decoded = (value as unknown[]).map(id);
  if (new Set(decoded).size !== decoded.length) invalid();
  return decoded;
};
const iso = (value: unknown): string => {
  if (typeof value !== 'string' || !dateTimePattern.test(value) || Number.isNaN(Date.parse(value))) invalid();
  return value as string;
};
const nullableIso = (value: unknown): string | null => value === null ? null : iso(value);

const decodeImportPayload = (value: unknown): LegacyDeliveryImportPayload => {
  const row = record(value);
  exact(row, ['projectId', 'sourceGenerationId', 'expectedSourceDigest', 'sourceItemIndices']);
  if (typeof row.expectedSourceDigest !== 'string' || !digestPattern.test(row.expectedSourceDigest)) invalid();
  if (!Array.isArray(row.sourceItemIndices) || row.sourceItemIndices.length < 1 || row.sourceItemIndices.length > 100) invalid();
  const sourceItemIndices = (row.sourceItemIndices as unknown[]).map(value => {
    if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 999) invalid();
    return value as number;
  });
  if (sourceItemIndices.some((value, index) => index > 0 && value <= sourceItemIndices[index - 1])) invalid();
  return { projectId: id(row.projectId), sourceGenerationId: id(row.sourceGenerationId), expectedSourceDigest: row.expectedSourceDigest as string, sourceItemIndices };
};
const decodeTaskCreate = (value: unknown): LegacyDeliveryTaskCreatePayload => {
  const row = record(value);
  exact(row, ['projectId', 'task']);
  const task = record(row.task);
  exact(task, ['title', 'description', 'priority', 'type', 'assigneeIds', 'dependencyIds']);
  return { projectId: id(row.projectId), task: {
    title: text(task.title, 300) as string, description: text(task.description, 20_000, true) as string,
    priority: oneOf(task.priority, LEGACY_DELIVERY_TASK_PRIORITIES), type: oneOf(task.type, LEGACY_DELIVERY_TASK_TYPES),
    assigneeIds: ids(task.assigneeIds, 50), dependencyIds: ids(task.dependencyIds, 100),
  } };
};
const taskPatchKeys = ['title', 'description', 'priority', 'status', 'assigneeIds', 'dependencyIds'] as const;
const decodeTaskPatch = (value: unknown): LegacyDeliveryTaskPatch => {
  const row = record(value);
  const keys = Object.keys(row);
  if (!keys.length || keys.some(key => !taskPatchKeys.includes(key as typeof taskPatchKeys[number]))) invalid();
  const result: LegacyDeliveryTaskPatch = {};
  for (const key of keys.sort() as (typeof taskPatchKeys[number])[]) {
    if (key === 'title') result.title = text(row[key], 300) as string;
    else if (key === 'description') result.description = text(row[key], 20_000, true) as string;
    else if (key === 'priority') result.priority = oneOf(row[key], LEGACY_DELIVERY_TASK_PRIORITIES);
    else if (key === 'status') result.status = oneOf(row[key], LEGACY_DELIVERY_TASK_STATUSES);
    else if (key === 'assigneeIds') result.assigneeIds = ids(row[key], 50);
    else result.dependencyIds = ids(row[key], 100);
  }
  return result;
};
const decodePayload = <A extends LegacyDeliveryAction>(action: A, value: unknown): LegacyDeliveryPayloadByAction[A] => {
  if (action === 'import') return decodeImportPayload(value) as LegacyDeliveryPayloadByAction[A];
  if (action === 'task.create') return decodeTaskCreate(value) as LegacyDeliveryPayloadByAction[A];
  const row = record(value);
  if (action === 'task.update') {
    exact(row, ['taskId', 'expectedVersion', 'patch']);
    return { taskId: id(row.taskId), expectedVersion: positiveInteger(row.expectedVersion), patch: decodeTaskPatch(row.patch) } as LegacyDeliveryPayloadByAction[A];
  }
  exact(row, ['taskId', 'expectedVersion', 'deletionReason']);
  return { taskId: id(row.taskId), expectedVersion: positiveInteger(row.expectedVersion), deletionReason: text(row.deletionReason, 1_000) } as LegacyDeliveryPayloadByAction[A];
};

export const decodeLegacyDeliveryCommand = (value: unknown): LegacyDeliveryCommandEnvelope => {
  const row = record(value);
  exact(row, ['schemaVersion', 'action', 'organizationId', 'workspaceId', 'expectedAuthorizationVersion', 'requestId', 'idempotencyKey', 'payload']);
  if (row.schemaVersion !== LEGACY_DELIVERY_COMMAND_SCHEMA_VERSION) invalid();
  const action = oneOf(row.action, LEGACY_DELIVERY_ACTIONS);
  if (typeof row.idempotencyKey !== 'string' || !idempotencyPattern.test(row.idempotencyKey)) invalid();
  return { schemaVersion: LEGACY_DELIVERY_COMMAND_SCHEMA_VERSION, action, organizationId: id(row.organizationId), workspaceId: id(row.workspaceId),
    expectedAuthorizationVersion: positiveInteger(row.expectedAuthorizationVersion), requestId: id(row.requestId), idempotencyKey: row.idempotencyKey as string,
    payload: decodePayload(action, row.payload) };
};

export const decodeLegacyDeliveryQuery = (value: unknown): LegacyDeliveryQueryRequest => {
  const row = record(value);
  exact(row, ['schemaVersion', 'organizationId', 'workspaceId', 'expectedAuthorizationVersion', 'projectId', 'limit', 'cursor', 'sourceGenerationId', 'includeRetained']);
  if (row.schemaVersion !== LEGACY_DELIVERY_QUERY_SCHEMA_VERSION || typeof row.includeRetained !== 'boolean') invalid();
  return { schemaVersion: LEGACY_DELIVERY_QUERY_SCHEMA_VERSION, organizationId: id(row.organizationId), workspaceId: id(row.workspaceId),
    expectedAuthorizationVersion: positiveInteger(row.expectedAuthorizationVersion), projectId: id(row.projectId), limit: positiveInteger(row.limit, 100),
    cursor: row.cursor === null ? null : id(row.cursor), sourceGenerationId: row.sourceGenerationId === null ? null : id(row.sourceGenerationId),
    includeRetained: row.includeRetained as boolean };
};

const decodeLineage = (value: unknown): LegacyDeliveryTaskLineage | null => {
  if (value === null) return null;
  const row = record(value);
  exact(row, ['schemaVersion', 'importId', 'documentGenerationId', 'documentSourceDigest', 'sourceItemIndex',
    'sourceProcessId', 'sourceAssessmentId', 'sourceEpicIndex', 'sourceEpicTitle']);
  if (row.schemaVersion !== 'legacy-delivery-lineage.v1' || typeof row.documentSourceDigest !== 'string'
    || !digestPattern.test(row.documentSourceDigest)) invalid();
  return { schemaVersion: 'legacy-delivery-lineage.v1', importId: id(row.importId), documentGenerationId: id(row.documentGenerationId),
    documentSourceDigest: row.documentSourceDigest as string, sourceItemIndex: nonNegativeInteger(row.sourceItemIndex, 999),
    sourceProcessId: id(row.sourceProcessId), sourceAssessmentId: id(row.sourceAssessmentId),
    sourceEpicIndex: row.sourceEpicIndex === null ? null : nonNegativeInteger(row.sourceEpicIndex, 999),
    sourceEpicTitle: nullableText(row.sourceEpicTitle, 300) as string | null };
};
export const decodeLegacyDeliveryTaskProjection = (value: unknown): LegacyDeliveryTaskProjection => {
  const row = record(value);
  exact(row, ['id', 'version', 'mutable', 'projectId', 'title', 'description', 'status', 'priority', 'type', 'assigneeIds', 'dependencyIds',
    'ownerId', 'reporterId', 'sourceLineage', 'sourceEpicIndex', 'sourceEpicTitle', 'retentionState', 'retentionClass', 'retentionReason',
    'deletionRequestedAt', 'deletionRequestedBy', 'createdAt', 'updatedAt']);
  if (typeof row.mutable !== 'boolean' || (row.mutable && row.version === null) || (!row.mutable && row.version !== null)) invalid();
  const sourceEpicIndex = row.sourceEpicIndex === null ? null : nonNegativeInteger(row.sourceEpicIndex, 999);
  return { id: id(row.id), version: row.version === null ? null : positiveInteger(row.version), mutable: row.mutable as boolean,
    projectId: id(row.projectId), title: text(row.title, 300) as string,
    description: text(row.description, 20_000, true) as string, status: oneOf(row.status, LEGACY_DELIVERY_TASK_STATUSES), priority: oneOf(row.priority, LEGACY_DELIVERY_TASK_PRIORITIES),
    type: oneOf(row.type, LEGACY_DELIVERY_TASK_TYPES), assigneeIds: ids(row.assigneeIds, 50), dependencyIds: ids(row.dependencyIds, 100), ownerId: row.mutable ? id(row.ownerId) : nullableId(row.ownerId),
    reporterId: nullableId(row.reporterId), sourceLineage: decodeLineage(row.sourceLineage), sourceEpicIndex, sourceEpicTitle: nullableText(row.sourceEpicTitle, 300) as string | null,
    retentionState: oneOf(row.retentionState, ['active', 'soft_deleted', 'retained'] as const),
    retentionClass: oneOf(row.retentionClass, ['none', 'dependency', 'lineage', 'terminal'] as const),
    retentionReason: nullableText(row.retentionReason, 2_000) as string | null, deletionRequestedAt: nullableIso(row.deletionRequestedAt), deletionRequestedBy: nullableId(row.deletionRequestedBy),
    createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
};
const decodeSourceItem = (value: unknown): LegacyDeliverySourceItem => {
  const row = record(value);
  exact(row, ['sourceIndex', 'type', 'title', 'description', 'acceptanceCriteria']);
  if (!Number.isSafeInteger(row.sourceIndex) || (row.sourceIndex as number) < 0 || (row.sourceIndex as number) > 999 || !Array.isArray(row.acceptanceCriteria) || row.acceptanceCriteria.length > 100) invalid();
  return { sourceIndex: row.sourceIndex as number, type: oneOf(row.type, ['Epic', 'Story', 'Task'] as const), title: text(row.title, 300) as string,
    description: text(row.description, 20_000, true) as string, acceptanceCriteria: (row.acceptanceCriteria as unknown[]).map(value => text(value, 2_000) as string) };
};
const decodeSource = (value: unknown): LegacyDeliverySourceProjection | null => {
  if (value === null) return null;
  const row = record(value);
  exact(row, ['id', 'digest', 'items']);
  if (typeof row.digest !== 'string' || !digestPattern.test(row.digest) || !Array.isArray(row.items) || row.items.length > 1_000) invalid();
  const items = (row.items as unknown[]).map(decodeSourceItem);
  if (items.some((item, index) => index > 0 && item.sourceIndex <= items[index - 1].sourceIndex)) invalid();
  return { id: id(row.id), digest: row.digest as string, items };
};

export const decodeLegacyDeliveryCommandSuccess = (value: unknown, command: LegacyDeliveryCommandEnvelope): LegacyDeliveryCommandSuccess => {
  const row = record(value);
  exact(row, ['ok', 'schemaVersion', 'action', 'resource']);
  if (row.ok !== true || row.schemaVersion !== LEGACY_DELIVERY_COMMAND_SCHEMA_VERSION || row.action !== command.action) invalid();
  if (command.action !== 'import') {
    const resource = decodeLegacyDeliveryTaskProjection(row.resource);
    if (!resource.mutable || resource.version === null) invalid();
    if (command.action === 'task.create' && resource.projectId !== (command.payload as LegacyDeliveryTaskCreatePayload).projectId) invalid();
    if ((command.action === 'task.update' || command.action === 'task.delete')
      && resource.id !== (command.payload as LegacyDeliveryTaskUpdatePayload | LegacyDeliveryTaskDeletePayload).taskId) invalid();
    return { ok: true, schemaVersion: LEGACY_DELIVERY_COMMAND_SCHEMA_VERSION, action: command.action, resource } as LegacyDeliveryCommandSuccess;
  }
  const resource = record(row.resource);
  exact(resource, ['importId', 'projectId', 'sourceGenerationId', 'sourceDigest', 'selectionDigest', 'itemCount', 'items']);
  if (typeof resource.sourceDigest !== 'string' || !digestPattern.test(resource.sourceDigest) || typeof resource.selectionDigest !== 'string' || !digestPattern.test(resource.selectionDigest)
    || !Array.isArray(resource.items) || resource.items.length > 100) invalid();
  const items = (resource.items as unknown[]).map(decodeLegacyDeliveryTaskProjection);
  if (positiveInteger(resource.itemCount, 100) !== items.length || items.some(item => !item.mutable || item.version === null)) invalid();
  const projectId = id(resource.projectId);
  const sourceGenerationId = id(resource.sourceGenerationId);
  const importId = id(resource.importId);
  const importPayload = command.payload as LegacyDeliveryImportPayload;
  if (projectId !== importPayload.projectId || sourceGenerationId !== importPayload.sourceGenerationId
    || resource.sourceDigest !== importPayload.expectedSourceDigest || items.some(item => item.projectId !== projectId)) invalid();
  const lineage = items.map(item => item.sourceLineage);
  if (lineage.some(value => !value || value.importId !== importId || value.documentGenerationId !== sourceGenerationId
      || value.documentSourceDigest !== importPayload.expectedSourceDigest || !importPayload.sourceItemIndices.includes(value.sourceItemIndex))
    || new Set(lineage.map(value => value?.sourceItemIndex)).size !== lineage.length) invalid();
  return { ok: true, schemaVersion: LEGACY_DELIVERY_COMMAND_SCHEMA_VERSION, action: 'import', resource: { importId, projectId,
    sourceGenerationId, sourceDigest: resource.sourceDigest as string, selectionDigest: resource.selectionDigest as string,
    itemCount: items.length, items } };
};

export const decodeLegacyDeliveryQueryResult = (value: unknown, query: LegacyDeliveryQueryRequest): LegacyDeliveryQueryResult => {
  const row = record(value);
  exact(row, ['ok', 'schemaVersion', 'projectId', 'items', 'page', 'source']);
  if (row.ok !== true || row.schemaVersion !== LEGACY_DELIVERY_QUERY_SCHEMA_VERSION || id(row.projectId) !== query.projectId || !Array.isArray(row.items) || row.items.length > query.limit) invalid();
  const page = record(row.page);
  exact(page, ['limit', 'nextCursor', 'hasMore']);
  if (positiveInteger(page.limit, 100) !== query.limit || typeof page.hasMore !== 'boolean') invalid();
  const nextCursor = page.nextCursor === null ? null : id(page.nextCursor);
  if (page.hasMore !== (nextCursor !== null)) invalid();
  const source = decodeSource(row.source);
  if ((query.sourceGenerationId === null) !== (source === null) || (source && source.id !== query.sourceGenerationId)) invalid();
  return { ok: true, schemaVersion: LEGACY_DELIVERY_QUERY_SCHEMA_VERSION, projectId: query.projectId,
    items: (row.items as unknown[]).map(decodeLegacyDeliveryTaskProjection), page: { limit: query.limit, nextCursor, hasMore: page.hasMore as boolean }, source };
};

export const legacyDeliveryCommandPendingKey = (command: LegacyDeliveryCommandEnvelope) => {
  const target = command.action === 'import'
    ? `${(command.payload as LegacyDeliveryImportPayload).projectId}:${(command.payload as LegacyDeliveryImportPayload).sourceGenerationId}`
    : command.action === 'task.create'
      ? (command.payload as LegacyDeliveryTaskCreatePayload).projectId
      : (command.payload as LegacyDeliveryTaskUpdatePayload | LegacyDeliveryTaskDeletePayload).taskId;
  return `${command.organizationId}:${command.workspaceId}:${command.action}:${target}`;
};
