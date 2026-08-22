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

export function createHostedEvidenceFamilyAttestation(input, now = new Date()) {
  for (const key of required) if (input[key] === undefined || input[key] === null || input[key] === '') throw new Error(`HOSTED_ATTESTATION_${key.toUpperCase()}_REQUIRED`);
  if (!HOSTED_EVIDENCE_FAMILIES.includes(input.family)) throw new Error('HOSTED_ATTESTATION_FAMILY_INVALID');
  if (input.disposition !== 'passed') throw new Error('HOSTED_ATTESTATION_DISPOSITION_INVALID');
  if (!Array.isArray(input.assertions) || !input.assertions.length || !Array.isArray(input.sourceArtifacts) || !input.sourceArtifacts.length) throw new Error('HOSTED_ATTESTATION_PROVENANCE_REQUIRED');
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
