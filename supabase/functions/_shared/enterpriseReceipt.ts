import { sha256Hex } from './enterpriseIntelligenceIngestion.ts';
import { rpc, supabaseRpcErrorHasSignal } from './supabase.ts';

export type EnterpriseReceiptStatus = 'claimed' | 'committed' | 'failed' | 'blocked';

export type EnterpriseReceiptRow = {
  id: string;
  request_hash: string;
  initial_request_id: string;
  last_request_id: string;
  execution_token: string;
  execution_fence: number;
  lease_expires_at: string;
  status: EnterpriseReceiptStatus;
  resource_id?: string | null;
  response?: Record<string, unknown>;
  response_hash?: string | null;
  execution_plan?: Record<string, unknown>;
};

export type EnterpriseReceiptScope = {
  actorId: string;
  organizationId: string;
  workspaceId: string;
};

export type EnterpriseReceiptReconciliationAuthorizer = () => Promise<EnterpriseReceiptScope>;

export type EnterpriseReceiptClaim = {
  commandType: string;
  idempotencyKey: string;
  requestId: string;
  requestHash: string;
  resourceType?: string | null;
};

export class EnterpriseReceiptError extends Error {
  constructor(public readonly code:
    | 'IDEMPOTENCY_CONFLICT'
    | 'COMMAND_IN_PROGRESS'
    | 'COMMAND_UNAVAILABLE'
    | 'RECEIPT_FINALIZATION_FAILED') {
    super(code);
    this.name = 'EnterpriseReceiptError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(
  value && typeof value === 'object' && !Array.isArray(value),
);

export const canonicalizeReceiptValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalizeReceiptValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonicalizeReceiptValue(value[key])]),
  );
};

export const hashReceiptValue = (value: unknown) => sha256Hex(JSON.stringify(canonicalizeReceiptValue(value)));

const rowFrom = (value: EnterpriseReceiptRow | EnterpriseReceiptRow[]) => Array.isArray(value) ? value[0] : value;

export const mapEnterpriseReceiptRpcError = (error: unknown): EnterpriseReceiptError => {
  if (supabaseRpcErrorHasSignal(error,
    'ENTERPRISE_AI_IDEMPOTENCY_CONFLICT',
    'ENTERPRISE_AI_EXECUTION_PLAN_CONFLICT',
    'ENTERPRISE_AI_JOB_IDEMPOTENCY_CONFLICT',
  )) return new EnterpriseReceiptError('IDEMPOTENCY_CONFLICT');
  if (supabaseRpcErrorHasSignal(error,
    'ENTERPRISE_AI_COMMAND_IN_PROGRESS',
    'ENTERPRISE_AI_JOB_IN_PROGRESS',
    'ENTERPRISE_AI_STALE_EXECUTION_FENCE',
    'ENTERPRISE_AI_COMMAND_NOT_EXECUTABLE',
    'ENTERPRISE_AI_RECEIPT_NOT_CLAIMED',
  )) return new EnterpriseReceiptError('COMMAND_IN_PROGRESS');
  return new EnterpriseReceiptError('COMMAND_UNAVAILABLE');
};

export const claimEnterpriseReceipt = async (
  scope: EnterpriseReceiptScope,
  claim: EnterpriseReceiptClaim,
): Promise<{ receipt: EnterpriseReceiptRow; ownsExecution: boolean }> => {
  const executionToken = crypto.randomUUID();
  try {
    const value = await rpc<EnterpriseReceiptRow | EnterpriseReceiptRow[]>('enterprise_ai_claim_command', {
      p_actor: scope.actorId,
      p_org: scope.organizationId,
      p_workspace: scope.workspaceId,
      p_command_type: claim.commandType,
      p_key: claim.idempotencyKey,
      p_request: claim.requestId,
      p_hash: claim.requestHash,
      p_resource_type: claim.resourceType || null,
      p_execution_token: executionToken,
    });
    const receipt = rowFrom(value);
    if (!receipt?.id || receipt.request_hash !== claim.requestHash) {
      throw new EnterpriseReceiptError('IDEMPOTENCY_CONFLICT');
    }
    return { receipt, ownsExecution: receipt.status === 'claimed' && receipt.execution_token === executionToken };
  } catch (error) {
    if (error instanceof EnterpriseReceiptError) throw error;
    throw mapEnterpriseReceiptRpcError(error);
  }
};

export const persistEnterpriseExecutionPlan = async (
  receipt: EnterpriseReceiptRow,
  scope: EnterpriseReceiptScope,
  plan: Record<string, unknown>,
): Promise<EnterpriseReceiptRow> => {
  try {
    const value = await rpc<EnterpriseReceiptRow | EnterpriseReceiptRow[]>('enterprise_ai_plan_command', {
      p_id: receipt.id,
      p_org: scope.organizationId,
      p_workspace: scope.workspaceId,
      p_execution_token: receipt.execution_token,
      p_execution_fence: receipt.execution_fence,
      p_plan: canonicalizeReceiptValue(plan),
    });
    const planned = rowFrom(value);
    if (!planned?.id) throw new Error('missing planned receipt');
    return planned;
  } catch (error) {
    if (error instanceof EnterpriseReceiptError) throw error;
    throw mapEnterpriseReceiptRpcError(error);
  }
};

const reconcileEnterpriseReceipt = async (
  receipt: EnterpriseReceiptRow,
  scope: EnterpriseReceiptScope,
  response: Record<string, unknown>,
  resourceId?: string,
) => {
  const value = await rpc<EnterpriseReceiptRow | EnterpriseReceiptRow[]>('enterprise_ai_reconcile_command', {
    p_id: receipt.id,
    p_org: scope.organizationId,
    p_workspace: scope.workspaceId,
    p_expected_response: response,
    p_expected_resource_id: resourceId || null,
  });
  return rowFrom(value);
};

export const reloadEnterpriseReceipt = async (
  receipt: EnterpriseReceiptRow,
  scope: EnterpriseReceiptScope,
): Promise<EnterpriseReceiptRow> => {
  try {
    const value = await rpc<EnterpriseReceiptRow | EnterpriseReceiptRow[]>('enterprise_ai_reload_command', {
      p_id: receipt.id,
      p_org: scope.organizationId,
      p_workspace: scope.workspaceId,
    });
    const reloaded = rowFrom(value);
    if (!reloaded?.id) throw new Error('missing receipt');
    return reloaded;
  } catch (error) {
    if (error instanceof EnterpriseReceiptError) throw error;
    throw mapEnterpriseReceiptRpcError(error);
  }
};

export const completeEnterpriseReceipt = async (
  receipt: EnterpriseReceiptRow,
  scope: EnterpriseReceiptScope,
  response: Record<string, unknown>,
  resourceId: string | undefined,
  authorizeReconciliation: EnterpriseReceiptReconciliationAuthorizer,
): Promise<EnterpriseReceiptRow> => {
  const canonicalResponse = canonicalizeReceiptValue(response) as Record<string, unknown>;
  const responseHash = await hashReceiptValue(canonicalResponse);
  try {
    const value = await rpc<EnterpriseReceiptRow | EnterpriseReceiptRow[]>('enterprise_ai_complete_command', {
      p_id: receipt.id,
      p_org: scope.organizationId,
      p_workspace: scope.workspaceId,
      p_execution_token: receipt.execution_token,
      p_execution_fence: receipt.execution_fence,
      p_response: canonicalResponse,
      p_resource_id: resourceId || null,
    });
    return rowFrom(value);
  } catch {
    const reconciliationScope = await authorizeReconciliation();
    try {
      const reconciled = await reconcileEnterpriseReceipt(receipt, reconciliationScope, canonicalResponse, resourceId);
      if (reconciled?.status === 'committed'
        && await hashReceiptValue(reconciled.response || {}) === responseHash
        && (reconciled.resource_id || null) === (resourceId || null)) return reconciled;
    } catch {
      // The explicit error below is returned only after reload/reconciliation failed.
    }
    throw new EnterpriseReceiptError('RECEIPT_FINALIZATION_FAILED');
  }
};

export const failEnterpriseReceipt = async (
  receipt: EnterpriseReceiptRow,
  scope: EnterpriseReceiptScope,
  response: Record<string, unknown>,
  blocked: boolean,
  authorizeReconciliation: EnterpriseReceiptReconciliationAuthorizer,
): Promise<EnterpriseReceiptRow> => {
  const canonicalResponse = canonicalizeReceiptValue(response) as Record<string, unknown>;
  const responseHash = await hashReceiptValue(canonicalResponse);
  try {
    const value = await rpc<EnterpriseReceiptRow | EnterpriseReceiptRow[]>('enterprise_ai_fail_command', {
      p_id: receipt.id,
      p_org: scope.organizationId,
      p_workspace: scope.workspaceId,
      p_execution_token: receipt.execution_token,
      p_execution_fence: receipt.execution_fence,
      p_response: canonicalResponse,
      p_blocked: blocked,
    });
    return rowFrom(value);
  } catch {
    const reconciliationScope = await authorizeReconciliation();
    try {
      const reconciled = await reconcileEnterpriseReceipt(receipt, reconciliationScope, canonicalResponse);
      const expected = blocked ? 'blocked' : 'failed';
      if (reconciled?.status === expected && await hashReceiptValue(reconciled.response || {}) === responseHash) return reconciled;
    } catch {
      // The explicit error below is returned only after reload/reconciliation failed.
    }
    throw new EnterpriseReceiptError('RECEIPT_FINALIZATION_FAILED');
  }
};
