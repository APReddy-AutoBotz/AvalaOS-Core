import { executeProcessCreationRequest, type ProcessCreationDependencies } from './processCreationCommand.ts';
import { executeProcessUpdateRequest, type ProcessUpdateDependencies } from './processUpdateCommand.ts';
import { readBoundedCreationJson } from './creationAccessRequestBody.ts';
import { jsonResponse } from './http.ts';

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export const handleProcessCommandRequest = async (request: Request, dependencies: { creation: ProcessCreationDependencies; update: ProcessUpdateDependencies }) => {
  if (request.method !== 'POST') return jsonResponse({ ok: false, error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  let body: unknown;
  try { body = await readBoundedCreationJson(request, { maxBytes: 32768 }); }
  catch { return jsonResponse({ ok: false, error: { code: 'INVALID_COMMAND', message: 'Process command could not be completed.' } }, 400); }
  return object(body) && body.commandType === 'process.update'
    ? executeProcessUpdateRequest(request, body, dependencies.update)
    : executeProcessCreationRequest(request, body, dependencies.creation);
};
