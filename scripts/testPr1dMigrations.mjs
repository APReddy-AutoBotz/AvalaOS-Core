import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const adminUrl = process.env.PR1D_MIGRATION_DATABASE_URL
  || process.env.PR1C_MIGRATION_DATABASE_URL
  || process.env.PR1B_MIGRATION_DATABASE_URL;
if (!adminUrl) {
  console.error('PR1D_MIGRATION_DATABASE_URL is required.');
  process.exit(1);
}

const dbName = 'avalaos_pr1d_authority_test';
const createdRoles = [];
const migrations = fs.readdirSync('supabase/migrations').filter((file) => file.endsWith('.sql')).sort();
const pr1b = '20260712120000_pr1b_identity_rbac_rls_assess.sql';
const pr1c = '20260713120000_pr1c_enterprise_assess_ui_govern_studio_handoff.sql';
const pr1d = '20260714120000_pr1d_assess_v2_decision_intelligence.sql';
const correction = '20260715120000_pr1d_decision_integrity_correction.sql';
const baseline = migrations.slice(0, migrations.indexOf(pr1b));
const source = (name) => fs.readFileSync(path.join('supabase/migrations', name), 'utf8');
const fixture = fs.readFileSync('supabase/tests/migration-harness/pr1b_legacy_assess_fixture.sql', 'utf8');
const urlFor = (name) => { const url = new URL(adminUrl); url.pathname = `/${name}`; return url.toString(); };
const connect = async (url) => { const client = new Client({ connectionString: url }); await client.connect(); return client; };
const tx = async (client, sql) => {
  await client.query('BEGIN');
  try { await client.query(sql); await client.query('COMMIT'); } catch (error) { await client.query('ROLLBACK'); throw error; }
};
const apply = async (client, names) => { for (const name of names) await tx(client, source(name)); };
const value = (result) => result.rows[0].value;
const asRole = async (client, role, run) => {
  await client.query(`SET ROLE ${role}`);
  try { return await run(); } finally { await client.query('RESET ROLE'); }
};
const canonicalize = (input) => {
  if (typeof input === 'number') {
    if (Object.is(input, -0)) return '0';
    const serialized = String(input);
    if (!/[eE]/.test(serialized)) return serialized;
    const [coefficient, exponentText] = serialized.toLowerCase().split('e');
    const exponent = Number(exponentText);
    const negative = coefficient.startsWith('-');
    const unsigned = negative ? coefficient.slice(1) : coefficient;
    const [integer, fraction = ''] = unsigned.split('.');
    const digits = integer + fraction;
    const decimalIndex = integer.length + exponent;
    const expanded = decimalIndex <= 0
      ? `0.${'0'.repeat(-decimalIndex)}${digits}`
      : decimalIndex >= digits.length
        ? `${digits}${'0'.repeat(decimalIndex - digits.length)}`
        : `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
    return negative ? `-${expanded}` : expanded;
  }
  if (input === null || typeof input !== 'object') return JSON.stringify(input);
  if (Array.isArray(input)) return `[${input.map(canonicalize).join(',')}]`;
  return `{${Object.keys(input).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(input[key])}`).join(',')}}`;
};
const digest = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

const A = '11000000-0000-4000-8000-000000000001';
const O = '11000000-0000-4000-8000-000000000010';
const W = '11000000-0000-4000-8000-000000000011';
const P = '11000000-0000-4000-8000-000000000013';
const V1 = '11000000-0000-4000-8000-000000000014';
const B = '22000000-0000-4000-8000-000000000002';
const OB = '22000000-0000-4000-8000-000000000020';
const WB = '22000000-0000-4000-8000-000000000022';
const V1B = '22000000-0000-4000-8000-000000000025';
const CASE = '31000000-0000-4000-8000-000000000001';
const CASE2 = '31000000-0000-4000-8000-000000000002';
const CLONE = '31000000-0000-4000-8000-000000000003';
const NEG_DIGEST = '31000000-0000-4000-8000-000000000004';
const NEG_BINDING = '31000000-0000-4000-8000-000000000005';
const NEG_SNAPSHOT = '31000000-0000-4000-8000-000000000006';
const NEG_AUDIT = '31000000-0000-4000-8000-000000000007';
const NEG_INPUT_HASH = '31000000-0000-4000-8000-000000000008';
const NEG_EVIDENCE_HASH = '31000000-0000-4000-8000-000000000009';
const NEG_OUTPUT_HASH = '31000000-0000-4000-8000-000000000010';
const NEG_WORKSPACE = '31000000-0000-4000-8000-000000000011';
const NEG_CASE = '31000000-0000-4000-8000-000000000012';
const NEG_SOURCE_VERSION = '31000000-0000-4000-8000-000000000013';
const NEG_RULE_SET = '31000000-0000-4000-8000-000000000014';
const NEG_ALTERED_SNAPSHOT = '31000000-0000-4000-8000-000000000015';
const NEG_CANONICAL_ORDER = '31000000-0000-4000-8000-000000000016';
const APPROVED_CLONE = '31000000-0000-4000-8000-000000000017';
const INACTIVE_CLONE = '31000000-0000-4000-8000-000000000018';
const NEG_FABRICATED_EVIDENCE = '31000000-0000-4000-8000-000000000019';
const req = (number) => `41000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

let admin;
let test;
try {
  admin = await connect(adminUrl);
  for (const [role, attributes] of [
    ['anon', 'NOLOGIN'],
    ['authenticated', 'NOLOGIN'],
    ['service_role', 'NOLOGIN BYPASSRLS'],
    ['pr1d_unprivileged', 'NOLOGIN'],
  ]) {
    if (!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rowCount) {
      await admin.query(`CREATE ROLE ${role} ${attributes}`);
      createdRoles.push(role);
    }
  }
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${dbName}`);
  test = await connect(urlFor(dbName));
  await tx(test, `
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid primary key);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  `);
  await apply(test, baseline);
  await tx(test, fixture);
  await apply(test, [pr1b, pr1c, pr1d, correction]);

  await test.query(
    "INSERT INTO role_capabilities(role_id,capability_key) SELECT om.role_id,capability.capability_key FROM organization_members om CROSS JOIN (VALUES ('govern.resolve'),('studio.handoff.create')) capability(capability_key) WHERE om.org_id=$1 AND om.user_id=$2 ON CONFLICT DO NOTHING",
    [O, A],
  );

  const oldFinalize = 'pr1d_finalize_assess_v2_case(uuid,uuid,uuid,uuid,bigint,jsonb,jsonb,jsonb,text,text,text,text,text,timestamp with time zone,uuid,text,bigint)';
  const newFinalize = 'pr1d_finalize_assess_v2_case(uuid,uuid,uuid,uuid,bigint,jsonb,text,jsonb,text,jsonb,text,text,text,text,text,text,timestamp with time zone,uuid,text,bigint)';
  assert.equal((await test.query('SELECT to_regprocedure($1) value', [oldFinalize])).rows[0].value, null);
  assert.ok((await test.query('SELECT to_regprocedure($1) value', [newFinalize])).rows[0].value);
  const cloneSignature = 'pr1d_clone_assess_v2_from_v1(uuid,uuid,uuid,uuid,uuid,text,text,uuid,jsonb,jsonb,jsonb,jsonb,text,uuid,text,bigint)';
  for (const signature of [
    'pr1d_create_assess_v2_case(uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,bigint)',
    cloneSignature,
    'pr1d_upsert_assess_v2_draft(uuid,uuid,uuid,uuid,bigint,jsonb,uuid,text,bigint)',
    newFinalize,
  ]) {
    for (const role of ['anon', 'authenticated', 'pr1d_unprivileged']) {
      assert.equal((await test.query("SELECT has_function_privilege($1,$2,'EXECUTE') ok", [role, signature])).rows[0].ok, false);
    }
    assert.equal((await test.query("SELECT has_function_privilege('service_role',$1,'EXECUTE') ok", [signature])).rows[0].ok, true);
  }
  for (const signature of ['pr1d_assert_enabled()', 'pr1d_resource(uuid,uuid,uuid)', 'pr1d_canonical_json(jsonb)']) {
    const publicExecute = (await test.query(
      "SELECT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl WHERE p.oid=to_regprocedure($1) AND acl.grantee=0 AND acl.privilege_type='EXECUTE') ok",
      [signature],
    )).rows[0].ok;
    assert.equal(publicExecute, false);
    for (const role of ['anon', 'authenticated', 'service_role', 'pr1d_unprivileged']) {
      assert.equal((await test.query("SELECT has_function_privilege($1,$2,'EXECUTE') ok", [role, signature])).rows[0].ok, false);
    }
  }
  for (const role of ['anon', 'authenticated', 'pr1d_unprivileged']) {
    await asRole(test, role, async () => {
      await assert.rejects(test.query('SELECT public.pr1d_assert_enabled()'), /permission denied for function pr1d_assert_enabled/);
      await assert.rejects(
        test.query('SELECT public.pr1d_resource($1,$2,$3)', [CASE, O, W]),
        /permission denied for function pr1d_resource/,
      );
    });
  }

  for (const table of [
    'assess_v2_cases', 'assess_v2_case_versions', 'assess_v2_decision_versions',
    'assess_v2_decision_points', 'assess_v2_exception_paths', 'assess_v2_candidate_evaluations',
    'assess_v2_gate_results', 'assess_v2_control_requirements', 'assess_v2_modernization_dispositions',
  ]) {
    const relation = (await test.query('SELECT relrowsecurity rls,relforcerowsecurity forced FROM pg_class WHERE oid=$1::regclass', [table])).rows[0];
    assert.equal(relation.rls, true);
    assert.equal(relation.forced, true);
    for (const privilege of ['INSERT', 'UPDATE', 'DELETE']) {
      assert.equal((await test.query("SELECT has_table_privilege('authenticated',$1,$2) ok", [table, privilege])).rows[0].ok, false);
    }
  }

  let authorizationVersion = Number((await test.query(
    'SELECT version FROM authorization_versions WHERE org_id=$1 AND user_id=$2', [O, A],
  )).rows[0].version);
  const callCreate = (id, key, number, processId = id) => asRole(test, 'service_role', () => test.query(
    'SELECT pr1d_create_assess_v2_case($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
    [A, O, W, id, processId, 'V2 Case', '', req(number), key, authorizationVersion],
  ));
  const createIds = [CASE, CASE2, NEG_DIGEST, NEG_BINDING, NEG_SNAPSHOT, NEG_AUDIT, NEG_INPUT_HASH, NEG_EVIDENCE_HASH, NEG_OUTPUT_HASH, NEG_WORKSPACE, NEG_CASE, NEG_SOURCE_VERSION, NEG_RULE_SET, NEG_ALTERED_SNAPSHOT, NEG_CANONICAL_ORDER, NEG_FABRICATED_EVIDENCE];
  for (let index = 0; index < createIds.length; index += 1) {
    await test.query('INSERT INTO assess_processes(id,org_id,workspace_id,name,status) VALUES($1,$2,$3,$4,$5)', [createIds[index], O, W, `V2 fixture process ${index}`, 'Draft']);
    const created = value(await callCreate(createIds[index], `create-v2-${index}`, 20 + index));
    assert.equal(created.resource.status, 'draft');
    assert.equal(Number(created.resource.version), 1);
  }
  const replay = value(await callCreate(CASE, 'create-v2-0', 20));
  assert.equal(replay.outcome, 'replayed');
  assert.equal(value(await callCreate('31000000-0000-4000-8000-000000000099', 'create-v2-0', 99, P)).errorCode, 'IDEMPOTENCY_CONFLICT');
  const duplicateProcess = '12000000-0000-4000-8000-000000000099';
  const duplicateFirst = '31000000-0000-4000-8000-000000000100';
  const duplicateSecond = '31000000-0000-4000-8000-000000000101';
  await test.query('INSERT INTO assess_processes(id,org_id,workspace_id,name,status) VALUES($1,$2,$3,$4,$5)', [duplicateProcess, O, W, 'V2 duplicate prevention fixture', 'Draft']);
  assert.equal(value(await callCreate(duplicateFirst, 'create-v2-duplicate-first', 100, duplicateProcess)).outcome, 'committed');
  assert.equal(value(await callCreate(duplicateSecond, 'create-v2-duplicate-second', 101, duplicateProcess)).errorCode, 'VERSION_CONFLICT');
  assert.equal(Number((await test.query(`SELECT count(*) n FROM assess_v2_cases WHERE org_id=$1 AND workspace_id=$2 AND process_id=$3 AND deleted_at IS NULL AND status IN ('draft','reviewer_ready')`, [O, W, duplicateProcess])).rows[0].n), 1);
  assert.equal(Number((await test.query('SELECT count(*) n FROM assess_command_receipts WHERE idempotency_key=$1', ['create-v2-duplicate-second'])).rows[0].n), 0);
  assert.equal(Number((await test.query("SELECT count(*) n FROM privileged_audit_events WHERE action='assessment_v2.create' AND resource_id=$1", [duplicateSecond])).rows[0].n), 0);

  const v1Responses = {
    processStructure: { trigger: 'invoice-received', nested: { handoffs: 3 } },
    workPattern: { volume: 800 },
    dataProfile: { format: null },
    judgment: { ambiguity: 'medium' },
    systems: { erp: 'retained' },
    risk: { financial: true },
    forbiddenSecretSection: { token: 'must-not-import' },
  };
  const v1Evidence = [{ id: 'legacy-evidence-1', linkedField: 'processStructure.trigger', owner: 'process-owner' }, { id: 'legacy-evidence-without-owner', linkedField: 'risk.financial' }];
  const v1Assumptions = [{ id:'api-availability',description:'The ERP API remains available.' }];
  const evidenceId1 = 'f9177f53-6161-50b7-b73e-aea9d29f9ba3';
  const evidenceId2 = '863d45e6-4592-54ba-accb-17acd04d48d6';
  const importedFacts = [
    { fieldId:'v1.responses.processStructure.nested.handoffs',value:3,status:'assumed',evidenceIds:[],source:'v1-import' },
    { fieldId:'v1.responses.processStructure.trigger',value:'invoice-received',status:'assumed',evidenceIds:[evidenceId1],source:'v1-import' },
    { fieldId:'v1.responses.workPattern.volume',value:800,status:'assumed',evidenceIds:[],source:'v1-import' },
    { fieldId:'v1.responses.dataProfile.format',value:null,status:'unknown',evidenceIds:[],source:'v1-import' },
    { fieldId:'v1.responses.judgment.ambiguity',value:'medium',status:'assumed',evidenceIds:[],source:'v1-import' },
    { fieldId:'v1.responses.systems.erp',value:'retained',status:'assumed',evidenceIds:[],source:'v1-import' },
    { fieldId:'v1.responses.risk.financial',value:true,status:'assumed',evidenceIds:[evidenceId2],source:'v1-import' },
    { fieldId:'v1.assumptions.api-availability',value:'The ERP API remains available.',status:'assumed',evidenceIds:[],source:'v1-import' },
  ];
  const importedEvidence = [
    { id:evidenceId1,claimIds:['v1.responses.processStructure.trigger'],sourceType:'document',status:'submitted',validated:false,owner:'process-owner',reviewerIds:[],contradictory:false },
    { id:evidenceId2,claimIds:['v1.responses.risk.financial'],sourceType:'document',status:'submitted',validated:false,reviewerIds:[],contradictory:false },
  ];
  const agentNecessity = Object.fromEntries([
    'irreducibleAmbiguity','adaptiveNextStep','toolOrPathSelection','incrementalValue','controllable',
  ].map(key => [key,{fieldId:`agent.${key}`,value:null,status:'unknown',evidenceIds:[],source:'user'}]));
  const sourceV1 = { assessmentId:V1,scoreVersion:'assess-core-2026-05',clonedAt:'2026-07-15T12:00:00.000Z',importedAs:'unverified-source-facts' };
  const cloneArgs = (caseId, sourceAssessmentId, name, contract, requestNumber, idempotencyKey, overrides = {}) => [
    A,O,W,caseId,sourceAssessmentId,name,'',overrides.sourceProcessId ?? P,JSON.stringify(overrides.sourceV1 ?? sourceV1),
    JSON.stringify(overrides.importedFacts ?? importedFacts),JSON.stringify(overrides.importedEvidence ?? importedEvidence),JSON.stringify(overrides.agentNecessity ?? agentNecessity),
    contract,req(requestNumber),idempotencyKey,overrides.authorizationVersion ?? authorizationVersion,
  ];
  await test.query(
    "UPDATE assessments SET score_version='assess-core-2026-05',responses=$2,evidence_items=$3,assumptions=$4,status='Ready for Review',version=1 WHERE id=$1",
    [V1, JSON.stringify(v1Responses), JSON.stringify(v1Evidence), JSON.stringify(v1Assumptions)],
  );
  const sqlEvidenceIds = (await test.query(
    'SELECT pr1d_v1_evidence_id($1,item)::text id FROM unnest($2::text[]) WITH ORDINALITY source(item,ordinal) ORDER BY ordinal',
    [V1,['legacy-evidence-1','legacy-evidence-without-owner']],
  )).rows.map(row => row.id);
  assert.deepEqual(sqlEvidenceIds,[evidenceId1,evidenceId2]);
  const sqlResponseFacts = value(await test.query('SELECT pr1d_v1_import_facts($1) value',[JSON.stringify(v1Responses)]));
  assert.deepEqual(sqlResponseFacts,importedFacts.filter(item=>item.fieldId.startsWith('v1.responses.')).map(item=>({...item,evidenceIds:[]})));
  const approvedV1 = value(await asRole(test, 'service_role', () => test.query(
    'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
    [A, O, W, V1, 'approve', 'Compatibility provenance fixture', 1, req(15), 'v1-approve-before-clone', authorizationVersion],
  )));
  assert.equal(approvedV1.resource.status, 'Approved');
  assert.equal(Number(approvedV1.resource.version), 2);
  const approvedClone = value(await asRole(test, 'service_role', () => test.query(
    'SELECT pr1d_clone_assess_v2_from_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) value',
    cloneArgs(APPROVED_CLONE,V1,'Approved lifecycle clone','assess-v1-to-v2-clone-2026-07-15',17,'clone-approved-lifecycle'),
  )));
  assert.equal(approvedClone.resource.status, 'draft');
  await test.query("UPDATE assess_v2_cases SET status='superseded' WHERE id=$1", [APPROVED_CLONE]);
  const handedOffV1 = value(await asRole(test, 'service_role', () => test.query(
    'SELECT pr1c_create_studio_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
    [A, O, W, V1, 'Compatibility handoff fixture', 2, req(16), 'v1-handoff-before-clone', authorizationVersion],
  )));
  assert.equal(handedOffV1.resource.status, 'Handed Off to Docs');
  assert.equal(Number(handedOffV1.resource.version), 3);
  const provenanceBeforeClone = (await test.query(
    'SELECT * FROM assessment_govern_provenance WHERE assessment_id=$1 ORDER BY id', [V1],
  )).rows;
  const handoffsBeforeClone = (await test.query(
    'SELECT * FROM assessment_studio_handoffs WHERE assessment_id=$1 ORDER BY id', [V1],
  )).rows;
  assert.equal(provenanceBeforeClone.length, 1);
  assert.equal(handoffsBeforeClone.length, 1);
  const sourceBefore = (await test.query(
    'SELECT responses,evidence_items,assumptions,score_version,status,version FROM assessments WHERE id=$1', [V1],
  )).rows[0];
  for (const [capability, deniedCaseId, key, requestNumber] of [
    ['assess.v2.create', '31000000-0000-4000-8000-000000000090', 'clone-without-v2-create', 51],
    ['assess.read', '31000000-0000-4000-8000-000000000091', 'clone-without-v1-read', 52],
  ]) {
    await test.query(
      'DELETE FROM role_capabilities WHERE role_id=$1 AND capability_key=$2',
      ['11000000-0000-4000-8000-000000000012', capability],
    );
    const deniedAuthorizationVersion = Number((await test.query(
      'SELECT version FROM authorization_versions WHERE org_id=$1 AND user_id=$2', [O, A],
    )).rows[0].version);
    await assert.rejects(asRole(test, 'service_role', () => test.query(
      'SELECT pr1d_clone_assess_v2_from_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) value',
      cloneArgs(deniedCaseId,V1,'Denied clone','assess-v1-to-v2-clone-2026-07-15',requestNumber,key,{authorizationVersion:deniedAuthorizationVersion}),
    )), /PR1B_NOT_FOUND/);
    assert.equal(Number((await test.query('SELECT count(*) n FROM assess_v2_cases WHERE id=$1',[deniedCaseId])).rows[0].n),0);
    assert.equal(Number((await test.query('SELECT count(*) n FROM assess_command_receipts WHERE idempotency_key=$1',[key])).rows[0].n),0);
    assert.equal(Number((await test.query('SELECT count(*) n FROM privileged_audit_events WHERE resource_id=$1',[deniedCaseId])).rows[0].n),0);
    await test.query('INSERT INTO role_capabilities(role_id,capability_key) VALUES($1,$2)', ['11000000-0000-4000-8000-000000000012', capability]);
  }
  authorizationVersion = Number((await test.query(
    'SELECT version FROM authorization_versions WHERE org_id=$1 AND user_id=$2', [O, A],
  )).rows[0].version);
  const rejectedClone = value(await asRole(test, 'service_role', () => test.query(
    'SELECT pr1d_clone_assess_v2_from_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) value',
    cloneArgs('31000000-0000-4000-8000-000000000097',V1,'Rejected clone','wrong-contract',29,'clone-wrong-contract'),
  )));
  assert.deepEqual(rejectedClone, { errorCode: 'INVALID_COMMAND' });
  assert.equal(Number((await test.query("SELECT count(*) n FROM assess_v2_cases WHERE id='31000000-0000-4000-8000-000000000097'")).rows[0].n), 0);
  assert.equal(Number((await test.query("SELECT count(*) n FROM assess_command_receipts WHERE idempotency_key='clone-wrong-contract'")).rows[0].n), 0);
  assert.equal(Number((await test.query("SELECT count(*) n FROM privileged_audit_events WHERE resource_id='31000000-0000-4000-8000-000000000097'")).rows[0].n), 0);
  for (const [caseId,key,overrides] of [
    ['31000000-0000-4000-8000-000000000094','clone-wrong-process',{sourceProcessId:'31000000-0000-4000-8000-000000000099'}],
    ['31000000-0000-4000-8000-000000000095','clone-bad-fact',{importedFacts:[{...importedFacts[0],fieldId:'v1.responses.forbiddenSecretSection.token'}]}],
    ['31000000-0000-4000-8000-000000000096','clone-bad-provenance',{sourceV1:{...sourceV1,assessmentId:V1B}}],
    ['31000000-0000-4000-8000-000000000092','clone-fabricated-allowed-fact',{importedFacts:importedFacts.map((item,index)=>index===0?{...item,value:'fabricated'}:item)}],
    ['31000000-0000-4000-8000-000000000093','clone-fabricated-evidence',{importedEvidence:importedEvidence.map((item,index)=>index===0?{...item,owner:'fabricated-owner'}:item)}],
  ]) {
    const invalidProjection = value(await asRole(test,'service_role',() => test.query(
      'SELECT pr1d_clone_assess_v2_from_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) value',
      cloneArgs(caseId,V1,'Invalid projection','assess-v1-to-v2-clone-2026-07-15',32,key,overrides),
    )));
    assert.deepEqual(invalidProjection,{errorCode:'INVALID_COMMAND'});
    assert.equal(Number((await test.query('SELECT count(*) n FROM assess_v2_cases WHERE id=$1',[caseId])).rows[0].n),0);
    assert.equal(Number((await test.query('SELECT count(*) n FROM assess_command_receipts WHERE idempotency_key=$1',[key])).rows[0].n),0);
    assert.equal(Number((await test.query('SELECT count(*) n FROM privileged_audit_events WHERE resource_id=$1',[caseId])).rows[0].n),0);
    assert.equal(Number((await test.query('SELECT count(*) n FROM assess_v2_evidence_links WHERE case_id=$1',[caseId])).rows[0].n),0);
  }
  const cloned = value(await asRole(test, 'service_role', () => test.query(
    'SELECT pr1d_clone_assess_v2_from_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) value',
    cloneArgs(CLONE,V1,'Clone','assess-v1-to-v2-clone-2026-07-15',30,'clone-v1'),
  )));
  assert.equal(cloned.resource.status, 'draft');
  assert.equal(cloned.resource.importedFactCount, 8);
  assert.equal(cloned.resource.importedEvidenceCount, 2);
  assert.equal(cloned.resource.cloneContractVersion, 'assess-v1-to-v2-clone-2026-07-15');
  const cloneRetryTimestamp = '2026-07-15T12:01:00.000Z';
  const cloneReplay = value(await asRole(test, 'service_role', () => test.query(
    'SELECT pr1d_clone_assess_v2_from_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) value',
    cloneArgs(CLONE,V1,'Clone','assess-v1-to-v2-clone-2026-07-15',33,'clone-v1',{sourceV1:{...sourceV1,clonedAt:cloneRetryTimestamp}}),
  )));
  assert.equal(cloneReplay.outcome, 'replayed');
  assert.deepEqual(cloneReplay.resource, cloned.resource);
  assert.equal((await test.query(
    "SELECT source_snapshot->>'clonedAt' cloned_at FROM assess_v2_case_versions WHERE case_id=$1 AND version=1",
    [CLONE],
  )).rows[0].cloned_at, sourceV1.clonedAt);
  const sourceAfter = (await test.query(
    'SELECT responses,evidence_items,assumptions,score_version,status,version FROM assessments WHERE id=$1', [V1],
  )).rows[0];
  assert.deepEqual(sourceAfter, sourceBefore);
  const provenanceAfterClone = (await test.query(
    'SELECT * FROM assessment_govern_provenance WHERE assessment_id=$1 ORDER BY id', [V1],
  )).rows;
  const handoffsAfterClone = (await test.query(
    'SELECT * FROM assessment_studio_handoffs WHERE assessment_id=$1 ORDER BY id', [V1],
  )).rows;
  assert.deepEqual(provenanceAfterClone, provenanceBeforeClone);
  assert.deepEqual(handoffsAfterClone, handoffsBeforeClone);
  const cloneVersion = (await test.query(
    'SELECT source_snapshot,imported_facts FROM assess_v2_case_versions WHERE case_id=$1', [CLONE],
  )).rows[0];
  assert.equal(cloneVersion.source_snapshot.importedAs, 'unverified-source-facts');
  assert.equal(cloneVersion.source_snapshot.factCount, 8);
  assert.equal(cloneVersion.source_snapshot.evidenceCount, 2);
  assert.equal(JSON.stringify(cloneVersion.source_snapshot).includes('must-not-import'), false);
  assert.equal(cloneVersion.imported_facts.some((fact) => fact.fieldId.startsWith('v1.responses.forbiddenSecretSection')), false);
  assert.equal(cloneVersion.imported_facts.every((fact) => ['assumed', 'unknown'].includes(fact.status) && fact.source === 'v1-import'), true);
  const triggerFact = cloneVersion.imported_facts.find((fact) => fact.fieldId === 'v1.responses.processStructure.trigger');
  assert.equal(triggerFact.evidenceIds.length, 1);
  const clonedEvidenceRows = (await test.query(
    'SELECT payload FROM assess_v2_evidence_links WHERE case_id=$1 ORDER BY payload->>\'claimIds\'', [CLONE],
  )).rows.map(row => row.payload);
  assert.equal(clonedEvidenceRows.length, 2);
  const clonedEvidence = clonedEvidenceRows.find(item => item.claimIds.includes('v1.responses.processStructure.trigger'));
  const ownerlessEvidence = clonedEvidenceRows.find(item => item.claimIds.includes('v1.responses.risk.financial'));
  assert.ok(clonedEvidence);
  assert.ok(ownerlessEvidence);
  assert.equal(clonedEvidence.status, 'submitted');
  assert.equal(clonedEvidence.validated, false);
  assert.deepEqual(clonedEvidence.claimIds, ['v1.responses.processStructure.trigger']);
  const loadedClone = value(await asRole(test, 'service_role', () => test.query(
    'SELECT pr1d_load_assess_v2_case($1,$2,$3,$4) value', [CLONE, O, W, 1],
  )));
  assert.deepEqual(loadedClone.importedFacts, cloneVersion.imported_facts);
  assert.equal(Object.hasOwn(ownerlessEvidence, 'owner'), false);
  const expectedAgentFieldIds = ['agent.irreducibleAmbiguity','agent.adaptiveNextStep','agent.toolOrPathSelection','agent.incrementalValue','agent.controllable'].sort();
  assert.deepEqual(Object.values(loadedClone.agentNecessity).map(fact => fact.fieldId).sort(), expectedAgentFieldIds);
  assert.equal(Object.values(loadedClone.agentNecessity).every(fact =>
    fact.value === null && fact.status === 'unknown' && fact.source === 'user'
      && Array.isArray(fact.evidenceIds) && fact.evidenceIds.length === 0
      && Object.keys(fact).sort().join(',') === 'evidenceIds,fieldId,source,status,value'
  ), true);
  const reviewedCloneEvidence = clonedEvidenceRows.map(item => item.id === evidenceId1
    ? { ...item, owner:'reviewer-updated-owner' }
    : item);
  const cloneDraft = {
    caseId:CLONE,name:'Reviewer-authored clone',description:'',primitives:[],edges:[],decisionPoints:[],exceptionPaths:[],
    assets:[],interactions:[],evidence:reviewedCloneEvidence,agentNecessity,
  };
  const savedClone = value(await asRole(test,'service_role',() => test.query(
    'SELECT pr1d_upsert_assess_v2_draft($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
    [A,O,W,CLONE,1,cloneDraft,req(33),'save-clone-review',authorizationVersion],
  )));
  assert.equal(Number(savedClone.resource.version),2);
  const loadedSavedClone = value(await asRole(test,'service_role',() => test.query(
    'SELECT pr1d_load_assess_v2_case($1,$2,$3,$4) value',[CLONE,O,W,2],
  )));
  assert.deepEqual(loadedSavedClone.sourceV1,sourceV1);
  assert.equal(loadedSavedClone.evidence.length,2);
  assert.equal(new Set(loadedSavedClone.evidence.map(item => item.id)).size,2);
  assert.deepEqual(loadedSavedClone.evidence.map(item => item.id).sort(),[evidenceId1,evidenceId2].sort());
  assert.equal(loadedSavedClone.evidence.find(item => item.id === evidenceId1).owner,'reviewer-updated-owner');
  assert.deepEqual(loadedSavedClone.importedFacts,cloneVersion.imported_facts);

  const hiddenClone = value(await asRole(test, 'service_role', () => test.query(
    'SELECT pr1d_clone_assess_v2_from_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) value',
    cloneArgs('31000000-0000-4000-8000-000000000098',V1B,'Hidden','assess-v1-to-v2-clone-2026-07-15',31,'clone-hidden'),
  )));
  assert.deepEqual(hiddenClone, { errorCode: 'NOT_FOUND' });

  await test.query("UPDATE assessments SET status='Changes Requested' WHERE id=$1", [V1]);
  const inactiveClone = value(await asRole(test, 'service_role', () => test.query(
    'SELECT pr1d_clone_assess_v2_from_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) value',
    cloneArgs(INACTIVE_CLONE,V1,'Inactive lifecycle clone','assess-v1-to-v2-clone-2026-07-15',34,'clone-inactive-lifecycle'),
  )));
  assert.deepEqual(inactiveClone, { errorCode: 'NOT_FOUND' });
  assert.equal(Number((await test.query('SELECT count(*) n FROM assess_v2_cases WHERE id=$1',[INACTIVE_CLONE])).rows[0].n),0);
  assert.equal(Number((await test.query("SELECT count(*) n FROM assess_command_receipts WHERE idempotency_key='clone-inactive-lifecycle'")).rows[0].n),0);
  assert.equal(Number((await test.query('SELECT count(*) n FROM privileged_audit_events WHERE resource_id=$1',[INACTIVE_CLONE])).rows[0].n),0);

  const primitive = '51000000-0000-4000-8000-000000000003';
  const decisionPoint = '51000000-0000-4000-8000-000000000001';
  const exceptionPath = '51000000-0000-4000-8000-000000000002';
  const authoring = {
    caseId: CASE,
    name: 'Edited',
    description: '',
    primitives: [{ id: primitive }],
    edges: [],
    decisionPoints: [{ id: decisionPoint, primitiveId: primitive, name: 'Gate', ruleDescription: 'Route', outcomeLabels: ['continue', 'exception'], evidenceIds: [] }],
    exceptionPaths: [{ id: exceptionPath, fromPrimitiveId: primitive, name: 'Exception', trigger: 'Failure', resolutionPrimitiveIds: [primitive], evidenceIds: [] }],
    assets: [], interactions: [], evidence: [],
    agentNecessity: { irreducibleAmbiguity: null, adaptiveNextStep: null, toolOrPathSelection: null, incrementalValue: null, controllable: null },
  };
  const raceA = await connect(urlFor(dbName));
  const raceB = await connect(urlFor(dbName));
  const upsert = (client, key, number) => asRole(client, 'service_role', () => client.query(
    'SELECT pr1d_upsert_assess_v2_draft($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
    [A, O, W, CASE, 1, authoring, req(number), key, authorizationVersion],
  ));
  let race;
  try {
    race = await Promise.all([upsert(raceA, 'race-a', 40), upsert(raceB, 'race-b', 41)]).then((results) => results.map(value));
  } finally {
    await raceA.end();
    await raceB.end();
  }
  assert.equal(race.filter((result) => result.resource?.version === 2).length, 1);
  assert.equal(race.filter((result) => result.errorCode === 'VERSION_CONFLICT').length, 1);
  assert.equal(Number((await test.query('SELECT count(*) n FROM assess_v2_decision_points WHERE case_id=$1', [CASE])).rows[0].n), 1);
  assert.equal(Number((await test.query('SELECT count(*) n FROM assess_v2_exception_paths WHERE case_id=$1', [CASE])).rows[0].n), 1);

  const sameUpsertA = await connect(urlFor(dbName));
  const sameUpsertB = await connect(urlFor(dbName));
  const sameAuthoring = { ...authoring, caseId: CASE2, name: 'Same-key edited' };
  const sameKeyUpsert = (client) => asRole(client, 'service_role', () => client.query(
    'SELECT pr1d_upsert_assess_v2_draft($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
    [A, O, W, CASE2, 1, sameAuthoring, req(42), 'same-upsert', authorizationVersion],
  ));
  let sameUpsertRace;
  try {
    sameUpsertRace = await Promise.all([sameKeyUpsert(sameUpsertA), sameKeyUpsert(sameUpsertB)]).then((results) => results.map(value));
  } finally {
    await sameUpsertA.end();
    await sameUpsertB.end();
  }
  assert.equal(sameUpsertRace.filter((result) => result.outcome === 'committed').length, 1);
  assert.equal(sameUpsertRace.filter((result) => result.outcome === 'replayed').length, 1);
  assert.equal(sameUpsertRace.every((result) => Number(result.resource?.version) === 2), true);
  assert.equal(Number((await test.query('SELECT count(*) n FROM assess_v2_case_versions WHERE case_id=$1', [CASE2])).rows[0].n), 2);
  assert.equal(Number((await test.query("SELECT count(*) n FROM assess_command_receipts WHERE idempotency_key='same-upsert' AND status='succeeded'")).rows[0].n), 1);

  const ruleSetVersion = 'assess-v2-rules-2026-07';
  const decisionVersion = 'assess-v2-decision-2026-07';
  const schemaVersion = 'assess-v2-schema-2026-07';
  const makeOutput = (caseId) => ({
    caseId,
    validationStatus: 'reviewer-ready',
    candidateEvaluations: [{ id: crypto.randomUUID(), primitiveId: primitive, component: 'Deterministic Rules', fit: 'Strong Fit' }],
    gateResults: [{ id: crypto.randomUUID(), ruleId: 'GATE-001', subjectId: primitive, status: 'pass', reason: 'evidenced' }],
    controlRequirements: [{ id: crypto.randomUUID(), subjectId: primitive, control: 'Audit', required: true, rationale: 'required', ruleIds: ['CTRL-001'] }],
    modernization: [{ assetId: 'asset-1', dispositions: ['Retain'], rationale: ['stable'] }],
  });
  const bound = (domain, caseId, sourceVersion, payload) => {
    const canonical = canonicalize({
      canonicalizationVersion: 'avala-canonical-json-1',
      domain,
      organizationId: O,
      workspaceId: W,
      caseId,
      sourceCaseVersion: sourceVersion,
      schemaVersion,
      ruleSetVersion,
      decisionVersion,
      payload,
    });
    return { canonical, hash: digest(canonical) };
  };
  const verifierPayload = { verifier: 'independent-binding-proof' };
  const verifierBound = bound('output', NEG_BINDING, 1, verifierPayload);
  const verifierCounts = async () => (await test.query(`SELECT jsonb_build_object(
    'cases',(SELECT count(*) FROM assess_v2_cases),'decisions',(SELECT count(*) FROM assess_v2_decision_versions),
    'receipts',(SELECT count(*) FROM assess_command_receipts),'audits',(SELECT count(*) FROM privileged_audit_events),
    'candidates',(SELECT count(*) FROM assess_v2_candidate_evaluations),'gates',(SELECT count(*) FROM assess_v2_gate_results),
    'controls',(SELECT count(*) FROM assess_v2_control_requirements),'modernization',(SELECT count(*) FROM assess_v2_modernization_dispositions)) value`)).rows[0].value;
  const verifyCanonical = async (overrides = {}) => (await test.query(
    'SELECT pr1d_verify_bound_canonical(\'output\',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
    [overrides.canonical ?? verifierBound.canonical, JSON.stringify(overrides.snapshot ?? verifierPayload), overrides.hash ?? verifierBound.hash,
      overrides.organizationId ?? O, overrides.workspaceId ?? W, overrides.caseId ?? NEG_BINDING,
      overrides.sourceVersion ?? 1, schemaVersion, overrides.ruleSetVersion ?? ruleSetVersion, decisionVersion],
  )).rows[0].value;
  const verifierCountsBefore = await verifierCounts();
  assert.equal(await verifyCanonical(), true);
  const exponentPayload = { volumeShare: 1e-7, upperBound: 1e21 };
  const exponentBound = bound('output', NEG_BINDING, 1, exponentPayload);
  assert.equal(await verifyCanonical({ canonical: exponentBound.canonical, snapshot: exponentPayload, hash: exponentBound.hash }), true, 'exponent-form numbers use PostgreSQL-compatible decimal canonicalization');
  const verifierNegatives = [
    { name: 'organization binding', organizationId: OB },
    { name: 'workspace binding', workspaceId: WB },
    { name: 'case binding', caseId: CASE },
    { name: 'source-version binding', sourceVersion: 2 },
    { name: 'rule-set binding', ruleSetVersion: 'assess-v2-rules-wrong' },
    { name: 'hash binding', hash: '0'.repeat(64) },
    { name: 'snapshot binding', snapshot: { verifier: 'altered' } },
  ];
  for (const negative of verifierNegatives) assert.equal(await verifyCanonical(negative), false, negative.name);
  const reorderedVerifierCanonical = JSON.stringify({
    workspaceId: W, sourceCaseVersion: 1, schemaVersion, ruleSetVersion, payload: verifierPayload,
    organizationId: O, domain: 'output', decisionVersion, caseId: NEG_BINDING,
    canonicalizationVersion: 'avala-canonical-json-1',
  });
  assert.notEqual(reorderedVerifierCanonical, verifierBound.canonical);
  assert.equal(await verifyCanonical({ canonical: reorderedVerifierCanonical, hash: digest(reorderedVerifierCanonical) }), false, 'reordered canonical text');
  const loadAuthoritativeCase = (caseId, version, client = test) => asRole(client, 'service_role', async () => value(await client.query(
    'SELECT pr1d_load_assess_v2_case($1,$2,$3,$4) value', [caseId, O, W, version],
  )));
  const finalize = async (caseId, version, key, number, overrides = {}, client = test) => {
    const authoritativeSource = overrides.authoritativeSource ?? await loadAuthoritativeCase(caseId, version, client);
    const sourceCase = overrides.sourceCase ?? authoritativeSource;
    const evidence = overrides.evidence ?? authoritativeSource.evidence;
    const output = overrides.output ?? makeOutput(caseId);
    const selectedRuleSetVersion = overrides.ruleSetVersion ?? ruleSetVersion;
    const inputBound = overrides.inputBound ?? bound('input', caseId, version, sourceCase);
    const evidenceBound = overrides.evidenceBound ?? bound('evidence', caseId, version, evidence);
    const outputBound = overrides.outputBound ?? bound('output', caseId, version, output);
    return asRole(client, 'service_role', () => client.query(
      'SELECT pr1d_finalize_assess_v2_case($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) value',
      [A, O, overrides.workspaceId ?? W, caseId, version, JSON.stringify(sourceCase), inputBound.canonical, JSON.stringify(evidence), evidenceBound.canonical,
        JSON.stringify(output), outputBound.canonical, inputBound.hash, evidenceBound.hash, outputBound.hash,
        selectedRuleSetVersion, decisionVersion, new Date().toISOString(), req(number), key, authorizationVersion],
    ));
  };
  const finalizedClone = value(await finalize(CLONE,2,'finalize-reviewed-clone',49,{
    sourceCase:loadedSavedClone,evidence:loadedSavedClone.evidence,output:makeOutput(CLONE),
  }));
  assert.equal(finalizedClone.resource.status,'reviewer_ready');
  assert.equal(Number(finalizedClone.resource.version),3);
  assert.equal(Number((await test.query('SELECT count(*) n FROM assess_v2_decision_versions WHERE case_id=$1',[CLONE])).rows[0].n),1);

  const assertNoFinalizeSideEffects = async (caseId, key) => {
    const caseState = (await test.query('SELECT status,version FROM assess_v2_cases WHERE id=$1', [caseId])).rows[0];
    assert.deepEqual(caseState, { status: 'draft', version: '1' });
    assert.equal(Number((await test.query('SELECT count(*) n FROM assess_v2_decision_versions WHERE case_id=$1', [caseId])).rows[0].n), 0);
    for (const table of ['assess_v2_candidate_evaluations', 'assess_v2_gate_results', 'assess_v2_control_requirements', 'assess_v2_modernization_dispositions']) {
      assert.equal(Number((await test.query(`SELECT count(*) n FROM ${table} WHERE case_id=$1`, [caseId])).rows[0].n), 0);
    }
    assert.equal(Number((await test.query("SELECT count(*) n FROM privileged_audit_events WHERE resource_id=$1 AND action='assessment_v2.finalize'", [caseId])).rows[0].n), 0);
    assert.equal(Number((await test.query('SELECT count(*) n FROM assess_command_receipts WHERE idempotency_key=$1', [key])).rows[0].n), 0);
  };

  const negativeMatrix = [
    {
      name: 'fabricated source and output snapshots', caseId: NEG_CASE, key: 'fabricated-source-output', number: 54,
      overrides: async (caseId) => {
        const sourceCase = { ...(await loadAuthoritativeCase(caseId, 1)), name: 'Fabricated service-role source' };
        const output = makeOutput(caseId);
        output.candidateEvaluations[0].fit = 'Fabricated Fit';
        return { sourceCase, output };
      },
    },
    {
      name: 'fabricated evidence snapshot', caseId: NEG_FABRICATED_EVIDENCE, key: 'fabricated-evidence', number: 59,
      overrides: () => ({ evidence: [{ id: crypto.randomUUID(), claimIds: ['fabricated'], sourceType: 'document', status: 'submitted', validated: false }] }),
    },
    {
      name: 'input hash', caseId: NEG_INPUT_HASH, key: 'bad-input-hash', number: 50,
      overrides: async (caseId) => { const sourceCase = await loadAuthoritativeCase(caseId, 1); return { sourceCase, inputBound: { ...bound('input', caseId, 1, sourceCase), hash: '0'.repeat(64) } }; },
    },
    {
      name: 'evidence hash', caseId: NEG_EVIDENCE_HASH, key: 'bad-evidence-hash', number: 51,
      overrides: (caseId) => ({ evidenceBound: { ...bound('evidence', caseId, 1, []), hash: '0'.repeat(64) } }),
    },
    {
      name: 'output hash', caseId: NEG_OUTPUT_HASH, key: 'bad-output-hash', number: 52,
      overrides: (caseId) => { const output = makeOutput(caseId); return { output, outputBound: { ...bound('output', caseId, 1, output), hash: '0'.repeat(64) } }; },
    },
    {
      name: 'wrong workspace', caseId: NEG_WORKSPACE, key: 'wrong-workspace', number: 53,
      overrides: () => ({ workspaceId: WB }), throws: /PR1B_NOT_FOUND/,
    },

    {
      name: 'wrong source version', caseId: NEG_SOURCE_VERSION, key: 'wrong-source-version', number: 55,
      overrides: (caseId) => ({ sourceCase: { id: caseId, version: 2 } }),
    },
    {
      name: 'wrong rule-set version', caseId: NEG_RULE_SET, key: 'wrong-rule-set', number: 56,
      overrides: () => ({ ruleSetVersion: 'assess-v2-rules-wrong' }),
    },
    {
      name: 'altered snapshot', caseId: NEG_ALTERED_SNAPSHOT, key: 'altered-snapshot', number: 57,
      overrides: (caseId) => { const original = makeOutput(caseId); return { output: { ...original, tampered: true }, outputBound: bound('output', caseId, 1, original) }; },
    },
  ];
  for (const negative of negativeMatrix) {
    const attempt = async () => finalize(negative.caseId, 1, negative.key, negative.number, await negative.overrides(negative.caseId));
    if (negative.throws) await assert.rejects(attempt(), negative.throws, negative.name);
    else assert.equal(value(await attempt()).errorCode, 'INVALID_COMMAND', negative.name);
    await assertNoFinalizeSideEffects(negative.caseId, negative.key);
  }

  const reorderedOutput = makeOutput(NEG_CANONICAL_ORDER);
  const reorderedOutputCanonical = JSON.stringify({
    workspaceId: W, sourceCaseVersion: 1, schemaVersion, ruleSetVersion, payload: reorderedOutput,
    organizationId: O, domain: 'output', decisionVersion, caseId: NEG_CANONICAL_ORDER,
    canonicalizationVersion: 'avala-canonical-json-1',
  });
  const reorderedFinalize = value(await finalize(NEG_CANONICAL_ORDER, 1, 'reordered-canonical-output', 58, {
    output: reorderedOutput,
    outputBound: { canonical: reorderedOutputCanonical, hash: digest(reorderedOutputCanonical) },
  }));
  assert.equal(reorderedFinalize.errorCode, 'INVALID_COMMAND');
  await assertNoFinalizeSideEffects(NEG_CANONICAL_ORDER, 'reordered-canonical-output');

  const badDigestOutput = makeOutput(NEG_DIGEST);
  const badDigestBound = bound('output', NEG_DIGEST, 1, badDigestOutput);
  const badDigest = value(await finalize(NEG_DIGEST, 1, 'bad-digest', 50, {
    output: badDigestOutput,
    outputBound: { ...badDigestBound, hash: '0'.repeat(64) },
  }));
  assert.equal(badDigest.errorCode, 'INVALID_COMMAND');
  await assertNoFinalizeSideEffects(NEG_DIGEST, 'bad-digest');

  const bindingOutput = makeOutput(NEG_BINDING);
  const wrongBindingPayload = {
    canonicalizationVersion: 'avala-canonical-json-1', domain: 'output', organizationId: OB, workspaceId: WB,
    caseId: NEG_BINDING, sourceCaseVersion: 1, schemaVersion, ruleSetVersion, decisionVersion, payload: bindingOutput,
  };
  const wrongBindingCanonical = canonicalize(wrongBindingPayload);
  const badBinding = value(await finalize(NEG_BINDING, 1, 'bad-binding', 51, {
    output: bindingOutput,
    outputBound: { canonical: wrongBindingCanonical, hash: digest(wrongBindingCanonical) },
  }));
  assert.equal(badBinding.errorCode, 'INVALID_COMMAND');
  await assertNoFinalizeSideEffects(NEG_BINDING, 'bad-binding');

  const originalOutput = makeOutput(NEG_SNAPSHOT);
  const alteredOutput = { ...originalOutput, validationStatus: 'reviewer-ready', tampered: true };
  const badSnapshot = value(await finalize(NEG_SNAPSHOT, 1, 'bad-snapshot', 52, {
    output: alteredOutput,
    outputBound: bound('output', NEG_SNAPSHOT, 1, originalOutput),
  }));
  assert.equal(badSnapshot.errorCode, 'INVALID_COMMAND');
  await assertNoFinalizeSideEffects(NEG_SNAPSHOT, 'bad-snapshot');

  await test.query(`
    CREATE FUNCTION pr1d_test_reject_finalize_audit() RETURNS trigger LANGUAGE plpgsql AS $audit$
    BEGIN IF NEW.action='assessment_v2.finalize' THEN RAISE EXCEPTION 'PR1D_TEST_AUDIT_FAILURE'; END IF; RETURN NEW; END
    $audit$;
    CREATE TRIGGER pr1d_test_reject_finalize_audit BEFORE INSERT ON privileged_audit_events
      FOR EACH ROW EXECUTE FUNCTION pr1d_test_reject_finalize_audit();
  `);
  const auditSource = await loadAuthoritativeCase(NEG_AUDIT, 1);
  const auditEvidence = auditSource.evidence;
  const auditOutput = makeOutput(NEG_AUDIT);
  const auditInputBound = bound('input', NEG_AUDIT, 1, auditSource);
  const auditEvidenceBound = bound('evidence', NEG_AUDIT, 1, auditEvidence);
  const auditOutputBound = bound('output', NEG_AUDIT, 1, auditOutput);
  const auditBounds = (await test.query(
    `SELECT
      pr1d_verify_bound_canonical('input',$1,$2,$3,$4,$5,$6,1,$7,$8,$9) input_ok,
      pr1d_verify_bound_canonical('evidence',$10,$11,$12,$4,$5,$6,1,$7,$8,$9) evidence_ok,
      pr1d_verify_bound_canonical('output',$13,$14,$15,$4,$5,$6,1,$7,$8,$9) output_ok`,
    [auditInputBound.canonical,auditSource,auditInputBound.hash,O,W,NEG_AUDIT,schemaVersion,ruleSetVersion,decisionVersion,
      auditEvidenceBound.canonical,JSON.stringify(auditEvidence),auditEvidenceBound.hash,
      auditOutputBound.canonical,auditOutput,auditOutputBound.hash],
  )).rows[0];
  assert.deepEqual(auditBounds, { input_ok: true, evidence_ok: true, output_ok: true });
  const auditPreconditions = (await test.query(
    `SELECT status='draft' status_ok,version=1 version_ok,$2::jsonb->>'id'=id::text input_case_ok,
      ($2::jsonb->>'version')::bigint=version input_version_ok,$3=rule_set_version rules_ok,
      $4::jsonb->>'caseId'=id::text output_case_ok,$4::jsonb->>'validationStatus'='reviewer-ready' validation_ok
     FROM assess_v2_cases WHERE id=$1`,
    [NEG_AUDIT, auditSource, ruleSetVersion, auditOutput],
  )).rows[0];
  assert.deepEqual(auditPreconditions, { status_ok:true,version_ok:true,input_case_ok:true,input_version_ok:true,rules_ok:true,output_case_ok:true,validation_ok:true });
  await assert.rejects(finalize(NEG_AUDIT, 1, 'atomic-finalize', 53, {
    sourceCase: auditSource, evidence: auditEvidence, output: auditOutput,
    inputBound: auditInputBound, evidenceBound: auditEvidenceBound, outputBound: auditOutputBound,
  }), /PR1D_TEST_AUDIT_FAILURE/);
  await test.query('DROP TRIGGER pr1d_test_reject_finalize_audit ON privileged_audit_events; DROP FUNCTION pr1d_test_reject_finalize_audit()');
  await assertNoFinalizeSideEffects(NEG_AUDIT, 'atomic-finalize');

  const successSource = await loadAuthoritativeCase(CASE, 2);
  const successEvidence = successSource.evidence;
  const successOutput = makeOutput(CASE);
  const successRequest = {
    sourceCase: successSource, evidence: successEvidence, output: successOutput,
    inputBound: bound('input',CASE,2,successSource),
    evidenceBound: bound('evidence',CASE,2,successEvidence),
    outputBound: bound('output',CASE,2,successOutput),
  };
  const finalizeRaceA = await connect(urlFor(dbName));
  const finalizeRaceB = await connect(urlFor(dbName));
  const sameFinalizeSource = await loadAuthoritativeCase(CASE2, 2);
  const sameFinalizeEvidence = sameFinalizeSource.evidence;
  const sameFinalizeOutput = makeOutput(CASE2);
  const sameFinalizeRequest = {
    sourceCase: sameFinalizeSource, evidence: sameFinalizeEvidence, output: sameFinalizeOutput,
    inputBound: bound('input', CASE2, 2, sameFinalizeSource),
    evidenceBound: bound('evidence', CASE2, 2, sameFinalizeEvidence),
    outputBound: bound('output', CASE2, 2, sameFinalizeOutput),
  };
  let sameFinalizeRace;
  try {
    sameFinalizeRace = await Promise.all([
      finalize(CASE2, 2, 'same-finalize', 59, sameFinalizeRequest, finalizeRaceA),
      finalize(CASE2, 2, 'same-finalize', 59, sameFinalizeRequest, finalizeRaceB),
    ]).then((results) => results.map(value));
  } finally {
    await finalizeRaceA.end();
    await finalizeRaceB.end();
  }
  assert.equal(sameFinalizeRace.filter((result) => result.outcome === 'committed').length, 1);
  assert.equal(sameFinalizeRace.filter((result) => result.outcome === 'replayed').length, 1);
  assert.equal(sameFinalizeRace.every((result) => result.resource?.status === 'reviewer_ready' && Number(result.resource?.version) === 3), true);
  assert.equal(Number((await test.query('SELECT count(*) n FROM assess_v2_decision_versions WHERE case_id=$1', [CASE2])).rows[0].n), 1);
  assert.equal(Number((await test.query("SELECT count(*) n FROM assess_command_receipts WHERE idempotency_key='same-finalize' AND status='succeeded'")).rows[0].n), 1);
  assert.equal(Number((await test.query("SELECT count(*) n FROM privileged_audit_events WHERE resource_id=$1 AND action='assessment_v2.finalize'", [CASE2])).rows[0].n), 1);

  const finalized = value(await finalize(CASE, 2, 'finalize-v2', 60, successRequest));
  assert.equal(finalized.resource.status, 'reviewer_ready');
  const finalizedReplay = value(await finalize(CASE, 2, 'finalize-v2', 60, successRequest));
  assert.equal(finalizedReplay.outcome, 'replayed');
  const decision = (await test.query(
    'SELECT input_snapshot,evidence_snapshot,input_canonical,evidence_canonical,output_canonical,input_hash,evidence_hash,output_hash FROM assess_v2_decision_versions WHERE case_id=$1', [CASE],
  )).rows[0];
  assert.deepEqual(decision.input_snapshot, successSource);
  assert.deepEqual(decision.evidence_snapshot, successEvidence);
  for (const domain of ['input', 'evidence', 'output']) {
    assert.equal(digest(decision[`${domain}_canonical`]), decision[`${domain}_hash`]);
  }
  for (const table of ['assess_v2_candidate_evaluations', 'assess_v2_gate_results', 'assess_v2_control_requirements', 'assess_v2_modernization_dispositions']) {
    assert.equal(Number((await test.query(`SELECT count(*) n FROM ${table} WHERE case_id=$1`, [CASE])).rows[0].n), 1);
    assert.equal(Number((await test.query(`SELECT count(*) n FROM ${table} child JOIN assess_v2_decision_versions decision ON decision.id=child.decision_id AND decision.case_id=child.case_id AND decision.workspace_id=child.workspace_id AND decision.org_id=child.org_id WHERE child.case_id=$1`, [CASE])).rows[0].n), 1);
  }
  await assert.rejects(test.query("UPDATE assess_v2_candidate_evaluations SET payload='{}' WHERE case_id=$1", [CASE]), /PR1D_IMMUTABLE/);
  await assert.rejects(test.query("UPDATE assess_v2_case_versions SET name='mutated' WHERE case_id=$1", [CASE]), /PR1D_IMMUTABLE/);

  await test.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [A]);
  await asRole(test, 'authenticated', async () => {
    assert.ok(Number((await test.query('SELECT count(*) n FROM assess_v2_cases')).rows[0].n) > 0);
    assert.equal((await test.query('SELECT id FROM assess_v2_cases WHERE org_id=$1', [OB])).rowCount, 0);
  });
  await test.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [B]);
  await asRole(test, 'authenticated', async () => assert.equal(Number((await test.query('SELECT count(*) n FROM assess_v2_cases')).rows[0].n), 0));

  await test.query('UPDATE assess_v2_runtime_control SET enabled=false');
  assert.equal(value(await callCreate('31000000-0000-4000-8000-000000000090', 'disabled-v2', 70)).errorCode, 'FEATURE_DISABLED');
  await test.query('UPDATE assess_v2_runtime_control SET enabled=true,read_only=true');
  assert.equal(value(await callCreate('31000000-0000-4000-8000-000000000091', 'readonly-v2', 71)).errorCode, 'READ_ONLY');
  await test.query('UPDATE assess_v2_runtime_control SET read_only=false');

  const updatedV1 = await test.query(
    "UPDATE assessments SET status='Changes Requested',version=1 WHERE id=$1 RETURNING id,org_id,workspace_id,status,version,deleted_at", [V1],
  );
  assert.equal(updatedV1.rowCount, 1);
  const resubmitted = value(await asRole(test, 'service_role', () => test.query(
    'SELECT pr1c_govern_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
    [A, O, W, V1, 'submit', 'resubmitted', 1, req(80), 'govern-resubmit', authorizationVersion],
  )));
  assert.equal(resubmitted.resource.status, 'In Review');

  console.log('PR 1D additive PostgreSQL ACL, RLS, clone, canonical digest, atomicity, idempotency, concurrency, compatibility, and immutability tests passed.');
} finally {
  if (test) await test.end().catch(() => {});
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => {});
    for (const role of createdRoles.reverse()) await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => {});
    await admin.end().catch(() => {});
  }
}
