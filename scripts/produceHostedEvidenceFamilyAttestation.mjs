import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHostedEvidenceFamilyAttestation} from './hostedEvidenceFamilyAttestation.mjs';

const [family, assertionPath, outputPath] = process.argv.slice(2);
if (!family || !assertionPath || !outputPath) throw new Error('usage: family assertion.json output.json');
const assertion = JSON.parse(await readFile(assertionPath, 'utf8'));
const env = process.env;
const attestation = createHostedEvidenceFamilyAttestation({
  organizationId: env.HOSTED_PILOT_ORGANIZATION_ID, workspaceId: env.HOSTED_PILOT_WORKSPACE_ID,
  exerciseRunId: env.HOSTED_PILOT_EXERCISE_RUN_ID, releaseSha: env.EXPECTED_RELEASE_SHA,
  producerWorkflowPath: env.GITHUB_WORKFLOW_REF?.split('@')[0] ?? '.github/workflows/hosted-pilot-activation-evidence-producer.yml',
  producerRunId: env.GITHUB_RUN_ID, producerRunAttempt: Number(env.GITHUB_RUN_ATTEMPT),
  targetFingerprint: env.TARGET_FINGERPRINT, deploymentFingerprint: assertion.deploymentTargetFingerprint,
  hostedTarget: 'hosted_nonproduction_pilot', family, disposition: assertion.result,
  assertions: [{testIds: assertion.testIds ?? [], gate: assertion.gate, result: assertion.result}],
  sourceArtifacts: [{path: assertionPath, sha256: assertion.evidenceSha256 ?? assertion.resultSha256 ?? 'assertion-owned'}],
  observedAt: assertion.observedAt ?? new Date().toISOString(),
});
await mkdir(path.dirname(outputPath), {recursive:true});
await writeFile(outputPath, `${JSON.stringify(attestation,null,2)}\n`, {mode:0o600});
