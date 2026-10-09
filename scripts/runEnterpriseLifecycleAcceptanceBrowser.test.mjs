import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateEnterpriseLifecycleBrowserEvidence,
  assertEnterpriseLifecycleLoopbackUrl,
  ENTERPRISE_LIFECYCLE_BROWSER_ASSERTIONS,
  ENTERPRISE_LIFECYCLE_BROWSER_PROJECTS,
  ENTERPRISE_LIFECYCLE_BROWSER_STAGES,
  resolveEnterpriseLifecycleExecutionIdentity,
} from './runEnterpriseLifecycleAcceptanceBrowser.mjs';

const binding = `sha256:${'a'.repeat(64)}`;
const executionId = `sha256:${'b'.repeat(64)}`;
const scope = { executionHash: `sha256:${'c'.repeat(64)}` };
const execution = { headSha: 'candidate-head', runId: '123', runAttempt: '2' };
const providerEffects = {
  paidCalls: 0,
  realProviderAllowed: false,
  calls: 0,
  egress: 0,
  egressAttempts: 0,
  syntheticProviderCalls: 2,
  browserSecrets: false,
  providerMode: 'synthetic-production-pipeline',
  syntheticAdapterEnabled: true,
  forbiddenNetworkGuardTriggered: true,
};
const cleanup = { backendAttempted: true, backendSucceeded: true, browserContextsClosed: true };
const fragment = project => ({
  schemaVersion: 'enterprise-lifecycle-browser-project-v1',
  journeyBinding: binding,
  project,
  status: 'passed',
  startedAt: '2026-10-09T10:00:00.000Z',
  completedAt: '2026-10-09T10:01:00.000Z',
  network: { observedHttpRequests: 12, nonLoopbackRequests: 0 },
  stages: ENTERPRISE_LIFECYCLE_BROWSER_STAGES.map(id => ({ id, uiObserved: true, ...(id === 'reload-committed-state' ? { reloadObserved: true } : {}) })),
  assertions: ENTERPRISE_LIFECYCLE_BROWSER_ASSERTIONS.map(id => ({ id, observed: true })),
});

test('candidate head overrides merge and local identities', () => {
  assert.deepEqual(resolveEnterpriseLifecycleExecutionIdentity({
    PILOT_ACCEPTANCE_HEAD: 'candidate', GITHUB_SHA: 'merge', GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '3',
  }), { headSha: 'candidate', runId: '42', runAttempt: '3' });
});

test('only loopback HTTP origins are accepted', () => {
  assert.equal(assertEnterpriseLifecycleLoopbackUrl('http://127.0.0.1:4321/'), 'http://127.0.0.1:4321');
  assert.equal(assertEnterpriseLifecycleLoopbackUrl('http://localhost:4321'), 'http://localhost:4321');
  assert.throws(() => assertEnterpriseLifecycleLoopbackUrl('https://example.test'), /NON_LOOPBACK/u);
  assert.throws(() => assertEnterpriseLifecycleLoopbackUrl('https://127.0.0.1:4321'), /NON_LOOPBACK/u);
});

test('aggregates both exact projects with every observed stage', () => {
  const evidence = aggregateEnterpriseLifecycleBrowserEvidence({
    fragments: ENTERPRISE_LIFECYCLE_BROWSER_PROJECTS.map(fragment), binding,
    journeyBinding: binding, executionId, scope, execution, providerEffects, cleanup,
    startedAt: '2026-10-09T10:00:00.000Z', completedAt: '2026-10-09T10:02:00.000Z',
  });
  assert.equal(evidence.status, 'passed');
  assert.match(evidence.execution.executionId, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(evidence.projects.map(project => project.project), ENTERPRISE_LIFECYCLE_BROWSER_PROJECTS);
  assert.deepEqual(evidence.network, { observedHttpRequests: 24, nonLoopbackRequests: 0 });
  assert.deepEqual(evidence.providerEffects, providerEffects);
  assert.deepEqual(evidence.cleanup, cleanup);
});

test('rejects missing stages, substituted bindings and false observations', () => {
  const valid = ENTERPRISE_LIFECYCLE_BROWSER_PROJECTS.map(fragment);
  const input = overrides => ({
    fragments: valid, journeyBinding: binding, executionId, scope, execution, providerEffects, cleanup,
    startedAt: '2026-10-09T10:00:00.000Z', completedAt: '2026-10-09T10:02:00.000Z', ...overrides,
  });
  assert.throws(() => aggregateEnterpriseLifecycleBrowserEvidence(input({
    fragments: [{ ...valid[0], stages: valid[0].stages.slice(1) }, valid[1]],
  })), /STAGE_MISSING/u);
  assert.throws(() => aggregateEnterpriseLifecycleBrowserEvidence(input({
    fragments: [{ ...valid[0], journeyBinding: `sha256:${'b'.repeat(64)}` }, valid[1]],
  })), /PROJECT_INVALID/u);
  assert.throws(() => aggregateEnterpriseLifecycleBrowserEvidence(input({
    fragments: [{ ...valid[0], assertions: [{ id: 'false', observed: false }] }, valid[1]],
  })), /ASSERTION_INVALID/u);
  assert.throws(() => aggregateEnterpriseLifecycleBrowserEvidence(input({
    fragments: [{ ...valid[0], network: { observedHttpRequests: 12, nonLoopbackRequests: 1 } }, valid[1]],
  })), /NETWORK_INVALID/u);
  assert.throws(() => aggregateEnterpriseLifecycleBrowserEvidence(input({
    providerEffects: { ...providerEffects, calls: 1 },
  })), /PROVIDER_EFFECT_INVALID/u);
  assert.throws(() => aggregateEnterpriseLifecycleBrowserEvidence(input({
    cleanup: { ...cleanup, backendSucceeded: false },
  })), /CLEANUP_INVALID/u);
});
