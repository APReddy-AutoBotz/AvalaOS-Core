import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  createAcceptanceReportMetadata,
  createFullPageContrastAttachment,
  createSyntheticRegressionOutputRoot,
  decodeAcceptanceExecutionProfile,
  summarizeFullPageColorContrast,
  verifyFullPageContrastAttachments,
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
  assert.deepEqual(decodeAcceptanceExecutionProfile(hosted), {
    schemaVersion: 'acceptance-execution-profile-v1',
    evidenceKind: 'hosted-preview-acceptance',
    executionKind: 'hosted_preview',
    releaseSha: head,
    checkoutSha: null,
    sourceIdentity: 'committed_exact_head',
    invocationId: null,
    targetOrigin: 'https://deploy-preview-264--avalaos-pilot.netlify.app',
    deployId: 'b'.repeat(24),
  });
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
assert.deepEqual(metadata.ci, {}, 'reserved empty CI metadata must prevent Playwright auto-enrichment');

const contrastPersonas = [
  'Process Analyst',
  'AP Process Owner',
  'Delivery Lead',
  'Control Reviewer',
  'Automation Contributor',
  'Buyer Viewer',
  'Platform Admin',
];
const axeNode = (checkIds = ['color-contrast'], extra = {}) => ({
  any: checkIds.map(id => ({ id, data: { raw: 'not retained' } })),
  all: [],
  none: [],
  html: '<div data-private="not-retained">payload</div>',
  target: ['#private-selector'],
  failureSummary: 'raw failure detail',
  ...extra,
});
const axeResult = (id, nodes) => ({ id, nodes, description: 'raw rule description' });
const axeResults = ({ passes = [], violations = [], incomplete = [], inapplicable = [] } = {}) => ({
  passes,
  violations,
  incomplete,
  inapplicable,
});

test('full-page contrast summary classifies empty, unresolved, violating, mixed, and resolved Axe observations', () => {
  const empty = summarizeFullPageColorContrast(axeResults());
  assert.deepEqual(empty, {
    classification: 'empty_scan',
    positiveNodeCount: 0,
    violationNodeCount: 0,
    incompleteNodeCount: 0,
    observedNodeCount: 0,
    incompleteResultCount: 0,
    diagnostics: [],
  });
  assert.equal(summarizeFullPageColorContrast(axeResults({
    inapplicable: [axeResult('color-contrast', [axeNode()])],
  })).classification, 'empty_scan', 'inapplicable nodes are not observed contrast evidence');

  const unresolved = summarizeFullPageColorContrast(axeResults({
    incomplete: [
      axeResult('color-contrast', [axeNode(['color-contrast']), axeNode(['bg-image'])]),
      axeResult('color-contrast', [axeNode([])]),
    ],
  }));
  assert.deepEqual(unresolved, {
    classification: 'unresolved_manual',
    positiveNodeCount: 0,
    violationNodeCount: 0,
    incompleteNodeCount: 3,
    observedNodeCount: 3,
    incompleteResultCount: 2,
    diagnostics: [
      { resultOrdinal: 1, nodeCount: 2, reasonCategoryCounts: { 'color-contrast': 1, unknown_reason: 1 } },
      { resultOrdinal: 2, nodeCount: 1, reasonCategoryCounts: { unknown_reason: 1 } },
    ],
  });

  const mixed = summarizeFullPageColorContrast(axeResults({
    passes: [axeResult('color-contrast', [axeNode(), axeNode()])],
    incomplete: [axeResult('color-contrast', [axeNode(['contrast-background'])])],
  }));
  assert.equal(mixed.classification, 'unresolved_manual');
  assert.equal(mixed.observedNodeCount, 3);

  const violating = summarizeFullPageColorContrast(axeResults({
    passes: [axeResult('color-contrast', [axeNode()])],
    violations: [axeResult('color-contrast', [axeNode()])],
    incomplete: [axeResult('color-contrast', [axeNode()])],
  }));
  assert.equal(violating.classification, 'violations_detected');
  assert.equal(violating.violationNodeCount, 1);

  const resolved = summarizeFullPageColorContrast(axeResults({
    passes: [axeResult('color-contrast', [axeNode(), axeNode()])],
    violations: [axeResult('button-name', [axeNode()])],
  }));
  assert.equal(resolved.classification, 'resolved');
  assert.equal(resolved.positiveNodeCount, 2);
  assert.equal(resolved.observedNodeCount, 2);
});

test('full-page summary rejects malformed Axe structures and attachment output retains only sanitized aggregate data', () => {
  for (const invalid of [
    null,
    {},
    axeResults({ passes: [{ id: 'color-contrast', nodes: null }] }),
    axeResults({ passes: [axeResult('color-contrast', [])] }),
    axeResults({ incomplete: [axeResult('color-contrast', [{ any: [], all: [] }])] }),
    axeResults({ incomplete: [axeResult('color-contrast', [{ any: [{ id: null }], all: [], none: [] }])] }),
  ]) assert.throws(() => summarizeFullPageColorContrast(invalid), /FULL_PAGE_CONTRAST_AXE_/u);

  const observedAt = '2026-09-08T12:00:01.000Z';
  const results = axeResults({ incomplete: [axeResult('color-contrast', [axeNode(['bg-image'])])] });
  const attachment = createFullPageContrastAttachment({
    results,
    metadata,
    persona: 'Platform Admin',
    profile: 'representative-surface',
    project: 'pixel-7-chromium',
    test: '[SYNTHETIC-REGRESSION:SAFETY-007] Cross-cutting: serious critical a11y',
    observedAt,
  });
  assert.equal(attachment.name, 'full-page-contrast-summary-representative-surface-platform-admin');
  assert.equal(attachment.contentType, 'application/json');
  assert.equal(JSON.parse(attachment.body).classification, 'unresolved_manual');
  assert.doesNotMatch(attachment.body, /private|selector|failure|payload|bg-image|raw rule/u);
  const withFrameworkMetadata = createFullPageContrastAttachment({
    results,
    metadata: { ...metadata, actualWorkers: 1 },
    persona: 'Platform Admin',
    profile: 'representative-surface',
    project: 'pixel-7-chromium',
    test: '[SYNTHETIC-REGRESSION:SAFETY-007] Cross-cutting: serious critical a11y',
    observedAt,
  });
  assert.equal(
    JSON.parse(withFrameworkMetadata.body).executionBindingDigest,
    JSON.parse(attachment.body).executionBindingDigest,
    'framework-owned actualWorkers must not alter the execution binding',
  );
});

const canonicalJson = value => JSON.stringify(Array.isArray(value)
  ? value.map(item => JSON.parse(canonicalJson(item)))
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonicalJson(value[key]))]))
    : value);
const contrastAttempt = ({
  profile = 'representative-surface',
  project = 'pixel-7-chromium',
  title = '[SYNTHETIC-REGRESSION:SAFETY-007] Cross-cutting: serious critical a11y',
  observedAt = '2026-09-08T12:00:01.000Z',
  resultsFor = persona => axeResults({
    ...(persona === 'Platform Admin'
      ? { incomplete: [axeResult('color-contrast', [axeNode(['bg-image']), axeNode([])])] }
      : { passes: [axeResult('color-contrast', [axeNode()])] }),
  }),
} = {}) => ({
  status: 'passed',
  retry: 0,
  startTime: '2026-09-08T12:00:00.000Z',
  duration: 10_000,
  attachments: contrastPersonas.map(persona => {
    const attachment = createFullPageContrastAttachment({
      results: resultsFor(persona), metadata, persona, profile, project, test: title, observedAt,
    });
    return { name: attachment.name, contentType: attachment.contentType, body: Buffer.from(attachment.body).toString('base64') };
  }),
});
const mutateRetainedBody = (attempt, index, mutate) => {
  const attachment = attempt.attachments[index];
  const body = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
  mutate(body);
  attachment.body = Buffer.from(canonicalJson(body)).toString('base64');
};

test('full-page attachment verifier accepts seven bound summaries and reports unresolved personas without manufacturing PASS', () => {
  const attempt = contrastAttempt();
  assert.deepEqual(verifyFullPageContrastAttachments({
    testId: 'SAFETY-007',
    title: '[SYNTHETIC-REGRESSION:SAFETY-007] Cross-cutting: serious critical a11y',
    project: 'pixel-7-chromium',
    attempt,
    metadata,
  }), { summaryCount: 7, unresolvedPersonaCount: 1 });
  assert.deepEqual(verifyFullPageContrastAttachments({
    testId: 'SANDBOX-001', title: '[SANDBOX-001] other', project: 'desktop-chromium', attempt: {}, metadata: {},
  }), { summaryCount: 0, unresolvedPersonaCount: 0 });
});

test('full-page attachment verifier rejects missing, duplicate, foreign, stale, unretained, malformed, forged, and substituted evidence', () => {
  const verify = (attempt, overrides = {}) => verifyFullPageContrastAttachments({
    testId: 'SAFETY-007',
    title: '[SYNTHETIC-REGRESSION:SAFETY-007] Cross-cutting: serious critical a11y',
    project: 'pixel-7-chromium',
    attempt,
    metadata,
    ...overrides,
  });
  const adversaries = [
    attempt => { attempt.attachments.pop(); },
    attempt => { attempt.attachments[6] = structuredClone(attempt.attachments[0]); },
    attempt => { delete attempt.attachments[6].body; attempt.attachments[6].path = 'substituted.json'; },
    attempt => { attempt.attachments[6].body = 'not canonical base64'; },
    attempt => mutateRetainedBody(attempt, 6, body => { body.persona = 'Foreign Persona'; }),
    attempt => mutateRetainedBody(attempt, 6, body => { body.project = 'desktop-chromium'; }),
    attempt => mutateRetainedBody(attempt, 6, body => { body.test = '[SYNTHETIC-REGRESSION:SAFETY-007] substituted'; }),
    attempt => mutateRetainedBody(attempt, 6, body => { body.profile = 'initial-entry'; }),
    attempt => mutateRetainedBody(attempt, 6, body => { body.observedAt = '2026-09-08T12:00:11.000Z'; }),
    attempt => mutateRetainedBody(attempt, 6, body => { body.observedAt = '2026-09-08T11:59:59.999Z'; }),
    attempt => mutateRetainedBody(attempt, 6, body => { body.classification = 'resolved'; }),
    attempt => mutateRetainedBody(attempt, 6, body => { body.observedNodeCount += 1; }),
    attempt => mutateRetainedBody(attempt, 6, body => { body.diagnostics[0].reasonCategoryCounts = { raw_check_id: 2 }; }),
    attempt => mutateRetainedBody(attempt, 6, body => { body.executionBindingDigest = `sha256:${'f'.repeat(64)}`; }),
    attempt => mutateRetainedBody(attempt, 6, body => { body.html = '<p>raw payload</p>'; }),
    attempt => { attempt.attachments[6].html = '<p>raw outer payload</p>'; },
  ];
  for (const mutate of adversaries) {
    const attempt = contrastAttempt();
    mutate(attempt);
    assert.throws(() => verify(attempt), /FULL_PAGE_CONTRAST_/u);
  }
  const emptyAttempt = contrastAttempt({ resultsFor: () => axeResults() });
  assert.throws(() => verify(emptyAttempt), /GREEN_RESULT_INVALID/u, 'an empty scan cannot enter a green report');
  const violatingAttempt = contrastAttempt({
    resultsFor: () => axeResults({ violations: [axeResult('color-contrast', [axeNode()])] }),
  });
  assert.throws(() => verify(violatingAttempt), /GREEN_RESULT_INVALID/u, 'a claimed green result cannot hide a contrast violation');

  const staleMetadata = { ...metadata, invocationId: '2'.repeat(32) };
  assert.throws(() => verify(contrastAttempt(), { metadata: staleMetadata }), /BODY_BINDING_INVALID/u);
  assert.throws(() => verify(contrastAttempt(), { project: 'desktop-chromium' }), /ATTACHMENT_INVALID|BODY_BINDING_INVALID/u);
  assert.throws(() => verify(contrastAttempt(), { title: '[SYNTHETIC-REGRESSION:SAFETY-007] substituted title' }), /BODY_BINDING_INVALID/u);
  assert.throws(() => verify(contrastAttempt(), { title: '[SAFETY-007] hosted prefix in local evidence' }), /TEST_INVALID/u);
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

test('synthetic result inventory requires bound full-page summaries for executed SANDBOX-009 and accepts its local title profile', () => {
  const title = '[SYNTHETIC-REGRESSION:SANDBOX-009] keyboard accessibility';
  const report = reportWith([{ title, projectName: 'desktop-chromium', status: 'expected' }]);
  report.suites[0].specs[0].tests[0].results = [contrastAttempt({
    profile: 'initial-entry',
    project: 'desktop-chromium',
    title,
  })];
  const expected = {
    report,
    expectedMetadata: metadata,
    expectedProjects: ['desktop-chromium'],
    expectedTestIds: ['SANDBOX-009'],
    executableTestIds: ['SANDBOX-009'],
  };
  assert.deepEqual(verifySyntheticRegressionResultInventory(expected), { total: 1, passed: 1, skipped: 0 });
  report.suites[0].specs[0].tests[0].results[0].attachments.pop();
  assert.throws(() => verifySyntheticRegressionResultInventory(expected), /ATTACHMENT_COUNT_INVALID/u);
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
  for (const mutation of [
    { ci: { branch: 'refs/heads/private' } },
    { gitCommit: { id: 'b'.repeat(40) } },
    { gitDiff: 'private patch content' },
  ]) {
    assert.throws(() => verifySyntheticRegressionResultInventory({ ...expected, report: {
      ...reportWith([
        { title: '[SYNTHETIC-REGRESSION:SANDBOX-001] sandbox', projectName: 'desktop-chromium', status: 'expected' },
        { title: '[SYNTHETIC-REGRESSION:ASSESS-002] blocked', projectName: 'desktop-chromium', status: 'skipped' },
      ]),
      config: { metadata: { ...metadata, ...mutation, actualWorkers: 1 } },
    } }), /METADATA_MISMATCH/u);
    const pollutedExpectedMetadata = { ...metadata, ...mutation };
    assert.throws(() => verifySyntheticRegressionResultInventory({
      ...expected,
      expectedMetadata: pollutedExpectedMetadata,
      report: {
        ...reportWith([
          { title: '[SYNTHETIC-REGRESSION:SANDBOX-001] sandbox', projectName: 'desktop-chromium', status: 'expected' },
          { title: '[SYNTHETIC-REGRESSION:ASSESS-002] blocked', projectName: 'desktop-chromium', status: 'skipped' },
        ]),
        config: { metadata: { ...pollutedExpectedMetadata, actualWorkers: 1 } },
      },
    }), /METADATA_MISMATCH/u);
  }
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

test('coverage scenario directly exercises the acceptance execution profile authority', () => {
  const profile = decodeAcceptanceExecutionProfile(localEnvironment, { expectedCheckoutSha: head });
  assert.equal(profile.executionKind, 'local_source_fixture');
  assert.equal(profile.sourceIdentity, 'governed_working_tree_candidate');
  assert.equal(createSyntheticRegressionOutputRoot({ profile, reportArea: 'coverage' }),
    `output/playwright/pr264-synthetic-regression/${head}/coverage/${invocationId}`);

  const directory = process.env.PR_C_CONTROL_SCRIPT_SCENARIO_REPORT_DIRECTORY;
  if (directory) {
    writeFileSync(path.join(directory, 'acceptance-execution-profile-scenarios.json'), JSON.stringify({
      contractVersion: 'pr-c-control-script-scenarios-1',
      producer: 'scripts/acceptanceExecutionProfile.test.mjs',
      scenarios: [{ name: 'acceptance-execution-profile-direct-import', status: 'passed' }],
    }), { flag: 'wx' });
  }
});
