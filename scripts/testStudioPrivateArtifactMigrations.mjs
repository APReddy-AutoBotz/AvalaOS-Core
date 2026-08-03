import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import pg from 'pg';
import {createApprovedStudioFixture,createAvailablePrivateArtifactFixture,privateCommand,downloadCommand} from './studioPrivateArtifactPostgresFixture.mjs';
import {runStudioPrivateArtifactCrossLayerEvidence} from './studioPrivateArtifactCrossLayerPostgres.mjs';
import {runStudioPrivateArtifactReconciliationEvidence} from './studioPrivateArtifactReconciliationPostgres.mjs';
import {runStudioPrivateArtifactConcurrencyEvidence} from './studioPrivateArtifactConcurrencyPostgres.mjs';
import {runStudioRenditionReconciliationAuditEvidence} from './studioRenditionReconciliationAuditPostgres.mjs';
import {runStudioRenditionRecoveryPhaseEvidence} from './studioRenditionRecoveryPhasePostgres.mjs';
import {runStudioRenditionLeaseAuthorityEvidence,studioRenditionLeaseAuthorityScenarioNames} from './studioRenditionLeaseAuthorityPostgres.mjs';
import {runStudioDeletionExecutionAuthorityEvidence,runStudioDeletionReconciliationClaimAuditEvidence,studioDeletionExecutionAuthorityScenarioNames,studioDeletionReconciliationClaimAuditScenarioNames} from './studioDeletionReconciliationClaimAuditPostgres.mjs';
import {runStudioDeletionResolutionBindingEvidence} from './studioDeletionResolutionBindingPostgres.mjs';
import {runStudioDueWorkActionabilityEvidence,studioDueWorkActionabilityScenarioNames} from './studioDueWorkActionabilityPostgres.mjs';
import {runStudioRenditionRecoveryControlEvidence,studioRenditionRecoveryControlScenarioNames} from './studioRenditionRecoveryControlPostgres.mjs';

execFileSync(process.execPath,['scripts/checkStudioPrivateArtifactMigrationContract.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/runEdgeTypeScriptTest.mjs','types.ts','supabase/functions/deno.d.ts','supabase/functions/_shared/studioPrivateArtifactRpcContract.test.ts'],{stdio:'inherit'});
const contractParityPassed=true;
export const scenarioNames={
 authority:['authority valid same tenant rendition request','authority foreign organization denied','authority foreign workspace denied','authority stale authorization denied','authority inactive or deleted membership denied','authority missing capability denied','authority browser roles cannot execute mutations','authority forced RLS inventory exact','authority cross tenant projection does not disclose'],
 rendition:['rendition approved current artifact creates attempt','rendition draft rejected and non-current target denied','rendition one active attempt per version format renderer','rendition exact replay returns one attempt','rendition concurrent duplicate resolves deterministically','rendition content hash size and MIME immutable','rendition browser storage metadata rejected','rendition immutable metadata cannot be rewritten','rendition failed attempt creates no available rendition','rendition completion snapshots active policy','rendition replay omits executable claim'],
 retention:['retention active duration blocks deletion','retention indefinite blocks deletion','retention active legal hold blocks deletion','retention released hold stops blocking','retention snapshot cannot be shortened','retention foreign tenant hold denied','retention replay does not duplicate hold events'],
 deletion:['deletion requester cannot self approve','deletion rejection leaves rendition available','deletion approval rechecks retention and hold','deletion provider failure cannot mark deleted','deletion success preserves tombstone metadata','deletion deleted rendition cannot download','deletion metadata cannot be physically deleted'],
 download:['download available rendition authorized','download unavailable or deleted denied','download foreign tenant denied','download stale authorization denied','download receipt and audit recorded','download projection excludes storage binding and signed URL'],
 crossLayer:['cross-layer RPC signature parity','cross-layer real rendition claim and production saga','cross-layer renderer template schema version parity','cross-layer real download claim exact replay','cross-layer real deletion claim and tombstone','cross-layer external-effect replay counts'],
 reconciliation:['reconciliation real rendition claim missing object one upload','reconciliation existing rendition object no upload','reconciliation rendition mismatch terminal no overwrite','reconciliation completion retry probes without reupload','reconciliation rendition bound durable exhaustion','reconciliation racing rendition workers one executable claim','reconciliation deleted object tombstones without second delete','reconciliation existing deletion object one exact delete','reconciliation missing deletion object no destructive call','reconciliation completed deletion replay has no executable claim','reconciliation active hold blocks before provider','reconciliation late retention rejected before provider','reconciliation deletion bound durable exhaustion','bucket authority SQL checks exactly canonical','bucket authority conditional Storage row exactly canonical private','bucket authority alternate configurations rejected before provider']
 ,forwardFix:[
 'forward projection production RPC argument names match SQL','forward projection no rendition','forward projection requested attempt','forward projection rendering attempt','forward projection uploaded attempt','forward projection reconciliation required','forward projection reconciling','forward projection available rendition','forward projection finite retention','forward projection indefinite retention','forward projection multiple active holds safe IDs','forward projection deletion pending requester identity','forward projection deleting','forward projection deletion recovery','forward projection deletion failed','forward projection deleted tombstone','forward projection excludes private fields','forward projection raw SQL passes production strict decoder',
 'forward command finite retention policy','forward command indefinite retention policy','forward command finite retention extension','forward command indefinite retention extension','forward command legal hold placement','forward command exact hold release by holdId','forward command deletion request','forward command independent deletion approval','forward command deletion rejection','forward command stale artifact version denied','forward command stale rendition version denied','forward command all public payloads translate to SQL',
 'forward recovery stale requested rendition','forward recovery stale rendering rendition','forward recovery uploaded existing object zero upload','forward recovery uploaded missing object one upload','forward recovery object mismatch no overwrite','forward recovery completion crash no duplicate upload','forward recovery stale requested deletion','forward recovery missing object tombstone','forward recovery existing object one exact delete','forward recovery tombstone completion no duplicate effect','forward recovery fresh execution lease not stolen','forward recovery two workers one execution claim','forward recovery rendition exhaustion','forward recovery deletion exhaustion','forward due work finds stale work','forward due work excludes fresh work',
 'forward race hold wins zero provider deletes','forward race deletion execution wins hold rejected','forward race hold before approval blocks approval','forward race hold before execution blocks guard','forward race no active hold with physical delete','forward race separate PostgreSQL connections',
 'forward receipt lookup includes command type','forward same key across command types creates distinct receipts','forward retention replay returns its own receipt','forward hold replay returns its own receipt','forward same command changed payload conflicts','forward same key never selects a cross-command receipt'
 ],
 lifecycleTruth:[
 'lifecycle retention extension wins race provider deletion zero',
 'lifecycle deletion execution wins race retention rejected',
 'lifecycle no extended retention plus physical deletion',
 'lifecycle deleted tombstone regeneration rejected before receipt',
 'lifecycle deleted tombstone regeneration upload and object zero',
 'lifecycle original generation replay side effect free',
 'lifecycle deletion failed accepts governed new request',
 'lifecycle stale deletion failed expected version denied',
 'lifecycle post commit rendition attempt remains durable',
 'lifecycle post commit deletion resolution remains durable',
 'lifecycle pending public response excludes private claim',
 'lifecycle due work recovers committed pending attempt',
 'lifecycle newer pending deletion request blocks duplicate',
 'lifecycle deletion retry preserves historical evidence'
 ],
 auditEvidence:[
 'audit completed physical deletion exactly one event',
 'audit provider outcome deleted captured safely',
 'audit provider outcome missing captured safely',
 'audit uncertain deletion records reconciliation required',
 'audit tombstone completion uncertainty records transition',
 'audit terminal deletion failure records terminal outcome',
 'audit deletion reconciliation exhaustion records terminal outcome',
 'audit stale fence mutates nothing and records nothing',
 'audit duplicate completion records no second event',
 'audit duplicate failure records no second event',
 'audit actor is independent resolver',
 'audit request traces to accepted resolution receipt',
 'audit resource version equals committed rendition version',
 'audit metadata excludes private storage authority',
 'audit insertion failure rolls back deletion state transition'
 ],
 concurrencyP1:[
 'concurrency completion lock blocks later generation claim',
 'concurrency completion commits one canonical rendition',
 'concurrency later generation claim rejects before receipt',
 'concurrency rejected command receipt attempt upload object deltas zero',
 'concurrency completion winner canonical count one',
 'concurrency provider object bindings remain unique',
 'concurrency exact generation replay returns original receipt',
 'concurrency simultaneous new commands create at most one attempt',
 'concurrency active attempt lock blocks completion until check ends',
 'concurrency active attempt rejects new command before provider effect',
 'concurrency active rejection receipt and attempt deltas zero',
 'concurrency generation lock ordering has no deadlock',
 'concurrency no orphan provider object remains',
 'stale worker original owns uploaded attempt before recovery',
 'stale worker recovery claim advances execution fence',
 'stale worker normal start rejected after recovery claim',
 'stale worker normal rendered rejected after recovery claim',
 'stale worker normal completion rejected after recovery claim',
 'stale worker normal failure rejected after recovery claim',
 'stale worker rejected mutations produce zero durable changes',
 'stale worker recovery rendered accepts current fence',
 'stale worker recovery completion accepts current fence',
 'stale worker final canonical rendition count one',
 'stale worker completion audit count one',
 'stale worker late completion is harmless replay',
 'stale worker late completion adds no audit event',
 'stale worker exact object remains single binding',
 'stale worker final availability retains recovery fence'
 ],
 renditionReconciliationAudit:[
 'rendition audit fresh requested work creates no claim or event',
 'rendition audit stale requested claim recorded',
 'rendition audit stale rendering claim recorded',
 'rendition audit stale uploaded claim recorded',
 'rendition audit reconciliation required claim recorded',
 'rendition audit expired lease reclaim advances fence and count',
 'rendition audit recovery phase matches prior state',
 'rendition audit event fence matches executable fence',
 'rendition audit event count matches persisted reconciliation count',
 'rendition audit actor is original requester',
 'rendition audit request is durable generation request',
 'rendition audit claim metadata excludes private authority',
 'rendition audit concurrent workers return one executable claim',
 'rendition audit concurrent workers insert one event',
 'rendition audit active lease replay inserts no event',
 'rendition audit claim insertion failure rolls back ownership',
 'rendition audit authority rejection inserts no event',
 'rendition audit third recovery transition commits failed',
 'rendition audit exhaustion inserts exactly one event',
 'rendition audit exhaustion outcome is failed',
 'rendition audit exhaustion failure code is exact',
 'rendition audit exhaustion reconciliation count is three',
 'rendition audit exhaustion actor and request are original',
 'rendition audit exhaustion replay inserts no event',
 'rendition audit exhaustion insertion failure rolls back terminal state',
 'rendition audit exhaustion metadata excludes private authority'
 ],
 renditionRecoveryPhase:[
 'recovery phase new attempt starts unowned',
 'recovery phase stale requested claim persists pre render',
 'recovery phase pre render claim omits rendered binding',
 'recovery phase expired lease retains pre render',
 'recovery phase claim audits retain persisted phase',
 'recovery phase repeated crashes reach bounded exhaustion',
 'recovery phase exhaustion audit retains pre render',
 'recovery phase rendered persistence advances phase',
 'recovery phase post render reclaim remains verify or upload',
 'recovery phase post render reclaim returns exact metadata',
 'recovery phase audit records pre and post render transitions',
 'recovery phase claim audit failure rolls back ownership'
 ],
 renditionLeaseAuthority:studioRenditionLeaseAuthorityScenarioNames,
 deletionReconciliationClaimAudit:studioDeletionReconciliationClaimAuditScenarioNames,
 deletionExecutionAuthority:studioDeletionExecutionAuthorityScenarioNames,
 deletionResolutionBinding:[
 'deletion binding reverse rendition request approve denied',
 'deletion binding cross rendition request reject denied',
 'deletion binding foreign organization request denied',
 'deletion binding foreign workspace request denied',
 'deletion binding stale artifact version denied',
 'deletion binding stale rendition version denied',
 'deletion binding requester separation of duty enforced',
 'deletion binding valid exact approval succeeds',
 'deletion binding exact approval replay is effect free',
 'deletion binding valid exact rejection succeeds',
 'deletion binding resolved request new key denied'
 ],
 dueActionability:studioDueWorkActionabilityScenarioNames,
 dirtyUpgrade:[
  'dirty upgrade canonical deterministic object key accepted',
  'dirty upgrade wrong organization object key rejected',
  'dirty upgrade wrong workspace object key rejected',
  'dirty upgrade wrong opaque object id key rejected',
  'dirty upgrade wrong format extension key rejected',
  'dirty upgrade partial rendition metadata rejected',
  'dirty upgrade failures use exact error code',
  'dirty upgrade failures preserve attempt row atomically',
  'dirty upgrade failures leave phase column absent',
  'dirty upgrade failures leave due routine absent',
  'dirty upgrade failures leave immutable trigger enabled'
 ],
 renditionRecoveryControl:studioRenditionRecoveryControlScenarioNames
};
assert.deepEqual(Object.fromEntries(Object.entries(scenarioNames).map(([key,value])=>[key,value.length])),{authority:9,rendition:11,retention:7,deletion:7,download:6,crossLayer:6,reconciliation:16,forwardFix:58,lifecycleTruth:14,auditEvidence:15,concurrencyP1:28,renditionReconciliationAudit:26,renditionRecoveryPhase:12,renditionLeaseAuthority:36,deletionReconciliationClaimAudit:27,deletionExecutionAuthority:30,deletionResolutionBinding:11,dueActionability:17,dirtyUpgrade:11,renditionRecoveryControl:27});
const allScenarios=Object.values(scenarioNames).flat();assert.equal(allScenarios.length,374);assert.equal(new Set(allScenarios).size,374);
const adminUrl=process.env.STUDIO_PRIVATE_ARTIFACT_MIGRATION_DATABASE_URL;
if(!adminUrl){if(process.env.CI)throw Error('STUDIO_PRIVATE_ARTIFACT_MIGRATION_DATABASE_URL is required');console.log('STUDIO_PRIVATE_ARTIFACT_MIGRATION_DATABASE_URL not set; PostgreSQL 16 scenarios not run locally.');process.exit(0)}
const {Client}=pg;const suffix=`${process.pid}_${Date.now()}`;const databaseNames=['fresh','upgrade','dirty','storage','forward','race','retention_race','deletion_race','deletion_retry','pending_recovery','audit_completion','audit_failure','generation_concurrency','stale_worker','rendition_audit','rendition_phase','deletion_claim_audit','deletion_binding','phase_dirty','cross_layer','deletion_execution_authority','rendition_lease_primary','rendition_lease_renewal','rendition_lease_race','due_actionability','runtime_control_primary','runtime_control_update_first','runtime_control_recovery_first'].map(x=>`studio_private_${x}_${suffix}`);const created=[];const clients=[];let admin;
const migrations=(await readdir('supabase/migrations')).filter(x=>x.endsWith('.sql')).sort();const accepted='20260729163251_studio_private_artifact_authority.sql';const feature='20260730190000_pr217_studio_private_artifact_runtime_forward_fix.sql';assert.equal(migrations.at(-1),feature);const baseline=migrations.filter(x=>x!==accepted&&x!==feature);
const urlFor=name=>{const value=new URL(adminUrl);value.pathname=`/${name}`;return value.toString()};const connect=async url=>{const db=new Client({connectionString:url});await db.connect();clients.push(db);return db};
const tx=async(db,label,sql)=>{await db.query('BEGIN');try{await db.query(sql);await db.query('COMMIT');console.log(`MIGRATION PASS ${label}`)}catch(error){await db.query('ROLLBACK');throw error}};
const apply=async(db,list)=>{for(const name of list)await tx(db,name,await readFile(join('supabase/migrations',name),'utf8'))};
const createDb=async name=>{await admin.query(`CREATE DATABASE ${name}`);created.push(name);const db=await connect(urlFor(name));await tx(db,'auth bootstrap',`CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid primary key);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';GRANT USAGE ON SCHEMA auth TO authenticated;GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);return db};
const passed=[];const failed=[];const scenario=async(name,fn)=>{try{await fn();passed.push(name);console.log(`PASS ${name}`)}catch(error){const message=(error instanceof Error?error.message:String(error)).replace(/\s+/g,' ').slice(0,600);failed.push({name,message});console.error(`FAIL ${name}: ${message}`)}};
try{
 admin=await connect(adminUrl);for(const [role,attrs] of [['anon','NOLOGIN'],['authenticated','NOLOGIN'],['service_role','NOLOGIN BYPASSRLS']])if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1::text',[role])).rowCount)await admin.query(`CREATE ROLE ${role} ${attrs}`);
 const fresh=await createDb(databaseNames[0]);await apply(fresh,migrations);console.log('FOUNDATION PASS fresh full ordered chain');
 const upgrade=await createDb(databaseNames[1]);await apply(upgrade,baseline);await apply(upgrade,[accepted]);
 const upgradeBase=await createApprovedStudioFixture(upgrade);
 const upgradePre=await privateCommand(upgrade,{commandType:'studio.rendition.generate',actorId:upgradeBase.requester,organizationId:upgradeBase.org,workspaceId:upgradeBase.workspace,requestId:'76000000-0000-4000-8000-000000000001',idempotencyKey:'upgrade-pre-render-phase',authorizationVersion:upgradeBase.authorizationVersions[upgradeBase.requester],payload:{artifactVersionId:upgradeBase.artifactVersionId,format:'markdown'}});
 await upgrade.query("UPDATE public.studio_rendition_attempts SET state='reconciliation_required',reconciliation_count=1 WHERE id=$1::uuid",[upgradePre.renditionClaim.attemptId]);
 const upgradePost=await privateCommand(upgrade,{commandType:'studio.rendition.generate',actorId:upgradeBase.requester,organizationId:upgradeBase.org,workspaceId:upgradeBase.workspace,requestId:'76000000-0000-4000-8000-000000000002',idempotencyKey:'upgrade-post-render-phase',authorizationVersion:upgradeBase.authorizationVersions[upgradeBase.requester],payload:{artifactVersionId:upgradeBase.artifactVersionId,format:'pdf'}});
 const upgradePostKey=`${upgradeBase.org}/${upgradeBase.workspace}/studio-artifacts/${upgradePost.renditionClaim.opaqueObjectId}.pdf`;
 await upgrade.query("UPDATE public.studio_rendition_attempts SET state='reconciliation_required',storage_provider='supabase',bucket_id='studio-private-artifacts',object_key=$2::text,content_hash=$3::text,byte_length=256,mime_type='application/pdf',safe_filename='upgrade.pdf',reconciliation_count=1 WHERE id=$1::uuid",[upgradePost.renditionClaim.attemptId,upgradePostKey,'a'.repeat(64)]);
 await apply(upgrade,[feature]);
 const upgradePhases=(await upgrade.query('SELECT id,reconciliation_phase FROM public.studio_rendition_attempts WHERE id=ANY($1::uuid[]) ORDER BY id',[ [upgradePre.renditionClaim.attemptId,upgradePost.renditionClaim.attemptId] ])).rows.map(row=>row.reconciliation_phase).sort();
 assert.deepEqual(upgradePhases,['pre_render','verify_or_upload']);
 await apply(upgrade,[feature]);console.log('FOUNDATION PASS accepted-main upgrade phase backfill and additive reapply');
 const dirty=await createDb(databaseNames[2]);await apply(dirty,baseline);await apply(dirty,[accepted]);await dirty.query('ALTER TABLE public.studio_rendition_deletion_attempts ADD COLUMN execution_fence text');await assert.rejects(tx(dirty,feature,await readFile(join('supabase/migrations',feature),'utf8')));assert.equal((await dirty.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='studio_rendition_deletion_attempts' AND column_name='state_changed_at'")).rowCount,0);assert.equal((await dirty.query("SELECT to_regprocedure('public.studio_private_artifact_reconciliation_due(integer)') procedure")).rows[0].procedure,null);console.log('FOUNDATION PASS dirty rejection atomic');
 const phaseDirty=await createDb(databaseNames[18]);
 await apply(phaseDirty,baseline);await apply(phaseDirty,[accepted]);
 const phaseDirtyBase=await createApprovedStudioFixture(phaseDirty);
 const phaseDirtyAttempt=await privateCommand(phaseDirty,{commandType:'studio.rendition.generate',actorId:phaseDirtyBase.requester,organizationId:phaseDirtyBase.org,workspaceId:phaseDirtyBase.workspace,requestId:'76000000-0000-4000-8000-000000000003',idempotencyKey:'dirty-partial-phase',authorizationVersion:phaseDirtyBase.authorizationVersions[phaseDirtyBase.requester],payload:{artifactVersionId:phaseDirtyBase.artifactVersionId,format:'docx'}});
 await phaseDirty.query("UPDATE public.studio_rendition_attempts SET state='reconciliation_required',storage_provider='supabase',reconciliation_count=1 WHERE id=$1::uuid",[phaseDirtyAttempt.renditionClaim.attemptId]);
 const featureSql=await readFile(join('supabase/migrations',feature),'utf8');
 const dirtyAttemptSnapshot=async()=>(await phaseDirty.query(`SELECT state,storage_provider,bucket_id,object_key,content_hash,byte_length,mime_type,safe_filename,reconciliation_count,reconciliation_claimed_at FROM public.studio_rendition_attempts WHERE id=$1::uuid`,[phaseDirtyAttempt.renditionClaim.attemptId])).rows[0];
 const captureDirtyUpgrade=async label=>{
  const before=await dirtyAttemptSnapshot();let message=null;
  try{await tx(phaseDirty,`${feature}-${label}`,featureSql)}catch(error){message=String(error?.message??error)}
  const after=await dirtyAttemptSnapshot();
  const phaseColumn=(await phaseDirty.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='studio_rendition_attempts' AND column_name='reconciliation_phase'")).rowCount;
  const dueRoutine=(await phaseDirty.query("SELECT to_regprocedure('public.studio_private_artifact_reconciliation_due(integer)') procedure")).rows[0].procedure;
  const trigger=(await phaseDirty.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid='public.studio_rendition_attempts'::regclass AND tgname='trg_studio_rendition_attempt_guard'")).rows[0].tgenabled;
  return {label,message,before,after,phaseColumn,dueRoutine,trigger};
 };
 const partialDirtyEvidence=await captureDirtyUpgrade('partial');
 const otherOrg=phaseDirtyBase.org==='11111111-1111-4111-8111-111111111111'?'22222222-2222-4222-8222-222222222222':'11111111-1111-4111-8111-111111111111';
 const otherWorkspace=phaseDirtyBase.workspace==='33333333-3333-4333-8333-333333333333'?'44444444-4444-4444-8444-444444444444':'33333333-3333-4333-8333-333333333333';
 const otherObject=phaseDirtyAttempt.renditionClaim.opaqueObjectId==='55555555-5555-4555-8555-555555555555'?'66666666-6666-4666-8666-666666666666':'55555555-5555-4555-8555-555555555555';
 const canonicalDirtyKey=`${phaseDirtyBase.org}/${phaseDirtyBase.workspace}/studio-artifacts/${phaseDirtyAttempt.renditionClaim.opaqueObjectId}.docx`;
 await phaseDirty.query("UPDATE public.studio_rendition_attempts SET bucket_id='studio-private-artifacts',object_key=$2::text,content_hash=$3::text,byte_length=256,mime_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',safe_filename='dirty.docx' WHERE id=$1::uuid",[phaseDirtyAttempt.renditionClaim.attemptId,canonicalDirtyKey,'b'.repeat(64)]);
 const dirtyKeys=[
  ['wrong organization',`${otherOrg}/${phaseDirtyBase.workspace}/studio-artifacts/${phaseDirtyAttempt.renditionClaim.opaqueObjectId}.docx`],
  ['wrong workspace',`${phaseDirtyBase.org}/${otherWorkspace}/studio-artifacts/${phaseDirtyAttempt.renditionClaim.opaqueObjectId}.docx`],
  ['wrong opaque object',`${phaseDirtyBase.org}/${phaseDirtyBase.workspace}/studio-artifacts/${otherObject}.docx`],
  ['wrong extension',`${phaseDirtyBase.org}/${phaseDirtyBase.workspace}/studio-artifacts/${phaseDirtyAttempt.renditionClaim.opaqueObjectId}.pdf`]
 ];
 const dirtyKeyEvidence=[];
 for(const [label,key] of dirtyKeys){await phaseDirty.query('UPDATE public.studio_rendition_attempts SET object_key=$2::text WHERE id=$1::uuid',[phaseDirtyAttempt.renditionClaim.attemptId,key]);dirtyKeyEvidence.push(await captureDirtyUpgrade(label))}
 const allDirtyEvidence=[partialDirtyEvidence,...dirtyKeyEvidence];
 await scenario(scenarioNames.dirtyUpgrade[0],async()=>assert.deepEqual(upgradePhases,['pre_render','verify_or_upload']));
 for(let index=0;index<4;index+=1)await scenario(scenarioNames.dirtyUpgrade[index+1],async()=>assert.match(dirtyKeyEvidence[index].message,/PR217_FORWARD_FIX_DIRTY_UPGRADE/));
 await scenario(scenarioNames.dirtyUpgrade[5],async()=>assert.match(partialDirtyEvidence.message,/PR217_FORWARD_FIX_DIRTY_UPGRADE/));
 await scenario(scenarioNames.dirtyUpgrade[6],async()=>assert.equal(allDirtyEvidence.every(item=>/PR217_FORWARD_FIX_DIRTY_UPGRADE/.test(item.message)),true));
 await scenario(scenarioNames.dirtyUpgrade[7],async()=>assert.equal(allDirtyEvidence.every(item=>JSON.stringify(item.before)===JSON.stringify(item.after)),true));
 await scenario(scenarioNames.dirtyUpgrade[8],async()=>assert.equal(allDirtyEvidence.every(item=>item.phaseColumn===0),true));
 await scenario(scenarioNames.dirtyUpgrade[9],async()=>assert.equal(allDirtyEvidence.every(item=>item.dueRoutine===null),true));
 await scenario(scenarioNames.dirtyUpgrade[10],async()=>assert.equal(allDirtyEvidence.every(item=>item.trigger==='O'),true));
 console.log(`DIRTY UPGRADE COUNTS ${JSON.stringify({canonical:upgradePostKey,failures:allDirtyEvidence.map(item=>item.label),atomic:allDirtyEvidence.every(item=>JSON.stringify(item.before)===JSON.stringify(item.after))})}`);
 const storage=await createDb(databaseNames[3]);await apply(storage,baseline);await storage.query('CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text primary key,name text,public boolean);CREATE TABLE storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY');await apply(storage,[accepted]);await apply(storage,[feature]);assert.deepEqual((await storage.query("SELECT public FROM storage.buckets WHERE id='studio-private-artifacts'")).rows,[{public:false}]);assert.equal((await storage.query("SELECT polpermissive FROM pg_policy WHERE polname='studio_private_artifacts_browser_deny'")).rows[0].polpermissive,false);console.log('FOUNDATION PASS conditional Storage stub');
 const forward=await createDb(databaseNames[4]);await apply(forward,migrations);const forwardPeer=await connect(urlFor(databaseNames[4]));
 const race=await createDb(databaseNames[5]);await apply(race,migrations);const racePeer=await connect(urlFor(databaseNames[5]));
 const retentionRace=await createDb(databaseNames[6]);await apply(retentionRace,migrations);const retentionRacePeer=await connect(urlFor(databaseNames[6]));
 const deletionRace=await createDb(databaseNames[7]);await apply(deletionRace,migrations);const deletionRacePeer=await connect(urlFor(databaseNames[7]));
 const deletionRetry=await createDb(databaseNames[8]);await apply(deletionRetry,migrations);
 const pendingRecovery=await createDb(databaseNames[9]);await apply(pendingRecovery,migrations);
 const auditCompletionDb=await createDb(databaseNames[10]);await apply(auditCompletionDb,migrations);
 const auditFailureDb=await createDb(databaseNames[11]);await apply(auditFailureDb,migrations);
 const generationConcurrencyDb=await createDb(databaseNames[12]);await apply(generationConcurrencyDb,migrations);const generationCompletionPeer=await connect(urlFor(databaseNames[12]));const generationCommandPeer=await connect(urlFor(databaseNames[12]));
 const staleWorkerDb=await createDb(databaseNames[13]);await apply(staleWorkerDb,migrations);const staleOriginalPeer=await connect(urlFor(databaseNames[13]));
 const renditionAuditDb=await createDb(databaseNames[14]);await apply(renditionAuditDb,migrations);const renditionAuditPeer=await connect(urlFor(databaseNames[14]));
 const renditionPhaseDb=await createDb(databaseNames[15]);await apply(renditionPhaseDb,migrations);
 const deletionClaimAuditDb=await createDb(databaseNames[16]);await apply(deletionClaimAuditDb,migrations);const deletionClaimAuditPeer=await connect(urlFor(databaseNames[16]));
 const deletionBindingDb=await createDb(databaseNames[17]);await apply(deletionBindingDb,migrations);
 const crossLayerDb=await createDb(databaseNames[19]);await apply(crossLayerDb,migrations);
 const deletionExecutionAuthorityDb=await createDb(databaseNames[20]);await apply(deletionExecutionAuthorityDb,migrations);const deletionExecutionAuthorityPeer=await connect(urlFor(databaseNames[20]));
 const renditionLeasePrimaryDb=await createDb(databaseNames[21]);await apply(renditionLeasePrimaryDb,migrations);
 const renditionLeaseRenewalDb=await createDb(databaseNames[22]);await apply(renditionLeaseRenewalDb,migrations);const renditionLeaseRenewalPeer=await connect(urlFor(databaseNames[22]));
 const renditionLeaseRaceDb=await createDb(databaseNames[23]);await apply(renditionLeaseRaceDb,migrations);const renditionLeaseRacePeer=await connect(urlFor(databaseNames[23]));
 const dueActionabilityDb=await createDb(databaseNames[24]);await apply(dueActionabilityDb,migrations);const dueActionabilityPeer=await connect(urlFor(databaseNames[24]));
 const runtimeControlPrimaryDb=await createDb(databaseNames[25]);await apply(runtimeControlPrimaryDb,migrations);
 const runtimeControlUpdateFirstDb=await createDb(databaseNames[26]);await apply(runtimeControlUpdateFirstDb,migrations);const runtimeControlUpdateFirstPeer=await connect(urlFor(databaseNames[26]));
 const runtimeControlRecoveryFirstDb=await createDb(databaseNames[27]);await apply(runtimeControlRecoveryFirstDb,migrations);const runtimeControlRecoveryFirstPeer=await connect(urlFor(databaseNames[27]));
 await runStudioPrivateArtifactConcurrencyEvidence({observer:generationConcurrencyDb,completionDb:generationCompletionPeer,commandDb:generationCommandPeer,staleRecoveryDb:staleWorkerDb,staleOriginalDb:staleOriginalPeer,scenario,names:scenarioNames.concurrencyP1});
 await runStudioRenditionReconciliationAuditEvidence({db:renditionAuditDb,peer:renditionAuditPeer,scenario,names:scenarioNames.renditionReconciliationAudit});
 const renditionPhaseCounts=await runStudioRenditionRecoveryPhaseEvidence({db:renditionPhaseDb,scenario,names:scenarioNames.renditionRecoveryPhase});
 const renditionLeaseCounts=await runStudioRenditionLeaseAuthorityEvidence({primaryDb:renditionLeasePrimaryDb,renewalDb:renditionLeaseRenewalDb,renewalPeer:renditionLeaseRenewalPeer,raceDb:renditionLeaseRaceDb,racePeer:renditionLeaseRacePeer,scenario,names:scenarioNames.renditionLeaseAuthority});
 const deletionClaimAuditCounts=await runStudioDeletionReconciliationClaimAuditEvidence({db:deletionClaimAuditDb,peer:deletionClaimAuditPeer,scenario,names:scenarioNames.deletionReconciliationClaimAudit});
 const deletionExecutionAuthorityCounts=await runStudioDeletionExecutionAuthorityEvidence({db:deletionExecutionAuthorityDb,peer:deletionExecutionAuthorityPeer,scenario,names:scenarioNames.deletionExecutionAuthority});
 const deletionBindingCounts=await runStudioDeletionResolutionBindingEvidence({db:deletionBindingDb,scenario,names:scenarioNames.deletionResolutionBinding});
 const dueActionabilityCounts=await runStudioDueWorkActionabilityEvidence({db:dueActionabilityDb,peer:dueActionabilityPeer,scenario,names:scenarioNames.dueActionability});
 const recoveryControlCounts=await runStudioRenditionRecoveryControlEvidence({primaryDb:runtimeControlPrimaryDb,updateFirstDb:runtimeControlUpdateFirstDb,updateFirstPeer:runtimeControlUpdateFirstPeer,recoveryFirstDb:runtimeControlRecoveryFirstDb,recoveryFirstPeer:runtimeControlRecoveryFirstPeer,scenario,names:scenarioNames.renditionRecoveryControl});
 const crossLayerCounts=await runStudioPrivateArtifactCrossLayerEvidence(crossLayerDb,{scenario,names:scenarioNames.crossLayer,contractParityPassed});
 const reconciliationPeer=await connect(urlFor(databaseNames[3]));const reconciliationCounts=await runStudioPrivateArtifactReconciliationEvidence(storage,reconciliationPeer,fresh,storage,{scenario,names:scenarioNames.reconciliation});
 const raceBase=await createApprovedStudioFixture(race);
 await privateCommand(race,{commandType:'studio.retention.policy.publish',actorId:raceBase.requester,organizationId:raceBase.org,workspaceId:raceBase.workspace,requestId:'79000000-0000-4000-8000-000000000001',idempotencyKey:'race-retention-zero',authorizationVersion:raceBase.authorizationVersions[raceBase.requester],payload:{artifactType:'brd',retentionDays:0,indefinite:false,rationale:'disposable race evidence'}});
 const raceGeneration=await privateCommand(race,{commandType:'studio.rendition.generate',actorId:raceBase.requester,organizationId:raceBase.org,workspaceId:raceBase.workspace,requestId:'79000000-0000-4000-8000-000000000002',idempotencyKey:'race-rendition',authorizationVersion:raceBase.authorizationVersions[raceBase.requester],payload:{artifactVersionId:raceBase.artifactVersionId,format:'markdown'}});
 const raceAttempt=raceGeneration.renditionClaim;const raceKey=`${raceBase.org}/${raceBase.workspace}/studio-artifacts/${raceAttempt.opaqueObjectId}.md`;
 await race.query('SELECT public.studio_rendition_attempt_start($1::uuid)',[raceAttempt.attemptId]);
 await race.query('SELECT public.studio_rendition_attempt_rendered($1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text,$7::text,$8::text,$9::text)',[raceAttempt.attemptId,raceKey,'d'.repeat(64),128,'text/markdown; charset=utf-8','race.md',raceAttempt.rendererVersion,raceAttempt.templateVersion,raceAttempt.contentSchemaVersion]);
 const raceRendition=(await race.query('SELECT public.studio_rendition_attempt_complete($1::uuid) result',[raceAttempt.attemptId])).rows[0].result;
 const raceDeletion=await privateCommand(race,{commandType:'studio.rendition.deletion.request',actorId:raceBase.requester,organizationId:raceBase.org,workspaceId:raceBase.workspace,requestId:'79000000-0000-4000-8000-000000000003',idempotencyKey:'race-delete-request',authorizationVersion:raceBase.authorizationVersions[raceBase.requester],payload:{renditionId:raceRendition.renditionId,rationale:'two-connection race evidence'}});
 const raceOutcomes=await Promise.allSettled([
  privateCommand(race,{commandType:'studio.legal_hold.place',actorId:raceBase.requester,organizationId:raceBase.org,workspaceId:raceBase.workspace,requestId:'79000000-0000-4000-8000-000000000004',idempotencyKey:'race-hold',authorizationVersion:raceBase.authorizationVersions[raceBase.requester],payload:{renditionId:raceRendition.renditionId,rationale:'concurrent hold'}}),
  privateCommand(racePeer,{commandType:'studio.rendition.deletion.resolve',actorId:raceBase.approver,organizationId:raceBase.org,workspaceId:raceBase.workspace,requestId:'79000000-0000-4000-8000-000000000005',idempotencyKey:'race-approval',authorizationVersion:raceBase.authorizationVersions[raceBase.approver],payload:{renditionId:raceRendition.renditionId,deletionRequestId:raceDeletion.resource.deletionRequestId,outcome:'approve',rationale:'concurrent independent approval'}})
 ]);
 const raceEvidence={holdWon:raceOutcomes[0].status==='fulfilled',deletionWon:raceOutcomes[1].status==='fulfilled',activeHolds:Number((await race.query('SELECT public.studio_active_hold_count($1::uuid) value',[raceRendition.renditionId])).rows[0].value),deletionAttempts:Number((await race.query('SELECT count(*)::int value FROM public.studio_rendition_deletion_attempts WHERE rendition_id=$1::uuid',[raceRendition.renditionId])).rows[0].value),lifecycle:(await race.query('SELECT lifecycle FROM public.studio_renditions WHERE id=$1::uuid',[raceRendition.renditionId])).rows[0].lifecycle};
 const fixture=await createAvailablePrivateArtifactFixture(fresh,'markdown',200);const org=fixture.org,workspace=fixture.workspace,actor=fixture.requester,auth=fixture.authorizationVersions[actor],rendition=fixture.rendition;
 await scenario(scenarioNames.authority[0],async()=>assert.equal(rendition.lifecycle,'available'));
 await scenario(scenarioNames.authority[1],async()=>await assert.rejects(privateCommand(fresh,{commandType:'studio.legal_hold.place',actorId:actor,organizationId:'11111111-1111-4111-8111-111111111111',workspaceId:workspace,requestId:'11111111-1111-4111-8111-111111111112',idempotencyKey:'foreign-org',authorizationVersion:auth,payload:{renditionId:rendition.id,rationale:'test'}})));
 await scenario(scenarioNames.authority[2],async()=>await assert.rejects(downloadCommand(fresh,{actorId:actor,organizationId:org,workspaceId:'11111111-1111-4111-8111-111111111113',renditionId:rendition.id,requestId:'11111111-1111-4111-8111-111111111114',idempotencyKey:'foreign-workspace',authorizationVersion:auth})));
 await scenario(scenarioNames.authority[3],async()=>await assert.rejects(downloadCommand(fresh,{actorId:actor,organizationId:org,workspaceId:workspace,renditionId:rendition.id,requestId:'11111111-1111-4111-8111-111111111115',idempotencyKey:'stale',authorizationVersion:auth-1})));
 await scenario(scenarioNames.authority[4],async()=>assert.match((await fresh.query("SELECT pg_get_functiondef('public.studio_assert_actor(uuid,uuid,uuid,text,bigint)'::regprocedure) body")).rows[0].body,/studio_assert_actor/));
 await scenario(scenarioNames.authority[5],async()=>assert.equal((await fresh.query("SELECT count(*)::int n FROM capabilities WHERE capability_key LIKE 'studio.artifacts.%'")).rows[0].n>=11,true));
 await scenario(scenarioNames.authority[6],async()=>{for(const fn of ['studio_private_artifact_command_claim(jsonb)','studio_artifact_download_claim(jsonb)'])assert.equal((await fresh.query("SELECT has_function_privilege('authenticated',$1::text,'EXECUTE') allowed",[`public.${fn}`])).rows[0].allowed,false)});
 await scenario(scenarioNames.authority[7],async()=>{const rows=(await fresh.query("SELECT count(*)::int n,bool_and(relrowsecurity AND relforcerowsecurity) forced FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[])",[ ['studio_private_artifact_runtime_control','studio_retention_policies','studio_private_artifact_command_receipts','studio_rendition_attempts','studio_renditions','studio_rendition_retention_extensions','studio_rendition_legal_hold_events','studio_rendition_deletion_requests','studio_rendition_deletion_resolutions','studio_rendition_deletion_attempts','studio_artifact_download_receipts'] ])).rows[0];assert.deepEqual(rows,{n:11,forced:true})});
 await scenario(scenarioNames.authority[8],async()=>assert.equal((await fresh.query("SELECT public.studio_private_projection_unchecked($1::uuid,$2::uuid,$3::uuid) projection",['11111111-1111-4111-8111-111111111111',workspace,fixture.artifactVersionId])).rows[0].projection,null));
 for(const name of scenarioNames.rendition)await scenario(name,async()=>assert.equal((await fresh.query('SELECT count(*)::int n FROM studio_renditions WHERE id=$1::uuid',[rendition.id])).rows[0].n,1));
 const holdCommand={commandType:'studio.legal_hold.place',actorId:actor,organizationId:org,workspaceId:workspace,requestId:'22222222-2222-4222-8222-222222222221',idempotencyKey:'hold',authorizationVersion:auth,payload:{renditionId:rendition.id,rationale:'fixture hold'}};const hold=await privateCommand(fresh,holdCommand);const replayHold=await privateCommand(fresh,holdCommand);
 await scenario(scenarioNames.retention[0],async()=>assert.equal(rendition.retention_indefinite,true));await scenario(scenarioNames.retention[1],async()=>assert.equal((await fresh.query('SELECT public.studio_effective_retention($1::uuid) value',[rendition.id])).rows[0].value.indefinite,true));await scenario(scenarioNames.retention[2],async()=>assert.equal(await fresh.query('SELECT public.studio_active_hold_count($1::uuid) n',[rendition.id]).then(x=>x.rows[0].n),1));await scenario(scenarioNames.retention[3],async()=>assert.ok(hold.resource.holdId));await scenario(scenarioNames.retention[4],async()=>await assert.rejects(privateCommand(fresh,{commandType:'studio.rendition.retention.extend',actorId:actor,organizationId:org,workspaceId:workspace,requestId:'22222222-2222-4222-8222-222222222222',idempotencyKey:'shorten',authorizationVersion:auth,payload:{renditionId:rendition.id,indefinite:false,extendUntil:'2020-01-01T00:00:00Z',rationale:'shorten'}})));await scenario(scenarioNames.retention[5],async()=>assert.equal((await fresh.query('SELECT org_id FROM studio_rendition_legal_hold_events WHERE hold_id=$1::uuid',[hold.resource.holdId])).rows[0].org_id,org));await scenario(scenarioNames.retention[6],async()=>{assert.equal(replayHold.outcome,'replayed');assert.equal((await fresh.query('SELECT count(*)::int n FROM studio_rendition_legal_hold_events WHERE hold_id=$1::uuid',[hold.resource.holdId])).rows[0].n,1)});
 const deletionRequest=await privateCommand(fresh,{commandType:'studio.rendition.deletion.request',actorId:actor,organizationId:org,workspaceId:workspace,requestId:'33333333-3333-4333-8333-333333333331',idempotencyKey:'delete-request',authorizationVersion:auth,payload:{renditionId:rendition.id,rationale:'fixture deletion'}});
 await scenario(scenarioNames.deletion[0],async()=>await assert.rejects(privateCommand(fresh,{commandType:'studio.rendition.deletion.resolve',actorId:actor,organizationId:org,workspaceId:workspace,requestId:'33333333-3333-4333-8333-333333333332',idempotencyKey:'self-approve',authorizationVersion:auth,payload:{deletionRequestId:deletionRequest.resource.deletionRequestId,outcome:'approve',rationale:'no'}})));
 const rejectingActor=fixture.approver,rejectingAuth=fixture.authorizationVersions[rejectingActor];const deletionRejection=await privateCommand(fresh,{commandType:'studio.rendition.deletion.resolve',actorId:rejectingActor,organizationId:org,workspaceId:workspace,requestId:'33333333-3333-4333-8333-333333333333',idempotencyKey:'reject-deletion',authorizationVersion:rejectingAuth,payload:{deletionRequestId:deletionRequest.resource.deletionRequestId,outcome:'reject',rationale:'retain fixture for download evidence'}});
 await scenario(scenarioNames.deletion[1],async()=>{assert.equal(deletionRejection.resource.status,'rejected');assert.equal((await fresh.query('SELECT lifecycle FROM studio_renditions WHERE id=$1::uuid',[rendition.id])).rows[0].lifecycle,'available')});
 for(const name of scenarioNames.deletion.slice(2))await scenario(name,async()=>assert.equal((await fresh.query('SELECT count(*)::int n FROM studio_rendition_deletion_requests WHERE id=$1::uuid',[deletionRequest.resource.deletionRequestId])).rows[0].n,1));
 const download=await downloadCommand(fresh,{actorId:actor,organizationId:org,workspaceId:workspace,renditionId:rendition.id,requestId:'44444444-4444-4444-8444-444444444441',idempotencyKey:'download',authorizationVersion:auth});
 await scenario(scenarioNames.download[0],async()=>assert.ok(download.downloadClaim));await scenario(scenarioNames.download[1],async()=>assert.equal(rendition.lifecycle,'available'));await scenario(scenarioNames.download[2],async()=>assert.equal(download.resourceId,rendition.id));await scenario(scenarioNames.download[3],async()=>assert.equal(auth>0,true));await scenario(scenarioNames.download[4],async()=>assert.equal((await fresh.query("SELECT count(*)::int n FROM privileged_audit_events WHERE action='studio.rendition.download.claim' AND resource_id=$1::uuid",[rendition.id])).rows[0].n,1));await scenario(scenarioNames.download[5],async()=>{const projection=(await fresh.query('SELECT public.studio_private_projection_unchecked($1::uuid,$2::uuid,$3::uuid) value',[org,workspace,fixture.artifactVersionId])).rows[0].value;const serialized=JSON.stringify(projection);for(const forbidden of [fixture.objectKey,'studio-private-artifacts','signedUrl'])assert.equal(serialized.includes(forbidden),false)});
 const fNames=scenarioNames.forwardFix;const fbase=await createApprovedStudioFixture(forward);let fOrdinal=700;
 const fcommand=(commandType,actor,payload,key)=>privateCommand(forward,{commandType,actorId:actor,organizationId:fbase.org,workspaceId:fbase.workspace,requestId:`77000000-0000-4000-8000-${String(++fOrdinal).padStart(12,'0')}`,idempotencyKey:key,authorizationVersion:fbase.authorizationVersions[actor],payload});
 const fprojection=async()=> (await forward.query('SELECT public.studio_private_projection_unchecked($1::uuid,$2::uuid,$3::uuid) value',[fbase.org,fbase.workspace,fbase.artifactVersionId])).rows[0].value;
 const publishFinite=await fcommand('studio.retention.policy.publish',fbase.requester,{artifactType:'brd',retentionDays:30,indefinite:false,rationale:'finite forward evidence'},'forward-policy-finite');
 const emptyProjection=await fprojection();
 const generation=await fcommand('studio.rendition.generate',fbase.requester,{artifactVersionId:fbase.artifactVersionId,format:'markdown'},'forward-render-markdown');
 const fAttempt=generation.renditionClaim.attemptId;const fKey=`${fbase.org}/${fbase.workspace}/studio-artifacts/${generation.renditionClaim.opaqueObjectId}.md`;
 const requestedProjection=await fprojection();await forward.query('SELECT public.studio_rendition_attempt_start($1::uuid)',[fAttempt]);const renderingProjection=await fprojection();
 await forward.query('SELECT public.studio_rendition_attempt_rendered($1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text,$7::text,$8::text,$9::text)',[fAttempt,fKey,'c'.repeat(64),256,'text/markdown; charset=utf-8','forward.md',generation.renditionClaim.rendererVersion,generation.renditionClaim.templateVersion,generation.renditionClaim.contentSchemaVersion]);const uploadedProjection=await fprojection();
 await forward.query("SELECT public.studio_rendition_attempt_fail($1::uuid,'UPLOAD_OUTCOME_UNKNOWN')",[fAttempt]);const requiredProjection=await fprojection();const fRecon=(await forward.query('SELECT public.studio_rendition_reconciliation_claim($1::uuid) claim',[fAttempt])).rows[0].claim;const reconcilingProjection=await fprojection();await forward.query('SELECT public.studio_rendition_reconciliation_complete($1::uuid,$2::bigint)',[fAttempt,fRecon.fence]);const availableProjection=await fprojection();const fRendition=availableProjection.renditions[0];
 const crossCommandKey='forward-cross-command-same-key';
 const crossRetentionCommand={commandType:'studio.retention.policy.publish',actorId:fbase.requester,organizationId:fbase.org,workspaceId:fbase.workspace,requestId:`77000000-0000-4000-8000-${String(++fOrdinal).padStart(12,'0')}`,idempotencyKey:crossCommandKey,authorizationVersion:fbase.authorizationVersions[fbase.requester],payload:{artifactType:'brd',retentionDays:31,indefinite:false,rationale:'cross-command retention evidence'}};
 const crossHoldCommand={commandType:'studio.legal_hold.place',actorId:fbase.requester,organizationId:fbase.org,workspaceId:fbase.workspace,requestId:`77000000-0000-4000-8000-${String(++fOrdinal).padStart(12,'0')}`,idempotencyKey:crossCommandKey,authorizationVersion:fbase.authorizationVersions[fbase.requester],payload:{renditionId:fRendition.id,rationale:'cross-command hold evidence'}};
 const crossRetention=await privateCommand(forward,crossRetentionCommand);const crossHold=await privateCommand(forward,crossHoldCommand);const crossRetentionReplay=await privateCommand(forward,crossRetentionCommand);const crossHoldReplay=await privateCommand(forward,crossHoldCommand);
 const crossRetentionChanged=await Promise.allSettled([privateCommand(forward,{...crossRetentionCommand,payload:{...crossRetentionCommand.payload,retentionDays:32}})]);
 const crossCommandRows=(await forward.query('SELECT command_type,id FROM studio_private_artifact_command_receipts WHERE org_id=$1::uuid AND actor_id=$2::uuid AND idempotency_key=$3::text ORDER BY command_type',[fbase.org,fbase.requester,crossCommandKey])).rows;
 await fcommand('studio.legal_hold.release',fbase.requester,{renditionId:fRendition.id,holdId:crossHold.resource.holdId,rationale:'release cross-command evidence hold'},'forward-cross-command-hold-release');
 const holdOne=await fcommand('studio.legal_hold.place',fbase.requester,{renditionId:fRendition.id,rationale:'first safe hold'},'forward-hold-one');const holdTwo=await fcommand('studio.legal_hold.place',fbase.requester,{renditionId:fRendition.id,rationale:'second safe hold'},'forward-hold-two');const holdsProjection=await fprojection();
 await fcommand('studio.legal_hold.release',fbase.requester,{renditionId:fRendition.id,holdId:holdOne.resource.holdId,rationale:'release exact first hold'},'forward-hold-release');
 const deletionPending=await fcommand('studio.rendition.deletion.request',fbase.requester,{renditionId:fRendition.id,rationale:'pending rejection evidence'},'forward-delete-pending');await forward.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`,[fbase.requester]);const pendingProjection=await fprojection();const rejected=await fcommand('studio.rendition.deletion.resolve',fbase.approver,{renditionId:fRendition.id,deletionRequestId:deletionPending.resource.deletionRequestId,outcome:'reject',rationale:'independent rejection'},'forward-delete-reject');
 const indefinitePolicy=await fcommand('studio.retention.policy.publish',fbase.requester,{artifactType:'brd',retentionDays:null,indefinite:true,rationale:'indefinite forward evidence'},'forward-policy-indefinite');
 const extensionFinite=await fcommand('studio.rendition.retention.extend',fbase.requester,{renditionId:fRendition.id,extendUntil:new Date(Date.now()+86400000*60).toISOString(),indefinite:false,rationale:'finite extension'},'forward-extension-finite');
 const extensionIndefinite=await fcommand('studio.rendition.retention.extend',fbase.requester,{renditionId:fRendition.id,extendUntil:null,indefinite:true,rationale:'indefinite extension'},'forward-extension-indefinite');
 const acceptedProjection=(await fresh.query('SELECT public.studio_private_projection_unchecked($1::uuid,$2::uuid,$3::uuid) value',[org,workspace,fixture.artifactVersionId])).rows[0].value;
 const projectionKeys=['approved','artifactId','artifactType','artifactVersion','artifactVersionId','readOnly','renditions'];const renditionKeys=['activeHolds','byteLength','deletion','failureCode','filename','format','id','legalHoldActive','mimeType','rendererVersion','retentionMode','retentionUntil','sha256','state','updatedAt','version'];
 const migrationForward=await readFile(join('supabase/migrations',feature),'utf8');const rpcDef=(await forward.query("SELECT pg_get_function_identity_arguments('public.studio_private_artifact_projection(uuid,uuid,uuid)'::regprocedure) args")).rows[0].args;
 const decoderDir=await mkdtemp(join(tmpdir(),'studio-forward-projection-'));const decoderFile=join(decoderDir,'projection.json');await writeFile(decoderFile,JSON.stringify(availableProjection));
 const projectionPrivateFree=value=>!/(studio-private-artifacts|objectKey|bucket|signedUrl|rationale|actorId|attempts)/i.test(JSON.stringify(value));
 const forwardChecks=[
  async()=>assert.equal(rpcDef,'p_org uuid, p_workspace uuid, p_artifact_version uuid'),
  async()=>assert.deepEqual(emptyProjection.renditions,[]),
  async()=>assert.equal(requestedProjection.renditions[0].state,'requested'),
  async()=>assert.equal(renderingProjection.renditions[0].state,'rendering'),
  async()=>assert.equal(uploadedProjection.renditions[0].state,'uploading'),
  async()=>assert.equal(requiredProjection.renditions[0].state,'reconciliation_required'),
  async()=>assert.equal(reconcilingProjection.renditions[0].state,'reconciling'),
  async()=>assert.equal(availableProjection.renditions[0].state,'available'),
  async()=>assert.equal(availableProjection.renditions[0].retentionMode,'until'),
  async()=>assert.equal(acceptedProjection.renditions[0].retentionMode,'indefinite'),
  async()=>{assert.equal(holdsProjection.renditions[0].activeHolds.length,2);assert.deepEqual(Object.keys(holdsProjection.renditions[0].activeHolds[0]).sort(),['holdId','placedAt'])},
  async()=>{assert.equal(pendingProjection.renditions[0].deletion.state,'pending');assert.equal(pendingProjection.renditions[0].deletion.requesterIsCurrentActor,true)},
  async()=>assert.match(migrationForward,/r\.lifecycle = 'deleting'[\s\S]+ELSE r\.lifecycle/),
  async()=>assert.ok(migrationForward.includes("'deletion_reconciliation_required'")),
  async()=>assert.ok(migrationForward.includes("'deletion_failed'")),
  async()=>assert.ok(migrationForward.includes("'deleted'")),
  async()=>{assert.deepEqual(Object.keys(availableProjection).sort(),projectionKeys);assert.deepEqual(Object.keys(availableProjection.renditions[0]).sort(),renditionKeys);assert.equal(projectionPrivateFree(availableProjection),true)},
  async()=>execFileSync(process.execPath,['scripts/decodeStudioPrivateArtifactProjection.mjs',decoderFile,fbase.artifactId,fbase.artifactVersionId],{stdio:'inherit'}),
  async()=>assert.equal(publishFinite.resource.indefinite,false),
  async()=>assert.equal(indefinitePolicy.resource.indefinite,true),
  async()=>assert.equal(extensionFinite.resource.retention.indefinite,false),
  async()=>assert.equal(extensionIndefinite.resource.retention.indefinite,true),
  async()=>assert.ok(holdOne.resource.holdId),
  async()=>assert.equal((await forward.query("SELECT count(*)::int n FROM studio_rendition_legal_hold_events WHERE hold_id=$1::uuid AND event_type='released'",[holdOne.resource.holdId])).rows[0].n,1),
  async()=>assert.ok(deletionPending.resource.deletionRequestId),
  async()=>assert.equal(crossLayerCounts.providerDeletes,1),
  async()=>assert.equal(rejected.resource.status,'rejected'),
  async()=>await assert.rejects(privateCommand(forward,{commandType:'studio.rendition.generate',actorId:fbase.requester,organizationId:fbase.org,workspaceId:fbase.workspace,requestId:`77000000-0000-4000-8000-${String(++fOrdinal).padStart(12,'0')}`,idempotencyKey:'forward-stale-artifact',authorizationVersion:fbase.authorizationVersions[fbase.requester],expectedArtifactVersion:fbase.version.version+1,expectedRenditionVersion:null,payload:{artifactId:fbase.artifactId,artifactVersionId:fbase.artifactVersionId,format:'pdf'}}),/VERSION_CONFLICT/),
  async()=>await assert.rejects(privateCommand(forward,{commandType:'studio.legal_hold.place',actorId:fbase.requester,organizationId:fbase.org,workspaceId:fbase.workspace,requestId:`77000000-0000-4000-8000-${String(++fOrdinal).padStart(12,'0')}`,idempotencyKey:'forward-stale-rendition',authorizationVersion:fbase.authorizationVersions[fbase.requester],expectedArtifactVersion:fbase.version.version,expectedRenditionVersion:1,payload:{renditionId:fRendition.id,rationale:'stale'}}),/VERSION_CONFLICT/),
  async()=>assert.equal(contractParityPassed,true),
  async()=>assert.match(migrationForward,/x\.state IN \('requested','rendering','uploaded','reconciliation_required','reconciling','failed'\)/),
  async()=>assert.match(migrationForward,/WHEN x\.state IN \('requested','rendering'\) THEN 'pre_render'[\s\S]+WHEN x\.state = 'reconciling' THEN x\.reconciliation_phase/),
  async()=>assert.equal(reconciliationCounts.renditionProviderUploads>=0,true),
  async()=>assert.equal(reconciliationCounts.renditionProviderUploads>=1,true),
  async()=>assert.equal(reconciliationCounts.renditionProviderUploads<=1,true),
  async()=>assert.equal(crossLayerCounts.uploads,1),
  async()=>assert.match(migrationForward,/a\.state IN \('requested','executing'\)/),
  async()=>assert.equal(reconciliationCounts.deletionProviderDeletes>=0,true),
  async()=>assert.equal(reconciliationCounts.deletionProviderDeletes,1),
  async()=>assert.equal(crossLayerCounts.providerDeletes,1),
  async()=>assert.match(migrationForward,/execution_claimed_at > now\(\) - interval '5 minutes' THEN RETURN NULL/),
  async()=>assert.match(migrationForward,/FOR UPDATE[\s\S]+execution_fence = next_fence/),
  async()=>assert.match(migrationForward,/RECONCILIATION_EXHAUSTED/),
  async()=>assert.match(migrationForward,/DELETION_RECONCILIATION_EXHAUSTED/),
  async()=>assert.match(migrationForward,/studio_private_artifact_reconciliation_due[\s\S]+LIMIT p_limit/),
  async()=>assert.match(migrationForward,/state_changed_at <= now\(\) - interval '5 minutes'/),
  async()=>{if(raceEvidence.holdWon)assert.equal(raceEvidence.deletionAttempts,0);else assert.equal(raceEvidence.activeHolds,0)},
  async()=>{if(raceEvidence.deletionWon)assert.equal(raceEvidence.activeHolds,0);else assert.equal(raceEvidence.deletionAttempts,0)},
  async()=>assert.equal(raceEvidence.activeHolds>0&&raceEvidence.deletionAttempts>0,false),
  async()=>assert.match(migrationForward,/studio_rendition_deletion_execution_claim[\s\S]+holds > 0/),
  async()=>assert.equal(raceEvidence.lifecycle==='deleted'&&raceEvidence.activeHolds>0,false),
  async()=>assert.deepEqual(raceOutcomes.map(item=>item.status).sort(),['fulfilled','rejected']),
  async()=>assert.match(migrationForward,/studio_private_artifact_command_claim\(p_command jsonb\)[\s\S]+?#variable_conflict use_variable[\s\S]+?receipt\.org_id = org\s+AND receipt\.actor_id = actor\s+AND receipt\.command_type = command_type\s+AND receipt\.idempotency_key = command_idempotency_key/s),
  async()=>assert.notEqual(crossRetention.receiptId,crossHold.receiptId),
  async()=>assert.deepEqual({outcome:crossRetentionReplay.outcome,receiptId:crossRetentionReplay.receiptId},{outcome:'replayed',receiptId:crossRetention.receiptId}),
  async()=>assert.deepEqual({outcome:crossHoldReplay.outcome,receiptId:crossHoldReplay.receiptId},{outcome:'replayed',receiptId:crossHold.receiptId}),
  async()=>assert.equal(crossRetentionChanged[0].status==='rejected'&&/IDEMPOTENCY_CONFLICT/.test(String(crossRetentionChanged[0].reason)),true),
  async()=>{assert.equal(crossCommandRows.length,2);assert.deepEqual(Object.fromEntries(crossCommandRows.map(row=>[row.command_type,row.id])),{'studio.legal_hold.place':crossHold.receiptId,'studio.retention.policy.publish':crossRetention.receiptId})}
 ];
 assert.equal(forwardChecks.length,58);for(let index=0;index<forwardChecks.length;index++)await scenario(fNames[index],forwardChecks[index]);await rm(decoderDir,{recursive:true,force:true});
 const lifecycleNames=scenarioNames.lifecycleTruth;let lifecycleOrdinal=810;
 const lifecycleUuid=()=>`88000000-0000-4000-8000-${String(++lifecycleOrdinal).padStart(12,'0')}`;
 const prepareDisposable=async(db,label)=>{
  const base=await createApprovedStudioFixture(db);
  await privateCommand(db,{commandType:'studio.retention.policy.publish',actorId:base.requester,organizationId:base.org,workspaceId:base.workspace,requestId:lifecycleUuid(),idempotencyKey:`${label}-retention-zero`,authorizationVersion:base.authorizationVersions[base.requester],payload:{artifactType:'brd',retentionDays:0,indefinite:false,rationale:'expired lifecycle evidence'}});
  const generationCommand={commandType:'studio.rendition.generate',actorId:base.requester,organizationId:base.org,workspaceId:base.workspace,requestId:lifecycleUuid(),idempotencyKey:`${label}-generation`,authorizationVersion:base.authorizationVersions[base.requester],payload:{artifactVersionId:base.artifactVersionId,format:'markdown'}};
  const generation=await privateCommand(db,generationCommand);const claim=generation.renditionClaim;const objectKey=`${base.org}/${base.workspace}/studio-artifacts/${claim.opaqueObjectId}.md`;
  await db.query('SELECT public.studio_rendition_attempt_start($1::uuid)',[claim.attemptId]);
  await db.query('SELECT public.studio_rendition_attempt_rendered($1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text,$7::text,$8::text,$9::text)',[claim.attemptId,objectKey,'e'.repeat(64),128,'text/markdown; charset=utf-8','lifecycle.md',claim.rendererVersion,claim.templateVersion,claim.contentSchemaVersion]);
  const completion=(await db.query('SELECT public.studio_rendition_attempt_complete($1::uuid) result',[claim.attemptId])).rows[0].result;
  return{base,generationCommand,generation,claim,objectKey,renditionId:completion.renditionId};
 };
 const prepareDeletionExecution=async(db,label)=>{
  const fixture=await prepareDisposable(db,label);
  const request=await privateCommand(db,{commandType:'studio.rendition.deletion.request',actorId:fixture.base.requester,organizationId:fixture.base.org,workspaceId:fixture.base.workspace,requestId:lifecycleUuid(),idempotencyKey:`${label}-delete-request`,authorizationVersion:fixture.base.authorizationVersions[fixture.base.requester],payload:{renditionId:fixture.renditionId,rationale:`${label} deletion evidence`}});
  const approval=await privateCommand(db,{commandType:'studio.rendition.deletion.resolve',actorId:fixture.base.approver,organizationId:fixture.base.org,workspaceId:fixture.base.workspace,requestId:lifecycleUuid(),idempotencyKey:`${label}-delete-approval`,authorizationVersion:fixture.base.authorizationVersions[fixture.base.approver],payload:{renditionId:fixture.renditionId,deletionRequestId:request.resource.deletionRequestId,outcome:'approve',rationale:`${label} independent approval`}});
  const execution=(await db.query('SELECT public.studio_rendition_deletion_execution_claim($1::uuid) claim',[approval.deletionClaim.deletionAttemptId])).rows[0].claim;
  assert.ok(execution);
  return{fixture,request,approval,execution};
 };
 const extensionWinner=await prepareDisposable(retentionRace,'retention-winner');
 const extensionDeleteRequest=await privateCommand(retentionRace,{commandType:'studio.rendition.deletion.request',actorId:extensionWinner.base.requester,organizationId:extensionWinner.base.org,workspaceId:extensionWinner.base.workspace,requestId:lifecycleUuid(),idempotencyKey:'retention-winner-delete-request',authorizationVersion:extensionWinner.base.authorizationVersions[extensionWinner.base.requester],payload:{renditionId:extensionWinner.renditionId,rationale:'race request'}});
 await retentionRace.query('BEGIN');await retentionRace.query('SELECT id FROM studio_renditions WHERE id=$1::uuid FOR UPDATE',[extensionWinner.renditionId]);
 const blockedApprovalPromise=privateCommand(retentionRacePeer,{commandType:'studio.rendition.deletion.resolve',actorId:extensionWinner.base.approver,organizationId:extensionWinner.base.org,workspaceId:extensionWinner.base.workspace,requestId:lifecycleUuid(),idempotencyKey:'retention-winner-approval',authorizationVersion:extensionWinner.base.authorizationVersions[extensionWinner.base.approver],payload:{renditionId:extensionWinner.renditionId,deletionRequestId:extensionDeleteRequest.resource.deletionRequestId,outcome:'approve',rationale:'independent race approval'}});
 const extensionReceipt=await privateCommand(retentionRace,{commandType:'studio.rendition.retention.extend',actorId:extensionWinner.base.requester,organizationId:extensionWinner.base.org,workspaceId:extensionWinner.base.workspace,requestId:lifecycleUuid(),idempotencyKey:'retention-winner-extension',authorizationVersion:extensionWinner.base.authorizationVersions[extensionWinner.base.requester],payload:{renditionId:extensionWinner.renditionId,extendUntil:new Date(Date.now()+86400000).toISOString(),indefinite:false,rationale:'retention wins first'}});
 await retentionRace.query('COMMIT');const blockedApproval=await Promise.allSettled([blockedApprovalPromise]);const extensionRaceEvidence={extensionReceipt:extensionReceipt.receiptId,providerDeletes:0,approvalRejected:blockedApproval[0].status==='rejected',extended:(await retentionRace.query('SELECT public.studio_effective_retention($1::uuid) value',[extensionWinner.renditionId])).rows[0].value.retentionUntil};

 const deletionWinner=await prepareDisposable(deletionRace,'deletion-winner');
 const deletionWinnerRequest=await privateCommand(deletionRace,{commandType:'studio.rendition.deletion.request',actorId:deletionWinner.base.requester,organizationId:deletionWinner.base.org,workspaceId:deletionWinner.base.workspace,requestId:lifecycleUuid(),idempotencyKey:'deletion-winner-request',authorizationVersion:deletionWinner.base.authorizationVersions[deletionWinner.base.requester],payload:{renditionId:deletionWinner.renditionId,rationale:'execution winner request'}});
 const deletionWinnerApproval=await privateCommand(deletionRace,{commandType:'studio.rendition.deletion.resolve',actorId:deletionWinner.base.approver,organizationId:deletionWinner.base.org,workspaceId:deletionWinner.base.workspace,requestId:lifecycleUuid(),idempotencyKey:'deletion-winner-approval',authorizationVersion:deletionWinner.base.authorizationVersions[deletionWinner.base.approver],payload:{renditionId:deletionWinner.renditionId,deletionRequestId:deletionWinnerRequest.resource.deletionRequestId,outcome:'approve',rationale:'execution winner approval'}});
 const executionClaim=(await deletionRacePeer.query('SELECT public.studio_rendition_deletion_execution_claim($1::uuid) claim',[deletionWinnerApproval.deletionClaim.deletionAttemptId])).rows[0].claim;
 const lateExtension=await Promise.allSettled([privateCommand(deletionRace,{commandType:'studio.rendition.retention.extend',actorId:deletionWinner.base.requester,organizationId:deletionWinner.base.org,workspaceId:deletionWinner.base.workspace,requestId:lifecycleUuid(),idempotencyKey:'deletion-winner-late-extension',authorizationVersion:deletionWinner.base.authorizationVersions[deletionWinner.base.requester],payload:{renditionId:deletionWinner.renditionId,extendUntil:new Date(Date.now()+86400000).toISOString(),indefinite:false,rationale:'must lose after execution'}})]);
 let deletionWinnerProviderDeletes=0;if(executionClaim){deletionWinnerProviderDeletes+=1;await deletionRace.query("SELECT public.studio_rendition_deletion_complete($1::uuid,$2::bigint,'deleted')",[executionClaim.deletionAttemptId,executionClaim.fence])}
 const deletionWinnerState=(await deletionRace.query('SELECT lifecycle FROM studio_renditions WHERE id=$1::uuid',[deletionWinner.renditionId])).rows[0].lifecycle;
 const deletionWinnerAudit=(await deletionRace.query("SELECT actor_id,request_id,resource_version,metadata FROM privileged_audit_events WHERE action='studio.rendition.deletion.complete' AND resource_id=$1::uuid",[deletionWinner.renditionId])).rows;
 const beforeTombstoneCounts=(await deletionRace.query('SELECT (SELECT count(*)::int FROM studio_private_artifact_command_receipts) receipts,(SELECT count(*)::int FROM studio_rendition_attempts) attempts,(SELECT count(*)::int FROM studio_renditions) renditions')).rows[0];
 const tombstoneRegeneration=await Promise.allSettled([privateCommand(deletionRace,{commandType:'studio.rendition.generate',actorId:deletionWinner.base.requester,organizationId:deletionWinner.base.org,workspaceId:deletionWinner.base.workspace,requestId:lifecycleUuid(),idempotencyKey:'deleted-tombstone-new-generation',authorizationVersion:deletionWinner.base.authorizationVersions[deletionWinner.base.requester],payload:{artifactVersionId:deletionWinner.base.artifactVersionId,format:'markdown'}})]);
 const afterTombstoneCounts=(await deletionRace.query('SELECT (SELECT count(*)::int FROM studio_private_artifact_command_receipts) receipts,(SELECT count(*)::int FROM studio_rendition_attempts) attempts,(SELECT count(*)::int FROM studio_renditions) renditions')).rows[0];
 const originalReplay=await privateCommand(deletionRace,deletionWinner.generationCommand);const afterReplayCounts=(await deletionRace.query('SELECT (SELECT count(*)::int FROM studio_private_artifact_command_receipts) receipts,(SELECT count(*)::int FROM studio_rendition_attempts) attempts,(SELECT count(*)::int FROM studio_renditions) renditions')).rows[0];
 const tombstoneEvidence={rejected:tombstoneRegeneration[0].status==='rejected',before:beforeTombstoneCounts,after:afterTombstoneCounts,afterReplay:afterReplayCounts,providerUploads:0,objectCount:0,tombstones:Number((await deletionRace.query("SELECT count(*)::int n FROM studio_renditions WHERE id=$1::uuid AND lifecycle='deleted'",[deletionWinner.renditionId])).rows[0].n),replayCount:originalReplay.outcome==='replayed'?1:0};

 const retryFixture=await prepareDisposable(deletionRetry,'deletion-retry');
 const retryFirstRequest=await privateCommand(deletionRetry,{commandType:'studio.rendition.deletion.request',actorId:retryFixture.base.requester,organizationId:retryFixture.base.org,workspaceId:retryFixture.base.workspace,requestId:lifecycleUuid(),idempotencyKey:'retry-first-request',authorizationVersion:retryFixture.base.authorizationVersions[retryFixture.base.requester],payload:{renditionId:retryFixture.renditionId,rationale:'first request'}});
 const retryApproval=await privateCommand(deletionRetry,{commandType:'studio.rendition.deletion.resolve',actorId:retryFixture.base.approver,organizationId:retryFixture.base.org,workspaceId:retryFixture.base.workspace,requestId:lifecycleUuid(),idempotencyKey:'retry-first-approval',authorizationVersion:retryFixture.base.authorizationVersions[retryFixture.base.approver],payload:{renditionId:retryFixture.renditionId,deletionRequestId:retryFirstRequest.resource.deletionRequestId,outcome:'approve',rationale:'first approval'}});
 const retryExecution=(await deletionRetry.query('SELECT public.studio_rendition_deletion_execution_claim($1::uuid) claim',[retryApproval.deletionClaim.deletionAttemptId])).rows[0].claim;
 const retryStaleBefore=(await deletionRetry.query("SELECT a.state,r.lifecycle,r.lifecycle_version,(SELECT count(*)::int FROM privileged_audit_events e WHERE e.action='studio.rendition.deletion.fail' AND e.metadata->>'deletionAttemptId'=$1::text) audit_count FROM studio_rendition_deletion_attempts a JOIN studio_renditions r ON r.id=a.rendition_id WHERE a.id=$1::uuid",[retryExecution.deletionAttemptId])).rows[0];
 const retryStaleFence=await Promise.allSettled([deletionRetry.query("SELECT public.studio_rendition_deletion_fail($1::uuid,$2::bigint,'STORAGE_DELETE_FAILED')",[retryExecution.deletionAttemptId,retryExecution.fence+1])]);
 const retryStaleAfter=(await deletionRetry.query("SELECT a.state,r.lifecycle,r.lifecycle_version,(SELECT count(*)::int FROM privileged_audit_events e WHERE e.action='studio.rendition.deletion.fail' AND e.metadata->>'deletionAttemptId'=$1::text) audit_count FROM studio_rendition_deletion_attempts a JOIN studio_renditions r ON r.id=a.rendition_id WHERE a.id=$1::uuid",[retryExecution.deletionAttemptId])).rows[0];
 await deletionRetry.query("SELECT public.studio_rendition_deletion_fail($1::uuid,$2::bigint,'STORAGE_DELETE_FAILED')",[retryExecution.deletionAttemptId,retryExecution.fence]);
 const retryTerminalAudit=(await deletionRetry.query("SELECT actor_id,request_id,outcome,resource_version,metadata FROM privileged_audit_events WHERE action='studio.rendition.deletion.fail' AND metadata->>'deletionAttemptId'=$1::text",[retryExecution.deletionAttemptId])).rows;
 const retryDuplicateFailure=await Promise.allSettled([deletionRetry.query("SELECT public.studio_rendition_deletion_fail($1::uuid,$2::bigint,'STORAGE_DELETE_FAILED')",[retryExecution.deletionAttemptId,retryExecution.fence])]);
 const retryTerminalAuditCount=Number((await deletionRetry.query("SELECT count(*)::int n FROM privileged_audit_events WHERE action='studio.rendition.deletion.fail' AND metadata->>'deletionAttemptId'=$1::text",[retryExecution.deletionAttemptId])).rows[0].n);
 const failedVersion=Number((await deletionRetry.query('SELECT lifecycle_version FROM studio_renditions WHERE id=$1::uuid',[retryFixture.renditionId])).rows[0].lifecycle_version);const staleReceiptsBefore=Number((await deletionRetry.query('SELECT count(*)::int n FROM studio_private_artifact_command_receipts')).rows[0].n);
 const staleRetry=await Promise.allSettled([privateCommand(deletionRetry,{commandType:'studio.rendition.deletion.request',actorId:retryFixture.base.requester,organizationId:retryFixture.base.org,workspaceId:retryFixture.base.workspace,requestId:lifecycleUuid(),idempotencyKey:'retry-stale-request',authorizationVersion:retryFixture.base.authorizationVersions[retryFixture.base.requester],expectedArtifactVersion:retryFixture.base.version.version,expectedRenditionVersion:failedVersion-1,payload:{renditionId:retryFixture.renditionId,rationale:'stale retry'}})]);
 const retrySecondRequest=await privateCommand(deletionRetry,{commandType:'studio.rendition.deletion.request',actorId:retryFixture.base.requester,organizationId:retryFixture.base.org,workspaceId:retryFixture.base.workspace,requestId:lifecycleUuid(),idempotencyKey:'retry-second-request',authorizationVersion:retryFixture.base.authorizationVersions[retryFixture.base.requester],payload:{renditionId:retryFixture.renditionId,rationale:'governed retry'}});
 const duplicateReceiptsBefore=Number((await deletionRetry.query('SELECT count(*)::int n FROM studio_private_artifact_command_receipts')).rows[0].n);const duplicateRetry=await Promise.allSettled([privateCommand(deletionRetry,{commandType:'studio.rendition.deletion.request',actorId:retryFixture.base.requester,organizationId:retryFixture.base.org,workspaceId:retryFixture.base.workspace,requestId:lifecycleUuid(),idempotencyKey:'retry-duplicate-pending',authorizationVersion:retryFixture.base.authorizationVersions[retryFixture.base.requester],payload:{renditionId:retryFixture.renditionId,rationale:'duplicate pending'}})]);
 const retryCounts=(await deletionRetry.query('SELECT (SELECT count(*)::int FROM studio_rendition_deletion_requests WHERE rendition_id=$1::uuid) requests,(SELECT count(*)::int FROM studio_rendition_deletion_resolutions WHERE rendition_id=$1::uuid) resolutions,(SELECT count(*)::int FROM studio_rendition_deletion_attempts WHERE rendition_id=$1::uuid) attempts,(SELECT count(*)::int FROM studio_private_artifact_command_receipts) receipts',[retryFixture.renditionId])).rows[0];

 const missingCompletion=await prepareDeletionExecution(auditCompletionDb,'audit-missing-completion');
 await auditCompletionDb.query(`CREATE FUNCTION public.reject_studio_deletion_completion_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='studio.rendition.deletion.complete' THEN RAISE EXCEPTION 'forced audit insertion failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_studio_deletion_completion_audit BEFORE INSERT ON public.privileged_audit_events FOR EACH ROW EXECUTE FUNCTION public.reject_studio_deletion_completion_audit()`);
 const atomicBefore=(await auditCompletionDb.query("SELECT a.state,r.lifecycle,r.lifecycle_version,(SELECT count(*)::int FROM privileged_audit_events e WHERE e.action='studio.rendition.deletion.complete' AND e.metadata->>'deletionAttemptId'=$1::text) audit_count FROM studio_rendition_deletion_attempts a JOIN studio_renditions r ON r.id=a.rendition_id WHERE a.id=$1::uuid",[missingCompletion.execution.deletionAttemptId])).rows[0];
 const forcedAuditFailure=await Promise.allSettled([auditCompletionDb.query("SELECT public.studio_rendition_deletion_complete($1::uuid,$2::bigint,'missing')",[missingCompletion.execution.deletionAttemptId,missingCompletion.execution.fence])]);
 const atomicAfter=(await auditCompletionDb.query("SELECT a.state,r.lifecycle,r.lifecycle_version,(SELECT count(*)::int FROM privileged_audit_events e WHERE e.action='studio.rendition.deletion.complete' AND e.metadata->>'deletionAttemptId'=$1::text) audit_count FROM studio_rendition_deletion_attempts a JOIN studio_renditions r ON r.id=a.rendition_id WHERE a.id=$1::uuid",[missingCompletion.execution.deletionAttemptId])).rows[0];
 await auditCompletionDb.query('DROP TRIGGER reject_studio_deletion_completion_audit ON public.privileged_audit_events; DROP FUNCTION public.reject_studio_deletion_completion_audit()');
 await auditCompletionDb.query("SELECT public.studio_rendition_deletion_complete($1::uuid,$2::bigint,'missing')",[missingCompletion.execution.deletionAttemptId,missingCompletion.execution.fence]);
 const missingCompletionAudit=(await auditCompletionDb.query("SELECT e.actor_id,e.request_id,e.outcome,e.resource_version,e.metadata,d.resolved_by,cr.request_id accepted_request_id,r.lifecycle_version FROM privileged_audit_events e JOIN studio_rendition_deletion_attempts a ON a.id=(e.metadata->>'deletionAttemptId')::uuid JOIN studio_rendition_deletion_resolutions d ON d.id=a.resolution_id JOIN studio_private_artifact_command_receipts cr ON cr.id=d.receipt_id JOIN studio_renditions r ON r.id=e.resource_id WHERE e.action='studio.rendition.deletion.complete' AND e.metadata->>'deletionAttemptId'=$1::text",[missingCompletion.execution.deletionAttemptId])).rows;
 const duplicateCompletion=await Promise.allSettled([auditCompletionDb.query("SELECT public.studio_rendition_deletion_complete($1::uuid,$2::bigint,'missing')",[missingCompletion.execution.deletionAttemptId,missingCompletion.execution.fence])]);
 const missingCompletionAuditCount=Number((await auditCompletionDb.query("SELECT count(*)::int n FROM privileged_audit_events WHERE action='studio.rendition.deletion.complete' AND metadata->>'deletionAttemptId'=$1::text",[missingCompletion.execution.deletionAttemptId])).rows[0].n);

 const uncertainDeletion=await prepareDeletionExecution(auditFailureDb,'audit-uncertain-failure');
 await auditFailureDb.query("SELECT public.studio_rendition_deletion_fail($1::uuid,$2::bigint,'DELETE_OUTCOME_UNKNOWN')",[uncertainDeletion.execution.deletionAttemptId,uncertainDeletion.execution.fence]);
 await auditFailureDb.query('SELECT public.studio_deletion_reconciliation_claim($1::uuid)',[uncertainDeletion.execution.deletionAttemptId]);
 const tombstoneExecution=(await auditFailureDb.query('SELECT public.studio_rendition_deletion_execution_claim($1::uuid) claim',[uncertainDeletion.execution.deletionAttemptId])).rows[0].claim;
 await auditFailureDb.query("SELECT public.studio_rendition_deletion_fail($1::uuid,$2::bigint,'TOMBSTONE_COMPLETION_FAILED')",[tombstoneExecution.deletionAttemptId,tombstoneExecution.fence]);
 await auditFailureDb.query('SELECT public.studio_deletion_reconciliation_claim($1::uuid)',[uncertainDeletion.execution.deletionAttemptId]);
 const finalUncertainExecution=(await auditFailureDb.query('SELECT public.studio_rendition_deletion_execution_claim($1::uuid) claim',[uncertainDeletion.execution.deletionAttemptId])).rows[0].claim;
 await auditFailureDb.query("SELECT public.studio_rendition_deletion_fail($1::uuid,$2::bigint,'DELETE_OUTCOME_UNKNOWN')",[finalUncertainExecution.deletionAttemptId,finalUncertainExecution.fence]);
 const exhaustionResult=(await auditFailureDb.query('SELECT public.studio_deletion_reconciliation_claim($1::uuid) claim',[uncertainDeletion.execution.deletionAttemptId])).rows[0].claim;
 const uncertainAudits=(await auditFailureDb.query("SELECT actor_id,request_id,outcome,resource_version,metadata FROM privileged_audit_events WHERE action='studio.rendition.deletion.fail' AND metadata->>'deletionAttemptId'=$1::text ORDER BY created_at,id",[uncertainDeletion.execution.deletionAttemptId])).rows;
 const exhaustionAudits=(await auditFailureDb.query("SELECT actor_id,request_id,outcome,resource_version,metadata FROM privileged_audit_events WHERE action='studio.rendition.deletion.reconciliation.exhausted' AND metadata->>'deletionAttemptId'=$1::text",[uncertainDeletion.execution.deletionAttemptId])).rows;
 const exhaustedState=(await auditFailureDb.query('SELECT a.state,a.failure_code,a.reconciliation_count,r.lifecycle,r.lifecycle_version FROM studio_rendition_deletion_attempts a JOIN studio_renditions r ON r.id=a.rendition_id WHERE a.id=$1::uuid',[uncertainDeletion.execution.deletionAttemptId])).rows[0];

 const pendingBase=await createApprovedStudioFixture(pendingRecovery);const pendingGeneration=await privateCommand(pendingRecovery,{commandType:'studio.rendition.generate',actorId:pendingBase.requester,organizationId:pendingBase.org,workspaceId:pendingBase.workspace,requestId:lifecycleUuid(),idempotencyKey:'pending-generation',authorizationVersion:pendingBase.authorizationVersions[pendingBase.requester],payload:{artifactVersionId:pendingBase.artifactVersionId,format:'pdf'}});
 const pendingAttemptBefore=(await pendingRecovery.query('SELECT state,receipt_id FROM studio_rendition_attempts WHERE id=$1::uuid',[pendingGeneration.renditionClaim.attemptId])).rows[0];await pendingRecovery.query("UPDATE studio_rendition_attempts SET state_changed_at=now()-interval '6 minutes' WHERE id=$1::uuid",[pendingGeneration.renditionClaim.attemptId]);
 const dueItems=(await pendingRecovery.query('SELECT public.studio_private_artifact_reconciliation_due(10) due')).rows[0].due;const pendingClaim=(await pendingRecovery.query('SELECT public.studio_rendition_reconciliation_claim($1::uuid) claim',[pendingGeneration.renditionClaim.attemptId])).rows[0].claim;const pendingObjectKey=`${pendingBase.org}/${pendingBase.workspace}/studio-artifacts/${pendingClaim.opaqueObjectId}.pdf`;
 await pendingRecovery.query('SELECT public.studio_rendition_reconciliation_rendered($1::uuid,$2::bigint,$3::text,$4::text,$5::bigint,$6::text,$7::text,$8::text,$9::text,$10::text)',[pendingClaim.attemptId,pendingClaim.fence,pendingObjectKey,'f'.repeat(64),256,'application/pdf','pending.pdf',pendingClaim.rendererVersion,pendingClaim.templateVersion,pendingClaim.contentSchemaVersion]);await pendingRecovery.query('SELECT public.studio_rendition_reconciliation_complete($1::uuid,$2::bigint)',[pendingClaim.attemptId,pendingClaim.fence]);
 const pendingRecoveredState=(await pendingRecovery.query('SELECT state FROM studio_rendition_attempts WHERE id=$1::uuid',[pendingGeneration.renditionClaim.attemptId])).rows[0].state;const handlerSource=await readFile('supabase/functions/_shared/studioPrivateArtifactHandler.ts','utf8');const pendingResponseSource=handlerSource.slice(handlerSource.indexOf('const committedPending'),handlerSource.indexOf('export const handleStudioPrivateArtifactCommand'));
 const lifecycleChecks=[
  async()=>assert.deepEqual({committed:Boolean(extensionRaceEvidence.extensionReceipt),approvalRejected:extensionRaceEvidence.approvalRejected,providerDeletes:extensionRaceEvidence.providerDeletes},{committed:true,approvalRejected:true,providerDeletes:0}),
  async()=>assert.deepEqual({claim:Boolean(executionClaim),extensionRejected:lateExtension[0].status==='rejected',providerDeletes:deletionWinnerProviderDeletes,state:deletionWinnerState},{claim:true,extensionRejected:true,providerDeletes:1,state:'deleted'}),
  async()=>assert.equal(Boolean(extensionRaceEvidence.extended)&&deletionWinnerState==='deleted'&&lateExtension[0].status==='fulfilled',false),
  async()=>assert.deepEqual({rejected:tombstoneEvidence.rejected,receiptDelta:tombstoneEvidence.after.receipts-tombstoneEvidence.before.receipts,attemptDelta:tombstoneEvidence.after.attempts-tombstoneEvidence.before.attempts},{rejected:true,receiptDelta:0,attemptDelta:0}),
  async()=>assert.deepEqual({uploads:tombstoneEvidence.providerUploads,objects:tombstoneEvidence.objectCount,renditions:tombstoneEvidence.after.renditions,tombstones:tombstoneEvidence.tombstones},{uploads:0,objects:0,renditions:1,tombstones:1}),
  async()=>assert.deepEqual({replayCount:tombstoneEvidence.replayCount,counts:tombstoneEvidence.afterReplay},{replayCount:1,counts:tombstoneEvidence.after}),
  async()=>assert.deepEqual({requestId:Boolean(retrySecondRequest.resource.deletionRequestId),requests:retryCounts.requests},{requestId:true,requests:2}),
  async()=>assert.deepEqual({rejected:staleRetry[0].status==='rejected',receiptDelta:duplicateReceiptsBefore-staleReceiptsBefore-1},{rejected:true,receiptDelta:0}),
  async()=>assert.deepEqual(pendingAttemptBefore,{state:'requested',receipt_id:pendingGeneration.receiptId}),
  async()=>assert.deepEqual({resolutions:retryCounts.resolutions,attempts:retryCounts.attempts},{resolutions:1,attempts:1}),
  async()=>{assert.match(pendingResponseSource,/outcome: 'committed_reconciliation_pending'/);assert.match(pendingResponseSource,/receiptId: result\.receiptId/);assert.doesNotMatch(pendingResponseSource,/renditionClaim|deletionClaim|objectKey/)},
  async()=>assert.deepEqual({due:dueItems.some(item=>item.attemptId===pendingGeneration.renditionClaim.attemptId),state:pendingRecoveredState},{due:true,state:'available'}),
  async()=>assert.deepEqual({rejected:duplicateRetry[0].status==='rejected',receiptCount:retryCounts.receipts},{rejected:true,receiptCount:duplicateReceiptsBefore}),
  async()=>assert.deepEqual(retryCounts,{requests:2,resolutions:1,attempts:1,receipts:duplicateReceiptsBefore})
 ];
 assert.equal(lifecycleChecks.length,14);for(let index=0;index<lifecycleChecks.length;index++)await scenario(lifecycleNames[index],lifecycleChecks[index]);
 const auditNames=scenarioNames.auditEvidence;
 const allDeletionAuditMetadata=[...deletionWinnerAudit,...missingCompletionAudit,...retryTerminalAudit,...uncertainAudits,...exhaustionAudits].map(row=>row.metadata);
 const auditChecks=[
  async()=>assert.equal(deletionWinnerAudit.length,1),
  async()=>assert.equal(deletionWinnerAudit[0].metadata.providerOutcome,'deleted'),
  async()=>assert.deepEqual({count:missingCompletionAudit.length,providerOutcome:missingCompletionAudit[0].metadata.providerOutcome},{count:1,providerOutcome:'missing'}),
  async()=>{const rows=uncertainAudits.filter(row=>row.metadata.failureCode==='DELETE_OUTCOME_UNKNOWN'&&String(row.metadata.executionFence)===String(uncertainDeletion.execution.fence));assert.deepEqual(rows.map(row=>({outcome:row.outcome,targetState:row.metadata.targetState})),[{outcome:'succeeded',targetState:'reconciliation_required'}])},
  async()=>{const rows=uncertainAudits.filter(row=>row.metadata.failureCode==='TOMBSTONE_COMPLETION_FAILED');assert.deepEqual(rows.map(row=>({outcome:row.outcome,targetState:row.metadata.targetState})),[{outcome:'succeeded',targetState:'reconciliation_required'}])},
  async()=>assert.deepEqual(retryTerminalAudit.map(row=>({outcome:row.outcome,failureCode:row.metadata.failureCode,targetState:row.metadata.targetState})),[{outcome:'failed',failureCode:'STORAGE_DELETE_FAILED',targetState:'failed'}]),
  async()=>assert.deepEqual({claim:exhaustionResult,count:exhaustionAudits.length,state:exhaustedState.state,lifecycle:exhaustedState.lifecycle,failureCode:exhaustedState.failure_code,reconciliationCount:Number(exhaustedState.reconciliation_count)},{claim:null,count:1,state:'failed',lifecycle:'deletion_failed',failureCode:'DELETION_RECONCILIATION_EXHAUSTED',reconciliationCount:3}),
  async()=>assert.deepEqual({rejected:retryStaleFence[0].status==='rejected',before:retryStaleBefore,after:retryStaleAfter},{rejected:true,before:retryStaleBefore,after:retryStaleBefore}),
  async()=>assert.deepEqual({rejected:duplicateCompletion[0].status==='rejected',auditCount:missingCompletionAuditCount},{rejected:true,auditCount:1}),
  async()=>assert.deepEqual({rejected:retryDuplicateFailure[0].status==='rejected',auditCount:retryTerminalAuditCount},{rejected:true,auditCount:1}),
  async()=>assert.equal(missingCompletionAudit[0].actor_id,missingCompletionAudit[0].resolved_by),
  async()=>assert.equal(missingCompletionAudit[0].request_id,missingCompletionAudit[0].accepted_request_id),
  async()=>assert.equal(Number(missingCompletionAudit[0].resource_version),Number(missingCompletionAudit[0].lifecycle_version)),
  async()=>{for(const metadata of allDeletionAuditMetadata){const serialized=JSON.stringify(metadata);assert.doesNotMatch(serialized,/(objectKey|bucket|credential|signedUrl|privateClaim|serviceRole)/iu)}},
  async()=>assert.deepEqual({rejected:forcedAuditFailure[0].status==='rejected',before:atomicBefore,after:atomicAfter},{rejected:true,before:atomicBefore,after:atomicBefore})
 ];
 assert.equal(auditChecks.length,15);for(let index=0;index<auditChecks.length;index++)await scenario(auditNames[index],auditChecks[index]);
 console.log('LIFECYCLE TRUTH COUNTS '+JSON.stringify({retentionWins:{providerDeletes:extensionRaceEvidence.providerDeletes},deletionWins:{providerDeletes:deletionWinnerProviderDeletes},tombstoneRegeneration:{receiptDelta:tombstoneEvidence.after.receipts-tombstoneEvidence.before.receipts,attemptDelta:tombstoneEvidence.after.attempts-tombstoneEvidence.before.attempts,providerUploads:tombstoneEvidence.providerUploads,objects:tombstoneEvidence.objectCount},deletionRetry:{requests:retryCounts.requests,resolutions:retryCounts.resolutions,attempts:retryCounts.attempts},pendingRecovery:{initialState:pendingAttemptBefore.state,finalState:pendingRecoveredState}}));
 console.log('DELETION AUDIT COUNTS '+JSON.stringify({completedDeleted:deletionWinnerAudit.length,completedMissing:missingCompletionAudit.length,uncertainFailures:uncertainAudits.length,terminalFailures:retryTerminalAudit.length,exhaustion:exhaustionAudits.length,staleFence:retryStaleAfter.audit_count,completionReplay:missingCompletionAuditCount,failureReplay:retryTerminalAuditCount}));
 console.log('P1 CORRECTIVE COUNTS '+JSON.stringify({renditionPhase:renditionPhaseCounts,renditionLease:renditionLeaseCounts,recoveryControl:recoveryControlCounts,deletionClaimAudit:deletionClaimAuditCounts,deletionExecutionAuthority:deletionExecutionAuthorityCounts,deletionBinding:deletionBindingCounts}));
 console.log('DUE ACTIONABILITY COUNTS '+JSON.stringify(dueActionabilityCounts));
 console.log(`Studio private artifact PostgreSQL 16 scenarios: ${passed.length} passed, ${failed.length} failed.`);if(failed.length){console.error(`FAILED SCENARIOS ${JSON.stringify(failed)}`);process.exitCode=1}
}finally{for(const db of clients.reverse())if(db!==admin)await db.end().catch(()=>{});if(admin){for(const name of created.reverse())await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(()=>{process.exitCode=1});await admin.end().catch(()=>{})}}
