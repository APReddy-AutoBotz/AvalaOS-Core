import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createFullPageContrastAttachment } from './acceptanceExecutionProfile.mjs';
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
const passedControlScriptScenarios = new Set();

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
  sourcePaths: [
    'tests/browser/exhaustiveHostedAcceptance.spec.ts',
    'tests/browser/productNavigationReadiness.ts',
  ],
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
  const metadata = hostedMetadata();
  const contrastProfiles = new Map([['SANDBOX-009', 'initial-entry'], ['SAFETY-007', 'representative-surface']]);
  const withContrastSummaries = (binding, projectName) => {
    const value = hostedTestResult(projectName);
    const profile = contrastProfiles.get(binding.testId);
    if (!profile) return value;
    const title = canonicalHostedTitle(catalogByTestId.get(binding.testId));
    const personas = ['Process Analyst', 'AP Process Owner', 'Delivery Lead', 'Control Reviewer', 'Automation Contributor', 'Buyer Viewer', 'Platform Admin'];
    value.results[0].startTime = '2026-09-08T12:00:00.000Z';
    value.results[0].duration = 10_000;
    value.results[0].attachments = personas.map(persona => {
      const attachment = createFullPageContrastAttachment({
        results: { passes: [{ id: 'color-contrast', nodes: [{ any: [{ id: 'color-contrast' }], all: [], none: [] }] }], violations: [], incomplete: [] },
        metadata, persona, profile, project: projectName, test: title, observedAt: '2026-09-08T12:00:01.000Z',
      });
      return { name: attachment.name, contentType: attachment.contentType, body: Buffer.from(attachment.body).toString('base64') };
    });
    return value;
  };
  const specs = hostedBindings.map(binding => ({
    title: canonicalHostedTitle(catalogByTestId.get(binding.testId)),
    tests: binding.projects.map(projectName => binding.scenario
      ? withContrastSummaries(binding, projectName)
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
  assert.equal(skipped, 36);
  return {
    config: { metadata },
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
    passedControlScriptScenarios.add('exhaustive-report-malformed-declaration-fails-closed');
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
    assert.deepEqual(report.summary.browserEvidenceErrors, [], 'the complete 74-result ordinary hosted inventory is provenance-valid');
    const sandbox = report.results.find(item => item.testId === 'SANDBOX-001');
    assert.equal(sandbox.status, 'BLOCKED');
    assert.match(sandbox.failureReason, /no separately validated same-run executed fixture scope/u);
    passedControlScriptScenarios.add('exhaustive-report-planned-scope-blocked');
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
    passedControlScriptScenarios.add('exhaustive-report-local-hosted-substitution-blocked');
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
    ['missing-navigation-helper-source', metadata => ({
      ...metadata,
      sourcePaths: ['tests/browser/exhaustiveHostedAcceptance.spec.ts'],
    })],
    ['substituted-navigation-helper-source', metadata => ({
      ...metadata,
      sourcePaths: [
        'tests/browser/exhaustiveHostedAcceptance.spec.ts',
        'tests/browser/substitutedNavigationReadiness.ts',
      ],
    })],
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
  passedControlScriptScenarios.add('exhaustive-report-hostile-provenance-blocked');
});

test('validated deterministic oracle evidence promotes only its 13 exact cases', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-acceptance-oracle-report-'));
  const resultsDir = path.join(temp, 'results');
  const oraclePath = path.join(temp, 'oracle.json');
  const sutPath = path.join(temp, 'sut.json');
  const runIdentity = {
    RELEASE_SHA: releaseSha,
    GITHUB_RUN_ID: '123456',
    GITHUB_RUN_ATTEMPT: '2',
    ACCEPTANCE_EVIDENCE_ENVIRONMENT: 'pull-request',
    ACCEPTANCE_WORKFLOW_PATH: workflowPath,
  };
  try {
    const producer = spawnSync(process.execPath, ['scripts/runAssessV1AcceptanceOracle.mjs'], {
      cwd: process.cwd(), encoding: 'utf8',
      env: { ...process.env, ...runIdentity, ORACLE_RESULTS_MANIFEST: oraclePath, SUT_RESULTS_MANIFEST: sutPath },
    });
    assert.equal(producer.status, 0, producer.stderr);
    const reportRun = spawnSync(process.execPath, ['scripts/runExhaustiveAcceptanceReport.mjs'], {
      cwd: process.cwd(), encoding: 'utf8',
      env: {
        ...process.env,
        ...runIdentity,
        ACCEPTANCE_RESULTS_DIR: resultsDir,
        ORACLE_RESULTS_MANIFEST: oraclePath,
        ACCEPTANCE_EXECUTION_DISPOSITION: 'NOT_EXECUTED',
      },
    });
    assert.equal(reportRun.status, 0, reportRun.stderr);
    const report = JSON.parse(readFileSync(path.join(resultsDir, 'acceptance-results.json'), 'utf8'));
    const passIds = report.results.filter(item => item.status === 'PASS').map(item => item.testId).sort();
    assert.deepEqual(passIds, Array.from({ length: 13 }, (_, index) => `ASSESS-${String(index + 5).padStart(3, '0')}`));
    assert.equal(report.results.filter(item => item.status === 'BLOCKED').length, 95);
    assert.equal(report.results.filter(item => item.status === 'FAIL').length, 0);
    assert.equal(report.results.filter(item => item.executionKind === 'oracle').every(item => item.status === 'PASS'), true);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test.after(() => {
  const directory = process.env.PR_C_CONTROL_SCRIPT_SCENARIO_REPORT_DIRECTORY;
  if (!directory || passedControlScriptScenarios.size !== 4) return;
  writeFileSync(path.join(directory, 'exhaustive-acceptance-report-scenarios.json'), JSON.stringify({
    contractVersion: 'pr-c-control-script-scenarios-1',
    producer: 'scripts/runExhaustiveAcceptanceReport.test.mjs',
    scenarios: [...passedControlScriptScenarios].sort().map(name => ({ name, status: 'passed' })),
  }), { flag: 'wx' });
});

test('Trust report validates only the five exact cases and rejects post-ingestion substitutions', async () => {
  const { buildTrustAcceptanceProducer } = await import('./trustAcceptanceEvidence.mjs');
  const suite = loadExecutionBindings().retainedSuites.find(item => item.suiteId === 'trust-authority');
  const command = suite.command.join(' ');
  const identity = { releaseSha, workflowRunId: '123456', workflowAttempt: '2', environment: 'pull-request', workflowPath };
  // Unit-level report inputs, not an assertion that PostgreSQL ran in this test.
  const makeProducer = failure => {
    const actualByTestId = JSON.parse(readFileSync('tests/acceptance/fixtures/trust-evidence-unit-results.json', 'utf8'));
    const failuresByTestId = {};
    if (failure) {
      delete actualByTestId['TRUST-004'];
      failuresByTestId['TRUST-004'] = { failureCode: 'assertion_failed' };
    }
    return buildTrustAcceptanceProducer({ actualByTestId, failuresByTestId, identity, command, cleanupVerified: true });
  };
  const variants = [
    ['valid', () => {}, false, 5, 0],
    ['source substitution', manifest => { const item = manifest.results[0]; item.sourceDigests[Object.keys(item.sourceDigests)[0]] = '0'.repeat(64); }, false, 0, 0],
    ['result substitution', manifest => { manifest.results[4].actual.semanticAudit = false; }, false, 0, 0],
    ['cleanup substitution', manifest => { manifest.results[0].cleanupVerified = false; }, false, 0, 0],
    ['partial artifact', manifest => { manifest.results.pop(); }, false, 0, 0],
    ['executed failure despite aggregate success', () => {}, true, 4, 1],
    ['failed aggregate', manifest => { manifest.suites[0].status = 'FAIL'; }, true, 0, 5],
    ['aggregate-only', manifest => { manifest.results = []; }, false, 0, 0],
  ];
  for (const [name, mutate, failure, passed, failed] of variants) {
    const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-trust-report-'));
    try {
      const retainedPath = path.join(temp, 'retained.json');
      const manifest = {
        schemaVersion: 3, manifestKind: 'retained', ...identity,
        suites: [{ suiteId: suite.suiteId, status: 'PASS', command, requiredGate: true, testIds: suite.testIds }],
        results: structuredClone(makeProducer(failure).results),
      };
      mutate(manifest);
      writeFileSync(retainedPath, JSON.stringify(manifest));
      const resultsDir = path.join(temp, 'report');
      const run = spawnSync(process.execPath, ['scripts/runExhaustiveAcceptanceReport.mjs'], {
        cwd: process.cwd(), encoding: 'utf8',
        env: {
          ...process.env, RELEASE_SHA: releaseSha, GITHUB_RUN_ID: identity.workflowRunId,
          GITHUB_RUN_ATTEMPT: identity.workflowAttempt, ACCEPTANCE_WORKFLOW_PATH: workflowPath,
          ACCEPTANCE_EVIDENCE_ENVIRONMENT: 'pull-request', ACCEPTANCE_EXECUTION_DISPOSITION: 'NOT_EXECUTED',
          ACCEPTANCE_RESULTS_DIR: resultsDir, RETAINED_RESULTS_MANIFEST: retainedPath,
          ORACLE_RESULTS_MANIFEST: path.join(temp, 'absent-oracle.json'),
          SERVER_RESULTS_MANIFEST: path.join(temp, 'absent-server.json'),
          PLAYWRIGHT_JSON: path.join(temp, 'absent-browser.json'),
        },
      });
      const report = JSON.parse(readFileSync(path.join(resultsDir, 'acceptance-results.json'), 'utf8'));
      assert.equal(report.summary.PASS, passed, `${name}: ${report.results.find(item => item.testId === 'TRUST-001')?.failureReason ?? report.summary.preflightFailure ?? run.stderr}`);
      assert.equal(report.summary.FAIL, failed, name);
      assert.equal(report.summary.BLOCKED, 108 - passed - failed, name);
      assert.ok(report.results.filter(item => item.status === 'PASS').every(item => item.testId.startsWith('TRUST-')), name);
      if (failed) assert.equal(report.results.find(item => item.testId === 'TRUST-004').status, 'FAIL', name);
      if (passed === 5) assert.equal(run.status, 0, run.stderr);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }
});

test('Application Portfolio report validates only the five exact cases and rejects post-ingestion substitutions', async () => {
  const { buildApplicationPortfolioAcceptanceProducer } = await import('./applicationPortfolioAcceptanceEvidence.mjs');
  const suite = loadExecutionBindings().retainedSuites.find(item => item.suiteId === 'application-portfolio');
  const command = suite.command.join(' ');
  const identity = { releaseSha, workflowRunId: '123456', workflowAttempt: '2', environment: 'pull-request', workflowPath };
  // Unit-level report inputs, not an assertion that PostgreSQL ran in this test.
  const makeProducer = failure => {
    const actualByTestId = JSON.parse(readFileSync('tests/acceptance/fixtures/application-portfolio-evidence-unit-results.json', 'utf8'));
    const failuresByTestId = {};
    if (failure) {
      delete actualByTestId['APPS-004'];
      failuresByTestId['APPS-004'] = { failureCode: 'assertion_failed' };
    }
    return buildApplicationPortfolioAcceptanceProducer({ actualByTestId, failuresByTestId, identity, command, cleanupVerified: true });
  };
  const variants = [
    ['valid', () => {}, false, 5, 0],
    ['source substitution', manifest => { const item = manifest.results[0]; item.sourceDigests[Object.keys(item.sourceDigests)[0]] = '0'.repeat(64); }, false, 0, 0],
    ['result substitution', manifest => { manifest.results[4].actual.exactReplay = false; }, false, 0, 0],
    ['cleanup substitution', manifest => { manifest.results[0].cleanupVerified = false; }, false, 0, 0],
    ['partial artifact', manifest => { manifest.results.pop(); }, false, 0, 0],
    ['executed failure despite aggregate success', () => {}, true, 4, 1],
    ['failed aggregate', manifest => { manifest.suites[0].status = 'FAIL'; }, true, 0, 5],
    ['aggregate-only', manifest => { manifest.results = []; }, false, 0, 0],
  ];
  for (const [name, mutate, failure, passed, failed] of variants) {
    const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-application-portfolio-report-'));
    try {
      const retainedPath = path.join(temp, 'retained.json');
      const manifest = {
        schemaVersion: 3, manifestKind: 'retained', ...identity,
        suites: [{ suiteId: suite.suiteId, status: 'PASS', command, requiredGate: true, testIds: suite.testIds }],
        results: structuredClone(makeProducer(failure).results),
      };
      mutate(manifest);
      writeFileSync(retainedPath, JSON.stringify(manifest));
      const resultsDir = path.join(temp, 'report');
      const run = spawnSync(process.execPath, ['scripts/runExhaustiveAcceptanceReport.mjs'], {
        cwd: process.cwd(), encoding: 'utf8',
        env: {
          ...process.env, RELEASE_SHA: releaseSha, GITHUB_RUN_ID: identity.workflowRunId,
          GITHUB_RUN_ATTEMPT: identity.workflowAttempt, ACCEPTANCE_WORKFLOW_PATH: workflowPath,
          ACCEPTANCE_EVIDENCE_ENVIRONMENT: 'pull-request', ACCEPTANCE_EXECUTION_DISPOSITION: 'NOT_EXECUTED',
          ACCEPTANCE_RESULTS_DIR: resultsDir, RETAINED_RESULTS_MANIFEST: retainedPath,
          ORACLE_RESULTS_MANIFEST: path.join(temp, 'absent-oracle.json'),
          SERVER_RESULTS_MANIFEST: path.join(temp, 'absent-server.json'),
          PLAYWRIGHT_JSON: path.join(temp, 'absent-browser.json'),
        },
      });
      const report = JSON.parse(readFileSync(path.join(resultsDir, 'acceptance-results.json'), 'utf8'));
      assert.equal(report.summary.PASS, passed, `${name}: ${report.results.find(item => item.testId === 'APPS-001')?.failureReason ?? report.summary.preflightFailure ?? run.stderr}`);
      assert.equal(report.summary.FAIL, failed, name);
      assert.equal(report.summary.BLOCKED, 108 - passed - failed, name);
      assert.ok(report.results.filter(item => item.status === 'PASS').every(item => item.testId.startsWith('APPS-')), name);
      if (failed) assert.equal(report.results.find(item => item.testId === 'APPS-004').status, 'FAIL', name);
      if (passed === 5) assert.equal(run.status, 0, run.stderr);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }
});

test('Assess V2 report promotes only 021 and 022 and rejects partial, substituted and aggregate-only evidence', async () => {
  const { buildAssessV2AcceptanceProducer } = await import('./assessV2AcceptanceEvidence.mjs');
  const suite = loadExecutionBindings().retainedSuites.find(item => item.suiteId === 'assess-v2-authority');
  const command = suite.command.join(' ');
  const identity = { releaseSha, workflowRunId: '123456', workflowAttempt: '2', environment: 'pull-request', workflowPath };
  // Unit-level report inputs, not an assertion that PostgreSQL ran in this test.
  const makeProducer = failure => {
    const actualByTestId = {
      'ASSESS-021': {
        logicalMutationCount: 1, versionDelta: 1, receiptDelta: 1, auditDelta: 1,
        committedCount: 1, versionConflictCount: 1, rejectedEffectDelta: 0,
      },
      'ASSESS-022': {
        logicalMutationCount: 1, versionDelta: 1, receiptDelta: 1, auditDelta: 1,
        idempotencyConflict: true, originalReceiptPreserved: true,
        committedStatePreserved: true, conflictEffectDelta: 0,
      },
    };
    const failuresByTestId = {};
    if (failure) {
      delete actualByTestId['ASSESS-022'];
      failuresByTestId['ASSESS-022'] = { failureCode: 'assertion_failed' };
    }
    return buildAssessV2AcceptanceProducer({ actualByTestId, failuresByTestId, identity, command, cleanupVerified: true });
  };
  const variants = [
    ['valid', () => {}, false, 2, 0],
    ['source substitution', manifest => { const item = manifest.results[0]; item.sourceDigests[Object.keys(item.sourceDigests)[0]] = '0'.repeat(64); }, false, 0, 0],
    ['result substitution', manifest => { manifest.results[0].actual.versionConflictCount = 0; }, false, 0, 0],
    ['hosted case substitution', manifest => { manifest.results[0].testId = 'ASSESS-018'; }, false, 0, 0],
    ['cleanup substitution', manifest => { manifest.results[0].cleanupVerified = false; }, false, 0, 0],
    ['partial artifact', manifest => { manifest.results.pop(); }, false, 0, 0],
    ['executed failure despite aggregate success', () => {}, true, 1, 1],
    ['failed aggregate', manifest => { manifest.suites[0].status = 'FAIL'; }, true, 0, 2],
    ['aggregate-only', manifest => { manifest.results = []; }, false, 0, 0],
  ];
  for (const [name, mutate, failure, passed, failed] of variants) {
    const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-assess-v2-report-'));
    try {
      const retainedPath = path.join(temp, 'retained.json');
      const manifest = {
        schemaVersion: 3, manifestKind: 'retained', ...identity,
        suites: [{ suiteId: suite.suiteId, status: 'PASS', command, requiredGate: true, testIds: suite.testIds }],
        results: structuredClone(makeProducer(failure).results),
      };
      mutate(manifest);
      writeFileSync(retainedPath, JSON.stringify(manifest));
      const resultsDir = path.join(temp, 'report');
      const run = spawnSync(process.execPath, ['scripts/runExhaustiveAcceptanceReport.mjs'], {
        cwd: process.cwd(), encoding: 'utf8',
        env: {
          ...process.env, RELEASE_SHA: releaseSha, GITHUB_RUN_ID: identity.workflowRunId,
          GITHUB_RUN_ATTEMPT: identity.workflowAttempt, ACCEPTANCE_WORKFLOW_PATH: workflowPath,
          ACCEPTANCE_EVIDENCE_ENVIRONMENT: 'pull-request', ACCEPTANCE_EXECUTION_DISPOSITION: 'NOT_EXECUTED',
          ACCEPTANCE_RESULTS_DIR: resultsDir, RETAINED_RESULTS_MANIFEST: retainedPath,
          ORACLE_RESULTS_MANIFEST: path.join(temp, 'absent-oracle.json'),
          SERVER_RESULTS_MANIFEST: path.join(temp, 'absent-server.json'),
          PLAYWRIGHT_JSON: path.join(temp, 'absent-browser.json'),
        },
      });
      const report = JSON.parse(readFileSync(path.join(resultsDir, 'acceptance-results.json'), 'utf8'));
      assert.equal(report.summary.PASS, passed, `${name}: ${report.results.find(item => item.testId === 'ASSESS-021')?.failureReason ?? report.summary.preflightFailure ?? run.stderr}`);
      assert.equal(report.summary.FAIL, failed, name);
      assert.equal(report.summary.BLOCKED, 108 - passed - failed, name);
      assert.deepEqual(
        report.results.filter(item => item.status === 'PASS').map(item => item.testId).sort(),
        passed === 2 ? ['ASSESS-021', 'ASSESS-022'] : passed === 1 ? ['ASSESS-021'] : [],
        name,
      );
      for (const hostedId of ['ASSESS-018', 'ASSESS-019', 'ASSESS-020']) {
        assert.equal(report.results.find(item => item.testId === hostedId).status, 'BLOCKED', `${name}:${hostedId}`);
      }
      if (failed) assert.equal(report.results.find(item => item.testId === 'ASSESS-022').status, 'FAIL', name);
      if (passed === 2) assert.equal(run.status, 0, run.stderr);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }
});


test('Studio PostgreSQL report promotes only seven lifecycle cases and rejects substituted evidence', async () => {
  const { buildStudioAcceptanceProducer, STUDIO_ACCEPTANCE_TEST_IDS } = await import('./studioAcceptanceEvidence.mjs');
  const suite = loadExecutionBindings().retainedSuites.find(item => item.suiteId === 'studio-postgres-acceptance');
  const command = suite.command.join(' ');
  const identity = { releaseSha, workflowRunId: '123456', workflowAttempt: '2', environment: 'pull-request', workflowPath };
  const makeProducer = failure => {
    // Explicit unit inputs: this report test does not execute PostgreSQL or Storage.
    const actualByTestId = JSON.parse(readFileSync('tests/acceptance/fixtures/studio-evidence-unit-results.json', 'utf8'));
    const failuresByTestId = {};
    if (failure) {
      delete actualByTestId['STUDIO-011'];
      failuresByTestId['STUDIO-011'] = { failureCode: 'assertion_failed' };
    }
    return buildStudioAcceptanceProducer({ actualByTestId, failuresByTestId, identity, command, cleanupVerified: true });
  };
  const variants = [
    ['valid', () => {}, false, 7, 0],
    ['source substitution', m => { const i = m.results[0]; i.sourceDigests[Object.keys(i.sourceDigests)[0]] = '0'.repeat(64); }, false, 0, 0],
    ['result substitution', m => { m.results[0].actual.logicalMutationCount = 0; }, false, 0, 0],
    ['hosted case substitution', m => { m.results[0].testId = 'STUDIO-007'; }, false, 0, 0],
    ['cleanup substitution', m => { m.results[0].cleanupVerified = false; }, false, 0, 0],
    ['partial artifact', m => { m.results.pop(); }, false, 0, 0],
    ['executed failure despite aggregate success', () => {}, true, 6, 1],
    ['failed aggregate', m => { m.suites[0].status = 'FAIL'; }, true, 0, 7],
    ['aggregate-only', m => { m.results = []; }, false, 0, 0],
  ];
  for (const [name, mutate, failure, passed, failed] of variants) {
    const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-studio-report-'));
    try {
      const retainedPath = path.join(temp, 'retained.json');
      const manifest = {
        schemaVersion: 3, manifestKind: 'retained', ...identity,
        suites: [{ suiteId: suite.suiteId, status: 'PASS', command, requiredGate: true, testIds: suite.testIds }],
        results: structuredClone(makeProducer(failure).results),
      };
      mutate(manifest);
      writeFileSync(retainedPath, JSON.stringify(manifest));
      const resultsDir = path.join(temp, 'report');
      const run = spawnSync(process.execPath, ['scripts/runExhaustiveAcceptanceReport.mjs'], {
        cwd: process.cwd(), encoding: 'utf8',
        env: {
          ...process.env, RELEASE_SHA: releaseSha, GITHUB_RUN_ID: identity.workflowRunId,
          GITHUB_RUN_ATTEMPT: identity.workflowAttempt, ACCEPTANCE_WORKFLOW_PATH: workflowPath,
          ACCEPTANCE_EVIDENCE_ENVIRONMENT: 'pull-request', ACCEPTANCE_EXECUTION_DISPOSITION: 'NOT_EXECUTED',
          ACCEPTANCE_RESULTS_DIR: resultsDir, RETAINED_RESULTS_MANIFEST: retainedPath,
          ORACLE_RESULTS_MANIFEST: path.join(temp, 'absent-oracle.json'),
          SERVER_RESULTS_MANIFEST: path.join(temp, 'absent-server.json'),
          PLAYWRIGHT_JSON: path.join(temp, 'absent-browser.json'),
        },
      });
      const report = JSON.parse(readFileSync(path.join(resultsDir, 'acceptance-results.json'), 'utf8'));
      assert.equal(report.summary.PASS, passed, `${name}: ${report.summary.preflightFailure ?? run.stderr}`);
      assert.equal(report.summary.FAIL, failed, name);
      assert.equal(report.summary.BLOCKED, 108 - passed - failed, name);
      assert.deepEqual(report.results.filter(i => i.status === 'PASS').map(i => i.testId).sort(),
        passed === 7 ? [...STUDIO_ACCEPTANCE_TEST_IDS].sort() : passed === 6 ? STUDIO_ACCEPTANCE_TEST_IDS.filter(id => id !== 'STUDIO-011').sort() : [], name);
      for (const item of report.results.filter(i => !STUDIO_ACCEPTANCE_TEST_IDS.includes(i.testId))) {
        assert.equal(item.status, 'BLOCKED', `${name}:${item.testId}`);
      }
      if (failed) assert.equal(report.results.find(i => i.testId === 'STUDIO-011').status, 'FAIL', name);
      if (passed === 7) assert.equal(run.status, 0, run.stderr);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }
});
