import type { EnterpriseProviderUsage } from './enterpriseIntelligenceAi.ts';
import {
  runBudgetedProviderEffect,
  type ProviderBudgetReservation,
  type ProviderBudgetReservationInput,
} from './providerBudget.ts';
import { rpc } from './supabase.ts';

type Rpc = <T>(name: string, args: Record<string, unknown>) => Promise<T>;

const mappingBudgetRpcNames: Readonly<Record<string, string>> = Object.freeze({
  enterprise_ai_reserve_provider_budget: 'enterprise_assess_mapping_reserve_provider_budget_v1',
  enterprise_ai_settle_provider_budget_v2: 'enterprise_assess_mapping_settle_provider_budget_v1',
  enterprise_ai_mark_provider_budget_uncertain_v2: 'enterprise_assess_mapping_mark_provider_budget_uncertain_v1',
  enterprise_ai_release_provider_budget_v2: 'enterprise_assess_mapping_release_provider_budget_v1',
});

/**
 * Narrow RPC adapter for the real Assess mapping run authority. It preserves
 * the shared budget state machine while replacing only the legacy job argument
 * with the mapping run argument accepted by the dedicated SQL quartet.
 *
 * Rollback disables mapping/provider execution and leaves reservation, run,
 * receipt, staged response, and currency debit rows intact for reconciliation.
 */
export const assessMappingBudgetRpc = <T>(
  name: string,
  args: Record<string, unknown>,
  invoke: Rpc = rpc,
): Promise<T> => {
  if (!Object.hasOwn(mappingBudgetRpcNames, name) || !Object.hasOwn(args, 'p_job')) {
    throw new Error('ASSESS_MAPPING_BUDGET_RPC_UNAVAILABLE');
  }
  const mapped = mappingBudgetRpcNames[name];
  const { p_job: p_run, ...rest } = args;
  return invoke<T>(mapped, { ...rest, p_run });
};

export const runAssessMappingBudgetedProviderEffect = <T extends { usage: EnterpriseProviderUsage }>(
  input: ProviderBudgetReservationInput,
  effect: () => Promise<T>,
  options: {
    beforeSettle: (result: T, reservation: ProviderBudgetReservation) => Promise<void>;
    invoke?: Rpc;
    signal?: AbortSignal;
    classifyFailure?: (error: unknown) => { effectMayHaveOccurred: boolean; failureClass: string };
  },
) => runBudgetedProviderEffect(input, effect, {
  ...options,
  invoke: (name, args) => assessMappingBudgetRpc(name, args, options.invoke ?? rpc),
});
