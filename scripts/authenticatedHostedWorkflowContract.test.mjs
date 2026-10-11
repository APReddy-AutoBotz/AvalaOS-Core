import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseWorkflowYaml } from './checkWorkflowYaml.mjs';
import { authenticatedHostedEnvironmentLines } from './prepareAuthenticatedHostedEnvironment.mjs';
import { loadCatalog, loadExecutionBindings } from './exhaustiveAcceptanceModel.mjs';

const digest = character => `sha256:${character.repeat(64)}`;

test('authenticated dispatch is protected on the one credential-bearing hosted job', async () => {
  const workflow = parseWorkflowYaml(await readFile('.github/workflows/authenticated-product-acceptance.yml', 'utf8'),
    'authenticated-product-acceptance.yml');
  assert.deepEqual(Object.keys(workflow.on).sort(), ['pull_request', 'push', 'workflow_dispatch']);
  const inputs = workflow.on.workflow_dispatch.inputs;
  assert.deepEqual(Object.keys(inputs).sort(), [
    'backend_digest', 'baseline_digest', 'exercise_digest', 'expected_project_ref', 'hosted_url',
    'migration_digest', 'migration_version', 'netlify_deploy_id', 'release_sha', 'target_public_digest',
  ]);
  assert.ok(Object.values(inputs).every(input => input.required === true));
  assert.equal(workflow.jobs['source-and-authority'].if, "github.event_name != 'workflow_dispatch'");
  assert.equal(workflow.jobs['connected-browser'].if, "github.event_name != 'workflow_dispatch'");
  const sourceAuthority = workflow.jobs['source-and-authority'].steps
    .find(step => step.name === 'Actual PostgreSQL bridge, process and provider authority');
  assert.match(sourceAuthority.run, /npm run test:authenticated-hosted:postgres/u);
  assert.equal(sourceAuthority.env.AUTHENTICATED_SYNTHETIC_DATABASE_URL,
    'postgresql://postgres:postgres@127.0.0.1:5432/postgres');
  const hosted = workflow.jobs['hosted-authenticated'];
  assert.equal(workflow.jobs['authorize-hosted'], undefined);
  assert.equal(hosted.environment, 'hosted-nonproduction-pilot');
  assert.equal(hosted.uses, undefined);
  assert.equal(hosted.secrets, undefined);
  assert.equal(hosted.env.ACCEPTANCE_WORKFLOW_PATH, '.github/workflows/exhaustive-acceptance.yml');
  assert.equal(hosted.env.AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND, 'hosted_authenticated_synthetic');
  assert.equal(hosted.env.AUTHENTICATED_ACCEPTANCE_AUTH_KIND, 'supabase_auth');
  assert.equal(hosted.env.AUTHENTICATED_ACCEPTANCE_SUPABASE_MANAGEMENT_TOKEN, undefined);
  const prepareIndex = hosted.steps.findIndex(step => step.name === 'Prepare authenticated exact source bindings');
  const retainedIndex = hosted.steps.findIndex(step => step.id === 'retained');
  assert.ok(retainedIndex >= 0 && retainedIndex < prepareIndex);
});

test('one exhaustive job owns retained, oracle, server, public browser and authenticated evidence', async () => {
  const workflow = parseWorkflowYaml(await readFile('.github/workflows/authenticated-product-acceptance.yml', 'utf8'),
    'authenticated-product-acceptance.yml');
  const steps = workflow.jobs['hosted-authenticated'].steps;
  const commands = steps.map(step => String(step.run ?? '')).join('\n');
  for (const command of [
    'node scripts/runExhaustiveRetainedSuites.mjs',
    'node scripts/runAssessV1AcceptanceOracle.mjs',
    'node scripts/produceExhaustiveServerEvidence.mjs',
    'node scripts/runAuthenticatedHostedAcceptance.mjs',
    'node scripts/produceAuthenticatedHostedEvidence.mjs',
    'npx playwright test --config=playwright.exhaustive-acceptance.config.ts --workers=1',
    'node scripts/runExhaustiveAcceptanceReport.mjs',
  ]) assert.match(commands, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.doesNotMatch(commands, /download-artifact|historical|previous[-_ ]run/iu);
  const authenticated = steps.find(step => step.id === 'authenticated');
  assert.equal(authenticated['continue-on-error'], true);
  const cli = steps.find(step => step.name === 'Install pinned Supabase CLI for deployed source attestation');
  assert.equal(cli.uses, 'supabase/setup-cli@3c2f5e2ae34c34e428e8e206e2c4d21fa2d20fbf');
  assert.equal(cli.with.version, '2.101.0');
  assert.equal(cli.if, "steps.deployment.outcome == 'success'");
  assert.ok(steps.indexOf(cli) < steps.indexOf(authenticated));
  assert.equal(authenticated.env.AUTHENTICATED_ACCEPTANCE_SUPABASE_SERVICE_ROLE_KEY,
    '${{ secrets.AUTHENTICATED_ACCEPTANCE_SUPABASE_SERVICE_ROLE_KEY }}');
  assert.equal(authenticated.env.AUTHENTICATED_ACCEPTANCE_SUPABASE_MANAGEMENT_TOKEN,
    '${{ secrets.AUTHENTICATED_ACCEPTANCE_SUPABASE_MANAGEMENT_TOKEN }}');
  assert.equal(authenticated.env.AVALA_VAULT_ADDR, '${{ vars.AVALA_VAULT_ADDR }}');
  assert.equal(authenticated.env.AVALA_VAULT_TOKEN, '${{ secrets.AVALA_VAULT_TOKEN }}');
  assert.equal(authenticated.env.AUTHENTICATED_ACCEPTANCE_VAULT_SECRET_PATH,
    '${{ vars.AUTHENTICATED_ACCEPTANCE_VAULT_SECRET_PATH }}');
  const gate = steps.find(step => step.name === 'Enforce one-run complete acceptance gates');
  assert.match(gate.run, /steps[.]authenticated[.]outcome/u);
  assert.match(gate.run, /steps[.]authenticated_evidence[.]outcome/u);
  const bindings = loadExecutionBindings();
  const catalog = loadCatalog();
  assert.equal(bindings.authenticatedTests.length, 47);
  assert.equal(bindings.hostedTests.length, 18);
  const hostedIds = new Set([...bindings.authenticatedTests, ...bindings.hostedTests].map(item => item.testId));
  assert.equal(catalog.cases.filter(item => !hostedIds.has(item.testId)).length, 43);
  assert.equal(catalog.cases.length, 108);
});

test('authenticated environment derives source identities and rejects malformed protected inputs', () => {
  const environment = {
    AUTHENTICATED_ACCEPTANCE_EXPECTED_PROJECT_REF: 'a'.repeat(20),
    AUTHENTICATED_ACCEPTANCE_TARGET_PUBLIC_DIGEST: digest('1'),
    AUTHENTICATED_ACCEPTANCE_BACKEND_DIGEST: digest('2'),
    AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION: '20261010144356',
    AUTHENTICATED_ACCEPTANCE_MIGRATION_DIGEST: digest('3'),
    AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST: digest('4'),
    AUTHENTICATED_ACCEPTANCE_BASELINE_DIGEST: digest('5'),
  };
  const lines = authenticatedHostedEnvironmentLines(environment, { catalog: { cases: [] }, provenance: { sourceDigests: {} } });
  assert.ok(lines.includes('AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND=hosted_authenticated_synthetic'));
  assert.ok(lines.some(line => line.startsWith('AUTHENTICATED_ACCEPTANCE_CATALOG_DIGEST=sha256:')));
  assert.ok(lines.some(line => line.startsWith('AUTHENTICATED_ACCEPTANCE_SOURCE_DIGEST=sha256:')));
  assert.ok(lines.every(line => !/SERVICE_ROLE|DATABASE_URL|AUTHENTICATED_ACCEPTANCE_SCOPE/u.test(line)));
  assert.throws(() => authenticatedHostedEnvironmentLines({ ...environment,
    AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION: 'latest' }, { catalog: {}, provenance: { sourceDigests: {} } }),
  /AUTHENTICATED_HOSTED_ENVIRONMENT_REJECTED/u);
});
