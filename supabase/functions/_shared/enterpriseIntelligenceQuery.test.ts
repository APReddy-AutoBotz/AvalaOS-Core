import assert from 'node:assert/strict';
import {
  assessApplication,
  type ApplicationMetadata,
  type ApplicationRecord,
} from '../../../services/assessV2/applicationPortfolio.ts';
import { decodeEnterpriseIntelligenceProjection } from '../../../services/enterpriseIntelligence.ts';
import type { TenantAuthorityDatabase, TenantContext } from './tenantAuthority.ts';
import {
  buildEnterpriseIntelligenceProjection,
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
assert.equal(projection.assessPromotion.state, 'contract_pending');
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
