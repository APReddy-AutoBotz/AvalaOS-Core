import { ProcessCreateError, type ProcessCreateEnvelope } from '../../../services/processCreationContract.ts';
import { getAuthUser, supabaseEnv } from './supabase.ts';
import { resolveTenantAuthority, TenantAuthorityError } from './tenantAuthority.ts';
import { createTenantAuthorityDatabase } from './tenantAuthorityDb.ts';
import type { ProcessCreationDependencies } from './processCreationCommand.ts';

const MAX_RESPONSE_BYTES = 32768;
const DEFAULT_TIMEOUT_MS = 8000;
type ProcessAtomicTransport = { url: string; serviceRoleKey: string; fetcher: typeof fetch; timeoutMs?: number };

const boundedAtomicJson = async (response: Response): Promise<unknown> => {
  if (response.status === 204) return undefined;
  const declared = response.headers.get('Content-Length');
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_RESPONSE_BYTES))
    throw new ProcessCreateError('COMMAND_UNAVAILABLE');
  if (!response.body) throw new ProcessCreateError('COMMAND_UNAVAILABLE');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) throw new ProcessCreateError('COMMAND_UNAVAILABLE');
      chunks.push(value);
    }
  } finally {
    try { await reader.cancel(); } catch { /* Deadline aborts the request as well. */ }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new ProcessCreateError('COMMAND_UNAVAILABLE'); }
};

/** Only this new process mutation RPC uses the bounded service-role transport. */
export const createProcessAtomicRpcAdapter = (transport: ProcessAtomicTransport) => async (
  actorId: string, envelope: ProcessCreateEnvelope,
): Promise<unknown> => {
  const controller = new AbortController();
  const timeoutMs = Number.isSafeInteger(transport.timeoutMs) && (transport.timeoutMs || 0) > 0
    && (transport.timeoutMs || 0) <= DEFAULT_TIMEOUT_MS ? transport.timeoutMs as number : DEFAULT_TIMEOUT_MS;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new ProcessCreateError('COMMAND_UNAVAILABLE'));
    }, timeoutMs);
  });
  const effect = async () => {
    let response: Response;
    try {
      response = await transport.fetcher(`${transport.url}/rest/v1/rpc/create_assess_process`, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { apikey: transport.serviceRoleKey, Authorization: `Bearer ${transport.serviceRoleKey}`,
          'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          p_actor_id: actorId,
          p_org_id: envelope.organizationId,
          p_workspace_id: envelope.workspaceId,
          p_authorization_version: envelope.authorizationVersion,
          p_request_id: envelope.requestId,
          p_idempotency_key: envelope.idempotencyKey,
          p_expected_version: envelope.expectedVersion,
          p_process_id: envelope.payload.processId,
          p_name: envelope.payload.name,
          p_description: envelope.payload.description,
          p_department: envelope.payload.department,
          p_criticality: envelope.payload.criticality,
          p_template_id: envelope.payload.templateId ?? null,
        }),
      });
    } catch { throw new ProcessCreateError('COMMAND_UNAVAILABLE'); }
    if (!response.ok) throw new ProcessCreateError('COMMAND_UNAVAILABLE');
    return boundedAtomicJson(response);
  };
  try { return await Promise.race([effect(), deadline]); }
  finally { if (timeoutId) clearTimeout(timeoutId); }
};

export const processCreationDependencies: ProcessCreationDependencies = {
  authenticate: getAuthUser,
  async authority(request, actorId, envelope) {
    try {
      const value = await resolveTenantAuthority(actorId, { organizationId: envelope.organizationId, workspaceId: envelope.workspaceId }, createTenantAuthorityDatabase(request));
      return value;
    } catch (error) {
      if (error instanceof TenantAuthorityError && error.code === 'TENANT_ACCESS_DENIED') return null;
      throw error;
    }
  },
  atomic: (actorId, envelope) => createProcessAtomicRpcAdapter({ ...supabaseEnv(), fetcher: fetch })(actorId, envelope),
};
