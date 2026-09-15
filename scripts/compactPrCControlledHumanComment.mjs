import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  canonicalJson,
  sha256Digest,
  validateHumanObservationComment,
} from './prCControlledHumanEvidenceContract.mjs';

export const MAX_CONTROLLED_HUMAN_COMMENT_BYTES = 60_000;
export const MAX_CONTROLLED_HUMAN_INPUT_BYTES = 1_000_000;

function fail(code) { throw new Error(code); }

export function compactControlledHumanComment(payload) {
  validateHumanObservationComment(payload);
  const content = canonicalJson(payload);
  const bytes = Buffer.from(content, 'utf8');
  if (bytes.length > MAX_CONTROLLED_HUMAN_COMMENT_BYTES) fail('PR_C_CH_COMMENT_TRANSPORT_TOO_LARGE');
  return Object.freeze({
    content,
    byteLength: bytes.length,
    digest: sha256Digest(bytes),
    humanRole: payload.humanRole,
  });
}

export async function compactControlledHumanCommentFile(inputPath, outputPath) {
  if (!inputPath || !outputPath || resolve(inputPath) === resolve(outputPath)) fail('PR_C_CH_COMMENT_FILE_ARGUMENTS');
  const input = await readFile(inputPath);
  if (input.length > MAX_CONTROLLED_HUMAN_INPUT_BYTES) fail('PR_C_CH_COMMENT_INPUT_TOO_LARGE');
  let payload;
  try { payload = JSON.parse(input.toString('utf8')); } catch { fail('PR_C_CH_COMMENT_JSON_REJECTED'); }
  const compacted = compactControlledHumanComment(payload);
  await writeFile(outputPath, compacted.content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return compacted;
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 4 || argv[0] !== '--input' || !argv[1] || argv[2] !== '--output' || !argv[3]) {
    fail('usage: compactPrCControlledHumanComment.mjs --input path --output path');
  }
  const result = await compactControlledHumanCommentFile(argv[1], argv[3]);
  process.stdout.write(`${JSON.stringify({ status: 'comment_compacted', humanRole: result.humanRole, byteLength: result.byteLength, digest: result.digest })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : 'PR_C_CH_COMMENT_COMPACTION_FAILED'}\n`);
    process.exitCode = 1;
  });
}
