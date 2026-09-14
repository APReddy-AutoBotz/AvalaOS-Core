import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { deriveControlledHumanExerciseBinding, loadFixture, sha256 } from './prCControlledHumanEnvironment.mjs';
import { PREFLIGHT_OUTPUT } from './prCControlledHumanCredentialPreflight.mjs';
import { classifyCredentialPreflightFsckFailureForTest, classifyCredentialPreflightFsckStdoutForTest,
  isCredentialPreflightFsckFailureCode } from './runPrCControlledHumanScriptCoverage.mjs';
import { collectChangedPrCFiles } from './transcriptFlowPrCEvidenceScope.mjs';

const BRANCH = 'controller/governed-delivery-monitor-pr-c-20260831';
const REPOSITORY = 'APReddy-AutoBotz/AvalaOS-Core';
const WORKFLOW = '.github/workflows/transcript-flow-pr-c.yml';
const GIT_TIMEOUT_MS = 30_000;
const GIT_OUTPUT_LIMIT_BYTES = 4 * 1024 * 1024;
const GIT_ARG_LIMIT = 256;
const GIT_ARG_BYTES_LIMIT = 64 * 1024;
const BUNDLE_HEADER_LIMIT_BYTES = 64 * 1024;
const seedAuthority = new WeakMap();
const fixtureAuthority = new WeakMap();
const objectInventoryAuthority = new WeakMap();
const operationEvidence = {
  actualOverlayBuilds: 0,
  actualCampaignClones: 0,
  actualCommittedSourceFixtures: 0,
  actualAdversarialClones: 0,
  actualEntryRuns: 0,
  actualFullIntegrityChecks: 0,
  actualObjectInventoryVerifications: 0,
  seedElapsedMs: [],
  cloneElapsedMs: [],
  entryElapsedMs: [],
};

export const PR_C_INTENDED_REMOVED_WORKFLOWS = Object.freeze([
  '.github/workflows/pr264-controlled-human-checkpoint.yml',
  '.github/workflows/pr264-controlled-human-edge-deploy.yml',
  '.github/workflows/pr264-controlled-human-prepare.yml',
  '.github/workflows/pr264-controlled-human-quiesce.yml',
  '.github/workflows/pr264-controlled-human-verify.yml',
]);

const normalize = value => value.replaceAll('\\', '/');
const splitLines = value => value.split(/\r?\n/gu).filter(Boolean);
const samePath = (left, right) => process.platform === 'win32'
  ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
  : path.resolve(left) === path.resolve(right);
const digestValue = value => createHash('sha256').update(value).digest('hex');
const fixedGitFailure = (args, reason) => {
  const operation = typeof args?.[0] === 'string' && /^[a-z-]+$/u.test(args[0]) ? args[0] : 'unknown';
  throw new Error(`PR_C_PREFLIGHT_FIXTURE_GIT_REJECTED:${operation}:${reason}`);
};

const fixedFsckStatusFailure = (status, stderr, stdout) => {
  const category = classifyCredentialPreflightFsckFailureForTest(stderr);
  const stdoutFamily = classifyCredentialPreflightFsckStdoutForTest(stdout);
  throw new Error(`PR_C_PREFLIGHT_FIXTURE_FSCK_STATUS:${status}:${category}:${stdoutFamily}`);
};

const assertGitArgv = args => {
  if (!Array.isArray(args) || args.length === 0 || args.length > GIT_ARG_LIMIT
    || args.some(value => typeof value !== 'string' || value.length === 0 || value.includes('\0'))
    || Buffer.byteLength(args.join('\0')) > GIT_ARG_BYTES_LIMIT) fixedGitFailure(args, 'ARGV');
};

const validateGitResult = (args, result, allowedStatuses = [0]) => {
  const stdout = typeof result?.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result?.stderr === 'string' ? result.stderr : '';
  if (Buffer.byteLength(stdout) > GIT_OUTPUT_LIMIT_BYTES || Buffer.byteLength(stderr) > GIT_OUTPUT_LIMIT_BYTES) fixedGitFailure(args, 'OUTPUT_LIMIT');
  if (result?.error?.code === 'ETIMEDOUT') fixedGitFailure(args, 'TIMEOUT');
  if (result?.error?.code === 'ENOBUFS') fixedGitFailure(args, 'OUTPUT_LIMIT');
  if (result?.error) fixedGitFailure(args, 'EXECUTION');
  if (result?.signal) fixedGitFailure(args, 'SIGNAL');
  if (!allowedStatuses.includes(result?.status)) {
    if (args.length === 3 && args[0] === 'fsck' && args[1] === '--full' && args[2] === '--strict'
      && allowedStatuses.length === 1 && allowedStatuses[0] === 0
      && Number.isInteger(result?.status) && result.status >= 1 && result.status <= 255) {
      fixedFsckStatusFailure(result.status, result?.stderr, result?.stdout);
    }
    fixedGitFailure(args, 'STATUS');
  }
  return { status: result.status, stdout: stdout.trim() };
};

export const assertCredentialPreflightFixtureGitResultForTest = (args, result, allowedStatuses = [0]) => {
  assertGitArgv(args);
  return validateGitResult(args, result, allowedStatuses);
};

const git = (cwd, args, env, { allowedStatuses = [0] } = {}) => {
  assertGitArgv(args);
  const result = spawnSync('git', args, {
    cwd,
    env: { ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_OUTPUT_LIMIT_BYTES,
    windowsHide: true,
  });
  return validateGitResult(args, result, allowedStatuses);
};

const pathPlatform = platform => platform === 'win32' ? path.win32 : path.posix;
const canonicalPath = (value, platform) => {
  const implementation = pathPlatform(platform);
  if (typeof value !== 'string' || value.length === 0 || /[\0\r\n"]/u.test(value) || !implementation.isAbsolute(value)) return null;
  const nativeResolved = implementation.resolve(value);
  const separated = platform === 'win32' ? nativeResolved.replaceAll('\\', '/') : nativeResolved;
  const resolved = separated.startsWith('//')
    ? `//${separated.slice(2).replace(/\/{2,}/gu, '/')}`
    : separated.replace(/\/{2,}/gu, '/');
  return platform === 'win32' ? resolved.toLowerCase() : resolved;
};
const containsPath = (owner, candidate, platform) => {
  const implementation = pathPlatform(platform);
  const relative = implementation.relative(owner, candidate);
  const outside = relative === '..' || relative.startsWith(`..${implementation.sep}`) || implementation.isAbsolute(relative);
  return relative === '' || !outside;
};
const resolvedPathCandidate = (value, platform) => {
  if (platform !== process.platform) return null;
  try { return canonicalPath(realpathSync(value), platform); } catch { return null; }
};

export const sanitizeCredentialPreflightPathForTest = (pathValue, excludedRoots, platform = process.platform) => {
  if (typeof pathValue !== 'string' || !Array.isArray(excludedRoots) || excludedRoots.length === 0
    || !['win32', 'linux', 'darwin'].includes(platform)) throw new Error('PR_C_PREFLIGHT_FIXTURE_PATH_ENVIRONMENT_REJECTED');
  const pathKind = platform === 'win32' ? 'win32' : 'posix';
  const delimiter = platform === 'win32' ? ';' : ':';
  const excluded = excludedRoots.flatMap(root => {
    const lexical = canonicalPath(root, pathKind);
    if (lexical === null) throw new Error('PR_C_PREFLIGHT_FIXTURE_PATH_ENVIRONMENT_REJECTED');
    const resolved = resolvedPathCandidate(root, platform);
    return resolved && resolved !== lexical ? [lexical, resolved] : [lexical];
  });
  const retained = [];
  for (const entry of pathValue.split(delimiter)) {
    const lexical = canonicalPath(entry, pathKind);
    if (lexical === null) continue;
    const resolved = resolvedPathCandidate(entry, platform);
    if (excluded.some(root => containsPath(root, lexical, pathKind)
      || (resolved !== null && containsPath(root, resolved, pathKind)))) continue;
    retained.push(entry);
  }
  if (retained.length === 0) throw new Error('PR_C_PREFLIGHT_FIXTURE_PATH_ENVIRONMENT_REJECTED');
  return retained.join(delimiter);
};

const infrastructureEnvironment = excludedRoots => {
  const environment = Object.fromEntries([
    'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'TMP', 'TEMP', 'TMPDIR',
  ].filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]));
  const inheritedPath = process.env.PATH ?? process.env.Path;
  if (inheritedPath === undefined) throw new Error('PR_C_PREFLIGHT_FIXTURE_PATH_ENVIRONMENT_REJECTED');
  environment.PATH = sanitizeCredentialPreflightPathForTest(inheritedPath, excludedRoots);
  return environment;
};

const fixtureGitEnvironment = (emptyGitConfigPath, emptyHooksPath, safeDirectories, excludedRoots) => {
  const entries = [
    ['commit.gpgsign', 'false'], ['core.hooksPath', emptyHooksPath], ['credential.helper', ''],
    ['credential.interactive', 'false'], ['protocol.file.allow', 'always'], ['protocol.http.allow', 'never'],
    ['protocol.https.allow', 'never'], ['protocol.ssh.allow', 'never'], ['protocol.git.allow', 'never'],
    ['protocol.ext.allow', 'never'], ...safeDirectories.map(directory => ['safe.directory', path.resolve(directory)]),
  ];
  return Object.freeze({
    ...infrastructureEnvironment(excludedRoots),
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: emptyGitConfigPath,
    GIT_ALLOW_PROTOCOL: 'file', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never',
    GIT_CONFIG_COUNT: String(entries.length),
    ...Object.fromEntries(entries.flatMap(([key, value], index) => [
      [`GIT_CONFIG_KEY_${index}`, key], [`GIT_CONFIG_VALUE_${index}`, value],
    ])),
  });
};

const assertInside = (root, target) => {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('PR_C_PREFLIGHT_FIXTURE_PATH_REJECTED');
};

const assertOwnedTemporaryRoot = async temporaryRoot => {
  let temporaryReal;
  let osTemporaryReal;
  try {
    const stat = await lstat(temporaryRoot);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('invalid');
    [temporaryReal, osTemporaryReal] = await Promise.all([realpath(temporaryRoot), realpath(os.tmpdir())]);
  } catch {
    throw new Error('PR_C_PREFLIGHT_FIXTURE_CLEANUP_AUTHORITY_REJECTED');
  }
  assertInside(osTemporaryReal, temporaryReal);
  if (!samePath(temporaryReal, temporaryRoot)) throw new Error('PR_C_PREFLIGHT_FIXTURE_CLEANUP_AUTHORITY_REJECTED');
  return temporaryReal;
};

const fixedFailureCode = error => {
  const message = error instanceof Error ? error.message : '';
  if (isCredentialPreflightFsckFailureCode(message)) return message;
  const match = /^(PR_C_PREFLIGHT_FIXTURE_[A-Z_]+(?::[a-z-]+:[A-Z_]+)?)$/u.exec(message);
  return match?.[1] ?? 'PR_C_PREFLIGHT_FIXTURE_CONSTRUCTION_REJECTED';
};

const rejectConstruction = async (temporaryRoot, error) => {
  const original = fixedFailureCode(error);
  try {
    const temporaryReal = await assertOwnedTemporaryRoot(temporaryRoot);
    await rm(temporaryReal, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  } catch {
    throw new Error(`PR_C_PREFLIGHT_FIXTURE_CONSTRUCTION_REJECTED:${original}:CLEANUP_FAILED`);
  }
  throw new Error(original);
};

export const assertCredentialPreflightFixtureResolvedRootForTest = (osTemporaryRoot, claimedRoot, resolvedRoot) => {
  assertInside(path.resolve(osTemporaryRoot), path.resolve(resolvedRoot));
  if (!samePath(claimedRoot, resolvedRoot)) throw new Error('PR_C_PREFLIGHT_FIXTURE_CLEANUP_AUTHORITY_REJECTED');
  return true;
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
  return digestValue(await readFile(target));
};

const excluded = relative => relative.startsWith('.agent/') || relative.startsWith('output/')
  || relative.startsWith('tools/') || relative.startsWith('docs/marketing/')
  || relative === 'scripts/testPilotOperationsRecoveryPostgres.mjs'
  || relative === '.env' || relative.startsWith('.env.') || relative.split('/').some(part => part === '.env' || part.startsWith('.env.'));

const governedCandidateFiles = sourceRoot => [...new Set([
  ...collectChangedPrCFiles(sourceRoot).filter(relative => !excluded(relative)), ...PR_C_INTENDED_REMOVED_WORKFLOWS,
])].sort();

const candidateInventory = async (root, governed) => {
  const entries = {};
  for (const relative of governed) entries[relative] = await candidateFileDigest(root, relative);
  return Object.freeze({ entries: Object.freeze(entries), digest: `sha256:${digestValue(JSON.stringify(entries))}` });
};

const sourceSnapshot = async (sourceRoot, gitEnvironment) => {
  const governed = governedCandidateFiles(sourceRoot);
  const inventory = await candidateInventory(sourceRoot, governed);
  return Object.freeze({
    head: git(sourceRoot, ['rev-parse', '--verify', 'HEAD'], gitEnvironment).stdout,
    tree: git(sourceRoot, ['rev-parse', 'HEAD^{tree}'], gitEnvironment).stdout,
    status: git(sourceRoot, ['status', '--short', '--untracked-files=all'], gitEnvironment).stdout,
    governed: Object.freeze(governed), inventory,
  });
};

const assertSameSourceSnapshot = (left, right) => {
  if (left.head !== right.head || left.tree !== right.tree || left.status !== right.status
    || JSON.stringify(left.governed) !== JSON.stringify(right.governed)
    || left.inventory.digest !== right.inventory.digest
    || JSON.stringify(left.inventory.entries) !== JSON.stringify(right.inventory.entries)) {
    throw new Error('PR_C_PREFLIGHT_FIXTURE_SOURCE_DRIFT_REJECTED');
  }
};

const copyCandidateWorktree = async (sourceRoot, repositoryRoot, governed, gitEnvironment) => {
  operationEvidence.actualOverlayBuilds += 1;
  for (const relative of PR_C_INTENDED_REMOVED_WORKFLOWS) {
    if (await candidateFileDigest(sourceRoot, relative) !== null) throw new Error('PR_C_PREFLIGHT_FIXTURE_INTENDED_DELETION_REJECTED');
  }
  const governedSet = new Set(governed);
  for (const relative of governed) {
    const sourceDigest = await candidateFileDigest(sourceRoot, relative);
    const destination = path.resolve(repositoryRoot, relative);
    assertInside(repositoryRoot, destination);
    if (sourceDigest === null) { await rm(destination, { force: true }); continue; }
    const source = path.resolve(sourceRoot, relative);
    assertInside(sourceRoot, source);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
    if (sourceDigest !== await candidateFileDigest(repositoryRoot, relative)) throw new Error('PR_C_PREFLIGHT_FIXTURE_SOURCE_HASH_REJECTED');
  }
  const changed = [];
  for (const line of splitLines(git(repositoryRoot, ['diff', '--no-renames', '--name-status', 'HEAD', '--'], gitEnvironment).stdout)) {
    const [status, relative] = line.split('\t');
    if (!relative || !/^[ACDMRTUXB][0-9]*$/u.test(status)) throw new Error('PR_C_PREFLIGHT_FIXTURE_STATUS_REJECTED');
    const normalized = normalize(relative);
    if (!governedSet.has(normalized)) throw new Error('PR_C_PREFLIGHT_FIXTURE_OVERLAY_SCOPE_REJECTED');
    changed.push(normalized);
  }
  for (const relative of splitLines(git(repositoryRoot, ['ls-files', '--others', '--exclude-standard'], gitEnvironment).stdout)) {
    const normalized = normalize(relative);
    if (!governedSet.has(normalized)) throw new Error('PR_C_PREFLIGHT_FIXTURE_OVERLAY_SCOPE_REJECTED');
    changed.push(normalized);
  }
  for (const relative of governed) {
    if (await candidateFileDigest(sourceRoot, relative) !== await candidateFileDigest(repositoryRoot, relative)) {
      throw new Error('PR_C_PREFLIGHT_FIXTURE_GOVERNED_INVENTORY_REJECTED');
    }
  }
  return [...new Set(changed)].sort();
};

const commitCandidate = (repositoryRoot, changed, { nonAncestor = false } = {}, gitEnvironment) => {
  git(repositoryRoot, ['add', '--all'], gitEnvironment);
  const staged = splitLines(git(repositoryRoot, ['diff', '--cached', '--name-only'], gitEnvironment).stdout).map(normalize).sort();
  const status = splitLines(git(repositoryRoot, ['status', '--short', '--untracked-files=all'], gitEnvironment).stdout);
  if (JSON.stringify(staged) !== JSON.stringify(changed) || status.length !== staged.length
    || status.some(line => line.startsWith('??') || line[1] !== ' ')) throw new Error('PR_C_PREFLIGHT_FIXTURE_STAGED_SET_REJECTED');
  const author = { ...gitEnvironment,
    GIT_AUTHOR_NAME: 'PR C fixture', GIT_AUTHOR_EMAIL: 'pr-c-fixture@example.invalid',
    GIT_COMMITTER_NAME: 'PR C fixture', GIT_COMMITTER_EMAIL: 'pr-c-fixture@example.invalid',
    GIT_AUTHOR_DATE: '2026-09-12T00:00:00Z', GIT_COMMITTER_DATE: '2026-09-12T00:00:00Z' };
  if (!nonAncestor && changed.length === 0) return;
  if (nonAncestor) {
    const tree = git(repositoryRoot, ['write-tree'], gitEnvironment).stdout;
    const commit = git(repositoryRoot, ['commit-tree', tree, '-m', 'isolated nonancestor fixture'], author).stdout;
    git(repositoryRoot, ['update-ref', '--no-deref', 'HEAD', commit], gitEnvironment);
  } else git(repositoryRoot, ['commit', '--quiet', '-m', 'isolated candidate fixture'], author);
  if (git(repositoryRoot, ['status', '--short', '--untracked-files=all'], gitEnvironment).stdout !== '') throw new Error('PR_C_PREFLIGHT_FIXTURE_COMMIT_REJECTED');
};

const localCloneSourceIdentity = async (sourceRoot, constructionEnvironment) => {
  const sourceReal = await realpath(sourceRoot);
  if (!samePath(sourceReal, sourceRoot)) throw new Error('PR_C_PREFLIGHT_FIXTURE_CLONE_SOURCE_REJECTED');
  const sourceStat = await lstat(sourceRoot);
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) throw new Error('PR_C_PREFLIGHT_FIXTURE_CLONE_SOURCE_REJECTED');
  const objectPathValue = git(sourceRoot, ['rev-parse', '--git-path', 'objects'], constructionEnvironment).stdout;
  const objectPath = path.resolve(sourceRoot, objectPathValue);
  const objectStat = await lstat(objectPath);
  const objectReal = await realpath(objectPath);
  if (!objectStat.isDirectory() || objectStat.isSymbolicLink() || !samePath(objectPath, objectReal)) {
    throw new Error('PR_C_PREFLIGHT_FIXTURE_CLONE_SOURCE_REJECTED');
  }
  const alternates = path.join(objectReal, 'info', 'alternates');
  if (await lstat(alternates).then(() => true, error => error.code === 'ENOENT' ? false : Promise.reject(error))) {
    throw new Error('PR_C_PREFLIGHT_FIXTURE_CLONE_SOURCE_REJECTED');
  }
  return Object.freeze({
    head: git(sourceRoot, ['rev-parse', '--verify', 'HEAD'], constructionEnvironment).stdout,
    tree: git(sourceRoot, ['rev-parse', 'HEAD^{tree}'], constructionEnvironment).stdout,
    status: git(sourceRoot, ['status', '--short', '--untracked-files=all'], constructionEnvironment).stdout,
  });
};

const assertCompleteHeadBundle = async (sourceRoot, bundlePath, expectedHead, constructionEnvironment) => {
  git(sourceRoot, ['bundle', 'verify', bundlePath], constructionEnvironment);
  const listedHeads = splitLines(git(sourceRoot, ['bundle', 'list-heads', bundlePath], constructionEnvironment).stdout);
  if (JSON.stringify(listedHeads) !== JSON.stringify([`${expectedHead} HEAD`])) {
    throw new Error('PR_C_PREFLIGHT_FIXTURE_BUNDLE_HEAD_REJECTED');
  }
  const handle = await open(bundlePath, 'r');
  try {
    const bytes = Buffer.alloc(BUNDLE_HEADER_LIMIT_BYTES);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const header = bytes.subarray(0, bytesRead).toString('utf8').split('\n\n', 1)[0];
    const lines = header.split('\n').map(line => line.replace(/\r$/u, ''));
    if (!/^# v[23] git bundle$/u.test(lines[0] ?? '') || lines.some(line => line.startsWith('-'))
      || !lines.includes(`${expectedHead} HEAD`)) throw new Error('PR_C_PREFLIGHT_FIXTURE_BUNDLE_COMPLETENESS_REJECTED');
  } finally {
    await handle.close();
  }
};

const cloneSelfContained = async (sourceRoot, repositoryRoot, constructionEnvironment, { bundlePath = null } = {}) => {
  const before = await localCloneSourceIdentity(sourceRoot, constructionEnvironment);
  if (bundlePath === null) {
    git(path.dirname(repositoryRoot), ['clone', '--quiet', '--local', '--no-hardlinks', '--no-checkout', sourceRoot, repositoryRoot], constructionEnvironment);
  } else {
    const resolvedBundle = path.resolve(bundlePath);
    assertInside(path.dirname(repositoryRoot), resolvedBundle);
    git(sourceRoot, ['bundle', 'create', resolvedBundle, 'HEAD'], constructionEnvironment);
    await assertCompleteHeadBundle(sourceRoot, resolvedBundle, before.head, constructionEnvironment);
    git(path.dirname(repositoryRoot), ['clone', '--quiet', '--no-checkout', resolvedBundle, repositoryRoot], constructionEnvironment);
    await rm(resolvedBundle, { force: true });
  }
  const after = await localCloneSourceIdentity(sourceRoot, constructionEnvironment);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('PR_C_PREFLIGHT_FIXTURE_CLONE_SOURCE_DRIFT_REJECTED');
  git(repositoryRoot, ['config', 'core.autocrlf', 'false'], constructionEnvironment);
  git(repositoryRoot, ['config', 'core.eol', 'lf'], constructionEnvironment);
  git(repositoryRoot, ['checkout', '--quiet', '--detach', before.head], constructionEnvironment);
  git(repositoryRoot, ['remote', 'remove', 'origin'], constructionEnvironment);
};

const collectObjectFiles = async directory => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('PR_C_PREFLIGHT_FIXTURE_OBJECT_LINK_REJECTED');
    if (entry.isDirectory()) files.push(...await collectObjectFiles(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
};

const objectFileDigest = async target => {
  const before = await lstat(target, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n) throw new Error('PR_C_PREFLIGHT_FIXTURE_HARDLINK_REJECTED');
  if (before.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('PR_C_PREFLIGHT_FIXTURE_OBJECT_INVENTORY_REJECTED');
  const digest = createHash('sha256');
  const handle = await open(target, 'r');
  try {
    const bytes = Buffer.alloc(64 * 1024);
    let position = 0;
    while (position < Number(before.size)) {
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, position);
      if (bytesRead === 0) break;
      digest.update(bytes.subarray(0, bytesRead));
      position += bytesRead;
    }
    if (position !== Number(before.size)) throw new Error('PR_C_PREFLIGHT_FIXTURE_OBJECT_INVENTORY_REJECTED');
  } finally {
    await handle.close();
  }
  const after = await lstat(target, { bigint: true });
  if (!after.isFile() || after.isSymbolicLink() || after.nlink !== 1n
    || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
    || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
    throw new Error('PR_C_PREFLIGHT_FIXTURE_OBJECT_INVENTORY_REJECTED');
  }
  return Object.freeze({ size: Number(after.size), sha256: digest.digest('hex') });
};

const readObjectInventory = async repositoryRoot => {
  const objectsRoot = path.resolve(repositoryRoot, '.git', 'objects');
  const objectsReal = await realpath(objectsRoot);
  if (!samePath(objectsRoot, objectsReal)) throw new Error('PR_C_PREFLIGHT_FIXTURE_OBJECT_LINK_REJECTED');
  const entries = [];
  for (const objectFile of (await collectObjectFiles(objectsReal)).sort()) {
    const relative = normalize(path.relative(objectsReal, objectFile));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('PR_C_PREFLIGHT_FIXTURE_OBJECT_INVENTORY_REJECTED');
    entries.push(Object.freeze({ path: relative, ...await objectFileDigest(objectFile) }));
  }
  const frozenEntries = Object.freeze(entries);
  return Object.freeze({
    entries: frozenEntries,
    digest: `sha256:${digestValue(JSON.stringify(frozenEntries))}`,
  });
};

export const assertCredentialPreflightObjectInventoryClaimsForTest = (expected, actual) => {
  const keys = ['digest', 'entries'];
  if (!expected || !actual || JSON.stringify(Object.keys(expected).sort()) !== JSON.stringify(keys)
    || JSON.stringify(Object.keys(actual).sort()) !== JSON.stringify(keys)
    || expected.digest !== actual.digest || JSON.stringify(expected.entries) !== JSON.stringify(actual.entries)) {
    throw new Error('PR_C_PREFLIGHT_FIXTURE_OBJECT_INVENTORY_REJECTED');
  }
  return true;
};

const authorizeObjectInventory = (inventory, owner) => {
  objectInventoryAuthority.set(inventory, { active: true, owner });
  return inventory;
};

const assertAuthorizedObjectInventory = (inventory, owner) => {
  const authority = objectInventoryAuthority.get(inventory);
  if (!authority?.active || authority.owner !== owner) throw new Error('PR_C_PREFLIGHT_FIXTURE_OBJECT_INVENTORY_AUTHORITY_REJECTED');
};

const deactivateObjectInventory = inventory => {
  const authority = objectInventoryAuthority.get(inventory);
  if (authority) authority.active = false;
};

const verifyObjectInventory = async (repositoryRoot, expectedInventory, expectedOwner) => {
  assertAuthorizedObjectInventory(expectedInventory, expectedOwner);
  const actual = await readObjectInventory(repositoryRoot);
  assertCredentialPreflightObjectInventoryClaimsForTest(expectedInventory, actual);
  operationEvidence.actualObjectInventoryVerifications += 1;
  return expectedInventory;
};

const assertSelfContainedRepository = async (repositoryRoot, gitEnvironment, {
  fullIntegrity = false, expectedInventory = null, expectedOwner = null, owner = null,
} = {}) => {
  const repositoryReal = await realpath(repositoryRoot);
  if (!samePath(repositoryReal, repositoryRoot)) throw new Error('PR_C_PREFLIGHT_FIXTURE_REPOSITORY_ESCAPE_REJECTED');
  if (git(repositoryRoot, ['remote'], gitEnvironment).stdout !== '') throw new Error('PR_C_PREFLIGHT_FIXTURE_REMOTE_REJECTED');
  const alternates = path.join(repositoryRoot, '.git', 'objects', 'info', 'alternates');
  if (await lstat(alternates).then(() => true, error => error.code === 'ENOENT' ? false : Promise.reject(error))) throw new Error('PR_C_PREFLIGHT_FIXTURE_ALTERNATE_REJECTED');
  if (await lstat(path.join(repositoryRoot, 'node_modules')).then(() => true, () => false)) throw new Error('PR_C_PREFLIGHT_FIXTURE_NODE_MODULES_REJECTED');
  if (!fullIntegrity) {
    if (expectedInventory === null) throw new Error('PR_C_PREFLIGHT_FIXTURE_OBJECT_INVENTORY_AUTHORITY_REJECTED');
    return verifyObjectInventory(repositoryRoot, expectedInventory, expectedOwner);
  }
  const before = await readObjectInventory(repositoryRoot);
  git(repositoryRoot, ['fsck', '--full', '--strict'], gitEnvironment);
  operationEvidence.actualFullIntegrityChecks += 1;
  const after = await readObjectInventory(repositoryRoot);
  assertCredentialPreflightObjectInventoryClaimsForTest(before, after);
  operationEvidence.actualObjectInventoryVerifications += 1;
  if (expectedInventory !== null) {
    assertAuthorizedObjectInventory(expectedInventory, expectedOwner);
    assertCredentialPreflightObjectInventoryClaimsForTest(expectedInventory, after);
    operationEvidence.actualObjectInventoryVerifications += 1;
    return expectedInventory;
  }
  return authorizeObjectInventory(after, owner);
};

const changedMetadata = (repositoryRoot, sourceHead, candidateHead, gitEnvironment) => {
  const lines = splitLines(git(repositoryRoot, ['diff', '--no-renames', '--name-status', `${sourceHead}..${candidateHead}`, '--'], gitEnvironment).stdout);
  const changed = [];
  const deletions = [];
  for (const line of lines) {
    const [status, relative] = line.split('\t');
    if (!relative || !/^[ACDMRTUXB][0-9]*$/u.test(status)) throw new Error('PR_C_PREFLIGHT_FIXTURE_STATUS_REJECTED');
    const normalized = normalize(relative);
    changed.push(normalized);
    if (status.startsWith('D')) deletions.push(normalized);
  }
  return Object.freeze({ changed: Object.freeze(changed.sort()), deletions: Object.freeze(deletions.sort()) });
};

export const assertCredentialPreflightFixtureIdentityClaimsForTest = (expected, actual) => {
  const keys = ['head', 'tree', 'ancestry', 'changed', 'deletions', 'inventoryDigest', 'inventoryEntries', 'headFiles'];
  if (!expected || !actual || JSON.stringify(Object.keys(expected).sort()) !== JSON.stringify(keys.slice().sort())
    || JSON.stringify(Object.keys(actual).sort()) !== JSON.stringify(keys.slice().sort())
    || keys.some(key => JSON.stringify(actual[key]) !== JSON.stringify(expected[key]))) {
    throw new Error('PR_C_PREFLIGHT_FIXTURE_IDENTITY_CLAIMS_REJECTED');
  }
  return true;
};

const assertCandidateIdentity = async (repositoryRoot, state, candidateHead, nonAncestor, gitEnvironment, integrity) => {
  const verifiedObjectInventory = await assertSelfContainedRepository(repositoryRoot, gitEnvironment, integrity);
  const head = git(repositoryRoot, ['rev-parse', '--verify', 'HEAD'], gitEnvironment).stdout;
  const tree = git(repositoryRoot, ['rev-parse', 'HEAD^{tree}'], gitEnvironment).stdout;
  if (git(repositoryRoot, ['status', '--short', '--untracked-files=all'], gitEnvironment).stdout !== '') throw new Error('PR_C_PREFLIGHT_FIXTURE_CONTAMINATION_REJECTED');
  const ancestry = git(repositoryRoot, ['merge-base', '--is-ancestor', state.sourceSnapshot.head, candidateHead], gitEnvironment, { allowedStatuses: [0, 1] }).status === 0;
  const metadata = changedMetadata(repositoryRoot, state.sourceSnapshot.head, candidateHead, gitEnvironment);
  const inventory = await candidateInventory(repositoryRoot, state.sourceSnapshot.governed);
  const headFiles = splitLines(git(repositoryRoot, ['ls-tree', '-r', '--name-only', 'HEAD'], gitEnvironment).stdout).map(normalize).sort();
  assertCredentialPreflightFixtureIdentityClaimsForTest({
    head: candidateHead, tree: state.candidateTree, ancestry: !nonAncestor,
    changed: state.changed, deletions: state.deletions,
    inventoryDigest: state.candidateInventory.digest, inventoryEntries: state.candidateInventory.entries,
    headFiles: state.candidateHeadFiles,
  }, {
    head, tree, ancestry, changed: metadata.changed, deletions: metadata.deletions,
    inventoryDigest: inventory.digest, inventoryEntries: inventory.entries, headFiles,
  });
  return verifiedObjectInventory;
};

const createControl = async temporaryRoot => {
  const controlRoot = path.join(temporaryRoot, 'control');
  const emptyHooksPath = path.join(controlRoot, 'hooks');
  const emptyGitConfigPath = path.join(controlRoot, 'empty.gitconfig');
  await mkdir(emptyHooksPath, { recursive: true });
  await writeFile(emptyGitConfigPath, '', { flag: 'wx', mode: 0o600 });
  return { controlRoot, emptyHooksPath, emptyGitConfigPath };
};

export async function createCredentialPreflightEntrySeed(sourceRoot = process.cwd()) {
  const started = Date.now();
  const sourceReal = await realpath(sourceRoot);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'pr-c-credential-preflight-seed-'));
  const repositoryRoot = path.join(temporaryRoot, 'repository');
  try {
    const control = await createControl(temporaryRoot);
    const constructionEnvironment = fixtureGitEnvironment(control.emptyGitConfigPath, control.emptyHooksPath, [sourceReal, repositoryRoot], [sourceReal]);
    const snapshot = await sourceSnapshot(sourceReal, constructionEnvironment);
    const sourceHeadFiles = splitLines(git(sourceReal, ['ls-tree', '-r', '--name-only', 'HEAD'], constructionEnvironment).stdout).map(normalize).sort();
    await cloneSelfContained(sourceReal, repositoryRoot, constructionEnvironment, { bundlePath: path.join(control.controlRoot, 'source-head.bundle') });
    const changed = await copyCandidateWorktree(sourceReal, repositoryRoot, snapshot.governed, constructionEnvironment);
    commitCandidate(repositoryRoot, changed, {}, constructionEnvironment);
    const candidateHead = git(repositoryRoot, ['rev-parse', '--verify', 'HEAD'], constructionEnvironment).stdout;
    const candidateTree = git(repositoryRoot, ['rev-parse', 'HEAD^{tree}'], constructionEnvironment).stdout;
    const metadata = changedMetadata(repositoryRoot, snapshot.head, candidateHead, constructionEnvironment);
    if (JSON.stringify(metadata.changed) !== JSON.stringify(changed)) throw new Error('PR_C_PREFLIGHT_FIXTURE_CHANGED_METADATA_REJECTED');
    const inventoryOwner = Object.freeze({ kind: 'pr-c-credential-preflight-seed-inventory', temporaryRoot });
    const candidateState = {
      sourceSnapshot: snapshot, sourceHeadFiles: Object.freeze(sourceHeadFiles), candidateHead, candidateTree,
      candidateInventory: await candidateInventory(repositoryRoot, snapshot.governed),
      candidateHeadFiles: Object.freeze(splitLines(git(repositoryRoot, ['ls-tree', '-r', '--name-only', 'HEAD'], constructionEnvironment).stdout).map(normalize).sort()),
      changed: metadata.changed, deletions: metadata.deletions,
    };
    candidateState.inventoryOwner = inventoryOwner;
    candidateState.objectInventory = await assertCandidateIdentity(repositoryRoot, candidateState, candidateHead, false, constructionEnvironment,
      { fullIntegrity: true, owner: inventoryOwner });
    const seed = Object.freeze({ kind: 'pr-c-credential-preflight-seed', sourceRoot: sourceReal, sourceHead: snapshot.head,
      sourceHeadFiles: candidateState.sourceHeadFiles, temporaryRoot, repositoryRoot, candidateHead, candidateTree,
      governedFiles: snapshot.governed, governedDigest: candidateState.candidateInventory.digest,
      changed: candidateState.changed, deletions: candidateState.deletions });
    seedAuthority.set(seed, { active: true, activeFixtures: new Set(), control, constructionEnvironment, ...candidateState });
    operationEvidence.seedElapsedMs.push(Date.now() - started);
    return seed;
  } catch (error) {
    await rejectConstruction(temporaryRoot, error);
  }
}

export async function verifyCredentialPreflightEntrySeed(seed) {
  const state = seedAuthority.get(seed);
  if (!state?.active) throw new Error('PR_C_PREFLIGHT_FIXTURE_SEED_AUTHORITY_REJECTED');
  await assertOwnedTemporaryRoot(seed.temporaryRoot);
  await assertCandidateIdentity(seed.repositoryRoot, state, state.candidateHead, false, state.constructionEnvironment,
    { expectedInventory: state.objectInventory, expectedOwner: state.inventoryOwner });
  return true;
}

const createCommittedSourceFixture = async sourceRoot => {
  const sourceReal = await realpath(sourceRoot);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'pr-c-credential-preflight-entry-'));
  const repositoryRoot = path.join(temporaryRoot, 'repository');
  try {
    const control = await createControl(temporaryRoot);
    const constructionEnvironment = fixtureGitEnvironment(control.emptyGitConfigPath, control.emptyHooksPath, [sourceReal, repositoryRoot], [sourceReal]);
    const sourceHead = git(sourceReal, ['rev-parse', '--verify', 'HEAD'], constructionEnvironment).stdout;
    const sourceHeadFiles = splitLines(git(sourceReal, ['ls-tree', '-r', '--name-only', 'HEAD'], constructionEnvironment).stdout).map(normalize).sort();
    await cloneSelfContained(sourceReal, repositoryRoot, constructionEnvironment, { bundlePath: path.join(control.controlRoot, 'source-head.bundle') });
    const childEnvironment = fixtureGitEnvironment(control.emptyGitConfigPath, control.emptyHooksPath, [repositoryRoot], [sourceReal]);
    const inventoryOwner = Object.freeze({ kind: 'pr-c-credential-preflight-committed-inventory', temporaryRoot });
    const objectInventory = await assertSelfContainedRepository(repositoryRoot, childEnvironment, { fullIntegrity: true, owner: inventoryOwner });
    const fixture = Object.freeze({ sourceRoot: sourceReal, sourceHead, sourceHeadFiles: Object.freeze(sourceHeadFiles), temporaryRoot,
      repositoryRoot, controlRoot: control.controlRoot, head: sourceHead, changed: Object.freeze([]), gitEnvironment: childEnvironment });
    fixtureAuthority.set(fixture, { active: true, seed: null, nonAncestor: false,
      inventoryOwner, objectInventory, ownsObjectInventory: true });
    operationEvidence.actualCommittedSourceFixtures += 1;
    return fixture;
  } catch (error) {
    await rejectConstruction(temporaryRoot, error);
  }
};

export async function createCredentialPreflightEntryFixture(seedOrSource = process.cwd(), { nonAncestor = false, committedSourceOnly = false, purpose = 'campaign' } = {}) {
  if (committedSourceOnly) return createCommittedSourceFixture(seedOrSource);
  const seedState = seedAuthority.get(seedOrSource);
  if (!seedState?.active || !['campaign', 'adversarial'].includes(purpose)) throw new Error('PR_C_PREFLIGHT_FIXTURE_SEED_AUTHORITY_REJECTED');
  await verifyCredentialPreflightEntrySeed(seedOrSource);
  const started = Date.now();
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'pr-c-credential-preflight-entry-'));
  const repositoryRoot = path.join(temporaryRoot, 'repository');
  try {
    const control = await createControl(temporaryRoot);
    const excludedRoots = [seedOrSource.sourceRoot, seedOrSource.repositoryRoot];
    const constructionEnvironment = fixtureGitEnvironment(control.emptyGitConfigPath, control.emptyHooksPath,
      [seedOrSource.repositoryRoot, repositoryRoot], excludedRoots);
    await cloneSelfContained(seedOrSource.repositoryRoot, repositoryRoot, constructionEnvironment);
    const childEnvironment = fixtureGitEnvironment(control.emptyGitConfigPath, control.emptyHooksPath, [repositoryRoot], excludedRoots);
    let head = seedState.candidateHead;
    if (nonAncestor) {
      const tree = git(repositoryRoot, ['rev-parse', 'HEAD^{tree}'], childEnvironment).stdout;
      const author = { ...childEnvironment,
        GIT_AUTHOR_NAME: 'PR C fixture', GIT_AUTHOR_EMAIL: 'pr-c-fixture@example.invalid',
        GIT_COMMITTER_NAME: 'PR C fixture', GIT_COMMITTER_EMAIL: 'pr-c-fixture@example.invalid',
        GIT_AUTHOR_DATE: '2026-09-12T00:00:00Z', GIT_COMMITTER_DATE: '2026-09-12T00:00:00Z' };
      head = git(repositoryRoot, ['commit-tree', tree, '-m', 'isolated nonancestor fixture'], author).stdout;
      git(repositoryRoot, ['update-ref', '--no-deref', 'HEAD', head], childEnvironment);
    }
    const inventoryOwner = nonAncestor
      ? Object.freeze({ kind: 'pr-c-credential-preflight-nonancestor-inventory', temporaryRoot })
      : seedState.inventoryOwner;
    const objectInventory = await assertCandidateIdentity(repositoryRoot, seedState, head, nonAncestor, childEnvironment,
      nonAncestor
        ? { fullIntegrity: true, owner: inventoryOwner }
        : { expectedInventory: seedState.objectInventory, expectedOwner: seedState.inventoryOwner });
    const fixture = Object.freeze({ sourceRoot: seedOrSource.sourceRoot, sourceHead: seedState.sourceSnapshot.head,
      sourceHeadFiles: seedState.sourceHeadFiles, temporaryRoot, repositoryRoot, controlRoot: control.controlRoot,
      head, candidateTree: seedState.candidateTree, governedFiles: seedState.sourceSnapshot.governed,
      governedDigest: seedState.candidateInventory.digest, changed: seedState.changed, deletions: seedState.deletions,
      gitEnvironment: childEnvironment });
    fixtureAuthority.set(fixture, { active: true, seed: seedOrSource, nonAncestor,
      inventoryOwner, objectInventory, ownsObjectInventory: nonAncestor });
    seedState.activeFixtures.add(fixture);
    if (purpose === 'campaign') operationEvidence.actualCampaignClones += 1;
    else operationEvidence.actualAdversarialClones += 1;
    operationEvidence.cloneElapsedMs.push(Date.now() - started);
    return fixture;
  } catch (error) {
    await rejectConstruction(temporaryRoot, error);
  }
}

export async function verifyCredentialPreflightEntryFixture(fixture) {
  const state = fixtureAuthority.get(fixture);
  if (!state?.active) throw new Error('PR_C_PREFLIGHT_FIXTURE_AUTHORITY_REJECTED');
  await assertOwnedTemporaryRoot(fixture.temporaryRoot);
  if (state.seed) {
    const seedState = seedAuthority.get(state.seed);
    if (!seedState?.active) throw new Error('PR_C_PREFLIGHT_FIXTURE_SEED_AUTHORITY_REJECTED');
    await assertCandidateIdentity(fixture.repositoryRoot, seedState, fixture.head, state.nonAncestor, fixture.gitEnvironment,
      { expectedInventory: state.objectInventory, expectedOwner: state.inventoryOwner });
  } else {
    if (git(fixture.repositoryRoot, ['rev-parse', '--verify', 'HEAD'], fixture.gitEnvironment).stdout !== fixture.head
      || git(fixture.repositoryRoot, ['status', '--short', '--untracked-files=all'], fixture.gitEnvironment).stdout !== '') {
      throw new Error('PR_C_PREFLIGHT_FIXTURE_CANDIDATE_IDENTITY_REJECTED');
    }
    await assertSelfContainedRepository(fixture.repositoryRoot, fixture.gitEnvironment,
      { expectedInventory: state.objectInventory, expectedOwner: state.inventoryOwner });
  }
  return true;
}

export async function removeCredentialPreflightEntryFixture(fixture) {
  const state = fixtureAuthority.get(fixture);
  if (!state?.active) throw new Error('PR_C_PREFLIGHT_FIXTURE_CLEANUP_AUTHORITY_REJECTED');
  const temporaryReal = await assertOwnedTemporaryRoot(fixture.temporaryRoot);
  if (samePath(temporaryReal, fixture.sourceRoot) || normalize(temporaryReal).includes('/node_modules/')) throw new Error('PR_C_PREFLIGHT_FIXTURE_CLEANUP_REJECTED');
  const nodeModulesPresent = await lstat(path.join(fixture.repositoryRoot, 'node_modules')).then(() => true, () => false);
  try { await rm(temporaryReal, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); }
  catch { throw new Error('PR_C_PREFLIGHT_FIXTURE_CLEANUP_FAILED'); }
  state.active = false;
  if (state.ownsObjectInventory) deactivateObjectInventory(state.objectInventory);
  if (state.seed) seedAuthority.get(state.seed)?.activeFixtures.delete(fixture);
  if (nodeModulesPresent) throw new Error('PR_C_PREFLIGHT_FIXTURE_NODE_MODULES_REJECTED');
}

export async function removeCredentialPreflightEntrySeed(seed) {
  const state = seedAuthority.get(seed);
  if (!state?.active) throw new Error('PR_C_PREFLIGHT_FIXTURE_SEED_CLEANUP_AUTHORITY_REJECTED');
  if (state.activeFixtures.size !== 0) throw new Error('PR_C_PREFLIGHT_FIXTURE_SEED_ACTIVE_CLONES_REJECTED');
  const currentSource = await sourceSnapshot(seed.sourceRoot, state.constructionEnvironment);
  assertSameSourceSnapshot(state.sourceSnapshot, currentSource);
  await assertCandidateIdentity(seed.repositoryRoot, state, state.candidateHead, false, state.constructionEnvironment,
    { fullIntegrity: true, expectedInventory: state.objectInventory, expectedOwner: state.inventoryOwner });
  const finalSource = await sourceSnapshot(seed.sourceRoot, state.constructionEnvironment);
  assertSameSourceSnapshot(state.sourceSnapshot, finalSource);
  assertSameSourceSnapshot(currentSource, finalSource);
  const temporaryReal = await assertOwnedTemporaryRoot(seed.temporaryRoot);
  try { await rm(temporaryReal, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); }
  catch { throw new Error('PR_C_PREFLIGHT_FIXTURE_SEED_CLEANUP_FAILED'); }
  state.active = false;
  deactivateObjectInventory(state.objectInventory);
}

export const assertCredentialPreflightObjectInventoryAuthorityForTest = handle => {
  const state = seedAuthority.get(handle) ?? fixtureAuthority.get(handle);
  if (!state?.active || !state.objectInventory) throw new Error('PR_C_PREFLIGHT_FIXTURE_OBJECT_INVENTORY_AUTHORITY_REJECTED');
  assertAuthorizedObjectInventory(state.objectInventory, state.inventoryOwner);
  return true;
};

export const getCredentialPreflightFixtureDiagnostics = () => Object.freeze({
  actualOverlayBuilds: operationEvidence.actualOverlayBuilds,
  actualCampaignClones: operationEvidence.actualCampaignClones,
  actualCommittedSourceFixtures: operationEvidence.actualCommittedSourceFixtures,
  actualAdversarialClones: operationEvidence.actualAdversarialClones,
  actualEntryRuns: operationEvidence.actualEntryRuns,
  actualFullIntegrityChecks: operationEvidence.actualFullIntegrityChecks,
  actualObjectInventoryVerifications: operationEvidence.actualObjectInventoryVerifications,
  seedElapsedMs: Object.freeze([...operationEvidence.seedElapsedMs]),
  cloneElapsedMs: Object.freeze([...operationEvidence.cloneElapsedMs]),
  entryElapsedMs: Object.freeze([...operationEvidence.entryElapsedMs]),
});

const PERMITTED_ENVIRONMENT_OVERRIDES = Object.freeze(new Set([
  'GITHUB_ACTOR',
  'PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST',
  'PR_C_CONTROLLED_HUMAN_PREFLIGHT_OUTPUT',
  'PR_C_PREFLIGHT_FIXTURE_MODE',
  'PR_C_PREFLIGHT_HOSTILE_CANARY',
]));
const protectedEnvironmentKey = key => /^(?:PATH|PATHEXT|COMSPEC|SYSTEMROOT|TEMP|TMP|TMPDIR|NODE_OPTIONS|NODE_PATH)$/iu.test(key)
  || /^(?:GIT_|GCM_)/iu.test(key);

export const assertCredentialPreflightEnvironmentOverridesForTest = overrides => {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)
    || Object.getPrototypeOf(overrides) !== Object.prototype) throw new Error('PR_C_PREFLIGHT_FIXTURE_ENVIRONMENT_OVERRIDE_REJECTED');
  for (const [key, value] of Object.entries(overrides)) {
    if (!PERMITTED_ENVIRONMENT_OVERRIDES.has(key) || typeof value !== 'string') {
      throw new Error('PR_C_PREFLIGHT_FIXTURE_ENVIRONMENT_OVERRIDE_REJECTED');
    }
  }
  return true;
};

const embeddedPath = (value, platform) => {
  const normalized = value.replace(/\\+/gu, '/').replace(/\/{2,}/gu, '/');
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
};
const containsEmbeddedRoot = (value, root, platform) => {
  const candidate = embeddedPath(value, platform);
  const excluded = embeddedPath(pathPlatform(platform).resolve(root), platform).replace(/\/$/u, '');
  let offset = candidate.indexOf(excluded);
  while (offset !== -1) {
    const before = offset === 0 ? undefined : candidate[offset - 1];
    const after = candidate[offset + excluded.length];
    const boundary = character => character === undefined || /[\s'"`=;:,()[\]{}\/]/u.test(character);
    if (boundary(before) && boundary(after)) return true;
    offset = candidate.indexOf(excluded, offset + 1);
  }
  return false;
};

export const assertCredentialPreflightEnvironmentReferencesForTest = (environment, excludedRoots, platform = process.platform) => {
  if (!environment || typeof environment !== 'object' || Array.isArray(environment) || !Array.isArray(excludedRoots)
    || excludedRoots.length === 0 || excludedRoots.some(root => typeof root !== 'string' || root.length === 0)
    || !['win32', 'linux', 'darwin'].includes(platform)) {
    throw new Error('PR_C_PREFLIGHT_FIXTURE_CHILD_ENVIRONMENT_REJECTED');
  }
  for (const value of Object.values(environment)) {
    if (typeof value === 'string' && excludedRoots.some(root => containsEmbeddedRoot(value, root, platform))) {
      throw new Error('PR_C_PREFLIGHT_FIXTURE_CHILD_ENVIRONMENT_REJECTED');
    }
  }
  return true;
};

const childExcludedRoots = (fixture, state) => [fixture.sourceRoot, ...(state.seed ? [state.seed.repositoryRoot] : [])];
const assertCredentialPreflightChildEnvironment = (environment, fixture, state) => {
  for (const [key, expected] of Object.entries(fixture.gitEnvironment)) {
    if (environment[key] !== expected) throw new Error('PR_C_PREFLIGHT_FIXTURE_CHILD_ENVIRONMENT_REJECTED');
  }
  for (const key of Object.keys(environment)) {
    if (protectedEnvironmentKey(key)
      && (!Object.hasOwn(fixture.gitEnvironment, key) || environment[key] !== fixture.gitEnvironment[key])) {
      throw new Error('PR_C_PREFLIGHT_FIXTURE_CHILD_ENVIRONMENT_REJECTED');
    }
  }
  const excludedRoots = childExcludedRoots(fixture, state);
  if (sanitizeCredentialPreflightPathForTest(environment.PATH, excludedRoots) !== environment.PATH) {
    throw new Error('PR_C_PREFLIGHT_FIXTURE_CHILD_ENVIRONMENT_REJECTED');
  }
  assertCredentialPreflightEnvironmentReferencesForTest(environment, excludedRoots);
  return true;
};

export async function buildCredentialPreflightEntryEnvironment(fixture, overrides = {}) {
  const state = fixtureAuthority.get(fixture);
  if (!state?.active) throw new Error('PR_C_PREFLIGHT_FIXTURE_AUTHORITY_REJECTED');
  assertCredentialPreflightEnvironmentOverridesForTest(overrides);
  const ref = 'syntheticfixtureonly';
  const origin = `https://${ref}.supabase.co`;
  const databaseRole = `postgres.${ref}`;
  const targetFingerprint = `sha256:${createHash('sha256').update(`fixture-system\0postgres\0${databaseRole}`).digest('hex')}`;
  const publicTargetDigest = sha256(`pr-c-controlled-human-public-target\0${origin}`);
  const exerciseId = '22222222-2222-4222-a222-222222222222';
  const fixtureState = await loadFixture(path.join(fixture.repositoryRoot, 'testing/process-lifecycle/fixtures/delivery-monitor-pr-c/controlled-human-environment.json'));
  const exercise = deriveControlledHumanExerciseBinding({ environmentClass: 'hosted_nonproduction_pilot', prNumber: 264,
    releaseSha: fixture.head, reviewHeadSha: fixture.head, exerciseId, targetFingerprint, publicTargetDigest }, fixtureState);
  const eventPath = path.join(fixture.controlRoot, 'event.json');
  const tracePath = path.join(fixture.controlRoot, 'transport.trace');
  const event = { action: 'labeled', label: { name: 'pr264-controlled-human-credentials-preflight' }, sender: { login: 'APReddy-AutoBotz' }, pull_request: {
    number: 264, state: 'open', head: { sha: fixture.head, ref: BRANCH, repo: { full_name: REPOSITORY } },
    base: { ref: 'main', repo: { full_name: REPOSITORY } } } };
  await writeFile(eventPath, JSON.stringify(event));
  const passwords = Object.fromEntries(fixtureState.personas.map((persona, index) => [persona.key, `fixture-only-${index}-${persona.key}-password`]));
  const environment = {
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
    PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_JSON: JSON.stringify(passwords), PR_C_CONTROLLED_HUMAN_PREFLIGHT_OUTPUT: PREFLIGHT_OUTPUT,
    PR_C_PREFLIGHT_FIXTURE_DATABASE_ROLE: databaseRole, PR_C_PREFLIGHT_FIXTURE_TRACE_PATH: tracePath, ...overrides,
  };
  assertCredentialPreflightChildEnvironment(environment, fixture, state);
  return environment;
}

export function runCredentialPreflightEntry(fixture, env) {
  const state = fixtureAuthority.get(fixture);
  if (!state?.active) throw new Error('PR_C_PREFLIGHT_FIXTURE_AUTHORITY_REJECTED');
  assertCredentialPreflightChildEnvironment(env, fixture, state);
  const entry = path.join(fixture.repositoryRoot, 'scripts/prCControlledHumanCredentialPreflight.mjs');
  const loader = path.join(fixture.repositoryRoot, 'scripts/prCControlledHumanCredentialPreflightEntryLoader.mjs');
  const transport = path.join(fixture.repositoryRoot, 'scripts/prCControlledHumanCredentialPreflightEntryTransport.mjs');
  const started = Date.now();
  const result = spawnSync(process.execPath, ['--no-warnings', '--experimental-loader', pathToFileURL(loader).href, '--import', pathToFileURL(transport).href, entry], {
    cwd: fixture.repositoryRoot, env: { ...env }, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 30_000, windowsHide: true,
  });
  operationEvidence.actualEntryRuns += 1;
  operationEvidence.entryElapsedMs.push(Date.now() - started);
  return result;
}

export async function readCredentialPreflightEntryArtifact(fixture) {
  const state = fixtureAuthority.get(fixture);
  if (!state?.active) throw new Error('PR_C_PREFLIGHT_FIXTURE_AUTHORITY_REJECTED');
  const outputRoot = path.join(fixture.repositoryRoot, PREFLIGHT_OUTPUT);
  const entries = splitLines(git(fixture.repositoryRoot, ['status', '--short', '--untracked-files=all'], fixture.gitEnvironment).stdout);
  if (entries.length !== 0) throw new Error('PR_C_PREFLIGHT_FIXTURE_OUTPUT_NOT_IGNORED');
  const bytes = await readFile(path.join(outputRoot, 'credential-preflight.json'));
  return { outputRoot, report: JSON.parse(bytes.toString('utf8')), bytes };
}
