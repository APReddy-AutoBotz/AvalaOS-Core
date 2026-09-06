const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const NETLIFY_DEPLOY_ID_PATTERN = /^[0-9a-f]{24}$/u;
const INVOCATION_ID_PATTERN = /^[0-9a-f]{32}$/u;
const REPORT_AREA_PATTERN = /^[a-z][a-z0-9-]*$/u;
const ALLOWED_EXECUTION_KINDS = new Set(['hosted_preview', 'local_source_fixture', 'declaration_only']);

const requiredString = (value, code) => {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) throw new Error(code);
  return value;
};

const releaseShaFrom = environment => {
  const acceptanceSha = environment.ACCEPTANCE_RELEASE_SHA;
  const expectedSha = environment.EXPECTED_RELEASE_SHA;
  if (acceptanceSha && expectedSha && acceptanceSha !== expectedSha) {
    throw new Error('ACCEPTANCE_EXECUTION_RELEASE_SHA_CONFLICT');
  }
  const releaseSha = requiredString(acceptanceSha ?? expectedSha, 'ACCEPTANCE_EXECUTION_RELEASE_SHA_REQUIRED');
  if (!SHA_PATTERN.test(releaseSha)) throw new Error('ACCEPTANCE_EXECUTION_RELEASE_SHA_INVALID');
  return releaseSha;
};

const parseOrigin = (value, code) => {
  const raw = requiredString(value, code);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(code);
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '' && url.pathname !== '/')) {
    throw new Error(code);
  }
  return url;
};

const isLoopbackHostname = hostname => hostname === '127.0.0.1' || hostname === '[::1]';

export const decodeAcceptanceExecutionProfile = (environment, { expectedCheckoutSha } = {}) => {
  const kind = requiredString(environment.ACCEPTANCE_EXECUTION_KIND, 'ACCEPTANCE_EXECUTION_KIND_REQUIRED');
  if (!ALLOWED_EXECUTION_KINDS.has(kind)) throw new Error('ACCEPTANCE_EXECUTION_KIND_INVALID');
  const releaseSha = releaseShaFrom(environment);

  if (kind === 'declaration_only') {
    if (
      environment.HOSTED_PILOT_URL
      || environment.NETLIFY_DEPLOY_ID
      || environment.LOCAL_ACCEPTANCE_BASE_URL
      || environment.ACCEPTANCE_CHECKOUT_SHA
      || environment.ACCEPTANCE_INVOCATION_ID
    ) {
      throw new Error('ACCEPTANCE_DECLARATION_RUNTIME_BINDING_REJECTED');
    }
    return Object.freeze({
      schemaVersion: 'acceptance-execution-profile-v1',
      evidenceKind: 'acceptance-catalog-declaration',
      executionKind: kind,
      releaseSha,
      checkoutSha: null,
      sourceIdentity: 'catalog_declaration',
      invocationId: null,
      targetOrigin: null,
      deployId: null,
    });
  }

  if (kind === 'local_source_fixture') {
    if (environment.HOSTED_PILOT_URL) throw new Error('LOCAL_SOURCE_FIXTURE_HOSTED_URL_REJECTED');
    if (environment.NETLIFY_DEPLOY_ID) throw new Error('LOCAL_SOURCE_FIXTURE_DEPLOY_ID_REJECTED');
    const checkoutSha = requiredString(environment.ACCEPTANCE_CHECKOUT_SHA, 'LOCAL_SOURCE_FIXTURE_CHECKOUT_SHA_REQUIRED');
    if (!SHA_PATTERN.test(checkoutSha)) throw new Error('LOCAL_SOURCE_FIXTURE_CHECKOUT_SHA_INVALID');
    if (expectedCheckoutSha && checkoutSha !== expectedCheckoutSha) throw new Error('LOCAL_SOURCE_FIXTURE_REAL_CHECKOUT_SHA_MISMATCH');
    if (releaseSha !== checkoutSha) throw new Error('LOCAL_SOURCE_FIXTURE_RELEASE_SHA_MISMATCH');
    const invocationId = requiredString(
      environment.ACCEPTANCE_INVOCATION_ID,
      'LOCAL_SOURCE_FIXTURE_INVOCATION_ID_REQUIRED',
    );
    if (!INVOCATION_ID_PATTERN.test(invocationId)) {
      throw new Error('LOCAL_SOURCE_FIXTURE_INVOCATION_ID_INVALID');
    }
    const target = parseOrigin(environment.LOCAL_ACCEPTANCE_BASE_URL, 'LOCAL_SOURCE_FIXTURE_ORIGIN_INVALID');
    if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1') {
      throw new Error('LOCAL_SOURCE_FIXTURE_LOOPBACK_REQUIRED');
    }
    return Object.freeze({
      schemaVersion: 'acceptance-execution-profile-v1',
      evidenceKind: 'exact-head-synthetic-regression',
      executionKind: kind,
      releaseSha,
      checkoutSha,
      sourceIdentity: 'governed_working_tree_candidate',
      invocationId,
      targetOrigin: target.origin,
      deployId: null,
    });
  }

  if (
    environment.LOCAL_ACCEPTANCE_BASE_URL
    || environment.ACCEPTANCE_CHECKOUT_SHA
    || environment.ACCEPTANCE_INVOCATION_ID
  ) {
    throw new Error('HOSTED_PREVIEW_LOCAL_BINDING_REJECTED');
  }
  const deployId = requiredString(environment.NETLIFY_DEPLOY_ID, 'HOSTED_PREVIEW_DEPLOY_ID_REQUIRED');
  if (!NETLIFY_DEPLOY_ID_PATTERN.test(deployId)) throw new Error('HOSTED_PREVIEW_DEPLOY_ID_INVALID');
  const target = parseOrigin(environment.HOSTED_PILOT_URL, 'HOSTED_PREVIEW_ORIGIN_INVALID');
  if (target.protocol !== 'https:' || isLoopbackHostname(target.hostname) || target.hostname === 'localhost') {
    throw new Error('HOSTED_PREVIEW_NON_LOOPBACK_HTTPS_REQUIRED');
  }
  return Object.freeze({
    schemaVersion: 'acceptance-execution-profile-v1',
    evidenceKind: 'hosted-preview-acceptance',
    executionKind: kind,
    releaseSha,
    checkoutSha: null,
    sourceIdentity: 'committed_exact_head',
    invocationId: null,
    targetOrigin: target.origin,
    deployId,
  });
};

export const createAcceptanceReportMetadata = ({ profile, exactCommand, configPath, sourcePaths }) => {
  if (!Array.isArray(exactCommand) || exactCommand.length < 2 || exactCommand.some(item => typeof item !== 'string' || !item)) {
    throw new Error('ACCEPTANCE_REPORT_COMMAND_INVALID');
  }
  if (!Array.isArray(sourcePaths) || sourcePaths.length === 0 || sourcePaths.some(item => typeof item !== 'string' || !item)) {
    throw new Error('ACCEPTANCE_REPORT_SOURCE_INVALID');
  }
  requiredString(configPath, 'ACCEPTANCE_REPORT_CONFIG_INVALID');
  // Playwright appends its bounded `actualWorkers` field to config metadata.
  // Keep this object mutable for that framework-owned addition; the result
  // verifier below admits no other metadata fields.
  return {
    schemaVersion: 'acceptance-report-profile-v1',
    evidenceKind: profile.evidenceKind,
    executionKind: profile.executionKind,
    exactCommand: [...exactCommand],
    configPath,
    sourcePaths: [...sourcePaths],
    exactHead: profile.releaseSha,
    targetOrigin: profile.targetOrigin,
    deployId: profile.deployId,
    ...(profile.executionKind === 'local_source_fixture' ? {
      sourceIdentity: profile.sourceIdentity,
      invocationId: profile.invocationId,
    } : {}),
  };
};

export const createSyntheticRegressionOutputRoot = ({ profile, reportArea }) => {
  if (
    profile?.executionKind !== 'local_source_fixture'
    || profile.sourceIdentity !== 'governed_working_tree_candidate'
    || !INVOCATION_ID_PATTERN.test(profile.invocationId ?? '')
  ) {
    throw new Error('SYNTHETIC_REGRESSION_LOCAL_PROFILE_REQUIRED');
  }
  const area = requiredString(reportArea, 'SYNTHETIC_REGRESSION_REPORT_AREA_INVALID');
  if (!REPORT_AREA_PATTERN.test(area)) throw new Error('SYNTHETIC_REGRESSION_REPORT_AREA_INVALID');
  return `output/playwright/pr264-synthetic-regression/${profile.releaseSha}/${area}/${profile.invocationId}`;
};

const collectPlaywrightTests = report => {
  const tests = [];
  const visitSuite = suite => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        tests.push({
          title: spec.title,
          projectName: test.projectName,
          status: test.status,
          expectedStatus: test.expectedStatus,
          annotations: test.annotations,
          results: test.results,
        });
      }
    }
    for (const child of suite.suites ?? []) visitSuite(child);
  };
  for (const suite of report.suites ?? []) visitSuite(suite);
  return tests;
};

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export const verifySyntheticRegressionResultInventory = ({
  report,
  expectedMetadata,
  expectedProjects,
  expectedTestIds,
  executableTestIds,
}) => {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('SYNTHETIC_REGRESSION_REPORT_INVALID');
  if (!Array.isArray(report.errors) || report.errors.length !== 0) throw new Error('SYNTHETIC_REGRESSION_REPORT_ERRORS');
  const actualMetadata = report.config?.metadata;
  if (!actualMetadata || typeof actualMetadata !== 'object' || Array.isArray(actualMetadata)) {
    throw new Error('SYNTHETIC_REGRESSION_METADATA_MISMATCH');
  }
  const expectedMetadataKeys = Object.keys(expectedMetadata).sort();
  const actualMetadataKeys = Object.keys(actualMetadata).filter(key => key !== 'actualWorkers').sort();
  if (
    !sameJson(actualMetadataKeys, expectedMetadataKeys)
    || expectedMetadataKeys.some(key => !sameJson(actualMetadata[key], expectedMetadata[key]))
    || actualMetadata.actualWorkers !== 1
  ) {
    throw new Error('SYNTHETIC_REGRESSION_METADATA_MISMATCH');
  }
  const tests = collectPlaywrightTests(report);
  const expectedKeys = [];
  const executable = new Set(executableTestIds);
  for (const projectName of expectedProjects) {
    for (const testId of expectedTestIds) expectedKeys.push(`${projectName}\0${testId}`);
  }
  if (tests.length !== expectedKeys.length || tests.length === 0) throw new Error('SYNTHETIC_REGRESSION_RESULT_COUNT_MISMATCH');

  const actualKeys = [];
  let passed = 0;
  let skipped = 0;
  for (const result of tests) {
    const match = result.title.match(/^\[SYNTHETIC-REGRESSION:([A-Z0-9-]+)\]\s/u);
    if (!match) throw new Error('SYNTHETIC_REGRESSION_TITLE_INVALID');
    const testId = match[1];
    actualKeys.push(`${result.projectName}\0${testId}`);
    const shouldExecute = executable.has(testId);
    const results = Array.isArray(result.results) ? result.results : [];
    if (results.length !== 1) throw new Error('SYNTHETIC_REGRESSION_ATTEMPT_COUNT_MISMATCH');
    const attempt = results[0];
    if ((attempt.retry ?? 0) !== 0 || attempt.error || (Array.isArray(attempt.errors) && attempt.errors.length > 0)) {
      throw new Error('SYNTHETIC_REGRESSION_ATTEMPT_INVALID');
    }
    if (shouldExecute) {
      if (
        result.status !== 'expected'
        || result.expectedStatus !== 'passed'
        || attempt.status !== 'passed'
        || !Array.isArray(result.annotations)
        || result.annotations.length !== 0
      ) {
        throw new Error('SYNTHETIC_REGRESSION_STATUS_MISMATCH');
      }
      passed += 1;
    } else {
      const annotations = Array.isArray(result.annotations) ? result.annotations : [];
      if (
        result.status !== 'skipped'
        || result.expectedStatus !== 'skipped'
        || attempt.status !== 'skipped'
        || annotations.length !== 1
        || annotations[0]?.type !== 'skip'
        || typeof annotations[0]?.description !== 'string'
        || annotations[0].description.length === 0
      ) {
        throw new Error('SYNTHETIC_REGRESSION_STATUS_MISMATCH');
      }
      skipped += 1;
    }
  }
  actualKeys.sort();
  expectedKeys.sort();
  if (!sameJson(actualKeys, expectedKeys) || new Set(actualKeys).size !== actualKeys.length) {
    throw new Error('SYNTHETIC_REGRESSION_INVENTORY_MISMATCH');
  }
  return Object.freeze({ total: tests.length, passed, skipped });
};
