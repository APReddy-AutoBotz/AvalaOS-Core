import assert from 'node:assert/strict';
import {
  assessApplication,
  type ApplicationMetadata,
  type ApplicationRecord,
} from '../../../services/assessV2/applicationPortfolio.ts';
import { decodeEnterpriseIntelligenceProjection } from '../../../services/enterpriseIntelligence.ts';
import {
  createDeliveryWorkspaceFixture,
  createMonitorBaselinesFixture,
} from '../../../services/deliveryMonitor/fixtures.ts';
import type { TenantAuthorityDatabase, TenantContext } from './tenantAuthority.ts';
import {
  buildEnterpriseIntelligenceProjection,
  createEnterpriseIntelligenceQueryDatabase,
  decodeModernizationBlockers,
  handleEnterpriseIntelligenceQuery,
  type EnterpriseIntelligenceQueryDatabase,
  type EnterpriseIntelligenceRawProjection,
} from './enterpriseIntelligenceQuery.ts';

const USER = '10000000-0000-4000-8000-000000000001';
const REVIEWER = '10000000-0000-4000-8000-000000000002';
const ORG = '20000000-0000-4000-8000-000000000002';
const WORKSPACE = '30000000-0000-4000-8000-000000000003';
const CONFIG = '40000000-0000-4000-8000-000000000004';
const ROUTE = '50000000-0000-4000-8000-000000000005';
const ROUTE_ROLE = '51000000-0000-4000-8000-000000000015';
const SOURCE = '60000000-0000-4000-8000-000000000006';
const SOURCE_VERSION = '70000000-0000-4000-8000-000000000007';
const CANDIDATE = '80000000-0000-4000-8000-000000000008';
const APPLICATION = '90000000-0000-4000-8000-000000000009';
const APPLICATION_ASSESSMENT = 'a0000000-0000-4000-8000-00000000000a';
const STUDIO = 'b0000000-0000-4000-8000-00000000000b';
const STUDIO_VERSION = 'c0000000-0000-4000-8000-00000000000c';
const PACKAGE = 'd0000000-0000-4000-8000-00000000000d';
const PACKAGE_VERSION = 'e0000000-0000-4000-8000-00000000000e';
const MONITOR = 'f0000000-0000-4000-8000-00000000000f';
const MODERN_ASSESSMENT = '11000000-0000-4000-8000-000000000011';
const DECISION = '12000000-0000-4000-8000-000000000012';
const BLUEPRINT = '13000000-0000-4000-8000-000000000013';
const ASSESS_DRAFT = '16000000-0000-4000-8000-000000000016';
const TRANSCRIPT_SOURCE_SET = '17000000-0000-4000-8000-000000000017';
const TRANSCRIPT_SOURCE_SET_VERSION = '18000000-0000-4000-8000-000000000018';
const TRANSCRIPT_SOURCE_SET_VERSION_NEXT = '22000000-0000-4000-8000-000000000022';
const TRANSCRIPT_BUNDLE = '19000000-0000-4000-8000-000000000019';
const TRANSCRIPT_BUNDLE_VERSION = '1a000000-0000-4000-8000-00000000001a';
const TRANSCRIPT_BINDING = '1b000000-0000-4000-8000-00000000001b';
const TRANSCRIPT_JOB = '1c000000-0000-4000-8000-00000000001c';
const UNRELATED_JOB = '1d000000-0000-4000-8000-00000000001d';
const TRANSCRIPT_PREVIEW = '1e000000-0000-4000-8000-00000000001e';
const TRANSCRIPT_PREVIEW_BATCH = '1f000000-0000-4000-8000-00000000001f';
const TRANSCRIPT_JOURNEY = '23000000-0000-4000-8000-000000000023';
const TRANSCRIPT_CONFLICT = '24000000-0000-4000-8000-000000000024';
const HIDDEN_CANARY_IDS = {
  assessDraft: '31000000-0000-4000-8000-000000000031',
  journey: '32000000-0000-4000-8000-000000000032',
  candidate: '33000000-0000-4000-8000-000000000033',
  preview: '34000000-0000-4000-8000-000000000034',
  previewBatch: '35000000-0000-4000-8000-000000000035',
  relationship: '36000000-0000-4000-8000-000000000036',
  conflict: '37000000-0000-4000-8000-000000000037',
  binding: '38000000-0000-4000-8000-000000000038',
  job: '39000000-0000-4000-8000-000000000039',
  review: '3a000000-0000-4000-8000-00000000003a',
} as const;
const HIDDEN_CANARY_VALUES = [
  'HIDDEN_PROVIDER_CANARY',
  'HIDDEN_EVIDENCE_SOURCE_CANARY',
  'HIDDEN_EVIDENCE_CANDIDATE_CANARY',
  'HIDDEN_APPLICATION_CANARY',
  'HIDDEN_DELIVERY_CANARY',
  'HIDDEN_MODERNIZATION_CANARY',
  'HIDDEN_BLUEPRINT_CANARY',
  'HIDDEN_COMMAND_CANARY',
  'HIDDEN_ASSESS_CANDIDATE_CANARY',
  'HIDDEN_ASSESS_EXCERPT_CANARY',
  'HIDDEN_ASSESS_LOCATOR_CANARY',
  'HIDDEN_ASSESS_PREVIEW_TARGET_CANARY',
  'HIDDEN_ASSESS_PROPOSED_VALUE_CANARY',
  'HIDDEN_ASSESS_RELATIONSHIP_RATIONALE_CANARY',
  'HIDDEN_ASSESS_CONFLICT_TARGET_CANARY',
  'HIDDEN_ASSESS_RESOLUTION_CANARY',
  'HIDDEN_ASSESS_RESOLUTION_RATIONALE_CANARY',
] as const;

const CANONICAL_MISSING_EVIDENCE_BY_DIMENSION = {
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
} as const;

const CANONICAL_HARD_GATES_BY_DIMENSION = {
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
} as const;

const authority = (): TenantContext => ({
  userId: USER,
  organizationId: ORG,
  workspaceId: WORKSPACE,
  authorizationVersion: 9,
  capabilities: [
    'approvals.review', 'assess.applications.read', 'assessment.edit', 'assemble.manage', 'byok.manage',
    'docs.approve', 'evidence.review', 'evidence.write', 'monitor.manage', 'monitor.read',
    'portfolio.manage', 'project.manage', 'project.read', 'studio.artifacts.read',
  ],
});

const raw = (): EnterpriseIntelligenceRawProjection => ({
  providerConfigs: [{ id: CONFIG, provider: 'openai', display_name: 'Primary drafting', default_model: 'approved-model', status: 'active', key_ref_id: 'server-only-ref-id', budget_policy: { dailyRequests: 10 }, last_validated_at: '2026-08-04T08:00:00.000Z', secret_ref: 'must-never-project' }],
  providerRoutes: [{ id: ROUTE, provider_config_id: CONFIG, capability: 'assess.evidence.extract', model: 'approved-model', enabled: true, allowed_roles: [ROUTE_ROLE], updated_at: '2026-08-04T08:00:00.000Z' }],
  providerRoleOptions: [{ id: ROUTE_ROLE, name: 'Workspace reviewer', slug: 'workspace-reviewer', scope: 'workspace', org_id: ORG, workspace_id: WORKSPACE }],
  providerRoleCapabilities: [],
  evidenceSources: [{ id: SOURCE, display_name: 'Scanned intake.pdf', mime_type: 'application/pdf', current_version: 1, status: 'review', created_by: USER, created_at: '2026-08-04T08:00:00.000Z' }],
  evidenceVersions: [{ id: SOURCE_VERSION, source_id: SOURCE, version: 1, content_hash: 'a'.repeat(64), extracted_text_hash: 'b'.repeat(64), extracted_character_count: 0, created_at: '2026-08-04T08:00:00.000Z', storage_path: 'must-never-project' }],
  evidenceCandidates: [{ id: CANDIDATE, source_id: SOURCE, source_version_id: SOURCE_VERSION, field_key: 'process_objective', value: 'Review exceptions', safe_excerpt: 'Review exceptions', excerpt_hash: 'c'.repeat(64), source_locator: 'page:1', confidence: 0.9, prompt_version: 'evidence-1', suggestion_status: 'accepted', created_by: USER, reviewed_by: REVIEWER, reviewed_at: '2026-08-04T08:05:00.000Z', updated_at: '2026-08-04T08:05:00.000Z' }],
  assessDrafts: [{ id: ASSESS_DRAFT, version: 2, status: 'draft', updated_at: '2026-08-04T08:10:00.000Z' }],
  applications: [{ id: APPLICATION, name: 'Claims core', created_at: '2026-08-04T08:00:00.000Z' }],
  applicationAssessments: [{ id: APPLICATION_ASSESSMENT, application_id: APPLICATION, version: 3, decision_model_version: 'assess-v2-application-portfolio-2026-07', lifecycle: 'approved', created_at: '2026-08-04T08:00:00.000Z' }],
  studioAggregates: [{ id: STUDIO, artifact_type: 'brd', current_approved_version_id: STUDIO_VERSION, lifecycle: 'approved', updated_at: '2026-08-04T08:00:00.000Z' }],
  studioVersions: [{ id: STUDIO_VERSION, artifact_id: STUDIO, version: 4, lifecycle: 'approved', created_at: '2026-08-04T08:00:00.000Z', content_hash: 'd'.repeat(64) }],
  studioHandoffs: [],
  deliveryPackages: [{ id: PACKAGE, current_version: 1, status: 'approved', created_by: USER, created_at: '2026-08-04T08:00:00.000Z' }],
  deliveryVersions: [{ id: PACKAGE_VERSION, work_package_id: PACKAGE, version: 1, artifact_type: 'brd', studio_version: 4, status: 'approved', created_at: '2026-08-04T08:00:00.000Z' }],
  deliveryItems: [{ id: '14000000-0000-4000-8000-000000000014', package_version_id: PACKAGE_VERSION, item_type: 'Epic', title: 'Governed intake', acceptance_criteria: ['Reviewed'], source_section_locator: 'brd.sections.1' }],
  monitorBaselines: [{ id: MONITOR, work_package_id: PACKAGE, status: 'approval_required', readiness: 'review_required', approved_item_ids: ['server-item'], live_telemetry_connected: false, created_by: REVIEWER, created_at: '2026-08-04T08:00:00.000Z' }],
  modernizationAssessments: [{ id: MODERN_ASSESSMENT, application_ref: APPLICATION, status: 'review', created_at: '2026-08-04T08:00:00.000Z' }],
  modernizationDecisions: [{ id: DECISION, modernization_assessment_id: MODERN_ASSESSMENT, primary_disposition: 'assemble', alternative_disposition: 'api_enable_wrap', eligible_dispositions: ['assemble'], blockers: [], conflicts: [], status: 'approved', created_by: USER, created_at: '2026-08-04T08:00:00.000Z' }],
  blueprints: [{ id: BLUEPRINT, modernization_decision_id: DECISION, disposition: 'assemble', version: 1, structured_content: { readableDocument: '# Claims intake\n', components: [{ type: 'Forms', name: 'Intake form', enabled: true }, { type: 'Agent Tools', name: 'Agent Tools', enabled: false }], safety: { codeGeneration: false, deployment: false, infrastructureChanges: false, credentialAccess: false, sourceSystemCalls: false, runtimeAgents: false } }, status: 'draft', created_by: REVIEWER, created_at: '2026-08-04T08:00:00.000Z' }],
  reviewEvents: [{ id: '15000000-0000-4000-8000-000000000015', resource_type: 'delivery_work_package', resource_id: PACKAGE, reviewer_id: REVIEWER, resource_hash: 'e'.repeat(64), created_at: '2026-08-04T08:00:00.000Z' }],
  approvals: [],
  commandReceipts: [{ command_type: 'studio.delivery.handoff', status: 'committed', idempotency_key: 'must-never-project', completed_at: '2026-08-04T08:00:00.000Z', created_at: '2026-08-04T08:00:00.000Z' }],
  transcriptFlags: [],
  transcriptSources: [],
  transcriptSourceVersions: [],
  transcriptSourceSets: [],
  transcriptSourceSetVersions: [],
  transcriptSourceSetItems: [],
  transcriptInputBundles: [],
  transcriptInputBundleVersions: [],
  transcriptInputBundleItems: [],
  transcriptJourneys: [],
  transcriptCandidates: [],
  transcriptApplyPreviews: [],
  transcriptApplyPreviewBatches: [],
  transcriptCandidateApplications: [],
  transcriptCandidateRelationships: [],
  transcriptConflicts: [],
  transcriptConflictResolutions: [],
  transcriptExtractionBindings: [],
  transcriptJobs: [],
  transcriptStalenessEvents: [],
});

const projection = buildEnterpriseIntelligenceProjection(authority(), raw(), new Date('2026-08-04T09:00:00.000Z'));
assert.equal(projection.providers[0].validationState, 'validated');
assert.equal(projection.providers[0].routes[0].availability, 'ready');
assert.deepEqual(projection.providers[0].routes[0].allowedRoleIds, [ROUTE_ROLE]);
assert.deepEqual(projection.providers[0].eligibleRouteRoles, [{ id: ROUTE_ROLE, label: 'Workspace reviewer', scope: 'workspace' }]);
assert.equal(projection.evidenceSources[0].extractionState, 'empty_text_layer');
assert.equal(projection.evidenceCandidates[0].provenanceState, 'anchored');
assert.equal(projection.assessDrafts[0].versionLabel, 'Draft version 2');
assert.equal(projection.applications[0].approvedAssessmentLabel, 'Approved assessment v3');
assert.equal(projection.studioDocuments[0].approvedVersionLabel, 'Approved version 4');
assert.equal(projection.deliveryPackages[0].lineageState, 'complete');
assert.equal(projection.monitorBaselines[0].liveTelemetryConnected, false);
assert.equal(projection.modernizationDecisions[0].assembleEligible, true);
assert.deepEqual(projection.modernizationDecisions[0].conflicts, []);
assert.equal(projection.blueprints[0].components.find(item => item.type === 'Agent Tools')?.enabled, false);
assert.equal(projection.approvalResources.find(item => item.id === PACKAGE)?.separationOfDuties, 'creator_cannot_review');
assert.equal(projection.commandActivity[0].commandType, 'studio.delivery.handoff',
  'the exact Studio/Delivery authority remains a positive command-activity countercontrol');
assert.equal(projection.assessPromotion.state, 'contract_pending');
assert.equal(projection.assessPromotion.acceptedCandidateCount, 1,
  'assessment.edit remains the exact positive Assess-promotion countercontrol');
assert.equal(decodeEnterpriseIntelligenceProjection(projection).workspaceId, WORKSPACE);

const astral = '\u{1f680}';
const scalarBoundaryRows = raw();
scalarBoundaryRows.evidenceCandidates[0].value = `${'a'.repeat(11_999)}${astral}`;
const scalarBoundaryProjection = buildEnterpriseIntelligenceProjection(authority(), scalarBoundaryRows);
assert.equal(scalarBoundaryProjection.evidenceCandidates[0].value, scalarBoundaryRows.evidenceCandidates[0].value);
assert.equal(Array.from(scalarBoundaryProjection.evidenceCandidates[0].value).length, 12_000);
assert.equal(new TextEncoder().encode(scalarBoundaryProjection.evidenceCandidates[0].value).byteLength, 12_003);

for (const invalidValue of [
  `${'a'.repeat(12_000)}${astral}`,
  `${'a'.repeat(11_999)}\ud83d`,
  `${'a'.repeat(11_999)}\ude80`,
]) {
  const invalidRows = raw();
  invalidRows.evidenceCandidates[0].value = invalidValue;
  assert.deepEqual(buildEnterpriseIntelligenceProjection(authority(), invalidRows).evidenceCandidates, []);
}
const serialized = JSON.stringify(projection);
for (const prohibited of ['must-never-project', 'contentHash', 'extractedTextHash', 'idempotencyKey', 'resource_hash', 'storage_path', 'secret_ref']) {
  assert.ok(!serialized.includes(prohibited), `projection must omit ${prohibited}`);
}

const transcriptOnlyRows = raw();
transcriptOnlyRows.evidenceSources = [];
transcriptOnlyRows.evidenceVersions = [];
transcriptOnlyRows.evidenceCandidates = [];
transcriptOnlyRows.transcriptFlags = [{ transcript_source_sets_enabled: false, assess_multisource_apply_enabled: false }];
transcriptOnlyRows.transcriptSources = [{
  id: SOURCE, display_name: 'Governed interview transcript', mime_type: 'text/plain', current_version: 1,
  status: 'review', created_at: '2026-08-04T08:00:00.000Z',
}];
transcriptOnlyRows.transcriptSourceVersions = [{
  id: SOURCE_VERSION, source_id: SOURCE, version: 1, extraction_status: 'parsed', extracted_character_count: 420,
  extraction_failure_code: null, created_at: '2026-08-04T08:00:00.000Z',
}];
transcriptOnlyRows.transcriptSourceSets = [{
  id: TRANSCRIPT_SOURCE_SET, owner_module: 'assess', current_version: 1, display_label: 'Interview set',
  description: 'Selected interview evidence', status: 'locked', updated_at: '2026-08-04T08:01:00.000Z',
}];
transcriptOnlyRows.transcriptSourceSetVersions = [{
  id: TRANSCRIPT_SOURCE_SET_VERSION, source_set_id: TRANSCRIPT_SOURCE_SET, version: 1, status: 'locked',
  source_count: 1, extracted_character_count: 420,
}];
transcriptOnlyRows.transcriptSourceSetItems = [{
  source_set_version_id: TRANSCRIPT_SOURCE_SET_VERSION, source_id: SOURCE, source_version_id: SOURCE_VERSION,
  ordinal: 1, semantic_role: 'primary', user_note: 'Primary interview', extracted_character_count: 420,
}];
transcriptOnlyRows.transcriptInputBundles = [{ id: TRANSCRIPT_BUNDLE, owner_module: 'assess', current_version: 1 }];
transcriptOnlyRows.transcriptInputBundleVersions = [{
  id: TRANSCRIPT_BUNDLE_VERSION, input_bundle_id: TRANSCRIPT_BUNDLE, version: 1, status: 'locked',
  created_at: '2026-08-04T08:02:00.000Z',
}];
transcriptOnlyRows.transcriptInputBundleItems = [{
  input_bundle_version_id: TRANSCRIPT_BUNDLE_VERSION, source_set_id: TRANSCRIPT_SOURCE_SET,
  source_set_version_id: TRANSCRIPT_SOURCE_SET_VERSION, ordinal: 1, declared_purpose: 'Assess interview evidence',
}];
transcriptOnlyRows.transcriptExtractionBindings = [{
  id: TRANSCRIPT_BINDING, job_id: TRANSCRIPT_JOB, input_bundle_id: TRANSCRIPT_BUNDLE,
  input_bundle_version_id: TRANSCRIPT_BUNDLE_VERSION, source_set_id: TRANSCRIPT_SOURCE_SET,
  source_set_version_id: TRANSCRIPT_SOURCE_SET_VERSION, source_id: SOURCE, source_version_id: SOURCE_VERSION,
  created_at: '2026-08-04T08:03:00.000Z',
}];
transcriptOnlyRows.transcriptJobs = [{ id: TRANSCRIPT_JOB, status: 'succeeded', completed_at: '2026-08-04T08:04:00.000Z' }];
transcriptOnlyRows.transcriptCandidates = [{
  id: CANDIDATE, ai_job_id: TRANSCRIPT_JOB, source_id: SOURCE, source_version_id: SOURCE_VERSION,
  field_key: 'process_objective', value: 'Review exceptions', safe_excerpt: 'Review exceptions',
  source_locator: 'paragraph:1', confidence: 0.91, suggestion_status: 'suggested', version: 1,
  created_by: USER, updated_at: '2026-08-04T08:05:00.000Z',
}, {
  id: '21000000-0000-4000-8000-000000000021', ai_job_id: UNRELATED_JOB, source_id: SOURCE,
  source_version_id: SOURCE_VERSION, field_key: 'process_objective', value: 'Must not join by source version',
  source_locator: 'paragraph:2', confidence: 0.5, suggestion_status: 'suggested', version: 1,
  created_by: USER, updated_at: '2026-08-04T08:05:00.000Z',
}];
transcriptOnlyRows.transcriptApplyPreviews = [{
  id: TRANSCRIPT_PREVIEW, candidate_id: CANDIDATE, assess_case_id: ASSESS_DRAFT, expected_case_version: 2,
  application_intent: 'set_case_field', target_key: 'process_objective',
  expires_at: '2026-08-05T08:00:00.000Z',
}];
transcriptOnlyRows.transcriptApplyPreviewBatches = [{
  id: TRANSCRIPT_PREVIEW_BATCH, assess_case_id: ASSESS_DRAFT, expected_case_version: 2,
  input_bundle_id: TRANSCRIPT_BUNDLE, input_bundle_version_id: TRANSCRIPT_BUNDLE_VERSION,
  source_set_version_ids: [TRANSCRIPT_SOURCE_SET_VERSION], preview_ids: [TRANSCRIPT_PREVIEW],
  created_at: '2026-08-04T08:06:00.000Z',
}];
const sourceReadOnlyRows = structuredClone(transcriptOnlyRows);
sourceReadOnlyRows.providerConfigs[0].display_name = 'HIDDEN_PROVIDER_CANARY';
sourceReadOnlyRows.evidenceSources = [{
  id: '3b000000-0000-4000-8000-00000000003b', display_name: 'HIDDEN_EVIDENCE_SOURCE_CANARY',
  mime_type: 'text/plain', current_version: 1, status: 'review', created_by: USER, created_at: '2026-08-04T08:00:00.000Z',
}];
sourceReadOnlyRows.evidenceVersions = [{
  id: '3c000000-0000-4000-8000-00000000003c', source_id: '3b000000-0000-4000-8000-00000000003b',
  version: 1, extraction_status: 'parsed', extracted_character_count: 42, created_at: '2026-08-04T08:00:00.000Z',
}];
sourceReadOnlyRows.evidenceCandidates = [{
  id: '3d000000-0000-4000-8000-00000000003d', source_id: '3b000000-0000-4000-8000-00000000003b',
  source_version_id: '3c000000-0000-4000-8000-00000000003c', field_key: 'process_objective',
  value: 'HIDDEN_EVIDENCE_CANDIDATE_CANARY', excerpt_hash: 'c'.repeat(64), source_locator: 'paragraph:canary',
  confidence: 0.99, suggestion_status: 'accepted', created_by: USER, updated_at: '2026-08-04T08:05:00.000Z',
}];
sourceReadOnlyRows.assessDrafts[0].id = HIDDEN_CANARY_IDS.assessDraft;
sourceReadOnlyRows.applications[0].name = 'HIDDEN_APPLICATION_CANARY';
sourceReadOnlyRows.deliveryItems[0].title = 'HIDDEN_DELIVERY_CANARY';
sourceReadOnlyRows.modernizationDecisions[0].conflicts = ['HIDDEN_MODERNIZATION_CANARY'];
sourceReadOnlyRows.blueprints[0].structured_content = {
  ...(sourceReadOnlyRows.blueprints[0].structured_content as Record<string, unknown>),
  readableDocument: '# HIDDEN_BLUEPRINT_CANARY\n',
};
sourceReadOnlyRows.reviewEvents[0].id = HIDDEN_CANARY_IDS.review;
sourceReadOnlyRows.commandReceipts = [{
  command_type: 'HIDDEN_COMMAND_CANARY', status: 'committed', completed_at: '2026-08-04T08:00:00.000Z',
  created_at: '2026-08-04T08:00:00.000Z',
}, {
  command_type: 'evidence.assess.promote', status: 'committed', completed_at: '2026-08-04T08:00:00.000Z',
  created_at: '2026-08-04T08:00:00.000Z',
}];
sourceReadOnlyRows.transcriptFlags = [{ transcript_source_sets_enabled: true, assess_multisource_apply_enabled: false }];
sourceReadOnlyRows.transcriptJourneys = [{
  id: HIDDEN_CANARY_IDS.journey, entry_module: 'assess', desired_exit_module: 'studio', current_module: 'assess',
  lineage_classification: 'assessed', planning_only: true, status: 'active', version: 1,
  updated_at: '2026-08-04T08:07:00.000Z',
}];
sourceReadOnlyRows.transcriptCandidates = [{
  id: HIDDEN_CANARY_IDS.candidate, ai_job_id: HIDDEN_CANARY_IDS.job, source_id: SOURCE, source_version_id: SOURCE_VERSION,
  field_key: 'process_objective', value: 'HIDDEN_ASSESS_CANDIDATE_CANARY', safe_excerpt: 'HIDDEN_ASSESS_EXCERPT_CANARY',
  source_locator: 'HIDDEN_ASSESS_LOCATOR_CANARY', confidence: 0.91, suggestion_status: 'suggested', version: 1,
  created_by: USER, updated_at: '2026-08-04T08:05:00.000Z',
}];
sourceReadOnlyRows.transcriptApplyPreviews = [{
  id: HIDDEN_CANARY_IDS.preview, candidate_id: HIDDEN_CANARY_IDS.candidate, assess_case_id: ASSESS_DRAFT,
  expected_case_version: 2, application_intent: 'set_case_field', target_key: 'HIDDEN_ASSESS_PREVIEW_TARGET_CANARY',
  proposed_value: 'HIDDEN_ASSESS_PROPOSED_VALUE_CANARY', expires_at: '2026-08-05T08:00:00.000Z',
}];
sourceReadOnlyRows.transcriptApplyPreviewBatches = [{
  id: HIDDEN_CANARY_IDS.previewBatch, assess_case_id: ASSESS_DRAFT, expected_case_version: 2,
  input_bundle_id: TRANSCRIPT_BUNDLE, input_bundle_version_id: TRANSCRIPT_BUNDLE_VERSION,
  source_set_version_ids: [TRANSCRIPT_SOURCE_SET_VERSION], preview_ids: [HIDDEN_CANARY_IDS.preview],
  created_at: '2026-08-04T08:06:00.000Z',
}];
sourceReadOnlyRows.transcriptCandidateRelationships = [{
  id: HIDDEN_CANARY_IDS.relationship, candidate_id: HIDDEN_CANARY_IDS.candidate, candidate_version: 1,
  relationship: 'supporting', rationale: 'HIDDEN_ASSESS_RELATIONSHIP_RATIONALE_CANARY', created_by: REVIEWER,
  created_at: '2026-08-04T08:07:00.000Z',
}];
sourceReadOnlyRows.transcriptConflicts = [{
  id: HIDDEN_CANARY_IDS.conflict, assess_case_id: ASSESS_DRAFT, input_bundle_version_id: TRANSCRIPT_BUNDLE_VERSION,
  application_intent: 'set_case_field', target_key: 'HIDDEN_ASSESS_CONFLICT_TARGET_CANARY', candidate_ids: [HIDDEN_CANARY_IDS.candidate],
  is_material: true, current_resolution_version: 1, created_at: '2026-08-04T08:07:00.000Z',
}];
sourceReadOnlyRows.transcriptConflictResolutions = [{
  conflict_id: HIDDEN_CANARY_IDS.conflict, version: 1, resolution: 'authored_resolution',
  authored_value: 'HIDDEN_ASSESS_RESOLUTION_CANARY', rationale: 'HIDDEN_ASSESS_RESOLUTION_RATIONALE_CANARY',
  created_at: '2026-08-04T08:08:00.000Z',
}];
sourceReadOnlyRows.transcriptCandidateApplications = [{
  preview_id: HIDDEN_CANARY_IDS.preview, preview_batch_id: HIDDEN_CANARY_IDS.previewBatch, assess_case_id: ASSESS_DRAFT,
  assess_case_version: 3, applied_at: '2026-08-04T08:09:00.000Z',
}];
sourceReadOnlyRows.transcriptExtractionBindings = [{
  id: HIDDEN_CANARY_IDS.binding, job_id: HIDDEN_CANARY_IDS.job, input_bundle_id: TRANSCRIPT_BUNDLE,
  input_bundle_version_id: TRANSCRIPT_BUNDLE_VERSION, source_set_id: TRANSCRIPT_SOURCE_SET,
  source_set_version_id: TRANSCRIPT_SOURCE_SET_VERSION, source_id: SOURCE, source_version_id: SOURCE_VERSION,
  created_at: '2026-08-04T08:03:00.000Z',
}];
sourceReadOnlyRows.transcriptJobs = [{
  id: HIDDEN_CANARY_IDS.job, status: 'succeeded', completed_at: '2026-08-04T08:04:00.000Z',
}];
sourceReadOnlyRows.transcriptStalenessEvents = [{
  resource_kind: 'input_bundle_version', resource_id: TRANSCRIPT_BUNDLE_VERSION,
  created_at: '2026-08-04T08:10:00.000Z',
}];
const transcriptOnlyProjection = buildEnterpriseIntelligenceProjection({
  ...authority(), capabilities: ['transcript.sources.read'],
}, sourceReadOnlyRows, new Date('2026-08-04T09:00:00.000Z'));
assert.equal(transcriptOnlyProjection.availability, 'ready', 'transcript-only authority receives usable availability');
assert.equal(transcriptOnlyProjection.transcriptFlow.features.sourceSetsEnabled, true,
  'source-read authority receives its source-set feature state');
assert.equal(transcriptOnlyProjection.transcriptFlow.features.assessMultisourceApplyEnabled, false,
  'source-read authority never receives the Assess feature state');
assert.equal(transcriptOnlyProjection.transcriptFlow.features.disabledReason, undefined,
  'a hidden disabled Assess feature cannot manufacture a source-read disabled reason');
assert.equal(transcriptOnlyProjection.transcriptFlow.sourceVersions[0].displayName, 'Governed interview transcript');
assert.deepEqual({
  providers: transcriptOnlyProjection.providers,
  evidenceSources: transcriptOnlyProjection.evidenceSources,
  evidenceCandidates: transcriptOnlyProjection.evidenceCandidates,
  assessDrafts: transcriptOnlyProjection.assessDrafts,
  applications: transcriptOnlyProjection.applications,
  studioDocuments: transcriptOnlyProjection.studioDocuments,
  deliveryPackages: transcriptOnlyProjection.deliveryPackages,
  monitorBaselines: transcriptOnlyProjection.monitorBaselines,
  modernizationDecisions: transcriptOnlyProjection.modernizationDecisions,
  blueprints: transcriptOnlyProjection.blueprints,
  approvalResources: transcriptOnlyProjection.approvalResources,
  commandActivity: transcriptOnlyProjection.commandActivity,
}, {
  providers: [], evidenceSources: [], evidenceCandidates: [], assessDrafts: [], applications: [], studioDocuments: [],
  deliveryPackages: [], monitorBaselines: [], modernizationDecisions: [], blueprints: [], approvalResources: [], commandActivity: [],
}, 'source-read-only projection rejects every unrelated top-level service-role collection');
assert.deepEqual(transcriptOnlyProjection.assessPromotion, {
  state: 'contract_pending', acceptedCandidateCount: 0, provenanceComplete: false, idempotencyState: 'not_started', conflicts: [],
}, 'source-read-only projection neutralizes Assess promotion even when accepted candidates and a committed receipt are injected');
assert.deepEqual({
  journeys: transcriptOnlyProjection.transcriptFlow.journeys,
  assessCandidates: transcriptOnlyProjection.transcriptFlow.assessCandidates,
  assessConflicts: transcriptOnlyProjection.transcriptFlow.assessConflicts,
  assessApplyPreviews: transcriptOnlyProjection.transcriptFlow.assessApplyPreviews,
  assessRuns: transcriptOnlyProjection.transcriptFlow.assessRuns,
}, { journeys: [], assessCandidates: [], assessConflicts: [], assessApplyPreviews: [], assessRuns: [] },
'source-read-only projection fails closed over every Assess-owned collection even when raw service-role rows are present');
assert.deepEqual(transcriptOnlyProjection.transcriptFlow.inputBundles[0].sourceSetVersions, [{
  sourceSetId: TRANSCRIPT_SOURCE_SET, sourceSetVersionSelector: TRANSCRIPT_SOURCE_SET_VERSION, sourceSetVersion: 1, ordinal: 1,
}], 'source-read-only authority retains the explicitly authorized immutable input-bundle projection');
assert.equal(transcriptOnlyProjection.transcriptFlow.inputBundles[0].status, 'locked',
  'Assess-owned staleness rows cannot influence a source-read-only projection');
const sourceOnlyRowsWithoutHiddenCollections = structuredClone(sourceReadOnlyRows);
for (const collection of [
  'providerConfigs', 'providerRoutes', 'providerRoleOptions', 'providerRoleCapabilities',
  'evidenceSources', 'evidenceVersions', 'evidenceCandidates', 'assessDrafts', 'applications', 'applicationAssessments',
  'studioAggregates', 'studioVersions', 'studioHandoffs', 'deliveryPackages', 'deliveryVersions', 'deliveryItems',
  'monitorBaselines', 'modernizationAssessments', 'modernizationDecisions', 'blueprints', 'reviewEvents', 'approvals',
  'commandReceipts', 'transcriptJourneys', 'transcriptCandidates', 'transcriptApplyPreviews',
  'transcriptApplyPreviewBatches', 'transcriptCandidateApplications', 'transcriptCandidateRelationships',
  'transcriptConflicts', 'transcriptConflictResolutions', 'transcriptExtractionBindings', 'transcriptJobs',
  'transcriptStalenessEvents',
] as const) {
  sourceOnlyRowsWithoutHiddenCollections[collection] = [];
}
const sourceOnlyProjectionWithoutHiddenCollections = buildEnterpriseIntelligenceProjection({
  ...authority(), capabilities: ['transcript.sources.read'],
}, sourceOnlyRowsWithoutHiddenCollections, new Date('2026-08-04T09:00:00.000Z'));
assert.equal(transcriptOnlyProjection.availability, sourceOnlyProjectionWithoutHiddenCollections.availability,
  'hidden service-role rows cannot influence source-read availability');
assert.deepEqual(transcriptOnlyProjection.transcriptFlow, sourceOnlyProjectionWithoutHiddenCollections.transcriptFlow,
  'hidden Assess rows cannot influence any caller-visible source/source-set/input-bundle field');
const sourceReadOnlySerialized = JSON.stringify(transcriptOnlyProjection);
for (const hiddenCanary of [
  ...HIDDEN_CANARY_VALUES,
  ...Object.values(HIDDEN_CANARY_IDS),
  CONFIG, ROUTE, ROUTE_ROLE, APPLICATION, APPLICATION_ASSESSMENT, STUDIO, STUDIO_VERSION, PACKAGE, PACKAGE_VERSION,
  MONITOR, MODERN_ASSESSMENT, DECISION, BLUEPRINT, ASSESS_DRAFT,
  '3b000000-0000-4000-8000-00000000003b',
  '3c000000-0000-4000-8000-00000000003c',
  '3d000000-0000-4000-8000-00000000003d',
]) {
  assert.ok(!sourceReadOnlySerialized.includes(hiddenCanary),
    `source-read-only projection must omit unauthorized service-role canary: ${hiddenCanary}`);
}

const assessmentEditOnlyProjection = buildEnterpriseIntelligenceProjection({
  ...authority(), capabilities: ['assessment.edit'],
}, sourceReadOnlyRows, new Date('2026-08-04T09:00:00.000Z'));
assert.deepEqual(assessmentEditOnlyProjection.evidenceCandidates, [],
  'Assess edit authority alone cannot reveal evidence candidates');
assert.deepEqual(assessmentEditOnlyProjection.commandActivity, [],
  'Assess edit authority alone cannot reveal evidence promotion receipts');
assert.deepEqual(assessmentEditOnlyProjection.assessPromotion, {
  state: 'contract_pending', acceptedCandidateCount: 0, provenanceComplete: false, idempotencyState: 'not_started', conflicts: [],
}, 'Assess promotion requires evidence visibility as well as canonical Assess edit authority');

const assessProjection = buildEnterpriseIntelligenceProjection({
  ...authority(), capabilities: ['transcript.sources.read', 'assess.v2.read'],
}, transcriptOnlyRows, new Date('2026-08-04T09:00:00.000Z'));
assert.equal(assessProjection.transcriptFlow.assessCandidates.length, 1,
  'candidate lineage joins exact ai_job_id to its extraction binding, never source-version coincidence');
assert.equal(assessProjection.transcriptFlow.assessCandidates[0].inputBundleVersionSelector, TRANSCRIPT_BUNDLE_VERSION);
assert.deepEqual(assessProjection.transcriptFlow.inputBundles[0].sourceSetVersions, [{
  sourceSetId: TRANSCRIPT_SOURCE_SET, sourceSetVersionSelector: TRANSCRIPT_SOURCE_SET_VERSION, sourceSetVersion: 1, ordinal: 1,
}], 'input bundle projects its exact immutable source-set version identity');
assert.deepEqual({
  sourceSetId: assessProjection.transcriptFlow.assessCandidates[0].sourceSetId,
  sourceSetVersionSelector: assessProjection.transcriptFlow.assessCandidates[0].sourceSetVersionSelector,
  sourceSetVersion: assessProjection.transcriptFlow.assessCandidates[0].sourceSetVersion,
}, { sourceSetId: TRANSCRIPT_SOURCE_SET, sourceSetVersionSelector: TRANSCRIPT_SOURCE_SET_VERSION, sourceSetVersion: 1 },
'candidate projects exact source-set lineage from its AI-job extraction binding');
assert.equal(assessProjection.transcriptFlow.assessRuns[0].candidateCount, 1,
  'run counts include only candidates produced by the exact bound job');
assert.deepEqual(assessProjection.transcriptFlow.assessRuns[0].extractionBindings, [{
  extractionBindingId: TRANSCRIPT_BINDING, extractionJobId: TRANSCRIPT_JOB,
  sourceSetId: TRANSCRIPT_SOURCE_SET, sourceSetVersionSelector: TRANSCRIPT_SOURCE_SET_VERSION,
  sourceSetVersion: 1, sourceVersionSelector: SOURCE_VERSION,
}], 'run projects exact binding lineage instead of a current source-set root');
assert.equal(assessProjection.transcriptFlow.assessApplyPreviews[0].id, TRANSCRIPT_PREVIEW_BATCH,
  'browser projection commits and returns the real preview-batch identifier');
assert.equal(assessProjection.transcriptFlow.inputBundles[0].status, 'locked',
  'disabled feature flags retain immutable transcript lineage as a read-only rollback projection');

const assessOnlyProjection = buildEnterpriseIntelligenceProjection({
  ...authority(), capabilities: ['assess.v2.read'],
}, transcriptOnlyRows, new Date('2026-08-04T09:00:00.000Z'));
assert.deepEqual({
  sourceVersions: assessOnlyProjection.transcriptFlow.sourceVersions,
  sourceSets: assessOnlyProjection.transcriptFlow.sourceSets,
  inputBundles: assessOnlyProjection.transcriptFlow.inputBundles,
}, { sourceVersions: [], sourceSets: [], inputBundles: [] },
'Assess read uses source lineage internally without projecting source collections that lack transcript.sources.read');
assert.equal(assessOnlyProjection.transcriptFlow.assessCandidates.length, 1,
  'canonical Assess read capability independently authorizes Assess-owned projections');

const mutationOnlyProjection = buildEnterpriseIntelligenceProjection({
  ...authority(), capabilities: ['transcript.sources.manage', 'transcript.assess.apply', 'transcript.journeys.manage'],
}, sourceReadOnlyRows, new Date('2026-08-04T09:00:00.000Z'));
assert.deepEqual({
  sourceVersions: mutationOnlyProjection.transcriptFlow.sourceVersions,
  sourceSets: mutationOnlyProjection.transcriptFlow.sourceSets,
  inputBundles: mutationOnlyProjection.transcriptFlow.inputBundles,
  journeys: mutationOnlyProjection.transcriptFlow.journeys,
  assessCandidates: mutationOnlyProjection.transcriptFlow.assessCandidates,
  assessConflicts: mutationOnlyProjection.transcriptFlow.assessConflicts,
  assessApplyPreviews: mutationOnlyProjection.transcriptFlow.assessApplyPreviews,
  assessRuns: mutationOnlyProjection.transcriptFlow.assessRuns,
}, {
  sourceVersions: [], sourceSets: [], inputBundles: [], journeys: [], assessCandidates: [], assessConflicts: [],
  assessApplyPreviews: [], assessRuns: [],
}, 'mutation capabilities never imply source or Assess collection read authority');

const transcriptTablesRequestedFor = async (capabilities: string[]) => {
  const requested: string[] = [];
  const query = async <T>(path: string, _init: RequestInit = {}): Promise<T> => {
    requested.push(path.split('?')[0]);
    return [] as T;
  };
  await createEnterpriseIntelligenceQueryDatabase(query).loadProjectionRows({
    ...authority(), capabilities,
  });
  return requested;
};
const sourceReadOnlyRequests = await transcriptTablesRequestedFor(['transcript.sources.read']);
const sourceCollectionTables = [
  'enterprise_transcript_workspace_flags',
  'enterprise_evidence_sources',
  'enterprise_evidence_source_versions',
  'enterprise_source_sets',
  'enterprise_source_set_versions',
  'enterprise_source_set_version_items',
  'enterprise_module_input_bundles',
  'enterprise_module_input_bundle_versions',
  'enterprise_module_input_bundle_items',
];
const assessCollectionTables = [
  'enterprise_evidence_candidates',
  'enterprise_governed_journeys',
  'enterprise_assess_apply_previews',
  'enterprise_assess_apply_preview_batches',
  'enterprise_assess_candidate_applications',
  'enterprise_evidence_candidate_relationship_reviews',
  'enterprise_assess_evidence_conflicts',
  'enterprise_assess_evidence_conflict_resolutions',
  'enterprise_transcript_extraction_bindings',
  'enterprise_ai_job_ledger',
  'enterprise_transcript_staleness_events',
];
assert.deepEqual(
  sourceCollectionTables.filter(table => !sourceReadOnlyRequests.includes(table)),
  [],
  'source-read-only service-role path requests every authorized transcript source collection',
);
assert.deepEqual(
  assessCollectionTables.filter(table => sourceReadOnlyRequests.includes(table)),
  [],
  'source-read-only service-role path never requests an Assess-owned table',
);

const assessReadRequests = await transcriptTablesRequestedFor(['assess.v2.read']);
assert.deepEqual(
  assessCollectionTables.filter(table => !assessReadRequests.includes(table)),
  [],
  'canonical Assess read capability requests every Assess-owned collection as a positive countercontrol',
);
assert.deepEqual(
  sourceCollectionTables.filter(table => !assessReadRequests.includes(table)),
  [],
  'Assess collection assembly may request supporting immutable source lineage',
);

const mutationOnlyRequests = await transcriptTablesRequestedFor([
  'transcript.sources.manage', 'transcript.assess.apply', 'transcript.journeys.manage',
]);
assert.deepEqual(
  [...sourceCollectionTables, ...assessCollectionTables].filter(table => mutationOnlyRequests.includes(table)),
  [],
  'mutation-only service-role path requests no transcript read collection',
);

const deliveryProjectionQueries: Array<Record<string, unknown>> = [];
const boundedDeliveryDatabase = createEnterpriseIntelligenceQueryDatabase(
  async <T>() => [] as T,
  {
    execute: async () => ({}),
    loadDeliveryProjection: async (_organizationId, _workspaceId, query = {}) => {
      deliveryProjectionQueries.push(query);
      return createDeliveryWorkspaceFixture();
    },
    loadMonitorProjection: async () => createMonitorBaselinesFixture(),
  },
);
await boundedDeliveryDatabase.loadProjectionRows(authority(), {
  deliveryItemPage: {
    packageId: PACKAGE,
    cursor: { version: 3, id: CANDIDATE },
    limit: 100,
  },
});
assert.deepEqual(deliveryProjectionQueries, [{
  actorId: USER,
  authorizationVersion: 9,
  itemLimit: 100,
  baselineEligibilityLimit: 100,
  packageId: PACKAGE,
  itemCursorVersion: 3,
  itemCursorId: CANDIDATE,
}], 'Enterprise query forwards only the bounded package and cursor selectors after tenant authority resolves');
await boundedDeliveryDatabase.loadProjectionRows(authority(), {
  deliveryBaselineEligibilityPage: {
    cursor: { updatedAt: '2026-08-31T06:30:00.000Z', workPackageId: PACKAGE },
    limit: 100,
  },
});
assert.deepEqual(deliveryProjectionQueries[1], {
  actorId: USER,
  authorizationVersion: 9,
  itemLimit: 100,
  baselineEligibilityLimit: 100,
  baselineEligibilityCursorUpdatedAt: '2026-08-31T06:30:00.000Z',
  baselineEligibilityCursorPackageId: PACKAGE,
}, 'Enterprise query forwards the bounded baseline-eligibility continuation only after tenant authority resolves');
const transcriptOnlySerialized = JSON.stringify(transcriptOnlyProjection);
for (const prohibited of ['content_hash', 'extracted_text_hash', 'storage_path', 'provider_config_id', 'secret_ref']) {
  assert.ok(!transcriptOnlySerialized.includes(prohibited), `transcript-only projection must omit ${prohibited}`);
}

const advancedSourceSetRows = structuredClone(transcriptOnlyRows);
advancedSourceSetRows.transcriptSourceSets[0].current_version = 2;
advancedSourceSetRows.transcriptSourceSetVersions.push({
  id: TRANSCRIPT_SOURCE_SET_VERSION_NEXT, source_set_id: TRANSCRIPT_SOURCE_SET, version: 2, status: 'locked',
  source_count: 1, extracted_character_count: 420,
});
advancedSourceSetRows.transcriptSourceSetItems.push({
  source_set_version_id: TRANSCRIPT_SOURCE_SET_VERSION_NEXT, source_id: SOURCE, source_version_id: SOURCE_VERSION,
  ordinal: 1, semantic_role: 'supporting', user_note: 'Advanced current set version', extracted_character_count: 420,
});
const advancedSourceSetProjection = buildEnterpriseIntelligenceProjection({
  ...authority(), capabilities: ['transcript.sources.read', 'assess.v2.read'],
}, advancedSourceSetRows, new Date('2026-08-04T09:00:00.000Z'));
assert.equal(advancedSourceSetProjection.transcriptFlow.sourceSets[0].versionSelector, TRANSCRIPT_SOURCE_SET_VERSION_NEXT,
  'source library projects the advanced current source-set version');
assert.equal(advancedSourceSetProjection.transcriptFlow.inputBundles[0].sourceSetVersions[0].sourceSetVersionSelector, TRANSCRIPT_SOURCE_SET_VERSION,
  'immutable bundle retains its historical source-set version after the current source set advances');
assert.equal(advancedSourceSetProjection.transcriptFlow.assessCandidates[0].sourceSetVersionSelector, TRANSCRIPT_SOURCE_SET_VERSION,
  'candidate retains the historical source-set version from its exact binding');
assert.equal(advancedSourceSetProjection.transcriptFlow.assessRuns[0].extractionBindings[0].sourceSetVersionSelector, TRANSCRIPT_SOURCE_SET_VERSION,
  'run retains historical binding lineage and never substitutes the current source-set version');
decodeEnterpriseIntelligenceProjection(advancedSourceSetProjection);

const driftedBindingRows = structuredClone(advancedSourceSetRows);
driftedBindingRows.transcriptExtractionBindings[0].source_set_version_id = TRANSCRIPT_SOURCE_SET_VERSION_NEXT;
const driftedBindingProjection = buildEnterpriseIntelligenceProjection({
  ...authority(), capabilities: ['transcript.sources.read', 'assess.v2.read'],
}, driftedBindingRows, new Date('2026-08-04T09:00:00.000Z'));
assert.deepEqual(driftedBindingProjection.transcriptFlow.assessCandidates, [],
  'candidate projection fails closed when binding lineage drifts from the immutable bundle');
assert.deepEqual(driftedBindingProjection.transcriptFlow.assessRuns, [],
  'run projection fails closed when a binding substitutes the current source-set version');

const blockerRows = raw();
blockerRows.modernizationDecisions[0].blockers = [
  { dimension: 'security_and_control', missingEvidence: [], hardGates: ['REGULATED_DATA_REQUIRES_INDEPENDENT_REVIEW'] },
  { dimension: 'state_and_execution', missingEvidence: ['EXECUTION_CHARACTERISTICS'], hardGates: ['BATCH_DELAYED_FEEDBACK'] },
  { dimension: 'integration_accessibility', missingEvidence: [], hardGates: ['UI_BRIDGE_EVIDENCE_REQUIRED'] },
  { dimension: 'semantic_and_data_clarity', missingEvidence: [], hardGates: [] },
];
const blockerProjection = buildEnterpriseIntelligenceProjection(authority(), blockerRows);
assert.deepEqual(blockerProjection.modernizationDecisions[0].blockers, [
  'integration_accessibility: hard gates [UI_BRIDGE_EVIDENCE_REQUIRED]',
  'semantic_and_data_clarity: governed blocker',
  'state_and_execution: missing evidence [EXECUTION_CHARACTERISTICS]; hard gates [BATCH_DELAYED_FEEDBACK]',
  'security_and_control: hard gates [REGULATED_DATA_REQUIRES_INDEPENDENT_REVIEW]',
]);

const malformedBlockerRows = raw();
malformedBlockerRows.modernizationDecisions[0] = {
  ...malformedBlockerRows.modernizationDecisions[0],
  primary_disposition: 'blocked',
  status: 'blocked',
  blockers: [{
    dimension: 'security_and_control',
    missingEvidence: [],
    hardGates: [],
    privatePayload: 'must-never-project-blocker-detail',
  }, {
    dimension: 'integration_accessibility',
    missingEvidence: Array.from({ length: 21 }, (_, index) => `OVERSIZED_${index}`),
    hardGates: [],
  }, {
    dimension: 'unknown_dimension',
    missingEvidence: ['UNKNOWN_DETAIL'],
    hardGates: [],
  }],
};
const malformedBlockerProjection = buildEnterpriseIntelligenceProjection(authority(), malformedBlockerRows);
assert.deepEqual(
  malformedBlockerProjection.modernizationDecisions[0].blockers,
  ['Governed blocker details unavailable'],
);
assert.ok(!JSON.stringify(malformedBlockerProjection).includes('must-never-project-blocker-detail'));

const canonicalBlockers = Object.keys(CANONICAL_MISSING_EVIDENCE_BY_DIMENSION).map(dimension => ({
  dimension,
  missingEvidence: [...CANONICAL_MISSING_EVIDENCE_BY_DIMENSION[dimension as keyof typeof CANONICAL_MISSING_EVIDENCE_BY_DIMENSION]],
  hardGates: [...CANONICAL_HARD_GATES_BY_DIMENSION[dimension as keyof typeof CANONICAL_HARD_GATES_BY_DIMENSION]],
}));
for (const blocker of canonicalBlockers) {
  for (const code of blocker.missingEvidence) {
    assert.deepEqual(
      decodeModernizationBlockers([{ dimension: blocker.dimension, missingEvidence: [code], hardGates: [] }]),
      [`${blocker.dimension}: missing evidence [${code}]`],
      `canonical missing-evidence code ${code} must project exactly`,
    );
  }
  for (const code of blocker.hardGates) {
    assert.deepEqual(
      decodeModernizationBlockers([{ dimension: blocker.dimension, missingEvidence: [], hardGates: [code] }]),
      [`${blocker.dimension}: hard gates [${code}]`],
      `canonical hard-gate code ${code} must project exactly`,
    );
  }
}
for (const requiredCamelCaseCode of ['stableInterface', 'controlAccessibility', 'humanOwner']) {
  assert.ok(
    decodeModernizationBlockers([{
      dimension: 'ui_automation_readiness',
      missingEvidence: [requiredCamelCaseCode],
      hardGates: [],
    }])[0].includes(requiredCamelCaseCode),
  );
}
for (const rejected of [
  'unknownCamelCaseValue',
  'UNKNOWN_BUT_FREE_TEXT_CODE',
  '<script>alert(1)</script>',
  'providerKey=must-never-project',
  `OVERSIZED_${'X'.repeat(200)}`,
]) {
  assert.deepEqual(
    decodeModernizationBlockers([{
      dimension: 'ui_automation_readiness',
      missingEvidence: [rejected],
      hardGates: [],
    }]),
    ['Governed blocker details unavailable'],
  );
}
const mixedCanonicalBlockers = canonicalBlockers
  .map(blocker => ({
    ...blocker,
    missingEvidence: blocker.missingEvidence.length ? [...blocker.missingEvidence, blocker.missingEvidence[0]] : [],
    hardGates: blocker.hardGates.length ? [...blocker.hardGates, blocker.hardGates[0]] : [],
  }))
  .reverse();
const mixedCanonicalDetails = decodeModernizationBlockers(mixedCanonicalBlockers);
const allCanonicalCodes = [
  ...Object.values(CANONICAL_MISSING_EVIDENCE_BY_DIMENSION).flat(),
  ...Object.values(CANONICAL_HARD_GATES_BY_DIMENSION).flat(),
];
const blockerDetailLoss = allCanonicalCodes.filter(code => !mixedCanonicalDetails.some(detail => detail.includes(code)));
assert.deepEqual(blockerDetailLoss, [], 'blocker detail loss must be zero for the complete canonical PR1G vocabulary');
for (const code of allCanonicalCodes) {
  assert.equal(
    mixedCanonicalDetails.join('\n').split(code).length - 1,
    1,
    `canonical blocker code ${code} must be deduplicated`,
  );
}
assert.deepEqual(
  mixedCanonicalDetails.map(detail => detail.split(':', 1)[0]),
  Object.keys(CANONICAL_MISSING_EVIDENCE_BY_DIMENSION),
  'mixed canonical blockers must retain governed dimension order',
);

const pr1gMetadata = (overrides: Partial<ApplicationMetadata>): ApplicationMetadata => ({
  name: 'Projection vocabulary fixture',
  businessCapabilities: ['claims'],
  supportedProcesses: ['claims-intake'],
  businessCriticality: 'high',
  lifecycleState: 'current',
  sourceCode: 'available_legal_access',
  documentationQuality: 'high',
  automatedTestMaturity: 'executable_acceptance',
  deploymentRepeatability: 'deterministic',
  observability: 'strong',
  dataClassifications: ['internal'],
  regulatedData: false,
  operatingRegions: ['US'],
  interfaces: ['REST/GraphQL'],
  upstreamDependencies: [],
  downstreamDependencies: [],
  realTime: true,
  eventDriven: true,
  synchronous: true,
  batch: false,
  ...overrides,
});
const assessVocabulary = (metadata: ApplicationMetadata) => assessApplication({
  id: APPLICATION,
  orgId: ORG,
  workspaceId: WORKSPACE,
  version: 1,
  metadataVersion: 1,
  metadata,
  authorId: USER,
  status: 'draft',
  evidence: [],
} satisfies ApplicationRecord);
const sourceMissingEvidence = assessVocabulary(pr1gMetadata({
  interfaces: ['UI-only'],
  documentationQuality: 'Unknown',
  realTime: 'Unknown',
  synchronous: 'Unknown',
  regulatedData: 'Unknown',
  sourceCode: 'Unknown',
  deploymentRepeatability: 'Unknown',
  bridgeEvidence: {},
})).dimensions.flatMap(dimension => dimension.missingEvidence);
const sourceHardGates = assessVocabulary(pr1gMetadata({
  interfaces: ['UI-only'],
  documentationQuality: 'low',
  batch: true,
  realTime: false,
  regulatedData: true,
  sourceCode: 'unavailable',
  deploymentRepeatability: 'ad_hoc',
  bridgeEvidence: {},
  aiControls: {},
})).dimensions.flatMap(dimension => dimension.hardGates);
assert.deepEqual(
  [...new Set(sourceMissingEvidence)].sort(),
  [...Object.values(CANONICAL_MISSING_EVIDENCE_BY_DIMENSION).flat()].sort(),
  'projection allowlist must mirror the complete production PR1G missing-evidence vocabulary',
);
assert.deepEqual(
  [...new Set(sourceHardGates)].sort(),
  [...Object.values(CANONICAL_HARD_GATES_BY_DIMENSION).flat()].sort(),
  'projection allowlist must mirror the complete production PR1G hard-gate vocabulary',
);

const authorityDatabase = (value: unknown): TenantAuthorityDatabase => ({ loadFreshProjection: async () => value });
const queryDatabase = (value: EnterpriseIntelligenceRawProjection): EnterpriseIntelligenceQueryDatabase => ({ loadProjectionRows: async () => value });
const invoke = async (body: unknown, overrides: Partial<{ authenticate: () => Promise<{ id: string }>; authorityDatabase: TenantAuthorityDatabase; queryDatabase: EnterpriseIntelligenceQueryDatabase }> = {}) => {
  const response = await handleEnterpriseIntelligenceQuery(new Request('http://local/enterprise-intelligence-query', {
    method: 'POST', headers: { Authorization: 'Bearer user-session' }, body: JSON.stringify(body),
  }), {
    authenticate: overrides.authenticate || (async () => ({ id: USER })),
    authorityDatabase: overrides.authorityDatabase || authorityDatabase(authority()),
    queryDatabase: overrides.queryDatabase || queryDatabase(raw()),
    now: () => new Date('2026-08-04T09:00:00.000Z'),
  });
  return { response, body: await response.json() as Record<string, unknown> };
};

const allowed = await invoke({ organizationId: ORG, workspaceId: WORKSPACE, expectedAuthorizationVersion: 9 });
assert.equal(allowed.response.status, 200);
assert.equal(allowed.response.headers.get('cache-control'), 'no-store');
assert.ok(isProjectionBody(allowed.body));

let parsedDeliveryPage: unknown;
const paged = await invoke({
  organizationId: ORG,
  workspaceId: WORKSPACE,
  expectedAuthorizationVersion: 9,
  deliveryItemPage: { packageId: PACKAGE, cursor: { version: 2, id: CANDIDATE }, limit: 100 },
}, {
  queryDatabase: {
    loadProjectionRows: async (_authority, options) => {
      parsedDeliveryPage = options?.deliveryItemPage;
      return raw();
    },
  },
});
assert.equal(paged.response.status, 200);
assert.deepEqual(parsedDeliveryPage, {
  packageId: PACKAGE,
  cursor: { version: 2, id: CANDIDATE },
  limit: 100,
}, 'strict HTTP request decoding preserves the opaque package selector and exact bounded cursor');

const malformedDeliveryPage = await invoke({
  organizationId: ORG,
  workspaceId: WORKSPACE,
  deliveryItemPage: { packageId: PACKAGE, cursor: { version: 2, id: CANDIDATE }, limit: 101 },
});
assert.deepEqual(
  { status: malformedDeliveryPage.response.status, body: malformedDeliveryPage.body },
  { status: 400, body: { code: 'INVALID_REQUEST' } },
  'a page over the decoder maximum fails before tenant query execution',
);

let parsedBaselineEligibilityPage: unknown;
const pagedBaselineEligibility = await invoke({
  organizationId: ORG,
  workspaceId: WORKSPACE,
  expectedAuthorizationVersion: 9,
  deliveryBaselineEligibilityPage: { cursor: { updatedAt: '2026-08-31T06:30:00.000Z', workPackageId: PACKAGE }, limit: 100 },
}, {
  queryDatabase: {
    loadProjectionRows: async (_authority, options) => {
      parsedBaselineEligibilityPage = options?.deliveryBaselineEligibilityPage;
      return raw();
    },
  },
});
assert.equal(pagedBaselineEligibility.response.status, 200);
assert.deepEqual(parsedBaselineEligibilityPage, {
  cursor: { updatedAt: '2026-08-31T06:30:00.000Z', workPackageId: PACKAGE },
  limit: 100,
}, 'strict HTTP request decoding preserves the server-issued baseline-eligibility cursor');
const malformedBaselineEligibilityPage = await invoke({
  organizationId: ORG,
  workspaceId: WORKSPACE,
  deliveryBaselineEligibilityPage: { cursor: { updatedAt: 'not-a-timestamp', workPackageId: PACKAGE }, limit: 100 },
});
assert.deepEqual(
  { status: malformedBaselineEligibilityPage.response.status, body: malformedBaselineEligibilityPage.body },
  { status: 400, body: { code: 'INVALID_REQUEST' } },
  'an invalid baseline-eligibility cursor fails before tenant query execution',
);

const malformed = await invoke({ organizationId: ORG, workspaceId: WORKSPACE, role: 'owner' });
assert.deepEqual({ status: malformed.response.status, body: malformed.body }, { status: 400, body: { code: 'INVALID_REQUEST' } });

const denied = await invoke({ organizationId: ORG, workspaceId: WORKSPACE }, { authorityDatabase: authorityDatabase(null) });
assert.deepEqual({ status: denied.response.status, body: denied.body }, { status: 403, body: { code: 'TENANT_ACCESS_DENIED' } });

const stale = await invoke({ organizationId: ORG, workspaceId: WORKSPACE, expectedAuthorizationVersion: 8 });
assert.deepEqual({ status: stale.response.status, body: stale.body }, { status: 409, body: { code: 'AUTHORIZATION_STALE' } });

const unavailable = await invoke({ organizationId: ORG, workspaceId: WORKSPACE }, { queryDatabase: { loadProjectionRows: async () => { throw new Error('database detail'); } } });
assert.deepEqual({ status: unavailable.response.status, body: unavailable.body }, { status: 503, body: { code: 'ENTERPRISE_PROJECTION_UNAVAILABLE' } });

function isProjectionBody(value: Record<string, unknown>): boolean {
  return Boolean(value.projection && typeof value.projection === 'object');
}

console.log('enterprise intelligence tenant projection tests passed');
