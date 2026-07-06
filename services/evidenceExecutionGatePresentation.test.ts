import assert from 'node:assert/strict';

import {
  EVIDENCE_EXECUTION_TRACK_IDS,
  buildEvidenceExecutionGateSnapshot,
} from './evidenceExecutionGateModel';
import {
  getEvidenceExecutionCandidateTrackRows,
  getEvidenceExecutionGateReadOnlySummary,
  getEvidenceExecutionProofStatusLabel,
  summarizeEvidenceExecutionProofStatuses,
} from './evidenceExecutionGatePresentation';

console.log('Running M5.7 evidence execution gate presentation tests...');

const snapshot = buildEvidenceExecutionGateSnapshot();

assert.equal(getEvidenceExecutionProofStatusLabel('candidate_only'), 'Candidate Only');
assert.equal(getEvidenceExecutionProofStatusLabel('approval_required'), 'Approval Required');
assert.equal(getEvidenceExecutionProofStatusLabel('blocked'), 'Blocked');
assert.equal(getEvidenceExecutionProofStatusLabel('deferred'), 'Deferred');

const proofSummary = summarizeEvidenceExecutionProofStatuses(snapshot);
assert.deepEqual(proofSummary.map(summary => summary.status), [
  'candidate_only',
  'approval_required',
  'blocked',
  'deferred',
]);
assert.equal(proofSummary.find(summary => summary.status === 'candidate_only')?.count, 1);
assert.equal(proofSummary.find(summary => summary.status === 'approval_required')?.count, 5);
assert.equal(proofSummary.find(summary => summary.status === 'blocked')?.count, 0);
assert.equal(proofSummary.find(summary => summary.status === 'deferred')?.count, 0);
assert.equal(
  proofSummary.reduce((total, summary) => total + summary.count, 0),
  snapshot.candidateTracks.length,
);

const rows = getEvidenceExecutionCandidateTrackRows(snapshot);
assert.equal(rows.length, EVIDENCE_EXECUTION_TRACK_IDS.length);
assert.deepEqual(rows.map(row => row.id), EVIDENCE_EXECUTION_TRACK_IDS);
assert.equal(rows.filter(row => row.recommendedFirstCandidate).length, 1);
assert.equal(rows.find(row => row.recommendedFirstCandidate)?.id, 'manual_browser_walkthrough');
assert.ok(rows.every(row => row.apApprovalRequiredBeforeExecution === true));
assert.ok(rows.every(row => row.prerequisiteProofNeedCount > 0));
assert.ok(rows.every(row => row.prohibitedOutputFieldCount > 0));
assert.ok(rows.every(row => row.prohibitedActionCount > 0));
assert.ok(rows.every(row => row.readOnlySummary.includes('Read-only M5.7 candidate summary')));
assert.ok(rows.every(row => row.readOnlySummary.includes('no AP approval, execution approval, browser launch')));
assert.ok(rows.every(row => row.readOnlySummary.includes('readiness evidence, or post-M5.7 execution milestone action is exposed')));

const summary = getEvidenceExecutionGateReadOnlySummary(snapshot);
assert.equal(summary.headline, 'M5.7 first evidence execution gate selection');
assert.match(summary.summary, /recommends Manual Browser Walkthrough as the first candidate for AP review only/i);
assert.match(summary.summary, /AP approval remains ungranted/i);
assert.match(summary.summary, /no execution is represented/i);
assert.equal(summary.candidateTrackCount, EVIDENCE_EXECUTION_TRACK_IDS.length);
assert.equal(summary.recommendedFirstCandidateTrackId, 'manual_browser_walkthrough');
assert.equal(summary.recommendedFirstCandidateLabel, 'Manual Browser Walkthrough Evidence Gate');
assert.equal(summary.apDecisionState, 'pending');
assert.equal(summary.apApprovalGranted, false);
assert.equal(summary.executionApproved, false);
assert.equal(summary.executionPerformed, false);
assert.equal(summary.browserExecutionPerformed, false);
assert.equal(summary.screenshotEvidenceProduced, false);
assert.equal(summary.exportPdfDownloadArtifactProduced, false);
assert.equal(summary.storageObjectCreated, false);
assert.equal(summary.signedUrlGenerated, false);
assert.equal(summary.approvalWorkflowExecuted, false);
assert.equal(summary.statusChangedByWorkflow, false);
assert.equal(summary.dbRlsArtifactExecutionPerformed, false);
assert.equal(summary.schemaInspectionPerformed, false);
assert.equal(summary.hostedDeploymentExecutionPerformed, false);
assert.equal(summary.providerClassifierExecutionPerformed, false);
assert.equal(summary.realAssertionExecutionPerformed, false);
assert.equal(summary.readinessEvidenceProduced, false);
assert.equal(summary.postM57ExecutionMilestoneStarted, false);
assert.deepEqual(summary.proofStatusSummary, proofSummary);
assert.equal(summary.blockedClaimCount, snapshot.blockedReadinessClaims.length);
assert.match(summary.readOnlyNotice, /Read-only M5\.7 summary only/i);
assert.match(summary.readOnlyNotice, /no AP approval, execution approval, browser launch, browser automation, screenshot capture/i);
assert.match(summary.readOnlyNotice, /DB\/RLS\/artifact execution, schema inspection, hosted\/deployment validation/i);
assert.match(summary.readOnlyNotice, /readiness evidence, or post-M5\.7 execution milestone action is exposed/i);

const presentationCopy = [
  ...rows.flatMap(row => [row.label, row.proofStatusLabel, row.riskLevel, row.buyerValue, row.readOnlySummary]),
  summary.headline,
  summary.summary,
  summary.readOnlyNotice,
].join('\n');

assert.doesNotMatch(presentationCopy, /Avala Govern Lite|Avala Delivery Lite/);
assert.doesNotMatch(presentationCopy, /\bAP\s+approval\s+(granted|recorded|approved|complete|completed)\b/i);
assert.doesNotMatch(presentationCopy, /\bbrowser\s+walkthrough\s+(executed|verified|passed|complete|completed)\b/i);
assert.doesNotMatch(presentationCopy, /\bscreenshot\s+(proof|evidence)?\s*(produced|captured|available|ready)\b/i);
assert.doesNotMatch(presentationCopy, /\bhosted\s+ready\b|\bdeployment\s+ready\b|\bproduction\s+ready\b|\bsecurity\s+ready\b|\boperational\s+ready\b|\bpilot\s+ready\b/i);
assert.doesNotMatch(presentationCopy, /\bRLS\s+(ready|verified|passed|active)\b|\btenant[- ]isolation\s+(ready|verified|proven|passed)\b|\bartifact\s+SELECT\s+(ready|verified|proven|passed)\b/i);
assert.doesNotMatch(presentationCopy, /\bcompliance\s+certified\b|\breadiness\s+evidence\s+(produced|created|available|accepted)\b/i);

console.log('M5.7 evidence execution gate presentation tests passed.');
