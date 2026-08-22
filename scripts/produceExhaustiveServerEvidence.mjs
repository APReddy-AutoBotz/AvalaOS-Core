import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog } from './exhaustiveAcceptanceModel.mjs';

const sourceArtifact = path.resolve(process.env.PILOT_OPERATIONS_POSTGRES_ARTIFACT || 'artifacts/pilot-operations/postgres-execution.json');
const output = path.resolve(process.env.SERVER_RESULTS_MANIFEST || 'acceptance-results/server-results.json');
if (!fs.existsSync(sourceArtifact)) throw new Error('SERVER_EVIDENCE_SOURCE_MISSING');
const proof = JSON.parse(fs.readFileSync(sourceArtifact, 'utf8'));
const required = ['responseLossExactReplayVerified', 'responseLossExactlyOneEffectVerified', 'responseLossConflictRejected', 'responseLossForeignTenantNonDisclosure'];
const releaseSha = process.env.RELEASE_SHA;
const workflowRunId = String(process.env.GITHUB_RUN_ID);
const workflowAttempt = String(process.env.GITHUB_RUN_ATTEMPT);
if (proof.kind !== 'executed_disposable_postgresql' || proof.postgresMajor !== 16 || proof.head !== releaseSha || String(proof.runId) !== workflowRunId || required.some(key => proof[key] !== true)) {
  throw new Error('SAFETY_005_AUTHORITATIVE_PROOF_INCOMPLETE');
}
const workflowPath = process.env.ACCEPTANCE_WORKFLOW_PATH || '.github/workflows/exhaustive-acceptance.yml';
const environment = 'disposable-ci';
const testCase = loadCatalog().cases.find(item => item.testId === 'SAFETY-005');
const suiteId = 'server-disposable-postgresql';
const command = 'npm run test:migrations:pilot-operations:postgres';
const identity = { releaseSha, workflowRunId, workflowAttempt, environment, workflowPath };
const manifest = {
  schemaVersion: 3, manifestKind: 'server', ...identity, generatedAt: new Date().toISOString(),
  suites: [{ suiteId, status: 'PASS', command, testIds: ['SAFETY-005'] }],
  results: [{
    suiteId, jobId: suiteId, command, testId: 'SAFETY-005', status: 'PASS', ...identity,
    assertionIds: required.map(key => `pilot-operations-postgres--${key}`),
    scenarioIds: ['production-command-response-lost-after-durable-commit'],
    branchIds: [...testCase.branchIds], sourceReferences: [...testCase.sourceReference],
    scope: { fixture: testCase.fixture, organization: 'synthetic', workspace: 'synthetic' },
  }],
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ serverTestIds: ['SAFETY-005'], manifest: output }));
