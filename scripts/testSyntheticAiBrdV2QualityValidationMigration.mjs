import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const migration='supabase/migrations/20261003150800_synthetic_ai_brd_v2_quality_validation_allowance.sql';
const sql=(await readFile(migration,'utf8')).replaceAll('\r\n','\n');
const includes=(value,message)=>assert.ok(sql.includes(value),message);

test('BRD-v2 quality allowance is additive, immutable, service-only, and provider-off by default',()=>{
  includes("marker.migration_tip<>'20261003123459'",'exact predecessor tip is required');
  includes('enterprise_control.provider_enabled OR studio_control.provider_enabled','installation and activation require providers off');
  includes('CREATE TABLE public.synthetic_ai_brd_v2_quality_validation_windows','one dedicated immutable allowance table is created');
  includes('BEFORE UPDATE OR DELETE ON public.synthetic_ai_brd_v2_quality_validation_windows','window rows are immutable');
  includes('FORCE ROW LEVEL SECURITY','window rows force RLS');
  includes('GRANT SELECT ON public.synthetic_ai_brd_v2_quality_validation_windows TO service_role','service role has read-only table access');
  includes('GRANT EXECUTE ON FUNCTION\n  public.synthetic_ai_campaign_activate_brd_v2_quality_validation','activation is service-only');
  includes('baseline_debit_count integer NOT NULL DEFAULT 8','the eight-effect paid history is the fixed baseline');
  includes('baseline_aggregate_usd_nanos bigint NOT NULL DEFAULT 4640993600','the exact retained aggregate is fixed');
  includes('maximum_aggregate_usd_nanos bigint NOT NULL CHECK(maximum_aggregate_usd_nanos IN(5112452800,5583912000))','fresh and validation-required ceilings are bounded');
  includes('requested_window_seconds integer NOT NULL','requested duration is replay-bound even when freshness caps expiry');
});

test('activation and reservation bind the exact approved-v2 source, heads, prompt, plan, and optional validation branch',()=>{
  for(const token of [
    "operation_counts IS DISTINCT FROM jsonb_build_object('assess.evidence.extract',1,'provider.validate',3,'studio.document.generate',4)",
    "current_version.version<>2 OR approved_version.version<>2",
    "artifact.current_version_id IS DISTINCT FROM p_expected_current_version",
    "artifact.current_approved_version_id IS DISTINCT FROM p_expected_approved_version",
    "prompt_key text NOT NULL DEFAULT 'studio-multisource-generation'",
    "prompt_version text NOT NULL DEFAULT 'studio-pr-b-2'",
    "quality_attempt.created_at>=quality_window.created_at",
    "quality_attempt.provider_plan_hash=computed_plan_hash",
    "quality_attempt.expected_current_version_id=quality_window.expected_current_version_id",
    "quality_attempt.expected_approved_version_id=quality_window.expected_approved_version_id",
    "quality_config.last_validated_at IS NOT DISTINCT FROM quality_window.activation_provider_last_validated_at",
    "receipt.status='committed' AND receipt.completed_at IS NOT NULL",
  ])includes(token,`missing exact allowance guard: ${token}`);
  includes("quality_window.validation_required AND kind='enterprise' AND p_operation='provider.validate'",'validation is explicitly isolated to its optional slot');
  includes("p_operation='studio.document.generate'",'generation is the only business effect');
  includes('validation_count=0 AND generation_count=0','validation cannot follow generation or repeat');
  includes('generation_count=0 AND p_maximum_output_tokens=4000','only one canonical generation slot is available');
});

test('debit tagging, consumption, current identity forwarding, and read-only rollback remain fail closed',()=>{
  includes('ADD COLUMN brd_v2_quality_window_id uuid','debits carry an explicit allowance FK');
  includes('CHECK(num_nonnulls(renewal_id,final_continuation_id,brd_v2_quality_window_id)<=1)','old and new windows cannot overlap on a debit');
  includes('prior.brd_v2_quality_window_id IS DISTINCT FROM quality_window.id','old permits cannot replay into the new window');
  includes('debit.brd_v2_quality_window_id IS NOT DISTINCT FROM quality_window.id','consume requires the exact active window');
  includes('WHERE quality.prior_final_continuation_id=final.id','a quality row supersedes only its exact fully consumed predecessor without breaking ordinary final-window consume');
  includes("UPDATE public.hosted_pilot_environment_identity SET migration_tip='20261003150800'",'current marker advances to the successor');
  includes("new_activation text:='marker.migration_tip<>''20261003150800'''",'retained final activation follows the current tip without changing its history checks');
  includes('Retain the window, debits, attempts, versions and audit','rollback preserves immutable paid history');
  assert.equal(sql.includes('DROP TABLE public.synthetic_ai'),false,'rollback does not destructively remove paid history');
});
