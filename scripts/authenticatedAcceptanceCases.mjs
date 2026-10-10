// Business identities, not execution results. Local preparation never proves
// a hosted requirement, even when it executes the same production handlers.
export const AUTHENTICATED_ACCEPTANCE_PROJECTS = Object.freeze(['desktop-chromium', 'pixel-7-chromium']);
export const AUTHENTICATED_ACCEPTANCE_GROUPS = Object.freeze({
  assess: ['ASSESS-002', 'ASSESS-003', 'ASSESS-018', 'ASSESS-019', 'ASSESS-020'],
  govern: ['GOVERN-001', 'GOVERN-002', 'GOVERN-003', 'GOVERN-004', 'GOVERN-005', 'GOVERN-006', 'GOVERN-007'],
  studio: ['STUDIO-001', 'STUDIO-002', 'STUDIO-003', 'STUDIO-007'],
  delivery: ['DELIVERY-001', 'DELIVERY-002', 'DELIVERY-003', 'DELIVERY-004', 'DELIVERY-005', 'DELIVERY-006', 'DELIVERY-009'],
  monitor: ['MONITOR-001', 'MONITOR-002', 'MONITOR-003', 'MONITOR-004'],
  admin: ['ADMIN-001', 'ADMIN-002', 'ADMIN-003', 'ADMIN-004'],
  ai: ['AI-001', 'AI-002', 'AI-003', 'AI-004', 'AI-005', 'AI-006'],
  e2e: ['E2E-001', 'E2E-002', 'E2E-003', 'E2E-004', 'E2E-005', 'E2E-006', 'E2E-007'],
  recovery: ['SAFETY-001', 'SAFETY-002', 'SAFETY-003'],
});
for (const ids of Object.values(AUTHENTICATED_ACCEPTANCE_GROUPS)) Object.freeze(ids);
export const AUTHENTICATED_ACCEPTANCE_TEST_IDS = Object.freeze(Object.values(AUTHENTICATED_ACCEPTANCE_GROUPS).flat());
export const AUTHENTICATED_ACCEPTANCE_READ_ONLY_CORRECTIONS = Object.freeze([
  'EI-003', 'ADMIN-001', 'ADMIN-003', 'ADMIN-004', 'MONITOR-001', 'MONITOR-002', 'MONITOR-003',
]);
export const AUTHENTICATED_ACCEPTANCE_REVISION = 'authenticated-synthetic-2026-10-10-v2';
export const AUTHENTICATED_ACCEPTANCE_WORKFLOW = '.github/workflows/authenticated-product-acceptance.yml';
export const authenticatedAcceptanceScenario = testId => {
  if (!AUTHENTICATED_ACCEPTANCE_TEST_IDS.includes(testId)) throw new Error('AUTHENTICATED_CASE_UNKNOWN');
  return `authenticated-${testId.toLowerCase()}`;
};

// Each item must be produced by an executed business assertion. Profile
// membership, a visible page or a green parent suite cannot supply these.
export const AUTHENTICATED_CASE_ASSERTIONS = Object.freeze({
  'ASSESS-002': ['persisted-process-edit-denied', 'unchanged-process-after-reload'],
  'ASSESS-003': ['persisted-discovery-inputs-scored', 'production-completion-committed'],
  'ASSESS-018': ['v2-case-created-by-command', 'v2-case-visible-after-reload'],
  'ASSESS-019': ['v2-finalized-from-current-inputs', 'immutable-decision-visible'],
  'ASSESS-020': ['disabled-v2-command-denied', 'no-false-success'],
  'GOVERN-001': ['current-reviewer-assigned', 'assignment-visible'],
  'GOVERN-002': ['independent-evidence-attested', 'attestation-visible'],
  'GOVERN-003': ['changes-requested-committed', 'author-sees-requested-changes'],
  'GOVERN-004': ['rework-preserves-history', 'new-version-resubmitted'],
  'GOVERN-005': ['independent-approval-committed', 'approved-current-version-visible'],
  'GOVERN-006': ['rejection-committed', 'rejection-visible'],
  'GOVERN-007': ['separation-denial-zero-effects', 'independent-resolution-committed'],
  'STUDIO-001': ['exact-approved-handoff-consumed', 'source-ancestry-visible'],
  'STUDIO-002': ['production-generation-pipeline-committed', 'governed-version-visible'],
  'STUDIO-003': ['failed-generation-no-artifact-mutation', 'failure-visible-without-success'],
  'STUDIO-007': ['private-broker-denies-before-storage', 'no-bytes-or-resource-disclosure'],
  'DELIVERY-001': ['persisted-docs-import-committed', 'exact-source-lineage-visible'],
  'DELIVERY-002': ['server-task-created', 'committed-task-visible-after-reload'],
  'DELIVERY-003': ['assigned-actor-update-committed', 'protected-fields-unchanged'],
  'DELIVERY-004': ['unauthorized-delete-denied', 'retained-task-unchanged'],
  'DELIVERY-005': ['valid-status-transition-committed', 'transition-visible-after-reload'],
  'DELIVERY-006': ['invalid-status-transition-denied', 'status-unchanged-after-reload'],
  'DELIVERY-009': ['pack-from-authoritative-tasks', 'exact-tenant-source-ancestry'],
  'MONITOR-001': ['exact-ancestry-visible', 'foreign-ancestry-undisclosed'],
  'MONITOR-002': ['recorded-label-detail-status-exact', 'no-inferred-or-fallback-outcome'],
  'MONITOR-003': ['exact-recorded-blocker-visible', 'foreign-blocker-undisclosed'],
  'MONITOR-004': ['projection-unavailable-visible', 'no-legacy-success-substitution'],
  'ADMIN-001': ['authorized-admin-navigation', 'server-issued-context-visible'],
  'ADMIN-002': ['non-admin-server-request-denied', 'forged-navigation-grants-no-authority'],
  'ADMIN-003': ['server-capabilities-exact', 'forged-client-capability-ineffective'],
  'ADMIN-004': ['pilot-operations-read-only-query', 'no-release-truth-created'],
  'AI-001': ['missing-provider-configuration-denied', 'no-provider-request'],
  'AI-002': ['disabled-provider-denied', 'no-provider-request'],
  'AI-003': ['missing-provider-capability-denied', 'no-provider-request'],
  'AI-004': ['synthetic-secret-command-committed', 'configuration-receipt-audit-exact', 'secret-absent-from-browser-and-response'],
  'AI-005': ['provider-unavailable-visible', 'no-provider-request-or-false-success'],
  'AI-006': ['browser-storage-and-traffic-secret-free', 'provider-authority-server-only'],
  'E2E-001': ['production-lifecycle-commands-completed', 'approved-studio-to-legacy-docs-published', 'delivery-to-monitor-exact-lineage'],
  'E2E-002': ['requested-changes-and-rework-completed', 'new-approval-and-downstream-lineage'],
  'E2E-003': ['real-downstream-authority-denied', 'unchanged-exact-lineage'],
  'E2E-004': ['stale-command-denied', 'same-command-reconciled-with-one-effect'],
  'E2E-005': ['production-low-suitability-decision', 'low-suitability-downstream-policy-preserved'],
  'E2E-006': ['production-strong-automation-decision', 'governed-downstream-approval-preserved'],
  'E2E-007': ['production-hitl-decision', 'required-human-approval-preserved-downstream'],
  'SAFETY-001': ['offline-command-not-committed', 'input-preserved-without-success'],
  'SAFETY-002': ['server-error-command-not-committed', 'input-preserved-without-success'],
  'SAFETY-003': ['timed-out-command-not-committed', 'input-preserved-without-success'],
});
