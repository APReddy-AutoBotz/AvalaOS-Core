import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

const connectionString = process.env.PROCESS_CREATION_DISPOSABLE_DATABASE_URL;
if (!connectionString) throw new Error('PROCESS_CREATION_DISPOSABLE_DATABASE_URL is required.');
const target = new URL(connectionString);
if (!['127.0.0.1','localhost','::1'].includes(target.hostname) || !target.pathname.slice(1).startsWith('avalaos_creation_access_')) {
  throw new Error('Process creation PostgreSQL tests require a named localhost disposable database.');
}
const client = new pg.Client({ connectionString });
const ids = Object.fromEntries(['actor','reader','org','workspace','foreignWorkspace','creatorRole','readerRole','process1','process2','process3','process4','templateProcess','deniedProcess','assessment','auditFailureProcess'].map(name => [name,crypto.randomUUID()]));
const request = () => crypto.randomUUID();
const rpc = async (actor, workspace, version, processId, requestId, key, description = '', templateId = null, name = 'Synthetic process', department = '', criticality = 'Medium', connection = client) => {
  const response = await connection.query(`SELECT public.create_assess_process(
    $1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::uuid,$6::text,0::bigint,
    $7::uuid,$8::text,$9::text,$10::text,$11::text,$12::text) AS value`,
    [actor,ids.org,workspace,version,requestId,key,processId,name,description,department,criticality,templateId]);
  return response.rows[0].value;
};
const count = async (table, where, values) => Number((await client.query(`SELECT count(*)::integer AS n FROM ${table} WHERE ${where}`,values)).rows[0].n);

let assertions = 0;
const check = (actual, expected) => { assert.equal(actual,expected); assertions++; };
try {
  await client.connect();
  check((await client.query(`SELECT to_regprocedure('public.create_assess_process(uuid,uuid,uuid,bigint,uuid,text,bigint,uuid,text,text,text,text,text)') IS NOT NULL AS ready`)).rows[0].ready,true);
  await client.query('BEGIN');
  await client.query('INSERT INTO auth.users(id) VALUES($1),($2)',[ids.actor,ids.reader]);
  await client.query('INSERT INTO public.profiles(id,email) VALUES($1,$2),($3,$4)',
    [ids.actor,'process-creator@example.invalid',ids.reader,'process-reader@example.invalid']);
  await client.query('INSERT INTO public.organizations(id,name,slug) VALUES($1,$2,$3)',[ids.org,'Process test','process-test-'+ids.org.slice(0,8)]);
  await client.query('INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,$3,$4),($5,$2,$6,$7)',
    [ids.workspace,ids.org,'Process workspace','primary',ids.foreignWorkspace,'Other workspace','other']);
  await client.query('INSERT INTO public.roles(id,org_id,name,slug,scope,permissions) VALUES($1,$2,$3,$4,$5,$6::jsonb),($7,$2,$8,$9,$5,$10::jsonb)',
    [ids.creatorRole,ids.org,'Creator','creator','organization','[]',ids.readerRole,'Reader','reader','[]']);
  await client.query('INSERT INTO public.organization_members(org_id,user_id,role_id,status) VALUES($1,$2,$3,$4),($1,$5,$6,$4)',
    [ids.org,ids.actor,ids.creatorRole,'active',ids.reader,ids.readerRole]);
  await client.query('INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,status) VALUES($1,$2,$3,$4),($1,$2,$5,$4)',
    [ids.org,ids.workspace,ids.actor,'active',ids.reader]);
  await client.query(`INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,'assess.read'),($1,'assess.process.create'),($1,'assess.create'),($1,'assess.response.write'),($2,'assess.read')`,
    [ids.creatorRole,ids.readerRole]);
  await client.query('INSERT INTO public.process_creation_workspace_controls(org_id,workspace_id,enabled,read_only,max_active_processes) VALUES($1,$2,true,false,2),($1,$3,true,false,2)',
    [ids.org,ids.workspace,ids.foreignWorkspace]);
  const epochs = (await client.query('SELECT user_id,version FROM public.authorization_versions WHERE org_id=$1',[ids.org])).rows;
  const epoch = new Map(epochs.map(row => [row.user_id,Number(row.version)]));
  const creatorVersion = epoch.get(ids.actor) ?? 1;
  const readerVersion = epoch.get(ids.reader) ?? 1;
  const req1 = request();
  const key1 = 'process.create.postgres-positive-0001';
  const committed = await rpc(ids.actor,ids.workspace,creatorVersion,ids.process1,req1,key1);
  check(committed.ok,true); check(committed.outcome,'committed');
  check(committed.resource.id,ids.process1); check(committed.resource.ownerId,ids.actor);
  check(committed.resource.workspaceId,ids.workspace); check(committed.resource.requestId,req1);
  check(await count('public.assess_processes','id=$1',[ids.process1]),1);
  check(await count('public.assess_command_receipts','org_id=$1 AND actor_id=$2 AND command_type=$3 AND request_id=$4',[ids.org,ids.actor,'process.create',req1]),1);
  check(await count('public.privileged_audit_events','org_id=$1 AND actor_id=$2 AND action=$3 AND request_id=$4',[ids.org,ids.actor,'process.create',req1]),1);
  // Continue the actual existing V1 command path from the newly committed
  // process, then reopen through authenticated tenant-scoped RLS projection.
  const assessmentCreateRequest = request();
  const assessmentCreate = (await client.query(`SELECT public.pr1b_create_assessment($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::text,$8::bigint) AS value`,
    [ids.actor,ids.org,ids.workspace,ids.process1,ids.assessment,assessmentCreateRequest,'assessment.create.process-test-0001',creatorVersion])).rows[0].value;
  check(assessmentCreate.ok,true);
  check(assessmentCreate.resource.assessmentId,ids.assessment);
  const v1Draft = { responses: { processStructure: { standardization: 2 }, workPattern: {}, dataProfile: {}, judgment: {}, systems: {}, risk: {} },
    metadata: { completionQuality: 0, lastSavedAt: '2026-09-15T00:00:00Z' }, evidenceItems: [], assumptions: [] };
  const assessmentSave = (await client.query(`SELECT public.pr1b_upsert_assessment_responses($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb,$6::bigint,$7::uuid,$8::text,$9::bigint) AS value`,
    [ids.actor,ids.org,ids.workspace,ids.assessment,JSON.stringify(v1Draft),1,request(),'assessment.response.process-test-0001',creatorVersion])).rows[0].value;
  check(assessmentSave.ok,true);
  check(assessmentSave.resource.version,2);
  await client.query(`SELECT set_config('request.jwt.claim.sub',$1,true)`,[ids.actor]);
  await client.query('SET ROLE authenticated');
  try {
    const reopened = (await client.query(`SELECT id,process_id,org_id,workspace_id,version,responses
      FROM public.assessments WHERE id=$1`,[ids.assessment])).rows;
    check(reopened.length,1);
    check(reopened[0].process_id,ids.process1);
    check(reopened[0].workspace_id,ids.workspace);
    check(Number(reopened[0].version),2);
    check(reopened[0].responses.responses.processStructure.standardization,2);
    const reopenedProcess = (await client.query('SELECT id,name,workspace_id FROM public.assess_processes WHERE id=$1',[ids.process1])).rows;
    check(reopenedProcess.length,1);
    check(reopenedProcess[0].name,'Synthetic process');
  } finally { await client.query('RESET ROLE'); }
  const replay = await rpc(ids.actor,ids.workspace,creatorVersion,ids.process1,req1,key1);
  check(replay.outcome,'replayed');
  check(await count('public.assess_processes','id=$1',[ids.process1]),1);
  check((await rpc(ids.actor,ids.workspace,creatorVersion,ids.process1,request(),key1)).error.code,'IDEMPOTENCY_CONFLICT');
  check((await rpc(ids.actor,ids.workspace,creatorVersion,ids.process1,req1,key1,'changed')).error.code,'IDEMPOTENCY_CONFLICT');
  const deniedReaderRequest = request(), foreignWorkspaceRequest = request();
  check((await rpc(ids.reader,ids.workspace,readerVersion,ids.deniedProcess,deniedReaderRequest,'process.create.denied-reader-0001')).error.code,'PERMISSION_DENIED');
  check((await rpc(ids.actor,ids.foreignWorkspace,creatorVersion,ids.deniedProcess,foreignWorkspaceRequest,'process.create.foreign-workspace-0001')).error.code,'PERMISSION_DENIED');
  check(await count('public.assess_processes','id=$1',[ids.deniedProcess]),0);
  check(await count('public.assess_command_receipts','request_id IN($1,$2) AND command_type=$3',[deniedReaderRequest,foreignWorkspaceRequest,'process.create']),0);
  check(await count('public.privileged_audit_events','request_id IN($1,$2) AND action=$3',[deniedReaderRequest,foreignWorkspaceRequest,'process.create']),0);
  const templateId = 'tpl-p2p-invoice-ingestion';
  const fakeTemplate = await rpc(ids.actor,ids.workspace,creatorVersion,ids.process2,request(),'process.create.fake-template-0001','',templateId);
  check(fakeTemplate.error.code,'INVALID_COMMAND');
  const req2 = request();
  check((await rpc(ids.actor,ids.workspace,creatorVersion,ids.process2,req2,'process.create.postgres-positive-0002')).ok,true);
  check((await rpc(ids.actor,ids.workspace,creatorVersion,ids.process3,request(),'process.create.quota-0001')).error.code,'QUOTA_EXCEEDED');
  await client.query('UPDATE public.process_creation_workspace_controls SET read_only=true WHERE org_id=$1 AND workspace_id=$2',[ids.org,ids.workspace]);
  check((await rpc(ids.actor,ids.workspace,creatorVersion,ids.process3,request(),'process.create.read-only-0001')).error.code,'READ_ONLY');
  check((await rpc(ids.actor,ids.workspace,creatorVersion,ids.process1,req1,key1)).outcome,'replayed');
  await client.query('UPDATE public.process_creation_workspace_controls SET enabled=false WHERE org_id=$1 AND workspace_id=$2',[ids.org,ids.workspace]);
  check((await rpc(ids.actor,ids.workspace,creatorVersion,ids.process3,request(),'process.create.disabled-0001')).error.code,'FEATURE_DISABLED');
  check((await rpc(ids.actor,ids.workspace,creatorVersion,ids.process1,req1,key1)).outcome,'replayed');
  check(await count('public.assess_processes','id=$1',[ids.process3]),0);
  // An audit insert failure must roll back process and claimed receipt; the
  // trigger is scoped to one synthetic request and dropped before fixture commit.
  await client.query('UPDATE public.process_creation_workspace_controls SET enabled=true,read_only=false,max_active_processes=4 WHERE org_id=$1 AND workspace_id=$2',[ids.org,ids.workspace]);
  const templateRequest = request();
  const template = await rpc(ids.actor,ids.workspace,creatorVersion,ids.templateProcess,templateRequest,
    'process.create.template-positive-0001',
    'Evaluate the process of receiving vendor invoices and extracting line-item header data into the ERP.',
    'tpl-p2p-invoice-ingestion','Invoice Ingestion & Extraction','Finance','High');
  check(template.ok,true);
  check(template.resource.templateId,'tpl-p2p-invoice-ingestion');
  check(template.resource.criticality,'High');
  const auditFailureRequest = request();
  await client.query(`CREATE FUNCTION public.process_creation_test_reject_audit() RETURNS trigger
    LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN
      IF NEW.request_id::text=current_setting('process.test.audit.failure',true) THEN
        RAISE EXCEPTION 'PROCESS_TEST_AUDIT_REJECTED';
      END IF;
      RETURN NEW;
    END$$`);
  await client.query(`CREATE TRIGGER process_creation_test_reject_audit BEFORE INSERT ON public.privileged_audit_events
    FOR EACH ROW EXECUTE FUNCTION public.process_creation_test_reject_audit()`);
  await client.query(`SELECT set_config('process.test.audit.failure',$1,true)`,[auditFailureRequest]);
  const auditFailed = await rpc(ids.actor,ids.workspace,creatorVersion,ids.auditFailureProcess,auditFailureRequest,'process.create.audit-failure-0001');
  check(auditFailed.error.code,'COMMAND_UNAVAILABLE');
  check(await count('public.assess_processes','id=$1',[ids.auditFailureProcess]),0);
  check(await count('public.assess_command_receipts','request_id=$1 AND command_type=$2',[auditFailureRequest,'process.create']),0);
  check(await count('public.privileged_audit_events','request_id=$1 AND action=$2',[auditFailureRequest,'process.create']),0);
  await client.query('DROP TRIGGER process_creation_test_reject_audit ON public.privileged_audit_events');
  await client.query('DROP FUNCTION public.process_creation_test_reject_audit()');
  check((await client.query(`SELECT has_function_privilege('authenticated','public.create_assess_process(uuid,uuid,uuid,bigint,uuid,text,bigint,uuid,text,text,text,text,text)','EXECUTE') AS allowed`)).rows[0].allowed,false);
  check((await client.query(`SELECT has_table_privilege('authenticated','public.process_creation_workspace_controls','SELECT') AS allowed`)).rows[0].allowed,false);
  check((await client.query(`SELECT has_table_privilege('authenticated','public.process_creation_template_registry','SELECT') AS allowed`)).rows[0].allowed,false);
  await client.query('COMMIT');
  // The database and container are task-owned disposables. Committing this
  // synthetic fixture lets two separate backend sessions observe the same
  // authority rows while they contend for the control-row quota lock.
  await client.query('UPDATE public.process_creation_workspace_controls SET enabled=true,read_only=false,max_active_processes=4 WHERE org_id=$1 AND workspace_id=$2',[ids.org,ids.workspace]);
  const racerA = new pg.Client({ connectionString });
  const racerB = new pg.Client({ connectionString });
  try {
    await Promise.all([racerA.connect(),racerB.connect()]);
    await Promise.all([racerA.query(`SET application_name='process_creation_racer_a'`),racerB.query(`SET application_name='process_creation_racer_b'`)]);
    await Promise.all([racerA.query(`SET statement_timeout='15000ms'`),racerB.query(`SET statement_timeout='15000ms'`)]);
    await client.query('BEGIN');
    await client.query('SELECT 1 FROM public.process_creation_workspace_controls WHERE org_id=$1 AND workspace_id=$2 FOR UPDATE',[ids.org,ids.workspace]);
    const raceRequestA = request(), raceRequestB = request();
    const pendingA = rpc(ids.actor,ids.workspace,creatorVersion,ids.process3,raceRequestA,'process.create.concurrent-a-0001','',null,'Synthetic process','','Medium',racerA)
      .catch(error => ({ errorCode: error?.code ?? 'QUERY_FAILED' }));
    const pendingB = rpc(ids.actor,ids.workspace,creatorVersion,ids.process4,raceRequestB,'process.create.concurrent-b-0001','',null,'Synthetic process','','Medium',racerB)
      .catch(error => ({ errorCode: error?.code ?? 'QUERY_FAILED' }));
    let bothWaiting = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const parked = (await client.query(`SELECT count(*)::integer AS n FROM pg_stat_activity
        WHERE application_name IN('process_creation_racer_a','process_creation_racer_b')
          AND wait_event_type='Lock'`)).rows[0].n;
      if (Number(parked) === 2) { bothWaiting = true; break; }
      await new Promise(resolve => setTimeout(resolve,100));
    }
    check(bothWaiting,true);
    await client.query('COMMIT');
    const race = await Promise.all([pendingA,pendingB]);
    check(race.filter(outcome => outcome.ok === true && outcome.outcome === 'committed').length,1);
    check(race.filter(outcome => outcome.ok === false && outcome.error.code === 'QUOTA_EXCEEDED').length,1);
    check(await count('public.assess_processes','id IN($1,$2)',[ids.process3,ids.process4]),1);
    check(await count('public.assess_command_receipts','request_id IN($1,$2) AND command_type=$3',[raceRequestA,raceRequestB,'process.create']),1);
    check(await count('public.privileged_audit_events','request_id IN($1,$2) AND action=$3',[raceRequestA,raceRequestB,'process.create']),1);
  } finally {
    try { await client.query('ROLLBACK'); } catch { /* No open test transaction. */ }
    await Promise.all([racerA.end().catch(() => undefined),racerB.end().catch(() => undefined)]);
  }
  console.log(`process creation PostgreSQL: ${assertions} assertions passed; task-owned disposable container must be removed`);
} catch (error) {
  try { await client.query('ROLLBACK'); } catch { /* Keep original failure. */ }
  console.error(`process creation PostgreSQL failed after ${assertions} assertions: ${error?.code ?? 'ASSERTION_FAILED'}`);
  process.exitCode = 1;
} finally { await client.end().catch(() => undefined); }
