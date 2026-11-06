import assert from 'node:assert/strict';
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
const migration = '20261106040803_studio_v2_rendition_renderer.sql';
const migrationIndex = migrationNames.indexOf(migration);
assert.ok(migrationIndex > 0, 'renderer migration must be in the ordered chain');
const databaseName = `studio_v2_renderer_${process.pid}`;
const admin = await connect(adminUrl);
let database;

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

try {
  await ensureClusterRoles(admin);
  database = await createDatabase(admin, adminUrl, databaseName);
  await bootstrapAuth(database);
  await applyMigrations(database, migrationNames.slice(0, migrationIndex));

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

  await applyMigrations(database, [migration]);
  const current = await privateCommand(database, command(2));
  assert.equal(current.outcome, 'committed');
  assert.equal(current.renditionClaim.rendererVersion, 'studio-pdf-2');
  assert.equal(current.renditionClaim.contentSchemaVersion, 'studio-artifact-2');
  const currentReplay = await privateCommand(database, command(2));
  assert.equal(currentReplay.outcome, 'replayed');
  assert.equal(currentReplay.renditionClaim, undefined);
  const currentCompleted = await finishRendition(database, current.renditionClaim, 'b');

  const rows = (await database.query(
    `SELECT id,attempt_id,object_key,content_hash,renderer_version,lifecycle
     FROM public.studio_renditions
     WHERE artifact_version_id=$1::uuid AND format='pdf'
     ORDER BY renderer_version`,
    [fixture.artifactVersionId],
  )).rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.renderer_version), ['studio-pdf-1', 'studio-pdf-2']);
  assert.deepEqual(rows[0], legacyBefore);
  assert.equal(rows[1].id, currentCompleted.renditionId);
  assert.notEqual(rows[0].object_key, rows[1].object_key);
  assert.notEqual(rows[0].content_hash, rows[1].content_hash);

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

  const identity = (await database.query(
    'SELECT migration_tip,production_authorized,customer_data_authorized,real_provider_calls_authorized FROM public.hosted_pilot_environment_identity WHERE singleton',
  )).rows[0];
  assert.deepEqual(identity, {
    migration_tip: '20261106040803',
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
  console.log('studio V2 renderer PostgreSQL: renderer-2 claim, replay, coexistence, legacy download, immutability, identity and ACL passed');
} finally {
  if (database) await database.end();
  await dropDatabase(admin, databaseName);
  await admin.end();
}
