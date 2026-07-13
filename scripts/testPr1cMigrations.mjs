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
 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';`);

const ACTOR='11000000-0000-4000-8000-000000000001';
const ORG='11000000-0000-4000-8000-000000000010';
const WS='11000000-0000-4000-8000-000000000011';
const ROLE='11000000-0000-4000-8000-000000000012';
const PROCESS='11000000-0000-4000-8000-000000000013';
const ASSESSMENT='11000000-0000-4000-8000-000000000014';
const BYPASS='11000000-0000-4000-8000-000000000015';
const AUDIT_FAIL='11000000-0000-4000-8000-000000000016';
const requestId = suffix => `41000000-0000-4000-8000-${suffix.padStart(12,'0')}`;
const value = result => result.rows[0].value;
const trusted = async (client, operation) => {
  await client.query('SET ROLE service_role');
  try { return await operation(); } finally { await client.query('RESET ROLE'); }
};
const authorizationVersion = async client => Number((await client.query(
  'SELECT version FROM authorization_versions WHERE org_id=$1 AND user_id=$2',[ORG,ACTOR]
)).rows[0].version);

let admin;
let test;
try {
  admin = await connect(adminUrl);
  for (const [role, attributes] of [['anon','NOLOGIN'],['authenticated','NOLOGIN'],['service_role','NOLOGIN BYPASSRLS']]) {
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
  await transaction(test, source(pr1c));

  await test.query(`INSERT INTO role_capabilities(role_id,capability_key) VALUES
    ($1,'govern.resolve'),($1,'studio.handoff.create') ON CONFLICT DO NOTHING`,[ROLE]);
  await test.query(`UPDATE assessments SET status='Ready for Review',score_version='assess-core-2026-05',
    scores=$2::jsonb,responses=$3::jsonb WHERE id=$1`,[
      ASSESSMENT,
      JSON.stringify({ scoreVersion:'assess-core-2026-05', gateDecision:'Go', riskTier:'Medium', handoffEligibility:'Eligible' }),
      JSON.stringify({ responses:{ q1:4 }, metadata:{ completionQuality:100 }, evidenceItems:[], assumptions:[] }),
    ]);
  await test.query(`INSERT INTO assessments(id,process_id,org_id,workspace_id,status,version,score_version,scores)
    VALUES($1,$2,$3,$4,'Ready for Review',1,'assess-core-2026-05',$5),
          ($6,$2,$3,$4,'Approved',1,'assess-core-2026-05',$5)`,[
      BYPASS,PROCESS,ORG,WS,{ scoreVersion:'assess-core-2026-05', gateDecision:'Go' },AUDIT_FAIL,
    ]);

  const signatures = [
    'pr1c_list_tenant_contexts(uuid)',
    'pr1c_govern_resolve(uuid,uuid,uuid,uuid,text,text,bigint,uuid,text,bigint)',
    'pr1c_create_studio_handoff(uuid,uuid,uuid,uuid,text,bigint,uuid,text,bigint)',
  ];
  for (const signature of signatures) {
    for (const role of ['anon','authenticated']) {
      assert.equal((await test.query(
        `SELECT has_function_privilege($1,$2,'EXECUTE') allowed`,[role,signature]
      )).rows[0].allowed,false,`${role} executes ${signature}`);
    }
    assert.equal((await test.query(
      `SELECT has_function_privilege('service_role',$1,'EXECUTE') allowed`,[signature]
    )).rows[0].allowed,true);
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

  const governed = value(await trusted(test, () => test.query(
    'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
    [ACTOR,ORG,WS,ASSESSMENT,'approve','Human approval recorded.',1,requestId('4'),'approve-assessment',version],
  )));
  assert.equal(governed.resource.status,'Approved');
  assert.equal(Number(governed.resource.version),2);

  const replay = value(await trusted(test, () => test.query(
    'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
    [ACTOR,ORG,WS,ASSESSMENT,'approve','Human approval recorded.',1,requestId('4'),'approve-assessment',version],
  )));
  assert.deepEqual(replay,governed);

  const handoff = value(await trusted(test, () => test.query(
    'SELECT pr1c_create_studio_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
    [ACTOR,ORG,WS,ASSESSMENT,'Governed Studio context.',2,requestId('5'),'studio-handoff',version],
  )));
  assert.equal(handoff.resource.status,'Handed Off to Docs');
  assert.equal(Number(handoff.resource.version),3);
  assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_studio_handoffs WHERE assessment_id=$1',[ASSESSMENT])).rows[0].n),1);
  assert.equal(Number((await test.query(`SELECT count(*) n FROM privileged_audit_events
    WHERE resource_id=$1 AND action IN('govern.resolve','studio_handoff.create')`,[ASSESSMENT])).rows[0].n),2);

  const crossTenant = value(await trusted(test, () => test.query(
    'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
    [ACTOR,'22000000-0000-4000-8000-000000000020','22000000-0000-4000-8000-000000000022',ASSESSMENT,'approve','cross tenant',3,requestId('6'),'cross-tenant',version],
  )));
  assert.equal(crossTenant.errorCode,'NOT_FOUND');

  await test.query(`ALTER TABLE privileged_audit_events ADD CONSTRAINT pr1c_test_audit_failure
    CHECK(action<>'studio_handoff.create') NOT VALID`);
  const failed = value(await trusted(test, () => test.query(
    'SELECT pr1c_create_studio_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
    [ACTOR,ORG,WS,AUDIT_FAIL,'must rollback',1,requestId('7'),'audit-failure',version],
  )));
  assert.equal(failed.errorCode,'COMMAND_UNAVAILABLE');
  assert.equal((await test.query('SELECT status FROM assessments WHERE id=$1',[AUDIT_FAIL])).rows[0].status,'Approved');
  assert.equal(Number((await test.query('SELECT count(*) n FROM assessment_studio_handoffs WHERE assessment_id=$1',[AUDIT_FAIL])).rows[0].n),0);
  assert.equal(Number((await test.query(`SELECT count(*) n FROM assess_command_receipts
    WHERE command_type='studio_handoff.create' AND idempotency_key='audit-failure'`)).rows[0].n),0);
  await test.query('ALTER TABLE privileged_audit_events DROP CONSTRAINT pr1c_test_audit_failure');

  console.log('PR 1C disposable PostgreSQL ACL, ancestry, idempotency, lifecycle, atomicity, and rollback tests passed.');
} finally {
  if (test) await test.end().catch(() => {});
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`).catch(() => {});
    for (const role of createdRoles.reverse()) await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => {});
    await admin.end().catch(() => {});
  }
}
