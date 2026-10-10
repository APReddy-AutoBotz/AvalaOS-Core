import { PROCESS_UPDATE_CAPABILITY, ProcessUpdateError, parseProcessUpdateEnvelope, parseProcessUpdateResource, type ProcessUpdateEnvelope } from '../../../services/processUpdateContract.ts';
import { jsonResponse } from './http.ts';

type Authority = { userId: string; organizationId: string; workspaceId: string; authorizationVersion: number; capabilities: readonly string[] };
export type ProcessUpdateDependencies = {
  authenticate(request: Request): Promise<{ id: string }>;
  authority(request: Request, actorId: string, envelope: ProcessUpdateEnvelope): Promise<Authority | null>;
  atomic(actorId: string, envelope: ProcessUpdateEnvelope): Promise<unknown>;
};

const statuses: Record<ProcessUpdateError['code'], number> = {
  INVALID_COMMAND: 400, AUTHENTICATION_REQUIRED: 401, PERMISSION_DENIED: 403,
  AUTHORITY_STALE: 409, FEATURE_DISABLED: 503, READ_ONLY: 503, VERSION_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409, COMMAND_UNAVAILABLE: 503,
};
const failed = (code: ProcessUpdateError['code']) => jsonResponse({ ok: false, error: { code, message: 'Process update could not be completed.' } }, statuses[code]);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const executeProcessUpdateRequest = async (request: Request, body: unknown, dependencies: ProcessUpdateDependencies) => {
  let envelope: ProcessUpdateEnvelope;
  try { envelope = parseProcessUpdateEnvelope(body); }
  catch { return failed('INVALID_COMMAND'); }
  let actor: { id: string };
  try { actor = await dependencies.authenticate(request); }
  catch { return failed('AUTHENTICATION_REQUIRED'); }
  try {
    const authority = await dependencies.authority(request, actor.id, envelope);
    if (!authority || authority.userId !== actor.id || authority.organizationId !== envelope.organizationId || authority.workspaceId !== envelope.workspaceId) return failed('PERMISSION_DENIED');
    if (authority.authorizationVersion !== envelope.authorizationVersion) return failed('AUTHORITY_STALE');
    if (!authority.capabilities.includes(PROCESS_UPDATE_CAPABILITY) || !authority.capabilities.includes('assess.read')) return failed('PERMISSION_DENIED');
    const outcome = await dependencies.atomic(actor.id, envelope);
    if (!object(outcome)) return failed('COMMAND_UNAVAILABLE');
    if (outcome.ok === false && object(outcome.error) && typeof outcome.error.code === 'string' && Object.hasOwn(statuses, outcome.error.code)) return failed(outcome.error.code as ProcessUpdateError['code']);
    if (outcome.ok !== true || !['committed', 'replayed'].includes(outcome.outcome as string) || !object(outcome.resource)) return failed('COMMAND_UNAVAILABLE');
    try { parseProcessUpdateResource(outcome.resource, envelope, actor.id); } catch { return failed('COMMAND_UNAVAILABLE'); }
    return jsonResponse(outcome);
  } catch { return failed('COMMAND_UNAVAILABLE'); }
};
