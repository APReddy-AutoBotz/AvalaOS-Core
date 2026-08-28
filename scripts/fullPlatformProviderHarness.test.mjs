import assert from 'node:assert/strict';
import {
  ProviderCampaignError,
  createProviderCampaignBudget,
  parseProviderSecretReferenceName,
  providerCampaignHardCeilings,
  runSanitizedProviderDiagnostic,
  runSerialProviderDiagnostics,
} from './fullPlatformProviderHarness.mjs';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '66666666-6666-4666-8666-666666666666';
const segment = organizationId.replaceAll('-', '').toUpperCase();
const secret = 'test-secret-never-retained';
const pricing = Object.freeze({ inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4 });
const calls = [];
const mockFetch = async (url, init) => {
  calls.push({ url, init });
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${secret}`);
  const request = JSON.parse(init.body);
  assert.equal(request.tools.length, 0);
  assert.equal(request.temperature, 0);
  return {
    ok: true,
    status: 200,
    json: async () => ({
      model: request.model,
      choices: [{ message: { content: '{"status":"ok"}' } }],
      usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
    }),
  };
};
const readSecret = async name => {
  assert.match(name, /^AVALA_PROVIDER_SECRET_(OPENAI|GROQ)_/);
  return secret;
};

assert.deepEqual(
  parseProviderSecretReferenceName({
    provider: 'openai',
    secretRefName: `AVALA_PROVIDER_SECRET_OPENAI_${segment}_QA`,
  }),
  {
    provider: 'openai',
    organizationId,
    secretRefName: `AVALA_PROVIDER_SECRET_OPENAI_${segment}_QA`,
  },
);
assert.throws(
  () => parseProviderSecretReferenceName({
    provider: 'groq',
    secretRefName: `AVALA_PROVIDER_SECRET_OPENAI_${segment}_QA`,
  }),
  error => error instanceof ProviderCampaignError && error.code === 'SECRET_REFERENCE_INVALID',
);

const budget = createProviderCampaignBudget({
  calls: 2,
  inputTokens: 256,
  outputTokens: 128,
  totalTokens: 384,
  estimatedUsd: 0.01,
});
const report = await runSerialProviderDiagnostics({
  budget,
  diagnostics: [
    {
      provider: 'openai', organizationId, workspaceId,
      secretRefName: `AVALA_PROVIDER_SECRET_OPENAI_${segment}_QA`,
      model: 'injected-openai-model', maxOutputTokens: 64, pricing, readSecret, fetchImpl: mockFetch,
    },
    {
      provider: 'groq', organizationId, workspaceId,
      secretRefName: `AVALA_PROVIDER_SECRET_GROQ_${segment}_QA`,
      model: 'injected-groq-model', maxOutputTokens: 64, pricing, readSecret, fetchImpl: mockFetch,
    },
  ],
});
assert.equal(calls.length, 2);
assert.deepEqual(report.results.map(result => result.evidencePath), ['governed_openai_byok', 'legacy_groq']);
assert.equal(report.execution, 'serial');
assert.equal(report.rawOutputRetained, false);
assert.deepEqual(
  { ...report.actualTotals, estimatedUsd: Number(report.actualTotals.estimatedUsd.toFixed(10)) },
  { calls: 2, inputTokens: 14, outputTokens: 6, totalTokens: 20, estimatedUsd: 0.0000038 },
);
assert.deepEqual(
  { calls: report.reservedBudget.calls, inputTokens: report.reservedBudget.inputTokens, outputTokens: report.reservedBudget.outputTokens, totalTokens: report.reservedBudget.totalTokens },
  { calls: 2, inputTokens: 256, outputTokens: 128, totalTokens: 384 },
);
assert.equal(JSON.stringify(report).includes(secret), false);
assert.equal(JSON.stringify(report).includes('{"status":"ok"}'), false);

const finalSlotBudget = createProviderCampaignBudget({ calls: 1, inputTokens: 128, outputTokens: 64, totalTokens: 192, estimatedUsd: 0.01 });
let finalSlotFetches = 0;
const finalSlotFetch = async (...args) => {
  finalSlotFetches += 1;
  return mockFetch(...args);
};
const concurrent = await Promise.allSettled([
  runSanitizedProviderDiagnostic({
    provider: 'openai', organizationId, workspaceId,
    secretRefName: `AVALA_PROVIDER_SECRET_OPENAI_${segment}_QA`, model: 'model-a',
    maxOutputTokens: 64, pricing, budget: finalSlotBudget, readSecret, fetchImpl: finalSlotFetch,
  }),
  runSanitizedProviderDiagnostic({
    provider: 'groq', organizationId, workspaceId,
    secretRefName: `AVALA_PROVIDER_SECRET_GROQ_${segment}_QA`, model: 'model-b',
    maxOutputTokens: 64, pricing, budget: finalSlotBudget, readSecret, fetchImpl: finalSlotFetch,
  }),
]);
assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
assert.equal(concurrent.filter(result => result.status === 'rejected').length, 1);
assert.equal(finalSlotFetches, 1);
const rejected = concurrent.find(result => result.status === 'rejected');
assert.ok(rejected.reason instanceof ProviderCampaignError);
assert.equal(rejected.reason.code, 'CAMPAIGN_BUDGET_EXHAUSTED');

let wrongScopeFetches = 0;
await assert.rejects(
  runSanitizedProviderDiagnostic({
    provider: 'openai', organizationId, workspaceId,
    secretRefName: `AVALA_PROVIDER_SECRET_OPENAI_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA_QA`,
    model: 'model-a', pricing, budget: createProviderCampaignBudget({ calls: 1, inputTokens: 128, outputTokens: 64, totalTokens: 192, estimatedUsd: 0.01 }),
    readSecret, fetchImpl: async () => { wrongScopeFetches += 1; },
  }),
  error => error instanceof ProviderCampaignError && error.code === 'SECRET_REFERENCE_INVALID',
);
assert.equal(wrongScopeFetches, 0);

assert.throws(
  () => createProviderCampaignBudget({
    calls: providerCampaignHardCeilings.calls + 1,
    inputTokens: 100,
    outputTokens: 100,
    totalTokens: 200,
    estimatedUsd: 0.01,
  }),
  error => error instanceof ProviderCampaignError && error.code === 'CAMPAIGN_LIMIT_INVALID',
);

const invalidResponseCases = [
  {
    expectedCode: 'PROVIDER_USAGE_INVALID',
    body: { model: 'model-a', choices: [{ message: { content: '{"status":"ok"}' } }] },
  },
  {
    expectedCode: 'PROVIDER_ASSERTION_FAILED',
    body: { model: 'model-a', choices: [{ message: { content: '{"status":"unexpected"}' } }], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } },
  },
  {
    expectedCode: 'PROVIDER_MODEL_MISMATCH',
    body: { model: 'substituted-model', choices: [{ message: { content: '{"status":"ok"}' } }], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } },
  },
];
for (const { expectedCode, body } of invalidResponseCases) {
  await assert.rejects(
    runSanitizedProviderDiagnostic({
      provider: 'openai', organizationId, workspaceId,
      secretRefName: `AVALA_PROVIDER_SECRET_OPENAI_${segment}_QA`, model: 'model-a', pricing,
      budget: createProviderCampaignBudget({ calls: 1, inputTokens: 128, outputTokens: 64, totalTokens: 192, estimatedUsd: 0.01 }),
      readSecret,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => body }),
    }),
    error => error instanceof ProviderCampaignError && error.code === expectedCode,
  );
}

console.log('Full-platform provider harness mocked regression suite passed: serial paths, atomic final slot, fail-closed usage/model/output, 0 raw outputs retained.');
