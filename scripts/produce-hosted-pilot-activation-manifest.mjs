#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { loadCanonicalMigrationInventory } from './hostedPilotActivation.mjs';
import { ACTIVATION_PRODUCER_WORKFLOW, REQUIRED_GATES, safeHash, validateHostedUrl } from './verify-hosted-pilot-evidence.mjs';

const required = name => { const value=process.env[name]; if(!value) throw new Error(`${name} is required`); return value; };
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(head!==required('EXPECTED_RELEASE_SHA')) throw new Error('release checkout mismatch');
const canonical=await loadCanonicalMigrationInventory();
const targetFingerprint=required('TARGET_FINGERPRINT');
if(!/^sha256:[0-9a-f]{64}$/.test(targetFingerprint)) throw new Error('target fingerprint must be sanitized');
const origin=validateHostedUrl(required('DEPLOYMENT_ORIGIN'));
const ids=JSON.parse(required('GATE_RESULT_IDS_JSON'));
if(Object.keys(ids).length!==REQUIRED_GATES.length || REQUIRED_GATES.some(g=>!(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(ids[g]??'')))) throw new Error('exact bounded gate result IDs are required');
const runId=required('WORKFLOW_RUN_ID'), attempt=Number(required('WORKFLOW_RUN_ATTEMPT'));
const evidence=Object.fromEntries(REQUIRED_GATES.map(g=>[g,{result:'passed',gitCommit:head,workflowRunId:runId,workflowRunAttempt:attempt,resultId:ids[g]}]));
const manifest={schemaVersion:1,gitCommit:head,environment:'hosted_nonproduction_pilot',hostedNonproductionVerified:true,
  productionAuthorized:false,liveActivationAuthorized:false,customerDataAuthorized:false,customerDataUsed:false,
  externalUsersAuthorized:false,externalUsersUsed:false,realProviderCallsAuthorized:false,realProviderCallsUsed:false,
  targetFingerprint,deploymentTargetFingerprint:safeHash(origin),migrationChainHash:`sha256:${canonical.digest}`,
  deploymentId:required('DEPLOYMENT_ID'),workflowRunId:runId,workflowRunAttempt:attempt,
  workflowPath:ACTIVATION_PRODUCER_WORKFLOW,workflowRepository:required('WORKFLOW_REPOSITORY'),workflowEvent:'workflow_dispatch',workflowConclusion:'success',evidence};
await mkdir('artifacts/hosted-pilot',{recursive:true});
await writeFile('artifacts/hosted-pilot/manifest.json',`${JSON.stringify(manifest,null,2)}\n`,{mode:0o600});
