import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const acceptedBase = '5433cad41721355e3ec5a29bc2f87772540c77b5';
export function checkCommittedPatch({ root, base, head, execute } = {}) {
  if (![base, head].every(value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value))) throw new Error('CREATION_PATCH_INVALID_COMMIT');
  const git = execute ?? (args => execFileSync('git', ['--no-replace-objects', '-c', 'core.fsmonitor=false',
    '-c', `safe.directory=${root}`, '-c', 'core.whitespace=blank-at-eol,blank-at-eof,space-before-tab', ...args],
  { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim());
  if (git(['rev-parse', 'HEAD']) !== head) throw new Error('CREATION_PATCH_WRONG_HEAD');
  git(['cat-file', '-e', `${base}^{commit}`]); git(['cat-file', '-e', `${head}^{commit}`]);
  const mergeBase = git(['merge-base', '--all', base, head]);
  if (!/^[a-f0-9]{40}$/.test(mergeBase) || mergeBase === head) throw new Error('CREATION_PATCH_INVALID_MERGE_BASE');
  git(['merge-base', '--is-ancestor', mergeBase, base]); git(['merge-base', '--is-ancestor', mergeBase, head]);
  try { git(['diff', '--check', '--no-ext-diff', '--no-textconv', `${mergeBase}..${head}`, '--']); }
  catch { throw new Error('CREATION_PATCH_COMMITTED_WHITESPACE_REJECTED'); }
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
