import assert from 'node:assert/strict';
import {
  isHostedSyntheticSandboxPath,
  shouldUseHostedSyntheticSandbox,
} from './hostedSandboxRoute';

console.log('Starting hosted Sandbox route regression suite...');

assert.equal(isHostedSyntheticSandboxPath('/sandbox'), true);
assert.equal(isHostedSyntheticSandboxPath('/sandbox/'), true);
assert.equal(isHostedSyntheticSandboxPath('/sandbox/process/123'), true);
assert.equal(isHostedSyntheticSandboxPath('/'), false);
assert.equal(isHostedSyntheticSandboxPath('/sign-in'), false);
assert.equal(isHostedSyntheticSandboxPath('/sandboxed'), false);

assert.equal(shouldUseHostedSyntheticSandbox({ enabled: true, pathname: '/sandbox' }), true);
assert.equal(shouldUseHostedSyntheticSandbox({ enabled: true, runtimeMode: 'pilot', pathname: '/sandbox/process/123' }), true);
assert.equal(shouldUseHostedSyntheticSandbox({ enabled: false, runtimeMode: 'pilot', pathname: '/sandbox' }), false);
assert.equal(shouldUseHostedSyntheticSandbox({ enabled: true, runtimeMode: 'production', pathname: '/sandbox' }), false);
assert.equal(shouldUseHostedSyntheticSandbox({ enabled: true, runtimeMode: 'pilot', pathname: '/sign-in' }), false);

console.log('Hosted Sandbox route regression suite passed.');
