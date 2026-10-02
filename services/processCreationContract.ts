import type { AssessProcess, TenantContextProjection } from '../types.ts';

export const PROCESS_CREATE_CAPABILITY = 'assess.process.create' as const;
export const PROCESS_CREATE_COMMAND = 'process.create' as const;
export const PROCESS_CREATE_TEMPLATE_IDS = ['tpl-p2p-invoice-ingestion', 'tpl-o2c-credit-check'] as const;
export const PROCESS_CREATE_CRITICALITY = ['Low', 'Medium', 'High', 'Critical'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[], required: readonly string[] = keys) => Object.keys(value).every(key => keys.includes(key)) && required.every(key => Object.prototype.hasOwnProperty.call(value, key));
const bounded = (value: unknown, max: number, required = false): value is string => typeof value === 'string' && value.length <= max && (!required || Boolean(value.trim()));
const uuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

export type ProcessCreateInput = Pick<AssessProcess, 'name' | 'description' | 'department' | 'criticality' | 'templateId'>;
export type ProcessCreateEnvelope = {
  requestId: string;
  idempotencyKey: string;
  commandType: typeof PROCESS_CREATE_COMMAND;
  organizationId: string;
  workspaceId: string;
  authorizationVersion: number;
  expectedVersion: 0;
  payload: ProcessCreateInput & { processId: string };
};

export type ProcessCreateErrorCode = 'INVALID_COMMAND' | 'AUTHENTICATION_REQUIRED' | 'PERMISSION_DENIED' | 'AUTHORITY_STALE' | 'FEATURE_DISABLED' | 'READ_ONLY' | 'IDEMPOTENCY_CONFLICT' | 'QUOTA_EXCEEDED' | 'COMMAND_UNAVAILABLE';
export class ProcessCreateError extends Error {
  constructor(public readonly code: ProcessCreateErrorCode) { super(code); }
}

export const validProcessCreateInput = (value: unknown): value is ProcessCreateInput => {
  if (!object(value) || !exact(value, ['name', 'description', 'department', 'criticality', 'templateId'], ['name', 'description', 'department', 'criticality'])) return false;
  if (!bounded(value.name, 200, true) || !bounded(value.description, 4000) || !bounded(value.department, 200)) return false;
  if (!PROCESS_CREATE_CRITICALITY.includes(value.criticality as typeof PROCESS_CREATE_CRITICALITY[number])) return false;
  return value.templateId === undefined || PROCESS_CREATE_TEMPLATE_IDS.includes(value.templateId as typeof PROCESS_CREATE_TEMPLATE_IDS[number]);
};

export const parseProcessCreateEnvelope = (value: unknown): ProcessCreateEnvelope => {
  if (!object(value) || !exact(value, ['requestId', 'idempotencyKey', 'commandType', 'organizationId', 'workspaceId', 'authorizationVersion', 'expectedVersion', 'payload']) ||
    !uuid(value.requestId) || !bounded(value.idempotencyKey, 128, true) || !KEY.test(value.idempotencyKey) ||
    value.commandType !== PROCESS_CREATE_COMMAND || !uuid(value.organizationId) || !uuid(value.workspaceId) ||
    !Number.isSafeInteger(value.authorizationVersion) || Number(value.authorizationVersion) < 1 || value.expectedVersion !== 0 ||
    !object(value.payload) || !exact(value.payload, ['processId', 'name', 'description', 'department', 'criticality', 'templateId'], ['processId', 'name', 'description', 'department', 'criticality']) ||
    !uuid(value.payload.processId) || !validProcessCreateInput({ name: value.payload.name, description: value.payload.description, department: value.payload.department, criticality: value.payload.criticality, templateId: value.payload.templateId })) {
    throw new ProcessCreateError('INVALID_COMMAND');
  }
  return value as ProcessCreateEnvelope;
};

export const buildProcessCreateEnvelope = (context: TenantContextProjection, input: ProcessCreateInput, anchor?: { requestId: string; idempotencyKey: string; processId: string }): ProcessCreateEnvelope => {
  if (!validProcessCreateInput(input)) throw new ProcessCreateError('INVALID_COMMAND');
  if (!context.capabilities.includes(PROCESS_CREATE_CAPABILITY) || !context.capabilities.includes('assess.read')) throw new ProcessCreateError('PERMISSION_DENIED');
  return parseProcessCreateEnvelope({
    requestId: anchor?.requestId ?? crypto.randomUUID(),
    idempotencyKey: anchor?.idempotencyKey ?? `process.create.${crypto.randomUUID()}`,
    commandType: PROCESS_CREATE_COMMAND,
    organizationId: context.organizationId,
    workspaceId: context.workspaceId,
    authorizationVersion: context.authorizationVersion,
    expectedVersion: 0,
    payload: { processId: anchor?.processId ?? crypto.randomUUID(), ...input },
  });
};

export const parseProcessCreateResource = (value: unknown, envelope: ProcessCreateEnvelope, actorId: string): AssessProcess => {
  if (!object(value) || !exact(value, ['id', 'orgId', 'workspaceId', 'ownerId', 'name', 'description', 'department', 'criticality', 'status', 'templateId', 'version', 'receiptId', 'requestId', 'idempotencyKey', 'createdAt', 'updatedAt']) ||
    !uuid(value.id) || value.id !== envelope.payload.processId || value.orgId !== envelope.organizationId || value.workspaceId !== envelope.workspaceId ||
    !uuid(value.ownerId) || value.ownerId !== actorId || !uuid(value.receiptId) || value.requestId !== envelope.requestId || value.idempotencyKey !== envelope.idempotencyKey ||
    value.name !== envelope.payload.name.trim() || value.description !== envelope.payload.description ||
    value.department !== envelope.payload.department || value.criticality !== envelope.payload.criticality || value.status !== 'Not Started' ||
    value.templateId !== (envelope.payload.templateId ?? null) || value.version !== 1 ||
    !bounded(value.createdAt, 64, true) || !bounded(value.updatedAt, 64, true) ||
    !Number.isFinite(Date.parse(value.createdAt)) || !Number.isFinite(Date.parse(value.updatedAt))) {
    throw new ProcessCreateError('COMMAND_UNAVAILABLE');
  }
  return { id: value.id, orgId: value.orgId as string, workspaceId: value.workspaceId as string, ownerId: value.ownerId as string,
    name: value.name as string, description: value.description as string, department: value.department as string,
    criticality: value.criticality as AssessProcess['criticality'], status: 'Not Started',
    templateId: value.templateId === null ? undefined : value.templateId as string,
    createdAt: value.createdAt as string, updatedAt: value.updatedAt as string };
};
