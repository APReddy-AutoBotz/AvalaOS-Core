import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  canonicalJson,
  deriveControlledHumanExerciseBinding,
  loadFixture,
  sha256,
  validateSupabaseTargetTuple,
} from './prCControlledHumanEnvironment.mjs';
import {
  MIGRATION_VERSION,
  PRIOR_MIGRATION_VERSION,
  PostgresEnvironmentMigrationAdapter,
  assertMigrationInventory,
  loadMigration,
} from './prCControlledHumanEnvironmentMigration.mjs';

export const BOOTSTRAP_SCHEMA_VERSION = 'pr-c-controlled-human-bootstrap-bindings-1';
const SHA = /^[0-9a-f]{40}$/u;
const FORBIDDEN_OUTPUT = /(?:postgres(?:ql)?:\/\/|password|service[_-]?role|database[_-]?(?:url|uri)|access[_-]?token|refresh[_-]?token|project[_-]?ref|exercise[_-]?id|[a-z0-9]{20}[.]supabase[.]co)/iu;

function fail(code) { throw new Error(code); }

const relevantUntracked = value => value.split(/\r?\n/u).filter(Boolean).filter(path => {
  const normalized = path.replaceAll('\\', '/');
  return normalized !== '.agent' && !normalized.startsWith('.agent/')
    && normalized !== 'artifacts' && !normalized.startsWith('artifacts/');
});

function validateBootstrapSupabaseTuple(env) {
  const apiUrl = env.PR_C_CONTROLLED_HUMAN_SUPABASE_URL;
  let publicOrigin;
  try { publicOrigin = new URL(apiUrl).origin; } catch { fail('PR_C_CONTROLLED_HUMAN_SUPABASE_TARGET_MISMATCH'); }
  const publicTargetDigest = sha256(`pr-c-controlled-human-public-target\0${publicOrigin}`);
  validateSupabaseTargetTuple(
    env.PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF,
    apiUrl,
    env.PR_C_CONTROLLED_HUMAN_DATABASE_URL,
    publicTargetDigest,
  );
  return publicTargetDigest;
}

function validateBootstrapSource(env, migration, checkout) {
  const releaseSha = env.PR_C_CONTROLLED_HUMAN_RELEASE_SHA;
  const reviewHeadSha = env.PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA;
  if (!SHA.test(releaseSha ?? '') || reviewHeadSha !== releaseSha || checkout?.head !== releaseSha) fail('PR_C_CONTROLLED_HUMAN_BOOTSTRAP_SHA_REJECTED');
  if (checkout.dirty) fail('PR_C_CONTROLLED_HUMAN_BOOTSTRAP_DIRTY_CHECKOUT');
  if (!migration || migration.digest !== sha256(migration.sql) || MIGRATION_VERSION !== '20260904120000') fail('PR_C_CONTROLLED_HUMAN_BOOTSTRAP_MIGRATION_REJECTED');
  return Object.freeze({ releaseSha, reviewHeadSha });
}

export function bootstrapCheckoutIdentity(cwd = process.cwd()) {
  // Explicitly pipe stderr: execFileSync otherwise relays failed child output
  // before the CLI can replace it with a sanitized diagnostic.
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const head = git(['rev-parse', 'HEAD']).trim();
  const tracked = git(['diff', '--name-only', 'HEAD', '--']).trim();
  const untracked = relevantUntracked(git(['ls-files', '--others', '--exclude-standard']));
  return Object.freeze({ head, dirty: [...tracked.split(/\r?\n/u).filter(Boolean), ...untracked].sort().join('\n') });
}

export function buildControlledHumanBootstrapBindings({ env, fixtureState, migration, inventory, checkout }) {
  const { releaseSha, reviewHeadSha } = validateBootstrapSource(env, migration, checkout);

  const publicTargetDigest = validateBootstrapSupabaseTuple(env);

  const targetFingerprint = inventory?.actualTargetFingerprint;
  const values = {
    environmentClass: env.PR_C_CONTROLLED_HUMAN_ENVIRONMENT_CLASS,
    prNumber: Number(env.PR_C_CONTROLLED_HUMAN_PR_NUMBER),
    releaseSha,
    reviewHeadSha,
    exerciseId: env.PR_C_CONTROLLED_HUMAN_EXERCISE_ID,
    targetFingerprint,
    publicTargetDigest,
  };
  const exercise = deriveControlledHumanExerciseBinding(values, fixtureState);
  const inventoryState = assertMigrationInventory(inventory, { ...values, ...exercise });
  if (inventoryState !== 'pending') fail('PR_C_CONTROLLED_HUMAN_BOOTSTRAP_PRIOR_TIP_REQUIRED');
  if (env.PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT !== undefined && env.PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT !== targetFingerprint) fail('PR_C_CONTROLLED_HUMAN_BOOTSTRAP_TARGET_REJECTED');
  if (env.PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST !== undefined && env.PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST !== publicTargetDigest) fail('PR_C_CONTROLLED_HUMAN_BOOTSTRAP_PUBLIC_TARGET_REJECTED');
  if (env.PR_C_CONTROLLED_HUMAN_EXPECTED_EXERCISE_DIGEST !== undefined && env.PR_C_CONTROLLED_HUMAN_EXPECTED_EXERCISE_DIGEST !== exercise.exerciseDigest) fail('PR_C_CONTROLLED_HUMAN_BOOTSTRAP_EXERCISE_REJECTED');

  const githubEnvironmentVariables = {
    PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST: exercise.exerciseDigest,
    PR_C_CONTROLLED_HUMAN_PUBLIC_TARGET_DIGEST: publicTargetDigest,
    PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT: targetFingerprint,
  };
  const netlifyBranchVariables = {
    PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST: exercise.exerciseDigest,
    PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST: publicTargetDigest,
    PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT: targetFingerprint,
  };
  const unsigned = {
    schemaVersion: BOOTSTRAP_SCHEMA_VERSION,
    status: 'bindings_derived',
    environmentClass: values.environmentClass,
    prNumber: values.prNumber,
    exactHead: releaseSha,
    reviewHeadSha,
    priorMigrationTip: PRIOR_MIGRATION_VERSION,
    migrationTip: MIGRATION_VERSION,
    migrationDigest: migration.digest,
    targetFingerprint,
    publicTargetDigest,
    exerciseDigest: exercise.exerciseDigest,
    personaManifestDigest: exercise.personaManifestDigest,
    fixtureManifestDigest: exercise.fixtureManifestDigest,
    githubEnvironmentVariables,
    netlifyBranchVariables,
    productionAuthorized: false,
    customerDataAuthorized: false,
    realProviderCallsAuthorized: false,
  };
  const result = Object.freeze({ ...unsigned, bootstrapDigest: sha256(unsigned) });
  if (FORBIDDEN_OUTPUT.test(canonicalJson(result))) fail('PR_C_CONTROLLED_HUMAN_BOOTSTRAP_OUTPUT_REJECTED');
  return result;
}

export async function deriveControlledHumanBootstrap(env = process.env, options = {}) {
  const fixtureState = options.fixtureState ?? await loadFixture();
  const migration = options.migration ?? await loadMigration();
  const checkout = options.checkout ?? bootstrapCheckoutIdentity();
  validateBootstrapSource(env, migration, checkout);
  validateBootstrapSupabaseTuple(env);
  if (options.inventory) return buildControlledHumanBootstrapBindings({ env, fixtureState, migration, inventory: options.inventory, checkout });
  const adapter = options.adapter ?? new PostgresEnvironmentMigrationAdapter(env.PR_C_CONTROLLED_HUMAN_DATABASE_URL, migration.sql);
  await adapter.connect();
  try {
    const inventory = await adapter.inspect();
    return buildControlledHumanBootstrapBindings({ env, fixtureState, migration, inventory, checkout });
  } finally {
    await adapter.close();
  }
}

export async function runControlledHumanBootstrapCli(argv = process.argv.slice(2), env = process.env, options = {}, io = process) {
  if (!(argv.length === 0 || (argv.length === 2 && argv[0] === '--output' && argv[1]))) {
    io.stderr.write('usage: derivePrCControlledHumanBootstrap.mjs [--output path]\n');
    return 1;
  }
  try {
    const result = await deriveControlledHumanBootstrap(env, options);
    if (argv.length === 2) await writeFile(argv[1], `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    io.stdout.write(`${JSON.stringify({ status: result.status, exactHead: result.exactHead, bootstrapDigest: result.bootstrapDigest })}\n`);
    return 0;
  } catch {
    // DNS, TLS, PostgreSQL, Git and filesystem errors can carry target or
    // credential material. Never relay their text, stack, cause or properties.
    io.stderr.write('PR_C_CONTROLLED_HUMAN_BOOTSTRAP_FAILED\n');
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runControlledHumanBootstrapCli();
}
