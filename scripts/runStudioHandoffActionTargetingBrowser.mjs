import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STUDIO_HANDOFF_TARGETING_PROJECTS=Object.freeze(['desktop-chrome','pixel-7']);
export const STUDIO_HANDOFF_TARGETING_CASES=Object.freeze([
  'exact-target','missing-target','stale-version','wrong-mailbox','ineligible-action','duplicate-exact-pair',
]);
export const STUDIO_HANDOFF_TARGETING_SUMMARY_FILE='summary.json';
export const studioHandoffTargetingComponentSourcePaths=Object.freeze([
  'components/docs/StudioArtifactWorkspace.tsx',
  'components/docs/StudioHandoffCenter.tsx',
  'components/docs/studioHandoffReadiness.ts',
  'playwright.studio-pr-b.config.ts',
  'scripts/authenticatedHostedDiagnostics.mjs',
  'scripts/authenticatedHostedPlaywrightReporter.mjs',
  'scripts/eligibleReviewerRequestDiagnostic.mjs',
  'scripts/runStudioHandoffActionTargetingBrowser.mjs',
  'scripts/studioHandoffActionTargeting.test.mjs',
  'tests/browser/authenticatedLifecycleHarness.ts',
  'tests/browser/studioPrB/globalTeardown.mjs',
  'tests/browser/studioPrB/harness.html',
  'tests/browser/studioPrB/harness.tsx',
  'tests/browser/studioPrB/server.mjs',
  'tests/browser/studioPrB/studioPrB.spec.ts',
  'vite.studio-pr-b.config.ts',
].sort());

const sha256=value=>`sha256:${createHash('sha256').update(value).digest('hex')}`;
const fail=code=>{throw new Error(code);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value:fail('STUDIO_HANDOFF_TARGETING_COMPONENT_INVALID');
const exact=(value,keys)=>{const actual=Object.keys(object(value));if(actual.length!==keys.length||actual.some(key=>!keys.includes(key)))fail('STUDIO_HANDOFF_TARGETING_COMPONENT_INVALID');return value;};
const equal=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const digest=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/u.test(value)?value:fail('STUDIO_HANDOFF_TARGETING_COMPONENT_INVALID');
const expectedCounts=Object.freeze({
  'exact-target':{readyCardCount:2,matchedCardCount:1},
  'missing-target':{readyCardCount:2,matchedCardCount:0},
  'stale-version':{readyCardCount:2,matchedCardCount:0},
  'wrong-mailbox':{readyCardCount:0,matchedCardCount:0},
  'ineligible-action':{readyCardCount:1,matchedCardCount:1},
  'duplicate-exact-pair':{readyCardCount:2,matchedCardCount:2},
});
const resultNames=()=>STUDIO_HANDOFF_TARGETING_PROJECTS.flatMap(project=>STUDIO_HANDOFF_TARGETING_CASES.map(sample=>`${project}-${sample}.json`));
const expectedPairs=()=>STUDIO_HANDOFF_TARGETING_PROJECTS.flatMap(project=>STUDIO_HANDOFF_TARGETING_CASES.map(sample=>({project,case:sample})));

export const studioHandoffTargetingComponentSummaryPath=directory=>path.join(path.resolve(directory),STUDIO_HANDOFF_TARGETING_SUMMARY_FILE);

export const validateStudioHandoffTargetingComponentFragment=(value,expected)=>{
  exact(value,['schemaVersion','project','case','readyCardCount','matchedCardCount','zeroCommands','zeroEffects','externalAttemptCount','elapsedMs','status','actorLimitMs','providersEnabled']);
  const counts=expectedCounts[expected.case];
  if(value.schemaVersion!=='studio-handoff-targeting-component-v1'||value.project!==expected.project||value.case!==expected.case
    ||value.status!=='passed'||value.actorLimitMs!==15_000||value.providersEnabled!==false||!counts
    ||value.readyCardCount!==counts.readyCardCount||value.matchedCardCount!==counts.matchedCardCount
    ||value.zeroCommands!==true||value.zeroEffects!==true||value.externalAttemptCount!==0
    ||!Number.isSafeInteger(value.elapsedMs)||value.elapsedMs<0||value.elapsedMs>=15_000)fail('STUDIO_HANDOFF_TARGETING_COMPONENT_INVALID');
  return value;
};

const summaryCore=value=>({
  schemaVersion:value.schemaVersion,status:value.status,scope:value.scope,actorLimitMs:value.actorLimitMs,
  providersEnabled:value.providersEnabled,projects:value.projects,cases:value.cases,testCount:value.testCount,
  results:value.results,network:value.network,capture:value.capture,execution:value.execution,source:value.source,cleanup:value.cleanup,
});

export const validateStudioHandoffTargetingComponentProof=async(value,{readSourceBytes})=>{
  exact(value,['schemaVersion','status','scope','actorLimitMs','providersEnabled','projects','cases','testCount','results','network','capture','execution','source','cleanup','proofDigest']);
  if(value.schemaVersion!=='studio-handoff-targeting-component-summary-v1'||value.status!=='passed'||value.scope!=='component-fixture'
    ||value.actorLimitMs!==15_000||value.providersEnabled!==false||!equal(value.projects,STUDIO_HANDOFF_TARGETING_PROJECTS)
    ||!equal(value.cases,STUDIO_HANDOFF_TARGETING_CASES)||value.testCount!==12||typeof readSourceBytes!=='function')fail('STUDIO_HANDOFF_TARGETING_COMPONENT_INVALID');
  if(!Array.isArray(value.results)||value.results.length!==12)fail('STUDIO_HANDOFF_TARGETING_COMPONENT_INVALID');
  const pairs=expectedPairs();
  for(let index=0;index<pairs.length;index+=1)validateStudioHandoffTargetingComponentFragment(value.results[index],pairs[index]);
  exact(value.network,['guard','externalAttemptCount']);
  if(value.network.guard!=='exact-loopback-route-abort'||value.network.externalAttemptCount!==0
    ||value.results.reduce((total,item)=>total+item.externalAttemptCount,0)!==0)fail('STUDIO_HANDOFF_TARGETING_COMPONENT_INVALID');
  exact(value.capture,['trace','screenshot','video']);
  if(!equal(value.capture,{trace:'off',screenshot:'off',video:'off'}))fail('STUDIO_HANDOFF_TARGETING_COMPONENT_INVALID');
  exact(value.execution,['mode','buildArtifactUsed','playwrightExitCode']);
  if(!equal(value.execution,{mode:'vite-dev-component-fixture',buildArtifactUsed:false,playwrightExitCode:0}))fail('STUDIO_HANDOFF_TARGETING_COMPONENT_INVALID');
  exact(value.source,['count','digest','bindings']);
  if(value.source.count!==studioHandoffTargetingComponentSourcePaths.length||!Array.isArray(value.source.bindings)
    ||value.source.bindings.length!==studioHandoffTargetingComponentSourcePaths.length)fail('STUDIO_HANDOFF_TARGETING_COMPONENT_INVALID');
  const boundSourceBytes=new Map();
  for(let index=0;index<studioHandoffTargetingComponentSourcePaths.length;index+=1){
    const binding=value.source.bindings[index];exact(binding,['source','digest']);
    if(binding.source!==studioHandoffTargetingComponentSourcePaths[index])fail('STUDIO_HANDOFF_TARGETING_COMPONENT_INVALID');
    const sourceBytes=await readSourceBytes(binding.source);boundSourceBytes.set(binding.source,sourceBytes);
    if(digest(binding.digest)!==sha256(sourceBytes))fail('STUDIO_HANDOFF_TARGETING_COMPONENT_INVALID');
  }
  if(digest(value.source.digest)!==sha256(Buffer.from(JSON.stringify(value.source.bindings))))fail('STUDIO_HANDOFF_TARGETING_COMPONENT_INVALID');
  const playwrightConfig=Buffer.from(boundSourceBytes.get('playwright.studio-pr-b.config.ts')).toString('utf8');
  const fixtureServer=Buffer.from(boundSourceBytes.get('tests/browser/studioPrB/server.mjs')).toString('utf8');
  const fixtureSpec=Buffer.from(boundSourceBytes.get('tests/browser/studioPrB/studioPrB.spec.ts')).toString('utf8');
  if(!/trace:\s*'off'/u.test(playwrightConfig)||!/screenshot:\s*'off'/u.test(playwrightConfig)||!/video:\s*'off'/u.test(playwrightConfig)
    ||!playwrightConfig.includes("command: 'node tests/browser/studioPrB/server.mjs'")
    ||!/reuseExistingServer:\s*false/u.test(playwrightConfig)||!playwrightConfig.includes('127.0.0.1:4197')
    ||!/createServer/u.test(fixtureServer)||!/port:\s*4197/u.test(fixtureServer)
    ||!fixtureSpec.includes("url.origin==='http://127.0.0.1:4197'")||!fixtureSpec.includes("page.route('**/*',guard)")
    ||!fixtureSpec.includes("route.abort('blockedbyclient')")||!fixtureSpec.includes("page.unroute('**/*',guard)")
    ||!fixtureSpec.includes('page.setDefaultTimeout(15_000)')
    ||!fixtureSpec.includes('const elapsedMs=Date.now()-targetingStarted')
    ||!fixtureSpec.includes('expect(elapsedMs).toBeLessThan(15_000)'))fail('STUDIO_HANDOFF_TARGETING_COMPONENT_INVALID');
  exact(value.cleanup,['serverClosed','playwrightOutputRemoved']);
  if(!equal(value.cleanup,{serverClosed:true,playwrightOutputRemoved:true}))fail('STUDIO_HANDOFF_TARGETING_COMPONENT_INVALID');
  if(digest(value.proofDigest)!==sha256(Buffer.from(JSON.stringify(summaryCore(value)))))fail('STUDIO_HANDOFF_TARGETING_COMPONENT_INVALID');
  return value;
};

const readJsonFile=async file=>{
  const stat=await lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<2||stat.size>64*1024)fail('STUDIO_HANDOFF_TARGETING_COMPONENT_FILE_REJECTED');
  try{return JSON.parse(await readFile(file,'utf8'));}catch{return fail('STUDIO_HANDOFF_TARGETING_COMPONENT_JSON_REJECTED');}
};

export const createStudioHandoffTargetingComponentSummary=async({directory,readSourceBytes,serverClosed,playwrightOutputRemoved})=>{
  const root=path.resolve(directory);
  const names=(await readdir(root,{withFileTypes:true})).map(entry=>entry.name).sort();
  const expectedNames=resultNames().sort();
  if(!equal(names,expectedNames))fail('STUDIO_HANDOFF_TARGETING_COMPONENT_FILE_SET_REJECTED');
  const results=[];
  for(const pair of expectedPairs())results.push(validateStudioHandoffTargetingComponentFragment(
    await readJsonFile(path.join(root,`${pair.project}-${pair.case}.json`)),pair));
  const bindings=[];
  for(const source of studioHandoffTargetingComponentSourcePaths)bindings.push({source,digest:sha256(await readSourceBytes(source))});
  const core={
    schemaVersion:'studio-handoff-targeting-component-summary-v1',status:'passed',scope:'component-fixture',actorLimitMs:15_000,
    providersEnabled:false,projects:[...STUDIO_HANDOFF_TARGETING_PROJECTS],cases:[...STUDIO_HANDOFF_TARGETING_CASES],testCount:results.length,
    results,network:{guard:'exact-loopback-route-abort',externalAttemptCount:0},
    capture:{trace:'off',screenshot:'off',video:'off'},
    execution:{mode:'vite-dev-component-fixture',buildArtifactUsed:false,playwrightExitCode:0},
    source:{count:bindings.length,digest:sha256(Buffer.from(JSON.stringify(bindings))),bindings},
    cleanup:{serverClosed:serverClosed===true,playwrightOutputRemoved:playwrightOutputRemoved===true},
  };
  const summary={...core,proofDigest:sha256(Buffer.from(JSON.stringify(core)))};
  return validateStudioHandoffTargetingComponentProof(summary,{readSourceBytes});
};

const runChild=(args,env)=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{cwd:process.cwd(),env,stdio:'ignore',windowsHide:true});
  child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));
});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ownedPortHasListener=()=>new Promise((resolve,reject)=>{
  const socket=connect({host:'127.0.0.1',port:4197});
  const timer=setTimeout(()=>{socket.destroy();reject(new Error('STUDIO_HANDOFF_TARGETING_COMPONENT_PORT_PROBE_TIMEOUT'));},1_000);
  socket.once('connect',()=>{clearTimeout(timer);socket.destroy();resolve(true);});
  socket.once('error',error=>{clearTimeout(timer);socket.destroy();if(error?.code==='ECONNREFUSED')resolve(false);else reject(error);});
});
const waitForOwnedServerClose=async()=>{
  const deadline=Date.now()+10_000;
  while(Date.now()<deadline){
    if(!await ownedPortHasListener())return true;
    await sleep(100);
  }
  return false;
};
const pathExists=value=>lstat(value).then(()=>true,()=>false);

export const runStudioHandoffActionTargetingBrowser=async({directory,environment=process.env})=>{
  const root=path.resolve(directory);
  const privateRoot=path.resolve('output/local-private');
  const relative=path.relative(privateRoot,root);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||await pathExists(root))fail('STUDIO_HANDOFF_TARGETING_COMPONENT_OUTPUT_REJECTED');
  if(await ownedPortHasListener())fail('STUDIO_HANDOFF_TARGETING_COMPONENT_PORT_IN_USE');
  await mkdir(root,{recursive:false});
  const playwrightOutput=path.join(root,'playwright-output');
  const diagnosticPath=path.join(root,'failure-diagnostic.json');
  const env={...environment,STUDIO_HANDOFF_TARGETING_RESULT_DIRECTORY:root,STUDIO_PR_B_EXTERNAL_SERVER:'false',
    AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH:diagnosticPath,
    ALLOW_EXTERNAL_AI_PROVIDERS:'false',VITE_AI_EDGE_FUNCTIONS_ENABLED:'false'};
  for(const key of ['OPENAI_API_KEY','AZURE_OPENAI_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','GROQ_API_KEY','COHERE_API_KEY'])delete env[key];
  let commandResult={code:null,signal:null};let serverClosed=false;let playwrightOutputRemoved=false;
  try{
    commandResult=await runChild([
      path.resolve('node_modules/@playwright/test/cli.js'),'test','--config=playwright.studio-pr-b.config.ts',
      '--grep','persisted Studio helper','--output',playwrightOutput,
      '--reporter',path.resolve('scripts/authenticatedHostedPlaywrightReporter.mjs'),
    ],env);
  }finally{
    serverClosed=await waitForOwnedServerClose();
    await rm(playwrightOutput,{recursive:true,force:true});
    playwrightOutputRemoved=!await pathExists(playwrightOutput);
  }
  if(commandResult.code!==0||commandResult.signal!==null||!serverClosed||!playwrightOutputRemoved){
    await writeFile(path.join(root,'failure.json'),`${JSON.stringify({schemaVersion:'studio-handoff-targeting-component-failure-v1',
      status:'failed',playwrightExitCode:commandResult.code,signal:commandResult.signal===null?'none':'present',serverClosed,
      playwrightOutputRemoved,providersEnabled:false},null,2)}\n`,{encoding:'utf8',flag:'wx',mode:0o600});
    fail('STUDIO_HANDOFF_TARGETING_COMPONENT_EXECUTION_FAILED');
  }
  const summary=await createStudioHandoffTargetingComponentSummary({directory:root,readSourceBytes:source=>readFile(path.resolve(source)),serverClosed,playwrightOutputRemoved});
  const summaryPath=studioHandoffTargetingComponentSummaryPath(root);
  await writeFile(summaryPath,`${JSON.stringify(summary,null,2)}\n`,{encoding:'utf8',flag:'wx',mode:0o600});
  return {status:'passed',summaryPath,proofDigest:summary.proofDigest};
};

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const directory=process.env.STUDIO_HANDOFF_TARGETING_RESULT_DIRECTORY;
  if(!directory)fail('STUDIO_HANDOFF_TARGETING_COMPONENT_OUTPUT_REQUIRED');
  const result=await runStudioHandoffActionTargetingBrowser({directory});
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
