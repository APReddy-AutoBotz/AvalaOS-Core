import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  createLegacyDeliveryPostgresFixture,
  LEGACY_DELIVERY_AUTHORITY_MIGRATION,
  LEGACY_DELIVERY_FIXTURE_IDS,
  LEGACY_DELIVERY_FIXTURE_VERSION,
} from './legacyDeliveryPostgresFixture.mjs';
import {
  LEGACY_DELIVERY_ACCEPTANCE_TEST_IDS,
  classifyLegacyDeliveryAcceptanceCaseFailure,
  completeLegacyDeliveryAcceptanceSetupBlocked,
  finalizeLegacyDeliveryAcceptanceExecution,
  writeLegacyDeliveryAcceptanceProducer,
} from './legacyDeliveryAcceptanceEvidence.mjs';

const migrationPath = `supabase/migrations/${LEGACY_DELIVERY_AUTHORITY_MIGRATION}`;
const delta = (after, before, key) => Number(after[key]) - Number(before[key]);
const exactReplay = (left, right) => JSON.stringify(left) === JSON.stringify(right);

async function applyAuthority(db) {
  const sql = (await readFile(migrationPath, 'utf8')).replaceAll('\r\n', '\n');
  await db.query('BEGIN');
  try { await db.query(sql); await db.query('COMMIT'); }
  catch (error) { await db.query('ROLLBACK'); throw error; }
}

async function seedPredecessor(db, unsafe = false) {
  const x = LEGACY_DELIVERY_FIXTURE_IDS;
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [x.actor]);
  await db.query("INSERT INTO public.profiles(id,email) VALUES($1,'historical-delivery@example.invalid')", [x.actor]);
  await db.query("INSERT INTO public.organizations(id,name,slug) VALUES($1,'Historical Delivery','historical-delivery')", [x.organization]);
  await db.query("INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,'Historical Delivery','historical-delivery')", [x.workspace, x.organization]);
  await db.query("INSERT INTO public.projects(id,org_id,workspace_id,name,owner_id,created_by,updated_by) VALUES($1,$2,$3,'Historical Delivery',$4,$4,$4)", [x.project, x.organization, x.workspace, x.actor]);
  if (unsafe) await db.query('ALTER TABLE public.delivery_work_items ADD COLUMN authority_version bigint');
  await db.query(`INSERT INTO public.delivery_work_items(id,org_id,workspace_id,project_id,title,status,priority,type,source_lineage,metadata${unsafe ? ',authority_version' : ''})
    VALUES($1,$2,$3,$4,'Historical task','To Do','Medium','Task','{}','{}'${unsafe ? ',1' : ''})`,
  ['a2000000-0000-4000-8000-000000000099', x.organization, x.workspace, x.project]);
}

async function verifyUpgradeAndUnsafe(databaseUrl) {
  const predecessor = '20261009162752_govern_immutable_action_authority.sql';
  const upgrade = await createLegacyDeliveryPostgresFixture({ databaseUrl, throughMigration: predecessor, seed: false });
  try {
    await seedPredecessor(upgrade.db, false);
    // Supabase can grant routines explicitly through default privileges; a
    // PUBLIC-only revoke must not accidentally pass this upgrade check.
    await upgrade.db.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role');
    const before = (await upgrade.db.query("SELECT to_jsonb(item) value FROM public.delivery_work_items item WHERE id='a2000000-0000-4000-8000-000000000099'")).rows[0].value;
    await applyAuthority(upgrade.db);
    const routineAcl = (await upgrade.db.query(`SELECT routine.proname,
      has_function_privilege('anon',routine.oid,'EXECUTE') AS anon_execute,
      has_function_privilege('authenticated',routine.oid,'EXECUTE') AS authenticated_execute,
      has_function_privilege('service_role',routine.oid,'EXECUTE') AS service_execute
      FROM pg_proc routine JOIN pg_namespace schema ON schema.oid=routine.pronamespace
      WHERE schema.nspname='public' AND routine.proname LIKE 'legacy_delivery_%'`)).rows;
    assert.ok(routineAcl.length > 2);
    for (const routine of routineAcl) {
      assert.equal(routine.anon_execute, false);
      assert.equal(routine.authenticated_execute, false);
      assert.equal(routine.service_execute, ['legacy_delivery_apply_command', 'legacy_delivery_query'].includes(routine.proname));
    }
    const after = (await upgrade.db.query("SELECT to_jsonb(item)-ARRAY['authority_version','legacy_import_id','source_item_index','source_epic_index','source_epic_title','retention_state','retention_class','retention_reason','deletion_requested_at','deletion_requested_by'] value FROM public.delivery_work_items item WHERE id='a2000000-0000-4000-8000-000000000099'")).rows[0].value;
    for (const key of Object.keys(after)) assert.deepEqual(after[key], before[key], `historical field changed: ${key}`);
    const marker = (await upgrade.db.query('SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton')).rows[0].migration_tip;
    assert.equal(marker, '20261010025331');
    const state = await upgrade.db.query('SELECT count(*)::int n FROM public.legacy_delivery_imports');
    await assert.rejects(applyAuthority(upgrade.db), /LEGACY_DELIVERY_SOURCE_MISMATCH/u);
    assert.equal((await upgrade.db.query('SELECT count(*)::int n FROM public.legacy_delivery_imports')).rows[0].n, state.rows[0].n);
  } finally { await upgrade.close(); }

  const unsafe = await createLegacyDeliveryPostgresFixture({ databaseUrl, throughMigration: predecessor, seed: false });
  try {
    await seedPredecessor(unsafe.db, true);
    await assert.rejects(applyAuthority(unsafe.db), /LEGACY_DELIVERY_UNSAFE_HISTORICAL_AUTHORITY/u);
    assert.equal((await unsafe.db.query("SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton")).rows[0].migration_tip, '20261009162752');
    assert.equal((await unsafe.db.query("SELECT to_regclass('public.legacy_delivery_imports') value")).rows[0].value, null);
  } finally { await unsafe.close(); }
  return true;
}

export async function runLegacyDeliveryAuthorityPostgres(options = {}) {
  const fixture = await createLegacyDeliveryPostgresFixture({ databaseUrl: options.databaseUrl });
  const x = fixture.ids;
  let case007; let case008;
  let primaryCleanupVerified = false;
  try {
    assert.equal(fixture.version, LEGACY_DELIVERY_FIXTURE_VERSION);
    assert.equal((await fixture.db.query('SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton')).rows[0].migration_tip, '20261010025331');
    assert.equal((await fixture.db.query('SELECT count(*)::int n FROM public.legacy_delivery_workspace_controls')).rows[0].n, 0);
    const disabled = await fixture.callCommand({ key: 'disabled-import-0001', action: 'import', payload: {
      projectId: x.project, sourceGenerationId: x.generation, expectedSourceDigest: `sha256:${'0'.repeat(64)}`, sourceItemIndices: [0, 1, 2],
    } });
    assert.equal(disabled.errorCode, 'FEATURE_DISABLED');
    assert.deepEqual(await fixture.snapshot(), { tasks: 0, imports: 0, receipts: 0, audits: 0 });
    await fixture.db.query('INSERT INTO public.legacy_delivery_workspace_controls(org_id,workspace_id,writes_enabled) VALUES($1,$2,true)', [x.organization, x.workspace]);

    const source = await fixture.callQuery({ sourceGenerationId: x.generation });
    assert.equal(source.ok, true, JSON.stringify(source)); assert.match(source.source.digest, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(source.source.items[0].sourceIndex, 0);
    const sourceMismatchBefore = await fixture.snapshot();
    const sourceMismatch = await fixture.callCommand({ key: 'source-project-mismatch', action: 'import', payload: {
      projectId: x.foreignProject, sourceGenerationId: x.generation, expectedSourceDigest: source.source.digest, sourceItemIndices: [1],
    } });
    assert.equal(sourceMismatch.errorCode, 'NOT_FOUND');
    assert.deepEqual(await fixture.snapshot(), sourceMismatchBefore);
    await fixture.db.query("UPDATE public.document_generations SET artifacts=jsonb_set(artifacts,'{workItems,2,acceptanceCriteria}','[false]'::jsonb) WHERE id=$1", [x.generation]);
    const malformedDigest = (await fixture.db.query('SELECT public.legacy_delivery_sha256_jsonb(artifacts) digest FROM public.document_generations WHERE id=$1', [x.generation])).rows[0].digest;
    const malformedBefore = await fixture.snapshot();
    const malformed = await fixture.callCommand({ key: 'malformed-later-item', action: 'import', payload: {
      projectId: x.project, sourceGenerationId: x.generation, expectedSourceDigest: malformedDigest, sourceItemIndices: [1, 2],
    } });
    assert.equal(malformed.errorCode, 'INVALID_COMMAND');
    assert.deepEqual(await fixture.snapshot(), malformedBefore);
    await fixture.db.query('UPDATE public.document_generations SET artifacts=$1::jsonb WHERE id=$2', [JSON.stringify(fixture.artifacts), x.generation]);
    const requestId = randomUUID();
    const importPayload = { projectId: x.project, sourceGenerationId: x.generation,
      expectedSourceDigest: source.source.digest, sourceItemIndices: [0, 1, 2] };
    const before = await fixture.snapshot();
    const imported = await fixture.callCommand({ requestId, key: 'import-source-0001', action: 'import', payload: importPayload });
    assert.equal(imported.ok, true, JSON.stringify(imported)); assert.equal(imported.resource.itemCount, 2);
    const after = await fixture.snapshot();
    const replayBefore = await fixture.snapshot();
    const replay = await fixture.callCommand({ requestId, key: 'import-source-0001', action: 'import', payload: importPayload });
    const replayAfter = await fixture.snapshot();
    const duplicateBefore = await fixture.snapshot();
    const duplicate = await fixture.callCommand({ key: 'import-source-0002', action: 'import', payload: importPayload });
    const duplicateAfter = await fixture.snapshot();
    const conflict = await fixture.callCommand({ requestId, key: 'import-source-0001', action: 'import', payload: { ...importPayload, sourceItemIndices: [1, 2] } });
    await fixture.db.query("UPDATE public.document_generations SET artifacts=jsonb_set(artifacts,'{workItems,2,title}','\"Drifted title\"') WHERE id=$1", [x.generation]);
    const drift = await fixture.callCommand({ key: 'import-source-drift', action: 'import', payload: importPayload });
    const changedDigest = (await fixture.db.query('SELECT public.legacy_delivery_sha256_jsonb(artifacts) digest FROM public.document_generations WHERE id=$1', [x.generation])).rows[0].digest;
    const overlapBefore = await fixture.snapshot();
    const overlap = await fixture.callCommand({ key: 'import-overlap-after-drift', action: 'import', payload: {
      ...importPayload, expectedSourceDigest: changedDigest, sourceItemIndices: [2],
    } });
    assert.equal(overlap.errorCode, 'DUPLICATE_IMPORT');
    assert.deepEqual(await fixture.snapshot(), overlapBefore);
    await fixture.db.query('UPDATE public.document_generations SET artifacts=$1::jsonb WHERE id=$2', [JSON.stringify(fixture.artifacts), x.generation]);
    const deniedBefore = await fixture.snapshot();
    const foreign = await fixture.callCommand({ actor: x.denied, version: 1, key: 'foreign-import-0001', action: 'import', payload: importPayload });
    await assert.rejects(fixture.asRole('authenticated', () => fixture.db.query(`SELECT public.legacy_delivery_apply_command(
      $1,$2,$3,1,$4,'browser-denied','import',$5::jsonb)`, [x.actor, x.organization, x.workspace, randomUUID(), JSON.stringify(importPayload)])), /permission denied/u);
    const deniedAfter = await fixture.snapshot();
    assert.equal(foreign.errorCode, 'NOT_FOUND');
    assert.equal(duplicate.errorCode, 'DUPLICATE_IMPORT'); assert.equal(conflict.errorCode, 'IDEMPOTENCY_CONFLICT');
    assert.equal(drift.errorCode, 'SOURCE_CHANGED');
    assert.equal(await fixture.db.query('SELECT count(*) FROM public.delivery_work_items WHERE authority_version IS NOT NULL').then(r => Number(r.rows[0].count)), 2);
    const browserVisible = await fixture.asRole('authenticated', async () => {
      await fixture.db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [x.actor]);
      return Number((await fixture.db.query('SELECT count(*) n FROM public.delivery_work_items WHERE authority_version IS NOT NULL')).rows[0].n);
    });
    assert.equal(browserVisible, 0, 'direct SELECT cannot bypass the capability-checked task query');
    assert.equal(imported.resource.items.every(item => item.sourceLineage?.documentSourceDigest === source.source.digest), true);
    case007 = {
      logicalMutationCount: delta(after, before, 'imports'), itemDelta: delta(after, before, 'tasks'), importDelta: delta(after, before, 'imports'),
      receiptDelta: delta(after, before, 'receipts'), auditDelta: delta(after, before, 'audits'),
      exactReplay: exactReplay(imported, replay), replayEffectDelta: Object.keys(replayAfter).reduce((n, key) => n + Math.abs(delta(replayAfter, replayBefore, key)), 0),
      freshKeyDuplicateDenied: duplicate.errorCode === 'DUPLICATE_IMPORT',
      duplicateEffectDelta: Object.keys(duplicateAfter).reduce((n, key) => n + Math.abs(delta(duplicateAfter, duplicateBefore, key)), 0),
      changedPayloadConflict: conflict.errorCode === 'IDEMPOTENCY_CONFLICT', sourceDriftDenied: drift.errorCode === 'SOURCE_CHANGED',
      serverLineageBound: imported.resource.items.every(item => item.sourceLineage?.schemaVersion === 'legacy-delivery-lineage.v1'),
      foreignTenantDenied: foreign.errorCode === 'NOT_FOUND', nonServiceDenied: true,
      deniedEffectDelta: Object.keys(deniedAfter).reduce((n, key) => n + Math.abs(delta(deniedAfter, deniedBefore, key)), 0),
    };

    const retainedId = imported.resource.items[0].id;
    const retainedBefore = await fixture.snapshot();
    const lineageBefore = (await fixture.callQuery({})).items.find(item => item.id === retainedId).sourceLineage;
    const deleted = await fixture.callCommand({ key: 'retain-imported-0001', action: 'task.delete', payload: {
      taskId: retainedId, expectedVersion: 1, deletionReason: 'Acceptance retention verification',
    } });
    const retainedAfter = await fixture.snapshot();
    assert.equal(deleted.resource.retentionState, 'retained'); assert.equal(deleted.resource.retentionClass, 'lineage');
    const countBeforeHardDelete = Number((await fixture.db.query('SELECT count(*) n FROM public.delivery_work_items WHERE id=$1', [retainedId])).rows[0].n);
    await assert.rejects(fixture.db.query('DELETE FROM public.delivery_work_items WHERE id=$1', [retainedId]), /LEGACY_DELIVERY_PHYSICAL_DELETE_DENIED/u);
    const countAfterHardDelete = Number((await fixture.db.query('SELECT count(*) n FROM public.delivery_work_items WHERE id=$1', [retainedId])).rows[0].n);
    const retainedQuery = await fixture.callQuery({ includeRetained: true });
    const lineageAfter = retainedQuery.items.find(item => item.id === retainedId).sourceLineage;
    const denialBeforeDelete = await fixture.snapshot();
    const foreignDelete = await fixture.callCommand({ actor: x.denied, version: 1, key: 'foreign-delete-0001', action: 'task.delete', payload: {
      taskId: retainedId, expectedVersion: 2, deletionReason: 'Foreign attempt',
    } });
    await assert.rejects(fixture.asRole('authenticated', () => fixture.db.query('DELETE FROM public.delivery_work_items WHERE id=$1', [retainedId])), /permission denied/u);
    const denialAfterDelete = await fixture.snapshot();
    case008 = {
      logicalMutationCount: deleted.resource.version - 1, taskDelta: delta(retainedAfter, retainedBefore, 'tasks'), versionDelta: deleted.resource.version - 1,
      retentionTransition: deleted.resource.retentionState === 'retained', receiptDelta: delta(retainedAfter, retainedBefore, 'receipts'),
      auditDelta: delta(retainedAfter, retainedBefore, 'audits'), hardDeleteDenied: true,
      physicalDeleteDelta: countAfterHardDelete - countBeforeHardDelete, lineageUnchanged: exactReplay(lineageBefore, lineageAfter),
      retainedQueryVisible: retainedQuery.items.some(item => item.id === retainedId && item.retentionState === 'retained'),
      foreignTenantDenied: foreignDelete.errorCode === 'NOT_FOUND', nonServiceDenied: true,
      deniedEffectDelta: Object.keys(denialAfterDelete).reduce((n, key) => n + Math.abs(delta(denialAfterDelete, denialBeforeDelete, key)), 0),
    };

    const create = await fixture.callCommand({ key: 'create-task-0001', action: 'task.create', payload: {
      projectId: x.project, task: { title: 'Direct task', description: '', priority: 'Medium', type: 'Task', assigneeIds: [x.ownOnly], dependencyIds: [] },
    } });
    assert.equal(create.ok, true);
    const ownUpdate = await fixture.callCommand({ actor: x.ownOnly, key: 'own-update-0001', action: 'task.update', payload: {
      taskId: create.resource.id, expectedVersion: 1, patch: { description: 'Owned update' },
    } });
    assert.equal(ownUpdate.ok, true);
    const protectedOwn = await fixture.callCommand({ actor: x.ownOnly, key: 'own-update-protected', action: 'task.update', payload: {
      taskId: create.resource.id, expectedVersion: 2, patch: { assigneeIds: [] },
    } });
    assert.equal(protectedOwn.errorCode, 'NOT_FOUND');
    const retainedUpdate = await fixture.callCommand({ key: 'retained-update-0001', action: 'task.update', payload: {
      taskId: retainedId, expectedVersion: 2, patch: { title: 'Must not change' },
    } });
    assert.equal(retainedUpdate.errorCode, 'VERSION_CONFLICT');

    const rollbackBefore = await fixture.snapshot();
    await fixture.db.query(`CREATE FUNCTION public.legacy_delivery_test_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='legacy_delivery.task.create' THEN RAISE EXCEPTION 'forced audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER legacy_delivery_test_audit_fail BEFORE INSERT ON public.privileged_audit_events
      FOR EACH ROW EXECUTE FUNCTION public.legacy_delivery_test_audit_fail()`);
    const rolledBack = await fixture.callCommand({ key: 'audit-rollback-0001', action: 'task.create', payload: {
      projectId: x.project, task: { title: 'Must roll back', description: '', priority: 'Medium', type: 'Task', assigneeIds: [], dependencyIds: [] },
    } });
    await fixture.db.query('DROP TRIGGER legacy_delivery_test_audit_fail ON public.privileged_audit_events; DROP FUNCTION public.legacy_delivery_test_audit_fail()');
    assert.equal(rolledBack.errorCode, 'COMMAND_UNAVAILABLE');
    assert.deepEqual(await fixture.snapshot(), rollbackBefore);

    assert.deepEqual(case007, {
      logicalMutationCount: 1, itemDelta: 2, importDelta: 1, receiptDelta: 1, auditDelta: 1, exactReplay: true,
      replayEffectDelta: 0, freshKeyDuplicateDenied: true, duplicateEffectDelta: 0, changedPayloadConflict: true,
      sourceDriftDenied: true, serverLineageBound: true, foreignTenantDenied: true, nonServiceDenied: true, deniedEffectDelta: 0,
    });
    assert.deepEqual(case008, {
      logicalMutationCount: 1, taskDelta: 0, versionDelta: 1, retentionTransition: true, receiptDelta: 1, auditDelta: 1,
      hardDeleteDenied: true, physicalDeleteDelta: 0, lineageUnchanged: true, retainedQueryVisible: true,
      foreignTenantDenied: true, nonServiceDenied: true, deniedEffectDelta: 0,
    });
  } finally { primaryCleanupVerified = await fixture.close(); }
  const upgradeCleanupVerified = await verifyUpgradeAndUnsafe(options.databaseUrl ?? process.env.LEGACY_DELIVERY_ACCEPTANCE_DATABASE_URL);
  return { fixtureVersion: LEGACY_DELIVERY_FIXTURE_VERSION, migration: LEGACY_DELIVERY_AUTHORITY_MIGRATION,
    cases: { 'DELIVERY-007': case007, 'DELIVERY-008': case008 }, cleanupVerified: primaryCleanupVerified && upgradeCleanupVerified, result: 'passed' };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const retainedResultPath = process.env.RETAINED_TEST_ID_RESULTS;
  const actualByTestId = {};
  const failuresByTestId = {};
  let blockedByTestId = {};
  let cleanupVerified = false;
  let standaloneFailure = false;
  try {
    const executed = await runLegacyDeliveryAuthorityPostgres();
    Object.assign(actualByTestId, executed.cases);
    cleanupVerified = executed.cleanupVerified === true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const classification = classifyLegacyDeliveryAcceptanceCaseFailure(
      message.startsWith('LEGACY_DELIVERY_ACCEPTANCE_SETUP_BLOCKED:') ? 'setup-foundation' : 'assertion-execution',
    );
    if (classification.status === 'BLOCKED') {
      blockedByTestId = completeLegacyDeliveryAcceptanceSetupBlocked({ actualByTestId, failuresByTestId, blockedByTestId });
      cleanupVerified = message === 'LEGACY_DELIVERY_ACCEPTANCE_SETUP_BLOCKED:DATABASE_URL_REQUIRED';
    } else {
      for (const testId of LEGACY_DELIVERY_ACCEPTANCE_TEST_IDS) failuresByTestId[testId] = { failureCode: classification.failureCode };
    }
    standaloneFailure = true;
  }
  const finalized = finalizeLegacyDeliveryAcceptanceExecution({ actualByTestId, failuresByTestId, blockedByTestId, retainedResultPath });
  if (retainedResultPath) {
    writeLegacyDeliveryAcceptanceProducer(retainedResultPath, {
      actualByTestId, failuresByTestId, blockedByTestId,
      identity: {
        releaseSha: process.env.RELEASE_SHA,
        workflowRunId: process.env.GITHUB_RUN_ID,
        workflowAttempt: process.env.GITHUB_RUN_ATTEMPT,
        environment: process.env.ACCEPTANCE_EVIDENCE_ENVIRONMENT,
        workflowPath: process.env.ACCEPTANCE_WORKFLOW_PATH,
      },
      command: process.env.RETAINED_SUITE_COMMAND,
      cleanupVerified,
    });
  }
  if (finalized.shouldFailProcess || (standaloneFailure && !retainedResultPath)) {
    console.error('LEGACY_DELIVERY_ACCEPTANCE_FAILED'); process.exitCode = 1;
  } else {
    console.log(`Legacy Delivery PostgreSQL acceptance completed: ${finalized.counts.passed} passed, ${finalized.counts.failed} failed, ${finalized.counts.blocked} blocked; hosted execution not run.`);
  }
}
