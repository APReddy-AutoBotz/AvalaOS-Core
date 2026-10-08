import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { applySyntheticAiTerminalJournalMigrationForTest } from './syntheticAiTerminalJournalMigrationTestGuard.mjs';
import {
  GOVERN_ACCEPTANCE_EXACT_ACTUAL,
  classifyGovernAcceptanceCaseFailure,
  completeGovernAcceptanceSetupBlocked,
  finalizeGovernAcceptanceExecution,
  writeGovernAcceptanceProducer,
} from './governAcceptanceEvidence.mjs';

const { Client } = pg;
const adminUrl = process.env.GOVERN_ACCEPTANCE_DATABASE_URL;
const uuid = ordinal => `96000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;
const foreignOrg = '96100000-0000-4000-8000-000000000010';
const foreignWorkspace = '96100000-0000-4000-8000-000000000011';
const requiredMigrations = [
  '20260712120000_pr1b_identity_rbac_rls_assess.sql',
  '20260714120000_pr1d_assess_v2_decision_intelligence.sql',
  '20260720160000_pr1e_assess_v2_governed_review_handoff.sql',
  '20260923142120_pr1e_govern_control_alias_binding.sql',
];
const dbName = `govern_accept_${process.pid}_${Date.now()}`;
const createdRoles = [];
const cleanupErrors = [];
const actualByTestId = {};
const failuresByTestId = {};
const blockedByTestId = {};
let admin;
let db;
let databaseCreated = false;
let activeCasePhase = 'not-started';
let setupFailurePhase = null;

const urlFor = name => {
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
};
const connect = async url => {
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
};
const migrationTransaction = async (client, label, sql) => {
  await client.query('BEGIN');
  try {
    await client.query(sql.replaceAll('\r\n', '\n'));
    await client.query('COMMIT');
    console.log(`MIGRATION PASS ${label}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
};
const boundaryCall = async (client, role, boundary, operation) => {
  assert.match(boundary, /^[a-z_]+$/u);
  assert.ok(['service_role', 'authenticated'].includes(role));
  await client.query(`SAVEPOINT ${boundary}`);
  await client.query(`SET LOCAL ROLE ${role}`);
  try {
    const result = await operation();
    await client.query('RESET ROLE');
    await client.query(`RELEASE SAVEPOINT ${boundary}`);
    return result;
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${boundary}`);
    await client.query('RESET ROLE');
    await client.query(`RELEASE SAVEPOINT ${boundary}`);
    throw error;
  }
};
const serviceCall = (client, operation) => boundaryCall(client, 'service_role', 'govern_service_boundary', operation);
const authenticatedCall = (client, operation) => boundaryCall(client, 'authenticated', 'govern_authenticated_boundary', operation);
const row = async (client, sql, parameters = []) => (await client.query(sql, parameters)).rows[0];
const count = async (client, sql, parameters = []) => Number((await client.query(sql, parameters)).rows[0].n);
const exactZeroEffect = (before, after) => {
  assert.deepEqual(after, before);
  return 0;
};
const expectThrown = async (operation, pattern) => {
  let denied = false;
  try {
    await operation();
  } catch (error) {
    denied = pattern.test(error instanceof Error ? error.message : String(error));
  }
  assert.equal(denied, true);
  return true;
};
const markPhase = phase => { activeCasePhase = phase; };

const authorizationVersion = async (client, orgId, actorId) => Number((await row(client,
  'SELECT version FROM public.authorization_versions WHERE org_id=$1::uuid AND user_id=$2::uuid',
  [orgId, actorId],
)).version);

const governCall = async (client, command) => {
  const result = await serviceCall(client, () => client.query(
    `SELECT public.pr1e_resolve_assess_v2_govern(
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::bigint,
      $7::uuid,$8::text,$9::bigint,$10::jsonb
    ) value`,
    [
      command.actorId,
      command.organizationId,
      command.workspaceId,
      command.caseId,
      command.decisionId,
      command.expectedVersion,
      command.requestId,
      command.idempotencyKey,
      command.authorizationVersion,
      JSON.stringify(command.payload),
    ],
  ));
  return result.rows[0].value;
};

const nonServiceGovernCall = async (client, command) => authenticatedCall(client, () => client.query(
  `SELECT public.pr1e_resolve_assess_v2_govern(
    $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::bigint,
    $7::uuid,$8::text,$9::bigint,$10::jsonb
  ) value`,
  [
    command.actorId,
    command.organizationId,
    command.workspaceId,
    command.caseId,
    command.decisionId,
    command.expectedVersion,
    command.requestId,
    command.idempotencyKey,
    command.authorizationVersion,
    JSON.stringify(command.payload),
  ],
));

const targetFingerprint = async (client, fixture) => {
  const statements = [
    ['case', 'SELECT to_jsonb(c) value FROM public.assess_v2_cases c WHERE id=$1::uuid AND org_id=$2::uuid AND workspace_id=$3::uuid', [fixture.caseId, fixture.org, fixture.workspace]],
    ['govern', 'SELECT to_jsonb(g) value FROM public.assess_v2_govern_resolutions g WHERE case_id=$1::uuid AND org_id=$2::uuid AND workspace_id=$3::uuid ORDER BY id', [fixture.caseId, fixture.org, fixture.workspace]],
    ['receipts', "SELECT to_jsonb(r) value FROM public.assess_command_receipts r WHERE command_type='assessment_v2.govern.resolve' AND org_id=$1::uuid AND workspace_id=$2::uuid ORDER BY id", [fixture.org, fixture.workspace]],
    ['audits', "SELECT to_jsonb(a) value FROM public.privileged_audit_events a WHERE action='assessment_v2.govern.resolve' AND org_id=$1::uuid AND workspace_id=$2::uuid ORDER BY id", [fixture.org, fixture.workspace]],
  ];
  const values = {};
  for (const [name, sql, parameters] of statements) {
    const result = (await client.query(sql, parameters)).rows.map(item => item.value);
    values[name] = createHash('sha256').update(JSON.stringify(result)).digest('hex');
  }
  return values;
};

const tenantPairFingerprint = async (client, fixture) => ({
  fixture: await targetFingerprint(client, fixture),
  foreign: await targetFingerprint(client, {
    ...fixture,
    org: foreignOrg,
    workspace: foreignWorkspace,
  }),
});

const effectCounts = async (client, fixture) => ({
  caseVersion: Number((await row(client,
    'SELECT version FROM public.assess_v2_cases WHERE id=$1::uuid AND org_id=$2::uuid AND workspace_id=$3::uuid',
    [fixture.caseId, fixture.org, fixture.workspace],
  )).version),
  resolutions: await count(client,
    'SELECT count(*) n FROM public.assess_v2_govern_resolutions WHERE case_id=$1::uuid AND org_id=$2::uuid AND workspace_id=$3::uuid',
    [fixture.caseId, fixture.org, fixture.workspace]),
  receipts: await count(client,
    "SELECT count(*) n FROM public.assess_command_receipts WHERE command_type='assessment_v2.govern.resolve' AND org_id=$1::uuid AND workspace_id=$2::uuid AND actor_id=$3::uuid",
    [fixture.org, fixture.workspace, fixture.resolver]),
  audits: await count(client,
    "SELECT count(*) n FROM public.privileged_audit_events WHERE action='assessment_v2.govern.resolve' AND org_id=$1::uuid AND workspace_id=$2::uuid AND actor_id=$3::uuid",
    [fixture.org, fixture.workspace, fixture.resolver]),
});

const seedApprovedReview = async (client, ordinal) => {
  const owner = uuid(ordinal + 1);
  const reviewer = uuid(ordinal + 2);
  const resolver = uuid(ordinal + 3);
  const org = uuid(10);
  const workspace = uuid(11);
  const processId = uuid(ordinal + 10);
  const caseId = uuid(ordinal + 11);
  const sourceVersionId = uuid(ordinal + 12);
  const decisionId = uuid(ordinal + 13);
  const reviewId = uuid(ordinal + 14);
  const reviewResolutionId = uuid(ordinal + 15);
  const fixtureRole = uuid(ordinal + 20);
  const resolverRole = uuid(ordinal + 21);
  const decisionReceipt = uuid(ordinal + 30);
  const assignmentReceipt = uuid(ordinal + 31);
  const resolutionReceipt = uuid(ordinal + 32);

  await client.query('INSERT INTO auth.users(id) VALUES($1),($2),($3)', [owner, reviewer, resolver]);
  await client.query(
    "INSERT INTO public.profiles(id,email) VALUES($1,'govern-owner@example.invalid'),($2,'govern-reviewer@example.invalid'),($3,'govern-resolver@example.invalid')",
    [owner, reviewer, resolver],
  );
  await client.query(
    "INSERT INTO public.organizations(id,name,slug) VALUES($1,'Govern acceptance','govern-acceptance'),($2,'Govern foreign acceptance','govern-foreign-acceptance')",
    [org, foreignOrg],
  );
  await client.query(
    "INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,'Govern acceptance','govern-acceptance'),($3,$4,'Govern foreign acceptance','govern-foreign-acceptance')",
    [workspace, org, foreignWorkspace, foreignOrg],
  );
  await client.query(
    `INSERT INTO public.roles(id,org_id,name,slug,scope,permissions) VALUES
      ($1,$2,'Govern fixture','govern-fixture','organization','[]'),
      ($3,$2,'Govern resolver','govern-resolver','organization','[]')`,
    [fixtureRole, org, resolverRole],
  );
  await client.query(
    "INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,'assess.v2.govern.resolve')",
    [resolverRole],
  );
  await client.query(
    `INSERT INTO public.organization_members(org_id,user_id,role_id,status) VALUES
      ($1,$2,$5,'active'),($1,$3,$5,'active'),($1,$4,$6,'active')`,
    [org, owner, reviewer, resolver, fixtureRole, resolverRole],
  );
  await client.query(
    `INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,status) VALUES
      ($1,$2,$3,'active'),($1,$2,$4,'active'),($1,$2,$5,'active')`,
    [org, workspace, owner, reviewer, resolver],
  );
  const resolverAuthorizationVersion = await authorizationVersion(client, org, resolver);
  assert.ok(resolverAuthorizationVersion > 0);

  await client.query(
    "INSERT INTO public.assess_processes(id,org_id,workspace_id,name,status) VALUES($1,$2,$3,'Govern authority acceptance','Draft')",
    [processId, org, workspace],
  );
  await client.query(
    "INSERT INTO public.assess_v2_cases(id,org_id,workspace_id,process_id,owner_id,status,version) VALUES($1,$2,$3,$4,$5,'approved',2)",
    [caseId, org, workspace, processId, owner],
  );
  await client.query(
    "INSERT INTO public.assess_v2_case_versions(id,case_id,org_id,workspace_id,version,name,source_kind,created_by) VALUES($1,$2,$3,$4,2,'Govern acceptance source','create',$5)",
    [sourceVersionId, caseId, org, workspace, owner],
  );
  await client.query('UPDATE public.assess_v2_cases SET head_version_id=$1 WHERE id=$2', [sourceVersionId, caseId]);

  const insertFixtureReceipt = async (id, actor, key) => client.query(
    `INSERT INTO public.assess_command_receipts
      (id,org_id,workspace_id,actor_id,command_type,idempotency_key,request_id,request_hash,status,response,completed_at)
     VALUES($1,$2,$3,$4,'fixture',$5,gen_random_uuid(),'fixture-hash','succeeded','{}',now())`,
    [id, org, workspace, actor, key],
  );
  await insertFixtureReceipt(decisionReceipt, owner, `govern-decision-${ordinal}`);
  await insertFixtureReceipt(assignmentReceipt, owner, `govern-assignment-${ordinal}`);
  await insertFixtureReceipt(resolutionReceipt, reviewer, `govern-review-${ordinal}`);
  const hash = '0'.repeat(64);
  const outputSnapshot = {
    accountableOwner: 'Synthetic accountable owner',
    actionControls: [{ actionId: 'action.primary', category: 'approval-bound' }],
    controls: ['control.primary'],
  };
  await client.query(
    `INSERT INTO public.assess_v2_decision_versions
      (id,case_id,source_version_id,org_id,workspace_id,schema_version,rule_set_version,decision_version,
       validation_status,input_snapshot,evidence_snapshot,output_snapshot,input_hash,evidence_hash,output_hash,
       receipt_id,created_by,created_at)
     VALUES($1,$2,$3,$4,$5,'schema','rules','decision-govern','reviewer-ready','{}','[]',$6,$7,$7,$7,$8,$9,now())`,
    [decisionId, caseId, sourceVersionId, org, workspace, outputSnapshot, hash, decisionReceipt, owner],
  );
  await client.query(
    `INSERT INTO public.assess_v2_review_assignments
      (id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,
       review_schema_version,review_sequence,material_claims,reviewer_id,assigned_by,
       assigned_reviewer_authorization_version,assigned_by_authorization_version,request_id,receipt_id,audit_event_id)
     VALUES($1,$2,$3,$4,$5,2,$6,'decision-govern','assess-v2-review-2026-07',1,'[]',$7,$8,1,1,gen_random_uuid(),$9,gen_random_uuid())`,
    [reviewId, org, workspace, caseId, sourceVersionId, decisionId, reviewer, owner, assignmentReceipt],
  );
  await client.query(
    `INSERT INTO public.assess_v2_review_resolutions
      (id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,
       review_id,review_schema_version,review_sequence,resolution,reviewed_confidence,conditions,rationale,
       reviewer_id,reviewer_authorization_version,request_id,receipt_id,audit_event_id)
     VALUES($1,$2,$3,$4,$5,2,$6,'decision-govern',$7,'assess-v2-review-2026-07',1,
       'approved','Verified','[]','Synthetic approval',$8,1,gen_random_uuid(),$9,gen_random_uuid())`,
    [reviewResolutionId, org, workspace, caseId, sourceVersionId, decisionId, reviewId, reviewer, resolutionReceipt],
  );
  return {
    owner, reviewer, resolver, resolverRole, resolverAuthorizationVersion,
    org, workspace, caseId, sourceVersionId, decisionId, reviewResolutionId,
  };
};

const makeCommand = (fixture, ordinal, overrides = {}) => ({
  actorId: fixture.resolver,
  organizationId: fixture.org,
  workspaceId: fixture.workspace,
  caseId: fixture.caseId,
  decisionId: fixture.decisionId,
  expectedVersion: 2,
  requestId: uuid(ordinal),
  idempotencyKey: `govern-accept-${ordinal}`,
  authorizationVersion: fixture.resolverAuthorizationVersion,
  payload: {
    reviewSequence: 1,
    controlDispositions: [{ controlId: 'control.primary', status: 'resolved' }],
    rationale: 'Synthetic Govern authority acceptance',
  },
  ...overrides,
});

const commonDenials = async (client, fixture, command) => {
  const beforeForeign = await tenantPairFingerprint(client, fixture);
  const foreignTenantDenied = await expectThrown(
    () => governCall(client, {
      ...command,
      organizationId: foreignOrg,
      workspaceId: foreignWorkspace,
      requestId: uuid(7001),
      idempotencyKey: `${command.idempotencyKey}-foreign`,
    }),
    /PR1B_NOT_FOUND|AUTHORIZATION/u,
  );
  const afterForeign = await tenantPairFingerprint(client, fixture);
  exactZeroEffect(beforeForeign, afterForeign);
  const beforeNonService = await tenantPairFingerprint(client, fixture);
  const nonServiceDenied = await expectThrown(
    () => nonServiceGovernCall(client, {
      ...command,
      requestId: uuid(7002),
      idempotencyKey: `${command.idempotencyKey}-nonservice`,
    }),
    /permission denied|does not exist/u,
  );
  const afterNonService = await tenantPairFingerprint(client, fixture);
  return {
    foreignTenantDenied,
    nonServiceDenied,
    deniedEffectDelta: exactZeroEffect(beforeNonService, afterNonService),
  };
};

const inspectCommit = async (client, fixture, command, committed, before, after) => {
  const resolution = await row(client,
    `SELECT org_id,workspace_id,case_id,source_version_id,decision_id,review_resolution_id,
      resolver_id,resolver_authorization_version,request_id,receipt_id,audit_event_id,required_controls
     FROM public.assess_v2_govern_resolutions WHERE case_id=$1::uuid`,
    [fixture.caseId],
  );
  const receipt = await row(client,
    `SELECT id,org_id,workspace_id,actor_id,command_type,idempotency_key,request_id,status,response
     FROM public.assess_command_receipts
     WHERE org_id=$1::uuid AND actor_id=$2::uuid AND command_type='assessment_v2.govern.resolve'
       AND idempotency_key=$3`,
    [fixture.org, fixture.resolver, command.idempotencyKey],
  );
  const audit = await row(client,
    `SELECT id,org_id,workspace_id,actor_id,request_id,action,resource_type,resource_id,metadata
     FROM public.privileged_audit_events WHERE id=$1::uuid`,
    [resolution.audit_event_id],
  );
  const currentCase = await row(client,
    'SELECT status,version FROM public.assess_v2_cases WHERE id=$1::uuid', [fixture.caseId],
  );
  assert.equal(committed.outcome, 'committed');
  assert.equal(currentCase.status, 'govern_resolved');
  assert.equal(Number(currentCase.version), 3);
  assert.equal(receipt.status, 'succeeded');
  assert.deepEqual(receipt.response, committed.resource);
  assert.deepEqual(resolution.required_controls, command.payload.controlDispositions);
  const lineageBound = JSON.stringify([
    resolution.org_id, resolution.workspace_id, resolution.case_id,
    resolution.source_version_id, resolution.decision_id, resolution.review_resolution_id,
    resolution.resolver_id, Number(resolution.resolver_authorization_version), resolution.request_id, resolution.receipt_id,
    receipt.org_id, receipt.workspace_id, receipt.actor_id, receipt.command_type,
    receipt.idempotency_key, receipt.request_id,
  ]) === JSON.stringify([
    fixture.org, fixture.workspace, fixture.caseId, fixture.sourceVersionId,
    fixture.decisionId, fixture.reviewResolutionId, fixture.resolver,
    Number(command.authorizationVersion), command.requestId, receipt.id,
    fixture.org, fixture.workspace, fixture.resolver, 'assessment_v2.govern.resolve',
    command.idempotencyKey, command.requestId,
  ]);
  assert.equal(lineageBound, true);
  const auditBound = JSON.stringify([
    audit.org_id, audit.workspace_id, audit.actor_id, audit.request_id,
    audit.action, audit.resource_type, audit.resource_id,
    audit.metadata.decisionId, audit.metadata.sourceVersionId, audit.metadata.receiptId,
    resolution.audit_event_id,
  ]) === JSON.stringify([
    fixture.org, fixture.workspace, fixture.resolver, command.requestId,
    'assessment_v2.govern.resolve', 'assess_v2_case', fixture.caseId,
    fixture.decisionId, fixture.sourceVersionId, receipt.id, audit.id,
  ]);
  assert.equal(auditBound, true);
  return {
    logicalMutationCount: after.resolutions - before.resolutions,
    caseVersionDelta: after.caseVersion - before.caseVersion,
    resolutionDelta: after.resolutions - before.resolutions,
    receiptDelta: after.receipts - before.receipts,
    auditDelta: after.audits - before.audits,
    lineageBound,
    auditBound,
  };
};

const runCase = async (testId, operation) => {
  activeCasePhase = 'setup-case-transaction';
  await db.query('BEGIN');
  try {
    const actual = await operation();
    assert.deepEqual(actual, GOVERN_ACCEPTANCE_EXACT_ACTUAL[testId]);
    actualByTestId[testId] = actual;
    console.log(`PASS ${testId}`);
  } catch {
    const failure = classifyGovernAcceptanceCaseFailure(activeCasePhase);
    const target = failure.status === 'BLOCKED' ? blockedByTestId : failuresByTestId;
    target[testId] = { failureCode: failure.failureCode };
    console.error(`${failure.status} ${testId} phase=${activeCasePhase} ${failure.failureCode}`);
  } finally {
    try {
      await db.query('ROLLBACK');
    } catch {
      cleanupErrors.push(`case-rollback:${testId}`);
    }
  }
};

activeCasePhase = 'setup-foundation-config';
try {
  assert.ok(adminUrl, 'GOVERN_ACCEPTANCE_DATABASE_URL is required.');
  const migrations = (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
  for (const migration of requiredMigrations) assert.ok(migrations.includes(migration), `missing ${migration}`);
  for (let index = 1; index < requiredMigrations.length; index += 1) {
    assert.ok(migrations.indexOf(requiredMigrations[index]) > migrations.indexOf(requiredMigrations[index - 1]));
  }
  activeCasePhase = 'setup-foundation-connect';
  admin = await connect(adminUrl);
  activeCasePhase = 'setup-foundation-roles';
  for (const [roleName, attributes] of [
    ['anon', 'NOLOGIN'],
    ['authenticated', 'NOLOGIN'],
    ['service_role', 'NOLOGIN BYPASSRLS'],
  ]) {
    if (!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [roleName])).rowCount) {
      await admin.query(`CREATE ROLE ${roleName} ${attributes}`);
      createdRoles.push(roleName);
    }
  }
  assert.match(dbName, /^[a-z0-9_]+$/u);
  if ((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName])).rowCount) {
    throw new Error('refusing to overwrite an existing Govern acceptance database');
  }
  await admin.query(`CREATE DATABASE ${dbName}`);
  databaseCreated = true;
  db = await connect(urlFor(dbName));
  activeCasePhase = 'setup-foundation-migrations';
  await migrationTransaction(db, 'auth-bootstrap', `
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  `);
  for (const migration of migrations) {
    const sql = await readFile(join('supabase/migrations', migration), 'utf8');
    await applySyntheticAiTerminalJournalMigrationForTest(db, migration,
      () => migrationTransaction(db, migration, sql));
  }
  activeCasePhase = 'setup-foundation-contract';
  assert.equal((await row(db,
    "SELECT has_function_privilege('service_role','public.pr1e_resolve_assess_v2_govern(uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,bigint,jsonb)','EXECUTE') allowed",
  )).allowed, true);
  assert.equal((await row(db,
    "SELECT has_function_privilege('authenticated','public.pr1e_resolve_assess_v2_govern(uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,bigint,jsonb)','EXECUTE') allowed",
  )).allowed, false);
  console.log('FOUNDATION PASS one full current ordered migration chain');

  await runCase('GOVERN-008', async () => {
    markPhase('setup-approved-review');
    const fixture = await seedApprovedReview(db, 800);
    const initialCommand = makeCommand(fixture, 850);
    await db.query(
      "DELETE FROM public.role_capabilities WHERE role_id=$1::uuid AND capability_key='assess.v2.govern.resolve'",
      [fixture.resolverRole],
    );
    await db.query(
      "INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1::uuid,'assess.v2.govern.resolve')",
      [fixture.resolverRole],
    );
    const currentAuthorizationVersion = await authorizationVersion(db, fixture.org, fixture.resolver);
    assert.ok(currentAuthorizationVersion > initialCommand.authorizationVersion);

    markPhase('stale-before-first-command');
    const staleBefore = await tenantPairFingerprint(db, fixture);
    const stale = await governCall(db, initialCommand);
    assert.deepEqual(stale, { errorCode: 'AUTHORIZATION_STALE' });
    const staleAfter = await tenantPairFingerprint(db, fixture);
    exactZeroEffect(staleBefore, staleAfter);

    const refreshedCommand = { ...initialCommand, authorizationVersion: currentAuthorizationVersion };
    const commandIdentity = value => ({
      actorId: value.actorId, organizationId: value.organizationId,
      workspaceId: value.workspaceId, caseId: value.caseId,
      decisionId: value.decisionId, expectedVersion: value.expectedVersion,
      requestId: value.requestId, idempotencyKey: value.idempotencyKey,
      payload: value.payload,
    });
    const sameIdentityAfterRefresh = JSON.stringify(commandIdentity(initialCommand))
      === JSON.stringify(commandIdentity(refreshedCommand));
    assert.equal(sameIdentityAfterRefresh, true);
    markPhase('tenant-and-caller-denials');
    const denials = await commonDenials(db, fixture, refreshedCommand);
    markPhase('refreshed-authority-commit');
    const before = await effectCounts(db, fixture);
    const committed = await governCall(db, refreshedCommand);
    const after = await effectCounts(db, fixture);
    const inspected = await inspectCommit(db, fixture, refreshedCommand, committed, before, after);

    markPhase('stale-and-current-replay');
    const staleReplayBefore = await tenantPairFingerprint(db, fixture);
    const staleReplay = await governCall(db, initialCommand);
    assert.deepEqual(staleReplay, { errorCode: 'AUTHORIZATION_STALE' });
    const staleReplayAfter = await tenantPairFingerprint(db, fixture);
    exactZeroEffect(staleReplayBefore, staleReplayAfter);
    const replayBefore = await tenantPairFingerprint(db, fixture);
    const currentReplay = await governCall(db, refreshedCommand);
    assert.equal(currentReplay.outcome, 'replayed');
    assert.deepEqual(currentReplay.resource, committed.resource);
    const replayAfter = await tenantPairFingerprint(db, fixture);
    return {
      ...inspected,
      staleBeforeCommitDenied: stale.errorCode === 'AUTHORIZATION_STALE',
      sameIdentityAfterRefresh,
      staleReplayDenied: staleReplay.errorCode === 'AUTHORIZATION_STALE',
      currentReplayExact: currentReplay.outcome === 'replayed',
      replayEffectDelta: exactZeroEffect(replayBefore, replayAfter),
      ...denials,
    };
  });

  await runCase('GOVERN-009', async () => {
    markPhase('setup-approved-review');
    const fixture = await seedApprovedReview(db, 900);
    const command = makeCommand(fixture, 950);
    markPhase('tenant-and-caller-denials');
    const denials = await commonDenials(db, fixture, command);
    markPhase('authorized-resolution');
    const before = await effectCounts(db, fixture);
    const committed = await governCall(db, command);
    const after = await effectCounts(db, fixture);
    const inspected = await inspectCommit(db, fixture, command, committed, before, after);
    const committedFingerprint = await targetFingerprint(db, fixture);

    markPhase('authority-revocation');
    await db.query(
      "DELETE FROM public.role_capabilities WHERE role_id=$1::uuid AND capability_key='assess.v2.govern.resolve'",
      [fixture.resolverRole],
    );
    const revokedVersion = await authorizationVersion(db, fixture.org, fixture.resolver);
    const capabilityRevoked = !(await db.query(
      "SELECT 1 FROM public.role_capabilities WHERE role_id=$1::uuid AND capability_key='assess.v2.govern.resolve'",
      [fixture.resolverRole],
    )).rowCount && revokedVersion > command.authorizationVersion;
    assert.equal(capabilityRevoked, true);

    markPhase('revoked-authority-denials');
    const oldBefore = await targetFingerprint(db, fixture);
    const oldAuthorizationDenied = await expectThrown(
      () => governCall(db, command), /PR1B_NOT_FOUND|AUTHORIZATION/u,
    );
    const oldAfter = await targetFingerprint(db, fixture);
    exactZeroEffect(oldBefore, oldAfter);
    const currentBefore = await targetFingerprint(db, fixture);
    const currentAuthorizationDenied = await expectThrown(
      () => governCall(db, { ...command, authorizationVersion: revokedVersion }),
      /PR1B_NOT_FOUND|AUTHORIZATION/u,
    );
    const currentAfter = await targetFingerprint(db, fixture);
    exactZeroEffect(currentBefore, currentAfter);
    const freshBefore = await targetFingerprint(db, fixture);
    const freshKeyDenied = await expectThrown(
      () => governCall(db, {
        ...command,
        requestId: uuid(951),
        idempotencyKey: 'govern-revoked-fresh-key',
        authorizationVersion: revokedVersion,
        expectedVersion: 3,
      }),
      /PR1B_NOT_FOUND|AUTHORIZATION/u,
    );
    const freshAfter = await targetFingerprint(db, fixture);
    const currentFingerprint = await targetFingerprint(db, fixture);
    return {
      ...inspected,
      capabilityRevoked,
      oldAuthorizationDenied,
      currentAuthorizationDenied,
      freshKeyDenied,
      responseDisclosureDenied: oldAuthorizationDenied && currentAuthorizationDenied && freshKeyDenied,
      revokedEffectDelta: exactZeroEffect(freshBefore, freshAfter),
      originalCommitImmutable: JSON.stringify(committedFingerprint) === JSON.stringify(currentFingerprint),
      ...denials,
    };
  });

  await runCase('GOVERN-010', async () => {
    markPhase('setup-approved-review');
    const fixture = await seedApprovedReview(db, 1000);
    const command = makeCommand(fixture, 1050);
    markPhase('tenant-and-caller-denials');
    const denials = await commonDenials(db, fixture, command);
    markPhase('authorized-resolution');
    const before = await effectCounts(db, fixture);
    const committed = await governCall(db, command);
    const after = await effectCounts(db, fixture);
    const inspected = await inspectCommit(db, fixture, command, committed, before, after);

    markPhase('exact-replay');
    const replayBefore = await targetFingerprint(db, fixture);
    const replay = await governCall(db, command);
    assert.equal(replay.outcome, 'replayed');
    assert.deepEqual(replay.resource, committed.resource);
    const replayAfter = await targetFingerprint(db, fixture);
    const replayEffectDelta = exactZeroEffect(replayBefore, replayAfter);

    markPhase('changed-payload-conflict');
    const changedBefore = await targetFingerprint(db, fixture);
    const changed = await governCall(db, {
      ...command,
      payload: { ...command.payload, rationale: 'Changed payload must conflict' },
    });
    assert.deepEqual(changed, { errorCode: 'IDEMPOTENCY_CONFLICT' });
    const changedAfter = await targetFingerprint(db, fixture);
    exactZeroEffect(changedBefore, changedAfter);
    markPhase('fresh-key-semantic-duplicate');
    const duplicateBefore = await targetFingerprint(db, fixture);
    const duplicate = await governCall(db, {
      ...command,
      requestId: uuid(1051),
      idempotencyKey: 'govern-equivalent-fresh-key',
      expectedVersion: 3,
    });
    assert.deepEqual(duplicate, { errorCode: 'INVALID_COMMAND' });
    const duplicateAfter = await targetFingerprint(db, fixture);
    return {
      ...inspected,
      exactReplay: replay.outcome === 'replayed',
      replayEffectDelta,
      changedPayloadConflict: changed.errorCode === 'IDEMPOTENCY_CONFLICT',
      freshKeyDuplicateDenied: duplicate.errorCode === 'INVALID_COMMAND',
      duplicateEffectDelta: exactZeroEffect(duplicateBefore, duplicateAfter),
      ...denials,
    };
  });
} catch {
  setupFailurePhase = String(activeCasePhase).startsWith('setup-')
    ? activeCasePhase
    : 'setup-foundation';
  console.error(`BLOCKED Govern acceptance phase=${setupFailurePhase} setup_failed`);
} finally {
  if (db) {
    try { await db.end(); } catch { cleanupErrors.push('database-client-close'); }
  }
  if (admin && databaseCreated) {
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      if ((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName])).rowCount) {
        cleanupErrors.push('database-drop-verification');
      }
    } catch { cleanupErrors.push('database-drop'); }
  }
  if (admin) {
    for (const roleName of createdRoles.reverse()) {
      try {
        await admin.query(`DROP ROLE IF EXISTS ${roleName}`);
        if ((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [roleName])).rowCount) {
          cleanupErrors.push(`role-drop-verification:${roleName}`);
        }
      } catch { cleanupErrors.push(`role-drop:${roleName}`); }
    }
    try { await admin.end(); } catch { cleanupErrors.push('admin-client-close'); }
  }
}

if (cleanupErrors.length) throw new Error(`GOVERN_ACCEPTANCE_CLEANUP_FAILED:${cleanupErrors.join(',')}`);
if (setupFailurePhase) {
  Object.assign(blockedByTestId, completeGovernAcceptanceSetupBlocked({
    actualByTestId,
    failuresByTestId,
    blockedByTestId,
  }));
}
const retainedResultPath = process.env.RETAINED_TEST_ID_RESULTS;
const finalization = finalizeGovernAcceptanceExecution({
  actualByTestId,
  failuresByTestId,
  blockedByTestId,
  retainedResultPath,
});
if (retainedResultPath) {
  writeGovernAcceptanceProducer(retainedResultPath, {
    actualByTestId,
    failuresByTestId,
    blockedByTestId,
    identity: {
      releaseSha: process.env.RELEASE_SHA,
      workflowRunId: process.env.GITHUB_RUN_ID,
      workflowAttempt: process.env.GITHUB_RUN_ATTEMPT,
      environment: process.env.ACCEPTANCE_EVIDENCE_ENVIRONMENT,
      workflowPath: process.env.ACCEPTANCE_WORKFLOW_PATH,
    },
    command: process.env.RETAINED_SUITE_COMMAND,
    cleanupVerified: true,
  });
}
if (finalization.shouldFailProcess) throw new Error('GOVERN_ACCEPTANCE_STANDALONE_INCOMPLETE');
console.log(`Govern PostgreSQL acceptance completed: ${finalization.counts.passed} passed, ${finalization.counts.failed} failed, ${finalization.counts.blocked} blocked; hosted execution not run.`);
