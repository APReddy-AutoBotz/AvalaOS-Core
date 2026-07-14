import assert from 'node:assert/strict';
import { Assessment } from '../types';
import { ASSESS_V1_BUYER_LABEL, ASSESS_V1_SCORE_VERSION, assertFrozenV1Assessment, cloneV1AssessmentToV2, meetsGovernLiteEvidenceThreshold, normalizeV1EvidenceQuality } from './assessV1Compatibility';

console.log('Running Assess V1 compatibility boundary tests...');

const source: Assessment = {
  id: 'assessment-v1-source',
  processId: 'process-source',
  orgId: 'org-one',
  workspaceId: 'workspace-one',
  scoreVersion: ASSESS_V1_SCORE_VERSION,
  status: 'Completed',
  metadata: { completionQuality: 80, templateFit: false, lastSavedAt: '2026-07-13T00:00:00.000Z', stakeholderCoverage: 4, evidenceQuality: 4, assumptionQuality: 3 },
  responses: {
    processStructure: { standardization: 4, ruleDeterminism: 5 },
    workPattern: { volume: 3 },
    dataProfile: { dataQuality: 4, dataSensitivity: 5 },
    judgment: { humanApprovalBeforeAction: true },
    systems: { primarySystems: 'ERP' },
    risk: { riskCriticality: 4 },
  },
  evidenceItems: [{ id: 'evidence-one', type: 'SOP', description: 'Source SOP', owner: 'process-owner', linkedField: 'processStructure.ruleDeterminism' }],
  assumptions: [{ id: 'assumption-one', category: 'API Availability', description: 'An API may exist.', validated: false }],
  completionBySection: { processStructure: 80, workPattern: 50, dataProfile: 80, judgment: 60, systems: 60, risk: 60, evidenceAndAssumptions: 50 },
};

assert.equal(ASSESS_V1_BUYER_LABEL, 'Legacy deterministic heuristic');
assert.equal(assertFrozenV1Assessment(source), ASSESS_V1_SCORE_VERSION);
assert.deepEqual(normalizeV1EvidenceQuality(3.5), { sourceScale: 'v1-1-to-5', sourceValue: 3.5, percent: 70 });
assert.equal(meetsGovernLiteEvidenceThreshold(3.5), true);
assert.equal(meetsGovernLiteEvidenceThreshold(3), false);
assert.equal(normalizeV1EvidenceQuality(5).percent, 100);
assert.deepEqual(normalizeV1EvidenceQuality(70), { sourceScale: 'legacy-percent', sourceValue: 70, percent: 70 });
assert.equal(meetsGovernLiteEvidenceThreshold(0), false);
assert.throws(() => normalizeV1EvidenceQuality(101), /1–5 scale or legacy 0–100 percent scale/);

const before = structuredClone(source);
const clone = cloneV1AssessmentToV2(source, { caseId: 'case-v2-clone', organizationId: 'org-one', workspaceId: 'workspace-one', ownerId: 'owner-one', clonedAt: '2026-07-14T00:00:00.000Z' });
assert.deepEqual(source, before, 'V1-to-V2 clone must not mutate the V1 source');
assert.deepEqual(clone.sourceV1, { assessmentId: source.id, scoreVersion: ASSESS_V1_SCORE_VERSION, clonedAt: '2026-07-14T00:00:00.000Z', importedAs: 'unverified-source-facts' });
assert.ok(clone.importedFacts?.length);
assert.ok(clone.importedFacts?.every(fact => fact.status === 'assumed' || fact.status === 'unknown'));
assert.ok(clone.importedFacts?.every(fact => fact.source === 'v1-import'));
assert.ok(clone.evidence.every(evidence => evidence.validated === false && evidence.status === 'submitted'));
assert.ok(!JSON.stringify(clone).includes('primaryTechnology'));
assert.equal(clone.status, 'draft');

assert.throws(() => cloneV1AssessmentToV2({ ...source, scoreVersion: 'other-version' }, { caseId: 'case', organizationId: 'org-one', workspaceId: 'workspace-one', ownerId: 'owner', clonedAt: '2026-07-14T00:00:00.000Z' }), /Only assess-core-2026-05/);
assert.throws(() => cloneV1AssessmentToV2(source, { caseId: 'case', organizationId: 'org-two', workspaceId: 'workspace-one', ownerId: 'owner', clonedAt: '2026-07-14T00:00:00.000Z' }), /organization ancestry/);
assert.throws(() => cloneV1AssessmentToV2(source, { caseId: 'case', organizationId: 'org-one', workspaceId: 'workspace-two', ownerId: 'owner', clonedAt: '2026-07-14T00:00:00.000Z' }), /workspace ancestry/);

console.log('Assess V1 compatibility boundary tests passed.');
