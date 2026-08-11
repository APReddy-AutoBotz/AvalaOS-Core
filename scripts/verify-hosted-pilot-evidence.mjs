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
const SHA = /^[0-9a-f]{40}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;

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

export function verifyManifest(manifest, { expectedHead, actualHead, canonicalMigrationDigest }) {
  if (!SHA.test(expectedHead) || expectedHead !== actualHead) throw new Error('expected release does not equal the checked-out exact head');
  if (manifest.schemaVersion !== 1 || manifest.gitCommit !== expectedHead) throw new Error('manifest is not bound to the exact release');
  if (manifest.environment !== 'hosted_nonproduction_pilot') throw new Error('manifest environment is not hosted non-production pilot');
  if (manifest.hostedNonproductionVerified !== true || manifest.productionAuthorized !== false || manifest.customerDataUsed !== false) throw new Error('required hosted/prohibition dispositions are absent');
  if (!HASH.test(manifest.targetFingerprint ?? '') || !HASH.test(manifest.deploymentTargetFingerprint ?? '') || !HASH.test(manifest.migrationChainHash ?? '')) throw new Error('safe target, deployment and migration hashes are required');
  if (!/^[0-9a-f]{64}$/.test(canonicalMigrationDigest ?? '') || manifest.migrationChainHash !== `sha256:${canonicalMigrationDigest}`) throw new Error('manifest migration chain does not match the checked-out canonical inventory');
  if (!SAFE_ID.test(manifest.deploymentId ?? '') || !SAFE_ID.test(manifest.workflowRunId ?? '')) throw new Error('safe deployment and workflow identities are required');
  if ('hostedUrl' in manifest || 'siteId' in manifest || 'projectRef' in manifest) throw new Error('raw hosted target identifiers are prohibited in evidence');
  for (const gate of REQUIRED_GATES) {
    const evidence = manifest.evidence?.[gate];
    if (!evidence || evidence.result !== 'passed' || evidence.gitCommit !== expectedHead || evidence.workflowRunId !== manifest.workflowRunId || !SAFE_ID.test(evidence.resultId ?? '')) throw new Error(`missing or mismatched executed evidence: ${gate}`);
  }
  return true;
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((v, i, all) => v.startsWith('--') ? [v.slice(2), all[i + 1]] : null).filter(Boolean));
  if (!args.manifest || !args['expected-head']) throw new Error('usage: --manifest <path> --expected-head <40-char SHA> [--output <path>]');
  const actualHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const manifest = JSON.parse(await readFile(args.manifest, 'utf8'));
  const canonical = await loadCanonicalMigrationInventory();
  verifyManifest(manifest, { expectedHead: args['expected-head'], actualHead, canonicalMigrationDigest: canonical.digest });
  const output = args.output ?? 'artifacts/hosted-pilot/verified-evidence.json';
  await mkdir(new URL('.', pathToFileURL(`${process.cwd()}/${output}`)), { recursive: true });
  await writeFile(output, `${JSON.stringify({ schemaVersion: 1, status: 'hosted_nonproduction_verified', production: 'production_not_authorized', customerData: 'customer_data_not_used', gitCommit: actualHead, manifestHash: safeHash(JSON.stringify(manifest)) }, null, 2)}\n`, { mode: 0o600 });
  console.log('Hosted non-production evidence verified for exact head; production remains not authorized.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((error) => { console.error(`HOSTED_EVIDENCE_REJECTED: ${error.message}`); process.exitCode = 1; });
