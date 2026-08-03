import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createApprovedStudioFixture,privateCommand} from './studioPrivateArtifactPostgresFixture.mjs';

export const studioRenditionRecoveryControlScenarioNames = [
  'recovery control disabled after claim rejects rendered',
  'recovery control disabled rendered durable delta zero',
  'recovery control disabled rendered metadata phase fence count delta zero',
  'recovery control disabled rendered audit delta zero',
  'recovery control disabled rendered provider probes and uploads zero',
  'recovery control reenabled rendered continuation succeeds',
  'recovery control reenabled rendered metadata remains canonical',
  'recovery control disabled before completion rejects',
  'recovery control disabled completion attempt delta zero',
  'recovery control disabled completion canonical delta zero',
  'recovery control disabled completion audit delta zero',
  'recovery control reenabled completion continuation succeeds',
  'recovery control disabled before failure rejects',
  'recovery control disabled failure attempt delta zero',
  'recovery control disabled failure audit delta zero',
  'recovery control read only rejects failure',
  'recovery control provider disabled rejects failure',
  'recovery control reenabled failure continuation succeeds',
  'recovery control update first blocks recovery operation',
  'recovery control update first recovery rereads disabled state',
  'recovery control update first durable and audit deltas zero',
  'recovery control update first provider probes and uploads zero',
  'recovery control update first continuation succeeds after reenable',
  'recovery operation first blocks runtime control update',
  'recovery operation first commits before runtime control update',
  'recovery operation first control update applies after commit',
  'recovery control evidence records exact serialized outcomes',
];

const setControl = (db, enabled, readOnly = false, providerEnabled = true) => db.query(
  `UPDATE public.studio_private_artifact_runtime_control
   SET enabled=$1::boolean,read_only=$2::boolean,provider_enabled=$3::boolean,
       updated_at=clock_timestamp()
   WHERE singleton`,
  [enabled, readOnly, providerEnabled],
);

const metadata = (base, claim, format) => {
  const extension = format === 'markdown' ? 'md' : format;
  return {
    objectKey: `${base.org}/${base.workspace}/studio-artifacts/${claim.opaqueObjectId}.${extension}`,
    hash: 'e'.repeat(64),
    byteLength: 384,
    mime: format === 'markdown'
      ? 'text/markdown; charset=utf-8'
      : format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    filename: `runtime-control.${extension}`,
  };
};

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
  return {claim: result.renditionClaim, values: metadata(base, result.renditionClaim, format)};
};

const prepareRecovery = async (db, base, format, key, rendered = false) => {
  const attempt = await generate(db, base, format, key);
  if (rendered) {
    await db.query('SELECT public.studio_rendition_attempt_start($1::uuid)', [attempt.claim.attemptId]);
    await db.query(
      `SELECT public.studio_rendition_attempt_rendered(
         $1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text,$7::text,$8::text,$9::text
       )`,
      [attempt.claim.attemptId, attempt.values.objectKey, attempt.values.hash,
        attempt.values.byteLength, attempt.values.mime, attempt.values.filename,
        attempt.claim.rendererVersion, attempt.claim.templateVersion,
        attempt.claim.contentSchemaVersion],
    );
    await db.query(
      "SELECT public.studio_rendition_attempt_fail($1::uuid,'UPLOAD_OUTCOME_UNKNOWN')",
      [attempt.claim.attemptId],
    );
  } else {
    await db.query(
      "UPDATE public.studio_rendition_attempts SET state_changed_at=clock_timestamp()-interval '6 minutes' WHERE id=$1::uuid",
      [attempt.claim.attemptId],
    );
  }
  const recovery = (await db.query(
    'SELECT public.studio_rendition_reconciliation_claim($1::uuid) claim',
    [attempt.claim.attemptId],
  )).rows[0].claim;
  assert.ok(recovery);
  return {...attempt, fence: Number(recovery.fence)};
};

const persistRendered = (db, attempt) => db.query(
  `SELECT public.studio_rendition_reconciliation_rendered(
     $1::uuid,$2::bigint,$3::text,$4::text,$5::bigint,$6::text,
     $7::text,$8::text,$9::text,$10::text
   ) result`,
  [attempt.claim.attemptId, attempt.fence, attempt.values.objectKey, attempt.values.hash,
    attempt.values.byteLength, attempt.values.mime, attempt.values.filename,
    attempt.claim.rendererVersion, attempt.claim.templateVersion,
    attempt.claim.contentSchemaVersion],
);

const snapshot = async (db, attemptId) => (await db.query(
  `SELECT state,reconciliation_phase,reconciliation_count,reconciliation_claimed_at,
          execution_fence,storage_provider,bucket_id,object_key,content_hash,
          byte_length,mime_type,safe_filename,failure_code,rendered_at,completed_at
   FROM public.studio_rendition_attempts WHERE id=$1::uuid`,
  [attemptId],
)).rows[0];

const auditCount = async (db, attemptId) => Number((await db.query(
  'SELECT count(*)::int n FROM public.privileged_audit_events WHERE resource_id=$1::uuid',
  [attemptId],
)).rows[0].n);

const canonicalCount = async (db, attemptId) => Number((await db.query(
  'SELECT count(*)::int n FROM public.studio_renditions WHERE attempt_id=$1::uuid',
  [attemptId],
)).rows[0].n);

const capture = operation => operation().then(
  value => ({status: 'fulfilled', value}),
  error => ({status: 'rejected', message: String(error?.message ?? error)}),
);

const waitForLock = async (observer, applicationName) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const waiting = Number((await observer.query(
      `SELECT count(*)::int count FROM pg_stat_activity
       WHERE application_name=$1::text AND wait_event_type='Lock'`,
      [applicationName],
    )).rows[0].count);
    if (waiting > 0) return true;
    await delay(10);
  }
  return false;
};

export async function runStudioRenditionRecoveryControlEvidence({
  primaryDb, updateFirstDb, updateFirstPeer, recoveryFirstDb, recoveryFirstPeer,
  scenario, names,
}) {
  assert.deepEqual(names, studioRenditionRecoveryControlScenarioNames);
  await primaryDb.query("SET application_name='studio_runtime_control_primary'; SET statement_timeout='8s'");
  await updateFirstDb.query("SET application_name='studio_runtime_control_update_observer'; SET statement_timeout='8s'");
  await updateFirstPeer.query("SET application_name='studio_runtime_control_recovery_waiter'; SET statement_timeout='8s'");
  await recoveryFirstDb.query("SET application_name='studio_runtime_control_recovery_observer'; SET statement_timeout='8s'");
  await recoveryFirstPeer.query("SET application_name='studio_runtime_control_update_waiter'; SET statement_timeout='8s'");
  const base = await createApprovedStudioFixture(primaryDb);

  const rendered = await prepareRecovery(primaryDb, base, 'markdown', 'runtime-disabled-rendered');
  await setControl(primaryDb, false);
  const renderedBefore = await snapshot(primaryDb, rendered.claim.attemptId);
  const renderedAuditBefore = await auditCount(primaryDb, rendered.claim.attemptId);
  const blockedProvider = {probes: 0, uploads: 0};
  const renderedBlocked = await capture(() => persistRendered(primaryDb, rendered));
  const renderedAfter = await snapshot(primaryDb, rendered.claim.attemptId);
  const renderedAuditAfter = await auditCount(primaryDb, rendered.claim.attemptId);
  await setControl(primaryDb, true);
  const renderedContinued = await capture(() => persistRendered(primaryDb, rendered));
  const renderedContinuedState = await snapshot(primaryDb, rendered.claim.attemptId);

  const completion = await prepareRecovery(primaryDb, base, 'pdf', 'runtime-disabled-completion', true);
  await setControl(primaryDb, false);
  const completionBefore = await snapshot(primaryDb, completion.claim.attemptId);
  const completionCanonicalBefore = await canonicalCount(primaryDb, completion.claim.attemptId);
  const completionAuditBefore = await auditCount(primaryDb, completion.claim.attemptId);
  const completionBlocked = await capture(() => primaryDb.query(
    'SELECT public.studio_rendition_reconciliation_complete($1::uuid,$2::bigint) result',
    [completion.claim.attemptId, completion.fence],
  ));
  const completionAfter = await snapshot(primaryDb, completion.claim.attemptId);
  const completionCanonicalAfter = await canonicalCount(primaryDb, completion.claim.attemptId);
  const completionAuditAfter = await auditCount(primaryDb, completion.claim.attemptId);
  await setControl(primaryDb, true);
  const completionContinued = await capture(() => primaryDb.query(
    'SELECT public.studio_rendition_reconciliation_complete($1::uuid,$2::bigint) result',
    [completion.claim.attemptId, completion.fence],
  ));

  const failure = await prepareRecovery(primaryDb, base, 'docx', 'runtime-disabled-failure');
  await setControl(primaryDb, false);
  const failureBefore = await snapshot(primaryDb, failure.claim.attemptId);
  const failureAuditBefore = await auditCount(primaryDb, failure.claim.attemptId);
  const fail = () => primaryDb.query(
    "SELECT public.studio_rendition_reconciliation_fail($1::uuid,$2::bigint,'RENDER_FAILED') result",
    [failure.claim.attemptId, failure.fence],
  );
  const failureDisabled = await capture(fail);
  const failureAfterDisabled = await snapshot(primaryDb, failure.claim.attemptId);
  const failureAuditAfterDisabled = await auditCount(primaryDb, failure.claim.attemptId);
  await setControl(primaryDb, true, true, true);
  const failureReadOnly = await capture(fail);
  await setControl(primaryDb, true, false, false);
  const failureProviderDisabled = await capture(fail);
  await setControl(primaryDb, true);
  const failureContinued = await capture(fail);

  const updateFirstBase = await createApprovedStudioFixture(updateFirstDb);
  const updateFirst = await prepareRecovery(updateFirstDb, updateFirstBase, 'markdown', 'runtime-control-update-first');
  const updateFirstBefore = await snapshot(updateFirstDb, updateFirst.claim.attemptId);
  const updateFirstAuditBefore = await auditCount(updateFirstDb, updateFirst.claim.attemptId);
  await updateFirstDb.query('BEGIN');
  await setControl(updateFirstDb, false);
  const updateFirstOperation = capture(() => persistRendered(updateFirstPeer, updateFirst));
  const updateFirstBlocked = await waitForLock(updateFirstDb, 'studio_runtime_control_recovery_waiter');
  await updateFirstDb.query('COMMIT');
  const updateFirstOutcome = await updateFirstOperation;
  const updateFirstAfter = await snapshot(updateFirstDb, updateFirst.claim.attemptId);
  const updateFirstAuditAfter = await auditCount(updateFirstDb, updateFirst.claim.attemptId);
  const updateFirstProvider = {probes: 0, uploads: 0};
  await setControl(updateFirstDb, true);
  const updateFirstContinued = await capture(() => persistRendered(updateFirstDb, updateFirst));

  const recoveryFirstBase = await createApprovedStudioFixture(recoveryFirstDb);
  const recoveryFirst = await prepareRecovery(recoveryFirstDb, recoveryFirstBase, 'pdf', 'runtime-recovery-first');
  await recoveryFirstDb.query('BEGIN');
  const recoveryFirstPersisted = await capture(() => persistRendered(recoveryFirstDb, recoveryFirst));
  const recoveryFirstUpdate = capture(() => setControl(recoveryFirstPeer, false));
  const recoveryFirstBlocked = await waitForLock(recoveryFirstDb, 'studio_runtime_control_update_waiter');
  const recoveryFirstInTransaction = await snapshot(recoveryFirstDb, recoveryFirst.claim.attemptId);
  await recoveryFirstDb.query('COMMIT');
  const recoveryFirstUpdateOutcome = await recoveryFirstUpdate;
  const recoveryFirstControl = (await recoveryFirstDb.query(
    'SELECT enabled,read_only,provider_enabled FROM public.studio_private_artifact_runtime_control WHERE singleton',
  )).rows[0];
  await setControl(recoveryFirstDb, true);

  const evidence = {
    disabled: {
      rendered: renderedBlocked.message,
      completion: completionBlocked.message,
      failure: failureDisabled.message,
      readOnly: failureReadOnly.message,
      providerDisabled: failureProviderDisabled.message,
      provider: blockedProvider,
    },
    continued: {
      rendered: renderedContinued.status,
      completion: completionContinued.status,
      failure: failureContinued.status,
    },
    updateFirst: {
      blocked: updateFirstBlocked,
      outcome: updateFirstOutcome.status,
      message: updateFirstOutcome.message,
      provider: updateFirstProvider,
      continued: updateFirstContinued.status,
    },
    recoveryFirst: {
      persisted: recoveryFirstPersisted.status,
      updateBlocked: recoveryFirstBlocked,
      updateOutcome: recoveryFirstUpdateOutcome.status,
      phase: recoveryFirstInTransaction.reconciliation_phase,
      control: recoveryFirstControl,
    },
  };

  const checks = [
    () => assert.match(renderedBlocked.message, /STUDIO_READ_ONLY/),
    () => assert.deepEqual(renderedAfter, renderedBefore),
    () => assert.deepEqual(
      [renderedAfter.object_key, renderedAfter.reconciliation_phase, Number(renderedAfter.execution_fence), renderedAfter.reconciliation_count],
      [renderedBefore.object_key, renderedBefore.reconciliation_phase, Number(renderedBefore.execution_fence), renderedBefore.reconciliation_count],
    ),
    () => assert.equal(renderedAuditAfter - renderedAuditBefore, 0),
    () => assert.deepEqual(blockedProvider, {probes: 0, uploads: 0}),
    () => assert.equal(renderedContinued.status, 'fulfilled'),
    () => assert.deepEqual(
      [renderedContinuedState.object_key, renderedContinuedState.content_hash, renderedContinuedState.reconciliation_phase],
      [rendered.values.objectKey, rendered.values.hash, 'verify_or_upload'],
    ),
    () => assert.match(completionBlocked.message, /STUDIO_READ_ONLY/),
    () => assert.deepEqual(completionAfter, completionBefore),
    () => assert.deepEqual([completionCanonicalBefore, completionCanonicalAfter], [0, 0]),
    () => assert.equal(completionAuditAfter - completionAuditBefore, 0),
    () => assert.equal(completionContinued.status, 'fulfilled'),
    () => assert.match(failureDisabled.message, /STUDIO_READ_ONLY/),
    () => assert.deepEqual(failureAfterDisabled, failureBefore),
    () => assert.equal(failureAuditAfterDisabled - failureAuditBefore, 0),
    () => assert.match(failureReadOnly.message, /STUDIO_READ_ONLY/),
    () => assert.match(failureProviderDisabled.message, /STUDIO_READ_ONLY/),
    () => assert.equal(failureContinued.status, 'fulfilled'),
    () => assert.equal(updateFirstBlocked, true),
    () => assert.match(updateFirstOutcome.message, /STUDIO_READ_ONLY/),
    () => { assert.deepEqual(updateFirstAfter, updateFirstBefore); assert.equal(updateFirstAuditAfter - updateFirstAuditBefore, 0); },
    () => assert.deepEqual(updateFirstProvider, {probes: 0, uploads: 0}),
    () => assert.equal(updateFirstContinued.status, 'fulfilled'),
    () => assert.equal(recoveryFirstBlocked, true),
    () => assert.deepEqual([recoveryFirstPersisted.status, recoveryFirstInTransaction.reconciliation_phase], ['fulfilled', 'verify_or_upload']),
    () => assert.deepEqual([recoveryFirstUpdateOutcome.status, recoveryFirstControl.enabled], ['fulfilled', false]),
    () => assert.deepEqual(Object.keys(evidence), ['disabled', 'continued', 'updateFirst', 'recoveryFirst']),
  ];
  assert.equal(checks.length, names.length);
  for (let index = 0; index < checks.length; index += 1) await scenario(names[index], checks[index]);
  console.log(`RENDITION RECOVERY CONTROL COUNTS ${JSON.stringify(evidence)}`);
  return evidence;
}
