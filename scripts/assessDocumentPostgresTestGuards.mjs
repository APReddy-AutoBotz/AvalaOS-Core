import assert from 'node:assert/strict';

export const expectDatabaseError = (operation, pattern) => assert.rejects(operation, pattern);
