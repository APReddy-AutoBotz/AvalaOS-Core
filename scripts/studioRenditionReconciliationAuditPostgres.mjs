import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApprovedStudioFixture,privateCommand} from './studioPrivateArtifactPostgresFixture.mjs';

const claimAction='studio.rendition.reconciliation.claim';
const exhaustionAction='studio.rendition.reconciliation.exhausted';
const forbidden=/(bucket|objectKey|signedUrl|approvedContent|credential|privateClaim|serviceRole)/iu;

const countAction=async(db,action,attemptId)=>Number((await db.query(
  `SELECT count(*)::int n FROM public.privileged_audit_events
   WHERE action=$1::text AND resource_id=$2::uuid`,
  [action,attemptId],
)).rows[0].n);

const snapshot=async(db,attemptId)=>(await db.query(
  `SELECT state,reconciliation_count,reconciliation_claimed_at,execution_fence,
          state_changed_at,completed_at,failure_code
   FROM public.studio_rendition_attempts WHERE id=$1::uuid`,
  [attemptId],
)).rows[0];

const setAttempt=async(db,attemptId,values)=>{
  const columns=[];const params=[attemptId];
  for(const [name,value] of Object.entries(values)){params.push(value);columns.push(`${name}=$${params.length}`)}
  await db.query(`UPDATE public.studio_rendition_attempts SET ${columns.join(',')} WHERE id=$1::uuid`,params);
};

const makeStale=async(db,attemptId)=>db.query(
  "UPDATE public.studio_rendition_attempts SET state_changed_at=now()-interval '6 minutes' WHERE id=$1::uuid",
  [attemptId],
);

const claim=async(db,attemptId)=>(await db.query(
  'SELECT public.studio_rendition_reconciliation_claim($1::uuid) claim',[attemptId],
)).rows[0].claim;

const installAuditFailure=async(db,action)=>{
  await db.query(`
    CREATE OR REPLACE FUNCTION public.reject_rendition_reconciliation_audit()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.action = '${action}' THEN
        RAISE EXCEPTION 'forced rendition reconciliation audit insertion failure';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER reject_rendition_reconciliation_audit
    BEFORE INSERT ON public.privileged_audit_events
    FOR EACH ROW EXECUTE FUNCTION public.reject_rendition_reconciliation_audit();
  `);
};

const removeAuditFailure=async db=>db.query(`
  DROP TRIGGER reject_rendition_reconciliation_audit ON public.privileged_audit_events;
  DROP FUNCTION public.reject_rendition_reconciliation_audit();
`);

export async function runStudioRenditionReconciliationAuditEvidence({db,peer,scenario,names}){
  const base=await createApprovedStudioFixture(db);
  const generation=await privateCommand(db,{
    commandType:'studio.rendition.generate',actorId:base.requester,
    organizationId:base.org,workspaceId:base.workspace,requestId:randomUUID(),
    idempotencyKey:'rendition-reconciliation-audit',
    authorizationVersion:base.authorizationVersions[base.requester],
    payload:{artifactVersionId:base.artifactVersionId,format:'markdown'},
  });
  const attemptId=generation.renditionClaim.attemptId;
  const attempt=(await db.query(
    'SELECT * FROM public.studio_rendition_attempts WHERE id=$1::uuid',[attemptId],
  )).rows[0];
  const objectKey=`${base.org}/${base.workspace}/studio-artifacts/${generation.renditionClaim.opaqueObjectId}.md`;

  const freshBefore=await countAction(db,claimAction,attemptId);
  const freshClaim=await claim(db,attemptId);
  const freshAfter=await countAction(db,claimAction,attemptId);

  await makeStale(db,attemptId);
  const requestedClaim=await claim(db,attemptId);
  const requestedAudit=(await db.query(
    `SELECT * FROM public.privileged_audit_events
     WHERE action=$1::text AND resource_id=$2::uuid
     ORDER BY created_at,id DESC LIMIT 1`,[claimAction,attemptId],
  )).rows[0];
  const immediateBefore=await countAction(db,claimAction,attemptId);
  const immediateReplay=await claim(peer,attemptId);
  const immediateAfter=await countAction(db,claimAction,attemptId);

  await setAttempt(db,attemptId,{state:'rendering',reconciliation_count:0,reconciliation_claimed_at:null,execution_fence:requestedClaim.fence,completed_at:null});
  await makeStale(db,attemptId);
  const renderingClaim=await claim(db,attemptId);

  await setAttempt(db,attemptId,{
    state:'uploaded',storage_provider:'supabase',bucket_id:'studio-private-artifacts',object_key:objectKey,
    content_hash:'a'.repeat(64),byte_length:128,mime_type:'text/markdown; charset=utf-8',
    safe_filename:'recovery.md',reconciliation_count:0,reconciliation_claimed_at:null,
    execution_fence:renderingClaim.fence,completed_at:null,
  });
  await makeStale(db,attemptId);
  const uploadedClaim=await claim(db,attemptId);

  await setAttempt(db,attemptId,{state:'reconciliation_required',reconciliation_count:1,reconciliation_claimed_at:null,execution_fence:uploadedClaim.fence,completed_at:null});
  const requiredClaim=await claim(db,attemptId);

  await setAttempt(db,attemptId,{state:'reconciling',reconciliation_count:1,reconciliation_claimed_at:new Date(Date.now()-360000),execution_fence:requiredClaim.fence,completed_at:null});
  const reclaim=await claim(db,attemptId);

  const phaseAudits=(await db.query(
    `SELECT actor_id,request_id,outcome,resource_version,metadata
     FROM public.privileged_audit_events
     WHERE action=$1::text AND resource_id=$2::uuid ORDER BY created_at,id`,
    [claimAction,attemptId],
  )).rows;
  const persistedAfterReclaim=await snapshot(db,attemptId);

  await setAttempt(db,attemptId,{state:'requested',reconciliation_count:0,reconciliation_claimed_at:null,execution_fence:reclaim.fence,completed_at:null,failure_code:null});
  await makeStale(db,attemptId);
  const concurrentBefore=await countAction(db,claimAction,attemptId);
  const concurrentResults=await Promise.all([claim(db,attemptId),claim(peer,attemptId)]);
  const concurrentAfter=await countAction(db,claimAction,attemptId);

  await setAttempt(db,attemptId,{state:'requested',reconciliation_count:0,reconciliation_claimed_at:null,execution_fence:Math.max(...concurrentResults.filter(Boolean).map(x=>Number(x.fence))),completed_at:null,failure_code:null});
  await makeStale(db,attemptId);
  const forcedClaimBefore=await snapshot(db,attemptId);
  const forcedClaimAuditBefore=await countAction(db,claimAction,attemptId);
  await installAuditFailure(db,claimAction);
  await assert.rejects(claim(db,attemptId),/forced rendition reconciliation audit insertion failure/);
  await removeAuditFailure(db);
  const forcedClaimAfter=await snapshot(db,attemptId);
  const forcedClaimAuditAfter=await countAction(db,claimAction,attemptId);

  await setAttempt(db,attemptId,{state:'reconciling',reconciliation_count:2,reconciliation_claimed_at:new Date(Date.now()-360000),execution_fence:Number(forcedClaimBefore.execution_fence),completed_at:null,failure_code:null});
  const exhaustionResult=await claim(db,attemptId);
  const exhaustedState=await snapshot(db,attemptId);
  const exhaustionAudits=(await db.query(
    `SELECT actor_id,request_id,outcome,resource_version,metadata
     FROM public.privileged_audit_events
     WHERE action=$1::text AND resource_id=$2::uuid ORDER BY created_at,id`,
    [exhaustionAction,attemptId],
  )).rows;
  const duplicateExhaustionBefore=exhaustionAudits.length;
  const duplicateExhaustionResult=await claim(db,attemptId);
  const duplicateExhaustionAfter=await countAction(db,exhaustionAction,attemptId);

  await setAttempt(db,attemptId,{state:'reconciling',reconciliation_count:2,reconciliation_claimed_at:new Date(Date.now()-360000),execution_fence:Number(exhaustedState.execution_fence)+1,completed_at:null,failure_code:null});
  const forcedExhaustionBefore=await snapshot(db,attemptId);
  const forcedExhaustionAuditBefore=await countAction(db,exhaustionAction,attemptId);
  await installAuditFailure(db,exhaustionAction);
  await assert.rejects(claim(db,attemptId),/forced rendition reconciliation audit insertion failure/);
  await removeAuditFailure(db);
  const forcedExhaustionAfter=await snapshot(db,attemptId);
  const forcedExhaustionAuditAfter=await countAction(db,exhaustionAction,attemptId);

  await setAttempt(db,attemptId,{state:'requested',reconciliation_count:0,reconciliation_claimed_at:null,execution_fence:Number(forcedExhaustionBefore.execution_fence)+1,completed_at:null,failure_code:null});
  await makeStale(db,attemptId);
  const authorityAuditBefore=await countAction(db,claimAction,attemptId);
  await db.query('UPDATE public.authorization_versions SET version=version+1 WHERE org_id=$1::uuid AND user_id=$2::uuid',[base.org,base.requester]);
  await assert.rejects(claim(db,attemptId));
  const authorityAuditAfter=await countAction(db,claimAction,attemptId);

  const claimMetadata=phaseAudits.map(row=>row.metadata);
  const exhaustionMetadata=exhaustionAudits.map(row=>row.metadata);
  const checks=[
    async()=>assert.deepEqual({claim:freshClaim,auditDelta:freshAfter-freshBefore},{claim:null,auditDelta:0}),
    async()=>assert.deepEqual({state:requestedAudit.metadata.previousState,count:requestedAudit.metadata.reconciliationCount},{state:'requested',count:1}),
    async()=>assert.ok(phaseAudits.some(row=>row.metadata.previousState==='rendering')),
    async()=>assert.ok(phaseAudits.some(row=>row.metadata.previousState==='uploaded')),
    async()=>assert.ok(phaseAudits.some(row=>row.metadata.previousState==='reconciliation_required')),
    async()=>assert.deepEqual({previousFence:Number(reclaim.fence)-1,fence:Number(reclaim.fence),count:Number(reclaim.reconciliationCount)},{previousFence:Number(requiredClaim.fence),fence:Number(requiredClaim.fence)+1,count:2}),
    async()=>assert.deepEqual(claimMetadata.map(x=>x.recoveryPhase),['pre_render','pre_render','verify_or_upload','verify_or_upload','verify_or_upload']),
    async()=>{for(const row of phaseAudits)assert.equal(Number(row.metadata.executionFence),Number(row.resource_version))},
    async()=>assert.equal(Number(persistedAfterReclaim.reconciliation_count),Number(reclaim.reconciliationCount)),
    async()=>{for(const row of phaseAudits)assert.equal(row.actor_id,attempt.requested_by)},
    async()=>{for(const row of phaseAudits)assert.equal(row.request_id,attempt.request_id)},
    async()=>{for(const metadata of claimMetadata)assert.doesNotMatch(JSON.stringify(metadata),forbidden)},
    async()=>assert.equal(concurrentResults.filter(Boolean).length,1),
    async()=>assert.equal(concurrentAfter-concurrentBefore,1),
    async()=>assert.deepEqual({claim:immediateReplay,auditDelta:immediateAfter-immediateBefore},{claim:null,auditDelta:0}),
    async()=>assert.deepEqual({before:forcedClaimBefore,after:forcedClaimAfter,auditDelta:forcedClaimAuditAfter-forcedClaimAuditBefore},{before:forcedClaimBefore,after:forcedClaimBefore,auditDelta:0}),
    async()=>assert.equal(authorityAuditAfter-authorityAuditBefore,0),
    async()=>assert.deepEqual({claim:exhaustionResult,state:exhaustedState.state,failureCode:exhaustedState.failure_code,count:Number(exhaustedState.reconciliation_count)},{claim:null,state:'failed',failureCode:'RECONCILIATION_EXHAUSTED',count:3}),
    async()=>assert.equal(exhaustionAudits.length,1),
    async()=>assert.equal(exhaustionAudits[0].outcome,'failed'),
    async()=>assert.equal(exhaustionAudits[0].metadata.failureCode,'RECONCILIATION_EXHAUSTED'),
    async()=>assert.equal(Number(exhaustionAudits[0].metadata.reconciliationCount),3),
    async()=>assert.deepEqual({actor:exhaustionAudits[0].actor_id,request:exhaustionAudits[0].request_id},{actor:attempt.requested_by,request:attempt.request_id}),
    async()=>assert.deepEqual({claim:duplicateExhaustionResult,auditDelta:duplicateExhaustionAfter-duplicateExhaustionBefore},{claim:null,auditDelta:0}),
    async()=>assert.deepEqual({before:forcedExhaustionBefore,after:forcedExhaustionAfter,auditDelta:forcedExhaustionAuditAfter-forcedExhaustionAuditBefore},{before:forcedExhaustionBefore,after:forcedExhaustionBefore,auditDelta:0}),
    async()=>{for(const metadata of exhaustionMetadata)assert.doesNotMatch(JSON.stringify(metadata),forbidden)},
  ];
  assert.equal(checks.length,names.length);
  for(let index=0;index<checks.length;index++)await scenario(names[index],checks[index]);
  const finalClaimAudits=(await db.query(
    `SELECT metadata FROM public.privileged_audit_events
     WHERE action=$1::text AND resource_id=$2::uuid ORDER BY created_at,id`,
    [claimAction,attemptId],
  )).rows;
  const evidence={
    claimEvents:finalClaimAudits.length,
    claimStates:Object.fromEntries(['requested','rendering','uploaded','reconciliation_required','reconciling'].map(state=>[state,finalClaimAudits.filter(row=>row.metadata.previousState===state).length])),
    claimPhases:Object.fromEntries(['pre_render','verify_or_upload'].map(phase=>[phase,finalClaimAudits.filter(row=>row.metadata.recoveryPhase===phase).length])),
    concurrent:{executableClaims:concurrentResults.filter(Boolean).length,auditDelta:concurrentAfter-concurrentBefore},
    immediateReplayAuditDelta:immediateAfter-immediateBefore,
    reclaim:{fence:Number(reclaim.fence),count:Number(reclaim.reconciliationCount)},
    exhaustionEvents:exhaustionAudits.length,
    duplicateExhaustionAuditDelta:duplicateExhaustionAfter-duplicateExhaustionBefore,
    forcedClaimAuditDelta:forcedClaimAuditAfter-forcedClaimAuditBefore,
    forcedExhaustionAuditDelta:forcedExhaustionAuditAfter-forcedExhaustionAuditBefore,
  };
  console.log(`RENDITION RECONCILIATION AUDIT COUNTS ${JSON.stringify(evidence)}`);
  return evidence;
}
