import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {deriveHostedAssertionDisposition} from './hostedEvidenceFamilyAttestation.mjs';

const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const allowedStatuses = new Set(['PASS', 'FAIL', 'BLOCKED', 'SKIPPED']);

const exactExecution = (value, expected, label) => {
  for (const key of ['head', 'runId', 'runAttempt', 'workflowPath']) {
    if (String(value?.[key]) !== String(expected[key])) throw new Error(`${label}_${key.toUpperCase()}_MISMATCH`);
  }
  if (!String(value.environment ?? '').startsWith('disposable-ci')) throw new Error(`${label}_ENVIRONMENT_INVALID`);
};

const exactScope = (value, expected, label, workspaceRequired = true) => {
  if (String(value?.organizationId) !== String(expected.organizationId)) throw new Error(`${label}_ORGANIZATION_MISMATCH`);
  if (workspaceRequired && String(value?.workspaceId) !== String(expected.workspaceId)) throw new Error(`${label}_WORKSPACE_MISMATCH`);
};

const selectAssertions = (artifact, ids, sourceSha, label) => {
  if (!Array.isArray(artifact.assertionResults)) throw new Error(`${label}_ASSERTIONS_REQUIRED`);
  const byId = new Map(artifact.assertionResults.map(item => [item.assertionId, item]));
  if (byId.size !== artifact.assertionResults.length) throw new Error(`${label}_ASSERTIONS_DUPLICATE`);
  return ids.map(assertionId => {
    const item = byId.get(assertionId);
    if (!item || !allowedStatuses.has(item.status)) throw new Error(`${label}_${assertionId}_MISSING`);
    return {assertionId, status: item.status, sourceArtifactSha256: sourceSha};
  });
};

const readArtifact = async sourcePath => {
  const bytes = await readFile(sourcePath);
  return {path: sourcePath.replaceAll('\\', '/'), bytes, sha256: sha256(bytes), value: JSON.parse(bytes)};
};

export async function deriveHostedEvidenceFamilyAssertions({postgresPath, recoveryPath, providerPath, journeyPath, outputDir, expected, deploymentFingerprint, observedAt = new Date().toISOString()}) {
  const [postgres, recovery, provider, journey] = await Promise.all([postgresPath, recoveryPath, providerPath, journeyPath].map(readArtifact));
  for (const [label, artifact] of [['POSTGRES', postgres], ['RECOVERY', recovery], ['PROVIDER', provider], ['JOURNEY', journey]]) exactExecution(artifact.value, expected, label);
  exactScope(postgres.value.scope, expected, 'POSTGRES');
  exactScope(recovery.value.scope, expected, 'RECOVERY');
  exactScope(provider.value.scope, {organizationId:'11111111-1111-4111-8111-111111111111'}, 'PROVIDER', false);
  if (provider.value.realNetworkEgressObserved !== false || provider.value.providerExecutionBoundary !== 'injected-test-executor') throw new Error('PROVIDER_EGRESS_PROOF_INVALID');
  if (journey.value.scope?.kind !== 'synthetic-contract-model') throw new Error('JOURNEY_SCOPE_INVALID');

  const source = artifact => ({path: artifact.path, sha256: artifact.sha256});
  const specs = [
    {family:'tenant-adversarial', testIds:['SAFETY-005'], artifacts:[postgres], assertions:selectAssertions(postgres.value,[
      'pilot-operations-postgres--responseLossExactReplayVerified',
      'pilot-operations-postgres--responseLossExactlyOneEffectVerified',
      'pilot-operations-postgres--responseLossConflictRejected',
      'pilot-operations-postgres--responseLossForeignTenantNonDisclosure',
    ],postgres.sha256,'POSTGRES')},
    {family:'provider-simulation-zero-egress', testIds:['AI-006'], artifacts:[provider], assertions:selectAssertions(provider.value,[
      'provider-simulation--denied-path-zero-provider-calls',
      'provider-simulation--audit-failure-zero-provider-calls',
      'provider-simulation--secret-failure-zero-provider-calls',
      'provider-simulation--resolver-failure-zero-provider-calls',
      'provider-simulation--allowed-path-injected-executor-only',
    ],provider.sha256,'PROVIDER')},
    {family:'canonical-journey', testIds:['E2E-001'], artifacts:[journey], assertions:selectAssertions(journey.value,[
      'canonical-journey--score-version-unchanged',
      'canonical-journey--lineage-unique',
      'canonical-journey--private-artifact-no-raw-url',
      'canonical-journey--adversarial-and-recovery-invariants',
    ],journey.sha256,'JOURNEY')},
    {family:'backup-restore', testIds:['ADMIN-004'], artifacts:[recovery], assertions:selectAssertions(recovery.value,[
      'pilot-recovery--cleanRestoreVerified',
      'pilot-recovery--corruptionRejected',
      'pilot-recovery--incompleteBackupRejected',
      'pilot-recovery--wrongVersionRejected',
    ],recovery.sha256,'RECOVERY')},
    {family:'recovery-rollback', testIds:['SAFETY-005'], artifacts:[recovery,postgres], assertions:[
      ...selectAssertions(recovery.value,['pilot-recovery--interruptedRetryVerified','pilot-recovery--canonicalReceiptVerified'],recovery.sha256,'RECOVERY'),
      ...selectAssertions(postgres.value,['pilot-operations-postgres--responseLossExactReplayVerified'],postgres.sha256,'POSTGRES'),
    ]},
  ];

  await mkdir(outputDir, {recursive: true});
  const results = [];
  for (const spec of specs) {
    const result = deriveHostedAssertionDisposition(spec.assertions);
    const value = {
      schemaVersion:'hosted-family-assertion-v2', family:spec.family, result,
      deploymentTargetFingerprint:deploymentFingerprint, observedAt, testIds:spec.testIds,
      execution:{releaseSha:expected.head,producerWorkflowPath:expected.workflowPath,producerRunId:expected.runId,producerRunAttempt:Number(expected.runAttempt)},
      scope:{organizationId:expected.organizationId,workspaceId:expected.workspaceId,exerciseRunId:expected.exerciseRunId},
      assertionOutcomes:spec.assertions, sourceArtifacts:spec.artifacts.map(source),
    };
    const outputPath = path.join(outputDir, `${spec.family}.json`);
    await writeFile(outputPath, `${JSON.stringify(value,null,2)}\n`, {mode:0o600});
    results.push(value);
  }
  return results;
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  const [postgresPath, recoveryPath, providerPath, journeyPath, outputDir] = process.argv.slice(2);
  if (![postgresPath,recoveryPath,providerPath,journeyPath,outputDir].every(Boolean)) throw new Error('usage: postgres.json recovery.json provider.json journey.json output-dir');
  const env = process.env;
  await deriveHostedEvidenceFamilyAssertions({
    postgresPath,recoveryPath,providerPath,journeyPath,outputDir,
    expected:{head:env.EXPECTED_RELEASE_SHA,runId:env.GITHUB_RUN_ID,runAttempt:Number(env.GITHUB_RUN_ATTEMPT),workflowPath:env.ACCEPTANCE_WORKFLOW_PATH,organizationId:env.HOSTED_PILOT_ORGANIZATION_ID,workspaceId:env.HOSTED_PILOT_WORKSPACE_ID,exerciseRunId:env.HOSTED_PILOT_EXERCISE_RUN_ID},
    deploymentFingerprint:env.DEPLOYMENT_FINGERPRINT,
  });
}
