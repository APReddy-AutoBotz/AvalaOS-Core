import assert from 'node:assert/strict';

import {
  AUDIT_EVENT_CATEGORIES,
  AUDIT_PROHIBITED_FIELDS,
  AUDIT_REQUIRED_FIELDS,
  BLOCKED_READINESS_CLAIMS,
  buildEvidenceControlSnapshot,
} from './evidenceControlModel';
import {
  getAdminEvidenceControlSummary,
  getAuditContractRows,
  getBlockedReadinessClaimSummary,
  getEvidenceControlSurfaceRows,
  getApprovalStateLabel,
  summarizeApprovalStates,
} from './evidenceControlPresentation';

console.log('Running M5.5b evidence control presentation tests...');

const snapshot = buildEvidenceControlSnapshot();

assert.equal(getApprovalStateLabel('planned'), 'Planned');
assert.equal(getApprovalStateLabel('required'), 'Required');
assert.equal(getApprovalStateLabel('blocked'), 'Blocked');
assert.equal(getApprovalStateLabel('deferred'), 'Deferred');
assert.equal(getApprovalStateLabel('approved'), 'Approved');
assert.equal(getApprovalStateLabel('rejected'), 'Rejected');
assert.equal(getApprovalStateLabel('executed'), 'Executed');
assert.equal(getApprovalStateLabel('evidence_required'), 'Evidence Required');

const approvalSummary = summarizeApprovalStates(snapshot);
assert.deepEqual(approvalSummary.map(summary => summary.state), [
  'planned',
  'required',
  'blocked',
  'deferred',
  'approved',
  'rejected',
  'executed',
  'evidence_required',
]);
assert.equal(approvalSummary.find(summary => summary.state === 'approved')?.count, 0);
assert.equal(approvalSummary.find(summary => summary.state === 'executed')?.count, 0);
assert.equal(approvalSummary.reduce((total, summary) => total + summary.count, 0), snapshot.surfaces.length);

const surfaceRows = getEvidenceControlSurfaceRows(snapshot);
assert.equal(surfaceRows.length, snapshot.surfaces.length);
assert.ok(surfaceRows.every(row => row.verifiedControlFactCount > 0));
assert.ok(surfaceRows.every(row => row.blockedReadinessClaimCount >= BLOCKED_READINESS_CLAIMS.length));
assert.ok(surfaceRows.every(row => row.requiredEvidenceCount > 0));
assert.ok(surfaceRows.every(row => row.readOnlySummary.includes('Read-only summary')));
assert.ok(surfaceRows.every(row => row.readOnlySummary.includes('no approval, execution, screenshot, export, PDF, download, signoff, completion, or status-change action is exposed')));
assert.ok(surfaceRows.every(row => row.prohibitedActionSummary.includes('execution actions remain prohibited')));
assert.ok(surfaceRows.some(row => row.id === 'buyer_acceptance_browser_walkthrough' && row.approvalState === 'blocked'));
assert.ok(surfaceRows.some(row => row.id === 'buyer_acceptance_manual_execution_approval' && row.approvalState === 'required'));
assert.ok(surfaceRows.some(row => row.id === 'buyer_acceptance_pack' && row.approvalState === 'evidence_required'));

const surfaceCopy = surfaceRows
  .flatMap(row => [
    row.label,
    row.approvalStateLabel,
    row.proofBoundarySummary,
    row.readOnlySummary,
    row.prohibitedActionSummary,
  ])
  .join('\n');
assert.doesNotMatch(surfaceCopy, /Avala Govern Lite|Avala Delivery Lite/);
assert.doesNotMatch(surfaceCopy, /\bproduction ready\b|\bhosted ready\b|\bdeployment ready\b|\bsecurity ready\b|\bbuyer ready\b|\bproduct ready\b/i);
assert.doesNotMatch(surfaceCopy, /\bbrowser walkthrough complete\b|\bscreenshot proof captured\b|\bexport ready\b|\bPDF ready\b|\bdownload ready\b|\bapproval workflow ready\b/i);

const auditRows = getAuditContractRows(snapshot);
assert.equal(auditRows.length, AUDIT_EVENT_CATEGORIES.length);
assert.ok(auditRows.every(row => row.requiredFieldCount === AUDIT_REQUIRED_FIELDS.length));
assert.ok(auditRows.every(row => row.prohibitedFieldCount === AUDIT_PROHIBITED_FIELDS.length));
assert.ok(auditRows.every(row => row.redactionRuleCount >= 3));
assert.ok(auditRows.every(row => /AP-approved execution gate/i.test(row.blockedUntil)));

const blockedClaimSummary = getBlockedReadinessClaimSummary(snapshot);
assert.deepEqual(blockedClaimSummary, [...blockedClaimSummary].sort((left, right) => left.localeCompare(right)));
for (const claim of BLOCKED_READINESS_CLAIMS) {
  assert.ok(blockedClaimSummary.includes(claim), `Blocked claim summary should include ${claim}.`);
}

const adminSummary = getAdminEvidenceControlSummary(snapshot);
assert.equal(adminSummary.headline, 'Execution-neutral control contracts');
assert.match(adminSummary.summary, /review only/i);
assert.match(adminSummary.summary, /AP approval remains ungranted/i);
assert.equal(adminSummary.surfaceCount, snapshot.surfaces.length);
assert.equal(adminSummary.blockedClaimCount, blockedClaimSummary.length);
assert.equal(adminSummary.executionApprovalGranted, false);
assert.deepEqual(adminSummary.approvalStateSummary, approvalSummary);
assert.match(adminSummary.readOnlyNotice, /Read-only summary only/i);
assert.match(adminSummary.readOnlyNotice, /no approval, execution, screenshot, export, PDF, download, signoff, completion, status change, or readiness evidence action is exposed/i);

console.log('M5.5b evidence control presentation tests passed.');
