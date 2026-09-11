import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyPr264DeployPreview } from './buildPrCControlledHumanPreparation.mjs';

export async function main(env = process.env) {
  const result = await verifyPr264DeployPreview({
    exactHead: env.PR_C_CONTROLLED_HUMAN_RELEASE_SHA,
    deployId: env.PR_C_CONTROLLED_HUMAN_DEPLOY_ID,
  });
  process.stdout.write(`${JSON.stringify({ status: 'verified_exact_preview', releaseSha: result.releaseSha, deployId: result.deployId, environment: result.environment })}\n`);
  return result;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  main().catch(error => {
    process.stderr.write(`PR_C_CONTROLLED_HUMAN_PREVIEW_REJECTED: ${error.message}\n`);
    process.exitCode = 1;
  });
}
