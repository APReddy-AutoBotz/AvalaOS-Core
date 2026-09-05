import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ATTESTATION_VERSION, EXPECTED_MIGRATION_TIP, apply, assertTargetInventory, canonicalJson,
  checkpointObserve, controlledHumanStepEvidenceSpec, deprovision, deriveBoundNegativeEffectCounts, deriveContext, deterministicUuid, FEATURE_FLAGS, loadCanonicalCapabilityInventory, loadFixture, plan, quiesce, recoverReset, safeResult, sha256, validateFixtureCapabilities, validateSupabaseTargetTuple, verify,
  validatePrivilegedPostgresConnectionString,
} from './prCControlledHumanEnvironment.mjs';
import {CONTROLLED_HUMAN_CATALOG,CONTROLLED_HUMAN_EXECUTION_ORDER,HUMAN_DUTY_BY_PERSONA} from './prCControlledHumanEvidenceContract.mjs';

const head='83cab00bee481df22351302cc8c1c00bda3f1664';
const baseEnv={
  PR_C_CONTROLLED_HUMAN_ENVIRONMENT_CLASS:'hosted_nonproduction_pilot',
  PR_C_CONTROLLED_HUMAN_PR_NUMBER:'264',
  PR_C_CONTROLLED_HUMAN_RELEASE_SHA:head,
  PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA:head,
  PR_C_CONTROLLED_HUMAN_DEPLOY_ID:'6a99cc001122334455667788',
  PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN:'https://deploy-preview-264--avalaos-pilot.netlify.app',
  PR_C_CONTROLLED_HUMAN_EXERCISE_ID:'40000000-0000-4000-8000-000000000264',
  PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT:`sha256:${'a'.repeat(64)}`,
  PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST:`sha256:${'1'.repeat(64)}`,
  PR_C_CONTROLLED_HUMAN_SITE_NAME:'avalaos-pilot',
  PR_C_CONTROLLED_HUMAN_NETLIFY_CONTEXT:'deploy-preview',
};
const fixtureState=await loadFixture();
const context=deriveContext(baseEnv,fixtureState,{head,dirty:''});
const emptyDomainCounts=()=>({assess_processes:0,assess_v2_cases:0,assess_v2_studio_handoffs:0,enterprise_module_handoffs:0,studio_artifacts:0,studio_source_packages:0,delivery_handoffs:0,delivery_packages:0,monitor_baselines:0,pilot_environments:0,pilot_tenants:0});
const domainCounts=cycles=>({assess_processes:cycles,assess_v2_cases:cycles,assess_v2_studio_handoffs:cycles,enterprise_module_handoffs:cycles,studio_artifacts:2*cycles,studio_source_packages:2*cycles,delivery_handoffs:0,delivery_packages:2*cycles,monitor_baselines:cycles,pilot_environments:cycles,pilot_tenants:cycles});
const ownedCounts=cycles=>({assess_process:cycles,assess_case:cycles,assess_studio_handoff:cycles,module_handoff:cycles,studio_artifact:2*cycles,studio_source_package:2*cycles,delivery_work_package:2*cycles,monitor_baseline:cycles,pilot_environment:cycles,pilot_tenant:cycles});
const emptyInventory=()=>({actualTargetFingerprint:context.targetFingerprint,marker:{product_key:'avalaos-core',environment_class:'hosted_nonproduction_pilot',migration_tip:EXPECTED_MIGRATION_TIP,production_authorized:false,customer_data_authorized:false,real_provider_calls_authorized:false},counts:{auth_users:0,profiles:0,organizations:0,workspaces:0,exercises:0},recoverableAuthUsers:0,domainCounts:emptyDomainCounts(),ownedResourceCounts:{},unownedResourceRows:0,providerRows:'0',unsafeDeprovisionedRows:'0',exercise:null,priorExercises:[]});
const activeExercise=()=>({exercise_digest:context.exerciseDigest,release_sha:context.releaseSha,review_head_sha:context.reviewHeadSha,deploy_id:context.deployId,deploy_origin:context.deployOrigin,target_fingerprint:context.targetFingerprint,persona_manifest_digest:context.personaManifestDigest,fixture_manifest_digest:context.fixtureManifestDigest,migration_tip:context.migrationTip,lifecycle:'active',concurrency_version:'1'});

test('canonical digests and deterministic identifiers are stable and scoped',()=>{
  assert.equal(canonicalJson({b:1,a:[{d:2,c:3}]}),'{"a":[{"c":3,"d":2}],"b":1}');
  assert.match(sha256({b:1,a:2}),/^sha256:[0-9a-f]{64}$/u);
  assert.equal(deterministicUuid(context.exerciseId,'role-requester'),deterministicUuid(context.exerciseId,'role-requester'));
  assert.notEqual(deterministicUuid(context.exerciseId,'role-requester'),deterministicUuid(context.exerciseId,'role-reviewer'));
});

test('negative observer effects are request-causal and require an explicit none effect family',()=>{
  const requestId='40000000-0000-4000-8000-000000000401';
  const binding={observation_kind:'negative_attempt',request_id:requestId};
  const unrelatedRequestId='40000000-0000-4000-8000-000000000402';
  const sameMillisecond='2026-09-04T13:00:00.123Z';
  const unrelated={
    receipts:[{id:'unrelated-receipt',request_id:unrelatedRequestId,actor_id:'same-actor',action:'same.action',status:'committed',event_at:sameMillisecond}],
    audits:[{id:'unrelated-audit',request_id:unrelatedRequestId,actor_id:'same-actor',action:'same.action',outcome:'succeeded',created_at:sameMillisecond}],
    deliveryEffects:[{id:'unrelated-effect',receipt_id:'unrelated-receipt',audit_id:'unrelated-audit',created_at:sameMillisecond}],
    aiEffects:[],
  };
  assert.deepEqual(deriveBoundNegativeEffectCounts({binding,effectFamily:'none',...unrelated}),{receipt:0,audit:0,effect:0});
  const exactFailedReceipt={id:'exact-failed-receipt',request_id:requestId,actor_id:'same-actor',action:'same.action',status:'failed',event_at:sameMillisecond};
  const exactDeniedAudit={id:'exact-denied-audit',request_id:requestId,actor_id:'same-actor',action:'same.action',outcome:'denied',created_at:sameMillisecond};
  assert.deepEqual(deriveBoundNegativeEffectCounts({binding,effectFamily:'none',receipts:[exactFailedReceipt],audits:[exactDeniedAudit],deliveryEffects:[{id:'exact-effect',receipt_id:exactFailedReceipt.id,audit_id:exactDeniedAudit.id,created_at:sameMillisecond}],aiEffects:[]}),{receipt:0,audit:0,effect:1});
  assert.deepEqual(deriveBoundNegativeEffectCounts({binding,effectFamily:'none',receipts:[{...exactFailedReceipt,status:'committed'}],audits:[{...exactDeniedAudit,outcome:'succeeded'}],deliveryEffects:[],aiEffects:[]}),{receipt:1,audit:1,effect:0});
  assert.throws(()=>deriveBoundNegativeEffectCounts({binding,effectFamily:'delivery_work_package',...unrelated}),/OBSERVER_CATALOG_REJECTED/u);
});

test('one-use exercise identity is deploy-independent while every context retains its exact deployment binding',()=>{
  const redeployed=deriveContext({...baseEnv,PR_C_CONTROLLED_HUMAN_DEPLOY_ID:'6b99cc001122334455667788'},fixtureState,{head,dirty:''});
  assert.equal(redeployed.exerciseDigest,context.exerciseDigest);
  assert.notEqual(redeployed.deployId,context.deployId);
  assert.equal(redeployed.deployOrigin,context.deployOrigin);
  assert.notEqual(deriveContext({...baseEnv,PR_C_CONTROLLED_HUMAN_EXERCISE_ID:'40000000-0000-4000-8000-000000000265'},fixtureState,{head,dirty:''}).exerciseDigest,context.exerciseDigest);
  assert.notEqual(deriveContext({...baseEnv,PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT:`sha256:${'b'.repeat(64)}`},fixtureState,{head,dirty:''}).exerciseDigest,context.exerciseDigest);
});

test('Supabase API, project, and PostgreSQL endpoints must identify one exact hosted target',()=>{
  const ref='abcdefghijklmnopqrst';
  const api=`https://${ref}.supabase.co`;
  const publicTargetDigest=sha256(`pr-c-controlled-human-public-target\0${api}`);
  assert.equal(validateSupabaseTargetTuple(ref,api,`postgresql://postgres:secret@db.${ref}.supabase.co:5432/postgres?sslmode=verify-full`,publicTargetDigest),true);
  assert.equal(validateSupabaseTargetTuple(ref,api,`postgres://postgres.${ref}:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=verify-full`,publicTargetDigest),true);
  for(const [candidateRef,candidateApi,candidateDatabase] of [
    ['wrong',api,`postgresql://postgres:secret@db.${ref}.supabase.co:5432/postgres`],
    [ref,'https://avalaos.com',`postgresql://postgres:secret@db.${ref}.supabase.co:5432/postgres`],
    [ref,api,`postgresql://postgres:secret@db.other.supabase.co:5432/postgres`],
    [ref,api,`postgresql://postgres.${ref}:secret@example.invalid:6543/postgres`],
    [ref,api,`postgresql://postgres.wrong:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`],
    [ref,api,`postgresql://postgres:secret@db.${ref}.supabase.co:5432/other`],
  ]) assert.throws(()=>validateSupabaseTargetTuple(candidateRef,candidateApi,candidateDatabase,publicTargetDigest),/PR_C_CONTROLLED_HUMAN_SUPABASE_TARGET_MISMATCH/u);
  assert.throws(()=>validateSupabaseTargetTuple(ref,api,`postgresql://postgres:secret@db.${ref}.supabase.co:5432/postgres?sslmode=verify-full`,sha256('substituted')),/PR_C_CONTROLLED_HUMAN_SUPABASE_TARGET_MISMATCH/u);
});

test('privileged PostgreSQL transport is exact verify-full remotely and parameter-free locally',()=>{
  assert.equal(validatePrivilegedPostgresConnectionString('postgresql://postgres:postgres@127.0.0.1:55464/postgres'),true);
  assert.equal(validatePrivilegedPostgresConnectionString('postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full',{allowLoopback:false}),true);
  for(const value of [
    'postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres',
    'postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=require',
    'postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full&uselibpqcompat=true',
    'postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full&ssl=no-verify',
    'postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full&rejectUnauthorized=false',
    'postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full&sslmode=require',
    'postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?SSLMODE=verify-full',
    'postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify%2Dfull&sslmode=verify-full',
    'postgresql://postgres:secret@127.0.0.1:55464/postgres?sslmode=verify-full',
  ]) assert.throws(()=>validatePrivilegedPostgresConnectionString(value),/PR_C_CONTROLLED_HUMAN_DATABASE_TLS_/u,value);
  assert.throws(()=>validatePrivilegedPostgresConnectionString('postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=%E0%A4%A'),/PR_C_CONTROLLED_HUMAN_DATABASE_/u);
});

test('exact preview, environment, PR, SHA, exercise, fingerprint, and clean checkout are mandatory',()=>{
  const cases=[
    ['PR_C_CONTROLLED_HUMAN_ENVIRONMENT_CLASS','production','ENVIRONMENT_REJECTED'],
    ['PR_C_CONTROLLED_HUMAN_PR_NUMBER','265','PR_REJECTED'],
    ['PR_C_CONTROLLED_HUMAN_RELEASE_SHA','b'.repeat(40),'SHA_REJECTED'],
    ['PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA','b'.repeat(40),'SHA_REJECTED'],
    ['PR_C_CONTROLLED_HUMAN_DEPLOY_ID','wrong','DEPLOY_REJECTED'],
    ['PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN','https://avalaos.com','PREVIEW_REJECTED'],
    ['PR_C_CONTROLLED_HUMAN_SITE_NAME','avalaos-core-dev','PREVIEW_REJECTED'],
    ['PR_C_CONTROLLED_HUMAN_NETLIFY_CONTEXT','production','PREVIEW_REJECTED'],
    ['PR_C_CONTROLLED_HUMAN_EXERCISE_ID','not-a-uuid','EXERCISE_REJECTED'],
    ['PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT','sha256:no','TARGET_REJECTED'],
  ];
  for(const [key,value,code] of cases) assert.throws(()=>deriveContext({...baseEnv,[key]:value},fixtureState,{head,dirty:''}),new RegExp(code,'u'));
  assert.throws(()=>deriveContext(baseEnv,fixtureState,{head,dirty:' M package.json'}),/DIRTY_CHECKOUT/u);
  assert.throws(()=>deriveContext(baseEnv,fixtureState,{head:'c'.repeat(40),dirty:''}),/SHA_REJECTED/u);
  assert.equal(deriveContext({...baseEnv,PR_C_CONTROLLED_HUMAN_EXPECTED_EXERCISE_DIGEST:context.exerciseDigest},fixtureState,{head,dirty:''}).exerciseDigest,context.exerciseDigest);
  assert.throws(()=>deriveContext({...baseEnv,PR_C_CONTROLLED_HUMAN_EXPECTED_EXERCISE_DIGEST:`sha256:${'b'.repeat(64)}`},fixtureState,{head,dirty:''}),/EXERCISE_REJECTED/u);
});

test('fixture contract owns twelve distinct personas, every exact flag, zero-authority law, and seed/reset intent',()=>{
  assert.equal(fixtureState.personas.length,12);
  assert.equal(new Set(fixtureState.personas.map(persona=>persona.key)).size,12);
  assert.deepEqual(fixtureState.fixture.authority,{productionAuthorized:false,customerDataAuthorized:false,realProviderCallsAuthorized:false,syntheticOnly:true,expectedMigrationTip:EXPECTED_MIGRATION_TIP});
  assert.deepEqual([...fixtureState.fixture.featureFlags].sort(),[...FEATURE_FLAGS].sort());
  assert.equal(fixtureState.fixture.seed.assessedStudioArtifact.artifactType,'brd');
  assert.equal(fixtureState.fixture.seed.directStudioArtifact.artifactType,'pdd');
  assert.equal(fixtureState.fixture.seed.eligibleDeliveryHandoff.expectedStatus,'eligible_not_requested');
  assert.ok(fixtureState.personas.find(persona=>persona.key==='requester').capabilities.includes('studio.handoffs.request'));
  for(const checkpoint of fixtureState.fixture.journeyCapabilityContract){const persona=fixtureState.personas.find(value=>value.key===checkpoint.personaKey);assert.ok(checkpoint.required.every(capability=>persona.capabilities.includes(capability)),checkpoint.checkpoint)}
  assert.equal(new Set(fixtureState.fixture.journeyCapabilityContract.map(value=>value.personaKey)).size,9);
  assert.equal(fixtureState.fixture.deprovision.retainImmutableDomainAndAuditHistory,true);
  assert.equal(fixtureState.fixture.deprovision.deleteDomainHistory,false);
});

test('fixture capabilities are bound to the canonical migration-derived inventory and reject unknown keys',async()=>{
  const inventory=await loadCanonicalCapabilityInventory();assert.equal(validateFixtureCapabilities(fixtureState.fixture,inventory),true);
  const substituted=structuredClone(fixtureState.fixture);substituted.personas[0].capabilities.push('synthetic.unknown.capability');
  assert.throws(()=>validateFixtureCapabilities(substituted,inventory),/UNKNOWN_CAPABILITY/u);
});

test('target inventory rejects marker drift, fingerprints, provider state, unexpected data, and substituted replay',()=>{
  assert.equal(assertTargetInventory(emptyInventory(),context),true);
  for(const mutate of [
    value=>{value.actualTargetFingerprint=`sha256:${'b'.repeat(64)}`},
    value=>{value.marker.environment_class='production'},
    value=>{value.marker.migration_tip='20260831062024'},
    value=>{value.marker.production_authorized=true},
    value=>{value.marker.customer_data_authorized=true},
    value=>{value.marker.real_provider_calls_authorized=true},
    value=>{value.providerRows='1'},
    value=>{value.unsafeDeprovisionedRows='1'},
    value=>{value.counts.auth_users=1},
    value=>{value.domainCounts.delivery_packages=1},
  ]) { const inventory=structuredClone(emptyInventory());mutate(inventory);assert.throws(()=>assertTargetInventory(inventory,context),/PR_C_CONTROLLED_HUMAN_/u); }
  const replay=emptyInventory();replay.exercise=activeExercise();replay.counts={auth_users:12,profiles:12,organizations:2,workspaces:3,exercises:1};replay.domainCounts=domainCounts(1);replay.ownedResourceCounts=ownedCounts(1);assert.equal(assertTargetInventory(replay,context),true);
  replay.exercise.deploy_id='ffffffffffffffffffffffff';assert.throws(()=>assertTargetInventory(replay,context),/EXERCISE_REPLAY_REJECTED/u);
  replay.exercise=activeExercise();replay.counts.auth_users=13;assert.throws(()=>assertTargetInventory(replay,context),/UNEXPECTED_DATA/u);
  const nextContext=deriveContext({...baseEnv,PR_C_CONTROLLED_HUMAN_EXERCISE_ID:'40000000-0000-4000-8000-000000000265'},fixtureState,{head,dirty:''});
  const retained=emptyInventory();retained.priorExercises=[{...activeExercise(),lifecycle:'deprovisioned'}];retained.counts={auth_users:12,profiles:12,organizations:2,workspaces:3,exercises:1};retained.domainCounts=domainCounts(1);retained.ownedResourceCounts=ownedCounts(1);assert.equal(assertTargetInventory(retained,nextContext),true);
  retained.priorExercises[0].lifecycle='read_only';assert.throws(()=>assertTargetInventory(retained,nextContext),/HISTORY_REJECTED/u);
  const newHead='d'.repeat(40);const newContext=deriveContext({...baseEnv,PR_C_CONTROLLED_HUMAN_RELEASE_SHA:newHead,PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA:newHead,PR_C_CONTROLLED_HUMAN_DEPLOY_ID:'dddddddddddddddddddddddd',PR_C_CONTROLLED_HUMAN_EXERCISE_ID:'40000000-0000-4000-8000-000000000266'},fixtureState,{head:newHead,dirty:''});
  retained.priorExercises[0]={...activeExercise(),lifecycle:'deprovisioned',persona_manifest_digest:`sha256:${'b'.repeat(64)}`,fixture_manifest_digest:`sha256:${'c'.repeat(64)}`};assert.equal(assertTargetInventory(retained,newContext),true);
  retained.priorExercises[0].release_sha='not-a-sha';assert.throws(()=>assertTargetInventory(retained,newContext),/HISTORY_REJECTED/u);
});

test('plan and evidence remain public-safe and contain no credentials or raw tenant identifiers',()=>{
  const result=plan(context,fixtureState);assert.equal(result.phase,'plan');assert.equal(result.status,'passed');assert.equal(result.personaCount,12);assert.equal(result.featureFlagCount,FEATURE_FLAGS.length);assert.equal(result.seedStudioArtifactCount,2);assert.equal(result.eligibleStudioArtifactCount,2);assert.equal(result.seedPackageCount,2);assert.equal(result.seedBaselineCount,1);
  assert.doesNotMatch(canonicalJson(result),/password|service[_-]?role|database_url|@example[.]invalid/iu);
  assert.throws(()=>safeResult('verify','passed',context,{password:'forbidden'}),/EVIDENCE_LEAK/u);
});

test('apply creates Admin API users before one canonical scoped seed and supports exact replay',async()=>{
  const calls=[];const database={inspect:async()=>emptyInventory(),prepareRecovery:async()=>calls.push(['prepare']),recordAuthUser:async()=>calls.push(['record']),completeRecovery:async()=>calls.push(['complete']),seed:async(_context,_fixture,users)=>{calls.push(['seed',users.length]);return {personaCount:users.length,studioArtifactCount:2,eligibleStudioArtifactCount:2,packageCount:2,baselineCount:1,lifecycle:'active',concurrencyVersion:1,replayed:false}}};
  const admin={ensureUsers:async(_context,_fixture,_passwords,onUser)=>{calls.push(['admin']);const users=fixtureState.personas.map((persona,index)=>({id:deterministicUuid(context.exerciseId,`user-${index}`),key:persona.key,state:persona.state,email:`hidden-${index}`,credentialGenerationDigest:sha256(`credential-${index}`)}));for(const user of users)await onUser(user);return users},deleteUsers:async()=>{calls.push(['delete'])}};
  const result=await apply(context,fixtureState,database,admin,{});assert.deepEqual(calls.filter(call=>['prepare','admin','seed','complete'].includes(call[0])),[['prepare'],['admin'],['seed',12],['complete']]);assert.equal(calls.filter(call=>call[0]==='record').length,12);assert.equal(result.authUsersCreated,12);assert.equal(result.zeroEgress,true);
  const replayInventory=emptyInventory();replayInventory.exercise=activeExercise();replayInventory.counts={auth_users:12,profiles:12,organizations:2,workspaces:3,exercises:1};replayInventory.domainCounts=domainCounts(1);replayInventory.ownedResourceCounts=ownedCounts(1);
  let created=false;const replayDb={inspect:async()=>replayInventory,verify:async()=>({personaCount:12,activeMembershipCount:11,studioArtifactCount:2,eligibleStudioArtifactCount:2,packageCount:2,baselineCount:1,providerRowCount:0,lifecycle:'active',concurrencyVersion:1,featureFlagCount:4})};
  const replay=await apply(context,fixtureState,replayDb,{createUsers:async()=>{created=true}},{});assert.equal(created,false);assert.equal(replay.replayed,true);
});

test('apply compensates newly created Auth users when database seed fails',async()=>{
  const users=[{id:deterministicUuid(context.exerciseId,'failed-user')}];let deleted=[];
  await assert.rejects(apply(context,fixtureState,{inspect:async()=>emptyInventory(),prepareRecovery:async()=>{},recordAuthUser:async()=>{},completeRecovery:async()=>{},seed:async()=>{throw new Error('seed-failed')}},{ensureUsers:async(_c,_f,_p,onUser)=>{for(const user of users)await onUser(user);return users},deleteUsers:async ids=>{deleted=ids}},{}),/seed-failed/u);
  assert.deepEqual(deleted,[users[0].id]);
});

test('apply recovers idempotently from every post-mutation boundary without duplicate Auth users',async()=>{
  const boundaries=['apply-recovery-authority',...Array.from({length:12},(_,index)=>`apply-auth-user-created-${index+1}`),...Array.from({length:12},(_,index)=>`apply-auth-user-${index+1}`),'apply-auth-users-complete','apply-database-committed','apply-recovery-completed'];
  for(const boundary of boundaries){
    let exercise=false;const usersByPersona=new Map();let createCount=0;let recoveryState='absent';
    const inventory=()=>{if(exercise){const value=emptyInventory();value.exercise=activeExercise();value.counts={auth_users:12,profiles:12,organizations:2,workspaces:3,exercises:1};value.domainCounts=domainCounts(1);value.ownedResourceCounts=ownedCounts(1);return value}const value=emptyInventory();value.recoverableAuthUsers=usersByPersona.size;value.counts.auth_users=usersByPersona.size;return value};
    const database={inspect:async()=>inventory(),prepareRecovery:async()=>{recoveryState='prepared'},recordAuthUser:async()=>{recoveryState='external_effect_started'},completeRecovery:async()=>{recoveryState='completed'},seed:async()=>{exercise=true;return {personaCount:12,studioArtifactCount:2,eligibleStudioArtifactCount:2,packageCount:2,baselineCount:1,lifecycle:'active',concurrencyVersion:1,replayed:false}},verify:async()=>({personaCount:12,activeMembershipCount:11,studioArtifactCount:2,eligibleStudioArtifactCount:2,packageCount:2,baselineCount:1,providerRowCount:0,lifecycle:'active',concurrencyVersion:1,featureFlagCount:FEATURE_FLAGS.length})};
    const admin={ensureUsers:async(_c,_f,_p,onUser,afterExternalMutation)=>{const users=[];for(const [index,persona] of fixtureState.personas.entries()){let user=usersByPersona.get(persona.key);if(!user){createCount+=1;user={id:deterministicUuid(context.exerciseId,`recoverable-${persona.key}`),key:persona.key,state:persona.state,email:`hidden-${index}`,credentialGenerationDigest:sha256(persona.key)};usersByPersona.set(persona.key,user);await afterExternalMutation(user,index+1)}await onUser(user);users.push(user)}return users},deleteUsers:async()=>assert.fail('simulated crash must not compensate recoverable users')};
    let injected=false;const crash=new Error(`crash-${boundary}`);crash.simulatedCrash=true;
    await assert.rejects(apply(context,fixtureState,database,admin,{}, {afterMutation:async name=>{if(!injected&&name===boundary){injected=true;throw crash}}}),new RegExp(`crash-${boundary}`,'u'));
    const recovered=await apply(context,fixtureState,database,admin,{});
    assert.equal(recovered.status,'passed',boundary);assert.equal(usersByPersona.size,12,boundary);assert.equal(createCount,12,boundary);assert.equal(recoveryState,'completed',boundary);
  }
});

test('quiesce remains read-only and recovers every post-mutation boundary with one frozen history digest',async()=>{
  for(const boundary of ['quiesce-recovery-authority','quiesce-database-committed','quiesce-history-bound']){
    let lifecycle='active';let version=1;let quiescedHistoryDigest=null;let completion='absent';const frozen=sha256(`frozen-${boundary}`);
    const inventory=()=>{const value=emptyInventory();value.exercise={...activeExercise(),lifecycle,concurrency_version:String(version)};value.counts={auth_users:12,profiles:12,organizations:2,workspaces:3,exercises:1};value.domainCounts=domainCounts(1);value.ownedResourceCounts=ownedCounts(1);return value};
    const database={inspect:async()=>inventory(),prepareRecovery:async()=>{completion='prepared'},quiesce:async(_c,expected)=>{assert.equal(expected,1);if(lifecycle==='active'){lifecycle='read_only';version=2}return {lifecycle,concurrencyVersion:version,operationEventSequence:2,transitionedAt:'2026-09-04T12:00:00.000Z'}},lifecycleInspection:async()=>({lifecycle,concurrencyVersion:version,featureFlagCountEnabled:0,runtimeControlReadOnlyCount:2,runtimeControlProviderEnabledCount:0,immutableHistoryDigest:frozen,quiescedHistoryDigest}),bindQuiescedHistory:async(_c,expected,digest)=>{assert.equal(expected,2);assert.equal(digest,frozen);if(quiescedHistoryDigest&&quiescedHistoryDigest!==digest)assert.fail('history substitution');quiescedHistoryDigest=digest},completeRecovery:async()=>{completion='completed'}};
    let injected=false;const crash=new Error(`crash-${boundary}`);crash.simulatedCrash=true;
    await assert.rejects(quiesce(context,database,1,{afterMutation:async name=>{if(!injected&&name===boundary){injected=true;throw crash}}}),new RegExp(`crash-${boundary}`,'u'));
    const recovered=await quiesce(context,database,1);assert.equal(recovered.lifecycle,'read_only');assert.equal(lifecycle,'read_only');assert.equal(quiescedHistoryDigest,frozen);assert.equal(completion,'completed');
  }
});

test('verification binds the exact public attestation and never upgrades authority',async()=>{
  const inventory=emptyInventory();inventory.exercise=activeExercise();inventory.counts={auth_users:12,profiles:12,organizations:2,workspaces:3,exercises:1};inventory.domainCounts=domainCounts(1);inventory.ownedResourceCounts=ownedCounts(1);
  const database={inspect:async()=>inventory,verify:async()=>({personaCount:12,activeMembershipCount:11,studioArtifactCount:2,eligibleStudioArtifactCount:2,packageCount:2,baselineCount:1,providerRowCount:0,lifecycle:'active',concurrencyVersion:1,featureFlagCount:4})};
  const result=await verify(context,fixtureState,database);assert.equal(result.attestation.contractVersion,ATTESTATION_VERSION);assert.equal(result.attestation.attested,true);assert.equal(result.attestation.productionAuthorized,false);assert.equal(result.attestation.realProviderCallsAuthorized,false);
  assert.equal(Object.hasOwn(result.attestation,'organizationId'),false);assert.equal(Object.hasOwn(result.attestation,'workspaceId'),false);assert.equal(Object.hasOwn(result.attestation,'userId'),false);
});

test('checkpoint observer accepts only the exact duty-owned ordered non-overlapping request and binds its digest',async()=>{
  const catalog=new Map(CONTROLLED_HUMAN_CATALOG.map(record=>[record.checkpointId,record]));let cursor=Date.parse('2026-09-04T12:00:00.000Z');
  const steps=CONTROLLED_HUMAN_EXECUTION_ORDER.flatMap(checkpointId=>catalog.get(checkpointId).steps.filter(step=>HUMAN_DUTY_BY_PERSONA[step.personaKey]==='approver').map(step=>{
    const spec=controlledHumanStepEvidenceSpec(step.stepId,step.negative);
    const record={checkpointId,stepId:step.stepId,personaKey:step.personaKey,startedAt:new Date(cursor).toISOString(),completedAt:new Date(cursor+1_000).toISOString(),attemptDigest:sha256(`${checkpointId}-${step.stepId}`),bindingToken:['server_event','negative_attempt'].includes(spec.observationKind)?sha256(`binding-${checkpointId}-${step.stepId}`):null};cursor+=2_000;return record;
  }));
  const request={humanRole:'approver',steps};const inventory=emptyInventory();inventory.exercise=activeExercise();inventory.counts={auth_users:12,profiles:12,organizations:2,workspaces:3,exercises:1};inventory.domainCounts=domainCounts(1);inventory.ownedResourceCounts=ownedCounts(1);
  let captured;const database={inspect:async()=>inventory,observeDuty:async(_context,role,observedSteps,digest)=>{captured={role,observedSteps,digest};return {observedAt:'2026-09-04T13:00:00.000Z',lifecycle:'active',concurrencyVersion:1,operationEventSequence:1,operationEventDigest:sha256('events'),immutableHistoryDigest:sha256('history'),steps:[]}}};
  const result=await checkpointObserve(context,database,request);assert.equal(result.phase,'checkpoint-observe');assert.equal(result.requestDigest,sha256(request));assert.deepEqual(captured,{role:'approver',observedSteps:steps,digest:sha256(request)});
  const wrongOrder=structuredClone(request);[wrongOrder.steps[0],wrongOrder.steps[1]]=[wrongOrder.steps[1],wrongOrder.steps[0]];await assert.rejects(checkpointObserve(context,database,wrongOrder),/OBSERVER_REQUEST_REJECTED/u);
  const overlap=structuredClone(request);overlap.steps[1].startedAt=overlap.steps[0].completedAt;await assert.rejects(checkpointObserve(context,database,overlap),/OBSERVER_TIME_REJECTED/u);
  await assert.rejects(checkpointObserve(context,database,{...request,callerReceiptId:deterministicUuid(context.exerciseId,'forbidden-selector')}),/OBSERVER_REQUEST_REJECTED/u);
});

test('server-observable steps map canonical actions to the exact controlled resource families',async()=>{
  assert.deepEqual(controlledHumanStepEvidenceSpec('approve-assess-result').resourceFamilies.includes('assess_case'),true);
  assert.deepEqual(controlledHumanStepEvidenceSpec('request-studio-handoff').resourceFamilies.includes('module_handoff'),true);
  assert.deepEqual(controlledHumanStepEvidenceSpec('request-exact-studio-handoff').resourceFamilies.includes('delivery_handoff'),true);
  assert.deepEqual(controlledHumanStepEvidenceSpec('edit-one-item-with-rationale').resourceFamilies.includes('delivery_item_version'),true);
  assert.deepEqual(controlledHumanStepEvidenceSpec('create-baseline-with-exact-package-selectors').resourceFamilies,['monitor_baseline']);
  const mapped=CONTROLLED_HUMAN_CATALOG.flatMap(checkpoint=>checkpoint.steps.map(step=>({checkpointId:checkpoint.checkpointId,step,...controlledHumanStepEvidenceSpec(step.stepId,step.negative)})))
    .filter(record=>['server_event','negative_attempt'].includes(record.observationKind));
  assert.equal(mapped.filter(record=>record.observationKind==='server_event').length,34);
  assert.equal(mapped.filter(record=>record.observationKind==='negative_attempt').length,8);
  assert.ok(mapped.every(record=>record.expectedActions.length===1),'every controlled server step owns one canonical production action');
  const sql=await readFile('supabase/migrations/20260904120000_pr_c_controlled_human_exercise_authority.sql','utf8');
  const intentRows=sql.slice(sql.indexOf('INSERT INTO public.pr_c_controlled_human_intent_catalog'),sql.indexOf('CREATE TRIGGER pr_c_controlled_human_intent_catalog_immutable'));
  for(const record of mapped){
    const literal=`('${record.checkpointId}','${record.step.stepId}','${record.observationKind}','${record.expectedActions[0]}'`;
    assert.equal(intentRows.split(literal).length-1,1,`${record.step.stepId} must have exactly one server-owned intent row`);
  }
});

test('deprovision orders quiesce, exact session revocation, credential disablement, finalization, and rejects partial reset',async()=>{
  let lifecycle='read_only';let version=2;const order=[];const frozenDigest=sha256('history');
  const userIds=Array.from({length:12},(_,index)=>deterministicUuid(context.exerciseId,`deprovision-user-${index}`));
  const inspection=()=>({lifecycle,concurrencyVersion:version,featureFlagCountEnabled:0,runtimeControlReadOnlyCount:2,runtimeControlProviderEnabledCount:0,activeMembershipCount:0,activeProfileCount:0,activeOrganizationCount:0,activeWorkspaceCount:0,activePilotEnvironmentCount:0,activePilotTenantCount:0,activeSessionCount:0,boundPersonaCount:12,immutableHistoryRetained:true,domainRowsDeleted:0,postInspectionDigest:sha256(`post-${lifecycle}`),immutableHistoryDigest:lifecycle==='read_only'?frozenDigest:sha256('final-history'),quiescedHistoryDigest:frozenDigest,operationEventCount:lifecycle==='read_only'?2:5,operationEventDigest:sha256(`events-${lifecycle}`),safety:{providerEgress:0,realProviderCalls:0,customerDataRecords:0,externalUsers:0}});
  const database={inspect:async()=>{const inventory=emptyInventory();inventory.exercise={...activeExercise(),lifecycle,concurrency_version:String(version)};inventory.counts={auth_users:12,profiles:12,organizations:2,workspaces:3,exercises:1};inventory.domainCounts=domainCounts(1);inventory.ownedResourceCounts=ownedCounts(1);return inventory},prepareRecovery:async()=>order.push('prepare'),completeRecovery:async()=>order.push('complete'),revokeSessions:async()=>{order.push('sessions');return 3},boundUserIds:async()=>userIds,finalizeDeprovision:async(_context,expected,sessionCount,credentialCount)=>{assert.equal(expected,2);assert.equal(sessionCount,3);assert.equal(credentialCount,12);order.push('finalize');lifecycle='deprovisioned';version=3;return {lifecycle,concurrencyVersion:version,lateSessionsRevoked:0,quiescedHistoryDigest:frozenDigest}},lifecycleInspection:async()=>inspection()};
  const admin={disableUsers:async ids=>{assert.deepEqual(ids,userIds);order.push('credentials');return ids.length}};
  const result=await deprovision(context,database,2,admin);assert.deepEqual(order,['prepare','sessions','credentials','finalize','complete']);assert.equal(result.lifecycle,'deprovisioned');assert.equal(result.credentialsDisabled,12);assert.equal(result.domainRowsDeleted,0);assert.equal(result.immutableHistoryRetained,true);assert.equal(result.quiescedHistoryDigest,frozenDigest);
  const partial={inspect:async()=>{const inventory=emptyInventory();inventory.exercise={...activeExercise(),lifecycle:'read_only',concurrency_version:'no'};inventory.counts={auth_users:12,profiles:12,organizations:2,workspaces:3,exercises:1};inventory.domainCounts=domainCounts(1);inventory.ownedResourceCounts=ownedCounts(1);return inventory}};
  await assert.rejects(deprovision(context,partial,1,admin),/PARTIAL_RESET_REJECTED/u);
});

test('deprovision recovers every post-mutation boundary without leaving read-only or widening cleanup',async()=>{
  const boundaries=['deprovision-recovery-authority','deprovision-sessions-revoked',...Array.from({length:12},(_,index)=>`deprovision-credential-${index+1}`),'deprovision-credentials-disabled','deprovision-database-committed','deprovision-recovery-completed'];
  for(const boundary of boundaries){
    let lifecycle='read_only';let version=2;let activeSessions=3;let disabled=false;let recovery='absent';const frozen=sha256(`deprovision-frozen-${boundary}`);
    const userIds=Array.from({length:12},(_,index)=>deterministicUuid(context.exerciseId,`${boundary}-user-${index}`));
    const inventory=()=>{const value=emptyInventory();value.exercise={...activeExercise(),lifecycle,concurrency_version:String(version)};value.counts={auth_users:12,profiles:12,organizations:2,workspaces:3,exercises:1};value.domainCounts=domainCounts(1);value.ownedResourceCounts=ownedCounts(1);return value};
    const inspectLifecycle=()=>({lifecycle,concurrencyVersion:version,featureFlagCountEnabled:0,runtimeControlReadOnlyCount:2,runtimeControlProviderEnabledCount:0,activeMembershipCount:lifecycle==='deprovisioned'?0:11,activeProfileCount:lifecycle==='deprovisioned'?0:11,activeOrganizationCount:lifecycle==='deprovisioned'?0:2,activeWorkspaceCount:lifecycle==='deprovisioned'?0:3,activePilotEnvironmentCount:lifecycle==='deprovisioned'?0:1,activePilotTenantCount:lifecycle==='deprovisioned'?0:1,activeSessionCount:activeSessions,boundPersonaCount:12,immutableHistoryRetained:true,domainRowsDeleted:0,postInspectionDigest:sha256(`${boundary}-${lifecycle}`),immutableHistoryDigest:lifecycle==='read_only'?frozen:sha256(`${frozen}-terminal`),quiescedHistoryDigest:frozen,operationEventCount:lifecycle==='read_only'?2:5,operationEventDigest:sha256(`${boundary}-events-${lifecycle}`),safety:{providerEgress:0,realProviderCalls:0,customerDataRecords:0,externalUsers:0}});
    const database={inspect:async()=>inventory(),prepareRecovery:async()=>{recovery='prepared'},completeRecovery:async()=>{recovery='completed'},lifecycleInspection:async()=>inspectLifecycle(),revokeSessions:async()=>{const removed=activeSessions;activeSessions=0;return removed},boundUserIds:async()=>userIds,finalizeDeprovision:async(_c,expected)=>{assert.equal(expected,2);lifecycle='deprovisioned';version=3;return {lifecycle,concurrencyVersion:version,lateSessionsRevoked:0,quiescedHistoryDigest:frozen}}};
    const admin={disableUsers:async(ids,afterExternalMutation=async()=>undefined)=>{assert.deepEqual(ids,userIds);for(const [index,id] of ids.entries())await afterExternalMutation(id,index+1);disabled=true;return ids.length}};
    let injected=false;const crash=new Error(`crash-${boundary}`);crash.simulatedCrash=true;
    await assert.rejects(deprovision(context,database,2,admin,{afterMutation:async name=>{if(!injected&&name===boundary){injected=true;throw crash}}}),new RegExp(`crash-${boundary}`,'u'));
    const recovered=await deprovision(context,database,2,admin);assert.equal(recovered.lifecycle,'deprovisioned',boundary);assert.equal(lifecycle,'deprovisioned',boundary);assert.equal(activeSessions,0,boundary);assert.equal(disabled,true,boundary);assert.equal(recovery,'completed',boundary);assert.equal(recovered.domainRowsDeleted,0,boundary);assert.equal(recovered.quiescedHistoryDigest,frozen,boundary);
  }
});

test('protected abort and expiry recovery delete only exact discoverable partial Auth users',async()=>{
  const build=expired=>{const ids=new Map(fixtureState.personas.slice(0,3).map((persona,index)=>[persona.key,{id:deterministicUuid(context.exerciseId,`partial-${index}`)}]));let deleted=[];let completed=false;let recovered=false;const inventory=emptyInventory();inventory.recoverableAuthUsers=ids.size;inventory.counts.auth_users=ids.size;return {ids,get deleted(){return deleted},get completed(){return completed},database:{recoveryAuthority:async(_c,operation)=>operation==='apply'?{state:'external_effect_started',expired,expected_version:0}:null,inspect:async()=>recovered?emptyInventory():inventory,prepareRecovery:async()=>{},completeRecovery:async()=>{completed=true}},admin:{discoverUsers:async()=>ids,deleteUsers:async values=>{deleted=[...values];recovered=true}}}};
  const aborted=build(false);const abortResult=await recoverReset(context,fixtureState,aborted.database,aborted.admin,'abort');assert.equal(abortResult.lifecycle,'absent');assert.deepEqual(aborted.deleted,[...aborted.ids.values()].map(value=>value.id));assert.equal(aborted.completed,true);
  const notExpired=build(false);await assert.rejects(recoverReset(context,fixtureState,notExpired.database,notExpired.admin,'expiry'),/RECOVERY_REJECTED/u);assert.deepEqual(notExpired.deleted,[]);
  const expired=build(true);const expiryResult=await recoverReset(context,fixtureState,expired.database,expired.admin,'expiry');assert.equal(expiryResult.recoveredPartialAuthUserCount,3);assert.equal(expired.completed,true);
});

test('migration is fail-closed, owner-only for control, public-safe for attestation, and retains history',async()=>{
  const sql=await readFile('supabase/migrations/20260904120000_pr_c_controlled_human_exercise_authority.sql','utf8');
  const controller=await readFile('scripts/prCControlledHumanEnvironment.mjs','utf8');
  assert.match(sql,/CHECK \(pull_request_number = 264\)/u);assert.match(sql,/review_head_sha = release_sha/u);assert.match(sql,/deploy-preview-264--/u);
  assert.match(sql,/deploy_origin = 'https:\/\/deploy-preview-264--avalaos-pilot[.]netlify[.]app'/u);
  assert.doesNotMatch(sql,/deploy-preview-264--\[a-z0-9-/u);
  assert.match(sql,/production_authorized boolean NOT NULL DEFAULT false CHECK \(NOT production_authorized\)/u);
  assert.match(sql,/real_provider_calls_authorized boolean NOT NULL DEFAULT false CHECK \(NOT real_provider_calls_authorized\)/u);
  assert.match(sql,/CREATE UNIQUE INDEX pr_c_controlled_human_one_live_exercise/u);
  assert.match(sql,/CREATE TABLE public[.]pr_c_controlled_human_recovery_authorities/u);
  assert.match(sql,/operation IN \('apply','quiesce','deprovision','abort','expiry'\)/u);
  assert.match(sql,/auth_user_ids uuid\[\] NOT NULL DEFAULT '\{\}'/u);
  assert.match(sql,/ALTER TABLE public[.]pr_c_controlled_human_recovery_authorities FORCE ROW LEVEL SECURITY/u);
  assert.match(sql,/CREATE TABLE public[.]pr_c_controlled_human_action_bindings/u);
  assert.match(sql,/CREATE TABLE public[.]pr_c_controlled_human_action_anchors/u);
  assert.match(sql,/ALTER TABLE public[.]pr_c_controlled_human_action_bindings FORCE ROW LEVEL SECURITY/u);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public[.]pr_c_controlled_human_selector_is_safe/u);
  assert.match(sql,/pg_column_size\(p_value\)<=8192/u);
  assert.match(sql,/jsonb_typeof\(entry[.]value\) IN \('object','array'\)/u);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public[.]pr_c_controlled_human_selector_contract_valid/u);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public[.]pr_c_controlled_human_canonical_json/u);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public[.]pr_c_controlled_human_anchor_step/u);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public[.]pr_c_controlled_human_complete_step/u);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public[.]pr_c_controlled_human_execute_denied_step/u);
  assert.match(sql,/actor_authorization_version bigint NOT NULL/u);
  assert.match(sql,/intent_digest text NOT NULL/u);
  assert.match(sql,/denial_code_digest text NOT NULL/u);
  assert.match(sql,/\('CH-13','reject-stale-authorization','negative_attempt','delivery[.]package[.]revision[.]commit'[\s\S]*'ENTERPRISE_DELIVERY_RESOURCE_STALE'/u);
  assert.match(sql,/denial IS DISTINCT FROM spec[.]expected_denial_code/u);
  assert.match(sql,/PR_C_CONTROLLED_HUMAN_COMPLETION_INTENT_REJECTED/u);
  assert.match(sql,/denial_proof_kind text NOT NULL CHECK \(denial_proof_kind IN \('not_applicable','denied_audit','server_denied_attempt'\)\)/u);
  assert.match(sql,/pr_c_controlled_human_issue_step_binding[\s\S]*compatibility symbol intentionally has no inference or write path[\s\S]*RAISE EXCEPTION 'PR_C_CONTROLLED_HUMAN_PREANCHOR_REQUIRED'/u);
  assert.match(sql,/TO authenticated/u);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public[.]pr_c_controlled_human_public_attestation\(text,text,text,text,text,text\) TO anon, authenticated, service_role/u);
  assert.match(sql,/REVOKE ALL ON TABLE public[.]pr_c_controlled_human_exercises[\s\S]*FROM PUBLIC, anon, authenticated, service_role/u);
  assert.match(sql,/module_handoffs_enabled = false[\s\S]*read_only = true, provider_enabled = false/u);
  assert.match(sql,/ALTER TABLE public[.]privileged_audit_events[\s\S]*ALTER COLUMN created_at SET DEFAULT clock_timestamp\(\)/u);
  assert.match(sql,/ALTER TABLE public[.]enterprise_delivery_monitor_command_attempts[\s\S]*ALTER COLUMN created_at SET DEFAULT clock_timestamp\(\)/u);
  assert.match(controller,/delete from auth[.]sessions where user_id in/u);
  assert.match(controller,/PR C controlled-human offline provenance/u);
  assert.match(controller,/config[.]status='disabled'[\s\S]*config[.]key_ref_id is null[\s\S]*config[.]default_model='synthetic-no-provider'/u);
  assert.match(controller,/job[.]token_input is null and job[.]token_output is null and job[.]latency_ms is null/u);
  assert.match(sql,/lateSessionsRevoked/u);
  assert.match(sql,/quiesced_history_digest IS NOT NULL/u);
  assert.doesNotMatch(sql,/pr_c_controlled_human_resume/u);
  assert.doesNotMatch(sql,/DELETE FROM public[.]enterprise_(delivery|monitor)|DISABLE TRIGGER/u);
  assert.match(sql,new RegExp(`migration_tip = '${EXPECTED_MIGRATION_TIP}'`,'u'));
});
