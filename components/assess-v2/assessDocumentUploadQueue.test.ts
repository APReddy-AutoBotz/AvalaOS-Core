import assert from 'node:assert/strict';
import test from 'node:test';
import { assessDocumentQueueError } from './assessDocumentUploadQueue.ts';

test('pending document queue accepts exact bounds without changing input', () => {
  const files = Array.from({length:20}, () => ({size:600_000}));
  assert.equal(assessDocumentQueueError([], files), null);
  assert.equal(files.length, 20);
});
test('all pending and selected files count before any byte read', () => {
  assert.match(assessDocumentQueueError([{size:1}], Array.from({length:20}, () => ({size:1})))!, /at most 20/);
  assert.match(assessDocumentQueueError([{size:6_000_000}], [{size:6_000_001}])!, /12,000,000/);
});
test('invalid sizes fail closed, including empty and non-finite inputs', () => {
  for (const size of [0, -1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) assert.match(assessDocumentQueueError([], [{size}])!, /invalid size/);
});
