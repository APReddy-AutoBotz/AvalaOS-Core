import assert from 'node:assert/strict';

export const PR_C_CONTROLLED_HUMAN_FROZEN_TIP = '20260904120000_pr_c_controlled_human_exercise_authority.sql';
export const PR_C_APPROVED_SUCCESSOR_TAIL = Object.freeze([
  '20260915142940_creation_access_process_authority.sql',
  '20260915142942_synthetic_admin_account_authority.sql',
  '20260916003000_creation_access_migration_identity_convergence.sql',
  '20260916083814_assess_supporting_document_mapping.sql',
  '20260916151050_assess_document_mapping_identity_convergence.sql',
]);

export const assertPrCMigrationTail = migrationNames => {
  const tipIndex = migrationNames.indexOf(PR_C_CONTROLLED_HUMAN_FROZEN_TIP);
  assert.notEqual(tipIndex, -1, 'PR C controlled-human frozen tip is missing');
  assert.equal(migrationNames.lastIndexOf(PR_C_CONTROLLED_HUMAN_FROZEN_TIP), tipIndex,
    'PR C controlled-human frozen tip is duplicated');
  assert.deepEqual(migrationNames.slice(tipIndex + 1), PR_C_APPROVED_SUCCESSOR_TAIL,
    'Only the exact approved creation-access, document-mapping, and identity-convergence successors may follow the PR C controlled-human frozen tip');
};

// Full fresh-chain runners must validate the approved tail before deriving its
// marker. This does not advance the separately frozen controlled-human target
// or a partial PR C-only upgrade to a migration it has not applied.
export const approvedFullChainTip = migrationNames => {
  assertPrCMigrationTail(migrationNames);
  return PR_C_APPROVED_SUCCESSOR_TAIL.at(-1).slice(0, 14);
};
