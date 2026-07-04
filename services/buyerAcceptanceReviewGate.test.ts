import assert from 'node:assert/strict';

import {
  buildBuyerAcceptancePackSnapshot,
} from './buyerAcceptancePackModel';
import {
  buildBuyerAcceptanceReviewGateSnapshot,
  type BuyerAcceptanceReviewerRole,
} from './buyerAcceptanceReviewGate';

console.log('Running Buyer Acceptance Pack review gate tests...');

const pack = buildBuyerAcceptancePackSnapshot();
const gate = buildBuyerAcceptanceReviewGateSnapshot(pack);

assert.deepEqual(gate, buildBuyerAcceptanceReviewGateSnapshot(buildBuyerAcceptancePackSnapshot()));
assert.notEqual(gate.gateStatus, 'review_ready');
assert.equal(gate.gateStatus, 'evidence_required');
assert.equal(gate.sourcePackStatus, 'evidence_required');

assert.ok(gate.exportBlockers.length > 0);
assert.ok(gate.exportBlockers.includes('No export/PDF/download scope approved.'));
assert.ok(gate.exportBlockers.some(blocker => blocker.includes('Open proof gaps remain')));
assert.ok(gate.readinessBlockers.length > 0);
for (const blocker of [
  'production readiness',
  'hosted readiness',
  'deployment readiness',
  'RLS readiness',
  'tenant-isolation proof',
  'security readiness',
  'buyer readiness',
  'product readiness',
  'release-candidate readiness',
  'compliance certification',
]) {
  assert.ok(gate.readinessBlockers.includes(blocker), `Missing readiness blocker: ${blocker}`);
}

const roles = new Set<BuyerAcceptanceReviewerRole>(gate.reviewerQuestions.map(question => question.role));
for (const role of [
  'buyer_executive',
  'security_reviewer',
  'delivery_owner',
  'ap_approver',
  'product_owner',
] as const) {
  assert.ok(roles.has(role), `Missing reviewer role: ${role}`);
}

const questionText = new Set(gate.reviewerQuestions.map(question => question.question));
for (const question of [
  'What can AvalaOS safely claim today?',
  'What does the Trust Center evidence prove?',
  'What does the evidence not prove?',
  'Is Avala Govern a runtime execution layer?',
  'Is Avala Delivery a Jira replacement?',
  'Are generated documents final approved outputs?',
  'Is RLS verified?',
  'Is tenant isolation verified?',
  'Is security readiness proven?',
  'Is production readiness proven?',
  'Is compliance certification claimed?',
  'Is the Buyer Acceptance Pack approved/export-ready?',
]) {
  assert.ok(questionText.has(question), `Missing review question: ${question}`);
}

for (const question of gate.reviewerQuestions) {
  assert.ok(question.expectedSafeAnswer.length > 0, `${question.id} should have a safe answer.`);
  assert.ok(
    question.expectedEvidenceReference.length > 0 || /evidence[- ]required/i.test(question.expectedSafeAnswer),
    `${question.id} should have an evidence reference or evidence-required safe answer.`,
  );
  assert.equal(question.requiredBeforeExport, true, `${question.id} should be required before export.`);
}

const runtimeQuestion = gate.reviewerQuestions.find(question => question.id === 'govern-runtime-boundary');
assert.ok(runtimeQuestion);
for (const boundary of ['bots', 'agents', 'RPA jobs', 'external-system actions', 'MCP controls', 'A2A controls', 'live runtime enforcement']) {
  assert.ok(runtimeQuestion.expectedSafeAnswer.includes(boundary), `Runtime boundary should mention ${boundary}.`);
}

const jiraQuestion = gate.reviewerQuestions.find(question => question.id === 'delivery-jira-boundary');
assert.ok(jiraQuestion);
assert.ok(/not positioned as a full issue-tracking replacement/i.test(jiraQuestion.expectedSafeAnswer));

const generatedDocumentsQuestion = gate.reviewerQuestions.find(question => question.id === 'generated-documents-boundary');
assert.ok(generatedDocumentsQuestion);
assert.ok(/editable review drafts/i.test(generatedDocumentsQuestion.expectedSafeAnswer));
assert.ok(/human sign-off/i.test(generatedDocumentsQuestion.expectedSafeAnswer));

const proofBoundaryQuestions = gate.reviewerQuestions.filter(question => [
  'rls-proof-boundary',
  'tenant-isolation-proof-boundary',
  'security-proof-boundary',
  'production-proof-boundary',
  'compliance-certification-boundary',
].includes(question.id));
assert.equal(proofBoundaryQuestions.length, 5);

for (const question of proofBoundaryQuestions) {
  assert.doesNotMatch(question.expectedSafeAnswer, /production ready/i);
  assert.doesNotMatch(question.expectedSafeAnswer, /hosted ready/i);
  assert.doesNotMatch(question.expectedSafeAnswer, /deployment ready/i);
  assert.doesNotMatch(question.expectedSafeAnswer, /RLS ready/i);
  assert.doesNotMatch(question.expectedSafeAnswer, /RLS active/i);
  assert.doesNotMatch(question.expectedSafeAnswer, /RLS verified/i);
  assert.doesNotMatch(question.expectedSafeAnswer, /tenant isolation verified/i);
  assert.doesNotMatch(question.expectedSafeAnswer, /security ready/i);
  assert.doesNotMatch(question.expectedSafeAnswer, /buyer ready/i);
  assert.doesNotMatch(question.expectedSafeAnswer, /product ready/i);
  assert.doesNotMatch(question.expectedSafeAnswer, /release-candidate ready/i);
  assert.doesNotMatch(question.expectedSafeAnswer, /compliance certified/i);
}

const prohibitedClaims = new Set(gate.prohibitedClaims.map(nonClaim => nonClaim.prohibitedClaim));
for (const nonClaim of pack.nonClaims) {
  assert.ok(prohibitedClaims.has(nonClaim.prohibitedClaim), `Missing prohibited claim: ${nonClaim.id}`);
}

for (const findingId of [
  'export-pdf-download-not-approved',
  'pack-not-approved-for-review',
  'rls-readiness-evidence-missing',
  'tenant-isolation-proof-missing',
  'security-readiness-evidence-missing',
  'production-hosted-deployment-readiness-missing',
  'compliance-certification-not-available',
  'buyer-signoff-not-complete',
]) {
  assert.ok(gate.findings.some(finding => finding.id === findingId), `Missing finding: ${findingId}`);
}

const buyerSignoffChecklist = gate.checklist.find(item => item.id === 'complete-buyer-review-checklist');
assert.ok(buyerSignoffChecklist);
assert.equal(buyerSignoffChecklist.requiredBeforeBuyerReview, true);
assert.ok(buyerSignoffChecklist.status === 'blocked' || buyerSignoffChecklist.status === 'evidence_required');

const apApprovalChecklist = gate.checklist.find(item => item.id === 'complete-ap-approval-checklist');
assert.ok(apApprovalChecklist);
assert.equal(apApprovalChecklist.requiredBeforeExport, true);
assert.equal(apApprovalChecklist.status, 'evidence_required');

const exportScopeChecklist = gate.checklist.find(item => item.id === 'approve-export-scope');
assert.ok(exportScopeChecklist);
assert.equal(exportScopeChecklist.status, 'blocked');

const serializedGate = JSON.stringify(gate);
assert.doesNotMatch(serializedGate, /Avala Govern Lite/);
assert.doesNotMatch(serializedGate, /Avala Delivery Lite/);

const summaryAndSafeAnswers = [
  gate.summary,
  ...gate.reviewerQuestions.map(question => question.expectedSafeAnswer),
].join('\n');

for (const pattern of [
  /production ready/i,
  /hosted ready/i,
  /deployment ready/i,
  /RLS ready/i,
  /RLS active/i,
  /RLS verified/i,
  /tenant isolation verified/i,
  /security ready/i,
  /buyer ready/i,
  /product ready/i,
  /release-candidate ready/i,
  /compliance certified/i,
]) {
  assert.doesNotMatch(summaryAndSafeAnswers, pattern);
}

const packBefore = JSON.parse(JSON.stringify(pack));
buildBuyerAcceptanceReviewGateSnapshot(pack);
assert.deepEqual(pack, packBefore);

console.log('Buyer Acceptance Pack review gate tests passed.');
