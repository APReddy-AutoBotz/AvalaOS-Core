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
import { corsHeaders } from './http.ts';
import { postgrest } from './supabase.ts';
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
}

export type EnterpriseIntelligenceQueryDatabase = {
  loadProjectionRows(authority: TenantContext): Promise<EnterpriseIntelligenceRawProjection>;
};

export type EnterpriseIntelligenceQueryDependencies = {
  authenticate(request: Request): Promise<{ id: string }>;
  authorityDatabase: TenantAuthorityDatabase;
  queryDatabase: EnterpriseIntelligenceQueryDatabase;
  now?: () => Date;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requestKeys = ['organizationId', 'workspaceId', 'expectedAuthorizationVersion'];

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
  const deliveryVisible = hasAny(authority, 'project.read', 'project.manage', 'docs.approve');
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
  modernizationAssessments: [], modernizationDecisions: [], blueprints: [], reviewEvents: [], approvals: [], commandReceipts: [],
  transcriptFlags: [], transcriptSources: [], transcriptSourceVersions: [], transcriptCandidates: [],
  transcriptSourceSets: [], transcriptSourceSetVersions: [], transcriptSourceSetItems: [],
  transcriptInputBundles: [], transcriptInputBundleVersions: [], transcriptInputBundleItems: [], transcriptJourneys: [],
  transcriptApplyPreviews: [], transcriptApplyPreviewBatches: [], transcriptCandidateApplications: [], transcriptCandidateRelationships: [], transcriptConflicts: [], transcriptConflictResolutions: [],
  transcriptExtractionBindings: [], transcriptJobs: [], transcriptStalenessEvents: [],
});

const scoped = (authority: TenantContext) => `org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}`;

export const createEnterpriseIntelligenceQueryDatabase = (
  query: typeof postgrest = postgrest,
): EnterpriseIntelligenceQueryDatabase => ({
  async loadProjectionRows(authority) {
    const rows = emptyRawProjection();
    const scope = scoped(authority);
    const {
      providerVisible,
      evidenceVisible,
      assessDraftsVisible,
      applicationsVisible,
      studioVisible,
      deliveryVisible,
      monitorVisible,
      modernizationVisible,
      approvalVisible,
      transcriptLineageRequired,
      transcriptAssessVisible,
    } = projectionVisibility(authority);

    const tasks: Array<Promise<void>> = [];
    const load = (target: keyof EnterpriseIntelligenceRawProjection, path: string) => {
      tasks.push(query<Row[]>(path, { method: 'GET', headers: { 'Cache-Control': 'no-store' } }).then(result => { rows[target] = result; }));
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
      load('evidenceCandidates', `enterprise_evidence_candidates?select=id,source_id,source_version_id,field_key,value,safe_excerpt,excerpt_hash,source_locator,confidence,prompt_version,suggestion_status,version,provenance_hash,created_by,reviewed_by,reviewed_at,updated_at&${scope}&order=updated_at.desc&limit=1000`);
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
    if (deliveryVisible || monitorVisible) {
      load('deliveryPackages', `enterprise_delivery_work_packages?select=id,current_version,status,created_by,created_at&${scope}&order=created_at.desc&limit=200`);
      load('deliveryVersions', `enterprise_delivery_work_package_versions?select=id,work_package_id,version,artifact_type,studio_version,status,created_at&${scope}&order=created_at.desc&limit=200`);
      load('deliveryItems', `enterprise_delivery_work_items?select=id,package_version_id,item_type,title,acceptance_criteria,source_section_locator&${scope}&order=created_at.asc&limit=1000`);
    }
    if (monitorVisible) load('monitorBaselines', `enterprise_monitor_baselines?select=id,work_package_id,status,readiness,approved_item_ids,live_telemetry_connected,created_by,created_at&${scope}&order=created_at.desc&limit=200`);
    if (modernizationVisible) {
      load('modernizationAssessments', `enterprise_modernization_assessments?select=id,application_ref,status,created_at&${scope}&order=created_at.desc&limit=200`);
      load('modernizationDecisions', `enterprise_modernization_decisions?select=id,modernization_assessment_id,primary_disposition,alternative_disposition,eligible_dispositions,blockers,conflicts,status,created_by,created_at&${scope}&order=created_at.desc&limit=200`);
      load('blueprints', `enterprise_assemble_blueprints?select=id,modernization_decision_id,disposition,version,structured_content,status,created_by,created_at&${scope}&order=created_at.desc&limit=200`);
    }
    if (approvalVisible) {
      load('reviewEvents', `enterprise_high_impact_review_events?select=id,resource_type,resource_id,reviewer_id,created_at&${scope}&order=created_at.desc&limit=400`);
      load('approvals', `enterprise_high_impact_approvals?select=id,resource_type,resource_id,outcome,created_at&${scope}&order=created_at.desc&limit=400`);
    }
    if (transcriptLineageRequired) {
      load('transcriptFlags', `enterprise_transcript_workspace_flags?select=transcript_source_sets_enabled,assess_multisource_apply_enabled,governed_journeys_enabled,version,updated_at&${scope}&limit=1`);
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
      load('transcriptCandidateRelationships', `enterprise_evidence_candidate_relationship_reviews?select=id,candidate_id,candidate_version,relationship,rationale,created_by,created_at&${scope}&order=created_at.desc,id.desc&limit=1000`);
      load('transcriptConflicts', `enterprise_assess_evidence_conflicts?select=id,assess_case_id,input_bundle_version_id,application_intent,target_key,candidate_ids,is_material,current_resolution_version,created_at&${scope}&order=created_at.desc&limit=1000`);
      load('transcriptConflictResolutions', `enterprise_assess_evidence_conflict_resolutions?select=conflict_id,version,resolution,chosen_candidate_id,authored_value,rationale,created_at&${scope}&order=created_at.desc&limit=1000`);
      load('transcriptExtractionBindings', `enterprise_transcript_extraction_bindings?select=id,job_id,input_bundle_version_id,input_bundle_id,source_set_version_id,source_id,source_version_id,created_at&${scope}&order=created_at.desc&limit=1000`);
      load('transcriptJobs', `enterprise_ai_job_ledger?select=id,status,failure_class,created_at,completed_at&${scope}&capability=eq.assess.evidence.extract&order=created_at.desc&limit=1000`);
      load('transcriptStalenessEvents', `enterprise_transcript_staleness_events?select=resource_kind,resource_id,created_at&${scope}&order=created_at.desc&limit=4000`);
    }
    load('commandReceipts', `enterprise_ai_command_receipts?select=command_type,status,completed_at,created_at&${scope}&actor_id=eq.${encodeURIComponent(authority.userId)}&order=created_at.desc&limit=20`);
    await Promise.all(tasks);
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
  const versionBySource = latestBy(raw.evidenceVersions, 'source_id');
  const sources: EnterpriseEvidenceSourceProjection[] = raw.evidenceSources.flatMap(source => {
    if (!includes(SUPPORTED_EVIDENCE_MIME_TYPES, source.mime_type) || !includes(['uploaded', 'extracting', 'review', 'deleted', 'failed'] as const, source.status)) return [];
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
    if (!includes(EVIDENCE_CANDIDATE_FIELDS, candidate.field_key) || !includes(['suggested', 'accepted', 'rejected', 'edited'] as const, candidate.suggestion_status)) return [];
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
    if (!source || !uuid.test(text(source.id)) || !uuid.test(text(version.id)) || !includes(SUPPORTED_EVIDENCE_MIME_TYPES, source.mime_type)) return [];
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
    const members = raw.transcriptSourceSetItems
      .filter(item => text(item.source_set_version_id) === text(version.id))
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
    if (!source || !sourceVersion || !binding || !boundSourceSetVersion || !uuid.test(text(candidate.id))
      || text(binding.source_id) !== text(candidate.source_id) || text(binding.source_version_id) !== text(candidate.source_version_id)
      || text(boundSourceSetVersion.source_set_id) !== text(binding.source_set_id)
      || !boundBundle || !boundBundle.sourceSetVersions.some(lineage => lineage.sourceSetId === text(binding.source_set_id)
        && lineage.sourceSetVersionSelector === text(binding.source_set_version_id)
        && lineage.sourceSetVersion === number(boundSourceSetVersion.version, 1))
      || !boundBundle.sourceVersionSelectors.includes(text(candidate.source_version_id))
      || !includes(['suggested', 'accepted', 'rejected', 'edited'] as const, candidate.suggestion_status)) return [];
    const latestPreview = (assessVisible ? raw.transcriptApplyPreviews : []).find(preview => text(preview.candidate_id) === text(candidate.id));
    const intent = includes(TRANSCRIPT_ASSESS_APPLICATION_INTENTS, latestPreview?.application_intent)
      ? latestPreview?.application_intent as TranscriptAssessApplicationIntent : 'link_evidence_only' as const;
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
      relationship: includes(['neutral', 'supporting', 'contradictory'] as const, relationshipByCandidate.get(text(candidate.id))?.relationship)
        ? relationshipByCandidate.get(text(candidate.id))?.relationship as 'neutral' | 'supporting' | 'contradictory' : 'neutral' as const,
      applicationIntent: intent, applyTarget: short(latestPreview?.target_key, 240) || undefined,
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

export const buildEnterpriseIntelligenceProjection = (
  authority: TenantContext,
  raw: EnterpriseIntelligenceRawProjection,
  generatedAt = new Date(),
): EnterpriseIntelligenceProjection => {
  const visibility = projectionVisibility(authority);
  const providers = visibility.providerVisible ? projectProviders(raw, authority.capabilities.includes('org.admin')) : [];
  const evidence = visibility.evidenceVisible
    ? projectEvidence(raw, authority.userId)
    : { sources: [], candidates: [] };
  const assessDrafts = visibility.assessDraftsVisible ? projectAssessDrafts(raw) : [];
  const applications = visibility.applicationsVisible ? projectApplications(raw) : [];
  const studioDocuments = visibility.studioVisible ? projectStudio(raw) : [];
  const deliveryPackages = visibility.deliveryVisible || visibility.monitorVisible ? projectDelivery(raw, authority.userId) : [];
  const monitorBaselines = visibility.monitorVisible ? projectMonitor(raw, authority.userId) : [];
  const modernizationDecisions = visibility.modernizationVisible ? projectModernization(raw, authority.userId, applications) : [];
  const blueprints = visibility.modernizationVisible ? projectBlueprints(raw, authority.userId) : [];
  const commandActivity = projectCommandActivity(raw, authority);
  const transcriptFlow = projectTranscriptFlow(raw, authority, generatedAt);
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
    transcriptFlow.assessCandidates, transcriptFlow.assessConflicts, transcriptFlow.assessApplyPreviews, transcriptFlow.assessRuns];
  const relevantCapabilities = authority.capabilities.filter(capability => /^(?:org|byok|security|evidence|assessment|assess|transcript|docs|studio|project|monitor|assemble|approvals|portfolio)\./.test(capability));
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
    modernizationDecisions,
    blueprints,
    approvalResources,
    commandActivity,
    transcriptFlow,
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
  return {
    organizationId: value.organizationId,
    workspaceId: value.workspaceId,
    expectedAuthorizationVersion: value.expectedAuthorizationVersion as number | undefined,
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
    const raw = await dependencies.queryDatabase.loadProjectionRows(authority);
    return json(200, { projection: buildEnterpriseIntelligenceProjection(authority, raw, dependencies.now?.() || new Date()) });
  } catch (error) {
    if (error instanceof TenantAuthorityError) return json(error.code === 'AUTHORIZATION_STALE' ? 409 : 403, { code: error.code });
    return json(503, { code: 'ENTERPRISE_PROJECTION_UNAVAILABLE' });
  }
};
