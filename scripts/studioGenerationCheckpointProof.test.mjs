import assert from 'node:assert/strict';
import test from 'node:test';
import { createEnterpriseLifecycleFixture } from './enterpriseLifecyclePostgresFixture.mjs';
import { createEnterpriseLifecycleStudioGeneration } from './enterpriseLifecycleStudioGeneration.mjs';
import { STUDIO_GENERATION_CHECKPOINT_SCHEMA, STUDIO_GENERATION_CHECKPOINT_SOURCE_PATHS,
  studioGenerationCheckpointDigest as digest, validateStudioGenerationCheckpointProof as validate }
  from './studioGenerationCheckpointProof.mjs';

// Validator fixtures are not executed PostgreSQL evidence.
const proof = () => {
  const files=STUDIO_GENERATION_CHECKPOINT_SOURCE_PATHS.map(path=>({path,digest:digest(path)}));
  return {
    schemaVersion:STUDIO_GENERATION_CHECKPOINT_SCHEMA,status:'PASS',classification:'executed_evidence',
    execution:{kind:'LOCAL_NOT_CI',fullAcceptance:false,hosted:false,promotion:false,timeoutMs:15000,providersEnabled:false,baseHead:'a'.repeat(40)},
    sourceBinding:{classification:'working_tree_snapshot',digest:digest(files),files,migrationChain:{count:107,digest:digest('migration-chain')}},
    runtime:{postgresql:true,actualHandler:true,actualResolver:true,actualGenerationDependency:true,actualObservationReader:true,
      providerCalls:0,paidCalls:0,egressAttempts:0,budgetReservations:0,enabledProviderRoutes:0,providerConfigsUsed:0},
    result:{responseStatus:201,outcome:'generation_completed',attempts:{total:1,completed:1,nonterminal:0},
      versions:{created:1,aggregateAdvanced:true,currentPointerAdvanced:true},permit:{armed:1,consumed:1,consumedEvents:1},
      bindings:{actor:true,session:true,request:true,payload:true,aggregate:true,sourcePackage:true,template:true,sourceCoverage:true},
      observation:{records:5,attemptRecords:1,versionRecords:1,receiptRecords:1,auditRecords:2,independentPersistedMatch:true},
      downstream:{review:0,approval:0,delivery:0,monitor:0}},
    negativeControls:{mismatchedPayloadRejected:true,duplicateRequestReplayed:true,duplicateStateUnchanged:true,
      foreignScopeExcluded:true,foreignMutationDetected:true,baselineRestored:true,nonterminalResidueZero:true},
    cleanup:{exerciseQuiesced:true,activeResidue:0,sessionRevoked:1,armedPermits:0,terminalHistoryRetained:true,databaseRemoved:true},failure:null,
  };
};
const change=(value,path,replacement)=>{
  const names=path.split('.');let target=value;
  for(const name of names.slice(0,-1))target=target[name];
  target[names.at(-1)]=replacement;
};

test('checkpoint schema accepts complete local evidence independently of JSON key order and returns a clone',()=>{
  const value=proof();value.runtime=Object.fromEntries(Object.entries(value.runtime).reverse());
  const result=validate(value);assert.deepEqual(result,value);assert.notEqual(result,value);
  result.cleanup.databaseRemoved=false;assert.equal(value.cleanup.databaseRemoved,true);
});

for(const [path,replacement] of [
  ['execution.kind','GITHUB_CI'],['execution.hosted',true],['execution.fullAcceptance',true],
  ['execution.promotion',true],['execution.timeoutMs',15001],['execution.providersEnabled',true],
  ['runtime.actualResolver',false],['runtime.actualObservationReader',false],['runtime.providerCalls',1],
  ['runtime.paidCalls',1],['runtime.egressAttempts',1],['runtime.budgetReservations',1],['runtime.enabledProviderRoutes',1],
  ['runtime.providerConfigsUsed',1],['result.responseStatus',200],['result.outcome','in_progress'],
  ['result.attempts.total',2],['result.attempts.completed',0],['result.attempts.nonterminal',1],
  ['result.versions.created',2],['result.versions.aggregateAdvanced',false],['result.versions.currentPointerAdvanced',false],
  ['result.permit.armed',0],['result.permit.armed',2],
  ['result.permit.consumed',0],['result.permit.consumedEvents',2],['result.bindings.actor',false],
  ['result.bindings.session',false],['result.bindings.request',false],['result.bindings.payload',false],
  ['result.bindings.aggregate',false],['result.bindings.sourcePackage',false],['result.bindings.template',false],
  ['result.bindings.sourceCoverage',false],['result.observation.independentPersistedMatch',false],
  ['result.observation.records',0],['result.observation.auditRecords',1],['result.downstream.review',1],
  ['result.downstream.approval',1],['result.downstream.delivery',1],['result.downstream.monitor',1],
  ['negativeControls.duplicateStateUnchanged',false],['negativeControls.foreignScopeExcluded',false],
  ['negativeControls.baselineRestored',false],['cleanup.exerciseQuiesced',false],['cleanup.activeResidue',1],
  ['cleanup.sessionRevoked',0],['cleanup.armedPermits',1],['cleanup.terminalHistoryRetained',false],['cleanup.databaseRemoved',false],
])test(`checkpoint cannot promote incomplete or out-of-scope evidence: ${path}`,()=>{
  const value=proof();change(value,path,replacement);assert.throws(()=>validate(value),/STUDIO_GENERATION_CHECKPOINT_/u);
});

test('checkpoint rejects substituted source files, digests, missing migration binding and extra fields',()=>{
  for(const mutate of [
    v=>{v.sourceBinding.files[0].path='unbound.mjs';v.sourceBinding.digest=digest(v.sourceBinding.files);},
    v=>{v.sourceBinding.files[0].digest=digest('changed');},
    v=>{delete v.sourceBinding.migrationChain;},
    v=>{v.sourceBinding.migrationChain.count=0;},
    v=>{v.result.token='private-canary';},
    v=>{v.cleanup.extra=true;},
    v=>{v.result.attempts.completed=true;},
    v=>{v.runtime.providerCalls=-1;},
    v=>{v.result.observation.records=Number.MAX_SAFE_INTEGER+1;},
  ]){const value=proof();mutate(value);assert.throws(()=>validate(value),/STUDIO_GENERATION_CHECKPOINT_/u);}
});

test('failure evidence stays blocked and admits only fixed classifications without arbitrary content',()=>{
  const value=proof();Object.assign(value,{status:'FAIL',classification:'blocked',failure:{code:'CHECKPOINT_GENERATION_FAILED'}});
  value.result.outcome='fixed_failure';value.cleanup.databaseRemoved=false;
  assert.equal(validate(value).status,'FAIL');
  for(const mutate of [v=>{v.failure=null;},v=>{v.failure.code='arbitrary error';},
    v=>{v.result.outcome='https://private.invalid/payload';},v=>{v.failure.message='Bearer private-canary';},
    v=>{v.sourceBinding.files[0].path='81000000-0000-4000-8000-000000000001';},
  ]){const changed=structuredClone(value);mutate(changed);assert.throws(()=>validate(changed),/STUDIO_GENERATION_CHECKPOINT_/u);}
});

test('synthetic fixture profile rejects providers and malformed options before connecting',async()=>{
  for(const options of [{authenticatedSynthetic:true,providersEnabled:true},{authenticatedSynthetic:'true',providersEnabled:false}]){
    await assert.rejects(createEnterpriseLifecycleFixture({databaseUrl:'postgresql://fixture@127.0.0.1:1/postgres',...options}),
      /ENTERPRISE_LIFECYCLE_AUTHENTICATED_SYNTHETIC_PROFILE_REJECTED/u);
  }
  await assert.rejects(createEnterpriseLifecycleFixture({databaseUrl:'postgresql://fixture@remote.invalid/postgres',
    authenticatedSynthetic:true,providersEnabled:false}),/ENTERPRISE_LIFECYCLE_DATABASE_URL_REJECTED/u);
});

const mappingHarness=({synthetic=true,exercise})=>{
  const effects={syntheticProviderCalls:0};let consumed;
  const syntheticModule={consumeAuthenticatedSyntheticStudioPermit:async input=>{consumed=input;return {kind:'studio_deterministic_success'};}};
  const generation=createEnterpriseLifecycleStudioGeneration({serviceQuery:async()=>{throw new Error('UNEXPECTED_SQL');},providerEffects:effects,
    studioDbModule:{STUDIO_RPC:{},executeStudioGenerationDependency:async(initial,deps)=>deps.execute(initial)},
    studioGenerationModule:{executeClaimedStudioGeneration:exercise},providerBudgetModule:{},studioProviderModule:{},templateModule:{},
    authenticatedSyntheticModule:synthetic?syntheticModule:null});
  return {generation,effects,consumed:()=>consumed};
};

test('synthetic consume wiring forwards the exact production claim authority and fence fields',async()=>{
  const claim={actorId:'actor',organizationId:'org',workspaceId:'workspace',requestId:'request',attemptId:'attempt',
    executionToken:'execution-token',executionFence:7,authenticatedSynthetic:{permitId:'permit',sessionId:'session',payloadHash:'payload',expectedVersion:8}};
  const harness=mappingHarness({exercise:async(input,deps)=>deps.consumeSynthetic(input)});
  await harness.generation.executeClaimedGeneration(claim);
  assert.deepEqual(harness.consumed(),{permitId:'permit',actorId:'actor',organizationId:'org',workspaceId:'workspace',
    sessionId:'session',requestId:'request',payloadHash:'payload',expectedVersion:8,attemptId:'attempt',executionToken:'execution-token',executionFence:7});
  assert.equal(harness.effects.syntheticProviderCalls,0);
});

test('authenticated synthetic profile fails before entering the fixture provider substitute',async()=>{
  const harness=mappingHarness({exercise:async(input,deps)=>deps.runProvider(input)});
  await assert.rejects(harness.generation.executeClaimedGeneration({}),/AUTHENTICATED_SYNTHETIC_PROVIDER_PATH_REJECTED/u);
  assert.equal(harness.effects.syntheticProviderCalls,0);
});

test('ordinary fixture profile retains its existing generation dependencies',async()=>{
  const harness=mappingHarness({synthetic:false,exercise:async(_input,deps)=>{
    assert.equal(Object.hasOwn(deps,'consumeSynthetic'),false);assert.equal(typeof deps.runProvider,'function');return 'ordinary';
  }});
  assert.equal(await harness.generation.executeClaimedGeneration({}),'ordinary');
});
