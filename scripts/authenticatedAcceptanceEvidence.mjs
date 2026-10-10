import { isDeepStrictEqual } from 'node:util';
import { AUTHENTICATED_ACCEPTANCE_PROJECTS, AUTHENTICATED_ACCEPTANCE_TEST_IDS, AUTHENTICATED_CASE_ASSERTIONS, authenticatedAcceptanceScenario } from './authenticatedAcceptanceCases.mjs';
import { requireAuthenticatedHostedBinding } from './authenticatedAcceptanceProfile.mjs';

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const exact = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
  && isDeepStrictEqual(Object.keys(value).sort(), [...names].sort());
const block = code => ({ status: 'BLOCKED', reason: code, evidenceReferences: [] });
const counts = ['logicalMutations', 'domainWrites', 'generationAttemptWrites', 'receiptWrites', 'auditWrites', 'secretWrites', 'storageWrites',
  'providerCalls', 'paidCalls', 'providerTokens', 'budgetDebits', 'foreignWrites'];
const zeroEffects = ['providerCalls', 'paidCalls', 'providerTokens', 'budgetDebits', 'foreignWrites'];
const readOnlyEffects = ['domainWrites', 'receiptWrites', 'auditWrites', 'secretWrites', 'storageWrites'];

// The expected binding is independently constructed from the controller's
// runtime, catalog and source inventory, not copied out of this manifest.
export function validateAuthenticatedAcceptanceManifest(manifest, expected, catalog) {
  const errors = [];
  if (!exact(manifest, ['schemaVersion', 'binding', 'preflight', 'cases', 'cleanup'])
    || manifest.schemaVersion !== 'authenticated-acceptance-evidence-v1') return ['authenticated-manifest-shape'];
  try { requireAuthenticatedHostedBinding(manifest.binding, expected); }
  catch { return ['authenticated-hosted-binding-invalid']; }
  const p = manifest.preflight;
  if (!exact(p, ['serverBindingVerified', 'realAuthVerified', 'providersDisabled', 'noCustomerData', 'sourceVerified'])
    || Object.values(p).some(value => value !== true)) errors.push('authenticated-preflight-incomplete');
  const cleanup = manifest.cleanup;
  if (!exact(cleanup, ['sessionsRevoked', 'browserStateRemoved', 'syntheticObjectsRemoved', 'providersDisabled',
    'scopedResidue', 'retainedHistoryPreserved', 'digest'])
    || ['sessionsRevoked', 'browserStateRemoved', 'syntheticObjectsRemoved', 'providersDisabled', 'retainedHistoryPreserved']
      .some(key => cleanup?.[key] !== true)
    || cleanup.scopedResidue !== 0 || !DIGEST.test(cleanup.digest ?? '')) errors.push('authenticated-cleanup-incomplete');
  if (!Array.isArray(manifest.cases)) return [...errors, 'authenticated-case-array'];
  const seen = new Set();
  for (const row of manifest.cases) {
    const key = `${row?.testId}:${row?.project}`;
    if (!exact(row, ['testId', 'project', 'scenario', 'status', 'observedAt', 'auth', 'measurements', 'ui', 'lineage', 'failureCode', 'assertions'])) {
      errors.push(`authenticated-case-shape:${key}`); continue;
    }
    if (!AUTHENTICATED_ACCEPTANCE_TEST_IDS.includes(row.testId) || !AUTHENTICATED_ACCEPTANCE_PROJECTS.includes(row.project)
      || seen.has(key)) { errors.push(`authenticated-case-identity:${key}`); continue; }
    seen.add(key);
    const definition = catalog.cases.find(item => item.testId === row.testId);
    if (!definition || definition.environment !== 'hosted_authenticated_synthetic'
      || row.scenario !== authenticatedAcceptanceScenario(row.testId)) errors.push(`authenticated-case-contract:${key}`);
    if (!['PASS', 'FAIL', 'BLOCKED'].includes(row.status)) errors.push(`authenticated-case-status:${key}`);
    if (!Array.isArray(row.assertions)
      || !isDeepStrictEqual(row.assertions.map(a => a?.id).sort(), [...AUTHENTICATED_CASE_ASSERTIONS[row.testId]].sort())
      || row.assertions.some(a => !exact(a, ['id', 'status']) || !['PASS', 'FAIL', 'BLOCKED'].includes(a.status))) errors.push(`authenticated-business-assertions:${key}`);
    else {
      const derived = row.assertions.some(a => a.status === 'FAIL') ? 'FAIL'
        : row.assertions.every(a => a.status === 'PASS') ? 'PASS' : 'BLOCKED';
      if (row.status !== derived) errors.push(`authenticated-assertion-status:${key}`);
    }
    const observed = Date.parse(row.observedAt);
    if (!Number.isFinite(observed) || new Date(observed).toISOString() !== row.observedAt
      || observed < Date.parse(expected.window.startedAt) || observed > Date.parse(expected.window.completedAt)) errors.push(`authenticated-case-window:${key}`);
    if (!exact(row.auth, ['kind', 'persona', 'actorHash', 'sessionHash', 'organizationHash', 'workspaceHash'])
      || row.auth.kind !== 'supabase_auth'
      || ['actorHash', 'sessionHash', 'organizationHash', 'workspaceHash'].some(name => !DIGEST.test(row.auth?.[name] ?? ''))) errors.push(`authenticated-case-auth:${key}`);
    if (!expected.actors.some(actor => actor.project === row.project
      && ['persona', 'actorHash', 'sessionHash', 'organizationHash', 'workspaceHash'].every(name => actor[name] === row.auth?.[name]))) errors.push(`authenticated-actor-binding:${key}`);
    const m = row.measurements;
    if (!exact(m, [...counts, 'beforeHash', 'afterHash', 'setupExcluded', 'authorityVerified', 'denialObserved', 'falseSuccess'])
      || counts.some(name => !Number.isSafeInteger(m?.[name]) || m[name] < 0)
      || !DIGEST.test(m?.beforeHash ?? '') || !DIGEST.test(m?.afterHash ?? '')
      || m.setupExcluded !== true || m.authorityVerified !== true
      || typeof m.denialObserved !== 'boolean' || typeof m.falseSuccess !== 'boolean') {
      errors.push(`authenticated-case-measurements:${key}`); continue;
    }
    if (zeroEffects.some(name => m[name] !== 0)) errors.push(`authenticated-forbidden-effect:${key}`);
    if (!exact(row.ui, ['actionObserved', 'resultObserved', 'source', 'secretExposure'])
      || typeof row.ui.actionObserved !== 'boolean' || typeof row.ui.resultObserved !== 'boolean'
      || row.ui.source !== 'actual-product-browser' || row.ui.secretExposure !== false) errors.push(`authenticated-case-ui:${key}`);
    if (row.status === 'PASS') {
      if (row.failureCode !== null || !row.ui.actionObserved || !row.ui.resultObserved || m.falseSuccess
        || m.logicalMutations !== definition?.expectedMutationCount
        || definition?.expectedDenial === true && m.denialObserved !== true) errors.push(`authenticated-case-outcome:${key}`);
      // STUDIO-003 measures the unchanged artifact separately from its failed
      // attempt, command receipt and two durable audit events.
      if (row.testId === 'STUDIO-003'
        && (m.domainWrites !== 0 || m.generationAttemptWrites !== 1 || m.receiptWrites !== 1
          || m.auditWrites !== 2 || m.secretWrites !== 0 || m.storageWrites !== 0
          || m.beforeHash !== m.afterHash)) errors.push(`authenticated-generation-failure-journal:${key}`);
      if (row.testId !== 'STUDIO-003' && definition?.expectedMutationCount === 0
        && (readOnlyEffects.some(name => m[name] !== 0) || m.beforeHash !== m.afterHash)) errors.push(`authenticated-zero-write:${key}`);
      if (definition?.expectedMutationCount === 0 && row.testId !== 'STUDIO-003'
        && m.generationAttemptWrites !== 0) errors.push(`authenticated-zero-attempt-write:${key}`);
      if (definition?.expectedMutationCount > 0 && (m.domainWrites < 1 || m.beforeHash === m.afterHash)) errors.push(`authenticated-positive-write:${key}`);
      if (definition?.expectedMutationCount > 0 && definition.expectedAudit === 'required for privileged mutation'
        && (m.receiptWrites < 1 || m.auditWrites < 1)) errors.push(`authenticated-privileged-audit:${key}`);
      if (row.testId === 'AI-004' && (m.logicalMutations !== 1 || m.receiptWrites !== 1 || m.auditWrites !== 1 || m.secretWrites !== 1)) errors.push(`authenticated-secret-boundary:${key}`);
    } else if (!['not_executed', 'assertion_failed', 'prerequisite_unavailable'].includes(row.failureCode)) errors.push(`authenticated-failure-code:${key}`);
    if (definition?.expectedLineage) {
      if (!exact(row.lineage, ['chainDigest', 'organizationHash', 'workspaceHash', 'serverDerived', 'foreignTenantDenied'])
        || !DIGEST.test(row.lineage?.chainDigest ?? '') || row.lineage.organizationHash !== row.auth.organizationHash
        || row.lineage.workspaceHash !== row.auth.workspaceHash || row.lineage.serverDerived !== true
        || row.lineage.foreignTenantDenied !== true) errors.push(`authenticated-lineage:${key}`);
    } else if (row.lineage !== null) errors.push(`authenticated-unexpected-lineage:${key}`);
  }
  // Missing cases stay individually blocked. Duplicates, unknown identities,
  // unsafe effects or contradictory evidence invalidate the whole manifest.
  return errors;
}

export function evaluateAuthenticatedAcceptanceCase({ testCase, manifest, expected, catalog, manifestErrors }) {
  if (!manifest || !expected) return block('Authenticated hosted execution is not run; local preparation cannot satisfy this requirement.');
  const errors = manifestErrors ?? validateAuthenticatedAcceptanceManifest(manifest, expected, catalog);
  if (errors.length) return block('Authenticated execution evidence is invalid or incomplete.');
  const rows = manifest.cases.filter(row => row.testId === testCase.testId);
  if (!isDeepStrictEqual(rows.map(row => row.project).sort(), [...AUTHENTICATED_ACCEPTANCE_PROJECTS].sort())) return block('Both authenticated browser projects require exact same-run evidence.');
  const status = rows.some(row => row.status === 'FAIL') ? 'FAIL'
    : rows.every(row => row.status === 'PASS') ? 'PASS' : 'BLOCKED';
  return {
    status, reason: status === 'PASS' ? null : 'Authenticated case assertions failed or were not completed.',
    actual: rows.map(({ project, status, measurements }) => ({ project, status, logicalMutations: measurements.logicalMutations })),
    scope: status === 'PASS' ? { evidenceScope: 'executed-hosted-authenticated-synthetic',
      exerciseDigest: expected.exerciseDigest, backendDigest: expected.backendDigest,
      projects: rows.map(row => ({ project: row.project, ...row.auth })) } : null,
    evidenceReferences: [],
  };
}
