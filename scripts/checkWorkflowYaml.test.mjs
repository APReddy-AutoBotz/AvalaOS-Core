import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkWorkflowYaml, parseWorkflowYaml } from './checkWorkflowYaml.mjs';

const files = await checkWorkflowYaml();
assert.ok(files.includes('v1-release-candidate.yml'));

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

const browserStep = pilotWorkflow.jobs['browser-desktop-pixel7'].steps.find(
  step => step.name === 'Accepted canonical projections, accessibility, responsive and performance budgets',
);
const browserCommands = browserStep?.run?.trim().split('\n').map(command => command.trim());
const trustBuild = 'npx vite build --config vite.trust-assurance.config.ts';
const trustTest = 'npx playwright test --config=playwright.trust-assurance.config.ts';
assert.equal(
  browserCommands?.at(-2),
  trustBuild,
  'the sequential browser job must rebuild the isolated Trust Assurance preview after retained suite builds',
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

console.log('Workflow YAML regression checks passed.');
