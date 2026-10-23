import { isDeepStrictEqual } from 'node:util';

import { canonicalDigest } from './assessV1OracleEvidence.mjs';

export const GOVERN_REVIEWER_DENIAL_PREPARATION_SCHEMA = 'govern-reviewer-denial-preparation-v1';
export const GOVERN_REVIEWER_DENIAL_PREPARATION_WORKFLOW = 'Authenticated Product Acceptance Preparation';
export const GOVERN_REVIEWER_DENIAL_PREPARATION_JOB = 'connected-browser';
export const GOVERN_REVIEWER_DENIAL_SOURCE_PATHS = Object.freeze([
  'scripts/assessV1OracleEvidence.mjs',
  'scripts/governDisabledControlEvidence.mjs',
  'scripts/governDisabledControlRepro.spec.ts',
  'scripts/playwright.govern-disabled-control-repro.config.ts',
  'scripts/reproduceGovernDisabledControl.mjs',
  'scripts/v2FullPrefixReproduction.mjs',
  'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts',
  'tests/browser/enterpriseLifecycleAcceptance/governReviewerDenial.ts',
  'supabase/functions/_shared/assessV2ReviewCommand.ts',
  'tests/browser/authenticatedLifecycleHarness.ts',
  'tests/browser/authenticatedHostedNetwork.ts',
  'scripts/runEnterpriseLifecycleAcceptanceBrowser.mjs',
  'scripts/enterpriseLifecyclePostgresFixture.mjs',
  'components/assess-v2/AssessV2ReviewWorkspace.tsx',
  'playwright.enterprise-lifecycle-acceptance.config.ts',
  'vite.enterprise-lifecycle-acceptance.config.ts',
].sort());

const SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/u;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = code => { throw new Error(`GOVERN_REVIEWER_DENIAL_EVIDENCE_${code}`); };
const exactKeys = (value, keys, code) => {
  if (!record(value) || !isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort())) fail(code);
};
const nonNegative = value => Number.isSafeInteger(value) && value >= 0;
const validateBuild = value => {
  exactKeys(value, ['digest', 'fileCount', 'bytes', 'manifest'], 'BUILD_REJECTED');
  if (!Array.isArray(value.manifest) || value.manifest.length === 0) fail('BUILD_REJECTED');
  const manifest = value.manifest.map(item => {
    exactKeys(item, ['path', 'bytes', 'sha256'], 'BUILD_REJECTED');
    const segments = typeof item.path === 'string' ? item.path.split('/') : [];
    if (!item.path || item.path.length > 512 || item.path.includes('\\') || item.path.startsWith('/')
      || segments.some(segment => !segment || segment === '.' || segment === '..' || /[\u0000-\u001f]/u.test(segment))
      || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || !DIGEST.test(item.sha256 ?? '')) {
      fail('BUILD_REJECTED');
    }
    return Object.freeze({ path: item.path, bytes: item.bytes, sha256: item.sha256 });
  }).sort((left, right) => left.path.localeCompare(right.path));
  if (!isDeepStrictEqual(value.manifest, manifest)
    || new Set(manifest.map(item => item.path)).size !== manifest.length
    || value.fileCount !== manifest.length
    || value.bytes !== manifest.reduce((sum, item) => sum + item.bytes, 0)
    || value.digest !== canonicalDigest(manifest)) fail('BUILD_REJECTED');
  return Object.freeze({ digest: value.digest, fileCount: value.fileCount, bytes: value.bytes,
    manifest: Object.freeze(manifest) });
};

export function governReviewerDenialPreparationIdentity(environment, gitHead) {
  const value = {
    releaseSha: environment.RELEASE_SHA,
    runId: environment.GITHUB_RUN_ID,
    attempt: environment.GITHUB_RUN_ATTEMPT,
    workflow: environment.GITHUB_WORKFLOW,
    job: environment.GITHUB_JOB,
  };
  if (!SHA.test(value.releaseSha ?? '') || value.releaseSha !== environment.GITHUB_SHA || value.releaseSha !== gitHead
    || !POSITIVE_INTEGER.test(value.runId ?? '') || !POSITIVE_INTEGER.test(value.attempt ?? '')
    || value.workflow !== GOVERN_REVIEWER_DENIAL_PREPARATION_WORKFLOW
    || value.job !== GOVERN_REVIEWER_DENIAL_PREPARATION_JOB) fail('IDENTITY_REJECTED');
  return Object.freeze(value);
}

export function governReviewerDenialSource(sourceFiles) {
  if (!Array.isArray(sourceFiles) || sourceFiles.length !== GOVERN_REVIEWER_DENIAL_SOURCE_PATHS.length) {
    fail('SOURCE_REJECTED');
  }
  const normalized = sourceFiles.map(item => {
    exactKeys(item, ['path', 'sha256'], 'SOURCE_FILE_REJECTED');
    if (typeof item.path !== 'string' || !DIGEST.test(item.sha256)) fail('SOURCE_FILE_REJECTED');
    return Object.freeze({ path: item.path.replaceAll('\\', '/'), sha256: item.sha256 });
  }).sort((left, right) => left.path.localeCompare(right.path));
  if (!isDeepStrictEqual(normalized.map(item => item.path), GOVERN_REVIEWER_DENIAL_SOURCE_PATHS)) {
    fail('SOURCE_REJECTED');
  }
  return Object.freeze({ sourceDigest: canonicalDigest(normalized), files: Object.freeze(normalized) });
}

const validateBrowser = value => {
  exactKeys(value, ['project', 'status', 'prerequisite', 'reviewerDenial', 'independentResolution', 'mutation'],
    'BROWSER_REJECTED');
  if (!['chromium-desktop', 'pixel-7'].includes(value.project) || value.status !== 'passed') fail('BROWSER_REJECTED');
  exactKeys(value.prerequisite, ['mode', 'fixtureSessionPrimed', 'stages', 'approvalStatus', 'approvedStateVisible',
    'resolvedControlCount', 'governStateBeforeAttempt'], 'PREREQUISITE_REJECTED');
  if (value.prerequisite.mode !== 'actual-production-ui-and-handlers'
    || value.prerequisite.fixtureSessionPrimed !== true || value.prerequisite.approvalStatus !== 200
    || value.prerequisite.approvedStateVisible !== true || value.prerequisite.resolvedControlCount !== 11
    || value.prerequisite.governStateBeforeAttempt !== 'pending'
    || !isDeepStrictEqual(value.prerequisite.stages,
      ['author-create', 'author-draft', 'author-finalize', 'reviewer-assign', 'reviewer-attest', 'reviewer-approve'])) {
    fail('PREREQUISITE_REJECTED');
  }
  exactKeys(value.reviewerDenial, ['control', 'uiDisabled', 'status', 'errorCode', 'exactCurrentScope',
    'exactCurrentVersion', 'requestDigest', 'requestCount', 'zeroEffects'], 'DENIAL_REJECTED');
  if (value.reviewerDenial.control !== 'Resolve Govern controls' || value.reviewerDenial.uiDisabled !== true
    || value.reviewerDenial.status !== 403 || value.reviewerDenial.errorCode !== 'PERMISSION_DENIED'
    || value.reviewerDenial.exactCurrentScope !== true || value.reviewerDenial.exactCurrentVersion !== true
    || !DIGEST.test(value.reviewerDenial.requestDigest) || value.reviewerDenial.requestCount !== 1
    || value.reviewerDenial.zeroEffects !== true) fail('DENIAL_REJECTED');
  exactKeys(value.independentResolution, ['status', 'resolutionDelta'], 'RESOLUTION_REJECTED');
  exactKeys(value.independentResolution.resolutionDelta,
    ['reviewAssignments', 'governResolutions', 'commandReceipts', 'privilegedAudits'], 'RESOLUTION_REJECTED');
  if (value.independentResolution.status !== 200
    || !isDeepStrictEqual(value.independentResolution.resolutionDelta,
      { reviewAssignments: 0, governResolutions: 1, commandReceipts: 1, privilegedAudits: 1 })) {
    fail('RESOLUTION_REJECTED');
  }
  exactKeys(value.mutation, ['beforeHash', 'afterDenialHash', 'afterResolutionHash'], 'MUTATION_REJECTED');
  if (![value.mutation.beforeHash, value.mutation.afterDenialHash, value.mutation.afterResolutionHash]
    .every(item => DIGEST.test(item)) || value.mutation.beforeHash !== value.mutation.afterDenialHash
    || value.mutation.afterResolutionHash === value.mutation.afterDenialHash) fail('MUTATION_REJECTED');
  return Object.freeze(structuredClone(value));
};

export function validateGovernReviewerDenialPreparationEvidence(value) {
  exactKeys(value, ['schemaVersion', 'status', 'source', 'build', 'fixture', 'correctedTarget', 'reviewerAuthority',
    'approverAuthority', 'browsers', 'persisted', 'providers', 'scope', 'cleanup', 'acceptancePromoted'],
  'DOCUMENT_REJECTED');
  if (value.schemaVersion !== GOVERN_REVIEWER_DENIAL_PREPARATION_SCHEMA || value.status !== 'passed'
    || value.acceptancePromoted !== false) fail('DOCUMENT_REJECTED');
  exactKeys(value.source, ['releaseSha', 'runId', 'attempt', 'workflow', 'job', 'sourceDigest', 'files'],
    'SOURCE_REJECTED');
  const identity = governReviewerDenialPreparationIdentity({
    RELEASE_SHA: value.source.releaseSha,
    GITHUB_SHA: value.source.releaseSha,
    GITHUB_RUN_ID: value.source.runId,
    GITHUB_RUN_ATTEMPT: value.source.attempt,
    GITHUB_WORKFLOW: value.source.workflow,
    GITHUB_JOB: value.source.job,
  }, value.source.releaseSha);
  const source = governReviewerDenialSource(value.source.files);
  if (value.source.sourceDigest !== source.sourceDigest) fail('SOURCE_REJECTED');
  const build = validateBuild(value.build);
  exactKeys(value.fixture, ['hostedPersonaRoleParity', 'providersEnabled', 'syntheticOnly', 'loopbackOnly'],
    'FIXTURE_REJECTED');
  if (!isDeepStrictEqual(value.fixture, { hostedPersonaRoleParity: true, providersEnabled: false,
    syntheticOnly: true, loopbackOnly: true })) fail('FIXTURE_REJECTED');
  exactKeys(value.correctedTarget, ['execution', 'prerequisite', 'canonicalScenarioSharedHelperExecuted',
    'sourceBindings', 'helperTimeoutMs', 'desktopAndPixelPassed'], 'TARGET_REJECTED');
  exactKeys(value.correctedTarget.sourceBindings, ['observeApiResponse', 'reviewerGovernDenial'], 'TARGET_REJECTED');
  if (value.correctedTarget.execution !== 'shared-canonical-helper-using-actual-production-ui-and-handlers'
    || value.correctedTarget.prerequisite !== 'actual-production-ui-author-finalize-reviewer-assign-attest-approve'
    || value.correctedTarget.canonicalScenarioSharedHelperExecuted !== true
    || !Object.values(value.correctedTarget.sourceBindings).every(item => DIGEST.test(item))
    || value.correctedTarget.helperTimeoutMs !== 15_000 || value.correctedTarget.desktopAndPixelPassed !== true) {
    fail('TARGET_REJECTED');
  }
  exactKeys(value.reviewerAuthority, ['required', 'requiredPresent', 'forbidden', 'forbiddenAbsent'],
    'AUTHORITY_REJECTED');
  if (!isDeepStrictEqual(value.reviewerAuthority.required,
    ['assess.v2.read', 'assess.v2.review', 'assess.v2.evidence.attest', 'assess.v2.approve'])
    || value.reviewerAuthority.requiredPresent !== true
    || value.reviewerAuthority.forbidden !== 'assess.v2.govern.resolve'
    || value.reviewerAuthority.forbiddenAbsent !== true) fail('AUTHORITY_REJECTED');
  exactKeys(value.approverAuthority, ['required', 'requiredPresent'], 'AUTHORITY_REJECTED');
  if (value.approverAuthority.required !== 'assess.v2.govern.resolve'
    || value.approverAuthority.requiredPresent !== true) fail('AUTHORITY_REJECTED');
  if (!Array.isArray(value.browsers) || value.browsers.length !== 2) fail('BROWSERS_REJECTED');
  const browsers = value.browsers.map(validateBrowser).sort((left, right) => left.project.localeCompare(right.project));
  if (!isDeepStrictEqual(browsers.map(item => item.project), ['chromium-desktop', 'pixel-7'])) fail('BROWSERS_REJECTED');
  exactKeys(value.persisted, ['governResolutions', 'governReceipts', 'governAudits'], 'PERSISTED_REJECTED');
  if (!Object.values(value.persisted).every(nonNegative) || !Object.values(value.persisted)
    .every(count => count === browsers.length)) fail('PERSISTED_REJECTED');
  exactKeys(value.providers, ['enabled', 'calls', 'paidCalls'], 'PROVIDERS_REJECTED');
  if (!isDeepStrictEqual(value.providers, { enabled: false, calls: 0, paidCalls: 0 })) fail('PROVIDERS_REJECTED');
  exactKeys(value.scope, ['fullAcceptanceRun', 'studioProviderGenerationRun'], 'SCOPE_REJECTED');
  if (!isDeepStrictEqual(value.scope, { fullAcceptanceRun: false, studioProviderGenerationRun: false })) {
    fail('SCOPE_REJECTED');
  }
  exactKeys(value.cleanup, ['fixtureListenerClosedAndDatabaseRemoved', 'previewProcessExited', 'ownedBuildRemoved',
    'sourcesUnchanged'], 'CLEANUP_REJECTED');
  if (!Object.values(value.cleanup).every(item => item === true)) fail('CLEANUP_REJECTED');
  const serialized = JSON.stringify(value);
  if (serialized.length > 64 * 1024 || /Bearer\s|eyJ[a-zA-Z0-9_-]*[.]|service[_-]?role|database[_-]?url|authorization/iu
    .test(serialized)) fail('PRIVACY_REJECTED');
  return Object.freeze({ ...structuredClone(value), source: Object.freeze({ ...identity, sourceDigest: source.sourceDigest,
    files: source.files }), build, browsers: Object.freeze(browsers) });
}
