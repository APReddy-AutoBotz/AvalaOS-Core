import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {
  createApprovedStudioFixture,
  privateCommand,
} from './studioPrivateArtifactPostgresFixture.mjs';

const claimAction = 'studio.rendition.reconciliation.claim';
const exhaustionAction = 'studio.rendition.reconciliation.exhausted';
const renderedFields = ['objectKey', 'byteLength', 'sha256', 'mimeType', 'filename'];

const attemptSnapshot = async (db, attemptId) => (await db.query(
  `SELECT state,reconciliation_phase,reconciliation_count,reconciliation_claimed_at,
          execution_fence,object_key,content_hash,byte_length,mime_type,
          safe_filename,completed_at,failure_code
   FROM public.studio_rendition_attempts
   WHERE id=$1::uuid`,
  [attemptId],
)).rows[0];

const auditRows = async (db, attemptId, action) => (await db.query(
  `SELECT outcome,resource_version,metadata
   FROM public.privileged_audit_events
   WHERE action=$1::text AND resource_id=$2::uuid
   ORDER BY created_at,id`,
  [action, attemptId],
)).rows;

const claim = async (db, attemptId) => (await db.query(
  'SELECT public.studio_rendition_reconciliation_claim($1::uuid) claim',
  [attemptId],
)).rows[0].claim;

const expireAttempt = async (db, attemptId) => db.query(
  `UPDATE public.studio_rendition_attempts
   SET state_changed_at=now()-interval '6 minutes',
       reconciliation_claimed_at=CASE
         WHEN state='reconciling' THEN now()-interval '6 minutes'
         ELSE reconciliation_claimed_at
       END
   WHERE id=$1::uuid`,
  [attemptId],
);

const generateAttempt = async (db, base, format, idempotencyKey) => {
  const result = await privateCommand(db, {
    commandType: 'studio.rendition.generate',
    actorId: base.requester,
    organizationId: base.org,
    workspaceId: base.workspace,
    requestId: randomUUID(),
    idempotencyKey,
    authorizationVersion: base.authorizationVersions[base.requester],
    payload: {artifactVersionId: base.artifactVersionId, format},
  });
  assert.equal(result.outcome, 'committed');
  assert.ok(result.renditionClaim);
  return result.renditionClaim;
};

const installClaimAuditFailure = async db => db.query(`
  CREATE OR REPLACE FUNCTION public.reject_rendition_recovery_phase_audit()
  RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF NEW.action = '${claimAction}' THEN
      RAISE EXCEPTION 'forced recovery phase audit insertion failure';
    END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER reject_rendition_recovery_phase_audit
  BEFORE INSERT ON public.privileged_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_rendition_recovery_phase_audit();
`);

const removeClaimAuditFailure = async db => db.query(`
  DROP TRIGGER reject_rendition_recovery_phase_audit
    ON public.privileged_audit_events;
  DROP FUNCTION public.reject_rendition_recovery_phase_audit();
`);

export async function runStudioRenditionRecoveryPhaseEvidence({db, scenario, names}) {
  const base = await createApprovedStudioFixture(db);

  const preRender = await generateAttempt(
    db,
    base,
    'markdown',
    'rendition-recovery-phase-pre-render',
  );
  const preRenderInitial = await attemptSnapshot(db, preRender.attemptId);
  await expireAttempt(db, preRender.attemptId);
  const preRenderFirstClaim = await claim(db, preRender.attemptId);
  const preRenderFirstState = await attemptSnapshot(db, preRender.attemptId);
  await expireAttempt(db, preRender.attemptId);
  const preRenderReclaim = await claim(db, preRender.attemptId);
  const preRenderReclaimedState = await attemptSnapshot(db, preRender.attemptId);
  await expireAttempt(db, preRender.attemptId);
  const preRenderExhaustion = await claim(db, preRender.attemptId);
  const preRenderExhaustedState = await attemptSnapshot(db, preRender.attemptId);
  const preRenderClaimAudits = await auditRows(db, preRender.attemptId, claimAction);
  const preRenderExhaustionAudits = await auditRows(db, preRender.attemptId, exhaustionAction);

  const postRender = await generateAttempt(
    db,
    base,
    'pdf',
    'rendition-recovery-phase-post-render',
  );
  await expireAttempt(db, postRender.attemptId);
  const postRenderFirstClaim = await claim(db, postRender.attemptId);
  const objectKey = `${base.org}/${base.workspace}/studio-artifacts/${postRender.opaqueObjectId}.pdf`;
  const sha256 = 'b'.repeat(64);
  const byteLength = 256;
  const mimeType = 'application/pdf';
  const filename = 'recovery-phase.pdf';
  await db.query(
    `SELECT public.studio_rendition_reconciliation_rendered(
       $1::uuid,$2::bigint,$3::text,$4::text,$5::bigint,$6::text,
       $7::text,$8::text,$9::text,$10::text
     )`,
    [
      postRender.attemptId,
      postRenderFirstClaim.fence,
      objectKey,
      sha256,
      byteLength,
      mimeType,
      filename,
      postRender.rendererVersion,
      postRender.templateVersion,
      postRender.contentSchemaVersion,
    ],
  );
  const renderedState = await attemptSnapshot(db, postRender.attemptId);
  await expireAttempt(db, postRender.attemptId);
  const postRenderReclaim = await claim(db, postRender.attemptId);
  const postRenderReclaimedState = await attemptSnapshot(db, postRender.attemptId);
  const postRenderClaimAudits = await auditRows(db, postRender.attemptId, claimAction);

  const rollback = await generateAttempt(
    db,
    base,
    'docx',
    'rendition-recovery-phase-rollback',
  );
  await expireAttempt(db, rollback.attemptId);
  const rollbackBefore = await attemptSnapshot(db, rollback.attemptId);
  const rollbackAuditBefore = await auditRows(db, rollback.attemptId, claimAction);
  await installClaimAuditFailure(db);
  try {
    await assert.rejects(
      claim(db, rollback.attemptId),
      /forced recovery phase audit insertion failure/,
    );
  } finally {
    await removeClaimAuditFailure(db);
  }
  const rollbackAfter = await attemptSnapshot(db, rollback.attemptId);
  const rollbackAuditAfter = await auditRows(db, rollback.attemptId, claimAction);

  const checks = [
    async () => assert.deepEqual(
      {state: preRenderInitial.state, recoveryPhase: preRenderInitial.reconciliation_phase},
      {state: 'requested', recoveryPhase: null},
    ),
    async () => assert.deepEqual(
      {
        phase: preRenderFirstClaim.phase,
        persisted: preRenderFirstState.reconciliation_phase,
        state: preRenderFirstState.state,
        count: Number(preRenderFirstState.reconciliation_count),
      },
      {phase: 'pre_render', persisted: 'pre_render', state: 'reconciling', count: 1},
    ),
    async () => {
      for (const field of renderedFields) {
        assert.equal(Object.hasOwn(preRenderFirstClaim, field), false);
        assert.equal(Object.hasOwn(preRenderReclaim, field), false);
      }
    },
    async () => assert.deepEqual(
      {
        phase: preRenderReclaim.phase,
        persisted: preRenderReclaimedState.reconciliation_phase,
        count: Number(preRenderReclaim.reconciliationCount),
        fence: Number(preRenderReclaim.fence),
      },
      {
        phase: 'pre_render',
        persisted: 'pre_render',
        count: 2,
        fence: Number(preRenderFirstClaim.fence) + 1,
      },
    ),
    async () => assert.deepEqual(
      preRenderClaimAudits.map(row => row.metadata.recoveryPhase),
      ['pre_render', 'pre_render'],
    ),
    async () => assert.deepEqual(
      {
        claim: preRenderExhaustion,
        state: preRenderExhaustedState.state,
        recoveryPhase: preRenderExhaustedState.reconciliation_phase,
        count: Number(preRenderExhaustedState.reconciliation_count),
        failureCode: preRenderExhaustedState.failure_code,
      },
      {
        claim: null,
        state: 'failed',
        recoveryPhase: 'pre_render',
        count: 3,
        failureCode: 'RECONCILIATION_EXHAUSTED',
      },
    ),
    async () => assert.deepEqual(
      preRenderExhaustionAudits.map(row => ({
        outcome: row.outcome,
        phase: row.metadata.recoveryPhase,
        count: Number(row.metadata.reconciliationCount),
      })),
      [{outcome: 'failed', phase: 'pre_render', count: 3}],
    ),
    async () => assert.deepEqual(
      {
        claimPhase: postRenderFirstClaim.phase,
        persistedPhase: renderedState.reconciliation_phase,
        state: renderedState.state,
      },
      {claimPhase: 'pre_render', persistedPhase: 'verify_or_upload', state: 'reconciling'},
    ),
    async () => assert.deepEqual(
      {
        phase: postRenderReclaim.phase,
        persistedPhase: postRenderReclaimedState.reconciliation_phase,
        count: Number(postRenderReclaim.reconciliationCount),
        fence: Number(postRenderReclaim.fence),
      },
      {
        phase: 'verify_or_upload',
        persistedPhase: 'verify_or_upload',
        count: 2,
        fence: Number(postRenderFirstClaim.fence) + 1,
      },
    ),
    async () => assert.deepEqual(
      Object.fromEntries(renderedFields.map(field => [field, postRenderReclaim[field]])),
      {objectKey, byteLength, sha256, mimeType, filename},
    ),
    async () => assert.deepEqual(
      postRenderClaimAudits.map(row => row.metadata.recoveryPhase),
      ['pre_render', 'verify_or_upload'],
    ),
    async () => assert.deepEqual(
      {
        state: rollbackAfter,
        auditDelta: rollbackAuditAfter.length - rollbackAuditBefore.length,
      },
      {state: rollbackBefore, auditDelta: 0},
    ),
  ];

  assert.equal(checks.length, names.length);
  for (let index = 0; index < checks.length; index += 1) {
    await scenario(names[index], checks[index]);
  }

  const evidence = {
    preRender: {
      claimPhases: preRenderClaimAudits.map(row => row.metadata.recoveryPhase),
      exhausted: preRenderExhaustedState.failure_code,
      reconciliationCount: Number(preRenderExhaustedState.reconciliation_count),
    },
    postRender: {
      claimPhases: postRenderClaimAudits.map(row => row.metadata.recoveryPhase),
      reconciliationCount: Number(postRenderReclaimedState.reconciliation_count),
    },
    auditRollbackDelta: rollbackAuditAfter.length - rollbackAuditBefore.length,
  };
  console.log(`RENDITION RECOVERY PHASE COUNTS ${JSON.stringify(evidence)}`);
  return evidence;
}
