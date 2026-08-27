import type { EnterpriseAiCapability } from '../../../services/enterpriseIntelligence.ts';
import type { UnifiedEnterpriseAiProvider, EnterpriseProviderUsage } from './enterpriseIntelligenceAi.ts';
import { rpc } from './supabase.ts';

export type ProviderBudgetAuthority = {
  actorId: string;
  organizationId: string;
  workspaceId: string;
  authorizationVersion: number;
};

export type ProviderBudgetExecution = {
  receiptId: string;
  jobId: string;
  executionToken: string;
  executionFence: number;
  routeId: string;
  providerConfigId: string;
  provider: UnifiedEnterpriseAiProvider;
  capability: EnterpriseAiCapability;
  model: string;
};

export type ProviderBudgetReservationInput = {
  authority: ProviderBudgetAuthority;
  execution: ProviderBudgetExecution;
  estimatedInputTokens: number;
  maximumOutputTokens: number;
};

export type ProviderBudgetReservation = {
  reservationId: string;
  state: 'reserved' | 'settled' | 'uncertain' | 'released';
  ownsProviderEffect: boolean;
  replayed: boolean;
  reservedTokens: number;
  actualUsage?: EnterpriseProviderUsage;
};

export class ProviderBudgetError extends Error {
  constructor(public readonly code:
    | 'BUDGET_EXHAUSTED'
    | 'AUTHORIZATION_STALE'
    | 'PERMISSION_DENIED'
    | 'PROVIDER_ROUTE_STALE'
    | 'PROVIDER_EFFECT_IN_PROGRESS'
    | 'PROVIDER_EFFECT_UNCERTAIN'
    | 'PROVIDER_EFFECT_CANCELLED'
    | 'BUDGET_PERSISTENCE_UNAVAILABLE') {
    super(code);
    this.name = 'ProviderBudgetError';
  }
}

type Rpc = <T>(name: string, args: Record<string, unknown>) => Promise<T>;
type BudgetRpcRow = {
  reservationId?: unknown;
  state?: unknown;
  ownsProviderEffect?: unknown;
  replayed?: unknown;
  reservedTokens?: unknown;
  inputTokens?: unknown;
  outputTokens?: unknown;
  totalTokens?: unknown;
  errorCode?: unknown;
};

const safeInteger = (value: unknown, minimum = 0) => Number.isSafeInteger(value) && Number(value) >= minimum;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const mapError = (value: unknown): ProviderBudgetError => {
  const code = value instanceof ProviderBudgetError ? value.code
    : value && typeof value === 'object' && typeof (value as { errorCode?: unknown }).errorCode === 'string'
      ? (value as { errorCode: string }).errorCode : '';
  if (code === 'BUDGET_EXHAUSTED' || code === 'AUTHORIZATION_STALE' || code === 'PERMISSION_DENIED'
    || code === 'PROVIDER_ROUTE_STALE' || code === 'PROVIDER_EFFECT_IN_PROGRESS'
    || code === 'PROVIDER_EFFECT_UNCERTAIN' || code === 'PROVIDER_EFFECT_CANCELLED') return new ProviderBudgetError(code);
  return new ProviderBudgetError('BUDGET_PERSISTENCE_UNAVAILABLE');
};

const parseReservation = (value: BudgetRpcRow): ProviderBudgetReservation => {
  if (typeof value.errorCode === 'string') throw mapError(value);
  if (typeof value.reservationId !== 'string' || !uuid.test(value.reservationId)
    || !['reserved', 'settled', 'uncertain', 'released'].includes(String(value.state))
    || typeof value.ownsProviderEffect !== 'boolean' || typeof value.replayed !== 'boolean'
    || !safeInteger(value.reservedTokens)) throw new ProviderBudgetError('BUDGET_PERSISTENCE_UNAVAILABLE');
  const result: ProviderBudgetReservation = {
    reservationId: value.reservationId,
    state: value.state as ProviderBudgetReservation['state'],
    ownsProviderEffect: value.ownsProviderEffect,
    replayed: value.replayed,
    reservedTokens: Number(value.reservedTokens),
  };
  if (result.state === 'settled') {
    if (!safeInteger(value.inputTokens) || !safeInteger(value.outputTokens) || !safeInteger(value.totalTokens, 1)
      || Number(value.inputTokens) + Number(value.outputTokens) !== Number(value.totalTokens)) {
      throw new ProviderBudgetError('BUDGET_PERSISTENCE_UNAVAILABLE');
    }
    result.actualUsage = { inputTokens: Number(value.inputTokens), outputTokens: Number(value.outputTokens), totalTokens: Number(value.totalTokens) };
  }
  return result;
};

const argsFor = (input: ProviderBudgetReservationInput) => ({
  p_actor: input.authority.actorId,
  p_org: input.authority.organizationId,
  p_workspace: input.authority.workspaceId,
  p_authorization_version: input.authority.authorizationVersion,
  p_receipt: input.execution.receiptId,
  p_job: input.execution.jobId,
  p_execution_token: input.execution.executionToken,
  p_execution_fence: input.execution.executionFence,
  p_route: input.execution.routeId,
  p_provider_config: input.execution.providerConfigId,
  p_provider: input.execution.provider,
  p_capability: input.execution.capability,
  p_model: input.execution.model,
});

const invokeBudgetTransition = async (
  name: string,
  args: Record<string, unknown>,
  invoke: Rpc,
) => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return await invoke<BudgetRpcRow>(name, args); } catch (error) { lastError = error; }
  }
  throw lastError;
};

export const reserveProviderBudget = async (
  input: ProviderBudgetReservationInput,
  invoke: Rpc = rpc,
): Promise<ProviderBudgetReservation> => {
  if (!safeInteger(input.estimatedInputTokens, 1) || !safeInteger(input.maximumOutputTokens, 1)) {
    throw new ProviderBudgetError('BUDGET_PERSISTENCE_UNAVAILABLE');
  }
  try {
    return parseReservation(await invoke<BudgetRpcRow>('enterprise_ai_reserve_provider_budget', {
      ...argsFor(input),
      p_estimated_input_tokens: input.estimatedInputTokens,
      p_maximum_output_tokens: input.maximumOutputTokens,
    }));
  } catch (error) {
    throw mapError(error);
  }
};

export const settleProviderBudget = async (
  input: ProviderBudgetReservationInput & { reservationId: string; usage: EnterpriseProviderUsage },
  invoke: Rpc = rpc,
): Promise<ProviderBudgetReservation> => {
  try {
    return parseReservation(await invokeBudgetTransition('enterprise_ai_settle_provider_budget_v2', {
      ...argsFor(input), p_reservation: input.reservationId,
      p_input_tokens: input.usage.inputTokens, p_output_tokens: input.usage.outputTokens,
      p_total_tokens: input.usage.totalTokens,
    }, invoke));
  } catch (error) { throw mapError(error); }
};

export const markProviderBudgetUncertain = async (
  input: ProviderBudgetReservationInput & { reservationId: string; failureClass: string },
  invoke: Rpc = rpc,
): Promise<ProviderBudgetReservation> => {
  try {
    return parseReservation(await invokeBudgetTransition('enterprise_ai_mark_provider_budget_uncertain_v2', {
      ...argsFor(input), p_reservation: input.reservationId,
      p_failure_class: input.failureClass.slice(0, 80),
    }, invoke));
  } catch (error) { throw mapError(error); }
};

export const releaseProviderBudget = async (
  input: ProviderBudgetReservationInput & { reservationId: string; releaseReason: 'before_provider_effect' | 'reconciled_no_effect' },
  invoke: Rpc = rpc,
): Promise<ProviderBudgetReservation> => {
  try {
    return parseReservation(await invokeBudgetTransition('enterprise_ai_release_provider_budget_v2', {
      ...argsFor(input), p_reservation: input.reservationId, p_release_reason: input.releaseReason,
    }, invoke));
  } catch (error) { throw mapError(error); }
};

/**
 * Executes at most one provider effect for one receipt/job. Callers must do
 * endpoint/prompt/secret preparation before entering this function. A replay
 * never invokes `effect`; it must reconcile from the receipt/effect journal.
 */
export const runBudgetedProviderEffect = async <T extends { usage: EnterpriseProviderUsage }>(
  input: ProviderBudgetReservationInput,
  effect: () => Promise<T>,
  options: {
    /**
     * Strictly validate/ground and durably stage the sanitized provider result.
     * This must complete before usage settlement so a response-loss replay can
     * reconcile from durable state without invoking the provider again.
     */
    beforeSettle: (result: T, reservation: ProviderBudgetReservation) => Promise<void>;
    invoke?: Rpc;
    signal?: AbortSignal;
    classifyFailure?: (error: unknown) => { effectMayHaveOccurred: boolean; failureClass: string };
  },
): Promise<{ kind: 'executed'; result: T; reservation: ProviderBudgetReservation } | { kind: 'replay'; reservation: ProviderBudgetReservation }> => {
  const reservation = await reserveProviderBudget(input, options.invoke);
  if (!reservation.ownsProviderEffect) return { kind: 'replay', reservation };
  if (options.signal?.aborted) {
    await releaseProviderBudget({
      ...input, reservationId: reservation.reservationId, releaseReason: 'before_provider_effect',
    }, options.invoke);
    throw new ProviderBudgetError('PROVIDER_EFFECT_CANCELLED');
  }
  try {
    const result = await effect();
    try {
      await options.beforeSettle(result, reservation);
    } catch {
      await markProviderBudgetUncertain({
        ...input, reservationId: reservation.reservationId, failureClass: 'pre_settlement_persistence_failed',
      }, options.invoke).catch(() => undefined);
      throw new ProviderBudgetError('PROVIDER_EFFECT_UNCERTAIN');
    }
    try {
      const settled = await settleProviderBudget({ ...input, reservationId: reservation.reservationId, usage: result.usage }, options.invoke);
      return { kind: 'executed', result, reservation: settled };
    } catch {
      await markProviderBudgetUncertain({ ...input, reservationId: reservation.reservationId, failureClass: 'settlement_response_unknown' }, options.invoke).catch(() => undefined);
      throw new ProviderBudgetError('PROVIDER_EFFECT_UNCERTAIN');
    }
  } catch (error) {
    if (error instanceof ProviderBudgetError && error.code === 'PROVIDER_EFFECT_UNCERTAIN') throw error;
    const disposition = options.classifyFailure?.(error) || { effectMayHaveOccurred: true, failureClass: 'provider_effect_unknown' };
    if (disposition.effectMayHaveOccurred) {
      await markProviderBudgetUncertain({ ...input, reservationId: reservation.reservationId, failureClass: disposition.failureClass }, options.invoke).catch(() => undefined);
    } else {
      await releaseProviderBudget({ ...input, reservationId: reservation.reservationId, releaseReason: 'before_provider_effect' }, options.invoke).catch(() => undefined);
    }
    throw error;
  }
};
