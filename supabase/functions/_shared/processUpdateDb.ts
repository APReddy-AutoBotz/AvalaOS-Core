import { ProcessUpdateError, type ProcessUpdateEnvelope } from '../../../services/processUpdateContract.ts';
import { getAuthUser, supabaseEnv } from './supabase.ts';
import { resolveTenantAuthority, TenantAuthorityError } from './tenantAuthority.ts';
import { createTenantAuthorityDatabase } from './tenantAuthorityDb.ts';
import type { ProcessUpdateDependencies } from './processUpdateCommand.ts';

const MAX_RESPONSE_BYTES = 32768;
const DEFAULT_TIMEOUT_MS = 8000;
type Transport = { url: string; serviceRoleKey: string; fetcher: typeof fetch; timeoutMs?: number };

const boundedJson = async (response: Response): Promise<unknown> => {
  const declared = response.headers.get('Content-Length');
  if (response.status === 204 || (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) || !response.body) throw new ProcessUpdateError('COMMAND_UNAVAILABLE');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) throw new ProcessUpdateError('COMMAND_UNAVAILABLE');
      chunks.push(value);
    }
  } finally { try { await reader.cancel(); } catch { /* best effort */ } }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new ProcessUpdateError('COMMAND_UNAVAILABLE'); }
};

export const updateProcessAtomicRpcAdapter = (transport: Transport) => async (actorId: string, envelope: ProcessUpdateEnvelope): Promise<unknown> => {
  const controller = new AbortController();
  const timeoutMs = Number.isSafeInteger(transport.timeoutMs) && (transport.timeoutMs || 0) > 0 && (transport.timeoutMs || 0) <= DEFAULT_TIMEOUT_MS ? transport.timeoutMs as number : DEFAULT_TIMEOUT_MS;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => { timeoutId = setTimeout(() => { controller.abort(); reject(new ProcessUpdateError('COMMAND_UNAVAILABLE')); }, timeoutMs); });
  const effect = async () => {
    let response: Response;
    try {
      response = await transport.fetcher(`${transport.url}/rest/v1/rpc/update_assess_process`, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { apikey: transport.serviceRoleKey, Authorization: `Bearer ${transport.serviceRoleKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          p_actor_id: actorId, p_org_id: envelope.organizationId, p_workspace_id: envelope.workspaceId,
          p_authorization_version: envelope.authorizationVersion, p_request_id: envelope.requestId,
          p_idempotency_key: envelope.idempotencyKey, p_expected_version: envelope.expectedVersion,
          p_process_id: envelope.payload.processId, p_name: envelope.payload.name,
          p_description: envelope.payload.description, p_department: envelope.payload.department,
          p_criticality: envelope.payload.criticality,
        }),
      });
    } catch { throw new ProcessUpdateError('COMMAND_UNAVAILABLE'); }
    if (!response.ok) throw new ProcessUpdateError('COMMAND_UNAVAILABLE');
    return boundedJson(response);
  };
  try { return await Promise.race([effect(), deadline]); }
  finally { if (timeoutId) clearTimeout(timeoutId); }
};

export const processUpdateDependencies: ProcessUpdateDependencies = {
  authenticate: getAuthUser,
  async authority(request, actorId, envelope) {
    try { return await resolveTenantAuthority(actorId, { organizationId: envelope.organizationId, workspaceId: envelope.workspaceId }, createTenantAuthorityDatabase(request)); }
    catch (error) { if (error instanceof TenantAuthorityError && error.code === 'TENANT_ACCESS_DENIED') return null; throw error; }
  },
  atomic: (actorId, envelope) => updateProcessAtomicRpcAdapter({ ...supabaseEnv(), fetcher: fetch })(actorId, envelope),
};
