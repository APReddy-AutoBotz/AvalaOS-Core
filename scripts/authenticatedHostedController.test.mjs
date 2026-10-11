import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {
  AuthenticatedHostedController,
  authenticatedHostedDigest,
  validateAuthenticatedHostedControllerEnvironment,
} from './authenticatedHostedController.mjs';
import { canonicalDigest } from './assessV1OracleEvidence.mjs';
import { createAuthenticatedHostedPostgresAdapter } from './authenticatedHostedControllerAdapters.mjs';
import { verifyAuthenticatedHostedCheckoutState } from './authenticatedHostedCheckout.mjs';
import { runAuthenticatedHostedAcceptance, validateAuthenticatedDatabaseTarget,
  verifyAuthenticatedHostedCheckout, verifyAuthenticatedSecretBackend } from './runAuthenticatedHostedAcceptance.mjs';

const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const id = () => randomUUID();
// Deterministic fixture identity; never a configured hosted project.
const fixtureProjectRef = 'abcdefghijklmnopqrst';
const tokenFor = (actorId, sessionId) => `${Buffer.from('{}').toString('base64url')}.${
  Buffer.from(JSON.stringify({ sub: actorId, session_id: sessionId })).toString('base64url')}.${'x'.repeat(48)}`;
const baseEnvironment = () => ({
  GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'APReddy-AutoBotz/AvalaOS-Core',
  GITHUB_WORKFLOW_REF: 'APReddy-AutoBotz/AvalaOS-Core/.github/workflows/authenticated-product-acceptance.yml@refs/heads/main',
  GITHUB_JOB: 'hosted-authenticated', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2',
  RELEASE_SHA: 'a'.repeat(40), GITHUB_SHA: 'a'.repeat(40), HOSTED_PILOT_URL: 'https://avalaos-pilot.netlify.app',
  NETLIFY_DEPLOY_ID: 'b'.repeat(24), AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND: 'hosted_authenticated_synthetic',
  AUTHENTICATED_ACCEPTANCE_AUTH_KIND: 'supabase_auth', AUTHENTICATED_ACCEPTANCE_SUPABASE_URL: `https://${fixtureProjectRef}.supabase.co`,
  AUTHENTICATED_ACCEPTANCE_EXPECTED_PROJECT_REF: 'abcdefghijklmnopqrst', AUTHENTICATED_ACCEPTANCE_TARGET_PUBLIC_DIGEST: digest('target'),
  AUTHENTICATED_ACCEPTANCE_SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value-longer-than-thirty-two-characters',
  AUTHENTICATED_ACCEPTANCE_DATABASE_URL: 'postgresql://postgres:synthetic-password@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full',
  AUTHENTICATED_ACCEPTANCE_BACKEND_DIGEST: digest('backend'), AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION: '20261011053000',
  AUTHENTICATED_ACCEPTANCE_MIGRATION_DIGEST: digest('migration'), AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST: digest('exercise'),
  AUTHENTICATED_ACCEPTANCE_CATALOG_DIGEST: digest('catalog'), AUTHENTICATED_ACCEPTANCE_SOURCE_DIGEST: digest('source'),
  AUTHENTICATED_ACCEPTANCE_BASELINE_DIGEST: digest('baseline'), AUTHENTICATED_ACCEPTANCE_SYNTHETIC_ONLY: 'true',
  AUTHENTICATED_ACCEPTANCE_PRODUCTION: 'false', AUTHENTICATED_ACCEPTANCE_CUSTOMER_DATA: 'false',
  AUTHENTICATED_ACCEPTANCE_PROVIDERS_ENABLED: 'false', AUTHENTICATED_ACCEPTANCE_PAID_CALLS: 'false',
  AUTHENTICATED_ACCEPTANCE_SECRET_BACKEND: 'supabase_vault', AVALA_PROVIDER_SECRET_BACKEND: 'supabase_vault',
  AUTHENTICATED_ACCEPTANCE_SCOPE: JSON.stringify({ organizationId: id(), workspaceId: id(),
    roleIds: { author: id(), reviewer: id(), approver: id(), outsider: id() } }),
});

test('hosted environment binds the raw authenticated caller and canonical producer', () => {
  const config = validateAuthenticatedHostedControllerEnvironment(baseEnvironment());
  assert.deepEqual(config.workflow, {
    repository: 'APReddy-AutoBotz/AvalaOS-Core',
    producer: { path: '.github/workflows/exhaustive-acceptance.yml',
      ref: 'APReddy-AutoBotz/AvalaOS-Core/.github/workflows/exhaustive-acceptance.yml@refs/heads/main', job: 'acceptance' },
    caller: { path: '.github/workflows/authenticated-product-acceptance.yml',
      ref: 'APReddy-AutoBotz/AvalaOS-Core/.github/workflows/authenticated-product-acceptance.yml@refs/heads/main',
      event: 'workflow_dispatch', job: 'hosted-authenticated' },
    runId: '123', attempt: '2',
  });
  for (const changed of [
    { GITHUB_JOB: 'acceptance' }, { GITHUB_EVENT_NAME: 'pull_request' },
    { AUTHENTICATED_ACCEPTANCE_PROVIDERS_ENABLED: 'true' }, { HOSTED_PILOT_URL: 'https://example.invalid' },
  ]) assert.throws(() => validateAuthenticatedHostedControllerEnvironment({ ...baseEnvironment(), ...changed }), /AUTHENTICATED_HOSTED_CONTROLLER_/u);
});

test('a failed browser assertion remains actual false instead of becoming proof', async () => {
  const config = validateAuthenticatedHostedControllerEnvironment(baseEnvironment());
  let tick = 0;
  const controller = new AuthenticatedHostedController({ config, adapter: {}, identity: {},
    now: () => new Date(Date.UTC(2026, 9, 10, 0, 0, tick++)) });
  const projectName = 'desktop-chromium';
  controller.projects.set(projectName, { lastBoundaryAt: '2026-10-09T23:59:59.000Z' });
  const actionId = digest('action');
  controller.browserActions.set(projectName, [{ actionId, occurredAt: '2026-10-10T00:00:01.000Z',
    actorHash: digest('actor'), sessionHash: digest('session'), requestIdHash: digest('request'),
    browserPayloadHash: digest('payload'), commandBindingHash: digest('binding'),
    response: { status: 403, classification: 'PERMISSION_DENIED', commandIdHash: null, receiptIdHash: null },
    persona: 'author', route: '/functions/v1/process-command', status: 403, complete: true,
    before: { capturedAt: '2026-10-10T00:00:00.000Z', records: [] },
    after: { capturedAt: '2026-10-10T00:00:02.000Z', records: [] } }]);
  await controller.recordBrowserCase({ projectName, row: { testId: 'ASSESS-002', controls: { assertions: [
    { id: 'persisted-process-edit-denied', status: 'passed' },
    { id: 'unchanged-process-after-reload', status: 'failed' },
  ] } }, actionIds: [actionId] });
  assert.equal(controller.browserCases[0].assertions[0].actual, true);
  assert.equal(controller.browserCases[0].assertions[1].actual, false);
});

test('permit arming never forwards caller-authored deterministic content', async () => {
  let received;
  const config = validateAuthenticatedHostedControllerEnvironment(baseEnvironment());
  const controller = new AuthenticatedHostedController({ config,
    adapter: { armPermit: async input => { received = input; return { armed: true }; } }, identity: {} });
  controller.active = true;
  await controller.armPermit({ kind: 'studio_deterministic_success', commandType: 'studio.generation.request',
    actorId: id(), sessionId: id(), requestId: id(), payloadHash: digest('payload').slice(7), expectedVersion: 0,
    deterministicOutput: { forbidden: 'browser-authored' } });
  assert.equal(Object.hasOwn(received, 'deterministicOutput'), false);
  await assert.rejects(controller.armPermit({ kind: 'studio_deterministic_success', commandType: 'studio.generation.request',
    actorId: id(), sessionId: id(), requestId: id(), payloadHash: digest('payload').slice(7), expectedVersion: null }), /PERMIT_REJECTED/u);
});

test('real session binding is idempotent and namespaces the browser project persona', async () => {
  const actorId=id();const sessionId=id();const calls=[];
  const controller=new AuthenticatedHostedController({config:validateAuthenticatedHostedControllerEnvironment(baseEnvironment()),
    identity:{verifySession:async()=>({actorId,sessionId})},adapter:{bindSession:async input=>calls.push(input)}});
  controller.projects.set('desktop-chromium',{identities:{author:{id:actorId}}});
  const accessToken=tokenFor(actorId,sessionId);
  await controller.bindBrowserSession({projectName:'desktop-chromium',persona:'author',accessToken});
  await controller.bindBrowserSession({projectName:'desktop-chromium',persona:'author',accessToken});
  assert.equal(calls.length,1);assert.equal(calls[0].persona,'author_desktop-chromium');
});

test('Studio fault arming uses the production expectedAggregateVersion envelope', async () => {
  const actorId=id();const sessionId=id();let permit;
  const controller=new AuthenticatedHostedController({config:validateAuthenticatedHostedControllerEnvironment(baseEnvironment()),
    identity:{},adapter:{armPermit:async input=>{permit=input;return {armed:true};}}});
  controller.active=true;controller.projects.set('desktop-chromium',{identities:{author:{id:actorId}}});
  controller.boundSessions.set('desktop-chromium:author',{project:'desktop-chromium',persona:'author',actorId,sessionId,
    actorHash:digest(actorId),sessionHash:digest(sessionId)});
  await controller.armBrowserFault({projectName:'desktop-chromium',persona:'author',kind:'studio_deterministic_success',
    commandType:'studio.generation.request',accessToken:tokenFor(actorId,sessionId),requestBody:{requestId:id(),
      commandType:'studio.generation.request',expectedAggregateVersion:7,payload:{source:'server-bound'}}});
  assert.equal(permit.expectedVersion,7);
});

test('browser action captures a pre-request frame and requires its explicit case binding', async () => {
  const actorId=id();const sessionId=id();const actionRequest=id();let captures=0;
  const frames=[{capturedAt:'2026-10-10T00:00:00.000Z',records:[]},{capturedAt:'2026-10-10T00:00:02.000Z',records:[]}];
  const controller=new AuthenticatedHostedController({config:validateAuthenticatedHostedControllerEnvironment(baseEnvironment()),
    now:()=>new Date('2026-10-10T00:00:01.000Z'),identity:{verifySession:async()=>({actorId,sessionId})},adapter:{
      bindSession:async()=>{},observe:async input=>{assert.equal(input.project.processId,'process');return frames[captures++];},
    }});
  controller.startedAt='2026-10-09T23:59:59.000Z';controller.projects.set('desktop-chromium',{processId:'process',
    identities:{author:{id:actorId}},lastBoundaryAt:controller.startedAt});
  const accessToken=tokenFor(actorId,sessionId);
  const started=await controller.beginBrowserAction({projectName:'desktop-chromium',accessToken,
    route:'/functions/v1/process-command',requestBody:{requestId:actionRequest,commandType:'process.update',payload:{name:'x'}}});
  await controller.finishBrowserAction({projectName:'desktop-chromium',actionId:started.actionId,status:403,
    responseBody:{error:{code:'PERMISSION_DENIED'}}});
  await assert.rejects(controller.recordBrowserCase({projectName:'desktop-chromium',row:{testId:'ASSESS-002',controls:{assertions:[
    {id:'persisted-process-edit-denied',status:'passed'},{id:'unchanged-process-after-reload',status:'passed'}]}}}),
  /ACTION_BINDING_REJECTED/u);
  await controller.recordBrowserCase({projectName:'desktop-chromium',actionIds:[started.actionId],row:{testId:'ASSESS-002',
    controls:{assertions:[{id:'persisted-process-edit-denied',status:'passed'},{id:'unchanged-process-after-reload',status:'passed'}]}}});
  assert.equal(captures,2);assert.equal(controller.serverCases[0].before.capturedAt,frames[0].capturedAt);
});

test('database target tuple rejects username substrings and query host overrides', () => {
  const config=validateAuthenticatedHostedControllerEnvironment(baseEnvironment());
  assert.equal(validateAuthenticatedDatabaseTarget(config),true);
  for(const databaseUrl of [
    'postgresql://postgres.abcdefghijklmnopqrst.impostor:p@aws-0.pooler.supabase.com:6543/postgres?sslmode=verify-full',
    'postgresql://postgres:p@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full&host=foreign.invalid',
  ]) assert.throws(()=>validateAuthenticatedDatabaseTarget({...config,databaseUrl}),/DATABASE_TARGET_REJECTED/u);
});

test('failed runs quiesce, revoke and verify cleanup', async () => {
  const calls = [];
  const config = validateAuthenticatedHostedControllerEnvironment(baseEnvironment());
  const controller = new AuthenticatedHostedController({ config, identity: { revokeAll: async () => calls.push('revoke') }, adapter: {
    quiesce: async () => calls.push('quiesce'), cleanup: async () => calls.push('cleanup'),
    verifyCleanup: async () => ({ activeSessions: 0, activeIdentities:0,activeMemberships: 0, armedPermits: 0,
      activeSecretMaterial: 0, unapprovedActiveResidue: 0, nonExerciseChanged: false, immutableHistoryPreserved: true }),
  } });
  controller.active = true;
  assert.deepEqual(await controller.abortAndQuiesce(), { quiesced: true });
  assert.deepEqual(calls, ['quiesce', 'revoke', 'cleanup']);
});

test('cleanup before any committed setup leaves existing workspace controls untouched', async () => {
  const commands=[];
  const config=validateAuthenticatedHostedControllerEnvironment(baseEnvironment());
  const adapter=createAuthenticatedHostedPostgresAdapter({config,db:{query:async sql=>{
    commands.push(sql);return {rows:[]};
  }}});
  await adapter.cleanup({exerciseId:id(),projects:[]});
  assert.equal(commands.some(sql=>/\b(?:UPDATE|DELETE FROM) public\.(?:legacy_delivery_workspace_controls|studio_delivery_workspace_controls|enterprise_transcript_workspace_flags)\b/u.test(sql)),false);
});

test('abort cannot certify cleanup if unrelated state changed or retained history was lost', async () => {
  for(const failed of [{nonExerciseChanged:true},{immutableHistoryPreserved:false}]){
    const controller=new AuthenticatedHostedController({config:validateAuthenticatedHostedControllerEnvironment(baseEnvironment()),
      identity:{revokeAll:async()=>{}},adapter:{quiesce:async()=>{},cleanup:async()=>{},
        verifyCleanup:async()=>({activeSessions:0,activeIdentities:0,activeMemberships:0,armedPermits:0,
          activeSecretMaterial:0,unapprovedActiveResidue:0,nonExerciseChanged:false,immutableHistoryPreserved:true,...failed})}});
    controller.active=true;
    await assert.rejects(()=>controller.abortAndQuiesce(),/ABORT_CLEANUP_REJECTED/u);
    assert.equal(controller.quiesced,false);
  }
});

test('runner reports cleanup-incomplete instead of swallowing abort cleanup failure', async () => {
  const environment=baseEnvironment();const config=validateAuthenticatedHostedControllerEnvironment(environment);
  const adapter={preflight:async()=>({syntheticTarget:true,production:false,releaseSha:config.releaseSha,
    deploymentId:config.deploymentId,migrationVersion:config.migrationVersion,backendDigest:config.backendDigest,
    providersEnabled:false,runtimeReady:true,secretBackendKind:'supabase_vault',secretBackendWritable:true,
    publicTargetDigest:config.targetPublicDigest,baselineDigest:config.baselineDigest,
    customerRows:0,unapprovedActiveResidue:0,scopeReady:true}),
  activate:async()=>{},quiesce:async()=>{throw new Error('sanitized cleanup failure');}};
  await assert.rejects(runAuthenticatedHostedAcceptance(environment,{database:{},verifyCheckout:async()=>{},
    createPostgresAdapter:()=>adapter,createIdentityAdapter:()=>({revokeAll:async()=>{}}),
    startServer:async()=>({baseUrl:'http://127.0.0.1:1',controlToken:'token',close:async()=>{}}),
    runPlaywright:async()=>{throw new Error('browser failed');}}),/AUTHENTICATED_HOSTED_RUNNER_CLEANUP_INCOMPLETE/u);
});

test('checkout state diagnostics distinguish exact-head and full-porcelain failures without paths', async () => {
  const expectedHead = 'a'.repeat(40);
  const cases = [
    { name: 'head mismatch', head: 'b'.repeat(40), status: '',
      code: 'HEAD_MISMATCH_TRACKED_0_UNTRACKED_0' },
    { name: 'tracked dirt', head: expectedHead, status: ' M scripts/example.mjs\n',
      code: 'TRACKED_DIRTY_TRACKED_1_UNTRACKED_0' },
    { name: 'untracked dirt', head: expectedHead, status: '?? acceptance-results/example.json\n',
      code: 'UNTRACKED_DIRTY_TRACKED_0_UNTRACKED_1' },
    { name: 'mixed dirt', head: expectedHead,
      status: ' M scripts/example.mjs\n?? acceptance-results/example.json\n',
      code: 'MIXED_DIRTY_TRACKED_1_UNTRACKED_1' },
  ];
  for (const fixture of cases) {
    const calls = [];
    const git = async (command, args, options) => {
      calls.push({ command, args, options });
      return { stdout: args[0] === 'rev-parse' ? `${fixture.head}\n` : fixture.status };
    };
    await assert.rejects(
      verifyAuthenticatedHostedCheckoutState(expectedHead, { git }),
      error => {
        assert.equal(error.message,
          `AUTHENTICATED_HOSTED_RUNNER_CHECKOUT_NOT_EXACT_CLEAN_RELEASE_${fixture.code}`,
          fixture.name);
        assert.equal(error.message.includes('scripts/example.mjs'), false);
        assert.equal(error.message.includes('acceptance-results/example.json'), false);
        return true;
      },
    );
    assert.deepEqual(calls, [
      { command: 'git', args: ['rev-parse', 'HEAD'], options: { cwd: process.cwd(), encoding: 'utf8' } },
      { command: 'git', args: ['status', '--porcelain=v1', '--untracked-files=all'],
        options: { cwd: process.cwd(), encoding: 'utf8' } },
    ]);
  }
  assert.deepEqual(await verifyAuthenticatedHostedCheckoutState(expectedHead, { git: async (_command, args) => ({
    stdout: args[0] === 'rev-parse' ? `${expectedHead}\n` : '',
  }) }), { classification: 'CLEAN', trackedCount: 0, untrackedCount: 0 });
  await assert.rejects(
    verifyAuthenticatedHostedCheckoutState(expectedHead, { git: async () => { throw new Error('private detail'); } }),
    error => error.message
      === 'AUTHENTICATED_HOSTED_RUNNER_CHECKOUT_NOT_EXACT_CLEAN_RELEASE_GIT_INSPECTION_REJECTED_TRACKED_0_UNTRACKED_0',
  );
});

test('checkout verification rejects tracked and original oracle-manifest contamination before protected digests', async () => {
  const env = baseEnvironment();
  const catalog = JSON.parse(fs.readFileSync('tests/acceptance/catalog/test-catalog.json', 'utf8'));
  const provenance = JSON.parse(fs.readFileSync('tests/acceptance/source-provenance.json', 'utf8'));
  env.AUTHENTICATED_ACCEPTANCE_CATALOG_DIGEST = canonicalDigest(catalog);
  env.AUTHENTICATED_ACCEPTANCE_SOURCE_DIGEST = canonicalDigest(provenance.sourceDigests);
  const config = validateAuthenticatedHostedControllerEnvironment(env);
  for (const dirtyStatus of [
    ' M scripts/runAuthenticatedHostedAcceptance.mjs\n',
    '?? acceptance-results/sut-oracle-results.json\n',
  ]) {
    const calls = [];
    const git = async (command, args, options) => {
      calls.push({ command, args, options });
      return { stdout: args[0] === 'rev-parse' ? `${config.releaseSha}\n` : dirtyStatus };
    };
    const classification = dirtyStatus.startsWith('?? ') ? 'UNTRACKED_DIRTY_TRACKED_0_UNTRACKED_1'
      : 'TRACKED_DIRTY_TRACKED_1_UNTRACKED_0';
    await assert.rejects(verifyAuthenticatedHostedCheckout(config, { git }), error => error.message
      === `AUTHENTICATED_HOSTED_RUNNER_CHECKOUT_NOT_EXACT_CLEAN_RELEASE_${classification}`);
    assert.deepEqual(calls, [
      { command: 'git', args: ['rev-parse', 'HEAD'], options: { cwd: process.cwd(), encoding: 'utf8' } },
      { command: 'git', args: ['status', '--porcelain=v1', '--untracked-files=all'],
        options: { cwd: process.cwd(), encoding: 'utf8' } },
    ]);
  }
});

test('Vault preflight uses capabilities-self and requires create update delete', async () => {
  const seen = [];
  const organizationId='11111111-1111-4111-8111-111111111111';
  const capabilityPath='secret/data/avalaos/authenticated/11111111111141118111111111111111/*';
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    if(url.startsWith('https://api.supabase.com/')) return {ok:true,json:async()=>[
      {name:'AVALA_VAULT_ADDR',value:digest('https://vault.example.invalid').slice(7)},
      {name:'AVALA_VAULT_TOKEN',value:digest('synthetic-token-material').slice(7)},
      {name:'AVALA_VAULT_PROVIDER_SECRET_PATH',value:digest('secret/data/avalaos/authenticated').slice(7)},
    ]};
    return { ok: true, json: async () => ({ capabilities: ['create','read','update','delete'] }) };
  };
  assert.deepEqual(await verifyAuthenticatedSecretBackend({ AVALA_VAULT_ADDR: 'https://vault.example.invalid',
    AVALA_VAULT_TOKEN: 'synthetic-token-material', AUTHENTICATED_ACCEPTANCE_SUPABASE_MANAGEMENT_TOKEN:'management-token-value',
    AUTHENTICATED_ACCEPTANCE_SECRET_BACKEND:'hashicorp_vault',AVALA_PROVIDER_SECRET_BACKEND:'hashicorp_vault',
    AUTHENTICATED_ACCEPTANCE_VAULT_SECRET_PATH: 'secret/data/avalaos/authenticated' }, { fetchImpl,projectRef:'abcdefghijklmnopqrst',organizationId }),
  { kind: 'hashicorp_vault', writable: true });
  assert.equal(seen[1].url, 'https://vault.example.invalid/v1/sys/capabilities-self');
  await assert.rejects(verifyAuthenticatedSecretBackend({ AVALA_VAULT_ADDR: 'https://vault.example.invalid',
    AVALA_VAULT_TOKEN: 'synthetic-token-material', AUTHENTICATED_ACCEPTANCE_SUPABASE_MANAGEMENT_TOKEN:'management-token-value',
    AUTHENTICATED_ACCEPTANCE_SECRET_BACKEND:'hashicorp_vault',AVALA_PROVIDER_SECRET_BACKEND:'hashicorp_vault',
    AUTHENTICATED_ACCEPTANCE_VAULT_SECRET_PATH: 'secret/data/avalaos/authenticated' },
  {projectRef:'abcdefghijklmnopqrst',organizationId,fetchImpl:async url=>url.startsWith('https://api.supabase.com/')
    ?({ok:true,json:async()=>[{name:'AVALA_VAULT_ADDR',digest:digest('https://vault.example.invalid')},
      {name:'AVALA_VAULT_TOKEN',digest:digest('synthetic-token-material')},{name:'AVALA_VAULT_PROVIDER_SECRET_PATH',digest:digest('secret/data/avalaos/authenticated')} ]})
    :({ ok: true, json: async () => ({ capabilities: ['read'] }) }) }), /CAPABILITY_REJECTED/u);
});

test('native Vault preflight requires the explicit deployed selector, wrapper ACL and zero incompatible residue', async () => {
  const environment={AUTHENTICATED_ACCEPTANCE_SECRET_BACKEND:'supabase_vault',
    AVALA_PROVIDER_SECRET_BACKEND:'supabase_vault',AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION:'20261011053000',
    AUTHENTICATED_ACCEPTANCE_SUPABASE_MANAGEMENT_TOKEN:'management-token-value'};
  const fetchImpl=async()=>({ok:true,json:async()=>[{name:'AVALA_PROVIDER_SECRET_BACKEND',
    digest:digest('supabase_vault')}]});
  const database={query:async sql=>{
    if(sql.includes('enterprise_provider_secret_backend_capability() value'))return {rows:[{value:{
      backendKind:'supabase_vault',available:true,migrationTip:'20261011053000',exerciseActive:false,
      providerCallsAuthorized:false}}]};
    if(sql.includes('WITH wrappers(signature)'))return {rows:[{wrapper_count:8,service_execute:true,anon_execute:false,
      authenticated_execute:false,anon_vault_usage:false,authenticated_vault_usage:false,anon_secret_read:false,
      authenticated_secret_read:false,anon_decrypted_read:false,authenticated_decrypted_read:false}]};
    if(sql.includes('unfinished_cleanup'))return {rows:[{unfinished_cleanup:0,unfinished_managed_writes:0,
      native_material_residue:0,incompatible_enabled_routes:0}]};
    throw new Error('unexpected query');
  }};
  assert.deepEqual(await verifyAuthenticatedSecretBackend(environment,{fetchImpl,database,
    projectRef:'abcdefghijklmnopqrst'}),{kind:'supabase_vault',writable:true});
  await assert.rejects(verifyAuthenticatedSecretBackend(environment,{fetchImpl:async()=>({ok:true,json:async()=>[]}),
    database,projectRef:'abcdefghijklmnopqrst'}),/REMOTE_SECRET_CONFIGURATION_REJECTED/u);
  await assert.rejects(verifyAuthenticatedSecretBackend({...environment,AVALA_PROVIDER_SECRET_BACKEND:'hashicorp_vault'},
    {fetchImpl,database,projectRef:'abcdefghijklmnopqrst'}),/SELECTOR_REJECTED/u);
  const residueDatabase={query:async sql=>sql.includes('enterprise_provider_secret_backend_capability() value')
    ?database.query(sql):sql.includes('WITH wrappers(signature)')?database.query(sql)
      :({rows:[{unfinished_cleanup:1,unfinished_managed_writes:0,native_material_residue:0,
        incompatible_enabled_routes:0}]})};
  await assert.rejects(verifyAuthenticatedSecretBackend(environment,{fetchImpl,database:residueDatabase,
    projectRef:'abcdefghijklmnopqrst'}),/RESIDUE_REJECTED/u);
});
