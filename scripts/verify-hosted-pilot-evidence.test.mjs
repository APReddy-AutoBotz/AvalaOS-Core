import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { REQUIRED_GATES, safeHash, validateHostedUrl, verifyActivationRun, verifyManifest } from './verify-hosted-pilot-evidence.mjs';
import { verifyHostedDeployment } from './verify-hosted-deployment.mjs';
const head = 'a'.repeat(40), canonicalMigrationDigest = 'c'.repeat(64);
const activationRun = { id: '123456789', attempt: '2', workflow: '.github/workflows/hosted-pilot-activation-evidence-producer.yml', repository: 'APReddy-AutoBotz/AvalaOS-Core', event: 'workflow_dispatch', head, conclusion: 'success' };
const evidence = Object.fromEntries(REQUIRED_GATES.map((gate) => [gate, { result: 'passed', gitCommit: head, workflowRunId: activationRun.id, workflowRunAttempt: 2, resultId: `${gate}:1` }]));
const manifest = { schemaVersion: 1, gitCommit: head, environment: 'hosted_nonproduction_pilot', hostedNonproductionVerified: true, productionAuthorized: false, liveActivationAuthorized: false, customerDataAuthorized: false, customerDataUsed: false, externalUsersAuthorized: false, externalUsersUsed: false, realProviderCallsAuthorized: false, realProviderCallsUsed: false, targetFingerprint: safeHash('dedicated-target'), deploymentTargetFingerprint: safeHash('dedicated-web-target'), migrationChainHash: `sha256:${canonicalMigrationDigest}`, deploymentId: 'deploy-1', workflowRunId: activationRun.id, workflowRunAttempt: 2, workflowPath: activationRun.workflow, workflowRepository: activationRun.repository, workflowEvent: activationRun.event, workflowConclusion: activationRun.conclusion, evidence };
const context = { expectedHead: head, actualHead: head, canonicalMigrationDigest, activationRun, expectedDeploymentFingerprint: manifest.deploymentTargetFingerprint };
test('accepts exact-head complete hosted evidence bound to the selected activation run', () => assert.equal(verifyManifest(manifest, context), true));
test('fails closed for wrong head, missing gate, production authority, and unsafe URL', () => {
  assert.throws(() => verifyManifest(manifest, { ...context, actualHead: 'b'.repeat(40) }), /exact head/);
  assert.throws(() => verifyManifest({ ...manifest, evidence: {} }, context), /missing/);
  assert.throws(() => verifyManifest({ ...manifest, productionAuthorized: true }, context), /stop state/);
  for (const field of ['liveActivationAuthorized','customerDataAuthorized','customerDataUsed','externalUsersAuthorized','externalUsersUsed','realProviderCallsAuthorized','realProviderCallsUsed']) assert.throws(() => verifyManifest({...manifest,[field]:true},context),/stop state/);
  assert.throws(() => verifyManifest(manifest,{...context,expectedDeploymentFingerprint:safeHash('other-deployment')}),/tested origin/);
  assert.throws(() => verifyManifest({ ...manifest, hostedUrl: 'https://pilot.example.test' }, context), /prohibited/);
  assert.throws(() => validateHostedUrl('http://localhost:3000'), /HTTPS/);
  for (const value of ['https://localhost', 'https://foo.localhost', 'https://127.0.0.2', 'https://127.255.255.254', 'https://127.1', 'https://0177.0.0.1', 'https://0x7f000001', 'https://2130706433', 'https://[::1]', 'https://[::ffff:127.0.0.1]', 'https://[::ffff:7f00:1]']) {
    assert.throws(() => validateHostedUrl(value), /non-local/, value);
  }
  assert.equal(validateHostedUrl('https://deploy-preview-228--avalaos-pilot.netlify.app'), 'https://deploy-preview-228--avalaos-pilot.netlify.app');
  assert.throws(() => verifyManifest({ ...manifest, migrationChainHash: `sha256:${'0'.repeat(64)}` }, context), /canonical inventory/);
});
test('rejects activation artifact and run identity substitution', () => {
  assert.equal(verifyActivationRun(activationRun, head), true);
  for (const changed of [
    { workflowRunId: '987654321' }, { workflowRunAttempt: 1 },
    { workflowPath: '.github/workflows/other.yml' }, { workflowRepository: 'attacker/fork' },
    { workflowEvent: 'push' }, { workflowConclusion: 'failure' },
  ]) assert.throws(() => verifyManifest({ ...manifest, ...changed }, context), /controller-selected activation run/);
  for (const changed of [
    { id: '987654321' }, { attempt: '3' }, { workflow: '.github/workflows/other.yml' },
    { repository: 'attacker/fork' }, { event: 'push' }, { head: 'b'.repeat(40) }, { conclusion: 'failure' },
  ]) assert.throws(() => verifyManifest(manifest, { ...context, activationRun: { ...activationRun, ...changed } }), /activation run|controller-selected/);
  assert.throws(() => verifyActivationRun({ ...activationRun, id: '1; echo unsafe' }, head), /identity/);
  const staleGate = { ...manifest.evidence['database-preflight'], workflowRunAttempt: 1 };
  assert.throws(() => verifyManifest({ ...manifest, evidence: { ...manifest.evidence, 'database-preflight': staleGate } }, context), /database-preflight/);
});
test('CLI and workflow fail closed unless trusted run metadata is supplied by one exact API lookup', async () => {
  const cli = spawnSync(process.execPath, ['scripts/verify-hosted-pilot-evidence.mjs', '--manifest', 'unused.json', '--expected-head', head], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /--activation-run-id/);
  const workflow = await readFile('.github/workflows/hosted-nonproduction-pilot-activation.yml', 'utf8');
  assert.match(workflow, /actions\.getWorkflowRun/u);
  assert.match(workflow, /run_id: selectedNumber/u);
  assert.match(workflow, /run\.head_sha !== process\.env\.EXPECTED_RELEASE_SHA/u);
  assert.match(workflow, /run\.status !== 'completed' \|\| run\.conclusion !== 'success'/u);
  assert.match(workflow, /workflowPath !== process\.env\.ACTIVATION_WORKFLOW_PATH/u);
  assert.match(workflow, /run\.repository\?\.full_name !== expectedRepository \|\| run\.head_repository\?\.full_name !== expectedRepository/u);
  assert.match(workflow,/hosted-pilot-activation-evidence-producer\.yml/);
  assert.match(workflow,/name: hosted-pilot-activation-manifest/);
  assert.match(workflow,/--expected-deployment-fingerprint/);
  for (const argument of ['activation-run-id', 'activation-run-attempt', 'activation-workflow', 'activation-repository', 'activation-event', 'activation-head', 'activation-conclusion']) assert.match(workflow, new RegExp(`--${argument}`));
});
test('deployment verification requires release and nonproduction headers', async () => {
  const fetchImpl = async () => new Response('<div id="root"></div>', { headers: { 'x-avalaos-release': head, 'x-avalaos-environment': 'hosted_nonproduction_pilot' } });
  assert.equal((await verifyHostedDeployment({ hostedUrl: 'https://pilot.example.test', expectedHead: head, fetchImpl })).release, head);
  await assert.rejects(verifyHostedDeployment({ hostedUrl: 'https://pilot.example.test', expectedHead: head, fetchImpl: async () => new Response('<div id="root"></div>') }), /mismatch/);
});
