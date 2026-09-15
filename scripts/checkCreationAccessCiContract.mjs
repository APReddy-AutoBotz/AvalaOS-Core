import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWorkflowYaml } from './checkWorkflowYaml.mjs';

export function checkCreationAccessCiContract(source) {
  const workflow = parseWorkflowYaml(source, 'creation-access.yml');
  assert.deepEqual(Object.keys(workflow.on).sort(), ['pull_request', 'workflow_dispatch']);
  assert.deepEqual(workflow.on.pull_request, { branches: ['main'] });
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert(!workflow.env && !workflow.defaults, 'CI_AMBIENT_OVERRIDES_REJECTED');
  assert.deepEqual(Object.keys(workflow.jobs), ['isolated-creation-access']);
  const job = workflow.jobs['isolated-creation-access'];
  assert.equal(job['runs-on'], 'ubuntu-latest');
  for (const key of ['if', 'env', 'permissions', 'continue-on-error', 'environment', 'container', 'services']) assert(!Object.hasOwn(job, key), `CI_JOB_OVERRIDE:${key}`);
  const steps = job.steps;
  const checkout = steps[0];
  assert.equal(checkout.uses, 'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683');
  assert.deepEqual(checkout.with, { ref: '${{ github.event.pull_request.head.sha || github.sha }}', 'fetch-depth': 0 });
  assert.equal(steps[1].uses, 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020');
  assert.deepEqual(steps[1].with, { 'node-version': '22', cache: 'npm' });
  const runs = steps.filter(step => Object.hasOwn(step, 'run'));
  assert.deepEqual(runs.map(step => step.run.trim()), [
    'npm ci', 'npx playwright install --with-deps chromium\ndocker pull postgres:16-alpine',
    'node --test scripts/runCreationAccessValidation.test.mjs scripts/checkCreationAccessCommittedPatch.test.mjs scripts/runTranscriptFlowBrowser.test.mjs',
    ...['authority', 'regression', 'coverage', 'postgres', 'browser', 'static'].map(group => `node scripts/runCreationAccessValidation.mjs ${group}`),
    'node scripts/checkCreationAccessCommittedPatch.mjs',
  ]);
  for (const step of steps.slice(0, -1)) {
    for (const key of ['if', 'continue-on-error', 'working-directory', 'shell']) assert(!Object.hasOwn(step, key), `CI_STEP_OVERRIDE:${key}`);
    if (step.run !== 'node scripts/checkCreationAccessCommittedPatch.mjs') assert(!step.env, 'CI_STEP_ENV_REJECTED');
  }
  assert.deepEqual(runs.at(-1).env, {
    CREATION_ACCESS_BASE_SHA: "${{ github.event.pull_request.base.sha || '5433cad41721355e3ec5a29bc2f87772540c77b5' }}",
    CREATION_ACCESS_HEAD_SHA: '${{ github.event.pull_request.head.sha || github.sha }}',
  });
  assert.equal(steps.length, 13);
  const artifact = steps.at(-1);
  assert.equal(artifact.uses, 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02');
  assert.equal(artifact.if, 'always()');
  assert.equal(artifact.with['if-no-files-found'], 'error');
  assert.equal(artifact.with['retention-days'], 14);
  assert.equal(artifact.with.path.trim(), 'output/creation-access/\noutput/playwright/creation-access/');
  assert(!/secrets\.|pull_request_target|supabase (?:link|db push|functions deploy)|netlify deploy/.test(source), 'CI_HOSTED_AUTHORITY_REJECTED');
  return true;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkCreationAccessCiContract(readFileSync(new URL('../.github/workflows/creation-access.yml', import.meta.url), 'utf8'));
  console.log('Creation access isolated CI contract passed.');
}
