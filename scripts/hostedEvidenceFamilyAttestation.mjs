import {createHash} from 'node:crypto';

export const HOSTED_EVIDENCE_FAMILIES = Object.freeze([
  'tenant-adversarial',
  'provider-simulation-zero-egress',
  'canonical-journey',
  'backup-restore',
  'recovery-rollback',
]);

const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const normalize = value => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])])) : value;
const canonical = value => JSON.stringify(normalize(value));
const required = ['organizationId','workspaceId','exerciseRunId','releaseSha','producerWorkflowPath','producerRunId','producerRunAttempt','targetFingerprint','deploymentFingerprint','hostedTarget','family','disposition','assertions','sourceArtifacts','observedAt'];
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

export function validateHostedEvidenceFamilyAssertion(value, expected) {
  if (value?.schemaVersion !== 'hosted-family-assertion-v2') throw new Error('HOSTED_FAMILY_ASSERTION_SCHEMA_INVALID');
  if (!HOSTED_EVIDENCE_FAMILIES.includes(value.family) || value.family !== expected.family) throw new Error('HOSTED_FAMILY_ASSERTION_FAMILY_MISMATCH');
  const derived = deriveHostedAssertionDisposition(value.assertionOutcomes);
  if (!Number.isInteger(Number(expected.producerRunAttempt)) || Number(expected.producerRunAttempt) < 1) throw new Error('HOSTED_FAMILY_ASSERTION_RUN_ATTEMPT_INVALID');
  if (value.result !== derived) throw new Error('HOSTED_FAMILY_ASSERTION_RESULT_NOT_DERIVED');
  if (derived !== 'passed') throw new Error('HOSTED_FAMILY_ASSERTION_NOT_PASSED');
  if (!Array.isArray(value.testIds) || !value.testIds.length || new Set(value.testIds).size !== value.testIds.length) throw new Error('HOSTED_FAMILY_ASSERTION_TEST_IDS_INVALID');
  if (!Array.isArray(value.sourceArtifacts) || !value.sourceArtifacts.length) throw new Error('HOSTED_FAMILY_ASSERTION_SOURCE_REQUIRED');
  for (const source of value.sourceArtifacts) {
    if (!source?.path || !/^sha256:[a-f0-9]{64}$/.test(source.sha256 ?? '')) throw new Error('HOSTED_FAMILY_ASSERTION_SOURCE_INVALID');
  }
  for (const key of ['releaseSha','producerWorkflowPath','producerRunId','producerRunAttempt']) {
    if (String(value.execution?.[key]) !== String(expected[key])) throw new Error(`HOSTED_FAMILY_ASSERTION_${key.toUpperCase()}_MISMATCH`);
  }
  for (const key of ['organizationId','workspaceId','exerciseRunId']) {
    if (String(value.scope?.[key]) !== String(expected[key])) throw new Error(`HOSTED_FAMILY_ASSERTION_${key.toUpperCase()}_MISMATCH`);
  }
  if (String(value.deploymentTargetFingerprint) !== String(expected.deploymentFingerprint)) throw new Error('HOSTED_FAMILY_ASSERTION_DEPLOYMENT_MISMATCH');
  return value;
}

export function createHostedEvidenceFamilyAttestation(input, now = new Date()) {
  for (const key of required) if (input[key] === undefined || input[key] === null || input[key] === '') throw new Error(`HOSTED_ATTESTATION_${key.toUpperCase()}_REQUIRED`);
  if (!HOSTED_EVIDENCE_FAMILIES.includes(input.family)) throw new Error('HOSTED_ATTESTATION_FAMILY_INVALID');
  if (!Number.isInteger(Number(input.producerRunAttempt)) || Number(input.producerRunAttempt) < 1) throw new Error('HOSTED_ATTESTATION_RUN_ATTEMPT_INVALID');
  const derivedDisposition = deriveHostedAssertionDisposition(input.assertions);
  if (input.disposition !== derivedDisposition) throw new Error('HOSTED_ATTESTATION_DISPOSITION_NOT_DERIVED');
  if (derivedDisposition !== 'passed') throw new Error('HOSTED_ATTESTATION_DISPOSITION_INVALID');
  if (!Array.isArray(input.assertions) || !input.assertions.length || !Array.isArray(input.sourceArtifacts) || !input.sourceArtifacts.length) throw new Error('HOSTED_ATTESTATION_PROVENANCE_REQUIRED');
  for (const source of input.sourceArtifacts) if (!source?.path || !/^sha256:[a-f0-9]{64}$/.test(source.sha256 ?? '')) throw new Error('HOSTED_ATTESTATION_SOURCE_INVALID');
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
