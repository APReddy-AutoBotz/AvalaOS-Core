import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { loadCanonicalMigrationInventory } from './hostedPilotActivation.mjs';

export const REQUIRED_GATES = Object.freeze([
  'database-preflight', 'migration-chain', 'tenant-adversarial', 'runtime-fail-closed',
  'backup-restore', 'provider-simulation-zero-egress', 'canonical-journey',
  'browser-desktop', 'browser-pixel', 'accessibility-performance',
]);
export const ACTIVATION_PRODUCER_WORKFLOW = '.github/workflows/hosted-pilot-activation-evidence-producer.yml';
export const ACTIVATION_MANIFEST_ARTIFACT = 'hosted-pilot-activation-manifest';
const SHA = /^[0-9a-f]{40}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const RUN_ID = /^[1-9][0-9]{0,19}$/;
const RUN_ATTEMPT = /^[1-9][0-9]{0,9}$/;
const WORKFLOW_PATH = /^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function validateHostedUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('hosted URL must be a credential-free HTTPS origin');
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const loopback = hostname === 'localhost' || hostname.endsWith('.localhost')
    || hostname === '::1' || /^127(?:\.|$)/.test(hostname)
    || /^::ffff:(?:127\.|7f[0-9a-f]{2}:)/i.test(hostname);
  if (loopback || !hostname.includes('.')) throw new Error('hosted URL must identify a non-local hosted target');
  if (url.pathname !== '/' && url.pathname !== '') throw new Error('hosted URL must be an origin without a path');
  return url.origin;
}

export function safeHash(value) {
  if (!value || /postgres(?:ql)?:\/\//i.test(value) || /(?:service[_-]?role|token|secret|password|apikey)/i.test(value)) throw new Error('unsafe fingerprint input');
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function verifyActivationRun(run, expectedHead) {
  if (!RUN_ID.test(run.id ?? '') || !RUN_ATTEMPT.test(run.attempt ?? '')) throw new Error('trusted activation run identity is invalid');
  if (!WORKFLOW_PATH.test(run.workflow ?? '') || !REPOSITORY.test(run.repository ?? '')) throw new Error('trusted activation workflow identity is invalid');
  if (run.workflow !== ACTIVATION_PRODUCER_WORKFLOW || run.head !== expectedHead || run.conclusion !== 'success' || run.event !== 'workflow_dispatch') throw new Error('activation run is not the canonical successful exact-head manual producer workflow');
  return true;
}

export function verifyManifest(manifest, { expectedHead, actualHead, canonicalMigrationDigest, activationRun, expectedDeploymentFingerprint }) {
  if (!SHA.test(expectedHead) || expectedHead !== actualHead) throw new Error('expected release does not equal the checked-out exact head');
  verifyActivationRun(activationRun ?? {}, expectedHead);
  if (manifest.schemaVersion !== 1 || manifest.gitCommit !== expectedHead) throw new Error('manifest is not bound to the exact release');
  if (manifest.environment !== 'hosted_nonproduction_pilot') throw new Error('manifest environment is not hosted non-production pilot');
  for (const field of ['productionAuthorized','liveActivationAuthorized','customerDataAuthorized','customerDataUsed','externalUsersAuthorized','externalUsersUsed','realProviderCallsAuthorized','realProviderCallsUsed'])
    if (manifest[field] !== false) throw new Error(`required non-production stop state is absent: ${field}`);
  if (manifest.hostedNonproductionVerified !== true) throw new Error('required hosted disposition is absent');
  if (!HASH.test(manifest.targetFingerprint ?? '') || !HASH.test(manifest.deploymentTargetFingerprint ?? '') || !HASH.test(manifest.migrationChainHash ?? '')) throw new Error('safe target, deployment and migration hashes are required');
  if (!/^[0-9a-f]{64}$/.test(canonicalMigrationDigest ?? '') || manifest.migrationChainHash !== `sha256:${canonicalMigrationDigest}`) throw new Error('manifest migration chain does not match the checked-out canonical inventory');
  if (!HASH.test(expectedDeploymentFingerprint ?? '') || manifest.deploymentTargetFingerprint !== expectedDeploymentFingerprint) throw new Error('manifest deployment fingerprint does not match the controller-selected tested origin');
  if (!SAFE_ID.test(manifest.deploymentId ?? '') || !SAFE_ID.test(manifest.workflowRunId ?? '')) throw new Error('safe deployment and workflow identities are required');
  if (manifest.workflowRunId !== activationRun.id
    || String(manifest.workflowRunAttempt ?? '') !== activationRun.attempt
    || manifest.workflowPath !== activationRun.workflow
    || manifest.workflowRepository !== activationRun.repository
    || manifest.workflowEvent !== activationRun.event
    || manifest.workflowConclusion !== activationRun.conclusion) throw new Error('manifest workflow identity does not match the controller-selected activation run');
  if ('hostedUrl' in manifest || 'siteId' in manifest || 'projectRef' in manifest) throw new Error('raw hosted target identifiers are prohibited in evidence');
  for (const gate of REQUIRED_GATES) {
    const evidence = manifest.evidence?.[gate];
    if (!evidence || evidence.result !== 'passed' || evidence.gitCommit !== expectedHead
      || evidence.workflowRunId !== activationRun.id
      || String(evidence.workflowRunAttempt ?? '') !== activationRun.attempt
      || evidence.workflowPath !== ACTIVATION_PRODUCER_WORKFLOW
      || evidence.workflowConclusion !== 'success'
      || evidence.environment !== 'hosted_nonproduction_pilot'
      || evidence.targetFingerprint !== manifest.targetFingerprint
      || evidence.deploymentTargetFingerprint !== expectedDeploymentFingerprint
      || !SAFE_ID.test(evidence.resultId ?? '')) throw new Error(`missing or mismatched executed evidence: ${gate}`);
  }
  return true;
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((v, i, all) => v.startsWith('--') ? [v.slice(2), all[i + 1]] : null).filter(Boolean));
  const required = ['manifest', 'expected-head', 'expected-deployment-fingerprint', 'activation-run-id', 'activation-run-attempt', 'activation-workflow', 'activation-repository', 'activation-event', 'activation-head', 'activation-conclusion'];
  if (required.some((name) => !args[name])) throw new Error(`usage: --manifest <path> --expected-head <SHA> ${required.slice(2).map((name) => `--${name} <value>`).join(' ')} [--output <path>]`);
  const actualHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const manifest = JSON.parse(await readFile(args.manifest, 'utf8'));
  const canonical = await loadCanonicalMigrationInventory();
  const activationRun = { id: args['activation-run-id'], attempt: args['activation-run-attempt'], workflow: args['activation-workflow'], repository: args['activation-repository'], event: args['activation-event'], head: args['activation-head'], conclusion: args['activation-conclusion'] };
  verifyManifest(manifest, { expectedHead: args['expected-head'], actualHead, canonicalMigrationDigest: canonical.digest, activationRun, expectedDeploymentFingerprint: args['expected-deployment-fingerprint'] });
  const output = args.output ?? 'artifacts/hosted-pilot/verified-evidence.json';
  await mkdir(new URL('.', pathToFileURL(`${process.cwd()}/${output}`)), { recursive: true });
  await writeFile(output, `${JSON.stringify({ schemaVersion: 1, status: 'hosted_nonproduction_verified', production: 'production_not_authorized', customerData: 'customer_data_not_used', gitCommit: actualHead, activationRunId: activationRun.id, activationRunAttempt: Number(activationRun.attempt), activationWorkflow: activationRun.workflow, activationRepository: activationRun.repository, manifestHash: safeHash(JSON.stringify(manifest)) }, null, 2)}\n`, { mode: 0o600 });
  console.log('Hosted non-production evidence verified for exact head; production remains not authorized.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((error) => { console.error(`HOSTED_EVIDENCE_REJECTED: ${error.message}`); process.exitCode = 1; });
