import assert from 'node:assert/strict';
import fs from 'node:fs';
import { decodeAcceptanceExecutionProfile } from '../../scripts/acceptanceExecutionProfile.mjs';
import { parseWorkflowYaml } from '../../scripts/checkWorkflowYaml.mjs';

const workflowPath = '.github/workflows/preview-exhaustive-browser-qa.yml';
const workflow = fs.readFileSync(new URL(`../../${workflowPath}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const controlledSpec = fs.readFileSync(new URL('./controlledPreviewBoundary.spec.ts', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const controlledConfig = fs.readFileSync(new URL('../../playwright.controlled-preview-boundary.config.ts', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const parsed = parseWorkflowYaml(workflow, workflowPath);

const selection = parsed.jobs['select-pr264-controlled-preview'];
assert.ok(selection, 'preview QA must expose a trusted selection job before checking out PR source');
assert.equal(selection.steps.some(step => step.uses === 'actions/checkout@v4'), false, 'selection must not execute untrusted PR source before exact same-repository identity passes');
const selectionStep = selection.steps.find(step => step.name === 'Select exact same-repository PR 264 head branch');
assert.equal(selectionStep?.id, 'selection');
assert.equal(selectionStep?.env?.PR_NUMBER, '${{ github.event.pull_request.number }}');
assert.equal(selectionStep?.env?.PR_HEAD_REF, '${{ github.event.pull_request.head.ref }}');
assert.equal(selectionStep?.env?.PR_HEAD_REPOSITORY, '${{ github.event.pull_request.head.repo.full_name }}');
assert.match(selectionStep?.run ?? '', /\[ "\$PR_NUMBER" = "264" \]/u);
assert.match(selectionStep?.run ?? '', /\[ "\$PR_HEAD_REF" = "controller\/governed-delivery-monitor-pr-c-20260831" \]/u);
assert.match(selectionStep?.run ?? '', /\[ "\$PR_HEAD_REPOSITORY" = "\$GITHUB_REPOSITORY" \]/u);
assert.match(selectionStep?.run ?? '', /profile=ordinary/u, 'unrelated PR previews must retain the ordinary hosted regression path');
assert.match(selectionStep?.run ?? '', /profile=controlled/u, 'the exact controlled PR tuple must select only its bounded profile');
assert.match(selectionStep?.run ?? '', /PR264_CONTROLLED_PREVIEW_PARTIAL_IDENTITY_REJECTED[\s\S]*exit 1/u, 'any PR-number or head-branch partial match must fail closed');

const job = parsed.jobs['preview-exhaustive-browser-qa'];
assert.equal(job.needs, 'select-pr264-controlled-preview');
assert.equal(job.if, undefined, 'successful ordinary and controlled selections must both execute the shared preview QA job');
assert.equal(parsed.env.ACCEPTANCE_EXECUTION_KIND, 'hosted_preview', 'ordinary hosted configs must remain explicitly hosted-preview evidence');
const steps = job.steps;
const checkout = steps.find(step => step.name === 'Checkout exact PR head');
assert.equal(checkout?.with?.ref, '${{ env.RELEASE_SHA }}');

const contracts = steps.find(step => step.name === 'Validate exhaustive browser contracts');
const exactPreviewBinding = steps.find(step => step.name === 'Wait for exact PR preview and bind immutable deploy identity');
const immutableAccessibility = steps.find(step => step.name === 'Run exact immutable-preview accessibility and performance');
const hostedShell = steps.find(step => step.name === 'Run strict hosted shell and offline acceptance');
const controlled = steps.find(step => step.name === 'Run controlled preview fail-closed boundary on Desktop Chrome and Pixel 7');
const verifier = steps.find(step => step.name === 'Verify controlled preview result inventory');
const localSandbox = steps.find(step => step.name === 'Run exact-head local Sandbox regression on Desktop Chrome and Pixel 7');
const localNavigation = steps.find(step => step.name === 'Run exact-head local navigation regression on Desktop Chrome and Pixel 7');
const ordinarySandbox = steps.find(step => step.name === 'Run exhaustive Desktop Chrome and Pixel 7 Sandbox acceptance');
const ordinaryNavigation = steps.find(step => step.name === 'Run controller navigation history on Desktop Chrome and Pixel 7');
for (const [name, step] of Object.entries({ contracts, exactPreviewBinding, immutableAccessibility, hostedShell, controlled, verifier, localSandbox, localNavigation, ordinarySandbox, ordinaryNavigation })) {
  assert.ok(step, `${name} must remain an explicit required step`);
}
assert.match(contracts.run, /npm run test:pr-c-preview-profile-contract/u);
assert.ok(steps.indexOf(contracts) < steps.indexOf(exactPreviewBinding));
assert.ok(steps.indexOf(immutableAccessibility) > steps.indexOf(exactPreviewBinding));
assert.ok(steps.indexOf(hostedShell) > steps.indexOf(immutableAccessibility));
assert.ok(steps.indexOf(controlled) > steps.indexOf(hostedShell));
assert.ok(steps.indexOf(verifier) > steps.indexOf(controlled));
assert.ok(steps.indexOf(localSandbox) > steps.indexOf(verifier));
assert.ok(steps.indexOf(localNavigation) > steps.indexOf(localSandbox));

assert.match(
  exactPreviewBinding.run,
  /immutable_url="https:\/\/\$\{served_deploy\}--avalaos-pilot\.netlify\.app"[\s\S]*test "\$immutable_release" = "\$RELEASE_SHA"[\s\S]*test "\$immutable_deploy" = "\$served_deploy"[\s\S]*test "\$immutable_environment" = "hosted_nonproduction_pilot"[\s\S]*echo "NETLIFY_DEPLOY_ID=\$served_deploy" >> "\$GITHUB_ENV"[\s\S]*echo "HOSTED_PILOT_URL=\$immutable_url" >> "\$GITHUB_ENV"/u,
  'the immutable URL must derive from and revalidate the exact preview deploy identity',
);
assert.equal(controlled.env.EXPECTED_RELEASE_SHA, '${{ env.RELEASE_SHA }}');
assert.equal(controlled.env.EXPECTED_NETLIFY_DEPLOY_ID, '${{ env.NETLIFY_DEPLOY_ID }}');
assert.equal(controlled.env.HOSTED_PILOT_URL, '${{ env.PREVIEW_ALIAS_URL }}');
assert.equal(controlled.env.CONTROLLED_PREVIEW_ALIAS_URL, '${{ env.PREVIEW_ALIAS_URL }}');
assert.equal(controlled.env.CONTROLLED_PREVIEW_IMMUTABLE_URL, '${{ env.HOSTED_PILOT_URL }}');
assert.equal(controlled.run, 'npx playwright test --config=playwright.controlled-preview-boundary.config.ts --workers=1');
assert.equal(verifier.env.ACCEPTANCE_WORKFLOW_PATH, workflowPath);
assert.equal(verifier.env.PR_NUMBER, '${{ github.event.pull_request.number }}');
assert.equal(verifier.env.PR_HEAD_REF, '${{ github.event.pull_request.head.ref }}');
assert.equal(verifier.env.PR_HEAD_REPOSITORY, '${{ github.event.pull_request.head.repo.full_name }}');
assert.equal(verifier.run, 'node scripts/verifyPreviewBrowserEvidence.mjs --report artifacts/controlled-preview-boundary/playwright-results.json --output artifacts/controlled-preview-boundary/result-inventory.json');
assert.equal(localSandbox.run, 'node scripts/runTranscriptFlowBrowser.mjs --preview-sandbox-regression');
assert.equal(localNavigation.run, 'node scripts/runTranscriptFlowBrowser.mjs --preview-navigation-regression');
for (const step of [localSandbox, localNavigation]) {
  assert.equal(step.env.HOSTED_PILOT_URL, '', `${step.name} must clear the job's hosted URL binding`);
  assert.equal(step.env.NETLIFY_DEPLOY_ID, '', `${step.name} must clear the job's hosted deploy binding`);
  const checkoutSha = 'a'.repeat(40);
  const invocationId = 'b'.repeat(32);
  const resolvedWorkflowEnvironment = {
    ACCEPTANCE_EXECUTION_KIND: parsed.env.ACCEPTANCE_EXECUTION_KIND,
    EXPECTED_RELEASE_SHA: checkoutSha,
    HOSTED_PILOT_URL: 'https://feedfacefeedfacefeedface--avalaos-pilot.netlify.app',
    NETLIFY_DEPLOY_ID: 'feedfacefeedfacefeedface',
    ...step.env,
  };
  const resolvedRunnerEnvironment = {
    ...resolvedWorkflowEnvironment,
    ACCEPTANCE_EXECUTION_KIND: 'local_source_fixture',
    ACCEPTANCE_RELEASE_SHA: checkoutSha,
    ACCEPTANCE_CHECKOUT_SHA: checkoutSha,
    ACCEPTANCE_INVOCATION_ID: invocationId,
    LOCAL_ACCEPTANCE_BASE_URL: step === localSandbox ? 'http://127.0.0.1:4201' : 'http://127.0.0.1:4202',
  };
  assert.deepEqual(
    decodeAcceptanceExecutionProfile(resolvedRunnerEnvironment, { expectedCheckoutSha: checkoutSha }),
    {
      schemaVersion: 'acceptance-execution-profile-v1',
      evidenceKind: 'exact-head-synthetic-regression',
      executionKind: 'local_source_fixture',
      releaseSha: checkoutSha,
      checkoutSha,
      sourceIdentity: 'governed_working_tree_candidate',
      invocationId,
      targetOrigin: step === localSandbox ? 'http://127.0.0.1:4201' : 'http://127.0.0.1:4202',
      deployId: null,
    },
    `${step.name} resolved environment must decode as local source evidence after GitHub environment merging`,
  );
}
for (const step of [controlled, verifier, localSandbox, localNavigation]) {
  assert.equal(step.if, "needs.select-pr264-controlled-preview.outputs.profile == 'controlled'");
}
assert.equal(ordinarySandbox.if, "needs.select-pr264-controlled-preview.outputs.profile == 'ordinary'");
assert.equal(ordinarySandbox.run, 'npx playwright test --config=playwright.exhaustive-acceptance.config.ts --workers=1');
assert.equal(ordinaryNavigation.if, "needs.select-pr264-controlled-preview.outputs.profile == 'ordinary'");
assert.equal(ordinaryNavigation.run, 'npx playwright test --config=playwright.controller-navigation-history.config.ts --workers=1');

const uploads = steps.filter(step => step.uses === 'actions/upload-artifact@v4');
const evidenceUploads = new Map(uploads.map(step => [step.name, step]));
for (const [name, expectedPath] of [
  ['Upload controlled preview boundary evidence', 'artifacts/controlled-preview-boundary/'],
  ['Upload local Sandbox regression evidence', 'output/playwright/pr264-synthetic-regression/${{ env.RELEASE_SHA }}/sandbox/'],
  ['Upload local navigation regression evidence', 'output/playwright/pr264-synthetic-regression/${{ env.RELEASE_SHA }}/navigation/'],
]) {
  const upload = evidenceUploads.get(name);
  assert.ok(upload, `${name} must be retained`);
  assert.equal(upload.if, "always() && needs.select-pr264-controlled-preview.outputs.profile == 'controlled'");
  assert.equal(upload.with?.['if-no-files-found'], 'error');
  assert.equal(upload.with?.path, expectedPath);
}
assert.equal(new Set(uploads.map(step => step.with?.name)).size, uploads.length, 'every evidence family must upload under a distinct artifact name');
const ordinaryUpload = evidenceUploads.get('Upload ordinary preview exhaustive evidence');
assert.equal(ordinaryUpload?.if, "always() && needs.select-pr264-controlled-preview.outputs.profile == 'ordinary'");
assert.match(ordinaryUpload?.with?.path ?? '', /artifacts\/exhaustive-acceptance\/[\s\S]*artifacts\/controller-navigation-history\//u);
assert.match(controlledSpec, /createControlledPreviewNetworkObserver\(/u, 'controlled boundary must install the shared context-wide network guard before navigation');
assert.match(controlledSpec, /loadControlledPreviewBrowserBinding\([\s\S]*accountApiContextRequest/u, 'binding discovery must account its APIRequestContext traffic under the same evidence boundary');
assert.match(controlledSpec, /expect\(counts\.unexpectedRequests\)\.toBe\(0\)/u, 'an aborted unexpected request must still fail the scenario');
assert.match(controlledConfig, /serviceWorkers: 'block'/u, 'controlled-preview contexts must block service-worker startup in addition to observing any attempted worker');

console.log('Preview exhaustive browser QA selects exact PR #264, preserves hosted provenance, and separates controlled and local evidence.');
