import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const read = file => readFileSync(file, 'utf8');
const workflow = read('.github/workflows/transcript-flow-pr-c.yml');
const pkg = JSON.parse(read('package.json'));
const scripts = pkg.scripts || {};

for (const pattern of [
  /permissions:\s*\r?\n\s+actions: read\s*\r?\n\s+contents: read\s*\r?\n\s+issues: read\s*\r?\n\s+pull-requests: read/u,
  /types: \[opened, synchronize, reopened, labeled\]/u,
  /image: postgres:16/u,
  /node-version: '22'/u,
  /fetch-depth: 0/u,
  /PR_C_BASE_SHA: 5433cad41721355e3ec5a29bc2f87772540c77b5/u,
  /PR_C_EXECUTION_CLASSIFICATION: github_candidate/u,
  /PR_C_EXACT_HEAD_SHA/u,
  /PR_C_WORKFLOW_PATH: \.github\/workflows\/transcript-flow-pr-c\.yml/u,
  /PR_C_WORKFLOW_RUN_ID: \$\{\{ github\.run_id \}\}/u,
  /PR_C_RUN_ATTEMPT: \$\{\{ github\.run_attempt \}\}/u,
  /PR_C_CONTROLLED_HUMAN_TEST_DATABASE_URL: postgresql:\/\/postgres:postgres@127\.0\.0\.1:5432\/postgres/u,
  /git rev-parse HEAD/u,
  /git merge-base/u,
  /npm ci/u,
  /playwright install --with-deps chromium/u,
  /test:transcript-flow:delivery-monitor-evidence-contract/u,
  /runTranscriptFlowPrCEvidence\.mjs/u,
  /test:transcript-flow:delivery-monitor-evidence/u,
  /actions\/checkout@11bd71901bbe5b1630ceea73d27597364c9af683/u,
  /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/u,
  /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/u,
  /governed-delivery-monitor-pr-c-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/u,
  /output\/process-lifecycle-pr-c\//u,
  /pr264-controlled-human-edge/u,
  /pr264-controlled-human-prepare/u,
  /pr264-controlled-human-quiesce/u,
  /pr264-controlled-human-checkpoints/u,
  /pr264-controlled-human-final/u,
  /run\.id !== context\.runId/u,
  /run\.status === 'completed'/u,
  /run\.conclusion === 'success'/u,
  /environment: hosted-nonproduction-pilot/u,
  /uses: \.\/\.github\/workflows\/pr264-controlled-human-edge-deploy\.yml/u,
  /uses: \.\/\.github\/workflows\/pr264-controlled-human-prepare\.yml/u,
  /uses: \.\/\.github\/workflows\/pr264-controlled-human-quiesce\.yml/u,
  /uses: \.\/\.github\/workflows\/pr264-controlled-human-checkpoint\.yml/u,
  /uses: \.\/\.github\/workflows\/pr264-controlled-human-verify\.yml/u,
]) assert.match(workflow, pattern);
assert.doesNotMatch(workflow, /continue-on-error/u);
assert.doesNotMatch(workflow, /secrets:\s*inherit/u);

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
  'test:pr-c-controlled-human-source',
];
for (const name of requiredScripts) assert.equal(typeof scripts[name], 'string', `missing package script ${name}`);
assert.match(
  scripts['test:transcript-flow:delivery-monitor-evidence-contract'],
  /node --test scripts\/runRetainedEvidenceContract\.test\.mjs/u,
  'the current PR C contract must regression-test retained merge-parent lineage before evidence execution',
);
for (const requiredTest of [
  'scripts/transcriptFlowPrCExecutionIdentity.test.mjs',
  'scripts/transcriptFlowPrCEvidenceContract.test.mjs',
  'scripts/transcriptFlowPrCEvidenceVerifier.test.mjs',
]) assert.match(
  scripts['test:transcript-flow:delivery-monitor-evidence-contract'],
  new RegExp(requiredTest.replaceAll('.', '\\.'), 'u'),
  `the PR C evidence contract must execute ${requiredTest}`,
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
assert.match(
  defaultPlaywright,
  /testIgnore:\s*\[[^\]]*'enterpriseIntelligencePrCScope\.spec\.ts'/u,
  'the retained browser suite must exclude the PR C scope-isolation spec owned by the dedicated harness',
);

const deliveryMonitorPlaywright = read('playwright.delivery-monitor-pr-c.config.ts');
assert.match(
  deliveryMonitorPlaywright,
  /'deliveryMonitorPrC\/deliveryMonitorPrC\.spec\.ts'/u,
  'the dedicated PR C browser suite must retain the governed Delivery/Monitor journey',
);
assert.match(
  deliveryMonitorPlaywright,
  /'enterpriseIntelligencePrCScope\.spec\.ts'/u,
  'the dedicated PR C browser suite must execute scope-isolation tests on both configured profiles',
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
assert.match(
  governedBrowserRunner,
  /\['--delivery-monitor-pr-c', \{[\s\S]*?port: '4198'[\s\S]*?serverCommand: 'preview'[\s\S]*?build: true[\s\S]*?DELIVERY_MONITOR_PR_C_BROWSER_TEST_BUILD: 'true'[\s\S]*?\}\],/u,
  'the PR C browser matrix must prebuild its governed harnesses and use the owned preview lifecycle',
);
assert.match(
  governedBrowserRunner,
  /\['--studio-pr-b', \{[\s\S]*?port: '4197'[\s\S]*?serverCommand: 'preview'[\s\S]*?build: true[\s\S]*?viteConfig: 'vite\.studio-pr-b\.config\.ts'[\s\S]*?STUDIO_PR_B_EXTERNAL_SERVER: 'true'[\s\S]*?\}\],/u,
  'the retained PR B browser matrix must prebuild its governed harness and use the owned preview lifecycle',
);
assert.match(
  governedBrowserRunner,
  /\['--studio-artifacts', \{[\s\S]*?port: '4187'[\s\S]*?serverCommand: 'preview'[\s\S]*?build: true[\s\S]*?STUDIO_ARTIFACT_BROWSER_TEST_BUILD: 'true'[\s\S]*?\}\],/u,
  'the retained Studio browser matrix must prebuild its governed harness and use the owned preview lifecycle',
);
assert.equal(
  scripts['test:transcript-flow:studio-browser'],
  'node scripts/runTranscriptFlowBrowser.mjs --studio-pr-b',
  'the retained PR B browser command must select the governed shared lifecycle',
);
assert.equal(
  scripts['test:browser:studio-artifacts'],
  'node scripts/runTranscriptFlowBrowser.mjs --studio-artifacts',
  'the retained Studio browser command must select the governed shared lifecycle',
);
const retainedStudioPlaywright = read('playwright.studio-pr-b.config.ts');
assert.match(retainedStudioPlaywright, /STUDIO_PR_B_EXTERNAL_SERVER/u, 'the retained PR B config must disable nested server ownership');
assert.match(retainedStudioPlaywright, /webServer:\s*externalServer\s*\?\s*undefined/u, 'the retained PR B config must yield server ownership to the shared controller');
const retainedStudioVite = read('vite.studio-pr-b.config.ts');
assert.match(retainedStudioVite, /tests\/browser\/studioPrB\/harness\.html/u, 'the retained PR B production build must include its harness');

const prCBrowserRunner = read('scripts/runTranscriptFlowPrCBrowser.mjs');
assert.match(
  prCBrowserRunner,
  /browserModeByFlag\.get\('--delivery-monitor-pr-c'\)/u,
  'the PR C browser command must select the governed shared lifecycle',
);
assert.match(prCBrowserRunner, /runBrowserHarness/u, 'the PR C browser command must use the tested owned browser harness');
assert.doesNotMatch(
  prCBrowserRunner,
  /deliveryMonitorPrC\/server\.mjs|createServer\(|__delivery_monitor_pr_c_shutdown/u,
  'the PR C browser command must not launch the cold on-demand development server',
);

const viteConfig = read('vite.config.ts');
for (const required of [
  'DELIVERY_MONITOR_PR_C_BROWSER_TEST_BUILD',
  'tests/browser/deliveryMonitorPrC/harness.html',
  'tests/browser/enterpriseIntelligenceHarness.html',
  'STUDIO_ARTIFACT_BROWSER_TEST_BUILD',
  'tests/browser/studioArtifactsHarness.html',
]) {
  assert.ok(viteConfig.includes(required), `the PR C production build input is missing ${required}`);
}

for (const file of [
  'testing/process-lifecycle/contracts/pr-c-assertion-registry.json',
  'testing/process-lifecycle/contracts/pr-c-assertion-registry.schema.json',
  'testing/process-lifecycle/contracts/pr-c-source-provenance.json',
  'testing/process-lifecycle/fixtures/delivery-monitor-pr-c/fixture-registry.json',
  'testing/process-lifecycle/fixtures/delivery-monitor-pr-c/personas.json',
  'scripts/buildTranscriptFlowPrCRegistry.mjs',
  'scripts/transcriptFlowPrCEvidenceScope.mjs',
  'scripts/transcriptFlowPrCExecutionIdentity.mjs',
  'scripts/transcriptFlowPrCExecutionIdentity.test.mjs',
  'scripts/transcriptFlowPrCEvidenceContract.mjs',
  'scripts/transcriptFlowPrCEvidenceContract.test.mjs',
  'scripts/transcriptFlowPrCEvidenceVerifier.test.mjs',
  'scripts/runRetainedEvidenceContract.test.mjs',
  'scripts/runTranscriptFlowPrCEvidence.mjs',
  'scripts/verifyTranscriptFlowPrCEvidence.mjs',
  'scripts/prCControlledHumanEnvironment.mjs',
  'scripts/prCControlledHumanEnvironmentMigration.mjs',
  'scripts/prCControlledHumanEnvironment.test.mjs',
  'scripts/prCControlledHumanEnvironmentMigration.test.mjs',
  'scripts/prCControlledHumanEnvironmentPostgres.test.mjs',
  'scripts/prCControlledHumanEvidenceContract.mjs',
  'scripts/prCControlledHumanEvidenceContract.test.mjs',
  'scripts/prCControlledHumanWorkflowContract.test.mjs',
  'scripts/buildPrCControlledHumanPreparation.mjs',
  'scripts/capturePrCControlledHumanCheckpoint.mjs',
  'scripts/producePrCControlledHumanEdgeDeploymentManifest.mjs',
  'scripts/validatePrCControlledHumanPreparation.mjs',
  'scripts/verifyPr264ControlledHumanPreview.mjs',
  'scripts/verifyPrCControlledHumanEdgeDeployment.mjs',
  'scripts/verifyPrCControlledHumanSession.mjs',
  'scripts/writePrCControlledHumanObservationTemplates.mjs',
  '.github/workflows/pr264-controlled-human-edge-deploy.yml',
  '.github/workflows/pr264-controlled-human-prepare.yml',
  '.github/workflows/pr264-controlled-human-quiesce.yml',
  '.github/workflows/pr264-controlled-human-checkpoint.yml',
  '.github/workflows/pr264-controlled-human-verify.yml',
  'services/studioArtifacts/prCControlledHumanSyntheticGeneration.ts',
  'services/studioArtifacts/prCControlledHumanSyntheticGeneration.test.ts',
  'components/docs/PrCControlledHumanSyntheticGeneration.test.mjs',
  'supabase/functions/_shared/prCControlledHumanSyntheticGeneration.ts',
  'supabase/functions/_shared/prCControlledHumanSyntheticGeneration.test.ts',
  'supabase/functions/pr-c-controlled-human-synthetic-generation/index.ts',
  'testing/process-lifecycle/contracts/pr-c-controlled-human-preparation.schema.json',
  'testing/process-lifecycle/contracts/pr-c-controlled-human-checkpoint.schema.json',
  'testing/process-lifecycle/contracts/pr-c-controlled-human-edge-deployment.schema.json',
  'testing/process-lifecycle/contracts/pr-c-controlled-human-session.schema.json',
  'testing/process-lifecycle/fixtures/delivery-monitor-pr-c/controlled-human-environment.json',
  'supabase/migrations/20260904120000_pr_c_controlled_human_exercise_authority.sql',
]) assert.equal(existsSync(file), true, `missing PR C CI artifact ${file}`);

const migrations = readdirSync('supabase/migrations').filter(name => name.endsWith('_governed_delivery_monitor_pr_c.sql'));
const controlledHumanMigrations = readdirSync('supabase/migrations').filter(name => name.endsWith('_pr_c_controlled_human_exercise_authority.sql'));
assert.equal(migrations.length, 1, 'PR C requires exactly one Delivery/Monitor implementation migration');
assert.equal(controlledHumanMigrations.length, 1, 'PR C requires exactly one controlled-human exercise authority migration');
const migrationNames = readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort();
assert.ok(migrationNames.indexOf(migrations[0]) < migrationNames.indexOf(controlledHumanMigrations[0]), 'controlled-human authority must follow the Delivery/Monitor implementation migration');
assert.equal(migrationNames.at(-1), controlledHumanMigrations[0], 'controlled-human authority must be the canonical migration tip');

console.log(`PR C CI contract passed: ${JSON.stringify({ workflow: '.github/workflows/transcript-flow-pr-c.yml', scripts: requiredScripts.length, migration: migrations[0], controlledHumanMigration: controlledHumanMigrations[0] })}`);
