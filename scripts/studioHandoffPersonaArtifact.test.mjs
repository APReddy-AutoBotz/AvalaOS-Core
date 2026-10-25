import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { studioHandoffPersonaSourcePaths, verifyStudioHandoffPersonaArtifact } from './studioHandoffPersonaArtifact.mjs';

const releaseSha='a'.repeat(40);
const sha256=value=>`sha256:${createHash('sha256').update(value).digest('hex')}`;
const sourceBytes=new Map(studioHandoffPersonaSourcePaths.map(source=>[source,Buffer.from(`bound:${source}`)]));
const sequence=['author-request','reviewer-review','approver-final-accept','approver-consume-inbox'];
const role=count=>({actualCount:count,requiredCount:count,requiredComplete:true,forbiddenAbsent:true,exact:true});
const browser=project=>({schemaVersion:'studio-handoff-persona-browser-v2',status:'passed',project,
  mode:'actual-chromium-production-ui-production-handlers-disposable-postgresql',fixtureSessionPrimed:true,
  actorSequence:sequence,responseStatuses:{request:201,review:201,finalAccept:201,consume:201},
  directAuthorApproval:{denied:true,status:403,errorCode:'PERMISSION_DENIED',zeroEffects:true,projectionReadRefused:false},
  sourcePackages:{before:0,after:1,delta:1},authorityBoundReadiness:{projectionRoute:'studio_artifact_projection',
    actualResponseFetched:true,legitimateNull:true,exactApproverActor:true,requestCount:1,phaseBeforeCommit:'ready',
    finalAcceptElapsedMs:250,committedBeforeDetailRelease:true,staleDetailDidNotOverwrite:true,
    effects:{approvals:1,receipts:1,audits:1,sourcePackages:0}},
  proofDigest:sha256(Buffer.from(JSON.stringify({actorSequence:sequence,sourcePackageDelta:1}))),actorLimitMs:15_000,
  providersEnabled:false,hostedRun:false,fullAcceptance:false});

const writeFixture=async(root,mutate=()=>{})=>{
  await mkdir(root,{recursive:true});
  const sourceBindings=studioHandoffPersonaSourcePaths.map(source=>({source,digest:sha256(sourceBytes.get(source))}));
  const build={schemaVersion:'studio-handoff-persona-build-proof-v1',releaseSha,status:'passed',fileCount:10,digest:sha256(Buffer.from('build'))};
  const browsers=[browser('desktop-chromium'),browser('pixel-7-chromium')];
  const files={
    'source-bindings.json':{schemaVersion:'studio-handoff-persona-source-bindings-v1',releaseSha,
      sourceCount:sourceBindings.length,sourceDigest:sha256(Buffer.from(JSON.stringify(sourceBindings))),sourceBindings},
    'build-proof.json':build,
    'browser-desktop-chromium.json':browsers[0],
    'browser-pixel-7-chromium.json':browsers[1],
    'result.json':{schemaVersion:'studio-handoff-persona-result-v2',status:'passed',releaseSha,
      exactRoles:{author:role(25),reviewer:role(14),approver:role(18)},
      exactRolesAfterRun:{author:role(25),reviewer:role(14),approver:role(18)},exactRolesStable:true,
      source:{count:sourceBindings.length,digest:sha256(Buffer.from(JSON.stringify(sourceBindings))),unchangedAfterRun:true},
      build:{status:'passed',fileCount:10,digest:build.digest},browserExit:0,browsers,providers:{calls:0,paidCalls:0,egressAttempts:0},
      cleanup:{fixtureClosed:true,observerClosed:true,previewExited:true,buildRemoved:true,playwrightOutputRemoved:true},
      constraints:{actorLimitMs:15_000,providersEnabled:false,hostedRun:false,fullAcceptance:false,tokenRead:false}},
  };
  mutate(files);
  for(const [name,value] of Object.entries(files))await writeFile(path.join(root,name),`${JSON.stringify(value,null,2)}\n`);
};
const readSourceBytes=async source=>sourceBytes.get(source);
const runnerSource=await readFile(new URL('./reproduceStudioHandoffPersonaContract.mjs',import.meta.url),'utf8');
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
    ['provider',files=>{files['result.json'].providers.calls=1;}],
    ['cleanup',files=>{files['result.json'].cleanup.observerClosed=false;}],
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
console.log('studio handoff persona artifact: synthetic contract fixture and 20 observer-isolation, source, project, limit, effect, provider, cleanup, shape and file-boundary assertions passed');
