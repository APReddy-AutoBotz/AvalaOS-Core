import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASSESS_DOCUMENT_MAPPING_SCHEMA_VERSION, decodeAssessDocumentMappingProjection, emptyAssessDocumentMappingProjection, isAssessMappingJsonValue } from './contracts.ts';

const id = (suffix: number) => `a0000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const digest = (character: string) => character.repeat(64);
const projection = () => {
  const catalogId = id(1); const caseId = id(2); const selectorId = id(3); const proposalId = id(4); const sourceId = id(5);
  const sourceVersionId = id(6); const jobId = id(7); const bindingId = id(8); const bundleId = id(9); const bundleVersionId = id(10);
  const conflictId = id(11); const previewId = id(12); const runId = id(13);
  const target = { selectorId, catalogId, caseId, caseVersion: 2, assessSchemaVersion: 'assess-v2-schema-2026-07', targetKind: 'case_field', operation: 'set_field',
    fieldId: 'case.description', label: 'Description', contextLabel: 'Case', valueType: 'text', currentValue: 'manual', currentValueHash: digest('a'), manual: true };
  const proposal = { id: proposalId, version: 1, catalogId, targetSelectorId: selectorId, caseId, caseVersion: 2, inputBundleId: bundleId, inputBundleVersionId: bundleVersionId,
    extractionJobId: jobId, extractionBindingId: bindingId, sourceId, sourceVersionId, proposedValue: 'mapped', effectiveValue: 'mapped', confidence: 0.9,
    rationale: 'Exact statement', sourceAnchor: { sourceVersionId, parserVersion: 'text-v1', locator: 'text:0-6', anchorHash: digest('b'), safeExcerpt: 'mapped' },
    status: 'suggested', relationship: 'neutral', reviewState: 'pending' };
  const conflict = { id: conflictId, targetSelectorId: selectorId, label: 'Description', proposalIds: [proposalId], currentValue: 'manual', material: true,
    resolution: 'unresolved', resolutionVersion: 0 };
  return { schemaVersion: ASSESS_DOCUMENT_MAPPING_SCHEMA_VERSION, features: { enabled: true },
    catalogs: [{ id: catalogId, caseId, caseVersion: 2, assessSchemaVersion: 'assess-v2-schema-2026-07', catalogVersion: 1, catalogHash: digest('c'), status: 'current', targets: [target], createdAt: '2026-09-16T00:00:00.000Z' }],
    proposals: [proposal], conflicts: [conflict], previews: [{ id: previewId, catalogId, catalogHash: digest('c'), caseId, expectedCaseVersion: 2, inputBundleId: bundleId,
      inputBundleVersionId: bundleVersionId, proposalIds: [proposalId], changes: [{ proposalId, targetSelectorId: selectorId, label: 'Description', currentValue: 'manual', proposedValue: 'mapped', conflictState: 'manual_conflict' }],
      conflicts: [structuredClone(conflict)], manifest: { previewBatchId: previewId, manifestVersion: 1, catalogId, catalogHash: digest('c'), caseId, caseVersion: 2,
        inputBundleId: bundleId, inputBundleVersionId: bundleVersionId, targetCount: 1, sourceCount: 1, itemCount: 1, reviewedCount: 1,
        conflictCount: 1, unresolvedConflictCount: 1, itemSetHash: digest('d'), conflictSetHash: digest('e'), resolutionSetHash: digest('a'), displayedSetHash: digest('f') },
      projectionComplete: true, status: 'blocked', expiresAt: '2026-09-17T00:00:00.000Z' }],
    runs: [{ id: runId, catalogId, caseId, caseVersion: 2, inputBundleId: bundleId, inputBundleVersionId: bundleVersionId, extractionJobIds: [jobId], state: 'review_required', proposalCount: 1,
      projectionComplete: true,
      warnings: ['SOURCE_PARSER_WARNING:HIDDEN_SHEETS_EXCLUDED'], analyzedSources: [{ sourceId, sourceVersionId, parserVersion: 'spreadsheet-grid-v1', extractedByteCount: 100, sheetCount: 1, cellCount: 4, warnings: ['HIDDEN_SHEETS_EXCLUDED'] }], updatedAt: '2026-09-16T00:00:00.000Z' }] };
};

test('decodes a fully bound projection and returns a clone', () => {
  const value = projection(); const decoded = decodeAssessDocumentMappingProjection(value);
  assert.deepEqual(decoded, value); assert.notEqual(decoded, value);
  assert.deepEqual(emptyAssessDocumentMappingProjection().runs, []);
});

test('JSON values reject nonfinite, deep, oversized and unsafe keyed structures', () => {
  assert.equal(isAssessMappingJsonValue({ value: [1, true, null] }), true);
  assert.equal(isAssessMappingJsonValue(Number.NaN), false);
  assert.equal(isAssessMappingJsonValue(JSON.parse('{"__proto__":"unsafe"}')), false);
  assert.equal(isAssessMappingJsonValue({ 'bad-key': 1 }), false);
  assert.equal(isAssessMappingJsonValue(Array(101).fill(1)), false);
  let deep: unknown = 'x'; for (let index = 0; index < 8; index += 1) deep = { value: deep };
  assert.equal(isAssessMappingJsonValue(deep), false);
});

test('unknown keys, duplicates, NaN confidence and over-bounds fail closed', () => {
  for (const mutate of [
    (value: any) => { value.extra = true; },
    (value: any) => { value.catalogs[0].targets[0].extra = true; },
    (value: any) => { value.proposals[0].confidence = Number.NaN; },
    (value: any) => { value.runs[0].analyzedSources[0].warnings = Array(41).fill('x'); },
    (value: any) => { value.catalogs[0].targets.push(structuredClone(value.catalogs[0].targets[0])); },
  ]) { const value: any = projection(); mutate(value); assert.throws(() => decodeAssessDocumentMappingProjection(value), /PROJECTION_INVALID/); }
});

test('cross-case, source, target, conflict and preview substitutions fail closed', () => {
  for (const mutate of [
    (value: any) => { value.proposals[0].caseId = id(99); },
    (value: any) => { value.proposals[0].sourceAnchor.sourceVersionId = id(99); },
    (value: any) => { value.conflicts[0].targetSelectorId = id(99); value.previews[0].conflicts[0].targetSelectorId = id(99); },
    (value: any) => { value.previews[0].inputBundleId = id(99); },
    (value: any) => { value.previews[0].conflicts[0].label = 'substituted'; },
    (value: any) => { value.previews[0].proposalIds = []; value.previews[0].changes = []; },
    (value: any) => { value.previews[0].manifest.previewBatchId = id(99); },
    (value: any) => { value.previews[0].manifest.sourceCount = 2; },
    (value: any) => { value.runs[0].projectionComplete = false; },
    (value: any) => { value.runs[0].analyzedSources[0].sourceVersionId = id(99); value.runs[0].analyzedSources.push(structuredClone(value.runs[0].analyzedSources[0])); },
  ]) { const value: any = projection(); mutate(value); assert.throws(() => decodeAssessDocumentMappingProjection(value), /PROJECTION_INVALID/); }
});

test('an explicitly incomplete preview may be shown only as blocked', () => {
  const value: any = projection();
  value.previews[0].projectionComplete = false;
  value.previews[0].status = 'blocked';
  value.previews[0].proposalIds = [];
  value.previews[0].changes = [];
  assert.equal(decodeAssessDocumentMappingProjection(value).previews[0].projectionComplete, false);
});
