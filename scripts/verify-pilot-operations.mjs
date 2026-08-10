import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import contract from '../config/v1-pilot-operations-contract.json' with { type: 'json' };

const authoritative=process.argv.includes('--authoritative');
const checkedOutHead=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const expectedHead=process.env.PILOT_OPERATIONS_HEAD || checkedOutHead;
let supplied={}; try{supplied=JSON.parse(process.env.PILOT_OPERATIONS_GATE_RESULTS||'{}')}catch{supplied={}}
const runId=process.env.GITHUB_RUN_ID||null;
const evidenceArtifact=(path,kind,required)=>{try{const bytes=fs.readFileSync(path);const value=JSON.parse(bytes);const valid=value.kind===kind&&value.head===checkedOutHead&&value.runId===runId&&value.liveActivationAuthorized===false&&required.every(key=>value[key]===true);return{valid,digest:createHash('sha256').update(bytes).digest('hex')}}catch{return{valid:false,digest:null}}};
const postgres=evidenceArtifact(process.env.PILOT_OPERATIONS_POSTGRES_ARTIFACT||'','executed_disposable_postgresql',['freshApplied','acceptedBaselineUpgradeApplied','forcedRlsVerified','maintenanceDenied','concurrentReplayVerified','expectedVersionVerified','evidenceBindingVerified','separationOfDutyVerified','deprovisionRevocationVerified','crossTenantDisclosureDenied']);
const recovery=evidenceArtifact(process.env.PILOT_OPERATIONS_RECOVERY_ARTIFACT||'','executed_disposable_postgresql_recovery',['cleanRestoreVerified','corruptionRejected','incompleteBackupRejected','wrongVersionRejected','interruptedRetryVerified','canonicalReceiptVerified','syntheticOnly']);
const contextValid=!authoritative || (process.env.GITHUB_ACTIONS==='true' && process.env.GITHUB_WORKFLOW==='Pilot Operations' && /^\d+$/.test(runId||'') && expectedHead===checkedOutHead && process.env.GITHUB_REPOSITORY==='APReddy-AutoBotz/AvalaOS-Core' && postgres.valid && recovery.valid);
const gates=contract.requiredGates.map(id=>{
  const item=supplied[id];
  const valid=item && item.result==='passed' && item.head===checkedOutHead && item.runId===runId && typeof item.command==='string' && item.command.trim() && typeof item.job==='string' && item.job.trim();
  const artifactDigest=id==='postgres-fresh-upgrade'||id==='tenant-adversarial'||id==='maintenance-rollback'?postgres.digest:id==='backup-restore-recovery'?recovery.digest:null;
  return {id,result:contextValid&&valid?'passed':authoritative?'failed':'pending',command:item?.command||null,job:item?.job||null,runId:item?.runId||null,head:item?.head||null,artifactDigest};
});
const passed=gates.every(g=>g.result==='passed');
const manifest={schemaVersion:contract.manifestSchemaVersion,candidate:{head:expectedHead,checkedOutHead,baseline:contract.baselineMainSha},run:{id:runId,attempt:process.env.GITHUB_RUN_ATTEMPT||null,workflow:process.env.GITHUB_WORKFLOW||'local'},scope:contract.scope,result:passed?'passed':authoritative?'failed':'pending',gates,liveActivation:{state:contract.liveActivationState,authorized:false},hostedLive:{classification:'not_proven_hosted_live',result:'not_proven'}};
fs.mkdirSync('artifacts/pilot-operations',{recursive:true}); fs.writeFileSync('artifacts/pilot-operations/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(`Pilot Operations manifest: ${manifest.result}; ${gates.filter(g=>g.result==='passed').length}/${gates.length} gates passed.`);
if(authoritative&&!passed)process.exitCode=1;
