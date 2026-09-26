import assert from 'node:assert/strict';
import test from 'node:test';
import { assessMappingBudgetRpc, runAssessMappingBudgetedProviderEffect } from './assessMappingProviderBudget.ts';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const baseArgs = { p_actor: id(1), p_org: id(2), p_workspace: id(3), p_receipt: id(4), p_job: id(5) };

test('mapping budget adapter maps only the approved quartet and p_job to p_run', async () => {
  const expected = new Map([
    ['enterprise_ai_reserve_provider_budget', 'enterprise_assess_mapping_reserve_provider_budget_v1'],
    ['enterprise_ai_settle_provider_budget_v2', 'enterprise_assess_mapping_settle_provider_budget_v1'],
    ['enterprise_ai_mark_provider_budget_uncertain_v2', 'enterprise_assess_mapping_mark_provider_budget_uncertain_v1'],
    ['enterprise_ai_release_provider_budget_v2', 'enterprise_assess_mapping_release_provider_budget_v1'],
  ]);
  for (const [source, target] of expected) {
    let call: { name: string; args: Record<string, unknown> } | undefined;
    await assessMappingBudgetRpc(source, baseArgs, async <T>(name: string, args: Record<string, unknown>) => {
      call = { name, args };
      return { ok: true } as T;
    });
    assert.equal(call?.name, target);
    assert.equal(call?.args.p_run, id(5));
    assert.equal(Object.hasOwn(call?.args ?? {}, 'p_job'), false);
  }
  const unused = async <T>() => ({} as T);
  assert.throws(() => assessMappingBudgetRpc('enterprise_ai_unknown', baseArgs, unused), /UNAVAILABLE/);
  assert.throws(() => assessMappingBudgetRpc('constructor', baseArgs, unused), /UNAVAILABLE/);
  assert.throws(() => assessMappingBudgetRpc('toString', baseArgs, unused), /UNAVAILABLE/);
  assert.throws(() => assessMappingBudgetRpc('enterprise_ai_reserve_provider_budget', {}, unused), /UNAVAILABLE/);
});

test('mapping runner reserves, stages, and settles through mapping authority before returning', async () => {
  const calls: string[] = [];
  const input = {
    authority: { actorId: id(1), organizationId: id(2), workspaceId: id(3), authorizationVersion: 7 },
    execution: { receiptId: id(4), jobId: id(5), executionToken: id(6), executionFence: 3,
      routeId: id(7), providerConfigId: id(8), provider: 'openai' as const,
      capability: 'assess.evidence.extract' as const, model: 'model' },
    estimatedInputTokens: 20, maximumOutputTokens: 10,
  };
  const result = await runAssessMappingBudgetedProviderEffect(input, async () => {
    calls.push('effect');
    return { usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 }, value: 'ok' };
  }, {
    beforeSettle: async () => { calls.push('stage'); },
    invoke: async <T>(name: string, args: Record<string, unknown>) => {
      calls.push(name);
      assert.equal(args.p_run, id(5));
      assert.equal(Object.hasOwn(args, 'p_job'), false);
      if (name.endsWith('reserve_provider_budget_v1')) return {
        reservationId: id(9), state: 'reserved', ownsProviderEffect: true, replayed: false, reservedTokens: 30,
      } as T;
      return { reservationId: id(9), state: 'settled', ownsProviderEffect: false, replayed: false,
        reservedTokens: 30, inputTokens: 4, outputTokens: 2, totalTokens: 6 } as T;
    },
  });
  assert.equal(result.kind, 'executed');
  assert.deepEqual(calls, [
    'enterprise_assess_mapping_reserve_provider_budget_v1', 'effect', 'stage',
    'enterprise_assess_mapping_settle_provider_budget_v1',
  ]);
});

test('mapping reservation replay never invokes the provider effect', async () => {
  let effected = false;
  const result = await runAssessMappingBudgetedProviderEffect({
    authority: { actorId: id(1), organizationId: id(2), workspaceId: id(3), authorizationVersion: 7 },
    execution: { receiptId: id(4), jobId: id(5), executionToken: id(6), executionFence: 3,
      routeId: id(7), providerConfigId: id(8), provider: 'openai', capability: 'assess.evidence.extract', model: 'model' },
    estimatedInputTokens: 20, maximumOutputTokens: 10,
  }, async () => {
    effected = true;
    return { usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
  }, {
    beforeSettle: async () => undefined,
    invoke: async <T>() => ({ reservationId: id(9), state: 'uncertain', ownsProviderEffect: false, replayed: true, reservedTokens: 30 } as T),
  });
  assert.equal(result.kind, 'replay');
  assert.equal(effected, false);
});
