import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseWorkflowYaml } from './checkWorkflowYaml.mjs';
import { authenticatedHostedEnvironmentLines } from './prepareAuthenticatedHostedEnvironment.mjs';
import { loadCatalog, loadExecutionBindings } from './exhaustiveAcceptanceModel.mjs';

const digest = character => `sha256:${character.repeat(64)}`;

test('real declaration listing needs no protected hosted caller identity', () => {
  const release = 'a'.repeat(40);
  const result = spawnSync(process.execPath, [
    'node_modules/playwright/cli.js', 'test', '--config=playwright.exhaustive-acceptance.config.ts', '--list', '--reporter=list',
  ], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env,
      GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'APReddy-AutoBotz/AvalaOS-Core',
      GITHUB_WORKFLOW_REF: 'APReddy-AutoBotz/AvalaOS-Core/.github/workflows/authenticated-product-acceptance.yml@refs/pull/289/merge',
      GITHUB_EVENT_NAME: 'pull_request', GITHUB_JOB: 'preactivation-checkout',
      RELEASE_SHA: release, EXPECTED_RELEASE_SHA: release, ACCEPTANCE_RELEASE_SHA: release,
      ACCEPTANCE_EXECUTION_KIND: 'declaration_only', HOSTED_PILOT_URL: '', NETLIFY_DEPLOY_ID: '',
      LOCAL_ACCEPTANCE_BASE_URL: '', ACCEPTANCE_CHECKOUT_SHA: '', ACCEPTANCE_INVOCATION_ID: '',
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Total: 36 tests in 1 file/u);
});

test('ordinary Linux CI replays the actual local preactivation commands without hosted authority', async () => {
  const workflow = parseWorkflowYaml(await readFile('.github/workflows/authenticated-product-acceptance.yml', 'utf8'));
  const replay = workflow.jobs['preactivation-checkout'];
  const hosted = workflow.jobs['hosted-authenticated'];
  assert.equal(replay.if, "github.event_name != 'workflow_dispatch'");
  assert.equal(replay['runs-on'], 'ubuntu-latest');
  assert.equal(replay.environment, undefined);
  assert.deepEqual(replay.permissions, { contents: 'read' });
  assert.deepEqual(replay.services, hosted.services);
  assert.doesNotMatch(JSON.stringify(replay), /secrets\.|vars\.|inputs\.|runAuthenticatedHostedAcceptance|verify-hosted-deployment|prepareAuthenticatedHostedEnvironment/u);
  assert.equal(replay.env.HOSTED_PILOT_URL, 'https://preactivation.invalid');
  const normalize = value => JSON.parse(JSON.stringify(value).replaceAll('${{ inputs.release_sha }}', '${{ env.RELEASE_SHA }}'));
  const check = 'node scripts/authenticatedHostedCheckout.mjs || { git status --porcelain=v1 --untracked-files=all; exit 1; }';
  for (const [name, value] of Object.entries(hosted.env)) {
    if (['RELEASE_SHA', 'NETLIFY_DEPLOY_ID', 'HOSTED_PILOT_URL', 'AUTHENTICATED_ACCEPTANCE_MODE'].includes(name)) continue;
    assert.equal(replay.env[name], value, `${name} must match protected preactivation output/environment binding`);
  }
  assert.equal(replay.env.AUTHENTICATED_ACCEPTANCE_MODE, 'full_acceptance');
  assert.equal(hosted.env.AUTHENTICATED_ACCEPTANCE_MODE, '${{ inputs.acceptance_mode }}');
  for (const name of [
    'Validate catalogs, evidence and hosted contracts',
    'Run exact-run retained server-authority suites',
    'Run independent assessment oracle against production scoring',
    'Run same-run disposable PostgreSQL server evidence',
    'Validate deterministic public hosted declarations',
    'Install official Chromium',
  ]) {
    const original = hosted.steps.find(step => step.name === name);
    const actual = replay.steps.find(step => step.name === name);
    assert.deepEqual(actual.env, normalize(original.env ?? null) ?? undefined, `${name}: environment parity`);
    assert.equal(actual['continue-on-error'], undefined);
    assert.equal(actual.run.trim(), [check, ...original.run.trim().split('\n').flatMap(line => [line, check])].join('\n'), `${name}: command and checkout-check parity`);
  }
  assert.equal(replay.steps.some(step => String(step.uses ?? '').startsWith('supabase/setup-cli@')), false);
  const decoderProbe = replay.steps.find(step => step.name === 'Verify original source attestation against loopback multipart');
  assert.equal(decoderProbe.run.trim(), `node scripts/testAuthenticatedSupabaseMultipart.mjs\n${check}`);
  assert.equal(decoderProbe.env, undefined);
  assert.equal(decoderProbe['continue-on-error'], undefined);
  const bootstrap = replay.steps.find(step => step.name === 'Verify real hosted browser bootstrap without credentials');
  assert.equal(bootstrap.run.trim(), `node scripts/testAuthenticatedHostedBootstrap.mjs\n${check}`);
  assert.equal(bootstrap.env, undefined);
  assert.equal(bootstrap['continue-on-error'], undefined);
  const preauth = replay.steps.find(step => step.name === 'Verify pre-sign-in tracking across two local origins');
  assert.equal(preauth.run.trim(), `node scripts/testAuthenticatedHostedPreauthTracking.mjs\n${check}`);
  assert.equal(preauth.env, undefined);
  assert.equal(preauth['continue-on-error'], undefined);
  const signInEntry = replay.steps.find(step => step.name === 'Verify actual application sign-in entry without credentials');
  assert.equal(signInEntry.run.trim(), `node scripts/testAuthenticatedHostedSignInEntry.mjs\n${check}`);
  assert.equal(signInEntry.env, undefined);
  assert.equal(signInEntry['continue-on-error'], undefined);
  const processReads = replay.steps.find(step => step.name === 'Verify completed process-read failure states');
  assert.equal(processReads.run.trim(), `node scripts/testAuthenticatedHostedSignInEntry.mjs --process-read-state\n${check}`);
  assert.equal(processReads.env, undefined);
  assert.equal(processReads['continue-on-error'], undefined);
  assert.equal(replay.steps.at(-1).if, 'always()');
  assert.equal(replay.steps.at(-1).run.trim(), check);
});

test('authenticated dispatch is protected on the one credential-bearing hosted job', async () => {
  const workflow = parseWorkflowYaml(await readFile('.github/workflows/authenticated-product-acceptance.yml', 'utf8'),
    'authenticated-product-acceptance.yml');
  assert.deepEqual(Object.keys(workflow.on).sort(), ['pull_request', 'push', 'workflow_dispatch']);
  const inputs = workflow.on.workflow_dispatch.inputs;
  assert.deepEqual(Object.keys(inputs).sort(), [
    'acceptance_mode', 'backend_digest', 'baseline_digest', 'exercise_digest', 'expected_project_ref', 'hosted_url',
    'migration_digest', 'migration_version', 'netlify_deploy_id', 'release_sha', 'target_public_digest',
  ]);
  assert.ok(Object.values(inputs).every(input => input.required === true));
  assert.deepEqual(inputs.acceptance_mode, { description: 'Protected hosted execution mode', required: true,
    default: 'full_acceptance', type: 'choice', options: ['full_acceptance', 'v2_primary_prefix_diagnostic'] });
  assert.equal(workflow.jobs['source-and-authority'].if, "github.event_name != 'workflow_dispatch'");
  assert.equal(workflow.jobs['connected-browser'].if, "github.event_name != 'workflow_dispatch'");
  const sourceAuthority = workflow.jobs['source-and-authority'].steps
    .find(step => step.name === 'Actual PostgreSQL bridge, process and provider authority');
  assert.match(sourceAuthority.run, /npm run test:authenticated-hosted:postgres/u);
  assert.match(workflow.jobs['source-and-authority'].steps
    .find(step => step.name === 'Feature contracts and evidence rejection').run,
  /npm run test:provider-secret-backend/u);
  const nativeBackend=workflow.jobs['native-provider-secret-backend'];
  assert.equal(nativeBackend.if,"github.event_name != 'workflow_dispatch'");
  assert.equal(nativeBackend.services['supabase-vault-postgres'].image,
    'supabase/postgres:17.6.1.166@sha256:d5424e9f4d0c21d63991c3f3dd77881f23f722c3a212452a61bc91924b79e8c8');
  assert.equal(sourceAuthority.env.AUTHENTICATED_SYNTHETIC_DATABASE_URL,
    'postgresql://postgres:postgres@127.0.0.1:5432/postgres');
  const nativeStep=nativeBackend.steps.find(step=>step.name==='Actual Supabase Vault provider-secret authority');
  assert.equal(nativeStep.env.SUPABASE_PROVIDER_SECRET_BACKEND_DATABASE_URL,
    'postgresql://postgres:postgres@127.0.0.1:5432/postgres');
  assert.equal(nativeStep.run,'npm run test:provider-secret-backend:postgres');
  const hosted = workflow.jobs['hosted-authenticated'];
  assert.equal(workflow.jobs['authorize-hosted'], undefined);
  assert.equal(hosted.environment, 'hosted-nonproduction-pilot');
  assert.equal(hosted.uses, undefined);
  assert.equal(hosted.secrets, undefined);
  assert.equal(hosted.env.ACCEPTANCE_WORKFLOW_PATH, '.github/workflows/exhaustive-acceptance.yml');
  assert.equal(hosted.env.AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND, 'hosted_authenticated_synthetic');
  assert.equal(hosted.env.AUTHENTICATED_ACCEPTANCE_AUTH_KIND, 'supabase_auth');
  assert.equal(hosted.env.AUTHENTICATED_ACCEPTANCE_MODE, '${{ inputs.acceptance_mode }}');
  assert.equal(hosted.env.AUTHENTICATED_ACCEPTANCE_SECRET_BACKEND, 'supabase_vault');
  assert.equal(hosted.env.AVALA_PROVIDER_SECRET_BACKEND, 'supabase_vault');
  assert.equal(hosted.env.AUTHENTICATED_ACCEPTANCE_SUPABASE_MANAGEMENT_TOKEN, undefined);
  for (const [name, expected] of Object.entries({
    RETAINED_RESULTS_MANIFEST: '/tmp/avalaos-retained-results.json',
    ORACLE_RESULTS_MANIFEST: '/tmp/avalaos-oracle-results.json',
    SUT_RESULTS_MANIFEST: '/tmp/avalaos-sut-oracle-results.json',
    SERVER_RESULTS_MANIFEST: '/tmp/avalaos-server-results.json',
  })) {
    assert.equal(hosted.env[name], expected, `${name} must remain outside the exact-release checkout before activation`);
  }
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
  assert.equal(steps.some(step => String(step.uses ?? '').startsWith('supabase/setup-cli@')), false);
  assert.equal(authenticated.env.AUTHENTICATED_ACCEPTANCE_SUPABASE_SERVICE_ROLE_KEY,
    '${{ secrets.AUTHENTICATED_ACCEPTANCE_SUPABASE_SERVICE_ROLE_KEY }}');
  assert.equal(authenticated.env.AUTHENTICATED_ACCEPTANCE_SUPABASE_MANAGEMENT_TOKEN,
    '${{ secrets.AUTHENTICATED_ACCEPTANCE_SUPABASE_MANAGEMENT_TOKEN }}');
  assert.equal(authenticated.env.AVALA_VAULT_ADDR, undefined);
  assert.equal(authenticated.env.AVALA_VAULT_TOKEN, undefined);
  assert.equal(authenticated.env.AUTHENTICATED_ACCEPTANCE_VAULT_SECRET_PATH, undefined);
  for (const id of ['retained', 'oracle', 'server', 'authenticated_evidence', 'hosted', 'report']) {
    const step = steps.find(item => item.id === id);
    assert.match(step.if, /inputs[.]acceptance_mode == 'full_acceptance'/u, `${id} must remain full-mode only`);
  }
  const staging = steps.find(step => step.name === 'Stage sanitized same-run manifests');
  assert.equal(staging.if, "always() && inputs.acceptance_mode == 'full_acceptance'");
  assert.ok(steps.indexOf(staging) > steps.indexOf(authenticated));
  assert.match(staging.run,
    /test -f "\$SUT_RESULTS_MANIFEST" && cp "\$SUT_RESULTS_MANIFEST" acceptance-results\/sut-oracle-results[.]json/u);
  assert.match(staging.run, /test -f \/tmp\/authenticated-hosted-diagnostic[.]json && cp \/tmp\/authenticated-hosted-diagnostic[.]json acceptance-results\/authenticated-hosted-diagnostic[.]json/u);
  const upload = steps.find(step => step.name === 'Upload sanitized same-run acceptance evidence');
  assert.equal(upload.if, "always() && inputs.acceptance_mode == 'full_acceptance'");
  assert.match(upload.with.path, /acceptance-results\//u);
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

test('V2 diagnostic dispatch is isolated from full evidence and has a dedicated non-promotion gate', async () => {
  const workflow = parseWorkflowYaml(await readFile('.github/workflows/authenticated-product-acceptance.yml', 'utf8'),
    'authenticated-product-acceptance.yml');
  const steps = workflow.jobs['hosted-authenticated'].steps;
  const stage = steps.find(step => step.name === 'Stage sanitized V2 primary-prefix diagnostic');
  const upload = steps.find(step => step.name === 'Upload sanitized V2 primary-prefix diagnostic');
  const gate = steps.find(step => step.name === 'Enforce V2 primary-prefix diagnostic gate');
  assert.equal(stage.if, "always() && inputs.acceptance_mode == 'v2_primary_prefix_diagnostic'");
  assert.match(stage.run, /authenticated-v2-primary-prefix-diagnostic[.]json/u);
  assert.match(stage.run, /authenticated-hosted-diagnostic[.]json/u);
  assert.doesNotMatch(stage.run, /RETAINED_RESULTS|ORACLE_RESULTS|SERVER_RESULTS|AUTHENTICATED_RESULTS/u);
  assert.equal(upload.if, "always() && inputs.acceptance_mode == 'v2_primary_prefix_diagnostic'");
  assert.equal(upload.with.path, 'diagnostic-results/');
  assert.doesNotMatch(JSON.stringify(upload), /acceptance-results|artifacts\/exhaustive/u);
  assert.equal(gate.if, "always() && inputs.acceptance_mode == 'v2_primary_prefix_diagnostic'");
  assert.match(gate.run, /diagnosticCompleted/u);
  assert.match(gate.run, /acceptancePromoted/u);
  assert.match(gate.run, /cleanup/u);
  assert.doesNotMatch(gate.run, /authenticated_evidence|steps[.]hosted|steps[.]report/u);
  const fullGate = steps.find(step => step.name === 'Enforce one-run complete acceptance gates');
  assert.equal(fullGate.if, "always() && inputs.acceptance_mode == 'full_acceptance'");
  const authenticated = steps.find(step => step.id === 'authenticated');
  assert.equal(authenticated.env.AUTHENTICATED_ACCEPTANCE_MODE, undefined,
    'the job-level exact mode binding must be the sole child mode source');
});

test('authenticated environment derives source identities and rejects malformed protected inputs', () => {
  const environment = {
    AUTHENTICATED_ACCEPTANCE_EXPECTED_PROJECT_REF: 'a'.repeat(20),
    AUTHENTICATED_ACCEPTANCE_TARGET_PUBLIC_DIGEST: digest('1'),
    AUTHENTICATED_ACCEPTANCE_BACKEND_DIGEST: digest('2'),
    AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION: '20261011053000',
    AUTHENTICATED_ACCEPTANCE_MIGRATION_DIGEST: digest('3'),
    AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST: digest('4'),
    AUTHENTICATED_ACCEPTANCE_BASELINE_DIGEST: digest('5'),
    AUTHENTICATED_ACCEPTANCE_SECRET_BACKEND: 'supabase_vault',
    AVALA_PROVIDER_SECRET_BACKEND: 'supabase_vault',
  };
  const lines = authenticatedHostedEnvironmentLines(environment, { catalog: { cases: [] }, provenance: { sourceDigests: {} } });
  assert.ok(lines.includes('AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND=hosted_authenticated_synthetic'));
  assert.ok(lines.includes('AUTHENTICATED_ACCEPTANCE_SECRET_BACKEND=supabase_vault'));
  assert.ok(lines.some(line => line.startsWith('AUTHENTICATED_ACCEPTANCE_CATALOG_DIGEST=sha256:')));
  assert.ok(lines.some(line => line.startsWith('AUTHENTICATED_ACCEPTANCE_SOURCE_DIGEST=sha256:')));
  assert.ok(lines.every(line => !/SERVICE_ROLE|DATABASE_URL|AUTHENTICATED_ACCEPTANCE_SCOPE/u.test(line)));
  assert.throws(() => authenticatedHostedEnvironmentLines({ ...environment,
    AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION: 'latest' }, { catalog: {}, provenance: { sourceDigests: {} } }),
  /AUTHENTICATED_HOSTED_ENVIRONMENT_REJECTED/u);
  assert.throws(() => authenticatedHostedEnvironmentLines({ ...environment,
    AVALA_PROVIDER_SECRET_BACKEND: 'hashicorp_vault' }, { catalog: {}, provenance: { sourceDigests: {} } }),
  /AUTHENTICATED_HOSTED_ENVIRONMENT_REJECTED/u);
});
