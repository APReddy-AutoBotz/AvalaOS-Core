import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { calculatePrCWorkingTreeDigest, collectChangedPrCFiles } from './transcriptFlowPrCEvidenceScope.mjs';

const git = (root, args) => execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false', '-c', 'user.name=Synthetic Fixture', '-c', 'user.email=fixture@example.invalid', ...args], {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const commitFixture = (root, expectedNames) => {
  // Inspect every test-fixture index before committing, just as the controller
  // does for the real repository. These isolated repositories contain no user data.
  const status = git(root, ['status', '--short']);
  assert.notEqual(status, '');
  assert.deepEqual(git(root, ['diff', '--cached', '--name-only']).split(/\r?\n/u).sort(), [...expectedNames].sort());
  git(root, ['-c', `core.hooksPath=${path.join(root, 'no-hooks')}`, 'commit', '-m', 'Synthetic provenance fixture']);
  return git(root, ['rev-parse', 'HEAD']);
};
const withFixture = async action => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pr264-provenance-net-scope-'));
  try {
    git(root, ['init', '-b', 'synthetic-fixture']);
    await writeFile(path.join(root, 'accepted.txt'), 'accepted baseline\n');
    git(root, ['add', '--', 'accepted.txt']);
    const base = commitFixture(root, ['accepted.txt']);
    await action(root, base);
  } finally {
    const absolute = path.resolve(root);
    assert.equal(path.dirname(absolute), path.resolve(os.tmpdir()));
    assert.ok(path.basename(absolute).startsWith('pr264-provenance-net-scope-'));
    await rm(absolute, { recursive: true, force: true });
  }
};

test('PR-added workflow deletion is a net non-change before staging after staging and after commit', async () => {
  await withFixture(async (root, base) => {
    await writeFile(path.join(root, 'added-phase.yml'), 'name: obsolete synthetic phase\n');
    git(root, ['add', '--', 'added-phase.yml']);
    commitFixture(root, ['added-phase.yml']);
    assert.deepEqual(collectChangedPrCFiles(root, base), ['added-phase.yml']);
    await rm(path.join(root, 'added-phase.yml'));
    assert.deepEqual(collectChangedPrCFiles(root, base), []);
    git(root, ['add', '--', 'added-phase.yml']);
    assert.deepEqual(collectChangedPrCFiles(root, base), []);
    commitFixture(root, ['added-phase.yml']);
    assert.deepEqual(collectChangedPrCFiles(root, base), []);
  });
});

test('accepted source deletion and rename remain fail closed in worktree index and history', async () => {
  for (const operation of ['delete', 'rename']) await withFixture(async (root, base) => {
    if (operation === 'delete') await rm(path.join(root, 'accepted.txt'));
    else await rename(path.join(root, 'accepted.txt'), path.join(root, 'renamed.txt'));
    assert.throws(() => collectChangedPrCFiles(root, base), /PR_C_SCOPED_DELETION_UNSUPPORTED/u);
    git(root, ['add', '--all']);
    assert.throws(() => collectChangedPrCFiles(root, base), /PR_C_SCOPED_DELETION_UNSUPPORTED/u);
    const status = git(root, ['status', '--short']);
    assert.notEqual(status, '');
    // --no-renames makes this fixture's exact staged ownership explicit.
    assert.deepEqual(git(root, ['diff', '--cached', '--no-renames', '--name-only']).split(/\r?\n/u).sort(), operation === 'delete' ? ['accepted.txt'] : ['accepted.txt', 'renamed.txt']);
    git(root, ['-c', `core.hooksPath=${path.join(root, 'no-hooks')}`, 'commit', '-m', 'Synthetic rejected deletion']);
    assert.throws(() => collectChangedPrCFiles(root, base), /PR_C_SCOPED_DELETION_UNSUPPORTED/u);
  });
});

test('net source records working content rather than staged substitution and rejects a non-ancestor base', async () => {
  await withFixture(async (root, base) => {
    await writeFile(path.join(root, 'accepted.txt'), 'staged candidate\n');
    git(root, ['add', '--', 'accepted.txt']);
    await writeFile(path.join(root, 'accepted.txt'), 'actual worktree candidate\n');
    await writeFile(path.join(root, 'new-untracked.txt'), 'untracked governed source\n');
    const files = collectChangedPrCFiles(root, base);
    assert.deepEqual(files, ['accepted.txt', 'new-untracked.txt']);
    const digest = calculatePrCWorkingTreeDigest(root, files);
    await writeFile(path.join(root, 'accepted.txt'), 'different actual candidate\n');
    assert.notEqual(calculatePrCWorkingTreeDigest(root, files), digest);
    assert.equal(await readFile(path.join(root, 'new-untracked.txt'), 'utf8'), 'untracked governed source\n');
    const unrelated = git(root, ['commit-tree', `${base}^{tree}`, '-m', 'Synthetic unrelated root']);
    assert.throws(() => collectChangedPrCFiles(root, unrelated), /PR_C_ACCEPTED_BASE_NOT_ANCESTOR/u);
  });
});
