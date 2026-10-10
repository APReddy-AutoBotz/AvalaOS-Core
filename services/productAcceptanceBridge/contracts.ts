export const STUDIO_DELIVERY_COMMAND_SCHEMA_VERSION = 'studio-delivery-command.v1' as const;
export const STUDIO_DELIVERY_OUTCOME_QUERY_SCHEMA_VERSION = 'studio-delivery-outcome-query.v1' as const;
export const STUDIO_DELIVERY_PACK_QUERY_SCHEMA_VERSION = 'studio-delivery-pack-query.v1' as const;
export const STUDIO_DELIVERY_ASSIGNEE_QUERY_SCHEMA_VERSION = 'studio-delivery-assignee-query.v1' as const;

export const STUDIO_DELIVERY_ACTIONS = ['studio.approved-artifact.publish', 'delivery.outcome.record', 'delivery.pack.snapshot'] as const;
export type StudioDeliveryAction = typeof STUDIO_DELIVERY_ACTIONS[number];

export const STUDIO_DELIVERY_OUTCOME_STATUSES = ['achieved', 'partial', 'not_achieved'] as const;
export type StudioDeliveryOutcomeStatus = typeof STUDIO_DELIVERY_OUTCOME_STATUSES[number];

export type StudioDeliveryApprovedWorkItem = {
  type: 'Epic' | 'Story' | 'Task';
  title: string;
  description: string;
  acceptanceCriteria: string[];
};

export type StudioApprovedArtifactPublishPayload = {
  artifactId: string;
  expectedArtifactVersionId: string;
  expectedAggregateVersion: number;
  projectId: string;
  workItems: StudioDeliveryApprovedWorkItem[];
};

export type DeliveryOutcomeRecordPayload = {
  taskId: string;
  expectedTaskVersion: number;
  expectedOutcomeVersion: number | null;
  status: StudioDeliveryOutcomeStatus;
  label: string;
  detail: string;
};

export type DeliveryPackSnapshotPayload = { projectId: string };

export type StudioDeliveryPayloadByAction = {
  'studio.approved-artifact.publish': StudioApprovedArtifactPublishPayload;
  'delivery.outcome.record': DeliveryOutcomeRecordPayload;
  'delivery.pack.snapshot': DeliveryPackSnapshotPayload;
};

export type StudioDeliveryCommandEnvelope<A extends StudioDeliveryAction = StudioDeliveryAction> = {
  schemaVersion: typeof STUDIO_DELIVERY_COMMAND_SCHEMA_VERSION;
  action: A;
  organizationId: string;
  workspaceId: string;
  expectedAuthorizationVersion: number;
  requestId: string;
  idempotencyKey: string;
  payload: StudioDeliveryPayloadByAction[A];
};

export type StudioDeliveryPublication = {
  publicationId: string;
  documentGenerationId: string;
  projectId: string;
  artifactId: string;
  artifactVersionId: string;
  artifactVersion: number;
  artifactContentHash: string;
  sourceProcessId: string;
  sourceAssessmentId: string;
  governResolutionId: string;
  workItemCount: number;
  workItemDigest: string;
  publishedAt: string;
};

export type DeliveryOutcome = {
  outcomeId: string;
  version: number;
  taskId: string;
  taskVersion: number;
  projectId: string;
  status: StudioDeliveryOutcomeStatus;
  label: string;
  detail: string;
  documentGenerationId: string;
  studioArtifactId: string;
  studioArtifactVersionId: string;
  recordedBy: string;
  recordedAt: string;
};

export type DeliveryPackSnapshot = {
  snapshotId: string;
  version: number;
  projectId: string;
  taskCount: number;
  boundTaskCount: number;
  taskSetHash: string;
  createdAt: string;
};

export type StudioDeliveryResourceByAction = {
  'studio.approved-artifact.publish': StudioDeliveryPublication;
  'delivery.outcome.record': DeliveryOutcome;
  'delivery.pack.snapshot': DeliveryPackSnapshot;
};

export type StudioDeliveryCommandSuccess<A extends StudioDeliveryAction = StudioDeliveryAction> = {
  ok: true;
  schemaVersion: typeof STUDIO_DELIVERY_COMMAND_SCHEMA_VERSION;
  action: A;
  outcome: 'committed' | 'replayed';
  receiptId: string;
  resource: StudioDeliveryResourceByAction[A];
};

export const STUDIO_DELIVERY_ERROR_CODES = [
  'INVALID_COMMAND', 'AUTHENTICATION_REQUIRED', 'RESOURCE_UNAVAILABLE', 'AUTHORIZATION_STALE',
  'IDEMPOTENCY_CONFLICT', 'VERSION_CONFLICT', 'FEATURE_DISABLED', 'READ_ONLY',
  'COMMAND_IN_PROGRESS', 'PERSISTENCE_UNAVAILABLE',
] as const;
export type StudioDeliveryErrorCode = typeof STUDIO_DELIVERY_ERROR_CODES[number];
export type StudioDeliveryErrorResponse = { ok: false; error: { code: StudioDeliveryErrorCode; message: string } };

export type StudioDeliveryOutcomeQueryRequest = {
  schemaVersion: typeof STUDIO_DELIVERY_OUTCOME_QUERY_SCHEMA_VERSION;
  organizationId: string;
  workspaceId: string;
  expectedAuthorizationVersion: number;
  projectId: string;
  limit: number;
  cursor: string | null;
};

export type StudioDeliveryOutcomeQueryResult = {
  ok: true;
  schemaVersion: typeof STUDIO_DELIVERY_OUTCOME_QUERY_SCHEMA_VERSION;
  projectId: string;
  items: DeliveryOutcome[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
};

export type StudioDeliveryPackQueryRequest = {
  schemaVersion: typeof STUDIO_DELIVERY_PACK_QUERY_SCHEMA_VERSION;
  organizationId: string;
  workspaceId: string;
  expectedAuthorizationVersion: number;
  projectId: string;
};

export type StudioDeliveryPackQueryResult = {
  ok: true;
  schemaVersion: typeof STUDIO_DELIVERY_PACK_QUERY_SCHEMA_VERSION;
  projectId: string;
  latestSnapshot: DeliveryPackSnapshot | null;
};

export type StudioDeliveryAssignee = { id: string; displayName: string };

export type StudioDeliveryAssigneeQueryRequest = {
  schemaVersion: typeof STUDIO_DELIVERY_ASSIGNEE_QUERY_SCHEMA_VERSION;
  organizationId: string;
  workspaceId: string;
  expectedAuthorizationVersion: number;
  projectId: string;
};

export type StudioDeliveryAssigneeQueryResult = {
  ok: true;
  schemaVersion: typeof STUDIO_DELIVERY_ASSIGNEE_QUERY_SCHEMA_VERSION;
  projectId: string;
  items: StudioDeliveryAssignee[];
};

export class StudioDeliveryContractError extends Error {
  constructor() { super('STUDIO_DELIVERY_CONTRACT_INVALID'); this.name = 'StudioDeliveryContractError'; }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const hashPattern = /^[0-9a-f]{64}$/u;
const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u;
const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u;
const invalid = (): never => { throw new StudioDeliveryContractError(); };
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
const positive = (value: unknown, maximum = Number.MAX_SAFE_INTEGER): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) invalid();
  return Number(value);
};
const text = (value: unknown, maximum: number, allowEmpty = false): string => {
  if (typeof value !== 'string' || value.length > maximum || (!allowEmpty && !value.trim())) invalid();
  return value as string;
};
const oneOf = <T extends string>(value: unknown, values: readonly T[]) => {
  if (typeof value !== 'string' || !values.includes(value as T)) invalid();
  return value as T;
};
const iso = (value: unknown): string => {
  if (typeof value !== 'string' || !dateTimePattern.test(value) || Number.isNaN(Date.parse(value))) invalid();
  return value as string;
};

const decodeWorkItem = (value: unknown): StudioDeliveryApprovedWorkItem => {
  const row = record(value);
  exact(row, ['type', 'title', 'description', 'acceptanceCriteria']);
  if (!Array.isArray(row.acceptanceCriteria) || row.acceptanceCriteria.length > 100) invalid();
  return {
    type: oneOf(row.type, ['Epic', 'Story', 'Task'] as const),
    title: text(row.title, 300),
    description: text(row.description, 20_000, true),
    acceptanceCriteria: (row.acceptanceCriteria as unknown[]).map(item => text(item, 2_000)),
  };
};

const decodePayload = <A extends StudioDeliveryAction>(action: A, value: unknown): StudioDeliveryPayloadByAction[A] => {
  const row = record(value);
  if (action === 'studio.approved-artifact.publish') {
    exact(row, ['artifactId', 'expectedArtifactVersionId', 'expectedAggregateVersion', 'projectId', 'workItems']);
    if (!Array.isArray(row.workItems) || row.workItems.length < 1 || row.workItems.length > 100) invalid();
    return {
      artifactId: id(row.artifactId), expectedArtifactVersionId: id(row.expectedArtifactVersionId),
      expectedAggregateVersion: positive(row.expectedAggregateVersion), projectId: id(row.projectId),
      workItems: (row.workItems as unknown[]).map(decodeWorkItem),
    } as StudioDeliveryPayloadByAction[A];
  }
  if (action === 'delivery.pack.snapshot') {
    exact(row, ['projectId']);
    return { projectId: id(row.projectId) } as StudioDeliveryPayloadByAction[A];
  }
  exact(row, ['taskId', 'expectedTaskVersion', 'expectedOutcomeVersion', 'status', 'label', 'detail']);
  return {
    taskId: id(row.taskId), expectedTaskVersion: positive(row.expectedTaskVersion),
    expectedOutcomeVersion: row.expectedOutcomeVersion === null ? null : positive(row.expectedOutcomeVersion),
    status: oneOf(row.status, STUDIO_DELIVERY_OUTCOME_STATUSES), label: text(row.label, 200),
    detail: text(row.detail, 4_000),
  } as StudioDeliveryPayloadByAction[A];
};

export const decodeStudioDeliveryCommand = (value: unknown): StudioDeliveryCommandEnvelope => {
  const row = record(value);
  exact(row, ['schemaVersion', 'action', 'organizationId', 'workspaceId', 'expectedAuthorizationVersion', 'requestId', 'idempotencyKey', 'payload']);
  if (row.schemaVersion !== STUDIO_DELIVERY_COMMAND_SCHEMA_VERSION || typeof row.idempotencyKey !== 'string'
    || !idempotencyPattern.test(row.idempotencyKey)) invalid();
  const action = oneOf(row.action, STUDIO_DELIVERY_ACTIONS);
  return {
    schemaVersion: STUDIO_DELIVERY_COMMAND_SCHEMA_VERSION, action, organizationId: id(row.organizationId),
    workspaceId: id(row.workspaceId), expectedAuthorizationVersion: positive(row.expectedAuthorizationVersion),
    requestId: id(row.requestId), idempotencyKey: row.idempotencyKey as string,
    payload: decodePayload(action, row.payload),
  };
};

export const decodeStudioDeliveryOutcomeQuery = (value: unknown): StudioDeliveryOutcomeQueryRequest => {
  const row = record(value);
  exact(row, ['schemaVersion', 'organizationId', 'workspaceId', 'expectedAuthorizationVersion', 'projectId', 'limit', 'cursor']);
  if (row.schemaVersion !== STUDIO_DELIVERY_OUTCOME_QUERY_SCHEMA_VERSION) invalid();
  return {
    schemaVersion: STUDIO_DELIVERY_OUTCOME_QUERY_SCHEMA_VERSION, organizationId: id(row.organizationId),
    workspaceId: id(row.workspaceId), expectedAuthorizationVersion: positive(row.expectedAuthorizationVersion),
    projectId: id(row.projectId), limit: positive(row.limit, 100), cursor: row.cursor === null ? null : id(row.cursor),
  };
};

export const decodeStudioDeliveryPackQuery = (value: unknown): StudioDeliveryPackQueryRequest => {
  const row = record(value);
  exact(row, ['schemaVersion', 'organizationId', 'workspaceId', 'expectedAuthorizationVersion', 'projectId']);
  if (row.schemaVersion !== STUDIO_DELIVERY_PACK_QUERY_SCHEMA_VERSION) invalid();
  return {
    schemaVersion: STUDIO_DELIVERY_PACK_QUERY_SCHEMA_VERSION, organizationId: id(row.organizationId),
    workspaceId: id(row.workspaceId), expectedAuthorizationVersion: positive(row.expectedAuthorizationVersion), projectId: id(row.projectId),
  };
};

export const decodeStudioDeliveryAssigneeQuery = (value: unknown): StudioDeliveryAssigneeQueryRequest => {
  const row = record(value);
  exact(row, ['schemaVersion', 'organizationId', 'workspaceId', 'expectedAuthorizationVersion', 'projectId']);
  if (row.schemaVersion !== STUDIO_DELIVERY_ASSIGNEE_QUERY_SCHEMA_VERSION) invalid();
  return {
    schemaVersion: STUDIO_DELIVERY_ASSIGNEE_QUERY_SCHEMA_VERSION, organizationId: id(row.organizationId),
    workspaceId: id(row.workspaceId), expectedAuthorizationVersion: positive(row.expectedAuthorizationVersion), projectId: id(row.projectId),
  };
};

const decodePublication = (value: unknown): StudioDeliveryPublication => {
  const row = record(value);
  exact(row, ['publicationId', 'documentGenerationId', 'projectId', 'artifactId', 'artifactVersionId', 'artifactVersion',
    'artifactContentHash', 'sourceProcessId', 'sourceAssessmentId', 'governResolutionId', 'workItemCount', 'workItemDigest', 'publishedAt']);
  if (typeof row.artifactContentHash !== 'string' || !hashPattern.test(row.artifactContentHash)
    || typeof row.workItemDigest !== 'string' || !digestPattern.test(row.workItemDigest)) invalid();
  return {
    publicationId: id(row.publicationId), documentGenerationId: id(row.documentGenerationId), projectId: id(row.projectId),
    artifactId: id(row.artifactId), artifactVersionId: id(row.artifactVersionId), artifactVersion: positive(row.artifactVersion),
    artifactContentHash: row.artifactContentHash as string, sourceProcessId: id(row.sourceProcessId),
    sourceAssessmentId: id(row.sourceAssessmentId), governResolutionId: id(row.governResolutionId),
    workItemCount: positive(row.workItemCount, 100), workItemDigest: row.workItemDigest as string, publishedAt: iso(row.publishedAt),
  };
};

export const decodeDeliveryOutcome = (value: unknown): DeliveryOutcome => {
  const row = record(value);
  exact(row, ['outcomeId', 'version', 'taskId', 'taskVersion', 'projectId', 'status', 'label', 'detail',
    'documentGenerationId', 'studioArtifactId', 'studioArtifactVersionId', 'recordedBy', 'recordedAt']);
  return {
    outcomeId: id(row.outcomeId), version: positive(row.version), taskId: id(row.taskId), taskVersion: positive(row.taskVersion),
    projectId: id(row.projectId), status: oneOf(row.status, STUDIO_DELIVERY_OUTCOME_STATUSES),
    label: text(row.label, 200), detail: text(row.detail, 4_000), documentGenerationId: id(row.documentGenerationId),
    studioArtifactId: id(row.studioArtifactId), studioArtifactVersionId: id(row.studioArtifactVersionId),
    recordedBy: id(row.recordedBy), recordedAt: iso(row.recordedAt),
  };
};

export const decodeDeliveryPackSnapshot = (value: unknown): DeliveryPackSnapshot => {
  const row = record(value);
  exact(row, ['snapshotId', 'version', 'projectId', 'taskCount', 'boundTaskCount', 'taskSetHash', 'createdAt']);
  if (!Number.isSafeInteger(row.taskCount) || Number(row.taskCount) < 1 || Number(row.taskCount) > 100_000
    || !Number.isSafeInteger(row.boundTaskCount) || Number(row.boundTaskCount) < 0 || Number(row.boundTaskCount) > Number(row.taskCount)
    || typeof row.taskSetHash !== 'string' || !digestPattern.test(row.taskSetHash)) invalid();
  return {
    snapshotId: id(row.snapshotId), version: positive(row.version), projectId: id(row.projectId),
    taskCount: Number(row.taskCount), boundTaskCount: Number(row.boundTaskCount), taskSetHash: row.taskSetHash as string,
    createdAt: iso(row.createdAt),
  };
};

export const decodeStudioDeliveryCommandSuccess = <A extends StudioDeliveryAction>(
  value: unknown,
  command: StudioDeliveryCommandEnvelope<A>,
): StudioDeliveryCommandSuccess<A> => {
  const row = record(value);
  exact(row, ['ok', 'schemaVersion', 'action', 'outcome', 'receiptId', 'resource']);
  if (row.ok !== true || row.schemaVersion !== STUDIO_DELIVERY_COMMAND_SCHEMA_VERSION || row.action !== command.action) invalid();
  const resource = command.action === 'studio.approved-artifact.publish' ? decodePublication(row.resource)
    : command.action === 'delivery.outcome.record' ? decodeDeliveryOutcome(row.resource) : decodeDeliveryPackSnapshot(row.resource);
  if (command.action === 'studio.approved-artifact.publish') {
    const payload = command.payload as StudioApprovedArtifactPublishPayload;
    const publication = resource as StudioDeliveryPublication;
    if (publication.artifactId !== payload.artifactId || publication.artifactVersionId !== payload.expectedArtifactVersionId
      || publication.projectId !== payload.projectId || publication.workItemCount !== payload.workItems.length) invalid();
  } else if (command.action === 'delivery.outcome.record') {
    const outcome = resource as DeliveryOutcome;
    const payload = command.payload as DeliveryOutcomeRecordPayload;
    if (outcome.taskId !== payload.taskId || outcome.taskVersion !== payload.expectedTaskVersion
      || outcome.version !== (payload.expectedOutcomeVersion ?? 0) + 1 || outcome.status !== payload.status
      || outcome.label !== payload.label.trim() || outcome.detail !== payload.detail.trim()) invalid();
  } else {
    const snapshot = resource as DeliveryPackSnapshot;
    const payload = command.payload as DeliveryPackSnapshotPayload;
    if (snapshot.projectId !== payload.projectId) invalid();
  }
  return {
    ok: true, schemaVersion: STUDIO_DELIVERY_COMMAND_SCHEMA_VERSION, action: command.action,
    outcome: oneOf(row.outcome, ['committed', 'replayed'] as const), receiptId: id(row.receiptId), resource,
  } as StudioDeliveryCommandSuccess<A>;
};

export const decodeStudioDeliveryOutcomeQueryResult = (
  value: unknown,
  request: StudioDeliveryOutcomeQueryRequest,
): StudioDeliveryOutcomeQueryResult => {
  const row = record(value);
  exact(row, ['ok', 'schemaVersion', 'projectId', 'items', 'page']);
  if (row.ok !== true || row.schemaVersion !== STUDIO_DELIVERY_OUTCOME_QUERY_SCHEMA_VERSION || id(row.projectId) !== request.projectId
    || !Array.isArray(row.items) || row.items.length > request.limit) invalid();
  const items = (row.items as unknown[]).map(decodeDeliveryOutcome);
  if (items.some(item => item.projectId !== request.projectId)) invalid();
  const page = record(row.page);
  exact(page, ['limit', 'nextCursor', 'hasMore']);
  if (positive(page.limit, 100) !== request.limit || typeof page.hasMore !== 'boolean') invalid();
  const nextCursor = page.nextCursor === null ? null : id(page.nextCursor);
  if ((nextCursor !== null) !== page.hasMore) invalid();
  return { ok: true, schemaVersion: STUDIO_DELIVERY_OUTCOME_QUERY_SCHEMA_VERSION, projectId: request.projectId,
    items, page: { limit: request.limit, nextCursor, hasMore: page.hasMore as boolean } };
};

export const decodeStudioDeliveryPackQueryResult = (
  value: unknown,
  request: StudioDeliveryPackQueryRequest,
): StudioDeliveryPackQueryResult => {
  const row = record(value);
  exact(row, ['ok', 'schemaVersion', 'projectId', 'latestSnapshot']);
  if (row.ok !== true || row.schemaVersion !== STUDIO_DELIVERY_PACK_QUERY_SCHEMA_VERSION || id(row.projectId) !== request.projectId) invalid();
  const latestSnapshot = row.latestSnapshot === null ? null : decodeDeliveryPackSnapshot(row.latestSnapshot);
  if (latestSnapshot && latestSnapshot.projectId !== request.projectId) invalid();
  return { ok: true, schemaVersion: STUDIO_DELIVERY_PACK_QUERY_SCHEMA_VERSION, projectId: request.projectId, latestSnapshot };
};

export const decodeStudioDeliveryAssigneeQueryResult = (
  value: unknown,
  request: StudioDeliveryAssigneeQueryRequest,
): StudioDeliveryAssigneeQueryResult => {
  const row = record(value);
  exact(row, ['ok', 'schemaVersion', 'projectId', 'items']);
  if (row.ok !== true || row.schemaVersion !== STUDIO_DELIVERY_ASSIGNEE_QUERY_SCHEMA_VERSION || id(row.projectId) !== request.projectId
    || !Array.isArray(row.items) || row.items.length > 500) invalid();
  const items = (row.items as unknown[]).map(value => {
    const item = record(value);
    exact(item, ['id', 'displayName']);
    return { id: id(item.id), displayName: text(item.displayName, 240) };
  });
  if (new Set(items.map(item => item.id)).size !== items.length) invalid();
  return { ok: true, schemaVersion: STUDIO_DELIVERY_ASSIGNEE_QUERY_SCHEMA_VERSION, projectId: request.projectId, items };
};
