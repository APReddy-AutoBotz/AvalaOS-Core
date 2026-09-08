import assert from 'node:assert/strict';
import { createFullPageContrastAttachment } from './acceptanceExecutionProfile.mjs';
import {
  evaluateHostedTest,
  evaluateCompositeTest,
  evaluateRetainedTest,
  flattenPlaywright,
  validateHostedPlaywrightReport,
  validateOracleManifest,
  validateRetainedManifest,
  validateRetainedProducerResults,
  validateServerManifest,
} from './exhaustiveAcceptanceEvidence.mjs';
import {
  EXHAUSTIVE_ACCEPTANCE_WORKFLOW,
  PREVIEW_EXHAUSTIVE_BROWSER_WORKFLOW,
  resolveHostedAcceptanceWorkflowPath,
} from './hostedAcceptanceReportProvenance.mjs';

const workflowEnvironment = workflowPath => ({
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'owner/repository',
  GITHUB_WORKFLOW_REF: `owner/repository/${workflowPath}@refs/heads/main`,
});
const hostedWorkflowAllowlist = [EXHAUSTIVE_ACCEPTANCE_WORKFLOW, PREVIEW_EXHAUSTIVE_BROWSER_WORKFLOW];
for (const workflowPath of hostedWorkflowAllowlist) {
  assert.equal(resolveHostedAcceptanceWorkflowPath({
    environment: workflowEnvironment(workflowPath),
    allowedWorkflowPaths: hostedWorkflowAllowlist,
  }), workflowPath);
}
assert.throws(() => resolveHostedAcceptanceWorkflowPath({
  environment: workflowEnvironment('.github/workflows/substituted.yml'),
  allowedWorkflowPaths: hostedWorkflowAllowlist,
}), /HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED/u);

const scope = { evidenceScope: 'executed-fixture', fixtureId: 'fixture-1', organizationId: '10000000-0000-4000-8000-000000000001', workspaceId: '20000000-0000-4000-8000-000000000001' };
const provenance = {
  branchId: 'BRANCH-1', testId: 'TEST-001', sourceReferences: ['tests/example.test.ts#assertion-1'], scope,
  ownership: [
    { kind: 'retained-assertion', ownerId: 'suite-a', assertionId: 'assertion-1', scenarioId: 'scenario-1' },
    { kind: 'server-assertion', ownerId: 'suite-a', assertionIds: ['assertion-1'], scenarioIds: ['scenario-1'] },
  ],
};
const expected = {
  releaseSha: 'a'.repeat(40), workflowRunId: '123', workflowAttempt: '1', environment: 'stable-release', workflowPath: '.github/workflows/exhaustive-acceptance.yml',
  branchIdsByTestId: new Map([['TEST-001', ['BRANCH-1']]]),
  provenanceByTestId: new Map([['TEST-001', provenance]]),
  canonicalCommandBySuiteId: new Map([['suite-a', 'node suite-a'], ['suite-b', 'node suite-b']]),
};
const retainedBindings = new Map([
  ['TEST-001', ['suite-a']],
  ['TEST-002', ['suite-a']],
  ['TEST-B', ['suite-b']],
]);
const retained = {
  schemaVersion: 3,
  manifestKind: 'retained',
  releaseSha: expected.releaseSha,
  workflowRunId: expected.workflowRunId,
  workflowAttempt: expected.workflowAttempt,
  environment: expected.environment,
  workflowPath: expected.workflowPath,
  suites: [
    { suiteId: 'suite-a', status: 'PASS', command: 'node suite-a' },
    { suiteId: 'suite-b', status: 'PASS', command: 'node suite-b' },
  ],
  results: [{
    suiteId: 'suite-a',
    testId: 'TEST-001',
    status: 'PASS',
    releaseSha: expected.releaseSha,
    workflowRunId: expected.workflowRunId,
    workflowAttempt: expected.workflowAttempt,
    environment: expected.environment,
    workflowPath: expected.workflowPath,
    jobId: 'suite-a',
    command: 'node suite-a',
    assertionIds: ['assertion-1'],
    scenarioIds: ['scenario-1'],
    branchIds: ['BRANCH-1'],
    sourceReferences: ['tests/example.test.ts#assertion-1'],
    scope,
    assertionOutcomes: [{ assertionId: 'assertion-1', status: 'PASS' }],
  }],
};
assert.deepEqual(validateRetainedManifest(retained, expected, retainedBindings), []);
assert.ok(validateRetainedManifest({ ...retained, releaseSha: 'b'.repeat(40) }, expected, retainedBindings).includes('release-sha'));
assert.ok(validateRetainedManifest({ ...retained, suites: [...retained.suites, retained.suites[0]] }, expected, retainedBindings).some(item => item.startsWith('duplicate-or-missing-suite:')));
assert.ok(validateRetainedManifest({ ...retained, results: [...retained.results, retained.results[0]] }, expected, retainedBindings).some(item => item.startsWith('duplicate-or-missing-result:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], releaseSha: 'b'.repeat(40) }] }, expected, retainedBindings).some(item => item.startsWith('result-release-sha:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], workflowRunId: 'stale' }] }, expected, retainedBindings).some(item => item.startsWith('result-workflow-run:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], workflowAttempt: '2' }] }, expected, retainedBindings).some(item => item.startsWith('result-workflow-attempt:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], environment: 'preview' }] }, expected, retainedBindings).some(item => item.startsWith('result-environment:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], sourceReferences: ['https://unsafe.invalid/raw'] }] }, expected, retainedBindings).some(item => item.startsWith('result-unsafe-source:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], assertionIds: [] }] }, expected, retainedBindings).some(item => item.startsWith('result-assertionIds:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], branchIds: ['WRONG'] }] }, expected, retainedBindings).some(item => item.startsWith('result-branch-mismatch:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], command: 'node wrong' }] }, expected, retainedBindings).some(item => item.startsWith('result-command:')));
assert.ok(validateRetainedManifest({ ...retained, suites: [{ ...retained.suites[0], command: 'node substituted' }, retained.suites[1]] }, expected, retainedBindings).some(item => item.startsWith('suite-command:')), 'manifest cannot redefine the canonical command');
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], scope: { ...scope, workspaceId: '20000000-0000-4000-8000-000000000099' } }] }, expected, retainedBindings).some(item => item.startsWith('result-scope-binding:')), 'wrong tenant/workspace scope must fail closed');
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], scope: { evidenceScope:'planned-fixture',fixtureId:'fixture-1',organizationId:null,workspaceId:null } }] }, expected, retainedBindings).some(item => item.startsWith('result-scope-')), 'planned scope can never support an exact PASS');
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], assertionOutcomes: [{ assertionId: 'assertion-1', status: 'BLOCKED' }] }] }, expected, retainedBindings).some(item => item.startsWith('result-status-not-derived:')), 'green result cannot hide a skipped assertion');
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], testId: 'UNBOUND-001' }] }, expected, retainedBindings).some(item => item.startsWith('result-binding-mismatch:')));
assert.ok(validateRetainedManifest({ ...retained, results: [{ ...retained.results[0], suiteId: 'missing-suite' }] }, expected, retainedBindings).some(item => item.startsWith('result-suite-missing:')));
const serverExpected = { ...expected, environment: 'disposable-ci' };
const serverManifest = {
  ...retained,
  manifestKind: 'server',
  environment: 'disposable-ci',
  suites: [{ suiteId: 'suite-a', status: 'PASS', command: 'node suite-a' }],
  results: [{ ...retained.results[0], environment: 'disposable-ci' }],
};
assert.deepEqual(validateServerManifest(serverManifest, serverExpected, retainedBindings), []);
assert.ok(validateServerManifest({ ...serverManifest, manifestKind: 'retained' }, serverExpected, retainedBindings).includes('server-manifest-kind'));
assert.ok(validateServerManifest({ ...serverManifest, workflowRunId: 'other-run' }, serverExpected, retainedBindings).includes('workflow-run'));
assert.ok(validateServerManifest({ ...serverManifest, workflowAttempt: '2' }, serverExpected, retainedBindings).includes('workflow-attempt'));
assert.ok(validateServerManifest({ ...serverManifest, results: [...serverManifest.results, serverManifest.results[0]] }, serverExpected, retainedBindings).some(item => item.startsWith('duplicate-or-missing-result:')));
assert.ok(validateServerManifest({ ...serverManifest, results: [{ ...serverManifest.results[0], scenarioIds: ['manifest-self-declared-fake-scenario'] }] }, serverExpected, retainedBindings).some(item => item.startsWith('result-ownership:')), 'server scenario identity must come from canonical ownership, never from the manifest itself');
assert.ok(validateServerManifest({ ...serverManifest, results: [{ ...serverManifest.results[0], workflowPath: '.github/workflows/substituted.yml' }] }, serverExpected, retainedBindings).some(item => item.startsWith('result-workflow-path:')), 'wrong server workflow must fail closed');
assert.ok(validateServerManifest({ ...serverManifest, results: [{ ...serverManifest.results[0], branchIds: ['FAKE-FAMILY-LIKE-PROOF'] }] }, serverExpected, retainedBindings).some(item => item.startsWith('result-branch-mismatch:')), 'family-like server proof cannot substitute for the exact branch');

const suiteIndex = new Map(retained.suites.map(item => [item.suiteId, item]));
const resultIndex = new Map(retained.results.map(item => [`${item.suiteId}:${item.testId}`, item]));
assert.equal(evaluateRetainedTest({ testId: 'TEST-001', requiredSuiteIds: ['suite-a'], suiteIndex, resultIndex, manifestErrors: [] }).status, 'PASS');
assert.equal(evaluateRetainedTest({ testId: 'TEST-002', requiredSuiteIds: ['suite-a'], suiteIndex, resultIndex, manifestErrors: [] }).status, 'BLOCKED', 'aggregate suite PASS cannot promote an unproven configured Test ID');
assert.equal(evaluateRetainedTest({ testId: 'TEST-001', requiredSuiteIds: ['missing'], suiteIndex, resultIndex, manifestErrors: [] }).status, 'BLOCKED');
assert.equal(evaluateRetainedTest({ testId: 'TEST-001', requiredSuiteIds: ['suite-a'], suiteIndex: new Map([['suite-a', { suiteId: 'suite-a', status: 'FAIL' }]]), resultIndex, manifestErrors: [] }).status, 'FAIL');
assert.equal(evaluateRetainedTest({ testId: 'TEST-001', requiredSuiteIds: ['suite-a'], suiteIndex, resultIndex: new Map([['suite-a:TEST-001', { ...retained.results[0], status: 'FAIL' }]]), manifestErrors: [] }).status, 'FAIL');
assert.equal(evaluateRetainedTest({ testId: 'TEST-001', requiredSuiteIds: ['suite-a'], suiteIndex, resultIndex: new Map([['suite-a:TEST-001', { ...retained.results[0], status: 'BLOCKED' }]]), manifestErrors: [] }).status, 'BLOCKED');

const suiteA = { suiteId: 'suite-a', testIds: ['TEST-001', 'TEST-002'] };
const emitted = { schemaVersion: 2, results: [retained.results[0]] };
assert.deepEqual(validateRetainedProducerResults({ suite: suiteA, emitted, identity: expected, provenanceByTestId: expected.provenanceByTestId }), []);
assert.ok(validateRetainedProducerResults({ suite: suiteA, emitted: { schemaVersion: 2, results: [{ ...retained.results[0], suiteId: 'suite-b', testId: 'TEST-B' }] }, identity: expected, provenanceByTestId: expected.provenanceByTestId }).some(item => item.startsWith('producer-suite-mismatch:')), 'suite-a process cannot impersonate suite-b evidence');
assert.ok(validateRetainedProducerResults({ suite: suiteA, emitted: { schemaVersion: 2, results: [{ ...retained.results[0], testId: 'TEST-B' }] }, identity: expected, provenanceByTestId: expected.provenanceByTestId }).some(item => item.startsWith('producer-test-id-mismatch:')), 'producer cannot emit a Test ID outside its own configured suite');

const oracleScope = { evidenceScope: 'planned-fixture', fixtureId: 'synthetic-default', organizationId: null, workspaceId: null };
const oracleProvenance = {
  branchId: 'ASSESS-V1_VALIDATION_MISSING',
  testId: 'ASSESS-005',
  sourceReferences: ['services/scoringEngine.ts'],
  scope: oracleScope,
  ownership: [{
    kind: 'oracle-scenario', ownerId: 'missing-input',
    assertionIds: ['assess-v1-oracle::ASSESS-005::missing-input'], scenarioIds: ['missing-input'],
  }],
};
const oracleExpected = {
  ...expected,
  oracleEnvironment: 'stable-release',
  oracleWorkflowPath: expected.workflowPath,
  oracleCommand: 'node scripts/runAssessV1AcceptanceOracle.mjs',
  oracleBindingByTestId: new Map([['ASSESS-005', { testId: 'ASSESS-005', scenario: 'missing-input' }]]),
  provenanceByTestId: new Map([['ASSESS-005', oracleProvenance]]),
};
const oracleResult = {
  testId: 'ASSESS-005', scenario: 'missing-input', status: 'BLOCKED',
  releaseSha: expected.releaseSha, workflowRunId: expected.workflowRunId, workflowAttempt: expected.workflowAttempt,
  environment: oracleExpected.oracleEnvironment, workflowPath: oracleExpected.oracleWorkflowPath, command: oracleExpected.oracleCommand,
  assertionIds: ['assess-v1-oracle::ASSESS-005::missing-input'],
  assertionOutcomes: [{ assertionId: 'assess-v1-oracle::ASSESS-005::missing-input', status: 'PASS' }],
  scenarioIds: ['missing-input'], branchIds: ['ASSESS-V1_VALIDATION_MISSING'], sourceReferences: ['services/scoringEngine.ts'], scope: oracleScope,
};
const oracle = {
  schemaVersion: 2,
  releaseSha: expected.releaseSha,
  workflowRunId: expected.workflowRunId,
  workflowAttempt: expected.workflowAttempt,
  environment: oracleExpected.oracleEnvironment,
  workflowPath: oracleExpected.oracleWorkflowPath,
  command: oracleExpected.oracleCommand,
  results: [oracleResult],
};
assert.deepEqual(validateOracleManifest(oracle, oracleExpected), []);
assert.ok(validateOracleManifest({ ...oracle, command: 'node substituted.mjs', results: [{ ...oracleResult, command: 'node substituted.mjs' }] }, oracleExpected).some(item => item.startsWith('oracle-command')), 'substituted oracle command must fail closed');
assert.ok(validateOracleManifest({ ...oracle, workflowAttempt: '2', results: [{ ...oracleResult, workflowAttempt: '2' }] }, oracleExpected).some(item => item.startsWith('oracle-workflow-attempt')), 'stale oracle run attempt must fail closed');
assert.ok(validateOracleManifest({ ...oracle, environment: 'preview', results: [{ ...oracleResult, environment: 'preview' }] }, oracleExpected).some(item => item.startsWith('oracle-environment')), 'wrong oracle environment must fail closed');
assert.ok(validateOracleManifest({ ...oracle, workflowPath: '.github/workflows/substitute.yml', results: [{ ...oracleResult, workflowPath: '.github/workflows/substitute.yml' }] }, oracleExpected).some(item => item.startsWith('oracle-workflow-path')), 'wrong oracle workflow must fail closed');
assert.ok(validateOracleManifest({ ...oracle, results: [{ ...oracleResult, scenario: 'invalid-input', scenarioIds: ['invalid-input'] }] }, oracleExpected).some(item => item.startsWith('oracle-scenario:')), 'wrong oracle scenario must fail closed');
assert.ok(validateOracleManifest({ ...oracle, results: [{ ...oracleResult, branchIds: ['ASSESS-FAKE-FAMILY-LIKE-PROOF'] }] }, oracleExpected).some(item => item.startsWith('oracle-branches:')), 'family-like proof cannot substitute for the exact branch');
assert.ok(validateOracleManifest({ ...oracle, results: [{ ...oracleResult, sourceReferences: ['services/fakeScoringEngine.ts'] }] }, oracleExpected).some(item => item.startsWith('oracle-sources:')), 'fake source proof must fail closed');
assert.ok(validateOracleManifest({ ...oracle, results: [{ ...oracleResult, assertionIds: ['aggregate-suite-green'], assertionOutcomes: [{ assertionId: 'aggregate-suite-green', status: 'PASS' }] }] }, oracleExpected).some(item => item.startsWith('oracle-ownership:')), 'aggregate or substituted assertion cannot promote the exact Test ID');
assert.ok(validateOracleManifest({ ...oracle, results: [{ ...oracleResult, status: 'PASS' }] }, oracleExpected).some(item => item.startsWith('oracle-status-not-derived:')), 'planned fixture scope cannot be promoted to PASS');
assert.ok(validateOracleManifest({ ...oracle, results: [{ ...oracleResult, status: 'PASS', assertionOutcomes: [{ ...oracleResult.assertionOutcomes[0], status: 'BLOCKED' }] }] }, oracleExpected).some(item => item.startsWith('oracle-status-not-derived:')), 'green status cannot hide a skipped assertion');
assert.ok(validateOracleManifest({ ...oracle, results: [...oracle.results, oracle.results[0]] }, oracleExpected).some(item => item.startsWith('duplicate-or-missing-oracle:')));
assert.ok(validateOracleManifest({ ...oracle, results: [] }, oracleExpected).some(item => item.startsWith('oracle-result-missing:')), 'missing exact oracle result must fail closed');

const hostedMetadata = {
  schemaVersion: 'acceptance-report-profile-v1',
  ci: {},
  evidenceKind: 'hosted-preview-acceptance',
  executionKind: 'hosted_preview',
  exactCommand: ['npx', 'playwright', 'test', '--config=playwright.exhaustive-acceptance.config.ts', '--workers=1'],
  configPath: 'playwright.exhaustive-acceptance.config.ts',
  sourcePaths: ['tests/browser/exhaustiveHostedAcceptance.spec.ts'],
  exactHead: 'a'.repeat(40),
  targetOrigin: 'https://avalaos-pilot.netlify.app',
  deployId: 'b'.repeat(24),
  workflowRuntime: {
    authority: 'github-actions',
    workflowPath: '.github/workflows/exhaustive-acceptance.yml',
    workflowRef: 'owner/repository/.github/workflows/exhaustive-acceptance.yml@refs/heads/main',
    repository: 'owner/repository',
    eventName: 'workflow_dispatch',
    runId: '123456',
    runAttempt: '2',
    workflowSha: 'c'.repeat(40),
    releaseSha: 'a'.repeat(40),
  },
};
const hostedTest = (projectName = 'desktop-chromium') => ({
  projectName,
  status: 'expected',
  expectedStatus: 'passed',
  annotations: [],
  results: [{ status: 'passed', retry: 0, attachments: [] }],
});
const fullHostedReport = {
  config: { metadata: { ...hostedMetadata, actualWorkers: 1 }, workers: 1 },
  errors: [],
  suites: [{
    title: 'tests/browser/exhaustiveHostedAcceptance.spec.ts',
    specs: [{ title: '[SANDBOX-001] Sandbox: access', tests: [hostedTest()] }],
    suites: [],
  }],
  stats: { expected: 1, unexpected: 0, skipped: 0 },
};
const [passedExecution] = flattenPlaywright(fullHostedReport);
const validHostedValidation = validateHostedPlaywrightReport({ report: fullHostedReport, expectedMetadata: hostedMetadata });
assert.deepEqual(validHostedValidation.errors, []);
assert.equal(evaluateHostedTest({
  title: passedExecution.title,
  requiredProjects: ['desktop-chromium'],
  reportValidation: validHostedValidation,
}).status, 'PASS');
assert.equal(evaluateHostedTest({
  title: passedExecution.title,
  requiredProjects: ['desktop-chromium'],
}).status, 'BLOCKED', 'a raw hosted-labelled execution without a validator-owned binding must remain blocked');

const duplicateReport = {
  ...fullHostedReport,
  suites: [{ specs: [{ title: passedExecution.title, tests: [hostedTest(), hostedTest()] }] }],
};
const duplicateValidation = validateHostedPlaywrightReport({ report: duplicateReport, expectedMetadata: hostedMetadata });
assert.ok(duplicateValidation.errors.some(value => value.startsWith('hosted-report-duplicate:')));
assert.equal(evaluateHostedTest({
  title: passedExecution.title,
  requiredProjects: ['desktop-chromium'],
  reportValidation: duplicateValidation,
}).status, 'BLOCKED');

const failedReport = {
  ...fullHostedReport,
  suites: [{ specs: [{
    title: passedExecution.title,
    tests: [{ ...hostedTest(), status: 'unexpected', results: [{ status: 'failed', retry: 0, error: { message: 'deterministic failure' }, attachments: [] }] }],
  }] }],
};
const failedValidation = validateHostedPlaywrightReport({ report: failedReport, expectedMetadata: hostedMetadata });
assert.deepEqual(failedValidation.errors, []);
assert.equal(evaluateHostedTest({
  title: passedExecution.title,
  requiredProjects: ['desktop-chromium'],
  reportValidation: failedValidation,
}).status, 'FAIL');
failedReport.suites[0].specs[0].tests[0].status = 'expected';
failedReport.suites[0].specs[0].tests[0].results[0].status = 'passed';
delete failedReport.suites[0].specs[0].tests[0].results[0].error;
assert.equal(evaluateHostedTest({
  title: passedExecution.title,
  requiredProjects: ['desktop-chromium'],
  reportValidation: failedValidation,
}).status, 'FAIL', 'mutating the caller report after validation cannot promote the detached validated result');

const mutateMetadata = change => ({
  ...fullHostedReport,
  config: { ...fullHostedReport.config, metadata: { ...fullHostedReport.config.metadata, ...change } },
});
for (const [label, report] of [
  ['wrong kind', mutateMetadata({ executionKind: 'local_source_fixture' })],
  ['wrong head', mutateMetadata({ exactHead: 'd'.repeat(40) })],
  ['wrong deploy', mutateMetadata({ deployId: 'e'.repeat(24) })],
  ['wrong command', mutateMetadata({ exactCommand: ['npx', 'playwright', 'test', '--config=substituted.ts', '--workers=1'] })],
  ['wrong run', mutateMetadata({ workflowRuntime: { ...hostedMetadata.workflowRuntime, runId: '654321' } })],
  ['wrong attempt', mutateMetadata({ workflowRuntime: { ...hostedMetadata.workflowRuntime, runAttempt: '1' } })],
  ['duplicate metadata shape', mutateMetadata({ substitutedAuthority: true })],
  ['nonempty CI metadata', mutateMetadata({ ci: { branch: 'refs/heads/private' } })],
  ['git commit enrichment', mutateMetadata({ gitCommit: { id: 'd'.repeat(40) } })],
  ['git diff enrichment', mutateMetadata({ gitDiff: 'private patch content' })],
]) {
  assert.ok(validateHostedPlaywrightReport({ report, expectedMetadata: hostedMetadata }).errors.length > 0, `${label} must fail closed`);
}
assert.ok(validateHostedPlaywrightReport({ report: null, expectedMetadata: hostedMetadata }).errors.includes('hosted-report-missing-or-invalid'));
assert.ok(validateHostedPlaywrightReport({
  report: { ...fullHostedReport, config: {} },
  expectedMetadata: hostedMetadata,
}).errors.includes('hosted-report-metadata-missing'));
assert.ok(validateHostedPlaywrightReport({
  report: { ...fullHostedReport, errors: [{ message: 'suite-level failure' }] },
  expectedMetadata: hostedMetadata,
}).errors.includes('hosted-report-errors'));
const skippedUnderGreen = {
  ...fullHostedReport,
  suites: [{ specs: [{
    title: passedExecution.title,
    tests: [{ ...hostedTest(), status: 'skipped', results: [{ status: 'skipped', retry: 0, attachments: [] }] }],
  }] }],
  stats: { expected: 1, unexpected: 0, skipped: 0 },
};
assert.ok(validateHostedPlaywrightReport({ report: skippedUnderGreen, expectedMetadata: hostedMetadata })
  .errors.some(value => value.startsWith('hosted-report-skipped:')), 'an unknown skipped assertion cannot hide under a green suite summary');
const canonicalSkip = {
  ...skippedUnderGreen,
  suites: [{ specs: [{
    title: passedExecution.title,
    tests: [{
      ...hostedTest(),
      status: 'skipped',
      expectedStatus: 'skipped',
      annotations: [{ type: 'skip', description: 'Independently catalog-bound hosted scenario is not executable.' }],
      results: [{ status: 'skipped', retry: 0, attachments: [] }],
    }],
  }] }],
};
const canonicalSkipKey = `${passedExecution.title}\0desktop-chromium`;
assert.deepEqual(validateHostedPlaywrightReport({
  report: canonicalSkip,
  expectedMetadata: hostedMetadata,
  allowedSkippedExecutions: new Map([[canonicalSkipKey, 'Independently catalog-bound hosted scenario is not executable.']]),
}).errors, [], 'an exact independently bound catalog-unbound skip remains valid report inventory');
assert.ok(validateHostedPlaywrightReport({
  report: canonicalSkip,
  expectedMetadata: hostedMetadata,
  allowedSkippedExecutions: new Map([[canonicalSkipKey, 'Substituted reason']]),
}).errors.some(value => value.startsWith('hosted-report-skipped:')), 'the skip reason must match the independently bound catalog reason');
const retryUnderGreen = {
  ...fullHostedReport,
  suites: [{ specs: [{
    title: passedExecution.title,
    tests: [{ ...hostedTest(), results: [{ status: 'failed', retry: 0 }, { status: 'passed', retry: 1 }] }],
  }] }],
};
assert.ok(validateHostedPlaywrightReport({ report: retryUnderGreen, expectedMetadata: hostedMetadata })
  .errors.some(value => value.startsWith('hosted-report-attempt-count:')), 'a passing retry cannot replace an exact first-attempt result');
const unexpectedExpectedStatus = {
  ...fullHostedReport,
  suites: [{ specs: [{
    title: passedExecution.title,
    tests: [{ ...hostedTest(), expectedStatus: 'failed' }],
  }] }],
};
assert.ok(validateHostedPlaywrightReport({ report: unexpectedExpectedStatus, expectedMetadata: hostedMetadata })
  .errors.some(value => value.startsWith('hosted-report-expected-status:')), 'non-default expected status cannot manufacture a hosted pass');
const aggregateGreenStatusMismatch = {
  ...fullHostedReport,
  suites: [{ specs: [{
    title: passedExecution.title,
    tests: [{ ...hostedTest(), status: 'unexpected' }],
  }] }],
};
assert.ok(validateHostedPlaywrightReport({ report: aggregateGreenStatusMismatch, expectedMetadata: hostedMetadata })
  .errors.some(value => value.startsWith('hosted-report-status:')), 'a passed attempt must retain Playwright expected status');
const passedWithError = {
  ...fullHostedReport,
  suites: [{ specs: [{
    title: passedExecution.title,
    tests: [{ ...hostedTest(), results: [{ status: 'passed', retry: 0, error: { message: 'hidden failure' }, attachments: [] }] }],
  }] }],
};
assert.ok(validateHostedPlaywrightReport({ report: passedWithError, expectedMetadata: hostedMetadata })
  .errors.some(value => value.startsWith('hosted-report-passed-errors:')), 'a passed attempt carrying an error cannot earn hosted credit');

assert.equal(evaluateCompositeTest([{ name: 'hosted', status: 'PASS' }, { name: 'server', status: 'PASS' }]).status, 'PASS');
assert.equal(evaluateCompositeTest([{ name: 'hosted', status: 'PASS' }, { name: 'server', status: 'BLOCKED' }]).status, 'BLOCKED');
assert.equal(evaluateCompositeTest([{ name: 'hosted', status: 'PASS' }, { name: 'server', status: 'FAIL' }]).status, 'FAIL');

const contrastPersonas = ['Process Analyst', 'AP Process Owner', 'Delivery Lead', 'Control Reviewer', 'Automation Contributor', 'Buyer Viewer', 'Platform Admin'];
const contrastTitle = '[SAFETY-007] Cross-cutting: serious critical a11y';
const contrastStart = '2026-09-08T12:00:00.000Z';
const contrastObserved = '2026-09-08T12:00:01.000Z';
const contrastNode = () => ({ any: [{ id: 'color-contrast' }], all: [], none: [] });
const contrastResults = unresolved => ({
  passes: unresolved ? [] : [{ id: 'color-contrast', nodes: [contrastNode()] }],
  violations: [],
  incomplete: unresolved ? [{ id: 'color-contrast', nodes: [contrastNode(), contrastNode()] }] : [],
});
const makeContrastReport = (metadata = hostedMetadata) => ({
  config: { metadata: { ...metadata, actualWorkers: 1 }, workers: 1 },
  errors: [],
  suites: [{ specs: [{ title: contrastTitle, tests: [{
    ...hostedTest('pixel-7-chromium'),
    results: [{ status: 'passed', retry: 0, startTime: contrastStart, duration: 10_000, attachments: contrastPersonas.map(persona => {
      const value = createFullPageContrastAttachment({
        results: contrastResults(persona === 'Platform Admin'), metadata, persona, profile: 'representative-surface',
        project: 'pixel-7-chromium', test: contrastTitle, observedAt: contrastObserved,
      });
      return { name: value.name, contentType: value.contentType, body: Buffer.from(value.body).toString('base64') };
    }) }],
  }] }] }],
});
const contrastReport = makeContrastReport();
const validContrast = validateHostedPlaywrightReport({ report: contrastReport, expectedMetadata: hostedMetadata });
assert.deepEqual(validContrast.errors, []);
const unresolvedHosted = evaluateHostedTest({ title: contrastTitle, requiredProjects: ['pixel-7-chromium'], reportValidation: validContrast });
assert.equal(unresolvedHosted.status, 'PASS', 'nonempty all-unresolved contrast is not a determinate serious/critical violation');
assert.match(unresolvedHosted.reason, /1 persona contrast summaries remain unresolved_manual/u, 'the retained hosted result must disclose unresolved contrast instead of silently claiming full contrast PASS');
assert.match(unresolvedHosted.reason, /not complete contrast or WCAG proof/u);
const contrastAttempt = report => report.suites[0].specs[0].tests[0].results[0];
const mutateContrastBody = (report, mutate) => {
  const attachment = contrastAttempt(report).attachments.at(-1);
  const value = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
  mutate(value);
  attachment.body = Buffer.from(JSON.stringify(value)).toString('base64');
};
for (const [name, mutate] of [
  ['missing', report => contrastAttempt(report).attachments.pop()],
  ['duplicate', report => contrastAttempt(report).attachments.push(structuredClone(contrastAttempt(report).attachments[0]))],
  ['unretained', report => { const attachment = contrastAttempt(report).attachments.at(-1); delete attachment.body; attachment.path = 'not-retained.json'; }],
  ['malformed', report => { contrastAttempt(report).attachments.at(-1).body = 'not canonical base64'; }],
  ['late', report => mutateContrastBody(report, value => { value.observedAt = '2026-09-08T12:00:11.000Z'; })],
  ['foreign persona', report => mutateContrastBody(report, value => { value.persona = 'Other Persona'; })],
  ['foreign project', report => mutateContrastBody(report, value => { value.project = 'desktop-chromium'; })],
  ['forged resolved', report => mutateContrastBody(report, value => { value.classification = 'resolved'; })],
  ['raw diagnostic', report => mutateContrastBody(report, value => { value.html = '<p>unretained content</p>'; })],
]) {
  const altered = structuredClone(contrastReport);
  mutate(altered);
  const validation = validateHostedPlaywrightReport({ report: altered, expectedMetadata: hostedMetadata });
  assert.ok(validation.errors.some(value => value.startsWith('hosted-report-contrast-summary:')), `${name} summary must invalidate a green hosted suite`);
  assert.equal(evaluateHostedTest({ title: contrastTitle, requiredProjects: ['pixel-7-chromium'], reportValidation: validation }).status, 'BLOCKED');
}
const freshAttemptMetadata = structuredClone(hostedMetadata);
freshAttemptMetadata.workflowRuntime.runAttempt = '3';
const replayedContrast = structuredClone(contrastReport);
replayedContrast.config.metadata = { ...freshAttemptMetadata, actualWorkers: 1 };
assert.ok(validateHostedPlaywrightReport({ report: replayedContrast, expectedMetadata: freshAttemptMetadata }).errors
  .some(value => value.startsWith('hosted-report-contrast-summary:')), 'old contrast summaries cannot enter a fresh otherwise-valid workflow attempt');

console.log('Exhaustive acceptance evidence adversarial tests passed.');
