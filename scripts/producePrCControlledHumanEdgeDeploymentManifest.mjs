import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalDigest, createEdgeDeploymentManifest, EDGE_DEPLOY_WORKFLOW, REQUIRED_EDGE_FUNCTIONS, sha256Digest } from './prCControlledHumanEvidenceContract.mjs';

const writeExclusive = async (file, value) => {
  const output = path.resolve(file);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return output;
};

const apiInventory = async (env, fetchImpl = fetch) => {
  if (!/^[a-z0-9]{20}$/u.test(env.SUPABASE_PROJECT_REF ?? '') || typeof env.SUPABASE_ACCESS_TOKEN !== 'string' || env.SUPABASE_ACCESS_TOKEN.length < 20) throw new Error('PR_C_CH_EDGE_PROVIDER_AUTHORITY');
  const response = await fetchImpl(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/functions`, {
    redirect: 'error', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('PR_C_CH_EDGE_PROVIDER_INVENTORY');
  }
  const records = await response.json();
  if (!Array.isArray(records)) throw new Error('PR_C_CH_EDGE_PROVIDER_INVENTORY');
  return records;
};

const providerRecord = (record, name) => {
  if (!record || record.slug !== name || record.status !== 'ACTIVE' || !Number.isSafeInteger(record.version) || record.version <= 0
    || typeof record.id !== 'string' || !record.id || typeof record.ezbr_sha256 !== 'string' || record.ezbr_sha256.length < 16
    || record.updated_at === undefined || record.updated_at === null) throw new Error(`PR_C_CH_EDGE_PROVIDER_RECORD:${name}`);
  return {
    name, version: record.version,
    identityDigest: sha256Digest(`provider-function\0${name}\0${record.id}`),
    bundleDigest: sha256Digest(`provider-bundle\0${name}\0${record.ezbr_sha256}`),
    updatedAtDigest: sha256Digest(`provider-updated\0${name}\0${String(record.updated_at)}`),
  };
};

export const captureProviderBaseline = async (env, fetchImpl = fetch) => {
  const inventory = await apiInventory(env, fetchImpl);
  return {
    schemaVersion: 'pr-c-controlled-human-edge-provider-baseline-1',
    observedAt: new Date().toISOString(),
    functions: REQUIRED_EDGE_FUNCTIONS.map(name => {
      const record = inventory.find(item => item?.slug === name);
      return record ? providerRecord(record, name) : {
        name, version: 0,
        identityDigest: sha256Digest(`provider-function-absent\0${name}`),
        bundleDigest: sha256Digest(`provider-bundle-absent\0${name}`),
        updatedAtDigest: sha256Digest(`provider-updated-absent\0${name}`),
      };
    }),
  };
};

export const captureProviderDeployment = async ({ env, baseline, fetchImpl = fetch }) => {
  if (baseline?.schemaVersion !== 'pr-c-controlled-human-edge-provider-baseline-1' || !Array.isArray(baseline.functions)) throw new Error('PR_C_CH_EDGE_PROVIDER_BASELINE');
  const inventory = await apiInventory(env, fetchImpl);
  const observedAt = new Date().toISOString();
  const functions = [];
  for (const name of REQUIRED_EDGE_FUNCTIONS) {
    const current = providerRecord(inventory.find(item => item?.slug === name), name);
    const before = baseline.functions.find(item => item?.name === name);
    if (!before || !(current.version > before.version || current.bundleDigest !== before.bundleDigest || current.updatedAtDigest !== before.updatedAtDigest)) throw new Error(`PR_C_CH_EDGE_STALE_DEPLOYMENT:${name}`);
    const runtime = await fetchImpl(`https://${env.SUPABASE_PROJECT_REF}.supabase.co/functions/v1/${name}`, { method: 'GET', redirect: 'error', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    const runtimeStatus = runtime.status;
    await runtime.body?.cancel();
    if (runtimeStatus < 200 || runtimeStatus >= 500 || runtimeStatus === 404) throw new Error(`PR_C_CH_EDGE_RUNTIME_ATTESTATION:${name}`);
    functions.push({
      ...current,
      deploymentReceiptDigest: canonicalDigest({ name, beforeVersion: before.version, afterVersion: current.version, identityDigest: current.identityDigest, bundleDigest: current.bundleDigest, updatedAtDigest: current.updatedAtDigest, observedAt }),
      runtimeStatus, observedAt,
    });
  }
  return functions;
};

export async function main(argv = process.argv.slice(2), env = process.env, fetchImpl = fetch) {
  if (env.GITHUB_EVENT_NAME !== 'pull_request' || env.PR_C_CONTROLLED_HUMAN_EDGE_WORKFLOW_PATH !== EDGE_DEPLOY_WORKFLOW) throw new Error('PR_C_CH_EDGE_PRODUCER_WORKFLOW');
  if (argv.length === 2 && argv[0] === '--provider-baseline') {
    const baseline = await captureProviderBaseline(env, fetchImpl);
    await writeExclusive(argv[1], baseline);
    process.stdout.write(`${JSON.stringify({ status: 'provider_baseline_captured', baselineDigest: canonicalDigest(baseline) })}\n`);
    return baseline;
  }
  if (argv.length !== 12 || argv[0] !== '--migration-preflight' || argv[2] !== '--migration-apply' || argv[4] !== '--migration-verify' || argv[6] !== '--preflight' || argv[8] !== '--provider-baseline' || argv[10] !== '--output') throw new Error('PR_C_CH_EDGE_PRODUCER_ARGUMENTS');
  const migrationRecords = await Promise.all([argv[1], argv[3], argv[5]].map(async file => JSON.parse(await readFile(file, 'utf8'))));
  const preflight = JSON.parse(await readFile(argv[7], 'utf8'));
  if (preflight.contractVersion !== 'pr-c-controlled-human-controller-1' || preflight.phase !== 'preflight' || preflight.status !== 'passed'
    || preflight.environmentClass !== 'hosted_nonproduction_pilot' || preflight.prNumber !== 264 || preflight.releaseSha !== env.PR_C_CONTROLLED_HUMAN_RELEASE_SHA
    || preflight.reviewHeadSha !== env.PR_C_CONTROLLED_HUMAN_RELEASE_SHA || preflight.deployId !== env.PR_C_CONTROLLED_HUMAN_DEPLOY_ID
    || preflight.deployOrigin !== 'https://deploy-preview-264--avalaos-pilot.netlify.app' || preflight.exerciseDigest !== env.PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST
    || preflight.targetFingerprint !== env.PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT || preflight.productionAuthorized !== false
    || preflight.customerDataAuthorized !== false || preflight.realProviderCallsAuthorized !== false || preflight.unexpectedDataCount !== 0
    || preflight.providerRowCount !== 0) throw new Error('PR_C_CH_EDGE_PREFLIGHT_BINDING');
  const providerObservation = await captureProviderDeployment({ env, baseline: JSON.parse(await readFile(argv[9], 'utf8')), fetchImpl });
  const manifest = createEdgeDeploymentManifest({
    root: path.resolve('.'), exactHead: env.PR_C_CONTROLLED_HUMAN_RELEASE_SHA, targetFingerprint: env.PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT,
    exerciseDigest: env.PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST, deployId: env.PR_C_CONTROLLED_HUMAN_DEPLOY_ID,
    personaManifestDigest: preflight.personaManifestDigest, fixtureManifestDigest: preflight.fixtureManifestDigest, migrationRecords, providerObservation,
    producer: { workflowPath: EDGE_DEPLOY_WORKFLOW, event: 'pull_request', runId: env.GITHUB_RUN_ID, runAttempt: Number(env.GITHUB_RUN_ATTEMPT), conclusion: 'success', artifactName: `pr264-controlled-human-edge-deployment-${env.PR_C_CONTROLLED_HUMAN_RELEASE_SHA}-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}` },
    signingKey: env.PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY,
  });
  await writeExclusive(argv[11], manifest);
  process.stdout.write(`${JSON.stringify({ status: 'provider_attested_runtime_reachable', manifestDigest: canonicalDigest(manifest), functionCount: manifest.functions.length })}\n`);
  return manifest;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  main().catch(error => {
    process.stderr.write(`PR_C_CONTROLLED_HUMAN_EDGE_MANIFEST_REJECTED: ${error.message}\n`);
    process.exitCode = 1;
  });
}
