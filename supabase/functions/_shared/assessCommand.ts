export const ASSESS_COMMAND_TYPES = [
  'assessment.create',
  'assessment.response.upsert',
  'assessment.finalize',
] as const;

export type AssessCommandType = typeof ASSESS_COMMAND_TYPES[number];

export type AssessCommandEnvelope = {
  requestId: string;
  idempotencyKey: string;
  commandType: AssessCommandType;
  organizationId: string;
  workspaceId: string;
  authorizationVersion: number;
  expectedVersion?: number;
  payload: Record<string, unknown>;
};

export type AssessActor = { id: string; accessToken?: string };

export type AssessAuthority = {
  actorId: string;
  organizationId: string;
  workspaceId: string;
  authorizationVersion: number;
  permissions: readonly string[];
  accessToken?: string;
};

export type AssessAtomicCommand = {
  requestId: string;
  idempotencyKey: string;
  commandType: AssessCommandType;
  actorId: string;
  organizationId: string;
  workspaceId: string;
  authorizationVersion: number;
  accessToken?: string;
  expectedVersion?: number;
  resourceId?: string;
  payload: Record<string, unknown>;
};

export type AssessAtomicResult = {
  outcome: 'committed' | 'replayed';
  resource: Record<string, unknown>;
};

export type AssessFinalizeInput = {
  assessmentId: string;
  processId: string;
  version: number;
  responses: Record<string, unknown>;
  metadata: Record<string, unknown>;
  evidenceItems: unknown[];
  assumptions: unknown[];
};

export interface AssessCommandDependencies {
  authenticate(request: Request): Promise<AssessActor>;
  loadFreshAuthority(input: {
    request: Request;
    actorId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<AssessAuthority | null>;
  loadAssessmentForFinalize(input: {
    assessmentId: string;
    organizationId: string;
    workspaceId: string;
    expectedVersion: number;
    accessToken?: string;
  }): Promise<AssessFinalizeInput | null>;
  executeAtomicCommand(command: AssessAtomicCommand): Promise<AssessAtomicResult>;
}

export type AssessErrorCode =
  | 'METHOD_NOT_ALLOWED'
  | 'AUTHENTICATION_REQUIRED'
  | 'INVALID_COMMAND'
  | 'COMMAND_NOT_SUPPORTED'
  | 'RESOURCE_NOT_AVAILABLE'
  | 'AUTHORITY_STALE'
  | 'PERMISSION_DENIED'
  | 'VERSION_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'COMMAND_UNAVAILABLE';

const ERROR_STATUS: Record<AssessErrorCode, number> = {
  METHOD_NOT_ALLOWED: 405,
  AUTHENTICATION_REQUIRED: 401,
  INVALID_COMMAND: 400,
  COMMAND_NOT_SUPPORTED: 400,
  RESOURCE_NOT_AVAILABLE: 404,
  AUTHORITY_STALE: 409,
  PERMISSION_DENIED: 403,
  VERSION_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  COMMAND_UNAVAILABLE: 503,
};

export class AssessCommandError extends Error {
  constructor(public readonly code: AssessErrorCode) {
    super(code);
    this.name = 'AssessCommandError';
  }

  get status() { return ERROR_STATUS[this.code]; }
}

export const assessError = (code: AssessErrorCode): never => {
  throw new AssessCommandError(code);
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const isObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

export const requireUuid = (value: unknown): string => {
  if (typeof value !== 'string' || !UUID.test(value)) assessError('INVALID_COMMAND');
  return value as string;
};

export const requireSafeKey = (value: unknown): string => {
  if (typeof value !== 'string' || !SAFE_KEY.test(value)) assessError('INVALID_COMMAND');
  return value as string;
};

export const requireExactKeys = (value: Record<string, unknown>, allowed: readonly string[]) => {
  if (Object.keys(value).some(key => !allowed.includes(key))) assessError('INVALID_COMMAND');
};

export const parseAssessEnvelope = (value: unknown): AssessCommandEnvelope => {
  if (!isObject(value)) throw new AssessCommandError('INVALID_COMMAND');
  const object = value as Record<string, unknown>;
  requireExactKeys(object, [
    'requestId', 'idempotencyKey', 'commandType', 'organizationId', 'workspaceId',
    'authorizationVersion', 'expectedVersion', 'payload',
  ]);
  if (!ASSESS_COMMAND_TYPES.includes(object.commandType as AssessCommandType)) {
    assessError(typeof object.commandType === 'string' ? 'COMMAND_NOT_SUPPORTED' : 'INVALID_COMMAND');
  }
  if (typeof object.authorizationVersion !== 'number' || !Number.isSafeInteger(object.authorizationVersion) || object.authorizationVersion < 0) assessError('INVALID_COMMAND');
  if (object.expectedVersion !== undefined && (typeof object.expectedVersion !== 'number' || !Number.isSafeInteger(object.expectedVersion) || object.expectedVersion < 0)) assessError('INVALID_COMMAND');
  if (!isObject(object.payload)) assessError('INVALID_COMMAND');
  return {
    requestId: requireUuid(object.requestId),
    idempotencyKey: requireSafeKey(object.idempotencyKey),
    commandType: object.commandType as AssessCommandType,
    organizationId: requireUuid(object.organizationId),
    workspaceId: requireUuid(object.workspaceId),
    authorizationVersion: object.authorizationVersion as number,
    expectedVersion: object.expectedVersion as number | undefined,
    payload: object.payload as Record<string, unknown>,
  };
};

export const asAssessCommandError = (error: unknown) => (
  error instanceof AssessCommandError ? error : new AssessCommandError('COMMAND_UNAVAILABLE')
);

export const assessErrorBody = (error: AssessCommandError) => ({
  ok: false,
  error: { code: error.code, message: 'The command could not be completed.' },
});

export const isRecord = isObject;
