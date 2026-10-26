import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createStudioHandoffTargetingComponentSummary,
  STUDIO_HANDOFF_TARGETING_CASES,
  STUDIO_HANDOFF_TARGETING_PROJECTS,
  studioHandoffTargetingComponentSourcePaths,
  validateStudioHandoffTargetingComponentProof,
} from './runStudioHandoffActionTargetingBrowser.mjs';

const sha256=value=>`sha256:${createHash('sha256').update(value).digest('hex')}`;
const expectedCounts={
  'exact-target':[2,1],'missing-target':[2,0],'stale-version':[2,0],
  'wrong-mailbox':[0,0],'ineligible-action':[1,1],'duplicate-exact-pair':[2,2],
};
const sourceBytes=new Map(studioHandoffTargetingComponentSourcePaths.map(source=>[source,Buffer.from(`bound:${source}`)]));
sourceBytes.set('playwright.studio-pr-b.config.ts',Buffer.from("use:{baseURL:'http://127.0.0.1:4197',trace:'off',screenshot:'off',video:'off'},webServer:{command: 'node tests/browser/studioPrB/server.mjs',reuseExistingServer:false}"));
sourceBytes.set('tests/browser/studioPrB/server.mjs',Buffer.from("import { createServer } from 'vite'; void createServer({server:{port:4197}});"));
sourceBytes.set('tests/browser/studioPrB/studioPrB.spec.ts',Buffer.from("url.origin==='http://127.0.0.1:4197';page.route('**/*',guard);route.abort('blockedbyclient');page.unroute('**/*',guard);page.setDefaultTimeout(15_000);const targetingStarted=Date.now();const elapsedMs=Date.now()-targetingStarted;expect(elapsedMs).toBeLessThan(15_000);"));
const readSourceBytes=async source=>sourceBytes.get(source);
const runnerSource=await readFile(new URL('./runStudioHandoffActionTargetingBrowser.mjs',import.meta.url),'utf8');
const fragment=(project,sample)=>({
  schemaVersion:'studio-handoff-targeting-component-v1',project,case:sample,
  readyCardCount:expectedCounts[sample][0],matchedCardCount:expectedCounts[sample][1],
  zeroCommands:true,zeroEffects:true,externalAttemptCount:0,elapsedMs:125,status:'passed',actorLimitMs:15_000,providersEnabled:false,
});
const writeFragments=async directory=>{
  await mkdir(directory,{recursive:true});
  for(const project of STUDIO_HANDOFF_TARGETING_PROJECTS)for(const sample of STUDIO_HANDOFF_TARGETING_CASES){
    await writeFile(path.join(directory,`${project}-${sample}.json`),`${JSON.stringify(fragment(project,sample))}\n`);
  }
};
const rebind=value=>{
  const {proofDigest:_proofDigest,...core}=value;
  value.proofDigest=sha256(Buffer.from(JSON.stringify(core)));
  return value;
};

test('component runner owns the fixed fixture server and suppresses raw browser output',()=>{
  assert.match(runnerSource,/STUDIO_PR_B_EXTERNAL_SERVER:'false'/u);
  assert.match(runnerSource,/if\(await ownedPortHasListener\(\)\)fail\('STUDIO_HANDOFF_TARGETING_COMPONENT_PORT_IN_USE'\)/u);
  assert.match(runnerSource,/error\?\.code==='ECONNREFUSED'/u);
  assert.match(runnerSource,/stdio:'ignore'/u);
  assert.doesNotMatch(runnerSource,/stdio:'inherit'/u);
  assert.match(runnerSource,/AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH:diagnosticPath/u);
  assert.match(runnerSource,/path\.resolve\('scripts\/authenticatedHostedPlaywrightReporter\.mjs'\)/u);
  assert.ok(studioHandoffTargetingComponentSourcePaths.includes('scripts/authenticatedHostedPlaywrightReporter.mjs'));
  assert.ok(studioHandoffTargetingComponentSourcePaths.includes('scripts/authenticatedHostedDiagnostics.mjs'));
  assert.ok(studioHandoffTargetingComponentSourcePaths.includes('scripts/eligibleReviewerRequestDiagnostic.mjs'));
});

test('component-fixture summary binds the exact two-project targeting matrix without claiming a production build',async()=>{
  const base=await mkdtemp(path.join(tmpdir(),'studio-handoff-targeting-component-'));
  try{
    const directory=path.join(base,'authentic');await writeFragments(directory);
    const summary=await createStudioHandoffTargetingComponentSummary({directory,readSourceBytes,serverClosed:true,playwrightOutputRemoved:true});
    assert.equal(summary.scope,'component-fixture');
    assert.equal(summary.testCount,12);
    assert.deepEqual(summary.execution,{mode:'vite-dev-component-fixture',buildArtifactUsed:false,playwrightExitCode:0});
    assert.equal(summary.network.externalAttemptCount,0);
    assert.equal(summary.results.find(item=>item.project==='pixel-7'&&item.case==='duplicate-exact-pair')?.matchedCardCount,2);
    assert.equal((await validateStudioHandoffTargetingComponentProof(summary,{readSourceBytes})).proofDigest,summary.proofDigest);
  }finally{await rm(base,{recursive:true,force:true});}
});

test('component-fixture verifier rejects forged targeting, network, capture, source, execution and cleanup proof',async()=>{
  const base=await mkdtemp(path.join(tmpdir(),'studio-handoff-targeting-mutants-'));
  try{
    const directory=path.join(base,'authentic');await writeFragments(directory);
    const authentic=await createStudioHandoffTargetingComponentSummary({directory,readSourceBytes,serverClosed:true,playwrightOutputRemoved:true});
    const cases=[
      value=>{value.scope='disposable-postgresql';},
      value=>{value.actorLimitMs=15_001;},
      value=>{value.providersEnabled=true;},
      value=>{value.projects.reverse();},
      value=>{value.cases.pop();},
      value=>{value.testCount=11;},
      value=>{value.results[0].readyCardCount=1;},
      value=>{value.results[1].matchedCardCount=1;},
      value=>{value.results[2].zeroCommands=false;},
      value=>{value.results[3].zeroEffects=false;},
      value=>{value.results[4].externalAttemptCount=1;},
      value=>{value.results[4].elapsedMs=15_000;},
      value=>{value.results[5].schemaVersion='studio-handoff-targeting-component-v0';},
      value=>{value.network.externalAttemptCount=1;},
      value=>{value.network.guard='declared-only';},
      value=>{value.capture.trace='on';},
      value=>{value.capture.screenshot='only-on-failure';},
      value=>{value.capture.video='retain-on-failure';},
      value=>{value.execution.mode='production-build';},
      value=>{value.execution.buildArtifactUsed=true;},
      value=>{value.execution.playwrightExitCode=1;},
      value=>{value.source.bindings[0].digest=sha256(Buffer.from('forged'));},
      value=>{value.source.count-=1;},
      value=>{value.cleanup.serverClosed=false;},
      value=>{value.cleanup.playwrightOutputRemoved=false;},
    ];
    for(const mutate of cases){
      const value=structuredClone(authentic);mutate(value);rebind(value);
      await assert.rejects(validateStudioHandoffTargetingComponentProof(value,{readSourceBytes}),/COMPONENT_INVALID/u);
    }
    const staleDigest=structuredClone(authentic);staleDigest.results[0].status='failed';
    await assert.rejects(validateStudioHandoffTargetingComponentProof(staleDigest,{readSourceBytes}),/COMPONENT_INVALID/u);
    const redirected=structuredClone(authentic);redirected.source.bindings[0].source='../../untrusted-source';rebind(redirected);
    let untrustedReadAttempted=false;
    await assert.rejects(validateStudioHandoffTargetingComponentProof(redirected,{readSourceBytes:async source=>{
      if(source==='../../untrusted-source')untrustedReadAttempted=true;
      return sourceBytes.get(source);
    }}),/COMPONENT_INVALID/u);
    assert.equal(untrustedReadAttempted,false);
  }finally{await rm(base,{recursive:true,force:true});}
});

test('component-fixture summary rejects missing and extra result files',async()=>{
  const base=await mkdtemp(path.join(tmpdir(),'studio-handoff-targeting-files-'));
  try{
    const missing=path.join(base,'missing');await writeFragments(missing);
    await rm(path.join(missing,'desktop-chrome-missing-target.json'));
    await assert.rejects(createStudioHandoffTargetingComponentSummary({directory:missing,readSourceBytes,serverClosed:true,playwrightOutputRemoved:true}),/FILE_SET_REJECTED/u);
    const extra=path.join(base,'extra');await writeFragments(extra);await writeFile(path.join(extra,'raw.log'),'forbidden');
    await assert.rejects(createStudioHandoffTargetingComponentSummary({directory:extra,readSourceBytes,serverClosed:true,playwrightOutputRemoved:true}),/FILE_SET_REJECTED/u);
  }finally{await rm(base,{recursive:true,force:true});}
});
