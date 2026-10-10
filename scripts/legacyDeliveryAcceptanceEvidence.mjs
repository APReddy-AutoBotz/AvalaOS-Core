import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

export const LEGACY_DELIVERY_ACCEPTANCE_TEST_IDS = ['DELIVERY-007', 'DELIVERY-008'];
export const LEGACY_DELIVERY_ACCEPTANCE_SUITE_ID = 'legacy-delivery-postgres-acceptance';
export const LEGACY_DELIVERY_ACCEPTANCE_SCOPE = Object.freeze({
  evidenceScope: 'executed-fixture',
  fixtureId: 'synthetic-legacy-delivery-authority-postgresql-v1',
  organizationId: 'a2000000-0000-4000-8000-000000000010',
  workspaceId: 'a2000000-0000-4000-8000-000000000011',
});
export const LEGACY_DELIVERY_ACCEPTANCE_SOURCE_REFERENCES = [
  "scripts/legacyDeliveryAuthorityPostgres.mjs",
  "scripts/legacyDeliveryPostgresFixture.mjs",
  "scripts/legacyDeliveryAcceptanceEvidence.mjs",
  "scripts/syntheticAiTerminalJournalMigrationTestGuard.mjs",
  "services/deliveryPolicy.ts",
  "services/deliveryWorkflowPolicy.ts",
  "supabase/migrations/20260712120000_pr1b_identity_rbac_rls_assess.sql",
  "supabase/migrations/20260607152500_m5_2g_a_delivery_work_items_authority.sql",
  "supabase/migrations/20261010025331_legacy_delivery_authority.sql"
];
export const LEGACY_DELIVERY_ACCEPTANCE_BRANCH_BY_TEST_ID = Object.freeze({
  "DELIVERY-007": "DELIVERY-DUPLICATE_IMPORT",
  "DELIVERY-008": "DELIVERY-RETAINED_LINEAGE"
});
export const LEGACY_DELIVERY_ACCEPTANCE_EXACT_ACTUAL = Object.freeze(Object.fromEntries(Object.entries({
  "DELIVERY-007": {
    "logicalMutationCount": 1,
    "itemDelta": 2,
    "importDelta": 1,
    "receiptDelta": 1,
    "auditDelta": 1,
    "exactReplay": true,
    "replayEffectDelta": 0,
    "freshKeyDuplicateDenied": true,
    "duplicateEffectDelta": 0,
    "changedPayloadConflict": true,
    "sourceDriftDenied": true,
    "serverLineageBound": true,
    "foreignTenantDenied": true,
    "nonServiceDenied": true,
    "deniedEffectDelta": 0
  },
  "DELIVERY-008": {
    "logicalMutationCount": 1,
    "taskDelta": 0,
    "versionDelta": 1,
    "retentionTransition": true,
    "receiptDelta": 1,
    "auditDelta": 1,
    "hardDeleteDenied": true,
    "physicalDeleteDelta": 0,
    "lineageUnchanged": true,
    "retainedQueryVisible": true,
    "foreignTenantDenied": true,
    "nonServiceDenied": true,
    "deniedEffectDelta": 0
  }
}).map(([key,value]) => [key,Object.freeze(value)])));

const canonicalText = path => readFileSync(path, 'utf8').replace(/\r\n/gu, '\n');
export const currentLegacyDeliveryAcceptanceSourceDigests = () => Object.fromEntries(
  LEGACY_DELIVERY_ACCEPTANCE_SOURCE_REFERENCES.map(path => [
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

export const classifyLegacyDeliveryAcceptanceCaseFailure = phase => (
  String(phase).startsWith('setup-')
    ? { status: 'BLOCKED', failureCode: 'setup_failed' }
    : { status: 'FAIL', failureCode: 'assertion_failed' }
);

export const completeLegacyDeliveryAcceptanceSetupBlocked = ({
  actualByTestId = {},
  failuresByTestId = {},
  blockedByTestId = {},
}) => {
  const completed = { ...blockedByTestId };
  for (const testId of LEGACY_DELIVERY_ACCEPTANCE_TEST_IDS) {
    if (!Object.hasOwn(actualByTestId, testId)
      && !Object.hasOwn(failuresByTestId, testId)
      && !Object.hasOwn(completed, testId)) {
      completed[testId] = { failureCode: 'setup_failed' };
    }
  }
  return completed;
};

export const validateLegacyDeliveryAcceptanceActuals = (
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
  if (!sameObject(keys, [...LEGACY_DELIVERY_ACCEPTANCE_TEST_IDS].sort())) errors.push('legacy-delivery-result-set');
  for (const testId of LEGACY_DELIVERY_ACCEPTANCE_TEST_IDS) {
    const actual = actualByTestId?.[testId];
    const failure = failuresByTestId?.[testId];
    const blocked = blockedByTestId?.[testId];
    if ([actual, failure, blocked].filter(Boolean).length > 1) errors.push(`legacy-delivery-result-ambiguous:${testId}`);
    else if (actual && !sameObject(actual, LEGACY_DELIVERY_ACCEPTANCE_EXACT_ACTUAL[testId])) errors.push(`legacy-delivery-actual:${testId}`);
    else if (failure && !sameObject(failure, { failureCode: 'assertion_failed' })) errors.push(`legacy-delivery-failure:${testId}`);
    else if (blocked && !sameObject(blocked, { failureCode: 'setup_failed' })) errors.push(`legacy-delivery-blocked:${testId}`);
    else if (!actual && !failure && !blocked) errors.push(`legacy-delivery-result-missing:${testId}`);
  }
  return errors;
};

export const finalizeLegacyDeliveryAcceptanceExecution = ({
  actualByTestId,
  failuresByTestId = {},
  blockedByTestId = {},
  retainedResultPath,
}) => {
  const errors = validateLegacyDeliveryAcceptanceActuals(actualByTestId, failuresByTestId, blockedByTestId);
  if (errors.length) throw new Error(`LEGACY_DELIVERY_ACCEPTANCE_RESULTS_INCOMPLETE:${errors.join(',')}`);
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

export const buildLegacyDeliveryAcceptanceProducer = ({
  actualByTestId,
  failuresByTestId = {},
  blockedByTestId = {},
  identity,
  command,
  cleanupVerified,
}) => {
  const errors = validateLegacyDeliveryAcceptanceActuals(actualByTestId, failuresByTestId, blockedByTestId);
  if (cleanupVerified !== true) errors.push('legacy-delivery-cleanup');
  if (!/^[0-9a-f]{40}$/u.test(String(identity?.releaseSha ?? ''))) errors.push('legacy-delivery-release-sha');
  if (!command) errors.push('legacy-delivery-command');
  if (errors.length) throw new Error(`LEGACY_DELIVERY_ACCEPTANCE_EVIDENCE_INVALID:${errors.join(',')}`);
  const sourceDigests = currentLegacyDeliveryAcceptanceSourceDigests();
  const boundIdentity = safeIdentity(identity);
  return {
    schemaVersion: 2,
    results: LEGACY_DELIVERY_ACCEPTANCE_TEST_IDS.map(testId => {
      const status = failuresByTestId[testId] ? 'FAIL' : blockedByTestId[testId] ? 'BLOCKED' : 'PASS';
      return {
        suiteId: LEGACY_DELIVERY_ACCEPTANCE_SUITE_ID,
        testId,
        status,
        jobId: LEGACY_DELIVERY_ACCEPTANCE_SUITE_ID,
        command,
        ...boundIdentity,
        assertionIds: [`${LEGACY_DELIVERY_ACCEPTANCE_SUITE_ID}::${testId}`],
        scenarioIds: [`${testId}::retained-contract`],
        branchIds: [LEGACY_DELIVERY_ACCEPTANCE_BRANCH_BY_TEST_ID[testId]],
        sourceReferences: LEGACY_DELIVERY_ACCEPTANCE_SOURCE_REFERENCES,
        sourceDigests,
        scope: LEGACY_DELIVERY_ACCEPTANCE_SCOPE,
        assertionOutcomes: [{ assertionId: `${LEGACY_DELIVERY_ACCEPTANCE_SUITE_ID}::${testId}`, status }],
        actual: actualByTestId[testId] ?? null,
        failureCode: failuresByTestId[testId]?.failureCode ?? blockedByTestId[testId]?.failureCode ?? null,
        cleanupVerified: true,
      };
    }),
  };
};

export const writeLegacyDeliveryAcceptanceProducer = (path, options) => {
  const payload = buildLegacyDeliveryAcceptanceProducer(options);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
};

export const validateLegacyDeliveryAcceptanceProducer = ({ emitted, identity, command }) => {
  const errors = [];
  const expectedDigests = currentLegacyDeliveryAcceptanceSourceDigests();
  const seen = new Set();
  if (emitted?.schemaVersion !== 2 || !Array.isArray(emitted?.results)) return ['legacy-delivery-producer-shape'];
  if (emitted.results.length !== LEGACY_DELIVERY_ACCEPTANCE_TEST_IDS.length) errors.push('legacy-delivery-result-count');
  for (const item of emitted.results) {
    const testId = item?.testId;
    if (!LEGACY_DELIVERY_ACCEPTANCE_TEST_IDS.includes(testId) || seen.has(testId)) errors.push(`legacy-delivery-result-identity:${testId ?? 'missing'}`);
    seen.add(testId);
    if (item?.suiteId !== LEGACY_DELIVERY_ACCEPTANCE_SUITE_ID || !['PASS', 'FAIL', 'BLOCKED'].includes(item?.status)) errors.push(`legacy-delivery-result-status:${testId ?? 'missing'}`);
    if (item?.command !== command) errors.push(`legacy-delivery-command:${testId ?? 'missing'}`);
    for (const [field, expected] of Object.entries(safeIdentity(identity))) {
      if (String(item?.[field]) !== expected) errors.push(`legacy-delivery-${field}:${testId ?? 'missing'}`);
    }
    if (!sameObject(item?.scope, LEGACY_DELIVERY_ACCEPTANCE_SCOPE)) errors.push(`legacy-delivery-scope:${testId ?? 'missing'}`);
    if (!sameObject(item?.sourceReferences, LEGACY_DELIVERY_ACCEPTANCE_SOURCE_REFERENCES)) errors.push(`legacy-delivery-sources:${testId ?? 'missing'}`);
    if (!sameObject(item?.sourceDigests, expectedDigests)) errors.push(`legacy-delivery-source-digests:${testId ?? 'missing'}`);
    if (!sameObject(item?.branchIds, [LEGACY_DELIVERY_ACCEPTANCE_BRANCH_BY_TEST_ID[testId]])) errors.push(`legacy-delivery-branch:${testId ?? 'missing'}`);
    if (!sameObject(item?.assertionIds, [`${LEGACY_DELIVERY_ACCEPTANCE_SUITE_ID}::${testId}`])) errors.push(`legacy-delivery-assertion:${testId ?? 'missing'}`);
    if (!sameObject(item?.scenarioIds, [`${testId}::retained-contract`])) errors.push(`legacy-delivery-scenario:${testId ?? 'missing'}`);
    if (!sameObject(item?.assertionOutcomes, [{ assertionId: `${LEGACY_DELIVERY_ACCEPTANCE_SUITE_ID}::${testId}`, status: item?.status }])) errors.push(`legacy-delivery-assertion-outcome:${testId ?? 'missing'}`);
    if (item?.cleanupVerified !== true) errors.push(`legacy-delivery-cleanup:${testId ?? 'missing'}`);
    if (item?.status === 'PASS') {
      if (!sameObject(item?.actual, LEGACY_DELIVERY_ACCEPTANCE_EXACT_ACTUAL[testId]) || item?.failureCode !== null) errors.push(`legacy-delivery-actual:${testId ?? 'missing'}`);
    } else if (item?.status === 'FAIL') {
      if (item?.actual !== null || item?.failureCode !== 'assertion_failed') errors.push(`legacy-delivery-failure:${testId ?? 'missing'}`);
    } else if (item?.actual !== null || item?.failureCode !== 'setup_failed') errors.push(`legacy-delivery-blocked:${testId ?? 'missing'}`);
  }
  for (const testId of LEGACY_DELIVERY_ACCEPTANCE_TEST_IDS) if (!seen.has(testId)) errors.push(`legacy-delivery-result-missing:${testId}`);
  return errors;
};
