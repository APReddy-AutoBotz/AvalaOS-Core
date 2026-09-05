import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parseWorkflowYaml } from './checkWorkflowYaml.mjs';
import {
  CHECKPOINT_WORKFLOW,
  EDGE_DEPLOY_WORKFLOW,
  PREPARE_WORKFLOW,
  QUIESCE_WORKFLOW,
  RECOVERY_WORKFLOW,
  VERIFY_WORKFLOW,
} from './prCControlledHumanEvidenceContract.mjs';

const PINNED_CA_VERIFY_COMMAND = 'node scripts/prCControlledHumanPostgresTls.mjs verify-ca';
const BINDINGS = new Map([
  [CHECKPOINT_WORKFLOW, [['Derive backend observer records from the exact synthetic read-only scope', 'Verify pinned Supabase CA for backend observer']]],
  [EDGE_DEPLOY_WORKFLOW, [['Apply and verify exact additive migration on the dedicated database', 'Verify pinned Supabase CA for controlled migration']]],
  [PREPARE_WORKFLOW, [
    ['Preflight dedicated synthetic target', 'Verify pinned Supabase CA for target preflight'],
    ['Apply bounded synthetic seed', 'Verify pinned Supabase CA for seed apply'],
    ['Verify exact seed and zero-egress boundary', 'Verify pinned Supabase CA for seed verification'],
    ['Protected exact-bound abort recovery after failed seed or evidence assembly', 'Verify pinned Supabase CA for abort recovery'],
  ]],
  [QUIESCE_WORKFLOW, [
    ['Reverify exact preview and active synthetic state', 'Verify pinned Supabase CA for active-state verification'],
    ['Enter exact server-enforced read-only state before any read-only human observation', 'Verify pinned Supabase CA for read-only transition'],
  ]],
  [RECOVERY_WORKFLOW, [['Complete exact server-authorized abort or expiry recovery', 'Verify pinned Supabase CA for abort or expiry recovery']]],
  [VERIFY_WORKFLOW, [
    ['Deprovision exact synthetic exercise directly from frozen read-only state', 'Verify pinned Supabase CA for deprovision'],
    ['Independently re-inspect post-deprovision state', 'Verify pinned Supabase CA for post-deprovision inspection'],
  ]],
]);

const forbiddenTrustPattern = /NODE_EXTRA_CA_CERTS|PGSSLROOTCERT|BEGIN (?:RSA )?PRIVATE KEY|BEGIN CERTIFICATE|sslmode=(?:disable|allow|prefer|require|verify-ca)|rejectUnauthorized\s*[:=]\s*false/iu;

const validate = (workflowPath, workflow, source = '') => {
  const expected = BINDINGS.get(workflowPath);
  assert.ok(expected, `${workflowPath} must be governed`);
  assert.doesNotMatch(source, forbiddenTrustPattern);
  assert.doesNotMatch(source, /secrets\.[A-Z0-9_]*(?:CA|CERTIFICATE|SSLROOTCERT)/u);
  const jobs = Object.values(workflow.jobs);
  assert.equal(jobs.length, 1);
  assert.equal(Object.hasOwn(jobs[0].env ?? {}, 'NODE_EXTRA_CA_CERTS'), false);
  assert.equal(Object.hasOwn(jobs[0].env ?? {}, 'PGSSLROOTCERT'), false);
  const steps = jobs[0].steps;
  assert.equal(steps.filter(step => step.run === PINNED_CA_VERIFY_COMMAND).length, expected.length);
  for (const [databaseStepName, verifierStepName] of expected) {
    const databaseIndex = steps.findIndex(step => step.name === databaseStepName);
    assert.ok(databaseIndex > 0, `${workflowPath}:${databaseStepName}`);
    const verifier = steps[databaseIndex - 1];
    assert.equal(verifier.name, verifierStepName);
    assert.equal(verifier.run, PINNED_CA_VERIFY_COMMAND);
    assert.equal(verifier.env, undefined);
    if (databaseStepName === 'Protected exact-bound abort recovery after failed seed or evidence assembly') {
      assert.equal(verifier.id, 'verify_abort_recovery_ca');
      assert.equal(verifier.if, "${{ failure() && steps.apply.outcome != 'skipped' }}");
      assert.equal(steps[databaseIndex].if, "${{ failure() && steps.apply.outcome != 'skipped' && steps.verify_abort_recovery_ca.outcome == 'success' }}");
    }
  }
};

const load = async workflowPath => {
  const source = (await readFile(workflowPath, 'utf8')).replaceAll('\r\n', '\n');
  return { source, workflow: parseWorkflowYaml(source, workflowPath) };
};

test('controlled-human workflow TLS guards reject omission, displacement, and command substitution', async () => {
  for (const [workflowPath, expected] of BINDINGS) {
    const { source, workflow } = await load(workflowPath);
    validate(workflowPath, workflow, source);
    for (const [databaseStepName] of expected) {
      const steps = Object.values(workflow.jobs)[0].steps;
      const databaseIndex = steps.findIndex(step => step.name === databaseStepName);

      const omitted = structuredClone(workflow);
      Object.values(omitted.jobs)[0].steps.splice(databaseIndex - 1, 1);
      assert.throws(() => validate(workflowPath, omitted, source), assert.AssertionError);

      const displaced = structuredClone(workflow);
      const displacedSteps = Object.values(displaced.jobs)[0].steps;
      [displacedSteps[databaseIndex - 2], displacedSteps[databaseIndex - 1]] = [displacedSteps[databaseIndex - 1], displacedSteps[databaseIndex - 2]];
      assert.throws(() => validate(workflowPath, displaced, source), assert.AssertionError);

      const substituted = structuredClone(workflow);
      Object.values(substituted.jobs)[0].steps[databaseIndex - 1].run = 'node scripts/prCControlledHumanPostgresTls.mjs describe-ca';
      assert.throws(() => validate(workflowPath, substituted, source), assert.AssertionError);
    }
  }
});

test('controlled-human workflow TLS guards reject global, secret, embedded, or weakened trust', async () => {
  const { source, workflow } = await load(PREPARE_WORKFLOW);
  for (const mutation of [
    `${source}\n# NODE_EXTRA_CA_CERTS=/tmp/substituted.crt\n`,
    `${source}\n# PGSSLROOTCERT=/tmp/substituted.crt\n`,
    source + '\n# ${{ secrets.PR_C_CONTROLLED_HUMAN_DATABASE_CA }}\n',
    `${source}\n# -----BEGIN CERTIFICATE-----\n`,
    `${source}\n# sslmode=require\n`,
    `${source}\n# rejectUnauthorized: false\n`,
  ]) assert.throws(() => validate(PREPARE_WORKFLOW, workflow, mutation), assert.AssertionError);

  const globalEnv = structuredClone(workflow);
  Object.values(globalEnv.jobs)[0].env.NODE_EXTRA_CA_CERTS = '/tmp/substituted.crt';
  assert.throws(() => validate(PREPARE_WORKFLOW, globalEnv, source), assert.AssertionError);

  const unguardedAbort = structuredClone(workflow);
  Object.values(unguardedAbort.jobs)[0].steps.find(step => step.name === 'Protected exact-bound abort recovery after failed seed or evidence assembly').if = "${{ failure() && steps.apply.outcome != 'skipped' }}";
  assert.throws(() => validate(PREPARE_WORKFLOW, unguardedAbort, source), assert.AssertionError);
});

test('protected recovery never checks out historical authority as executable code', async () => {
  const {source,workflow}=await load(RECOVERY_WORKFLOW);const job=workflow.jobs.recover;
  assert.equal(job.environment,'hosted-nonproduction-pilot');
  assert.match(source,/unauthorized actor/u);
  assert.match(source,/pull\.head\.sha !== process\.env\.TRUSTED_EXECUTION_SHA/u);
  assert.match(source,/ref: \$\{\{ inputs\.trusted_execution_sha \}\}/u);
  assert.doesNotMatch(source,/ref: \$\{\{ inputs\.exact_head_sha \}\}/u);
  assert.match(source,/PR_C_CONTROLLED_HUMAN_TRUSTED_RECOVERY_SHA/u);
  assert.match(source,/PR_C_CONTROLLED_HUMAN_RECOVERY_MODE: trusted-current-pr-head/u);
});
