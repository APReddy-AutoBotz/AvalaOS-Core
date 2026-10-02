import assert from 'node:assert/strict';
import {
  SyntheticAiCampaignError,
  assertSyntheticAiLegacyResolverAllowed,
  assertSyntheticAiLifecycleOperationAllowed,
  assertSyntheticAiLifecycleRegistrationAllowed,
  consumeSyntheticAiProviderEffect,
  readSyntheticAiCampaignRuntimeBinding,
  reserveSyntheticAiProviderEffect,
  syntheticAiCapabilityToOperation,
  type SyntheticAiEffectInput,
} from './syntheticAiCampaign';

const ids = {
  actorId: '11111111-1111-4111-8111-111111111111', organizationId: '22222222-2222-4222-8222-222222222222',
  workspaceId: '33333333-3333-4333-8333-333333333333', receiptId: '44444444-4444-4444-8444-444444444444',
  effectId: '55555555-5555-4555-8555-555555555555', executionToken: '66666666-6666-4666-8666-666666666666',
  routeId: '77777777-7777-4777-8777-777777777777', providerConfigId: '88888888-8888-4888-8888-888888888888',
  keyRefId: '99999999-9999-4999-8999-999999999999', reservationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};
const syntheticProjectRef = 'a'.repeat(20);
const syntheticProjectUrl = `https://${syntheticProjectRef}.supabase.co`;
const base: SyntheticAiEffectInput = {
  actorId: ids.actorId, organizationId: ids.organizationId, workspaceId: ids.workspaceId,
  authorizationVersion: 7, receiptId: ids.receiptId, effectId: ids.effectId,
  executionToken: ids.executionToken, executionFence: 3, routeId: ids.routeId,
  providerConfigId: ids.providerConfigId, keyRefId: ids.keyRefId, provider: 'openai',
  endpoint: 'https://api.openai.com', model: 'gpt-4.1-mini-2025-04-14',
  operation: 'assess.evidence.extract',
  requestHash: 'c'.repeat(64), maximumOutputTokens: 32_768,
};
const test = async (name: string, body: () => Promise<void> | void) => { await body(); console.log(`ok - ${name}`); };

await test('runtime target binding is all-or-nothing and derived from the canonical Supabase origin', () => {
  assert.deepEqual(readSyntheticAiCampaignRuntimeBinding(() => undefined), {});
  const values: Record<string,string> = {
    AVALA_SYNTHETIC_AI_TARGET_FINGERPRINT: `sha256:${'a'.repeat(64)}`,
    SUPABASE_URL: syntheticProjectUrl,
  };
  assert.deepEqual(readSyntheticAiCampaignRuntimeBinding(name => values[name]), {
    targetFingerprint: values.AVALA_SYNTHETIC_AI_TARGET_FINGERPRINT,
    projectRef: syntheticProjectRef,
  });
  for (const url of ['https://avalaos.com',`http://${syntheticProjectRef}.supabase.co`,`${syntheticProjectUrl}/path`]) {
    assert.throws(() => readSyntheticAiCampaignRuntimeBinding(name => name === 'SUPABASE_URL' ? url : values[name]),
      (error: unknown) => error instanceof SyntheticAiCampaignError && error.code === 'AUTHORITY_UNAVAILABLE');
  }
});

await test('ordinary multi-provider effects require an explicit DB authority result without campaign narrowing', async () => {
  for (const [provider, endpoint, capability] of [
    ['groq','https://api.groq.com','assess.evidence.summarize'],
    ['anthropic','https://api.anthropic.com','delivery.work_items.draft'],
    ['gemini','https://generativelanguage.googleapis.com','modernization.rationale.draft'],
  ] as const) {
    let call: Record<string, unknown> | undefined;
    const permit = await reserveSyntheticAiProviderEffect({ ...base, provider, endpoint, model: 'ordinary-model', operation: capability }, {
      readEnv: () => undefined,
      invoke: async <T>(name: string, args: Record<string, unknown>) => {
        assert.equal(name, 'synthetic_ai_campaign_reserve_effect'); call = args;
        return { mode: 'ordinary', ownsProviderEffect: true, replayed: false } as T;
      },
    });
    assert.equal(permit.mode, 'ordinary'); assert.equal(call?.p_provider, provider); assert.equal(call?.p_operation, capability);
  }
});

await test('campaign reserve binds exact target/project and accepts only a valid charged permit', async () => {
  let args: Record<string, unknown> | undefined;
  const permit = await reserveSyntheticAiProviderEffect(base, {
    readEnv: name => name === 'AVALA_SYNTHETIC_AI_TARGET_FINGERPRINT' ? `sha256:${'b'.repeat(64)}`
      : name === 'SUPABASE_URL' ? syntheticProjectUrl : undefined,
    invoke: async <T>(_name: string, value: Record<string, unknown>) => {
      args = value;
      return { mode: 'campaign', reservationId: ids.reservationId, ownsProviderEffect: true, replayed: false,
        consumed: false, debitUsdNanos: 471459200, remainingUsdNanos: 9358560000 } as T;
    },
  });
  assert.equal(permit.mode, 'campaign'); assert.equal(args?.p_target_fingerprint, `sha256:${'b'.repeat(64)}`);
  assert.equal(args?.p_project_ref, syntheticProjectRef); assert.equal(args?.p_effect, ids.effectId);
});

await test('campaign response cannot widen provider, endpoint, model, or operation', async () => {
  const campaign = async (input: SyntheticAiEffectInput) => reserveSyntheticAiProviderEffect(input, {
    readEnv: name => name === 'AVALA_SYNTHETIC_AI_TARGET_FINGERPRINT' ? `sha256:${'b'.repeat(64)}`
      : name === 'SUPABASE_URL' ? syntheticProjectUrl : undefined,
    invoke: async <T>() => ({ mode: 'campaign', reservationId: ids.reservationId, ownsProviderEffect: true, replayed: false,
      consumed: false, debitUsdNanos: 471459200, remainingUsdNanos: 9358560000 }) as T,
  });
  for (const changed of [
    { ...base, provider: 'groq' as const, endpoint: 'https://api.groq.com' },
    { ...base, endpoint: 'https://other.example' }, { ...base, model: 'other' },
    { ...base, operation: 'delivery.work_items.draft' as const },
  ]) await assert.rejects(campaign(changed), (error: unknown) => error instanceof SyntheticAiCampaignError && error.code === 'EFFECT_NOT_AUTHORIZED');
});

await test('malformed, replayed, and substituted reservation responses fail closed', async () => {
  for (const response of [
    {}, { mode: 'campaign', reservationId: 'bad', ownsProviderEffect: true, replayed: false },
    { mode: 'ordinary', ownsProviderEffect: true, replayed: true },
    { mode: 'campaign', reservationId: ids.reservationId, ownsProviderEffect: true, replayed: false,
      consumed: false, debitUsdNanos: 471459200, remainingUsdNanos: 9358560000, unexpected: true },
    { mode: 'campaign', reservationId: ids.reservationId, ownsProviderEffect: false, replayed: true,
      consumed: true },
  ]) {
    const outcome = await reserveSyntheticAiProviderEffect(base, {
      readEnv: () => undefined, invoke: async <T>() => response as T,
    }).catch(error => error);
    assert.ok(outcome instanceof SyntheticAiCampaignError);
  }
});

await test('runtime target binding cannot be downgraded and campaign permits snapshot their request', async () => {
  const campaignEnv = (name: string) => name === 'AVALA_SYNTHETIC_AI_TARGET_FINGERPRINT'
      ? `sha256:${'b'.repeat(64)}` : name === 'SUPABASE_URL'
      ? syntheticProjectUrl : undefined;
  await assert.rejects(reserveSyntheticAiProviderEffect(base, {
    readEnv: campaignEnv,
    invoke: async <T>() => ({ mode: 'ordinary', ownsProviderEffect: true, replayed: false }) as T,
  }), (error: unknown) => error instanceof SyntheticAiCampaignError && error.code === 'AUTHORITY_UNAVAILABLE');
  await assert.rejects(reserveSyntheticAiProviderEffect(base, {
    readEnv: () => undefined,
    invoke: async <T>() => ({ mode: 'campaign', reservationId: ids.reservationId,
      ownsProviderEffect: true, replayed: false, consumed: false,
      debitUsdNanos: 471459200, remainingUsdNanos: 9358560000 }) as T,
  }), (error: unknown) => error instanceof SyntheticAiCampaignError && error.code === 'AUTHORITY_UNAVAILABLE');
  const mutable = { ...base };
  const permit = await reserveSyntheticAiProviderEffect(mutable, {
    readEnv: campaignEnv,
    invoke: async <T>() => ({ mode: 'campaign', reservationId: ids.reservationId,
      ownsProviderEffect: true, replayed: false, consumed: false,
      debitUsdNanos: 471459200, remainingUsdNanos: 9358560000 }) as T,
  });
  mutable.endpoint = 'https://substituted.example';
  assert.equal(permit.binding.endpoint, 'https://api.openai.com');
  assert.ok(Object.isFrozen(permit));
  assert.ok(Object.isFrozen(permit.binding));
});

await test('consume sends the same immutable binding and rejects duplicate/replayed permits', async () => {
  const permit = {
    mode: 'campaign' as const, reservationId: ids.reservationId, ownsProviderEffect: true, replayed: false,
    binding: base, targetFingerprint: `sha256:${'b'.repeat(64)}`, projectRef: syntheticProjectRef,
  };
  let consumed = 0;
  await consumeSyntheticAiProviderEffect(permit, async <T>(name: string, value: Record<string, unknown>) => {
    consumed += 1; assert.equal(name, 'synthetic_ai_campaign_consume_effect');
    assert.equal(value.p_reservation, ids.reservationId); assert.equal(value.p_execution_fence, 3);
    return { mode: 'campaign', reservationId: ids.reservationId, consumed: true } as T;
  });
  assert.equal(consumed, 1);
  await assert.rejects(consumeSyntheticAiProviderEffect({ ...permit, ownsProviderEffect: false, replayed: true }),
    (error: unknown) => error instanceof SyntheticAiCampaignError && error.code === 'EFFECT_REPLAYED');
});

await test('missing reserve or consume RPC never becomes implicit authority', async () => {
  await assert.rejects(reserveSyntheticAiProviderEffect(base, { readEnv: () => undefined, invoke: async () => { throw new Error(); } }),
    (error: unknown) => error instanceof SyntheticAiCampaignError && error.code === 'AUTHORITY_UNAVAILABLE');
  const ordinary = { mode: 'ordinary' as const, ownsProviderEffect: true, replayed: false, binding: base };
  await assert.rejects(consumeSyntheticAiProviderEffect(ordinary, async () => { throw new Error(); }),
    (error: unknown) => error instanceof SyntheticAiCampaignError && error.code === 'PERMIT_CONSUME_FAILED');
});

await test('all retained capabilities pass through as ordinary operation identities', () => {
  for (const capability of ['assess.evidence.extract','assess.evidence.summarize','delivery.work_items.draft',
    'modernization.rationale.draft','assemble.blueprint.draft','studio.document.generate'] as const) {
    assert.equal(syntheticAiCapabilityToOperation(capability), capability);
  }
});

await test('lifecycle and legacy guards require exact explicit database authority responses', async () => {
  await assertSyntheticAiLifecycleRegistrationAllowed({
    organizationId: ids.organizationId, workspaceId: ids.workspaceId,
  }, async <T>() => ({ allowed: true, mode: 'ordinary' }) as T);
  await assertSyntheticAiLifecycleOperationAllowed({
    organizationId: ids.organizationId, workspaceId: ids.workspaceId,
    providerConfigId: ids.providerConfigId, operation: 'provider.validate',
  }, async <T>() => ({ allowed: true, mode: 'campaign' }) as T);
  await assertSyntheticAiLegacyResolverAllowed({
    organizationId: ids.organizationId, workspaceId: ids.workspaceId,
    providerConfigId: ids.providerConfigId, keyRefId: ids.keyRefId,
  }, async <T>() => ({ allowed: true, mode: 'ordinary' }) as T);
  for (const response of [
    { allowed: true }, { allowed: true, mode: 'ordinary', extra: true },
    { allowed: false, mode: 'ordinary' }, { allowed: true, mode: 'campaign' },
  ]) {
    await assert.rejects(assertSyntheticAiLifecycleRegistrationAllowed({
      organizationId: ids.organizationId, workspaceId: ids.workspaceId,
    }, async <T>() => response as T),
    (error: unknown) => error instanceof SyntheticAiCampaignError && error.code === 'EFFECT_NOT_AUTHORIZED');
  }
});
