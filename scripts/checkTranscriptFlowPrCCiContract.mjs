import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const read = file => readFileSync(file, 'utf8');
const workflow = read('.github/workflows/transcript-flow-pr-c.yml');
const pkg = JSON.parse(read('package.json'));
const scripts = pkg.scripts || {};

for (const pattern of [
  /permissions:\s*\r?\n\s+contents: read/u,
  /image: postgres:16/u,
  /node-version: '22'/u,
  /fetch-depth: 0/u,
  /PR_C_BASE_SHA: 5433cad41721355e3ec5a29bc2f87772540c77b5/u,
  /PR_C_EXACT_HEAD_SHA/u,
  /git rev-parse HEAD/u,
  /git merge-base/u,
  /npm ci/u,
  /playwright install --with-deps chromium/u,
  /test:transcript-flow:delivery-monitor-evidence-contract/u,
  /runTranscriptFlowPrCEvidence\.mjs/u,
  /test:transcript-flow:delivery-monitor-evidence/u,
  /upload-artifact@v4/u,
  /output\/process-lifecycle-pr-c\//u,
]) assert.match(workflow, pattern);
assert.doesNotMatch(workflow, /continue-on-error/u);

const requiredScripts = [
  'test:transcript-flow:delivery-monitor-domain',
  'test:transcript-flow:delivery-monitor-api',
  'test:transcript-flow:delivery-monitor-client',
  'test:transcript-flow:delivery-monitor-postgres',
  'test:transcript-flow:delivery-monitor-browser',
  'test:transcript-flow:delivery-monitor-a11y',
  'test:transcript-flow:delivery-monitor-performance',
  'test:transcript-flow:delivery-monitor-coverage',
  'test:transcript-flow:delivery-monitor-adversarial',
  'test:transcript-flow:delivery-monitor-evidence-contract',
  'test:transcript-flow:delivery-monitor-evidence',
];
for (const name of requiredScripts) assert.equal(typeof scripts[name], 'string', `missing package script ${name}`);

for (const file of [
  'testing/process-lifecycle/contracts/pr-c-assertion-registry.json',
  'testing/process-lifecycle/contracts/pr-c-assertion-registry.schema.json',
  'testing/process-lifecycle/contracts/pr-c-source-provenance.json',
  'testing/process-lifecycle/fixtures/delivery-monitor-pr-c/fixture-registry.json',
  'testing/process-lifecycle/fixtures/delivery-monitor-pr-c/personas.json',
  'scripts/buildTranscriptFlowPrCRegistry.mjs',
  'scripts/transcriptFlowPrCEvidenceScope.mjs',
  'scripts/transcriptFlowPrCEvidenceContract.mjs',
  'scripts/transcriptFlowPrCEvidenceContract.test.mjs',
  'scripts/runTranscriptFlowPrCEvidence.mjs',
  'scripts/verifyTranscriptFlowPrCEvidence.mjs',
]) assert.equal(existsSync(file), true, `missing PR C CI artifact ${file}`);

const migrations = readdirSync('supabase/migrations').filter(name => name.endsWith('_governed_delivery_monitor_pr_c.sql'));
assert.equal(migrations.length, 1, 'PR C requires exactly one CLI-created migration');
const migrationNames = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();
assert.equal(migrationNames.at(-1), migrations[0], 'PR C migration must be the canonical migration tip');

console.log(`PR C CI contract passed: ${JSON.stringify({ workflow: '.github/workflows/transcript-flow-pr-c.yml', scripts: requiredScripts.length, migration: migrations[0] })}`);
