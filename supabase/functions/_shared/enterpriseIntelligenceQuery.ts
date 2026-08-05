import {
  ASSEMBLE_COMPONENT_CATALOG,
  ASSEMBLE_ELIGIBLE_DISPOSITIONS,
  ENTERPRISE_AI_CAPABILITIES,
  ENTERPRISE_AI_PROVIDERS,
  ENTERPRISE_INTELLIGENCE_PROJECTION_VERSION,
  EVIDENCE_CANDIDATE_FIELDS,
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
const number = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || fallback;
const bool = (value: unknown) => value === true;
const array = (value: unknown) => Array.isArray(value) ? value : [];
const strings = (value: unknown) => array(value).filter((entry): entry is string => typeof entry === 'string');
const object = (value: unknown): Row => isRow(value) ? value : {};
const short = (value: unknown, max = 160) => text(value).replace(/\s+/g, ' ').trim().slice(0, max);
const includes = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === 'string' && values.includes(value as T);
const byNewest = (left: Row, right: Row) => Date.parse(text(right.created_at)) - Date.parse(text(left.created_at));
const hasAny = (authority: TenantContext, ...capabilities: string[]) => capabilities.some(capability => authority.capabilities.includes(capability));

const emptyRawProjection = (): EnterpriseIntelligenceRawProjection => ({
  providerConfigs: [], providerRoutes: [], providerRoleOptions: [], providerRoleCapabilities: [], evidenceSources: [], evidenceVersions: [], evidenceCandidates: [], assessDrafts: [],
  applications: [], applicationAssessments: [], studioAggregates: [], studioVersions: [], studioHandoffs: [],
  deliveryPackages: [], deliveryVersions: [], deliveryItems: [], monitorBaselines: [],
  modernizationAssessments: [], modernizationDecisions: [], blueprints: [], reviewEvents: [], approvals: [], commandReceipts: [],
});

const scoped = (authority: TenantContext) => `org_id=eq.${encodeURIComponent(authority.organizationId)}&workspace_id=eq.${encodeURIComponent(authority.workspaceId)}`;

export const createEnterpriseIntelligenceQueryDatabase = (): EnterpriseIntelligenceQueryDatabase => ({
  async loadProjectionRows(authority) {
    const rows = emptyRawProjection();
    const scope = scoped(authority);
    const providerVisible = hasAny(authority, 'org.admin', 'byok.manage', 'security.manage', 'evidence.write');
    const evidenceVisible = hasAny(authority, 'evidence.write', 'evidence.review');
    const applicationsVisible = hasAny(authority, 'assess.applications.read', 'assess.applications.portfolio.read', 'portfolio.manage');
    const studioVisible = hasAny(authority, 'studio.artifacts.read', 'docs.approve');
    const deliveryVisible = hasAny(authority, 'project.read', 'project.manage', 'docs.approve');
    const monitorVisible = hasAny(authority, 'monitor.read', 'monitor.manage');
    const modernizationVisible = applicationsVisible || hasAny(authority, 'assemble.manage');
    const approvalVisible = hasAny(authority, 'approvals.review');

    const tasks: Array<Promise<void>> = [];
    const load = (target: keyof EnterpriseIntelligenceRawProjection, path: string) => {
      tasks.push(postgrest<Row[]>(path, { method: 'GET', headers: { 'Cache-Control': 'no-store' } }).then(result => { rows[target] = result; }));
    };

    if (providerVisible) {
      load('providerConfigs', `ai_provider_configs?select=id,provider,display_name,default_model,status,key_ref_id,budget_policy,last_validated_at,created_at&org_id=eq.${encodeURIComponent(authority.organizationId)}&deleted_at=is.null&order=created_at.desc&limit=100`);
      load('providerRoutes', `enterprise_ai_capability_routes?select=id,provider_config_id,capability,model,enabled,allowed_roles,updated_at&${scope}&deleted_at=is.null&order=updated_at.desc&limit=200`);
      load('providerRoleOptions', `roles?select=id,name,slug,scope,org_id,workspace_id&org_id=eq.${encodeURIComponent(authority.organizationId)}&status=eq.active&deleted_at=is.null&or=(and(scope.eq.workspace,workspace_id.eq.${encodeURIComponent(authority.workspaceId)}),and(scope.eq.organization,workspace_id.is.null))&order=name.asc&limit=200`);
      load('providerRoleCapabilities', 'role_capabilities?select=role_id,capability_key&capability_key=eq.org.admin&limit=200');
    }
    if (evidenceVisible) {
      load('evidenceSources', `enterprise_evidence_sources?select=id,display_name,mime_type,current_version,status,created_by,created_at&${scope}&deleted_at=is.null&order=created_at.desc&limit=100`);
      load('evidenceVersions', `enterprise_evidence_source_versions?select=id,source_id,version,content_hash,extracted_text_hash,extracted_character_count,extraction_failure_code,created_at&${scope}&order=created_at.desc&limit=100`);
      load('evidenceCandidates', `enterprise_evidence_candidates?select=id,source_id,source_version_id,field_key,value,safe_excerpt,excerpt_hash,source_locator,confidence,prompt_version,suggestion_status,created_by,reviewed_by,reviewed_at,updated_at&${scope}&order=updated_at.desc&limit=400`);
      if (hasAny(authority, 'assessment.edit', 'assess.v2.read', 'assess.v2.draft.write')) {
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
    const reviewedBy = text(candidate.reviewed_by);
    return [{
      id: text(candidate.id), sourceId: text(candidate.source_id), field: candidate.field_key as EvidenceCandidateField,
      value: text(candidate.value).slice(0, 12_000), safeExcerpt: short(candidate.safe_excerpt, 1_000) || undefined,
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
      blockers: strings(row.blockers).slice(0, 50), conflicts: strings(row.conflicts).slice(0, 50),
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

const projectCommandActivity = (raw: EnterpriseIntelligenceRawProjection): EnterpriseCommandActivityProjection[] => raw.commandReceipts.flatMap(row => {
  if (!includes(['claimed', 'committed', 'failed', 'blocked'] as const, row.status)) return [];
  return [{
    commandType: short(row.command_type, 120), status: row.status,
    completedAt: text(row.completed_at) || undefined,
    idempotencyState: row.status === 'claimed' ? 'in_progress' as const : row.status === 'committed' ? 'committed' as const : 'stable_failure' as const,
  }];
});

export const buildEnterpriseIntelligenceProjection = (
  authority: TenantContext,
  raw: EnterpriseIntelligenceRawProjection,
  generatedAt = new Date(),
): EnterpriseIntelligenceProjection => {
  const providers = projectProviders(raw, authority.capabilities.includes('org.admin'));
  const evidence = projectEvidence(raw, authority.userId);
  const assessDrafts = projectAssessDrafts(raw);
  const applications = projectApplications(raw);
  const studioDocuments = projectStudio(raw);
  const deliveryPackages = projectDelivery(raw, authority.userId);
  const monitorBaselines = projectMonitor(raw, authority.userId);
  const modernizationDecisions = projectModernization(raw, authority.userId, applications);
  const blueprints = projectBlueprints(raw, authority.userId);
  const commandActivity = projectCommandActivity(raw);
  const approvalResources = projectApprovalResources(raw, authority.userId, evidence.candidates, deliveryPackages, monitorBaselines, modernizationDecisions, blueprints);
  const accepted = evidence.candidates.filter(candidate => ['accepted', 'edited'].includes(candidate.status));
  const promotionActivity = commandActivity.find(activity => activity.commandType === 'evidence.assess.promote');
  const projectionCollections = [providers, evidence.sources, evidence.candidates, assessDrafts, applications, studioDocuments, deliveryPackages, monitorBaselines, modernizationDecisions, blueprints];
  const relevantCapabilities = authority.capabilities.filter(capability => /^(?:byok|security|evidence|assessment|assess\.|docs|studio|project|monitor|assemble|approvals)\./.test(capability));
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
    assessPromotion: {
      state: promotionActivity?.status === 'committed' ? 'promoted' : promotionActivity ? 'conflict' : accepted.length ? 'contract_pending' : 'contract_pending',
      acceptedCandidateCount: accepted.length,
      provenanceComplete: accepted.length > 0 && accepted.every(candidate => candidate.provenanceState === 'anchored'),
      idempotencyState: promotionActivity?.idempotencyState || 'not_started',
      conflicts: promotionActivity?.status === 'committed' ? [] : ['ASSESS_DRAFT_PROMOTION_COMMAND_REQUIRED'],
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
