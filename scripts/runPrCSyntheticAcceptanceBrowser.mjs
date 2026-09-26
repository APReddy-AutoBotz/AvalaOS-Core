import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
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

const SURFACE_BY_CHECKPOINT = Object.freeze({
  'CH-01': 'assess', 'CH-02': 'studio', 'CH-03': 'studio', 'CH-04': 'delivery',
  'CH-05': 'delivery', 'CH-06': 'delivery', 'CH-07': 'delivery', 'CH-08': 'delivery',
  'CH-09': 'monitor', 'CH-10': 'studio', 'CH-11': 'delivery', 'CH-12': 'delivery',
  'CH-13': 'delivery', 'CH-14': 'delivery',
});

const NAVIGATION_LABELS = Object.freeze({
  assess: ['Assess', 'Enterprise Intelligence'],
  studio: ['Document Vault', 'Enterprise Intelligence'],
  'studio-docs': ['Document Vault'],
  delivery: ['Enterprise Intelligence'],
  monitor: ['Enterprise Intelligence'],
});

const TAB_LABELS = Object.freeze({
  assess: ['Mapping Review', 'Source Library'],
  studio: ['Studio Handoff'],
  'studio-docs': [],
  delivery: ['Work Package'],
  monitor: ['Monitor Baseline'],
});

const TAB_BY_STEP = Object.freeze({
  'select-two-assess-transcripts': 'Source Library',
  'complete-remaining-assess-fields-manually': 'Mapping Review',
  'resolve-material-assess-conflict': 'Mapping Review',
});

const ACTION_LABELS = Object.freeze({
  'transcript.assess.conflict.resolve': ['Use selected suggestion', 'Retain manual value', 'Use edited resolution'],
  'assessment_v2.review.resolve': ['Approve review', 'Approve assessment'],
  'studio.artifact.review.resolve': ['Approve review', 'Submit review'],
  'studio.artifact.approval.resolve': ['Final approve', 'Approve document'],
  'handoff.request': ['Request handoff'],
  'handoff.review.resolve': ['Approve review', 'Review handoff'],
  'handoff.approval.resolve': ['Final handoff approval', 'Approve handoff'],
  'handoff.consume': ['Accept handoff', 'Start document draft'],
  'pr_c.controlled_human.synthetic_studio_generate': ['Generate source-bound document', 'Generate document'],
  'delivery.handoff.request': ['Request handoff'],
  'delivery.handoff.review.resolve': ['Approve review', 'Request changes', 'Reject request'],
  'delivery.handoff.approval.resolve': ['Final handoff approval', 'Approve handoff'],
  'delivery.handoff.consume': ['Start Delivery draft'],
  'delivery.item.review': ['Edit immutable descendant', 'Accept proposal'],
  'delivery.package.revision.commit': ['Submit resolved package', 'Commit revision'],
  'delivery.package.review.resolve': ['Approve review', 'Request package changes', 'Request changes'],
  'delivery.package.approval.resolve': ['Final package approval', 'Approve package'],
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
  'CH-07:review-complete-revised-package': ['Approve review'],
  'CH-13:simulate-response-loss': ['Submit resolved package', 'Commit revision'],
});

// Each browser-only step names one exact application control or state. Candidate
// alternatives account for the same production component appearing on different
// responsive surfaces; a generic page/body match is intentionally unsupported.
const BROWSER_ASSERTION_PLANS = Object.freeze({
  'select-two-assess-transcripts': { kind: 'control-count', role: 'button', names: ['Use in Assess'], minimum: 2, activate: 2 },
  'complete-remaining-assess-fields-manually': { kind: 'complete-assess-fields', names: ['Save assessment draft', 'Save draft'] },
  'decline-studio-handoff': { kind: 'control-absence', role: 'button', names: ['Request Studio handoff', 'Send to Studio'] },
  'verify-no-studio-resource': { kind: 'text', values: ['No retained Studio document is visible in this workspace.', 'No Studio artifact has been created.'] },
  'select-two-different-studio-transcripts': { kind: 'control-count', role: 'button', names: ['Use in Studio'], minimum: 2, activate: 2 },
  'select-custom-template': { kind: 'select', labels: ['Template', 'Document template'], option: 'Custom' },
  'edit-structured-document': { kind: 'edit-structured-document', names: ['Save revision', 'Save document'] },
  'stop-with-no-delivery-resource': { kind: 'text', values: ['No retained Delivery package is visible in this workspace.', 'No Delivery packages are present.'] },
  'verify-approved-assess-handoff-ready': { kind: 'text', values: ['approved', 'handoff ready'], exact: true },
  'add-disjoint-studio-supplements': { kind: 'control-count', role: 'button', names: ['Use in Studio'], minimum: 2, activate: 2 },
  'preview-approved-studio-handoff': { kind: 'activate-text', values: ['Server-derived handoff preview · 250 items'], outcome: ['Server-bound proposal integrity verified.'] },
  'verify-request-creates-no-delivery-package': { kind: 'package-count-unchanged', stateKey: 'before-request' },
  'verify-changes-create-no-target-draft': { kind: 'package-count-unchanged', stateKey: 'before-changes' },
  'verify-rejection-creates-no-target-draft': { kind: 'package-count-unchanged', stateKey: 'before-rejection' },
  'verify-replay-created-no-second-package': { kind: 'package-count-unchanged', stateKey: 'before-consumption-replay' },
  'inspect-deterministic-item-citations': { kind: 'testid-text', testId: 'governed-delivery-workspace', values: ['BRD artifact v4'] },
  'compare-immutable-descendant-history': { kind: 'activate-control', role: 'button', names: ['Version diff and history'], outcome: ['Changed fields: title, description'] },
  'verify-complete-bounded-item-set': { kind: 'testid-text', testId: 'delivery-item-pagination-complete', values: ['All 250 canonical items are loaded from 3 bounded server pages.'] },
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
  'keyboard-only-handoff': { kind: 'keyboard-target', role: 'button', names: ['Request handoff'] },
  'keyboard-only-item-edit': { kind: 'keyboard-target', role: 'button', names: ['Edit immutable descendant'] },
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
      && verified.migrationTip === '20260924113000' && verified.productionAuthorized === false && verified.customerDataAuthorized === false
      && verified.realProviderCallsAuthorized === false, 'PR_C_SYNTHETIC_BROWSER_PREPARATION_BINDING_REJECTED');
  }
  const binding = {
    repository: 'APReddy-AutoBotz/AvalaOS-Core', prNumber: 264, branch: PR_BRANCH, exactHead,
    preview: { origin: previewOrigin, deployId, releaseSha: exactHead, environment: 'hosted_nonproduction_pilot', context: 'deploy-preview', reviewId: 264, siteName: 'avalaos-pilot' },
    backend: { exerciseDigest, targetFingerprint, publicTargetDigest, personaManifestDigest, fixtureManifestDigest, migrationTip: '20260924113000' },
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

const openSurface = async (page, surface, interactionSequence, stepId = '') => {
  const headings = {
    assess: /Assess|Enterprise Intelligence/iu,
    studio: /Studio|Document Vault|Enterprise Intelligence/iu,
    'studio-docs': /Document Repository|Document Vault|Avala Studio/iu,
    delivery: /Enterprise Intelligence/iu,
    monitor: /Enterprise Intelligence|Monitor/iu,
  };
  if (!(await page.getByRole('heading', { name: headings[surface] }).count())) {
    await clickFirstLabel(page, NAVIGATION_LABELS[surface], interactionSequence);
    await waitForUsablePage(page);
  }
  const tabs = TAB_BY_STEP[stepId] ? [TAB_BY_STEP[stepId]] : TAB_LABELS[surface];
  for (const tab of tabs) {
    const clicked = await clickFirstLabel(page, [tab], interactionSequence, false);
    if (clicked) break;
  }
  await waitForUsablePage(page);
};

const fillIfVisible = async (page, label, value, interactionSequence) => {
  const input = page.getByLabel(label, { exact: true }).last();
  if (!(await input.count()) || !(await input.isVisible()) || await input.isDisabled()) return false;
  await input.fill(value); interactionSequence.push(`fill:${safeLabel(label)}`); return true;
};

const prepareServerAction = async (page, checkpointId, stepId, interactionSequence) => {
  const key = `${checkpointId}:${stepId}`;
  if (key === 'CH-01:resolve-material-assess-conflict') await fillIfVisible(page, 'Required resolution rationale', 'Synthetic conflict resolved against the reviewed source set.', interactionSequence);
  if (key === 'CH-10:create-direct-studio-plan') {
    const select = page.getByLabel('Exact locked Studio bundle', { exact: true });
    if (await select.count()) { const values = await select.locator('option').evaluateAll(options => options.map(option => option.value).filter(Boolean)); assert(values.length > 0, 'PR_C_SYNTHETIC_BROWSER_DIRECT_BUNDLE_MISSING'); await select.selectOption(values[0]); interactionSequence.push('select:exact-locked-studio-bundle'); }
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

const executeServerAction = async (page, checkpointId, stepId, interactionSequence) => {
  const key = `${checkpointId}:${stepId}`;
  const contract = SERVER_ACTION_BY_STEP.get(key);
  assert(contract, `PR_C_SYNTHETIC_BROWSER_SERVER_CONTRACT_MISSING:${key}`);
  const labels = ACTION_LABEL_OVERRIDES[key] ?? ACTION_LABELS[contract.action];
  assert(labels?.length, `PR_C_SYNTHETIC_BROWSER_ACTION_PLAN_MISSING:${key}`);
  await prepareServerAction(page, checkpointId, stepId, interactionSequence);
  await clickFirstLabel(page, labels, interactionSequence);
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
    const workspace = (await page.getByTestId('enterprise-assess').count()) ? page.getByTestId('enterprise-assess') : page.getByTestId('enterprise-intelligence-workspace');
    await workspace.waitFor({ state: 'visible' }); let completedFieldCount = 0;
    for (const field of await workspace.locator('input[required]:not([type=hidden]), textarea[required]').all()) {
      if (!(await field.isVisible()) || await field.isDisabled() || (await field.inputValue()).trim()) continue;
      await field.fill(`Synthetic manual completion ${completedFieldCount + 1}`); completedFieldCount += 1;
    }
    const save = await namedControl(workspace, 'button', plan.names); assert(await save.locator.isEnabled()); await save.locator.click(); interactionSequence.push(`activate:${safeLabel(save.name)}`);
    observed = { savedWithControl: save.name, manuallyCompletedFieldCount: completedFieldCount, workspaceDigest: digest(await workspace.innerText()) };
  } else if (plan.kind === 'edit-structured-document') {
    const editors = page.locator('textarea'); let editor = null;
    for (let index = 0; index < await editors.count(); index += 1) if (await editors.nth(index).isVisible() && !(await editors.nth(index).isDisabled())) { editor = editors.nth(index); break; }
    assert(editor, 'PR_C_SYNTHETIC_BROWSER_STRUCTURED_EDITOR_MISSING');
    const prior = await editor.inputValue(); const appended = `${prior}\nSynthetic acceptance edit.`.trim(); await editor.fill(appended); interactionSequence.push('fill:structured-document');
    const save = await namedControl(page, 'button', plan.names); assert(await save.locator.isEnabled()); await save.locator.click(); interactionSequence.push(`activate:${safeLabel(save.name)}`);
    observed = { saveControl: save.name, priorDigest: digest(prior), savedDigest: digest(appended), changed: appended !== prior };
  } else if (plan.kind === 'control-absence') {
    const counts = {}; for (const name of plan.names) counts[name] = await page.getByRole(plan.role, { name, exact: true }).count();
    assert(Object.values(counts).every(count => count === 0), `PR_C_SYNTHETIC_BROWSER_CONTROL_PRESENT:${stepId}`); observed = counts;
  } else if (plan.kind === 'control-count') {
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
  else if (plan.kind === 'keyboard-target') { const control = await namedControl(page, plan.role, plan.names); await control.locator.focus(); await page.keyboard.press('Enter'); interactionSequence.push(`keyboard-activate:${safeLabel(control.name)}`); observed = { control: control.name, activatedWith: 'enter' }; }
  else if (plan.kind === 'focused-alert') {
    const dialog = page.getByRole('dialog').last(); assert(await dialog.count() && await dialog.isVisible(), 'PR_C_SYNTHETIC_BROWSER_A11Y_DIALOG_MISSING');
    const title = dialog.getByLabel('Item title', { exact: true }); assert(await title.count()); await title.fill('Preserved synthetic invalid input'); interactionSequence.push('fill:item-title');
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click(); interactionSequence.push('activate:dialog-confirm-without-rationale');
    const alert = dialog.getByRole('alert').last(); assert(await alert.count() && await alert.isVisible()); assert(await alert.evaluate(node => node === document.activeElement)); observed = { role: 'alert', focused: true, textDigest: digest(await alert.innerText()) };
  }
  else if (plan.kind === 'preserved-input') { const input = page.getByLabel(plan.label, { exact: true }).last(); const value = await input.inputValue(); assert(value.trim().length > 0); observed = { label: plan.label, valueDigest: digest(value) }; }
  else if (plan.kind === 'focus-return') { if (await page.getByRole('dialog').count()) { await page.keyboard.press('Escape'); interactionSequence.push('keyboard:escape'); } const control = await namedControl(page, plan.role, plan.names); assert(await control.locator.evaluate(node => node === document.activeElement)); observed = { control: control.name, focused: true }; }
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
  else if (stepId.startsWith('keyboard-only-')) { await page.keyboard.press('Tab'); interactionSequence.push('keyboard:tab'); }
};

export const buildBrowserExecutionCatalog = () => CONTROLLED_HUMAN_EXECUTION_ORDER.flatMap(checkpointId => {
  const checkpoint = CATALOG_BY_CHECKPOINT.get(checkpointId);
  assert(checkpoint, `PR_C_SYNTHETIC_BROWSER_CHECKPOINT_MISSING:${checkpointId}`);
  return checkpoint.steps.map(step => {
    const key = `${checkpointId}:${step.stepId}`;
    const serverAction = SERVER_ACTION_BY_STEP.get(key) ?? null;
    if (serverAction) assert((ACTION_LABEL_OVERRIDES[key] ?? ACTION_LABELS[serverAction.action])?.length, `PR_C_SYNTHETIC_BROWSER_ACTION_PLAN_MISSING:${key}`);
    else assert(BROWSER_ASSERTION_PLANS[step.stepId], `PR_C_SYNTHETIC_BROWSER_READ_PLAN_MISSING:${key}`);
    const surface = checkpointId === 'CH-02' || checkpointId === 'CH-03' ? 'studio-docs'
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
  assert.equal(catalog.length, 83, 'PR_C_SYNTHETIC_BROWSER_CATALOG_COUNT');
  assert.equal(campaign.checkpoints?.length, 14, 'PR_C_SYNTHETIC_BROWSER_CHECKPOINT_COUNT');
  const steps = campaign.checkpoints.flatMap(record => record.steps.map(step => ({ checkpointId: record.checkpointId, ...step })));
  assert.equal(steps.length, 83, 'PR_C_SYNTHETIC_BROWSER_STEP_COUNT');
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
  await openSurface(page, planned.surface, interactionSequence, planned.stepId);
  await performSpecialInteraction(page, planned.stepId, interactionSequence);
  let proof = { serverAnchor: null, serverBinding: null };
  if (planned.serverAction) {
    const key = `${planned.checkpointId}:${planned.stepId}`;
    await snapshotBeforeServerAction(page, key, state);
    await armServerStep(page, planned.checkpointId, planned.stepId, interactionSequence);
    await executeServerAction(page, planned.checkpointId, planned.stepId, interactionSequence);
    proof = await collectProof(page, planned.checkpointId, planned.stepId, interactionSequence);
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
