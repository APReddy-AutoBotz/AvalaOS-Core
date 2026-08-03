import assert from 'node:assert/strict';
import {createApprovedStudioFixture,privateCommand} from './studioPrivateArtifactPostgresFixture.mjs';

export const studioDueWorkActionabilityScenarioNames=[
  'due actionability superseded renditions do not starve current work',
  'due actionability revoked requesters do not starve valid work',
  'due actionability mixed invalid rows consume zero slots',
  'due actionability contradictory metadata does not starve valid work',
  'due actionability current approved ancestry and authority remain discoverable',
  'due actionability read only and provider disabled mutate nothing',
  'due actionability deletion disabled preserves valid rendition work',
  'due actionability active hold pauses deletion without retry',
  'due actionability unexpired retention pauses deletion without retry',
  'due actionability released hold and expired retention resume same attempt',
  'due actionability revoked resolver does not starve valid mixed work',
  'due actionability discovery to claim authority change fails closed',
  'due actionability limit one skips older invalid work',
  'due actionability global kind ordering is deterministic',
  'due actionability repeated discovery is side effect free',
  'due actionability response exposes only kind and attempt id',
  'due actionability concurrent workers retain one fenced owner',
];

const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));

export async function runStudioDueWorkActionabilityEvidence({db,peer,scenario,names=studioDueWorkActionabilityScenarioNames}){
  assert.deepEqual(names,studioDueWorkActionabilityScenarioNames);
  const base=await createApprovedStudioFixture(db);
  let ordinal=0;
  const nextLabel=prefix=>`${prefix}-${++ordinal}`;
  const nextUuid=async()=>String((await db.query('SELECT gen_random_uuid() id')).rows[0].id);
  const currentAuthorization=async actor=>Number((await db.query(
    'SELECT version FROM public.authorization_versions WHERE org_id=$1::uuid AND user_id=$2::uuid',
    [base.org,actor],
  )).rows[0].version);
  const due=async(limit=50)=>(await db.query(
    'SELECT public.studio_private_artifact_reconciliation_due($1::integer) value',
    [limit],
  )).rows[0].value;
  const snapshotAttempt=async attemptId=>(await db.query(
    `SELECT state,reconciliation_count,execution_fence,reconciliation_claimed_at,
      (SELECT count(*)::int FROM public.privileged_audit_events event
       WHERE event.resource_id=$1::uuid) audit_count
     FROM public.studio_rendition_attempts WHERE id=$1::uuid`,
    [attemptId],
  )).rows[0];
  const retire=async ids=>{
    if(!ids.length)return;
    await db.query(
      "UPDATE public.studio_rendition_attempts SET state='failed',failure_code='TEST_RETIRED',completed_at=now() WHERE id=ANY($1::uuid[]) AND state<>'failed'",
      [ids],
    );
  };
  const insertReceipt=async({actor,commandType,resourceId,response,label})=>{
    const receiptId=await nextUuid();
    await db.query(
      `INSERT INTO public.studio_private_artifact_command_receipts(
        id,org_id,workspace_id,actor_id,command_type,idempotency_key,request_id,
        request_hash,status,resource_id,response
       ) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text,gen_random_uuid(),
        encode(public.digest($6::text,'sha256'),'hex'),'committed',$7::uuid,$8::jsonb)`,
      [receiptId,base.org,base.workspace,actor,commandType,nextLabel(label),resourceId,JSON.stringify(response)],
    );
    return receiptId;
  };
  const versionTemplate=(await db.query(
    `SELECT version.template_id,version.content_schema_version,version.renderer_version,
      template.template_version
     FROM public.studio_artifact_versions version
     JOIN public.studio_system_template_versions template ON template.id=version.template_id
     WHERE version.id=$1::uuid`,
    [base.artifactVersionId],
  )).rows[0];
  let syntheticVersion=Number(base.version.version);
  const createSupersededVersion=async()=>{
    syntheticVersion+=1;
    const id=await nextUuid();
    const content=JSON.stringify({title:`Superseded ${syntheticVersion}`,sections:[]});
    await db.query(
      `INSERT INTO public.studio_artifact_versions(
        id,artifact_id,org_id,workspace_id,version,parent_version_id,template_id,
        content_schema_version,renderer_version,content,content_hash,lifecycle,
        author_id,author_authorization_version
       ) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::bigint,$6::uuid,$7::uuid,
        $8::text,$9::text,$10::jsonb,encode(public.digest($10::text,'sha256'),'hex'),
        'approved',$11::uuid,$12::bigint)`,
      [id,base.artifactId,base.org,base.workspace,syntheticVersion,base.artifactVersionId,
        versionTemplate.template_id,versionTemplate.content_schema_version,
        versionTemplate.renderer_version,content,base.requester,await currentAuthorization(base.requester)],
    );
    return{id,version:syntheticVersion};
  };
  const createAttempt=async({
    versionId=base.artifactVersionId,
    artifactVersion=Number(base.version.version),
    actor=base.requester,
    authorizationVersion,
    format='markdown',
    ageMinutes=10,
    state='requested',
    metadata='empty',
    phase=null,
  }={})=>{
    const attemptId=await nextUuid();
    const renditionId=await nextUuid();
    const opaqueObjectId=await nextUuid();
    const requestId=await nextUuid();
    const receiptId=await insertReceipt({
      actor,commandType:'studio.rendition.generate',resourceId:attemptId,
      response:{attemptId},label:'due-rendition-receipt',
    });
    const renderer=format==='markdown'?'studio-markdown-1':format==='pdf'?'studio-pdf-1':'studio-docx-1';
    const extension=format==='markdown'?'md':format;
    const mime=format==='markdown'?'text/markdown; charset=utf-8':format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const objectKey=`${base.org}/${base.workspace}/studio-artifacts/${opaqueObjectId}.${extension}`;
    const complete=metadata==='complete';
    const partial=metadata==='partial';
    await db.query(
      `INSERT INTO public.studio_rendition_attempts(
        id,rendition_id,opaque_object_id,org_id,workspace_id,artifact_id,
        artifact_version_id,artifact_version,artifact_type,format,renderer_version,
        template_version,content_schema_version,requested_by,requester_authorization_version,
        request_id,receipt_id,state,storage_provider,bucket_id,object_key,content_hash,
        byte_length,mime_type,safe_filename,reconciliation_phase,state_changed_at,created_at
       ) VALUES(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::bigint,
        'brd',$9::text,$10::text,$11::text,$12::text,$13::uuid,$14::bigint,$15::uuid,
        $16::uuid,$17::text,$18::text,$19::text,$20::text,$21::text,$22::bigint,$23::text,
        $24::text,$25::text,now()-make_interval(mins=>$26::integer),
        now()-make_interval(mins=>$26::integer)
       )`,
      [attemptId,renditionId,opaqueObjectId,base.org,base.workspace,base.artifactId,
        versionId,artifactVersion,format,renderer,versionTemplate.template_version,
        versionTemplate.content_schema_version,actor,authorizationVersion??await currentAuthorization(actor),
        requestId,receiptId,state,complete||partial?'supabase':null,complete?'studio-private-artifacts':null,
        complete?objectKey:null,complete?'b'.repeat(64):null,complete?256:null,complete?mime:null,
        complete?`due.${extension}`:null,phase,ageMinutes],
    );
    return{attemptId,renditionId,opaqueObjectId,objectKey,format};
  };
  const addActor=async()=>{
    const actor=await nextUuid();
    await db.query('INSERT INTO auth.users(id) VALUES($1::uuid)',[actor]);
    await db.query("INSERT INTO public.profiles(id,email) VALUES($1::uuid,$2::text)",[actor,`${nextLabel('due-actor')}@fixture.invalid`]);
    await db.query("INSERT INTO public.organization_members(org_id,user_id,role_id,status) VALUES($1::uuid,$2::uuid,$3::uuid,'active')",[base.org,actor,base.role]);
    await db.query("INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,status) VALUES($1::uuid,$2::uuid,$3::uuid,'active')",[base.org,base.workspace,actor]);
    return actor;
  };
  const alternate=await addActor();

  const supersededOne=await createSupersededVersion();
  const supersededTwo=await createSupersededVersion();
  const supersededAttempts=[
    await createAttempt({versionId:supersededOne.id,artifactVersion:supersededOne.version,format:'markdown',ageMinutes:40}),
    await createAttempt({versionId:supersededTwo.id,artifactVersion:supersededTwo.version,format:'pdf',ageMinutes:39}),
  ];
  const supersededWinner=await createAttempt({actor:base.reviewer,format:'docx',ageMinutes:10});
  const supersededDue=await due(2);
  await scenario(names[0],async()=>{
    assert.deepEqual(supersededDue,[{kind:'rendition',attemptId:supersededWinner.attemptId}]);
    assert.equal(supersededDue.some(item=>supersededAttempts.some(stale=>stale.attemptId===item.attemptId)),false);
  });
  await retire([supersededWinner.attemptId]);

  const noCapabilityRole=await nextUuid();
  await db.query(
    "INSERT INTO public.roles(id,org_id,name,slug,scope,permissions) VALUES($1::uuid,$2::uuid,'No Studio authority',$3::text,'organization','[]'::jsonb)",
    [noCapabilityRole,base.org,nextLabel('no-studio-authority')],
  );
  await db.query(
    'UPDATE public.organization_members SET role_id=$1::uuid WHERE org_id=$2::uuid AND user_id=$3::uuid',
    [noCapabilityRole,base.org,base.requester],
  );
  const revokedAuth=await currentAuthorization(base.requester);
  const revokedAttempts=[
    await createAttempt({actor:base.requester,authorizationVersion:revokedAuth,format:'markdown',ageMinutes:38}),
    await createAttempt({actor:base.requester,authorizationVersion:revokedAuth,format:'pdf',ageMinutes:37}),
  ];
  const authorityWinner=await createAttempt({actor:base.reviewer,format:'docx',ageMinutes:9});
  const authorityDue=await due(2);
  await scenario(names[1],async()=>{
    assert.deepEqual(authorityDue,[{kind:'rendition',attemptId:authorityWinner.attemptId}]);
    assert.equal(authorityDue.some(item=>revokedAttempts.some(stale=>stale.attemptId===item.attemptId)),false);
  });
  await retire([...revokedAttempts.map(item=>item.attemptId),authorityWinner.attemptId]);

  const mixedRevoked=await createAttempt({actor:base.requester,authorizationVersion:revokedAuth,format:'markdown',ageMinutes:36});
  const mixedWinner=await createAttempt({actor:base.reviewer,format:'pdf',ageMinutes:8});
  const mixedDue=await due(2);
  await scenario(names[2],async()=>assert.deepEqual(mixedDue,[{kind:'rendition',attemptId:mixedWinner.attemptId}]));
  await retire([mixedRevoked.attemptId,mixedWinner.attemptId]);

  const partial=await createAttempt({actor:base.reviewer,format:'markdown',state:'reconciliation_required',metadata:'partial',phase:'verify_or_upload',ageMinutes:35});
  const metadataWinner=await createAttempt({actor:base.reviewer,format:'pdf',ageMinutes:7});
  const metadataDue=await due(1);
  await scenario(names[3],async()=>assert.deepEqual(metadataDue,[{kind:'rendition',attemptId:metadataWinner.attemptId}]));
  await retire([partial.attemptId,metadataWinner.attemptId]);

  const currentWinner=await createAttempt({actor:base.reviewer,format:'markdown',ageMinutes:6});
  await scenario(names[4],async()=>assert.deepEqual(await due(1),[{kind:'rendition',attemptId:currentWinner.attemptId}]));
  const runtimeBefore=await snapshotAttempt(currentWinner.attemptId);
  await db.query('UPDATE public.studio_private_artifact_runtime_control SET read_only=true WHERE singleton');
  const readOnlyDue=await due(50);
  const readOnlyAfter=await snapshotAttempt(currentWinner.attemptId);
  await db.query('UPDATE public.studio_private_artifact_runtime_control SET read_only=false,provider_enabled=false WHERE singleton');
  const providerDisabledDue=await due(50);
  const providerDisabledAfter=await snapshotAttempt(currentWinner.attemptId);
  await db.query('UPDATE public.studio_private_artifact_runtime_control SET provider_enabled=true WHERE singleton');
  await scenario(names[5],async()=>assert.deepEqual(
    {readOnlyDue,providerDisabledDue,runtimeBefore,readOnlyAfter,providerDisabledAfter},
    {readOnlyDue:[],providerDisabledDue:[],runtimeBefore,readOnlyAfter:runtimeBefore,providerDisabledAfter:runtimeBefore},
  ));
  await retire([currentWinner.attemptId]);

  let commandOrdinal=0;
  const commandUuid=()=>`86000000-0000-4000-8000-${String(++commandOrdinal).padStart(12,'0')}`;
  const command=async(commandType,actor,payload,label)=>privateCommand(db,{
    commandType,actorId:actor,organizationId:base.org,workspaceId:base.workspace,
    requestId:commandUuid(),idempotencyKey:nextLabel(label),authorizationVersion:await currentAuthorization(actor),payload,
  });
  await command('studio.retention.policy.publish',base.reviewer,{artifactType:'brd',retentionDays:0,indefinite:false,rationale:'expired due-work fixture'},'due-retention-zero');
  const renderAvailable=async(format,actor,label)=>{
    const generation=await command('studio.rendition.generate',actor,{artifactVersionId:base.artifactVersionId,format},`${label}-generate`);
    const claim=generation.renditionClaim;
    const extension=format==='markdown'?'md':format;
    const mime=format==='markdown'?'text/markdown; charset=utf-8':format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const objectKey=`${base.org}/${base.workspace}/studio-artifacts/${claim.opaqueObjectId}.${extension}`;
    await db.query('SELECT public.studio_rendition_attempt_start($1::uuid)',[claim.attemptId]);
    await db.query(
      'SELECT public.studio_rendition_attempt_rendered($1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text,$7::text,$8::text,$9::text)',
      [claim.attemptId,objectKey,'c'.repeat(64),256,mime,`${label}.${extension}`,claim.rendererVersion,claim.templateVersion,claim.contentSchemaVersion],
    );
    const completion=(await db.query('SELECT public.studio_rendition_attempt_complete($1::uuid) value',[claim.attemptId])).rows[0].value;
    return{...generation,attemptId:claim.attemptId,renditionId:completion.renditionId};
  };
  const prepareDeletion=async({format,requester,resolver,label})=>{
    const rendered=await renderAvailable(format,requester,label);
    const request=await command('studio.rendition.deletion.request',requester,{renditionId:rendered.renditionId,rationale:`${label} request`},`${label}-request`);
    const approval=await command('studio.rendition.deletion.resolve',resolver,{renditionId:rendered.renditionId,deletionRequestId:request.resource.deletionRequestId,outcome:'approve',rationale:`${label} approval`},`${label}-approve`);
    const attemptId=approval.deletionClaim.deletionAttemptId;
    await db.query("UPDATE public.studio_rendition_deletion_attempts SET state_changed_at=now()-interval '20 minutes' WHERE id=$1::uuid",[attemptId]);
    return{...rendered,request,approval,attemptId};
  };
  const deletionA=await prepareDeletion({format:'markdown',requester:base.reviewer,resolver:base.approver,label:'due-delete-a'});
  const deletionB=await prepareDeletion({format:'pdf',requester:base.reviewer,resolver:alternate,label:'due-delete-b'});
  const deletionFairRendition=await createAttempt({actor:base.reviewer,format:'docx',ageMinutes:5});
  await db.query('UPDATE public.studio_private_artifact_runtime_control SET deletion_enabled=false WHERE singleton');
  const deletionDisabledDue=await due(10);
  await db.query('UPDATE public.studio_private_artifact_runtime_control SET deletion_enabled=true WHERE singleton');
  await scenario(names[6],async()=>{
    assert.equal(deletionDisabledDue.some(item=>item.kind==='deletion'),false);
    assert.equal(deletionDisabledDue.some(item=>item.attemptId===deletionFairRendition.attemptId),true);
  });
  await retire([deletionFairRendition.attemptId]);

  const deletionBeforePause=(await db.query('SELECT reconciliation_count,execution_fence,state FROM public.studio_rendition_deletion_attempts WHERE id=$1::uuid',[deletionA.attemptId])).rows[0];
  const holdId=await nextUuid();
  const holdReceipt=await insertReceipt({actor:base.reviewer,commandType:'studio.legal_hold.place',resourceId:holdId,response:{holdId,renditionId:deletionA.renditionId},label:'due-hold-place'});
  await db.query(
    `INSERT INTO public.studio_rendition_legal_hold_events(
      id,hold_id,event_type,rendition_id,org_id,workspace_id,rationale,actor_id,
      actor_authorization_version,receipt_id,audit_event_id
     ) VALUES($1::uuid,$1::uuid,'placed',$2::uuid,$3::uuid,$4::uuid,'due hold',
      $5::uuid,$6::bigint,$7::uuid,gen_random_uuid())`,
    [holdId,deletionA.renditionId,base.org,base.workspace,base.reviewer,await currentAuthorization(base.reviewer),holdReceipt],
  );
  const holdDue=await due(50);
  const deletionAfterHold=(await db.query('SELECT reconciliation_count,execution_fence,state FROM public.studio_rendition_deletion_attempts WHERE id=$1::uuid',[deletionA.attemptId])).rows[0];
  await scenario(names[7],async()=>assert.deepEqual(
    {returned:holdDue.some(item=>item.attemptId===deletionA.attemptId),before:deletionBeforePause,after:deletionAfterHold},
    {returned:false,before:deletionBeforePause,after:deletionBeforePause},
  ));
  const releaseId=await nextUuid();
  const releaseReceipt=await insertReceipt({actor:base.reviewer,commandType:'studio.legal_hold.release',resourceId:releaseId,response:{holdId,renditionId:deletionA.renditionId},label:'due-hold-release'});
  await db.query(
    `INSERT INTO public.studio_rendition_legal_hold_events(
      id,hold_id,event_type,place_event_id,rendition_id,org_id,workspace_id,rationale,
      actor_id,actor_authorization_version,receipt_id,audit_event_id
     ) VALUES($1::uuid,$2::uuid,'released',$2::uuid,$3::uuid,$4::uuid,$5::uuid,
      'due hold release',$6::uuid,$7::bigint,$8::uuid,gen_random_uuid())`,
    [releaseId,holdId,deletionA.renditionId,base.org,base.workspace,base.reviewer,await currentAuthorization(base.reviewer),releaseReceipt],
  );
  const holdReleasedDue=await due(50);

  const extensionId=await nextUuid();
  const extensionReceipt=await insertReceipt({actor:base.reviewer,commandType:'studio.rendition.retention.extend',resourceId:extensionId,response:{renditionId:deletionA.renditionId},label:'due-retention-extension'});
  await db.query(
    `INSERT INTO public.studio_rendition_retention_extensions(
      id,rendition_id,org_id,workspace_id,extended_until,indefinite,rationale,
      actor_id,actor_authorization_version,receipt_id,audit_event_id
     ) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,clock_timestamp()+interval '1 second',
      false,'due retention pause',$5::uuid,$6::bigint,$7::uuid,gen_random_uuid())`,
    [extensionId,deletionA.renditionId,base.org,base.workspace,base.reviewer,await currentAuthorization(base.reviewer),extensionReceipt],
  );
  const retentionDue=await due(50);
  const deletionAfterRetention=(await db.query('SELECT reconciliation_count,execution_fence,state FROM public.studio_rendition_deletion_attempts WHERE id=$1::uuid',[deletionA.attemptId])).rows[0];
  await scenario(names[8],async()=>assert.deepEqual(
    {returned:retentionDue.some(item=>item.attemptId===deletionA.attemptId),before:deletionBeforePause,after:deletionAfterRetention},
    {returned:false,before:deletionBeforePause,after:deletionBeforePause},
  ));
  await sleep(1200);
  const retentionExpiredDue=await due(50);
  await scenario(names[9],async()=>assert.deepEqual(
    {afterRelease:holdReleasedDue.some(item=>item.attemptId===deletionA.attemptId),afterExpiry:retentionExpiredDue.some(item=>item.attemptId===deletionA.attemptId)},
    {afterRelease:true,afterExpiry:true},
  ));

  await db.query(
    'UPDATE public.organization_members SET role_id=$1::uuid WHERE org_id=$2::uuid AND user_id=$3::uuid',
    [noCapabilityRole,base.org,base.approver],
  );
  const resolverFairRendition=await createAttempt({actor:base.reviewer,format:'docx',ageMinutes:8});
  const resolverDue=await due(2);
  await scenario(names[10],async()=>{
    assert.equal(resolverDue.some(item=>item.attemptId===deletionA.attemptId),false);
    assert.equal(resolverDue.some(item=>item.attemptId===deletionB.attemptId),true);
    assert.equal(resolverDue.some(item=>item.attemptId===resolverFairRendition.attemptId),true);
  });
  await retire([resolverFairRendition.attemptId]);

  const authorityRace=await createAttempt({actor:base.reviewer,format:'docx',ageMinutes:7});
  const raceDiscovered=(await due(50)).some(item=>item.attemptId===authorityRace.attemptId);
  const raceBefore=await snapshotAttempt(authorityRace.attemptId);
  await db.query('UPDATE public.authorization_versions SET version=version+1,updated_at=clock_timestamp() WHERE org_id=$1::uuid AND user_id=$2::uuid',[base.org,base.reviewer]);
  const raceClaim=await Promise.allSettled([db.query('SELECT public.studio_rendition_reconciliation_claim($1::uuid)',[authorityRace.attemptId])]);
  const raceAfter=await snapshotAttempt(authorityRace.attemptId);
  const raceNextDue=await due(50);
  await scenario(names[11],async()=>assert.deepEqual(
    {discovered:raceDiscovered,rejected:raceClaim[0].status==='rejected',before:raceBefore,after:raceAfter,nextExcluded:!raceNextDue.some(item=>item.attemptId===authorityRace.attemptId),otherContinues:raceNextDue.some(item=>item.attemptId===deletionB.attemptId)},
    {discovered:true,rejected:true,before:raceBefore,after:raceBefore,nextExcluded:true,otherContinues:true},
  ));
  await retire([authorityRace.attemptId]);

  await db.query('UPDATE public.studio_rendition_deletion_attempts SET state_changed_at=clock_timestamp() WHERE id=$1::uuid',[deletionB.attemptId]);
  const limitOneWinner=await createAttempt({actor:alternate,format:'docx',ageMinutes:6});
  const limitOneDue=await due(1);
  await scenario(names[12],async()=>assert.deepEqual(limitOneDue,[{kind:'rendition',attemptId:limitOneWinner.attemptId}]));
  await db.query("UPDATE public.studio_rendition_deletion_attempts SET state_changed_at='2020-01-01T00:00:00Z' WHERE id=$1::uuid",[deletionB.attemptId]);
  await db.query("UPDATE public.studio_rendition_attempts SET state_changed_at='2020-01-01T00:00:00Z' WHERE id=$1::uuid",[limitOneWinner.attemptId]);
  const orderedDue=await due(2);
  await scenario(names[13],async()=>assert.deepEqual(orderedDue,[
    {kind:'deletion',attemptId:deletionB.attemptId},
    {kind:'rendition',attemptId:limitOneWinner.attemptId},
  ]));
  const discoveryBefore=await snapshotAttempt(limitOneWinner.attemptId);
  const auditBefore=Number((await db.query('SELECT count(*)::int value FROM public.privileged_audit_events')).rows[0].value);
  const repeated=[await due(2),await due(2),await due(2)];
  const discoveryAfter=await snapshotAttempt(limitOneWinner.attemptId);
  const auditAfter=Number((await db.query('SELECT count(*)::int value FROM public.privileged_audit_events')).rows[0].value);
  const providerCalls=0;
  await scenario(names[14],async()=>assert.deepEqual(
    {same:repeated.every(value=>JSON.stringify(value)===JSON.stringify(orderedDue)),before:discoveryBefore,after:discoveryAfter,auditDelta:auditAfter-auditBefore,providerCalls},
    {same:true,before:discoveryBefore,after:discoveryBefore,auditDelta:0,providerCalls:0},
  ));
  await scenario(names[15],async()=>{
    for(const item of orderedDue)assert.deepEqual(Object.keys(item).sort(),['attemptId','kind']);
    assert.doesNotMatch(JSON.stringify(orderedDue),/(objectKey|bucket|actor|authorization|storage|reason|signedUrl)/iu);
  });
  await retire([limitOneWinner.attemptId]);

  const concurrent=await createAttempt({actor:alternate,format:'docx',ageMinutes:6});
  const concurrentDiscovered=(await due(50)).some(item=>item.attemptId===concurrent.attemptId);
  const claims=await Promise.all([
    db.query('SELECT public.studio_rendition_reconciliation_claim($1::uuid) value',[concurrent.attemptId]),
    peer.query('SELECT public.studio_rendition_reconciliation_claim($1::uuid) value',[concurrent.attemptId]),
  ]);
  const claimValues=claims.map(result=>result.rows[0].value).filter(Boolean);
  const concurrentState=(await db.query(
    `SELECT state,reconciliation_count,execution_fence,
      (SELECT count(*)::int FROM public.privileged_audit_events event
       WHERE event.action='studio.rendition.reconciliation.claim'
         AND event.resource_id=$1::uuid) audit_count
     FROM public.studio_rendition_attempts WHERE id=$1::uuid`,
    [concurrent.attemptId],
  )).rows[0];
  await scenario(names[16],async()=>assert.deepEqual(
    {discovered:concurrentDiscovered,claims:claimValues.length,state:concurrentState.state,count:Number(concurrentState.reconciliation_count),fence:Number(concurrentState.execution_fence),audits:concurrentState.audit_count},
    {discovered:true,claims:1,state:'reconciling',count:1,fence:1,audits:1},
  ));

  return{
    starvationLimit:2,
    supersededExcluded:supersededAttempts.length,
    revokedExcluded:revokedAttempts.length,
    holdRetryDelta:Number(deletionAfterHold.reconciliation_count)-Number(deletionBeforePause.reconciliation_count),
    retentionRetryDelta:Number(deletionAfterRetention.reconciliation_count)-Number(deletionBeforePause.reconciliation_count),
    discoveryAuditDelta:auditAfter-auditBefore,
    discoveryProviderCalls:providerCalls,
    concurrentOwners:claimValues.length,
  };
}
