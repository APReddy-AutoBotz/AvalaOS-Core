import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const migrationName='20261003123459_studio_brd_prompt_v2_semantic_fidelity.sql';
const sql=await readFile(new URL(`../supabase/migrations/${migrationName}`,import.meta.url),'utf8');

test('BRD prompt v2 migration keeps providers off and advances one exact tip',()=>{
  assert.match(sql,/marker\.migration_tip<>'20261003055918'/u);
  assert.match(sql,/studio_control\.provider_enabled OR enterprise_control\.provider_enabled/u);
  assert.match(sql,/migration_tip='20261003123459'/u);
  assert.match(sql,/CHECK\(migration_tip='20261003123459'\)/u);
  assert.ok(sql.indexOf('STUDIO_BRD_PROMPT_V2_REQUIRES_PROVIDERS_OFF')<sql.indexOf('DROP CONSTRAINT studio_generation_provider_plan_check'));
});

test('new BRDs select v2 while the stored v1 identity remains readable',()=>{
  assert.match(sql,/prompt_version IN\('studio-pr-b-1','studio-pr-b-2'\)/u);
  assert.match(sql,/prompt_key IS NOT NULL AND prompt_version IS NOT NULL AND provider_plan_hash IS NOT NULL/u);
  assert.match(sql,/prompt_version:=CASE artifact\.artifact_type WHEN ''brd'' THEN ''studio-pr-b-2'' ELSE ''studio-pr-b-1'' END/u);
  assert.match(sql,/attempt\.prompt_version='studio-pr-b-2' AND artifact\.artifact_type<>'brd'/u);
  assert.doesNotMatch(sql,/UPDATE public\.studio_artifact_generation_attempts SET prompt_version/iu);
});

test('new provider effects verify the locked canonical plan while reconciliation uses stored identity',()=>{
  assert.match(sql,/computed_provider_plan_hash:=public\.enterprise_sha256_jsonb\(jsonb_build_object\(/u);
  assert.match(sql,/'promptKey',attempt\.prompt_key,'promptVersion',attempt\.prompt_version,'maximumOutputTokens',4000/u);
  assert.match(sql,/IF NOT reconcile_only THEN[\s\S]*provider_guard/u);
  assert.equal((sql.match(/definition:=replace\(definition,[^\n]*provider_guard/g)||[]).length,2);
  assert.match(sql,/claim_plan:=jsonb_build_object\('artifactType',artifact\.artifact_type[\s\S]*'providerPlanHash',attempt\.provider_plan_hash\)/u);
  assert.match(sql,/reconcileOnly'',true,''responseHash'',staged\.response_hash\)\|\|claim_plan/u);
});
