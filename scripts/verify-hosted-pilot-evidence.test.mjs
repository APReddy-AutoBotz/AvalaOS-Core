import assert from 'node:assert/strict';
import test from 'node:test';
import { REQUIRED_GATES, safeHash, validateHostedUrl, verifyManifest } from './verify-hosted-pilot-evidence.mjs';
import { verifyHostedDeployment } from './verify-hosted-deployment.mjs';
const head = 'a'.repeat(40), run = 'run-123';
const evidence = Object.fromEntries(REQUIRED_GATES.map((gate) => [gate, { result: 'passed', gitCommit: head, workflowRunId: run, resultId: `${gate}:1` }]));
const manifest = { schemaVersion: 1, gitCommit: head, environment: 'hosted_nonproduction_pilot', hostedNonproductionVerified: true, productionAuthorized: false, customerDataUsed: false, targetFingerprint: safeHash('dedicated-target'), deploymentTargetFingerprint: safeHash('dedicated-web-target'), migrationChainHash: safeHash('migration-chain'), deploymentId: 'deploy-1', workflowRunId: run, evidence };
test('accepts exact-head complete hosted evidence', () => assert.equal(verifyManifest(manifest, { expectedHead: head, actualHead: head }), true));
test('fails closed for wrong head, missing gate, production authority, and unsafe URL', () => {
  assert.throws(() => verifyManifest(manifest, { expectedHead: head, actualHead: 'b'.repeat(40) }), /exact head/);
  assert.throws(() => verifyManifest({ ...manifest, evidence: {} }, { expectedHead: head, actualHead: head }), /missing/);
  assert.throws(() => verifyManifest({ ...manifest, productionAuthorized: true }, { expectedHead: head, actualHead: head }), /dispositions/);
  assert.throws(() => verifyManifest({ ...manifest, hostedUrl: 'https://pilot.example.test' }, { expectedHead: head, actualHead: head }), /prohibited/);
  assert.throws(() => validateHostedUrl('http://localhost:3000'), /HTTPS/);
});
test('deployment verification requires release and nonproduction headers', async () => {
  const fetchImpl = async () => new Response('<div id="root"></div>', { headers: { 'x-avalaos-release': head, 'x-avalaos-environment': 'hosted_nonproduction_pilot' } });
  assert.equal((await verifyHostedDeployment({ hostedUrl: 'https://pilot.example.test', expectedHead: head, fetchImpl })).release, head);
  await assert.rejects(verifyHostedDeployment({ hostedUrl: 'https://pilot.example.test', expectedHead: head, fetchImpl: async () => new Response('<div id="root"></div>') }), /mismatch/);
});
