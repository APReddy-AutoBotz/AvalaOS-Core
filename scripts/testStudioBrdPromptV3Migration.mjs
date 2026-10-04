import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const migrationName='20261004025101_studio_brd_source_fact_retention_v3.sql';
const sql=await readFile(new URL(`../supabase/migrations/${migrationName}`,import.meta.url),'utf8');

test('BRD prompt v3 migration requires provider-off predecessor and advances one exact tip',()=>{
  assert.match(sql,/marker\.migration_tip<>'20261003150800'/u);
  assert.match(sql,/studio_control\.provider_enabled OR enterprise_control\.provider_enabled/u);
  assert.match(sql,/migration_tip='20261004025101'/u);
  assert.match(sql,/CHECK\(migration_tip='20261004025101'\)/u);
  assert.ok(sql.indexOf('STUDIO_BRD_PROMPT_V3_REQUIRES_PROVIDERS_OFF')<sql.indexOf('DROP CONSTRAINT studio_generation_provider_plan_check'));
});

test('new BRDs select v3 while stored v1 and v2 identities stay readable',()=>{
  assert.match(sql,/prompt_version IN\('studio-pr-b-1','studio-pr-b-2','studio-pr-b-3'\)/u);
  assert.match(sql,/WHEN ''brd'' THEN ''studio-pr-b-3'' ELSE ''studio-pr-b-1''/u);
  assert.match(sql,/attempt\.prompt_version NOT IN\(''studio-pr-b-1'',''studio-pr-b-2'',''studio-pr-b-3''\)/u);
  assert.match(sql,/attempt\.prompt_version IN\(''studio-pr-b-2'',''studio-pr-b-3''\) AND artifact\.artifact_type<>''brd''/u);
  assert.doesNotMatch(sql,/UPDATE public\.studio_artifact_generation_attempts SET prompt_version/iu);
});

test('canonical plan hashing remains bound to the stored prompt tuple',()=>{
  assert.doesNotMatch(sql,/computed_provider_plan_hash\s*:=/u);
  assert.doesNotMatch(sql,/provider_plan_hash\s*:=/u);
  assert.doesNotMatch(sql,/UPDATE public\.studio_artifact_generation_attempts/iu);
  assert.match(sql,/studio_artifact_generation_request_v2\(jsonb\)/u);
  assert.match(sql,/studio_artifact_generation_claim_v2\(uuid,uuid,integer\)/u);
});

test('v2 quality allowance remains immutable and pinned to its stored v2 plan',()=>{
  assert.match(sql,/v2 quality window stays pinned to v2/u);
  assert.doesNotMatch(sql,/pg_get_functiondef\('public\.synthetic_ai_campaign_activate_brd_v2_quality_validation/iu);
  assert.doesNotMatch(sql,/UPDATE public\.synthetic_ai_brd_v2_quality_validation_windows/iu);
  assert.doesNotMatch(sql,/UPDATE public\.synthetic_ai_campaign_effect_debits/iu);
  assert.doesNotMatch(sql,/INSERT INTO public\.synthetic_ai_brd_v2_quality_validation_windows/iu);
  assert.doesNotMatch(sql,/ALTER TABLE public\.synthetic_ai_campaign_effect_debits/iu);
});
