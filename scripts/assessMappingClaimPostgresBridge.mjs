import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadSyntheticAiModules} from './loadSyntheticAiModules.mjs';
import {meetingText} from './syntheticAiCampaignFixtures.mjs';

// Actual production parser/catalog/request binding + actual PostgreSQL claim.
// No provider adapter is invoked. All fixture writes roll back in this database.
export async function verifyAssessMappingClaimPostgresBridge({database,fixture,caseId,routeId,authorizationVersion,nextUuid,draft}) {
 const modules=await loadSyntheticAiModules();
 const {extractEvidenceText,sha256Hex}=await import('../supabase/functions/_shared/enterpriseIntelligenceIngestion.ts');
 const {deriveTranscriptCommandRequestBinding}=await import('../supabase/functions/_shared/enterpriseIntelligenceCommand.ts');
 const {buildAssessMappingCatalog,decodeAssessMappingClaimResponse}=modules;
 assert.equal(typeof decodeAssessMappingClaimResponse,'function');
 const hash=v=>createHash('sha256').update(v).digest('hex'),json=JSON.stringify;
 const oldFetch=globalThis.fetch,oldDeno=globalThis.Deno;let networkEffects=0,secretReads=0;
 globalThis.fetch=async()=>{networkEffects++;throw Error('MAPPING_BRIDGE_NETWORK_FORBIDDEN')};
 globalThis.Deno={env:{get(name){if(/SECRET|API_KEY|PROVIDER_KEY/.test(name))secretReads++;return undefined}}};
 await database.query('BEGIN');
 try {
  const bytes=new TextEncoder().encode(meetingText),text=await extractEvidenceText(bytes,'text/plain');
  assert.equal(text,meetingText);assert.equal(text.length,228);
  const contentHash=await sha256Hex(bytes),textHash=await sha256Hex(text);
  const receipt=async(commandType)=>{
   const request=nextUuid(),token=nextUuid();return (await database.query('SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,NULL,$8)).*',[fixture.requester,fixture.org,fixture.workspace,commandType,'mapping-bridge-'+request,request,hash(commandType+request),token])).rows[0];
  };
  const sourceId=nextUuid(),sourceVersionId=nextUuid(),upload=await receipt('evidence.source.create');
  const source={id:sourceId,org_id:fixture.org,workspace_id:fixture.workspace,display_name:'Synthetic AP meeting bridge',source_kind:'upload',mime_type:'text/plain',created_by:fixture.requester};
  const version={id:sourceVersionId,source_id:sourceId,org_id:fixture.org,workspace_id:fixture.workspace,original_filename:'synthetic-ap-meeting.txt',content_hash:contentHash,content_bytes:bytes.length,storage_bucket:'source-uploads',storage_path:`${fixture.org}/${fixture.workspace}/enterprise-evidence/${sourceId}.bin`,extracted_text_hash:null,extracted_character_count:null,created_by:fixture.requester};
  await database.query('SELECT public.enterprise_create_evidence_source_record($1::jsonb,$2::jsonb,$3,$4,$5,$6::jsonb)',[json(source),json(version),upload.id,upload.execution_token,upload.execution_fence,json({sourceId,sourceVersionId,status:'uploaded'})]);
  await database.query('SELECT public.enterprise_record_source_extraction_success($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',[sourceVersionId,fixture.org,fixture.workspace,textHash,text.length,upload.id,upload.execution_token,upload.execution_fence,json({sourceId,sourceVersionId,status:'parsed'})]);
  const persisted=(await database.query('SELECT content_hash,extracted_text_hash,extraction_status,parser_version FROM public.enterprise_evidence_source_versions WHERE id=$1',[sourceVersionId])).rows[0];
  assert.equal(persisted.content_hash,contentHash);assert.equal(persisted.extracted_text_hash,textHash);assert.equal(persisted.extraction_status,'parsed');
  const setId=nextUuid(),setVersionId=nextUuid(),bundleId=nextUuid(),bundleVersionId=nextUuid();
  await database.query("INSERT INTO public.enterprise_source_sets(id,org_id,workspace_id,owner_module,display_label,description,current_version,status,created_by) VALUES($1,$2,$3,'assess','Bridge sources','Synthetic TXT',1,'locked',$4)",[setId,fixture.org,fixture.workspace,fixture.requester]);
  await database.query("INSERT INTO public.enterprise_source_set_versions(id,source_set_id,org_id,workspace_id,version,purpose,manifest_hash,source_count,extracted_character_count,status,created_by) VALUES($1,$2,$3,$4,1,'Mapping bridge',$5,1,$6,'locked',$7)",[setVersionId,setId,fixture.org,fixture.workspace,hash('bridge-set'),text.length,fixture.requester]);
  await database.query("INSERT INTO public.enterprise_source_set_version_items(source_set_version_id,source_set_id,source_version_id,source_id,org_id,workspace_id,ordinal,semantic_role,content_hash,extracted_text_hash,extracted_character_count) VALUES($1,$2,$3,$4,$5,$6,1,'primary',$7,$8,$9)",[setVersionId,setId,sourceVersionId,sourceId,fixture.org,fixture.workspace,contentHash,textHash,text.length]);
  await database.query("INSERT INTO public.enterprise_module_input_bundles(id,org_id,workspace_id,owner_module,current_version,created_by) VALUES($1,$2,$3,'assess',1,$4)",[bundleId,fixture.org,fixture.workspace,fixture.requester]);
  await database.query("INSERT INTO public.enterprise_module_input_bundle_versions(id,input_bundle_id,org_id,workspace_id,version,bundle_hash,status,created_by) VALUES($1,$2,$3,$4,1,$5,'locked',$6)",[bundleVersionId,bundleId,fixture.org,fixture.workspace,hash('bridge-bundle'),fixture.requester]);
  await database.query("INSERT INTO public.enterprise_module_input_bundle_items(input_bundle_version_id,input_bundle_id,org_id,workspace_id,ordinal,item_kind,source_set_version_id,source_set_id,resource_hash,declared_purpose) VALUES($1,$2,$3,$4,1,'source_set',$5,$6,$7,'Assess mapping bridge')",[bundleVersionId,bundleId,fixture.org,fixture.workspace,setVersionId,setId,hash('bridge-set')]);
  const selection={sourceSetId:setId,sourceSetVersionId:setVersionId,expectedSourceSetVersion:1,sourceId,sourceVersionId};
  const sourceBindings=[{...selection,parserVersion:persisted.parser_version,normalizedHash:textHash,extractedByteCount:bytes.length,sheetCount:0,cellCount:0,warnings:[]}];
  const authority={actorId:fixture.requester,organizationId:fixture.org,workspaceId:fixture.workspace,authorizationVersion};
  const payload={caseId,expectedCaseVersion:1,inputBundleId:bundleId,inputBundleVersionId:bundleVersionId,expectedInputBundleVersion:1,selections:[selection]};
  const allowedTables=new Set(['assess_v2_cases','enterprise_module_input_bundle_versions','enterprise_source_set_versions','enterprise_module_input_bundle_items','enterprise_source_set_version_items']);
  const findOne=async(table,query)=>{
   assert.ok(allowedTables.has(table));const params=new URLSearchParams(query),columns=params.get('select');assert.match(columns,/^[a-z_]+(?:,[a-z_]+)*$/);
   params.delete('select');const args=[],where=[];
   for(const [column,value] of params){assert.match(column,/^[a-z_]+$/);if(value==='is.null')where.push(`${column} IS NULL`);else{assert.ok(value.startsWith('eq.'));args.push(value.slice(3));where.push(`${column}=$${args.length}`)}}
   const row=(await database.query(`SELECT ${columns} FROM public.${table} WHERE ${where.join(' AND ')} LIMIT 1`,args)).rows[0];
   if(row&&Object.hasOwn(row,'version'))row.version=Number(row.version);return row??null;
  };
  const envelope={commandType:'assess.document-map.analyze',payload};
  const binding=await deriveTranscriptCommandRequestBinding(authority,envelope,{findOne});assert.equal(binding.caseId,caseId);assert.equal(binding.sources[0].sourceVersionId,sourceVersionId);
  for(const scope of [{...authority,organizationId:nextUuid()},{...authority,workspaceId:nextUuid()}])await assert.rejects(deriveTranscriptCommandRequestBinding(scope,envelope,{findOne}),/RESOURCE_STALE/);
  const catalogId=nextUuid(),runId=nextUuid(),claimReceipt=await receipt('assess.document-map.analyze');
  const catalog=await buildAssessMappingCatalog({catalogId,caseId,caseVersion:1,assessSchemaVersion:'assess-v2-schema-2026-07',draft,createSelectorId:nextUuid});
  const readClaim=async()=>(await database.query("SELECT public.enterprise_claim_assess_document_mapping_run_v1($1,$2,$3,1,'assess-v2-schema-2026-07',$4,$5::jsonb,$6,$7,1,$8::jsonb,$9,$10,'openai','fixture-model','assess-supporting-document-map-v1',$11,$12,$13,$14,$15,$16,$17) result",[runId,catalogId,caseId,catalog.catalogHash,json(catalog.targets),bundleId,bundleVersionId,json(sourceBindings),routeId,fixture.provider,fixture.requester,fixture.org,fixture.workspace,authorizationVersion,claimReceipt.id,claimReceipt.execution_token,claimReceipt.execution_fence])).rows[0].result;
  const claim=await readClaim();
  assert.notEqual(claim.catalogHash,catalog.catalogHash,'PostgreSQL owns the persistent hash domain.');
  assert.ok(claim.targets.some(t=>!Object.hasOwn(t,'currentValue')),'The actual SQL null-stripped response is exercised.');
  const expected={runId,catalogId,targets:catalog.targets,sourceBindings};
  const decoded=decodeAssessMappingClaimResponse({value:claim,...expected});
  assert.equal(decoded.catalogHash,claim.catalogHash);assert.equal(decoded.targets.length,catalog.targets.length);
  assert.ok(decoded.targets.some(t=>t.currentValue===null));assert.equal(decoded.sourceBindings[0].normalizedHash,textHash);
  const replay=decodeAssessMappingClaimResponse({value:await readClaim(),...expected});
  assert.equal(replay.state,'claimed');assert.equal(replay.ownsExecution,false);assert.equal(replay.recoveryMode,'none');
  const mutants=[v=>{v.runId=nextUuid()},v=>{v.catalogId=nextUuid()},v=>{v.catalogHash='not-a-hash'},v=>{v.targets[0].caseId=nextUuid()},v=>{v.targets[0].caseVersion++},v=>{v.targets[0].currentValue='substituted'},v=>{v.targets[0].unexpected=true},v=>{delete v.targets[0].currentValue},v=>{v.targets.reverse()},v=>{v.sourceBindings[0].sourceVersionId=nextUuid()},v=>{v.sourceBindings[0].normalizedHash='0'.repeat(64)},v=>{v.sourceBindings[0].extractionJobId='invalid'},v=>{v.sourceBindings.push(structuredClone(v.sourceBindings[0]))},v=>{v.sourceBindings[0].orgId=nextUuid()}];
  for(const mutate of mutants){const value=structuredClone(claim);mutate(value);assert.throws(()=>decodeAssessMappingClaimResponse({value,...expected}));}
  assert.deepEqual((await database.query('SELECT (SELECT count(*)::int FROM public.enterprise_assess_document_mapping_proposals WHERE run_id=$1) proposals,(SELECT count(*)::int FROM public.enterprise_ai_effect_journal WHERE receipt_id=$2) effects,(SELECT count(*)::int FROM public.synthetic_ai_campaign_effect_debits WHERE receipt_id=$2) debits',[runId,claimReceipt.id])).rows[0],{proposals:0,effects:0,debits:0});
  assert.equal(networkEffects,0);assert.equal(secretReads,0);
  return {targets:decoded.targets.length,mutants:mutants.length,networkEffects,secretReads};
 } finally {await database.query('ROLLBACK');globalThis.fetch=oldFetch;if(oldDeno===undefined)delete globalThis.Deno;else globalThis.Deno=oldDeno;}
}
