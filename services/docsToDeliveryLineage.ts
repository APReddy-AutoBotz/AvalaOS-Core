import {
  DeliverySourceLineageCompleteness,
  GeneratedArtifacts,
  TaskSourceLineageMetadata,
  WorkItem,
} from '../types';

export interface BuildDocsToDeliveryLineageInput {
  artifacts?: GeneratedArtifacts | null;
  generationId?: string | null;
  workItem: WorkItem;
  createdAt?: string;
  handoffLedgerEntryIds?: string[];
}

export interface DocsToDeliveryLineageCounts {
  complete: number;
  partial: number;
  missing: number;
}

const compactStrings = (values: Array<string | undefined | null>): string[] =>
  values
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value));

const uniqueStrings = (values: Array<string | undefined | null>): string[] =>
  Array.from(new Set(compactStrings(values)));

const evidenceRefByType = (artifacts: GeneratedArtifacts | null | undefined, type: string): string | undefined =>
  artifacts?.sourceContext?.evidenceRefs.find(ref => ref.type === type)?.id;

const determineLineageCompleteness = (
  hasGeneration: boolean,
  hasAssessSource: boolean,
  evidenceRefCount: number,
): DeliverySourceLineageCompleteness => {
  if (hasGeneration && hasAssessSource && evidenceRefCount > 0) return 'complete';
  if (hasGeneration || hasAssessSource || evidenceRefCount > 0) return 'partial';
  return 'missing';
};

export const buildDocsToDeliveryLineage = ({
  artifacts,
  generationId,
  workItem,
  createdAt,
  handoffLedgerEntryIds = [],
}: BuildDocsToDeliveryLineageInput): TaskSourceLineageMetadata => {
  const sourceContext = artifacts?.sourceContext;
  const normalizedGenerationId = generationId?.trim() || undefined;
  const evidenceRefs = uniqueStrings(sourceContext?.evidenceRefs.map(ref => ref.id) || []);
  const assumptionRefs = uniqueStrings(sourceContext?.assumptionSummary.map(assumption => assumption.id) || []);
  const hasAssessSource = Boolean(sourceContext?.processId && sourceContext?.assessmentId);
  const lineageCompleteness = determineLineageCompleteness(
    Boolean(normalizedGenerationId),
    hasAssessSource,
    evidenceRefs.length,
  );
  const lineageNotes = compactStrings([
    !normalizedGenerationId ? 'No document generation id was available at import time.' : undefined,
    !sourceContext ? 'No Assess source context was attached to this generated artifact.' : undefined,
    sourceContext && evidenceRefs.length === 0 ? 'Assess source context did not include evidence reference ids.' : undefined,
  ]);

  return {
    processId: sourceContext?.processId,
    assessmentId: sourceContext?.assessmentId,
    documentGenerationId: normalizedGenerationId,
    sourceModule: 'docs',
    upstreamSourceModule: sourceContext?.sourceModule === 'assess' ? 'assess' : undefined,
    sourceType: 'Generated Work Item',
    sourceGenerationId: normalizedGenerationId,
    sourceArtifactKey: 'workItems',
    sourceArtifactTitle: 'Generated Work Items',
    sourceWorkItemTitle: workItem.title,
    sourceContextLabel: sourceContext?.sourceLabel,
    sourceDecisionPackRef: sourceContext?.decisionPack?.auditTrailRef || evidenceRefByType(artifacts, 'Decision Pack'),
    sourceHandoffPackRef: evidenceRefByType(artifacts, 'Handoff Pack') || (sourceContext ? `${sourceContext.assessmentId}:handoff-pack` : undefined),
    handoffLedgerEntryIds: uniqueStrings(handoffLedgerEntryIds),
    evidenceRefs,
    assumptionRefs,
    sourceLabel: sourceContext?.sourceLabel || 'Avala Studio generated work item',
    sourceStatus: lineageCompleteness === 'complete' ? 'Accepted' : 'Submitted',
    lineageCompleteness,
    lineageNotes,
    createdAt,
  };
};

export const collectDocsToDeliveryEvidenceRefs = (
  lineages: Array<TaskSourceLineageMetadata | undefined>,
): string[] => uniqueStrings(lineages.flatMap(lineage => lineage?.evidenceRefs || []));

export const summarizeDocsToDeliveryLineageCompleteness = (
  lineages: Array<TaskSourceLineageMetadata | undefined>,
): DocsToDeliveryLineageCounts =>
  lineages.reduce<DocsToDeliveryLineageCounts>(
    (counts, lineage) => {
      const status = lineage?.lineageCompleteness || 'missing';
      counts[status] += 1;
      return counts;
    },
    { complete: 0, partial: 0, missing: 0 },
  );
