import { pathToFileURL } from 'node:url';

export const CONTROLLED_HUMAN_SECRET_SENTINEL = 'PR264_ENVIRONMENT_SECRET_REQUIRED';

export const CONTROLLED_HUMAN_PHASE_SECRETS = Object.freeze({
  edge: Object.freeze([
    'PR_C_CONTROLLED_HUMAN_DATABASE_URL',
    'PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY',
    'PR_C_CONTROLLED_HUMAN_EXERCISE_ID',
    'PR_C_CONTROLLED_HUMAN_SUPABASE_ACCESS_TOKEN',
    'PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF',
    'PR_C_CONTROLLED_HUMAN_SUPABASE_URL',
  ]),
  prepare: Object.freeze([
    'PR_C_CONTROLLED_HUMAN_DATABASE_URL',
    'PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY',
    'PR_C_CONTROLLED_HUMAN_EXERCISE_ID',
    'PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_JSON',
    'PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF',
    'PR_C_CONTROLLED_HUMAN_SUPABASE_SERVICE_ROLE_KEY',
    'PR_C_CONTROLLED_HUMAN_SUPABASE_URL',
  ]),
  quiesce: Object.freeze([
    'PR_C_CONTROLLED_HUMAN_DATABASE_URL',
    'PR_C_CONTROLLED_HUMAN_EXERCISE_ID',
    'PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF',
    'PR_C_CONTROLLED_HUMAN_SUPABASE_URL',
  ]),
  checkpoint: Object.freeze([
    'PR_C_CONTROLLED_HUMAN_DATABASE_URL',
    'PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY',
    'PR_C_CONTROLLED_HUMAN_EXERCISE_ID',
  ]),
  verify: Object.freeze([
    'PR_C_CONTROLLED_HUMAN_DATABASE_URL',
    'PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY',
    'PR_C_CONTROLLED_HUMAN_EXERCISE_ID',
    'PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF',
    'PR_C_CONTROLLED_HUMAN_SUPABASE_SERVICE_ROLE_KEY',
    'PR_C_CONTROLLED_HUMAN_SUPABASE_URL',
  ]),
  recover: Object.freeze([
    'PR_C_CONTROLLED_HUMAN_DATABASE_URL',
    'PR_C_CONTROLLED_HUMAN_EXERCISE_ID',
    'PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF',
    'PR_C_CONTROLLED_HUMAN_SUPABASE_SERVICE_ROLE_KEY',
    'PR_C_CONTROLLED_HUMAN_SUPABASE_URL',
  ]),
});

const reject = (phase, name = 'unknown-phase') => {
  throw new Error(`PR264_CONTROLLED_HUMAN_WORKFLOW_SECRET_REJECTED:${phase}:${name}`);
};

export const validateControlledHumanWorkflowSecrets = (phase, values, { exact = false } = {}) => {
  const names = CONTROLLED_HUMAN_PHASE_SECRETS[phase];
  if (!names) reject('unknown-phase');
  if (!values || typeof values !== 'object' || Array.isArray(values)) reject(phase, 'invalid-input');
  if (exact) {
    const actual = Object.keys(values).sort();
    const expected = [...names].sort();
    if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
      reject(phase, 'unexpected-name-set');
    }
  }
  for (const name of names) {
    const value = values[name];
    if (typeof value !== 'string' || value.trim() === '' || value.trim() === CONTROLLED_HUMAN_SECRET_SENTINEL) {
      reject(phase, name);
    }
  }
  return Object.freeze({ status: 'present', phase });
};

const main = () => {
  if (process.argv.length !== 3) reject('unknown-phase');
  const phase = process.argv[2];
  const names = CONTROLLED_HUMAN_PHASE_SECRETS[phase];
  if (!names) reject('unknown-phase');
  const values = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const result = validateControlledHumanWorkflowSecrets(phase, values, { exact: true });
  process.stdout.write(`${JSON.stringify({ status: 'PR264_CONTROLLED_HUMAN_WORKFLOW_SECRETS_PRESENT', phase: result.phase })}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error && /^PR264_CONTROLLED_HUMAN_WORKFLOW_SECRET_REJECTED:[a-z-]+:[A-Z0-9_-]+$/u.test(error.message)
      ? error.message
      : 'PR264_CONTROLLED_HUMAN_WORKFLOW_SECRET_REJECTED:unknown-phase:invalid-input';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
