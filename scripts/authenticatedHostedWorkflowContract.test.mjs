import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseWorkflowYaml } from './checkWorkflowYaml.mjs';
import { authenticatedHostedEnvironmentLines } from './prepareAuthenticatedHostedEnvironment.mjs';
import { loadCatalog, loadExecutionBindings } from './exhaustiveAcceptanceModel.mjs';

const digest = character => `sha256:${character.repeat(64)}`;

test('connected browser failures retain a separate verified sanitized diagnostic without weakening acceptance', async () => {
  const workflow = parseWorkflowYaml(await readFile('.github/workflows/authenticated-product-acceptance.yml', 'utf8'));
  const job = workflow.jobs['connected-browser'];
  const index = job.steps.findIndex(step => step.name === 'Actual product cases on desktop and Pixel 7');
  const command = job.steps[index];
  const verify = job.steps[index + 1];
  const upload = job.steps[index + 2];
  assert.equal(job['timeout-minutes'], 35);
  assert.equal(job.if, "github.event_name != 'workflow_dispatch'");
  assert.equal(command.run, 'node scripts/runEnterpriseLifecycleAcceptanceBrowser.mjs --authenticated');
  assert.equal(command['continue-on-error'], undefined);
  assert.equal(verify.if, 'always()');
  assert.equal(verify.id, 'connected_browser_diagnostic_verify');
  assert.equal(verify.run, 'node scripts/verifyConnectedBrowserDiagnostics.mjs --retain-incomplete');
  assert.equal(verify['continue-on-error'], undefined);
  assert.equal(upload.if, "always() && steps.connected_browser_diagnostic_verify.outcome == 'success'");
  assert.equal(upload.uses, 'actions/upload-artifact@v4');
  assert.deepEqual(upload.with, {
    name: 'connected-browser-diagnostic-${{ env.RELEASE_SHA }}-${{ github.run_id }}-${{ github.run_attempt }}',
    path: 'output/acceptance/authenticated-product/connected-browser-diagnostic.json',
    'if-no-files-found': 'error', 'retention-days': 14,
  });
  const acceptance = job.steps[index + 3];
  assert.equal(acceptance.run, 'node scripts/verifyAuthenticatedLocalEvidence.mjs output/acceptance/authenticated-product/local-evidence.json');
  assert.equal(acceptance.if, undefined);
  assert.equal(acceptance['continue-on-error'], undefined);
  assert.equal(job.steps[index + 4].with.path, 'output/acceptance/authenticated-product/local-evidence.json');
  assert.doesNotMatch(JSON.stringify([command, verify, upload]), /secrets\.|vars\.|inputs\.|full_acceptance|\.zip|\.log|trace|screenshot|retry/u);
});

test('Studio persona proof rejects stale outputs and independently verifies handoff readiness', async () => {
  const workflow = parseWorkflowYaml(await readFile('.github/workflows/authenticated-product-acceptance.yml', 'utf8'));
  const job = workflow.jobs['connected-browser'];
  const proof = job.steps.find(step => step.name === 'Verify exact Studio handoff personas on Desktop and Pixel');
  assert.equal(proof.env.STUDIO_HANDOFF_PERSONA_ATTEMPT,
    'output/local-private/authenticated-product-acceptance/studio-handoff-persona');
  assert.equal(proof.env.PLAYWRIGHT_BROWSERS_PATH, undefined);
  assert.equal(proof.run.trim(), 'test ! -e "$STUDIO_HANDOFF_PERSONA_ATTEMPT"\n'
    + 'node scripts/reproduceStudioHandoffPersonaContract.mjs\n'
    + 'node scripts/studioHandoffPersonaArtifact.mjs "$STUDIO_HANDOFF_PERSONA_ATTEMPT"');
  assert.match(workflow.jobs['source-and-authority'].steps
    .find(step => step.name === 'Feature contracts and evidence rejection').run,
    /node --test scripts\/studioHandoffPersonaArtifact\.test\.mjs/u);
  assert.match(workflow.jobs['source-and-authority'].steps
    .find(step => step.name === 'Feature contracts and evidence rejection').run,
    /node --test scripts\/studioHandoffActionTargeting\.test\.mjs/u);
  assert.match(workflow.jobs['source-and-authority'].steps
    .find(step => step.name === 'Feature contracts and evidence rejection').run,
    /node --test scripts\/runStudioHandoffActionTargetingBrowser\.test\.mjs/u);
  assert.match(workflow.jobs['source-and-authority'].steps
    .find(step => step.name === 'Feature contracts and evidence rejection').run,
    /node scripts\/runPr1fTypeScriptTest\.mjs tests\/browser\/productNavigationReadiness\.ts tests\/browser\/authenticatedLifecycleHarness\.ts tests\/browser\/authenticatedLifecycleHarness\.test\.ts/u);
  assert.match(workflow.jobs['source-and-authority'].steps
    .find(step => step.name === 'Feature contracts and evidence rejection').run,
    /node scripts\/runPr1fTypeScriptTest\.mjs components\/docs\/studioHandoffReadiness\.ts components\/docs\/studioHandoffReadiness\.test\.ts/u);
  const retain = job.steps.find(step => step.name === 'Retain sanitized Studio handoff persona proof');
  assert.equal(retain.if, 'always()');
  assert.equal(retain.with.name, 'studio-handoff-persona-${{ env.RELEASE_SHA }}-${{ github.run_id }}-${{ github.run_attempt }}');
  assert.equal(retain.with['if-no-files-found'], 'error');
});

test('candidate and release retain one source-bound eligible reviewer request diagnostic archive', async () => {
  const workflow = parseWorkflowYaml(await readFile('.github/workflows/authenticated-product-acceptance.yml', 'utf8'));
  const job = workflow.jobs['connected-browser'];
  const proof = job.steps.find(step => step.name === 'Verify eligible reviewer request diagnostics in Chromium');
  assert.deepEqual(proof.env, {
    ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTICS_EVIDENCE_DIR:
      'output/local-private/authenticated-product-acceptance/eligible-reviewer-request-diagnostics/attempt-1',
    ELIGIBLE_REVIEWER_DIAGNOSTICS_RELEASE_SHA: '${{ env.RELEASE_SHA }}',
    ELIGIBLE_REVIEWER_DIAGNOSTICS_RUN_ID: '${{ github.run_id }}',
    ELIGIBLE_REVIEWER_DIAGNOSTICS_RUN_ATTEMPT: '${{ github.run_attempt }}',
    ELIGIBLE_REVIEWER_DIAGNOSTICS_JOB: 'connected-browser',
  });
  assert.equal(proof.run.trim(), 'test ! -e "$ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTICS_EVIDENCE_DIR"\n'
    + 'node scripts/runEligibleReviewerRequestDiagnosticsBrowser.mjs');
  assert.equal(proof.env.PLAYWRIGHT_BROWSERS_PATH, undefined,
    'CI must use the Chromium cache populated by the standard Playwright install');
  const retain = job.steps.find(step => step.name === 'Retain sanitized eligible reviewer request diagnostics');
  assert.equal(retain.if, 'always()');
  assert.equal(retain.uses, 'actions/upload-artifact@v4');
  assert.equal(retain.with.name,
    'eligible-reviewer-request-diagnostics-${{ env.RELEASE_SHA }}-${{ github.run_id }}-${{ github.run_attempt }}');
  assert.deepEqual(retain.with.path.trim().split(/\r?\n/u), [
    'output/local-private/authenticated-product-acceptance/eligible-reviewer-request-diagnostics/attempt-1/cleanup.json',
    'output/local-private/authenticated-product-acceptance/eligible-reviewer-request-diagnostics/attempt-1/diagnostic.json',
    'output/local-private/authenticated-product-acceptance/eligible-reviewer-request-diagnostics/attempt-1/result.json',
    'output/local-private/authenticated-product-acceptance/eligible-reviewer-request-diagnostics/attempt-1/source-bindings.json',
  ]);
  assert.equal(retain.with['if-no-files-found'], 'error');
  const installIndex = job.steps.findIndex(step => step.run === 'npx playwright install --with-deps chromium');
  assert.ok(installIndex >= 0 && installIndex < job.steps.indexOf(proof));
  assert.doesNotMatch(JSON.stringify([proof, retain]),
    /secrets[.]|vars[.]|DATABASE_URL|SERVICE_ROLE|MANAGEMENT_TOKEN|full_acceptance|[.]log|[.]zip/u);
});

test('candidate and release require isolated Reviewer-ready proof with a fresh sanitized archive', async () => {
  const workflow = parseWorkflowYaml(await readFile('.github/workflows/authenticated-product-acceptance.yml', 'utf8'));
  const job = workflow.jobs['connected-browser'];
  assert.equal(job.if, "github.event_name != 'workflow_dispatch'");
  assert.equal(job.environment, undefined);
  const proof = job.steps.find(step => step.name === 'Verify Reviewer-ready projection loading on Desktop and Pixel');
  assert.deepEqual(proof.env, {
    REVIEWER_READY_AFTER_ATTEMPT: 'output/local-private/authenticated-product-acceptance/reviewer-ready-projection',
  });
  assert.equal(proof.run.trim(), 'test ! -e "$REVIEWER_READY_AFTER_ATTEMPT"\nnpm run test:reviewer-ready:browser');
  const retain = job.steps.find(step => step.name === 'Retain sanitized Reviewer-ready projection proof');
  assert.equal(retain.if, 'always()');
  assert.equal(retain.uses, 'actions/upload-artifact@v4');
  assert.equal(retain.with.name, 'reviewer-ready-projection-${{ env.RELEASE_SHA }}-${{ github.run_id }}-${{ github.run_attempt }}');
  assert.equal(retain.with.path, proof.env.REVIEWER_READY_AFTER_ATTEMPT + '/');
  assert.equal(retain.with['if-no-files-found'], 'error');
  assert.doesNotMatch(JSON.stringify([proof, retain]), /secrets\.|vars\.|inputs\.|full_acceptance/u);
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  assert.match(packageJson.scripts['test:reviewer-ready:browser'], /REVIEWER_READY_MODE='after'/u);
  const runner = await readFile('scripts/reproduceReviewerReadyCandidateLatency.mjs', 'utf8');
  assert.match(runner, /mode === 'after' \? process\.env\.REVIEWER_READY_AFTER_ATTEMPT/u);
  assert.doesNotMatch(runner, /PLAYWRIGHT_BROWSERS_PATH\s*:/u,
    'an unset parent must retain Playwright default cache discovery');
  assert.match(runner, /const env = \{\s*\.\.\.process\.env,/u,
    'an explicit parent Playwright cache override must be inherited');
  assert.match(runner, /browserExit = await run\([\s\S]+?\{\s*\.\.\.env,/u,
    'the browser child must retain the inherited environment');
  const installIndex = job.steps.findIndex(step => step.run === 'npx playwright install --with-deps chromium');
  assert.ok(installIndex >= 0 && installIndex < job.steps.indexOf(proof),
    'the default Playwright browser install must precede Reviewer-ready proof');
});

test('candidate and release preparation require isolated semantic replay proof and sanitized retention', async () => {
  const workflow = parseWorkflowYaml(await readFile('.github/workflows/authenticated-product-acceptance.yml', 'utf8'));
  const job = workflow.jobs['source-and-authority'];
  assert.equal(job.if, "github.event_name != 'workflow_dispatch'");
  assert.equal(job.environment, undefined);
  const proof = job.steps.find(step => step.name === 'Verify fresh-request reviewer replay against PostgreSQL');
  assert.equal(proof.run, 'npm run test:authenticated-reviewer-selection:postgres');
  assert.deepEqual(proof.env, {
    AUTHENTICATED_HOSTED_CONTROLLER_DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
    AUTHENTICATED_LOCAL_PROOF_DIRECTORY: 'output/local-private/reviewer-semantic-replay',
  });
  const retain = job.steps.find(step => step.name === 'Retain sanitized reviewer semantic replay proof');
  assert.equal(retain.if, 'always()');
  assert.equal(retain.with.path, 'output/local-private/reviewer-semantic-replay/reviewer-selection-server-binding-proof.json');
  assert.equal(retain.with['if-no-files-found'], 'error');
  assert.equal(retain.with.name, 'reviewer-semantic-replay-${{ env.RELEASE_SHA }}-${{ github.run_id }}-${{ github.run_attempt }}');
  assert.doesNotMatch(JSON.stringify([proof, retain]), /secrets\.|vars\.|inputs\.|full_acceptance/u);
});

test('explicit Netlify skip prevents preview inspection without suppressing local acceptance checks', async () => {
  const preview = parseWorkflowYaml(await readFile('.github/workflows/preview-exhaustive-browser-qa.yml', 'utf8'),
    'preview-exhaustive-browser-qa.yml');
  assert.equal(preview.jobs['select-pr264-controlled-preview'].if,
    "${{ !contains(github.event.pull_request.title, '[skip netlify]') }}");
  assert.equal(preview.jobs['preview-exhaustive-browser-qa'].needs, 'select-pr264-controlled-preview');
  assert.equal(preview.jobs['preview-exhaustive-browser-qa'].if, undefined,
    'preview inspection must retain the dependency success gate rather than run after a skipped selector');
  const acceptance = await readFile('.github/workflows/authenticated-product-acceptance.yml', 'utf8');
  assert.doesNotMatch(acceptance, /contains\(github\.event\.pull_request\.title/u);
});

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

test('actual declaration command isolates the preceding local build without erasing runtime identity', async () => {
  const workflow = parseWorkflowYaml(await readFile('.github/workflows/authenticated-product-acceptance.yml', 'utf8'));
  const release = 'a'.repeat(40);
  const inherited = { ...process.env, RELEASE_SHA: release,
    ACCEPTANCE_EXECUTION_KIND: 'local_real_backend', HOSTED_PILOT_URL: 'http://127.0.0.1:4173',
    NETLIFY_DEPLOY_ID: '', AUTHENTICATED_ACCEPTANCE_BUILD_DIGEST: digest('6'),
    AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND: 'local_real_backend_authenticated',
    LOCAL_ACCEPTANCE_BASE_URL: '', ACCEPTANCE_CHECKOUT_SHA: '', ACCEPTANCE_INVOCATION_ID: '',
  };
  for (const jobName of ['hosted-authenticated', 'preactivation-checkout']) {
    const step = workflow.jobs[jobName].steps.find(item => item.name === 'Validate deterministic public hosted declarations');
    const overrides = Object.fromEntries(Object.entries(step.env).map(([key, value]) => [key,
      String(value).replace('${{ inputs.release_sha }}', release).replace('${{ env.RELEASE_SHA }}', release)]));
    const result = spawnSync(process.execPath, [
      'node_modules/playwright/cli.js', 'test', '--config=playwright.exhaustive-acceptance.config.ts', '--list', '--reporter=list',
    ], { encoding: 'utf8', windowsHide: true, env: { ...inherited, ...overrides } });
    assert.equal(result.status, 0, `${jobName}: ${result.stderr}`);
    assert.match(result.stdout, /Total: 36 tests in 1 file/u);
    assert.equal(inherited.AUTHENTICATED_ACCEPTANCE_BUILD_DIGEST, digest('6'));
    assert.equal(inherited.ACCEPTANCE_EXECUTION_KIND, 'local_real_backend');
  }
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
    if (['RELEASE_SHA', 'NETLIFY_DEPLOY_ID', 'HOSTED_PILOT_URL', 'AUTHENTICATED_ACCEPTANCE_MODE',
      'ACCEPTANCE_EXECUTION_KIND', 'AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND',
      'AUTHENTICATED_ACCEPTANCE_FRONTEND_KIND'].includes(name)) continue;
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
  const localBuildSmoke = replay.steps.find(step => step.name === 'Verify exact local build in secure loopback browser');
  assert.match(localBuildSmoke.run, /localAcceptanceBuild[.]mjs smoke/u);
  assert.match(localBuildSmoke.run, /authenticatedHostedCheckout[.]mjs/u);
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
  const navigation = replay.steps.find(step => step.name === 'Verify scoped navigation while unrelated Delivery reads are pending');
  assert.equal(navigation.run.trim(), `node scripts/testAuthenticatedHostedSignInEntry.mjs --scoped-navigation\n${check}`);
  assert.equal(navigation.env, undefined);
  assert.equal(navigation['continue-on-error'], undefined);
  const navigationEvidence = replay.steps.find(step => step.name === 'Retain scoped navigation preparation evidence');
  assert.equal(navigationEvidence.if, 'always()');
  assert.equal(navigationEvidence.uses, 'actions/upload-artifact@v4');
  assert.equal(navigationEvidence.with.name, 'authenticated-scoped-navigation-${{ env.RELEASE_SHA }}-${{ github.run_id }}-${{ github.run_attempt }}');
  assert.equal(navigationEvidence.with.path, 'output/local-private/authenticated-product-acceptance/scoped-navigation-corrected.jsonl');
  assert.equal(navigationEvidence.with['if-no-files-found'], 'error');
  assert.equal(replay.steps.at(-1).if, 'always()');
  assert.equal(replay.steps.at(-1).run.trim(), check);
});

test('authenticated dispatch is protected on the one credential-bearing hosted job', async () => {
  const workflow = parseWorkflowYaml(await readFile('.github/workflows/authenticated-product-acceptance.yml', 'utf8'),
    'authenticated-product-acceptance.yml');
  assert.deepEqual(Object.keys(workflow.on).sort(), ['pull_request', 'push', 'workflow_dispatch']);
  const inputs = workflow.on.workflow_dispatch.inputs;
  assert.deepEqual(Object.keys(inputs).sort(), [
    'acceptance_mode', 'backend_digest', 'baseline_digest', 'exercise_digest', 'expected_project_ref', 'frontend_kind',
    'hosted_url', 'migration_digest', 'migration_version', 'netlify_deploy_id', 'release_sha', 'target_public_digest',
  ]);
  assert.equal(inputs.hosted_url.required, false);
  assert.equal(inputs.hosted_url.default, '');
  assert.equal(inputs.netlify_deploy_id.required, false);
  assert.equal(inputs.netlify_deploy_id.default, '');
  assert.ok(Object.entries(inputs).filter(([name]) => !['hosted_url', 'netlify_deploy_id'].includes(name))
    .every(([, input]) => input.required === true));
  assert.deepEqual(inputs.frontend_kind, { description: 'Exact acceptance frontend source', required: true,
    default: 'local_build', type: 'choice', options: ['local_build', 'netlify'] });
  assert.deepEqual(inputs.acceptance_mode, { description: 'Protected hosted execution mode', required: true,
    default: 'full_acceptance', type: 'choice', options: ['full_acceptance', 'v2_primary_prefix_diagnostic',
      'reviewer_selection_diagnostic', 'govern_studio_diagnostic'] });
  assert.equal(workflow.jobs['source-and-authority'].if, "github.event_name != 'workflow_dispatch'");
  assert.equal(workflow.jobs['connected-browser'].if, "github.event_name != 'workflow_dispatch'");
  const sourceAuthority = workflow.jobs['source-and-authority'].steps
    .find(step => step.name === 'Actual PostgreSQL bridge, process and provider authority');
  assert.match(sourceAuthority.run, /npm run test:authenticated-hosted:postgres/u);
  assert.match(workflow.jobs['source-and-authority'].steps
    .find(step => step.name === 'Feature contracts and evidence rejection').run,
  /npm run test:provider-secret-backend/u);
  assert.match(workflow.jobs['source-and-authority'].steps
    .find(step => step.name === 'Feature contracts and evidence rejection').run,
  /node scripts\/runPr1fTypeScriptTest\.mjs services\/deliveryReadiness\.ts services\/deliveryReadiness\.test\.ts/u);
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
  assert.equal(hosted.env.ACCEPTANCE_EXECUTION_KIND,
    "${{ inputs.frontend_kind == 'local_build' && 'local_real_backend' || 'hosted_preview' }}");
  assert.equal(hosted.env.AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND,
    "${{ inputs.frontend_kind == 'local_build' && 'local_real_backend_authenticated' || 'hosted_authenticated_synthetic' }}");
  assert.equal(hosted.env.AUTHENTICATED_ACCEPTANCE_FRONTEND_KIND, '${{ inputs.frontend_kind }}');
  assert.equal(hosted.env.AUTHENTICATED_ACCEPTANCE_AUTH_KIND, 'supabase_auth');
  assert.equal(hosted.env.AUTHENTICATED_ACCEPTANCE_MODE, '${{ inputs.acceptance_mode }}');
  assert.equal(hosted.env.AUTHENTICATED_ACCEPTANCE_SECRET_BACKEND, 'supabase_vault');
  assert.equal(hosted.env.AVALA_PROVIDER_SECRET_BACKEND, 'supabase_vault');
  assert.equal(hosted.env.AUTHENTICATED_ACCEPTANCE_SUPABASE_MANAGEMENT_TOKEN, undefined);
  const build = hosted.steps.find(step => step.name === 'Build exact local acceptance frontend');
  assert.equal(build.if, "inputs.frontend_kind == 'local_build'");
  assert.equal(build.env.AUTHENTICATED_ACCEPTANCE_SUPABASE_URL,
    '${{ vars.AUTHENTICATED_ACCEPTANCE_SUPABASE_URL }}');
  assert.equal(build.env.AUTHENTICATED_ACCEPTANCE_SUPABASE_PUBLISHABLE_KEY,
    '${{ vars.AUTHENTICATED_ACCEPTANCE_SUPABASE_PUBLISHABLE_KEY }}');
  assert.equal(build.run, 'node scripts/localAcceptanceBuild.mjs build >> "$GITHUB_ENV"');
  const frontend = hosted.steps.find(step => step.name === 'Verify exact frontend identity');
  assert.match(frontend.run, /localAcceptanceBuild[.]mjs serve/u);
  assert.match(frontend.run, /localAcceptanceBuild[.]mjs verify/u);
  assert.match(frontend.run, /local-acceptance-build-proof[.]json --phase before/u);
  assert.doesNotMatch(frontend.run, /server[.]pid/u);
  assert.match(frontend.run, /verify-hosted-deployment[.]mjs/u);
  const finalFrontend = hosted.steps.find(step => step.id === 'frontend_final');
  assert.equal(finalFrontend['continue-on-error'], true);
  assert.match(finalFrontend.run, /localAcceptanceBuild[.]mjs verify/u);
  assert.match(finalFrontend.run, /local-acceptance-build-proof[.]json --phase after/u);
  const cleanupFrontend = hosted.steps.find(step => step.id === 'frontend_cleanup');
  assert.equal(cleanupFrontend.if, "always() && inputs.frontend_kind == 'local_build'");
  assert.match(cleanupFrontend.run, /localAcceptanceBuild[.]mjs stop/u);
  assert.doesNotMatch(cleanupFrontend.run, /kill -TERM|server[.]pid/u);
  assert.match(cleanupFrontend.run, /localAcceptanceBuild[.]mjs cleanup/u);
  const validation = hosted.steps.find(step => step.name === 'Validate catalogs, evidence and hosted contracts');
  assert.match(validation.run, /localAcceptanceBuild[.]test[.]mjs/u);
  assert.deepEqual(validation.env, { ACCEPTANCE_EXECUTION_KIND: 'hosted_preview',
    AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND: 'hosted_authenticated_synthetic',
    AUTHENTICATED_ACCEPTANCE_FRONTEND_KIND: 'netlify', AUTHENTICATED_ACCEPTANCE_BUILD_DIGEST: '' });
  assert.ok(hosted.steps.indexOf(build) > hosted.steps.indexOf(validation));
  assert.ok(hosted.steps.indexOf(build) < hosted.steps.findIndex(step => step.name === 'Prepare authenticated exact source bindings'));
  assert.match(validation.run, /localRealBackendAcceptanceMigration[.]test[.]mjs/u);
  const staged = hosted.steps.find(step => step.name === 'Stage sanitized same-run manifests');
  assert.match(staged.run, /local-acceptance-build-proof[.]json/u);
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
    AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION: '20261019161723',
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

  const local = authenticatedHostedEnvironmentLines({ ...environment,
    AUTHENTICATED_ACCEPTANCE_FRONTEND_KIND: 'local_build',
    RELEASE_SHA: 'a'.repeat(40),
    AUTHENTICATED_ACCEPTANCE_BUILD_DIGEST: digest('6'),
    AUTHENTICATED_ACCEPTANCE_APPROVED_EXERCISE_DIGEST: digest('4'),
    AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST: undefined,
  }, { catalog: { cases: [] }, provenance: { sourceDigests: {} } });
  assert.ok(local.includes('AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND=local_real_backend_authenticated'));
  assert.ok(local.includes(`AUTHENTICATED_ACCEPTANCE_BUILD_DIGEST=${digest('6')}`));
  assert.ok(local.includes(`AUTHENTICATED_ACCEPTANCE_APPROVED_EXERCISE_DIGEST=${digest('4')}`));
  const finalExercise = local.find(line => line.startsWith('AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST='));
  assert.match(finalExercise, /^AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST=sha256:[0-9a-f]{64}$/u);
  assert.notEqual(finalExercise, `AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST=${digest('4')}`);
});


test('reviewer selection dispatch isolates its bounded artifact and requires owned local cleanup', async () => {
  const workflow = parseWorkflowYaml(await readFile('.github/workflows/authenticated-product-acceptance.yml', 'utf8'));
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.acceptance_mode.options,
    ['full_acceptance', 'v2_primary_prefix_diagnostic', 'reviewer_selection_diagnostic', 'govern_studio_diagnostic']);
  const steps = workflow.jobs['hosted-authenticated'].steps;
  const stage = steps.find(step => step.name === 'Stage sanitized reviewer-selection diagnostic');
  const upload = steps.find(step => step.name === 'Upload sanitized reviewer-selection diagnostic');
  const gate = steps.find(step => step.name === 'Enforce reviewer-selection diagnostic gate');
  for (const step of [stage, upload, gate]) {
    assert.equal(step.if, "always() && inputs.acceptance_mode == 'reviewer_selection_diagnostic'");
    assert.equal(step['continue-on-error'], undefined);
  }
  assert.deepEqual([...stage.run.matchAll(/cp (\/tmp\/[^ ]+[.]json) /gu)].map(match => match[1]), [
    '/tmp/authenticated-reviewer-selection-diagnostic.json',
    '/tmp/authenticated-hosted-diagnostic.json',
    '/tmp/local-acceptance-build-proof.json',
  ]);
  assert.doesNotMatch(stage.run, /RETAINED_RESULTS|ORACLE_RESULTS|SERVER_RESULTS|AUTHENTICATED_RESULTS|[.]log|[.]zip/u);
  assert.equal(upload.with.name,
    'authenticated-reviewer-selection-diagnostic-${{ inputs.release_sha }}-${{ github.run_id }}-${{ github.run_attempt }}');
  assert.equal(upload.with.path, 'reviewer-diagnostic-results/');
  assert.equal(upload.with['if-no-files-found'], 'error');
  assert.match(gate.run, /set -euo pipefail/u);
  assert.ok(gate.run.includes('test "${{ inputs.frontend_kind }}" = local_build'));
  for (const id of ['deployment', 'frontend_final', 'frontend_cleanup', 'authenticated']) {
    assert.ok(gate.run.includes('test "${{ steps.' + id + '.outcome }}" = success'), id);
  }
  assert.match(gate.run, /validateAuthenticatedReviewerSelectionDiagnostic/u);
  assert.deepEqual(gate.env, {
    EXPECTED_RELEASE_SHA: '${{ inputs.release_sha }}',
    EXPECTED_RUN_ID: '${{ github.run_id }}',
    EXPECTED_RUN_ATTEMPT: '${{ github.run_attempt }}',
    EXPECTED_SOURCE_DIGEST: '${{ env.AUTHENTICATED_ACCEPTANCE_SOURCE_DIGEST }}',
  });
  for (const field of ['EXPECTED_RELEASE_SHA', 'EXPECTED_RUN_ID', 'EXPECTED_RUN_ATTEMPT', 'EXPECTED_SOURCE_DIGEST']) {
    assert.ok(gate.run.includes('process.env.' + field), field);
  }
  assert.match(gate.run, /assert[.]deepEqual\(value[.]source/u);
  assert.match(gate.run, /canonicalDigest\(provenance[.]sourceDigests\)/u);
  assert.match(gate.run, /assert[.]equal\(value[.]source[.]sourceDigest,canonicalSourceDigest\)/u);

  assert.doesNotMatch(gate.run, /steps[.]report|steps[.]hosted|steps[.]authenticated_evidence/u);
  assert.ok(steps.indexOf(stage) > steps.findIndex(step => step.id === 'frontend_cleanup'));
  assert.ok(steps.indexOf(gate) > steps.indexOf(upload));
});

test('Govern and Studio diagnostic dispatch isolates exact sanitized evidence and requires local cleanup', async () => {
  const workflow = parseWorkflowYaml(await readFile('.github/workflows/authenticated-product-acceptance.yml', 'utf8'));
  const steps = workflow.jobs['hosted-authenticated'].steps;
  const stage = steps.find(step => step.name === 'Stage sanitized Govern and Studio diagnostic');
  const upload = steps.find(step => step.name === 'Upload sanitized Govern and Studio diagnostic');
  const gate = steps.find(step => step.name === 'Enforce Govern and Studio diagnostic gate');
  for (const step of [stage, upload, gate]) {
    assert.equal(step.if, "always() && inputs.acceptance_mode == 'govern_studio_diagnostic'");
    assert.equal(step['continue-on-error'], undefined);
  }
  assert.deepEqual([...stage.run.matchAll(/cp (\/tmp\/[^ ]+[.]json) /gu)].map(match => match[1]), [
    '/tmp/authenticated-govern-studio-diagnostic.json',
    '/tmp/authenticated-hosted-diagnostic.json',
    '/tmp/local-acceptance-build-proof.json',
  ]);
  assert.doesNotMatch(stage.run, /RETAINED_RESULTS|ORACLE_RESULTS|SERVER_RESULTS|AUTHENTICATED_RESULTS|[.]log|[.]zip/u);
  assert.equal(upload.with.name,
    'authenticated-govern-studio-diagnostic-${{ inputs.release_sha }}-${{ github.run_id }}-${{ github.run_attempt }}');
  assert.equal(upload.with.path, 'govern-studio-diagnostic-results/');
  assert.equal(upload.with['if-no-files-found'], 'error');
  assert.match(gate.run, /validateAuthenticatedGovernStudioDiagnostic/u);
  for (const id of ['deployment', 'frontend_final', 'frontend_cleanup', 'authenticated']) {
    assert.ok(gate.run.includes('test "${{ steps.' + id + '.outcome }}" = success'), id);
  }
  for (const field of ['acceptancePromoted', 'fullAcceptanceExecuted', 'providerGenerationExecuted']) {
    assert.match(gate.run, new RegExp(field, 'u'));
  }
  assert.deepEqual(gate.env, {
    EXPECTED_RELEASE_SHA: '${{ inputs.release_sha }}',
    EXPECTED_RUN_ID: '${{ github.run_id }}',
    EXPECTED_RUN_ATTEMPT: '${{ github.run_attempt }}',
    EXPECTED_SOURCE_DIGEST: '${{ env.AUTHENTICATED_ACCEPTANCE_SOURCE_DIGEST }}',
  });
  assert.doesNotMatch(gate.run, /steps[.]report|steps[.]hosted|steps[.]authenticated_evidence/u);
  assert.ok(steps.indexOf(stage) > steps.findIndex(step => step.id === 'frontend_cleanup'));
  assert.ok(steps.indexOf(gate) > steps.indexOf(upload));
});

test('preparation retains exact Desktop and Pixel Govern denial proof with CI identity and no credentials', async () => {
  const workflow = parseWorkflowYaml(await readFile('.github/workflows/authenticated-product-acceptance.yml', 'utf8'));
  const job = workflow.jobs['connected-browser'];
  const run = job.steps.find(step => step.name === 'Verify restricted reviewer Govern denial on Desktop and Pixel');
  const lineage = job.steps.find(step => step.name === 'Verify Govern and Studio lineage against PostgreSQL');
  const retain = job.steps.find(step => step.name === 'Retain sanitized Govern reviewer denial proof');
  assert.equal(run.run, 'node scripts/reproduceGovernDisabledControl.mjs');
  assert.deepEqual(run.env, {
    GOVERN_REVIEWER_DENIAL_PROOF_PATH:
      'output/local-private/authenticated-product-acceptance/govern-reviewer-denial/govern-reviewer-denial-proof.json',
  });
  assert.equal(lineage.run, 'node scripts/testAuthenticatedGovernStudioLineagePostgres.mjs');
  assert.deepEqual(lineage.env, {
    RELEASE_SHA: '${{ env.RELEASE_SHA }}',
    AUTHENTICATED_GOVERN_STUDIO_LINEAGE_PROOF_PATH:
      'output/local-private/authenticated-product-acceptance/govern-reviewer-denial/govern-studio-lineage-proof.json',
  });
  assert.equal(retain.if, 'always()');
  assert.equal(retain.uses, 'actions/upload-artifact@v4');
  assert.equal(retain.with.name,
    'govern-reviewer-denial-${{ env.RELEASE_SHA }}-${{ github.run_id }}-${{ github.run_attempt }}');
  assert.equal(retain.with.path, 'output/local-private/authenticated-product-acceptance/govern-reviewer-denial/');
  assert.equal(retain.with['if-no-files-found'], 'error');
  assert.doesNotMatch(JSON.stringify([run, lineage, retain]),
    /secrets[.]|vars[.]|SERVICE_ROLE|MANAGEMENT_TOKEN|DATABASE_URL/u);
});
