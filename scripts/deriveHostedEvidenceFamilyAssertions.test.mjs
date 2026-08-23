import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {deriveHostedEvidenceFamilyAssertions} from './deriveHostedEvidenceFamilyAssertions.mjs';
import {validateHostedEvidenceFamilyAssertion} from './hostedEvidenceFamilyAttestation.mjs';

const root=await mkdtemp(path.join(tmpdir(),'avalaos-hosted-families-'));
const expected={head:'a'.repeat(40),runId:'42',runAttempt:3,workflowPath:'.github/workflows/hosted-pilot-activation-evidence-producer.yml',organizationId:'10000000-0000-4000-8000-000000000001',workspaceId:'20000000-0000-4000-8000-000000000001',exerciseRunId:'30000000-0000-4000-8000-000000000001'};
const execution={head:expected.head,runId:expected.runId,runAttempt:expected.runAttempt,workflowPath:expected.workflowPath,environment:'disposable-ci',assertionDisposition:'passed'};
const scope={organizationId:expected.organizationId,workspaceId:expected.workspaceId};
const fixtures={
  postgres:{...execution,scope,assertionResults:['responseLossExactReplayVerified','responseLossExactlyOneEffectVerified','responseLossConflictRejected','responseLossForeignTenantNonDisclosure'].map(name=>({assertionId:`pilot-operations-postgres--${name}`,status:'PASS'}))},
  recovery:{...execution,scope,assertionResults:['cleanRestoreVerified','corruptionRejected','incompleteBackupRejected','wrongVersionRejected','interruptedRetryVerified','canonicalReceiptVerified'].map(name=>({assertionId:`pilot-recovery--${name}`,status:'PASS'}))},
  provider:{...execution,scope:{kind:'synthetic-organization-policy',organizationId:'11111111-1111-4111-8111-111111111111'},realNetworkEgressObserved:false,providerExecutionBoundary:'injected-test-executor',assertionResults:['denied-path-zero-provider-calls','audit-failure-zero-provider-calls','secret-failure-zero-provider-calls','resolver-failure-zero-provider-calls','allowed-path-injected-executor-only'].map(name=>({assertionId:`provider-simulation--${name}`,status:'PASS'}))},
  journey:{...execution,scope:{kind:'synthetic-contract-model'},assertionResults:['score-version-unchanged','lineage-unique','private-artifact-no-raw-url','adversarial-and-recovery-invariants'].map(name=>({assertionId:`canonical-journey--${name}`,status:'PASS'}))},
};
const paths=Object.fromEntries(await Promise.all(Object.entries(fixtures).map(async([name,value])=>{const target=path.join(root,`${name}.json`);await writeFile(target,JSON.stringify(value));return[name,target]})));
const run=(overrides={})=>deriveHostedEvidenceFamilyAssertions({postgresPath:paths.postgres,recoveryPath:paths.recovery,providerPath:paths.provider,journeyPath:paths.journey,outputDir:path.join(root,`out-${Math.random()}`),expected,deploymentFingerprint:`sha256:${'d'.repeat(64)}`,...overrides});
try {
  const results=await run();
  assert.equal(results.length,5);
  assert.equal(results.every(item=>item.result==='passed'),true);
  assert.equal(results.every(item=>item.assertionOutcomes.length>0),true);
  assert.equal(results.every(item=>item.schemaVersion==='disposable-family-regression-v1'&&item.hostedEvidenceEligible===false&&item.hostedTarget===null),true);
  assert.throws(()=>validateHostedEvidenceFamilyAssertion(results[0],{family:results[0].family,...expected,deploymentFingerprint:`sha256:${'d'.repeat(64)}`}),/SCHEMA_INVALID/,'disposable evidence can never be relabelled as hosted');
  const tenant=results.find(item=>item.family==='tenant-adversarial');
  assert.deepEqual(tenant.scope,{organizationId:expected.organizationId,workspaceId:expected.workspaceId,exerciseRunId:expected.exerciseRunId});

  const original=JSON.parse(await readFile(paths.postgres,'utf8'));
  original.assertionResults[0].status='SKIPPED';
  original.assertionDisposition='blocked';
  await writeFile(paths.postgres,JSON.stringify(original));
  const blocked=await run();
  assert.equal(blocked.find(item=>item.family==='tenant-adversarial').result,'blocked','green process completion must not convert skipped assertion to pass');
  original.assertionDisposition='passed';
  await writeFile(paths.postgres,JSON.stringify(original));
  await assert.rejects(run(),/ASSERTION_DISPOSITION_NOT_DERIVED/,'dishonest green-suite disposition must fail closed');
  await writeFile(paths.postgres,JSON.stringify(fixtures.postgres));

  await assert.rejects(run({expected:{...expected,workspaceId:'wrong-workspace'}}),/WORKSPACE_MISMATCH/);
  await assert.rejects(run({expected:{...expected,organizationId:'wrong-tenant'}}),/ORGANIZATION_MISMATCH/);
  await assert.rejects(run({expected:{...expected,runAttempt:4}}),/RUNATTEMPT_MISMATCH/);
  const provider=JSON.parse(await readFile(paths.provider,'utf8'));provider.realNetworkEgressObserved=true;await writeFile(paths.provider,JSON.stringify(provider));
  await assert.rejects(run(),/EGRESS_PROOF_INVALID/);
} finally {await rm(root,{recursive:true,force:true});}
console.log('hosted family assertion derivation: actual outputs and adversarial bindings passed');
