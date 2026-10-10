import assert from 'node:assert/strict';
import test from 'node:test';
import { requireAuthenticatedHostedBinding, validateAuthenticatedHostedProfile } from './authenticatedAcceptanceProfile.mjs';

import { profileFixture } from './authenticatedAcceptanceTestFixtures.mjs';

test('separate authenticated profile accepts only the exact controller binding', () => {
  const p = profileFixture();
  assert.equal(validateAuthenticatedHostedProfile(p), p);
  assert.equal(requireAuthenticatedHostedBinding(p, structuredClone(p)), p);
  for (const key of ['backendDigest', 'migrationDigest', 'exerciseDigest', 'catalogDigest', 'sourceDigest', 'baselineDigest']) {
    const wrong = structuredClone(p); wrong[key] = `sha256:${'9'.repeat(64)}`;
    assert.throws(() => requireAuthenticatedHostedBinding(wrong, p), /BINDING_MISMATCH/);
  }
});

test('fixture authentication, public profiles, foreign origins and unapproved effects are ineligible', () => {
  for (const change of [
    p => { p.authKind = 'fixture_transport'; },
    p => { p.executionKind = 'hosted_preview'; },
    p => { p.origin = 'http://127.0.0.1:4173'; },
    p => { p.origin = 'https://avalaos-pilot.netlify.app/sandbox'; },
    p => { p.origin = 'https://deploy-preview-282--avalaos-pilot.netlify.app'; },
    p => { p.checkoutSha = '9'.repeat(40); },
    p => { p.policy.providersEnabled = true; },
    p => { p.policy.paidCallsAllowed = true; },
    p => { delete p.policy.production; },
    p => { p.workflow.event = 'pull_request'; },
    p => { p.workflow.job = 'local-fixture'; },
    p => { p.window.completedAt = p.window.startedAt; },
    p => { p.sessionToken = 'must-not-be-evidence'; },
    p => { p.actors.pop(); },
    p => { p.actors[0].actorHash = 'raw-actor'; },
  ]) {
    const p = profileFixture(); change(p);
    assert.throws(() => validateAuthenticatedHostedProfile(p), /AUTHENTICATED_ACCEPTANCE_/);
  }
});

test('valid-looking retry and release substitutions cannot reuse an earlier binding', () => {
  const expected = profileFixture();
  for (const change of [
    p => { p.workflow.attempt = '2'; },
    p => { p.workflow.runId = '124'; },
    p => { p.releaseSha = p.checkoutSha = '9'.repeat(40); },
    p => { p.deploymentId = '9'.repeat(24); },
    p => { p.actors[0].sessionHash = `sha256:${'9'.repeat(64)}`; },
  ]) {
    const actual = structuredClone(expected); change(actual);
    assert.throws(() => requireAuthenticatedHostedBinding(actual, expected), /BINDING_MISMATCH/);
  }
});
