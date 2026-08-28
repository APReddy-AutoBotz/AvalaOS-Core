import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { EXPECTED_COMMANDS } from './transcriptFlowPrBEvidenceContract.mjs';

const root = process.cwd();
const read = relative => readFileSync(path.join(root, relative), 'utf8').replace(/\r\n?/gu, '\n');
const packageJson = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/transcript-flow-pr-b.yml');
const dedicatedBrowser = read('playwright.studio-pr-b.config.ts');
const dedicatedBrowserServer = read('tests/browser/studioPrB/server.mjs');
const genericBrowser = read('playwright.config.ts');
const migration = read('supabase/migrations/20260828120000_governed_multisource_studio_pr_b.sql');

const focusedScripts = {
  'test:transcript-flow:studio-domain': true,
  'test:transcript-flow:studio-api': true,
  'test:transcript-flow:studio-provider': true,
  'test:transcript-flow:studio-client': true,
  'test:transcript-flow:studio-postgres': true,
  'test:transcript-flow:studio-browser': true,
  'test:transcript-flow:studio-a11y': true,
  'test:transcript-flow:studio-performance': true,
  'test:transcript-flow:studio-coverage': true,
  'test:transcript-flow:studio-adversarial': true,
  'test:transcript-flow:studio-evidence-contract': true,
  'test:transcript-flow:studio-evidence': true,
};
for (const name of Object.keys(focusedScripts)) assert.ok(packageJson.scripts?.[name], `PR_B_PACKAGE_SCRIPT_MISSING:${name}`);
for (const { command } of EXPECTED_COMMANDS) {
  const match = /^npm (?:run )?([^ ]+)/u.exec(command);
  if (match && match[1] !== 'audit' && match[1] !== 'test') assert.ok(packageJson.scripts?.[match[1]], `PR_B_REGISTERED_SCRIPT_MISSING:${match[1]}`);
}

for (const required of [
  'name: Governed multi-source transcript Studio PR B',
  'pull_request:',
  'workflow_dispatch:',
  'contents: read',
  'image: postgres:16',
  "node-version: '22'",
  'PR_B_BASE_SHA: 11e670003a73b0ab5a28650b70afac4b267760f4',
  'ref: ${{ github.event.pull_request.head.sha || github.sha }}',
  'fetch-depth: 0',
  'test "$(git rev-parse HEAD)" = "$PR_B_EXACT_HEAD_SHA"',
  'npx playwright install --with-deps chromium',
  'npm run test:transcript-flow:studio-evidence-contract',
  'node scripts/runTranscriptFlowPrBEvidence.mjs',
  'npm run test:transcript-flow:studio-evidence',
  'path: output/process-lifecycle-pr-b/',
  'if-no-files-found: error',
]) assert.ok(workflow.includes(required), `PR_B_WORKFLOW_REQUIRED:${required}`);
assert.doesNotMatch(workflow, /continue-on-error\s*:\s*true/iu, 'PR_B_WORKFLOW_CONTINUE_ON_ERROR');
assert.doesNotMatch(workflow, /permissions:\s*write-all/iu, 'PR_B_WORKFLOW_WRITE_PERMISSION');

for (const required of [
  "testDir:'./tests/browser/studioPrB'",
  "testMatch:'studioPrB.spec.ts'",
  'workers:1',
  'fullyParallel:false',
  "devices['Desktop Chrome']",
  "devices['Pixel 7']",
  "command:'node tests/browser/studioPrB/server.mjs'",
  "baseURL:'http://127.0.0.1:4197'",
  'reuseExistingServer:false',
]) assert.ok(dedicatedBrowser.replace(/\s+/gu, '').includes(required.replace(/\s+/gu, '')), `PR_B_BROWSER_CONFIG_REQUIRED:${required}`);
for (const required of [
  "host: '127.0.0.1'",
  'port: 4197',
  'strictPort: true',
]) assert.ok(dedicatedBrowserServer.includes(required), `PR_B_BROWSER_SERVER_REQUIRED:${required}`);
assert.ok(genericBrowser.includes('studioPrB/studioPrB.spec.ts'), 'PR_B_GENERIC_BROWSER_DISCOVERY_LEAK');

for (const required of [
  "migration_tip = '20260828120000'",
  "CHECK (migration_tip = '20260828120000')",
  'STUDIO_PR_B_DELIVERY_PATH_DISABLED',
  'studio_artifact_generation_request_v2',
]) assert.ok(migration.includes(required), `PR_B_MIGRATION_CI_CONTRACT:${required}`);

console.log(`Governed multi-source Studio PR B CI contract passed: ${EXPECTED_COMMANDS.length} exact commands, isolated two-profile browser ownership, PostgreSQL 16, and exact-head evidence binding.`);
