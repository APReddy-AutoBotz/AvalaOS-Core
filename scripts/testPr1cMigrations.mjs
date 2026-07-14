import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const adminUrl = process.env.PR1C_MIGRATION_DATABASE_URL || process.env.PR1B_MIGRATION_DATABASE_URL;
if (!adminUrl) {
  console.error('PR1C_MIGRATION_DATABASE_URL or PR1B_MIGRATION_DATABASE_URL is required.');
  process.exit(1);
}

const databaseName = 'avalaos_pr1c_authority_test';
const createdRoles = [];
const all = fs.readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();
const pr1b = '20260712120000_pr1b_identity_rbac_rls_assess.sql';
const pr1c = '20260713120000_pr1c_enterprise_assess_ui_govern_studio_handoff.sql';
const baseline = all.slice(0, all.indexOf(pr1b));
const source = name => fs.readFileSync(path.join('supabase/migrations', name), 'utf8');
const fixture = fs.readFileSync('supabase/tests/migration-harness/pr1b_legacy_assess_fixture.sql', 'utf8');
const urlFor = name => { const url = new URL(adminUrl); url.pathname = `/${name}`; return url.toString(); };
const connect = async url => { const client = new Client({ connectionString: url }); await client.connect(); return client; };
const transaction = async (client, sql) => {
  await client.query('BEGIN');
  try { await client.query(sql); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
};
const apply = async (client, names) => { for (const name of names) await transaction(client, source(name)); };
const bootstrap = client => transaction(client, `CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
 GRANT USAGE ON SCHEMA auth TO authenticated;
 GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);

const ACTOR='11000000-0000-4000-8000-000000000001';
const ORG='11000000-0000-4000-8000-000000000010';
const WS='11000000-0000-4000-8000-000000000011';
const ROLE='11000000-0000-4000-8000-000000000012';
const PROCESS='11000000-0000-4000-8000-000000000013';
const ASSESSMENT='11000000-0000-4000-8000-000000000014';
const BYPASS='11000000-0000-4000-8000-000000000015';
const AUDIT_FAIL='11000000-0000-4000-8000-000000000016';
const LEGACY='11000000-0000-4000-8000-000000000017';
const GOVERN_FAIL='11000000-0000-4000-8000-000000000018';
const CONCURRENT='11000000-0000-4000-8000-000000000019';
const GOVERN_REPLAY='11000000-0000-4000-8000-000000000020';
const GOVERN_CONFLICT='11000000-0000-4000-8000-000000000021';
const STUDIO_REPLAY='11000000-0000-4000-8000-000000000022';
const STUDIO_CONFLICT='11000000-0000-4000-8000-000000000023';
const ACTOR_B='22000000-0000-4000-8000-000000000002';
const ORG_B='22000000-0000-4000-8000-000000000020';
const WS_B='22000000-0000-4000-8000-000000000022';
const ROLE_B='22000000-0000-4000-8000-000000000023';
const PROCESS_B='22000000-0000-4000-8000-000000000024';
const ASSESSMENT_B='22000000-0000-4000-8000-000000000025';
const requestId = suffix => `41000000-0000-4000-8000-${suffix.padStart(12,'0')}`;
const value = result => result.rows[0].value;
const asRole = async (client, role, operation) => {
  await client.query(`SET ROLE ${role}`);
  try { return await operation(); } finally { await client.query('RESET ROLE'); }
};
const trusted = async (client, operation) => {
  return asRole(client,'service_role',operation);
};
const authenticatedAs = async (client, actor, operation) => {
  await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[actor]);
  return asRole(client,'authenticated',async () => {
    const identity = await client.query('SELECT current_user role,auth.uid() actor');
    assert.equal(identity.rows[0].role,'authenticated');
    assert.equal(identity.rows[0].actor,actor);
    return operation();
  });
};
const authorizationVersion = async (client,org=ORG,actor=ACTOR) => Number((await client.query(
  'SELECT version FROM authorization_versions WHERE org_id=$1 AND user_id=$2',[org,actor]
)).rows[0].version);

let admin;
let test;
try {
  admin = await connect(adminUrl);
  for (const [role, attributes] of [['anon','NOLOGIN'],['authenticated','NOLOGIN'],['service_role','NOLOGIN BYPASSRLS'],['pr1c_unprivileged','NOLOGIN']]) {
    if ((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount === 0) {
      await admin.query(`CREATE ROLE ${role} ${attributes}`);
      createdRoles.push(role);
    }
  }
  await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${databaseName}`);
  test = await connect(urlFor(databaseName));
  await bootstrap(test);
  await apply(test, baseline);
  await transaction(test, fixture);
  await transaction(test, source(pr1b));
  await test.query("UPDATE assessments SET status='Approved' WHERE id=$1",[ASSESSMENT]);
  await assert.rejects(
    transaction(test, source(pr1c)),
    /PR1C_PREFLIGHT_TRUSTED_GOVERN_PROVENANCE_REQUIRED/,
  );
  assert.equal((await test.query("SELECT to_regclass('public.assessment_govern_provenance') value")).rows[0].value,null);
  await test.query("UPDATE assessments SET status='Ready for Review' WHERE id=$1",[ASSESSMENT]);
  await transaction(test, source(pr1c));

  await test.query(`INSERT INTO role_capabilities(role_id,capability_key) VALUES
    ($1,'govern.resolve'),($1,'studio.handoff.create'),
    ($2,'govern.resolve'),($2,'studio.handoff.create') ON CONFLICT DO NOTHING`,[ROLE,ROLE_B]);
  for (const [table,id] of [
    ['profiles',ACTOR_B],['organizations',ORG_B],['workspaces',WS_B],
    ['roles',ROLE_B],['assess_processes',PROCESS_B],['assessments',ASSESSMENT_B],
  ]) {
    assert.equal((await test.query(`SELECT id FROM ${table} WHERE id=$1`,[id])).rowCount,1,`missing tenant-B ${table}`);
  }
  await test.query(`UPDATE assessments SET status='Ready for Review',score_version='assess-core-2026-05',
    scores=$2::jsonb,responses=$3::jsonb WHERE id=$1`,[
      ASSESSMENT_B,
      JSON.stringify({ scoreVersion:'assess-core-2026-05', gateDecision:'Go', riskTier:'Medium', handoffEligibility:'Eligible' }),
      JSON.stringify({ responses:{ q1:4 }, metadata:{ completionQuality:100 }, evidenceItems:[], assumptions:[] }),
    ]);
  await test.query(`UPDATE assessments SET status='Ready for Review',score_version='assess-core-2026-05',
    scores=$2::jsonb,responses=$3::jsonb WHERE id=$1`,[
      ASSESSMENT,
      JSON.stringify({ scoreVersion:'assess-core-2026-05', gateDecision:'Go', riskTier:'Medium', handoffEligibility:'Eligible' }),
      JSON.stringify({ responses:{ q1:4 }, metadata:{ completionQuality:100 }, evidenceItems:[], assumptions:[] }),
    ]);
  await test.query(`INSERT INTO assessments(id,process_id,org_id,workspace_id,status,version,score_version,scores)
    VALUES($1,$2,$3,$4,'Ready for Review',1,'assess-core-2026-05',$5),
          ($6,$2,$3,$4,'Ready for Review',1,'assess-core-2026-05',$5),
          ($7,$2,$3,$4,'Approved',1,'assess-core-2026-05',$5),
          ($8,$2,$3,$4,'Ready for Review',1,'assess-core-2026-05',$5),
          ($9,$2,$3,$4,'Ready for Review',1,'assess-core-2026-05',$5),
          ($10,$2,$3,$4,'Ready for Review',1,'assess-core-2026-05',$5),
          ($11,$2,$3,$4,'Ready for Review',1,'assess-core-2026-05',$5),
          ($12,$2,$3,$4,'Ready for Review',1,'assess-core-2026-05',$5),
          ($13,$2,$3,$4,'Ready for Review',1,'assess-core-2026-05',$5)`,[
      BYPASS,PROCESS,ORG,WS,{ scoreVersion:'assess-core-2026-05', gateDecision:'Go' },
      AUDIT_FAIL,LEGACY,GOVERN_FAIL,CONCURRENT,
      GOVERN_REPLAY,GOVERN_CONFLICT,STUDIO_REPLAY,STUDIO_CONFLICT,
    ]);

  const signatures = [
    'pr1c_list_tenant_contexts(uuid)',
    'pr1c_govern_resolve(uuid,uuid,uuid,uuid,text,text,bigint,uuid,text,bigint)',
    'pr1c_create_studio_handoff(uuid,uuid,uuid,uuid,text,bigint,uuid,text,bigint)',
  ];
  const mutationSignatures = signatures.slice(1);
  for (const signature of signatures) {
    for (const role of ['anon','authenticated','pr1c_unprivileged']) {
      assert.equal((await test.query(
        `SELECT has_function_privilege($1,$2,'EXECUTE') allowed`,[role,signature]
      )).rows[0].allowed,false,`${role} executes ${signature}`);
    }
    assert.equal((await test.query(
      `SELECT has_function_privilege('service_role',$1,'EXECUTE') allowed`,[signature]
    )).rows[0].allowed,true);
  }
  for (const signature of mutationSignatures) {
    const publicExecute = await test.query(`SELECT count(*) n FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
      WHERE p.oid=to_regprocedure($1) AND acl.grantee=0
        AND upper(acl.privilege_type)='EXECUTE'`,[signature]);
    assert.equal(Number(publicExecute.rows[0].n),0,`PUBLIC executes ${signature}`);
  }
  for (const table of ['assessment_govern_provenance','assessment_studio_handoffs']) {
    assert.equal((await test.query("SELECT has_table_privilege('authenticated',$1,'SELECT') allowed",[table])).rows[0].allowed,true);
    for (const privilege of ['INSERT','UPDATE','DELETE']) {
      assert.equal((await test.query("SELECT has_table_privilege('authenticated',$1,$2) allowed",[table,privilege])).rows[0].allowed,false);
    }
    assert.equal((await test.query("SELECT has_table_privilege('anon',$1,'SELECT') allowed",[table])).rows[0].allowed,false);
    assert.equal((await test.query("SELECT has_table_privilege('pr1c_unprivileged',$1,'SELECT') allowed",[table])).rows[0].allowed,false);
    const publicMutation = await test.query(`SELECT count(*) n FROM pg_class c
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl
      WHERE c.oid=to_regclass($1) AND acl.grantee=0
        AND upper(acl.privilege_type)=ANY($2::text[])`,[table,['INSERT','UPDATE','DELETE']]);
    assert.equal(Number(publicMutation.rows[0].n),0,`PUBLIC mutates ${table}`);
    for (const role of ['anon','pr1c_unprivileged','service_role']) {
      for (const privilege of ['INSERT','UPDATE','DELETE']) {
        assert.equal((await test.query(
          'SELECT has_table_privilege($1,$2,$3) allowed',[role,table,privilege]
        )).rows[0].allowed,false,`${role} has ${privilege} on ${table}`);
      }
    }
    for (const role of ['anon','authenticated','pr1c_unprivileged']) {
      await asRole(test,role,async () => {
        await assert.rejects(test.query(`INSERT INTO ${table} DEFAULT VALUES`),/permission denied/i);
        await assert.rejects(test.query(`UPDATE ${table} SET id=id WHERE false`),/permission denied/i);
        await assert.rejects(test.query(`DELETE FROM ${table} WHERE false`),/permission denied/i);
      });
    }
  }

  await test.query('SET ROLE authenticated');
  await assert.rejects(test.query(
    'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [ACTOR,ORG,WS,ASSESSMENT,'approve','forged',1,requestId('1'),'forged-govern',1],
  ),/permission denied/i);
  await assert.rejects(test.query(
    'SELECT pr1c_create_studio_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [ACTOR,ORG,WS,ASSESSMENT,'forged',1,requestId('2'),'forged-handoff',1],
  ),/permission denied/i);
  await test.query('RESET ROLE');

  for (const role of ['anon','pr1c_unprivileged']) {
    await asRole(test,role,async () => {
      await assert.rejects(test.query(
        'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [ACTOR,ORG,WS,ASSESSMENT,'approve','forged',1,requestId('1'),'forged-govern',1],
      ),/permission denied/i);
      await assert.rejects(test.query(
        'SELECT pr1c_create_studio_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [ACTOR,ORG,WS,ASSESSMENT,'forged',1,requestId('2'),'forged-handoff',1],
      ),/permission denied/i);
    });
  }
  const contexts = await trusted(test, () => test.query('SELECT pr1c_list_tenant_contexts($1) value',[ACTOR]));
  assert.equal(contexts.rowCount,1);
  assert.equal(contexts.rows[0].value.organizationId,ORG);
  assert.equal(contexts.rows[0].value.workspaceId,WS);
  assert.ok(contexts.rows[0].value.capabilities.includes('govern.resolve'));
  assert.ok(contexts.rows[0].value.capabilities.includes('studio.handoff.create'));

  let version = await authorizationVersion(test);
  const bypass = value(await trusted(test, () => test.query(
    'SELECT pr1c_create_studio_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
    [ACTOR,ORG,WS,BYPASS,'bypass',1,requestId('3'),'bypass-handoff',version],
  )));
  assert.equal(bypass.errorCode,'INVALID_COMMAND');
  assert.equal((await test.query('SELECT status FROM assessments WHERE id=$1',[BYPASS])).rows[0].status,'Ready for Review');
  assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_studio_handoffs WHERE assessment_id=$1',[BYPASS])).rows[0].n),0);
  const legacy = value(await trusted(test, () => test.query(
    'SELECT pr1c_create_studio_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
    [ACTOR,ORG,WS,LEGACY,'legacy must fail closed',1,requestId('30'),'legacy-handoff',version],
  )));
  assert.equal(legacy.errorCode,'INVALID_COMMAND');
  assert.equal((await test.query('SELECT status FROM assessments WHERE id=$1',[LEGACY])).rows[0].status,'Approved');
  assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_studio_handoffs WHERE assessment_id=$1',[LEGACY])).rows[0].n),0);

  const stale = value(await trusted(test, () => test.query(
    'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
    [ACTOR,ORG,WS,ASSESSMENT,'approve','stale',1,requestId('31'),'stale-govern',version+1],
  )));
  assert.equal(stale.errorCode,'AUTHORIZATION_STALE');

  const governed = value(await trusted(test, () => test.query(
    'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
    [ACTOR,ORG,WS,ASSESSMENT,'approve','Human approval recorded.',1,requestId('4'),'approve-assessment',version],
  )));
  assert.equal(governed.resource.status,'Approved');
  assert.equal(Number(governed.resource.version),2);
  const provenance = await test.query(`SELECT gp.*,cr.status receipt_status,cr.response
    FROM assessment_govern_provenance gp JOIN assess_command_receipts cr ON cr.id=gp.receipt_id
    WHERE gp.assessment_id=$1`,[ASSESSMENT]);
  assert.equal(provenance.rowCount,1);
  assert.equal(provenance.rows[0].org_id,ORG);
  assert.equal(provenance.rows[0].workspace_id,WS);
  assert.equal(provenance.rows[0].process_id,PROCESS);
  assert.equal(provenance.rows[0].actor_id,ACTOR);
  assert.equal(provenance.rows[0].decision,'approve');
  assert.equal(Number(provenance.rows[0].assessment_version),2);
  assert.equal(provenance.rows[0].result_status,'Approved');
  assert.equal(provenance.rows[0].outcome,'succeeded');
  assert.equal(provenance.rows[0].receipt_status,'succeeded');
  assert.equal(provenance.rows[0].response.resource.version,2);

  const replay = value(await trusted(test, () => test.query(
    'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
    [ACTOR,ORG,WS,ASSESSMENT,'approve','Human approval recorded.',1,requestId('4'),'approve-assessment',version],
  )));
  assert.deepEqual(replay,governed);
  const conflict = value(await trusted(test, () => test.query(
    'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
    [ACTOR,ORG,WS,ASSESSMENT,'approve','different content',1,requestId('32'),'approve-assessment',version],
  )));
  assert.equal(conflict.errorCode,'IDEMPOTENCY_CONFLICT');
  assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_govern_provenance WHERE assessment_id=$1',[ASSESSMENT])).rows[0].n),1);

  const handoff = value(await trusted(test, () => test.query(
    'SELECT pr1c_create_studio_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
    [ACTOR,ORG,WS,ASSESSMENT,'Governed Studio context.',2,requestId('5'),'studio-handoff',version],
  )));
  assert.equal(handoff.resource.status,'Handed Off to Docs');
  assert.equal(Number(handoff.resource.version),3);
  assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_studio_handoffs WHERE assessment_id=$1',[ASSESSMENT])).rows[0].n),1);
  assert.equal(Number((await test.query(`SELECT count(*) n FROM privileged_audit_events
    WHERE resource_id=$1 AND action IN('govern.resolve','studio_handoff.create')`,[ASSESSMENT])).rows[0].n),2);
  assert.match(handoff.resource.handoffId,/^[0-9a-f-]{36}$/i);
  assert.equal((await test.query('SELECT id FROM assessment_studio_handoffs WHERE assessment_id=$1',[ASSESSMENT])).rows[0].id,handoff.resource.handoffId);
  await assert.rejects(test.query("UPDATE assessment_govern_provenance SET reason='mutated' WHERE assessment_id=$1",[ASSESSMENT]),/immutable/i);
  await assert.rejects(test.query('DELETE FROM assessment_studio_handoffs WHERE assessment_id=$1',[ASSESSMENT]),/immutable/i);

  const versionB = await authorizationVersion(test,ORG_B,ACTOR_B);
  const governedB = value(await trusted(test, () => test.query(
    'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
    [ACTOR_B,ORG_B,WS_B,ASSESSMENT_B,'approve','Tenant B human approval.',1,requestId('70'),'tenant-b-govern',versionB],
  )));
  assert.equal(governedB.resource.status,'Approved');
  const handoffB = value(await trusted(test, () => test.query(
    'SELECT pr1c_create_studio_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
    [ACTOR_B,ORG_B,WS_B,ASSESSMENT_B,'Tenant B governed handoff.',2,requestId('71'),'tenant-b-handoff',versionB],
  )));
  assert.equal(handoffB.resource.status,'Handed Off to Docs');
  const tenantBProvenance = await test.query(
    'SELECT id FROM assessment_govern_provenance WHERE assessment_id=$1',[ASSESSMENT_B]
  );
  assert.equal(tenantBProvenance.rowCount,1);
  const provenanceBId = tenantBProvenance.rows[0].id;
  const handoffBId = handoffB.resource.handoffId;
  await authenticatedAs(test,ACTOR,async () => {
    assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_govern_provenance')).rows[0].n),1);
    assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_studio_handoffs')).rows[0].n),1);
    assert.equal((await test.query('SELECT id FROM assessment_govern_provenance WHERE id=$1',[provenance.rows[0].id])).rowCount,1);
    assert.equal((await test.query('SELECT id FROM assessment_studio_handoffs WHERE id=$1',[handoff.resource.handoffId])).rowCount,1);
    assert.equal((await test.query('SELECT id FROM assessment_govern_provenance WHERE org_id=$1',[ORG_B])).rowCount,0);
    assert.equal((await test.query('SELECT id FROM assessment_studio_handoffs WHERE org_id=$1',[ORG_B])).rowCount,0);
    assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_govern_provenance WHERE org_id=$1',[ORG_B])).rows[0].n),0);
    assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_studio_handoffs WHERE org_id=$1',[ORG_B])).rows[0].n),0);
    assert.equal((await test.query('SELECT id FROM assessment_govern_provenance WHERE id=$1',[provenanceBId])).rowCount,0);
    assert.equal((await test.query('SELECT id FROM assessment_studio_handoffs WHERE id=$1',[handoffBId])).rowCount,0);
    assert.equal((await test.query('SELECT id FROM assessment_govern_provenance WHERE assessment_id=$1',[ASSESSMENT_B])).rowCount,0);
    assert.equal((await test.query('SELECT id FROM assessment_studio_handoffs WHERE assessment_id=$1',[ASSESSMENT_B])).rowCount,0);
  });
  await authenticatedAs(test,ACTOR_B,async () => {
    assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_govern_provenance')).rows[0].n),1);
    assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_studio_handoffs')).rows[0].n),1);
    assert.equal((await test.query('SELECT id FROM assessment_govern_provenance WHERE id=$1',[provenanceBId])).rowCount,1);
    assert.equal((await test.query('SELECT id FROM assessment_studio_handoffs WHERE id=$1',[handoffBId])).rowCount,1);
    assert.equal((await test.query('SELECT id FROM assessment_govern_provenance WHERE assessment_id=$1',[ASSESSMENT_B])).rowCount,1);
    assert.equal((await test.query('SELECT id FROM assessment_studio_handoffs WHERE assessment_id=$1',[ASSESSMENT_B])).rowCount,1);
    assert.equal((await test.query('SELECT id FROM assessment_govern_provenance WHERE id=$1',[provenance.rows[0].id])).rowCount,0);
    assert.equal((await test.query('SELECT id FROM assessment_studio_handoffs WHERE id=$1',[handoff.resource.handoffId])).rowCount,0);
  });
  await test.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[ACTOR]);
  await test.query('SET ROLE authenticated');
  assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_govern_provenance')).rows[0].n),1);
  assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_studio_handoffs')).rows[0].n),1);
  assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_govern_provenance WHERE org_id<>$1',[ORG])).rows[0].n),0);
  assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_studio_handoffs WHERE org_id<>$1',[ORG])).rows[0].n),0);
  await test.query('RESET ROLE');

  const crossTenant = value(await trusted(test, () => test.query(
    'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
    [ACTOR,'22000000-0000-4000-8000-000000000020','22000000-0000-4000-8000-000000000022',ASSESSMENT,'approve','cross tenant',3,requestId('6'),'cross-tenant',version],
  )));
  assert.equal(crossTenant.errorCode,'NOT_FOUND');
  const countRows = async (sql,parameters) => Number((await test.query(sql,parameters)).rows[0].n);
  const assertCommandEffects = async (assessment,command,key,table,event,status,expectedVersion) => {
    const state = (await test.query('SELECT status,version FROM assessments WHERE id=$1',[assessment])).rows[0];
    assert.equal(state.status,status);
    assert.equal(Number(state.version),expectedVersion);
    assert.equal(await countRows(
      'SELECT count(*) n FROM assess_command_receipts WHERE org_id=$1 AND workspace_id=$2 AND actor_id=$3 AND command_type=$4 AND idempotency_key=$5',
      [ORG,WS,ACTOR,command,key],
    ),1);
    assert.equal(await countRows(`SELECT count(*) n FROM ${table} WHERE assessment_id=$1`,[assessment]),1);
    assert.equal(await countRows('SELECT count(*) n FROM privileged_audit_events WHERE resource_id=$1 AND action=$2',[assessment,command]),1);
    assert.equal(await countRows('SELECT count(*) n FROM assessment_review_events WHERE assessment_id=$1 AND event_type=$2',[assessment,event]),1);
  };

  const raceA = await connect(urlFor(databaseName));
  const raceB = await connect(urlFor(databaseName));
  try {
    const governReplayRace = await Promise.all([
      trusted(raceA, () => raceA.query(
        'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
        [ACTOR,ORG,WS,GOVERN_REPLAY,'approve','same concurrent approval',1,requestId('80'),'same-govern-replay',version],
      )),
      trusted(raceB, () => raceB.query(
        'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
        [ACTOR,ORG,WS,GOVERN_REPLAY,'approve','same concurrent approval',1,requestId('80'),'same-govern-replay',version],
      )),
    ]).then(results => results.map(value));
    assert.deepEqual(governReplayRace[0],governReplayRace[1]);
    assert.equal(governReplayRace[0].resource.status,'Approved');
    await assertCommandEffects(GOVERN_REPLAY,'govern.resolve','same-govern-replay','assessment_govern_provenance','Approval','Approved',2);

    const governConflictRace = await Promise.all([
      trusted(raceA, () => raceA.query(
        'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
        [ACTOR,ORG,WS,GOVERN_CONFLICT,'approve','concurrent payload A',1,requestId('81'),'same-govern-conflict',version],
      )),
      trusted(raceB, () => raceB.query(
        'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
        [ACTOR,ORG,WS,GOVERN_CONFLICT,'approve','concurrent payload B',1,requestId('81'),'same-govern-conflict',version],
      )),
    ]).then(results => results.map(value));
    assert.equal(governConflictRace.filter(result => result.resource?.status === 'Approved').length,1);
    assert.equal(governConflictRace.filter(result => result.errorCode === 'IDEMPOTENCY_CONFLICT').length,1);
    await assertCommandEffects(GOVERN_CONFLICT,'govern.resolve','same-govern-conflict','assessment_govern_provenance','Approval','Approved',2);

    for (const [assessment,suffix,key] of [
      [STUDIO_REPLAY,'82','prepare-studio-replay'],
      [STUDIO_CONFLICT,'83','prepare-studio-conflict'],
    ]) {
      const prepared = value(await trusted(test, () => test.query(
        'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
        [ACTOR,ORG,WS,assessment,'approve','prepare concurrent handoff',1,requestId(suffix),key,version],
      )));
      assert.equal(prepared.resource.status,'Approved');
    }

    const studioReplayRace = await Promise.all([
      trusted(raceA, () => raceA.query(
        'SELECT pr1c_create_studio_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
        [ACTOR,ORG,WS,STUDIO_REPLAY,'same concurrent handoff',2,requestId('84'),'same-studio-replay',version],
      )),
      trusted(raceB, () => raceB.query(
        'SELECT pr1c_create_studio_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
        [ACTOR,ORG,WS,STUDIO_REPLAY,'same concurrent handoff',2,requestId('84'),'same-studio-replay',version],
      )),
    ]).then(results => results.map(value));
    assert.deepEqual(studioReplayRace[0],studioReplayRace[1]);
    assert.equal(studioReplayRace[0].resource.status,'Handed Off to Docs');
    await assertCommandEffects(STUDIO_REPLAY,'studio_handoff.create','same-studio-replay','assessment_studio_handoffs','Handoff','Handed Off to Docs',3);

    const studioConflictRace = await Promise.all([
      trusted(raceA, () => raceA.query(
        'SELECT pr1c_create_studio_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
        [ACTOR,ORG,WS,STUDIO_CONFLICT,'concurrent handoff A',2,requestId('85'),'same-studio-conflict',version],
      )),
      trusted(raceB, () => raceB.query(
        'SELECT pr1c_create_studio_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
        [ACTOR,ORG,WS,STUDIO_CONFLICT,'concurrent handoff B',2,requestId('85'),'same-studio-conflict',version],
      )),
    ]).then(results => results.map(value));
    assert.equal(studioConflictRace.filter(result => result.resource?.status === 'Handed Off to Docs').length,1);
    assert.equal(studioConflictRace.filter(result => result.errorCode === 'IDEMPOTENCY_CONFLICT').length,1);
    await assertCommandEffects(STUDIO_CONFLICT,'studio_handoff.create','same-studio-conflict','assessment_studio_handoffs','Handoff','Handed Off to Docs',3);
    const governRace = await Promise.all([
      trusted(raceA, () => raceA.query(
        'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
        [ACTOR,ORG,WS,CONCURRENT,'approve','concurrent approval',1,requestId('40'),'concurrent-govern-a',version],
      )),
      trusted(raceB, () => raceB.query(
        'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
        [ACTOR,ORG,WS,CONCURRENT,'approve','concurrent approval',1,requestId('41'),'concurrent-govern-b',version],
      )),
    ]).then(results => results.map(value));
    assert.equal(governRace.filter(result => result.resource?.status === 'Approved').length,1);
    assert.equal(governRace.filter(result => result.errorCode === 'VERSION_CONFLICT').length,1);
    assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_govern_provenance WHERE assessment_id=$1',[CONCURRENT])).rows[0].n),1);

    const handoffRace = await Promise.all([
      trusted(raceA, () => raceA.query(
        'SELECT pr1c_create_studio_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
        [ACTOR,ORG,WS,CONCURRENT,'concurrent handoff',2,requestId('42'),'concurrent-handoff-a',version],
      )),
      trusted(raceB, () => raceB.query(
        'SELECT pr1c_create_studio_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
        [ACTOR,ORG,WS,CONCURRENT,'concurrent handoff',2,requestId('43'),'concurrent-handoff-b',version],
      )),
    ]).then(results => results.map(value));
    assert.equal(handoffRace.filter(result => result.resource?.status === 'Handed Off to Docs').length,1);
    assert.equal(handoffRace.filter(result => result.errorCode === 'VERSION_CONFLICT').length,1);
    assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_studio_handoffs WHERE assessment_id=$1',[CONCURRENT])).rows[0].n),1);
  } finally {
    await raceA.end();
    await raceB.end();
  }

  await test.query(`ALTER TABLE privileged_audit_events ADD CONSTRAINT pr1c_test_govern_audit_failure
    CHECK(action<>'govern.resolve') NOT VALID`);
  const governFailed = value(await trusted(test, () => test.query(
    'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
    [ACTOR,ORG,WS,GOVERN_FAIL,'approve','must rollback govern',1,requestId('44'),'govern-audit-failure',version],
  )));
  assert.equal(governFailed.errorCode,'COMMAND_UNAVAILABLE');
  assert.equal((await test.query('SELECT status FROM assessments WHERE id=$1',[GOVERN_FAIL])).rows[0].status,'Ready for Review');
  assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_govern_provenance WHERE assessment_id=$1',[GOVERN_FAIL])).rows[0].n),0);
  assert.equal(Number((await test.query("SELECT count(*) n FROM assess_command_receipts WHERE idempotency_key='govern-audit-failure'")).rows[0].n),0);
  await test.query('ALTER TABLE privileged_audit_events DROP CONSTRAINT pr1c_test_govern_audit_failure');

  const auditFailApproved = value(await trusted(test, () => test.query(
    'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
    [ACTOR,ORG,WS,AUDIT_FAIL,'approve','prepare handoff rollback',1,requestId('45'),'audit-fail-approve',version],
  )));
  assert.equal(auditFailApproved.resource.status,'Approved');
  await test.query(`ALTER TABLE privileged_audit_events ADD CONSTRAINT pr1c_test_audit_failure
    CHECK(action<>'studio_handoff.create') NOT VALID`);
  const failed = value(await trusted(test, () => test.query(
    'SELECT pr1c_create_studio_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
    [ACTOR,ORG,WS,AUDIT_FAIL,'must rollback',2,requestId('7'),'audit-failure',version],
  )));
  assert.equal(failed.errorCode,'COMMAND_UNAVAILABLE');
  assert.equal((await test.query('SELECT status FROM assessments WHERE id=$1',[AUDIT_FAIL])).rows[0].status,'Approved');
  assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_studio_handoffs WHERE assessment_id=$1',[AUDIT_FAIL])).rows[0].n),0);
  assert.equal(Number((await test.query(`SELECT count(*) n FROM assess_command_receipts
    WHERE command_type='studio_handoff.create' AND idempotency_key='audit-failure'`)).rows[0].n),0);
  await test.query('ALTER TABLE privileged_audit_events DROP CONSTRAINT pr1c_test_audit_failure');
  await assert.rejects(transaction(test, source(pr1c)),/PR1C_PREFLIGHT_TRUSTED_GOVERN_PROVENANCE_REQUIRED/);
  await test.query("UPDATE assessments SET status='Ready for Review' WHERE id=$1",[LEGACY]);
  await transaction(test, source(pr1c));
  assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_govern_provenance WHERE assessment_id=$1',[ASSESSMENT])).rows[0].n),1);
  assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_studio_handoffs WHERE assessment_id=$1',[ASSESSMENT])).rows[0].n),1);

  console.log('PR 1C disposable PostgreSQL ACL, ancestry, idempotency, lifecycle, atomicity, and rollback tests passed.');
} finally {
  if (test) await test.end().catch(() => {});
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`).catch(() => {});
    for (const role of createdRoles.reverse()) await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => {});
    await admin.end().catch(() => {});
  }
}
