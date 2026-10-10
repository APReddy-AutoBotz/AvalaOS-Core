import assert from 'node:assert/strict';
import {
  createApprovedWorkItemDraft,
  isApprovedWorkItemComplete,
  normalizeApprovedWorkItemDraft,
  splitApprovedAcceptanceCriteria,
} from './StudioApprovedArtifactPublish';

assert.deepEqual(splitApprovedAcceptanceCriteria(' First criterion \n\nSecond criterion '), ['First criterion', 'Second criterion']);
assert.equal(isApprovedWorkItemComplete({ type: 'Task', title: 'Human-authored work', description: '', acceptanceCriteria: [] }), true);
assert.equal(isApprovedWorkItemComplete({ type: 'Task', title: ' ', description: '', acceptanceCriteria: [] }), false);
assert.equal(isApprovedWorkItemComplete({ type: 'Task', title: 'Human-authored work', description: '', acceptanceCriteria: [''] }), false);
assert.equal(isApprovedWorkItemComplete({ type: 'Task', title: 'x'.repeat(301), description: '', acceptanceCriteria: [] }), false);
const draft = createApprovedWorkItemDraft({ type: 'Task', title: 'Human-authored work', description: '', acceptanceCriteria: ['First'] });
draft.acceptanceCriteriaText = 'First\nSecond\n';
assert.equal(draft.acceptanceCriteriaText, 'First\nSecond\n');
assert.deepEqual(normalizeApprovedWorkItemDraft(draft).acceptanceCriteria, ['First', 'Second']);
console.log('Studio approved-artifact publish UI: bounded human-authored structured work-item validation passed');
