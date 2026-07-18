import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('components/assess-v2/AssessV2Workspace.tsx', 'utf8');

assert.match(source, /const authorDraftFingerprint = .*JSON\.stringify\(toAuthorDraft\(draft\)\)/);
assert.match(source, /const hasUnsavedChanges = draft !== null && savedDraftFingerprint !== authorDraftFingerprint\(draft\)/);
assert.match(source, /if \(hasUnsavedChanges\) throw new Error\('Save the current V2 authoring changes before finalization\.'\)/);
assert.match(source, /disabled=\{busy \|\| isReadOnly \|\| hasUnsavedChanges \|\| structuralGaps\.length > 0/);
assert.match(source, /Unsaved V2 authoring changes are visible\. Save the draft before finalizing\./);

const saveAction = source.match(/const save = \(\) => run\(async \(\) => \{([\s\S]*?)\}\);\r?\n  const reload/)?.[1] ?? '';
assert.match(saveAction, /await saveAssessV2Draft/);
assert.match(saveAction, /setSavedDraftFingerprint\(authorDraftFingerprint\(authorDraft\)\)/);
assert.ok(
  saveAction.indexOf('await saveAssessV2Draft') < saveAction.indexOf('setSavedDraftFingerprint'),
  'The clean baseline must advance only after durable save succeeds.',
);

const finalizeAction = source.match(/const finalize = \(\) => run\(async \(\) => \{([\s\S]*?)\}\);\r?\n  const renderModel/)?.[1] ?? '';
assert.ok(
  finalizeAction.indexOf('if (hasUnsavedChanges)') < finalizeAction.indexOf('await finalizeAssessV2Case'),
  'Unsaved changes must fail closed before the finalize request.',
);

for (const baseline of ['resumedDraft', 'clonedDraft', 'createdDraft', 'reloadedDraft']) {
  assert.match(source, new RegExp(`setSavedDraftFingerprint\\([^\\n]*${baseline}`));
}

console.log('Assess V2 unsaved-finalization regression suite passed.');