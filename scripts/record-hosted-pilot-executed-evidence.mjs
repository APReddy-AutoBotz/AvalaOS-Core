#!/usr/bin/env node
import pg from 'pg';
import {safeHash,validateHostedUrl,canonicalTargetFingerprint} from './verify-hosted-pilot-evidence.mjs';
const required=name=>{const value=process.env[name];if(!value)throw new Error(`${name} is required`);return value;};
const client=new pg.Client({connectionString:required('HOSTED_PILOT_DATABASE_URL'),application_name:'avalaos_hosted_pilot_executed_evidence'});
await client.connect();
try {
  const values=[required('HOSTED_PILOT_ORGANIZATION_ID'),required('HOSTED_PILOT_WORKSPACE_ID'),required('HOSTED_PILOT_EXERCISE_RUN_ID'),required('EXPECTED_RELEASE_SHA'),
    '.github/workflows/hosted-pilot-activation-evidence-producer.yml',required('GITHUB_RUN_ID'),Number(required('GITHUB_RUN_ATTEMPT')),
    canonicalTargetFingerprint(required('HOSTED_PILOT_TARGET_FINGERPRINT')),safeHash(validateHostedUrl(required('HOSTED_PILOT_URL'))),
    required('HOSTED_PILOT_RECOVERY_ACTOR_ID'),Number(required('HOSTED_PILOT_RECOVERY_AUTHORIZATION_VERSION'))];
  const result=(await client.query('select public.hosted_pilot_record_verification_result($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result',values)).rows[0]?.result;
  if(!['recorded','exact_replay'].includes(result?.status)||result.productionAuthorized!==false) throw new Error('executed evidence was not recorded');
  process.stdout.write(`${JSON.stringify({status:result.status,productionAuthorized:false})}\n`);
} finally {await client.end();}
