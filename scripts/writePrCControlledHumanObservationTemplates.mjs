import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildHumanObservationTemplate } from './prCControlledHumanEvidenceContract.mjs';

export async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 2 || argv[0] !== '--output-directory') throw new Error('PR_C_CH_TEMPLATE_ARGUMENTS');
  const outputDirectory = path.resolve(argv[1]);
  await mkdir(outputDirectory, { recursive: true });
  for (const role of ['requester', 'reviewer', 'approver']) {
    await writeFile(path.join(outputDirectory, `${role}-observations.json`), `${JSON.stringify(buildHumanObservationTemplate(role), null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  }
  process.stdout.write(`${JSON.stringify({ status: 'templates_written', roles: 3 })}\n`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  main().catch(error => {
    process.stderr.write(`PR_C_CONTROLLED_HUMAN_TEMPLATE_REJECTED: ${error.message}\n`);
    process.exitCode = 1;
  });
}
