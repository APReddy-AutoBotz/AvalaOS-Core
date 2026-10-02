import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildHumanObservationTemplate, canonicalDigest, validatePreparationEvidence } from './prCControlledHumanEvidenceContract.mjs';

export function buildBoundHumanObservationTemplates(preparation, env) {
  validatePreparationEvidence(preparation);
  if (preparation.exactHead !== env.PR_C_CONTROLLED_HUMAN_RELEASE_SHA
    || preparation.backend.exerciseDigest !== env.PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST) throw new Error('PR_C_CH_TEMPLATE_PREPARATION_BINDING');
  return ['requester', 'reviewer', 'approver'].map(humanRole => ({
    kind: 'pr264-controlled-human-observation',
    humanRole,
    exactHead: preparation.exactHead,
    preparationDigest: canonicalDigest(preparation),
    exerciseDigest: preparation.backend.exerciseDigest,
    observations: buildHumanObservationTemplate(humanRole),
  }));
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.length !== 4 || argv[0] !== '--preparation' || !argv[1] || argv[2] !== '--output-directory' || !argv[3]) throw new Error('PR_C_CH_TEMPLATE_ARGUMENTS');
  const templates = buildBoundHumanObservationTemplates(JSON.parse(await readFile(argv[1], 'utf8')), env);
  const outputDirectory = path.resolve(argv[3]);
  await mkdir(outputDirectory, { recursive: true });
  for (const template of templates) {
    await writeFile(path.join(outputDirectory, `${template.humanRole}-observations.json`), `${JSON.stringify(template, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  }
  process.stdout.write(`${JSON.stringify({ status: 'templates_written', roles: 3 })}\n`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  main().catch(() => {
    process.stderr.write('PR_C_CONTROLLED_HUMAN_TEMPLATE_REJECTED\n');
    process.exitCode = 1;
  });
}
