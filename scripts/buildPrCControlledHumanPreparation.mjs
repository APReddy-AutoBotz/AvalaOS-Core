import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildPreparationEvidence,
  ENVIRONMENT,
  PREVIEW_ORIGIN,
  PR_NUMBER,
} from './prCControlledHumanEvidenceContract.mjs';

const parseArgs = argv => {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!flag?.startsWith('--') || argv[index + 1] === undefined) throw new Error('PR_C_CH_ARGUMENTS');
    values[flag.slice(2)] = argv[index + 1];
  }
  return values;
};

const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const writeExclusiveJson = async (file, value) => {
  const resolved = path.resolve(file);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
};

export const verifyPr264DeployPreview = async ({ exactHead, deployId, fetchImpl = fetch }) => {
  if (!/^[0-9a-f]{40}$/u.test(exactHead ?? '')) throw new Error('PR_C_CH_PREVIEW_HEAD');
  if (!/^[0-9a-f]{24}$/u.test(deployId ?? '')) throw new Error('PR_C_CH_PREVIEW_DEPLOY_ID');
  const response = await fetchImpl(PREVIEW_ORIGIN, {
    redirect: 'error',
    headers: { Accept: 'text/html', 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('PR_C_CH_PREVIEW_RESPONSE');
  if (response.headers.get('x-avalaos-release') !== exactHead
    || response.headers.get('x-avalaos-environment') !== ENVIRONMENT
    || response.headers.get('x-avalaos-netlify-deploy-id') !== deployId) throw new Error('PR_C_CH_PREVIEW_HEADERS');
  const body = await response.text();
  if (!body.includes('<div id="root"></div>') || /service[_-]?role|database[_-]?url|production[_-]?authorized/iu.test(body)) throw new Error('PR_C_CH_PREVIEW_BODY');
  return { origin: PREVIEW_ORIGIN, deployId, releaseSha: exactHead, context: 'deploy-preview', reviewId: PR_NUMBER, siteName: 'avalaos-pilot', environment: ENVIRONMENT };
};

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const required = ['preflight', 'plan', 'apply', 'verify', 'edge-deployment', 'output'];
  if (required.some(key => !args[key])) throw new Error('PR_C_CH_PREPARATION_ARGUMENTS');
  const exactHead = env.PR_C_CONTROLLED_HUMAN_RELEASE_SHA;
  const github = {
    workflowPath: env.PR_C_CONTROLLED_HUMAN_CI_WORKFLOW,
    runId: env.PR_C_CONTROLLED_HUMAN_CI_RUN_ID,
    runAttempt: Number(env.PR_C_CONTROLLED_HUMAN_CI_RUN_ATTEMPT),
    conclusion: env.PR_C_CONTROLLED_HUMAN_CI_CONCLUSION,
    artifactName: env.PR_C_CONTROLLED_HUMAN_CI_ARTIFACT_NAME,
    artifactDigest: env.PR_C_CONTROLLED_HUMAN_CI_ARTIFACT_DIGEST,
  };
  const preview = await verifyPr264DeployPreview({ exactHead, deployId: env.PR_C_CONTROLLED_HUMAN_DEPLOY_ID });
  const preparation = buildPreparationEvidence({
    root: path.resolve(args.root ?? '.'),
    exactHead,
    github,
    preview,
    controllerRecords: await Promise.all(['preflight', 'plan', 'apply', 'verify'].map(key => readJson(args[key]))),
    edgeDeployment: await readJson(args['edge-deployment']),
    edgeProducer: {
      workflowPath: env.PR_C_CONTROLLED_HUMAN_EDGE_WORKFLOW,
      event: 'pull_request',
      runId: env.PR_C_CONTROLLED_HUMAN_EDGE_RUN_ID,
      runAttempt: Number(env.PR_C_CONTROLLED_HUMAN_EDGE_RUN_ATTEMPT),
      conclusion: 'success',
      artifactName: env.PR_C_CONTROLLED_HUMAN_EDGE_ARTIFACT_NAME,
    },
    edgeSigningKey: env.PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY,
    edgeArtifactDigest: env.PR_C_CONTROLLED_HUMAN_EDGE_ARTIFACT_DIGEST,
    createdAt: env.PR_C_CONTROLLED_HUMAN_CREATED_AT,
  });
  await writeExclusiveJson(args.output, preparation);
  process.stdout.write(`${JSON.stringify({ status: preparation.status, exactHead: preparation.exactHead, preparationDigest: (await import('./prCControlledHumanEvidenceContract.mjs')).canonicalDigest(preparation) })}\n`);
  return preparation;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  main().catch(error => {
    process.stderr.write(`PR_C_CONTROLLED_HUMAN_PREPARATION_REJECTED: ${error.message}\n`);
    process.exitCode = 1;
  });
}
