import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('dedicated Chromium diagnostic is excluded from default discovery and binds CI source bytes', async () => {
  const [defaultConfig, config, runner, artifact, manifest] = await Promise.all([
    readFile('playwright.config.ts', 'utf8'),
    readFile('playwright.eligible-reviewer-request-diagnostics.config.ts', 'utf8'),
    readFile('scripts/runEligibleReviewerRequestDiagnosticsBrowser.mjs', 'utf8'),
    readFile('scripts/eligibleReviewerRequestDiagnosticsArtifact.mjs', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);
  assert.match(defaultConfig, /testMatch: '\*\*\/\*\.spec\.ts'/u);
  assert.match(config, /testMatch: 'eligibleReviewerRequestDiagnostics\.browser\.ts'/u);
  assert.match(config, /trace: 'off'/u); assert.match(config, /screenshot: 'off'/u); assert.match(config, /video: 'off'/u);
  assert.match(runner, /node_modules\/@playwright\/test\/cli\.js/u);
  assert.doesNotMatch(runner, /npx(?:\.cmd)?/u);
  assert.doesNotMatch(runner, /rm\(root/u);
  assert.match(runner, /ELIGIBLE_REVIEWER_DIAGNOSTICS_EVIDENCE_PATH_REJECTED/u);
  assert.match(runner, /finally \{/u);
  assert.match(runner, /process[.]env[.]GITHUB_SHA/u);
  assert.match(runner, /createEligibleReviewerRequestDiagnosticsSourceBindings/u);
  assert.match(artifact, /readFile\(path[.]join\(repositoryRoot, sourcePath\)\)/u,
    'source bindings must hash raw file bytes');
  assert.match(artifact, /assertionTimeoutMs: 15_000/u);
  assert.doesNotMatch(runner, /PLAYWRIGHT_BROWSERS_PATH\s*:/u);
  assert.match(JSON.parse(manifest).scripts['test:eligible-reviewer-request-diagnostics'],
    /runEligibleReviewerRequestDiagnosticsBrowser\.mjs/u);
});
