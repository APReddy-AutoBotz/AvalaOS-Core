import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAssessV2ReviewProjectionContract } from './assessV2ReviewClientContract';

const source = readFileSync('services/assessV2ReviewClient.ts', 'utf8');
const contract = readFileSync('services/assessV2ReviewClientContract.ts', 'utf8');
for (const capability of ['assess.v2.review', 'assess.v2.evidence.attest', 'assess.v2.approve', 'assess.v2.govern.resolve', 'assess.v2.studio.handoff']) assert.ok(contract.includes(capability));
for (const command of ['assessment_v2.review.assign', 'assessment_v2.evidence.attest', 'assessment_v2.review.resolve', 'assessment_v2.review.plan', 'assessment_v2.revision.start', 'assessment_v2.govern.resolve', 'assessment_v2.studio.handoff', 'assessment_v2.studio.plan_handoff']) assert.ok(source.includes(command));
assert.match(source, /assess_v2_review_queue/);
assert.match(source, /p_org_id: context\.organizationId, p_workspace_id: context\.workspaceId/);
assert.match(source, /assess_v2_review_workspace/);
assert.match(source, /assess_v2_eligible_reviewers/);
assert.match(source, /expectedVersion: projection\.caseVersion|projection\.caseVersion/);
assert.match(source, /caseId: projection\.caseId, decisionId: projection\.decisionId, reviewSequence: projection\.reviewSequence/);
assert.match(source, /value\.outcome !== 'committed' && value\.outcome !== 'replayed'/, 'success must require a committed response or its exact server replay');
assert.match(source, /reviewerId: reviewer\.actorId/,'browser may select only an actor returned by the eligible-reviewer projection');
assert.doesNotMatch(source, /reviewerId[^\n]*(input|trim|target\.value)/i,'reviewer identity must never come from free text');
assert.doesNotMatch(source, /approved\s*:/, 'browser must not supply an approval flag');
assert.doesNotMatch(source, /package\s*:/, 'browser must not supply a Studio package');
assert.match(source, /approvalPurpose: 'documentation_planning'/, 'planning handoff supplies only its bounded purpose');
assert.match(source, /actor-scoped|const idempotencyKey = `\$\{operation\}:\$\{projection\.caseId\}:\$\{projection\.decisionId\}:\$\{projection\.reviewSequence\}`/);

const currentProjection = {
  caseId: 'case-1', decisionId: 'decision-1', caseVersion: 4,
  reviewSchemaVersion: 'assess-v2-review-2026-07', reviewSequence: 1,
  evidence: [], actions: [], controls: [], approvalPurpose: 'implementation_readiness',
  acceptedEvidence: [{ claimId: 'claim-1', evidenceIds: ['evidence-1'] }],
  unresolvedQuestions: [{ claimId: 'claim-2' }],
};
assert.equal(isAssessV2ReviewProjectionContract(currentProjection), true);
for (const stale of [
  { ...currentProjection, approvalPurpose: undefined },
  { ...currentProjection, acceptedEvidence: undefined },
  { ...currentProjection, unresolvedQuestions: undefined },
  { ...currentProjection, acceptedEvidence: [{ claimId: 'claim-1', evidenceIds: [7] }] },
  { ...currentProjection, unresolvedQuestions: [{}] },
]) assert.equal(isAssessV2ReviewProjectionContract(stale), false,
  'stale or malformed planning fields must remain rejected by the production decoder');
assert.match(source, /if \(!isAssessV2ReviewProjectionContract\(value\)\)[\s\S]*?COMMAND_UNAVAILABLE/,
  'the production decoder must apply the strict projection contract');
console.log('Assess V2 review client contract suite passed.');
