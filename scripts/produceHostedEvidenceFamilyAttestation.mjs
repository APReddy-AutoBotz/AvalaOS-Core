import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHostedEvidenceFamilyAttestation, validateHostedEvidenceFamilyAssertion} from './hostedEvidenceFamilyAttestation.mjs';

const [family, assertionPath, outputPath] = process.argv.slice(2);
if (!family || !assertionPath || !outputPath) throw new Error('usage: family assertion.json output.json');
const assertionBytes = await readFile(assertionPath);
const assertion = JSON.parse(assertionBytes);
const env = process.env;
const workflowPath = env.ACCEPTANCE_WORKFLOW_PATH ?? '.github/workflows/hosted-pilot-activation-evidence-producer.yml';
validateHostedEvidenceFamilyAssertion(assertion, {
  family,
  releaseSha: env.EXPECTED_RELEASE_SHA,
  producerWorkflowPath: workflowPath,
  producerRunId: env.GITHUB_RUN_ID,
  producerRunAttempt: Number(env.GITHUB_RUN_ATTEMPT),
  organizationId: env.HOSTED_PILOT_ORGANIZATION_ID,
  workspaceId: env.HOSTED_PILOT_WORKSPACE_ID,
  exerciseRunId: env.HOSTED_PILOT_EXERCISE_RUN_ID,
  deploymentFingerprint: env.DEPLOYMENT_FINGERPRINT,
});
const attestation = createHostedEvidenceFamilyAttestation({
  organizationId: env.HOSTED_PILOT_ORGANIZATION_ID, workspaceId: env.HOSTED_PILOT_WORKSPACE_ID,
  exerciseRunId: env.HOSTED_PILOT_EXERCISE_RUN_ID, releaseSha: env.EXPECTED_RELEASE_SHA,
  producerWorkflowPath: workflowPath,
  producerRunId: env.GITHUB_RUN_ID, producerRunAttempt: Number(env.GITHUB_RUN_ATTEMPT),
  targetFingerprint: env.TARGET_FINGERPRINT, deploymentFingerprint: assertion.deploymentTargetFingerprint,
  hostedTarget: 'hosted_nonproduction_pilot', family, disposition: assertion.result,
  assertions: assertion.assertionOutcomes,
  sourceArtifacts: [
    ...assertion.sourceArtifacts,
    {path: assertionPath, sha256: `sha256:${createHash('sha256').update(assertionBytes).digest('hex')}`},
  ],
  observedAt: assertion.observedAt ?? new Date().toISOString(),
});
await mkdir(path.dirname(outputPath), {recursive:true});
await writeFile(outputPath, `${JSON.stringify(attestation,null,2)}\n`, {mode:0o600});
