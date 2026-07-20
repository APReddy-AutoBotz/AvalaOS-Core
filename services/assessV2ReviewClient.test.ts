import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('services/assessV2ReviewClient.ts', 'utf8');
const contract = readFileSync('services/assessV2ReviewClientContract.ts', 'utf8');
for (const capability of ['assess.v2.review', 'assess.v2.evidence.attest', 'assess.v2.approve', 'assess.v2.govern.resolve', 'assess.v2.studio.handoff']) assert.ok(contract.includes(capability));
for (const command of ['assessment_v2.evidence.attest', 'assessment_v2.review.resolve', 'assessment_v2.revision.start', 'assessment_v2.govern.resolve', 'assessment_v2.studio.handoff']) assert.ok(source.includes(command));
assert.match(source, /assess_v2_review_queue/);
assert.match(source, /p_org_id: context\.organizationId, p_workspace_id: context\.workspaceId/);
assert.match(source, /assess_v2_review_workspace/);
assert.match(source, /expectedVersion: projection\.caseVersion|projection\.caseVersion/);
assert.match(source, /caseId: projection\.caseId, decisionId: projection\.decisionId, reviewVersion: projection\.reviewVersion/);
assert.match(source, /value\.outcome !== 'committed' && value\.outcome !== 'replayed'/, 'success must require a committed response or its exact server replay');
assert.doesNotMatch(source, /reviewerId\s*:/, 'browser must not supply reviewer identity');
assert.doesNotMatch(source, /approved\s*:/, 'browser must not supply an approval flag');
assert.match(source, /execute\(context, 'assessment_v2\.studio\.handoff', projection, \{\}/, 'browser must not supply a Studio package');
assert.match(source, /actor-scoped|const idempotencyKey = `\$\{operation\}:\$\{projection\.caseId\}:\$\{projection\.decisionId\}:\$\{projection\.reviewVersion\}`/);
console.log('Assess V2 review client contract suite passed.');
