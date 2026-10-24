import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('components/assess-v2/AssessV2ReviewWorkspace.tsx', 'utf8');
assert.match(source, /Assigned-review queue/);
assert.match(source, /Assign independent reviewer/);
assert.match(source, /readEligibleAssessV2Reviewers/);
assert.match(source, /Eligible reviewer/);
assert.match(source, /Commit reviewer assignment/);
assert.doesNotMatch(source, /type=["']text["'][^>]*reviewer|reviewer[^\n]*type=["']text["']/i,'reviewer identity must not be free text');
assert.match(source, /Exact claims:/);
assert.match(source, /Accept evidence/);
assert.match(source, /Request more information/);
assert.match(source, /Reject evidence/);
assert.match(source, /Approve reviewed decision/);
assert.match(source, /Request changes/);
assert.match(source, /capabilities\.includes\(ASSESS_V2_CAPABILITIES\.draftWrite\)/, 'the author must be able to read a requested revision');
assert.match(source, /disabled=\{busy \|\| !can\(ASSESS_V2_CAPABILITIES\.draftWrite\)\}/, 'only a draft writer may start a requested revision');
assert.match(source, /Avala Govern action and control review/);
assert.match(source, /controlStatuses\[control\.controlId\] \?\? control\.status/,'reviewer disposition edits override the loaded projection');
assert.match(source, /Create durable Studio handoff/);
for (const state of ['Offline', 'stale', 'revoked', 'conflicted', 'Read-only mode', 'Persistence failed']) assert.match(source, new RegExp(state, 'i'));
assert.ok(source.indexOf('const committed = await action()') < source.indexOf('setMessage(success)'), 'success must render only after a committed response');
assert.doesNotMatch(source, /reviewerId\s*:/);
assert.match(source, /Browser-supplied handoff content is never accepted/);
assert.match(source, /aria-live="polite"/);
assert.match(source, /aria-label="Assigned-review queue"/);
assert.match(source, /sm:grid-cols-2/);
assert.ok(source.indexOf('setReview(current)') < source.indexOf('await readEligibleAssessV2Reviewers'),
  'validated committed review must publish before eligible-reviewer discovery settles');
for (const scopePart of ['userId', 'organizationId', 'workspaceId', 'authorizationVersion']) {
  assert.match(source, new RegExp(`tenantContext[.]${scopePart}`), `request scope must bind ${scopePart}`);
}
for (const epochPart of ['sequence', 'scopeKey', 'caseId', 'decisionId']) {
  assert.match(source, new RegExp(epochPart), `request epoch must bind ${epochPart}`);
}
assert.match(source, /if \(!isActiveLoad\(request\)\) return;/, 'stale load completions must not publish');
assert.match(source, /if \(!isActiveAction\(request\)\) return;/, 'stale command completions must not publish');
assert.match(source, /mountedRef[.]current = false/, 'unmount must invalidate pending completions');
assert.match(source, /candidateBindingRef[.]current = null; setEligibleReviewers\(\[\]\); setSelectedReviewerId\(''\)/,
  'candidate failure must clear candidate identity labels');
assert.match(source, /candidateState !== 'ready'/, 'assignment must remain fail closed until candidate discovery succeeds');
assert.match(source, /reviewScopeKey === viewKey/, 'review labels must remain current actor, tenant and initial-case view only');
assert.match(source, /!isActiveLoad\(request\) \|\| !sameProjection\(reviewBindingRef[.]current, projectionBinding\)/,
  'candidate completions must not publish over a newer committed projection');
console.log('Assess V2 enterprise review workspace source suite passed.');
