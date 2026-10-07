import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export const APPLICATION_PORTFOLIO_TEST_IDS = ['APPS-001', 'APPS-002', 'APPS-003', 'APPS-004', 'APPS-005'];
export const APPLICATION_PORTFOLIO_SUITE_ID = 'application-portfolio';
export const APPLICATION_PORTFOLIO_SCOPE = Object.freeze({
  evidenceScope: 'executed-fixture',
  fixtureId: 'synthetic-application-portfolio-postgresql-v1',
  organizationId: '22222222-2222-4222-8222-222222222222',
  workspaceId: '33333333-3333-4333-8333-333333333333',
});
export const APPLICATION_PORTFOLIO_SOURCE_REFERENCES = [
  'scripts/testPr1gMigrations.mjs',
  'scripts/applicationPortfolioAcceptanceEvidence.mjs',
  'services/assessV2/applicationPortfolio.ts',
  'supabase/migrations/20260712120000_pr1b_identity_rbac_rls_assess.sql',
  'supabase/migrations/20260722120000_pr1g_application_portfolio.sql',
  'supabase/migrations/20260726120000_pr1g_authority_concurrency_correction.sql',
  'supabase/migrations/20260727090000_pr1b_membership_role_scope_trigger_forward_fix.sql',
];
export const APPLICATION_PORTFOLIO_BRANCH_BY_TEST_ID = Object.freeze({
  'APPS-001': 'APPS-APPLICATION_CREATE',
  'APPS-002': 'APPS-ASSESSMENT_SNAPSHOT',
  'APPS-003': 'APPS-MODERNIZATION_DISPOSITION',
  'APPS-004': 'APPS-CROSS_WORKSPACE_DENIAL',
  'APPS-005': 'APPS-REPLAY',
});

const canonicalText = path => readFileSync(path, 'utf8').replace(/\r\n/gu, '\n');
export const currentApplicationPortfolioSourceDigests = () => Object.fromEntries(
  APPLICATION_PORTFOLIO_SOURCE_REFERENCES.map(path => [
    path,
    createHash('sha256').update(canonicalText(path)).digest('hex'),
  ]),
);

const exactActual = Object.freeze({
  'APPS-001': {
    applicationMutationCount: 1, receiptDelta: 1, auditDelta: 1,
    serviceRpcBoundary: true, resourceBound: true, receiptBound: true, auditBound: true,
  },
  'APPS-002': {
    assessmentMutationCount: 1, receiptDelta: 1, auditDelta: 1,
    metadataBound: true, dimensionCount: 7, recommendationCount: 1,
    canonicalDimensions: true, recommendationBound: true, serverDerived: true,
  },
  'APPS-003': {
    assessmentMutationCount: 1, receiptDelta: 1, auditDelta: 1,
    disposition: 'Enable native API/event integration', confidence: 'Partially Evidenced',
    hardGates: [], prerequisites: [], alternativesRejected: ['No rejected alternative without evidence.'],
  },
  'APPS-004': {
    applicationMutationCount: 0, receiptDelta: 0, auditDelta: 0,
    foreignWorkspaceDenied: true, denialCode: 'PR1B_IDEMPOTENCY_CONFLICT',
    sourceStateUnchanged: true, targetStateUnchanged: true,
  },
  'APPS-005': {
    applicationMutationCount: 1, receiptDelta: 1, auditDelta: 1,
    exactReplay: true, changedPayloadConflict: true,
    replayEffectDelta: 0, conflictEffectDelta: 0,
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

export const validateApplicationPortfolioAcceptanceActuals = (actualByTestId, failuresByTestId = {}) => {
  const errors = [];
  const keys = [...new Set([...Object.keys(actualByTestId ?? {}), ...Object.keys(failuresByTestId ?? {})])].sort();
  if (!sameObject(keys, [...APPLICATION_PORTFOLIO_TEST_IDS].sort())) errors.push('application-portfolio-result-set');
  for (const testId of APPLICATION_PORTFOLIO_TEST_IDS) {
    const actual = actualByTestId?.[testId];
    const failure = failuresByTestId?.[testId];
    if (actual && failure) errors.push(`application-portfolio-result-ambiguous:${testId}`);
    else if (actual && !sameObject(actual, exactActual[testId])) errors.push(`application-portfolio-actual:${testId}`);
    else if (failure && !sameObject(failure, { failureCode: 'assertion_failed' })) errors.push(`application-portfolio-failure:${testId}`);
    else if (!actual && !failure) errors.push(`application-portfolio-result-missing:${testId}`);
  }
  return errors;
};

export const buildApplicationPortfolioAcceptanceProducer = ({ actualByTestId, failuresByTestId = {}, identity, command, cleanupVerified }) => {
  const errors = validateApplicationPortfolioAcceptanceActuals(actualByTestId, failuresByTestId);
  if (cleanupVerified !== true) errors.push('application-portfolio-cleanup');
  if (!/^[0-9a-f]{40}$/u.test(String(identity?.releaseSha ?? ''))) errors.push('application-portfolio-release-sha');
  if (!command) errors.push('application-portfolio-command');
  if (errors.length) throw new Error(`APPLICATION_PORTFOLIO_ACCEPTANCE_EVIDENCE_INVALID:${errors.join(',')}`);
  const sourceDigests = currentApplicationPortfolioSourceDigests();
  const boundIdentity = safeIdentity(identity);
  return {
    schemaVersion: 2,
    results: APPLICATION_PORTFOLIO_TEST_IDS.map(testId => {
      const status = failuresByTestId[testId] ? 'FAIL' : 'PASS';
      return {
        suiteId: APPLICATION_PORTFOLIO_SUITE_ID,
        testId,
        status,
        jobId: APPLICATION_PORTFOLIO_SUITE_ID,
        command,
        ...boundIdentity,
        assertionIds: [`${APPLICATION_PORTFOLIO_SUITE_ID}::${testId}`],
        scenarioIds: [`${testId}::retained-contract`],
        branchIds: [APPLICATION_PORTFOLIO_BRANCH_BY_TEST_ID[testId]],
        sourceReferences: APPLICATION_PORTFOLIO_SOURCE_REFERENCES,
        sourceDigests,
        scope: APPLICATION_PORTFOLIO_SCOPE,
        assertionOutcomes: [{ assertionId: `${APPLICATION_PORTFOLIO_SUITE_ID}::${testId}`, status }],
        actual: actualByTestId[testId] ?? null,
        failureCode: failuresByTestId[testId]?.failureCode ?? null,
        cleanupVerified: true,
      };
    }),
  };
};

export const writeApplicationPortfolioAcceptanceProducer = (path, options) => {
  const payload = buildApplicationPortfolioAcceptanceProducer(options);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
};

export const validateApplicationPortfolioAcceptanceProducer = ({ emitted, identity, command }) => {
  const errors = [];
  const expectedDigests = currentApplicationPortfolioSourceDigests();
  const seen = new Set();
  if (emitted?.schemaVersion !== 2 || !Array.isArray(emitted?.results)) return ['application-portfolio-producer-shape'];
  if (emitted.results.length !== APPLICATION_PORTFOLIO_TEST_IDS.length) errors.push('application-portfolio-result-count');
  for (const item of emitted.results) {
    const testId = item?.testId;
    if (!APPLICATION_PORTFOLIO_TEST_IDS.includes(testId) || seen.has(testId)) errors.push(`application-portfolio-result-identity:${testId ?? 'missing'}`);
    seen.add(testId);
    if (item?.suiteId !== APPLICATION_PORTFOLIO_SUITE_ID || !['PASS', 'FAIL'].includes(item?.status)) errors.push(`application-portfolio-result-status:${testId ?? 'missing'}`);
    if (item?.command !== command) errors.push(`application-portfolio-command:${testId ?? 'missing'}`);
    for (const [field, value] of Object.entries(safeIdentity(identity))) if (String(item?.[field]) !== value) errors.push(`application-portfolio-${field}:${testId ?? 'missing'}`);
    if (!sameObject(item?.scope, APPLICATION_PORTFOLIO_SCOPE)) errors.push(`application-portfolio-scope:${testId ?? 'missing'}`);
    if (!sameObject(item?.sourceReferences, APPLICATION_PORTFOLIO_SOURCE_REFERENCES)) errors.push(`application-portfolio-sources:${testId ?? 'missing'}`);
    if (!sameObject(item?.sourceDigests, expectedDigests)) errors.push(`application-portfolio-source-digests:${testId ?? 'missing'}`);
    if (item?.cleanupVerified !== true) errors.push(`application-portfolio-cleanup:${testId ?? 'missing'}`);
    if (item?.status === 'PASS') {
      if (!sameObject(item?.actual, exactActual[testId]) || item?.failureCode !== null) errors.push(`application-portfolio-actual:${testId ?? 'missing'}`);
    } else if (item?.actual !== null || item?.failureCode !== 'assertion_failed') errors.push(`application-portfolio-failure:${testId ?? 'missing'}`);
  }
  for (const testId of APPLICATION_PORTFOLIO_TEST_IDS) if (!seen.has(testId)) errors.push(`application-portfolio-result-missing:${testId}`);
  return errors;
};
