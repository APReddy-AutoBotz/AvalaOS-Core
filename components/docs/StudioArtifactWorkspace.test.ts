import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
const source=readFileSync('components/docs/StudioArtifactWorkspace.tsx','utf8');
for(const token of [
  "parentVersionId:artifact!.currentVersion.id",
  "outcome:'approve'",
  "outcome:'changes_requested'",
  "outcome:'reject'",
  'rationale,conditions',
  'readStudioEligibleReviewers',
  'StudioArtifactRenditions',
  'currentApprovedVersion',
  "state==='committed_reload_failed'",
]) assert.ok(source.includes(token),`Studio workspace contract missing: ${token}`);
assert.ok(!source.includes('Assigned human actor ID'),'free-form reviewer identity must not return');
console.log('studio artifact workspace: 10 lifecycle, payload, reviewer, rendition and false-success assertions passed');
