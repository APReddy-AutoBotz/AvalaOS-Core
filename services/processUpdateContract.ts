import type { AssessProcess, TenantContextProjection } from '../types.ts';

export const PROCESS_UPDATE_CAPABILITY = 'assess.process.update' as const;
export const PROCESS_UPDATE_COMMAND = 'process.update' as const;
export const PROCESS_UPDATE_CRITICALITY = ['Low', 'Medium', 'High', 'Critical'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const bounded = (value: unknown, max: number, required = false): value is string => typeof value === 'string' && value.length <= max && (!required || Boolean(value.trim()));
const uuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

export type ProcessUpdateInput = Pick<AssessProcess, 'name' | 'description' | 'department' | 'criticality'>;
export type ProcessUpdateEnvelope = {
  requestId: string;
  idempotencyKey: string;
  commandType: typeof PROCESS_UPDATE_COMMAND;
  organizationId: string;
  workspaceId: string;
  authorizationVersion: number;
  expectedVersion: number;
  payload: ProcessUpdateInput & { processId: string };
};

export type ProcessUpdateErrorCode = 'INVALID_COMMAND' | 'AUTHENTICATION_REQUIRED' | 'PERMISSION_DENIED' | 'AUTHORITY_STALE' | 'FEATURE_DISABLED' | 'READ_ONLY' | 'VERSION_CONFLICT' | 'IDEMPOTENCY_CONFLICT' | 'COMMAND_UNAVAILABLE';
export class ProcessUpdateError extends Error {
  constructor(public readonly code: ProcessUpdateErrorCode) { super(code); }
}

export const validProcessUpdateInput = (value: unknown): value is ProcessUpdateInput => object(value)
  && exact(value, ['name', 'description', 'department', 'criticality'])
  && bounded(value.name, 200, true)
  && bounded(value.description, 4000)
  && bounded(value.department, 200)
  && PROCESS_UPDATE_CRITICALITY.includes(value.criticality as typeof PROCESS_UPDATE_CRITICALITY[number]);

export const parseProcessUpdateEnvelope = (value: unknown): ProcessUpdateEnvelope => {
  if (!object(value) || !exact(value, ['requestId', 'idempotencyKey', 'commandType', 'organizationId', 'workspaceId', 'authorizationVersion', 'expectedVersion', 'payload'])
    || !uuid(value.requestId) || !bounded(value.idempotencyKey, 128, true) || !KEY.test(value.idempotencyKey)
    || value.commandType !== PROCESS_UPDATE_COMMAND || !uuid(value.organizationId) || !uuid(value.workspaceId)
    || !Number.isSafeInteger(value.authorizationVersion) || Number(value.authorizationVersion) < 0
    || !Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 1
    || !object(value.payload) || !exact(value.payload, ['processId', 'name', 'description', 'department', 'criticality'])
    || !uuid(value.payload.processId) || !validProcessUpdateInput({ name: value.payload.name, description: value.payload.description,
      department: value.payload.department, criticality: value.payload.criticality })) throw new ProcessUpdateError('INVALID_COMMAND');
  return value as unknown as ProcessUpdateEnvelope;
};

export const buildProcessUpdateEnvelope = (
  context: TenantContextProjection,
  processId: string,
  expectedVersion: number,
  input: ProcessUpdateInput,
  anchor?: { requestId: string; idempotencyKey: string },
): ProcessUpdateEnvelope => parseProcessUpdateEnvelope({
  requestId: anchor?.requestId ?? crypto.randomUUID(),
  idempotencyKey: anchor?.idempotencyKey ?? `process.update.${crypto.randomUUID()}`,
  commandType: PROCESS_UPDATE_COMMAND,
  organizationId: context.organizationId,
  workspaceId: context.workspaceId,
  authorizationVersion: context.authorizationVersion,
  expectedVersion,
  payload: { processId, ...input },
});

export const parseProcessUpdateResource = (
  value: unknown,
  envelope: ProcessUpdateEnvelope,
  actorId: string,
): AssessProcess & { version: number; receiptId: string; requestId: string; idempotencyKey: string } => {
  if (!object(value) || !exact(value, ['id', 'orgId', 'workspaceId', 'ownerId', 'name', 'description', 'department', 'criticality', 'status', 'templateId', 'version', 'receiptId', 'requestId', 'idempotencyKey', 'createdAt', 'updatedAt'])
    || value.id !== envelope.payload.processId || value.orgId !== envelope.organizationId || value.workspaceId !== envelope.workspaceId
    || value.ownerId !== actorId || value.name !== envelope.payload.name.trim() || value.description !== envelope.payload.description
    || value.department !== envelope.payload.department || value.criticality !== envelope.payload.criticality
    || !bounded(value.status, 64, true) || !(value.templateId === null || bounded(value.templateId, 200, true))
    || value.version !== envelope.expectedVersion + 1 || !uuid(value.receiptId) || value.requestId !== envelope.requestId
    || value.idempotencyKey !== envelope.idempotencyKey || !bounded(value.createdAt, 80, true) || !bounded(value.updatedAt, 80, true)
    || Number.isNaN(Date.parse(value.createdAt)) || Number.isNaN(Date.parse(value.updatedAt))) throw new ProcessUpdateError('COMMAND_UNAVAILABLE');
  return { ...value, templateId: value.templateId ?? undefined } as AssessProcess & { version: number; receiptId: string; requestId: string; idempotencyKey: string };
};
