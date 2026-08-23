import {createHash} from 'node:crypto';

export const HOSTED_EVIDENCE_FAMILIES = Object.freeze([
  'tenant-adversarial',
  'provider-simulation-zero-egress',
  'canonical-journey',
  'backup-restore',
  'recovery-rollback',
]);

export const HOSTED_SCENARIO_SOURCE_PATH='supabase/migrations/20260823090000_hosted_evidence_family_provenance_contract.sql';
export const HOSTED_SCENARIO_SOURCE_SHA256='sha256:ab7c4ac7367d6768b6bb4a15cc16dab3ece087404d1ea9f26204222871bd565c';

export const HOSTED_EVIDENCE_FAMILY_CONTRACTS = Object.freeze({
  'tenant-adversarial': Object.freeze({
    testIds: Object.freeze(['SAFETY-005']),
    assertions: Object.freeze([
      Object.freeze({assertionId:'hosted-database--synthetic-subject-role-matrix',sourcePath:HOSTED_SCENARIO_SOURCE_PATH,sourceSha256:HOSTED_SCENARIO_SOURCE_SHA256}),
      Object.freeze({assertionId:'hosted-database--cross-tenant-nondisclosure',sourcePath:HOSTED_SCENARIO_SOURCE_PATH,sourceSha256:HOSTED_SCENARIO_SOURCE_SHA256}),
      Object.freeze({assertionId:'hosted-database--revocation-version-bound',sourcePath:HOSTED_SCENARIO_SOURCE_PATH,sourceSha256:HOSTED_SCENARIO_SOURCE_SHA256}),
      Object.freeze({assertionId:'hosted-database--response-loss-exact-replay',sourcePath:HOSTED_SCENARIO_SOURCE_PATH,sourceSha256:HOSTED_SCENARIO_SOURCE_SHA256}),
    ]),
  }),
  'provider-simulation-zero-egress': Object.freeze({
    testIds: Object.freeze(['AI-006']),
    assertions: Object.freeze([
      Object.freeze({assertionId:'hosted-provider--five-scenarios-executed',sourcePath:HOSTED_SCENARIO_SOURCE_PATH,sourceSha256:HOSTED_SCENARIO_SOURCE_SHA256}),
      Object.freeze({assertionId:'hosted-provider--zero-egress-recorded',sourcePath:HOSTED_SCENARIO_SOURCE_PATH,sourceSha256:HOSTED_SCENARIO_SOURCE_SHA256}),
      Object.freeze({assertionId:'hosted-provider--real-provider-calls-not-authorized',sourcePath:HOSTED_SCENARIO_SOURCE_PATH,sourceSha256:HOSTED_SCENARIO_SOURCE_SHA256}),
    ]),
  }),
  'canonical-journey': Object.freeze({
    testIds: Object.freeze(['E2E-001']),
    assertions: Object.freeze([
      Object.freeze({assertionId:'hosted-journey--exact-release-ingestion',sourcePath:HOSTED_SCENARIO_SOURCE_PATH,sourceSha256:HOSTED_SCENARIO_SOURCE_SHA256}),
      Object.freeze({assertionId:'hosted-journey--recovery-evidence-bound',sourcePath:HOSTED_SCENARIO_SOURCE_PATH,sourceSha256:HOSTED_SCENARIO_SOURCE_SHA256}),
      Object.freeze({assertionId:'hosted-journey--rollback-event-bound',sourcePath:HOSTED_SCENARIO_SOURCE_PATH,sourceSha256:HOSTED_SCENARIO_SOURCE_SHA256}),
    ]),
  }),
  'backup-restore': Object.freeze({
    testIds: Object.freeze(['ADMIN-004']),
    assertions: Object.freeze([
      Object.freeze({assertionId:'hosted-backup--exact-release-recovery-ingestion',sourcePath:HOSTED_SCENARIO_SOURCE_PATH,sourceSha256:HOSTED_SCENARIO_SOURCE_SHA256}),
      Object.freeze({assertionId:'hosted-backup--canonical-migration-ledger',sourcePath:HOSTED_SCENARIO_SOURCE_PATH,sourceSha256:HOSTED_SCENARIO_SOURCE_SHA256}),
      Object.freeze({assertionId:'hosted-backup--target-fingerprint-bound',sourcePath:HOSTED_SCENARIO_SOURCE_PATH,sourceSha256:HOSTED_SCENARIO_SOURCE_SHA256}),
    ]),
  }),
  'recovery-rollback': Object.freeze({
    testIds: Object.freeze(['SAFETY-005']),
    assertions: Object.freeze([
      Object.freeze({assertionId:'hosted-recovery--current-operator-authority',sourcePath:HOSTED_SCENARIO_SOURCE_PATH,sourceSha256:HOSTED_SCENARIO_SOURCE_SHA256}),
      Object.freeze({assertionId:'hosted-recovery--exact-release-rollback-event',sourcePath:HOSTED_SCENARIO_SOURCE_PATH,sourceSha256:HOSTED_SCENARIO_SOURCE_SHA256}),
      Object.freeze({assertionId:'hosted-recovery--recovery-evidence-bound',sourcePath:HOSTED_SCENARIO_SOURCE_PATH,sourceSha256:HOSTED_SCENARIO_SOURCE_SHA256}),
    ]),
  }),
});

const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
export const canonicalHostedSourceSha256 = value => {
  const text=Buffer.isBuffer(value)?value.toString('utf8'):String(value);
  return sha256(Buffer.from(text.replace(/\r\n/gu,'\n'),'utf8'));
};
const normalize = value => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])])) : value;
const canonical = value => JSON.stringify(normalize(value));
const observationSetPayload=(binding,outcomes)=>`${binding.family}|${binding.releaseSha}|${binding.producerWorkflowPath}|${binding.producerRunId}|${Number(binding.producerRunAttempt)}|${binding.organizationId}|${binding.workspaceId}|${binding.exerciseRunId}|${binding.targetFingerprint}|${binding.deploymentFingerprint}|${outcomes.map(item=>`${item.assertionId}@${item.observationSha256}`).join(',')}`;
export const hostedEvidenceObservationSetSha256=(binding,outcomes)=>sha256(observationSetPayload(binding,outcomes));
export const hostedEvidenceFamilyContractSha256 = family => {
  const contract=HOSTED_EVIDENCE_FAMILY_CONTRACTS[family];
  if(!contract) throw new Error('HOSTED_FAMILY_CONTRACT_UNKNOWN');
  return sha256(`${family}|${contract.testIds.join(',')}|${contract.assertions.map(item=>`${item.assertionId}@${item.sourcePath}@${item.sourceSha256}`).join(',')}`);
};
const required = ['organizationId','workspaceId','exerciseRunId','releaseSha','producerWorkflowPath','producerRunId','producerRunAttempt','targetFingerprint','deploymentFingerprint','hostedTarget','environment','family','disposition','testIds','contractSha256','assertions','sourceArtifacts','observedAt'];
const assertionStatuses = new Set(['PASS', 'FAIL', 'BLOCKED', 'SKIPPED']);

export function deriveHostedAssertionDisposition(assertions) {
  if (!Array.isArray(assertions) || !assertions.length) throw new Error('HOSTED_ATTESTATION_ASSERTIONS_REQUIRED');
  const ids = new Set();
  for (const assertion of assertions) {
    if (!assertion?.assertionId || !assertionStatuses.has(assertion.status)) throw new Error('HOSTED_ATTESTATION_ASSERTION_INVALID');
    if (ids.has(assertion.assertionId)) throw new Error('HOSTED_ATTESTATION_ASSERTION_DUPLICATE');
    ids.add(assertion.assertionId);
  }
  if (assertions.some(assertion => assertion.status === 'FAIL')) return 'failed';
  if (assertions.some(assertion => assertion.status !== 'PASS')) return 'blocked';
  return 'passed';
}

function validateRegisteredProvenance({family,testIds,contractSha256,assertions,sourceArtifacts}) {
  const contract=HOSTED_EVIDENCE_FAMILY_CONTRACTS[family];
  if(!contract) throw new Error('HOSTED_FAMILY_CONTRACT_UNKNOWN');
  if(canonical(testIds)!==canonical(contract.testIds)) throw new Error('HOSTED_FAMILY_ASSERTION_TEST_IDS_MISMATCH');
  if(contractSha256!==hostedEvidenceFamilyContractSha256(family)) throw new Error('HOSTED_FAMILY_ASSERTION_CONTRACT_MISMATCH');
  if(!Array.isArray(sourceArtifacts)||!sourceArtifacts.length) throw new Error('HOSTED_FAMILY_ASSERTION_SOURCE_REQUIRED');
  const sourceByPath=new Map(sourceArtifacts.map(source=>[source.path,source]));
  if(sourceByPath.size!==sourceArtifacts.length) throw new Error('HOSTED_FAMILY_ASSERTION_SOURCE_DUPLICATE');
  const requiredPaths=[...new Set(contract.assertions.map(item=>item.sourcePath))];
  if(canonical([...sourceByPath.keys()].sort())!==canonical([...requiredPaths].sort())) throw new Error('HOSTED_FAMILY_ASSERTION_SOURCE_OWNERSHIP_MISMATCH');
  for(const source of sourceArtifacts) if(!source?.path||!/^sha256:[a-f0-9]{64}$/.test(source.sha256??'')
    || !contract.assertions.some(item=>item.sourcePath===source.path&&item.sourceSha256===source.sha256)) throw new Error('HOSTED_FAMILY_ASSERTION_SOURCE_INVALID');
  const outcomes=new Map(assertions.map(item=>[item.assertionId,item]));
  if(outcomes.size!==assertions.length||outcomes.size!==contract.assertions.length) throw new Error('HOSTED_FAMILY_ASSERTION_REGISTERED_SET_MISMATCH');
  for(const owned of contract.assertions){
    const outcome=outcomes.get(owned.assertionId),source=sourceByPath.get(owned.sourcePath);
    if(!outcome||outcome.status!=='PASS'||outcome.sourceArtifactSha256!==source?.sha256
      || !/^sha256:[a-f0-9]{64}$/.test(outcome.observationSha256??'')) throw new Error('HOSTED_FAMILY_ASSERTION_REGISTERED_SET_MISMATCH');
  }
}

export function validateHostedEvidenceFamilyAssertion(value, expected) {
  if (value?.schemaVersion !== 'hosted-family-assertion-v2') throw new Error('HOSTED_FAMILY_ASSERTION_SCHEMA_INVALID');
  if (!HOSTED_EVIDENCE_FAMILIES.includes(value.family) || value.family !== expected.family) throw new Error('HOSTED_FAMILY_ASSERTION_FAMILY_MISMATCH');
  const derived = deriveHostedAssertionDisposition(value.assertionOutcomes);
  if (!Number.isInteger(Number(expected.producerRunAttempt)) || Number(expected.producerRunAttempt) < 1) throw new Error('HOSTED_FAMILY_ASSERTION_RUN_ATTEMPT_INVALID');
  if (value.result !== derived) throw new Error('HOSTED_FAMILY_ASSERTION_RESULT_NOT_DERIVED');
  if (derived !== 'passed') throw new Error('HOSTED_FAMILY_ASSERTION_NOT_PASSED');
  if (value.environment !== 'hosted_nonproduction_pilot') throw new Error('HOSTED_FAMILY_ASSERTION_ENVIRONMENT_MISMATCH');
  if(value.observationSchemaVersion!=='hosted-family-derived-observation-v1') throw new Error('HOSTED_FAMILY_ASSERTION_OBSERVATION_SCHEMA_INVALID');
  validateRegisteredProvenance({family:value.family,testIds:value.testIds,contractSha256:value.contractSha256,assertions:value.assertionOutcomes,sourceArtifacts:value.sourceArtifacts});
  for (const key of ['releaseSha','producerWorkflowPath','producerRunId','producerRunAttempt']) {
    if (String(value.execution?.[key]) !== String(expected[key])) throw new Error(`HOSTED_FAMILY_ASSERTION_${key.toUpperCase()}_MISMATCH`);
  }
  for (const key of ['organizationId','workspaceId','exerciseRunId']) {
    if (String(value.scope?.[key]) !== String(expected[key])) throw new Error(`HOSTED_FAMILY_ASSERTION_${key.toUpperCase()}_MISMATCH`);
  }
  if (String(value.deploymentTargetFingerprint) !== String(expected.deploymentFingerprint)) throw new Error('HOSTED_FAMILY_ASSERTION_DEPLOYMENT_MISMATCH');
  if (String(value.targetFingerprint) !== String(expected.targetFingerprint)) throw new Error('HOSTED_FAMILY_ASSERTION_TARGET_MISMATCH');
  const binding={family:value.family,releaseSha:value.execution.releaseSha,producerWorkflowPath:value.execution.producerWorkflowPath,
    producerRunId:value.execution.producerRunId,producerRunAttempt:Number(value.execution.producerRunAttempt),...value.scope,
    targetFingerprint:value.targetFingerprint,deploymentFingerprint:value.deploymentTargetFingerprint};
  if(canonical(value.observationBinding)!==canonical(binding)) throw new Error('HOSTED_FAMILY_ASSERTION_OBSERVATION_BINDING_MISMATCH');
  const observationSet=hostedEvidenceObservationSetSha256(binding,value.assertionOutcomes);
  if(value.observationSetSha256!==observationSet) throw new Error('HOSTED_FAMILY_ASSERTION_OBSERVATION_SET_MISMATCH');
  return value;
}

export async function validateAuthoritativeHostedFamilyState(values, expected, {readSource}={}) {
  if(!Array.isArray(values)||values.length!==HOSTED_EVIDENCE_FAMILIES.length) throw new Error('HOSTED_FAMILY_STATE_EXACTLY_FIVE_REQUIRED');
  const families=new Set(values.map(value=>value.family));
  if(families.size!==values.length||HOSTED_EVIDENCE_FAMILIES.some(family=>!families.has(family))) throw new Error('HOSTED_FAMILY_STATE_SET_MISMATCH');
  for(const value of values){
    validateHostedEvidenceFamilyAssertion(value,{family:value.family,...expected});
    if(value.disposition!=='executed_hosted_evidence') throw new Error('HOSTED_FAMILY_STATE_DISPOSITION_INVALID');
    if(typeof readSource==='function'){
      for(const source of value.sourceArtifacts){
        const bytes=await readSource(source.path);
        if(canonicalHostedSourceSha256(bytes)!==source.sha256) throw new Error('HOSTED_FAMILY_STATE_SOURCE_DIGEST_MISMATCH');
      }
    }
  }
  return [...values].sort((a,b)=>a.family.localeCompare(b.family));
}

export function createHostedEvidenceFamilyAttestation(input, now = new Date()) {
  for (const key of required) if (input[key] === undefined || input[key] === null || input[key] === '') throw new Error(`HOSTED_ATTESTATION_${key.toUpperCase()}_REQUIRED`);
  if (!HOSTED_EVIDENCE_FAMILIES.includes(input.family)) throw new Error('HOSTED_ATTESTATION_FAMILY_INVALID');
  if(input.environment!=='hosted_nonproduction_pilot'||input.hostedTarget!=='hosted_nonproduction_pilot') throw new Error('HOSTED_ATTESTATION_ENVIRONMENT_INVALID');
  if (!Number.isInteger(Number(input.producerRunAttempt)) || Number(input.producerRunAttempt) < 1) throw new Error('HOSTED_ATTESTATION_RUN_ATTEMPT_INVALID');
  const derivedDisposition = deriveHostedAssertionDisposition(input.assertions);
  if (input.disposition !== derivedDisposition) throw new Error('HOSTED_ATTESTATION_DISPOSITION_NOT_DERIVED');
  if (derivedDisposition !== 'passed') throw new Error('HOSTED_ATTESTATION_DISPOSITION_INVALID');
  if (!Array.isArray(input.assertions) || !input.assertions.length || !Array.isArray(input.sourceArtifacts) || !input.sourceArtifacts.length) throw new Error('HOSTED_ATTESTATION_PROVENANCE_REQUIRED');
  validateRegisteredProvenance(input);
  const {evidenceSha256: _evidence, attestationSha256: _attestation, ...unsigned} = input;
  const provenance = {assertions: unsigned.assertions, sourceArtifacts: unsigned.sourceArtifacts};
  const body = {...unsigned, observedAt: new Date(unsigned.observedAt ?? now).toISOString(), evidenceSha256: sha256(canonical(provenance))};
  return {...body, attestationSha256: sha256(canonical(body))};
}

export function validateHostedEvidenceFamilyAttestation(value, expected, {now = new Date(), maxAgeMs = 6 * 60 * 60 * 1000} = {}) {
  const rebuilt = createHostedEvidenceFamilyAttestation(value);
  if (rebuilt.evidenceSha256 !== value.evidenceSha256 || rebuilt.attestationSha256 !== value.attestationSha256) throw new Error('HOSTED_ATTESTATION_DIGEST_MISMATCH');
  for (const key of ['organizationId','workspaceId','exerciseRunId','releaseSha','producerWorkflowPath','producerRunId','producerRunAttempt','targetFingerprint','deploymentFingerprint','hostedTarget']) {
    if (String(value[key]) !== String(expected[key])) throw new Error(`HOSTED_ATTESTATION_IDENTITY_${key.toUpperCase()}_MISMATCH`);
  }
  const age = now.getTime() - Date.parse(value.observedAt);
  if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) throw new Error('HOSTED_ATTESTATION_STALE');
  return value;
}

export function composeHostedEvidenceFamilyAttestations(values, expected, options) {
  if (!Array.isArray(values) || values.length !== HOSTED_EVIDENCE_FAMILIES.length) throw new Error('HOSTED_ATTESTATION_EXACTLY_FIVE_REQUIRED');
  const validated = values.map(value => validateHostedEvidenceFamilyAttestation(value, expected, options));
  const families = validated.map(value => value.family);
  if (new Set(families).size !== families.length) throw new Error('HOSTED_ATTESTATION_DUPLICATE_FAMILY');
  if (HOSTED_EVIDENCE_FAMILIES.some(family => !families.includes(family))) throw new Error('HOSTED_ATTESTATION_FAMILY_SET_MISMATCH');
  return validated.sort((a,b) => a.family.localeCompare(b.family));
}
