import { pathToFileURL } from 'node:url';

export const CONTROLLED_HUMAN_SECRET_SENTINEL = 'PR264_ENVIRONMENT_SECRET_REQUIRED';

export const CONTROLLED_HUMAN_PHASE_SECRETS = Object.freeze({
  preflight: Object.freeze([
    'PR_C_CONTROLLED_HUMAN_DATABASE_URL',
    'PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY',
    'PR_C_CONTROLLED_HUMAN_EXERCISE_ID',
    'PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_JSON',
    'PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF',
    'PR_C_CONTROLLED_HUMAN_SUPABASE_SERVICE_ROLE_KEY',
    'PR_C_CONTROLLED_HUMAN_SUPABASE_URL',
  ]),
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

const reject = (phase, name = 'invalid-input', reason = 'invalid-input') => {
  throw new Error(`PR264_CONTROLLED_HUMAN_WORKFLOW_SECRET_REJECTED:${phase}:${name}:${reason}`);
};

export const validateControlledHumanWorkflowSecrets = (phase, values, { exact = false } = {}) => {
  const names = Object.hasOwn(CONTROLLED_HUMAN_PHASE_SECRETS, phase) ? CONTROLLED_HUMAN_PHASE_SECRETS[phase] : undefined;
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
    if (value === undefined || value === null) reject(phase, name, 'absent');
    if (typeof value !== 'string') reject(phase, name, 'invalid-type');
    if (value.trim() === '') reject(phase, name, 'blank');
    if (value.trim() === CONTROLLED_HUMAN_SECRET_SENTINEL) reject(phase, name, 'sentinel');
  }
  return Object.freeze({ status: 'present', phase });
};

const main = () => {
  if (process.argv.length !== 3) reject('unknown-phase');
  const phase = process.argv[2];
  const names = Object.hasOwn(CONTROLLED_HUMAN_PHASE_SECRETS, phase) ? CONTROLLED_HUMAN_PHASE_SECRETS[phase] : undefined;
  if (!names) reject('unknown-phase');
  const values = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const result = validateControlledHumanWorkflowSecrets(phase, values, { exact: true });
  process.stdout.write(`${JSON.stringify({ status: 'PR264_CONTROLLED_HUMAN_WORKFLOW_SECRETS_PRESENT', phase: result.phase })}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error && /^PR264_CONTROLLED_HUMAN_WORKFLOW_SECRET_REJECTED:(?:preflight|edge|prepare|quiesce|checkpoint|verify|recover|unknown-phase):(?:PR_C_CONTROLLED_HUMAN_[A-Z_]+|invalid-input|unexpected-name-set):(?:absent|blank|sentinel|invalid-type|invalid-input)$/u.test(error.message)
      ? error.message
      : 'PR264_CONTROLLED_HUMAN_WORKFLOW_SECRET_REJECTED:unknown-phase:invalid-input:invalid-input';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
