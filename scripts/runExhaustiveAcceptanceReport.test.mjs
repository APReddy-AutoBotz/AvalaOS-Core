import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createFullPageContrastAttachment } from './acceptanceExecutionProfile.mjs';
import { createHostedSandboxAcceptanceAttachment } from './hostedSandboxAcceptanceEvidence.mjs';
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
    'scripts/hostedSandboxAcceptanceEvidence.mjs',
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

const fullInventoryHostedReport = (metadata = hostedMetadata()) => {
  const catalog = loadCatalog();
  const catalogByTestId = new Map(catalog.cases.map(item => [item.testId, item]));
  const hostedBindings = loadExecutionBindings().hostedTests;
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
  assert.equal(executable, 36);
  assert.equal(skipped, 38);
  return {
    config: { metadata },
    errors: [],
    suites: [{ title: 'tests/browser/exhaustiveHostedAcceptance.spec.ts', specs }],
    stats: { expected: executable, unexpected: 0, skipped },
  };
};

const measuredTargetActions = {
  'SANDBOX-002': ['process-analyst','ap-process-owner','delivery-lead','control-reviewer','automation-contributor','buyer-viewer','platform-admin'].map(persona => `persona-entry:${persona}`),
  'SAFETY-004': ['initial-stale-boards','stale-delivery-pack','missing-delivery-pack','malformed-delivery-pack'].map(scope => `invalid-scope-reconstruction:${scope}`),
  'ASSESS-001': ['process-create'],
  'ASSESS-004': ['incomplete-process-create'],
};

const measuredHostedReport = (metadata = hostedMetadata()) => {
  const catalog = loadCatalog();
  const bindings = loadExecutionBindings();
  const report = fullInventoryHostedReport(metadata);
  for (const spec of report.suites[0].specs) {
    const id = /^\[([^\]]+)\]/u.exec(spec.title)[1];
    const binding = bindings.hostedTests.find(item => item.testId === id);
    if (!binding.scenario) continue;
    const testCase = catalog.cases.find(item => item.testId === id);
    for (const execution of spec.tests) {
      const attempt = execution.results[0];
      attempt.startTime = '2026-09-08T12:00:00.000Z';
      attempt.duration = 10_000;
      const attachment = createHostedSandboxAcceptanceAttachment({
        testCase, binding, metadata: report.config.metadata, project: execution.projectName,
        observedAt: '2026-09-08T12:00:01.000Z',
        measurement: {
          targetActions: measuredTargetActions[id] ?? [],
          supportingActions: id === 'ASSESS-004' ? ['draft-save'] : [],
        },
      });
      attempt.attachments.push({ ...attachment, body: Buffer.from(attachment.body).toString('base64') });
      attempt.attachments.push({ name: 'hosted-sandbox-attempt-window-v1', contentType: 'application/json',
        body: Buffer.from(JSON.stringify({startTime: attempt.startTime, endedAt: '2026-09-08T12:00:10.000Z',
          retry: attempt.retry, title: spec.title, project: execution.projectName})).toString('base64') });
    }
  }
  return report;
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
    assert.match(sandbox.failureReason, /same-run measured Sandbox fixture evidence is missing or invalid/u);
    passedControlScriptScenarios.add('exhaustive-report-planned-scope-blocked');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('same-run measured Sandbox evidence promotes only the 18 supported browser cases', () => {
  const attachmentFor = (report, id = 'SANDBOX-001') => report.suites[0].specs.find(spec => spec.title.startsWith(`[${id}]`)).tests[0].results[0].attachments.find(a => a.name === 'hosted-sandbox-acceptance-v1');
  const substitute = (report, change) => {
    const attachment = attachmentFor(report);
    const body = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
    change(body);
    attachment.body = Buffer.from(JSON.stringify(body)).toString('base64');
  };
  const variants = [
    ['measured', () => {}, 18],
    ['missing attachment', report => { attachmentFor(report).name = 'unrelated-evidence'; }, 17],
    ['wrong run', report => substitute(report, body => { body.workflow.runId = '999'; }), 17],
    ['wrong deployment', report => substitute(report, body => { body.profile.deployId = 'f'.repeat(24); }), 17],
    ['wrong project', report => substitute(report, body => { body.project = 'pixel-7-chromium'; }), 17],
    ['fake tenant scope', report => substitute(report, body => { body.scope.organizationId = '11111111-1111-4111-8111-111111111111'; }), 17],
    ['unmeasured mutation', report => substitute(report, body => { body.actual.targetMutationCount = 1; }), 17],
    ['outside attempt', report => substitute(report, body => { body.observedAt = '2026-09-07T12:00:01.000Z'; }), 17],
    ['executed assertion failure', report => {
      const execution = report.suites[0].specs[0].tests[0];
      execution.status = 'unexpected'; execution.results[0].status = 'failed';
    }, 17, 1],
  ];
  for (const [name, mutate, passCount, failCount = 0] of variants) {
    const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-hosted-measured-report-'));
    try {
      const report = measuredHostedReport();
      mutate(report);
      const playwrightPath = path.join(temp, 'playwright.json');
      writeFileSync(playwrightPath, JSON.stringify(report));
      const resultsDir = path.join(temp, 'results');
      const run = spawnSync(process.execPath, ['scripts/runExhaustiveAcceptanceReport.mjs'], {
        cwd: process.cwd(), encoding: 'utf8',
        env: { ...process.env, ...hostedEnvironment(), ACCEPTANCE_RESULTS_DIR: resultsDir, PLAYWRIGHT_JSON: playwrightPath,
          RETAINED_RESULTS_MANIFEST: path.join(temp, 'absent-retained.json'), ORACLE_RESULTS_MANIFEST: path.join(temp, 'absent-oracle.json'), SERVER_RESULTS_MANIFEST: path.join(temp, 'absent-server.json') },
      });
      assert.notEqual(run.status, 0, name + ': incomplete coverage remains visible');
      const output = JSON.parse(readFileSync(path.join(resultsDir, 'acceptance-results.json'), 'utf8'));
      assert.deepEqual(output.summary.browserEvidenceErrors, [], name);
      assert.equal(output.summary.PASS, passCount, name);
      assert.equal(output.summary.FAIL, failCount, name);
      assert.equal(output.summary.BLOCKED, 108 - passCount - failCount, name);
      assert.equal(output.results.find(item => item.testId === 'ADMIN-001').status, 'BLOCKED', name);
      for (const item of output.results.filter(item => item.status === 'PASS')) {
        assert.deepEqual(item.executedScope, { evidenceScope: 'executed-hosted-sandbox-local', fixtureId: 'synthetic-default' });
        assert.equal(item.actualResult.logicalMutationCount, item.expectedMutationCount);
      }
    } finally { rmSync(temp, { recursive: true, force: true }); }
  }
});

test('dispatch bridge retains canonical producer identity for same-run measured Sandbox evidence', () => {
  const dispatchDeployId = '0123456789abcdef01234567';
  const dispatchBranch = `exhaustive-acceptance-dispatch--${dispatchDeployId}`;
  const dispatchWorkflowPath = '.github/workflows/exhaustive-acceptance-dispatch-bridge.yml';
  const dispatchWorkflowRef = `APReddy-AutoBotz/AvalaOS-Core/${dispatchWorkflowPath}@refs/heads/${dispatchBranch}`;
  const environment = {
    ...hostedEnvironment(),
    RELEASE_SHA: releaseSha,
    ACCEPTANCE_RELEASE_SHA: releaseSha,
    EXPECTED_RELEASE_SHA: releaseSha,
    NETLIFY_DEPLOY_ID: dispatchDeployId,
    GITHUB_REPOSITORY: 'APReddy-AutoBotz/AvalaOS-Core',
    GITHUB_WORKFLOW_REF: dispatchWorkflowRef,
    GITHUB_EVENT_NAME: 'create',
    GITHUB_SHA: releaseSha,
    GITHUB_REF_TYPE: 'branch',
    GITHUB_REF: `refs/heads/${dispatchBranch}`,
    GITHUB_ACTOR: 'APReddy-AutoBotz',
    GITHUB_TRIGGERING_ACTOR: 'APReddy-AutoBotz',
  };
  const metadata = {
    ...hostedMetadata(),
    exactHead: releaseSha,
    deployId: dispatchDeployId,
    workflowRuntime: {
      authority: 'github-actions',
      workflowPath,
      workflowRef: dispatchWorkflowRef,
      repository: 'APReddy-AutoBotz/AvalaOS-Core',
      eventName: 'create',
      runId: '123456',
      runAttempt: '2',
      workflowSha: releaseSha,
      releaseSha,
      callerWorkflowPath: dispatchWorkflowPath,
    },
  };
  for (const [name, reportMutation, environmentMutation, expectedPasses] of [
    ['valid dispatch', () => {}, {}, 18],
    ['wrong caller', report => { report.config.metadata.workflowRuntime.callerWorkflowPath = '.github/workflows/substituted.yml'; }, {}, 0],
    ['corrupt canonical producer', () => {}, { ACCEPTANCE_WORKFLOW_PATH: dispatchWorkflowPath }, 0],
  ]) {
    const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-dispatch-report-'));
    try {
      const report = measuredHostedReport(structuredClone(metadata));
      reportMutation(report);
      const playwrightPath = path.join(temp, 'playwright.json');
      writeFileSync(playwrightPath, JSON.stringify(report));
      const resultsDir = path.join(temp, 'results');
      const run = spawnSync(process.execPath, ['scripts/runExhaustiveAcceptanceReport.mjs'], {
        cwd: process.cwd(), encoding: 'utf8',
        env: {
          ...process.env, ...environment, ...environmentMutation,
          ACCEPTANCE_RESULTS_DIR: resultsDir, PLAYWRIGHT_JSON: playwrightPath,
          RETAINED_RESULTS_MANIFEST: path.join(temp, 'absent-retained.json'),
          ORACLE_RESULTS_MANIFEST: path.join(temp, 'absent-oracle.json'),
          SERVER_RESULTS_MANIFEST: path.join(temp, 'absent-server.json'),
        },
      });
      assert.notEqual(run.status, 0, `${name}: incomplete coverage remains visible`);
      const output = JSON.parse(readFileSync(path.join(resultsDir, 'acceptance-results.json'), 'utf8'));
      assert.equal(output.summary.PASS, expectedPasses, name);
      assert.equal(output.summary.FAIL, 0, name);
      assert.equal(output.summary.BLOCKED, 108 - expectedPasses, name);
      if (expectedPasses === 18) assert.deepEqual(output.summary.browserEvidenceErrors, [], name);
      else assert.ok(output.summary.browserEvidenceErrors.length > 0, name);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }
});

test('dispatch bridge canonical workflow path survives retained producer, runner and report transport', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-dispatch-retained-'));
  try {
    const bindings = loadExecutionBindings();
    const suite = bindings.retainedSuites.find(item => item.suiteId === 'govern-postgres-acceptance');
    const runnerBindingsPath = path.join(temp, 'runner-bindings.json');
    writeFileSync(runnerBindingsPath, JSON.stringify({ retainedSuites: [suite] }));
    const retainedPath = path.join(temp, 'retained.json');
    const dispatchDeployId = '0123456789abcdef01234567';
    const dispatchBranch = `exhaustive-acceptance-dispatch--${dispatchDeployId}`;
    const dispatchEnvironment = {
      ...process.env,
      RELEASE_SHA: releaseSha,
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'APReddy-AutoBotz/AvalaOS-Core',
      GITHUB_WORKFLOW_REF: `APReddy-AutoBotz/AvalaOS-Core/.github/workflows/exhaustive-acceptance-dispatch-bridge.yml@refs/heads/${dispatchBranch}`,
      GITHUB_EVENT_NAME: 'create',
      GITHUB_REF_TYPE: 'branch',
      GITHUB_REF: `refs/heads/${dispatchBranch}`,
      GITHUB_ACTOR: 'APReddy-AutoBotz',
      GITHUB_TRIGGERING_ACTOR: 'APReddy-AutoBotz',
      GITHUB_SHA: releaseSha,
      GITHUB_RUN_ID: '123456',
      GITHUB_RUN_ATTEMPT: '2',
      ACCEPTANCE_WORKFLOW_PATH: workflowPath,
      ACCEPTANCE_EVIDENCE_ENVIRONMENT: 'stable-release',
      GOVERN_ACCEPTANCE_DATABASE_URL: '',
    };
    const retainedRun = spawnSync(process.execPath, ['scripts/runExhaustiveRetainedSuites.mjs'], {
      cwd: process.cwd(), encoding: 'utf8',
      env: { ...dispatchEnvironment, ACCEPTANCE_BINDINGS: runnerBindingsPath, RETAINED_RESULTS_MANIFEST: retainedPath },
    });
    assert.equal(retainedRun.status, 1, retainedRun.stderr);
    const retained = JSON.parse(readFileSync(retainedPath, 'utf8'));
    assert.equal(retained.workflowPath, workflowPath);
    assert.deepEqual(retained.results.map(item => item.testId).sort(), ['GOVERN-008', 'GOVERN-009', 'GOVERN-010']);
    assert.ok(retained.results.every(item => item.workflowPath === workflowPath
      && item.environment === 'stable-release' && item.status === 'BLOCKED'));

    const resultsDir = path.join(temp, 'report');
    const reportRun = spawnSync(process.execPath, ['scripts/runExhaustiveAcceptanceReport.mjs'], {
      cwd: process.cwd(), encoding: 'utf8',
      env: {
        ...dispatchEnvironment,
        ACCEPTANCE_EXECUTION_DISPOSITION: 'NOT_EXECUTED', ACCEPTANCE_RESULTS_DIR: resultsDir,
        RETAINED_RESULTS_MANIFEST: retainedPath,
        ORACLE_RESULTS_MANIFEST: path.join(temp, 'absent-oracle.json'),
        SERVER_RESULTS_MANIFEST: path.join(temp, 'absent-server.json'),
        PLAYWRIGHT_JSON: path.join(temp, 'absent-browser.json'),
      },
    });
    assert.equal(reportRun.status, 0, reportRun.stderr);
    const report = JSON.parse(readFileSync(path.join(resultsDir, 'acceptance-results.json'), 'utf8'));
    for (const testId of ['GOVERN-008', 'GOVERN-009', 'GOVERN-010']) {
      const result = report.results.find(item => item.testId === testId);
      assert.equal(result.status, 'BLOCKED');
      assert.equal(result.failureReason, 'Exact retained Test ID assertions were skipped or blocked: govern-postgres-acceptance');
      assert.doesNotMatch(result.failureReason, /workflow|provenance invalid/u,
        `${testId} must retain its producer outcome without caller-path substitution`);
    }
    assert.equal(report.summary.BLOCKED, 108);
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
    const blockedByTestId = {};
    if (failure) {
      delete actualByTestId['STUDIO-011'];
      if (failure === 'blocked') blockedByTestId['STUDIO-011'] = { failureCode: 'setup_failed' };
      else failuresByTestId['STUDIO-011'] = { failureCode: 'assertion_failed' };
    }
    return buildStudioAcceptanceProducer({ actualByTestId, failuresByTestId, blockedByTestId, identity, command, cleanupVerified: true });
  };
  const variants = [
    ['valid', () => {}, false, 7, 0],
    ['source substitution', m => { const i = m.results[0]; i.sourceDigests[Object.keys(i.sourceDigests)[0]] = '0'.repeat(64); }, false, 0, 0],
    ['result substitution', m => { m.results[0].actual.logicalMutationCount = 0; }, false, 0, 0],
    ['hosted case substitution', m => { m.results[0].testId = 'STUDIO-007'; }, false, 0, 0],
    ['cleanup substitution', m => { m.results[0].cleanupVerified = false; }, false, 0, 0],
    ['partial artifact', m => { m.results.pop(); }, false, 0, 0],
    ['executed failure despite aggregate success', () => {}, true, 6, 1],
    ['setup blocked without product failure', () => {}, 'blocked', 6, 0],
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


test('Studio actual harness emits BLOCKED for missing configuration without database access', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-studio-missing-config-'));
  try {
    const resultPath = path.join(temp, 'result.json');
    const run = spawnSync(process.execPath, ['scripts/testStudioAcceptancePostgres.mjs'], {
      cwd: process.cwd(), encoding: 'utf8',
      env: {
        ...process.env, STUDIO_ACCEPTANCE_DATABASE_URL: '', RELEASE_SHA: releaseSha,
        GITHUB_RUN_ID: '123456', GITHUB_RUN_ATTEMPT: '2',
        ACCEPTANCE_WORKFLOW_PATH: workflowPath, ACCEPTANCE_EVIDENCE_ENVIRONMENT: 'pull-request',
        RETAINED_TEST_ID_RESULTS: resultPath,
        RETAINED_SUITE_COMMAND: 'node scripts/testStudioAcceptancePostgres.mjs',
      },
    });
    assert.equal(run.status, 0, run.stderr);
    const emitted = JSON.parse(readFileSync(resultPath, 'utf8'));
    assert.equal(emitted.results.length, 7);
    assert.ok(emitted.results.every(item => item.status === 'BLOCKED'
      && item.failureCode === 'setup_failed' && item.actual === null && item.cleanupVerified === true));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('Studio retained runner keeps per-case outcomes while failing the CI gate', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-studio-retained-runner-'));
  try {
    const producerPath = path.join(temp, 'unit-producer.mjs');
    const helperUrl = new URL('./studioAcceptanceEvidence.mjs', import.meta.url).href;
    // Test-only producer inputs exercise process/result transport; no PostgreSQL claim.
    writeFileSync(producerPath, `
      import fs from 'node:fs';
      import { writeStudioAcceptanceProducer } from ${JSON.stringify(helperUrl)};
      const actualByTestId = JSON.parse(fs.readFileSync('tests/acceptance/fixtures/studio-evidence-unit-results.json', 'utf8'));
      const failuresByTestId = {}, blockedByTestId = {};
      if (process.env.STUDIO_UNIT_OUTCOME !== 'PASS') {
        delete actualByTestId['STUDIO-011'];
        if (process.env.STUDIO_UNIT_OUTCOME === 'FAIL') failuresByTestId['STUDIO-011'] = { failureCode: 'assertion_failed' };
        else blockedByTestId['STUDIO-011'] = { failureCode: 'setup_failed' };
      }
      writeStudioAcceptanceProducer(process.env.RETAINED_TEST_ID_RESULTS, {
        actualByTestId, failuresByTestId, blockedByTestId, cleanupVerified: true,
        command: process.env.RETAINED_SUITE_COMMAND,
        identity: {
          releaseSha: process.env.RELEASE_SHA, workflowRunId: process.env.GITHUB_RUN_ID,
          workflowAttempt: process.env.GITHUB_RUN_ATTEMPT, environment: process.env.ACCEPTANCE_EVIDENCE_ENVIRONMENT,
          workflowPath: process.env.ACCEPTANCE_WORKFLOW_PATH,
        },
      });
    `);
    const suite = loadExecutionBindings().retainedSuites.find(i => i.suiteId === 'studio-postgres-acceptance');
    const bindingsPath = path.join(temp, 'bindings.json');
    writeFileSync(bindingsPath, JSON.stringify({ retainedSuites: [{ ...suite, command: [process.execPath, producerPath] }] }));
    for (const outcome of ['PASS', 'FAIL', 'BLOCKED']) {
      const manifestPath = path.join(temp, `retained-${outcome}.json`);
      const run = spawnSync(process.execPath, ['scripts/runExhaustiveRetainedSuites.mjs'], {
        cwd: process.cwd(), encoding: 'utf8',
        env: {
          ...process.env, RELEASE_SHA: releaseSha, GITHUB_RUN_ID: '123456', GITHUB_RUN_ATTEMPT: '2',
          ACCEPTANCE_WORKFLOW_PATH: workflowPath, ACCEPTANCE_EVIDENCE_ENVIRONMENT: 'pull-request',
          ACCEPTANCE_BINDINGS: bindingsPath, RETAINED_RESULTS_MANIFEST: manifestPath,
          STUDIO_UNIT_OUTCOME: outcome,
        },
      });
      assert.equal(run.status, outcome === 'PASS' ? 0 : 1, `${outcome}: ${run.stderr}`);
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      assert.equal(manifest.suites[0].status, 'PASS', 'producer execution completed and emitted validated independent outcomes');
      assert.equal(manifest.results.length, 7);
      assert.equal(manifest.results.find(i => i.testId === 'STUDIO-011').status, outcome);
      assert.equal(manifest.results.filter(i => i.testId !== 'STUDIO-011' && i.status === 'PASS').length, 6);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('Govern PostgreSQL report promotes only three authority cases and rejects substituted evidence', async () => {
  const { buildGovernAcceptanceProducer, GOVERN_ACCEPTANCE_TEST_IDS } = await import('./governAcceptanceEvidence.mjs');
  const suite = loadExecutionBindings().retainedSuites.find(item => item.suiteId === 'govern-postgres-acceptance');
  const command = suite.command.join(' ');
  const identity = { releaseSha, workflowRunId: '123456', workflowAttempt: '2', environment: 'pull-request', workflowPath };
  const makeProducer = failure => {
    // Explicit unit inputs: this report test does not execute PostgreSQL or Storage.
    const actualByTestId = JSON.parse(readFileSync('tests/acceptance/fixtures/govern-evidence-unit-results.json', 'utf8'));
    const failuresByTestId = {};
    const blockedByTestId = {};
    if (failure) {
      delete actualByTestId['GOVERN-010'];
      if (failure === 'blocked') blockedByTestId['GOVERN-010'] = { failureCode: 'setup_failed' };
      else failuresByTestId['GOVERN-010'] = { failureCode: 'assertion_failed' };
    }
    return buildGovernAcceptanceProducer({ actualByTestId, failuresByTestId, blockedByTestId, identity, command, cleanupVerified: true });
  };
  const variants = [
    ['valid', () => {}, false, 3, 0],
    ['source substitution', m => { const i = m.results[0]; i.sourceDigests[Object.keys(i.sourceDigests)[0]] = '0'.repeat(64); }, false, 0, 0],
    ['result substitution', m => { m.results[0].actual.logicalMutationCount = 0; }, false, 0, 0],
    ['hosted case substitution', m => { m.results[0].testId = 'GOVERN-007'; }, false, 0, 0],
    ['retained PASS cannot satisfy a hosted environment', () => {}, false, 2, 0, true],
    ['cleanup substitution', m => { m.results[0].cleanupVerified = false; }, false, 0, 0],
    ['partial artifact', m => { m.results.pop(); }, false, 0, 0],
    ['executed failure despite aggregate success', () => {}, true, 2, 1],
    ['setup blocked without product failure', () => {}, 'blocked', 2, 0],
    ['failed aggregate', m => { m.suites[0].status = 'FAIL'; }, true, 0, 3],
    ['aggregate-only', m => { m.results = []; }, false, 0, 0],
  ];
  for (const [name, mutate, failure, passed, failed, hostedRequirement = false] of variants) {
    const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-govern-report-'));
    try {
      const retainedPath = path.join(temp, 'retained.json');
      const manifest = {
        schemaVersion: 3, manifestKind: 'retained', ...identity,
        suites: [{ suiteId: suite.suiteId, status: 'PASS', command, requiredGate: true, testIds: suite.testIds }],
        results: structuredClone(makeProducer(failure).results),
      };
      mutate(manifest);
      writeFileSync(retainedPath, JSON.stringify(manifest));
      const catalogPath = path.join(temp, 'catalog.json');
      const catalog = loadCatalog();
      if (hostedRequirement) catalog.cases.find(item => item.testId === 'GOVERN-008').environment = 'hosted_sandbox';
      writeFileSync(catalogPath, JSON.stringify(catalog));
      const resultsDir = path.join(temp, 'report');
      const run = spawnSync(process.execPath, ['scripts/runExhaustiveAcceptanceReport.mjs'], {
        cwd: process.cwd(), encoding: 'utf8',
        env: {
          ...process.env, RELEASE_SHA: releaseSha, GITHUB_RUN_ID: identity.workflowRunId,
          GITHUB_RUN_ATTEMPT: identity.workflowAttempt, ACCEPTANCE_WORKFLOW_PATH: workflowPath,
          ACCEPTANCE_EVIDENCE_ENVIRONMENT: 'pull-request', ACCEPTANCE_EXECUTION_DISPOSITION: 'NOT_EXECUTED',
          ACCEPTANCE_RESULTS_DIR: resultsDir, RETAINED_RESULTS_MANIFEST: retainedPath,
          ACCEPTANCE_CATALOG: catalogPath,
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
        passed === 3 ? [...GOVERN_ACCEPTANCE_TEST_IDS].sort() : passed === 2 ? GOVERN_ACCEPTANCE_TEST_IDS.filter(id => id !== (hostedRequirement ? 'GOVERN-008' : 'GOVERN-010')).sort() : [], name);
      if (hostedRequirement) assert.match(report.results.find(item => item.testId === 'GOVERN-008').failureReason, /retained authority evidence alone is insufficient/u);
      for (const item of report.results.filter(i => !GOVERN_ACCEPTANCE_TEST_IDS.includes(i.testId))) {
        assert.equal(item.status, 'BLOCKED', `${name}:${item.testId}`);
      }
      if (failed) assert.equal(report.results.find(i => i.testId === 'GOVERN-010').status, 'FAIL', name);
      if (passed === 3) assert.equal(run.status, 0, run.stderr);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }
});


test('Govern actual harness emits BLOCKED for missing configuration without database access', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-govern-missing-config-'));
  try {
    const resultPath = path.join(temp, 'result.json');
    const run = spawnSync(process.execPath, ['scripts/testGovernAcceptancePostgres.mjs'], {
      cwd: process.cwd(), encoding: 'utf8',
      env: {
        ...process.env, GOVERN_ACCEPTANCE_DATABASE_URL: '', RELEASE_SHA: releaseSha,
        GITHUB_RUN_ID: '123456', GITHUB_RUN_ATTEMPT: '2',
        ACCEPTANCE_WORKFLOW_PATH: workflowPath, ACCEPTANCE_EVIDENCE_ENVIRONMENT: 'pull-request',
        RETAINED_TEST_ID_RESULTS: resultPath,
        RETAINED_SUITE_COMMAND: 'node scripts/testGovernAcceptancePostgres.mjs',
      },
    });
    assert.equal(run.status, 0, run.stderr);
    const emitted = JSON.parse(readFileSync(resultPath, 'utf8'));
    assert.equal(emitted.results.length, 3);
    assert.ok(emitted.results.every(item => item.status === 'BLOCKED'
      && item.failureCode === 'setup_failed' && item.actual === null && item.cleanupVerified === true));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('Govern retained runner keeps per-case outcomes while failing the CI gate', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-govern-retained-runner-'));
  try {
    const producerPath = path.join(temp, 'unit-producer.mjs');
    const helperUrl = new URL('./governAcceptanceEvidence.mjs', import.meta.url).href;
    // Test-only producer inputs exercise process/result transport; no PostgreSQL claim.
    writeFileSync(producerPath, `
      import fs from 'node:fs';
      import { writeGovernAcceptanceProducer } from ${JSON.stringify(helperUrl)};
      const actualByTestId = JSON.parse(fs.readFileSync('tests/acceptance/fixtures/govern-evidence-unit-results.json', 'utf8'));
      const failuresByTestId = {}, blockedByTestId = {};
      if (process.env.GOVERN_UNIT_OUTCOME !== 'PASS') {
        delete actualByTestId['GOVERN-010'];
        if (process.env.GOVERN_UNIT_OUTCOME === 'FAIL') failuresByTestId['GOVERN-010'] = { failureCode: 'assertion_failed' };
        else blockedByTestId['GOVERN-010'] = { failureCode: 'setup_failed' };
      }
      writeGovernAcceptanceProducer(process.env.RETAINED_TEST_ID_RESULTS, {
        actualByTestId, failuresByTestId, blockedByTestId, cleanupVerified: true,
        command: process.env.RETAINED_SUITE_COMMAND,
        identity: {
          releaseSha: process.env.RELEASE_SHA, workflowRunId: process.env.GITHUB_RUN_ID,
          workflowAttempt: process.env.GITHUB_RUN_ATTEMPT, environment: process.env.ACCEPTANCE_EVIDENCE_ENVIRONMENT,
          workflowPath: process.env.ACCEPTANCE_WORKFLOW_PATH,
        },
      });
    `);
    const suite = loadExecutionBindings().retainedSuites.find(i => i.suiteId === 'govern-postgres-acceptance');
    const bindingsPath = path.join(temp, 'bindings.json');
    writeFileSync(bindingsPath, JSON.stringify({ retainedSuites: [{ ...suite, command: [process.execPath, producerPath] }] }));
    for (const outcome of ['PASS', 'FAIL', 'BLOCKED']) {
      const manifestPath = path.join(temp, `retained-${outcome}.json`);
      const run = spawnSync(process.execPath, ['scripts/runExhaustiveRetainedSuites.mjs'], {
        cwd: process.cwd(), encoding: 'utf8',
        env: {
          ...process.env, RELEASE_SHA: releaseSha, GITHUB_RUN_ID: '123456', GITHUB_RUN_ATTEMPT: '2',
          ACCEPTANCE_WORKFLOW_PATH: workflowPath, ACCEPTANCE_EVIDENCE_ENVIRONMENT: 'pull-request',
          ACCEPTANCE_BINDINGS: bindingsPath, RETAINED_RESULTS_MANIFEST: manifestPath,
          GOVERN_UNIT_OUTCOME: outcome,
        },
      });
      assert.equal(run.status, outcome === 'PASS' ? 0 : 1, `${outcome}: ${run.stderr}`);
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      assert.equal(manifest.suites[0].status, 'PASS', 'producer execution completed and emitted validated independent outcomes');
      assert.equal(manifest.results.length, 3);
      assert.equal(manifest.results.find(i => i.testId === 'GOVERN-010').status, outcome);
      assert.equal(manifest.results.filter(i => i.testId !== 'GOVERN-010' && i.status === 'PASS').length, 2);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('Enterprise Intelligence PostgreSQL report promotes only four ingestion and Assemble cases and rejects substituted evidence', async () => {
  const { buildEnterpriseIntelligenceAcceptanceProducer, EI_ACCEPTANCE_TEST_IDS } = await import('./enterpriseIntelligenceAcceptanceEvidence.mjs');
  const suite = loadExecutionBindings().retainedSuites.find(item => item.suiteId === 'enterprise-intelligence-postgres-acceptance');
  const command = suite.command.join(' ');
  const identity = { releaseSha, workflowRunId: '123456', workflowAttempt: '2', environment: 'pull-request', workflowPath };
  const makeProducer = failure => {
    // Explicit unit inputs: this report test does not execute PostgreSQL or Storage.
    const actualByTestId = JSON.parse(readFileSync('tests/acceptance/fixtures/enterprise-intelligence-evidence-unit-results.json', 'utf8'));
    const failuresByTestId = {};
    const blockedByTestId = {};
    if (failure) {
      delete actualByTestId['EI-005'];
      if (failure === 'blocked') blockedByTestId['EI-005'] = { failureCode: 'setup_failed' };
      else failuresByTestId['EI-005'] = { failureCode: 'assertion_failed' };
    }
    return buildEnterpriseIntelligenceAcceptanceProducer({ actualByTestId, failuresByTestId, blockedByTestId, identity, command, cleanupVerified: true });
  };
  const variants = [
    ['valid', () => {}, false, 4, 0],
    ['source substitution', m => { const i = m.results[0]; i.sourceDigests[Object.keys(i.sourceDigests)[0]] = '0'.repeat(64); }, false, 0, 0],
    ['result substitution', m => { m.results[0].actual.logicalMutationCount = 0; }, false, 0, 0],
    ['unselected case substitution', m => { m.results[0].testId = 'EI-003'; }, false, 0, 0],
    ['cleanup substitution', m => { m.results[0].cleanupVerified = false; }, false, 0, 0],
    ['partial artifact', m => { m.results.pop(); }, false, 0, 0],
    ['executed failure despite aggregate success', () => {}, true, 3, 1],
    ['setup blocked without product failure', () => {}, 'blocked', 3, 0],
    ['failed aggregate', m => { m.suites[0].status = 'FAIL'; }, true, 0, 4],
    ['aggregate-only', m => { m.results = []; }, false, 0, 0],
  ];
  for (const [name, mutate, failure, passed, failed] of variants) {
    const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-ei-report-'));
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
      assert.equal(report.summary.PASS, passed, `${name}: ${report.summary.preflightFailure ?? run.stderr}; ${report.results.find(i => EI_ACCEPTANCE_TEST_IDS.includes(i.testId))?.failureReason ?? ''}`);
      assert.equal(report.summary.FAIL, failed, name);
      assert.equal(report.summary.BLOCKED, 108 - passed - failed, name);
      assert.deepEqual(report.results.filter(i => i.status === 'PASS').map(i => i.testId).sort(),
        passed === 4 ? [...EI_ACCEPTANCE_TEST_IDS].sort() : passed === 3 ? EI_ACCEPTANCE_TEST_IDS.filter(id => id !== 'EI-005').sort() : [], name);
      for (const item of report.results.filter(i => !EI_ACCEPTANCE_TEST_IDS.includes(i.testId))) {
        assert.equal(item.status, 'BLOCKED', `${name}:${item.testId}`);
      }
      if (failed) assert.equal(report.results.find(i => i.testId === 'EI-005').status, 'FAIL', name);
      if (passed === 4) assert.equal(run.status, 0, run.stderr);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }
});


test('Enterprise Intelligence actual harness emits BLOCKED for missing configuration without database access', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-ei-missing-config-'));
  try {
    const resultPath = path.join(temp, 'result.json');
    const run = spawnSync(process.execPath, ['scripts/testEnterpriseIntelligenceAcceptancePostgres.mjs'], {
      cwd: process.cwd(), encoding: 'utf8',
      env: {
        ...process.env, ENTERPRISE_INTELLIGENCE_ACCEPTANCE_DATABASE_URL: '', RELEASE_SHA: releaseSha,
        GITHUB_RUN_ID: '123456', GITHUB_RUN_ATTEMPT: '2',
        ACCEPTANCE_WORKFLOW_PATH: workflowPath, ACCEPTANCE_EVIDENCE_ENVIRONMENT: 'pull-request',
        RETAINED_TEST_ID_RESULTS: resultPath,
        RETAINED_SUITE_COMMAND: 'node scripts/testEnterpriseIntelligenceAcceptancePostgres.mjs',
      },
    });
    assert.equal(run.status, 0, run.stderr);
    const emitted = JSON.parse(readFileSync(resultPath, 'utf8'));
    assert.equal(emitted.results.length, 4);
    assert.ok(emitted.results.every(item => item.status === 'BLOCKED'
      && item.failureCode === 'setup_failed' && item.actual === null && item.cleanupVerified === true));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('Enterprise Intelligence retained runner keeps per-case outcomes while failing the CI gate', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-ei-retained-runner-'));
  try {
    const producerPath = path.join(temp, 'unit-producer.mjs');
    const helperUrl = new URL('./enterpriseIntelligenceAcceptanceEvidence.mjs', import.meta.url).href;
    // Test-only producer inputs exercise process/result transport; no PostgreSQL claim.
    writeFileSync(producerPath, `
      import fs from 'node:fs';
      import { writeEnterpriseIntelligenceAcceptanceProducer } from ${JSON.stringify(helperUrl)};
      const actualByTestId = JSON.parse(fs.readFileSync('tests/acceptance/fixtures/enterprise-intelligence-evidence-unit-results.json', 'utf8'));
      const failuresByTestId = {}, blockedByTestId = {};
      if (process.env.EI_UNIT_OUTCOME !== 'PASS') {
        delete actualByTestId['EI-005'];
        if (process.env.EI_UNIT_OUTCOME === 'FAIL') failuresByTestId['EI-005'] = { failureCode: 'assertion_failed' };
        else blockedByTestId['EI-005'] = { failureCode: 'setup_failed' };
      }
      writeEnterpriseIntelligenceAcceptanceProducer(process.env.RETAINED_TEST_ID_RESULTS, {
        actualByTestId, failuresByTestId, blockedByTestId, cleanupVerified: true,
        command: process.env.RETAINED_SUITE_COMMAND,
        identity: {
          releaseSha: process.env.RELEASE_SHA, workflowRunId: process.env.GITHUB_RUN_ID,
          workflowAttempt: process.env.GITHUB_RUN_ATTEMPT, environment: process.env.ACCEPTANCE_EVIDENCE_ENVIRONMENT,
          workflowPath: process.env.ACCEPTANCE_WORKFLOW_PATH,
        },
      });
    `);
    const suite = loadExecutionBindings().retainedSuites.find(i => i.suiteId === 'enterprise-intelligence-postgres-acceptance');
    const bindingsPath = path.join(temp, 'bindings.json');
    writeFileSync(bindingsPath, JSON.stringify({ retainedSuites: [{ ...suite, command: [process.execPath, producerPath] }] }));
    for (const outcome of ['PASS', 'FAIL', 'BLOCKED']) {
      const manifestPath = path.join(temp, `retained-${outcome}.json`);
      const run = spawnSync(process.execPath, ['scripts/runExhaustiveRetainedSuites.mjs'], {
        cwd: process.cwd(), encoding: 'utf8',
        env: {
          ...process.env, RELEASE_SHA: releaseSha, GITHUB_RUN_ID: '123456', GITHUB_RUN_ATTEMPT: '2',
          ACCEPTANCE_WORKFLOW_PATH: workflowPath, ACCEPTANCE_EVIDENCE_ENVIRONMENT: 'pull-request',
          ACCEPTANCE_BINDINGS: bindingsPath, RETAINED_RESULTS_MANIFEST: manifestPath,
          EI_UNIT_OUTCOME: outcome,
        },
      });
      assert.equal(run.status, outcome === 'PASS' ? 0 : 1, `${outcome}: ${run.stderr}`);
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      assert.equal(manifest.suites[0].status, 'PASS', 'producer execution completed and emitted validated independent outcomes');
      assert.equal(manifest.results.length, 4);
      assert.equal(manifest.results.find(i => i.testId === 'EI-005').status, outcome);
      assert.equal(manifest.results.filter(i => i.testId !== 'EI-005' && i.status === 'PASS').length, 3);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('Legacy Delivery PostgreSQL report promotes only the original duplicate import and retained lineage cases and rejects substituted evidence', async () => {
  const { buildLegacyDeliveryAcceptanceProducer, LEGACY_DELIVERY_ACCEPTANCE_TEST_IDS } = await import('./legacyDeliveryAcceptanceEvidence.mjs');
  const suite = loadExecutionBindings().retainedSuites.find(item => item.suiteId === 'legacy-delivery-postgres-acceptance');
  const command = suite.command.join(' ');
  const identity = { releaseSha, workflowRunId: '123456', workflowAttempt: '2', environment: 'pull-request', workflowPath };
  const makeProducer = failure => {
    // Explicit unit inputs: this report test does not execute PostgreSQL or Storage.
    const actualByTestId = JSON.parse(readFileSync('tests/acceptance/fixtures/legacy-delivery-evidence-unit-results.json', 'utf8'));
    const failuresByTestId = {};
    const blockedByTestId = {};
    if (failure) {
      delete actualByTestId['DELIVERY-008'];
      if (failure === 'blocked') blockedByTestId['DELIVERY-008'] = { failureCode: 'setup_failed' };
      else failuresByTestId['DELIVERY-008'] = { failureCode: 'assertion_failed' };
    }
    return buildLegacyDeliveryAcceptanceProducer({ actualByTestId, failuresByTestId, blockedByTestId, identity, command, cleanupVerified: true });
  };
  const variants = [
    ['valid', () => {}, false, 2, 0],
    ['source substitution', m => { const i = m.results[0]; i.sourceDigests[Object.keys(i.sourceDigests)[0]] = '0'.repeat(64); }, false, 0, 0],
    ['result substitution', m => { m.results[0].actual.logicalMutationCount = 0; }, false, 0, 0],
    ['unselected case substitution', m => { m.results[0].testId = 'DELIVERY-009'; }, false, 0, 0],
    ['cleanup substitution', m => { m.results[0].cleanupVerified = false; }, false, 0, 0],
    ['partial artifact', m => { m.results.pop(); }, false, 0, 0],
    ['executed failure despite aggregate success', () => {}, true, 1, 1],
    ['setup blocked without product failure', () => {}, 'blocked', 1, 0],
    ['failed aggregate', m => { m.suites[0].status = 'FAIL'; }, true, 0, 2],
    ['aggregate-only', m => { m.results = []; }, false, 0, 0],
  ];
  for (const [name, mutate, failure, passed, failed] of variants) {
    const temp = mkdtempSync(path.join(tmpdir(), 'avalaos-legacy-delivery-report-'));
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
      assert.equal(report.summary.PASS, passed, `${name}: ${report.summary.preflightFailure ?? run.stderr}; ${report.results.find(i => LEGACY_DELIVERY_ACCEPTANCE_TEST_IDS.includes(i.testId))?.failureReason ?? ''}`);
      assert.equal(report.summary.FAIL, failed, name);
      assert.equal(report.summary.BLOCKED, 108 - passed - failed, name);
      assert.deepEqual(report.results.filter(i => i.status === 'PASS').map(i => i.testId).sort(),
        passed === 2 ? [...LEGACY_DELIVERY_ACCEPTANCE_TEST_IDS].sort() : passed === 1 ? LEGACY_DELIVERY_ACCEPTANCE_TEST_IDS.filter(id => id !== 'DELIVERY-008').sort() : [], name);
      for (const item of report.results.filter(i => !LEGACY_DELIVERY_ACCEPTANCE_TEST_IDS.includes(i.testId))) {
        assert.equal(item.status, 'BLOCKED', `${name}:${item.testId}`);
      }
      if (failed) assert.equal(report.results.find(i => i.testId === 'DELIVERY-008').status, 'FAIL', name);
      if (passed === 2) assert.equal(run.status, 0, run.stderr);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }
});
