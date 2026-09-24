import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parseWorkflowYaml } from './checkWorkflowYaml.mjs';

const workflowPath = '.github/workflows/transcript-flow-pr-c.yml';
const load = async () => parseWorkflowYaml(await readFile(workflowPath, 'utf8'), workflowPath);
const stepIndex = (job, name) => job.steps.findIndex(step => step.name === name);

const validate = workflow => {
  const inputs = workflow.on.workflow_dispatch.inputs;
  assert.deepEqual(inputs.acceptance_mode.options, ['exact-head-ci', 'solo-owner-synthetic-v1']);
  assert.equal(inputs.acceptance_mode.default, 'exact-head-ci');
  assert.equal(inputs.exact_head_sha.required, false);
  assert.equal(inputs.netlify_deploy_id.required, false);
  assert.match(workflow.jobs['exact-head-governed-evidence'].if, /inputs\.acceptance_mode == 'exact-head-ci'/u);

  const job = workflow.jobs.synthetic_role_acceptance;
  assert.equal(job.if, "${{ github.event_name == 'workflow_dispatch' && inputs.acceptance_mode == 'solo-owner-synthetic-v1' }}");
  assert.equal(job.environment, 'hosted-nonproduction-pilot');
  assert.equal(job.env.PR_C_SYNTHETIC_ACCEPTANCE_POLICY, 'solo-owner-synthetic-v1');
  assert.equal(job.env.PR_C_CONTROLLED_HUMAN_RELEASE_SHA, '${{ inputs.exact_head_sha }}');
  assert.equal(job.env.PR_C_CONTROLLED_HUMAN_DEPLOY_ID, '${{ inputs.netlify_deploy_id }}');
  assert.equal(job.env.PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST, '${{ vars.PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST }}');

  const names = job.steps.map(step => step.name ?? '');
  for (const name of [
    'Authorize exact synthetic policy, actor, open PR head, and preview deploy',
    'Apply and verify the exact synthetic acceptance migration',
    'Prepare and independently verify the synthetic exercise',
    'Verify exact preview response identity before browser authentication',
    'Run active browser journeys without provider egress',
    'Bind exact application actors and sessions at the server',
    'Quiesce before the final read-only browser proof',
    'Run read-only browser proof, sign out all personas, and erase private state',
    'Independently observe every server action, denial, and absence',
    'Deprovision and independently verify cleanup',
    'Recompute acceptance from raw browser and server evidence',
    'Recover bounded synthetic state after any failed phase',
    'Always erase private browser state and intermediate resume metadata',
    'Upload only sanitized verified synthetic evidence',
  ]) assert.equal(names.filter(value => value === name).length, 1, name);

  const ordered = [
    'Apply and verify the exact synthetic acceptance migration',
    'Prepare and independently verify the synthetic exercise',
    'Verify exact preview response identity before browser authentication',
    'Run active browser journeys without provider egress',
    'Bind exact application actors and sessions at the server',
    'Quiesce before the final read-only browser proof',
    'Run read-only browser proof, sign out all personas, and erase private state',
    'Independently observe every server action, denial, and absence',
    'Deprovision and independently verify cleanup',
    'Recompute acceptance from raw browser and server evidence',
  ].map(name => stepIndex(job, name));
  assert.ok(ordered.every((value, index) => value >= 0 && (index === 0 || value > ordered[index - 1])));

  const authority = job.steps[stepIndex(job, 'Authorize exact synthetic policy, actor, open PR head, and preview deploy')].with.script;
  for (const marker of ['trusted(context.actor)', 'pull.head.sha !== process.env.EXPECTED_HEAD', 'listWorkflowRuns', "job.name === 'exact-head-governed-evidence'", "run.conclusion === 'success'"])
    assert.ok(authority.includes(marker), marker);
  const active = job.steps[stepIndex(job, 'Run active browser journeys without provider egress')].run;
  assert.match(active, /--phase active --preparation output\/synthetic\/environment-verify\.json/u);
  assert.match(active, /--state-directory output\/synthetic\/browser-storage-private/u);
  const readOnly = job.steps[stepIndex(job, 'Run read-only browser proof, sign out all personas, and erase private state')].run;
  assert.match(readOnly, /--phase read-only --preparation output\/synthetic\/environment-verify\.json --input output\/synthetic\/browser-active\.json/u);
  const binding = job.steps[stepIndex(job, 'Bind exact application actors and sessions at the server')].run;
  assert.match(binding, /buildSyntheticSessionBindingRequest/u);
  assert.match(binding, /synthetic-session-bind/u);
  const verify = job.steps[stepIndex(job, 'Recompute acceptance from raw browser and server evidence')].run;
  assert.match(verify, /--session-binding output\/synthetic\/session-binding\.json/u);
  assert.match(verify, /PR_C_SYNTHETIC_ACCEPTANCE_COMPLETED_AT/u);
  assert.equal(job.steps[stepIndex(job, 'Prepare and independently verify the synthetic exercise')].id, 'prepare');
  assert.equal(job.steps[stepIndex(job, 'Recover bounded synthetic state after any failed phase')].if,
    "${{ failure() && steps.prepare.outcome != 'skipped' }}");
  const cleanup = job.steps[stepIndex(job, 'Always erase private browser state and intermediate resume metadata')];
  assert.equal(cleanup.if, 'always()');
  assert.match(cleanup.run, /browser-storage-private/u);
  assert.match(cleanup.run, /browser-active\.json/u);
  const upload = job.steps[stepIndex(job, 'Upload only sanitized verified synthetic evidence')];
  assert.equal(upload.uses, 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02');
  assert.doesNotMatch(upload.with.path, /browser-active|browser-storage-private|session-binding-request/u);
  assert.match(upload.with.path, /verified-session\.json/u);
  assert.doesNotMatch(JSON.stringify(job), /controlled-human-comment|human-attestation|github\.rest\.issues\.createComment/iu);
  return true;
};

test('workflow provides an explicit two-phase synthetic acceptance path with fail-closed cleanup', async () => {
  assert.equal(validate(await load()), true);
});

test('workflow contract rejects selection, sequence, session binding, and private artifact substitutions', async () => {
  const workflow = await load();
  for (const mutate of [
    value => { value.jobs.synthetic_role_acceptance.if = '${{ github.event_name == \'workflow_dispatch\' }}'; },
    value => { value.jobs.synthetic_role_acceptance.steps = value.jobs.synthetic_role_acceptance.steps.filter(step => step.name !== 'Bind exact application actors and sessions at the server'); },
    value => { const steps = value.jobs.synthetic_role_acceptance.steps; const left = stepIndex(value.jobs.synthetic_role_acceptance, 'Quiesce before the final read-only browser proof'); const right = stepIndex(value.jobs.synthetic_role_acceptance, 'Run active browser journeys without provider egress'); [steps[left], steps[right]] = [steps[right], steps[left]]; },
    value => { value.jobs.synthetic_role_acceptance.steps.find(step => step.name === 'Upload only sanitized verified synthetic evidence').with.path += '\noutput/synthetic/browser-storage-private/'; },
    value => { value.jobs.synthetic_role_acceptance.steps.find(step => step.name === 'Always erase private browser state and intermediate resume metadata').if = 'success()'; },
    value => { value.jobs.synthetic_role_acceptance.steps.find(step => step.name === 'Recover bounded synthetic state after any failed phase').if = 'failure()'; },
  ]) {
    const changed = structuredClone(workflow); mutate(changed); assert.throws(() => validate(changed), assert.AssertionError);
  }
});
