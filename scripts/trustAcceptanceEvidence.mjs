import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export const TRUST_TEST_IDS = ['TRUST-001', 'TRUST-002', 'TRUST-003', 'TRUST-004', 'TRUST-005'];
export const TRUST_SUITE_ID = 'trust-authority';
export const TRUST_SCOPE = Object.freeze({
  evidenceScope: 'executed-fixture',
  fixtureId: 'synthetic-trust-postgresql-v1',
  organizationId: '88000000-0000-4000-8000-000000000010',
  workspaceId: '88000000-0000-4000-8000-000000000011',
});
export const TRUST_SOURCE_REFERENCES = [
  'scripts/testTrustAssurancePostgres.mjs',
  'scripts/trustAcceptanceEvidence.mjs',
  'services/trustAssurance/domain.ts',
  'supabase/migrations/20260808190000_trust_assurance_evidence_hub.sql',
];
export const TRUST_BRANCH_BY_TEST_ID = Object.freeze({
  'TRUST-001': 'TRUST-CLAIM_EVIDENCE_SELECTION',
  'TRUST-002': 'TRUST-PUBLICATION_SOD',
  'TRUST-003': 'TRUST-IMMUTABLE_EVIDENCE',
  'TRUST-004': 'TRUST-CROSS_TENANT_DENIAL',
  'TRUST-005': 'TRUST-AUDIT_TRUTH',
});

const canonicalText = path => readFileSync(path, 'utf8').replace(/\r\n/gu, '\n');
export const currentTrustSourceDigests = () => Object.fromEntries(TRUST_SOURCE_REFERENCES.map(path => [
  path,
  createHash('sha256').update(canonicalText(path)).digest('hex'),
]));

const exactActual = Object.freeze({
  'TRUST-001': {
    domainMutationCount: 1, receiptDelta: 1, auditDelta: 1,
    reviewedVersionBound: true, reviewedHashBound: true, ancestryBound: true,
  },
  'TRUST-002': {
    publicationMutationCount: 1, receiptDelta: 1, auditDelta: 1,
    distinctActiveActors: 3, sameActorDenied: true, deniedEffectDelta: 0,
  },
  'TRUST-003': {
    registrationMutationCount: 1, receiptDelta: 1, auditDelta: 1,
    serviceRpcBoundary: true, staleReplacementDenied: true,
    canonicalVersionUnchanged: true, canonicalHashUnchanged: true,
    pointerUnchanged: true, deniedEffectDelta: 0,
  },
  'TRUST-004': {
    foreignCallerDenied: true, foreignResourceDenied: true,
    primaryEffectDelta: 0, foreignEffectDelta: 0,
  },
  'TRUST-005': {
    domainMutationCount: 1, receiptDelta: 1, auditDelta: 1,
    semanticReceipt: true, semanticAudit: true,
    replayEffectDelta: 0, auditFailureEffectDelta: 0,
  },
});

const sameObject = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const safeIdentity = identity => ({
  releaseSha: String(identity.releaseSha),
  workflowRunId: String(identity.workflowRunId),
  workflowAttempt: String(identity.workflowAttempt),
  environment: String(identity.environment),
  workflowPath: String(identity.workflowPath),
});

export const validateTrustAcceptanceActuals = (actualByTestId, failuresByTestId = {}) => {
  const errors = [];
  const keys = [...new Set([...Object.keys(actualByTestId ?? {}), ...Object.keys(failuresByTestId ?? {})])].sort();
  if (!sameObject(keys, [...TRUST_TEST_IDS].sort())) errors.push('trust-result-set');
  for (const testId of TRUST_TEST_IDS) {
    const actual = actualByTestId?.[testId];
    const failure = failuresByTestId?.[testId];
    if (actual && failure) errors.push(`trust-result-ambiguous:${testId}`);
    else if (actual && !sameObject(actual, exactActual[testId])) errors.push(`trust-actual:${testId}`);
    else if (failure && !sameObject(failure, { failureCode: 'assertion_failed' })) errors.push(`trust-failure:${testId}`);
    else if (!actual && !failure) errors.push(`trust-result-missing:${testId}`);
  }
  return errors;
};

export const buildTrustAcceptanceProducer = ({ actualByTestId, failuresByTestId = {}, identity, command, cleanupVerified }) => {
  const errors = validateTrustAcceptanceActuals(actualByTestId, failuresByTestId);
  if (cleanupVerified !== true) errors.push('trust-cleanup');
  if (!/^[0-9a-f]{40}$/u.test(String(identity?.releaseSha ?? ''))) errors.push('trust-release-sha');
  if (!command) errors.push('trust-command');
  if (errors.length) throw new Error(`TRUST_ACCEPTANCE_EVIDENCE_INVALID:${errors.join(',')}`);
  const sourceDigests = currentTrustSourceDigests();
  const boundIdentity = safeIdentity(identity);
  return {
    schemaVersion: 2,
    results: TRUST_TEST_IDS.map(testId => {
      const status = failuresByTestId[testId] ? 'FAIL' : 'PASS';
      return ({
      suiteId: TRUST_SUITE_ID,
      testId,
      status,
      jobId: TRUST_SUITE_ID,
      command,
      ...boundIdentity,
      assertionIds: [`${TRUST_SUITE_ID}::${testId}`],
      scenarioIds: [`${testId}::retained-contract`],
      branchIds: [TRUST_BRANCH_BY_TEST_ID[testId]],
      sourceReferences: TRUST_SOURCE_REFERENCES,
      sourceDigests,
      scope: TRUST_SCOPE,
      assertionOutcomes: [{ assertionId: `${TRUST_SUITE_ID}::${testId}`, status }],
      actual: actualByTestId[testId] ?? null,
      failureCode: failuresByTestId[testId]?.failureCode ?? null,
      cleanupVerified: true,
    });}),
  };
};

export const writeTrustAcceptanceProducer = (path, options) => {
  const payload = buildTrustAcceptanceProducer(options);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
};

export const validateTrustAcceptanceProducer = ({ emitted, identity, command }) => {
  const errors = [];
  const expectedDigests = currentTrustSourceDigests();
  const seen = new Set();
  if (emitted?.schemaVersion !== 2 || !Array.isArray(emitted?.results)) return ['trust-producer-shape'];
  if (emitted.results.length !== TRUST_TEST_IDS.length) errors.push('trust-result-count');
  for (const item of emitted.results) {
    const testId = item?.testId;
    if (!TRUST_TEST_IDS.includes(testId) || seen.has(testId)) errors.push(`trust-result-identity:${testId ?? 'missing'}`);
    seen.add(testId);
    if (item?.suiteId !== TRUST_SUITE_ID || !['PASS', 'FAIL'].includes(item?.status)) errors.push(`trust-result-status:${testId ?? 'missing'}`);
    if (item?.command !== command) errors.push(`trust-command:${testId ?? 'missing'}`);
    for (const [field, value] of Object.entries(safeIdentity(identity))) if (String(item?.[field]) !== value) errors.push(`trust-${field}:${testId ?? 'missing'}`);
    if (!sameObject(item?.scope, TRUST_SCOPE)) errors.push(`trust-scope:${testId ?? 'missing'}`);
    if (!sameObject(item?.sourceReferences, TRUST_SOURCE_REFERENCES)) errors.push(`trust-sources:${testId ?? 'missing'}`);
    if (!sameObject(item?.sourceDigests, expectedDigests)) errors.push(`trust-source-digests:${testId ?? 'missing'}`);
    if (item?.cleanupVerified !== true) errors.push(`trust-cleanup:${testId ?? 'missing'}`);
    if (item?.status === 'PASS') {
      if (!sameObject(item?.actual, exactActual[testId]) || item?.failureCode !== null) errors.push(`trust-actual:${testId ?? 'missing'}`);
    } else if (item?.actual !== null || item?.failureCode !== 'assertion_failed') errors.push(`trust-failure:${testId ?? 'missing'}`);
  }
  for (const testId of TRUST_TEST_IDS) if (!seen.has(testId)) errors.push(`trust-result-missing:${testId}`);
  return errors;
};
