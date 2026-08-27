import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { collectChangedPrASources, collectPrAProvenanceFiles, calculatePrAWorkingTreeDigest } from './transcriptFlowEvidenceScope.mjs';

export const MARKER_PREFIX = 'PR_A_ASSERTION ';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const fileSha256 = file => sha256(readFileSync(file));
export const canonicalSourceSha256 = file => sha256(readFileSync(file, 'utf8').replace(/\r\n?/gu, '\n'));
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const markerKey = marker => `${marker.testId}|${marker.assertionId}|${marker.fixture}|${marker.result}`;
const assertionKey = item => `${item.commandId}|${markerKey(item.marker)}`;

const canonicalize = value => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  return value;
};
export const canonicalJson = value => JSON.stringify(canonicalize(value));
export const runtimeContextSha256 = context => sha256(canonicalJson(context));
export const assertRuntimeContextDigest = (context, digest, label = 'runtime-context') =>
  assert.equal(digest, runtimeContextSha256(context), `PR_A_RUNTIME_CONTEXT_DIGEST:${label}`);
export const EMPTY_LINEAGE = Object.freeze({
  sourceVersionSelectors: [], sourceSets: [], inputBundles: [], extractionJobIds: [], extractionBindingIds: [],
  candidates: [], previewBatchIds: [], assessDrafts: [],
});

export const loadCanonicalCapabilityInventory = root => {
  const directory = path.join(root, 'supabase/migrations');
  const capabilities = new Set();
  for (const name of readdirSync(directory).filter(item => item.endsWith('.sql')).sort()) {
    const source = readFileSync(path.join(directory, name), 'utf8');
    const blocks = source.matchAll(/INSERT\s+INTO\s+public\.capabilities\s*\([^)]*capability_key[^)]*\)\s*VALUES([\s\S]*?)(?:ON\s+CONFLICT|;)/giu);
    for (const block of blocks) for (const tuple of block[1].matchAll(/\(\s*'([^']+)'\s*,/gu)) capabilities.add(tuple[1]);
  }
  assert.ok(capabilities.size > 0, 'PR_A_CAPABILITY_INVENTORY_EMPTY');
  return capabilities;
};

const exactKeys = (value, keys, code) => assert.deepEqual(Object.keys(value || {}).sort(), keys.slice().sort(), code);
const sortedUnique = (values, code) => {
  assert.equal(Array.isArray(values), true, code);
  assert.deepEqual(values, [...new Set(values)].sort(), code);
};
const validateRuntimeContext = (context, validated, label) => {
  exactKeys(context, ['persona', 'organizationId', 'workspaceId', 'fixtureIds', 'lineage'], `PR_A_RUNTIME_CONTEXT_FIELDS:${label}`);
  exactKeys(context.persona, ['id', 'state', 'capabilities'], `PR_A_RUNTIME_PERSONA_FIELDS:${label}`);
  assert.ok(['active', 'revoked', 'revoked-then-restored'].includes(context.persona.state), `PR_A_RUNTIME_PERSONA_STATE:${label}`);
  sortedUnique(context.persona.capabilities, `PR_A_RUNTIME_CAPABILITIES_ORDER:${label}`);
  for (const capability of context.persona.capabilities) assert.equal(validated.capabilityInventory.has(capability), true, `PR_A_RUNTIME_CAPABILITY_UNKNOWN:${label}:${capability}`);
  sortedUnique(context.fixtureIds, `PR_A_RUNTIME_FIXTURES_ORDER:${label}`);
  exactKeys(context.lineage, Object.keys(EMPTY_LINEAGE), `PR_A_RUNTIME_LINEAGE_FIELDS:${label}`);
  for (const key of Object.keys(EMPTY_LINEAGE)) assert.equal(Array.isArray(context.lineage[key]), true, `PR_A_RUNTIME_LINEAGE_ARRAY:${label}:${key}`);
  sortedUnique(context.lineage.sourceVersionSelectors, `PR_A_RUNTIME_SOURCE_VERSIONS_ORDER:${label}`);
  sortedUnique(context.lineage.extractionJobIds, `PR_A_RUNTIME_JOBS_ORDER:${label}`);
  sortedUnique(context.lineage.extractionBindingIds, `PR_A_RUNTIME_BINDINGS_ORDER:${label}`);
  sortedUnique(context.lineage.previewBatchIds, `PR_A_RUNTIME_PREVIEWS_ORDER:${label}`);
  for (const [key, required] of [['sourceSets', ['id', 'version', 'versionSelector']], ['inputBundles', ['id', 'version', 'versionSelector']], ['candidates', ['id', 'version']], ['assessDrafts', ['id', 'version']]]) {
    for (const item of context.lineage[key]) exactKeys(item, required, `PR_A_RUNTIME_LINEAGE_ITEM:${label}:${key}`);
  }
  const persona = validated.personas.get(context.persona.id);
  assert.ok(persona, `PR_A_RUNTIME_PERSONA_UNKNOWN:${label}:${context.persona.id}`);
  assert.equal(persona.organizationId, context.organizationId, `PR_A_RUNTIME_ORGANIZATION:${label}`);
  assert.equal(persona.workspaceId, context.workspaceId, `PR_A_RUNTIME_WORKSPACE:${label}`);
};

export const REQUIRED_TEST_IDS = [
  ...Array.from({ length: 8 }, (_, index) => `SRCSET-${String(index + 1).padStart(3, '0')}`),
  ...Array.from({ length: 10 }, (_, index) => `ASSESS-TR-${String(index + 1).padStart(3, '0')}`),
  ...Array.from({ length: 4 }, (_, index) => `AUTH-${String(index + 1).padStart(3, '0')}`),
  'IDEMP-001', 'IDEMP-002-A', 'IDEMP-002-B', 'IDEMP-003', 'BUDGET-001', 'BUDGET-002',
  ...Array.from({ length: 8 }, (_, index) => `PROVIDER-${String(index + 1).padStart(3, '0')}`), 'PROVIDER-009-A', 'PROVIDER-009-B',
  'INJECTION-001', ...Array.from({ length: 4 }, (_, index) => `A11Y-${String(index + 1).padStart(3, '0')}`),
  'PERF-001', 'PERF-002-A', 'PERF-002-B', 'PERF-003', 'PERF-004',
].sort();

export const EXPECTED_COMMANDS = [
  ['typecheck-browser', 'npm run typecheck'], ['typecheck-edge', 'npm run typecheck:edge'],
  ['pr-a-domain', 'npm run test:transcript-flow:domain'], ['pr-a-api', 'npm run test:transcript-flow:api'],
  ['pr-a-provider', 'npm run test:transcript-flow:providers'], ['pr-a-postgres', 'npm run test:transcript-flow:postgres'],
  ['pr-a-browser', 'npm run test:transcript-flow:browser'], ['pr-a-adversarial', 'npm run test:transcript-flow:adversarial'],
  ['pr-a-a11y', 'npm run test:transcript-flow:a11y'], ['pr-a-performance', 'npm run test:transcript-flow:performance'],
  ['pr-a-coverage', 'npm run test:transcript-flow:coverage'], ['pr-a-evidence-contract', 'npm run test:transcript-flow:evidence-contract'],
  ['enterprise-source', 'npm run test:enterprise-intelligence'], ['enterprise-postgres', 'npm run test:migrations:enterprise-intelligence:postgres'],
  ['enterprise-browser', 'npm run test:browser:enterprise-intelligence'], ['pr1d-source', 'npm run test:pr1d'],
  ['pr1d-browser', 'npm run test:browser:pr1d'], ['assess-v2-rules', 'npm run test:assess-v2-rule-registry'],
  ['assess-v2-command', 'npm run test:assess-v2-command'], ['assess-v2-presentation', 'npm run test:assess-v2-presentation'],
  ['scoring-regression', 'npm run test:scoring'], ['studio-source', 'npm run test:studio-artifacts'],
  ['studio-postgres', 'npm run test:migrations:studio-artifacts'], ['studio-browser', 'npm run test:browser:studio-artifacts'],
  ['platform-provider-mocked', 'npm run test:full-platform:provider-mocked'], ['platform-108-campaign', 'npm run test:full-platform:campaign'],
  ['enterprise-boundaries', 'npm run lint:enterprise-intelligence'], ['workflow-static', 'npm run test:workflow-yaml'],
  ['ai-boundary-static', 'npm run test:ai-boundary-static'], ['secret-hygiene', 'npm run test:secret-hygiene'],
  ['build', 'npm run build'], ['audit', 'npm audit --audit-level=moderate'], ['diff-check', 'git diff --check'],
];

const scenarioFor = testId => {
  if (testId.startsWith('SRCSET-007') || testId === 'ASSESS-TR-010') return 'assess-incomplete';
  if (testId.startsWith('SRCSET-008') || testId.startsWith('AUTH-')) return 'tenant-authority';
  if (testId.startsWith('PROVIDER-')) return testId === 'PROVIDER-009-A' ? 'replay-and-budget' : 'provider-matrix';
  if (testId === 'INJECTION-001' || testId === 'ASSESS-TR-009') return 'prompt-injection';
  if (testId.startsWith('A11Y-') || testId.startsWith('PERF-')) return 'ui-quality';
  if (testId.startsWith('IDEMP-') || testId.startsWith('BUDGET-')) return 'replay-and-budget';
  if (testId === 'ASSESS-TR-008') return 'scoring-regression';
  if (['SRCSET-002', 'SRCSET-003', 'SRCSET-004', 'ASSESS-TR-002', 'ASSESS-TR-004', 'ASSESS-TR-005', 'ASSESS-TR-006', 'ASSESS-TR-007'].includes(testId)) return 'assess-ordered-conflict';
  return 'assess-one-source';
};

const personContext = (identities, personaId, fixture, lineage = EMPTY_LINEAGE, stateOverride) => {
  const persona = identities.personas.find(item => item.id === personaId);
  assert.ok(persona, `PR_A_RUNTIME_PROFILE_PERSONA:${personaId}`);
  return {
    persona: { id: persona.id, state: stateOverride || persona.state, capabilities: [...persona.capabilities] },
    organizationId: persona.organizationId, workspaceId: persona.workspaceId, fixtureIds: [fixture],
    lineage: structuredClone(lineage),
  };
};

const browserLineage = assertionId => {
  const sourceVersionSelectors = ['70000000-0000-4000-8000-000000000007', '71000000-0000-4000-8000-000000000017'];
  const sourceSet = { id: '14000000-0000-4000-8000-000000000014', version: 1, versionSelector: '15000000-0000-4000-8000-000000000015' };
  const inputBundle = { id: '16000000-0000-4000-8000-000000000016', version: 1, versionSelector: '1c000000-0000-4000-8000-00000000001c' };
  const runLineage = {
    extractionJobIds: ['29000000-0000-4000-8000-000000000029', '2a000000-0000-4000-8000-00000000002a'],
    extractionBindingIds: ['2c000000-0000-4000-8000-00000000002c', '2d000000-0000-4000-8000-00000000002d'],
  };
  if (assertionId.startsWith('default-off-boundary')) return structuredClone(EMPTY_LINEAGE);
  if (assertionId.startsWith('source-set-version-concurrency')) return {
    ...structuredClone(EMPTY_LINEAGE), sourceVersionSelectors: [sourceVersionSelectors[0]],
    sourceSets: [{ id: '24000000-0000-4000-8000-000000000024', version: 2, versionSelector: '35000000-0000-4000-8000-000000000035' }],
  };
  if (assertionId.startsWith('current-root-substitution-rejected')) return {
    sourceVersionSelectors,
    sourceSets: [{ id: sourceSet.id, version: 2, versionSelector: '35000000-0000-4000-8000-000000000035' }],
    inputBundles: [inputBundle], ...runLineage,
    candidates: [
      { id: '18000000-0000-4000-8000-000000000018', version: 1 },
      { id: '3f000000-0000-4000-8000-00000000003f', version: 1 },
      { id: '80000000-0000-4000-8000-000000000008', version: 1 },
    ], previewBatchIds: [], assessDrafts: [],
  };
  if (assertionId.startsWith('stale-and-authority-loss')) return {
    sourceVersionSelectors, sourceSets: [sourceSet], inputBundles: [inputBundle], ...runLineage,
    candidates: [{ id: '80000000-0000-4000-8000-000000000008', version: 1 }], previewBatchIds: [], assessDrafts: [],
  };
  if (assertionId.startsWith('bounded-candidate-filter')) return {
    sourceVersionSelectors, sourceSets: [sourceSet], inputBundles: [inputBundle], ...runLineage,
    candidates: Array.from({ length: 200 }, (_, index) => ({ id: `8f000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, version: 1 })),
    previewBatchIds: [], assessDrafts: [],
  };
  if (assertionId.startsWith('exact-lineage-conflict-replay')) return {
    sourceVersionSelectors, sourceSets: [sourceSet], inputBundles: [inputBundle], ...runLineage,
    candidates: [
      { id: '18000000-0000-4000-8000-000000000018', version: 1 },
      { id: '80000000-0000-4000-8000-000000000008', version: 2 },
    ],
    previewBatchIds: ['19000000-0000-4000-8000-000000000019'],
    assessDrafts: [{ id: '81000000-0000-4000-8000-000000000018', version: 2 }],
  };
  throw new Error(`PR_A_BROWSER_RUNTIME_EXPECTATION:${assertionId}`);
};

const postgresLineage = testName => {
  const source = number => `99000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
  const generated = number => `96000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
  const set = (id, selector, version) => ({ id: source(id), versionSelector: generated(selector), version });
  const bundle = (id, selector, version = 1) => ({ id: source(id), versionSelector: generated(selector), version });
  const commonAssess = {
    sourceVersionSelectors: [source(101), source(103)], sourceSets: [set(5000, 5, 2)], inputBundles: [bundle(5022, 15)],
    extractionJobIds: [source(5033), source(5038)], extractionBindingIds: [generated(28), generated(31)],
    candidates: [{ id: source(5034), version: 1 }, { id: source(5039), version: 2 }], previewBatchIds: [], assessDrafts: [],
  };
  const contexts = new Map([
    ['one transcript creates one immutable ordered version', { ...structuredClone(EMPTY_LINEAGE), sourceVersionSelectors: [source(101)], sourceSets: [set(5000, 2, 1)] }],
    ['multiple transcripts retain declared order and membership changes version instead of mutation', { ...structuredClone(EMPTY_LINEAGE), sourceVersionSelectors: [source(101), source(103)], sourceSets: [set(5000, 5, 2)] }],
    ['stale source-set expectedVersion loses the concurrency race without a partial version', { ...structuredClone(EMPTY_LINEAGE), sourceVersionSelectors: [source(101)], sourceSets: [set(5000, 5, 2)] }],
    ['one exact source version is reusable by independent module-owned sets', { ...structuredClone(EMPTY_LINEAGE), sourceVersionSelectors: [source(101)], sourceSets: [set(5010, 10, 1)] }],
    ['failed source members block a set atomically', { ...structuredClone(EMPTY_LINEAGE), sourceVersionSelectors: [source(115)] }],
    ['cross-workspace selectors are non-mutating', { ...structuredClone(EMPTY_LINEAGE), sourceVersionSelectors: [source(5018)] }],
    ['locked input bundle binds only exact selected source versions', { ...structuredClone(EMPTY_LINEAGE), sourceVersionSelectors: [source(101), source(103)], sourceSets: [set(5000, 5, 2)], inputBundles: [bundle(5022, 15)] }],
    ['journey create, stop, and resume append exact versions', structuredClone(EMPTY_LINEAGE)],
    ['source-specific candidate anchors and immutable human reviews persist', commonAssess],
    ['competing source proposals create one unresolved material conflict', { ...commonAssess, previewBatchIds: [source(5051)], assessDrafts: [{ id: source(5048), version: 1 }] }],
    ['resolved batch creates exactly one Assess version and preserves manual/scoring ancestry', { ...commonAssess, previewBatchIds: [source(5051)], assessDrafts: [{ id: source(5048), version: 2 }] }],
    ['a new source-set version preserves consumed bundle, application, Assess, candidate, and evidence history', { ...commonAssess, sourceVersionSelectors: [source(101), source(103), source(105)], sourceSets: [set(5000, 56, 3)], previewBatchIds: [source(5051)], assessDrafts: [{ id: source(5048), version: 2 }] }],
    ['only an unconsumed dependent bundle version receives append-only staleness', { ...structuredClone(EMPTY_LINEAGE), sourceVersionSelectors: [source(107), source(109)], sourceSets: [set(5062, 59, 1), set(5062, 65, 2)], inputBundles: [bundle(5065, 62)] }],
    ['atomic budget grants one provider-effect owner and safely reconciles response loss', { ...structuredClone(EMPTY_LINEAGE), sourceVersionSelectors: [source(101), source(103)], extractionJobIds: [source(5072), source(5075)] }],
  ]);
  const context = contexts.get(testName);
  assert.ok(context, `PR_A_POSTGRES_RUNTIME_EXPECTATION:${testName}`);
  return structuredClone(context);
};

const runtimeContextMatches = (actual, expected, label) => assert.deepEqual(actual, expected, `PR_A_RUNTIME_CONTEXT_MISMATCH:${label}`);

const expectedRuntimeContext = (identities, item) => {
  if (item.ownerKey === 'browser') {
    const context = personContext(identities, '10000000-0000-4000-8000-000000000001', item.marker.fixture, browserLineage(item.marker.assertionId));
    if (item.marker.assertionId.startsWith('default-off-boundary')) context.persona.capabilities = [
      'approvals.review', 'assemble.manage', 'byok.manage', 'evidence.review', 'evidence.write', 'monitor.manage',
      'monitor.read', 'portfolio.manage', 'project.manage', 'project.read', 'security.manage', 'studio.artifacts.read',
    ];
    return context;
  }
  if (item.ownerKey === 'provider') return personContext(identities, '33333333-3333-4333-8333-333333333333', item.marker.fixture);
  if (item.ownerKey === 'postgres') return personContext(identities, '97000000-0000-4000-8000-000000000001', item.marker.fixture, postgresLineage(item.testName));
  if (item.ownerKey === 'api') {
    const base = personContext(identities, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', item.marker.fixture);
    const selector = number => `65000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
    const sameTenant = number => `68000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
    if (item.marker.testId === 'AUTH-003') return {
      ...base, persona: { ...base.persona, capabilities: ['byok.manage'] },
      fixtureIds: ['55000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000002'],
    };
    if (item.marker.testId === 'AUTH-004') return {
      ...base, persona: { ...base.persona, state: 'revoked-then-restored' },
      fixtureIds: Array.from({ length: 18 }, (_, index) => `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`),
      lineage: {
        sourceVersionSelectors: [selector(41)],
        sourceSets: [{ id: selector(1), version: 1, versionSelector: selector(11) }],
        inputBundles: [{ id: selector(21), version: 1, versionSelector: selector(31) }],
        extractionJobIds: [], extractionBindingIds: [],
        candidates: [{ id: selector(61), version: 1 }],
        previewBatchIds: [selector(81)],
        assessDrafts: [{ id: selector(71), version: 1 }],
      },
    };
    return {
      ...base,
      fixtureIds: [
        ...[1, 2, 11, 12, 21, 22, 31, 32, 41, 42, 51, 52, 61, 62, 71, 72, 81, 82, 91, 92].map(selector),
        ...[1, 2, 3, 4, 5, 6, 7].map(sameTenant),
      ].sort(),
      lineage: {
        sourceVersionSelectors: [selector(41), selector(42)],
        sourceSets: [
          { id: selector(1), version: 1, versionSelector: selector(11) },
          { id: selector(2), version: 1, versionSelector: selector(12) },
          { id: sameTenant(5), version: 1, versionSelector: sameTenant(6) },
        ],
        inputBundles: [
          { id: selector(21), version: 1, versionSelector: selector(31) },
          { id: selector(22), version: 1, versionSelector: selector(32) },
          { id: sameTenant(3), version: 1, versionSelector: sameTenant(4) },
        ],
        extractionJobIds: [], extractionBindingIds: [],
        candidates: [{ id: selector(61), version: 1 }, { id: selector(62), version: 1 }],
        previewBatchIds: [selector(81), selector(82), sameTenant(2)],
        assessDrafts: [
          { id: selector(71), version: 1 }, { id: selector(72), version: 1 },
          { id: sameTenant(1), version: 1 },
        ],
      },
    };
  }
  throw new Error(`PR_A_RUNTIME_CONTEXT_OWNER:${item.ownerKey}`);
};

const exact = (testId, assertionId, fixture, ownerKey, testName, commandId) => ({
  commandId, scenarioId: scenarioFor(testId), ownerKey, testName,
  marker: { testId, assertionId, fixture, result: 'passed' },
});

const postgresMarkers = () => {
  const counts = new Map();
  const groups = [
    [['SRCSET-001'], 'one transcript creates one immutable ordered version'],
    [['SRCSET-002', 'SRCSET-003', 'SRCSET-004'], 'multiple transcripts retain declared order and membership changes version instead of mutation'],
    [['SRCSET-002', 'IDEMP-003'], 'stale source-set expectedVersion loses the concurrency race without a partial version'],
    [['SRCSET-006'], 'one exact source version is reusable by independent module-owned sets'],
    [['SRCSET-007', 'ASSESS-TR-010'], 'failed source members block a set atomically'],
    [['SRCSET-008'], 'cross-workspace selectors are non-mutating'],
    [['SRCSET-005'], 'locked input bundle binds only exact selected source versions'],
    [['IDEMP-001'], 'journey create, stop, and resume append exact versions'],
    [['ASSESS-TR-001', 'ASSESS-TR-002', 'ASSESS-TR-003'], 'source-specific candidate anchors and immutable human reviews persist'],
    [['ASSESS-TR-005', 'ASSESS-TR-006'], 'competing source proposals create one unresolved material conflict'],
    [['ASSESS-TR-004', 'ASSESS-TR-007', 'ASSESS-TR-008', 'IDEMP-002-A'], 'resolved batch creates exactly one Assess version and preserves manual/scoring ancestry'],
    [['SRCSET-004'], 'a new source-set version preserves consumed bundle, application, Assess, candidate, and evidence history'],
    [['SRCSET-004'], 'only an unconsumed dependent bundle version receives append-only staleness'],
    [['BUDGET-001', 'BUDGET-002', 'PROVIDER-009-A'], 'atomic budget grants one provider-effect owner and safely reconciles response loss'],
  ];
  return groups.flatMap(([testIds, testName]) => testIds.map((testId, index) => {
    const count = (counts.get(testId) || 0) + 1; counts.set(testId, count);
    return exact(testId, `${testId.toLowerCase()}-${String(index + 1).padStart(2, '0')}-${count}`, 'pr-a-postgres', 'postgres', testName, 'pr-a-postgres');
  }));
};

const apiMarkers = () => [
  exact('AUTH-001', 'auth-001-real-foreign-missing-nondisclosure', 'api-command-contract', 'api', 'real selector derivation makes foreign and missing resources indistinguishable', 'pr-a-api'),
  exact('AUTH-002', 'auth-002-real-preclaim-zero-effects', 'api-command-contract', 'api', 'real selector derivation rejects before every receipt, audit, provider, or domain effect', 'pr-a-api'),
  exact('AUTH-003', 'auth-003-same-action-bounded-refresh', 'api-command-contract', 'api', 'same-action stale authority uses one bounded refresh and no stale success', 'pr-a-api'),
  exact('AUTH-004', 'auth-004-revoked-terminal-nondisclosure', 'api-command-contract', 'api', 'revoked authority remains terminal and non-disclosing until a new command', 'pr-a-api'),
];

const providerMarkers = commandId => [
  exact('PROVIDER-008', 'opaque-reference-and-secret-hygiene', 'provider-mock-contracts', 'provider', 'provider-specific opaque references include first-class Groq', commandId),
  exact('INJECTION-001', 'length-framed-hostile-source', 'provider-mock-contracts', 'provider', 'INJECTION-001 length-framed source cannot close delimiters and selected coverage is never truncated', commandId),
  exact('ASSESS-TR-009', 'source-cannot-alter-system-policy', 'provider-mock-contracts', 'provider', 'INJECTION-001 length-framed source cannot close delimiters and selected coverage is never truncated', commandId),
  ...['PROVIDER-001', 'PROVIDER-002', 'PROVIDER-003', 'PROVIDER-004', 'PROVIDER-005', 'PROVIDER-006'].map(testId => exact(testId, 'strict-response-contract', 'provider-mock-contracts', 'provider', 'PROVIDER-001..006 table-driven response contracts validate model, usage, and schema', commandId)),
  exact('PROVIDER-007', 'malformed-model-and-usage-failures', 'provider-mock-contracts', 'provider', 'PROVIDER-007 malformed/model-substitution/usage-mismatch remain truthful failures', commandId),
  ...['PROVIDER-001', 'PROVIDER-002', 'PROVIDER-003', 'PROVIDER-004', 'PROVIDER-005', 'PROVIDER-006'].map(testId => exact(testId, 'exact-adapter-request-contract', 'provider-mock-contracts', 'provider', 'PROVIDER-001..006 adapters use exact paths, no redirects, header-only secrets, and strict usage', commandId)),
  exact('PROVIDER-008', 'header-only-secret-transport', 'provider-mock-contracts', 'provider', 'PROVIDER-001..006 adapters use exact paths, no redirects, header-only secrets, and strict usage', commandId),
  exact('PROVIDER-007', 'http-and-network-failure-classification', 'provider-mock-contracts', 'provider', 'PROVIDER-007 429/5xx/malformed response and network failure are classified without payload leakage', commandId),
  exact('PROVIDER-007', 'bounded-timeout-classification', 'provider-mock-contracts', 'provider', 'PROVIDER-007 timeout aborts without exposing request or response material', commandId),
];

const browserGroups = [
  ['source-set-version-concurrency', 'existing source set appends an immutable version and preserves a stale concurrent edit', ['SRCSET-001', 'SRCSET-002', 'SRCSET-005', 'SRCSET-006', 'A11Y-002', 'A11Y-003', 'A11Y-004']],
  ['exact-lineage-conflict-replay', 'exact bundle review preserves historical source-set lineage across current-root drift and response loss', ['ASSESS-TR-001', 'ASSESS-TR-002', 'ASSESS-TR-003', 'ASSESS-TR-004', 'ASSESS-TR-006', 'ASSESS-TR-007', 'IDEMP-002-A', 'A11Y-001', 'A11Y-002', 'A11Y-003', 'A11Y-004']],
  ['current-root-substitution-rejected', 'current-root substitution in projected binding lineage is rejected before mutation', ['ASSESS-TR-002']],
  ['stale-and-authority-loss', 'stale projection, superseded bundle, and permission loss clear local authority', ['ASSESS-TR-005']],
  ['default-off-boundary', 'default-off workspace exposes no multi-source mutation surface or fallback', ['A11Y-003', 'A11Y-004']],
  ['bounded-candidate-filter', 'PERF-002-A bounds and filters 200 exact candidates within the browser budget', ['PERF-002-A']],
];
const browserMarkers = (commandId, kinds) => browserGroups.filter((_, index) => kinds.includes(index)).flatMap(([assertionId, testName, testIds]) =>
  ['chromium-desktop', 'chromium-mobile'].flatMap(profile => testIds.map(testId => exact(testId, `${assertionId}-${profile}`, `browser-${profile}`, 'browser', testName, commandId))));

export const loadEvidenceContract = (root, overrides = {}) => {
  const contractRoot = path.join(root, 'testing/process-lifecycle');
  const registry = overrides.registry || readJson(path.join(contractRoot, 'contracts/pr-a-assertion-registry.json'));
  const scenarios = overrides.scenarios || readJson(path.join(contractRoot, 'scenarios/pr-a.json'));
  const fixtures = overrides.fixtures || readJson(path.join(contractRoot, 'fixtures/pr-a-fixture-registry.json'));
  const identities = overrides.identities || readJson(path.join(contractRoot, 'fixtures/identities/pr-a-personas.json'));
  const owners = registry.owners;
  const markerSuites = registry.markerSuites.flatMap(suite => suite.commandIds.flatMap(commandId => {
    if (suite.kind === 'api') return apiMarkers();
    if (suite.kind === 'postgres') return postgresMarkers();
    if (suite.kind === 'provider') return providerMarkers(commandId);
    if (suite.kind === 'browser-full') return browserMarkers(commandId, [0, 1, 2, 3, 4, 5]);
    if (suite.kind === 'browser-a11y') return browserMarkers(commandId, [0, 1, 4]);
    if (suite.kind === 'browser-performance') return browserMarkers(commandId, [5]);
    throw new Error(`PR_A_REGISTRY_UNKNOWN_MARKER_SUITE:${suite.kind}`);
  }));
  const assertions = markerSuites.map(item => ({ ...item, expectedRuntimeContext: expectedRuntimeContext(identities, item) }));
  return { registry, scenarios, fixtures, identities, owners, assertions };
};

export const validateEvidenceContract = (root, contract = loadEvidenceContract(root)) => {
  const { registry, scenarios, fixtures, identities, owners, assertions } = contract;
  assert.equal(registry.contractVersion, 'process-lifecycle-pr-a-registry-3', 'PR_A_REGISTRY_VERSION');
  assert.equal(identities.contractVersion, 'process-lifecycle-identities-3', 'PR_A_IDENTITIES_VERSION');
  assert.equal(scenarios.contractVersion, 'process-lifecycle-pr-a-scenarios-3', 'PR_A_SCENARIOS_VERSION');
  assert.equal(registry.workflowPath, '.github/workflows/transcript-flow-pr-a.yml', 'PR_A_WORKFLOW_PATH');
  const commandIds = new Set(); const commandStrings = new Set();
  for (const command of registry.commands) {
    assert.ok(command.id && command.command && command.environment, 'PR_A_COMMAND_PARTIAL');
    assert.equal(commandIds.has(command.id), false, `PR_A_COMMAND_DUPLICATE_ID:${command.id}`); commandIds.add(command.id);
    assert.equal(commandStrings.has(command.command), false, `PR_A_COMMAND_DUPLICATE_STRING:${command.command}`); commandStrings.add(command.command);
    assert.match(command.command, /^(?:npm (?:run [a-z0-9:-]+|audit --audit-level=moderate)|git diff --check)$/u, `PR_A_COMMAND_UNSAFE:${command.command}`);
  }
  assert.deepEqual(registry.commands.map(item => [item.id, item.command]), EXPECTED_COMMANDS, 'PR_A_COMMAND_SOURCE_CONTRACT');
  for (const [key, owner] of Object.entries(owners)) {
    const absolute = path.join(root, owner.path);
    assert.equal(existsSync(absolute), true, `PR_A_OWNER_PATH:${key}`);
    assert.match(owner.sha256, /^[0-9a-f]{64}$/u, `PR_A_OWNER_HASH_FORMAT:${key}`);
    assert.equal(canonicalSourceSha256(absolute), owner.sha256, `PR_A_OWNER_HASH:${key}`);
  }
  const capabilityInventory = loadCanonicalCapabilityInventory(root);
  const organizationIds = new Set();
  for (const organization of identities.organizations) { assert.equal(organizationIds.has(organization.id), false, `PR_A_ORGANIZATION_DUPLICATE:${organization.id}`); organizationIds.add(organization.id); }
  const workspaces = new Map();
  for (const workspace of identities.workspaces) { assert.equal(workspaces.has(workspace.id), false, `PR_A_WORKSPACE_DUPLICATE:${workspace.id}`); workspaces.set(workspace.id, workspace); }
  const personas = new Map();
  for (const persona of identities.personas) {
    assert.ok(persona.id && persona.label && ['active', 'revoked'].includes(persona.state), `PR_A_PERSONA_PARTIAL:${persona.id || 'unknown'}`);
    assert.equal(organizationIds.has(persona.organizationId), true, `PR_A_PERSONA_ORG:${persona.id}`);
    assert.equal(workspaces.get(persona.workspaceId)?.organizationId, persona.organizationId, `PR_A_PERSONA_WORKSPACE:${persona.id}`);
    assert.equal(Array.isArray(persona.capabilities), true, `PR_A_PERSONA_CAPABILITIES:${persona.id}`);
    sortedUnique(persona.capabilities, `PR_A_PERSONA_CAPABILITIES_ORDER:${persona.id}`);
    for (const capability of persona.capabilities) assert.equal(capabilityInventory.has(capability), true, `PR_A_PERSONA_CAPABILITY_UNKNOWN:${persona.id}:${capability}`);
    assert.equal(personas.has(persona.id), false, `PR_A_PERSONA_DUPLICATE:${persona.id}`); personas.set(persona.id, persona);
  }
  const fixtureMap = new Map();
  for (const fixture of fixtures.fixtures) {
    assert.equal(fixtureMap.has(fixture.id), false, `PR_A_FIXTURE_DUPLICATE:${fixture.id}`);
    assert.equal(existsSync(path.join(root, fixture.path)), true, `PR_A_FIXTURE_PATH:${fixture.id}`); fixtureMap.set(fixture.id, fixture);
  }
  const scenarioMap = new Map(); const usedFixtures = new Set();
  for (const scenario of scenarios.scenarios) {
    assert.equal(scenarioMap.has(scenario.id), false, `PR_A_SCENARIO_DUPLICATE:${scenario.id}`); scenarioMap.set(scenario.id, scenario);
    assert.ok(Array.isArray(scenario.fixtureIds) && scenario.fixtureIds.length, `PR_A_SCENARIO_FIXTURES:${scenario.id}`);
    assert.ok(Array.isArray(scenario.personaIds) && scenario.personaIds.length, `PR_A_SCENARIO_PERSONAS:${scenario.id}`);
    for (const id of scenario.fixtureIds) { assert.equal(fixtureMap.has(id), true, `PR_A_SCENARIO_FIXTURE_MISSING:${scenario.id}:${id}`); usedFixtures.add(id); }
    for (const id of scenario.personaIds) assert.equal(personas.has(id), true, `PR_A_SCENARIO_PERSONA_MISSING:${scenario.id}:${id}`);
  }
  for (const id of fixtureMap.keys()) assert.equal(usedFixtures.has(id), true, `PR_A_FIXTURE_DEAD:${id}`);
  const exactAssertions = new Set(); const passedTestIds = new Set(); const ownerAssertions = new Set();
  const validationContext = { personas, capabilityInventory };
  for (const item of assertions) {
    assert.equal(commandIds.has(item.commandId), true, `PR_A_ASSERTION_COMMAND:${item.commandId}`);
    assert.equal(scenarioMap.has(item.scenarioId), true, `PR_A_ASSERTION_SCENARIO:${item.marker.testId}`);
    assert.equal(Boolean(owners[item.ownerKey]), true, `PR_A_ASSERTION_OWNER:${item.marker.testId}`);
    assert.ok(item.testName, `PR_A_ASSERTION_TEST_NAME:${item.marker.testId}`);
    const key = assertionKey(item); assert.equal(exactAssertions.has(key), false, `PR_A_ASSERTION_DUPLICATE:${key}`); exactAssertions.add(key);
    const ownerKey = `${item.commandId}|${owners[item.ownerKey].path}|${item.testName}|${item.marker.assertionId}|${item.marker.testId}`;
    assert.equal(ownerAssertions.has(ownerKey), false, `PR_A_ASSERTION_OWNER_DUPLICATE:${ownerKey}`); ownerAssertions.add(ownerKey);
    validateRuntimeContext(item.expectedRuntimeContext, validationContext, `${item.commandId}:${item.marker.assertionId}`);
    if (item.marker.testId.startsWith('AUTH-')) {
      assert.equal(item.commandId, 'pr-a-api', `PR_A_AUTH_COMMAND_OWNER:${item.marker.testId}`);
      assert.equal(item.ownerKey, 'api', `PR_A_AUTH_ASSERTION_OWNER:${item.marker.testId}`);
    }
    passedTestIds.add(item.marker.testId);
  }
  const notRunIds = new Set();
  for (const item of registry.notRun) {
    assert.equal(scenarioMap.has(item.scenarioId), true, `PR_A_NOT_RUN_SCENARIO:${item.testId}`);
    assert.equal(Boolean(owners[item.owner]), true, `PR_A_NOT_RUN_OWNER:${item.testId}`);
    assert.ok(item.testName && item.reason, `PR_A_NOT_RUN_PARTIAL:${item.testId}`);
    assert.equal(notRunIds.has(item.testId), false, `PR_A_NOT_RUN_DUPLICATE:${item.testId}`); notRunIds.add(item.testId);
    assert.equal(passedTestIds.has(item.testId), false, `PR_A_RESULT_CONFLICT:${item.testId}`);
  }
  assert.deepEqual([...new Set([...passedTestIds, ...notRunIds])].sort(), REQUIRED_TEST_IDS, 'PR_A_TEST_ID_REGISTRY_INCOMPLETE');
  return { ...contract, commandIds, scenarioMap, fixtureMap, personas, exactAssertions, capabilityInventory };
};

export const validateProvenance = (root, baseGitSha, provenanceOverride) => {
  const provenance = provenanceOverride || readJson(path.join(root, 'tests/acceptance/source-provenance.json'));
  for (const file of collectPrAProvenanceFiles(root)) {
    const declared = provenance.sourceDigests?.[file];
    assert.match(declared || '', /^sha256:[0-9a-f]{64}$/u, `PR_A_PROVENANCE_MISSING:${file}`);
    assert.equal(declared, `sha256:${canonicalSourceSha256(path.join(root, file))}`, `PR_A_PROVENANCE_HASH:${file}`);
  }
  const changed = collectChangedPrASources(root, baseGitSha);
  const scoped = new Set(collectPrAProvenanceFiles(root));
  for (const file of changed) assert.equal(scoped.has(file), true, `PR_A_CHANGED_SOURCE_OMITTED:${file}`);
  return { provenance, changed };
};

export const parseExactMarkers = output => output.split(/\r?\n/u).map(line => line.startsWith('# PR_A_ASSERTION ') ? line.slice(2) : line)
  .filter(line => line.startsWith(MARKER_PREFIX)).map(line => {
  const parsed = JSON.parse(line.slice(MARKER_PREFIX.length));
  assert.deepEqual(Object.keys(parsed).sort(), ['assertionId', 'fixture', 'result', 'runtimeContext', 'testId'], 'PR_A_MARKER_FIELDS');
  return parsed;
});

export const validateCommandMarkers = (validated, commandId, markers) => {
  const expected = validated.assertions.filter(item => item.commandId === commandId);
  const expectedKeys = new Map(expected.map(item => [markerKey(item.marker), item]));
  const seen = new Set();
  for (const marker of markers) {
    const key = markerKey(marker);
    assert.equal(expectedKeys.has(key), true, `PR_A_MARKER_UNREGISTERED:${commandId}:${key}`);
    assert.equal(seen.has(key), false, `PR_A_MARKER_DUPLICATE:${commandId}:${key}`); seen.add(key);
    const registered = expectedKeys.get(key);
    validateRuntimeContext(marker.runtimeContext, validated, `${commandId}:${marker.assertionId}`);
    runtimeContextMatches(marker.runtimeContext, registered.expectedRuntimeContext, `${commandId}:${marker.assertionId}`);
  }
  assert.deepEqual([...seen].sort(), [...expectedKeys.keys()].sort(), `PR_A_MARKER_MISSING:${commandId}`);
  return markers.map(marker => expectedKeys.get(markerKey(marker)));
};

const prohibited = /(?:BEGIN [A-Z ]*PRIVATE KEY|eyJ[a-zA-Z0-9_-]{20,}|sk-[a-zA-Z0-9]{16,}|providerKey|signedUrl|storagePath|authorizationHeader|raw transcript|customer data)/iu;
export const assertSanitized = (value, label) => assert.equal(prohibited.test(typeof value === 'string' ? value : JSON.stringify(value)), false, `PR_A_UNSANITIZED:${label}`);

export const buildAssertionEvidence = (root, validated, registered, marker, commandRecordDigest) => {
  const owner = validated.owners[registered.ownerKey];
  validateRuntimeContext(marker.runtimeContext, validated, `${registered.commandId}:${marker.assertionId}`);
  runtimeContextMatches(marker.runtimeContext, registered.expectedRuntimeContext, `${registered.commandId}:${marker.assertionId}`);
  return {
    testId: marker.testId, result: marker.result, scenarioId: registered.scenarioId,
    assertionOwner: { path: owner.path, sha256: owner.sha256, testName: registered.testName },
    runtimeContext: structuredClone(marker.runtimeContext), runtimeContextDigest: runtimeContextSha256(marker.runtimeContext),
    facts: { assertionId: marker.assertionId, fixture: marker.fixture, sanitized: true, executed: true },
    marker, markerDigest: sha256(canonicalJson(marker)), commandRecordDigest,
  };
};

export const buildNotRunEvidence = (root, validated, item) => {
  const scenario = validated.scenarioMap.get(item.scenarioId);
  const owner = validated.owners[item.owner];
  return {
    scenarioId: item.scenarioId,
    assertionOwner: { path: owner.path, sha256: owner.sha256, testName: item.testName },
    fixtureBindings: scenario.fixtureIds.map(id => {
      const fixture = validated.fixtureMap.get(id);
      return { id, path: fixture.path, sha256: canonicalSourceSha256(path.join(root, fixture.path)) };
    }),
    personas: scenario.personaIds.map(id => structuredClone(validated.personas.get(id))),
    lineage: structuredClone(validated.scenarios.notRunLineage), provider: { applicable: false },
    facts: { sanitized: true, executed: false, reason: item.reason },
  };
};

export const validateEvidenceResultCardinality = (results, manifest, validated) => {
  const passed = results.filter(item => item.result === 'passed');
  const notRun = results.filter(item => item.result === 'not_run');
  assert.equal(passed.length + notRun.length, results.length, 'PR_A_EVIDENCE_RESULT_UNKNOWN');

  const passedKeys = passed.map(item => `${item.command?.id || ''}|${markerKey(item.assertion?.marker || {})}`);
  assert.equal(new Set(passedKeys).size, passedKeys.length, 'PR_A_PASSED_EVIDENCE_DUPLICATE');
  assert.equal(passed.length, validated.assertions.length, 'PR_A_PASSED_EVIDENCE_COUNT');
  const expectedPassedKeys = validated.assertions.map(item => assertionKey(item)).sort();
  assert.deepEqual(passedKeys.slice().sort(), expectedPassedKeys, 'PR_A_PASSED_EVIDENCE_EXACT_SET');

  const notRunIds = notRun.map(item => item.testId);
  assert.equal(new Set(notRunIds).size, notRunIds.length, 'PR_A_NOT_RUN_EVIDENCE_DUPLICATE');
  assert.equal(notRun.length, validated.registry.notRun.length, 'PR_A_NOT_RUN_EVIDENCE_COUNT');
  assert.deepEqual(notRunIds.slice().sort(), validated.registry.notRun.map(item => item.testId).sort(), 'PR_A_NOT_RUN_EVIDENCE_EXACT_SET');

  const expectedTotal = validated.assertions.length + validated.registry.notRun.length;
  assert.equal(results.length, expectedTotal, 'PR_A_EVIDENCE_TOTAL_COUNT');
  assert.equal(manifest.assertionCount, expectedTotal, 'PR_A_MANIFEST_ASSERTION_COUNT');
};

export const validateEvidenceDirectory = (root, evidenceDir, expected = {}) => {
  assert.equal(existsSync(evidenceDir), true, 'PR_A_EVIDENCE_DIRECTORY_MISSING');
  const manifest = readJson(path.join(evidenceDir, 'manifest.json'));
  const commands = readJson(path.join(evidenceDir, 'command-results.json'));
  const validated = validateEvidenceContract(root);
  const baseGitSha = expected.baseGitSha || manifest.baseGitSha;
  const headGitSha = expected.headGitSha || manifest.headGitSha;
  const digest = expected.workingTreeDigest || calculatePrAWorkingTreeDigest(root);
  assert.equal(manifest.contractVersion, 'process-lifecycle-pr-a-manifest-3', 'PR_A_MANIFEST_VERSION');
  assert.equal(manifest.baseGitSha, baseGitSha, 'PR_A_BASE_SHA_MISMATCH');
  assert.equal(manifest.headGitSha, headGitSha, 'PR_A_HEAD_SHA_MISMATCH');
  assert.equal(manifest.workingTreeDigest, digest, 'PR_A_TREE_DIGEST_MISMATCH');
  const expectedDirectory = path.resolve(root, 'output', 'process-lifecycle', baseGitSha, digest, manifest.runAttempt);
  assert.equal(path.resolve(evidenceDir), expectedDirectory, 'PR_A_EVIDENCE_PATH_UNBOUND');
  assert.equal(manifest.workflow.path, validated.registry.workflowPath, 'PR_A_WORKFLOW_PATH_MISMATCH');
  if (expected.runId !== undefined) assert.equal(manifest.workflow.runId, expected.runId, 'PR_A_WORKFLOW_RUN_ID_STALE');
  if (expected.runAttempt !== undefined) assert.equal(manifest.workflow.runAttempt, expected.runAttempt, 'PR_A_WORKFLOW_ATTEMPT_STALE');
  assert.equal(commands.contractVersion, 'process-lifecycle-pr-a-command-results-3', 'PR_A_COMMAND_RESULTS_VERSION');
  assert.equal(commands.baseGitSha, baseGitSha, 'PR_A_COMMAND_BASE_SHA');
  assert.equal(commands.headGitSha, headGitSha, 'PR_A_COMMAND_HEAD_SHA');
  assert.equal(commands.workingTreeDigest, digest, 'PR_A_COMMAND_TREE_DIGEST');
  const records = new Map(commands.commands.map(item => [item.id, item]));
  assert.equal(records.size, validated.registry.commands.length, 'PR_A_COMMAND_RESULT_COUNT');
  for (const command of validated.registry.commands) {
    const record = records.get(command.id); assert.ok(record, `PR_A_COMMAND_RESULT_MISSING:${command.id}`);
    assert.equal(record.command, command.command, `PR_A_COMMAND_SUBSTITUTED:${command.id}`);
    assert.equal(record.environment, command.environment, `PR_A_COMMAND_ENVIRONMENT:${command.id}`);
    assert.equal(record.status, 'passed', `PR_A_COMMAND_NOT_PASSED:${command.id}`);
    assert.match(record.stdoutDigest, /^[0-9a-f]{64}$/u, `PR_A_COMMAND_STDOUT_DIGEST:${command.id}`);
    assert.match(record.stderrDigest, /^[0-9a-f]{64}$/u, `PR_A_COMMAND_STDERR_DIGEST:${command.id}`);
    validateCommandMarkers(validated, command.id, record.markers || []);
  }
  const evidenceFiles = readdirSync(evidenceDir).filter(name => name.endsWith('.evidence.json')).sort();
  assert.deepEqual(evidenceFiles, manifest.evidenceFiles.slice().sort(), 'PR_A_EVIDENCE_FILE_MANIFEST');
  const results = [];
  for (const name of evidenceFiles) {
    const text = readFileSync(path.join(evidenceDir, name), 'utf8'); assertSanitized(text, name);
    const document = JSON.parse(text);
    assert.equal(document.contractVersion, 'process-lifecycle-pr-a-evidence-3', `PR_A_EVIDENCE_VERSION:${name}`);
    assert.equal(document.baseGitSha, baseGitSha, `PR_A_EVIDENCE_BASE:${name}`);
    assert.equal(document.headGitSha, headGitSha, `PR_A_EVIDENCE_HEAD:${name}`);
    assert.equal(document.workingTreeDigest, digest, `PR_A_EVIDENCE_DIGEST:${name}`);
    assert.deepEqual(document.workflow, manifest.workflow, `PR_A_EVIDENCE_WORKFLOW:${name}`);
    if (document.result === 'not_run') {
      const boundary = validated.registry.notRun.find(item => item.testId === document.testId);
      assert.ok(boundary, `PR_A_NOT_RUN_UNREGISTERED:${document.testId}`); assert.equal(document.reason, boundary.reason, `PR_A_NOT_RUN_REASON:${document.testId}`);
      assert.deepEqual(document.assertion, buildNotRunEvidence(root, validated, boundary), `PR_A_NOT_RUN_ASSERTION:${name}`);
    } else {
      const record = records.get(document.command.id); assert.ok(record, `PR_A_EVIDENCE_COMMAND:${name}`);
      assert.equal(document.command.command, record.command, `PR_A_EVIDENCE_COMMAND_SUBSTITUTED:${name}`);
      const commandRecordDigest = sha256(JSON.stringify(record));
      assert.equal(document.command.commandRecordDigest, commandRecordDigest, `PR_A_COMMAND_RECORD_DIGEST:${name}`);
      const registered = validated.assertions.find(item => item.commandId === document.command.id && markerKey(item.marker) === markerKey(document.assertion.marker));
      assert.ok(registered, `PR_A_PASS_WITHOUT_REGISTERED_MARKER:${name}`);
      assertRuntimeContextDigest(document.assertion.runtimeContext, document.assertion.runtimeContextDigest, name);
      assert.deepEqual(document.assertion.runtimeContext, document.assertion.marker.runtimeContext, `PR_A_RUNTIME_CONTEXT_MARKER_BINDING:${name}`);
      assert.equal(document.assertion.markerDigest, sha256(canonicalJson(document.assertion.marker)), `PR_A_MARKER_DIGEST:${name}`);
      assert.equal(record.markers.some(marker => markerKey(marker) === markerKey(document.assertion.marker)), true, `PR_A_MARKER_NOT_IN_COMMAND:${name}`);
      assert.deepEqual(document.assertion, buildAssertionEvidence(root, validated, registered, document.assertion.marker, commandRecordDigest), `PR_A_EVIDENCE_ASSERTION:${name}`);
    }
    results.push(document);
  }
  validateEvidenceResultCardinality(results, manifest, validated);
  for (const testId of REQUIRED_TEST_IDS) assert.equal(results.some(item => item.testId === testId), true, `PR_A_EVIDENCE_TEST_MISSING:${testId}`);
  return { manifest, commands, results };
};
