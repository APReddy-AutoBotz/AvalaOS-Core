import assert from 'node:assert/strict';
import crypto, {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';
import {validateAssessImportDatabaseUrl} from './assessImportValidationContract.mjs';
import {createEnterpriseIntelligenceFixture} from './enterpriseIntelligencePostgresFixture.mjs';
import {loadSyntheticAiModules} from './loadSyntheticAiModules.mjs';
import {meetingText} from './syntheticAiCampaignFixtures.mjs';

const originalFetch=globalThis.fetch;
const originalDeno=globalThis.Deno;
let defaultNetworkAttempts=0;
let defaultEnvironmentReads=0;
globalThis.fetch=async()=>{defaultNetworkAttempts+=1;throw new Error('BUDGET_PIPELINE_DEFAULT_NETWORK_FORBIDDEN')};
globalThis.Deno={env:{get(){defaultEnvironmentReads+=1;return undefined}}};

// This is a disposable-PostgreSQL integration harness, not a provider test.
// It preserves the production claim, token-budget, campaign-currency, gateway,
// stage and finalize code. Only the secret backend and HTTP transport are
// substituted, and both are counted so every pre-effect denial can prove that
// neither boundary was crossed.

const adminUrl=validateAssessImportDatabaseUrl(process.env.ASSESS_DOCUMENT_MAPPING_POSTGRES_ADMIN_URL);
const parsedAdmin=new URL(adminUrl);
assert.ok(['127.0.0.1','localhost','::1'].includes(parsedAdmin.hostname));
assert.equal(parsedAdmin.pathname,'/postgres');
const {Client}=pg;
const databaseName=`assess_studio_budget_${process.pid}_${Date.now()}`;
assert.match(databaseName,/^[a-z0-9_]+$/u);
const urlFor=name=>{const value=new URL(adminUrl);value.pathname=`/${name}`;return value.toString()};
const sha=value=>createHash('sha256').update(value).digest('hex');
const json=value=>JSON.stringify(value);
const uuid=()=>crypto.randomUUID();
const migrations=(await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')).sort();
assert.equal(migrations.at(-1),'20260923062439_studio_server_helper_permissions.sql');
const featureMigration='20260916083814_assess_supporting_document_mapping.sql';
const EXPECTED_ASSERTIONS=[
 'MAP-PG-BUDGET-001-legacy-domain-preserved',
 'MAP-PG-BUDGET-002-generic-mapping-denied',
 'MAP-PG-BUDGET-003-currency-requires-token-budget',
 'MAP-PG-BUDGET-004-release-transfer-fence',
 'MAP-PG-BUDGET-005-nontransferable-takeover',
 'MAP-PG-BUDGET-013-mapping-transfer-claim-response-loss',
 'MAP-PG-BUDGET-006-assess-full-chain',
 'MAP-PG-BUDGET-007-adversarial-identities',
 'MAP-PG-BUDGET-008-studio-full-chain',
 'MAP-PG-BUDGET-009-studio-finalize-response-loss',
 'MAP-PG-BUDGET-010-studio-stage-failure-no-paid-retry',
 'MAP-PG-BUDGET-014-studio-terminal-finalize-recovery',
 'MAP-PG-BUDGET-011-mixed-domain-shared-cap',
 'MAP-PG-BUDGET-012-post-effect-auth-change',
];
const expectedAssertions=[];
const pass=(testId,detail)=>{expectedAssertions.push(testId);console.log(`ASSESS_DOCUMENT_MAPPING_PG_ASSERTION ${JSON.stringify({testId,result:'passed',detail})}`)};

const transaction=async(client,label,sql)=>{await client.query('BEGIN');try{await client.query(sql);await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw new Error(`${label}:${error instanceof Error?`${'code'in error?error.code:'UNKNOWN'}:${error.message}`:String(error)}`)}};
const one=async(client,sql,values=[])=> (await client.query(sql,values)).rows[0];
const count=async(client,table,predicate='true',values=[])=>Number((await one(client,`SELECT count(*)::int n FROM ${table} WHERE ${predicate}`,values)).n);
const expectedFailure=async(operation,pattern)=>{try{await operation();assert.fail('EXPECTED_FAILURE')}catch(error){assert.match(String(error instanceof Error?error.message:error),pattern)}};

const createSqlRpc=database=>async(name,args)=>{
 assert.match(name,/^[a-z0-9_]+$/u);const entries=Object.entries(args);for(const [key] of entries)assert.match(key,/^p_[a-z0-9_]+$/u);
 const values=entries.map(([,value])=>value);const parameters=entries.map(([key],index)=>`${key} => $${index+1}`).join(',');
 return (await database.query(`SELECT public.${name}(${parameters}) result`,values)).rows[0].result;
};

const createFindOne=database=>async(table,query)=>{
 assert.match(table,/^[a-z0-9_]+$/u);const params=new URLSearchParams(query);const columns=params.get('select');
 assert.match(columns,/^[a-z0-9_,]+$/u);params.delete('select');const values=[],predicates=[];
 for(const [column,value] of params){assert.match(column,/^[a-z0-9_]+$/u);if(value==='is.null')predicates.push(`${column} IS NULL`);else{assert.ok(value.startsWith('eq.'));values.push(value.slice(3));predicates.push(`${column}=$${values.length}`)}}
 const row=(await database.query(`SELECT ${columns} FROM public.${table} WHERE ${predicates.join(' AND ')} LIMIT 1`,values)).rows[0]??null;
 if(row&&Object.hasOwn(row,'version'))row.version=Number(row.version);return row;
};

const createPostgrestRead=database=>async(path)=>{
 const [table,query='']=path.split('?');assert.match(table,/^[a-z0-9_]+$/u);
 const params=new URLSearchParams(query),columns=params.get('select');assert.match(columns,/^[a-z0-9_,]+$/u);params.delete('select');
 const values=[],predicates=[];let limit=100;
 for(const [column,value] of params){
  assert.match(column,/^[a-z0-9_]+$/u);
  if(column==='limit'){limit=Number(value);assert.ok(Number.isSafeInteger(limit)&&limit>=1&&limit<=2000);continue}
  if(column==='order')continue;
  if(value==='is.null'){predicates.push(`${column} IS NULL`);continue}
  assert.ok(value.startsWith('eq.'));values.push(value.slice(3));predicates.push(`${column}=$${values.length}`);
 }
 values.push(limit);const rows=(await database.query(`SELECT ${columns} FROM public.${table}${predicates.length?` WHERE ${predicates.join(' AND ')}`:''} LIMIT $${values.length}`,values)).rows;
 return rows.map(row=>{for(const key of ['version','candidate_count','anchor_count'])if(typeof row[key]==='string'&&/^\d+$/u.test(row[key]))row[key]=Number(row[key]);return row});
};

const createReceipt=async(database,fixture,commandType,label)=>{
 const requestId=uuid(),token=uuid(),requestHash=sha(`${commandType}:${label}`);
 const row=(await database.query(`SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,NULL,$8)).*`,[
  fixture.requester,fixture.org,fixture.workspace,commandType,`budget-pipeline-${label}`,requestId,requestHash,token,
 ])).rows[0];
 return {...row,request_id:requestId,request_hash:requestHash};
};

const buildMappingFixture=async(database,fixture,modules,routeId,authorizationVersion,label='positive')=>{
 const {extractEvidenceText,sha256Hex}=await import('../supabase/functions/_shared/enterpriseIntelligenceIngestion.ts');
 const {deriveTranscriptCommandRequestBinding}=await import('../supabase/functions/_shared/enterpriseIntelligenceCommand.ts');
 const sourceText=label==='positive'?meetingText:`${meetingText}\nSynthetic scenario: ${label}.`;
 const bytes=new TextEncoder().encode(sourceText);const text=await extractEvidenceText(bytes,'text/plain');assert.equal(text,sourceText);
 const contentHash=await sha256Hex(bytes),textHash=await sha256Hex(text);const sourceId=uuid(),sourceVersionId=uuid();
 const upload=await createReceipt(database,fixture,'evidence.source.create',`txt-upload-${label}`);
 const source={id:sourceId,org_id:fixture.org,workspace_id:fixture.workspace,display_name:`Budget pipeline AP meeting ${label}`,source_kind:'upload',mime_type:'text/plain',created_by:fixture.requester};
 const version={id:sourceVersionId,source_id:sourceId,org_id:fixture.org,workspace_id:fixture.workspace,original_filename:'synthetic-ap-meeting.txt',content_hash:contentHash,content_bytes:bytes.length,storage_bucket:'source-uploads',storage_path:`${fixture.org}/${fixture.workspace}/enterprise-evidence/${sourceId}.bin`,extracted_text_hash:null,extracted_character_count:null,created_by:fixture.requester};
 await database.query('SELECT public.enterprise_create_evidence_source_record($1::jsonb,$2::jsonb,$3,$4,$5,$6::jsonb)',[json(source),json(version),upload.id,upload.execution_token,upload.execution_fence,json({sourceId,sourceVersionId,status:'uploaded'})]);
 await database.query('SELECT public.enterprise_record_source_extraction_success($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',[sourceVersionId,fixture.org,fixture.workspace,textHash,text.length,upload.id,upload.execution_token,upload.execution_fence,json({sourceId,sourceVersionId,status:'parsed'})]);
 const persisted=await one(database,'SELECT parser_version FROM public.enterprise_evidence_source_versions WHERE id=$1',[sourceVersionId]);
 const caseId=uuid(),versionId=uuid(),processId=label==='positive'?fixture.process:uuid();
 if(label!=='positive')await database.query(`INSERT INTO public.assess_processes(id,org_id,workspace_id,name,status,created_by)
  VALUES($1,$2,$3,$4,'Draft',$5)`,[processId,fixture.org,fixture.workspace,`Budget pipeline process ${label}`,fixture.requester]);
 const fact=(fieldId,value)=>({fieldId,value,status:value===null?'unknown':'known',evidenceIds:[],source:'user'});
 const agentNecessity={irreducibleAmbiguity:fact('agent.irreducibleAmbiguity',null),adaptiveNextStep:fact('agent.adaptiveNextStep',null),toolOrPathSelection:fact('agent.toolOrPathSelection',null),incrementalValue:fact('agent.incrementalValue',null),controllable:fact('agent.controllable',null)};
 const draft={caseId,name:`AI campaign AP invoice exceptions ${label}`,description:'Manual baseline description',primitives:[],edges:[],decisionPoints:[],exceptionPaths:[],applicationAssets:[],interactions:[],evidenceLinks:[],agentNecessity,candidateEvaluations:[],gateResults:[],controlRequirements:[],modernizationDispositions:[]};
 await database.query(`INSERT INTO public.assess_v2_cases(id,org_id,workspace_id,process_id,owner_id,status,version) VALUES($1,$2,$3,$4,$5,'draft',1)`,[caseId,fixture.org,fixture.workspace,processId,fixture.requester]);
 await database.query(`INSERT INTO public.assess_v2_case_versions(id,case_id,org_id,workspace_id,version,name,description,agent_necessity,source_kind,created_by) VALUES($1,$2,$3,$4,1,$5,$6,$7::jsonb,'create',$8)`,[versionId,caseId,fixture.org,fixture.workspace,draft.name,draft.description,json(agentNecessity),fixture.requester]);
 await database.query('UPDATE public.assess_v2_cases SET head_version_id=$1 WHERE id=$2',[versionId,caseId]);
 const setId=uuid(),setVersionId=uuid(),bundleId=uuid(),bundleVersionId=uuid();
 await database.query(`INSERT INTO public.enterprise_source_sets(id,org_id,workspace_id,owner_module,display_label,description,current_version,status,created_by) VALUES($1,$2,$3,'assess',$4,'Synthetic TXT',1,'locked',$5)`,[setId,fixture.org,fixture.workspace,`Budget pipeline sources ${label}`,fixture.requester]);
 await database.query(`INSERT INTO public.enterprise_source_set_versions(id,source_set_id,org_id,workspace_id,version,purpose,manifest_hash,source_count,extracted_character_count,status,created_by) VALUES($1,$2,$3,$4,1,$5,$6,1,$7,'locked',$8)`,[setVersionId,setId,fixture.org,fixture.workspace,`Budget pipeline ${label}`,sha(`budget-pipeline-set:${label}`),text.length,fixture.requester]);
 await database.query(`INSERT INTO public.enterprise_source_set_version_items(source_set_version_id,source_set_id,source_version_id,source_id,org_id,workspace_id,ordinal,semantic_role,content_hash,extracted_text_hash,extracted_character_count) VALUES($1,$2,$3,$4,$5,$6,1,'primary',$7,$8,$9)`,[setVersionId,setId,sourceVersionId,sourceId,fixture.org,fixture.workspace,contentHash,textHash,text.length]);
 await database.query(`INSERT INTO public.enterprise_module_input_bundles(id,org_id,workspace_id,owner_module,current_version,created_by) VALUES($1,$2,$3,'assess',1,$4)`,[bundleId,fixture.org,fixture.workspace,fixture.requester]);
 await database.query(`INSERT INTO public.enterprise_module_input_bundle_versions(id,input_bundle_id,org_id,workspace_id,version,bundle_hash,status,created_by) VALUES($1,$2,$3,$4,1,$5,'locked',$6)`,[bundleVersionId,bundleId,fixture.org,fixture.workspace,sha(`budget-pipeline-bundle:${label}`),fixture.requester]);
 await database.query(`INSERT INTO public.enterprise_module_input_bundle_items(input_bundle_version_id,input_bundle_id,org_id,workspace_id,ordinal,item_kind,source_set_version_id,source_set_id,resource_hash,declared_purpose) VALUES($1,$2,$3,$4,1,'source_set',$5,$6,$7,'Assess mapping budget pipeline')`,[bundleVersionId,bundleId,fixture.org,fixture.workspace,setVersionId,setId,sha(`budget-pipeline-set:${label}`)]);
 const selection={sourceSetId:setId,sourceSetVersionId:setVersionId,expectedSourceSetVersion:1,sourceId,sourceVersionId};
 const payload={caseId,expectedCaseVersion:1,inputBundleId:bundleId,inputBundleVersionId:bundleVersionId,expectedInputBundleVersion:1,selections:[selection]};
 const authority={actorId:fixture.requester,organizationId:fixture.org,workspaceId:fixture.workspace,authorizationVersion};
 const requestBinding=await deriveTranscriptCommandRequestBinding(authority,{commandType:'assess.document-map.analyze',payload},{findOne:createFindOne(database)});
 assert.equal(requestBinding.sources[0].sourceVersionId,sourceVersionId);
 const catalogId=uuid(),runId=uuid(),receipt=await createReceipt(database,fixture,'assess.document-map.analyze',label);
 const catalog=await modules.buildAssessMappingCatalog({catalogId,caseId,caseVersion:1,assessSchemaVersion:'assess-v2-schema-2026-07',draft,createSelectorId:uuid});
 const sourceBindings=[{...selection,parserVersion:persisted.parser_version,normalizedHash:textHash,extractedByteCount:bytes.length,sheetCount:0,cellCount:0,warnings:[]}];
 const mappingClaimArgs=[runId,catalogId,caseId,1,'assess-v2-schema-2026-07',catalog.catalogHash,json(catalog.targets),bundleId,bundleVersionId,1,json(sourceBindings),routeId,fixture.provider,'openai','gpt-4.1-mini-2025-04-14','assess-supporting-document-map-v1',fixture.requester,fixture.org,fixture.workspace,authorizationVersion,receipt.id,receipt.execution_token,receipt.execution_fence];
 const claimValue=(await database.query(`SELECT public.enterprise_claim_assess_document_mapping_run_v1(${mappingClaimArgs.map((_,index)=>`$${index+1}`).join(',')}) result`,mappingClaimArgs)).rows[0].result;
 const claim=modules.decodeAssessMappingClaimResponse({value:claimValue,runId,catalogId,targets:catalog.targets,sourceBindings});
 const target=claim.targets.find(item=>item.fieldId==='case.description');assert.ok(target);
 return {authority,caseId,processId,draft,sourceId,sourceVersionId,text,textHash,routeId,catalogId,runId,receipt,catalog,claim,target,sourceBindings,mappingClaimArgs,label};
};

const reclaimMappingReceipt=async(database,fixture,label)=>{
 const requestId=uuid(),token=uuid();
 return (await database.query(`SELECT (public.enterprise_ai_claim_command($1,$2,$3,'assess.document-map.analyze',$4,$5,$6,NULL,$7)).*`,[
  fixture.requester,fixture.org,fixture.workspace,`budget-pipeline-${label}`,requestId,sha(`assess.document-map.analyze:${label}`),token,
 ])).rows[0];
};

const reclaimMappingRun=async(database,mapping,receipt)=>{
 const args=[...mapping.mappingClaimArgs];args[20]=receipt.id;args[21]=receipt.execution_token;args[22]=receipt.execution_fence;
 return (await database.query(`SELECT public.enterprise_claim_assess_document_mapping_run_v1(${args.map((_,index)=>`$${index+1}`).join(',')}) result`,args)).rows[0].result;
};

const createCampaignGateway=({database,fixture,keyRef,projectRef,targetFingerprint})=>{
 const invoke=createSqlRpc(database);let secretReads=0,fetches=0;
 const readEnv=name=>name==='AVALA_SYNTHETIC_AI_TARGET_FINGERPRINT'?targetFingerprint:name==='SUPABASE_URL'?`https://${projectRef}.supabase.co/`:undefined;
 const gatewayDeps={
  reserveEffect:input=>fixture.modules.reserveSyntheticAiProviderEffect(input,{invoke,readEnv}),
  consumeEffect:permit=>fixture.modules.consumeSyntheticAiProviderEffect(permit,invoke),
  secretBackend:{kind:'environment',writable:false,async resolve(){secretReads++;return 'synthetic-not-a-real-key'}},
  lookupKeyRef:async()=>({id:keyRef.id,org_id:fixture.org,provider:'openai',resolver_type:'server_reference',secret_ref:keyRef.secret_ref,status:keyRef.status,deleted_at:null}),
 };
 const fakeFetch=output=>async()=>{fetches++;return new Response(json({model:'gpt-4.1-mini-2025-04-14',choices:[{message:{content:json(output)}}],usage:{prompt_tokens:100,completion_tokens:40,total_tokens:140}}),{status:200,headers:{'content-type':'application/json'}})};
 return {invoke,gatewayDeps,fakeFetch,counts:()=>({secretReads,fetches})};
};

let admin,database,fixture,databaseCreated=false;const auxiliaryClients=[];
try{
 admin=new Client({connectionString:adminUrl});await admin.connect();
 const version=Number((await one(admin,"SELECT current_setting('server_version_num')::int version")).version);assert.ok(version>=160000&&version<170000);
 assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[databaseName])).rowCount,0);
 await admin.query(`CREATE DATABASE ${databaseName}`);databaseCreated=true;
 database=new Client({connectionString:urlFor(databaseName)});await database.connect();
 await transaction(database,'auth bootstrap',`CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid primary key);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';GRANT USAGE ON SCHEMA auth TO authenticated;GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
 for(const name of migrations){
  if(name===featureMigration){fixture=await createEnterpriseIntelligenceFixture(database);await database.query(`INSERT INTO public.enterprise_transcript_workspace_flags(org_id,workspace_id,transcript_source_sets_enabled,assess_multisource_apply_enabled,unified_byok_gateway_enabled,governed_journeys_enabled,updated_by) VALUES($1,$2,true,true,true,true,$3)`,[fixture.org,fixture.workspace,fixture.requester])}
  await transaction(database,name,await readFile(join('supabase/migrations',name),'utf8'));
 }
 assert.ok(fixture);const modules=await loadSyntheticAiModules();fixture.modules=modules;
 const providerBudget=await import('../supabase/functions/_shared/providerBudget.ts');
 const enterpriseAi=await import('../supabase/functions/_shared/enterpriseIntelligenceAi.ts');
 const syntheticCampaign=await import('../supabase/functions/_shared/syntheticAiCampaign.ts');
 Object.assign(modules,syntheticCampaign);
 const mappingModule=await import('../supabase/functions/_shared/assessDocumentMapping.ts');
 const mappingBudgetModule=await import('../supabase/functions/_shared/assessMappingProviderBudget.ts');
 const studioGeneration=await import('../supabase/functions/_shared/studioArtifactGeneration.ts');
 const studioProvider=await import('../supabase/functions/_shared/studioArtifactProvider.ts');
 const studioDb=await import('../supabase/functions/_shared/studioArtifactDb.ts');
 const studioBudgetInputFor=claim=>({
  authority:{actorId:claim.actorId,organizationId:claim.organizationId,workspaceId:claim.workspaceId,authorizationVersion:claim.authorizationVersion},
  execution:{receiptId:claim.receiptId,jobId:claim.attemptId,executionToken:claim.executionToken,executionFence:claim.executionFence,
   routeId:claim.providerPlan.routeId,providerConfigId:claim.providerPlan.providerConfigId,provider:claim.providerPlan.provider,
   capability:'studio.document.generate',model:claim.providerPlan.model},
  estimatedInputTokens:studioProvider.estimateStudioProviderInputTokens({sourcePackage:claim.sourcePackage,templatePayload:claim.templatePayload,
   selectedSourceVersionIds:claim.selectedSourceVersionIds,canonicalSourceAnchors:claim.sourceAnchors,manualBrief:claim.manualBrief}),
  maximumOutputTokens:claim.maximumOutputTokens,
 });
 await database.query("SELECT set_config('request.headers',$1,false)",[json({host:'abcdefghijklmnopqrst.supabase.co'})]);
 await database.query(`INSERT INTO public.role_capabilities(role_id,capability_key) SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING`,[fixture.routeRole,['org.admin','assess.v2.read','assess.v2.draft.write','evidence.write','evidence.review','transcript.assess.apply','transcript.sources.read','studio.artifacts.read','studio.artifacts.edit','studio.artifacts.generate','studio.templates.manage']]);
 await database.query(`INSERT INTO public.role_capabilities(role_id,capability_key) SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING`,[fixture.role,['studio.templates.review','studio.templates.approve']]);
 const authorizationVersion=Number((await one(database,'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',[fixture.org,fixture.requester])).version);
 await database.query(`UPDATE public.enterprise_transcript_workspace_flags SET assess_document_mapping_enabled=true,unified_byok_gateway_enabled=true,
  studio_multisource_enabled=true,studio_tenant_templates_enabled=true,direct_studio_planning_enabled=true,module_handoffs_enabled=true WHERE org_id=$1 AND workspace_id=$2`,[fixture.org,fixture.workspace]);
 await database.query(`UPDATE public.enterprise_intelligence_runtime_control SET enabled=true,read_only=false,provider_enabled=true WHERE singleton`);
 await database.query(`UPDATE public.studio_artifact_runtime_control SET enabled=true,read_only=false,provider_enabled=true WHERE singleton`);
 const keyRef=await one(database,'SELECT id,secret_ref,status FROM public.ai_provider_key_refs WHERE id=$1',[fixture.keyRef]);
 keyRef.secret_ref=`AVALA_PROVIDER_SECRET_OPENAI_${fixture.org.replaceAll('-','').toUpperCase()}_QA`;
 await database.query(`UPDATE public.ai_provider_key_refs SET secret_ref=$2,status='active' WHERE id=$1`,[fixture.keyRef,keyRef.secret_ref]);keyRef.status='active';
 await database.query(`UPDATE public.ai_provider_configs SET default_model='gpt-4.1-mini-2025-04-14',model_allowlist=ARRAY['gpt-4.1-mini-2025-04-14'],endpoint_url='https://api.openai.com',last_validated_at=statement_timestamp(),status='active' WHERE id=$1`,[fixture.provider]);
 const assessRoute=uuid(),studioRoute=uuid();
 for(const [id,capability] of [[assessRoute,'assess.evidence.extract'],[studioRoute,'studio.document.generate']])await database.query(`INSERT INTO public.enterprise_ai_capability_routes(id,org_id,workspace_id,provider_config_id,capability,model,enabled,allowed_roles,version,created_by,updated_by) VALUES($1,$2,$3,$4,$5,'gpt-4.1-mini-2025-04-14',true,ARRAY[$6::text],1,$7,$7)`,[id,fixture.org,fixture.workspace,fixture.provider,capability,fixture.routeRole,fixture.requester]);
 const targetId=uuid(),fingerprint=`sha256:${'b'.repeat(64)}`,projectRef='abcdefghijklmnopqrst';
 await database.query(`INSERT INTO public.synthetic_admin_targets(id,target_fingerprint,org_id,workspace_id,operator_actor_id,organization_member_role_id,environment_class,enabled) VALUES($1,$2,$3,$4,$5,$6,'hosted_nonproduction_pilot',true)`,[targetId,fingerprint,fixture.org,fixture.workspace,fixture.requester,fixture.role]);
 await database.query(`INSERT INTO public.synthetic_ai_campaign_authorities(target_id,target_fingerprint,project_ref,server_host,local_carry_seal_digest,org_id,workspace_id,operator_actor_id,provider_config_id,key_ref_id,assess_route_id,studio_route_id,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,statement_timestamp()+interval '1 hour')`,[targetId,fingerprint,projectRef,`${projectRef}.supabase.co`,`sha256:${'c'.repeat(64)}`,fixture.org,fixture.workspace,fixture.requester,fixture.provider,fixture.keyRef,assessRoute,studioRoute]);
 const campaignBudget=await one(database,`SELECT campaign_cap_usd_nanos,carried_usd_nanos,fixed_debit_usd_nanos
  FROM public.synthetic_ai_campaign_authorities WHERE target_id=$1`,[targetId]);
 assert.equal(Number(campaignBudget.campaign_cap_usd_nanos),10_000_000_000);
 const gateway=createCampaignGateway({database,fixture,keyRef,projectRef,targetFingerprint:fingerprint});
 const campaignRuntime={readEnv:name=>name==='AVALA_SYNTHETIC_AI_TARGET_FINGERPRINT'?fingerprint:name==='SUPABASE_URL'?`https://${projectRef}.supabase.co/`:undefined};

 // The v2 currency binding is additive: the accepted legacy extraction domain
 // remains valid even though this synthetic target requires an explicit campaign
 // permit before an actual effect can execute.
 const legacyReceipt=await createReceipt(database,fixture,'transcript.assess.extract','legacy-ordinary-binding');
 const legacyJob=uuid();
 await database.query(`INSERT INTO public.enterprise_ai_job_ledger(
  id,org_id,workspace_id,capability,provider_config_id,provider,model,prompt_key,prompt_version,actor_id,
  request_id,idempotency_key,status,approval_state,receipt_id,request_hash,execution_token,execution_fence,route_id)
  VALUES($1,$2,$3,'assess.evidence.extract',$4,'openai','gpt-4.1-mini-2025-04-14','assess.evidence.extract','budget-pipeline-v1',$5,
  $6,$7,'running','review_required',$8,$9,$10,$11,$12)`,[
  legacyJob,fixture.org,fixture.workspace,fixture.provider,fixture.requester,legacyReceipt.request_id,
  `budget-pipeline-legacy-${legacyJob}`,legacyReceipt.id,legacyReceipt.request_hash,legacyReceipt.execution_token,
  legacyReceipt.execution_fence,assessRoute,
 ]);
 const reserveLegacyBudget=(estimatedInputTokens=100,maximumOutputTokens=4096)=>one(database,`SELECT public.enterprise_ai_reserve_provider_budget(
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'openai','assess.evidence.extract','gpt-4.1-mini-2025-04-14',$11,$12) result`,[
  fixture.requester,fixture.org,fixture.workspace,authorizationVersion,legacyReceipt.id,legacyJob,
  legacyReceipt.execution_token,legacyReceipt.execution_fence,assessRoute,fixture.provider,estimatedInputTokens,maximumOutputTokens,
 ]).then(row=>row.result);
 const legacyBudget=await reserveLegacyBudget();
 assert.equal(legacyBudget.state,'reserved');assert.equal(legacyBudget.ownsProviderEffect,true);
 const legacyReplayBefore=await reserveLegacyBudget();assert.equal(legacyReplayBefore.ownsProviderEffect,false);assert.equal(legacyReplayBefore.replayed,true);
 assert.equal((await reserveLegacyBudget(101,4096)).errorCode,'PROVIDER_ROUTE_STALE');
 assert.equal((await reserveLegacyBudget(100,4095)).errorCode,'PROVIDER_ROUTE_STALE');
 const legacyStored=await one(database,'SELECT estimated_input_tokens,maximum_output_tokens FROM public.enterprise_ai_budget_reservations WHERE job_id=$1',[legacyJob]);
 assert.deepEqual({estimated:Number(legacyStored.estimated_input_tokens),maximum:Number(legacyStored.maximum_output_tokens)},{estimated:100,maximum:4096});
 assert.equal(await count(database,'public.enterprise_ai_budget_reservations','job_id=$1',[legacyJob]),1);
 const legacyReplayAfter=await reserveLegacyBudget();assert.equal(legacyReplayAfter.ownsProviderEffect,false);assert.equal(legacyReplayAfter.replayed,true);
 const legacyBinding=(await one(database,`SELECT public.synthetic_ai_campaign_effect_binding_v2(
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'openai','https://api.openai.com','gpt-4.1-mini-2025-04-14',
  'assess.evidence.extract',$12,4096) result`,[
  fixture.requester,fixture.org,fixture.workspace,authorizationVersion,legacyReceipt.id,legacyJob,
  legacyReceipt.execution_token,legacyReceipt.execution_fence,assessRoute,fixture.provider,fixture.keyRef,sha('legacy-effect'),
 ])).result;
 assert.equal(legacyBinding.authorityKind,'enterprise');assert.equal(await count(database,'public.synthetic_ai_campaign_effect_debits'),0);
 const ordinary={actor:uuid(),org:uuid(),workspace:uuid(),role:uuid(),key:uuid(),config:uuid(),route:uuid(),receipt:uuid(),effect:uuid(),token:uuid(),request:uuid()};
 await database.query('INSERT INTO auth.users(id) VALUES($1)',[ordinary.actor]);
 await database.query("INSERT INTO public.profiles(id,email) VALUES($1,$2)",[ordinary.actor,`ordinary-${ordinary.actor}@avalaos.invalid`]);
 await database.query("INSERT INTO public.organizations(id,name,slug) VALUES($1,'Ordinary gateway tenant',$2)",[ordinary.org,`ordinary-${ordinary.org.slice(0,8)}`]);
 await database.query("INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,'Ordinary gateway workspace',$3)",[ordinary.workspace,ordinary.org,`ordinary-${ordinary.workspace.slice(0,8)}`]);
 await database.query("INSERT INTO public.roles(id,org_id,name,slug,scope,permissions,status,created_by) VALUES($1,$2,'Ordinary gateway operator',$3,'organization','[]','active',$4)",[ordinary.role,ordinary.org,`ordinary-${ordinary.role.slice(0,8)}`,ordinary.actor]);
 await database.query("INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,'org.admin')",[ordinary.role]);
 await database.query("INSERT INTO public.organization_members(org_id,user_id,role_id,status) VALUES($1,$2,$3,'active')",[ordinary.org,ordinary.actor,ordinary.role]);
 await database.query("INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,status) VALUES($1,$2,$3,'active')",[ordinary.org,ordinary.workspace,ordinary.actor]);
 const ordinaryAuthorization=Number((await one(database,'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',[ordinary.org,ordinary.actor])).version);
 await database.query(`INSERT INTO public.ai_provider_key_refs(id,org_id,provider,resolver_type,secret_ref,safe_label,status,created_by)
  VALUES($1,$2,'openai','server_reference',$3,'Ordinary compatibility key','active',$4)`,[ordinary.key,ordinary.org,`AVALA_PROVIDER_SECRET_OPENAI_${ordinary.org.replaceAll('-','').toUpperCase()}_ORDINARY`,ordinary.actor]);
 await database.query(`INSERT INTO public.ai_provider_configs(id,org_id,provider,display_name,key_ref_id,default_model,model_allowlist,
  endpoint_url,allowed_modes,allowed_operations,budget_policy,last_validated_at,status,created_by,updated_by)
  VALUES($1,$2,'openai','Ordinary compatibility provider',$3,'gpt-4.1-mini-2025-04-14',ARRAY['gpt-4.1-mini-2025-04-14'],
  'https://api.openai.com',ARRAY['pilot'],ARRAY['generate_document'],'{}'::jsonb,statement_timestamp(),'active',$4,$4)`,[ordinary.config,ordinary.org,ordinary.key,ordinary.actor]);
 await database.query(`INSERT INTO public.enterprise_ai_capability_routes(id,org_id,workspace_id,provider_config_id,capability,model,enabled,allowed_roles,version,created_by,updated_by)
  VALUES($1,$2,$3,$4,'assemble.blueprint.draft','gpt-4.1-mini-2025-04-14',true,ARRAY[$5::text],1,$6,$6)`,[ordinary.route,ordinary.org,ordinary.workspace,ordinary.config,ordinary.role,ordinary.actor]);
 const ordinaryHash=sha('ordinary-nonmapping-command');
 const ordinaryReceipt=(await database.query(`SELECT (public.enterprise_ai_claim_command($1,$2,$3,'assemble.blueprint.create','ordinary-nonmapping',$4,$5,NULL,$6)).*`,[
  ordinary.actor,ordinary.org,ordinary.workspace,ordinary.request,ordinaryHash,ordinary.token,
 ])).rows[0];
 const ordinaryEffect={actorId:ordinary.actor,organizationId:ordinary.org,workspaceId:ordinary.workspace,authorizationVersion:ordinaryAuthorization,
  receiptId:ordinaryReceipt.id,effectId:ordinary.effect,executionToken:ordinaryReceipt.execution_token,executionFence:Number(ordinaryReceipt.execution_fence),
  routeId:ordinary.route,providerConfigId:ordinary.config,keyRefId:ordinary.key,provider:'openai',endpoint:'https://api.openai.com',
  model:'gpt-4.1-mini-2025-04-14',operation:'assemble.blueprint.draft',requestHash:sha('ordinary-nonmapping-effect'),maximumOutputTokens:4096};
 const ordinaryPermit=await modules.reserveSyntheticAiProviderEffect(ordinaryEffect,{invoke:gateway.invoke,readEnv:()=>undefined});
 assert.equal(ordinaryPermit.mode,'ordinary');assert.equal(ordinaryPermit.ownsProviderEffect,true);assert.equal(ordinaryPermit.replayed,false);
 await modules.consumeSyntheticAiProviderEffect(ordinaryPermit,gateway.invoke);assert.equal(await count(database,'public.synthetic_ai_campaign_effect_debits'),0);
 pass('MAP-PG-BUDGET-001-legacy-domain-preserved','the additive binding preserves a real legacy extraction token and an unrelated non-campaign, non-mapping ordinary gateway reserve/consume without creating a campaign debit');

 const mapping=await buildMappingFixture(database,fixture,modules,assessRoute,authorizationVersion);
 const budgetInputFor=(candidate,receipt=candidate.receipt)=>({authority:candidate.authority,execution:{receiptId:receipt.id,jobId:candidate.runId,executionToken:receipt.execution_token,executionFence:Number(receipt.execution_fence),routeId:assessRoute,providerConfigId:fixture.provider,provider:'openai',capability:'assess.evidence.extract',model:'gpt-4.1-mini-2025-04-14'},estimatedInputTokens:400,maximumOutputTokens:4096});
 const rawReserveArgsFor=input=>({p_actor:input.authority.actorId,p_org:input.authority.organizationId,p_workspace:input.authority.workspaceId,p_authorization_version:input.authority.authorizationVersion,p_job:input.execution.jobId,p_receipt:input.execution.receiptId,p_execution_token:input.execution.executionToken,p_execution_fence:input.execution.executionFence,p_route:input.execution.routeId,p_provider_config:input.execution.providerConfigId,p_provider:input.execution.provider,p_capability:input.execution.capability,p_model:input.execution.model,p_estimated_input_tokens:input.estimatedInputTokens,p_maximum_output_tokens:input.maximumOutputTokens});
 const mappingInvoke=(name,args)=>mappingBudgetModule.assessMappingBudgetRpc(name,args,gateway.invoke);
 const budgetInput=budgetInputFor(mapping);
 await expectedFailure(()=>providerBudget.reserveProviderBudget(budgetInput,gateway.invoke),/BUDGET_PERSISTENCE_UNAVAILABLE|PROVIDER_ROUTE_STALE/u);
 assert.equal(await count(database,'public.enterprise_ai_budget_reservations','assess_mapping_run_id=$1',[mapping.runId]),0);
 pass('MAP-PG-BUDGET-002-generic-mapping-denied','the legacy enterprise-job budget RPC rejects an Assess mapping run and creates no reservation');

 const directEffect={actorId:fixture.requester,organizationId:fixture.org,workspaceId:fixture.workspace,authorizationVersion,receiptId:mapping.receipt.id,effectId:mapping.runId,executionToken:mapping.receipt.execution_token,executionFence:Number(mapping.receipt.execution_fence),routeId:assessRoute,providerConfigId:fixture.provider,keyRefId:fixture.keyRef,provider:'openai',endpoint:'https://api.openai.com',model:'gpt-4.1-mini-2025-04-14',operation:'assess.evidence.extract',requestHash:sha('direct-currency-without-token-budget'),maximumOutputTokens:4096};
 await expectedFailure(()=>modules.reserveSyntheticAiProviderEffect(directEffect,{invoke:gateway.invoke,readEnv:name=>name==='AVALA_SYNTHETIC_AI_TARGET_FINGERPRINT'?fingerprint:name==='SUPABASE_URL'?`https://${projectRef}.supabase.co/`:undefined}),/AUTHORITY_UNAVAILABLE/u);
 assert.equal(await count(database,'public.synthetic_ai_campaign_effect_debits'),0);
 pass('MAP-PG-BUDGET-003-currency-requires-token-budget','campaign currency rejects a direct Assess effect before a mapping token reservation with zero debit');

 // A cancellation before the provider effect may release and transfer the
 // reservation exactly once to a newer receipt fence. No currency permit,
 // secret lookup, or HTTP call exists at either cancelled fence.
 const transfer=await buildMappingFixture(database,fixture,modules,assessRoute,authorizationVersion,'release-transfer');
 const transferOriginal=budgetInputFor(transfer);let forbiddenTransferEffects=0;
 const reserveThenReleaseBeforeEffect=async input=>{
  const raw=await mappingInvoke('enterprise_ai_reserve_provider_budget',rawReserveArgsFor(input));
  assert.equal(raw.state,'reserved');assert.equal(raw.ownsProviderEffect,true);
  const released=await providerBudget.releaseProviderBudget({...input,reservationId:raw.reservationId,releaseReason:'before_provider_effect'},mappingInvoke);
  assert.equal(released.state,'released');return released;
 };
 await reserveThenReleaseBeforeEffect(transferOriginal);
 const transferReservation=await one(database,'SELECT id,state,assess_mapping_transfer_count FROM public.enterprise_ai_budget_reservations WHERE assess_mapping_run_id=$1',[transfer.runId]);
 assert.equal(transferReservation.state,'released');assert.equal(Number(transferReservation.assess_mapping_transfer_count),0);
 await database.query("UPDATE public.enterprise_ai_command_receipts SET lease_expires_at=statement_timestamp()-interval '1 second' WHERE id=$1",[transfer.receipt.id]);
 const transferReceipt2=await reclaimMappingReceipt(database,fixture,transfer.label);assert.equal(Number(transferReceipt2.execution_fence),Number(transfer.receipt.execution_fence)+1);
 const transferClaim2=await reclaimMappingRun(database,transfer,transferReceipt2);assert.equal(transferClaim2.ownsExecution,true);assert.equal(transferClaim2.recoveryMode,'execute_provider');
 const transferSecond=budgetInputFor(transfer,transferReceipt2);await reserveThenReleaseBeforeEffect(transferSecond);
 const transferred=await one(database,'SELECT state,execution_fence,assess_mapping_transfer_count,assess_mapping_transfer_pending FROM public.enterprise_ai_budget_reservations WHERE id=$1',[transferReservation.id]);
 assert.deepEqual({state:transferred.state,fence:Number(transferred.execution_fence),transfers:Number(transferred.assess_mapping_transfer_count),pending:transferred.assess_mapping_transfer_pending},{state:'released',fence:Number(transferReceipt2.execution_fence),transfers:1,pending:false});
 for(const operation of [
  ()=>providerBudget.reserveProviderBudget(transferOriginal,mappingInvoke),
  ()=>providerBudget.settleProviderBudget({...transferOriginal,reservationId:transferReservation.id,usage:{inputTokens:1,outputTokens:1,totalTokens:2}},mappingInvoke),
  ()=>providerBudget.markProviderBudgetUncertain({...transferOriginal,reservationId:transferReservation.id,failureClass:'stale_fence'},mappingInvoke),
  ()=>providerBudget.releaseProviderBudget({...transferOriginal,reservationId:transferReservation.id,releaseReason:'before_provider_effect'},mappingInvoke),
 ])await expectedFailure(operation,/PROVIDER_ROUTE_STALE|BUDGET_PERSISTENCE_UNAVAILABLE/u);
 await database.query("UPDATE public.enterprise_ai_command_receipts SET lease_expires_at=statement_timestamp()-interval '1 second' WHERE id=$1",[transferReceipt2.id]);
 const transferReceipt3=await reclaimMappingReceipt(database,fixture,transfer.label);const transferClaim3=await reclaimMappingRun(database,transfer,transferReceipt3);
 assert.equal(transferClaim3.ownsExecution,false);assert.equal(transferClaim3.recoveryMode,'none');
 assert.equal(forbiddenTransferEffects,0);assert.deepEqual(gateway.counts(),{secretReads:0,fetches:0});
 assert.equal(await count(database,'public.synthetic_ai_campaign_effect_debits','assess_mapping_run_id=$1',[transfer.runId]),0);
 pass('MAP-PG-BUDGET-004-release-transfer-fence','pre-effect cancellation releases without currency, transfers once to the next fence, rejects every old-fence budget mutation, and refuses a second transfer without a provider call');

 // Reserved and uncertain token authority can never be stolen by a later
 // receipt lease. The real claim wrapper returns a non-owning snapshot and the
 // higher-fence budget attempt fails before the supplied effect callback.
 for(const [label,makeUncertain] of [['reserved-takeover',false],['uncertain-takeover',true]]){
  const candidate=await buildMappingFixture(database,fixture,modules,assessRoute,authorizationVersion,label);const initial=budgetInputFor(candidate);
  const reservation=await providerBudget.reserveProviderBudget(initial,mappingInvoke);assert.equal(reservation.ownsProviderEffect,true);
  if(makeUncertain){const uncertain=await providerBudget.markProviderBudgetUncertain({...initial,reservationId:reservation.reservationId,failureClass:'synthetic_transport_loss'},mappingInvoke);assert.equal(uncertain.state,'uncertain')}
  await database.query("UPDATE public.enterprise_ai_command_receipts SET lease_expires_at=statement_timestamp()-interval '1 second' WHERE id=$1",[candidate.receipt.id]);
  const newer=await reclaimMappingReceipt(database,fixture,candidate.label);const blocked=await reclaimMappingRun(database,candidate,newer);assert.equal(blocked.ownsExecution,false);
  let effects=0;await expectedFailure(()=>providerBudget.runBudgetedProviderEffect(budgetInputFor(candidate,newer),async()=>{effects+=1;throw new Error('PROVIDER_EFFECT_FORBIDDEN')},{beforeSettle:async()=>{},invoke:mappingInvoke}),/PROVIDER_ROUTE_STALE/u);
  assert.equal(effects,0);assert.equal(await count(database,'public.synthetic_ai_campaign_effect_debits','assess_mapping_run_id=$1',[candidate.runId]),0);
 }
 assert.deepEqual(gateway.counts(),{secretReads:0,fetches:0});
 pass('MAP-PG-BUDGET-005-nontransferable-takeover','reserved and uncertain mapping reservations block newer-fence takeover and provider execution');

 // A committed transfer claim can lose its response before the one-use budget
 // grant is consumed. Exercise both exact-fence retry and a later valid fence;
 // neither path may create currency authority or cross secret/provider borders.
 const claimMappingWith=async(candidate,receipt,mutate=()=>{})=>{
  const args=[...candidate.mappingClaimArgs];args[20]=receipt.id;args[21]=receipt.execution_token;args[22]=receipt.execution_fence;mutate(args);
  return (await database.query(`SELECT public.enterprise_claim_assess_document_mapping_run_v1(${args.map((_,index)=>`$${index+1}`).join(',')}) result`,args)).rows[0].result;
 };
 const prepareLostMappingTransfer=async label=>{
  const candidate=await buildMappingFixture(database,fixture,modules,assessRoute,authorizationVersion,label);
  const originalBudget=budgetInputFor(candidate);const reservation=await providerBudget.reserveProviderBudget(originalBudget,mappingInvoke);
  assert.equal(reservation.ownsProviderEffect,true);
  const released=await providerBudget.releaseProviderBudget({...originalBudget,reservationId:reservation.reservationId,releaseReason:'before_provider_effect'},mappingInvoke);
  assert.equal(released.state,'released');
  await database.query("UPDATE public.enterprise_ai_command_receipts SET lease_expires_at=statement_timestamp()-interval '1 second' WHERE id=$1",[candidate.receipt.id]);
  const transferReceipt=await reclaimMappingReceipt(database,fixture,candidate.label);
  let responseLost=false;
  try{
   const committed=await claimMappingWith(candidate,transferReceipt);
   assert.equal(committed.ownsExecution,true);assert.equal(committed.recoveryMode,'execute_provider');
   throw new Error('SYNTHETIC_MAPPING_TRANSFER_CLAIM_RESPONSE_LOST');
  }catch(error){
   assert.match(String(error instanceof Error?error.message:error),/SYNTHETIC_MAPPING_TRANSFER_CLAIM_RESPONSE_LOST/u);responseLost=true;
  }
  assert.equal(responseLost,true);
  const pending=await one(database,`SELECT state,execution_token,execution_fence,assess_mapping_transfer_count,
   assess_mapping_transfer_pending,assess_mapping_last_transfer_at FROM public.enterprise_ai_budget_reservations WHERE id=$1`,[reservation.reservationId]);
  assert.deepEqual({state:pending.state,token:pending.execution_token,fence:Number(pending.execution_fence),count:Number(pending.assess_mapping_transfer_count),pending:pending.assess_mapping_transfer_pending},
   {state:'reserved',token:transferReceipt.execution_token,fence:Number(transferReceipt.execution_fence),count:1,pending:true});
  assert.ok(pending.assess_mapping_last_transfer_at);
  return {candidate,originalBudget,reservation,transferReceipt,lastTransferAt:new Date(pending.assess_mapping_last_transfer_at).toISOString()};
 };
 const assertPendingClaimNegatives=async(candidate,receipt,reservationId)=>{
  const unchanged=async()=>one(database,`SELECT execution_token,execution_fence,assess_mapping_transfer_count,assess_mapping_transfer_pending,
   assess_mapping_last_transfer_at FROM public.enterprise_ai_budget_reservations WHERE id=$1`,[reservationId]);
  const before=await unchanged();
  await expectedFailure(()=>claimMappingWith(candidate,receipt,args=>{args[19]=Number(args[19])+1}),/AUTHORIZATION_STALE|MAPPING_AUTHORIZATION_STALE|PR1B_AUTHORIZATION_STALE/u);
  const ignoredHashHint=await claimMappingWith(candidate,receipt,args=>{args[5]=sha('non-authoritative-catalog-hint')});
  assert.equal(ignoredHashHint.catalogHash,candidate.claim.catalogHash);assert.equal(ignoredHashHint.ownsExecution,true);assert.equal(ignoredHashHint.recoveryMode,'execute_provider');
  const afterHint=await unchanged();
  assert.deepEqual({count:afterHint.assess_mapping_transfer_count,pending:afterHint.assess_mapping_transfer_pending,last:afterHint.assess_mapping_last_transfer_at},
   {count:before.assess_mapping_transfer_count,pending:before.assess_mapping_transfer_pending,last:before.assess_mapping_last_transfer_at});
  assert.equal(afterHint.execution_token,receipt.execution_token);assert.equal(Number(afterHint.execution_fence),Number(receipt.execution_fence));
  await expectedFailure(()=>claimMappingWith(candidate,receipt,args=>{args[1]=uuid()}),/TARGET_INVALID|IDEMPOTENCY_CONFLICT|SOURCE_STALE|VERSION_CONFLICT/u);
  await expectedFailure(()=>claimMappingWith(candidate,receipt,args=>{const targets=JSON.parse(args[6]);targets[0]={...targets[0],label:`${targets[0].label} substituted`};args[6]=json(targets)}),/IDEMPOTENCY_CONFLICT|TARGET_INVALID|SOURCE_STALE|VERSION_CONFLICT/u);
  await database.query('BEGIN');
  try{
   await database.query('UPDATE public.assess_v2_cases SET version=version+1 WHERE id=$1',[candidate.caseId]);
   await expectedFailure(()=>claimMappingWith(candidate,receipt),/MAPPING_STALE|SOURCE_STALE|VERSION_CONFLICT/u);
  }finally{await database.query('ROLLBACK')}
  assert.deepEqual(await unchanged(),afterHint);
 };
 const consumePendingGrantConcurrently=async(candidate,receipt)=>{
  const clients=await Promise.all([0,1].map(async()=>{const client=new Client({connectionString:urlFor(databaseName)});await client.connect();auxiliaryClients.push(client);return client}));
  let open;const gate=new Promise(resolve=>{open=resolve});const input=budgetInputFor(candidate,receipt);
  const attempts=clients.map(client=>(async()=>{await gate;return providerBudget.reserveProviderBudget(input,(name,args)=>mappingBudgetModule.assessMappingBudgetRpc(name,args,createSqlRpc(client)))})());
  open();const results=await Promise.all(attempts);
  assert.equal(results.filter(result=>result.ownsProviderEffect).length,1);
  assert.equal(results.filter(result=>!result.ownsProviderEffect&&result.replayed).length,1);
  return input;
 };

 const mappingRecoveryBefore=gateway.counts();
 const sameFence=await prepareLostMappingTransfer('lost-transfer-same-fence');
 await assertPendingClaimNegatives(sameFence.candidate,sameFence.transferReceipt,sameFence.reservation.reservationId);
 const sameFenceRecovered=await claimMappingWith(sameFence.candidate,sameFence.transferReceipt);
 assert.equal(sameFenceRecovered.ownsExecution,true);assert.equal(sameFenceRecovered.recoveryMode,'execute_provider');
 const sameFenceBudget=await consumePendingGrantConcurrently(sameFence.candidate,sameFence.transferReceipt);
 await expectedFailure(()=>providerBudget.reserveProviderBudget(sameFence.originalBudget,mappingInvoke),/PROVIDER_ROUTE_STALE|BUDGET_PERSISTENCE_UNAVAILABLE/u);
 const sameFenceReplay=await providerBudget.reserveProviderBudget(sameFenceBudget,mappingInvoke);assert.equal(sameFenceReplay.ownsProviderEffect,false);assert.equal(sameFenceReplay.replayed,true);
 await database.query("UPDATE public.enterprise_ai_command_receipts SET lease_expires_at=statement_timestamp()-interval '1 second' WHERE id=$1",[sameFence.transferReceipt.id]);
 const sameFenceLaterReceipt=await reclaimMappingReceipt(database,fixture,sameFence.candidate.label);
 const sameFenceLaterClaim=await claimMappingWith(sameFence.candidate,sameFenceLaterReceipt);assert.equal(sameFenceLaterClaim.ownsExecution,false);assert.equal(sameFenceLaterClaim.recoveryMode,'none');
 assert.equal(await count(database,'public.synthetic_ai_campaign_effect_debits','assess_mapping_run_id=$1',[sameFence.candidate.runId]),0);

 const higherFence=await prepareLostMappingTransfer('lost-transfer-higher-fence');
 await database.query("UPDATE public.enterprise_ai_command_receipts SET lease_expires_at=statement_timestamp()-interval '1 second' WHERE id=$1",[higherFence.transferReceipt.id]);
 const higherReceipt=await reclaimMappingReceipt(database,fixture,higherFence.candidate.label);
 await assertPendingClaimNegatives(higherFence.candidate,higherReceipt,higherFence.reservation.reservationId);
 const higherRecovered=await claimMappingWith(higherFence.candidate,higherReceipt);
 assert.equal(higherRecovered.ownsExecution,true);assert.equal(higherRecovered.recoveryMode,'execute_provider');
 const higherPending=await one(database,`SELECT execution_token,execution_fence,assess_mapping_transfer_count,assess_mapping_transfer_pending,
  assess_mapping_last_transfer_at FROM public.enterprise_ai_budget_reservations WHERE id=$1`,[higherFence.reservation.reservationId]);
 assert.deepEqual({token:higherPending.execution_token,fence:Number(higherPending.execution_fence),count:Number(higherPending.assess_mapping_transfer_count),pending:higherPending.assess_mapping_transfer_pending,last:new Date(higherPending.assess_mapping_last_transfer_at).toISOString()},
  {token:higherReceipt.execution_token,fence:Number(higherReceipt.execution_fence),count:1,pending:true,last:higherFence.lastTransferAt});
 const higherBudget=await consumePendingGrantConcurrently(higherFence.candidate,higherReceipt);
 await expectedFailure(()=>providerBudget.reserveProviderBudget(budgetInputFor(higherFence.candidate,higherFence.transferReceipt),mappingInvoke),/PROVIDER_ROUTE_STALE|BUDGET_PERSISTENCE_UNAVAILABLE/u);
 const higherReplay=await providerBudget.reserveProviderBudget(higherBudget,mappingInvoke);assert.equal(higherReplay.ownsProviderEffect,false);assert.equal(higherReplay.replayed,true);
 await database.query("UPDATE public.enterprise_ai_command_receipts SET lease_expires_at=statement_timestamp()-interval '1 second' WHERE id=$1",[higherReceipt.id]);
 const higherLaterReceipt=await reclaimMappingReceipt(database,fixture,higherFence.candidate.label);
 const higherLaterClaim=await claimMappingWith(higherFence.candidate,higherLaterReceipt);assert.equal(higherLaterClaim.ownsExecution,false);assert.equal(higherLaterClaim.recoveryMode,'none');
 assert.equal(await count(database,'public.synthetic_ai_campaign_effect_debits','assess_mapping_run_id=$1',[higherFence.candidate.runId]),0);
 assert.deepEqual(gateway.counts(),mappingRecoveryBefore);
 pass('MAP-PG-BUDGET-013-mapping-transfer-claim-response-loss','lost committed mapping transfer claims recover on the same or one higher valid fence after full negative checks; concurrent reserve grants exactly one owner, and cleared/old fences never grant, transfer, debit, resolve a secret or call a provider');

 const decodedSource={sourceId:mapping.sourceId,sourceVersionId:mapping.sourceVersionId,extractionBindingId:mapping.claim.sourceBindings[0].extractionBindingId,extractionJobId:mapping.claim.sourceBindings[0].extractionJobId,parserVersion:mapping.sourceBindings[0].parserVersion,normalizedHash:mapping.textHash,extractedByteCount:new TextEncoder().encode(mapping.text).byteLength,sheetCount:0,cellCount:0,warnings:[],text:mapping.text};
 const framed=mappingModule.frameAssessMappingSources([decodedSource],mapping.claim.targets);const instruction=mappingModule.buildAssessDocumentMappingTaskInstruction(mapping.claim.targets);
 const mappingOutput={proposals:[{targetSelectorId:mapping.target.selectorId,sourceVersionId:mapping.sourceVersionId,proposedValue:'Review invoice exceptions against purchase orders.',confidence:0.95,rationale:'The process description is explicitly stated.',safeExcerpt:'Review invoice exceptions against purchase orders.',locator:'text',relationship:'supporting'}]};
 const resolverDecision={status:'allowed',provider:'openai',routeId:assessRoute,providerConfigId:fixture.provider,keyRefId:fixture.keyRef,keyRefResolverType:'server_reference',operation:'assess.evidence.extract',capability:'assess.evidence.extract',mode:'pilot',orgId:fixture.org,workspaceId:fixture.workspace,actorId:fixture.requester,correlationId:'budget-pipeline-assess',evidenceRef:'',policyResult:'allowed',model:'gpt-4.1-mini-2025-04-14',futureSecretLookupEligible:true,auditEvent:{}};
 let stagedSafe=null,lastMappingStageDiagnostic='NONE';
 const mappingEffect=()=>enterpriseAi.runGovernedProviderRequest({provider:'openai',endpoint:'https://api.openai.com',model:'gpt-4.1-mini-2025-04-14',capability:'assess.evidence.extract',untrustedSource:framed,taskInstruction:instruction,maxOutputTokens:4096,providerEffect:{authorizationVersion,receiptId:mapping.receipt.id,effectId:mapping.runId,executionToken:mapping.receipt.execution_token,executionFence:Number(mapping.receipt.execution_fence)},authorization:{organizationId:fixture.org,workspaceId:fixture.workspace,actorId:fixture.requester,providerConfigId:fixture.provider,capability:'assess.evidence.extract',routeEnabled:true,resolverDecision}},{...gateway.gatewayDeps,fetchImpl:gateway.fakeFetch(mappingOutput)});
 const beforeSettle=async result=>{try{const decoded=enterpriseAi.parseJsonObjectResponse(result.output);const proposalResult=await mappingModule.decodeGroundedAssessMappingProposalResult({value:decoded,targets:mapping.claim.targets,sources:[decodedSource],createProposalId:uuid});const analyzedSources=[{sourceId:mapping.sourceId,sourceVersionId:mapping.sourceVersionId,parserVersion:decodedSource.parserVersion,extractedByteCount:decodedSource.extractedByteCount,sheetCount:0,cellCount:0,warnings:[]}];stagedSafe={resourceId:mapping.runId,runId:mapping.runId,catalogId:mapping.catalogId,catalogHash:mapping.claim.catalogHash,proposalCount:proposalResult.proposals.length,targetCount:mapping.claim.targets.length,sourceCount:1,sourceBindings:mapping.claim.sourceBindings,analyzedSources,warnings:[...mapping.catalog.warnings,...proposalResult.warnings]};const outputHash=sha(result.output);const stagedPayloadHash=sha(json({runId:mapping.runId,catalogId:mapping.catalogId,outputHash,proposals:proposalResult.proposals,safeResult:stagedSafe,executionFence:Number(mapping.receipt.execution_fence)}));await database.query(`SELECT public.enterprise_stage_assess_document_mapping_result_v1($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,1,$8,$9,$10,$11)`,[mapping.runId,mapping.catalogId,json(proposalResult.proposals),json(stagedSafe),outputHash,result.usage.inputTokens,result.usage.outputTokens,stagedPayloadHash,mapping.receipt.id,mapping.receipt.execution_token,mapping.receipt.execution_fence])}catch(error){lastMappingStageDiagnostic=`${error instanceof Error&&'code'in error?error.code:'CODE'}_${error instanceof Error?error.message:'UNKNOWN'}`.replace(/[^A-Z0-9_]/giu,'_').slice(0,160);throw error}};
 const contendersClients=await Promise.all([0,1].map(async()=>{const client=new Client({connectionString:urlFor(databaseName)});await client.connect();await client.query("SELECT set_config('request.headers',$1,false)",[json({host:`${projectRef}.supabase.co`})]);auxiliaryClients.push(client);return client}));
 const mappingOptions=client=>({invoke:(name,args)=>mappingBudgetModule.assessMappingBudgetRpc(name,args,createSqlRpc(client)),beforeSettle,classifyFailure:enterpriseAi.classifyEnterpriseProviderFailureForBudget});
 let openStart;const startGate=new Promise(resolve=>{openStart=resolve});
 const pendingContenders=contendersClients.map(async client=>{await startGate;return providerBudget.runBudgetedProviderEffect(budgetInput,mappingEffect,mappingOptions(client))});openStart();
 let contenders;try{contenders=await Promise.all(pendingContenders)}catch(error){const diagnostic=await one(database,`SELECT run.status,(SELECT count(*)::int FROM public.enterprise_assess_document_mapping_proposals WHERE run_id=run.id) proposals,(SELECT state FROM public.enterprise_ai_budget_reservations WHERE assess_mapping_run_id=run.id) reservation_state,(SELECT count(*)::int FROM public.synthetic_ai_campaign_effect_debits WHERE assess_mapping_run_id=run.id) debits,(SELECT count(*)::int FROM public.synthetic_ai_campaign_effect_debits WHERE assess_mapping_run_id=run.id AND consumed_at IS NOT NULL) consumed FROM public.enterprise_assess_document_mapping_runs run WHERE run.id=$1`,[mapping.runId]);throw new Error(`ASSESS_PIPELINE_DIAGNOSTIC_${diagnostic.status}_${diagnostic.proposals}_${diagnostic.reservation_state}_${diagnostic.debits}_${diagnostic.consumed}_${lastMappingStageDiagnostic}_${error instanceof Error&&'code'in error?error.code:'UNKNOWN'}`)}
 assert.equal(contenders.filter(item=>item.kind==='executed').length,1);assert.equal(contenders.filter(item=>item.kind==='replay').length,1);
 assert.ok(stagedSafe);const mappingCommit=(await database.query('SELECT public.enterprise_commit_assess_document_mapping_result_v1($1,$2,$3,$4) result',[mapping.runId,mapping.receipt.id,mapping.receipt.execution_token,mapping.receipt.execution_fence])).rows[0].result;
 assert.equal(mappingCommit.proposalCount,1);assert.deepEqual(gateway.counts(),{secretReads:1,fetches:1});
 assert.equal(await count(database,'public.enterprise_ai_job_ledger','id=$1',[mapping.runId]),0);assert.equal(await count(database,'public.enterprise_ai_budget_reservations','assess_mapping_run_id=$1',[mapping.runId]),1);assert.equal(await count(database,'public.enterprise_assess_document_mapping_proposals','run_id=$1',[mapping.runId]),1);assert.equal(await count(database,'public.synthetic_ai_campaign_effect_debits','assess_mapping_run_id=$1 AND consumed_at IS NOT NULL',[mapping.runId]),1);
 const replayClaim=(await database.query(`SELECT public.enterprise_claim_assess_document_mapping_run_v1(${mapping.mappingClaimArgs.map((_,index)=>`$${index+1}`).join(',')}) result`,mapping.mappingClaimArgs)).rows[0].result;assert.equal(replayClaim.state,'committed');assert.deepEqual(replayClaim.safeResult,mappingCommit);assert.deepEqual(gateway.counts(),{secretReads:1,fetches:1});
 pass('MAP-PG-BUDGET-006-assess-full-chain','actual TXT, request binding, SQL claim, production decoder, mapping budget adapter, shared campaign currency, production gateway, proposal stage and commit execute once across two contenders with zero legacy job');

 const preAdversarial={...gateway.counts(),reservations:await count(database,'public.enterprise_ai_budget_reservations'),debits:await count(database,'public.synthetic_ai_campaign_effect_debits')};
 const adversarial=await buildMappingFixture(database,fixture,modules,assessRoute,authorizationVersion,'adversarial-live');
 const adversarialBudget=budgetInputFor(adversarial);const adversarialReservation=await providerBudget.reserveProviderBudget(adversarialBudget,mappingInvoke);
 assert.equal(adversarialReservation.ownsProviderEffect,true);assert.equal(adversarialReservation.replayed,false);
 const adversarialTokenReplayBefore=await providerBudget.reserveProviderBudget(adversarialBudget,mappingInvoke);assert.equal(adversarialTokenReplayBefore.ownsProviderEffect,false);assert.equal(adversarialTokenReplayBefore.replayed,true);
 for(const [label,mutation] of [
  ['workspace',input=>({...input,authority:{...input.authority,workspaceId:uuid()}})],
  ['fence',input=>({...input,execution:{...input.execution,executionFence:input.execution.executionFence+1}})],
  ['route',input=>({...input,execution:{...input.execution,routeId:uuid()}})],
  ['model',input=>({...input,execution:{...input.execution,model:'substituted-model'}})],
  ['estimated-input',input=>({...input,estimatedInputTokens:401})],
  ['maximum-output',input=>({...input,maximumOutputTokens:4095})],
 ]){
  let rejected=false;try{await providerBudget.reserveProviderBudget(mutation(adversarialBudget),mappingInvoke)}catch(error){assert.match(String(error instanceof Error?error.message:error),/PROVIDER_ROUTE_STALE|AUTHORIZATION_STALE|PERMISSION_DENIED|BUDGET_PERSISTENCE_UNAVAILABLE/u);rejected=true}
  assert.equal(rejected,true,`ADVERSARIAL_MUTATION_ACCEPTED_${label}`);
 }
 const adversarialStored=await one(database,'SELECT estimated_input_tokens,maximum_output_tokens FROM public.enterprise_ai_budget_reservations WHERE assess_mapping_run_id=$1',[adversarial.runId]);
 assert.deepEqual({estimated:Number(adversarialStored.estimated_input_tokens),maximum:Number(adversarialStored.maximum_output_tokens)},{estimated:adversarialBudget.estimatedInputTokens,maximum:adversarialBudget.maximumOutputTokens});
 assert.equal(await count(database,'public.enterprise_ai_budget_reservations','assess_mapping_run_id=$1',[adversarial.runId]),1);
 const adversarialTokenReplayAfter=await providerBudget.reserveProviderBudget(adversarialBudget,mappingInvoke);assert.equal(adversarialTokenReplayAfter.ownsProviderEffect,false);assert.equal(adversarialTokenReplayAfter.replayed,true);
 const adversarialEffect={...directEffect,receiptId:adversarial.receipt.id,effectId:adversarial.runId,executionToken:adversarial.receipt.execution_token,
  executionFence:Number(adversarial.receipt.execution_fence),requestHash:sha('adversarial-live-effect')};
 const adversarialPermit=await modules.reserveSyntheticAiProviderEffect(adversarialEffect,{invoke:gateway.invoke,...campaignRuntime});assert.equal(adversarialPermit.ownsProviderEffect,true);assert.equal(adversarialPermit.replayed,false);
 const adversarialPermitReplayBefore=await modules.reserveSyntheticAiProviderEffect(adversarialEffect,{invoke:gateway.invoke,...campaignRuntime});assert.equal(adversarialPermitReplayBefore.ownsProviderEffect,false);assert.equal(adversarialPermitReplayBefore.replayed,true);
 await expectedFailure(()=>modules.reserveSyntheticAiProviderEffect({...adversarialEffect,maximumOutputTokens:4095},{invoke:gateway.invoke,...campaignRuntime}),/AUTHORITY_UNAVAILABLE/u);
 await expectedFailure(()=>enterpriseAi.runGovernedProviderRequest({provider:'openai',endpoint:'https://api.openai.com',model:'gpt-4.1-mini-2025-04-14',capability:'assess.evidence.extract',untrustedSource:framed,taskInstruction:instruction,maxOutputTokens:4096,providerEffect:{authorizationVersion,receiptId:adversarial.receipt.id,effectId:adversarial.runId,executionToken:adversarial.receipt.execution_token,executionFence:Number(adversarial.receipt.execution_fence)},authorization:{organizationId:fixture.org,workspaceId:uuid(),actorId:fixture.requester,providerConfigId:fixture.provider,capability:'assess.evidence.extract',routeEnabled:true,resolverDecision}},{...gateway.gatewayDeps,fetchImpl:gateway.fakeFetch(mappingOutput)}),/CAPABILITY_UNAVAILABLE/u);
 const adversarialPermitReplayAfter=await modules.reserveSyntheticAiProviderEffect(adversarialEffect,{invoke:gateway.invoke,...campaignRuntime});assert.equal(adversarialPermitReplayAfter.ownsProviderEffect,false);assert.equal(adversarialPermitReplayAfter.replayed,true);
 assert.deepEqual({...gateway.counts(),reservations:await count(database,'public.enterprise_ai_budget_reservations'),debits:await count(database,'public.synthetic_ai_campaign_effect_debits')},{...preAdversarial,reservations:preAdversarial.reservations+1,debits:preAdversarial.debits+1});
 pass('MAP-PG-BUDGET-007-adversarial-identities','an otherwise-valid live mapping token and currency authority replay before and after wrong workspace, fence, route, model, estimated-input, max-output and resolver scope substitutions reject with no secret read or provider fetch');

 // Studio uses its own receipt/attempt authority for both token and currency ledgers.
 const templateAuthorizationVersions={};
 for(const actor of [fixture.requester,fixture.reviewer,fixture.approver])templateAuthorizationVersions[actor]=Number((await one(database,'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',[fixture.org,actor])).version);
 let templateCommandOrdinal=0;
 const tenantTemplateCommand=async(commandType,actor,templateId,expectedVersion,payload,label)=>{
  const command={actorId:actor,organizationId:fixture.org,workspaceId:fixture.workspace,requestId:uuid(),authorizationVersion:templateAuthorizationVersions[actor],expectedVersion,idempotencyKey:`budget-pipeline-template-${label}-${templateCommandOrdinal++}`,commandType,templateId,payload};
  return (await database.query('SELECT public.studio_tenant_template_command($1::jsonb) result',[json(command)])).rows[0].result;
 };
 const createApprovedTenantTemplate=async(label,artifactClass='brd')=>{
  const templateId=uuid();const payload={name:`Budget pipeline ${label}`,description:'Canonical terminal-recovery template',artifactClass,sectionDefinitions:[{id:'summary',title:'Summary',required:true,fieldKind:'narrative'}],fieldSchema:{title:{type:'string'},sections:{type:'array'}},rendererCompatibilityVersion:'studio-json-projection-1',contentSchemaVersion:'studio-artifact-2'};
  const created=await tenantTemplateCommand('studio.template.create',fixture.requester,templateId,0,payload,`${label}-create`);
  await tenantTemplateCommand('studio.template.review.submit',fixture.requester,templateId,1,{templateId,templateVersionId:created.templateVersionId},`${label}-submit`);
  await tenantTemplateCommand('studio.template.review.resolve',fixture.reviewer,templateId,1,{templateId,templateVersionId:created.templateVersionId,outcome:'approve',rationale:'Independent terminal-recovery review',conditions:[]},`${label}-review`);
  const approved=await tenantTemplateCommand('studio.template.approval.resolve',fixture.approver,templateId,1,{templateId,templateVersionId:created.templateVersionId,outcome:'approve',rationale:'Independent terminal-recovery approval',conditions:[]},`${label}-approve`);
  const stored=await one(database,'SELECT id,template_id,version,template_hash,status FROM public.studio_tenant_template_versions WHERE id=$1',[approved.templateVersionId]);assert.equal(stored.status,'approved');return stored;
 };
 const originalTemplate=await createApprovedTenantTemplate('original');
 const replacementTemplate=await createApprovedTenantTemplate('replacement');
 const replaceTenantTemplate=async(from,to,label)=>{
  const result=await tenantTemplateCommand('studio.template.replace',fixture.approver,from.template_id,Number(from.version),{templateId:from.template_id,templateVersionId:from.id,replacementTemplateId:to.template_id,replacementTemplateVersionId:to.id,rationale:'Canonical terminal-recovery replacement'},label);
  assert.equal(result.status,'replaced');assert.equal((await one(database,'SELECT status FROM public.studio_tenant_template_versions WHERE id=$1',[from.id])).status,'replaced');return result;
 };
 const aggregate=await one(database,'SELECT id,aggregate_version,current_version_id,current_approved_version_id,source_package_id FROM public.studio_artifact_aggregates WHERE id=$1',[fixture.artifactId]);
 const studioRequest={actorId:fixture.requester,organizationId:fixture.org,workspaceId:fixture.workspace,requestId:uuid(),idempotencyKey:`budget-pipeline-studio-${uuid()}`,authorizationVersion,artifactId:aggregate.id,sourcePackageId:aggregate.source_package_id,templateKind:'tenant',templateVersionId:originalTemplate.id,expectedAggregateVersion:Number(aggregate.aggregate_version),expectedCurrentVersionId:aggregate.current_version_id,expectedApprovedVersionId:aggregate.current_approved_version_id};
 const studioRequested=(await database.query('SELECT public.studio_artifact_generation_request_v2($1::jsonb) result',[json(studioRequest)])).rows[0].result;
 const studioPackage=await one(database,'SELECT version FROM public.studio_artifact_source_packages WHERE id=$1',[aggregate.source_package_id]);
 const studioInitial={...studioRequested.generationPlan,actorId:fixture.requester,organizationId:fixture.org,workspaceId:fixture.workspace,authorizationVersion,requestId:studioRequest.requestId,receiptId:studioRequested.receiptId,sourcePackageVersion:Number(studioPackage.version)};
 const studioMaterial=await studioDb.loadStudioGenerationMaterial(studioInitial,createPostgrestRead(database),gateway.invoke);
 const studioClaim=await studioDb.claimStudioGeneration(studioInitial,gateway.invoke,async()=>studioMaterial);assert.equal(studioClaim.providerAllowed,true);
 const contract=modules.normalizeStudioArtifactTemplate(studioClaim.templatePayload);const anchors=studioClaim.sourceAnchors;const selected=studioClaim.selectedSourceVersionIds;
 const anchorCatalog=studioProvider.buildStudioProviderAnchorCatalog(selected,anchors);
 const studioContent={contractVersion:'studio-artifact-2',title:'Synthetic AP business requirements',summary:'Source-backed AP exception requirements.',sections:contract.sections.map((section,index)=>({id:section.id,title:section.title,body:`Distinct source-backed ${section.id} content ${index+1}.`,sourceAnchors:index===0?anchorCatalog.map(anchor=>({anchorRef:anchor.anchorRef})):[],labels:index===0?[]:['template_required']})),coverage:{selectedSourceVersionIds:selected,coveredSourceVersionIds:selected,complete:true}};
 const studioBefore=gateway.counts();const studioRunProvider=input=>studioProvider.callStudioArtifactProvider(input,{runGateway:(request)=>enterpriseAi.runGovernedProviderRequest(request,{...gateway.gatewayDeps,fetchImpl:gateway.fakeFetch(studioContent)})});
 const studioRunBudgeted=(input,effect,options)=>providerBudget.runBudgetedProviderEffect(input,effect,{...options,invoke:(name,args)=>studioGeneration.studioBudgetRpc(name,args,gateway.invoke)});
 let loseFinalizeResponse=true;
 const studioDeps={runProvider:studioRunProvider,runBudgeted:studioRunBudgeted,stage:async input=>{await database.query('SELECT public.studio_artifact_generation_stage_v2($1,$2,$3,$4,$5::jsonb)',[input.attemptId,input.executionToken,input.executionFence,input.providerOperationId??null,json(input.response)])},finalize:async input=>{const result=(await database.query('SELECT public.studio_artifact_generation_finalize_v2($1,$2,$3) result',[input.attemptId,input.executionToken,input.executionFence])).rows[0].result;if(loseFinalizeResponse){loseFinalizeResponse=false;throw new Error('SYNTHETIC_FINALIZE_RESPONSE_LOST')}return result.stale?{state:'stale',resource:result}:{state:'completed',resource:result}},fail:async(attemptId,code)=>{await database.query('SELECT public.studio_artifact_generation_fail_v2($1,$2,$3,$4)',[attemptId,studioClaim.executionToken,studioClaim.executionFence,code])}};
 const studioResult=await studioGeneration.executeClaimedStudioGeneration(studioClaim,studioDeps);
 assert.equal(studioResult.state,'uncertain');assert.deepEqual(gateway.counts(),{secretReads:studioBefore.secretReads+1,fetches:studioBefore.fetches+1});
 const studioPostEffect=await one(database,`SELECT attempt.state,reservation.state reservation_state,
  (SELECT count(*)::int FROM public.studio_generation_staged_responses staged WHERE staged.attempt_id=attempt.id) staged
  FROM public.studio_artifact_generation_attempts attempt LEFT JOIN public.enterprise_ai_budget_reservations reservation
   ON reservation.studio_attempt_id=attempt.id WHERE attempt.id=$1`,[studioRequested.attemptId]);
 if(loseFinalizeResponse)throw new Error(`STUDIO_PIPELINE_DIAGNOSTIC_${studioPostEffect.state}_${studioPostEffect.reservation_state}_${studioPostEffect.staged}_${studioResult.failureCode}`);
 assert.equal(await count(database,'public.enterprise_ai_command_receipts','id=$1',[studioRequested.receiptId]),0);assert.equal(await count(database,'public.enterprise_ai_budget_reservations','studio_attempt_id=$1',[studioRequested.attemptId]),1);assert.equal(await count(database,'public.synthetic_ai_campaign_effect_debits','studio_attempt_id=$1 AND consumed_at IS NOT NULL',[studioRequested.attemptId]),1);
 const completedTerminalSql=`SELECT attempt.state,attempt.execution_token,attempt.execution_fence,version.id version_id,version.artifact_id,
  aggregate.current_version_id,aggregate.aggregate_version,
  (SELECT count(*)::int FROM public.enterprise_ai_budget_reservations reservation WHERE reservation.studio_attempt_id=attempt.id) reservations,
  (SELECT count(*)::int FROM public.synthetic_ai_campaign_effect_debits debit WHERE debit.studio_attempt_id=attempt.id) debits,
  (SELECT count(*)::int FROM public.studio_artifact_versions item WHERE item.generation_attempt_id=attempt.id) versions
  FROM public.studio_artifact_generation_attempts attempt
  JOIN public.studio_artifact_versions version ON version.generation_attempt_id=attempt.id
  JOIN public.studio_artifact_aggregates aggregate ON aggregate.id=attempt.artifact_id WHERE attempt.id=$1`;
 const completedTerminalBefore=await one(database,completedTerminalSql,[studioRequested.attemptId]);assert.equal(completedTerminalBefore.state,'completed');assert.equal(completedTerminalBefore.current_version_id,completedTerminalBefore.version_id);
 const beforeStudioRecovery=gateway.counts();let completedMaterialReads=0;
 await replaceTenantTemplate(originalTemplate,replacementTemplate,'original-replace');
 await database.query("UPDATE public.ai_provider_configs SET status='disabled' WHERE id=$1",[fixture.provider]);
 await database.query('UPDATE public.studio_artifact_runtime_control SET read_only=true WHERE singleton');
 let recoveredStudio;
 try{
  const studioReplayClaim=await studioDb.claimStudioGeneration(studioInitial,gateway.invoke,async()=>{completedMaterialReads+=1;throw new Error('TERMINAL_MATERIAL_LOAD_FORBIDDEN')});
  assert.equal(studioReplayClaim.claimKind,'terminal');assert.equal(studioReplayClaim.terminalState,'completed');assert.equal(studioReplayClaim.providerAllowed,false);assert.equal(studioReplayClaim.reconcileOnly,false);assert.equal(studioReplayClaim.leaseExpiresAt,null);
  recoveredStudio=await studioGeneration.executeClaimedStudioGeneration(studioReplayClaim,{runProvider:async()=>{throw new Error('TERMINAL_PROVIDER_FORBIDDEN')},runBudgeted:async()=>{throw new Error('TERMINAL_BUDGET_FORBIDDEN')},stage:async()=>{throw new Error('TERMINAL_STAGE_FORBIDDEN')},finalize:input=>studioDb.finalizeStudioGeneration(input,gateway.invoke),fail:async()=>{throw new Error('FAILURE_WRITE_FORBIDDEN')}});
 }finally{
  await database.query("UPDATE public.ai_provider_configs SET status='active' WHERE id=$1",[fixture.provider]);
  await database.query('UPDATE public.studio_artifact_runtime_control SET read_only=false WHERE singleton');
 }
 assert.equal(completedMaterialReads,0);assert.equal(recoveredStudio.state,'completed');assert.equal(recoveredStudio.resource.artifactId,completedTerminalBefore.artifact_id);assert.equal(recoveredStudio.resource.versionId,completedTerminalBefore.version_id);
 assert.deepEqual(await one(database,completedTerminalSql,[studioRequested.attemptId]),completedTerminalBefore);assert.deepEqual(gateway.counts(),beforeStudioRecovery);
 pass('MAP-PG-BUDGET-008-studio-full-chain','actual Studio request/claim, Studio token budget, shared campaign currency, production gateway and structured stage/finalize use Studio authority with no fabricated enterprise receipt');
 pass('MAP-PG-BUDGET-009-studio-finalize-response-loss','a lost finalizer response recovers from the committed Studio attempt through production orchestration with zero additional secret read, fetch, token reservation or currency debit');

 const latestAggregate=await one(database,'SELECT id,aggregate_version,current_version_id,current_approved_version_id,source_package_id FROM public.studio_artifact_aggregates WHERE id=$1',[fixture.artifactId]);
 const failedRequest={...studioRequest,requestId:uuid(),idempotencyKey:`budget-pipeline-studio-stage-failure-${uuid()}`,templateVersionId:replacementTemplate.id,expectedAggregateVersion:Number(latestAggregate.aggregate_version),expectedCurrentVersionId:latestAggregate.current_version_id,expectedApprovedVersionId:latestAggregate.current_approved_version_id};
 const failedRequested=(await database.query('SELECT public.studio_artifact_generation_request_v2($1::jsonb) result',[json(failedRequest)])).rows[0].result;
 const failedInitial={...failedRequested.generationPlan,actorId:fixture.requester,organizationId:fixture.org,workspaceId:fixture.workspace,authorizationVersion,requestId:failedRequest.requestId,receiptId:failedRequested.receiptId,sourcePackageVersion:Number(studioPackage.version)};
 const failedMaterial=await studioDb.loadStudioGenerationMaterial(failedInitial,createPostgrestRead(database),gateway.invoke);
 const failedClaim=await studioDb.claimStudioGeneration(failedInitial,gateway.invoke,async()=>failedMaterial);assert.equal(failedClaim.providerAllowed,true);
 const beforeStageFailure=gateway.counts();const stageFailureDeps={runProvider:studioRunProvider,runBudgeted:studioRunBudgeted,stage:async()=>{throw new Error('SYNTHETIC_STAGE_PERSISTENCE_FAILED')},finalize:async()=>{throw new Error('FINALIZE_WITHOUT_STAGE_FORBIDDEN')},fail:async()=>{throw new Error('TERMINAL_FAILURE_AFTER_EFFECT_FORBIDDEN')}};
 const stageFailure=await studioGeneration.executeClaimedStudioGeneration(failedClaim,stageFailureDeps);assert.equal(stageFailure.state,'uncertain');assert.deepEqual(gateway.counts(),{secretReads:beforeStageFailure.secretReads+1,fetches:beforeStageFailure.fetches+1});
 assert.equal((await one(database,'SELECT state FROM public.enterprise_ai_budget_reservations WHERE studio_attempt_id=$1',[failedRequested.attemptId])).state,'uncertain');assert.equal(await count(database,'public.synthetic_ai_campaign_effect_debits','studio_attempt_id=$1 AND consumed_at IS NOT NULL',[failedRequested.attemptId]),1);assert.equal(await count(database,'public.studio_generation_staged_responses','attempt_id=$1',[failedRequested.attemptId]),0);
 const beforeUncertainReplay=gateway.counts();const uncertainReplay=await studioGeneration.executeClaimedStudioGeneration(failedClaim,stageFailureDeps);assert.equal(uncertainReplay.state,'uncertain');assert.deepEqual(gateway.counts(),beforeUncertainReplay);assert.equal(await count(database,'public.enterprise_ai_budget_reservations','studio_attempt_id=$1',[failedRequested.attemptId]),1);assert.equal(await count(database,'public.synthetic_ai_campaign_effect_debits','studio_attempt_id=$1',[failedRequested.attemptId]),1);
 pass('MAP-PG-BUDGET-010-studio-stage-failure-no-paid-retry','a post-provider Studio stage failure retains the consumed currency debit and uncertain token reservation; production replay performs no second secret read or provider fetch');

 // Produce an actual stale_completed terminal outcome: the provider response is
 // staged and its budget settled, then the exact template is superseded before
 // finalization. Lose that committed finalizer response and recover only through
 // the production terminal claim decoder/finalizer after mutable controls close.
 const staleTemplate=await createApprovedTenantTemplate('stale-original','pdd');
 const staleReplacementTemplate=await createApprovedTenantTemplate('stale-replacement','pdd');
 const staleArtifactId=uuid(),stalePackageId=uuid();
 await database.query('BEGIN');
 try{
  await database.query('SET CONSTRAINTS ALL DEFERRED');
  await database.query(`INSERT INTO public.studio_artifact_aggregates(
   id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,
   review_resolution_id,govern_resolution_id,handoff_id,source_package_hash,source_schema_version,rule_set_version,
   review_schema_version,review_sequence,artifact_type,aggregate_version,current_version_id,current_approved_version_id,
   lifecycle,created_by,source_package_id,source_mode,lineage_classification,planning_only)
   SELECT $1,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,
   review_resolution_id,govern_resolution_id,handoff_id,source_package_hash,source_schema_version,rule_set_version,
   review_schema_version,review_sequence,'pdd',0,NULL,NULL,'draft',created_by,$2,source_mode,lineage_classification,planning_only
   FROM public.studio_artifact_aggregates WHERE id=$3`,[staleArtifactId,stalePackageId,fixture.artifactId]);
  await database.query(`INSERT INTO public.studio_artifact_source_packages(
   id,artifact_id,org_id,workspace_id,version,replaces_source_package_id,source_mode,assess_handoff_id,assess_package_hash,
   studio_input_bundle_id,studio_input_bundle_version_id,studio_input_bundle_version,studio_bundle_hash,manual_brief_hash,
   lineage_classification,planning_only,route_policy_version,route_policy_snapshot,route_policy_hash,package_hash,created_by,
   created_at,candidate_manifest,candidate_manifest_hash,candidate_count,anchor_manifest,anchor_manifest_hash,anchor_count)
   SELECT $1,$2,org_id,workspace_id,1,NULL,source_mode,assess_handoff_id,assess_package_hash,
   studio_input_bundle_id,studio_input_bundle_version_id,studio_input_bundle_version,studio_bundle_hash,manual_brief_hash,
   lineage_classification,planning_only,route_policy_version,route_policy_snapshot,route_policy_hash,package_hash,created_by,
   created_at,candidate_manifest,candidate_manifest_hash,candidate_count,anchor_manifest,anchor_manifest_hash,anchor_count
   FROM public.studio_artifact_source_packages WHERE id=$3`,[stalePackageId,staleArtifactId,aggregate.source_package_id]);
  await database.query('COMMIT');
 }catch(error){await database.query('ROLLBACK');throw error}
 const staleAggregate=await one(database,'SELECT id,aggregate_version,current_version_id,current_approved_version_id,source_package_id FROM public.studio_artifact_aggregates WHERE id=$1',[staleArtifactId]);
 const staleRequest={...studioRequest,requestId:uuid(),idempotencyKey:`budget-pipeline-studio-stale-terminal-${uuid()}`,artifactId:staleArtifactId,sourcePackageId:stalePackageId,templateVersionId:staleTemplate.id,expectedAggregateVersion:Number(staleAggregate.aggregate_version),expectedCurrentVersionId:staleAggregate.current_version_id,expectedApprovedVersionId:staleAggregate.current_approved_version_id};
 const staleRequested=(await database.query('SELECT public.studio_artifact_generation_request_v2($1::jsonb) result',[json(staleRequest)])).rows[0].result;
 const staleAggregateAfterRequest=await one(database,'SELECT aggregate_version,current_version_id,current_approved_version_id FROM public.studio_artifact_aggregates WHERE id=$1',[staleArtifactId]);
 assert.equal(Number(staleAggregateAfterRequest.aggregate_version),Number(staleAggregate.aggregate_version)+1);assert.equal(staleAggregateAfterRequest.current_version_id,staleAggregate.current_version_id);assert.equal(staleAggregateAfterRequest.current_approved_version_id,staleAggregate.current_approved_version_id);
 const staleInitial={...staleRequested.generationPlan,actorId:fixture.requester,organizationId:fixture.org,workspaceId:fixture.workspace,authorizationVersion,requestId:staleRequest.requestId,receiptId:staleRequested.receiptId,sourcePackageVersion:1};
 const staleMaterial=await studioDb.loadStudioGenerationMaterial(staleInitial,createPostgrestRead(database),gateway.invoke);
 const staleClaim=await studioDb.claimStudioGeneration(staleInitial,gateway.invoke,async()=>staleMaterial);assert.equal(staleClaim.claimKind,'active');assert.equal(staleClaim.providerAllowed,true);
 let loseStaleFinalizeResponse=true;
 const staleDeps={runProvider:studioRunProvider,runBudgeted:studioRunBudgeted,stage:async input=>{await database.query('SELECT public.studio_artifact_generation_stage_v2($1,$2,$3,$4,$5::jsonb)',[input.attemptId,input.executionToken,input.executionFence,input.providerOperationId??null,json(input.response)])},finalize:async input=>{
  if(loseStaleFinalizeResponse){
   await replaceTenantTemplate(staleTemplate,staleReplacementTemplate,'stale-replace');
  }
  const result=await studioDb.finalizeStudioGeneration(input,gateway.invoke);
  if(loseStaleFinalizeResponse){loseStaleFinalizeResponse=false;throw new Error('SYNTHETIC_STALE_FINALIZE_RESPONSE_LOST')}
  return result;
 },fail:async()=>{throw new Error('STALE_TERMINAL_FAILURE_WRITE_FORBIDDEN')}};
 const beforeStaleEffect=gateway.counts();const staleLost=await studioGeneration.executeClaimedStudioGeneration(staleClaim,staleDeps);
 assert.equal(staleLost.state,'uncertain');assert.equal(loseStaleFinalizeResponse,false);assert.deepEqual(gateway.counts(),{secretReads:beforeStaleEffect.secretReads+1,fetches:beforeStaleEffect.fetches+1});
 const staleTerminalSql=`SELECT attempt.state,attempt.execution_token,attempt.execution_fence,version.id version_id,version.artifact_id,
  aggregate.current_version_id,aggregate.aggregate_version,version.is_stale_completion,
  (SELECT count(*)::int FROM public.enterprise_ai_budget_reservations reservation WHERE reservation.studio_attempt_id=attempt.id) reservations,
  (SELECT count(*)::int FROM public.synthetic_ai_campaign_effect_debits debit WHERE debit.studio_attempt_id=attempt.id) debits,
  (SELECT count(*)::int FROM public.studio_artifact_versions item WHERE item.generation_attempt_id=attempt.id) versions
  FROM public.studio_artifact_generation_attempts attempt
  JOIN public.studio_artifact_versions version ON version.generation_attempt_id=attempt.id
  JOIN public.studio_artifact_aggregates aggregate ON aggregate.id=attempt.artifact_id WHERE attempt.id=$1`;
 const staleTerminalBefore=await one(database,staleTerminalSql,[staleRequested.attemptId]);
 assert.equal(staleTerminalBefore.state,'stale_completed');assert.equal(staleTerminalBefore.is_stale_completion,true);assert.equal(staleTerminalBefore.current_version_id,staleAggregateAfterRequest.current_version_id);assert.equal(Number(staleTerminalBefore.aggregate_version),Number(staleAggregateAfterRequest.aggregate_version));
 await database.query("UPDATE public.ai_provider_configs SET status='disabled' WHERE id=$1",[fixture.provider]);
 await database.query('UPDATE public.studio_artifact_runtime_control SET read_only=true WHERE singleton');
 const beforeStaleRecovery=gateway.counts();let staleMaterialReads=0,staleRecovered;
 try{
  const staleReplayClaim=await studioDb.claimStudioGeneration(staleInitial,gateway.invoke,async()=>{staleMaterialReads+=1;throw new Error('STALE_TERMINAL_MATERIAL_LOAD_FORBIDDEN')});
  assert.equal(staleReplayClaim.claimKind,'terminal');assert.equal(staleReplayClaim.terminalState,'stale');assert.equal(staleReplayClaim.providerAllowed,false);assert.equal(staleReplayClaim.reconcileOnly,false);assert.equal(staleReplayClaim.leaseExpiresAt,null);
  staleRecovered=await studioGeneration.executeClaimedStudioGeneration(staleReplayClaim,{runProvider:async()=>{throw new Error('STALE_TERMINAL_PROVIDER_FORBIDDEN')},runBudgeted:async()=>{throw new Error('STALE_TERMINAL_BUDGET_FORBIDDEN')},stage:async()=>{throw new Error('STALE_TERMINAL_STAGE_FORBIDDEN')},finalize:input=>studioDb.finalizeStudioGeneration(input,gateway.invoke),fail:async()=>{throw new Error('STALE_TERMINAL_FAILURE_WRITE_FORBIDDEN')}});
 }finally{
  await database.query("UPDATE public.ai_provider_configs SET status='active' WHERE id=$1",[fixture.provider]);
  await database.query('UPDATE public.studio_artifact_runtime_control SET read_only=false WHERE singleton');
 }
 assert.equal(staleMaterialReads,0);assert.equal(staleRecovered.state,'stale');assert.equal(staleRecovered.resource.artifactId,staleTerminalBefore.artifact_id);assert.equal(staleRecovered.resource.versionId,staleTerminalBefore.version_id);
 assert.deepEqual(await one(database,staleTerminalSql,[staleRequested.attemptId]),staleTerminalBefore);assert.deepEqual(gateway.counts(),beforeStaleRecovery);
 pass('MAP-PG-BUDGET-014-studio-terminal-finalize-recovery','completed and stale_completed finalizer-response loss replay exact committed artifact/version identities after template supersession, provider deactivation and read-only mode, with zero material load, budget mutation, secret read or provider fetch');

 // Keep one real mapping result staged with its provider effect already
 // executed, but deliberately defer the first token-ledger settlement until
 // after current authorization is revoked below.
 const settlementMapping=await buildMappingFixture(database,fixture,modules,assessRoute,authorizationVersion,'settlement-response-loss');
 const settlementBudget=budgetInputFor(settlementMapping);const settlementReservation=await providerBudget.reserveProviderBudget(settlementBudget,mappingInvoke);assert.equal(settlementReservation.ownsProviderEffect,true);
 const settlementSource={sourceId:settlementMapping.sourceId,sourceVersionId:settlementMapping.sourceVersionId,
  extractionBindingId:settlementMapping.claim.sourceBindings[0].extractionBindingId,extractionJobId:settlementMapping.claim.sourceBindings[0].extractionJobId,
  parserVersion:settlementMapping.claim.sourceBindings[0].parserVersion,normalizedHash:settlementMapping.textHash,
  extractedByteCount:new TextEncoder().encode(settlementMapping.text).byteLength,sheetCount:0,cellCount:0,warnings:[],text:settlementMapping.text};
 const settlementFramed=mappingModule.frameAssessMappingSources([settlementSource],settlementMapping.claim.targets);
 const settlementInstruction=mappingModule.buildAssessDocumentMappingTaskInstruction(settlementMapping.claim.targets);
 const settlementOutput={proposals:[{targetSelectorId:settlementMapping.target.selectorId,sourceVersionId:settlementMapping.sourceVersionId,
  proposedValue:'Route invoice exceptions through governed AP review.',confidence:0.94,rationale:'The controlled process is explicit in the source.',
  safeExcerpt:'Route invoice exceptions through governed AP review.',locator:'text',relationship:'supporting'}]};
 const beforeDeferredSettlement=gateway.counts();
 const settlementProviderResult=await enterpriseAi.runGovernedProviderRequest({provider:'openai',endpoint:'https://api.openai.com',model:'gpt-4.1-mini-2025-04-14',
  capability:'assess.evidence.extract',untrustedSource:settlementFramed,taskInstruction:settlementInstruction,maxOutputTokens:4096,
  providerEffect:{authorizationVersion,receiptId:settlementMapping.receipt.id,effectId:settlementMapping.runId,
   executionToken:settlementMapping.receipt.execution_token,executionFence:Number(settlementMapping.receipt.execution_fence)},
  authorization:{organizationId:fixture.org,workspaceId:fixture.workspace,actorId:fixture.requester,providerConfigId:fixture.provider,
   capability:'assess.evidence.extract',routeEnabled:true,resolverDecision:{...resolverDecision,correlationId:'budget-pipeline-settlement-loss'}}},
  {...gateway.gatewayDeps,fetchImpl:gateway.fakeFetch(settlementOutput)});
 const settlementDecoded=enterpriseAi.parseJsonObjectResponse(settlementProviderResult.output);
 const settlementProposals=await mappingModule.decodeGroundedAssessMappingProposalResult({value:settlementDecoded,targets:settlementMapping.claim.targets,sources:[settlementSource],createProposalId:uuid});
 const settlementAnalyzed=[{sourceId:settlementMapping.sourceId,sourceVersionId:settlementMapping.sourceVersionId,parserVersion:settlementSource.parserVersion,
  extractedByteCount:settlementSource.extractedByteCount,sheetCount:0,cellCount:0,warnings:[]}];
 const settlementSafe={resourceId:settlementMapping.runId,runId:settlementMapping.runId,catalogId:settlementMapping.catalogId,catalogHash:settlementMapping.claim.catalogHash,
  proposalCount:settlementProposals.proposals.length,targetCount:settlementMapping.claim.targets.length,sourceCount:1,sourceBindings:settlementMapping.claim.sourceBindings,
  analyzedSources:settlementAnalyzed,warnings:[...settlementMapping.catalog.warnings,...settlementProposals.warnings]};
 const settlementOutputHash=sha(settlementProviderResult.output);
 const settlementStagedHash=sha(json({runId:settlementMapping.runId,catalogId:settlementMapping.catalogId,outputHash:settlementOutputHash,
  proposals:settlementProposals.proposals,safeResult:settlementSafe,executionFence:Number(settlementMapping.receipt.execution_fence)}));
 await database.query(`SELECT public.enterprise_stage_assess_document_mapping_result_v1($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,1,$8,$9,$10,$11)`,[
  settlementMapping.runId,settlementMapping.catalogId,json(settlementProposals.proposals),json(settlementSafe),settlementOutputHash,
  settlementProviderResult.usage.inputTokens,settlementProviderResult.usage.outputTokens,settlementStagedHash,settlementMapping.receipt.id,
  settlementMapping.receipt.execution_token,settlementMapping.receipt.execution_fence]);
 assert.deepEqual(gateway.counts(),{secretReads:beforeDeferredSettlement.secretReads+1,fetches:beforeDeferredSettlement.fetches+1});
 assert.equal((await one(database,'SELECT state FROM public.enterprise_ai_budget_reservations WHERE id=$1',[settlementReservation.reservationId])).state,'reserved');
 assert.equal(await count(database,'public.enterprise_assess_document_mapping_proposals','run_id=$1',[settlementMapping.runId]),settlementProposals.proposals.length);
 assert.equal(await count(database,'public.synthetic_ai_campaign_effect_debits','assess_mapping_run_id=$1 AND consumed_at IS NOT NULL',[settlementMapping.runId]),1);

 // Build an independent FRD aggregate from the same accepted handoff. This is
 // synthetic fixture setup only; the subsequent request, material load, claim,
 // token reservation and campaign binding all use production functions.
 const parallelArtifactId=uuid(),parallelPackageId=uuid();
 await database.query('BEGIN');
 try{
  await database.query('SET CONSTRAINTS ALL DEFERRED');
  await database.query(`INSERT INTO public.studio_artifact_aggregates(
   id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,
   review_resolution_id,govern_resolution_id,handoff_id,source_package_hash,source_schema_version,rule_set_version,
   review_schema_version,review_sequence,artifact_type,aggregate_version,current_version_id,current_approved_version_id,
   lifecycle,created_by,source_package_id,source_mode,lineage_classification,planning_only)
   SELECT $1,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,
   review_resolution_id,govern_resolution_id,handoff_id,source_package_hash,source_schema_version,rule_set_version,
   review_schema_version,review_sequence,'frd',0,NULL,NULL,'draft',created_by,$2,source_mode,lineage_classification,planning_only
   FROM public.studio_artifact_aggregates WHERE id=$3`,[parallelArtifactId,parallelPackageId,fixture.artifactId]);
  await database.query(`INSERT INTO public.studio_artifact_source_packages(
   id,artifact_id,org_id,workspace_id,version,replaces_source_package_id,source_mode,assess_handoff_id,assess_package_hash,
   studio_input_bundle_id,studio_input_bundle_version_id,studio_input_bundle_version,studio_bundle_hash,manual_brief_hash,
   lineage_classification,planning_only,route_policy_version,route_policy_snapshot,route_policy_hash,package_hash,created_by,
   created_at,candidate_manifest,candidate_manifest_hash,candidate_count,anchor_manifest,anchor_manifest_hash,anchor_count)
   SELECT $1,$2,org_id,workspace_id,1,NULL,source_mode,assess_handoff_id,assess_package_hash,
   studio_input_bundle_id,studio_input_bundle_version_id,studio_input_bundle_version,studio_bundle_hash,manual_brief_hash,
   lineage_classification,planning_only,route_policy_version,route_policy_snapshot,route_policy_hash,package_hash,created_by,
   created_at,candidate_manifest,candidate_manifest_hash,candidate_count,anchor_manifest,anchor_manifest_hash,anchor_count
   FROM public.studio_artifact_source_packages WHERE id=$3`,[parallelPackageId,parallelArtifactId,aggregate.source_package_id]);
  await database.query('COMMIT');
 }catch(error){await database.query('ROLLBACK');throw error}
 const parallelAggregate=await one(database,'SELECT id,aggregate_version,current_version_id,current_approved_version_id,source_package_id FROM public.studio_artifact_aggregates WHERE id=$1',[parallelArtifactId]);
 const parallelTemplate=await one(database,"SELECT id FROM public.studio_system_template_versions WHERE artifact_type='frd' AND superseded_at IS NULL ORDER BY created_at DESC LIMIT 1");assert.ok(parallelTemplate);
  const parallelRequest={...studioRequest,requestId:uuid(),idempotencyKey:`budget-pipeline-studio-mixed-cap-${uuid()}`,artifactId:parallelArtifactId,
   sourcePackageId:parallelPackageId,templateKind:'system',templateVersionId:parallelTemplate.id,expectedAggregateVersion:Number(parallelAggregate.aggregate_version),
  expectedCurrentVersionId:null,expectedApprovedVersionId:null};
 const parallelRequested=(await database.query('SELECT public.studio_artifact_generation_request_v2($1::jsonb) result',[json(parallelRequest)])).rows[0].result;
 const parallelInitial={...parallelRequested.generationPlan,actorId:fixture.requester,organizationId:fixture.org,workspaceId:fixture.workspace,
  authorizationVersion,requestId:parallelRequest.requestId,receiptId:parallelRequested.receiptId,sourcePackageVersion:1};
 const parallelMaterial=await studioDb.loadStudioGenerationMaterial(parallelInitial,createPostgrestRead(database),gateway.invoke);
 const parallelClaim=await studioDb.claimStudioGeneration(parallelInitial,gateway.invoke,async()=>parallelMaterial);assert.equal(parallelClaim.providerAllowed,true);
 const parallelStudioBudget=studioBudgetInputFor(parallelClaim);
 const studioBudgetInvoke=(name,args)=>studioGeneration.studioBudgetRpc(name,args,gateway.invoke);
 const parallelStudioReservation=await providerBudget.reserveProviderBudget(parallelStudioBudget,studioBudgetInvoke);assert.equal(parallelStudioReservation.ownsProviderEffect,true);
 const parallelStudioReplayBefore=await providerBudget.reserveProviderBudget(parallelStudioBudget,studioBudgetInvoke);assert.equal(parallelStudioReplayBefore.ownsProviderEffect,false);assert.equal(parallelStudioReplayBefore.replayed,true);
 await expectedFailure(()=>providerBudget.reserveProviderBudget({...parallelStudioBudget,estimatedInputTokens:parallelStudioBudget.estimatedInputTokens+1},studioBudgetInvoke),/PROVIDER_ROUTE_STALE/u);
 await expectedFailure(()=>providerBudget.reserveProviderBudget({...parallelStudioBudget,maximumOutputTokens:parallelStudioBudget.maximumOutputTokens-1},studioBudgetInvoke),/PROVIDER_ROUTE_STALE/u);
 const parallelStudioStored=await one(database,'SELECT estimated_input_tokens,maximum_output_tokens FROM public.enterprise_ai_budget_reservations WHERE studio_attempt_id=$1',[parallelClaim.attemptId]);
 assert.deepEqual({estimated:Number(parallelStudioStored.estimated_input_tokens),maximum:Number(parallelStudioStored.maximum_output_tokens)},{estimated:parallelStudioBudget.estimatedInputTokens,maximum:parallelStudioBudget.maximumOutputTokens});
 assert.equal(await count(database,'public.enterprise_ai_budget_reservations','studio_attempt_id=$1',[parallelClaim.attemptId]),1);
 const parallelStudioReplayAfter=await providerBudget.reserveProviderBudget(parallelStudioBudget,studioBudgetInvoke);assert.equal(parallelStudioReplayAfter.ownsProviderEffect,false);assert.equal(parallelStudioReplayAfter.replayed,true);

 const mixedMapping=await buildMappingFixture(database,fixture,modules,assessRoute,authorizationVersion,'mixed-cap');
 const mixedMappingBudget=budgetInputFor(mixedMapping);
 const mixedMappingReservation=await providerBudget.reserveProviderBudget(mixedMappingBudget,mappingInvoke);assert.equal(mixedMappingReservation.ownsProviderEffect,true);
 const beforeCapFill=gateway.counts();
 const debitsBeforeCapFill=await count(database,'public.synthetic_ai_campaign_effect_debits');
 const validationPermits=[];
 while(await count(database,'public.synthetic_ai_campaign_effect_debits')<18){
  const ordinal=validationPermits.length+1;const receipt=await createReceipt(database,fixture,'provider.validate',`cap-fill-${ordinal}`);
  const effect={actorId:fixture.requester,organizationId:fixture.org,workspaceId:fixture.workspace,authorizationVersion,receiptId:receipt.id,
   effectId:uuid(),executionToken:receipt.execution_token,executionFence:Number(receipt.execution_fence),providerConfigId:fixture.provider,
   keyRefId:fixture.keyRef,provider:'openai',endpoint:'https://api.openai.com',model:'gpt-4.1-mini-2025-04-14',operation:'provider.validate',
   requestHash:sha(`cap-fill-effect-${ordinal}`),maximumOutputTokens:4096};
  const permit=await modules.reserveSyntheticAiProviderEffect(effect,{invoke:gateway.invoke,...campaignRuntime});
  assert.equal(permit.ownsProviderEffect,true);assert.equal(permit.replayed,false);validationPermits.push(permit);
 }
 assert.equal(validationPermits.length,18-debitsBeforeCapFill);assert.deepEqual(gateway.counts(),beforeCapFill);
 const mixedMappingEffect={actorId:fixture.requester,organizationId:fixture.org,workspaceId:fixture.workspace,authorizationVersion,
  receiptId:mixedMapping.receipt.id,effectId:mixedMapping.runId,executionToken:mixedMapping.receipt.execution_token,
  executionFence:Number(mixedMapping.receipt.execution_fence),routeId:assessRoute,providerConfigId:fixture.provider,keyRefId:fixture.keyRef,
  provider:'openai',endpoint:'https://api.openai.com',model:'gpt-4.1-mini-2025-04-14',operation:'assess.evidence.extract',
  requestHash:sha('mixed-cap-assess-effect'),maximumOutputTokens:4096};
 const mixedStudioEffect={actorId:fixture.requester,organizationId:fixture.org,workspaceId:fixture.workspace,authorizationVersion,
  receiptId:parallelClaim.receiptId,effectId:parallelClaim.attemptId,executionToken:parallelClaim.executionToken,
  executionFence:parallelClaim.executionFence,routeId:studioRoute,providerConfigId:fixture.provider,keyRefId:fixture.keyRef,
  provider:'openai',endpoint:'https://api.openai.com',model:'gpt-4.1-mini-2025-04-14',operation:'studio.document.generate',
  requestHash:sha('mixed-cap-studio-effect'),maximumOutputTokens:parallelClaim.maximumOutputTokens};
 let releaseMixedStart;const mixedStart=new Promise(resolve=>{releaseMixedStart=resolve});
 const mixedEffects=[mixedMappingEffect,mixedStudioEffect];
 const capRace=mixedEffects.map((effect,index)=>(async()=>{await mixedStart;return modules.reserveSyntheticAiProviderEffect(effect,{invoke:createSqlRpc(contendersClients[index]),...campaignRuntime})})());
 releaseMixedStart();const capResults=await Promise.allSettled(capRace);const winnerIndex=capResults.findIndex(result=>result.status==='fulfilled');
 assert.notEqual(winnerIndex,-1);assert.equal(capResults.filter(result=>result.status==='fulfilled').length,1);assert.equal(capResults.filter(result=>result.status==='rejected').length,1);
 const rejected=capResults.find(result=>result.status==='rejected');assert.match(String(rejected.reason instanceof Error?rejected.reason.message:rejected.reason),/AUTHORITY_UNAVAILABLE/u);
 const winningPermit=capResults[winnerIndex].value;assert.equal(winningPermit.ownsProviderEffect,true);assert.equal(winningPermit.replayed,false);
 assert.equal(await count(database,'public.synthetic_ai_campaign_effect_debits'),19);
 assert.equal(await count(database,'public.synthetic_ai_campaign_effect_debits','assess_mapping_run_id=$1',[mixedMapping.runId]),winnerIndex===0?1:0);
 assert.equal(await count(database,'public.synthetic_ai_campaign_effect_debits','studio_attempt_id=$1',[parallelClaim.attemptId]),winnerIndex===1?1:0);
 const campaignSpend=await one(database,'SELECT count(*)::int debit_count,sum(debit_usd_nanos)::bigint spent FROM public.synthetic_ai_campaign_effect_debits');
 assert.equal(Number(campaignSpend.debit_count),19);assert.equal(Number(campaignSpend.spent),Number(campaignBudget.fixed_debit_usd_nanos)*19);
 assert.ok(Number(campaignBudget.carried_usd_nanos)+Number(campaignSpend.spent)<=Number(campaignBudget.campaign_cap_usd_nanos));
 assert.ok(Number(campaignBudget.carried_usd_nanos)+Number(campaignSpend.spent)+Number(campaignBudget.fixed_debit_usd_nanos)>Number(campaignBudget.campaign_cap_usd_nanos));
 assert.deepEqual(gateway.counts(),beforeCapFill);
 const loserIndex=winnerIndex===0?1:0;
 if(loserIndex===0){const released=await providerBudget.releaseProviderBudget({...mixedMappingBudget,reservationId:mixedMappingReservation.reservationId,releaseReason:'before_provider_effect'},mappingInvoke);assert.equal(released.state,'released')}
 else{const released=await providerBudget.releaseProviderBudget({...parallelStudioBudget,reservationId:parallelStudioReservation.reservationId,releaseReason:'before_provider_effect'},studioBudgetInvoke);assert.equal(released.state,'released')}
 pass('MAP-PG-BUDGET-011-mixed-domain-shared-cap','real Assess mapping and Studio token reservations race the same immutable final campaign slot on separate connections; exactly one domain receives currency authority and neither invokes a provider');

 // Revocation after the prior provider effects must not strand exact stored
 // token-ledger reconciliation, but it must fence currency consumption before
 // any new provider egress.
 const beforeAuthChange={...gateway.counts(),debits:await count(database,'public.synthetic_ai_campaign_effect_debits')};
 await database.query("UPDATE public.workspace_memberships SET status='suspended',disabled_at=statement_timestamp(),updated_at=statement_timestamp() WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3",[fixture.org,fixture.workspace,fixture.requester]);
 const revokedVersion=Number((await one(database,'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',[fixture.org,fixture.requester])).version);assert.ok(revokedVersion>authorizationVersion);
 await expectedFailure(()=>modules.consumeSyntheticAiProviderEffect(winningPermit,gateway.invoke),/PERMIT_CONSUME_FAILED/u);
 assert.equal((await one(database,'SELECT consumed_at FROM public.synthetic_ai_campaign_effect_debits WHERE id=$1',[winningPermit.reservationId])).consumed_at,null);
 const winnerBudget=winnerIndex===0?mixedMappingBudget:parallelStudioBudget;
 const winnerReservation=winnerIndex===0?mixedMappingReservation:parallelStudioReservation;
 const winnerInvoke=winnerIndex===0?mappingInvoke:studioBudgetInvoke;
 const winnerUncertain=await providerBudget.markProviderBudgetUncertain({...winnerBudget,reservationId:winnerReservation.reservationId,failureClass:'authority_revoked_before_egress'},winnerInvoke);assert.equal(winnerUncertain.state,'uncertain');
 let settlementResponseLost=true;
 const settlementLossInvoke=async(name,args)=>{const result=await mappingInvoke(name,args);if(name==='enterprise_ai_settle_provider_budget_v2'&&settlementResponseLost){settlementResponseLost=false;throw new Error('SYNTHETIC_SETTLEMENT_RESPONSE_LOST')}return result};
 const settlementRecoveredInRetry=await providerBudget.settleProviderBudget({...settlementBudget,reservationId:settlementReservation.reservationId,usage:settlementProviderResult.usage},settlementLossInvoke);
 assert.equal(settlementRecoveredInRetry.state,'settled');assert.equal(settlementRecoveredInRetry.replayed,true);
 assert.equal(settlementResponseLost,false);
 const settledAfterRevocation=await one(database,'SELECT state,actual_input_tokens,actual_output_tokens,actual_total_tokens FROM public.enterprise_ai_budget_reservations WHERE id=$1',[settlementReservation.reservationId]);
 assert.deepEqual({state:settledAfterRevocation.state,input:Number(settledAfterRevocation.actual_input_tokens),output:Number(settledAfterRevocation.actual_output_tokens),total:Number(settledAfterRevocation.actual_total_tokens)},
  {state:'settled',input:settlementProviderResult.usage.inputTokens,output:settlementProviderResult.usage.outputTokens,total:settlementProviderResult.usage.totalTokens});
 const settleRecovery=await providerBudget.settleProviderBudget({...settlementBudget,reservationId:settlementReservation.reservationId,usage:settlementProviderResult.usage},mappingInvoke);assert.equal(settleRecovery.state,'settled');assert.equal(settleRecovery.replayed,true);
 const failedStudioBudget=studioBudgetInputFor(failedClaim);const failedStudioReservation=await one(database,'SELECT id FROM public.enterprise_ai_budget_reservations WHERE studio_attempt_id=$1',[failedClaim.attemptId]);
 const uncertainAfterRevocation=await providerBudget.markProviderBudgetUncertain({...failedStudioBudget,reservationId:failedStudioReservation.id,failureClass:'synthetic_stage_persistence_failed'},studioBudgetInvoke);assert.equal(uncertainAfterRevocation.state,'uncertain');assert.equal(uncertainAfterRevocation.replayed,true);
 assert.deepEqual({...gateway.counts(),debits:await count(database,'public.synthetic_ai_campaign_effect_debits')},beforeAuthChange);
 pass('MAP-PG-BUDGET-012-post-effect-auth-change','current authorization revocation blocks unconsumed currency before egress; a staged provider effect settles for the first time despite a lost settlement response and recovers without a second effect, while exact uncertain replay remains available');

 assert.equal(defaultNetworkAttempts,0);assert.equal(defaultEnvironmentReads,0);
 assert.deepEqual(expectedAssertions,EXPECTED_ASSERTIONS);console.log(`Assess/Studio budget production pipeline PostgreSQL scenarios: ${expectedAssertions.length}/${EXPECTED_ASSERTIONS.length} passed.`);
}finally{
 for(const client of auxiliaryClients.reverse())await client.end().catch(()=>{});
 if(database)await database.end().catch(()=>{});
 if(admin&&databaseCreated){await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[databaseName]).catch(()=>{});await admin.query(`DROP DATABASE ${databaseName}`).catch(error=>{console.error(`cleanup failed:${error.code??'unknown'}`);process.exitCode=1});databaseCreated=false}
 if(admin)await admin.end().catch(()=>{});
 globalThis.fetch=originalFetch;if(originalDeno===undefined)delete globalThis.Deno;else globalThis.Deno=originalDeno;
}
