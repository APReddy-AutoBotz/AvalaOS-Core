import assert from 'node:assert/strict';
import { clientRequestContextIsLoading, clientRequestContextKey, createContextRequestGate } from './contextRequestGate';

const gate = createContextRequestGate();
const workspaceA = { actorId: 'user-a', organizationId: 'org-a', workspaceId: 'workspace-a' };
const workspaceB = { actorId: 'user-a', organizationId: 'org-a', workspaceId: 'workspace-b' };
const otherTenant = { actorId: 'user-a', organizationId: 'org-b', workspaceId: 'workspace-c' };

const requestA = gate.start(workspaceA);
const requestB = gate.start(workspaceB);
assert.equal(gate.accepts(requestA, workspaceA), false, 'late workspace A response must be rejected');
assert.equal(gate.accepts(requestB, workspaceB), true, 'current workspace B response must be accepted');
assert.equal(gate.accepts(requestB, workspaceA), false, 'workspace B response cannot populate workspace A');
assert.equal(gate.accepts(requestB, otherTenant), false, 'response cannot cross organization scope');

const requestOtherTenant = gate.start(otherTenant);
assert.equal(gate.accepts(requestB, workspaceB), false, 'older workspace response must remain stale');
assert.equal(gate.accepts(requestOtherTenant, otherTenant), true);
gate.invalidate();
assert.equal(gate.accepts(requestOtherTenant, otherTenant), false, 'context removal invalidates in-flight work');
assert.equal(gate.activeContext(), null);

assert.equal(clientRequestContextIsLoading(null, null, false), false, 'an unavailable context has no request to await');
assert.equal(clientRequestContextIsLoading(workspaceA, null, false), true, 'a newly authorized context is loading before its passive fetch starts');
assert.equal(clientRequestContextIsLoading(workspaceA, clientRequestContextKey(workspaceA), false), false, 'the exact settled context is ready');
assert.equal(clientRequestContextIsLoading(workspaceA, clientRequestContextKey(workspaceA), true), true, 'an explicit refresh remains loading');
assert.equal(clientRequestContextIsLoading(workspaceB, clientRequestContextKey(workspaceA), false), true, 'a context switch is loading before its replacement fetch starts');

console.log('context request gate: rapid-switch, readiness, late-response, and cross-tenant assertions passed');
