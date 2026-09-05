import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalDigest, createHumanCheckpoint } from './prCControlledHumanEvidenceContract.mjs';

const parseArgs = argv => {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith('--') || argv[index + 1] === undefined) throw new Error('PR_C_CH_ARGUMENTS');
    values[argv[index].slice(2)] = argv[index + 1];
  }
  return values;
};

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  if (!args.preparation || !args.quiesce || !args.comment || !args.observer || !args.output) throw new Error('PR_C_CH_CHECKPOINT_ARGUMENTS');
  if (env.GITHUB_EVENT_NAME !== 'pull_request' || env.PR_C_CONTROLLED_HUMAN_CAPTURE_WORKFLOW !== '.github/workflows/pr264-controlled-human-checkpoint.yml') throw new Error('PR_C_CH_CHECKPOINT_WORKFLOW');
  const preparation = JSON.parse(await readFile(args.preparation, 'utf8'));
  const quiesceRecord = JSON.parse(await readFile(args.quiesce, 'utf8'));
  const comment = JSON.parse(await readFile(args.comment, 'utf8'));
  const serverObserver = JSON.parse(await readFile(args.observer, 'utf8'));
  if (!comment || comment.kind !== 'pr264-controlled-human-observation' || !['requester', 'reviewer', 'approver'].includes(comment.humanRole)
    || comment.exactHead !== preparation.exactHead || comment.preparationDigest !== canonicalDigest(preparation)
    || comment.exerciseDigest !== preparation.backend.exerciseDigest || typeof comment.actor !== 'string' || !comment.actor) throw new Error('PR_C_CH_COMMENT_BINDING');
  const checkpoint = createHumanCheckpoint({
    preparation,
    quiesceRecord,
    humanRole: comment.humanRole,
    actor: comment.actor,
    comment: { commentId: comment.commentId, createdAt: comment.createdAt, updatedAt: comment.updatedAt },
    workflowRunId: env.GITHUB_RUN_ID,
    workflowRunAttempt: Number(env.GITHUB_RUN_ATTEMPT),
    observations: comment.observations,
    serverObserver,
    signingKey: env.PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY,
    capturedAt: env.PR_C_CONTROLLED_HUMAN_CAPTURED_AT,
  });
  const output = path.resolve(args.output);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(checkpoint, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ status: checkpoint.status, humanRole: checkpoint.humanRole, checkpointDigest: canonicalDigest(checkpoint) })}\n`);
  return checkpoint;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  main().catch(error => {
    process.stderr.write(`PR_C_CONTROLLED_HUMAN_CHECKPOINT_REJECTED: ${error.message}\n`);
    process.exitCode = 1;
  });
}
