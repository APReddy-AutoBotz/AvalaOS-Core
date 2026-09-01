import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const PR_C_BASE_SHA = '5433cad41721355e3ec5a29bc2f87772540c77b5';
export const PR_C_WORKFLOW_PATH = '.github/workflows/transcript-flow-pr-c.yml';

const normalizePath = value => value.replaceAll('\\', '/');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const lines = value => value.split(/\r?\n/gu).map(item => item.trim()).filter(Boolean).map(normalizePath);
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

export const canonicalFileSha256 = file => sha256(readFileSync(file, 'utf8').replace(/\r\n?/gu, '\n'));

export const collectChangedPrCFiles = (root, baseGitSha = PR_C_BASE_SHA) => {
  const committed = lines(git(root, ['diff', '--name-only', '--diff-filter=ACMR', `${baseGitSha}...HEAD`]));
  const tracked = lines(git(root, ['diff', '--name-only', '--diff-filter=ACMR']));
  const staged = lines(git(root, ['diff', '--cached', '--name-only', '--diff-filter=ACMR']));
  const untracked = lines(git(root, ['ls-files', '--others', '--exclude-standard']));
  return [...new Set([...committed, ...tracked, ...staged, ...untracked])]
    .filter(relative => !relative.startsWith('output/') && !relative.startsWith('.agent/'))
    .sort();
};

export const calculatePrCWorkingTreeDigest = (root, changedFiles) => {
  const entries = changedFiles.map(relative => {
    const absolute = path.join(root, relative);
    if (!existsSync(absolute)) throw new Error(`PR_C_SCOPED_FILE_MISSING:${relative}`);
    return [normalizePath(relative), canonicalFileSha256(absolute)];
  });
  return sha256(JSON.stringify(entries));
};

export const validatePrCProvenance = (root, registry, provenance) => {
  if (provenance.contractVersion !== 'governed-delivery-monitor-pr-c-provenance-1') {
    throw new Error('PR_C_PROVENANCE_VERSION');
  }
  if (provenance.acceptedMainBaseline !== PR_C_BASE_SHA) throw new Error('PR_C_ACCEPTED_BASELINE');
  if (registry.workflowPath !== PR_C_WORKFLOW_PATH) throw new Error('PR_C_WORKFLOW_PATH');
  const changed = collectChangedPrCFiles(root);
  const provenancePath = normalizePath(registry.provenancePath);
  const registered = Object.keys(provenance.sourceDigests || {}).sort();
  const expected = [...registered, provenancePath].sort();
  if (JSON.stringify(changed) !== JSON.stringify(expected)) {
    throw new Error(`PR_C_PROVENANCE_FILE_SET:${JSON.stringify({ changed, expected })}`);
  }
  for (const [relative, digest] of Object.entries(provenance.sourceDigests || {})) {
    const absolute = path.join(root, relative);
    if (!existsSync(absolute)) throw new Error(`PR_C_PROVENANCE_MISSING:${relative}`);
    const actual = `sha256:${canonicalFileSha256(absolute)}`;
    if (actual !== digest) throw new Error(`PR_C_PROVENANCE_HASH:${relative}`);
  }
  return changed;
};
