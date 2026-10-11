import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const failure = (classification, trackedCount, untrackedCount) => new Error(
  `AUTHENTICATED_HOSTED_RUNNER_CHECKOUT_NOT_EXACT_CLEAN_RELEASE_${classification}`
    + `_TRACKED_${trackedCount}_UNTRACKED_${untrackedCount}`,
);

export async function verifyAuthenticatedHostedCheckoutState(expectedHead, {
  root = process.cwd(),
  git = execFileAsync,
} = {}) {
  let head;
  let status;
  try {
    [head, status] = await Promise.all([
      git('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }),
      git('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }),
    ]);
  } catch {
    throw failure('GIT_INSPECTION_REJECTED', 0, 0);
  }
  if (typeof head?.stdout !== 'string' || typeof status?.stdout !== 'string') {
    throw failure('GIT_INSPECTION_REJECTED', 0, 0);
  }
  const entries = status.stdout.split(/\r?\n/u).filter(Boolean);
  const untrackedCount = entries.filter(entry => entry.startsWith('?? ')).length;
  const trackedCount = entries.length - untrackedCount;
  let classification = 'CLEAN';
  if (!/^[0-9a-f]{40}$/u.test(expectedHead) || head.stdout.trim() !== expectedHead) classification = 'HEAD_MISMATCH';
  else if (trackedCount && untrackedCount) classification = 'MIXED_DIRTY';
  else if (trackedCount) classification = 'TRACKED_DIRTY';
  else if (untrackedCount) classification = 'UNTRACKED_DIRTY';
  if (classification !== 'CLEAN') throw failure(classification, trackedCount, untrackedCount);
  return { classification, trackedCount, untrackedCount };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  try {
    const result = await verifyAuthenticatedHostedCheckoutState(process.env.RELEASE_SHA);
    console.log(`AUTHENTICATED_HOSTED_CHECKOUT_${result.classification}`
      + `_TRACKED_${result.trackedCount}_UNTRACKED_${result.untrackedCount}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message
      : 'AUTHENTICATED_HOSTED_RUNNER_CHECKOUT_NOT_EXACT_CLEAN_RELEASE_GIT_INSPECTION_REJECTED_TRACKED_0_UNTRACKED_0');
    process.exitCode = 1;
  }
}
