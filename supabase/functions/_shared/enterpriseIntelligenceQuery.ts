import {
  ASSEMBLE_COMPONENT_CATALOG,
  ASSEMBLE_ELIGIBLE_DISPOSITIONS,
  ENTERPRISE_AI_CAPABILITIES,
  ENTERPRISE_AI_PROVIDERS,
  ENTERPRISE_INTELLIGENCE_PROJECTION_VERSION,
  EVIDENCE_CANDIDATE_FIELDS,
  isUnicodeScalarString,
  SUPPORTED_EVIDENCE_MIME_TYPES,
  type AssembleBlueprintDraft,
  type AssembleComponentType,
  type EnterpriseAiCapability,
  type EnterpriseAiProvider,
  type EnterpriseAssessDraftProjection,
  type EnterpriseApprovalResourceProjection,
  type EnterpriseApprovalResourceType,
  type EnterpriseBlueprintProjection,
  type EnterpriseCommandActivityProjection,
  type EnterpriseDeliveryPackageProjection,
  type EnterpriseEvidenceCandidateProjection,
  type EnterpriseEvidenceSourceProjection,
  type EnterpriseIntelligenceProjection,
  type EnterpriseModernizationProjection,
  type EnterpriseMonitorProjection,
  type EnterpriseProviderProjection,
  type EnterpriseProviderRoleOptionProjection,
  type EnterpriseStudioDocumentProjection,
  type EvidenceCandidateField,
  type EvidenceSourceStatus,
  type EvidenceSuggestionStatus,
  type ModernizationDisposition,
  type SupportedEvidenceMimeType,
} from '../../../services/enterpriseIntelligence.ts';
import {
  TRANSCRIPT_ASSESS_APPLICATION_INTENTS,
  TRANSCRIPT_FLOW_PROJECTION_VERSION,
  TRANSCRIPT_SOURCE_ROLES,
  emptyTranscriptFlowProjection,
  type TranscriptAssessApplicationIntent,
  type TranscriptAssessConflictProjection,
  type TranscriptFlowProjection,
  type TranscriptSourceRole,
} from '../../../services/transcriptFlow/contracts.ts';
import {
  emptyStudioSourceFlowProjection,
  type StudioSourceFlowProjection,
} from '../../../services/studioArtifacts/workspaceModel.ts';
import {
  ASSESS_DOCUMENT_MAPPING_SCHEMA_VERSION,
  emptyAssessDocumentMappingProjection,
  isAssessMappingJsonValue,
  type AssessDocumentMappingProjection,
  type AssessMappingConflictProjection,
  type AssessMappingJsonValue,
  type AssessMappingProposalProjection,
  type AssessMappingTargetDescriptor,
} from '../../../services/assessImport/contracts.ts';
import {
  decodeDeliveryWorkspaceProjection,
  decodeMonitorApprovedBaselinesProjection,
  DELIVERY_ITEM_PAGE_MAX,
  type DeliveryBaselineEligibilityPageRequest,
  type DeliveryItemPageRequest,
  type DeliveryWorkspaceProjection,
  type MonitorApprovedBaselinesProjection,
} from '../../../services/deliveryMonitor/contracts.ts';
import { corsHeaders } from './http.ts';
import { postgrest } from './supabase.ts';
import { createDeliveryMonitorDatabase } from './deliveryMonitorDb.ts';
import {
  TenantAuthorityError,
  type TenantAuthorityDatabase,
  type TenantContext,
  resolveTenantAuthority,
} from './tenantAuthority.ts';

type Row = Record<string, unknown>;

export interface EnterpriseIntelligenceRawProjection {
  providerConfigs: Row[];
  providerRoutes: Row[];
  providerRoleOptions: Row[];
  providerRoleCapabilities: Row[];
  evidenceSources: Row[];
  evidenceVersions: Row[];
  evidenceCandidates: Row[];
  assessDrafts: Row[];
  applications: Row[];
  applicationAssessments: Row[];
  studioAggregates: Row[];
  studioVersions: Row[];
  studioHandoffs: Row[];
  deliveryPackages: Row[];
  deliveryVersions: Row[];
  deliveryItems: Row[];
  monitorBaselines: Row[];
  deliveryWorkspace?: DeliveryWorkspaceProjection | null;
  monitorApprovedBaselines?: MonitorApprovedBaselinesProjection | null;
  modernizationAssessments: Row[];
  modernizationDecisions: Row[];
  blueprints: Row[];
  reviewEvents: Row[];
  approvals: Row[];
  commandReceipts: Row[];
  transcriptFlags: Row[];
  transcriptSources: Row[];
  transcriptSourceVersions: Row[];
  transcriptCandidates: Row[];
  transcriptSourceSets: Row[];
  transcriptSourceSetVersions: Row[];
  transcriptSourceSetItems: Row[];
  transcriptInputBundles: Row[];
  transcriptInputBundleVersions: Row[];
  transcriptInputBundleItems: Row[];
  transcriptJourneys: Row[];
  transcriptApplyPreviews: Row[];
  transcriptApplyPreviewBatches: Row[];
  transcriptCandidateApplications: Row[];
  transcriptCandidateRelationships: Row[];
  transcriptConflicts: Row[];
  transcriptConflictResolutions: Row[];
  transcriptExtractionBindings: Row[];
  transcriptJobs: Row[];
  transcriptStalenessEvents: Row[];
  studioSourceFlags?: Row[];
  studioSourceOwnerships?: Row[];
  studioExtractionJobClassifications?: Row[];
  studioSources?: Row[];
  studioSourceVersions?: Row[];
  studioSourceCandidates?: Row[];
  studioSourceSets?: Row[];
  studioSourceSetVersions?: Row[];
  studioSourceSetItems?: Row[];
  studioInputBundles?: Row[];
  studioInputBundleVersions?: Row[];
  studioInputBundleItems?: Row[];
  studioExtractionRuns?: Row[];
  studioExtractionBindings?: Row[];
  studioCandidateEdits?: Row[];
  studioProviderRoutes?: Row[];
  mappingCatalogs: Row[];
  mappingTargets: Row[];
  mappingRuns: Row[];
  mappingRunSources: Row[];
  mappingProposals: Row[];
  mappingReviews: Row[];
  mappingPreviewBatches: Row[];
  mappingPreviewManifests: Row[];
  mappingPreviewItems: Row[];
  mappingConflicts: Row[];
  mappingConflictResolutions: Row[];
  mappingApplications: Row[];
}

export type EnterpriseIntelligenceQueryDatabase = {
  loadProjectionRows(authority: TenantContext, options?: EnterpriseIntelligenceQueryOptions): Promise<EnterpriseIntelligenceRawProjection>;
};

export type EnterpriseIntelligenceQueryOptions = {
  deliveryItemPage?: DeliveryItemPageRequest;
  deliveryBaselineEligibilityPage?: DeliveryBaselineEligibilityPageRequest;
  assessDocumentMappingScope?: { caseId: string; caseVersion: number; inputBundleId?: string; inputBundleVersionId?: string };
};

export type EnterpriseIntelligenceQueryDependencies = {
  authenticate(request: Request): Promise<{ id: string }>;
  authorityDatabase: TenantAuthorityDatabase;
  queryDatabase: EnterpriseIntelligenceQueryDatabase;
  now?: () => Date;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sameUuid = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
const canonicalProjectionJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalProjectionJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    return `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${canonicalProjectionJson(item[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const assertEmbeddedProjectionScope = (
  authority: TenantContext,
  projection: DeliveryWorkspaceProjection | MonitorApprovedBaselinesProjection,
) => {
  if (!sameUuid(projection.organizationId, authority.organizationId)
    || !sameUuid(projection.workspaceId, authority.workspaceId)) {
    throw new Error('ENTERPRISE_PROJECTION_SCOPE_MISMATCH');
  }
};
const requestKeys = ['organizationId', 'workspaceId', 'expectedAuthorizationVersion', 'deliveryItemPage', 'deliveryBaselineEligibilityPage', 'assessDocumentMappingScope'];

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const isRow = (value: unknown): value is Row => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const MODERNIZATION_BLOCKER_DIMENSIONS = [
  'integration_accessibility',
  'semantic_and_data_clarity',
  'state_and_execution',
  'security_and_control',
  'architecture_changeability',
  'ui_automation_readiness',
  'ai_assisted_engineering_readiness',
] as const;
type ModernizationBlockerDimension = typeof MODERNIZATION_BLOCKER_DIMENSIONS[number];
const PR1G_MISSING_EVIDENCE_BY_DIMENSION = {
  integration_accessibility: [],
  semantic_and_data_clarity: ['DOCUMENTATION_QUALITY'],
  state_and_execution: ['EXECUTION_CHARACTERISTICS'],
  security_and_control: ['REGULATED_DATA_FLAGS'],
  architecture_changeability: ['SOURCE_RIGHTS', 'DEPLOYMENT_REPEATABILITY'],
  ui_automation_readiness: [
    'stableInterface',
    'controlAccessibility',
    'deterministicErrorDetection',
    'reversibilityOrCompensation',
    'materialActionApproval',
    'monitoring',
    'humanOwner',
  ],
  ai_assisted_engineering_readiness: [],
} as const satisfies Record<ModernizationBlockerDimension, readonly string[]>;
const PR1G_HARD_GATES_BY_DIMENSION = {
  integration_accessibility: ['UI_BRIDGE_EVIDENCE_REQUIRED'],
  semantic_and_data_clarity: ['UNDOCUMENTED_SEMANTICS'],
  state_and_execution: ['BATCH_DELAYED_FEEDBACK'],
  security_and_control: ['REGULATED_DATA_REQUIRES_INDEPENDENT_REVIEW'],
  architecture_changeability: ['NO_LEGAL_SOURCE_ACCESS'],
  ui_automation_readiness: ['UI_AUTOMATION_POSITIVE_EVIDENCE_REQUIRED'],
  ai_assisted_engineering_readiness: [
    'AI_REBUILD_REQUIRES_LEGALSOURCERIGHTS',
    'AI_REBUILD_REQUIRES_EXECUTABLEACCEPTANCETESTS',
    'AI_REBUILD_REQUIRES_REPRODUCIBLEBUILD',
    'AI_REBUILD_REQUIRES_CONTROLLEDSECURITYREVIEW',
    'AI_REBUILD_REQUIRES_HUMANENGINEERINGOWNER',
    'AI_REBUILD_REQUIRES_CONTROLLEDDEPLOYMENTROLLBACK',
  ],
} as const satisfies Record<ModernizationBlockerDimension, readonly string[]>;
const MODERNIZATION_BLOCKER_KEYS = ['dimension', 'hardGates', 'missingEvidence'];
const MAX_MODERNIZATION_BLOCKERS = 50;
const MAX_MODERNIZATION_BLOCKER_CODES = 20;
const MAX_MODERNIZATION_BLOCKER_CODE_LENGTH = 120;
const MODERNIZATION_BLOCKER_GENERIC = 'Governed blocker details unavailable';
const number = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || fallback;
const bool = (value: unknown) => value === true;
const array = (value: unknown) => Array.isArray(value) ? value : [];
const strings = (value: unknown) => array(value).filter((entry): entry is string => typeof entry === 'string');
const object = (value: unknown): Row => isRow(value) ? value : {};
const short = (value: unknown, max = 160) => text(value).replace(/\s+/g, ' ').trim().slice(0, max);
const boundedUnicodeScalarString = (value: unknown, maximum: number): string | undefined => {
  const serialized = typeof value === 'string' ? value : value === undefined || value === null ? '' : JSON.stringify(value);
  return serialized && isUnicodeScalarString(serialized) && Array.from(serialized).length <= maximum ? serialized : undefined;
};

const decodeBlockerCodes = (value: unknown, allowedCodes: readonly string[]): string[] | null => {
  if (!Array.isArray(value) || value.length > MAX_MODERNIZATION_BLOCKER_CODES) return null;
  const decoded: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string'
      || item.length > MAX_MODERNIZATION_BLOCKER_CODE_LENGTH
      || !allowedCodes.includes(item)) return null;
    decoded.push(item);
  }
  return [...new Set(decoded)].sort();
};

export const decodeModernizationBlockers = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [MODERNIZATION_BLOCKER_GENERIC];
  if (value.length === 0) return [];
  if (value.length > MAX_MODERNIZATION_BLOCKERS) return [MODERNIZATION_BLOCKER_GENERIC];
  const decoded: Array<{ dimension: ModernizationBlockerDimension; detail: string }> = [];
  const seenDimensions = new Set<string>();
  let malformed = false;
  for (const item of value) {
    if (!isRow(item)
      || Object.keys(item).sort().join('|') !== MODERNIZATION_BLOCKER_KEYS.join('|')
      || !MODERNIZATION_BLOCKER_DIMENSIONS.includes(item.dimension as typeof MODERNIZATION_BLOCKER_DIMENSIONS[number])
      || seenDimensions.has(String(item.dimension))) {
      malformed = true;
      continue;
    }
    const dimension = item.dimension as ModernizationBlockerDimension;
    const missingEvidence = decodeBlockerCodes(item.missingEvidence, PR1G_MISSING_EVIDENCE_BY_DIMENSION[dimension]);
    const hardGates = decodeBlockerCodes(item.hardGates, PR1G_HARD_GATES_BY_DIMENSION[dimension]);
    if (!missingEvidence || !hardGates) {
      malformed = true;
      continue;
    }
    const sections = [
      missingEvidence.length ? `missing evidence [${missingEvidence.join(', ')}]` : '',
      hardGates.length ? `hard gates [${hardGates.join(', ')}]` : '',
    ].filter(Boolean);
    if (sections.length === 0) sections.push('governed blocker');
    decoded.push({ dimension, detail: `${dimension}: ${sections.join('; ')}` });
    seenDimensions.add(dimension);
  }
  decoded.sort((left, right) => MODERNIZATION_BLOCKER_DIMENSIONS.indexOf(left.dimension)
    - MODERNIZATION_BLOCKER_DIMENSIONS.indexOf(right.dimension));
  const details = decoded.map(item => item.detail);
  if (malformed) details.push(MODERNIZATION_BLOCKER_GENERIC);
  return details.length ? details : [MODERNIZATION_BLOCKER_GENERIC];
};
const includes = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === 'string' && values.includes(value as T);
const byNewest = (left: Row, right: Row) => Date.parse(text(right.created_at)) - Date.parse(text(left.created_at));
const hasAny = (authority: TenantContext, ...capabilities: string[]) => capabilities.some(capability => authority.capabilities.includes(capability));

const projectionVisibility = (authority: TenantContext) => {
  const providerVisible = hasAny(authority, 'org.admin', 'byok.manage', 'security.manage', 'evidence.write');
  const evidenceVisible = hasAny(authority, 'evidence.write', 'evidence.review');
  const assessDraftsVisible = evidenceVisible && hasAny(authority, 'assessment.edit', 'assess.v2.read', 'assess.v2.draft.write');
  const applicationsVisible = hasAny(authority, 'assess.applications.read', 'assess.applications.portfolio.read', 'portfolio.manage');
  const studioVisible = hasAny(authority, 'studio.artifacts.read', 'docs.approve');
  const studioSourcesVisible = hasAny(authority, 'studio.sources.read', 'studio.sources.manage');
  const deliveryVisible = hasAny(
    authority,
    'project.read', 'project.manage',
    'delivery.handoff.request', 'delivery.handoff.review', 'delivery.handoff.approve', 'delivery.handoff.consume',
    'delivery.package.manage', 'delivery.package.review', 'delivery.package.approve', 'monitor.baseline.create',
  );
  const monitorVisible = hasAny(authority, 'monitor.read', 'monitor.manage');
  const modernizationVisible = applicationsVisible || hasAny(authority, 'assemble.manage');
  const approvalVisible = hasAny(authority, 'approvals.review');
  const transcriptSourcesVisible = authority.capabilities.includes('transcript.sources.read');
  const transcriptAssessVisible = authority.capabilities.includes('assess.v2.read');
  return {
    providerVisible,
    evidenceVisible,
    assessDraftsVisible,
    applicationsVisible,
    studioVisible,
    studioSourcesVisible,
    deliveryVisible,
    monitorVisible,
    modernizationVisible,
    approvalVisible,
    transcriptSourcesVisible,
    transcriptAssessVisible,
    transcriptLineageRequired: transcriptSourcesVisible || transcriptAssessVisible,
  };
};

const emptyRawProjection = (): EnterpriseIntelligenceRawProjection => ({
  providerConfigs: [], providerRoutes: [], providerRoleOptions: [], providerRoleCapabilities: [], evidenceSources: [], evidenceVersions: [], evidenceCandidates: [], assessDrafts: [],
  applications: [], applicationAssessments: [], studioAggregates: [], studioVersions: [], studioHandoffs: [],
  deliveryPackages: [], deliveryVersions: [], deliveryItems: [], monitorBaselines: [],
  deliveryWorkspace: null, monitorApprovedBaselines: null,
  modernizationAssessments: [], modernizationDecisions: [], blueprints: [], reviewEvents: [], approvals: [], commandReceipts: [],
  transcriptFlags: [], transcriptSources: [], transcriptSourceVersions: [], transcriptCandidates: [],
  transcriptSourceSets: [], transcriptSourceSetVersions: [], transcriptSourceSetItems: [],
  transcriptInputBundles: [], transcriptInputBundleVersions: [], transcriptInputBundleItems: [], transcriptJourneys: [],
  transcriptApplyPreviews: [], transcriptApplyPreviewBatches: [], transcriptCandidateApplications: [], transcriptCandidateRelationships: [], transcriptConflicts: [], transcriptConflictResolutions: [],
  transcriptExtractionBindings: [], transcriptJobs: [], transcriptStalenessEvents: [],
  studioSourceFlags: [], studioSourceOwnerships: [], studioExtractionJobClassifications: [], studioSources: [], studioSourceVersions: [], studioSourceCandidates: [],
  studioSourceSets: [], studioSourceSetVersions: [], studioSourceSetItems: [], studioInputBundles: [],
  studioInputBundleVersions: [], studioInputBundleItems: [], studioExtractionRuns: [], studioExtractionBindings: [],
  studioCandidateEdits: [], studioProviderRoutes: [],
  mappingCatalogs: [], mappingTargets: [], mappingRuns: [], mappingRunSources: [], mappingProposals: [], mappingReviews: [],
    mappingPreviewBatches: [], mappingPreviewManifests: [], mappingPreviewItems: [], mappingConflicts: [], mappingConflictResolutions: [], mappingApplications: [],
});

const scoped = (authority: TenantContext) => `org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}`;

const CLASSIFICATION_BATCH_SIZE = 100;
const CLASSIFICATION_PAGE_SIZE = 500;
const CLASSIFICATION_ROW_LIMIT = 50_000;

const uniqueUuids = (values: unknown[]) => [...new Set(values.map(value => text(value)).filter(value => uuid.test(value)))];
const batches = <T>(values: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) result.push(values.slice(offset, offset + size));
  return result;
};

const loadClassificationPages = async (
  query: typeof postgrest,
  basePath: string,
): Promise<Row[]> => {
  const result: Row[] = [];
  for (let offset = 0; ; offset += CLASSIFICATION_PAGE_SIZE) {
    const page = await query<Row[]>(`${basePath}&limit=${CLASSIFICATION_PAGE_SIZE}&offset=${offset}`, {
      method: 'GET', headers: { 'Cache-Control': 'no-store' },
    });
    if (!Array.isArray(page) || page.length > CLASSIFICATION_PAGE_SIZE) throw new Error('ENTERPRISE_EVIDENCE_CLASSIFICATION_INVALID');
    result.push(...page);
    if (result.length > CLASSIFICATION_ROW_LIMIT) throw new Error('ENTERPRISE_EVIDENCE_CLASSIFICATION_LIMIT');
    if (page.length < CLASSIFICATION_PAGE_SIZE) return result;
  }
};

export const createEnterpriseIntelligenceQueryDatabase = (
  query: typeof postgrest = postgrest,
  deliveryMonitorDatabase = createDeliveryMonitorDatabase(),
): EnterpriseIntelligenceQueryDatabase => ({
  async loadProjectionRows(authority, options = {}) {
    const rows = emptyRawProjection();
    const scope = scoped(authority);
    const {
      providerVisible,
      evidenceVisible,
      assessDraftsVisible,
      applicationsVisible,
      studioVisible,
      studioSourcesVisible,
      deliveryVisible,
      monitorVisible,
      modernizationVisible,
      approvalVisible,
      transcriptLineageRequired,
      transcriptAssessVisible,
    } = projectionVisibility(authority);

    const tasks: Array<Promise<void>> = [];
    const load = (target: keyof EnterpriseIntelligenceRawProjection, path: string) => {
      tasks.push(query<Row[]>(path, { method: 'GET', headers: { 'Cache-Control': 'no-store' } }).then(result => {
        (rows as unknown as Record<string, Row[]>)[target] = result;
      }));
    };

    if (providerVisible) {
      load('providerConfigs', `ai_provider_configs?select=id,provider,display_name,default_model,status,key_ref_id,budget_policy,last_validated_at,created_at&org_id=eq.${encodeURIComponent(authority.organizationId)}&deleted_at=is.null&order=created_at.desc&limit=100`);
      load('providerRoutes', `enterprise_ai_capability_routes?select=id,provider_config_id,capability,model,enabled,allowed_roles,updated_at&${scope}&deleted_at=is.null&order=updated_at.desc&limit=200`);
      load('providerRoleOptions', `roles?select=id,name,slug,scope,org_id,workspace_id&org_id=eq.${encodeURIComponent(authority.organizationId)}&status=eq.active&deleted_at=is.null&or=(and(scope.eq.workspace,workspace_id.eq.${encodeURIComponent(authority.workspaceId)}),and(scope.eq.organization,workspace_id.is.null))&order=name.asc&limit=200`);
      load('providerRoleCapabilities', 'role_capabilities?select=role_id,capability_key&capability_key=eq.org.admin&limit=200');
    }
    if (evidenceVisible) {
      load('evidenceSources', `enterprise_evidence_sources?select=id,display_name,mime_type,current_version,status,created_by,created_at&${scope}&deleted_at=is.null&order=created_at.desc&limit=100`);
      load('evidenceVersions', `enterprise_evidence_source_versions?select=id,source_id,version,content_hash,extracted_text_hash,extracted_character_count,extraction_status,extraction_failure_code,created_at&${scope}&order=created_at.desc&limit=500`);
      load('evidenceCandidates', `enterprise_evidence_candidates?select=id,ai_job_id,source_id,source_version_id,field_key,value,safe_excerpt,excerpt_hash,source_locator,confidence,prompt_version,suggestion_status,version,provenance_hash,created_by,reviewed_by,reviewed_at,updated_at&${scope}&order=updated_at.desc&limit=1000`);
      if (assessDraftsVisible) {
        load('assessDrafts', `assess_v2_cases?select=id,version,status,updated_at&${scope}&status=eq.draft&deleted_at=is.null&order=updated_at.desc&limit=100`);
      }
    }
    if (applicationsVisible) {
      load('applications', `assess_application_assets?select=id,name,created_at&${scope}&deleted_at=is.null&order=name.asc&limit=200`);
      load('applicationAssessments', `assess_application_assessment_versions?select=id,application_id,version,decision_model_version,lifecycle,created_at&${scope}&lifecycle=eq.approved&order=version.desc&limit=200`);
    }
    if (studioVisible) {
      load('studioAggregates', `studio_artifact_aggregates?select=id,artifact_type,current_approved_version_id,lifecycle,updated_at&${scope}&lifecycle=eq.approved&order=updated_at.desc&limit=200`);
      load('studioVersions', `studio_artifact_versions?select=id,artifact_id,version,lifecycle,created_at&${scope}&lifecycle=eq.approved&order=created_at.desc&limit=200`);
      load('studioHandoffs', `enterprise_studio_delivery_handoffs?select=id,studio_document_id,status,created_at&${scope}&order=created_at.desc&limit=200`);
    }
    const deliveryPage = options.deliveryItemPage;
    const baselineEligibilityPage = options.deliveryBaselineEligibilityPage;
    if (deliveryVisible) tasks.push(deliveryMonitorDatabase.loadDeliveryProjection(
      authority.organizationId,
      authority.workspaceId,
      {
        actorId: authority.userId,
        authorizationVersion: authority.authorizationVersion,
        itemLimit: deliveryPage?.limit ?? DELIVERY_ITEM_PAGE_MAX,
        baselineEligibilityLimit: baselineEligibilityPage?.limit ?? 100,
        ...(deliveryPage ? {
          packageId: deliveryPage.packageId,
          itemCursorVersion: deliveryPage.cursor.version,
          itemCursorId: deliveryPage.cursor.id,
        } : {}),
        ...(baselineEligibilityPage ? {
          baselineEligibilityCursorUpdatedAt: baselineEligibilityPage.cursor.updatedAt,
          baselineEligibilityCursorPackageId: baselineEligibilityPage.cursor.workPackageId,
        } : {}),
      },
    ).then(value => {
      const projection = decodeDeliveryWorkspaceProjection(value);
      assertEmbeddedProjectionScope(authority, projection);
      rows.deliveryWorkspace = projection;
    }));
    if (monitorVisible) tasks.push(deliveryMonitorDatabase.loadMonitorProjection(
      authority.organizationId,
      authority.workspaceId,
      { actorId: authority.userId, authorizationVersion: authority.authorizationVersion, limit: 100 },
    ).then(value => {
      const projection = decodeMonitorApprovedBaselinesProjection(value);
      assertEmbeddedProjectionScope(authority, projection);
      rows.monitorApprovedBaselines = projection;
    }));
    if (modernizationVisible) {
      load('modernizationAssessments', `enterprise_modernization_assessments?select=id,application_ref,status,created_at&${scope}&order=created_at.desc&limit=200`);
      load('modernizationDecisions', `enterprise_modernization_decisions?select=id,modernization_assessment_id,primary_disposition,alternative_disposition,eligible_dispositions,blockers,conflicts,status,created_by,created_at&${scope}&order=created_at.desc&limit=200`);
      load('blueprints', `enterprise_assemble_blueprints?select=id,modernization_decision_id,disposition,version,structured_content,status,created_by,created_at&${scope}&order=created_at.desc&limit=200`);
    }
    if (approvalVisible) {
      load('reviewEvents', `enterprise_high_impact_review_events?select=id,resource_type,resource_id,reviewer_id,created_at&${scope}&order=created_at.desc&limit=400`);
      load('approvals', `enterprise_high_impact_approvals?select=id,resource_type,resource_id,outcome,created_at&${scope}&order=created_at.desc&limit=400`);
    }
    if (studioSourcesVisible) {
      load('studioSourceOwnerships', `studio_source_version_ownerships?select=source_id,source_version_id,created_at&${scope}&order=created_at.desc&limit=2000`);
    }
    if (studioSourcesVisible) {
      load('studioExtractionBindings', `studio_source_extraction_bindings?select=id,job_id,input_bundle_id,input_bundle_version_id,input_bundle_version,source_set_id,source_set_version_id,source_set_version,source_id,source_version_id,ordinal,created_at&${scope}&order=created_at.desc&limit=2000`);
    }
    if (transcriptLineageRequired) {
      load('transcriptFlags', `enterprise_transcript_workspace_flags?select=transcript_source_sets_enabled,assess_multisource_apply_enabled,assess_document_mapping_enabled,governed_journeys_enabled,version,updated_at&${scope}&limit=1`);
      load('transcriptSources', `enterprise_evidence_sources?select=id,display_name,mime_type,current_version,status,created_at&${scope}&deleted_at=is.null&order=created_at.desc&limit=500`);
      load('transcriptSourceVersions', `enterprise_evidence_source_versions?select=id,source_id,version,extracted_character_count,extraction_status,extraction_failure_code,created_at&${scope}&order=created_at.desc&limit=2000`);
      load('transcriptSourceSets', `enterprise_source_sets?select=id,owner_module,display_label,description,current_version,lifecycle_version,status,created_at,updated_at&${scope}&owner_module=eq.assess&order=updated_at.desc&limit=200`);
      load('transcriptSourceSetVersions', `enterprise_source_set_versions?select=id,source_set_id,version,purpose,source_count,extracted_character_count,status,created_at&${scope}&order=created_at.desc&limit=400`);
      load('transcriptSourceSetItems', `enterprise_source_set_version_items?select=source_set_version_id,source_set_id,source_version_id,source_id,ordinal,semantic_role,user_note,extracted_character_count&${scope}&order=ordinal.asc&limit=4000`);
      load('transcriptInputBundles', `enterprise_module_input_bundles?select=id,owner_module,current_version,created_at,updated_at&${scope}&owner_module=eq.assess&order=updated_at.desc&limit=200`);
      load('transcriptInputBundleVersions', `enterprise_module_input_bundle_versions?select=id,input_bundle_id,version,status,created_at&${scope}&order=created_at.desc&limit=400`);
      load('transcriptInputBundleItems', `enterprise_module_input_bundle_items?select=input_bundle_version_id,input_bundle_id,ordinal,source_set_version_id,source_set_id,declared_purpose&${scope}&order=ordinal.asc&limit=4000`);
    }
    if (transcriptAssessVisible) {
      load('transcriptCandidates', `enterprise_evidence_candidates?select=id,ai_job_id,source_id,source_version_id,field_key,value,safe_excerpt,source_locator,confidence,suggestion_status,version,created_by,reviewed_by,reviewed_at,updated_at&${scope}&order=updated_at.desc&limit=4000`);
      load('transcriptJourneys', `enterprise_governed_journeys?select=id,entry_module,desired_exit_module,current_module,lineage_classification,planning_only,status,version,updated_at&${scope}&order=updated_at.desc&limit=200`);
      load('transcriptApplyPreviews', `enterprise_assess_apply_previews?select=id,assess_case_id,expected_case_version,input_bundle_version_id,candidate_id,candidate_version,application_intent,target_key,target_id,proposed_value,created_at,expires_at&${scope}&order=created_at.desc&limit=1000`);
      load('transcriptApplyPreviewBatches', `enterprise_assess_apply_preview_batches?select=id,assess_case_id,expected_case_version,input_bundle_id,input_bundle_version_id,source_set_version_ids,preview_ids,created_at&${scope}&order=created_at.desc&limit=1000`);
      load('transcriptCandidateApplications', `enterprise_assess_candidate_applications?select=preview_id,preview_batch_id,assess_case_id,assess_case_version,applied_at&${scope}&order=applied_at.desc&limit=1000`);
      load('transcriptCandidateRelationships', `enterprise_evidence_candidate_relationship_reviews?select=id,candidate_id,candidate_version,source_id,source_version_id,input_bundle_id,input_bundle_version_id,relationship,suggested_application_intent,suggested_apply_target,rationale,reviewer_id,created_at&${scope}&order=created_at.desc,id.desc&limit=1000`);
      load('transcriptConflicts', `enterprise_assess_evidence_conflicts?select=id,assess_case_id,input_bundle_version_id,application_intent,target_key,candidate_ids,is_material,current_resolution_version,created_at&${scope}&order=created_at.desc&limit=1000`);
      load('transcriptConflictResolutions', `enterprise_assess_evidence_conflict_resolutions?select=conflict_id,version,resolution,chosen_candidate_id,authored_value,rationale,created_at&${scope}&order=created_at.desc&limit=1000`);
      load('transcriptExtractionBindings', `enterprise_transcript_extraction_bindings?select=id,job_id,input_bundle_version_id,input_bundle_id,source_set_version_id,source_id,source_version_id,created_at&${scope}&order=created_at.desc&limit=1000`);
      load('transcriptJobs', `enterprise_ai_job_ledger?select=id,status,failure_class,created_at,completed_at&${scope}&capability=eq.assess.evidence.extract&order=created_at.desc&limit=1000`);
      load('transcriptStalenessEvents', `enterprise_transcript_staleness_events?select=resource_kind,resource_id,created_at&${scope}&order=created_at.desc&limit=4000`);
    }
    load('commandReceipts', `enterprise_ai_command_receipts?select=command_type,status,completed_at,created_at&${scope}&actor_id=eq.${encodeURIComponent(authority.userId)}&order=created_at.desc&limit=20`);
    await Promise.all(tasks);
    const mappingScope = options.assessDocumentMappingScope;
    if (transcriptAssessVisible && mappingScope) {
      const caseFilter = `${scope}&assess_case_id=eq.${encodeURIComponent(mappingScope.caseId)}&case_version=eq.${mappingScope.caseVersion}`;
      rows.mappingCatalogs = await query<Row[]>(`enterprise_assess_document_mapping_catalogs?select=id,assess_case_id,case_version,assess_schema_version,catalog_version,catalog_hash,status,created_at&${caseFilter}&status=eq.current&order=created_at.desc&limit=1`, { method: 'GET', headers: { 'Cache-Control': 'no-store' } });
      const catalogId = text(rows.mappingCatalogs[0]?.id);
      if (uuid.test(catalogId)) rows.mappingTargets = await query<Row[]>(`enterprise_assess_document_mapping_targets?select=selector_id,catalog_id,target_kind,operation,entity_id,field_id,label,context_label,value_type,allowed_values,current_value,current_value_hash,manual,ordinal&${scope}&catalog_id=eq.${encodeURIComponent(catalogId)}&order=ordinal.asc&limit=2000`, { method: 'GET', headers: { 'Cache-Control': 'no-store' } });
      if (uuid.test(catalogId) && mappingScope.inputBundleId && mappingScope.inputBundleVersionId) {
        const bundleFilter = `input_bundle_id=eq.${encodeURIComponent(mappingScope.inputBundleId)}&input_bundle_version_id=eq.${encodeURIComponent(mappingScope.inputBundleVersionId)}`;
        rows.mappingRuns = await query<Row[]>(`enterprise_assess_document_mapping_runs?select=id,catalog_id,assess_case_id,case_version,input_bundle_id,input_bundle_version_id,status,failure_code,safe_result,created_at,updated_at&${caseFilter}&catalog_id=eq.${encodeURIComponent(catalogId)}&${bundleFilter}&order=created_at.desc&limit=1`, { method: 'GET', headers: { 'Cache-Control': 'no-store' } });
        rows.mappingPreviewBatches = await query<Row[]>(`enterprise_assess_document_mapping_preview_batches?select=id,catalog_id,catalog_hash,assess_case_id,expected_case_version,input_bundle_id,input_bundle_version_id,status,expires_at,created_at&${scope}&assess_case_id=eq.${encodeURIComponent(mappingScope.caseId)}&expected_case_version=eq.${mappingScope.caseVersion}&catalog_id=eq.${encodeURIComponent(catalogId)}&${bundleFilter}&order=created_at.desc&limit=1`, { method: 'GET', headers: { 'Cache-Control': 'no-store' } });
        const runId = text(rows.mappingRuns[0]?.id); const previewBatchId = text(rows.mappingPreviewBatches[0]?.id);
        if (uuid.test(runId)) {
          rows.mappingRunSources = await query<Row[]>(`enterprise_assess_document_mapping_run_sources?select=run_id,extraction_binding_id,extraction_job_id,source_id,source_version_id,parser_version,normalized_hash,extracted_byte_count,ordinal&${scope}&run_id=eq.${encodeURIComponent(runId)}&order=ordinal.asc&limit=20`, { method: 'GET', headers: { 'Cache-Control': 'no-store' } });
          rows.mappingProposals = await query<Row[]>(`enterprise_assess_document_mapping_proposals?select=id,run_id,catalog_id,target_selector_id,proposal_version,proposed_value,confidence,rationale,source_id,source_version_id,extraction_binding_id,extraction_job_id,parser_version,source_locator,anchor_hash,safe_excerpt,relationship,status,created_at&${scope}&run_id=eq.${encodeURIComponent(runId)}&order=created_at.desc&limit=100`, { method: 'GET', headers: { 'Cache-Control': 'no-store' } });
          const proposalIds = rows.mappingProposals.map(row => text(row.id)).filter(id => uuid.test(id));
          if (proposalIds.length) rows.mappingReviews = await query<Row[]>(`enterprise_assess_document_mapping_reviews?select=proposal_id,version,status,reviewed_value,reviewer_id,created_at&${scope}&proposal_id=in.(${proposalIds.join(',')})&order=version.desc&limit=2000`, { method: 'GET', headers: { 'Cache-Control': 'no-store' } });
        }
        if (uuid.test(previewBatchId)) {
          rows.mappingPreviewManifests = await query<Row[]>(`enterprise_assess_document_mapping_preview_manifests?select=preview_batch_id,manifest_version,catalog_id,catalog_hash,assess_case_id,case_version,input_bundle_id,input_bundle_version_id,target_count,source_count,item_count,reviewed_count,conflict_count,unresolved_conflict_count,item_set_hash,conflict_set_hash,resolution_set_hash,displayed_set_hash,item_bindings,conflict_bindings,resolution_bindings&${scope}&preview_batch_id=eq.${encodeURIComponent(previewBatchId)}&order=manifest_version.desc&limit=1`, { method: 'GET', headers: { 'Cache-Control': 'no-store' } });
          rows.mappingPreviewItems = await query<Row[]>(`enterprise_assess_document_mapping_preview_items?select=preview_batch_id,proposal_id,target_selector_id,proposal_version,reviewed_value,binding_hash,ordinal&${scope}&preview_batch_id=eq.${encodeURIComponent(previewBatchId)}&order=ordinal.asc&limit=100`, { method: 'GET', headers: { 'Cache-Control': 'no-store' } });
          rows.mappingConflicts = await query<Row[]>(`enterprise_assess_document_mapping_conflicts?select=id,preview_batch_id,target_selector_id,proposal_ids,kind,current_value_hash,current_resolution_version,created_at&${scope}&preview_batch_id=eq.${encodeURIComponent(previewBatchId)}&order=created_at.asc&limit=100`, { method: 'GET', headers: { 'Cache-Control': 'no-store' } });
          const conflictIds = rows.mappingConflicts.map(row => text(row.id)).filter(id => uuid.test(id));
          if (conflictIds.length) rows.mappingConflictResolutions = await query<Row[]>(`enterprise_assess_document_mapping_conflict_resolutions?select=conflict_id,version,resolution,chosen_proposal_id,authored_value,rationale,created_at&${scope}&conflict_id=in.(${conflictIds.join(',')})&order=version.desc&limit=1000`, { method: 'GET', headers: { 'Cache-Control': 'no-store' } });
          rows.mappingApplications = await query<Row[]>(`enterprise_assess_document_mapping_applications?select=preview_batch_id,proposal_id,target_selector_id,assess_case_id,assess_case_version,outcome,applied_at&${scope}&preview_batch_id=eq.${encodeURIComponent(previewBatchId)}&order=applied_at.desc&limit=100`, { method: 'GET', headers: { 'Cache-Control': 'no-store' } });
        }
      }
    }
    if (studioSourcesVisible) {
      load('studioSourceFlags', `enterprise_transcript_workspace_flags?select=studio_multisource_enabled,unified_byok_gateway_enabled,studio_source_integration_enabled,version,updated_at&${scope}&limit=1`);
      load('studioSources', `enterprise_evidence_sources?select=id,display_name,mime_type,current_version,status,deleted_at,created_at&${scope}&order=created_at.desc&limit=2000`);
      load('studioSourceVersions', `enterprise_evidence_source_versions?select=id,source_id,version,content_hash,extracted_text_hash,extracted_character_count,extraction_status,extraction_failure_code,created_at&${scope}&order=created_at.desc&limit=2000`);
      load('studioSourceCandidates', `enterprise_evidence_candidates?select=id,ai_job_id,source_id,source_version_id,field_key,value,safe_excerpt,excerpt_hash,provenance_hash,source_locator,confidence,suggestion_status,version,created_by,reviewed_by,reviewed_at,updated_at&${scope}&order=updated_at.desc&limit=2000`);
      load('studioSourceSets', `enterprise_source_sets?select=id,owner_module,display_label,description,current_version,lifecycle_version,status,created_at,updated_at&${scope}&owner_module=eq.studio&order=updated_at.desc&limit=400`);
      load('studioSourceSetVersions', `enterprise_source_set_versions?select=id,source_set_id,version,purpose,source_count,extracted_character_count,status,created_at&${scope}&order=created_at.desc&limit=400`);
      load('studioSourceSetItems', `enterprise_source_set_version_items?select=source_set_version_id,source_set_id,source_version_id,source_id,ordinal,semantic_role,user_note,extracted_character_count&${scope}&order=ordinal.asc&limit=4000`);
      load('studioInputBundles', `enterprise_module_input_bundles?select=id,owner_module,current_version,created_at,updated_at&${scope}&owner_module=eq.studio&order=updated_at.desc&limit=400`);
      load('studioInputBundleVersions', `enterprise_module_input_bundle_versions?select=id,input_bundle_id,version,status,created_at&${scope}&order=created_at.desc&limit=400`);
      load('studioInputBundleItems', `enterprise_module_input_bundle_items?select=input_bundle_version_id,input_bundle_id,ordinal,source_set_version_id,source_set_id,declared_purpose&${scope}&order=ordinal.asc&limit=4000`);
      load('studioExtractionRuns', `studio_source_extraction_runs?select=job_id,input_bundle_id,input_bundle_version_id,input_bundle_version,status,candidate_count,created_at,completed_at&${scope}&order=created_at.desc&limit=400`);
      load('studioCandidateEdits', `enterprise_evidence_candidate_edits?select=candidate_id,created_at&${scope}&order=created_at.desc&limit=4000`);
      load('studioProviderRoutes', `enterprise_ai_capability_routes?select=id,enabled,deleted_at&${scope}&capability=eq.studio.evidence.extract&order=updated_at.desc&limit=20`);
    }
    await Promise.all(tasks);
    if (evidenceVisible || transcriptLineageRequired) {
      const evidenceSourceIds = evidenceVisible ? uniqueUuids(rows.evidenceSources.map(row => row.id)) : [];
      const sourceVersionIds = uniqueUuids([
        ...(evidenceVisible ? rows.evidenceVersions.map(row => row.id) : []),
        ...(evidenceVisible ? rows.evidenceCandidates.map(row => row.source_version_id) : []),
        ...(transcriptLineageRequired ? rows.transcriptSourceVersions.map(row => row.id) : []),
        ...(transcriptAssessVisible ? rows.transcriptCandidates.map(row => row.source_version_id) : []),
      ]);
      const evidenceJobIds = evidenceVisible ? uniqueUuids(rows.evidenceCandidates.map(row => row.ai_job_id)) : [];

      const [ownershipsBySource, ownershipsByVersion, studioJobs] = await Promise.all([
        Promise.all(batches(evidenceSourceIds, CLASSIFICATION_BATCH_SIZE).map(async sourceIds => {
          const requested = new Set(sourceIds);
          const result = await loadClassificationPages(query,
            `studio_source_version_ownerships?select=source_id,source_version_id,created_at&${scope}`
            + `&source_id=in.(${sourceIds.join(',')})&order=source_id.asc,source_version_id.asc`);
          if (result.some(row => !requested.has(text(row.source_id)) || !uuid.test(text(row.source_version_id)))) {
            throw new Error('ENTERPRISE_EVIDENCE_CLASSIFICATION_INVALID');
          }
          return result;
        })),
        Promise.all(batches(sourceVersionIds, CLASSIFICATION_BATCH_SIZE).map(async versionIds => {
          const requested = new Set(versionIds);
          const result = await loadClassificationPages(query,
            `studio_source_version_ownerships?select=source_id,source_version_id,created_at&${scope}`
            + `&source_version_id=in.(${versionIds.join(',')})&order=source_version_id.asc`);
          if (result.some(row => !requested.has(text(row.source_version_id)) || !uuid.test(text(row.source_id)))) {
            throw new Error('ENTERPRISE_EVIDENCE_CLASSIFICATION_INVALID');
          }
          return result;
        })),
        Promise.all(batches(evidenceJobIds, CLASSIFICATION_BATCH_SIZE).map(async jobIds => {
          const requested = new Set(jobIds);
          const result = await loadClassificationPages(query,
            `studio_source_extraction_runs?select=job_id&${scope}`
            + `&job_id=in.(${jobIds.join(',')})&order=job_id.asc`);
          if (result.some(row => !requested.has(text(row.job_id)))) throw new Error('ENTERPRISE_EVIDENCE_CLASSIFICATION_INVALID');
          return result;
        })),
      ]);

      const ownershipByVersion = new Map((rows.studioSourceOwnerships || [])
        .filter(row => uuid.test(text(row.source_version_id)))
        .map(row => [text(row.source_version_id), row]));
      for (const row of [...ownershipsBySource.flat(), ...ownershipsByVersion.flat()]) {
        ownershipByVersion.set(text(row.source_version_id), row);
      }
      rows.studioSourceOwnerships = [...ownershipByVersion.values()];
      rows.studioExtractionJobClassifications = studioJobs.flat();
    }
    return rows;
  },
});

const latestBy = (rows: Row[], key: string) => {
  const result = new Map<string, Row>();
  [...rows].sort(byNewest).forEach(row => {
    const id = text(row[key]);
    if (id && !result.has(id)) result.set(id, row);
  });
  return result;
};

const projectProviders = (raw: EnterpriseIntelligenceRawProjection, organizationAdmin: boolean): EnterpriseProviderProjection[] => {
  const organizationAdminRoleIds = new Set(raw.providerRoleCapabilities
    .filter(row => row.capability_key === 'org.admin')
    .map(row => text(row.role_id)));
  const eligibleRouteRoles = raw.providerRoleOptions.flatMap<EnterpriseProviderRoleOptionProjection>(role => {
    const id = text(role.id);
    if (!uuid.test(id)) return [];
    if (role.scope === 'workspace' && text(role.workspace_id)) {
      return [{ id, label: short(role.name || role.slug, 120), scope: 'workspace' as const }];
    }
    if (role.scope === 'organization' && !role.workspace_id && organizationAdminRoleIds.has(id)) {
      return [{ id, label: short(role.name || role.slug, 120), scope: 'organization_admin' as const }];
    }
    return [];
  });
  const routesByConfig = new Map<string, Row[]>();
  raw.providerRoutes.forEach(route => {
    const configId = text(route.provider_config_id);
    routesByConfig.set(configId, [...(routesByConfig.get(configId) || []), route]);
  });
  return raw.providerConfigs.flatMap(config => {
    if (!organizationAdmin && !(routesByConfig.get(text(config.id)) || []).length) return [];
    if (!includes(ENTERPRISE_AI_PROVIDERS, config.provider)) return [];
    const status = includes(['pending_review', 'active', 'disabled', 'retired'] as const, config.status) ? config.status : 'disabled';
    const validated = typeof config.last_validated_at === 'string' && Number.isFinite(Date.parse(config.last_validated_at));
    const routes = (routesByConfig.get(text(config.id)) || []).flatMap(route => {
      if (!includes(ENTERPRISE_AI_CAPABILITIES, route.capability)) return [];
      const enabled = bool(route.enabled);
      const availability = status !== 'active'
        ? 'provider_unavailable' as const
        : !validated
          ? 'validation_required' as const
          : enabled ? 'ready' as const : 'disabled' as const;
      return [{
        id: text(route.id), capability: route.capability as EnterpriseAiCapability,
        modelLabel: short(route.model, 200), enabled, availability,
        allowedRoleCount: strings(route.allowed_roles).length,
        allowedRoleIds: strings(route.allowed_roles).filter(roleId => uuid.test(roleId)),
      }];
    });
    return [{
      id: text(config.id), provider: config.provider as EnterpriseAiProvider,
      displayName: short(config.display_name, 240), defaultModel: short(config.default_model, 200),
      status, credentialState: config.key_ref_id ? 'server_reference_present' as const : 'server_reference_missing' as const,
      endpointState: ['azure_openai', 'openai_compatible'].includes(String(config.provider)) ? 'server_configured' as const : 'first_party' as const,
      validationState: validated ? 'validated' as const : 'validation_required' as const,
      lastValidatedAt: validated ? text(config.last_validated_at) : undefined,
      budgetState: Object.keys(object(config.budget_policy)).length ? 'configured' as const : 'not_configured' as const,
      eligibleRouteRoles,
      routes,
    }];
  });
};

const projectEvidence = (raw: EnterpriseIntelligenceRawProjection, actorId: string) => {
  const studioPrivateSourceIds = new Set((raw.studioSourceOwnerships || []).map(row => text(row.source_id)).filter(Boolean));
  const studioPrivateVersionIds = new Set((raw.studioSourceOwnerships || []).map(row => text(row.source_version_id)).filter(Boolean));
  const studioExtractionJobIds = new Set([
    ...(raw.studioExtractionBindings || []).map(row => text(row.job_id)),
    ...(raw.studioExtractionJobClassifications || []).map(row => text(row.job_id)),
  ].filter(Boolean));
  const evidenceVersions = raw.evidenceVersions.filter(version => (
    !studioPrivateSourceIds.has(text(version.source_id)) && !studioPrivateVersionIds.has(text(version.id))
  ));
  const versionBySource = latestBy(evidenceVersions, 'source_id');
  const sources: EnterpriseEvidenceSourceProjection[] = raw.evidenceSources.flatMap(source => {
    if (studioPrivateSourceIds.has(text(source.id)) || !includes(SUPPORTED_EVIDENCE_MIME_TYPES, source.mime_type)
      || !includes(['uploaded', 'extracting', 'review', 'deleted', 'failed'] as const, source.status)) return [];
    const version = versionBySource.get(text(source.id));
    const characterCount = number(version?.extracted_character_count);
    const extractionState = source.status === 'failed' ? 'failed' as const
      : !version ? 'pending' as const
        : characterCount > 0 ? 'ready' as const : 'empty_text_layer' as const;
    return [{
      id: text(source.id), displayName: short(source.display_name, 240), mimeType: source.mime_type as SupportedEvidenceMimeType,
      status: source.status as EvidenceSourceStatus, versionLabel: `Source version ${number(version?.version, number(source.current_version, 1))}`,
      extractedCharacterCount: characterCount, extractionState,
      failureCode: includes(['OCR_REQUIRED', 'UNSUPPORTED_FORMAT', 'MALFORMED_SOURCE'] as const, version?.extraction_failure_code)
        ? version?.extraction_failure_code as 'OCR_REQUIRED' | 'UNSUPPORTED_FORMAT' | 'MALFORMED_SOURCE'
        : undefined,
      sourceBytesAnchored: Boolean(version?.content_hash), extractedTextAnchored: Boolean(version?.extracted_text_hash),
      createdAt: text(source.created_at),
    }];
  });
  const candidates: EnterpriseEvidenceCandidateProjection[] = raw.evidenceCandidates.flatMap(candidate => {
    if (studioPrivateSourceIds.has(text(candidate.source_id)) || studioPrivateVersionIds.has(text(candidate.source_version_id))
      || studioExtractionJobIds.has(text(candidate.ai_job_id)) || !includes(EVIDENCE_CANDIDATE_FIELDS, candidate.field_key)
      || !includes(['suggested', 'accepted', 'rejected', 'edited'] as const, candidate.suggestion_status)) return [];
    const candidateValue = text(candidate.value);
    // Candidate values are already canonical database truth. Never manufacture
    // different review evidence by truncating that truth in the projection.
    if (!isUnicodeScalarString(candidateValue) || Array.from(candidateValue).length > 12_000) return [];
    const reviewedBy = text(candidate.reviewed_by);
    return [{
      id: text(candidate.id), sourceId: text(candidate.source_id), field: candidate.field_key as EvidenceCandidateField,
      value: candidateValue, safeExcerpt: short(candidate.safe_excerpt, 1_000) || undefined,
      sourceLocator: short(candidate.source_locator, 400), confidence: Math.max(0, Math.min(1, number(candidate.confidence))),
      status: candidate.suggestion_status as EvidenceSuggestionStatus,
      promptVersionLabel: short(candidate.prompt_version, 120) || undefined,
      provenanceState: candidate.excerpt_hash && candidate.source_version_id && candidate.source_locator ? 'anchored' as const : 'incomplete' as const,
      reviewState: !reviewedBy ? 'pending' as const : reviewedBy === actorId ? 'reviewed_by_you' as const : 'reviewed_by_another' as const,
      reviewedAt: text(candidate.reviewed_at) || undefined,
    }];
  });
  return { sources, candidates };
};

const projectAssessDrafts = (raw: EnterpriseIntelligenceRawProjection): EnterpriseAssessDraftProjection[] => raw.assessDrafts.flatMap(row => {
  if (!uuid.test(text(row.id)) || row.status !== 'draft' || !Number.isSafeInteger(number(row.version)) || number(row.version) < 1) return [];
  const updatedAt = text(row.updated_at);
  return [{
    id: text(row.id),
    label: `Assess draft · updated ${Number.isFinite(Date.parse(updatedAt)) ? new Date(updatedAt).toLocaleDateString('en-GB') : 'recently'}`,
    versionLabel: `Draft version ${number(row.version)}`,
    status: 'draft' as const,
    updatedAt,
  }];
});

const projectApplications = (raw: EnterpriseIntelligenceRawProjection) => {
  const latestApproved = latestBy(raw.applicationAssessments, 'application_id');
  const assessedApplications = new Set(raw.modernizationAssessments.map(row => text(row.application_ref)));
  return raw.applications.flatMap(application => {
    const assessment = latestApproved.get(text(application.id));
    if (!assessment) return [];
    return [{
      id: text(application.id), name: short(application.name, 240),
      approvedAssessmentLabel: `Approved assessment v${number(assessment.version, 1)}`,
      decisionModelLabel: short(assessment.decision_model_version, 120), approvedAt: text(assessment.created_at),
      modernizationState: assessedApplications.has(text(application.id)) ? 'already_assessed' as const : 'eligible' as const,
    }];
  });
};

const projectStudio = (raw: EnterpriseIntelligenceRawProjection): EnterpriseStudioDocumentProjection[] => {
  const versions = new Map(raw.studioVersions.map(row => [text(row.id), row]));
  const handoffs = latestBy(raw.studioHandoffs, 'studio_document_id');
  return raw.studioAggregates.flatMap(aggregate => {
    const version = versions.get(text(aggregate.current_approved_version_id));
    if (!version || !includes(['brd', 'frd', 'pdd'] as const, aggregate.artifact_type)) return [];
    const handoff = handoffs.get(text(aggregate.id));
    const handoffState = !handoff ? 'available' as const : handoff.status === 'stale' ? 'stale' as const : 'already_handed_off' as const;
    const kind = String(aggregate.artifact_type).toUpperCase();
    return [{
      id: text(aggregate.id), label: `${kind} approved document`, artifactType: aggregate.artifact_type as 'brd' | 'frd' | 'pdd',
      approvedVersionLabel: `Approved version ${number(version.version, 1)}`, lifecycle: 'approved' as const, handoffState,
    }];
  });
};

const projectDelivery = (raw: EnterpriseIntelligenceRawProjection, actorId: string): EnterpriseDeliveryPackageProjection[] => {
  if (raw.deliveryWorkspace) {
    const legacyItemType = {
      epic: 'Epic', story: 'Story', task: 'Task', milestone: 'Milestone', dependency: 'Dependency', risk: 'Risk',
    } as const;
    return raw.deliveryWorkspace.packages.map(item => ({
      id: item.id,
      label: item.label,
      status: item.status === 'approved' ? 'approved'
        : item.status === 'stale' ? 'stale'
          : item.status === 'blocked' || item.status === 'rejected' ? 'blocked'
            : item.status === 'draft' ? 'draft' : 'review',
      currentVersionLabel: `Version ${item.currentVersion}`,
      sourceLabel: item.sourcePackage.planningOnly
        ? `${item.sourcePackage.lineageClassification.replace('_', ' ')} / planning only`
        : item.sourcePackage.lineageClassification.replace('_', ' '),
      lineageState: item.status === 'stale' ? 'stale' : item.status === 'blocked' ? 'blocked' : 'complete',
      items: item.items.map(workItem => ({
        itemType: legacyItemType[workItem.type],
        title: workItem.title,
        acceptanceCriteriaCount: workItem.acceptanceCriteria.length,
        sourceLocator: workItem.sourceCitation?.sectionLocator || 'manual',
      })),
      createdByCurrentActor: false,
    }));
  }
  const versionByPackage = latestBy(raw.deliveryVersions, 'work_package_id');
  return raw.deliveryPackages.flatMap(item => {
    if (!includes(['draft', 'review', 'approved', 'stale', 'blocked'] as const, item.status)) return [];
    const version = versionByPackage.get(text(item.id));
    if (!version) return [];
    const packageItems = raw.deliveryItems.filter(row => text(row.package_version_id) === text(version.id));
    const lineageState = ['stale', 'blocked'].includes(String(item.status)) ? item.status as 'stale' | 'blocked'
      : packageItems.length && packageItems.every(row => text(row.source_section_locator)) ? 'complete' as const : 'blocked' as const;
    return [{
      id: text(item.id), label: `${String(version.artifact_type || 'Studio').toUpperCase()} delivery package`,
      status: item.status as EnterpriseDeliveryPackageProjection['status'], currentVersionLabel: `Package version ${number(version.version, 1)}`,
      sourceLabel: `${String(version.artifact_type || 'Studio').toUpperCase()} approved version ${number(version.studio_version, 1)}`,
      lineageState,
      items: packageItems.map(row => ({
        itemType: includes(['Epic', 'Story', 'Task', 'Milestone', 'Dependency', 'Risk'] as const, row.item_type) ? row.item_type : 'Task',
        title: short(row.title, 400), acceptanceCriteriaCount: array(row.acceptance_criteria).length,
        sourceLocator: short(row.source_section_locator, 400),
      })),
      createdByCurrentActor: text(item.created_by) === actorId,
    }];
  });
};

const projectMonitor = (raw: EnterpriseIntelligenceRawProjection, actorId: string): EnterpriseMonitorProjection[] => raw.monitorBaselines.flatMap(row => {
  if (!includes(['draft', 'approval_required', 'approved', 'blocked', 'stale'] as const, row.status) || !includes(['not_ready', 'review_required'] as const, row.readiness)) return [];
  const approvedItemCount = array(row.approved_item_ids).length;
  return [{
    id: text(row.id), label: 'Delivery baseline', workPackageId: text(row.work_package_id),
    status: row.status as EnterpriseMonitorProjection['status'], readiness: row.readiness as EnterpriseMonitorProjection['readiness'],
    approvedItemCount, lineageComplete: approvedItemCount > 0 && !['blocked', 'stale'].includes(String(row.status)),
    liveTelemetryConnected: false, createdByCurrentActor: text(row.created_by) === actorId,
  }];
});

const projectCanonicalMonitor = (raw: EnterpriseIntelligenceRawProjection): EnterpriseMonitorProjection[] => (
  raw.monitorApprovedBaselines?.baselines.map(row => ({
    id: row.id,
    label: `Approved Delivery baseline v${row.version}`,
    workPackageId: row.workPackageId,
    status: 'approved',
    readiness: row.readiness,
    approvedItemCount: row.acceptedItemCount,
    lineageComplete: true,
    liveTelemetryConnected: false,
    createdByCurrentActor: false,
  })) || []
);

const projectModernization = (raw: EnterpriseIntelligenceRawProjection, actorId: string, applications: Array<{ id: string; name: string }>): EnterpriseModernizationProjection[] => {
  const assessmentById = new Map(raw.modernizationAssessments.map(row => [text(row.id), row]));
  const applicationNames = new Map(applications.map(application => [application.id, application.name]));
  return raw.modernizationDecisions.flatMap(row => {
    if (!includes(['draft', 'review', 'approved', 'rejected', 'stale', 'blocked'] as const, row.status) || !includes(['retain', 'optimize', 'automate_around', 'integrate', 'api_enable_wrap', 'refactor', 'replatform', 'rebuild', 'replace', 'assemble', 'retire', 'insufficient_evidence', 'blocked'] as const, row.primary_disposition)) return [];
    const assessment = assessmentById.get(text(row.modernization_assessment_id));
    const primary = row.primary_disposition as ModernizationDisposition;
    return [{
      id: text(row.id), applicationName: applicationNames.get(text(assessment?.application_ref)) || 'Approved application',
      status: row.status as EnterpriseModernizationProjection['status'], primaryDisposition: primary,
      alternativeDisposition: includes(['retain', 'optimize', 'automate_around', 'integrate', 'api_enable_wrap', 'refactor', 'replatform', 'rebuild', 'replace', 'assemble', 'retire', 'insufficient_evidence', 'blocked'] as const, row.alternative_disposition) ? row.alternative_disposition as ModernizationDisposition : undefined,
      blockers: decodeModernizationBlockers(row.blockers), conflicts: strings(row.conflicts).slice(0, 50),
      assembleEligible: row.status === 'approved' && ASSEMBLE_ELIGIBLE_DISPOSITIONS.includes(primary),
      createdByCurrentActor: text(row.created_by) === actorId,
    }];
  });
};

const blueprintSafety = (value: unknown): AssembleBlueprintDraft['safety'] => {
  const safety = object(value);
  return {
    codeGeneration: false, deployment: false, infrastructureChanges: false,
    credentialAccess: false, sourceSystemCalls: false, runtimeAgents: false,
    ...Object.fromEntries(['codeGeneration', 'deployment', 'infrastructureChanges', 'credentialAccess', 'sourceSystemCalls', 'runtimeAgents'].map(key => [key, safety[key] === false ? false : false])),
  } as AssembleBlueprintDraft['safety'];
};

const projectBlueprints = (raw: EnterpriseIntelligenceRawProjection, actorId: string): EnterpriseBlueprintProjection[] => raw.blueprints.flatMap(row => {
  if (!includes(['draft', 'edit', 'review', 'approval_required', 'approved', 'stale', 'blocked'] as const, row.status) || !includes(ASSEMBLE_ELIGIBLE_DISPOSITIONS, row.disposition)) return [];
  const structured = object(row.structured_content);
  const components = array(structured.components).flatMap(entry => {
    const component = object(entry);
    if (!includes(ASSEMBLE_COMPONENT_CATALOG, component.type)) return [];
    return [{ type: component.type as AssembleComponentType, name: short(component.name, 160), enabled: bool(component.enabled) }];
  });
  const firstHeading = text(structured.readableDocument).split(/\r?\n/).find(line => line.trim().startsWith('# '))?.replace(/^#\s+/, '');
  return [{
    id: text(row.id), name: short(firstHeading, 240) || 'Assemble blueprint', status: row.status as EnterpriseBlueprintProjection['status'],
    versionLabel: `Blueprint version ${number(row.version, 1)}`, disposition: row.disposition as ModernizationDisposition,
    components, safety: blueprintSafety(structured.safety), createdByCurrentActor: text(row.created_by) === actorId,
  }];
});

const approvalResource = (
  actorId: string,
  resourceType: EnterpriseApprovalResourceType,
  id: string,
  label: string,
  status: string,
  createdBy: string,
  raw: EnterpriseIntelligenceRawProjection,
): EnterpriseApprovalResourceProjection => {
  const review = [...raw.reviewEvents].sort(byNewest).find(row => row.resource_type === resourceType && row.resource_id === id);
  const approval = [...raw.approvals].sort(byNewest).find(row => row.resource_type === resourceType && row.resource_id === id);
  const createdByCurrentActor = createdBy === actorId;
  const reviewByCurrentActor = text(review?.reviewer_id) === actorId;
  const approvalState = approval?.outcome === 'approved' ? 'approved' as const : approval?.outcome === 'rejected' ? 'rejected' as const : 'not_recorded' as const;
  const separationOfDuties = approval ? 'complete' as const
    : createdByCurrentActor ? 'creator_cannot_review' as const
      : reviewByCurrentActor ? 'reviewer_cannot_approve' as const
        : review ? 'eligible_for_approval' as const : 'eligible_for_review' as const;
  return {
    id, resourceType, label, status, createdByCurrentActor,
    independentReviewState: !review ? 'not_recorded' : reviewByCurrentActor ? 'recorded_by_you' : 'recorded_by_another',
    approvalState, separationOfDuties,
  };
};

const projectApprovalResources = (
  raw: EnterpriseIntelligenceRawProjection,
  actorId: string,
  candidates: EnterpriseEvidenceCandidateProjection[],
  delivery: EnterpriseDeliveryPackageProjection[],
  monitors: EnterpriseMonitorProjection[],
  modernization: EnterpriseModernizationProjection[],
  blueprints: EnterpriseBlueprintProjection[],
) => [
  ...candidates.filter(item => ['accepted', 'edited'].includes(item.status)).map(item => approvalResource(actorId, 'evidence_candidate', item.id, `${item.field.replaceAll('_', ' ')} evidence`, item.status, text(raw.evidenceCandidates.find(row => row.id === item.id)?.created_by), raw)),
  ...modernization.map(item => approvalResource(actorId, 'modernization_decision', item.id, `${item.applicationName}: ${item.primaryDisposition}`, item.status, text(raw.modernizationDecisions.find(row => row.id === item.id)?.created_by), raw)),
  ...delivery.map(item => approvalResource(actorId, 'delivery_work_package', item.id, item.label, item.status, text(raw.deliveryPackages.find(row => row.id === item.id)?.created_by), raw)),
  ...monitors.map(item => approvalResource(actorId, 'monitor_baseline', item.id, item.label, item.status, text(raw.monitorBaselines.find(row => row.id === item.id)?.created_by), raw)),
  ...blueprints.map(item => approvalResource(actorId, 'assemble_blueprint', item.id, item.name, item.status, text(raw.blueprints.find(row => row.id === item.id)?.created_by), raw)),
];

const commandActivityVisible = (authority: TenantContext, commandType: string) => {
  if (commandType.startsWith('provider.')) {
    if (authority.capabilities.includes('org.admin')) return true;
    const byokManager = authority.capabilities.includes('byok.manage');
    const securityManager = authority.capabilities.includes('security.manage');
    return commandType === 'provider.revoke' ? byokManager && securityManager : byokManager || securityManager;
  }
  if (commandType === 'evidence.source.create' || commandType === 'evidence.extract' || commandType === 'transcript.assess.extract') {
    return authority.capabilities.includes('evidence.write');
  }
  if (commandType === 'evidence.candidate.review' || commandType === 'transcript.assess.candidate.review') {
    return authority.capabilities.includes('evidence.review');
  }
  if (commandType === 'evidence.assess.promote') {
    return hasAny(authority, 'evidence.write', 'evidence.review')
      && authority.capabilities.includes('assessment.edit');
  }
  if (commandType === 'transcript.source-set.create-version' || commandType === 'transcript.input-bundle.lock') {
    return authority.capabilities.includes('transcript.sources.manage');
  }
  if (commandType === 'transcript.assess.apply.preview' || commandType === 'transcript.assess.apply.commit'
    || commandType === 'transcript.assess.conflict.resolve') return authority.capabilities.includes('transcript.assess.apply');
  if (commandType === 'transcript.journey.set-state') return authority.capabilities.includes('transcript.journeys.manage');
  if (commandType === 'modernization.evaluate') return authority.capabilities.includes('portfolio.manage');
  if (commandType === 'approval.review.record' || commandType === 'approval.record') return authority.capabilities.includes('approvals.review');
  if (commandType === 'studio.delivery.handoff') return authority.capabilities.includes('docs.approve');
  if (commandType === 'monitor.baseline.create') return authority.capabilities.includes('monitor.manage');
  if (commandType === 'assemble.blueprint.create') return authority.capabilities.includes('assemble.manage');
  return false;
};

const projectCommandActivity = (
  raw: EnterpriseIntelligenceRawProjection,
  authority: TenantContext,
): EnterpriseCommandActivityProjection[] => raw.commandReceipts.flatMap(row => {
  const commandType = text(row.command_type);
  if (!commandActivityVisible(authority, commandType)) return [];
  if (!includes(['claimed', 'committed', 'failed', 'blocked'] as const, row.status)) return [];
  return [{
    commandType: short(commandType, 120), status: row.status,
    completedAt: text(row.completed_at) || undefined,
    idempotencyState: row.status === 'claimed' ? 'in_progress' as const : row.status === 'committed' ? 'committed' as const : 'stable_failure' as const,
  }];
});

const projectTranscriptFlow = (
  raw: EnterpriseIntelligenceRawProjection,
  authority: TenantContext,
  generatedAt: Date,
): TranscriptFlowProjection => {
  const sourcesVisible = authority.capabilities.includes('transcript.sources.read');
  const assessVisible = authority.capabilities.includes('assess.v2.read');
  if (!sourcesVisible && !assessVisible) return emptyTranscriptFlowProjection();
  const flags = raw.transcriptFlags[0];
  const sourceSetsEnabledForWorkspace = bool(flags?.transcript_source_sets_enabled);
  const assessMultisourceApplyEnabledForWorkspace = bool(flags?.assess_multisource_apply_enabled);
  const sourceSetsEnabled = (sourcesVisible || assessVisible) && sourceSetsEnabledForWorkspace;
  const assessMultisourceApplyEnabled = assessVisible && assessMultisourceApplyEnabledForWorkspace;
  const disabledReason = assessVisible
    ? sourceSetsEnabledForWorkspace && assessMultisourceApplyEnabledForWorkspace
      ? undefined
      : 'Governed multi-source transcript processing is disabled for this workspace.'
    : sourceSetsEnabledForWorkspace
      ? undefined
      : 'Governed transcript source sets are disabled for this workspace.';
  const sourceById = new Map(raw.transcriptSources.map(source => [text(source.id), source]));
  const versionById = new Map(raw.transcriptSourceVersions.map(version => [text(version.id), version]));
  const studioPrivateVersionIds = new Set((raw.studioSourceOwnerships || []).map(row => text(row.source_version_id)));
  const setVersionById = new Map(raw.transcriptSourceSetVersions.map(version => [text(version.id), version]));
  const setById = new Map(raw.transcriptSourceSets.map(sourceSet => [text(sourceSet.id), sourceSet]));
  const bundleVersionById = new Map(raw.transcriptInputBundleVersions.map(version => [text(version.id), version]));
  const applicationByPreview = new Map((assessVisible ? raw.transcriptCandidateApplications : []).map(application => [text(application.preview_id), application]));
  const candidateById = new Map((assessVisible ? raw.transcriptCandidates : []).map(candidate => [text(candidate.id), candidate]));
  const bindingByJobId = new Map((assessVisible ? raw.transcriptExtractionBindings : []).map(binding => [text(binding.job_id), binding]));
  const staleResources = new Set((assessVisible ? raw.transcriptStalenessEvents : []).map(event => `${text(event.resource_kind)}:${text(event.resource_id)}`));
  const relationshipByCandidate = new Map<string, Row>();
  (assessVisible ? raw.transcriptCandidateRelationships : []).forEach(relationship => {
    const candidateId = text(relationship.candidate_id);
    if (candidateId && !relationshipByCandidate.has(candidateId)) relationshipByCandidate.set(candidateId, relationship);
  });

  const sourceState = (source: Row | undefined, version: Row | undefined) => {
    if (!source || !version) return 'missing' as const;
    if (source.status === 'deleted') return 'deleted' as const;
    if (source.status === 'failed' || version.extraction_status === 'failed' || version.extraction_failure_code) return 'failed' as const;
    return version.extraction_status === 'parsed' ? 'ready' as const : 'missing' as const;
  };

  const reusedVersions = new Set(raw.transcriptSourceSetItems.map(item => text(item.source_version_id)));
  const sourceVersions = raw.transcriptSourceVersions.flatMap(version => {
    const source = sourceById.get(text(version.source_id));
    const state = sourceState(source, version);
    if (!source || studioPrivateVersionIds.has(text(version.id)) || !uuid.test(text(source.id)) || !uuid.test(text(version.id)) || !includes(SUPPORTED_EVIDENCE_MIME_TYPES, source.mime_type)) return [];
    return [{
      sourceId: text(source.id),
      versionSelector: text(version.id),
      displayName: short(source.display_name, 240),
      versionLabel: `Source version ${number(version.version, 1)}`,
      mimeType: source.mime_type as SupportedEvidenceMimeType,
      extractedCharacterCount: Math.max(0, number(version.extracted_character_count)),
      state: state === 'missing' ? 'pending' as const : state,
      selectable: state === 'ready',
      reuseState: reusedVersions.has(text(version.id)) ? 'already_selected_elsewhere' as const : 'unused' as const,
    }];
  });

  const sourceSets = raw.transcriptSourceSets.flatMap(sourceSet => {
    if (sourceSet.owner_module !== 'assess' || !uuid.test(text(sourceSet.id))
      || !includes(['draft', 'locked', 'superseded', 'archived'] as const, sourceSet.status)) return [];
    const version = raw.transcriptSourceSetVersions.find(candidate => text(candidate.source_set_id) === text(sourceSet.id)
      && number(candidate.version) === number(sourceSet.current_version));
    if (!version || !uuid.test(text(version.id))) return [];
    const exactMemberRows = raw.transcriptSourceSetItems.filter(item => text(item.source_set_version_id) === text(version.id));
    if (exactMemberRows.some(item => studioPrivateVersionIds.has(text(item.source_version_id)))) return [];
    const members = exactMemberRows
      .sort((left, right) => number(left.ordinal) - number(right.ordinal))
      .flatMap((item, index) => {
        const source = sourceById.get(text(item.source_id));
        const sourceVersion = versionById.get(text(item.source_version_id));
        const state = sourceState(source, sourceVersion);
        if (!source || !sourceVersion || !includes(TRANSCRIPT_SOURCE_ROLES, item.semantic_role)) return [];
        return [{
          sourceId: text(item.source_id), versionSelector: text(item.source_version_id), displayName: short(source.display_name, 240),
          versionLabel: `Source version ${number(sourceVersion.version, 1)}`, ordinal: index + 1,
          role: item.semantic_role as TranscriptSourceRole, note: short(item.user_note, 500) || undefined,
          extractedCharacterCount: Math.max(0, number(item.extracted_character_count)), state,
        }];
      });
    const blockers = [
      ...(members.length !== number(version.source_count) ? ['SOURCE_SET_MEMBERSHIP_INCOMPLETE'] : []),
      ...(members.some(member => member.state !== 'ready') ? ['SOURCE_SET_MEMBER_NOT_READY'] : []),
      ...(number(version.extracted_character_count) > 2_000_000 ? ['SOURCE_SET_CHARACTER_LIMIT'] : []),
    ];
    return [{
      id: text(sourceSet.id), versionSelector: text(version.id), version: number(version.version, 1), ownerModule: 'assess' as const,
      label: short(sourceSet.display_label, 240), description: short(sourceSet.description, 1_000) || undefined,
      versionLabel: `Source-set version ${number(version.version, 1)}`,
      status: sourceSet.status as 'draft' | 'locked' | 'superseded' | 'archived',
      sourceCount: number(version.source_count), extractedCharacterCount: number(version.extracted_character_count), members,
      lockState: blockers.length ? 'blocked' as const : version.status === 'locked' ? 'locked' as const : 'ready' as const,
      blockers, updatedAt: text(sourceSet.updated_at) || generatedAt.toISOString(),
    }];
  });

  const inputBundles = raw.transcriptInputBundles.flatMap(bundle => {
    if (bundle.owner_module !== 'assess' || !uuid.test(text(bundle.id))) return [];
    const version = raw.transcriptInputBundleVersions.find(candidate => text(candidate.input_bundle_id) === text(bundle.id)
      && number(candidate.version) === number(bundle.current_version));
    if (!version || !uuid.test(text(version.id)) || !includes(['draft', 'locked', 'superseded'] as const, version.status)) return [];
    const items = raw.transcriptInputBundleItems.filter(item => text(item.input_bundle_version_id) === text(version.id)).sort((left, right) => number(left.ordinal) - number(right.ordinal));
    const referencedSetVersions = items.flatMap(item => {
      const setVersion = setVersionById.get(text(item.source_set_version_id));
      return setVersion && text(setVersion.source_set_id) === text(item.source_set_id) ? [setVersion] : [];
    });
    if (referencedSetVersions.length !== items.length) return [];
    const sourceSetVersions = items.map((item, index) => ({
      sourceSetId: text(item.source_set_id), sourceSetVersionSelector: text(item.source_set_version_id),
      sourceSetVersion: number(referencedSetVersions[index].version, 1), ordinal: index + 1,
    }));
    if (sourceSetVersions.some(item => !uuid.test(item.sourceSetId) || !uuid.test(item.sourceSetVersionSelector))) return [];
    const sourceVersionSelectors = referencedSetVersions.flatMap(setVersion => raw.transcriptSourceSetItems
      .filter(item => text(item.source_set_version_id) === text(setVersion.id))
      .sort((left, right) => number(left.ordinal) - number(right.ordinal))
      .map(item => text(item.source_version_id)));
    if (sourceVersionSelectors.some(sourceVersionId => studioPrivateVersionIds.has(sourceVersionId))) return [];
    return [{
      id: text(bundle.id), versionSelector: text(version.id), version: number(version.version, 1), ownerModule: 'assess' as const,
      label: short(items[0]?.declared_purpose, 240) || `Assess input bundle ${number(version.version, 1)}`,
      versionLabel: `Input-bundle version ${number(version.version, 1)}`,
      status: staleResources.has(`input_bundle_version:${text(version.id)}`) ? 'superseded' as const : version.status as 'draft' | 'locked' | 'superseded',
      sourceSetIds: sourceSetVersions.map(item => item.sourceSetId), sourceSetVersions, sourceVersionSelectors,
      sourceCount: sourceVersionSelectors.length,
      extractedCharacterCount: referencedSetVersions.reduce((total, item) => total + number(item.extracted_character_count), 0),
      lockedAt: version.status === 'locked' ? text(version.created_at) || generatedAt.toISOString() : undefined,
    }];
  });

  const journeys = (assessVisible ? raw.transcriptJourneys : []).flatMap(journey => {
    if (!uuid.test(text(journey.id)) || journey.entry_module !== 'assess' || journey.current_module !== 'assess'
      || journey.lineage_classification !== 'assessed' || !includes(['assess', 'studio', 'delivery', 'monitor'] as const, journey.desired_exit_module)
      || !includes(['active', 'stopped', 'completed', 'blocked', 'archived'] as const, journey.status)) return [];
    return [{
      id: text(journey.id), entryModule: 'assess' as const, desiredExitModule: journey.desired_exit_module as 'assess' | 'studio' | 'delivery' | 'monitor',
      currentModule: 'assess' as const, lineage: 'assessed' as const, planningOnly: bool(journey.planning_only),
      status: journey.status as 'active' | 'stopped' | 'completed' | 'blocked' | 'archived', version: number(journey.version, 1),
      updatedAt: text(journey.updated_at) || generatedAt.toISOString(),
    }];
  });

  const assessCandidates = (assessVisible ? raw.transcriptCandidates : []).flatMap(candidate => {
    const source = sourceById.get(text(candidate.source_id));
    const sourceVersion = versionById.get(text(candidate.source_version_id));
    const binding = bindingByJobId.get(text(candidate.ai_job_id));
    const boundSourceSetVersion = setVersionById.get(text(binding?.source_set_version_id));
    const boundBundle = inputBundles.find(bundle => bundle.id === text(binding?.input_bundle_id)
      && bundle.versionSelector === text(binding?.input_bundle_version_id));
    if (!source || !sourceVersion || studioPrivateVersionIds.has(text(candidate.source_version_id)) || !binding || !boundSourceSetVersion || !uuid.test(text(candidate.id))
      || text(binding.source_id) !== text(candidate.source_id) || text(binding.source_version_id) !== text(candidate.source_version_id)
      || text(boundSourceSetVersion.source_set_id) !== text(binding.source_set_id)
      || !boundBundle || !boundBundle.sourceSetVersions.some(lineage => lineage.sourceSetId === text(binding.source_set_id)
        && lineage.sourceSetVersionSelector === text(binding.source_set_version_id)
        && lineage.sourceSetVersion === number(boundSourceSetVersion.version, 1))
      || !boundBundle.sourceVersionSelectors.includes(text(candidate.source_version_id))
      || !includes(['suggested', 'accepted', 'rejected', 'edited'] as const, candidate.suggestion_status)) return [];
    const latestPreview = (assessVisible ? raw.transcriptApplyPreviews : []).find(preview => text(preview.candidate_id) === text(candidate.id));
    const relationship = relationshipByCandidate.get(text(candidate.id));
    const exactReview = relationship && number(relationship.candidate_version) === number(candidate.version, 1)
      && text(relationship.source_id) === text(candidate.source_id)
      && text(relationship.source_version_id) === text(candidate.source_version_id)
      && text(relationship.input_bundle_id) === boundBundle.id
      && text(relationship.input_bundle_version_id) === boundBundle.versionSelector ? relationship : undefined;
    const reviewedIntent = exactReview?.suggested_application_intent;
    const reviewedTarget = text(exactReview?.suggested_apply_target);
    const safeReviewedTarget = (reviewedIntent === 'set_case_field' && ['name', 'description'].includes(reviewedTarget))
      || (reviewedIntent === 'link_evidence_only' && reviewedTarget === 'evidence');
    const intent = includes(TRANSCRIPT_ASSESS_APPLICATION_INTENTS, latestPreview?.application_intent)
      ? latestPreview?.application_intent as TranscriptAssessApplicationIntent
      : safeReviewedTarget ? reviewedIntent as TranscriptAssessApplicationIntent : 'link_evidence_only' as const;
    const value = text(candidate.value);
    if (!isUnicodeScalarString(value) || Array.from(value).length > 12_000) return [];
    return [{
      id: text(candidate.id), candidateVersion: number(candidate.version, 1),
      inputBundleId: text(binding.input_bundle_id), inputBundleVersionSelector: text(binding.input_bundle_version_id),
      extractionBindingId: text(binding.id), extractionJobId: text(binding.job_id),
      sourceSetId: text(binding.source_set_id), sourceSetVersionSelector: text(binding.source_set_version_id),
      sourceSetVersion: number(boundSourceSetVersion.version, 1),
      sourceId: text(source.id), sourceVersionSelector: text(sourceVersion.id), sourceLabel: short(source.display_name, 240),
      sourceVersionLabel: `Source version ${number(sourceVersion.version, 1)}`, field: short(candidate.field_key, 160), value,
      safeExcerpt: short(candidate.safe_excerpt, 1_000) || undefined, sourceLocator: short(candidate.source_locator, 400),
      confidence: Math.max(0, Math.min(1, number(candidate.confidence))), status: candidate.suggestion_status as 'suggested' | 'accepted' | 'rejected' | 'edited',
      relationship: includes(['neutral', 'supporting', 'contradictory'] as const, exactReview?.relationship)
        ? exactReview?.relationship as 'neutral' | 'supporting' | 'contradictory' : 'neutral' as const,
      applicationIntent: intent, applyTarget: short(latestPreview?.target_key, 240) || (safeReviewedTarget ? reviewedTarget : undefined),
      provenanceState: candidate.source_locator ? 'anchored' as const : 'incomplete' as const,
      reviewState: !candidate.reviewed_by ? 'pending' as const : text(candidate.reviewed_by) === authority.userId ? 'reviewed_by_you' as const : 'reviewed_by_another' as const,
      editCount: Math.max(0, number(candidate.version, 1) - 1), reviewedAt: text(candidate.reviewed_at) || undefined,
    }];
  });

  const conflictProjections: TranscriptAssessConflictProjection[] = (assessVisible ? raw.transcriptConflicts : []).flatMap(conflict => {
    if (!uuid.test(text(conflict.id)) || !includes(TRANSCRIPT_ASSESS_APPLICATION_INTENTS, conflict.application_intent)) return [];
    const candidateIds = strings(conflict.candidate_ids).filter(id => uuid.test(id));
    const resolution = (assessVisible ? raw.transcriptConflictResolutions : []).find(item => text(item.conflict_id) === text(conflict.id)
      && number(item.version) === number(conflict.current_resolution_version));
    const resolutionValue = includes(['choose_candidate', 'retain_manual', 'authored_resolution', 'unresolved'] as const, resolution?.resolution)
      ? resolution?.resolution as 'choose_candidate' | 'retain_manual' | 'authored_resolution' | 'unresolved' : 'unresolved' as const;
    const authoredValue = resolution?.authored_value;
    return [{
      id: text(conflict.id), field: short(conflict.target_key, 240), candidateIds,
      candidateSummaries: candidateIds.map(candidateId => short(candidateById.get(candidateId)?.value, 1_000) || 'Selected evidence candidate'),
      material: bool(conflict.is_material), resolution: resolutionValue,
      resolvedValue: resolutionValue === 'choose_candidate'
        ? boundedUnicodeScalarString(candidateById.get(text(resolution?.chosen_candidate_id))?.value, 12_000)
        : resolutionValue === 'authored_resolution' ? boundedUnicodeScalarString(authoredValue, 12_000) : undefined,
      rationale: short(resolution?.rationale, 2_000) || undefined, resolutionVersion: number(conflict.current_resolution_version),
    }];
  });

  const assessApplyPreviews = (assessVisible ? raw.transcriptApplyPreviewBatches : []).flatMap(batch => {
    const batchId = text(batch.id);
    const batchPreviewIds = strings(batch.preview_ids).filter(id => uuid.test(id));
    const previews = batchPreviewIds.flatMap(id => {
      const preview = (assessVisible ? raw.transcriptApplyPreviews : []).find(candidate => text(candidate.id) === id);
      return preview ? [preview] : [];
    });
    const first = previews[0];
    const bundleVersion = bundleVersionById.get(text(batch.input_bundle_version_id));
    const sourceSetVersionSelectors = strings(batch.source_set_version_ids).filter(id => uuid.test(id));
    if (!first || previews.length !== batchPreviewIds.length || !uuid.test(batchId)
      || !uuid.test(text(batch.input_bundle_id)) || !uuid.test(text(batch.input_bundle_version_id))
      || !bundleVersion || sourceSetVersionSelectors.length < 1
      || text(first.assess_case_id) !== text(batch.assess_case_id)
      || number(first.expected_case_version) !== number(batch.expected_case_version)) return [];
    const previewIds = previews.map(preview => text(preview.id)).filter(id => uuid.test(id));
    const candidateIds = previews.map(preview => text(preview.candidate_id)).filter(id => uuid.test(id));
    const conflicts = conflictProjections.filter(conflict => conflict.candidateIds.some(candidateId => candidateIds.includes(candidateId)));
    const allApplied = previewIds.every(previewId => applicationByPreview.has(previewId));
    const expiresAt = previews.map(preview => text(preview.expires_at)).filter(value => Number.isFinite(Date.parse(value))).sort()[0] || generatedAt.toISOString();
    const stale = Date.parse(expiresAt) <= generatedAt.getTime()
      || staleResources.has(`apply_preview_batch:${batchId}`)
      || staleResources.has(`input_bundle_version:${text(batch.input_bundle_version_id)}`)
      || previewIds.some(id => staleResources.has(`apply_preview:${id}`));
    return [{
      id: batchId, previewIds, assessDraftId: text(first.assess_case_id), inputBundleId: text(batch.input_bundle_id),
      inputBundleVersionSelector: text(batch.input_bundle_version_id), inputBundleVersion: number(bundleVersion.version, 1),
      sourceSetVersionSelectors,
      expectedDraftVersion: number(first.expected_case_version, 1), candidateIds,
      changes: previews.flatMap(preview => includes(TRANSCRIPT_ASSESS_APPLICATION_INTENTS, preview.application_intent) ? [{
        candidateId: text(preview.candidate_id), intent: preview.application_intent as TranscriptAssessApplicationIntent,
        target: short(preview.target_key, 240), summary: short(candidateById.get(text(preview.candidate_id))?.value, 1_000) || 'Selected evidence candidate',
        conflictState: conflicts.some(conflict => conflict.candidateIds.includes(text(preview.candidate_id))) ? 'cross_source_conflict' as const : 'none' as const,
      }] : []),
      conflicts, status: allApplied ? 'applied' as const : stale ? 'stale' as const
        : conflicts.some(conflict => conflict.material && conflict.resolution === 'unresolved') ? 'blocked' as const : 'ready' as const,
      expiresAt,
    }];
  });

  const jobsById = new Map((assessVisible ? raw.transcriptJobs : []).map(job => [text(job.id), job]));
  const bindingsByBundleVersion = new Map<string, Row[]>();
  (assessVisible ? raw.transcriptExtractionBindings : []).forEach(binding => {
    const bundleVersionId = text(binding.input_bundle_version_id);
    bindingsByBundleVersion.set(bundleVersionId, [...(bindingsByBundleVersion.get(bundleVersionId) || []), binding]);
  });
  const assessRuns = [...bindingsByBundleVersion.entries()].flatMap(([bundleVersionId, bindings]) => {
    const bundle = inputBundles.find(item => item.versionSelector === bundleVersionId);
    const jobs = bindings.map(binding => jobsById.get(text(binding.job_id))).filter((job): job is Row => Boolean(job));
    if (!bundle || !bindings[0] || !uuid.test(text(bindings[0].id))) return [];
    const succeeded = jobs.filter(job => job.status === 'succeeded').length;
    const failure = jobs.find(job => job.status === 'failed' || job.status === 'blocked');
    const stale = staleResources.has(`input_bundle_version:${bundleVersionId}`)
      || bindings.some(binding => staleResources.has(`extraction_binding:${text(binding.id)}`));
    const state = stale ? 'blocked' as const
      : failure ? (failure.status === 'blocked' ? 'blocked' as const : 'failed' as const)
      : jobs.some(job => job.status === 'running' || job.status === 'queued') ? 'processing' as const
        : succeeded >= bundle.sourceCount && bundle.sourceCount > 0 ? 'review_required' as const : 'requested' as const;
    const extractionBindings = bindings.flatMap(binding => {
      const boundSourceSetVersion = setVersionById.get(text(binding.source_set_version_id));
      if (!boundSourceSetVersion || text(boundSourceSetVersion.source_set_id) !== text(binding.source_set_id)) return [];
      const projected = {
        extractionBindingId: text(binding.id), extractionJobId: text(binding.job_id),
        sourceSetId: text(binding.source_set_id), sourceSetVersionSelector: text(binding.source_set_version_id),
        sourceSetVersion: number(boundSourceSetVersion.version, 1), sourceVersionSelector: text(binding.source_version_id),
      };
      return Object.values(projected).some(value => typeof value === 'string' && !uuid.test(value)) ? [] : [projected];
    });
    if (extractionBindings.length !== bindings.length || extractionBindings.some(binding => !bundle.sourceSetVersions.some(lineage =>
      lineage.sourceSetId === binding.sourceSetId && lineage.sourceSetVersionSelector === binding.sourceSetVersionSelector
      && lineage.sourceSetVersion === binding.sourceSetVersion))) return [];
    const extractionBindingIds = extractionBindings.map(binding => binding.extractionBindingId);
    const extractionJobIds = extractionBindings.map(binding => binding.extractionJobId);
    const sourceVersionSelectors = extractionBindings.map(binding => binding.sourceVersionSelector);
    return [{
      id: text(bindings[0].id), inputBundleId: bundle.id, inputBundleVersionSelector: bundleVersionId,
      extractionBindingIds, extractionJobIds, extractionBindings, sourceSetVersions: bundle.sourceSetVersions, sourceVersionSelectors,
      state, selectedSourceCount: bundle.sourceCount, completedSourceCount: succeeded,
      candidateCount: (assessVisible ? raw.transcriptCandidates : []).filter(candidate => extractionJobIds.includes(text(candidate.ai_job_id))).length,
      failureCode: stale ? 'SOURCE_INCOMPLETE' as const
        : text(failure?.failure_class).includes('BUDGET') ? 'BUDGET_EXHAUSTED' as const
          : failure ? 'PROVIDER_UNAVAILABLE' as const : undefined,
      updatedAt: text(failure?.completed_at || bindings[0].created_at) || generatedAt.toISOString(),
    }];
  });

  return {
    schemaVersion: TRANSCRIPT_FLOW_PROJECTION_VERSION,
    features: { sourceSetsEnabled, assessMultisourceApplyEnabled, ...(disabledReason ? { disabledReason } : {}) },
    sourceVersions: sourcesVisible ? sourceVersions : [],
    sourceSets: sourcesVisible ? sourceSets : [],
    inputBundles: sourcesVisible ? inputBundles : [],
    journeys: assessVisible ? journeys : [],
    assessCandidates: assessVisible ? assessCandidates : [],
    assessConflicts: assessVisible ? conflictProjections : [],
    assessApplyPreviews: assessVisible ? assessApplyPreviews : [],
    assessRuns: assessVisible ? assessRuns : [],
  };
};

const projectStudioSourceFlow = (
  raw: EnterpriseIntelligenceRawProjection,
  authority: TenantContext,
): StudioSourceFlowProjection => {
  const visibility = projectionVisibility(authority);
  if (!visibility.studioSourcesVisible) return emptyStudioSourceFlowProjection();
  const studioSourceFlags = raw.studioSourceFlags || [];
  const studioSources = raw.studioSources || [];
  const studioSourceVersions = raw.studioSourceVersions || [];
  const studioSourceCandidates = raw.studioSourceCandidates || [];
  const studioSourceSets = raw.studioSourceSets || [];
  const studioSourceSetVersions = raw.studioSourceSetVersions || [];
  const studioSourceSetItems = raw.studioSourceSetItems || [];
  const studioInputBundles = raw.studioInputBundles || [];
  const studioInputBundleVersions = raw.studioInputBundleVersions || [];
  const studioInputBundleItems = raw.studioInputBundleItems || [];
  const studioExtractionRuns = raw.studioExtractionRuns || [];
  const studioExtractionBindings = raw.studioExtractionBindings || [];
  const studioCandidateEdits = raw.studioCandidateEdits || [];
  const studioProviderRoutes = raw.studioProviderRoutes || [];
  const flags = studioSourceFlags[0] || {};
  const featureEnabled = bool(flags.studio_multisource_enabled) && bool(flags.studio_source_integration_enabled);
  const canMutate = featureEnabled && authority.capabilities.includes('studio.sources.manage');
  const routeRows = studioProviderRoutes.filter(route => route.deleted_at === null || route.deleted_at === undefined);
  const providerRouteEnabled = routeRows.some(route => bool(route.enabled));
  const providerEnabled = canMutate && bool(flags.unified_byok_gateway_enabled) && providerRouteEnabled;
  const reason = !featureEnabled ? 'disabled' as const
    : !canMutate ? 'read_only' as const
      : !bool(flags.unified_byok_gateway_enabled) ? 'provider_disabled' as const
        : routeRows.length === 0 ? 'route_unavailable' as const
          : !providerRouteEnabled ? 'provider_disabled' as const : undefined;

  const sourceById = new Map(studioSources.map(row => [text(row.id), row]));
  const sourceVersionById = new Map(studioSourceVersions.map(row => [text(row.id), row]));
  const reusedVersions = new Set(studioSourceSetItems.map(row => text(row.source_version_id)));
  const sources = studioSourceVersions.flatMap(version => {
    const source = sourceById.get(text(version.source_id));
    if (!source || !uuid.test(text(source.id)) || !uuid.test(text(version.id))) return [];
    const deleted = source.deleted_at !== null && source.deleted_at !== undefined;
    const extractionStatus = text(version.extraction_status);
    const state = deleted ? 'deleted' as const : extractionStatus === 'parsed' ? 'ready' as const
      : extractionStatus.startsWith('failed') ? 'failed' as const : 'pending' as const;
    const extractedCharacterCount = Math.max(0, number(version.extracted_character_count));
    return [{ sourceId: text(source.id), versionSelector: text(version.id), displayName: short(source.display_name, 240) || 'Studio source',
      versionLabel: `v${Math.max(1, number(version.version, 1))}`, mimeType: short(source.mime_type, 160) || 'application/octet-stream',
      extractedCharacterCount, state, selectable: state === 'ready' && extractedCharacterCount > 0 && extractedCharacterCount <= 500_000,
      reuseState: reusedVersions.has(text(version.id)) ? 'already_selected_elsewhere' as const : 'unused' as const }];
  }).slice(0, 2000);

  const setRootById = new Map(studioSourceSets.map(row => [text(row.id), row]));
  const sourceSets = studioSourceSetVersions.flatMap(version => {
    const root = setRootById.get(text(version.source_set_id));
    if (!root || root.owner_module !== 'studio' || !uuid.test(text(root.id)) || !uuid.test(text(version.id))) return [];
    const members = studioSourceSetItems.filter(row => text(row.source_set_version_id) === text(version.id))
      .sort((left, right) => number(left.ordinal) - number(right.ordinal)).map(row => {
        const sourceVersion = sourceVersionById.get(text(row.source_version_id));
        const source = sourceById.get(text(row.source_id));
        const sourceDeleted = Boolean(source && source.deleted_at !== null && source.deleted_at !== undefined);
        const memberState = !source || !sourceVersion ? 'missing' as const : sourceDeleted ? 'deleted' as const
          : sourceVersion.extraction_status === 'parsed' ? 'ready' as const
            : text(sourceVersion.extraction_status).startsWith('failed') ? 'failed' as const : 'missing' as const;
        return { sourceId: text(row.source_id), versionSelector: text(row.source_version_id),
          displayName: short(source?.display_name, 240) || 'Unavailable Studio source',
          versionLabel: `v${Math.max(1, number(sourceVersion?.version, 1))}`, ordinal: number(row.ordinal),
          role: includes(TRANSCRIPT_SOURCE_ROLES, row.semantic_role) ? row.semantic_role : 'reference' as const,
          ...(short(row.user_note, 500) ? { note: short(row.user_note, 500) } : {}),
          extractedCharacterCount: Math.max(0, number(row.extracted_character_count)), state: memberState };
      });
    if (members.length < 1 || members.length > 20 || members.some((member, index) => member.ordinal !== index + 1)) return [];
    const blockers = [...new Set(members.filter(member => member.state !== 'ready').map(member => (
      member.state === 'missing' ? 'STUDIO_SOURCE_OWNERSHIP_OR_VERSION_MISSING' : `STUDIO_SOURCE_${member.state.toUpperCase()}`
    )))];
    const rootStatus = text(root.status);
    const versionStatus = text(version.status);
    const status = rootStatus === 'archived' ? 'archived' as const
      : includes(['draft', 'locked', 'superseded'] as const, versionStatus) ? versionStatus : 'draft' as const;
    return [{ id: text(root.id), versionSelector: text(version.id), version: Math.max(1, number(version.version, 1)), ownerModule: 'studio' as const,
      label: short(root.display_label, 240) || 'Studio source set', ...(short(root.description, 1_000) ? { description: short(root.description, 1_000) } : {}),
      versionLabel: `v${Math.max(1, number(version.version, 1))}`, status, sourceCount: members.length,
      extractedCharacterCount: Math.max(0, number(version.extracted_character_count)), members,
      lockState: blockers.length ? 'blocked' as const : status === 'locked' ? 'locked' as const : 'ready' as const,
      blockers, updatedAt: text(root.updated_at) || text(version.created_at) }];
  }).slice(0, 400);

  const setVersionById = new Map(sourceSets.map(set => [set.versionSelector, set]));
  const bundleRootById = new Map(studioInputBundles.map(row => [text(row.id), row]));
  const inputBundles = studioInputBundleVersions.flatMap(version => {
    const root = bundleRootById.get(text(version.input_bundle_id));
    if (!root || root.owner_module !== 'studio' || !uuid.test(text(root.id)) || !uuid.test(text(version.id))) return [];
    const items = studioInputBundleItems.filter(row => text(row.input_bundle_version_id) === text(version.id))
      .sort((left, right) => number(left.ordinal) - number(right.ordinal));
    const setVersions = items.map((row, index) => ({ row, set: setVersionById.get(text(row.source_set_version_id)), ordinal: index + 1 }));
    if (setVersions.length < 1 || setVersions.length > 20 || setVersions.some(item => !item.set || number(item.row.ordinal) !== item.ordinal)) return [];
    const sourceVersionSelectors = [...new Set(setVersions.flatMap(item => item.set!.members.map(member => member.versionSelector)))];
    if (sourceVersionSelectors.length < 1 || sourceVersionSelectors.length > 20) return [];
    const bundleStatus = includes(['draft', 'locked', 'superseded'] as const, version.status) ? version.status : 'draft' as const;
    return [{ id: text(root.id), versionSelector: text(version.id), version: Math.max(1, number(version.version, 1)), ownerModule: 'studio' as const,
      label: `Studio source bundle v${Math.max(1, number(version.version, 1))}`, versionLabel: `v${Math.max(1, number(version.version, 1))}`,
      status: bundleStatus, sourceSetIds: setVersions.map(item => item.set!.id),
      sourceSetVersions: setVersions.map(item => ({ sourceSetId: item.set!.id, sourceSetVersionSelector: item.set!.versionSelector,
        sourceSetVersion: item.set!.version, ordinal: item.ordinal })), sourceVersionSelectors,
      sourceCount: sourceVersionSelectors.length, extractedCharacterCount: sourceVersionSelectors.reduce((sum, id) => (
        sum + Math.max(0, number(sourceVersionById.get(id)?.extracted_character_count))
      ), 0), ...(bundleStatus === 'locked' ? { lockedAt: text(version.created_at) } : {}) }];
  }).slice(0, 400);

  const bindingsByJob = new Map<string, Row[]>();
  studioExtractionBindings.forEach(binding => bindingsByJob.set(text(binding.job_id), [...(bindingsByJob.get(text(binding.job_id)) || []), binding]));
  const extractionJobs = studioExtractionRuns.flatMap(run => {
    if (![run.job_id, run.input_bundle_id, run.input_bundle_version_id].every(value => uuid.test(text(value)))) return [];
    const status = includes(['running', 'staged', 'succeeded', 'failed', 'uncertain'] as const, run.status) ? run.status : 'requested' as const;
    const bindingCount = (bindingsByJob.get(text(run.job_id)) || []).length;
    if (bindingCount < 1) return [];
    return [{ id: text(run.job_id), inputBundleId: text(run.input_bundle_id), inputBundleVersionId: text(run.input_bundle_version_id),
      inputBundleVersion: Math.max(1, number(run.input_bundle_version, 1)), status,
      candidateCount: Math.max(0, number(run.candidate_count)), bindingCount, createdAt: text(run.created_at),
      ...(run.completed_at ? { completedAt: text(run.completed_at) } : {}) }];
  }).slice(0, 400);

  const editCountByCandidate = new Map<string, number>();
  studioCandidateEdits.forEach(edit => editCountByCandidate.set(text(edit.candidate_id), (editCountByCandidate.get(text(edit.candidate_id)) || 0) + 1));
  const candidates = studioSourceCandidates.flatMap(candidate => {
    const binding = studioExtractionBindings.find(row => text(row.job_id) === text(candidate.ai_job_id)
      && text(row.source_id) === text(candidate.source_id) && text(row.source_version_id) === text(candidate.source_version_id));
    const source = sourceById.get(text(candidate.source_id));
    const sourceVersion = sourceVersionById.get(text(candidate.source_version_id));
    if (!binding || !source || !sourceVersion || !uuid.test(text(candidate.id)) || !uuid.test(text(binding.id))) return [];
    if (!includes(['suggested', 'accepted', 'rejected', 'edited'] as const, candidate.suggestion_status)) return [];
    const reviewedAt = text(candidate.reviewed_at);
    const reviewState = candidate.suggestion_status === 'suggested' ? 'pending' as const
      : text(candidate.reviewed_by) === authority.userId ? 'reviewed_by_you' as const : 'reviewed_by_another' as const;
    return [{ id: text(candidate.id), candidateVersion: Math.max(1, number(candidate.version, 1)),
      inputBundleId: text(binding.input_bundle_id), inputBundleVersionId: text(binding.input_bundle_version_id),
      inputBundleVersion: Math.max(1, number(binding.input_bundle_version, 1)), extractionBindingId: text(binding.id),
      extractionJobId: text(binding.job_id), sourceSetId: text(binding.source_set_id), sourceSetVersionId: text(binding.source_set_version_id),
      sourceSetVersion: Math.max(1, number(binding.source_set_version, 1)), sourceId: text(candidate.source_id),
      sourceVersionId: text(candidate.source_version_id), sourceLabel: short(source.display_name, 240) || 'Studio source',
      sourceVersionLabel: `v${Math.max(1, number(sourceVersion.version, 1))}`, field: short(candidate.field_key, 240) || 'unresolved_questions',
      value: boundedUnicodeScalarString(candidate.value, 12_000) || 'Unavailable candidate value',
      ...(short(candidate.safe_excerpt, 500) ? { safeExcerpt: short(candidate.safe_excerpt, 500) } : {}),
      sourceLocator: short(candidate.source_locator, 500) || 'source', confidence: Math.min(1, Math.max(0, number(candidate.confidence))),
      status: candidate.suggestion_status, provenanceState: /^[0-9a-f]{64}$/.test(text(candidate.provenance_hash))
        && /^[0-9a-f]{64}$/.test(text(candidate.excerpt_hash)) ? 'anchored' as const : 'incomplete' as const,
      reviewState, editCount: editCountByCandidate.get(text(candidate.id)) || 0,
      ...(reviewedAt ? { reviewedAt } : {}) }];
  }).slice(0, 2000);

  return { featureState: { sourceMutationsEnabled: canMutate, providerExtractionEnabled: providerEnabled, ...(reason ? { reason } : {}) },
    sources, sourceSets, inputBundles, extractionJobs, candidates };
};

const projectAssessDocumentMapping = (
  raw: EnterpriseIntelligenceRawProjection,
  authority: TenantContext,
): AssessDocumentMappingProjection => {
  const canRead = authority.capabilities.includes('assess.v2.read') && authority.capabilities.includes('transcript.sources.read');
  if (!canRead) return emptyAssessDocumentMappingProjection();
  const enabled = bool(raw.transcriptFlags[0]?.assess_document_mapping_enabled);
  const targetsByCatalog = new Map<string, AssessMappingTargetDescriptor[]>();
  const catalogsById = new Map(raw.mappingCatalogs.map(catalog => [text(catalog.id), catalog]));
  raw.mappingTargets.forEach(row => {
    const catalog = catalogsById.get(text(row.catalog_id));
    const currentValue = row.current_value;
    const allowedValues = strings(row.allowed_values);
    if (!catalog || !uuid.test(text(row.selector_id)) || !isAssessMappingJsonValue(currentValue)
      || !includes(['case_field', 'primitive_field', 'primitive_fact', 'agent_fact', 'asset_field', 'interaction_field', 'interaction_fact', 'create_primitive', 'create_asset', 'create_interaction', 'create_decision_point', 'create_exception_path', 'evidence_only'] as const, row.target_kind)
      || !includes(['set_field', 'set_fact', 'create_entity', 'link_evidence'] as const, row.operation)
      || !includes(['text', 'boolean', 'ratio', 'number', 'text_list', 'primitive_type', 'business_disposition', 'interaction_mode', 'data_classification', 'asset_strategic_lifespan', 'asset_technical_health', 'asset_business_criticality', 'asset_ownership_model', 'asset_vendor_roadmap', 'asset_operating_stability', 'primitive_constructor', 'asset_constructor', 'interaction_constructor', 'decision_constructor', 'exception_constructor', 'evidence'] as const, row.value_type)
      || !/^[0-9a-f]{64}$/.test(text(row.current_value_hash))) return;
    const descriptor: AssessMappingTargetDescriptor = {
      selectorId: text(row.selector_id), catalogId: text(catalog.id), caseId: text(catalog.assess_case_id),
      caseVersion: number(catalog.case_version), assessSchemaVersion: text(catalog.assess_schema_version),
      targetKind: row.target_kind, operation: row.operation, ...(uuid.test(text(row.entity_id)) ? { entityId: text(row.entity_id) } : {}),
      fieldId: short(row.field_id, 160), label: short(row.label, 240), contextLabel: short(row.context_label, 240),
      valueType: row.value_type, ...(allowedValues.length ? { allowedValues } : {}), currentValue, currentValueHash: text(row.current_value_hash), manual: bool(row.manual),
    };
    targetsByCatalog.set(descriptor.catalogId, [...(targetsByCatalog.get(descriptor.catalogId) || []), descriptor]);
  });
  const catalogs = raw.mappingCatalogs.flatMap(catalog => {
    const id = text(catalog.id); const targets = targetsByCatalog.get(id) || [];
    if (!uuid.test(id) || !uuid.test(text(catalog.assess_case_id)) || !Number.isSafeInteger(number(catalog.case_version))
      || number(catalog.catalog_version) !== 1 || !/^[0-9a-f]{64}$/.test(text(catalog.catalog_hash))
      || !includes(['current', 'stale'] as const, catalog.status) || !Number.isFinite(Date.parse(text(catalog.created_at)))) return [];
    return [{ id, caseId: text(catalog.assess_case_id), caseVersion: number(catalog.case_version),
      assessSchemaVersion: text(catalog.assess_schema_version), catalogVersion: 1 as const,
      catalogHash: text(catalog.catalog_hash), status: catalog.status, targets, createdAt: text(catalog.created_at) }];
  });
  const runById = new Map(raw.mappingRuns.map(run => [text(run.id), run]));
  const latestReview = new Map<string, Row>();
  raw.mappingReviews.forEach(review => { const id = text(review.proposal_id); if (id && !latestReview.has(id)) latestReview.set(id, review); });
  const proposals: AssessMappingProposalProjection[] = raw.mappingProposals.flatMap(row => {
    const run = runById.get(text(row.run_id)); const catalog = catalogsById.get(text(row.catalog_id)); const review = latestReview.get(text(row.id));
    const proposedValue = row.proposed_value; const effectiveValue = review?.reviewed_value ?? proposedValue;
    if (!run || !catalog || !isAssessMappingJsonValue(proposedValue) || !isAssessMappingJsonValue(effectiveValue)
      || ![row.id, row.catalog_id, row.target_selector_id, catalog.assess_case_id, run.input_bundle_id, run.input_bundle_version_id, row.extraction_job_id, row.extraction_binding_id, row.source_id, row.source_version_id].every(value => uuid.test(text(value)))) return [];
    const status = review?.status ?? row.status;
    if (!includes(['suggested', 'accepted', 'rejected', 'edited'] as const, status)
      || !includes(['neutral', 'supporting', 'contradictory'] as const, row.relationship)
      || number(row.confidence, -1) < 0 || number(row.confidence, -1) > 1 || !/^[0-9a-f]{64}$/.test(text(row.anchor_hash))) return [];
    return [{ id: text(row.id), version: Math.max(1, number(review?.version, number(row.proposal_version, 1))),
      catalogId: text(row.catalog_id), targetSelectorId: text(row.target_selector_id), caseId: text(catalog.assess_case_id),
      caseVersion: number(catalog.case_version), inputBundleId: text(run.input_bundle_id), inputBundleVersionId: text(run.input_bundle_version_id),
      extractionJobId: text(row.extraction_job_id), extractionBindingId: text(row.extraction_binding_id), sourceId: text(row.source_id), sourceVersionId: text(row.source_version_id),
      proposedValue, effectiveValue, confidence: number(row.confidence), rationale: short(row.rationale, 2_000) || undefined,
      sourceAnchor: { sourceVersionId: text(row.source_version_id), parserVersion: short(row.parser_version, 120), locator: short(row.source_locator, 500), anchorHash: text(row.anchor_hash), safeExcerpt: short(row.safe_excerpt, 1_000) },
      status, relationship: row.relationship, reviewState: review ? (text(review.reviewer_id) === authority.userId ? 'reviewed_by_you' as const : 'reviewed_by_another' as const) : 'pending' as const,
      ...(review && Number.isFinite(Date.parse(text(review.created_at))) ? { reviewedAt: text(review.created_at) } : {}) }];
  });
  const proposalById = new Map(proposals.map(item => [item.id, item]));
  const targetById = new Map(catalogs.flatMap(catalog => catalog.targets).map(target => [target.selectorId, target]));
  const latestResolution = new Map<string, Row>();
  raw.mappingConflictResolutions.forEach(resolution => { const id = text(resolution.conflict_id); if (id && !latestResolution.has(id)) latestResolution.set(id, resolution); });
  const conflicts: AssessMappingConflictProjection[] = raw.mappingConflicts.flatMap(row => {
    const target = targetById.get(text(row.target_selector_id)); const resolution = latestResolution.get(text(row.id));
    const rawProposalIds = strings(row.proposal_ids); const proposalIds = rawProposalIds.filter(id => proposalById.has(id));
    if (!target || !uuid.test(text(row.id)) || proposalIds.length < 1 || proposalIds.length !== rawProposalIds.length
      || number(row.current_resolution_version) > 0 && number(resolution?.version, -1) !== number(row.current_resolution_version)) return [];
    const resolutionKind = resolution?.resolution ?? 'unresolved';
    if (!includes(['unresolved', 'choose_candidate', 'retain_manual', 'authored_resolution'] as const, resolutionKind)) return [];
    const resolvedValue = resolutionKind === 'choose_candidate' ? proposalById.get(text(resolution?.chosen_proposal_id))?.effectiveValue
      : resolutionKind === 'retain_manual' ? target.currentValue : resolution?.authored_value;
    return [{ id: text(row.id), targetSelectorId: target.selectorId, label: target.label, proposalIds,
      ...(target.currentValue !== undefined ? { currentValue: target.currentValue } : {}), material: true,
      resolution: resolutionKind, ...(resolvedValue !== undefined && isAssessMappingJsonValue(resolvedValue) ? { resolvedValue } : {}),
      ...(resolution ? { rationale: short(resolution.rationale, 2_000), resolutionVersion: number(resolution.version) } : { resolutionVersion: number(row.current_resolution_version) }) }];
  });
  const conflictsByBatch = new Map<string, AssessMappingConflictProjection[]>();
  raw.mappingConflicts.forEach(row => { const projected = conflicts.find(item => item.id === text(row.id)); if (projected) conflictsByBatch.set(text(row.preview_batch_id), [...(conflictsByBatch.get(text(row.preview_batch_id)) || []), projected]); });
  const applicationsByBatch = new Set(raw.mappingApplications.map(item => text(item.preview_batch_id)));
  const manifestByBatch = new Map<string, Row>();
  raw.mappingPreviewManifests.forEach(item => { const id = text(item.preview_batch_id); if (id && !manifestByBatch.has(id)) manifestByBatch.set(id, item); });
  const proposalsByRun = new Map<string, AssessMappingProposalProjection[]>();
  raw.mappingProposals.forEach(row => { const proposal = proposalById.get(text(row.id)); if (proposal) proposalsByRun.set(text(row.run_id), [...(proposalsByRun.get(text(row.run_id)) || []), proposal]); });
  const sourcesByRun = new Map<string, Row[]>();
  raw.mappingRunSources.forEach(source => sourcesByRun.set(text(source.run_id), [...(sourcesByRun.get(text(source.run_id)) || []), source]));
  const runProjectionComplete = new Map<string, boolean>();
  raw.mappingRuns.forEach(run => {
    const safeResult = object(run.safe_result); const catalogTargets = targetsByCatalog.get(text(run.catalog_id)) || [];
    const expectedProposals = number(safeResult.proposalCount, -1); const expectedTargets = number(safeResult.targetCount, -1); const expectedSources = number(safeResult.sourceCount, -1);
    const sourceRows = sourcesByRun.get(text(run.id)) || []; const displayedProposals = proposalsByRun.get(text(run.id)) || [];
    runProjectionComplete.set(text(run.id), expectedProposals >= 0 && expectedTargets >= 0 && expectedSources >= 0
      && displayedProposals.length === expectedProposals && catalogTargets.length === expectedTargets && sourceRows.length === expectedSources);
  });
  const previews = raw.mappingPreviewBatches.flatMap(batch => {
    const items = raw.mappingPreviewItems.filter(item => text(item.preview_batch_id) === text(batch.id));
    const changes = items.flatMap(item => { const proposal = proposalById.get(text(item.proposal_id)); const target = targetById.get(text(item.target_selector_id));
      if (!proposal || !target || !isAssessMappingJsonValue(item.reviewed_value) || proposal.version !== number(item.proposal_version)) return [];
      const related = (conflictsByBatch.get(text(batch.id)) || []).filter(conflict => conflict.targetSelectorId === target.selectorId);
      return [{ proposalId: proposal.id, targetSelectorId: target.selectorId, label: target.label,
        ...(target.currentValue !== undefined ? { currentValue: target.currentValue } : {}), proposedValue: item.reviewed_value,
        conflictState: related.some(conflict => conflict.proposalIds.length > 1) ? 'cross_source_conflict' as const : related.length ? 'manual_conflict' as const : 'none' as const }]; });
    const manifestRow = manifestByBatch.get(text(batch.id));
    if (!manifestRow || !uuid.test(text(batch.id)) || !uuid.test(text(batch.catalog_id)) || !uuid.test(text(batch.assess_case_id))
      || !uuid.test(text(batch.input_bundle_id)) || !uuid.test(text(batch.input_bundle_version_id)) || !/^[0-9a-f]{64}$/.test(text(batch.catalog_hash))
      || !Number.isFinite(Date.parse(text(batch.expires_at)))) return [];
    const batchConflicts = conflictsByBatch.get(text(batch.id)) || [];
    const manifest = { previewBatchId: text(manifestRow.preview_batch_id), manifestVersion: number(manifestRow.manifest_version), catalogId: text(manifestRow.catalog_id), catalogHash: text(manifestRow.catalog_hash),
      caseId: text(manifestRow.assess_case_id), caseVersion: number(manifestRow.case_version), inputBundleId: text(manifestRow.input_bundle_id),
      inputBundleVersionId: text(manifestRow.input_bundle_version_id), targetCount: number(manifestRow.target_count), sourceCount: number(manifestRow.source_count),
      itemCount: number(manifestRow.item_count), reviewedCount: number(manifestRow.reviewed_count), conflictCount: number(manifestRow.conflict_count),
      unresolvedConflictCount: number(manifestRow.unresolved_conflict_count), itemSetHash: text(manifestRow.item_set_hash),
      conflictSetHash: text(manifestRow.conflict_set_hash), resolutionSetHash: text(manifestRow.resolution_set_hash), displayedSetHash: text(manifestRow.displayed_set_hash) };
    const itemBindings = Array.isArray(manifestRow.item_bindings) ? manifestRow.item_bindings.filter(isRow) : [];
    const conflictBindings = Array.isArray(manifestRow.conflict_bindings) ? manifestRow.conflict_bindings.filter(isRow) : [];
    const resolutionBindings = Array.isArray(manifestRow.resolution_bindings) ? manifestRow.resolution_bindings.filter(isRow) : [];
    const itemBindingsComplete = itemBindings.length === items.length && items.every(item => itemBindings.some(binding => canonicalProjectionJson(binding) === canonicalProjectionJson({
      ordinal: number(item.ordinal), proposalId: text(item.proposal_id), proposalVersion: number(item.proposal_version), targetSelectorId: text(item.target_selector_id),
      reviewedValue: item.reviewed_value, bindingHash: text(item.binding_hash),
    })));
    const conflictBindingsComplete = conflictBindings.length === raw.mappingConflicts.filter(item => text(item.preview_batch_id) === text(batch.id)).length
      && raw.mappingConflicts.filter(item => text(item.preview_batch_id) === text(batch.id)).every(item => conflictBindings.some(binding => canonicalProjectionJson(binding) === canonicalProjectionJson({
        conflictId: text(item.id), targetSelectorId: text(item.target_selector_id), kind: text(item.kind), proposalIds: strings(item.proposal_ids),
        currentValueHash: text(item.current_value_hash), currentResolutionVersion: number(item.current_resolution_version),
      })));
    const currentResolutions = raw.mappingConflicts.filter(item => text(item.preview_batch_id) === text(batch.id) && number(item.current_resolution_version) > 0)
      .map(item => latestResolution.get(text(item.id))).filter((item): item is Row => Boolean(item));
    const resolutionBindingsComplete = resolutionBindings.length === currentResolutions.length && currentResolutions.every(item => resolutionBindings.some(binding => canonicalProjectionJson(binding) === canonicalProjectionJson({
      conflictId: text(item.conflict_id), version: number(item.version), resolution: text(item.resolution),
      chosenProposalId: uuid.test(text(item.chosen_proposal_id)) ? text(item.chosen_proposal_id) : null,
      authoredValue: item.authored_value ?? null, rationale: text(item.rationale),
    })));
    const matchingRun = raw.mappingRuns.find(run => text(run.catalog_id) === text(batch.catalog_id)
      && text(run.input_bundle_id) === text(batch.input_bundle_id) && text(run.input_bundle_version_id) === text(batch.input_bundle_version_id));
    const matchingRunComplete = Boolean(matchingRun && runProjectionComplete.get(text(matchingRun.id)) === true);
    const matchingRunSourceCount = matchingRun ? (sourcesByRun.get(text(matchingRun.id)) || []).length : -1;
    const projectionComplete = manifest.previewBatchId === text(batch.id) && manifest.catalogId === text(batch.catalog_id)
      && manifest.catalogHash === text(batch.catalog_hash) && manifest.caseId === text(batch.assess_case_id)
      && manifest.caseVersion === number(batch.expected_case_version) && manifest.inputBundleId === text(batch.input_bundle_id)
      && manifest.inputBundleVersionId === text(batch.input_bundle_version_id)
      && manifest.targetCount === (targetsByCatalog.get(text(batch.catalog_id)) || []).length
      && manifest.sourceCount === matchingRunSourceCount && manifest.itemCount === items.length
      && manifest.reviewedCount === changes.length && manifest.conflictCount === batchConflicts.length
      && manifest.unresolvedConflictCount === batchConflicts.filter(conflict => conflict.resolution === 'unresolved').length
      && [manifest.itemSetHash, manifest.conflictSetHash, manifest.resolutionSetHash, manifest.displayedSetHash].every(value => /^[0-9a-f]{64}$/.test(value))
      && manifest.manifestVersion >= 1 && itemBindingsComplete && conflictBindingsComplete && resolutionBindingsComplete
      && new Set(items.map(item => text(item.proposal_id))).size === items.length && matchingRunComplete;
    const status = !projectionComplete ? 'blocked' as const : applicationsByBatch.has(text(batch.id)) ? 'applied' as const
      : Date.parse(text(batch.expires_at)) <= Date.now() ? 'stale' as const
        : batchConflicts.some(conflict => conflict.resolution === 'unresolved') ? 'blocked' as const : 'ready' as const;
    return [{ id: text(batch.id), catalogId: text(batch.catalog_id), catalogHash: text(batch.catalog_hash), caseId: text(batch.assess_case_id),
      expectedCaseVersion: number(batch.expected_case_version), inputBundleId: text(batch.input_bundle_id), inputBundleVersionId: text(batch.input_bundle_version_id),
      proposalIds: items.map(item => text(item.proposal_id)).filter(id => uuid.test(id)), changes, conflicts: batchConflicts, manifest, projectionComplete, status, expiresAt: text(batch.expires_at) }];
  });
  const runs = raw.mappingRuns.flatMap(run => {
    if (![run.id, run.catalog_id, run.assess_case_id, run.input_bundle_id, run.input_bundle_version_id].every(value => uuid.test(text(value)))) return [];
    const sourceRows = sourcesByRun.get(text(run.id)) || []; const safeResult = object(run.safe_result);
    const rawFailure = text(run.failure_code) || text(safeResult.failureCode);
    const warnings = strings(safeResult.warnings).slice(0, 40).map(warning => short(warning, 500));
    const analyzedSources = (Array.isArray(safeResult.analyzedSources) ? safeResult.analyzedSources : []).slice(0, 20).flatMap(value => {
      const source = object(value); const sourceWarnings = strings(source.warnings).slice(0, 40).map(warning => short(warning, 500));
      if (!uuid.test(text(source.sourceId)) || !uuid.test(text(source.sourceVersionId)) || !short(source.parserVersion, 120)
        || !Number.isSafeInteger(number(source.extractedByteCount, -1)) || number(source.extractedByteCount, -1) < 0
        || !Number.isSafeInteger(number(source.sheetCount, -1)) || number(source.sheetCount, -1) < 0
        || !Number.isSafeInteger(number(source.cellCount, -1)) || number(source.cellCount, -1) < 0) return [];
      return [{ sourceId: text(source.sourceId), sourceVersionId: text(source.sourceVersionId), parserVersion: short(source.parserVersion, 120),
        extractedByteCount: number(source.extractedByteCount), sheetCount: number(source.sheetCount), cellCount: number(source.cellCount), warnings: sourceWarnings }];
    });
    const state = run.status === 'claimed' ? 'processing' as const : run.status === 'staged' || run.status === 'committed' ? 'review_required' as const : run.status === 'failed' ? 'failed' as const : 'blocked' as const;
    const failureCode = rawFailure === 'BUDGET_EXHAUSTED' ? 'BUDGET_EXHAUSTED' as const
      : rawFailure === 'PROMPT_TOO_LARGE' ? 'SOURCE_TOO_LARGE' as const
      : includes(['PROVIDER_UNSUPPORTED', 'SECRET_REFERENCE_UNSAFE', 'SECRET_UNAVAILABLE', 'ENDPOINT_UNSAFE', 'CAPABILITY_UNAVAILABLE'] as const, rawFailure)
        ? 'PROVIDER_UNAVAILABLE' as const : undefined;
    return [{ id: text(run.id), catalogId: text(run.catalog_id), caseId: text(run.assess_case_id), caseVersion: number(run.case_version),
      inputBundleId: text(run.input_bundle_id), inputBundleVersionId: text(run.input_bundle_version_id), extractionJobIds: sourceRows.map(item => text(item.extraction_job_id)).filter(id => uuid.test(id)),
      state, proposalCount: Math.max(0, number(safeResult.proposalCount)), projectionComplete: runProjectionComplete.get(text(run.id)) === true,
      ...(warnings.length ? { warnings } : {}),
      ...(analyzedSources.length ? { analyzedSources } : {}), ...(failureCode ? { failureCode } : {}), updatedAt: text(run.updated_at) || text(run.created_at) }];
  });
  return { schemaVersion: ASSESS_DOCUMENT_MAPPING_SCHEMA_VERSION,
    features: { enabled, ...(!enabled ? { disabledReason: 'Supporting-document mapping is disabled for this workspace.' } : {}) },
    catalogs, proposals, previews, conflicts, runs };
};

export const buildEnterpriseIntelligenceProjection = (
  authority: TenantContext,
  raw: EnterpriseIntelligenceRawProjection,
  generatedAt = new Date(),
): EnterpriseIntelligenceProjection => {
  if (raw.deliveryWorkspace) assertEmbeddedProjectionScope(authority, raw.deliveryWorkspace);
  if (raw.monitorApprovedBaselines) assertEmbeddedProjectionScope(authority, raw.monitorApprovedBaselines);
  const visibility = projectionVisibility(authority);
  const providers = visibility.providerVisible ? projectProviders(raw, authority.capabilities.includes('org.admin')) : [];
  const evidence = visibility.evidenceVisible
    ? projectEvidence(raw, authority.userId)
    : { sources: [], candidates: [] };
  const assessDrafts = visibility.assessDraftsVisible ? projectAssessDrafts(raw) : [];
  const applications = visibility.applicationsVisible ? projectApplications(raw) : [];
  const studioDocuments = visibility.studioVisible ? projectStudio(raw) : [];
  const deliveryPackages = visibility.deliveryVisible ? projectDelivery(raw, authority.userId) : [];
  const monitorBaselines = visibility.monitorVisible
    ? (raw.monitorApprovedBaselines ? projectCanonicalMonitor(raw) : projectMonitor(raw, authority.userId))
    : [];
  const modernizationDecisions = visibility.modernizationVisible ? projectModernization(raw, authority.userId, applications) : [];
  const blueprints = visibility.modernizationVisible ? projectBlueprints(raw, authority.userId) : [];
  const commandActivity = projectCommandActivity(raw, authority);
  const transcriptFlow = projectTranscriptFlow(raw, authority, generatedAt);
  const studioSourceFlow = projectStudioSourceFlow(raw, authority);
  const documentMapping = projectAssessDocumentMapping(raw, authority);
  const approvalResources = visibility.approvalVisible
    ? projectApprovalResources(raw, authority.userId, evidence.candidates, deliveryPackages, monitorBaselines, modernizationDecisions, blueprints)
    : [];
  const assessPromotionAuthorized = visibility.evidenceVisible && authority.capabilities.includes('assessment.edit');
  const accepted = evidence.candidates.filter(candidate => ['accepted', 'edited'].includes(candidate.status));
  const promotionActivity = assessPromotionAuthorized
    ? commandActivity.find(activity => activity.commandType === 'evidence.assess.promote')
    : undefined;
  const projectionCollections = [providers, evidence.sources, evidence.candidates, assessDrafts, applications, studioDocuments, deliveryPackages, monitorBaselines, modernizationDecisions, blueprints,
    approvalResources, commandActivity, transcriptFlow.sourceVersions, transcriptFlow.sourceSets, transcriptFlow.inputBundles, transcriptFlow.journeys,
    transcriptFlow.assessCandidates, transcriptFlow.assessConflicts, transcriptFlow.assessApplyPreviews, transcriptFlow.assessRuns,
    studioSourceFlow.sources, studioSourceFlow.sourceSets, studioSourceFlow.inputBundles, studioSourceFlow.extractionJobs, studioSourceFlow.candidates,
    documentMapping.catalogs, documentMapping.proposals, documentMapping.previews, documentMapping.conflicts, documentMapping.runs];
  const relevantCapabilities = authority.capabilities.filter(capability => /^(?:org|byok|security|evidence|assessment|assess|transcript|docs|studio|project|delivery|monitor|assemble|approvals|portfolio)\./.test(capability));
  return {
    schemaVersion: ENTERPRISE_INTELLIGENCE_PROJECTION_VERSION,
    organizationId: authority.organizationId,
    workspaceId: authority.workspaceId,
    authorizationVersion: authority.authorizationVersion,
    generatedAt: generatedAt.toISOString(),
    capabilities: [...authority.capabilities],
    availability: relevantCapabilities.length === 0 ? 'blocked' : projectionCollections.some(collection => collection.length) ? 'ready' : 'empty',
    providers,
    evidenceSources: evidence.sources,
    evidenceCandidates: evidence.candidates,
    assessDrafts,
    applications,
    studioDocuments,
    deliveryPackages,
    monitorBaselines,
    ...(visibility.deliveryVisible && raw.deliveryWorkspace ? { deliveryWorkspace: raw.deliveryWorkspace } : {}),
    ...(visibility.monitorVisible && raw.monitorApprovedBaselines ? { monitorApprovedBaselines: raw.monitorApprovedBaselines } : {}),
    modernizationDecisions,
    blueprints,
    approvalResources,
    commandActivity,
    transcriptFlow,
    studioSourceFlow,
    documentMapping,
    assessPromotion: assessPromotionAuthorized ? {
      state: promotionActivity?.status === 'committed' ? 'promoted' : promotionActivity ? 'conflict' : 'contract_pending',
      acceptedCandidateCount: accepted.length,
      provenanceComplete: accepted.length > 0 && accepted.every(candidate => candidate.provenanceState === 'anchored'),
      idempotencyState: promotionActivity?.idempotencyState || 'not_started',
      conflicts: promotionActivity?.status === 'committed' ? [] : ['ASSESS_DRAFT_PROMOTION_COMMAND_REQUIRED'],
    } : {
      state: 'contract_pending',
      acceptedCandidateCount: 0,
      provenanceComplete: false,
      idempotencyState: 'not_started',
      conflicts: [],
    },
  };
};

const parseRequest = (value: unknown) => {
  if (!isRow(value) || Object.keys(value).some(key => !requestKeys.includes(key))) return null;
  if (typeof value.organizationId !== 'string' || !uuid.test(value.organizationId) || typeof value.workspaceId !== 'string' || !uuid.test(value.workspaceId)) return null;
  if (value.expectedAuthorizationVersion !== undefined && (!Number.isSafeInteger(value.expectedAuthorizationVersion) || number(value.expectedAuthorizationVersion) < 1)) return null;
  let deliveryItemPage: DeliveryItemPageRequest | undefined;
  if (value.deliveryItemPage !== undefined) {
    if (!isRow(value.deliveryItemPage)
      || Object.keys(value.deliveryItemPage).some(key => !['packageId', 'cursor', 'limit'].includes(key))
      || typeof value.deliveryItemPage.packageId !== 'string'
      || !uuid.test(value.deliveryItemPage.packageId)
      || !isRow(value.deliveryItemPage.cursor)
      || Object.keys(value.deliveryItemPage.cursor).some(key => !['version', 'id'].includes(key))
      || !Number.isSafeInteger(value.deliveryItemPage.cursor.version)
      || number(value.deliveryItemPage.cursor.version) < 1
      || typeof value.deliveryItemPage.cursor.id !== 'string'
      || !uuid.test(value.deliveryItemPage.cursor.id)
      || !Number.isSafeInteger(value.deliveryItemPage.limit)
      || number(value.deliveryItemPage.limit) < 1
      || number(value.deliveryItemPage.limit) > DELIVERY_ITEM_PAGE_MAX) return null;
    deliveryItemPage = {
      packageId: value.deliveryItemPage.packageId,
      cursor: { version: number(value.deliveryItemPage.cursor.version), id: value.deliveryItemPage.cursor.id },
      limit: number(value.deliveryItemPage.limit),
    };
  }
  let deliveryBaselineEligibilityPage: DeliveryBaselineEligibilityPageRequest | undefined;
  if (value.deliveryBaselineEligibilityPage !== undefined) {
    if (!isRow(value.deliveryBaselineEligibilityPage)
      || Object.keys(value.deliveryBaselineEligibilityPage).some(key => !['cursor', 'limit'].includes(key))
      || !isRow(value.deliveryBaselineEligibilityPage.cursor)
      || Object.keys(value.deliveryBaselineEligibilityPage.cursor).some(key => !['updatedAt', 'workPackageId'].includes(key))
      || typeof value.deliveryBaselineEligibilityPage.cursor.updatedAt !== 'string'
      || !Number.isFinite(Date.parse(value.deliveryBaselineEligibilityPage.cursor.updatedAt))
      || typeof value.deliveryBaselineEligibilityPage.cursor.workPackageId !== 'string'
      || !uuid.test(value.deliveryBaselineEligibilityPage.cursor.workPackageId)
      || !Number.isSafeInteger(value.deliveryBaselineEligibilityPage.limit)
      || number(value.deliveryBaselineEligibilityPage.limit) < 1
      || number(value.deliveryBaselineEligibilityPage.limit) > 100) return null;
    deliveryBaselineEligibilityPage = {
      cursor: {
        updatedAt: value.deliveryBaselineEligibilityPage.cursor.updatedAt,
        workPackageId: value.deliveryBaselineEligibilityPage.cursor.workPackageId,
      },
      limit: number(value.deliveryBaselineEligibilityPage.limit),
    };
  }
  let assessDocumentMappingScope: EnterpriseIntelligenceQueryOptions['assessDocumentMappingScope'];
  if (value.assessDocumentMappingScope !== undefined) {
    const scope = value.assessDocumentMappingScope;
    if (!isRow(scope) || Object.keys(scope).some(key => !['caseId', 'caseVersion', 'inputBundleId', 'inputBundleVersionId'].includes(key))
      || typeof scope.caseId !== 'string' || !uuid.test(scope.caseId) || !Number.isSafeInteger(scope.caseVersion) || number(scope.caseVersion) < 1
      || (scope.inputBundleId === undefined) !== (scope.inputBundleVersionId === undefined)
      || (scope.inputBundleId !== undefined && (typeof scope.inputBundleId !== 'string' || !uuid.test(scope.inputBundleId)))
      || (scope.inputBundleVersionId !== undefined && (typeof scope.inputBundleVersionId !== 'string' || !uuid.test(scope.inputBundleVersionId)))) return null;
    assessDocumentMappingScope = { caseId: scope.caseId, caseVersion: number(scope.caseVersion),
      ...(typeof scope.inputBundleId === 'string' ? { inputBundleId: scope.inputBundleId, inputBundleVersionId: String(scope.inputBundleVersionId) } : {}) };
  }
  return {
    organizationId: value.organizationId,
    workspaceId: value.workspaceId,
    expectedAuthorizationVersion: value.expectedAuthorizationVersion as number | undefined,
    ...(deliveryItemPage ? { deliveryItemPage } : {}),
    ...(deliveryBaselineEligibilityPage ? { deliveryBaselineEligibilityPage } : {}),
    ...(assessDocumentMappingScope ? { assessDocumentMappingScope } : {}),
  };
};

export const handleEnterpriseIntelligenceQuery = async (request: Request, dependencies: EnterpriseIntelligenceQueryDependencies): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { code: 'METHOD_NOT_ALLOWED' });
  let user: { id: string };
  try {
    user = await dependencies.authenticate(request);
  } catch {
    return json(401, { code: 'AUTHENTICATION_REQUIRED' });
  }
  let parsed: ReturnType<typeof parseRequest>;
  try {
    parsed = parseRequest(await request.json());
  } catch {
    return json(400, { code: 'INVALID_REQUEST' });
  }
  if (!parsed) return json(400, { code: 'INVALID_REQUEST' });
  try {
    const authority = await resolveTenantAuthority(user.id, parsed, dependencies.authorityDatabase);
    const raw = await dependencies.queryDatabase.loadProjectionRows(authority, {
      ...(parsed.deliveryItemPage ? { deliveryItemPage: parsed.deliveryItemPage } : {}),
      ...(parsed.deliveryBaselineEligibilityPage ? { deliveryBaselineEligibilityPage: parsed.deliveryBaselineEligibilityPage } : {}),
      ...(parsed.assessDocumentMappingScope ? { assessDocumentMappingScope: parsed.assessDocumentMappingScope } : {}),
    });
    return json(200, { projection: buildEnterpriseIntelligenceProjection(authority, raw, dependencies.now?.() || new Date()) });
  } catch (error) {
    if (error instanceof TenantAuthorityError) return json(error.code === 'AUTHORIZATION_STALE' ? 409 : 403, { code: error.code });
    return json(503, { code: 'ENTERPRISE_PROJECTION_UNAVAILABLE' });
  }
};
