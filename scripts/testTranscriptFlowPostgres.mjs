import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';
import {createEnterpriseIntelligenceFixture} from './enterpriseIntelligencePostgresFixture.mjs';

const adminUrl=process.env.TRANSCRIPT_FLOW_MIGRATION_DATABASE_URL;
if(!adminUrl){
  if(process.env.CI)throw new Error('TRANSCRIPT_FLOW_MIGRATION_DATABASE_URL is required in CI.');
  console.log('PR A transcript-flow PostgreSQL scenarios skipped: TRANSCRIPT_FLOW_MIGRATION_DATABASE_URL is not set.');
  process.exit(0);
}

const {Client}=pg;
const migrations=(await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')).sort();
const feature='20260825165350_governed_transcript_source_sets_assess.sql';
const authorityForwardFix='20260826151538_governed_transcript_authority_forward_fix.sql';
assert.ok(migrations.includes(feature),'PR A transcript authority migration is absent from the ordered chain.');
assert.ok(migrations.includes(authorityForwardFix),'PR A transcript authority forward fix is absent from the ordered chain.');
const suffix=`${process.pid}_${Date.now()}`;
const databaseName=`transcript_pr_a_${suffix}`;
const createdRoles=[];
const clients=[];
const urlFor=name=>{const value=new URL(adminUrl);value.pathname=`/${name}`;return value.toString()};
const connect=async url=>{const client=new Client({connectionString:url});await client.connect();clients.push(client);return client};
const transaction=async(client,label,sql)=>{
  await client.query('BEGIN');
  try{await client.query(sql);await client.query('COMMIT');console.log(`APPLIED ${label}`)}
  catch(error){await client.query('ROLLBACK');throw new Error(`${label}: ${error instanceof Error?error.message:String(error)}`)}
};
const sha=value=>createHash('sha256').update(value).digest('hex');
let postgresRuntimeIdentity;
const emptyLineage=()=>({sourceVersionSelectors:[],sourceSets:[],inputBundles:[],extractionJobIds:[],extractionBindingIds:[],candidates:[],previewBatchIds:[],assessDrafts:[]});
const postgresRuntimeContext=lineage=>{
  assert.ok(postgresRuntimeIdentity,'PostgreSQL runtime identity must come from the created fixture.');
  return {
    persona:{
      id:postgresRuntimeIdentity.actorId,
      state:postgresRuntimeIdentity.state,
      capabilities:[...postgresRuntimeIdentity.capabilities],
    },
    organizationId:postgresRuntimeIdentity.organizationId,
    workspaceId:postgresRuntimeIdentity.workspaceId,
    fixtureIds:['pr-a-postgres'],lineage,
  };
};
const assertionCounts=new Map();
const assertion=(testId,assertionId,runtimeContext,fixture='pr-a-postgres')=>{
  const count=(assertionCounts.get(testId)||0)+1;assertionCounts.set(testId,count);
  console.log(`PR_A_ASSERTION ${JSON.stringify({testId,assertionId:`${assertionId}-${count}`,fixture,result:'passed',runtimeContext})}`);
};
const scenario=async(testIds,label,operation)=>{
  const runtimeLineage=await operation();
  console.log(`PASS ${label}`);
  if(testIds.length)assert.ok(runtimeLineage,`Runtime lineage required for ${label}`);
  for(const [index,testId] of testIds.entries())assertion(testId,`${testId.toLowerCase()}-${String(index+1).padStart(2,'0')}`,postgresRuntimeContext(runtimeLineage));
};

let admin;
let database;
try{
  admin=await connect(adminUrl);
  for(const [role,attributes] of [['anon','NOLOGIN'],['authenticated','NOLOGIN'],['service_role','NOLOGIN BYPASSRLS']]){
    if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount){
      await admin.query(`CREATE ROLE ${role} ${attributes}`);
      createdRoles.push(role);
    }
  }
  assert.match(databaseName,/^[a-z0-9_]+$/);
  assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[databaseName])).rowCount,0,`Refusing to overwrite ${databaseName}`);
  await admin.query(`CREATE DATABASE ${databaseName}`);
  console.log(`CREATED DATABASE ${databaseName}`);
  database=await connect(urlFor(databaseName));
  await transaction(database,'Supabase auth bootstrap',`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid primary key);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  `);
  for(const name of migrations)await transaction(database,name,await readFile(join('supabase/migrations',name),'utf8'));
  assert.ok(Number((await database.query("SELECT current_setting('server_version_num')::int version")).rows[0].version)>=160000);

  const fixture=await createEnterpriseIntelligenceFixture(database);
  await database.query(
    `INSERT INTO public.role_capabilities(role_id,capability_key)
     SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING`,
    [fixture.routeRole,['transcript.sources.read','transcript.sources.manage','transcript.assess.apply','transcript.journeys.manage','assess.v2.read']],
  );
  const runtimeIdentityResult=await database.query(
    `SELECT
       $1::uuid actor_id,$2::uuid organization_id,$3::uuid workspace_id,
       CASE WHEN EXISTS(
         SELECT 1 FROM public.organization_members
         WHERE org_id=$2 AND user_id=$1 AND status='active' AND deleted_at IS NULL
       ) AND EXISTS(
         SELECT 1 FROM public.workspace_memberships
         WHERE org_id=$2 AND workspace_id=$3 AND user_id=$1 AND status='active' AND deleted_at IS NULL
       ) THEN 'active' ELSE 'revoked' END state,
       COALESCE(array_agg(DISTINCT effective.capability_key ORDER BY effective.capability_key)
         FILTER (WHERE effective.capability_key IS NOT NULL),'{}'::text[]) capabilities
     FROM (
       SELECT rc.capability_key FROM public.organization_members om
       JOIN public.roles r ON r.id=om.role_id AND r.status='active' AND r.deleted_at IS NULL
       JOIN public.role_capabilities rc ON rc.role_id=r.id
       WHERE om.org_id=$2 AND om.user_id=$1 AND om.status='active' AND om.deleted_at IS NULL
       UNION
       SELECT rc.capability_key FROM public.workspace_memberships wm
       JOIN public.roles r ON r.id=wm.role_id AND r.status='active' AND r.deleted_at IS NULL
       JOIN public.role_capabilities rc ON rc.role_id=r.id
       WHERE wm.org_id=$2 AND wm.workspace_id=$3 AND wm.user_id=$1 AND wm.status='active' AND wm.deleted_at IS NULL
     ) effective`,
    [fixture.requester,fixture.org,fixture.workspace],
  );
  const runtimeIdentityRow=runtimeIdentityResult.rows[0];
  const queriedCapabilities=[...runtimeIdentityRow.capabilities];
  assert.equal(new Set(queriedCapabilities).size,queriedCapabilities.length,
    'PostgreSQL runtime capabilities must be unique before canonical evidence ordering');
  postgresRuntimeIdentity={
    actorId:runtimeIdentityRow.actor_id,
    organizationId:runtimeIdentityRow.organization_id,
    workspaceId:runtimeIdentityRow.workspace_id,
    state:runtimeIdentityRow.state,
    capabilities:queriedCapabilities.sort(),
  };
  assert.equal(postgresRuntimeIdentity.state,'active');
  assert.ok(postgresRuntimeIdentity.capabilities.length>0);
  assert.deepEqual(postgresRuntimeIdentity.capabilities,[...new Set(postgresRuntimeIdentity.capabilities)].sort());
  // This override exists only inside the disposable test database. It makes DB-generated
  // immutable selectors reproducible so the governed evidence registry can reject a
  // substituted-but-valid UUID instead of accepting a shape/count wildcard.
  await database.query('CREATE SEQUENCE public.pr_a_deterministic_uuid_sequence START WITH 1');
  await database.query(`CREATE OR REPLACE FUNCTION pg_catalog.gen_random_uuid() RETURNS uuid
    LANGUAGE sql VOLATILE AS $$
      SELECT ('96000000-0000-4000-8000-'||lpad(nextval('public.pr_a_deterministic_uuid_sequence')::text,12,'0'))::uuid
    $$`);
  await database.query(
    `INSERT INTO public.enterprise_transcript_workspace_flags(
       org_id,workspace_id,transcript_source_sets_enabled,assess_multisource_apply_enabled,unified_byok_gateway_enabled,governed_journeys_enabled,updated_by
     ) VALUES($1,$2,true,true,true,true,$3)`,
    [fixture.org,fixture.workspace,fixture.requester],
  );
  let authorizationVersion=Number((await database.query(
    'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',
    [fixture.org,fixture.requester],
  )).rows[0].version);
  let sequence=5000;
  const nextUuid=()=>fixture.uuid(sequence++);
  const claim=async(commandType,label,client=database)=>{
    const requestId=nextUuid();
    const executionToken=nextUuid();
    const requestHash=sha(`pr-a:${commandType}:${label}`);
    const receipt=(await client.query(
      `SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,NULL,$8)).*`,
      [fixture.requester,fixture.org,fixture.workspace,commandType,`transcript-pr-a-${label}`,requestId,requestHash,executionToken],
    )).rows[0];
    assert.equal(receipt.status,'claimed');
    return {...receipt,requestId,requestHash};
  };
  const sourceSet=async({id,owner='assess',label,items,expected=0,lock=true,receiptLabel})=>{
    const receipt=await claim('transcript.source-set.create-version',receiptLabel);
    return (await database.query(
      `SELECT public.enterprise_transcript_create_source_set_version(
        $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15
      ) result`,
      [id,owner,label,'Governed fixture set','Exact selected transcript versions',JSON.stringify(items),lock,expected,
        fixture.requester,fixture.org,fixture.workspace,authorizationVersion,receipt.id,receipt.execution_token,receipt.execution_fence],
    )).rows[0].result;
  };

  const transcriptTables=[
    'enterprise_transcript_workspace_flags','enterprise_source_sets','enterprise_source_set_versions','enterprise_source_set_version_items',
    'enterprise_module_input_bundles','enterprise_module_input_bundle_versions','enterprise_module_input_bundle_items','enterprise_governed_journeys',
    'enterprise_governed_journey_versions','enterprise_assess_apply_previews','enterprise_assess_apply_preview_batches',
    'enterprise_assess_candidate_applications','enterprise_evidence_candidate_relationship_reviews','enterprise_assess_evidence_conflicts',
    'enterprise_assess_evidence_conflict_resolutions','enterprise_transcript_extraction_bindings','enterprise_ai_budget_reservations',
    'enterprise_provider_secret_cleanup_jobs','enterprise_transcript_staleness_events',
  ];
  await scenario([],'forced RLS and service-only mutation authority',async()=>{
    const inventory=(await database.query(
      `SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
       WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[]) ORDER BY relname`,
      [transcriptTables],
    )).rows;
    assert.equal(inventory.length,transcriptTables.length);
    for(const row of inventory)assert.deepEqual([row.relrowsecurity,row.relforcerowsecurity],[true,true],row.relname);
    for(const table of transcriptTables){
      assert.equal((await database.query("SELECT has_table_privilege('authenticated',$1,'INSERT,UPDATE,DELETE') allowed",[`public.${table}`])).rows[0].allowed,false,table);
    }
    assert.equal((await database.query(
      "SELECT has_function_privilege('authenticated','public.enterprise_transcript_create_source_set_version(uuid,text,text,text,text,jsonb,boolean,bigint,uuid,uuid,uuid,bigint,uuid,uuid,bigint)','EXECUTE') allowed",
    )).rows[0].allowed,false);
    assert.equal((await database.query(
      "SELECT has_function_privilege('service_role','public.enterprise_transcript_create_source_set_version(uuid,text,text,text,text,jsonb,boolean,bigint,uuid,uuid,uuid,bigint,uuid,uuid,bigint)','EXECUTE') allowed",
    )).rows[0].allowed,true);
    assert.equal((await database.query(
      "SELECT has_function_privilege('authenticated','public.enterprise_transcript_create_assess_apply_preview_batch_v2(uuid,uuid,bigint,uuid,uuid,bigint,jsonb,jsonb,uuid,uuid,uuid,bigint,uuid,uuid,bigint)','EXECUTE') allowed",
    )).rows[0].allowed,false);
    assert.equal((await database.query(
      "SELECT has_function_privilege('service_role','public.enterprise_transcript_create_assess_apply_preview_batch_v2(uuid,uuid,bigint,uuid,uuid,bigint,jsonb,jsonb,uuid,uuid,uuid,bigint,uuid,uuid,bigint)','EXECUTE') allowed",
    )).rows[0].allowed,true);
  });

  const firstSetId=nextUuid();
  const firstV1=await sourceSet({
    id:firstSetId,label:'Assess interviews',receiptLabel:'source-set-v1',
    items:[{sourceVersionId:fixture.sources[0].sourceVersionId,ordinal:1,role:'primary',note:'Primary interview'}],
  });
  await scenario(['SRCSET-001'],'one transcript creates one immutable ordered version',async()=>{
    assert.deepEqual([firstV1.sourceSetId,firstV1.version,firstV1.status,firstV1.sourceCount],[firstSetId,1,'locked',1]);
    const item=(await database.query(
      `SELECT ordinal,semantic_role,source_version_id,content_hash,extracted_text_hash
       FROM public.enterprise_source_set_version_items WHERE source_set_version_id=$1`,
      [firstV1.sourceSetVersionId],
    )).rows[0];
    assert.deepEqual([item.ordinal,item.semantic_role,item.source_version_id],[1,'primary',fixture.sources[0].sourceVersionId]);
    assert.match(item.content_hash,/^[0-9a-f]{64}$/);assert.match(item.extracted_text_hash,/^[0-9a-f]{64}$/);
    await assert.rejects(database.query(
      'UPDATE public.enterprise_source_set_versions SET purpose=$1 WHERE id=$2',
      ['mutated',firstV1.sourceSetVersionId],
    ),/ENTERPRISE_TRANSCRIPT_IMMUTABLE/);
    return {...emptyLineage(),sourceVersionSelectors:[fixture.sources[0].sourceVersionId],sourceSets:[{id:firstSetId,versionSelector:firstV1.sourceSetVersionId,version:1}]};
  });

  const firstV2=await sourceSet({
    id:firstSetId,label:'Assess interviews reordered',expected:1,receiptLabel:'source-set-v2',
    items:[
      {sourceVersionId:fixture.sources[1].sourceVersionId,ordinal:1,role:'supporting',note:'Controls'},
      {sourceVersionId:fixture.sources[0].sourceVersionId,ordinal:2,role:'primary',note:'Discovery'},
    ],
  });
  await scenario(['SRCSET-002','SRCSET-003','SRCSET-004'],'multiple transcripts retain declared order and membership changes version instead of mutation',async()=>{
    assert.equal(firstV2.version,2);
    assert.deepEqual((await database.query(
      `SELECT source_version_id,ordinal,semantic_role FROM public.enterprise_source_set_version_items
       WHERE source_set_version_id=$1 ORDER BY ordinal`,[firstV2.sourceSetVersionId],
    )).rows,fixture.sources.slice(0,2).reverse().map((source,index)=>({
      source_version_id:source.sourceVersionId,ordinal:index+1,semantic_role:index===0?'supporting':'primary',
    })));
    assert.equal((await database.query('SELECT count(*)::int n FROM public.enterprise_source_set_versions WHERE source_set_id=$1',[firstSetId])).rows[0].n,2);
    const duplicateReceipt=await claim('transcript.source-set.create-version','duplicate-members');
    await assert.rejects(database.query(
      `SELECT public.enterprise_transcript_create_source_set_version(
        $1,'assess','Duplicate','', 'Duplicate rejection',$2::jsonb,true,0,$3,$4,$5,$6,$7,$8,$9
      )`,
      [nextUuid(),JSON.stringify([
        {sourceVersionId:fixture.sources[0].sourceVersionId,ordinal:1,role:'primary'},
        {sourceVersionId:fixture.sources[0].sourceVersionId,ordinal:2,role:'supporting'},
      ]),fixture.requester,fixture.org,fixture.workspace,authorizationVersion,duplicateReceipt.id,duplicateReceipt.execution_token,duplicateReceipt.execution_fence],
    ),/ENTERPRISE_TRANSCRIPT_INVALID_SOURCE_SET/);
    return {...emptyLineage(),sourceVersionSelectors:fixture.sources.slice(0,2).map(source=>source.sourceVersionId).sort(),sourceSets:[{id:firstSetId,versionSelector:firstV2.sourceSetVersionId,version:2}]};
  });

  await scenario(['SRCSET-002','IDEMP-003'],'stale source-set expectedVersion loses the concurrency race without a partial version',async()=>{
    const staleReceipt=await claim('transcript.source-set.create-version','source-set-stale-version');
    await assert.rejects(database.query(
      `SELECT public.enterprise_transcript_create_source_set_version(
        $1,'assess','Stale update','', 'Must lose concurrency',$2::jsonb,true,1,$3,$4,$5,$6,$7,$8,$9
      )`,
      [firstSetId,JSON.stringify([{sourceVersionId:fixture.sources[0].sourceVersionId,ordinal:1,role:'primary'}]),
        fixture.requester,fixture.org,fixture.workspace,authorizationVersion,
        staleReceipt.id,staleReceipt.execution_token,staleReceipt.execution_fence],
    ),/ENTERPRISE_TRANSCRIPT_SOURCE_SET_STALE/);
    assert.equal((await database.query(
      'SELECT count(*)::int n FROM public.enterprise_source_set_versions WHERE source_set_id=$1',[firstSetId],
    )).rows[0].n,2);
    assert.equal((await database.query(
      'SELECT count(*)::int n FROM public.enterprise_transcript_staleness_events WHERE source_set_id=$1',[firstSetId],
    )).rows[0].n,0);
    return {...emptyLineage(),sourceVersionSelectors:[fixture.sources[0].sourceVersionId],sourceSets:[{id:firstSetId,versionSelector:firstV2.sourceSetVersionId,version:2}]};
  });

  const sharedStudioSet=await sourceSet({
    id:nextUuid(),owner:'studio',label:'Independent Studio context',receiptLabel:'studio-reuse',
    items:[{sourceVersionId:fixture.sources[0].sourceVersionId,ordinal:1,role:'reference',note:'Explicit independent reuse'}],
  });
  await scenario(['SRCSET-006'],'one exact source version is reusable by independent module-owned sets',async()=>{
    assert.equal(sharedStudioSet.version,1);
    assert.equal((await database.query(
      `SELECT count(*)::int n FROM public.enterprise_source_set_version_items item
       JOIN public.enterprise_source_sets source_set ON source_set.id=item.source_set_id
       WHERE item.source_version_id=$1 AND source_set.owner_module=ANY($2::text[])`,
      [fixture.sources[0].sourceVersionId,['assess','studio']],
    )).rows[0].n>=2,true);
    return {...emptyLineage(),sourceVersionSelectors:[fixture.sources[0].sourceVersionId],sourceSets:[{id:sharedStudioSet.sourceSetId,versionSelector:sharedStudioSet.sourceSetVersionId,version:1}]};
  });

  await scenario(['SRCSET-007','ASSESS-TR-010'],'failed source members block a set atomically',async()=>{
    const id=nextUuid();const receipt=await claim('transcript.source-set.create-version','failed-source');
    await assert.rejects(database.query(
      `SELECT public.enterprise_transcript_create_source_set_version(
        $1,'assess','Failed source','', 'Must remain blocked',$2::jsonb,true,0,$3,$4,$5,$6,$7,$8,$9
      )`,
      [id,JSON.stringify([{sourceVersionId:fixture.sources[7].sourceVersionId,ordinal:1,role:'primary'}]),fixture.requester,fixture.org,fixture.workspace,
        authorizationVersion,receipt.id,receipt.execution_token,receipt.execution_fence],
    ),/ENTERPRISE_TRANSCRIPT_SOURCE_VERSION_NOT_READY/);
    assert.equal((await database.query('SELECT count(*)::int n FROM public.enterprise_source_sets WHERE id=$1',[id])).rows[0].n,0);
    assert.equal((await database.query('SELECT count(*)::int n FROM public.enterprise_ai_effect_journal WHERE receipt_id=$1',[receipt.id])).rows[0].n,0);
    return {...emptyLineage(),sourceVersionSelectors:[fixture.sources[7].sourceVersionId]};
  });

  await scenario(['SRCSET-008'],'cross-workspace selectors are non-mutating',async()=>{
    const otherWorkspace=nextUuid();const foreignSource=nextUuid();const foreignVersion=nextUuid();const setId=nextUuid();
    await database.query("INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,'Foreign fixture','foreign-fixture')",[otherWorkspace,fixture.org]);
    await database.query('SELECT public.enterprise_create_evidence_source($1::jsonb,$2::jsonb)',[
      JSON.stringify({id:foreignSource,org_id:fixture.org,workspace_id:otherWorkspace,display_name:'Foreign transcript',source_kind:'upload',mime_type:'text/plain',created_by:fixture.requester}),
      JSON.stringify({id:foreignVersion,source_id:foreignSource,org_id:fixture.org,workspace_id:otherWorkspace,original_filename:'foreign.txt',content_hash:'a'.repeat(64),content_bytes:32,storage_bucket:'source-uploads',storage_path:`${fixture.org}/${otherWorkspace}/enterprise-evidence/${foreignSource}.bin`,extracted_text_hash:'b'.repeat(64),extracted_character_count:32,created_by:fixture.requester}),
    ]);
    const receipt=await claim('transcript.source-set.create-version','cross-workspace');
    await assert.rejects(database.query(
      `SELECT public.enterprise_transcript_create_source_set_version(
        $1,'assess','Foreign selector','', 'Must not disclose',$2::jsonb,true,0,$3,$4,$5,$6,$7,$8,$9
      )`,
      [setId,JSON.stringify([{sourceVersionId:foreignVersion,ordinal:1,role:'primary'}]),fixture.requester,fixture.org,fixture.workspace,
        authorizationVersion,receipt.id,receipt.execution_token,receipt.execution_fence],
    ),/ENTERPRISE_TRANSCRIPT_SOURCE_VERSION_NOT_READY/);
    assert.equal((await database.query('SELECT count(*)::int n FROM public.enterprise_source_sets WHERE id=$1',[setId])).rows[0].n,0);
    assert.equal((await database.query('SELECT count(*)::int n FROM public.enterprise_ai_effect_journal WHERE receipt_id=$1',[receipt.id])).rows[0].n,0);
    return {...emptyLineage(),sourceVersionSelectors:[foreignVersion]};
  });

  const bundleId=nextUuid();const bundleReceipt=await claim('transcript.input-bundle.lock','bundle-v1');
  const bundle=(await database.query(
    `SELECT public.enterprise_transcript_lock_input_bundle(
      $1,$2::jsonb,NULL,0,$3,$4,$5,$6,$7,$8,$9
    ) result`,
    [bundleId,JSON.stringify([{sourceSetVersionId:firstV2.sourceSetVersionId,ordinal:1,purpose:'Assess discovery'}]),
      fixture.requester,fixture.org,fixture.workspace,authorizationVersion,bundleReceipt.id,bundleReceipt.execution_token,bundleReceipt.execution_fence],
  )).rows[0].result;
  const bundleRow=(await database.query('SELECT * FROM public.enterprise_module_input_bundle_versions WHERE id=$1',[bundle.inputBundleVersionId])).rows[0];
  await scenario(['SRCSET-005'],'locked input bundle binds only exact selected source versions',async()=>{
    assert.deepEqual([bundle.inputBundleId,bundle.version,bundle.status],[bundleId,1,'locked']);
    assert.match(bundleRow.bundle_hash,/^[0-9a-f]{64}$/);
    const selected=(await database.query(
      `SELECT item.source_version_id FROM public.enterprise_module_input_bundle_items bundle_item
       JOIN public.enterprise_source_set_version_items item ON item.source_set_version_id=bundle_item.source_set_version_id
       WHERE bundle_item.input_bundle_version_id=$1 ORDER BY bundle_item.ordinal,item.ordinal`,
      [bundle.inputBundleVersionId],
    )).rows.map(row=>row.source_version_id);
    assert.deepEqual(selected,[fixture.sources[1].sourceVersionId,fixture.sources[0].sourceVersionId]);
    assert.equal(selected.includes(fixture.sources[2].sourceVersionId),false);
    return {...emptyLineage(),sourceVersionSelectors:selected.slice().sort(),sourceSets:[{id:firstSetId,versionSelector:firstV2.sourceSetVersionId,version:2}],inputBundles:[{id:bundleId,versionSelector:bundle.inputBundleVersionId,version:1}]};
  });

  const journeyId=nextUuid();
  const journeyCommand=async(action,expected,label)=>{
    const receipt=await claim('transcript.journey.set-state',label);
    return (await database.query(
      `SELECT public.enterprise_transcript_set_journey_state(
        $1,$2,'assess',$3,$4,1,$5,$6,$7,$8,$9,$10,$11
      ) result`,
      [journeyId,action,`Governed ${action}`,expected,fixture.requester,fixture.org,fixture.workspace,authorizationVersion,
        receipt.id,receipt.execution_token,receipt.execution_fence],
    )).rows[0].result;
  };
  await scenario(['IDEMP-001'],'journey create, stop, and resume append exact versions',async()=>{
    assert.equal((await journeyCommand('create',0,'journey-create')).status,'active');
    assert.equal((await journeyCommand('stop',1,'journey-stop')).status,'stopped');
    assert.equal((await journeyCommand('resume',2,'journey-resume')).status,'active');
    assert.deepEqual((await database.query(
      'SELECT version,status FROM public.enterprise_governed_journey_versions WHERE journey_id=$1 ORDER BY version',[journeyId],
    )).rows,[{version:'1',status:'active'},{version:'2',status:'stopped'},{version:'3',status:'active'}]);
    return emptyLineage();
  });

  const routeId=nextUuid();
  await database.query(
    `INSERT INTO public.enterprise_ai_capability_routes(
      id,org_id,workspace_id,provider_config_id,capability,model,enabled,allowed_roles,created_by,updated_by
    ) VALUES($1,$2,$3,$4,'assess.evidence.extract','fixture-model',true,ARRAY[$5::text],$6,$6)`,
    [routeId,fixture.org,fixture.workspace,fixture.provider,fixture.routeRole,fixture.requester],
  );
  const createCandidate=async(source,index,value,lineage={
    bundleId,bundleVersionId:bundle.inputBundleVersionId,bundleHash:bundleRow.bundle_hash,
    sourceSetId:firstSetId,sourceSetVersionId:firstV2.sourceSetVersionId,sourceSetVersion:2,
  })=>{
    const jobId=nextUuid();const candidateId=nextUuid();
    await database.query(
      `INSERT INTO public.enterprise_ai_job_ledger(
        id,org_id,workspace_id,capability,provider_config_id,provider,model,prompt_key,prompt_version,actor_id,request_id,idempotency_key,status,approval_state
      ) VALUES($1,$2,$3,'assess.evidence.extract',$4,'openai','fixture-model','fixture-extract','fixture-1',$5,$6,$7,'running','review_required')`,
      [jobId,fixture.org,fixture.workspace,fixture.provider,fixture.requester,nextUuid(),`transcript-candidate-${index}`],
    );
    await database.query(
      `SELECT public.enterprise_commit_evidence_extraction(
        $1,$2,$3,$4,$5,10,$6,'openai','fixture-model',20,10,$7::jsonb
      )`,
      [jobId,source.sourceId,fixture.org,fixture.workspace,sha(`extract-${index}`),fixture.provider,JSON.stringify([{
        id:candidateId,sourceVersionId:source.sourceVersionId,field:'process_objective',value,
        safeExcerpt:`Safe governed evidence candidate ${index}.`,sourceLocator:`normalized-text:v1:chars:${index*20}-${index*20+18}`,
        confidence:0.9,promptVersion:'fixture-1',createdBy:fixture.requester,
      }])],
    );
    const bindingReceipt=await claim('transcript.assess.extract',`binding-${index}`);
    const binding=(await database.query(
      `INSERT INTO public.enterprise_transcript_extraction_bindings(
        org_id,workspace_id,job_id,receipt_id,input_bundle_version_id,input_bundle_id,bundle_hash,
        source_set_id,source_set_version_id,source_id,source_version_id,
        provider_route_id,provider_config_id,model,authorization_version,created_by
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'fixture-model',$14,$15) RETURNING id`,
      [fixture.org,fixture.workspace,jobId,bindingReceipt.id,lineage.bundleVersionId,lineage.bundleId,lineage.bundleHash,
        lineage.sourceSetId,lineage.sourceSetVersionId,source.sourceId,source.sourceVersionId,routeId,fixture.provider,authorizationVersion,fixture.requester],
    )).rows[0];
    return {candidateId,jobId,bindingId:binding.id,source,lineage};
  };
  const candidateA=await createCandidate(fixture.sources[0],1,'Govern review and approval');
  const candidateB=await createCandidate(fixture.sources[1],2,'Automate review and exception handling');
  const reviewCandidate=async(candidate,status,value,label)=>{
    const current=Number((await database.query('SELECT version FROM public.enterprise_evidence_candidates WHERE id=$1',[candidate.candidateId])).rows[0].version);
    const receipt=await claim('transcript.assess.candidate.review',label);
    return (await database.query(
      `SELECT public.enterprise_transcript_review_assess_candidate_v2(
        $1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$11,'neutral','create_primitive',$12,$13,$14,$15,$16,$17,$18,$19
      ) result`,
      [candidate.candidateId,current,candidate.lineage.bundleId,candidate.lineage.bundleVersionId,
        candidate.lineage.sourceSetId,candidate.lineage.sourceSetVersionId,candidate.lineage.sourceSetVersion,
        candidate.source.sourceVersionId,status,value,'Independent transcript review','primitive',fixture.requester,fixture.org,fixture.workspace,
        authorizationVersion,receipt.id,receipt.execution_token,receipt.execution_fence],
    )).rows[0].result;
  };
  await reviewCandidate(candidateA,'accepted',null,'candidate-accept');
  await reviewCandidate(candidateB,'edited','Automate reviewed exception handling','candidate-edit');
  await scenario(['ASSESS-TR-001','ASSESS-TR-002','ASSESS-TR-003'],'source-specific candidate anchors and immutable human reviews persist',async()=>{
    const rows=(await database.query(
      `SELECT id,source_version_id,suggestion_status,version,source_locator,reviewed_by
       FROM public.enterprise_evidence_candidates WHERE id=ANY($1::uuid[]) ORDER BY id`,
      [[candidateA.candidateId,candidateB.candidateId]],
    )).rows;
    assert.equal(rows.length,2);assert.equal(new Set(rows.map(row=>row.source_version_id)).size,2);
    assert.equal(rows.every(row=>row.reviewed_by===fixture.requester),true);
    assert.deepEqual(rows.map(row=>Number(row.version)).sort(),[1,2]);
    assert.equal(rows.every(row=>/^normalized-text:v1:chars:\d+-\d+$/.test(row.source_locator)),true);
    assert.equal((await database.query('SELECT count(*)::int n FROM public.enterprise_evidence_candidate_edits WHERE candidate_id=ANY($1::uuid[])',[[candidateA.candidateId,candidateB.candidateId]])).rows[0].n,1);
    assert.equal((await database.query('SELECT count(*)::int n FROM public.enterprise_evidence_candidate_relationship_reviews WHERE candidate_id=ANY($1::uuid[])',[[candidateA.candidateId,candidateB.candidateId]])).rows[0].n,2);
    return {
      ...emptyLineage(),sourceVersionSelectors:[candidateA.source.sourceVersionId,candidateB.source.sourceVersionId].sort(),
      sourceSets:[{id:firstSetId,versionSelector:firstV2.sourceSetVersionId,version:2}],inputBundles:[{id:bundleId,versionSelector:bundle.inputBundleVersionId,version:1}],
      extractionJobIds:[candidateA.jobId,candidateB.jobId].sort(),extractionBindingIds:[candidateA.bindingId,candidateB.bindingId].sort(),
      candidates:[{id:candidateA.candidateId,version:1},{id:candidateB.candidateId,version:2}].sort((a,b)=>a.id.localeCompare(b.id)),
    };
  });

  const assessProcess=nextUuid();const assessCase=nextUuid();const assessVersion=nextUuid();const primitiveId=nextUuid();
  const sourceSnapshot={preserved:true,source:'manual'};const importedFacts=[{key:'manual',value:'preserved'}];const agentNecessity={irreducibleAmbiguity:true};
  await database.query("INSERT INTO public.assess_processes(id,org_id,workspace_id,name,status) VALUES($1,$2,$3,'Transcript Assess','Draft')",[assessProcess,fixture.org,fixture.workspace]);
  await database.query(
    `INSERT INTO public.assess_v2_cases(id,org_id,workspace_id,process_id,owner_id,status,version)
     VALUES($1,$2,$3,$4,$5,'draft',1)`,[assessCase,fixture.org,fixture.workspace,assessProcess,fixture.requester],
  );
  await database.query(
    `INSERT INTO public.assess_v2_case_versions(
      id,case_id,org_id,workspace_id,version,name,description,agent_necessity,source_kind,source_snapshot,imported_facts,created_by
    ) VALUES($1,$2,$3,$4,1,'Manual Assess name','Manual-only description',$5::jsonb,'create',$6::jsonb,$7::jsonb,$8)`,
    [assessVersion,assessCase,fixture.org,fixture.workspace,JSON.stringify(agentNecessity),JSON.stringify(sourceSnapshot),JSON.stringify(importedFacts),fixture.requester],
  );
  await database.query('UPDATE public.assess_v2_cases SET head_version_id=$1 WHERE id=$2',[assessVersion,assessCase]);
  const scoreBefore=(await database.query('SELECT count(*)::int n,min(score_version) score_version FROM public.assessments WHERE org_id=$1',[fixture.org])).rows[0];
  const previewBatchId=nextUuid();const previewReceipt=await claim('transcript.assess.apply.preview','apply-preview');
  const exactSourceSetLineage=[{
    sourceSetId:firstSetId,sourceSetVersionSelector:firstV2.sourceSetVersionId,expectedVersion:2,ordinal:1,
  }];
  const preview=(await database.query(
    `SELECT public.enterprise_transcript_create_assess_apply_preview_batch_v2(
      $1,$2,1,$3,$4,1,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12,$13
    ) result`,
    [previewBatchId,assessCase,bundleId,bundle.inputBundleVersionId,JSON.stringify(exactSourceSetLineage),JSON.stringify([
      {candidateId:candidateA.candidateId,candidateVersion:1,intent:'create_primitive',target:primitiveId},
      {candidateId:candidateB.candidateId,candidateVersion:2,intent:'create_primitive',target:primitiveId},
    ]),fixture.requester,fixture.org,fixture.workspace,authorizationVersion,previewReceipt.id,previewReceipt.execution_token,previewReceipt.execution_fence],
  )).rows[0].result;
  const materialConflict=(await database.query(
    `SELECT * FROM public.enterprise_assess_evidence_conflicts
     WHERE assess_case_id=$1 AND cardinality(candidate_ids)=2`,[assessCase],
  )).rows[0];
  const assessRuntimeLineage=(draftVersion=1,includePreview=true)=>({
    sourceVersionSelectors:[candidateA.source.sourceVersionId,candidateB.source.sourceVersionId].sort(),
    sourceSets:[{id:firstSetId,versionSelector:firstV2.sourceSetVersionId,version:2}],
    inputBundles:[{id:bundleId,versionSelector:bundle.inputBundleVersionId,version:1}],
    extractionJobIds:[candidateA.jobId,candidateB.jobId].sort(),extractionBindingIds:[candidateA.bindingId,candidateB.bindingId].sort(),
    candidates:[{id:candidateA.candidateId,version:1},{id:candidateB.candidateId,version:2}].sort((a,b)=>a.id.localeCompare(b.id)),
    previewBatchIds:includePreview?[previewBatchId]:[],assessDrafts:[{id:assessCase,version:draftVersion}],
  });
  await scenario(['ASSESS-TR-005','ASSESS-TR-006'],'competing source proposals create one unresolved material conflict',async()=>{
    assert.equal(preview.status,'conflict_unresolved');assert.equal(preview.materialConflictCount,1);
    assert.equal(preview.previewBatchId,previewBatchId);
    assert.ok(materialConflict);assert.deepEqual([...materialConflict.candidate_ids].sort(),[candidateA.candidateId,candidateB.candidateId].sort());
    const commitReceipt=await claim('transcript.assess.apply.commit','blocked-commit');
    await assert.rejects(database.query(
      `SELECT public.enterprise_transcript_commit_assess_apply_preview_batch_v2(
        $1,$2,1,$3,$4,1,$5::jsonb,$6,$7,$8,$9,$10,$11,$12
      )`,
      [previewBatchId,assessCase,bundleId,bundle.inputBundleVersionId,JSON.stringify(exactSourceSetLineage),
        fixture.requester,fixture.org,fixture.workspace,authorizationVersion,commitReceipt.id,commitReceipt.execution_token,commitReceipt.execution_fence],
    ),/ENTERPRISE_TRANSCRIPT_APPLY_BATCH_STALE/);
    assert.equal((await database.query('SELECT version FROM public.assess_v2_cases WHERE id=$1',[assessCase])).rows[0].version,'1');
    return assessRuntimeLineage();
  });

  const authenticatedTranscriptProjection=async()=>{
    await database.query('BEGIN');
    try{
      await database.query('SET LOCAL ROLE authenticated');
      await database.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[fixture.requester]);
      const result=(await database.query('SELECT public.enterprise_transcript_assess_projection($1,$2) result',[fixture.org,fixture.workspace])).rows[0].result;
      await database.query('COMMIT');
      return result;
    }catch(error){await database.query('ROLLBACK');throw error}
  };
  const authenticatedStalenessCount=async()=>{
    await database.query('BEGIN');
    try{
      await database.query('SET LOCAL ROLE authenticated');
      await database.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[fixture.requester]);
      const count=(await database.query(
        'SELECT count(*)::int n FROM public.enterprise_transcript_staleness_events WHERE org_id=$1 AND workspace_id=$2',
        [fixture.org,fixture.workspace],
      )).rows[0].n;
      await database.query('COMMIT');
      return count;
    }catch(error){await database.query('ROLLBACK');throw error}
  };

  const resolveReceipt=await claim('transcript.assess.conflict.resolve','conflict-resolve');
  const resolution=(await database.query(
    `SELECT public.enterprise_transcript_resolve_assess_conflict(
      $1,0,'choose_candidate',$2,NULL,'Choose the independently reviewed primary candidate',$3,$4,$5,$6,$7,$8,$9
    ) result`,
    [materialConflict.id,candidateA.candidateId,fixture.requester,fixture.org,fixture.workspace,authorizationVersion,
      resolveReceipt.id,resolveReceipt.execution_token,resolveReceipt.execution_fence],
  )).rows[0].result;
  assert.equal(resolution.status,'resolved');
  const commitReceipt=await claim('transcript.assess.apply.commit','apply-commit');
  const applied=(await database.query(
    `SELECT public.enterprise_transcript_commit_assess_apply_preview_batch_v2(
      $1,$2,1,$3,$4,1,$5::jsonb,$6,$7,$8,$9,$10,$11,$12
    ) result`,
    [previewBatchId,assessCase,bundleId,bundle.inputBundleVersionId,JSON.stringify(exactSourceSetLineage),
      fixture.requester,fixture.org,fixture.workspace,authorizationVersion,commitReceipt.id,commitReceipt.execution_token,commitReceipt.execution_fence],
  )).rows[0].result;
  await scenario(['ASSESS-TR-004','ASSESS-TR-007','ASSESS-TR-008','IDEMP-002-A'],'resolved batch creates exactly one Assess version and preserves manual/scoring ancestry',async()=>{
    assert.deepEqual([applied.startVersion,applied.finalVersion,applied.selectedCandidateCount,applied.appliedCandidateCount],[1,2,2,1]);
    const version=(await database.query(
      'SELECT * FROM public.assess_v2_case_versions WHERE id=$1',[applied.caseVersionId],
    )).rows[0];
    assert.deepEqual(version.source_snapshot,sourceSnapshot);assert.deepEqual(version.imported_facts,importedFacts);assert.deepEqual(version.agent_necessity,agentNecessity);
    assert.equal(version.description,'Manual-only description');
    assert.equal((await database.query('SELECT count(*)::int n FROM public.assess_v2_primitives WHERE version_id=$1 AND id=$2',[applied.caseVersionId,primitiveId])).rows[0].n,1);
    assert.deepEqual((await database.query(
      'SELECT application_outcome FROM public.enterprise_assess_candidate_applications WHERE assess_case_id=$1 ORDER BY batch_ordinal',[assessCase],
    )).rows.map(row=>row.application_outcome),['applied','not_applied']);
    assert.equal((await database.query('SELECT count(*)::int n FROM public.assess_v2_evidence_links WHERE version_id=$1',[applied.caseVersionId])).rows[0].n,2);
    assert.deepEqual((await database.query('SELECT count(*)::int n,min(score_version) score_version FROM public.assessments WHERE org_id=$1',[fixture.org])).rows[0],scoreBefore);
    await assert.rejects(database.query(
      `SELECT public.enterprise_transcript_commit_assess_apply_preview_batch_v2(
        $1,$2,1,$3,$4,1,$5::jsonb,$6,$7,$8,$9,$10,$11,$12
      )`,
      [previewBatchId,assessCase,bundleId,bundle.inputBundleVersionId,JSON.stringify(exactSourceSetLineage),
        fixture.requester,fixture.org,fixture.workspace,authorizationVersion,commitReceipt.id,commitReceipt.execution_token,commitReceipt.execution_fence],
    ),/ENTERPRISE_TRANSCRIPT_APPLY_BATCH_STALE/);
    assert.equal((await database.query('SELECT count(*)::int n FROM public.assess_v2_case_versions WHERE case_id=$1',[assessCase])).rows[0].n,2);
    const reloaded=(await database.query('SELECT (public.enterprise_ai_reload_command($1,$2,$3)).*',[commitReceipt.id,fixture.org,fixture.workspace])).rows[0];
    assert.equal(reloaded.status,'committed');assert.equal(reloaded.response.finalVersion,2);
    return assessRuntimeLineage(2);
  });

  await scenario(['SRCSET-004'],'a new source-set version preserves consumed bundle, application, Assess, candidate, and evidence history',async()=>{
    const before=(await database.query(`SELECT
      (SELECT count(*)::int FROM public.enterprise_assess_candidate_applications WHERE input_bundle_version_id=$1) applications,
      (SELECT count(*)::int FROM public.assess_v2_case_versions WHERE case_id=$2) assess_versions,
      (SELECT count(*)::int FROM public.enterprise_evidence_candidates WHERE id=ANY($3::uuid[])) candidates`,
      [bundle.inputBundleVersionId,assessCase,[candidateA.candidateId,candidateB.candidateId]])).rows[0];
    const advanced=await sourceSet({
      id:firstSetId,label:'Assess interviews next selection',expected:2,receiptLabel:'source-set-v3-consumed',
      items:[{sourceVersionId:fixture.sources[2].sourceVersionId,ordinal:1,role:'primary',note:'New selectable version'}],
    });
    assert.equal(advanced.version,3);
    assert.equal((await database.query(
      `SELECT count(*)::int n FROM public.enterprise_transcript_staleness_events
       WHERE resource_kind='input_bundle_version' AND resource_id=$1`,[bundle.inputBundleVersionId],
    )).rows[0].n,0,'consumed input bundle remains immutable and readable');
    const after=(await database.query(`SELECT
      (SELECT count(*)::int FROM public.enterprise_assess_candidate_applications WHERE input_bundle_version_id=$1) applications,
      (SELECT count(*)::int FROM public.assess_v2_case_versions WHERE case_id=$2) assess_versions,
      (SELECT count(*)::int FROM public.enterprise_evidence_candidates WHERE id=ANY($3::uuid[])) candidates`,
      [bundle.inputBundleVersionId,assessCase,[candidateA.candidateId,candidateB.candidateId]])).rows[0];
    assert.deepEqual(after,before);
    return {...assessRuntimeLineage(2),sourceVersionSelectors:[...assessRuntimeLineage(2).sourceVersionSelectors,fixture.sources[2].sourceVersionId].sort(),sourceSets:[{id:firstSetId,versionSelector:advanced.sourceSetVersionId,version:3}]};
  });

  await scenario(['SRCSET-004'],'only an unconsumed dependent bundle version receives append-only staleness',async()=>{
    const staleSetId=nextUuid();
    const staleV1=await sourceSet({
      id:staleSetId,label:'Unconsumed set',receiptLabel:'unconsumed-set-v1',
      items:[{sourceVersionId:fixture.sources[3].sourceVersionId,ordinal:1,role:'primary'}],
    });
    const staleBundleId=nextUuid();const staleBundleReceipt=await claim('transcript.input-bundle.lock','unconsumed-bundle-v1');
    const staleBundle=(await database.query(
      `SELECT public.enterprise_transcript_lock_input_bundle(
        $1,$2::jsonb,NULL,0,$3,$4,$5,$6,$7,$8,$9
      ) result`,
      [staleBundleId,JSON.stringify([{sourceSetVersionId:staleV1.sourceSetVersionId,ordinal:1,purpose:'Unconsumed selection'}]),
        fixture.requester,fixture.org,fixture.workspace,authorizationVersion,staleBundleReceipt.id,
        staleBundleReceipt.execution_token,staleBundleReceipt.execution_fence],
    )).rows[0].result;
    const staleV2=await sourceSet({
      id:staleSetId,label:'Unconsumed set advanced',expected:1,receiptLabel:'unconsumed-set-v2',
      items:[{sourceVersionId:fixture.sources[4].sourceVersionId,ordinal:1,role:'primary'}],
    });
    assert.deepEqual((await database.query(
      `SELECT resource_kind,resource_id,reason FROM public.enterprise_transcript_staleness_events
       WHERE source_set_id=$1 ORDER BY resource_kind,resource_id`,[staleSetId],
    )).rows,[{
      resource_kind:'input_bundle_version',resource_id:staleBundle.inputBundleVersionId,
      reason:'source_set_version_advanced',
    }]);
    await assert.rejects(database.query(
      `UPDATE public.enterprise_transcript_staleness_events SET reason='source_set_version_advanced'
       WHERE resource_id=$1`,[staleBundle.inputBundleVersionId],
    ),/ENTERPRISE_TRANSCRIPT_IMMUTABLE/);
    return {
      ...emptyLineage(),sourceVersionSelectors:[fixture.sources[3].sourceVersionId,fixture.sources[4].sourceVersionId].sort(),
      sourceSets:[{id:staleSetId,versionSelector:staleV1.sourceSetVersionId,version:1},{id:staleSetId,versionSelector:staleV2.sourceSetVersionId,version:2}],
      inputBundles:[{id:staleBundleId,versionSelector:staleBundle.inputBundleVersionId,version:1}],
    };
  });

  await database.query("DELETE FROM public.role_capabilities WHERE role_id=$1 AND capability_key='assess.v2.read'",[fixture.routeRole]);
  const sourceOnlyProjection=await authenticatedTranscriptProjection();
  assert.ok(sourceOnlyProjection.sourceSets.length>0);assert.ok(sourceOnlyProjection.inputBundles.length>0);
  assert.deepEqual(sourceOnlyProjection.journeys,[]);assert.deepEqual(sourceOnlyProjection.conflicts,[]);assert.deepEqual(sourceOnlyProjection.candidateRelationships,[]);
  assert.equal(await authenticatedStalenessCount(),0,'source-read-only authority cannot read mixed Assess staleness selectors');
  await database.query(
    "INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,'assess.v2.read') ON CONFLICT DO NOTHING",
    [fixture.routeRole],
  );
  authorizationVersion=Number((await database.query(
    'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',
    [fixture.org,fixture.requester],
  )).rows[0].version);
  const assessProjection=await authenticatedTranscriptProjection();
  assert.ok(assessProjection.journeys.length>0);assert.ok(assessProjection.conflicts.length>0);assert.ok(assessProjection.candidateRelationships.length>0);
  assert.ok(await authenticatedStalenessCount()>0,'assess.v2.read authority can read governed staleness selectors');
  console.log('PASS transcript.sources.read projection and RLS exclude every Assess-owned collection until assess.v2.read is granted');

  const budgetRoute=routeId;
  await database.query(
    `UPDATE public.ai_provider_configs SET last_validated_at=statement_timestamp(),budget_policy=$2::jsonb WHERE id=$1`,
    [fixture.provider,JSON.stringify({dailyRequests:1,monthlyTokens:1000})],
  );
  const createBudgetAttempt=async(source,label)=>{
    const receipt=await claim('transcript.assess.extract',`budget-${label}`);
    const jobId=nextUuid();
    const plan={jobId,sourceId:source.sourceId,sourceVersionId:source.sourceVersionId,organizationId:fixture.org,workspaceId:fixture.workspace,
      routeId:budgetRoute,providerConfigId:fixture.provider,provider:'openai',capability:'assess.evidence.extract',model:'fixture-model',
      endpointIdentity:null,deploymentIdentity:null,promptKey:'assess.evidence.extract',promptVersion:'transcript-assess-extract-1',requestHash:receipt.requestHash};
    await database.query('SELECT public.enterprise_ai_plan_command($1,$2,$3,$4,$5,$6::jsonb)',[
      receipt.id,fixture.org,fixture.workspace,receipt.execution_token,receipt.execution_fence,JSON.stringify(plan),
    ]);
    const claimResult=(await database.query(
      `SELECT public.enterprise_claim_or_resume_evidence_extraction_job_v2(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,'openai','assess.evidence.extract','fixture-model',NULL,NULL,
        'assess.evidence.extract','transcript-assess-extract-1',$10,$11,$12
      ) result`,
      [jobId,receipt.id,fixture.org,fixture.workspace,fixture.requester,source.sourceId,source.sourceVersionId,budgetRoute,fixture.provider,
        receipt.requestHash,receipt.execution_token,receipt.execution_fence],
    )).rows[0].result;
    assert.equal(claimResult.ownsExecution,true);
    return {receipt,jobId,source};
  };
  const budgetA=await createBudgetAttempt(fixture.sources[0],'a');
  const budgetB=await createBudgetAttempt(fixture.sources[1],'b');
  const reserve=async(client,attempt)=>(await client.query(
    `SELECT public.enterprise_ai_reserve_provider_budget(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'openai','assess.evidence.extract','fixture-model',100,50
    ) result`,
    [fixture.requester,fixture.org,fixture.workspace,authorizationVersion,attempt.receipt.id,attempt.jobId,
      attempt.receipt.execution_token,attempt.receipt.execution_fence,budgetRoute,fixture.provider],
  )).rows[0].result;
  await scenario(['BUDGET-001','BUDGET-002','PROVIDER-009-A'],'atomic budget grants one provider-effect owner and safely reconciles response loss',async()=>{
    const contenderA=await connect(urlFor(databaseName));const contenderB=await connect(urlFor(databaseName));
    const results=await Promise.all([reserve(contenderA,budgetA),reserve(contenderB,budgetB)]);
    const winners=results.map((result,index)=>({result,attempt:[budgetA,budgetB][index]})).filter(entry=>entry.result.ownsProviderEffect);
    assert.equal(winners.length,1);assert.equal(results.filter(result=>result.errorCode==='BUDGET_EXHAUSTED').length,1);
    const winner=winners[0];
    const replay=await reserve(database,winner.attempt);assert.deepEqual([replay.state,replay.replayed,replay.ownsProviderEffect],['reserved',true,false]);
    authorizationVersion=Number((await database.query(
      `UPDATE public.authorization_versions SET version=version+1,updated_at=statement_timestamp()
       WHERE org_id=$1 AND user_id=$2 RETURNING version`,[fixture.org,fixture.requester],
    )).rows[0].version);
    const uncertain=(await database.query(
      `SELECT public.enterprise_ai_mark_provider_budget_uncertain_v2(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'openai','assess.evidence.extract','fixture-model',$11,'provider_response_lost'
      ) result`,
      [fixture.requester,fixture.org,fixture.workspace,authorizationVersion,winner.attempt.receipt.id,winner.attempt.jobId,
        winner.attempt.receipt.execution_token,winner.attempt.receipt.execution_fence,budgetRoute,fixture.provider,winner.result.reservationId],
    )).rows[0].result;
    assert.equal(uncertain.state,'uncertain');
    const settled=(await database.query(
      `SELECT public.enterprise_ai_settle_provider_budget_v2(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'openai','assess.evidence.extract','fixture-model',$11,50,10,60
      ) result`,
      [fixture.requester,fixture.org,fixture.workspace,authorizationVersion,winner.attempt.receipt.id,winner.attempt.jobId,
        winner.attempt.receipt.execution_token,winner.attempt.receipt.execution_fence,budgetRoute,fixture.provider,winner.result.reservationId],
    )).rows[0].result;
    assert.deepEqual([settled.state,settled.totalTokens],['settled',60]);
    assert.equal(settled.replayed,false,'exact fenced settlement succeeds after current authority version changes post-effect');
    assert.equal((await database.query('SELECT count(*)::int n FROM public.enterprise_ai_budget_reservations')).rows[0].n,1);
    return {...emptyLineage(),sourceVersionSelectors:[budgetA.source.sourceVersionId,budgetB.source.sourceVersionId].sort(),extractionJobIds:[budgetA.jobId,budgetB.jobId].sort()};
  });

  await scenario([],'default-off rollback preserves history and rejects new writes',async()=>{
    const before=(await database.query(`SELECT
      (SELECT count(*)::int FROM public.enterprise_source_set_versions) source_versions,
      (SELECT count(*)::int FROM public.enterprise_assess_candidate_applications) applications,
      (SELECT count(*)::int FROM public.enterprise_assess_evidence_conflicts) conflicts`)).rows[0];
    await database.query(
      `UPDATE public.enterprise_transcript_workspace_flags SET transcript_source_sets_enabled=false,
       assess_multisource_apply_enabled=false,unified_byok_gateway_enabled=false,governed_journeys_enabled=false,version=version+1,updated_at=statement_timestamp()
       WHERE org_id=$1 AND workspace_id=$2`,[fixture.org,fixture.workspace],
    );
    const receipt=await claim('transcript.source-set.create-version','rollback-disabled');
    await assert.rejects(database.query(
      `SELECT public.enterprise_transcript_create_source_set_version(
        $1,'assess','Disabled','', 'No write',$2::jsonb,true,0,$3,$4,$5,$6,$7,$8,$9
      )`,
      [nextUuid(),JSON.stringify([{sourceVersionId:fixture.sources[0].sourceVersionId,ordinal:1,role:'primary'}]),fixture.requester,fixture.org,fixture.workspace,
        authorizationVersion,receipt.id,receipt.execution_token,receipt.execution_fence],
    ),/ENTERPRISE_TRANSCRIPT_FEATURE_DISABLED/);
    const after=(await database.query(`SELECT
      (SELECT count(*)::int FROM public.enterprise_source_set_versions) source_versions,
      (SELECT count(*)::int FROM public.enterprise_assess_candidate_applications) applications,
      (SELECT count(*)::int FROM public.enterprise_assess_evidence_conflicts) conflicts`)).rows[0];
    assert.deepEqual(after,before);
    assert.equal((await database.query('SELECT count(*)::int n FROM public.assess_v2_case_versions WHERE case_id=$1',[assessCase])).rows[0].n,2);
  });

  console.log('PR A transcript-flow PostgreSQL scenarios: all assertions passed; no live provider or hosted system was used.');
}finally{
  for(const client of clients.reverse())if(client!==admin)await client.end().catch(()=>{});
  if(admin){
    let cleanupFailed=false;
    try{await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);console.log(`CLEANUP DROPPED DATABASE ${databaseName}`)}
    catch(error){cleanupFailed=true;console.error(`CLEANUP FAILED DATABASE ${databaseName}: ${error instanceof Error?error.message:String(error)}`)}
    for(const role of createdRoles.reverse()){
      try{await admin.query(`DROP ROLE IF EXISTS ${role}`)}
      catch(error){cleanupFailed=true;console.error(`CLEANUP FAILED ROLE ${role}: ${error instanceof Error?error.message:String(error)}`)}
    }
    await admin.end().catch(()=>{});
    console.log(`CLEANUP ${cleanupFailed?'FAILED':'PASS'}`);
    if(cleanupFailed)process.exitCode=1;
  }
}
