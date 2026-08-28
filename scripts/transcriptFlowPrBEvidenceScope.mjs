import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const normalizePath = value => value.replaceAll('\\', '/');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const canonicalFileSha256 = file => sha256(readFileSync(file, 'utf8').replace(/\r\n?/gu, '\n'));
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const lines = value => value.split(/\r?\n/gu).map(item => item.trim()).filter(Boolean).map(normalizePath);

export const collectChangedPrBFiles = (root, baseGitSha) => {
  const committed = lines(git(root, ['diff', '--name-only', '--diff-filter=ACMR', `${baseGitSha}...HEAD`]));
  const tracked = lines(git(root, ['diff', '--name-only', '--diff-filter=ACMR']));
  const untracked = lines(git(root, ['ls-files', '--others', '--exclude-standard']));
  return [...new Set([...committed, ...tracked, ...untracked])].sort();
};

export const validatePrBProvenance = (root, baseGitSha, registry, provenance) => {
  if (!/^[0-9a-f]{40}$/u.test(baseGitSha)) throw new Error('PR_B_BASE_SHA_INVALID');
  if (provenance.contractVersion !== 'governed-multisource-studio-pr-b-provenance-1') {
    throw new Error('PR_B_PROVENANCE_VERSION');
  }
  if (provenance.acceptedMainBaseline !== '11e670003a73b0ab5a28650b70afac4b267760f4') {
    throw new Error('PR_B_ACCEPTED_BASELINE');
  }
  const changed = collectChangedPrBFiles(root, baseGitSha);
  const provenancePath = normalizePath(registry.provenancePath);
  const registered = Object.keys(provenance.sourceDigests || {}).sort();
  const expected = [...registered, provenancePath].sort();
  if (JSON.stringify(changed) !== JSON.stringify(expected)) {
    throw new Error(`PR_B_PROVENANCE_FILE_SET:${JSON.stringify({ changed, expected })}`);
  }
  for (const [relative, expectedDigest] of Object.entries(provenance.sourceDigests || {})) {
    const absolute = path.join(root, relative);
    if (!existsSync(absolute)) throw new Error(`PR_B_PROVENANCE_MISSING:${relative}`);
    const actual = `sha256:${canonicalFileSha256(absolute)}`;
    if (actual !== expectedDigest) throw new Error(`PR_B_PROVENANCE_HASH:${relative}`);
  }
  return changed;
};

export const calculatePrBWorkingTreeDigest = (root, changedFiles) => {
  const entries = changedFiles.map(relative => {
    const absolute = path.join(root, relative);
    if (!existsSync(absolute)) throw new Error(`PR_B_SCOPED_FILE_MISSING:${relative}`);
    return [normalizePath(relative), canonicalFileSha256(absolute)];
  });
  return sha256(JSON.stringify(entries));
};
