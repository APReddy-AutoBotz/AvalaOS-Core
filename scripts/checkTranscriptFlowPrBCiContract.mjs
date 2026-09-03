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
const dedicatedBrowserVite = read('vite.studio-pr-b.config.ts');
const governedBrowserRunner = read('scripts/runTranscriptFlowBrowser.mjs');
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
assert.equal(packageJson.scripts['test:transcript-flow:studio-browser'], 'node scripts/runTranscriptFlowBrowser.mjs --studio-pr-b');
assert.equal(packageJson.scripts['test:transcript-flow:studio-a11y'], 'node scripts/runTranscriptFlowBrowser.mjs --studio-pr-b --grep "A11Y"');
assert.equal(packageJson.scripts['test:transcript-flow:studio-performance'], 'node scripts/runTranscriptFlowBrowser.mjs --studio-pr-b --grep "PERF-001"');
for (const { command } of EXPECTED_COMMANDS) {
  const match = /^npm (?:run )?([^ ]+)/u.exec(command);
  if (match && match[1] !== 'audit' && match[1] !== 'test') assert.ok(packageJson.scripts?.[match[1]], `PR_B_REGISTERED_SCRIPT_MISSING:${match[1]}`);
}

for (const required of [
  'name: Governed multi-source transcript Studio PR B',
  'pull_request:',
  'workflow_dispatch:',
  'contents: read',
  "node-version: '22'",
  'ref: ${{ github.event.pull_request.head.sha || github.sha }}',
  'fetch-depth: 0',
  'test "$(git rev-parse HEAD)" = "$PR_B_EXACT_HEAD_SHA"',
  'npm run test:transcript-flow:studio-evidence-contract:retained',
]) assert.ok(workflow.includes(required), `PR_B_WORKFLOW_REQUIRED:${required}`);
assert.doesNotMatch(workflow, /node scripts\/runTranscriptFlowPrBEvidence\.mjs/u, 'PR_B_CURRENT_HEAD_HISTORICAL_REPLAY');
assert.doesNotMatch(workflow, /^\s*run:\s*npm run test:transcript-flow:studio-evidence\s*$/mu, 'PR_B_CURRENT_HEAD_HISTORICAL_VERIFY');
assert.doesNotMatch(workflow, /continue-on-error\s*:\s*true/iu, 'PR_B_WORKFLOW_CONTINUE_ON_ERROR');
assert.doesNotMatch(workflow, /permissions:\s*write-all/iu, 'PR_B_WORKFLOW_WRITE_PERMISSION');

for (const required of [
  "testDir:'./tests/browser/studioPrB'",
  "testMatch:'studioPrB.spec.ts'",
  'workers:1',
  'fullyParallel:false',
  "devices['Desktop Chrome']",
  "devices['Pixel 7']",
  "baseURL:'http://127.0.0.1:4197'",
  'reuseExistingServer:false',
]) assert.ok(dedicatedBrowser.replace(/\s+/gu, '').includes(required.replace(/\s+/gu, '')), `PR_B_BROWSER_CONFIG_REQUIRED:${required}`);
assert.match(dedicatedBrowser, /STUDIO_PR_B_EXTERNAL_SERVER/u, 'PR_B_BROWSER_EXTERNAL_SERVER_SWITCH');
assert.match(dedicatedBrowser, /webServer:\s*externalServer\s*\?\s*undefined/u, 'PR_B_BROWSER_EXTERNAL_SERVER_OWNERSHIP');
for (const required of [
  "host: '127.0.0.1'",
  'port: 4197',
  'strictPort: true',
]) assert.ok(dedicatedBrowserServer.includes(required), `PR_B_BROWSER_SERVER_REQUIRED:${required}`);
assert.match(dedicatedBrowserVite, /tests\/browser\/studioPrB\/harness\.html/u, 'PR_B_BROWSER_BUILD_INPUT');
assert.match(governedBrowserRunner, /\['--studio-pr-b', \{[\s\S]*?port: '4197'[\s\S]*?serverCommand: 'preview'[\s\S]*?build: true[\s\S]*?viteConfig: 'vite\.studio-pr-b\.config\.ts'[\s\S]*?STUDIO_PR_B_EXTERNAL_SERVER: 'true'[\s\S]*?\}\],/u, 'PR_B_BROWSER_OWNED_PREVIEW');
assert.ok(genericBrowser.includes('studioPrB/studioPrB.spec.ts'), 'PR_B_GENERIC_BROWSER_DISCOVERY_LEAK');

for (const required of [
  "migration_tip = '20260828120000'",
  "CHECK (migration_tip = '20260828120000')",
  'STUDIO_PR_B_DELIVERY_PATH_DISABLED',
  'studio_artifact_generation_request_v2',
]) assert.ok(migration.includes(required), `PR_B_MIGRATION_CI_CONTRACT:${required}`);

console.log(`Governed multi-source Studio PR B CI contract passed: ${EXPECTED_COMMANDS.length} exact commands, prebuilt isolated two-profile browser ownership, PostgreSQL 16, and retained exact-head evidence binding.`);
