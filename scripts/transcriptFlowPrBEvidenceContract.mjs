import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { calculatePrBWorkingTreeDigest, validatePrBProvenance } from './transcriptFlowPrBEvidenceScope.mjs';

export const MARKER_PREFIX = 'PR_B_ASSERTION ';
export const REGISTRY_VERSION = 'governed-multisource-studio-pr-b-registry-1';
export const EVIDENCE_VERSION = 'governed-multisource-studio-pr-b-evidence-1';
export const COMMAND_RESULTS_VERSION = 'governed-multisource-studio-pr-b-command-results-1';
export const MANIFEST_VERSION = 'governed-multisource-studio-pr-b-manifest-1';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const canonicalSourceSha256 = file => sha256(readFileSync(file, 'utf8').replace(/\r\n?/gu, '\n'));

const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const canonicalize = value => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
};
export const canonicalJson = value => JSON.stringify(canonicalize(value));
export const runtimeContextSha256 = value => sha256(canonicalJson(value));
const markerKey = marker => `${marker.testId}|${marker.assertionId}|${marker.fixture}|${marker.result}`;
const assertionKey = assertion => `${assertion.commandId}|${markerKey(assertion)}`;
const exactKeys = (value, keys, code) => assert.deepEqual(Object.keys(value || {}).sort(), [...keys].sort(), code);
const sortedUnique = (values, code) => {
  assert.equal(Array.isArray(values), true, code);
  assert.deepEqual(values, [...new Set(values)].sort(), code);
};

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const POSTGRES_RUNTIME_MATCHERS = new Set(['$uuidV4', '$sha256']);
const PERFORMANCE_RUNTIME_MATCHERS = new Set(['$integer', '$numberArray']);
const RUNTIME_MATCHERS = new Set([...POSTGRES_RUNTIME_MATCHERS, ...PERFORMANCE_RUNTIME_MATCHERS]);

const runtimeMatcherKey = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  return keys.length === 1 && RUNTIME_MATCHERS.has(keys[0]) ? keys[0] : null;
};

const validateExpectedLineageValue = (value, commandId, label, matcherLeafAllowed = true) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateExpectedLineageValue(item, commandId, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const keys = Object.keys(value);
  const matcherKeys = keys.filter(key => key.startsWith('$'));
  if (matcherKeys.length > 0) {
    assert.equal(matcherLeafAllowed, true, `PR_B_RUNTIME_MATCHER_PLACEMENT:${label}`);
    assert.equal(keys.length, 1, `PR_B_RUNTIME_MATCHER_SHAPE:${label}`);
    const matcher = keys[0];
    assert.equal(RUNTIME_MATCHERS.has(matcher), true, `PR_B_RUNTIME_MATCHER_UNKNOWN:${label}:${matcher}`);
    if (POSTGRES_RUNTIME_MATCHERS.has(matcher)) {
      assert.equal(commandId, 'pr-b-postgres', `PR_B_RUNTIME_MATCHER_COMMAND:${label}:${matcher}`);
      assert.equal(value[matcher], true, `PR_B_RUNTIME_MATCHER_VALUE:${label}:${matcher}`);
      return;
    }
    assert.equal(['pr-b-browser', 'pr-b-performance'].includes(commandId), true, `PR_B_RUNTIME_MATCHER_COMMAND:${label}:${matcher}`);
    if (matcher === '$integer') {
      exactKeys(value.$integer, ['min', 'maxExclusive'], `PR_B_RUNTIME_INTEGER_MATCHER:${label}`);
      assert.equal(Number.isInteger(value.$integer.min), true, `PR_B_RUNTIME_INTEGER_MATCHER_MIN:${label}`);
      assert.equal(Number.isInteger(value.$integer.maxExclusive), true, `PR_B_RUNTIME_INTEGER_MATCHER_MAX:${label}`);
      assert.ok(value.$integer.min < value.$integer.maxExclusive, `PR_B_RUNTIME_INTEGER_MATCHER_RANGE:${label}`);
      return;
    }
    exactKeys(value.$numberArray, ['length', 'min', 'maxExclusive'], `PR_B_RUNTIME_NUMBER_ARRAY_MATCHER:${label}`);
    assert.equal(Number.isInteger(value.$numberArray.length) && value.$numberArray.length >= 0, true, `PR_B_RUNTIME_NUMBER_ARRAY_MATCHER_LENGTH:${label}`);
    assert.equal(typeof value.$numberArray.min, 'number', `PR_B_RUNTIME_NUMBER_ARRAY_MATCHER_MIN:${label}`);
    assert.equal(typeof value.$numberArray.maxExclusive, 'number', `PR_B_RUNTIME_NUMBER_ARRAY_MATCHER_MAX:${label}`);
    assert.ok(value.$numberArray.min < value.$numberArray.maxExclusive, `PR_B_RUNTIME_NUMBER_ARRAY_MATCHER_RANGE:${label}`);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    validateExpectedLineageValue(item, commandId, `${label}.${key}`);
  }
};

const AUTH_ASSERTION_OWNER_PATHS = new Set([
  'supabase/functions/_shared/enterpriseIntelligenceCommand.test.ts',
  'supabase/functions/_shared/studioArtifactCommand.test.ts',
]);

export const EXPECTED_COMMANDS = [
  { id: 'typecheck-browser', command: 'npm run typecheck', environment: 'controlled-node-22' },
  { id: 'typecheck-edge', command: 'npm run typecheck:edge', environment: 'controlled-node-22' },
  { id: 'pr-b-domain', command: 'npm run test:transcript-flow:studio-domain', environment: 'controlled-mocked' },
  { id: 'pr-b-api', command: 'npm run test:transcript-flow:studio-api', environment: 'controlled-mocked' },
  { id: 'pr-b-provider', command: 'npm run test:transcript-flow:studio-provider', environment: 'controlled-mocked-provider' },
  { id: 'pr-b-client', command: 'npm run test:transcript-flow:studio-client', environment: 'controlled-node-22' },
  { id: 'pr-b-postgres', command: 'npm run test:transcript-flow:studio-postgres', environment: 'controlled-postgresql-16', requiredEnvironment: ['TRANSCRIPT_FLOW_PR_B_MIGRATION_DATABASE_URL'] },
  { id: 'pr-b-browser', command: 'npm run test:transcript-flow:studio-browser', environment: 'controlled-browser-two-profile' },
  { id: 'pr-b-a11y', command: 'npm run test:transcript-flow:studio-a11y', environment: 'controlled-browser-two-profile' },
  { id: 'pr-b-performance', command: 'npm run test:transcript-flow:studio-performance', environment: 'controlled-browser-two-profile' },
  { id: 'pr-b-coverage', command: 'npm run test:transcript-flow:studio-coverage', environment: 'controlled-node-22' },
  { id: 'pr-b-adversarial', command: 'npm run test:transcript-flow:studio-adversarial', environment: 'controlled-mocked-provider' },
  { id: 'pr-b-evidence-contract', command: 'npm run test:transcript-flow:studio-evidence-contract', environment: 'controlled-node-22' },
  { id: 'pr-a-domain', command: 'npm run test:transcript-flow:domain', environment: 'controlled-mocked' },
  { id: 'pr-a-api', command: 'npm run test:transcript-flow:api', environment: 'controlled-mocked' },
  { id: 'pr-a-provider', command: 'npm run test:transcript-flow:providers', environment: 'controlled-mocked-provider' },
  { id: 'pr-a-postgres', command: 'npm run test:transcript-flow:postgres', environment: 'controlled-postgresql-16', requiredEnvironment: ['TRANSCRIPT_FLOW_MIGRATION_DATABASE_URL'] },
  { id: 'pr-a-browser', command: 'npm run test:transcript-flow:browser', environment: 'controlled-browser-two-profile' },
  { id: 'pr-a-coverage', command: 'npm run test:transcript-flow:coverage', environment: 'controlled-node-22' },
  { id: 'pr-a-evidence-contract', command: 'npm run test:transcript-flow:evidence-contract', environment: 'controlled-node-22' },
  { id: 'studio-source', command: 'npm run test:studio-artifacts', environment: 'controlled-mocked-provider' },
  { id: 'studio-coverage', command: 'npm run test:studio-artifacts-coverage', environment: 'controlled-node-22' },
  { id: 'studio-postgres', command: 'npm run test:migrations:studio-artifacts', environment: 'controlled-postgresql-16', requiredEnvironment: ['STUDIO_ARTIFACT_MIGRATION_DATABASE_URL'] },
  { id: 'studio-browser', command: 'npm run test:browser:studio-artifacts', environment: 'controlled-browser' },
  { id: 'studio-private-source', command: 'npm run test:studio-private-artifacts', environment: 'controlled-mocked' },
  { id: 'studio-private-coverage', command: 'npm run test:studio-private-artifacts-coverage', environment: 'controlled-node-22' },
  { id: 'studio-private-postgres', command: 'npm run test:migrations:studio-private-artifacts', environment: 'controlled-postgresql-16', requiredEnvironment: ['STUDIO_PRIVATE_ARTIFACT_MIGRATION_DATABASE_URL'] },
  { id: 'studio-private-browser', command: 'npm run test:browser:studio-private-artifacts', environment: 'controlled-browser' },
  { id: 'enterprise-source', command: 'npm run test:enterprise-intelligence', environment: 'controlled-mocked-provider' },
  { id: 'enterprise-provider', command: 'npm run test:enterprise-intelligence-provider', environment: 'controlled-mocked-provider' },
  { id: 'enterprise-postgres', command: 'npm run test:migrations:enterprise-intelligence:postgres', environment: 'controlled-postgresql-16', requiredEnvironment: ['ENTERPRISE_INTELLIGENCE_MIGRATION_DATABASE_URL', 'STUDIO_ARTIFACT_MIGRATION_DATABASE_URL'] },
  { id: 'enterprise-browser', command: 'npm run test:browser:enterprise-intelligence', environment: 'controlled-browser' },
  { id: 'pilot-source', command: 'npm run test:pilot-operations', environment: 'controlled-node-22' },
  { id: 'pilot-postgres', command: 'npm run test:migrations:pilot-operations', environment: 'controlled-postgresql-16', requiredEnvironment: ['PILOT_OPERATIONS_DATABASE_URL'] },
  { id: 'pilot-recovery', command: 'npm run test:recovery:pilot-operations', environment: 'controlled-postgresql-16', requiredEnvironment: ['PILOT_OPERATIONS_DATABASE_URL'] },
  { id: 'pilot-browser', command: 'npm run test:browser:pilot-operations', environment: 'controlled-browser' },
  { id: 'pr1d-source', command: 'npm run test:pr1d', environment: 'controlled-node-22', requiredEnvironment: ['PR1D_MIGRATION_DATABASE_URL'] },
  { id: 'pr1d-postgres', command: 'npm run test:migrations:pr1d', environment: 'controlled-postgresql-16', requiredEnvironment: ['PR1D_MIGRATION_DATABASE_URL'] },
  { id: 'pr1d-browser', command: 'npm run test:browser:pr1d', environment: 'controlled-browser' },
  { id: 'pr1e-source', command: 'npm run test:pr1e', environment: 'controlled-node-22' },
  { id: 'pr1e-postgres', command: 'npm run test:migrations:pr1e', environment: 'controlled-postgresql-16', requiredEnvironment: ['PR1E_MIGRATION_DATABASE_URL'] },
  { id: 'pr1e-browser', command: 'npm run test:browser:pr1e', environment: 'controlled-browser' },
  { id: 'pr1f-source', command: 'npm run test:pr1f', environment: 'controlled-node-22' },
  { id: 'pr1f-browser', command: 'npm run test:browser:pr1f', environment: 'controlled-browser' },
  { id: 'pr1g-source', command: 'npm run test:pr1g', environment: 'controlled-node-22' },
  { id: 'pr1g-postgres', command: 'npm run test:migrations:pr1g', environment: 'controlled-postgresql-16', requiredEnvironment: ['DATABASE_URL'] },
  { id: 'pr1g-browser', command: 'npm run test:browser:pr1g', environment: 'controlled-browser' },
  { id: 'platform-provider-mocked', command: 'npm run test:full-platform:provider-mocked', environment: 'controlled-mocked-provider' },
  { id: 'platform-campaign', command: 'npm run test:full-platform:campaign', environment: 'controlled-node-22' },
  { id: 'platform-browser-contracts', command: 'npm run test:full-platform:browser-contracts', environment: 'controlled-node-22' },
  { id: 'platform-browser', command: 'npm run test:browser:full-platform', environment: 'controlled-browser' },
  { id: 'acceptance-catalog', command: 'npm run test:acceptance:catalog', environment: 'controlled-node-22' },
  { id: 'scoring-regression', command: 'npm run test:scoring', environment: 'controlled-node-22' },
  { id: 'workflow-static', command: 'npm run test:workflow-yaml', environment: 'controlled-node-22' },
  { id: 'ai-boundary-static', command: 'npm run test:ai-boundary-static', environment: 'controlled-node-22' },
  { id: 'secret-hygiene', command: 'npm run test:secret-hygiene', environment: 'controlled-node-22' },
  { id: 'repository-test', command: 'npm test', environment: 'controlled-node-22' },
  { id: 'audit', command: 'npm audit --audit-level=moderate', environment: 'controlled-node-22' },
  { id: 'build', command: 'npm run build', environment: 'controlled-node-22' },
  { id: 'diff-check', command: 'git diff --check', environment: 'controlled-git' },
  { id: 'scoring-drift', command: 'git diff --exit-code 11e670003a73b0ab5a28650b70afac4b267760f4 -- services/scoringEngine.ts services/scoringEngine.test.ts scripts/runScoringRegression.mjs', environment: 'controlled-git' },
];

const requiredIds = [
  'PATH-001', 'PATH-002', 'PATH-005', 'PATH-006', 'PATH-007', 'PATH-008',
  'SRCSET-004', 'SRCSET-006', 'SRCSET-008',
  ...Array.from({ length: 10 }, (_, index) => `STUDIO-TR-${String(index + 1).padStart(3, '0')}`),
  ...Array.from({ length: 8 }, (_, index) => `HANDOFF-${String(index + 1).padStart(3, '0')}`),
  ...Array.from({ length: 4 }, (_, index) => `AUTH-${String(index + 1).padStart(3, '0')}`),
  'IDEMP-001', 'IDEMP-002-B', 'IDEMP-003', 'BUDGET-001', 'BUDGET-002',
  ...Array.from({ length: 8 }, (_, index) => `PROVIDER-${String(index + 1).padStart(3, '0')}`),
  'PROVIDER-009-B', 'INJECTION-001',
  ...Array.from({ length: 4 }, (_, index) => `A11Y-${String(index + 1).padStart(3, '0')}`),
  'PERF-001', ...Array.from({ length: 6 }, (_, index) => `MIGRATION-${String(index + 1).padStart(3, '0')}`),
  ...Array.from({ length: 3 }, (_, index) => `COMPAT-${String(index + 1).padStart(3, '0')}`),
].sort();

export const REQUIRED_NOT_RUN_IDS = [
  'PATH-003', 'PATH-004',
  ...Array.from({ length: 6 }, (_, index) => `DELIVERY-TR-${String(index + 1).padStart(3, '0')}`),
  ...Array.from({ length: 4 }, (_, index) => `MONITOR-TR-${String(index + 1).padStart(3, '0')}`),
  'PERF-002-B', 'PERF-003', 'PERF-004',
].sort();

const loadCapabilityInventory = root => {
  const capabilities = new Set();
  const directory = path.join(root, 'supabase/migrations');
  for (const name of readdirSync(directory).filter(item => item.endsWith('.sql')).sort()) {
    const source = readFileSync(path.join(directory, name), 'utf8');
    for (const block of source.matchAll(/INSERT\s+INTO\s+public\.capabilities\s*\([^)]*capability_key[^)]*\)\s*VALUES([\s\S]*?)(?:ON\s+CONFLICT|;)/giu)) {
      for (const tuple of block[1].matchAll(/\(\s*'([^']+)'\s*,/gu)) capabilities.add(tuple[1]);
    }
  }
  assert.ok(capabilities.size > 0, 'PR_B_CAPABILITY_INVENTORY_EMPTY');
  return capabilities;
};

const validateSafeRuntimeValue = (value, label) => {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return;
  if (typeof value === 'string') {
    assert.ok(value.length <= 512, `PR_B_RUNTIME_STRING_BOUNDED:${label}`);
    assert.doesNotMatch(value, /(?:postgres(?:ql)?:\/\/|Bearer\s+|sk-[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{12,}|X-Amz-(?:Credential|Signature)|[?&](?:sig|token|key)=)/iu, `PR_B_RUNTIME_SECRET:${label}`);
    return;
  }
  if (Array.isArray(value)) {
    assert.ok(value.length <= 100, `PR_B_RUNTIME_ARRAY_BOUNDED:${label}`);
    value.forEach((item, index) => validateSafeRuntimeValue(item, `${label}[${index}]`));
    return;
  }
  assert.equal(typeof value, 'object', `PR_B_RUNTIME_VALUE_TYPE:${label}`);
  assert.ok(Object.keys(value).length <= 40, `PR_B_RUNTIME_OBJECT_BOUNDED:${label}`);
  for (const [key, item] of Object.entries(value)) validateSafeRuntimeValue(item, `${label}.${key}`);
};

const validateRuntimeContext = (context, capabilityInventory, label) => {
  exactKeys(context, ['persona', 'organizationId', 'workspaceId', 'lineage'], `PR_B_RUNTIME_CONTEXT_FIELDS:${label}`);
  exactKeys(context.persona, ['id', 'state', 'capabilities'], `PR_B_RUNTIME_PERSONA_FIELDS:${label}`);
  assert.ok(['active', 'revoked', 'revoked-then-restored', 'stale', 'unauthorized'].includes(context.persona.state), `PR_B_RUNTIME_PERSONA_STATE:${label}`);
  sortedUnique(context.persona.capabilities, `PR_B_RUNTIME_CAPABILITIES_ORDER:${label}`);
  for (const capability of context.persona.capabilities) {
    assert.equal(capabilityInventory.has(capability), true, `PR_B_RUNTIME_CAPABILITY_UNKNOWN:${label}:${capability}`);
  }
  assert.equal(typeof context.organizationId, 'string', `PR_B_RUNTIME_ORGANIZATION:${label}`);
  assert.equal(typeof context.workspaceId, 'string', `PR_B_RUNTIME_WORKSPACE:${label}`);
  assert.equal(Boolean(context.lineage) && !Array.isArray(context.lineage), true, `PR_B_RUNTIME_LINEAGE:${label}`);
  validateSafeRuntimeValue(context, label);
};

const validateExpectedRuntimeContext = (context, capabilityInventory, commandId, label) => {
  validateRuntimeContext(context, capabilityInventory, label);
  validateExpectedLineageValue(context.lineage, commandId, `${label}.lineage`, false);
};

const runtimeContextMatches = (actual, expected, label) => {
  const matcher = runtimeMatcherKey(expected);
  if (matcher === '$uuidV4') {
    assert.equal(typeof actual, 'string', `PR_B_RUNTIME_UUID_V4_TYPE:${label}`);
    assert.match(actual, UUID_V4_PATTERN, `PR_B_RUNTIME_UUID_V4:${label}`);
    return;
  }
  if (matcher === '$sha256') {
    assert.equal(typeof actual, 'string', `PR_B_RUNTIME_SHA256_TYPE:${label}`);
    assert.match(actual, SHA256_PATTERN, `PR_B_RUNTIME_SHA256:${label}`);
    return;
  }
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && Object.keys(expected).length === 1 && expected.$integer) {
    exactKeys(expected.$integer, ['min', 'maxExclusive'], `PR_B_RUNTIME_INTEGER_MATCHER:${label}`);
    assert.equal(Number.isInteger(actual), true, `PR_B_RUNTIME_INTEGER:${label}`);
    assert.ok(actual >= expected.$integer.min && actual < expected.$integer.maxExclusive, `PR_B_RUNTIME_INTEGER_RANGE:${label}`);
    return;
  }
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && Object.keys(expected).length === 1 && expected.$numberArray) {
    exactKeys(expected.$numberArray, ['length', 'min', 'maxExclusive'], `PR_B_RUNTIME_NUMBER_ARRAY_MATCHER:${label}`);
    assert.equal(Array.isArray(actual), true, `PR_B_RUNTIME_NUMBER_ARRAY:${label}`);
    assert.equal(actual.length, expected.$numberArray.length, `PR_B_RUNTIME_NUMBER_ARRAY_LENGTH:${label}`);
    for (const value of actual) {
      assert.equal(typeof value, 'number', `PR_B_RUNTIME_NUMBER_ARRAY_VALUE:${label}`);
      assert.ok(value >= expected.$numberArray.min && value < expected.$numberArray.maxExclusive, `PR_B_RUNTIME_NUMBER_ARRAY_RANGE:${label}`);
    }
    return;
  }
  if (Array.isArray(expected)) {
    assert.equal(Array.isArray(actual), true, `PR_B_RUNTIME_ARRAY:${label}`);
    assert.equal(actual.length, expected.length, `PR_B_RUNTIME_ARRAY_LENGTH:${label}`);
    expected.forEach((item, index) => runtimeContextMatches(actual[index], item, `${label}[${index}]`));
    return;
  }
  if (expected && typeof expected === 'object') {
    assert.equal(Boolean(actual) && typeof actual === 'object' && !Array.isArray(actual), true, `PR_B_RUNTIME_OBJECT:${label}`);
    exactKeys(actual, Object.keys(expected), `PR_B_RUNTIME_OBJECT_FIELDS:${label}`);
    for (const [key, item] of Object.entries(expected)) runtimeContextMatches(actual[key], item, `${label}.${key}`);
    return;
  }
  assert.equal(actual, expected, `PR_B_RUNTIME_VALUE_MISMATCH:${label}`);
};

export const loadEvidenceContract = root => {
  const registryPath = path.join(root, 'testing/process-lifecycle/contracts/pr-b-assertion-registry.json');
  const registry = readJson(registryPath);
  const provenance = readJson(path.join(root, registry.provenancePath));
  const fixtures = readJson(path.join(root, registry.fixtureRegistryPath));
  return { registry, provenance, fixtures };
};

export const validateEvidenceContract = (root, supplied = loadEvidenceContract(root), options = {}) => {
  const contract = structuredClone(supplied);
  const { registry, fixtures } = contract;
  assert.equal(registry.contractVersion, REGISTRY_VERSION, 'PR_B_REGISTRY_VERSION');
  assert.equal(registry.workflowPath, '.github/workflows/transcript-flow-pr-b.yml', 'PR_B_WORKFLOW_PATH');
  assert.deepEqual(registry.commands, EXPECTED_COMMANDS, 'PR_B_COMMAND_SOURCE_CONTRACT');
  assert.equal(new Set(registry.commands.map(item => item.id)).size, registry.commands.length, 'PR_B_COMMAND_ID_DUPLICATE');
  assert.equal(new Set(registry.commands.map(item => item.command)).size, registry.commands.length, 'PR_B_COMMAND_STRING_DUPLICATE');
  assert.equal(fixtures.contractVersion, 'governed-multisource-studio-pr-b-fixtures-1', 'PR_B_FIXTURE_VERSION');
  const fixtureMap = new Map(fixtures.fixtures.map(item => [item.id, item]));
  assert.equal(fixtureMap.size, fixtures.fixtures.length, 'PR_B_FIXTURE_DUPLICATE');
  for (const fixture of fixtures.fixtures) {
    exactKeys(fixture, ['id', 'oracle', 'sourcePaths'], `PR_B_FIXTURE_FIELDS:${fixture.id}`);
    assert.ok(fixture.oracle, `PR_B_FIXTURE_ORACLE:${fixture.id}`);
    assert.ok(fixture.sourcePaths.length > 0, `PR_B_FIXTURE_SOURCES:${fixture.id}`);
    for (const relative of fixture.sourcePaths) assert.equal(existsSync(path.join(root, relative)), true, `PR_B_FIXTURE_SOURCE_MISSING:${fixture.id}:${relative}`);
  }
  const capabilityInventory = loadCapabilityInventory(root);
  const commandIds = new Set(registry.commands.map(item => item.id));
  const assertionKeys = new Set();
  const usedFixtures = new Set();
  for (const [ownerKey, owner] of Object.entries(registry.owners)) {
    exactKeys(owner, ['path', 'sha256'], `PR_B_OWNER_FIELDS:${ownerKey}`);
    const absolute = path.join(root, owner.path);
    assert.equal(existsSync(absolute), true, `PR_B_OWNER_PATH:${ownerKey}`);
    assert.equal(owner.sha256, canonicalSourceSha256(absolute), `PR_B_OWNER_HASH:${ownerKey}`);
  }
  for (const assertion of registry.assertions) {
    exactKeys(assertion, ['commandId', 'owner', 'testId', 'assertionId', 'fixture', 'testName', 'expectedRuntimeContext'], `PR_B_ASSERTION_FIELDS:${assertion.testId}`);
    assert.equal(commandIds.has(assertion.commandId), true, `PR_B_ASSERTION_COMMAND:${assertion.commandId}`);
    assert.equal(Boolean(registry.owners[assertion.owner]), true, `PR_B_ASSERTION_OWNER:${assertion.owner}`);
    assert.equal(fixtureMap.has(assertion.fixture), true, `PR_B_ASSERTION_FIXTURE:${assertion.fixture}`);
    assert.ok(assertion.testName, `PR_B_ASSERTION_TEST_NAME:${assertion.testId}`);
    assert.ok(/^[A-Z0-9-]+$/u.test(assertion.testId), `PR_B_TEST_ID:${assertion.testId}`);
    const key = assertionKey({ ...assertion, result: 'passed' });
    assert.equal(assertionKeys.has(key), false, `PR_B_ASSERTION_DUPLICATE:${key}`);
    assertionKeys.add(key); usedFixtures.add(assertion.fixture);
    validateExpectedRuntimeContext(assertion.expectedRuntimeContext, capabilityInventory, assertion.commandId, `${assertion.commandId}:${assertion.assertionId}`);
  }
  for (const fixture of fixtureMap.keys()) assert.equal(usedFixtures.has(fixture), true, `PR_B_FIXTURE_DEAD:${fixture}`);
  const passedIds = [...new Set(registry.assertions.map(item => item.testId))].sort();
  for (const required of requiredIds) assert.equal(passedIds.includes(required), true, `PR_B_REQUIRED_ASSERTION_MISSING:${required}`);
  const notRunIds = registry.notRun.map(item => item.testId).sort();
  assert.deepEqual(notRunIds, REQUIRED_NOT_RUN_IDS, 'PR_B_NOT_RUN_EXACT_SET');
  assert.equal(new Set(notRunIds).size, notRunIds.length, 'PR_B_NOT_RUN_DUPLICATE');
  for (const item of registry.notRun) {
    exactKeys(item, ['testId', 'owner', 'testName', 'reason'], `PR_B_NOT_RUN_FIELDS:${item.testId}`);
    assert.equal(Boolean(registry.owners[item.owner]), true, `PR_B_NOT_RUN_OWNER:${item.owner}`);
    assert.ok(item.reason, `PR_B_NOT_RUN_REASON:${item.testId}`);
    assert.equal(passedIds.includes(item.testId), false, `PR_B_PASSED_AND_NOT_RUN:${item.testId}`);
  }
  for (const assertion of registry.assertions.filter(item => item.testId.startsWith('AUTH-'))) {
    assert.equal(assertion.commandId, 'pr-b-api', `PR_B_AUTH_COMMAND_OWNER:${assertion.testId}`);
    const ownerPath = registry.owners[assertion.owner]?.path;
    assert.equal(AUTH_ASSERTION_OWNER_PATHS.has(ownerPath), true, `PR_B_AUTH_SOURCE_OWNER:${assertion.testId}`);
  }
  for (const assertion of registry.assertions.filter(item => item.testId.startsWith('A11Y-'))) {
    assert.ok(['pr-b-browser', 'pr-b-a11y'].includes(assertion.commandId), `PR_B_A11Y_COMMAND_OWNER:${assertion.testId}`);
  }
  for (const assertion of registry.assertions.filter(item => item.testId === 'PERF-001')) {
    assert.ok(
      ['pr-b-browser', 'pr-b-performance'].includes(assertion.commandId),
      `PR_B_PERF_COMMAND_OWNER:${assertion.commandId}`,
    );
  }
  if (!options.skipProvenance) validatePrBProvenance(root, options.baseGitSha || '11e670003a73b0ab5a28650b70afac4b267760f4', registry, contract.provenance);
  return { ...contract, fixtureMap, capabilityInventory };
};

export const parseExactMarkers = output => output.split(/\r?\n/gu)
  .map(line => line.startsWith(`# ${MARKER_PREFIX}`) ? line.slice(2) : line)
  .filter(line => line.startsWith(MARKER_PREFIX))
  .map(line => {
    const marker = JSON.parse(line.slice(MARKER_PREFIX.length));
    exactKeys(marker, ['testId', 'assertionId', 'fixture', 'result', 'runtimeContext'], 'PR_B_MARKER_FIELDS');
    assert.equal(marker.result, 'passed', `PR_B_MARKER_RESULT:${marker.testId}`);
    return marker;
  });

export const validateCommandMarkers = (validated, commandId, markers) => {
  const expected = validated.registry.assertions.filter(item => item.commandId === commandId);
  const expectedMap = new Map(expected.map(item => [markerKey({ ...item, result: 'passed' }), item]));
  const seen = new Set();
  for (const marker of markers) {
    const key = markerKey(marker);
    assert.equal(seen.has(key), false, `PR_B_MARKER_DUPLICATE:${commandId}:${key}`);
    seen.add(key);
    const registered = expectedMap.get(key);
    assert.ok(registered, `PR_B_MARKER_UNREGISTERED:${commandId}:${key}`);
    validateRuntimeContext(marker.runtimeContext, validated.capabilityInventory, `${commandId}:${marker.assertionId}`);
    runtimeContextMatches(marker.runtimeContext, registered.expectedRuntimeContext, `${commandId}:${marker.assertionId}`);
  }
  assert.equal(markers.length, expected.length, `PR_B_MARKER_COUNT:${commandId}`);
  for (const key of expectedMap.keys()) assert.equal(seen.has(key), true, `PR_B_MARKER_MISSING:${commandId}:${key}`);
};

export const assertSanitized = (value, label = 'evidence') => {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  assert.doesNotMatch(serialized, /(?:postgres(?:ql)?:\/\/|Bearer\s+|sk-[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{12,}|X-Amz-(?:Credential|Signature)|[?&](?:sig|token|key)=|rawProviderPayload|rawSourceText)/iu, `PR_B_UNSANITIZED:${label}`);
};

export const buildAssertionEvidence = (validated, registered, marker, commandRecordDigest) => {
  const owner = validated.registry.owners[registered.owner];
  return {
    marker,
    markerDigest: sha256(canonicalJson(marker)),
    runtimeContext: marker.runtimeContext,
    runtimeContextDigest: runtimeContextSha256(marker.runtimeContext),
    assertionOwner: { path: owner.path, sha256: owner.sha256, testName: registered.testName },
    commandRecordDigest,
    facts: { assertionId: marker.assertionId, fixture: marker.fixture, sanitized: true, executed: true },
  };
};

export const buildNotRunEvidence = (validated, item) => {
  const owner = validated.registry.owners[item.owner];
  return {
    marker: null,
    assertionOwner: { path: owner.path, sha256: owner.sha256, testName: item.testName },
    facts: { sanitized: true, executed: false, reason: item.reason },
  };
};

export const validateEvidenceResultCardinality = (results, manifest, validated) => {
  const passed = results.filter(item => item.result === 'passed');
  const notRun = results.filter(item => item.result === 'not_run');
  const passedKeys = passed.map(item => `${item.command?.id || ''}|${markerKey(item.assertion?.marker || {})}`);
  assert.equal(new Set(passedKeys).size, passedKeys.length, 'PR_B_PASSED_EVIDENCE_DUPLICATE');
  assert.equal(passed.length, validated.registry.assertions.length, 'PR_B_PASSED_EVIDENCE_COUNT');
  const expectedPassed = validated.registry.assertions.map(item => assertionKey({ ...item, result: 'passed' })).sort();
  assert.deepEqual(passedKeys.sort(), expectedPassed, 'PR_B_PASSED_EVIDENCE_EXACT_SET');
  const notRunIds = notRun.map(item => item.testId);
  assert.equal(new Set(notRunIds).size, notRunIds.length, 'PR_B_NOT_RUN_EVIDENCE_DUPLICATE');
  assert.deepEqual(notRunIds.sort(), REQUIRED_NOT_RUN_IDS, 'PR_B_NOT_RUN_EVIDENCE_EXACT_SET');
  assert.equal(manifest.assertionCount, passed.length + notRun.length, 'PR_B_MANIFEST_ASSERTION_COUNT');
};

export const validateEvidenceDirectory = (root, evidenceDir, expected = {}) => {
  assert.equal(existsSync(evidenceDir), true, 'PR_B_EVIDENCE_DIRECTORY_MISSING');
  const manifest = readJson(path.join(evidenceDir, 'manifest.json'));
  const commands = readJson(path.join(evidenceDir, 'command-results.json'));
  const validated = validateEvidenceContract(root, undefined, { baseGitSha: manifest.baseGitSha });
  const changedFiles = validatePrBProvenance(root, manifest.baseGitSha, validated.registry, validated.provenance);
  const digest = calculatePrBWorkingTreeDigest(root, changedFiles);
  assert.equal(manifest.contractVersion, MANIFEST_VERSION, 'PR_B_MANIFEST_VERSION');
  assert.equal(manifest.baseGitSha, expected.baseGitSha, 'PR_B_BASE_SHA_MISMATCH');
  assert.equal(manifest.headGitSha, expected.headGitSha, 'PR_B_HEAD_SHA_MISMATCH');
  assert.equal(manifest.workingTreeDigest, expected.workingTreeDigest || digest, 'PR_B_TREE_DIGEST_MISMATCH');
  assert.equal(manifest.workingTreeDigest, digest, 'PR_B_TREE_DIGEST_STALE');
  assert.equal(manifest.workflow.path, validated.registry.workflowPath, 'PR_B_WORKFLOW_PATH_MISMATCH');
  if (expected.runId !== undefined) assert.equal(manifest.workflow.runId, expected.runId, 'PR_B_WORKFLOW_RUN_ID_STALE');
  if (expected.runAttempt !== undefined) assert.equal(manifest.workflow.runAttempt, expected.runAttempt, 'PR_B_WORKFLOW_ATTEMPT_STALE');
  const boundDirectory = path.join(root, 'output', 'process-lifecycle-pr-b', manifest.baseGitSha, digest, manifest.runAttempt);
  assert.equal(path.resolve(evidenceDir), path.resolve(boundDirectory), 'PR_B_EVIDENCE_PATH_UNBOUND');
  assert.equal(commands.contractVersion, COMMAND_RESULTS_VERSION, 'PR_B_COMMAND_RESULTS_VERSION');
  assert.equal(commands.baseGitSha, manifest.baseGitSha, 'PR_B_COMMAND_BASE_SHA');
  assert.equal(commands.headGitSha, manifest.headGitSha, 'PR_B_COMMAND_HEAD_SHA');
  assert.equal(commands.workingTreeDigest, digest, 'PR_B_COMMAND_TREE_DIGEST');
  assert.deepEqual(commands.workflow, manifest.workflow, 'PR_B_COMMAND_WORKFLOW');
  assert.equal(commands.commands.length, validated.registry.commands.length, 'PR_B_COMMAND_RESULT_COUNT');
  for (const command of validated.registry.commands) {
    const record = commands.commands.find(item => item.id === command.id);
    assert.ok(record, `PR_B_COMMAND_RESULT_MISSING:${command.id}`);
    assert.equal(record.command, command.command, `PR_B_COMMAND_RESULT_SUBSTITUTED:${command.id}`);
    assert.equal(record.environment, command.environment, `PR_B_COMMAND_ENVIRONMENT:${command.id}`);
    assert.equal(record.status, 'passed', `PR_B_COMMAND_STATUS:${command.id}`);
    assert.ok(Number.isInteger(record.durationMs) && record.durationMs >= 0, `PR_B_COMMAND_DURATION:${command.id}`);
    validateCommandMarkers(validated, command.id, record.markers);
  }
  const evidenceFiles = readdirSync(evidenceDir).filter(name => name.endsWith('.evidence.json')).sort();
  assert.deepEqual(evidenceFiles, [...manifest.evidenceFiles].sort(), 'PR_B_EVIDENCE_FILE_MANIFEST');
  const results = [];
  for (const name of evidenceFiles) {
    const source = readFileSync(path.join(evidenceDir, name), 'utf8');
    assertSanitized(source, name);
    const document = JSON.parse(source);
    assert.equal(document.contractVersion, EVIDENCE_VERSION, `PR_B_EVIDENCE_VERSION:${name}`);
    assert.equal(document.baseGitSha, manifest.baseGitSha, `PR_B_EVIDENCE_BASE:${name}`);
    assert.equal(document.headGitSha, manifest.headGitSha, `PR_B_EVIDENCE_HEAD:${name}`);
    assert.equal(document.workingTreeDigest, digest, `PR_B_EVIDENCE_TREE:${name}`);
    assert.deepEqual(document.workflow, manifest.workflow, `PR_B_EVIDENCE_WORKFLOW:${name}`);
    if (document.result === 'not_run') {
      const boundary = validated.registry.notRun.find(item => item.testId === document.testId);
      assert.ok(boundary, `PR_B_NOT_RUN_UNREGISTERED:${name}`);
      assert.deepEqual(document.assertion, buildNotRunEvidence(validated, boundary), `PR_B_NOT_RUN_ASSERTION:${name}`);
    } else {
      assert.equal(document.result, 'passed', `PR_B_RESULT:${name}`);
      const record = commands.commands.find(item => item.id === document.command.id);
      assert.ok(record, `PR_B_EVIDENCE_COMMAND:${name}`);
      const registered = validated.registry.assertions.find(item => item.commandId === document.command.id && markerKey({ ...item, result: 'passed' }) === markerKey(document.assertion.marker));
      assert.ok(registered, `PR_B_EVIDENCE_ASSERTION_UNREGISTERED:${name}`);
      const recordDigest = sha256(canonicalJson(record));
      assert.equal(document.command.commandRecordDigest, recordDigest, `PR_B_COMMAND_RECORD_DIGEST:${name}`);
      assert.deepEqual(document.assertion, buildAssertionEvidence(validated, registered, document.assertion.marker, recordDigest), `PR_B_EVIDENCE_ASSERTION:${name}`);
    }
    results.push(document);
  }
  validateEvidenceResultCardinality(results, manifest, validated);
  return { manifest, commands, results };
};
