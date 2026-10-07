import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

export const GOVERN_ACCEPTANCE_TEST_IDS = [
  'GOVERN-008',
  'GOVERN-009',
  'GOVERN-010',
];
export const GOVERN_ACCEPTANCE_SUITE_ID = 'govern-postgres-acceptance';
export const GOVERN_ACCEPTANCE_SCOPE = Object.freeze({
  evidenceScope: 'executed-fixture',
  fixtureId: 'synthetic-govern-authority-postgresql-v1',
  organizationId: '96000000-0000-4000-8000-000000000010',
  workspaceId: '96000000-0000-4000-8000-000000000011',
});
export const GOVERN_ACCEPTANCE_SOURCE_REFERENCES = [
  'scripts/testGovernAcceptancePostgres.mjs',
  'scripts/governAcceptanceEvidence.mjs',
  'scripts/syntheticAiTerminalJournalMigrationTestGuard.mjs',
  'services/assessV2/reviewDomain.ts',
  'supabase/migrations/20260712120000_pr1b_identity_rbac_rls_assess.sql',
  'supabase/migrations/20260714120000_pr1d_assess_v2_decision_intelligence.sql',
  'supabase/migrations/20260720160000_pr1e_assess_v2_governed_review_handoff.sql',
  'supabase/migrations/20260923142120_pr1e_govern_control_alias_binding.sql',
];
export const GOVERN_ACCEPTANCE_BRANCH_BY_TEST_ID = Object.freeze({
  'GOVERN-008': 'GOVERN-STALE_AUTHORITY',
  'GOVERN-009': 'GOVERN-REVOKED_AUTHORITY',
  'GOVERN-010': 'GOVERN-DUPLICATE_DECISION',
});

export const GOVERN_ACCEPTANCE_EXACT_ACTUAL = Object.freeze({
  'GOVERN-008': Object.freeze({
    logicalMutationCount: 1, caseVersionDelta: 1, resolutionDelta: 1,
    receiptDelta: 1, auditDelta: 1, staleBeforeCommitDenied: true,
    sameIdentityAfterRefresh: true, staleReplayDenied: true,
    currentReplayExact: true, replayEffectDelta: 0,
    foreignTenantDenied: true, nonServiceDenied: true, deniedEffectDelta: 0,
    lineageBound: true, auditBound: true,
  }),
  'GOVERN-009': Object.freeze({
    logicalMutationCount: 1, caseVersionDelta: 1, resolutionDelta: 1,
    receiptDelta: 1, auditDelta: 1, capabilityRevoked: true,
    oldAuthorizationDenied: true, currentAuthorizationDenied: true,
    freshKeyDenied: true, responseDisclosureDenied: true,
    revokedEffectDelta: 0, originalCommitImmutable: true,
    foreignTenantDenied: true, nonServiceDenied: true, deniedEffectDelta: 0,
    lineageBound: true, auditBound: true,
  }),
  'GOVERN-010': Object.freeze({
    logicalMutationCount: 1, caseVersionDelta: 1, resolutionDelta: 1,
    receiptDelta: 1, auditDelta: 1, exactReplay: true,
    replayEffectDelta: 0, changedPayloadConflict: true,
    freshKeyDuplicateDenied: true, duplicateEffectDelta: 0,
    foreignTenantDenied: true, nonServiceDenied: true, deniedEffectDelta: 0,
    lineageBound: true, auditBound: true,
  }),
});

const canonicalText = path => readFileSync(path, 'utf8').replace(/\r\n/gu, '\n');
export const currentGovernAcceptanceSourceDigests = () => Object.fromEntries(
  GOVERN_ACCEPTANCE_SOURCE_REFERENCES.map(path => [
    path,
    createHash('sha256').update(canonicalText(path)).digest('hex'),
  ]),
);

const sameObject = isDeepStrictEqual;
const safeIdentity = identity => ({
  releaseSha: String(identity.releaseSha),
  workflowRunId: String(identity.workflowRunId),
  workflowAttempt: String(identity.workflowAttempt),
  environment: String(identity.environment),
  workflowPath: String(identity.workflowPath),
});

export const classifyGovernAcceptanceCaseFailure = phase => (
  String(phase).startsWith('setup-')
    ? { status: 'BLOCKED', failureCode: 'setup_failed' }
    : { status: 'FAIL', failureCode: 'assertion_failed' }
);

export const completeGovernAcceptanceSetupBlocked = ({
  actualByTestId = {},
  failuresByTestId = {},
  blockedByTestId = {},
}) => {
  const completed = { ...blockedByTestId };
  for (const testId of GOVERN_ACCEPTANCE_TEST_IDS) {
    if (!Object.hasOwn(actualByTestId, testId)
      && !Object.hasOwn(failuresByTestId, testId)
      && !Object.hasOwn(completed, testId)) {
      completed[testId] = { failureCode: 'setup_failed' };
    }
  }
  return completed;
};

export const validateGovernAcceptanceActuals = (
  actualByTestId,
  failuresByTestId = {},
  blockedByTestId = {},
) => {
  const errors = [];
  const keys = [...new Set([
    ...Object.keys(actualByTestId ?? {}),
    ...Object.keys(failuresByTestId ?? {}),
    ...Object.keys(blockedByTestId ?? {}),
  ])].sort();
  if (!sameObject(keys, [...GOVERN_ACCEPTANCE_TEST_IDS].sort())) errors.push('govern-result-set');
  for (const testId of GOVERN_ACCEPTANCE_TEST_IDS) {
    const actual = actualByTestId?.[testId];
    const failure = failuresByTestId?.[testId];
    const blocked = blockedByTestId?.[testId];
    if ([actual, failure, blocked].filter(Boolean).length > 1) errors.push(`govern-result-ambiguous:${testId}`);
    else if (actual && !sameObject(actual, GOVERN_ACCEPTANCE_EXACT_ACTUAL[testId])) errors.push(`govern-actual:${testId}`);
    else if (failure && !sameObject(failure, { failureCode: 'assertion_failed' })) errors.push(`govern-failure:${testId}`);
    else if (blocked && !sameObject(blocked, { failureCode: 'setup_failed' })) errors.push(`govern-blocked:${testId}`);
    else if (!actual && !failure && !blocked) errors.push(`govern-result-missing:${testId}`);
  }
  return errors;
};

export const finalizeGovernAcceptanceExecution = ({
  actualByTestId,
  failuresByTestId = {},
  blockedByTestId = {},
  retainedResultPath,
}) => {
  const errors = validateGovernAcceptanceActuals(actualByTestId, failuresByTestId, blockedByTestId);
  if (errors.length) throw new Error(`GOVERN_ACCEPTANCE_RESULTS_INCOMPLETE:${errors.join(',')}`);
  const counts = {
    passed: Object.keys(actualByTestId ?? {}).length,
    failed: Object.keys(failuresByTestId ?? {}).length,
    blocked: Object.keys(blockedByTestId ?? {}).length,
  };
  return {
    counts,
    shouldFailProcess: !retainedResultPath && (counts.failed > 0 || counts.blocked > 0),
  };
};

export const buildGovernAcceptanceProducer = ({
  actualByTestId,
  failuresByTestId = {},
  blockedByTestId = {},
  identity,
  command,
  cleanupVerified,
}) => {
  const errors = validateGovernAcceptanceActuals(actualByTestId, failuresByTestId, blockedByTestId);
  if (cleanupVerified !== true) errors.push('govern-cleanup');
  if (!/^[0-9a-f]{40}$/u.test(String(identity?.releaseSha ?? ''))) errors.push('govern-release-sha');
  if (!command) errors.push('govern-command');
  if (errors.length) throw new Error(`GOVERN_ACCEPTANCE_EVIDENCE_INVALID:${errors.join(',')}`);
  const sourceDigests = currentGovernAcceptanceSourceDigests();
  const boundIdentity = safeIdentity(identity);
  return {
    schemaVersion: 2,
    results: GOVERN_ACCEPTANCE_TEST_IDS.map(testId => {
      const status = failuresByTestId[testId] ? 'FAIL' : blockedByTestId[testId] ? 'BLOCKED' : 'PASS';
      return {
        suiteId: GOVERN_ACCEPTANCE_SUITE_ID,
        testId,
        status,
        jobId: GOVERN_ACCEPTANCE_SUITE_ID,
        command,
        ...boundIdentity,
        assertionIds: [`${GOVERN_ACCEPTANCE_SUITE_ID}::${testId}`],
        scenarioIds: [`${testId}::retained-contract`],
        branchIds: [GOVERN_ACCEPTANCE_BRANCH_BY_TEST_ID[testId]],
        sourceReferences: GOVERN_ACCEPTANCE_SOURCE_REFERENCES,
        sourceDigests,
        scope: GOVERN_ACCEPTANCE_SCOPE,
        assertionOutcomes: [{ assertionId: `${GOVERN_ACCEPTANCE_SUITE_ID}::${testId}`, status }],
        actual: actualByTestId[testId] ?? null,
        failureCode: failuresByTestId[testId]?.failureCode ?? blockedByTestId[testId]?.failureCode ?? null,
        cleanupVerified: true,
      };
    }),
  };
};

export const writeGovernAcceptanceProducer = (path, options) => {
  const payload = buildGovernAcceptanceProducer(options);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
};

export const validateGovernAcceptanceProducer = ({ emitted, identity, command }) => {
  const errors = [];
  const expectedDigests = currentGovernAcceptanceSourceDigests();
  const seen = new Set();
  if (emitted?.schemaVersion !== 2 || !Array.isArray(emitted?.results)) return ['govern-producer-shape'];
  if (emitted.results.length !== GOVERN_ACCEPTANCE_TEST_IDS.length) errors.push('govern-result-count');
  for (const item of emitted.results) {
    const testId = item?.testId;
    if (!GOVERN_ACCEPTANCE_TEST_IDS.includes(testId) || seen.has(testId)) errors.push(`govern-result-identity:${testId ?? 'missing'}`);
    seen.add(testId);
    if (item?.suiteId !== GOVERN_ACCEPTANCE_SUITE_ID || !['PASS', 'FAIL', 'BLOCKED'].includes(item?.status)) errors.push(`govern-result-status:${testId ?? 'missing'}`);
    if (item?.command !== command) errors.push(`govern-command:${testId ?? 'missing'}`);
    for (const [field, expected] of Object.entries(safeIdentity(identity))) {
      if (String(item?.[field]) !== expected) errors.push(`govern-${field}:${testId ?? 'missing'}`);
    }
    if (!sameObject(item?.scope, GOVERN_ACCEPTANCE_SCOPE)) errors.push(`govern-scope:${testId ?? 'missing'}`);
    if (!sameObject(item?.sourceReferences, GOVERN_ACCEPTANCE_SOURCE_REFERENCES)) errors.push(`govern-sources:${testId ?? 'missing'}`);
    if (!sameObject(item?.sourceDigests, expectedDigests)) errors.push(`govern-source-digests:${testId ?? 'missing'}`);
    if (!sameObject(item?.branchIds, [GOVERN_ACCEPTANCE_BRANCH_BY_TEST_ID[testId]])) errors.push(`govern-branch:${testId ?? 'missing'}`);
    if (!sameObject(item?.assertionIds, [`${GOVERN_ACCEPTANCE_SUITE_ID}::${testId}`])) errors.push(`govern-assertion:${testId ?? 'missing'}`);
    if (!sameObject(item?.scenarioIds, [`${testId}::retained-contract`])) errors.push(`govern-scenario:${testId ?? 'missing'}`);
    if (!sameObject(item?.assertionOutcomes, [{ assertionId: `${GOVERN_ACCEPTANCE_SUITE_ID}::${testId}`, status: item?.status }])) errors.push(`govern-assertion-outcome:${testId ?? 'missing'}`);
    if (item?.cleanupVerified !== true) errors.push(`govern-cleanup:${testId ?? 'missing'}`);
    if (item?.status === 'PASS') {
      if (!sameObject(item?.actual, GOVERN_ACCEPTANCE_EXACT_ACTUAL[testId]) || item?.failureCode !== null) errors.push(`govern-actual:${testId ?? 'missing'}`);
    } else if (item?.status === 'FAIL') {
      if (item?.actual !== null || item?.failureCode !== 'assertion_failed') errors.push(`govern-failure:${testId ?? 'missing'}`);
    } else if (item?.actual !== null || item?.failureCode !== 'setup_failed') errors.push(`govern-blocked:${testId ?? 'missing'}`);
  }
  for (const testId of GOVERN_ACCEPTANCE_TEST_IDS) if (!seen.has(testId)) errors.push(`govern-result-missing:${testId}`);
  return errors;
};
