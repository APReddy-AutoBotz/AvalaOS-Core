import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
const source=readFileSync('components/docs/StudioArtifactWorkspace.tsx','utf8');
const governedRoute=readFileSync('components/docs/GovernedStudioRoute.tsx','utf8');
const docsView=readFileSync('components/docs/DocsView.tsx','utf8');
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
  'studioHandoffLoadMayBegin(activeHandoffCommandRef.current,authorityIdentity)',
  'viewEpoch:requestSequence',
  'key={`${handoffReadiness.identity}:${handoffReadiness.viewEpoch}`}',
  'if(activeHandoffCommandRef.current||activeWorkspaceMutationsRef.current.size>0)return;',
  'disabled={workspaceMutationPending}',
  'if(handoffReadinessRef.current.identity!==authorityIdentity)',
  "setState('authorization_revoked')",
  'Studio authority changed while a handoff command is still settling.',
  "| 'artifact_unavailable'",
  "['loading', 'generating', 'artifact_unavailable'",
  "error.code === 'COMMAND_UNAVAILABLE'",
  'clearArtifactProjection();',
  "setState('artifact_unavailable')",
  'Available handoff actions can still be completed.',
  'data-studio-artifact-state={state}',
  "data-studio-artifact-mutations={blocked?'blocked':'available'}",
]) assert.ok(source.includes(token),`Studio workspace contract missing: ${token}`);
assert.ok(!source.includes('Assigned human actor ID'),'free-form reviewer identity must not return');
const offlineBranch=source.indexOf("if (offline)"), ordinaryClearBranch=source.indexOf('if (!preserveProjection)');
assert.ok(offlineBranch < ordinaryClearBranch&&ordinaryClearBranch < source.indexOf('clearProjection();',ordinaryClearBranch),'offline state must preserve the committed projection for read-only inspection');
assert.equal(source.match(/clearProjection\(\);/g)?.length, 2, 'only a genuine source/type identity load or rejected cross-authority load may clear the projection');
assert.ok(!source.includes("setState('command_failed');\n      setMessage('Draft must"), 'invalid JSON must not globally block the workspace');
assert.ok(source.indexOf('publishHandoffProjection(handoffBinding,workspaceProjection,workspaceResult.unavailable)')
  < source.indexOf('await loadGovernedSummary(summary, ticket, loadIsCurrent)'), 'handoff authority must publish before unrelated artifact detail loading');
const legacyRead=source.indexOf('value = await readStudioArtifact(context, id, type, transport)');
const unavailableBranch=source.indexOf("error.code === 'COMMAND_UNAVAILABLE'",legacyRead);
const eligibleRead=source.indexOf('const eligible = await readStudioEligibleReviewers(context, value.id, value.currentVersion.id, transport)',legacyRead);
assert.ok(legacyRead>0&&unavailableBranch>legacyRead&&eligibleRead>unavailableBranch,'COMMAND_UNAVAILABLE isolation must wrap only the optional legacy detail read, not later authority reads');
assert.equal(source.match(/error\.code === 'COMMAND_UNAVAILABLE'/g)?.length,1,'only the optional legacy detail read may receive artifact-only COMMAND_UNAVAILABLE handling');
const artifactClear=source.slice(source.indexOf('const clearArtifactProjection'),source.indexOf('const loadGovernedSummary'));
for(const token of ["setArtifact(null)","setArtifactWorkspace(null)","selectedArtifactIdRef.current=''","setSelectedArtifactId('')","setGovernedSelection(null)","setReviewers([])","setReviewerId('')"])
  assert.ok(artifactClear.includes(token),`artifact-only failure must clear dependent stale selection: ${token}`);
assert.ok(!source.slice(source.indexOf('const handoffFailureState='),source.indexOf('const handoffDisabled=')).includes('artifact_unavailable'),'artifact-only unavailability must not revoke an independently current handoff projection');
assert.ok(governedRoute.includes('key={`${tenantContext.userId}:${tenantContext.organizationId}:${tenantContext.workspaceId}:${tenantContext.authorizationVersion}:${sessionState}`}'), 'governed route must remount Studio generic projections across authority scope');
assert.ok(docsView.includes('key={`${studioPresentationContext.organizationId}:${studioPresentationContext.workspaceId}:${studioPresentationContext.userId}:${studioPresentationContext.authorizationVersion}:'), 'Docs view must remount Studio generic projections across authority scope');
console.log('studio artifact workspace: scoped lifecycle, handoff authority, legacy-read isolation, artifact mutation blocking, stale-selection clearing, view-epoch, load-barrier, detail-race, recovery, validation, rendition and false-success assertions passed');
