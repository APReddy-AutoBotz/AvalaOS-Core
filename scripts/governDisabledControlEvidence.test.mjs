import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readGovernPreparationIdentity } from './governPreparationIdentity.mjs';

import {
  GOVERN_REVIEWER_DENIAL_PREPARATION_JOB,
  GOVERN_REVIEWER_DENIAL_PREPARATION_SCHEMA,
  GOVERN_REVIEWER_DENIAL_PREPARATION_WORKFLOW,
  GOVERN_REVIEWER_DENIAL_SOURCE_PATHS,
  governReviewerDenialPreparationIdentity,
  governReviewerDenialSource,
  validateGovernReviewerDenialPreparationEvidence,
} from './governDisabledControlEvidence.mjs';
import { canonicalDigest } from './assessV1OracleEvidence.mjs';

const digest = value => `sha256:${String(value).repeat(64).slice(0, 64)}`;
const releaseSha = 'a'.repeat(40);
const sourceFiles = () => GOVERN_REVIEWER_DENIAL_SOURCE_PATHS.map((path, index) => ({
  path,
  sha256: digest(((index % 6) + 1).toString(16)),
}));
const browser = project => ({
  project,
  status: 'passed',
  prerequisite: {
    mode: 'actual-production-ui-and-handlers',
    fixtureSessionPrimed: true,
    stages: ['author-create', 'author-draft', 'author-finalize', 'reviewer-assign', 'reviewer-attest', 'reviewer-approve'],
    approvalStatus: 200,
    approvedStateVisible: true,
    resolvedControlCount: 11,
    governStateBeforeAttempt: 'pending',
  },
  reviewerDenial: {
    control: 'Resolve Govern controls',
    uiDisabled: true,
    status: 403,
    errorCode: 'PERMISSION_DENIED',
    exactCurrentScope: true,
    exactCurrentVersion: true,
    requestDigest: digest('b'),
    requestCount: 1,
    zeroEffects: true,
  },
  independentResolution: {
    status: 200,
    resolutionDelta: { reviewAssignments: 0, governResolutions: 1, commandReceipts: 1, privilegedAudits: 1 },
  },
  mutation: { beforeHash: digest('c'), afterDenialHash: digest('c'), afterResolutionHash: digest('d') },
});
const build = () => {
  const manifest = [
    { path: 'assets/index.js', bytes: 1000, sha256: digest('e') },
    { path: 'index.html', bytes: 234, sha256: digest('f') },
  ];
  return { digest: canonicalDigest(manifest), fileCount: manifest.length, bytes: 1234, manifest };
};
const document = () => {
  const files = sourceFiles();
  return {
    schemaVersion: GOVERN_REVIEWER_DENIAL_PREPARATION_SCHEMA,
    status: 'passed',
    source: {
      releaseSha,
      runId: '123',
      attempt: '1',
      workflow: GOVERN_REVIEWER_DENIAL_PREPARATION_WORKFLOW,
      job: GOVERN_REVIEWER_DENIAL_PREPARATION_JOB,
      sourceDigest: governReviewerDenialSource(files).sourceDigest,
      files,
    },
    build: build(),
    fixture: { hostedPersonaRoleParity: true, providersEnabled: false, syntheticOnly: true, loopbackOnly: true },
    correctedTarget: {
      execution: 'shared-canonical-helper-using-actual-production-ui-and-handlers',
      prerequisite: 'actual-production-ui-author-finalize-reviewer-assign-attest-approve',
      canonicalScenarioSharedHelperExecuted: true,
      sourceBindings: { observeApiResponse: digest('1'), reviewerGovernDenial: digest('2') },
      helperTimeoutMs: 15_000,
      desktopAndPixelPassed: true,
    },
    reviewerAuthority: {
      required: ['assess.v2.read', 'assess.v2.review', 'assess.v2.evidence.attest', 'assess.v2.approve'],
      requiredPresent: true,
      forbidden: 'assess.v2.govern.resolve',
      forbiddenAbsent: true,
    },
    approverAuthority: { required: 'assess.v2.govern.resolve', requiredPresent: true },
    browsers: [browser('chromium-desktop'), browser('pixel-7')],
    persisted: { governResolutions: 2, governReceipts: 2, governAudits: 2 },
    providers: { enabled: false, calls: 0, paidCalls: 0 },
    scope: { fullAcceptanceRun: false, studioProviderGenerationRun: false },
    cleanup: { fixtureListenerClosedAndDatabaseRemoved: true, previewProcessExited: true, ownedBuildRemoved: true,
      sourcesUnchanged: true },
    acceptancePromoted: false,
  };
};

const identityFixture = () => ({
  environment: {
    RELEASE_SHA: releaseSha,
    GITHUB_SHA: 'b'.repeat(40),
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_WORKFLOW: GOVERN_REVIEWER_DENIAL_PREPARATION_WORKFLOW,
    GITHUB_JOB: GOVERN_REVIEWER_DENIAL_PREPARATION_JOB,
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_REF: 'refs/pull/327/merge',
    GITHUB_REPOSITORY: 'APReddy-AutoBotz/AvalaOS-Core',
  },
  event: { number: 327, repository: { full_name: 'APReddy-AutoBotz/AvalaOS-Core' },
    pull_request: {
      head: { sha: releaseSha, repo: { full_name: 'APReddy-AutoBotz/AvalaOS-Core' } },
      base: { ref: 'main', repo: { full_name: 'APReddy-AutoBotz/AvalaOS-Core' } },
    } },
  gitHead: releaseSha,
});

test('PR identity binds the event head and checkout despite a different runner merge SHA', () => {
  const { environment, event, gitHead } = identityFixture();
  assert.deepEqual(governReviewerDenialPreparationIdentity(environment, gitHead, event), {
    releaseSha,
    runId: '123',
    attempt: '1',
    workflow: GOVERN_REVIEWER_DENIAL_PREPARATION_WORKFLOW,
    job: GOVERN_REVIEWER_DENIAL_PREPARATION_JOB,
  });
});

for (const [name, mutate] of [
  ['checkout substitution', value => { value.gitHead = 'c'.repeat(40); }],
  ['release substitution', value => { value.environment.RELEASE_SHA = 'c'.repeat(40); }],
  ['event head substitution', value => { value.event.pull_request.head.sha = 'c'.repeat(40); }],
  ['missing event', value => { value.event = null; }],
  ['wrong event', value => { value.environment.GITHUB_EVENT_NAME = 'workflow_dispatch'; }],
  ['wrong PR reference', value => { value.environment.GITHUB_REF = 'refs/pull/328/merge'; }],
  ['wrong base', value => { value.event.pull_request.base.ref = 'other'; }],
  ['wrong head repository', value => { value.event.pull_request.head.repo.full_name = 'other/repo'; }],
  ['wrong base repository', value => { value.event.pull_request.base.repo.full_name = 'other/repo'; }],
  ['wrong event repository', value => { value.event.repository.full_name = 'other/repo'; }],
  ['wrong runner repository', value => { value.environment.GITHUB_REPOSITORY = 'other/repo'; }],
  ['invalid runner SHA', value => { value.environment.GITHUB_SHA = 'invalid'; }],
  ['invalid run', value => { value.environment.GITHUB_RUN_ID = '0'; }],
  ['invalid attempt', value => { value.environment.GITHUB_RUN_ATTEMPT = '0'; }],
  ['wrong workflow', value => { value.environment.GITHUB_WORKFLOW = 'other'; }],
  ['wrong job', value => { value.environment.GITHUB_JOB = 'other'; }],
]) test(`preparation identity rejects ${name}`, () => {
  const value = identityFixture(); mutate(value);
  assert.throws(() => governReviewerDenialPreparationIdentity(value.environment, value.gitHead, value.event),
    /IDENTITY_REJECTED/u);
});

test('release push identity binds main event, runner SHA and checkout; rejects substitutions', () => {
  const { environment, gitHead } = identityFixture();
  Object.assign(environment, { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: releaseSha });
  const event = { repository: { full_name: environment.GITHUB_REPOSITORY },
    ref: 'refs/heads/main', after: releaseSha, deleted: false };
  assert.equal(governReviewerDenialPreparationIdentity(environment, gitHead, event).releaseSha, releaseSha);
  for (const changed of [{ ...event, after: 'b'.repeat(40) }, { ...event, deleted: true },
    { ...event, ref: 'refs/heads/other' }]) {
    assert.throws(() => governReviewerDenialPreparationIdentity(environment, gitHead, changed), /IDENTITY_REJECTED/u);
  }
  assert.throws(() => governReviewerDenialPreparationIdentity({ ...environment, GITHUB_SHA: 'b'.repeat(40) },
    gitHead, event), /IDENTITY_REJECTED/u);
});

test('producer reads the supplied event file and fails closed on missing or malformed payloads', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'govern-preparation-identity-'));
  const { environment, event, gitHead } = identityFixture();
  try {
    await assert.rejects(readGovernPreparationIdentity(environment, gitHead), /IDENTITY_REJECTED/u);
    environment.GITHUB_EVENT_PATH = path.join(directory, 'event.json');
    await assert.rejects(readGovernPreparationIdentity(environment, gitHead), /IDENTITY_REJECTED/u);
    await writeFile(environment.GITHUB_EVENT_PATH, '{');
    await assert.rejects(readGovernPreparationIdentity(environment, gitHead), /IDENTITY_REJECTED/u);
    await writeFile(environment.GITHUB_EVENT_PATH, JSON.stringify(event));
    assert.equal((await readGovernPreparationIdentity(environment, gitHead)).releaseSha, releaseSha);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('sanitized proof accepts exact Desktop and Pixel denial/resolution evidence', () => {
  const value = validateGovernReviewerDenialPreparationEvidence(document());
  assert.equal(value.status, 'passed');
  assert.equal(value.acceptancePromoted, false);
  assert.deepEqual(value.browsers.map(item => item.project), ['chromium-desktop', 'pixel-7']);
});

test('proof rejects forged effects, incomplete cleanup, provider use, raw fields and source substitution', () => {
  const forged = document();
  forged.browsers[0].independentResolution.resolutionDelta.governResolutions = 2;
  assert.throws(() => validateGovernReviewerDenialPreparationEvidence(forged), /RESOLUTION_REJECTED/u);
  const cleanup = document(); cleanup.cleanup.ownedBuildRemoved = false;
  assert.throws(() => validateGovernReviewerDenialPreparationEvidence(cleanup), /CLEANUP_REJECTED/u);
  const provider = document(); provider.providers.calls = 1;
  assert.throws(() => validateGovernReviewerDenialPreparationEvidence(provider), /PROVIDERS_REJECTED/u);
  const manifest = document(); manifest.build.manifest[0].bytes += 1;
  assert.throws(() => validateGovernReviewerDenialPreparationEvidence(manifest), /BUILD_REJECTED/u);
  const traversal = document(); traversal.build.manifest[0].path = '../index.js';
  assert.throws(() => validateGovernReviewerDenialPreparationEvidence(traversal), /BUILD_REJECTED/u);
  const duplicate = document(); duplicate.build.manifest[1].path = duplicate.build.manifest[0].path;
  assert.throws(() => validateGovernReviewerDenialPreparationEvidence(duplicate), /BUILD_REJECTED/u);
  const raw = document(); raw.rawToken = 'eyJprivate.payload.signature';
  assert.throws(() => validateGovernReviewerDenialPreparationEvidence(raw), /DOCUMENT_REJECTED/u);
  const source = document(); source.source.files[0].path = 'scripts/substituted.mjs';
  assert.throws(() => validateGovernReviewerDenialPreparationEvidence(source), /SOURCE_REJECTED/u);
});
