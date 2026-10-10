import type { LegacyDeliveryCommandEnvelope, LegacyDeliveryQueryRequest } from '../../../services/legacyDelivery/contracts.ts';
import { getAuthUser, supabaseEnv } from './supabase.ts';
import { resolveTenantAuthority } from './tenantAuthority.ts';
import { createTenantAuthorityDatabase } from './tenantAuthorityDb.ts';

// Source previews are derived from persisted document artifacts whose canonical
// repository limit is 12,000,000 bytes. Keep a small JSON envelope allowance
// while still rejecting unbounded service-role responses.
const MAX_RPC_RESPONSE_BYTES = 12_500_000;
const RPC_TIMEOUT_MS = 8_000;

export class LegacyDeliveryPersistenceError extends Error {
  constructor() { super('LEGACY_DELIVERY_PERSISTENCE_UNAVAILABLE'); this.name = 'LegacyDeliveryPersistenceError'; }
}

const readBoundedJson = async (response: Response): Promise<unknown> => {
  const declared = response.headers.get('Content-Length');
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_RPC_RESPONSE_BYTES)) throw new LegacyDeliveryPersistenceError();
  if (!response.body) throw new LegacyDeliveryPersistenceError();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RPC_RESPONSE_BYTES) throw new LegacyDeliveryPersistenceError();
      chunks.push(value);
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new LegacyDeliveryPersistenceError(); }
};

export type LegacyDeliveryRpcTransport = {
  url: string;
  serviceRoleKey: string;
  fetcher: typeof fetch;
};

export const callLegacyDeliveryRpc = async (
  transport: LegacyDeliveryRpcTransport,
  rpcName: 'legacy_delivery_apply_command' | 'legacy_delivery_query',
  args: Record<string, unknown>,
): Promise<unknown> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await transport.fetcher(`${transport.url}/rest/v1/rpc/${rpcName}`, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          apikey: transport.serviceRoleKey,
          Authorization: `Bearer ${transport.serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
      });
    } catch { throw new LegacyDeliveryPersistenceError(); }
    if (!response.ok) throw new LegacyDeliveryPersistenceError();
    return await readBoundedJson(response);
  } finally {
    clearTimeout(timeoutId);
  }
};

const transport = (): LegacyDeliveryRpcTransport => ({ ...supabaseEnv(), fetcher: fetch });

export const legacyDeliveryDatabaseDependencies = (request: Request) => ({
  authenticate: () => getAuthUser(request),
  authority: (actorId: string, organizationId: string, workspaceId: string, expectedAuthorizationVersion: number) =>
    resolveTenantAuthority(actorId, { organizationId, workspaceId, expectedAuthorizationVersion }, createTenantAuthorityDatabase(request)),
  apply: (actorId: string, command: LegacyDeliveryCommandEnvelope) => callLegacyDeliveryRpc(transport(), 'legacy_delivery_apply_command', {
    p_actor_id: actorId,
    p_org_id: command.organizationId,
    p_workspace_id: command.workspaceId,
    p_expected_authorization_version: command.expectedAuthorizationVersion,
    p_request_id: command.requestId,
    p_idempotency_key: command.idempotencyKey,
    p_action: command.action,
    p_payload: command.payload,
  }),
  query: (actorId: string, query: LegacyDeliveryQueryRequest) => callLegacyDeliveryRpc(transport(), 'legacy_delivery_query', {
    p_actor_id: actorId,
    p_org_id: query.organizationId,
    p_workspace_id: query.workspaceId,
    p_expected_authorization_version: query.expectedAuthorizationVersion,
    p_project_id: query.projectId,
    p_limit: query.limit,
    p_cursor: query.cursor,
    p_source_generation_id: query.sourceGenerationId,
    p_include_retained: query.includeRetained,
  }),
});
