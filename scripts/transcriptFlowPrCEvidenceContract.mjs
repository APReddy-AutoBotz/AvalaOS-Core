import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFileSha256, PR_C_BASE_SHA, PR_C_WORKFLOW_PATH, validatePrCProvenance } from './transcriptFlowPrCEvidenceScope.mjs';
import {
  PR_C_EXECUTION_CLASSIFICATIONS,
  PR_C_GITHUB_CLASSIFICATION,
  PR_C_LOCAL_CLASSIFICATION,
} from './transcriptFlowPrCExecutionIdentity.mjs';

export const PR_C_REGISTRY_PATH = 'testing/process-lifecycle/contracts/pr-c-assertion-registry.json';
export const PR_C_PROVENANCE_PATH = 'testing/process-lifecycle/contracts/pr-c-source-provenance.json';
export const PR_C_FIXTURE_PATH = 'testing/process-lifecycle/fixtures/delivery-monitor-pr-c/fixture-registry.json';
export const PR_C_PERSONA_PATH = 'testing/process-lifecycle/fixtures/delivery-monitor-pr-c/personas.json';
export const PR_C_REGISTRY_VERSION = 'governed-delivery-monitor-pr-c-registry-2';
export const PR_C_EVIDENCE_VERSION = 'governed-delivery-monitor-pr-c-assertion-evidence-2';
export const PR_C_COMMAND_RESULTS_VERSION = 'governed-delivery-monitor-pr-c-command-results-2';
export const PR_C_MANIFEST_VERSION = 'governed-delivery-monitor-pr-c-evidence-2';
export const PR_C_SOURCE_RECORD_VERSION = 'governed-delivery-monitor-pr-c-source-record-1';

const REQUIRED_TEST_IDS = [
  ...Array.from({ length: 6 }, (_, index) => `DELIVERY-TR-00${index + 1}`),
  ...Array.from({ length: 4 }, (_, index) => `MONITOR-TR-00${index + 1}`),
  'PATH-003',
  'PATH-004',
  ...Array.from({ length: 8 }, (_, index) => `HANDOFF-00${index + 1}`),
  'PERF-001',
  'PERF-002-B',
];

const EXACT_NOT_RUN = new Set([
  'PERF-003',
  'PERF-004',
  'CONTROLLED-HUMAN',
  'EXACT-HEAD-GITHUB-CI',
  'NETLIFY-HOSTED-PREVIEW',
  'REAL-PROVIDER-VERIFICATION',
  'DEPLOYMENT-VERIFICATION',
  'SECURITY-CERTIFICATION',
  'COMPLIANCE-CERTIFICATION',
]);

const PR_C_FOCUSED_COMMANDS = [
  { id: 'pr-c-domain', command: 'npm run test:transcript-flow:delivery-monitor-domain', environment: 'controlled-node-22' },
  { id: 'pr-c-client', command: 'npm run test:transcript-flow:delivery-monitor-client', environment: 'controlled-node-22' },
  { id: 'pr-c-api', command: 'npm run test:transcript-flow:delivery-monitor-api', environment: 'controlled-node-22' },
  { id: 'pr-c-postgres', command: 'npm run test:transcript-flow:delivery-monitor-postgres', environment: 'controlled-postgresql-16', requiredEnvironment: ['TRANSCRIPT_FLOW_PR_C_MIGRATION_DATABASE_URL'] },
  { id: 'pr-c-browser', command: 'npm run test:transcript-flow:delivery-monitor-browser', environment: 'controlled-browser-two-profile' },
  { id: 'pr-c-a11y', command: 'npm run test:transcript-flow:delivery-monitor-a11y', environment: 'controlled-browser-two-profile' },
  { id: 'pr-c-performance', command: 'npm run test:transcript-flow:delivery-monitor-performance', environment: 'controlled-browser-two-profile' },
  { id: 'pr-c-coverage', command: 'npm run test:transcript-flow:delivery-monitor-coverage', environment: 'controlled-node-22' },
  { id: 'pr-c-adversarial', command: 'npm run test:transcript-flow:delivery-monitor-adversarial', environment: 'controlled-node-22' },
  { id: 'pr-c-evidence-contract', command: 'npm run test:transcript-flow:delivery-monitor-evidence-contract', environment: 'controlled-node-22' },
  { id: 'pr-c-controlled-human-source', command: 'npm run test:pr-c-controlled-human-source', environment: 'controlled-postgresql-16', requiredEnvironment: ['PR_C_CONTROLLED_HUMAN_TEST_DATABASE_URL'] },
  { id: 'historical-evidence-drift', command: `git diff --exit-code ${PR_C_BASE_SHA} -- testing/process-lifecycle/contracts/pr-a-assertion-registry.json testing/process-lifecycle/contracts/pr-b-assertion-registry.json docs/quality/governed-multisource-transcript-pr-a-evidence.md docs/quality/governed-multisource-studio-pr-b-evidence.md`, environment: 'controlled-git' },
];

export const expectedPrCCommandRegistry = root => {
  const retainedPath = path.join(root, 'testing/process-lifecycle/contracts/pr-b-assertion-registry.json');
  const retained = JSON.parse(readFileSync(retainedPath, 'utf8')).commands.map(command => {
    if (command.id === 'scoring-drift') {
      return { ...command, command: `git diff --exit-code ${PR_C_BASE_SHA} -- services/scoringEngine.ts services/scoringEngine.test.ts scripts/runScoringRegression.mjs` };
    }
    if (command.id === 'pr-b-evidence-contract') {
      return { ...command, command: 'npm run test:transcript-flow:studio-evidence-contract:retained' };
    }
    if (command.id === 'pr-a-evidence-contract') {
      return { ...command, command: 'npm run test:transcript-flow:evidence-contract:retained' };
    }
    return command;
  });
  return [...PR_C_FOCUSED_COMMANDS, ...retained];
};

const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};

export const canonicalPrCJson = value => JSON.stringify(value);
export const prCSha256 = value => createHash('sha256').update(value).digest('hex');
export const prCCanonicalDigest = value => prCSha256(canonicalPrCJson(value));
export const prCCommandRecordDigest = record => {
  const { commandRecordDigest, ...canonicalRecord } = record;
  return prCCanonicalDigest(canonicalRecord);
};

const notApplicable = Object.freeze({ applicability: 'not_applicable', value: null });

export const applicablePrCNotRun = (registry, executionClassification) => registry.notRun.filter(boundary => (
  boundary.applicableExecutionClassifications.includes(executionClassification)
));

export const loadPrCEvidenceBindingCatalog = (root, registry) => {
  const fixturePath = path.join(root, registry.fixtureRegistryPath);
  const personaPath = path.join(root, registry.personasRegistryPath);
  const fixtureRegistry = JSON.parse(readFileSync(fixturePath, 'utf8'));
  return {
    fixtureRegistrySha256: canonicalFileSha256(fixturePath),
    personaRegistrySha256: canonicalFileSha256(personaPath),
    fixtures: new Map(fixtureRegistry.fixtures.map(fixture => [fixture.id, fixture])),
  };
};

const canonicalCommand = command => ({
  id: command.id,
  command: command.command,
  environment: command.environment,
  requiredEnvironment: command.requiredEnvironment || [],
});

export const buildPrCAssertionSourceRecord = ({ registry, bindingCatalog, assertion, observedRuntimeContext, commandRecordDigest }) => {
  const command = registry.commands.find(item => item.id === assertion.commandId);
  const fixture = bindingCatalog.fixtures.get(assertion.fixture);
  assert(command, `PR_C_SOURCE_COMMAND:${assertion.assertionId}`);
  assert(fixture, `PR_C_SOURCE_FIXTURE:${assertion.assertionId}`);
  return {
    contractVersion: PR_C_SOURCE_RECORD_VERSION,
    command: canonicalCommand(command),
    commandRecordDigest,
    source: { owner: assertion.owner, ...registry.owners[assertion.owner] },
    fixture: {
      id: assertion.fixture,
      registryPath: registry.fixtureRegistryPath,
      registrySha256: bindingCatalog.fixtureRegistrySha256,
      recordSha256: prCCanonicalDigest(fixture),
    },
    persona: {
      registryPath: registry.personasRegistryPath,
      registrySha256: bindingCatalog.personaRegistrySha256,
      primaryId: observedRuntimeContext.persona.id,
      participantIds: (observedRuntimeContext.participants || []).map(persona => persona.id),
    },
    test: {
      owner: assertion.owner,
      testId: assertion.testId,
      assertionId: assertion.assertionId,
      testName: assertion.testName,
    },
    expectedRuntimeContext: assertion.expectedRuntimeContext,
    observedRuntimeContext,
  };
};

export const buildPrCNotRunSourceRecord = ({ registry, boundary }) => ({
  contractVersion: PR_C_SOURCE_RECORD_VERSION,
  command: notApplicable,
  commandRecordDigest: notApplicable,
  source: { owner: boundary.owner, ...registry.owners[boundary.owner] },
  fixture: notApplicable,
  persona: notApplicable,
  runtimeContext: notApplicable,
  test: {
    owner: boundary.owner,
    testId: boundary.testId,
    assertionId: notApplicable,
    testName: boundary.testName,
  },
  boundary,
});

const unique = (values, code) => {
  assert(new Set(values).size === values.length, code);
};

const sortedUnique = (values, code) => {
  assert(Array.isArray(values), code);
  assert(JSON.stringify(values) === JSON.stringify([...new Set(values)].sort()), code);
};

const loadCapabilityInventory = root => {
  const capabilities = new Set();
  const directory = path.join(root, 'supabase/migrations');
  for (const name of readdirSync(directory).filter(item => item.endsWith('.sql')).sort()) {
    const source = readFileSync(path.join(directory, name), 'utf8');
    for (const block of source.matchAll(/INSERT\s+INTO\s+public\.capabilities\s*\([^)]*capability_key[^)]*\)\s*VALUES([\s\S]*?)(?:ON\s+CONFLICT|;)/giu)) {
      for (const tuple of block[1].matchAll(/\(\s*'([^']+)'\s*,/gu)) capabilities.add(tuple[1]);
    }
  }
  assert(capabilities.size > 0, 'PR_C_CAPABILITY_INVENTORY_EMPTY');
  return capabilities;
};

const validatePersonaCatalog = (root, registry, capabilityInventory) => {
  assert(registry.personasRegistryPath === PR_C_PERSONA_PATH, 'PR_C_REGISTRY_PERSONAS');
  const catalog = JSON.parse(readFileSync(path.join(root, registry.personasRegistryPath), 'utf8'));
  assert(catalog.schemaVersion === 'delivery-monitor-pr-c-personas-1', 'PR_C_PERSONA_VERSION');
  assert(Array.isArray(catalog.organizations) && catalog.organizations.length >= 2, 'PR_C_PERSONA_ORGANIZATIONS');
  assert(Array.isArray(catalog.workspaces) && catalog.workspaces.length >= 3, 'PR_C_PERSONA_WORKSPACES');
  assert(Array.isArray(catalog.personas) && catalog.personas.length > 0, 'PR_C_PERSONAS_REQUIRED');
  unique(catalog.organizations.map(value => value.id), 'PR_C_PERSONA_ORGANIZATION_ID_DUPLICATE');
  unique(catalog.organizations.map(value => value.key), 'PR_C_PERSONA_ORGANIZATION_KEY_DUPLICATE');
  unique(catalog.workspaces.map(value => value.id), 'PR_C_PERSONA_WORKSPACE_ID_DUPLICATE');
  unique(catalog.workspaces.map(value => value.key), 'PR_C_PERSONA_WORKSPACE_KEY_DUPLICATE');
  unique(catalog.personas.map(value => value.id), 'PR_C_PERSONA_ID_DUPLICATE');
  unique(catalog.personas.map(value => value.key), 'PR_C_PERSONA_KEY_DUPLICATE');

  const organizationsById = new Map(catalog.organizations.map(value => [value.id, value]));
  const workspacesById = new Map(catalog.workspaces.map(value => [value.id, value]));
  const workspacesByKey = new Map(catalog.workspaces.map(value => [value.key, value]));
  const personasById = new Map(catalog.personas.map(value => [value.id, value]));
  const personasByKey = new Map(catalog.personas.map(value => [value.key, value]));

  for (const organization of catalog.organizations) {
    assert(typeof organization.id === 'string' && typeof organization.key === 'string' && typeof organization.label === 'string', 'PR_C_PERSONA_ORGANIZATION_FIELDS');
  }
  for (const workspace of catalog.workspaces) {
    assert(typeof workspace.id === 'string' && typeof workspace.key === 'string' && typeof workspace.label === 'string', 'PR_C_PERSONA_WORKSPACE_FIELDS');
    assert(organizationsById.has(workspace.organizationId), `PR_C_PERSONA_WORKSPACE_ORGANIZATION:${workspace.key}`);
  }
  for (const persona of catalog.personas) {
    const keys = ['capabilities', 'evidenceRequired', 'id', 'key', 'label', 'state', 'workspace'];
    assert(JSON.stringify(Object.keys(persona).sort()) === JSON.stringify(keys), `PR_C_PERSONA_FIELDS:${persona.key}`);
    assert(typeof persona.id === 'string' && typeof persona.key === 'string' && typeof persona.label === 'string', `PR_C_PERSONA_IDENTITY:${persona.key}`);
    assert(['active', 'revoked', 'stale', 'unauthorized'].includes(persona.state), `PR_C_PERSONA_STATE:${persona.key}`);
    assert(typeof persona.evidenceRequired === 'boolean', `PR_C_PERSONA_EVIDENCE_REQUIRED:${persona.key}`);
    assert(workspacesByKey.has(persona.workspace), `PR_C_PERSONA_WORKSPACE:${persona.key}`);
    sortedUnique(persona.capabilities, `PR_C_PERSONA_CAPABILITIES_ORDER:${persona.key}`);
    for (const capability of persona.capabilities) {
      assert(capabilityInventory.has(capability), `PR_C_PERSONA_CAPABILITY_UNKNOWN:${persona.key}:${capability}`);
    }
  }

  const dutyKeys = [
    'deliveryApprover', 'deliveryAuthor', 'deliveryConsumer', 'deliveryReviewer',
    'deliveryTargetAcceptor', 'studioApprover', 'studioRequester', 'studioReviewer',
  ];
  assert(catalog.separationOfDuties && JSON.stringify(Object.keys(catalog.separationOfDuties).sort()) === JSON.stringify(dutyKeys), 'PR_C_PERSONA_SEPARATION_FIELDS');
  const dutyPersonas = Object.values(catalog.separationOfDuties);
  unique(dutyPersonas, 'PR_C_PERSONA_SEPARATION_NOT_DISTINCT');
  for (const key of dutyPersonas) assert(personasByKey.has(key), `PR_C_PERSONA_SEPARATION_UNKNOWN:${key}`);

  return {
    organizationsById,
    workspacesById,
    personasById,
    requiredPersonaIds: new Set(catalog.personas.filter(value => value.evidenceRequired).map(value => value.id)),
    personaCount: catalog.personas.length,
  };
};

const validatePersona = (persona, personaCatalog, capabilityInventory, label) => {
  assert(persona && typeof persona === 'object' && !Array.isArray(persona), `PR_C_ASSERTION_PERSONA:${label}`);
  assert(JSON.stringify(Object.keys(persona).sort()) === JSON.stringify(['capabilities', 'id', 'state']), `PR_C_ASSERTION_PERSONA_FIELDS:${label}`);
  assert(typeof persona.id === 'string' && persona.id.length > 0, `PR_C_ASSERTION_PERSONA_ID:${label}`);
  assert(['active', 'revoked', 'stale', 'unauthorized'].includes(persona.state), `PR_C_ASSERTION_PERSONA_STATE:${label}`);
  sortedUnique(persona.capabilities, `PR_C_ASSERTION_CAPABILITIES_ORDER:${label}`);
  for (const capability of persona.capabilities) {
    assert(typeof capability === 'string' && capabilityInventory.has(capability), `PR_C_ASSERTION_CAPABILITY_UNKNOWN:${label}:${capability}`);
  }
  const canonical = personaCatalog.personasById.get(persona.id);
  assert(canonical, `PR_C_ASSERTION_PERSONA_UNREGISTERED:${label}:${persona.id}`);
  assert(persona.state === canonical.state, `PR_C_ASSERTION_PERSONA_STATE_SUBSTITUTED:${label}:${persona.id}`);
  assert(JSON.stringify(persona.capabilities) === JSON.stringify(canonical.capabilities), `PR_C_ASSERTION_PERSONA_CAPABILITIES_SUBSTITUTED:${label}:${persona.id}`);
};

const validateRuntimeContext = (context, capabilityInventory, personaCatalog, label) => {
  assert(context && typeof context === 'object' && !Array.isArray(context), `PR_C_ASSERTION_RUNTIME:${label}`);
  assert(typeof context.organizationId === 'string' && context.organizationId.length > 0, `PR_C_ASSERTION_ORG:${label}`);
  assert(typeof context.workspaceId === 'string' && context.workspaceId.length > 0, `PR_C_ASSERTION_WORKSPACE:${label}`);
  const workspace = personaCatalog.workspacesById.get(context.workspaceId);
  assert(workspace, `PR_C_ASSERTION_WORKSPACE_UNREGISTERED:${label}:${context.workspaceId}`);
  assert(personaCatalog.organizationsById.has(context.organizationId), `PR_C_ASSERTION_ORG_UNREGISTERED:${label}:${context.organizationId}`);
  assert(workspace.organizationId === context.organizationId, `PR_C_ASSERTION_SCOPE_SUBSTITUTED:${label}`);
  validatePersona(context.persona, personaCatalog, capabilityInventory, label);
  if (context.participants !== undefined) {
    assert(Array.isArray(context.participants) && context.participants.length > 0, `PR_C_ASSERTION_PARTICIPANTS:${label}`);
    unique(context.participants.map(value => value?.id), `PR_C_ASSERTION_PARTICIPANTS_DUPLICATE:${label}`);
    for (const [index, participant] of context.participants.entries()) {
      validatePersona(participant, personaCatalog, capabilityInventory, `${label}:participant:${index}`);
    }
  }
};

const exactObjectKeys = (actual, expected, label) => {
  assert(actual && typeof actual === 'object' && !Array.isArray(actual), `PR_C_RUNTIME_OBJECT:${label}`);
  assert(JSON.stringify(Object.keys(actual).sort()) === JSON.stringify(Object.keys(expected).sort()), `PR_C_RUNTIME_OBJECT_FIELDS:${label}`);
};

export const runtimeContextMatches = (actual, expected, label = 'runtimeContext') => {
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && Object.keys(expected).length === 1 && expected.$oneOf) {
    assert(Array.isArray(expected.$oneOf) && expected.$oneOf.length > 0, `PR_C_RUNTIME_ONE_OF_CONTRACT:${label}`);
    assert(new Set(expected.$oneOf.map(value => JSON.stringify(value))).size === expected.$oneOf.length, `PR_C_RUNTIME_ONE_OF_DUPLICATE:${label}`);
    assert(expected.$oneOf.some(value => actual === value), `PR_C_RUNTIME_ONE_OF:${label}`);
    return;
  }
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && Object.keys(expected).length === 1 && expected.$uuid === true) {
    assert(typeof actual === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(actual), `PR_C_RUNTIME_UUID:${label}`);
    return;
  }
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && Object.keys(expected).length === 1 && expected.$sha256 === true) {
    assert(typeof actual === 'string' && /^[0-9a-f]{64}$/iu.test(actual), `PR_C_RUNTIME_SHA256:${label}`);
    return;
  }
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && Object.keys(expected).length === 1 && expected.$finiteNonNegative === true) {
    assert(typeof actual === 'number' && Number.isFinite(actual) && actual >= 0, `PR_C_RUNTIME_FINITE_NONNEGATIVE:${label}`);
    return;
  }
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && Object.keys(expected).length === 1 && expected.$finiteNonNegativeArray) {
    exactObjectKeys(expected.$finiteNonNegativeArray, { length: 0 }, `${label}.$finiteNonNegativeArray`);
    assert(Array.isArray(actual) && actual.length === expected.$finiteNonNegativeArray.length, `PR_C_RUNTIME_FINITE_NONNEGATIVE_ARRAY:${label}`);
    for (const value of actual) assert(typeof value === 'number' && Number.isFinite(value) && value >= 0, `PR_C_RUNTIME_FINITE_NONNEGATIVE_ARRAY_VALUE:${label}`);
    return;
  }
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && Object.keys(expected).length === 1 && expected.$number) {
    exactObjectKeys(expected.$number, { min: 0, maxExclusive: 0 }, `${label}.$number`);
    assert(typeof actual === 'number' && Number.isFinite(actual), `PR_C_RUNTIME_NUMBER:${label}`);
    assert(actual >= expected.$number.min && actual < expected.$number.maxExclusive, `PR_C_RUNTIME_NUMBER_RANGE:${label}`);
    return;
  }
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && Object.keys(expected).length === 1 && expected.$numberArray) {
    exactObjectKeys(expected.$numberArray, { length: 0, min: 0, maxExclusive: 0 }, `${label}.$numberArray`);
    assert(Array.isArray(actual) && actual.length === expected.$numberArray.length, `PR_C_RUNTIME_NUMBER_ARRAY:${label}`);
    for (const value of actual) {
      assert(typeof value === 'number' && Number.isFinite(value), `PR_C_RUNTIME_NUMBER_ARRAY_VALUE:${label}`);
      assert(value >= expected.$numberArray.min && value < expected.$numberArray.maxExclusive, `PR_C_RUNTIME_NUMBER_ARRAY_RANGE:${label}`);
    }
    return;
  }
  if (Array.isArray(expected)) {
    assert(Array.isArray(actual) && actual.length === expected.length, `PR_C_RUNTIME_ARRAY:${label}`);
    expected.forEach((value, index) => runtimeContextMatches(actual[index], value, `${label}[${index}]`));
    return;
  }
  if (expected && typeof expected === 'object') {
    exactObjectKeys(actual, expected, label);
    for (const [key, value] of Object.entries(expected)) runtimeContextMatches(actual[key], value, `${label}.${key}`);
    return;
  }
  assert(actual === expected, `PR_C_RUNTIME_VALUE:${label}`);
};

export const validatePrCSanitized = value => {
  const serialized = JSON.stringify(value);
  assert(!/(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|signed[_-]?url|service[_-]?role|raw[_-]?log|customer[_-]?data)\s*["']?\s*:/iu.test(serialized), 'PR_C_EVIDENCE_SENSITIVE_KEY');
  assert(!/(postgres(?:ql)?:\/\/[^:@/]+:[^@/]+@|sk-(?=[a-z0-9_-]{12,})(?=[a-z0-9_-]*\d)[a-z0-9_-]{12,}|eyJ[a-z0-9_-]{20,}\.)/iu.test(serialized), 'PR_C_EVIDENCE_SECRET_VALUE');
};

export const validatePrCRegistryStructure = (root, registry, provenance, { verifyDigests = true } = {}) => {
  assert(registry.contractVersion === PR_C_REGISTRY_VERSION, 'PR_C_REGISTRY_VERSION');
  assert(registry.workflowPath === PR_C_WORKFLOW_PATH, 'PR_C_REGISTRY_WORKFLOW');
  assert(registry.provenancePath === PR_C_PROVENANCE_PATH, 'PR_C_REGISTRY_PROVENANCE');
  assert(registry.fixtureRegistryPath === PR_C_FIXTURE_PATH, 'PR_C_REGISTRY_FIXTURES');
  assert(registry.personasRegistryPath === PR_C_PERSONA_PATH, 'PR_C_REGISTRY_PERSONAS');
  assert(Array.isArray(registry.commands) && registry.commands.length > 0, 'PR_C_COMMANDS_REQUIRED');
  assert(registry.owners && typeof registry.owners === 'object', 'PR_C_OWNERS_REQUIRED');
  assert(Array.isArray(registry.assertions) && registry.assertions.length > 0, 'PR_C_ASSERTIONS_REQUIRED');
  assert(Array.isArray(registry.notRun), 'PR_C_NOT_RUN_REQUIRED');

  const capabilityInventory = loadCapabilityInventory(root);
  const personaCatalog = validatePersonaCatalog(root, registry, capabilityInventory);
  if (verifyDigests) {
    assert(JSON.stringify(registry.commands) === JSON.stringify(expectedPrCCommandRegistry(root)), 'PR_C_COMMAND_SOURCE_CONTRACT');
  }
  const fixtureRegistry = verifyDigests
    ? JSON.parse(readFileSync(path.join(root, registry.fixtureRegistryPath), 'utf8'))
    : null;
  const fixtures = new Map();
  if (fixtureRegistry) {
    assert(fixtureRegistry.schemaVersion === 'delivery-monitor-pr-c-fixtures-1', 'PR_C_FIXTURE_VERSION');
    assert(Array.isArray(fixtureRegistry.fixtures) && fixtureRegistry.fixtures.length > 0, 'PR_C_FIXTURES_REQUIRED');
    unique(fixtureRegistry.fixtures.map(fixture => fixture.id), 'PR_C_FIXTURE_DUPLICATE');
    for (const fixture of fixtureRegistry.fixtures) {
      assert(typeof fixture.id === 'string' && fixture.id.length > 0, 'PR_C_FIXTURE_ID');
      assert(typeof fixture.oracle === 'string' && fixture.oracle.length > 20, `PR_C_FIXTURE_ORACLE:${fixture.id}`);
      assert(Array.isArray(fixture.sourcePaths) && fixture.sourcePaths.length > 0, `PR_C_FIXTURE_SOURCES:${fixture.id}`);
      assert(Array.isArray(fixture.covers) && fixture.covers.length > 0, `PR_C_FIXTURE_COVERS:${fixture.id}`);
      sortedUnique([...fixture.covers].sort(), `PR_C_FIXTURE_COVERS_UNIQUE:${fixture.id}`);
      for (const relative of fixture.sourcePaths) {
        assert(typeof relative === 'string' && !path.isAbsolute(relative) && existsSync(path.join(root, relative)), `PR_C_FIXTURE_SOURCE_MISSING:${fixture.id}:${relative}`);
      }
      fixtures.set(fixture.id, fixture);
    }
  }

  unique(registry.commands.map(command => command.id), 'PR_C_COMMAND_ID_DUPLICATE');
  unique(registry.commands.map(command => command.command), 'PR_C_COMMAND_STRING_DUPLICATE');
  const commands = new Map(registry.commands.map(command => [command.id, command]));
  for (const command of registry.commands) {
    assert(typeof command.command === 'string' && command.command.length > 0, 'PR_C_COMMAND_INVALID');
    assert(typeof command.environment === 'string' && command.environment.length > 0, 'PR_C_COMMAND_ENVIRONMENT');
    assert(!/(supabase\s+(?:db\s+push|functions\s+deploy|link)|netlify\s+deploy|vercel\s+deploy|gh\s+release)/iu.test(command.command), 'PR_C_LIVE_COMMAND_FORBIDDEN');
    assert(/^(?:npm(?:\.cmd)? (?:run |test(?:$| )|audit )|node |git )/u.test(command.command), `PR_C_COMMAND_EXECUTABLE:${command.id}`);
    assert(!/[;&|<>`\r\n]/u.test(command.command), `PR_C_COMMAND_SHELL:${command.id}`);
    assert(/^[A-Za-z0-9_./:@=\\-]+(?: [A-Za-z0-9_./:@=\\-]+)*$/u.test(command.command), `PR_C_COMMAND_CHARACTERS:${command.id}`);
    sortedUnique(command.requiredEnvironment || [], `PR_C_COMMAND_REQUIRED_ENVIRONMENT:${command.id}`);
  }

  for (const [owner, binding] of Object.entries(registry.owners)) {
    assert(binding && typeof binding.path === 'string' && /^[0-9a-f]{64}$/u.test(binding.sha256), `PR_C_OWNER_BINDING:${owner}`);
    assert(!path.isAbsolute(binding.path) && !binding.path.replaceAll('\\', '/').split('/').includes('..'), `PR_C_OWNER_PATH:${owner}`);
    if (verifyDigests) {
      const absolute = path.join(root, binding.path);
      assert(existsSync(absolute), `PR_C_OWNER_MISSING:${owner}`);
      assert(canonicalFileSha256(absolute) === binding.sha256, `PR_C_OWNER_HASH:${owner}`);
    }
  }

  const assertionKeys = registry.assertions.map(assertion => [
    assertion.commandId,
    assertion.owner,
    assertion.testId,
    assertion.assertionId,
    assertion.fixture,
  ].join('|'));
  unique(assertionKeys, 'PR_C_ASSERTION_DUPLICATE');
  for (const assertion of registry.assertions) {
    assert(commands.has(assertion.commandId), `PR_C_ASSERTION_COMMAND:${assertion.assertionId}`);
    assert(Object.hasOwn(registry.owners, assertion.owner), `PR_C_ASSERTION_OWNER:${assertion.assertionId}`);
    assert(typeof assertion.testId === 'string' && /^[A-Z0-9-]+$/u.test(assertion.testId) && typeof assertion.assertionId === 'string' && assertion.assertionId.length > 0, 'PR_C_ASSERTION_ID');
    assert(typeof assertion.fixture === 'string' && assertion.fixture.length > 0, 'PR_C_ASSERTION_FIXTURE');
    if (fixtureRegistry) {
      assert(fixtures.has(assertion.fixture), `PR_C_ASSERTION_FIXTURE_UNREGISTERED:${assertion.fixture}`);
      assert(fixtures.get(assertion.fixture).covers.includes(assertion.testId), `PR_C_ASSERTION_FIXTURE_COVERAGE:${assertion.fixture}:${assertion.testId}`);
    }
    assert(typeof assertion.testName === 'string' && assertion.testName.length > 0, `PR_C_ASSERTION_TEST_NAME:${assertion.assertionId}`);
    validateRuntimeContext(assertion.expectedRuntimeContext, capabilityInventory, personaCatalog, assertion.assertionId);
    if (assertion.testId.startsWith('HANDOFF-')) {
      assert(assertion.expectedRuntimeContext.edge === 'studio_to_delivery', `PR_C_HANDOFF_EDGE:${assertion.assertionId}`);
    }
    if (assertion.testId === 'PERF-002-B') {
      const perf = assertion.expectedRuntimeContext.performance;
      assert(perf && perf.sampleCount === 20 && perf.itemCount === 250 && perf.budgetMs === 200, `PR_C_PERF_CONTEXT:${assertion.assertionId}`);
    }
  }

  const covered = new Set(registry.assertions.map(assertion => assertion.testId));
  for (const testId of REQUIRED_TEST_IDS) assert(covered.has(testId), `PR_C_TEST_ID_UNOWNED:${testId}`);
  const coveredPersonas = new Set(registry.assertions.flatMap(assertion => [
    assertion.expectedRuntimeContext.persona.id,
    ...(assertion.expectedRuntimeContext.participants || []).map(persona => persona.id),
  ]));
  for (const personaId of personaCatalog.requiredPersonaIds) {
    assert(coveredPersonas.has(personaId), `PR_C_PERSONA_COVERAGE_MISSING:${personaId}`);
  }
  if (fixtureRegistry) {
    const usedFixtures = new Set(registry.assertions.map(assertion => assertion.fixture));
    for (const fixtureId of fixtures.keys()) assert(usedFixtures.has(fixtureId), `PR_C_FIXTURE_DEAD:${fixtureId}`);
  }

  const notRunIds = registry.notRun.map(boundary => boundary.testId);
  unique(notRunIds, 'PR_C_NOT_RUN_DUPLICATE');
  assert(notRunIds.length === EXACT_NOT_RUN.size && notRunIds.every(id => EXACT_NOT_RUN.has(id)), 'PR_C_NOT_RUN_BOUNDARY');
  for (const boundary of registry.notRun) {
    assert(boundary.command === null, `PR_C_NOT_RUN_COMMAND:${boundary.testId}`);
    assert(Object.hasOwn(registry.owners, boundary.owner), `PR_C_NOT_RUN_OWNER:${boundary.testId}`);
    assert(typeof boundary.testName === 'string' && boundary.testName.length > 0, `PR_C_NOT_RUN_TEST_NAME:${boundary.testId}`);
    assert(typeof boundary.reason === 'string' && boundary.reason.length > 20, `PR_C_NOT_RUN_REASON:${boundary.testId}`);
    sortedUnique(boundary.applicableExecutionClassifications, `PR_C_NOT_RUN_CLASSIFICATIONS:${boundary.testId}`);
    assert(boundary.applicableExecutionClassifications.length > 0
      && boundary.applicableExecutionClassifications.every(value => PR_C_EXECUTION_CLASSIFICATIONS.includes(value)), `PR_C_NOT_RUN_CLASSIFICATION:${boundary.testId}`);
    assert(!covered.has(boundary.testId), `PR_C_NOT_RUN_EXECUTED:${boundary.testId}`);
  }
  const exactHeadBoundary = registry.notRun.find(boundary => boundary.testId === 'EXACT-HEAD-GITHUB-CI');
  assert(JSON.stringify(exactHeadBoundary?.applicableExecutionClassifications) === JSON.stringify([PR_C_LOCAL_CLASSIFICATION]), 'PR_C_EXACT_HEAD_NOT_RUN_SCOPE');
  const previewBoundary = registry.notRun.find(boundary => boundary.testId === 'NETLIFY-HOSTED-PREVIEW');
  assert(JSON.stringify(previewBoundary?.applicableExecutionClassifications) === JSON.stringify([PR_C_GITHUB_CLASSIFICATION, PR_C_LOCAL_CLASSIFICATION]), 'PR_C_PREVIEW_NOT_RUN_SCOPE');

  assert(provenance.acceptedMainBaseline === PR_C_BASE_SHA, 'PR_C_PROVENANCE_BASE');
  validatePrCSanitized(registry);
  validatePrCSanitized(provenance);
  if (verifyDigests) validatePrCProvenance(root, registry, provenance);
  return {
    commandCount: registry.commands.length,
    assertionCount: registry.assertions.length,
    ownerCount: Object.keys(registry.owners).length,
    notRunCount: registry.notRun.length,
    personaCount: personaCatalog.personaCount,
    requiredPersonaCount: personaCatalog.requiredPersonaIds.size,
  };
};

export const loadPrCContract = root => {
  const registry = JSON.parse(readFileSync(path.join(root, PR_C_REGISTRY_PATH), 'utf8'));
  const provenance = JSON.parse(readFileSync(path.join(root, PR_C_PROVENANCE_PATH), 'utf8'));
  return { registry, provenance };
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const root = process.cwd();
  const { registry, provenance } = loadPrCContract(root);
  const result = validatePrCRegistryStructure(root, registry, provenance);
  console.log(`PR C evidence contract passed: ${JSON.stringify(result)}`);
}
