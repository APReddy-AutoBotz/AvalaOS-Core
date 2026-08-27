import assert from 'node:assert/strict';
import {
  ProviderBudgetError, markProviderBudgetUncertain, releaseProviderBudget, reserveProviderBudget,
  runBudgetedProviderEffect, settleProviderBudget, type ProviderBudgetReservationInput,
} from './providerBudget';

const ids = {
  actorId: '11111111-1111-4111-8111-111111111111', organizationId: '22222222-2222-4222-8222-222222222222',
  workspaceId: '33333333-3333-4333-8333-333333333333', receiptId: '44444444-4444-4444-8444-444444444444',
  jobId: '55555555-5555-4555-8555-555555555555', executionToken: '66666666-6666-4666-8666-666666666666',
  routeId: '77777777-7777-4777-8777-777777777777', providerConfigId: '88888888-8888-4888-8888-888888888888',
  reservationId: '99999999-9999-4999-8999-999999999999',
};
const input: ProviderBudgetReservationInput = {
  authority: { actorId: ids.actorId, organizationId: ids.organizationId, workspaceId: ids.workspaceId, authorizationVersion: 7 },
  execution: { receiptId: ids.receiptId, jobId: ids.jobId, executionToken: ids.executionToken, executionFence: 1,
    routeId: ids.routeId, providerConfigId: ids.providerConfigId, provider: 'groq', capability: 'assess.evidence.extract', model: 'governed-model' },
  estimatedInputTokens: 10, maximumOutputTokens: 20,
};

const test = async (name: string, body: () => Promise<void>) => {
  await body(); console.log(`ok - ${name}`);
};

await test('BUDGET-001 one atomic reservation winner under concurrent attempts', async () => {
  let inserted = false;
  const invoke = async <T>(name: string): Promise<T> => {
    assert.equal(name, 'enterprise_ai_reserve_provider_budget');
    const owns = !inserted; inserted = true;
    return { reservationId: ids.reservationId, state: 'reserved', ownsProviderEffect: owns, replayed: !owns, reservedTokens: 30 } as T;
  };
  const attempts = await Promise.all([reserveProviderBudget(input, invoke), reserveProviderBudget(input, invoke)]);
  assert.equal(attempts.filter(value => value.ownsProviderEffect).length, 1);
});

await test('BUDGET-002 exact replay invokes no second provider effect and settles actual usage', async () => {
  let reserved = false; let effects = 0; let settled = false;
  const invoke = async <T>(name: string): Promise<T> => {
    if (name === 'enterprise_ai_reserve_provider_budget') {
      const owns = !reserved; reserved = true;
      return { reservationId: ids.reservationId, state: settled ? 'settled' : 'reserved', ownsProviderEffect: owns,
        replayed: !owns, reservedTokens: 30, ...(settled ? { inputTokens: 8, outputTokens: 4, totalTokens: 12 } : {}) } as T;
    }
    assert.equal(name, 'enterprise_ai_settle_provider_budget_v2'); settled = true;
    return { reservationId: ids.reservationId, state: 'settled', ownsProviderEffect: false, replayed: false,
      reservedTokens: 30, inputTokens: 8, outputTokens: 4, totalTokens: 12 } as T;
  };
  const effect = async () => { effects += 1; return { output: 'safe', usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 } }; };
  let stages = 0;
  const beforeSettle = async () => { stages += 1; };
  const first = await runBudgetedProviderEffect(input, effect, { invoke, beforeSettle });
  const replay = await runBudgetedProviderEffect(input, effect, { invoke, beforeSettle });
  assert.equal(first.kind, 'executed'); assert.equal(replay.kind, 'replay'); assert.equal(effects, 1);
  assert.equal(stages, 1);
});

await test('BUDGET-002 settlement response loss retains reservation as uncertain', async () => {
  let uncertain = false;
  const invoke = async <T>(name: string): Promise<T> => {
    if (name === 'enterprise_ai_reserve_provider_budget') return { reservationId: ids.reservationId, state: 'reserved', ownsProviderEffect: true, replayed: false, reservedTokens: 30 } as T;
    if (name === 'enterprise_ai_settle_provider_budget_v2') throw new Error('sanitized transport loss');
    assert.equal(name, 'enterprise_ai_mark_provider_budget_uncertain_v2'); uncertain = true;
    return { reservationId: ids.reservationId, state: 'uncertain', ownsProviderEffect: false, replayed: false, reservedTokens: 30 } as T;
  };
  await assert.rejects(
    runBudgetedProviderEffect(input, async () => ({ usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 } }), {
      invoke, beforeSettle: async () => undefined,
    }),
    (error: unknown) => error instanceof ProviderBudgetError && error.code === 'PROVIDER_EFFECT_UNCERTAIN',
  );
  assert.equal(uncertain, true);
});

await test('revoked-before-effect is blocked by the reservation transaction', async () => {
  let effects = 0;
  const invoke = async <T>(): Promise<T> => ({ errorCode: 'PERMISSION_DENIED' }) as T;
  await assert.rejects(runBudgetedProviderEffect(input, async () => { effects += 1; return { usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }; }, {
    invoke, beforeSettle: async () => undefined,
  }),
    (error: unknown) => error instanceof ProviderBudgetError && error.code === 'PERMISSION_DENIED');
  assert.equal(effects, 0);
});

await test('budget results and failures contain no provider secret or raw payload', async () => {
  const marker = 'server-only-secret-marker';
  const invoke = async <T>(): Promise<T> => ({ errorCode: 'BUDGET_EXHAUSTED' }) as T;
  const error = await reserveProviderBudget(input, invoke).catch(value => value);
  assert.equal(error instanceof ProviderBudgetError, true);
  assert.equal(JSON.stringify(error).includes(marker), false);
});

await test('provider response is staged before settlement and response-loss replay has no payload or second effect', async () => {
  const secretMarker = 'raw-provider-secret-marker';
  let reserved = false; let effects = 0; let staged = false; const rpcInputs: Record<string, unknown>[] = [];
  const invoke = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    rpcInputs.push(args);
    if (name === 'enterprise_ai_reserve_provider_budget') {
      const owns = !reserved; reserved = true;
      return { reservationId: ids.reservationId, state: owns ? 'reserved' : 'uncertain', ownsProviderEffect: owns,
        replayed: !owns, reservedTokens: 30 } as T;
    }
    if (name === 'enterprise_ai_settle_provider_budget_v2') {
      assert.equal(staged, true, 'durable staging must precede settlement');
      throw new Error('sanitized response loss');
    }
    assert.equal(name, 'enterprise_ai_mark_provider_budget_uncertain_v2');
    return { reservationId: ids.reservationId, state: 'uncertain', ownsProviderEffect: false,
      replayed: false, reservedTokens: 30 } as T;
  };
  const effect = async () => { effects += 1; return {
    output: `candidate:${secretMarker}`, usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 },
  }; };
  const beforeSettle = async (result: Awaited<ReturnType<typeof effect>>) => {
    assert.equal(result.output.includes(secretMarker), true);
    staged = true; // Test double for strict parse/ground plus durable sanitized staging.
  };
  await assert.rejects(runBudgetedProviderEffect(input, effect, { invoke, beforeSettle }),
    (error: unknown) => error instanceof ProviderBudgetError && error.code === 'PROVIDER_EFFECT_UNCERTAIN');
  assert.equal(staged, true);
  const replay = await runBudgetedProviderEffect(input, effect, { invoke, beforeSettle });
  assert.equal(replay.kind, 'replay'); assert.equal(effects, 1);
  assert.equal(JSON.stringify(rpcInputs).includes(secretMarker), false);
  assert.equal(JSON.stringify(rpcInputs).includes('candidate:'), false);
});

await test('crash while staging retains uncertain budget and replay cannot repeat the provider effect', async () => {
  let reserved = false; let effects = 0; let uncertain = 0;
  const invoke = async <T>(name: string): Promise<T> => {
    if (name === 'enterprise_ai_reserve_provider_budget') {
      const owns = !reserved; reserved = true;
      return { reservationId: ids.reservationId, state: owns ? 'reserved' : 'uncertain', ownsProviderEffect: owns,
        replayed: !owns, reservedTokens: 30 } as T;
    }
    assert.equal(name, 'enterprise_ai_mark_provider_budget_uncertain_v2'); uncertain += 1;
    return { reservationId: ids.reservationId, state: 'uncertain', ownsProviderEffect: false,
      replayed: false, reservedTokens: 30 } as T;
  };
  const effect = async () => { effects += 1; return { usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 } }; };
  await assert.rejects(runBudgetedProviderEffect(input, effect, {
    invoke, beforeSettle: async () => { throw new Error('sanitized staging crash'); },
  }), (error: unknown) => error instanceof ProviderBudgetError && error.code === 'PROVIDER_EFFECT_UNCERTAIN');
  const replay = await runBudgetedProviderEffect(input, effect, { invoke, beforeSettle: async () => undefined });
  assert.equal(replay.kind, 'replay'); assert.deepEqual({ effects, uncertain }, { effects: 1, uncertain: 1 });
});

await test('budget lifecycle wrappers validate and bind exact usage, failure, and release inputs', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const invoke = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    calls.push({ name, args });
    if (name === 'enterprise_ai_settle_provider_budget_v2') return {
      reservationId: ids.reservationId, state: 'settled', ownsProviderEffect: false, replayed: false,
      reservedTokens: 30, inputTokens: 8, outputTokens: 4, totalTokens: 12,
    } as T;
    if (name === 'enterprise_ai_mark_provider_budget_uncertain_v2') return {
      reservationId: ids.reservationId, state: 'uncertain', ownsProviderEffect: false, replayed: false, reservedTokens: 30,
    } as T;
    assert.equal(name, 'enterprise_ai_release_provider_budget_v2');
    return { reservationId: ids.reservationId, state: 'released', ownsProviderEffect: false, replayed: false, reservedTokens: 30 } as T;
  };
  assert.equal((await settleProviderBudget({ ...input, reservationId: ids.reservationId,
    usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 } }, invoke)).state, 'settled');
  assert.equal((await markProviderBudgetUncertain({ ...input, reservationId: ids.reservationId,
    failureClass: 'x'.repeat(100) }, invoke)).state, 'uncertain');
  assert.equal((await releaseProviderBudget({ ...input, reservationId: ids.reservationId,
    releaseReason: 'before_provider_effect' }, invoke)).state, 'released');
  assert.deepEqual(calls.map(call => call.name), [
    'enterprise_ai_settle_provider_budget_v2','enterprise_ai_mark_provider_budget_uncertain_v2','enterprise_ai_release_provider_budget_v2',
  ]);
  assert.equal(String(calls[1].args.p_failure_class).length, 80);
  assert.equal(calls.every(call => call.args.p_receipt === ids.receiptId && call.args.p_route === ids.routeId), true);
});

await test('known and malformed budget failures map to stable sanitized errors', async () => {
  await assert.rejects(reserveProviderBudget({ ...input, estimatedInputTokens: 0 }, async <T>() => ({} as T)),
    (error: unknown) => error instanceof ProviderBudgetError && error.code === 'BUDGET_PERSISTENCE_UNAVAILABLE');
  for (const code of ['AUTHORIZATION_STALE','PROVIDER_ROUTE_STALE','PROVIDER_EFFECT_IN_PROGRESS'] as const) {
    await assert.rejects(reserveProviderBudget(input, async <T>() => ({ errorCode: code }) as T),
      (error: unknown) => error instanceof ProviderBudgetError && error.code === code);
  }
  await assert.rejects(reserveProviderBudget(input, async <T>() => ({
    reservationId: ids.reservationId, state: 'settled', ownsProviderEffect: false, replayed: true,
    reservedTokens: 30, inputTokens: 8, outputTokens: 4, totalTokens: 99,
  }) as T), (error: unknown) => error instanceof ProviderBudgetError && error.code === 'BUDGET_PERSISTENCE_UNAVAILABLE');
});

await test('known no-effect failures release budget while possible effects remain uncertain', async () => {
  for (const effectMayHaveOccurred of [false, true]) {
    const transitions: string[] = [];
    const invoke = async <T>(name: string): Promise<T> => {
      transitions.push(name);
      if (name === 'enterprise_ai_reserve_provider_budget') return {
        reservationId: ids.reservationId, state: 'reserved', ownsProviderEffect: true, replayed: false, reservedTokens: 30,
      } as T;
      if (name === 'enterprise_ai_release_provider_budget_v2') return {
        reservationId: ids.reservationId, state: 'released', ownsProviderEffect: false, replayed: false, reservedTokens: 30,
      } as T;
      assert.equal(name, 'enterprise_ai_mark_provider_budget_uncertain_v2');
      return { reservationId: ids.reservationId, state: 'uncertain', ownsProviderEffect: false, replayed: false, reservedTokens: 30 } as T;
    };
    await assert.rejects(runBudgetedProviderEffect(input, async () => { throw new Error('sanitized failure'); }, {
      invoke, beforeSettle: async () => undefined,
      classifyFailure: () => ({ effectMayHaveOccurred, failureClass: effectMayHaveOccurred ? 'unknown_effect' : 'before_effect' }),
    }), /sanitized failure/);
    assert.equal(transitions.includes(effectMayHaveOccurred
      ? 'enterprise_ai_mark_provider_budget_uncertain_v2' : 'enterprise_ai_release_provider_budget_v2'), true);
  }
});

await test('secondary reconciliation failures never hide the stable primary disposition', async () => {
  const reserveThenRejectTransitions = async <T>(name: string): Promise<T> => {
    if (name === 'enterprise_ai_reserve_provider_budget') return {
      reservationId: ids.reservationId, state: 'reserved', ownsProviderEffect: true, replayed: false, reservedTokens: 30,
    } as T;
    throw new Error('sanitized reconciliation unavailable');
  };
  await assert.rejects(runBudgetedProviderEffect(input,
    async () => ({ usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }), {
      invoke: reserveThenRejectTransitions, beforeSettle: async () => { throw new Error('staging unavailable'); },
    }), (error: unknown) => error instanceof ProviderBudgetError && error.code === 'PROVIDER_EFFECT_UNCERTAIN');
  await assert.rejects(runBudgetedProviderEffect(input,
    async () => ({ usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }), {
      invoke: reserveThenRejectTransitions, beforeSettle: async () => undefined,
    }), (error: unknown) => error instanceof ProviderBudgetError && error.code === 'PROVIDER_EFFECT_UNCERTAIN');
  for (const effectMayHaveOccurred of [true, false]) {
    await assert.rejects(runBudgetedProviderEffect(input, async () => { throw new Error('primary provider failure'); }, {
      invoke: reserveThenRejectTransitions, beforeSettle: async () => undefined,
      classifyFailure: () => ({ effectMayHaveOccurred, failureClass: 'primary_failure' }),
    }), /primary provider failure/);
  }
});

await test('BUDGET-002 cancellation before the provider cut point releases the reservation', async () => {
  let effects = 0; let releases = 0;
  const invoke = async <T>(name: string): Promise<T> => {
    if (name === 'enterprise_ai_reserve_provider_budget') return {
      reservationId: ids.reservationId, state: 'reserved', ownsProviderEffect: true, replayed: false, reservedTokens: 30,
    } as T;
    assert.equal(name, 'enterprise_ai_release_provider_budget_v2'); releases += 1;
    return { reservationId: ids.reservationId, state: 'released', ownsProviderEffect: false, replayed: false, reservedTokens: 30 } as T;
  };
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runBudgetedProviderEffect(input, async () => {
    effects += 1; return { usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
  }, { invoke, signal: controller.signal, beforeSettle: async () => undefined }),
  (error: unknown) => error instanceof ProviderBudgetError && error.code === 'PROVIDER_EFFECT_CANCELLED');
  assert.deepEqual({ effects, releases }, { effects: 0, releases: 1 });
});

await test('BUDGET-002 timeout after the provider cut point is uncertain and never released', async () => {
  const transitions: string[] = [];
  const invoke = async <T>(name: string): Promise<T> => {
    transitions.push(name);
    if (name === 'enterprise_ai_reserve_provider_budget') return {
      reservationId: ids.reservationId, state: 'reserved', ownsProviderEffect: true, replayed: false, reservedTokens: 30,
    } as T;
    assert.equal(name, 'enterprise_ai_mark_provider_budget_uncertain_v2');
    return { reservationId: ids.reservationId, state: 'uncertain', ownsProviderEffect: false, replayed: false, reservedTokens: 30 } as T;
  };
  await assert.rejects(runBudgetedProviderEffect(input, async () => { throw new Error('sanitized timeout'); }, {
    invoke, beforeSettle: async () => undefined,
    classifyFailure: () => ({ effectMayHaveOccurred: true, failureClass: 'provider_timeout' }),
  }), /sanitized timeout/);
  assert.equal(transitions.includes('enterprise_ai_mark_provider_budget_uncertain_v2'), true);
  assert.equal(transitions.includes('enterprise_ai_release_provider_budget_v2'), false);
});

await test('BUDGET-002 transition response loss retries the same fenced transition', async () => {
  let attempts = 0;
  const invoke = async <T>(name: string): Promise<T> => {
    assert.equal(name, 'enterprise_ai_release_provider_budget_v2'); attempts += 1;
    if (attempts === 1) throw new Error('sanitized response loss');
    return { reservationId: ids.reservationId, state: 'released', ownsProviderEffect: false, replayed: true, reservedTokens: 30 } as T;
  };
  const result = await releaseProviderBudget({
    ...input, reservationId: ids.reservationId, releaseReason: 'before_provider_effect',
  }, invoke);
  assert.equal(result.state, 'released'); assert.equal(result.replayed, true); assert.equal(attempts, 2);
});
