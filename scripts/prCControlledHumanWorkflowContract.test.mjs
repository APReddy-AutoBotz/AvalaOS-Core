import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseWorkflowYaml } from './checkWorkflowYaml.mjs';
import { deriveContext, deriveControlledHumanExerciseBinding, loadFixture } from './prCControlledHumanEnvironment.mjs';
import { deriveMigrationContext, loadMigration } from './prCControlledHumanEnvironmentMigration.mjs';
import { CONTROLLED_HUMAN_PHASE_SECRETS } from './prCControlledHumanWorkflowSecrets.mjs';

const PRIMARY='.github/workflows/transcript-flow-pr-c.yml', RECOVERY='.github/workflows/pr264-controlled-human-recover.yml';
const expected={
 controlled_human_credentials_preflight:['preflight','controlled_human_authority',"${{ needs.controlled_human_authority.outputs.phase == 'credentials-preflight' }}"],
 controlled_human_edge:['edge','controlled_human_authority',"${{ needs.controlled_human_authority.outputs.phase == 'edge' }}"],
 controlled_human_prepare:['prepare','controlled_human_authority',"${{ needs.controlled_human_authority.outputs.phase == 'prepare' }}"],
 controlled_human_quiesce:['quiesce','controlled_human_authority',"${{ needs.controlled_human_authority.outputs.phase == 'quiesce' }}"],
 controlled_human_requester:['checkpoint','controlled_human_authority',"${{ needs.controlled_human_authority.outputs.phase == 'checkpoints' }}"],
 controlled_human_approver:['checkpoint',['controlled_human_authority','controlled_human_requester'],"${{ needs.controlled_human_authority.outputs.phase == 'checkpoints' && needs.controlled_human_requester.result == 'success' }}"],
 controlled_human_reviewer:['checkpoint',['controlled_human_authority','controlled_human_approver'],"${{ needs.controlled_human_authority.outputs.phase == 'checkpoints' && needs.controlled_human_approver.result == 'success' }}"],
 controlled_human_final:['verify','controlled_human_authority',"${{ needs.controlled_human_authority.outputs.phase == 'final' }}"],
 controlled_human_recovery:['recover','controlled_human_authority',"${{ needs.controlled_human_authority.outputs.phase == 'abort' || needs.controlled_human_authority.outputs.phase == 'expiry' }}"],
};
const jobDigests={controlled_human_authority:'7165a6cee90e2ea2ae891486b4fa94c2d9d9df665d2be7a345304fd3c74e3c67',controlled_human_credentials_preflight:'c54771d38b86efd1f4bb4d8a0803844bdc625da6168bc73580538087cdd28af4',controlled_human_edge:'dfa993b1cbb1482a3a34426885b4d90e6943b82bf88f27588731c51801ea5144',controlled_human_prepare:'e04bf067a21d5c4a9f1a3c5ee517985705d03971ecd7184c9b4ee2fe5166cba6',controlled_human_quiesce:'079d70df76ce47bc799c7ab3faea3ab729c4f8ad822a3576601777067f0e4df4',controlled_human_requester:'99d06fba91c7dc251061e9de0704c706f249259e6e6166c8f79313256802cb56',controlled_human_approver:'9a5d1c3f8b129834880b7a953875415daa0d0b9c7ddb5ccc87382a6c0ccfc9a0',controlled_human_reviewer:'3b561d020a41bdf134b24badea252d07e6cfed8076289d030bb025aced07e17e',controlled_human_final:'71684d7bc2664ee95ff897fb19d7caaba72c8ce1944d9b4e375cccb644bb5fbe',controlled_human_recovery:'9bf83e3609e7f463df82a786415f680122db72a1a103aea3e565dc168ae3d97e'};
const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`:JSON.stringify(v);
const digest=v=>createHash('sha256').update(canonical(v)).digest('hex');
const load=async p=>{const source=(await readFile(p,'utf8')).replaceAll('\r\n','\n');return{source,workflow:parseWorkflowYaml(source,p)}};
const loadPackageManifest=async()=>JSON.parse(await readFile('package.json','utf8'));

const RUNTIME_SOURCE_SHA='1111111111111111111111111111111111111111';
const RUNTIME_TRUSTED_RECOVERY_SHA='2222222222222222222222222222222222222222';
const RUNTIME_DEPLOY_ID='333333333333333333333333';
const RUNTIME_EXERCISE_ID='00000000-0000-4000-8000-000000000264';
const RUNTIME_OTHER_EXERCISE_ID='00000000-0000-4000-8000-000000000265';
const RUNTIME_TARGET_FINGERPRINT=`sha256:${'4'.repeat(64)}`;
const RUNTIME_PUBLIC_TARGET_DIGEST=`sha256:${'5'.repeat(64)}`;
const AUTHORITY_OUTPUT_PREFIX='${{ needs.controlled_human_authority.outputs.';
const authorityOutput=name=>`${AUTHORITY_OUTPUT_PREFIX}${name} }}`;
const input=name=>`\${{ inputs.${name} }}`;
const normalRuntimeJobs=['controlled_human_edge','controlled_human_prepare','controlled_human_quiesce','controlled_human_requester','controlled_human_approver','controlled_human_reviewer','controlled_human_final'];
const runtimeContextKeys=['PR_C_CONTROLLED_HUMAN_ENVIRONMENT_CLASS','PR_C_CONTROLLED_HUMAN_PR_NUMBER','PR_C_CONTROLLED_HUMAN_RELEASE_SHA','PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA','PR_C_CONTROLLED_HUMAN_DEPLOY_ID','PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN','PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST','PR_C_CONTROLLED_HUMAN_EXPECTED_EXERCISE_DIGEST','PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT','PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST','PR_C_CONTROLLED_HUMAN_SITE_NAME','PR_C_CONTROLLED_HUMAN_NETLIFY_CONTEXT'];
const normalRuntimeEnv=Object.freeze({
 PR_C_CONTROLLED_HUMAN_ENVIRONMENT_CLASS:'hosted_nonproduction_pilot',PR_C_CONTROLLED_HUMAN_PR_NUMBER:264,
 PR_C_CONTROLLED_HUMAN_RELEASE_SHA:authorityOutput('exact-head-sha'),PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA:authorityOutput('exact-head-sha'),
 PR_C_CONTROLLED_HUMAN_DEPLOY_ID:authorityOutput('netlify-deploy-id'),PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN:'https://deploy-preview-264--avalaos-pilot.netlify.app',
 PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST:authorityOutput('exercise-digest'),PR_C_CONTROLLED_HUMAN_EXPECTED_EXERCISE_DIGEST:authorityOutput('exercise-digest'),
 PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT:authorityOutput('target-fingerprint'),PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST:authorityOutput('public-target-digest'),
 PR_C_CONTROLLED_HUMAN_SITE_NAME:'avalaos-pilot',PR_C_CONTROLLED_HUMAN_NETLIFY_CONTEXT:'deploy-preview',
});
const primaryRecoveryRuntimeEnv=Object.freeze({
 PR_C_CONTROLLED_HUMAN_ENVIRONMENT_CLASS:'hosted_nonproduction_pilot',PR_C_CONTROLLED_HUMAN_PR_NUMBER:264,
 PR_C_CONTROLLED_HUMAN_RELEASE_SHA:authorityOutput('exact-head-sha'),PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA:authorityOutput('exact-head-sha'),
 PR_C_CONTROLLED_HUMAN_DEPLOY_ID:authorityOutput('netlify-deploy-id'),PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN:'https://deploy-preview-264--avalaos-pilot.netlify.app',
 PR_C_CONTROLLED_HUMAN_EXPECTED_EXERCISE_DIGEST:authorityOutput('exercise-digest'),PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT:authorityOutput('target-fingerprint'),
 PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST:authorityOutput('public-target-digest'),PR_C_CONTROLLED_HUMAN_SITE_NAME:'avalaos-pilot',PR_C_CONTROLLED_HUMAN_NETLIFY_CONTEXT:'deploy-preview',
});
const manualRecoveryRuntimeEnv=Object.freeze({
 PR_C_CONTROLLED_HUMAN_ENVIRONMENT_CLASS:'hosted_nonproduction_pilot',PR_C_CONTROLLED_HUMAN_PR_NUMBER:264,
 PR_C_CONTROLLED_HUMAN_RELEASE_SHA:input('exact_head_sha'),PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA:input('exact_head_sha'),
 PR_C_CONTROLLED_HUMAN_DEPLOY_ID:input('netlify_deploy_id'),PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN:'https://deploy-preview-264--avalaos-pilot.netlify.app',
 PR_C_CONTROLLED_HUMAN_EXPECTED_EXERCISE_DIGEST:input('exercise_digest'),PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT:input('target_fingerprint'),
 PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST:input('public_target_digest'),PR_C_CONTROLLED_HUMAN_SITE_NAME:'avalaos-pilot',PR_C_CONTROLLED_HUMAN_NETLIFY_CONTEXT:'deploy-preview',
});
const expectedNpmRuntimeScripts=Object.freeze({
 'pr-c-controlled-human:migration-preflight':'node scripts/prCControlledHumanEnvironmentMigration.mjs preflight',
 'pr-c-controlled-human:migration-apply':'node scripts/prCControlledHumanEnvironmentMigration.mjs apply',
 'pr-c-controlled-human:migration-verify':'node scripts/prCControlledHumanEnvironmentMigration.mjs verify',
 'pr-c-controlled-human:preflight':'node scripts/prCControlledHumanEnvironment.mjs preflight',
 'pr-c-controlled-human:plan':'node scripts/prCControlledHumanEnvironment.mjs plan',
 'pr-c-controlled-human:apply':'node scripts/prCControlledHumanEnvironment.mjs apply',
 'pr-c-controlled-human:verify':'node scripts/prCControlledHumanEnvironment.mjs verify',
});
const expectedRuntimeInvocations=Object.freeze([
 [PRIMARY,'controlled_human_edge','Apply and verify exact additive migration on the dedicated database','migration','preflight'],
 [PRIMARY,'controlled_human_edge','Apply and verify exact additive migration on the dedicated database','migration','apply'],
 [PRIMARY,'controlled_human_edge','Apply and verify exact additive migration on the dedicated database','migration','verify'],
 [PRIMARY,'controlled_human_edge','Apply and verify exact additive migration on the dedicated database','environment','preflight'],
 [PRIMARY,'controlled_human_prepare','Preflight dedicated synthetic target','environment','preflight'],
 [PRIMARY,'controlled_human_prepare','Produce bounded seed plan','environment','plan'],
 [PRIMARY,'controlled_human_prepare','Apply bounded synthetic seed','environment','apply'],
 [PRIMARY,'controlled_human_prepare','Verify exact seed and zero-egress boundary','environment','verify'],
 [PRIMARY,'controlled_human_prepare','Protected exact-bound abort recovery after failed seed or evidence assembly','environment','recover-reset'],
 [PRIMARY,'controlled_human_quiesce','Reverify exact preview and active synthetic state','environment','verify'],
 [PRIMARY,'controlled_human_quiesce','Enter exact server-enforced read-only state before any read-only human observation','environment','quiesce'],
 [PRIMARY,'controlled_human_requester','Derive backend observer records from the exact synthetic read-only scope','environment','checkpoint-observe'],
 [PRIMARY,'controlled_human_approver','Derive backend observer records from the exact synthetic read-only scope','environment','checkpoint-observe'],
 [PRIMARY,'controlled_human_reviewer','Derive backend observer records from the exact synthetic read-only scope','environment','checkpoint-observe'],
 [PRIMARY,'controlled_human_final','Deprovision exact synthetic exercise directly from frozen read-only state','environment','deprovision'],
 [PRIMARY,'controlled_human_final','Independently re-inspect post-deprovision state','environment','post-deprovision-verify'],
 [PRIMARY,'controlled_human_recovery','Complete exact server-authorized abort or expiry recovery','environment','recover-reset'],
 [RECOVERY,'recover','Complete exact server-authorized abort or expiry recovery','environment','recover-reset'],
]);
const runtimeInvocationIdentity=invocation=>[invocation.workflowPath,invocation.jobName,invocation.stepName,invocation.entrypoint,invocation.phase];
const sameRuntimeInvocation=(left,right)=>runtimeInvocationIdentity(left).toString()===runtimeInvocationIdentity(right).toString();
const runtimeReference=/npm run pr-c-controlled-human:[a-z-]+|node scripts\/prCControlledHumanEnvironment(?:Migration)?[.]mjs\s+[a-z-]+/gu;
const recognizedRuntimeReference=/npm run pr-c-controlled-human:(migration-preflight|migration-apply|migration-verify|preflight|plan|apply|verify)\b|node scripts\/prCControlledHumanEnvironment[.]mjs\s+([a-z-]+)\b/gu;
function discoverRuntimeInvocations(workflowPath,workflow){
 const invocations=[];
 for(const [jobName,job] of Object.entries(workflow.jobs??{}))for(const [stepIndex,step] of (job.steps??[]).entries()){
  const run=String(step.run??''),references=[...run.matchAll(runtimeReference)],recognized=[...run.matchAll(recognizedRuntimeReference)];
  assert.equal(recognized.length,references.length,`${workflowPath}:${jobName}:${step.name}:unknown-runtime-reference`);
  for(const match of recognized){
   if(match[1]){
    const npmPhase=match[1],entrypoint=npmPhase.startsWith('migration-')?'migration':'environment',phase=npmPhase.replace(/^migration-/u,'');
    invocations.push({workflowPath,workflow,jobName,job,stepIndex,step,stepName:step.name,entrypoint,phase});
   }else{
    const phase=match[2];
    assert.ok(['verify','quiesce','checkpoint-observe','deprovision','post-deprovision-verify','recover-reset'].includes(phase),`${workflowPath}:${jobName}:${step.name}:unknown-runtime-phase:${phase}`);
    invocations.push({workflowPath,workflow,jobName,job,stepIndex,step,stepName:step.name,entrypoint:'environment',phase});
   }
  }
 }
 return invocations;
}
function assertRuntimeJobBindings(primary,recovery){
 for(const name of normalRuntimeJobs){
  const job=primary.jobs[name];
  for(const [key,value] of Object.entries(normalRuntimeEnv))assert.equal(job.env?.[key],value,`${name}:${key}`);
 }
 for(const [key,value] of Object.entries(primaryRecoveryRuntimeEnv))assert.equal(primary.jobs.controlled_human_recovery.env?.[key],value,`controlled_human_recovery:${key}`);
 for(const [key,value] of Object.entries(manualRecoveryRuntimeEnv))assert.equal(recovery.jobs.recover.env?.[key],value,`manual_recovery:${key}`);
 const runtimeJobs=[...normalRuntimeJobs.map(name=>[name,primary.jobs[name]]),['controlled_human_recovery',primary.jobs.controlled_human_recovery],['manual_recovery',recovery.jobs.recover]];
 for(const [name,job] of runtimeJobs)for(const step of job.steps??[])for(const key of runtimeContextKeys)assert.equal(Object.hasOwn(step.env??{},key),false,`${name}:${step.name}:step-context-override:${key}`);
}
function assertRuntimeAliases(packageManifest){for(const [name,target] of Object.entries(expectedNpmRuntimeScripts))assert.equal(packageManifest.scripts?.[name],target,`package.json:${name}`);}
function syntheticExpressionValues(exerciseDigest){
 return new Map([
  [authorityOutput('exact-head-sha'),RUNTIME_SOURCE_SHA],[authorityOutput('trusted-execution-sha'),RUNTIME_TRUSTED_RECOVERY_SHA],
  [authorityOutput('netlify-deploy-id'),RUNTIME_DEPLOY_ID],[authorityOutput('exercise-digest'),exerciseDigest],
  [authorityOutput('target-fingerprint'),RUNTIME_TARGET_FINGERPRINT],[authorityOutput('public-target-digest'),RUNTIME_PUBLIC_TARGET_DIGEST],
  [input('exact_head_sha'),RUNTIME_SOURCE_SHA],[input('trusted_execution_sha'),RUNTIME_TRUSTED_RECOVERY_SHA],
  [input('netlify_deploy_id'),RUNTIME_DEPLOY_ID],[input('exercise_digest'),exerciseDigest],
  [input('target_fingerprint'),RUNTIME_TARGET_FINGERPRINT],[input('public_target_digest'),RUNTIME_PUBLIC_TARGET_DIGEST],
 ]);
}
const syntheticSecretValues=Object.freeze({
 PR_C_CONTROLLED_HUMAN_DATABASE_URL:'postgresql://synthetic.invalid/postgres',PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY:'synthetic-hmac-key-with-at-least-32-bytes',
 PR_C_CONTROLLED_HUMAN_EXERCISE_ID:RUNTIME_EXERCISE_ID,PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_JSON:'{}',PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF:'synthetic-project',
 PR_C_CONTROLLED_HUMAN_SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-role',PR_C_CONTROLLED_HUMAN_SUPABASE_URL:'https://synthetic.supabase.co',PR_C_CONTROLLED_HUMAN_SUPABASE_ACCESS_TOKEN:'synthetic-access-token',
});
function materializeEnv(values,expressionValues,secretValues=syntheticSecretValues){
 const result={};
 for(const [key,raw] of Object.entries(values??{})){
  if(typeof raw==='number'||typeof raw==='boolean'){result[key]=String(raw);continue;}
  assert.equal(typeof raw,'string',`${key}:non-scalar-env`);
  const secretMatch=raw.match(/^\$\{\{ secrets[.]([A-Z0-9_]+) \}\}$/u);
  if(secretMatch){assert.ok(Object.hasOwn(secretValues,secretMatch[1]),`${key}:unknown-synthetic-secret`);result[key]=secretValues[secretMatch[1]];continue;}
  if(raw.includes('${{')){assert.ok(expressionValues.has(raw),`${key}:unknown-runtime-expression:${raw}`);result[key]=expressionValues.get(raw);continue;}
  result[key]=raw;
 }
 return result;
}
async function materializeMigrationGithubEnv(primary,migration){
 const job=primary.jobs.controlled_human_edge,step=job.steps.find(candidate=>candidate.name==='Derive exact controlled-human migration digest');
 assert.ok(step);const match=String(step.run??'').match(/^node --input-type=module -e "([\s\S]+)"$/u);assert.ok(match,'migration-digest-command');
 const directory=await mkdtemp(join(tmpdir(),'pr264-workflow-env-')),path=join(directory,'github-env');
 try{
  execFileSync(process.execPath,['--input-type=module','-e',match[1]],{cwd:process.cwd(),env:{GITHUB_ENV:path},stdio:'pipe'});
  const lines=(await readFile(path,'utf8')).trim().split(/\r?\n/u);assert.deepEqual(lines,[`PR_C_CONTROLLED_HUMAN_MIGRATION_DIGEST=${migration.digest}`]);
  return Object.freeze({PR_C_CONTROLLED_HUMAN_MIGRATION_DIGEST:migration.digest});
 }finally{await rm(directory,{recursive:true,force:true});}
}
function validateRuntimeInvocationMatrix({primary,recovery,packageManifest,fixtureState,migration,githubEnv,secretValues=syntheticSecretValues,runtimeEnvMutator,checkoutMutator}){
 assertRuntimeJobBindings(primary,recovery);assertRuntimeAliases(packageManifest);
 const invocations=[...discoverRuntimeInvocations(PRIMARY,primary),...discoverRuntimeInvocations(RECOVERY,recovery)];
 assert.deepEqual(invocations.map(runtimeInvocationIdentity),expectedRuntimeInvocations);assert.equal(invocations.length,18);
 const binding=deriveControlledHumanExerciseBinding({environmentClass:'hosted_nonproduction_pilot',prNumber:264,releaseSha:RUNTIME_SOURCE_SHA,reviewHeadSha:RUNTIME_SOURCE_SHA,exerciseId:RUNTIME_EXERCISE_ID,targetFingerprint:RUNTIME_TARGET_FINGERPRINT,publicTargetDigest:RUNTIME_PUBLIC_TARGET_DIGEST},fixtureState);
 const expressionValues=syntheticExpressionValues(binding.exerciseDigest),contexts=[];
 for(const invocation of invocations){
  const edgeDigestStepIndex=invocation.workflowPath===PRIMARY&&invocation.jobName==='controlled_human_edge'?invocation.job.steps.findIndex(step=>step.name==='Derive exact controlled-human migration digest'):-1;
  if(invocation.entrypoint==='migration')assert.ok(edgeDigestStepIndex>=0&&edgeDigestStepIndex<invocation.stepIndex,'migration-digest-order');
  let env={...materializeEnv(invocation.job.env,expressionValues,secretValues),...(edgeDigestStepIndex>=0&&edgeDigestStepIndex<invocation.stepIndex?githubEnv:{}),...materializeEnv(invocation.step.env,expressionValues,secretValues)};
  if(runtimeEnvMutator)env=runtimeEnvMutator({...env},invocation)??env;
  const trustedRecovery=invocation.phase==='recover-reset'&&(invocation.jobName==='controlled_human_recovery'||invocation.workflowPath===RECOVERY);
  let checkout={head:trustedRecovery?RUNTIME_TRUSTED_RECOVERY_SHA:RUNTIME_SOURCE_SHA,dirty:''};if(checkoutMutator)checkout=checkoutMutator({...checkout},invocation)??checkout;
  const context=invocation.entrypoint==='migration'?deriveMigrationContext(env,fixtureState,migration,checkout):deriveContext(env,fixtureState,checkout,{allowTrustedRecoveryCheckout:invocation.phase==='recover-reset'});
  contexts.push({identity:runtimeInvocationIdentity(invocation),exerciseDigest:context.exerciseDigest});
 }
 assert.equal(new Set(contexts.map(context=>context.exerciseDigest)).size,1);
 return contexts;
}
const secret=name=>`\${{ secrets.${name} }}`, guard=phase=>`node scripts/prCControlledHumanWorkflowSecrets.mjs ${phase}`;
const DATABASE_URL='PR_C_CONTROLLED_HUMAN_DATABASE_URL', HMAC='PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY', EXERCISE='PR_C_CONTROLLED_HUMAN_EXERCISE_ID', PASSWORD='PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_JSON', PROJECT='PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF', SERVICE='PR_C_CONTROLLED_HUMAN_SUPABASE_SERVICE_ROLE_KEY', URL='PR_C_CONTROLLED_HUMAN_SUPABASE_URL', ACCESS='PR_C_CONTROLLED_HUMAN_SUPABASE_ACCESS_TOKEN';
const same=(...names)=>Object.fromEntries(names.map(name=>[name,name]));
const binding=(name,env,command,uses)=>({name,env,command,uses});
const targetBinding=name=>binding(name,{SUPABASE_PROJECT_REF:PROJECT,...same(URL,DATABASE_URL)},/^node --input-type=module -e "import \{validateSupabaseTargetTuple\} from '\.\/scripts\/prCControlledHumanEnvironment\.mjs'; validateSupabaseTargetTuple\(process\.env\.SUPABASE_PROJECT_REF,process\.env\.PR_C_CONTROLLED_HUMAN_SUPABASE_URL,process\.env\.PR_C_CONTROLLED_HUMAN_DATABASE_URL\)"$/u);
const consumerContracts={
 controlled_human_credentials_preflight:[binding('Verify protected credential transport with bounded read-only checks',same(DATABASE_URL,HMAC,EXERCISE,PASSWORD,PROJECT,SERVICE,URL),'node scripts/prCControlledHumanCredentialPreflight.mjs')],
 controlled_human_edge:[
  targetBinding('Bind Supabase project, API and database without disclosure'),
  binding('Capture provider deployment baseline',{SUPABASE_PROJECT_REF:PROJECT,SUPABASE_ACCESS_TOKEN:ACCESS},'node scripts/producePrCControlledHumanEdgeDeploymentManifest.mjs --provider-baseline output/controlled-human/provider-baseline.json'),
  binding('Apply and verify exact additive migration on the dedicated database',same(DATABASE_URL,EXERCISE),'npm run pr-c-controlled-human:migration-preflight -- --output output/controlled-human/migration-preflight.json\nnpm run pr-c-controlled-human:migration-apply -- --output output/controlled-human/migration-apply.json\nnpm run pr-c-controlled-human:migration-verify -- --output output/controlled-human/migration-verify.json\nnpm run pr-c-controlled-human:preflight -- --output output/controlled-human/edge-preflight.json\n'),
  binding('Deploy only the allowlisted functions',{SUPABASE_PROJECT_REF:PROJECT,SUPABASE_ACCESS_TOKEN:ACCESS},'set -euo pipefail\nfor function_name in assess-command assess-v2-command enterprise-intelligence-command enterprise-intelligence-query studio-artifact-command studio-private-artifact-command tenant-context tenant-session pr-c-controlled-human-synthetic-generation; do\n  log_file="$RUNNER_TEMP/pr264-edge-${function_name}.log"\n  if ! supabase functions deploy "$function_name" --project-ref "$SUPABASE_PROJECT_REF" >"$log_file" 2>&1; then\n    node --input-type=module -e "import {rmSync} from \'node:fs\'; rmSync(process.argv[1],{force:true})" "$log_file"\n    echo "::error::PR_C_CONTROLLED_HUMAN_EDGE_DEPLOYMENT_FAILED:${function_name}"\n    exit 1\n  fi\n  node --input-type=module -e "import {rmSync} from \'node:fs\'; rmSync(process.argv[1],{force:true})" "$log_file"\ndone\n'),
  binding('Produce provider-attested deployment and runtime manifest',{SUPABASE_PROJECT_REF:PROJECT,SUPABASE_ACCESS_TOKEN:ACCESS,...same(HMAC)},'node scripts/producePrCControlledHumanEdgeDeploymentManifest.mjs --migration-preflight output/controlled-human/migration-preflight.json --migration-apply output/controlled-human/migration-apply.json --migration-verify output/controlled-human/migration-verify.json --preflight output/controlled-human/edge-preflight.json --provider-baseline output/controlled-human/provider-baseline.json --output output/controlled-human/edge-deployment.json'),
 ],
 controlled_human_prepare:[
  binding('Verify signed exact deployed Edge source manifest before backend access',same(HMAC),'node scripts/verifyPrCControlledHumanEdgeDeployment.mjs --input output/controlled-human/edge-input/edge-deployment.json --output output/controlled-human/edge-deployment.json'),
  targetBinding('Bind Supabase Admin API and database to the exact deployed project'),
  binding('Authenticate service-role authority against the exact Supabase API without retaining response data',same(URL,SERVICE),'node --input-type=module -e "try { const base=new URL(process.env.PR_C_CONTROLLED_HUMAN_SUPABASE_URL); if(base.pathname!==\'/\'||base.search||base.hash||!base.hostname.endsWith(\'.supabase.co\')) throw new Error(); const response=await fetch(new URL(\'/auth/v1/admin/users?page=1&per_page=1\',base),{redirect:\'error\',headers:{apikey:process.env.PR_C_CONTROLLED_HUMAN_SUPABASE_SERVICE_ROLE_KEY,Authorization:\'Bearer \'+process.env.PR_C_CONTROLLED_HUMAN_SUPABASE_SERVICE_ROLE_KEY},signal:AbortSignal.timeout(15000)}); await response.body?.cancel(); if(!response.ok) throw new Error(); } catch { throw new Error(\'PR_C_CONTROLLED_HUMAN_SUPABASE_ADMIN_AUTHORITY_REJECTED\'); }"'),
  binding('Preflight dedicated synthetic target',same(DATABASE_URL,EXERCISE),'npm run pr-c-controlled-human:preflight -- --output output/controlled-human/preflight.json'),
  binding('Produce bounded seed plan',same(EXERCISE),'npm run pr-c-controlled-human:plan -- --output output/controlled-human/plan.json'),
  binding('Apply bounded synthetic seed',same(DATABASE_URL,EXERCISE,URL,SERVICE,PASSWORD),'npm run pr-c-controlled-human:apply -- --output output/controlled-human/apply.json'),
  binding('Verify exact seed and zero-egress boundary',same(DATABASE_URL,EXERCISE),'npm run pr-c-controlled-human:verify -- --output output/controlled-human/verify.json'),
  binding('Build immutable preparation binding',same(HMAC),'node scripts/buildPrCControlledHumanPreparation.mjs --preflight output/controlled-human/preflight.json --plan output/controlled-human/plan.json --apply output/controlled-human/apply.json --verify output/controlled-human/verify.json --edge-deployment output/controlled-human/edge-deployment.json --output output/controlled-human/preparation.json'),
  binding('Protected exact-bound abort recovery after failed seed or evidence assembly',same(DATABASE_URL,EXERCISE,URL,SERVICE),'node scripts/prCControlledHumanEnvironment.mjs recover-reset --reason abort --output output/controlled-human/emergency-deprovision.json'),
 ],
 controlled_human_quiesce:[
  targetBinding('Bind Supabase project, API and database before lifecycle mutation'),
  binding('Reverify exact preview and active synthetic state',same(DATABASE_URL,EXERCISE),'node scripts/verifyPr264ControlledHumanPreview.mjs\nnode scripts/prCControlledHumanEnvironment.mjs verify --output output/controlled-human/current-verify.json\n'),
  binding('Enter exact server-enforced read-only state before any read-only human observation',same(DATABASE_URL,EXERCISE),'node scripts/prCControlledHumanEnvironment.mjs quiesce --authority output/controlled-human/current-verify.json --output output/controlled-human/quiesce.json'),
 ],
 checkpoint:[
  binding('Derive backend observer records from the exact synthetic read-only scope',same(DATABASE_URL,EXERCISE),'node scripts/prCControlledHumanEnvironment.mjs checkpoint-observe --request output/controlled-human/private/observer-request.json --output output/controlled-human/private/server-observer.json'),
  binding('Sign human attestation and independently observed server evidence',same(HMAC),jobName=>`node scripts/capturePrCControlledHumanCheckpoint.mjs --preparation output/controlled-human/input/preparation.json --quiesce output/controlled-human/input/quiesce.json --comment output/controlled-human/private/comment.json --observer output/controlled-human/private/server-observer.json --output "output/controlled-human/checkpoint-${jobName.replace('controlled_human_','')}.json"`),
 ],
 controlled_human_final:[
  binding('Revalidate immutable human comments and exact signed observation bytes',same(HMAC),undefined,'actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea'),
  binding('Validate preparation and every signed human/server checkpoint before reset',same(HMAC),/^node --input-type=module -e "import \{readFile\} from 'node:fs\/promises'; import \{validatePreparationEvidence,validateHumanCheckpoint\}/u),
  targetBinding('Bind Supabase project, API and database before lifecycle mutation'),
  binding('Deprovision exact synthetic exercise directly from frozen read-only state',same(DATABASE_URL,EXERCISE,URL,SERVICE),'node scripts/prCControlledHumanEnvironment.mjs deprovision --authority output/controlled-human/input/quiesce.json --output output/controlled-human/deprovision.json'),
  binding('Independently re-inspect post-deprovision state',same(DATABASE_URL,EXERCISE),'node scripts/prCControlledHumanEnvironment.mjs post-deprovision-verify --authority output/controlled-human/deprovision.json --output output/controlled-human/post-deprovision.json'),
  binding('Build verified human session from recomputed evidence',same(HMAC),'node scripts/verifyPrCControlledHumanSession.mjs --preparation output/controlled-human/input/preparation.json --requester output/controlled-human/input/checkpoint-requester.json --reviewer output/controlled-human/input/checkpoint-reviewer.json --approver output/controlled-human/input/checkpoint-approver.json --quiesce output/controlled-human/input/quiesce.json --deprovision output/controlled-human/deprovision.json --post-deprovision output/controlled-human/post-deprovision.json --defect-history output/controlled-human/input/defect-history.json --output output/controlled-human/verified-session.json'),
 ],
 controlled_human_recovery:[
  targetBinding('Bind Supabase project, API, and database to one exact synthetic target'),
  binding('Complete exact server-authorized abort or expiry recovery',same(DATABASE_URL,EXERCISE,URL,SERVICE),/^node scripts\/prCControlledHumanEnvironment\.mjs recover-reset --reason \$\{\{ needs\.controlled_human_authority\.outputs\.phase \}\} --output output\/controlled-human\/recovery\.json$/u),
 ],
 manual_recovery:[
  targetBinding('Bind Supabase project, API, and database to one exact synthetic target'),
  binding('Complete exact server-authorized abort or expiry recovery',same(DATABASE_URL,EXERCISE,URL,SERVICE),/^node scripts\/prCControlledHumanEnvironment\.mjs recover-reset --reason \$\{\{ inputs\.reason \}\} --output output\/controlled-human\/recovery\.json$/u),
 ],
};
const secretRe=/\$\{\{(?:(?!\}\})[\s\S])*?\bsecrets\b(?:(?!\}\})[\s\S])*?\}\}/iu;
const walk=(v,path='$',out=[])=>{if(Array.isArray(v))v.forEach((x,i)=>walk(x,`${path}[${i}]`,out));else if(v&&typeof v==='object')for(const[k,x]of Object.entries(v)){if(k==='env'&&x&&typeof x==='object')for(const n of Object.keys(x))assert.doesNotMatch(n,/^GITHUB_/u);walk(x,`${path}.${k}`,out)}else if(typeof v==='string'&&secretRe.test(v))out.push({path,value:v});return out};
const protectedNames=new Set(Object.values(CONTROLLED_HUMAN_PHASE_SECRETS).flat());
const exactActions={
 checkout:'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683',
 node:'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
 upload:'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
 github:'actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea',
 download:'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093',
 supabase:'supabase/setup-cli@3c2f5e2ae34c34e428e8e206e2c4d21fa2d20fbf',
};
const uploadContracts={
 controlled_human_credentials_preflight:{name:'pr264-controlled-human-credential-preflight-${{ needs.controlled_human_authority.outputs.exact-head-sha }}-${{ github.run_id }}-${{ github.run_attempt }}',path:'output/pr-c-controlled-human-credential-preflight/credential-preflight.json'},
 controlled_human_edge:{name:'pr264-controlled-human-edge-deployment-${{ needs.controlled_human_authority.outputs.exact-head-sha }}-${{ github.run_id }}-${{ github.run_attempt }}',path:'output/controlled-human/edge-deployment.json\noutput/controlled-human/provider-baseline.json\n'},
 controlled_human_prepare:{name:'pr264-controlled-human-preparation-${{ needs.controlled_human_authority.outputs.exact-head-sha }}-${{ github.run_id }}-${{ github.run_attempt }}',path:'output/controlled-human/preparation.json\noutput/controlled-human/edge-deployment.json\noutput/controlled-human/verify.json\noutput/controlled-human/templates/\n'},
 controlled_human_quiesce:{name:'pr264-controlled-human-quiesce-${{ needs.controlled_human_authority.outputs.exact-head-sha }}-${{ github.run_id }}-${{ github.run_attempt }}',path:'output/controlled-human/quiesce.json'},
 controlled_human_requester:{name:'pr264-controlled-human-requester-${{ github.run_id }}-${{ github.run_attempt }}',path:'output/controlled-human/checkpoint-requester.json'},
 controlled_human_approver:{name:'pr264-controlled-human-approver-${{ github.run_id }}-${{ github.run_attempt }}',path:'output/controlled-human/checkpoint-approver.json'},
 controlled_human_reviewer:{name:'pr264-controlled-human-reviewer-${{ github.run_id }}-${{ github.run_attempt }}',path:'output/controlled-human/checkpoint-reviewer.json'},
 controlled_human_final:{name:'pr264-controlled-human-verified-${{ needs.controlled_human_authority.outputs.exact-head-sha }}-${{ github.run_id }}-${{ github.run_attempt }}',path:'output/controlled-human/verified-session.json\noutput/controlled-human/deprovision.json\noutput/controlled-human/post-deprovision.json\noutput/controlled-human/input/preparation.json\noutput/controlled-human/input/quiesce.json\noutput/controlled-human/input/checkpoint-requester.json\noutput/controlled-human/input/checkpoint-reviewer.json\noutput/controlled-human/input/checkpoint-approver.json\n'},
 controlled_human_recovery:{name:'pr264-controlled-human-recovery-${{ needs.controlled_human_authority.outputs.exact-head-sha }}-${{ github.run_id }}-${{ github.run_attempt }}',path:'output/controlled-human/recovery.json'},
 manual_recovery:{name:'pr264-controlled-human-recovery-${{ inputs.exact_head_sha }}-${{ github.run_id }}-${{ github.run_attempt }}',path:'output/controlled-human/recovery.json'},
};
const assertPinnedUses=workflow=>{for(const {value,path} of walkAll(workflow).filter(x=>x.path.endsWith('.uses'))){assert.match(value,/^[^@]+@[0-9a-f]{40}$/u,path);assert.ok(Object.values(exactActions).includes(value),path);}};
const walkAll=(v,path='$',out=[])=>{if(Array.isArray(v))v.forEach((x,i)=>walkAll(x,`${path}[${i}]`,out));else if(v&&typeof v==='object')for(const[k,x]of Object.entries(v))walkAll(x,`${path}.${k}`,out);else out.push({path,value:v});return out};
const assertBootstrap=(job,guardIndex,ref)=>{
 const checkout=job.steps.flatMap((step,index)=>step.uses===exactActions.checkout?[{step,index}]:[]);
 const setup=job.steps.flatMap((step,index)=>step.uses===exactActions.node?[{step,index}]:[]);
 const install=job.steps.flatMap((step,index)=>step.run==='npm ci'?[{step,index}]:[]);
 assert.equal(checkout.length,1);assert.equal(setup.length,1);assert.equal(install.length,1);
 assert.ok(checkout[0].index<setup[0].index&&setup[0].index<install[0].index&&install[0].index<guardIndex);
 assert.equal(install[0].index+1,guardIndex);
 assert.deepEqual(checkout[0].step.with,{ref,'fetch-depth':checkout[0].step.with['fetch-depth'],'persist-credentials':false});
 assert.ok([0,1].includes(checkout[0].step.with['fetch-depth']));
 assert.deepEqual(setup[0].step.with,{'node-version':22,cache:'npm'});
};
const assertConsumerContracts=(job,contractKey,jobName=contractKey)=>{
 const expectedConsumers=consumerContracts[contractKey];
 const expectedLeaves=[];
 for(const contract of expectedConsumers){
  const indexes=job.steps.flatMap((step,index)=>step.name===contract.name?[index]:[]);assert.equal(indexes.length,1,`${contractKey}:${contract.name}:count`);
  const index=indexes[0],step=job.steps[index];
  const actualSecretEnv=Object.fromEntries(Object.entries(step.env??{}).filter(([,value])=>secretRe.test(String(value))).map(([alias,value])=>[alias,String(value).match(/^\$\{\{ secrets\.([A-Z0-9_]+) \}\}$/u)?.[1]??value]));
  assert.deepEqual(actualSecretEnv,contract.env,`${contractKey}:${contract.name}:secret-bindings`);
  if(typeof contract.command==='string')assert.equal(step.run,contract.command,`${contractKey}:${contract.name}:command`);
  else if(typeof contract.command==='function')assert.equal(step.run,contract.command(jobName),`${contractKey}:${contract.name}:command`);
  else if(contract.command instanceof RegExp)assert.match(String(step.run??''),contract.command,`${contractKey}:${contract.name}:command`);
  if(contract.uses!==undefined){assert.equal(step.uses,contract.uses,`${contractKey}:${contract.name}:uses`);assert.equal(step.run,undefined,`${contractKey}:${contract.name}:action-only`);}else assert.equal(step.uses,undefined,`${contractKey}:${contract.name}:run-only`);
  for(const [alias,name] of Object.entries(contract.env))expectedLeaves.push({path:`${index}:${alias}`,value:secret(name)});
 }
 return expectedLeaves.sort((a,b)=>a.path.localeCompare(b.path));
};
const assertUpload=(job,contractKey)=>{const uploads=job.steps.filter(step=>step.uses===exactActions.upload);assert.equal(uploads.length,1,`${contractKey}:upload-count`);const upload=uploads[0],contract=uploadContracts[contractKey];assert.equal(upload.if,contractKey==='controlled_human_credentials_preflight'?'${{ success() }}':undefined);assert.equal(upload['continue-on-error'],undefined);assert.equal(upload.env,undefined);assert.deepEqual(upload.with,{name:contract.name,path:contract.path,'if-no-files-found':'error','retention-days':14});};
const assertExpressionRoots=(workflow,allowed)=>{for(const {path,value} of walkAll(workflow)){if(typeof value!=='string')continue;for(const match of value.matchAll(/\$\{\{\s*([A-Za-z_][A-Za-z0-9_-]*)/gu))assert.ok(allowed.has(match[1]),`${path}:unknown-expression-root:${match[1]}`);}};
const assertAuthority=workflow=>{const job=workflow.jobs.controlled_human_authority;assert.equal(job.environment,'hosted-nonproduction-pilot');assert.equal(job.needs,undefined);assert.equal(job.secrets,undefined);assert.equal(job.permissions,undefined);assert.equal(job.steps.length,1);assert.equal(job.steps[0].id,'authority');assert.equal(job.steps[0].uses,exactActions.github);assert.equal(job.steps[0].if,undefined);assert.equal(job.steps[0]['continue-on-error'],undefined);const script=job.steps[0].with.script;for(const marker of ["context.payload.action !== 'labeled'","context.payload.pull_request?.number !== 264","expectedBranch = 'controller/governed-delivery-monitor-pr-c-20260831'","trusted(context.actor)","trusted(process.env.TRIGGERING_ACTOR)","pull.state !== 'open'","run.event === 'pull_request'","run.status === 'completed'","run.conclusion === 'success'","run.id !== context.runId","preview.status !== 200","environment !== 'hosted_nonproduction_pilot'","pulls.listCommits","phase === 'abort' || phase === 'expiry'"])assert.match(script,new RegExp(marker.replaceAll(/[.*+?^${}()|[\]\\]/gu,'\\$&'),'u'));for(const [label,phase] of [['credentials-preflight','credentials-preflight'],['edge','edge'],['prepare','prepare'],['quiesce','quiesce'],['checkpoints','checkpoints'],['final','final'],['abort','abort'],['expiry','expiry']])assert.match(script,new RegExp(`\\['pr264-controlled-human-${label}', '${phase}'\\]`,'u'));assert.equal(walk(job).length,0);};
export function validateSemanticWorkflow(workflow){
 assert.deepEqual(Object.keys(workflow.on),['pull_request','workflow_dispatch']);assert.deepEqual(workflow.on.pull_request.types,['opened','synchronize','reopened','labeled']);assert.equal(workflow.on.workflow_dispatch,null);assert.deepEqual(workflow.permissions,{actions:'read',contents:'read',issues:'read','pull-requests':'read'});assert.equal(workflow.env,undefined);assert.equal(workflow.defaults,undefined);assertPinnedUses(workflow);assertExpressionRoots(workflow,new Set(['failure','github','needs','secrets','steps','success','vars']));
 assert.deepEqual(Object.keys(workflow.jobs),['exact-head-governed-evidence','controlled_human_authority',...Object.keys(expected)]);
 assert.equal(workflow.concurrency['cancel-in-progress'],false);assertAuthority(workflow);const jobs=Object.fromEntries(Object.entries(workflow.jobs).filter(([n])=>n.startsWith('controlled_human_')&&n!=='controlled_human_authority'));
 assert.deepEqual(Object.keys(jobs),Object.keys(expected));
 for(const [name,[phase,needs,condition]] of Object.entries(expected)){
  const job=jobs[name];assert.equal(job.uses,undefined);assert.equal(job.secrets,undefined);assert.equal(job.with,undefined);assert.equal(job.environment,'hosted-nonproduction-pilot');assert.deepEqual(job.needs,needs);assert.equal(job.if,condition);assert.equal(job.services,undefined);assert.equal(job.container,undefined);assert.equal(job.outputs,undefined);assert.equal(job.permissions,undefined);
  assert.equal(job['continue-on-error'],undefined);for(const [key,v] of Object.entries(job.env??{})){assert.equal(protectedNames.has(key),false,`${name}:job-env:${key}`);assert.doesNotMatch(String(v),/\bsecrets\b/iu);}
  const guardIndexes=job.steps.flatMap((step,index)=>step.run===guard(phase)?[index]:[]);assert.equal(guardIndexes.length,1,`${name}:guard-count`);const i=guardIndexes[0];assert.ok(i>=4,`${name}:guard`);const g=job.steps[i];assert.equal(g.if,undefined);assert.equal(g['continue-on-error'],undefined);
  assertBootstrap(job,i,name==='controlled_human_recovery'?'${{ needs.controlled_human_authority.outputs.trusted-execution-sha }}':'${{ needs.controlled_human_authority.outputs.exact-head-sha }}');
  assert.deepEqual(Object.keys(g.env??{}).sort(),[...CONTROLLED_HUMAN_PHASE_SECRETS[phase]].sort());for(const key of CONTROLLED_HUMAN_PHASE_SECRETS[phase])assert.equal(g.env[key],secret(key));
  assert.equal(job.steps.findIndex(s=>Object.values(s.env??{}).some(v=>String(v).includes('secrets.'))),i);
  const expectedLeaves=[...Object.keys(g.env).map(alias=>({path:`${i}:${alias}`,value:g.env[alias]})),...assertConsumerContracts(job,name in consumerContracts?name:'checkpoint',name)].sort((a,b)=>a.path.localeCompare(b.path));
  const actualLeaves=job.steps.flatMap((step,index)=>Object.entries(step.env??{}).filter(([,value])=>secretRe.test(String(value))).map(([alias,value])=>({path:`${index}:${alias}`,value}))).sort((a,b)=>a.path.localeCompare(b.path));assert.deepEqual(actualLeaves,expectedLeaves,`${name}:all-secret-paths`);
  const actual=job.steps.filter(s=>s!==g&&Object.values(s.env??{}).some(v=>secretRe.test(String(v))));
  for(const step of job.steps){const outside=JSON.stringify({run:step.run,with:step.with,if:step.if,outputs:step.outputs});assert.doesNotMatch(outside,/\bsecrets\b/iu);if(Object.values(step.env??{}).some(v=>String(v).includes('secrets.'))){assert.doesNotMatch(String(step.run??''),/GITHUB_(?:ENV|OUTPUT|PATH|STEP_SUMMARY)/u);assert.doesNotMatch(String(step.uses??''),/^actions\/upload-artifact@/u);if(step.name==='Protected exact-bound abort recovery after failed seed or evidence assembly'){assert.equal(step.if,"${{ failure() && steps.apply.outcome != 'skipped' && steps.verify_abort_recovery_ca.outcome == 'success' }}");assert.equal(step['continue-on-error'],true);}else{assert.equal(step['continue-on-error'],undefined);}}}
  assertUpload(job,name);
  if(name==='controlled_human_credentials_preflight')assert.deepEqual(job.steps.map(step=>step.name??null),[null,'Require exact checkout and accepted base',null,'Install exact dependencies before protected values','Require exact protected credential preflight secrets','Verify pinned Supabase CA without consuming credentials','Verify protected credential transport with bounded read-only checks','Upload sanitized credential transport report']);
 }
 for(const leaf of walk(workflow))assert.match(leaf.path,/\.jobs\.controlled_human_[a-z_]+\.steps\[\d+\]\.env\.[A-Z0-9_]+$/u,leaf.path);
}
const validate=validateSemanticWorkflow;
export function validateSemanticRecovery(workflow){const job=workflow.jobs.recover;assert.deepEqual(Object.keys(workflow.on),['workflow_dispatch']);const inputs=workflow.on.workflow_dispatch.inputs;assert.deepEqual(Object.keys(inputs),['exact_head_sha','trusted_execution_sha','netlify_deploy_id','exercise_digest','target_fingerprint','public_target_digest','reason']);for(const [name,input] of Object.entries(inputs)){assert.equal(input.required,true,`recover:${name}:required`);assert.equal(input.type,name==='reason'?'choice':'string');}assert.deepEqual(inputs.reason.options,['abort','expiry']);assert.deepEqual(workflow.permissions,{actions:'read',contents:'read','pull-requests':'read'});assert.deepEqual(workflow.concurrency,{group:'pr264-controlled-human-${{ inputs.exercise_digest }}','cancel-in-progress':false});assert.equal(workflow.env,undefined);assert.equal(workflow.defaults,undefined);assert.deepEqual(Object.keys(workflow.jobs),['recover']);assertPinnedUses(workflow);assertExpressionRoots(workflow,new Set(['github','inputs','secrets']));assert.equal(job.environment,'hosted-nonproduction-pilot');assert.equal(job.secrets,undefined);assert.equal(job.uses,undefined);assert.equal(job.services,undefined);assert.equal(job.container,undefined);assert.equal(job.outputs,undefined);assert.equal(job.permissions,undefined);for(const name of Object.keys(job.env??{})){assert.doesNotMatch(name,/^GITHUB_/u);assert.equal(protectedNames.has(name),false);}const guards=job.steps.filter(s=>s.run===guard('recover'));assert.equal(guards.length,1);assert.equal(guards[0].if,undefined);assert.equal(guards[0]['continue-on-error'],undefined);assert.deepEqual(Object.keys(guards[0].env).sort(),[...CONTROLLED_HUMAN_PHASE_SECRETS.recover].sort());for(const key of CONTROLLED_HUMAN_PHASE_SECRETS.recover)assert.equal(guards[0].env[key],secret(key));const guardIndex=job.steps.indexOf(guards[0]);assertBootstrap(job,guardIndex,'${{ inputs.trusted_execution_sha }}');const first=job.steps.findIndex(s=>Object.values(s.env??{}).some(v=>secretRe.test(String(v))));assert.equal(job.steps[first],guards[0]);const expectedLeaves=[...Object.keys(guards[0].env).map(alias=>({path:`${guardIndex}:${alias}`,value:guards[0].env[alias]})),...assertConsumerContracts(job,'manual_recovery')].sort((a,b)=>a.path.localeCompare(b.path));const actualLeaves=job.steps.flatMap((step,index)=>Object.entries(step.env??{}).filter(([,value])=>secretRe.test(String(value))).map(([alias,value])=>({path:`${index}:${alias}`,value}))).sort((a,b)=>a.path.localeCompare(b.path));assert.deepEqual(actualLeaves,expectedLeaves);for(const step of job.steps)if(Object.values(step.env??{}).some(value=>secretRe.test(String(value)))){assert.doesNotMatch(String(step.run??''),/GITHUB_(?:ENV|OUTPUT|PATH|STEP_SUMMARY)/u);assert.equal(step['continue-on-error'],undefined);}assertUpload(job,'manual_recovery');for(const leaf of walk(workflow))assert.match(leaf.path,/\.jobs\.recover\.steps\[\d+\]\.env\.[A-Z0-9_]+$/u);}
test('actual workflow runtime matrix binds all 18 controller invocations through real pre-adapter derivation',async()=>{
 const [{workflow:primary},{workflow:recovery},packageManifest,fixtureState,migration]=await Promise.all([load(PRIMARY),load(RECOVERY),loadPackageManifest(),loadFixture(),loadMigration()]);
 const githubEnv=await materializeMigrationGithubEnv(primary,migration);let networkCalls=0;const originalFetch=globalThis.fetch;
 globalThis.fetch=(..._arguments)=>{networkCalls++;throw new Error('UNEXPECTED_NETWORK_CALL');};
 try{const contexts=validateRuntimeInvocationMatrix({primary,recovery,packageManifest,fixtureState,migration,githubEnv});assert.equal(contexts.length,18);}finally{globalThis.fetch=originalFetch;}
 assert.equal(networkCalls,0);
});
test('runtime job authority rejects missing, substituted, divergent, or step-overridden bindings',async()=>{
 const [{workflow:loadedPrimary},{workflow:loadedRecovery},packageManifest,fixtureState,migration]=await Promise.all([load(PRIMARY),load(RECOVERY),loadPackageManifest(),loadFixture(),loadMigration()]);
 const githubEnv={PR_C_CONTROLLED_HUMAN_MIGRATION_DIGEST:migration.digest};
 const reject=({primary=loadedPrimary,recovery=loadedRecovery,manifest=packageManifest}={})=>assert.throws(()=>validateRuntimeInvocationMatrix({primary,recovery,packageManifest:manifest,fixtureState,migration,githubEnv}),assert.AssertionError);
 const jobs=[...normalRuntimeJobs.map(jobName=>({workflowPath:PRIMARY,jobName,expectedEnv:normalRuntimeEnv})),{workflowPath:PRIMARY,jobName:'controlled_human_recovery',expectedEnv:primaryRecoveryRuntimeEnv},{workflowPath:RECOVERY,jobName:'recover',expectedEnv:manualRecoveryRuntimeEnv}];
 for(const {workflowPath,jobName,expectedEnv} of jobs){
  for(const key of ['PR_C_CONTROLLED_HUMAN_SITE_NAME','PR_C_CONTROLLED_HUMAN_NETLIFY_CONTEXT','PR_C_CONTROLLED_HUMAN_EXPECTED_EXERCISE_DIGEST']){
   const primary=structuredClone(loadedPrimary),recovery=structuredClone(loadedRecovery),workflow=workflowPath===PRIMARY?primary:recovery;delete workflow.jobs[jobName].env[key];reject({primary,recovery});
  }
  for(const key of Object.keys(expectedEnv)){
   const primary=structuredClone(loadedPrimary),recovery=structuredClone(loadedRecovery),workflow=workflowPath===PRIMARY?primary:recovery;workflow.jobs[jobName].env[key]=key==='PR_C_CONTROLLED_HUMAN_PR_NUMBER'?265:'substituted';reject({primary,recovery});
  }
 }
 for(const expectedInvocation of expectedRuntimeInvocations){
  const [workflowPath,jobName,stepName]=expectedInvocation,primary=structuredClone(loadedPrimary),recovery=structuredClone(loadedRecovery),workflow=workflowPath===PRIMARY?primary:recovery;
  workflow.jobs[jobName].steps.find(step=>step.name===stepName).env={...(workflow.jobs[jobName].steps.find(step=>step.name===stepName).env??{}),PR_C_CONTROLLED_HUMAN_SITE_NAME:'substituted'};reject({primary,recovery});
 }
 {const manifest=structuredClone(packageManifest);manifest.scripts['pr-c-controlled-human:preflight']='node scripts/prCControlledHumanEnvironment.mjs verify';reject({manifest});}
});
test('runtime invocation discovery rejects unknown, duplicate, and omitted controller consumers',async()=>{
 const [{workflow:loadedPrimary},{workflow:loadedRecovery},packageManifest,fixtureState,migration]=await Promise.all([load(PRIMARY),load(RECOVERY),loadPackageManifest(),loadFixture(),loadMigration()]);
 const githubEnv={PR_C_CONTROLLED_HUMAN_MIGRATION_DIGEST:migration.digest},reject=primary=>assert.throws(()=>validateRuntimeInvocationMatrix({primary,recovery:loadedRecovery,packageManifest,fixtureState,migration,githubEnv}),assert.AssertionError);
 const locate=primary=>primary.jobs.controlled_human_quiesce.steps.find(candidate=>candidate.name==='Reverify exact preview and active synthetic state');
 {const primary=structuredClone(loadedPrimary);locate(primary).run+='\nnode scripts/prCControlledHumanEnvironment.mjs verify --output duplicate.json';reject(primary);}
 {const primary=structuredClone(loadedPrimary);locate(primary).run=locate(primary).run.replace('node scripts/prCControlledHumanEnvironment.mjs verify --output output/controlled-human/current-verify.json','');reject(primary);}
 {const primary=structuredClone(loadedPrimary);locate(primary).run=locate(primary).run.replace('prCControlledHumanEnvironment.mjs verify','prCControlledHumanEnvironment.mjs unknown');reject(primary);}
});
test('every real runtime consumer rejects foreign context and checkout before adapter construction',async()=>{
 const [{workflow:primary},{workflow:recovery},packageManifest,fixtureState,migration]=await Promise.all([load(PRIMARY),load(RECOVERY),loadPackageManifest(),loadFixture(),loadMigration()]);
 const githubEnv={PR_C_CONTROLLED_HUMAN_MIGRATION_DIGEST:migration.digest},invocations=[...discoverRuntimeInvocations(PRIMARY,primary),...discoverRuntimeInvocations(RECOVERY,recovery)];assert.equal(invocations.length,18);
 const runtimeCases=[
  ['wrong-valid-exercise',env=>({...env,PR_C_CONTROLLED_HUMAN_EXERCISE_ID:RUNTIME_OTHER_EXERCISE_ID})],
  ['wrong-environment',env=>({...env,PR_C_CONTROLLED_HUMAN_ENVIRONMENT_CLASS:'production'})],
  ['wrong-pr',env=>({...env,PR_C_CONTROLLED_HUMAN_PR_NUMBER:'265'})],
  ['wrong-head',env=>({...env,PR_C_CONTROLLED_HUMAN_RELEASE_SHA:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'})],
  ['wrong-deploy',env=>({...env,PR_C_CONTROLLED_HUMAN_DEPLOY_ID:'invalid'})],
  ['wrong-origin',env=>({...env,PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN:'https://example.invalid'})],
  ['missing-site',env=>{delete env.PR_C_CONTROLLED_HUMAN_SITE_NAME;return env;}],['wrong-site',env=>({...env,PR_C_CONTROLLED_HUMAN_SITE_NAME:'substituted'})],
  ['missing-context',env=>{delete env.PR_C_CONTROLLED_HUMAN_NETLIFY_CONTEXT;return env;}],['wrong-context',env=>({...env,PR_C_CONTROLLED_HUMAN_NETLIFY_CONTEXT:'production'})],
  ['foreign-target',env=>({...env,PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT:`sha256:${'8'.repeat(64)}`})],
  ['foreign-public-target',env=>({...env,PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST:`sha256:${'9'.repeat(64)}`})],
  ['wrong-expected-exercise',env=>({...env,PR_C_CONTROLLED_HUMAN_EXPECTED_EXERCISE_DIGEST:`sha256:${'a'.repeat(64)}`})],
 ];
 let networkCalls=0;const originalFetch=globalThis.fetch;globalThis.fetch=(..._arguments)=>{networkCalls++;throw new Error('UNEXPECTED_NETWORK_CALL');};
 try{
  for(const target of invocations){
   for(const [name,mutate] of runtimeCases)assert.throws(()=>validateRuntimeInvocationMatrix({primary,recovery,packageManifest,fixtureState,migration,githubEnv,runtimeEnvMutator:(env,invocation)=>sameRuntimeInvocation(invocation,target)?mutate(env):env}),undefined,`${runtimeInvocationIdentity(target)}:${name}`);
   assert.throws(()=>validateRuntimeInvocationMatrix({primary,recovery,packageManifest,fixtureState,migration,githubEnv,checkoutMutator:(checkout,invocation)=>sameRuntimeInvocation(invocation,target)?{...checkout,head:'cccccccccccccccccccccccccccccccccccccccc'}:checkout}),undefined,`${runtimeInvocationIdentity(target)}:checkout`);
   if(target.entrypoint==='migration')assert.throws(()=>validateRuntimeInvocationMatrix({primary,recovery,packageManifest,fixtureState,migration,githubEnv,runtimeEnvMutator:(env,invocation)=>sameRuntimeInvocation(invocation,target)?{...env,PR_C_CONTROLLED_HUMAN_MIGRATION_DIGEST:`sha256:${'b'.repeat(64)}`}:env}),undefined,`${runtimeInvocationIdentity(target)}:migration-digest`);
  }
 }finally{globalThis.fetch=originalFetch;}
 assert.equal(networkCalls,0);
});
test('primary owns exact direct protected jobs without reusable secret transport',async()=>{const {source,workflow}=await load(PRIMARY);validate(workflow);for(const [name,hash] of Object.entries(jobDigests))assert.equal(digest(workflow.jobs[name]),hash);assert.doesNotMatch(source,/PR264_ENVIRONMENT_SECRET_REQUIRED|secrets:\s*inherit|uses:\s*\.\/\.github\/workflows\/pr264-controlled-human/u);for(const n of ['edge-deploy','prepare','quiesce','checkpoint','verify'])assert.equal(existsSync(`.github/workflows/pr264-controlled-human-${n}.yml`),false);});
test('direct contract rejects missing, displaced, skippable, persisted, and global guards',async()=>{const {workflow}=await load(PRIMARY),xs=[];{const x=structuredClone(workflow);x.jobs.controlled_human_edge.steps=x.jobs.controlled_human_edge.steps.filter(s=>s.run!==guard('edge'));xs.push(x)}{const x=structuredClone(workflow),s=x.jobs.controlled_human_edge.steps,i=s.findIndex(v=>v.run===guard('edge')),j=s.findIndex((v,n)=>n>i&&Object.values(v.env??{}).some(value=>String(value).includes('secrets.')));[s[i],s[j]]=[s[j],s[i]];xs.push(x)}{const x=structuredClone(workflow);x.jobs.controlled_human_prepare.steps.find(s=>s.run===guard('prepare')).if='${{ false }}';xs.push(x)}{const x=structuredClone(workflow);x.jobs.controlled_human_quiesce.steps.find(s=>s.run===guard('quiesce'))['continue-on-error']=true;xs.push(x)}{const x=structuredClone(workflow);x.jobs.controlled_human_final.env.PR_C_CONTROLLED_HUMAN_DATABASE_URL=secret('PR_C_CONTROLLED_HUMAN_DATABASE_URL');xs.push(x)}{const x=structuredClone(workflow);x.jobs.controlled_human_requester.steps.find(s=>s.run===guard('checkpoint')).run+='\necho x >> "$GITHUB_OUTPUT"';xs.push(x)}for(const x of xs)assert.throws(()=>validate(x),assert.AssertionError);});
test('credential preflight is PAT-free, CA-adjacent, read-only and uploads one report',async()=>{const {workflow}=await load(PRIMARY),j=workflow.jobs.controlled_human_credentials_preflight,s=j.steps,i=s.findIndex(x=>x.run===guard('preflight'));assert.equal(s[i+1].run,'node scripts/prCControlledHumanPostgresTls.mjs verify-ca');assert.equal(s[i+2].run,'node scripts/prCControlledHumanCredentialPreflight.mjs');assert.equal(JSON.stringify(j).includes('SUPABASE_ACCESS_TOKEN'),false);const u=s.filter(x=>String(x.uses??'').startsWith('actions/upload-artifact@'));assert.equal(u.length,1);assert.equal(u[0].if,'${{ success() }}');assert.equal(u[0].with.path,'output/pr-c-controlled-human-credential-preflight/credential-preflight.json');assert.equal(u[0].with['if-no-files-found'],'error');});
test('manual recovery is separate direct environment dispatch',async()=>{const {source,workflow}=await load(RECOVERY);validateSemanticRecovery(workflow);assert.equal(digest(workflow.jobs.recover),'772753ccec55f3ecd9c4a0195f469ce53093a7c8d5f05b30c1ce105fdd3aa277');assert.equal(workflow.jobs.recover.environment,'hosted-nonproduction-pilot');assert.doesNotMatch(source,/workflow_call|PR264_ENVIRONMENT_SECRET_REQUIRED|secrets:\s*inherit/u);assert.match(source,/ref: \$\{\{ inputs\.trusted_execution_sha \}\}/u);});
test('every direct phase rejects secret transport, bracket access, duplicate guards, and built-in overrides',async()=>{const {workflow}=await load(PRIMARY);for(const [name,[phase]] of Object.entries(expected)){for(const mutate of [job=>{job.secrets='inherit'},job=>{job.steps.push({name:'unsafe',run:"echo ${{ secrets['PR_C_CONTROLLED_HUMAN_DATABASE_URL'] }}"})},job=>{job.steps.push(structuredClone(job.steps.find(s=>s.run===guard(phase))))},job=>{job.env.GITHUB_JOB='substituted'}]){const x=structuredClone(workflow);mutate(x.jobs[name]);assert.throws(()=>validate(x),assert.AssertionError,`${name}:${phase}`);}}});
test('semantic phase contracts reject command, alias, upload, service, output, and early-secret substitutions',async()=>{const {workflow}=await load(PRIMARY);for(const [name] of Object.entries(expected)){const key=name in consumerContracts?name:'checkpoint',first=consumerContracts[key][0];for(const mutate of [job=>{job.steps.find(step=>step.name===first.name).run='echo substituted'},job=>{const step=job.steps.find(candidate=>candidate.name===first.name),alias=Object.keys(first.env)[0];step.env[alias]=secret(CONTROLLED_HUMAN_PHASE_SECRETS[expected[name][0]].find(value=>value!==first.env[alias])??'PR_C_CONTROLLED_HUMAN_UNKNOWN')},job=>{job.steps.find(step=>step.uses===exactActions.upload).with.name='substituted'},job=>{job.services={leak:{env:{TOKEN:secret(DATABASE_URL)}}}},job=>{job.outputs={leak:secret(DATABASE_URL)}},job=>{job.steps.unshift({name:'early',env:{LEAK:secret(CONTROLLED_HUMAN_PHASE_SECRETS[expected[name][0]][0])},run:'true'})}]){const x=structuredClone(workflow);mutate(x.jobs[name]);assert.throws(()=>validate(x),assert.AssertionError,`${name}:${first.name}`);}}});
test('semantic authority contract rejects trigger, actor, phase, expression-root, permission and protected-job substitutions',async()=>{const {workflow}=await load(PRIMARY);for(const [label,mutate] of [['trigger',x=>{x.on.pull_request.types=['opened']}],['permission',x=>{x.permissions.actions='write'}],['event-check',x=>{x.jobs.controlled_human_authority.steps[0].with.script=x.jobs.controlled_human_authority.steps[0].with.script.replace("context.payload.action !== 'labeled'","false")}],['phase',x=>{x.jobs.controlled_human_authority.steps[0].with.script=x.jobs.controlled_human_authority.steps[0].with.script.replace('pr264-controlled-human-edge','pr264-controlled-human-other')}],['actor',x=>{x.jobs.controlled_human_authority.steps[0].with.script=x.jobs.controlled_human_authority.steps[0].with.script.replace("trusted(context.actor)",'true')}],['bare-role-expression',x=>{x.jobs.controlled_human_requester.steps.find(step=>step.name==='Retrieve immutable human duty comment and reject edited or substituted evidence').env.EXPECTED_ROLE='${{ requester }}'}],['unknown-expression-root',x=>{x.jobs.controlled_human_edge.steps[0].with.ref='${{ untrusted.sha }}'}],['extra-job',x=>{x.jobs.controlled_human_extra=structuredClone(x.jobs.controlled_human_edge)}]]){const changed=structuredClone(workflow);mutate(changed);assert.throws(()=>validate(changed),assert.AssertionError,label);}});
test('preflight has no provider, admin, migration, seed, deploy, mutation, or broad permission path',async()=>{const {workflow}=await load(PRIMARY),job=workflow.jobs.controlled_human_credentials_preflight,runs=job.steps.map(s=>String(s.run??'')).join('\n');assert.doesNotMatch(runs,/provider|admin|migration|seed|deploy|apply|write|mutat/iu);assert.equal(job.permissions,undefined);assert.equal(job.services,undefined);assert.equal(job.container,undefined);assert.equal(job.steps.some(s=>s['continue-on-error']!==undefined),false);});
test('preflight semantic contract rejects added mutation/provider/Admin/deploy and broad permission steps',async()=>{const {workflow}=await load(PRIMARY);for(const run of ['node provider.mjs','node admin.mjs','npm run migration','npm run seed','npm run deploy','node write.mjs']){const changed=structuredClone(workflow);changed.jobs.controlled_human_credentials_preflight.steps.splice(-1,0,{name:'unsafe extension',run});assert.throws(()=>validate(changed),assert.AssertionError);}for(const mutate of [job=>{job.permissions={contents:'write'}},job=>{job.steps.find(step=>step.run===guard('preflight')).if='${{ false }}'},job=>{job.steps.find(step=>step.run===guard('preflight'))['continue-on-error']=true}]){const changed=structuredClone(workflow);mutate(changed.jobs.controlled_human_credentials_preflight);assert.throws(()=>validate(changed),assert.AssertionError);}});
test('manual recovery semantic guard rejects transport, early secrets, skipping and built-in overrides',async()=>{const {workflow}=await load(RECOVERY);for(const mutate of [j=>{j.secrets='inherit'},j=>{j.env.GITHUB_JOB='recover'},j=>{j.steps.unshift({name:'early',run:'echo ${{ secrets.PR_C_CONTROLLED_HUMAN_DATABASE_URL }}'})},j=>{j.steps.find(s=>s.run===guard('recover')).if='${{ false }}'},j=>{j.steps.push(structuredClone(j.steps.find(s=>s.run===guard('recover'))))}]){const x=structuredClone(workflow);mutate(x.jobs.recover);assert.throws(()=>validateSemanticRecovery(x),assert.AssertionError);}});
test('manual recovery rejects command, alias, upload, trigger, expression-root, permission and checkout substitutions',async()=>{const {workflow}=await load(RECOVERY);for(const mutate of [x=>{x.on.workflow_dispatch.inputs.reason.options=['abort']},x=>{x.permissions.contents='write'},x=>{x.jobs.recover.steps.find(step=>step.name===consumerContracts.manual_recovery[0].name).env.SUPABASE_PROJECT_REF=secret(DATABASE_URL)},x=>{x.jobs.recover.steps.find(step=>step.name===consumerContracts.manual_recovery[1].name).run='echo substituted'},x=>{x.jobs.recover.steps.find(step=>step.uses===exactActions.upload).with.name='substituted'},x=>{x.jobs.recover.steps.find(step=>step.uses===exactActions.checkout).with.ref='${{ requester }}'},x=>{x.jobs.recover.steps.find(step=>step.uses===exactActions.checkout).with.ref='${{ inputs.exact_head_sha }}'}]){const changed=structuredClone(workflow);mutate(changed);assert.throws(()=>validateSemanticRecovery(changed),assert.AssertionError);}});
