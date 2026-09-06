import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAcceptanceReportMetadata,
  createSyntheticRegressionOutputRoot,
  decodeAcceptanceExecutionProfile,
  verifySyntheticRegressionResultInventory,
} from './acceptanceExecutionProfile.mjs';

const head = 'a'.repeat(40);
const invocationId = '1'.repeat(32);
const localEnvironment = {
  ACCEPTANCE_EXECUTION_KIND: 'local_source_fixture',
  ACCEPTANCE_RELEASE_SHA: head,
  ACCEPTANCE_CHECKOUT_SHA: head,
  ACCEPTANCE_INVOCATION_ID: invocationId,
  LOCAL_ACCEPTANCE_BASE_URL: 'http://127.0.0.1:4201',
};

test('local source fixture binds the real checkout SHA and loopback target without a deploy identity', () => {
  assert.deepEqual(decodeAcceptanceExecutionProfile(localEnvironment, { expectedCheckoutSha: head }), {
    schemaVersion: 'acceptance-execution-profile-v1',
    evidenceKind: 'exact-head-synthetic-regression',
    executionKind: 'local_source_fixture',
    releaseSha: head,
    checkoutSha: head,
    sourceIdentity: 'governed_working_tree_candidate',
    invocationId,
    targetOrigin: 'http://127.0.0.1:4201',
    deployId: null,
  });
});

test('decoder rejects missing or unknown execution kinds', () => {
  assert.throws(() => decodeAcceptanceExecutionProfile({ ...localEnvironment, ACCEPTANCE_EXECUTION_KIND: undefined }), /KIND_REQUIRED/u);
  assert.throws(() => decodeAcceptanceExecutionProfile({ ...localEnvironment, ACCEPTANCE_EXECUTION_KIND: 'fixture' }), /KIND_INVALID/u);
});

test('declaration-only profile has no runtime target and rejects every runtime binding', () => {
  const declaration = {
    ACCEPTANCE_EXECUTION_KIND: 'declaration_only',
    ACCEPTANCE_RELEASE_SHA: head,
  };
  assert.deepEqual(decodeAcceptanceExecutionProfile(declaration), {
    schemaVersion: 'acceptance-execution-profile-v1',
    evidenceKind: 'acceptance-catalog-declaration',
    executionKind: 'declaration_only',
    releaseSha: head,
    checkoutSha: null,
    sourceIdentity: 'catalog_declaration',
    invocationId: null,
    targetOrigin: null,
    deployId: null,
  });
  for (const substitution of [
    { HOSTED_PILOT_URL: 'https://avalaos-pilot.netlify.app' },
    { NETLIFY_DEPLOY_ID: 'b'.repeat(24) },
    { LOCAL_ACCEPTANCE_BASE_URL: 'http://127.0.0.1:4201' },
    { ACCEPTANCE_CHECKOUT_SHA: head },
    { ACCEPTANCE_INVOCATION_ID: invocationId },
  ]) {
    assert.throws(() => decodeAcceptanceExecutionProfile({ ...declaration, ...substitution }), /DECLARATION_RUNTIME_BINDING_REJECTED/u);
  }
});

test('local source fixture rejects public origins, hosted bindings, and substituted checkout identity', () => {
  assert.throws(() => decodeAcceptanceExecutionProfile({ ...localEnvironment, LOCAL_ACCEPTANCE_BASE_URL: 'https://example.test' }, { expectedCheckoutSha: head }), /LOOPBACK_REQUIRED/u);
  assert.throws(() => decodeAcceptanceExecutionProfile({ ...localEnvironment, LOCAL_ACCEPTANCE_BASE_URL: 'http://localhost:4201' }, { expectedCheckoutSha: head }), /LOOPBACK_REQUIRED/u);
  assert.throws(() => decodeAcceptanceExecutionProfile({ ...localEnvironment, NETLIFY_DEPLOY_ID: 'b'.repeat(24) }, { expectedCheckoutSha: head }), /DEPLOY_ID_REJECTED/u);
  assert.throws(() => decodeAcceptanceExecutionProfile({ ...localEnvironment, HOSTED_PILOT_URL: 'https://deploy-preview-264--avalaos-pilot.netlify.app' }, { expectedCheckoutSha: head }), /HOSTED_URL_REJECTED/u);
  assert.throws(() => decodeAcceptanceExecutionProfile(localEnvironment, { expectedCheckoutSha: 'b'.repeat(40) }), /REAL_CHECKOUT_SHA_MISMATCH/u);
  assert.throws(() => decodeAcceptanceExecutionProfile({ ...localEnvironment, ACCEPTANCE_RELEASE_SHA: 'b'.repeat(40) }, { expectedCheckoutSha: head }), /RELEASE_SHA_MISMATCH/u);
  assert.throws(() => decodeAcceptanceExecutionProfile({ ...localEnvironment, ACCEPTANCE_INVOCATION_ID: undefined }, { expectedCheckoutSha: head }), /INVOCATION_ID_REQUIRED/u);
  assert.throws(() => decodeAcceptanceExecutionProfile({ ...localEnvironment, ACCEPTANCE_INVOCATION_ID: '../old-report' }, { expectedCheckoutSha: head }), /INVOCATION_ID_INVALID/u);
});

test('hosted preview requires non-loopback HTTPS and an exact deploy ID', () => {
  const hosted = {
    ACCEPTANCE_EXECUTION_KIND: 'hosted_preview',
    ACCEPTANCE_RELEASE_SHA: head,
    HOSTED_PILOT_URL: 'https://deploy-preview-264--avalaos-pilot.netlify.app',
    NETLIFY_DEPLOY_ID: 'b'.repeat(24),
  };
  assert.equal(decodeAcceptanceExecutionProfile(hosted).executionKind, 'hosted_preview');
  assert.throws(() => decodeAcceptanceExecutionProfile({ ...hosted, HOSTED_PILOT_URL: 'http://127.0.0.1:4201' }), /NON_LOOPBACK_HTTPS_REQUIRED/u);
  assert.throws(() => decodeAcceptanceExecutionProfile({ ...hosted, HOSTED_PILOT_URL: 'https://localhost:4201' }), /NON_LOOPBACK_HTTPS_REQUIRED/u);
  assert.throws(() => decodeAcceptanceExecutionProfile({ ...hosted, NETLIFY_DEPLOY_ID: undefined }), /DEPLOY_ID_REQUIRED/u);
  assert.throws(() => decodeAcceptanceExecutionProfile({ ...hosted, LOCAL_ACCEPTANCE_BASE_URL: 'http://127.0.0.1:4201' }), /LOCAL_BINDING_REJECTED/u);
  assert.throws(() => decodeAcceptanceExecutionProfile({ ...hosted, ACCEPTANCE_INVOCATION_ID: invocationId }), /LOCAL_BINDING_REJECTED/u);
});

test('local output root binds the head, report area, and invocation without implying a clean tree', () => {
  const profile = decodeAcceptanceExecutionProfile(localEnvironment, { expectedCheckoutSha: head });
  assert.equal(
    createSyntheticRegressionOutputRoot({ profile, reportArea: 'sandbox' }),
    `output/playwright/pr264-synthetic-regression/${head}/sandbox/${invocationId}`,
  );
  assert.throws(
    () => createSyntheticRegressionOutputRoot({ profile, reportArea: '../hosted' }),
    /REPORT_AREA_INVALID/u,
  );
});

const metadata = createAcceptanceReportMetadata({
  profile: decodeAcceptanceExecutionProfile(localEnvironment, { expectedCheckoutSha: head }),
  exactCommand: ['node', 'scripts/runTranscriptFlowBrowser.mjs', '--preview-sandbox-regression'],
  configPath: 'playwright.local-sandbox-regression.config.ts',
  sourcePaths: ['tests/browser/exhaustiveHostedAcceptance.spec.ts'],
});
const reportWith = tests => ({
  config: { metadata: { ...metadata, actualWorkers: 1 } },
  errors: [],
  suites: [{ specs: tests.map(item => ({
    title: item.title,
    tests: [{
      projectName: item.projectName,
      status: item.status,
      expectedStatus: item.status === 'skipped' ? 'skipped' : 'passed',
      annotations: item.status === 'skipped' ? [{ type: 'skip', description: 'Explicitly catalog-unbound.' }] : [],
      results: [{ status: item.status === 'skipped' ? 'skipped' : 'passed', retry: 0, errors: [] }],
    }],
  })) }],
});

test('full result inventory distinguishes executed passes from explicit catalog-unbound skips', () => {
  const report = reportWith([
    { title: '[SYNTHETIC-REGRESSION:SANDBOX-001] sandbox', projectName: 'desktop-chromium', status: 'expected' },
    { title: '[SYNTHETIC-REGRESSION:ASSESS-002] blocked', projectName: 'desktop-chromium', status: 'skipped' },
  ]);
  assert.deepEqual(verifySyntheticRegressionResultInventory({
    report,
    expectedMetadata: metadata,
    expectedProjects: ['desktop-chromium'],
    expectedTestIds: ['SANDBOX-001', 'ASSESS-002'],
    executableTestIds: ['SANDBOX-001'],
  }), { total: 2, passed: 1, skipped: 1 });
});

test('result inventory rejects green zero-test, partial, duplicate, fake pass, and metadata substitution reports', () => {
  const expected = {
    expectedMetadata: metadata,
    expectedProjects: ['desktop-chromium'],
    expectedTestIds: ['SANDBOX-001', 'ASSESS-002'],
    executableTestIds: ['SANDBOX-001'],
  };
  assert.throws(() => verifySyntheticRegressionResultInventory({ ...expected, report: reportWith([]) }), /RESULT_COUNT_MISMATCH/u);
  assert.throws(() => verifySyntheticRegressionResultInventory({ ...expected, report: reportWith([
    { title: '[SYNTHETIC-REGRESSION:SANDBOX-001] sandbox', projectName: 'desktop-chromium', status: 'expected' },
  ]) }), /RESULT_COUNT_MISMATCH/u);
  assert.throws(() => verifySyntheticRegressionResultInventory({ ...expected, report: reportWith([
    { title: '[SYNTHETIC-REGRESSION:SANDBOX-001] sandbox', projectName: 'desktop-chromium', status: 'expected' },
    { title: '[SYNTHETIC-REGRESSION:SANDBOX-001] duplicate', projectName: 'desktop-chromium', status: 'expected' },
  ]) }), /STATUS_MISMATCH|INVENTORY_MISMATCH/u);
  assert.throws(() => verifySyntheticRegressionResultInventory({ ...expected, report: reportWith([
    { title: '[SYNTHETIC-REGRESSION:SANDBOX-001] sandbox', projectName: 'desktop-chromium', status: 'expected' },
    { title: '[SYNTHETIC-REGRESSION:ASSESS-002] fake pass', projectName: 'desktop-chromium', status: 'expected' },
  ]) }), /STATUS_MISMATCH/u);
  assert.throws(() => verifySyntheticRegressionResultInventory({ ...expected, report: { ...reportWith([
    { title: '[SYNTHETIC-REGRESSION:SANDBOX-001] sandbox', projectName: 'desktop-chromium', status: 'expected' },
    { title: '[SYNTHETIC-REGRESSION:ASSESS-002] blocked', projectName: 'desktop-chromium', status: 'skipped' },
  ]), config: { metadata: { ...metadata, exactHead: 'b'.repeat(40) } } } }), /METADATA_MISMATCH/u);
});

test('result inventory rejects summary-only status, retries, annotations, and top-level errors', () => {
  const expected = {
    expectedMetadata: metadata,
    expectedProjects: ['desktop-chromium'],
    expectedTestIds: ['SANDBOX-001'],
    executableTestIds: ['SANDBOX-001'],
  };
  const base = reportWith([
    { title: '[SYNTHETIC-REGRESSION:SANDBOX-001] sandbox', projectName: 'desktop-chromium', status: 'expected' },
  ]);
  const testResult = base.suites[0].specs[0].tests[0];
  assert.throws(() => verifySyntheticRegressionResultInventory({ ...expected, report: { ...base, suites: [{ specs: [{ title: base.suites[0].specs[0].title, tests: [{ ...testResult, results: [] }] }] }] } }), /ATTEMPT_COUNT_MISMATCH/u);
  assert.throws(() => verifySyntheticRegressionResultInventory({ ...expected, report: { ...base, suites: [{ specs: [{ title: base.suites[0].specs[0].title, tests: [{ ...testResult, results: [{ ...testResult.results[0], retry: 1 }] }] }] }] } }), /ATTEMPT_INVALID/u);
  assert.throws(() => verifySyntheticRegressionResultInventory({ ...expected, report: { ...base, suites: [{ specs: [{ title: base.suites[0].specs[0].title, tests: [{ ...testResult, annotations: [{ type: 'slow' }] }] }] }] } }), /STATUS_MISMATCH/u);
  assert.throws(() => verifySyntheticRegressionResultInventory({ ...expected, report: { ...base, errors: [{ message: 'hidden setup error' }] } }), /REPORT_ERRORS/u);
});
