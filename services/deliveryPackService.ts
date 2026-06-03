import {
  AssessProcess,
  Assessment,
  AvalaGovernLiteCard,
  DeliveryPack,
  DeliveryPackAuditEvent,
  DeliveryPackBlocker,
  DeliveryPackChecklistItem,
  DeliveryPackChecklistStatus,
  DeliveryPackDecisionSummary,
  DeliveryPackDocumentRef,
  DeliveryPackLineageStatus,
  DeliveryPackSourceRef,
  DeliveryPackStatus,
  DeliveryPackWorkItemRef,
  DocTemplate,
  DocumentArtifactKeys,
  DocumentGeneration,
  HandoffLedgerEntry,
  Project,
  Task,
  TaskSourceLineageMetadata,
  User,
} from '../types';
import { buildAvalaGovernLiteCard } from './avalaGovernLiteService';

const DOCUMENT_ARTIFACT_KEYS: DocumentArtifactKeys[] = ['brd', 'frd', 'pdd'];
const OMITTED_CONTENT_POLICY = 'Document bodies, raw uploaded source content, provider payloads, raw prompts, secrets, and tenant-confidential source content are excluded from this pack export.';

export interface BuildDeliveryPackInput {
  project: Project;
  tasks: Task[];
  users: User[];
  documentGenerations: DocumentGeneration[];
  docTemplates: DocTemplate[];
  handoffEntries?: HandoffLedgerEntry[];
  process?: AssessProcess | null;
  assessment?: Assessment | null;
  generatedAt?: string;
  exportedAt?: string;
}

const unique = <T,>(items: T[]) => Array.from(new Set(items.filter(Boolean)));

const mostCommon = (values: string[]) => {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

export const inferDeliveryPackProcessId = (tasks: Task[]) =>
  mostCommon(tasks.map(task => task.sourceLineage?.processId).filter(Boolean) as string[]);

export const inferDeliveryPackAssessmentId = (tasks: Task[]) =>
  mostCommon(tasks.map(task => task.sourceLineage?.assessmentId).filter(Boolean) as string[]);

const inferDeliveryPackId = (project: Project, tasks: Task[]) =>
  mostCommon(tasks.map(task => task.sourceLineage?.deliveryPackId).filter(Boolean) as string[]) || `${project.id}-delivery-pack`;

const userNameById = (users: User[], userId?: string) =>
  users.find(user => user.id === userId)?.name || userId || 'Unassigned';

const userNamesById = (users: User[], userIds: string[]) =>
  userIds.length > 0 ? userIds.map(userId => userNameById(users, userId)) : ['Unassigned'];

const getDocumentTitle = (generation: DocumentGeneration, docTemplates: DocTemplate[]) => {
  const template = docTemplates.find(item => item.id === generation.templateId);
  if (template) return template.title;
  const firstDoc = DOCUMENT_ARTIFACT_KEYS
    .map(key => generation.artifacts[key])
    .find(artifact => artifact?.title);
  return firstDoc?.title || 'Generated document set';
};

const getDocumentSummary = (generation: DocumentGeneration) => {
  const firstSection = DOCUMENT_ARTIFACT_KEYS
    .flatMap(key => generation.artifacts[key]?.sections || [])
    .find(section => section.title || section.key);

  const summaryParts = [
    `${DOCUMENT_ARTIFACT_KEYS.filter(key => Boolean(generation.artifacts[key])).length} generated document artifacts`,
    `${generation.artifacts.workItems?.length || 0} referenced work items`,
  ];

  if (firstSection) summaryParts.push(`first section: ${firstSection.title || firstSection.key}`);
  return summaryParts.join('; ');
};

const mapApprovalStatus = (generation: DocumentGeneration): DeliveryPackChecklistStatus => {
  const approvals = generation.artifacts.approvals || [];
  if (approvals.length === 0) return 'Not Required';
  if (approvals.some(approval => approval.status === 'Rejected')) return 'Action Required';
  if (approvals.some(approval => approval.status === 'Pending')) return 'Action Required';
  return 'Complete';
};

const mapQualityGateStatus = (generation: DocumentGeneration): DeliveryPackChecklistStatus => {
  const qualityGate = generation.artifacts.qualityGate;
  if (!qualityGate) return 'Not Required';
  const findingCount = (qualityGate.ambiguityPoints?.length || 0) + (qualityGate.gapPoints?.length || 0);
  return findingCount > 0 ? 'Action Required' : 'Complete';
};

const lineageStatusFor = (lineage?: TaskSourceLineageMetadata): DeliveryPackLineageStatus => {
  if (!lineage) return 'Missing';
  const linkedCount = [lineage.processId, lineage.assessmentId, lineage.documentGenerationId].filter(Boolean).length;
  if (linkedCount === 3) return 'Linked';
  return linkedCount > 0 ? 'Partial' : 'Missing';
};

const mapDocumentRef = (generation: DocumentGeneration, docTemplates: DocTemplate[]): DeliveryPackDocumentRef => {
  const artifactKeys = DOCUMENT_ARTIFACT_KEYS.filter(key => Boolean(generation.artifacts[key]));
  const sectionCount = DOCUMENT_ARTIFACT_KEYS.reduce((total, key) => total + (generation.artifacts[key]?.sections?.length || 0), 0);

  return {
    id: generation.id,
    title: getDocumentTitle(generation, docTemplates),
    templateId: generation.templateId,
    generatedAt: generation.generatedAt,
    artifactKeys,
    qualityGateStatus: mapQualityGateStatus(generation),
    approvalStatus: mapApprovalStatus(generation),
    summary: getDocumentSummary(generation),
    sectionCount,
    workItemCount: generation.artifacts.workItems?.length || 0,
    sourceRef: {
      id: generation.id,
      type: 'Document Generation',
      title: getDocumentTitle(generation, docTemplates),
      module: 'docs',
      status: mapApprovalStatus(generation),
      createdAt: generation.generatedAt,
      metadata: {
        templateId: generation.templateId,
        artifactKeys,
      },
    },
  };
};

const mapWorkItemRef = (task: Task, users: User[]): DeliveryPackWorkItemRef => ({
  id: task.id,
  title: task.title,
  type: task.type,
  status: task.status,
  priority: task.priority,
  ownerNames: userNamesById(users, task.assigneeIds),
  blockerSummary: task.status === 'Blocked' ? task.description : undefined,
  sourceLineage: task.sourceLineage,
  lineageStatus: lineageStatusFor(task.sourceLineage),
  evidenceRefs: task.sourceLineage?.evidenceRefs || [],
});

const buildDecisionSummary = (assessment?: Assessment | null): DeliveryPackDecisionSummary | undefined => {
  if (!assessment) return undefined;
  const scores = assessment.scores;
  return {
    assessmentId: assessment.id,
    processId: assessment.processId,
    scoreVersion: scores?.scoreVersion,
    calculatedAt: scores?.calculatedAt,
    finalDecision: scores?.decisionPack?.finalDecision,
    recommendationCategory: scores?.recommendation?.category,
    primaryTechnology: scores?.recommendation?.primaryTechnology,
    riskTier: scores?.riskTier,
    gateDecision: scores?.gateDecision,
    confidenceBand: scores?.confidenceBand,
    priorityTier: scores?.priorityTier,
    handoffEligibility: scores?.handoffEligibility,
  };
};

const buildSources = (
  project: Project,
  process: AssessProcess | null | undefined,
  assessment: Assessment | null | undefined,
  governLite: AvalaGovernLiteCard | undefined,
  documents: DeliveryPackDocumentRef[],
  workItems: DeliveryPackWorkItemRef[],
): DeliveryPackSourceRef[] => {
  const sources: DeliveryPackSourceRef[] = [{
    id: project.id,
    type: 'Project',
    title: project.name,
    module: 'delivery',
    status: project.healthStatus,
  }];

  if (process) {
    sources.push({
      id: process.id,
      type: 'Assessment',
      title: process.name,
      module: 'assess',
      status: process.status,
      createdAt: process.createdAt,
      metadata: {
        department: process.department,
        criticality: process.criticality,
      },
    });
  }

  if (assessment) {
    sources.push({
      id: assessment.id,
      type: 'Decision Pack',
      title: `${process?.name || assessment.processId} decision summary`,
      module: 'assess',
      status: assessment.status,
      createdAt: assessment.metadata.lastSavedAt,
      metadata: {
        scoreVersion: assessment.scores?.scoreVersion,
        gateDecision: assessment.scores?.gateDecision,
        riskTier: assessment.scores?.riskTier,
      },
    });
  }

  if (governLite) {
    sources.push({
      id: `${project.id}-govern-lite`,
      type: 'Delivery Pack',
      title: 'Avala Govern Lite snapshot',
      module: 'delivery',
      status: governLite.governanceStatus,
      metadata: {
        autonomyLevel: governLite.autonomyLevel,
        riskLevel: governLite.riskLevel,
      },
    });
  }

  documents.forEach(document => {
    if (document.sourceRef) sources.push(document.sourceRef);
  });

  if (workItems.length > 0) {
    sources.push({
      id: `${project.id}-work-items`,
      type: 'Work Items',
      title: `${workItems.length} Delivery work items`,
      module: 'delivery',
      status: `${workItems.filter(item => item.status === 'Blocked').length} blocked`,
      metadata: {
        workItemCount: workItems.length,
        missingLineageCount: workItems.filter(item => item.lineageStatus === 'Missing').length,
      },
    });
  }

  return sources;
};

const buildApprovalChecklist = (
  process: AssessProcess | null | undefined,
  assessment: Assessment | null | undefined,
  governLite: AvalaGovernLiteCard | undefined,
  documents: DeliveryPackDocumentRef[],
  users: User[],
): DeliveryPackChecklistItem[] => {
  const approvalEvents = assessment?.review?.approvalHistory || [];
  const latestApproval = [...approvalEvents].reverse().find(event => event.status === 'Approved' || event.status === 'Rejected');
  const processOwner = userNameById(users, process?.ownerId);

  const items: DeliveryPackChecklistItem[] = [{
    id: 'assessment-owner-approval',
    label: 'Assessment owner decision recorded',
    status: latestApproval?.status === 'Approved' || assessment?.status === 'Approved' || assessment?.status === 'Completed' || assessment?.status === 'Handed Off to Delivery'
      ? 'Complete'
      : governLite?.humanApprovalRequired ? 'Action Required' : 'Not Required',
    owner: latestApproval?.actorName || processOwner,
    source: 'Assess review state',
    detail: latestApproval?.reason || `Assessment status is ${assessment?.status || 'not available'}.`,
  }];

  if (governLite) {
    items.push({
      id: 'govern-lite-human-approval',
      label: 'Govern Lite human approval requirement',
      status: governLite.humanApprovalRequired ? 'Action Required' : 'Complete',
      owner: processOwner,
      source: 'Avala Govern Lite',
      detail: governLite.approvalPolicy,
    });
  }

  documents.forEach(document => {
    items.push({
      id: `document-approval-${document.id}`,
      label: `${document.title} approval status`,
      status: document.approvalStatus,
      source: 'Avala Studio',
      detail: `Document generation ${document.id} has approval status ${document.approvalStatus}.`,
    });
  });

  return items;
};

const buildEvidenceChecklist = (
  assessment: Assessment | null | undefined,
  governLite: AvalaGovernLiteCard | undefined,
  workItems: DeliveryPackWorkItemRef[],
): DeliveryPackChecklistItem[] => {
  const evidenceItems = assessment?.evidenceItems || [];
  const items: DeliveryPackChecklistItem[] = [{
    id: 'assessment-evidence-linked',
    label: 'Assessment evidence references linked',
    status: evidenceItems.length > 0 ? 'Complete' : 'Missing',
    owner: unique(evidenceItems.map(item => item.owner).filter(Boolean) as string[]).join(', ') || undefined,
    source: 'Assess evidence register',
    detail: evidenceItems.length > 0
      ? `${evidenceItems.length} evidence references are linked by ID and summary only.`
      : 'No evidence references are linked to this pack.',
  }];

  items.push({
    id: 'work-item-evidence-linked',
    label: 'Delivery work items carry evidence lineage',
    status: workItems.every(item => item.evidenceRefs.length > 0) ? 'Complete' : 'Missing',
    source: 'Delivery work item metadata',
    detail: `${workItems.filter(item => item.evidenceRefs.length > 0).length} of ${workItems.length} work items include evidence reference IDs.`,
  });

  (governLite?.evidenceGaps || []).forEach((gap, index) => {
    items.push({
      id: `govern-lite-evidence-gap-${index + 1}`,
      label: gap.label,
      status: 'Action Required',
      source: 'Avala Govern Lite',
      detail: gap.nextAction,
    });
  });

  if (governLite && governLite.evidenceGaps.length === 0) {
    items.push({
      id: 'govern-lite-evidence-policy',
      label: 'Govern Lite evidence policy satisfied',
      status: governLite.evidenceRequired ? 'Action Required' : 'Complete',
      source: 'Avala Govern Lite',
      detail: governLite.evidencePolicy,
    });
  }

  return items;
};

const buildBlockers = (
  governLite: AvalaGovernLiteCard | undefined,
  workItems: DeliveryPackWorkItemRef[],
  documents: DeliveryPackDocumentRef[],
): DeliveryPackBlocker[] => {
  const blockers: DeliveryPackBlocker[] = [];

  if (governLite?.governanceStatus === 'Blocked') {
    blockers.push({
      id: 'govern-lite-blocked',
      label: 'Govern Lite blocks downstream handoff',
      severity: 'Critical',
      source: 'Avala Govern Lite',
      detail: governLite.blockedReason || governLite.nextGovernanceAction,
    });
  }

  workItems.filter(item => item.status === 'Blocked').forEach(item => {
    blockers.push({
      id: `blocked-work-item-${item.id}`,
      label: item.title,
      severity: item.priority === 'High' ? 'High' : 'Medium',
      source: 'Delivery work item',
      detail: item.blockerSummary || 'Work item is blocked and requires owner review.',
    });
  });

  workItems.filter(item => item.lineageStatus !== 'Linked').forEach(item => {
    blockers.push({
      id: `lineage-${item.id}`,
      label: `${item.title} lineage ${item.lineageStatus.toLowerCase()}`,
      severity: item.lineageStatus === 'Missing' ? 'Medium' : 'Low',
      source: 'Delivery work item metadata',
      detail: 'Work item does not have complete read-only source lineage to Assess, Studio documents, and handoff metadata.',
    });
  });

  documents.filter(document => document.approvalStatus === 'Action Required').forEach(document => {
    blockers.push({
      id: `document-approval-${document.id}`,
      label: `${document.title} approval requires review`,
      severity: 'Medium',
      source: 'Avala Studio',
      detail: 'Document approval is pending or rejected in the generated document reference.',
    });
  });

  return blockers;
};

const buildAuditSummary = (
  project: Project,
  workItems: DeliveryPackWorkItemRef[],
  handoffEntries: HandoffLedgerEntry[],
): DeliveryPackAuditEvent[] => {
  const lineageHandoffIds = unique(workItems.flatMap(item => item.sourceLineage?.handoffLedgerEntryIds || []));
  const matchedEntries = handoffEntries.filter(entry =>
    entry.targetId === project.id
    || entry.sourceId === project.id
    || lineageHandoffIds.includes(entry.id)
    || workItems.some(item => item.sourceLineage?.processId === entry.metadata?.processId)
  );

  if (matchedEntries.length > 0) {
    return matchedEntries.map(entry => ({
      id: entry.id,
      label: entry.title,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      targetType: entry.targetType,
      targetId: entry.targetId,
      status: entry.status,
      createdAt: entry.createdAt,
      createdBy: entry.createdBy,
      evidenceRefs: entry.evidenceRefs,
    }));
  }

  return workItems
    .filter(item => item.sourceLineage?.handoffLedgerEntryIds?.length)
    .map(item => ({
      id: `${item.id}-lineage`,
      label: `${item.title} source lineage recorded`,
      sourceType: 'Work Items',
      sourceId: item.id,
      targetType: 'Project',
      targetId: project.id,
      status: (item.sourceLineage?.sourceStatus as DeliveryPackAuditEvent['status']) || 'Accepted',
      createdAt: item.sourceLineage?.documentGenerationId ? '2026-04-26T18:10:00.000Z' : '',
      createdBy: 'demo-lineage',
      evidenceRefs: item.evidenceRefs,
    }));
};

const statusFrom = (
  blockers: DeliveryPackBlocker[],
  approvalChecklist: DeliveryPackChecklistItem[],
  evidenceChecklist: DeliveryPackChecklistItem[],
): DeliveryPackStatus => {
  if (blockers.some(blocker => blocker.severity === 'Critical' || blocker.id.startsWith('blocked-work-item'))) return 'Blocked';
  if (blockers.some(blocker => blocker.id.startsWith('lineage-'))) return 'Lineage Incomplete';
  if (approvalChecklist.some(item => item.status === 'Action Required' || item.status === 'Missing')) return 'Approval Required';
  if (evidenceChecklist.some(item => item.status === 'Action Required' || item.status === 'Missing')) return 'Evidence Review Required';
  return 'Ready for Review';
};

export const buildDeliveryPack = ({
  project,
  tasks,
  users,
  documentGenerations,
  docTemplates,
  handoffEntries = [],
  process,
  assessment,
  generatedAt,
  exportedAt,
}: BuildDeliveryPackInput): DeliveryPack => {
  const packId = inferDeliveryPackId(project, tasks);
  const packGeneratedAt = generatedAt || new Date().toISOString();
  const packExportedAt = exportedAt || packGeneratedAt;
  const governLite = assessment && process ? buildAvalaGovernLiteCard(assessment, process) : undefined;
  const documents = documentGenerations.map(generation => mapDocumentRef(generation, docTemplates));
  const workItems = tasks.map(task => mapWorkItemRef(task, users));
  const sources = buildSources(project, process, assessment, governLite, documents, workItems);
  const approvalChecklist = buildApprovalChecklist(process, assessment, governLite, documents, users);
  const evidenceChecklist = buildEvidenceChecklist(assessment, governLite, workItems);
  const blockers = buildBlockers(governLite, workItems, documents);
  const auditSummary = buildAuditSummary(project, workItems, handoffEntries);

  return {
    id: packId,
    title: `${project.name} Governed Delivery Pack`,
    organizationId: process?.orgId || assessment?.orgId || 'org-1',
    projectId: project.id,
    projectName: project.name,
    status: statusFrom(blockers, approvalChecklist, evidenceChecklist),
    processRef: process ? {
      id: process.id,
      type: 'Assessment',
      title: process.name,
      module: 'assess',
      status: process.status,
      createdAt: process.createdAt,
    } : undefined,
    assessmentRef: assessment ? {
      id: assessment.id,
      type: 'Decision Pack',
      title: `${process?.name || assessment.processId} decision summary`,
      module: 'assess',
      status: assessment.status,
      createdAt: assessment.metadata.lastSavedAt,
    } : undefined,
    sources,
    decisionSummary: buildDecisionSummary(assessment),
    governLite,
    documents,
    workItems,
    approvalChecklist,
    evidenceChecklist,
    blockers,
    auditSummary,
    exportMetadata: {
      generatedAt: packGeneratedAt,
      exportedAt: packExportedAt,
      exportMode: 'review',
      sourceCount: sources.length,
      omittedContentPolicy: OMITTED_CONTENT_POLICY,
    },
  };
};
