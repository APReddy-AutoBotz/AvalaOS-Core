import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium, devices, expect } from '@playwright/test';

import {
  CONTROLLED_HUMAN_CATALOG,
  CONTROLLED_HUMAN_EXECUTION_ORDER,
  CONTROLLED_HUMAN_SERVER_ACTIONS,
  HUMAN_DUTY_BY_PERSONA,
  PREVIEW_ORIGIN,
  canonicalJson,
  sha256Digest,
} from './prCControlledHumanEvidenceContract.mjs';
import {
  PR_BRANCH,
  SYNTHETIC_PERSONA_ORDER,
  SYNTHETIC_WORKFLOW_JOB,
  SYNTHETIC_WORKFLOW_PATH,
  requiredSyntheticBrowserAssertionId,
} from './prCSyntheticAcceptanceEvidence.mjs';
import {
  deriveSyntheticApplicationActorDigest,
  deriveSyntheticApplicationSessionDigest,
} from './prCSyntheticIdentity.mjs';
import { attachSyntheticBrowserApi } from './prCSyntheticBrowserApi.mjs';
import {
  runSyntheticPrerequisites, readSyntheticDeliveryWorkspace, readSyntheticDeliveryPackage,
  readSyntheticStudioArtifact, readSyntheticStudioBundleBinding, syntheticCommandResourceId, resolveSyntheticStudioReviewerId,
} from './prCSyntheticBrowserPrerequisites.mjs';
import {
  prepareSyntheticStudioGeneration, selectSyntheticDeliveryArtifact,
  verifySyntheticDeliveryLineage, verifySyntheticMonitorBaseline,
  verifySyntheticStudioApprovalHasNoDeliveryResource, verifySyntheticAssessHandoffReady,
  verifySyntheticBlockedPackageMonitorUnchanged, verifySyntheticReadOnlyMonitorHistory,
  waitForSyntheticDeliveryWorkspace, selectSyntheticDeliveryPackage,
} from './prCSyntheticBrowserControls.mjs';
import {
  isSyntheticApiEvidenceStep, buildSyntheticApiEvidenceDescriptor, executeSyntheticApiEvidenceAction,
} from './prCSyntheticBrowserEvidenceActions.mjs';
import { executeSyntheticResponseLoss } from './prCSyntheticBrowserResponseLoss.mjs';

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const PERSONA_KEYS = Object.freeze([...SYNTHETIC_PERSONA_ORDER]);
const SERVER_STEP_KEYS = new Set(CONTROLLED_HUMAN_SERVER_ACTIONS.map(record => `${record.checkpointId}:${record.stepId}`));
const CATALOG_BY_CHECKPOINT = new Map(CONTROLLED_HUMAN_CATALOG.map(record => [record.checkpointId, record]));
const SERVER_ACTION_BY_STEP = new Map(CONTROLLED_HUMAN_SERVER_ACTIONS.map(record => [`${record.checkpointId}:${record.stepId}`, record]));
const SYNTHETIC_SEED = JSON.parse(readFileSync(new URL('../testing/process-lifecycle/fixtures/delivery-monitor-pr-c/controlled-human-environment.json', import.meta.url), 'utf8')).seed;
const SYNTHETIC_TRANSCRIPT_LABELS = SYNTHETIC_SEED.transcriptSets;
const SYNTHETIC_GOVERNED_ITEM_COUNT = SYNTHETIC_SEED.assessedStudioArtifact.sectionCount;
assert(Number.isSafeInteger(SYNTHETIC_GOVERNED_ITEM_COUNT) && SYNTHETIC_GOVERNED_ITEM_COUNT > 1 && SYNTHETIC_GOVERNED_ITEM_COUNT <= 100, 'PR_C_SYNTHETIC_BROWSER_GOVERNED_FIXTURE_COUNT');
const SYNTHETIC_STUDIO_DRAFT_TITLE = 'Synthetic Studio transcript draft';
const SYNTHETIC_STUDIO_DRAFT_INITIAL_BODY = 'Synthetic Studio source context retained for controlled acceptance editing.';
const SYNTHETIC_STUDIO_DRAFT_SECTION_BODY = `${SYNTHETIC_STUDIO_DRAFT_INITIAL_BODY}\nSynthetic acceptance edit.`;
const SYNTHETIC_HYBRID_SECTION_BODY = 'SYNTHETIC CONTROLLED-HUMAN TEST OUTPUT — NOT CUSTOMER OR PROVIDER CONTENT';
const SYNTHETIC_RECOVERY_PACKAGE_LABEL = 'Synthetic blocked recovery package for controlled response-loss verification.';
const SYNTHETIC_RECOVERY_ITEM_TITLE = 'Synthetic blocked recovery item';
const SYNTHETIC_MANUAL_ITEM_TITLE = 'Synthetic governed delivery';
const SYNTHETIC_REVISED_ITEM_TITLE = 'Synthetic governed work item revision · synthetic blocker resolved';

const SURFACE_BY_CHECKPOINT = Object.freeze({
  'CH-01': 'assess', 'CH-02': 'studio', 'CH-03': 'studio', 'CH-04': 'delivery',
  'CH-05': 'delivery', 'CH-06': 'delivery', 'CH-07': 'delivery', 'CH-08': 'delivery',
  'CH-09': 'monitor', 'CH-10': 'studio', 'CH-11': 'delivery', 'CH-12': 'delivery',
  'CH-13': 'delivery', 'CH-14': 'delivery',
});

const NAVIGATION_PATHS = Object.freeze({
  assess: ['Assess', 'Enterprise Intelligence'],
  'assess-case': ['Assess'],
  'assess-review': ['Assess'],
  studio: ['Studio', 'Create / Governed Sources'],
  'studio-docs': ['Studio', 'Create / Governed Sources'],
  delivery: ['Delivery'],
  monitor: ['Monitor'],
});

const TAB_LABELS = Object.freeze({
  assess: ['Source Library'],
  studio: [],
  'studio-docs': [],
  delivery: ['Work Package'],
  monitor: ['Monitor Baseline'],
});

const TAB_BY_STEP = Object.freeze({
  'select-two-assess-transcripts': 'Source Library',
  'resolve-material-assess-conflict': 'Candidate Review',
});

const ACTION_LABELS = Object.freeze({
  'transcript.assess.conflict.resolve': ['Choose first candidate'],
  'assessment_v2.review.resolve': ['Approve reviewed decision'],
  'studio.artifact.review.resolve': ['Approve review'],
  'studio.artifact.approval.resolve': ['Final approve'],
  'handoff.request': ['Request handoff'],
  'handoff.review.resolve': ['Approve review', 'Review handoff'],
  'handoff.approval.resolve': ['Final accept'],
  'handoff.consume': ['Start Studio draft'],
  'pr_c.controlled_human.synthetic_studio_generate': ['Generate synthetic controlled-human draft'],
  'delivery.handoff.request': ['Request handoff'],
  'delivery.handoff.review.resolve': ['Approve review', 'Request changes', 'Reject request'],
  'delivery.handoff.approval.resolve': ['Final handoff approval', 'Approve handoff'],
  'delivery.handoff.consume': ['Start Delivery draft'],
  'delivery.item.review': ['Edit immutable descendant', 'Accept proposal'],
  'delivery.package.revision.commit': ['Submit resolved package', 'Commit revision'],
  'delivery.package.review.resolve': ['Approve package review', 'Request package changes'],
  'delivery.package.approval.resolve': ['Final package approval'],
  'monitor.baseline.create': ['Create read-only Monitor baseline'],
  'studio.source-package.create': ['Create direct planning package'],
  'delivery.package.create.manual': ['Create manual planning package'],
  'delivery.workspace.projection': ['Work Package'],
});

const ACTION_LABEL_OVERRIDES = Object.freeze({
  'CH-04:request-handoff-changes': ['Request changes'],
  'CH-04:reject-new-exact-handoff-request': ['Reject request', 'Reject handoff'],
  'CH-05:review-handoff-independently': ['Approve review'],
  'CH-06:edit-one-item-with-rationale': ['Edit immutable descendant'],
  'CH-06:decide-every-current-proposal': ['Accept all current proposals', 'Accept proposal'],
  'CH-07:request-package-changes': ['Request package changes', 'Request changes'],
  'CH-07:decide-revised-descendant': ['Accept proposal'],
  'CH-07:review-complete-revised-package': ['Approve package review'],
  'CH-13:simulate-response-loss': ['Submit resolved package', 'Commit revision'],
});

// Each browser-only step names one exact application control or state. Candidate
// alternatives account for the same production component appearing on different
// responsive surfaces; a generic page/body match is intentionally unsupported.
const BROWSER_ASSERTION_PLANS = Object.freeze({
  'select-two-assess-transcripts': { kind: 'assess-source-selection' },
  'complete-remaining-assess-fields-manually': { kind: 'complete-assess-fields' },
  'decline-studio-handoff': { kind: 'disabled-control', role: 'button', names: ['Create durable Studio handoff'] },
  'verify-no-studio-resource': { kind: 'text', values: ['Studio handoff not ready'], all: true },
  'select-two-different-studio-transcripts': { kind: 'studio-source-selection' },
  'select-custom-template': { kind: 'select', labels: ['Exact approved Studio template'], option: 'Synthetic controlled-human requirements template' },
  'edit-structured-document': { kind: 'edit-structured-document' },
  'stop-with-no-delivery-resource': { kind: 'exact-studio-stop' },
  'verify-approved-assess-handoff-ready': { kind: 'exact-assess-handoff-ready' },
  'add-disjoint-studio-supplements': { kind: 'studio-source-selection' },
  'preview-approved-studio-handoff': { kind: 'activate-text', values: [`Server-derived handoff preview · ${SYNTHETIC_GOVERNED_ITEM_COUNT} items`], outcome: ['Server-bound proposal integrity verified.'] },
  'verify-request-creates-no-delivery-package': { kind: 'package-count-unchanged', stateKey: 'before-request' },
  'verify-changes-create-no-target-draft': { kind: 'package-count-unchanged', stateKey: 'before-changes' },
  'verify-rejection-creates-no-target-draft': { kind: 'package-count-unchanged', stateKey: 'before-rejection' },
  'verify-replay-created-no-second-package': { kind: 'package-count-unchanged', stateKey: 'before-consumption-replay' },
  'inspect-deterministic-item-citations': { kind: 'delivery-citations' },
  'compare-immutable-descendant-history': { kind: 'delivery-item-history', outcome: ['Changed fields: title, description'] },
  'verify-complete-bounded-item-set': { kind: 'delivery-complete-set' },
  'verify-monitor-unchanged-while-blocked': { kind: 'exact-blocked-monitor-boundary' },
  'verify-replay-same-baseline': { kind: 'baseline-count', stateKey: 'baseline-after-create' },
  'verify-replay-created-no-second-baseline': { kind: 'baseline-count', stateKey: 'baseline-after-create' },
  'compare-enterprise-and-primary-monitor': { kind: 'monitor-parity' },
  'verify-minimized-baseline-parity': { kind: 'testid', testId: 'canonical-monitor-baselines' },
  'verify-no-hashes-or-approval-identities': { kind: 'privacy' },
  'verify-no-monitor-mutation-controls': { kind: 'monitor-control-absence' },
  'verify-legacy-metrics-non-authoritative': { kind: 'primary-monitor-legacy' },
  'verify-direct-plan-remains-not-assessed': { kind: 'exact-planning-baseline', manual: false },
  'verify-manual-path-remains-not-assessed': { kind: 'exact-planning-baseline', manual: true },
  'verify-zero-negative-side-effects': { kind: 'package-count-unchanged', stateKey: 'before-negative-attempts' },
  'reload-and-reconcile-one-effect': { kind: 'control-and-text', role: 'button', names: ['Reload committed state'], values: ['Committed server state loaded.'] },
  'verify-history-readable-and-actions-absent': { kind: 'read-only-history' },
  'desktop-chrome-journey': { kind: 'viewport', width: 1280, height: 720 },
  'pixel-7-journey': { kind: 'viewport', width: 412, height: 915 },
  'zoom-200-percent': { kind: 'zoom', value: 2 },
  'keyboard-only-handoff': { kind: 'keyboard-reachability', role: 'button', names: ['Request handoff'] },
  'keyboard-only-item-edit': { kind: 'keyboard-reachability', role: 'button', names: ['Edit immutable descendant'] },
  'focused-rationale-error-summary': { kind: 'focused-alert' },
  'preserve-invalid-input': { kind: 'preserved-input', label: 'Item title' },
  'logical-focus-return': { kind: 'focus-return', role: 'button', names: ['Edit immutable descendant'] },
  'non-color-status-and-citation-cues': { kind: 'authorized-status-and-citation' },
  'verify-no-horizontal-overflow': { kind: 'layout' },
});

const SAFE_PROVIDER_HOSTS = Object.freeze([
  /(^|\.)api\.openai\.com$/iu,
  /(^|\.)anthropic\.com$/iu,
  /(^|\.)generativelanguage\.googleapis\.com$/iu,
  /(^|\.)api\.groq\.com$/iu,
  /(^|\.)cohere\.ai$/iu,
]);

const digest = value => sha256Digest(Buffer.from(typeof value === 'string' ? value : canonicalJson(value), 'utf8'));
const iso = () => new Date().toISOString();
const safeLabel = value => String(value).toLowerCase().replace(/[^a-z0-9._:-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 128);

// Product navigation carries process and scope identifiers in the query string.
// Evidence needs only the non-identifying view and scope to identify the surface.
export const safeBrowserRoute = pageUrl => {
  const location = new URL(pageUrl);
  assert(/^\/[a-z0-9/_-]{0,120}$/u.test(location.pathname), 'PR_C_SYNTHETIC_BROWSER_PATH_REJECTED');
  const navigation = new URLSearchParams();
  for (const key of ['view', 'scope']) {
    const value = location.searchParams.get(key);
    if (value === null) continue;
    assert(/^[a-z_]{1,40}$/u.test(value), `PR_C_SYNTHETIC_BROWSER_NAVIGATION_REJECTED:${key}`);
    navigation.set(key, value);
  }
  const search = navigation.toString();
  const route = `${location.pathname}${search ? `?${search}` : ''}`;
  assert(/^\/[a-z0-9/_?=&.-]{0,255}$/u.test(route), 'PR_C_SYNTHETIC_BROWSER_ROUTE_REJECTED');
  return route;
};

export const safeBrowserStepFailure = (planned, error) => {
  const message = String(error?.message ?? '');
  const safeCode = /^(PR_C_SYNTHETIC_(?:BROWSER|PREREQUISITE|RESPONSE_LOSS)_[A-Z0-9_]+)(?::|\r?\n|$)/u.exec(message)?.[1];
  const timeoutKind = /page\.waitForLoadState: Timeout [0-9]+ms exceeded/u.test(message) ? 'LOAD_STATE_TIMEOUT'
    : /page\.waitForFunction: Timeout [0-9]+ms exceeded/u.test(message) ? 'PREDICATE_TIMEOUT'
      : /(?:locator\.[A-Za-z]+|TimeoutError): Timeout [0-9]+ms exceeded/u.test(message) ? 'LOCATOR_TIMEOUT' : 'BROWSER_ERROR';
  const diagnostic = safeCode ?? timeoutKind;
  return new Error(`PR_C_SYNTHETIC_BROWSER_STEP_REJECTED:${planned.checkpointId}:${planned.stepId}:${diagnostic}`);
};

const parseArguments = argv => {
  const parsed = { output: '', input: '', preparation: '', stateDirectory: '', headed: false, phase: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--headed') parsed.headed = true;
    else if (['--output', '--input', '--preparation', '--phase', '--state-directory'].includes(value)) {
      const key = value === '--state-directory' ? 'stateDirectory' : value.slice(2);
      parsed[key] = argv[++index] ?? '';
    }
    else throw new Error(`PR_C_SYNTHETIC_BROWSER_ARGUMENT_REJECTED:${value}`);
  }
  if (!parsed.output) throw new Error('PR_C_SYNTHETIC_BROWSER_OUTPUT_REQUIRED');
  if (!['active', 'read-only'].includes(parsed.phase)) throw new Error('PR_C_SYNTHETIC_BROWSER_PHASE_REQUIRED');
  if (parsed.phase === 'read-only' && !parsed.input) throw new Error('PR_C_SYNTHETIC_BROWSER_INPUT_REQUIRED');
  if (!parsed.stateDirectory) parsed.stateDirectory = path.join(path.dirname(path.resolve(parsed.output)), 'browser-storage-private');
  return parsed;
};

export const deterministicPersonaEmail = (personaKey, exerciseDigest) => {
  assert(PERSONA_KEYS.includes(personaKey), 'PR_C_SYNTHETIC_BROWSER_PERSONA_REJECTED');
  assert(DIGEST.test(exerciseDigest), 'PR_C_SYNTHETIC_BROWSER_EXERCISE_REJECTED');
  return `prc264.${personaKey}.${exerciseDigest.slice(7, 19)}@example.invalid`;
};

export const parsePasswordBundle = value => {
  let bundle;
  try { bundle = JSON.parse(value); } catch { throw new Error('PR_C_SYNTHETIC_BROWSER_PASSWORD_BUNDLE_REJECTED'); }
  assert(bundle && typeof bundle === 'object' && !Array.isArray(bundle), 'PR_C_SYNTHETIC_BROWSER_PASSWORD_BUNDLE_REJECTED');
  assert.deepEqual(Object.keys(bundle).sort(), [...PERSONA_KEYS].sort(), 'PR_C_SYNTHETIC_BROWSER_PASSWORD_BUNDLE_REJECTED');
  const passwords = Object.values(bundle);
  assert(passwords.every(password => typeof password === 'string' && password.length >= 16 && password.length <= 128), 'PR_C_SYNTHETIC_BROWSER_PASSWORD_BUNDLE_REJECTED');
  assert.equal(new Set(passwords).size, passwords.length, 'PR_C_SYNTHETIC_BROWSER_PASSWORD_REUSE_REJECTED');
  return bundle;
};

export const deriveBrowserIdentityDigests = ({ exerciseDigest, personaKey, authUserId, sessionId }) => Object.freeze({
  applicationActorDigest: deriveSyntheticApplicationActorDigest({ exerciseDigest, personaKey, authUserId }),
  applicationSessionDigest: deriveSyntheticApplicationSessionDigest({ exerciseDigest, personaKey, sessionId }),
});

export const assertResumedIdentity = (expected, actual, personaKey) => {
  assert.deepEqual(actual, expected, `PR_C_SYNTHETIC_BROWSER_RESUME_IDENTITY_REJECTED:${personaKey}`);
  return actual;
};

const exactEnvironment = (env, preparation) => {
  const exactHead = env.PR_C_CONTROLLED_HUMAN_RELEASE_SHA ?? env.PR_C_SYNTHETIC_ACCEPTANCE_RELEASE_SHA;
  const exerciseDigest = env.PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST ?? env.PR_C_SYNTHETIC_ACCEPTANCE_EXERCISE_DIGEST;
  const previewOrigin = env.PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN ?? env.PR_C_SYNTHETIC_ACCEPTANCE_DEPLOY_ORIGIN;
  const passwordBundle = env.PR_C_SYNTHETIC_ACCEPTANCE_PASSWORD_BUNDLE_JSON ?? env.PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_JSON;
  assert(SHA.test(exactHead ?? ''), 'PR_C_SYNTHETIC_BROWSER_HEAD_REJECTED');
  assert(DIGEST.test(exerciseDigest ?? ''), 'PR_C_SYNTHETIC_BROWSER_EXERCISE_REJECTED');
  assert.equal(previewOrigin, PREVIEW_ORIGIN, 'PR_C_SYNTHETIC_BROWSER_PREVIEW_REJECTED');
  const deployId = env.PR_C_CONTROLLED_HUMAN_DEPLOY_ID ?? env.PR_C_SYNTHETIC_ACCEPTANCE_DEPLOY_ID;
  const targetFingerprint = env.PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT ?? env.PR_C_SYNTHETIC_ACCEPTANCE_TARGET_FINGERPRINT;
  const publicTargetDigest = env.PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST ?? env.PR_C_SYNTHETIC_ACCEPTANCE_PUBLIC_TARGET_DIGEST;
  const verified = preparation?.attestation ?? preparation ?? {};
  const personaManifestDigest = verified.personaManifestDigest ?? env.PR_C_SYNTHETIC_ACCEPTANCE_PERSONA_MANIFEST_DIGEST;
  const fixtureManifestDigest = verified.fixtureManifestDigest ?? env.PR_C_SYNTHETIC_ACCEPTANCE_FIXTURE_MANIFEST_DIGEST;
  const runId = env.GITHUB_RUN_ID;
  const runAttempt = Number(env.GITHUB_RUN_ATTEMPT);
  assert(/^[0-9a-f]{24}$/u.test(deployId ?? ''), 'PR_C_SYNTHETIC_BROWSER_DEPLOY_REJECTED');
  for (const [name, value] of Object.entries({ targetFingerprint, publicTargetDigest, personaManifestDigest, fixtureManifestDigest }))
    assert(DIGEST.test(value ?? ''), `PR_C_SYNTHETIC_BROWSER_${name.toUpperCase()}_REJECTED`);
  assert(/^[1-9][0-9]{0,19}$/u.test(runId ?? '') && Number.isSafeInteger(runAttempt) && runAttempt > 0, 'PR_C_SYNTHETIC_BROWSER_RUN_REJECTED');
  if (preparation) {
    assert(verified.releaseSha === exactHead && verified.reviewHeadSha === exactHead && verified.deployId === deployId && verified.deployOrigin === previewOrigin
      && verified.exerciseDigest === exerciseDigest && verified.targetFingerprint === targetFingerprint && verified.publicTargetDigest === publicTargetDigest
      && verified.migrationTip === '20260928060000' && verified.productionAuthorized === false && verified.customerDataAuthorized === false
      && verified.realProviderCallsAuthorized === false, 'PR_C_SYNTHETIC_BROWSER_PREPARATION_BINDING_REJECTED');
  }
  const binding = {
    repository: 'APReddy-AutoBotz/AvalaOS-Core', prNumber: 264, branch: PR_BRANCH, exactHead,
    preview: { origin: previewOrigin, deployId, releaseSha: exactHead, environment: 'hosted_nonproduction_pilot', context: 'deploy-preview', reviewId: 264, siteName: 'avalaos-pilot' },
    backend: { exerciseDigest, targetFingerprint, publicTargetDigest, personaManifestDigest, fixtureManifestDigest, migrationTip: '20260928060000' },
    producer: { workflowPath: SYNTHETIC_WORKFLOW_PATH, job: SYNTHETIC_WORKFLOW_JOB, event: 'workflow_dispatch', runId, runAttempt, owner: 'APReddy-AutoBotz' },
  };
  return { exactHead, exerciseDigest, previewOrigin, passwords: parsePasswordBundle(passwordBundle ?? ''), binding,
    personaAuthorizationVersions: preparation?.personaAuthorizationVersions };
};

const waitForUsablePage = async page => {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('body').waitFor({ state: 'visible', timeout: 20_000 });
  const blocked = page.getByTestId('controlled-human-environment-blocked');
  if (await blocked.count()) throw new Error('PR_C_SYNTHETIC_BROWSER_PREVIEW_BINDING_BLOCKED');
};

const firstVisible = async locators => {
  for (const locator of locators) if (await locator.count() && await locator.first().isVisible()) return locator.first();
  return null;
};

const clickFirstLabel = async (page, labels, interactionSequence, required = true) => {
  for (const label of labels) {
    const locator = await firstVisible([
      page.getByRole('button', { name: label, exact: true }),
      page.getByRole('link', { name: label, exact: true }),
      page.getByRole('tab', { name: label, exact: true }),
    ]);
    if (!locator) continue;
    await locator.click();
    interactionSequence.push(`activate:${safeLabel(label)}`);
    return label;
  }
  if (required) throw new Error(`PR_C_SYNTHETIC_BROWSER_CONTROL_MISSING:${labels.join('|')}`);
  return null;
};

const exactEnabledControl = async (page, role, labels, errorKey) => {
  const matches = [];
  for (const label of labels) {
    const controls = page.getByRole(role, { name: label, exact: true });
    for (let index = 0; index < await controls.count(); index += 1) {
      const control = controls.nth(index);
      if (await control.isVisible() && await control.isEnabled()) matches.push({ control, label });
    }
  }
  assert.equal(matches.length, 1, `PR_C_SYNTHETIC_BROWSER_EXACT_ENABLED_CONTROL_COUNT:${errorKey}:${matches.length}`);
  return matches[0];
};

const actionRoot = (page, action) => action.startsWith('handoff.')
  ? page.locator('section[aria-labelledby="studio-handoff-title"]')
  : action.startsWith('studio.artifact.') || action === 'pr_c.controlled_human.synthetic_studio_generate' || action === 'studio.source-package.create'
    ? page.getByTestId('studio-artifact-workspace')
    : action === 'transcript.assess.conflict.resolve'
      ? page.locator('section[aria-labelledby="transcript-candidate-review-title"]')
      : action === 'assessment_v2.review.resolve'
        ? page.getByTestId('assess-v2-review-workspace')
        : action.startsWith('delivery.') || action === 'monitor.baseline.create'
          ? page.getByTestId('governed-delivery-workspace')
          : page;

const STUDIO_HANDOFF_STEP_TARGETS = Object.freeze({
  'CH-03:request-studio-handoff': { tab: 'Inbox', resource: /^Accepted Assess handoff v([1-9][0-9]*) · source v\1$/u, state: 'eligible' },
  'CH-03:review-studio-handoff': { tab: 'Inbox', resource: /^Assess BRD handoff v1 · v1$/u, state: 'reviewer ready' },
  'CH-03:approve-studio-handoff': { tab: 'Inbox', resource: /^Assess BRD handoff v2 · v2$/u, state: 'approval ready' },
  'CH-03:accept-studio-handoff': { tab: 'Outbox', resource: /^Assess BRD handoff v3 · v3$/u, state: 'approved' },
});

export const exactStudioHandoffAction = async (page, interactionSequence, { tab, resource, state, button, handoffId = '', upstreamHandoffId = '' }) => {
  const center = page.locator('section[aria-labelledby="studio-handoff-title"]');
  await center.waitFor({ state: 'visible' });
  const tabControl = center.getByRole('tab', { name: new RegExp(`^${tab} \\([0-9]+\\)$`, 'u') });
  assert.equal(await tabControl.count(), 1, `PR_C_SYNTHETIC_BROWSER_STUDIO_HANDOFF_TAB_COUNT:${tab}`);
  await tabControl.click();
  interactionSequence.push(`tab:studio-handoff-${tab.toLowerCase()}`);
  const cards = center.getByRole('tabpanel').getByRole('listitem');
  const matches = [];
  for (let index = 0; index < await cards.count(); index += 1) {
    const card = cards.nth(index);
    if (handoffId && await card.getAttribute('data-handoff-id') !== handoffId) continue;
    if (upstreamHandoffId && await card.getAttribute('data-upstream-handoff-id') !== upstreamHandoffId) continue;
    const resourceMatches = await card.getByText(resource, { exact: true }).count() === 1;
    const stateMatches = await card.getByText(state, { exact: true }).count() === 1;
    if (resourceMatches && stateMatches) matches.push(card);
  }
  assert.equal(matches.length, 1, `PR_C_SYNTHETIC_BROWSER_STUDIO_HANDOFF_RESOURCE_COUNT:${safeLabel(button)}:${matches.length}`);
  const control = matches[0].getByRole('button', { name: button, exact: true });
  assert.equal(await control.count(), 1, 'PR_C_SYNTHETIC_BROWSER_STUDIO_HANDOFF_CONTROL_COUNT');
  // The workspace and bundle selector render before the retained artifact read
  // finishes. Wait for this exact authorized control, without choosing another
  // handoff or treating a disabled/missing action as successful.
  await matches[0].getByRole('button', { name: button, exact: true, disabled: false })
    .waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_STUDIO_HANDOFF_CONTROL_NOT_READY'); });
  const exact = await exactEnabledControl(matches[0], 'button', [button], `studio-handoff:${safeLabel(button)}`);
  return { card: matches[0], control: exact.control, label: exact.label };
};

export const signIn = async ({ page, personaKey, password, exerciseDigest, previewOrigin }) => {
  await page.goto(`${previewOrigin}/sign-in`, { waitUntil: 'domcontentloaded' });
  await waitForUsablePage(page);
  const email = deterministicPersonaEmail(personaKey, exerciseDigest);
  await page.getByLabel(/work email|email/iu).first().fill(email);
  await page.getByLabel(/password/iu).first().fill(password);
  await page.getByRole('button', { name: /sign in|continue to workspace/iu }).first().click();
  const signInOutcome = await (await page.waitForFunction(() => {
    const form = document.querySelector('input[type="password"]')?.closest('form');
    if (!form) return 'signed_in';
    if (form.querySelector('[role="alert"]')) return 'rejected';
    return null;
  }, undefined, { timeout: 30_000 })).jsonValue();
  assert.equal(signInOutcome, 'signed_in', `PR_C_SYNTHETIC_BROWSER_SIGN_IN_REJECTED:${personaKey}`);
  await page.getByTestId('controlled-human-nonproduction-banner').waitFor({ state: 'visible', timeout: 30_000 });
  const identity = await page.evaluate(() => {
    const visit = value => {
      if (!value || typeof value !== 'object') return null;
      if (typeof value.access_token === 'string' && typeof value.user?.id === 'string') {
        try {
          const encoded = value.access_token.split('.')[1];
          const payload = JSON.parse(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')));
          if (payload.sub === value.user.id && typeof payload.session_id === 'string') return { authUserId: payload.sub, sessionId: payload.session_id };
        } catch { return null; }
      }
      for (const child of Object.values(value)) { const found = visit(child); if (found) return found; }
      return null;
    };
    for (let index = 0; index < localStorage.length; index += 1) {
      const raw = localStorage.getItem(localStorage.key(index));
      if (!raw) continue;
      try { const found = visit(JSON.parse(raw)); if (found) return found; } catch { /* unrelated application state */ }
    }
    return null;
  });
  assert(identity?.authUserId && identity?.sessionId, `PR_C_SYNTHETIC_BROWSER_SESSION_MISSING:${personaKey}`);
  return deriveBrowserIdentityDigests({ exerciseDigest, personaKey, authUserId: identity.authUserId, sessionId: identity.sessionId });
};

const readCurrentIdentity = async (page, personaKey, exerciseDigest) => {
  const identity = await page.evaluate(() => {
    const visit = value => {
      if (!value || typeof value !== 'object') return null;
      if (typeof value.access_token === 'string' && typeof value.user?.id === 'string') {
        try {
          const encoded = value.access_token.split('.')[1];
          const payload = JSON.parse(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')));
          if (payload.sub === value.user.id && typeof payload.session_id === 'string') return { authUserId: payload.sub, sessionId: payload.session_id };
        } catch { return null; }
      }
      for (const child of Object.values(value)) { const found = visit(child); if (found) return found; }
      return null;
    };
    for (let index = 0; index < localStorage.length; index += 1) {
      const raw = localStorage.getItem(localStorage.key(index));
      if (!raw) continue;
      try { const found = visit(JSON.parse(raw)); if (found) return found; } catch { /* unrelated application state */ }
    }
    return null;
  });
  assert(identity, `PR_C_SYNTHETIC_BROWSER_RESUME_SESSION_MISSING:${personaKey}`);
  return deriveBrowserIdentityDigests({ exerciseDigest, personaKey, authUserId: identity.authUserId, sessionId: identity.sessionId });
};

const openProductNavigation = async page => {
  // After reload the authenticated shell can mount after DOMContentLoaded.
  // Mobile navigation is inert until its opener is activated, so wait for the
  // shell element before probing the opener, not for its hidden ARIA subtree.
  await page.locator('#primary-navigation').waitFor({ state: 'attached', timeout: 20_000 })
    .catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_NAVIGATION_SHELL_MISSING'); });
  const opener = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await opener.count() && await opener.isVisible()) await opener.click();
  const sidebar = page.getByRole('navigation', { name: 'Product lifecycle' });
  await sidebar.waitFor({ state: 'visible' });
  return sidebar;
};

const navigateProductPath = async (page, labels, interactionSequence) => {
  for (const label of labels) {
    const sidebar = await openProductNavigation(page);
    const control = sidebar.getByRole('button', { name: label, exact: true });
    await control.waitFor({ state: 'visible' }).catch(() => { throw new Error(`PR_C_SYNTHETIC_BROWSER_NAVIGATION_MISSING:${safeLabel(label)}`); });
    assert(await control.isEnabled(), `PR_C_SYNTHETIC_BROWSER_NAVIGATION_DISABLED:${safeLabel(label)}`);
    await control.click();
    interactionSequence.push(`navigate:${safeLabel(label)}`);
    await waitForUsablePage(page);
  }
};

export const openSurface = async (page, surface, interactionSequence, stepId = '') => {
  if (surface === 'monitor') {
    if (!(await page.getByTestId('monitor-overview').count())) {
      await navigateProductPath(page, NAVIGATION_PATHS.monitor, interactionSequence);
    }
    await page.getByTestId('monitor-overview').waitFor({ state: 'visible' });
    await page.getByTestId('canonical-monitor-baselines').waitFor({ state: 'visible' });
    await waitForUsablePage(page);
    return;
  }
  if (surface === 'assess-case' || surface === 'assess-review') {
    if (!(await page.getByTestId('assess-v2-workspace').count())) {
      await navigateProductPath(page, NAVIGATION_PATHS[surface], interactionSequence);
      const catalog = page.getByTestId('process-catalog-view');
      await catalog.waitFor({ state: 'visible' });
      await catalog.getByRole('button', { name: 'Synthetic PR C Assess draft', exact: true }).click();
      interactionSequence.push('open:synthetic-assess-process');
    }
    await page.getByTestId('assess-v2-workspace').waitFor({ state: 'visible' });
    if (surface === 'assess-review') await page.getByTestId('assess-v2-review-workspace').waitFor({ state: 'visible' });
    return;
  }
  const enterprise = ['assess', 'delivery'].includes(surface);
  const ready = enterprise
    ? await page.getByTestId('enterprise-intelligence-workspace').count() > 0
    : await page.getByTestId('governed-studio-creation-route').count() > 0;
  if (!ready) await navigateProductPath(page, NAVIGATION_PATHS[surface], interactionSequence);
  const target = enterprise ? page.getByTestId('enterprise-intelligence-workspace') : page.getByTestId('governed-studio-creation-route');
  await target.waitFor({ state: 'visible' }).catch(() => { throw new Error(`PR_C_SYNTHETIC_BROWSER_SURFACE_MISSING:${surface}`); });
  const tab = TAB_BY_STEP[stepId] ?? TAB_LABELS[surface][0];
  if (tab) {
    const control = target.getByRole('navigation', { name: 'Enterprise Intelligence surfaces' }).getByRole('button', { name: tab, exact: true });
    await control.click();
    interactionSequence.push(`tab:${safeLabel(tab)}`);
  }
  if (surface === 'delivery' && tab === 'Work Package') await waitForSyntheticDeliveryWorkspace(page);
  await waitForUsablePage(page);
};

const fillIfVisible = async (page, label, value, interactionSequence) => {
  const input = page.getByLabel(label, { exact: true }).last();
  if (!(await input.count()) || !(await input.isVisible()) || await input.isDisabled()) return false;
  await input.fill(value); interactionSequence.push(`fill:${safeLabel(label)}`); return true;
};

const deliveryCompleteSetMetrics = async complete => {
  const text = (await complete.innerText()).trim();
  const match = /^All ([1-9][0-9]*) canonical items are loaded from ([1-9][0-9]*) bounded server (?:page|pages)\.$/u.exec(text);
  assert(match, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_COMPLETE_SET_INVALID');
  const itemCount = Number(match[1]);
  const pageCount = Number(match[2]);
  assert(itemCount <= 250 && pageCount <= itemCount, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_COMPLETE_SET_BOUNDS');
  return { itemCount, pageCount, text };
};

const loadCompleteDeliveryItemSet = async (page, interactionSequence) => {
  const workspace = page.getByTestId('governed-delivery-workspace');
  let requests = 0;
  while (await workspace.getByRole('button', { name: 'Load next bounded page', exact: true }).count()) {
    const load = workspace.getByRole('button', { name: 'Load next bounded page', exact: true });
    assert(requests++ < 3, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_PAGE_LIMIT');
    await load.click();
    interactionSequence.push('load:next-bounded-delivery-page');
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-testid="governed-delivery-workspace"]');
      return Boolean(root?.querySelector('[data-testid="delivery-item-pagination-complete"]'))
        || [...(root?.querySelectorAll('button') ?? [])].some(button => button.textContent?.trim() === 'Load next bounded page' && !button.disabled);
    });
  }
  const complete = workspace.getByTestId('delivery-item-pagination-complete');
  await complete.waitFor({ state: 'visible' });
  return complete;
};

const selectLoadedStudioArtifact = async (page, select, value) => {
  // Selection reloads asynchronously and retains the previous editor meanwhile.
  // Read content only after the controlled select and workspace agree on readiness.
  const workspace = page.getByTestId('studio-artifact-workspace');
  if (await select.inputValue() === value && await workspace.getAttribute('data-studio-usable') === 'true') return;
  await select.selectOption(value);
  await page.waitForFunction(expected => {
    const workspace = document.querySelector('[data-testid="studio-artifact-workspace"]');
    const selected = workspace?.querySelector('select[aria-label="Governed artifact"]');
    return workspace?.getAttribute('data-studio-usable') === 'true'
      && selected instanceof HTMLSelectElement && selected.value === expected;
  }, value);
};

export const selectSyntheticStudioDraft = async (page, interactionSequence, title = SYNTHETIC_STUDIO_DRAFT_TITLE) => {
  const workspace = page.getByTestId('studio-artifact-workspace');
  const select = workspace.getByLabel('Governed artifact', { exact: true });
  await select.waitFor({ state: 'visible' });
  const options = await select.locator('option').allTextContents();
  const matches = options.filter(value => value.includes(title));
  if (matches.length === 1) {
    const option = select.locator('option').filter({ hasText: matches[0] });
    const optionValue = await option.getAttribute('value');
    assert(optionValue, 'PR_C_SYNTHETIC_BROWSER_STUDIO_DRAFT_VALUE_MISSING');
    await selectLoadedStudioArtifact(page, select, optionValue);
  } else {
    assert.equal(title, SYNTHETIC_STUDIO_DRAFT_TITLE, `PR_C_SYNTHETIC_BROWSER_STUDIO_DRAFT_COUNT:${matches.length}`);
    const candidates = await select.locator('option').evaluateAll(nodes => nodes.map(node => node.value).filter(Boolean));
    const bodyMatches = [];
    for (const value of candidates) {
      await selectLoadedStudioArtifact(page, select, value);
      const bodies = await workspace.locator('section[aria-labelledby="structured-editor-title"] textarea').evaluateAll(nodes => nodes.map(node => node.value));
      if (bodies.some(body => [SYNTHETIC_STUDIO_DRAFT_INITIAL_BODY, SYNTHETIC_STUDIO_DRAFT_SECTION_BODY].includes(body))) bodyMatches.push(value);
    }
    assert.equal(bodyMatches.length, 1, `PR_C_SYNTHETIC_BROWSER_STUDIO_DRAFT_COUNT:${bodyMatches.length}`);
    await selectLoadedStudioArtifact(page, select, bodyMatches[0]);
  }
  await workspace.locator('section[aria-labelledby="structured-editor-title"] textarea').first().waitFor({ state: 'visible' });
  assert.equal(await workspace.getAttribute('data-studio-projection-state'), 'artifact-ready', 'PR_C_SYNTHETIC_BROWSER_STUDIO_DRAFT_PROJECTION_NOT_READY');
  interactionSequence.push('select:synthetic-studio-transcript-draft');
  return workspace;
};

export const selectSyntheticHybridStudioDraft = async (page, interactionSequence, sectionBody = SYNTHETIC_HYBRID_SECTION_BODY, artifactId = '') => {
  const workspace = page.getByTestId('studio-artifact-workspace');
  const select = workspace.getByLabel('Governed artifact', { exact: true });
  await select.waitFor({ state: 'visible' });
  const candidates = await select.locator('option').evaluateAll(nodes => nodes.map(node => node.value).filter(Boolean));
  if (artifactId) assert.equal(candidates.filter(value => value === artifactId).length, 1, 'PR_C_SYNTHETIC_BROWSER_HYBRID_ARTIFACT_ID_MISSING');
  const matches = [];
  for (const value of candidates.filter(value => !artifactId || value === artifactId)) {
    await selectLoadedStudioArtifact(page, select, value);
    const bodies = await workspace.locator('section[aria-labelledby="structured-editor-title"] textarea').evaluateAll(nodes => nodes.map(node => node.value));
    if (bodies.includes(sectionBody)) matches.push(value);
  }
  assert.equal(matches.length, 1, `PR_C_SYNTHETIC_BROWSER_HYBRID_STUDIO_DRAFT_COUNT:${matches.length}`);
  await selectLoadedStudioArtifact(page, select, matches[0]);
  assert.equal(await workspace.getAttribute('data-studio-projection-state'), 'artifact-ready', 'PR_C_SYNTHETIC_BROWSER_HYBRID_DRAFT_PROJECTION_NOT_READY');
  interactionSequence.push('select:synthetic-source-bound-hybrid-draft');
  return workspace;
};

export const editAndSubmitSyntheticStudioDraft = async (page, interactionSequence, {
  title = SYNTHETIC_STUDIO_DRAFT_TITLE, reviewerActorId = '',
} = {}) => {
  assert(typeof reviewerActorId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(reviewerActorId),
    'PR_C_SYNTHETIC_BROWSER_STUDIO_REVIEWER_ID_INVALID');
  const workspace = await selectSyntheticStudioDraft(page, interactionSequence, title);
  const editor = workspace.locator('section[aria-labelledby="structured-editor-title"]');
  await editor.waitFor({ state: 'visible' });
  const body = editor.locator('label').filter({ hasText: 'Section body' }).locator('textarea');
  assert.equal(await body.count(), 1, 'PR_C_SYNTHETIC_BROWSER_STRUCTURED_EDITOR_COUNT');
  assert(await body.isEnabled(), 'PR_C_SYNTHETIC_BROWSER_STRUCTURED_EDITOR_DISABLED');
  const prior = await body.inputValue();
  const appended = `${prior}\nSynthetic acceptance edit.`.trim();
  await body.fill(appended);
  const commit = editor.getByRole('button', { name: 'Commit immutable revision', exact: true });
  assert(await commit.isEnabled(), 'PR_C_SYNTHETIC_BROWSER_STRUCTURED_COMMIT_DISABLED');
  await commit.click();
  await workspace.getByText('Draft committed.', { exact: true }).waitFor({ state: 'visible' });
  interactionSequence.push('commit:immutable-structured-studio-revision');
  const submit = workspace.getByRole('button', { name: 'Submit for review', exact: true });
  assert(await submit.isEnabled(), 'PR_C_SYNTHETIC_BROWSER_STUDIO_SUBMIT_DISABLED');
  await submit.click();
  await workspace.getByText('Reviewer ready committed.', { exact: true }).waitFor({ state: 'visible' });
  const reviewer = workspace.getByLabel('Eligible independent reviewer', { exact: true });
  const option = reviewer.locator(`option[value="${reviewerActorId}"]`);
  try { await option.first().waitFor({ state: 'attached' }); }
  catch { throw new Error('PR_C_SYNTHETIC_BROWSER_STUDIO_REVIEWER_OPTION_MISSING'); }
  assert.equal(await option.count(), 1, 'PR_C_SYNTHETIC_BROWSER_STUDIO_REVIEWER_COUNT');
  await reviewer.selectOption({ value: reviewerActorId });
  assert(await reviewer.inputValue() === reviewerActorId, 'PR_C_SYNTHETIC_BROWSER_STUDIO_REVIEWER_SELECTION_MISMATCH');
  const assign = workspace.getByRole('button', { name: 'Assign reviewer', exact: true });
  assert(await assign.isEnabled(), 'PR_C_SYNTHETIC_BROWSER_STUDIO_ASSIGN_DISABLED');
  await assign.click();
  await workspace.getByText('In review committed.', { exact: true }).waitFor({ state: 'visible' });
  interactionSequence.push('submit-and-assign:synthetic-studio-transcript-draft');
  return { priorDigest: digest(prior), savedDigest: digest(appended), changed: appended !== prior, submitted: true, assigned: true };
};

const verifyRenderedDeliveryItemIds = async (selected, expectedIds) => {
  // The hosted fixture has three items, so all canonical members must be visible.
  // Larger component fixtures intentionally render only the first 25 matches.
  if (expectedIds.length > 25) return;
  const renderedIds = await selected.locator('article[data-testid^="delivery-item-"]').evaluateAll(nodes =>
    nodes.map(node => node.getAttribute('data-testid').slice('delivery-item-'.length)).sort());
  assert.deepEqual(renderedIds, expectedIds, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_RENDERED_ITEM_SET_DRIFT');
};

const selectedDeliveryPackage = async workspace => {
  const selected = workspace.locator('article[data-testid^="delivery-package-"]');
  assert.equal(await selected.count(), 1, 'PR_C_SYNTHETIC_BROWSER_SELECTED_DELIVERY_PACKAGE_COUNT');
  await selected.waitFor({ state: 'visible' });
  const packageId = await selected.getAttribute('data-package-id');
  assert(packageId, 'PR_C_SYNTHETIC_BROWSER_SELECTED_DELIVERY_PACKAGE_ID_MISSING');
  return { selected, packageId };
};

const selectDeliveryPackageForControl = async (page, label, interactionSequence, expectedPackageId = '') => {
  if (expectedPackageId) {
    const { workspace, selected } = await selectDeliveryPackageById(page, expectedPackageId, interactionSequence);
    const filter = workspace.getByLabel('Filter canonical work items', { exact: true });
    if (await filter.count()) await filter.fill('');
    assert(await selected.getByRole('button', { name: label, exact: true }).count() > 0,
      'PR_C_SYNTHETIC_BROWSER_EXACT_PACKAGE_CONTROL_MISSING');
    return workspace;
  }
  const workspace = page.getByTestId('governed-delivery-workspace');
  const packages = workspace.getByRole('list', { name: 'Delivery packages' }).getByRole('button');
  const matches = [];
  for (let index = 0; index < await packages.count(); index += 1) {
    await packages.nth(index).click();
    const filter = workspace.getByLabel('Filter canonical work items', { exact: true });
    if (await filter.count()) await filter.fill('');
    const control = workspace.getByRole('button', { name: label, exact: true });
    if (await control.count()) matches.push(index);
  }
  assert.equal(matches.length, 1, `PR_C_SYNTHETIC_BROWSER_DELIVERY_PACKAGE_CONTROL_COUNT:${safeLabel(label)}:${matches.length}`);
  await packages.nth(matches[0]).click();
  const { packageId } = await selectedDeliveryPackage(workspace);
  if (expectedPackageId) assert.equal(packageId, expectedPackageId, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_PACKAGE_BINDING_MISMATCH');
  interactionSequence.push(`select:delivery-package-for-${safeLabel(label)}`);
  return workspace;
};

const selectDeliveryPackageByLabel = async (page, label, interactionSequence) => {
  const workspace = page.getByTestId('governed-delivery-workspace');
  const packages = workspace.getByRole('list', { name: 'Delivery packages' }).getByRole('button');
  const matches = [];
  for (let index = 0; index < await packages.count(); index += 1) {
    const lines = (await packages.nth(index).innerText()).split('\n').map(value => value.trim()).filter(Boolean);
    if (lines[0]?.startsWith(`${label} · v`)) matches.push(packages.nth(index));
  }
  assert.equal(matches.length, 1, `PR_C_SYNTHETIC_BROWSER_DELIVERY_PACKAGE_LABEL_COUNT:${safeLabel(label)}:${matches.length}`);
  await matches[0].click();
  const selected = workspace.locator('article[data-testid^="delivery-package-"]');
  await selected.waitFor({ state: 'visible' });
  interactionSequence.push(`select:delivery-package-${safeLabel(label)}`);
  return { workspace, selected };
};

const selectDeliveryPackageById = async (page, packageId, interactionSequence) => {
  const { workspace, selected } = await selectSyntheticDeliveryPackage(page, packageId);
  interactionSequence.push('select:exact-bound-delivery-package');
  return { workspace, selected };
};

const filterOneDeliveryItem = async (page, interactionSequence, query) => {
  const workspace = page.getByTestId('governed-delivery-workspace');
  const filter = workspace.getByLabel('Filter canonical work items', { exact: true });
  await filter.fill(query);
  const result = workspace.getByTestId('delivery-item-filter-result');
  await result.waitFor({ state: 'visible' });
  assert.match(await result.innerText(), /^1 matching items across [1-9][0-9]* loaded$/u, 'PR_C_SYNTHETIC_BROWSER_EXACT_DELIVERY_ITEM_COUNT');
  interactionSequence.push(`filter:delivery-item-${safeLabel(query)}`);
};

export const selectExactRevisedDeliveryDescendant = async (page, interactionSequence, expectedPackageId, expectedItemId, expectedItemCount) => {
  assert(expectedPackageId, 'PR_C_SYNTHETIC_BROWSER_FULL_GOVERNED_PACKAGE_BINDING_MISSING');
  assert(expectedItemId, 'PR_C_SYNTHETIC_BROWSER_REVISED_ITEM_BINDING_MISSING');
  const { workspace, selected } = await selectDeliveryPackageById(page, expectedPackageId, interactionSequence);
  assert.equal(await selected.getByText('Studio handoff', { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_REVISED_PACKAGE_SOURCE_MODE_MISMATCH');
  assert.equal(await selected.getByText('Assessed lineage', { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_REVISED_PACKAGE_ANCESTRY_MISMATCH');
  assert.equal(await selected.getByText('draft', { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_REVISED_PACKAGE_STATUS_MISMATCH');
  assert.equal(await selected.getByText('Review not requested', { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_REVISED_PACKAGE_REVIEW_STATE_MISMATCH');
  const metrics = await deliveryCompleteSetMetrics(await loadCompleteDeliveryItemSet(page, interactionSequence));
  assert(Number.isSafeInteger(expectedItemCount) && expectedItemCount > 0 && expectedItemCount <= 250, 'PR_C_SYNTHETIC_BROWSER_REVISED_EXPECTED_COUNT');
  assert.equal(metrics.itemCount, expectedItemCount, 'PR_C_SYNTHETIC_BROWSER_REVISED_PACKAGE_ITEM_COUNT');
  assert.equal(metrics.pageCount, Math.ceil(expectedItemCount / 100), 'PR_C_SYNTHETIC_BROWSER_REVISED_PACKAGE_PAGE_COUNT');
  await filterOneDeliveryItem(page, interactionSequence, 'edited');
  assert.equal(await workspace.locator('article[data-testid^="delivery-item-"][data-item-status="edited"]').count(), 1,
    'PR_C_SYNTHETIC_BROWSER_REVISED_EDITED_ITEM_COUNT');
  await filterOneDeliveryItem(page, interactionSequence, SYNTHETIC_REVISED_ITEM_TITLE);
  const cards = workspace.locator('article[data-testid^="delivery-item-"]');
  const matches = [];
  for (let index = 0; index < await cards.count(); index += 1) {
    const card = cards.nth(index);
    if (await card.getAttribute('data-testid') !== `delivery-item-${expectedItemId}`) continue;
    if (await card.getAttribute('data-item-title') !== SYNTHETIC_REVISED_ITEM_TITLE) continue;
    if (await card.getAttribute('data-item-status') !== 'edited') continue;
    if (await card.getByRole('button', { name: 'Accept proposal', exact: true }).count() !== 1) continue;
    matches.push(card);
  }
  assert.equal(matches.length, 1, 'PR_C_SYNTHETIC_BROWSER_REVISED_DELIVERY_DESCENDANT_COUNT');
  const card = matches[0];
  assert.equal(await card.getByText(/^Version [2-9][0-9]*$/u).count(), 1, 'PR_C_SYNTHETIC_BROWSER_REVISED_DELIVERY_DESCENDANT_VERSION');
  const control = card.getByRole('button', { name: 'Accept proposal', exact: true });
  assert(await control.isEnabled(), 'PR_C_SYNTHETIC_BROWSER_REVISED_DELIVERY_DESCENDANT_DISABLED');
  interactionSequence.push('select:exact-current-revised-delivery-descendant');
  return { card, control, title: SYNTHETIC_REVISED_ITEM_TITLE, status: 'edited', itemCount: metrics.itemCount, pageCount: metrics.pageCount };
};

export const isolateFirstActionableDeliveryItem = async (page, interactionSequence, expectedPackageId = '', exactItemTitle = '', expectedItemId = '') => {
  assert(expectedItemId || exactItemTitle, 'PR_C_SYNTHETIC_BROWSER_EXACT_ITEM_BINDING_MISSING');
  const workspace = await selectDeliveryPackageForControl(page, 'Edit immutable descendant', interactionSequence, expectedPackageId);
  if (exactItemTitle && !expectedItemId) {
    const { selected } = await selectedDeliveryPackage(workspace);
    for (const label of ['Manual Delivery entry', 'Not assessed · Planning only'])
      assert.equal(await selected.getByText(label, { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_MANUAL_DRAFT_PACKAGE_REQUIRED');
  }
  await loadCompleteDeliveryItemSet(page, interactionSequence);
  if (exactItemTitle) await filterOneDeliveryItem(page, interactionSequence, exactItemTitle);
  const cards = workspace.locator('article[data-testid^="delivery-item-"]');
  const matches = [];
  for (let index = 0; index < await cards.count(); index += 1) {
    const candidate = cards.nth(index);
    if (expectedItemId && await candidate.getAttribute('data-testid') !== `delivery-item-${expectedItemId}`) continue;
    const title = await candidate.getAttribute('data-item-title');
    if ((!exactItemTitle || title === exactItemTitle) && await candidate.getByRole('button', { name: 'Edit immutable descendant', exact: true }).count() === 1) matches.push(candidate);
  }
  assert.equal(matches.length, 1, 'PR_C_SYNTHETIC_BROWSER_ACTIONABLE_DELIVERY_ITEM_COUNT');
  const card = matches[0];
  const title = await card.getAttribute('data-item-title');
  assert(title, 'PR_C_SYNTHETIC_BROWSER_ACTIONABLE_DELIVERY_ITEM_TITLE_MISSING');
  await filterOneDeliveryItem(page, interactionSequence, title);
  if (expectedItemId) assert.equal(await workspace.getByTestId(`delivery-item-${expectedItemId}`).count(), 1, 'PR_C_SYNTHETIC_BROWSER_EXACT_ITEM_FILTER_MISMATCH');
  return { workspace, title, ...await exactEnabledControl(card, 'button', ['Edit immutable descendant'], 'CH-06:edit-one-item-with-rationale') };
};

const reachControlWithKeyboard = async (page, control, interactionSequence, { resetFocus = true } = {}) => {
  if (resetFocus) await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  for (let index = 1; index <= 300; index += 1) {
    await page.keyboard.press('Tab');
    if (await control.evaluate(node => node === document.activeElement)) {
      interactionSequence.push(`keyboard:tab-to-control:${index}`);
      return index;
    }
  }
  throw new Error('PR_C_SYNTHETIC_BROWSER_KEYBOARD_CONTROL_UNREACHABLE');
};

const prepareKeyboardOnlyHandoff = async (page, interactionSequence, state) => {
  const candidate = state.get('ch02:approved-candidate');
  assert(candidate, 'PR_C_SYNTHETIC_BROWSER_KEYBOARD_HANDOFF_SOURCE_MISSING');
  return (await selectSyntheticDeliveryArtifact(page, interactionSequence, {
    artifactVersionId: candidate.studioArtifactVersionId, artifactType: candidate.artifactType, planningOnly: true,
  })).section;
};

export const selectExactEligibleStudioBundle = async (page, interactionSequence, { versionId = '', requireDirectCreation = false } = {}) => {
  assert(typeof versionId === 'string' && /^[0-9a-f-]{36}$/u.test(versionId), 'PR_C_SYNTHETIC_BROWSER_STUDIO_BUNDLE_BINDING_MISSING');
  const builder = page.getByRole('region', { name: 'Studio Source Package builder' });
  const select = builder.getByLabel('Exact locked Studio bundle', { exact: true });
  const createControl = builder.getByRole('button', { name: 'Create direct planning package', exact: true });
  await select.waitFor({ state: 'visible' }).catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_STUDIO_BUNDLE_CONTROL_NOT_READY'); });
  const options = await select.locator('option').evaluateAll(nodes => nodes.map(node => ({ value: node.value, label: node.textContent?.trim() ?? '' })).filter(option => option.value));
  assert.equal(options.filter(option => option.value === versionId).length, 1, 'PR_C_SYNTHETIC_BROWSER_EXACT_STUDIO_BUNDLE_COUNT');
  await select.selectOption(versionId);
  await page.waitForFunction(expected => document.querySelector('select[aria-label="Exact locked Studio bundle"]')?.value === expected, versionId)
    .catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_STUDIO_BUNDLE_SELECTION_NOT_RETAINED'); });
  assert.equal(await select.inputValue(), versionId, 'PR_C_SYNTHETIC_BROWSER_STUDIO_BUNDLE_SELECTION_MISMATCH');
  if (requireDirectCreation) {
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent?.trim() === 'Create direct planning package' && !button.disabled))
      .catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_DIRECT_PACKAGE_CONTROL_NOT_READY'); });
    assert(await createControl.isEnabled(), 'PR_C_SYNTHETIC_BROWSER_DIRECT_PACKAGE_DISABLED');
  }
  interactionSequence.push('select:exact-bound-studio-bundle');
  return { optionCount: options.length, exactMatchCount: 1, directCreationRequired: requireDirectCreation };
};

export const prepareSyntheticDirectPdd = async (page, interactionSequence, bundle) => {
  const workspace = page.getByTestId('studio-artifact-workspace');
  await workspace.getByLabel('Artifact type', { exact: true }).selectOption('pdd')
    .catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_CH10_ARTIFACT_TYPE_SELECT_FAILED'); });
  // Studio projections and the exact builder controls determine readiness;
  // unrelated page traffic must not prevent an otherwise eligible creation.
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-testid="studio-artifact-workspace"]');
    return root?.getAttribute('data-studio-usable') === 'true' && root.querySelector('select[aria-label="Artifact type"]')?.value === 'pdd';
  }).catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_CH10_WORKSPACE_NOT_READY'); });
  interactionSequence.push('select:direct-pdd-artifact-type');
  return selectExactEligibleStudioBundle(page, interactionSequence, { ...bundle, requireDirectCreation: true });
};

const prepareBlockedPackageRecovery = async (page, interactionSequence, { packageId = '', recoveryFixture = false } = {}) => {
  assert(packageId, 'PR_C_SYNTHETIC_BROWSER_RECOVERY_PACKAGE_BINDING_MISSING');
  const { workspace, selected } = await selectDeliveryPackageById(page, packageId, interactionSequence);
  const expectedState = recoveryFixture
    ? ['blocked', 'Manual Delivery entry', 'Not assessed · Planning only', 'Review changes requested']
    : ['blocked', 'Studio handoff', 'Assessed lineage', 'Review changes requested'];
  for (const expected of expectedState) assert.equal(await selected.getByText(expected, { exact: true }).count(), 1, `PR_C_SYNTHETIC_BROWSER_RECOVERY_PACKAGE_STATE_MISSING:${safeLabel(expected)}`);
  await loadCompleteDeliveryItemSet(page, interactionSequence);
  const prepare = workspace.getByRole('button', { name: 'Prepare blocked package recovery', exact: true });
  assert(await prepare.isEnabled(), 'PR_C_SYNTHETIC_BROWSER_RECOVERY_PREPARE_DISABLED');
  await prepare.click();
  const available = workspace.locator('[aria-label="Canonical descendants available for recovery"]');
  await available.waitFor({ state: 'visible' });
  const itemName = recoveryFixture ? SYNTHETIC_RECOVERY_ITEM_TITLE : 'Synthetic governed work item revision';
  const selection = available.getByRole('checkbox', { name: `Select ${itemName} for recovery`, exact: true });
  assert.equal(await selection.count(), 1, 'PR_C_SYNTHETIC_BROWSER_RECOVERY_ITEM_COUNT');
  await selection.check();
  await workspace.getByLabel(`Recovery title for ${itemName}`, { exact: true }).fill(`${itemName} · synthetic blocker resolved`);
  await workspace.getByLabel(`Recovery rationale for ${itemName}`, { exact: true }).fill('Resolve the exact independent synthetic review request.');
  interactionSequence.push('prepare:one-explicit-blocked-descendant');
};

const prepareServerAction = async (page, checkpointId, stepId, interactionSequence, state) => {
  const key = `${checkpointId}:${stepId}`;
  if (key === 'CH-01:resolve-material-assess-conflict') assert(await fillIfVisible(page, 'Resolution rationale', 'Synthetic conflict resolved against the reviewed source set.', interactionSequence));
  if (['CH-02:review-studio-document', 'CH-02:approve-studio-document'].includes(key))
    await selectSyntheticStudioDraft(page, interactionSequence);
  if (key === 'CH-03:approve-hybrid-studio-document') await selectSyntheticHybridStudioDraft(page, interactionSequence, SYNTHETIC_HYBRID_SECTION_BODY, state.get('prereq:ch03:artifactId'));
  if (key === 'CH-03:generate-source-bound-document') await prepareSyntheticStudioGeneration(page, interactionSequence, {
    artifactId: state.get('prereq:ch03:artifactId'), templateLabel: 'Synthetic controlled-human requirements template',
  });
  if (['CH-02:review-studio-document', 'CH-02:approve-studio-document', 'CH-03:approve-hybrid-studio-document'].includes(key))
    assert(await fillIfVisible(page, 'Rationale', `Independent synthetic decision for ${stepId}.`, interactionSequence), 'PR_C_SYNTHETIC_BROWSER_STUDIO_RATIONALE_MISSING');
  if (['CH-04:request-exact-studio-handoff', 'CH-05:request-fresh-exact-handoff'].includes(key)) {
    const candidate = state.get('seed:assessed-artifact');
    assert(candidate, 'PR_C_SYNTHETIC_BROWSER_ASSESSED_STUDIO_ARTIFACT_MISSING');
    await selectSyntheticDeliveryArtifact(page, interactionSequence, {
      artifactVersionId: candidate.studioArtifactVersionId, artifactType: candidate.artifactType, planningOnly: false,
    });
  }
  if (key === 'CH-03:request-studio-handoff') await selectExactEligibleStudioBundle(page, interactionSequence, state.get('ch03:bundleBinding')?.inputBundle);
  if (key === 'CH-10:handoff-direct-studio-plan') {
    const candidate = state.get('prereq:ch10:approvedCandidate');
    assert(candidate, 'PR_C_SYNTHETIC_BROWSER_DIRECT_STUDIO_ARTIFACT_MISSING');
    await selectSyntheticDeliveryArtifact(page, interactionSequence, {
      artifactVersionId: candidate.studioArtifactVersionId, artifactType: candidate.artifactType, planningOnly: true,
    });
  }
  const deliveryControlByKey = {
    'CH-06:edit-one-item-with-rationale': 'Edit immutable descendant',
    'CH-06:decide-every-current-proposal': 'Accept proposal',
    'CH-07:request-package-changes': 'Request package changes',
    'CH-07:review-complete-revised-package': 'Approve package review',
    'CH-07:approve-exact-revised-package': 'Final package approval',
    'CH-10:approve-direct-planning-package': 'Final package approval',
    'CH-11:review-manual-delivery-package': 'Approve package review',
    'CH-11:approve-manual-delivery-package': 'Final package approval',
  }[key];
  if (deliveryControlByKey) {
    const expectedPackageId = ['CH-06', 'CH-07'].includes(checkpointId) ? state.get('full-governed-package')?.packageId
      : state.get(checkpointId === 'CH-10' ? 'prereq:ch10:packageId' : 'prereq:ch11:packageId');
    assert(expectedPackageId, 'PR_C_SYNTHETIC_BROWSER_GOVERNED_PACKAGE_BINDING_MISSING');
    if (key === 'CH-06:edit-one-item-with-rationale')
      return isolateFirstActionableDeliveryItem(page, interactionSequence, expectedPackageId, state.get('ch06:selectedItemTitle'), state.get('ch06:selectedItemId'));
    if (key === 'CH-06:decide-every-current-proposal') {
      const itemId = state.get('prereq:ch06:finalItemId');
      assert(itemId, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_DECISION_ITEM_BINDING_MISSING');
      const { workspace } = await selectDeliveryPackageById(page, expectedPackageId, interactionSequence);
      await loadCompleteDeliveryItemSet(page, interactionSequence);
      // The remaining proposal can be outside the first 25 rendered members.
      await filterOneDeliveryItem(page, interactionSequence, 'Synthetic governed work item revision');
      const card = workspace.getByTestId(`delivery-item-${itemId}`);
      assert.equal(await card.count(), 1, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_DECISION_ITEM_MISMATCH');
      return exactEnabledControl(card, 'button', ['Accept proposal'], key);
    }
    const workspace = await selectDeliveryPackageForControl(page, deliveryControlByKey, interactionSequence, expectedPackageId);
    await loadCompleteDeliveryItemSet(page, interactionSequence);
    const { selected } = await selectedDeliveryPackage(workspace);
    return exactEnabledControl(selected, 'button', [deliveryControlByKey], key);
  }
  if (key === 'CH-07:commit-only-explicitly-edited-descendants') {
    const packageId = state.get('full-governed-package')?.packageId;
    assert(packageId, 'PR_C_SYNTHETIC_BROWSER_FULL_GOVERNED_PACKAGE_BINDING_MISSING');
    await prepareBlockedPackageRecovery(page, interactionSequence, { packageId });
  }
  if (key === 'CH-07:decide-revised-descendant') {
    const packageId = state.get('full-governed-package')?.packageId;
    return { ...await selectExactRevisedDeliveryDescendant(page, interactionSequence, packageId, state.get('prereq:ch06:finalItemId'), state.get('full-governed-package').itemCount), label: 'Accept proposal' };
  }
  if (key === 'CH-13:simulate-response-loss') await prepareBlockedPackageRecovery(page, interactionSequence, { packageId: state.get('seed:recovery-packageId'), recoveryFixture: true });
  if (key === 'CH-10:create-direct-studio-plan') {
    await prepareSyntheticDirectPdd(page, interactionSequence, state.get('ch03:bundleBinding')?.inputBundle);
  }
  if (key === 'CH-11:create-manual-delivery-package') {
    assert(await fillIfVisible(page, 'Package title', 'Synthetic manual continuity plan', interactionSequence), 'PR_C_SYNTHETIC_BROWSER_MANUAL_PACKAGE_TITLE_MISSING');
    assert(await fillIfVisible(page, 'First item title', 'Verify synthetic recovery checkpoint', interactionSequence), 'PR_C_SYNTHETIC_BROWSER_MANUAL_ITEM_TITLE_MISSING');
    assert(await fillIfVisible(page, 'Description', 'Synthetic planning item without upstream ancestry.', interactionSequence), 'PR_C_SYNTHETIC_BROWSER_MANUAL_DESCRIPTION_MISSING');
  }
};

const completeVisibleDialog = async (page, stepId, interactionSequence) => {
  if (['create-baseline-with-exact-package-selectors', 'create-read-only-manual-baseline'].includes(stepId)) {
    const dialog = page.getByRole('dialog', { name: 'Confirm governed decision', exact: true });
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
      .catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_BASELINE_CONFIRM_FAILED'); });
    interactionSequence.push('activate:dialog-confirm');
    // Production closes only after the command AND its projection reload succeed.
    // Durable evidence can appear earlier; networkidle is not this completion signal.
    await dialog.waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_BASELINE_PROJECTION_NOT_CONFIRMED'); });
    interactionSequence.push('observe:baseline-projection-confirmed');
    return;
  }
  if (stepId === 'edit-one-item-with-rationale') {
    const dialog = page.getByRole('dialog', { name: 'Confirm governed decision', exact: true });
    await dialog.waitFor({ state: 'visible' })
      .catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_EDIT_DIALOG_MISSING'); });
    // Role names exclude a textarea's existing text, unlike the label-text selector.
    for (const [name, value, phase] of [
      ['Item title', 'Synthetic governed work item revision', 'TITLE'],
      ['Description', 'Synthetic revision bound to the reviewed source and exact package.', 'DESCRIPTION'],
      [/^Decision rationale\b/u, `Synthetic acceptance rationale for ${stepId}.`, 'RATIONALE'],
    ]) {
      await dialog.getByRole('textbox', { name, exact: true }).fill(value)
        .catch(() => { throw new Error(`PR_C_SYNTHETIC_BROWSER_EDIT_${phase}_FAILED`); });
    }
    interactionSequence.push('fill:item-title-material-revision', 'fill:decision-rationale');
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
      .catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_EDIT_CONFIRM_FAILED'); });
    await dialog.waitFor({ state: 'hidden' })
      .catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_EDIT_NOT_COMMITTED'); });
    interactionSequence.push('activate:dialog-confirm');
    return;
  }
  const dialog = page.getByRole('dialog').last();
  if (!(await dialog.count()) || !(await dialog.isVisible())) return;
  const values = new Map([
    ['Decision rationale', `Synthetic acceptance rationale for ${stepId}.`],
    ['Item title', 'Synthetic governed work item revision'],
    ['Item description', 'Synthetic revision bound to the reviewed source and exact package.'],
    ['Description', 'Synthetic revision bound to the reviewed source and exact package.'],
    ['Acceptance criteria', 'The governed synthetic observation is retained.'],
    ['Non-functional requirements', 'Preserve authority, audit, and bounded response behavior.'],
  ]);
  for (const [label, value] of values) {
    // Delivery's rationale label includes its validation help text.
    const input = dialog.getByLabel(label, { exact: label !== 'Decision rationale' });
    if (await input.count() && await input.isVisible() && !(await input.isDisabled()) && !(await input.inputValue()).trim()) {
      await input.fill(value); interactionSequence.push(`fill:${safeLabel(label)}`);
    }
  }
  const confirm = await firstVisible([dialog.getByRole('button', { name: /confirm|submit|save|apply|continue/iu })]);
  if (confirm) { await confirm.click(); interactionSequence.push('activate:dialog-confirm'); }
};

const waitForControlledHumanEvidencePanel = async (page, phase, timeoutMs) => {
  const banner = page.getByTestId('controlled-human-nonproduction-banner');
  const blocked = page.getByTestId('controlled-human-environment-blocked');
  await page.locator('[data-testid="controlled-human-nonproduction-banner"]:visible, [data-testid="controlled-human-environment-blocked"]:visible')
    .first().waitFor({ state: 'attached', timeout: timeoutMs })
    .catch(() => { throw new Error(`PR_C_SYNTHETIC_BROWSER_${phase}_PANEL_COUNT`); });
  if (await blocked.count()) throw new Error('PR_C_SYNTHETIC_BROWSER_PREVIEW_BINDING_BLOCKED');
  assert.equal(await banner.count(), 1, `PR_C_SYNTHETIC_BROWSER_${phase}_BANNER_COUNT`);
  const panel = banner.locator('details');
  assert.equal(await panel.count(), 1, `PR_C_SYNTHETIC_BROWSER_${phase}_PANEL_COUNT`);
  return { banner, panel };
};

const armServerStep = async (page, checkpointId, stepId, interactionSequence) => {
  const { banner, panel } = await waitForControlledHumanEvidencePanel(page, 'ARM', 30_000);
  if (await panel.getAttribute('open') === null) {
    await panel.locator('summary').click().catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_ARM_PANEL_OPEN_FAILED'); });
  }
  interactionSequence.push('expand:two-phase-evidence');
  await banner.getByRole('button', { name: 'Refresh evidence steps' }).click()
    .catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_ARM_REFRESH_FAILED'); });
  const selector = banner.getByLabel('Controlled-human evidence step', { exact: true });
  const stepKey = `${checkpointId}:${stepId}`;
  await selector.selectOption(stepKey).catch(async () => {
    const refreshRejected = await banner.getByText('Sign in as the assigned synthetic persona, then refresh evidence steps. No evidence was recorded.', { exact: true }).isVisible().catch(() => false);
    const optionPresent = await selector.locator('option').evaluateAll((options, expected) => options.some(option => option.value === expected), stepKey).catch(() => false);
    const pathname = new URL(page.url()).pathname;
    const route = pathname === '/sign-in' ? 'SIGN_IN' : pathname === '/' ? 'ROOT' : 'OTHER';
    const reason = refreshRejected ? 'REFRESH_REJECTED' : optionPresent ? 'CONTROL_REJECTED' : 'OPTION_ABSENT';
    throw new Error(`PR_C_SYNTHETIC_BROWSER_ARM_STEP_MISSING_${reason}_${route}`);
  });
  await banner.getByRole('button', { name: 'Arm before action' }).click()
    .catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_ARM_CONTROL_FAILED'); });
  await banner.getByText('Step armed in this browser tab.', { exact: false }).waitFor({ state: 'visible' })
    .catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_ARM_CONFIRMATION_MISSING'); });
  interactionSequence.push(`arm:${checkpointId.toLowerCase()}:${stepId}`);
};

export const collectProof = async (page, checkpointId, stepId, interactionSequence, { timeoutMs = 15_000 } = {}) => {
  const { banner, panel } = await waitForControlledHumanEvidencePanel(page, 'PROOF', timeoutMs);
  if (await panel.getAttribute('open') === null) {
    await panel.locator('summary').click()
      .catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_PROOF_PANEL_OPEN_FAILED'); });
  }
  const refresh = banner.getByRole('button', { name: 'Refresh evidence steps', exact: true });
  const completed = banner.getByLabel('Completed controlled-human evidence step', { exact: true });
  const stepKey = `${checkpointId}:${stepId}`;
  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(1, deadline - Date.now());
  let found = false;
  // A completed action can outlive the click handler. Refresh durable proof;
  // waiting on one anchored DOM snapshot cannot observe its later completion.
  while (Date.now() < deadline) {
    try {
      await refresh.click({ timeout: remaining() });
      await expect(refresh).toBeEnabled({ timeout: remaining() });
    } catch {
      throw new Error(Date.now() >= deadline ? 'PR_C_SYNTHETIC_BROWSER_COMPLETED_STEP_MISSING'
        : 'PR_C_SYNTHETIC_BROWSER_PROOF_REFRESH_CONTROL_MISSING');
    }
    const rejected = await banner.getByText('Sign in as the assigned synthetic persona, then refresh evidence steps. No evidence was recorded.', { exact: true }).isVisible().catch(() => false);
    if (rejected) throw new Error('PR_C_SYNTHETIC_BROWSER_PROOF_REFRESH_REJECTED');
    found = await completed.locator('option').evaluateAll((options, key) => options.some(option => option.value === key), stepKey);
    if (found) {
      await completed.selectOption(stepKey, { timeout: remaining() })
        .catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_COMPLETED_STEP_MISSING'); });
      break;
    }
    await page.waitForTimeout(Math.min(250, Math.max(0, deadline - Date.now())));
  }
  assert(found, 'PR_C_SYNTHETIC_BROWSER_COMPLETED_STEP_MISSING');
  interactionSequence.push(`inspect-proof:${checkpointId.toLowerCase()}:${stepId}`);
  const anchorText = await banner.getByTestId('controlled-human-safe-anchor').textContent({ timeout: 10_000 })
    .catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_PROOF_ANCHOR_MISSING'); });
  const bindingText = await banner.getByTestId('controlled-human-safe-binding').textContent({ timeout: 10_000 })
    .catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_PROOF_BINDING_MISSING'); });
  const anchor = JSON.parse(anchorText);
  const binding = JSON.parse(bindingText);
  assert.equal(anchor.stepId, stepId, 'PR_C_SYNTHETIC_BROWSER_ANCHOR_STEP_MISMATCH');
  assert.equal(binding.stepId, stepId, 'PR_C_SYNTHETIC_BROWSER_BINDING_STEP_MISMATCH');
  return { serverAnchor: anchor, serverBinding: binding };
};

export const executeServerAction = async (page, checkpointId, stepId, interactionSequence, state) => {
  const key = `${checkpointId}:${stepId}`;
  const contract = SERVER_ACTION_BY_STEP.get(key);
  assert(contract, `PR_C_SYNTHETIC_BROWSER_SERVER_CONTRACT_MISSING:${key}`);
  const labels = ACTION_LABEL_OVERRIDES[key] ?? ACTION_LABELS[contract.action];
  assert(labels?.length, `PR_C_SYNTHETIC_BROWSER_ACTION_PLAN_MISSING:${key}`);
  const preparedControl = await prepareServerAction(page, checkpointId, stepId, interactionSequence, state);
  const handoffTarget = STUDIO_HANDOFF_STEP_TARGETS[key];
  const deliveryHandoffKey = {
    'CH-04:request-handoff-changes': 'ch04:handoffId',
    'CH-04:reject-new-exact-handoff-request': 'prereq:ch04:replacementHandoffId',
    'CH-05:review-handoff-independently': 'ch05:handoffId',
    'CH-05:approve-handoff-independently': 'ch05:handoffId',
    'CH-05:consume-approved-handoff-once': 'ch05:handoffId',
  }[key];
  let root = actionRoot(page, contract.action);
  if (key === 'CH-08:create-baseline-with-exact-package-selectors' || key === 'CH-11:create-read-only-manual-baseline') {
    const packageId = checkpointId === 'CH-08' ? state.get('full-governed-package')?.packageId : state.get('prereq:ch11:packageId');
    assert(packageId, 'PR_C_SYNTHETIC_BROWSER_BASELINE_PACKAGE_BINDING_MISSING');
    root = root.getByTestId('baseline-eligibility-selectors').locator(`[data-package-id="${packageId}"]`);
    await root.waitFor({ state: 'visible' });
    assert.equal(await root.count(), 1, 'PR_C_SYNTHETIC_BROWSER_BASELINE_SELECTOR_COUNT');
  }
  if (deliveryHandoffKey) {
    const handoffId = state.get(deliveryHandoffKey);
    assert(handoffId, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_HANDOFF_BINDING_MISSING');
    await root.waitFor({ state: 'visible' });
    assert.equal(await root.getAttribute('data-delivery-usable'), 'true', 'PR_C_SYNTHETIC_BROWSER_DELIVERY_NOT_USABLE');
    const handoff = root.locator(`[data-handoff-id="${handoffId}"]`);
    let found = false;
    // Same-workspace target actions are server-projected in Outbox.
    for (const direction of ['Inbox', 'Outbox']) {
      const name = new RegExp(`^${direction} \\([0-9]+\\)$`, 'u');
      await root.getByRole('tab', { name }).click();
      await root.getByRole('tab', { name, selected: true }).waitFor({ state: 'visible' });
      interactionSequence.push(`select:delivery-handoff-${direction.toLowerCase()}`);
      const count = await handoff.count();
      if (count === 0) continue;
      assert.equal(count, 1, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_HANDOFF_ID_COUNT');
      await handoff.waitFor({ state: 'visible' });
      root = handoff;
      found = true;
      break;
    }
    assert(found, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_HANDOFF_NOT_IN_PROJECTION');
  }
  if (handoffTarget && key !== 'CH-03:request-studio-handoff')
    assert(state.get('ch03:handoffId'), 'PR_C_SYNTHETIC_BROWSER_STUDIO_HANDOFF_BINDING_MISSING');
  const { control, label } = preparedControl ?? (handoffTarget
    ? await exactStudioHandoffAction(page, interactionSequence, { ...handoffTarget, button: labels[0],
      ...(key === 'CH-03:request-studio-handoff' ? { upstreamHandoffId: state.get('seed:assess-handoff')?.upstreamHandoffId }
        : { handoffId: state.get('ch03:handoffId') }) })
    : await exactEnabledControl(root, 'button', labels, key));
  await control.click();
  interactionSequence.push(`activate:${safeLabel(label)}`);
  await completeVisibleDialog(page, stepId, interactionSequence);
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
};

const assertNoRawHashesOrApprovalIdentities = async page => {
  const text = await page.locator('body').innerText();
  assert.doesNotMatch(text, /\b[0-9a-f]{64}\b/iu);
  assert.doesNotMatch(text, /approved by\s+[^\n]{2,100}@/iu);
  return digest({ rawHashCount: 0, approvalIdentityCount: 0 });
};

const assertNoMonitorMutationControls = async page => {
  const count = await page.getByTestId('canonical-monitor-baselines').getByRole('button', { name: /^(?:create|edit|approve|reject|delete|execute|complete|change)/iu }).count();
  assert.equal(count, 0, 'PR_C_SYNTHETIC_BROWSER_MONITOR_MUTATION_PRESENT');
  return digest({ mutationControlCount: count });
};

const assertLayout = async page => {
  const dimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert(dimensions.scrollWidth <= dimensions.clientWidth + 1, 'PR_C_SYNTHETIC_BROWSER_HORIZONTAL_OVERFLOW');
  return digest(dimensions);
};

const exactVisibleText = async (page, values, all = false) => {
  const observed = [];
  for (const value of values) {
    const locator = page.getByText(value, { exact: true });
    await locator.first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
    const count = await locator.count();
    const visible = count > 0 && await locator.first().isVisible();
    if (visible) observed.push({ value, count });
    else if (all) throw new Error(`PR_C_SYNTHETIC_BROWSER_EXACT_TEXT_MISSING:${safeLabel(value)}`);
  }
  if (!observed.length) throw new Error(`PR_C_SYNTHETIC_BROWSER_EXACT_TEXT_MISSING:${values.map(safeLabel).join('|')}`);
  return observed;
};

const namedControl = async (page, role, names) => {
  for (const name of names) {
    const locator = page.getByRole(role, { name, exact: true });
    if (await locator.count() && await locator.first().isVisible()) return { locator: locator.first(), name };
  }
  throw new Error(`PR_C_SYNTHETIC_BROWSER_EXACT_CONTROL_MISSING:${names.map(safeLabel).join('|')}`);
};

export const packageCount = async page => {
  const workspace = await waitForSyntheticDeliveryWorkspace(page);
  const packages = workspace.getByRole('list', { name: 'Delivery packages', exact: true });
  // The authorized empty list has zero height on narrow layouts; its parent
  // must be visible and usable, but list presence is the loaded-state boundary.
  await packages.waitFor({ state: 'attached' });
  return packages.getByRole('listitem').count();
};
const baselineCount = async page => {
  const panel = page.getByTestId('canonical-monitor-baselines');
  await panel.waitFor({ state: 'visible' });
  assert.equal(await panel.getAttribute('data-monitor-usable'), 'true', 'PR_C_SYNTHETIC_BROWSER_MONITOR_NOT_USABLE');
  return panel.getByRole('list', { name: 'Approved Monitor baselines' }).getByRole('button').count();
};

export const selectAssessTranscriptSources = async (page, interactionSequence, names = SYNTHETIC_TRANSCRIPT_LABELS.assess, {
  sourceSetLabel = 'Synthetic assess transcript set', bundleLabel = 'Synthetic assess transcript selection',
} = {}) => {
  assert(Array.isArray(names) && names.length === 2 && names.every(name => typeof name === 'string' && name.trim()), 'PR_C_SYNTHETIC_BROWSER_ASSESS_SOURCE_FIXTURE_REJECTED');
  const workspace = page.getByTestId('enterprise-intelligence-workspace');
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-testid="enterprise-intelligence-workspace"]');
    return root?.getAttribute('data-projection-scope-ready') === 'true' || Boolean(root?.querySelector('[role="alert"]'));
  }, null, { timeout: 30_000 });
  if (await workspace.getAttribute('data-projection-scope-ready') !== 'true')
    throw new Error('PR_C_SYNTHETIC_BROWSER_ASSESS_PROJECTION_UNAVAILABLE');
  const library = page.locator('section[aria-labelledby="transcript-source-library-title"]');
  await library.waitFor({ state: 'visible' });
  for (const name of names) {
    const article = library.locator('article').filter({ has: page.getByText(name, { exact: true }) });
    assert.equal(await article.count(), 1, 'PR_C_SYNTHETIC_BROWSER_ASSESS_SOURCE_MISSING');
    const use = article.getByRole('button', { name: /^(?:Reuse version|Add)$/u });
    assert.equal(await use.count(), 1, 'PR_C_SYNTHETIC_BROWSER_ASSESS_SOURCE_CONTROL_MISSING');
    assert(await use.isEnabled(), 'PR_C_SYNTHETIC_BROWSER_ASSESS_SOURCE_DISABLED');
    await use.click();
    interactionSequence.push(`select:${safeLabel(name)}`);
  }
  assert.equal(await library.getByRole('button', { name: 'Remove', exact: true }).count(), names.length, 'PR_C_SYNTHETIC_BROWSER_SELECTION_NOT_RETAINED:select-two-assess-transcripts');
  const committed = library.locator('article').filter({ hasText: sourceSetLabel });
  assert.equal(await committed.count(), 1, 'PR_C_SYNTHETIC_BROWSER_SEEDED_SOURCE_SET_MISSING');
  assert((await committed.innerText()).includes(`${names.length} sources`), 'PR_C_SYNTHETIC_BROWSER_SEEDED_SOURCE_SET_COUNT');
  const navigation = page.getByTestId('enterprise-intelligence-workspace').getByRole('navigation', { name: 'Enterprise Intelligence surfaces' });
  await navigation.getByRole('button', { name: 'Candidate Review', exact: true }).click();
  interactionSequence.push('tab:candidate-review');
  const select = page.getByRole('combobox', { name: 'Locked input bundle', exact: true });
  const optionLabel = `${bundleLabel} · Input-bundle version 1 · ${names.length} sources`;
  await select.selectOption({ label: optionLabel }, { timeout: 10_000 });
  interactionSequence.push('select:exact-locked-assess-bundle');
  return { sourceCount: names.length, committedSourceSet: true, lockedInputBundle: true };
};

export const selectStudioTranscriptSources = async (page, interactionSequence, names = SYNTHETIC_TRANSCRIPT_LABELS.studioDraft, exactSources) => {
  assert(Array.isArray(names) && names.length === 2 && names.every(name => typeof name === 'string' && name.trim()), 'PR_C_SYNTHETIC_BROWSER_STUDIO_SOURCE_FIXTURE_REJECTED');
  const builder = page.locator('section[aria-labelledby="studio-source-package-builder-title"]');
  await builder.waitFor({ state: 'visible' });
  const sourceList = builder.locator('ul').first();
  for (const name of names) {
    const source = sourceList.locator('li').filter({ hasText: name });
    assert.equal(await source.count(), 1, 'PR_C_SYNTHETIC_BROWSER_STUDIO_SOURCE_MISSING');
    if (exactSources) {
      const exact = exactSources.filter(value => value.label === name);
      assert.equal(exact.length, 1, 'PR_C_SYNTHETIC_BROWSER_STUDIO_SOURCE_BINDING_COUNT');
      assert((await source.innerText()).includes(`exact version ${exact[0].sourceVersionId}`), 'PR_C_SYNTHETIC_BROWSER_STUDIO_SOURCE_VERSION_MISMATCH');
    }
    const use = source.getByRole('button', { name: 'Use in Studio', exact: true });
    if (await use.count()) { await use.click(); interactionSequence.push(`select:${safeLabel(name)}`); }
    assert.equal(await source.getByRole('button', { name: 'Remove', exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_STUDIO_SOURCE_NOT_SELECTED');
  }
  assert.equal(await builder.getByRole('button', { name: 'Remove', exact: true }).count(), names.length, 'PR_C_SYNTHETIC_BROWSER_STUDIO_SELECTION_COUNT');
  for (const name of SYNTHETIC_TRANSCRIPT_LABELS.assess)
    assert.equal(await sourceList.locator('li').filter({ hasText: name }).getByRole('button', { name: 'Remove', exact: true }).count(), 0, 'PR_C_SYNTHETIC_BROWSER_ASSESS_SOURCE_USED_IN_STUDIO');
  return { sourceCount: names.length, assessSourceCount: 0 };
};

// Claims covering the synthetic two-primitive/read-interaction decision trace.
// Evidence confirms the fixture's recorded values, including explicit unknowns;
// it does not turn unknown facts into known facts or alter deterministic scoring.
export const SYNTHETIC_ASSESS_REVIEW_CLAIMS = Object.freeze([
  'primitive.type', 'primitive.businessDisposition', 'primitive.workflowPatternKnown', 'primitive.rulesStable',
  'agent.irreducibleAmbiguity', 'agent.adaptiveNextStep', 'agent.toolOrPathSelection', 'agent.incrementalValue', 'agent.controllable',
  'interaction.mode', 'interaction.interfaceAvailable', 'interaction.operationCovered', 'interaction.apiDocumented', 'interaction.errorContract', 'interaction.dataClassified',
  'asset.strategicLifespan', 'asset.technicalHealth', 'asset.businessCriticality', 'asset.ownershipModel', 'asset.vendorRoadmap', 'asset.operatingStability', 'asset.accountableOwner',
]);

export const completeAssessDraft = async (page, interactionSequence) => {
  const workspace = page.getByTestId('assess-v2-workspace');
  await workspace.waitFor({ state: 'visible' });
  const create = workspace.getByRole('button', { name: 'New assessment (V2)', exact: true });
  await create.waitFor({ state: 'visible' });
  assert(await create.isEnabled(), 'PR_C_SYNTHETIC_BROWSER_ASSESS_CREATE_DISABLED');
  await create.click(); interactionSequence.push('create:assess-v2-case');
  await workspace.getByRole('button', { name: 'Add minimum working structure', exact: true }).click();
  interactionSequence.push('scaffold:assess-structure');
  await workspace.getByLabel('V2 case description', { exact: true }).fill('Manually reviewed synthetic Assess process and source observations.');
  await workspace.getByLabel('Primitive 1 primitive.rulesStable', { exact: true }).selectOption('true');
  await workspace.locator('summary').filter({ hasText: '3. Applications and interactions' }).click();
  await workspace.getByLabel('Application 1 accountable owner', { exact: true }).fill('Synthetic Assess owner');
  await workspace.getByLabel('Application 1 strategic lifespan', { exact: true }).selectOption('long');
  await workspace.getByLabel('Interaction 1 data classification', { exact: true }).selectOption('Internal');
  for (const fact of ['interfaceAvailable', 'operationCovered', 'apiDocumented', 'errorContract'])
    await workspace.getByLabel(`Interaction 1 ${fact}`, { exact: true }).selectOption('true');
  await workspace.locator('summary').filter({ hasText: '4. Agent necessity and evidence' }).click();
  await workspace.getByLabel('Evidence 1 claim IDs', { exact: true }).fill(SYNTHETIC_ASSESS_REVIEW_CLAIMS.join(', '));
  interactionSequence.push('link:manual-synthetic-decision-claims');
  interactionSequence.push('fill:manual-assess-facts');
  const save = workspace.getByRole('button', { name: 'Save V2 draft', exact: true });
  assert(await save.isEnabled(), 'PR_C_SYNTHETIC_BROWSER_ASSESS_SAVE_DISABLED');
  await save.click();
  await workspace.getByText('Draft saved as a new immutable authoring version.', { exact: true }).waitFor({ state: 'visible' });
  interactionSequence.push('save:assess-v2-draft');
  await workspace.getByRole('button', { name: 'Reload current draft', exact: true }).click();
  await workspace.getByText('Current immutable draft projection reloaded.', { exact: true }).waitFor({ state: 'visible' });
  interactionSequence.push('reload:assess-v2-draft');
  assert.equal(await workspace.getByLabel('Application 1 accountable owner', { exact: true }).inputValue(), 'Synthetic Assess owner');
  return { createdCase: true, manuallyCompletedFactCount: 7, savedWithControl: 'Save V2 draft', reloaded: true };
};

export const finalizeAssessDraftForReview = async (page, interactionSequence, { afterTranscriptApply = false } = {}) => {
  const workspace = page.getByTestId('assess-v2-workspace');
  await workspace.waitFor({ state: 'visible' });
  await workspace.getByRole('button', { name: 'Reload current draft', exact: true }).click();
  await workspace.getByText('Current immutable draft projection reloaded.', { exact: true }).waitFor({ state: 'visible' });
  if (afterTranscriptApply) {
    const evidencePanel = workspace.locator('details').filter({ has: page.locator('summary').filter({ hasText: '4. Agent necessity and evidence' }) });
    if (await evidencePanel.getAttribute('open') === null) await evidencePanel.locator('summary').click();
    const claims = evidencePanel.getByRole('textbox', { name: /^Evidence \d+ claim IDs$/u });
    assert.equal(await claims.count(), 2, 'PR_C_SYNTHETIC_BROWSER_ASSESS_APPLIED_EVIDENCE_COUNT');
    let linkedCount = 0;
    for (let index = 0; index < await claims.count(); index += 1) {
      if ((await claims.nth(index).inputValue()).trim()) continue;
      await claims.nth(index).fill('primitive.businessDisposition');
      await evidencePanel.getByLabel(`Evidence ${index + 1} owner`, { exact: true }).fill('Synthetic Assess owner');
      linkedCount += 1;
    }
    assert.equal(linkedCount, 1, 'PR_C_SYNTHETIC_BROWSER_ASSESS_UNLINKED_TRANSCRIPT_EVIDENCE_COUNT');
    await workspace.getByRole('button', { name: 'Save V2 draft', exact: true }).click();
    await workspace.getByText('Draft saved as a new immutable authoring version.', { exact: true }).waitFor({ state: 'visible' });
    await workspace.getByRole('button', { name: 'Reload current draft', exact: true }).click();
    await workspace.getByText('Current immutable draft projection reloaded.', { exact: true }).waitFor({ state: 'visible' });
    for (const input of await claims.all()) assert((await input.inputValue()).trim(), 'PR_C_SYNTHETIC_BROWSER_ASSESS_CLAIM_LINK_NOT_PERSISTED');
    interactionSequence.push('link:imported-transcript-evidence', 'save:claim-linked-assess-draft', 'reload:claim-linked-assess-draft');
  }
  const finalize = workspace.getByRole('button', { name: 'Finalize reviewer-ready Decision Pack', exact: true });
  assert(await finalize.isEnabled(), 'PR_C_SYNTHETIC_BROWSER_ASSESS_FINALIZE_DISABLED');
  await finalize.click();
  await workspace.getByTestId('assess-v2-decision-pack').waitFor({ state: 'visible' });
  interactionSequence.push('finalize:reviewer-ready-assess-decision');
  return { finalized: true };
};

export const assignAssessReviewer = async (page, interactionSequence) => {
  const workspace = page.getByTestId('assess-v2-workspace');
  const review = workspace.getByTestId('assess-v2-review-workspace');
  const reviewer = review.getByLabel('Eligible reviewer', { exact: true });
  await reviewer.selectOption({ label: 'Synthetic studio_reviewer' });
  await review.getByRole('button', { name: 'Commit reviewer assignment', exact: true }).click();
  await review.getByText('Reviewer assignment committed.', { exact: false }).waitFor({ state: 'visible' });
  interactionSequence.push('assign:independent-assess-reviewer');
  return { assignedReviewer: 'studio_reviewer' };
};

export const prepareAssessReviewApproval = async (page, interactionSequence) => {
  const review = page.getByTestId('assess-v2-review-workspace');
  await review.waitFor({ state: 'visible' });
  const evidence = review.locator('section[aria-labelledby="evidence-review-title"] article');
  assert.equal(await evidence.count(), 2, 'PR_C_SYNTHETIC_BROWSER_ASSESS_EVIDENCE_COUNT');
  assert.equal(await review.getByRole('button', { name: 'Accept evidence', exact: true }).count(), 2, 'PR_C_SYNTHETIC_BROWSER_ASSESS_PENDING_EVIDENCE_COUNT');
  for (let index = 0; index < 2; index += 1) {
    const item = evidence.nth(index);
    await item.getByLabel('Reviewer rationale', { exact: true }).fill('Independent synthetic source check of recorded values and explicit unknowns.');
    await item.getByRole('button', { name: 'Accept evidence', exact: true }).click();
    await item.getByRole('heading', { name: 'Evidence accepted', exact: true }).waitFor({ state: 'visible' });
  }
  assert.equal(await review.getByRole('button', { name: 'Accept evidence', exact: true }).count(), 0, 'PR_C_SYNTHETIC_BROWSER_ASSESS_UNREVIEWED_EVIDENCE');
  interactionSequence.push('attest:independent-assess-evidence');
  await review.getByLabel('Review rationale', { exact: true }).fill('All material synthetic Assess claims independently checked.');
  assert(await review.getByRole('button', { name: 'Approve reviewed decision', exact: true }).isEnabled(), 'PR_C_SYNTHETIC_BROWSER_ASSESS_APPROVAL_DISABLED');
  interactionSequence.push('fill:assess-review-rationale');
};

export const prepareAssessConflictPreview = async (page, interactionSequence, bundleLabel = 'Synthetic assess transcript selection') => {
  const review = page.locator('section[aria-labelledby="transcript-candidate-review-title"]');
  await review.waitFor({ state: 'visible' }).catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_ASSESS_CANDIDATE_REVIEW_MISSING'); });
  await review.getByRole('combobox', { name: 'Locked input bundle', exact: true })
    .selectOption({ label: `${bundleLabel} · Input-bundle version 1 · 2 sources` });
  const draft = review.getByRole('combobox', { name: 'Editable Assess draft', exact: true });
  const options = await draft.locator('option').all();
  assert.equal(options.length, 2, 'PR_C_SYNTHETIC_BROWSER_EDITABLE_ASSESS_DRAFT_COUNT');
  const caseId = await options[1].getAttribute('value');
  assert(caseId, 'PR_C_SYNTHETIC_BROWSER_EDITABLE_ASSESS_DRAFT_MISSING');
  await draft.selectOption(caseId);
  interactionSequence.push('select:exact-assess-draft');
  const include = review.getByRole('checkbox', { name: 'Include in preview', exact: true });
  await include.first().waitFor({ state: 'visible' }).catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_ASSESS_CANDIDATE_MISSING'); });
  assert(await include.count() >= 1, 'PR_C_SYNTHETIC_BROWSER_REVIEWED_ASSESS_CANDIDATE_MISSING');
  await include.first().check();
  interactionSequence.push('select:reviewed-assess-candidate');
  const preview = review.getByRole('button', { name: 'Preview exact Assess changes', exact: true });
  assert(await preview.isEnabled(), 'PR_C_SYNTHETIC_BROWSER_ASSESS_PREVIEW_DISABLED');
  await preview.click();
  await review.getByRole('heading', { name: 'Conflict: Case description', exact: true }).waitFor({ state: 'visible' })
    .catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_ASSESS_CONFLICT_PREVIEW_MISSING'); });
  interactionSequence.push('preview:material-assess-conflict');
  return { selectedDraft: true, reviewedCandidate: true, materialConflictCount: await review.locator('article[aria-labelledby^="conflict-"]').count() };
};

export const observeBrowserOnlyStep = async ({ page, checkpointId, stepId, state, interactionSequence }) => {
  const plan = BROWSER_ASSERTION_PLANS[stepId];
  assert(plan, `PR_C_SYNTHETIC_BROWSER_READ_PLAN_MISSING:${checkpointId}:${stepId}`);
  let observed;
  if (plan.kind === 'exact-studio-stop') {
    const candidate = state.get('ch02:approved-candidate');
    const result = await verifySyntheticStudioApprovalHasNoDeliveryResource(page, interactionSequence, {
      artifactVersionId: candidate.studioArtifactVersionId, artifactType: candidate.artifactType,
      expectedPackageIds: state.get('ch02:initial-packageIds'),
    });
    observed = { artifactVersionDigest: digest(result.artifactVersionId), packageCount: result.packageCount, handoffCount: result.handoffCount };
  } else if (plan.kind === 'exact-assess-handoff-ready') {
    const result = await verifySyntheticAssessHandoffReady(page, interactionSequence, state.get('seed:assess-handoff'));
    observed = { upstreamDigest: digest(result.upstreamHandoffId), sourceVersion: result.sourceVersion, requestAuthorized: result.requestAuthorized };
  } else if (plan.kind === 'exact-blocked-monitor-boundary') {
    const packageId = state.get('full-governed-package').packageId;
    const result = await verifySyntheticBlockedPackageMonitorUnchanged(page, interactionSequence, { packageId });
    const after = await readAuthorizedMonitorSnapshot(state.get('sessions').get('monitor_viewer'));
    assert.deepEqual(after, state.get('monitor:before-blocked'), 'PR_C_SYNTHETIC_BROWSER_BLOCKED_MONITOR_CHANGED');
    assert(!after.baselines.some(value => value.workPackageId === packageId), 'PR_C_SYNTHETIC_BROWSER_BLOCKED_BASELINE_PRESENT');
    interactionSequence.push('observe:supplementary-monitor-viewer-session-unchanged');
    observed = { packageDigest: digest(packageId), baselineControlCount: result.baselineControlCount,
      monitorProjection: result.monitorProjection, authorizedMonitorSnapshotDigest: digest(after),
      supplementaryMonitorIdentity: state.get('sessions').get('monitor_viewer').identity };
  } else if (plan.kind === 'primary-monitor-legacy') {
    await openSurface(page, 'monitor', interactionSequence);
    await verifySyntheticMonitorBaseline(page, interactionSequence, {
      packageId: state.get('full-governed-package')?.packageId, baselineId: state.get('ch08:baselineId'),
    });
    observed = { exactText: await exactVisibleText(page, ['Legacy initiative disposition — non-authoritative'], true) };
  } else if (plan.kind === 'authorized-status-and-citation') {
    const packageId = state.get('full-governed-package')?.packageId;
    const { selected } = await verifySyntheticMonitorBaseline(page, interactionSequence, { packageId, baselineId: state.get('ch08:baselineId') });
    assert.equal(await selected.getByText('approved', { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_MONITOR_TEXT_STATUS_MISSING');
    assert.equal(await selected.locator('dd').getByText('Assessed lineage', { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_MONITOR_TEXT_LINEAGE_MISSING');
    const author = state.get('sessions').get('delivery_author');
    await openSurface(author.page, 'delivery', interactionSequence);
    const authorWorkspace = (await selectDeliveryPackageById(author.page, packageId, interactionSequence)).workspace;
    await loadCompleteDeliveryItemSet(author.page, interactionSequence);
    await filterOneDeliveryItem(author.page, interactionSequence, SYNTHETIC_REVISED_ITEM_TITLE);
    const item = authorWorkspace.getByTestId(`delivery-item-${state.get('prereq:ch06:finalItemId')}`);
    assert.equal(await item.count(), 1, 'PR_C_SYNTHETIC_BROWSER_CITATION_ITEM_BINDING_MISSING');
    assert((await item.innerText()).includes('Decision: accepted'), 'PR_C_SYNTHETIC_BROWSER_TEXT_DECISION_MISSING');
    const citation = item.getByLabel('Exact source citation', { exact: true });
    assert.equal(await citation.count(), 1, 'PR_C_SYNTHETIC_BROWSER_TEXT_CITATION_MISSING');
    assert.match(await citation.innerText(), /^Source citation: BRD artifact v[1-9][0-9]* · /u);
    interactionSequence.push('observe:supplementary-author-exact-item-citation');
    observed = { packageDigest: digest(packageId), baselineDigest: digest(state.get('ch08:baselineId')),
      monitorTextDigest: digest(await selected.innerText()), citationDigest: digest(await citation.innerText()), supplementaryAuthorIdentity: author.identity };
  } else if (plan.kind === 'text') observed = { exactText: await exactVisibleText(page, plan.values, plan.all) };
  else if (plan.kind === 'testid') {
    const locator = page.getByTestId(plan.testId); await locator.waitFor({ state: 'visible' });
    observed = { testId: plan.testId, count: await locator.count(), textDigest: digest(await locator.first().innerText()) };
  } else if (plan.kind === 'testid-text') {
    const locator = page.getByTestId(plan.testId); await locator.waitFor({ state: 'visible' }); const text = await locator.first().innerText();
    for (const value of plan.values) assert(text.includes(value), `PR_C_SYNTHETIC_BROWSER_TESTID_TEXT_MISSING:${stepId}:${safeLabel(value)}`);
    observed = { testId: plan.testId, exactValues: plan.values, textDigest: digest(text) };
  } else if (plan.kind === 'control') {
    const control = await namedControl(page, plan.role, plan.names);
    if (plan.enabled) assert(await control.locator.isEnabled(), `PR_C_SYNTHETIC_BROWSER_CONTROL_DISABLED:${stepId}`);
    observed = { role: plan.role, name: control.name, enabled: await control.locator.isEnabled() };
  } else if (plan.kind === 'complete-assess-fields') {
    observed = await completeAssessDraft(page, interactionSequence);
  } else if (plan.kind === 'edit-structured-document') {
    const reviewerActorId = await resolveSyntheticStudioReviewerId(state.get('sessions'));
    observed = await editAndSubmitSyntheticStudioDraft(page, interactionSequence, { reviewerActorId });
  } else if (plan.kind === 'control-absence') {
    const counts = {}; for (const name of plan.names) counts[name] = await page.getByRole(plan.role, { name, exact: true }).count();
    assert(Object.values(counts).every(count => count === 0), `PR_C_SYNTHETIC_BROWSER_CONTROL_PRESENT:${stepId}`); observed = counts;
  } else if (plan.kind === 'disabled-control') {
    const control = await namedControl(page, plan.role, plan.names);
    assert(!(await control.locator.isEnabled()), `PR_C_SYNTHETIC_BROWSER_CONTROL_ENABLED:${stepId}`);
    observed = { control: control.name, disabled: true };
  } else if (plan.kind === 'assess-source-selection') observed = await selectAssessTranscriptSources(page, interactionSequence);
  else if (plan.kind === 'studio-source-selection') {
    const binding = checkpointId === 'CH-03' ? state.get('ch03:bundleBinding') : null;
    if (checkpointId === 'CH-03') assert(binding, 'PR_C_SYNTHETIC_BROWSER_STUDIO_SOURCE_BINDING_MISSING');
    observed = await selectStudioTranscriptSources(page, interactionSequence, SYNTHETIC_TRANSCRIPT_LABELS.studioDraft, binding?.sources);
  }
  else if (plan.kind === 'control-count') {
    let controls = null; let name = '';
    for (const candidate of plan.names) { const locator = page.getByRole(plan.role, { name: candidate, exact: true }); if (await locator.count() >= plan.minimum) { controls = locator; name = candidate; break; } }
    assert(controls, `PR_C_SYNTHETIC_BROWSER_CONTROL_COUNT:${stepId}`);
    if (plan.activate) for (let index = 0; index < plan.activate; index += 1) { await controls.nth(0).click(); interactionSequence.push(`activate:${safeLabel(name)}:${index + 1}`); }
    const selectedCount = plan.activate ? await page.getByRole('button', { name: 'Remove', exact: true }).count() : 0;
    if (plan.activate) assert(selectedCount >= plan.activate, `PR_C_SYNTHETIC_BROWSER_SELECTION_NOT_RETAINED:${stepId}`);
    observed = { role: plan.role, name, minimum: plan.minimum, selectedCount };
  } else if (plan.kind === 'select') {
    let select = null; let label = '';
    for (const candidate of plan.labels) { const locator = page.getByLabel(candidate, { exact: true }); if (await locator.count()) { select = locator.first(); label = candidate; break; } }
    assert(select, `PR_C_SYNTHETIC_BROWSER_SELECT_MISSING:${stepId}`);
    const options = await select.locator('option').allTextContents(); const option = options.find(value => value.includes(plan.option));
    assert(option, `PR_C_SYNTHETIC_BROWSER_OPTION_MISSING:${stepId}`); await select.selectOption({ label: option }); interactionSequence.push(`select:${safeLabel(label)}:${safeLabel(option)}`);
    observed = { label, option, valueDigest: digest(await select.inputValue()) };
  } else if (plan.kind === 'activate-text') {
    let previewScope = page;
    if (stepId === 'preview-approved-studio-handoff') {
      const candidate = state.get('seed:assessed-artifact');
      const selected = await selectSyntheticDeliveryArtifact(page, interactionSequence, {
        artifactVersionId: candidate.studioArtifactVersionId, artifactType: candidate.artifactType, planningOnly: false,
      });
      previewScope = selected.section;
    }
    const trigger = await exactVisibleText(previewScope, plan.values);
    assert.equal(trigger[0].count, 1, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_PREVIEW_AMBIGUOUS');
    await previewScope.getByText(trigger[0].value, { exact: true }).click(); interactionSequence.push(`activate:${safeLabel(trigger[0].value)}`);
    observed = { trigger, outcome: await exactVisibleText(previewScope, plan.outcome, true) };
  } else if (plan.kind === 'activate-control') {
    const control = await namedControl(page, plan.role, plan.names); await control.locator.click(); interactionSequence.push(`activate:${safeLabel(control.name)}`);
    const text = await page.locator('body').innerText(); for (const value of plan.outcome) assert(text.includes(value), `PR_C_SYNTHETIC_BROWSER_OUTCOME_MISSING:${stepId}`);
    observed = { control: control.name, exactOutcome: plan.outcome, outcomeDigest: digest(text) };
  } else if (plan.kind === 'delivery-item-history') {
    await filterOneDeliveryItem(page, interactionSequence, 'Synthetic governed work item revision');
    const control = await exactEnabledControl(page.getByTestId('governed-delivery-workspace'), 'button', ['Version diff and history'], `${checkpointId}:${stepId}`);
    await control.control.click(); interactionSequence.push('activate:exact-item-version-history');
    const text = await page.getByTestId('governed-delivery-workspace').innerText();
    for (const value of plan.outcome) assert(text.includes(value), `PR_C_SYNTHETIC_BROWSER_OUTCOME_MISSING:${stepId}`);
    observed = { control: control.label, exactOutcome: plan.outcome, outcomeDigest: digest(text) };
  } else if (plan.kind === 'delivery-citations') {
    const workspace = await selectDeliveryPackageForControl(page, 'Edit immutable descendant', interactionSequence, state.get('ch05:packageId'));
    const complete = await loadCompleteDeliveryItemSet(page, interactionSequence);
    const metrics = await deliveryCompleteSetMetrics(complete);
    const { selected, packageId } = await selectedDeliveryPackage(workspace);
    assert.equal(await selected.getByText('Studio handoff', { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_ASSESSED_DELIVERY_PACKAGE_REQUIRED');
    assert.equal(await selected.getByText('Assessed lineage', { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_ASSESSED_DELIVERY_PACKAGE_REQUIRED');
    const filterResult = await workspace.getByTestId('delivery-item-filter-result').innerText();
    assert.equal(filterResult, `${metrics.itemCount} matching items across ${metrics.itemCount} loaded`, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_LOADED_ITEM_COUNT_MISMATCH');
    const citations = workspace.getByLabel('Exact source citation');
    assert.equal(await citations.count(), Math.min(metrics.itemCount, 25), 'PR_C_SYNTHETIC_BROWSER_DETERMINISTIC_CITATION_MISSING');
    const citationIdentities = new Set();
    for (let index = 0; index < await citations.count(); index += 1) {
      const citation = (await citations.nth(index).innerText()).trim();
      const match = /^Source citation: ([A-Z]+ artifact v[1-9][0-9]*) · .+$/u.exec(citation);
      assert(match, 'PR_C_SYNTHETIC_BROWSER_DETERMINISTIC_CITATION_INVALID');
      citationIdentities.add(match[1]);
    }
    assert.equal(citationIdentities.size, 1, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_CITATION_VERSION_DRIFT');
    const citationIdentity = [...citationIdentities][0];
    state.set('full-governed-package', { packageId, itemCount: metrics.itemCount, pageCount: metrics.pageCount, citationIdentity });
    const snapshot = await readSyntheticDeliveryPackage(state.get('sessions').get('delivery_author'), packageId);
    assert.equal(snapshot.items.length, SYNTHETIC_GOVERNED_ITEM_COUNT, 'PR_C_SYNTHETIC_BROWSER_CANONICAL_ITEM_COUNT');
    assert.equal(metrics.itemCount, snapshot.items.length, 'PR_C_SYNTHETIC_BROWSER_PUBLIC_ITEM_COUNT_MISMATCH');
    const canonicalIds = snapshot.items.map(item => item.aggregateId).sort();
    assert.equal(new Set(canonicalIds).size, snapshot.items.length, 'PR_C_SYNTHETIC_BROWSER_CANONICAL_ITEM_DUPLICATE');
    const citationLocators = new Set();
    for (const item of snapshot.items) {
      const citation = item.sourceCitation;
      assert(citation && `${String(citation.artifactType).toUpperCase()} artifact v${citation.artifactVersion}` === citationIdentity
        && typeof citation.sectionLocator === 'string' && citation.sectionLocator.trim(), 'PR_C_SYNTHETIC_BROWSER_CANONICAL_CITATION_MISMATCH');
      citationLocators.add(citation.sectionLocator);
    }
    assert.equal(citationLocators.size, snapshot.items.length, 'PR_C_SYNTHETIC_BROWSER_CANONICAL_CITATION_DUPLICATE');
    await verifyRenderedDeliveryItemIds(selected, canonicalIds);
    state.set('full-governed-package', { ...state.get('full-governed-package'), itemIds: canonicalIds });
    state.set('ch06:selectedItemId', canonicalIds[0]);
    state.set('ch06:selectedItemTitle', snapshot.items.find(item => item.aggregateId === canonicalIds[0]).title);
    observed = { packageIdDigest: digest(packageId), itemCount: metrics.itemCount, pageCount: metrics.pageCount, citationIdentity };
  } else if (plan.kind === 'delivery-complete-set') {
    const expected = state.get('full-governed-package');
    assert(expected?.packageId, 'PR_C_SYNTHETIC_BROWSER_FULL_GOVERNED_PACKAGE_BINDING_MISSING');
    const workspace = await selectDeliveryPackageForControl(page, 'Request package changes', interactionSequence, expected.packageId);
    const metrics = await deliveryCompleteSetMetrics(await loadCompleteDeliveryItemSet(page, interactionSequence));
    assert.equal(metrics.itemCount, expected.itemCount, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_COMPLETE_ITEM_COUNT_DRIFT');
    assert.equal(metrics.pageCount, expected.pageCount, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_COMPLETE_PAGE_COUNT_DRIFT');
    const snapshot = await readSyntheticDeliveryPackage(state.get('sessions').get('delivery_reviewer'), expected.packageId);
    assert.deepEqual(snapshot.items.map(item => item.aggregateId).sort(), expected.itemIds, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_COMPLETE_ITEM_SET_DRIFT');
    await verifyRenderedDeliveryItemIds((await selectedDeliveryPackage(workspace)).selected, expected.itemIds);
    observed = { packageIdDigest: digest(expected.packageId), itemCount: metrics.itemCount, pageCount: metrics.pageCount, complete: true };
  } else if (plan.kind === 'package-count-unchanged') {
    const before = state.get(plan.stateKey); const after = await packageCount(page); assert(Number.isSafeInteger(before), `PR_C_SYNTHETIC_BROWSER_SNAPSHOT_MISSING:${plan.stateKey}`); assert.equal(after, before, `PR_C_SYNTHETIC_BROWSER_PACKAGE_COUNT_CHANGED:${stepId}`); observed = { before, after };
  } else if (plan.kind === 'exact-planning-baseline') {
    const prefix = plan.manual ? 'prereq:ch11' : 'prereq:ch10';
    const { selected, baselineId } = await verifySyntheticMonitorBaseline(page, interactionSequence, {
      packageId: state.get(`${prefix}:packageId`), baselineId: state.get(`${prefix}:baselineId`),
    });
    assert.equal(await selected.locator('dd').getByText('Not assessed · Planning only', { exact: true }).count(), 1,
      'PR_C_SYNTHETIC_BROWSER_PLANNING_LINEAGE_MISSING');
    observed = { baselineDigest: digest(baselineId), packageDigest: digest(state.get(`${prefix}:packageId`)),
      planningOnly: true, manual: plan.manual, exactBaselineTextDigest: digest(await selected.innerText()) };
  } else if (plan.kind === 'baseline-count') {
    const expected = state.get(plan.stateKey); const actual = await baselineCount(page); assert(Number.isSafeInteger(expected) && actual === expected, `PR_C_SYNTHETIC_BROWSER_BASELINE_COUNT:${stepId}`); observed = { expected, actual };
  } else if (plan.kind === 'text-and-control-absence') {
    const exactText = await exactVisibleText(page, plan.values, true); const counts = {}; for (const name of plan.names) counts[name] = await page.getByRole(plan.role, { name, exact: true }).count(); assert(Object.values(counts).every(count => count === 0)); observed = { exactText, absentControls: counts };
  } else if (plan.kind === 'control-and-text') {
    const control = await namedControl(page, plan.role, plan.names); await control.locator.click(); interactionSequence.push(`activate:${safeLabel(control.name)}`); observed = { control: control.name, exactText: await exactVisibleText(page, plan.values) };
  } else if (plan.kind === 'privacy') observed = { privacyDigest: await assertNoRawHashesOrApprovalIdentities(page) };
  else if (plan.kind === 'monitor-control-absence') observed = { absenceDigest: await assertNoMonitorMutationControls(page) };
  else if (plan.kind === 'layout') observed = { layoutDigest: await assertLayout(page) };
  else if (plan.kind === 'viewport') { const viewport = page.viewportSize(); assert.equal(viewport?.width, plan.width, 'PR_C_SYNTHETIC_BROWSER_VIEWPORT_WIDTH_MISMATCH'); assert.equal(viewport?.height, plan.height, 'PR_C_SYNTHETIC_BROWSER_VIEWPORT_HEIGHT_MISMATCH'); observed = viewport; }
  else if (plan.kind === 'zoom') { const value = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).zoom || '1')); assert.equal(value, plan.value, 'PR_C_SYNTHETIC_BROWSER_ZOOM_MISMATCH'); observed = { zoom: value }; }
  else if (plan.kind === 'keyboard-reachability') {
    if (stepId === 'keyboard-only-item-edit') await isolateFirstActionableDeliveryItem(page, interactionSequence, state.get('seed:manual-packageId'), SYNTHETIC_MANUAL_ITEM_TITLE);
    const root = stepId === 'keyboard-only-handoff'
      ? await prepareKeyboardOnlyHandoff(page, interactionSequence, state)
      : page.getByTestId('governed-delivery-workspace');
    const control = await exactEnabledControl(root, plan.role, plan.names, `${checkpointId}:${stepId}`);
    const tabCount = await reachControlWithKeyboard(page, control.control, interactionSequence);
    observed = { control: control.label, keyboardReachable: true, activated: false, tabCount };
  }
  else if (plan.kind === 'focused-alert') {
    const { workspace } = await isolateFirstActionableDeliveryItem(page, interactionSequence, state.get('seed:manual-packageId'), SYNTHETIC_MANUAL_ITEM_TITLE);
    const edit = await exactEnabledControl(workspace, 'button', ['Edit immutable descendant'], `${checkpointId}:${stepId}`);
    await reachControlWithKeyboard(page, edit.control, interactionSequence, { resetFocus: false });
    await page.keyboard.press('Enter'); interactionSequence.push('activate:edit-dialog-without-domain-command');
    const dialog = page.getByRole('dialog').last(); assert(await dialog.count() && await dialog.isVisible(), 'PR_C_SYNTHETIC_BROWSER_A11Y_DIALOG_MISSING');
    const title = dialog.getByLabel('Item title', { exact: true }); assert(await title.count(), 'PR_C_SYNTHETIC_BROWSER_A11Y_ITEM_TITLE_MISSING'); await title.fill('Preserved synthetic invalid input'); interactionSequence.push('fill:item-title');
    await reachControlWithKeyboard(page, dialog.getByRole('button', { name: 'Confirm', exact: true }), interactionSequence, { resetFocus: false });
    await page.keyboard.press('Enter'); interactionSequence.push('activate:dialog-confirm-without-rationale');
    const alert = dialog.getByRole('alert').last(); await alert.waitFor({ state: 'visible' });
    // React schedules focus after committing the validation summary. Observe that
    // transition without assigning focus from the acceptance runner.
    await page.waitForFunction(node => node === document.activeElement, await alert.elementHandle()).catch(() => assert.fail('PR_C_SYNTHETIC_BROWSER_A11Y_ALERT_NOT_FOCUSED'));
    assert(await alert.evaluate(node => node === document.activeElement), 'PR_C_SYNTHETIC_BROWSER_A11Y_ALERT_NOT_FOCUSED'); observed = { role: 'alert', focused: true, textDigest: digest(await alert.innerText()) };
  }
  else if (plan.kind === 'preserved-input') { const input = page.getByLabel(plan.label, { exact: true }).last(); const value = await input.inputValue(); assert(value.trim().length > 0, 'PR_C_SYNTHETIC_BROWSER_A11Y_INPUT_NOT_PRESERVED'); observed = { label: plan.label, valueDigest: digest(value) }; }
  else if (plan.kind === 'focus-return') {
    const dialog = page.getByRole('dialog').last();
    assert(await dialog.count() && await dialog.isVisible(), 'PR_C_SYNTHETIC_BROWSER_FOCUS_DIALOG_MISSING');
    await reachControlWithKeyboard(page, dialog.getByRole('button', { name: 'Cancel', exact: true }), interactionSequence, { resetFocus: false });
    await page.keyboard.press('Enter'); interactionSequence.push('activate:dialog-cancel');
    const control = await exactEnabledControl(page.getByTestId('governed-delivery-workspace'), plan.role, plan.names, `${checkpointId}:${stepId}`);
    await page.waitForFunction(node => node === document.activeElement, await control.control.elementHandle()).catch(() => assert.fail('PR_C_SYNTHETIC_BROWSER_A11Y_FOCUS_NOT_RETURNED'));
    assert(await control.control.evaluate(node => node === document.activeElement), 'PR_C_SYNTHETIC_BROWSER_A11Y_FOCUS_NOT_RETURNED'); observed = { control: control.label, focused: true };
  }
  else if (plan.kind === 'read-only-history') observed = await verifySyntheticReadOnlyMonitorHistory(page, interactionSequence, state.get('retained-monitor-history'));
  else if (plan.kind === 'monitor-parity') {
    // The Monitor-only actor cannot enter Assess or Delivery. Use the existing
    // independently authenticated approver for the supplementary read-only view.
    const approver = state.get('sessions')?.get('delivery_approver');
    assert(approver?.page && approver.page !== page && approver.identity,
      'PR_C_SYNTHETIC_BROWSER_MONITOR_PARITY_SESSION_MISSING');
    await openSurface(approver.page, 'delivery', interactionSequence);
    await approver.page.getByTestId('enterprise-intelligence-workspace')
      .getByRole('navigation', { name: 'Enterprise Intelligence surfaces' })
      .getByRole('button', { name: 'Monitor Baseline', exact: true }).click();
    interactionSequence.push('observe:supplementary-approver-enterprise-monitor');
    await openSurface(page, 'monitor', interactionSequence);
    const readBaseline = async target => {
      const { selected } = await verifySyntheticMonitorBaseline(target, interactionSequence, {
        packageId: state.get('full-governed-package')?.packageId, baselineId: state.get('ch08:baselineId'),
      });
      const attributes = {};
      for (const name of ['data-baseline-id', 'data-baseline-version', 'data-package-id', 'data-package-version', 'data-accepted-item-count', 'data-accepted-type-counts']) {
        attributes[name] = await selected.getAttribute(name);
        assert(attributes[name], 'PR_C_SYNTHETIC_BROWSER_MONITOR_PARITY_FACT_MISSING');
      }
      // Surface headings differ by design; the exact baseline article must agree.
      return digest({ attributes, text: await selected.innerText() });
    };
    const enterpriseDigest = await readBaseline(approver.page);
    const primaryDigest = await readBaseline(page);
    assert.equal(primaryDigest, enterpriseDigest, 'PR_C_SYNTHETIC_BROWSER_MONITOR_PARITY_MISMATCH');
    observed = { enterpriseDigest, primaryDigest, supplementaryApproverIdentity: approver.identity };
  }
  else throw new Error(`PR_C_SYNTHETIC_BROWSER_PLAN_KIND_REJECTED:${stepId}:${plan.kind}`);
  return digest({ checkpointId, stepId, observed });
};

const stepAssertions = async ({ page, checkpointId, stepId, providerEgress, state, interactionSequence, proof }) => {
  const assertions = [];
  const add = (assertionId, kind, actualDigest) => assertions.push({ assertionId: safeLabel(assertionId), kind, result: 'passed', actualDigest });
  const requiredId = requiredSyntheticBrowserAssertionId(checkpointId, stepId);
  if (SERVER_STEP_KEYS.has(`${checkpointId}:${stepId}`)) {
    assert(proof.serverAnchor && proof.serverBinding, `PR_C_SYNTHETIC_BROWSER_REQUIRED_PROOF_MISSING:${checkpointId}:${stepId}`);
    add(requiredId, 'network', digest({ stepId, action: proof.serverBinding.action, result: proof.serverBinding.result, anchor: proof.serverAnchor, binding: proof.serverBinding }));
    if (stepId === 'simulate-response-loss') add('ch-13.confirmed-response-loss-and-retry', 'network', digest(state.get('recovery:transport-facts')));
    if (stepId === 'create-read-only-manual-baseline') {
      const { selected } = await verifySyntheticDeliveryLineage(page, interactionSequence, { packageId: state.get('prereq:ch11:packageId'), manual: true });
      const manualCitation = page.getByText('Manual item · no fabricated Studio or Assess citation', { exact: true });
      assert(await manualCitation.count() > 0, 'PR_C_SYNTHETIC_BROWSER_MANUAL_CITATION_MISSING');
      add('ch-11.exact-manual-package-lineage', 'dom', digest(await selected.innerText()));
    }
  } else add(requiredId, stepId.startsWith('keyboard-') || stepId.includes('focus') ? 'accessibility' : stepId.includes('overflow') || stepId.includes('viewport') || stepId.includes('zoom') || stepId.includes('chrome') || stepId.includes('pixel') ? 'layout' : 'dom', await observeBrowserOnlyStep({ page, checkpointId, stepId, state, interactionSequence }));
  assert.equal(providerEgress.length, 0, `PR_C_SYNTHETIC_BROWSER_PROVIDER_EGRESS:${checkpointId}:${stepId}`);
  add(`${checkpointId.toLowerCase()}.${stepId}.zero-provider-egress`, 'network', digest({ providerEgressCount: 0 }));
  return assertions.sort((left, right) => left.assertionId.localeCompare(right.assertionId));
};

const performSpecialInteraction = async (page, stepId, interactionSequence) => {
  if (stepId === 'pixel-7-journey') { await page.setViewportSize({ width: 412, height: 915 }); interactionSequence.push('viewport:pixel-7'); }
  else if (stepId === 'desktop-chrome-journey') { await page.setViewportSize({ width: 1280, height: 720 }); interactionSequence.push('viewport:desktop-chrome'); }
  else if (stepId === 'zoom-200-percent') { await page.evaluate(() => { document.documentElement.style.zoom = '2'; }); interactionSequence.push('zoom:200-percent'); }
};

export const buildBrowserExecutionCatalog = () => CONTROLLED_HUMAN_EXECUTION_ORDER.flatMap(checkpointId => {
  const checkpoint = CATALOG_BY_CHECKPOINT.get(checkpointId);
  assert(checkpoint, `PR_C_SYNTHETIC_BROWSER_CHECKPOINT_MISSING:${checkpointId}`);
  return checkpoint.steps.map(step => {
    const key = `${checkpointId}:${step.stepId}`;
    const serverAction = SERVER_ACTION_BY_STEP.get(key) ?? null;
    if (serverAction) assert((ACTION_LABEL_OVERRIDES[key] ?? ACTION_LABELS[serverAction.action])?.length, `PR_C_SYNTHETIC_BROWSER_ACTION_PLAN_MISSING:${key}`);
    else assert(BROWSER_ASSERTION_PLANS[step.stepId], `PR_C_SYNTHETIC_BROWSER_READ_PLAN_MISSING:${key}`);
    const surface = step.stepId === 'verify-history-readable-and-actions-absent' || (checkpointId === 'CH-14' && step.personaKey === 'monitor_viewer') ? 'monitor'
      : checkpointId === 'CH-01' && step.stepId === 'complete-remaining-assess-fields-manually' ? 'assess-case'
      : checkpointId === 'CH-01' && ['approve-assess-result', 'decline-studio-handoff', 'verify-no-studio-resource'].includes(step.stepId) ? 'assess-review'
      : checkpointId === 'CH-02' && step.stepId === 'stop-with-no-delivery-resource' ? 'delivery'
      : checkpointId === 'CH-02' || checkpointId === 'CH-03' ? 'studio-docs'
      : checkpointId === 'CH-10' && step.stepId === 'create-direct-studio-plan' ? 'studio-docs'
      : checkpointId === 'CH-10' && step.stepId === 'verify-direct-plan-remains-not-assessed' ? 'monitor'
        : checkpointId === 'CH-10' ? 'delivery'
          : checkpointId === 'CH-11' && step.stepId === 'verify-manual-path-remains-not-assessed' ? 'monitor'
            : SURFACE_BY_CHECKPOINT[checkpointId];
    return Object.freeze({ checkpointId, journeyId: checkpoint.journeyId, testIds: checkpoint.testIds, ...step, surface, serverAction });
  });
});

export const validateBrowserCampaignShape = campaign => {
  const catalog = buildBrowserExecutionCatalog();
  assert.equal(catalog.length, 84, 'PR_C_SYNTHETIC_BROWSER_CATALOG_COUNT');
  assert.equal(campaign.checkpoints?.length, 14, 'PR_C_SYNTHETIC_BROWSER_CHECKPOINT_COUNT');
  const steps = campaign.checkpoints.flatMap(record => record.steps.map(step => ({ checkpointId: record.checkpointId, ...step })));
  assert.equal(steps.length, 84, 'PR_C_SYNTHETIC_BROWSER_STEP_COUNT');
  assert.deepEqual(campaign.checkpoints.map(record => record.checkpointId), CONTROLLED_HUMAN_CATALOG.map(record => record.checkpointId), 'PR_C_SYNTHETIC_BROWSER_CHECKPOINT_ORDER');
  assert.deepEqual(steps.map(step => `${step.checkpointId}:${step.stepId}`), CONTROLLED_HUMAN_CATALOG.flatMap(record => record.steps.map(step => `${record.checkpointId}:${step.stepId}`)), 'PR_C_SYNTHETIC_BROWSER_STEP_ORDER');
  for (const step of steps) {
    assert.equal(step.outcome, 'passed');
    assert(DIGEST.test(step.applicationActorDigest) && DIGEST.test(step.applicationSessionDigest));
    assert(step.browserArtifact.assertions.length >= 2);
    assert.deepEqual(step.browserArtifact.assertions, [...step.browserArtifact.assertions].sort((a, b) => a.assertionId.localeCompare(b.assertionId)));
    assert(step.browserArtifact.assertions.every(item => DIGEST.test(item.actualDigest) && item.result === 'passed'));
    assert(step.browserArtifact.assertions.some(item => item.assertionId === requiredSyntheticBrowserAssertionId(step.checkpointId, step.stepId)), `PR_C_SYNTHETIC_BROWSER_REQUIRED_ASSERTION_MISSING:${step.checkpointId}:${step.stepId}`);
    const requiresProof = SERVER_STEP_KEYS.has(`${step.checkpointId}:${step.stepId}`);
    assert(requiresProof ? Boolean(step.browserArtifact.serverAnchor && step.browserArtifact.serverBinding) : step.browserArtifact.serverAnchor === null && step.browserArtifact.serverBinding === null,
      `PR_C_SYNTHETIC_BROWSER_PROOF_PAIR:${step.checkpointId}:${step.stepId}`);
  }
  assert.deepEqual(Object.keys(campaign).sort(), ['binding', 'checkpoints', 'completedAt', 'personas']);
  return campaign;
};

const createCheckpointRecords = () => new Map(CONTROLLED_HUMAN_CATALOG.map(checkpoint => [checkpoint.checkpointId, {
  checkpointId: checkpoint.checkpointId, journeyId: checkpoint.journeyId, testIds: checkpoint.testIds, outcome: 'passed', steps: [],
}]));

const attachProviderObserver = (page, providerEgress) => page.on('request', request => {
  let host = '';
  try { host = new URL(request.url()).hostname; } catch { return; }
  if (SAFE_PROVIDER_HOSTS.some(pattern => pattern.test(host))) providerEgress.push(digest({ host, method: request.method() }));
});

export const snapshotBeforeServerAction = async (page, key, state) => {
  if (key === 'CH-04:request-exact-studio-handoff') state.set('before-request', await packageCount(page));
  if (key === 'CH-04:request-handoff-changes') state.set('before-changes', await packageCount(page));
  if (key === 'CH-04:reject-new-exact-handoff-request') state.set('before-rejection', await packageCount(page));
  if (key === 'CH-05:replay-consumption-same-target') state.set('before-consumption-replay', await packageCount(page));
  if (key === 'CH-08:create-baseline-with-exact-package-selectors') state.set('baseline-before-create', await baselineCount(page));
  if (key === 'CH-08:replay-baseline-creation') state.set('baseline-after-create', await baselineCount(page));
};

export const assertSyntheticCommandContinuity = (planned, command, state) => {
  const key = `${planned.checkpointId}:${planned.stepId}`;
  const payload = command.body?.payload;
  const exact = (actual, expected, code) => {
    assert(expected, `PR_C_SYNTHETIC_BROWSER_${code}_BINDING_MISSING`);
    assert.deepEqual(actual, expected, `PR_C_SYNTHETIC_BROWSER_${code}_MISMATCH`);
  };
  if (key === 'CH-03:request-studio-handoff') {
    exact(payload?.targetInputBundle, state.get('ch03:bundleBinding')?.inputBundle, 'STUDIO_REQUEST_BUNDLE');
    exact(payload?.upstreamHandoffId, state.get('seed:assess-handoff')?.upstreamHandoffId, 'STUDIO_REQUEST_UPSTREAM');
  }
  if (['CH-03:review-studio-handoff', 'CH-03:approve-studio-handoff', 'CH-03:accept-studio-handoff'].includes(key))
    exact(payload?.handoffId, state.get('ch03:handoffId'), 'STUDIO_REQUEST_ID');
  if (key === 'CH-03:approve-hybrid-studio-document') exact(payload?.artifactId, state.get('prereq:ch03:artifactId'), 'HYBRID_ARTIFACT');
  if (['CH-04:request-exact-studio-handoff', 'CH-05:request-fresh-exact-handoff', 'CH-10:handoff-direct-studio-plan'].includes(key)) {
    const candidate = state.get(planned.checkpointId === 'CH-10' ? 'prereq:ch10:approvedCandidate' : 'seed:assessed-artifact');
    exact(payload?.studioArtifactId, candidate?.studioArtifactId, 'DELIVERY_SOURCE_ARTIFACT');
    exact(payload?.studioArtifactVersionId, candidate?.studioArtifactVersionId, 'DELIVERY_SOURCE_VERSION');
  }
  const handoffKey = {
    'CH-04:request-handoff-changes': 'ch04:handoffId', 'CH-04:reject-new-exact-handoff-request': 'prereq:ch04:replacementHandoffId',
    'CH-05:review-handoff-independently': 'ch05:handoffId', 'CH-05:approve-handoff-independently': 'ch05:handoffId',
    'CH-05:consume-approved-handoff-once': 'ch05:handoffId',
  }[key];
  if (handoffKey) exact(payload?.handoffId, state.get(handoffKey), 'DELIVERY_HANDOFF');
  if (key === 'CH-06:edit-one-item-with-rationale') exact(payload?.itemAggregateId, state.get('ch06:selectedItemId'), 'DELIVERY_EDIT_ITEM');
  if (['CH-06:decide-every-current-proposal', 'CH-07:decide-revised-descendant'].includes(key))
    exact(payload?.itemAggregateId, state.get('prereq:ch06:finalItemId'), 'DELIVERY_DECISION_ITEM');
  if (key === 'CH-10:create-direct-studio-plan') {
    exact(payload?.artifactType, 'pdd', 'DIRECT_ARTIFACT_TYPE');
    exact(payload?.sourceMode, 'direct_transcript_bundle', 'DIRECT_SOURCE_MODE');
    exact(payload?.studioInputBundle, state.get('ch03:bundleBinding')?.inputBundle, 'DIRECT_SOURCE_BUNDLE');
  }
  if (key === 'CH-08:create-baseline-with-exact-package-selectors') exact(payload?.workPackageId, state.get('full-governed-package')?.packageId, 'BASELINE_PACKAGE');
  if (planned.checkpointId === 'CH-07' && planned.serverAction.action.startsWith('delivery.package.'))
    exact(payload?.workPackageId, state.get('full-governed-package')?.packageId, 'REVISED_PACKAGE');
  if (key === 'CH-13:simulate-response-loss') exact(payload?.workPackageId, state.get('seed:recovery-packageId'), 'RECOVERY_PACKAGE');
};

// These selectors are private runner state. Only their digests enter evidence.
export const retainSyntheticCommandState = async (planned, session, state, proof, observedCommand) => {
  const key = `${planned.checkpointId}:${planned.stepId}`;
  const resourceKeys = {
    'CH-02:approve-studio-document': 'ch02:artifactId',
    'CH-03:request-studio-handoff': 'ch03:handoffId',
    'CH-03:accept-studio-handoff': 'prereq:ch03:artifactId',
    'CH-04:request-exact-studio-handoff': 'ch04:handoffId',
    'CH-05:request-fresh-exact-handoff': 'ch05:handoffId',
    'CH-05:consume-approved-handoff-once': 'ch05:packageId',
    'CH-08:create-baseline-with-exact-package-selectors': 'ch08:baselineId',
    'CH-10:create-direct-studio-plan': 'prereq:ch10:artifactId',
    'CH-10:handoff-direct-studio-plan': 'prereq:ch10:handoffId',
    'CH-11:create-manual-delivery-package': 'prereq:ch11:packageId',
    'CH-11:create-read-only-manual-baseline': 'prereq:ch11:baselineId',
    'CH-13:simulate-response-loss': 'recovery:packageId',
  };
  const replayKeys = {
    'CH-05:consume-approved-handoff-once': 'replay:delivery.handoff.consume',
    'CH-08:create-baseline-with-exact-package-selectors': 'replay:monitor.baseline.create',
  };
  if (!resourceKeys[key] && !replayKeys[key] && !(
    ['CH-03', 'CH-04', 'CH-05', 'CH-06', 'CH-07'].includes(planned.checkpointId)
    && key !== 'CH-03:generate-source-bound-document')) return;
  const command = observedCommand ?? await session.api.lastCommand();
  const expectedAction = planned.serverAction.action.startsWith('handoff.') ? `studio.${planned.serverAction.action}` : planned.serverAction.action;
  assert(command?.commandType === expectedAction && command.response?.ok === true
    && digest({ requestId: command.requestId }) === proof.serverAnchor.requestDigest,
  'PR_C_SYNTHETIC_BROWSER_COMMAND_PROOF_BINDING_MISMATCH');
  assertSyntheticCommandContinuity(planned, command, state);
  if (resourceKeys[key]) state.set(resourceKeys[key], syntheticCommandResourceId(command.response, expectedAction));
  if (replayKeys[key]) state.set(replayKeys[key], { body: command.body, resourceDigest: proof.serverBinding.resourceDigest });
  if (key === 'CH-10:create-direct-studio-plan') state.set('prereq:ch10:catalogBindingToken', proof.serverBinding.bindingToken);
  if (key === 'CH-04:request-exact-studio-handoff') state.set('prereq:ch04:requestSource', command.body.payload);
  if (key === 'CH-06:edit-one-item-with-rationale') state.set('prereq:ch06:finalItemId', command.body.payload.itemAggregateId);
};

const prepareApiEvidenceDescriptor = async (planned, sessions, state, binding) => {
  if (!isSyntheticApiEvidenceStep(planned)) return undefined;
  const inputs = { workspaceId: state.get('exercise:scope').workspaceId,
    authorizationVersion: binding.personaAuthorizationVersions[planned.personaKey],
    replay: state.get(`replay:${planned.serverAction.action}`) };
  if (planned.stepId === 'reject-stale-authorization') {
    const snapshot = await readSyntheticDeliveryPackage(sessions.get('delivery_author'), state.get('recovery:packageId'));
    inputs.deliveryPackage = snapshot.deliveryPackage;
  }
  if (planned.stepId === 'reject-stale-source-change')
    inputs.sourceArtifact = await readSyntheticStudioArtifact(sessions.get('requester'), state.get('seed:assessed-artifact').studioArtifactId);
  return buildSyntheticApiEvidenceDescriptor(planned, inputs);
};

const readAuthorizedMonitorSnapshot = async session => {
  const context = await session.api.context();
  const response = await session.api.invoke('enterprise-intelligence-query', { organizationId: context.organizationId,
    workspaceId: context.workspaceId, expectedAuthorizationVersion: context.authorizationVersion });
  const projection = (response.projection ?? response).monitorApprovedBaselines;
  assert(projection?.organizationId === context.organizationId && projection.workspaceId === context.workspaceId
    && Array.isArray(projection.baselines), 'PR_C_SYNTHETIC_BROWSER_AUTHORIZED_MONITOR_SNAPSHOT_MISSING');
  return projection;
};

export const summarizePrerequisiteInteractions = values => {
  const result = [];
  for (let index = 0; index < values.length;) {
    const value = values[index]; let end = index + 1;
    while (end < values.length && values[end] === value) end += 1;
    result.push(end - index > 1 ? `${value}:count-${end - index}` : value); index = end;
  }
  return result;
};

export const executePlannedStep = async ({ planned, session, providerEgress, state, nextTime, apiDescriptor, exerciseDigest, prerequisiteInteractions = [] }) => {
  const { page, identity } = session;
  const interactionSequence = summarizePrerequisiteInteractions(prerequisiteInteractions);
  const startedAt = nextTime();
  // Each persona signs in before the campaign. These cross-actor observations
  // must fetch committed state, even when their existing shell is already usable.
  // Preserve CH-13 reconciliation and CH-14 open-dialog continuations.
  const crossActorDeliveryRead = planned.checkpointId === 'CH-06'
    && ['inspect-deterministic-item-citations', 'verify-complete-bounded-item-set'].includes(planned.stepId);
  if (planned.serverAction || planned.surface === 'monitor' || crossActorDeliveryRead) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForUsablePage(page);
    interactionSequence.push('reload:fresh-server-projection');
  }
  const apiEvidence = isSyntheticApiEvidenceStep(planned);
  const dialogContinuation = planned.checkpointId === 'CH-14' && ['preserve-invalid-input', 'logical-focus-return'].includes(planned.stepId);
  if (!dialogContinuation && !(apiEvidence && planned.serverAction.observationKind === 'negative_attempt'))
    await openSurface(page, planned.surface, interactionSequence, planned.stepId);
  if (planned.checkpointId === 'CH-09') await verifySyntheticMonitorBaseline(page, interactionSequence, {
    packageId: state.get('full-governed-package')?.packageId, baselineId: state.get('ch08:baselineId'),
  });
  await performSpecialInteraction(page, planned.stepId, interactionSequence);
  let proof = { serverAnchor: null, serverBinding: null };
  if (planned.serverAction) {
    const key = `${planned.checkpointId}:${planned.stepId}`;
    if (key === 'CH-01:resolve-material-assess-conflict') {
      const prepared = await prepareAssessConflictPreview(page, interactionSequence);
      assert.equal(prepared.materialConflictCount, 1, 'PR_C_SYNTHETIC_BROWSER_ASSESS_CONFLICT_COUNT');
    }
    if (key === 'CH-01:approve-assess-result') {
      assert.equal(planned.personaKey, 'studio_reviewer', 'PR_C_SYNTHETIC_BROWSER_ASSESS_REVIEW_ACTOR_REQUIRED');
      await assignAssessReviewer(page, interactionSequence);
      await prepareAssessReviewApproval(page, interactionSequence);
    }
    await snapshotBeforeServerAction(page, key, state);
    await armServerStep(page, planned.checkpointId, planned.stepId, interactionSequence);
    if (apiEvidence) {
      const completed = await executeSyntheticApiEvidenceAction({ api: session.api, planned, descriptor: apiDescriptor, exerciseDigest, interactionSequence });
      // Clear the local UI arm after server-owned completion and read back the
      // durable proof through the same banner used by ordinary browser actions.
      await page.reload({ waitUntil: 'domcontentloaded' }); await waitForUsablePage(page);
      proof = await collectProof(page, planned.checkpointId, planned.stepId, interactionSequence);
      assert.deepEqual(proof, completed, 'PR_C_SYNTHETIC_BROWSER_API_PROOF_READBACK_MISMATCH');
    } else {
      let responseLoss;
      const execute = () => executeServerAction(page, planned.checkpointId, planned.stepId, interactionSequence, state);
      if (key === 'CH-13:simulate-response-loss') {
        const scope = state.get('exercise:scope');
        responseLoss = await executeSyntheticResponseLoss({ page, organizationId: scope.organizationId, workspaceId: scope.workspaceId,
          publicTargetDigest: state.get('public-target-digest'), execute });
        interactionSequence.push('transport:drop-first-committed-response', 'transport:confirm-exact-idempotent-retry');
        state.set('recovery:transport-facts', responseLoss.facts);
      } else await execute();
      proof = await collectProof(page, planned.checkpointId, planned.stepId, interactionSequence);
      const original = responseLoss?.original;
      await retainSyntheticCommandState(planned, session, state, proof, original ? {
        commandType: original.body.commandType, requestId: original.body.requestId, body: original.body, response: original.response,
      } : undefined);
    }
    if (key === 'CH-01:resolve-material-assess-conflict') {
      const apply = page.getByRole('button', { name: 'Apply batch as one Assess draft version', exact: true });
      const applyEnabled = await apply.isEnabled().catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_ASSESS_APPLY_CONTROL_MISSING'); });
      assert(applyEnabled, 'PR_C_SYNTHETIC_BROWSER_ASSESS_APPLY_DISABLED');
      await apply.click().catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_ASSESS_APPLY_CONTROL_FAILED'); });
      await page.getByText('Selected batch applied atomically as one new Assess draft version.', { exact: true }).waitFor({ state: 'visible' })
        .catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_ASSESS_APPLY_CONFIRMATION_MISSING'); });
      interactionSequence.push('apply:resolved-assess-preview');
      await openSurface(page, 'assess-case', interactionSequence)
        .catch(() => { throw new Error('PR_C_SYNTHETIC_BROWSER_ASSESS_CASE_NAVIGATION_FAILED'); });
      await finalizeAssessDraftForReview(page, interactionSequence, { afterTranscriptApply: true });
    }
    if (key === 'CH-08:create-baseline-with-exact-package-selectors') {
      const baselineId = state.get('ch08:baselineId');
      assert(baselineId, 'PR_C_SYNTHETIC_BROWSER_CREATED_BASELINE_BINDING_MISSING');
      await verifySyntheticMonitorBaseline(page, interactionSequence, {
        packageId: state.get('full-governed-package')?.packageId, baselineId,
      });
      const count = await baselineCount(page);
      assert.equal(count, Number(state.get('baseline-before-create')) + 1, 'PR_C_SYNTHETIC_BROWSER_CREATED_BASELINE_COUNT_MISMATCH');
      state.set('baseline-after-create', count);
    }
  } else interactionSequence.push(`observe:${planned.stepId}`);
  const assertions = await stepAssertions({ page, checkpointId: planned.checkpointId, stepId: planned.stepId, providerEgress, state, interactionSequence, proof });
  const completedAt = nextTime();
  const viewport = page.viewportSize();
  const route = safeBrowserRoute(page.url());
  return {
    stepId: planned.stepId, personaKey: planned.personaKey, outcome: 'passed', startedAt, completedAt, ...identity,
    browserArtifact: {
      artifactId: `pr264-synthetic-${planned.checkpointId.toLowerCase()}-${planned.stepId}`.slice(0, 128),
      route,
      viewport: `${viewport?.width ?? 0}x${viewport?.height ?? 0}`,
      assertions, interactionSequence, ...proof,
    },
  };
};

const timestampSequence = (initial = 0) => {
  let cursor = initial;
  return () => { cursor = Math.max(Date.now(), cursor + 1); return new Date(cursor).toISOString(); };
};

const activeSteps = () => buildBrowserExecutionCatalog().filter(record => record.stepId !== 'verify-history-readable-and-actions-absent');
const readOnlyStep = () => buildBrowserExecutionCatalog().find(record => record.stepId === 'verify-history-readable-and-actions-absent');

export const latestCompletedAt = checkpoints => {
  const completed = checkpoints.flatMap(checkpoint => checkpoint.steps.map(step => step.completedAt));
  assert(completed.length > 0 && completed.every(value => Number.isFinite(Date.parse(value))), 'PR_C_SYNTHETIC_BROWSER_ACTIVE_TIME_REJECTED');
  return completed.reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest);
};

export const runActiveBrowserPhase = async ({ env = process.env, preparation, headed = false, stateDirectory, browserFactory = () => chromium.launch({ headless: !headed }) } = {}) => {
  const binding = exactEnvironment(env, preparation);
  assert(binding.personaAuthorizationVersions
    && canonicalJson(Object.keys(binding.personaAuthorizationVersions).sort()) === canonicalJson([...PERSONA_KEYS].sort())
    && Object.values(binding.personaAuthorizationVersions).every(value => Number.isSafeInteger(value) && value > 0),
  'PR_C_SYNTHETIC_BROWSER_PERSONA_AUTHORITY_METADATA_MISSING');
  assert(stateDirectory, 'PR_C_SYNTHETIC_BROWSER_STATE_DIRECTORY_REQUIRED');
  await mkdir(path.dirname(stateDirectory), { recursive: true }); await mkdir(stateDirectory, { recursive: false });
  const browser = await browserFactory();
  const personas = new Map();
  const providerEgress = [];
  let retainedForResume = false;
  try {
    for (const personaKey of PERSONA_KEYS) {
      const device = personaKey === 'monitor_viewer' ? devices['Pixel 7'] : devices['Desktop Chrome'];
      const context = await browser.newContext({ ...device, serviceWorkers: 'block' });
      const page = await context.newPage();
      attachProviderObserver(page, providerEgress);
      const api = await attachSyntheticBrowserApi({ page, personaKey, binding: binding.binding });
      const identity = await signIn({ page, personaKey, password: binding.passwords[personaKey], ...binding });
      await api.setIdentity(identity);
      if (personaKey === 'requester') await api.verifyStudioTransport();
      personas.set(personaKey, { context, page, identity, api });
    }
    const records = createCheckpointRecords();
    const state = new Map(); const nextTime = timestampSequence();
    state.set('sessions', personas);
    state.set('public-target-digest', binding.binding.backend.publicTargetDigest);
    const requester = personas.get('requester');
    state.set('exercise:scope', await requester.api.context());
    const initialWorkspace = await readSyntheticDeliveryWorkspace(requester);
    state.set('ch02:initial-packageIds', initialWorkspace.packages.map(value => value.id).sort());
    const manual = initialWorkspace.packages.filter(value => value.sourcePackage?.sourceMode === 'manual'
      && value.items.some(item => item.title === SYNTHETIC_MANUAL_ITEM_TITLE));
    assert.equal(manual.length, 1, 'PR_C_SYNTHETIC_BROWSER_SEEDED_MANUAL_PACKAGE_AMBIGUOUS');
    state.set('seed:manual-packageId', manual[0].id);
    const recovery = initialWorkspace.packages.filter(value => value.sourcePackage?.sourceMode === 'manual'
      && value.status === 'blocked' && value.items.some(item => item.title === SYNTHETIC_RECOVERY_ITEM_TITLE));
    assert.equal(recovery.length, 1, 'PR_C_SYNTHETIC_BROWSER_SEEDED_RECOVERY_PACKAGE_AMBIGUOUS');
    state.set('seed:recovery-packageId', recovery[0].id);
    for (const [name, artifactType, planningOnly] of [['direct', 'pdd', true], ['assessed', 'brd', false]]) {
      const candidates = initialWorkspace.eligibleStudioArtifacts.filter(value => value.artifactType === artifactType && value.planningOnly === planningOnly);
      assert.equal(candidates.length, 1, 'PR_C_SYNTHETIC_BROWSER_SEEDED_ARTIFACT_AMBIGUOUS');
      state.set(`seed:${name}-artifact`, candidates[0]);
    }
    for (const planned of activeSteps()) {
      if (planned.checkpointId === 'CH-12' && planned.stepId === 'revoked-actor-projection-denied') {
        const reviewer = personas.get('delivery_reviewer'); const interactions = []; await openSurface(reviewer.page, 'delivery', interactions);
        state.set('before-negative-attempts', await packageCount(reviewer.page));
      }
      const session = personas.get(planned.personaKey);
      assert(session, `PR_C_SYNTHETIC_BROWSER_CONTEXT_MISSING:${planned.personaKey}`);
      try {
        const prerequisiteInteractions = [];
        await runSyntheticPrerequisites({ nextStep: planned, sessions: personas, state, interactionSequence: prerequisiteInteractions });
        if (planned.stepId === 'stop-with-no-delivery-resource') {
          const workspace = await readSyntheticDeliveryWorkspace(requester);
          const candidate = workspace.eligibleStudioArtifacts.filter(value => value.studioArtifactId === state.get('ch02:artifactId'));
          assert.equal(candidate.length, 1, 'PR_C_SYNTHETIC_BROWSER_APPROVED_STUDIO_CANDIDATE_MISSING');
          state.set('ch02:approved-candidate', candidate[0]);
          state.set('ch03:bundleBinding', await readSyntheticStudioBundleBinding(requester, state.get('ch02:artifactId')));
        }
        if (planned.stepId === 'verify-approved-assess-handoff-ready') {
          const scope = await session.api.context();
          const sources = await session.api.rpc('enterprise_assess_studio_handoff_projection', { p_org: scope.organizationId, p_workspace: scope.workspaceId });
          assert.equal(sources.eligibleHandoffs?.length, 1, 'PR_C_SYNTHETIC_BROWSER_ASSESS_HANDOFF_AMBIGUOUS');
          state.set('seed:assess-handoff', sources.eligibleHandoffs[0]);
        }
        if (planned.stepId === 'request-package-changes') state.set('monitor:before-blocked', await readAuthorizedMonitorSnapshot(personas.get('monitor_viewer')));
        const apiDescriptor = await prepareApiEvidenceDescriptor(planned, personas, state, binding);
        records.get(planned.checkpointId).steps.push(await executePlannedStep({ planned, session, providerEgress, state, nextTime,
          apiDescriptor, exerciseDigest: binding.exerciseDigest, prerequisiteInteractions }));
        state.set('catalog:lastCompletedStep', `${planned.checkpointId}:${planned.stepId}`);
      } catch (error) {
        throw safeBrowserStepFailure(planned, error);
      }
    }
    assert.equal(providerEgress.length, 0, 'PR_C_SYNTHETIC_BROWSER_PROVIDER_EGRESS');
    const retainedMonitor = await readAuthorizedMonitorSnapshot(personas.get('monitor_viewer'));
    const identities = retainedMonitor.baselines.map(value => ({ id: value.id, version: value.version,
      packageId: value.workPackageId, packageVersion: value.workPackageVersion, acceptedItemCount: value.acceptedItemCount }))
      .sort((left, right) => left.id.localeCompare(right.id));
    assert.equal(identities.length, 4, 'PR_C_SYNTHETIC_BROWSER_COMPLETE_JOURNEY_BASELINE_COUNT');
    const retainedMonitorHistory = { baselineCount: identities.length, identityDigest: digest(identities) };
    const storageStateFiles = [];
    for (const personaKey of PERSONA_KEYS) {
      const file = `${personaKey}.json`; await personas.get(personaKey).context.storageState({ path: path.join(stateDirectory, file) }); storageStateFiles.push({ personaKey, file });
    }
    retainedForResume = true;
    return {
      kind: 'pr264-synthetic-browser-active-private', binding: binding.binding,
      personas: PERSONA_KEYS.map(personaKey => ({ personaKey, role: HUMAN_DUTY_BY_PERSONA[personaKey], ...personas.get(personaKey).identity })),
      checkpoints: CONTROLLED_HUMAN_CATALOG.map(record => records.get(record.checkpointId)), storageStateFiles,
      providerEgressCount: 0,
      retainedMonitorHistory,
      lastCompletedAt: latestCompletedAt([...records.values()]),
    };
  } finally {
    await Promise.all([...personas.values()].map(({ context }) => context.close().catch(() => undefined)));
    await browser.close().catch(() => undefined);
    if (!retainedForResume) await rm(stateDirectory, { recursive: true, force: true });
  }
};

const signOut = async (page, personaKey) => {
  let button = await firstVisible([page.getByTestId('desktop-sign-out'), page.getByTestId('mobile-sign-out'), page.getByRole('button', { name: 'Sign out', exact: true })]);
  if (!button) {
    const opener = await firstVisible([page.getByRole('button', { name: 'Open navigation', exact: true })]);
    if (opener) { await opener.click(); button = await firstVisible([page.getByTestId('mobile-sign-out'), page.getByRole('button', { name: 'Sign out', exact: true })]); }
  }
  assert(button, `PR_C_SYNTHETIC_BROWSER_SIGNOUT_CONTROL_MISSING:${personaKey}`); await button.click();
  await page.getByLabel(/work email|email/iu).first().waitFor({ state: 'visible', timeout: 20_000 });
  const sessionPresent = await page.evaluate(() => [...Array(localStorage.length).keys()].some(index => /access_token/u.test(localStorage.getItem(localStorage.key(index)) ?? '')));
  assert.equal(sessionPresent, false, `PR_C_SYNTHETIC_BROWSER_SIGNOUT_SESSION_RETAINED:${personaKey}`);
  return { signedOutAt: iso(), signOutEvidenceDigest: digest({ personaKey, route: new URL(page.url()).pathname, sessionPresent: false }) };
};

export const runReadOnlyBrowserPhase = async ({ active, env = process.env, preparation, headed = false, stateDirectory, browserFactory = () => chromium.launch({ headless: !headed }) } = {}) => {
  const binding = exactEnvironment(env, preparation); assert(stateDirectory, 'PR_C_SYNTHETIC_BROWSER_STATE_DIRECTORY_REQUIRED');
  assert(active?.kind === 'pr264-synthetic-browser-active-private' && canonicalJson(active.binding) === canonicalJson(binding.binding), 'PR_C_SYNTHETIC_BROWSER_RESUME_BINDING_REJECTED');
  assert.deepEqual(active.storageStateFiles, PERSONA_KEYS.map(personaKey => ({ personaKey, file: `${personaKey}.json` })), 'PR_C_SYNTHETIC_BROWSER_RESUME_FILES_REJECTED');
  const browser = await browserFactory(); const personas = new Map(); const providerEgress = [];
  try {
    for (const record of active.personas) {
      const stateFile = path.resolve(stateDirectory, `${record.personaKey}.json`); assert.equal(path.dirname(stateFile), path.resolve(stateDirectory));
      const context = await browser.newContext({ ...(record.personaKey === 'monitor_viewer' ? devices['Pixel 7'] : devices['Desktop Chrome']), storageState: stateFile, serviceWorkers: 'block' });
      const page = await context.newPage(); attachProviderObserver(page, providerEgress); await page.goto(binding.previewOrigin, { waitUntil: 'domcontentloaded' }); await waitForUsablePage(page);
      const identity = await readCurrentIdentity(page, record.personaKey, binding.exerciseDigest);
      assertResumedIdentity({ applicationActorDigest: record.applicationActorDigest, applicationSessionDigest: record.applicationSessionDigest }, identity, record.personaKey);
      personas.set(record.personaKey, { context, page, identity });
    }
    const planned = readOnlyStep(); assert(planned, 'PR_C_SYNTHETIC_BROWSER_READ_ONLY_STEP_MISSING');
    const session = personas.get(planned.personaKey); const nextTime = timestampSequence(Date.parse(active.lastCompletedAt));
    const finalStep = await executePlannedStep({ planned, session, providerEgress,
      state: new Map([['retained-monitor-history', active.retainedMonitorHistory]]), nextTime });
    const checkpoints = active.checkpoints.map(record => record.checkpointId === planned.checkpointId ? { ...record, steps: [...record.steps, finalStep] } : record);
    const personaEvidence = [];
    for (const record of active.personas) personaEvidence.push({ ...record, ...await signOut(personas.get(record.personaKey).page, record.personaKey) });
    assert.equal(providerEgress.length, 0, 'PR_C_SYNTHETIC_BROWSER_PROVIDER_EGRESS');
    for (const record of active.storageStateFiles) await rm(path.join(stateDirectory, record.file));
    assert.deepEqual(await readdir(stateDirectory), [], 'PR_C_SYNTHETIC_BROWSER_EPHEMERAL_STATE_REMAINS'); await rm(stateDirectory, { recursive: false });
    return validateBrowserCampaignShape({ binding: active.binding, personas: personaEvidence, checkpoints, completedAt: iso() });
  } finally {
    await Promise.all([...personas.values()].map(({ context }) => context.close().catch(() => undefined))); await browser.close().catch(() => undefined);
  }
};

const main = async () => {
  const args = parseArguments(process.argv.slice(2));
  const preparation = args.preparation ? JSON.parse(await readFile(args.preparation, 'utf8')) : undefined;
  const campaign = args.phase === 'active'
    ? await runActiveBrowserPhase({ preparation, headed: args.headed, stateDirectory: path.resolve(args.stateDirectory) })
    : await runReadOnlyBrowserPhase({ active: JSON.parse(await readFile(args.input, 'utf8')), preparation, headed: args.headed, stateDirectory: path.resolve(args.stateDirectory) });
  await mkdir(path.dirname(path.resolve(args.output)), { recursive: true });
  await writeFile(args.output, `${JSON.stringify(campaign, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    process.stderr.write(`PR_C_SYNTHETIC_BROWSER_REJECTED:${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
