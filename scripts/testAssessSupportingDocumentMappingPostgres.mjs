import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {readFile,readdir} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import pg from 'pg';
import {createEnterpriseIntelligenceFixture} from './enterpriseIntelligencePostgresFixture.mjs';
import {validateAssessImportDatabaseUrl} from './assessImportValidationContract.mjs';
import {approvedFullChainTip} from './prCMigrationTailContract.mjs';
import {expectDatabaseError} from './assessDocumentPostgresTestGuards.mjs';
import {PROJECTION_RPC_CORRECTION} from './projectionRpcPostgrestContract.mjs';
import {verifyAssessMappingClaimPostgresBridge} from './assessMappingClaimPostgresBridge.mjs';

const adminUrl=validateAssessImportDatabaseUrl(process.env.ASSESS_DOCUMENT_MAPPING_POSTGRES_ADMIN_URL);

const parsedAdmin=new URL(adminUrl);
assert.ok(['127.0.0.1','localhost','::1'].includes(parsedAdmin.hostname),'Only a loopback PostgreSQL admin endpoint is permitted.');
assert.equal(parsedAdmin.pathname,'/postgres','The PostgreSQL harness requires the disposable postgres admin database.');
const {Client}=pg;
const migrations=(await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')).sort();
const expectedFullChainTip=approvedFullChainTip(migrations);
const feature='20260916083814_assess_supporting_document_mapping.sql';
const mappingIdentity='20260916151050_assess_document_mapping_identity_convergence.sql';
const xlsxCorrection='20260916181916_assess_document_xlsx_ingestion_authority.sql';
assert.equal(expectedFullChainTip,'20260923133000','Assess mapping must validate the exact approved PR 1E claim-operator successor chain.');
assert.equal(migrations.indexOf(PROJECTION_RPC_CORRECTION),migrations.indexOf(xlsxCorrection)+1,'Projection correction must immediately follow XLSX ingestion authority.');
assert.equal(migrations.indexOf(mappingIdentity),migrations.indexOf(feature)+1,'Identity convergence must immediately follow the frozen mapping migration.');
assert.equal(migrations.indexOf(xlsxCorrection),migrations.indexOf(mappingIdentity)+1,'XLSX ingestion authority must immediately follow the known mapping-identity predecessor.');
const databaseName=`assess_map_${process.pid}_${Date.now()}`;
assert.match(databaseName,/^[a-z0-9_]+$/);
const clients=[];
const urlFor=name=>{const value=new URL(adminUrl);value.pathname=`/${name}`;return value.toString()};
const connect=async connectionString=>{const client=new Client({connectionString});await client.connect();clients.push(client);return client};
const transaction=async(client,label,sql)=>{await client.query('BEGIN');try{await client.query(sql);await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw new Error(`${label}: ${error instanceof Error?error.message:String(error)}`)}};
const sha=value=>createHash('sha256').update(value).digest('hex');
const uuid=n=>`94000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const json=value=>JSON.stringify(value);
const passed=[];
const pass=(testId,detail)=>{passed.push(testId);console.log(`ASSESS_DOCUMENT_MAPPING_PG_ASSERTION ${JSON.stringify({testId,result:'passed',detail})}`)};
const runXlsxProbe=()=>{
  const output=execFileSync(process.execPath,[
    'scripts/runEnterpriseIntelligenceTest.mjs',
    'supabase/functions/_shared/enterpriseIntelligenceIngestion.ts',
    'scripts/testAssessDocumentIngestionParserProbe.ts',
  ],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const matches=[...output.matchAll(/ASSESS_DOCUMENT_XLSX_PROBE (\{[^\r\n]+\})/gu)];
  assert.equal(matches.length,1,'Canonical XLSX probe must emit one sanitized metadata envelope.');
  const probe=JSON.parse(matches[0][1]);
  assert.deepEqual(Object.keys(probe).sort(),['cellCount','contentBytes','contentHash','extractedByteCount','extractedCharacterCount','extractedTextHash','filename','malformedContentBytes','malformedContentHash','malformedFailureCode','mimeType','parserVersion','sheetCount','warnings'].sort());
  assert.match(probe.contentHash,/^[0-9a-f]{64}$/u);assert.match(probe.extractedTextHash,/^[0-9a-f]{64}$/u);assert.match(probe.malformedContentHash,/^[0-9a-f]{64}$/u);
  assert.equal(probe.parserVersion,'spreadsheet-grid-v1');assert.equal(probe.malformedFailureCode,'MALFORMED_SOURCE');assert.ok(probe.contentBytes>0&&probe.malformedContentBytes>0&&probe.extractedCharacterCount>0&&probe.extractedByteCount>0&&probe.sheetCount>0&&probe.cellCount>0);
  return probe;
};
const runNativeParser=payload=>{
  const ownedRoot=resolve('output/test-runs/assess-mapping-native');mkdirSync(ownedRoot,{recursive:true});
  const payloadPath=join(ownedRoot,`payload-${process.pid}-${Date.now()}.json`);assert.equal(existsSync(payloadPath),false);writeFileSync(payloadPath,JSON.stringify(payload));
  try{execFileSync(process.execPath,['scripts/runEnterpriseIntelligenceTest.mjs','supabase/functions/_shared/assessV2Command.ts','scripts/testAssessSupportingDocumentMappingNativeParser.ts'],{stdio:'inherit',env:{...process.env,ASSESS_MAPPING_NATIVE_PAYLOAD_PATH:payloadPath}})}
  finally{if(existsSync(payloadPath)){const resolvedPayload=realpathSync(resolve(payloadPath));assert.equal(lstatSync(payloadPath).isSymbolicLink(),false);assert.equal(dirname(resolvedPayload),realpathSync(ownedRoot));assert.match(basename(resolvedPayload),/^payload-[0-9]+-[0-9]+\.json$/);rmSync(payloadPath)}}
};
const xlsxProbe=runXlsxProbe();
const classifierAuthority=async client=>(await client.query(`SELECT
  function_row.oid::text oid,
  function_row.proowner::regrole::text owner,
  COALESCE(function_row.proacl::text,'') acl,
  COALESCE(function_row.proconfig::text,'') config,
  function_row.proisstrict is_strict,
  function_row.provolatile volatility,
  function_row.prosecdef security_definer,
  function_row.proleakproof leakproof,
  function_row.proparallel parallel,
  language_row.lanname language,
  encode(sha256(convert_to(replace(function_row.prosrc,E'\\r\\n',E'\\n'),'UTF8')),'hex') body_hash
  FROM pg_catalog.pg_proc function_row
  JOIN pg_catalog.pg_language language_row ON language_row.oid=function_row.prolang
  WHERE function_row.oid='public.enterprise_assess_v2_source_type(text,text)'::regprocedure`)).rows[0];

let admin;let database;let fixture;let xlsxAuthority;
try{
  admin=await connect(adminUrl);
  const version=Number((await admin.query("SELECT current_setting('server_version_num')::int version")).rows[0].version);
  assert.ok(version>=160000&&version<170000,'The focused harness requires PostgreSQL 16.');
  assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[databaseName])).rowCount,0,`Refusing to overwrite ${databaseName}`);
  for(const [role,attributes] of [['anon','NOLOGIN'],['authenticated','NOLOGIN'],['service_role','NOLOGIN BYPASSRLS']])if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount)await admin.query(`CREATE ROLE ${role} ${attributes}`);
  await admin.query(`CREATE DATABASE ${databaseName}`);
  database=await connect(urlFor(databaseName));
  await transaction(database,'Supabase auth bootstrap',`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid primary key);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  `);
  for(const name of migrations){
    if(name===feature){
      fixture=await createEnterpriseIntelligenceFixture(database);
      await database.query(`INSERT INTO public.enterprise_transcript_workspace_flags(org_id,workspace_id,transcript_source_sets_enabled,assess_multisource_apply_enabled,unified_byok_gateway_enabled,governed_journeys_enabled,updated_by) VALUES($1,$2,true,true,true,true,$3)`,[fixture.org,fixture.workspace,fixture.requester]);
    }
    if(name===xlsxCorrection){
      assert.ok(fixture);
      assert.equal((await database.query('SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton IS TRUE')).rows[0].migration_tip,'20260916151050');
      const classifierBefore=await classifierAuthority(database);
      assert.deepEqual({is_strict:classifierBefore.is_strict,volatility:classifierBefore.volatility,security_definer:classifierBefore.security_definer,leakproof:classifierBefore.leakproof,parallel:classifierBefore.parallel,language:classifierBefore.language},
        {is_strict:true,volatility:'i',security_definer:false,leakproof:false,parallel:'u',language:'plpgsql'});
      await expectDatabaseError(()=>database.query('SELECT public.enterprise_assess_v2_source_type($1,$2)',['upload',xlsxProbe.mimeType]),/ENTERPRISE_ASSESS_EVIDENCE_SOURCE_INVALID/u);
      const sourceId=uuid(900),sourceVersionId=uuid(901),requestId=uuid(902),executionToken=uuid(903),requestHash=sha('mapping-xlsx-source-create');
      const receipt=(await database.query(`SELECT (public.enterprise_ai_claim_command($1,$2,$3,'evidence.source.create','mapping-xlsx-source-create',$4,$5,NULL,$6)).*`,[fixture.requester,fixture.org,fixture.workspace,requestId,requestHash,executionToken])).rows[0];
      const source={id:sourceId,org_id:fixture.org,workspace_id:fixture.workspace,display_name:'Synthetic Assess workbook',source_kind:'upload',mime_type:xlsxProbe.mimeType,created_by:fixture.requester};
      const version={id:sourceVersionId,source_id:sourceId,org_id:fixture.org,workspace_id:fixture.workspace,original_filename:xlsxProbe.filename,content_hash:xlsxProbe.contentHash,content_bytes:xlsxProbe.contentBytes,storage_bucket:'source-uploads',storage_path:`${fixture.org}/${fixture.workspace}/enterprise-evidence/${sourceId}.bin`,extracted_text_hash:null,extracted_character_count:null,created_by:fixture.requester};
      const pendingResult={resourceId:sourceId,sourceId,sourceVersionId,version:1,displayName:source.display_name,mimeType:source.mime_type,status:'uploaded',contentHash:version.content_hash,extractedCharacterCount:0,ingestion:'server_managed'};
      await expectDatabaseError(()=>database.query('SELECT public.enterprise_create_evidence_source_record($1::jsonb,$2::jsonb,$3,$4,$5,$6::jsonb)',[json(source),json(version),receipt.id,executionToken,receipt.execution_fence,json(pendingResult)]),/ENTERPRISE_EVIDENCE_UNSUPPORTED_FORMAT/);
      assert.deepEqual((await database.query(`SELECT
        (SELECT count(*)::int FROM public.enterprise_evidence_sources WHERE id=$1) sources,
        (SELECT count(*)::int FROM public.enterprise_evidence_source_versions WHERE id=$2) versions,
        (SELECT count(*)::int FROM public.enterprise_ai_effect_journal WHERE receipt_id=$3) effects,
        (SELECT status FROM public.enterprise_ai_command_receipts WHERE id=$3) status`,[sourceId,sourceVersionId,receipt.id])).rows[0],{sources:0,versions:0,effects:0,status:'claimed'});
      xlsxAuthority={sourceId,sourceVersionId,requestId,executionToken,requestHash,receipt,source,version,pendingResult,classifierBefore};
      pass('MAP-PG-011-predecessor-xlsx-rejection','the real receipt-owned source-create RPC rejects XLSX at the predecessor trigger with zero source, version, or effect rows');
    }
    await transaction(database,name,await readFile(join('supabase/migrations',name),'utf8'));
    if(name===xlsxCorrection){
      const classifierAfter=await classifierAuthority(database);
      const {body_hash:oldClassifierBodyHash,...oldClassifierMetadata}=xlsxAuthority.classifierBefore;
      const {body_hash:newClassifierBodyHash,...newClassifierMetadata}=classifierAfter;
      assert.deepEqual(newClassifierMetadata,oldClassifierMetadata,'The classifier replacement must preserve OID, owner, ACL, config, STRICT/IMMUTABLE/invoker, leakproof, parallel, and language metadata.');
      assert.notEqual(newClassifierBodyHash,oldClassifierBodyHash);
      assert.equal((await database.query('SELECT public.enterprise_assess_v2_source_type($1,$2) value',['upload',xlsxProbe.mimeType])).rows[0].value,'document');
      for(const mimeType of ['text/plain','text/markdown','text/csv','text/vtt','application/x-subrip','text/x-srt','text/meeting-notes','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']){
        assert.equal((await database.query('SELECT public.enterprise_assess_v2_source_type($1,$2) value',['upload',mimeType])).rows[0].value,'document');
      }
      await expectDatabaseError(()=>database.query('SELECT public.enterprise_assess_v2_source_type($1,$2)',['remote_url',xlsxProbe.mimeType]),/ENTERPRISE_ASSESS_EVIDENCE_SOURCE_INVALID/u);
      await expectDatabaseError(()=>database.query('SELECT public.enterprise_assess_v2_source_type($1,$2)',['upload','application/octet-stream']),/ENTERPRISE_ASSESS_EVIDENCE_SOURCE_INVALID/u);
      assert.equal((await database.query('SELECT public.enterprise_assess_v2_source_type(NULL::text,$1) value',[xlsxProbe.mimeType])).rows[0].value,null);
      assert.equal((await database.query('SELECT public.enterprise_assess_v2_source_type($1,NULL::text) value',['upload'])).rows[0].value,null);
      const classifierEvidenceId=uuid(906);
      assert.deepEqual((await database.query('SELECT public.enterprise_build_assess_v2_evidence_submission($1,$2,$3) value',[classifierEvidenceId,'upload',xlsxProbe.mimeType])).rows[0].value,
        {id:classifierEvidenceId,claimIds:[],sourceType:'document',status:'submitted',validated:false});
      pass('MAP-PG-015-xlsx-assess-evidence-classifier','the predecessor rejects XLSX, while the corrected strict immutable invoker classifier accepts XLSX, retains every prior document format, rejects invalid inputs, and builds the exact native evidence contract');
      const created=(await database.query('SELECT public.enterprise_create_evidence_source_record($1::jsonb,$2::jsonb,$3,$4,$5,$6::jsonb) result',[json(xlsxAuthority.source),json(xlsxAuthority.version),xlsxAuthority.receipt.id,xlsxAuthority.executionToken,xlsxAuthority.receipt.execution_fence,json(xlsxAuthority.pendingResult)])).rows[0].result;
      assert.deepEqual([created.sourceId,created.sourceVersionId,created.extractionStatus],[xlsxAuthority.sourceId,xlsxAuthority.sourceVersionId,'pending']);
      const persistedPending=(await database.query(`SELECT version.parser_kind,version.parser_version,version.extraction_status,
        version.storage_bucket,version.storage_path,version.content_hash,version.content_bytes,version.provenance_hash,
        public.enterprise_sha256_jsonb(jsonb_build_object(
          'sourceId',version.source_id,'sourceVersionId',version.id,'version',version.version,
          'organizationId',version.org_id,'workspaceId',version.workspace_id,'mimeType',source.mime_type,
          'contentHash',version.content_hash,'contentBytes',version.content_bytes,'parserKind',version.parser_kind,
          'parserVersion',version.parser_version
        )) expected_provenance_hash
        FROM public.enterprise_evidence_source_versions version JOIN public.enterprise_evidence_sources source ON source.id=version.source_id
        WHERE version.id=$1`,[xlsxAuthority.sourceVersionId])).rows[0];
      assert.equal(persistedPending.parser_kind,'xlsx');
      assert.equal(persistedPending.parser_version,'enterprise-parser-1','Source ingestion keeps the canonical database fallback; mapping re-extraction owns spreadsheet-grid-v1.');
      assert.deepEqual([persistedPending.extraction_status,persistedPending.storage_bucket,persistedPending.storage_path,persistedPending.content_hash,Number(persistedPending.content_bytes)],['pending','source-uploads',xlsxAuthority.version.storage_path,xlsxProbe.contentHash,xlsxProbe.contentBytes]);
      assert.match(persistedPending.provenance_hash,/^[0-9a-f]{64}$/u);assert.equal(persistedPending.provenance_hash,persistedPending.expected_provenance_hash);
      const finalResult={resourceId:xlsxAuthority.sourceId,sourceId:xlsxAuthority.sourceId,sourceVersionId:xlsxAuthority.sourceVersionId,version:1,displayName:xlsxAuthority.source.display_name,mimeType:xlsxProbe.mimeType,status:'review',contentHash:xlsxProbe.contentHash,extractedCharacterCount:xlsxProbe.extractedCharacterCount,ingestion:'server_managed'};
      await database.query('SELECT public.enterprise_record_source_extraction_success($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',[xlsxAuthority.sourceVersionId,fixture.org,fixture.workspace,xlsxProbe.extractedTextHash,xlsxProbe.extractedCharacterCount,xlsxAuthority.receipt.id,xlsxAuthority.executionToken,xlsxAuthority.receipt.execution_fence,json(finalResult)]);
      await database.query('SELECT public.enterprise_ai_complete_command($1,$2,$3,$4,$5,$6::jsonb,$7)',[xlsxAuthority.receipt.id,fixture.org,fixture.workspace,xlsxAuthority.executionToken,xlsxAuthority.receipt.execution_fence,json(finalResult),xlsxAuthority.sourceId]);
      const replay=(await database.query(`SELECT (public.enterprise_ai_claim_command($1,$2,$3,'evidence.source.create','mapping-xlsx-source-create',$4,$5,NULL,$6)).*`,[fixture.requester,fixture.org,fixture.workspace,uuid(904),xlsxAuthority.requestHash,uuid(905)])).rows[0];
      assert.deepEqual([replay.status,replay.response],['committed',finalResult]);
      const committed=(await database.query(`SELECT
        (SELECT count(*)::int FROM public.enterprise_evidence_sources WHERE id=$1) sources,
        (SELECT count(*)::int FROM public.enterprise_evidence_source_versions WHERE id=$2) versions,
        (SELECT count(*)::int FROM public.enterprise_ai_effect_journal WHERE receipt_id=$3) effects,
        (SELECT extraction_status FROM public.enterprise_evidence_source_versions WHERE id=$2) extraction_status,
        (SELECT extracted_text_hash FROM public.enterprise_evidence_source_versions WHERE id=$2) extracted_text_hash,
        (SELECT extracted_character_count FROM public.enterprise_evidence_source_versions WHERE id=$2) extracted_character_count`,[xlsxAuthority.sourceId,xlsxAuthority.sourceVersionId,xlsxAuthority.receipt.id])).rows[0];
      assert.deepEqual(committed,{sources:1,versions:1,effects:2,extraction_status:'parsed',extracted_text_hash:xlsxProbe.extractedTextHash,extracted_character_count:xlsxProbe.extractedCharacterCount});
      pass('MAP-PG-012-xlsx-receipt-ingestion-replay','the corrected trigger persists one XLSX source, canonical extraction provenance, terminal receipt, and side-effect-free exact replay');
    }
  }
  assert.ok(fixture);
  assert.equal((await database.query('SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton IS TRUE')).rows[0].migration_tip,expectedFullChainTip);
  assert.equal((await database.query(`SELECT pg_get_expr(conbin,conrelid,false) expression FROM pg_constraint
    WHERE conrelid='public.hosted_pilot_environment_identity'::regclass
      AND conname='hosted_pilot_environment_identity_migration_tip_check'`)).rows[0].expression,
    `(migration_tip = '${expectedFullChainTip}'::text)`);
  const upgradedFlag=(await database.query('SELECT assess_document_mapping_enabled FROM public.enterprise_transcript_workspace_flags WHERE org_id=$1 AND workspace_id=$2',[fixture.org,fixture.workspace])).rows[0];
  assert.equal(upgradedFlag.assess_document_mapping_enabled,false);
  pass('MAP-PG-001-populated-default-off','pre-existing workspace remains disabled after forward migration');

  const retainedKinds=(await database.query(`SELECT source.mime_type,version.parser_kind
    FROM public.enterprise_evidence_sources source
    JOIN public.enterprise_evidence_source_versions version ON version.source_id=source.id
    WHERE source.id=ANY($1::uuid[]) ORDER BY source.mime_type`,[
      fixture.sources.filter(item=>['text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(item.mimeType)).map(item=>item.sourceId),
    ])).rows;
  assert.deepEqual(retainedKinds,[
    {mime_type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',parser_kind:'docx'},
    {mime_type:'text/csv',parser_kind:'csv'},
    {mime_type:'text/plain',parser_kind:'text_native'},
  ]);
  const retainedRuntimeFormats=[
    {mimeType:'text/plain',extension:'txt',parserKind:'text_native'},
    {mimeType:'text/csv',extension:'csv',parserKind:'csv'},
    {mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',extension:'docx',parserKind:'docx'},
  ];
  for(const [index,format] of retainedRuntimeFormats.entries()){
    const sourceId=uuid(970+index*2),sourceVersionId=uuid(971+index*2),token=uuid(980+index),requestHash=sha(`retained-runtime-${format.extension}`);
    const receipt=(await database.query(`SELECT (public.enterprise_ai_claim_command($1,$2,$3,'evidence.source.create',$4,$5,$6,NULL,$7)).*`,[fixture.requester,fixture.org,fixture.workspace,`mapping-retained-${format.extension}`,uuid(990+index),requestHash,token])).rows[0];
    const source={id:sourceId,org_id:fixture.org,workspace_id:fixture.workspace,display_name:`Retained runtime ${format.extension}`,source_kind:'upload',mime_type:format.mimeType,created_by:fixture.requester};
    const version={id:sourceVersionId,source_id:sourceId,org_id:fixture.org,workspace_id:fixture.workspace,original_filename:`retained.${format.extension}`,content_hash:sha(`retained-${format.extension}`),content_bytes:64,storage_bucket:'source-uploads',storage_path:`${fixture.org}/${fixture.workspace}/enterprise-evidence/${sourceId}.bin`,extracted_text_hash:null,extracted_character_count:null,created_by:fixture.requester};
    await database.query('BEGIN');
    try{
      await database.query('SELECT public.enterprise_create_evidence_source_record($1::jsonb,$2::jsonb,$3,$4,$5,$6::jsonb)',[json(source),json(version),receipt.id,token,receipt.execution_fence,json({sourceId,sourceVersionId,status:'uploaded'})]);
      const persisted=(await database.query(`SELECT version.parser_kind,version.parser_version,version.provenance_hash,
        public.enterprise_sha256_jsonb(jsonb_build_object(
          'sourceId',version.source_id,'sourceVersionId',version.id,'version',version.version,
          'organizationId',version.org_id,'workspaceId',version.workspace_id,'mimeType',source.mime_type,
          'contentHash',version.content_hash,'contentBytes',version.content_bytes,'parserKind',version.parser_kind,
          'parserVersion',version.parser_version
        )) expected_provenance_hash
        FROM enterprise_evidence_source_versions version JOIN enterprise_evidence_sources source ON source.id=version.source_id WHERE version.id=$1`,[sourceVersionId])).rows[0];
      assert.deepEqual(persisted,{parser_kind:format.parserKind,parser_version:'enterprise-parser-1',provenance_hash:persisted.expected_provenance_hash,expected_provenance_hash:persisted.expected_provenance_hash});
      assert.match(persisted.provenance_hash,/^[0-9a-f]{64}$/u);
    }finally{await database.query('ROLLBACK')}
    assert.deepEqual((await database.query(`SELECT
      (SELECT count(*)::int FROM enterprise_evidence_sources WHERE id=$1) sources,
      (SELECT count(*)::int FROM enterprise_evidence_source_versions WHERE id=$2) versions,
      (SELECT count(*)::int FROM enterprise_ai_effect_journal WHERE receipt_id=$3) effects`,[sourceId,sourceVersionId,receipt.id])).rows[0],{sources:0,versions:0,effects:0});
  }
  const malformedSourceId=uuid(960),malformedVersionId=uuid(961),malformedToken=uuid(962),malformedHash=sha('malformed-xlsx-request');
  const malformedReceipt=(await database.query(`SELECT (public.enterprise_ai_claim_command($1,$2,$3,'evidence.source.create','mapping-xlsx-malformed',$4,$5,NULL,$6)).*`,[fixture.requester,fixture.org,fixture.workspace,uuid(963),malformedHash,malformedToken])).rows[0];
  const malformedSource={id:malformedSourceId,org_id:fixture.org,workspace_id:fixture.workspace,display_name:'Malformed synthetic workbook',source_kind:'upload',mime_type:xlsxProbe.mimeType,created_by:fixture.requester};
  const malformedVersion={id:malformedVersionId,source_id:malformedSourceId,org_id:fixture.org,workspace_id:fixture.workspace,original_filename:'malformed.xlsx',content_hash:xlsxProbe.malformedContentHash,content_bytes:xlsxProbe.malformedContentBytes,storage_bucket:'source-uploads',storage_path:`${fixture.org}/${fixture.workspace}/enterprise-evidence/${malformedSourceId}.bin`,extracted_text_hash:null,extracted_character_count:null,created_by:fixture.requester};
  await database.query('SELECT public.enterprise_create_evidence_source_record($1::jsonb,$2::jsonb,$3,$4,$5,$6::jsonb)',[json(malformedSource),json(malformedVersion),malformedReceipt.id,malformedToken,malformedReceipt.execution_fence,json({sourceId:malformedSourceId,sourceVersionId:malformedVersionId,status:'uploaded'})]);
  const malformedResult={resourceId:malformedSourceId,sourceId:malformedSourceId,sourceVersionId:malformedVersionId,version:1,displayName:malformedSource.display_name,mimeType:xlsxProbe.mimeType,status:'failed',failureCode:xlsxProbe.malformedFailureCode,extractedCharacterCount:0,ingestion:'server_managed'};
  await database.query('SELECT public.enterprise_record_source_extraction_failure($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[malformedVersionId,fixture.org,fixture.workspace,xlsxProbe.malformedFailureCode,malformedReceipt.id,malformedToken,malformedReceipt.execution_fence,json(malformedResult)]);
  await database.query('SELECT public.enterprise_ai_complete_command($1,$2,$3,$4,$5,$6::jsonb,$7)',[malformedReceipt.id,fixture.org,fixture.workspace,malformedToken,malformedReceipt.execution_fence,json(malformedResult),malformedSourceId]);
  const malformedReplay=(await database.query(`SELECT (public.enterprise_ai_claim_command($1,$2,$3,'evidence.source.create','mapping-xlsx-malformed',$4,$5,NULL,$6)).*`,[fixture.requester,fixture.org,fixture.workspace,uuid(964),malformedHash,uuid(965)])).rows[0];
  assert.deepEqual([malformedReplay.status,malformedReplay.response],['committed',malformedResult]);
  assert.deepEqual((await database.query(`SELECT version.extraction_status,version.extraction_failure_code,
    (SELECT count(*)::int FROM enterprise_ai_effect_journal WHERE receipt_id=$2) effects,
    (SELECT count(*)::int FROM enterprise_evidence_source_versions WHERE source_id=$1) versions
    FROM enterprise_evidence_source_versions version WHERE version.id=$3`,[malformedSourceId,malformedReceipt.id,malformedVersionId])).rows[0],{extraction_status:'failed_malformed',extraction_failure_code:'MALFORMED_SOURCE',effects:2,versions:1});
  pass('MAP-PG-014-xlsx-malformed-lifecycle','canonical parser failure classification drives one receipt-owned failed_malformed transition and exact replay without duplicate effects');
  const foreignOrg=uuid(998),foreignWorkspace=uuid(999);
  await database.query("INSERT INTO public.organizations(id,name,slug) VALUES($1,'XLSX foreign synthetic','xlsx-foreign-synthetic')",[foreignOrg]);
  await database.query("INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,'XLSX foreign workspace','xlsx-foreign')",[foreignWorkspace,foreignOrg]);
  const rejectReceiptOwnedSource=async({ordinal,label,sourcePatch={},versionPatch={},fenceOffset=0,pattern})=>{
    const sourceId=uuid(910+ordinal*3),sourceVersionId=uuid(911+ordinal*3),token=uuid(912+ordinal*3),requestHash=sha(`xlsx-negative-${label}`);
    const receipt=(await database.query(`SELECT (public.enterprise_ai_claim_command($1,$2,$3,'evidence.source.create',$4,$5,$6,NULL,$7)).*`,[fixture.requester,fixture.org,fixture.workspace,`mapping-xlsx-${label}`,uuid(930+ordinal),requestHash,token])).rows[0];
    const source={id:sourceId,org_id:fixture.org,workspace_id:fixture.workspace,display_name:`Rejected ${label}`,source_kind:'upload',mime_type:xlsxProbe.mimeType,created_by:fixture.requester,...sourcePatch};
    const version={id:sourceVersionId,source_id:sourceId,org_id:fixture.org,workspace_id:fixture.workspace,original_filename:`${label}.xlsx`,content_hash:sha(`xlsx-${label}`),content_bytes:64,storage_bucket:'source-uploads',storage_path:`${fixture.org}/${fixture.workspace}/enterprise-evidence/${sourceId}.bin`,extracted_text_hash:null,extracted_character_count:null,created_by:fixture.requester,...versionPatch};
    const pending={resourceId:sourceId,sourceId,sourceVersionId,status:'uploaded',extractedCharacterCount:0};
    await expectDatabaseError(()=>database.query('SELECT public.enterprise_create_evidence_source_record($1::jsonb,$2::jsonb,$3,$4,$5,$6::jsonb)',[json(source),json(version),receipt.id,token,Number(receipt.execution_fence)+fenceOffset,json(pending)]),pattern);
    assert.deepEqual((await database.query(`SELECT
      (SELECT count(*)::int FROM public.enterprise_evidence_sources WHERE id=$1) sources,
      (SELECT count(*)::int FROM public.enterprise_evidence_source_versions WHERE id=$2) versions,
      (SELECT count(*)::int FROM public.enterprise_ai_effect_journal WHERE receipt_id=$3) effects,
      (SELECT status FROM public.enterprise_ai_command_receipts WHERE id=$3) status`,[sourceId,sourceVersionId,receipt.id])).rows[0],{sources:0,versions:0,effects:0,status:'claimed'});
  };
  await rejectReceiptOwnedSource({ordinal:0,label:'unsupported',sourcePatch:{mime_type:'application/octet-stream'},pattern:/mime_type|UNSUPPORTED_FORMAT|check constraint/u});
  await rejectReceiptOwnedSource({ordinal:1,label:'wrong-bucket',versionPatch:{storage_bucket:'public'},pattern:/ENTERPRISE_EVIDENCE_STORAGE_BINDING_INVALID/u});
  await rejectReceiptOwnedSource({ordinal:2,label:'wrong-path',versionPatch:{storage_path:`${fixture.org}/${fixture.workspace}/wrong/path.bin`},pattern:/ENTERPRISE_EVIDENCE_STORAGE_BINDING_INVALID/u});
  await rejectReceiptOwnedSource({ordinal:3,label:'wrong-scope',sourcePatch:{org_id:foreignOrg,workspace_id:foreignWorkspace},versionPatch:{org_id:foreignOrg,workspace_id:foreignWorkspace,storage_path:`${foreignOrg}/${foreignWorkspace}/enterprise-evidence/${uuid(919)}.bin`},pattern:/ENTERPRISE_AI_STALE_EXECUTION_FENCE/u});
  await rejectReceiptOwnedSource({ordinal:4,label:'stale-fence',fenceOffset:1,pattern:/ENTERPRISE_AI_STALE_EXECUTION_FENCE/u});
  const spoofSourceId=uuid(925),spoofVersionId=uuid(926),spoofToken=uuid(927);
  const spoofReceipt=(await database.query(`SELECT (public.enterprise_ai_claim_command($1,$2,$3,'evidence.source.create','mapping-xlsx-spoofed-parser',$4,$5,NULL,$6)).*`,[fixture.requester,fixture.org,fixture.workspace,uuid(928),sha('xlsx-spoofed-parser'),spoofToken])).rows[0];
  await database.query('BEGIN');
  try{
    const spoofSource={id:spoofSourceId,org_id:fixture.org,workspace_id:fixture.workspace,display_name:'Spoofed parser metadata',source_kind:'upload',mime_type:xlsxProbe.mimeType,created_by:fixture.requester};
    const spoofVersion={id:spoofVersionId,source_id:spoofSourceId,org_id:foreignOrg,workspace_id:foreignWorkspace,original_filename:'spoof.xlsx',content_hash:sha('spoof-xlsx'),content_bytes:64,storage_bucket:'source-uploads',storage_path:`${fixture.org}/${fixture.workspace}/enterprise-evidence/${spoofSourceId}.bin`,extracted_text_hash:null,extracted_character_count:null,parser_kind:'text_native',parser_version:'attacker-parser',created_by:fixture.requester};
    await database.query('SELECT public.enterprise_create_evidence_source_record($1::jsonb,$2::jsonb,$3,$4,$5,$6::jsonb)',[json(spoofSource),json(spoofVersion),spoofReceipt.id,spoofToken,spoofReceipt.execution_fence,json({sourceId:spoofSourceId,sourceVersionId:spoofVersionId,status:'uploaded'})]);
    assert.deepEqual((await database.query('SELECT org_id,workspace_id,parser_kind,parser_version FROM public.enterprise_evidence_source_versions WHERE id=$1',[spoofVersionId])).rows[0],{org_id:fixture.org,workspace_id:fixture.workspace,parser_kind:'xlsx',parser_version:'enterprise-parser-1'});
  }finally{await database.query('ROLLBACK')}
  assert.deepEqual((await database.query(`SELECT
    (SELECT count(*)::int FROM public.enterprise_evidence_sources WHERE id=$1) sources,
    (SELECT count(*)::int FROM public.enterprise_evidence_source_versions WHERE id=$2) versions,
    (SELECT count(*)::int FROM public.enterprise_ai_effect_journal WHERE receipt_id=$3) effects`,[spoofSourceId,spoofVersionId,spoofReceipt.id])).rows[0],{sources:0,versions:0,effects:0});
  pass('MAP-PG-013-xlsx-ingestion-countercontrols','retained text/CSV/DOCX parsers remain stable and unsupported MIME, bucket, path, scope, stale fence, and spoofed parser inputs fail closed or normalize without residual effects');

  await database.query(`INSERT INTO public.role_capabilities(role_id,capability_key) SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING`,[fixture.routeRole,['assess.v2.read','assess.v2.draft.write','evidence.write','evidence.review','transcript.assess.apply','transcript.sources.read']]);
  const authorizationVersion=Number((await database.query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2',[fixture.org,fixture.requester])).rows[0].version);
  assert.ok(authorizationVersion>0);
  let sequence=1000;
  const nextUuid=()=>uuid(sequence++);
  const caseId=nextUuid(),versionId=nextUuid(),primitiveId=nextUuid(),assetId=nextUuid(),interactionId=nextUuid(),oldEvidenceId=nextUuid();
  const fact=(fieldId,value,evidenceIds=[])=>({fieldId,value,status:value===null?'unknown':'known',evidenceIds,source:'user'});
  const agentNecessity={irreducibleAmbiguity:fact('agent.irreducibleAmbiguity',null),adaptiveNextStep:fact('agent.adaptiveNextStep',null),toolOrPathSelection:fact('agent.toolOrPathSelection',null),incrementalValue:fact('agent.incrementalValue',null),controllable:fact('agent.controllable',null)};
  const primitive={id:primitiveId,type:'Investigate',name:'Manual review',description:'Review uncertain requests',inputs:[],outputs:[],volumeShare:null,manualEffort:null,rules:[],exceptionIds:[],evidenceIds:[oldEvidenceId],facts:{ambiguityCharacterized:fact('ambiguityCharacterized',null,[oldEvidenceId])},businessDisposition:'Human-Led'};
  const asset={id:assetId,name:'Case system',strategicLifespan:'unknown',technicalHealth:'unknown',businessCriticality:'high',ownershipModel:'shared',vendorRoadmap:'unknown',operatingStability:'stable',accountableOwner:null,evidenceIds:[]};
  const interaction={id:interactionId,assetId,primitiveId,operationName:'Read case',mode:'read',dataClassification:'Internal',facts:{interfaceAvailable:null,operationCovered:null,apiDocumented:null,machineIdentity:null,leastPrivilege:null,dataQuality:null,dataClassified:null,auditable:null,idempotent:null,compensatable:null,rollback:null,testEnvironment:null,monitored:null,uiStable:null,eventSemantics:null,errorContract:null,capacityKnown:null,accountableOwner:null,highImpact:false,financialAction:false,untrustedContentWithTools:false},evidenceIds:[]};
  const sourceSnapshot={fixture:'mapping-source-snapshot'};const importedFacts=[fact('fixture.imported','retained')];
  await database.query(`INSERT INTO public.assess_v2_cases(id,org_id,workspace_id,process_id,owner_id,status,version,head_version_id) VALUES($1,$2,$3,$4,$5,'draft',1,NULL)`,[caseId,fixture.org,fixture.workspace,fixture.process,fixture.requester]);
  await database.query(`INSERT INTO public.assess_v2_case_versions(id,case_id,org_id,workspace_id,version,name,description,agent_necessity,source_kind,source_snapshot,imported_facts,created_by) VALUES($1,$2,$3,$4,1,'Mapping fixture','Manual baseline description',$5::jsonb,'create',$6::jsonb,$7::jsonb,$8)`,[versionId,caseId,fixture.org,fixture.workspace,json(agentNecessity),json(sourceSnapshot),json(importedFacts),fixture.requester]);
  await database.query('UPDATE public.assess_v2_cases SET head_version_id=$1 WHERE id=$2',[versionId,caseId]);
  await database.query('INSERT INTO public.assess_v2_primitives(id,version_id,case_id,org_id,workspace_id,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[primitiveId,versionId,caseId,fixture.org,fixture.workspace,json(primitive)]);
  await database.query('INSERT INTO public.assess_v2_application_assets(id,version_id,case_id,org_id,workspace_id,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[assetId,versionId,caseId,fixture.org,fixture.workspace,json(asset)]);
  await database.query('INSERT INTO public.assess_v2_application_interactions(id,version_id,case_id,org_id,workspace_id,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[interactionId,versionId,caseId,fixture.org,fixture.workspace,json(interaction)]);
  await database.query('INSERT INTO public.assess_v2_evidence_links(id,version_id,case_id,org_id,workspace_id,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[oldEvidenceId,versionId,caseId,fixture.org,fixture.workspace,json({id:oldEvidenceId,claimIds:['primitive.ambiguityCharacterized'],sourceType:'document',status:'submitted',validated:false})]);

  const selected=[fixture.sources[0],{sourceId:xlsxAuthority.sourceId,sourceVersionId:xlsxAuthority.sourceVersionId,mimeType:xlsxProbe.mimeType,extension:'xlsx',parsed:true}];const setId=nextUuid(),setVersionId=nextUuid(),bundleId=nextUuid(),bundleVersionId=nextUuid();
  const selectedVersionRows=new Map((await database.query(`SELECT id,parser_version,extracted_text_hash,extracted_character_count
    FROM public.enterprise_evidence_source_versions WHERE id=ANY($1::uuid[])`,[selected.map(item=>item.sourceVersionId)])).rows.map(row=>[row.id,row]));
  const selectedCharacterCount=selected.reduce((total,item)=>total+Number(selectedVersionRows.get(item.sourceVersionId).extracted_character_count),0);
  await database.query(`INSERT INTO public.enterprise_source_sets(id,org_id,workspace_id,owner_module,display_label,description,current_version,status,created_by) VALUES($1,$2,$3,'assess','Mapping sources','Synthetic supporting documents',1,'locked',$4)`,[setId,fixture.org,fixture.workspace,fixture.requester]);
  await database.query(`INSERT INTO public.enterprise_source_set_versions(id,source_set_id,org_id,workspace_id,version,purpose,manifest_hash,source_count,extracted_character_count,status,created_by) VALUES($1,$2,$3,$4,1,'Synthetic mapping verification',$5,2,$6,'locked',$7)`,[setVersionId,setId,fixture.org,fixture.workspace,sha('set'),selectedCharacterCount,fixture.requester]);
  for(let index=0;index<selected.length;index+=1){const source=selected[index];const row=(await database.query('SELECT content_hash,extracted_text_hash,extracted_character_count FROM public.enterprise_evidence_source_versions WHERE id=$1',[source.sourceVersionId])).rows[0];await database.query(`INSERT INTO public.enterprise_source_set_version_items(source_set_version_id,source_set_id,source_version_id,source_id,org_id,workspace_id,ordinal,semantic_role,content_hash,extracted_text_hash,extracted_character_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[setVersionId,setId,source.sourceVersionId,source.sourceId,fixture.org,fixture.workspace,index+1,index?'contradictory':'primary',row.content_hash,row.extracted_text_hash,Number(row.extracted_character_count)]);}
  await database.query(`INSERT INTO public.enterprise_module_input_bundles(id,org_id,workspace_id,owner_module,current_version,created_by) VALUES($1,$2,$3,'assess',1,$4)`,[bundleId,fixture.org,fixture.workspace,fixture.requester]);
  await database.query(`INSERT INTO public.enterprise_module_input_bundle_versions(id,input_bundle_id,org_id,workspace_id,version,bundle_hash,status,created_by) VALUES($1,$2,$3,$4,1,$5,'locked',$6)`,[bundleVersionId,bundleId,fixture.org,fixture.workspace,sha('bundle'),fixture.requester]);
  await database.query(`INSERT INTO public.enterprise_module_input_bundle_items(input_bundle_version_id,input_bundle_id,org_id,workspace_id,ordinal,item_kind,source_set_version_id,source_set_id,resource_hash,declared_purpose) VALUES($1,$2,$3,$4,1,'source_set',$5,$6,$7,'Assess mapping')`,[bundleVersionId,bundleId,fixture.org,fixture.workspace,setVersionId,setId,sha('set')]);
  const routeId=nextUuid();await database.query(`INSERT INTO public.enterprise_ai_capability_routes(id,org_id,workspace_id,provider_config_id,capability,model,enabled,allowed_roles,created_by,updated_by) VALUES($1,$2,$3,$4,'assess.evidence.extract','fixture-model',true,ARRAY[$5::text],$6,$6)`,[routeId,fixture.org,fixture.workspace,fixture.provider,fixture.routeRole,fixture.requester]);

  const receipt=async(commandType,label)=>{const requestId=nextUuid(),token=nextUuid();return (await database.query(`SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,NULL,$8)).*`,[fixture.requester,fixture.org,fixture.workspace,commandType,`mapping-${label}`,requestId,sha(`${commandType}:${label}`),token])).rows[0]};
  const reclaimReceipt=async(commandType,label)=>{const requestId=nextUuid(),token=nextUuid();return (await database.query(`SELECT (public.enterprise_ai_claim_command($1,$2,$3,$4,$5,$6,$7,NULL,$8)).*`,[fixture.requester,fixture.org,fixture.workspace,commandType,`mapping-${label}`,requestId,sha(`${commandType}:${label}`),token])).rows[0]};
  const sourceBindings=selected.map((source,index)=>{const persisted=selectedVersionRows.get(source.sourceVersionId);return {sourceSetId:setId,sourceSetVersionId:setVersionId,expectedSourceSetVersion:1,sourceId:source.sourceId,sourceVersionId:source.sourceVersionId,parserVersion:index?xlsxProbe.parserVersion:persisted.parser_version,normalizedHash:index?xlsxProbe.extractedTextHash:persisted.extracted_text_hash,extractedByteCount:index?xlsxProbe.extractedByteCount:Number(persisted.extracted_character_count),sheetCount:index?xlsxProbe.sheetCount:0,cellCount:index?xlsxProbe.cellCount:0,warnings:index?xlsxProbe.warnings:[]}});
  const mappingWarnings=sourceBindings.flatMap(binding=>binding.warnings.map(warning=>`${binding.sourceVersionId}:${warning}`));
  const target=(selectorId,values)=>({selectorId,catalogId:values.catalogId,caseId,caseVersion:1,assessSchemaVersion:'assess-v2-schema-2026-07',currentValueHash:'f'.repeat(64),...values});
  const claimRun=async({runId,catalogId,targets,claimReceipt})=>(await database.query(`SELECT public.enterprise_claim_assess_document_mapping_run_v1($1,$2,$3,1,'assess-v2-schema-2026-07',$4,$5::jsonb,$6,$7,1,$8::jsonb,$9,$10,'openai','fixture-model','assess-supporting-document-map-v1',$11,$12,$13,$14,$15,$16,$17) result`,[runId,catalogId,caseId,'f'.repeat(64),json(targets),bundleId,bundleVersionId,json(sourceBindings),routeId,fixture.provider,fixture.requester,fixture.org,fixture.workspace,authorizationVersion,claimReceipt.id,claimReceipt.execution_token,claimReceipt.execution_fence])).rows[0].result;

  const disabledReceipt=await receipt('assess.document-map.analyze','disabled');const disabledCatalog=nextUuid();
  await expectDatabaseError(()=>claimRun({runId:nextUuid(),catalogId:disabledCatalog,targets:[target(nextUuid(),{catalogId:disabledCatalog,targetKind:'evidence_only',operation:'link_evidence',fieldId:'evidence',label:'Evidence',contextLabel:'Fixture',valueType:'evidence',currentValue:null,manual:false})],claimReceipt:disabledReceipt}),/ENTERPRISE_ASSESS_DOCUMENT_MAPPING_FEATURE_DISABLED/);
  assert.equal(Number((await database.query('SELECT count(*) n FROM public.enterprise_assess_document_mapping_runs')).rows[0].n),0);
  await database.query('UPDATE public.enterprise_transcript_workspace_flags SET assess_document_mapping_enabled=true WHERE org_id=$1 AND workspace_id=$2',[fixture.org,fixture.workspace]);
  pass('MAP-PG-002-default-off-zero-effects','disabled claim rejects before mapping persistence');

  const bridge=await verifyAssessMappingClaimPostgresBridge({database,fixture,caseId,routeId,authorizationVersion,nextUuid,
    draft:{caseId,name:'Mapping fixture',description:'Manual baseline description',primitives:[primitive],edges:[],decisionPoints:[],exceptionPaths:[],applicationAssets:[asset],interactions:[interaction],evidenceLinks:[{id:oldEvidenceId,claimIds:['primitive.ambiguityCharacterized'],sourceType:'document',status:'submitted',validated:false}],agentNecessity,candidateEvaluations:[],gateResults:[],controlRequirements:[],modernizationDispositions:[]}});
  assert.ok(bridge.targets>1);assert.equal(bridge.mutants,14);
  pass('MAP-PG-016-real-claim-edge-contract','production TXT parser, request binding and catalog accept real SQL hash/null semantics; fourteen response mutations and two foreign scopes reject without secret/network/provider effects');

  const zeroRun=nextUuid(),zeroCatalog=nextUuid(),zeroReceipt=await receipt('assess.document-map.analyze','zero');const zeroTargets=[target(nextUuid(),{catalogId:zeroCatalog,targetKind:'evidence_only',operation:'link_evidence',fieldId:'evidence',label:'Evidence only',contextLabel:'Fixture',valueType:'evidence',currentValue:null,manual:false})];
  const zeroClaim=await claimRun({runId:zeroRun,catalogId:zeroCatalog,targets:zeroTargets,claimReceipt:zeroReceipt});assert.notEqual(zeroClaim.catalogHash,'f'.repeat(64));
  const zeroAnalyzed=zeroClaim.sourceBindings.map(item=>({sourceId:item.sourceId,sourceVersionId:item.sourceVersionId,parserVersion:item.parserVersion,extractedByteCount:item.extractedByteCount,sheetCount:item.sheetCount,cellCount:item.cellCount,warnings:item.warnings}));
  const zeroSafe={resourceId:zeroRun,runId:zeroRun,catalogId:zeroCatalog,catalogHash:zeroClaim.catalogHash,targetCount:1,sourceCount:2,proposalCount:0,sourceBindings:zeroClaim.sourceBindings,analyzedSources:zeroAnalyzed,warnings:mappingWarnings};
  await database.query(`SELECT public.enterprise_stage_assess_document_mapping_result_v1($1,$2,'[]'::jsonb,$3::jsonb,$4,0,0,1,$5,$6,$7,$8)`,[zeroRun,zeroCatalog,json(zeroSafe),sha('zero-output'),sha('zero-stage'),zeroReceipt.id,zeroReceipt.execution_token,zeroReceipt.execution_fence]);
  const zeroCommit=(await database.query('SELECT public.enterprise_commit_assess_document_mapping_result_v1($1,$2,$3,$4) result',[zeroRun,zeroReceipt.id,zeroReceipt.execution_token,zeroReceipt.execution_fence])).rows[0].result;assert.equal(zeroCommit.proposalCount,0);
  pass('MAP-PG-003-zero-proposals','grounded zero-candidate provider output commits without fabrication');

  const recoveryRun=nextUuid(),recoveryCatalog=nextUuid(),recoveryReceipt=await receipt('assess.document-map.analyze','staged-recovery');const recoveryTargets=[target(nextUuid(),{catalogId:recoveryCatalog,targetKind:'evidence_only',operation:'link_evidence',fieldId:'evidence',label:'Recovery evidence',contextLabel:'Fixture',valueType:'evidence',currentValue:null,manual:false})];
  const recoveryClaim=await claimRun({runId:recoveryRun,catalogId:recoveryCatalog,targets:recoveryTargets,claimReceipt:recoveryReceipt});const recoveryAnalyzed=recoveryClaim.sourceBindings.map(item=>({sourceId:item.sourceId,sourceVersionId:item.sourceVersionId,parserVersion:item.parserVersion,extractedByteCount:item.extractedByteCount,sheetCount:item.sheetCount,cellCount:item.cellCount,warnings:item.warnings}));const recoverySafe={resourceId:recoveryRun,runId:recoveryRun,catalogId:recoveryCatalog,catalogHash:recoveryClaim.catalogHash,targetCount:1,sourceCount:2,proposalCount:0,sourceBindings:recoveryClaim.sourceBindings,analyzedSources:recoveryAnalyzed,warnings:mappingWarnings};
  await database.query(`SELECT public.enterprise_stage_assess_document_mapping_result_v1($1,$2,'[]'::jsonb,$3::jsonb,$4,0,0,1,$5,$6,$7,$8)`,[recoveryRun,recoveryCatalog,json(recoverySafe),sha('recovery-output'),sha('recovery-stage'),recoveryReceipt.id,recoveryReceipt.execution_token,recoveryReceipt.execution_fence]);
  await database.query(`UPDATE public.enterprise_ai_command_receipts SET lease_expires_at=statement_timestamp()-interval '1 second' WHERE id=$1`,[recoveryReceipt.id]);const reacquired=await reclaimReceipt('assess.document-map.analyze','staged-recovery');assert.equal(Number(reacquired.execution_fence),Number(recoveryReceipt.execution_fence)+1);const recoveryReplay=await claimRun({runId:recoveryRun,catalogId:recoveryCatalog,targets:recoveryTargets,claimReceipt:reacquired});assert.equal(recoveryReplay.recoveryMode,'finalize_staged');assert.equal(recoveryReplay.ownsExecution,false);assert.deepEqual(recoveryReplay.targets,recoveryClaim.targets);assert.deepEqual(recoveryReplay.sourceBindings,recoveryClaim.sourceBindings);const recovered=(await database.query('SELECT public.enterprise_commit_assess_document_mapping_result_v1($1,$2,$3,$4) result',[recoveryRun,reacquired.id,reacquired.execution_token,reacquired.execution_fence])).rows[0].result;assert.equal(recovered.status,'committed');assert.equal(Number((await database.query('SELECT count(*) n FROM public.enterprise_ai_effect_journal WHERE receipt_id=$1',[reacquired.id])).rows[0].n),1);pass('MAP-PG-010-staged-lease-recovery','expired staged lease resumes exact persisted targets and sources under the re-acquired fence without provider replay');

  const failedRun=nextUuid(),failedCatalog=nextUuid(),failedReceipt=await receipt('assess.document-map.analyze','terminal-failure');const failedTargets=[target(nextUuid(),{catalogId:failedCatalog,targetKind:'evidence_only',operation:'link_evidence',fieldId:'evidence',label:'Evidence only',contextLabel:'Fixture',valueType:'evidence',currentValue:null,manual:false})];
  await claimRun({runId:failedRun,catalogId:failedCatalog,targets:failedTargets,claimReceipt:failedReceipt});
  const failArgs=[failedRun,json({failureCode:'BUDGET_EXHAUSTED'}),fixture.requester,fixture.org,fixture.workspace,authorizationVersion,failedReceipt.id,failedReceipt.execution_token,failedReceipt.execution_fence];
  await expectDatabaseError(()=>database.query('SELECT public.enterprise_fail_assess_document_mapping_run_v1($1,$2::jsonb,$3,$4,$5,$6,$7,$8,$9)',[failedRun,json({}),...failArgs.slice(2)]),/ENTERPRISE_ASSESS_DOCUMENT_MAPPING_FAILURE_INVALID/);
  await expectDatabaseError(()=>database.query('SELECT public.enterprise_fail_assess_document_mapping_run_v1($1,$2::jsonb,$3,$4,$5,$6,$7,$8,$9)',[failedRun,json({failureCode:'PROVIDER_UNAVAILABLE'}),...failArgs.slice(2)]),/ENTERPRISE_ASSESS_DOCUMENT_MAPPING_FAILURE_INVALID/);
  await expectDatabaseError(()=>database.query('SELECT public.enterprise_fail_assess_document_mapping_run_v1($1,$2::jsonb,$3,$4,$5,$6,$7,$8,$9)',[failedRun,json({failureCode:'BUDGET_EXHAUSTED',message:'must not persist'}),...failArgs.slice(2)]),/ENTERPRISE_ASSESS_DOCUMENT_MAPPING_FAILURE_INVALID/);
  await expectDatabaseError(()=>database.query('SELECT public.enterprise_fail_assess_document_mapping_run_v1($1,$2::jsonb,$3,$4,$5,$6,$7,$8,$9)',[failedRun,failArgs[1],...failArgs.slice(2,8),Number(failedReceipt.execution_fence)+1]),/ENTERPRISE_AI_STALE_EXECUTION_FENCE/);
  const failed=(await database.query('SELECT public.enterprise_fail_assess_document_mapping_run_v1($1,$2::jsonb,$3,$4,$5,$6,$7,$8,$9) result',failArgs)).rows[0].result;assert.equal(failed.state,'blocked');assert.equal(failed.failureCode,'BUDGET_EXHAUSTED');assert.deepEqual((await database.query('SELECT status,failure_code,safe_result,updated_at IS NOT NULL updated FROM public.enterprise_assess_document_mapping_runs WHERE id=$1',[failedRun])).rows[0],{status:'blocked',failure_code:'BUDGET_EXHAUSTED',safe_result:failed,updated:true});
  await database.query('BEGIN');try{await database.query("UPDATE public.workspace_memberships SET status='disabled' WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3",[fixture.org,fixture.workspace,fixture.requester]);await expectDatabaseError(()=>database.query('SELECT public.enterprise_fail_assess_document_mapping_run_v1($1,$2::jsonb,$3,$4,$5,$6,$7,$8,$9)',failArgs),/PR1B_AUTHORIZATION_STALE|PR1B_AUTHORIZATION_DENIED|PR1B_NOT_FOUND/);await database.query('ROLLBACK')}catch(error){await database.query('ROLLBACK');throw error}
  assert.deepEqual((await database.query('SELECT public.enterprise_fail_assess_document_mapping_run_v1($1,$2::jsonb,$3,$4,$5,$6,$7,$8,$9) result',failArgs)).rows[0].result,failed);
  await expectDatabaseError(()=>database.query('SELECT public.enterprise_fail_assess_document_mapping_run_v1($1,$2::jsonb,$3,$4,$5,$6,$7,$8,$9)',[failedRun,json({failureCode:'PROVIDER_UNAVAILABLE'}),...failArgs.slice(2)]),/ENTERPRISE_ASSESS_DOCUMENT_MAPPING_FAILURE_INVALID/);
  assert.equal(Number((await database.query('SELECT count(*) n FROM public.enterprise_ai_effect_journal WHERE receipt_id=$1',[failedReceipt.id])).rows[0].n),0);
  pass('MAP-PG-009-terminal-failure','sanitized pre-effect failure is terminal, exact-replayable, authority-bound, and records no provider effect');

  const runId=nextUuid(),catalogId=nextUuid(),analyzeReceipt=await receipt('assess.document-map.analyze','main');
  const descriptionSelector=nextUuid(),factSelector=nextUuid(),missingFactSelector=nextUuid(),effortSelector=nextUuid(),createSelector=nextUuid(),createAssetSelector=nextUuid(),createInteractionSelector=nextUuid(),createDecisionSelector=nextUuid(),createExceptionSelector=nextUuid(),evidenceSelector=nextUuid();
  const targets=[
    target(descriptionSelector,{catalogId,targetKind:'case_field',operation:'set_field',fieldId:'case.description',label:'Description',contextLabel:'Mapping fixture',valueType:'text',currentValue:'Manual baseline description',manual:true}),
    target(factSelector,{catalogId,targetKind:'primitive_fact',operation:'set_fact',entityId:primitiveId,fieldId:'primitive.ambiguityCharacterized',label:'Ambiguity characterized',contextLabel:'Manual review',valueType:'boolean',currentValue:null,manual:false}),
    target(missingFactSelector,{catalogId,targetKind:'primitive_fact',operation:'set_fact',entityId:primitiveId,fieldId:'primitive.rulesStable',label:'Rules stable',contextLabel:'Manual review',valueType:'boolean',currentValue:null,manual:false}),
    target(effortSelector,{catalogId,targetKind:'primitive_field',operation:'set_field',entityId:primitiveId,fieldId:'primitive.manualEffort',label:'Manual effort',contextLabel:'Manual review',valueType:'number',currentValue:null,manual:false}),
    target(createSelector,{catalogId,targetKind:'create_primitive',operation:'create_entity',fieldId:'create.primitive:Validate',label:'New Validate primitive',contextLabel:'Mapping fixture',valueType:'primitive_constructor',allowedValues:['Validate'],currentValue:null,manual:false}),
    target(createAssetSelector,{catalogId,targetKind:'create_asset',operation:'create_entity',fieldId:'create.asset',label:'New asset',contextLabel:'Mapping fixture',valueType:'asset_constructor',currentValue:null,manual:false}),
    target(createInteractionSelector,{catalogId,targetKind:'create_interaction',operation:'create_entity',entityId:assetId,fieldId:`create.interaction:${assetId}:${primitiveId}`,label:'New interaction',contextLabel:'Case system / Manual review',valueType:'interaction_constructor',currentValue:null,manual:false}),
    target(createDecisionSelector,{catalogId,targetKind:'create_decision_point',operation:'create_entity',entityId:primitiveId,fieldId:`create.decision:${primitiveId}`,label:'New decision',contextLabel:'Manual review',valueType:'decision_constructor',currentValue:null,manual:false}),
    target(createExceptionSelector,{catalogId,targetKind:'create_exception_path',operation:'create_entity',entityId:primitiveId,fieldId:`create.exception:${primitiveId}`,label:'New exception',contextLabel:'Manual review',valueType:'exception_constructor',currentValue:null,manual:false}),
    target(evidenceSelector,{catalogId,targetKind:'evidence_only',operation:'link_evidence',fieldId:'evidence',label:'Evidence only',contextLabel:'Mapping fixture',valueType:'evidence',currentValue:null,manual:false}),
  ];
  const wrongOrg=nextUuid();await expectDatabaseError(()=>database.query(`SELECT public.enterprise_claim_assess_document_mapping_run_v1($1,$2,$3,1,'assess-v2-schema-2026-07',$4,$5::jsonb,$6,$7,1,$8::jsonb,$9,$10,'openai','fixture-model','assess-supporting-document-map-v1',$11,$12,$13,$14,$15,$16,$17)`,[runId,catalogId,caseId,'f'.repeat(64),json(targets),bundleId,bundleVersionId,json(sourceBindings),routeId,fixture.provider,fixture.requester,wrongOrg,fixture.workspace,authorizationVersion,analyzeReceipt.id,analyzeReceipt.execution_token,analyzeReceipt.execution_fence]),/ENTERPRISE_AI_STALE_EXECUTION_FENCE/);
  const wrongWorkspace=nextUuid();await expectDatabaseError(()=>database.query(`SELECT public.enterprise_claim_assess_document_mapping_run_v1($1,$2,$3,1,'assess-v2-schema-2026-07',$4,$5::jsonb,$6,$7,1,$8::jsonb,$9,$10,'openai','fixture-model','assess-supporting-document-map-v1',$11,$12,$13,$14,$15,$16,$17)`,[runId,catalogId,caseId,'f'.repeat(64),json(targets),bundleId,bundleVersionId,json(sourceBindings),routeId,fixture.provider,fixture.requester,fixture.org,wrongWorkspace,authorizationVersion,analyzeReceipt.id,analyzeReceipt.execution_token,analyzeReceipt.execution_fence]),/ENTERPRISE_AI_STALE_EXECUTION_FENCE/);
  assert.equal(Number((await database.query('SELECT count(*) n FROM public.enterprise_assess_document_mapping_runs WHERE id=$1',[runId])).rows[0].n),0);
  const mainClaim=await claimRun({runId,catalogId,targets,claimReceipt:analyzeReceipt});assert.notEqual(mainClaim.catalogHash,'f'.repeat(64));
  const storedTargets=(await database.query('SELECT field_id,current_value,current_value_hash,manual FROM public.enterprise_assess_document_mapping_targets WHERE catalog_id=$1 ORDER BY ordinal',[catalogId])).rows;assert.equal(storedTargets.length,10);assert.notEqual(storedTargets[0].current_value_hash,'f'.repeat(64));assert.deepEqual(storedTargets.filter(item=>['primitive.ambiguityCharacterized','primitive.rulesStable'].includes(item.field_id)).map(item=>[item.current_value,item.manual]),[[null,false],[null,false]]);
  const bounds=(await database.query(`SELECT public.enterprise_assess_document_mapping_payload_valid('create_primitive',$1::jsonb) primitive_name_201,public.enterprise_assess_document_mapping_payload_valid('create_primitive',$2::jsonb) primitive_trigger_501,public.enterprise_assess_document_mapping_payload_valid('create_decision_point',$3::jsonb) decision_rule_2001,public.enterprise_assess_document_mapping_payload_valid('create_exception_path',$4::jsonb) exception_trigger_2001,public.enterprise_assess_document_mapping_payload_valid('create_interaction',$5::jsonb) interaction_missing_risk`,[json({name:'n'.repeat(201),description:'valid'}),json({name:'valid',description:'valid',trigger:'t'.repeat(501)}),json({name:'valid',ruleDescription:'r'.repeat(2001),outcomeLabels:[]}),json({name:'valid',trigger:'e'.repeat(2001)}),json({operationName:'read',mode:'read',dataClassification:'Internal'})])).rows[0];assert.deepEqual(bounds,{primitive_name_201:false,primitive_trigger_501:false,decision_rule_2001:false,exception_trigger_2001:false,interaction_missing_risk:false});
  pass('MAP-PG-004-authoritative-catalog','wrong tenant rejects and server recomputes exact target values/manual/hash');

  const bindingA=mainClaim.sourceBindings.find(item=>item.sourceVersionId===selected[0].sourceVersionId),bindingB=mainClaim.sourceBindings.find(item=>item.sourceVersionId===selected[1].sourceVersionId);assert.ok(bindingA&&bindingB);
  const proposalA=nextUuid(),proposalB=nextUuid(),proposalFact=nextUuid(),proposalMissingFact=nextUuid(),proposalEffort=nextUuid(),proposalPrimitive=nextUuid(),proposalAsset=nextUuid(),proposalInteraction=nextUuid(),proposalDecision=nextUuid(),proposalException=nextUuid();
  const proposal=(id,selector,binding,value,excerpt,locator=`fixture:${id}`)=>({id,version:1,targetSelectorId:selector,sourceId:binding.sourceId,sourceVersionId:binding.sourceVersionId,extractionBindingId:binding.extractionBindingId,extractionJobId:binding.extractionJobId,proposedValue:value,confidence:0.9,rationale:'Grounded synthetic fixture',sourceAnchor:{sourceVersionId:binding.sourceVersionId,parserVersion:binding.parserVersion,locator,anchorHash:sha(`anchor:${id}`),safeExcerpt:excerpt},relationship:'neutral'});
  const proposals=[
    proposal(proposalA,descriptionSelector,bindingA,'Provider suggestion A','Suggestion A'),proposal(proposalB,descriptionSelector,bindingB,'Provider suggestion B','Suggestion B'),
    proposal(proposalFact,factSelector,bindingA,true,'Ambiguity is characterized'),proposal(proposalMissingFact,missingFactSelector,bindingB,true,'true','Sheet "Process" cell B2'),proposal(proposalEffort,effortSelector,bindingA,125.5,'Manual effort is bounded'),
    proposal(proposalPrimitive,createSelector,bindingA,{name:'Validate request',description:'Validate the request deterministically',inputs:['request'],outputs:['validated request'],rules:['reject malformed input']},'A validation step exists'),
    proposal(proposalAsset,createAssetSelector,bindingA,{name:'Policy repository',accountableOwner:'Operations'},'A policy repository is used'),
    proposal(proposalInteraction,createInteractionSelector,bindingA,{operationName:'Read policy',mode:'read',dataClassification:'Internal',highImpact:false,financialAction:false,untrustedContentWithTools:true},'The case system reads policy'),
    proposal(proposalDecision,createDecisionSelector,bindingA,{name:'Route request',ruleDescription:'Route based on validation result',outcomeLabels:['approved','rejected']},'A routing decision exists'),
    proposal(proposalException,createExceptionSelector,bindingA,{name:'Malformed request',trigger:'Request validation fails'},'A malformed request is exceptional'),
  ];
  for(const item of proposals){
    const contract=(await database.query(`SELECT public.enterprise_assess_document_mapping_value_valid(t.value_type,$3::jsonb,t.allowed_values) value_valid,public.enterprise_assess_document_mapping_payload_valid(t.target_kind,$3::jsonb) payload_valid,(SELECT count(*)::int FROM public.enterprise_assess_document_mapping_run_sources s WHERE s.run_id=$1 AND s.extraction_binding_id=$4 AND s.extraction_job_id=$5 AND s.source_id=$6 AND s.source_version_id=$7) source_count FROM public.enterprise_assess_document_mapping_targets t WHERE t.catalog_id=$2 AND t.selector_id=$8`,[runId,catalogId,json(item.proposedValue),item.extractionBindingId,item.extractionJobId,item.sourceId,item.sourceVersionId,item.targetSelectorId])).rows[0];
    assert.deepEqual(contract,{value_valid:true,payload_valid:true,source_count:1});
  }
  const analyzed=mainClaim.sourceBindings.map(item=>({sourceId:item.sourceId,sourceVersionId:item.sourceVersionId,parserVersion:item.parserVersion,extractedByteCount:item.extractedByteCount,sheetCount:item.sheetCount,cellCount:item.cellCount,warnings:item.warnings}));
  const safe={resourceId:runId,runId,catalogId,catalogHash:mainClaim.catalogHash,targetCount:targets.length,sourceCount:2,proposalCount:proposals.length,sourceBindings:mainClaim.sourceBindings,analyzedSources:analyzed,warnings:mappingWarnings};
  const substituted=structuredClone(safe);substituted.analyzedSources[0].extractedByteCount+=1;
  await expectDatabaseError(()=>database.query(`SELECT public.enterprise_stage_assess_document_mapping_result_v1($1,$2,$3::jsonb,$4::jsonb,$5,20,10,2,$6,$7,$8,$9)`,[runId,catalogId,json(proposals),json(substituted),sha('output'),sha('stage'),analyzeReceipt.id,analyzeReceipt.execution_token,analyzeReceipt.execution_fence]),/ENTERPRISE_ASSESS_DOCUMENT_MAPPING_STAGE_INVALID/);
  await expectDatabaseError(()=>database.query(`SELECT public.enterprise_stage_assess_document_mapping_result_v1($1,$2,$3::jsonb,$4::jsonb,$5,20,10,2,$6,$7,$8,$9)`,[runId,catalogId,json(proposals),json({...safe,rawProviderOutput:'must not persist'}),sha('output'),sha('stage'),analyzeReceipt.id,analyzeReceipt.execution_token,analyzeReceipt.execution_fence]),/ENTERPRISE_ASSESS_DOCUMENT_MAPPING_STAGE_INVALID/);
  const forgedProposals=structuredClone(proposals);forgedProposals[0].providerAuthoredPath='case.description';
  await expectDatabaseError(()=>database.query(`SELECT public.enterprise_stage_assess_document_mapping_result_v1($1,$2,$3::jsonb,$4::jsonb,$5,20,10,2,$6,$7,$8,$9)`,[runId,catalogId,json(forgedProposals),json(safe),sha('output'),sha('stage'),analyzeReceipt.id,analyzeReceipt.execution_token,analyzeReceipt.execution_fence]),/ENTERPRISE_ASSESS_DOCUMENT_MAPPING_PROPOSAL_INVALID/);
  await database.query(`SELECT public.enterprise_stage_assess_document_mapping_result_v1($1,$2,$3::jsonb,$4::jsonb,$5,20,10,2,$6,$7,$8,$9)`,[runId,catalogId,json(proposals),json(safe),sha('output'),sha('stage'),analyzeReceipt.id,analyzeReceipt.execution_token,analyzeReceipt.execution_fence]);
  const analyzeCommit=(await database.query('SELECT public.enterprise_commit_assess_document_mapping_result_v1($1,$2,$3,$4) result',[runId,analyzeReceipt.id,analyzeReceipt.execution_token,analyzeReceipt.execution_fence])).rows[0].result;const analyzeReplay=(await database.query('SELECT public.enterprise_commit_assess_document_mapping_result_v1($1,$2,$3,$4) result',[runId,analyzeReceipt.id,analyzeReceipt.execution_token,analyzeReceipt.execution_fence])).rows[0].result;assert.deepEqual(analyzeReplay,analyzeCommit);
  const staleReviewReceipt=await receipt('assess.document-map.proposal.review','stale-after-analyze');await database.query('BEGIN');try{const supersedingVersion=nextUuid();await database.query(`INSERT INTO public.enterprise_source_set_versions(id,source_set_id,org_id,workspace_id,version,purpose,manifest_hash,source_count,extracted_character_count,status,created_by) VALUES($1,$2,$3,$4,2,'Superseding after analyze',$5,2,100,'locked',$6)`,[supersedingVersion,setId,fixture.org,fixture.workspace,sha('set-v2-analyze'),fixture.requester]);await database.query('UPDATE public.enterprise_source_sets SET current_version=2 WHERE id=$1',[setId]);await expectDatabaseError(()=>database.query(`SELECT public.enterprise_review_assess_document_mapping_proposal_v1($1,1,'accepted',NULL,'Must reject stale source set',$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$11)`,[proposals[0].id,proposals[0].targetSelectorId,catalogId,caseId,fixture.requester,fixture.org,fixture.workspace,authorizationVersion,staleReviewReceipt.id,staleReviewReceipt.execution_token,staleReviewReceipt.execution_fence]),/ENTERPRISE_ASSESS_DOCUMENT_MAPPING_SOURCE_STALE/);await database.query('ROLLBACK')}catch(error){await database.query('ROLLBACK');throw error}
  pass('MAP-PG-005-stage-lineage-replay','substituted source metadata rejects and exact provider-result retry replays');

  const reviews=[];for(const [index,item] of proposals.entries()){const reviewReceipt=await receipt('assess.document-map.proposal.review',`review-${index+1}`);const result=(await database.query(`SELECT public.enterprise_review_assess_document_mapping_proposal_v1($1,1,'accepted',NULL,'Human accepted grounded suggestion',$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$11) result`,[item.id,item.targetSelectorId,catalogId,caseId,fixture.requester,fixture.org,fixture.workspace,authorizationVersion,reviewReceipt.id,reviewReceipt.execution_token,reviewReceipt.execution_fence])).rows[0].result;assert.equal(result.version,2);reviews.push({proposalId:item.id,proposalVersion:2,targetSelectorId:item.targetSelectorId,effectiveValue:item.proposedValue});}
  const batchId=nextUuid(),previewReceipt=await receipt('assess.document-map.preview','preview');const preview=(await database.query(`SELECT public.enterprise_create_assess_document_mapping_preview_v1($1,$2,$3,$4,1,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14) result`,[batchId,catalogId,mainClaim.catalogHash,caseId,bundleId,bundleVersionId,json(reviews),fixture.requester,fixture.org,fixture.workspace,authorizationVersion,previewReceipt.id,previewReceipt.execution_token,previewReceipt.execution_fence])).rows[0].result;assert.equal(preview.materialConflictCount,2);
  const conflicts=(await database.query('SELECT id,kind,current_resolution_version FROM public.enterprise_assess_document_mapping_conflicts WHERE preview_batch_id=$1 ORDER BY kind',[batchId])).rows;assert.deepEqual(conflicts.map(item=>item.kind),['cross_source','manual']);
  let latestManifest=preview.previewManifest;for(const [index,conflict] of conflicts.entries()){const resolveReceipt=await receipt('assess.document-map.conflict.resolve',`resolve-${index}`);const resolved=(await database.query(`SELECT public.enterprise_resolve_assess_document_mapping_conflict_v1($1,0,'retain_manual',NULL,NULL,'Preserve explicit human-authored value',$2,$3,$4,$5,$6,$7,$8) result`,[conflict.id,fixture.requester,fixture.org,fixture.workspace,authorizationVersion,resolveReceipt.id,resolveReceipt.execution_token,resolveReceipt.execution_fence])).rows[0].result;latestManifest=resolved.previewManifest;}
  assert.equal(latestManifest.manifestVersion,3);assert.equal(latestManifest.unresolvedConflictCount,0);assert.notEqual(latestManifest.resolutionSetHash,preview.previewManifest.resolutionSetHash);const manifestHistory=(await database.query('SELECT manifest_version,jsonb_array_length(resolution_bindings) resolution_count FROM public.enterprise_assess_document_mapping_preview_manifests WHERE preview_batch_id=$1 ORDER BY manifest_version',[batchId])).rows;assert.deepEqual(manifestHistory.map(row=>[Number(row.manifest_version),row.resolution_count]),[[1,0],[2,1],[3,2]]);
  pass('MAP-PG-006-review-conflicts','review ownership creates both manual and cross-source conflicts and requires explicit resolution');

  let materialized={name:'Mapping fixture',description:'Manual baseline description',agentNecessity,primitives:[primitive],edges:[],decisionPoints:[],exceptionPaths:[],assets:[asset],interactions:[interaction],evidence:[{id:oldEvidenceId,claimIds:['primitive.ambiguityCharacterized'],sourceType:'document',status:'submitted',validated:false}]};
  await expectDatabaseError(()=>database.query(`SELECT public.enterprise_assess_document_normalize_primitive_facts($1::jsonb)`,[json({...materialized,primitives:[{...primitive,facts:{...primitive.facts,'primitive.ambiguityCharacterized':fact('primitive.ambiguityCharacterized',true)}}]})]),/ENTERPRISE_ASSESS_DOCUMENT_MAPPING_FACT_ALIAS_CONFLICT/);
  assert.equal((await database.query('SELECT public.enterprise_assess_document_authoring_valid($1::jsonb) value',[json(materialized)])).rows[0].value,true,'Initial native fixture must satisfy database authoring validation');
  for(const item of proposals.slice(2)){
    materialized=(await database.query('SELECT public.enterprise_assess_document_apply_target($1::jsonb,t,$2::jsonb,$3) value FROM public.enterprise_assess_document_mapping_targets t WHERE t.catalog_id=$4 AND t.selector_id=$5',[json(materialized),json(item.proposedValue),nextUuid(),catalogId,item.targetSelectorId])).rows[0].value;
    const validation=(await database.query('SELECT public.enterprise_assess_document_authoring_valid($1::jsonb) value,public.pr1d_authoring_facts_valid($1::jsonb) facts',[json(materialized)])).rows[0];
    assert.equal(validation.value,true,`Server materialization invalid after ${item.targetSelectorId}; facts=${validation.facts}`);
  }

  const commitReceipt=await receipt('assess.document-map.commit','commit');const commitArgs=[batchId,catalogId,mainClaim.catalogHash,caseId,bundleId,bundleVersionId,json(latestManifest),fixture.requester,fixture.org,fixture.workspace,authorizationVersion,commitReceipt.id,commitReceipt.execution_token,commitReceipt.execution_fence];
  await expectDatabaseError(()=>database.query(`SELECT public.enterprise_commit_assess_document_mapping_preview_v1($1,$2,$3,$4,1,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14)`,[...commitArgs.slice(0,6),json({}),...commitArgs.slice(7)]),/ENTERPRISE_ASSESS_DOCUMENT_MAPPING_COMMIT_STALE/);
  const substitutedManifest={...latestManifest,itemCount:latestManifest.itemCount+1};await expectDatabaseError(()=>database.query(`SELECT public.enterprise_commit_assess_document_mapping_preview_v1($1,$2,$3,$4,1,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14)`,[...commitArgs.slice(0,6),json(substitutedManifest),...commitArgs.slice(7)]),/ENTERPRISE_ASSESS_DOCUMENT_MAPPING_COMMIT_STALE/);
  await database.query('BEGIN');try{const supersedingVersion=nextUuid();await database.query(`INSERT INTO public.enterprise_source_set_versions(id,source_set_id,org_id,workspace_id,version,purpose,manifest_hash,source_count,extracted_character_count,status,created_by) VALUES($1,$2,$3,$4,2,'Superseding race',$5,2,100,'locked',$6)`,[supersedingVersion,setId,fixture.org,fixture.workspace,sha('set-v2'),fixture.requester]);await database.query('UPDATE public.enterprise_source_sets SET current_version=2 WHERE id=$1',[setId]);await expectDatabaseError(()=>database.query(`SELECT public.enterprise_commit_assess_document_mapping_preview_v1($1,$2,$3,$4,1,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14)`,commitArgs),/ENTERPRISE_ASSESS_DOCUMENT_MAPPING_SOURCE_STALE/);await database.query('ROLLBACK')}catch(error){await database.query('ROLLBACK');throw error}
  const beforeCommitCounts=(await database.query(`SELECT
    (SELECT count(*)::int FROM public.assess_v2_case_versions WHERE case_id=$1) versions,
    (SELECT count(*)::int FROM public.enterprise_ai_effect_journal WHERE receipt_id=$2) effects`,[caseId,commitReceipt.id])).rows[0];
  const committed=(await database.query(`SELECT public.enterprise_commit_assess_document_mapping_preview_v1($1,$2,$3,$4,1,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14) result`,commitArgs)).rows[0].result;assert.equal(committed.caseVersion,2);assert.deepEqual(committed.appliedProposalIds,[proposalFact,proposalMissingFact,proposalEffort,proposalPrimitive,proposalAsset,proposalInteraction,proposalDecision,proposalException]);
  const afterCommitCounts=(await database.query(`SELECT
    (SELECT count(*)::int FROM public.assess_v2_case_versions WHERE case_id=$1) versions,
    (SELECT count(*)::int FROM public.enterprise_ai_effect_journal WHERE receipt_id=$2) effects`,[caseId,commitReceipt.id])).rows[0];
  assert.deepEqual(afterCommitCounts,{versions:beforeCommitCounts.versions+1,effects:beforeCommitCounts.effects+1});
  const replayed=(await database.query(`SELECT public.enterprise_commit_assess_document_mapping_preview_v1($1,$2,$3,$4,1,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14) result`,commitArgs)).rows[0].result;assert.deepEqual(replayed,committed);
  assert.deepEqual((await database.query(`SELECT
    (SELECT count(*)::int FROM public.assess_v2_case_versions WHERE case_id=$1) versions,
    (SELECT count(*)::int FROM public.enterprise_ai_effect_journal WHERE receipt_id=$2) effects`,[caseId,commitReceipt.id])).rows[0],afterCommitCounts,'Exact commit replay must not add a case version or provider/database effect.');
  const head=(await database.query('SELECT c.version,v.id,v.description,v.source_snapshot,v.imported_facts FROM public.assess_v2_cases c JOIN public.assess_v2_case_versions v ON v.id=c.head_version_id WHERE c.id=$1',[caseId])).rows[0];assert.equal(Number(head.version),2);assert.equal(head.description,'Manual baseline description');assert.deepEqual(head.source_snapshot,sourceSnapshot);assert.deepEqual(head.imported_facts,importedFacts);
  const appliedPrimitive=(await database.query('SELECT payload FROM public.assess_v2_primitives WHERE version_id=$1 AND id=$2',[head.id,primitiveId])).rows[0].payload;const appliedFact=appliedPrimitive.facts['primitive.ambiguityCharacterized'];assert.equal(appliedPrimitive.facts.ambiguityCharacterized,undefined);assert.equal(appliedFact.value,true);assert.equal(appliedFact.fieldId,'primitive.ambiguityCharacterized');assert.equal(appliedFact.source,'user');assert.ok(appliedFact.evidenceIds.includes(oldEvidenceId));assert.equal(new Set(appliedFact.evidenceIds).size,appliedFact.evidenceIds.length);assert.equal(appliedPrimitive.manualEffort,125.5);const rulesStableFact=appliedPrimitive.facts['primitive.rulesStable'];assert.deepEqual(rulesStableFact,{fieldId:'primitive.rulesStable',value:true,status:'suggested',evidenceIds:[rulesStableFact.evidenceIds[0]],source:'system'});
  const xlsxApplication=(await database.query(`SELECT application.outcome,application.evidence_id,proposal.source_id,proposal.source_version_id,
    proposal.parser_version,proposal.source_locator,proposal.safe_excerpt
    FROM public.enterprise_assess_document_mapping_applications application
    JOIN public.enterprise_assess_document_mapping_proposals proposal ON proposal.id=application.proposal_id
    WHERE application.preview_batch_id=$1 AND application.proposal_id=$2`,[batchId,proposalMissingFact])).rows[0];
  assert.deepEqual(xlsxApplication,{outcome:'applied',evidence_id:rulesStableFact.evidenceIds[0],source_id:bindingB.sourceId,source_version_id:bindingB.sourceVersionId,parser_version:xlsxProbe.parserVersion,source_locator:'Sheet "Process" cell B2',safe_excerpt:'true'});
  assert.deepEqual((await database.query('SELECT payload FROM public.assess_v2_evidence_links WHERE version_id=$1 AND id=$2',[head.id,xlsxApplication.evidence_id])).rows[0].payload,
    {id:xlsxApplication.evidence_id,claimIds:[],sourceType:'document',status:'submitted',validated:false});
  assert.deepEqual((await database.query(`SELECT (SELECT count(*)::int FROM public.assess_v2_primitives WHERE version_id=$1) primitives,(SELECT count(*)::int FROM public.assess_v2_application_assets WHERE version_id=$1) assets,(SELECT count(*)::int FROM public.assess_v2_application_interactions WHERE version_id=$1) interactions,(SELECT count(*)::int FROM public.assess_v2_decision_points WHERE version_id=$1) decisions,(SELECT count(*)::int FROM public.assess_v2_exception_paths WHERE version_id=$1) exceptions`,[head.id])).rows[0],{primitives:2,assets:2,interactions:2,decisions:1,exceptions:1});
  const persisted=(await database.query(`SELECT v.name,v.description,v.agent_necessity,(SELECT jsonb_agg(payload ORDER BY id) FROM public.assess_v2_primitives WHERE version_id=v.id) primitives,(SELECT jsonb_agg(payload ORDER BY id) FROM public.assess_v2_edges WHERE version_id=v.id) edges,(SELECT jsonb_agg(payload ORDER BY id) FROM public.assess_v2_decision_points WHERE version_id=v.id) decisions,(SELECT jsonb_agg(payload ORDER BY id) FROM public.assess_v2_exception_paths WHERE version_id=v.id) exceptions,(SELECT jsonb_agg(payload ORDER BY id) FROM public.assess_v2_application_assets WHERE version_id=v.id) assets,(SELECT jsonb_agg(payload ORDER BY id) FROM public.assess_v2_application_interactions WHERE version_id=v.id) interactions,(SELECT jsonb_agg(payload ORDER BY id) FROM public.assess_v2_evidence_links WHERE version_id=v.id) evidence FROM public.assess_v2_case_versions v WHERE v.id=$1`,[head.id])).rows[0];
  const createdInteraction=persisted.interactions.find(item=>item.operationName==='Read policy');assert.deepEqual({highImpact:createdInteraction.facts.highImpact,financialAction:createdInteraction.facts.financialAction,untrustedContentWithTools:createdInteraction.facts.untrustedContentWithTools},{highImpact:false,financialAction:false,untrustedContentWithTools:true});
  const persistedDraft={caseId,name:persisted.name,description:persisted.description,primitives:persisted.primitives,edges:persisted.edges??[],decisionPoints:persisted.decisions??[],exceptionPaths:persisted.exceptions??[],applicationAssets:persisted.assets??[],interactions:persisted.interactions??[],evidenceLinks:persisted.evidence??[],agentNecessity:persisted.agent_necessity,candidateEvaluations:[],gateResults:[],controlRequirements:[],modernizationDispositions:[]};
  runNativeParser({draft:persistedDraft,persisted:{organizationId:fixture.org,workspaceId:fixture.workspace,processId:fixture.process,ownerId:fixture.requester,version:2,importedFacts,createdAt:'2026-09-16T00:00:00.000Z',updatedAt:'2026-09-16T00:00:00.000Z'}});
  assert.equal(await database.query('SELECT public.enterprise_assess_document_authoring_valid(jsonb_build_object(\'name\',v.name,\'description\',v.description,\'agentNecessity\',v.agent_necessity,\'primitives\',(SELECT jsonb_agg(payload) FROM public.assess_v2_primitives WHERE version_id=v.id),\'edges\',\'[]\'::jsonb,\'decisionPoints\',\'[]\'::jsonb,\'exceptionPaths\',\'[]\'::jsonb,\'assets\',(SELECT jsonb_agg(payload) FROM public.assess_v2_application_assets WHERE version_id=v.id),\'interactions\',(SELECT jsonb_agg(payload) FROM public.assess_v2_application_interactions WHERE version_id=v.id),\'evidence\',(SELECT jsonb_agg(payload) FROM public.assess_v2_evidence_links WHERE version_id=v.id))) valid FROM public.assess_v2_case_versions v WHERE v.id=$1',[head.id]).then(result=>result.rows[0].valid),true);
  pass('MAP-PG-007-atomic-native-reopen','one native case version commits atomically, preserves manual/imported/source/fact provenance, and exact retry reopens the same result');

  const staleReceipt=await receipt('assess.document-map.analyze','stale-authority');await database.query('BEGIN');try{await database.query("UPDATE public.workspace_memberships SET status='disabled' WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3",[fixture.org,fixture.workspace,fixture.requester]);const staleCatalog=nextUuid();await expectDatabaseError(()=>claimRun({runId:nextUuid(),catalogId:staleCatalog,targets:[target(nextUuid(),{catalogId:staleCatalog,targetKind:'evidence_only',operation:'link_evidence',fieldId:'evidence',label:'Evidence',contextLabel:'Fixture',valueType:'evidence',currentValue:null,manual:false})],claimReceipt:staleReceipt}),/PR1B_AUTHORIZATION_STALE|PR1B_AUTHORIZATION_DENIED|PR1B_NOT_FOUND/);await database.query('ROLLBACK')}catch(error){await database.query('ROLLBACK');throw error}
  const beforeLegacy=Number((await database.query('SELECT count(*) n FROM public.assess_v2_case_versions WHERE case_id=$1',[caseId])).rows[0].n);await expectDatabaseError(()=>database.query(`SELECT public.enterprise_transcript_create_assess_apply_preview_batch_v2($1,$2,2,$3,$4,1,'[]'::jsonb,$5::jsonb,$6,$7,$8,$9,$10,$11,$12)`,[nextUuid(),caseId,bundleId,bundleVersionId,json([{intent:'create_primitive',target:'primitive'}]),fixture.requester,fixture.org,fixture.workspace,authorizationVersion,nextUuid(),nextUuid(),1]),/ENTERPRISE_TRANSCRIPT_TYPED_MAPPING_REQUIRED/);assert.equal(Number((await database.query('SELECT count(*) n FROM public.assess_v2_case_versions WHERE case_id=$1',[caseId])).rows[0].n),beforeLegacy);
  pass('MAP-PG-008-revoked-and-legacy','revoked/stale authority and legacy structural bypass reject with zero Assess effects');

  assert.equal(passed.length,16);console.log(`Assess supporting-document mapping PostgreSQL scenarios: ${passed.length}/${passed.length} passed.`);
}finally{
  for(const client of clients.slice().reverse())try{await client.end()}catch{}
  if(admin){const cleanup=new Client({connectionString:adminUrl});try{await cleanup.connect();await cleanup.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[databaseName]);await cleanup.query(`DROP DATABASE IF EXISTS ${databaseName}`)}finally{await cleanup.end().catch(()=>{})}}
}
