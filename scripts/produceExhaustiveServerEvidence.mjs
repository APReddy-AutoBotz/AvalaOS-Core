import fs from 'node:fs';
import path from 'node:path';
import { canonicalCommand, loadCatalog, loadExecutionBindings, loadSourceProvenance } from './exhaustiveAcceptanceModel.mjs';

const sourceArtifact = path.resolve(process.env.PILOT_OPERATIONS_POSTGRES_ARTIFACT || 'artifacts/pilot-operations/postgres-execution.json');
const output = path.resolve(process.env.SERVER_RESULTS_MANIFEST || 'acceptance-results/server-results.json');
if (!fs.existsSync(sourceArtifact)) throw new Error('SERVER_EVIDENCE_SOURCE_MISSING');
const proof = JSON.parse(fs.readFileSync(sourceArtifact, 'utf8'));
const required = ['responseLossExactReplayVerified', 'responseLossExactlyOneEffectVerified', 'responseLossConflictRejected', 'responseLossForeignTenantNonDisclosure'];
const releaseSha = process.env.RELEASE_SHA;
const workflowRunId = String(process.env.GITHUB_RUN_ID);
const workflowAttempt = String(process.env.GITHUB_RUN_ATTEMPT);
const workflowPath = process.env.ACCEPTANCE_WORKFLOW_PATH || '.github/workflows/exhaustive-acceptance.yml';
const environment = 'disposable-ci';
const binding = loadExecutionBindings().serverTests.find(item => item.testId === 'SAFETY-005');
const provenance = loadSourceProvenance().contracts.find(item => item.testId === 'SAFETY-005');
const assertionIds = proof.assertionResults?.map(item => item.assertionId) ?? [];
if (proof.kind !== 'executed_disposable_postgresql' || proof.postgresMajor !== 16 || proof.head !== releaseSha
  || String(proof.runId) !== workflowRunId || String(proof.runAttempt) !== workflowAttempt
  || proof.workflowPath !== workflowPath || proof.environment !== environment
  || JSON.stringify(proof.scope) !== JSON.stringify(provenance.scope)
  || required.some(key => proof[key] !== true)
  || proof.assertionResults?.some(item => item.status !== 'PASS')
  || JSON.stringify([...assertionIds].sort()) !== JSON.stringify([...binding.assertionIds].sort())) {
  throw new Error('SAFETY_005_AUTHORITATIVE_PROOF_INCOMPLETE');
}
const testCase = loadCatalog().cases.find(item => item.testId === 'SAFETY-005');
const suiteId = binding.suiteId;
const command = canonicalCommand(binding.command);
const identity = { releaseSha, workflowRunId, workflowAttempt, environment, workflowPath };
const manifest = {
  schemaVersion: 3, manifestKind: 'server', ...identity, generatedAt: new Date().toISOString(),
  suites: [{ suiteId, status: 'PASS', command, testIds: ['SAFETY-005'] }],
  results: [{
    suiteId, jobId: suiteId, command, testId: 'SAFETY-005', status: 'PASS', ...identity,
    assertionIds: binding.assertionIds,
    assertionOutcomes: proof.assertionResults,
    scenarioIds: ['production-command-response-lost-after-durable-commit'],
    branchIds: [...testCase.branchIds], sourceReferences: [...testCase.sourceReference],
    scope: proof.scope,
  }],
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ serverTestIds: ['SAFETY-005'], manifest: output }));
