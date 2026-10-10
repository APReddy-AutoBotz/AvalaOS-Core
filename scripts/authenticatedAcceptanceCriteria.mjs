import { isDeepStrictEqual } from 'node:util';
import {
  AUTHENTICATED_ACCEPTANCE_READ_ONLY_CORRECTIONS, AUTHENTICATED_ACCEPTANCE_REVISION,
  AUTHENTICATED_ACCEPTANCE_TEST_IDS,
} from './authenticatedAcceptanceCases.mjs';

export const approvedReadOnlyChange = testId => ({
  testId,
  before: {
    expectedMutation: 'declared synthetic state transition', expectedMutationCount: 1,
    expectedAudit: testId.startsWith('ADMIN-') ? 'required for privileged mutation' : 'not applicable',
    expectedStateAfter: 'unchanged on denial/failure; declared next state on success',
  },
  after: {
    expectedMutation: 'none', expectedMutationCount: 0, expectedAudit: 'not applicable',
    expectedStateAfter: 'Unchanged persisted state during the measured read; fixture setup precedes observation.',
  },
});

export function validateAuthenticatedCatalogRevision(catalog) {
  const errors = [];
  if (catalog.schemaVersion !== 2 || catalog.criteriaRevision !== AUTHENTICATED_ACCEPTANCE_REVISION) errors.push('authenticated-catalog-version');
  const expected = {
    authority: 'AP-approved-full-scope-remaining-acceptance-plan',
    environmentChange: {
      from: 'hosted_sandbox', to: 'hosted_authenticated_synthetic', testIds: [...AUTHENTICATED_ACCEPTANCE_TEST_IDS],
    },
    readOnlyChanges: AUTHENTICATED_ACCEPTANCE_READ_ONLY_CORRECTIONS.map(approvedReadOnlyChange),
  };
  if (!isDeepStrictEqual(catalog.criteriaChanges, expected)) errors.push('authenticated-catalog-change-record');
  const actualIds = (catalog.cases ?? []).filter(c => c.environment === 'hosted_authenticated_synthetic').map(c => c.testId).sort();
  if (!isDeepStrictEqual(actualIds, [...AUTHENTICATED_ACCEPTANCE_TEST_IDS].sort())) errors.push('authenticated-catalog-case-set');
  for (const testId of AUTHENTICATED_ACCEPTANCE_READ_ONLY_CORRECTIONS) {
    const item = catalog.cases?.find(c => c.testId === testId);
    for (const [key, value] of Object.entries(approvedReadOnlyChange(testId).after)) {
      if (!isDeepStrictEqual(item?.[key], value)) errors.push(`authenticated-read-only:${testId}:${key}`);
    }
  }
  const secretCase = catalog.cases?.find(c => c.testId === 'AI-004');
  if (secretCase?.expectedMutationCount !== 1 || secretCase?.expectedAudit !== 'required for privileged mutation') errors.push('authenticated-ai-secret-write-preserved');
  return errors;
}
