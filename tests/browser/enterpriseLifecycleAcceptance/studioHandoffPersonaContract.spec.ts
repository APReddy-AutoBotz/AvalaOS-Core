import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type BrowserContext, type Page, type Request, type Route } from '@playwright/test';
import {
  authenticatedLifecycleAttestEverySubmittedEvidence as attestEverySubmittedEvidence,
  authenticatedLifecycleClickProduct as clickProduct,
  authenticatedLifecycleCompleteRequiredAssessmentFacts as completeRequiredAssessmentFacts,
  authenticatedLifecycleControl as control,
  authenticatedLifecycleEnterAs as enterAs,
  authenticatedLifecycleEnterStudioAs as enterStudioAs,
  authenticatedLifecycleFinalizeDecisionPack as finalizeDecisionPack,
  authenticatedLifecycleOpenConnectedProcess as openConnectedProcess,
  authenticatedLifecycleOpenPersistedStudioHandoffDecision as openPersistedStudioHandoffDecision,
  authenticatedLifecycleCommitEligibleStudioHandoffRequest as commitEligibleStudioHandoffRequest,
  authenticatedLifecycleCommitPersistedStudioHandoffAction as commitPersistedStudioHandoffAction,
  authenticatedLifecycleResolveEveryGovernControl as resolveEveryGovernControl,
  authenticatedLifecycleSelectReviewer as selectReviewer,
  authenticatedLifecyclePersistedHandoffTargetFromResponse as persistedHandoffTargetFromResponse,
  createAuthenticatedLifecycleWorkQueue,
  type AuthenticatedLifecycleActor,
  type AuthenticatedLifecycleSetup,
} from '../authenticatedLifecycleHarness';
import {
  authenticatedLifecycleSettleActorNavigationBoundary as settleActorNavigationBoundary,
  installAuthenticatedHostedNetwork,
} from '../authenticatedHostedNetwork';
import { primeV2FullPrefixFixtureSession } from '../../../scripts/v2FullPrefixReproduction.mjs';

const outputDirectory = process.env.STUDIO_HANDOFF_PERSONA_RESULT_DIRECTORY;
const observerBaseUrl=process.env.STUDIO_HANDOFF_PERSONA_OBSERVER_BASE_URL;
const observerToken=process.env.STUDIO_HANDOFF_PERSONA_OBSERVER_TOKEN;
if (!outputDirectory||!observerBaseUrl||!observerToken) throw new Error('STUDIO_HANDOFF_PERSONA_ENV_REQUIRED');
const digest = (value: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

type LifecycleFrame = Readonly<{
  handoffs: number;
  sourcePackages: number;
}>;
type DirectAuthorDenial = Readonly<{
  denied: boolean;
  status: number;
  errorCode: string;
  zeroEffects: boolean;
  projectionReadRefused: boolean;
}>;
type HandoffAuthorityFrame=Readonly<{handoffCount:number;approvalReadyCount:number;approvedCount:number;
  approvals:number;approvalReceipts:number;approvalAudits:number;sourcePackages:number}>;

const handoffAuthorityFrame=async(processLabel:string):Promise<HandoffAuthorityFrame>=>{
  const response=await fetch(`${observerBaseUrl}/frame`,{method:'POST',headers:{'content-type':'application/json','x-local-proof-token':observerToken},body:JSON.stringify({processLabel}),signal:AbortSignal.timeout(15_000)});
  if(!response.ok)throw new Error('STUDIO_HANDOFF_PERSONA_OBSERVER_REJECTED');
  return response.json() as Promise<HandoffAuthorityFrame>;
};

const observe = async (page: Page, route: string, action: () => Promise<unknown>) => {
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === route, { timeout: 15_000 });
  const [response, actionResult] = await Promise.allSettled([responsePromise, action()]);
  if (actionResult.status === 'rejected') throw actionResult.reason;
  if (response.status === 'rejected') throw response.reason;
  return response.value;
};

const installLocalNetworkBoundary = async (context: BrowserContext) => {
  const queue = createAuthenticatedLifecycleWorkQueue();
  const allowedOrigins = new Set([
    process.env.ENTERPRISE_LIFECYCLE_APP_BASE_URL,
    process.env.ENTERPRISE_LIFECYCLE_API_BASE_URL,
  ].filter((value): value is string => Boolean(value)).map(value => new URL(value).origin));
  const lifecycle = await installAuthenticatedHostedNetwork({
    context,
    hosted: false,
    allowedOrigins,
    tracker: null,
    queueNetworkAction: (operation, ownedWork) => queue.enqueue(operation, ownedWork),
    onExternalRequest: () => undefined,
    onHttpRequest: () => undefined,
    onTrackerError: error => queue.enqueue(async () => { throw error; }),
  });
  return async () => settleActorNavigationBoundary({
    settleActionAdmissions: lifecycle.settleActionAdmissions,
    settleResponseBodies: lifecycle.settleResponseBodies,
    drainNetworkActions: queue.drain,
    activeActionCount: () => 0,
  });
};

const enterProcess = async (
  page: Page,
  actor: AuthenticatedLifecycleActor,
  processLabel: string,
  settleBoundary: () => Promise<void>,
) => {
  await enterAs(page, actor, settleBoundary);
  if (!(await page.getByRole('heading', { name: 'Process Catalog', exact: true }).isVisible().catch(() => false))) {
    await clickProduct(page, 'Assess');
  }
  return openConnectedProcess(page, processLabel);
};

test('exact Studio handoff personas preserve three-party authority in production UI', async ({ context, page }, testInfo) => {
  const projectSlug = testInfo.project.name.replaceAll(/[^a-z0-9-]/giu, '-').toLowerCase();
  const outputPath = path.join(outputDirectory, `browser-${projectSlug}.json`);
  const scenario=process.env.STUDIO_HANDOFF_PERSONA_SCENARIO;
  if(scenario!=='artifact-unavailable'&&scenario!=='two-card-targeting'&&scenario!=='held-null-control')throw new Error('STUDIO_HANDOFF_PERSONA_SCENARIO_REQUIRED');
  const isolationPath=path.join(outputDirectory,`artifact-isolation-${projectSlug}.json`);
  const checkpointPath=path.join(outputDirectory,`checkpoint-${projectSlug}.json`);
  const checkpoint=async(phase:string,counts?:Readonly<{approvals:number;receipts:number;audits:number;sourcePackages:number}>)=>
    writeFile(checkpointPath,`${JSON.stringify({schemaVersion:'studio-handoff-persona-checkpoint-v1',project:projectSlug,phase,...(counts?{counts}: {})})}\n`,'utf8');
  await checkpoint('started');
  const setup = await control<AuthenticatedLifecycleSetup>('/control/setup', {
    projectName: `studio-handoff-persona-${projectSlug}-${scenario}`,
  });
  const faultSetup=setup;
  await checkpoint('setup');
  const settleBoundary = await installLocalNetworkBoundary(context);
  await checkpoint('network-installed');
  const fixtureSessionPrimed = await primeV2FullPrefixFixtureSession(
    page,
    setup.actors.author,
    process.env.ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY ?? 'sb-127-auth-token',
  );
  await checkpoint('fixture-session-primed');

  const prepareApprovalReady = async (
    target: AuthenticatedLifecycleSetup,
    prefix: 'fault'|'control'|'target-a'|'target-b',
  ) => {
    await enterProcess(page, target.actors.author, target.aliases.process, settleBoundary);
    await checkpoint(`${prefix}-author-entered`);
    expect((await observe(page, '/functions/v1/assess-v2-command', () =>
      page.getByRole('button', { name: 'New assessment (V2)', exact: true }).click())).status()).toBe(200);
    await page.getByRole('button', { name: 'Add minimum working structure', exact: true }).click();
    await completeRequiredAssessmentFacts(page, 'hitl');
    expect((await observe(page, '/functions/v1/assess-v2-command', () =>
      page.getByRole('button', { name: 'Save V2 draft', exact: true }).click())).status()).toBe(200);
    expect((await observe(page, '/functions/v1/assess-v2-command', () => finalizeDecisionPack(page))).status()).toBe(200);
    await checkpoint(`${prefix}-decision-finalized`);

    await enterProcess(page, target.actors.reviewer, target.aliases.process, settleBoundary);
    let reviewWorkspace = page.getByTestId('assess-v2-review-workspace');
    await selectReviewer(page, target.actors.reviewer);
    expect((await observe(page, '/functions/v1/assess-v2-command', () =>
      reviewWorkspace.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click())).status()).toBe(200);
    await expect(page.getByText(/Reviewer assignment committed\./u)).toBeVisible();
    expect(await attestEverySubmittedEvidence(page, 'Exact evidence independently verified.')).toBeGreaterThan(0);
    await reviewWorkspace.getByLabel('Review rationale', { exact: true }).fill('Exact decision independently approved.');
    expect((await observe(page, '/functions/v1/assess-v2-command', () =>
      reviewWorkspace.getByRole('button', { name: 'Approve reviewed decision', exact: true }).click())).status()).toBe(200);
    await checkpoint(`${prefix}-review-approved`);

    await enterProcess(page, target.actors.approver, target.aliases.process, settleBoundary);
    reviewWorkspace = page.getByTestId('assess-v2-review-workspace');
    expect(await resolveEveryGovernControl(page)).toBeGreaterThan(0);
    await reviewWorkspace.getByLabel('Govern rationale', { exact: true }).fill('Independent resolver confirmed every required control.');
    expect((await observe(page, '/functions/v1/assess-v2-command', () =>
      reviewWorkspace.getByRole('button', { name: 'Resolve Govern controls', exact: true }).click())).status()).toBe(200);
    expect((await observe(page, '/functions/v1/assess-v2-command', () =>
      reviewWorkspace.getByRole('button', { name: 'Create durable Studio handoff', exact: true }).click())).status()).toBe(200);
    await checkpoint(`${prefix}-assess-handoff-ready`);

    await enterStudioAs(page, target.actors.author, settleBoundary);
    const requestResponse=await commitEligibleStudioHandoffRequest(page);
    expect(requestResponse.status()).toBe(201);
    const requestedTarget=await persistedHandoffTargetFromResponse(requestResponse,'requested');
    await enterStudioAs(page, target.actors.reviewer, settleBoundary);
    const reviewResponse=await commitPersistedStudioHandoffAction(
      page,requestedTarget,'Approve review','Independent Studio handoff review approved.');
    expect(reviewResponse.status()).toBe(201);
    const reviewedTarget=await persistedHandoffTargetFromResponse(reviewResponse,'approval_ready',requestedTarget);
    await checkpoint(`${prefix}-studio-review-approved`);
    return{requestResponse,reviewResponse,requestedTarget,reviewedTarget};
  };

  if(scenario==='two-card-targeting'){
    const firstPrepared=await prepareApprovalReady(setup,'target-a');
    const competingSetup=await control<AuthenticatedLifecycleSetup>('/control/setup',{
      projectName:`studio-handoff-persona-${projectSlug}-target-b`,
    });
    const secondPrepared=await prepareApprovalReady(competingSetup,'target-b');
    const commandPath='/functions/v1/studio-artifact-command';
    let commandRequests=0;
    const countCommand=(request:Request)=>{if(request.method()==='POST'&&new URL(request.url()).pathname===commandPath)commandRequests+=1;};
    page.on('request',countCommand);
    const firstBefore=await handoffAuthorityFrame(setup.aliases.process);
    const secondBefore=await handoffAuthorityFrame(competingSetup.aliases.process);
    expect(firstBefore).toEqual({handoffCount:1,approvalReadyCount:1,approvedCount:0,
      approvals:0,approvalReceipts:0,approvalAudits:0,sourcePackages:0});
    expect(secondBefore).toEqual(firstBefore);
    await enterStudioAs(page,competingSetup.actors.approver,settleBoundary);
    const center=page.getByRole('region',{name:'Assess → Studio handoffs',exact:true});
    const finalAccept=center.getByRole('button',{name:'Final accept',exact:true});
    await expect(finalAccept).toHaveCount(2);
    const firstCard=center.locator(
      `li[data-handoff-id="${firstPrepared.reviewedTarget.handoffId}"][data-handoff-version="${firstPrepared.reviewedTarget.handoffVersion}"]`,
    );
    const secondCard=center.locator(
      `li[data-handoff-id="${secondPrepared.reviewedTarget.handoffId}"][data-handoff-version="${secondPrepared.reviewedTarget.handoffVersion}"]`,
    );
    await expect(firstCard).toHaveCount(1);
    await expect(secondCard).toHaveCount(1);
    const readyCards={count:await finalAccept.count(),distinct:
      firstPrepared.reviewedTarget.handoffId!==secondPrepared.reviewedTarget.handoffId
        || firstPrepared.reviewedTarget.handoffVersion!==secondPrepared.reviewedTarget.handoffVersion};
    expect(readyCards).toEqual({count:2,distinct:true});

    const zeroEffectNegative=async(
      target:Readonly<{handoffId:string;handoffVersion:number}>,
      action:'Approve review'|'Final accept',
      mailbox:'Inbox'|'Outbox',
    )=>{
      const commandsBefore=commandRequests;
      const framesBefore=[await handoffAuthorityFrame(setup.aliases.process),await handoffAuthorityFrame(competingSetup.aliases.process)];
      await expect(openPersistedStudioHandoffDecision(
        page,target,action,'This target must fail before dispatch.',mailbox)).rejects.toThrow();
      const framesAfter=[await handoffAuthorityFrame(setup.aliases.process),await handoffAuthorityFrame(competingSetup.aliases.process)];
      return{zeroCommands:commandRequests===commandsBefore,zeroEffects:JSON.stringify(framesAfter)===JSON.stringify(framesBefore)};
    };
    const missingTarget=await zeroEffectNegative(
      {handoffId:'ffffffff-ffff-4fff-8fff-ffffffffffff',handoffVersion:1},'Final accept','Inbox');
    const staleVersion=await zeroEffectNegative(
      {...secondPrepared.reviewedTarget,handoffVersion:secondPrepared.reviewedTarget.handoffVersion-1},'Final accept','Inbox');
    const wrongMailbox=await zeroEffectNegative(secondPrepared.reviewedTarget,'Final accept','Outbox');
    expect({missingTarget,staleVersion,wrongMailbox}).toEqual({
      missingTarget:{zeroCommands:true,zeroEffects:true},
      staleVersion:{zeroCommands:true,zeroEffects:true},
      wrongMailbox:{zeroCommands:true,zeroEffects:true},
    });

    const finalCommandsBefore=commandRequests;
    const finalStarted=Date.now();
    const finalResponse=await commitPersistedStudioHandoffAction(
      page,secondPrepared.reviewedTarget,'Final accept','The exact retained target is independently accepted.');
    const finalElapsedMs=Date.now()-finalStarted;
    expect(finalResponse.status()).toBe(201);
    expect(finalElapsedMs).toBeLessThan(15_000);
    const acceptedTarget=await persistedHandoffTargetFromResponse(
      finalResponse,'approved',secondPrepared.reviewedTarget);
    await finalResponse.finished();
    const firstAfterFinal=await handoffAuthorityFrame(setup.aliases.process);
    const secondAfterFinal=await handoffAuthorityFrame(competingSetup.aliases.process);
    const effects={approvals:secondAfterFinal.approvals-secondBefore.approvals,
      receipts:secondAfterFinal.approvalReceipts-secondBefore.approvalReceipts,
      audits:secondAfterFinal.approvalAudits-secondBefore.approvalAudits,
      sourcePackages:secondAfterFinal.sourcePackages-secondBefore.sourcePackages};
    expect(commandRequests-finalCommandsBefore).toBe(1);
    expect(effects).toEqual({approvals:1,receipts:1,audits:1,sourcePackages:0});
    expect(firstAfterFinal).toEqual(firstBefore);
    await expect(firstCard).toHaveCount(1);
    await expect(firstCard.getByText('approval ready',{exact:true})).toBeVisible();
    const competing={sameIdentity:await firstCard.getAttribute('data-handoff-id')===firstPrepared.reviewedTarget.handoffId,
      sameVersion:await firstCard.getAttribute('data-handoff-version')===String(firstPrepared.reviewedTarget.handoffVersion),
      sameState:firstAfterFinal.approvalReadyCount===1,zeroEffects:JSON.stringify(firstAfterFinal)===JSON.stringify(firstBefore)};
    expect(competing).toEqual({sameIdentity:true,sameVersion:true,sameState:true,zeroEffects:true});

    const ineligibleState=await zeroEffectNegative(acceptedTarget,'Approve review','Inbox');
    expect(ineligibleState).toEqual({zeroCommands:true,zeroEffects:true});
    const sourcePackagesBeforeConsume=secondAfterFinal.sourcePackages;
    const consumeResponse=await commitPersistedStudioHandoffAction(
      page,acceptedTarget,'Start Studio draft',undefined,'Inbox');
    expect(consumeResponse.status()).toBe(201);
    const consumedTarget=await persistedHandoffTargetFromResponse(consumeResponse,'consumed',acceptedTarget);
    await consumeResponse.finished();
    const secondAfterConsume=await handoffAuthorityFrame(competingSetup.aliases.process);
    const firstAfterConsume=await handoffAuthorityFrame(setup.aliases.process);
    expect(firstAfterConsume).toEqual(firstBefore);
    await expect(firstCard).toHaveCount(1);
    await expect(firstCard.getByText('approval ready',{exact:true})).toBeVisible();
    competing.zeroEffects=competing.zeroEffects&&JSON.stringify(firstAfterConsume)===JSON.stringify(firstBefore);
    const sourcePackageDelta=secondAfterConsume.sourcePackages-sourcePackagesBeforeConsume;
    expect(sourcePackageDelta).toBe(1);
    const targeting={
      readyCards,
      request:{status:secondPrepared.requestResponse.status(),targetValid:
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(secondPrepared.requestedTarget.handoffId)
          && Number.isSafeInteger(secondPrepared.requestedTarget.handoffVersion)&&secondPrepared.requestedTarget.handoffVersion>0},
      review:{status:secondPrepared.reviewResponse.status(),targetBound:true,monotonic:
        secondPrepared.reviewedTarget.handoffId===secondPrepared.requestedTarget.handoffId
          && secondPrepared.reviewedTarget.handoffVersion===secondPrepared.requestedTarget.handoffVersion+1},
      finalAccept:{status:finalResponse.status(),targetBound:
        acceptedTarget.handoffId===secondPrepared.reviewedTarget.handoffId,transitionCount:secondAfterFinal.approvedCount-secondBefore.approvedCount,
        elapsedMs:finalElapsedMs,effects},
      competing,
      consume:{status:consumeResponse.status(),targetBound:consumedTarget.handoffId===acceptedTarget.handoffId
        && consumedTarget.handoffVersion===acceptedTarget.handoffVersion+1,sourcePackageDelta},
      negativeCases:{missingTarget,staleVersion,wrongMailbox,ineligibleState},
    };
    await writeFile(path.join(outputDirectory,`targeting-${projectSlug}.json`),`${JSON.stringify(targeting)}\n`);
    page.off('request',countCommand);
    await rm(checkpointPath,{force:true});
    return;
  }

  if(scenario==='artifact-unavailable'){
  const faultPrepared=await prepareApprovalReady(faultSetup,'fault');
  let artifactFaultRequests=0;
  let artifactFaultActualStatus=0;
  let artifactFaultActualNull=false;
  let artifactFaultApproverBound=false;
  const artifactFaultHandler=async(route:Route,request:Request)=>{
    if(request.method()!=='POST'||artifactFaultRequests>0)return route.continue();
    artifactFaultRequests+=1;
    artifactFaultApproverBound=request.headers().authorization===`Bearer ${faultSetup.actors.approver.token}`;
    const actual=await route.fetch({timeout:15_000});
    const body=await actual.body();
    artifactFaultActualStatus=actual.status();
    try{artifactFaultActualNull=JSON.parse(body.toString('utf8'))===null;}catch{artifactFaultActualNull=false;}
    await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'COMMAND_UNAVAILABLE'})});
  };
  await page.route('**/rest/v1/rpc/studio_artifact_projection',artifactFaultHandler);
  await checkpoint('fault-route-armed');
  let artifactFaultFinalAcceptStatus=0;
  let artifactFaultFinalAcceptElapsedMs=0;
  let artifactFaultState='unknown';
  let artifactFaultHandoffPhase='unknown';
  let artifactFaultFinalAcceptUnique=false;
  let artifactFaultFinalAcceptEnabled=false;
  let artifactFaultMutationBlocked=false;
  let artifactFaultEffects={approvals:0,receipts:0,audits:0,sourcePackages:0};
  try{
    const faultBefore=await handoffAuthorityFrame(faultSetup.aliases.process);
    expect(faultBefore).toEqual({handoffCount:1,approvalReadyCount:1,approvedCount:0,
      approvals:0,approvalReceipts:0,approvalAudits:0,sourcePackages:0});
    await checkpoint('fault-frame-before');
    await enterStudioAs(page, faultSetup.actors.approver, settleBoundary);
    await checkpoint('fault-approver-entered');
    await expect.poll(()=>artifactFaultRequests,{timeout:15_000}).toBe(1);
    await checkpoint('fault-request-observed');
    await expect.poll(()=>({artifactFaultRequests,artifactFaultActualStatus,artifactFaultActualNull,artifactFaultApproverBound}),{timeout:15_000}).toEqual({
      artifactFaultRequests:1,artifactFaultActualStatus:200,artifactFaultActualNull:true,artifactFaultApproverBound:true});
    await checkpoint('fault-actual-verified');
    const studioWorkspace=page.getByTestId('studio-artifact-workspace');
    await expect(studioWorkspace).toHaveAttribute('data-studio-handoff-phase','ready');
    await checkpoint('fault-handoff-ready');
    await expect(studioWorkspace).toHaveAttribute('data-studio-projection-state','workspace-ready');
    await checkpoint('fault-workspace-ready');
    await expect(studioWorkspace).toHaveAttribute('data-studio-artifact-state','artifact_unavailable');
    await checkpoint('fault-artifact-unavailable');
    await expect(studioWorkspace).toHaveAttribute('data-studio-artifact-mutations','blocked');
    await checkpoint('fault-artifact-mutations-blocked');
    await expect(page.getByText('Artifact details are temporarily unavailable. Reload to edit this artifact. Available handoff actions can still be completed.',{exact:true})).toBeVisible();
    await checkpoint('fault-message-visible');
    const center=page.getByRole('region',{name:'Assess → Studio handoffs',exact:true});
    const finalAccept=center.getByRole('button',{name:'Final accept',exact:true});
    await expect(finalAccept).toHaveCount(1);
    await checkpoint('fault-final-accept-unique');
    await expect(finalAccept).toBeVisible();
    await checkpoint('fault-final-accept-visible');
    await expect(finalAccept).toBeEnabled();
    await checkpoint('fault-final-accept-enabled');
    const artifactMutation=page.getByRole('button',{name:'Generate legacy accepted-handoff draft',exact:true});
    await expect(artifactMutation).toBeDisabled();
    await checkpoint('fault-artifact-control-blocked');
    artifactFaultState=await studioWorkspace.getAttribute('data-studio-artifact-state')??'unknown';
    artifactFaultHandoffPhase=await studioWorkspace.getAttribute('data-studio-handoff-phase')??'unknown';
    artifactFaultFinalAcceptUnique=await finalAccept.count()===1;
    artifactFaultFinalAcceptEnabled=await finalAccept.isEnabled();
    artifactFaultMutationBlocked=await studioWorkspace.getAttribute('data-studio-artifact-mutations')==='blocked'
      && await artifactMutation.isDisabled();
    const startedAt=Date.now();
    const response=await commitPersistedStudioHandoffAction(
      page,faultPrepared.reviewedTarget,'Final accept','Artifact detail failure must not revoke independent handoff authority.');
    artifactFaultFinalAcceptElapsedMs=Date.now()-startedAt;
    artifactFaultFinalAcceptStatus=response.status();
    expect(artifactFaultFinalAcceptStatus).toBe(201);
    expect(artifactFaultFinalAcceptElapsedMs).toBeLessThan(15_000);
    await persistedHandoffTargetFromResponse(response,'approved',faultPrepared.reviewedTarget);
    await response.finished();
    const faultAfter=await handoffAuthorityFrame(faultSetup.aliases.process);
    artifactFaultEffects={approvals:faultAfter.approvals-faultBefore.approvals,
      receipts:faultAfter.approvalReceipts-faultBefore.approvalReceipts,
      audits:faultAfter.approvalAudits-faultBefore.approvalAudits,
      sourcePackages:faultAfter.sourcePackages-faultBefore.sourcePackages};
    expect(artifactFaultEffects).toEqual({approvals:1,receipts:1,audits:1,sourcePackages:0});
    expect(artifactFaultRequests).toBe(1);
  }finally{
    await page.unroute('**/rest/v1/rpc/studio_artifact_projection',artifactFaultHandler);
  }
  await writeFile(isolationPath,JSON.stringify({schemaVersion:'studio-artifact-read-isolation-browser-v1',project:projectSlug,
    actorLimitMs:15_000,providersEnabled:false,
    artifactReadIsolation:{projectionRoute:'studio_artifact_projection',injectedStatus:503,requestCount:artifactFaultRequests,
      actualStatus:artifactFaultActualStatus,legitimateNull:artifactFaultActualNull,exactApproverActor:artifactFaultApproverBound,
      artifactState:artifactFaultState,handoffPhase:artifactFaultHandoffPhase,finalAcceptUnique:artifactFaultFinalAcceptUnique,
      finalAcceptEnabled:artifactFaultFinalAcceptEnabled,artifactMutationBlocked:artifactFaultMutationBlocked,
      finalAcceptStatus:artifactFaultFinalAcceptStatus,finalAcceptElapsedMs:artifactFaultFinalAcceptElapsedMs,effects:artifactFaultEffects}})+'\n');
  await rm(checkpointPath,{force:true});
  return;
  }

  const prepared=await prepareApprovalReady(setup,'control');
  await checkpoint('assess-handoff-ready');

  const before = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName: setup.projectName });
  expect(before.sourcePackages).toBe(0);

  const requestResponse = prepared.requestResponse;
  await checkpoint('author-request');

  const reviewResponse = prepared.reviewResponse;
  await checkpoint('reviewer-review');

  const directDenial = await control<DirectAuthorDenial>('/control/studio-final-accept-direct-denial', {
    projectName: setup.projectName,
  });
  expect(directDenial).toEqual({
    denied: true,
    status: 403,
    errorCode: 'PERMISSION_DENIED',
    zeroEffects: true,
    projectionReadRefused: false,
  });

  let releaseProjection=()=>{};
  const projectionRelease=new Promise<void>(resolve=>{releaseProjection=resolve;});
  let projectionReadyResolve=()=>{};
  const projectionReady=new Promise<void>(resolve=>{projectionReadyResolve=resolve;});
  let projectionRequests=0;
  let heldProjectionFetched=false;
  let heldProjectionNull=false;
  let heldProjectionApproverBound=false;
  const projectionHandler=async(route:Route,request:Request)=>{
    if(request.method()!=='POST')return route.continue();
    projectionRequests+=1;
    if(projectionRequests!==1)return route.continue();
    heldProjectionApproverBound=request.headers().authorization===`Bearer ${setup.actors.approver.token}`;
    const actual=await route.fetch();
    const body=await actual.body();
    heldProjectionFetched=actual.status()===200;
    try{heldProjectionNull=JSON.parse(body.toString('utf8'))===null;}catch{heldProjectionNull=false;}
    projectionReadyResolve();
    await projectionRelease;
    await route.fulfill({status:actual.status(),headers:actual.headers(),body});
  };
  await page.route('**/rest/v1/rpc/studio_artifact_projection',projectionHandler);
  await checkpoint('projection-armed');
  let acceptanceResponseStatus=0;
  let finalAcceptElapsedMs=0;
  let readinessBeforeCommit='unknown';
  let staleProjectionDidNotOverwrite=false;
  let controlHandoffId=prepared.reviewedTarget.handoffId;
  let acceptedTarget=prepared.reviewedTarget;
  let approvalEffects={approvals:0,receipts:0,audits:0,sourcePackages:0};
  try{
    await enterStudioAs(page, setup.actors.approver, settleBoundary);
    await checkpoint('approver-entered');
    await expect.poll(()=>projectionRequests,{timeout:15_000}).toBe(1);
    await projectionReady;
    await checkpoint('projection-captured');
    expect({heldProjectionFetched,heldProjectionNull,heldProjectionApproverBound,projectionRequests}).toEqual({
      heldProjectionFetched:true,heldProjectionNull:true,heldProjectionApproverBound:true,projectionRequests:1});
    const studioWorkspace=page.getByTestId('studio-artifact-workspace');
    const center=page.getByRole('region',{name:'Assess → Studio handoffs',exact:true});
    const finalAccept=center.getByRole('button',{name:'Final accept',exact:true});
    await expect(finalAccept).toHaveCount(1);
    await expect(finalAccept).toBeVisible();
    await expect(finalAccept).toBeEnabled();
    const controlCardBefore=finalAccept.locator('xpath=ancestor::li');
    await expect(controlCardBefore).toHaveCount(1);
    expect(await controlCardBefore.getAttribute('data-handoff-id')).toBe(controlHandoffId);
    expect(await controlCardBefore.getAttribute('data-handoff-version')).toBe(String(prepared.reviewedTarget.handoffVersion));
    await checkpoint('final-accept-enabled');
    readinessBeforeCommit=await studioWorkspace.getAttribute('data-studio-handoff-phase')??'unknown';
    expect(readinessBeforeCommit).toBe('ready');
    expect(await studioWorkspace.getAttribute('data-studio-usable')).toBe('false');
    const approvalBefore=await handoffAuthorityFrame(setup.aliases.process);
    expect(approvalBefore).toEqual({handoffCount:1,approvalReadyCount:1,approvedCount:0,
      approvals:0,approvalReceipts:0,approvalAudits:0,sourcePackages:0});
    const startedAt=Date.now();
    const acceptanceResponse = await test.step('local:studio-handoff:approver-final-accept', () =>
      commitPersistedStudioHandoffAction(
        page,prepared.reviewedTarget,'Final accept','Independent Studio handoff approval accepted.'));
    finalAcceptElapsedMs=Date.now()-startedAt;
    acceptanceResponseStatus=acceptanceResponse.status();
    expect(acceptanceResponseStatus).toBe(201);
    expect(finalAcceptElapsedMs).toBeLessThan(15_000);
    acceptedTarget=await persistedHandoffTargetFromResponse(acceptanceResponse,'approved',prepared.reviewedTarget);
    await acceptanceResponse.finished();
    await checkpoint('final-accept-committed');
    let approvalAfter:HandoffAuthorityFrame;
    try{approvalAfter=await handoffAuthorityFrame(setup.aliases.process);}
    catch(error){await checkpoint('approval-observer-failed');throw error;}
    approvalEffects={approvals:approvalAfter.approvals-approvalBefore.approvals,
      receipts:approvalAfter.approvalReceipts-approvalBefore.approvalReceipts,
      audits:approvalAfter.approvalAudits-approvalBefore.approvalAudits,
      sourcePackages:approvalAfter.sourcePackages-approvalBefore.sourcePackages};
    await checkpoint('approval-effects-observed',approvalEffects);
    expect(approvalEffects).toEqual({approvals:1,receipts:1,audits:1,sourcePackages:0});
    await checkpoint('approval-effects-verified');
    releaseProjection();
    await settleBoundary();
    await checkpoint('detail-settled');
    const controlCard=center.locator(
      `li[data-handoff-id="${controlHandoffId}"][data-handoff-version="${acceptedTarget.handoffVersion}"]`,
    );
    await expect(controlCard).toHaveCount(1);
    await expect(controlCard.getByText('approved',{exact:true})).toBeVisible();
    await checkpoint('approved-visible');
    await expect(finalAccept).toHaveCount(0);
    await checkpoint('final-accept-absent');
    await expect(controlCard.getByRole('button',{name:'Start Studio draft',exact:true})).toBeEnabled();
    await checkpoint('consume-enabled');
    staleProjectionDidNotOverwrite=await studioWorkspace.getAttribute('data-studio-handoff-phase')==='ready';
    expect(staleProjectionDidNotOverwrite).toBe(true);
    await checkpoint('detail-released');
  }finally{
    releaseProjection();
    await page.unroute('**/rest/v1/rpc/studio_artifact_projection',projectionHandler);
  }
  const consumeResponse = await test.step('local:studio-handoff:approver-consume-inbox', () =>
    commitPersistedStudioHandoffAction(page,acceptedTarget,'Start Studio draft',undefined,'Inbox'));
  expect(consumeResponse.status()).toBe(201);
  await persistedHandoffTargetFromResponse(consumeResponse,'consumed',acceptedTarget);
  await checkpoint('consume-committed');

  const after = await control<LifecycleFrame>('/control/lifecycle-frame', { projectName: setup.projectName });
  expect(after.sourcePackages).toBe(1);
  expect(after.sourcePackages - before.sourcePackages).toBe(1);
  const result = {
    schemaVersion: 'studio-handoff-persona-browser-v3',
    status: 'passed',
    project: projectSlug,
    mode: 'actual-chromium-production-ui-production-handlers-disposable-postgresql',
    fixtureSessionPrimed,
    actorSequence: ['author-request', 'reviewer-review', 'approver-final-accept', 'approver-consume-inbox'],
    responseStatuses: {
      request: requestResponse.status(),
      review: reviewResponse.status(),
      finalAccept: acceptanceResponseStatus,
      consume: consumeResponse.status(),
    },
    authorityBoundReadiness:{projectionRoute:'studio_artifact_projection',actualResponseFetched:heldProjectionFetched,
      legitimateNull:heldProjectionNull,exactApproverActor:heldProjectionApproverBound,requestCount:projectionRequests,
      phaseBeforeCommit:readinessBeforeCommit,finalAcceptElapsedMs,committedBeforeDetailRelease:true,
      staleDetailDidNotOverwrite:staleProjectionDidNotOverwrite,effects:approvalEffects},
    artifactReadIsolation:JSON.parse(await readFile(isolationPath,'utf8')).artifactReadIsolation,
    directAuthorApproval: directDenial,
    sourcePackages: { before: before.sourcePackages, after: after.sourcePackages, delta: after.sourcePackages - before.sourcePackages },
    proofDigest: digest({ actorSequence: ['author-request', 'reviewer-review', 'approver-final-accept', 'approver-consume-inbox'], sourcePackageDelta: 1 }),
    actorLimitMs: 15_000,
    providersEnabled: false,
    hostedRun: false,
    fullAcceptance: false,
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await rm(checkpointPath,{force:true});
});
