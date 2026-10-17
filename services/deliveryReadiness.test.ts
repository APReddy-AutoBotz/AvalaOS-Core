import assert from 'node:assert/strict';
import {
  deliveryReadCompletionMatches,
  visibleDeliveryProjectIndexReadiness,
} from './deliveryReadiness';

const authorityA = 'actor-a:org-a:workspace-a:1';
const authorityB = 'actor-b:org-a:workspace-a:2';

assert.deepEqual(visibleDeliveryProjectIndexReadiness({
  server: true,
  currentAuthorityKey: authorityB,
  stateAuthorityKey: authorityA,
  state: 'ready',
  error: 'prior authority error',
}), { state: 'loading', error: null });

assert.deepEqual(visibleDeliveryProjectIndexReadiness({
  server: true,
  currentAuthorityKey: authorityB,
  stateAuthorityKey: authorityB,
  state: 'empty',
  error: null,
}), { state: 'empty', error: null });

assert.equal(deliveryReadCompletionMatches({
  requestSequence: 1,
  requestAuthorityKey: authorityA,
  currentSequence: 2,
  currentAuthorityKey: authorityB,
}), false);
assert.equal(deliveryReadCompletionMatches({
  requestSequence: 2,
  requestAuthorityKey: authorityA,
  currentSequence: 2,
  currentAuthorityKey: authorityB,
}), false);
assert.equal(deliveryReadCompletionMatches({
  requestSequence: 2,
  requestAuthorityKey: authorityB,
  currentSequence: 2,
  currentAuthorityKey: authorityB,
}), true);

console.log('Delivery readiness authority fence regression passed.');
