import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export const ASSESS_V2_ACCEPTANCE_TEST_IDS = ['ASSESS-021', 'ASSESS-022'];
export const ASSESS_V2_TEST_IDS = ASSESS_V2_ACCEPTANCE_TEST_IDS;
export const ASSESS_V2_ACCEPTANCE_SUITE_ID = 'assess-v2-authority';
export const ASSESS_V2_ACCEPTANCE_SCOPE = Object.freeze({
  evidenceScope: 'executed-fixture',
  fixtureId: 'synthetic-assess-v2-postgresql-v1',
  organizationId: '11000000-0000-4000-8000-000000000010',
  workspaceId: '11000000-0000-4000-8000-000000000011',
});
export const ASSESS_V2_ACCEPTANCE_SOURCE_REFERENCES = [
  'scripts/testPr1dMigrations.mjs',
  'scripts/assessV2AcceptanceEvidence.mjs',
  'supabase/migrations/20260712120000_pr1b_identity_rbac_rls_assess.sql',
  'supabase/migrations/20260713120000_pr1c_enterprise_assess_ui_govern_studio_handoff.sql',
  'supabase/migrations/20260714120000_pr1d_assess_v2_decision_intelligence.sql',
  'supabase/migrations/20260715120000_pr1d_decision_integrity_correction.sql',
  'supabase/migrations/20260717120000_pr1d_evidence_attestation_boundary.sql',
  'supabase/migrations/20260719130000_pr1d_author_fact_validation.sql',
  'supabase/migrations/20260720100000_pr1d_fact_source_and_create_hash_hardening.sql',
  'supabase/migrations/20260720120000_pr1d_soft_delete_visibility_hardening.sql',
];
export const ASSESS_V2_ACCEPTANCE_BRANCH_BY_TEST_ID = Object.freeze({
  'ASSESS-021': 'ASSESS-V2_VERSION_CONFLICT',
  'ASSESS-022': 'ASSESS-V2_IDEMPOTENCY_CONFLICT',
});

const exactActual = Object.freeze({
  'ASSESS-021': {
    logicalMutationCount: 1,
    versionDelta: 1,
    receiptDelta: 1,
    auditDelta: 1,
    committedCount: 1,
    versionConflictCount: 1,
    rejectedEffectDelta: 0,
  },
  'ASSESS-022': {
    logicalMutationCount: 1,
    versionDelta: 1,
    receiptDelta: 1,
    auditDelta: 1,
    idempotencyConflict: true,
    originalReceiptPreserved: true,
    committedStatePreserved: true,
    conflictEffectDelta: 0,
  },
});

const canonicalText = path => readFileSync(path, 'utf8').replace(/\r\n/gu, '\n');
export const currentAssessV2AcceptanceSourceDigests = () => Object.fromEntries(
  ASSESS_V2_ACCEPTANCE_SOURCE_REFERENCES.map(path => [
    path,
    createHash('sha256').update(canonicalText(path)).digest('hex'),
  ]),
);

const sameObject = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const safeIdentity = identity => ({
  releaseSha: String(identity.releaseSha),
  workflowRunId: String(identity.workflowRunId),
  workflowAttempt: String(identity.workflowAttempt),
  environment: String(identity.environment),
  workflowPath: String(identity.workflowPath),
});

export const validateAssessV2AcceptanceActuals = (actualByTestId, failuresByTestId = {}) => {
  const errors = [];
  const keys = [...new Set([...Object.keys(actualByTestId ?? {}), ...Object.keys(failuresByTestId ?? {})])].sort();
  if (!sameObject(keys, [...ASSESS_V2_ACCEPTANCE_TEST_IDS].sort())) errors.push('assess-v2-result-set');
  for (const testId of ASSESS_V2_ACCEPTANCE_TEST_IDS) {
    const actual = actualByTestId?.[testId];
    const failure = failuresByTestId?.[testId];
    if (actual && failure) errors.push(`assess-v2-result-ambiguous:${testId}`);
    else if (actual && !sameObject(actual, exactActual[testId])) errors.push(`assess-v2-actual:${testId}`);
    else if (failure && !sameObject(failure, { failureCode: 'assertion_failed' })) errors.push(`assess-v2-failure:${testId}`);
    else if (!actual && !failure) errors.push(`assess-v2-result-missing:${testId}`);
  }
  return errors;
};

export const buildAssessV2AcceptanceProducer = ({ actualByTestId, failuresByTestId = {}, identity, command, cleanupVerified }) => {
  const errors = validateAssessV2AcceptanceActuals(actualByTestId, failuresByTestId);
  if (cleanupVerified !== true) errors.push('assess-v2-cleanup');
  if (!/^[0-9a-f]{40}$/u.test(String(identity?.releaseSha ?? ''))) errors.push('assess-v2-release-sha');
  if (!command) errors.push('assess-v2-command');
  if (errors.length) throw new Error(`ASSESS_V2_ACCEPTANCE_EVIDENCE_INVALID:${errors.join(',')}`);
  const sourceDigests = currentAssessV2AcceptanceSourceDigests();
  const boundIdentity = safeIdentity(identity);
  return {
    schemaVersion: 2,
    results: ASSESS_V2_ACCEPTANCE_TEST_IDS.map(testId => {
      const status = failuresByTestId[testId] ? 'FAIL' : 'PASS';
      return {
        suiteId: ASSESS_V2_ACCEPTANCE_SUITE_ID,
        testId,
        status,
        jobId: ASSESS_V2_ACCEPTANCE_SUITE_ID,
        command,
        ...boundIdentity,
        assertionIds: [`${ASSESS_V2_ACCEPTANCE_SUITE_ID}::${testId}`],
        scenarioIds: [`${testId}::retained-contract`],
        branchIds: [ASSESS_V2_ACCEPTANCE_BRANCH_BY_TEST_ID[testId]],
        sourceReferences: ASSESS_V2_ACCEPTANCE_SOURCE_REFERENCES,
        sourceDigests,
        scope: ASSESS_V2_ACCEPTANCE_SCOPE,
        assertionOutcomes: [{ assertionId: `${ASSESS_V2_ACCEPTANCE_SUITE_ID}::${testId}`, status }],
        actual: actualByTestId[testId] ?? null,
        failureCode: failuresByTestId[testId]?.failureCode ?? null,
        cleanupVerified: true,
      };
    }),
  };
};

export const writeAssessV2AcceptanceProducer = (path, options) => {
  const payload = buildAssessV2AcceptanceProducer(options);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
};

export const validateAssessV2AcceptanceProducer = ({ emitted, identity, command }) => {
  const errors = [];
  const expectedDigests = currentAssessV2AcceptanceSourceDigests();
  const seen = new Set();
  if (emitted?.schemaVersion !== 2 || !Array.isArray(emitted?.results)) return ['assess-v2-producer-shape'];
  if (emitted.results.length !== ASSESS_V2_ACCEPTANCE_TEST_IDS.length) errors.push('assess-v2-result-count');
  for (const item of emitted.results) {
    const testId = item?.testId;
    if (!ASSESS_V2_ACCEPTANCE_TEST_IDS.includes(testId) || seen.has(testId)) errors.push(`assess-v2-result-identity:${testId ?? 'missing'}`);
    seen.add(testId);
    if (item?.suiteId !== ASSESS_V2_ACCEPTANCE_SUITE_ID || !['PASS', 'FAIL'].includes(item?.status)) errors.push(`assess-v2-result-status:${testId ?? 'missing'}`);
    if (item?.command !== command) errors.push(`assess-v2-command:${testId ?? 'missing'}`);
    for (const [field, expected] of Object.entries(safeIdentity(identity))) {
      if (String(item?.[field]) !== expected) errors.push(`assess-v2-${field}:${testId ?? 'missing'}`);
    }
    if (!sameObject(item?.scope, ASSESS_V2_ACCEPTANCE_SCOPE)) errors.push(`assess-v2-scope:${testId ?? 'missing'}`);
    if (!sameObject(item?.sourceReferences, ASSESS_V2_ACCEPTANCE_SOURCE_REFERENCES)) errors.push(`assess-v2-sources:${testId ?? 'missing'}`);
    if (!sameObject(item?.sourceDigests, expectedDigests)) errors.push(`assess-v2-source-digests:${testId ?? 'missing'}`);
    if (!sameObject(item?.branchIds, [ASSESS_V2_ACCEPTANCE_BRANCH_BY_TEST_ID[testId]])) errors.push(`assess-v2-branch:${testId ?? 'missing'}`);
    if (!sameObject(item?.assertionIds, [`${ASSESS_V2_ACCEPTANCE_SUITE_ID}::${testId}`])) errors.push(`assess-v2-assertion:${testId ?? 'missing'}`);
    if (!sameObject(item?.scenarioIds, [`${testId}::retained-contract`])) errors.push(`assess-v2-scenario:${testId ?? 'missing'}`);
    if (!sameObject(item?.assertionOutcomes, [{ assertionId: `${ASSESS_V2_ACCEPTANCE_SUITE_ID}::${testId}`, status: item?.status }])) errors.push(`assess-v2-assertion-outcome:${testId ?? 'missing'}`);
    if (item?.cleanupVerified !== true) errors.push(`assess-v2-cleanup:${testId ?? 'missing'}`);
    if (item?.status === 'PASS') {
      if (!sameObject(item?.actual, exactActual[testId]) || item?.failureCode !== null) errors.push(`assess-v2-actual:${testId ?? 'missing'}`);
    } else if (item?.actual !== null || item?.failureCode !== 'assertion_failed') errors.push(`assess-v2-failure:${testId ?? 'missing'}`);
  }
  for (const testId of ASSESS_V2_ACCEPTANCE_TEST_IDS) if (!seen.has(testId)) errors.push(`assess-v2-result-missing:${testId}`);
  return errors;
};
