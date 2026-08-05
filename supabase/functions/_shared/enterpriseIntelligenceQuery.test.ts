import assert from 'node:assert/strict';
import { decodeEnterpriseIntelligenceProjection } from '../../../services/enterpriseIntelligence.ts';
import type { TenantAuthorityDatabase, TenantContext } from './tenantAuthority.ts';
import {
  buildEnterpriseIntelligenceProjection,
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
assert.equal(projection.blueprints[0].components.find(item => item.type === 'Agent Tools')?.enabled, false);
assert.equal(projection.approvalResources.find(item => item.id === PACKAGE)?.separationOfDuties, 'creator_cannot_review');
assert.equal(projection.assessPromotion.state, 'contract_pending');
assert.equal(decodeEnterpriseIntelligenceProjection(projection).workspaceId, WORKSPACE);
const serialized = JSON.stringify(projection);
for (const prohibited of ['must-never-project', 'contentHash', 'extractedTextHash', 'idempotencyKey', 'resource_hash', 'storage_path', 'secret_ref']) {
  assert.ok(!serialized.includes(prohibited), `projection must omit ${prohibited}`);
}

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
