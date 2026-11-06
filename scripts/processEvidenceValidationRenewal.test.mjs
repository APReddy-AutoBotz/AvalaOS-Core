import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath='supabase/migrations/20261106153001_process_evidence_validation_renewal.sql';
const source=await readFile(migrationPath,'utf8');
const campaignAuthority=await readFile(
  'supabase/migrations/20260917173445_synthetic_ai_campaign_authority.sql','utf8');
const providerResolver=await readFile('supabase/functions/_shared/providerResolver.ts','utf8');

test('stale renewal admits only an existing remaining validation slot',()=>{
  assert.match(source,/DO \$process_evidence_validation_renewal\$/u);
  const countIndex=source.indexOf("debit.operation='provider.validate'");
  const configIndex=source.indexOf("config.status='disabled'");
  assert.ok(countIndex>0&&countIndex<configIndex,'cumulative validation use must be known before config admission');
  assert.match(source,/config\.last_validated_at IS NOT NULL/u);
  assert.match(source,/config\.last_validated_at<=created_at_value/u);
  assert.match(source,/config\.last_validated_at>=created_at_value-interval '24 hours' OR validation_count<2/u);
  assert.doesNotMatch(source,/UPDATE public\.ai_provider_configs SET last_validated_at/iu);
  assert.doesNotMatch(source,/UPDATE public\.synthetic_ai_campaign_effect_debits/iu);
  assert.doesNotMatch(source,/campaign_cap_usd_nanos\s*=\s*(?!new_tip)/iu);
});

test('canonical routed effect paths retain independent 24-hour freshness gates',()=>{
  assert.match(campaignAuthority,/config\.last_validated_at IS NULL OR config\.last_validated_at>statement_timestamp\(\)/u);
  assert.match(campaignAuthority,/config\.last_validated_at<statement_timestamp\(\)-interval '24 hours'/u);
  assert.match(campaignAuthority,/SYNTHETIC_AI_CAMPAIGN_PROVIDER_STALE/u);
  assert.match(providerResolver,/ENTERPRISE_PROVIDER_VALIDATION_MAX_AGE_MS = 24 \* 60 \* 60 \* 1000/u);
  assert.match(providerResolver,/now\.getTime\(\) - validatedAt > ENTERPRISE_PROVIDER_VALIDATION_MAX_AGE_MS/u);
  assert.match(providerResolver,/return 'provider_validation_stale'/u);
});

test('repair is exact, provider-off, nonproduction and authority preserving',()=>{
  for(const required of [
    "migration_tip='20261106070101'",
    'NOT production_authorized AND NOT customer_data_authorized AND NOT real_provider_calls_authorized',
    'process_run_commit IS NOT NULL AND enabled',
    'enterprise_intelligence_runtime_control',
    'studio_artifact_runtime_control',
    'PROCESS_EVIDENCE_VALIDATION_RENEWAL_PRECONDITION',
    "function_old_tip text := '20261106070101'",
    "new_tip text := '20261106153001'",
    'PROCESS_EVIDENCE_VALIDATION_RENEWAL_FUNCTION_SOURCE_MISMATCH',
    'PROCESS_EVIDENCE_VALIDATION_RENEWAL_FUNCTION_AUTHORITY_DRIFT',
  ]) assert.ok(source.includes(required),required);
  assert.match(source,/jsonb_build_object\('owner',p\.proowner,'securityDefiner',p\.prosecdef,'leakproof',p\.proleakproof,[\s\S]*?'config',p\.proconfig,'acl',p\.proacl\)/u);
  assert.match(source,/IF metadata_after IS DISTINCT FROM metadata_before/u);
  assert.doesNotMatch(source,/\bGRANT\b/iu);
  assert.doesNotMatch(source,/\bCREATE TABLE\b/iu);
  assert.doesNotMatch(source,/\bDROP TABLE\b/iu);
});
