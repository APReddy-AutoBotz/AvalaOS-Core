import { getAuthUser, getBearerToken, supabaseEnv } from './supabase.ts';
import { resolveTenantAuthority, TenantAuthorityError } from './tenantAuthority.ts';
import { createTenantAuthorityDatabase } from './tenantAuthorityDb.ts';
import { AssessAtomicCommand, AssessAtomicResult, AssessCommandDependencies, AssessCommandError } from './assessCommand.ts';

const RPC_BY_COMMAND = {
  'assessment.create': 'pr1b_create_assessment',
  'assessment.response.upsert': 'pr1b_upsert_assessment_responses',
  'assessment.finalize': 'pr1b_finalize_assessment',
} as const;

type RpcResult = { ok?: unknown; outcome?: unknown; resource?: unknown; errorCode?: unknown };

const rpcBody = (command: AssessAtomicCommand): Record<string, unknown> => {
  const common = {
    p_actor_id: command.actorId,
    p_org_id: command.organizationId,
    p_workspace_id: command.workspaceId,
    p_assessment_id: command.resourceId,
    p_request_id: command.requestId,
    p_idempotency_key: command.idempotencyKey,
    p_authorization_version: command.authorizationVersion,
  };
  if (command.commandType === 'assessment.create') return { ...common, p_process_id: command.payload.processId };
  if (command.commandType === 'assessment.response.upsert') {
    return { ...common, p_responses: command.payload, p_expected_version: command.expectedVersion };
  }
  const scores = command.payload.scores as { scoreVersion?: unknown };
  return { ...common, p_scores: scores, p_score_version: scores.scoreVersion, p_expected_version: command.expectedVersion };
};

const controlledRpcResult = (value: unknown): AssessAtomicResult => {
  const result = (Array.isArray(value) ? value[0] : value) as RpcResult | null;
  if (!result || typeof result !== 'object') throw new AssessCommandError('COMMAND_UNAVAILABLE');
  if (result.errorCode === 'VERSION_CONFLICT') throw new AssessCommandError('VERSION_CONFLICT');
  if (result.errorCode === 'IDEMPOTENCY_CONFLICT') throw new AssessCommandError('IDEMPOTENCY_CONFLICT');
  if (result.errorCode === 'AUTHORIZATION_STALE') throw new AssessCommandError('AUTHORITY_STALE');
  if (result.errorCode === 'NOT_FOUND') throw new AssessCommandError('RESOURCE_NOT_AVAILABLE');
  if (result.errorCode === 'INVALID_COMMAND') throw new AssessCommandError('INVALID_COMMAND');
  if (result.errorCode === 'INVALID_SCORE_VERSION') throw new AssessCommandError('INVALID_COMMAND');
  if ((result.outcome !== 'committed' && result.outcome !== 'replayed') || !result.resource ||
      typeof result.resource !== 'object' || Array.isArray(result.resource)) throw new AssessCommandError('COMMAND_UNAVAILABLE');
  return { outcome: result.outcome, resource: result.resource as Record<string, unknown> };
};

export const assessCommandDependencies: AssessCommandDependencies = {
  async authenticate(request) {
    const user = await getAuthUser(request);
    return { ...user, accessToken: getBearerToken(request) };
  },
  async loadFreshAuthority(input) {
    try {
      const context = await resolveTenantAuthority(input.actorId, {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
      }, createTenantAuthorityDatabase(input.request));
      return {
        actorId: context.userId,
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        authorizationVersion: context.authorizationVersion,
        permissions: context.capabilities,
      };
    } catch (error) {
      if (error instanceof TenantAuthorityError && error.code === 'TENANT_ACCESS_DENIED') return null;
      throw error;
    }
  },
  async loadAssessmentForFinalize(input) {
    const { url, serviceRoleKey } = supabaseEnv();
    const query = new URLSearchParams({
      select: 'id,process_id,version,responses',
      id: `eq.${input.assessmentId}`,
      org_id: `eq.${input.organizationId}`,
      workspace_id: `eq.${input.workspaceId}`,
      deleted_at: 'is.null',
      limit: '1',
    });
    const response = await fetch(`${url}/rest/v1/assessments?${query}`, {
      method: 'GET', redirect: 'error',
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    if (!response.ok) throw new AssessCommandError('COMMAND_UNAVAILABLE');
    const rows = await response.json() as Array<Record<string, unknown>>;
    if (rows.length !== 1) return null;
    const row = rows[0];
    if (typeof row.version !== 'number' || !Number.isSafeInteger(row.version)) return null;
    if (row.version !== input.expectedVersion) throw new AssessCommandError('VERSION_CONFLICT');
    const stored = row.responses;
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;
    const aggregate = stored as Record<string, unknown>;
    if (!aggregate.responses || typeof aggregate.responses !== 'object' || Array.isArray(aggregate.responses) ||
        !aggregate.metadata || typeof aggregate.metadata !== 'object' || Array.isArray(aggregate.metadata) ||
        typeof row.process_id !== 'string') return null;
    return {
      assessmentId: input.assessmentId,
      processId: row.process_id,
      version: row.version as number,
      responses: aggregate.responses as Record<string, unknown>,
      metadata: aggregate.metadata as Record<string, unknown>,
      evidenceItems: Array.isArray(aggregate.evidenceItems) ? aggregate.evidenceItems : [],
      assumptions: Array.isArray(aggregate.assumptions) ? aggregate.assumptions : [],
    };
  },
  async executeAtomicCommand(command) {
    try {
      const { url, serviceRoleKey } = supabaseEnv();
      const response = await fetch(`${url}/rest/v1/rpc/${RPC_BY_COMMAND[command.commandType]}`, {
        method: 'POST', redirect: 'error',
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(rpcBody(command)),
      });
      if (!response.ok) throw new AssessCommandError('COMMAND_UNAVAILABLE');
      return controlledRpcResult(await response.json());
    } catch (error) {
      if (error instanceof AssessCommandError) throw error;
      throw new AssessCommandError('COMMAND_UNAVAILABLE');
    }
  },
};
