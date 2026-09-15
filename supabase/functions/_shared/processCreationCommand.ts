import { PROCESS_CREATE_CAPABILITY, ProcessCreateError, parseProcessCreateEnvelope, parseProcessCreateResource, type ProcessCreateEnvelope } from '../../../services/processCreationContract.ts';
import { jsonResponse } from './http.ts';
import { readBoundedCreationJson } from './creationAccessRequestBody.ts';

type Authority = { userId: string; organizationId: string; workspaceId: string; authorizationVersion: number; capabilities: readonly string[] };
export type ProcessCreationDependencies = {
  authenticate(request: Request): Promise<{ id: string }>;
  authority(request: Request, actorId: string, envelope: ProcessCreateEnvelope): Promise<Authority | null>;
  atomic(actorId: string, envelope: ProcessCreateEnvelope): Promise<unknown>;
};

const statuses: Record<ProcessCreateError['code'], number> = {
  INVALID_COMMAND: 400, AUTHENTICATION_REQUIRED: 401, PERMISSION_DENIED: 403,
  AUTHORITY_STALE: 409, FEATURE_DISABLED: 503, READ_ONLY: 503,
  IDEMPOTENCY_CONFLICT: 409, QUOTA_EXCEEDED: 409, COMMAND_UNAVAILABLE: 503,
};
const failed = (code: ProcessCreateError['code']) => jsonResponse({ ok: false, error: { code, message: 'Process creation could not be completed.' } }, statuses[code]);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const outcomes = new Set(['committed', 'replayed']);

export const handleProcessCreationRequest = async (request: Request, dependencies: ProcessCreationDependencies) => {
  if (request.method !== 'POST') return jsonResponse({ ok: false, error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  let envelope: ProcessCreateEnvelope;
  try { envelope = parseProcessCreateEnvelope(await readBoundedCreationJson(request, { maxBytes: 32768 })); }
  catch { return failed('INVALID_COMMAND'); }

  let actor: { id: string };
  try { actor = await dependencies.authenticate(request); }
  catch { return failed('AUTHENTICATION_REQUIRED'); }

  try {
    const authority = await dependencies.authority(request, actor.id, envelope);
    if (!authority || authority.userId !== actor.id || authority.organizationId !== envelope.organizationId || authority.workspaceId !== envelope.workspaceId) return failed('PERMISSION_DENIED');
    if (authority.authorizationVersion !== envelope.authorizationVersion) return failed('AUTHORITY_STALE');
    if (!authority.capabilities.includes(PROCESS_CREATE_CAPABILITY) || !authority.capabilities.includes('assess.read')) return failed('PERMISSION_DENIED');
    const outcome = await dependencies.atomic(actor.id, envelope);
    if (!object(outcome)) return failed('COMMAND_UNAVAILABLE');
    if (outcome.ok === false && object(outcome.error) && typeof outcome.error.code === 'string' && Object.prototype.hasOwnProperty.call(statuses, outcome.error.code)) {
      return failed(outcome.error.code as ProcessCreateError['code']);
    }
    if (outcome.ok !== true || !outcomes.has(outcome.outcome as string) || !object(outcome.resource)) return failed('COMMAND_UNAVAILABLE');
    try { parseProcessCreateResource(outcome.resource, envelope, actor.id); } catch { return failed('COMMAND_UNAVAILABLE'); }
    return jsonResponse(outcome);
  } catch { return failed('COMMAND_UNAVAILABLE'); }
};
