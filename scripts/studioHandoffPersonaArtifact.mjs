import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enterpriseLifecycleSourcePaths } from './enterpriseLifecyclePostgresFixture.mjs';
import { STUDIO_HANDOFF_TARGETING_CASES, STUDIO_HANDOFF_TARGETING_PROJECTS,
  validateStudioHandoffTargetingComponentProof } from './runStudioHandoffActionTargetingBrowser.mjs';

export const studioHandoffPersonaArtifactFiles=Object.freeze([
  'browser-desktop-chromium.json','browser-pixel-7-chromium.json','build-proof.json','result.json','source-bindings.json',
  'targeting-component-proof.json',
]);
export const studioHandoffPersonaSourcePaths=Object.freeze([...new Set([
  ...enterpriseLifecycleSourcePaths,
  'scripts/authenticatedHostedDiagnostics.mjs',
  'scripts/authenticatedHostedControllerAdapters.mjs',
  'scripts/authenticatedHostedPlaywrightReporter.mjs',
  'scripts/eligibleReviewerRequestDiagnostic.mjs',
  'scripts/playwright.studio-handoff-persona-contract.config.ts',
  'scripts/reproduceStudioHandoffPersonaContract.mjs',
  'scripts/runStudioHandoffActionTargetingBrowser.mjs',
  'scripts/runStudioHandoffActionTargetingBrowser.test.mjs',
  'scripts/studioHandoffActionTargeting.test.mjs',
  'scripts/studioHandoffPersonaArtifact.mjs',
  'playwright.studio-pr-b.config.ts',
  'tests/browser/authenticatedLifecycleHarness.ts',
  'tests/browser/enterpriseLifecycleAcceptance/assessmentScenarioJourneys.ts',
  'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts',
  'tests/browser/enterpriseLifecycleAcceptance/studioHandoffPersonaContract.spec.ts',
  'tests/browser/studioPrB/harness.tsx',
  'tests/browser/studioPrB/studioPrB.spec.ts',
  'components/docs/StudioHandoffCenter.tsx',
  'components/docs/StudioArtifactWorkspace.tsx',
  'components/docs/studioHandoffReadiness.ts',
  'components/docs/StudioArtifactWorkspace.test.ts',
  'components/docs/studioHandoffReadiness.test.ts',
  'services/studioArtifacts/client.ts',
  'supabase/functions/_shared/studioArtifactCommand.ts',
  'supabase/functions/_shared/studioArtifactHandler.ts',
  'supabase/migrations/20260828120000_governed_multisource_studio_pr_b.sql',
])].sort());
export const studioHandoffPersonaProjects=Object.freeze(['desktop-chromium','pixel-7-chromium']);
export const studioHandoffPersonaScenarios=Object.freeze(['artifact-unavailable','two-card-targeting','held-null-control']);
export const studioHandoffPersonaScenarioMatrix=Object.freeze(studioHandoffPersonaProjects.flatMap(project=>
  studioHandoffPersonaScenarios.map(scenario=>Object.freeze({project,scenario}))));
export const studioHandoffPersonaCleanupKeys=Object.freeze([
  'fixtureClosed','observerClosed','previewExited','buildRemoved','playwrightOutputRemoved','targetingComponentWorkRemoved',
]);
export const studioHandoffPersonaFailureStages=Object.freeze([
  'targeting-component-preparation','postgresql-fixture-preparation','production-build','local-preview','postgresql-browser','finalization',
]);
export const studioHandoffPersonaFailureCodes=Object.freeze([
  'STUDIO_HANDOFF_PERSONA_TARGETING_COMPONENT_FAILED','STUDIO_HANDOFF_PERSONA_TARGETING_COMPONENT_CLEANUP_FAILED',
  'STUDIO_HANDOFF_PERSONA_ROLE_PARITY_REJECTED','STUDIO_HANDOFF_PERSONA_ROLE_PARITY_CHANGED',
  'STUDIO_HANDOFF_PERSONA_BUILD_FAILED','STUDIO_HANDOFF_PERSONA_PREVIEW_NOT_READY','STUDIO_HANDOFF_PERSONA_RUNNER_FAILED',
]);

const sha256=value=>`sha256:${createHash('sha256').update(value).digest('hex')}`;
const fail=code=>{throw new Error(code);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value:fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
const exact=(value,keys)=>{const actual=Object.keys(object(value));if(actual.length!==keys.length||actual.some(key=>!keys.includes(key)))fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');return value;};
const boolean=value=>typeof value==='boolean'?value:fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max?value:fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
const text=value=>typeof value==='string'&&value.length>0&&value.length<=500?value:fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
const digest=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/u.test(value)?value:fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
const equal=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const studioHandoffPersonaComponentFailureFiles=Object.freeze([
  'failure.json','failure-diagnostic.json',
  ...STUDIO_HANDOFF_TARGETING_PROJECTS.flatMap(project=>STUDIO_HANDOFF_TARGETING_CASES.map(sample=>`${project}-${sample}.json`)),
].sort());
export const createStudioHandoffPersonaComponentFailureEvidence=({stage,failureCode,componentFailure,preservedFiles=[]})=>{
  if(stage!=='targeting-component-preparation'||!studioHandoffPersonaFailureCodes.includes(failureCode))fail('STUDIO_HANDOFF_PERSONA_COMPONENT_FAILURE_INVALID');
  if(!Array.isArray(preservedFiles)||preservedFiles.some((name,index)=>typeof name!=='string'
    ||!studioHandoffPersonaComponentFailureFiles.includes(name)||(index>0&&preservedFiles[index-1]>=name)))fail('STUDIO_HANDOFF_PERSONA_COMPONENT_FAILURE_INVALID');
  if(componentFailure!==null){
    exact(componentFailure,['schemaVersion','status','playwrightExitCode','signal','serverClosed','playwrightOutputRemoved','providersEnabled']);
    const exitValid=componentFailure.playwrightExitCode===null
      ||integer(componentFailure.playwrightExitCode,0,255)===componentFailure.playwrightExitCode;
    if(componentFailure.schemaVersion!=='studio-handoff-targeting-component-failure-v1'||componentFailure.status!=='failed'
      ||!exitValid||!['none','present'].includes(componentFailure.signal)||typeof componentFailure.serverClosed!=='boolean'
      ||typeof componentFailure.playwrightOutputRemoved!=='boolean'||componentFailure.providersEnabled!==false)fail('STUDIO_HANDOFF_PERSONA_COMPONENT_FAILURE_INVALID');
  }
  return {schemaVersion:'studio-handoff-persona-component-failure-v1',status:'failed',stage,failureCode,
    componentEvidenceStatus:componentFailure===null?'unavailable':'preserved',preservedFiles,componentFailure};
};
const requiredKeys={
  browser:['schemaVersion','status','project','mode','fixtureSessionPrimed','actorSequence','responseStatuses','directAuthorApproval','sourcePackages','authorityBoundReadiness','artifactReadIsolation','exactTargeting','proofDigest','actorLimitMs','providersEnabled','hostedRun','fullAcceptance'],
  result:['schemaVersion','status','releaseSha','exactRoles','exactRolesAfterRun','exactRolesStable','scenarioIsolation','source','build','browserExit','browsers','providers','cleanup','constraints'],
};
const validateRole=(value,count)=>{exact(value,['actualCount','requiredCount','requiredComplete','forbiddenAbsent','exact']);if(integer(value.actualCount)!==count||integer(value.requiredCount)!==count||boolean(value.requiredComplete)!==true||boolean(value.forbiddenAbsent)!==true||boolean(value.exact)!==true)fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');return value;};
const validateExactTargeting=(value,project,componentProof)=>{
  exact(value,['readyCards','request','review','finalAccept','competing','consume','singleCardControl','negativeCases']);
  exact(value.readyCards,['count','distinct']);
  if(value.readyCards.count!==2||value.readyCards.distinct!==true)fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  exact(value.request,['status','targetValid']);
  if(value.request.status!==201||value.request.targetValid!==true)fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  exact(value.review,['status','targetBound','monotonic']);
  if(value.review.status!==201||value.review.targetBound!==true||value.review.monotonic!==true)fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  exact(value.finalAccept,['status','targetBound','transitionCount','elapsedMs','effects']);
  if(value.finalAccept.status!==201||value.finalAccept.targetBound!==true
    ||value.finalAccept.transitionCount!==1
    ||integer(value.finalAccept.elapsedMs,0,14_999)!==value.finalAccept.elapsedMs)fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  exact(value.finalAccept.effects,['approvals','receipts','audits','sourcePackages']);
  if(!equal(value.finalAccept.effects,{approvals:1,receipts:1,audits:1,sourcePackages:0}))fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  exact(value.competing,['sameIdentity','sameVersion','sameState','zeroEffects']);
  if(Object.values(value.competing).some(item=>item!==true))fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  exact(value.consume,['status','targetBound','sourcePackageDelta']);
  if(value.consume.status!==201||value.consume.targetBound!==true||value.consume.sourcePackageDelta!==1)fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  exact(value.singleCardControl,['passed','elapsedMs']);
  if(value.singleCardControl.passed!==true
    ||integer(value.singleCardControl.elapsedMs,0,14_999)!==value.singleCardControl.elapsedMs)fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  exact(value.negativeCases,['missingTarget','staleVersion','wrongMailbox','ineligibleState','duplicateExactPair']);
  for(const key of ['missingTarget','staleVersion','wrongMailbox','ineligibleState']){
    const item=value.negativeCases[key];
    exact(item,['zeroCommands','zeroEffects']);
    if(item.zeroCommands!==true||item.zeroEffects!==true)fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  }
  exact(value.negativeCases.duplicateExactPair,['zeroCommands','zeroEffects','scope','proofDigest']);
  if(value.negativeCases.duplicateExactPair.zeroCommands!==true||value.negativeCases.duplicateExactPair.zeroEffects!==true
    ||value.negativeCases.duplicateExactPair.scope!=='component-fixture'
    ||digest(value.negativeCases.duplicateExactPair.proofDigest)!==componentProof.proofDigest)fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  const componentProject=project==='desktop-chromium'?'desktop-chrome':project==='pixel-7-chromium'?'pixel-7':null;
  const duplicateProof=componentProof.results.find(item=>item.project===componentProject&&item.case==='duplicate-exact-pair');
  if(!duplicateProof||duplicateProof.status!=='passed'||duplicateProof.matchedCardCount!==2
    ||duplicateProof.zeroCommands!==true||duplicateProof.zeroEffects!==true||duplicateProof.externalAttemptCount!==0)fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  return value;
};
const validateBrowser=(value,project,componentProof)=>{
  exact(value,requiredKeys.browser);
  if(value.schemaVersion!=='studio-handoff-persona-browser-v4'||value.status!=='passed'||value.project!==project
    ||value.mode!=='actual-chromium-production-ui-production-handlers-disposable-postgresql'||boolean(value.fixtureSessionPrimed)!==true)fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  const sequence=['author-request','reviewer-review','approver-final-accept','approver-consume-inbox'];
  if(!equal(value.actorSequence,sequence))fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  exact(value.responseStatuses,['request','review','finalAccept','consume']);
  if(Object.values(value.responseStatuses).some(status=>integer(status)!==201))fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  exact(value.directAuthorApproval,['denied','status','errorCode','zeroEffects','projectionReadRefused']);
  if(value.directAuthorApproval.denied!==true||value.directAuthorApproval.status!==403||value.directAuthorApproval.errorCode!=='PERMISSION_DENIED'
    ||value.directAuthorApproval.zeroEffects!==true||value.directAuthorApproval.projectionReadRefused!==false)fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  exact(value.sourcePackages,['before','after','delta']);
  if(value.sourcePackages.before!==0||value.sourcePackages.after!==1||value.sourcePackages.delta!==1)fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  const readiness=value.authorityBoundReadiness;
  exact(readiness,['projectionRoute','actualResponseFetched','legitimateNull','exactApproverActor','requestCount','phaseBeforeCommit','finalAcceptElapsedMs','committedBeforeDetailRelease','staleDetailDidNotOverwrite','effects']);
  if(readiness.projectionRoute!=='studio_artifact_projection'||readiness.actualResponseFetched!==true||readiness.legitimateNull!==true
    ||readiness.exactApproverActor!==true||readiness.requestCount!==1||readiness.phaseBeforeCommit!=='ready'
    ||integer(readiness.finalAcceptElapsedMs,0,14_999)!==readiness.finalAcceptElapsedMs||readiness.committedBeforeDetailRelease!==true
    ||readiness.staleDetailDidNotOverwrite!==true)fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  exact(readiness.effects,['approvals','receipts','audits','sourcePackages']);
  if(!equal(readiness.effects,{approvals:1,receipts:1,audits:1,sourcePackages:0}))fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  const isolation=value.artifactReadIsolation;
  exact(isolation,['projectionRoute','injectedStatus','requestCount','actualStatus','legitimateNull','exactApproverActor','artifactState','handoffPhase','finalAcceptUnique','finalAcceptEnabled','artifactMutationBlocked','finalAcceptStatus','finalAcceptElapsedMs','effects']);
  if(isolation.projectionRoute!=='studio_artifact_projection'||isolation.injectedStatus!==503||isolation.requestCount!==1
    ||isolation.actualStatus!==200||isolation.legitimateNull!==true||isolation.exactApproverActor!==true
    ||isolation.artifactState!=='artifact_unavailable'||isolation.handoffPhase!=='ready'||isolation.finalAcceptUnique!==true
    ||isolation.finalAcceptEnabled!==true||isolation.artifactMutationBlocked!==true||isolation.finalAcceptStatus!==201
    ||integer(isolation.finalAcceptElapsedMs,0,14_999)!==isolation.finalAcceptElapsedMs)fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  exact(isolation.effects,['approvals','receipts','audits','sourcePackages']);
  if(!equal(isolation.effects,{approvals:1,receipts:1,audits:1,sourcePackages:0}))fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  const exactTargeting=validateExactTargeting(value.exactTargeting,project,componentProof);
  if(digest(value.proofDigest)!==sha256(Buffer.from(JSON.stringify({actorSequence:sequence,sourcePackageDelta:1,exactTargeting}))))fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  if(value.actorLimitMs!==15_000||value.providersEnabled!==false||value.hostedRun!==false||value.fullAcceptance!==false)fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INVALID');
  return value;
};

export const verifyStudioHandoffPersonaArtifact=async({directory,expectedReleaseSha,readSourceBytes})=>{
  if(typeof directory!=='string'||!path.isAbsolute(directory)||!/^[a-f0-9]{40}$/u.test(expectedReleaseSha??'')||typeof readSourceBytes!=='function')fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_INPUT_REJECTED');
  const entries=await readdir(directory,{withFileTypes:true});
  const names=entries.map(entry=>entry.name).sort();
  if(!equal(names,studioHandoffPersonaArtifactFiles)||entries.some(entry=>!entry.isFile()||entry.isSymbolicLink()))fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_FILE_SET_REJECTED');
  const readJson=async name=>{
    const target=path.join(directory,name);const stat=await lstat(target);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size<2||stat.size>512*1024)fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_FILE_REJECTED');
    try{return JSON.parse(await readFile(target,'utf8'));}catch{return fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_JSON_REJECTED');}
  };
  const bindings=await readJson('source-bindings.json');
  exact(bindings,['schemaVersion','releaseSha','sourceCount','sourceDigest','sourceBindings']);
  if(bindings.schemaVersion!=='studio-handoff-persona-source-bindings-v1'||bindings.releaseSha!==expectedReleaseSha
    ||bindings.sourceCount!==studioHandoffPersonaSourcePaths.length||!Array.isArray(bindings.sourceBindings)
    ||bindings.sourceBindings.length!==studioHandoffPersonaSourcePaths.length)fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_SOURCE_REJECTED');
  for(let index=0;index<studioHandoffPersonaSourcePaths.length;index+=1){
    const item=bindings.sourceBindings[index];exact(item,['source','digest']);
    if(item.source!==studioHandoffPersonaSourcePaths[index]||digest(item.digest)!==sha256(await readSourceBytes(item.source)))fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_SOURCE_REJECTED');
  }
  if(digest(bindings.sourceDigest)!==sha256(Buffer.from(JSON.stringify(bindings.sourceBindings))))fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_SOURCE_REJECTED');
  const build=await readJson('build-proof.json');
  exact(build,['schemaVersion','releaseSha','status','fileCount','digest']);
  if(build.schemaVersion!=='studio-handoff-persona-build-proof-v1'||build.releaseSha!==expectedReleaseSha||build.status!=='passed'||integer(build.fileCount,1)<1||!digest(build.digest))fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_BUILD_REJECTED');
  const componentProof=await validateStudioHandoffTargetingComponentProof(await readJson('targeting-component-proof.json'),{readSourceBytes});
  const browsers=[];
  for(const project of studioHandoffPersonaProjects)browsers.push(validateBrowser(await readJson(`browser-${project}.json`),project,componentProof));
  const result=await readJson('result.json');exact(result,requiredKeys.result);
  if(result.schemaVersion!=='studio-handoff-persona-result-v4'||result.status!=='passed'||result.releaseSha!==expectedReleaseSha||result.browserExit!==0||result.exactRolesStable!==true)fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_RESULT_REJECTED');
  exact(result.exactRoles,['author','reviewer','approver']);validateRole(result.exactRoles.author,25);validateRole(result.exactRoles.reviewer,14);validateRole(result.exactRoles.approver,18);
  exact(result.exactRolesAfterRun,['author','reviewer','approver']);validateRole(result.exactRolesAfterRun.author,25);validateRole(result.exactRolesAfterRun.reviewer,14);validateRole(result.exactRolesAfterRun.approver,18);
  if(!equal(result.exactRoles,result.exactRolesAfterRun))fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_RESULT_REJECTED');
  exact(result.scenarioIsolation,['fixturesCreated','fixturesClosed','observersCreated','observersClosed','cases']);
  for(const key of ['fixturesCreated','fixturesClosed','observersCreated','observersClosed'])if(result.scenarioIsolation[key]!==studioHandoffPersonaScenarioMatrix.length)fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_RESULT_REJECTED');
  const expectedCases=studioHandoffPersonaScenarioMatrix.map(({project,scenario})=>({project,scenario,
    browserExit:0,observerCreated:true,observerClosed:true,fixtureCreated:true,fixtureClosed:true}));
  if(!equal(result.scenarioIsolation.cases,expectedCases))fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_RESULT_REJECTED');
  exact(result.source,['count','digest','unchangedAfterRun']);if(result.source.count!==studioHandoffPersonaSourcePaths.length||result.source.digest!==bindings.sourceDigest||result.source.unchangedAfterRun!==true)fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_RESULT_REJECTED');
  if(!equal(result.build,{status:build.status,fileCount:build.fileCount,digest:build.digest})||!equal(result.browsers,browsers))fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_RESULT_REJECTED');
  exact(result.providers,['calls','paidCalls','egressAttempts']);if(!equal(result.providers,{calls:0,paidCalls:0,egressAttempts:0}))fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_RESULT_REJECTED');
  exact(result.cleanup,studioHandoffPersonaCleanupKeys);if(Object.values(result.cleanup).some(value=>value!==true))fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_RESULT_REJECTED');
  exact(result.constraints,['actorLimitMs','providersEnabled','hostedRun','fullAcceptance','tokenRead']);if(!equal(result.constraints,{actorLimitMs:15_000,providersEnabled:false,hostedRun:false,fullAcceptance:false,tokenRead:false}))fail('STUDIO_HANDOFF_PERSONA_ARTIFACT_RESULT_REJECTED');
  return {status:'passed',schemaVersion:result.schemaVersion,releaseSha:expectedReleaseSha,sourceCount:studioHandoffPersonaSourcePaths.length,projects:browsers.map(item=>item.project),artifactFiles:names};
};

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const directory=path.resolve(process.argv[2]??'');
  const result=await verifyStudioHandoffPersonaArtifact({directory,expectedReleaseSha:process.env.RELEASE_SHA,
    readSourceBytes:source=>readFile(path.resolve(process.cwd(),source))});
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
