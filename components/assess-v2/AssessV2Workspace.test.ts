import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('components/assess-v2/AssessV2Workspace.tsx', 'utf8');
const processDetailSource = readFileSync('components/assess/ProcessDetailStubView.tsx', 'utf8');
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
assert.match(source, /assessV2OperationalMessage \|\| 'Assessment changes are blocked/);

assert.match(source, /data-testid="assess-current-start"/);
assert.match(source, />Start assessment<\/button>/);
assert.match(source, /data-testid="assess-current-status"/);
assert.match(source, /data-testid="assess-history-audit"/);
assert.match(source, /History and audit details/);
assert.match(source, /data-testid="assess-immutable-references"/);
assert.match(source, /Current engine: Assess V2/);
assert.match(source, /Earlier scoring records and internal engine details remain available in History and audit details/);
assert.match(source, /data-testid="assess-history-import"/);
assert.match(source, />Import earlier approved facts into a working draft<\/button>/);
assert.doesNotMatch(source, />New assessment \(V2\)<\/button>/);
assert.doesNotMatch(source, />Start from approved V1 assessment<\/button>/);
assert.doesNotMatch(source, /independent evidence and governance review not yet completed/);
assert.doesNotMatch(source, /Independent review: pending/);
assert.doesNotMatch(source, /not available in this foundation boundary/);
assert.match(source, /Review and approval status is recorded in Governed review below/);
assert.match(source, /Review status: see Governed review/);
assert.match(source, /Finalizing this decision version does not itself approve it or create a downstream artifact/);
assert.match(processDetailSource, /tenantContext && \['ready', 'read_only'\]\.includes\(sessionState\) && tenantContext\.capabilities\.includes\(ASSESS_V2_CAPABILITIES\.read\)/);
assert.match(processDetailSource, /hasCurrentAssessmentAccess \? 'Open current assessment'/);
assert.match(processDetailSource, /: onStartAssessment\(process\.id\)/);
assert.match(processDetailSource, /\{hasCurrentAssessmentAccess && <AssessV2Workspace/);
assert.match(processDetailSource, /Current assessment &middot; \{presentedCurrentAssessment\.statusLabel\}/);
assert.match(processDetailSource, /data-testid="assessment-compatibility-history"/);
assert.match(processDetailSource, /data-testid="earlier-assessment-summary"/);
assert.match(processDetailSource, /data-testid="open-assessment-history"/);
assert.match(processDetailSource, /assessment \? 'Open earlier assessment record' : 'Create compatibility assessment record'/);
assert.match(processDetailSource, /onPresentationChange=\{handleCurrentAssessmentPresentation\}/);
assert.match(processDetailSource, /presentation\.scopeKey !== currentAssessmentScopeRef\.current/);
assert.match(processDetailSource, /presentedCurrentAssessment\.studioAction/);
assert.match(processDetailSource, /presentedCurrentAssessment\.operatingModel/);
assert.match(processDetailSource, /presentedCurrentAssessment\.readiness/);
assert.match(processDetailSource, /!hasCurrentAssessmentAccess && scores \?/);
assert.match(processDetailSource, /!hasCurrentAssessmentAccess && governCard/);
assert.match(processDetailSource, /presentedCurrentAssessment\.state !== 'reviewer-ready'/);
assert.match(processDetailSource, /data-testid="current-assessment-summary-state"/);

assert.match(source, /createCurrentAssessmentScopeKey\(tenantContext, processId\)/);
assert.match(source, /buildCurrentAssessmentPresentation/);
assert.match(source, /onPresentationChange\?\.\(currentPresentation\)/);
assert.match(source, /onPresentationChange=\{handleReviewPresentationChange\}/);
assert.match(source, /const projectionIsCurrent = canRead && assessmentScopeKey === presentationScopeKey/);
assert.match(source, /setAssessmentScopeKey\(presentationScopeKey\)/);
assert.match(source, /const presentationState: CurrentAssessmentState = !projectionIsCurrent/);

assert.match(source, /const V1_CLONE_ELIGIBLE_STATUSES = new Set<Assessment\['status'\]>\(\['Approved', 'Handed Off to Docs'\]\)/);
assert.match(source, /\(assessment\.scores\?\.scoreVersion \?\? assessment\.scoreVersion\) === ASSESS_V1_SCORE_VERSION/);
assert.match(source, /!draft && !result && v1CloneEligible && <button data-testid="assess-history-import"/);
assert.match(source, /disabled=\{busy \|\| !can\(ASSESS_V2_CAPABILITIES\.read\).*ASSESS_V2_CAPABILITIES\.clone/);
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
assert.match(source, /if \(hasUnsavedChanges\) throw new Error\('Save the current authoring changes before finalization\.'\)/);
assert.match(source, /disabled=\{busy \|\| isReadOnly \|\| hasUnsavedChanges \|\| structuralGaps\.length > 0/);
assert.match(source, /Unsaved authoring changes are visible\. Save the working draft before finalizing\./);

assert.match(source, /\.\.\.importedEvidenceClaimIds/);
assert.match(source, /item\.claimIds\.some\(claimId => !claimOptions\.includes\(claimId\)\)/);
assert.match(source, /only registered or imported claims for every evidence item/);
assert.match(source, /Select one or more registered decision claims or claims imported with this assessment/);
assert.match(source, /claimIds: \[\], sourceType: 'document', status: 'suggested', validated: false/);
assert.doesNotMatch(source, /claimIds: \['assessment\.scope'\]/);
assert.doesNotMatch(source, /Evidence \$\{index \+ 1\} claim IDs/);
assert.match(source, /updateEvidenceAttachment\(item\.id, 'primitive', primitiveIndex, event\.target\.checked\)/);
assert.match(source, /updateEvidenceAttachment\(item\.id, 'interaction', interactionIndex, event\.target\.checked\)/);
assert.match(source, /Author submission does not verify or independently approve this evidence\./);
assert.match(source, /validated: false/);

const saveAction = source.match(/const save = \(\) => run\(async \(\) => \{([\s\S]*?)\}\);\r?\n  const reloadCommitted/)?.[1] ?? '';
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

assert.match(source, /<AssessSupportingDocumentIntake/);
assert.match(source, /tenantContext\.authorizationVersion}:\$\{processId}:\$\{draft\.caseId}:\$\{version}/);
assert.match(source, /hasUnsavedChanges=\{hasUnsavedChanges\}/);
assert.match(source, /onCommitted=\{reloadCommitted\}/);
assert.match(source, /<AssessmentRecommendation decision=\{result\.decision\} \/>/);

console.log('Assess V2 unsaved-finalization regression suite passed.');
