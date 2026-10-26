import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStudioHandoffPersonaComponentFailureEvidence, studioHandoffPersonaCleanupKeys,
  studioHandoffPersonaProjects, studioHandoffPersonaScenarioMatrix, studioHandoffPersonaScenarios,
  studioHandoffPersonaSourcePaths, verifyStudioHandoffPersonaArtifact } from './studioHandoffPersonaArtifact.mjs';
import { STUDIO_HANDOFF_TARGETING_CASES, STUDIO_HANDOFF_TARGETING_PROJECTS,
  studioHandoffTargetingComponentSourcePaths } from './runStudioHandoffActionTargetingBrowser.mjs';

const releaseSha='a'.repeat(40);
const sha256=value=>`sha256:${createHash('sha256').update(value).digest('hex')}`;
const sourceBytes=new Map([...new Set([...studioHandoffPersonaSourcePaths,...studioHandoffTargetingComponentSourcePaths])]
  .map(source=>[source,Buffer.from(`bound:${source}`)]));
sourceBytes.set('playwright.studio-pr-b.config.ts',Buffer.from("use:{baseURL:'http://127.0.0.1:4197',trace:'off',screenshot:'off',video:'off'},webServer:{command: 'node tests/browser/studioPrB/server.mjs',reuseExistingServer:false}"));
sourceBytes.set('tests/browser/studioPrB/server.mjs',Buffer.from("import { createServer } from 'vite'; void createServer({server:{port:4197}});"));
sourceBytes.set('tests/browser/studioPrB/studioPrB.spec.ts',Buffer.from("url.origin==='http://127.0.0.1:4197';page.route('**/*',guard);route.abort('blockedbyclient');page.unroute('**/*',guard);page.setDefaultTimeout(15_000);const targetingStarted=Date.now();const elapsedMs=Date.now()-targetingStarted;expect(elapsedMs).toBeLessThan(15_000);"));
const sequence=['author-request','reviewer-review','approver-final-accept','approver-consume-inbox'];
const role=count=>({actualCount:count,requiredCount:count,requiredComplete:true,forbiddenAbsent:true,exact:true});
const componentCounts={
  'exact-target':[2,1],'missing-target':[2,0],'stale-version':[2,0],
  'wrong-mailbox':[0,0],'ineligible-action':[1,1],'duplicate-exact-pair':[2,2],
};
const targetingComponentProof=()=>{
  const bindings=studioHandoffTargetingComponentSourcePaths.map(source=>({source,digest:sha256(sourceBytes.get(source))}));
  const results=STUDIO_HANDOFF_TARGETING_PROJECTS.flatMap(project=>STUDIO_HANDOFF_TARGETING_CASES.map(sample=>({
    schemaVersion:'studio-handoff-targeting-component-v1',project,case:sample,
    readyCardCount:componentCounts[sample][0],matchedCardCount:componentCounts[sample][1],zeroCommands:true,zeroEffects:true,
    externalAttemptCount:0,elapsedMs:125,status:'passed',actorLimitMs:15_000,providersEnabled:false,
  })));
  const core={schemaVersion:'studio-handoff-targeting-component-summary-v1',status:'passed',scope:'component-fixture',
    actorLimitMs:15_000,providersEnabled:false,projects:[...STUDIO_HANDOFF_TARGETING_PROJECTS],cases:[...STUDIO_HANDOFF_TARGETING_CASES],
    testCount:12,results,network:{guard:'exact-loopback-route-abort',externalAttemptCount:0},
    capture:{trace:'off',screenshot:'off',video:'off'},execution:{mode:'vite-dev-component-fixture',buildArtifactUsed:false,playwrightExitCode:0},
    source:{count:bindings.length,digest:sha256(Buffer.from(JSON.stringify(bindings))),bindings},
    cleanup:{serverClosed:true,playwrightOutputRemoved:true}};
  return {...core,proofDigest:sha256(Buffer.from(JSON.stringify(core)))};
};
const exactTargeting=componentProofDigest=>({
  readyCards:{count:2,distinct:true},
  request:{status:201,targetValid:true},
  review:{status:201,targetBound:true,monotonic:true},
  finalAccept:{status:201,targetBound:true,transitionCount:1,elapsedMs:175,effects:{approvals:1,receipts:1,audits:1,sourcePackages:0}},
  competing:{sameIdentity:true,sameVersion:true,sameState:true,zeroEffects:true},
  consume:{status:201,targetBound:true,sourcePackageDelta:1},
  singleCardControl:{passed:true,elapsedMs:125},
  negativeCases:{
    missingTarget:{zeroCommands:true,zeroEffects:true},staleVersion:{zeroCommands:true,zeroEffects:true},
    wrongMailbox:{zeroCommands:true,zeroEffects:true},ineligibleState:{zeroCommands:true,zeroEffects:true},
    duplicateExactPair:{zeroCommands:true,zeroEffects:true,scope:'component-fixture',proofDigest:componentProofDigest},
  },
});
const browser=(project,componentProofDigest)=>{
  const targeting=exactTargeting(componentProofDigest);
  return {schemaVersion:'studio-handoff-persona-browser-v4',status:'passed',project,
    mode:'actual-chromium-production-ui-production-handlers-disposable-postgresql',fixtureSessionPrimed:true,
    actorSequence:sequence,responseStatuses:{request:201,review:201,finalAccept:201,consume:201},
    directAuthorApproval:{denied:true,status:403,errorCode:'PERMISSION_DENIED',zeroEffects:true,projectionReadRefused:false},
    sourcePackages:{before:0,after:1,delta:1},authorityBoundReadiness:{projectionRoute:'studio_artifact_projection',
      actualResponseFetched:true,legitimateNull:true,exactApproverActor:true,requestCount:1,phaseBeforeCommit:'ready',
      finalAcceptElapsedMs:250,committedBeforeDetailRelease:true,staleDetailDidNotOverwrite:true,
      effects:{approvals:1,receipts:1,audits:1,sourcePackages:0}},
    artifactReadIsolation:{projectionRoute:'studio_artifact_projection',injectedStatus:503,requestCount:1,actualStatus:200,
      legitimateNull:true,exactApproverActor:true,artifactState:'artifact_unavailable',handoffPhase:'ready',
      finalAcceptUnique:true,finalAcceptEnabled:true,artifactMutationBlocked:true,finalAcceptStatus:201,finalAcceptElapsedMs:200,
      effects:{approvals:1,receipts:1,audits:1,sourcePackages:0}},
    exactTargeting:targeting,
    proofDigest:sha256(Buffer.from(JSON.stringify({actorSequence:sequence,sourcePackageDelta:1,exactTargeting:targeting}))),actorLimitMs:15_000,
    providersEnabled:false,hostedRun:false,fullAcceptance:false};
};

const writeFixture=async(root,mutate=()=>{})=>{
  await mkdir(root,{recursive:true});
  const sourceBindings=studioHandoffPersonaSourcePaths.map(source=>({source,digest:sha256(sourceBytes.get(source))}));
  const build={schemaVersion:'studio-handoff-persona-build-proof-v1',releaseSha,status:'passed',fileCount:10,digest:sha256(Buffer.from('build'))};
  const componentProof=targetingComponentProof();
  const browsers=[browser('desktop-chromium',componentProof.proofDigest),browser('pixel-7-chromium',componentProof.proofDigest)];
  const files={
    'source-bindings.json':{schemaVersion:'studio-handoff-persona-source-bindings-v1',releaseSha,
      sourceCount:sourceBindings.length,sourceDigest:sha256(Buffer.from(JSON.stringify(sourceBindings))),sourceBindings},
    'build-proof.json':build,
    'browser-desktop-chromium.json':browsers[0],
    'browser-pixel-7-chromium.json':browsers[1],
    'targeting-component-proof.json':componentProof,
    'result.json':{schemaVersion:'studio-handoff-persona-result-v4',status:'passed',releaseSha,
      exactRoles:{author:role(25),reviewer:role(14),approver:role(18)},
      exactRolesAfterRun:{author:role(25),reviewer:role(14),approver:role(18)},exactRolesStable:true,
      scenarioIsolation:{fixturesCreated:6,fixturesClosed:6,observersCreated:6,observersClosed:6,
        cases:studioHandoffPersonaScenarioMatrix.map(({project,scenario})=>({project,scenario,
          browserExit:0,observerCreated:true,observerClosed:true,fixtureCreated:true,fixtureClosed:true}))},
      source:{count:sourceBindings.length,digest:sha256(Buffer.from(JSON.stringify(sourceBindings))),unchangedAfterRun:true},
      build:{status:'passed',fileCount:10,digest:build.digest},browserExit:0,browsers,providers:{calls:0,paidCalls:0,egressAttempts:0},
      cleanup:{fixtureClosed:true,observerClosed:true,previewExited:true,buildRemoved:true,playwrightOutputRemoved:true,
        targetingComponentWorkRemoved:true},
      constraints:{actorLimitMs:15_000,providersEnabled:false,hostedRun:false,fullAcceptance:false,tokenRead:false}},
  };
  mutate(files);
  for(const [name,value] of Object.entries(files))await writeFile(path.join(root,name),`${JSON.stringify(value,null,2)}\n`);
};
const readSourceBytes=async source=>sourceBytes.get(source);
const runnerSource=await readFile(new URL('./reproduceStudioHandoffPersonaContract.mjs',import.meta.url),'utf8');
assert.deepEqual(studioHandoffPersonaProjects,['desktop-chromium','pixel-7-chromium'],
  'persona projects must remain the exact Desktop and Pixel proof matrix');
assert.deepEqual(studioHandoffPersonaScenarios,['artifact-unavailable','two-card-targeting','held-null-control'],
  'persona scenarios must retain artifact isolation, exact targeting and fresh single-card control');
assert.equal(studioHandoffPersonaScenarioMatrix.length,6,'persona proof must use a fresh fixture and observer for all six project scenarios');
assert.deepEqual(studioHandoffPersonaCleanupKeys,
  ['fixtureClosed','observerClosed','previewExited','buildRemoved','playwrightOutputRemoved','targetingComponentWorkRemoved'],
  'persona cleanup must bind component preparation as well as PostgreSQL browser/build outputs');
assert.ok(studioHandoffPersonaSourcePaths.includes('scripts/runStudioHandoffActionTargetingBrowser.test.mjs'),
  'persona source bindings must include the targeting runner invariant tests');
assert.ok(studioHandoffPersonaSourcePaths.includes('playwright.studio-pr-b.config.ts'),
  'persona source bindings must include the targeting browser capture and server policy');
assert.match(runnerSource,/import \{[\s\S]*?studioHandoffPersonaSourcePaths \} from '\.\/studioHandoffPersonaArtifact\.mjs';/u,
  'persona runner must import the authoritative exported source list');
assert.ok(runnerSource.includes('const sourcePaths = studioHandoffPersonaSourcePaths;'),
  'persona runner must use the authoritative exported source list exactly');
assert.ok(!runnerSource.includes('const sourcePaths = [...new Set(['),
  'persona runner must not maintain a duplicated source list');
assert.ok(runnerSource.includes('const cases=studioHandoffPersonaScenarioMatrix.map'),
  'persona runner must use the verifier-owned exact scenario matrix');
assert.ok(runnerSource.includes('Object.fromEntries(studioHandoffPersonaCleanupKeys.map'),
  'persona runner must emit the verifier-owned exact cleanup shape');
assert.ok(runnerSource.includes("failureStage==='targeting-component-preparation'"),
  'component preparation failures must preserve sanitized stage-bound evidence before cleanup');
assert.ok(runnerSource.includes("path.join(base,'component-failure.json')"),
  'sanitized component failure evidence must remain inside the failed persona attempt for the existing archive path');
assert.ok(runnerSource.includes('validateAuthenticatedHostedPlaywrightDiagnostic'),
  'component failure diagnostics must pass the existing closed diagnostic validator before retention');
assert.ok(runnerSource.includes('const database=new Client'),'authority observer must own an independent PostgreSQL client');
assert.ok(runnerSource.includes('database.query(`WITH target AS('),'authority frames must use the independent observer connection');
assert.ok(!runnerSource.includes('fixture.db.query(`WITH target AS('),'authority frames must not race the fixture role-switched client');
assert.ok(runnerSource.includes('fixtureCreateCount===fixtureCloseCount'),'fixture cleanup must bind every created fixture without a vacuous array reduction');
assert.ok(runnerSource.includes('observerCreateCount===observerCloseCount'),'observer cleanup must bind every successfully created observer');
assert.ok(runnerSource.includes('if(databaseConnected)try{await database.end()'),'partial observer setup must close its connected database');
const base=await mkdtemp(path.join(tmpdir(),'studio-handoff-persona-artifact-'));
try{
  const authentic=path.join(base,'authentic');await writeFixture(authentic);
  const verified=await verifyStudioHandoffPersonaArtifact({directory:authentic,expectedReleaseSha:releaseSha,readSourceBytes});
  assert.deepEqual(verified.projects,['desktop-chromium','pixel-7-chromium']);
  await assert.rejects(verifyStudioHandoffPersonaArtifact({directory:authentic,expectedReleaseSha:releaseSha}),/INPUT_REJECTED/u);
  await assert.rejects(verifyStudioHandoffPersonaArtifact({directory:authentic,expectedReleaseSha:'b'.repeat(40),readSourceBytes}),/SOURCE_REJECTED/u);
  const cases=[
    ['swapped-project',files=>{files['browser-desktop-chromium.json'].project='pixel-7-chromium';}],
    ['stale-overwrite',files=>{files['browser-desktop-chromium.json'].authorityBoundReadiness.staleDetailDidNotOverwrite=false;}],
    ['limit',files=>{files['browser-desktop-chromium.json'].authorityBoundReadiness.finalAcceptElapsedMs=15_000;}],
    ['effects',files=>{files['browser-desktop-chromium.json'].authorityBoundReadiness.effects.approvals=0;}],
    ['artifact-isolation-status',files=>{files['browser-desktop-chromium.json'].artifactReadIsolation.actualStatus=503;}],
    ['artifact-isolation-state',files=>{files['browser-desktop-chromium.json'].artifactReadIsolation.artifactState='stale';}],
    ['artifact-isolation-action',files=>{files['browser-desktop-chromium.json'].artifactReadIsolation.finalAcceptEnabled=false;}],
    ['artifact-isolation-mutation',files=>{files['browser-desktop-chromium.json'].artifactReadIsolation.artifactMutationBlocked=false;}],
    ['artifact-isolation-limit',files=>{files['browser-desktop-chromium.json'].artifactReadIsolation.finalAcceptElapsedMs=15_000;}],
    ['artifact-isolation-effects',files=>{files['browser-desktop-chromium.json'].artifactReadIsolation.effects.receipts=0;}],
    ['targeting-missing',files=>{delete files['browser-desktop-chromium.json'].exactTargeting;}],
    ['targeting-extra-field',files=>{files['browser-desktop-chromium.json'].exactTargeting.untrusted='forged';}],
    ['targeting-ready-card-count',files=>{files['browser-desktop-chromium.json'].exactTargeting.readyCards.count=1;}],
    ['targeting-ready-card-distinct',files=>{files['browser-desktop-chromium.json'].exactTargeting.readyCards.distinct=false;}],
    ['targeting-request-status',files=>{files['browser-desktop-chromium.json'].exactTargeting.request.status=200;}],
    ['targeting-request-invalid',files=>{files['browser-desktop-chromium.json'].exactTargeting.request.targetValid=false;}],
    ['targeting-review-unbound',files=>{files['browser-desktop-chromium.json'].exactTargeting.review.targetBound=false;}],
    ['targeting-review-replayed',files=>{files['browser-desktop-chromium.json'].exactTargeting.review.monotonic=false;}],
    ['targeting-final-status',files=>{files['browser-desktop-chromium.json'].exactTargeting.finalAccept.status=409;}],
    ['targeting-final-unbound',files=>{files['browser-desktop-chromium.json'].exactTargeting.finalAccept.targetBound=false;}],
    ['targeting-final-transition-count',files=>{files['browser-desktop-chromium.json'].exactTargeting.finalAccept.transitionCount=2;}],
    ['targeting-final-limit',files=>{files['browser-desktop-chromium.json'].exactTargeting.finalAccept.elapsedMs=15_000;}],
    ['targeting-final-effects',files=>{files['browser-desktop-chromium.json'].exactTargeting.finalAccept.effects.audits=0;}],
    ['targeting-competing-identity',files=>{files['browser-desktop-chromium.json'].exactTargeting.competing.sameIdentity=false;}],
    ['targeting-competing-version',files=>{files['browser-desktop-chromium.json'].exactTargeting.competing.sameVersion=false;}],
    ['targeting-competing-state',files=>{files['browser-desktop-chromium.json'].exactTargeting.competing.sameState=false;}],
    ['targeting-competing-effects',files=>{files['browser-desktop-chromium.json'].exactTargeting.competing.zeroEffects=false;}],
    ['targeting-consume-status',files=>{files['browser-desktop-chromium.json'].exactTargeting.consume.status=409;}],
    ['targeting-consume-unbound',files=>{files['browser-desktop-chromium.json'].exactTargeting.consume.targetBound=false;}],
    ['targeting-consume-lineage',files=>{files['browser-desktop-chromium.json'].exactTargeting.consume.sourcePackageDelta=0;}],
    ['targeting-single-card-control',files=>{files['browser-desktop-chromium.json'].exactTargeting.singleCardControl.passed=false;}],
    ['targeting-single-card-limit',files=>{files['browser-desktop-chromium.json'].exactTargeting.singleCardControl.elapsedMs=15_000;}],
    ['targeting-missing-zero-command',files=>{files['browser-desktop-chromium.json'].exactTargeting.negativeCases.missingTarget.zeroCommands=false;}],
    ['targeting-stale-zero-command',files=>{files['browser-desktop-chromium.json'].exactTargeting.negativeCases.staleVersion.zeroCommands=false;}],
    ['targeting-wrong-mailbox-zero-command',files=>{files['browser-desktop-chromium.json'].exactTargeting.negativeCases.wrongMailbox.zeroCommands=false;}],
    ['targeting-ineligible-zero-command',files=>{files['browser-desktop-chromium.json'].exactTargeting.negativeCases.ineligibleState.zeroCommands=false;}],
    ['targeting-duplicate-zero-command',files=>{files['browser-desktop-chromium.json'].exactTargeting.negativeCases.duplicateExactPair.zeroCommands=false;}],
    ['targeting-missing-zero-effects',files=>{files['browser-desktop-chromium.json'].exactTargeting.negativeCases.missingTarget.zeroEffects=false;}],
    ['targeting-stale-zero-effects',files=>{files['browser-desktop-chromium.json'].exactTargeting.negativeCases.staleVersion.zeroEffects=false;}],
    ['targeting-wrong-mailbox-zero-effects',files=>{files['browser-desktop-chromium.json'].exactTargeting.negativeCases.wrongMailbox.zeroEffects=false;}],
    ['targeting-ineligible-zero-effects',files=>{files['browser-desktop-chromium.json'].exactTargeting.negativeCases.ineligibleState.zeroEffects=false;}],
    ['targeting-duplicate-zero-effects',files=>{files['browser-desktop-chromium.json'].exactTargeting.negativeCases.duplicateExactPair.zeroEffects=false;}],
    ['targeting-duplicate-scope',files=>{files['browser-desktop-chromium.json'].exactTargeting.negativeCases.duplicateExactPair.scope='disposable-postgresql';}],
    ['targeting-duplicate-proof-digest',files=>{files['browser-desktop-chromium.json'].exactTargeting.negativeCases.duplicateExactPair.proofDigest=sha256(Buffer.from('forged'));}],
    ['targeting-component-scope',files=>{files['targeting-component-proof.json'].scope='disposable-postgresql';}],
    ['targeting-component-project-result',files=>{files['targeting-component-proof.json'].results.at(-1).matchedCardCount=1;}],
    ['targeting-component-source',files=>{files['targeting-component-proof.json'].source.bindings[0].digest=sha256(Buffer.from('forged'));}],
    ['targeting-forged-v3-digest',files=>{files['browser-desktop-chromium.json'].proofDigest=sha256(Buffer.from(JSON.stringify({actorSequence:sequence,sourcePackageDelta:1})));}],
    ['targeting-browser-v3',files=>{files['browser-desktop-chromium.json'].schemaVersion='studio-handoff-persona-browser-v3';}],
    ['provider',files=>{files['result.json'].providers.calls=1;}],
    ['cleanup',files=>{files['result.json'].cleanup.observerClosed=false;}],
    ['cleanup-targeting-component',files=>{files['result.json'].cleanup.targetingComponentWorkRemoved=false;}],
    ['cleanup-targeting-component-missing',files=>{delete files['result.json'].cleanup.targetingComponentWorkRemoved;}],
    ['scenario-fixture-count',files=>{files['result.json'].scenarioIsolation.fixturesCreated=5;}],
    ['scenario-observer-count',files=>{files['result.json'].scenarioIsolation.observersClosed=5;}],
    ['scenario-targeting-missing',files=>{const index=files['result.json'].scenarioIsolation.cases.findIndex(item=>item.scenario==='two-card-targeting');files['result.json'].scenarioIsolation.cases.splice(index,1);}],
    ['scenario-missing',files=>{files['result.json'].scenarioIsolation.cases.pop();}],
    ['role',files=>{files['result.json'].exactRoles.author.actualCount=24;}],
    ['result-browser',files=>{files['result.json'].browsers[0].authorityBoundReadiness.requestCount=2;}],
    ['schema',files=>{files['result.json'].schemaVersion='studio-handoff-persona-result-v1';}],
    ['source',files=>{files['source-bindings.json'].sourceBindings[0].digest=sha256(Buffer.from('wrong'));}],
  ];
  for(const [name,mutate] of cases){const folder=path.join(base,name);await writeFixture(folder,mutate);await assert.rejects(verifyStudioHandoffPersonaArtifact({directory:folder,expectedReleaseSha:releaseSha,readSourceBytes}),/REJECTED|INVALID/u);}
  const extra=path.join(base,'extra');await writeFixture(extra);await writeFile(path.join(extra,'raw.log'),'forbidden');
  await assert.rejects(verifyStudioHandoffPersonaArtifact({directory:extra,expectedReleaseSha:releaseSha,readSourceBytes}),/FILE_SET_REJECTED/u);
  const nonFile=path.join(base,'non-file');await writeFixture(nonFile);await rm(path.join(nonFile,'build-proof.json'));await mkdir(path.join(nonFile,'build-proof.json'));
  await assert.rejects(verifyStudioHandoffPersonaArtifact({directory:nonFile,expectedReleaseSha:releaseSha,readSourceBytes}),/FILE_SET_REJECTED/u);
}finally{await rm(base,{recursive:true,force:true});}
const sanitizedComponentFailure={schemaVersion:'studio-handoff-targeting-component-failure-v1',status:'failed',playwrightExitCode:1,
  signal:'none',serverClosed:true,playwrightOutputRemoved:true,providersEnabled:false};
assert.deepEqual(createStudioHandoffPersonaComponentFailureEvidence({stage:'targeting-component-preparation',
  failureCode:'STUDIO_HANDOFF_PERSONA_TARGETING_COMPONENT_FAILED',componentFailure:sanitizedComponentFailure,
  preservedFiles:['failure-diagnostic.json','failure.json']}),{
  schemaVersion:'studio-handoff-persona-component-failure-v1',status:'failed',stage:'targeting-component-preparation',
  failureCode:'STUDIO_HANDOFF_PERSONA_TARGETING_COMPONENT_FAILED',componentEvidenceStatus:'preserved',
  preservedFiles:['failure-diagnostic.json','failure.json'],componentFailure:sanitizedComponentFailure,
});
assert.equal(createStudioHandoffPersonaComponentFailureEvidence({stage:'targeting-component-preparation',
  failureCode:'STUDIO_HANDOFF_PERSONA_TARGETING_COMPONENT_FAILED',componentFailure:null,preservedFiles:[]}).componentEvidenceStatus,'unavailable');
assert.throws(()=>createStudioHandoffPersonaComponentFailureEvidence({stage:'browser',
  failureCode:'raw error text',componentFailure:null}),/COMPONENT_FAILURE_INVALID/u);
assert.throws(()=>createStudioHandoffPersonaComponentFailureEvidence({stage:'targeting-component-preparation',
  failureCode:'STUDIO_HANDOFF_PERSONA_TARGETING_COMPONENT_FAILED',componentFailure:null,preservedFiles:['raw.log']}),/COMPONENT_FAILURE_INVALID/u);
console.log('studio handoff persona artifact: synthetic contract fixture and strict scenario-isolation, artifact-read, source, project, limit, effect, provider, cleanup, shape and file-boundary assertions passed');
