import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

export const EI_ACCEPTANCE_TEST_IDS = ['EI-001', 'EI-002', 'EI-004', 'EI-005'];
export const EI_ACCEPTANCE_SUITE_ID = 'enterprise-intelligence-postgres-acceptance';
export const EI_ACCEPTANCE_SCOPE = Object.freeze({
  evidenceScope: 'executed-fixture',
  fixtureId: 'synthetic-enterprise-intelligence-postgresql-v1',
  organizationId: '97000000-0000-4000-8000-000000000010',
  workspaceId: '97000000-0000-4000-8000-000000000011',
});
export const EI_ACCEPTANCE_SOURCE_REFERENCES = [
  'scripts/testEnterpriseIntelligenceAcceptancePostgres.mjs',
  'scripts/enterpriseIntelligenceAcceptanceEvidence.mjs',
  'scripts/enterpriseIntelligenceAcceptanceParser.test.ts',
  'scripts/enterpriseIntelligencePostgresFixture.mjs',
  'scripts/syntheticAiTerminalJournalMigrationTestGuard.mjs',
  'services/enterpriseIntelligence.ts',
  'supabase/functions/_shared/enterpriseIntelligenceCommand.ts',
  'supabase/functions/_shared/enterpriseIntelligenceIngestion.ts',
  'supabase/migrations/20260712120000_pr1b_identity_rbac_rls_assess.sql',
  'supabase/migrations/20260804120000_enterprise_intelligence_authority.sql',
  'supabase/migrations/20260805130000_provider_secret_write_intent_recovery.sql',
  'supabase/migrations/20260805140000_enterprise_intelligence_ready_review_corrections.sql',
  'supabase/migrations/20260916181916_assess_document_xlsx_ingestion_authority.sql',
  'supabase/migrations/20261008022445_enterprise_evidence_canonical_size_limit.sql',
  'supabase/migrations/20261009162752_govern_immutable_action_authority.sql',
  'supabase/migrations/20261010025331_legacy_delivery_authority.sql',
];
export const EI_ACCEPTANCE_BRANCH_BY_TEST_ID = Object.freeze({
  'EI-001': 'EI-INGESTION_VALIDATION',
  'EI-002': 'EI-INGESTION_LINEAGE',
  'EI-004': 'EI-COMMAND_REPLAY',
  'EI-005': 'EI-ASSEMBLE_PHASE1_NONEXECUTION',
});

export const EI_ACCEPTANCE_EXACT_ACTUAL = Object.freeze({
  'EI-001': Object.freeze({
    logicalMutationCount: 1, sourceDelta: 1, versionDelta: 1,
    receiptDelta: 1, effectDelta: 2, canonicalMaximumAccepted: true,
    compatibleHistoryPreserved: true, incompatibleHistoryRejected: true,
    oversizeRejected: true, mimeRejected: true, storageBindingRejected: true,
    foreignTenantDenied: true, deniedEffectDelta: 0, extractionParsed: true,
    constraintExact: true, providerDisabled: true, providerEffectDelta: 0,
    hostedStorageNotRun: true, lineageBound: true,
  }),
  'EI-002': Object.freeze({
    logicalMutationCount: 1, sourceDelta: 1, versionDelta: 1,
    receiptDelta: 1, effectDelta: 2, currentVersionBound: true,
    contentHashBound: true, provenanceHashBound: true, lineageBound: true,
    projectionVisible: true, projectionRedacted: true,
    foreignProjectionDenied: true, immutable: true, providerDisabled: true,
    providerJobUsageReservationDelta: 0, hostedStorageNotRun: true,
  }),
  'EI-004': Object.freeze({
    logicalMutationCount: 1, sourceDelta: 1, versionDelta: 1,
    receiptDelta: 1, effectDelta: 2, exactReplay: true,
    sameReceipt: true, sameResource: true, replayProductMutationDelta: 0,
    correlationAttemptDelta: 1, changedPayloadConflict: true,
    revokedAuthorityDenied: true, responseDisclosureDenied: true,
    revokedEffectDelta: 0, lineageBound: true, providerDisabled: true,
    providerEffectDelta: 0, hostedStorageNotRun: true,
  }),
  'EI-005': Object.freeze({
    logicalMutationCount: 1, blueprintDelta: 1, receiptDelta: 1,
    effectDelta: 1, schemaVersionBound: true, statusDraft: true,
    sevenControlsDisabled: true, forbiddenMutationDenied: true,
    deniedEffectDelta: 0, foreignTenantDenied: true, nonServiceDenied: true,
    decisionLineageBound: true, receiptBinding: true, exactReplay: true,
    replayEffectDelta: 0, providerDisabled: true, providerEffectDelta: 0,
    operationalEffectsDisabled: true, hostedExecutionNotRun: true,
  }),
});

const canonicalText = path => readFileSync(path, 'utf8').replace(/\r\n/gu, '\n');
export const currentEnterpriseIntelligenceAcceptanceSourceDigests = () => Object.fromEntries(
  EI_ACCEPTANCE_SOURCE_REFERENCES.map(path => [
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

export const classifyEnterpriseIntelligenceAcceptanceCaseFailure = phase => (
  String(phase).startsWith('setup-')
    ? { status: 'BLOCKED', failureCode: 'setup_failed' }
    : { status: 'FAIL', failureCode: 'assertion_failed' }
);

export const completeEnterpriseIntelligenceAcceptanceSetupBlocked = ({
  actualByTestId = {}, failuresByTestId = {}, blockedByTestId = {},
}) => {
  const completed = { ...blockedByTestId };
  for (const testId of EI_ACCEPTANCE_TEST_IDS) {
    if (!Object.hasOwn(actualByTestId, testId)
      && !Object.hasOwn(failuresByTestId, testId)
      && !Object.hasOwn(completed, testId)) completed[testId] = { failureCode: 'setup_failed' };
  }
  return completed;
};

export const validateEnterpriseIntelligenceAcceptanceActuals = (
  actualByTestId, failuresByTestId = {}, blockedByTestId = {},
) => {
  const errors = [];
  const keys = [...new Set([
    ...Object.keys(actualByTestId ?? {}),
    ...Object.keys(failuresByTestId ?? {}),
    ...Object.keys(blockedByTestId ?? {}),
  ])].sort();
  if (!sameObject(keys, [...EI_ACCEPTANCE_TEST_IDS].sort())) errors.push('enterprise-intelligence-result-set');
  for (const testId of EI_ACCEPTANCE_TEST_IDS) {
    const actual = actualByTestId?.[testId];
    const failure = failuresByTestId?.[testId];
    const blocked = blockedByTestId?.[testId];
    if ([actual, failure, blocked].filter(Boolean).length > 1) errors.push(`enterprise-intelligence-result-ambiguous:${testId}`);
    else if (actual && !sameObject(actual, EI_ACCEPTANCE_EXACT_ACTUAL[testId])) errors.push(`enterprise-intelligence-actual:${testId}`);
    else if (failure && !sameObject(failure, { failureCode: 'assertion_failed' })) errors.push(`enterprise-intelligence-failure:${testId}`);
    else if (blocked && !sameObject(blocked, { failureCode: 'setup_failed' })) errors.push(`enterprise-intelligence-blocked:${testId}`);
    else if (!actual && !failure && !blocked) errors.push(`enterprise-intelligence-result-missing:${testId}`);
  }
  return errors;
};

export const finalizeEnterpriseIntelligenceAcceptanceExecution = ({
  actualByTestId, failuresByTestId = {}, blockedByTestId = {}, retainedResultPath,
}) => {
  const errors = validateEnterpriseIntelligenceAcceptanceActuals(actualByTestId, failuresByTestId, blockedByTestId);
  if (errors.length) throw new Error(`ENTERPRISE_INTELLIGENCE_ACCEPTANCE_RESULTS_INCOMPLETE:${errors.join(',')}`);
  const counts = {
    passed: Object.keys(actualByTestId ?? {}).length,
    failed: Object.keys(failuresByTestId ?? {}).length,
    blocked: Object.keys(blockedByTestId ?? {}).length,
  };
  return { counts, shouldFailProcess: !retainedResultPath && (counts.failed > 0 || counts.blocked > 0) };
};

export const buildEnterpriseIntelligenceAcceptanceProducer = ({
  actualByTestId, failuresByTestId = {}, blockedByTestId = {},
  identity, command, cleanupVerified,
}) => {
  const errors = validateEnterpriseIntelligenceAcceptanceActuals(actualByTestId, failuresByTestId, blockedByTestId);
  if (cleanupVerified !== true) errors.push('enterprise-intelligence-cleanup');
  if (!/^[0-9a-f]{40}$/u.test(String(identity?.releaseSha ?? ''))) errors.push('enterprise-intelligence-release-sha');
  if (!command) errors.push('enterprise-intelligence-command');
  if (errors.length) throw new Error(`ENTERPRISE_INTELLIGENCE_ACCEPTANCE_EVIDENCE_INVALID:${errors.join(',')}`);
  const sourceDigests = currentEnterpriseIntelligenceAcceptanceSourceDigests();
  const boundIdentity = safeIdentity(identity);
  return {
    schemaVersion: 2,
    results: EI_ACCEPTANCE_TEST_IDS.map(testId => {
      const status = failuresByTestId[testId] ? 'FAIL' : blockedByTestId[testId] ? 'BLOCKED' : 'PASS';
      return {
        suiteId: EI_ACCEPTANCE_SUITE_ID, testId, status,
        jobId: EI_ACCEPTANCE_SUITE_ID, command, ...boundIdentity,
        assertionIds: [`${EI_ACCEPTANCE_SUITE_ID}::${testId}`],
        scenarioIds: [`${testId}::retained-contract`],
        branchIds: [EI_ACCEPTANCE_BRANCH_BY_TEST_ID[testId]],
        sourceReferences: EI_ACCEPTANCE_SOURCE_REFERENCES, sourceDigests,
        scope: EI_ACCEPTANCE_SCOPE,
        assertionOutcomes: [{ assertionId: `${EI_ACCEPTANCE_SUITE_ID}::${testId}`, status }],
        actual: actualByTestId[testId] ?? null,
        failureCode: failuresByTestId[testId]?.failureCode ?? blockedByTestId[testId]?.failureCode ?? null,
        cleanupVerified: true,
      };
    }),
  };
};

export const writeEnterpriseIntelligenceAcceptanceProducer = (path, options) => {
  const payload = buildEnterpriseIntelligenceAcceptanceProducer(options);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
};

export const validateEnterpriseIntelligenceAcceptanceProducer = ({ emitted, identity, command }) => {
  const errors = [];
  const expectedDigests = currentEnterpriseIntelligenceAcceptanceSourceDigests();
  const seen = new Set();
  if (emitted?.schemaVersion !== 2 || !Array.isArray(emitted?.results)) return ['enterprise-intelligence-producer-shape'];
  if (emitted.results.length !== EI_ACCEPTANCE_TEST_IDS.length) errors.push('enterprise-intelligence-result-count');
  for (const item of emitted.results) {
    const testId = item?.testId;
    if (!EI_ACCEPTANCE_TEST_IDS.includes(testId) || seen.has(testId)) errors.push(`enterprise-intelligence-result-identity:${testId ?? 'missing'}`);
    seen.add(testId);
    if (item?.suiteId !== EI_ACCEPTANCE_SUITE_ID || !['PASS', 'FAIL', 'BLOCKED'].includes(item?.status)) errors.push(`enterprise-intelligence-result-status:${testId ?? 'missing'}`);
    if (item?.command !== command) errors.push(`enterprise-intelligence-command:${testId ?? 'missing'}`);
    for (const [field, expected] of Object.entries(safeIdentity(identity))) {
      if (String(item?.[field]) !== expected) errors.push(`enterprise-intelligence-${field}:${testId ?? 'missing'}`);
    }
    if (!sameObject(item?.scope, EI_ACCEPTANCE_SCOPE)) errors.push(`enterprise-intelligence-scope:${testId ?? 'missing'}`);
    if (!sameObject(item?.sourceReferences, EI_ACCEPTANCE_SOURCE_REFERENCES)) errors.push(`enterprise-intelligence-sources:${testId ?? 'missing'}`);
    if (!sameObject(item?.sourceDigests, expectedDigests)) errors.push(`enterprise-intelligence-source-digests:${testId ?? 'missing'}`);
    if (!sameObject(item?.branchIds, [EI_ACCEPTANCE_BRANCH_BY_TEST_ID[testId]])) errors.push(`enterprise-intelligence-branch:${testId ?? 'missing'}`);
    if (!sameObject(item?.assertionIds, [`${EI_ACCEPTANCE_SUITE_ID}::${testId}`])) errors.push(`enterprise-intelligence-assertion:${testId ?? 'missing'}`);
    if (!sameObject(item?.scenarioIds, [`${testId}::retained-contract`])) errors.push(`enterprise-intelligence-scenario:${testId ?? 'missing'}`);
    if (!sameObject(item?.assertionOutcomes, [{ assertionId: `${EI_ACCEPTANCE_SUITE_ID}::${testId}`, status: item?.status }])) errors.push(`enterprise-intelligence-assertion-outcome:${testId ?? 'missing'}`);
    if (item?.cleanupVerified !== true) errors.push(`enterprise-intelligence-cleanup:${testId ?? 'missing'}`);
    if (item?.status === 'PASS') {
      if (!sameObject(item?.actual, EI_ACCEPTANCE_EXACT_ACTUAL[testId]) || item?.failureCode !== null) errors.push(`enterprise-intelligence-actual:${testId ?? 'missing'}`);
    } else if (item?.status === 'FAIL') {
      if (item?.actual !== null || item?.failureCode !== 'assertion_failed') errors.push(`enterprise-intelligence-failure:${testId ?? 'missing'}`);
    } else if (item?.actual !== null || item?.failureCode !== 'setup_failed') errors.push(`enterprise-intelligence-blocked:${testId ?? 'missing'}`);
  }
  for (const testId of EI_ACCEPTANCE_TEST_IDS) if (!seen.has(testId)) errors.push(`enterprise-intelligence-result-missing:${testId}`);
  return errors;
};
