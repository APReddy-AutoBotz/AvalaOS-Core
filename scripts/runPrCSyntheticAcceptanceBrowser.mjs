import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium, devices } from '@playwright/test';

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

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const PERSONA_KEYS = Object.freeze([...SYNTHETIC_PERSONA_ORDER]);
const SERVER_STEP_KEYS = new Set(CONTROLLED_HUMAN_SERVER_ACTIONS.map(record => `${record.checkpointId}:${record.stepId}`));
const CATALOG_BY_CHECKPOINT = new Map(CONTROLLED_HUMAN_CATALOG.map(record => [record.checkpointId, record]));
const SERVER_ACTION_BY_STEP = new Map(CONTROLLED_HUMAN_SERVER_ACTIONS.map(record => [`${record.checkpointId}:${record.stepId}`, record]));
const SYNTHETIC_TRANSCRIPT_LABELS = JSON.parse(readFileSync(new URL('../testing/process-lifecycle/fixtures/delivery-monitor-pr-c/controlled-human-environment.json', import.meta.url), 'utf8')).seed.transcriptSets;
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
  delivery: ['Assess', 'Enterprise Intelligence'],
  monitor: ['Assess', 'Enterprise Intelligence'],
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
  'stop-with-no-delivery-resource': { kind: 'text', values: ['No retained Delivery package is visible in this workspace.', 'No Delivery packages are present.'] },
  'verify-approved-assess-handoff-ready': { kind: 'text', values: ['approved', 'handoff ready'], exact: true },
  'add-disjoint-studio-supplements': { kind: 'studio-source-selection' },
  'preview-approved-studio-handoff': { kind: 'activate-text', values: ['Server-derived handoff preview · 250 items'], outcome: ['Server-bound proposal integrity verified.'] },
  'verify-request-creates-no-delivery-package': { kind: 'package-count-unchanged', stateKey: 'before-request' },
  'verify-changes-create-no-target-draft': { kind: 'package-count-unchanged', stateKey: 'before-changes' },
  'verify-rejection-creates-no-target-draft': { kind: 'package-count-unchanged', stateKey: 'before-rejection' },
  'verify-replay-created-no-second-package': { kind: 'package-count-unchanged', stateKey: 'before-consumption-replay' },
  'inspect-deterministic-item-citations': { kind: 'delivery-citations' },
  'compare-immutable-descendant-history': { kind: 'delivery-item-history', outcome: ['Changed fields: title, description'] },
  'verify-complete-bounded-item-set': { kind: 'delivery-complete-set' },
  'verify-monitor-unchanged-while-blocked': { kind: 'text-and-control-absence', values: ['No approved canonical baseline is available.'], role: 'button', names: ['Create read-only Monitor baseline'] },
  'verify-replay-same-baseline': { kind: 'baseline-count', stateKey: 'baseline-after-create' },
  'verify-replay-created-no-second-baseline': { kind: 'baseline-count', stateKey: 'baseline-after-create' },
  'compare-enterprise-and-primary-monitor': { kind: 'monitor-parity' },
  'verify-minimized-baseline-parity': { kind: 'testid', testId: 'canonical-monitor-baselines' },
  'verify-no-hashes-or-approval-identities': { kind: 'privacy' },
  'verify-no-monitor-mutation-controls': { kind: 'monitor-control-absence' },
  'verify-legacy-metrics-non-authoritative': { kind: 'text', values: ['Legacy initiative disposition — non-authoritative'] },
  'verify-direct-plan-remains-not-assessed': { kind: 'text', values: ['Not assessed · Planning only'] },
  'verify-manual-path-remains-not-assessed': { kind: 'text', values: ['Manual item · no fabricated Studio or Assess citation', 'Not assessed · Planning only'], all: true },
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
  'non-color-status-and-citation-cues': { kind: 'testid-text', testId: 'governed-delivery-workspace', values: ['Decision:', 'Source citation'], all: true },
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
      && verified.migrationTip === '20260926053818' && verified.productionAuthorized === false && verified.customerDataAuthorized === false
      && verified.realProviderCallsAuthorized === false, 'PR_C_SYNTHETIC_BROWSER_PREPARATION_BINDING_REJECTED');
  }
  const binding = {
    repository: 'APReddy-AutoBotz/AvalaOS-Core', prNumber: 264, branch: PR_BRANCH, exactHead,
    preview: { origin: previewOrigin, deployId, releaseSha: exactHead, environment: 'hosted_nonproduction_pilot', context: 'deploy-preview', reviewId: 264, siteName: 'avalaos-pilot' },
    backend: { exerciseDigest, targetFingerprint, publicTargetDigest, personaManifestDigest, fixtureManifestDigest, migrationTip: '20260926053818' },
    producer: { workflowPath: SYNTHETIC_WORKFLOW_PATH, job: SYNTHETIC_WORKFLOW_JOB, event: 'workflow_dispatch', runId, runAttempt, owner: 'APReddy-AutoBotz' },
  };
  return { exactHead, exerciseDigest, previewOrigin, passwords: parsePasswordBundle(passwordBundle ?? ''), binding };
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

export const exactStudioHandoffAction = async (page, interactionSequence, { tab, resource, state, button }) => {
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
    const resourceMatches = await card.getByText(resource, { exact: true }).count() === 1;
    const stateMatches = await card.getByText(state, { exact: true }).count() === 1;
    if (resourceMatches && stateMatches) matches.push(card);
  }
  assert.equal(matches.length, 1, `PR_C_SYNTHETIC_BROWSER_STUDIO_HANDOFF_RESOURCE_COUNT:${safeLabel(button)}:${matches.length}`);
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
    await control.waitFor({ state: 'visible' });
    assert(await control.isEnabled(), `PR_C_SYNTHETIC_BROWSER_NAVIGATION_DISABLED:${safeLabel(label)}`);
    await control.click();
    interactionSequence.push(`navigate:${safeLabel(label)}`);
    await waitForUsablePage(page);
  }
};

const openSurface = async (page, surface, interactionSequence, stepId = '') => {
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
  const enterprise = ['assess', 'delivery', 'monitor'].includes(surface);
  const ready = enterprise
    ? await page.getByTestId('enterprise-intelligence-workspace').count() > 0
    : await page.getByTestId('governed-studio-creation-route').count() > 0;
  if (!ready) await navigateProductPath(page, NAVIGATION_PATHS[surface], interactionSequence);
  const target = enterprise ? page.getByTestId('enterprise-intelligence-workspace') : page.getByTestId('governed-studio-creation-route');
  await target.waitFor({ state: 'visible' });
  const tab = TAB_BY_STEP[stepId] ?? TAB_LABELS[surface][0];
  if (tab) {
    const control = target.getByRole('navigation', { name: 'Enterprise Intelligence surfaces' }).getByRole('button', { name: tab, exact: true });
    await control.click();
    interactionSequence.push(`tab:${safeLabel(tab)}`);
  }
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
  while (await workspace.getByRole('button', { name: 'Load next bounded page', exact: true }).count()) {
    const load = workspace.getByRole('button', { name: 'Load next bounded page', exact: true });
    if (!(await load.isVisible()) || !(await load.isEnabled())) break;
    await load.click();
    interactionSequence.push('load:next-bounded-delivery-page');
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
  }
  const complete = workspace.getByTestId('delivery-item-pagination-complete');
  await complete.waitFor({ state: 'visible' });
  return complete;
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
    if (await select.inputValue() !== optionValue) await select.selectOption(optionValue);
  } else {
    assert.equal(title, SYNTHETIC_STUDIO_DRAFT_TITLE, `PR_C_SYNTHETIC_BROWSER_STUDIO_DRAFT_COUNT:${matches.length}`);
    const candidates = await select.locator('option').evaluateAll(nodes => nodes.map(node => node.value).filter(Boolean));
    const bodyMatches = [];
    for (const value of candidates) {
      await select.selectOption(value);
      try {
        await page.waitForFunction(expected => [...document.querySelectorAll('section[aria-labelledby="structured-editor-title"] textarea')]
          .some(field => field instanceof HTMLTextAreaElement && expected.some(value => field.value === value)), [SYNTHETIC_STUDIO_DRAFT_INITIAL_BODY, SYNTHETIC_STUDIO_DRAFT_SECTION_BODY], { timeout: 2_000 });
        bodyMatches.push(value);
      } catch { /* this exact artifact is not the synthetic transcript draft */ }
    }
    assert.equal(bodyMatches.length, 1, `PR_C_SYNTHETIC_BROWSER_STUDIO_DRAFT_COUNT:${bodyMatches.length}`);
    await select.selectOption(bodyMatches[0]);
  }
  await workspace.locator('section[aria-labelledby="structured-editor-title"] textarea').first().waitFor({ state: 'visible' });
  assert.equal(await workspace.getAttribute('data-studio-projection-state'), 'artifact-ready', 'PR_C_SYNTHETIC_BROWSER_STUDIO_DRAFT_PROJECTION_NOT_READY');
  interactionSequence.push('select:synthetic-studio-transcript-draft');
  return workspace;
};

export const selectSyntheticHybridStudioDraft = async (page, interactionSequence, sectionBody = SYNTHETIC_HYBRID_SECTION_BODY) => {
  const workspace = page.getByTestId('studio-artifact-workspace');
  const select = workspace.getByLabel('Governed artifact', { exact: true });
  await select.waitFor({ state: 'visible' });
  const candidates = await select.locator('option').evaluateAll(nodes => nodes.map(node => node.value).filter(Boolean));
  const matches = [];
  for (const value of candidates) {
    await select.selectOption(value);
    try {
      await page.waitForFunction(expected => [...document.querySelectorAll('section[aria-labelledby="structured-editor-title"] textarea')]
        .some(field => field instanceof HTMLTextAreaElement && field.value === expected), sectionBody, { timeout: 2_000 });
      matches.push(value);
    } catch { /* this exact artifact is not the generated hybrid draft */ }
  }
  assert.equal(matches.length, 1, `PR_C_SYNTHETIC_BROWSER_HYBRID_STUDIO_DRAFT_COUNT:${matches.length}`);
  await select.selectOption(matches[0]);
  assert.equal(await workspace.getAttribute('data-studio-projection-state'), 'artifact-ready', 'PR_C_SYNTHETIC_BROWSER_HYBRID_DRAFT_PROJECTION_NOT_READY');
  interactionSequence.push('select:synthetic-source-bound-hybrid-draft');
  return workspace;
};

export const editAndSubmitSyntheticStudioDraft = async (page, interactionSequence, {
  title = SYNTHETIC_STUDIO_DRAFT_TITLE, reviewerLabel = 'Synthetic studio_reviewer',
} = {}) => {
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
  const reviewerOptions = await reviewer.locator('option').allTextContents();
  const reviewerMatches = reviewerOptions.filter(value => value === reviewerLabel);
  assert.equal(reviewerMatches.length, 1, 'PR_C_SYNTHETIC_BROWSER_STUDIO_REVIEWER_COUNT');
  await reviewer.selectOption({ label: reviewerMatches[0] });
  const assign = workspace.getByRole('button', { name: 'Assign reviewer', exact: true });
  assert(await assign.isEnabled(), 'PR_C_SYNTHETIC_BROWSER_STUDIO_ASSIGN_DISABLED');
  await assign.click();
  await workspace.getByText('In review committed.', { exact: true }).waitFor({ state: 'visible' });
  interactionSequence.push('submit-and-assign:synthetic-studio-transcript-draft');
  return { priorDigest: digest(prior), savedDigest: digest(appended), changed: appended !== prior, submitted: true, assigned: true };
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
  const workspace = page.getByTestId('governed-delivery-workspace');
  const packages = workspace.getByRole('list', { name: 'Delivery packages' }).getByRole('button');
  const matches = [];
  for (let index = 0; index < await packages.count(); index += 1) {
    await packages.nth(index).click();
    const current = await selectedDeliveryPackage(workspace);
    if (current.packageId === packageId) matches.push(packages.nth(index));
  }
  assert.equal(matches.length, 1, `PR_C_SYNTHETIC_BROWSER_DELIVERY_PACKAGE_ID_COUNT:${matches.length}`);
  await matches[0].click();
  interactionSequence.push('select:exact-bound-delivery-package');
  return { workspace, selected: (await selectedDeliveryPackage(workspace)).selected };
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

export const selectExactRevisedDeliveryDescendant = async (page, interactionSequence, expectedPackageId) => {
  assert(expectedPackageId, 'PR_C_SYNTHETIC_BROWSER_FULL_GOVERNED_PACKAGE_BINDING_MISSING');
  const { workspace, selected } = await selectDeliveryPackageById(page, expectedPackageId, interactionSequence);
  assert.equal(await selected.getByText('Studio handoff', { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_REVISED_PACKAGE_SOURCE_MODE_MISMATCH');
  assert.equal(await selected.getByText('Assessed lineage', { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_REVISED_PACKAGE_ANCESTRY_MISMATCH');
  assert.equal(await selected.getByText('draft', { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_REVISED_PACKAGE_STATUS_MISMATCH');
  assert.equal(await selected.getByText('Review not requested', { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_REVISED_PACKAGE_REVIEW_STATE_MISMATCH');
  const metrics = await deliveryCompleteSetMetrics(await loadCompleteDeliveryItemSet(page, interactionSequence));
  assert.equal(metrics.itemCount, 1, 'PR_C_SYNTHETIC_BROWSER_REVISED_PACKAGE_ITEM_COUNT');
  assert.equal(metrics.pageCount, 1, 'PR_C_SYNTHETIC_BROWSER_REVISED_PACKAGE_PAGE_COUNT');
  await filterOneDeliveryItem(page, interactionSequence, SYNTHETIC_REVISED_ITEM_TITLE);
  const cards = workspace.locator('article[data-testid^="delivery-item-"]');
  const matches = [];
  for (let index = 0; index < await cards.count(); index += 1) {
    const card = cards.nth(index);
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

const isolateFirstActionableDeliveryItem = async (page, interactionSequence, expectedPackageId = '', exactItemTitle = '') => {
  const workspace = await selectDeliveryPackageForControl(page, 'Edit immutable descendant', interactionSequence, expectedPackageId);
  const packageText = await (await selectedDeliveryPackage(workspace)).selected.innerText();
  if (exactItemTitle) assert(packageText.includes('Manual Delivery entry') && packageText.includes('Not assessed · Planning only'), 'PR_C_SYNTHETIC_BROWSER_MANUAL_DRAFT_PACKAGE_REQUIRED');
  await loadCompleteDeliveryItemSet(page, interactionSequence);
  const cards = workspace.locator('article[data-testid^="delivery-item-"]');
  const matches = [];
  for (let index = 0; index < await cards.count(); index += 1) {
    const candidate = cards.nth(index);
    const title = await candidate.getAttribute('data-item-title');
    if ((!exactItemTitle || title === exactItemTitle) && await candidate.getByRole('button', { name: 'Edit immutable descendant', exact: true }).count() === 1) matches.push(candidate);
  }
  assert.equal(matches.length, 1, 'PR_C_SYNTHETIC_BROWSER_ACTIONABLE_DELIVERY_ITEM_COUNT');
  const card = matches[0];
  const title = await card.getAttribute('data-item-title');
  assert(title, 'PR_C_SYNTHETIC_BROWSER_ACTIONABLE_DELIVERY_ITEM_TITLE_MISSING');
  await filterOneDeliveryItem(page, interactionSequence, title);
  return { workspace, title };
};

const reachControlWithKeyboard = async (page, control, interactionSequence) => {
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  for (let index = 1; index <= 300; index += 1) {
    await page.keyboard.press('Tab');
    if (await control.evaluate(node => node === document.activeElement)) {
      interactionSequence.push(`keyboard:tab-to-control:${index}`);
      return index;
    }
  }
  throw new Error('PR_C_SYNTHETIC_BROWSER_KEYBOARD_CONTROL_UNREACHABLE');
};

const prepareKeyboardOnlyHandoff = async (page, interactionSequence) => {
  const section = page.locator('section[aria-labelledby="delivery-handoffs-title"]');
  const select = section.getByLabel('Eligible exact Studio artifact', { exact: true });
  await select.waitFor({ state: 'visible' });
  const options = await select.locator('option').evaluateAll(nodes => nodes.map(node => ({ value: node.value, label: node.textContent?.trim() ?? '' })).filter(option => option.value));
  const remaining = options.filter(option => option.label.endsWith('Not assessed · Planning only'));
  assert.equal(remaining.length, 1, `PR_C_SYNTHETIC_BROWSER_KEYBOARD_HANDOFF_SOURCE_COUNT:${remaining.length}`);
  await select.selectOption(remaining[0].value);
  const preview = section.getByText(/^Server-derived handoff preview · [1-9][0-9]* items$/u, { exact: true });
  assert.equal(await preview.count(), 1, 'PR_C_SYNTHETIC_BROWSER_KEYBOARD_HANDOFF_PREVIEW_COUNT');
  interactionSequence.push('select:exact-source-bound-keyboard-handoff');
  return section;
};

export const selectExactEligibleStudioBundle = async (page, interactionSequence) => {
  const builder = page.getByRole('region', { name: 'Studio Source Package builder' });
  const select = builder.getByLabel('Exact locked Studio bundle', { exact: true });
  const createControl = builder.getByRole('button', { name: 'Create direct planning package', exact: true });
  await select.waitFor({ state: 'visible' });
  const options = await select.locator('option').evaluateAll(nodes => nodes.map(node => ({ value: node.value, label: node.textContent?.trim() ?? '' })).filter(option => option.value));
  assert(options.length > 0, 'PR_C_SYNTHETIC_BROWSER_STUDIO_BUNDLE_MISSING');
  const eligible = [];
  for (const option of options) {
    await select.selectOption(option.value);
    if (await createControl.isEnabled()) eligible.push(option);
  }
  assert.equal(eligible.length, 1, `PR_C_SYNTHETIC_BROWSER_ELIGIBLE_STUDIO_BUNDLE_COUNT:${eligible.length}`);
  await select.selectOption(eligible[0].value);
  assert(await createControl.isEnabled(), 'PR_C_SYNTHETIC_BROWSER_ELIGIBLE_STUDIO_BUNDLE_NOT_SELECTED');
  interactionSequence.push('select:exact-eligible-studio-bundle');
  return { optionCount: options.length, eligibleCount: eligible.length };
};

const prepareBlockedPackageRecovery = async (page, interactionSequence, { packageId = '', recoveryFixture = false } = {}) => {
  const { workspace, selected } = recoveryFixture
    ? await selectDeliveryPackageByLabel(page, SYNTHETIC_RECOVERY_PACKAGE_LABEL, interactionSequence)
    : await selectDeliveryPackageById(page, packageId, interactionSequence);
  const selectedText = await selected.innerText();
  const expectedState = recoveryFixture
    ? ['blocked', 'Manual Delivery entry', 'Not assessed · Planning only', 'Review changes requested']
    : ['blocked', 'Studio handoff', 'Assessed lineage', 'Review changes requested'];
  for (const expected of expectedState) assert(selectedText.includes(expected), `PR_C_SYNTHETIC_BROWSER_RECOVERY_PACKAGE_STATE_MISSING:${safeLabel(expected)}`);
  await loadCompleteDeliveryItemSet(page, interactionSequence);
  const prepare = workspace.getByRole('button', { name: 'Prepare blocked package recovery', exact: true });
  assert(await prepare.isEnabled(), 'PR_C_SYNTHETIC_BROWSER_RECOVERY_PREPARE_DISABLED');
  await prepare.click();
  const available = workspace.getByRole('region', { name: 'Canonical descendants available for recovery' });
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
  if (key === 'CH-03:approve-hybrid-studio-document') await selectSyntheticHybridStudioDraft(page, interactionSequence);
  if (['CH-02:review-studio-document', 'CH-02:approve-studio-document', 'CH-03:approve-hybrid-studio-document'].includes(key))
    assert(await fillIfVisible(page, 'Rationale', `Independent synthetic decision for ${stepId}.`, interactionSequence), 'PR_C_SYNTHETIC_BROWSER_STUDIO_RATIONALE_MISSING');
  if (['CH-04:request-exact-studio-handoff', 'CH-05:request-fresh-exact-handoff'].includes(key)) {
    const select = page.getByLabel('Eligible exact Studio artifact', { exact: true });
    const options = await select.locator('option').allTextContents();
    const assessed = options.filter(value => value.includes('Assessed lineage'));
    assert.equal(assessed.length, 1, 'PR_C_SYNTHETIC_BROWSER_ASSESSED_STUDIO_ARTIFACT_COUNT');
    await select.selectOption({ label: assessed[0] });
    interactionSequence.push('select:exact-assessed-studio-artifact');
  }
  if (key === 'CH-03:request-studio-handoff') await selectExactEligibleStudioBundle(page, interactionSequence);
  if (key === 'CH-10:handoff-direct-studio-plan') {
    const select = page.getByLabel('Eligible exact Studio artifact', { exact: true });
    const options = await select.locator('option').allTextContents();
    const planning = options.filter(value => value.includes('Not assessed · Planning only'));
    assert.equal(planning.length, 1, 'PR_C_SYNTHETIC_BROWSER_DIRECT_STUDIO_ARTIFACT_COUNT');
    await select.selectOption({ label: planning[0] });
    interactionSequence.push('select:exact-direct-studio-artifact');
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
    const expectedPackageId = ['CH-06', 'CH-07'].includes(checkpointId) ? state.get('full-governed-package')?.packageId ?? '' : '';
    assert(!['CH-06', 'CH-07'].includes(checkpointId) || expectedPackageId, 'PR_C_SYNTHETIC_BROWSER_FULL_GOVERNED_PACKAGE_BINDING_MISSING');
    await selectDeliveryPackageForControl(page, deliveryControlByKey, interactionSequence, expectedPackageId);
    await loadCompleteDeliveryItemSet(page, interactionSequence);
    if (key === 'CH-06:edit-one-item-with-rationale') await isolateFirstActionableDeliveryItem(page, interactionSequence, expectedPackageId);
    if (key === 'CH-06:decide-every-current-proposal') await filterOneDeliveryItem(page, interactionSequence, 'Synthetic governed work item revision');
  }
  if (key === 'CH-07:commit-only-explicitly-edited-descendants') {
    const packageId = state.get('full-governed-package')?.packageId;
    assert(packageId, 'PR_C_SYNTHETIC_BROWSER_FULL_GOVERNED_PACKAGE_BINDING_MISSING');
    await prepareBlockedPackageRecovery(page, interactionSequence, { packageId });
  }
  if (key === 'CH-07:decide-revised-descendant') {
    const packageId = state.get('full-governed-package')?.packageId;
    await selectExactRevisedDeliveryDescendant(page, interactionSequence, packageId);
  }
  if (key === 'CH-13:simulate-response-loss') await prepareBlockedPackageRecovery(page, interactionSequence, { recoveryFixture: true });
  if (key === 'CH-10:create-direct-studio-plan') {
    await selectExactEligibleStudioBundle(page, interactionSequence);
  }
  if (key === 'CH-11:create-manual-delivery-package') {
    assert(await fillIfVisible(page, 'Package title', 'Synthetic manual continuity plan', interactionSequence));
    assert(await fillIfVisible(page, 'First item title', 'Verify synthetic recovery checkpoint', interactionSequence));
    assert(await fillIfVisible(page, 'Description', 'Synthetic planning item without upstream ancestry.', interactionSequence));
  }
};

const completeVisibleDialog = async (page, stepId, interactionSequence) => {
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
  if (stepId === 'edit-one-item-with-rationale') {
    const title = dialog.getByLabel('Item title', { exact: true });
    assert.equal(await title.count(), 1, 'PR_C_SYNTHETIC_BROWSER_EDIT_ITEM_TITLE_COUNT');
    await title.fill('Synthetic governed work item revision');
    await dialog.getByLabel('Description', { exact: true }).fill('Synthetic revision bound to the reviewed source and exact package.');
    interactionSequence.push('fill:item-title-material-revision');
  }
  for (const [label, value] of values) {
    const input = dialog.getByLabel(label, { exact: true });
    if (await input.count() && await input.isVisible() && !(await input.isDisabled()) && !(await input.inputValue()).trim()) {
      await input.fill(value); interactionSequence.push(`fill:${safeLabel(label)}`);
    }
  }
  const confirm = await firstVisible([dialog.getByRole('button', { name: /confirm|submit|save|apply|continue/iu })]);
  if (confirm) { await confirm.click(); interactionSequence.push('activate:dialog-confirm'); }
};

const armServerStep = async (page, checkpointId, stepId, interactionSequence) => {
  const banner = page.getByTestId('controlled-human-nonproduction-banner');
  await banner.locator('summary').click();
  interactionSequence.push('expand:two-phase-evidence');
  await banner.getByRole('button', { name: 'Refresh evidence steps' }).click();
  const selector = banner.getByLabel('Controlled-human evidence step');
  await selector.selectOption(`${checkpointId}:${stepId}`);
  await banner.getByRole('button', { name: 'Arm before action' }).click();
  interactionSequence.push(`arm:${checkpointId.toLowerCase()}:${stepId}`);
};

const collectProof = async (page, checkpointId, stepId, interactionSequence) => {
  const banner = page.getByTestId('controlled-human-nonproduction-banner');
  await banner.getByRole('button', { name: 'Refresh evidence steps' }).click();
  const completed = banner.getByLabel('Completed controlled-human evidence step');
  await completed.selectOption(`${checkpointId}:${stepId}`);
  interactionSequence.push(`inspect-proof:${checkpointId.toLowerCase()}:${stepId}`);
  const anchor = JSON.parse(await banner.getByTestId('controlled-human-safe-anchor').textContent());
  const binding = JSON.parse(await banner.getByTestId('controlled-human-safe-binding').textContent());
  assert.equal(anchor.stepId, stepId, 'PR_C_SYNTHETIC_BROWSER_ANCHOR_STEP_MISMATCH');
  assert.equal(binding.stepId, stepId, 'PR_C_SYNTHETIC_BROWSER_BINDING_STEP_MISMATCH');
  return { serverAnchor: anchor, serverBinding: binding };
};

const executeServerAction = async (page, checkpointId, stepId, interactionSequence, state) => {
  const key = `${checkpointId}:${stepId}`;
  const contract = SERVER_ACTION_BY_STEP.get(key);
  assert(contract, `PR_C_SYNTHETIC_BROWSER_SERVER_CONTRACT_MISSING:${key}`);
  const labels = ACTION_LABEL_OVERRIDES[key] ?? ACTION_LABELS[contract.action];
  assert(labels?.length, `PR_C_SYNTHETIC_BROWSER_ACTION_PLAN_MISSING:${key}`);
  await prepareServerAction(page, checkpointId, stepId, interactionSequence, state);
  const handoffTarget = STUDIO_HANDOFF_STEP_TARGETS[key];
  const { control, label } = handoffTarget
    ? await exactStudioHandoffAction(page, interactionSequence, { ...handoffTarget, button: labels[0] })
    : await exactEnabledControl(actionRoot(page, contract.action), 'button', labels, key);
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

const packageCount = page => page.getByRole('list', { name: 'Delivery packages' }).getByRole('listitem').count();
const baselineCount = page => page.getByTestId('canonical-monitor-baselines').locator('article').count();

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

export const selectStudioTranscriptSources = async (page, interactionSequence, names = SYNTHETIC_TRANSCRIPT_LABELS.studio) => {
  assert(Array.isArray(names) && names.length === 2 && names.every(name => typeof name === 'string' && name.trim()), 'PR_C_SYNTHETIC_BROWSER_STUDIO_SOURCE_FIXTURE_REJECTED');
  const builder = page.locator('section[aria-labelledby="studio-source-package-builder-title"]');
  await builder.waitFor({ state: 'visible' });
  const sourceList = builder.locator('ul').first();
  for (const name of names) {
    const source = sourceList.locator('li').filter({ hasText: name });
    assert.equal(await source.count(), 1, 'PR_C_SYNTHETIC_BROWSER_STUDIO_SOURCE_MISSING');
    const use = source.getByRole('button', { name: 'Use in Studio', exact: true });
    if (await use.count()) { await use.click(); interactionSequence.push(`select:${safeLabel(name)}`); }
    assert.equal(await source.getByRole('button', { name: 'Remove', exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_STUDIO_SOURCE_NOT_SELECTED');
  }
  assert.equal(await builder.getByRole('button', { name: 'Remove', exact: true }).count(), names.length, 'PR_C_SYNTHETIC_BROWSER_STUDIO_SELECTION_COUNT');
  for (const name of SYNTHETIC_TRANSCRIPT_LABELS.assess)
    assert.equal(await sourceList.locator('li').filter({ hasText: name }).getByRole('button', { name: 'Remove', exact: true }).count(), 0, 'PR_C_SYNTHETIC_BROWSER_ASSESS_SOURCE_USED_IN_STUDIO');
  return { sourceCount: names.length, assessSourceCount: 0 };
};

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

export const finalizeAssessDraftForReview = async (page, interactionSequence) => {
  const workspace = page.getByTestId('assess-v2-workspace');
  await workspace.waitFor({ state: 'visible' });
  await workspace.getByRole('button', { name: 'Reload current draft', exact: true }).click();
  await workspace.getByText('Current immutable draft projection reloaded.', { exact: true }).waitFor({ state: 'visible' });
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
  const evidence = review.getByRole('button', { name: 'Accept evidence', exact: true });
  assert.equal(await evidence.count(), 1, 'PR_C_SYNTHETIC_BROWSER_ASSESS_EVIDENCE_COUNT');
  await review.getByLabel('Reviewer rationale', { exact: true }).fill('Independent synthetic source and claim check.');
  await evidence.click();
  await review.getByText('Evidence attestation committed: Evidence accepted.', { exact: true }).waitFor({ state: 'visible' });
  interactionSequence.push('attest:independent-assess-evidence');
  await review.getByLabel('Review rationale', { exact: true }).fill('All material synthetic Assess claims independently checked.');
  assert(await review.getByRole('button', { name: 'Approve reviewed decision', exact: true }).isEnabled(), 'PR_C_SYNTHETIC_BROWSER_ASSESS_APPROVAL_DISABLED');
  interactionSequence.push('fill:assess-review-rationale');
};

export const prepareAssessConflictPreview = async (page, interactionSequence, bundleLabel = 'Synthetic assess transcript selection') => {
  const review = page.locator('section[aria-labelledby="transcript-candidate-review-title"]');
  await review.waitFor({ state: 'visible' });
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
  await include.first().waitFor({ state: 'visible' });
  assert(await include.count() >= 1, 'PR_C_SYNTHETIC_BROWSER_REVIEWED_ASSESS_CANDIDATE_MISSING');
  await include.first().check();
  interactionSequence.push('select:reviewed-assess-candidate');
  const preview = review.getByRole('button', { name: 'Preview exact Assess changes', exact: true });
  assert(await preview.isEnabled(), 'PR_C_SYNTHETIC_BROWSER_ASSESS_PREVIEW_DISABLED');
  await preview.click();
  await review.getByRole('heading', { name: 'Conflict: Case description', exact: true }).waitFor({ state: 'visible' });
  interactionSequence.push('preview:material-assess-conflict');
  return { selectedDraft: true, reviewedCandidate: true, materialConflictCount: await review.locator('article[aria-labelledby^="conflict-"]').count() };
};

const observeBrowserOnlyStep = async ({ page, checkpointId, stepId, state, interactionSequence }) => {
  const plan = BROWSER_ASSERTION_PLANS[stepId];
  assert(plan, `PR_C_SYNTHETIC_BROWSER_READ_PLAN_MISSING:${checkpointId}:${stepId}`);
  let observed;
  if (plan.kind === 'text') observed = { exactText: await exactVisibleText(page, plan.values, plan.all) };
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
    observed = await editAndSubmitSyntheticStudioDraft(page, interactionSequence);
  } else if (plan.kind === 'control-absence') {
    const counts = {}; for (const name of plan.names) counts[name] = await page.getByRole(plan.role, { name, exact: true }).count();
    assert(Object.values(counts).every(count => count === 0), `PR_C_SYNTHETIC_BROWSER_CONTROL_PRESENT:${stepId}`); observed = counts;
  } else if (plan.kind === 'disabled-control') {
    const control = await namedControl(page, plan.role, plan.names);
    assert(!(await control.locator.isEnabled()), `PR_C_SYNTHETIC_BROWSER_CONTROL_ENABLED:${stepId}`);
    observed = { control: control.name, disabled: true };
  } else if (plan.kind === 'assess-source-selection') observed = await selectAssessTranscriptSources(page, interactionSequence);
  else if (plan.kind === 'studio-source-selection') observed = await selectStudioTranscriptSources(page, interactionSequence);
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
    const trigger = await exactVisibleText(page, plan.values); await page.getByText(trigger[0].value, { exact: true }).first().click(); interactionSequence.push(`activate:${safeLabel(trigger[0].value)}`);
    observed = { trigger, outcome: await exactVisibleText(page, plan.outcome, true) };
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
    const workspace = await selectDeliveryPackageForControl(page, 'Edit immutable descendant', interactionSequence);
    const complete = await loadCompleteDeliveryItemSet(page, interactionSequence);
    const metrics = await deliveryCompleteSetMetrics(complete);
    const { selected, packageId } = await selectedDeliveryPackage(workspace);
    const packageText = await selected.innerText();
    assert(packageText.includes('Studio handoff') && packageText.includes('Assessed lineage'), 'PR_C_SYNTHETIC_BROWSER_ASSESSED_DELIVERY_PACKAGE_REQUIRED');
    const filterResult = await workspace.getByTestId('delivery-item-filter-result').innerText();
    assert.equal(filterResult, `${metrics.itemCount} matching items across ${metrics.itemCount} loaded`, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_LOADED_ITEM_COUNT_MISMATCH');
    const citations = workspace.getByLabel('Exact source citation');
    assert(await citations.count() > 0, 'PR_C_SYNTHETIC_BROWSER_DETERMINISTIC_CITATION_MISSING');
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
    observed = { packageIdDigest: digest(packageId), itemCount: metrics.itemCount, pageCount: metrics.pageCount, citationIdentity };
  } else if (plan.kind === 'delivery-complete-set') {
    const expected = state.get('full-governed-package');
    assert(expected?.packageId, 'PR_C_SYNTHETIC_BROWSER_FULL_GOVERNED_PACKAGE_BINDING_MISSING');
    const workspace = await selectDeliveryPackageForControl(page, 'Request package changes', interactionSequence, expected.packageId);
    const metrics = await deliveryCompleteSetMetrics(await loadCompleteDeliveryItemSet(page, interactionSequence));
    assert.equal(metrics.itemCount, expected.itemCount, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_COMPLETE_ITEM_COUNT_DRIFT');
    assert.equal(metrics.pageCount, expected.pageCount, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_COMPLETE_PAGE_COUNT_DRIFT');
    observed = { packageIdDigest: digest(expected.packageId), itemCount: metrics.itemCount, pageCount: metrics.pageCount, complete: true };
  } else if (plan.kind === 'package-count-unchanged') {
    const before = state.get(plan.stateKey); const after = await packageCount(page); assert(Number.isSafeInteger(before), `PR_C_SYNTHETIC_BROWSER_SNAPSHOT_MISSING:${plan.stateKey}`); assert.equal(after, before, `PR_C_SYNTHETIC_BROWSER_PACKAGE_COUNT_CHANGED:${stepId}`); observed = { before, after };
  } else if (plan.kind === 'baseline-count') {
    const expected = state.get(plan.stateKey); const actual = await baselineCount(page); assert(Number.isSafeInteger(expected) && actual === expected && actual === 1, `PR_C_SYNTHETIC_BROWSER_BASELINE_COUNT:${stepId}`); observed = { expected, actual };
  } else if (plan.kind === 'text-and-control-absence') {
    const exactText = await exactVisibleText(page, plan.values, true); const counts = {}; for (const name of plan.names) counts[name] = await page.getByRole(plan.role, { name, exact: true }).count(); assert(Object.values(counts).every(count => count === 0)); observed = { exactText, absentControls: counts };
  } else if (plan.kind === 'control-and-text') {
    const control = await namedControl(page, plan.role, plan.names); await control.locator.click(); interactionSequence.push(`activate:${safeLabel(control.name)}`); observed = { control: control.name, exactText: await exactVisibleText(page, plan.values) };
  } else if (plan.kind === 'privacy') observed = { privacyDigest: await assertNoRawHashesOrApprovalIdentities(page) };
  else if (plan.kind === 'monitor-control-absence') observed = { absenceDigest: await assertNoMonitorMutationControls(page) };
  else if (plan.kind === 'layout') observed = { layoutDigest: await assertLayout(page) };
  else if (plan.kind === 'viewport') { const viewport = page.viewportSize(); assert.equal(viewport?.width, plan.width); assert.equal(viewport?.height, plan.height); observed = viewport; }
  else if (plan.kind === 'zoom') { const value = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).zoom || '1')); assert.equal(value, plan.value); observed = { zoom: value }; }
  else if (plan.kind === 'keyboard-reachability') {
    if (stepId === 'keyboard-only-item-edit') await isolateFirstActionableDeliveryItem(page, interactionSequence, '', SYNTHETIC_MANUAL_ITEM_TITLE);
    const root = stepId === 'keyboard-only-handoff'
      ? await prepareKeyboardOnlyHandoff(page, interactionSequence)
      : page.getByTestId('governed-delivery-workspace');
    const control = await exactEnabledControl(root, plan.role, plan.names, `${checkpointId}:${stepId}`);
    const tabCount = await reachControlWithKeyboard(page, control.control, interactionSequence);
    observed = { control: control.label, keyboardReachable: true, activated: false, tabCount };
  }
  else if (plan.kind === 'focused-alert') {
    const { workspace } = await isolateFirstActionableDeliveryItem(page, interactionSequence, '', SYNTHETIC_MANUAL_ITEM_TITLE);
    const edit = await exactEnabledControl(workspace, 'button', ['Edit immutable descendant'], `${checkpointId}:${stepId}`);
    await edit.control.click(); interactionSequence.push('activate:edit-dialog-without-domain-command');
    const dialog = page.getByRole('dialog').last(); assert(await dialog.count() && await dialog.isVisible(), 'PR_C_SYNTHETIC_BROWSER_A11Y_DIALOG_MISSING');
    const title = dialog.getByLabel('Item title', { exact: true }); assert(await title.count()); await title.fill('Preserved synthetic invalid input'); interactionSequence.push('fill:item-title');
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click(); interactionSequence.push('activate:dialog-confirm-without-rationale');
    const alert = dialog.getByRole('alert').last(); assert(await alert.count() && await alert.isVisible()); assert(await alert.evaluate(node => node === document.activeElement)); observed = { role: 'alert', focused: true, textDigest: digest(await alert.innerText()) };
  }
  else if (plan.kind === 'preserved-input') { const input = page.getByLabel(plan.label, { exact: true }).last(); const value = await input.inputValue(); assert(value.trim().length > 0); observed = { label: plan.label, valueDigest: digest(value) }; }
  else if (plan.kind === 'focus-return') {
    const dialog = page.getByRole('dialog').last();
    assert(await dialog.count() && await dialog.isVisible(), 'PR_C_SYNTHETIC_BROWSER_FOCUS_DIALOG_MISSING');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); interactionSequence.push('activate:dialog-cancel');
    const control = await exactEnabledControl(page.getByTestId('governed-delivery-workspace'), plan.role, plan.names, `${checkpointId}:${stepId}`);
    assert(await control.control.evaluate(node => node === document.activeElement)); observed = { control: control.label, focused: true };
  }
  else if (plan.kind === 'read-only-history') { const history = page.getByRole('button', { name: 'Version diff and history', exact: true }); assert(await history.count() > 0); const mutationCount = await page.getByRole('button', { name: /^(?:Edit immutable descendant|Accept proposal|Reject proposal|Submit resolved package|Approve package review|Final package approval)$/u }).count(); assert.equal(mutationCount, 0); observed = { historyControlCount: await history.count(), mutationControlCount: 0 }; }
  else if (plan.kind === 'monitor-parity') { const panel = page.getByTestId('canonical-monitor-baselines'); await panel.waitFor({ state: 'visible' }); const enterpriseDigest = digest(await panel.innerText()); await clickFirstLabel(page, ['Monitor'], interactionSequence); await page.getByTestId('canonical-monitor-baselines').waitFor({ state: 'visible' }); const primaryDigest = digest(await page.getByTestId('canonical-monitor-baselines').innerText()); assert.equal(primaryDigest, enterpriseDigest); observed = { enterpriseDigest, primaryDigest }; }
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
    const surface = checkpointId === 'CH-01' && step.stepId === 'complete-remaining-assess-fields-manually' ? 'assess-case'
      : checkpointId === 'CH-01' && ['approve-assess-result', 'decline-studio-handoff', 'verify-no-studio-resource'].includes(step.stepId) ? 'assess-review'
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

const snapshotBeforeServerAction = async (page, key, state) => {
  if (key === 'CH-04:request-exact-studio-handoff') state.set('before-request', await packageCount(page));
  if (key === 'CH-04:request-handoff-changes') state.set('before-changes', await packageCount(page));
  if (key === 'CH-04:reject-new-exact-handoff-request') state.set('before-rejection', await packageCount(page));
  if (key === 'CH-05:replay-consumption-same-target') state.set('before-consumption-replay', await packageCount(page));
  if (key === 'CH-08:create-baseline-with-exact-package-selectors') state.set('baseline-before-create', await baselineCount(page));
  if (key === 'CH-08:replay-baseline-creation') state.set('baseline-after-create', await baselineCount(page));
};

const executePlannedStep = async ({ planned, session, providerEgress, state, nextTime }) => {
  const { page, identity } = session;
  const interactionSequence = [];
  const startedAt = nextTime();
  if (planned.serverAction) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForUsablePage(page);
    interactionSequence.push('reload:fresh-server-projection');
  }
  await openSurface(page, planned.surface, interactionSequence, planned.stepId);
  await performSpecialInteraction(page, planned.stepId, interactionSequence);
  let proof = { serverAnchor: null, serverBinding: null };
  if (planned.serverAction) {
    const key = `${planned.checkpointId}:${planned.stepId}`;
    if (key === 'CH-01:resolve-material-assess-conflict') {
      const prepared = await prepareAssessConflictPreview(page, interactionSequence);
      assert.equal(prepared.materialConflictCount, 1, 'PR_C_SYNTHETIC_BROWSER_ASSESS_CONFLICT_COUNT');
    }
    if (key === 'CH-01:approve-assess-result') await prepareAssessReviewApproval(page, interactionSequence);
    await snapshotBeforeServerAction(page, key, state);
    await armServerStep(page, planned.checkpointId, planned.stepId, interactionSequence);
    await executeServerAction(page, planned.checkpointId, planned.stepId, interactionSequence, state);
    proof = await collectProof(page, planned.checkpointId, planned.stepId, interactionSequence);
    if (key === 'CH-01:resolve-material-assess-conflict') {
      const apply = page.getByRole('button', { name: 'Apply batch as one Assess draft version', exact: true });
      assert(await apply.isEnabled(), 'PR_C_SYNTHETIC_BROWSER_ASSESS_APPLY_DISABLED');
      await apply.click();
      await page.getByText('Selected batch applied atomically as one new Assess draft version.', { exact: true }).waitFor({ state: 'visible' });
      interactionSequence.push('apply:resolved-assess-preview');
      await openSurface(page, 'assess-case', interactionSequence);
      await finalizeAssessDraftForReview(page, interactionSequence);
      await assignAssessReviewer(page, interactionSequence);
    }
    if (key === 'CH-08:create-baseline-with-exact-package-selectors') {
      const count = await baselineCount(page); assert.equal(count, Number(state.get('baseline-before-create')) + 1); state.set('baseline-after-create', count);
    }
  } else interactionSequence.push(`observe:${planned.stepId}`);
  const assertions = await stepAssertions({ page, checkpointId: planned.checkpointId, stepId: planned.stepId, providerEgress, state, interactionSequence, proof });
  const completedAt = nextTime();
  const location = new URL(page.url());
  const viewport = page.viewportSize();
  const route = `${location.pathname}${location.search}`;
  assert(/^\/[a-z0-9/_?=&.-]{0,255}$/u.test(route), `PR_C_SYNTHETIC_BROWSER_ROUTE_REJECTED:${planned.checkpointId}:${planned.stepId}`);
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
      const identity = await signIn({ page, personaKey, password: binding.passwords[personaKey], ...binding });
      personas.set(personaKey, { context, page, identity });
    }
    const records = createCheckpointRecords();
    const state = new Map(); const nextTime = timestampSequence();
    for (const planned of activeSteps()) {
      if (planned.checkpointId === 'CH-12' && planned.stepId === 'revoked-actor-projection-denied') {
        const reviewer = personas.get('delivery_reviewer'); const interactions = []; await openSurface(reviewer.page, 'delivery', interactions);
        state.set('before-negative-attempts', await packageCount(reviewer.page));
      }
      const session = personas.get(planned.personaKey);
      assert(session, `PR_C_SYNTHETIC_BROWSER_CONTEXT_MISSING:${planned.personaKey}`);
      records.get(planned.checkpointId).steps.push(await executePlannedStep({ planned, session, providerEgress, state, nextTime }));
    }
    assert.equal(providerEgress.length, 0, 'PR_C_SYNTHETIC_BROWSER_PROVIDER_EGRESS');
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
    const finalStep = await executePlannedStep({ planned, session, providerEgress, state: new Map(), nextTime });
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
