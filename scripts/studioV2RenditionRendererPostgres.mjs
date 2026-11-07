import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  applyMigrations,
  bootstrapAuth,
  connect,
  createDatabase,
  dropDatabase,
  ensureClusterRoles,
  migrationNames,
} from './pilotOperationsPostgresSupport.mjs';
import {
  createApprovedStudioFixture,
  downloadCommand,
  privateCommand,
} from './studioPrivateArtifactPostgresFixture.mjs';

const adminUrl = process.env.ENTERPRISE_LIFECYCLE_DATABASE_URL;
if (!adminUrl) throw new Error('ENTERPRISE_LIFECYCLE_DATABASE_URL is required.');
const renderer2Migration = '20261106040803_studio_v2_rendition_renderer.sql';
const renderer3Migration = '20261106210205_studio_sdd_pdf_branch_routing.sql';
const renderer4Migration = '20261107120001_studio_pdf_business_readability.sql';
const renderer2Index = migrationNames.indexOf(renderer2Migration);
const renderer3Index = migrationNames.indexOf(renderer3Migration);
const renderer4Index = migrationNames.indexOf(renderer4Migration);
assert.ok(renderer2Index > 0, 'renderer-2 migration must be in the ordered chain');
assert.ok(renderer3Index > renderer2Index, 'renderer-3 migration must follow renderer-2');
assert.ok(renderer4Index > renderer3Index, 'renderer-4 migration must follow renderer-3');
const databaseName = `studio_v2_renderer_${process.pid}`;
const negativeDatabaseName = `studio_v2_renderer_negative_${process.pid}`;
const exactV2DatabaseNames = ['brd', 'pdd', 'frd'].map(type => `studio_v2_renderer_${type}_${process.pid}`);
const admin = await connect(adminUrl);
let database;
let negativeDatabase;
const exactV2Databases = [];

const finishRendition = async (db, claim, hashCharacter) => {
  const attemptId = claim.attemptId;
  const extension = claim.format === 'markdown' ? 'md' : claim.format;
  const mime = claim.format === 'markdown'
    ? 'text/markdown; charset=utf-8'
    : claim.format === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const objectKey = `${claim.organizationId}/${claim.workspaceId}/studio-artifacts/${claim.opaqueObjectId}.${extension}`;
  await db.query('SELECT public.studio_rendition_attempt_start($1::uuid)', [attemptId]);
  await db.query(
    'SELECT public.studio_rendition_attempt_rendered($1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text,$7::text,$8::text,$9::text)',
    [attemptId, objectKey, hashCharacter.repeat(64), 256, mime,
      `governed-sdd.${extension}`, claim.rendererVersion, claim.templateVersion,
      claim.contentSchemaVersion],
  );
  const result = (await db.query(
    'SELECT public.studio_rendition_attempt_complete($1::uuid) result',
    [attemptId],
  )).rows[0].result;
  assert.equal(result.state, 'available');
  return { renditionId: result.renditionId, objectKey };
};
const reviseAndApproveExactV2 = async (db, fixture) => {
  const current = async () => (await db.query(`SELECT aggregate.aggregate_version,version.id version_id,
      version.version,version.content
    FROM public.studio_artifact_aggregates aggregate
    JOIN public.studio_artifact_versions version ON version.id=aggregate.current_version_id
    WHERE aggregate.id=$1::uuid`, [fixture.artifactId])).rows[0];
  const invoke = async (commandType, actor, payload) => {
    const head = await current();
    const result = (await db.query('SELECT public.studio_artifact_command_claim($1::jsonb) value', [JSON.stringify({
      commandType, requestId: randomUUID(), idempotencyKey: randomUUID(),
      organizationId: fixture.org, workspaceId: fixture.workspace, actorId: actor,
      authorizationVersion: fixture.authorizationVersions[actor],
      expectedAggregateVersion: Number(head.aggregate_version), expectedArtifactVersion: Number(head.version),
      payload: { artifactId: fixture.artifactId,
        ...(commandType === 'studio.artifact.draft.revise' ? {} : { artifactVersionId: head.version_id }), ...payload },
    })])).rows[0].value;
    assert.equal(result.outcome, 'committed', `${commandType}:${JSON.stringify(result)}`);
  };
  const original = await current();
  const manifest = (await db.query(`SELECT package.anchor_manifest
    FROM public.studio_artifact_aggregates aggregate
    JOIN public.studio_artifact_source_packages package ON package.id=aggregate.source_package_id
    WHERE aggregate.id=$1::uuid`, [fixture.artifactId])).rows[0].anchor_manifest;
  const sourceAnchors = manifest.map(anchor => ({
    sourceVersionId: anchor.sourceVersionId, locator: anchor.locator, anchorHash: anchor.anchorHash,
  }));
  const sourceVersionIds = [...new Set(sourceAnchors.map(anchor => anchor.sourceVersionId))];
  const exactV2Content = {
    contractVersion: 'studio-artifact-2', title: 'Exact V2 non-SDD renderer fixture',
    summary: 'Grounded structured content used only to verify server-owned renderer routing.',
    sections: [{ id: 'summary', title: 'Summary', body: 'Grounded exact V2 renderer coverage.',
      sourceAnchors, labels: sourceAnchors.length ? [] : ['human_authored'] }],
    coverage: { selectedSourceVersionIds: sourceVersionIds, coveredSourceVersionIds: sourceVersionIds, complete: true },
  };
  await invoke('studio.artifact.draft.revise', fixture.requester, {
    parentVersionId: original.version_id,
    content: exactV2Content,
  });
  await invoke('studio.artifact.review.submit', fixture.requester, {});
  await invoke('studio.artifact.review.assign', fixture.requester, { reviewerId: fixture.reviewer });
  await invoke('studio.artifact.review.resolve', fixture.reviewer,
    { outcome: 'approve', rationale: 'Exact V2 renderer test review.', conditions: [] });
  await invoke('studio.artifact.approval.resolve', fixture.approver,
    { outcome: 'approve', rationale: 'Exact V2 renderer test approval.', conditions: [] });
  const approved = (await db.query(`SELECT aggregate.current_approved_version_id,version.content
    FROM public.studio_artifact_aggregates aggregate
    JOIN public.studio_artifact_versions version ON version.id=aggregate.current_approved_version_id
    WHERE aggregate.id=$1::uuid`, [fixture.artifactId])).rows[0];
  assert.equal(approved.content.contractVersion, 'studio-artifact-2');
  return approved.current_approved_version_id;
};
const applyThroughRenderer4 = async db => {
  await applyMigrations(db, migrationNames.slice(0, renderer4Index));
  await db.query(`UPDATE public.authenticated_synthetic_exercises
    SET lifecycle='quiesced',quiesced_at=statement_timestamp()
    WHERE lifecycle='active'`);
  await db.query(`UPDATE public.enterprise_intelligence_runtime_control
    SET provider_enabled=false WHERE singleton`);
  await db.query(`UPDATE public.studio_artifact_runtime_control
    SET provider_enabled=false WHERE singleton`);
  await applyMigrations(db, [renderer4Migration]);
  await db.query(`UPDATE public.enterprise_intelligence_runtime_control
    SET provider_enabled=true WHERE singleton`);
  await db.query(`UPDATE public.studio_artifact_runtime_control
    SET provider_enabled=true WHERE singleton`);
};

try {
  await ensureClusterRoles(admin);
  database = await createDatabase(admin, adminUrl, databaseName);
  await bootstrapAuth(database);
  await applyMigrations(database, migrationNames.slice(0, renderer2Index));

  const fixture = await createApprovedStudioFixture(database, 'sdd');
  const command = ordinal => ({
    commandType: 'studio.rendition.generate',
    actorId: fixture.requester,
    organizationId: fixture.org,
    workspaceId: fixture.workspace,
    requestId: `99000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`,
    idempotencyKey: `sdd-pdf-renderer-${ordinal}`,
    authorizationVersion: fixture.authorizationVersions[fixture.requester],
    payload: { artifactVersionId: fixture.artifactVersionId, format: 'pdf' },
  });

  const legacy = await privateCommand(database, command(1));
  assert.equal(legacy.renditionClaim.rendererVersion, 'studio-pdf-1');
  const legacyCompleted = await finishRendition(database, legacy.renditionClaim, 'a');
  const legacyBefore = (await database.query(
    'SELECT id,attempt_id,object_key,content_hash,renderer_version,lifecycle FROM public.studio_renditions WHERE id=$1::uuid',
    [legacyCompleted.renditionId],
  )).rows[0];

  await applyMigrations(database, migrationNames.slice(renderer2Index, renderer3Index));
  const current = await privateCommand(database, command(2));
  assert.equal(current.outcome, 'committed');
  assert.equal(current.renditionClaim.rendererVersion, 'studio-pdf-2');
  assert.equal(current.renditionClaim.contentSchemaVersion, 'studio-artifact-2');
  const currentCompleted = await finishRendition(database, current.renditionClaim, 'b');
  const renderer2Before = (await database.query(
    'SELECT id,attempt_id,object_key,content_hash,renderer_version,lifecycle FROM public.studio_renditions WHERE id=$1::uuid',
    [currentCompleted.renditionId],
  )).rows[0];
  const claimMetadataBefore = (await database.query(`SELECT jsonb_build_object(
      'owner',procedure_row.proowner,'securityDefiner',procedure_row.prosecdef,
      'leakproof',procedure_row.proleakproof,'strict',procedure_row.proisstrict,
      'volatility',procedure_row.provolatile,'parallel',procedure_row.proparallel,
      'config',procedure_row.proconfig,'acl',procedure_row.proacl,'language',procedure_row.prolang,
      'kind',procedure_row.prokind,'returnType',procedure_row.prorettype) metadata
    FROM pg_proc procedure_row
    WHERE procedure_row.oid='public.studio_private_artifact_command_claim(jsonb)'::regprocedure`)).rows[0].metadata;

  await applyMigrations(database, [renderer3Migration]);
  const claimMetadataAfter = (await database.query(`SELECT jsonb_build_object(
      'owner',procedure_row.proowner,'securityDefiner',procedure_row.prosecdef,
      'leakproof',procedure_row.proleakproof,'strict',procedure_row.proisstrict,
      'volatility',procedure_row.provolatile,'parallel',procedure_row.proparallel,
      'config',procedure_row.proconfig,'acl',procedure_row.proacl,'language',procedure_row.prolang,
      'kind',procedure_row.prokind,'returnType',procedure_row.prorettype) metadata
    FROM pg_proc procedure_row
    WHERE procedure_row.oid='public.studio_private_artifact_command_claim(jsonb)'::regprocedure`)).rows[0].metadata;
  assert.deepEqual(claimMetadataAfter, claimMetadataBefore);

  const currentReplay = await privateCommand(database, command(2));
  assert.equal(currentReplay.outcome, 'replayed');
  assert.equal(currentReplay.renditionClaim, undefined);
  const legacyReplay = await privateCommand(database, command(1));
  assert.equal(legacyReplay.outcome, 'replayed');
  assert.equal(legacyReplay.renditionClaim, undefined);

  const branch = await privateCommand(database, command(3));
  assert.equal(branch.outcome, 'committed');
  assert.equal(branch.renditionClaim.rendererVersion, 'studio-pdf-3');
  assert.equal(branch.renditionClaim.artifactType, 'sdd');
  assert.equal(branch.renditionClaim.format, 'pdf');
  assert.equal(branch.renditionClaim.contentSchemaVersion, 'studio-artifact-2');
  await assert.rejects(() => database.query(
    `UPDATE public.studio_artifact_versions
     SET content=jsonb_set(content,'{title}','"mutated"'::jsonb)
     WHERE id=$1::uuid`,
    [fixture.artifactVersionId],
  ), /STUDIO_IMMUTABLE/u);
  await assert.rejects(() => database.query(
    `UPDATE public.studio_artifact_versions
     SET content_schema_version='studio-artifact-1'
     WHERE id=$1::uuid`,
    [fixture.artifactVersionId],
  ), /STUDIO_IMMUTABLE/u);
  await assert.rejects(() => database.query(
    `UPDATE public.studio_artifact_versions
     SET template_id='00000000-0000-4000-8000-000000000001'::uuid
     WHERE id=$1::uuid`,
    [fixture.artifactVersionId],
  ), /STUDIO_IMMUTABLE/u);
  const branchReplay = await privateCommand(database, command(3));
  assert.equal(branchReplay.outcome, 'replayed');
  assert.equal(branchReplay.renditionClaim, undefined);
  const branchCompleted = await finishRendition(database, branch.renditionClaim, 'c');
  const branchTupleBefore = (await database.query(`SELECT id,attempt_id,renderer_version,object_key,content_hash
    FROM public.studio_renditions
    WHERE artifact_version_id=$1::uuid AND format='pdf' AND renderer_version='studio-pdf-3'`,
  [fixture.artifactVersionId])).rows;
  assert.equal(branchTupleBefore.length, 1);
  await assert.rejects(() => privateCommand(database, command(7)), /VERSION_CONFLICT/u);
  const branchTupleAfter = (await database.query(`SELECT id,attempt_id,renderer_version,object_key,content_hash
    FROM public.studio_renditions
    WHERE artifact_version_id=$1::uuid AND format='pdf' AND renderer_version='studio-pdf-3'`,
  [fixture.artifactVersionId])).rows;
  assert.deepEqual(branchTupleAfter, branchTupleBefore);

  const renderer4MetadataBefore = (await database.query(`SELECT jsonb_build_object(
      'owner',procedure_row.proowner,'securityDefiner',procedure_row.prosecdef,
      'leakproof',procedure_row.proleakproof,'strict',procedure_row.proisstrict,
      'volatility',procedure_row.provolatile,'parallel',procedure_row.proparallel,
      'config',procedure_row.proconfig,'acl',procedure_row.proacl,'language',procedure_row.prolang,
      'kind',procedure_row.prokind,'returnType',procedure_row.prorettype) metadata
    FROM pg_proc procedure_row
    WHERE procedure_row.oid='public.studio_private_artifact_command_claim(jsonb)'::regprocedure`)).rows[0].metadata;
  await applyMigrations(database, migrationNames.slice(renderer3Index + 1, renderer4Index));
  await database.query(`UPDATE public.authenticated_synthetic_exercises
    SET lifecycle='quiesced',quiesced_at=statement_timestamp()
    WHERE lifecycle='active'`);
  await database.query(`UPDATE public.enterprise_intelligence_runtime_control
    SET provider_enabled=false WHERE singleton`);
  await database.query(`UPDATE public.studio_artifact_runtime_control
    SET provider_enabled=false WHERE singleton`);
  assert.equal(Number((await database.query(`SELECT count(*) total
    FROM public.authenticated_synthetic_exercises WHERE lifecycle='active'`)).rows[0].total), 0);
  const migrationSafety = (await database.query(`SELECT identity.migration_tip,
      identity.production_authorized,identity.customer_data_authorized,
      identity.real_provider_calls_authorized,
      (SELECT count(*)::int FROM public.synthetic_ai_campaign_authorities WHERE enabled) enabled_campaigns,
      (SELECT provider_enabled FROM public.enterprise_intelligence_runtime_control WHERE singleton) assess_enabled,
      (SELECT provider_enabled FROM public.studio_artifact_runtime_control WHERE singleton) studio_enabled
    FROM public.hosted_pilot_environment_identity identity WHERE singleton`)).rows[0];
  assert.deepEqual(migrationSafety, {
    migration_tip: '20261107110000', production_authorized: false,
    customer_data_authorized: false, real_provider_calls_authorized: false,
    enabled_campaigns: 0, assess_enabled: false, studio_enabled: false,
  });
  await applyMigrations(database, [renderer4Migration]);
  const renderer4MetadataAfter = (await database.query(`SELECT jsonb_build_object(
      'owner',procedure_row.proowner,'securityDefiner',procedure_row.prosecdef,
      'leakproof',procedure_row.proleakproof,'strict',procedure_row.proisstrict,
      'volatility',procedure_row.provolatile,'parallel',procedure_row.proparallel,
      'config',procedure_row.proconfig,'acl',procedure_row.proacl,'language',procedure_row.prolang,
      'kind',procedure_row.prokind,'returnType',procedure_row.prorettype) metadata
    FROM pg_proc procedure_row
    WHERE procedure_row.oid='public.studio_private_artifact_command_claim(jsonb)'::regprocedure`)).rows[0].metadata;
  assert.deepEqual(renderer4MetadataAfter, renderer4MetadataBefore);
  const readable = await privateCommand(database, command(10));
  assert.equal(readable.outcome, 'committed');
  assert.equal(readable.renditionClaim.rendererVersion, 'studio-pdf-4');
  assert.equal(readable.renditionClaim.artifactType, 'sdd');
  const readableCompleted = await finishRendition(database, readable.renditionClaim, 'd');

  const markdown = await privateCommand(database, {
    ...command(4), payload: { artifactVersionId: fixture.artifactVersionId, format: 'markdown' },
  });
  assert.equal(markdown.renditionClaim.rendererVersion, 'studio-markdown-2');
  negativeDatabase = await createDatabase(admin, adminUrl, negativeDatabaseName);
  await bootstrapAuth(negativeDatabase);
  await applyThroughRenderer4(negativeDatabase);
  const brdFixture = await createApprovedStudioFixture(negativeDatabase, 'brd');
  const brdPdf = await privateCommand(negativeDatabase, {
    commandType: 'studio.rendition.generate', actorId: brdFixture.requester,
    organizationId: brdFixture.org, workspaceId: brdFixture.workspace,
    requestId: '99000000-0000-4000-8000-000000000005', idempotencyKey: 'brd-pdf-renderer-5',
    authorizationVersion: brdFixture.authorizationVersions[brdFixture.requester],
    payload: { artifactVersionId: brdFixture.artifactVersionId, format: 'pdf' },
  });
  assert.equal(brdPdf.renditionClaim.rendererVersion, 'studio-pdf-1');
  await assert.rejects(() => privateCommand(database, {
    ...command(6),
    payload: { artifactVersionId: fixture.artifactVersionId, format: 'pdf', rendererVersion: 'studio-pdf-2' },
  }), /INVALID_COMMAND/u);
  await assert.rejects(() => privateCommand(database, {
    ...command(8),
    payload: { artifactVersionId: fixture.artifactVersionId, format: 'pdf', contentSchemaVersion: 'studio-artifact-1' },
  }), /INVALID_COMMAND/u);
  await assert.rejects(() => privateCommand(database, {
    ...command(9),
    payload: { artifactVersionId: fixture.artifactVersionId, format: 'pdf', templateVersion: 'studio-sdd-wrong' },
  }), /INVALID_COMMAND/u);

  const rows = (await database.query(
    `SELECT id,attempt_id,object_key,content_hash,renderer_version,lifecycle
     FROM public.studio_renditions
     WHERE artifact_version_id=$1::uuid AND format='pdf'
     ORDER BY renderer_version`,
    [fixture.artifactVersionId],
  )).rows;
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(row => row.renderer_version), ['studio-pdf-1', 'studio-pdf-2', 'studio-pdf-3', 'studio-pdf-4']);
  assert.deepEqual(rows[0], legacyBefore);
  assert.deepEqual(rows[1], renderer2Before);
  assert.equal(rows[2].id, branchCompleted.renditionId);
  assert.equal(rows[3].id, readableCompleted.renditionId);
  assert.notEqual(rows[0].object_key, rows[1].object_key);
  assert.notEqual(rows[0].content_hash, rows[1].content_hash);
  assert.notEqual(rows[1].object_key, rows[2].object_key);
  assert.notEqual(rows[1].content_hash, rows[2].content_hash);
  assert.notEqual(rows[2].object_key, rows[3].object_key);
  assert.notEqual(rows[2].content_hash, rows[3].content_hash);

  const legacyDownload = await downloadCommand(database, {
    actorId: fixture.requester,
    organizationId: fixture.org,
    workspaceId: fixture.workspace,
    renditionId: legacyCompleted.renditionId,
    requestId: '99000000-0000-4000-8000-000000000003',
    idempotencyKey: 'download-legacy-renderer-1',
    authorizationVersion: fixture.authorizationVersions[fixture.requester],
  });
  assert.equal(legacyDownload.downloadClaim.rendererVersion, undefined);
  assert.equal(legacyDownload.downloadClaim.renditionId, legacyCompleted.renditionId);

  for (const [index, artifactType] of ['brd', 'pdd', 'frd'].entries()) {
    const exactV2Database = await createDatabase(admin, adminUrl, exactV2DatabaseNames[index]);
    exactV2Databases.push(exactV2Database);
    await bootstrapAuth(exactV2Database);
    await applyThroughRenderer4(exactV2Database);
    const exactV2Fixture = await createApprovedStudioFixture(exactV2Database, artifactType);
    const exactV2VersionId = await reviseAndApproveExactV2(exactV2Database, exactV2Fixture);
    const exactV2Pdf = await privateCommand(exactV2Database, {
      commandType: 'studio.rendition.generate', actorId: exactV2Fixture.requester,
      organizationId: exactV2Fixture.org, workspaceId: exactV2Fixture.workspace,
      requestId: randomUUID(), idempotencyKey: `exact-v2-${artifactType}-pdf`,
      authorizationVersion: exactV2Fixture.authorizationVersions[exactV2Fixture.requester],
      payload: { artifactVersionId: exactV2VersionId, format: 'pdf' },
    });
    assert.equal(exactV2Pdf.renditionClaim.artifactType, artifactType);
    assert.equal(exactV2Pdf.renditionClaim.rendererVersion, 'studio-pdf-4');
  }

  const identity = (await database.query(
    'SELECT migration_tip,production_authorized,customer_data_authorized,real_provider_calls_authorized FROM public.hosted_pilot_environment_identity WHERE singleton',
  )).rows[0];
  assert.deepEqual(identity, {
    migration_tip: '20261107110000',
    production_authorized: false,
    customer_data_authorized: false,
    real_provider_calls_authorized: false,
  });
  const legacyPrivileges = (await database.query(
    `SELECT has_function_privilege('service_role',
       'public.studio_private_artifact_command_claim_renderer1_legacy(jsonb)',
       'EXECUTE') legacy_service,
       has_function_privilege('authenticated',
       'public.studio_private_artifact_command_claim_renderer1_legacy(jsonb)',
       'EXECUTE') legacy_authenticated,
       has_function_privilege('service_role',
       'public.studio_private_artifact_command_claim(jsonb)',
       'EXECUTE') current_service,
       has_function_privilege('authenticated',
       'public.studio_private_artifact_command_claim(jsonb)',
       'EXECUTE') current_authenticated`,
  )).rows[0];
  assert.deepEqual(legacyPrivileges, {
    legacy_service: false,
    legacy_authenticated: false,
    current_service: true,
    current_authenticated: false,
  });
  console.log('studio PDF readability PostgreSQL: renderer-1/2/3/4 coexistence, all exact business PDF routing, replay, immutable content, negative routing, identity and ACL passed');
} finally {
  if (database) await database.end();
  if (negativeDatabase) await negativeDatabase.end();
  for (const exactV2Database of exactV2Databases) await exactV2Database.end();
  await dropDatabase(admin, databaseName);
  await dropDatabase(admin, negativeDatabaseName);
  for (const exactV2DatabaseName of exactV2DatabaseNames) await dropDatabase(admin, exactV2DatabaseName);
  await admin.end();
}
