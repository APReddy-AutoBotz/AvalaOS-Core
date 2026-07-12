import assert from 'node:assert/strict';
import {
  AI_MODE_BOUNDARY_USER_MESSAGE,
  AiModeBoundaryError,
  AiRuntimeMode,
  getAiExecutionPolicy,
  resolveAiMode,
} from './aiMode';

console.log('Starting AI mode boundary regression suite...');

const validModes: AiRuntimeMode[] = ['local_demo', 'automated_test', 'pilot', 'production'];

for (const mode of validModes) {
  const resolution = resolveAiMode({
    configuredMode: mode,
    isAutomatedTestContext: mode === 'automated_test',
  });
  assert.equal(resolution.status, 'resolved');
  if (resolution.status === 'resolved') {
    assert.equal(resolution.mode, mode);
    assert.equal(resolution.source, 'explicit');
  }
}

for (const invalid of ['staging', 'local-demo', 'internal-dev']) {
  const resolution = resolveAiMode({ configuredMode: invalid, isAutomatedTestContext: false });
  assert.equal(resolution.status, 'blocked');
  if (resolution.status === 'blocked') {
    assert.equal(resolution.code, 'AI_BOUNDARY_INVALID_MODE');
    assert.ok(resolution.error instanceof AiModeBoundaryError);
    assert.equal(resolution.error.message, AI_MODE_BOUNDARY_USER_MESSAGE);
  }
}

for (const missing of [undefined, null, '', '  ']) {
  const resolution = resolveAiMode({ configuredMode: missing, isAutomatedTestContext: false });
  assert.equal(resolution.status, 'blocked');
  if (resolution.status === 'blocked') assert.equal(resolution.code, 'AI_BOUNDARY_MODE_REQUIRED');
}

const uncontrolledTest = resolveAiMode({
  configuredMode: 'automated_test',
  isAutomatedTestContext: false,
});
assert.equal(uncontrolledTest.status, 'blocked');
if (uncontrolledTest.status === 'blocked') {
  assert.equal(uncontrolledTest.code, 'AI_BOUNDARY_AUTOMATED_TEST_CONTEXT_REQUIRED');
}

for (const mode of ['pilot', 'production'] as const) {
  const resolution = resolveAiMode({ configuredMode: mode, isAutomatedTestContext: false });
  const disabledPolicy = getAiExecutionPolicy({ modeResolution: resolution, edgeEnabled: false });
  assert.equal(disabledPolicy.status, 'blocked');
  if (disabledPolicy.status === 'blocked') {
    assert.equal(disabledPolicy.code, 'AI_BOUNDARY_EDGE_REQUIRED');
    assert.equal(disabledPolicy.requiresEdge, true);
    assert.equal(disabledPolicy.allowBrowserFallback, false);
  }

  const enabledPolicy = getAiExecutionPolicy({ modeResolution: resolution, edgeEnabled: true });
  assert.equal(enabledPolicy.status, 'allowed');
  if (enabledPolicy.status === 'allowed') {
    assert.equal(enabledPolicy.boundary, 'edge');
    assert.equal(enabledPolicy.allowBrowserFallback, false);
  }
}

for (const [mode, isAutomatedTestContext] of [
  ['local_demo', false],
  ['automated_test', true],
] as const) {
  const resolution = resolveAiMode({ configuredMode: mode, isAutomatedTestContext });
  const policy = getAiExecutionPolicy({ modeResolution: resolution, edgeEnabled: false });
  assert.equal(policy.status, 'allowed');
  if (policy.status === 'allowed') {
    assert.equal(policy.boundary, 'browser-demo-test-fallback');
    assert.equal(policy.allowBrowserFallback, true);
  }
}

for (const mode of ['local_demo', 'automated_test'] as const) {
  const resolution = resolveAiMode({ configuredMode: mode, isAutomatedTestContext: mode === 'automated_test' });
  const policy = getAiExecutionPolicy({ modeResolution: resolution, edgeEnabled: false, dataAccess: 'server' });
  assert.equal(policy.status, 'blocked');
  if (policy.status === 'blocked') {
    assert.equal(policy.code, 'AI_BOUNDARY_EDGE_REQUIRED');
    assert.equal(policy.allowBrowserFallback, false);
  }
}
console.log('AI mode boundary regression suite passed.');
