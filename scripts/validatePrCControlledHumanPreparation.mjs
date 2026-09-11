import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalDigest, validatePreparationEvidence } from './prCControlledHumanEvidenceContract.mjs';

export async function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.length !== 2 || argv[0] !== '--preparation') throw new Error('PR_C_CH_PREPARATION_VALIDATION_ARGUMENTS');
  const preparation = JSON.parse(await readFile(argv[1], 'utf8'));
  validatePreparationEvidence(preparation);
  if (preparation.exactHead !== env.PR_C_CONTROLLED_HUMAN_RELEASE_SHA
    || preparation.preview.deployId !== env.PR_C_CONTROLLED_HUMAN_DEPLOY_ID
    || preparation.backend.targetFingerprint !== env.PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT
    || preparation.backend.exerciseDigest !== env.PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST
    || String(preparation.backend.concurrencyVersion) !== env.PR_C_CONTROLLED_HUMAN_EXPECTED_VERSION) throw new Error('PR_C_CH_PREPARATION_EXPECTED_BINDING');
  process.stdout.write(`${JSON.stringify({ status: 'validated', preparationDigest: canonicalDigest(preparation), exactHead: preparation.exactHead })}\n`);
  return preparation;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  main().catch(error => {
    process.stderr.write(`PR_C_CONTROLLED_HUMAN_PREPARATION_VALIDATION_REJECTED: ${error.message}\n`);
    process.exitCode = 1;
  });
}
