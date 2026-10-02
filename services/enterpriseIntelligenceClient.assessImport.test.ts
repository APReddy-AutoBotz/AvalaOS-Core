import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enterpriseIntelligenceClient, EnterpriseIntelligenceClientError } from './enterpriseIntelligenceClient.ts';

const id = (suffix: number) => `d0000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const invocations: Array<{ name: string; options: { body: Record<string, unknown> } }> = [];
(globalThis as typeof globalThis & { __studioInvoke?: (name: string, options: { body: Record<string, unknown> }) => Promise<{ data: unknown; error: unknown }> }).__studioInvoke = async (name, options) => {
  invocations.push({ name, options }); return { data: { ok: true, resourceId: id(99) }, error: null };
};
const common = { organizationId: id(1), workspaceId: id(2) };
const previewManifest = { previewBatchId: id(14), manifestVersion: 1, catalogId: id(11), catalogHash: 'a'.repeat(64), caseId: id(3), caseVersion: 2,
  inputBundleId: id(4), inputBundleVersionId: id(5), targetCount: 4, sourceCount: 1, itemCount: 1, reviewedCount: 1,
  conflictCount: 0, unresolvedConflictCount: 0, itemSetHash: 'b'.repeat(64), conflictSetHash: 'c'.repeat(64), resolutionSetHash: 'e'.repeat(64), displayedSetHash: 'd'.repeat(64) };
const last = () => invocations.at(-1)!.options.body;

test('query sends exact case and bundle scope without relaxing response validation', async () => {
  const scope = { caseId: id(3), caseVersion: 2, inputBundleId: id(4), inputBundleVersionId: id(5) };
  const count = invocations.length;
  // The transport mock deliberately has no projection; a query must still
  // reject it after emitting the exact independently validated request.
  await assert.rejects(() => enterpriseIntelligenceClient.loadProjection({ ...common, expectedAuthorizationVersion: 7, assessDocumentMappingScope: scope }),
    (error: unknown) => error instanceof EnterpriseIntelligenceClientError && error.code === 'ENTERPRISE_PROJECTION_UNAVAILABLE');
  assert.equal(invocations.length, count + 1);
  assert.equal(invocations.at(-1)!.name, 'enterprise-intelligence-query');
  assert.deepEqual(last(), { ...common, expectedAuthorizationVersion: 7, assessDocumentMappingScope: scope });
});

test('query rejects malformed case/head and incomplete bundle scope before transport', async () => {
  const count = invocations.length;
  for (const scope of [
    { caseId: 'not-a-case', caseVersion: 2 },
    { caseId: id(3), caseVersion: 0 },
    { caseId: id(3), caseVersion: Number.NaN },
    { caseId: id(3), caseVersion: 2, inputBundleId: id(4) },
    { caseId: id(3), caseVersion: 2, inputBundleVersionId: id(5) },
    { caseId: id(3), caseVersion: 2, inputBundleId: 'not-a-bundle', inputBundleVersionId: id(5) },
    { caseId: id(3), caseVersion: 2, inputBundleId: id(4), inputBundleVersionId: 'not-a-version' },
  ]) await assert.rejects(() => enterpriseIntelligenceClient.loadProjection({ ...common, assessDocumentMappingScope: scope }), EnterpriseIntelligenceClientError);
  assert.equal(invocations.length, count);
});

test('analyze emits only exact case, bundle and selected source lineage', async () => {
  await enterpriseIntelligenceClient.analyzeAssessDocuments({ ...common, caseId: id(3), expectedCaseVersion: 2, inputBundleId: id(4), inputBundleVersionId: id(5), expectedInputBundleVersion: 3,
    selections: [{ sourceSetId: id(6), sourceSetVersionId: id(7), expectedSourceSetVersion: 4, sourceId: id(8), sourceVersionId: id(9) }] });
  assert.equal(last().commandType, 'assess.document-map.analyze');
  assert.deepEqual(last().payload, { caseId: id(3), expectedCaseVersion: 2, inputBundleId: id(4), inputBundleVersionId: id(5), expectedInputBundleVersion: 3,
    selections: [{ sourceSetId: id(6), sourceSetVersionId: id(7), expectedSourceSetVersion: 4, sourceId: id(8), sourceVersionId: id(9) }] });
});

test('review, preview, conflict and commit preserve exact optimistic selectors', async () => {
  await enterpriseIntelligenceClient.reviewAssessDocumentProposal({ ...common, proposalId: id(10), proposalVersion: 2, catalogId: id(11), targetSelectorId: id(12), caseId: id(3), expectedCaseVersion: 2, status: 'edited', editedValue: 0.5, reason: ' correct ' });
  assert.equal(last().commandType, 'assess.document-map.proposal.review'); assert.equal((last().payload as any).reason, 'correct');
  await enterpriseIntelligenceClient.previewAssessDocumentMapping({ ...common, catalogId: id(11), catalogHash: 'a'.repeat(64), caseId: id(3), expectedCaseVersion: 2, inputBundleId: id(4), inputBundleVersionId: id(5),
    selections: [{ proposalId: id(10), proposalVersion: 3, targetSelectorId: id(12), effectiveValue: false }] });
  assert.equal(last().commandType, 'assess.document-map.preview');
  await enterpriseIntelligenceClient.resolveAssessDocumentMappingConflict({ ...common, conflictId: id(13), resolutionVersion: 0, resolution: 'authored_resolution', authoredValue: 'human value', rationale: 'Human reviewed conflict' });
  assert.equal(last().commandType, 'assess.document-map.conflict.resolve');
  await enterpriseIntelligenceClient.commitAssessDocumentMapping({ ...common, previewBatchId: id(14), catalogId: id(11), catalogHash: 'a'.repeat(64), caseId: id(3), expectedCaseVersion: 2, inputBundleId: id(4), inputBundleVersionId: id(5), previewManifest });
  assert.equal(last().commandType, 'assess.document-map.commit');
  assert.deepEqual((last().payload as any).previewManifest, previewManifest);
});

test('client rejects duplicate sources, stale versions, invalid edits and invalid hashes before transport', () => {
  const count = invocations.length;
  assert.throws(() => enterpriseIntelligenceClient.analyzeAssessDocuments({ ...common, caseId: id(3), expectedCaseVersion: 2, inputBundleId: id(4), inputBundleVersionId: id(5), expectedInputBundleVersion: 3,
    selections: [{ sourceSetId: id(6), sourceSetVersionId: id(7), expectedSourceSetVersion: 4, sourceId: id(8), sourceVersionId: id(9) }, { sourceSetId: id(16), sourceSetVersionId: id(17), expectedSourceSetVersion: 4, sourceId: id(18), sourceVersionId: id(9) }] }), EnterpriseIntelligenceClientError);
  assert.throws(() => enterpriseIntelligenceClient.reviewAssessDocumentProposal({ ...common, proposalId: id(10), proposalVersion: 1, catalogId: id(11), targetSelectorId: id(12), caseId: id(3), expectedCaseVersion: 2, status: 'accepted', editedValue: 'not allowed' }), EnterpriseIntelligenceClientError);
  assert.throws(() => enterpriseIntelligenceClient.previewAssessDocumentMapping({ ...common, catalogId: id(11), catalogHash: 'bad', caseId: id(3), expectedCaseVersion: 2, inputBundleId: id(4), inputBundleVersionId: id(5), selections: [] }), EnterpriseIntelligenceClientError);
  assert.throws(() => enterpriseIntelligenceClient.commitAssessDocumentMapping({ ...common, previewBatchId: id(14), catalogId: id(11), catalogHash: 'a'.repeat(64), caseId: id(3), expectedCaseVersion: 2, inputBundleId: id(4), inputBundleVersionId: id(5), previewManifest: { ...previewManifest, previewBatchId: id(99) } }), EnterpriseIntelligenceClientError);
  assert.equal(invocations.length, count);
});
