import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApprovedStudioFixture,privateCommand} from './studioPrivateArtifactPostgresFixture.mjs';

const claimAction='studio.rendition.deletion.reconciliation.claim';
const exhaustionAction='studio.rendition.deletion.reconciliation.exhausted';
const forbidden=/(bucket|objectKey|object_key|signedUrl|signed_url|storageBinding|storage_provider|provider|credential|approvedContent|privateClaim|serviceRole|workerSecret|secret)/iu;
const claimMetadataKeys=[
  'deletionAttemptId','deletionRequestId','executionFence','previousReconciliationCount',
  'previousState','reconciliationCount','recoveryKind','resolutionId',
  'resultingLifecycleVersion',
].sort();

export const studioDeletionReconciliationClaimAuditScenarioNames=[
  'deletion reconciliation requested ownership records one claim event',
  'deletion reconciliation executing ownership records one claim event',
  'deletion reconciliation required ownership records one claim event',
  'deletion reconciliation expired lease reclaim records one claim event',
  'deletion reconciliation claim metadata has the exact safe contract',
  'deletion reconciliation claim actor is the independent resolver',
  'deletion reconciliation claim request traces to accepted resolution receipt',
  'deletion reconciliation claim resource is the canonical rendition',
  'deletion reconciliation claim version matches the rendition lifecycle',
  'deletion reconciliation claim records prior and resulting counts',
  'deletion reconciliation claim records deletion recovery kind',
  'deletion reconciliation claim records the durable execution fence',
  'deletion reconciliation two workers return one executable ownership claim',
  'deletion reconciliation two workers record one claim event',
  'deletion reconciliation active lease replay returns no claim',
  'deletion reconciliation active lease replay records no event',
  'deletion reconciliation forced claim audit failure rolls back ownership',
  'deletion reconciliation forced claim audit failure records no event',
  'deletion reconciliation claim evidence excludes private authority',
  'deletion reconciliation forced exhaustion audit failure rolls back terminal state',
  'deletion reconciliation forced exhaustion audit failure records no event',
  'deletion reconciliation exhaustion preserves terminal attempt and rendition state',
  'deletion reconciliation exhaustion records exactly one terminal event',
  'deletion reconciliation exhaustion emits no successful claim event',
  'deletion reconciliation exhausted replay records no event',
  'deletion reconciliation exhaustion traces independent resolver and accepted request',
  'deletion reconciliation exhaustion evidence excludes private authority',
];

const countAction=async(db,action,attemptId)=>Number((await db.query(
  `SELECT count(*)::int n
   FROM public.privileged_audit_events
   WHERE action=$1::text AND metadata->>'deletionAttemptId'=$2::text`,
  [action,attemptId],
)).rows[0].n);

const attemptSnapshot=async(db,attemptId)=>(await db.query(
  `SELECT a.state,a.failure_code,a.reconciliation_count,a.reconciliation_claimed_at,
          a.execution_fence,a.execution_claimed_at,a.state_changed_at,a.completed_at,
          r.lifecycle,r.lifecycle_version
   FROM public.studio_rendition_deletion_attempts a
   JOIN public.studio_renditions r ON r.id=a.rendition_id
   WHERE a.id=$1::uuid`,
  [attemptId],
)).rows[0];

const setAttempt=async(db,attemptId,values)=>{
  const columns=[];const params=[attemptId];
  for(const [name,value] of Object.entries(values)){
    params.push(value);columns.push(`${name}=$${params.length}`);
  }
  await db.query(
    `UPDATE public.studio_rendition_deletion_attempts SET ${columns.join(',')} WHERE id=$1::uuid`,
    params,
  );
};

const makeStateStale=async(db,attemptId)=>db.query(
  "UPDATE public.studio_rendition_deletion_attempts SET state_changed_at=now()-interval '6 minutes' WHERE id=$1::uuid",
  [attemptId],
);

const claim=async(db,attemptId)=>(await db.query(
  'SELECT public.studio_deletion_reconciliation_claim($1::uuid) claim',[attemptId],
)).rows[0].claim;

const actionRows=async(db,action,attemptId)=>(await db.query(
  `SELECT actor_id,request_id,resource_type,resource_id,outcome,resource_version,metadata
   FROM public.privileged_audit_events
   WHERE action=$1::text AND metadata->>'deletionAttemptId'=$2::text
   ORDER BY created_at,id`,
  [action,attemptId],
)).rows;

const installAuditFailure=async(db,action)=>{
  await db.query(`
    CREATE OR REPLACE FUNCTION public.reject_deletion_reconciliation_claim_audit()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.action = '${action}' THEN
        RAISE EXCEPTION 'forced deletion reconciliation audit insertion failure';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER reject_deletion_reconciliation_claim_audit
    BEFORE INSERT ON public.privileged_audit_events
    FOR EACH ROW EXECUTE FUNCTION public.reject_deletion_reconciliation_claim_audit();
  `);
};

const removeAuditFailure=async db=>db.query(`
  DROP TRIGGER reject_deletion_reconciliation_claim_audit ON public.privileged_audit_events;
  DROP FUNCTION public.reject_deletion_reconciliation_claim_audit();
`);

const createDeletionFixture=async db=>{
  const base=await createApprovedStudioFixture(db);
  await privateCommand(db,{
    commandType:'studio.retention.policy.publish',actorId:base.requester,
    organizationId:base.org,workspaceId:base.workspace,requestId:randomUUID(),
    idempotencyKey:`deletion-claim-retention-${randomUUID()}`,
    authorizationVersion:base.authorizationVersions[base.requester],
    payload:{artifactType:'brd',retentionDays:0,indefinite:false,rationale:'disposable deletion claim audit evidence'},
  });
  const generation=await privateCommand(db,{
    commandType:'studio.rendition.generate',actorId:base.requester,
    organizationId:base.org,workspaceId:base.workspace,requestId:randomUUID(),
    idempotencyKey:`deletion-claim-generation-${randomUUID()}`,
    authorizationVersion:base.authorizationVersions[base.requester],
    payload:{artifactVersionId:base.artifactVersionId,format:'markdown'},
  });
  const renditionClaim=generation.renditionClaim;
  const objectKey=`${base.org}/${base.workspace}/studio-artifacts/${renditionClaim.opaqueObjectId}.md`;
  await db.query('SELECT public.studio_rendition_attempt_start($1::uuid)',[renditionClaim.attemptId]);
  await db.query(
    'SELECT public.studio_rendition_attempt_rendered($1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text,$7::text,$8::text,$9::text)',
    [renditionClaim.attemptId,objectKey,'d'.repeat(64),128,'text/markdown; charset=utf-8','deletion-claim.md',renditionClaim.rendererVersion,renditionClaim.templateVersion,renditionClaim.contentSchemaVersion],
  );
  const completion=(await db.query(
    'SELECT public.studio_rendition_attempt_complete($1::uuid) result',[renditionClaim.attemptId],
  )).rows[0].result;
  const deletionRequest=await privateCommand(db,{
    commandType:'studio.rendition.deletion.request',actorId:base.requester,
    organizationId:base.org,workspaceId:base.workspace,requestId:randomUUID(),
    idempotencyKey:`deletion-claim-request-${randomUUID()}`,
    authorizationVersion:base.authorizationVersions[base.requester],
    payload:{renditionId:completion.renditionId,rationale:'disposable deletion claim audit request'},
  });
  const approval=await privateCommand(db,{
    commandType:'studio.rendition.deletion.resolve',actorId:base.approver,
    organizationId:base.org,workspaceId:base.workspace,requestId:randomUUID(),
    idempotencyKey:`deletion-claim-approval-${randomUUID()}`,
    authorizationVersion:base.authorizationVersions[base.approver],
    payload:{
      renditionId:completion.renditionId,
      deletionRequestId:deletionRequest.resource.deletionRequestId,
      outcome:'approve',rationale:'independent disposable deletion claim approval',
    },
  });
  const attemptId=approval.deletionClaim.deletionAttemptId;
  const authority=(await db.query(
    `SELECT a.id attempt_id,a.request_id deletion_request_id,a.execution_fence,
            a.reconciliation_count,a.rendition_id,d.id resolution_id,d.resolved_by,
            cr.request_id command_request_id,r.lifecycle_version
     FROM public.studio_rendition_deletion_attempts a
     JOIN public.studio_rendition_deletion_resolutions d ON d.id=a.resolution_id
     JOIN public.studio_private_artifact_command_receipts cr ON cr.id=d.receipt_id
     JOIN public.studio_renditions r ON r.id=a.rendition_id
     WHERE a.id=$1::uuid`,
    [attemptId],
  )).rows[0];
  return{base,attemptId,renditionId:completion.renditionId,authority};
};

export async function runStudioDeletionReconciliationClaimAuditEvidence({db,peer,scenario,names=studioDeletionReconciliationClaimAuditScenarioNames}){
  const fixture=await createDeletionFixture(db);
  const {attemptId,renditionId,authority}=fixture;
  const initialFence=Number(authority.execution_fence);

  await makeStateStale(db,attemptId);
  const requestedClaim=await claim(db,attemptId);

  await setAttempt(db,attemptId,{
    state:'executing',failure_code:null,reconciliation_count:0,reconciliation_claimed_at:null,
    execution_fence:initialFence+1,execution_claimed_at:new Date(Date.now()-360000),completed_at:null,
  });
  await makeStateStale(db,attemptId);
  const executingClaim=await claim(db,attemptId);

  await setAttempt(db,attemptId,{
    state:'reconciliation_required',failure_code:'DELETE_OUTCOME_UNKNOWN',reconciliation_count:1,
    reconciliation_claimed_at:null,execution_fence:initialFence+2,execution_claimed_at:null,completed_at:null,
  });
  const requiredClaim=await claim(db,attemptId);

  await setAttempt(db,attemptId,{
    state:'reconciling',failure_code:null,reconciliation_count:1,
    reconciliation_claimed_at:new Date(Date.now()-360000),execution_fence:initialFence+3,
    execution_claimed_at:null,completed_at:null,
  });
  const reclaim=await claim(db,attemptId);
  const activeBefore=await countAction(db,claimAction,attemptId);
  const activeReplay=await claim(peer,attemptId);
  const activeAfter=await countAction(db,claimAction,attemptId);

  const phaseAudits=await actionRows(db,claimAction,attemptId);
  const phaseByState=Object.fromEntries(
    ['requested','executing','reconciliation_required','reconciling'].map(state=>[
      state,phaseAudits.filter(row=>row.metadata.previousState===state),
    ]),
  );

  await setAttempt(db,attemptId,{
    state:'reconciliation_required',failure_code:'DELETE_OUTCOME_UNKNOWN',reconciliation_count:0,
    reconciliation_claimed_at:null,execution_fence:initialFence+4,execution_claimed_at:null,completed_at:null,
  });
  const concurrentBefore=await countAction(db,claimAction,attemptId);
  const concurrentResults=await Promise.all([claim(db,attemptId),claim(peer,attemptId)]);
  const concurrentAfter=await countAction(db,claimAction,attemptId);
  const exactClaimRows=await actionRows(db,claimAction,attemptId);

  await setAttempt(db,attemptId,{
    state:'reconciliation_required',failure_code:'DELETE_OUTCOME_UNKNOWN',reconciliation_count:0,
    reconciliation_claimed_at:null,execution_fence:initialFence+5,execution_claimed_at:null,completed_at:null,
  });
  const forcedClaimBefore=await attemptSnapshot(db,attemptId);
  const forcedClaimAuditBefore=await countAction(db,claimAction,attemptId);
  await installAuditFailure(db,claimAction);
  try{
    await assert.rejects(claim(db,attemptId),/forced deletion reconciliation audit insertion failure/);
  }finally{
    await removeAuditFailure(db);
  }
  const forcedClaimAfter=await attemptSnapshot(db,attemptId);
  const forcedClaimAuditAfter=await countAction(db,claimAction,attemptId);

  await setAttempt(db,attemptId,{
    state:'reconciling',failure_code:'DELETE_OUTCOME_UNKNOWN',reconciliation_count:3,
    reconciliation_claimed_at:new Date(Date.now()-360000),execution_fence:initialFence+6,
    execution_claimed_at:null,completed_at:null,
  });
  const forcedExhaustionBefore=await attemptSnapshot(db,attemptId);
  const forcedExhaustionClaimBefore=await countAction(db,claimAction,attemptId);
  const forcedExhaustionAuditBefore=await countAction(db,exhaustionAction,attemptId);
  await installAuditFailure(db,exhaustionAction);
  try{
    await assert.rejects(claim(db,attemptId),/forced deletion reconciliation audit insertion failure/);
  }finally{
    await removeAuditFailure(db);
  }
  const forcedExhaustionAfter=await attemptSnapshot(db,attemptId);
  const forcedExhaustionClaimAfter=await countAction(db,claimAction,attemptId);
  const forcedExhaustionAuditAfter=await countAction(db,exhaustionAction,attemptId);

  const exhaustionClaimBefore=await countAction(db,claimAction,attemptId);
  const exhaustionResult=await claim(db,attemptId);
  const exhaustedState=await attemptSnapshot(db,attemptId);
  const exhaustionClaimAfter=await countAction(db,claimAction,attemptId);
  const exhaustionAudits=await actionRows(db,exhaustionAction,attemptId);
  const replayClaimBefore=await countAction(db,claimAction,attemptId);
  const replayExhaustionBefore=await countAction(db,exhaustionAction,attemptId);
  const exhaustedReplay=await claim(peer,attemptId);
  const replayClaimAfter=await countAction(db,claimAction,attemptId);
  const replayExhaustionAfter=await countAction(db,exhaustionAction,attemptId);

  const allSafeValues=[
    requestedClaim,executingClaim,requiredClaim,reclaim,
    ...concurrentResults,...exactClaimRows.map(row=>row.metadata),...exhaustionAudits.map(row=>row.metadata),
  ];
  const checks=[
    async()=>assert.equal(phaseByState.requested.length,1),
    async()=>assert.equal(phaseByState.executing.length,1),
    async()=>assert.equal(phaseByState.reconciliation_required.length,1),
    async()=>assert.equal(phaseByState.reconciling.length,1),
    async()=>{for(const row of exactClaimRows){
      assert.deepEqual(Object.keys(row.metadata).sort(),claimMetadataKeys);
      assert.deepEqual(
        {attempt:row.metadata.deletionAttemptId,request:row.metadata.deletionRequestId,resolution:row.metadata.resolutionId},
        {attempt:attemptId,request:authority.deletion_request_id,resolution:authority.resolution_id},
      );
    }},
    async()=>{for(const row of exactClaimRows)assert.equal(row.actor_id,authority.resolved_by)},
    async()=>{for(const row of exactClaimRows)assert.equal(row.request_id,authority.command_request_id)},
    async()=>{for(const row of exactClaimRows)assert.deepEqual({type:row.resource_type,id:row.resource_id},{type:'studio_rendition',id:renditionId})},
    async()=>{for(const row of exactClaimRows)assert.equal(Number(row.metadata.resultingLifecycleVersion),Number(row.resource_version))},
    async()=>{for(const row of exactClaimRows)assert.equal(Number(row.metadata.reconciliationCount),Number(row.metadata.previousReconciliationCount)+1)},
    async()=>{for(const row of exactClaimRows)assert.equal(row.metadata.recoveryKind,'deletion')},
    async()=>assert.deepEqual(
      exactClaimRows.map(row=>Number(row.metadata.executionFence)).sort((left,right)=>left-right),
      [initialFence,initialFence+1,initialFence+2,initialFence+3,initialFence+4],
    ),
    async()=>assert.equal(concurrentResults.filter(Boolean).length,1),
    async()=>assert.equal(concurrentAfter-concurrentBefore,1),
    async()=>assert.equal(activeReplay,null),
    async()=>assert.equal(activeAfter-activeBefore,0),
    async()=>assert.deepEqual(forcedClaimAfter,forcedClaimBefore),
    async()=>assert.equal(forcedClaimAuditAfter-forcedClaimAuditBefore,0),
    async()=>{for(const value of allSafeValues)assert.doesNotMatch(JSON.stringify(value),forbidden)},
    async()=>assert.deepEqual(forcedExhaustionAfter,forcedExhaustionBefore),
    async()=>assert.deepEqual({claim:forcedExhaustionClaimAfter-forcedExhaustionClaimBefore,exhaustion:forcedExhaustionAuditAfter-forcedExhaustionAuditBefore},{claim:0,exhaustion:0}),
    async()=>assert.deepEqual(
      {result:exhaustionResult,state:exhaustedState.state,failureCode:exhaustedState.failure_code,count:Number(exhaustedState.reconciliation_count),lifecycle:exhaustedState.lifecycle},
      {result:null,state:'failed',failureCode:'DELETION_RECONCILIATION_EXHAUSTED',count:3,lifecycle:'deletion_failed'},
    ),
    async()=>assert.equal(exhaustionAudits.length,1),
    async()=>assert.equal(exhaustionClaimAfter-exhaustionClaimBefore,0),
    async()=>assert.deepEqual(
      {result:exhaustedReplay,claimDelta:replayClaimAfter-replayClaimBefore,exhaustionDelta:replayExhaustionAfter-replayExhaustionBefore},
      {result:null,claimDelta:0,exhaustionDelta:0},
    ),
    async()=>assert.deepEqual(
      {actor:exhaustionAudits[0].actor_id,request:exhaustionAudits[0].request_id,resource:exhaustionAudits[0].resource_id,version:Number(exhaustionAudits[0].resource_version)},
      {actor:authority.resolved_by,request:authority.command_request_id,resource:renditionId,version:Number(exhaustedState.lifecycle_version)},
    ),
    async()=>assert.doesNotMatch(JSON.stringify(exhaustionAudits[0].metadata),forbidden),
  ];
  assert.equal(names.length,studioDeletionReconciliationClaimAuditScenarioNames.length);
  assert.equal(checks.length,names.length);
  for(let index=0;index<checks.length;index++)await scenario(names[index],checks[index]);

  const finalClaimAudits=await actionRows(db,claimAction,attemptId);
  const evidence={
    claimEvents:finalClaimAudits.length,
    claimStates:Object.fromEntries(
      ['requested','executing','reconciliation_required','reconciling'].map(state=>[
        state,finalClaimAudits.filter(row=>row.metadata.previousState===state).length,
      ]),
    ),
    concurrent:{executableClaims:concurrentResults.filter(Boolean).length,auditDelta:concurrentAfter-concurrentBefore},
    activeLeaseReplayAuditDelta:activeAfter-activeBefore,
    forcedClaimAuditDelta:forcedClaimAuditAfter-forcedClaimAuditBefore,
    forcedExhaustionAuditDelta:forcedExhaustionAuditAfter-forcedExhaustionAuditBefore,
    exhaustionEvents:exhaustionAudits.length,
    exhaustionClaimAuditDelta:exhaustionClaimAfter-exhaustionClaimBefore,
    exhaustedReplayAuditDelta:replayExhaustionAfter-replayExhaustionBefore,
  };
  console.log(`DELETION RECONCILIATION CLAIM AUDIT COUNTS ${JSON.stringify(evidence)}`);
  return evidence;
}
