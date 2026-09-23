import assert from 'node:assert/strict';

export const PR_C_CONTROLLED_HUMAN_FROZEN_TIP = '20260904120000_pr_c_controlled_human_exercise_authority.sql';
export const PR_C_APPROVED_SUCCESSOR_TAIL = Object.freeze([
  '20260915142940_creation_access_process_authority.sql',
  '20260915142942_synthetic_admin_account_authority.sql',
  '20260916003000_creation_access_migration_identity_convergence.sql',
  '20260916083814_assess_supporting_document_mapping.sql',
  '20260916151050_assess_document_mapping_identity_convergence.sql',
  '20260916181916_assess_document_xlsx_ingestion_authority.sql',
  '20260916203406_projection_rpc_volatility_authority.sql',
  '20260917173445_synthetic_ai_campaign_authority.sql',
  '20260918082307_synthetic_ai_mapping_studio_budget_authority.sql',
  '20260922112911_synthetic_ai_campaign_one_time_renewal.sql',
  '20260923062439_studio_server_helper_permissions.sql',
  '20260923082000_studio_frd_section_id_contract.sql',
  '20260923133000_pr1e_evidence_claim_operator_binding.sql',
  '20260923142120_pr1e_govern_control_alias_binding.sql',
  '20260923144653_studio_command_authority_capabilities.sql',
]);

export const assertPrCMigrationTail = migrationNames => {
  const tipIndex = migrationNames.indexOf(PR_C_CONTROLLED_HUMAN_FROZEN_TIP);
  assert.notEqual(tipIndex, -1, 'PR C controlled-human frozen tip is missing');
  assert.equal(migrationNames.lastIndexOf(PR_C_CONTROLLED_HUMAN_FROZEN_TIP), tipIndex,
    'PR C controlled-human frozen tip is duplicated');
  assert.deepEqual(migrationNames.slice(tipIndex + 1), PR_C_APPROVED_SUCCESSOR_TAIL,
    'Only the exact approved creation-access, document-mapping, identity-convergence, XLSX-ingestion, projection-volatility, synthetic-AI, domain-budget, renewal, Studio FRD section-ID, PR 1E corrections, and Studio command-authority successor may follow the PR C controlled-human frozen tip');
};

// Full fresh-chain runners must validate the approved tail before deriving its
// marker. This does not advance the separately frozen controlled-human target
// or a partial PR C-only upgrade to a migration it has not applied.
export const approvedFullChainTip = migrationNames => {
  assertPrCMigrationTail(migrationNames);
  return PR_C_APPROVED_SUCCESSOR_TAIL.at(-1).slice(0, 14);
};
