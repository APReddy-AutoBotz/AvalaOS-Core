#!/usr/bin/env node
import pg from 'pg';
import {canonicalTargetFingerprint,safeHash,validateHostedUrl} from './verify-hosted-pilot-evidence.mjs';

const REQUIRED_FAMILIES=Object.freeze([
  'tenant-adversarial',
  'provider-simulation-zero-egress',
  'canonical-journey',
  'backup-restore',
  'recovery-rollback',
]);
const required=name=>{const value=process.env[name];if(!value)throw new Error(`${name} is required`);return value;};
const timeoutSeconds=Number(process.env.HOSTED_PILOT_EVIDENCE_WAIT_SECONDS??'900');
if(!Number.isSafeInteger(timeoutSeconds)||timeoutSeconds<1||timeoutSeconds>1800) throw new Error('HOSTED_PILOT_EVIDENCE_WAIT_SECONDS_INVALID');
const intervalMs=5000;
const binding={
  orgId:required('HOSTED_PILOT_ORGANIZATION_ID'),
  workspaceId:required('HOSTED_PILOT_WORKSPACE_ID'),
  exerciseRunId:required('HOSTED_PILOT_EXERCISE_RUN_ID'),
  releaseSha:required('EXPECTED_RELEASE_SHA'),
  workflowPath:'.github/workflows/hosted-pilot-activation-evidence-producer.yml',
  runId:required('GITHUB_RUN_ID'),
  runAttempt:Number(required('GITHUB_RUN_ATTEMPT')),
  targetFingerprint:canonicalTargetFingerprint(required('HOSTED_PILOT_TARGET_FINGERPRINT')),
  deploymentFingerprint:safeHash(validateHostedUrl(required('HOSTED_PILOT_URL'))),
};
if(!Number.isSafeInteger(binding.runAttempt)||binding.runAttempt<1) throw new Error('HOSTED_PILOT_RUN_ATTEMPT_INVALID');

const client=new pg.Client({connectionString:required('HOSTED_PILOT_DATABASE_URL'),application_name:'avalaos_hosted_pilot_evidence_wait'});
await client.connect();
const deadline=Date.now()+timeoutSeconds*1000;
try{
  while(true){
    const rows=(await client.query(`SELECT evidence_family,release_sha,producer_workflow_path,producer_run_id,producer_run_attempt,
      target_fingerprint,deployment_fingerprint,hosted_target,disposition
      FROM public.hosted_pilot_exercise_evidence_families
      WHERE org_id=$1 AND workspace_id=$2 AND exercise_run_id=$3 ORDER BY evidence_family`,
      [binding.orgId,binding.workspaceId,binding.exerciseRunId])).rows;
    for(const row of rows){
      if(row.release_sha!==binding.releaseSha||row.producer_workflow_path!==binding.workflowPath||row.producer_run_id!==binding.runId
        ||Number(row.producer_run_attempt)!==binding.runAttempt||row.target_fingerprint!==binding.targetFingerprint
        ||row.deployment_fingerprint!==binding.deploymentFingerprint||row.hosted_target!=='hosted_nonproduction_pilot'
        ||row.disposition!=='executed_hosted_evidence') throw new Error('HOSTED_PILOT_EVIDENCE_BINDING_CONFLICT');
    }
    const present=new Set(rows.map(row=>row.evidence_family));
    if(REQUIRED_FAMILIES.every(family=>present.has(family))&&present.size===REQUIRED_FAMILIES.length){
      process.stdout.write(`${JSON.stringify({status:'ready',evidenceFamilyCount:REQUIRED_FAMILIES.length,productionAuthorized:false})}\n`);
      break;
    }
    if(Date.now()>=deadline) throw new Error('HOSTED_PILOT_EVIDENCE_WAIT_TIMEOUT');
    await new Promise(resolve=>setTimeout(resolve,intervalMs));
  }
}finally{await client.end().catch(()=>undefined);}
