import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import {
  HOSTED_SANDBOX_ACCEPTANCE_CASES,
  createHostedSandboxAcceptanceAttachment,
  verifyHostedSandboxAttachments,
} from './hostedSandboxAcceptanceEvidence.mjs';

const catalog = JSON.parse(readFileSync('tests/acceptance/catalog/test-catalog.json', 'utf8'));
const bindings = JSON.parse(readFileSync('tests/acceptance/execution-bindings.json', 'utf8'));
const catalogById = new Map(catalog.cases.map(item => [item.testId, item]));
const bindingById = new Map(bindings.hostedTests.map(item => [item.testId, item]));
const projects = ['desktop-chromium', 'pixel-7-chromium'];
const exactHead = 'a'.repeat(40);
const metadata = {
  schemaVersion: 'acceptance-report-profile-v1',
  ci: {},
  evidenceKind: 'hosted-preview-acceptance',
  executionKind: 'hosted_preview',
  exactCommand: ['npx', 'playwright', 'test'],
  configPath: 'playwright.exhaustive.config.ts',
  sourcePaths: [
    'tests/browser/exhaustiveHostedAcceptance.spec.ts',
    'tests/browser/productNavigationReadiness.ts',
    'scripts/hostedSandboxAcceptanceEvidence.mjs',
  ],
  exactHead,
  targetOrigin: 'https://example.netlify.app',
  deployId: 'b'.repeat(24),
  workflowRuntime: {
    authority: 'github-actions',
    workflowPath: '.github/workflows/preview-exhaustive-browser-qa.yml',
    workflowRef: 'APReddy-AutoBotz/AvalaOS-Core/.github/workflows/preview-exhaustive-browser-qa.yml@refs/pull/278/merge',
    repository: 'APReddy-AutoBotz/AvalaOS-Core',
    eventName: 'pull_request',
    runId: '37730000001',
    runAttempt: '2',
    workflowSha: exactHead,
    releaseSha: exactHead,
  },
};
const startTime = '2026-10-08T12:00:00.000Z';
const observedAt = '2026-10-08T12:00:00.500Z';

const measurementFor = testId => ({
  targetActions: [...HOSTED_SANDBOX_ACCEPTANCE_CASES[testId].targetActions],
  supportingActions: testId === 'ASSESS-004'
    ? ['persona-session:process-analyst', 'draft-save']
    : testId === 'SANDBOX-003'
      ? ['persona-session:process-analyst']
      : [],
});

const reportAttachment = value => ({
  name: value.name,
  contentType: value.contentType,
  body: Buffer.from(value.body, 'utf8').toString('base64'),
});

const executionFor = (testId, project, overrides = {}) => {
  const testCase = catalogById.get(testId);
  const binding = bindingById.get(testId);
  const attachment = createHostedSandboxAcceptanceAttachment({
    testCase, binding, metadata, project, measurement: measurementFor(testId), observedAt,
  });
  return {
    title: `[${testId}] ${testCase.title}`,
    project,
    status: 'expected',
    expectedStatus: 'passed',
    annotations: [],
    executionKind: 'hosted_preview',
    reportMetadata: structuredClone(metadata),
    results: [{
      status: 'passed', retry: 0, startTime, duration: 1_000,
      attachments: [reportAttachment(attachment), {
        name: 'hosted-sandbox-attempt-window-v1', contentType: 'application/json',
        body: Buffer.from(JSON.stringify({startTime, endedAt: '2026-10-08T12:00:01.000Z', retry: 0,
          title: `[${testId}] ${testCase.title}`, project})).toString('base64'),
      }],
    }],
    ...overrides,
  };
};

const validInput = testId => ({
  testCase: catalogById.get(testId),
  binding: bindingById.get(testId),
  executions: projects.map(project => executionFor(testId, project)),
});

test('reviewed Hosted Sandbox cases match the canonical catalog and produce measured per-project actuals', () => {
  assert.equal(Object.keys(HOSTED_SANDBOX_ACCEPTANCE_CASES).length, 18);
  for (const [testId, definition] of Object.entries(HOSTED_SANDBOX_ACCEPTANCE_CASES)) {
    const testCase = catalogById.get(testId);
    const binding = bindingById.get(testId);
    assert.ok(testCase);
    assert.equal(binding.scenario, definition.scenario);
    assert.deepEqual(binding.projects, projects);
    assert.equal(testCase.expectedMutationCount, definition.targetActions.length);
    const verified = verifyHostedSandboxAttachments(validInput(testId));
    assert.deepEqual(verified.scope, {
      evidenceScope: 'executed-hosted-sandbox-local', fixtureId: 'synthetic-default',
    });
    assert.equal(verified.actual.logicalMutationCount, definition.targetActions.length);
    assert.deepEqual(Object.keys(verified.actual.byProject), projects);
    for (const project of projects) {
      assert.equal(verified.actual.byProject[project].targetMutationCount,
        definition.targetActions.length);
      assert.ok(Number.isSafeInteger(verified.actual.byProject[project].supportingActionCount));
    }
  }
});

test('producer uses supplied observations and rejects expected-value substitution', () => {
  const input = validInput('SANDBOX-002');
  assert.throws(() => createHostedSandboxAcceptanceAttachment({
    testCase: input.testCase,
    binding: input.binding,
    metadata,
    project: projects[0],
    measurement: { targetActions: [], supportingActions: [] },
    observedAt,
  }), /TARGET_ACTION_MISMATCH/u);
  assert.throws(() => createHostedSandboxAcceptanceAttachment({
    testCase: input.testCase,
    binding: input.binding,
    metadata,
    project: projects[0],
    measurement: {
      targetActions: [...HOSTED_SANDBOX_ACCEPTANCE_CASES['SANDBOX-002'].targetActions],
      supportingActions: ['raw customer@example.com'],
    },
    observedAt,
  }), /SUPPORTING_ACTION_INVALID/u);
});

const mutateAttachmentBody = (input, projectIndex, mutation) => {
  const execution = input.executions[projectIndex];
  const attachment = execution.results[0].attachments[0];
  const body = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
  mutation(body);
  attachment.body = Buffer.from(JSON.stringify(body), 'utf8').toString('base64');
};

test('validator rejects missing, duplicate, malformed, wrong-scope and wrong-count attachments', () => {
  for (const [label, mutate] of [
    ['missing', input => { input.executions[0].results[0].attachments = []; }],
    ['duplicate', input => { input.executions[0].results[0].attachments.push(
      structuredClone(input.executions[0].results[0].attachments[0])); }],
    ['malformed', input => { input.executions[0].results[0].attachments[0].body = 'not-base64'; }],
    ['scope', input => mutateAttachmentBody(input, 0,
      body => { body.scope.evidenceScope = 'executed-disposable-postgresql'; })],
    ['count', input => mutateAttachmentBody(input, 0,
      body => { body.actual.targetMutationCount += 1; })],
    ['unknown field', input => mutateAttachmentBody(input, 0,
      body => { body.tenantId = 'invented'; })],
  ]) {
    const input = validInput('ASSESS-001');
    mutate(input);
    assert.throws(() => verifyHostedSandboxAttachments(input), /HOSTED_SANDBOX_/u, label);
  }
});

test('validator rejects stale run, cross-project replay, retries and timestamps outside the attempt', () => {
  const stale = validInput('SANDBOX-001');
  mutateAttachmentBody(stale, 0, body => { body.workflow.runId = '37730000000'; });
  assert.throws(() => verifyHostedSandboxAttachments(stale), /PROFILE_BINDING/u);

  const crossProject = validInput('SANDBOX-001');
  crossProject.executions[1].results[0].attachments[0] = structuredClone(
    crossProject.executions[0].results[0].attachments[0],
  );
  assert.throws(() => verifyHostedSandboxAttachments(crossProject), /EXECUTION_BINDING/u);

  const crossMeasurement = validInput('ASSESS-004');
  mutateAttachmentBody(crossMeasurement, 1, body => {
    body.measurement.supportingActions = ['persona-session:process-analyst'];
    body.actual.supportingActionCount = 1;
  });
  assert.throws(() => verifyHostedSandboxAttachments(crossMeasurement), /CROSS_EXECUTION_MEASUREMENT/u);

  const retry = validInput('SANDBOX-001');
  retry.executions[0].results[0].retry = 1;
  assert.throws(() => verifyHostedSandboxAttachments(retry), /EXECUTION_INVALID/u);

  const late = validInput('SANDBOX-001');
  mutateAttachmentBody(late, 0, body => { body.observedAt = '2026-10-08T12:00:02.000Z'; });
  assert.throws(() => verifyHostedSandboxAttachments(late), /OUTSIDE_ATTEMPT/u);
});

test('validator uses recorded wall-clock completion and rejects stale or substituted windows', () => {
  const input = validInput('SANDBOX-001');
  // Accumulated runner duration can exclude setup before the body starts.
  input.executions[0].results[0].duration = 1;
  assert.doesNotThrow(() => verifyHostedSandboxAttachments(input));
  const mutateWindow = (value, change) => {
    const attachment = value.executions[0].results[0].attachments[1];
    const window = JSON.parse(Buffer.from(attachment.body, 'base64'));
    change(window);
    attachment.body = Buffer.from(JSON.stringify(window)).toString('base64');
  };
  for (const observed of [startTime, '2026-10-08T12:00:01.000Z']) {
    const value = structuredClone(input);
    mutateAttachmentBody(value, 0, body => { body.observedAt = observed; });
    assert.doesNotThrow(() => verifyHostedSandboxAttachments(value));
  }
  for (const observed of ['2026-10-08T11:59:59.999Z', '2026-10-08T12:00:01.001Z']) {
    const value = structuredClone(input);
    mutateAttachmentBody(value, 0, body => { body.observedAt = observed; });
    assert.throws(() => verifyHostedSandboxAttachments(value), /OUTSIDE_ATTEMPT/u);
  }
  for (const change of [w => { w.project = 'wrong'; }, w => { w.title = 'wrong'; },
    w => { w.retry = 1; }, w => { w.startTime = observedAt; },
    w => { w.endedAt = '2026-10-08T11:59:59.999Z'; }]) {
    const value = structuredClone(input);
    mutateWindow(value, change);
    assert.throws(() => verifyHostedSandboxAttachments(value), /ATTEMPT_WINDOW_INVALID|OUTSIDE_ATTEMPT/u);
  }
  for (const duplicate of [false, true]) {
    const value = structuredClone(input);
    const attachments = value.executions[0].results[0].attachments;
    if (duplicate) attachments.push(structuredClone(attachments[1]));
    else attachments.pop();
    assert.throws(() => verifyHostedSandboxAttachments(value), /ATTEMPT_WINDOW_INVALID/u);
  }
});

test('validator rejects missing projects, duplicate projects, local execution and unsupported cases', () => {
  const missing = validInput('PUBLIC-001');
  missing.executions.pop();
  assert.throws(() => verifyHostedSandboxAttachments(missing), /EXECUTION_COUNT/u);

  const duplicate = validInput('PUBLIC-001');
  duplicate.executions[1].project = projects[0];
  assert.throws(() => verifyHostedSandboxAttachments(duplicate), /EXECUTION_PROJECT/u);

  const local = validInput('PUBLIC-001');
  local.executions[0].executionKind = 'local_source_fixture';
  assert.throws(() => verifyHostedSandboxAttachments(local), /EXECUTION_INVALID/u);

  assert.throws(() => verifyHostedSandboxAttachments({
    testCase: catalogById.get('ADMIN-001'),
    binding: bindingById.get('ADMIN-001'),
    executions: [],
  }), /TEST_ID_UNSUPPORTED/u);
});

test('actual Playwright reporter records a wall-clock window across excluded setup time', () => {
  const outputDirectory = path.join(process.cwd(), 'output');
  mkdirSync(outputDirectory, {recursive:true});
  const directory = mkdtempSync(path.join(outputDirectory, 'sandbox-window-'));
  try {
    const fixture = validInput('SANDBOX-001');
    const title = fixture.executions[0].title;
    const bodies = fixture.executions.map(e => JSON.parse(Buffer.from(e.results[0].attachments[0].body, 'base64')));
    const reportPath = path.join(directory, 'results.json');
    const configPath = path.join(directory, 'playwright.config.mjs');
    writeFileSync(path.join(directory, 'window.spec.mjs'), `
      import { test } from '@playwright/test';
      test.beforeAll(async () => { await new Promise(resolve => setTimeout(resolve, 150)); });
      test(${JSON.stringify(title)}, async ({}, testInfo) => {
        const body = ${JSON.stringify(bodies)}.find(item => item.project === testInfo.project.name);
        body.observedAt = new Date().toISOString();
        await testInfo.attach('hosted-sandbox-acceptance-v1', {contentType:'application/json', body:Buffer.from(JSON.stringify(body))});
      });
    `);
    writeFileSync(configPath, `export default {
      testDir: ${JSON.stringify(directory)}, testMatch: 'window.spec.mjs', workers:1, retries:0,
      outputDir: ${JSON.stringify(path.join(directory,'output'))},
      reporter: [[${JSON.stringify(path.resolve('scripts/hostedSandboxAcceptanceEvidence.mjs'))}], ['json', {outputFile:${JSON.stringify(reportPath)}}]],
      projects: ${JSON.stringify(projects.map(name => ({name})))},
    };`);
    const run = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', configPath],
      {cwd:process.cwd(), encoding:'utf8', timeout:60_000, env:{...process.env, FORCE_COLOR:'0'}});
    assert.equal(run.status, 0, (run.stderr ?? '').slice(-2000));
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    const tests = report.suites.flatMap(suite => suite.specs).flatMap(spec => spec.tests);
    assert.equal(tests.length, 2);
    for (const execution of fixture.executions) {
      const result = tests.find(item => item.projectName === execution.project).results[0];
      execution.results = [result];
      const observation = JSON.parse(Buffer.from(result.attachments[0].body, 'base64'));
      assert.ok(Date.parse(observation.observedAt) - Date.parse(result.startTime) > result.duration,
        'fixture must reproduce excluded beforeAll time');
    }
    assert.doesNotThrow(() => verifyHostedSandboxAttachments(fixture));
  } finally {
    rmSync(directory, {recursive:true, force:true});
  }
});
