import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('components/assess-v2/AssessV2Workspace.tsx', 'utf8');
const providerSource = readFileSync('components/auth/OrganizationProvider.tsx', 'utf8');
const scopedHandler = providerSource.match(/const handleAssessV2Boundary = useCallback\(\(error: unknown\) => \{([\s\S]*?)\r?\n  \}, \[handleEnterpriseBoundary\]\);/)?.[1] ?? '';
assert.ok(scopedHandler, 'Assess V2 must have a scoped enterprise-boundary handler.');
assert.match(scopedHandler, /presentEnterpriseBoundary\(error\.code, 'assess_v2'\)/);
assert.match(scopedHandler, /setAssessV2OperationalState\('read_only'\)/);
assert.doesNotMatch(scopedHandler, /setSessionState\(/, 'a V2-only runtime fallback must not downgrade the tenant session');

assert.match(source, /assessV2OperationalState === 'ready' && capabilities\.includes\(capability\)/);
assert.match(source, /assessV2OperationalState === 'read_only' \|\| result\?\.case\.status === 'reviewer-ready'/);
assert.match(source, /handleAssessV2Boundary\(error\)/);
assert.match(source, /disabled=\{busy \|\| !canRead\} onClick=\{reload\}/);
assert.match(source, /assessV2OperationalMessage \|\| 'Avala Assess V2 changes are blocked/);

assert.match(source, /const V1_CLONE_ELIGIBLE_STATUSES = new Set<Assessment\['status'\]>\(\['Approved', 'Handed Off to Docs'\]\)/);
assert.match(source, /\(assessment\.scores\?\.scoreVersion \?\? assessment\.scoreVersion\) === ASSESS_V1_SCORE_VERSION/);
assert.match(source, /disabled=\{busy \|\| !v1CloneEligible \|\| !can\(ASSESS_V2_CAPABILITIES\.read\)/);
assert.match(source, /data-testid="assess-v2-clone-unavailable"/);

const startAction = source.match(/const start = \(clone: boolean\) => \{([\s\S]*?)\r?\n  \};\r?\n  const save/)?.[1] ?? '';
assert.match(startAction, /if \(clone && !v1CloneEligible\)/);
assert.match(startAction, /setMessage\(V1_CLONE_UNAVAILABLE_MESSAGE\)/);
assert.ok(
  startAction.indexOf('if (clone && !v1CloneEligible)') < startAction.indexOf('return run'),
  'An ineligible V1 clone must stop locally before the command boundary.',
);


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