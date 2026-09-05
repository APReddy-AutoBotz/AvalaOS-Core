import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildVerifiedHumanSession, canonicalDigest, controlledHumanEvidenceDisposition } from './prCControlledHumanEvidenceContract.mjs';

const parseArgs = argv => {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith('--') || argv[index + 1] === undefined) throw new Error('PR_C_CH_ARGUMENTS');
    values[argv[index].slice(2)] = argv[index + 1];
  }
  return values;
};

const readJson = async file => JSON.parse(await readFile(file, 'utf8'));

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const required = ['preparation', 'requester', 'reviewer', 'approver', 'quiesce', 'deprovision', 'post-deprovision', 'output'];
  if (required.some(key => !args[key])) throw new Error('PR_C_CH_SESSION_ARGUMENTS');
  const preparation = await readJson(args.preparation);
  const session = buildVerifiedHumanSession({
    preparation,
    checkpoints: await Promise.all(['requester', 'reviewer', 'approver'].map(role => readJson(args[role]))),
    quiesceRecord: await readJson(args.quiesce),
    deprovisionRecord: await readJson(args.deprovision),
    postDeprovisionRecord: await readJson(args['post-deprovision']),
    signingKey: env.PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY,
    defectHistory: args['defect-history'] ? await readJson(args['defect-history']) : [],
    completedAt: env.PR_C_CONTROLLED_HUMAN_COMPLETED_AT,
  });
  const disposition = controlledHumanEvidenceDisposition(session);
  const output = path.resolve(args.output);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(session, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ ...disposition, sessionDigest: canonicalDigest(session) })}\n`);
  return session;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  main().catch(error => {
    process.stderr.write(`PR_C_CONTROLLED_HUMAN_SESSION_REJECTED: ${error.message}\n`);
    process.exitCode = 1;
  });
}
