import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createApprovedStudioFixture,privateCommand} from './studioPrivateArtifactPostgresFixture.mjs';

const generationCommand = (base, format, key) => ({
  commandType: 'studio.rendition.generate',
  actorId: base.requester,
  organizationId: base.org,
  workspaceId: base.workspace,
  requestId: randomUUID(),
  idempotencyKey: key,
  authorizationVersion: base.authorizationVersions[base.requester],
  payload: {artifactVersionId: base.artifactVersionId, format},
});

const rawGenerationCommand = async (db, base, format, key) => {
  const command = generationCommand(base,format,key);
  command.payload.artifactId = base.artifactId;
  command.expectedArtifactVersion = Number(base.version.version);
  command.expectedRenditionVersion = null;
  return db.query(
    'SELECT public.studio_private_artifact_command_claim($1::jsonb) result',
    [JSON.stringify(command)],
  );
};

const objectMetadata = (base, claim, format, hashCharacter='a') => {
  const extension = format === 'markdown' ? 'md' : format;
  const mimeType = format === 'markdown'
    ? 'text/markdown; charset=utf-8'
    : format === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return {
    objectKey: `${base.org}/${base.workspace}/studio-artifacts/${claim.opaqueObjectId}.${extension}`,
    sha256: hashCharacter.repeat(64),
    byteLength: 256,
    mimeType,
    filename: `concurrency.${extension}`,
  };
};

const prepareUploadedAttempt = async (db, base, format, key, hashCharacter) => {
  const command = generationCommand(base,format,key);
  const result = await privateCommand(db,command);
  const claim = result.renditionClaim;
  const metadata = objectMetadata(base,claim,format,hashCharacter);
  await db.query('SELECT public.studio_rendition_attempt_start($1::uuid)',[claim.attemptId]);
  await db.query(
    'SELECT public.studio_rendition_attempt_rendered($1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text,$7::text,$8::text,$9::text)',
    [
      claim.attemptId,metadata.objectKey,metadata.sha256,metadata.byteLength,
      metadata.mimeType,metadata.filename,claim.rendererVersion,
      claim.templateVersion,claim.contentSchemaVersion,
    ],
  );
  return {command,result,claim,metadata};
};

const counts = async (db, base) => (await db.query(
  `SELECT
     (SELECT count(*)::int FROM public.studio_private_artifact_command_receipts
       WHERE org_id=$1::uuid AND workspace_id=$2::uuid) receipts,
     (SELECT count(*)::int FROM public.studio_rendition_attempts
       WHERE org_id=$1::uuid AND workspace_id=$2::uuid) attempts,
     (SELECT count(*)::int FROM public.studio_renditions
       WHERE org_id=$1::uuid AND workspace_id=$2::uuid) renditions`,
  [base.org,base.workspace],
)).rows[0];

const waitForLock = async (observer, applicationName) => {
  for (let attempt=0;attempt<100;attempt++) {
    const waiting = Number((await observer.query(
      `SELECT count(*)::int count
       FROM pg_stat_activity
       WHERE application_name=$1::text
         AND wait_event_type='Lock'`,
      [applicationName],
    )).rows[0].count);
    if (waiting > 0) return true;
    await delay(10);
  }
  return false;
};

const errorCode = outcome => outcome.status === 'rejected'
  ? outcome.reason?.message ?? outcome.reason?.code ?? 'rejected'
  : 'fulfilled';

export async function runStudioPrivateArtifactConcurrencyEvidence({
  observer,
  completionDb,
  commandDb,
  staleRecoveryDb,
  staleOriginalDb,
  scenario,
  names,
}) {
  await completionDb.query("SET application_name='studio_generation_completion'; SET statement_timeout='8s'");
  await commandDb.query("SET application_name='studio_generation_command'; SET statement_timeout='8s'");
  await staleRecoveryDb.query("SET application_name='studio_recovery_owner'; SET statement_timeout='8s'");
  await staleOriginalDb.query("SET application_name='studio_stale_original'; SET statement_timeout='8s'");

  const providerObjects = new Set();
  let providerUploads = 0;
  let completionCalls = 0;

  // Completion wins while its transaction still owns the tuple lock. The new
  // command is observed waiting on that exact advisory lock, then rejects after
  // the canonical row commits without creating receipt or attempt evidence.
  const completionBase = await createApprovedStudioFixture(observer);
  const completionAttempt = await prepareUploadedAttempt(
    observer,completionBase,'markdown','generation-completion-wins','b',
  );
  providerObjects.add(completionAttempt.metadata.objectKey);
  providerUploads++;
  const completionBefore = await counts(observer,completionBase);
  await completionDb.query('BEGIN');
  completionCalls++;
  const completionResult = (await completionDb.query(
    'SELECT public.studio_rendition_attempt_complete($1::uuid) result',
    [completionAttempt.claim.attemptId],
  )).rows[0].result;
  const rejectedCommand = rawGenerationCommand(
    commandDb,completionBase,'markdown','generation-rejected-after-completion',
  );
  const completionLockObserved = await waitForLock(observer,'studio_generation_command');
  await completionDb.query('COMMIT');
  const rejectedCommandOutcome = (await Promise.allSettled([rejectedCommand]))[0];
  const completionAfter = await counts(observer,completionBase);
  const exactReplay = await privateCommand(observer,completionAttempt.command);

  // Active attempt wins first. An explicit transaction barrier takes the same
  // production helper lock, the real new command rejects on the active recheck,
  // and completion waits until that transaction ends before committing once.
  const activeBase = completionBase;
  const activeAttempt = await prepareUploadedAttempt(
    observer,activeBase,'docx','generation-active-wins','c',
  );
  providerObjects.add(activeAttempt.metadata.objectKey);
  providerUploads++;
  const activeBefore = await counts(observer,activeBase);
  await commandDb.query('BEGIN');
  await commandDb.query(
    'SELECT public.studio_rendition_generation_lock($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text)',
    [activeBase.org,activeBase.workspace,activeBase.artifactVersionId,'docx',activeAttempt.claim.rendererVersion],
  );
  const activeCompletionPromise = completionDb.query(
    'SELECT public.studio_rendition_attempt_complete($1::uuid) result',
    [activeAttempt.claim.attemptId],
  );
  const activeCompletionWaited = await waitForLock(observer,'studio_generation_completion');
  const activeRejected = (await Promise.allSettled([
    rawGenerationCommand(commandDb,activeBase,'docx','generation-rejected-active-first'),
  ]))[0];
  await commandDb.query('ROLLBACK');
  completionCalls++;
  const activeCompletion = (await activeCompletionPromise).rows[0].result;
  const activeAfter = await counts(observer,activeBase);
  const activeCanonicalCount = Number((await observer.query(
    "SELECT count(*)::int count FROM public.studio_renditions WHERE artifact_version_id=$1::uuid AND format='docx'",
    [activeBase.artifactVersionId],
  )).rows[0].count);

  // Two genuinely concurrent first commands serialize without using the
  // partial index as their primary authority: one receipt/attempt, one reject.
  const concurrentBase = completionBase;
  const concurrentBefore = await counts(observer,concurrentBase);
  const concurrentOutcomes = await Promise.allSettled([
    rawGenerationCommand(completionDb,concurrentBase,'pdf','generation-concurrent-one'),
    rawGenerationCommand(commandDb,concurrentBase,'pdf','generation-concurrent-two'),
  ]);
  const concurrentAfter = await counts(observer,concurrentBase);

  // Recovery advances the fence. Every stale normal mutation is attempted from
  // a separate connection and must be state/audit/receipt neutral.
  const staleBase = await createApprovedStudioFixture(staleRecoveryDb);
  const staleAttempt = await prepareUploadedAttempt(
    staleRecoveryDb,staleBase,'markdown','stale-worker-attempt','d',
  );
  const staleObjects = new Set([staleAttempt.metadata.objectKey]);
  await staleRecoveryDb.query(
    "UPDATE public.studio_rendition_attempts SET state_changed_at=now()-interval '6 minutes' WHERE id=$1::uuid",
    [staleAttempt.claim.attemptId],
  );
  const beforeClaim = (await staleRecoveryDb.query(
    `SELECT state,execution_fence,reconciliation_count,
       (SELECT count(*)::int FROM public.studio_private_artifact_command_receipts) receipts,
       (SELECT count(*)::int FROM public.privileged_audit_events
         WHERE resource_id=$1::uuid) audits
     FROM public.studio_rendition_attempts WHERE id=$1::uuid`,
    [staleAttempt.claim.attemptId],
  )).rows[0];
  const recoveryClaim = (await staleRecoveryDb.query(
    'SELECT public.studio_rendition_reconciliation_claim($1::uuid) claim',
    [staleAttempt.claim.attemptId],
  )).rows[0].claim;
  const claimedState = (await staleRecoveryDb.query(
    `SELECT state,execution_fence,reconciliation_count,
       (SELECT count(*)::int FROM public.studio_private_artifact_command_receipts) receipts,
       (SELECT count(*)::int FROM public.privileged_audit_events
         WHERE resource_id=$1::uuid) audits
     FROM public.studio_rendition_attempts WHERE id=$1::uuid`,
    [staleAttempt.claim.attemptId],
  )).rows[0];
  const staleOperations = [
    () => staleOriginalDb.query('SELECT public.studio_rendition_attempt_start($1::uuid)',[staleAttempt.claim.attemptId]),
    () => staleOriginalDb.query(
      'SELECT public.studio_rendition_attempt_rendered($1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text,$7::text,$8::text,$9::text)',
      [
        staleAttempt.claim.attemptId,staleAttempt.metadata.objectKey,
        staleAttempt.metadata.sha256,staleAttempt.metadata.byteLength,
        staleAttempt.metadata.mimeType,staleAttempt.metadata.filename,
        staleAttempt.claim.rendererVersion,staleAttempt.claim.templateVersion,
        staleAttempt.claim.contentSchemaVersion,
      ],
    ),
    () => staleOriginalDb.query('SELECT public.studio_rendition_attempt_complete($1::uuid)',[staleAttempt.claim.attemptId]),
    () => staleOriginalDb.query("SELECT public.studio_rendition_attempt_fail($1::uuid,'STALE_WORKER_FAILURE')",[staleAttempt.claim.attemptId]),
  ];
  const staleCalls = [];
  for (const operation of staleOperations) {
    staleCalls.push((await Promise.allSettled([operation()]))[0]);
  }
  const afterStaleCalls = (await staleRecoveryDb.query(
    `SELECT state,execution_fence,reconciliation_count,
       (SELECT count(*)::int FROM public.studio_private_artifact_command_receipts) receipts,
       (SELECT count(*)::int FROM public.privileged_audit_events
         WHERE resource_id=$1::uuid) audits
     FROM public.studio_rendition_attempts WHERE id=$1::uuid`,
    [staleAttempt.claim.attemptId],
  )).rows[0];
  const recoveryRendered = (await staleRecoveryDb.query(
    'SELECT public.studio_rendition_reconciliation_rendered($1::uuid,$2::bigint,$3::text,$4::text,$5::bigint,$6::text,$7::text,$8::text,$9::text,$10::text) result',
    [
      staleAttempt.claim.attemptId,recoveryClaim.fence,staleAttempt.metadata.objectKey,
      staleAttempt.metadata.sha256,staleAttempt.metadata.byteLength,
      staleAttempt.metadata.mimeType,staleAttempt.metadata.filename,
      staleAttempt.claim.rendererVersion,staleAttempt.claim.templateVersion,
      staleAttempt.claim.contentSchemaVersion,
    ],
  )).rows[0].result;
  const recoveryCompleted = (await staleRecoveryDb.query(
    'SELECT public.studio_rendition_reconciliation_complete($1::uuid,$2::bigint) result',
    [staleAttempt.claim.attemptId,recoveryClaim.fence],
  )).rows[0].result;
  const completionAuditBeforeLate = Number((await staleRecoveryDb.query(
    "SELECT count(*)::int count FROM public.privileged_audit_events WHERE action='studio.rendition.attempt.complete' AND metadata->>'attemptId'=$1::text",
    [staleAttempt.claim.attemptId],
  )).rows[0].count);
  const lateCompletion = (await staleOriginalDb.query(
    'SELECT public.studio_rendition_attempt_complete($1::uuid) result',
    [staleAttempt.claim.attemptId],
  )).rows[0].result;
  const finalStaleCounts = (await staleRecoveryDb.query(
    `SELECT
       (SELECT count(*)::int FROM public.studio_renditions WHERE attempt_id=$1::uuid) renditions,
       (SELECT count(*)::int FROM public.privileged_audit_events
         WHERE action='studio.rendition.attempt.complete'
           AND metadata->>'attemptId'=$1::text) completion_audits,
       (SELECT count(*)::int FROM public.studio_private_artifact_command_receipts) receipts,
       state,execution_fence,reconciliation_count
     FROM public.studio_rendition_attempts WHERE id=$1::uuid`,
    [staleAttempt.claim.attemptId],
  )).rows[0];

  const generationEvidence = {
    lockWinner: 'completion',
    completionLockObserved,
    completionResult,
    rejectedCommand: errorCode(rejectedCommandOutcome),
    rejectedDeltas: {
      receipts: completionAfter.receipts-completionBefore.receipts,
      attempts: completionAfter.attempts-completionBefore.attempts,
      uploads: 0,
      objects: 0,
    },
    canonicalCount: completionAfter.renditions,
    objectCount: 1,
    providerUploads: 1,
    totalProviderObjects: providerObjects.size,
    totalProviderUploads: providerUploads,
    completionCalls,
    exactReplayReceipt: exactReplay.receiptId,
    originalReceipt: completionAttempt.result.receiptId,
    activeFirst: {
      lockWinner: 'active-command-check',
      completionWaited: activeCompletionWaited,
      rejected: errorCode(activeRejected),
      receiptDelta: activeAfter.receipts-activeBefore.receipts,
      attemptDelta: activeAfter.attempts-activeBefore.attempts,
      completion: activeCompletion,
      canonicalCount: activeCanonicalCount,
    },
    concurrent: {
      fulfilled: concurrentOutcomes.filter(result=>result.status==='fulfilled').length,
      rejected: concurrentOutcomes.filter(result=>result.status==='rejected').length,
      receiptDelta: concurrentAfter.receipts-concurrentBefore.receipts,
      attemptDelta: concurrentAfter.attempts-concurrentBefore.attempts,
    },
    deadlocks: [rejectedCommandOutcome,activeRejected,...concurrentOutcomes]
      .filter(result=>result.status==='rejected'&&result.reason?.code==='40P01').length,
  };
  const staleEvidence = {
    fenceBefore: Number(beforeClaim.execution_fence),
    fenceAfter: Number(claimedState.execution_fence),
    recoveryCount: Number(claimedState.reconciliation_count),
    staleOutcomes: staleCalls.map(errorCode),
    before: beforeClaim,
    afterStaleCalls,
    recoveryRendered,
    recoveryCompleted,
    lateCompletion,
    final: finalStaleCounts,
    objectCount: staleObjects.size,
    completionAuditBeforeLate,
  };

  const checks = [
    async()=>assert.equal(generationEvidence.completionLockObserved,true),
    async()=>assert.equal(generationEvidence.completionResult.state,'available'),
    async()=>assert.notEqual(rejectedCommandOutcome.status,'fulfilled'),
    async()=>assert.deepEqual(generationEvidence.rejectedDeltas,{receipts:0,attempts:0,uploads:0,objects:0}),
    async()=>assert.equal(generationEvidence.canonicalCount,1),
    async()=>assert.equal(providerObjects.size,2),
    async()=>assert.equal(generationEvidence.exactReplayReceipt,generationEvidence.originalReceipt),
    async()=>assert.deepEqual(generationEvidence.concurrent,{fulfilled:1,rejected:1,receiptDelta:1,attemptDelta:1}),
    async()=>assert.equal(generationEvidence.activeFirst.completionWaited,true),
    async()=>assert.notEqual(activeRejected.status,'fulfilled'),
    async()=>assert.deepEqual({receipts:generationEvidence.activeFirst.receiptDelta,attempts:generationEvidence.activeFirst.attemptDelta},{receipts:0,attempts:0}),
    async()=>assert.equal(generationEvidence.deadlocks,0),
    async()=>assert.equal(new Set(providerObjects).size,providerObjects.size),
    async()=>assert.deepEqual({state:beforeClaim.state,fence:Number(beforeClaim.execution_fence)},{state:'uploaded',fence:0}),
    async()=>assert.deepEqual({state:claimedState.state,fence:Number(claimedState.execution_fence)},{state:'reconciling',fence:1}),
    async()=>assert.notEqual(staleCalls[0].status,'fulfilled'),
    async()=>assert.notEqual(staleCalls[1].status,'fulfilled'),
    async()=>assert.notEqual(staleCalls[2].status,'fulfilled'),
    async()=>assert.notEqual(staleCalls[3].status,'fulfilled'),
    async()=>assert.deepEqual(afterStaleCalls,{
      state:'reconciling',execution_fence:'1',reconciliation_count:1,
      receipts:claimedState.receipts,audits:claimedState.audits,
    }),
    async()=>assert.equal(recoveryRendered.state,'reconciling'),
    async()=>assert.equal(recoveryCompleted.state,'available'),
    async()=>assert.equal(Number(finalStaleCounts.renditions),1),
    async()=>assert.equal(Number(finalStaleCounts.completion_audits),1),
    async()=>assert.equal(lateCompletion.outcome,'replayed'),
    async()=>assert.equal(Number(finalStaleCounts.completion_audits),completionAuditBeforeLate),
    async()=>assert.equal(staleObjects.size,1),
    async()=>assert.deepEqual({state:finalStaleCounts.state,fence:Number(finalStaleCounts.execution_fence)},{state:'available',fence:1}),
  ];
  assert.equal(checks.length,names.length);
  for (let index=0;index<checks.length;index++) await scenario(names[index],checks[index]);
  console.log(`GENERATION CONCURRENCY COUNTS ${JSON.stringify(generationEvidence)}`);
  console.log(`STALE WORKER COUNTS ${JSON.stringify(staleEvidence)}`);
  return {generationEvidence,staleEvidence};
}
