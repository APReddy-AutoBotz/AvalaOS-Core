import fs from 'node:fs';
import path from 'node:path';

import {
  ProviderCampaignError,
  createProviderCampaignBudget,
  parseProviderSecretReferenceName,
  runSerialProviderDiagnostics,
} from './fullPlatformProviderHarness.mjs';

const root = process.cwd();
const gate = 'I_UNDERSTAND_LOCAL_DIAGNOSTIC_ONLY';
const workspaceId = '66666666-6666-4666-8666-666666666666';
const runId = process.env.FULL_PLATFORM_RUN_ID ?? '';
const headSha = process.env.FULL_PLATFORM_HEAD_SHA ?? '';

const fail = code => {
  throw new ProviderCampaignError(code);
};

if (process.env.FULL_PLATFORM_LIVE_PROVIDER_DIAGNOSTICS !== gate) fail('LIVE_DIAGNOSTIC_GATE_CLOSED');
if (!/^[a-z0-9][a-z0-9-]{7,79}$/u.test(runId)) fail('CAMPAIGN_RUN_ID_INVALID');
if (!/^[0-9a-f]{40}$/u.test(headSha)) fail('CAMPAIGN_HEAD_SHA_INVALID');

const parseSecretFile = (relativePath, provider) => {
  const absolutePath = path.join(root, relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  const entries = [];
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/u);
    if (!match) fail('SECRET_FILE_FORMAT_INVALID');
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    entries.push({ secretRefName: match[1], value });
  }
  if (entries.length !== 1) fail('SECRET_FILE_VARIABLE_INVALID');
  const [{ secretRefName, value }] = entries;
  const reference = parseProviderSecretReferenceName({ provider, secretRefName });
  if (typeof value !== 'string' || value.length < 8 || /\r|\n/u.test(value)) fail('SECRET_UNAVAILABLE');
  return Object.freeze({ ...reference, value });
};

const openaiSecret = parseSecretFile('.env.openai.local', 'openai');
const groqSecret = parseSecretFile('.env.groq.local', 'groq');
if (openaiSecret.organizationId !== groqSecret.organizationId) fail('SECRET_SCOPE_MISMATCH');
const organizationId = openaiSecret.organizationId;
const secretRefs = { openai: openaiSecret.secretRefName, groq: groqSecret.secretRefName };
const secrets = new Map([
  [secretRefs.openai, openaiSecret.value],
  [secretRefs.groq, groqSecret.value],
]);
const readSecret = async secretRefName => {
  const value = secrets.get(secretRefName);
  if (!value) fail('SECRET_UNAVAILABLE');
  return value;
};

const outputDirectory = path.join(root, 'output', 'full-platform', runId);
const writeSanitized = (fileName, value) => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, fileName), `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
};

const priceSources = Object.freeze([
  {
    provider: 'openai',
    model: 'gpt-4.1-nano',
    checkedAt: '2026-08-24',
    source: 'https://developers.openai.com/api/docs/models/gpt-4.1-nano',
    inputUsdPerMillion: 0.10,
    outputUsdPerMillion: 0.40,
  },
  {
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    checkedAt: '2026-08-24',
    source: 'https://console.groq.com/docs/model/openai/gpt-oss-20b',
    inputUsdPerMillion: 0.075,
    outputUsdPerMillion: 0.30,
  },
]);

const budget = createProviderCampaignBudget({
  calls: 2,
  inputTokens: 256,
  outputTokens: 192,
  totalTokens: 448,
  estimatedUsd: 0.001,
});

try {
  const report = await runSerialProviderDiagnostics({
    budget,
    diagnostics: priceSources.map(source => ({
      provider: source.provider,
      organizationId,
      workspaceId,
      secretRefName: secretRefs[source.provider],
      model: source.model,
      maxInputTokens: 128,
      maxOutputTokens: source.provider === 'groq' ? 128 : 64,
      pricing: {
        inputUsdPerMillion: source.inputUsdPerMillion,
        outputUsdPerMillion: source.outputUsdPerMillion,
      },
      timeoutMs: 30_000,
      readSecret,
      fetchImpl: fetch,
    })),
  });
  writeSanitized('provider-diagnostics.json', {
    schemaVersion: 'avalaos-local-provider-diagnostics/v1',
    evidenceBoundary: 'local_nonproduction_diagnostic_not_pr255_acceptance',
    headSha,
    runId,
    execution: 'serial_no_retry',
    syntheticScope: { organizationId, workspaceId },
    hardCeilings: { calls: 2, inputTokens: 256, outputTokens: 192, totalTokens: 448, estimatedUsd: 0.001 },
    priceSources,
    report,
    retainedSensitiveValues: false,
  });
  console.log(`Provider diagnostics passed: ${report.results.length} serial calls; sanitized proof written under output/full-platform/${runId}/.`);
} catch (error) {
  const code = error instanceof ProviderCampaignError ? error.code : 'UNEXPECTED_PROVIDER_DIAGNOSTIC_FAILURE';
  writeSanitized('provider-diagnostics-blocked.json', {
    schemaVersion: 'avalaos-local-provider-diagnostics/v1',
    evidenceBoundary: 'local_nonproduction_diagnostic_not_pr255_acceptance',
    headSha,
    runId,
    status: 'blocked',
    failureCode: code,
    retainedSensitiveValues: false,
  });
  console.error(`Provider diagnostics blocked: ${code}`);
  process.exitCode = 1;
} finally {
  secrets.clear();
}
