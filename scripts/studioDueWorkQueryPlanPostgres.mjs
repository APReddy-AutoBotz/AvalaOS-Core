import assert from 'node:assert/strict';
import {createApprovedStudioFixture,privateCommand} from './studioPrivateArtifactPostgresFixture.mjs';

export const studioDueWorkQueryPlanScenarioNames=[
  'due query plan large recent history retains only cheap due candidates',
  'due query plan rendition due-work index is used',
  'due query plan deletion due-work index is used',
  'due query plan rendition actionability runs only for due candidates',
  'due query plan deletion actionability runs only for due candidates',
  'due query plan older unactionable work cannot starve limit one',
  'due query plan limit one remains deterministic',
  'due query plan discovery has zero authoritative or provider effects',
  'due query plan response remains kind and attempt id only',
];

const flattenPlan=node=>[
  node,
  ...(node?.Plans??[]).flatMap(flattenPlan),
];

export async function runStudioDueWorkQueryPlanEvidence({db,scenario,names=studioDueWorkQueryPlanScenarioNames}){
  assert.deepEqual(names,studioDueWorkQueryPlanScenarioNames);
  const base=await createApprovedStudioFixture(db);
  const historyPerKind=6000;
  let commandOrdinal=0;
  const nextUuid=async()=>String((await db.query('SELECT gen_random_uuid() id')).rows[0].id);
  const currentAuthorization=async actor=>Number((await db.query(
    'SELECT version FROM public.authorization_versions WHERE org_id=$1::uuid AND user_id=$2::uuid',
    [base.org,actor],
  )).rows[0].version);
  const command=async(commandType,actor,payload,label)=>privateCommand(db,{
    commandType,
    actorId:actor,
    organizationId:base.org,
    workspaceId:base.workspace,
    requestId:await nextUuid(),
    idempotencyKey:`due-plan-${label}-${++commandOrdinal}`,
    authorizationVersion:await currentAuthorization(actor),
    payload,
  });
  const due=async(limit=1)=>(await db.query(
    'SELECT public.studio_private_artifact_reconciliation_due($1::integer) value',
    [limit],
  )).rows[0].value;

  await command(
    'studio.retention.policy.publish',
    base.requester,
    {artifactType:'brd',retentionDays:0,indefinite:false,rationale:'disposable due query-plan evidence'},
    'retention-zero',
  );
  const generation=await command(
    'studio.rendition.generate',
    base.requester,
    {artifactVersionId:base.artifactVersionId,format:'markdown'},
    'deletion-source',
  );
  const generationClaim=generation.renditionClaim;
  const objectKey=`${base.org}/${base.workspace}/studio-artifacts/${generationClaim.opaqueObjectId}.md`;
  await db.query('SELECT public.studio_rendition_attempt_start($1::uuid)',[generationClaim.attemptId]);
  await db.query(
    'SELECT public.studio_rendition_attempt_rendered($1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text,$7::text,$8::text,$9::text)',
    [generationClaim.attemptId,objectKey,'d'.repeat(64),256,'text/markdown; charset=utf-8','due-plan.md',generationClaim.rendererVersion,generationClaim.templateVersion,generationClaim.contentSchemaVersion],
  );
  const completed=(await db.query(
    'SELECT public.studio_rendition_attempt_complete($1::uuid) value',
    [generationClaim.attemptId],
  )).rows[0].value;
  const deletionRequest=await command(
    'studio.rendition.deletion.request',
    base.requester,
    {renditionId:completed.renditionId,rationale:'disposable query-plan deletion request'},
    'deletion-request',
  );
  const deletionApproval=await command(
    'studio.rendition.deletion.resolve',
    base.approver,
    {renditionId:completed.renditionId,deletionRequestId:deletionRequest.resource.deletionRequestId,outcome:'approve',rationale:'disposable query-plan approval'},
    'deletion-approval',
  );
  const dueDeletionAttemptId=deletionApproval.deletionClaim.deletionAttemptId;
  await db.query(
    "UPDATE public.studio_rendition_deletion_attempts SET state_changed_at=clock_timestamp()-interval '8 minutes' WHERE id=$1::uuid",
    [dueDeletionAttemptId],
  );

  const dueRendition=await command(
    'studio.rendition.generate',
    base.reviewer,
    {artifactVersionId:base.artifactVersionId,format:'pdf'},
    'current-due-rendition',
  );
  await db.query(
    "UPDATE public.studio_rendition_attempts SET state_changed_at=clock_timestamp()-interval '7 minutes' WHERE id=$1::uuid",
    [dueRendition.renditionClaim.attemptId],
  );

  const versionTemplate=(await db.query(
    `SELECT version.template_id,version.content_schema_version,version.renderer_version,
      template.template_version
     FROM public.studio_artifact_versions version
     JOIN public.studio_system_template_versions template ON template.id=version.template_id
     WHERE version.id=$1::uuid`,
    [base.artifactVersionId],
  )).rows[0];
  const supersededVersionId=await nextUuid();
  const supersededVersionNumber=Number(base.version.version)+1000;
  const supersededContent=JSON.stringify({title:'Superseded due query-plan fixture',sections:[]});
  await db.query(
    `INSERT INTO public.studio_artifact_versions(
      id,artifact_id,org_id,workspace_id,version,parent_version_id,template_id,
      content_schema_version,renderer_version,content,content_hash,lifecycle,
      author_id,author_authorization_version
     ) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::bigint,$6::uuid,$7::uuid,
      $8::text,$9::text,$10::jsonb,encode(public.digest($10::text,'sha256'),'hex'),
      'approved',$11::uuid,$12::bigint)`,
    [supersededVersionId,base.artifactId,base.org,base.workspace,supersededVersionNumber,
      base.artifactVersionId,versionTemplate.template_id,versionTemplate.content_schema_version,
      versionTemplate.renderer_version,supersededContent,base.requester,await currentAuthorization(base.requester)],
  );
  const supersededAttemptId=await nextUuid();
  const supersededReceiptId=await nextUuid();
  await db.query(
    `INSERT INTO public.studio_private_artifact_command_receipts(
      id,org_id,workspace_id,actor_id,command_type,idempotency_key,request_id,
      request_hash,status,resource_id,response
     ) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'studio.rendition.generate',
      'due-plan-superseded',gen_random_uuid(),encode(public.digest('due-plan-superseded','sha256'),'hex'),
      'committed',$5::uuid,jsonb_build_object('attemptId',$5::uuid))`,
    [supersededReceiptId,base.org,base.workspace,base.requester,supersededAttemptId],
  );
  await db.query(
    `INSERT INTO public.studio_rendition_attempts(
      id,rendition_id,opaque_object_id,org_id,workspace_id,artifact_id,
      artifact_version_id,artifact_version,artifact_type,format,renderer_version,
      template_version,content_schema_version,requested_by,requester_authorization_version,
      request_id,receipt_id,state,state_changed_at,created_at
     ) VALUES($1::uuid,gen_random_uuid(),gen_random_uuid(),$2::uuid,$3::uuid,$4::uuid,
      $5::uuid,$6::bigint,'brd','docx','studio-docx-1',$7::text,$8::text,$9::uuid,
      $10::bigint,gen_random_uuid(),$11::uuid,'requested',clock_timestamp()-interval '60 minutes',
      clock_timestamp()-interval '60 minutes')`,
    [supersededAttemptId,base.org,base.workspace,base.artifactId,supersededVersionId,
      supersededVersionNumber,versionTemplate.template_version,versionTemplate.content_schema_version,
      base.requester,await currentAuthorization(base.requester),supersededReceiptId],
  );

  await db.query(
    `INSERT INTO public.studio_private_artifact_command_receipts(
      id,org_id,workspace_id,actor_id,command_type,idempotency_key,request_id,
      request_hash,status,resource_id,response
     )
     SELECT md5('due-plan-rendition-receipt-'||series.g)::uuid,$1::uuid,$2::uuid,$3::uuid,
      'studio.rendition.generate','due-plan-rendition-history-'||series.g,
      md5('due-plan-rendition-request-'||series.g)::uuid,
      encode(public.digest('due-plan-rendition-history-'||series.g,'sha256'),'hex'),
      'committed',md5('due-plan-rendition-attempt-'||series.g)::uuid,
      jsonb_build_object('attemptId',md5('due-plan-rendition-attempt-'||series.g)::uuid)
     FROM generate_series(1,$4::integer) series(g)`,
    [base.org,base.workspace,base.requester,historyPerKind],
  );
  await db.query(
    `INSERT INTO public.studio_rendition_attempts(
      id,rendition_id,opaque_object_id,org_id,workspace_id,artifact_id,
      artifact_version_id,artifact_version,artifact_type,format,renderer_version,
      template_version,content_schema_version,requested_by,requester_authorization_version,
      request_id,receipt_id,state,state_changed_at,created_at
     )
     SELECT md5('due-plan-rendition-attempt-'||series.g)::uuid,
      md5('due-plan-rendition-id-'||series.g)::uuid,
      md5('due-plan-rendition-object-'||series.g)::uuid,
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::bigint,'brd','docx',
      'due-plan-renderer-'||series.g,$6::text,$7::text,$8::uuid,$9::bigint,
      md5('due-plan-rendition-request-'||series.g)::uuid,
      md5('due-plan-rendition-receipt-'||series.g)::uuid,'requested',
      clock_timestamp(),clock_timestamp()
     FROM generate_series(1,$10::integer) series(g)`,
    [base.org,base.workspace,base.artifactId,base.artifactVersionId,base.version.version,
      versionTemplate.template_version,versionTemplate.content_schema_version,base.requester,
      await currentAuthorization(base.requester),historyPerKind],
  );

  await db.query(
    `INSERT INTO public.studio_private_artifact_command_receipts(
      id,org_id,workspace_id,actor_id,command_type,idempotency_key,request_id,
      request_hash,status,resource_id,response
     )
     SELECT md5('due-plan-deletion-request-receipt-'||series.g)::uuid,$1::uuid,$2::uuid,$3::uuid,
      'studio.rendition.deletion.request','due-plan-deletion-request-history-'||series.g,
      md5('due-plan-deletion-request-command-'||series.g)::uuid,
      encode(public.digest('due-plan-deletion-request-history-'||series.g,'sha256'),'hex'),
      'committed',md5('due-plan-deletion-request-id-'||series.g)::uuid,
      jsonb_build_object('deletionRequestId',md5('due-plan-deletion-request-id-'||series.g)::uuid)
     FROM generate_series(1,$4::integer) series(g)`,
    [base.org,base.workspace,base.requester,historyPerKind],
  );
  await db.query(
    `INSERT INTO public.studio_rendition_deletion_requests(
      id,rendition_id,org_id,workspace_id,requested_by,requester_authorization_version,
      rationale,requested_lifecycle,requested_lifecycle_version,retention_evaluation,
      active_hold_count,receipt_id,audit_event_id,created_at
     )
     SELECT md5('due-plan-deletion-request-id-'||series.g)::uuid,$1::uuid,$2::uuid,$3::uuid,
      $4::uuid,$5::bigint,'disposable due query-plan history','available',1,
      jsonb_build_object('indefinite',false,'retentionUntil',clock_timestamp()-interval '1 day'),0,
      md5('due-plan-deletion-request-receipt-'||series.g)::uuid,
      md5('due-plan-deletion-request-audit-'||series.g)::uuid,clock_timestamp()
     FROM generate_series(1,$6::integer) series(g)`,
    [completed.renditionId,base.org,base.workspace,base.requester,
      await currentAuthorization(base.requester),historyPerKind],
  );
  await db.query(
    `INSERT INTO public.studio_private_artifact_command_receipts(
      id,org_id,workspace_id,actor_id,command_type,idempotency_key,request_id,
      request_hash,status,resource_id,response
     )
     SELECT md5('due-plan-deletion-resolution-receipt-'||series.g)::uuid,$1::uuid,$2::uuid,$3::uuid,
      'studio.rendition.deletion.resolve','due-plan-deletion-resolution-history-'||series.g,
      md5('due-plan-deletion-resolution-command-'||series.g)::uuid,
      encode(public.digest('due-plan-deletion-resolution-history-'||series.g,'sha256'),'hex'),
      'committed',md5('due-plan-deletion-resolution-id-'||series.g)::uuid,
      jsonb_build_object(
        'deletionRequestId',md5('due-plan-deletion-request-id-'||series.g)::uuid,
        'resolutionId',md5('due-plan-deletion-resolution-id-'||series.g)::uuid,
        'renditionId',$4::uuid,'status','deleting'
      )
     FROM generate_series(1,$5::integer) series(g)`,
    [base.org,base.workspace,base.approver,completed.renditionId,historyPerKind],
  );
  await db.query(
    `INSERT INTO public.studio_rendition_deletion_resolutions(
      id,request_id,rendition_id,org_id,workspace_id,resolved_by,resolver_authorization_version,
      outcome,rationale,retention_evaluation,active_hold_count,receipt_id,audit_event_id,created_at
     )
     SELECT md5('due-plan-deletion-resolution-id-'||series.g)::uuid,
      md5('due-plan-deletion-request-id-'||series.g)::uuid,$1::uuid,$2::uuid,$3::uuid,
      $4::uuid,$5::bigint,'approved','disposable due query-plan history',
      jsonb_build_object('indefinite',false,'retentionUntil',clock_timestamp()-interval '1 day'),0,
      md5('due-plan-deletion-resolution-receipt-'||series.g)::uuid,
      md5('due-plan-deletion-resolution-audit-'||series.g)::uuid,clock_timestamp()
     FROM generate_series(1,$6::integer) series(g)`,
    [completed.renditionId,base.org,base.workspace,base.approver,
      await currentAuthorization(base.approver),historyPerKind],
  );
  await db.query(
    `INSERT INTO public.studio_rendition_deletion_attempts(
      id,resolution_id,request_id,rendition_id,org_id,workspace_id,state,state_changed_at,created_at
     )
     SELECT md5('due-plan-deletion-attempt-'||series.g)::uuid,
      md5('due-plan-deletion-resolution-id-'||series.g)::uuid,
      md5('due-plan-deletion-request-id-'||series.g)::uuid,
      $1::uuid,$2::uuid,$3::uuid,'requested',clock_timestamp(),clock_timestamp()
     FROM generate_series(1,$4::integer) series(g)`,
    [completed.renditionId,base.org,base.workspace,historyPerKind],
  );

  await db.query('ANALYZE public.studio_rendition_attempts');
  await db.query('ANALYZE public.studio_rendition_deletion_attempts');
  const cheapCounts=(await db.query(
    `SELECT
      (SELECT count(*)::integer FROM public.studio_rendition_attempts r WHERE
        r.state='reconciliation_required'
        OR (r.state IN ('requested','rendering','uploaded') AND r.state_changed_at<=now()-interval '5 minutes')
        OR (r.state='reconciling' AND r.reconciliation_claimed_at<=now()-interval '5 minutes')) rendition,
      (SELECT count(*)::integer FROM public.studio_rendition_deletion_attempts d WHERE
        d.state='reconciliation_required'
        OR (d.state IN ('requested','executing') AND d.state_changed_at<=now()-interval '5 minutes')
        OR (d.state='reconciling' AND d.reconciliation_claimed_at<=now()-interval '5 minutes')) deletion`,
  )).rows[0];

  const renditionPlanResult=await db.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
     SELECT r.id
     FROM public.studio_rendition_attempts r
     WHERE (
       r.state='reconciliation_required'
       OR (r.state IN ('requested','rendering','uploaded') AND r.state_changed_at<=now()-interval '5 minutes')
       OR (r.state='reconciling' AND r.reconciliation_claimed_at<=now()-interval '5 minutes')
     )
       AND public.studio_private_rendition_reconciliation_actionable(r.id)
     ORDER BY COALESCE(r.reconciliation_claimed_at,r.state_changed_at,r.created_at),r.id
     LIMIT 50`,
  );
  const deletionPlanResult=await db.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
     SELECT d.id
     FROM public.studio_rendition_deletion_attempts d
     WHERE (
       d.state='reconciliation_required'
       OR (d.state IN ('requested','executing') AND d.state_changed_at<=now()-interval '5 minutes')
       OR (d.state='reconciling' AND d.reconciliation_claimed_at<=now()-interval '5 minutes')
     )
       AND public.studio_private_deletion_reconciliation_actionable(d.id)
     ORDER BY COALESCE(d.execution_claimed_at,d.reconciliation_claimed_at,d.state_changed_at,d.created_at),d.id
     LIMIT 50`,
  );
  const renditionPlan=renditionPlanResult.rows[0]['QUERY PLAN'][0];
  const deletionPlan=deletionPlanResult.rows[0]['QUERY PLAN'][0];
  const renditionNodes=flattenPlan(renditionPlan.Plan);
  const deletionNodes=flattenPlan(deletionPlan.Plan);
  const renditionIndexNodes=renditionNodes.filter(node=>node['Index Name']==='studio_rendition_attempt_due_work');
  const deletionIndexNodes=deletionNodes.filter(node=>node['Index Name']==='studio_deletion_attempt_due_work');
  const renditionIndexRows=renditionIndexNodes.reduce((sum,node)=>sum+Number(node['Actual Rows']??0),0);
  const deletionIndexRows=deletionIndexNodes.reduce((sum,node)=>sum+Number(node['Actual Rows']??0),0);
  const renditionBuffers=renditionNodes.reduce((sum,node)=>sum+Number(node['Shared Hit Blocks']??0)+Number(node['Shared Read Blocks']??0),0);
  const deletionBuffers=deletionNodes.reduce((sum,node)=>sum+Number(node['Shared Hit Blocks']??0)+Number(node['Shared Read Blocks']??0),0);

  await db.query("SET track_functions='all'");
  const trackedFunctions=(await db.query(
    `SELECT oid,proname FROM pg_proc
     WHERE oid IN (
       'public.studio_private_rendition_reconciliation_actionable(uuid)'::regprocedure,
       'public.studio_private_deletion_reconciliation_actionable(uuid)'::regprocedure
     )`,
  )).rows;
  for(const tracked of trackedFunctions){
    await db.query('SELECT pg_stat_reset_single_function_counters($1::oid)',[tracked.oid]);
  }
  const authoritativeSnapshot=async()=>(await db.query(
    `SELECT
      (SELECT count(*)::integer FROM public.studio_rendition_attempts) rendition_rows,
      (SELECT COALESCE(sum(reconciliation_count),0)::bigint FROM public.studio_rendition_attempts) rendition_retries,
      (SELECT COALESCE(sum(execution_fence),0)::bigint FROM public.studio_rendition_attempts) rendition_fences,
      (SELECT count(*)::integer FROM public.studio_rendition_attempts WHERE reconciliation_claimed_at IS NOT NULL) rendition_leases,
      (SELECT count(*)::integer FROM public.studio_rendition_deletion_attempts) deletion_rows,
      (SELECT COALESCE(sum(reconciliation_count),0)::bigint FROM public.studio_rendition_deletion_attempts) deletion_retries,
      (SELECT COALESCE(sum(execution_fence),0)::bigint FROM public.studio_rendition_deletion_attempts) deletion_fences,
      (SELECT count(*)::integer FROM public.studio_rendition_deletion_attempts WHERE reconciliation_claimed_at IS NOT NULL OR execution_claimed_at IS NOT NULL) deletion_leases,
      (SELECT count(*)::integer FROM public.privileged_audit_events) audit_rows`,
  )).rows[0];
  const before=await authoritativeSnapshot();
  const limitOne=await due(1);
  await db.query('SELECT pg_stat_force_next_flush()');
  const calls=Object.fromEntries((await db.query(
    `SELECT function.proname,COALESCE(stats.calls,0)::bigint calls
     FROM pg_proc function
     LEFT JOIN pg_stat_user_functions stats ON stats.funcid=function.oid
     WHERE function.oid IN (
       'public.studio_private_rendition_reconciliation_actionable(uuid)'::regprocedure,
       'public.studio_private_deletion_reconciliation_actionable(uuid)'::regprocedure
     )`,
  )).rows.map(row=>[row.proname,Number(row.calls)]));
  const repeated=[limitOne,await due(1),await due(1)];
  const after=await authoritativeSnapshot();
  const providerEffects=0;

  await scenario(names[0],async()=>assert.deepEqual(
    {
      history:{rendition:historyPerKind,deletion:historyPerKind},
      cheap:{rendition:Number(cheapCounts.rendition),deletion:Number(cheapCounts.deletion)},
    },
    {history:{rendition:6000,deletion:6000},cheap:{rendition:2,deletion:1}},
  ));
  await scenario(names[1],async()=>{
    assert.ok(renditionIndexNodes.length>0);
    assert.ok(renditionIndexRows<=Number(cheapCounts.rendition));
    assert.ok(renditionBuffers>0);
  });
  await scenario(names[2],async()=>{
    assert.ok(deletionIndexNodes.length>0);
    assert.ok(deletionIndexRows<=Number(cheapCounts.deletion));
    assert.ok(deletionBuffers>0);
  });
  await scenario(names[3],async()=>assert.equal(
    calls.studio_private_rendition_reconciliation_actionable,
    Number(cheapCounts.rendition),
  ));
  await scenario(names[4],async()=>assert.equal(
    calls.studio_private_deletion_reconciliation_actionable,
    Number(cheapCounts.deletion),
  ));
  await scenario(names[5],async()=>assert.deepEqual(
    {oldExcluded:!limitOne.some(item=>item.attemptId===supersededAttemptId),winner:limitOne[0]?.attemptId},
    {oldExcluded:true,winner:dueDeletionAttemptId},
  ));
  await scenario(names[6],async()=>assert.equal(
    repeated.every(value=>JSON.stringify(value)===JSON.stringify(limitOne)),
    true,
  ));
  await scenario(names[7],async()=>assert.deepEqual(
    {before,after,providerEffects},
    {before,after:before,providerEffects:0},
  ));
  await scenario(names[8],async()=>{
    assert.deepEqual(Object.keys(limitOne[0]??{}).sort(),['attemptId','kind']);
    assert.doesNotMatch(JSON.stringify(limitOne),/(objectKey|bucket|actor|authorization|storage|reason|signedUrl)/iu);
  });

  return{
    historyPerKind,
    cheapCandidates:{rendition:Number(cheapCounts.rendition),deletion:Number(cheapCounts.deletion)},
    actionabilityCalls:calls,
    indexRows:{rendition:renditionIndexRows,deletion:deletionIndexRows},
    buffers:{rendition:renditionBuffers,deletion:deletionBuffers},
    limitOne,
    providerEffects,
  };
}
