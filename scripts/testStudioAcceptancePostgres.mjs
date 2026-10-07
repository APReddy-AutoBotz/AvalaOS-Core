import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { applySyntheticAiTerminalJournalMigrationForTest } from './syntheticAiTerminalJournalMigrationTestGuard.mjs';
import { createCommittedStudioFixture } from './studioArtifactPostgresFixture.mjs';
import {
  createApprovedStudioFixture,
} from './studioPrivateArtifactPostgresFixture.mjs';
import {
  STUDIO_ACCEPTANCE_EXACT_ACTUAL,
  classifyStudioAcceptanceCaseFailure,
  completeStudioAcceptanceSetupBlocked,
  finalizeStudioAcceptanceExecution,
  writeStudioAcceptanceProducer,
} from './studioAcceptanceEvidence.mjs';

const { Client } = pg;
const adminUrl = process.env.STUDIO_ACCEPTANCE_DATABASE_URL;

const uuid = ordinal => `99000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;
const foreignOrg = uuid(998);
const foreignWorkspace = uuid(999);
const requiredMigrations = [
  '20260727120000_studio_governed_artifact_authority.sql',
  '20260729163251_studio_private_artifact_authority.sql',
  '20260730190000_pr217_studio_private_artifact_runtime_forward_fix.sql',
  '20260828120000_governed_multisource_studio_pr_b.sql',
];

const dbName = `studio_accept_${process.pid}_${Date.now()}`;
const createdRoles = [];
const cleanupErrors = [];
let admin;
let db;
let databaseCreated = false;
let studioScopedTables = [];
let activeCasePhase = 'not-started';
const actualByTestId = {};
const failuresByTestId = {};
const blockedByTestId = {};
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
const serviceCall = async (client, operation) => {
  await client.query('SAVEPOINT studio_service_boundary');
  await client.query('SET LOCAL ROLE service_role');
  try {
    const result = await operation();
    await client.query('RESET ROLE');
    await client.query('RELEASE SAVEPOINT studio_service_boundary');
    return result;
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT studio_service_boundary');
    await client.query('RESET ROLE');
    await client.query('RELEASE SAVEPOINT studio_service_boundary');
    throw error;
  }
};
const authenticatedCall = async (client, actorId, operation) => {
  await client.query('SAVEPOINT studio_authenticated_boundary');
  await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [actorId]);
  await client.query('SET LOCAL ROLE authenticated');
  try {
    const result = await operation();
    await client.query('RESET ROLE');
    await client.query('RELEASE SAVEPOINT studio_authenticated_boundary');
    return result;
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT studio_authenticated_boundary');
    await client.query('RESET ROLE');
    await client.query('RELEASE SAVEPOINT studio_authenticated_boundary');
    throw error;
  }
};
const isolatedProbe = async (client, operation) => {
  await client.query('SAVEPOINT studio_negative_probe');
  try {
    return await operation();
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT studio_negative_probe');
    await client.query('RELEASE SAVEPOINT studio_negative_probe');
  }
};
const databaseCall = async (client, operation) => {
  await client.query('SAVEPOINT studio_database_boundary');
  try {
    const result = await operation();
    await client.query('RELEASE SAVEPOINT studio_database_boundary');
    return result;
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT studio_database_boundary');
    await client.query('RELEASE SAVEPOINT studio_database_boundary');
    throw error;
  }
};
const expectFailure = async (operation, pattern) => {
  let rejected = false;
  try {
    await operation();
  } catch (error) {
    rejected = pattern.test(error instanceof Error ? error.message : String(error));
  }
  assert.equal(rejected, true);
  return true;
};
const count = async (client, sql, parameters = []) => Number((await client.query(sql, parameters)).rows[0].n);
const row = async (client, sql, parameters = []) => (await client.query(sql, parameters)).rows[0];
const snapshot = async (client, statements) => Object.fromEntries(await Promise.all(
  Object.entries(statements).map(async ([name, [sql, parameters]]) => [name, await count(client, sql, parameters)]),
));
const scopedStudioFingerprint = async (client, orgId, workspaceId) => {
  const fingerprints = {};
  for (const table of studioScopedTables) {
    assert.match(table, /^studio_[a-z0-9_]+$/u);
    const values = (await client.query(
      `SELECT to_jsonb(scoped) value FROM public.${table} scoped WHERE org_id=$1::uuid AND workspace_id=$2::uuid ORDER BY to_jsonb(scoped)::text`,
      [orgId, workspaceId],
    )).rows.map(item => item.value);
    fingerprints[table] = createHash('sha256').update(JSON.stringify(values)).digest('hex');
  }
  const audits = (await client.query(
    "SELECT to_jsonb(scoped) value FROM public.privileged_audit_events scoped WHERE org_id=$1::uuid AND workspace_id=$2::uuid AND action LIKE 'studio.%' ORDER BY to_jsonb(scoped)::text",
    [orgId, workspaceId],
  )).rows.map(item => item.value);
  fingerprints.privileged_audit_events = createHash('sha256').update(JSON.stringify(audits)).digest('hex');
  return fingerprints;
};
const exactZeroEffect = (before, after) => {
  assert.deepEqual(after, before);
  return 0;
};
const tenantPairFingerprint = async (client, orgId, workspaceId) => ({
  fixture: await scopedStudioFingerprint(client, orgId, workspaceId),
  foreign: await scopedStudioFingerprint(client, foreignOrg, foreignWorkspace),
});
const seedForeignTenant = async client => {
  await client.query(
    "INSERT INTO organizations(id,name,slug) VALUES($1,'Studio foreign acceptance','studio-foreign-acceptance')",
    [foreignOrg],
  );
  await client.query(
    "INSERT INTO workspaces(id,org_id,name,slug) VALUES($1,$2,'Studio foreign acceptance','studio-foreign-acceptance')",
    [foreignWorkspace, foreignOrg],
  );
  assert.deepEqual(await row(client,
    'SELECT id,org_id FROM workspaces WHERE id=$1::uuid AND org_id=$2::uuid',
    [foreignWorkspace, foreignOrg],
  ), { id: foreignWorkspace, org_id: foreignOrg });
};
const markPhase = label => { activeCasePhase = label; };

const governedClaim = async (client, command) => {
  const result = await serviceCall(client, () => client.query(
    'SELECT public.studio_artifact_command_claim($1::jsonb) result',
    [JSON.stringify(command)],
  ));
  return result.rows[0].result;
};
const artifactState = async (client, artifactId) => row(client,
  'SELECT aggregate_version,current_version_id,current_approved_version_id,lifecycle FROM studio_artifact_aggregates WHERE id=$1::uuid',
  [artifactId],
);
const artifactCommand = async (client, fixture, commandType, actorId, payload, key, ordinal) => {
  const aggregate = await artifactState(client, fixture.artifactId);
  const version = await row(client,
    'SELECT id,version FROM studio_artifact_versions WHERE id=$1::uuid',
    [aggregate.current_version_id],
  );
  const command = {
    commandType,
    requestId: uuid(ordinal),
    idempotencyKey: key,
    organizationId: fixture.org,
    workspaceId: fixture.workspace,
    actorId,
    authorizationVersion: fixture.authorizationVersions[actorId],
    expectedAggregateVersion: Number(aggregate.aggregate_version),
    expectedArtifactVersion: Number(version.version),
    payload,
  };
  return { command, result: await governedClaim(client, command) };
};

const normalizedPrivateCommand = async (client, input) => {
  const command = structuredClone(input);
  if (command.commandType === 'studio.retention.policy.publish') {
    command.expectedArtifactVersion ??= null;
    command.expectedRenditionVersion ??= null;
  } else if (command.commandType === 'studio.rendition.generate') {
    const version = await row(client,
      'SELECT artifact_id,version FROM studio_artifact_versions WHERE id=$1::uuid',
      [command.payload.artifactVersionId],
    );
    command.payload.artifactId ??= version.artifact_id;
    command.expectedArtifactVersion ??= Number(version.version);
    command.expectedRenditionVersion ??= null;
  } else {
    if (!command.payload.renditionId && command.payload.deletionRequestId) {
      command.payload.renditionId = (await row(client,
        'SELECT rendition_id FROM studio_rendition_deletion_requests WHERE id=$1::uuid',
        [command.payload.deletionRequestId],
      ))?.rendition_id;
    }
    const rendition = await row(client,
      'SELECT artifact_version,lifecycle_version FROM studio_renditions WHERE id=$1::uuid',
      [command.payload.renditionId],
    );
    command.expectedArtifactVersion ??= Number(rendition.artifact_version);
    command.expectedRenditionVersion ??= Number(rendition.lifecycle_version);
  }
  return command;
};
const privateClaim = async (client, input) => {
  const command = await normalizedPrivateCommand(client, input);
  const result = await serviceCall(client, () => client.query(
    'SELECT public.studio_private_artifact_command_claim($1::jsonb) result',
    [JSON.stringify(command)],
  ));
  return { command, result: result.rows[0].result };
};
const privateInput = (fixture, commandType, payload, key, ordinal, actorId = fixture.requester) => ({
  commandType,
  actorId,
  organizationId: fixture.org,
  workspaceId: fixture.workspace,
  requestId: uuid(ordinal),
  idempotencyKey: key,
  authorizationVersion: fixture.authorizationVersions[actorId],
  payload,
});
const callPrivateLifecycle = async (client, sql, parameters) => (
  await serviceCall(client, () => client.query(sql, parameters))
).rows[0]?.result ?? null;

const prepareRendition = async (client, { retentionDays, ordinal }) => {
  const fixture = await createApprovedStudioFixture(client);
  if (retentionDays !== undefined) {
    const publication = privateInput(fixture, 'studio.retention.policy.publish', {
      artifactType: 'brd', retentionDays, indefinite: false, rationale: 'disposable Studio acceptance policy',
    }, `accept-policy-${ordinal}`, ordinal);
    assert.equal((await privateClaim(client, publication)).result.outcome, 'committed');
  }
  const generationInput = privateInput(fixture, 'studio.rendition.generate', {
    artifactVersionId: fixture.artifactVersionId,
    format: 'markdown',
  }, `accept-render-${ordinal}`, ordinal + 1);
  const generation = await privateClaim(client, generationInput);
  assert.equal(generation.result.outcome, 'committed');
  const claim = generation.result.renditionClaim;
  const bytes = Buffer.from(`synthetic Studio rendition ${ordinal}`, 'utf8');
  const metadata = {
    objectKey: `${fixture.org}/${fixture.workspace}/studio-artifacts/${claim.opaqueObjectId}.md`,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.byteLength,
    mimeType: 'text/markdown; charset=utf-8',
    filename: `accept-${ordinal}.md`,
  };
  const fakeStorage = new Map([[metadata.objectKey, bytes]]);
  await callPrivateLifecycle(client, 'SELECT public.studio_rendition_attempt_start($1::uuid) result', [claim.attemptId]);
  await callPrivateLifecycle(client,
    'SELECT public.studio_rendition_attempt_rendered($1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text,$7::text,$8::text,$9::text) result',
    [claim.attemptId, metadata.objectKey, metadata.sha256, metadata.byteLength, metadata.mimeType,
      metadata.filename, claim.rendererVersion, claim.templateVersion, claim.contentSchemaVersion],
  );
  const completion = await callPrivateLifecycle(client,
    'SELECT public.studio_rendition_attempt_complete($1::uuid) result', [claim.attemptId],
  );
  assert.equal(completion.outcome, 'committed');
  const rendition = await row(client, 'SELECT * FROM studio_renditions WHERE id=$1::uuid', [completion.renditionId]);
  assert.equal(rendition.lifecycle, 'available');
  return { fixture, generationInput, generation, claim, metadata, fakeStorage, rendition };
};
const runCase = async (testId, operation) => {
  activeCasePhase = 'setup-fixture';
  await db.query('BEGIN');
  try {
    await seedForeignTenant(db);
    const actual = await operation();
    assert.deepEqual(actual, STUDIO_ACCEPTANCE_EXACT_ACTUAL[testId]);
    actualByTestId[testId] = actual;
    console.log(`PASS ${testId}`);
  } catch {
    const failure = classifyStudioAcceptanceCaseFailure(activeCasePhase);
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
  assert.ok(adminUrl, 'STUDIO_ACCEPTANCE_DATABASE_URL is required.');
  const migrations = (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
  for (const migration of requiredMigrations) assert.ok(migrations.includes(migration), `missing ${migration}`);
  assert.ok(migrations.indexOf(requiredMigrations[3]) > migrations.indexOf(requiredMigrations[2]));
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
    throw new Error('refusing to overwrite an existing Studio acceptance database');
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
  activeCasePhase = 'setup-foundation-discovery';
  studioScopedTables = (await db.query(`
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name LIKE 'studio\\_%' ESCAPE '\\'
      AND table_name IN (
        SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_type='BASE TABLE'
      )
    GROUP BY table_name
    HAVING bool_or(column_name='org_id') AND bool_or(column_name='workspace_id')
    ORDER BY table_name
  `)).rows.map(item => item.table_name);
  assert.ok(studioScopedTables.length >= 15);
  console.log('FOUNDATION PASS one full current ordered migration chain');

  await runCase('STUDIO-004', async () => {
    const fixture = await createCommittedStudioFixture(db);
    markPhase('foreign-tenant-denial');
    const parentBefore = await row(db,
      'SELECT id,artifact_id,org_id,workspace_id,version,parent_version_id,content,content_hash FROM studio_artifact_versions WHERE id=$1::uuid',
      [fixture.version.id],
    );
    const aggregate = await artifactState(db, fixture.artifactId);
    const command = {
      commandType: 'studio.artifact.draft.revise', requestId: uuid(401), idempotencyKey: 'accept-revise',
      organizationId: fixture.org, workspaceId: fixture.workspace, actorId: fixture.requester,
      authorizationVersion: fixture.authorizationVersions[fixture.requester],
      expectedAggregateVersion: Number(aggregate.aggregate_version), expectedArtifactVersion: Number(fixture.version.version),
      payload: {
        artifactId: fixture.artifactId, parentVersionId: fixture.version.id,
        content: { title: 'Revised synthetic BRD', sections: [{ heading: 'Summary', body: 'Immutable parent evidence' }] },
      },
    };
    const effects = {
      versions: ['SELECT count(*) n FROM studio_artifact_versions WHERE artifact_id=$1::uuid', [fixture.artifactId]],
      receipts: ["SELECT count(*) n FROM studio_artifact_command_receipts WHERE command_type='studio.artifact.draft.revise' AND resource_id=$1::uuid", [fixture.artifactId]],
      audits: ["SELECT count(*) n FROM privileged_audit_events WHERE action='studio.artifact.draft.revise' AND resource_id=$1::uuid", [fixture.artifactId]],
    };
    const denialBefore = await tenantPairFingerprint(db, fixture.org, fixture.workspace);
    const foreignTenantDenied = await expectFailure(() => governedClaim(db, { ...command, requestId: uuid(402), idempotencyKey: 'accept-revise-foreign', organizationId: foreignOrg, workspaceId: foreignWorkspace }), /PR1B_|RESOURCE_NOT_AVAILABLE|AUTHORIZATION/u);
    const denialAfter = await tenantPairFingerprint(db, fixture.org, fixture.workspace);
    const deniedEffectDelta = exactZeroEffect(denialBefore, denialAfter);
    markPhase('revision-command');
    const before = await snapshot(db, effects);
    const result = await governedClaim(db, command);
    assert.equal(result.outcome, 'committed');
    const after = await snapshot(db, effects);
    const current = await artifactState(db, fixture.artifactId);
    const revised = await row(db,
      'SELECT artifact_id,org_id,workspace_id,version,parent_version_id,content,content_hash FROM studio_artifact_versions WHERE id=$1::uuid',
      [current.current_version_id],
    );
    const parentAfter = await row(db,
      'SELECT id,artifact_id,org_id,workspace_id,version,parent_version_id,content,content_hash FROM studio_artifact_versions WHERE id=$1::uuid',
      [fixture.version.id],
    );
    markPhase('parent-immutability');
    const immutableBefore = await scopedStudioFingerprint(db, fixture.org, fixture.workspace);
    const parentImmutable = await expectFailure(
      () => databaseCall(db, () => db.query("UPDATE studio_artifact_versions SET content='{}'::jsonb WHERE id=$1::uuid", [fixture.version.id])),
      /STUDIO_IMMUTABLE/u,
    );
    const immutableAfter = await scopedStudioFingerprint(db, fixture.org, fixture.workspace);
    exactZeroEffect(immutableBefore, immutableAfter);
    markPhase('exact-replay');
    const replayBefore = await scopedStudioFingerprint(db, fixture.org, fixture.workspace);
    const replay = await governedClaim(db, command);
    const replayAfter = await scopedStudioFingerprint(db, fixture.org, fixture.workspace);
    const audit = await row(db,
      "SELECT org_id,workspace_id,resource_id,metadata FROM privileged_audit_events WHERE action='studio.artifact.draft.revise' AND resource_id=$1::uuid",
      [fixture.artifactId],
    );
    assert.equal(replay.outcome, 'replayed');
    assert.equal(revised.version, '2');
    assert.deepEqual(parentAfter, parentBefore);
    const lineageBound = JSON.stringify([revised.artifact_id, revised.org_id, revised.workspace_id, revised.parent_version_id])
      === JSON.stringify([fixture.artifactId, fixture.org, fixture.workspace, fixture.version.id]);
    assert.equal(lineageBound, true);
    assert.deepEqual(revised.content, command.payload.content);
    const expectedContentHash = (await row(db,
      "SELECT encode(public.digest(convert_to($1::jsonb::text,'UTF8'),'sha256'),'hex') value",
      [JSON.stringify(command.payload.content)],
    )).value;
    assert.equal(revised.content_hash, expectedContentHash);
    assert.deepEqual([audit.org_id, audit.workspace_id, audit.resource_id], [fixture.org, fixture.workspace, fixture.artifactId]);
    assert.equal(typeof audit.metadata.receiptId, 'string');
    return {
      logicalMutationCount: after.versions - before.versions,
      versionDelta: after.versions - before.versions,
      receiptDelta: after.receipts - before.receipts,
      auditDelta: after.audits - before.audits,
      parentImmutable,
      parentContentUnchanged: JSON.stringify(parentAfter) === JSON.stringify(parentBefore),
      currentVersionAdvanced: current.current_version_id === result.resource.currentVersion.id,
      exactReplay: replay.outcome === 'replayed',
      replayEffectDelta: exactZeroEffect(replayBefore, replayAfter),
      foreignTenantDenied,
      deniedEffectDelta,
      lineageBound,
    };
  });

  await runCase('STUDIO-005', async () => {
    const fixture = await createCommittedStudioFixture(db);
    markPhase('setup-approval-prerequisites');
    await artifactCommand(db, fixture, 'studio.artifact.review.submit', fixture.requester,
      { artifactId: fixture.artifactId, artifactVersionId: fixture.version.id }, 'accept-submit', 501);
    await artifactCommand(db, fixture, 'studio.artifact.review.assign', fixture.requester,
      { artifactId: fixture.artifactId, artifactVersionId: fixture.version.id, reviewerId: fixture.reviewer }, 'accept-assign', 502);
    await artifactCommand(db, fixture, 'studio.artifact.review.resolve', fixture.reviewer,
      { artifactId: fixture.artifactId, artifactVersionId: fixture.version.id, outcome: 'approve', rationale: 'reviewed', conditions: [] }, 'accept-review', 503);
    const aggregate = await artifactState(db, fixture.artifactId);
    const makeApproval = (actorId, key, requestId, workspaceId = fixture.workspace) => ({
      commandType: 'studio.artifact.approval.resolve', requestId, idempotencyKey: key,
      organizationId: fixture.org, workspaceId, actorId,
      authorizationVersion: fixture.authorizationVersions[actorId],
      expectedAggregateVersion: Number(aggregate.aggregate_version), expectedArtifactVersion: Number(fixture.version.version),
      payload: { artifactId: fixture.artifactId, artifactVersionId: fixture.version.id, outcome: 'approve', rationale: 'independent approval', conditions: [] },
    });
    const effects = {
      approvals: ['SELECT count(*) n FROM studio_artifact_approval_resolutions WHERE artifact_id=$1::uuid', [fixture.artifactId]],
      receipts: ["SELECT count(*) n FROM studio_artifact_command_receipts WHERE command_type='studio.artifact.approval.resolve' AND resource_id=$1::uuid", [fixture.artifactId]],
      audits: ["SELECT count(*) n FROM privileged_audit_events WHERE action='studio.artifact.approval.resolve' AND resource_id=$1::uuid", [fixture.artifactId]],
    };
    markPhase('separation-of-duty-denials');
    const denialBefore = await tenantPairFingerprint(db, fixture.org, fixture.workspace);
    const authorDenied = await expectFailure(() => governedClaim(db, makeApproval(fixture.requester, 'accept-approve-author-denied', uuid(504))), /STUDIO_SEPARATION_OF_DUTY/u);
    const reviewerDenied = await expectFailure(() => governedClaim(db, makeApproval(fixture.reviewer, 'accept-approve-reviewer-denied', uuid(505))), /STUDIO_SEPARATION_OF_DUTY/u);
    const foreignTenantDenied = await expectFailure(() => governedClaim(db, { ...makeApproval(fixture.approver, 'accept-approve-foreign', uuid(506)), organizationId: foreignOrg, workspaceId: foreignWorkspace }), /PR1B_|RESOURCE_NOT_AVAILABLE|AUTHORIZATION/u);
    const denialAfter = await tenantPairFingerprint(db, fixture.org, fixture.workspace);
    const deniedEffectDelta = exactZeroEffect(denialBefore, denialAfter);
    markPhase('independent-approval');
    const command = makeApproval(fixture.approver, 'accept-approve', uuid(507));
    const before = await snapshot(db, effects);
    const approved = await governedClaim(db, command);
    const after = await snapshot(db, effects);
    markPhase('exact-replay');
    const replayBefore = await scopedStudioFingerprint(db, fixture.org, fixture.workspace);
    const replay = await governedClaim(db, command);
    const replayAfter = await scopedStudioFingerprint(db, fixture.org, fixture.workspace);
    const approval = await row(db,
      'SELECT artifact_id,artifact_version_id,org_id,workspace_id,approver_id,outcome FROM studio_artifact_approval_resolutions WHERE artifact_id=$1::uuid',
      [fixture.artifactId],
    );
    const finalAggregate = await artifactState(db, fixture.artifactId);
    const audit = await row(db,
      "SELECT org_id,workspace_id,resource_id FROM privileged_audit_events WHERE action='studio.artifact.approval.resolve' AND resource_id=$1::uuid",
      [fixture.artifactId],
    );
    assert.equal(approved.outcome, 'committed');
    assert.equal(replay.outcome, 'replayed');
    const lineageBound = JSON.stringify([approval.artifact_id, approval.artifact_version_id, approval.org_id, approval.workspace_id])
      === JSON.stringify([fixture.artifactId, fixture.version.id, fixture.org, fixture.workspace]);
    assert.equal(lineageBound, true);
    assert.deepEqual([audit.org_id, audit.workspace_id, audit.resource_id], [fixture.org, fixture.workspace, fixture.artifactId]);
    return {
      logicalMutationCount: after.approvals - before.approvals,
      approvalDelta: after.approvals - before.approvals,
      receiptDelta: after.receipts - before.receipts,
      auditDelta: after.audits - before.audits,
      authorDenied,
      reviewerDenied,
      independentApprover: approval.approver_id === fixture.approver,
      currentApprovedBound: finalAggregate.current_approved_version_id === fixture.version.id && approval.outcome === 'approved',
      exactReplay: replay.outcome === 'replayed',
      replayEffectDelta: exactZeroEffect(replayBefore, replayAfter),
      foreignTenantDenied,
      deniedEffectDelta,
      lineageBound,
    };
  });

  await runCase('STUDIO-006', async () => {
    const fixture = await createApprovedStudioFixture(db);
    markPhase('foreign-tenant-denial');
    const input = privateInput(fixture, 'studio.rendition.generate', {
      artifactVersionId: fixture.artifactVersionId, format: 'markdown',
    }, 'accept-private-render', 601);
    const effects = {
      attempts: ['SELECT count(*) n FROM studio_rendition_attempts WHERE artifact_version_id=$1::uuid', [fixture.artifactVersionId]],
      renditions: ['SELECT count(*) n FROM studio_renditions WHERE artifact_version_id=$1::uuid', [fixture.artifactVersionId]],
      receipts: ["SELECT count(*) n FROM studio_private_artifact_command_receipts WHERE command_type='studio.rendition.generate' AND org_id=$1::uuid AND workspace_id=$2::uuid", [fixture.org, fixture.workspace]],
      audits: ['SELECT count(*) n FROM privileged_audit_events WHERE request_id=$1::uuid', [input.requestId]],
    };
    const denialBefore = await tenantPairFingerprint(db, fixture.org, fixture.workspace);
    const foreignTenantDenied = await expectFailure(() => privateClaim(db, { ...input, requestId: uuid(602), idempotencyKey: 'accept-private-render-foreign', organizationId: foreignOrg, workspaceId: foreignWorkspace }), /PR1B_|RESOURCE_NOT_AVAILABLE|AUTHORIZATION/u);
    const denialAfter = await tenantPairFingerprint(db, fixture.org, fixture.workspace);
    const deniedEffectDelta = exactZeroEffect(denialBefore, denialAfter);
    markPhase('rendition-command');
    const before = await snapshot(db, effects);
    const generation = await privateClaim(db, input);
    const claim = generation.result.renditionClaim;
    const bytes = Buffer.from('synthetic Studio private rendition', 'utf8');
    const metadata = {
      objectKey: `${fixture.org}/${fixture.workspace}/studio-artifacts/${claim.opaqueObjectId}.md`,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      byteLength: bytes.byteLength,
      mimeType: 'text/markdown; charset=utf-8',
      filename: 'studio-acceptance.md',
    };
    const fakeStorage = new Map();
    let fakeStorageUploadCount = 0;
    await callPrivateLifecycle(db, 'SELECT public.studio_rendition_attempt_start($1::uuid) result', [claim.attemptId]);
    markPhase('invalid-metadata-denial');
    const invalidMetadataBefore = await scopedStudioFingerprint(db, fixture.org, fixture.workspace);
    const invalidMetadataDenied = await expectFailure(() => callPrivateLifecycle(db,
      'SELECT public.studio_rendition_attempt_rendered($1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text,$7::text,$8::text,$9::text) result',
      [claim.attemptId, `${metadata.objectKey}.wrong`, metadata.sha256, metadata.byteLength, metadata.mimeType,
        metadata.filename, claim.rendererVersion, claim.templateVersion, claim.contentSchemaVersion]), /INVALID_RENDITION_METADATA/u);
    const invalidMetadataAfter = await scopedStudioFingerprint(db, fixture.org, fixture.workspace);
    exactZeroEffect(invalidMetadataBefore, invalidMetadataAfter);
    markPhase('fake-storage-upload');
    fakeStorage.set(metadata.objectKey, bytes);
    fakeStorageUploadCount += 1;
    await callPrivateLifecycle(db,
      'SELECT public.studio_rendition_attempt_rendered($1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text,$7::text,$8::text,$9::text) result',
      [claim.attemptId, metadata.objectKey, metadata.sha256, metadata.byteLength, metadata.mimeType,
        metadata.filename, claim.rendererVersion, claim.templateVersion, claim.contentSchemaVersion]);
    const completion = await callPrivateLifecycle(db,
      'SELECT public.studio_rendition_attempt_complete($1::uuid) result', [claim.attemptId]);
    const after = await snapshot(db, effects);
    markPhase('exact-replay');
    const replayBefore = await scopedStudioFingerprint(db, fixture.org, fixture.workspace);
    const replay = await privateClaim(db, generation.command);
    const replayAfter = await scopedStudioFingerprint(db, fixture.org, fixture.workspace);
    const rendition = await row(db, 'SELECT * FROM studio_renditions WHERE id=$1::uuid', [completion.renditionId]);
    const projection = (await authenticatedCall(db, fixture.requester, () => db.query(
      'SELECT public.studio_private_artifact_projection($1::uuid,$2::uuid,$3::uuid) value',
      [fixture.org, fixture.workspace, fixture.artifactVersionId],
    ))).rows[0].value;
    assert.ok(projection);
    const serializedProjection = JSON.stringify(projection);
    const metadataBound = rendition.object_key === metadata.objectKey
      && rendition.content_hash === metadata.sha256
      && Number(rendition.byte_length) === metadata.byteLength
      && rendition.mime_type === metadata.mimeType
      && rendition.safe_filename === metadata.filename
      && rendition.renderer_version === claim.rendererVersion
      && rendition.template_version === claim.templateVersion
      && rendition.content_schema_version === claim.contentSchemaVersion
      && rendition.lifecycle === 'available';
    assert.equal(generation.result.outcome, 'committed');
    assert.equal(completion.outcome, 'committed');
    assert.equal(replay.result.outcome, 'replayed');
    assert.equal('renditionClaim' in replay.result, false);
    assert.equal(metadataBound, true);
    const privateProjectionRedacted = ![metadata.objectKey, 'studio-private-artifacts', 'signedUrl']
      .some(value => serializedProjection.includes(value));
    assert.equal(privateProjectionRedacted, true);
    const lineageBound = JSON.stringify([rendition.org_id, rendition.workspace_id, rendition.artifact_id, rendition.artifact_version_id])
      === JSON.stringify([fixture.org, fixture.workspace, fixture.artifactId, fixture.artifactVersionId]);
    assert.equal(lineageBound, true);
    return {
      logicalMutationCount: after.renditions - before.renditions,
      renditionDelta: after.renditions - before.renditions,
      attemptDelta: after.attempts - before.attempts,
      receiptDelta: after.receipts - before.receipts,
      auditDelta: after.audits - before.audits,
      exactMetadataBound: metadataBound,
      invalidMetadataDenied,
      privateProjectionRedacted,
      exactReplay: replay.result.outcome === 'replayed',
      replayEffectDelta: exactZeroEffect(replayBefore, replayAfter),
      foreignTenantDenied,
      deniedEffectDelta,
      lineageBound,
      fakeStorageUploadCount,
      fakeStorageObjectCount: fakeStorage.size,
      hostedStorageNotRun: true,
    };
  });

  await runCase('STUDIO-008', async () => {
    const prepared = await prepareRendition(db, { retentionDays: 30, ordinal: 800 });
    markPhase('foreign-tenant-denial');
    const input = privateInput(prepared.fixture, 'studio.rendition.retention.extend', {
      renditionId: prepared.rendition.id,
      extendUntil: new Date(Date.now() + 60 * 86_400_000).toISOString(),
      indefinite: false,
      rationale: 'extend disposable Studio retention',
    }, 'accept-retention-extend', 810);
    const effects = {
      extensions: ['SELECT count(*) n FROM studio_rendition_retention_extensions WHERE rendition_id=$1::uuid', [prepared.rendition.id]],
      receipts: ["SELECT count(*) n FROM studio_private_artifact_command_receipts WHERE command_type='studio.rendition.retention.extend' AND resource_id IN (SELECT id FROM studio_rendition_retention_extensions WHERE rendition_id=$1::uuid)", [prepared.rendition.id]],
      audits: ["SELECT count(*) n FROM privileged_audit_events WHERE action='studio.rendition.retention.extend' AND metadata->>'receiptId' IN (SELECT id::text FROM studio_private_artifact_command_receipts WHERE command_type='studio.rendition.retention.extend')", []],
    };
    const denialBefore = await tenantPairFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
    const foreignTenantDenied = await expectFailure(() => privateClaim(db, { ...input, requestId: uuid(811), idempotencyKey: 'accept-retention-foreign', organizationId: foreignOrg, workspaceId: foreignWorkspace }), /PR1B_|RESOURCE_NOT_AVAILABLE|AUTHORIZATION/u);
    const denialAfter = await tenantPairFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
    const deniedEffectDelta = exactZeroEffect(denialBefore, denialAfter);
    const priorRetention = (await db.query('SELECT public.studio_effective_retention($1::uuid) value', [prepared.rendition.id])).rows[0].value;
    const before = await snapshot(db, effects);
    markPhase('retention-extension');
    const extension = await privateClaim(db, input);
    const after = await snapshot(db, effects);
    const shortened = { ...input, requestId: uuid(812), idempotencyKey: 'accept-retention-shorten', payload: {
      ...input.payload, extendUntil: new Date(Date.now() + 1 * 86_400_000).toISOString(), rationale: 'must be denied',
    } };
    markPhase('shortening-denial');
    const shorteningBefore = await scopedStudioFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
    const shorteningDenied = await expectFailure(() => privateClaim(db, shortened), /RETENTION_CANNOT_SHORTEN/u);
    const shorteningAfter = await scopedStudioFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
    exactZeroEffect(shorteningBefore, shorteningAfter);
    markPhase('exact-replay');
    const replayBefore = await scopedStudioFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
    const replay = await privateClaim(db, extension.command);
    const replayAfter = await scopedStudioFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
    const effective = (await db.query('SELECT public.studio_effective_retention($1::uuid) value', [prepared.rendition.id])).rows[0].value;
    const extensionRow = await row(db,
      'SELECT rendition_id,org_id,workspace_id FROM studio_rendition_retention_extensions WHERE rendition_id=$1::uuid',
      [prepared.rendition.id],
    );
    assert.equal(extension.result.outcome, 'committed');
    assert.equal(replay.result.outcome, 'replayed');
    const retentionExtended = new Date(effective.retentionUntil) > new Date(priorRetention.retentionUntil);
    assert.equal(retentionExtended, true);
    const lineageBound = JSON.stringify([extensionRow.rendition_id, extensionRow.org_id, extensionRow.workspace_id])
      === JSON.stringify([prepared.rendition.id, prepared.fixture.org, prepared.fixture.workspace]);
    assert.equal(lineageBound, true);
    return {
      logicalMutationCount: after.extensions - before.extensions,
      extensionDelta: after.extensions - before.extensions,
      receiptDelta: after.receipts - before.receipts,
      auditDelta: after.audits - before.audits,
      retentionExtended,
      shorteningDenied,
      exactReplay: replay.result.outcome === 'replayed',
      replayEffectDelta: exactZeroEffect(replayBefore, replayAfter),
      foreignTenantDenied,
      deniedEffectDelta,
      lineageBound,
    };
  });

  await runCase('STUDIO-009', async () => {
    const prepared = await prepareRendition(db, { retentionDays: 0, ordinal: 900 });
    markPhase('foreign-tenant-denial');
    const input = privateInput(prepared.fixture, 'studio.legal_hold.place', {
      renditionId: prepared.rendition.id, rationale: 'disposable Studio acceptance legal hold',
    }, 'accept-hold-place', 910);
    const effects = {
      holds: ["SELECT count(*) n FROM studio_rendition_legal_hold_events WHERE rendition_id=$1::uuid AND event_type='placed'", [prepared.rendition.id]],
      receipts: ["SELECT count(*) n FROM studio_private_artifact_command_receipts WHERE command_type='studio.legal_hold.place' AND resource_id IN (SELECT hold_id FROM studio_rendition_legal_hold_events WHERE rendition_id=$1::uuid)", [prepared.rendition.id]],
      audits: ["SELECT count(*) n FROM privileged_audit_events WHERE action='studio.legal_hold.place' AND resource_id IN (SELECT hold_id FROM studio_rendition_legal_hold_events WHERE rendition_id=$1::uuid)", [prepared.rendition.id]],
    };
    const denialBefore = await tenantPairFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
    const foreignTenantDenied = await expectFailure(() => privateClaim(db, { ...input, requestId: uuid(911), idempotencyKey: 'accept-hold-foreign', organizationId: foreignOrg, workspaceId: foreignWorkspace }), /PR1B_|RESOURCE_NOT_AVAILABLE|AUTHORIZATION/u);
    const denialAfter = await tenantPairFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
    const deniedEffectDelta = exactZeroEffect(denialBefore, denialAfter);
    markPhase('legal-hold');
    const before = await snapshot(db, effects);
    const hold = await privateClaim(db, input);
    const after = await snapshot(db, effects);
    markPhase('exact-replay');
    const replayBefore = await scopedStudioFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
    const replay = await privateClaim(db, hold.command);
    const replayAfter = await scopedStudioFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
    let deletionDenied = false;
    markPhase('held-deletion-denial');
    await isolatedProbe(db, async () => {
      const deletionRequest = await privateClaim(db, privateInput(prepared.fixture, 'studio.rendition.deletion.request', {
        renditionId: prepared.rendition.id, rationale: 'hold must block deletion approval',
      }, 'accept-hold-delete-request', 912));
      const heldDeletionBefore = await scopedStudioFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
      deletionDenied = await expectFailure(() => privateClaim(db, privateInput(prepared.fixture, 'studio.rendition.deletion.resolve', {
        renditionId: prepared.rendition.id,
        deletionRequestId: deletionRequest.result.resource.deletionRequestId,
        outcome: 'approve', rationale: 'must remain held',
      }, 'accept-hold-delete-approve', 913, prepared.fixture.approver)), /STUDIO_DELETION_BLOCKED/u);
      const heldDeletionAfter = await scopedStudioFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
      exactZeroEffect(heldDeletionBefore, heldDeletionAfter);
    });
    const holdRow = await row(db,
      "SELECT hold_id,rendition_id,org_id,workspace_id FROM studio_rendition_legal_hold_events WHERE rendition_id=$1::uuid AND event_type='placed'",
      [prepared.rendition.id],
    );
    const activeHolds = Number((await db.query('SELECT public.studio_active_hold_count($1::uuid) n', [prepared.rendition.id])).rows[0].n);
    assert.equal(hold.result.outcome, 'committed');
    assert.equal(replay.result.outcome, 'replayed');
    const holdActive = activeHolds === 1;
    assert.equal(holdActive, true);
    const lineageBound = JSON.stringify([holdRow.rendition_id, holdRow.org_id, holdRow.workspace_id])
      === JSON.stringify([prepared.rendition.id, prepared.fixture.org, prepared.fixture.workspace]);
    assert.equal(lineageBound, true);
    return {
      logicalMutationCount: after.holds - before.holds,
      holdEventDelta: after.holds - before.holds,
      receiptDelta: after.receipts - before.receipts,
      auditDelta: after.audits - before.audits,
      holdActive,
      deletionDenied,
      exactReplay: replay.result.outcome === 'replayed',
      replayEffectDelta: exactZeroEffect(replayBefore, replayAfter),
      foreignTenantDenied,
      deniedEffectDelta,
      lineageBound,
    };
  });

  await runCase('STUDIO-010', async () => {
    const prepared = await prepareRendition(db, { retentionDays: 0, ordinal: 1000 });
    markPhase('foreign-tenant-denial');
    const foreignInput = privateInput(prepared.fixture, 'studio.rendition.deletion.request', {
      renditionId: prepared.rendition.id, rationale: 'foreign denial probe',
    }, 'accept-delete-foreign', 1005);
    foreignInput.organizationId = foreignOrg;
    foreignInput.workspaceId = foreignWorkspace;
    const denialBefore = await tenantPairFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
    const foreignTenantDenied = await expectFailure(() => privateClaim(db, foreignInput), /PR1B_|RESOURCE_NOT_AVAILABLE|AUTHORIZATION/u);
    const denialAfter = await tenantPairFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
    const deniedEffectDelta = exactZeroEffect(denialBefore, denialAfter);
    markPhase('setup-deletion-prerequisites');
    const deletion = await prepareDeletionFromExisting(db, prepared, 1010);
    markPhase('deletion-storage-effect');
    let fakeStorageDeleteCount = 0;
    assert.equal(deletion.execution.objectKey, prepared.metadata.objectKey);
    if (prepared.fakeStorage.delete(deletion.execution.objectKey)) fakeStorageDeleteCount += 1;
    const attemptId = deletion.approval.result.deletionClaim.deletionAttemptId;
    const before = {
      completed: await count(db, "SELECT count(*) n FROM studio_rendition_deletion_attempts WHERE id=$1::uuid AND state='completed'", [attemptId]),
      audits: await count(db, "SELECT count(*) n FROM privileged_audit_events WHERE action='studio.rendition.deletion.complete' AND resource_id=$1::uuid", [prepared.rendition.id]),
    };
    markPhase('deletion-completion');
    const completion = await callPrivateLifecycle(db,
      "SELECT public.studio_rendition_deletion_complete($1::uuid,$2::bigint,'deleted') result",
      [attemptId, deletion.execution.fence],
    );
    const after = {
      completed: await count(db, "SELECT count(*) n FROM studio_rendition_deletion_attempts WHERE id=$1::uuid AND state='completed'", [attemptId]),
      audits: await count(db, "SELECT count(*) n FROM privileged_audit_events WHERE action='studio.rendition.deletion.complete' AND resource_id=$1::uuid", [prepared.rendition.id]),
    };
    markPhase('exact-replay');
    const replayBefore = await scopedStudioFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
    const replay = await privateClaim(db, deletion.approval.command);
    const replayAfter = await scopedStudioFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
    const rendition = await row(db,
      'SELECT org_id,workspace_id,artifact_id,artifact_version_id,lifecycle,deleted_at FROM studio_renditions WHERE id=$1::uuid',
      [prepared.rendition.id],
    );
    const audit = await row(db,
      "SELECT org_id,workspace_id,resource_id,metadata FROM privileged_audit_events WHERE action='studio.rendition.deletion.complete' AND resource_id=$1::uuid",
      [prepared.rendition.id],
    );
    assert.equal(completion.outcome, 'committed');
    assert.equal(replay.result.outcome, 'replayed');
    assert.equal('deletionClaim' in replay.result, false);
    assert.equal(audit.metadata.providerOutcome, 'deleted');
    const lineageBound = JSON.stringify([rendition.org_id, rendition.workspace_id, rendition.artifact_id, rendition.artifact_version_id])
      === JSON.stringify([prepared.fixture.org, prepared.fixture.workspace, prepared.fixture.artifactId, prepared.fixture.artifactVersionId]);
    assert.equal(lineageBound, true);
    const lifecycleDeleted = rendition.lifecycle === 'deleted';
    const tombstoneRecorded = rendition.deleted_at instanceof Date;
    return {
      logicalMutationCount: after.completed - before.completed,
      deletionCompletionDelta: after.completed - before.completed,
      auditDelta: after.audits - before.audits,
      lifecycleDeleted,
      tombstoneRecorded,
      exactReplay: replay.result.outcome === 'replayed',
      replayEffectDelta: exactZeroEffect(replayBefore, replayAfter),
      foreignTenantDenied,
      deniedEffectDelta,
      lineageBound,
      fakeStorageDeleteCount,
      fakeStorageObjectCount: prepared.fakeStorage.size,
      hostedStorageNotRun: true,
    };
  });

  await runCase('STUDIO-011', async () => {
    const prepared = await prepareRendition(db, { retentionDays: 0, ordinal: 1100 });
    markPhase('foreign-tenant-denial');
    const foreignInput = privateInput(prepared.fixture, 'studio.rendition.deletion.request', {
      renditionId: prepared.rendition.id, rationale: 'foreign reconciliation denial probe',
    }, 'accept-reconcile-foreign', 1105);
    foreignInput.organizationId = foreignOrg;
    foreignInput.workspaceId = foreignWorkspace;
    const denialBefore = await tenantPairFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
    const foreignTenantDenied = await expectFailure(() => privateClaim(db, foreignInput), /PR1B_|RESOURCE_NOT_AVAILABLE|AUTHORIZATION/u);
    const denialAfter = await tenantPairFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
    const deniedEffectDelta = exactZeroEffect(denialBefore, denialAfter);
    markPhase('setup-deletion-prerequisites');
    const deletion = await prepareDeletionFromExisting(db, prepared, 1110);
    markPhase('unknown-outcome-transition');
    let fakeStorageDeleteCount = 0;
    let fakeStorageProbeCount = 0;
    let fakeStorageRecoveryDeleteCount = 0;
    if (prepared.fakeStorage.delete(deletion.execution.objectKey)) fakeStorageDeleteCount += 1;
    const attemptId = deletion.approval.result.deletionClaim.deletionAttemptId;
    const uncertain = await callPrivateLifecycle(db,
      "SELECT public.studio_rendition_deletion_fail($1::uuid,$2::bigint,'DELETE_OUTCOME_UNKNOWN') result",
      [attemptId, deletion.execution.fence],
    );
    assert.equal(uncertain.state, 'reconciliation_required');
    const due = await callPrivateLifecycle(db,
      'SELECT public.studio_deletion_reconciliation_claim($1::uuid) result', [attemptId],
    );
    assert.ok(due);
    const recovery = await callPrivateLifecycle(db,
      'SELECT public.studio_rendition_deletion_execution_claim($1::uuid) result', [attemptId],
    );
    assert.ok(recovery);
    fakeStorageProbeCount += 1;
    if (prepared.fakeStorage.has(recovery.objectKey)) {
      prepared.fakeStorage.delete(recovery.objectKey);
      fakeStorageRecoveryDeleteCount += 1;
    }
    markPhase('stale-fence-denial');
    const staleBefore = await scopedStudioFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
    const staleFenceDenied = await expectFailure(() => callPrivateLifecycle(db,
      "SELECT public.studio_rendition_deletion_complete($1::uuid,$2::bigint,'missing') result",
      [attemptId, recovery.fence - 1],
    ), /AUTHORITY_STALE/u);
    const staleAfter = await scopedStudioFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
    exactZeroEffect(staleBefore, staleAfter);
    const before = {
      completed: await count(db, "SELECT count(*) n FROM studio_rendition_deletion_attempts WHERE id=$1::uuid AND state='completed'", [attemptId]),
      audits: await count(db, "SELECT count(*) n FROM privileged_audit_events WHERE action='studio.rendition.deletion.complete' AND resource_id=$1::uuid", [prepared.rendition.id]),
    };
    markPhase('reconciliation-completion');
    const completion = await callPrivateLifecycle(db,
      "SELECT public.studio_rendition_deletion_complete($1::uuid,$2::bigint,'missing') result",
      [attemptId, recovery.fence],
    );
    const after = {
      completed: await count(db, "SELECT count(*) n FROM studio_rendition_deletion_attempts WHERE id=$1::uuid AND state='completed'", [attemptId]),
      audits: await count(db, "SELECT count(*) n FROM privileged_audit_events WHERE action='studio.rendition.deletion.complete' AND resource_id=$1::uuid", [prepared.rendition.id]),
    };
    markPhase('terminal-replay-denial');
    const replayBefore = await scopedStudioFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
    const terminalReplayDenied = await expectFailure(() => callPrivateLifecycle(db,
      "SELECT public.studio_rendition_deletion_complete($1::uuid,$2::bigint,'missing') result",
      [attemptId, recovery.fence],
    ), /AUTHORITY_STALE/u);
    const replayAfter = await scopedStudioFingerprint(db, prepared.fixture.org, prepared.fixture.workspace);
    const rendition = await row(db,
      'SELECT org_id,workspace_id,artifact_id,artifact_version_id,lifecycle,deleted_at FROM studio_renditions WHERE id=$1::uuid',
      [prepared.rendition.id],
    );
    const audit = await row(db,
      "SELECT metadata FROM privileged_audit_events WHERE action='studio.rendition.deletion.complete' AND resource_id=$1::uuid",
      [prepared.rendition.id],
    );
    assert.equal(completion.outcome, 'committed');
    assert.equal(audit.metadata.providerOutcome, 'missing');
    assert.equal(Number(audit.metadata.executionFence), Number(recovery.fence));
    const lineageBound = JSON.stringify([rendition.org_id, rendition.workspace_id, rendition.artifact_id, rendition.artifact_version_id])
      === JSON.stringify([prepared.fixture.org, prepared.fixture.workspace, prepared.fixture.artifactId, prepared.fixture.artifactVersionId]);
    assert.equal(lineageBound, true);
    const tombstoneRecorded = rendition.lifecycle === 'deleted' && rendition.deleted_at instanceof Date;
    return {
      logicalMutationCount: after.completed - before.completed,
      reconciliationCompletionDelta: after.completed - before.completed,
      auditDelta: after.audits - before.audits,
      unknownOutcomeRequired: uncertain.state === 'reconciliation_required',
      currentFenceAccepted: completion.outcome === 'committed',
      staleFenceDenied,
      terminalReplayDenied,
      replayEffectDelta: exactZeroEffect(replayBefore, replayAfter),
      foreignTenantDenied,
      deniedEffectDelta,
      lineageBound,
      tombstoneRecorded,
      fakeStorageDeleteCount,
      fakeStorageProbeCount,
      fakeStorageRecoveryDeleteCount,
      hostedStorageNotRun: true,
    };
  });
} catch {
  setupFailurePhase = String(activeCasePhase).startsWith('setup-')
    ? activeCasePhase
    : 'setup-foundation';
  console.error(`BLOCKED studio acceptance phase=${setupFailurePhase} setup_failed`);
} finally {
  if (db) {
    try { await db.end(); } catch { cleanupErrors.push('database-client-close'); }
  }
  if (admin && databaseCreated) {
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      if ((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName])).rowCount) cleanupErrors.push('database-drop-verification');
    } catch { cleanupErrors.push('database-drop'); }
  }
  if (admin) {
    for (const roleName of createdRoles.reverse()) {
      try {
        await admin.query(`DROP ROLE IF EXISTS ${roleName}`);
        if ((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [roleName])).rowCount) cleanupErrors.push(`role-drop-verification:${roleName}`);
      } catch { cleanupErrors.push(`role-drop:${roleName}`); }
    }
    try { await admin.end(); } catch { cleanupErrors.push('admin-client-close'); }
  }
}

if (cleanupErrors.length) throw new Error(`STUDIO_ACCEPTANCE_CLEANUP_FAILED:${cleanupErrors.join(',')}`);
if (setupFailurePhase) {
  Object.assign(blockedByTestId, completeStudioAcceptanceSetupBlocked({
    actualByTestId,
    failuresByTestId,
    blockedByTestId,
  }));
}
const retainedResultPath = process.env.RETAINED_TEST_ID_RESULTS;
const finalization = finalizeStudioAcceptanceExecution({
  actualByTestId,
  failuresByTestId,
  blockedByTestId,
  retainedResultPath,
});
if (retainedResultPath) {
  writeStudioAcceptanceProducer(retainedResultPath, {
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
if (finalization.shouldFailProcess) throw new Error('STUDIO_ACCEPTANCE_STANDALONE_INCOMPLETE');
console.log(`Studio lifecycle PostgreSQL acceptance completed: ${finalization.counts.passed} passed, ${finalization.counts.failed} failed, ${finalization.counts.blocked} blocked; hosted storage not run.`);

async function prepareDeletionFromExisting(client, prepared, ordinal) {
  const requestInput = privateInput(prepared.fixture, 'studio.rendition.deletion.request', {
    renditionId: prepared.rendition.id,
    rationale: 'disposable Studio acceptance deletion',
  }, `accept-delete-request-${ordinal}`, ordinal);
  const request = await privateClaim(client, requestInput);
  const approvalInput = privateInput(prepared.fixture, 'studio.rendition.deletion.resolve', {
    renditionId: prepared.rendition.id,
    deletionRequestId: request.result.resource.deletionRequestId,
    outcome: 'approve',
    rationale: 'independent disposable Studio acceptance approval',
  }, `accept-delete-approve-${ordinal}`, ordinal + 1, prepared.fixture.approver);
  const approval = await privateClaim(client, approvalInput);
  assert.ok(approval.result.deletionClaim);
  const execution = await callPrivateLifecycle(client,
    'SELECT public.studio_rendition_deletion_execution_claim($1::uuid) result',
    [approval.result.deletionClaim.deletionAttemptId],
  );
  assert.ok(execution);
  return { requestInput, request, approvalInput, approval, execution };
}
