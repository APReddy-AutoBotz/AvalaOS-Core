import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import path from 'node:path';
import pg from 'pg';
import { REQUIRED_PERSONA_CAPABILITIES, FORBIDDEN_PERSONA_CAPABILITIES } from './authenticatedHostedControllerAdapters.mjs';
import { validateAuthenticatedHostedPlaywrightDiagnostic } from './authenticatedHostedDiagnostics.mjs';
import { createEnterpriseLifecycleFixture } from './enterpriseLifecyclePostgresFixture.mjs';
import { STUDIO_HANDOFF_TARGETING_CASES, STUDIO_HANDOFF_TARGETING_PROJECTS,
  validateStudioHandoffTargetingComponentFragment } from './runStudioHandoffActionTargetingBrowser.mjs';
import { createStudioHandoffPersonaComponentFailureEvidence, studioHandoffPersonaCleanupKeys,
  studioHandoffPersonaFailureCodes, studioHandoffPersonaProjects, studioHandoffPersonaScenarioMatrix,
  studioHandoffPersonaSourcePaths } from './studioHandoffPersonaArtifact.mjs';

const { Client } = pg;

const root = process.cwd();
const privateRoot = path.resolve(root, 'output/local-private');
const base = path.resolve(process.env.STUDIO_HANDOFF_PERSONA_ATTEMPT ?? '');
if (!process.env.STUDIO_HANDOFF_PERSONA_ATTEMPT || base === privateRoot
  || !base.startsWith(`${privateRoot}${path.sep}`)) {
  throw new Error('STUDIO_HANDOFF_PERSONA_ATTEMPT_REQUIRED');
}
const build = path.join(base, 'build');
const playwrightOutput = path.join(base, 'pw');
const targetingComponentWork = `${base}-targeting-component-work`;
const targetingComponentFailureEvidence = `${base}-targeting-component-failure-evidence`;
if(await access(base).then(()=>true).catch(()=>false))throw new Error('STUDIO_HANDOFF_PERSONA_ATTEMPT_EXISTS');
await mkdir(base, { recursive: false });
const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const sourcePaths = studioHandoffPersonaSourcePaths;
const sourceBindings = [];
for (const source of sourcePaths) sourceBindings.push({ source, digest: sha256(await readFile(path.join(root, source))) });
const sourceDigest = sha256(Buffer.from(JSON.stringify(sourceBindings)));
await writeFile(path.join(base, 'source-bindings.json'), `${JSON.stringify({
  schemaVersion: 'studio-handoff-persona-source-bindings-v1',
  releaseSha: process.env.RELEASE_SHA,
  sourceCount: sourceBindings.length,
  sourceDigest,
  sourceBindings,
}, null, 2)}\n`);

const run = (args, env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
  child.on('error', reject);
  child.on('exit', code => resolve(code));
});
const readBoundJson=async file=>{
  const stat=await lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<2||stat.size>64*1024)throw new Error('STUDIO_HANDOFF_PERSONA_TARGETING_COMPONENT_FAILED');
  return JSON.parse(await readFile(file,'utf8'));
};
const preserveTargetingComponentFailure=async({stage,failureCode})=>{
  await mkdir(targetingComponentFailureEvidence,{recursive:false});
  const preserved=[];
  let componentFailure=null;
  let diagnostic=null;
  const fragments=[];
  try{
    componentFailure=await readBoundJson(path.join(targetingComponentWork,'failure.json'));
    createStudioHandoffPersonaComponentFailureEvidence({stage,failureCode,componentFailure,preservedFiles:[]});
    await writeFile(path.join(targetingComponentFailureEvidence,'failure.json'),`${JSON.stringify(componentFailure,null,2)}\n`,{encoding:'utf8',flag:'wx',mode:0o600});
    preserved.push('failure.json');
  }catch{componentFailure=null;}
  try{
    diagnostic=validateAuthenticatedHostedPlaywrightDiagnostic(
      await readBoundJson(path.join(targetingComponentWork,'failure-diagnostic.json')));
    if(diagnostic){
      await writeFile(path.join(targetingComponentFailureEvidence,'failure-diagnostic.json'),`${JSON.stringify(diagnostic,null,2)}\n`,{encoding:'utf8',flag:'wx',mode:0o600});
      preserved.push('failure-diagnostic.json');
    }
  }catch{}
  for(const project of STUDIO_HANDOFF_TARGETING_PROJECTS)for(const sample of STUDIO_HANDOFF_TARGETING_CASES){
    const name=`${project}-${sample}.json`;
    try{
      const fragment=validateStudioHandoffTargetingComponentFragment(
        await readBoundJson(path.join(targetingComponentWork,name)),{project,case:sample});
      fragments.push(fragment);
      await writeFile(path.join(targetingComponentFailureEvidence,name),`${JSON.stringify(fragment,null,2)}\n`,{encoding:'utf8',flag:'wx',mode:0o600});
      preserved.push(name);
    }catch{}
  }
  preserved.sort();
  const context=createStudioHandoffPersonaComponentFailureEvidence({stage,failureCode,componentFailure,preservedFiles:preserved});
  await writeFile(path.join(targetingComponentFailureEvidence,'context.json'),`${JSON.stringify(context,null,2)}\n`,{encoding:'utf8',flag:'wx',mode:0o600});
  const aggregate={schemaVersion:'studio-handoff-persona-component-failure-aggregate-v1',status:'failed',
    context,diagnostic,fragments};
  await writeFile(path.join(base,'component-failure.json'),`${JSON.stringify(aggregate,null,2)}\n`,{encoding:'utf8',flag:'wx',mode:0o600});
};
const freePort = createServer();
await new Promise(resolve => freePort.listen(0, '127.0.0.1', resolve));
const previewPort = freePort.address().port;
await new Promise(resolve => freePort.close(resolve));

const fixturePortServer=createServer();
await new Promise(resolve=>fixturePortServer.listen(0,'127.0.0.1',resolve));
const fixturePort=fixturePortServer.address().port;
await new Promise(resolve=>fixturePortServer.close(resolve));
const createProjectFixture=project=>createEnterpriseLifecycleFixture({
  databaseUrl:process.env.ENTERPRISE_LIFECYCLE_DATABASE_URL,port:fixturePort,headSha:process.env.RELEASE_SHA,
  runId:`local-studio-handoff-persona-${project}`,runAttempt:1,hostedPersonaRoleParity:true,providersEnabled:false,
});
const createObserver=async fixture=>{
  const databaseUrl=new URL(process.env.ENTERPRISE_LIFECYCLE_DATABASE_URL);databaseUrl.pathname=`/${fixture.databaseName}`;
  const database=new Client({connectionString:databaseUrl.toString()});let databaseConnected=false;
  const token=randomUUID();const portServer=createServer();let server=null;
  try{
    await database.connect();databaseConnected=true;
    await new Promise((resolve,reject)=>{portServer.once('error',reject);portServer.listen(0,'127.0.0.1',resolve);});
    const port=portServer.address().port;await new Promise((resolve,reject)=>portServer.close(error=>error?reject(error):resolve()));
    server=createHttpServer(async(request,response)=>{
    const finish=(status,value)=>{response.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(value));};
    try{
      const url=new URL(request.url,`http://127.0.0.1:${port}`);
      if(request.method!=='POST'||url.pathname!=='/frame'||request.headers['x-local-proof-token']!==token)return finish(403,{error:'OBSERVER_DENIED'});
      let body='';for await(const chunk of request){body+=chunk;if(body.length>1_024)throw new Error('OBSERVER_INPUT_REJECTED');}
      const processLabel=JSON.parse(body).processLabel;
      if(typeof processLabel!=='string'||processLabel.length<1||processLabel.length>240)return finish(400,{error:'OBSERVER_INPUT_REJECTED'});
      const row=(await database.query(`WITH target AS(
        SELECT module.id,module.status FROM public.enterprise_module_handoffs module
        JOIN public.assess_v2_studio_handoffs upstream ON upstream.id=module.upstream_handoff_id
        JOIN public.assess_v2_cases assessed ON assessed.id=upstream.case_id JOIN public.assess_processes process ON process.id=assessed.process_id
        WHERE process.name=$1 AND module.org_id=$2 AND module.workspace_id=$3
      ), project_artifacts AS(
        SELECT artifact.id FROM public.studio_artifact_aggregates artifact
        JOIN public.assess_v2_cases assessed ON assessed.id=artifact.case_id JOIN public.assess_processes process ON process.id=assessed.process_id
        WHERE process.name=$1 AND artifact.org_id=$2 AND artifact.workspace_id=$3
      ) SELECT (SELECT count(*)::int FROM target) handoff_count,(SELECT count(*)::int FROM target WHERE status='approval_ready') approval_ready_count,
        (SELECT count(*)::int FROM target WHERE status='approved') approved_count,
        (SELECT count(*)::int FROM public.enterprise_module_handoff_approval_events item WHERE item.handoff_id IN(SELECT id FROM target)) approvals,
        (SELECT count(*)::int FROM public.enterprise_module_handoff_command_receipts item WHERE item.command_type='handoff.approval.resolve' AND item.resource_id IN(SELECT id FROM target)) approval_receipts,
        (SELECT count(*)::int FROM public.privileged_audit_events item WHERE item.action='handoff.approval.resolve' AND item.resource_id IN(SELECT id FROM target)) approval_audits,
        (SELECT count(*)::int FROM public.studio_artifact_source_packages item WHERE item.artifact_id IN(SELECT id FROM project_artifacts)) source_packages`,
      [processLabel,fixture.ids.organization,fixture.ids.workspace])).rows[0];
      finish(200,{handoffCount:row.handoff_count,approvalReadyCount:row.approval_ready_count,approvedCount:row.approved_count,
        approvals:row.approvals,approvalReceipts:row.approval_receipts,approvalAudits:row.approval_audits,sourcePackages:row.source_packages});
    }catch{finish(500,{error:'OBSERVER_FAILED'});}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
    return{baseUrl:`http://127.0.0.1:${port}`,token,close:async()=>{let failed=false;
      try{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}catch{failed=true;}
      try{await database.end();databaseConnected=false;}catch{failed=true;}return!failed&&!server.listening&&!databaseConnected;}};
  }catch(error){
    if(portServer.listening)await new Promise(resolve=>portServer.close(()=>resolve()));
    if(server?.listening)await new Promise(resolve=>server.close(()=>resolve()));
    if(databaseConnected)try{await database.end();databaseConnected=false;}catch{}
    throw error;
  }
};
const readExactRoles = async fixture => {
  const result = {};
  for (const persona of ['author', 'reviewer', 'approver']) {
    const actorId = fixture.ids[persona];
    const capabilities = (await fixture.db.query(`SELECT capability.capability_key
      FROM organization_members member
      JOIN role_capabilities capability ON capability.role_id=member.role_id
      WHERE member.org_id=$1 AND member.user_id=$2 AND member.status='active'
      ORDER BY capability.capability_key`, [fixture.ids.organization, actorId])).rows.map(row => row.capability_key);
    const required = REQUIRED_PERSONA_CAPABILITIES[persona];
    const forbidden = FORBIDDEN_PERSONA_CAPABILITIES[persona];
    result[persona] = {
      actualCount: capabilities.length,
      requiredCount: required.length,
      requiredComplete: required.every(capability => capabilities.includes(capability)),
      forbiddenAbsent: forbidden.every(capability => !capabilities.includes(capability)),
      exact: capabilities.length === required.length
        && required.every(capability => capabilities.includes(capability))
        && forbidden.every(capability => !capabilities.includes(capability)),
    };
  }
  return result;
};
const sanitizedFailureCode = error => {
  const code = error instanceof Error ? error.message : '';
  return studioHandoffPersonaFailureCodes.includes(code) ? code : 'STUDIO_HANDOFF_PERSONA_RUNNER_FAILED';
};
const projects=studioHandoffPersonaProjects;
const cases=studioHandoffPersonaScenarioMatrix.map(({project,scenario})=>({project,scenario,key:`${project}-${scenario}`}));
const exactRoles = {};
let exactRolesAfterRun = {};
let exactRolesStable = true;
let env;
let preview;
let browserExit = null;
let fixtureClosed = false;
let observerClosed = false;
let previewExited = false;
let buildRemoved = false;
let playwrightOutputRemoved = false;
let sourceUnchanged = false;
let targetingComponentWorkRemoved = false;
let targetingComponentProof = null;
let browserResults = [];
let buildProof = { status: 'not_run' };
let status = 'setup_failed';
let failureCode = null;
let failureStage = null;
let executionStage = 'targeting-component-preparation';
let activeFixture=null;
let activeObserver=null;
const projectIsolation=[];
const providers={calls:0,paidCalls:0,egressAttempts:0};
const accountedFixtures=new WeakSet();
let fixtureCreateCount=0,fixtureCloseCount=0,observerCreateCount=0,observerCloseCount=0;
const captureProviders=fixture=>{if(!fixture||accountedFixtures.has(fixture))return;accountedFixtures.add(fixture);
  providers.calls+=fixture.evidence.providerEffects.calls;providers.paidCalls+=fixture.evidence.providerEffects.paidCalls;providers.egressAttempts+=fixture.evidence.providerEffects.egressAttempts;};
try {
  const targetingComponentExit=await run(['scripts/runStudioHandoffActionTargetingBrowser.mjs'],{
    ...process.env,STUDIO_HANDOFF_TARGETING_RESULT_DIRECTORY:targetingComponentWork,
  });
  if(targetingComponentExit!==0)throw new Error('STUDIO_HANDOFF_PERSONA_TARGETING_COMPONENT_FAILED');
  const targetingComponentBytes=await readFile(path.join(targetingComponentWork,'summary.json'));
  targetingComponentProof=JSON.parse(targetingComponentBytes.toString('utf8'));
  if(targetingComponentProof.schemaVersion!=='studio-handoff-targeting-component-summary-v1'
    ||targetingComponentProof.status!=='passed')throw new Error('STUDIO_HANDOFF_PERSONA_TARGETING_COMPONENT_FAILED');
  await writeFile(path.join(base,'targeting-component-proof.json'),targetingComponentBytes);
  await rm(targetingComponentWork,{recursive:true,force:false});
  targetingComponentWorkRemoved=!(await access(targetingComponentWork).then(()=>true).catch(()=>false));
  if(!targetingComponentWorkRemoved)throw new Error('STUDIO_HANDOFF_PERSONA_TARGETING_COMPONENT_CLEANUP_FAILED');
  executionStage='postgresql-fixture-preparation';
  activeFixture=await createProjectFixture(cases[0].key);
  fixtureCreateCount+=1;
  const expectedFixtureBase=`http://127.0.0.1:${fixturePort}`;
  if(activeFixture.baseUrl!==expectedFixtureBase)throw new Error('STUDIO_HANDOFF_PERSONA_FIXTURE_ISOLATION_REJECTED');
  env={...process.env,VITE_AVALA_RUNTIME_MODE:'pilot',VITE_SUPABASE_URL:expectedFixtureBase,
    VITE_SUPABASE_ANON_KEY:activeFixture.publicAnonKey,VITE_AI_EDGE_FUNCTIONS_ENABLED:'false'};
  executionStage='production-build';
  if (await run(['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.enterprise-lifecycle-acceptance.config.ts', '--outDir', build], env) !== 0) {
    throw new Error('STUDIO_HANDOFF_PERSONA_BUILD_FAILED');
  }
  const files = [];
  const visit = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else files.push({ path: path.relative(build, absolute).replaceAll('\\', '/'), digest: sha256(await readFile(absolute)) });
    }
  };
  await visit(build);
  files.sort((left, right) => left.path.localeCompare(right.path));
  buildProof = { status: 'passed', fileCount: files.length, digest: sha256(Buffer.from(JSON.stringify(files))) };
  await writeFile(path.join(base, 'build-proof.json'), `${JSON.stringify({
    schemaVersion: 'studio-handoff-persona-build-proof-v1',
    releaseSha: process.env.RELEASE_SHA,
    ...buildProof,
  }, null, 2)}\n`);

  executionStage='local-preview';
  preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--config', 'vite.enterprise-lifecycle-acceptance.config.ts', '--host', '127.0.0.1', '--port', String(previewPort), '--outDir', build], { cwd: root, env, windowsHide: true, stdio: 'ignore' });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { ready = (await fetch(`http://127.0.0.1:${previewPort}`, { signal: AbortSignal.timeout(1_000) })).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('STUDIO_HANDOFF_PERSONA_PREVIEW_NOT_READY');

  executionStage='postgresql-browser';
  const projectExits=[];
  for(let index=0;index<cases.length;index+=1){
    const {project,scenario,key}=cases[index];
    if(index>0){activeFixture=await createProjectFixture(key);fixtureCreateCount+=1;if(activeFixture.baseUrl!==expectedFixtureBase)throw new Error('STUDIO_HANDOFF_PERSONA_FIXTURE_ISOLATION_REJECTED');}
    const isolationPath=path.join(base,`artifact-isolation-${project}.json`);
    if(scenario==='artifact-unavailable'&&await access(isolationPath).then(()=>true).catch(()=>false))throw new Error('STUDIO_HANDOFF_PERSONA_FIXTURE_ISOLATION_REJECTED');
    if(scenario==='held-null-control'){
      const isolation=JSON.parse(await readFile(isolationPath,'utf8'));
      if(isolation.schemaVersion!=='studio-artifact-read-isolation-browser-v1'||isolation.project!==project||isolation.actorLimitMs!==15_000||isolation.providersEnabled!==false)throw new Error('STUDIO_HANDOFF_PERSONA_FIXTURE_ISOLATION_REJECTED');
    }
    let projectObserverCreated=false,projectObserverClosed=false,projectFixtureClosed=false,projectExit=null;
    try{
      const beforeRoles=await readExactRoles(activeFixture);
      if(Object.values(beforeRoles).some(role=>!role.exact))throw new Error('STUDIO_HANDOFF_PERSONA_ROLE_PARITY_REJECTED');
      if(index===0)Object.assign(exactRoles,beforeRoles);
      else if(JSON.stringify(beforeRoles)!==JSON.stringify(exactRoles))throw new Error('STUDIO_HANDOFF_PERSONA_ROLE_PARITY_REJECTED');
      activeObserver=await createObserver(activeFixture);observerCreateCount+=1;projectObserverCreated=true;
      projectExit=await run(['node_modules/@playwright/test/cli.js','test','--config=scripts/playwright.studio-handoff-persona-contract.config.ts',`--project=${project}`],{
        ...env,ENTERPRISE_LIFECYCLE_APP_BASE_URL:`http://127.0.0.1:${previewPort}`,
        ENTERPRISE_LIFECYCLE_API_BASE_URL:activeFixture.baseUrl,ENTERPRISE_LIFECYCLE_CONTROL_TOKEN:activeFixture.controlToken,
        ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY:activeFixture.authStorageKey,ENTERPRISE_LIFECYCLE_AUTHENTICATED:'true',
        ENTERPRISE_LIFECYCLE_HOSTED_PERSONA_ROLE_PARITY:'true',STUDIO_HANDOFF_PERSONA_RESULT_DIRECTORY:base,
        STUDIO_HANDOFF_PERSONA_SCENARIO:scenario,
        STUDIO_HANDOFF_PERSONA_PLAYWRIGHT_OUTPUT_DIRECTORY:path.join(playwrightOutput,key),
        AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH:path.join(base,`browser-failure-${project}.json`),
        STUDIO_HANDOFF_PERSONA_OBSERVER_BASE_URL:activeObserver.baseUrl,STUDIO_HANDOFF_PERSONA_OBSERVER_TOKEN:activeObserver.token,
      });
      projectExits.push(projectExit);
      if(projectExit!==0)throw new Error('STUDIO_HANDOFF_PERSONA_PROJECT_FAILED');
      if(scenario==='held-null-control'){
        const prior=JSON.parse(await readFile(path.join(base,`browser-${project}.json`),'utf8'));
        const targeting=JSON.parse(await readFile(path.join(base,`targeting-${project}.json`),'utf8'));
        const componentProject=project==='desktop-chromium'?'desktop-chrome':'pixel-7';
        const duplicate=targetingComponentProof.results.find(result=>
          result.project===componentProject&&result.case==='duplicate-exact-pair');
        if(!duplicate||duplicate.zeroCommands!==true||duplicate.zeroEffects!==true
          ||duplicate.externalAttemptCount!==0)throw new Error('STUDIO_HANDOFF_PERSONA_TARGETING_COMPONENT_FAILED');
        const exactTargeting={...targeting,
          singleCardControl:{passed:prior.status==='passed',elapsedMs:prior.authorityBoundReadiness?.finalAcceptElapsedMs},
          negativeCases:{...targeting.negativeCases,duplicateExactPair:{zeroCommands:true,zeroEffects:true,
            scope:'component-fixture',proofDigest:targetingComponentProof.proofDigest}},
        };
        const proofDigest=sha256(Buffer.from(JSON.stringify({actorSequence:prior.actorSequence,
          sourcePackageDelta:1,exactTargeting})));
        const current={...prior,schemaVersion:'studio-handoff-persona-browser-v4',exactTargeting,proofDigest};
        await writeFile(path.join(base,`browser-${project}.json`),`${JSON.stringify(current,null,2)}\n`);
        browserResults.push(current);
        await rm(path.join(base,`targeting-${project}.json`),{force:false});
        await rm(isolationPath,{force:false});
      }
      const afterRoles=await readExactRoles(activeFixture);
      if(JSON.stringify(afterRoles)!==JSON.stringify(beforeRoles)||Object.values(afterRoles).some(role=>!role.exact)){
        exactRolesStable=false;throw new Error('STUDIO_HANDOFF_PERSONA_ROLE_PARITY_CHANGED');
      }
      exactRolesAfterRun=afterRoles;
    }finally{
      captureProviders(activeFixture);
      if(activeObserver){projectObserverClosed=await activeObserver.close();if(projectObserverClosed)observerCloseCount+=1;activeObserver=null;}
      if(activeFixture){projectFixtureClosed=await activeFixture.close();if(projectFixtureClosed)fixtureCloseCount+=1;activeFixture=null;}
      projectIsolation.push({project,scenario,browserExit:projectExit,observerCreated:projectObserverCreated,observerClosed:projectObserverClosed,fixtureCreated:true,fixtureClosed:projectFixtureClosed});
      if(!projectObserverClosed||!projectFixtureClosed)throw new Error('STUDIO_HANDOFF_PERSONA_PROJECT_CLEANUP_FAILED');
    }
  }
  browserExit=projectExits.every(value=>value===0)?0:(projectExits.find(value=>value!==0)??1);
  exactRolesStable=exactRolesStable&&JSON.stringify(exactRolesAfterRun)===JSON.stringify(exactRoles);
  fixtureClosed=projectIsolation.length===cases.length&&projectIsolation.every(item=>item.fixtureClosed);
  observerClosed=projectIsolation.length===cases.length&&projectIsolation.every(item=>item.observerClosed);
  status = browserExit === 0 && browserResults.length===projects.length && browserResults.every(result => result.schemaVersion==='studio-handoff-persona-browser-v4'
    && result.status === 'passed' && result.authorityBoundReadiness?.committedBeforeDetailRelease===true
    && result.authorityBoundReadiness?.staleDetailDidNotOverwrite===true
    && result.artifactReadIsolation?.finalAcceptStatus===201
    && result.artifactReadIsolation?.artifactMutationBlocked===true) ? 'passed' : 'failed';
} catch (error) {
  failureStage = executionStage;
  const closedCode=sanitizedFailureCode(error);
  failureCode = executionStage==='targeting-component-preparation'
    ? (closedCode==='STUDIO_HANDOFF_PERSONA_TARGETING_COMPONENT_CLEANUP_FAILED'
      ? closedCode : 'STUDIO_HANDOFF_PERSONA_TARGETING_COMPONENT_FAILED')
    : closedCode;
  status = 'failed';
} finally {
  executionStage='finalization';
  if (preview) {
    preview.kill('SIGTERM');
    await Promise.race([new Promise(resolve => preview.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5_000))]);
    previewExited = preview.exitCode !== null || preview.signalCode !== null;
  }
  captureProviders(activeFixture);
  if(activeObserver){const closed=await activeObserver.close();if(closed)observerCloseCount+=1;projectIsolation.push({project:'active-failure',browserExit:null,observerCreated:true,observerClosed:closed,fixtureCreated:Boolean(activeFixture),fixtureClosed:false});activeObserver=null;}
  if(activeFixture){const closed=await activeFixture.close();if(closed)fixtureCloseCount+=1;const last=projectIsolation.at(-1);if(last?.project==='active-failure')last.fixtureClosed=closed;else projectIsolation.push({project:'active-failure',browserExit:null,observerCreated:false,observerClosed:true,fixtureCreated:true,fixtureClosed:closed});activeFixture=null;}
  if(failureStage==='targeting-component-preparation'){
    await preserveTargetingComponentFailure({stage:failureStage,failureCode});
  }
  if(await access(targetingComponentWork).then(()=>true).catch(()=>false)){
    await rm(targetingComponentWork,{recursive:true,force:true});
  }
  targetingComponentWorkRemoved=!(await access(targetingComponentWork).then(()=>true).catch(()=>false));
  fixtureClosed=fixtureCreateCount===fixtureCloseCount;
  observerClosed=observerCreateCount===observerCloseCount;
  if (path.dirname(build) !== base) throw new Error('STUDIO_HANDOFF_PERSONA_BUILD_PATH_REJECTED');
  await rm(build, { recursive: true, force: true });
  buildRemoved = !(await access(build).then(() => true).catch(() => false));
  if (path.dirname(playwrightOutput) !== base) throw new Error('STUDIO_HANDOFF_PERSONA_PLAYWRIGHT_PATH_REJECTED');
  await rm(playwrightOutput, { recursive: true, force: true });
  playwrightOutputRemoved = !(await access(playwrightOutput).then(() => true).catch(() => false));
  const finalSourceBindings = [];
  for (const source of sourcePaths) finalSourceBindings.push({ source, digest: sha256(await readFile(path.join(root, source))) });
  sourceUnchanged = JSON.stringify(finalSourceBindings) === JSON.stringify(sourceBindings);
  const providersZero = providers.calls === 0 && providers.paidCalls === 0 && providers.egressAttempts === 0;
  const cleanupState={fixtureClosed,observerClosed,previewExited,buildRemoved,playwrightOutputRemoved,targetingComponentWorkRemoved};
  const cleanup=Object.fromEntries(studioHandoffPersonaCleanupKeys.map(key=>[key,cleanupState[key]]));
  const cleanupPassed = studioHandoffPersonaCleanupKeys.every(key=>cleanup[key]===true);
  status = status === 'passed' && sourceUnchanged && providersZero && cleanupPassed ? 'passed' : 'failed';
  const result = {
    schemaVersion: 'studio-handoff-persona-result-v4',
    status,
    ...(failureCode ? { failureCode } : {}),
    ...(failureStage ? { failureStage } : {}),
    releaseSha: process.env.RELEASE_SHA,
    exactRoles,
    exactRolesAfterRun,
    exactRolesStable,
    scenarioIsolation:{fixturesCreated:fixtureCreateCount,fixturesClosed:fixtureCloseCount,observersCreated:observerCreateCount,observersClosed:observerCloseCount,cases:projectIsolation},
    source: { count: sourceBindings.length, digest: sourceDigest, unchangedAfterRun: sourceUnchanged },
    build: buildProof,
    browserExit,
    browsers: browserResults,
    providers,
    cleanup,
    constraints: { actorLimitMs: 15_000, providersEnabled: false, hostedRun: false, fullAcceptance: false, tokenRead: false },
  };
  await writeFile(path.join(base, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(`${base}-project-isolation.json`,`${JSON.stringify({schemaVersion:'studio-handoff-persona-project-isolation-v1',
    fixtureCreateCount,fixtureCloseCount,observerCreateCount,observerCloseCount,projects:projectIsolation},null,2)}\n`);
  process.stdout.write(`${JSON.stringify({ status, browserExit, providers, cleanup: result.cleanup })}\n`);
}

if (status !== 'passed') process.exitCode = 1;
