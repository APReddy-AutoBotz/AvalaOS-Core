import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {
  createHostedEvidenceFamilyAttestation, composeHostedEvidenceFamilyAttestations,
  HOSTED_EVIDENCE_FAMILIES, HOSTED_EVIDENCE_FAMILY_CONTRACTS,
  canonicalHostedSourceSha256, hostedEvidenceFamilyContractSha256, hostedEvidenceObservationSetSha256, validateAuthoritativeHostedFamilyState,
  validateHostedEvidenceFamilyAssertion,
} from './hostedEvidenceFamilyAttestation.mjs';

const now=new Date('2026-08-22T12:00:00Z');
assert.equal(canonicalHostedSourceSha256(Buffer.from('line one\r\nline two\r\n')),canonicalHostedSourceSha256(Buffer.from('line one\nline two\n')),'source proof must be checkout-platform independent');
const identity={organizationId:'00000000-0000-4000-8000-000000000001',workspaceId:'00000000-0000-4000-8000-000000000002',exerciseRunId:'00000000-0000-4000-8000-000000000003',releaseSha:'a'.repeat(40),producerWorkflowPath:'.github/workflows/hosted-pilot-activation-evidence-producer.yml',producerRunId:'42',producerRunAttempt:1,targetFingerprint:`sha256:${'b'.repeat(64)}`,deploymentFingerprint:`sha256:${'c'.repeat(64)}`,hostedTarget:'hosted_nonproduction_pilot',environment:'hosted_nonproduction_pilot'};
const provenance=family=>{
  const contract=HOSTED_EVIDENCE_FAMILY_CONTRACTS[family];
  const paths=[...new Set(contract.assertions.map(item=>item.sourcePath))];
  const sourceArtifacts=paths.map(sourcePath=>({path:sourcePath,sha256:contract.assertions.find(item=>item.sourcePath===sourcePath).sourceSha256}));
  const byPath=new Map(sourceArtifacts.map(item=>[item.path,item.sha256]));
  return {testIds:[...contract.testIds],contractSha256:hostedEvidenceFamilyContractSha256(family),
    assertions:contract.assertions.map(item=>({assertionId:item.assertionId,status:'PASS',sourceArtifactSha256:byPath.get(item.sourcePath),observationSha256:`sha256:${createHash('sha256').update(item.assertionId).digest('hex')}`})),sourceArtifacts};
};
const make=(family,extra={})=>createHostedEvidenceFamilyAttestation({...identity,family,disposition:'passed',...provenance(family),observedAt:now.toISOString(),...extra});
const all=HOSTED_EVIDENCE_FAMILIES.map(make);
assert.equal(composeHostedEvidenceFamilyAttestations(all,identity,{now}).length,5);
const rejects=(values,expected=identity,pattern)=>assert.throws(()=>composeHostedEvidenceFamilyAttestations(values,expected,{now}),pattern);
rejects(all.slice(1),identity,/EXACTLY_FIVE/); rejects([all[0],all[0],...all.slice(2)],identity,/DUPLICATE/);
assert.throws(()=>createHostedEvidenceFamilyAttestation({...identity,family:'wrong',disposition:'passed',...provenance(HOSTED_EVIDENCE_FAMILIES[0]),observedAt:now.toISOString()}),/FAMILY_INVALID/);
for(const key of ['producerRunId','producerRunAttempt','releaseSha','organizationId','workspaceId','exerciseRunId','targetFingerprint','deploymentFingerprint','hostedTarget']) rejects(all,{...identity,[key]:'wrong'},new RegExp(key.toUpperCase()));
const stale=HOSTED_EVIDENCE_FAMILIES.map(f=>make(f,{observedAt:'2026-08-21T00:00:00Z'})); rejects(stale,identity,/STALE/);
{const changed=structuredClone(all);changed[0].assertions[0].assertionId='MODIFIED';rejects(changed,identity,/REGISTERED_SET|DIGEST/);}
{const changed=structuredClone(all);changed[0].sourceArtifacts[0].path='modified';rejects(changed,identity,/SOURCE_OWNERSHIP|DIGEST/);}
const cross=structuredClone(all);cross[0]=make(HOSTED_EVIDENCE_FAMILIES[0],{producerRunId:'99'});rejects(cross,identity,/RUNID/);
assert.throws(()=>make(HOSTED_EVIDENCE_FAMILIES[0],{assertions:[{assertionId:'skipped',status:'SKIPPED'}],disposition:'passed'}),/NOT_DERIVED/);
assert.throws(()=>make(HOSTED_EVIDENCE_FAMILIES[0],{producerRunAttempt:0}),/RUN_ATTEMPT_INVALID/);
assert.throws(()=>make(HOSTED_EVIDENCE_FAMILIES[0],{environment:'disposable-ci'}),/ENVIRONMENT_INVALID/);

const family=HOSTED_EVIDENCE_FAMILIES[0],p=provenance(family);
const familyBinding={family,releaseSha:identity.releaseSha,producerWorkflowPath:identity.producerWorkflowPath,producerRunId:identity.producerRunId,producerRunAttempt:identity.producerRunAttempt,organizationId:identity.organizationId,workspaceId:identity.workspaceId,exerciseRunId:identity.exerciseRunId,targetFingerprint:identity.targetFingerprint,deploymentFingerprint:identity.deploymentFingerprint};
const familyAssertion={schemaVersion:'hosted-family-assertion-v2',family,result:'passed',environment:'hosted_nonproduction_pilot',targetFingerprint:identity.targetFingerprint,deploymentTargetFingerprint:identity.deploymentFingerprint,testIds:p.testIds,contractSha256:p.contractSha256,execution:{releaseSha:identity.releaseSha,producerWorkflowPath:identity.producerWorkflowPath,producerRunId:identity.producerRunId,producerRunAttempt:identity.producerRunAttempt},scope:{organizationId:identity.organizationId,workspaceId:identity.workspaceId,exerciseRunId:identity.exerciseRunId},assertionOutcomes:p.assertions,sourceArtifacts:p.sourceArtifacts,observationSchemaVersion:'hosted-family-derived-observation-v1',observationBinding:familyBinding,observationSetSha256:hostedEvidenceObservationSetSha256(familyBinding,p.assertions),observedAt:now.toISOString(),disposition:'executed_hosted_evidence'};
validateHostedEvidenceFamilyAssertion(familyAssertion,{family,...identity});
assert.throws(()=>validateHostedEvidenceFamilyAssertion({...familyAssertion,testIds:['FAKE-001']},{family,...identity}),/TEST_IDS_MISMATCH/);
assert.throws(()=>validateHostedEvidenceFamilyAssertion({...familyAssertion,contractSha256:`sha256:${'0'.repeat(64)}`},{family,...identity}),/CONTRACT_MISMATCH/);
assert.throws(()=>validateHostedEvidenceFamilyAssertion({...familyAssertion,assertionOutcomes:[...familyAssertion.assertionOutcomes.slice(0,-1),{assertionId:'substituted',status:'PASS',sourceArtifactSha256:p.sourceArtifacts[0].sha256}]},{family,...identity}),/REGISTERED_SET/);
assert.throws(()=>validateHostedEvidenceFamilyAssertion({...familyAssertion,sourceArtifacts:[{path:'fake-source.sql',sha256:p.sourceArtifacts[0].sha256}]},{family,...identity}),/SOURCE_OWNERSHIP/);
assert.throws(()=>validateHostedEvidenceFamilyAssertion({...familyAssertion,result:'passed',assertionOutcomes:familyAssertion.assertionOutcomes.map((item,index)=>index?item:{...item,status:'SKIPPED'})},{family,...identity}),/RESULT_NOT_DERIVED/);
assert.throws(()=>validateHostedEvidenceFamilyAssertion(familyAssertion,{family,...identity,producerRunAttempt:0}),/RUN_ATTEMPT_INVALID/);
assert.throws(()=>validateHostedEvidenceFamilyAssertion(familyAssertion,{family,...identity,targetFingerprint:`sha256:${'f'.repeat(64)}`}),/TARGET_MISMATCH/);

const states=HOSTED_EVIDENCE_FAMILIES.map(current=>{const owned=provenance(current),binding={...familyBinding,family:current};return {...familyAssertion,family:current,testIds:owned.testIds,contractSha256:owned.contractSha256,assertionOutcomes:owned.assertions,sourceArtifacts:owned.sourceArtifacts,observationBinding:binding,observationSetSha256:hostedEvidenceObservationSetSha256(binding,owned.assertions)};});
await validateAuthoritativeHostedFamilyState(states,identity);
await assert.rejects(validateAuthoritativeHostedFamilyState(states.slice(1),identity),/EXACTLY_FIVE/);
await assert.rejects(validateAuthoritativeHostedFamilyState(states,identity,{readSource:async()=>Buffer.from('wrong bytes')}),/SOURCE_DIGEST_MISMATCH/);

await validateAuthoritativeHostedFamilyState(states,identity,{readSource:sourcePath=>readFile(sourcePath)});

const producerDirectory=await mkdtemp(path.join(tmpdir(),'avalaos-hosted-family-producer-'));
try {
  const assertionPath=path.join(producerDirectory,'assertion.json'),outputPath=path.join(producerDirectory,'attestation.json');
  await writeFile(assertionPath,JSON.stringify(familyAssertion));
  const producerEnv={...process.env,EXPECTED_RELEASE_SHA:identity.releaseSha,ACCEPTANCE_WORKFLOW_PATH:identity.producerWorkflowPath,
    GITHUB_RUN_ID:identity.producerRunId,GITHUB_RUN_ATTEMPT:String(identity.producerRunAttempt),
    HOSTED_PILOT_ORGANIZATION_ID:identity.organizationId,HOSTED_PILOT_WORKSPACE_ID:identity.workspaceId,
    HOSTED_PILOT_EXERCISE_RUN_ID:identity.exerciseRunId,TARGET_FINGERPRINT:identity.targetFingerprint,
    DEPLOYMENT_FINGERPRINT:identity.deploymentFingerprint};
  const produced=spawnSync(process.execPath,['scripts/produceHostedEvidenceFamilyAttestation.mjs',family,assertionPath,outputPath],{encoding:'utf8',env:producerEnv});
  assert.equal(produced.status,0,produced.stderr);
  const output=JSON.parse(await readFile(outputPath,'utf8'));
  assert.deepEqual(output.sourceArtifacts,familyAssertion.sourceArtifacts,'producer must retain the exact registered source set');
  assert.equal(output.targetFingerprint,identity.targetFingerprint);
  const wrongTarget=spawnSync(process.execPath,['scripts/produceHostedEvidenceFamilyAttestation.mjs',family,assertionPath,outputPath],{encoding:'utf8',env:{...producerEnv,TARGET_FINGERPRINT:`sha256:${'f'.repeat(64)}`}});
  assert.notEqual(wrongTarget.status,0);
  assert.match(wrongTarget.stderr,/TARGET_MISMATCH/);
} finally {
  await rm(producerDirectory,{recursive:true,force:true});
}
console.log('hosted evidence family attestations: registered provenance and adversarial contracts passed');
