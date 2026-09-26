import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from '@playwright/test';

import {
  CONTROLLED_HUMAN_CATALOG,
  CONTROLLED_HUMAN_EXECUTION_ORDER,
  CONTROLLED_HUMAN_SERVER_ACTIONS,
} from './prCControlledHumanEvidenceContract.mjs';
import {
  SYNTHETIC_PERSONA_ORDER,
  requiredSyntheticBrowserAssertionId,
} from './prCSyntheticAcceptanceEvidence.mjs';
import {
  assertResumedIdentity,
  buildBrowserExecutionCatalog,
  deriveBrowserIdentityDigests,
  deterministicPersonaEmail,
  latestCompletedAt,
  parsePasswordBundle,
  signIn,
} from './runPrCSyntheticAcceptanceBrowser.mjs';
import {
  deriveSyntheticApplicationActorDigest,
  deriveSyntheticApplicationSessionDigest,
} from './prCSyntheticIdentity.mjs';

const exerciseDigest = `sha256:${'a'.repeat(64)}`;
const actorId = '30000001-0000-4000-8000-000000000001';
const sessionId = '40000001-0000-4000-8000-000000000001';

test('browser execution catalog covers the exact 84 steps and preserves execution order', () => {
  const catalog = buildBrowserExecutionCatalog();
  assert.equal(catalog.length, 84);
  assert.equal(catalog.filter(record => record.serverAction).length, 43);
  assert.equal(catalog.filter(record => !record.serverAction).length, 41);
  assert.equal(new Set(catalog.map(record => `${record.checkpointId}:${record.stepId}`)).size, 84);
  assert.deepEqual([...new Set(catalog.map(record => record.checkpointId))], CONTROLLED_HUMAN_EXECUTION_ORDER);
  assert.equal(catalog.at(-1).stepId, 'verify-history-readable-and-actions-absent');
  assert.deepEqual(
    CONTROLLED_HUMAN_CATALOG.flatMap(record => record.steps.map(step => requiredSyntheticBrowserAssertionId(record.checkpointId, step.stepId))).length,
    84,
  );
  assert.equal(CONTROLLED_HUMAN_SERVER_ACTIONS.length, 43);
  const revisedDecision = catalog.find(record => record.checkpointId === 'CH-07' && record.stepId === 'decide-revised-descendant');
  assert.equal(revisedDecision?.personaKey, 'delivery_author');
  assert.equal(revisedDecision?.serverAction?.action, 'delivery.item.review');
  const revisedDecisionIndex = catalog.findIndex(record => record === revisedDecision);
  assert.equal(catalog[revisedDecisionIndex - 1]?.stepId, 'commit-only-explicitly-edited-descendants');
  assert.equal(catalog[revisedDecisionIndex + 1]?.stepId, 'review-complete-revised-package');
});

test('password bundle requires every distinct canonical persona credential', () => {
  const bundle = Object.fromEntries(SYNTHETIC_PERSONA_ORDER.map((personaKey, index) => [personaKey, `Synthetic-password-${String(index).padStart(2, '0')}!`]));
  assert.deepEqual(parsePasswordBundle(JSON.stringify(bundle)), bundle);
  assert.throws(() => parsePasswordBundle(JSON.stringify({ ...bundle, requester: bundle.delivery_author })), /PASSWORD_REUSE_REJECTED/u);
  const missing = { ...bundle }; delete missing.requester;
  assert.throws(() => parsePasswordBundle(JSON.stringify(missing)), /PASSWORD_BUNDLE_REJECTED/u);
  assert.equal(deterministicPersonaEmail('requester', exerciseDigest), `prc264.requester.${'a'.repeat(12)}@example.invalid`);
});

test('browser identity digests exactly match the shared server-observer algorithm', () => {
  const actual = deriveBrowserIdentityDigests({ exerciseDigest, personaKey: 'requester', authUserId: actorId, sessionId });
  assert.deepEqual(actual, {
    applicationActorDigest: deriveSyntheticApplicationActorDigest({ exerciseDigest, personaKey: 'requester', authUserId: actorId }),
    applicationSessionDigest: deriveSyntheticApplicationSessionDigest({ exerciseDigest, personaKey: 'requester', sessionId }),
  });
  assert.deepEqual(assertResumedIdentity(actual, structuredClone(actual), 'requester'), actual);
  const rotated = deriveBrowserIdentityDigests({ exerciseDigest, personaKey: 'requester', authUserId: actorId, sessionId: '40000002-0000-4000-8000-000000000002' });
  assert.throws(() => assertResumedIdentity(actual, rotated, 'requester'), /RESUME_IDENTITY_REJECTED/u);
  assert.throws(() => deriveBrowserIdentityDigests({ exerciseDigest, personaKey: 'requester', authUserId: actorId, sessionId: '' }), /APPLICATION_IDENTITY_REJECTED/u);
});

test('sign-in waits for authentication even when the controlled preview banner is already visible', async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const token = `header.${Buffer.from(JSON.stringify({ sub: actorId, session_id: sessionId })).toString('base64url')}.signature`;
    await page.route('https://synthetic.invalid/**', route => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body>
        <section data-testid="controlled-human-nonproduction-banner">Synthetic preview</section>
        <form><label>Work email<input type="email"></label><label>Password<input type="password"></label>
          <button type="submit">Sign in to AvalaOS</button></form>
        <script>document.querySelector('form').addEventListener('submit', event => {
          event.preventDefault(); setTimeout(() => {
            localStorage.setItem('sb-synthetic-auth-token', JSON.stringify({ access_token: ${JSON.stringify(token)}, user: { id: ${JSON.stringify(actorId)} } }));
            document.querySelector('form').remove();
          }, 100);
        });</script>
      </body></html>`,
    }));
    const identity = await signIn({ page, personaKey: 'requester', password: 'Synthetic-password-00!', exerciseDigest, previewOrigin: 'https://synthetic.invalid' });
    assert.deepEqual(identity, deriveBrowserIdentityDigests({ exerciseDigest, personaKey: 'requester', authUserId: actorId, sessionId }));
    const stored = await context.storageState();
    assert.equal(stored.origins.some(origin => origin.localStorage.some(item => item.name === 'sb-synthetic-auth-token')), true);
    await context.close();
  } finally {
    await browser.close();
  }
});

test('active resume boundary is the latest completion across catalog-ordered checkpoints', () => {
  assert.equal(latestCompletedAt([
    { checkpointId: 'CH-13', steps: [{ completedAt: '2026-09-24T10:00:01.000Z' }] },
    { checkpointId: 'CH-14', steps: [{ completedAt: '2026-09-24T10:00:02.000Z' }] },
  ]), '2026-09-24T10:00:02.000Z');
  assert.throws(() => latestCompletedAt([{ checkpointId: 'CH-01', steps: [] }]), /ACTIVE_TIME_REJECTED/u);
});

test('runner is two phase, uses the synthetic migration tip, and contains no aggregate-pass fallback', async () => {
  const source = await readFile(new URL('./runPrCSyntheticAcceptanceBrowser.mjs', import.meta.url), 'utf8');
  assert.match(source, /--phase/u);
  assert.match(source, /\['active', 'read-only'\]/u);
  assert.match(source, /20260926053818/u);
  assert.match(source, /PR_C_SYNTHETIC_BROWSER_EPHEMERAL_STATE_REMAINS/u);
  assert.doesNotMatch(source, /controlledProofVisible|assertBodyPattern|suite.*exit.*passed/iu);
  assert.match(source, /requiredSyntheticBrowserAssertionId/u);
});
