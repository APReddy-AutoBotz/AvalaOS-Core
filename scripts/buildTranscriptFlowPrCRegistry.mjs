import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  expectedPrCCommandRegistry,
  PR_C_FIXTURE_PATH,
  PR_C_PERSONA_PATH,
  PR_C_PROVENANCE_PATH,
  PR_C_REGISTRY_PATH,
  validatePrCRegistryStructure,
} from './transcriptFlowPrCEvidenceContract.mjs';
import {
  canonicalFileSha256,
  collectChangedPrCFiles,
  PR_C_BASE_SHA,
  PR_C_WORKFLOW_PATH,
} from './transcriptFlowPrCEvidenceScope.mjs';
import {
  PR_C_GITHUB_CLASSIFICATION,
  PR_C_LOCAL_CLASSIFICATION,
} from './transcriptFlowPrCExecutionIdentity.mjs';

const ALL_EXECUTION_CLASSIFICATIONS = [PR_C_GITHUB_CLASSIFICATION, PR_C_LOCAL_CLASSIFICATION];

const root = process.cwd();
const refreshBindingsOnly = process.argv.includes('--refresh-bindings');
const selectedCommandIds = [
  'pr-c-domain',
  'pr-c-client',
  'pr-c-api',
  'pr-c-postgres',
  'pr-c-browser',
  'pr-c-a11y',
  'pr-c-performance',
  'pr-c-coverage',
  'pr-c-evidence-contract',
];

const ownerPaths = {
  'migration-static': 'scripts/checkGovernedDeliveryMonitorPrCMigrationContract.mjs',
  postgres: 'scripts/testTranscriptFlowPrCPostgres.mjs',
  domain: 'services/deliveryMonitor/contracts.test.ts',
  'pagination-domain': 'services/deliveryMonitor/pagination.test.ts',
  client: 'services/deliveryMonitor/commands.test.ts',
  'client-transport': 'services/enterpriseIntelligenceClient.prC.test.ts',
  'api-command': 'supabase/functions/_shared/deliveryMonitorCommand.test.ts',
  'api-query': 'supabase/functions/_shared/deliveryMonitorQuery.test.ts',
  browser: 'tests/browser/deliveryMonitorPrC/deliveryMonitorPrC.spec.ts',
  'browser-scope': 'tests/browser/enterpriseIntelligencePrCScope.spec.ts',
  boundary: 'docs/quality/governed-delivery-monitor-pr-c-evidence.md',
};

const notRun = [
  {
    testId: 'PERF-003', owner: 'boundary', testName: 'PostgreSQL duration budget', command: null,
    reason: 'No AP-approved numeric PostgreSQL duration budget exists; the PostgreSQL 16 functional, isolation, concurrency, and recovery assertions are executed under their owned Test IDs.',
    applicableExecutionClassifications: ALL_EXECUTION_CLASSIFICATIONS,
  },
  {
    testId: 'PERF-004', owner: 'boundary', testName: 'End-to-end resource budget', command: null,
    reason: 'No AP-approved memory, provider-call, reservation, or token budget exists; bounded 250-item behavior and provider-mock safety are tested without inventing a numeric gate.',
    applicableExecutionClassifications: ALL_EXECUTION_CLASSIFICATIONS,
  },
  {
    testId: 'CONTROLLED-HUMAN', owner: 'boundary', testName: 'Controlled human walkthrough', command: null,
    reason: 'Sanitized seed identities and the walkthrough are prepared, but an authenticated controlled-human session has not been scheduled or executed and therefore remains not_run.',
    applicableExecutionClassifications: ALL_EXECUTION_CLASSIFICATIONS,
  },
  {
    testId: 'EXACT-HEAD-GITHUB-CI', owner: 'boundary', testName: 'Exact-head GitHub Actions candidate execution', command: null,
    reason: 'A local candidate bundle cannot establish exact-head GitHub Actions execution; only a canonical github_candidate identity derived from GitHub Actions may report this boundary as executed.',
    applicableExecutionClassifications: [PR_C_LOCAL_CLASSIFICATION],
  },
  {
    testId: 'NETLIFY-HOSTED-PREVIEW', owner: 'boundary', testName: 'Netlify hosted preview', command: null,
    reason: 'The PR C evidence workflow does not execute or inspect a Netlify preview, so hosted-preview behavior remains not_run for both local and GitHub candidate bundles.',
    applicableExecutionClassifications: ALL_EXECUTION_CLASSIFICATIONS,
  },
  {
    testId: 'REAL-PROVIDER-VERIFICATION', owner: 'boundary', testName: 'Real AI provider verification', command: null,
    reason: 'Real provider execution was not separately authorized or safely budgeted; deterministic provider mocks retain the boundary without exposing credentials.',
    applicableExecutionClassifications: ALL_EXECUTION_CLASSIFICATIONS,
  },
  {
    testId: 'DEPLOYMENT-VERIFICATION', owner: 'boundary', testName: 'Deployment verification', command: null,
    reason: 'No deployment or live-infrastructure inspection is authorized for PR C, so deployment state and behavior remain unverified.',
    applicableExecutionClassifications: ALL_EXECUTION_CLASSIFICATIONS,
  },
  {
    testId: 'SECURITY-CERTIFICATION', owner: 'boundary', testName: 'External security certification', command: null,
    reason: 'Source review and adversarial automated tests do not constitute an external security certification; certification remains outside this PR boundary.',
    applicableExecutionClassifications: ALL_EXECUTION_CLASSIFICATIONS,
  },
  {
    testId: 'COMPLIANCE-CERTIFICATION', owner: 'boundary', testName: 'Compliance certification', command: null,
    reason: 'PR C adds no unsupported compliance claim, and no independent compliance audit or certification has been performed.',
    applicableExecutionClassifications: ALL_EXECUTION_CLASSIFICATIONS,
  },
];

const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};

const markerKey = (commandId, marker) => [commandId, marker.owner, marker.testId, marker.assertionId, marker.fixture].join('|');

const parseMarkers = (commandId, output) => output.split(/\r?\n/gu).flatMap(line => {
  const match = line.trim().match(/^(?:#\s*)?PR_C_ASSERTION\s+(\{.*\})$/u);
  if (!match) return [];
  const marker = JSON.parse(match[1]);
  const fields = ['assertionId', 'fixture', 'owner', 'result', 'runtimeContext', 'testId'];
  assert(JSON.stringify(Object.keys(marker).sort()) === JSON.stringify(fields), `PR_C_BUILD_MARKER_FIELDS:${commandId}`);
  assert(marker.result === 'passed', `PR_C_BUILD_MARKER_RESULT:${commandId}:${marker.testId}`);
  return [marker];
});

const execute = (command, commandId) => {
  for (const required of command.requiredEnvironment || []) {
    assert(process.env[required], `PR_C_BUILD_REQUIRED_ENVIRONMENT:${commandId}:${required}`);
  }
  const markerCommand = commandId === 'pr-c-evidence-contract'
    ? 'node scripts/checkGovernedDeliveryMonitorPrCMigrationContract.mjs'
    : command.command;
  const [executable, ...args] = markerCommand.split(' ');
  const options = {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PR_C_EVIDENCE_COMMAND_ID: commandId },
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  };
  if (process.platform === 'win32' && (executable === 'npm' || executable === 'npm.cmd')) {
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', ['npm.cmd', ...args].join(' ')], options);
  }
  return spawnSync(executable, args, options);
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const sha256Pattern = /^[0-9a-f]{64}$/iu;
const postgresFixtureIdPrefixes = ['300000', '960000', '970000'];

const normalizePostgresGeneratedValues = value => {
  if (Array.isArray(value)) return value.map(normalizePostgresGeneratedValues);
  if (value && typeof value === 'object') {
    const normalized = Object.fromEntries(Object.entries(value).map(([key, nested]) => [
      key,
      key === 'concurrentRequestOutcome'
        ? { $oneOf: ['fulfilled', 'rejected'] }
        : normalizePostgresGeneratedValues(nested),
    ]));
    if (Array.isArray(value.eligibleReceiptIds)) {
      const eligibleReceiptIds = [...value.eligibleReceiptIds].sort();
      assert(eligibleReceiptIds.length > 0, 'PR_C_BUILD_ELIGIBLE_RECEIPT_IDS_EMPTY');
      assert(eligibleReceiptIds.every(receiptId => typeof receiptId === 'string' && uuidPattern.test(receiptId)), 'PR_C_BUILD_ELIGIBLE_RECEIPT_ID_INVALID');
      assert(new Set(eligibleReceiptIds).size === eligibleReceiptIds.length, 'PR_C_BUILD_ELIGIBLE_RECEIPT_ID_DUPLICATE');
      assert(eligibleReceiptIds.includes(value.id), 'PR_C_BUILD_RECEIPT_WINNER_NOT_ELIGIBLE');
      normalized.id = { $oneOf: eligibleReceiptIds };
    }
    return normalized;
  }
  if (typeof value === 'string' && uuidPattern.test(value) && !postgresFixtureIdPrefixes.some(prefix => value.startsWith(prefix))) {
    return { $uuid: true };
  }
  if (typeof value === 'string' && sha256Pattern.test(value)) return { $sha256: true };
  return value;
};

const normalizeRuntimeContext = (context, commandId) => {
  const expected = commandId === 'pr-c-postgres'
    ? normalizePostgresGeneratedValues(context)
    : structuredClone(context);
  const performanceEvidence = expected.performance;
  if (!performanceEvidence || typeof performanceEvidence !== 'object') return expected;
  if (Array.isArray(performanceEvidence.samplesMs)) {
    performanceEvidence.samplesMs = { $finiteNonNegativeArray: { length: performanceEvidence.samplesMs.length } };
  }
  if (typeof performanceEvidence.medianMs === 'number') {
    performanceEvidence.medianMs = { $number: { min: 0, maxExclusive: performanceEvidence.budgetMs } };
  }
  if (typeof performanceEvidence.p95Ms === 'number') {
    performanceEvidence.p95Ms = { $number: { min: 0, maxExclusive: performanceEvidence.budgetMs } };
  }
  if (typeof performanceEvidence.maxMs === 'number') {
    performanceEvidence.maxMs = { $finiteNonNegative: true };
  }
  if (Array.isArray(performanceEvidence.samples)) {
    performanceEvidence.samples = performanceEvidence.samples.map(sample => ({ ...sample, ms: { $finiteNonNegative: true } }));
  }
  return expected;
};

const commands = expectedPrCCommandRegistry(root);
const commandsById = new Map(commands.map(command => [command.id, command]));
const seen = new Set();
const assertions = refreshBindingsOnly
  ? JSON.parse(readFileSync(path.join(root, PR_C_REGISTRY_PATH), 'utf8')).assertions
  : [];

for (const commandId of refreshBindingsOnly ? [] : selectedCommandIds) {
  const command = commandsById.get(commandId);
  assert(command, `PR_C_BUILD_COMMAND_UNKNOWN:${commandId}`);
  process.stdout.write(`[PR C registry] ${commandId}\n`);
  const result = execute(command, commandId);
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(`PR_C_BUILD_COMMAND_FAILED:${commandId}:${result.status}`);
  }
  const markers = [...parseMarkers(commandId, result.stdout || ''), ...parseMarkers(commandId, result.stderr || '')];
  assert(markers.length > 0, `PR_C_BUILD_MARKERS_MISSING:${commandId}`);
  for (const marker of markers) {
    const key = markerKey(commandId, marker);
    assert(!seen.has(key), `PR_C_BUILD_MARKER_DUPLICATE:${key}`);
    assert(Object.hasOwn(ownerPaths, marker.owner), `PR_C_BUILD_OWNER_UNKNOWN:${marker.owner}`);
    seen.add(key);
    assertions.push({
      commandId,
      owner: marker.owner,
      testId: marker.testId,
      assertionId: marker.assertionId,
      fixture: marker.fixture,
      testName: `${marker.testId} — ${marker.assertionId.replaceAll('-', ' ')}`,
      expectedRuntimeContext: normalizeRuntimeContext(marker.runtimeContext, commandId),
    });
  }
  process.stdout.write(`[PR C registry] ${commandId}: ${markers.length} assertion markers\n`);
}
if (refreshBindingsOnly) process.stdout.write(`[PR C registry] refreshed bindings for ${assertions.length} previously executed assertion markers\n`);

const owners = Object.fromEntries(Object.entries(ownerPaths).map(([owner, relative]) => {
  const absolute = path.join(root, relative);
  assert(existsSync(absolute), `PR_C_BUILD_OWNER_MISSING:${owner}:${relative}`);
  return [owner, { path: relative, sha256: canonicalFileSha256(absolute) }];
}));

const registry = {
  contractVersion: 'governed-delivery-monitor-pr-c-registry-2',
  workflowPath: PR_C_WORKFLOW_PATH,
  provenancePath: PR_C_PROVENANCE_PATH,
  fixtureRegistryPath: PR_C_FIXTURE_PATH,
  personasRegistryPath: PR_C_PERSONA_PATH,
  commands,
  owners,
  assertions,
  notRun,
};
writeFileSync(path.join(root, PR_C_REGISTRY_PATH), `${JSON.stringify(registry, null, 2)}\n`, 'utf8');

const changed = collectChangedPrCFiles(root);
assert(!changed.some(relative => relative.startsWith('supabase/.temp/')), 'PR_C_BUILD_GENERATED_SUPABASE_TEMP');
const sourceDigests = Object.fromEntries(changed
  .filter(relative => relative !== PR_C_PROVENANCE_PATH)
  .map(relative => [relative, `sha256:${canonicalFileSha256(path.join(root, relative))}`]));
const provenance = {
  contractVersion: 'governed-delivery-monitor-pr-c-provenance-1',
  acceptedMainBaseline: PR_C_BASE_SHA,
  sourceDigests,
};
writeFileSync(path.join(root, PR_C_PROVENANCE_PATH), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');

const result = validatePrCRegistryStructure(root, registry, provenance);
console.log(`PR C registry and provenance generated: ${JSON.stringify(result)}`);
