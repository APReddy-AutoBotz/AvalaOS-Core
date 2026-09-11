import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { deriveControlledHumanExerciseBinding, loadFixture, sha256 } from './prCControlledHumanEnvironment.mjs';
import { PREFLIGHT_OUTPUT } from './prCControlledHumanCredentialPreflight.mjs';
import { collectChangedPrCFiles } from './transcriptFlowPrCEvidenceScope.mjs';

const BRANCH = 'controller/governed-delivery-monitor-pr-c-20260831';
const REPOSITORY = 'APReddy-AutoBotz/AvalaOS-Core';
const WORKFLOW = '.github/workflows/transcript-flow-pr-c.yml';
export const PR_C_INTENDED_REMOVED_WORKFLOWS = Object.freeze([
  '.github/workflows/pr264-controlled-human-checkpoint.yml',
  '.github/workflows/pr264-controlled-human-edge-deploy.yml',
  '.github/workflows/pr264-controlled-human-prepare.yml',
  '.github/workflows/pr264-controlled-human-quiesce.yml',
  '.github/workflows/pr264-controlled-human-verify.yml',
]);
const normalize = value => value.replaceAll('\\', '/');
const splitLines = value => value.split(/\r?\n/gu).filter(Boolean);
const git = (cwd, args, env, options = {}) => {
  try {
    return execFileSync('git', args, {
      cwd,
      env: { ...env },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    }).trim();
  } catch (error) {
    const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/u.test(error.code) ? error.code : 'UNKNOWN';
    const status = Number.isInteger(error?.status) ? String(error.status) : 'NO_STATUS';
    const operation = typeof args[0] === 'string' && /^[a-z-]+$/u.test(args[0]) ? args[0] : 'unknown';
    throw new Error(`PR_C_PREFLIGHT_FIXTURE_GIT_REJECTED:${operation}:${code}:${status}`);
  }
};

const infrastructureEnvironment = () => Object.fromEntries([
  'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'TMP', 'TEMP', 'TMPDIR',
].filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]));

const fixtureGitEnvironment = (emptyGitConfigPath, emptyHooksPath, safeDirectories) => {
  const entries = [
    ['commit.gpgsign', 'false'],
    ['core.hooksPath', emptyHooksPath],
    ...safeDirectories.map(directory => ['safe.directory', path.resolve(directory)]),
  ];
  return {
    ...infrastructureEnvironment(),
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: emptyGitConfigPath,
    GIT_CONFIG_COUNT: String(entries.length),
    ...Object.fromEntries(entries.flatMap(([key, value], index) => [
      [`GIT_CONFIG_KEY_${index}`, key], [`GIT_CONFIG_VALUE_${index}`, value],
    ])),
  };
};

const assertInside = (root, target) => {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('PR_C_PREFLIGHT_FIXTURE_PATH_REJECTED');
};

const candidateFileDigest = async (root, relative) => {
  const target = path.resolve(root, relative);
  assertInside(root, target);
  const stat = await lstat(target).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (stat === null) return null;
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('PR_C_PREFLIGHT_FIXTURE_SOURCE_REJECTED');
  return createHash('sha256').update(await readFile(target)).digest('hex');
};

async function copyCandidateWorktree(sourceRoot, repositoryRoot, gitEnvironment) {
  const excluded = relative => relative.startsWith('.agent/') || relative.startsWith('output/')
    || relative.startsWith('tools/') || relative.startsWith('docs/marketing/')
    || relative === 'scripts/testPilotOperationsRecoveryPostgres.mjs'
    || relative === '.env' || relative.startsWith('.env.') || relative.split('/').some(part => part === '.env' || part.startsWith('.env.'));
  const governed = new Set([
    ...collectChangedPrCFiles(sourceRoot).filter(relative => !excluded(relative)),
    ...PR_C_INTENDED_REMOVED_WORKFLOWS,
  ]);
  for (const relative of PR_C_INTENDED_REMOVED_WORKFLOWS) {
    if (await candidateFileDigest(sourceRoot, relative) !== null) throw new Error('PR_C_PREFLIGHT_FIXTURE_INTENDED_DELETION_REJECTED');
  }
  for (const normalized of [...governed].sort()) {
    const sourceDigest = await candidateFileDigest(sourceRoot, normalized);
    const destination = path.resolve(repositoryRoot, normalized);
    assertInside(repositoryRoot, destination);
    if (sourceDigest === null) {
      await rm(destination, { force: true });
      continue;
    }
    const source = path.resolve(sourceRoot, normalized);
    assertInside(sourceRoot, source);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
    if (sourceDigest !== await candidateFileDigest(repositoryRoot, normalized)) {
      throw new Error('PR_C_PREFLIGHT_FIXTURE_SOURCE_HASH_REJECTED');
    }
  }
  const changed = [];
  for (const line of splitLines(git(repositoryRoot, ['diff', '--no-renames', '--name-status', 'HEAD', '--'], gitEnvironment))) {
    const [status, relative] = line.split('\t');
    if (!relative || !/^[ACDMRTUXB][0-9]*$/u.test(status)) throw new Error('PR_C_PREFLIGHT_FIXTURE_STATUS_REJECTED');
    const normalized = normalize(relative);
    if (!governed.has(normalized)) throw new Error('PR_C_PREFLIGHT_FIXTURE_OVERLAY_SCOPE_REJECTED');
    changed.push(normalized);
  }
  for (const relative of splitLines(git(repositoryRoot, ['ls-files', '--others', '--exclude-standard'], gitEnvironment))) {
    const normalized = normalize(relative);
    if (!governed.has(normalized)) throw new Error('PR_C_PREFLIGHT_FIXTURE_OVERLAY_SCOPE_REJECTED');
    changed.push(normalized);
  }
  for (const relative of governed) {
    if (await candidateFileDigest(sourceRoot, relative) !== await candidateFileDigest(repositoryRoot, relative)) {
      throw new Error(`PR_C_PREFLIGHT_FIXTURE_GOVERNED_INVENTORY_REJECTED:${relative}`);
    }
  }
  return [...new Set(changed)].sort();
}

function commitCandidate(repositoryRoot, changed, { nonAncestor }, gitEnvironment) {
  git(repositoryRoot, ['add', '--all'], gitEnvironment);
  const staged = splitLines(git(repositoryRoot, ['diff', '--cached', '--name-only'], gitEnvironment)).map(normalize).sort();
  const status = splitLines(git(repositoryRoot, ['status', '--short', '--untracked-files=all'], gitEnvironment));
  if (JSON.stringify(staged) !== JSON.stringify(changed) || status.length !== staged.length
    || status.some(line => line.startsWith('??') || line[1] !== ' ')) {
    throw new Error('PR_C_PREFLIGHT_FIXTURE_STAGED_SET_REJECTED');
  }
  const author = {
    ...gitEnvironment,
    GIT_AUTHOR_NAME: 'PR C fixture', GIT_AUTHOR_EMAIL: 'pr-c-fixture@example.invalid',
    GIT_COMMITTER_NAME: 'PR C fixture', GIT_COMMITTER_EMAIL: 'pr-c-fixture@example.invalid',
  };
  if (!nonAncestor && changed.length === 0) return;
  if (nonAncestor) {
    const tree = git(repositoryRoot, ['write-tree'], gitEnvironment);
    const commit = git(repositoryRoot, ['commit-tree', tree, '-m', 'isolated nonancestor fixture'], author);
    git(repositoryRoot, ['update-ref', '--no-deref', 'HEAD', commit], gitEnvironment);
  } else {
    git(repositoryRoot, ['commit', '--quiet', '-m', 'isolated candidate fixture'], author);
  }
  if (git(repositoryRoot, ['status', '--short', '--untracked-files=all'], gitEnvironment) !== '') throw new Error('PR_C_PREFLIGHT_FIXTURE_COMMIT_REJECTED');
}

export async function createCredentialPreflightEntryFixture(sourceRoot = process.cwd(), { nonAncestor = false, committedSourceOnly = false } = {}) {
  const sourceReal = await realpath(sourceRoot);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'pr-c-credential-preflight-entry-'));
  const repositoryRoot = path.join(temporaryRoot, 'repository');
  try {
    const controlRoot = path.join(temporaryRoot, 'control');
    const emptyHooksPath = path.join(controlRoot, 'hooks');
    const emptyGitConfigPath = path.join(controlRoot, 'empty.gitconfig');
    await mkdir(emptyHooksPath, { recursive: true });
    await writeFile(emptyGitConfigPath, '', { flag: 'wx', mode: 0o600 });
    const gitEnvironment = fixtureGitEnvironment(emptyGitConfigPath, emptyHooksPath, [sourceReal, repositoryRoot]);
    const sourceHead = git(sourceReal, ['rev-parse', '--verify', 'HEAD'], gitEnvironment);
    const sourceHeadFiles = splitLines(git(sourceReal, ['ls-tree', '-r', '--name-only', 'HEAD'], gitEnvironment)).map(normalize);
    execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', sourceReal, repositoryRoot], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...gitEnvironment },
    });
    git(repositoryRoot, ['config', 'core.autocrlf', 'false'], gitEnvironment);
    git(repositoryRoot, ['config', 'core.eol', 'lf'], gitEnvironment);
    git(repositoryRoot, ['checkout', '--quiet', '--detach', 'HEAD'], gitEnvironment);
    const changed = committedSourceOnly ? [] : await copyCandidateWorktree(sourceReal, repositoryRoot, gitEnvironment);
    commitCandidate(repositoryRoot, changed, { nonAncestor }, gitEnvironment);
    const head = git(repositoryRoot, ['rev-parse', 'HEAD'], gitEnvironment);
    return Object.freeze({ sourceRoot: sourceReal, sourceHead, sourceHeadFiles, temporaryRoot, repositoryRoot, controlRoot, head, changed, gitEnvironment });
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function removeCredentialPreflightEntryFixture(fixture) {
  const temporaryReal = await realpath(fixture.temporaryRoot);
  const osTemporaryReal = await realpath(os.tmpdir());
  assertInside(osTemporaryReal, temporaryReal);
  if (temporaryReal === fixture.sourceRoot || normalize(temporaryReal).includes('/node_modules/')) {
    throw new Error('PR_C_PREFLIGHT_FIXTURE_CLEANUP_REJECTED');
  }
  try {
    const nodeModules = path.join(fixture.repositoryRoot, 'node_modules');
    const nodeModulesStat = await lstat(nodeModules).catch(() => null);
    if (nodeModulesStat) throw new Error('PR_C_PREFLIGHT_FIXTURE_NODE_MODULES_REJECTED');
  } finally {
    await rm(temporaryReal, { recursive: true, force: true });
  }
}

export async function buildCredentialPreflightEntryEnvironment(fixture, overrides = {}) {
  const ref = 'syntheticfixtureonly';
  const origin = `https://${ref}.supabase.co`;
  const databaseRole = `postgres.${ref}`;
  const targetFingerprint = `sha256:${createHash('sha256').update(`fixture-system\0postgres\0${databaseRole}`).digest('hex')}`;
  const publicTargetDigest = sha256(`pr-c-controlled-human-public-target\0${origin}`);
  const exerciseId = '22222222-2222-4222-a222-222222222222';
  const fixtureState = await loadFixture(path.join(fixture.repositoryRoot, 'testing/process-lifecycle/fixtures/delivery-monitor-pr-c/controlled-human-environment.json'));
  const exercise = deriveControlledHumanExerciseBinding({
    environmentClass: 'hosted_nonproduction_pilot', prNumber: 264,
    releaseSha: fixture.head, reviewHeadSha: fixture.head, exerciseId,
    targetFingerprint, publicTargetDigest,
  }, fixtureState);
  const eventPath = path.join(fixture.controlRoot, 'event.json');
  const tracePath = path.join(fixture.controlRoot, 'transport.trace');
  const event = { action: 'labeled', label: { name: 'pr264-controlled-human-credentials-preflight' }, sender: { login: 'APReddy-AutoBotz' }, pull_request: {
    number: 264, state: 'open', head: { sha: fixture.head, ref: BRANCH, repo: { full_name: REPOSITORY } },
    base: { ref: 'main', repo: { full_name: REPOSITORY } },
  } };
  await writeFile(eventPath, JSON.stringify(event));
  const passwords = Object.fromEntries(fixtureState.personas.map((persona, index) => [persona.key, `fixture-only-${index}-${persona.key}-password`]));
  return {
    ...fixture.gitEnvironment,
    GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'pull_request', GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_REF: 'refs/pull/264/merge', GITHUB_HEAD_REF: BRANCH, GITHUB_BASE_REF: 'main',
    GITHUB_WORKFLOW_REF: `${REPOSITORY}/${WORKFLOW}@refs/pull/264/merge`, GITHUB_JOB: 'controlled_human_credentials_preflight',
    GITHUB_ACTOR: 'APReddy-AutoBotz', GITHUB_TRIGGERING_ACTOR: 'APReddy-AutoBotz', GITHUB_RUN_ID: '700002', GITHUB_RUN_ATTEMPT: '1', GITHUB_EVENT_PATH: eventPath,
    PR_C_CONTROLLED_HUMAN_RELEASE_SHA: fixture.head, PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA: fixture.head, PR_C_CONTROLLED_HUMAN_PR_NUMBER: '264',
    PR_C_CONTROLLED_HUMAN_ENVIRONMENT_CLASS: 'hosted_nonproduction_pilot', PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN: 'https://deploy-preview-264--avalaos-pilot.netlify.app',
    PR_C_CONTROLLED_HUMAN_DEPLOY_ID: 'b'.repeat(24), PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST: exercise.exerciseDigest,
    PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT: targetFingerprint, PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST: publicTargetDigest,
    PR_C_CONTROLLED_HUMAN_CI_RUN_ID: '700001', PR_C_CONTROLLED_HUMAN_CI_RUN_ATTEMPT: '2',
    PR_C_CONTROLLED_HUMAN_CI_ARTIFACT_NAME: 'governed-delivery-monitor-pr-c-700001-2', PR_C_CONTROLLED_HUMAN_CI_ARTIFACT_DIGEST: `sha256:${'f'.repeat(64)}`,
    PR_C_CONTROLLED_HUMAN_DATABASE_URL: `postgresql://${databaseRole}:fixture-only-local-test@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`,
    PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY: 'fixture-only-pr264-credential-preflight-authority', PR_C_CONTROLLED_HUMAN_EXERCISE_ID: exerciseId,
    PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF: ref, PR_C_CONTROLLED_HUMAN_SUPABASE_URL: origin,
    PR_C_CONTROLLED_HUMAN_SUPABASE_SERVICE_ROLE_KEY: 'fixture-only-not-an-authentication-proof',
    PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_JSON: JSON.stringify(passwords),
    PR_C_CONTROLLED_HUMAN_PREFLIGHT_OUTPUT: PREFLIGHT_OUTPUT,
    PR_C_PREFLIGHT_FIXTURE_DATABASE_ROLE: databaseRole,
    PR_C_PREFLIGHT_FIXTURE_TRACE_PATH: tracePath,
    ...overrides,
  };
}

export function runCredentialPreflightEntry(fixture, env) {
  const entry = path.join(fixture.repositoryRoot, 'scripts/prCControlledHumanCredentialPreflight.mjs');
  const loader = path.join(fixture.repositoryRoot, 'scripts/prCControlledHumanCredentialPreflightEntryLoader.mjs');
  const transport = path.join(fixture.repositoryRoot, 'scripts/prCControlledHumanCredentialPreflightEntryTransport.mjs');
  return spawnSync(process.execPath, ['--no-warnings', '--experimental-loader', pathToFileURL(loader).href, '--import', pathToFileURL(transport).href, entry], {
    cwd: fixture.repositoryRoot,
    env: { ...env },
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: 30_000,
    windowsHide: true,
  });
}

export async function readCredentialPreflightEntryArtifact(fixture) {
  const outputRoot = path.join(fixture.repositoryRoot, PREFLIGHT_OUTPUT);
  const entries = splitLines(git(fixture.repositoryRoot, ['status', '--short', '--untracked-files=all'], fixture.gitEnvironment));
  if (entries.length !== 0) throw new Error('PR_C_PREFLIGHT_FIXTURE_OUTPUT_NOT_IGNORED');
  const bytes = await readFile(path.join(outputRoot, 'credential-preflight.json'));
  return { outputRoot, report: JSON.parse(bytes.toString('utf8')), bytes };
}
