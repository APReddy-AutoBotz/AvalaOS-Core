import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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
} from './runPrCSyntheticAcceptanceBrowser.mjs';
import {
  deriveSyntheticApplicationActorDigest,
  deriveSyntheticApplicationSessionDigest,
} from './prCSyntheticIdentity.mjs';

const exerciseDigest = `sha256:${'a'.repeat(64)}`;
const actorId = '30000001-0000-4000-8000-000000000001';
const sessionId = '40000001-0000-4000-8000-000000000001';

test('browser execution catalog covers the exact 83 steps and preserves execution order', () => {
  const catalog = buildBrowserExecutionCatalog();
  assert.equal(catalog.length, 83);
  assert.equal(catalog.filter(record => record.serverAction).length, 42);
  assert.equal(catalog.filter(record => !record.serverAction).length, 41);
  assert.equal(new Set(catalog.map(record => `${record.checkpointId}:${record.stepId}`)).size, 83);
  assert.deepEqual([...new Set(catalog.map(record => record.checkpointId))], CONTROLLED_HUMAN_EXECUTION_ORDER);
  assert.equal(catalog.at(-1).stepId, 'verify-history-readable-and-actions-absent');
  assert.deepEqual(
    CONTROLLED_HUMAN_CATALOG.flatMap(record => record.steps.map(step => requiredSyntheticBrowserAssertionId(record.checkpointId, step.stepId))).length,
    83,
  );
  assert.equal(CONTROLLED_HUMAN_SERVER_ACTIONS.length, 42);
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
  assert.match(source, /20260924113000/u);
  assert.match(source, /PR_C_SYNTHETIC_BROWSER_EPHEMERAL_STATE_REMAINS/u);
  assert.doesNotMatch(source, /controlledProofVisible|assertBodyPattern|suite.*exit.*passed/iu);
  assert.match(source, /requiredSyntheticBrowserAssertionId/u);
});
