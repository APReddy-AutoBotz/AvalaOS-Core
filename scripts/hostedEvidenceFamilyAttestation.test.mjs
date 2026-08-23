import assert from 'node:assert/strict';
import {createHostedEvidenceFamilyAttestation, composeHostedEvidenceFamilyAttestations, HOSTED_EVIDENCE_FAMILIES, validateHostedEvidenceFamilyAssertion} from './hostedEvidenceFamilyAttestation.mjs';
const now = new Date('2026-08-22T12:00:00Z');
const identity={organizationId:'00000000-0000-4000-8000-000000000001',workspaceId:'00000000-0000-4000-8000-000000000002',exerciseRunId:'00000000-0000-4000-8000-000000000003',releaseSha:'a'.repeat(40),producerWorkflowPath:'.github/workflows/hosted-pilot-activation-evidence-producer.yml',producerRunId:'42',producerRunAttempt:1,targetFingerprint:`sha256:${'b'.repeat(64)}`,deploymentFingerprint:`sha256:${'c'.repeat(64)}`,hostedTarget:'hosted_nonproduction_pilot'};
const make=(family, extra={})=>createHostedEvidenceFamilyAttestation({...identity,family,disposition:'passed',assertions:[{assertionId:`${family}--exact-assertion`,status:'PASS',sourceArtifactSha256:`sha256:${'d'.repeat(64)}`}],sourceArtifacts:[{path:'result.json',sha256:`sha256:${'d'.repeat(64)}`}],observedAt:now.toISOString(),...extra});
const all=HOSTED_EVIDENCE_FAMILIES.map(make);
assert.equal(composeHostedEvidenceFamilyAttestations(all,identity,{now}).length,5);
const rejects=(values, expected=identity, pattern)=>assert.throws(()=>composeHostedEvidenceFamilyAttestations(values,expected,{now}),pattern);
rejects(all.slice(1),identity,/EXACTLY_FIVE/); rejects([all[0],all[0],...all.slice(2)],identity,/DUPLICATE/);
assert.throws(()=>make('wrong'),/FAMILY_INVALID/);
for (const key of ['producerRunId','producerRunAttempt','releaseSha','organizationId','workspaceId','exerciseRunId','targetFingerprint','deploymentFingerprint','hostedTarget']) rejects(all,{...identity,[key]:'wrong'},new RegExp(key.toUpperCase()));
const stale=HOSTED_EVIDENCE_FAMILIES.map(f=>make(f,{observedAt:'2026-08-21T00:00:00Z'})); rejects(stale,identity,/STALE/);
{ const changed=structuredClone(all); changed[0].assertions[0].assertionId='MODIFIED'; rejects(changed,identity,/DIGEST/); }
{ const changed=structuredClone(all); changed[0].sourceArtifacts[0].path='modified'; rejects(changed,identity,/DIGEST/); }
const cross=structuredClone(all); cross[0]=make(HOSTED_EVIDENCE_FAMILIES[0],{producerRunId:'99'}); rejects(cross,identity,/RUNID/);
assert.throws(()=>make(HOSTED_EVIDENCE_FAMILIES[0],{assertions:[{assertionId:'skipped',status:'SKIPPED'}],disposition:'passed'}),/NOT_DERIVED/);
assert.throws(()=>make(HOSTED_EVIDENCE_FAMILIES[0],{assertions:[{assertionId:'blocked',status:'BLOCKED'}],disposition:'blocked'}),/DISPOSITION_INVALID/);
assert.throws(()=>make(HOSTED_EVIDENCE_FAMILIES[0],{producerRunAttempt:0}),/RUN_ATTEMPT_INVALID/);
const familyAssertion={schemaVersion:'hosted-family-assertion-v2',family:HOSTED_EVIDENCE_FAMILIES[0],result:'passed',deploymentTargetFingerprint:identity.deploymentFingerprint,testIds:['SAFETY-005'],execution:{releaseSha:identity.releaseSha,producerWorkflowPath:identity.producerWorkflowPath,producerRunId:identity.producerRunId,producerRunAttempt:identity.producerRunAttempt},scope:{organizationId:identity.organizationId,workspaceId:identity.workspaceId,exerciseRunId:identity.exerciseRunId},assertionOutcomes:[{assertionId:'exact',status:'PASS'}],sourceArtifacts:[{path:'source.json',sha256:`sha256:${'e'.repeat(64)}`}],observedAt:now.toISOString()};
validateHostedEvidenceFamilyAssertion(familyAssertion,{family:familyAssertion.family,...identity});
assert.throws(()=>validateHostedEvidenceFamilyAssertion({...familyAssertion,result:'passed',assertionOutcomes:[{assertionId:'exact',status:'SKIPPED'}]},{family:familyAssertion.family,...identity}),/RESULT_NOT_DERIVED/);
assert.throws(()=>validateHostedEvidenceFamilyAssertion(familyAssertion,{family:familyAssertion.family,...identity,producerRunAttempt:0}),/RUN_ATTEMPT_INVALID/);
console.log('hosted evidence family attestations: positive and 16+ adversarial contracts passed');
