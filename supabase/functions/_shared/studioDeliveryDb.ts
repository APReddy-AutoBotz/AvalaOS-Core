import type { StudioDeliveryAssigneeQueryRequest, StudioDeliveryCommandEnvelope, StudioDeliveryOutcomeQueryRequest, StudioDeliveryPackQueryRequest } from '../../../services/productAcceptanceBridge/contracts.ts';
import { getAuthUser, supabaseEnv } from './supabase.ts';
import { resolveTenantAuthority } from './tenantAuthority.ts';
import { createTenantAuthorityDatabase } from './tenantAuthorityDb.ts';

const MAX_RPC_RESPONSE_BYTES = 1_000_000;
const RPC_TIMEOUT_MS = 8_000;
export class StudioDeliveryPersistenceError extends Error {
  constructor() { super('STUDIO_DELIVERY_PERSISTENCE_UNAVAILABLE'); this.name = 'StudioDeliveryPersistenceError'; }
}
export type StudioDeliveryRpcTransport = { url: string; serviceRoleKey: string; fetcher: typeof fetch };

const readBoundedJson = async (response: Response): Promise<unknown> => {
  const declared = response.headers.get('Content-Length');
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_RPC_RESPONSE_BYTES) || !response.body) throw new StudioDeliveryPersistenceError();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RPC_RESPONSE_BYTES) throw new StudioDeliveryPersistenceError();
      chunks.push(value);
    }
  } finally { void reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new StudioDeliveryPersistenceError(); }
};

export const callStudioDeliveryRpc = async (
  transport: StudioDeliveryRpcTransport,
  rpcName: 'studio_delivery_apply_command' | 'studio_delivery_outcome_query' | 'studio_delivery_pack_snapshot_query' | 'studio_delivery_assignee_query',
  args: Record<string, unknown>,
): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await transport.fetcher(`${transport.url}/rest/v1/rpc/${rpcName}`, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { apikey: transport.serviceRoleKey, Authorization: `Bearer ${transport.serviceRoleKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
    } catch { throw new StudioDeliveryPersistenceError(); }
    if (!response.ok) throw new StudioDeliveryPersistenceError();
    return await readBoundedJson(response);
  } finally { clearTimeout(timeout); }
};

const transport = (): StudioDeliveryRpcTransport => ({ ...supabaseEnv(), fetcher: fetch });
export const studioDeliveryDatabaseDependencies = (request: Request) => ({
  authenticate: () => getAuthUser(request),
  authority: (actorId: string, organizationId: string, workspaceId: string, expectedAuthorizationVersion: number) =>
    resolveTenantAuthority(actorId, { organizationId, workspaceId, expectedAuthorizationVersion }, createTenantAuthorityDatabase(request)),
  apply: (actorId: string, command: StudioDeliveryCommandEnvelope) => callStudioDeliveryRpc(transport(), 'studio_delivery_apply_command', {
    p_actor_id: actorId, p_org_id: command.organizationId, p_workspace_id: command.workspaceId,
    p_expected_authorization_version: command.expectedAuthorizationVersion, p_request_id: command.requestId,
    p_idempotency_key: command.idempotencyKey, p_action: command.action, p_payload: command.payload,
  }),
  query: (actorId: string, query: StudioDeliveryOutcomeQueryRequest) => callStudioDeliveryRpc(transport(), 'studio_delivery_outcome_query', {
    p_actor_id: actorId, p_org_id: query.organizationId, p_workspace_id: query.workspaceId,
    p_expected_authorization_version: query.expectedAuthorizationVersion, p_project_id: query.projectId,
    p_limit: query.limit, p_cursor: query.cursor,
  }),
  packQuery: (actorId: string, query: StudioDeliveryPackQueryRequest) => callStudioDeliveryRpc(transport(), 'studio_delivery_pack_snapshot_query', {
    p_actor_id: actorId, p_org_id: query.organizationId, p_workspace_id: query.workspaceId,
    p_expected_authorization_version: query.expectedAuthorizationVersion, p_project_id: query.projectId,
  }),
  assigneeQuery: (actorId: string, query: StudioDeliveryAssigneeQueryRequest) => callStudioDeliveryRpc(transport(), 'studio_delivery_assignee_query', {
    p_actor_id: actorId, p_org_id: query.organizationId, p_workspace_id: query.workspaceId,
    p_expected_authorization_version: query.expectedAuthorizationVersion, p_project_id: query.projectId,
  }),
});
