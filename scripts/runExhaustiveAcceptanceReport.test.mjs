import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  canonicalHostedTitle,
  loadCatalog,
  loadExecutionBindings,
} from './exhaustiveAcceptanceModel.mjs';

const releaseSha = 'a'.repeat(40);
const deployId = 'b'.repeat(24);
const workflowSha = 'c'.repeat(40);
const workflowPath = '.github/workflows/exhaustive-acceptance.yml';
const workflowRef = `owner/repository/${workflowPath}@refs/pull/264/merge`;
const hostedCommand = ['npx', 'playwright', 'test', '--config=playwright.exhaustive-acceptance.config.ts', '--workers=1'];

const hostedEnvironment = () => ({
  ACCEPTANCE_EXECUTION_KIND: 'hosted_preview',
  RELEASE_SHA: releaseSha,
  NETLIFY_DEPLOY_ID: deployId,
  HOSTED_PILOT_URL: 'https://avalaos-pilot.netlify.app',
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'owner/repository',
  GITHUB_WORKFLOW_REF: workflowRef,
  GITHUB_EVENT_NAME: 'pull_request',
  GITHUB_RUN_ID: '123456',
  GITHUB_RUN_ATTEMPT: '2',
  GITHUB_SHA: workflowSha,
  ACCEPTANCE_WORKFLOW_PATH: workflowPath,
  ACCEPTANCE_EVIDENCE_ENVIRONMENT: 'stable-release',
  ACCEPTANCE_EXECUTION_DISPOSITION: 'EXECUTED',
});

const hostedMetadata = () => ({
  schemaVersion: 'acceptance-report-profile-v1',
  ci: {},
  evidenceKind: 'hosted-preview-acceptance',
  executionKind: 'hosted_preview',
  exactCommand: hostedCommand,
  configPath: 'playwright.exhaustive-acceptance.config.ts',
  sourcePaths: ['tests/browser/exhaustiveHostedAcceptance.spec.ts'],
  exactHead: releaseSha,
  targetOrigin: 'https://avalaos-pilot.netlify.app',
  deployId,
  workflowRuntime: {
    authority: 'github-actions',
    workflowPath,
    workflowRef,
    repository: 'owner/repository',
    eventName: 'pull_request',
    runId: '123456',
    runAttempt: '2',
    workflowSha,
    releaseSha,
  },
  actualWorkers: 1,
});

const hostedTestResult = projectName => ({
  projectName,
  status: 'expected',
  expectedStatus: 'passed',
  annotations: [],
  results: [{ status: 'passed', retry: 0, attachments: [] }],
});

const hostedReport = (metadata = hostedMetadata()) => ({
  config: { metadata },
  errors: [],
  suites: [{
    specs: [{
      title: '[SANDBOX-001] Sandbox: access',
      tests: ['desktop-chromium', 'pixel-7-chromium'].map(hostedTestResult),
    }],
  }],
  stats: { expected: 2, unexpected: 0, skipped: 0 },
});

const fullInventoryHostedReport = () => {
  const catalog = loadCatalog();
  const catalogByTestId = new Map(catalog.cases.map(item => [item.testId, item]));
  const hostedBindings = loadExecutionBindings().hostedTests;
  const specs = hostedBindings.map(binding => ({
    title: canonicalHostedTitle(catalogByTestId.get(binding.testId)),
    tests: binding.projects.map(projectName => binding.scenario
      ? hostedTestResult(projectName)
      : {
          projectName,
          status: 'skipped',
          expectedStatus: 'skipped',
          annotations: [{ type: 'skip', description: binding.blockedReason }],
          results: [{ status: 'skipped', retry: 0, attachments: [] }],
        }),
  }));
  const executable = hostedBindings.filter(binding => binding.scenario).length * 2;
  const skipped = hostedBindings.filter(binding => !binding.scenario).length * 2;
  assert.equal(executable, 38);
  assert.equal(skipped, 30);
  return {
    config: { metadata: hostedMetadata() },
    errors: [],
    suites: [{ title: 'tests/browser/exhaustiveHostedAcceptance.spec.ts', specs }],
    stats: { expected: executable, unexpected: 0, skipped },
  };
};

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
  const playwright = fullInventoryHostedReport();

  try {
    writeFileSync(playwrightPath, JSON.stringify(playwright));
    const run = spawnSync(process.execPath, ['scripts/runExhaustiveAcceptanceReport.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        ACCEPTANCE_RESULTS_DIR: resultsDir,
        PLAYWRIGHT_JSON: playwrightPath,
        ...hostedEnvironment(),
      },
    });
    assert.notEqual(run.status, 0, 'planned coverage remains intentionally incomplete');
    const report = JSON.parse(readFileSync(path.join(resultsDir, 'acceptance-results.json'), 'utf8'));
    assert.deepEqual(report.summary.browserEvidenceErrors, [], 'the complete 68-result ordinary hosted inventory is provenance-valid');
    const sandbox = report.results.find(item => item.testId === 'SANDBOX-001');
    assert.equal(sandbox.status, 'BLOCKED');
    assert.match(sandbox.failureReason, /no separately validated same-run executed fixture scope/u);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('ambient execution kind cannot relabel a locally green Playwright report as hosted evidence', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-acceptance-local-substitution-'));
  const resultsDir = path.join(temp, 'results');
  const playwrightPath = path.join(temp, 'playwright.json');
  const playwright = hostedReport({
    ...hostedMetadata(),
    evidenceKind: 'exact-head-synthetic-regression',
    executionKind: 'local_source_fixture',
    targetOrigin: 'http://127.0.0.1:4179',
    deployId: null,
    workflowRuntime: undefined,
  });
  try {
    writeFileSync(playwrightPath, JSON.stringify(playwright));
    const run = spawnSync(process.execPath, ['scripts/runExhaustiveAcceptanceReport.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        ACCEPTANCE_RESULTS_DIR: resultsDir,
        PLAYWRIGHT_JSON: playwrightPath,
        ...hostedEnvironment(),
      },
    });
    assert.notEqual(run.status, 0);
    const report = JSON.parse(readFileSync(path.join(resultsDir, 'acceptance-results.json'), 'utf8'));
    const sandbox = report.results.find(item => item.testId === 'SANDBOX-001');
    assert.equal(sandbox.status, 'BLOCKED');
    assert.match(sandbox.failureReason, /report provenance invalid/u);
    assert.equal(report.summary.browserExecutionKind, 'local_source_fixture');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('hostile hosted report provenance substitutions remain blocked under a green suite summary', () => {
  const mutations = [
    ['wrong-kind', metadata => ({ ...metadata, executionKind: 'local_source_fixture' })],
    ['wrong-head', metadata => ({ ...metadata, exactHead: 'd'.repeat(40) })],
    ['wrong-deploy', metadata => ({ ...metadata, deployId: 'e'.repeat(24) })],
    ['wrong-command', metadata => ({ ...metadata, exactCommand: ['npx', 'playwright', 'test', '--config=substituted.ts', '--workers=1'] })],
    ['stale-run', metadata => ({ ...metadata, workflowRuntime: { ...metadata.workflowRuntime, runId: '123455' } })],
    ['stale-attempt', metadata => ({ ...metadata, workflowRuntime: { ...metadata.workflowRuntime, runAttempt: '1' } })],
    ['missing-provenance', () => undefined],
  ];
  for (const [name, mutate] of mutations) {
    const temp = mkdtempSync(path.join(tmpdir(), `avalaos-acceptance-${name}-`));
    const resultsDir = path.join(temp, 'results');
    const playwrightPath = path.join(temp, 'playwright.json');
    try {
      const metadata = mutate(hostedMetadata());
      const playwright = metadata ? hostedReport(metadata) : { errors: [], suites: hostedReport().suites, stats: { expected: 2 } };
      writeFileSync(playwrightPath, JSON.stringify(playwright));
      const run = spawnSync(process.execPath, ['scripts/runExhaustiveAcceptanceReport.mjs'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          ...hostedEnvironment(),
          ACCEPTANCE_RESULTS_DIR: resultsDir,
          PLAYWRIGHT_JSON: playwrightPath,
        },
      });
      assert.notEqual(run.status, 0, `${name} must fail closed`);
      const report = JSON.parse(readFileSync(path.join(resultsDir, 'acceptance-results.json'), 'utf8'));
      const sandbox = report.results.find(item => item.testId === 'SANDBOX-001');
      assert.equal(sandbox.status, 'BLOCKED', `${name} must not receive hosted PASS credit`);
      assert.ok(report.summary.browserEvidenceErrors.length > 0, `${name} must emit a sanitized provenance error`);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }
});
