import assert from 'node:assert/strict';
import {
  AI_MODE_BOUNDARY_USER_MESSAGE,
  AiModeBoundaryError,
  AiRuntimeMode,
  getAiExecutionPolicy,
  resolveAiMode,
} from './aiMode';

console.log('Starting AI mode boundary regression suite...');

const validModes: AiRuntimeMode[] = ['local-demo', 'internal-dev', 'pilot', 'production'];

for (const mode of validModes) {
  const resolution = resolveAiMode({ configuredMode: mode, isDev: false, isProd: true });
  assert.equal(resolution.status, 'resolved');
  if (resolution.status === 'resolved') {
    assert.equal(resolution.mode, mode);
    assert.equal(resolution.source, 'explicit');
  }
}

const invalidMode = resolveAiMode({ configuredMode: 'staging', isDev: false, isProd: true });
assert.equal(invalidMode.status, 'blocked');
if (invalidMode.status === 'blocked') {
  assert.equal(invalidMode.code, 'AI_BOUNDARY_INVALID_MODE');
  assert.ok(invalidMode.error instanceof AiModeBoundaryError);
  assert.equal(invalidMode.error.code, 'AI_BOUNDARY_INVALID_MODE');
  assert.equal(invalidMode.error.message, AI_MODE_BOUNDARY_USER_MESSAGE);
}

const devDefault = resolveAiMode({ configuredMode: undefined, isDev: true, isProd: false });
assert.equal(devDefault.status, 'resolved');
if (devDefault.status === 'resolved') {
  assert.equal(devDefault.mode, 'local-demo');
  assert.equal(devDefault.source, 'dev-default');
}

const prodMissingMode = resolveAiMode({ configuredMode: undefined, isDev: false, isProd: true });
assert.equal(prodMissingMode.status, 'blocked');
if (prodMissingMode.status === 'blocked') {
  assert.equal(prodMissingMode.code, 'AI_BOUNDARY_MODE_REQUIRED');
  assert.equal(prodMissingMode.error.code, 'AI_BOUNDARY_MODE_REQUIRED');
}

const nonDevMissingMode = resolveAiMode({ configuredMode: '', isDev: false, isProd: false });
assert.equal(nonDevMissingMode.status, 'blocked');
if (nonDevMissingMode.status === 'blocked') {
  assert.equal(nonDevMissingMode.code, 'AI_BOUNDARY_MODE_REQUIRED');
}

for (const mode of ['pilot', 'production'] as const) {
  const resolution = resolveAiMode({ configuredMode: mode, isDev: false, isProd: true });
  const disabledPolicy = getAiExecutionPolicy({ modeResolution: resolution, edgeEnabled: false });
  assert.equal(disabledPolicy.status, 'blocked');
  if (disabledPolicy.status === 'blocked') {
    assert.equal(disabledPolicy.mode, mode);
    assert.equal(disabledPolicy.code, 'AI_BOUNDARY_EDGE_REQUIRED');
    assert.equal(disabledPolicy.error.code, 'AI_BOUNDARY_EDGE_REQUIRED');
    assert.equal(disabledPolicy.requiresEdge, true);
    assert.equal(disabledPolicy.allowBrowserFallback, false);
  }

  const enabledPolicy = getAiExecutionPolicy({ modeResolution: resolution, edgeEnabled: true });
  assert.equal(enabledPolicy.status, 'allowed');
  if (enabledPolicy.status === 'allowed') {
    assert.equal(enabledPolicy.mode, mode);
    assert.equal(enabledPolicy.useEdge, true);
    assert.equal(enabledPolicy.requiresEdge, true);
    assert.equal(enabledPolicy.allowBrowserFallback, false);
    assert.equal(enabledPolicy.boundary, 'edge');
  }
}

const localDemoResolution = resolveAiMode({ configuredMode: 'local-demo', isDev: false, isProd: true });
const localDemoPolicy = getAiExecutionPolicy({ modeResolution: localDemoResolution, edgeEnabled: false });
assert.equal(localDemoPolicy.status, 'allowed');
if (localDemoPolicy.status === 'allowed') {
  assert.equal(localDemoPolicy.mode, 'local-demo');
  assert.equal(localDemoPolicy.useEdge, false);
  assert.equal(localDemoPolicy.allowBrowserFallback, true);
  assert.equal(localDemoPolicy.isDemoOrDevFallback, true);
  assert.equal(localDemoPolicy.fallbackLabel, 'local-demo synthetic/prepared fallback');
  assert.equal(localDemoPolicy.boundary, 'browser-demo-dev-fallback');
}

const internalDevResolution = resolveAiMode({ configuredMode: 'internal-dev', isDev: false, isProd: true });
const internalDevPolicy = getAiExecutionPolicy({ modeResolution: internalDevResolution, edgeEnabled: false });
assert.equal(internalDevPolicy.status, 'allowed');
if (internalDevPolicy.status === 'allowed') {
  assert.equal(internalDevPolicy.mode, 'internal-dev');
  assert.equal(internalDevPolicy.useEdge, false);
  assert.equal(internalDevPolicy.allowBrowserFallback, true);
  assert.equal(internalDevPolicy.isDemoOrDevFallback, true);
  assert.equal(internalDevPolicy.fallbackLabel, 'internal-dev transitional fallback');
  assert.equal(internalDevPolicy.boundary, 'browser-demo-dev-fallback');
}

const blockedPolicy = getAiExecutionPolicy({ modeResolution: invalidMode, edgeEnabled: true });
assert.equal(blockedPolicy.status, 'blocked');
if (blockedPolicy.status === 'blocked') {
  assert.equal(blockedPolicy.code, 'AI_BOUNDARY_INVALID_MODE');
  assert.equal(blockedPolicy.error.code, 'AI_BOUNDARY_INVALID_MODE');
  assert.equal(blockedPolicy.allowBrowserFallback, false);
}

console.log('AI mode boundary regression suite passed.');
