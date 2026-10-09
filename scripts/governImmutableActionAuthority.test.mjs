import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractCreatedRoutines } from './hostedPilotActivation.mjs';

const migrationPath = new URL('../supabase/migrations/20261009162752_govern_immutable_action_authority.sql', import.meta.url);
const sql = (await readFile(migrationPath, 'utf8')).replaceAll('\r\n', '\n');

const count = needle => sql.split(needle).length - 1;
assert.deepEqual(extractCreatedRoutines(sql), [
  'public.pr1e_govern_actions_match(jsonb, jsonb, jsonb)',
  'public.pr1e_govern_requires_independent_resolver(jsonb, jsonb)',
  'public.pr1e_normalize_govern_actions(jsonb, jsonb)',
], 'canonical inventory must see all private helpers inside the atomic migration');

assert.equal(count('DO $govern_action_authority$'), 1, 'migration must have one atomic statement');
assert.equal(count('$govern_action_authority$;'), 1, 'atomic statement must close once');
assert.match(sql, /SELECT \* INTO STRICT runtime_control[\s\S]*WHERE singleton FOR UPDATE/u);
assert.match(sql, /IF NOT runtime_control\.read_only THEN[\s\S]*PR1E_GOVERN_ACTION_MAINTENANCE_REQUIRED/u);
assert.doesNotMatch(sql, /UPDATE public\.assess_v2_runtime_control/u, 'migration must not change the runtime flag');

for (const table of [
  'assess_v2_decision_versions',
  'assess_v2_review_assignments',
  'assess_v2_review_resolutions',
  'assess_v2_govern_resolutions',
  'assess_v2_studio_handoffs',
]) assert.match(sql, new RegExp(`LOCK TABLE public\\.${table} IN SHARE ROW EXCLUSIVE MODE`, 'u'));

for (const helper of [
  'pr1e_normalize_govern_actions(jsonb,jsonb)',
  'pr1e_govern_actions_match(jsonb,jsonb,jsonb)',
  'pr1e_govern_requires_independent_resolver(jsonb,jsonb)',
]) {
  assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${helper.replace(/[()]/gu, '\\$&')} FROM PUBLIC,anon,authenticated,service_role`, 'u'));
}

for (const field of ['id', 'actionId', 'label', 'category', 'highImpact', 'financial', 'externalCommunication', 'irreversible']) {
  assert.match(sql, new RegExp(`'${field}'`, 'u'), `normalized action must include ${field}`);
}
assert.match(sql, /input->>\s*'mode'='write' AND \(input->'facts'->>'highImpact'\)::boolean/u);
assert.match(sql, /input->>\s*'mode'='write' AND \(input->'facts'->>'financialAction'\)::boolean/u);
assert.match(sql, /'externalCommunication',false/u);
assert.match(sql, /'irreversible',false/u);
assert.doesNotMatch(sql, /rollback[^\n]*(?:irreversible|highImpact)/iu, 'unsupported risk must not be inferred from rollback');
assert.doesNotMatch(sql, /label[^\n]*(?:financial|highImpact|irreversible)/iu, 'risk must not be inferred from labels');

for (const actionArray of ['allowedActions', 'approvalBoundActions', 'prohibitedActions']) {
  assert.match(sql, new RegExp(`jsonb_typeof\\(decision->'${actionArray}'\\) IS DISTINCT FROM 'array'`, 'u'));
}
assert.match(sql, /jsonb_array_length\(input_interactions\)<>jsonb_array_length\(decisions\)/u);
assert.match(sql, /COALESCE\(input->>'mode',''\) NOT IN/u);
assert.match(sql, /jsonb_typeof\(input->'facts'->'highImpact'\) IS DISTINCT FROM 'boolean'/u);
assert.match(sql, /jsonb_typeof\(input->'facts'->'financialAction'\) IS DISTINCT FROM 'boolean'/u);
assert.match(sql, /jsonb_array_length\(CASE WHEN jsonb_typeof\(decision->'allowedActions'\)='array'/u);
assert.match(sql, /GROUP BY lower\(input->>'id'\) HAVING count\(\*\)<>1/u);
assert.match(sql, /GROUP BY lower\(decision->>'interactionId'\) HAVING count\(\*\)<>1/u);
assert.match(sql, /PR1E_GOVERN_ACTION_AUTHORITY_INVALID/u);

assert.match(sql, /ELSIF p_output_snapshot \? 'actionControls'/u);
assert.match(sql, /COALESCE\(action->>'category',''\) NOT IN\('allowed','approval-bound','evidence-bound','prohibited'\)/u);
assert.match(sql, /WHERE action->>'category'='approval-bound'/u, 'legacy approval-bound separation must remain');
assert.match(sql, /WHERE input->>'mode'='write'[\s\S]*input->'facts'->>'highImpact'[\s\S]*input->'facts'->>'financialAction'/u, 'modern risk separation must use matched immutable facts');

assert.match(sql, /new_projection text := 'public\.pr1e_normalize_govern_actions/u);
assert.match(sql, /new_command_persistence text := 'v_actions/u);
assert.match(sql, /NOT public\.pr1e_govern_actions_match/u);
assert.match(sql, /PR1E_GOVERN_ACTION_HISTORY_REQUIRES_REVIEW/u);
assert.match(sql, /h\.package#>'\{govern,actions\}'/u);
assert.match(sql, /position\('PERFORM public\.pr1e_assert_current_approved_review_authority' in handoff_definition\)=0/u);
assert.match(sql, /position\('RETURN public\.pr1e_review_command' in handoff_definition\)=0/u);

for (const helperName of [
  'pr1e_review_projection(uuid,uuid,uuid,uuid)',
  'pr1e_review_command(text,uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,bigint,jsonb)',
  'pr1e_handoff_assess_v2_studio(uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,bigint,jsonb)',
  'synthetic_ai_campaign_activate_final_continuation',
  'synthetic_ai_campaign_bootstrap',
  'pr_c_controlled_human_assert_marker',
  'synthetic_ai_campaign_activate_brd_v3_quality_validation',
]) assert.match(sql, new RegExp(helperName.replace(/[()]/gu, '\\$&'), 'u'));

assert.match(sql, /marker\.migration_tip<>'20261008022445'/u);
assert.match(sql, /UPDATE public\.hosted_pilot_environment_identity[\s\S]*SET migration_tip='20261009162752'/u);
assert.match(sql, /CHECK\(migration_tip='20261009162752'\)/u);
assert.match(sql, /'20261008022445','20261009162752'/u);
assert.match(sql, /EXISTS\(SELECT 1 FROM public\.pr_c_controlled_human_exercises WHERE lifecycle<>'deprovisioned'\)/u);

console.log('Govern immutable action-authority source contract passed.');
