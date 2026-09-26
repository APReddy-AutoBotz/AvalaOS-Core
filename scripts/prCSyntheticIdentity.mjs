import { createHash } from 'node:crypto';

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SAFE_LABEL = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const canonicalJson = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const digest = value => `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
const validate = (exerciseDigest, personaKey, id) => {
  if (!DIGEST.test(exerciseDigest ?? '') || !SAFE_LABEL.test(personaKey ?? '') || !UUID.test(id ?? '')) throw new Error('PR_C_SYNTHETIC_APPLICATION_IDENTITY_REJECTED');
};

export const deriveSyntheticApplicationActorDigest = ({ exerciseDigest, personaKey, authUserId }) => {
  validate(exerciseDigest, personaKey, authUserId);
  return digest({ exerciseDigest, personaKey, authUserId });
};

export const deriveSyntheticApplicationSessionDigest = ({ exerciseDigest, personaKey, sessionId }) => {
  validate(exerciseDigest, personaKey, sessionId);
  return digest({ exerciseDigest, personaKey, sessionId });
};
