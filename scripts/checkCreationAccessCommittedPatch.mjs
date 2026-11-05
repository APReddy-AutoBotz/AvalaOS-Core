import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const acceptedBase = '5433cad41721355e3ec5a29bc2f87772540c77b5';
export const immutableEofException = Object.freeze({
  installedRelease: 'd23e05c0fdf4d83bf338ece75e117e6845db4e47',
  path: 'supabase/migrations/20261105140002_assessed_planning_studio.sql',
  line: 367,
  diagnostic: 'supabase/migrations/20261105140002_assessed_planning_studio.sql:367: new blank line at EOF.\n',
  gitBlob: '1c8a44b976e931921cb7a2c636e2b2fe5a851b9e',
  sha256: 'e8aba680891ee38eb1094b80dee4cb53d116487596efca73b64af91e1419047f',
});

const errorOutput = (error, key) => {
  const value = error && typeof error === 'object' ? error[key] : undefined;
  return Buffer.isBuffer(value) ? value.toString('utf8') : typeof value === 'string' ? value : '';
};

export function checkCommittedPatch({ root, base, head, execute, readBlob } = {}) {
  if (![base, head].every(value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value))) throw new Error('CREATION_PATCH_INVALID_COMMIT');
  const prefix = ['--no-replace-objects', '-c', 'core.fsmonitor=false', '-c', `safe.directory=${root}`,
    '-c', 'core.whitespace=blank-at-eol,blank-at-eof,space-before-tab'];
  const git = execute ?? (args => execFileSync('git', [...prefix, ...args], { cwd: root, encoding: 'utf8',
    windowsHide: true, timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim());
  const blob = readBlob ?? (spec => execFileSync('git', [...prefix, 'cat-file', 'blob', spec], { cwd: root,
    windowsHide: true, timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] }));
  if (git(['rev-parse', 'HEAD']) !== head) throw new Error('CREATION_PATCH_WRONG_HEAD');
  git(['cat-file', '-e', `${base}^{commit}`]); git(['cat-file', '-e', `${head}^{commit}`]);
  const mergeBase = git(['merge-base', '--all', base, head]);
  if (!/^[a-f0-9]{40}$/.test(mergeBase) || mergeBase === head) throw new Error('CREATION_PATCH_INVALID_MERGE_BASE');
  git(['merge-base', '--is-ancestor', mergeBase, base]); git(['merge-base', '--is-ancestor', mergeBase, head]);
  try { git(['diff', '--check', '--no-ext-diff', '--no-textconv', `${mergeBase}..${head}`, '--']); }
  catch (error) {
    const exception = immutableEofException;
    const exactDiagnostic = errorOutput(error, 'stdout') === exception.diagnostic
      && errorOutput(error, 'stderr') === '' && error?.status === 2 && !error?.signal;
    let exactImmutableBlob = false;
    if (exactDiagnostic) {
      try {
        git(['cat-file', '-e', `${exception.installedRelease}^{commit}`]);
        git(['merge-base', '--is-ancestor', exception.installedRelease, head]);
        const installedBlob = git(['rev-parse', `${exception.installedRelease}:${exception.path}`]);
        const headBlob = git(['rev-parse', `${head}:${exception.path}`]);
        if (installedBlob === exception.gitBlob && headBlob === exception.gitBlob) {
          const installedBytes = blob(`${exception.installedRelease}:${exception.path}`);
          const headBytes = blob(`${head}:${exception.path}`);
          exactImmutableBlob = Buffer.isBuffer(installedBytes) && Buffer.isBuffer(headBytes)
            && createHash('sha256').update(installedBytes).digest('hex') === exception.sha256
            && createHash('sha256').update(headBytes).digest('hex') === exception.sha256;
        }
      } catch { exactImmutableBlob = false; }
    }
    if (!exactImmutableBlob) throw new Error('CREATION_PATCH_COMMITTED_WHITESPACE_REJECTED');
    return { base, head, mergeBase, status: 'passed', exception: 'exact-immutable-file-eof',
      gitVersion: git(['--version']) };
  }
  return { base, head, mergeBase, status: 'passed' };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('CREATION_PATCH_ARGUMENTS_REJECTED');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const result = checkCommittedPatch({ root, base: process.env.CREATION_ACCESS_BASE_SHA ?? acceptedBase,
      head: process.env.CREATION_ACCESS_HEAD_SHA });
    console.log(`Creation access committed patch: ${JSON.stringify(result)}`);
  } catch { console.error('CREATION_ACCESS_COMMITTED_PATCH_REJECTED'); process.exitCode = 1; }
}
