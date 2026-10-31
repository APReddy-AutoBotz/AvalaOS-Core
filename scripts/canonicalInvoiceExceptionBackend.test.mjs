import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createAuthenticatedHostedPostgresAdapter } from './authenticatedHostedControllerAdapters.mjs';
import { canonicalDatabaseEvidencePassed,readCanonicalInvoiceExceptionDatabaseEvidence } from './canonicalInvoiceExceptionDatabaseEvidence.mjs';
import { createEnterpriseLifecycleFixture } from './enterpriseLifecyclePostgresFixture.mjs';

const databaseUrl = process.env.ENTERPRISE_LIFECYCLE_DATABASE_URL;

const prepareGovernedStudioArtifact = async (fixture, processId) => {
  const { db,ids } = fixture;
  let ordinal = 0;
  const context = actorId => fixture.authorizationVersion(actorId).then(authorizationVersion => ({
    organizationId:ids.organization,workspaceId:ids.workspace,authorizationVersion,
  }));
  const assess = async ({ persona='author',commandType,expectedVersion,payload={},key }) => {
    const response = await fixture.executeAssess({
      requestId:randomUUID(),idempotencyKey:key,commandType,...await context(ids[persona]),
      ...(expectedVersion===undefined?{}:{expectedVersion}),payload:{caseId:ids.case,...payload},
    },fixture.actors[persona].token);
    assert.equal(response.status,200);
    assert.equal(response.body?.outcome,'committed');
    ordinal += 1;
    return response.body;
  };
  const source = structuredClone(fixture.production.fixtureModule.AP_INVOICE_EXCEPTION_V2_FIXTURE);
  const draft = {
    caseId:ids.case,name:'AP Invoice Exception Handling',description:'Governed AP invoice exception assessment.',
    primitives:source.primitives,edges:source.edges,decisionPoints:source.decisionPoints,
    exceptionPaths:source.exceptionPaths,applicationAssets:source.assets,interactions:source.interactions,
    evidenceLinks:source.evidence,agentNecessity:source.agentNecessity,
    candidateEvaluations:[],gateResults:[],controlRequirements:[],modernizationDispositions:[],
  };
  await assess({commandType:'assessment_v2.create',payload:{processId,name:draft.name,description:draft.description},key:'canonical-synthetic-case'});
  await assess({commandType:'assessment_v2.draft.upsert',expectedVersion:1,payload:draft,key:'canonical-synthetic-draft'});
  let decisionId=(await assess({commandType:'assessment_v2.finalize',expectedVersion:2,key:'canonical-synthetic-finalize'})).resource.decisionId;
  const reviewPayload=extra=>({decisionId,reviewSequence:1,...extra});
  await assess({persona:'reviewer',commandType:'assessment_v2.review.assign',expectedVersion:3,
    payload:reviewPayload({reviewerId:ids.reviewer}),key:'canonical-synthetic-assign'});
  const attest=async(targetDecisionId,expectedVersion,prefix)=>{
    const assignment=(await db.query('SELECT material_claims FROM assess_v2_review_assignments WHERE decision_id=$1',[targetDecisionId])).rows[0];
    const evidenceIds=[...new Set(assignment.material_claims.flatMap(item=>item.evidenceIds))];
    assert.ok(evidenceIds.length>0);
    for(const evidenceId of evidenceIds){
      const evidence=(await db.query(`SELECT payload FROM assess_v2_evidence_links
        WHERE id=$1 AND version_id=(SELECT source_version_id FROM assess_v2_decision_versions WHERE id=$2)`,[evidenceId,targetDecisionId])).rows[0];
      await assess({persona:'reviewer',commandType:'assessment_v2.evidence.attest',expectedVersion,
        payload:{decisionId:targetDecisionId,reviewSequence:1,evidenceId,claimIds:evidence.payload.claimIds,
          outcome:'accepted',rationale:'Synthetic AP evidence independently verified.'},key:`${prefix}-${ordinal}`});
    }
  };
  await attest(decisionId,4,'canonical-synthetic-attest-one');
  await assess({persona:'reviewer',commandType:'assessment_v2.review.resolve',expectedVersion:4,
    payload:reviewPayload({resolution:'changes_requested',rationale:'Clarify synthetic AP evidence ownership.',
      conditions:['Clarify evidence ownership.']}),key:'canonical-synthetic-changes'});
  const firstDecisionId=decisionId;
  const revisionVersion=Number((await assess({commandType:'assessment_v2.revision.start',expectedVersion:5,
    payload:reviewPayload({rationale:'Synthetic AP evidence ownership clarified.'}),
    key:'canonical-synthetic-revision'})).resource.caseVersion);
  const snapshot=(await db.query('SELECT output_snapshot FROM assess_v2_decision_versions WHERE id=$1',[firstDecisionId])).rows[0].output_snapshot;
  const revised=structuredClone(draft);
  const claimIds=[...new Set((snapshot.trace??[]).flatMap(item=>item.fieldIds??[])
    .filter(item=>item!=='evidence.coverage'))];
  revised.evidenceLinks[0]={...revised.evidenceLinks[0],claimIds:[...new Set([
    ...(revised.evidenceLinks[0].claimIds??[]),...claimIds,
  ])]};
  await assess({commandType:'assessment_v2.draft.upsert',expectedVersion:revisionVersion,
    payload:revised,key:'canonical-synthetic-revision-draft'});
  decisionId=(await assess({commandType:'assessment_v2.finalize',expectedVersion:revisionVersion+1,
    key:'canonical-synthetic-resubmit'})).resource.decisionId;
  await assess({persona:'reviewer',commandType:'assessment_v2.review.assign',expectedVersion:revisionVersion+2,
    payload:reviewPayload({reviewerId:ids.reviewer}),key:'canonical-synthetic-reassign'});
  await attest(decisionId,revisionVersion+3,'canonical-synthetic-attest-two');
  await assess({persona:'reviewer',commandType:'assessment_v2.review.resolve',expectedVersion:revisionVersion+3,
    payload:reviewPayload({resolution:'approved',rationale:'Synthetic AP decision approved.',conditions:[]}),
    key:'canonical-synthetic-review'});
  const decision=(await db.query('SELECT output_snapshot FROM assess_v2_decision_versions WHERE id=$1',[decisionId])).rows[0].output_snapshot;
  const controls=[...new Set([...(decision.controlRequirements??[]).filter(item=>item.required).map(item=>item.id),
    ...(decision.controls??[])])];
  assert.ok(controls.length>0);
  await assess({persona:'approver',commandType:'assessment_v2.govern.resolve',expectedVersion:revisionVersion+4,
    payload:reviewPayload({rationale:'All synthetic AP controls resolved.',controlDispositions:controls.map(controlId=>({
      controlId,status:'resolved',condition:'',owner:'',dueDate:'',conditionSatisfied:false,
    }))}),key:'canonical-synthetic-govern'});
  await assess({persona:'approver',commandType:'assessment_v2.studio.handoff',expectedVersion:revisionVersion+5,
    payload:reviewPayload({}),key:'canonical-synthetic-assess-handoff'});
  const assessHandoffId=(await db.query('SELECT id FROM assess_v2_studio_handoffs WHERE case_id=$1 AND decision_id=$2',[ids.case,decisionId])).rows[0].id;
  const studio=async({persona,commandType,expectedAggregateVersion,expectedArtifactVersion,payload,key})=>{
    const body={contractVersion:'studio-artifact-2',requestId:randomUUID(),idempotencyKey:key,commandType,
      ...await context(ids[persona]),expectedAggregateVersion,expectedArtifactVersion,payload};
    const response=await fixture.executeStudio(new Request(`${fixture.baseUrl}/functions/v1/studio-artifact-command`,{
      method:'POST',headers:{authorization:`Bearer ${fixture.actors[persona].token}`,'content-type':'application/json'},
      body:JSON.stringify(body),
    }));
    const result=await response.json();
    assert.equal(response.status,201);
    assert.equal(result.outcome,'committed');
    return result;
  };
  const requested=await studio({persona:'author',commandType:'studio.handoff.request',expectedAggregateVersion:0,
    expectedArtifactVersion:null,payload:{upstreamHandoffId:assessHandoffId,artifactType:'brd',targetInputBundle:null},
    key:'canonical-synthetic-studio-request'});
  const handoffId=requested.resource.handoffId;
  await studio({persona:'reviewer',commandType:'studio.handoff.review.resolve',expectedAggregateVersion:1,
    expectedArtifactVersion:1,payload:{handoffId,handoffVersion:1,outcome:'approve',
      rationale:'Synthetic AP source independently reviewed.',conditions:[]},key:'canonical-synthetic-studio-review'});
  await studio({persona:'approver',commandType:'studio.handoff.approval.resolve',expectedAggregateVersion:2,
    expectedArtifactVersion:1,payload:{handoffId,handoffVersion:2,outcome:'approve',
      rationale:'Synthetic AP source accepted.',conditions:[]},key:'canonical-synthetic-studio-approve'});
  const consumed=await studio({persona:'approver',commandType:'studio.handoff.consume',expectedAggregateVersion:3,
    expectedArtifactVersion:1,payload:{handoffId,handoffVersion:3},key:'canonical-synthetic-studio-consume'});
  const template=(await db.query(`SELECT id,template_version FROM studio_system_template_versions
    WHERE artifact_type='brd' AND superseded_at IS NULL`)).rows[0];
  return {artifactId:consumed.resource.resourceId,sourcePackageId:consumed.resource.sourcePackageId,template};
};

const studioGenerationBody = async (fixture,prepared,persona,key) => {
  const aggregate=(await fixture.db.query(`SELECT aggregate_version,current_version_id,current_approved_version_id
    FROM studio_artifact_aggregates WHERE id=$1`,[prepared.artifactId])).rows[0];
  return {contractVersion:'studio-artifact-2',requestId:randomUUID(),idempotencyKey:key,
    commandType:'studio.generation.request',organizationId:fixture.ids.organization,workspaceId:fixture.ids.workspace,
    authorizationVersion:await fixture.authorizationVersion(fixture.ids[persona]),
    expectedAggregateVersion:Number(aggregate.aggregate_version),expectedArtifactVersion:null,
    payload:{artifactId:prepared.artifactId,sourcePackageId:prepared.sourcePackageId,sourcePackageVersion:1,
      template:{kind:'system',versionId:prepared.template.id,version:prepared.template.template_version},
      expectedCurrentVersionId:aggregate.current_version_id,expectedApprovedVersionId:aggregate.current_approved_version_id},
  };
};

const executeStudioGeneration = async (fixture,persona,body) => {
  const response=await fixture.executeStudio(new Request(`${fixture.baseUrl}/functions/v1/studio-artifact-command`,{
    method:'POST',headers:{authorization:`Bearer ${fixture.actors[persona].token}`,'content-type':'application/json'},
    body:JSON.stringify(body),
  }));
  return {status:response.status,body:await response.json()};
};

const executeStudioArtifactLifecycle = async (fixture,persona,artifactId,commandType,payload,key) => {
  const aggregate=(await fixture.db.query(`SELECT aggregate_version,current_version_id
    FROM studio_artifact_aggregates WHERE id=$1`,[artifactId])).rows[0];
  const currentVersion=(await fixture.db.query(`SELECT version FROM studio_artifact_versions
    WHERE id=$1 AND artifact_id=$2`,[aggregate.current_version_id,artifactId])).rows[0];
  const body={requestId:randomUUID(),idempotencyKey:key,commandType,
    organizationId:fixture.ids.organization,workspaceId:fixture.ids.workspace,
    authorizationVersion:await fixture.authorizationVersion(fixture.ids[persona]),
    expectedAggregateVersion:Number(aggregate.aggregate_version),expectedArtifactVersion:Number(currentVersion.version),
    payload:{artifactId,artifactVersionId:aggregate.current_version_id,...payload}};
  const response=await fixture.executeStudio(new Request(`${fixture.baseUrl}/functions/v1/studio-artifact-command`,{
    method:'POST',headers:{authorization:`Bearer ${fixture.actors[persona].token}`,'content-type':'application/json'},
    body:JSON.stringify(body),
  }));
  const result=await response.json();
  assert.equal(response.status,201,`${commandType} failed: ${JSON.stringify(result?.error??{})}`);
  assert.equal(result.outcome,'committed');
  return result;
};

const executeDeliveryCommand = async (fixture,actor,commandType,payload,key=randomUUID()) => {
  const response=await fetch(`${fixture.baseUrl}/functions/v1/enterprise-intelligence-command`,{
    method:'POST',headers:{authorization:`Bearer ${actor.token}`,'content-type':'application/json'},
    body:JSON.stringify({commandType,requestId:randomUUID(),idempotencyKey:`${commandType}:${key}`,
      organizationId:fixture.ids.organization,workspaceId:fixture.ids.workspace,payload}),
  });
  return {status:response.status,body:await response.json()};
};

test('canonical AP fixture mounts production Delivery/Monitor and disposable password auth', {
  skip: databaseUrl ? false : 'ENTERPRISE_LIFECYCLE_DATABASE_URL is required',
  timeout: 300_000,
}, async () => {
  const fixture = await createEnterpriseLifecycleFixture({
    databaseUrl,
    runId: 'canonical-ap-backend-contract',
    runAttempt: '1',
    headSha: 'local-working-tree',
    canonicalApInvoiceException: true,
    hostedPersonaRoleParity: true,
    providersEnabled: false,
    authenticatedSynthetic: true,
  });
  try {
    const setupResponse = await fetch(`${fixture.baseUrl}/control/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-enterprise-lifecycle-control': fixture.controlToken },
      body: JSON.stringify({ projectName: 'canonical-ap-backend' }),
    });
    assert.equal(setupResponse.status, 200);
    const setup = await setupResponse.json();
    assert.equal(setup.aliases.process, 'canonical-ap-backend prerequisite process');
    assert.equal(setup.deliveryProject.name, 'AP Invoice Exception Workflow');
    assert.equal(setup.authenticationBoundary, 'disposable_synthetic_password');
    assert.ok(setup.actors.deliveryOwner);
    assert.equal(new Set(['author','reviewer','approver','deliveryOwner']
      .map(persona=>setup.actors[persona].user.id)).size,4);
    const deliveryOwnerCapabilities=(await fixture.db.query(`SELECT capability_key
      FROM public.role_capabilities WHERE role_id=$1 ORDER BY capability_key`,[
      fixture.ids.deliveryOwnerRole,
    ])).rows.map(row=>row.capability_key);
    assert.deepEqual(deliveryOwnerCapabilities,[
      'assess.read','delivery.handoff.consume','delivery.package.manage','project.read',
    ]);

    const deniedPassword = await fetch(`${fixture.baseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: setup.actors.author.user.email, password: 'incorrect' }),
    });
    assert.equal(deniedPassword.status, 400);

    const tokenResponse = await fetch(`${fixture.baseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: setup.actors.author.user.email, password: setup.actors.author.password }),
    });
    assert.equal(tokenResponse.status, 200);
    const session = await tokenResponse.json();
    assert.equal(session.user.id, setup.actors.author.user.id);
    assert.equal(session.user.app_metadata.provider, 'disposable_synthetic_password');

    const processId = randomUUID();
    const processRequestId = randomUUID();
    const processEnvelope = {
      requestId:processRequestId,idempotencyKey:`process.create.${randomUUID()}`,
      commandType:'process.create',organizationId:fixture.ids.organization,workspaceId:fixture.ids.workspace,
      authorizationVersion:await fixture.authorizationVersion(fixture.ids.author),expectedVersion:0,
      payload:{ processId,name:'AP Invoice Exception Handling',
        description:'Route invoice exceptions through governed evidence, review, delivery and monitoring.',
        department:'Finance Operations',criticality:'High' },
    };
    const createProcess = () => fetch(`${fixture.baseUrl}/functions/v1/process-command`, {
      method:'POST',headers:{authorization:`Bearer ${setup.actors.author.token}`,'content-type':'application/json'},
      body:JSON.stringify(processEnvelope),
    });
    const createdResponse = await createProcess();
    assert.equal(createdResponse.status,200);
    const created = await createdResponse.json();
    assert.equal(created.ok,true);
    assert.equal(created.outcome,'committed');
    assert.equal(created.resource.id,processId);
    assert.equal(created.resource.requestId,processRequestId);
    assert.match(created.resource.receiptId,/^[0-9a-f-]{36}$/iu);
    const replayedResponse = await createProcess();
    assert.equal(replayedResponse.status,200);
    assert.equal((await replayedResponse.json()).outcome,'replayed');
    const bind = candidate => fetch(`${fixture.baseUrl}/control/canonical-created-process`, {
      method:'POST',headers:{'content-type':'application/json','x-enterprise-lifecycle-control':fixture.controlToken},
      body:JSON.stringify({projectName:'canonical-ap-backend',processId:candidate}),
    });
    assert.equal((await bind(randomUUID())).status,409);
    const boundResponse = await bind(processId);
    assert.equal(boundResponse.status,200);
    assert.deepEqual(await boundResponse.json(),{processId,name:'AP Invoice Exception Handling'});
    const repeatedBindResponse = await bind(processId);
    assert.equal(repeatedBindResponse.status,200);
    assert.deepEqual(await repeatedBindResponse.json(),{processId,name:'AP Invoice Exception Handling'});
    assert.equal(fixture.expectedBrowserCaseProcesses()
      .find(item => item.projectName === 'canonical-ap-backend')?.processId,processId);
    const linkedProject = await fixture.db.query('SELECT source_process_id FROM public.projects WHERE id=$1', [setup.deliveryProject.id]);
    assert.equal(linkedProject.rows[0]?.source_process_id,processId);
    const emptyCanonicalEvidence=await readCanonicalInvoiceExceptionDatabaseEvidence(fixture,'canonical-ap-backend');
    assert.equal(emptyCanonicalEvidence.baselineCount,0);
    assert.equal(canonicalDatabaseEvidencePassed(emptyCanonicalEvidence),false);

    const exerciseId=randomUUID();
    const digest=character=>`sha256:${character.repeat(64)}`;
    const activation=(await fixture.serviceQuery(`SELECT public.authenticated_synthetic_local_exercise_activate(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) value`,[
      exerciseId,'a'.repeat(40),digest('b'),'http://127.0.0.1:4173',digest('c'),'20261019161723',
      digest('d'),digest('e'),'local-real-backend-authenticated-profile-v1',digest('f'),digest('1'),
      fixture.ids.organization,fixture.ids.workspace,new Date(Date.now()+30*60_000),
    ])).rows[0].value;
    assert.equal(activation.lifecycle,'active');
    for(const [persona,boundPersona] of [['author','author'],['approver','approver'],['deliveryOwner','delivery_owner']]){
      const actor=setup.actors[persona];
      await fixture.serviceQuery('SELECT public.authenticated_synthetic_bind_session($1,$2,$3,$4)',[
        exerciseId,actor.user.id,actor.sessionId,boundPersona,
      ]);
    }
    const prepared=await prepareGovernedStudioArtifact(fixture,processId);
    const armStudioPermit=(persona,kind,body,accessToken=setup.actors[persona].token)=>fetch(
      `${fixture.baseUrl}/control/arm-browser-fault`,{
        method:'POST',headers:{'content-type':'application/json','x-enterprise-lifecycle-control':fixture.controlToken},
        body:JSON.stringify({projectName:'canonical-ap-backend',persona,kind,
          commandType:'studio.generation.request',requestBody:body,accessToken}),
      });
    const successBody=await studioGenerationBody(fixture,prepared,'approver','canonical-synthetic-generation-success');
    assert.equal((await armStudioPermit('approver','studio_deterministic_success',successBody,
      setup.actors.author.token)).status,409);
    assert.equal((await armStudioPermit('approver','studio_deterministic_success',successBody)).status,200);
    const changedPayload=structuredClone(successBody);
    changedPayload.idempotencyKey='canonical-synthetic-generation-mismatch';
    const versionsBeforeMismatch=Number((await fixture.db.query(
      'SELECT count(*) count FROM studio_artifact_versions WHERE artifact_id=$1',[prepared.artifactId])).rows[0].count);
    const mismatch=await executeStudioGeneration(fixture,'approver',changedPayload);
    assert.notEqual(mismatch.status,201);
    const mismatchState=(await fixture.db.query(`SELECT
      (SELECT count(*)::int FROM studio_artifact_generation_attempts WHERE request_id=$1) attempts,
      (SELECT state FROM authenticated_synthetic_permits WHERE request_id=$1) permit_state`,[successBody.requestId])).rows[0];
    assert.deepEqual(mismatchState,{attempts:0,permit_state:'armed'});
    assert.equal(Number((await fixture.db.query(
      'SELECT count(*) count FROM studio_artifact_versions WHERE artifact_id=$1',[prepared.artifactId])).rows[0].count),
    versionsBeforeMismatch);
    const generated=await executeStudioGeneration(fixture,'approver',successBody);
    assert.equal(generated.status,201);
    assert.equal(generated.body.outcome,'generation_completed');

    const failureBody=await studioGenerationBody(fixture,prepared,'author','canonical-synthetic-generation-failure');
    assert.equal((await armStudioPermit('author','studio_failure_after_claim',failureBody)).status,200);
    const failureFrameAdapter=createAuthenticatedHostedPostgresAdapter({
      config:{scope:{organizationId:fixture.ids.organization,workspaceId:fixture.ids.workspace}},db:fixture.db,
      verifyDeployment:async()=>{},verifySecretBackend:async()=>{},
    });
    const failureFrameProject={processId,projectId:setup.deliveryProject.id,identities:{}};
    const beforeFailureFrame=await failureFrameAdapter.frame('/control/studio-failure-frame',{
      project:failureFrameProject,testId:'STUDIO-003',
    });
    const artifactBeforeFailure=(await fixture.db.query(`SELECT aggregate_version,current_version_id,
      (SELECT count(*)::int FROM studio_artifact_versions version WHERE version.artifact_id=artifact.id) versions
      FROM studio_artifact_aggregates artifact WHERE id=$1`,[prepared.artifactId])).rows[0];
    const failed=await executeStudioGeneration(fixture,'author',failureBody);
    assert.equal(failed.status,200);
    assert.equal(failed.body.outcome,'generation_failed');
    const artifactAfterFailure=(await fixture.db.query(`SELECT aggregate_version,current_version_id,
      (SELECT count(*)::int FROM studio_artifact_versions version WHERE version.artifact_id=artifact.id) versions,
      (SELECT state FROM authenticated_synthetic_permits WHERE request_id=$2) permit_state,
      (SELECT state FROM studio_artifact_generation_attempts WHERE request_id=$2) attempt_state
      FROM studio_artifact_aggregates artifact WHERE id=$1`,[prepared.artifactId,failureBody.requestId])).rows[0];
    assert.equal(artifactAfterFailure.versions,artifactBeforeFailure.versions);
    assert.equal(artifactAfterFailure.current_version_id,artifactBeforeFailure.current_version_id);
    assert.equal(Number(artifactAfterFailure.aggregate_version),Number(artifactBeforeFailure.aggregate_version)+1);
    assert.equal(artifactAfterFailure.permit_state,'consumed');
    assert.equal(artifactAfterFailure.attempt_state,'failed');
    const afterFailureFrame=await failureFrameAdapter.frame('/control/studio-failure-frame',{
      project:failureFrameProject,testId:'STUDIO-003',
    });
    assert.equal(afterFailureFrame.versions,beforeFailureFrame.versions);
    assert.equal(afterFailureFrame.aggregateVersion,beforeFailureFrame.aggregateVersion+1);
    assert.equal(afterFailureFrame.generationAttempts,beforeFailureFrame.generationAttempts+1);
    assert.equal(afterFailureFrame.receipts,beforeFailureFrame.receipts+1);
    assert.equal(afterFailureFrame.audits,beforeFailureFrame.audits+2);
    assert.equal(afterFailureFrame.targetHash,beforeFailureFrame.targetHash);
    const assertBusinessMutationChangesHash=async sql=>{
      await fixture.db.query('BEGIN');
      try{
        await fixture.db.query('SET LOCAL session_replication_role=replica');
        const changed=await fixture.db.query(sql,[prepared.artifactId]);
        assert.equal(changed.rowCount,1);
        const mutated=await failureFrameAdapter.frame('/control/studio-failure-frame',{
          project:failureFrameProject,testId:'STUDIO-003',
        });
        assert.notEqual(mutated.targetHash,afterFailureFrame.targetHash);
      }finally{await fixture.db.query('ROLLBACK');}
    };
    await assertBusinessMutationChangesHash(`UPDATE public.studio_artifact_versions version SET
      content=version.content||'{"failureFrameProbe":true}'::jsonb,
      content_hash=public.enterprise_sha256_jsonb(version.content||'{"failureFrameProbe":true}'::jsonb)
      WHERE version.id=(SELECT current_version_id FROM public.studio_artifact_aggregates WHERE id=$1)`);
    await assertBusinessMutationChangesHash(`UPDATE public.studio_artifact_aggregates
      SET current_version_id=NULL WHERE id=$1`);
    await assertBusinessMutationChangesHash(`UPDATE public.studio_artifact_aggregates
      SET lifecycle=CASE WHEN lifecycle='approved' THEN 'draft' ELSE 'approved' END WHERE id=$1`);
    assert.equal(fixture.evidence.providerEffects.syntheticProviderCalls,0);
    assert.equal(fixture.evidence.providerEffects.egressAttempts,0);

    const queryProjection = actor => fetch(`${fixture.baseUrl}/functions/v1/enterprise-intelligence-query`, {
      method: 'POST',
      headers: { authorization: `Bearer ${actor.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: fixture.ids.organization, workspaceId: fixture.ids.workspace }),
    });
    const emptyProjectionResponse = await queryProjection(setup.actors.author);
    assert.equal(emptyProjectionResponse.status, 200);
    const emptyProjection = (await emptyProjectionResponse.json()).projection;
    assert.equal(emptyProjection.organizationId, fixture.ids.organization);
    assert.equal(emptyProjection.workspaceId, fixture.ids.workspace);
    const directRaw = await fixture.production.enterpriseQueryDatabase.loadProjectionRows({
      userId:setup.actors.author.user.id,organizationId:fixture.ids.organization,workspaceId:fixture.ids.workspace,
      authorizationVersion:emptyProjection.authorizationVersion,capabilities:emptyProjection.capabilities,
    });
    assert.ok(directRaw.deliveryWorkspace,'direct canonical delivery projection missing');
    const directProjection = fixture.production.enterpriseQueryModule.buildEnterpriseIntelligenceProjection({
      userId:setup.actors.author.user.id,organizationId:fixture.ids.organization,workspaceId:fixture.ids.workspace,
      authorizationVersion:emptyProjection.authorizationVersion,capabilities:emptyProjection.capabilities,
    },directRaw);
    assert.ok(directProjection.deliveryWorkspace,'direct production projection missing delivery workspace');
    assert.ok(emptyProjection.deliveryWorkspace,
      `delivery workspace missing for ${JSON.stringify({capabilities:emptyProjection.capabilities,
        endpointKeys:Object.keys(emptyProjection),directKeys:Object.keys(directProjection)})}`);
    assert.equal(emptyProjection.deliveryWorkspace.contractVersion, 'enterprise-delivery-workspace-2');
    assert.equal(emptyProjection.monitorApprovedBaselines.contractVersion, 'enterprise-monitor-approved-baselines-2');

    const idempotencyKey = `canonical-ap-manual-${randomUUID()}`;
    const command = requestId => fetch(`${fixture.baseUrl}/functions/v1/enterprise-intelligence-command`, {
      method: 'POST',
      headers: { authorization: `Bearer ${setup.actors.author.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        commandType: 'delivery.package.create.manual', requestId, idempotencyKey,
        organizationId: fixture.ids.organization, workspaceId: fixture.ids.workspace,
        payload: {
          manualBrief: 'AP invoice exception delivery verification only.',
          items: [{ clientKey: 'ap-exception-review', itemType: 'Task',
            title: 'Review AP invoice exception', description: 'Verify the governed exception route.',
            acceptanceCriteria: ['Exact invoice exception lineage remains visible.'],
            nonFunctionalRequirements: ['Audit every human decision.'] }],
        },
      }),
    });
    const committedResponse = await command(randomUUID());
    assert.equal(committedResponse.status, 200);
    const committed = await committedResponse.json();
    assert.equal(committed.ok, true);
    assert.match(committed.resourceId, /^[0-9a-f-]{36}$/iu);
    const replayResponse = await command(randomUUID());
    assert.equal(replayResponse.status, 200);
    const replay = await replayResponse.json();
    assert.equal(replay.resourceId, committed.resourceId);

    const populatedProjectionResponse = await queryProjection(setup.actors.author);
    assert.equal(populatedProjectionResponse.status, 200);
    const populatedProjection = (await populatedProjectionResponse.json()).projection;
    assert.equal(populatedProjection.deliveryWorkspace.packages.length, 1);
    assert.equal(populatedProjection.deliveryWorkspace.packages[0].id, committed.resourceId);

    const studioApprovalPrerequisite=(await fixture.db.query(`SELECT aggregate.lifecycle,
      version.lifecycle version_lifecycle,version.author_id
      FROM public.studio_artifact_aggregates aggregate
      JOIN public.studio_artifact_versions version ON version.id=aggregate.current_version_id
      WHERE aggregate.id=$1`,[prepared.artifactId])).rows[0];
    assert.deepEqual(studioApprovalPrerequisite,{
      lifecycle:'draft',version_lifecycle:'draft',author_id:setup.actors.approver.user.id,
    });
    await executeStudioArtifactLifecycle(fixture,'approver',prepared.artifactId,
      'studio.artifact.review.submit',{},'canonical-delivery-studio-submit');
    await executeStudioArtifactLifecycle(fixture,'author',prepared.artifactId,
      'studio.artifact.review.assign',{reviewerId:fixture.ids.reviewer},'canonical-delivery-studio-assign');
    await executeStudioArtifactLifecycle(fixture,'reviewer',prepared.artifactId,
      'studio.artifact.review.resolve',{outcome:'approve',rationale:'Independent Studio review approved.',conditions:[]},
      'canonical-delivery-studio-review');
    await executeStudioArtifactLifecycle(fixture,'author',prepared.artifactId,
      'studio.artifact.approval.resolve',{outcome:'approve',rationale:'Independent Studio approval committed.',conditions:[]},
      'canonical-delivery-studio-approval');

    const eligibleProjectionResponse=await queryProjection(setup.actors.author);
    assert.equal(eligibleProjectionResponse.status,200);
    const eligibleProjection=(await eligibleProjectionResponse.json()).projection;
    const candidate=eligibleProjection.deliveryWorkspace.eligibleStudioArtifacts
      .find(item=>item.studioArtifactId===prepared.artifactId);
    assert.ok(candidate,'approved exact Studio artifact must be eligible for Delivery');
    const requestedDelivery=await executeDeliveryCommand(fixture,setup.actors.author,'delivery.handoff.request',{
      targetWorkspaceId:fixture.ids.workspace,studioArtifactId:candidate.studioArtifactId,
      studioArtifactVersionId:candidate.studioArtifactVersionId,
      expectedAggregateVersion:candidate.aggregateVersion,
      expectedCurrentVersionId:candidate.studioArtifactVersionId,
      expectedApprovedVersionId:candidate.studioArtifactVersionId,
    },'canonical-four-person-request');
    assert.equal(requestedDelivery.status,200);
    assert.equal(requestedDelivery.body.outcome,'committed');
    const deliveryHandoffId=requestedDelivery.body.resourceId;
    const reviewedDelivery=await executeDeliveryCommand(fixture,setup.actors.reviewer,
      'delivery.handoff.review.resolve',{handoffId:deliveryHandoffId,expectedHandoffVersion:1,
        outcome:'approved',rationale:'Independent Delivery review approved.'},'canonical-four-person-review');
    assert.equal(reviewedDelivery.status,200);
    assert.equal(reviewedDelivery.body.resourceVersion,2);
    const approvedDelivery=await executeDeliveryCommand(fixture,setup.actors.approver,
      'delivery.handoff.approval.resolve',{handoffId:deliveryHandoffId,expectedHandoffVersion:2,
        outcome:'approved',rationale:'Independent Delivery approval committed.'},'canonical-four-person-approval');
    assert.equal(approvedDelivery.status,200);
    assert.equal(approvedDelivery.body.resourceVersion,3);

    for(const persona of ['author','reviewer','approver']){
      const denied=await executeDeliveryCommand(fixture,setup.actors[persona],'delivery.handoff.consume',{
        handoffId:deliveryHandoffId,expectedHandoffVersion:3,
      },`canonical-four-person-consume-denied-${persona}`);
      assert.notEqual(denied.status,200,`${persona} must not consume its participated handoff`);
      const unchanged=(await fixture.db.query(`SELECT status,current_version,
        (SELECT count(*)::int FROM public.enterprise_delivery_handoff_consumptions WHERE handoff_id=handoff.id) consumptions
        FROM public.enterprise_delivery_handoffs handoff WHERE id=$1`,[deliveryHandoffId])).rows[0];
      assert.deepEqual(unchanged,{status:'approved',current_version:'3',consumptions:0});
    }

    const ownerBeforeConsumeResponse=await queryProjection(setup.actors.deliveryOwner);
    assert.equal(ownerBeforeConsumeResponse.status,200);
    const ownerBeforeConsume=(await ownerBeforeConsumeResponse.json()).projection;
    const ownerHandoff=[...ownerBeforeConsume.deliveryWorkspace.inbox,...ownerBeforeConsume.deliveryWorkspace.outbox]
      .find(item=>item.id===deliveryHandoffId);
    assert.deepEqual(ownerHandoff?.actions,['delivery.handoff.consume']);
    const consumedDelivery=await executeDeliveryCommand(fixture,setup.actors.deliveryOwner,
      'delivery.handoff.consume',{handoffId:deliveryHandoffId,expectedHandoffVersion:3},
      'canonical-four-person-consume');
    assert.equal(consumedDelivery.status,200);
    assert.equal(consumedDelivery.body.outcome,'committed');
    const consumption=(await fixture.db.query(`SELECT consumed_by,work_package_id
      FROM public.enterprise_delivery_handoff_consumptions WHERE handoff_id=$1`,[deliveryHandoffId])).rows[0];
    assert.equal(consumption.consumed_by,setup.actors.deliveryOwner.user.id);
    assert.equal(consumption.work_package_id,consumedDelivery.body.resourceId);

    const ownerPackageResponse=await queryProjection(setup.actors.deliveryOwner);
    assert.equal(ownerPackageResponse.status,200);
    const ownerPackageProjection=(await ownerPackageResponse.json()).projection;
    const ownerPackage=ownerPackageProjection.deliveryWorkspace.packages
      .find(item=>item.id===consumedDelivery.body.resourceId);
    assert.ok(ownerPackage);
    const ownerItem=ownerPackage.items[0];
    assert.ok(ownerItem);
    const itemType={epic:'Epic',story:'Story',task:'Task',milestone:'Milestone',dependency:'Dependency',risk:'Risk'}[ownerItem.type];
    const editedDeliveryItem=await executeDeliveryCommand(fixture,setup.actors.deliveryOwner,
      'delivery.item.review',{itemAggregateId:ownerItem.aggregateId,
        expectedAggregateVersion:ownerItem.aggregateVersion,expectedItemVersionId:ownerItem.currentVersionId,
        outcome:'edited',rationale:'Delivery owner clarified the AP exception implementation step.',
        item:{itemType,title:`${ownerItem.title} clarified`,description:ownerItem.description,
          acceptanceCriteria:ownerItem.acceptanceCriteria,
          nonFunctionalRequirements:ownerItem.nonFunctionalRequirements}},
      'canonical-four-person-edit');
    assert.equal(editedDeliveryItem.status,200);
    assert.equal(editedDeliveryItem.body.outcome,'committed');
    const editedItemState=(await fixture.db.query(`SELECT version.status,version.created_by
      FROM public.enterprise_delivery_work_item_aggregates aggregate
      JOIN public.enterprise_delivery_work_item_versions version ON version.id=aggregate.current_version_id
      WHERE aggregate.id=$1`,[ownerItem.aggregateId])).rows[0];
    assert.deepEqual(editedItemState,{status:'edited',created_by:setup.actors.deliveryOwner.user.id});

    const outsider = await queryProjection(setup.actors.outsider);
    assert.equal(outsider.status, 403);

    const logout = await fetch(`${fixture.baseUrl}/auth/v1/logout`, {
      method: 'POST', headers: { authorization: `Bearer ${setup.actors.author.token}` },
    });
    assert.equal(logout.status, 204);
    assert.equal((await queryProjection(setup.actors.author)).status,401);
    const restoredToken = await fetch(`${fixture.baseUrl}/auth/v1/token?grant_type=password`, {
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({email:setup.actors.author.user.email,password:setup.actors.author.password}),
    });
    assert.equal(restoredToken.status,200);
    const restoredProjectionResponse = await queryProjection(setup.actors.author);
    assert.equal(restoredProjectionResponse.status,200);
    const restoredProjection = (await restoredProjectionResponse.json()).projection;
    assert.equal(restoredProjection.deliveryWorkspace.packages.some(item=>item.id===committed.resourceId),true);
  } finally {
    assert.equal(await fixture.close(), true);
  }
});
