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
assert.match(
  scripts['test:transcript-flow:delivery-monitor-evidence-contract'],
  /node --test scripts\/runRetainedEvidenceContract\.test\.mjs/u,
  'the current PR C contract must regression-test retained merge-parent lineage before evidence execution',
);

const retainedEvidenceRunner = read('scripts/runRetainedEvidenceContract.mjs');
assert.match(retainedEvidenceRunner, /\['cat-file', '-p', commit\]/u, 'retained lineage must read raw commit parent objects');
assert.match(retainedEvidenceRunner, /GIT_NO_REPLACE_OBJECTS: '1'/u, 'retained lineage must disable replacement refs');
assert.match(
  retainedEvidenceRunner,
  /\['update-ref', retainedRef, exactHead\]/u,
  'retained execution must advertise the exact historical head through a temporary source ref',
);
assert.match(
  retainedEvidenceRunner,
  /'clone', '--no-local', '--no-checkout', '--no-tags',[\s\S]*?'--single-branch', '--branch', retainedBranch, root, checkout/u,
  'retained execution must clone only the temporary exact-head branch into a self-contained checkout',
);
assert.match(
  retainedEvidenceRunner,
  /\['update-ref', '-d', retainedRef\]/u,
  'retained execution must remove its temporary source ref even when checkout creation fails',
);
assert.doesNotMatch(
  retainedEvidenceRunner,
  /'--shared'/u,
  'retained execution must not depend on the hosted checkout object store',
);
assert.match(
  retainedEvidenceRunner,
  /CHECKOUT_SHARED_OBJECTS/u,
  'retained execution must fail closed if Git creates a shared-object alternate',
);
assert.doesNotMatch(
  retainedEvidenceRunner,
  /merge-base/u,
  'retained lineage must not depend on the hosted merge-base query that returned a false result for the accepted graph',
);
for (const [file, expected] of [
  ['scripts/runRetainedPrAEvidenceContract.mjs', [
    '5433cad41721355e3ec5a29bc2f87772540c77b5',
    '11e670003a73b0ab5a28650b70afac4b267760f4',
    '460c44864b9d240321e727945411ced51dd0fe30',
  ]],
  ['scripts/runRetainedPrBEvidenceContract.mjs', [
    '5433cad41721355e3ec5a29bc2f87772540c77b5',
    'fe3ebfb900bc163df2e436ec5b11f8751f9b79ea',
  ]],
]) {
  const retainedContract = read(file);
  assert.match(retainedContract, /acceptedParentChain/u, `${file} must declare its accepted merge-parent chain`);
  for (const sha of expected) assert.match(retainedContract, new RegExp(sha, 'u'), `${file} must pin ${sha}`);
}

const defaultPlaywright = read('playwright.config.ts');
assert.match(
  defaultPlaywright,
  /baseURL:\s*'http:\/\/127\.0\.0\.1:4173'/u,
  'the retained default browser suite must keep its canonical preview port',
);
assert.match(
  defaultPlaywright,
  /testIgnore:\s*\[[^\]]*'deliveryMonitorPrC\/deliveryMonitorPrC\.spec\.ts'/u,
  'the retained browser suite must exclude the PR C spec that owns a dedicated harness',
);

const retainedTranscriptPlaywright = read('playwright.transcript-flow-pr-a.config.ts');
assert.match(
  retainedTranscriptPlaywright,
  /import path from 'node:path';/u,
  'the retained PR A Playwright config must use platform-safe path construction',
);
assert.match(
  retainedTranscriptPlaywright,
  /import \{ tmpdir \} from 'node:os';/u,
  'the retained PR A Playwright config must use the operating-system temp directory',
);
assert.match(
  retainedTranscriptPlaywright,
  /outputDir:\s*path\.join\(tmpdir\(\), 'avalaos-transcript-flow-pr-a-playwright', String\(process\.pid\)\)/u,
  'the retained PR A Playwright output must be outside the repository and isolated per process',
);
assert.doesNotMatch(
  retainedTranscriptPlaywright,
  /outputDir:[^\r\n]*(?:process\.env\.(?:TEMP|TMP)|['"]\.['"])/u,
  'the retained PR A Playwright output must not depend on platform-specific TEMP availability or the repository root',
);

const browserServer = read('tests/browser/deliveryMonitorPrC/server.mjs');
assert.match(browserServer, /import \{ tmpdir \} from 'node:os';/u, 'the PR C browser server must use the operating-system temp directory');
assert.match(
  browserServer,
  /cacheDir:\s*path\.join\(tmpdir\(\), 'avalaos-delivery-monitor-pr-c-vite-cache'\)/u,
  'the PR C Vite cache must be outside the repository on every hosted operating system',
);
assert.doesNotMatch(
  browserServer,
  /cacheDir:[^\r\n]*(?:process\.env\.TEMP|process\.cwd\(\))/u,
  'the PR C Vite cache must not depend on platform-specific TEMP availability or the repository root',
);

const governedBrowserRunner = read('scripts/runTranscriptFlowBrowser.mjs');
assert.match(
  governedBrowserRunner,
  /\['--full-platform', \{[\s\S]*?port: '4192'[\s\S]*?FULL_PLATFORM_BASE_URL: 'http:\/\/127\.0\.0\.1:4192'[\s\S]*?\}\],/u,
  'the full-platform campaign must own a dedicated preview port instead of sharing the retained default suite port',
);

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
  'scripts/runRetainedEvidenceContract.test.mjs',
  'scripts/runTranscriptFlowPrCEvidence.mjs',
  'scripts/verifyTranscriptFlowPrCEvidence.mjs',
]) assert.equal(existsSync(file), true, `missing PR C CI artifact ${file}`);

const migrations = readdirSync('supabase/migrations').filter(name => name.endsWith('_governed_delivery_monitor_pr_c.sql'));
assert.equal(migrations.length, 1, 'PR C requires exactly one CLI-created migration');
const migrationNames = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();
assert.equal(migrationNames.at(-1), migrations[0], 'PR C migration must be the canonical migration tip');

console.log(`PR C CI contract passed: ${JSON.stringify({ workflow: '.github/workflows/transcript-flow-pr-c.yml', scripts: requiredScripts.length, migration: migrations[0] })}`);
