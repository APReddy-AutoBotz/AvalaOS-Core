import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';

const read = file => readFileSync(file, 'utf8');
export const PR_C_PLAYWRIGHT_CONFIG_FILES = Object.freeze([
  'playwright.config.ts',
  'playwright.controlled-preview-boundary.config.ts',
  'playwright.controller-navigation-history.config.ts',
  'playwright.delivery-monitor-pr-c.config.ts',
  'playwright.enterprise-intelligence.config.ts',
  'playwright.exhaustive-acceptance.config.ts',
  'playwright.full-platform.config.ts',
  'playwright.hosted-accessibility-performance.config.ts',
  'playwright.hosted-pilot.config.ts',
  'playwright.local-navigation-regression.config.ts',
  'playwright.local-sandbox-regression.config.ts',
  'playwright.pilot-operations.config.ts',
  'playwright.pr1d.config.ts',
  'playwright.pr1e.config.ts',
  'playwright.pr1f.config.ts',
  'playwright.pr1g.config.ts',
  'playwright.studio-artifacts.config.ts',
  'playwright.studio-pr-b.config.ts',
  'playwright.studio-private-artifacts.config.ts',
  'playwright.synthetic-admin.config.ts',
  'playwright.transcript-flow-pr-a.config.ts',
  'playwright.trust-assurance.config.ts',
]);
const rejectPlaywrightCapture = code => { throw new Error(`PR_C_PLAYWRIGHT_GIT_CAPTURE_REJECTED:${code}`); };
export const assertPlaywrightGitCaptureDisabledForTest = (source, file = 'playwright.test.config.ts') => {
  if (typeof source !== 'string' || source.length === 0 || Buffer.byteLength(source) > 1024 * 1024) rejectPlaywrightCapture('SOURCE');
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (parsed.parseDiagnostics.length !== 0) rejectPlaywrightCapture('SYNTAX');
  const imports = parsed.statements.filter(statement => ts.isImportDeclaration(statement)
    && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === '@playwright/test')
    .flatMap(statement => statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)
      ? statement.importClause.namedBindings.elements.filter(element => element.propertyName === undefined && element.name.text === 'defineConfig') : []);
  if (imports.length !== 1) rejectPlaywrightCapture('DEFINE_CONFIG_IMPORT');
  const exports = parsed.statements.filter(statement => ts.isExportAssignment(statement) && !statement.isExportEquals);
  if (exports.length !== 1 || !ts.isCallExpression(exports[0].expression)
    || !ts.isIdentifier(exports[0].expression.expression) || exports[0].expression.expression.text !== 'defineConfig'
    || exports[0].expression.arguments.length !== 1 || !ts.isObjectLiteralExpression(exports[0].expression.arguments[0])) {
    rejectPlaywrightCapture('DEFAULT_EXPORT');
  }
  const config = exports[0].expression.arguments[0];
  if (config.properties.some(property => ts.isSpreadAssignment(property))) rejectPlaywrightCapture('ROOT_SPREAD');
  if (config.properties.some(property => property.name && ts.isComputedPropertyName(property.name))) {
    rejectPlaywrightCapture('ROOT_COMPUTED');
  }
  const captureProperties = config.properties.filter(property => property.name
    && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === 'captureGitInfo');
  if (captureProperties.length !== 1 || !ts.isPropertyAssignment(captureProperties[0])
    || !ts.isObjectLiteralExpression(captureProperties[0].initializer)) rejectPlaywrightCapture('CAPTURE_PROPERTY');
  const capture = captureProperties[0].initializer;
  if (capture.properties.length !== 2 || capture.properties.some(property => !ts.isPropertyAssignment(property)
    || !property.name || !ts.isIdentifier(property.name) || !['commit','diff'].includes(property.name.text)
    || property.initializer.kind !== ts.SyntaxKind.FalseKeyword)
    || new Set(capture.properties.map(property => property.name.text)).size !== 2) rejectPlaywrightCapture('CAPTURE_VALUE');
  return true;
};

export const isPlaywrightRootConfigFileNameForTest = name => typeof name === 'string'
  && /^playwright(?:\.[^/\\]+)?\.config\.(?:[cm]?[jt]s)$/u.test(name);
export const assertPlaywrightConfigInventoryForTest = names => {
  const discovered = names.filter(isPlaywrightRootConfigFileNameForTest).sort();
  assert.deepEqual(discovered, [...PR_C_PLAYWRIGHT_CONFIG_FILES].sort(),
    'the exact root Playwright config inventory must remain pinned');
  return discovered;
};
const rootEntries = readdirSync('.', { withFileTypes: true });
assert(rootEntries.filter(entry => isPlaywrightRootConfigFileNameForTest(entry.name)).every(entry => entry.isFile()),
  'root Playwright configs must be regular files, not links or directories');
const actualPlaywrightConfigs = assertPlaywrightConfigInventoryForTest(rootEntries.map(entry => entry.name));
assert.equal(actualPlaywrightConfigs.length, 22);
assert.deepEqual(assertPlaywrightConfigInventoryForTest([...PR_C_PLAYWRIGHT_CONFIG_FILES, 'README.md']),
  [...PR_C_PLAYWRIGHT_CONFIG_FILES].sort());
for (const extension of ['ts','js','mts','mjs','cts','cjs']) {
  for (const name of [`playwright.config.${extension}`, `playwright.unpinned.config.${extension}`]) {
    assert.equal(isPlaywrightRootConfigFileNameForTest(name), true);
  }
  assert.throws(() => assertPlaywrightConfigInventoryForTest([
    ...PR_C_PLAYWRIGHT_CONFIG_FILES, `playwright.unpinned.config.${extension}`,
  ]), /the exact root Playwright config inventory must remain pinned/u);
}
for (const name of ['playwright.config.json','playwright.config.ts.bak','nested/playwright.config.ts',
  'nested\\playwright.config.ts','playwright.config.jsx', '', null]) {
  assert.equal(isPlaywrightRootConfigFileNameForTest(name), false);
}
assert.throws(() => assertPlaywrightConfigInventoryForTest(PR_C_PLAYWRIGHT_CONFIG_FILES.slice(1)),
  /the exact root Playwright config inventory must remain pinned/u);
assert.throws(() => assertPlaywrightConfigInventoryForTest([...PR_C_PLAYWRIGHT_CONFIG_FILES, 'playwright.config.ts']),
  /the exact root Playwright config inventory must remain pinned/u);
for (const file of PR_C_PLAYWRIGHT_CONFIG_FILES) assert.equal(assertPlaywrightGitCaptureDisabledForTest(read(file), file), true);

const validPlaywrightCapture = "import { defineConfig } from '@playwright/test'; export default defineConfig({ captureGitInfo: { commit: false, diff: false }, testDir: '.' });";
assert.equal(assertPlaywrightGitCaptureDisabledForTest(validPlaywrightCapture), true);
for (const hostile of [
  "import { defineConfig } from '@playwright/test'; export default defineConfig({ testDir: '.' }); // captureGitInfo: { commit: false, diff: false }",
  validPlaywrightCapture.replace('commit: false, ', ''),
  validPlaywrightCapture.replace('commit: false', 'commit: true'),
  validPlaywrightCapture.replace('diff: false', "diff: 'false'"),
  validPlaywrightCapture.replace('diff: false', 'diff: disabled'),
  validPlaywrightCapture.replace('captureGitInfo:', "['captureGitInfo']:"),
  validPlaywrightCapture.replace('testDir:', "['captureGitInfo']: { commit: true, diff: true }, testDir:"),
  validPlaywrightCapture.replace('testDir:', "'captureGitInfo': { commit: true, diff: true }, testDir:"),
  validPlaywrightCapture.replace('captureGitInfo:', '...base, captureGitInfo:'),
  validPlaywrightCapture.replace('testDir:', 'captureGitInfo: { commit: false, diff: false }, testDir:'),
  validPlaywrightCapture.replace("defineConfig({ captureGitInfo", "(condition ? defineConfig : alternate)({ captureGitInfo"),
  validPlaywrightCapture.replace("export default defineConfig", "const configured = defineConfig; export default configured"),
  validPlaywrightCapture.replace("import { defineConfig }", "import { defineConfig as configure }"),
  `${validPlaywrightCapture} export default defineConfig({ captureGitInfo: { commit: false, diff: false } });`,
]) assert.throws(() => assertPlaywrightGitCaptureDisabledForTest(hostile), /PR_C_PLAYWRIGHT_GIT_CAPTURE_REJECTED:/u);

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
  /pr264-controlled-human-credentials-preflight/u,
  /pr264-controlled-human-prepare/u,
  /pr264-controlled-human-quiesce/u,
  /pr264-controlled-human-checkpoints/u,
  /pr264-controlled-human-final/u,
  /run\.id !== context\.runId/u,
  /run\.status === 'completed'/u,
  /run\.conclusion === 'success'/u,
  /environment: hosted-nonproduction-pilot/u,
  /controlled_human_credentials_preflight:/u,
  /controlled_human_edge:/u,
  /controlled_human_prepare:/u,
  /controlled_human_quiesce:/u,
  /controlled_human_requester:/u,
  /controlled_human_approver:/u,
  /controlled_human_reviewer:/u,
  /controlled_human_final:/u,
  /controlled_human_recovery:/u,
]) assert.match(workflow, pattern);
assert.doesNotMatch(workflow, /secrets:\s*inherit/u);
assert.doesNotMatch(workflow, /uses:\s*\.\/\.github\/workflows\/pr264-controlled-human/u);
assert.equal(workflow.match(/continue-on-error:\s*true/gu)?.length, 1, 'only bounded preparation cleanup may continue');
assert.match(workflow, /name: Protected exact-bound abort recovery after failed seed or evidence assembly[\s\S]*?if: \$\{\{ failure\(\) && steps\.apply\.outcome != 'skipped' && steps\.verify_abort_recovery_ca\.outcome == 'success' \}\}[\s\S]*?continue-on-error: true/u);

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
  'test:pr-c-scoring-law-drift',
  'test:pr-c-controlled-human-source',
  'pr-c-controlled-human:bootstrap-bindings',
  'pr-c-controlled-human:compact-comment',
];
for (const name of requiredScripts) assert.equal(typeof scripts[name], 'string', `missing package script ${name}`);
assert.equal(scripts['test:pr-c-scoring-law-drift'], 'node scripts/checkPrCScoringLawDrift.mjs', 'scoring-law guard package command must remain exact');
const sourceCommandSegments = scripts['test:pr-c-controlled-human-source'].split(' && ');
const importPreflightCommand = 'node scripts/checkPrCControlledHumanEdgeImports.mjs';
assert.equal(sourceCommandSegments[0], importPreflightCommand,
  'exact local import graph must fail before any retained source or database test');
assert.equal(sourceCommandSegments.filter(segment => segment === importPreflightCommand).length, 1);
const sourceNodeTests = sourceCommandSegments[1].split(' ');
assert.deepEqual(sourceNodeTests.slice(0, 2), ['node', '--test']);
const requiredControlScriptCoverageCommands = [
  'node --test scripts/runPrCControlledHumanScriptCoverage.test.mjs',
  'node scripts/runPrCControlledHumanScriptCoverage.mjs',
];
assert.deepEqual(sourceCommandSegments.slice(-2), requiredControlScriptCoverageCommands,
  'the actual measured control-script gate and its adversarial selftest must run after the retained source suites');
for (const command of requiredControlScriptCoverageCommands) {
  assert.equal(sourceCommandSegments.filter(segment => segment === command).length, 1,
    `the controlled-human source command must execute ${command} exactly once`);
}
for (const requiredTest of [
  'scripts/checkPrCControlledHumanEdgeImports.test.mjs',
  'scripts/prCControlledHumanEdgeDeploy.test.mjs',
  'scripts/prCControlledHumanPostgresTls.test.mjs',
  'scripts/prCControlledHumanEnvironment.test.mjs',
  'scripts/prCControlledHumanEnvironmentMigration.test.mjs',
  'scripts/prCControlledHumanEnvironmentPostgres.test.mjs',
  'scripts/prCControlledHumanEvidenceContract.test.mjs',
  'scripts/prCControlledHumanWorkflowContract.test.mjs',
  'scripts/prCControlledHumanSecurityContract.test.mjs',
  'scripts/prCControlledHumanCredentialPreflight.test.mjs',
  'scripts/prCControlledHumanDocumentationContract.test.mjs',
]) {
  assert.equal(sourceNodeTests.filter(argument => argument === requiredTest).length, 1,
    `the controlled-human source command must execute ${requiredTest} exactly once`);
}
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
  'scripts/checkPrCScoringLawDrift.mjs',
  'scripts/checkPrCScoringLawDrift.test.mjs',
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
  'scripts/derivePrCControlledHumanBootstrap.mjs',
  'scripts/compactPrCControlledHumanComment.mjs',
  'scripts/prCControlledHumanEnvironment.test.mjs',
  'scripts/prCControlledHumanEnvironmentMigration.test.mjs',
  'scripts/prCControlledHumanEnvironmentPostgres.test.mjs',
  'scripts/prCControlledHumanEvidenceContract.mjs',
  'scripts/prCControlledHumanEvidenceContract.test.mjs',
  'scripts/prCControlledHumanWorkflowContract.test.mjs',
  'scripts/prCControlledHumanCredentialPreflight.mjs',
  'scripts/prCControlledHumanCredentialPreflight.test.mjs',
  'scripts/buildPrCControlledHumanPreparation.mjs',
  'scripts/prCControlledHumanDocumentationContract.test.mjs',
  'scripts/capturePrCControlledHumanCheckpoint.mjs',
  'scripts/prCControlledHumanControlScriptCoverageSupport.test.mjs',
  'scripts/prCControlledHumanCredentialPreflightEntry.test.mjs',
  'scripts/prCControlledHumanCredentialPreflightEntryFixture.mjs',
  'scripts/prCControlledHumanCredentialPreflightEntryLoader.mjs',
  'scripts/prCControlledHumanCredentialPreflightEntryTransport.mjs',
  'scripts/runPrCControlledHumanScriptCoverage.mjs',
  'scripts/runPrCControlledHumanScriptCoverage.test.mjs',
  'testing/process-lifecycle/contracts/pr-c-control-script-coverage.md',
  'scripts/producePrCControlledHumanEdgeDeploymentManifest.mjs',
  'scripts/validatePrCControlledHumanPreparation.mjs',
  'scripts/verifyPr264ControlledHumanPreview.mjs',
  'scripts/verifyPrCControlledHumanEdgeDeployment.mjs',
  'scripts/verifyPrCControlledHumanSession.mjs',
  'scripts/writePrCControlledHumanObservationTemplates.mjs',
  '.github/workflows/pr264-controlled-human-recover.yml',
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
// The old controlled-human backend remains pinned to its frozen tip. These two
// approved default-off successors belong ONLY to the separate creation-access
// target; do not relabel or redeploy the retained human preparation evidence.
const creationAccessSuccessors = [
  '20260915142940_creation_access_process_authority.sql',
  '20260915142942_synthetic_admin_account_authority.sql',
];
const assertCreationSuccessors = names => assert.deepEqual(names, creationAccessSuccessors,
  'only the approved isolated creation-access migrations may follow the frozen controlled-human tip');
assertCreationSuccessors(migrationNames.slice(migrationNames.indexOf(controlledHumanMigrations[0]) + 1));
for (const hostile of [[], creationAccessSuccessors.slice(0, 1), [...creationAccessSuccessors].reverse(),
  [...creationAccessSuccessors, creationAccessSuccessors[1]], [...creationAccessSuccessors, '20990101000000_unapproved.sql']]) {
  assert.throws(() => assertCreationSuccessors(hostile));
}

console.log(`PR C CI contract passed: ${JSON.stringify({ workflow: '.github/workflows/transcript-flow-pr-c.yml', scripts: requiredScripts.length, migration: migrations[0], controlledHumanMigration: controlledHumanMigrations[0] })}`);
