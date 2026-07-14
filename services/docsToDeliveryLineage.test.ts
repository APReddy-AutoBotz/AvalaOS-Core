import assert from 'node:assert/strict';

import {
  buildDocsToDeliveryLineage,
  collectDocsToDeliveryEvidenceRefs,
  summarizeDocsToDeliveryLineageCompleteness,
} from './docsToDeliveryLineage';
import { AssessToStudioHandoffPayload, GeneratedArtifacts, WorkItem } from '../types';

const workItem: WorkItem = {
  type: 'Story',
  title: 'Capture governed intake',
  description: 'Create a governed intake workflow for exception review.',
  acceptanceCriteria: ['Reviewer can see the intake context before action.'],
};

const sourceContext: AssessToStudioHandoffPayload = {
  sourceModule: 'assess',
  targetModule: 'docs',
  sourceType: 'Decision Pack / Handoff Pack',
  sourceLabel: 'Invoice exception handling Assess source context',
  createdAt: '2026-06-01T00:00:00.000Z',
  processId: 'process-1',
  processName: 'Invoice exception handling',
  assessmentId: 'assessment-1',
  studioHandoffId: '77777777-7777-4777-8777-777777777777',
  assessmentStatus: 'Handed Off to Docs',
  evidenceRefs: [
    {
      id: 'assessment-1',
      type: 'Assessment',
      description: 'Assessment source record',
    },
    {
      id: 'decision-pack-1',
      type: 'Decision Pack',
      description: 'Decision Pack source record',
    },
    {
      id: 'handoff-pack-1',
      type: 'Handoff Pack',
      description: 'Handoff Pack source record',
    },
  ],
  assumptionSummary: [
    {
      id: 'assumption-1',
      category: 'Risk',
      description: 'Exception routing needs human approval before release.',
      validated: true,
    },
  ],
  readiness: {
    handoffEligibility: 'Ready for Docs',
    docsHandoffReadiness: 'Ready for Docs',
    deliveryHandoffReadiness: 'Ready for Docs, Not Delivery',
  },
};

const generatedArtifacts = (source?: AssessToStudioHandoffPayload): GeneratedArtifacts => ({
  brd: { title: 'BRD', sections: [] },
  frd: { title: 'FRD', sections: [] },
  pdd: { title: 'PDD', sections: [] },
  qualityGate: { title: 'Quality Gate', ambiguityPoints: [], gapPoints: [] },
  diagrams: {
    asIs: { title: 'As Is', mermaidCode: 'flowchart TD' },
    toBe: { title: 'To Be', mermaidCode: 'flowchart TD' },
  },
  workItems: [workItem],
  approvals: [],
  sourceContext: source,
});

const completeLineage = buildDocsToDeliveryLineage({
  artifacts: generatedArtifacts(sourceContext),
  generationId: 'docgen-1',
  workItem,
  createdAt: '2026-06-02T00:00:00.000Z',
  handoffLedgerEntryIds: ['handoff-1'],
});

assert.equal(completeLineage.lineageCompleteness, 'complete');
assert.equal(completeLineage.sourceModule, 'docs');
assert.equal(completeLineage.upstreamSourceModule, 'assess');
assert.equal(completeLineage.documentGenerationId, 'docgen-1');
assert.equal(completeLineage.processId, 'process-1');
assert.equal(completeLineage.assessmentId, 'assessment-1');
assert.equal(completeLineage.sourceDecisionPackRef, 'decision-pack-1');
assert.equal(completeLineage.sourceHandoffPackRef, 'handoff-pack-1');
assert.deepEqual(completeLineage.evidenceRefs, ['assessment-1', 'decision-pack-1', 'handoff-pack-1']);
assert.deepEqual(completeLineage.assumptionRefs, ['assumption-1']);
assert.deepEqual(completeLineage.handoffLedgerEntryIds, ['handoff-1']);

const docsOnlyLineage = buildDocsToDeliveryLineage({
  artifacts: generatedArtifacts(),
  generationId: 'docgen-2',
  workItem,
});

assert.equal(docsOnlyLineage.lineageCompleteness, 'partial');
assert.equal(docsOnlyLineage.processId, undefined);
assert.equal(docsOnlyLineage.assessmentId, undefined);
assert.deepEqual(docsOnlyLineage.evidenceRefs, []);
assert.ok(docsOnlyLineage.lineageNotes?.some(note => note.includes('No Assess source context')));
assert.ok(docsOnlyLineage.lineageNotes?.includes('Docs-only generation is not Assess-backed evidence.'));

const missingLineage = buildDocsToDeliveryLineage({
  artifacts: null,
  workItem,
});

assert.equal(missingLineage.lineageCompleteness, 'missing');
assert.equal(missingLineage.documentGenerationId, undefined);
assert.deepEqual(missingLineage.evidenceRefs, []);

assert.deepEqual(
  collectDocsToDeliveryEvidenceRefs([completeLineage, docsOnlyLineage, missingLineage]),
  ['assessment-1', 'decision-pack-1', 'handoff-pack-1'],
);
assert.deepEqual(
  summarizeDocsToDeliveryLineageCompleteness([completeLineage, docsOnlyLineage, missingLineage]),
  { complete: 1, partial: 1, missing: 1 },
);

console.log('Docs-to-Delivery lineage regression passed.');
