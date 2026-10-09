import assert from 'node:assert/strict';

// Disposable integration only. The production generation claim, source loader,
// token budget, validation, staging and finalization remain intact. The sole
// substituted effect is a deterministic provider response; no key is resolved
// and no HTTP transport exists here.
export function createEnterpriseLifecycleStudioGeneration({
  serviceQuery, providerEffects, studioDbModule, studioGenerationModule,
  providerBudgetModule, studioProviderModule, templateModule,
  toProductionJson = value => value,
}) {
  let lastRpcError = null;
  const rpcNames = new Set([
    ...Object.values(studioDbModule.STUDIO_RPC),
    'studio_artifact_reserve_provider_budget_v2',
    'studio_artifact_settle_provider_budget_v2',
    'studio_artifact_mark_provider_budget_uncertain_v2',
    'studio_artifact_release_provider_budget_v2',
  ]);
  const invoke = async (name, args) => {
    assert.ok(rpcNames.has(name), 'UNEXPECTED_STUDIO_RPC');
    const entries = Object.entries(args);
    entries.forEach(([key]) => assert.match(key, /^p_[a-z0-9_]+$/u));
    const parameters = entries.map(([key], index) => `${key} => $${index + 1}`).join(',');
    const values = entries.map(([, value]) => value !== null && typeof value === 'object' ? JSON.stringify(value) : value);
    try {
      const result = await serviceQuery(`SELECT public.${name}(${parameters}) value`, values);
      return toProductionJson(result.rows[0]?.value);
    } catch (error) {
      lastRpcError = { rpc: name, sqlState: error?.code ?? null, message: error?.message ?? 'UNKNOWN', context: error?.where ?? null };
      // Production transport maps the PostgreSQL error body before exposing it
      // to the handler. Preserve that exact decoder in the loopback adapter.
      throw studioDbModule.decodeStudioRpcError(error);
    }
  };
  // Only material reads reached by an Assess-handoff/system-template BRD are
  // supported. Unexpected product queries fail instead of receiving fake rows.
  const tables = new Set([
    'studio_artifact_source_packages', 'assess_v2_studio_handoffs',
    'studio_system_template_versions', 'ai_provider_configs',
  ]);
  const read = async (resource, options = {}) => {
    assert.equal(options.method ?? 'GET', 'GET');
    const [table, query = ''] = resource.split('?');
    assert.ok(tables.has(table), 'UNEXPECTED_STUDIO_MATERIAL_TABLE');
    const params = new URLSearchParams(query);
    const columns = params.get('select');
    assert.match(columns, /^[a-z0-9_]+(?:,[a-z0-9_]+)*$/u);
    assert.equal(params.get('limit'), '1');
    params.delete('select'); params.delete('limit');
    const values = []; const predicates = [];
    for (const [column, value] of params) {
      assert.match(column, /^[a-z0-9_]+$/u);
      if (value === 'is.null') predicates.push(`${column} IS NULL`);
      else {
        assert.ok(value.startsWith('eq.'), 'UNEXPECTED_STUDIO_MATERIAL_FILTER');
        values.push(value.slice(3)); predicates.push(`${column} = $${values.length}`);
      }
    }
    assert.ok(predicates.length > 0);
    const result = await serviceQuery(`SELECT ${columns} FROM public.${table} WHERE ${predicates.join(' AND ')} LIMIT 1`, values);
    for (const row of result.rows) {
      for (const key of ['version', 'candidate_count', 'anchor_count']) {
        if (typeof row[key] === 'string' && /^\d+$/u.test(row[key])) row[key] = Number(row[key]);
      }
    }
    return toProductionJson(result.rows);
  };
  let failNext = false;
  const runProvider = async input => {
    providerEffects.syntheticProviderCalls += 1;
    if (failNext) {
      failNext = false;
      throw new studioProviderModule.StudioProviderGatewayError('PROVIDER_REQUEST_FAILED', false);
    }
    const contract = templateModule.normalizeStudioArtifactTemplate(input.templatePayload);
    const selected = [...input.selectedSourceVersionIds];
    const content = {
      contractVersion: 'studio-artifact-2',
      title: 'Synthetic governed lifecycle BRD',
      summary: 'Integration fixture output bound to the approved Assess handoff.',
      sections: contract.sections.map((section, index) => ({
        id: section.id, title: section.title,
        body: `Synthetic ${section.id} section ${index + 1}; approved source facts are retained by the production composer.`,
        sourceAnchors: index === 0 ? input.canonicalSourceAnchors.map(anchor => ({ ...anchor })) : [],
        labels: index === 0 ? [] : [section.required ? 'template_required' : 'assumption'],
      })),
      coverage: { selectedSourceVersionIds: selected, coveredSourceVersionIds: selected, complete: true },
    };
    return toProductionJson({
      content, providerOperationId: `synthetic-${input.providerEffect.effectId}`,
      usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 },
    });
  };
  const executeClaimedGeneration = initial => studioDbModule.executeStudioGenerationDependency(initial, {
    claim: plan => studioDbModule.claimStudioGeneration(plan, invoke,
      materialPlan => studioDbModule.loadStudioGenerationMaterial(materialPlan, read, invoke)),
    fail: input => studioDbModule.failStudioGeneration(input, invoke),
    execute: claim => studioGenerationModule.executeClaimedStudioGeneration(claim, {
      runProvider,
      runBudgeted: (input, effect, options) => providerBudgetModule.runBudgetedProviderEffect(input, effect, {
        ...options, invoke: (name, args) => studioGenerationModule.studioBudgetRpc(name, args, invoke),
      }),
      stage: input => studioDbModule.stageStudioGeneration(input, invoke).then(() => undefined),
      finalize: input => studioDbModule.finalizeStudioGeneration(input, invoke),
      fail: (attemptId, failureCode) => studioDbModule.failStudioGeneration({
        attemptId, executionToken: claim.executionToken, executionFence: claim.executionFence, failureCode,
      }, invoke),
    }),
  });
  return {
    invoke,
    getLastRpcError: () => lastRpcError,
    executeClaimedGeneration,
    failNextProviderCall() { assert.equal(failNext, false); failNext = true; },
  };
}
