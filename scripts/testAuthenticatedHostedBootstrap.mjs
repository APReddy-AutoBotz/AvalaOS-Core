import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { createAuthenticatedHostedIdentityAdapter } from './authenticatedHostedControllerAdapters.mjs';
import { authenticatedHostedFixtureIdentity } from './authenticatedHostedFixtureIdentity.mjs';
import { runAuthenticatedHostedAcceptance, runAuthenticatedHostedChild } from './runAuthenticatedHostedAcceptance.mjs';
import { validateAuthenticatedHostedRunDiagnostic } from './authenticatedHostedDiagnostics.mjs';

const execFileAsync=promisify(execFile);
const digest=value=>`sha256:${createHash('sha256').update(value).digest('hex')}`;
const projectRef='abcdefghijklmnopqrst';
const release='a'.repeat(40);
const sensitive='fixture-sensitive-bootstrap-canary';
const environment={
  ...Object.fromEntries(['PATH','Path','HOME','USERPROFILE','LOCALAPPDATA','APPDATA','SystemRoot','SYSTEMROOT','ComSpec',
    'PATHEXT','TEMP','TMP','TMPDIR','PLAYWRIGHT_BROWSERS_PATH','LANG','LC_ALL'].flatMap(key=>process.env[key]?[ [key,process.env[key]] ]:[])),
  GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'APReddy-AutoBotz/AvalaOS-Core',
  GITHUB_WORKFLOW_REF:'APReddy-AutoBotz/AvalaOS-Core/.github/workflows/authenticated-product-acceptance.yml@refs/heads/main',
  GITHUB_JOB:'hosted-authenticated',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',RELEASE_SHA:release,GITHUB_SHA:release,
  HOSTED_PILOT_URL:'https://avalaos-pilot.netlify.app',NETLIFY_DEPLOY_ID:'b'.repeat(24),
  AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND:'hosted_authenticated_synthetic',AUTHENTICATED_ACCEPTANCE_AUTH_KIND:'supabase_auth',
  AUTHENTICATED_ACCEPTANCE_SUPABASE_URL:`https://${projectRef}.supabase.co`,
  AUTHENTICATED_ACCEPTANCE_EXPECTED_PROJECT_REF:projectRef,AUTHENTICATED_ACCEPTANCE_TARGET_PUBLIC_DIGEST:digest('target'),
  AUTHENTICATED_ACCEPTANCE_SUPABASE_SERVICE_ROLE_KEY:`${sensitive}-service-role-key-value-longer-than-thirty-two`,
  AUTHENTICATED_ACCEPTANCE_DATABASE_URL:`postgresql://postgres:${sensitive}@db.${projectRef}.supabase.co:5432/postgres?sslmode=verify-full`,
  AUTHENTICATED_ACCEPTANCE_BACKEND_DIGEST:digest('backend'),AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION:'20261019161723',
  AUTHENTICATED_ACCEPTANCE_MIGRATION_DIGEST:digest('migration'),AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST:digest('exercise'),
  AUTHENTICATED_ACCEPTANCE_CATALOG_DIGEST:digest('catalog'),AUTHENTICATED_ACCEPTANCE_SOURCE_DIGEST:digest('source'),
  AUTHENTICATED_ACCEPTANCE_BASELINE_DIGEST:digest('baseline'),AUTHENTICATED_ACCEPTANCE_SYNTHETIC_ONLY:'true',
  AUTHENTICATED_ACCEPTANCE_PRODUCTION:'false',AUTHENTICATED_ACCEPTANCE_CUSTOMER_DATA:'false',
  AUTHENTICATED_ACCEPTANCE_PROVIDERS_ENABLED:'false',AUTHENTICATED_ACCEPTANCE_PAID_CALLS:'false',
  AUTHENTICATED_ACCEPTANCE_SECRET_BACKEND:'supabase_vault',AVALA_PROVIDER_SECRET_BACKEND:'supabase_vault',
  AUTHENTICATED_ACCEPTANCE_SUPABASE_MANAGEMENT_TOKEN:`${sensitive}-management`,NODE_OPTIONS:`--require=${sensitive}`,
  AUTHENTICATED_ACCEPTANCE_SCOPE:JSON.stringify({organizationId:'11111111-1111-4111-8111-111111111111',
    workspaceId:'22222222-2222-4222-8222-222222222222',roleIds:{author:'33333333-3333-4333-8333-333333333333',
      reviewer:'44444444-4444-4444-8444-444444444444',approver:'55555555-5555-4555-8555-555555555555',
      outsider:'66666666-6666-4666-8666-666666666666',
      deliveryOwner:'77777777-7777-4777-8777-777777777777'}}),
};
const validPreflight={syntheticTarget:true,production:false,releaseSha:release,deploymentId:environment.NETLIFY_DEPLOY_ID,
  migrationVersion:environment.AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION,backendDigest:environment.AUTHENTICATED_ACCEPTANCE_BACKEND_DIGEST,
  providersEnabled:false,runtimeReady:true,secretBackendKind:'supabase_vault',secretBackendWritable:true,
  publicTargetDigest:environment.AUTHENTICATED_ACCEPTANCE_TARGET_PUBLIC_DIGEST,
  baselineDigest:environment.AUTHENTICATED_ACCEPTANCE_BASELINE_DIGEST,customerRows:0,unapprovedActiveResidue:0,scopeReady:true,observationStartedAt:'2026-10-13T00:00:00.000Z'};

const root=await mkdtemp(path.join(os.tmpdir(),'authenticated-bootstrap-test-'));
const browserWorkspace=await mkdtemp(path.join(os.tmpdir(),'authenticated-hosted-browser-'));
const outputPaths={browser:path.join(root,'browser.json'),server:path.join(root,'server.json'),
  binding:path.join(root,'binding.json'),diagnostic:path.join(root,'diagnostic.json')};
const calls=[];let authCreateRequests=0;let projectSetup=0;
let positiveBrowserWorkspace;
try{
  await writeFile(outputPaths.diagnostic,JSON.stringify({raw:sensitive}));
  const before=(await execFileAsync('git',['status','--porcelain=v1','--untracked-files=all'],{encoding:'utf8'})).stdout;
  let caught;
  try{
    await runAuthenticatedHostedAcceptance(environment,{
      outputPaths,database:{},verifyCheckout:async()=>calls.push('checkout'),
      createBrowserWorkspace:async()=>browserWorkspace,
      createPostgresAdapter:()=>({preflight:async()=>validPreflight,activate:async()=>calls.push('activate'),
        setupProject:async()=>{projectSetup+=1;throw new Error('PROJECT_SETUP_MUST_NOT_RUN');},
        quiesce:async()=>calls.push('quiesce'),cleanup:async()=>calls.push('cleanup'),
        verifyCleanup:async()=>({activeSessions:0,activeIdentities:0,activeMemberships:0,armedPermits:0,
          activeSecretMaterial:0,unapprovedActiveResidue:0,nonExerciseChanged:false,immutableHistoryPreserved:true})}),
      createIdentityAdapter:({config,db})=>{
        const identity=createAuthenticatedHostedIdentityAdapter({config,db,fetchImpl:async(url,init)=>{
          authCreateRequests+=1;
          assert.equal(url,`https://${projectRef}.supabase.co/auth/v1/admin/users`);
          assert.equal(init.method,'POST');
          return {ok:false,status:400,json:async()=>({error_code:'email_address_invalid',message:sensitive})};
        }});
        return {...identity,created:identity.created,revokeAll:async input=>{calls.push('revoke');return identity.revokeAll(input);}};
      },
      runPlaywright:(command,args,options)=>runAuthenticatedHostedChild(command,[...args,'--project=desktop-chromium'],options,
        {timeoutMs:60_000,diagnosticPath:options.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH}),
    });
  }catch(error){caught=error;}
  assert.equal(caught?.message,'AUTHENTICATED_HOSTED_RUNNER_BROWSER_EXIT_NONZERO');
  assert.equal(caught?.authenticatedHostedDiagnosticWriteFailed,undefined,
    `safe diagnostic write failed: ${caught?.authenticatedHostedDiagnosticWriteCategory??'unknown'}`);
  const raw=await readFile(outputPaths.diagnostic,'utf8');
  assert.equal(raw.includes(sensitive),false);
  const diagnostic=validateAuthenticatedHostedRunDiagnostic(JSON.parse(raw));
  assert.ok(diagnostic);
  assert.deepEqual(diagnostic.failure,{phase:'BROWSER_EXECUTION',category:'EXIT_NONZERO'});
  assert.deepEqual(diagnostic.primary,diagnostic.failure);
  const {location,...childDiagnostic}=diagnostic.child;
  assert.deepEqual(childDiagnostic,{schemaVersion:'authenticated-hosted-playwright-diagnostic-v1',
    project:'desktop-chromium',testCategory:'project-bootstrap',category:'unexpected-failure',
    phase:'CONTROL_CHANNEL',code:'CONTROL_REJECTED'});
  assert.equal(location?.source,'tests/browser/authenticatedLifecycleHarness.ts');
  assert.equal(Number.isSafeInteger(location?.line)&&location.line>0,true);
  assert.equal(authCreateRequests,1);
  assert.equal(projectSetup,0);
  assert.deepEqual(diagnostic.identity,{source:'parent',operation:'PROVISION',category:'IDENTITY_INPUT_REJECTED',
    upstreamCode:'email_address_invalid'});
  assert.deepEqual(diagnostic.cleanup,{status:'verified'});
  assert.deepEqual(calls,['checkout','activate','quiesce','revoke','cleanup']);
  for(const accepted of [outputPaths.browser,outputPaths.server,outputPaths.binding]){
    await assert.rejects(access(accepted));
  }
  await assert.rejects(access(browserWorkspace));

  const positiveOutputPaths={browser:path.join(root,'positive-browser.json'),server:path.join(root,'positive-server.json'),
    binding:path.join(root,'positive-binding.json'),diagnostic:path.join(root,'positive-diagnostic.json')};
  positiveBrowserWorkspace=await mkdtemp(path.join(os.tmpdir(),'authenticated-hosted-browser-'));
  assert.equal(path.dirname(positiveBrowserWorkspace),path.resolve(os.tmpdir()));
  const proxyRejections=[];
  const rejectingProxy=createServer((_request,response)=>{
    proxyRejections.push('HTTP');
    response.writeHead(502,{connection:'close'});response.end();
  });
  rejectingProxy.on('connect',(_request,socket)=>{
    proxyRejections.push('CONNECT');
    socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
  });
  await new Promise((resolve,reject)=>{
    rejectingProxy.once('error',reject);
    rejectingProxy.listen(0,'127.0.0.1',resolve);
  });
  const proxyAddress=rejectingProxy.address();
  assert.ok(proxyAddress&&typeof proxyAddress!=='string');
  const proxyUrl=`http://127.0.0.1:${proxyAddress.port}`;
  const wrapperConfig=path.join(root,'playwright.bootstrap.config.mjs');
  const identities=Object.freeze({
    author:Object.freeze({id:'71000000-0000-4000-8000-000000000001',email:'author.desktop@local.invalid',password:'synthetic-author-password'}),
    reviewer:Object.freeze({id:'71000000-0000-4000-8000-000000000002',email:'reviewer.desktop@local.invalid',password:'synthetic-reviewer-password'}),
    approver:Object.freeze({id:'71000000-0000-4000-8000-000000000003',email:'approver.desktop@local.invalid',password:'synthetic-approver-password'}),
    outsider:Object.freeze({id:'71000000-0000-4000-8000-000000000004',email:'outsider.desktop@local.invalid',password:'synthetic-outsider-password'}),
    deliveryOwner:Object.freeze({id:'71000000-0000-4000-8000-000000000005',email:'delivery-owner.desktop@local.invalid',password:'synthetic-delivery-owner-password'}),
  });
  const positiveLifecycle=[];
  let positiveSetupCount=0;
  let positiveCaught;
  try{
    await runAuthenticatedHostedAcceptance(environment,{
      outputPaths:positiveOutputPaths,database:{},verifyCheckout:async()=>positiveLifecycle.push('checkout'),
      createBrowserWorkspace:async()=>positiveBrowserWorkspace,
      createPostgresAdapter:({config})=>({
        preflight:async()=>validPreflight,activate:async()=>positiveLifecycle.push('activate'),
        setupProject:async({projectName,exerciseId})=>{
          positiveSetupCount+=1;
          const labels=authenticatedHostedFixtureIdentity({runId:config.workflow.runId,
            attempt:config.workflow.attempt,exerciseId,projectName});
          return {projectName,processId:'72000000-0000-4000-8000-000000000001',
            studioTemplate:{kind:'system',artifactType:'brd',
              templateVersionId:'74000000-0000-4000-8000-000000000001',version:'studio-brd-1'},
            projectId:'73000000-0000-4000-8000-000000000001',
            deliveryProject:{id:'73000000-0000-4000-8000-000000000001',name:'AP Invoice Exception Workflow'},
            aliases:{case:'primary-case-1',review:'primary-review-1',handoff:'primary-handoff-1',
              artifact:'primary-artifact-1',process:`${projectName} prerequisite process`,
              canonicalProcess:`AP Invoice Exception Handling ${labels.suffix}`}};
        },
        quiesce:async()=>positiveLifecycle.push('quiesce'),cleanup:async()=>positiveLifecycle.push('cleanup'),
        verifyCleanup:async()=>({activeSessions:0,activeIdentities:0,activeMemberships:0,armedPermits:0,
          activeSecretMaterial:0,unapprovedActiveResidue:0,nonExerciseChanged:false,immutableHistoryPreserved:true}),
      }),
      createIdentityAdapter:()=>({created:new Map(),provisionProject:async()=>identities,
        revokeAll:async()=>positiveLifecycle.push('revoke')}),
      runPlaywright:async(command,args,options)=>{
        assert.equal(options.env.ENTERPRISE_LIFECYCLE_HOSTED_REAL_AUTH,'true');
        assert.equal(Object.hasOwn(options.env,'AUTHENTICATED_HOSTED_BOOTSTRAP_TEST'),false);
        const actualConfig=pathToFileURL(path.resolve('playwright.authenticated-hosted.config.ts')).href;
        const absoluteTestDir=path.resolve('tests/browser/enterpriseLifecycleAcceptance');
        const absoluteReporter=path.resolve('scripts/authenticatedHostedPlaywrightReporter.mjs');
        await writeFile(wrapperConfig,`import base from ${JSON.stringify(actualConfig)};\n`
          +`const proxy={server:${JSON.stringify(proxyUrl)},bypass:'<-loopback>'};\n`
          +`export default {...base,testDir:${JSON.stringify(absoluteTestDir)},`
          +`reporter:[[${JSON.stringify(absoluteReporter)}]],use:{...base.use,proxy},`
          +`projects:base.projects.map(project=>({...project,use:{...project.use,proxy}}))};\n`);
        const wrappedArgs=args.map(value=>value.startsWith('--config=')?`--config=${wrapperConfig}`:value);
        await runAuthenticatedHostedChild(command,[...wrappedArgs,'--project=desktop-chromium'],options,
          {timeoutMs:60_000,diagnosticPath:options.env.AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH});
      },
    });
  }catch(error){positiveCaught=error;}
  finally{await new Promise((resolve,reject)=>rejectingProxy.close(error=>error?reject(error):resolve()));}
  const positiveDiagnostic=validateAuthenticatedHostedRunDiagnostic(JSON.parse(
    await readFile(positiveOutputPaths.diagnostic,'utf8')));
  assert.ok(positiveDiagnostic);
  const positiveAcceptedPresent=[];
  for(const accepted of [positiveOutputPaths.browser,positiveOutputPaths.server,positiveOutputPaths.binding]){
    if(await access(accepted).then(()=>true).catch(()=>false))positiveAcceptedPresent.push(path.basename(accepted));
  }
  const positiveWorkspacePresent=await access(positiveBrowserWorkspace).then(()=>true).catch(()=>false);
  console.log(JSON.stringify({status:'bounded-bootstrap-probe',project:positiveDiagnostic.child?.project,
    testCategory:positiveDiagnostic.child?.testCategory,location:positiveDiagnostic.child?.location??null,
    cleanup:positiveDiagnostic.cleanup.status,proxyRejections:proxyRejections.length,
    setupCount:positiveSetupCount,acceptedManifestCount:positiveAcceptedPresent.length,
    browserWorkspacePresent:positiveWorkspacePresent}));
  assert.equal(positiveCaught?.message,'AUTHENTICATED_HOSTED_RUNNER_BROWSER_EXIT_NONZERO');
  assert.deepEqual(positiveDiagnostic.failure,{phase:'BROWSER_EXECUTION',category:'EXIT_NONZERO'});
  assert.deepEqual(positiveDiagnostic.primary,positiveDiagnostic.failure);
  assert.equal(positiveDiagnostic.child?.project,'desktop-chromium');
  assert.equal(positiveDiagnostic.child?.testCategory,'primary-lifecycle');
  assert.equal(positiveDiagnostic.child?.category,'unexpected-failure');
  assert.equal(positiveDiagnostic.child?.location?.source,'tests/browser/authenticatedLifecycleHarness.ts');
  assert.equal(Number.isSafeInteger(positiveDiagnostic.child?.location?.line)
    && positiveDiagnostic.child.location.line>0,true);
  assert.equal(proxyRejections.length>0,true);
  assert.equal(positiveSetupCount,1);
  assert.deepEqual(positiveLifecycle,['checkout','activate','quiesce','revoke','cleanup']);
  assert.deepEqual(positiveDiagnostic.cleanup,{status:'verified'});
  assert.deepEqual(positiveAcceptedPresent,[]);
  assert.equal(positiveWorkspacePresent,false);
  const after=(await execFileAsync('git',['status','--porcelain=v1','--untracked-files=all'],{encoding:'utf8'})).stdout;
  assert.equal(after,before);
  console.log(JSON.stringify({status:'passed',phase:diagnostic.failure.phase,category:diagnostic.failure.category,
    project:diagnostic.child.project,testCategory:diagnostic.child.testCategory,cleanup:diagnostic.cleanup.status}));
}finally{
  assert.equal(path.dirname(root),path.resolve(os.tmpdir()));
  await rm(root,{recursive:true,force:true});
  if(await access(browserWorkspace).then(()=>true).catch(()=>false))await rm(browserWorkspace,{recursive:true,force:true});
  if(positiveBrowserWorkspace){
    assert.equal(path.dirname(positiveBrowserWorkspace),path.resolve(os.tmpdir()));
    assert.ok(path.basename(positiveBrowserWorkspace).startsWith('authenticated-hosted-browser-'));
    await rm(positiveBrowserWorkspace,{recursive:true,force:true});
  }
}
