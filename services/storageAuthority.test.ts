import assert from 'node:assert/strict';

import {
  AuthorityLocalStorageKeys,
  AuthoritySessionStorageKeys,
  clearPersistedAuthorityState,
  type RemovableStorage,
} from './storageAuthority';

const localValues = new Map<string,string>(AuthorityLocalStorageKeys.map(key => [key, 'persisted']));
localValues.set('avalaos-core-v1-theme', 'dark');
localValues.set('avalaos-core-v1-tasks', 'synthetic-product-data');
const sessionValues = new Map<string,string>(AuthoritySessionStorageKeys.map(key => [key, 'persisted']));
sessionValues.set('unrelated-session-preference', 'preserve');

const mapStorage = (values: Map<string, string>): RemovableStorage => ({
  removeItem: key => { values.delete(key); },
});

const result = clearPersistedAuthorityState({
  local: mapStorage(localValues),
  session: mapStorage(sessionValues),
});

assert.equal(result.attempted, 5);
assert.deepEqual(result.failed, []);
for (const key of AuthorityLocalStorageKeys) assert.equal(localValues.has(key), false, `${key} must be cleared`);
for (const key of AuthoritySessionStorageKeys) assert.equal(sessionValues.has(key), false, `${key} must be cleared`);
assert.equal(localValues.get('avalaos-core-v1-theme'), 'dark', 'sign-out must preserve non-authority preferences');
assert.equal(localValues.get('avalaos-core-v1-tasks'), 'synthetic-product-data', 'sign-out must preserve product data');
assert.equal(sessionValues.get('unrelated-session-preference'), 'preserve', 'sign-out must preserve unrelated session state');

const attempted: string[] = [];
const unavailableKey = AuthorityLocalStorageKeys[1];
const partiallyUnavailable: RemovableStorage = {
  removeItem: key => {
    attempted.push(key);
    if (key === unavailableKey) throw new Error('storage unavailable');
  },
};
const failureResult = clearPersistedAuthorityState({
  local: partiallyUnavailable,
  session: partiallyUnavailable,
});
assert.deepEqual(attempted, [...AuthorityLocalStorageKeys, ...AuthoritySessionStorageKeys]);
assert.deepEqual(failureResult.failed, [unavailableKey]);

assert.doesNotThrow(() => clearPersistedAuthorityState({ local: undefined, session: undefined }));

console.log('Persisted authority sign-out cleanup regression passed.');
