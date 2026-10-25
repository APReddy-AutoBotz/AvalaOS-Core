import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { validateAuthenticatedHostedPlaywrightDiagnostic } from './authenticatedHostedDiagnostics.mjs';

export const ELIGIBLE_REVIEWER_DIAGNOSTIC_FILES = Object.freeze([
  'cleanup.json',
  'diagnostic.json',
  'result.json',
  'source-bindings.json',
]);

export const ELIGIBLE_REVIEWER_DIAGNOSTIC_SOURCE_PATHS = Object.freeze([
  '.github/workflows/authenticated-product-acceptance.yml',
  'package.json',
  'playwright.eligible-reviewer-request-diagnostics.config.ts',
  'scripts/authenticatedHostedBrowserRequestClassifier.mjs',
  'scripts/authenticatedHostedDiagnostics.mjs',
  'scripts/authenticatedHostedPlaywrightReporter.mjs',
  'scripts/eligibleReviewerRequestDiagnostic.mjs',
  'scripts/eligibleReviewerRequestDiagnosticsArtifact.mjs',
  'scripts/runEligibleReviewerRequestDiagnosticsBrowser.mjs',
  'tests/browser/authenticatedHostedNetwork.ts',
  'tests/browser/eligibleReviewerRequestDiagnostics.browser.ts',
  'tests/browser/eligibleReviewerRequestDiagnostics.ts',
  'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts',
]);

const SHA = /^sha256:[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;
const RUN_ID = /^[1-9][0-9]{0,19}$/u;
const exact = (value, keys) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const fail = code => { throw new Error(code); };
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const artifactName = ({ releaseSha, runId, runAttempt }) =>
  `eligible-reviewer-request-diagnostics-${releaseSha}-${runId}-${runAttempt}`;

export const createEligibleReviewerRequestDiagnosticsSourceBindings = async ({
  repositoryRoot = process.cwd(), releaseSha, runId, runAttempt,
  workflowPath = '.github/workflows/authenticated-product-acceptance.yml', job = 'connected-browser',
} = {}) => {
  if (!HEAD.test(releaseSha ?? '') || !RUN_ID.test(String(runId ?? ''))
    || !Number.isInteger(runAttempt) || runAttempt < 1 || runAttempt > 999
    || workflowPath !== '.github/workflows/authenticated-product-acceptance.yml' || job !== 'connected-browser') {
    fail('ELIGIBLE_REVIEWER_DIAGNOSTICS_BINDING_INPUT_REJECTED');
  }
  const files = [];
  for (const sourcePath of ELIGIBLE_REVIEWER_DIAGNOSTIC_SOURCE_PATHS) {
    files.push({ path: sourcePath, sha256: sha256(await readFile(path.join(repositoryRoot, sourcePath))) });
  }
  const sourceDigest = sha256(Buffer.from(JSON.stringify(files)));
  const config = files.find(item => item.path === 'playwright.eligible-reviewer-request-diagnostics.config.ts');
  const runner = files.find(item => item.path === 'scripts/runEligibleReviewerRequestDiagnosticsBrowser.mjs');
  return {
    schemaVersion: 'eligible-reviewer-request-diagnostics-source-bindings-v1',
    releaseSha,
    execution: {
      workflowPath,
      job,
      runId: String(runId),
      runAttempt,
      artifactName: artifactName({ releaseSha, runId, runAttempt }),
    },
    limits: {
      assertionTimeoutMs: 15_000,
      providerGenerationEnabled: false,
      fullAcceptanceExecuted: false,
    },
    source: { count: files.length, digest: sourceDigest, files },
    build: {
      browserEngine: 'chromium',
      project: 'desktop-chromium',
      configPath: config.path,
      configSha256: config.sha256,
      runnerPath: runner.path,
      runnerSha256: runner.sha256,
      retainedArtifacts: { trace: false, screenshot: false, video: false },
    },
  };
};

export const validateEligibleReviewerRequestDiagnosticsSourceBindings = async (value, {
  expectedReleaseSha, expectedRunId, expectedRunAttempt,
  expectedWorkflowPath = '.github/workflows/authenticated-product-acceptance.yml',
  expectedJob = 'connected-browser', readSourceBytes,
} = {}) => {
  if (!exact(value, ['schemaVersion', 'releaseSha', 'execution', 'limits', 'source', 'build'])
    || value.schemaVersion !== 'eligible-reviewer-request-diagnostics-source-bindings-v1'
    || value.releaseSha !== expectedReleaseSha || !HEAD.test(value.releaseSha)) fail('BINDING_IDENTITY_REJECTED');
  if (!exact(value.execution, ['workflowPath', 'job', 'runId', 'runAttempt', 'artifactName'])
    || value.execution.workflowPath !== expectedWorkflowPath || value.execution.job !== expectedJob
    || value.execution.runId !== String(expectedRunId) || !RUN_ID.test(value.execution.runId)
    || value.execution.runAttempt !== expectedRunAttempt || !Number.isInteger(value.execution.runAttempt)
    || value.execution.artifactName !== artifactName({
      releaseSha: expectedReleaseSha, runId: expectedRunId, runAttempt: expectedRunAttempt,
    })) fail('BINDING_EXECUTION_REJECTED');
  if (!exact(value.limits, ['assertionTimeoutMs', 'providerGenerationEnabled', 'fullAcceptanceExecuted'])
    || value.limits.assertionTimeoutMs !== 15_000 || value.limits.providerGenerationEnabled !== false
    || value.limits.fullAcceptanceExecuted !== false) fail('BINDING_LIMITS_REJECTED');
  if (!exact(value.source, ['count', 'digest', 'files'])
    || value.source.count !== ELIGIBLE_REVIEWER_DIAGNOSTIC_SOURCE_PATHS.length
    || !SHA.test(value.source.digest) || !Array.isArray(value.source.files)
    || value.source.files.length !== value.source.count) fail('BINDING_SOURCE_REJECTED');
  const expectedPaths = [...ELIGIBLE_REVIEWER_DIAGNOSTIC_SOURCE_PATHS];
  for (let index = 0; index < expectedPaths.length; index += 1) {
    const item = value.source.files[index];
    if (!exact(item, ['path', 'sha256']) || item.path !== expectedPaths[index] || !SHA.test(item.sha256)) {
      fail('BINDING_SOURCE_FILE_REJECTED');
    }
    if (typeof readSourceBytes === 'function' && sha256(await readSourceBytes(item.path)) !== item.sha256) {
      fail('BINDING_SOURCE_BYTES_REJECTED');
    }
  }
  if (sha256(Buffer.from(JSON.stringify(value.source.files))) !== value.source.digest) {
    fail('BINDING_SOURCE_DIGEST_REJECTED');
  }
  const config = value.source.files.find(item => item.path === 'playwright.eligible-reviewer-request-diagnostics.config.ts');
  const runner = value.source.files.find(item => item.path === 'scripts/runEligibleReviewerRequestDiagnosticsBrowser.mjs');
  if (!exact(value.build, ['browserEngine', 'project', 'configPath', 'configSha256', 'runnerPath', 'runnerSha256', 'retainedArtifacts'])
    || value.build.browserEngine !== 'chromium' || value.build.project !== 'desktop-chromium'
    || value.build.configPath !== config.path || value.build.configSha256 !== config.sha256
    || value.build.runnerPath !== runner.path || value.build.runnerSha256 !== runner.sha256
    || !exact(value.build.retainedArtifacts, ['trace', 'screenshot', 'video'])
    || Object.values(value.build.retainedArtifacts).some(item => item !== false)) fail('BINDING_BUILD_REJECTED');
  return value;
};

const readJson = async (directory, name) => {
  const source = path.join(directory, name);
  const metadata = await lstat(source);
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail('ARTIFACT_FILE_TYPE_REJECTED');
  const bytes = await readFile(source);
  const maximum = name === 'diagnostic.json' ? 2_000 : 65_536;
  if (bytes.length < 2 || bytes.length > maximum) fail('ARTIFACT_FILE_SIZE_REJECTED');
  try { return { bytes, value: JSON.parse(bytes.toString('utf8')) }; }
  catch { return fail('ARTIFACT_JSON_REJECTED'); }
};

export const verifyEligibleReviewerRequestDiagnosticsArtifact = async ({
  directory, expectedReleaseSha, expectedRunId, expectedRunAttempt,
  expectedWorkflowPath = '.github/workflows/authenticated-product-acceptance.yml',
  expectedJob = 'connected-browser', readSourceBytes, archive,
} = {}) => {
  if (typeof readSourceBytes !== 'function') fail('ARTIFACT_SOURCE_READER_REQUIRED');
  const names = (await readdir(directory)).sort();
  if (names.join(',') !== ELIGIBLE_REVIEWER_DIAGNOSTIC_FILES.join(',')) fail('ARTIFACT_FILES_REJECTED');
  if (!exact(archive, ['name', 'reportedDigest', 'downloadDigest'])
    || archive.name !== artifactName({ releaseSha: expectedReleaseSha, runId: expectedRunId,
      runAttempt: expectedRunAttempt })
    || !SHA.test(archive.reportedDigest) || archive.reportedDigest !== archive.downloadDigest) {
    fail('ARTIFACT_ARCHIVE_BINDING_REJECTED');
  }
  const loaded = Object.fromEntries(await Promise.all(names.map(async name => [name, await readJson(directory, name)])));
  const result = loaded['result.json'].value;
  if (!exact(result, ['schemaVersion', 'status', 'expectedAssertionFailure', 'launchSucceeded', 'childExited',
    'timedOut', 'diagnosticAccepted', 'pendingEligibleObserved', 'elapsedCapped', 'cleanupVerified',
    'playwrightOutputRemoved', 'providersEnabled'])
    || result.schemaVersion !== 'eligible-reviewer-request-diagnostics-browser-v1' || result.status !== 'PASS'
    || result.expectedAssertionFailure !== true || result.launchSucceeded !== true || result.childExited !== true
    || result.timedOut !== false || result.diagnosticAccepted !== true || result.pendingEligibleObserved !== true
    || result.elapsedCapped !== true || result.cleanupVerified !== true
    || result.playwrightOutputRemoved !== true || result.providersEnabled !== false) fail('ARTIFACT_RESULT_REJECTED');
  const cleanup = loaded['cleanup.json'].value;
  if (!exact(cleanup, ['eligibleReleased', 'networkSettled', 'actionsDrained', 'appClosed', 'apiClosed', 'providersEnabled'])
    || cleanup.eligibleReleased !== true || cleanup.networkSettled !== true || cleanup.actionsDrained !== true
    || cleanup.appClosed !== true || cleanup.apiClosed !== true || cleanup.providersEnabled !== false) {
    fail('ARTIFACT_CLEANUP_REJECTED');
  }
  const diagnostic = validateAuthenticatedHostedPlaywrightDiagnostic(loaded['diagnostic.json'].value);
  if (!diagnostic || JSON.stringify(diagnostic) !== JSON.stringify(loaded['diagnostic.json'].value)) {
    fail('ARTIFACT_DIAGNOSTIC_SHAPE_REJECTED');
  }
  const eligible = diagnostic?.requestContext?.requests?.[2];
  if (diagnostic?.operation !== 'GOVERN_STUDIO_ELIGIBLE_REVIEWER_VISIBLE'
    || diagnostic.category !== 'unexpected-failure' || diagnostic.requestContext?.project !== 'desktop-chromium'
    || eligible?.state !== 'pending' || eligible.outcome !== 'pending' || eligible.elapsedMs !== 15_000
    || eligible.elapsedSaturated !== true || diagnostic.requestContext.candidateCount !== null
    || diagnostic.requestContext.decisionBinding !== 'unavailable'
    || diagnostic.requestContext.ui?.workspace !== 'unknown'
    || diagnostic.requestContext.ui?.candidates !== 'unknown') fail('ARTIFACT_DIAGNOSTIC_REJECTED');
  const bindings = await validateEligibleReviewerRequestDiagnosticsSourceBindings(
    loaded['source-bindings.json'].value,
    { expectedReleaseSha, expectedRunId, expectedRunAttempt, expectedWorkflowPath, expectedJob, readSourceBytes });
  const contentDigest = sha256(Buffer.concat(names.flatMap(name => [Buffer.from(`${name}\0`), loaded[name].bytes])));
  return {
    status: 'PASS',
    artifactName: archive.name,
    archiveDigestVerified: true,
    contentDigest,
    releaseSha: bindings.releaseSha,
    runId: bindings.execution.runId,
    runAttempt: bindings.execution.runAttempt,
    job: bindings.execution.job,
    sourceCount: bindings.source.count,
    assertionTimeoutMs: bindings.limits.assertionTimeoutMs,
    providersEnabled: false,
    fullAcceptanceExecuted: false,
    cleanupVerified: true,
  };
};
