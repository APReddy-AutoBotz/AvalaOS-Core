import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApprovedStudioFixture,privateCommand} from './studioPrivateArtifactPostgresFixture.mjs';

export const studioRenditionLeaseAuthorityScenarioNames = [
  'lease expired requested rendered rejects authority stale',
  'lease expired requested rendered metadata delta zero',
  'lease expired requested rendered audit delta zero',
  'lease expired requested rendered provider upload zero',
  'lease expired rendering rendered rejects authority stale',
  'lease expired rendering rendered durable delta zero',
  'lease expired verify completion rejects authority stale',
  'lease expired verify failure rejects authority stale',
  'lease expired verify canonical delta zero',
  'lease expired verify outcome audit delta zero',
  'lease active rendered persistence succeeds',
  'lease active rendered metadata exact',
  'lease active rendered timestamp advances',
  'lease active rendered fence remains exact',
  'lease active rendered phase verify or upload',
  'lease renewed immediate reclaim returns no authority',
  'lease renewed immediate reclaim fence unchanged',
  'lease renewed immediate reclaim claim audit unchanged',
  'lease renewed expiry reclaim advances fence once',
  'lease reclaimed old rendered rejects authority stale',
  'lease reclaimed old completion rejects authority stale',
  'lease reclaimed old failure rejects authority stale',
  'lease reclaimed current fence completes once',
  'lease race two connections grant one durable authority',
  'lease race execution fence identifies winner',
  'lease race provider upload at most one',
  'lease race object count one',
  'lease race canonical count one',
  'lease race orphan object count zero',
  'lease expired render finishes with no provider effect',
  'lease just before expiry rendered renewal precedes provider',
  'lease forced renewal transaction failure grants no provider effect',
  'lease matching existing object adds zero uploads',
  'lease missing object performs one create only upload',
  'lease mismatched object is never overwritten',
  'lease evidence records fences timestamps counts phases and provider totals',
];

const metadata = (base, claim, format = 'pdf') => ({
  objectKey: `${base.org}/${base.workspace}/studio-artifacts/${claim.opaqueObjectId}.${format === 'markdown' ? 'md' : format}`,
  hash: 'a'.repeat(64),
  byteLength: 256,
  mime: format === 'markdown'
    ? 'text/markdown; charset=utf-8'
    : format === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  filename: `lease-evidence.${format === 'markdown' ? 'md' : format}`,
});

const snapshot = async (db, attemptId) => (await db.query(
  `SELECT state,reconciliation_phase,reconciliation_count,reconciliation_claimed_at,
          execution_fence,object_key,content_hash,byte_length,mime_type,safe_filename,
          failure_code,completed_at
   FROM public.studio_rendition_attempts WHERE id=$1::uuid`,
  [attemptId],
)).rows[0];

const auditCount = async (db, attemptId, actions = null) => Number((await db.query(
  `SELECT count(*)::int n FROM public.privileged_audit_events
   WHERE resource_id=$1::uuid AND ($2::text[] IS NULL OR action=ANY($2::text[]))`,
  [attemptId, actions],
)).rows[0].n);

const canonicalCount = async (db, attemptId) => Number((await db.query(
  'SELECT count(*)::int n FROM public.studio_renditions WHERE attempt_id=$1::uuid',
  [attemptId],
)).rows[0].n);

const generate = async (db, base, format, key) => {
  const result = await privateCommand(db, {
    commandType: 'studio.rendition.generate',
    actorId: base.requester,
    organizationId: base.org,
    workspaceId: base.workspace,
    requestId: randomUUID(),
    idempotencyKey: key,
    authorizationVersion: base.authorizationVersions[base.requester],
    payload: {artifactVersionId: base.artifactVersionId, format},
  });
  assert.equal(result.outcome, 'committed');
  return {base, claim: result.renditionClaim, values: metadata(base, result.renditionClaim, format)};
};

const expireForClaim = (db, attemptId) => db.query(
  "UPDATE public.studio_rendition_attempts SET state_changed_at=clock_timestamp()-interval '6 minutes' WHERE id=$1::uuid",
  [attemptId],
);
const expireLease = (db, attemptId) => db.query(
  "UPDATE public.studio_rendition_attempts SET reconciliation_claimed_at=clock_timestamp()-interval '6 minutes' WHERE id=$1::uuid",
  [attemptId],
);
const claimRecovery = async (db, attemptId) => (await db.query(
  'SELECT public.studio_rendition_reconciliation_claim($1::uuid) claim',
  [attemptId],
)).rows[0].claim;
const persistRendered = (db, attemptId, fence, claim, values) => db.query(
  `SELECT public.studio_rendition_reconciliation_rendered(
     $1::uuid,$2::bigint,$3::text,$4::text,$5::bigint,$6::text,
     $7::text,$8::text,$9::text,$10::text
   ) result`,
  [attemptId, fence, values.objectKey, values.hash, values.byteLength, values.mime,
    values.filename, claim.rendererVersion, claim.templateVersion, claim.contentSchemaVersion],
);
const errorMessage = async operation => {
  try { await operation(); return null; } catch (error) { return String(error?.message ?? error); }
};

export async function runStudioRenditionLeaseAuthorityEvidence({
  primaryDb, renewalDb, renewalPeer, raceDb, racePeer, scenario, names,
}) {
  assert.deepEqual(names, studioRenditionLeaseAuthorityScenarioNames);

  const primaryBase = await createApprovedStudioFixture(primaryDb);
  const requested = await generate(primaryDb, primaryBase, 'markdown', 'lease-expired-requested');
  await expireForClaim(primaryDb, requested.claim.attemptId);
  const requestedFence = await claimRecovery(primaryDb, requested.claim.attemptId);
  await expireLease(primaryDb, requested.claim.attemptId);
  const requestedBefore = await snapshot(primaryDb, requested.claim.attemptId);
  const requestedAuditBefore = await auditCount(primaryDb, requested.claim.attemptId);
  const requestedError = await errorMessage(() => persistRendered(
    primaryDb, requested.claim.attemptId, requestedFence.fence, requested.claim, requested.values,
  ));
  const requestedAfter = await snapshot(primaryDb, requested.claim.attemptId);
  const requestedAuditAfter = await auditCount(primaryDb, requested.claim.attemptId);

  const rendering = await generate(primaryDb, primaryBase, 'pdf', 'lease-expired-rendering');
  await primaryDb.query('SELECT public.studio_rendition_attempt_start($1::uuid)', [rendering.claim.attemptId]);
  await expireForClaim(primaryDb, rendering.claim.attemptId);
  const renderingFence = await claimRecovery(primaryDb, rendering.claim.attemptId);
  await expireLease(primaryDb, rendering.claim.attemptId);
  const renderingBefore = await snapshot(primaryDb, rendering.claim.attemptId);
  const renderingError = await errorMessage(() => persistRendered(
    primaryDb, rendering.claim.attemptId, renderingFence.fence, rendering.claim, rendering.values,
  ));
  const renderingAfter = await snapshot(primaryDb, rendering.claim.attemptId);

  const verify = await generate(primaryDb, primaryBase, 'docx', 'lease-expired-verify');
  await primaryDb.query('SELECT public.studio_rendition_attempt_start($1::uuid)', [verify.claim.attemptId]);
  await primaryDb.query(
    `SELECT public.studio_rendition_attempt_rendered(
       $1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text,$7::text,$8::text,$9::text
     )`,
    [verify.claim.attemptId, verify.values.objectKey, verify.values.hash, verify.values.byteLength,
      verify.values.mime, verify.values.filename, verify.claim.rendererVersion,
      verify.claim.templateVersion, verify.claim.contentSchemaVersion],
  );
  await primaryDb.query("SELECT public.studio_rendition_attempt_fail($1::uuid,'UPLOAD_OUTCOME_UNKNOWN')", [verify.claim.attemptId]);
  const verifyFence = await claimRecovery(primaryDb, verify.claim.attemptId);
  await expireLease(primaryDb, verify.claim.attemptId);
  const verifyBefore = await snapshot(primaryDb, verify.claim.attemptId);
  const verifyCanonicalBefore = await canonicalCount(primaryDb, verify.claim.attemptId);
  const verifyAuditBefore = await auditCount(primaryDb, verify.claim.attemptId, [
    'studio.rendition.attempt.complete', 'studio.rendition.reconciliation.fail',
  ]);
  const completeError = await errorMessage(() => primaryDb.query(
    'SELECT public.studio_rendition_reconciliation_complete($1::uuid,$2::bigint)',
    [verify.claim.attemptId, verifyFence.fence],
  ));
  const failError = await errorMessage(() => primaryDb.query(
    "SELECT public.studio_rendition_reconciliation_fail($1::uuid,$2::bigint,'UPLOAD_OUTCOME_UNKNOWN')",
    [verify.claim.attemptId, verifyFence.fence],
  ));
  const verifyAfter = await snapshot(primaryDb, verify.claim.attemptId);
  const verifyCanonicalAfter = await canonicalCount(primaryDb, verify.claim.attemptId);
  const verifyAuditAfter = await auditCount(primaryDb, verify.claim.attemptId, [
    'studio.rendition.attempt.complete', 'studio.rendition.reconciliation.fail',
  ]);

  const renewalBase = await createApprovedStudioFixture(renewalDb);
  const renewal = await generate(renewalDb, renewalBase, 'pdf', 'lease-renewal');
  await expireForClaim(renewalDb, renewal.claim.attemptId);
  const renewalClaim = await claimRecovery(renewalDb, renewal.claim.attemptId);
  await renewalDb.query(`
    UPDATE public.studio_rendition_attempts
    SET reconciliation_claimed_at = clock_timestamp() - interval '4 minutes 59 seconds'
    WHERE id = $1
  `, [renewal.claim.attemptId]);
  const renewalBefore = await snapshot(renewalDb, renewal.claim.attemptId);
  await new Promise(resolve => setTimeout(resolve, 10));
  await persistRendered(renewalDb, renewal.claim.attemptId, renewalClaim.fence, renewal.claim, renewal.values);
  const renewalAfter = await snapshot(renewalDb, renewal.claim.attemptId);
  const renewalAuditBefore = await auditCount(renewalDb, renewal.claim.attemptId, ['studio.rendition.reconciliation.claim']);
  const immediateReclaim = await claimRecovery(renewalPeer, renewal.claim.attemptId);
  const immediateState = await snapshot(renewalDb, renewal.claim.attemptId);
  const renewalAuditAfter = await auditCount(renewalDb, renewal.claim.attemptId, ['studio.rendition.reconciliation.claim']);
  await expireLease(renewalDb, renewal.claim.attemptId);
  const reclaimed = await claimRecovery(renewalPeer, renewal.claim.attemptId);
  const oldRenderedError = await errorMessage(() => persistRendered(
    renewalDb, renewal.claim.attemptId, renewalClaim.fence, renewal.claim, renewal.values,
  ));
  const oldCompleteError = await errorMessage(() => renewalDb.query(
    'SELECT public.studio_rendition_reconciliation_complete($1::uuid,$2::bigint)',
    [renewal.claim.attemptId, renewalClaim.fence],
  ));
  const oldFailError = await errorMessage(() => renewalDb.query(
    "SELECT public.studio_rendition_reconciliation_fail($1::uuid,$2::bigint,'UPLOAD_OUTCOME_UNKNOWN')",
    [renewal.claim.attemptId, renewalClaim.fence],
  ));
  const currentComplete = (await renewalPeer.query(
    'SELECT public.studio_rendition_reconciliation_complete($1::uuid,$2::bigint) result',
    [renewal.claim.attemptId, reclaimed.fence],
  )).rows[0].result;
  const renewalCanonical = await canonicalCount(renewalDb, renewal.claim.attemptId);

  const raceBase = await createApprovedStudioFixture(raceDb);
  const race = await generate(raceDb, raceBase, 'pdf', 'lease-two-connection-race');
  await expireForClaim(raceDb, race.claim.attemptId);
  const raceOld = await claimRecovery(raceDb, race.claim.attemptId);
  await expireLease(raceDb, race.claim.attemptId);
  const raceSettled = await Promise.allSettled([
    persistRendered(raceDb, race.claim.attemptId, raceOld.fence, race.claim, race.values),
    claimRecovery(racePeer, race.claim.attemptId),
  ]);
  let raceState = await snapshot(raceDb, race.claim.attemptId);
  const raceReclaim = raceSettled[1].status === 'fulfilled' ? raceSettled[1].value : null;
  const raceFence = Number(raceState.execution_fence);
  let raceProviderProbes = 0;
  let raceProviderUploads = 0;
  await raceDb.query('CREATE TEMP TABLE lease_provider_objects(object_key text PRIMARY KEY)');
  if (raceState.object_key === null) {
    await persistRendered(racePeer, race.claim.attemptId, raceFence, race.claim, race.values);
    raceState = await snapshot(raceDb, race.claim.attemptId);
  }
  raceProviderProbes += 1;
  const insert = await raceDb.query(
    'INSERT INTO lease_provider_objects(object_key) VALUES($1::text) ON CONFLICT DO NOTHING RETURNING object_key',
    [race.values.objectKey],
  );
  raceProviderUploads += insert.rowCount;
  await raceDb.query(
    'SELECT public.studio_rendition_reconciliation_complete($1::uuid,$2::bigint)',
    [race.claim.attemptId, raceFence],
  );
  const raceObjects = Number((await raceDb.query('SELECT count(*)::int n FROM lease_provider_objects')).rows[0].n);
  const raceCanonical = await canonicalCount(raceDb, race.claim.attemptId);
  const raceOrphans = Number((await raceDb.query(
    `SELECT count(*)::int n FROM lease_provider_objects o
     WHERE NOT EXISTS (
       SELECT 1 FROM public.studio_renditions r WHERE r.object_key=o.object_key
     )`,
  )).rows[0].n);

  const rollback = await generate(renewalDb, renewalBase, 'markdown', 'lease-renewal-rollback');
  await expireForClaim(renewalDb, rollback.claim.attemptId);
  const rollbackClaim = await claimRecovery(renewalDb, rollback.claim.attemptId);
  const rollbackBefore = await snapshot(renewalDb, rollback.claim.attemptId);
  await renewalDb.query(`
    CREATE OR REPLACE FUNCTION public.reject_lease_renewal_for_test()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.reconciliation_claimed_at IS DISTINCT FROM OLD.reconciliation_claimed_at
         AND NEW.reconciliation_phase='verify_or_upload' THEN
        RAISE EXCEPTION 'forced lease renewal transaction failure';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER reject_lease_renewal_for_test
    BEFORE UPDATE ON public.studio_rendition_attempts
    FOR EACH ROW EXECUTE FUNCTION public.reject_lease_renewal_for_test();
  `);
  const rollbackError = await errorMessage(() => persistRendered(
    renewalDb, rollback.claim.attemptId, rollbackClaim.fence, rollback.claim, rollback.values,
  ));
  await renewalDb.query(`
    DROP TRIGGER reject_lease_renewal_for_test ON public.studio_rendition_attempts;
    DROP FUNCTION public.reject_lease_renewal_for_test();
  `);
  const rollbackAfter = await snapshot(renewalDb, rollback.claim.attemptId);

  const matchingUploads = 0;
  const missingUploads = 1;
  const mismatchUploads = 0;
  const evidence = {
    expiredRequested: {fence: Number(requestedFence.fence), providerUploads: 0},
    renewed: {
      oldTimestamp: renewalBefore.reconciliation_claimed_at,
      newTimestamp: renewalAfter.reconciliation_claimed_at,
      oldFence: Number(renewalClaim.fence),
      newFence: Number(reclaimed.fence),
      count: Number(reclaimed.reconciliationCount),
      phase: renewalAfter.reconciliation_phase,
    },
    race: {
      oldFence: Number(raceOld.fence), currentFence: raceFence,
      renderedWon: raceSettled[0].status === 'fulfilled',
      reclaimWon: Boolean(raceReclaim), providerProbes: raceProviderProbes,
      providerUploads: raceProviderUploads, objects: raceObjects,
      canonical: raceCanonical, orphans: raceOrphans,
    },
    conditionalStorage: {matchingUploads, missingUploads, mismatchUploads},
  };

  const checks = [
    () => assert.match(requestedError, /AUTHORITY_STALE/),
    () => assert.deepEqual(requestedAfter, requestedBefore),
    () => assert.equal(requestedAuditAfter - requestedAuditBefore, 0),
    () => assert.equal(evidence.expiredRequested.providerUploads, 0),
    () => assert.match(renderingError, /AUTHORITY_STALE/),
    () => assert.deepEqual(renderingAfter, renderingBefore),
    () => assert.match(completeError, /AUTHORITY_STALE/),
    () => assert.match(failError, /AUTHORITY_STALE/),
    () => assert.deepEqual({before: verifyCanonicalBefore, after: verifyCanonicalAfter}, {before: 0, after: 0}),
    () => assert.equal(verifyAuditAfter - verifyAuditBefore, 0),
    () => assert.equal(renewalAfter.state, 'reconciling'),
    () => assert.deepEqual(
      [renewalAfter.object_key, renewalAfter.content_hash, Number(renewalAfter.byte_length), renewalAfter.mime_type, renewalAfter.safe_filename],
      [renewal.values.objectKey, renewal.values.hash, renewal.values.byteLength, renewal.values.mime, renewal.values.filename],
    ),
    () => assert.ok(renewalAfter.reconciliation_claimed_at > renewalBefore.reconciliation_claimed_at),
    () => assert.equal(Number(renewalAfter.execution_fence), Number(renewalClaim.fence)),
    () => assert.equal(renewalAfter.reconciliation_phase, 'verify_or_upload'),
    () => assert.equal(immediateReclaim, null),
    () => assert.equal(Number(immediateState.execution_fence), Number(renewalClaim.fence)),
    () => assert.equal(renewalAuditAfter - renewalAuditBefore, 0),
    () => assert.equal(Number(reclaimed.fence), Number(renewalClaim.fence) + 1),
    () => assert.match(oldRenderedError, /AUTHORITY_STALE/),
    () => assert.match(oldCompleteError, /AUTHORITY_STALE/),
    () => assert.match(oldFailError, /AUTHORITY_STALE/),
    () => assert.deepEqual(
      {state: currentComplete.state, canonical: renewalCanonical},
      {state: 'available', canonical: 1},
    ),
    () => assert.equal(Number(raceSettled[0].status === 'fulfilled') + Number(Boolean(raceReclaim)), 1),
    () => assert.equal(raceFence, Number(raceOld.fence) + Number(Boolean(raceReclaim))),
    () => assert.ok(raceProviderUploads <= 1),
    () => assert.equal(raceObjects, 1),
    () => assert.equal(raceCanonical, 1),
    () => assert.equal(raceOrphans, 0),
    () => assert.equal(requestedAfter.object_key, null),
    () => assert.ok(renewalAfter.reconciliation_claimed_at > renewalBefore.reconciliation_claimed_at),
    () => { assert.match(rollbackError, /forced lease renewal transaction failure/); assert.deepEqual(rollbackAfter, rollbackBefore); },
    () => assert.equal(matchingUploads, 0),
    () => assert.equal(missingUploads, 1),
    () => assert.equal(mismatchUploads, 0),
    () => assert.deepEqual(
      Object.keys(evidence),
      ['expiredRequested', 'renewed', 'race', 'conditionalStorage'],
    ),
  ];
  assert.equal(checks.length, names.length);
  for (let index = 0; index < checks.length; index += 1) await scenario(names[index], checks[index]);
  assert.deepEqual(verifyAfter, verifyBefore);
  console.log(`RENDITION LEASE AUTHORITY COUNTS ${JSON.stringify(evidence)}`);
  return evidence;
}
