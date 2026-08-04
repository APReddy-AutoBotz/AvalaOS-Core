import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApprovedStudioFixture,privateCommand} from './studioPrivateArtifactPostgresFixture.mjs';

const claimAction='studio.rendition.deletion.reconciliation.claim';
const exhaustionAction='studio.rendition.deletion.reconciliation.exhausted';
const forbidden=/(bucket|objectKey|object_key|signedUrl|signed_url|storageBinding|storage_provider|storageProvider|credential|approvedContent|privateClaim|serviceRole|workerSecret|secret)/iu;
const claimMetadataKeys=[
  'currentExecutionFence','deletionAttemptId','deletionRequestId','previousReconciliationCount',
  'previousState','providerAuthorityIssued','reconciliationCount','recoveryKind',
  'resolutionId','resultingLifecycleVersion',
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

export const studioDeletionExhaustionAuthorityScenarioNames=[
  'deletion exhaustion initial uncertainty retains count one',
  'deletion exhaustion first recovery uncertainty retains count two',
  'deletion exhaustion second recovery uncertainty retains count three',
  'deletion exhaustion count three remains an executable provider attempt',
  'deletion exhaustion concurrent fourth claims return no provider authority',
  'deletion exhaustion concurrent fourth claims commit one terminal transition and audit',
  'deletion exhaustion terminal state retains bounded count three',
  'deletion exhaustion emits zero generic failure audit',
  'generic deletion failure rejects the dedicated exhaustion code atomically',
  'deletion count three deleted provider outcome completes',
  'deletion count three missing provider outcome completes',
];

export const studioDeletionExecutionAuthorityScenarioNames=[
  'deletion runtime disabled pauses requested recovery',
  'deletion runtime read only pauses requested recovery',
  'deletion runtime provider disabled pauses requested recovery',
  'deletion runtime execution disabled pauses requested recovery',
  'deletion runtime paused calls return studio read only',
  'deletion runtime paused calls preserve every durable field and audit count',
  'deletion runtime repeated pause never reaches exhaustion',
  'deletion runtime restore permits claim from original count',
  'deletion runtime execution disable does not pause rendition recovery',
  'deletion execution initial authority emits one audit',
  'deletion execution returned fence equals audited fence',
  'deletion execution audit request traces accepted resolution receipt',
  'deletion execution audit actor is independent resolver',
  'deletion execution audit resource is canonical rendition',
  'deletion execution audit metadata excludes private storage authority',
  'deletion execution concurrent workers return one binding and one audit',
  'deletion execution active lease replay returns no binding or audit',
  'deletion execution expired lease reclaim advances and audits fence',
  'deletion execution forced audit failure rolls back authority',
  'deletion execution forced audit failure returns no provider binding',
  'deletion execution deleted completion traces exact audited fence',
  'deletion execution missing completion traces exact audited fence',
  'deletion execution uncertain failure traces exact audited fence',
  'deletion execution terminal failure traces exact audited fence',
  'deletion execution old fence completion is stale and audit neutral',
  'deletion execution old fence failure is stale and audit neutral',
  'deletion execution current fence completion records one final event',
  'deletion execution current fence failure records one final event',
  'deletion execution completion and failure replay add no final event',
  'deletion ownership audit states provider authority was not issued',
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

const executionClaim=async(db,attemptId)=>(await db.query(
  'SELECT public.studio_rendition_deletion_execution_claim($1::uuid) claim',[attemptId],
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
    async()=>{for(const row of exactClaimRows)assert.deepEqual(
      {recoveryKind:row.metadata.recoveryKind,providerAuthorityIssued:row.metadata.providerAuthorityIssued},
      {recoveryKind:'deletion',providerAuthorityIssued:false},
    )},
    async()=>assert.deepEqual(
      exactClaimRows.map(row=>Number(row.metadata.currentExecutionFence)).sort((left,right)=>left-right),
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

export async function runStudioDeletionExhaustionAuthorityEvidence({exhaustionDb,peer,deletedDb,missingDb,scenario,names=studioDeletionExhaustionAuthorityScenarioNames}){
  const failureAction='studio.rendition.deletion.fail';
  const failUncertain=async(targetDb,attemptId,fence)=>targetDb.query(
    "SELECT public.studio_rendition_deletion_fail($1::uuid,$2::bigint,'DELETE_OUTCOME_UNKNOWN')",
    [attemptId,fence],
  );
  const advanceToThirdExecution=async(targetDb)=>{
    const fixture=await createDeletionFixture(targetDb);
    const initialExecution=await executionClaim(targetDb,fixture.attemptId);
    await failUncertain(targetDb,fixture.attemptId,initialExecution.fence);
    const afterInitialUncertainty=await attemptSnapshot(targetDb,fixture.attemptId);
    const firstRecoveryClaim=await claim(targetDb,fixture.attemptId);
    const firstRecoveryExecution=await executionClaim(targetDb,fixture.attemptId);
    await failUncertain(targetDb,fixture.attemptId,firstRecoveryExecution.fence);
    const afterFirstRecoveryUncertainty=await attemptSnapshot(targetDb,fixture.attemptId);
    const secondRecoveryClaim=await claim(targetDb,fixture.attemptId);
    const secondRecoveryExecution=await executionClaim(targetDb,fixture.attemptId);
    return{
      ...fixture,initialExecution,afterInitialUncertainty,
      firstRecoveryClaim,firstRecoveryExecution,afterFirstRecoveryUncertainty,
      secondRecoveryClaim,secondRecoveryExecution,
    };
  };

  const exhaustion=await advanceToThirdExecution(exhaustionDb);
  await failUncertain(exhaustionDb,exhaustion.attemptId,exhaustion.secondRecoveryExecution.fence);
  const afterSecondRecoveryUncertainty=await attemptSnapshot(exhaustionDb,exhaustion.attemptId);
  const beforeExhaustion={
    state:afterSecondRecoveryUncertainty,
    dedicated:await countAction(exhaustionDb,exhaustionAction,exhaustion.attemptId),
    execution:await countAction(exhaustionDb,'studio.rendition.deletion.execution.claim',exhaustion.attemptId),
  };
  const concurrentClaims=await Promise.all([
    claim(exhaustionDb,exhaustion.attemptId),
    claim(peer,exhaustion.attemptId),
  ]);
  const afterExhaustion={
    state:await attemptSnapshot(exhaustionDb,exhaustion.attemptId),
    dedicated:await countAction(exhaustionDb,exhaustionAction,exhaustion.attemptId),
    execution:await countAction(exhaustionDb,'studio.rendition.deletion.execution.claim',exhaustion.attemptId),
  };
  const genericExhaustionAudits=Number((await exhaustionDb.query(
    `SELECT count(*)::int n FROM public.privileged_audit_events
     WHERE action=$1::text
       AND metadata->>'deletionAttemptId'=$2::text
       AND metadata->>'failureCode'='DELETION_RECONCILIATION_EXHAUSTED'`,
    [failureAction,exhaustion.attemptId],
  )).rows[0].n);

  const rejectedGeneric=await advanceToThirdExecution(deletedDb);
  const rejectedBefore={
    state:await attemptSnapshot(deletedDb,rejectedGeneric.attemptId),
    failAudits:await countAction(deletedDb,failureAction,rejectedGeneric.attemptId),
  };
  let rejectedGenericError;
  try{
    await deletedDb.query(
      "SELECT public.studio_rendition_deletion_fail($1::uuid,$2::bigint,'DELETION_RECONCILIATION_EXHAUSTED')",
      [rejectedGeneric.attemptId,rejectedGeneric.secondRecoveryExecution.fence],
    );
  }catch(error){
    rejectedGenericError=error instanceof Error?error.message:String(error);
  }
  const rejectedAfter={
    state:await attemptSnapshot(deletedDb,rejectedGeneric.attemptId),
    failAudits:await countAction(deletedDb,failureAction,rejectedGeneric.attemptId),
  };

  const deletedAtThree=rejectedGeneric;
  const deletedResult=(await deletedDb.query(
    "SELECT public.studio_rendition_deletion_complete($1::uuid,$2::bigint,'deleted') result",
    [deletedAtThree.attemptId,deletedAtThree.secondRecoveryExecution.fence],
  )).rows[0].result;
  const deletedState=await attemptSnapshot(deletedDb,deletedAtThree.attemptId);

  const missingAtThree=await advanceToThirdExecution(missingDb);
  const missingResult=(await missingDb.query(
    "SELECT public.studio_rendition_deletion_complete($1::uuid,$2::bigint,'missing') result",
    [missingAtThree.attemptId,missingAtThree.secondRecoveryExecution.fence],
  )).rows[0].result;
  const missingState=await attemptSnapshot(missingDb,missingAtThree.attemptId);

  const checks=[
    async()=>assert.deepEqual(
      {execution:Number(exhaustion.initialExecution.reconciliationCount),persisted:Number(exhaustion.afterInitialUncertainty.reconciliation_count)},
      {execution:1,persisted:1},
    ),
    async()=>assert.deepEqual(
      {claim:Number(exhaustion.firstRecoveryClaim.reconciliationCount),execution:Number(exhaustion.firstRecoveryExecution.reconciliationCount),persisted:Number(exhaustion.afterFirstRecoveryUncertainty.reconciliation_count)},
      {claim:2,execution:2,persisted:2},
    ),
    async()=>assert.deepEqual(
      {claim:Number(exhaustion.secondRecoveryClaim.reconciliationCount),execution:Number(exhaustion.secondRecoveryExecution.reconciliationCount),persisted:Number(afterSecondRecoveryUncertainty.reconciliation_count)},
      {claim:3,execution:3,persisted:3},
    ),
    async()=>assert.deepEqual(
      {state:afterSecondRecoveryUncertainty.state,count:Number(afterSecondRecoveryUncertainty.reconciliation_count),fence:Number(exhaustion.secondRecoveryExecution.fence)>0},
      {state:'reconciliation_required',count:3,fence:true},
    ),
    async()=>assert.deepEqual(
      {claims:concurrentClaims,executionAuditDelta:afterExhaustion.execution-beforeExhaustion.execution},
      {claims:[null,null],executionAuditDelta:0},
    ),
    async()=>assert.deepEqual(
      {auditDelta:afterExhaustion.dedicated-beforeExhaustion.dedicated,lifecycleVersionDelta:Number(afterExhaustion.state.lifecycle_version)-Number(beforeExhaustion.state.lifecycle_version)},
      {auditDelta:1,lifecycleVersionDelta:1},
    ),
    async()=>assert.deepEqual(
      {state:afterExhaustion.state.state,lifecycle:afterExhaustion.state.lifecycle,failureCode:afterExhaustion.state.failure_code,count:Number(afterExhaustion.state.reconciliation_count)},
      {state:'failed',lifecycle:'deletion_failed',failureCode:'DELETION_RECONCILIATION_EXHAUSTED',count:3},
    ),
    async()=>assert.equal(genericExhaustionAudits,0),
    async()=>{
      assert.match(rejectedGenericError,/INVALID_FAILURE/);
      assert.deepEqual(rejectedAfter,rejectedBefore);
    },
    async()=>assert.deepEqual(
      {result:deletedResult.state,state:deletedState.state,lifecycle:deletedState.lifecycle,count:Number(deletedState.reconciliation_count)},
      {result:'deleted',state:'completed',lifecycle:'deleted',count:3},
    ),
    async()=>assert.deepEqual(
      {result:missingResult.state,state:missingState.state,lifecycle:missingState.lifecycle,count:Number(missingState.reconciliation_count)},
      {result:'deleted',state:'completed',lifecycle:'deleted',count:3},
    ),
  ];
  assert.equal(names.length,studioDeletionExhaustionAuthorityScenarioNames.length);
  assert.equal(checks.length,names.length);
  for(let index=0;index<checks.length;index++)await scenario(names[index],checks[index]);

  const evidence={
    counts:{initial:1,firstRecovery:2,secondRecovery:3,terminal:3},
    concurrent:{claims:concurrentClaims.filter(Boolean).length,executionAuthorityDelta:afterExhaustion.execution-beforeExhaustion.execution,dedicatedAuditDelta:afterExhaustion.dedicated-beforeExhaustion.dedicated,lifecycleVersionDelta:Number(afterExhaustion.state.lifecycle_version)-Number(beforeExhaustion.state.lifecycle_version)},
    genericExhaustionAudits,
    genericCodeRejected:/INVALID_FAILURE/.test(rejectedGenericError??''),
    countThreeCompletion:{deleted:deletedState.lifecycle,missing:missingState.lifecycle},
  };
  console.log(`DELETION EXHAUSTION AUTHORITY COUNTS ${JSON.stringify(evidence)}`);
  return evidence;
}

export async function runStudioDeletionExecutionAuthorityEvidence({db,peer,scenario,names=studioDeletionExecutionAuthorityScenarioNames}){
  const fixture=await createDeletionFixture(db);
  const {base,attemptId,renditionId,authority}=fixture;
  const executionAction='studio.rendition.deletion.execution.claim';
  const completionAction='studio.rendition.deletion.complete';
  const failureAction='studio.rendition.deletion.fail';
  const executionMetadataKeys=[
    'deletionAttemptId','deletionRequestId','executionFence','executionKind',
    'previousExecutionFence','previousReconciliationCount','previousState',
    'reconciliationCount','resolutionId','resultingLifecycleVersion',
  ].sort();
  const runtimeDefaults={enabled:true,read_only:false,provider_enabled:true,deletion_enabled:true};
  const setRuntime=async values=>{
    const next={...runtimeDefaults,...values};
    await db.query(
      `UPDATE public.studio_private_artifact_runtime_control
       SET enabled=$1::boolean,read_only=$2::boolean,
           provider_enabled=$3::boolean,deletion_enabled=$4::boolean
       WHERE singleton`,
      [next.enabled,next.read_only,next.provider_enabled,next.deletion_enabled],
    );
  };
  const rejected=async operation=>{
    try{await operation();return null}catch(error){return error instanceof Error?error.message:String(error)}
  };
  const auditCounts=async()=>({
    ownership:await countAction(db,claimAction,attemptId),
    exhaustion:await countAction(db,exhaustionAction,attemptId),
    execution:await countAction(db,executionAction,attemptId),
  });
  const pauseRecords=[];
  for(const disabled of [
    {enabled:false},{read_only:true},{provider_enabled:false},{deletion_enabled:false},
  ]){
    await setRuntime(disabled);
    await setAttempt(db,attemptId,{
      state:'requested',failure_code:null,reconciliation_count:0,
      reconciliation_claimed_at:null,execution_fence:0,execution_claimed_at:null,completed_at:null,
    });
    await makeStateStale(db,attemptId);
    const before={attempt:await attemptSnapshot(db,attemptId),audits:await auditCounts()};
    const error=await rejected(()=>claim(db,attemptId));
    const after={attempt:await attemptSnapshot(db,attemptId),audits:await auditCounts()};
    pauseRecords.push({disabled,error,before,after});
  }

  await setRuntime({deletion_enabled:false});
  await setAttempt(db,attemptId,{
    state:'reconciliation_required',failure_code:'DELETE_OUTCOME_UNKNOWN',reconciliation_count:2,
    reconciliation_claimed_at:null,execution_fence:0,execution_claimed_at:null,completed_at:null,
  });
  const repeatedBefore={attempt:await attemptSnapshot(db,attemptId),audits:await auditCounts()};
  const repeatedErrors=[];
  for(let index=0;index<4;index++)repeatedErrors.push(await rejected(()=>claim(db,attemptId)));
  const repeatedAfter={attempt:await attemptSnapshot(db,attemptId),audits:await auditCounts()};
  await setRuntime({});
  const restoredClaim=await claim(db,attemptId);
  const restoredState=await attemptSnapshot(db,attemptId);
  const restoredOwnershipRows=await actionRows(db,claimAction,attemptId);

  await setRuntime({deletion_enabled:false});
  const rendition=await privateCommand(db,{
    commandType:'studio.rendition.generate',actorId:base.requester,
    organizationId:base.org,workspaceId:base.workspace,requestId:randomUUID(),
    idempotencyKey:`deletion-disabled-rendition-${randomUUID()}`,
    authorizationVersion:base.authorizationVersions[base.requester],
    payload:{artifactVersionId:base.artifactVersionId,format:'pdf'},
  });
  await db.query(
    "UPDATE public.studio_rendition_attempts SET state_changed_at=now()-interval '6 minutes' WHERE id=$1::uuid",
    [rendition.renditionClaim.attemptId],
  );
  const renditionRecovery=(await db.query(
    'SELECT public.studio_rendition_reconciliation_claim($1::uuid) claim',
    [rendition.renditionClaim.attemptId],
  )).rows[0].claim;
  await setRuntime({});

  await setAttempt(db,attemptId,{
    state:'requested',failure_code:null,reconciliation_count:0,
    reconciliation_claimed_at:null,execution_fence:0,execution_claimed_at:null,completed_at:null,
  });
  const initialExecutionBefore=await countAction(db,executionAction,attemptId);
  const initialBinding=await executionClaim(db,attemptId);
  const initialExecutionAfter=await countAction(db,executionAction,attemptId);
  const initialExecutionRows=await actionRows(db,executionAction,attemptId);
  const initialExecutionAudit=initialExecutionRows.find(
    row=>Number(row.metadata.executionFence)===Number(initialBinding.fence),
  );

  await setAttempt(db,attemptId,{
    state:'requested',failure_code:null,reconciliation_count:0,
    reconciliation_claimed_at:null,execution_fence:10,execution_claimed_at:null,completed_at:null,
  });
  const concurrentBefore=await countAction(db,executionAction,attemptId);
  const concurrentResults=await Promise.all([executionClaim(db,attemptId),executionClaim(peer,attemptId)]);
  const concurrentAfter=await countAction(db,executionAction,attemptId);
  const concurrentBinding=concurrentResults.find(Boolean);
  const concurrentState=await attemptSnapshot(db,attemptId);
  const replayBefore=await countAction(db,executionAction,attemptId);
  const replayBinding=await executionClaim(peer,attemptId);
  const replayAfter=await countAction(db,executionAction,attemptId);
  const replayState=await attemptSnapshot(db,attemptId);
  await db.query(
    "UPDATE public.studio_rendition_deletion_attempts SET execution_claimed_at=now()-interval '6 minutes' WHERE id=$1::uuid",
    [attemptId],
  );
  const reclaimBefore=await countAction(db,executionAction,attemptId);
  const reclaimedBinding=await executionClaim(peer,attemptId);
  const reclaimAfter=await countAction(db,executionAction,attemptId);
  const reclaimedState=await attemptSnapshot(db,attemptId);

  const staleCompletionBefore=await countAction(db,completionAction,attemptId);
  const staleCompletionError=await rejected(()=>db.query(
    "SELECT public.studio_rendition_deletion_complete($1::uuid,$2::bigint,'deleted')",
    [attemptId,concurrentBinding.fence],
  ));
  const staleCompletionAfter=await countAction(db,completionAction,attemptId);
  const staleCompletionState=await attemptSnapshot(db,attemptId);
  const staleFailureBefore=await countAction(db,failureAction,attemptId);
  const staleFailureError=await rejected(()=>db.query(
    "SELECT public.studio_rendition_deletion_fail($1::uuid,$2::bigint,'DELETE_OUTCOME_UNKNOWN')",
    [attemptId,concurrentBinding.fence],
  ));
  const staleFailureAfter=await countAction(db,failureAction,attemptId);
  const staleFailureState=await attemptSnapshot(db,attemptId);

  await setAttempt(db,attemptId,{
    state:'reconciliation_required',failure_code:'DELETE_OUTCOME_UNKNOWN',reconciliation_count:1,
    reconciliation_claimed_at:null,execution_fence:30,execution_claimed_at:null,completed_at:null,
  });
  const forcedBefore={attempt:await attemptSnapshot(db,attemptId),audit:await countAction(db,executionAction,attemptId)};
  await installAuditFailure(db,executionAction);
  let forcedError;
  try{forcedError=await rejected(()=>executionClaim(db,attemptId))}finally{await removeAuditFailure(db)}
  const forcedAfter={attempt:await attemptSnapshot(db,attemptId),audit:await countAction(db,executionAction,attemptId)};

  const traceOutcome=async({fenceBase,providerOutcome,failure})=>{
    await db.query('BEGIN');
    try{
      await setAttempt(db,attemptId,{
        state:'requested',failure_code:null,reconciliation_count:0,
        reconciliation_claimed_at:null,execution_fence:fenceBase,execution_claimed_at:null,completed_at:null,
      });
      const binding=await executionClaim(db,attemptId);
      const executionRows=await actionRows(db,executionAction,attemptId);
      const executionAudit=executionRows.find(row=>Number(row.metadata.executionFence)===Number(binding.fence));
      const finalAction=providerOutcome?completionAction:failureAction;
      const finalBefore=await countAction(db,finalAction,attemptId);
      const result=providerOutcome
        ?(await db.query(
          'SELECT public.studio_rendition_deletion_complete($1::uuid,$2::bigint,$3::text) result',
          [attemptId,binding.fence,providerOutcome],
        )).rows[0].result
        :(await db.query(
          'SELECT public.studio_rendition_deletion_fail($1::uuid,$2::bigint,$3::text) result',
          [attemptId,binding.fence,failure],
        )).rows[0].result;
      const finalAfter=await countAction(db,finalAction,attemptId);
      const finalRows=await actionRows(db,finalAction,attemptId);
      const finalAudit=finalRows.find(row=>Number(row.metadata.executionFence)===Number(binding.fence));
      const state=await attemptSnapshot(db,attemptId);
      await db.query('SAVEPOINT deletion_execution_replay');
      let replayError;
      try{
        if(providerOutcome){
          await db.query(
            'SELECT public.studio_rendition_deletion_complete($1::uuid,$2::bigint,$3::text)',
            [attemptId,binding.fence,providerOutcome],
          );
        }else{
          await db.query(
            'SELECT public.studio_rendition_deletion_fail($1::uuid,$2::bigint,$3::text)',
            [attemptId,binding.fence,failure],
          );
        }
      }catch(error){
        replayError=error instanceof Error?error.message:String(error);
        await db.query('ROLLBACK TO SAVEPOINT deletion_execution_replay');
      }
      const replayAfter=await countAction(db,finalAction,attemptId);
      return{binding,executionAudit,finalAudit,result,state,replayError,finalDelta:finalAfter-finalBefore,replayDelta:replayAfter-finalAfter};
    }finally{await db.query('ROLLBACK')}
  };
  const deletedTrace=await traceOutcome({fenceBase:40,providerOutcome:'deleted'});
  const missingTrace=await traceOutcome({fenceBase:50,providerOutcome:'missing'});
  const uncertainTrace=await traceOutcome({fenceBase:60,failure:'DELETE_OUTCOME_UNKNOWN'});
  const terminalTrace=await traceOutcome({fenceBase:70,failure:'DELETE_PROVIDER_FAILED'});

  const checks=[
    async()=>assert.match(pauseRecords[0].error,/STUDIO_READ_ONLY/),
    async()=>assert.match(pauseRecords[1].error,/STUDIO_READ_ONLY/),
    async()=>assert.match(pauseRecords[2].error,/STUDIO_READ_ONLY/),
    async()=>assert.match(pauseRecords[3].error,/STUDIO_READ_ONLY/),
    async()=>{for(const row of [...pauseRecords.map(item=>item.error),...repeatedErrors])assert.match(row,/STUDIO_READ_ONLY/)},
    async()=>{for(const row of pauseRecords)assert.deepEqual(row.after,row.before)},
    async()=>assert.deepEqual(repeatedAfter,repeatedBefore),
    async()=>assert.deepEqual(
      {claimCount:Number(restoredClaim.reconciliationCount),persistedCount:Number(restoredState.reconciliation_count),state:restoredState.state,lifecycle:restoredState.lifecycle},
      {claimCount:3,persistedCount:3,state:'reconciling',lifecycle:'deleting'},
    ),
    async()=>assert.deepEqual({phase:renditionRecovery.phase,count:Number(renditionRecovery.reconciliationCount)},{phase:'pre_render',count:1}),
    async()=>assert.equal(initialExecutionAfter-initialExecutionBefore,1),
    async()=>assert.equal(Number(initialExecutionAudit.metadata.executionFence),Number(initialBinding.fence)),
    async()=>assert.equal(initialExecutionAudit.request_id,authority.command_request_id),
    async()=>assert.equal(initialExecutionAudit.actor_id,authority.resolved_by),
    async()=>assert.deepEqual({type:initialExecutionAudit.resource_type,id:initialExecutionAudit.resource_id},{type:'studio_rendition',id:renditionId}),
    async()=>{
      assert.deepEqual(Object.keys(initialExecutionAudit.metadata).sort(),executionMetadataKeys);
      assert.doesNotMatch(JSON.stringify(initialExecutionAudit.metadata),forbidden);
    },
    async()=>assert.deepEqual({bindings:concurrentResults.filter(Boolean).length,audits:concurrentAfter-concurrentBefore},{bindings:1,audits:1}),
    async()=>assert.deepEqual({binding:replayBinding,audits:replayAfter-replayBefore,fence:Number(replayState.execution_fence)},{binding:null,audits:0,fence:Number(concurrentState.execution_fence)}),
    async()=>assert.deepEqual({audits:reclaimAfter-reclaimBefore,fence:Number(reclaimedBinding.fence),persisted:Number(reclaimedState.execution_fence)},{audits:1,fence:Number(concurrentBinding.fence)+1,persisted:Number(concurrentBinding.fence)+1}),
    async()=>{assert.match(forcedError,/forced deletion reconciliation audit insertion failure/);assert.deepEqual(forcedAfter,forcedBefore)},
    async()=>assert.deepEqual({bindingReturned:false,auditDelta:forcedAfter.audit-forcedBefore.audit},{bindingReturned:false,auditDelta:0}),
    async()=>assert.equal(Number(deletedTrace.executionAudit.metadata.executionFence),Number(deletedTrace.finalAudit.metadata.executionFence)),
    async()=>assert.equal(Number(missingTrace.executionAudit.metadata.executionFence),Number(missingTrace.finalAudit.metadata.executionFence)),
    async()=>assert.equal(Number(uncertainTrace.executionAudit.metadata.executionFence),Number(uncertainTrace.finalAudit.metadata.executionFence)),
    async()=>assert.equal(Number(terminalTrace.executionAudit.metadata.executionFence),Number(terminalTrace.finalAudit.metadata.executionFence)),
    async()=>{assert.match(staleCompletionError,/AUTHORITY_STALE/);assert.equal(staleCompletionAfter-staleCompletionBefore,0);assert.deepEqual(staleCompletionState,reclaimedState)},
    async()=>{assert.match(staleFailureError,/AUTHORITY_STALE/);assert.equal(staleFailureAfter-staleFailureBefore,0);assert.deepEqual(staleFailureState,reclaimedState)},
    async()=>assert.deepEqual({delta:deletedTrace.finalDelta,state:deletedTrace.state.state,lifecycle:deletedTrace.state.lifecycle},{delta:1,state:'completed',lifecycle:'deleted'}),
    async()=>assert.deepEqual({delta:terminalTrace.finalDelta,state:terminalTrace.state.state,lifecycle:terminalTrace.state.lifecycle},{delta:1,state:'failed',lifecycle:'deletion_failed'}),
    async()=>{for(const trace of [deletedTrace,missingTrace,uncertainTrace,terminalTrace]){assert.match(trace.replayError,/AUTHORITY_STALE/);assert.equal(trace.replayDelta,0)}},
    async()=>assert.equal(restoredOwnershipRows.at(-1).metadata.providerAuthorityIssued,false),
  ];
  assert.equal(names.length,studioDeletionExecutionAuthorityScenarioNames.length);
  assert.equal(checks.length,names.length);
  for(let index=0;index<checks.length;index++)await scenario(names[index],checks[index]);
  const evidence={
    paused:pauseRecords.map(row=>({field:Object.keys(row.disabled)[0],stateDelta:row.before.attempt.state===row.after.attempt.state?0:1,countDelta:Number(row.after.attempt.reconciliation_count)-Number(row.before.attempt.reconciliation_count),fenceDelta:Number(row.after.attempt.execution_fence)-Number(row.before.attempt.execution_fence),auditDelta:row.after.audits.execution+row.after.audits.ownership+row.after.audits.exhaustion-row.before.audits.execution-row.before.audits.ownership-row.before.audits.exhaustion})),
    restored:{count:Number(restoredState.reconciliation_count),state:restoredState.state},
    initial:{returnedFence:Number(initialBinding.fence),auditedFence:Number(initialExecutionAudit.metadata.executionFence)},
    concurrent:{bindings:concurrentResults.filter(Boolean).length,auditDelta:concurrentAfter-concurrentBefore},
    reclaim:{previousFence:Number(concurrentBinding.fence),returnedFence:Number(reclaimedBinding.fence),auditDelta:reclaimAfter-reclaimBefore},
    forcedAudit:{stateDelta:forcedBefore.attempt.state===forcedAfter.attempt.state?0:1,fenceDelta:Number(forcedAfter.attempt.execution_fence)-Number(forcedBefore.attempt.execution_fence),auditDelta:forcedAfter.audit-forcedBefore.audit,bindingReturned:false},
    traces:{deleted:Number(deletedTrace.finalAudit.metadata.executionFence),missing:Number(missingTrace.finalAudit.metadata.executionFence),uncertain:Number(uncertainTrace.finalAudit.metadata.executionFence),terminal:Number(terminalTrace.finalAudit.metadata.executionFence)},
  };
  console.log(`DELETION EXECUTION AUTHORITY COUNTS ${JSON.stringify(evidence)}`);
  return evidence;
}
