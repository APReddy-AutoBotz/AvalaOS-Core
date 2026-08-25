import crypto from 'node:crypto';

const HARD_CAMPAIGN_CEILINGS = Object.freeze({
  calls: 4,
  inputTokens: 4_096,
  outputTokens: 512,
  totalTokens: 4_608,
  perCallOutputTokens: 128,
  estimatedUsd: 0.10,
});

const PROVIDER_CONTRACTS = Object.freeze({
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    evidencePath: 'governed_openai_byok',
  },
  groq: {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    evidencePath: 'legacy_groq',
  },
});

export class ProviderCampaignError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ProviderCampaignError';
    this.code = code;
  }
}

const requirePositiveInteger = (value, code) => {
  if (!Number.isSafeInteger(value) || value < 1) throw new ProviderCampaignError(code);
  return value;
};

const requireBoundedInteger = (value, maximum, code) => {
  const parsed = requirePositiveInteger(value, code);
  if (parsed > maximum) throw new ProviderCampaignError(code);
  return parsed;
};

const requireBoundedNumber = (value, maximum, code) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > maximum) {
    throw new ProviderCampaignError(code);
  }
  return value;
};

const tenantSegment = organizationId => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)) {
    throw new ProviderCampaignError('CAMPAIGN_SCOPE_INVALID');
  }
  return organizationId.replaceAll('-', '').toUpperCase();
};

export const parseProviderSecretReferenceName = ({ provider, secretRefName }) => {
  if (!PROVIDER_CONTRACTS[provider] || typeof secretRefName !== 'string') {
    throw new ProviderCampaignError('SECRET_REFERENCE_INVALID');
  }
  const match = new RegExp(
    `^AVALA_PROVIDER_SECRET_${provider.toUpperCase()}_([0-9A-F]{32})_[A-Z0-9]+$`,
  ).exec(secretRefName);
  if (!match) throw new ProviderCampaignError('SECRET_REFERENCE_INVALID');
  const segment = match[1];
  const organizationId = `${segment.slice(0, 8)}-${segment.slice(8, 12)}-${segment.slice(12, 16)}-${segment.slice(16, 20)}-${segment.slice(20)}`.toLowerCase();
  let parsedSegment;
  try {
    parsedSegment = tenantSegment(organizationId);
  } catch {
    throw new ProviderCampaignError('SECRET_REFERENCE_INVALID');
  }
  if (parsedSegment !== segment) {
    throw new ProviderCampaignError('SECRET_REFERENCE_INVALID');
  }
  return Object.freeze({ provider, organizationId, secretRefName });
};

const assertSecretReference = ({ provider, organizationId, secretRefName }) => {
  const reference = parseProviderSecretReferenceName({ provider, secretRefName });
  if (reference.organizationId !== organizationId.toLowerCase()) {
    throw new ProviderCampaignError('SECRET_REFERENCE_INVALID');
  }
};

export const createProviderCampaignBudget = input => {
  const limits = Object.freeze({
    calls: requireBoundedInteger(input.calls, HARD_CAMPAIGN_CEILINGS.calls, 'CAMPAIGN_LIMIT_INVALID'),
    inputTokens: requireBoundedInteger(input.inputTokens, HARD_CAMPAIGN_CEILINGS.inputTokens, 'CAMPAIGN_LIMIT_INVALID'),
    outputTokens: requireBoundedInteger(input.outputTokens, HARD_CAMPAIGN_CEILINGS.outputTokens, 'CAMPAIGN_LIMIT_INVALID'),
    totalTokens: requireBoundedInteger(input.totalTokens, HARD_CAMPAIGN_CEILINGS.totalTokens, 'CAMPAIGN_LIMIT_INVALID'),
    estimatedUsd: requireBoundedNumber(input.estimatedUsd, HARD_CAMPAIGN_CEILINGS.estimatedUsd, 'CAMPAIGN_LIMIT_INVALID'),
  });
  let reservedCalls = 0;
  let reservedInputTokens = 0;
  let reservedOutputTokens = 0;
  let reservedEstimatedUsd = 0;
  let serial = Promise.resolve();
  const reservations = new Map();

  const locked = operation => {
    const result = serial.then(operation, operation);
    serial = result.then(() => undefined, () => undefined);
    return result;
  };

  return Object.freeze({
    limits,
    reserve: ({ inputTokens, outputTokens, estimatedUsd }) => locked(() => {
      const input = requirePositiveInteger(inputTokens, 'CAMPAIGN_RESERVATION_INVALID');
      const output = requireBoundedInteger(
        outputTokens,
        HARD_CAMPAIGN_CEILINGS.perCallOutputTokens,
        'CAMPAIGN_RESERVATION_INVALID',
      );
      const estimated = requireBoundedNumber(
        estimatedUsd,
        HARD_CAMPAIGN_CEILINGS.estimatedUsd,
        'CAMPAIGN_RESERVATION_INVALID',
      );
      if (
        reservedCalls + 1 > limits.calls
        || reservedInputTokens + input > limits.inputTokens
        || reservedOutputTokens + output > limits.outputTokens
        || reservedInputTokens + reservedOutputTokens + input + output > limits.totalTokens
        || reservedEstimatedUsd + estimated > limits.estimatedUsd
      ) throw new ProviderCampaignError('CAMPAIGN_BUDGET_EXHAUSTED');
      const id = crypto.randomUUID();
      reservedCalls += 1;
      reservedInputTokens += input;
      reservedOutputTokens += output;
      reservedEstimatedUsd += estimated;
      reservations.set(id, Object.freeze({ inputTokens: input, outputTokens: output, estimatedUsd: estimated }));
      return id;
    }),
    verifyUsage: ({ reservationId, inputTokens, outputTokens, estimatedUsd }) => locked(() => {
      const reservation = reservations.get(reservationId);
      if (!reservation) throw new ProviderCampaignError('CAMPAIGN_RESERVATION_INVALID');
      const actualInput = requirePositiveInteger(inputTokens, 'PROVIDER_USAGE_INVALID');
      const actualOutput = requirePositiveInteger(outputTokens, 'PROVIDER_USAGE_INVALID');
      const actualEstimatedUsd = requireBoundedNumber(
        estimatedUsd,
        HARD_CAMPAIGN_CEILINGS.estimatedUsd,
        'PROVIDER_USAGE_INVALID',
      );
      if (
        actualInput > reservation.inputTokens
        || actualOutput > reservation.outputTokens
        || actualEstimatedUsd > reservation.estimatedUsd
      ) {
        throw new ProviderCampaignError('PROVIDER_USAGE_EXCEEDED_RESERVATION');
      }
      reservations.delete(reservationId);
      return Object.freeze({ inputTokens: actualInput, outputTokens: actualOutput, estimatedUsd: actualEstimatedUsd });
    }),
    snapshot: () => Object.freeze({
      calls: reservedCalls,
      inputTokens: reservedInputTokens,
      outputTokens: reservedOutputTokens,
      totalTokens: reservedInputTokens + reservedOutputTokens,
      estimatedUsd: reservedEstimatedUsd,
    }),
  });
};

const safeUsage = body => {
  const usage = body && typeof body === 'object' && body.usage && typeof body.usage === 'object'
    ? body.usage
    : {};
  const inputTokens = Number(usage.prompt_tokens);
  const outputTokens = Number(usage.completion_tokens);
  const totalTokens = Number(usage.total_tokens);
  if (
    !Number.isSafeInteger(inputTokens)
    || inputTokens < 1
    || !Number.isSafeInteger(outputTokens)
    || outputTokens < 1
    || (Number.isFinite(totalTokens) && totalTokens !== inputTokens + outputTokens)
  ) throw new ProviderCampaignError('PROVIDER_USAGE_INVALID');
  return { inputTokens, outputTokens };
};

const calculateEstimatedUsd = ({ inputTokens, outputTokens, pricing }) => {
  const inputRate = requireBoundedNumber(pricing?.inputUsdPerMillion, 1_000, 'PROVIDER_PRICING_INVALID');
  const outputRate = requireBoundedNumber(pricing?.outputUsdPerMillion, 1_000, 'PROVIDER_PRICING_INVALID');
  return (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000;
};

const assertExpectedProviderOutput = body => {
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new ProviderCampaignError('PROVIDER_RESPONSE_INVALID');
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ProviderCampaignError('PROVIDER_ASSERTION_FAILED');
  }
  if (
    !parsed
    || typeof parsed !== 'object'
    || Array.isArray(parsed)
    || Object.keys(parsed).length !== 1
    || parsed.status !== 'ok'
  ) throw new ProviderCampaignError('PROVIDER_ASSERTION_FAILED');
};

const assertProviderModel = (body, requestedModel) => {
  const actual = typeof body?.model === 'string' ? body.model : '';
  if (actual !== requestedModel && !actual.startsWith(`${requestedModel}-`)) {
    throw new ProviderCampaignError('PROVIDER_MODEL_MISMATCH');
  }
};

export const runSanitizedProviderDiagnostic = async ({
  provider,
  organizationId,
  workspaceId,
  secretRefName,
  model,
  budget,
  readSecret,
  fetchImpl,
  maxOutputTokens = 64,
  maxInputTokens = 128,
  pricing,
  timeoutMs = 30_000,
}) => {
  const contract = PROVIDER_CONTRACTS[provider];
  if (!contract || !workspaceId?.trim() || !model?.trim()) {
    throw new ProviderCampaignError('CAMPAIGN_SCOPE_INVALID');
  }
  assertSecretReference({ provider, organizationId, secretRefName });
  const apiKey = await readSecret(secretRefName);
  if (typeof apiKey !== 'string' || apiKey.trim().length < 8) {
    throw new ProviderCampaignError('SECRET_UNAVAILABLE');
  }
  const prompt = 'Return exactly the JSON object {"status":"ok"}.';
  const reservation = Object.freeze({
    inputTokens: requireBoundedInteger(
      maxInputTokens,
      HARD_CAMPAIGN_CEILINGS.inputTokens,
      'CAMPAIGN_RESERVATION_INVALID',
    ),
    outputTokens: requireBoundedInteger(
      maxOutputTokens,
      HARD_CAMPAIGN_CEILINGS.perCallOutputTokens,
      'CAMPAIGN_RESERVATION_INVALID',
    ),
    estimatedUsd: calculateEstimatedUsd({
      inputTokens: maxInputTokens,
      outputTokens: maxOutputTokens,
      pricing,
    }),
  });
  const reservationId = await budget.reserve(reservation);
  let response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requireBoundedInteger(timeoutMs, 60_000, 'CAMPAIGN_TIMEOUT_INVALID'));
  try {
    response = await fetchImpl(contract.endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model.trim(),
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: reservation.outputTokens,
        tools: [],
        tool_choice: 'none',
        parallel_tool_calls: false,
        store: false,
        ...(provider === 'groq' ? { reasoning_effort: 'low' } : {}),
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'avalaos_provider_diagnostic',
            strict: true,
            schema: {
              type: 'object',
              properties: { status: { type: 'string', enum: ['ok'] } },
              required: ['status'],
              additionalProperties: false,
            },
          },
        },
      }),
    });
  } catch {
    throw new ProviderCampaignError('PROVIDER_TRANSPORT_FAILED');
  } finally {
    clearTimeout(timeout);
  }
  if (!response || response.ok !== true) throw new ProviderCampaignError('PROVIDER_REQUEST_REJECTED');
  let body;
  try {
    body = await response.json();
  } catch {
    throw new ProviderCampaignError('PROVIDER_RESPONSE_INVALID');
  }
  assertProviderModel(body, model.trim());
  assertExpectedProviderOutput(body);
  const tokenUsage = safeUsage(body);
  const usage = await budget.verifyUsage({
    reservationId,
    ...tokenUsage,
    estimatedUsd: calculateEstimatedUsd({ ...tokenUsage, pricing }),
  });
  return Object.freeze({
    provider,
    model: model.trim(),
    evidencePath: contract.evidencePath,
    status: 'passed',
    httpStatus: Number(response.status),
    requestCount: 1,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.inputTokens + usage.outputTokens,
    estimatedUsd: usage.estimatedUsd,
    rawOutputRetained: false,
  });
};

export const runSerialProviderDiagnostics = async ({ diagnostics, budget }) => {
  const results = [];
  for (const diagnostic of diagnostics) {
    results.push(await runSanitizedProviderDiagnostic({ ...diagnostic, budget }));
  }
  const actualTotals = results.reduce((totals, result) => ({
    calls: totals.calls + result.requestCount,
    inputTokens: totals.inputTokens + result.inputTokens,
    outputTokens: totals.outputTokens + result.outputTokens,
    totalTokens: totals.totalTokens + result.totalTokens,
    estimatedUsd: totals.estimatedUsd + result.estimatedUsd,
  }), { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedUsd: 0 });
  return Object.freeze({
    schemaVersion: 'full-platform-provider-diagnostics-v1',
    execution: 'serial',
    results,
    actualTotals: Object.freeze(actualTotals),
    reservedBudget: budget.snapshot(),
    rawOutputRetained: false,
  });
};

export const providerCampaignHardCeilings = HARD_CAMPAIGN_CEILINGS;
