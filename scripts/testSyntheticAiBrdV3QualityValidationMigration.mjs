import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const migration='supabase/migrations/20261004112232_synthetic_ai_brd_v3_quality_validation_allowance.sql';
const sql=(await readFile(migration,'utf8')).replaceAll('\r\n','\n');
const predecessorSql=(await readFile('supabase/migrations/20261003150800_synthetic_ai_brd_v2_quality_validation_allowance.sql','utf8')).replaceAll('\r\n','\n');
const includes=(value,message)=>assert.ok(sql.includes(value),message);

test('BRD-v3 allowance extends the immutable v2 table without rewriting history',()=>{
  includes("marker.migration_tip<>'20261004025101'",'exact prompt-v3 predecessor tip is required');
  includes('enterprise_control.provider_enabled OR studio_control.provider_enabled','installation and activation require providers off');
  includes('ADD COLUMN prior_quality_window_id uuid','the shared immutable window table gets one predecessor link');
  includes('UNIQUE(campaign_id,prompt_version)','a campaign gets at most one row per prompt generation');
  includes('FOREIGN KEY(prior_quality_window_id,campaign_id)','the predecessor must belong to the same campaign');
  includes('UNIQUE(prior_quality_window_id)','a predecessor cannot be branched into multiple allowances');
  includes("prompt_version='studio-pr-b-2' AND prior_final_continuation_id IS NOT NULL AND prior_quality_window_id IS NULL",'legacy v2 lineage remains exact');
  includes("prompt_version='studio-pr-b-3' AND prior_final_continuation_id IS NULL AND prior_quality_window_id IS NOT NULL",'v3 lineage requires the v2 predecessor');
  includes('baseline_debit_count=8 AND baseline_aggregate_usd_nanos=4640993600','legacy baseline is unchanged');
  includes('baseline_debit_count=9 AND baseline_aggregate_usd_nanos=5112452800','v3 starts only from the consumed v2 total');
  assert.equal(sql.includes('CREATE TABLE public.synthetic_ai_brd_v3'),false,'no second allowance framework is created');
  assert.equal(sql.includes('DROP TABLE public.synthetic_ai'),false,'history is never destructively removed');
});

test('v3 activation binds exact authority, target, source, route, heads and consumed v2 lineage',()=>{
  for(const token of [
    "CREATE FUNCTION public.synthetic_ai_campaign_activate_brd_v3_quality_validation",
    "PERFORM public.pr1b_assert_command_authority(p_actor,p_org,p_workspace,'org.admin',p_authorization_version)",
    "PERFORM public.studio_assert_actor(p_generation_actor,p_org,p_workspace,'studio.artifacts.generate',p_generation_authorization_version)",
    "row.id=p_prior_quality_window AND row.campaign_id=p_campaign AND row.prompt_version='studio-pr-b-2'",
    'prior_quality.maximum_additional_effects<>1',
    'prior_quality.maximum_aggregate_usd_nanos<>5112452800 OR prior_quality.validation_required',
    "operation_counts IS DISTINCT FROM jsonb_build_object('assess.evidence.extract',1,'provider.validate',3,'studio.document.generate',5)",
    "attempt.prompt_key='studio-multisource-generation' AND attempt.prompt_version='studio-pr-b-2'",
    'debit.brd_v2_quality_window_id=prior_quality.id',
    "current_version.version<>3 OR current_version.lifecycle<>'draft' OR approved_version.version<>2 OR approved_version.lifecycle<>'approved'",
    "'studio-multisource-generation','studio-pr-b-3'",
    "CASE WHEN validation_required_value THEN 6055371200 ELSE 5583912000 END",
    'p_release_sha,p_source_attestation_digest',
  ])includes(token,`missing exact v3 activation guard: ${token}`);
  includes('GRANT EXECUTE ON FUNCTION\n  public.synthetic_ai_campaign_activate_brd_v3_quality_validation','activation is service-only');
  includes('FROM PUBLIC,anon,authenticated,service_role','the function is revoked before service-only execute is granted');
});

test('generic reserve and consume remain bounded and permanently exclude superseded windows',()=>{
  for(const token of ['quality_window.prompt_key','quality_window.prompt_version','quality_window.maximum_additional_effects','quality_window.maximum_aggregate_usd_nanos'])
    assert.ok(predecessorSql.includes(token),`predecessor generic authority is missing ${token}`);
  includes('WHERE successor.prior_quality_window_id=active.id','reserve and consume select only an unsuperseded leaf');
  assert.equal(sql.split('WHERE successor.prior_quality_window_id=active.id').length-1,2,'reserve and consume both exclude predecessors');
  assert.equal(sql.split('WHERE successor.prior_quality_window_id=quality.id').length-1,2,'both active-until branches exclude predecessors');
  assert.ok(predecessorSql.includes('debit.brd_v2_quality_window_id IS NOT DISTINCT FROM quality_window.id'),'consumption remains bound to the exact selected window');
  includes("UPDATE public.hosted_pilot_environment_identity SET migration_tip='20261004112232'",'current hosted identity advances');
  includes('The v2\n-- activation remains pinned to 20261003150800','v2 activation is deliberately left fail-closed at its historical tip');
  includes('never reopen a predecessor or destructively remove this extension','rollback is provider-off retention');
});
