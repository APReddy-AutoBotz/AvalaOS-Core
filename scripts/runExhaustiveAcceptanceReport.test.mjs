import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('declaration parse failure emits sanitized fail-closed report artifacts', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-acceptance-report-'));
  const catalogPath = path.join(temp, 'malformed-catalog.json');
  const resultsDir = path.join(temp, 'results');
  const privateMarker = 'PRIVATE_DECLARATION_MARKER_X';
  const privateUrl = 'https://private.example.invalid/object/tenant-123';

  try {
    writeFileSync(catalogPath, `{"cases":[{"testId":"${privateMarker}","source":"${privateUrl}"`);
    const run = spawnSync(process.execPath, ['scripts/runExhaustiveAcceptanceReport.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        ACCEPTANCE_CATALOG: catalogPath,
        ACCEPTANCE_RESULTS_DIR: resultsDir,
        RELEASE_SHA: 'a'.repeat(40),
        NETLIFY_DEPLOY_ID: 'b'.repeat(24),
        GITHUB_RUN_ID: '123456',
        GITHUB_RUN_ATTEMPT: '2',
      },
    });

    assert.notEqual(run.status, 0, 'malformed declarations must fail closed');
    const files = [
      'acceptance-results.json',
      'acceptance-report.md',
      'acceptance-junit.xml',
      'source-to-test-coverage.json',
    ];
    for (const file of files) assert.equal(existsSync(path.join(resultsDir, file)), true, `${file} must be emitted`);

    const combined = files.map(file => readFileSync(path.join(resultsDir, file), 'utf8')).join('\n');
    assert.match(combined, /DECLARATION_PREFLIGHT_FAILED/u);
    for (const forbidden of [privateMarker, privateUrl]) {
      assert.equal(combined.includes(forbidden), false, 'raw declaration content must not enter evidence');
      assert.equal(run.stderr.includes(forbidden), false, 'raw declaration content must not enter stderr');
    }
    assert.match(run.stderr, /DECLARATION_PREFLIGHT_FAILED/u);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('green hosted execution cannot promote a planned fixture scope', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-acceptance-planned-scope-'));
  const resultsDir = path.join(temp, 'results');
  const playwrightPath = path.join(temp, 'playwright.json');
  const exactTitle = '[SANDBOX-001] Sandbox: access';
  const playwright = {
    suites: [{
      specs: [{
        title: exactTitle,
        tests: ['desktop-chromium', 'pixel-7-chromium'].map(projectName => ({
          projectName,
          expectedStatus: 'passed',
          results: [{ status: 'passed', attachments: [] }],
        })),
      }],
    }],
  };

  try {
    writeFileSync(playwrightPath, JSON.stringify(playwright));
    const run = spawnSync(process.execPath, ['scripts/runExhaustiveAcceptanceReport.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        ACCEPTANCE_RESULTS_DIR: resultsDir,
        PLAYWRIGHT_JSON: playwrightPath,
        RELEASE_SHA: 'a'.repeat(40),
        NETLIFY_DEPLOY_ID: 'b'.repeat(24),
        GITHUB_RUN_ID: '123456',
        GITHUB_RUN_ATTEMPT: '2',
        ACCEPTANCE_EVIDENCE_ENVIRONMENT: 'stable-release',
        ACCEPTANCE_EXECUTION_DISPOSITION: 'EXECUTED',
      },
    });
    assert.notEqual(run.status, 0, 'planned coverage remains intentionally incomplete');
    const report = JSON.parse(readFileSync(path.join(resultsDir, 'acceptance-results.json'), 'utf8'));
    const sandbox = report.results.find(item => item.testId === 'SANDBOX-001');
    assert.equal(sandbox.status, 'BLOCKED');
    assert.match(sandbox.failureReason, /no separately validated same-run executed fixture scope/u);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
