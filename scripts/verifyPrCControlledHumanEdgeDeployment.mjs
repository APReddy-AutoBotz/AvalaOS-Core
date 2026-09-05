import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalDigest, validateEdgeDeploymentManifest } from './prCControlledHumanEvidenceContract.mjs';

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
  if (!args.input || !args.output) throw new Error('PR_C_CH_EDGE_ARGUMENTS');
  const manifest = JSON.parse(await readFile(args.input, 'utf8'));
  validateEdgeDeploymentManifest(manifest, {
    root: path.resolve(args.root ?? '.'),
    exactHead: env.PR_C_CONTROLLED_HUMAN_RELEASE_SHA,
    targetFingerprint: env.PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT,
    exerciseDigest: env.PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST,
    producer: {
      workflowPath: env.PR_C_CONTROLLED_HUMAN_EDGE_WORKFLOW,
      event: 'pull_request',
      runId: env.PR_C_CONTROLLED_HUMAN_EDGE_RUN_ID,
      runAttempt: Number(env.PR_C_CONTROLLED_HUMAN_EDGE_RUN_ATTEMPT),
      conclusion: 'success',
      artifactName: env.PR_C_CONTROLLED_HUMAN_EDGE_ARTIFACT_NAME,
    },
    signingKey: env.PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY,
  });
  const output = path.resolve(args.output);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ status: 'verified_exact_source', manifestDigest: canonicalDigest(manifest), functionCount: manifest.functions.length })}\n`);
  return manifest;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  main().catch(error => {
    process.stderr.write(`PR_C_CONTROLLED_HUMAN_EDGE_DEPLOYMENT_REJECTED: ${error.message}\n`);
    process.exitCode = 1;
  });
}
