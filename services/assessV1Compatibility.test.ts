import assert from 'node:assert/strict';
import { Assessment } from '../types';
import { ASSESS_V1_BUYER_LABEL, ASSESS_V1_IMPORT_SECTIONS, ASSESS_V1_SCORE_VERSION, ASSESS_V1_TO_V2_CLONE_CONTRACT, ASSESS_V1_TO_V2_CLONE_CONTRACT_VERSION, assertFrozenV1Assessment, assertRuntimeCloneContract, cloneV1AssessmentToV2, deterministicV1EvidenceId, meetsGovernLiteEvidenceThreshold, normalizeV1EvidenceQuality } from './assessV1Compatibility';

console.log('Running Assess V1 compatibility boundary tests...');
const source: Assessment = {
  id: 'assessment-v1-source', processId: 'process-source', orgId: 'org-one', workspaceId: 'workspace-one', scoreVersion: ASSESS_V1_SCORE_VERSION, status: 'Completed',
  metadata: { completionQuality: 80, templateFit: false, lastSavedAt: '2026-07-13T00:00:00.000Z', stakeholderCoverage: 4, evidenceQuality: 4, assumptionQuality: 3 },
  responses: { processStructure: { standardization: 4, ruleDeterminism: 5 }, workPattern: { volume: 3 }, dataProfile: { dataQuality: 4, dataSensitivity: 5 }, judgment: { humanApprovalBeforeAction: true }, systems: { primarySystems: 'ERP' }, risk: { riskCriticality: 4 } },
  evidenceItems: [{ id: 'evidence-one', type: 'SOP', description: 'Source SOP', owner: 'process-owner', linkedField: 'processStructure.ruleDeterminism' }],
  assumptions: [{ id: 'assumption-one', category: 'API Availability', description: 'An API may exist.', validated: false }],
  completionBySection: { processStructure: 80, workPattern: 50, dataProfile: 80, judgment: 60, systems: 60, risk: 60, evidenceAndAssumptions: 50 },
};

assert.equal(ASSESS_V1_BUYER_LABEL, 'Legacy deterministic heuristic');
assert.equal(assertFrozenV1Assessment(source), ASSESS_V1_SCORE_VERSION);
for (const [value, percent, meets] of [[3, 60, false], [4, 80, true], [69, 69, false], [70, 70, true]] as const) {
  assert.equal(normalizeV1EvidenceQuality(value).percent, percent);
  assert.equal(meetsGovernLiteEvidenceThreshold(value), meets);
}
assert.deepEqual(normalizeV1EvidenceQuality(3.5), { sourceScale: 'v1-1-to-5', sourceValue: 3.5, percent: 70 });
assert.equal(meetsGovernLiteEvidenceThreshold(3.5), true);
assert.equal(normalizeV1EvidenceQuality(5).percent, 100);
assert.equal(meetsGovernLiteEvidenceThreshold(0), false);
for (const invalid of [Number.NaN, -1, 101, Number.POSITIVE_INFINITY]) assert.throws(() => normalizeV1EvidenceQuality(invalid), /1-5 scale or legacy 0-100 percent scale/);

const before = structuredClone(source);
const clone = cloneV1AssessmentToV2(source, { caseId: 'case-v2-clone', organizationId: 'org-one', workspaceId: 'workspace-one', ownerId: 'owner-one', clonedAt: '2026-07-14T00:00:00.000Z' });
assert.deepEqual(source, before, 'V1-to-V2 clone must leave the complete V1 record and lineage byte-for-byte unchanged');
assert.deepEqual(clone.sourceV1, { assessmentId: source.id, scoreVersion: ASSESS_V1_SCORE_VERSION, clonedAt: '2026-07-14T00:00:00.000Z', importedAs: 'unverified-source-facts' });
assert.ok(clone.importedFacts?.length);
assert.ok(clone.importedFacts?.every(item => item.status === 'assumed' || item.status === 'unknown'));
assert.ok(clone.importedFacts?.every(item => item.source === 'v1-import'));
assert.ok(clone.importedFacts?.filter(item => item.fieldId.startsWith('v1.responses.')).every(item => ASSESS_V1_IMPORT_SECTIONS.some(section => item.fieldId.startsWith(`v1.responses.${section}.`))));
assert.ok(clone.evidence.every(item => item.validated === false && item.status === 'submitted'));
assert.ok(clone.evidence.every(item => (item as typeof item & { reviewerIds?: unknown[]; contradictory?: boolean }).reviewerIds?.length === 0 && (item as typeof item & { reviewerIds?: unknown[]; contradictory?: boolean }).contradictory === false));
assert.ok(clone.evidence.every(item => /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id)));
assert.equal(deterministicV1EvidenceId(source.id, source.evidenceItems[0].id), clone.evidence[0].id);
assert.equal(deterministicV1EvidenceId(source.id, source.evidenceItems[0].id), deterministicV1EvidenceId(source.id, source.evidenceItems[0].id));
assert.ok(clone.importedFacts?.find(item => item.fieldId === 'v1.responses.processStructure.ruleDeterminism')?.evidenceIds.includes(clone.evidence[0].id));
const ownerless = cloneV1AssessmentToV2({ ...source, evidenceItems: [{ ...source.evidenceItems[0], owner: undefined }] }, { caseId: 'case-ownerless', organizationId: 'org-one', workspaceId: 'workspace-one', ownerId: 'owner-one', clonedAt: '2026-07-14T00:00:00.000Z' });
assert.equal('owner' in ownerless.evidence[0], false);
assert.ok(!JSON.stringify(clone).includes('scores') && !JSON.stringify(clone).includes('primaryTechnology') && !JSON.stringify(clone).includes('studioHandoffId'));
assert.equal(clone.status, 'draft');
assert.equal(ASSESS_V1_TO_V2_CLONE_CONTRACT.version, 'assess-v1-to-v2-clone-2026-07-15');
assert.equal(ASSESS_V1_TO_V2_CLONE_CONTRACT.version, ASSESS_V1_TO_V2_CLONE_CONTRACT_VERSION);
assert.equal(Object.isFrozen(ASSESS_V1_TO_V2_CLONE_CONTRACT), true);
assert.doesNotThrow(() => assertRuntimeCloneContract({ cloneContractVersion: ASSESS_V1_TO_V2_CLONE_CONTRACT_VERSION, importedFactCount: clone.importedFacts!.length, importedEvidenceCount: clone.evidence.length }));
for (const invalid of [
  { importedFactCount: 1, importedEvidenceCount: 1 },
  { cloneContractVersion: 'wrong-contract', importedFactCount: 1, importedEvidenceCount: 1 },
  { cloneContractVersion: ASSESS_V1_TO_V2_CLONE_CONTRACT_VERSION, importedFactCount: -1, importedEvidenceCount: 1 },
  { cloneContractVersion: ASSESS_V1_TO_V2_CLONE_CONTRACT_VERSION, importedFactCount: 1.5, importedEvidenceCount: 1 },
]) assert.throws(() => assertRuntimeCloneContract(invalid), /canonical conversion contract|invalid importedFactCount/);

assert.throws(() => cloneV1AssessmentToV2({ ...source, scoreVersion: 'other-version' }, { caseId: 'case', organizationId: 'org-one', workspaceId: 'workspace-one', ownerId: 'owner', clonedAt: '2026-07-14T00:00:00.000Z' }), /Only assess-core-2026-05/);
assert.throws(() => cloneV1AssessmentToV2(source, { caseId: 'case', organizationId: 'org-two', workspaceId: 'workspace-one', ownerId: 'owner', clonedAt: '2026-07-14T00:00:00.000Z' }), /organization ancestry/);
assert.throws(() => cloneV1AssessmentToV2(source, { caseId: 'case', organizationId: 'org-one', workspaceId: 'workspace-two', ownerId: 'owner', clonedAt: '2026-07-14T00:00:00.000Z' }), /workspace ancestry/);
console.log('Assess V1 compatibility boundary tests passed.');
