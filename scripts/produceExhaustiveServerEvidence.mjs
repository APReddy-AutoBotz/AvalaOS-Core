import fs from 'node:fs';
import path from 'node:path';
import { canonicalCommand, loadCatalog, loadExecutionBindings, loadSourceProvenance, validateSourceProvenance } from './exhaustiveAcceptanceModel.mjs';

const sourceArtifact = path.resolve(process.env.PILOT_OPERATIONS_POSTGRES_ARTIFACT || 'artifacts/pilot-operations/postgres-execution.json');
const output = path.resolve(process.env.SERVER_RESULTS_MANIFEST || 'acceptance-results/server-results.json');
if (!fs.existsSync(sourceArtifact)) throw new Error('SERVER_EVIDENCE_SOURCE_MISSING');
const proof = JSON.parse(fs.readFileSync(sourceArtifact, 'utf8'));
const required = ['responseLossExactReplayVerified', 'responseLossExactlyOneEffectVerified', 'responseLossConflictRejected', 'responseLossForeignTenantNonDisclosure'];
const releaseSha = process.env.RELEASE_SHA;
const workflowRunId = String(process.env.GITHUB_RUN_ID);
const workflowAttempt = String(process.env.GITHUB_RUN_ATTEMPT);
const bindings = loadExecutionBindings();
const catalog = loadCatalog();
const provenanceDocument = loadSourceProvenance();
const provenanceErrors = validateSourceProvenance(catalog, bindings, provenanceDocument);
if (provenanceErrors.length) throw new Error(`SERVER_PROVENANCE_INVALID:${provenanceErrors.join(',')}`);
const workflowPath = process.env.ACCEPTANCE_WORKFLOW_PATH || bindings.serverExecution?.workflowPath;
const environment = process.env.ACCEPTANCE_SERVER_EVIDENCE_ENVIRONMENT || bindings.serverExecution?.environment;
const binding = bindings.serverTests.find(item => item.testId === 'SAFETY-005');
const provenance = provenanceDocument.contracts.find(item => item.testId === 'SAFETY-005');
const owner = provenance?.ownership?.find(item => item.kind === 'server-assertion' && item.ownerId === binding?.suiteId);
const assertionIds = proof.assertionResults?.map(item => item.assertionId) ?? [];
const assertionStatus = proof.assertionResults?.some(item => item.status === 'FAIL')
  ? 'FAIL'
  : proof.assertionResults?.some(item => item.status !== 'PASS')
    ? 'BLOCKED'
    : proof.assertionResults?.length
      ? 'PASS'
      : 'BLOCKED';
if (!binding || !owner || workflowPath !== bindings.serverExecution?.workflowPath || environment !== bindings.serverExecution?.environment
  || proof.kind !== 'executed_disposable_postgresql' || proof.postgresMajor !== 16 || proof.head !== releaseSha
  || String(proof.runId) !== workflowRunId || String(proof.runAttempt) !== workflowAttempt
  || proof.workflowPath !== workflowPath || proof.environment !== environment
  || JSON.stringify(proof.scope) !== JSON.stringify(provenance.scope)
  || required.some(key => proof[key] !== true)
  || assertionStatus !== 'PASS'
  || JSON.stringify([...assertionIds].sort()) !== JSON.stringify([...binding.assertionIds].sort())
  || JSON.stringify([...owner.assertionIds].sort()) !== JSON.stringify([...binding.assertionIds].sort())
  || JSON.stringify([...owner.scenarioIds].sort()) !== JSON.stringify([...binding.scenarioIds].sort())) {
  throw new Error('SAFETY_005_AUTHORITATIVE_PROOF_INCOMPLETE');
}
const testCase = catalog.cases.find(item => item.testId === 'SAFETY-005');
const suiteId = binding.suiteId;
const command = canonicalCommand(binding.command);
const identity = { releaseSha, workflowRunId, workflowAttempt, environment, workflowPath };
const manifest = {
  schemaVersion: 3, manifestKind: 'server', ...identity, generatedAt: new Date().toISOString(),
  suites: [{ suiteId, status: assertionStatus, command, testIds: ['SAFETY-005'] }],
  results: [{
    suiteId, jobId: suiteId, command, testId: 'SAFETY-005', status: assertionStatus, ...identity,
    assertionIds: binding.assertionIds,
    assertionOutcomes: proof.assertionResults,
    scenarioIds: [...binding.scenarioIds],
    branchIds: [...testCase.branchIds], sourceReferences: [...testCase.sourceReference],
    scope: proof.scope,
  }],
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ serverTestIds: ['SAFETY-005'], manifest: output }));
