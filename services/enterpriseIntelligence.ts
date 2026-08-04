/**
 * Enterprise Intelligence domain contracts.
 *
 * This module is deliberately provider- and UI-independent. It contains only
 * deterministic validation and projection rules; it never calls a model,
 * changes an Assess score, approves a recommendation, or publishes a side
 * effect.
 */

export const ENTERPRISE_INTELLIGENCE_SCHEMA_VERSION = 'enterprise-intelligence-1';
export const MODERNIZATION_MODEL_VERSION = 'modernization-disposition-1';
export const ASSEMBLE_BLUEPRINT_SCHEMA_VERSION = 'assemble-blueprint-1';

export const ENTERPRISE_AI_PROVIDERS = [
  'openai',
  'azure_openai',
  'anthropic',
  'gemini',
  'openai_compatible',
] as const;

export type EnterpriseAiProvider = typeof ENTERPRISE_AI_PROVIDERS[number];

export const ENTERPRISE_AI_CAPABILITIES = [
  'assess.evidence.extract',
  'assess.evidence.summarize',
  'delivery.work_items.draft',
  'modernization.rationale.draft',
  'assemble.blueprint.draft',
  'studio.document.generate',
] as const;

export type EnterpriseAiCapability = typeof ENTERPRISE_AI_CAPABILITIES[number];

export const SUPPORTED_EVIDENCE_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/vtt',
  'application/x-subrip',
  'text/x-srt',
  'text/meeting-notes',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export type SupportedEvidenceMimeType = typeof SUPPORTED_EVIDENCE_MIME_TYPES[number];

export const EVIDENCE_CANDIDATE_FIELDS = [
  'process_objective',
  'outcome',
  'trigger',
  'completion',
  'actors',
  'systems',
  'steps',
  'rules',
  'exceptions',
  'manual_activities',
  'controls_approvals',
  'inputs_outputs',
  'volumes_frequencies',
  'slas',
  'pain_points',
  'risks',
  'data_sensitivity',
  'automation_opportunities',
  'integrations',
  'unresolved_questions',
  'assumptions',
] as const;

export type EvidenceCandidateField = typeof EVIDENCE_CANDIDATE_FIELDS[number];
export type EvidenceSuggestionStatus = 'suggested' | 'accepted' | 'rejected' | 'edited';
export type EvidenceSourceStatus = 'uploaded' | 'extracting' | 'review' | 'deleted' | 'failed';

export interface EnterpriseProviderConfigProjection {
  id: string;
  provider: EnterpriseAiProvider;
  displayName: string;
  endpoint?: string;
  deployment?: string;
  defaultModel: string;
  modelAllowlist: string[];
  capabilities: EnterpriseAiCapability[];
  status: 'pending_review' | 'active' | 'disabled' | 'retired';
  enabled: boolean;
  maskedSecretLabel: string;
  lastValidatedAt?: string;
  budget: {
    dailyRequests?: number;
    monthlyTokens?: number;
  };
}

export interface EnterpriseEvidenceSource {
  id: string;
  organizationId: string;
  workspaceId: string;
  displayName: string;
  mimeType: SupportedEvidenceMimeType;
  sourceKind: 'upload' | 'pasted_text';
  version: number;
  contentHash: string;
  extractedTextHash?: string;
  extractedCharacterCount?: number;
  status: EvidenceSourceStatus;
  createdAt: string;
  createdBy: string;
}

export interface EnterpriseEvidenceCandidate {
  id: string;
  sourceId: string;
  sourceVersionId: string;
  field: EvidenceCandidateField;
  value: string;
  safeExcerpt?: string;
  excerptHash: string;
  sourceLocator: string;
  confidence: number;
  aiJobId?: string;
  promptVersion?: string;
  status: EvidenceSuggestionStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  editCount: number;
}

export interface EvidenceCandidateEdit {
  candidateId: string;
  actorId: string;
  previousValue: string;
  nextValue: string;
  reason: string;
  createdAt: string;
}

export interface EnterpriseAiJobLedgerShell {
  tenantId: string;
  workspaceId: string;
  capability: EnterpriseAiCapability;
  providerConfigId: string;
  provider: EnterpriseAiProvider;
  model: string;
  promptKey: string;
  promptVersion: string;
  sourceRefs: string[];
  actorId: string;
  requestId: string;
  idempotencyKey: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked';
  outputHash?: string;
  approvalState: 'not_required' | 'review_required' | 'approved' | 'rejected';
}

export type FactorBand = 'unknown' | 'low' | 'medium' | 'high';

export interface ModernizationFactors {
  criticality: FactorBand;
  fit: FactorBand;
  ux: FactorBand;
  techHealth: FactorBand;
  maintainability: FactorBand;
  architecture: FactorBand;
  securityCompliance: FactorBand;
  dataPortability: FactorBand;
  apiIntegration: FactorBand;
  cloudFit: FactorBand;
  agentFit: FactorBand;
  vendorLockIn: FactorBand;
  costTco: FactorBand;
  operatingRisk: FactorBand;
  skills: FactorBand;
  changeEffort: FactorBand;
  timeToValue: FactorBand;
  dependencyRisk: FactorBand;
}

export const MODERNIZATION_DISPOSITIONS = [
  'retain',
  'optimize',
  'automate_around',
  'integrate',
  'api_enable_wrap',
  'refactor',
  'replatform',
  'rebuild',
  'replace',
  'assemble',
  'retire',
  'insufficient_evidence',
  'blocked',
] as const;

export type ModernizationDisposition = typeof MODERNIZATION_DISPOSITIONS[number];

export const ASSEMBLE_ELIGIBLE_DISPOSITIONS: readonly ModernizationDisposition[] = [
  'api_enable_wrap',
  'refactor',
  'rebuild',
  'assemble',
];

export interface ModernizationDecision {
  assessmentId: string;
  assessmentVersion: string;
  modelVersion: string;
  primaryDisposition: ModernizationDisposition;
  alternativeDisposition?: ModernizationDisposition;
  eligibleDispositions: ModernizationDisposition[];
  factorBands: ModernizationFactors;
  blockers: string[];
  conflicts: string[];
  requiresHumanApproval: true;
  aiRationaleStatus: 'not_requested' | 'draft_only';
}

export interface StudioApprovedDocumentRef {
  documentId: string;
  version: number;
  contentHash: string;
  artifactType: 'brd' | 'frd' | 'pdd';
  lifecycle: 'approved';
}

export interface DeliveryWorkPackageItem {
  id: string;
  itemType: 'Epic' | 'Story' | 'Task' | 'Milestone' | 'Dependency' | 'Risk';
  title: string;
  description: string;
  parentId?: string;
  acceptanceCriteria: string[];
  nonFunctionalRequirements: string[];
  sourceSectionLocator: string;
  sourceDocumentId: string;
  sourceDocumentVersion: number;
  sourceDocumentHash: string;
}

export interface DeliveryWorkPackageDraft {
  idempotencyKey: string;
  source: StudioApprovedDocumentRef;
  status: 'draft' | 'stale' | 'blocked';
  items: DeliveryWorkPackageItem[];
  blockers: string[];
  requiresHumanReview: true;
  canPublish: false;
}

export interface MonitorBaseline {
  id: string;
  workPackageId: string;
  sourceDocumentId: string;
  sourceDocumentVersion: number;
  sourceDocumentHash: string;
  status: 'draft' | 'approval_required' | 'blocked';
  approvedItemIds: string[];
  milestones: string[];
  dependencies: string[];
  blockers: string[];
  risks: string[];
  readiness: 'not_ready' | 'review_required';
  lineageComplete: boolean;
  liveTelemetryConnected: false;
}

export const ASSEMBLE_COMPONENT_CATALOG = [
  'Forms',
  'Workflows',
  'Data Model',
  'Validations',
  'Business Rules',
  'Approvals',
  'Human Tasks',
  'Extraction',
  'Connectors',
  'APIs',
  'Notifications',
  'Reporting',
  'Audit',
  'Roles/Access',
  'Agent Tools',
] as const;

export type AssembleComponentType = typeof ASSEMBLE_COMPONENT_CATALOG[number];

export interface AssembleBlueprintComponent {
  id: string;
  type: AssembleComponentType;
  name: string;
  description: string;
  enabled: boolean;
  configuration: Record<string, unknown>;
}

export interface AssembleBlueprintDraft {
  id: string;
  schemaVersion: string;
  modernizationDecisionId: string;
  disposition: ModernizationDisposition;
  status: 'draft';
  components: AssembleBlueprintComponent[];
  readableDocument: string;
  workflow: ['draft', 'edit', 'review', 'approval', 'publish'];
  safety: {
    codeGeneration: false;
    deployment: false;
    infrastructureChanges: false;
    credentialAccess: false;
    sourceSystemCalls: false;
    runtimeAgents: false;
  };
  requiresHumanApproval: true;
  canPublish: false;
}

const hashStep = (seed: number, value: string) => {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  }
  return hash >>> 0;
};

/** A stable non-secret idempotency fingerprint. Cryptographic hashes are computed server-side. */
export const stableFingerprint = (value: string) => {
  const normalized = value.normalize('NFKC');
  const first = hashStep(2166136261, normalized).toString(16).padStart(8, '0');
  const second = hashStep(2166136261 ^ 0x9e3779b9, normalized).toString(16).padStart(8, '0');
  return `${first}${second}`.repeat(4).slice(0, 64);
};

export const sanitizeEvidenceExcerpt = (value: string, maxLength = 480) => value
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxLength);

export const isSupportedEvidenceMimeType = (value: string): value is SupportedEvidenceMimeType => (
  SUPPORTED_EVIDENCE_MIME_TYPES.includes(value as SupportedEvidenceMimeType)
);

export const buildEvidenceCandidate = (input: Omit<EnterpriseEvidenceCandidate, 'excerptHash' | 'editCount'>): EnterpriseEvidenceCandidate => {
  const safeExcerpt = input.safeExcerpt ? sanitizeEvidenceExcerpt(input.safeExcerpt) : undefined;
  return {
    ...input,
    safeExcerpt,
    excerptHash: stableFingerprint(`${input.sourceVersionId}:${input.sourceLocator}:${safeExcerpt || input.value}`),
    editCount: 0,
  };
};

export const evaluateModernizationDecision = (input: {
  assessmentId: string;
  assessmentVersion: string;
  factors: ModernizationFactors;
}): ModernizationDecision => {
  const blockers: string[] = [];
  const conflicts: string[] = [];
  const unknownHighImpactFactors: Array<keyof ModernizationFactors> = [
    'criticality',
    'securityCompliance',
    'dataPortability',
    'dependencyRisk',
  ];

  unknownHighImpactFactors.forEach((factor) => {
    if (input.factors[factor] === 'unknown') blockers.push(`${factor}_evidence_required`);
  });

  if (input.factors.securityCompliance === 'high' && input.factors.operatingRisk === 'high') {
    conflicts.push('security_and_operating_risk_require_governance_review');
  }
  if (input.factors.changeEffort === 'high' && input.factors.timeToValue === 'high') {
    conflicts.push('change_effort_and_time_to_value_conflict');
  }

  if (blockers.length > 0) {
    return {
      assessmentId: input.assessmentId,
      assessmentVersion: input.assessmentVersion,
      modelVersion: MODERNIZATION_MODEL_VERSION,
      primaryDisposition: 'insufficient_evidence',
      alternativeDisposition: 'blocked',
      eligibleDispositions: ['insufficient_evidence', 'blocked'],
      factorBands: { ...input.factors },
      blockers,
      conflicts,
      requiresHumanApproval: true,
      aiRationaleStatus: 'not_requested',
    };
  }

  let primaryDisposition: ModernizationDisposition = 'optimize';
  let alternativeDisposition: ModernizationDisposition = 'retain';

  if (input.factors.criticality === 'low' && input.factors.operatingRisk === 'high') {
    primaryDisposition = 'retire';
    alternativeDisposition = 'retain';
  } else if (input.factors.vendorLockIn === 'high' && input.factors.cloudFit === 'low') {
    primaryDisposition = 'replatform';
    alternativeDisposition = 'refactor';
  } else if (input.factors.techHealth === 'low' && input.factors.maintainability === 'low') {
    primaryDisposition = input.factors.changeEffort === 'high' ? 'replace' : 'rebuild';
    alternativeDisposition = 'refactor';
  } else if (input.factors.apiIntegration === 'high' && input.factors.architecture !== 'low') {
    primaryDisposition = 'api_enable_wrap';
    alternativeDisposition = 'integrate';
  } else if (
    input.factors.fit === 'high'
    && input.factors.architecture === 'high'
    && input.factors.maintainability !== 'low'
    && input.factors.operatingRisk !== 'high'
  ) {
    primaryDisposition = input.factors.agentFit === 'high' ? 'assemble' : 'automate_around';
    alternativeDisposition = 'api_enable_wrap';
  } else if (input.factors.apiIntegration === 'medium' && input.factors.changeEffort === 'low') {
    primaryDisposition = 'integrate';
    alternativeDisposition = 'optimize';
  } else if (input.factors.techHealth === 'high' && input.factors.maintainability === 'high') {
    primaryDisposition = 'retain';
    alternativeDisposition = 'optimize';
  }

  const eligibleDispositions = [...new Set<ModernizationDisposition>([
    primaryDisposition,
    alternativeDisposition,
    'optimize',
    'retain',
  ])];

  return {
    assessmentId: input.assessmentId,
    assessmentVersion: input.assessmentVersion,
    modelVersion: MODERNIZATION_MODEL_VERSION,
    primaryDisposition,
    alternativeDisposition,
    eligibleDispositions,
    factorBands: { ...input.factors },
    blockers,
    conflicts,
    requiresHumanApproval: true,
    aiRationaleStatus: 'not_requested',
  };
};

export const buildDeliveryWorkPackageDraft = (input: {
  packageId: string;
  approvedDocument: StudioApprovedDocumentRef;
  currentApprovedDocument: StudioApprovedDocumentRef;
  sourceSections: Array<{ locator: string; title: string; summary: string; acceptanceCriteria?: string[] }>;
}): DeliveryWorkPackageDraft => {
  const stale = input.approvedDocument.version !== input.currentApprovedDocument.version
    || input.approvedDocument.contentHash !== input.currentApprovedDocument.contentHash
    || input.approvedDocument.documentId !== input.currentApprovedDocument.documentId
    || input.currentApprovedDocument.lifecycle !== 'approved';
  const idempotencyKey = stableFingerprint([
    input.packageId,
    input.approvedDocument.documentId,
    input.approvedDocument.version,
    input.approvedDocument.contentHash,
  ].join(':'));

  if (stale) {
    return {
      idempotencyKey,
      source: input.approvedDocument,
      status: 'stale',
      items: [],
      blockers: ['studio_approved_version_changed_or_missing'],
      requiresHumanReview: true,
      canPublish: false,
    };
  }

  const items = input.sourceSections.map((section, index): DeliveryWorkPackageItem => ({
    id: `${input.packageId}-item-${index + 1}`,
    itemType: index === 0 ? 'Epic' : 'Story',
    title: section.title,
    description: section.summary,
    parentId: index === 0 ? undefined : `${input.packageId}-item-1`,
    acceptanceCriteria: section.acceptanceCriteria || [],
    nonFunctionalRequirements: [],
    sourceSectionLocator: section.locator,
    sourceDocumentId: input.approvedDocument.documentId,
    sourceDocumentVersion: input.approvedDocument.version,
    sourceDocumentHash: input.approvedDocument.contentHash,
  }));

  return {
    idempotencyKey,
    source: input.approvedDocument,
    status: items.length ? 'draft' : 'blocked',
    items,
    blockers: items.length ? [] : ['approved_studio_document_has_no_handoff_sections'],
    requiresHumanReview: true,
    canPublish: false,
  };
};

export const buildMonitorBaseline = (input: {
  id: string;
  workPackageId: string;
  workPackage: DeliveryWorkPackageDraft;
  approvedItemIds: string[];
}): MonitorBaseline => {
  const complete = input.workPackage.status === 'draft'
    && input.workPackage.items.length > 0
    && input.workPackage.blockers.length === 0
    && input.approvedItemIds.length === input.workPackage.items.length
    && new Set(input.approvedItemIds).size === input.workPackage.items.length
    && input.approvedItemIds.every(itemId => input.workPackage.items.some(item => item.id === itemId));

  return {
    id: input.id,
    workPackageId: input.workPackageId,
    sourceDocumentId: input.workPackage.source.documentId,
    sourceDocumentVersion: input.workPackage.source.version,
    sourceDocumentHash: input.workPackage.source.contentHash,
    status: complete ? 'approval_required' : 'blocked',
    approvedItemIds: [...input.approvedItemIds],
    milestones: input.workPackage.items.filter(item => item.itemType === 'Milestone').map(item => item.title),
    dependencies: input.workPackage.items.filter(item => item.itemType === 'Dependency').map(item => item.title),
    blockers: complete ? [] : ['work_package_requires_human_review_before_monitor_baseline'],
    risks: input.workPackage.items.filter(item => item.itemType === 'Risk').map(item => item.title),
    readiness: complete ? 'review_required' : 'not_ready',
    lineageComplete: complete,
    liveTelemetryConnected: false,
  };
};

export const buildAssembleBlueprintDraft = (input: {
  blueprintId: string;
  modernizationDecisionId: string;
  disposition: ModernizationDisposition;
  name: string;
}): AssembleBlueprintDraft => {
  if (!ASSEMBLE_ELIGIBLE_DISPOSITIONS.includes(input.disposition)) {
    throw new Error('ASSEMBLE_DISPOSITION_NOT_ELIGIBLE');
  }

  const components: AssembleBlueprintComponent[] = ASSEMBLE_COMPONENT_CATALOG.map((type, index) => ({
    id: `${input.blueprintId}-component-${index + 1}`,
    type,
    name: type,
    description: type === 'Agent Tools'
      ? 'Optional tool definitions remain disabled until separately governed.'
      : `${type} definition for the ${input.name} blueprint.`,
    enabled: type !== 'Agent Tools',
    configuration: type === 'Agent Tools' ? { enabledByDefault: false } : {},
  }));

  const readableDocument = [
    `# ${input.name}`,
    '',
    `Modernization disposition: ${input.disposition}`,
    `Decision: ${input.modernizationDecisionId}`,
    '',
    'This is a governed Phase 1 blueprint draft. It contains no code, deployment, infrastructure, credentials, source-system calls, or runtime agents.',
    '',
    '## Component catalog',
    ...components.map(component => `- ${component.type}: ${component.enabled ? 'enabled for design' : 'disabled by default'}`),
  ].join('\n');

  return {
    id: input.blueprintId,
    schemaVersion: ASSEMBLE_BLUEPRINT_SCHEMA_VERSION,
    modernizationDecisionId: input.modernizationDecisionId,
    disposition: input.disposition,
    status: 'draft',
    components,
    readableDocument,
    workflow: ['draft', 'edit', 'review', 'approval', 'publish'],
    safety: {
      codeGeneration: false,
      deployment: false,
      infrastructureChanges: false,
      credentialAccess: false,
      sourceSystemCalls: false,
      runtimeAgents: false,
    },
    requiresHumanApproval: true,
    canPublish: false,
  };
};

export const assertHighImpactApprovalSeparation = (input: {
  createdBy: string;
  reviewedBy: string;
  approvedBy: string;
}) => {
  if (new Set([input.createdBy, input.reviewedBy, input.approvedBy]).size !== 3) {
    throw new Error('APPROVAL_SEPARATION_REQUIRED');
  }
  return true as const;
};
