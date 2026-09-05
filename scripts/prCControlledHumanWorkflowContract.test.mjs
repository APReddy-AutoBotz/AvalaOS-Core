import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parseWorkflowYaml } from './checkWorkflowYaml.mjs';
import { CHECKPOINT_WORKFLOW, EDGE_DEPLOY_WORKFLOW, PREPARE_WORKFLOW, PREVIEW_ORIGIN, QUIESCE_WORKFLOW, RECOVERY_WORKFLOW, VERIFY_WORKFLOW } from './prCControlledHumanEvidenceContract.mjs';

const load = async workflowPath => {
  const source = (await readFile(workflowPath, 'utf8')).replaceAll('\r\n','\n');
  return { source, workflow: parseWorkflowYaml(source, workflowPath) };
};
const assertReusable = ({source,workflow}) => {
  assert.deepEqual(Object.keys(workflow.on), ['workflow_call']);
  assert.doesNotMatch(source, /workflow_dispatch/u);
  assert.match(source, /github\.event_name == 'pull_request'/u);
  assert.match(source, /github\.event\.pull_request\.number == 264/u);
};
const assertPinned = source => {
  const uses = [...source.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gmu)].map(match=>match[1]);
  assert.ok(uses.length > 0);
  for (const use of uses) assert.match(use, /^[^@]+@[0-9a-f]{40}$/u);
};
const assertNoJobSecrets = workflow => {
  for (const job of Object.values(workflow.jobs)) for (const value of Object.values(job.env ?? {})) assert.doesNotMatch(String(value), /secrets\./u);
};

test('package and workflow authority expose no stale resume path', async () => {
  const packageJson=JSON.parse(await readFile('package.json','utf8'));
  assert.equal(Object.hasOwn(packageJson.scripts,'pr-c-controlled-human:resume'),false);
  for(const workflowPath of [CHECKPOINT_WORKFLOW,EDGE_DEPLOY_WORKFLOW,PREPARE_WORKFLOW,QUIESCE_WORKFLOW,RECOVERY_WORKFLOW,VERIFY_WORKFLOW]) {
    const source=await readFile(workflowPath,'utf8');
    assert.doesNotMatch(source,/pr-c-controlled-human:resume|prCControlledHumanEnvironment[.]mjs resume|\bresume --authority\b/u);
  }
});
test('every reusable phase binds the protected public target digest into controller context',async()=>{
  for(const workflowPath of [CHECKPOINT_WORKFLOW,EDGE_DEPLOY_WORKFLOW,PREPARE_WORKFLOW,QUIESCE_WORKFLOW,RECOVERY_WORKFLOW,VERIFY_WORKFLOW]) {
    const {source,workflow}=await load(workflowPath);
    assert.equal(workflow.on.workflow_call.inputs.public_target_digest.required,true);
    const job=Object.values(workflow.jobs)[0];
    assert.equal(job.env.PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST,'${{ inputs.public_target_digest }}');
    assert.match(source,/PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST/u);
  }
});
const assertProtectedEnvironmentSecrets = ({ source, workflow }, names) => {
  assert.equal(workflow.on.workflow_call.inputs.exercise_id, undefined);
  assert.equal(workflow.on.workflow_call.secrets, undefined);
  for (const name of names) assert.match(source, new RegExp(`secrets\\.${name}`, 'u'));
  assert.doesNotMatch(source, /secrets\.(?:database_url|exercise_id|supabase_url|supabase_access_token|supabase_project_ref|supabase_service_role_key|password_bundle_json|evidence_hmac_key)/u);
};

test('preparation is reusable from exact-head PR CI, action-pinned, and step-scopes protected values', async () => {
  const loaded=await load(PREPARE_WORKFLOW); assertReusable(loaded); assertPinned(loaded.source); assertNoJobSecrets(loaded.workflow);
  assertProtectedEnvironmentSecrets(loaded, ['PR_C_CONTROLLED_HUMAN_DATABASE_URL', 'PR_C_CONTROLLED_HUMAN_EXERCISE_ID', 'PR_C_CONTROLLED_HUMAN_SUPABASE_URL', 'PR_C_CONTROLLED_HUMAN_SUPABASE_SERVICE_ROLE_KEY', 'PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF', 'PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_JSON', 'PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY']);
  const {source,workflow}=loaded; const job=workflow.jobs.prepare;
  assert.equal(job.environment,'hosted-nonproduction-pilot'); assert.equal(job.env.PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN,PREVIEW_ORIGIN);
  assert.match(source,/pull\.head\.sha !== process\.env\.EXPECTED_HEAD/u); assert.match(source,/artifact\.digest !== process\.env\.EXPECTED_ARTIFACT_DIGEST/u);
  assert.match(source,/run\.event !== 'pull_request'/u); assert.match(source,/output\/controlled-human\/verify\.json/u);
  assert.match(source,/recover-reset --reason abort/u);
  const checkout=job.steps.find(step=>String(step.uses??'').startsWith('actions/checkout@')); assert.equal(checkout.with['persist-credentials'],false);
  assert.doesNotMatch(source,/https:\/\/(?:www\.)?avalaos\.com/iu);
});

test('Edge workflow retains provider baseline, provider receipt and runtime observation without claiming local equality', async () => {
  const loaded=await load(EDGE_DEPLOY_WORKFLOW); assertReusable(loaded); assertPinned(loaded.source); assertNoJobSecrets(loaded.workflow);
  assertProtectedEnvironmentSecrets(loaded, ['PR_C_CONTROLLED_HUMAN_DATABASE_URL', 'PR_C_CONTROLLED_HUMAN_EXERCISE_ID', 'PR_C_CONTROLLED_HUMAN_SUPABASE_URL', 'PR_C_CONTROLLED_HUMAN_SUPABASE_ACCESS_TOKEN', 'PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF', 'PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY']);
  const {source,workflow}=loaded; const job=workflow.jobs['deploy-exact-edge-source']; assert.equal(job.environment,'hosted-nonproduction-pilot');
  assert.match(source,/--provider-baseline output\/controlled-human\/provider-baseline\.json/u);
  assert.match(source,/provider-attested deployment and runtime manifest/u);
  assert.match(source,/pr-c-controlled-human-synthetic-generation/u);
  assert.doesNotMatch(source,/verified_exact_source|deployedSourceDigest/u);
  assert.match(source,/supabase\/setup-cli@3c2f5e2ae34c34e428e8e206e2c4d21fa2d20fbf/u);
  assert.doesNotMatch(source,/console\.(?:log|error)|response\.(?:text|arrayBuffer)\(/u);
});

test('checkpoint workflow binds immutable PR comments to application duties and backend observations', async () => {
  const loaded=await load(CHECKPOINT_WORKFLOW); assertReusable(loaded); assertPinned(loaded.source); assertNoJobSecrets(loaded.workflow);
  assertProtectedEnvironmentSecrets(loaded, ['PR_C_CONTROLLED_HUMAN_DATABASE_URL', 'PR_C_CONTROLLED_HUMAN_EXERCISE_ID', 'PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY']);
  const {source,workflow}=loaded; const job=workflow.jobs.capture; assert.equal(job.environment,'hosted-nonproduction-pilot');
  assert.match(source,/issues\.getComment/u); assert.match(source,/comment\.created_at !== comment\.updated_at/u);
  assert.match(source,/\$\{kind\} run identity mismatch/u); assert.match(source,/immutable \$\{kind\} artifact missing or ambiguous/u);
  assert.match(source,/comment\.user\?\.type !== 'User'/u); assert.match(source,/checkpoint-observe --request/u);
  assert.match(source,/serverBinding\?\.bindingToken \?\? null/u);
  assert.match(source,/quiesce_run_id/u); assert.match(source,/Validate the exact pre-comment read-only transition/u);
  assert.doesNotMatch(source,/prCControlledHumanEnvironment\.mjs quiesce/u);
  assert.match(source,/--quiesce .* --comment .* --observer /u); assert.match(source,/rmSync\('output\/controlled-human\/private'/u);
  assert.doesNotMatch(source,/OBSERVATIONS_JSON|GITHUB_ACTOR/u);
});

test('quiesce workflow enters server-enforced read-only before comments can attest that state', async () => {
  const loaded=await load(QUIESCE_WORKFLOW); assertReusable(loaded); assertPinned(loaded.source); assertNoJobSecrets(loaded.workflow);
  assertProtectedEnvironmentSecrets(loaded, ['PR_C_CONTROLLED_HUMAN_DATABASE_URL', 'PR_C_CONTROLLED_HUMAN_EXERCISE_ID', 'PR_C_CONTROLLED_HUMAN_SUPABASE_URL', 'PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF']);
  const {source,workflow}=loaded; const job=workflow.jobs.quiesce; assert.equal(job.environment,'hosted-nonproduction-pilot');
  const active=job.steps.findIndex(step=>step.name==='Reverify exact preview and active synthetic state');
  const transition=job.steps.findIndex(step=>step.name==='Enter exact server-enforced read-only state before any read-only human observation');
  const upload=job.steps.findIndex(step=>String(step.uses??'').startsWith('actions/upload-artifact@'));
  assert.ok(active>=0 && active<transition && transition<upload);
  assert.match(source,/quiesce --authority output\/controlled-human\/current-verify\.json/u);
  assert.match(source,/pr264-controlled-human-quiesce-/u);
  assert.doesNotMatch(source,/issues\.(?:getComment|listComments)/u);
});

test('final verification validates signed evidence then deprovisions directly from frozen read-only state', async () => {
  const loaded=await load(VERIFY_WORKFLOW); assertReusable(loaded); assertPinned(loaded.source); assertNoJobSecrets(loaded.workflow);
  assertProtectedEnvironmentSecrets(loaded, ['PR_C_CONTROLLED_HUMAN_DATABASE_URL', 'PR_C_CONTROLLED_HUMAN_EXERCISE_ID', 'PR_C_CONTROLLED_HUMAN_SUPABASE_URL', 'PR_C_CONTROLLED_HUMAN_SUPABASE_SERVICE_ROLE_KEY', 'PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF', 'PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY']);
  const {source,workflow}=loaded; const steps=workflow.jobs.verify.steps;
  const immutableComments=steps.findIndex(step=>step.name==='Revalidate immutable human comments and exact signed observation bytes');
  const validate=steps.findIndex(step=>step.name==='Validate preparation and every signed human/server checkpoint before reset');
  const deprovision=steps.findIndex(step=>step.name==='Deprovision exact synthetic exercise directly from frozen read-only state');
  const post=steps.findIndex(step=>step.name==='Independently re-inspect post-deprovision state');
  const session=steps.findIndex(step=>step.name==='Build verified human session from recomputed evidence');
  assert.ok(immutableComments>=0 && immutableComments<validate && validate<deprovision && deprovision<post && post<session);
  assert.doesNotMatch(source,/\bresume\b/u); assert.match(source,/deprovision --authority .*quiesce\.json/u);
  assert.match(source,/post-deprovision-verify --authority .*deprovision\.json/u);
  assert.match(source,/--post-deprovision .*post-deprovision\.json/u);
  assert.match(source,/issues\.getComment/u); assert.match(source,/comment\.created_at !== comment\.updated_at/u);
  assert.match(source,/checkpoint\.signerDigest !== signerDigest/u); assert.match(source,/observation-bytes/u);
  assert.equal(workflow.permissions.issues, 'read');
  assert.doesNotMatch(source,/gh pr merge|git push|netlify deploy|supabase functions deploy/iu);
  assert.doesNotMatch(source,/https:\/\/(?:www\.)?avalaos\.com/iu);
});

test('manual recovery is protected, exact-pr-history bound, and supports abort or expiry after head advance', async () => {
  const {source,workflow}=await load(RECOVERY_WORKFLOW);assertPinned(source);assertNoJobSecrets(workflow);
  assert.deepEqual(Object.keys(workflow.on),['workflow_call','workflow_dispatch']);
  for (const input of ['exact_head_sha','netlify_deploy_id','exercise_digest','target_fingerprint','public_target_digest','reason']) assert.equal(workflow.on.workflow_call.inputs[input].required,true);
  assert.equal(workflow.on.workflow_dispatch.inputs.public_target_digest.required,true);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.reason.options,['abort','expiry']);
  const job=workflow.jobs.recover;assert.equal(job.environment,'hosted-nonproduction-pilot');assert.equal(workflow.concurrency['cancel-in-progress'],false);
  assert.equal(job.env.PR_C_CONTROLLED_HUMAN_EXPECTED_EXERCISE_DIGEST,'${{ inputs.exercise_digest }}');
  assert.match(source,/pulls\.listCommits/u);assert.match(source,/head was not part of PR 264/u);assert.match(source,/untrusted PR source/u);
  assert.match(source,/recover-reset --reason \$\{\{ inputs\.reason \}\}/u);assert.match(source,/pr_c_controlled_human_recovery_authorities/u);
  assert.match(source,/secrets\.PR_C_CONTROLLED_HUMAN_SUPABASE_SERVICE_ROLE_KEY/u);assert.doesNotMatch(source,/secrets:\s*inherit/u);
  assert.doesNotMatch(source,/https:\/\/(?:www\.)?avalaos\.com/iu);
});

test('primary PR C workflow exposes only exact trusted label phases and prior immutable producers', async () => {
  const { source, workflow } = await load('.github/workflows/transcript-flow-pr-c.yml');
  assert.deepEqual(workflow.on.pull_request.types, ['opened', 'synchronize', 'reopened', 'labeled']);
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  for (const permission of ['actions', 'contents', 'issues', 'pull-requests']) assert.equal(workflow.permissions[permission], 'read');
  for (const label of ['pr264-controlled-human-edge', 'pr264-controlled-human-prepare', 'pr264-controlled-human-quiesce', 'pr264-controlled-human-checkpoints', 'pr264-controlled-human-final', 'pr264-controlled-human-abort', 'pr264-controlled-human-expiry']) assert.match(source, new RegExp(label, 'u'));
  assert.match(source, /github\.event\.action == 'labeled'/u);
  assert.match(source, /apreddy-autobotz/u);
  assert.match(source, /run\.id !== context\.runId/u);
  assert.match(source, /run\.status === 'completed'/u);
  assert.match(source, /run\.conclusion === 'success'/u);
  assert.match(source, /preview\.headers\.get\('x-avalaos-netlify-deploy-id'\)/u);
  assert.match(source, /new Set\(\[\.\.\.selected\.values\(\)\]/u);
  assert.match(source, /RECOVERY_HEAD_SHA/u);
  assert.match(source, /EXPECTED_PUBLIC_TARGET_DIGEST/u);
  assert.match(source, /pulls\.listCommits/u);
  assert.match(source, /phase === 'abort' \|\| phase === 'expiry'/u);
  assert.match(source, /needs: \[controlled_human_authority, controlled_human_requester\]/u);
  assert.match(source, /needs: \[controlled_human_authority, controlled_human_approver\]/u);
for (const called of [EDGE_DEPLOY_WORKFLOW, PREPARE_WORKFLOW, QUIESCE_WORKFLOW, CHECKPOINT_WORKFLOW, VERIFY_WORKFLOW, RECOVERY_WORKFLOW]) assert.match(source, new RegExp(`uses: \\.\\/${called.replaceAll('.', '\\.').replaceAll('/', '\\/')}`, 'u'));
  assert.doesNotMatch(source, /secrets:\s*inherit/u);
});
