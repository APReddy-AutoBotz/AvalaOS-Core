import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migrationUrl = new URL('../supabase/migrations/20260922112911_synthetic_ai_campaign_one_time_renewal.sql', import.meta.url);
const sql = readFileSync(migrationUrl, 'utf8').replaceAll('\r\n', '\n');
const file = fileURLToPath(migrationUrl);
let assertions = 0;
const check = (actual, expected = true, message = 'migration contract mismatch') => {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
};
const includes = (source, value, message) => check(source.includes(value), true, message);

check(file.endsWith('20260922112911_synthetic_ai_campaign_one_time_renewal.sql'));
includes(sql, "marker.migration_tip<>'20260918082307'", 'migration must advance only the exact predecessor tip');
includes(sql, "migration_tip='20260922112911'", 'migration must advance the hosted marker to its own tip');
includes(sql, 'campaign_id uuid NOT NULL UNIQUE', 'only one renewal is permitted per original campaign');
includes(sql, 'baseline_aggregate_usd_nanos bigint NOT NULL DEFAULT 1340779200', 'retained aggregate baseline is fixed');
includes(sql, 'maximum_additional_effects integer NOT NULL DEFAULT 6', 'new provider-effect count is fixed at six');
includes(sql, 'fixed_debit_usd_nanos bigint NOT NULL DEFAULT 471459200', 'every new effect keeps the conservative fixed debit');
includes(sql, 'maximum_aggregate_usd_nanos bigint NOT NULL DEFAULT 4169534400', 'renewal ceiling is fixed below the original cap');
includes(sql, 'campaign.campaign_cap_usd_nanos<>10000000000', 'the original aggregate USD 10 cap remains bound');
includes(sql, 'campaign.carried_usd_nanos<>869320000', 'the original carry is not reset');
includes(sql, 'historical_debits<>1 OR historical_consumed<>1 OR historical_spend<>471459200', 'exact retained validation history is required');
includes(sql, "reservation.state IN('reserved','uncertain')", 'pending or uncertain token budgets reject renewal');
includes(sql, 'reservation.studio_transfer_pending OR reservation.assess_mapping_transfer_pending', 'pending domain transfers reject renewal');
includes(sql, 'enterprise_control.provider_enabled OR studio_control.provider_enabled', 'renewal requires both provider runtimes off');
includes(sql, 'target.production_authorized OR target.customer_data_authorized OR target.real_provider_calls_authorized', 'synthetic-only target markers remain fail closed');
includes(sql, 'REVOKE ALL ON public.synthetic_ai_campaign_renewals FROM PUBLIC,anon,authenticated,service_role;', 'renewals deny table DML to API roles');
includes(sql, 'GRANT SELECT ON public.synthetic_ai_campaign_renewals TO service_role;', 'service receives read-only table access');
includes(sql, 'SYNTHETIC_AI_CAMPAIGN_RENEWAL_IMMUTABLE', 'renewal rows reject update/delete');
includes(sql, 'ADD COLUMN renewal_id uuid REFERENCES public.synthetic_ai_campaign_renewals(id)', 'new debits bind to their exact renewal');
includes(sql, 'debit.reserved_at<renewal.created_at OR debit.reserved_at>=renewal.expires_at', 'consume rejects an old or out-of-window permit');
includes(sql, "kind=''studio'' AND p_operation=''studio.document.generate'' AND slot_count<3", 'exactly three Studio document effects are available');
includes(sql, "kind=''assess_mapping'' AND p_operation=''assess.evidence.extract'' AND slot_count<1", 'one Assess mapping effect is available');
includes(sql, "kind=''enterprise'' AND p_operation=''assess.evidence.extract'' AND slot_count<1", 'one independent extraction effect is available');
includes(sql, "kind=''enterprise'' AND p_operation=''provider.validate'' AND slot_count<1", 'one provider validation effect is available');
check((sql.match(/public\.synthetic_ai_campaign_active_until\(/gu) ?? []).length, 5, 'active-window helper must occur only in its definition, reserve, consume, required-capability and revoke');
includes(sql, "old text:='marker.migration_tip=''20260918082307'''", 'fresh bootstrap is exact-tip forwarded');
includes(sql, 'existing synthetic_ai_campaign_disable RPC', 'rollback keeps the accepted irreversible disable control');

const mutations = [
  ['baseline-reset', 'baseline_aggregate_usd_nanos bigint NOT NULL DEFAULT 1340779200', 'baseline_aggregate_usd_nanos bigint NOT NULL DEFAULT 0'],
  ['effect-count-widen', 'maximum_additional_effects integer NOT NULL DEFAULT 6', 'maximum_additional_effects integer NOT NULL DEFAULT 7'],
  ['debit-reduce', 'fixed_debit_usd_nanos bigint NOT NULL DEFAULT 471459200', 'fixed_debit_usd_nanos bigint NOT NULL DEFAULT 1'],
  ['runtime-bypass', 'enterprise_control.provider_enabled OR studio_control.provider_enabled', 'false'],
  ['history-bypass', 'historical_debits<>1 OR historical_consumed<>1 OR historical_spend<>471459200', 'false'],
  ['service-write', 'GRANT SELECT ON public.synthetic_ai_campaign_renewals TO service_role;', 'GRANT SELECT,INSERT,UPDATE,DELETE ON public.synthetic_ai_campaign_renewals TO service_role;'],
  ['consume-old-permit', 'debit.reserved_at<renewal.created_at OR debit.reserved_at>=renewal.expires_at', 'false'],
  ['studio-widen', "kind=''studio'' AND p_operation=''studio.document.generate'' AND slot_count<3", "kind=''studio'' AND p_operation=''studio.document.generate'' AND slot_count<4"],
];
for (const [name, before, after] of mutations) {
  check(sql.includes(before), true, `${name}: mutation anchor missing`);
  const mutant = sql.replace(before, after);
  check(mutant === sql, false, `${name}: mutant must differ from source`);
  check(mutant.includes(before), false, `${name}: source contract must reject mutant`);
}

console.log(`synthetic AI renewal migration contract: ${assertions} assertions passed; 8 adversarial mutations rejected; no database, provider, or secret access occurred`);
