#!/usr/bin/env node
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { buildAdditiveMigrationPlan, classifyHostedTarget, createPreflightToken, loadCanonicalMigrationInventory } from './hostedPilotActivation.mjs';

const [inventoryPath, tokenPath] = process.argv.slice(2);
if (!inventoryPath || !tokenPath) throw new Error('usage: node scripts/hostedPilotPreflight.mjs <sanitized-inventory.json> <private-token-file>');
const release = process.env.HOSTED_PILOT_EXPECTED_RELEASE_SHA;
const fingerprint = process.env.HOSTED_PILOT_ENVIRONMENT_FINGERPRINT;
const nonce = process.env.HOSTED_PILOT_PREFLIGHT_NONCE;
const signingKey = process.env.HOSTED_PILOT_PREFLIGHT_SIGNING_KEY;
const canonical = await loadCanonicalMigrationInventory();
const classification = classifyHostedTarget(JSON.parse(await readFile(inventoryPath, 'utf8')), canonical);
if (!classification.mutationAllowed) {
  process.stdout.write(`${JSON.stringify({ status: 'blocked', classification: classification.classification, reasons: classification.reasons })}\n`);
  process.exitCode = 2;
} else {
  const plan = buildAdditiveMigrationPlan(classification, canonical);
  const token = createPreflightToken({ classification, canonical, expectedReleaseSha: release, environmentFingerprint: fingerprint, nonce, signingKey });
  await writeFile(tokenPath, `${token}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await chmod(tokenPath, 0o600);
  process.stdout.write(`${JSON.stringify({ status: 'preflight_passed', classification: classification.classification, canonicalDigest: canonical.digest, canonicalTip: canonical.tip, pendingCount: plan.pending.length, privateTokenWritten: true })}\n`);
}
