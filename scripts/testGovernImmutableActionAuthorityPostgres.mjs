import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { applySyntheticAiTerminalJournalMigrationForTest } from './syntheticAiTerminalJournalMigrationTestGuard.mjs';

const { Client } = pg;
const adminUrl = process.env.GOVERN_ACTION_AUTHORITY_DATABASE_URL;
if (!adminUrl) throw new Error('GOVERN_ACTION_AUTHORITY_DATABASE_URL_REQUIRED');
const parsed = new URL(adminUrl);
if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
  || !['127.0.0.1', '[::1]'].includes(parsed.hostname.toLowerCase())
  || !['/postgres', '/avalaos_pilot_synthetic'].includes(decodeURIComponent(parsed.pathname))
  || parsed.search || parsed.hash) throw new Error('GOVERN_ACTION_AUTHORITY_DATABASE_URL_REJECTED');

const migrationName = '20261009162752_govern_immutable_action_authority.sql';
const baseName = `govern_action_base_${process.pid}_${Date.now()}`;
const names = Object.fromEntries(['current', 'legacy', 'unsafe', 'misbound', 'drift'].map(label => [label, `${baseName}_${label}`]));
const createdDatabases = [];
const createdRoles = [];
const clients = [];
const cleanupErrors = [];
const duplicateSafeMigrations = new Set([
  '20260923133000_pr1e_evidence_claim_operator_binding.sql',
  '20260923142120_pr1e_govern_control_alias_binding.sql',
  '20260923144653_studio_command_authority_capabilities.sql',
  '20260923151115_studio_handoff_receipt_binding.sql',
  '20260923190853_pr_c_deferred_binding_authority.sql',
]);
const uuid = ordinal => `98000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;
const hash = '0'.repeat(64);

const urlFor = database => {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
};
const connect = async connectionString => {
  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 });
  await client.connect();
  clients.push(client);
  return client;
};
const tx = async (client, label, operation) => {
  await client.query('BEGIN');
  try {
    const result = await operation();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw new Error(`${label}:${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
};
const one = async (client, sql, parameters = []) => (await client.query(sql, parameters)).rows[0];
const scalar = async (client, sql, parameters = []) => Number((await one(client, sql, parameters)).n);
const migrationSql = async name => (await readFile(join('supabase', 'migrations', name), 'utf8')).replaceAll('\r\n', '\n');

const createRoles = async admin => {
  for (const [role, attributes] of [['anon', 'NOLOGIN'], ['authenticated', 'NOLOGIN'], ['service_role', 'NOLOGIN BYPASSRLS']]) {
    if (!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rowCount) {
      await admin.query(`CREATE ROLE ${role} ${attributes}`);
      createdRoles.push(role);
    }
  }
};
const bootstrap = async client => tx(client, 'bootstrap', () => client.query(`
  CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
  GRANT USAGE ON SCHEMA auth TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  GRANT USAGE ON SCHEMA public TO service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
`));
const apply = async (client, name) => {
  const sql = await migrationSql(name);
  const run = () => tx(client, name, () => client.query(sql));
  await applySyntheticAiTerminalJournalMigrationForTest(client, name, run);
  if (duplicateSafeMigrations.has(name)) await run();
};
const clone = async (admin, name) => {
  assert.match(name, /^[a-z0-9_]+$/u);
  await admin.query(`CREATE DATABASE ${name} TEMPLATE ${baseName}`);
  createdDatabases.push(name);
  return connect(urlFor(name));
};
const setReadOnlyAndApply = async client => {
  await client.query('UPDATE public.assess_v2_runtime_control SET read_only=true WHERE singleton');
  try { await tx(client, migrationName, async () => client.query(await migrationSql(migrationName))); }
  finally { await client.query('UPDATE public.assess_v2_runtime_control SET read_only=false WHERE singleton'); }
};
const asRole = async (client, role, operation) => tx(client, `role-${role}`, async () => {
  await client.query(`SET LOCAL ROLE ${role}`);
  return operation();
});

const shared = {
  org: uuid(1), workspace: uuid(2), owner: uuid(3), reviewer: uuid(4), resolver: uuid(5), handoff: uuid(6), role: uuid(7),
};
const seedAuthority = async client => {
  await client.query('INSERT INTO auth.users(id) VALUES($1),($2),($3),($4)', [shared.owner, shared.reviewer, shared.resolver, shared.handoff]);
  await client.query(`INSERT INTO public.profiles(id,email) VALUES
    ($1,'govern-owner@example.invalid'),($2,'govern-reviewer@example.invalid'),
    ($3,'govern-resolver@example.invalid'),($4,'govern-handoff@example.invalid')`, [shared.owner, shared.reviewer, shared.resolver, shared.handoff]);
  await client.query("INSERT INTO public.organizations(id,name,slug) VALUES($1,'Govern action authority','govern-action-authority')", [shared.org]);
  await client.query("INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,'Govern action authority','govern-action-authority')", [shared.workspace, shared.org]);
  await client.query("INSERT INTO public.roles(id,org_id,name,slug,scope,permissions) VALUES($1,$2,'Govern authority','govern-authority','organization','[]')", [shared.role, shared.org]);
  for (const capability of ['assess.v2.govern.resolve', 'assess.v2.studio.handoff', 'assess.v2.review', 'assess.v2.evidence.attest', 'assess.v2.approve']) {
    await client.query('INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,$2)', [shared.role, capability]);
  }
  for (const actor of [shared.owner, shared.reviewer, shared.resolver, shared.handoff]) {
    await client.query("INSERT INTO public.organization_members(org_id,user_id,role_id,status) VALUES($1,$2,$3,'active')", [shared.org, actor, shared.role]);
    await client.query("INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,status) VALUES($1,$2,$3,'active')", [shared.org, shared.workspace, actor]);
  }
};
const authorizationVersion = async (client, actor) => Number((await one(client,
  'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [shared.org, actor])).version);
const fixtureReceipt = async (client, id, actor, key) => client.query(`INSERT INTO public.assess_command_receipts
  (id,org_id,workspace_id,actor_id,command_type,idempotency_key,request_id,request_hash,status,response,completed_at)
  VALUES($1,$2,$3,$4,'fixture',$5,gen_random_uuid(),'fixture-hash','succeeded','{}',now())`,
  [id, shared.org, shared.workspace, actor, key]);

const modernSnapshots = (ordinal, { mode, highImpact, financial, category = 'approval-bound', malformed = null }) => {
  const interactionId = uuid(ordinal + 50);
  const inputInteraction = { id: interactionId, mode, facts: { highImpact, financialAction: financial } };
  const labels = {
    allowedActions: category === 'allowed' ? [`${mode}: action ${ordinal}`] : [],
    approvalBoundActions: category === 'approval-bound' ? [`${mode} with controls: action ${ordinal}`] : [],
    prohibitedActions: category === 'prohibited' ? [`${mode}: action ${ordinal}`] : [],
  };
  const input = { interactions: [inputInteraction] };
  const output = {
    interactionDecisions: [{ interactionId, ...labels }],
    controlRequirements: [{ id: `control.${ordinal}`, required: true }],
    accountableOwner: 'Synthetic accountable owner',
  };
  if (malformed === 'duplicate') input.interactions.push(structuredClone(inputInteraction));
  if (malformed === 'orphan') output.interactionDecisions[0].interactionId = uuid(ordinal + 51);
  return { input, output, controlId: `control.${ordinal}` };
};
const legacySnapshots = ordinal => ({
  input: {},
  output: {
    actionControls: [{ actionId: `legacy.${ordinal}`, category: 'approval-bound' }],
    controls: [`control.${ordinal}`], accountableOwner: 'Synthetic accountable owner',
  },
  controlId: `control.${ordinal}`,
});

const seedApprovedDecision = async (client, ordinal, snapshots, { reviewer = shared.reviewer } = {}) => {
  const process = uuid(ordinal + 1); const caseId = uuid(ordinal + 2); const source = uuid(ordinal + 3);
  const decision = uuid(ordinal + 4); const assignment = uuid(ordinal + 5); const resolution = uuid(ordinal + 6);
  const decisionReceipt = uuid(ordinal + 7); const assignmentReceipt = uuid(ordinal + 8); const resolutionReceipt = uuid(ordinal + 9);
  await client.query("INSERT INTO public.assess_processes(id,org_id,workspace_id,name,status) VALUES($1,$2,$3,$4,'Draft')", [process, shared.org, shared.workspace, `Govern process ${ordinal}`]);
  await client.query("INSERT INTO public.assess_v2_cases(id,org_id,workspace_id,process_id,owner_id,status,version) VALUES($1,$2,$3,$4,$5,'approved',2)", [caseId, shared.org, shared.workspace, process, shared.owner]);
  await client.query("INSERT INTO public.assess_v2_case_versions(id,case_id,org_id,workspace_id,version,name,source_kind,created_by) VALUES($1,$2,$3,$4,2,$5,'create',$6)", [source, caseId, shared.org, shared.workspace, `Govern source ${ordinal}`, shared.owner]);
  await client.query('UPDATE public.assess_v2_cases SET head_version_id=$1 WHERE id=$2', [source, caseId]);
  await fixtureReceipt(client, decisionReceipt, shared.owner, `decision-${ordinal}`);
  await fixtureReceipt(client, assignmentReceipt, shared.owner, `assignment-${ordinal}`);
  await fixtureReceipt(client, resolutionReceipt, reviewer, `resolution-${ordinal}`);
  await client.query(`INSERT INTO public.assess_v2_decision_versions
    (id,case_id,source_version_id,org_id,workspace_id,schema_version,rule_set_version,decision_version,validation_status,
     input_snapshot,evidence_snapshot,output_snapshot,input_hash,evidence_hash,output_hash,receipt_id,created_by,created_at)
    VALUES($1,$2,$3,$4,$5,'schema','rules',$6,'reviewer-ready',$7::jsonb,'[]',$8::jsonb,$9,$9,$9,$10,$11,now())`,
  [decision, caseId, source, shared.org, shared.workspace, `decision-${ordinal}`, JSON.stringify(snapshots.input), JSON.stringify(snapshots.output), hash, decisionReceipt, shared.owner]);
  const reviewerVersion = await authorizationVersion(client, reviewer);
  const ownerVersion = await authorizationVersion(client, shared.owner);
  await client.query(`INSERT INTO public.assess_v2_review_assignments
    (id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,review_schema_version,
     review_sequence,material_claims,reviewer_id,assigned_by,assigned_reviewer_authorization_version,assigned_by_authorization_version,
     request_id,receipt_id,audit_event_id)
    VALUES($1,$2,$3,$4,$5,2,$6,$7,'assess-v2-review-2026-07',1,'[]',$8,$9,$10,$11,gen_random_uuid(),$12,gen_random_uuid())`,
  [assignment, shared.org, shared.workspace, caseId, source, decision, `decision-${ordinal}`, reviewer, shared.owner, reviewerVersion, ownerVersion, assignmentReceipt]);
  await client.query(`INSERT INTO public.assess_v2_review_resolutions
    (id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,review_id,
     review_schema_version,review_sequence,resolution,reviewed_confidence,conditions,rationale,reviewer_id,
     reviewer_authorization_version,request_id,receipt_id,audit_event_id)
    VALUES($1,$2,$3,$4,$5,2,$6,$7,$8,'assess-v2-review-2026-07',1,'approved','Verified','[]','Approved',$9,$10,gen_random_uuid(),$11,gen_random_uuid())`,
  [resolution, shared.org, shared.workspace, caseId, source, decision, `decision-${ordinal}`, assignment, reviewer, reviewerVersion, resolutionReceipt]);
  return { caseId, source, decision, assignment, resolution, reviewer, snapshots };
};

const governCall = async (client, fixture, actor, ordinal) => {
  const actorAuthorizationVersion = await authorizationVersion(client, actor);
  const value = (await asRole(client, 'service_role', () => client.query(`SELECT public.pr1e_resolve_assess_v2_govern(
    $1,$2,$3,$4,$5,2,$6,$7,$8,$9::jsonb) value`, [
    actor, shared.org, shared.workspace, fixture.caseId, fixture.decision, uuid(ordinal), `govern-${ordinal}`,
    actorAuthorizationVersion, JSON.stringify({ reviewSequence: 1, controlDispositions: [{ controlId: fixture.snapshots.controlId, status: 'resolved' }], rationale: 'Govern action authority verified' }),
  ]))).rows[0].value;
  return value;
};
const counts = async (client, fixture) => ({
  caseVersion: Number((await one(client, 'SELECT version FROM public.assess_v2_cases WHERE id=$1', [fixture.caseId])).version),
  govern: await scalar(client, 'SELECT count(*) n FROM public.assess_v2_govern_resolutions WHERE case_id=$1', [fixture.caseId]),
  receipts: await scalar(client, "SELECT count(*) n FROM public.assess_command_receipts WHERE command_type='assessment_v2.govern.resolve' AND response->>'caseId'=$1", [fixture.caseId]),
  audits: await scalar(client, "SELECT count(*) n FROM public.privileged_audit_events WHERE action='assessment_v2.govern.resolve' AND resource_id=$1", [fixture.caseId]),
});
const insertHistoricalGovern = async (client, fixture, actor, actions) => {
  const receipt = uuid(Number(fixture.caseId.slice(-6)) + 1000);
  await fixtureReceipt(client, receipt, actor, `historical-govern-${fixture.caseId}`);
  await client.query(`INSERT INTO public.assess_v2_govern_resolutions
    (org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,review_resolution_id,
     review_schema_version,review_sequence,actions,required_controls,review_frequency,accountable_owner,rationale,resolver_id,
     resolver_authorization_version,request_id,receipt_id,audit_event_id)
    VALUES($1,$2,$3,$4,2,$5,$6,$7,'assess-v2-review-2026-07',1,$8::jsonb,$9::jsonb,'annual','owner','historical',$10,$11,gen_random_uuid(),$12,gen_random_uuid())`,
  [shared.org, shared.workspace, fixture.caseId, fixture.source, fixture.decision, `decision-${Number(fixture.decision.slice(-12)) - 4}`, fixture.resolution,
    JSON.stringify(actions), JSON.stringify([{ controlId: fixture.snapshots.controlId, status: 'resolved' }]), actor, await authorizationVersion(client, actor), receipt]);
};

let admin;
let phase = 'initialize';
let failure = null;
try {
  phase = 'predecessor-chain';
  admin = await connect(adminUrl);
  await createRoles(admin);
  assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [baseName])).rowCount, 0);
  await admin.query(`CREATE DATABASE ${baseName}`); createdDatabases.push(baseName);
  const base = await connect(urlFor(baseName));
  await bootstrap(base);
  const migrations = (await readdir(join('supabase', 'migrations'))).filter(name => name.endsWith('.sql')).sort();
  assert.equal(migrations.at(-1), migrationName);
  for (const name of migrations.slice(0, -1)) await apply(base, name);
  await base.end(); clients.splice(clients.indexOf(base), 1);

  const current = await clone(admin, names.current);
  await seedAuthority(current);
  const beforeGuard = await one(current, "SELECT migration_tip,to_regprocedure('public.pr1e_normalize_govern_actions(jsonb,jsonb)') helper FROM public.hosted_pilot_environment_identity WHERE singleton");
  await assert.rejects(tx(current, 'maintenance-negative', async () => current.query(await migrationSql(migrationName))), /PR1E_GOVERN_ACTION_MAINTENANCE_REQUIRED/u);
  assert.deepEqual(await one(current, "SELECT migration_tip,to_regprocedure('public.pr1e_normalize_govern_actions(jsonb,jsonb)') helper FROM public.hosted_pilot_environment_identity WHERE singleton"), beforeGuard);
  await setReadOnlyAndApply(current);
  assert.equal((await one(current, 'SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton')).migration_tip, '20261009162752');
  assert.equal((await one(current, 'SELECT read_only FROM public.assess_v2_runtime_control WHERE singleton')).read_only, false);

  for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
    if (role === 'PUBLIC') continue;
    assert.equal((await one(current, `SELECT has_function_privilege($1,'public.pr1e_normalize_govern_actions(jsonb,jsonb)','EXECUTE') allowed`, [role])).allowed, false);
  }
  await assert.rejects(asRole(current, 'authenticated', () => current.query("SELECT public.pr1e_normalize_govern_actions('{}','{}')")), /permission denied/u);
  await assert.rejects(asRole(current, 'service_role', () => current.query("SELECT public.pr1e_normalize_govern_actions('{}','{}')")), /permission denied/u);

  const validHelperSnapshots = modernSnapshots(50, { mode: 'write', highImpact: false, financial: false, category: 'allowed' });
  const malformedHelperSnapshots = [
    ['missing-mode', snapshots => { delete snapshots.input.interactions[0].mode; }],
    ['missing-facts', snapshots => { delete snapshots.input.interactions[0].facts; }],
    ['missing-action-array', snapshots => { delete snapshots.output.interactionDecisions[0].prohibitedActions; }],
    ['json-null-action-array', snapshots => { snapshots.output.interactionDecisions[0].allowedActions = null; }],
    ['scalar-action-array', snapshots => { snapshots.output.interactionDecisions[0].allowedActions = 'write: scalar'; }],
    ['all-empty-action-arrays', snapshots => { snapshots.output.interactionDecisions[0].allowedActions = []; }],
  ];
  for (const [, mutate] of malformedHelperSnapshots) {
    const snapshots = structuredClone(validHelperSnapshots);
    mutate(snapshots);
    await assert.rejects(current.query(
      'SELECT public.pr1e_normalize_govern_actions($1::jsonb,$2::jsonb)',
      [JSON.stringify(snapshots.input), JSON.stringify(snapshots.output)],
    ), /PR1E_GOVERN_ACTION_AUTHORITY_INVALID/u);
  }
  for (const [category, highImpact, expected] of [
    ['allowed', true, true],
    ['prohibited', true, true],
    ['allowed', false, false],
  ]) {
    const snapshots = modernSnapshots(60 + (category === 'prohibited' ? 1 : 0) + (highImpact ? 0 : 2), {
      mode: 'write', highImpact, financial: false, category,
    });
    const helperResult = await one(current, `SELECT
      public.pr1e_normalize_govern_actions($1::jsonb,$2::jsonb) actions,
      public.pr1e_govern_requires_independent_resolver($1::jsonb,$2::jsonb) requires_independent`,
    [JSON.stringify(snapshots.input), JSON.stringify(snapshots.output)]);
    assert.equal(helperResult.requires_independent, expected);
    assert.equal(helperResult.actions[0].category, category);
    assert.equal(helperResult.actions[0].highImpact, highImpact);
  }

  const financial = await seedApprovedDecision(current, 100, modernSnapshots(100, { mode: 'write', highImpact: false, financial: true }));
  const financialBefore = await counts(current, financial);
  assert.deepEqual(await governCall(current, financial, shared.reviewer, 1000), { errorCode: 'INVALID_COMMAND' });
  assert.deepEqual(await counts(current, financial), financialBefore);
  const financialCommit = await governCall(current, financial, shared.resolver, 1001);
  assert.equal(financialCommit.outcome, 'committed');
  assert.deepEqual(await counts(current, financial), { caseVersion: 3, govern: 1, receipts: 1, audits: 1 });
  const expectedFinancialActions = (await one(current, 'SELECT public.pr1e_normalize_govern_actions(input_snapshot,output_snapshot) actions FROM public.assess_v2_decision_versions WHERE id=$1', [financial.decision])).actions;
  const storedFinancial = (await one(current, 'SELECT actions FROM public.assess_v2_govern_resolutions WHERE decision_id=$1', [financial.decision])).actions;
  const projectedFinancial = (await one(current, 'SELECT public.pr1e_review_projection($1,$2,$3,$4) projection', [shared.org, shared.workspace, financial.caseId, financial.decision])).projection.actions;
  assert.deepEqual(storedFinancial, expectedFinancialActions);
  assert.deepEqual(projectedFinancial, expectedFinancialActions);
  assert.equal(expectedFinancialActions.every(action => action.financial && !action.highImpact && !action.externalCommunication && !action.irreversible), true);

  const handoffAuthorizationVersion = await authorizationVersion(current, shared.handoff);
  const handoff = (await asRole(current, 'service_role', () => current.query(`SELECT public.pr1e_handoff_assess_v2_studio(
    $1,$2,$3,$4,$5,3,$6,$7,$8,$9::jsonb) value`, [shared.handoff, shared.org, shared.workspace, financial.caseId,
    financial.decision, uuid(1100), 'handoff-financial-1100', handoffAuthorizationVersion, JSON.stringify({ reviewSequence: 1 })]))).rows[0].value;
  assert.equal(handoff.outcome, 'committed');
  const handoffActions = (await one(current, "SELECT package#>'{govern,actions}' actions FROM public.assess_v2_studio_handoffs WHERE decision_id=$1", [financial.decision])).actions;
  assert.deepEqual(handoffActions, expectedFinancialActions);

  const highImpact = await seedApprovedDecision(current, 200, modernSnapshots(200, { mode: 'write', highImpact: true, financial: false }));
  const highBefore = await counts(current, highImpact);
  assert.deepEqual(await governCall(current, highImpact, shared.reviewer, 1200), { errorCode: 'INVALID_COMMAND' });
  assert.deepEqual(await counts(current, highImpact), highBefore);
  assert.equal((await governCall(current, highImpact, shared.resolver, 1201)).outcome, 'committed');

  const lowRead = await seedApprovedDecision(current, 300, modernSnapshots(300, { mode: 'read', highImpact: true, financial: true }));
  assert.equal((await governCall(current, lowRead, shared.reviewer, 1300)).outcome, 'committed');
  const lowActions = (await one(current, 'SELECT actions FROM public.assess_v2_govern_resolutions WHERE decision_id=$1', [lowRead.decision])).actions;
  assert.equal(lowActions.every(action => !action.highImpact && !action.financial), true);

  const legacyCurrent = await seedApprovedDecision(current, 400, legacySnapshots(400));
  const legacyBefore = await counts(current, legacyCurrent);
  assert.deepEqual(await governCall(current, legacyCurrent, shared.reviewer, 1400), { errorCode: 'INVALID_COMMAND' });
  assert.deepEqual(await counts(current, legacyCurrent), legacyBefore);
  assert.equal((await governCall(current, legacyCurrent, shared.resolver, 1401)).outcome, 'committed');

  for (const [label, malformed] of [['duplicate', 'duplicate'], ['orphan', 'orphan']]) {
    const bad = await seedApprovedDecision(current, label === 'duplicate' ? 500 : 600,
      modernSnapshots(label === 'duplicate' ? 500 : 600, { mode: 'write', highImpact: true, financial: false, malformed }));
    const before = await counts(current, bad);
    assert.deepEqual(await governCall(current, bad, shared.resolver, label === 'duplicate' ? 1500 : 1600), { errorCode: 'INVALID_COMMAND' });
    assert.deepEqual(await counts(current, bad), before);
  }

  for (const functionName of [
    'synthetic_ai_campaign_activate_final_continuation(uuid,uuid,uuid,bigint,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,integer)',
    'synthetic_ai_campaign_bootstrap(uuid,uuid,uuid,bigint,text,text,text,text,uuid,uuid,uuid,uuid,timestamptz)',
    'pr_c_controlled_human_assert_marker()',
    'synthetic_ai_campaign_activate_brd_v3_quality_validation(uuid,uuid,uuid,bigint,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,uuid,uuid,uuid,uuid,text,text,integer)',
  ]) assert.match((await one(current, 'SELECT pg_get_functiondef($1::regprocedure) definition', [functionName])).definition, /20261009162752/u);
  const exactBeforeReapply = await one(current, `SELECT migration_tip,
    md5(pg_get_functiondef('public.pr1e_review_command(text,uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,bigint,jsonb)'::regprocedure)) command_hash,
    md5(pg_get_functiondef('public.pr1e_normalize_govern_actions(jsonb,jsonb)'::regprocedure)) helper_hash
    FROM public.hosted_pilot_environment_identity WHERE singleton`);
  await current.query('UPDATE public.assess_v2_runtime_control SET read_only=true WHERE singleton');
  await assert.rejects(tx(current, 'reapply-negative', async () => current.query(await migrationSql(migrationName))), /PR1E_GOVERN_ACTION_AUTHORITY_SOURCE_MISMATCH/u);
  await current.query('UPDATE public.assess_v2_runtime_control SET read_only=false WHERE singleton');
  assert.deepEqual(await one(current, `SELECT migration_tip,
    md5(pg_get_functiondef('public.pr1e_review_command(text,uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,bigint,jsonb)'::regprocedure)) command_hash,
    md5(pg_get_functiondef('public.pr1e_normalize_govern_actions(jsonb,jsonb)'::regprocedure)) helper_hash
    FROM public.hosted_pilot_environment_identity WHERE singleton`), exactBeforeReapply);

  const legacy = await clone(admin, names.legacy); await seedAuthority(legacy);
  const legacyHistory = await seedApprovedDecision(legacy, 700, legacySnapshots(700));
  await insertHistoricalGovern(legacy, legacyHistory, shared.resolver, legacyHistory.snapshots.output.actionControls);
  await legacy.query("UPDATE public.assess_v2_cases SET status='govern_resolved',version=3 WHERE id=$1", [legacyHistory.caseId]);
  await setReadOnlyAndApply(legacy);
  assert.equal((await one(legacy, 'SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton')).migration_tip, '20261009162752');
  assert.equal((await one(legacy, 'SELECT public.pr1e_govern_actions_match(d.input_snapshot,d.output_snapshot,g.actions) matched FROM public.assess_v2_decision_versions d JOIN public.assess_v2_govern_resolutions g ON g.decision_id=d.id WHERE d.id=$1', [legacyHistory.decision])).matched, true);

  const unsafe = await clone(admin, names.unsafe); await seedAuthority(unsafe);
  const unsafeHistory = await seedApprovedDecision(unsafe, 800, modernSnapshots(800, { mode: 'write', highImpact: true, financial: true }));
  const unsafeActions = [{ id: `${uuid(850)}:approval-bound:1`, actionId: `${uuid(850)}:approval-bound:1`, label: 'write with controls: action 800', category: 'approval-bound', highImpact: true, financial: true, externalCommunication: false, irreversible: false }];
  await insertHistoricalGovern(unsafe, unsafeHistory, shared.reviewer, unsafeActions);
  await unsafe.query('UPDATE public.assess_v2_runtime_control SET read_only=true WHERE singleton');
  await assert.rejects(tx(unsafe, 'unsafe-history', async () => unsafe.query(await migrationSql(migrationName))), /PR1E_GOVERN_ACTION_HISTORY_REQUIRES_REVIEW/u);
  assert.equal((await one(unsafe, 'SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton')).migration_tip, '20261008022445');
  assert.equal((await one(unsafe, "SELECT to_regprocedure('public.pr1e_normalize_govern_actions(jsonb,jsonb)') helper")).helper, null);

  const misbound = await clone(admin, names.misbound); await seedAuthority(misbound);
  const misboundHistory = await seedApprovedDecision(misbound, 900, modernSnapshots(900, { mode: 'write', highImpact: false, financial: true }));
  await insertHistoricalGovern(misbound, misboundHistory, shared.resolver, []);
  await misbound.query('UPDATE public.assess_v2_runtime_control SET read_only=true WHERE singleton');
  await assert.rejects(tx(misbound, 'misbound-history', async () => misbound.query(await migrationSql(migrationName))), /PR1E_GOVERN_ACTION_HISTORY_REQUIRES_REVIEW/u);
  assert.equal((await one(misbound, 'SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton')).migration_tip, '20261008022445');

  const drift = await clone(admin, names.drift);
  const definition = (await one(drift, "SELECT pg_get_functiondef('public.pr1e_review_command(text,uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,bigint,jsonb)'::regprocedure) definition")).definition;
  const drifted = definition.replace("COALESCE(d.output_snapshot->'actionControls','[]'),p_payload->'controlDispositions'", "COALESCE(d.output_snapshot->'actionControls','[]'::jsonb),p_payload->'controlDispositions'");
  assert.notEqual(drifted, definition);
  await drift.query(drifted);
  await drift.query('UPDATE public.assess_v2_runtime_control SET read_only=true WHERE singleton');
  await assert.rejects(tx(drift, 'source-drift', async () => drift.query(await migrationSql(migrationName))), /PR1E_GOVERN_ACTION_AUTHORITY_SOURCE_MISMATCH/u);
  assert.equal((await one(drift, 'SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton')).migration_tip, '20261008022445');

  console.log('Govern immutable action-authority PostgreSQL checks passed.');
} catch (error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/u.test(error.code) ? error.code : 'CHECK_FAILED';
  failure = new Error(`GOVERN_ACTION_AUTHORITY_POSTGRES_FAILED:${phase}:${code}`);
} finally {
  for (const client of [...clients].reverse()) {
    if (client === admin) continue;
    try { await client.end(); } catch (error) { cleanupErrors.push(error); }
  }
  if (admin) {
    for (const name of [...createdDatabases].reverse()) {
      try { await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); }
      catch (error) { cleanupErrors.push(error); }
    }
    for (const role of [...createdRoles].reverse()) {
      try { await admin.query(`DROP ROLE IF EXISTS ${role}`); }
      catch (error) { cleanupErrors.push(error); }
    }
    try { await admin.end(); } catch (error) { cleanupErrors.push(error); }
  }
  assert.equal(cleanupErrors.length, 0, 'Govern action-authority cleanup must succeed');
}
if (failure) throw failure;
