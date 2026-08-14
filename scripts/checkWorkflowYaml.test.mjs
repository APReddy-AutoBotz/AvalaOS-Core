import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkWorkflowYaml, parseWorkflowYaml } from './checkWorkflowYaml.mjs';

const files = await checkWorkflowYaml();
assert.ok(files.includes('v1-release-candidate.yml'));

const exhaustiveWorkflow = parseWorkflowYaml(
  await readFile('.github/workflows/exhaustive-acceptance.yml', 'utf8'),
  'exhaustive-acceptance.yml',
);
const exhaustiveSteps = exhaustiveWorkflow.jobs.acceptance.steps;
const exhaustiveCheckout = exhaustiveSteps.find(step => step.uses === 'actions/checkout@v4');
assert.equal(exhaustiveCheckout?.with?.['fetch-depth'], 0, 'retained PR1D authority requires immutable baseline history');
const exhaustiveHostedStep = exhaustiveSteps.find(step => step.name === 'Run exhaustive real hosted Sandbox acceptance');
assert.equal(
  exhaustiveHostedStep?.if,
  "env.NETLIFY_DEPLOY_ID != 'pull-request-not-deployed' && steps.deployment.outcome == 'success'",
  'real hosted execution requires the exact deployment proof to succeed first',
);
const exactDeploymentStep = exhaustiveSteps.find(step => step.name === 'Verify exact hosted deployment identity');
assert.equal(exactDeploymentStep?.id, 'deployment');
assert.equal(exactDeploymentStep?.if, "env.NETLIFY_DEPLOY_ID != 'pull-request-not-deployed'");
assert.equal(exactDeploymentStep?.['continue-on-error'], true, 'deployment failure must remain inspectable so the unified report can run');
assert.equal(exactDeploymentStep?.env?.EXPECTED_RELEASE_SHA, '${{ env.RELEASE_SHA }}');
assert.equal(exactDeploymentStep?.env?.EXPECTED_NETLIFY_DEPLOY_ID, '${{ env.NETLIFY_DEPLOY_ID }}');
assert.equal(exactDeploymentStep?.run, 'node scripts/verify-hosted-deployment.mjs');
assert.ok(
  exhaustiveSteps.indexOf(exactDeploymentStep) < exhaustiveSteps.indexOf(exhaustiveHostedStep),
  'exact deployment identity must be verified before hosted Playwright execution',
);
const exhaustiveReportStep = exhaustiveSteps.find(step => step.name === 'Generate unified PASS FAIL BLOCKED UNCOVERED results');
assert.equal(exhaustiveReportStep?.if, 'always()', 'preflight and deployment failures must still produce the unified report');
assert.match(
  exhaustiveReportStep?.env?.ACCEPTANCE_EXECUTION_DISPOSITION || '',
  /steps\.deployment\.outcome != 'success'.*'BLOCKED'/u,
  'a failed or skipped exact deployment proof must be represented as BLOCKED evidence',
);
const exhaustiveEnforcementStep = exhaustiveSteps.find(step => step.name === 'Enforce framework and release gates');
assert.equal(exhaustiveEnforcementStep?.if, 'always()');
assert.match(
  exhaustiveEnforcementStep?.run || '',
  /test "\$\{\{ steps\.deployment\.outcome \}\}" = success/u,
  'release enforcement must fail closed when deployment provenance fails',
);
assert.match(
  exhaustiveEnforcementStep?.run || '',
  /test "\$\{\{ steps\.hosted\.outcome \}\}" = success/u,
  'release enforcement must still require hosted browser success',
);

const defaultPlaywrightConfig = await readFile('playwright.config.ts', 'utf8');
assert.match(
  defaultPlaywrightConfig,
  /testIgnore: \[[^\]]*'exhaustiveHostedAcceptance\.spec\.ts'/u,
  'default/local Playwright discovery must exclude the dedicated hosted exhaustive suite',
);
const exhaustivePlaywrightConfig = await readFile('playwright.exhaustive-acceptance.config.ts', 'utf8');
assert.match(
  exhaustivePlaywrightConfig,
  /testMatch: 'exhaustiveHostedAcceptance\.spec\.ts'/u,
  'the exhaustive hosted config must exclusively own its hosted specification',
);

assert.throws(
  () => parseWorkflowYaml(`jobs:\n  evidence:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n        ref: candidate-sha\n          fetch-depth: 0\n`, 'malformed-checkout.yml'),
  /malformed-checkout\.yml is not valid YAML/u,
);

const rcWorkflow = parseWorkflowYaml(
  await readFile('.github/workflows/v1-release-candidate.yml', 'utf8'),
  'v1-release-candidate.yml',
);
const rcSteps = rcWorkflow.jobs['compose-source-evidence'].steps;
const authoritativeGate = rcSteps.find(step => step.name === 'Enforce authoritative exact-candidate evidence gate');
assert.equal(
  authoritativeGate?.if,
  "github.event_name == 'workflow_dispatch' || (github.event_name == 'pull_request' && github.event.pull_request.number == 225)",
  'the fail-closed authoritative gate must be scoped to PR #225 or an explicit manual RC invocation',
);
assert.equal(authoritativeGate?.run, 'npm run verify:v1-rc-evidence:authoritative');

const isAuthoritativeRcContext = ({ eventName, pullRequestNumber }) => (
  eventName === 'workflow_dispatch' || (eventName === 'pull_request' && pullRequestNumber === 225)
);
assert.equal(isAuthoritativeRcContext({ eventName: 'pull_request', pullRequestNumber: 225 }), true);
assert.equal(isAuthoritativeRcContext({ eventName: 'workflow_dispatch' }), true);
assert.equal(isAuthoritativeRcContext({ eventName: 'pull_request', pullRequestNumber: 226 }), false);

const pilotWorkflow = parseWorkflowYaml(
  await readFile('.github/workflows/pilot-acceptance.yml', 'utf8'),
  'pilot-acceptance.yml',
);
const migrationStep = pilotWorkflow.jobs['disposable-postgresql-16'].steps.find(
  step => step.name === 'Fresh, accepted-main upgrade, RLS, receipt/effect, and recovery contracts',
);
const disposableDatabaseUrl = 'postgresql://postgres:postgres@127.0.0.1:5432/avalaos_pilot_synthetic';
for (const variable of [
  'DATABASE_URL',
  'PR1B_MIGRATION_DATABASE_URL',
  'PR1C_MIGRATION_DATABASE_URL',
  'PR1E_MIGRATION_DATABASE_URL',
  'STUDIO_ARTIFACT_MIGRATION_DATABASE_URL',
  'STUDIO_PRIVATE_ARTIFACT_MIGRATION_DATABASE_URL',
  'ENTERPRISE_INTELLIGENCE_MIGRATION_DATABASE_URL',
]) {
  assert.equal(
    migrationStep?.env?.[variable],
    disposableDatabaseUrl,
    `${variable} must target the Pilot Acceptance disposable PostgreSQL 16 database`,
  );
}

const sourceAuthorityStep = pilotWorkflow.jobs['source-and-journey'].steps.find(
  step => step.name === 'Accepted V1 decision, source, portfolio, and artifact authority',
);
const requiredSourceAuthorityCommands = [
  'npm run test:pr1d',
  'npm run test:pr1f',
  'npm run test:pr1g',
  'npm run test:pr1g-coverage',
  'npm run test:studio-artifacts',
  'npm run test:studio-artifacts-coverage',
  'npm run test:studio-private-artifacts-coverage',
  'npm run test:enterprise-intelligence-provider',
];
for (const command of requiredSourceAuthorityCommands) {
  assert.match(sourceAuthorityStep?.run || '', new RegExp(`^${command}$`, 'mu'));
}
const sourceSteps = pilotWorkflow.jobs['source-and-journey'].steps;
const sourceAuthorityStepIndex = sourceSteps.indexOf(sourceAuthorityStep);
const generatedArtifactCleanupStepIndex = sourceSteps.findIndex(
  step => step.name === 'Remove generated compile outputs before static security scans',
);
const staticSecurityScanStepIndex = sourceSteps.findIndex(
  step => step.run === 'npm run test:ai-boundary-static && npm run test:secret-hygiene && npm run test:scoring',
);
assert.ok(
  generatedArtifactCleanupStepIndex > sourceAuthorityStepIndex,
  'generated provider test outputs must be cleaned after the retained provider authority suite',
);
assert.equal(
  generatedArtifactCleanupStepIndex + 1,
  staticSecurityScanStepIndex,
  'generated compile outputs must be cleaned immediately before the static security scan',
);
assert.equal(
  sourceSteps[generatedArtifactCleanupStepIndex]?.run,
  'npm run clean:enterprise-intelligence-ci',
  'Pilot Acceptance must use the reusable Enterprise Intelligence cleanup boundary',
);
const trustAuthorityStep = pilotWorkflow.jobs['source-and-journey'].steps.find(
  step => step.name === 'Trust command, query, HTTP, and boundary authority',
);
for (const requiredTrustAuthority of [
  'trustAssuranceCommand.test.ts',
  'trustAssuranceQuery.test.ts',
  'trustAssuranceHttp.test.ts',
  'checkTrustAssuranceBoundaries.mjs',
]) {
  assert.match(trustAuthorityStep?.run || '', new RegExp(requiredTrustAuthority, 'u'));
}
assert.equal(pilotWorkflow.permissions?.actions, 'read');
assert.equal(pilotWorkflow.permissions?.['id-token'], 'write');
const requiredMigrationAuthorityCommands = [
  'npm run test:migrations:pr1d',
  'npm run test:migrations:pr1f',
  'npm run test:migrations:pr1g',
  'npm run test:migrations:studio-artifacts',
];
for (const command of requiredMigrationAuthorityCommands) {
  assert.match(migrationStep?.run || '', new RegExp(`^\\s*${command}$`, 'mu'));
}

const browserStep = pilotWorkflow.jobs['browser-desktop-pixel7'].steps.find(
  step => step.name === 'Accepted canonical projections, accessibility, responsive and performance budgets',
);
const browserCommands = browserStep?.run?.trim().split('\n').map(command => command.trim());
const trustBuild = 'npx vite build --config vite.trust-assurance.config.ts';
const trustTest = 'npx playwright test --config=playwright.trust-assurance.config.ts';
for (const command of ['npm run test:browser:pr1d', 'npm run test:browser:studio-artifacts']) {
  assert.ok(browserCommands?.includes(command), `${command} must remain in authoritative browser acceptance`);
}
assert.equal(
  browserCommands?.at(-2),
  trustBuild,
  'the sequential browser job must rebuild the isolated Trust Assurance preview after retained suite builds',
);

const synthesizeGateResults = ({ source, postgres, browser }) => ({
  'canonical-journey': source,
  'tenant-adversarial': source && postgres,
  'recovery-rollback': source && postgres,
  'studio-private-artifacts': source && postgres && browser,
  'postgres-fresh-upgrade': postgres,
  'browser-desktop': browser,
  'browser-pixel7': browser,
  'accessibility-performance': browser,
  'security-hygiene': source,
});
assert.ok(Object.values(synthesizeGateResults({ source: true, postgres: true, browser: true })).every(Boolean));
assert.ok(
  Object.values(synthesizeGateResults({ source: false, postgres: true, browser: true })).some(result => !result),
  'one failed required V1 source authority suite must fail the synthesized pilot manifest gates closed',
);
assert.equal(
  browserCommands?.at(-1),
  trustTest,
  'the Trust Assurance browser suite must run immediately after its isolated preview build',
);

const trustViteConfig = await readFile('vite.trust-assurance.config.ts', 'utf8');
assert.match(
  trustViteConfig,
  /'import\.meta\.env\.VITE_AVALA_RUNTIME_MODE': JSON\.stringify\('pilot'\)/u,
  'the immutable Trust production build must embed pilot mode at build time',
);
const trustPlaywrightConfig = await readFile('playwright.trust-assurance.config.ts', 'utf8');
assert.match(
  trustPlaywrightConfig,
  /globalSetup: '.\/tests\/trust-assurance\/browser\/trustAssuranceBuiltPreviewPreflight\.ts'/u,
  'the Trust suite must fail fast when the built preview does not mount its governed harness state',
);
const trustBuiltPreviewPreflight = await readFile(
  'tests/trust-assurance/browser/trustAssuranceBuiltPreviewPreflight.ts',
  'utf8',
);
const claimsNavigation = trustBuiltPreviewPreflight.indexOf("name: 'Claims'");
const contradictionAssertion = trustBuiltPreviewPreflight.indexOf('CURRENT_CONTRADICTION');
assert.ok(
  claimsNavigation >= 0 && contradictionAssertion > claimsNavigation,
  'the Trust built-preview preflight must navigate to Claims before asserting claim content',
);

const manifestSteps = pilotWorkflow.jobs['evidence-manifest'].steps;
const gateResultsStepIndex = manifestSteps.findIndex(
  step => step.name === 'Generate exact-head pilot gate results',
);
const manifestVerificationStepIndex = manifestSteps.findIndex(
  step => step.name === 'Verify exact-head fail-closed pilot manifest',
);
assert.ok(gateResultsStepIndex >= 0, 'Pilot Acceptance must generate the exact gate-result JSON');
assert.ok(
  manifestVerificationStepIndex > gateResultsStepIndex,
  'authoritative manifest verification must run in a subsequent step after GITHUB_ENV propagation',
);
const gateResultsStep = manifestSteps[gateResultsStepIndex];
const manifestVerificationStep = manifestSteps[manifestVerificationStepIndex];
assert.match(
  gateResultsStep.run,
  /PILOT_ACCEPTANCE_GATE_RESULTS=.*JSON\.stringify\(result\)/u,
  'gate generation must export the exact result JSON through GITHUB_ENV',
);
assert.doesNotMatch(
  gateResultsStep.run,
  /verify:pilot-acceptance:authoritative/u,
  'a step must not consume a GITHUB_ENV value that it has just written',
);
assert.equal(
  manifestVerificationStep.run,
  'npm run verify:pilot-acceptance:authoritative',
  'the subsequent step must enforce the authoritative fail-closed verifier',
);
assert.equal(manifestVerificationStep.env?.GITHUB_TOKEN, '${{ github.token }}');

console.log('Workflow YAML regression checks passed.');
