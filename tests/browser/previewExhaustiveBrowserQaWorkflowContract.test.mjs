import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../../.github/workflows/preview-exhaustive-browser-qa.yml', import.meta.url), 'utf8');
const exactPreviewBinding = workflow.indexOf('- name: Wait for exact PR preview and bind immutable deploy identity');
const immutableAccessibility = workflow.indexOf('- name: Run exact immutable-preview accessibility and performance');
const exhaustiveBrowser = workflow.indexOf('- name: Run exhaustive Desktop Chrome and Pixel 7 Sandbox acceptance');

assert.ok(exactPreviewBinding >= 0, 'preview workflow must retain the exact release/deploy/environment preflight');
assert.ok(immutableAccessibility > exactPreviewBinding, 'accessibility/performance must execute only after immutable preview identity succeeds');
assert.ok(exhaustiveBrowser > immutableAccessibility, 'immutable accessibility/performance must remain a required gate before exhaustive browser acceptance');
assert.match(
  workflow,
  /immutable_url="https:\/\/\$\{served_deploy\}--avalaos-pilot\.netlify\.app"[\s\S]*test "\$immutable_release" = "\$RELEASE_SHA"[\s\S]*test "\$immutable_deploy" = "\$served_deploy"[\s\S]*test "\$immutable_environment" = "hosted_nonproduction_pilot"[\s\S]*echo "NETLIFY_DEPLOY_ID=\$served_deploy" >> "\$GITHUB_ENV"[\s\S]*echo "HOSTED_PILOT_URL=\$immutable_url" >> "\$GITHUB_ENV"/u,
  'the immutable URL exported to browser jobs must be derived from and revalidate the exact preview deploy identity',
);

const accessibilityStep = workflow.slice(immutableAccessibility, exhaustiveBrowser);
assert.match(accessibilityStep, /EXPECTED_RELEASE_SHA: \$\{\{ env\.RELEASE_SHA \}\}/u, 'accessibility/performance must bind the checked-out exact release SHA');
assert.match(accessibilityStep, /EXPECTED_NETLIFY_DEPLOY_ID: \$\{\{ env\.NETLIFY_DEPLOY_ID \}\}/u, 'accessibility/performance must bind the preflight deploy identity');
assert.match(accessibilityStep, /NETLIFY_DEPLOY_ID: \$\{\{ env\.NETLIFY_DEPLOY_ID \}\}/u, 'accessibility/performance config must receive the immutable deploy identity');
assert.match(accessibilityStep, /npx playwright test --config=playwright\.hosted-accessibility-performance\.config\.ts --workers=1/u, 'the repository-owned accessibility/performance contract must execute explicitly');
assert.doesNotMatch(accessibilityStep, /PREVIEW_ALIAS_URL|deploy-preview-/u, 'accessibility/performance must never fall back to the mutable preview alias');
assert.match(
  workflow,
  /node tests\/browser\/previewExhaustiveBrowserQaWorkflowContract\.test\.mjs/u,
  'the workflow must run this fail-closed binding contract before browser execution',
);
assert.match(
  workflow,
  /node tests\/acceptance\/pr255ControlledHumanTestingCharter\.test\.mjs/u,
  'the workflow must validate the controlled-human-testing boundary before browser execution',
);

console.log('Preview exhaustive browser QA keeps accessibility/performance bound to the immutable exact preview.');
