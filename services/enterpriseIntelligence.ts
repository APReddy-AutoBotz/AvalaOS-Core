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

export const ENTERPRISE_INTELLIGENCE_PROJECTION_VERSION = 'enterprise-intelligence-projection-1' as const;

export type EnterpriseProjectionAvailability = 'ready' | 'empty' | 'blocked' | 'stale' | 'unavailable';

export interface EnterpriseProviderRouteProjection {
  id: string;
  capability: EnterpriseAiCapability;
  modelLabel: string;
  enabled: boolean;
  availability: 'ready' | 'disabled' | 'validation_required' | 'provider_unavailable';
  allowedRoleCount: number;
  allowedRoleIds: string[];
}

export interface EnterpriseProviderRoleOptionProjection {
  id: string;
  label: string;
  scope: 'workspace' | 'organization_admin';
}

export interface EnterpriseProviderProjection {
  id: string;
  provider: EnterpriseAiProvider;
  displayName: string;
  defaultModel: string;
  status: 'pending_review' | 'active' | 'disabled' | 'retired';
  credentialState: 'server_reference_present' | 'server_reference_missing';
  endpointState: 'first_party' | 'server_configured';
  validationState: 'validated' | 'validation_required';
  lastValidatedAt?: string;
  budgetState: 'configured' | 'not_configured';
  eligibleRouteRoles: EnterpriseProviderRoleOptionProjection[];
  routes: EnterpriseProviderRouteProjection[];
}

export interface EnterpriseEvidenceSourceProjection {
  id: string;
  displayName: string;
  mimeType: SupportedEvidenceMimeType;
  status: EvidenceSourceStatus;
  versionLabel: string;
  extractedCharacterCount: number;
  extractionState: 'ready' | 'empty_text_layer' | 'pending' | 'failed';
  failureCode?: 'OCR_REQUIRED' | 'UNSUPPORTED_FORMAT' | 'MALFORMED_SOURCE';
  sourceBytesAnchored: boolean;
  extractedTextAnchored: boolean;
  createdAt: string;
}

export interface EnterpriseEvidenceCandidateProjection {
  id: string;
  sourceId: string;
  field: EvidenceCandidateField;
  value: string;
  safeExcerpt?: string;
  sourceLocator: string;
  confidence: number;
  status: EvidenceSuggestionStatus;
  promptVersionLabel?: string;
  provenanceState: 'anchored' | 'incomplete';
  reviewState: 'pending' | 'reviewed_by_you' | 'reviewed_by_another';
  reviewedAt?: string;
}

export interface EnterpriseAssessDraftProjection {
  id: string;
  label: string;
  versionLabel: string;
  status: 'draft';
  updatedAt: string;
}

export interface EnterpriseApplicationProjection {
  id: string;
  name: string;
  approvedAssessmentLabel: string;
  decisionModelLabel: string;
  approvedAt: string;
  modernizationState: 'eligible' | 'already_assessed';
}

export interface EnterpriseStudioDocumentProjection {
  id: string;
  label: string;
  artifactType: 'brd' | 'frd' | 'pdd';
  approvedVersionLabel: string;
  lifecycle: 'approved';
  handoffState: 'available' | 'already_handed_off' | 'stale';
}

export interface EnterpriseDeliveryItemProjection {
  itemType: DeliveryWorkPackageItem['itemType'];
  title: string;
  acceptanceCriteriaCount: number;
  sourceLocator: string;
}

export interface EnterpriseDeliveryPackageProjection {
  id: string;
  label: string;
  status: 'draft' | 'review' | 'approved' | 'stale' | 'blocked';
  currentVersionLabel: string;
  sourceLabel: string;
  lineageState: 'complete' | 'stale' | 'blocked';
  items: EnterpriseDeliveryItemProjection[];
  createdByCurrentActor: boolean;
}

export interface EnterpriseMonitorProjection {
  id: string;
  label: string;
  workPackageId: string;
  status: 'draft' | 'approval_required' | 'approved' | 'blocked' | 'stale';
  readiness: 'not_ready' | 'review_required';
  approvedItemCount: number;
  lineageComplete: boolean;
  liveTelemetryConnected: false;
  createdByCurrentActor: boolean;
}

export interface EnterpriseModernizationProjection {
  id: string;
  applicationName: string;
  status: 'draft' | 'review' | 'approved' | 'rejected' | 'stale' | 'blocked';
  primaryDisposition: ModernizationDisposition;
  alternativeDisposition?: ModernizationDisposition;
  blockers: string[];
  conflicts: string[];
  assembleEligible: boolean;
  createdByCurrentActor: boolean;
}

export interface EnterpriseBlueprintProjection {
  id: string;
  name: string;
  status: 'draft' | 'edit' | 'review' | 'approval_required' | 'approved' | 'stale' | 'blocked';
  versionLabel: string;
  disposition: ModernizationDisposition;
  components: Array<{ type: AssembleComponentType; name: string; enabled: boolean }>;
  safety: AssembleBlueprintDraft['safety'];
  createdByCurrentActor: boolean;
}

export type EnterpriseApprovalResourceType = 'evidence_candidate' | 'modernization_decision' | 'delivery_work_package' | 'monitor_baseline' | 'assemble_blueprint';

export interface EnterpriseApprovalResourceProjection {
  id: string;
  resourceType: EnterpriseApprovalResourceType;
  label: string;
  status: string;
  createdByCurrentActor: boolean;
  independentReviewState: 'not_recorded' | 'recorded_by_you' | 'recorded_by_another';
  approvalState: 'not_recorded' | 'approved' | 'rejected';
  separationOfDuties: 'creator_cannot_review' | 'reviewer_cannot_approve' | 'eligible_for_review' | 'eligible_for_approval' | 'complete';
}

export interface EnterpriseCommandActivityProjection {
  commandType: string;
  status: 'claimed' | 'committed' | 'failed' | 'blocked';
  completedAt?: string;
  idempotencyState: 'in_progress' | 'committed' | 'stable_failure';
}

export interface EnterpriseIntelligenceProjection {
  schemaVersion: typeof ENTERPRISE_INTELLIGENCE_PROJECTION_VERSION;
  organizationId: string;
  workspaceId: string;
  authorizationVersion: number;
  generatedAt: string;
  capabilities: string[];
  availability: EnterpriseProjectionAvailability;
  providers: EnterpriseProviderProjection[];
  evidenceSources: EnterpriseEvidenceSourceProjection[];
  evidenceCandidates: EnterpriseEvidenceCandidateProjection[];
  assessDrafts: EnterpriseAssessDraftProjection[];
  applications: EnterpriseApplicationProjection[];
  studioDocuments: EnterpriseStudioDocumentProjection[];
  deliveryPackages: EnterpriseDeliveryPackageProjection[];
  monitorBaselines: EnterpriseMonitorProjection[];
  modernizationDecisions: EnterpriseModernizationProjection[];
  blueprints: EnterpriseBlueprintProjection[];
  approvalResources: EnterpriseApprovalResourceProjection[];
  commandActivity: EnterpriseCommandActivityProjection[];
  assessPromotion: {
    state: 'contract_pending' | 'ready' | 'conflict' | 'promoted';
    acceptedCandidateCount: number;
    provenanceComplete: boolean;
    draftVersionLabel?: string;
    idempotencyState: 'not_started' | 'in_progress' | 'committed' | 'stable_failure';
    conflicts: string[];
  };
}

export type EvidenceFileSupport = {
  supported: boolean;
  mimeType?: SupportedEvidenceMimeType;
  state: 'native_text' | 'text_pdf_requires_text_layer' | 'docx_text' | 'unsupported';
  message: string;
};

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
  workflow: ['draft', 'edit', 'review', 'approval', 'publi×N÷¶‰Ëkºwµçe½¹-•ä¹Ñ•ÍĞ¡­•ä¤¤Ñ¡É½Ü¹•ÜÉÉ½È 9QIAI%M}AI=)Q%=9}M9M%Q%Y}%1œ¤ì4(€€€É•©•ÑM•¹Í¥Ñ¥Ù•AÉ½©•Ñ¥½¹¥•±‘Ì¡•¹ÑÉä¤ì4(€ô¤ì4)ôì4(4(¼¨¨MÑÉ¥Ğ‰É½İÍ•È‘•½‘•È™½ÈÑ¡”Í•ÉÙ•Èµ¥ÍÍÕ•°µ¥¹¥µ¥é•É•…ÁÉ½©•Ñ¥½¸¸€¨¼4)•áÁ½ÉĞ½¹ÍĞ‘•½‘•¹Ñ•ÉÁÉ¥Í•%¹Ñ•±±¥•¹•AÉ½©•Ñ¥½¸€ô€¡Ù…±Õ”èÕ¹­¹½İ¸¤è¹Ñ•ÉÁÉ¥Í•%¹Ñ•±±¥•¹•AÉ½©•Ñ¥½¸€ôøì4(€¥˜€ …Ù…±Õ”ñğÑåÁ•½˜Ù…±Õ”€„ôô€½‰©•ĞœñğÉÉ…ä¹¥ÍÉÉ…ä¡Ù…±Õ”¤¤Ñ¡É½Ü¹•ÜÉÉ½È 9QIAI%M}AI=)Q%=9}%9Y1%œ¤ì4(€½¹ÍĞÉ½Ü€ôÙ…±Õ”…ÌI•½ÉñÍÑÉ¥¹œ°Õ¹­¹½İ¸øì4(€¥˜€¡=‰©•Ğ¹­•åÌ¡É½Ü¤¹Í½µ”¡­•ä€ôø€…ÁÉ½©•Ñ¥½¹-•åÌ¹¥¹±Õ‘•Ì¡­•ä…ÌÑåÁ•½˜ÁÉ½©•Ñ¥½¹-•åÍm¹Õµ‰•Ét¤¤¤Ñ¡É½Ü¹•ÜÉÉ½È 9QIAI%M}AI=)Q%=9}%9Y1%œ¤ì4(€¥˜€ 4(€€€É½Ü¹Í¡•µ…Y•ÉÍ¥½¸€„ôô9QIAI%M}%9Q11%9}AI=)Q%=9}YIM%=84(€€€ñğÑåÁ•½˜É½Ü¹½É…¹¥é…Ñ¥½¹%€„ôô€ÍÑÉ¥¹œœñğ€…ÁÉ½©•Ñ¥½¹UÕ¥¹Ñ•ÍĞ¡É½Ü¹½É…¹¥é…Ñ¥½¹%¤4(€€€ñğÑåÁ•½˜É½Ü¹İ½É­ÍÁ…•%€„ôô€ÍÑÉ¥¹œœñğ€…ÁÉ½©•Ñ¥½¹UÕ¥¹Ñ•ÍĞ¡É½Ü¹İ½É­ÍÁ…•%¤4(€€€ñğ€…9Õµ‰•È¹¥ÍM…™•%¹Ñ••È¡É½Ü¹…ÕÑ¡½É¥é…Ñ¥½¹Y•ÉÍ¥½¸¤ñğ9Õµ‰•È¡É½Ü¹…ÕÑ¡½É¥é…Ñ¥½¹Y•ÉÍ¥½¸¤€ğ€Ä4(€€€ñğÑåÁ•½˜É½Ü¹•¹•É…Ñ•‘Ğ€„ôô€ÍÑÉ¥¹œœñğ€…9Õµ‰•È¹¥Í¥¹¥Ñ”¡…Ñ”¹Á…ÉÍ”¡É½Ü¹•¹•É…Ñ•‘Ğ¤¤4(€€€ñğ€…ÉÉ…ä¹¥ÍÉÉ…ä¡É½Ü¹…Á…‰¥±¥Ñ¥•Ì¤ñğÉ½Ü¹…Á…‰¥±¥Ñ¥•Ì¹Í½µ”¡…Á…‰¥±¥Ñä€ôøÑåÁ•½˜…Á…‰¥±¥Ñä€„ôô€ÍÑÉ¥¹œœ¤4(€€€ñğ€…lÉ•…‘äœ°€•µÁÑäœ°€‰±½­•œ°€ÍÑ…±”œ°€Õ¹…Ù…¥±…‰±”t¹¥¹±Õ‘•Ì¡MÑÉ¥¹œ¡É½Ü¹…Ù…¥±…‰¥±¥Ñä¤¤4(€€€ñğ€…lÁÉ½Ù¥‘•ÉÌœ°€•Ù¥‘•¹•M½ÕÉ•Ìœ°€•Ù¥‘•¹•…¹‘¥‘…Ñ•Ìœ°€…ÍÍ•ÍÍÉ…™ÑÌœ°€…ÁÁ±¥…Ñ¥½¹Ìœ°€ÍÑÕ‘¥½½Õµ•¹ÑÌœ°€‘•±¥Ù•ÉåA…­…•Ìœ°€µ½¹¥Ñ½É	…Í•±¥¹•Ìœ°€µ½‘•É¹¥é…Ñ¥½¹•¥Í¥½¹Ìœ°€‰±Õ•ÁÉ¥¹ÑÌœ°€…ÁÁÉ½Ù…±I•Í½ÕÉ•Ìœ°€½µµ…¹‘Ñ¥Ù¥Ñät¹•Ù•Éä¡­•ä€ôøÉÉ…ä¹¥ÍÉÉ…ä¡É½İm­•åt¤¤4(€€€ñğ€…É½Ü¹…ÍÍ•ÍÍAÉ½µ½Ñ¥½¸ñğÑåÁ•½˜É½Ü¹…ÍÍ•ÍÍAÉ½µ½Ñ¥½¸€„ôô€½‰©•ĞœñğÉÉ…ä¹¥ÍÉÉ…ä¡É½Ü¹…ÍÍ•ÍÍAÉ½µ½Ñ¥½¸¤4(€€¤Ñ¡É½Ü¹•ÜÉÉ½È 9QIAI%M}AI=)Q%=9}%9Y1%œ¤ì4(€É•©•ÑM•¹Í¥Ñ¥Ù•AÉ½©•Ñ¥½¹¥•±‘Ì¡É½Ü¤ì4(€É•ÑÕÉ¸ÍÑÉÕÑÕÉ•‘±½¹”¡É½Ü¤…ÌÕ¹­¹½İ¸…Ì¹Ñ•ÉÁÉ¥Í•%¹Ñ•±±¥•¹•AÉ½©•Ñ¥½¸ì4)ôì4(4)•áÁ½ÉĞ½¹ÍĞ±…ÍÍ¥™åÙ¥‘•¹•¥±”€ô€¡¹…µ”èÍÑÉ¥¹œ°‰É½İÍ•É5¥µ•QåÁ”èÍÑÉ¥¹œ°Í¥é”è¹Õµ‰•È¤èÙ¥‘•¹•¥±•MÕÁÁ½ÉĞ€ôøì4(€¥˜€ …9Õµ‰•È¹¥ÍM…™•%¹Ñ••È¡Í¥é”¤ñğÍ¥é”€ğô€ÀñğÍ¥é”€ø€ÄÉ|ÀÀÁ|ÀÀÀ¤ì4(€€€É•ÑÕÉ¸ìÍÕÁÁ½ÉÑ•è™…±Í”°ÍÑ…Ñ”è€Õ¹ÍÕÁÁ½ÉÑ•œ°µ•ÍÍ…”è€M½ÕÉ•ÌµÕÍĞ½¹Ñ…¥¸‘…Ñ„…¹‰”¹¼±…É•ÈÑ¡…¸€ÄÈ5¸œôì4(€ô4(€½¹ÍĞ•áÑ•¹Í¥½¸€ô¹…µ”¹ÑÉ¥´ ¤¹Ñ½1½…±•1½İ•É…Í” ¤¹µ…Ñ  ½p¹m„µèÀ´åt¬¼¤ü¹lÁtñğ€œœì4(€½¹ÍĞ‰åáÑ•¹Í¥½¸èI•½ÉñÍÑÉ¥¹œ°MÕÁÁ½ÉÑ•‘Ù¥‘•¹•5¥µ•QåÁ”ø€ôì4(€€€€œ¹ÑáĞœè€Ñ•áĞ½Á±…¥¸œ°4(€€€€œ¹µœè€Ñ•áĞ½µ…É­‘½İ¸œ°4(€€€€œ¹µ…É­‘½İ¸œè€Ñ•áĞ½µ…É­‘½İ¸œ°4(€€€€œ¹ÍØœè€Ñ•áĞ½ÍØœ°4(€€€€œ¹ÙÑĞœè€Ñ•áĞ½ÙÑĞœ°4(€€€€œ¹ÍÉĞœè€…ÁÁ±¥…Ñ¥½¸½àµÍÕ‰É¥Àœ°4(€€€€œ¹Á‘˜œè€…ÁÁ±¥…Ñ¥½¸½Á‘˜œ°4(€€€€œ¹‘½àœè€…ÁÁ±¥…Ñ¥½¸½Ù¹¹½Á•¹áµ±™½Éµ…ÑÌµ½™™¥•‘½Õµ•¹Ğ¹İ½É‘ÁÉ½•ÍÍ¥¹µ°¹‘½Õµ•¹Ğœ°4(€ôì4(€½¹ÍĞµ¥µ•QåÁ”€ô‰åáÑ•¹Í¥½¹m•áÑ•¹Í¥½¹t4(€€€ñğ€¡¥ÍMÕÁÁ½ÉÑ•‘Ù¥‘•¹•5¥µ•QåÁ”¡‰É½İÍ•É5¥µ•QåÁ”¤€ü‰É½İÍ•É5¥µ•QåÁ”€èÕ¹‘•™¥¹•¤ì4(€¥˜€ …µ¥µ•QåÁ”¤É•ÑÕÉ¸ìÍÕÁÁ½ÉÑ•è™…±Í”°ÍÑ…Ñ”è€Õ¹ÍÕÁÁ½ÉÑ•œ°µ•ÍÍ…”è€Q¡¥Ì™½Éµ…Ğ¥Ì¹½ĞÍÕÁÁ½ÉÑ•¸UÍ”QaP°5…É­‘½İ¸°MX°YQP½MIP°„Ñ•áĞA°½È=`¸œôì4(€¥˜€¡µ¥µ•QåÁ”€ôôô€…ÁÁ±¥…Ñ¥½¸½Á‘˜œ¤ì4(€€€É•ÑÕÉ¸ìÍÕÁÁ½ÉÑ•èÑÉÕ”°µ¥µ•QåÁ”°ÍÑ…Ñ”è€Ñ•áÑ}Á‘™}É•ÅÕ¥É•Í}Ñ•áÑ}±…å•Èœ°µ•ÍÍ…”è€Q•áĞAÌ…É”ÍÕÁÁ½ÉÑ•¸M…¹¹•AÌ¹••=H°İ¡¥ ¥Ì¹½Ğ…Ù…¥±…‰±”¥¸Ñ¡¥ÌÙ•ÉÑ¥…°¸œôì4(€ô4(€¥˜€¡µ¥µ•QåÁ”€ôôô€…ÁÁ±¥…Ñ¥½¸½Ù¹¹½Á•¹áµ±™½Éµ…ÑÌµ½™™¥•‘½Õµ•¹Ğ¹İ½É‘ÁÉ½•ÍÍ¥¹µ°¹‘½Õµ•¹Ğœ¤ì4(€€€É•ÑÕÉ¸ìÍÕÁÁ½ÉÑ•èÑÉÕ”°µ¥µ•QåÁ”°ÍÑ…Ñ”è€‘½á}Ñ•áĞœ°µ•ÍÍ…”è€=`Ñ•áĞ¥Ì•áÑÉ…Ñ•Í•ÉÙ•ÈµÍ¥‘”ì•µ‰•‘‘•¥µ…•Ì…¹=H…É”¹½ĞÁÉ½•ÍÍ•¸œôì4(€ô4(€É•ÑÕÉ¸ìÍÕÁÁ½ÉÑ•èÑÉÕ”°µ¥µ•QåÁ”°ÍÑ…Ñ”è€¹…Ñ¥Ù•}Ñ•áĞœ°µ•ÍÍ…”è€Q¡¥ÌÑ•áĞµ½É¥•¹Ñ•™½Éµ…Ğ¥ÌÍÕÁÁ½ÉÑ•™½È‰½Õ¹‘•Í•ÉÙ•È•áÑÉ…Ñ¥½¸¸œôì4)ôì4(4)½¹ÍĞÉ•ÅÕ¥É•AÉ½©•Ñ¥½¹%€ô€¡Ù…±Õ”èÍÑÉ¥¹œ¤€ôøì4(€¥˜€ …ÁÉ½©•Ñ¥½¹UÕ¥¹Ñ•ÍĞ¡Ù…±Õ”¤¤Ñ¡É½Ü¹•ÜÉÉ½È 9QIAI%M}M1Q=I}%9Y1%œ¤ì4(€É•ÑÕÉ¸Ù…±Õ”ì4)ôì4(4(¼¨¨M•±•Ñ½Èµ½¹±äµÕÑ…Ñ¥½¸Á…å±½…‘Ì¹•Ù•È…ÉÉä…ÕÑ¡½É¥Ñ…Ñ¥Ù”¡…Í¡•Ì½È¥µµÕÑ…‰±”Ù•ÉÍ¥½¹Ì¸€¨¼4)•áÁ½ÉĞ½¹ÍĞ‰Õ¥±‘¹Ñ•ÉÁÉ¥Í•M•±•Ñ½ÉA…å±½…‘Ì€ôì4(€•Ù¥‘•¹•áÑÉ…Ñ¥½¸¡Í½ÕÉ•%èÍÑÉ¥¹œ¤ì4(€€€É•ÑÕÉ¸ìÍ½ÕÉ•%èÉ•ÅÕ¥É•AÉ½©•Ñ¥½¹%¡Í½ÕÉ•%¤ôì4(€ô°4(€µ½‘•É¹¥é…Ñ¥½¸¡…ÁÁ±¥…Ñ¥½¹%èÍÑÉ¥¹œ¤ì4(€€€É•ÑÕÉ¸ì…ÁÁ±¥…Ñ¥½¹%èÉ•ÅÕ¥É•AÉ½©•Ñ¥½¹%¡…ÁÁ±¥…Ñ¥½¹%¤ôì4(€ô°4(€ÍÑÕ‘¥½!…¹‘½™˜¡ÍÑÕ‘¥½½Õµ•¹Ñ%èÍÑÉ¥¹œ¤ì4(€€€É•ÑÕÉ¸ìÍÑÕ‘¥½½Õµ•¹Ñ%èÉ•ÅÕ¥É•AÉ½©•Ñ¥½¹%¡ÍÑÕ‘¥½½Õµ•¹Ñ%¤ôì4(€ô°4(€µ½¹¥Ñ½É	…Í•±¥¹”¡İ½É­A…­…•%èÍÑÉ¥¹œ¤ì4(€€€É•ÑÕÉ¸ìİ½É­A…­…•%èÉ•ÅÕ¥É•AÉ½©•Ñ¥½¹%¡İ½É­A…­…•%¤ôì4(€ô°4(€…ÍÍ•ÍÍAÉ½µ½Ñ¥½¸¡Í½ÕÉ•%èÍÑÉ¥¹œ°…ÍÍ•ÍÍÉ…™Ñ%èÍÑÉ¥¹œ°…¹‘¥‘…Ñ•%‘ÌèÍÑÉ¥¹mt¤ì4(€€€¥˜€ …ÉÉ…ä¹¥ÍÉÉ…ä¡…¹‘¥‘…Ñ•%‘Ì¤ñğ…¹‘¥‘…Ñ•%‘Ì¹±•¹Ñ €ğ€Äñğ…¹‘¥‘…Ñ•%‘Ì¹±•¹Ñ €ø€ÄÀÀ¤Ñ¡É½Ü¹•ÜÉÉ½È 9QIAI%M}M1Q=I}%9Y1%œ¤ì4(€€€½¹ÍĞ¹½Éµ…±¥é•‘…¹‘¥‘…Ñ•Ì€ô…¹‘¥‘…Ñ•%‘Ì¹µ…À¡É•ÅÕ¥É•AÉ½©•Ñ¥½¹%¤ì4(€€€¥˜€¡¹•ÜM•Ğ¡¹½Éµ…±¥é•‘…¹‘¥‘…Ñ•Ì¤¹Í¥é”€„ôô¹½Éµ…±¥é•‘…¹‘¥‘…Ñ•Ì¹±•¹Ñ ¤Ñ¡É½Ü¹•ÜÉÉ½È 9QIAI%M}M1Q=I}%9Y1%œ¤ì4(€€€É•ÑÕÉ¸ì4(€€€€€Í½ÕÉ•%èÉ•ÅÕ¥É•AÉ½©•Ñ¥½¹%¡Í½ÕÉ•%¤°4(€€€€€…ÍÍ•ÍÍÉ…™Ñ%èÉ•ÅÕ¥É•AÉ½©•Ñ¥½¹%¡…ÍÍ•ÍÍÉ…™Ñ%¤°4(€€€€€…¹‘¥‘…Ñ•%‘Ìè¹½Éµ…±¥é•‘…¹‘¥‘…Ñ•Ì°4(€€€ôì4(€ô°4)ôì4(4)•áÁ½ÉĞ½¹ÍĞ¥ÍMÕÁÁ½ÉÑ•‘Ù¥‘•¹•5¥µ•QåÁ”€ô€¡Ù…±Õ”èÍÑÉ¥¹œ¤èÙ…±Õ”¥ÌMÕÁÁ½ÉÑ•‘Ù¥‘•¹•5¥µ•QåÁ”€ôø€ 4(€MUAA=IQ}Y%9}5%5}QeAL¹¥¹±Õ‘•Ì¡Ù…±Õ”…ÌMÕÁÁ½ÉÑ•‘Ù¥‘•¹•5¥µ•QåÁ”¤4(¤ì4(4)•áÁ½ÉĞ½¹ÍĞ‰Õ¥±‘Ù¥‘•¹•…¹‘¥‘…Ñ”€ô€¡¥¹ÁÕĞè=µ¥Ğñ¹Ñ•ÉÁÉ¥Í•Ù¥‘•¹•…¹‘¥‘…Ñ”°€•á•ÉÁÑ!…Í œğ€•‘¥Ñ½Õ¹Ğœø¤è¹Ñ•ÉÁÉ¥Í•Ù¥‘•¹•…¹‘¥‘…Ñ”€ôøì4(€½¹ÍĞÍ…™•á•ÉÁĞ€ô¥¹ÁÕĞ¹Í…™•á•ÉÁĞ€üÍ…¹¥Ñ¥é•Ù¥‘•¹•á•ÉÁĞ¡¥¹ÁÕĞ¹Í…™•á•ÉÁĞ¤€èÕ¹‘•™¥¹•ì4(€É•ÑÕÉ¸ì4(€€€€¸¸¹¥¹ÁÕĞ°4(€€€Í…™•á•ÉÁĞ°4(€€€•á•ÉÁÑ!…Í èÍÑ…‰±•¥¹•ÉÁÉ¥¹Ğ¡€‘í¥¹ÁÕĞ¹Í½ÕÉ•Y•ÉÍ¥½¹%‘ôè‘í¥¹ÁÕĞ¹Í½ÕÉ•1½…Ñ½Éôè‘íÍ…™•á•ÉÁĞñğ¥¹ÁÕĞ¹Ù…±Õ•õ€¤°4(€€€•‘¥Ñ½Õ¹Ğè€À°4(€ôì4)ôì4(4)•áÁ½ÉĞ½¹ÍĞ•Ù…±Õ…Ñ•5½‘•É¹¥é…Ñ¥½¹•¥Í¥½¸€ô€¡¥¹ÁÕĞèì4(€…ÍÍ•ÍÍµ•¹Ñ%èÍÑÉ¥¹œì4(€…ÍÍ•ÍÍµ•¹ÑY•ÉÍ¥½¸èÍÑÉ¥¹œì4(€™…Ñ½ÉÌè5½‘•É¹¥é…Ñ¥½¹…Ñ½ÉÌì4)ô¤è5½‘•É¹¥é…Ñ¥½¹•¥Í¥½¸€ôøì4(€½¹ÍĞ‰±½­•ÉÌèÍÑÉ¥¹mt€ômtì4(€½¹ÍĞ½¹™±¥ÑÌèÍÑÉ¥¹mt€ômtì4(€½¹ÍĞÕ¹­¹½İ¹!¥¡%µÁ…Ñ…Ñ½ÉÌèÉÉ…äñ­•å½˜5½‘•É¹¥é…Ñ¥½¹…Ñ½ÉÌø€ôl4(€€€€É¥Ñ¥…±¥Ñäœ°4(€€€€Í•ÕÉ¥Ñå½µÁ±¥…¹”œ°4(€€€€‘…Ñ…A½ÉÑ…‰¥±¥Ñäœ°4(€€€€‘•Á•¹‘•¹åI¥Í¬œ°4(€tì4(4(€Õ¹­¹½İ¹!¥¡%µÁ…Ñ…Ñ½ÉÌ¹™½É…  ¡™…Ñ½È¤€ôøì4(€€€¥˜€¡¥¹ÁÕĞ¹™…Ñ½ÉÍm™…Ñ½Ét€ôôô€Õ¹­¹½İ¸œ¤‰±½­•ÉÌ¹ÁÕÍ ¡€‘í™…Ñ½Éõ}•Ù¥‘•¹•}É•ÅÕ¥É•‘€¤ì4(€ô¤ì4(4(€¥˜€¡¥¹ÁÕĞ¹™…Ñ½ÉÌ¹Í•ÕÉ¥Ñå½µÁ±¥…¹”€ôôô€¡¥ œ€˜˜¥¹ÁÕĞ¹™…Ñ½ÉÌ¹½Á•É…Ñ¥¹I¥Í¬€ôôô€¡¥ œ¤ì4(€€€½¹™±¥ÑÌ¹ÁÕÍ  Í•ÕÉ¥Ñå}…¹‘}½Á•É…Ñ¥¹}É¥Í­}É•ÅÕ¥É•}½Ù•É¹…¹•}É•Ù¥•Üœ¤ì4(€ô4(€¥˜€¡¥¹ÁÕĞ¹™…Ñ½ÉÌ¹¡…¹•™™½ÉĞ€ôôô€¡¥ œ€˜˜¥¹ÁÕĞ¹™…Ñ½ÉÌ¹Ñ¥µ•Q½Y…±Õ”€ôôô€¡¥ œ¤ì4(€€€½¹™±¥ÑÌ¹ÁÕÍ  ¡…¹•}•™™½ÉÑ}…¹‘}Ñ¥µ•}Ñ½}Ù…±Õ•}½¹™±¥Ğœ¤ì4(€ô4(4(€¥˜€¡‰±½­•ÉÌ¹±•¹Ñ €ø€À¤ì4(€€€É•ÑÕÉ¸ì4(€€€€€…ÍÍ•ÍÍµ•¹Ñ%è¥¹ÁÕĞ¹…ÍÍ•ÍÍµ•¹Ñ%°4(€€€€€…ÍÍ•ÍÍµ•¹ÑY•ÉÍ¥½¸è¥¹ÁÕĞ¹…ÍÍ•ÍÍµ•¹ÑY•ÉÍ¥½¸°4(€€€€€µ½‘•±Y•ÉÍ¥½¸è5=I9%iQ%=9}5=1}YIM%=8°4(€€€€€ÁÉ¥µ…Éå¥ÍÁ½Í¥Ñ¥½¸è€¥¹ÍÕ™™¥¥•¹Ñ}•Ù¥‘•¹”œ°4(€€€€€…±Ñ•É¹…Ñ¥Ù•¥ÍÁ½Í¥Ñ¥½¸è€‰±½­•œ°4(€€€€€•±¥¥‰±•¥ÍÁ½Í¥Ñ¥½¹Ìèl¥¹ÍÕ™™¥¥•¹Ñ}•Ù¥‘•¹”œ°€‰±½­•t°4(€€€€€™…Ñ½É	…¹‘Ìèì€¸¸¹¥¹ÁÕĞ¹™…Ñ½ÉÌô°4(€€€€€‰±½­•ÉÌ°4(€€€€€½¹™±¥ÑÌ°4(€€€€€É•ÅÕ¥É•Í!Õµ…¹ÁÁÉ½Ù…°èÑÉÕ”°4(€€€€€…¥I…Ñ¥½¹…±•MÑ…ÑÕÌè€¹½Ñ}É•ÅÕ•ÍÑ•œ°4(€€€ôì4(€ô4(4(€±•ĞÁÉ¥µ…Éå¥ÍÁ½Í¥Ñ¥½¸è5½‘•É¹¥é…Ñ¥½¹¥ÍÁ½Í¥Ñ¥½¸€ô€½ÁÑ¥µ¥é”œì4(€±•Ğ…±Ñ•É¹…Ñ¥Ù•¥ÍÁ½Í¥Ñ¥½¸è5½‘•É¹¥é…Ñ¥½¹¥ÍÁ½Í¥Ñ¥½¸€ô€É•Ñ…¥¸œì4(4(€¥˜€¡¥¹ÁÕĞ¹™…Ñ½ÉÌ¹É¥Ñ¥…±¥Ñä€ôôô€±½Üœ€˜˜¥¹ÁÕĞ¹™…Ñ½ÉÌ¹½Á•É…Ñ¥¹I¥Í¬€ôôô€¡¥ œ¤ì4(€€€ÁÉ¥µ…Éå¥ÍÁ½Í¥Ñ¥½¸€ô€É•Ñ¥É”œì4(€€€…±Ñ•É¹…Ñ¥Ù•¥ÍÁ½Í¥Ñ¥½¸€ô€É•Ñ…¥¸œì4(€ô•±Í”¥˜€¡¥¹ÁÕĞ¹™…Ñ½ÉÌ¹Ù•¹‘½É1½­%¸€ôôô€¡¥ œ€˜˜¥¹ÁÕĞ¹™…Ñ½ÉÌ¹±½Õ‘¥Ğ€ôôô€±½Üœ¤ì4(€€€ÁÉ¥µ…Éå¥ÍÁ½Í¥Ñ¥½¸€ô€É•Á±…Ñ™½É´œì4(€€€…±Ñ•É¹…Ñ¥Ù•¥ÍÁ½Í¥Ñ¥½¸€ô€É•™…Ñ½Èœì4(€ô•±Í”¥˜€¡¥¹ÁÕĞ¹™…Ñ½ÉÌ¹Ñ•¡!•…±Ñ €ôôô€±½Üœ€˜˜¥¹ÁÕĞ¹™…Ñ½ÉÌ¹µ…¥¹Ñ…¥¹…‰¥±¥Ñä€ôôô€±½Üœ¤ì4(€€€ÁÉ¥µ…Éå¥ÍÁ½Í¥Ñ¥½¸€ô¥¹ÁÕĞ¹™…Ñ½ÉÌ¹¡…¹•™™½ÉĞ€ôôô€¡¥ œ€ü€É•Á±…”œ€è€É•‰Õ¥±œì4(€€€…±Ñ•É¹…Ñ¥Ù•¥ÍÁ½Í¥Ñ¥½¸€ô€É•™…Ñ½Èœì4(€ô•±Í”¥˜€¡¥¹ÁÕĞ¹™…Ñ½ÉÌ¹…Á¥%¹Ñ•É…Ñ¥½¸€ôôô€¡¥ œ€˜˜¥¹ÁÕĞ¹™…Ñ½ÉÌ¹…É¡¥Ñ•ÑÕÉ”€„ôô€±½Üœ¤ì4(€€€ÁÉ¥µ…Éå¥ÍÁ½Í¥Ñ¥½¸€ô€…Á¥}•¹…‰±•}İÉ…Àœì4(€€€…±Ñ•É¹…Ñ¥Ù•¥ÍÁ½Í¥Ñ¥½¸€ô€¥¹Ñ•É…Ñ”œì4(€ô•±Í”¥˜€ 4(€€€¥¹ÁÕĞ¹™…Ñ½ÉÌ¹™¥Ğ€ôôô€¡¥ œ4(€€€€˜˜¥¹ÁÕĞ¹™…Ñ½ÉÌ¹…É¡¥Ñ•ÑÕÉ”€ôôô€¡¥ œ4(€€€€˜˜¥¹ÁÕĞ¹™…Ñ½ÉÌ¹µ…¥¹Ñ…¥¹…‰¥±¥Ñä€„ôô€±½Üœ4(€€€€˜˜¥¹ÁÕĞ¹™…Ñ½ÉÌ¹½Á•É…Ñ¥¹I¥Í¬€„ôô€¡¥ œ4(€€¤ì4(€€€ÁÉ¥µ…Éå¥ÍÁ½Í¥Ñ¥½¸€ô¥¹ÁÕĞ¹™…Ñ½ÉÌ¹…•¹Ñ¥Ğ€ôôô€¡¥ œ€ü€…ÍÍ•µ‰±”œ€è€…ÕÑ½µ…Ñ•}…É½Õ¹œì4(€€€…±Ñ•É¹…Ñ¥Ù•¥ÍÁ½Í¥Ñ¥½¸€ô€…Á¥}•¹…‰±•}İÉ…Àœì4(€ô•±Í”¥˜€¡¥¹ÁÕĞ¹™…Ñ½ÉÌ¹…Á¥%¹Ñ•É…Ñ¥½¸€ôôô€µ•‘¥Õ´œ€˜˜¥¹ÁÕĞ¹™…Ñ½ÉÌ¹¡…¹•™™½ÉĞ€ôôô€±½Üœ¤ì4(€€€ÁÉ¥µ…Éå¥ÍÁ½Í¥Ñ¥½¸€ô€¥¹Ñ•É…Ñ”œì4(€€€…±Ñ•É¹…Ñ¥Ù•¥ÍÁ½Í¥Ñ¥½¸€ô€½ÁÑ¥µ¥é”œì4(€ô•±Í”¥˜€¡¥¹ÁÕĞ¹™…Ñ½ÉÌ¹Ñ•¡!•…±Ñ €ôôô€¡¥ œ€˜˜¥¹ÁÕĞ¹™…Ñ½ÉÌ¹µ…¥¹Ñ…¥¹…‰¥±¥Ñä€ôôô€¡¥ œ¤ì4(€€€ÁÉ¥µ…Éå¥ÍÁ½Í¥Ñ¥½¸€ô€É•Ñ…¥¸œì4(€€€…±Ñ•É¹…Ñ¥Ù•¥ÍÁ½Í¥Ñ¥½¸€ô€½ÁÑ¥µ¥é”œì4(€ô4(4(€½¹ÍĞ•±¥¥‰±•¥ÍÁ½Í¥Ñ¥½¹Ì€ôl¸¸¹¹•ÜM•Ğñ5½‘•É¹¥é…Ñ¥½¹¥ÍÁ½Í¥Ñ¥½¸ø¡l4(€€€ÁÉ¥µ…Éå¥ÍÁ½Í¥Ñ¥½¸°4(€€€…±Ñ•É¹…Ñ¥Ù•¥ÍÁ½Í¥Ñ¥½¸°4(€€€€½ÁÑ¥µ¥é”œ°4(€€€€É•Ñ…¥¸œ°4(€t¥tì4(4(€É•ÑÕÉ¸ì4(€€€…ÍÍ•ÍÍµ•¹Ñ%è¥¹ÁÕĞ¹…ÍÍ•ÍÍµ•¹Ñ%°4(€€€…ÍÍ•ÍÍµ•¹ÑY•ÉÍ¥½¸è¥¹ÁÕĞ¹…ÍÍ•ÍÍµ•¹ÑY•ÉÍ¥½¸°4(€€€µ½‘•±Y•ÉÍ¥½¸è5=I9%iQ%=9}5=1}YIM%=8°4(€€€ÁÉ¥µ…Éå¥ÍÁ½Í¥Ñ¥½¸°4(€€€…±Ñ•É¹…Ñ¥Ù•¥ÍÁ½Í¥Ñ¥½¸°4(€€€•±¥¥‰±•¥ÍÁ½Í¥Ñ¥½¹Ì°4(€€€™…Ñ½É	…¹‘Ìèì€¸¸¹¥¹ÁÕĞ¹™…Ñ½ÉÌô°4(€€€‰±½­•ÉÌ°4(€€€½¹™±¥ÑÌ°4(€€€É•ÅÕ¥É•Í!Õµ…¹ÁÁÉ½Ù…°èÑÉÕ”°4(€€€…¥I…Ñ¥½¹…±•MÑ…ÑÕÌè€¹½Ñ}É•ÅÕ•ÍÑ•œ°4(€ôì4)ôì4(4)•áÁ½ÉĞ½¹ÍĞ‰Õ¥±‘•±¥Ù•Éå]½É­A…­…•É…™Ğ€ô€¡¥¹ÁÕĞèì4(€Á…­…•%èÍÑÉ¥¹œì4(€…ÁÁÉ½Ù•‘½Õµ•¹ĞèMÑÕ‘¥½ÁÁÉ½Ù•‘½Õµ•¹ÑI•˜ì4(€ÕÉÉ•¹ÑÁÁÉ½Ù•‘½Õµ•¹ĞèMÑÕ‘¥½ÁÁÉ½Ù•‘½Õµ•¹ÑI•˜ì4(€Í½ÕÉ•M•Ñ¥½¹ÌèÉÉ…äñì±½…Ñ½ÈèÍÑÉ¥¹œìÑ¥Ñ±”èÍÑÉ¥¹œìÍÕµµ…ÉäèÍÑÉ¥¹œì…•ÁÑ…¹•É¥Ñ•É¥„üèÍÑÉ¥¹mtôøì4)ô¤è•±¥Ù•Éå]½É­A…­…•É…™Ğ€ôøì4(€½¹ÍĞÍÑ…±”€ô¥¹ÁÕĞ¹…ÁÁÉ½Ù•‘½Õµ•¹Ğ¹Ù•ÉÍ¥½¸€„ôô¥¹ÁÕĞ¹ÕÉÉ•¹ÑÁÁÉ½Ù•‘½Õµ•¹Ğ¹Ù•ÉÍ¥½¸4(€€€ñğ¥¹ÁÕĞ¹…ÁÁÉ½Ù•‘½Õµ•¹Ğ¹½¹Ñ•¹Ñ!…Í €„ôô¥¹ÁÕĞ¹ÕÉÉ•¹ÑÁÁÉ½Ù•‘½Õµ•¹Ğ¹½¹Ñ•¹Ñ!…Í 4(€€€ñğ¥¹ÁÕĞ¹…ÁÁÉ½Ù•‘½Õµ•¹Ğ¹‘½Õµ•¹Ñ%€„ôô¥¹ÁÕĞ¹ÕÉÉ•¹ÑÁÁÉ½Ù•‘½Õµ•¹Ğ¹‘½Õµ•¹Ñ%4(€€€ñğ¥¹ÁÕĞ¹ÕÉÉ•¹ÑÁÁÉ½Ù•‘½Õµ•¹Ğ¹±¥™•å±”€„ôô€…ÁÁÉ½Ù•œì4(€½¹ÍĞ¥‘•µÁ½Ñ•¹å-•ä€ôÍÑ…‰±•¥¹•ÉÁÉ¥¹Ğ¡l4(€€€¥¹ÁÕĞ¹Á…­…•%°4(€€€¥¹ÁÕĞ¹…ÁÁÉ½Ù•‘½Õµ•¹Ğ¹‘½Õµ•¹Ñ%°4(€€€¥¹ÁÕĞ¹…ÁÁÉ½Ù•‘½Õµ•¹Ğ¹Ù•ÉÍ¥½¸°4(€€€¥¹ÁÕĞ¹…ÁÁÉ½Ù•‘½Õµ•¹Ğ¹½¹Ñ•¹Ñ!…Í °4(€t¹©½¥¸ œèœ¤¤ì4(4(€¥˜€¡ÍÑ…±”¤ì4(€€€É•ÑÕÉ¸ì4(€€€€€¥‘•µÁ½Ñ•¹å-•ä°4(€€€€€Í½ÕÉ”è¥¹ÁÕĞ¹…ÁÁÉ½Ù•‘½Õµ•¹Ğ°4(€€€€€ÍÑ…ÑÕÌè€ÍÑ…±”œ°4(€€€€€¥Ñ•µÌèmt°4(€€€€€‰±½­•ÉÌèlÍÑÕ‘¥½}…ÁÁÉ½Ù•‘}Ù•ÉÍ¥½¹}¡…¹•‘}½É}µ¥ÍÍ¥¹œt°4(€€€€€É•ÅÕ¥É•Í!Õµ…¹I•Ù¥•ÜèÑÉÕ”°4(€€€€€…¹AÕ‰±¥Í è™…±Í”°4(€€€ôì4(€ô4(4(€½¹ÍĞ¥Ñ•µÌ€ô¥¹ÁÕĞ¹Í½ÕÉ•M•Ñ¥½¹Ì¹µ…À ¡Í•Ñ¥½¸°¥¹‘•à¤è•±¥Ù•Éå]½É­A…­…•%Ñ•´€ôø€¡ì4(€€€¥è€‘í¥¹ÁÕĞ¹Á…­…•%‘ôµ¥Ñ•´´‘í¥¹‘•à€¬€Åõ€°4(€€€¥Ñ•µQåÁ”è¥¹‘•à€ôôô€À€ü€Á¥Œœ€è€MÑ½Éäœ°4(€€€Ñ¥Ñ±”èÍ•Ñ¥½¸¹Ñ¥Ñ±”°4(€€€‘•ÍÉ¥ÁÑ¥½¸èÍ•Ñ¥½¸¹ÍÕµµ…Éä°4(€€€Á…É•¹Ñ%è¥¹‘•à€ôôô€À€üÕ¹‘•™¥¹•€è€‘í¥¹ÁÕĞ¹Á…­…•%‘ôµ¥Ñ•´´Å€°4(€€€…•ÁÑ…¹•É¥Ñ•É¥„èÍ•Ñ¥½¸¹…•ÁÑ…¹•É¥Ñ•É¥„ñğmt°4(€€€¹½¹Õ¹Ñ¥½¹…±I•ÅÕ¥É•µ•¹ÑÌèmt°4(€€€Í½ÕÉ•M•Ñ¥½¹1½…Ñ½ÈèÍ•Ñ¥½¸¹±½…Ñ½È°4(€€€Í½ÕÉ•½Õµ•¹Ñ%è¥¹ÁÕĞ¹…ÁÁÉ½Ù•‘½Õµ•¹Ğ¹‘½Õµ•¹Ñ%°4(€€€Í½ÕÉ•½Õµ•¹ÑY•ÉÍ¥½¸è¥¹ÁÕĞ¹…ÁÁÉ½Ù•‘½Õµ•¹Ğ¹Ù•ÉÍ¥½¸°4(€€€Í½ÕÉ•½Õµ•¹Ñ!…Í è¥¹ÁÕĞ¹…ÁÁÉ½Ù•‘½Õµ•¹Ğ¹½¹Ñ•¹Ñ!…Í °4(€ô¤¤ì4(4(€É•ÑÕÉ¸ì4(€€€¥‘•µÁ½Ñ•¹å-•ä°4(€€€Í½ÕÉ”è¥¹ÁÕĞ¹…ÁÁÉ½Ù•‘½Õµ•¹Ğ°4(€€€ÍÑ…ÑÕÌè¥Ñ•µÌ¹±•¹Ñ €ü€‘É…™Ğœ€è€‰±½­•œ°4(€€€¥Ñ•µÌ°4(€€€‰±½­•ÉÌè¥Ñ•µÌ¹±•¹Ñ €ümt€èl…ÁÁÉ½Ù•‘}ÍÑÕ‘¥½}‘½Õµ•¹Ñ}¡…Í}¹½}¡…¹‘½™™}Í•Ñ¥½¹Ìt°4(€€€É•ÅÕ¥É•Í!Õµ…¹I•Ù¥•ÜèÑÉÕ”°4(€€€…¹AÕ‰±¥Í è™…±Í”°4(€ôì4)ôì4(4)•áÁ½ÉĞ½¹ÍĞ‰Õ¥±‘5½¹¥Ñ½É	…Í•±¥¹”€ô€¡¥¹ÁÕĞèì4(€¥èÍÑÉ¥¹œì4(€İ½É­A…­…•%èÍÑÉ¥¹œì4(€İ½É­A…­…”è•±¥Ù•Éå]½É­A…­…•É…™Ğì4(€…ÁÁÉ½Ù•‘%Ñ•µ%‘ÌèÍÑÉ¥¹mtì4)ô¤è5½¹¥Ñ½É	…Í•±¥¹”€ôøì4(€½¹ÍĞ½µÁ±•Ñ”€ô¥¹ÁÕĞ¹İ½É­A…­…”¹ÍÑ…ÑÕÌ€ôôô€‘É…™Ğœ4(€€€€˜˜¥¹ÁÕĞ¹İ½É­A…­…”¹¥Ñ•µÌ¹±•¹Ñ €ø€À4(€€€€˜˜¥¹ÁÕĞ¹İ½É­A…­…”¹‰±½­•ÉÌ¹±•¹Ñ €ôôô€À4(€€€€˜˜¥¹ÁÕĞ¹…ÁÁÉ½Ù•‘%Ñ•µ%‘Ì¹±•¹Ñ €ôôô¥¹ÁÕĞ¹İ½É­A…­…”¹¥Ñ•µÌ¹±•¹Ñ 4(€€€€˜˜¹•ÜM•Ğ¡¥¹ÁÕĞ¹…ÁÁÉ½Ù•‘%Ñ•µ%‘Ì¤¹Í¥é”€ôôô¥¹ÁÕĞ¹İ½É­A…­…”¹¥Ñ•µÌ¹±•¹Ñ 4(€€€€˜˜¥¹ÁÕĞ¹…ÁÁÉ½Ù•‘%Ñ•µ%‘Ì¹•Ù•Éä¡¥Ñ•µ%€ôø¥¹ÁÕĞ¹İ½É­A…­…”¹¥Ñ•µÌ¹Í½µ”¡¥Ñ•´€ôø¥Ñ•´¹¥€ôôô¥Ñ•µ%¤¤ì4(4(€É•ÑÕÉ¸ì4(€€€¥è¥¹ÁÕĞ¹¥°4(€€€İ½É­A…­…•%è¥¹ÁÕĞ¹İ½É­A…­…•%°4(€€€Í½ÕÉ•½Õµ•¹Ñ%è¥¹ÁÕĞ¹İ½É­A…­…”¹Í½ÕÉ”¹‘½Õµ•¹Ñ%°4(€€€Í½ÕÉ•½Õµ•¹ÑY•ÉÍ¥½¸è¥¹ÁÕĞ¹İ½É­A…­…”¹Í½ÕÉ”¹Ù•ÉÍ¥½¸°4(€€€Í½ÕÉ•½Õµ•¹Ñ!…Í è¥¹ÁÕĞ¹İ½É­A…­…”¹Í½ÕÉ”¹½¹Ñ•¹Ñ!…Í °4(€€€ÍÑ…ÑÕÌè½µÁ±•Ñ”€ü€…ÁÁÉ½Ù…±}É•ÅÕ¥É•œ€è€‰±½­•œ°4(€€€…ÁÁÉ½Ù•‘%Ñ•µ%‘Ìèl¸¸¹¥¹ÁÕĞ¹…ÁÁÉ½Ù•‘%Ñ•µ%‘Ít°4(€€€µ¥±•ÍÑ½¹•Ìè¥¹ÁÕĞ¹İ½É­A…­…”¹¥Ñ•µÌ¹™¥±Ñ•È¡¥Ñ•´€ôø¥Ñ•´¹¥Ñ•µQåÁ”€ôôô€5¥±•ÍÑ½¹”œ¤¹µ…À¡¥Ñ•´€ôø¥Ñ•´¹Ñ¥Ñ±”¤°4(€€€‘•Á•¹‘•¹¥•Ìè¥¹ÁÕĞ¹İ½É­A…­…”¹¥Ñ•µÌ¹™¥±Ñ•È¡¥Ñ•´€ôø¥Ñ•´¹¥Ñ•µQåÁ”€ôôô€•Á•¹‘•¹äœ¤¹µ…À¡¥Ñ•´€ôø¥Ñ•´¹Ñ¥Ñ±”¤°4(€€€‰±½­•ÉÌè½µÁ±•Ñ”€ümt€èlİ½É­}Á…­…•}É•ÅÕ¥É•Í}¡Õµ…¹}É•Ù¥•İ}‰•™½É•}µ½¹¥Ñ½É}‰…Í•±¥¹”t°4(€€€É¥Í­Ìè¥¹ÁÕĞ¹İ½É­A…­…”¹¥Ñ•µÌ¹™¥±Ñ•È¡¥Ñ•´€ôø¥Ñ•´¹¥Ñ•µQåÁ”€ôôô€I¥Í¬œ¤¹µ…À¡¥Ñ•´€ôø¥Ñ•´¹Ñ¥Ñ±”¤°4(€€€É•…‘¥¹•ÍÌè½µÁ±•Ñ”€ü€É•Ù¥•İ}É•ÅÕ¥É•œ€è€¹½Ñ}É•…‘äœ°4(€€€±¥¹•…•½µÁ±•Ñ”è½µÁ±•Ñ”°4(€€€±¥Ù•Q•±•µ•ÑÉå½¹¹•Ñ•è™…±Í”°4(€ôì4)ôì4(4)•áÁ½ÉĞ½¹ÍĞ‰Õ¥±‘ÍÍ•µ‰±•	±Õ•ÁÉ¥¹ÑÉ…™Ğ€ô€¡¥¹ÁÕĞèì4(€‰±Õ•ÁÉ¥¹Ñ%èÍÑÉ¥¹œì4(€µ½‘•É¹¥é…Ñ¥½¹•¥Í¥½¹%èÍÑÉ¥¹œì4(€‘¥ÍÁ½Í¥Ñ¥½¸è5½‘•É¹¥é…Ñ¥½¹¥ÍÁ½Í¥Ñ¥½¸ì4(€¹…µ”èÍÑÉ¥¹œì4)ô¤èÍÍ•µ‰±•	±Õ•ÁÉ¥¹ÑÉ…™Ğ€ôøì4(€¥˜€ …MM5	1}1%%	1}%MA=M%Q%=9L¹¥¹±Õ‘•Ì¡¥¹ÁÕĞ¹‘¥ÍÁ½Í¥Ñ¥½¸¤¤ì4(€€€Ñ¡É½Ü¹•ÜÉÉ½È MM5	1}%MA=M%Q%=9}9=Q}1%%	1œ¤ì4(€ô4(4(€½¹ÍĞ½µÁ½¹•¹ÑÌèÍÍ•µ‰±•	±Õ•ÁÉ¥¹Ñ½µÁ½¹•¹Ñmt€ôMM5	1}=5A=99Q}Q1=¹µ…À ¡ÑåÁ”°¥¹‘•à¤€ôø€¡ì4(€€€¥è€‘í¥¹ÁÕĞ¹‰±Õ•ÁÉ¥¹Ñ%‘ôµ½µÁ½¹•¹Ğ´‘í¥¹‘•à€¬€Åõ€°4(€€€ÑåÁ”°4(€€€¹…µ”èÑåÁ”°4(€€€‘•ÍÉ¥ÁÑ¥½¸èÑåÁ”€ôôô€•¹ĞQ½½±Ìœ4(€€€€€€ü€=ÁÑ¥½¹…°Ñ½½°‘•™¥¹¥Ñ¥½¹ÌÉ•µ…¥¸‘¥Í…‰±•Õ¹Ñ¥°Í•Á…É…Ñ•±ä½Ù•É¹•¸œ4(€€€€€€è€‘íÑåÁ•ô‘•™¥¹¥Ñ¥½¸™½ÈÑ¡”€‘í¥¹ÁÕĞ¹¹…µ•ô‰±Õ•ÁÉ¥¹Ğ¹€°4(€€€•¹…‰±•èÑåÁ”€„ôô€•¹ĞQ½½±Ìœ°4(€€€½¹™¥ÕÉ…Ñ¥½¸èÑåÁ”€ôôô€•¹ĞQ½½±Ìœ€üì•¹…‰±•‘	å•™…Õ±Ğè™…±Í”ô€èíô°4(€ô¤¤ì4(4(€½¹ÍĞÉ•…‘…‰±•½Õµ•¹Ğ€ôl4(€€€€Œ€‘í¥¹ÁÕĞ¹¹…µ•õ€°4(€€€€œœ°4(€€€5½‘•É¹¥é…Ñ¥½¸‘¥ÍÁ½Í¥Ñ¥½¸è€‘í¥¹ÁÕĞ¹‘¥ÍÁ½Í¥Ñ¥½¹õ€°4(€€€•¥Í¥½¸è€‘í¥¹ÁÕĞ¹µ½‘•É¹¥é…Ñ¥½¹•¥Í¥½¹%‘õ€°4(€€€€œœ°4(€€€€Q¡¥Ì¥Ì„½Ù•É¹•A¡…Í”€Ä‰±Õ•ÁÉ¥¹Ğ‘É…™Ğ¸%Ğ½¹Ñ…¥¹Ì¹¼½‘”°‘•Á±½åµ•¹Ğ°¥¹™É…ÍÑÉÕÑÕÉ”°É•‘•¹Ñ¥…±Ì°Í½ÕÉ”µÍåÍÑ•´…±±Ì°½ÈÉÕ¹Ñ¥µ”…•¹ÑÌ¸œ°4(€€€€œœ°4(€€€€œŒŒ½µÁ½¹•¹Ğ…Ñ…±½œœ°4(€€€€¸¸¹½µÁ½¹•¹ÑÌ¹µ…À¡½µÁ½¹•¹Ğ€ôø€´€‘í½µÁ½¹•¹Ğ¹ÑåÁ•ôè€‘í½µÁ½¹•¹Ğ¹•¹…‰±•€ü€•¹…‰±•™½È‘•Í¥¸œ€è€‘¥Í…‰±•‰ä‘•™…Õ±Ğõ€¤°4(€t¹©½¥¸ q¸œ¤ì4(4(€É•ÑÕÉ¸ì4(€€€¥è¥¹ÁÕĞ¹‰±Õ•ÁÉ¥¹Ñ%°4(€€€Í¡•µ…Y•ÉÍ¥½¸èMM5	1}	1UAI%9Q}M!5}YIM%=8°4(€€€µ½‘•É¹¥é…Ñ¥½¹•¥Í¥½¹%è¥¹ÁÕĞ¹µ½‘•É¹¥é…Ñ¥½¹•¥Í¥½¹%°4(€€€‘¥ÍÁ½Í¥Ñ¥½¸è¥¹ÁÕĞ¹‘¥ÍÁ½Í¥Ñ¥½¸°4(€€€ÍÑ…ÑÕÌè€‘É…™Ğœ°4(€€€½µÁ½¹•¹ÑÌ°4(€€€É•…‘…‰±•½Õµ•¹Ğ°4(€€€İ½É­™±½Üèl‘É…™Ğœ°€•‘¥Ğœ°€É•Ù¥•Üœ°€…ÁÁÉ½Ù…°œ°€ÁÕ‰±¥Í t°4(€€€Í…™•Ñäèì4(€€€€€½‘••¹•É…Ñ¥½¸è™…±Í”°4(€€€€€‘•Á±½åµ•¹Ğè™…±Í”°4(€€€€€¥¹™É…ÍÑÉÕÑÕÉ•¡…¹•Ìè™…±Í”°4(€€€€€É•‘•¹Ñ¥…±•ÍÌè™…±Í”°4(€€€€€Í½ÕÉ•MåÍÑ•µ…±±Ìè™…±Í”°4(€€€€€ÉÕ¹Ñ¥µ••¹ÑÌè™…±Í”°4(€€€ô°4(€€€É•ÅÕ¥É•Í!Õµ…¹ÁÁÉ½Ù…°èÑÉÕ”°4(€€€…¹AÕ‰±¥Í è™…±Í”°4(€ôì4)ôì4(4)•áÁ½ÉĞ½¹ÍĞ…ÍÍ•ÉÑ!¥¡%µÁ…ÑÁÁÉ½Ù…±M•Á…É…Ñ¥½¸€ô€¡¥¹ÁÕĞèì4(€É•…Ñ•‘	äèÍÑÉ¥¹œì4(€É•Ù¥•İ•‘	äèÍÑÉ¥¹œì4(€…ÁÁÉ½Ù•‘	äèÍÑÉ¥¹œì4)ô¤€ôøì4(€¥˜€¡¹•ÜM•Ğ¡m¥¹ÁÕĞ¹É•…Ñ•‘	ä°¥¹ÁÕĞ¹É•Ù¥•İ•‘	ä°¥¹ÁÕĞ¹…ÁÁÉ½Ù•‘	åt¤¹Í¥é”€„ôô€Ì¤ì4(€€€Ñ¡É½Ü¹•ÜÉÉ½È AAI=Y1}MAIQ%=9}IEU%Iœ¤ì4(€ô4(€É•ÑÕÉ¸ÑÉÕ”…Ì½¹ÍĞì4)ôì4(