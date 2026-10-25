import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createEligibleReviewerRequestDiagnosticsSourceBindings,
  validateEligibleReviewerRequestDiagnosticsSourceBindings,
  verifyEligibleReviewerRequestDiagnosticsArtifact,
} from './eligibleReviewerRequestDiagnosticsArtifact.mjs';

const RELEASE = 'a'.repeat(40);
const RUN_ID = '123456789';
const RUN_ATTEMPT = 1;
const ARCHIVE = {
  name: `eligible-reviewer-request-diagnostics-${RELEASE}-${RUN_ID}-${RUN_ATTEMPT}`,
  reportedDigest: `sha256:${'b'.repeat(64)}`,
  downloadDigest: `sha256:${'b'.repeat(64)}`,
};
const cleanup = { eligibleReleased: true, networkSettled: true, actionsDrained: true,
  appClosed: true, apiClosed: true, providersEnabled: false };
const result = { schemaVersion: 'eligible-reviewer-request-diagnostics-browser-v1', status: 'PASS',
  expectedAssertionFailure: true, launchSucceeded: true, childExited: true, timedOut: false,
  diagnosticAccepted: true, pendingEligibleObserved: true, elapsedCapped: true, cleanupVerified: true,
  playwrightOutputRemoved: true, providersEnabled: false };
const diagnostic = {
  schemaVersion: 'authenticated-hosted-playwright-diagnostic-v1', project: 'desktop-chromium',
  testCategory: 'govern-studio-lifecycle', category: 'unexpected-failure',
  operation: 'GOVERN_STUDIO_ELIGIBLE_REVIEWER_VISIBLE',
  requestContext: {
    schemaVersion: 'eligible-reviewer-request-diagnostic-v1', project: 'desktop-chromium',
    testCategory: 'govern-studio-lifecycle', assertion: 'eligible-reviewer-visible',
    pageOrdinal: 1, selectionOrdinal: 1, frozen: true, elapsedMs: 15_000, elapsedSaturated: true,
    requests: [
      { route: 'queue', firstRequestOrdinal: 1, requestCount: 1, responseCount: 1, pendingCount: 0,
        state: 'settled', lastHttpStatus: 200, statusClass: 'success', outcome: 'incomplete',
        elapsedMs: 80, elapsedSaturated: false },
      { route: 'workspace', firstRequestOrdinal: 2, requestCount: 1, responseCount: 1, pendingCount: 0,
        state: 'settled', lastHttpStatus: 200, statusClass: 'success', outcome: 'incomplete',
        elapsedMs: 80, elapsedSaturated: false },
      { route: 'eligible', firstRequestOrdinal: 3, requestCount: 1, responseCount: 0, pendingCount: 1,
        state: 'pending', lastHttpStatus: null, statusClass: 'unavailable', outcome: 'pending',
        elapsedMs: 15_000, elapsedSaturated: true },
    ],
    decisionBinding: 'unavailable', candidateCount: null, candidateCountSaturated: false,
    correlation: 'exact', ui: { workspace: 'unknown', candidates: 'unknown' },
  },
};

const clone = value => structuredClone(value);
const sourceReader = sourcePath => readFile(sourcePath);
const writeFixture = async (directory, changes = {}) => {
  await mkdir(directory);
  const bindings = changes.bindings ?? await createEligibleReviewerRequestDiagnosticsSourceBindings({
    releaseSha: RELEASE, runId: RUN_ID, runAttempt: RUN_ATTEMPT,
  });
  const values = {
    'cleanup.json': changes.cleanup ?? cleanup,
    'diagnostic.json': changes.diagnostic ?? diagnostic,
    'result.json': changes.result ?? result,
    'source-bindings.json': bindings,
  };
  await Promise.all(Object.entries(values).map(([name, value]) =>
    writeFile(path.join(directory, name), `${JSON.stringify(value)}\n`)));
};
const verify = (directory, options = {}) => verifyEligibleReviewerRequestDiagnosticsArtifact({
  directory, expectedReleaseSha: RELEASE, expectedRunId: RUN_ID, expectedRunAttempt: RUN_ATTEMPT,
  readSourceBytes: sourceReader, archive: ARCHIVE, ...options,
});

test('strictly verifies exact sanitized archive, source bytes, build and execution bindings', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eligible-reviewer-diagnostics-artifact-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const valid = path.join(root, 'valid');
  await writeFixture(valid);
  const verified = await verify(valid);
  assert.deepEqual(verified, {
    status: 'PASS', artifactName: ARCHIVE.name, archiveDigestVerified: true,
    contentDigest: verified.contentDigest, releaseSha: RELEASE, runId: RUN_ID, runAttempt: 1,
    job: 'connected-browser', sourceCount: 13, assertionTimeoutMs: 15_000,
    providersEnabled: false, fullAcceptanceExecuted: false, cleanupVerified: true,
  });
  assert.match(verified.contentDigest, /^sha256:[a-f0-9]{64}$/u);

  await assert.rejects(verify(valid, { archive: { ...ARCHIVE, downloadDigest: `sha256:${'c'.repeat(64)}` } }),
    /ARTIFACT_ARCHIVE_BINDING_REJECTED/u);
  await assert.rejects(verifyEligibleReviewerRequestDiagnosticsArtifact({
    directory: valid, expectedReleaseSha: RELEASE, expectedRunId: RUN_ID,
    expectedRunAttempt: RUN_ATTEMPT, archive: ARCHIVE,
  }), /ARTIFACT_SOURCE_READER_REQUIRED/u);
  await assert.rejects(verify(valid, { expectedRunAttempt: 2,
    archive: { ...ARCHIVE, name: `eligible-reviewer-request-diagnostics-${RELEASE}-${RUN_ID}-2` } }),
  /BINDING_EXECUTION_REJECTED/u);
  await assert.rejects(verify(valid, { readSourceBytes: async sourcePath =>
    sourcePath.endsWith('Artifact.mjs') ? Buffer.from('mutated') : readFile(sourcePath) }),
  /BINDING_SOURCE_BYTES_REJECTED/u);

  const extra = path.join(root, 'extra');
  await writeFixture(extra);
  await writeFile(path.join(extra, 'raw.log'), 'forbidden');
  await assert.rejects(verify(extra), /ARTIFACT_FILES_REJECTED/u);

  const provider = path.join(root, 'provider');
  await writeFixture(provider, { result: { ...result, providersEnabled: true } });
  await assert.rejects(verify(provider), /ARTIFACT_RESULT_REJECTED/u);

  const dirtyCleanup = path.join(root, 'cleanup');
  await writeFixture(dirtyCleanup, { cleanup: { ...cleanup, apiClosed: false } });
  await assert.rejects(verify(dirtyCleanup), /ARTIFACT_CLEANUP_REJECTED/u);

  const nonRegular = path.join(root, 'non-regular');
  await writeFixture(nonRegular);
  await rm(path.join(nonRegular, 'diagnostic.json'));
  await mkdir(path.join(nonRegular, 'diagnostic.json'));
  await assert.rejects(verify(nonRegular), /ARTIFACT_FILE_TYPE_REJECTED/u);

  const oversized = path.join(root, 'oversized');
  await writeFixture(oversized);
  await writeFile(path.join(oversized, 'diagnostic.json'), JSON.stringify({ padding: 'x'.repeat(2_100) }));
  await assert.rejects(verify(oversized), /ARTIFACT_FILE_SIZE_REJECTED/u);

  const unknownDiagnostic = path.join(root, 'unknown-diagnostic');
  await writeFixture(unknownDiagnostic, { diagnostic: { ...diagnostic, unexpected: true } });
  await assert.rejects(verify(unknownDiagnostic), /ARTIFACT_DIAGNOSTIC_SHAPE_REJECTED/u);
});

test('rejects source-list, limits and build mutations before archive promotion', async () => {
  const bindings = await createEligibleReviewerRequestDiagnosticsSourceBindings({
    releaseSha: RELEASE, runId: RUN_ID, runAttempt: RUN_ATTEMPT,
  });
  const options = { expectedReleaseSha: RELEASE, expectedRunId: RUN_ID, expectedRunAttempt: RUN_ATTEMPT,
    readSourceBytes: sourceReader };
  const wrongLimit = clone(bindings); wrongLimit.limits.assertionTimeoutMs = 15_001;
  await assert.rejects(validateEligibleReviewerRequestDiagnosticsSourceBindings(wrongLimit, options),
    /BINDING_LIMITS_REJECTED/u);
  const wrongBuild = clone(bindings); wrongBuild.build.configSha256 = `sha256:${'f'.repeat(64)}`;
  await assert.rejects(validateEligibleReviewerRequestDiagnosticsSourceBindings(wrongBuild, options),
    /BINDING_BUILD_REJECTED/u);
  const wrongSource = clone(bindings); wrongSource.source.files.reverse();
  await assert.rejects(validateEligibleReviewerRequestDiagnosticsSourceBindings(wrongSource, options),
    /BINDING_SOURCE_FILE_REJECTED/u);
  const wrongHead = clone(bindings); wrongHead.releaseSha = 'c'.repeat(40);
  await assert.rejects(validateEligibleReviewerRequestDiagnosticsSourceBindings(wrongHead, options),
    /BINDING_IDENTITY_REJECTED/u);
});
