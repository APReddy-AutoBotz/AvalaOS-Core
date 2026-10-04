export const SYNTHETIC_AI_TERMINAL_JOURNAL_MIGRATION =
  '20261003055918_synthetic_ai_terminal_effect_journal_reconciliation.sql';
export const STUDIO_BRD_PROMPT_V2_MIGRATION =
  '20261003123459_studio_brd_prompt_v2_semantic_fidelity.sql';

export const STUDIO_BRD_V2_QUALITY_VALIDATION_MIGRATION =
  '20261003150800_synthetic_ai_brd_v2_quality_validation_allowance.sql';

export const STUDIO_BRD_PROMPT_V3_MIGRATION =
  '20261004025101_studio_brd_source_fact_retention_v3.sql';

const PROVIDER_OFF_MIGRATIONS = new Set([
  STUDIO_BRD_PROMPT_V3_MIGRATION,
  STUDIO_BRD_V2_QUALITY_VALIDATION_MIGRATION,
  SYNTHETIC_AI_TERMINAL_JOURNAL_MIGRATION,
  STUDIO_BRD_PROMPT_V2_MIGRATION,
]);

export async function applySyntheticAiTerminalJournalMigrationForTest(client, migrationName, applyMigration) {
  if (!PROVIDER_OFF_MIGRATIONS.has(migrationName)) return applyMigration();

  const state = await client.query(`SELECT enterprise.provider_enabled enterprise,studio.provider_enabled studio
    FROM public.enterprise_intelligence_runtime_control enterprise
    CROSS JOIN public.studio_artifact_runtime_control studio
    WHERE enterprise.singleton AND studio.singleton`);
  if (state.rowCount !== 1) throw new Error('SYNTHETIC_AI_TERMINAL_JOURNAL_TEST_RUNTIME_STATE_MISSING');

  await client.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=false WHERE singleton');
  await client.query('UPDATE public.studio_artifact_runtime_control SET provider_enabled=false WHERE singleton');
  try {
    return await applyMigration();
  } finally {
    await client.query('UPDATE public.enterprise_intelligence_runtime_control SET provider_enabled=$1 WHERE singleton', [state.rows[0].enterprise]);
    await client.query('UPDATE public.studio_artifact_runtime_control SET provider_enabled=$1 WHERE singleton', [state.rows[0].studio]);
  }
}
