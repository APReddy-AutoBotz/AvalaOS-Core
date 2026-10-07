import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export const STUDIO_ACCEPTANCE_TEST_IDS = [
  'STUDIO-004',
  'STUDIO-005',
  'STUDIO-006',
  'STUDIO-008',
  'STUDIO-009',
  'STUDIO-010',
  'STUDIO-011',
];
export const STUDIO_ACCEPTANCE_SUITE_ID = 'studio-postgres-acceptance';
export const STUDIO_ACCEPTANCE_SCOPE = Object.freeze({
  evidenceScope: 'executed-fixture',
  fixtureId: 'synthetic-studio-lifecycle-postgresql-v1',
  organizationId: '97000000-0000-4000-8000-000000000010',
  workspaceId: '97000000-0000-4000-8000-000000000011',
});
export const STUDIO_ACCEPTANCE_SOURCE_REFERENCES = [
  'scripts/testStudioAcceptancePostgres.mjs',
  'scripts/studioAcceptanceEvidence.mjs',
  'scripts/studioArtifactPostgresFixture.mjs',
  'scripts/studioPrivateArtifactPostgresFixture.mjs',
  'scripts/syntheticAiTerminalJournalMigrationTestGuard.mjs',
  'services/studioArtifacts/contracts.ts',
  'supabase/migrations/20260727120000_studio_governed_artifact_authority.sql',
  'supabase/migrations/20260729163251_studio_private_artifact_authority.sql',
  'supabase/migrations/20260730190000_pr217_studio_private_artifact_runtime_forward_fix.sql',
  'supabase/migrations/20260828120000_governed_multisource_studio_pr_b.sql',
];
export const STUDIO_ACCEPTANCE_BRANCH_BY_TEST_ID = Object.freeze({
  'STUDIO-004': 'STUDIO-REVISION_IMMUTABILITY',
  'STUDIO-005': 'STUDIO-THREE_PERSON_APPROVAL',
  'STUDIO-006': 'STUDIO-PRIVATE_RENDITION',
  'STUDIO-008': 'STUDIO-RETENTION',
  'STUDIO-009': 'STUDIO-LEGAL_HOLD',
  'STUDIO-010': 'STUDIO-DELETION',
  'STUDIO-011': 'STUDIO-DELETION_RECONCILIATION',
});

export const STUDIO_ACCEPTANCE_EXACT_ACTUAL = Object.freeze({
  'STUDIO-004': Object.freeze({
    logicalMutationCount: 1, versionDelta: 1, receiptDelta: 1, auditDelta: 1,
    parentImmutable: true, parentContentUnchanged: true, currentVersionAdvanced: true,
    exactReplay: true, replayEffectDelta: 0, foreignTenantDenied: true,
    deniedEffectDelta: 0, lineageBound: true,
  }),
  'STUDIO-005': Object.freeze({
    logicalMutationCount: 1, approvalDelta: 1, receiptDelta: 1, auditDelta: 1,
    authorDenied: true, reviewerDenied: true, independentApprover: true,
    currentApprovedBound: true, exactReplay: true, replayEffectDelta: 0,
    foreignTenantDenied: true, deniedEffectDelta: 0, lineageBound: true,
  }),
  'STUDIO-006': Object.freeze({
    logicalMutationCount: 1, renditionDelta: 1, attemptDelta: 1, receiptDelta: 1,
    auditDelta: 4, exactMetadataBound: true, invalidMetadataDenied: true,
    privateProjectionRedacted: true,
    exactReplay: true, replayEffectDelta: 0, foreignTenantDenied: true,
    deniedEffectDelta: 0, lineageBound: true, fakeStorageUploadCount: 1,
    fakeStorageObjectCount: 1, hostedStorageNotRun: true,
  }),
  'STUDIO-008': Object.freeze({
    logicalMutationCount: 1, extensionDelta: 1, receiptDelta: 1, auditDelta: 1,
    retentionExtended: true, shorteningDenied: true, exactReplay: true,
    replayEffectDelta: 0, foreignTenantDenied: true, deniedEffectDelta: 0,
    lineageBound: true,
  }),
  'STUDIO-009': Object.freeze({
    logicalMutationCount: 1, holdEventDelta: 1, receiptDelta: 1, auditDelta: 1,
    holdActive: true, deletionDenied: true, exactReplay: true,
    replayEffectDelta: 0, foreignTenantDenied: true, deniedEffectDelta: 0,
    lineageBound: true,
  }),
  'STUDIO-010': Object.freeze({
    logicalMutationCount: 1, deletionCompletionDelta: 1, auditDelta: 1,
    lifecycleDeleted: true, tombstoneRecorded: true, exactReplay: true,
    replayEffectDelta: 0, foreignTenantDenied: true, deniedEffectDelta: 0,
    lineageBound: true, fakeStorageDeleteCount: 1, fakeStorageObjectCount: 0,
    hostedStorageNotRun: true,
  }),
  'STUDIO-011': Object.freeze({
    logicalMutationCount: 1, reconciliationCompletionDelta: 1, auditDelta: 1,
    unknownOutcomeRequired: true, currentFenceAccepted: true, staleFenceDenied: true,
    terminalReplayDenied: true, replayEffectDelta: 0, foreignTenantDenied: true,
    deniedEffectDelta: 0, lineageBound: true, tombstoneRecorded: true,
    fakeStorageDeleteCount: 1, fakeStorageProbeCount: 1,
    fakeStorageRecoveryDeleteCount: 0, hostedStorageNotRun: true,
  }),
});

const canonicalText = path => readFileSync(path, 'utf8').replace(/\r\n/gu, '\n');
export const currentStudioAcceptanceSourceDigests = () => Object.fromEntries(
  STUDIO_ACCEPTANCE_SOURCE_REFERENCES.map(path => [
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

export const classifyStudioAcceptanceCaseFailure = phase => (
  String(phase).startsWith('setup-')
    ? { status: 'BLOCKED', failureCode: 'setup_failed' }
    : { status: 'FAIL', failureCode: 'assertion_failed' }
);

export const completeStudioAcceptanceSetupBlocked = ({
  actualByTestId = {},
  failuresByTestId = {},
  blockedByTestId = {},
}) => {
  const completed = { ...blockedByTestId };
  for (const testId of STUDIO_ACCEPTANCE_TEST_IDS) {
    if (!Object.hasOwn(actualByTestId, testId)
      && !Object.hasOwn(failuresByTestId, testId)
      && !Object.hasOwn(completed, testId)) {
      completed[testId] = { failureCode: 'setup_failed' };
    }
  }
  return completed;
};

export const validateStudioAcceptanceActuals = (
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
  if (!sameObject(keys, [...STUDIO_ACCEPTANCE_TEST_IDS].sort())) errors.push('studio-result-set');
  for (const testId of STUDIO_ACCEPTANCE_TEST_IDS) {
    const actual = actualByTestId?.[testId];
    const failure = failuresByTestId?.[testId];
    const blocked = blockedByTestId?.[testId];
    if ([actual, failure, blocked].filter(Boolean).length > 1) errors.push(`studio-result-ambiguous:${testId}`);
    else if (actual && !sameObject(actual, STUDIO_ACCEPTANCE_EXACT_ACTUAL[testId])) errors.push(`studio-actual:${testId}`);
    else if (failure && !sameObject(failure, { failureCode: 'assertion_failed' })) errors.push(`studio-failure:${testId}`);
    else if (blocked && !sameObject(blocked, { failureCode: 'setup_failed' })) errors.push(`studio-blocked:${testId}`);
    else if (!actual && !failure && !blocked) errors.push(`studio-result-missing:${testId}`);
  }
  return errors;
};

export const finalizeStudioAcceptanceExecution = ({
  actualByTestId,
  failuresByTestId = {},
  blockedByTestId = {},
  retainedResultPath,
}) => {
  const errors = validateStudioAcceptanceActuals(actualByTestId, failuresByTestId, blockedByTestId);
  if (errors.length) throw new Error(`STUDIO_ACCEPTANCE_RESULTS_INCOMPLETE:${errors.join(',')}`);
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

export const buildStudioAcceptanceProducer = ({
  actualByTestId,
  failuresByTestId = {},
  blockedByTestId = {},
  identity,
  command,
  cleanupVerified,
}) => {
  const errors = validateStudioAcceptanceActuals(actualByTestId, failuresByTestId, blockedByTestId);
  if (cleanupVerified !== true) errors.push('studio-cleanup');
  if (!/^[0-9a-f]{40}$/u.test(String(identity?.releaseSha ?? ''))) errors.push('studio-release-sha');
  if (!command) errors.push('studio-command');
  if (errors.length) throw new Error(`STUDIO_ACCEPTANCE_EVIDENCE_INVALID:${errors.join(',')}`);
  const sourceDigests = currentStudioAcceptanceSourceDigests();
  const boundIdentity = safeIdentity(identity);
  return {
    schemaVersion: 2,
    results: STUDIO_ACCEPTANCE_TEST_IDS.map(testId => {
      const status = failuresByTestId[testId] ? 'FAIL' : blockedByTestId[testId] ? 'BLOCKED' : 'PASS';
      return {
        suiteId: STUDIO_ACCEPTANCE_SUITE_ID,
        testId,
        status,
        jobId: STUDIO_ACCEPTANCE_SUITE_ID,
        command,
        ...boundIdentity,
        assertionIds: [`${STUDIO_ACCEPTANCE_SUITE_ID}::${testId}`],
        scenarioIds: [`${testId}::retained-contract`],
        branchIds: [STUDIO_ACCEPTANCE_BRANCH_BY_TEST_ID[testId]],
        sourceReferences: STUDIO_ACCEPTANCE_SOURCE_REFERENCES,
        sourceDigests,
        scope: STUDIO_ACCEPTANCE_SCOPE,
        assertionOutcomes: [{ assertionId: `${STUDIO_ACCEPTANCE_SUITE_ID}::${testId}`, status }],
        actual: actualByTestId[testId] ?? null,
        failureCode: failuresByTestId[testId]?.failureCode ?? blockedByTestId[testId]?.failureCode ?? null,
        cleanupVerified: true,
      };
    }),
  };
};

export const writeStudioAcceptanceProducer = (path, options) => {
  const payload = buildStudioAcceptanceProducer(options);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
};

export const validateStudioAcceptanceProducer = ({ emitted, identity, command }) => {
  const errors = [];
  const expectedDigests = currentStudioAcceptanceSourceDigests();
  const seen = new Set();
  if (emitted?.schemaVersion !== 2 || !Array.isArray(emitted?.results)) return ['studio-producer-shape'];
  if (emitted.results.length !== STUDIO_ACCEPTANCE_TEST_IDS.length) errors.push('studio-result-count');
  for (const item of emitted.results) {
    const testId = item?.testId;
    if (!STUDIO_ACCEPTANCE_TEST_IDS.includes(testId) || seen.has(testId)) errors.push(`studio-result-identity:${testId ?? 'missing'}`);
    seen.add(testId);
    if (item?.suiteId !== STUDIO_ACCEPTANCE_SUITE_ID || !['PASS', 'FAIL', 'BLOCKED'].includes(item?.status)) errors.push(`studio-result-status:${testId ?? 'missing'}`);
    if (item?.command !== command) errors.push(`studio-command:${testId ?? 'missing'}`);
    for (const [field, expected] of Object.entries(safeIdentity(identity))) {
      if (String(item?.[field]) !== expected) errors.push(`studio-${field}:${testId ?? 'missing'}`);
    }
    if (!sameObject(item?.scope, STUDIO_ACCEPTANCE_SCOPE)) errors.push(`studio-scope:${testId ?? 'missing'}`);
    if (!sameObject(item?.sourceReferences, STUDIO_ACCEPTANCE_SOURCE_REFERENCES)) errors.push(`studio-sources:${testId ?? 'missing'}`);
    if (!sameObject(item?.sourceDigests, expectedDigests)) errors.push(`studio-source-digests:${testId ?? 'missing'}`);
    if (!sameObject(item?.branchIds, [STUDIO_ACCEPTANCE_BRANCH_BY_TEST_ID[testId]])) errors.push(`studio-branch:${testId ?? 'missing'}`);
    if (!sameObject(item?.assertionIds, [`${STUDIO_ACCEPTANCE_SUITE_ID}::${testId}`])) errors.push(`studio-assertion:${testId ?? 'missing'}`);
    if (!sameObject(item?.scenarioIds, [`${testId}::retained-contract`])) errors.push(`studio-scenario:${testId ?? 'missing'}`);
    if (!sameObject(item?.assertionOutcomes, [{ assertionId: `${STUDIO_ACCEPTANCE_SUITE_ID}::${testId}`, status: item?.status }])) errors.push(`studio-assertion-outcome:${testId ?? 'missing'}`);
    if (item?.cleanupVerified !== true) errors.push(`studio-cleanup:${testId ?? 'missing'}`);
    if (item?.status === 'PASS') {
      if (!sameObject(item?.actual, STUDIO_ACCEPTANCE_EXACT_ACTUAL[testId]) || item?.failureCode !== null) errors.push(`studio-actual:${testId ?? 'missing'}`);
    } else if (item?.status === 'FAIL') {
      if (item?.actual !== null || item?.failureCode !== 'assertion_failed') errors.push(`studio-failure:${testId ?? 'missing'}`);
    } else if (item?.actual !== null || item?.failureCode !== 'setup_failed') errors.push(`studio-blocked:${testId ?? 'missing'}`);
  }
  for (const testId of STUDIO_ACCEPTANCE_TEST_IDS) if (!seen.has(testId)) errors.push(`studio-result-missing:${testId}`);
  return errors;
};
