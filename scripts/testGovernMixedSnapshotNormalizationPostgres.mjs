import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { applySyntheticAiTerminalJournalMigrationForTest } from './syntheticAiTerminalJournalMigrationTestGuard.mjs';

const { Client } = pg;
const adminUrl = process.env.GOVERN_MIXED_SNAPSHOT_DATABASE_URL;
if (!adminUrl) throw new Error('GOVERN_MIXED_SNAPSHOT_DATABASE_URL_REQUIRED');
const parsed = new URL(adminUrl);
if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
  || !['127.0.0.1', '[::1]'].includes(parsed.hostname.toLowerCase())
  || decodeURIComponent(parsed.pathname) !== '/postgres' || parsed.search || parsed.hash) {
  throw new Error('GOVERN_MIXED_SNAPSHOT_DATABASE_URL_REJECTED');
}

const migrationName = '20261105110657_govern_mixed_snapshot_normalization.sql';
const databaseName = `govern_mixed_snapshot_${process.pid}_${Date.now()}`;
const createdRoles = [];
const clients = [];
const duplicateSafeMigrations = new Set([
  '20260923133000_pr1e_evidence_claim_operator_binding.sql',
  '20260923142120_pr1e_govern_control_alias_binding.sql',
  '20260923144653_studio_command_authority_capabilities.sql',
  '20260923151115_studio_handoff_receipt_binding.sql',
  '20260923190853_pr_c_deferred_binding_authority.sql',
]);
const uuid = ordinal => `97000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;
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
const migrationSql = async name => (await readFile(join('supabase', 'migrations', name), 'utf8')).replaceAll('\r\n', '\n');
const apply = async (client, name) => {
  const sql = await migrationSql(name);
  const run = () => tx(client, name, () => client.query(sql));
  await applySyntheticAiTerminalJournalMigrationForTest(client, name, run);
  if (duplicateSafeMigrations.has(name)) await run();
};
const asRole = async (client, role, operation) => tx(client, `role-${role}`, async () => {
  await client.query(`SET LOCAL ROLE ${role}`);
  return operation();
});

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

const shared = {
  org: uuid(1), workspace: uuid(2), owner: uuid(3), reviewer: uuid(4), resolver: uuid(5), handoff: uuid(6), role: uuid(7),
};
const seedAuthority = async client => {
  await client.query('INSERT INTO auth.users(id) VALUES($1),($2),($3),($4)',
    [shared.owner, shared.reviewer, shared.resolver, shared.handoff]);
  await client.query(`INSERT INTO public.profiles(id,email) VALUES
    ($1,'mixed-owner@example.invalid'),($2,'mixed-reviewer@example.invalid'),
    ($3,'mixed-resolver@example.invalid'),($4,'mixed-handoff@example.invalid')`,
  [shared.owner, shared.reviewer, shared.resolver, shared.handoff]);
  await client.query("INSERT INTO public.organizations(id,name,slug) VALUES($1,'Mixed Govern snapshots','mixed-govern-snapshots')", [shared.org]);
  await client.query("INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,'Mixed Govern snapshots','mixed-govern-snapshots')", [shared.workspace, shared.org]);
  await client.query("INSERT INTO public.roles(id,org_id,name,slug,scope,permissions) VALUES($1,$2,'Mixed Govern authority','mixed-govern-authority','organization','[]')", [shared.role, shared.org]);
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

const readiness = (mode, value) => Object.fromEntries(
  ['read', 'write', 'event', 'ui', 'operational'].map(candidate => [candidate, candidate === mode ? value : 'Not Applicable']),
);
const unknownDecision = (interactionId, mode = 'operational') => ({
  interactionId, readiness: readiness(mode, 'Unknown'),
  allowedActions: [], approvalBoundActions: [], prohibitedActions: [],
  requiredControls: ['Audit correlation'], evidenceGaps: ['accountableOwner is unknown'], ruleIds: ['INT-014'],
});
const mixedSnapshots = ordinal => {
  const unknownId = uuid(ordinal + 50);
  const readyId = uuid(ordinal + 51);
  return {
    input: { interactions: [
      { id: unknownId, mode: 'operational', facts: { highImpact: false, financialAction: false } },
      { id: readyId, mode: 'read', facts: { highImpact: false, financialAction: false } },
    ] },
    output: {
      interactionDecisions: [
        unknownDecision(unknownId),
        { interactionId: readyId, readiness: readiness('read', 'Ready'), allowedActions: ['read: invoice status'],
          approvalBoundActions: [], prohibitedActions: [], requiredControls: ['Audit correlation'], evidenceGaps: [], ruleIds: ['INT-014'] },
      ],
      controlRequirements: [{ id: `control.${ordinal}`, required: true }],
      accountableOwner: 'Synthetic accountable owner',
    },
    controlId: `control.${ordinal}`,
  };
};
const unknownSnapshots = ordinal => {
  const interactionId = uuid(ordinal + 50);
  return {
    input: { interactions: [{ id: interactionId, mode: 'operational', facts: { highImpact: false, financialAction: false } }] },
    output: { interactionDecisions: [unknownDecision(interactionId)],
      controlRequirements: [{ id: `control.${ordinal}`, required: true }], accountableOwner: 'Synthetic accountable owner' },
    controlId: `control.${ordinal}`,
  };
};

const seedApprovedDecision = async (client, ordinal, snapshots) => {
  const process = uuid(ordinal + 1); const caseId = uuid(ordinal + 2); const source = uuid(ordinal + 3);
  const decision = uuid(ordinal + 4); const assignment = uuid(ordinal + 5); const resolution = uuid(ordinal + 6);
  const decisionReceipt = uuid(ordinal + 7); const assignmentReceipt = uuid(ordinal + 8); const resolutionReceipt = uuid(ordinal + 9);
  await client.query("INSERT INTO public.assess_processes(id,org_id,workspace_id,name,status) VALUES($1,$2,$3,$4,'Draft')",
    [process, shared.org, shared.workspace, `Mixed Govern process ${ordinal}`]);
  await client.query("INSERT INTO public.assess_v2_cases(id,org_id,workspace_id,process_id,owner_id,status,version) VALUES($1,$2,$3,$4,$5,'approved',2)",
    [caseId, shared.org, shared.workspace, process, shared.owner]);
  await client.query("INSERT INTO public.assess_v2_case_versions(id,case_id,org_id,workspace_id,version,name,source_kind,created_by) VALUES($1,$2,$3,$4,2,$5,'create',$6)",
    [source, caseId, shared.org, shared.workspace, `Mixed Govern source ${ordinal}`, shared.owner]);
  await client.query('UPDATE public.assess_v2_cases SET head_version_id=$1 WHERE id=$2', [source, caseId]);
  await fixtureReceipt(client, decisionReceipt, shared.owner, `decision-${ordinal}`);
  await fixtureReceipt(client, assignmentReceipt, shared.owner, `assignment-${ordinal}`);
  await fixtureReceipt(client, resolutionReceipt, shared.reviewer, `resolution-${ordinal}`);
  await client.query(`INSERT INTO public.assess_v2_decision_versions
    (id,case_id,source_version_id,org_id,workspace_id,schema_version,rule_set_version,decision_version,validation_status,
     input_snapshot,evidence_snapshot,output_snapshot,input_hash,evidence_hash,output_hash,receipt_id,created_by,created_at)
    VALUES($1,$2,$3,$4,$5,'schema','rules',$6,'reviewer-ready',$7::jsonb,'[]',$8::jsonb,$9,$9,$9,$10,$11,now())`,
  [decision, caseId, source, shared.org, shared.workspace, `decision-${ordinal}`, JSON.stringify(snapshots.input),
    JSON.stringify(snapshots.output), hash, decisionReceipt, shared.owner]);
  const reviewerVersion = await authorizationVersion(client, shared.reviewer);
  const ownerVersion = await authorizationVersion(client, shared.owner);
  await client.query(`INSERT INTO public.assess_v2_review_assignments
    (id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,review_schema_version,
     review_sequence,material_claims,reviewer_id,assigned_by,assigned_reviewer_authorization_version,assigned_by_authorization_version,
     request_id,receipt_id,audit_event_id)
    VALUES($1,$2,$3,$4,$5,2,$6,$7,'assess-v2-review-2026-07',1,'[]',$8,$9,$10,$11,gen_random_uuid(),$12,gen_random_uuid())`,
  [assignment, shared.org, shared.workspace, caseId, source, decision, `decision-${ordinal}`, shared.reviewer, shared.owner,
    reviewerVersion, ownerVersion, assignmentReceipt]);
  await client.query(`INSERT INTO public.assess_v2_review_resolutions
    (id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,review_id,
     review_schema_version,review_sequence,resolution,reviewed_confidence,conditions,rationale,reviewer_id,
     reviewer_authorization_version,request_id,receipt_id,audit_event_id)
    VALUES($1,$2,$3,$4,$5,2,$6,$7,$8,'assess-v2-review-2026-07',1,'approved','Verified','[]','Approved',$9,$10,gen_random_uuid(),$11,gen_random_uuid())`,
  [resolution, shared.org, shared.workspace, caseId, source, decision, `decision-${ordinal}`, assignment,
    shared.reviewer, reviewerVersion, resolutionReceipt]);
  return { caseId, source, decision, resolution, snapshots };
};

const insertHistoricalEmptyHandoff = async (client, fixture, ordinal) => {
  const governReceipt = uuid(ordinal + 20); const handoffReceipt = uuid(ordinal + 21);
  const governId = uuid(ordinal + 22); const handoffId = uuid(ordinal + 23);
  await fixtureReceipt(client, governReceipt, shared.resolver, `historical-govern-${ordinal}`);
  await fixtureReceipt(client, handoffReceipt, shared.handoff, `historical-handoff-${ordinal}`);
  await client.query(`INSERT INTO public.assess_v2_govern_resolutions
    (id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,review_resolution_id,
     review_schema_version,review_sequence,actions,required_controls,review_frequency,accountable_owner,rationale,resolver_id,
     resolver_authorization_version,request_id,receipt_id,audit_event_id)
    VALUES($1,$2,$3,$4,$5,2,$6,$7,$8,'assess-v2-review-2026-07',1,'[]',$9::jsonb,'on material change','owner','historical',
      $10,$11,gen_random_uuid(),$12,gen_random_uuid())`,
  [governId, shared.org, shared.workspace, fixture.caseId, fixture.source, fixture.decision,
    `decision-${ordinal}`, fixture.resolution, JSON.stringify([{ controlId: fixture.snapshots.controlId, status: 'resolved' }]),
    shared.resolver, await authorizationVersion(client, shared.resolver), governReceipt]);
  const packageValue = { govern: { actions: [] }, lineage: { decisionId: fixture.decision } };
  await client.query(`INSERT INTO public.assess_v2_studio_handoffs
    (id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,review_resolution_id,govern_resolution_id,
     package,package_hash,schema_version,rule_set_version,decision_version,review_schema_version,review_sequence,
     handed_off_by,handoff_authorization_version,request_id,receipt_id,audit_event_id)
    VALUES($1,$2,$3,$4,$5,2,$6,$7,$8,$9::jsonb,$10,'schema','rules',$11,'assess-v2-review-2026-07',1,
      $12,$13,gen_random_uuid(),$14,gen_random_uuid())`,
  [handoffId, shared.org, shared.workspace, fixture.caseId, fixture.source, fixture.decision, fixture.resolution, governId,
    JSON.stringify(packageValue), hash, `decision-${ordinal}`, shared.handoff, await authorizationVersion(client, shared.handoff), handoffReceipt]);
  await client.query("UPDATE public.assess_v2_cases SET status='handed_off',version=4 WHERE id=$1", [fixture.caseId]);
  return { governId, handoffId };
};

const governCall = async (client, fixture, ordinal) => {
  const actorAuthorizationVersion = await authorizationVersion(client, shared.reviewer);
  const value = (await asRole(client, 'service_role', () => client.query(`SELECT public.pr1e_resolve_assess_v2_govern(
    $1,$2,$3,$4,$5,2,$6,$7,$8,$9::jsonb) value`, [
    shared.reviewer, shared.org, shared.workspace, fixture.caseId, fixture.decision, uuid(ordinal), `govern-${ordinal}`,
    actorAuthorizationVersion, JSON.stringify({ reviewSequence: 1,
      controlDispositions: [{ controlId: fixture.snapshots.controlId, status: 'resolved' }], rationale: 'Mixed snapshot verified' }),
  ]))).rows[0].value;
  return value;
};

let admin;
let database;
let failure;
try {
  admin = await connect(adminUrl);
  for (const [role, attributes] of [['anon', 'NOLOGIN'], ['authenticated', 'NOLOGIN'], ['service_role', 'NOLOGIN BYPASSRLS']]) {
    if (!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rowCount) {
      await admin.query(`CREATE ROLE ${role} ${attributes}`); createdRoles.push(role);
    }
  }
  await admin.query(`CREATE DATABASE ${databaseName}`);
  database = await connect(urlFor(databaseName));
  await bootstrap(database);
  const migrations = (await readdir(join('supabase', 'migrations'))).filter(name => name.endsWith('.sql')).sort();
  const featureIndex = migrations.indexOf(migrationName);
  assert.ok(featureIndex > 0);
  assert.equal(migrations[featureIndex - 1], '20261105041249_process_evidence_post_use_renewal.sql');
  for (const name of migrations.slice(0, featureIndex)) await apply(database, name);
  await seedAuthority(database);

  const historical = await seedApprovedDecision(database, 100, unknownSnapshots(100));
  const historyIds = await insertHistoricalEmptyHandoff(database, historical, 100);
  const historyBefore = await one(database, `SELECT
    (SELECT count(*)::int FROM public.assess_v2_review_resolutions WHERE decision_id=$1) reviews,
    (SELECT count(*)::int FROM public.assess_v2_govern_resolutions WHERE decision_id=$1) resolutions,
    (SELECT count(*)::int FROM public.assess_v2_studio_handoffs WHERE decision_id=$1) handoffs`, [historical.decision]);
  const functionBefore = await one(database, `SELECT r.rolname owner,p.proacl,p.proconfig,p.prosecdef
    FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
    WHERE p.oid='public.pr1e_normalize_govern_actions(jsonb,jsonb)'::regprocedure`);

  await assert.rejects(tx(database, 'maintenance-negative', async () => database.query(await migrationSql(migrationName))),
    /PR1E_GOVERN_MIXED_SNAPSHOT_MAINTENANCE_REQUIRED/u);
  assert.equal((await one(database, 'SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton')).migration_tip,
    '20261105041249');

  const injectedHistory = unknownSnapshots(250);
  injectedHistory.output.interactionDecisions[0].allowedActions = ['operational: injected authority'];
  await assert.rejects(tx(database, 'injected-history-negative', async () => {
    const invalid = await seedApprovedDecision(database, 250, injectedHistory);
    await insertHistoricalEmptyHandoff(database, invalid, 250);
    await database.query('UPDATE public.assess_v2_runtime_control SET read_only=true WHERE singleton');
    await database.query(await migrationSql(migrationName));
  }), /PR1E_GOVERN_MIXED_SNAPSHOT_HISTORY_REQUIRES_REVIEW/u);
  assert.equal((await one(database, 'SELECT count(*)::int count FROM public.assess_v2_cases WHERE id=$1', [uuid(252)])).count, 0,
    'rejected history preflight must roll back its synthetic fixture and every migration change');

  await database.query('UPDATE public.assess_v2_runtime_control SET read_only=true WHERE singleton');
  await tx(database, migrationName, async () => database.query(await migrationSql(migrationName)));
  await database.query('UPDATE public.assess_v2_runtime_control SET read_only=false WHERE singleton');

  assert.equal((await one(database, 'SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton')).migration_tip,
    '20261105110657');
  assert.deepEqual(await one(database, `SELECT r.rolname owner,p.proacl,p.proconfig,p.prosecdef
    FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
    WHERE p.oid='public.pr1e_normalize_govern_actions(jsonb,jsonb)'::regprocedure`), functionBefore);
  assert.deepEqual(await one(database, `SELECT
    (SELECT count(*)::int FROM public.assess_v2_review_resolutions WHERE decision_id=$1) reviews,
    (SELECT count(*)::int FROM public.assess_v2_govern_resolutions WHERE decision_id=$1) resolutions,
    (SELECT count(*)::int FROM public.assess_v2_studio_handoffs WHERE decision_id=$1) handoffs`, [historical.decision]), historyBefore);
  assert.equal((await one(database, `SELECT public.pr1e_govern_actions_match(d.input_snapshot,d.output_snapshot,g.actions) matched
    FROM public.assess_v2_decision_versions d JOIN public.assess_v2_govern_resolutions g ON g.decision_id=d.id
    WHERE g.id=$1`, [historyIds.governId])).matched, true);
  assert.deepEqual((await one(database, 'SELECT public.pr1e_review_projection($1,$2,$3,$4) projection',
    [shared.org, shared.workspace, historical.caseId, historical.decision])).projection.actions, []);

  const unknown = unknownSnapshots(200);
  assert.deepEqual((await one(database, 'SELECT public.pr1e_normalize_govern_actions($1::jsonb,$2::jsonb) actions',
    [JSON.stringify(unknown.input), JSON.stringify(unknown.output)])).actions, []);
  const safelyProhibitedUnknown = structuredClone(unknown);
  safelyProhibitedUnknown.output.interactionDecisions[0].prohibitedActions = ['operational: blocked pending evidence'];
  const safelyProhibitedActions = (await one(database,
    'SELECT public.pr1e_normalize_govern_actions($1::jsonb,$2::jsonb) actions',
    [JSON.stringify(safelyProhibitedUnknown.input), JSON.stringify(safelyProhibitedUnknown.output)])).actions;
  assert.equal(safelyProhibitedActions.length, 1);
  assert.equal(safelyProhibitedActions[0].category, 'prohibited');
  for (const mutate of [
    value => { value.output.interactionDecisions[0].allowedActions = ['operational: injected']; },
    value => { value.output.interactionDecisions[0].approvalBoundActions = ['operational with controls: injected']; },
    value => { value.output.interactionDecisions[0].readiness.read = 'Ready'; },
    value => { delete value.output.interactionDecisions[0].requiredControls; },
    value => { value.output.interactionDecisions[0].readiness.operational = 'Ready'; },
    value => { delete value.input.interactions[0].mode; },
    value => { delete value.output.interactionDecisions[0].prohibitedActions; },
    value => { value.input.interactions.push(structuredClone(value.input.interactions[0])); },
    value => { value.output.interactionDecisions[0].interactionId = uuid(999); },
    value => { value.output.interactionDecisions[0].prohibitedActions = 'not-an-array'; },
  ]) {
    const malformed = structuredClone(unknown); mutate(malformed);
    await assert.rejects(database.query('SELECT public.pr1e_normalize_govern_actions($1::jsonb,$2::jsonb)',
      [JSON.stringify(malformed.input), JSON.stringify(malformed.output)]), /PR1E_GOVERN_ACTION_AUTHORITY_INVALID/u);
  }

  const legacyOutput = { actionControls: [{ actionId: 'legacy.read', category: 'allowed' }] };
  assert.equal((await one(database, "SELECT jsonb_array_length(public.pr1e_normalize_govern_actions('{}',$1::jsonb)) count",
    [JSON.stringify(legacyOutput)])).count, 1);
  await assert.rejects(database.query("SELECT public.pr1e_normalize_govern_actions('{}',$1::jsonb)",
    [JSON.stringify({ actionControls: [...legacyOutput.actionControls, ...legacyOutput.actionControls] })]),
  /PR1E_GOVERN_ACTION_AUTHORITY_INVALID/u);
  const legacyModern = mixedSnapshots(300);
  delete legacyModern.output.interactionDecisions[1].readiness;
  assert.equal((await one(database, 'SELECT jsonb_array_length(public.pr1e_normalize_govern_actions($1::jsonb,$2::jsonb)) count',
    [JSON.stringify(legacyModern.input), JSON.stringify(legacyModern.output)])).count, 1);

  const mixed = await seedApprovedDecision(database, 400, mixedSnapshots(400));
  assert.equal((await governCall(database, mixed, 1400)).outcome, 'committed');
  const storedActions = (await one(database, 'SELECT actions FROM public.assess_v2_govern_resolutions WHERE decision_id=$1',
    [mixed.decision])).actions;
  assert.equal(storedActions.length, 1);
  assert.equal(storedActions[0].label, 'read: invoice status');
  assert.equal(storedActions.some(action => action.label.includes('operational')), false);

  const handoffAuthorizationVersion = await authorizationVersion(database, shared.handoff);
  const handoffValue = (await asRole(database, 'service_role', async () => database.query(`SELECT public.pr1e_handoff_assess_v2_studio(
    $1,$2,$3,$4,$5,3,$6,$7,$8,$9::jsonb) value`, [shared.handoff, shared.org, shared.workspace, mixed.caseId,
    mixed.decision, uuid(1500), 'handoff-mixed-1500', handoffAuthorizationVersion,
    JSON.stringify({ reviewSequence: 1 })]))).rows[0].value;
  assert.equal(handoffValue.outcome, 'committed');
  const handoffActions = (await one(database, "SELECT package#>'{govern,actions}' actions FROM public.assess_v2_studio_handoffs WHERE decision_id=$1",
    [mixed.decision])).actions;
  assert.deepEqual(handoffActions, storedActions);

  await database.query('UPDATE public.assess_v2_runtime_control SET read_only=true WHERE singleton');
  await assert.rejects(tx(database, 'replay-negative', async () => database.query(await migrationSql(migrationName))),
    /PR1E_GOVERN_MIXED_SNAPSHOT_SOURCE_MISMATCH/u);
  await database.query('UPDATE public.assess_v2_runtime_control SET read_only=false WHERE singleton');
  console.log('Govern mixed-snapshot normalization PostgreSQL checks passed.');
} catch (error) {
  failure = error;
} finally {
  for (const client of [...clients].reverse()) {
    try { await client.end(); } catch { /* best effort */ }
  }
  if (admin) {
    const cleanup = new Client({ connectionString: adminUrl });
    try {
      await cleanup.connect();
      await cleanup.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [databaseName]);
      await cleanup.query(`DROP DATABASE IF EXISTS ${databaseName}`);
      for (const role of createdRoles.reverse()) await cleanup.query(`DROP ROLE IF EXISTS ${role}`);
    } catch (error) {
      failure ??= error;
    } finally {
      try { await cleanup.end(); } catch { /* best effort */ }
    }
  }
}
if (failure) throw failure;
