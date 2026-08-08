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
      load('blueprints', `enterprise_asseﬂN<∂âûÀk∫wµÁdÏ4(ÄÄÄÅçΩπÕ–Å°ÖπëΩôôM—Ö—îÄÙÄÖ°ÖπëΩôòÄ¸ÄùÖŸÖ•±Öâ±îúÅÖÃÅçΩπÕ–ÄËÅ°ÖπëΩôòπÕ—Ö—’ÃÄÙÙÙÄùÕ—Ö±îúÄ¸ÄùÕ—Ö±îúÅÖÃÅçΩπÕ–ÄËÄùÖ±…ïÖëÂ}°Öπëïë}ΩôòúÅÖÃÅçΩπÕ–Ï4(ÄÄÄÅçΩπÕ–Å≠•πêÄÙÅM—…•πú°Öùù…ïùÖ—îπÖ…—•ôÖç—}—Â¡î§π—ΩU¡¡ï…ÖÕî†§Ï4(ÄÄÄÅ…ï—’…∏ÅmÏ4(ÄÄÄÄÄÅ•êËÅ—ï·–°Öùù…ïùÖ—îπ•ê§∞Å±Öâï∞ËÅÄëÌ≠•πëÙÅÖ¡¡…ΩŸïêÅëΩç’µïπ—Ä∞ÅÖ…—•ôÖç—QÂ¡îËÅÖùù…ïùÖ—îπÖ…—•ôÖç—}—Â¡îÅÖÃÄùâ…êúÅÄùô…êúÅÄù¡ëêú∞4(ÄÄÄÄÄÅÖ¡¡…ΩŸïëYï…Õ•Ωπ1Öâï∞ËÅÅ¡¡…ΩŸïêÅŸï…Õ•Ω∏ÄëÌπ’µâï»°Ÿï…Õ•Ω∏πŸï…Õ•Ω∏∞Äƒ•ıÄ∞Å±•ôïçÂç±îËÄùÖ¡¡…ΩŸïêúÅÖÃÅçΩπÕ–∞Å°ÖπëΩôôM—Ö—î∞4(ÄÄÄÅıtÏ4(ÄÅÙ§Ï4)ÙÏ4(4)çΩπÕ–Å¡…Ω©ïç—ï±•Ÿï…‰ÄÙÄ°…Ö‹ËÅπ—ï…¡…•Õï%π—ï±±•ùïπçïIÖ›A…Ω©ïç—•Ω∏∞ÅÖç—Ω…%êËÅÕ—…•πú§ËÅπ—ï…¡…•Õïï±•Ÿï…ÂAÖç≠ÖùïA…Ω©ïç—•ΩπmtÄÙ¯ÅÏ4(ÄÅçΩπÕ–ÅŸï…Õ•Ωπ	ÂAÖç≠ÖùîÄÙÅ±Ö—ïÕ—	‰°…Ö‹πëï±•Ÿï…ÂYï…Õ•ΩπÃ∞Äù›Ω…≠}¡Öç≠Öùï}•êú§Ï4(ÄÅ…ï—’…∏Å…Ö‹πëï±•Ÿï…ÂAÖç≠ÖùïÃπô±Ö—5Ö¿°•—ï¥ÄÙ¯ÅÏ4(ÄÄÄÅ•òÄ†Ö•πç±’ëïÃ°lùë…Öô–ú∞Äù…ïŸ•ï‹ú∞ÄùÖ¡¡…ΩŸïêú∞ÄùÕ—Ö±îú∞Äùâ±Ωç≠ïêùtÅÖÃÅçΩπÕ–∞Å•—ï¥πÕ—Ö—’Ã§§Å…ï—’…∏ÅmtÏ4(ÄÄÄÅçΩπÕ–ÅŸï…Õ•Ω∏ÄÙÅŸï…Õ•Ωπ	ÂAÖç≠Öùîπùï–°—ï·–°•—ï¥π•ê§§Ï4(ÄÄÄÅ•òÄ†ÖŸï…Õ•Ω∏§Å…ï—’…∏ÅmtÏ4(ÄÄÄÅçΩπÕ–Å¡Öç≠Öùï%—ïµÃÄÙÅ…Ö‹πëï±•Ÿï…Â%—ïµÃπô•±—ï»°…Ω‹ÄÙ¯Å—ï·–°…Ω‹π¡Öç≠Öùï}Ÿï…Õ•Ωπ}•ê§ÄÙÙÙÅ—ï·–°Ÿï…Õ•Ω∏π•ê§§Ï4(ÄÄÄÅçΩπÕ–Å±•πïÖùïM—Ö—îÄÙÅlùÕ—Ö±îú∞Äùâ±Ωç≠ïêùtπ•πç±’ëïÃ°M—…•πú°•—ï¥πÕ—Ö—’Ã§§Ä¸Å•—ï¥πÕ—Ö—’ÃÅÖÃÄùÕ—Ö±îúÅÄùâ±Ωç≠ïêú4(ÄÄÄÄÄÄËÅ¡Öç≠Öùï%—ïµÃπ±ïπù—†ÄòòÅ¡Öç≠Öùï%—ïµÃπïŸï…‰°…Ω‹ÄÙ¯Å—ï·–°…Ω‹πÕΩ’…çï}Õïç—•Ωπ}±ΩçÖ—Ω»§§Ä¸ÄùçΩµ¡±ï—îúÅÖÃÅçΩπÕ–ÄËÄùâ±Ωç≠ïêúÅÖÃÅçΩπÕ–Ï4(ÄÄÄÅ…ï—’…∏ÅmÏ4(ÄÄÄÄÄÅ•êËÅ—ï·–°•—ï¥π•ê§∞Å±Öâï∞ËÅÄëÌM—…•πú°Ÿï…Õ•Ω∏πÖ…—•ôÖç—}—Â¡îÅÒÄùM—’ë•ºú§π—ΩU¡¡ï…ÖÕî†•ÙÅëï±•Ÿï…‰Å¡Öç≠ÖùïÄ∞4(ÄÄÄÄÄÅÕ—Ö—’ÃËÅ•—ï¥πÕ—Ö—’ÃÅÖÃÅπ—ï…¡…•Õïï±•Ÿï…ÂAÖç≠ÖùïA…Ω©ïç—•ΩπlùÕ—Ö—’Ãùt∞Åç’……ïπ—Yï…Õ•Ωπ1Öâï∞ËÅÅAÖç≠ÖùîÅŸï…Õ•Ω∏ÄëÌπ’µâï»°Ÿï…Õ•Ω∏πŸï…Õ•Ω∏∞Äƒ•ıÄ∞4(ÄÄÄÄÄÅÕΩ’…çï1Öâï∞ËÅÄëÌM—…•πú°Ÿï…Õ•Ω∏πÖ…—•ôÖç—}—Â¡îÅÒÄùM—’ë•ºú§π—ΩU¡¡ï…ÖÕî†•ÙÅÖ¡¡…ΩŸïêÅŸï…Õ•Ω∏ÄëÌπ’µâï»°Ÿï…Õ•Ω∏πÕ—’ë•Ω}Ÿï…Õ•Ω∏∞Äƒ•ıÄ∞4(ÄÄÄÄÄÅ±•πïÖùïM—Ö—î∞4(ÄÄÄÄÄÅ•—ïµÃËÅ¡Öç≠Öùï%—ïµÃπµÖ¿°…Ω‹ÄÙ¯Ä°Ï4(ÄÄÄÄÄÄÄÅ•—ïµQÂ¡îËÅ•πç±’ëïÃ°lù¡•åú∞ÄùM—Ω…‰ú∞ÄùQÖÕ¨ú∞Äù5•±ïÕ—Ωπîú∞Äùï¡ïπëïπç‰ú∞ÄùI•Õ¨ùtÅÖÃÅçΩπÕ–∞Å…Ω‹π•—ïµ}—Â¡î§Ä¸Å…Ω‹π•—ïµ}—Â¡îÄËÄùQÖÕ¨ú∞4(ÄÄÄÄÄÄÄÅ—•—±îËÅÕ°Ω…–°…Ω‹π—•—±î∞Ä–¿¿§∞ÅÖççï¡—Öπçï…•—ï…•ÖΩ’π–ËÅÖ……Ö‰°…Ω‹πÖççï¡—Öπçï}ç…•—ï…•Ñ§π±ïπù—†∞4(ÄÄÄÄÄÄÄÅÕΩ’…çï1ΩçÖ—Ω»ËÅÕ°Ω…–°…Ω‹πÕΩ’…çï}Õïç—•Ωπ}±ΩçÖ—Ω»∞Ä–¿¿§∞4(ÄÄÄÄÄÅÙ§§∞4(ÄÄÄÄÄÅç…ïÖ—ïë	Â’……ïπ—ç—Ω»ËÅ—ï·–°•—ï¥πç…ïÖ—ïë}â‰§ÄÙÙÙÅÖç—Ω…%ê∞4(ÄÄÄÅıtÏ4(ÄÅÙ§Ï4)ÙÏ4(4)çΩπÕ–Å¡…Ω©ïç—5Ωπ•—Ω»ÄÙÄ°…Ö‹ËÅπ—ï…¡…•Õï%π—ï±±•ùïπçïIÖ›A…Ω©ïç—•Ω∏∞ÅÖç—Ω…%êËÅÕ—…•πú§ËÅπ—ï…¡…•Õï5Ωπ•—Ω…A…Ω©ïç—•ΩπmtÄÙ¯Å…Ö‹πµΩπ•—Ω…	ÖÕï±•πïÃπô±Ö—5Ö¿°…Ω‹ÄÙ¯ÅÏ4(ÄÅ•òÄ†Ö•πç±’ëïÃ°lùë…Öô–ú∞ÄùÖ¡¡…ΩŸÖ±}…ï≈’•…ïêú∞ÄùÖ¡¡…ΩŸïêú∞Äùâ±Ωç≠ïêú∞ÄùÕ—Ö±îùtÅÖÃÅçΩπÕ–∞Å…Ω‹πÕ—Ö—’Ã§ÅÒÄÖ•πç±’ëïÃ°lùπΩ—}…ïÖë‰ú∞Äù…ïŸ•ï›}…ï≈’•…ïêùtÅÖÃÅçΩπÕ–∞Å…Ω‹π…ïÖë•πïÕÃ§§Å…ï—’…∏ÅmtÏ4(ÄÅçΩπÕ–ÅÖ¡¡…ΩŸïë%—ïµΩ’π–ÄÙÅÖ……Ö‰°…Ω‹πÖ¡¡…ΩŸïë}•—ïµ}•ëÃ§π±ïπù—†Ï4(ÄÅ…ï—’…∏ÅmÏ4(ÄÄÄÅ•êËÅ—ï·–°…Ω‹π•ê§∞Å±Öâï∞ËÄùï±•Ÿï…‰ÅâÖÕï±•πîú∞Å›Ω…≠AÖç≠Öùï%êËÅ—ï·–°…Ω‹π›Ω…≠}¡Öç≠Öùï}•ê§∞4(ÄÄÄÅÕ—Ö—’ÃËÅ…Ω‹πÕ—Ö—’ÃÅÖÃÅπ—ï…¡…•Õï5Ωπ•—Ω…A…Ω©ïç—•ΩπlùÕ—Ö—’Ãùt∞Å…ïÖë•πïÕÃËÅ…Ω‹π…ïÖë•πïÕÃÅÖÃÅπ—ï…¡…•Õï5Ωπ•—Ω…A…Ω©ïç—•Ωπlù…ïÖë•πïÕÃùt∞4(ÄÄÄÅÖ¡¡…ΩŸïë%—ïµΩ’π–∞Å±•πïÖùïΩµ¡±ï—îËÅÖ¡¡…ΩŸïë%—ïµΩ’π–Ä¯Ä¿ÄòòÄÖlùâ±Ωç≠ïêú∞ÄùÕ—Ö±îùtπ•πç±’ëïÃ°M—…•πú°…Ω‹πÕ—Ö—’Ã§§∞4(ÄÄÄÅ±•ŸïQï±ïµï—…ÂΩππïç—ïêËÅôÖ±Õî∞Åç…ïÖ—ïë	Â’……ïπ—ç—Ω»ËÅ—ï·–°…Ω‹πç…ïÖ—ïë}â‰§ÄÙÙÙÅÖç—Ω…%ê∞4(ÄÅıtÏ4)Ù§Ï4(4)çΩπÕ–Å¡…Ω©ïç—5Ωëï…π•ÈÖ—•Ω∏ÄÙÄ°…Ö‹ËÅπ—ï…¡…•Õï%π—ï±±•ùïπçïIÖ›A…Ω©ïç—•Ω∏∞ÅÖç—Ω…%êËÅÕ—…•πú∞ÅÖ¡¡±•çÖ—•ΩπÃËÅ……Ö‰ÒÏÅ•êËÅÕ—…•πúÏÅπÖµîËÅÕ—…•πúÅÙ¯§ËÅπ—ï…¡…•Õï5Ωëï…π•ÈÖ—•ΩπA…Ω©ïç—•ΩπmtÄÙ¯ÅÏ4(ÄÅçΩπÕ–ÅÖÕÕïÕÕµïπ—	Â%êÄÙÅπï‹Å5Ö¿°…Ö‹πµΩëï…π•ÈÖ—•ΩπÕÕïÕÕµïπ—ÃπµÖ¿°…Ω‹ÄÙ¯Åm—ï·–°…Ω‹π•ê§∞Å…Ω›t§§Ï4(ÄÅçΩπÕ–ÅÖ¡¡±•çÖ—•Ωπ9ÖµïÃÄÙÅπï‹Å5Ö¿°Ö¡¡±•çÖ—•ΩπÃπµÖ¿°Ö¡¡±•çÖ—•Ω∏ÄÙ¯ÅmÖ¡¡±•çÖ—•Ω∏π•ê∞ÅÖ¡¡±•çÖ—•Ω∏ππÖµït§§Ï4(ÄÅ…ï—’…∏Å…Ö‹πµΩëï…π•ÈÖ—•Ωπïç•Õ•ΩπÃπô±Ö—5Ö¿°…Ω‹ÄÙ¯ÅÏ4(ÄÄÄÅ•òÄ†Ö•πç±’ëïÃ°lùë…Öô–ú∞Äù…ïŸ•ï‹ú∞ÄùÖ¡¡…ΩŸïêú∞Äù…ï©ïç—ïêú∞ÄùÕ—Ö±îú∞Äùâ±Ωç≠ïêùtÅÖÃÅçΩπÕ–∞Å…Ω‹πÕ—Ö—’Ã§ÅÒÄÖ•πç±’ëïÃ°lù…ï—Ö•∏ú∞ÄùΩ¡—•µ•Èîú∞ÄùÖ’—ΩµÖ—ï}Ö…Ω’πêú∞Äù•π—ïù…Ö—îú∞ÄùÖ¡•}ïπÖâ±ï}›…Ö¿ú∞Äù…ïôÖç—Ω»ú∞Äù…ï¡±Ö—ôΩ…¥ú∞Äù…ïâ’•±êú∞Äù…ï¡±Öçîú∞ÄùÖÕÕïµâ±îú∞Äù…ï—•…îú∞Äù•πÕ’ôô•ç•ïπ—}ïŸ•ëïπçîú∞Äùâ±Ωç≠ïêùtÅÖÃÅçΩπÕ–∞Å…Ω‹π¡…•µÖ…Â}ë•Õ¡ΩÕ•—•Ω∏§§Å…ï—’…∏ÅmtÏ4(ÄÄÄÅçΩπÕ–ÅÖÕÕïÕÕµïπ–ÄÙÅÖÕÕïÕÕµïπ—	Â%êπùï–°—ï·–°…Ω‹πµΩëï…π•ÈÖ—•Ωπ}ÖÕÕïÕÕµïπ—}•ê§§Ï4(ÄÄÄÅçΩπÕ–Å¡…•µÖ…‰ÄÙÅ…Ω‹π¡…•µÖ…Â}ë•Õ¡ΩÕ•—•Ω∏ÅÖÃÅ5Ωëï…π•ÈÖ—•Ωπ•Õ¡ΩÕ•—•Ω∏Ï4(ÄÄÄÅ…ï—’…∏ÅmÏ4(ÄÄÄÄÄÅ•êËÅ—ï·–°…Ω‹π•ê§∞ÅÖ¡¡±•çÖ—•Ωπ9ÖµîËÅÖ¡¡±•çÖ—•Ωπ9ÖµïÃπùï–°—ï·–°ÖÕÕïÕÕµïπ–¸πÖ¡¡±•çÖ—•Ωπ}…ïò§§ÅÒÄù¡¡…ΩŸïêÅÖ¡¡±•çÖ—•Ω∏ú∞4(ÄÄÄÄÄÅÕ—Ö—’ÃËÅ…Ω‹πÕ—Ö—’ÃÅÖÃÅπ—ï…¡…•Õï5Ωëï…π•ÈÖ—•ΩπA…Ω©ïç—•ΩπlùÕ—Ö—’Ãùt∞Å¡…•µÖ…Â•Õ¡ΩÕ•—•Ω∏ËÅ¡…•µÖ…‰∞4(ÄÄÄÄÄÅÖ±—ï…πÖ—•Ÿï•Õ¡ΩÕ•—•Ω∏ËÅ•πç±’ëïÃ°lù…ï—Ö•∏ú∞ÄùΩ¡—•µ•Èîú∞ÄùÖ’—ΩµÖ—ï}Ö…Ω’πêú∞Äù•π—ïù…Ö—îú∞ÄùÖ¡•}ïπÖâ±ï}›…Ö¿ú∞Äù…ïôÖç—Ω»ú∞Äù…ï¡±Ö—ôΩ…¥ú∞Äù…ïâ’•±êú∞Äù…ï¡±Öçîú∞ÄùÖÕÕïµâ±îú∞Äù…ï—•…îú∞Äù•πÕ’ôô•ç•ïπ—}ïŸ•ëïπçîú∞Äùâ±Ωç≠ïêùtÅÖÃÅçΩπÕ–∞Å…Ω‹πÖ±—ï…πÖ—•Ÿï}ë•Õ¡ΩÕ•—•Ω∏§Ä¸Å…Ω‹πÖ±—ï…πÖ—•Ÿï}ë•Õ¡ΩÕ•—•Ω∏ÅÖÃÅ5Ωëï…π•ÈÖ—•Ωπ•Õ¡ΩÕ•—•Ω∏ÄËÅ’πëïô•πïê∞4(ÄÄÄÄÄÅâ±Ωç≠ï…ÃËÅëïçΩëï5Ωëï…π•ÈÖ—•Ωπ	±Ωç≠ï…Ã°…Ω‹πâ±Ωç≠ï…Ã§∞ÅçΩπô±•ç—ÃËÅÕ—…•πùÃ°…Ω‹πçΩπô±•ç—Ã§πÕ±•çî†¿∞Ä‘¿§∞(ÄÄÄÄÄÅÖÕÕïµâ±ï±•ù•â±îËÅ…Ω‹πÕ—Ö—’ÃÄÙÙÙÄùÖ¡¡…ΩŸïêúÄòòÅMM5	1}1%%	1}%MA=M%Q%=9Lπ•πç±’ëïÃ°¡…•µÖ…‰§∞4(ÄÄÄÄÄÅç…ïÖ—ïë	Â’……ïπ—ç—Ω»ËÅ—ï·–°…Ω‹πç…ïÖ—ïë}â‰§ÄÙÙÙÅÖç—Ω…%ê∞4(ÄÄÄÅıtÏ4(ÄÅÙ§Ï4)ÙÏ4(4)çΩπÕ–Åâ±’ï¡…•π—MÖôï—‰ÄÙÄ°ŸÖ±’îËÅ’π≠πΩ›∏§ËÅÕÕïµâ±ï	±’ï¡…•π—…Öô—lùÕÖôï—‰ùtÄÙ¯ÅÏ4(ÄÅçΩπÕ–ÅÕÖôï—‰ÄÙÅΩâ©ïç–°ŸÖ±’î§Ï4(ÄÅ…ï—’…∏ÅÏ4(ÄÄÄÅçΩëïïπï…Ö—•Ω∏ËÅôÖ±Õî∞Åëï¡±ΩÂµïπ–ËÅôÖ±Õî∞Å•πô…ÖÕ—…’ç—’…ï°ÖπùïÃËÅôÖ±Õî∞4(ÄÄÄÅç…ïëïπ—•Ö±ççïÕÃËÅôÖ±Õî∞ÅÕΩ’…çïMÂÕ—ïµÖ±±ÃËÅôÖ±Õî∞Å…’π—•µïùïπ—ÃËÅôÖ±Õî∞4(ÄÄÄÄ∏∏π=â©ïç–πô…Ωµπ—…•ïÃ°lùçΩëïïπï…Ö—•Ω∏ú∞Äùëï¡±ΩÂµïπ–ú∞Äù•πô…ÖÕ—…’ç—’…ï°ÖπùïÃú∞Äùç…ïëïπ—•Ö±ççïÕÃú∞ÄùÕΩ’…çïMÂÕ—ïµÖ±±Ãú∞Äù…’π—•µïùïπ—ÃùtπµÖ¿°≠ï‰ÄÙ¯Åm≠ï‰∞ÅÕÖôï—Âm≠ïÂtÄÙÙÙÅôÖ±ÕîÄ¸ÅôÖ±ÕîÄËÅôÖ±Õït§§∞4(ÄÅÙÅÖÃÅÕÕïµâ±ï	±’ï¡…•π—…Öô—lùÕÖôï—‰ùtÏ4)ÙÏ4(4)çΩπÕ–Å¡…Ω©ïç—	±’ï¡…•π—ÃÄÙÄ°…Ö‹ËÅπ—ï…¡…•Õï%π—ï±±•ùïπçïIÖ›A…Ω©ïç—•Ω∏∞ÅÖç—Ω…%êËÅÕ—…•πú§ËÅπ—ï…¡…•Õï	±’ï¡…•π—A…Ω©ïç—•ΩπmtÄÙ¯Å…Ö‹πâ±’ï¡…•π—Ãπô±Ö—5Ö¿°…Ω‹ÄÙ¯ÅÏ4(ÄÅ•òÄ†Ö•πç±’ëïÃ°lùë…Öô–ú∞Äùïë•–ú∞Äù…ïŸ•ï‹ú∞ÄùÖ¡¡…ΩŸÖ±}…ï≈’•…ïêú∞ÄùÖ¡¡…ΩŸïêú∞ÄùÕ—Ö±îú∞Äùâ±Ωç≠ïêùtÅÖÃÅçΩπÕ–∞Å…Ω‹πÕ—Ö—’Ã§ÅÒÄÖ•πç±’ëïÃ°MM5	1}1%%	1}%MA=M%Q%=9L∞Å…Ω‹πë•Õ¡ΩÕ•—•Ω∏§§Å…ï—’…∏ÅmtÏ4(ÄÅçΩπÕ–ÅÕ—…’ç—’…ïêÄÙÅΩâ©ïç–°…Ω‹πÕ—…’ç—’…ïë}çΩπ—ïπ–§Ï4(ÄÅçΩπÕ–ÅçΩµ¡Ωπïπ—ÃÄÙÅÖ……Ö‰°Õ—…’ç—’…ïêπçΩµ¡Ωπïπ—Ã§πô±Ö—5Ö¿°ïπ—…‰ÄÙ¯ÅÏ4(ÄÄÄÅçΩπÕ–ÅçΩµ¡Ωπïπ–ÄÙÅΩâ©ïç–°ïπ—…‰§Ï4(ÄÄÄÅ•òÄ†Ö•πç±’ëïÃ°MM5	1}=5A=99Q}Q1=∞ÅçΩµ¡Ωπïπ–π—Â¡î§§Å…ï—’…∏ÅmtÏ4(ÄÄÄÅ…ï—’…∏ÅmÏÅ—Â¡îËÅçΩµ¡Ωπïπ–π—Â¡îÅÖÃÅÕÕïµâ±ïΩµ¡Ωπïπ—QÂ¡î∞ÅπÖµîËÅÕ°Ω…–°çΩµ¡Ωπïπ–ππÖµî∞Äƒÿ¿§∞ÅïπÖâ±ïêËÅâΩΩ∞°çΩµ¡Ωπïπ–πïπÖâ±ïê§ÅıtÏ4(ÄÅÙ§Ï4(ÄÅçΩπÕ–Åô•…Õ—!ïÖë•πúÄÙÅ—ï·–°Õ—…’ç—’…ïêπ…ïÖëÖâ±ïΩç’µïπ–§πÕ¡±•–†Ωq»˝q∏º§πô•πê°±•πîÄÙ¯Å±•πîπ—…•¥†§πÕ—Ö…—Õ]•—††úåÄú§§¸π…ï¡±Öçî†ΩxçqÃ¨º∞Äúú§Ï4(ÄÅ…ï—’…∏ÅmÏ4(ÄÄÄÅ•êËÅ—ï·–°…Ω‹π•ê§∞ÅπÖµîËÅÕ°Ω…–°ô•…Õ—!ïÖë•πú∞Ä»–¿§ÅÒÄùÕÕïµâ±îÅâ±’ï¡…•π–ú∞ÅÕ—Ö—’ÃËÅ…Ω‹πÕ—Ö—’ÃÅÖÃÅπ—ï…¡…•Õï	±’ï¡…•π—A…Ω©ïç—•ΩπlùÕ—Ö—’Ãùt∞4(ÄÄÄÅŸï…Õ•Ωπ1Öâï∞ËÅÅ	±’ï¡…•π–ÅŸï…Õ•Ω∏ÄëÌπ’µâï»°…Ω‹πŸï…Õ•Ω∏∞Äƒ•ıÄ∞Åë•Õ¡ΩÕ•—•Ω∏ËÅ…Ω‹πë•Õ¡ΩÕ•—•Ω∏ÅÖÃÅ5Ωëï…π•ÈÖ—•Ωπ•Õ¡ΩÕ•—•Ω∏∞4(ÄÄÄÅçΩµ¡Ωπïπ—Ã∞ÅÕÖôï—‰ËÅâ±’ï¡…•π—MÖôï—‰°Õ—…’ç—’…ïêπÕÖôï—‰§∞Åç…ïÖ—ïë	Â’……ïπ—ç—Ω»ËÅ—ï·–°…Ω‹πç…ïÖ—ïë}â‰§ÄÙÙÙÅÖç—Ω…%ê∞4(ÄÅıtÏ4)Ù§Ï4(4)çΩπÕ–ÅÖ¡¡…ΩŸÖ±IïÕΩ’…çîÄÙÄ†4(ÄÅÖç—Ω…%êËÅÕ—…•πú∞4(ÄÅ…ïÕΩ’…çïQÂ¡îËÅπ—ï…¡…•Õï¡¡…ΩŸÖ±IïÕΩ’…çïQÂ¡î∞4(ÄÅ•êËÅÕ—…•πú∞4(ÄÅ±Öâï∞ËÅÕ—…•πú∞4(ÄÅÕ—Ö—’ÃËÅÕ—…•πú∞4(ÄÅç…ïÖ—ïë	‰ËÅÕ—…•πú∞4(ÄÅ…Ö‹ËÅπ—ï…¡…•Õï%π—ï±±•ùïπçïIÖ›A…Ω©ïç—•Ω∏∞4(§ËÅπ—ï…¡…•Õï¡¡…ΩŸÖ±IïÕΩ’…çïA…Ω©ïç—•Ω∏ÄÙ¯ÅÏ4(ÄÅçΩπÕ–Å…ïŸ•ï‹ÄÙÅl∏∏π…Ö‹π…ïŸ•ï›Ÿïπ—ÕtπÕΩ…–°âÂ9ï›ïÕ–§πô•πê°…Ω‹ÄÙ¯Å…Ω‹π…ïÕΩ’…çï}—Â¡îÄÙÙÙÅ…ïÕΩ’…çïQÂ¡îÄòòÅ…Ω‹π…ïÕΩ’…çï}•êÄÙÙÙÅ•ê§Ï4(ÄÅçΩπÕ–ÅÖ¡¡…ΩŸÖ∞ÄÙÅl∏∏π…Ö‹πÖ¡¡…ΩŸÖ±ÕtπÕΩ…–°âÂ9ï›ïÕ–§πô•πê°…Ω‹ÄÙ¯Å…Ω‹π…ïÕΩ’…çï}—Â¡îÄÙÙÙÅ…ïÕΩ’…çïQÂ¡îÄòòÅ…Ω‹π…ïÕΩ’…çï}•êÄÙÙÙÅ•ê§Ï4(ÄÅçΩπÕ–Åç…ïÖ—ïë	Â’……ïπ—ç—Ω»ÄÙÅç…ïÖ—ïë	‰ÄÙÙÙÅÖç—Ω…%êÏ4(ÄÅçΩπÕ–Å…ïŸ•ï›	Â’……ïπ—ç—Ω»ÄÙÅ—ï·–°…ïŸ•ï‹¸π…ïŸ•ï›ï…}•ê§ÄÙÙÙÅÖç—Ω…%êÏ4(ÄÅçΩπÕ–ÅÖ¡¡…ΩŸÖ±M—Ö—îÄÙÅÖ¡¡…ΩŸÖ∞¸πΩ’—çΩµîÄÙÙÙÄùÖ¡¡…ΩŸïêúÄ¸ÄùÖ¡¡…ΩŸïêúÅÖÃÅçΩπÕ–ÄËÅÖ¡¡…ΩŸÖ∞¸πΩ’—çΩµîÄÙÙÙÄù…ï©ïç—ïêúÄ¸Äù…ï©ïç—ïêúÅÖÃÅçΩπÕ–ÄËÄùπΩ—}…ïçΩ…ëïêúÅÖÃÅçΩπÕ–Ï4(ÄÅçΩπÕ–ÅÕï¡Ö…Ö—•Ωπ=ô’—•ïÃÄÙÅÖ¡¡…ΩŸÖ∞Ä¸ÄùçΩµ¡±ï—îúÅÖÃÅçΩπÕ–4(ÄÄÄÄËÅç…ïÖ—ïë	Â’……ïπ—ç—Ω»Ä¸Äùç…ïÖ—Ω…}çÖππΩ—}…ïŸ•ï‹úÅÖÃÅçΩπÕ–4(ÄÄÄÄÄÄËÅ…ïŸ•ï›	Â’……ïπ—ç—Ω»Ä¸Äù…ïŸ•ï›ï…}çÖππΩ—}Ö¡¡…ΩŸîúÅÖÃÅçΩπÕ–4(ÄÄÄÄÄÄÄÄËÅ…ïŸ•ï‹Ä¸Äùï±•ù•â±ï}ôΩ…}Ö¡¡…ΩŸÖ∞úÅÖÃÅçΩπÕ–ÄËÄùï±•ù•â±ï}ôΩ…}…ïŸ•ï‹úÅÖÃÅçΩπÕ–Ï4(ÄÅ…ï—’…∏ÅÏ4(ÄÄÄÅ•ê∞Å…ïÕΩ’…çïQÂ¡î∞Å±Öâï∞∞ÅÕ—Ö—’Ã∞Åç…ïÖ—ïë	Â’……ïπ—ç—Ω»∞4(ÄÄÄÅ•πëï¡ïπëïπ—IïŸ•ï›M—Ö—îËÄÖ…ïŸ•ï‹Ä¸ÄùπΩ—}…ïçΩ…ëïêúÄËÅ…ïŸ•ï›	Â’……ïπ—ç—Ω»Ä¸Äù…ïçΩ…ëïë}âÂ}ÂΩ‘úÄËÄù…ïçΩ…ëïë}âÂ}ÖπΩ—°ï»ú∞4(ÄÄÄÅÖ¡¡…ΩŸÖ±M—Ö—î∞ÅÕï¡Ö…Ö—•Ωπ=ô’—•ïÃ∞4(ÄÅÙÏ4)ÙÏ4(4)çΩπÕ–Å¡…Ω©ïç—¡¡…ΩŸÖ±IïÕΩ’…çïÃÄÙÄ†4(ÄÅ…Ö‹ËÅπ—ï…¡…•Õï%π—ï±±•ùïπçïIÖ›A…Ω©ïç—•Ω∏∞4(ÄÅÖç—Ω…%êËÅÕ—…•πú∞4(ÄÅçÖπë•ëÖ—ïÃËÅπ—ï…¡…•ÕïŸ•ëïπçïÖπë•ëÖ—ïA…Ω©ïç—•Ωπmt∞4(ÄÅëï±•Ÿï…‰ËÅπ—ï…¡…•Õïï±•Ÿï…ÂAÖç≠ÖùïA…Ω©ïç—•Ωπmt∞4(ÄÅµΩπ•—Ω…ÃËÅπ—ï…¡…•Õï5Ωπ•—Ω…A…Ω©ïç—•Ωπmt∞4(ÄÅµΩëï…π•ÈÖ—•Ω∏ËÅπ—ï…¡…•Õï5Ωëï…π•ÈÖ—•ΩπA…Ω©ïç—•Ωπmt∞4(ÄÅâ±’ï¡…•π—ÃËÅπ—ï…¡…•Õï	±’ï¡…•π—A…Ω©ïç—•Ωπmt∞4(§ÄÙ¯Ål4(ÄÄ∏∏πçÖπë•ëÖ—ïÃπô•±—ï»°•—ï¥ÄÙ¯ÅlùÖççï¡—ïêú∞Äùïë•—ïêùtπ•πç±’ëïÃ°•—ï¥πÕ—Ö—’Ã§§πµÖ¿°•—ï¥ÄÙ¯ÅÖ¡¡…ΩŸÖ±IïÕΩ’…çî°Öç—Ω…%ê∞ÄùïŸ•ëïπçï}çÖπë•ëÖ—îú∞Å•—ï¥π•ê∞ÅÄëÌ•—ï¥πô•ï±êπ…ï¡±Öçï±∞†ù|ú∞ÄúÄú•ÙÅïŸ•ëïπçïÄ∞Å•—ï¥πÕ—Ö—’Ã∞Å—ï·–°…Ö‹πïŸ•ëïπçïÖπë•ëÖ—ïÃπô•πê°…Ω‹ÄÙ¯Å…Ω‹π•êÄÙÙÙÅ•—ï¥π•ê§¸πç…ïÖ—ïë}â‰§∞Å…Ö‹§§∞4(ÄÄ∏∏πµΩëï…π•ÈÖ—•Ω∏πµÖ¿°•—ï¥ÄÙ¯ÅÖ¡¡…ΩŸÖ±IïÕΩ’…çî°Öç—Ω…%ê∞ÄùµΩëï…π•ÈÖ—•Ωπ}ëïç•Õ•Ω∏ú∞Å•—ï¥π•ê∞ÅÄëÌ•—ï¥πÖ¡¡±•çÖ—•Ωπ9ÖµïÙËÄëÌ•—ï¥π¡…•µÖ…Â•Õ¡ΩÕ•—•ΩπıÄ∞Å•—ï¥πÕ—Ö—’Ã∞Å—ï·–°…Ö‹πµΩëï…π•ÈÖ—•Ωπïç•Õ•ΩπÃπô•πê°…Ω‹ÄÙ¯Å…Ω‹π•êÄÙÙÙÅ•—ï¥π•ê§¸πç…ïÖ—ïë}â‰§∞Å…Ö‹§§∞4(ÄÄ∏∏πëï±•Ÿï…‰πµÖ¿°•—ï¥ÄÙ¯ÅÖ¡¡…ΩŸÖ±IïÕΩ’…çî°Öç—Ω…%ê∞Äùëï±•Ÿï…Â}›Ω…≠}¡Öç≠Öùîú∞Å•—ï¥π•ê∞Å•—ï¥π±Öâï∞∞Å•—ï¥πÕ—Ö—’Ã∞Å—ï·–°…Ö‹πëï±•Ÿï…ÂAÖç≠ÖùïÃπô•πê°…Ω‹ÄÙ¯Å…Ω‹π•êÄÙÙÙÅ•—ï¥π•ê§¸πç…ïÖ—ïë}â‰§∞Å…Ö‹§§∞4(ÄÄ∏∏πµΩπ•—Ω…ÃπµÖ¿°•—ï¥ÄÙ¯ÅÖ¡¡…ΩŸÖ±IïÕΩ’…çî°Öç—Ω…%ê∞ÄùµΩπ•—Ω…}âÖÕï±•πîú∞Å•—ï¥π•ê∞Å•—ï¥π±Öâï∞∞Å•—ï¥πÕ—Ö—’Ã∞Å—ï·–°…Ö‹πµΩπ•—Ω…	ÖÕï±•πïÃπô•πê°…Ω‹ÄÙ¯Å…Ω‹π•êÄÙÙÙÅ•—ï¥π•ê§¸πç…ïÖ—ïë}â‰§∞Å…Ö‹§§∞4(ÄÄ∏∏πâ±’ï¡…•π—ÃπµÖ¿°•—ï¥ÄÙ¯ÅÖ¡¡…ΩŸÖ±IïÕΩ’…çî°Öç—Ω…%ê∞ÄùÖÕÕïµâ±ï}â±’ï¡…•π–ú∞Å•—ï¥π•ê∞Å•—ï¥ππÖµî∞Å•—ï¥πÕ—Ö—’Ã∞Å—ï·–°…Ö‹πâ±’ï¡…•π—Ãπô•πê°…Ω‹ÄÙ¯Å…Ω‹π•êÄÙÙÙÅ•—ï¥π•ê§¸πç…ïÖ—ïë}â‰§∞Å…Ö‹§§∞4)tÏ4(4)çΩπÕ–Å¡…Ω©ïç—ΩµµÖπëç—•Ÿ•—‰ÄÙÄ°…Ö‹ËÅπ—ï…¡…•Õï%π—ï±±•ùïπçïIÖ›A…Ω©ïç—•Ω∏§ËÅπ—ï…¡…•ÕïΩµµÖπëç—•Ÿ•—ÂA…Ω©ïç—•ΩπmtÄÙ¯Å…Ö‹πçΩµµÖπëIïçï•¡—Ãπô±Ö—5Ö¿°…Ω‹ÄÙ¯ÅÏ4(ÄÅ•òÄ†Ö•πç±’ëïÃ°lùç±Ö•µïêú∞ÄùçΩµµ•——ïêú∞ÄùôÖ•±ïêú∞Äùâ±Ωç≠ïêùtÅÖÃÅçΩπÕ–∞Å…Ω‹πÕ—Ö—’Ã§§Å…ï—’…∏ÅmtÏ4(ÄÅ…ï—’…∏ÅmÏ4(ÄÄÄÅçΩµµÖπëQÂ¡îËÅÕ°Ω…–°…Ω‹πçΩµµÖπë}—Â¡î∞Äƒ»¿§∞ÅÕ—Ö—’ÃËÅ…Ω‹πÕ—Ö—’Ã∞4(ÄÄÄÅçΩµ¡±ï—ïë–ËÅ—ï·–°…Ω‹πçΩµ¡±ï—ïë}Ö–§ÅÒÅ’πëïô•πïê∞4(ÄÄÄÅ•ëïµ¡Ω—ïπçÂM—Ö—îËÅ…Ω‹πÕ—Ö—’ÃÄÙÙÙÄùç±Ö•µïêúÄ¸Äù•π}¡…Ωù…ïÕÃúÅÖÃÅçΩπÕ–ÄËÅ…Ω‹πÕ—Ö—’ÃÄÙÙÙÄùçΩµµ•——ïêúÄ¸ÄùçΩµµ•——ïêúÅÖÃÅçΩπÕ–ÄËÄùÕ—Öâ±ï}ôÖ•±’…îúÅÖÃÅçΩπÕ–∞4(ÄÅıtÏ4)Ù§Ï4(4)ï·¡Ω…–ÅçΩπÕ–Åâ’•±ëπ—ï…¡…•Õï%π—ï±±•ùïπçïA…Ω©ïç—•Ω∏ÄÙÄ†4(ÄÅÖ’—°Ω…•—‰ËÅQïπÖπ—Ωπ—ï·–∞4(ÄÅ…Ö‹ËÅπ—ï…¡…•Õï%π—ï±±•ùïπçïIÖ›A…Ω©ïç—•Ω∏∞4(ÄÅùïπï…Ö—ïë–ÄÙÅπï‹ÅÖ—î†§∞4(§ËÅπ—ï…¡…•Õï%π—ï±±•ùïπçïA…Ω©ïç—•Ω∏ÄÙ¯ÅÏ4(ÄÅçΩπÕ–Å¡…ΩŸ•ëï…ÃÄÙÅ¡…Ω©ïç—A…ΩŸ•ëï…Ã°…Ö‹∞ÅÖ’—°Ω…•—‰πçÖ¡Öâ•±•—•ïÃπ•πç±’ëïÃ†ùΩ…úπÖëµ•∏ú§§Ï4(ÄÅçΩπÕ–ÅïŸ•ëïπçîÄÙÅ¡…Ω©ïç—Ÿ•ëïπçî°…Ö‹∞ÅÖ’—°Ω…•—‰π’Õï…%ê§Ï4(ÄÅçΩπÕ–ÅÖÕÕïÕÕ…Öô—ÃÄÙÅ¡…Ω©ïç—ÕÕïÕÕ…Öô—Ã°…Ö‹§Ï4(ÄÅçΩπÕ–ÅÖ¡¡±•çÖ—•ΩπÃÄÙÅ¡…Ω©ïç—¡¡±•çÖ—•ΩπÃ°…Ö‹§Ï4(ÄÅçΩπÕ–ÅÕ—’ë•ΩΩç’µïπ—ÃÄÙÅ¡…Ω©ïç—M—’ë•º°…Ö‹§Ï4(ÄÅçΩπÕ–Åëï±•Ÿï…ÂAÖç≠ÖùïÃÄÙÅ¡…Ω©ïç—ï±•Ÿï…‰°…Ö‹∞ÅÖ’—°Ω…•—‰π’Õï…%ê§Ï4(ÄÅçΩπÕ–ÅµΩπ•—Ω…	ÖÕï±•πïÃÄÙÅ¡…Ω©ïç—5Ωπ•—Ω»°…Ö‹∞ÅÖ’—°Ω…•—‰π’Õï…%ê§Ï4(ÄÅçΩπÕ–ÅµΩëï…π•ÈÖ—•Ωπïç•Õ•ΩπÃÄÙÅ¡…Ω©ïç—5Ωëï…π•ÈÖ—•Ω∏°…Ö‹∞ÅÖ’—°Ω…•—‰π’Õï…%ê∞ÅÖ¡¡±•çÖ—•ΩπÃ§Ï4(ÄÅçΩπÕ–Åâ±’ï¡…•π—ÃÄÙÅ¡…Ω©ïç—	±’ï¡…•π—Ã°…Ö‹∞ÅÖ’—°Ω…•—‰π’Õï…%ê§Ï4(ÄÅçΩπÕ–ÅçΩµµÖπëç—•Ÿ•—‰ÄÙÅ¡…Ω©ïç—ΩµµÖπëç—•Ÿ•—‰°…Ö‹§Ï4(ÄÅçΩπÕ–ÅÖ¡¡…ΩŸÖ±IïÕΩ’…çïÃÄÙÅ¡…Ω©ïç—¡¡…ΩŸÖ±IïÕΩ’…çïÃ°…Ö‹∞ÅÖ’—°Ω…•—‰π’Õï…%ê∞ÅïŸ•ëïπçîπçÖπë•ëÖ—ïÃ∞Åëï±•Ÿï…ÂAÖç≠ÖùïÃ∞ÅµΩπ•—Ω…	ÖÕï±•πïÃ∞ÅµΩëï…π•ÈÖ—•Ωπïç•Õ•ΩπÃ∞Åâ±’ï¡…•π—Ã§Ï4(ÄÅçΩπÕ–ÅÖççï¡—ïêÄÙÅïŸ•ëïπçîπçÖπë•ëÖ—ïÃπô•±—ï»°çÖπë•ëÖ—îÄÙ¯ÅlùÖççï¡—ïêú∞Äùïë•—ïêùtπ•πç±’ëïÃ°çÖπë•ëÖ—îπÕ—Ö—’Ã§§Ï4(ÄÅçΩπÕ–Å¡…ΩµΩ—•Ωπç—•Ÿ•—‰ÄÙÅçΩµµÖπëç—•Ÿ•—‰πô•πê°Öç—•Ÿ•—‰ÄÙ¯ÅÖç—•Ÿ•—‰πçΩµµÖπëQÂ¡îÄÙÙÙÄùïŸ•ëïπçîπÖÕÕïÕÃπ¡…ΩµΩ—îú§Ï4(ÄÅçΩπÕ–Å¡…Ω©ïç—•ΩπΩ±±ïç—•ΩπÃÄÙÅm¡…ΩŸ•ëï…Ã∞ÅïŸ•ëïπçîπÕΩ’…çïÃ∞ÅïŸ•ëïπçîπçÖπë•ëÖ—ïÃ∞ÅÖÕÕïÕÕ…Öô—Ã∞ÅÖ¡¡±•çÖ—•ΩπÃ∞ÅÕ—’ë•ΩΩç’µïπ—Ã∞Åëï±•Ÿï…ÂAÖç≠ÖùïÃ∞ÅµΩπ•—Ω…	ÖÕï±•πïÃ∞ÅµΩëï…π•ÈÖ—•Ωπïç•Õ•ΩπÃ∞Åâ±’ï¡…•π—ÕtÏ4(ÄÅçΩπÕ–Å…ï±ïŸÖπ—Ö¡Öâ•±•—•ïÃÄÙÅÖ’—°Ω…•—‰πçÖ¡Öâ•±•—•ïÃπô•±—ï»°çÖ¡Öâ•±•—‰ÄÙ¯ÄΩx†¸ÈâÂΩ≠ÒÕïç’…•—ÂÒïŸ•ëïπçïÒÖÕÕïÕÕµïπ—ÒÖÕÕïÕÕpπÒëΩçÕÒÕ—’ë•ΩÒ¡…Ω©ïç—ÒµΩπ•—Ω…ÒÖÕÕïµâ±ïÒÖ¡¡…ΩŸÖ±Ã•p∏ºπ—ïÕ–°çÖ¡Öâ•±•—‰§§Ï4(ÄÅ…ï—’…∏ÅÏ4(ÄÄÄÅÕç°ïµÖYï…Õ•Ω∏ËÅ9QIAI%M}%9Q11%9}AI=)Q%=9}YIM%=8∞4(ÄÄÄÅΩ…ùÖπ•ÈÖ—•Ωπ%êËÅÖ’—°Ω…•—‰πΩ…ùÖπ•ÈÖ—•Ωπ%ê∞4(ÄÄÄÅ›Ω…≠Õ¡Öçï%êËÅÖ’—°Ω…•—‰π›Ω…≠Õ¡Öçï%ê∞4(ÄÄÄÅÖ’—°Ω…•ÈÖ—•ΩπYï…Õ•Ω∏ËÅÖ’—°Ω…•—‰πÖ’—°Ω…•ÈÖ—•ΩπYï…Õ•Ω∏∞4(ÄÄÄÅùïπï…Ö—ïë–ËÅùïπï…Ö—ïë–π—Ω%M=M—…•πú†§∞4(ÄÄÄÅçÖ¡Öâ•±•—•ïÃËÅl∏∏πÖ’—°Ω…•—‰πçÖ¡Öâ•±•—•ïÕt∞4(ÄÄÄÅÖŸÖ•±Öâ•±•—‰ËÅ…ï±ïŸÖπ—Ö¡Öâ•±•—•ïÃπ±ïπù—†ÄÙÙÙÄ¿Ä¸Äùâ±Ωç≠ïêúÄËÅ¡…Ω©ïç—•ΩπΩ±±ïç—•ΩπÃπÕΩµî°çΩ±±ïç—•Ω∏ÄÙ¯ÅçΩ±±ïç—•Ω∏π±ïπù—†§Ä¸Äù…ïÖë‰úÄËÄùïµ¡—‰ú∞4(ÄÄÄÅ¡…ΩŸ•ëï…Ã∞4(ÄÄÄÅïŸ•ëïπçïMΩ’…çïÃËÅïŸ•ëïπçîπÕΩ’…çïÃ∞4(ÄÄÄÅïŸ•ëïπçïÖπë•ëÖ—ïÃËÅïŸ•ëïπçîπçÖπë•ëÖ—ïÃ∞4(ÄÄÄÅÖÕÕïÕÕ…Öô—Ã∞4(ÄÄÄÅÖ¡¡±•çÖ—•ΩπÃ∞4(ÄÄÄÅÕ—’ë•ΩΩç’µïπ—Ã∞4(ÄÄÄÅëï±•Ÿï…ÂAÖç≠ÖùïÃ∞4(ÄÄÄÅµΩπ•—Ω…	ÖÕï±•πïÃ∞4(ÄÄÄÅµΩëï…π•ÈÖ—•Ωπïç•Õ•ΩπÃ∞4(ÄÄÄÅâ±’ï¡…•π—Ã∞4(ÄÄÄÅÖ¡¡…ΩŸÖ±IïÕΩ’…çïÃ∞4(ÄÄÄÅçΩµµÖπëç—•Ÿ•—‰∞4(ÄÄÄÅÖÕÕïÕÕA…ΩµΩ—•Ω∏ËÅÏ4(ÄÄÄÄÄÅÕ—Ö—îËÅ¡…ΩµΩ—•Ωπç—•Ÿ•—‰¸πÕ—Ö—’ÃÄÙÙÙÄùçΩµµ•——ïêúÄ¸Äù¡…ΩµΩ—ïêúÄËÅ¡…ΩµΩ—•Ωπç—•Ÿ•—‰Ä¸ÄùçΩπô±•ç–úÄËÅÖççï¡—ïêπ±ïπù—†Ä¸ÄùçΩπ—…Öç—}¡ïπë•πúúÄËÄùçΩπ—…Öç—}¡ïπë•πúú∞4(ÄÄÄÄÄÅÖççï¡—ïëÖπë•ëÖ—ïΩ’π–ËÅÖççï¡—ïêπ±ïπù—†∞4(ÄÄÄÄÄÅ¡…ΩŸïπÖπçïΩµ¡±ï—îËÅÖççï¡—ïêπ±ïπù—†Ä¯Ä¿ÄòòÅÖççï¡—ïêπïŸï…‰°çÖπë•ëÖ—îÄÙ¯ÅçÖπë•ëÖ—îπ¡…ΩŸïπÖπçïM—Ö—îÄÙÙÙÄùÖπç°Ω…ïêú§∞4(ÄÄÄÄÄÅ•ëïµ¡Ω—ïπçÂM—Ö—îËÅ¡…ΩµΩ—•Ωπç—•Ÿ•—‰¸π•ëïµ¡Ω—ïπçÂM—Ö—îÅÒÄùπΩ—}Õ—Ö…—ïêú∞4(ÄÄÄÄÄÅçΩπô±•ç—ÃËÅ¡…ΩµΩ—•Ωπç—•Ÿ•—‰¸πÕ—Ö—’ÃÄÙÙÙÄùçΩµµ•——ïêúÄ¸ÅmtÄËÅlùMMMM}IQ}AI=5=Q%=9}=559}IEU%Iùt∞4(ÄÄÄÅÙ∞4(ÄÅÙÏ4)ÙÏ4(4)çΩπÕ–Å¡Ö…ÕïIï≈’ïÕ–ÄÙÄ°ŸÖ±’îËÅ’π≠πΩ›∏§ÄÙ¯ÅÏ4(ÄÅ•òÄ†Ö•ÕIΩ‹°ŸÖ±’î§ÅÒÅ=â©ïç–π≠ïÂÃ°ŸÖ±’î§πÕΩµî°≠ï‰ÄÙ¯ÄÖ…ï≈’ïÕ—-ïÂÃπ•πç±’ëïÃ°≠ï‰§§§Å…ï—’…∏Åπ’±∞Ï4(ÄÅ•òÄ°—Â¡ïΩòÅŸÖ±’îπΩ…ùÖπ•ÈÖ—•Ωπ%êÄÑÙÙÄùÕ—…•πúúÅÒÄÖ’’•êπ—ïÕ–°ŸÖ±’îπΩ…ùÖπ•ÈÖ—•Ωπ%ê§ÅÒÅ—Â¡ïΩòÅŸÖ±’îπ›Ω…≠Õ¡Öçï%êÄÑÙÙÄùÕ—…•πúúÅÒÄÖ’’•êπ—ïÕ–°ŸÖ±’îπ›Ω…≠Õ¡Öçï%ê§§Å…ï—’…∏Åπ’±∞Ï4(ÄÅ•òÄ°ŸÖ±’îπï·¡ïç—ïë’—°Ω…•ÈÖ—•ΩπYï…Õ•Ω∏ÄÑÙÙÅ’πëïô•πïêÄòòÄ†Ö9’µâï»π•ÕMÖôï%π—ïùï»°ŸÖ±’îπï·¡ïç—ïë’—°Ω…•ÈÖ—•ΩπYï…Õ•Ω∏§ÅÒÅπ’µâï»°ŸÖ±’îπï·¡ïç—ïë’—°Ω…•ÈÖ—•ΩπYï…Õ•Ω∏§ÄÄƒ§§Å…ï—’…∏Åπ’±∞Ï4(ÄÅ…ï—’…∏ÅÏ4(ÄÄÄÅΩ…ùÖπ•ÈÖ—•Ωπ%êËÅŸÖ±’îπΩ…ùÖπ•ÈÖ—•Ωπ%ê∞4(ÄÄÄÅ›Ω…≠Õ¡Öçï%êËÅŸÖ±’îπ›Ω…≠Õ¡Öçï%ê∞4(ÄÄÄÅï·¡ïç—ïë’—°Ω…•ÈÖ—•ΩπYï…Õ•Ω∏ËÅŸÖ±’îπï·¡ïç—ïë’—°Ω…•ÈÖ—•ΩπYï…Õ•Ω∏ÅÖÃÅπ’µâï»ÅÅ’πëïô•πïê∞4(ÄÅÙÏ4)ÙÏ4(4)ï·¡Ω…–ÅçΩπÕ–Å°Öπë±ïπ—ï…¡…•Õï%π—ï±±•ùïπçïE’ï…‰ÄÙÅÖÕÂπåÄ°…ï≈’ïÕ–ËÅIï≈’ïÕ–∞Åëï¡ïπëïπç•ïÃËÅπ—ï…¡…•Õï%π—ï±±•ùïπçïE’ï…Âï¡ïπëïπç•ïÃ§ËÅA…Ωµ•ÕîÒIïÕ¡ΩπÕî¯ÄÙ¯ÅÏ4(ÄÅ•òÄ°…ï≈’ïÕ–πµï—°ΩêÄÙÙÙÄù=AQ%=9Lú§Å…ï—’…∏Åπï‹ÅIïÕ¡ΩπÕî†ùΩ¨ú∞ÅÏÅ°ïÖëï…ÃËÅçΩ…Õ!ïÖëï…ÃÅÙ§Ï4(ÄÅ•òÄ°…ï≈’ïÕ–πµï—°ΩêÄÑÙÙÄùA=MPú§Å…ï—’…∏Å©ÕΩ∏†–¿‘∞ÅÏÅçΩëîËÄù5Q!=}9=Q}11=]úÅÙ§Ï4(ÄÅ±ï–Å’Õï»ËÅÏÅ•êËÅÕ—…•πúÅÙÏ4(ÄÅ—…‰ÅÏ4(ÄÄÄÅ’Õï»ÄÙÅÖ›Ö•–Åëï¡ïπëïπç•ïÃπÖ’—°ïπ—•çÖ—î°…ï≈’ïÕ–§Ï4(ÄÅÙÅçÖ—ç†ÅÏ4(ÄÄÄÅ…ï—’…∏Å©ÕΩ∏†–¿ƒ∞ÅÏÅçΩëîËÄùUQ!9Q%Q%=9}IEU%IúÅÙ§Ï4(ÄÅÙ4(ÄÅ±ï–Å¡Ö…ÕïêËÅIï—’…πQÂ¡îÒ—Â¡ïΩòÅ¡Ö…ÕïIï≈’ïÕ–¯Ï4(ÄÅ—…‰ÅÏ4(ÄÄÄÅ¡Ö…ÕïêÄÙÅ¡Ö…ÕïIï≈’ïÕ–°Ö›Ö•–Å…ï≈’ïÕ–π©ÕΩ∏†§§Ï4(ÄÅÙÅçÖ—ç†ÅÏ4(ÄÄÄÅ…ï—’…∏Å©ÕΩ∏†–¿¿∞ÅÏÅçΩëîËÄù%9Y1%}IEUMPúÅÙ§Ï4(ÄÅÙ4(ÄÅ•òÄ†Ö¡Ö…Õïê§Å…ï—’…∏Å©ÕΩ∏†–¿¿∞ÅÏÅçΩëîËÄù%9Y1%}IEUMPúÅÙ§Ï4(ÄÅ—…‰ÅÏ4(ÄÄÄÅçΩπÕ–ÅÖ’—°Ω…•—‰ÄÙÅÖ›Ö•–Å…ïÕΩ±ŸïQïπÖπ—’—°Ω…•—‰°’Õï»π•ê∞Å¡Ö…Õïê∞Åëï¡ïπëïπç•ïÃπÖ’—°Ω…•—ÂÖ—ÖâÖÕî§Ï4(ÄÄÄÅçΩπÕ–Å…Ö‹ÄÙÅÖ›Ö•–Åëï¡ïπëïπç•ïÃπ≈’ï…ÂÖ—ÖâÖÕîπ±ΩÖëA…Ω©ïç—•ΩπIΩ›Ã°Ö’—°Ω…•—‰§Ï4(ÄÄÄÅ…ï—’…∏Å©ÕΩ∏†»¿¿∞ÅÏÅ¡…Ω©ïç—•Ω∏ËÅâ’•±ëπ—ï…¡…•Õï%π—ï±±•ùïπçïA…Ω©ïç—•Ω∏°Ö’—°Ω…•—‰∞Å…Ö‹∞Åëï¡ïπëïπç•ïÃππΩ‹¸∏†§ÅÒÅπï‹ÅÖ—î†§§ÅÙ§Ï4(ÄÅÙÅçÖ—ç†Ä°ï……Ω»§ÅÏ4(ÄÄÄÅ•òÄ°ï……Ω»Å•πÕ—ÖπçïΩòÅQïπÖπ—’—°Ω…•—Â……Ω»§Å…ï—’…∏Å©ÕΩ∏°ï……Ω»πçΩëîÄÙÙÙÄùUQ!=I%iQ%=9}MQ1úÄ¸Ä–¿‰ÄËÄ–¿Ã∞ÅÏÅçΩëîËÅï……Ω»πçΩëîÅÙ§Ï4(ÄÄÄÅ…ï—’…∏Å©ÕΩ∏†‘¿Ã∞ÅÏÅçΩëîËÄù9QIAI%M}AI=)Q%=9}U9Y%1	1úÅÙ§Ï4(ÄÅÙ4)ÙÏ4(