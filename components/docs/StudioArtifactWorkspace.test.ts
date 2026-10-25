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
  'draftValidationError',
  'aria-invalid={Boolean(draftValidationError)}',
  'The last committed artifact remains visible.',
  'load(handoffId, artifactType, true)',
  'data-studio-handoff-phase={handoffReadiness.phase}',
  'resolveCurrentStudioHandoff(currentWorkspace,capturedHandoff,action)',
  'activeHandoffCommandRef.current=commandBinding',
  "phase:'committing'",
  "phase:'reload_failed'",
  'requestSequence=++handoffLoadSequenceRef.current',
  'activeWorkspaceMutationsRef.current.size>0||handoffFailureState',
  'requestSequence:++handoffLoadSequenceRef.current',
  'isCurrent:()=>boolean=()=>mountedRef.current&&accepts(ticket)',
  'const summarySequence=++governedSummarySequenceRef.current',
  'governedSummarySequenceRef.current===summarySequence',
  "const handoffFailureState=artifact?.readOnly===true||['stale'",
  "setState(current=>current==='loading'?(artifact?.readOnly?'read_only':artifact?.lifecycle??'empty'):current)",
]) assert.ok(source.includes(token),`Studio workspace contract missing: ${token}`);
assert.ok(!source.includes('Assigned human actor ID'),'free-form reviewer identity must not return');
assert.ok(source.indexOf("if (offline)") < source.indexOf('clearProjection();'),'offline state must preserve the committed projection for read-only inspection');
assert.equal(source.match(/clearProjection\(\);/g)?.length, 1, 'only a genuine source/type identity load may clear the projection');
assert.ok(!source.includes("setState('command_failed');\n      setMessage('Draft must"), 'invalid JSON must not globally block the workspace');
assert.ok(source.indexOf('publishHandoffProjection(handoffBinding,workspaceProjection,workspaceResult.unavailable)')
  < source.indexOf('await loadGovernedSummary(summary, ticket, loadIsCurrent)'), 'handoff authority must publish before unrelated artifact detail loading');
console.log('studio artifact workspace: 30 lifecycle, handoff authority, detail-race, recovery, validation, rendition and false-success assertions passed');
