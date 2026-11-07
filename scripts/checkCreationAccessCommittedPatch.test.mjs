import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptedBase, checkCommittedPatch, immutableEofException } from './checkCreationAccessCommittedPatch.mjs';

test('a clean worktree cannot hide committed whitespace; exact committed diff rejects it', () => {
  const parent = realpathSync(tmpdir());
  const root = mkdtempSync(join(parent, 'avalaos-creation-patch-'));
  const git = args => execFileSync('git', ['-c', `safe.directory=${root}`, '-c', 'core.fsmonitor=false',
    '-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false', '-c', 'user.name=Synthetic test',
    '-c', 'user.email=synthetic@example.invalid', ...args], { cwd: root, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git(['init', '--quiet']); writeFileSync(join(root, 'fixture.txt'), 'baseline\n'); git(['add', 'fixture.txt']); git(['commit', '-qm', 'Synthetic baseline']);
    const base = git(['rev-parse', 'HEAD']);
    writeFileSync(join(root, 'fixture.txt'), 'committed trailing space \n'); git(['add', 'fixture.txt']); git(['commit', '-qm', 'Synthetic whitespace failure']);
    const head = git(['rev-parse', 'HEAD']);
    assert.equal(git(['diff', '--check']), '');
    assert.throws(() => checkCommittedPatch({ root, base, head }), /COMMITTED_WHITESPACE/);
    writeFileSync(join(root, 'fixture.txt'), 'clean committed content\n'); git(['add', 'fixture.txt']); git(['commit', '-qm', 'Synthetic corrected patch']);
    const fixed = git(['rev-parse', 'HEAD']);
    assert.equal(checkCommittedPatch({ root, base, head: fixed }).status, 'passed');
    assert.throws(() => checkCommittedPatch({ root, base, head }), /WRONG_HEAD/);
    assert.throws(() => checkCommittedPatch({ root, base: fixed, head: fixed }), /INVALID_MERGE_BASE/);
  } finally {
    const exact = resolve(root), relation = relative(parent, exact);
    assert(!relation.startsWith('..') && !isAbsolute(relation) && relation.startsWith('avalaos-creation-patch-'));
    rmSync(exact, { recursive: true, force: true });
  }
});

test('untrusted commit syntax is rejected before git, and multiple merge bases fail closed', () => {
  for (const value of ['', 'HEAD', '--help', 'a'.repeat(40) + '; echo PASS']) {
    assert.throws(() => checkCommittedPatch({ base: value, head: 'b'.repeat(40), execute() { assert.fail('git must not run'); } }), /INVALID_COMMIT/);
  }
  const base = 'a'.repeat(40), head = 'b'.repeat(40);
  assert.throws(() => checkCommittedPatch({ base, head, execute(args) {
    if (args[0] === 'rev-parse') return head;
    if (args[0] === 'merge-base') return `${base}\n${'c'.repeat(40)}`;
    return '';
  } }), /INVALID_MERGE_BASE/);
});

test('only the exact immutable migration EOF diagnostic is accepted from the installed AvalaOS release', () => {
  const parent = realpathSync(tmpdir());
  const root = mkdtempSync(join(parent, 'avalaos-creation-eof-'));
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const git = args => execFileSync('git', ['-c', `safe.directory=${root}`, '-c', 'core.fsmonitor=false',
    '-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false', '-c', 'user.name=Synthetic test',
    '-c', 'user.email=synthetic@example.invalid', ...args], { cwd: root, windowsHide: true,
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const source = readFileSync(resolve(repositoryRoot, immutableEofException.path));
  const commonGitDir = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: repositoryRoot,
    windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    assert.equal(immutableEofException.diagnostic,
      `${immutableEofException.path}:${immutableEofException.line}: new blank line at EOF.\n`);
    assert(!immutableEofException.diagnostic.includes('\\'),
      'the pinned diagnostic uses Git forward-slash paths on Windows and Ubuntu runners');
    git(['init', '--quiet']);
    const objectInfo = join(root, '.git', 'objects', 'info');
    mkdirSync(objectInfo, { recursive: true });
    writeFileSync(join(objectInfo, 'alternates'),
      `${resolve(repositoryRoot, commonGitDir, 'objects').replaceAll('\\', '/')}\n`);
    const base = acceptedBase;
    git(['checkout', '-q', '--detach', immutableEofException.installedRelease]);
    const migration = join(root, ...immutableEofException.path.split('/'));
    const exactHead = git(['rev-parse', 'HEAD']);
    const exact = checkCommittedPatch({ root, base, head: exactHead });
    assert.equal(exact.exception, 'exact-immutable-file-eof');
    assert.equal(exact.gitVersion, git(['--version']), 'Git version is evidence only, not the release identity');

    writeFileSync(migration, Buffer.concat([source, Buffer.from('\n')]));
    git(['add', immutableEofException.path]); git(['commit', '-qm', 'Changed immutable bytes']);
    assert.throws(() => checkCommittedPatch({ root, base, head: git(['rev-parse', 'HEAD']) }),
      /COMMITTED_WHITESPACE/, 'changed bytes must fail closed');

    writeFileSync(join(root, 'additional.txt'), 'another committed whitespace error \n');
    git(['add', 'additional.txt']); git(['commit', '-qm', 'Additional whitespace diagnostic']);
    assert.throws(() => checkCommittedPatch({ root, base, head: git(['rev-parse', 'HEAD']) }),
      /COMMITTED_WHITESPACE/, 'multiple diagnostics must fail closed');

    git(['checkout', '-q', '-b', 'alternate-path', base]);
    const alternate = join(root, 'supabase', 'migrations', 'alternate.sql');
    mkdirSync(dirname(alternate), { recursive: true }); writeFileSync(alternate, source);
    git(['add', 'supabase/migrations/alternate.sql']); git(['commit', '-qm', 'Same bytes at another path']);
    assert.throws(() => checkCommittedPatch({ root, base, head: git(['rev-parse', 'HEAD']) }),
      /COMMITTED_WHITESPACE/, 'the same bytes at another path must fail closed');
  } finally {
    const exact = resolve(root), relation = relative(parent, exact);
    assert(!relation.startsWith('..') && !isAbsolute(relation) && relation.startsWith('avalaos-creation-eof-'));
    rmSync(exact, { recursive: true, force: true });
  }
});
