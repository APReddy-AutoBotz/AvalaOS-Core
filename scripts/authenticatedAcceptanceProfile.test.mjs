import assert from 'node:assert/strict';
import test from 'node:test';
import { requireAuthenticatedHostedBinding, validateAuthenticatedHostedProfile } from './authenticatedAcceptanceProfile.mjs';
import { createHostedAcceptanceWorkflowRuntime, resolveHostedAcceptanceWorkflowPath } from './hostedAcceptanceReportProvenance.mjs';

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
    p => { p.secretBackendKind = 'environment'; },
    p => { delete p.secretBackendKind; },
    p => { p.origin = 'http://127.0.0.1:4173'; },
    p => { p.origin = 'https://avalaos-pilot.netlify.app/sandbox'; },
    p => { p.origin = 'https://deploy-preview-282--avalaos-pilot.netlify.app'; },
    p => { p.checkoutSha = '9'.repeat(40); },
    p => { p.policy.providersEnabled = true; },
    p => { p.policy.paidCallsAllowed = true; },
    p => { delete p.policy.production; },
    p => { p.workflow.caller.event = 'pull_request'; },
    p => { p.workflow.caller.job = 'local-fixture'; },
    p => { p.workflow.producer.path = '.github/workflows/authenticated-product-acceptance.yml'; },
    p => { p.window.completedAt = p.window.startedAt; },
    p => { p.sessionToken = 'must-not-be-evidence'; },
    p => { p.actors.pop(); },
    p => { p.actors[0].actorHash = 'raw-actor'; },
    p => { p.actors.find(actor => actor.persona === 'reviewer').actorHash = p.actors.find(actor => actor.persona === 'author').actorHash; },
    p => { p.actors[1].sessionHash = p.actors[0].sessionHash; },
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
    p => { p.secretBackendKind = 'hashicorp_vault'; },
    p => { p.actors[0].sessionHash = `sha256:${'9'.repeat(64)}`; },
  ]) {
    const actual = structuredClone(expected); change(actual);
    assert.throws(() => requireAuthenticatedHostedBinding(actual, expected), /BINDING_MISMATCH/);
  }
});

test('canonical exhaustive producer preserves only the exact authenticated dispatch caller', () => {
  const p = profileFixture();
  const environment = {
    GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: p.workflow.repository,
    GITHUB_WORKFLOW_REF: p.workflow.caller.ref, GITHUB_EVENT_NAME: p.workflow.caller.event,
    GITHUB_RUN_ID: p.workflow.runId, GITHUB_RUN_ATTEMPT: p.workflow.attempt,
    GITHUB_SHA: p.releaseSha, RELEASE_SHA: p.releaseSha, GITHUB_JOB: p.workflow.caller.job,
    AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND: p.executionKind,
    ACCEPTANCE_WORKFLOW_PATH: p.workflow.producer.path,
  };
  const runtime = createHostedAcceptanceWorkflowRuntime({ environment,
    workflowPath: p.workflow.producer.path, releaseSha: p.releaseSha });
  assert.equal(runtime.workflowPath, '.github/workflows/exhaustive-acceptance.yml');
  assert.equal(runtime.callerWorkflowPath, '.github/workflows/authenticated-product-acceptance.yml');
  assert.equal(resolveHostedAcceptanceWorkflowPath({ environment,
    allowedWorkflowPaths: ['.github/workflows/exhaustive-acceptance.yml'] }), '.github/workflows/exhaustive-acceptance.yml');
  for (const change of [
    e => { e.GITHUB_JOB = 'acceptance'; },
    e => { e.GITHUB_EVENT_NAME = 'pull_request'; },
    e => { e.GITHUB_WORKFLOW_REF = e.GITHUB_WORKFLOW_REF.replace('main', 'candidate'); },
  ]) {
    const invalid = { ...environment }; change(invalid);
    assert.throws(() => createHostedAcceptanceWorkflowRuntime({ environment: invalid,
      workflowPath: p.workflow.producer.path, releaseSha: p.releaseSha }), /HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED/);
  }
});
