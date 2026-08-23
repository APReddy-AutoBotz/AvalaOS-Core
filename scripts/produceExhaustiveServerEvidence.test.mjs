import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {loadExecutionBindings, loadSourceProvenance} from './exhaustiveAcceptanceModel.mjs';

const root=mkdtempSync(path.join(tmpdir(),'avalaos-server-evidence-'));
const source=path.join(root,'postgres.json'),output=path.join(root,'server.json');
const binding=loadExecutionBindings().serverTests.find(item=>item.testId==='SAFETY-005');
const provenance=loadSourceProvenance().contracts.find(item=>item.testId==='SAFETY-005');
const identity={releaseSha:'a'.repeat(40),workflowRunId:'123456',workflowAttempt:'2',workflowPath:'.github/workflows/exhaustive-acceptance.yml'};
const proof={kind:'executed_disposable_postgresql',postgresMajor:16,head:identity.releaseSha,runId:identity.workflowRunId,runAttempt:Number(identity.workflowAttempt),workflowPath:identity.workflowPath,environment:'disposable-ci',scope:provenance.scope,responseLossExactReplayVerified:true,responseLossExactlyOneEffectVerified:true,responseLossConflictRejected:true,responseLossForeignTenantNonDisclosure:true,assertionResults:binding.assertionIds.map(assertionId=>({assertionId,status:'PASS'}))};
const run=(value=proof,extra={})=>{writeFileSync(source,JSON.stringify(value));return spawnSync(process.execPath,['scripts/produceExhaustiveServerEvidence.mjs'],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,RELEASE_SHA:identity.releaseSha,GITHUB_RUN_ID:identity.workflowRunId,GITHUB_RUN_ATTEMPT:identity.workflowAttempt,ACCEPTANCE_WORKFLOW_PATH:identity.workflowPath,PILOT_OPERATIONS_POSTGRES_ARTIFACT:source,SERVER_RESULTS_MANIFEST:output,...extra}})};
try {
  assert.equal(run().status,0);
  const manifest=JSON.parse(readFileSync(output,'utf8'));
  assert.equal(manifest.results[0].status,'PASS');
  assert.equal(manifest.suites[0].status,manifest.results[0].assertionOutcomes.every(item=>item.status==='PASS')?'PASS':'BLOCKED','suite status must derive from bound assertion outputs');
  assert.deepEqual(manifest.results[0].scenarioIds,binding.scenarioIds,'server scenario IDs must come from the canonical binding');
  assert.equal(manifest.workflowAttempt,identity.workflowAttempt);
  assert.equal(run({...proof,runAttempt:1}).status,1,'stale workflow attempt must be rejected');
  assert.equal(run({...proof,scope:{...proof.scope,workspaceId:'wrong'}}).status,1,'wrong workspace must be rejected');
  assert.equal(run({...proof,assertionResults:proof.assertionResults.map((item,index)=>index?item:{...item,status:'BLOCKED'})}).status,1,'skipped assertion must be rejected even when the process itself runs');
  assert.equal(run(proof,{ACCEPTANCE_SERVER_EVIDENCE_ENVIRONMENT:'substituted-ci'}).status,1,'wrong server environment must fail closed');
  assert.equal(run(proof,{ACCEPTANCE_WORKFLOW_PATH:'.github/workflows/substituted.yml'}).status,1,'wrong server workflow must fail closed');
} finally {rmSync(root,{recursive:true,force:true});}
console.log('exhaustive server evidence: exact run attempt, scope, and assertion outputs passed');
