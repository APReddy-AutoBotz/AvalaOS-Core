#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCanonicalMigrationInventory } from './hostedPilotActivation.mjs';
import { ACTIVATION_PRODUCER_WORKFLOW, REQUIRED_GATES, safeHash, validateHostedUrl } from './verify-hosted-pilot-evidence.mjs';
import {validateAuthoritativeHostedFamilyState} from './hostedEvidenceFamilyAttestation.mjs';

export const DEFAULT_HOSTED_PILOT_MANIFEST_PATH = 'artifacts/hosted-pilot/manifest.json';

export const resolveHostedPilotManifestOutput = (args, root = process.cwd()) => {
  if (!Array.isArray(args)) throw new Error('HOSTED_PILOT_OUTPUT_ARGUMENTS_INVALID');
  if (args.length === 0) return path.resolve(root, DEFAULT_HOSTED_PILOT_MANIFEST_PATH);
  if (
    args.length !== 2
    || args[0] !== '--output'
    || typeof args[1] !== 'string'
    || args[1].length === 0
    || args[1] !== args[1].trim()
    || args[1].startsWith('-')
    || args[1].includes('\0')
  ) {
    throw new Error('HOSTED_PILOT_OUTPUT_ARGUMENTS_INVALID');
  }
  return path.resolve(root, args[1]);
};

const readSource = async (root, sourcePath) => {
  const normalized = typeof sourcePath === 'string' ? sourcePath.replaceAll('\\', '/') : '';
  if (!/^supabase\/migrations\/[A-Za-z0-9._-]+\.sql$/.test(normalized) || path.isAbsolute(normalized)) {
    throw new Error('hosted family source path must be a repository-relative migration');
  }
  const absolute = path.resolve(root, ...normalized.split('/'));
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('hosted family source path escaped the checkout');
  return readFile(absolute);
};

export const produceHostedPilotActivationManifest = async ({
  args = process.argv.slice(2),
  environment = process.env,
  root = process.cwd(),
} = {}) => {
  const outputPath = resolveHostedPilotManifestOutput(args, root);
  const required = name => { const value=environment[name]; if(!value) throw new Error(`${name} is required`); return value; };
  const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  if(head!==required('EXPECTED_RELEASE_SHA')) throw new Error('release checkout mismatch');
  const canonical=await loadCanonicalMigrationInventory(root);
  const targetFingerprint=required('TARGET_FINGERPRINT');
  if(!/^sha256:[0-9a-f]{64}$/.test(targetFingerprint)) throw new Error('target fingerprint must be sanitized');
  const origin=validateHostedUrl(required('DEPLOYMENT_ORIGIN'));
  const trustedResults=JSON.parse(required('TRUSTED_GATE_RESULTS_JSON'));
  const runId=required('WORKFLOW_RUN_ID'), attempt=Number(required('WORKFLOW_RUN_ATTEMPT'));
  const scope={organizationId:required('HOSTED_PILOT_ORGANIZATION_ID'),workspaceId:required('HOSTED_PILOT_WORKSPACE_ID'),exerciseRunId:required('HOSTED_PILOT_EXERCISE_RUN_ID')};
  if(Object.values(scope).some(value=>!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value))) throw new Error('canonical hosted evidence scope is invalid');
  const expectedDeploymentFingerprint=safeHash(origin);
  const hostedEvidenceFamilyState=await validateAuthoritativeHostedFamilyState(trustedResults.__hostedEvidenceFamilyState,
    {releaseSha:head,producerWorkflowPath:ACTIVATION_PRODUCER_WORKFLOW,producerRunId:runId,producerRunAttempt:attempt,
      ...scope,targetFingerprint,deploymentFingerprint:expectedDeploymentFingerprint},{readSource: sourcePath => readSource(root, sourcePath)});
  const evidence=Object.fromEntries(REQUIRED_GATES.map(g=>{
    const item=trustedResults[g];
    if(!item || item.result!=='passed' || item.gitCommit!==head || item.workflowRunId!==runId
      || Number(item.workflowRunAttempt)!==attempt || item.workflowPath!==ACTIVATION_PRODUCER_WORKFLOW
      || item.workflowConclusion!=='success' || item.environment!=='hosted_nonproduction_pilot'
      || item.targetFingerprint!==targetFingerprint || item.deploymentTargetFingerprint!==expectedDeploymentFingerprint
      || item.organizationId!==scope.organizationId || item.workspaceId!==scope.workspaceId || item.exerciseRunId!==scope.exerciseRunId
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(item.resultId??''))
      throw new Error(`trusted successful exact-run evidence is required for ${g}`);
    return [g,item];
  }));
  const manifest={schemaVersion:1,gitCommit:head,environment:'hosted_nonproduction_pilot',hostedNonproductionVerified:true,
    productionAuthorized:false,liveActivationAuthorized:false,customerDataAuthorized:false,customerDataUsed:false,
    externalUsersAuthorized:false,externalUsersUsed:false,realProviderCallsAuthorized:false,realProviderCallsUsed:false,
    targetFingerprint,deploymentTargetFingerprint:expectedDeploymentFingerprint,migrationChainHash:`sha256:${canonical.digest}`,
    ...scope,hostedEvidenceFamilyState,deploymentId:required('DEPLOYMENT_ID'),workflowRunId:runId,workflowRunAttempt:attempt,
    workflowPath:ACTIVATION_PRODUCER_WORKFLOW,workflowRepository:required('WORKFLOW_REPOSITORY'),workflowEvent:'workflow_dispatch',workflowConclusion:'success',evidence};
  await mkdir(path.dirname(outputPath),{recursive:true});
  await writeFile(outputPath,`${JSON.stringify(manifest,null,2)}\n`,{mode:0o600});
  return outputPath;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await produceHostedPilotActivationManifest();
}
