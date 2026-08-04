import assert from 'node:assert/strict';
import {
  ASSEMBLE_ELIGIBLE_DISPOSITIONS,
  assertHighImpactApprovalSeparation,
  buildAssembleBlueprintDraft,
  buildDeliveryWorkPackageDraft,
  buildEnterpriseSelectorPayloads,
  buildEvidenceCandidate,
  buildMonitorBaseline,
  classifyEvidenceFile,
  decodeEnterpriseIntelligenceProjection,
  ENTERPRISE_INTELLIGENCE_PROJECTION_VERSION,
  evaluateModernizationDecision,
  type ModernizationFactors,
} from './enterpriseIntelligence';

const completeFactors: ModernizationFactors = {
  criticality: 'medium',
  fit: 'high',
  ux: 'medium',
  techHealth: 'high',
  maintainability: 'high',
  architecture: 'high',
  securityCompliance: 'medium',
  dataPortability: 'high',
  apiIntegration: 'medium',
  cloudFit: 'high',
  agentFit: 'high',
  vendorLockIn: 'low',
  costTco: 'medium',
  operatingRisk: 'low',
  skills: 'medium',
  changeEffort: 'low',
  timeToValue: 'medium',
  dependencyRisk: 'low',
};

const approvedDocument = {
  documentId: 'studio-doc-1',
  version: 4,
  contentHash: 'a'.repeat(64),
  artifactType: 'brd' as const,
  lifecycle: 'approved' as const,
};

const test = (name: string, callback: () => void) => {
  try {
    callback();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
};

test('modernization decisions are deterministic and separate from Assess scoring', () => {
  const first = evaluateModernizationDecision({ assessmentId: 'assessment-1', assessmentVersion: '7', factors: completeFactors });
  const second = evaluateModernizationDecision({ assessmentId: 'assessment-1', assessmentVersion: '7', factors: completeFactors });
  assert.deepEqual(first, second);
  assert.equal(first.modelVersion, 'modernization-disposition-1');
  assert.equal(first.requiresHumanApproval, true);
  assert.equal(first.primaryDisposition, 'assemble');
});

test('unknown high-impact evidence blocks modernization instead of inferring it', () => {
  const decision = evaluateModernizationDecision({
    assessmentId: 'assessment-2',
    assessmentVersion: '1',
    factors: { ...completeFactors, securityCompliance: 'unknown' },
  });
  assert.equal(decision.primaryDisposition, 'insufficient_evidence');
  assert.ok(decision.blockers.includes('securityCompliance_evidence_required'));
});

test('candidate excerpts are sanitized and retain source provenance', () => {
  const candidate = buildEvidenceCandidate({
    id: 'candidate-1',
    sourceId: 'source-1',
    sourceVersionId: 'source-version-1',
    field: 'process_objective',
    value: 'Define the objective',
    safeExcerpt: '  Define\u0000 the   objective  ',
    sourceLocator: 'page:2/paragraph:4',
    confidence: 0.88,
    status: 'suggested',
  });
  assert.equal(candidate.safeExcerpt, 'Define the objective');
  assert.equal(candidate.editCount, 0);
  assert.equal(candidate.excerptHash.length, 64);
});

test('delivery handoff becomes stale when the approved Studio version changes', () => {
  const stale = buildDeliveryWorkPackageDraft({
    packageId: 'package-1',
    approvedDocument,
    currentApprovedDocument: { ...approvedDocument, version: 5 },
    sourceSections: [{ locator: 'brd.requirements.1', title: 'First epic', summary: 'First summary' }],
  });
  assert.equal(stale.status, 'stale');
  assert.deepEqual(stale.items, []);
  assert.equal(stale.canPublish, false);
});

test('delivery draft and monitor baseline preserve exact source lineage', () => {
  const workPackage = buildDeliveryWorkPackageDraft({
    packageId: 'package-2',
    approvedDocument,
    currentApprovedDocument: approvedDocument,
    sourceSections: [
      { locator: 'brd.requirements.1', title: 'First epic', summary: 'First summary' },
      { locator: 'brd.requirements.1.1', title: 'First story', summary: 'First story summary', acceptanceCriteria: ['Given evidence, when reviewed, then accepted'] },
    ],
  });
  const baseline = buildMonitorBaseline({
    id: 'baseline-1',
    workPackageId: 'package-2',
    workPackage,
    approvedItemIds: workPackage.items.map(item => item.id),
  });
  assert.equal(workPackage.status, 'draft');
  assert.equal(baseline.status, 'approval_required');
  assert.equal(baseline.lineageComplete, true);
  assert.equal(baseline.liveTelemetryConnected, false);
  assert.equal(workPackage.items[1].sourceDocumentHash, approvedDocument.contentHash);
});

test('Assemble blueprints are draft-only and disable Agent Tools by default', () => {
  const blueprint = buildAssembleBlueprintDraft({
    blueprintId: 'blueprint-1',
    modernizationDecisionId: 'decision-1',
    disposition: ASSEMBLE_ELIGIBLE_DISPOSITIONS[0],
    name: 'Claims intake',
  });
  assert.equal(blueprint.status, 'draft');
  assert.equal(blueprint.canPublish, false);
  assert.equal(blueprint.safety.deployment, false);
  assert.equal(blueprint.components.find(component => component.type === 'Agent Tools')?.enabled, false);
  assert.deepEqual(blueprint.workflow, ['draft', 'edit', 'review', 'approval', 'publish']);
});

test('high-impact actions require three distinct people', () => {
  assert.equal(assertHighImpactApprovalSeparation({ createdBy: 'a', reviewedBy: 'b', approvedBy: 'c' }), true);
  assert.throws(
    () => assertHighImpactApprovalSeparation({ createdBy: 'a', reviewedBy: 'a', approvedBy: 'c' }),
    /APPROVAL_SEPARATION_REQUIRED/,
  );
});

test('selector-only payloads omit authoritative hashes, versions, and item identifiers', () => {
  const applicationId = '10000000-0000-4000-8000-000000000001';
  const documentId = '20000000-0000-4000-8000-000000000002';
  const packageId = '30000000-0000-4000-8000-000000000003';
  const draftId = '40000000-0000-4000-8000-000000000004';
  const candidateId = '50000000-0000-4000-8000-000000000005';
  assert.deepEqual(buildEnterpriseSelectorPayloads.evidenceExtraction(applicationId), { sourceId: applicationId });
  assert.deepEqual(buildEnterpriseSelectorPayloads.modernization(applicationId), { applicationId });
  assert.deepEqual(buildEnterpriseSelectorPayloads.studioHandoff(documentId), { studioDocumentId: documentId });
  assert.deepEqual(buildEnterpriseSelectorPayloads.monitorBaseline(packageId), { workPackageId: packageId });
  assert.deepEqual(buildEnterpriseSelectorPayloads.assessPromotion(applicationId, draftId, [candidateId]), { sourceId: applicationId, assessDraftId: draftId, candidateIds: [candidateId] });
  assert.ok(!JSON.stringify(buildEnterpriseSelectorPayloads.studioHandoff(documentId)).match(/hash|version/i));
  assert.ok(!JSON.stringify(buildEnterpriseSelectorPayloads.monitorBaseline(packageId)).match(/item/i));
});

test('file support is truthful about native text, DOCX, and scanned PDF OCR limits', () => {
  assert.deepEqual(classifyEvidenceFile('notes.md', '', 20).mimeType, 'text/markdown');
  assert.equal(classifyEvidenceFile('meeting.srt', '', 20).supported, true);
  assert.equal(classifyEvidenceFile('source.docx', 'application/octet-stream', 20).state, 'docx_text');
  const pdf = classifyEvidenceFile('scan.pdf', 'application/pdf', 20);
  assert.equal(pdf.state, 'text_pdf_requires_text_layer');
  assert.match(pdf.message, /OCR.*not available/i);
  assert.equal(classifyEvidenceFile('audio.mp3', 'audio/mpeg', 20).supported, false);
  assert.equal(classifyEvidenceFile('too-large.txt', 'text/plain', 12_000_001).supported, false);
});

test('browser projection decoder rejects raw authority and sensitive server fields', () => {
  const baseProjection = {
    schemaVersion: ENTERPRISE_INTELLIGENCE_PROJECTION_VERSION,
    organizationId: '10000000-0000-4000-8000-000000000001',
    workspaceId: '20000000-0000-4000-8000-000000000002',
    authorizationVersion: 7,
    generatedAt: '2026-08-04T00:00:00.000Z',
    capabilities: ['evidence.review'],
    availability: 'ready',
    providers: [], evidenceSources: [], evidenceCandidates: [], assessDrafts: [], applications: [],
    studioDocuments: [], deliveryPackages: [], monitorBaselines: [],
    modernizationDecisions: [], blueprints: [], approvalResources: [], commandActivity: [],
    assessPromotion: { state: 'contract_pending', acceptedCandidateCount: 0, provenanceComplete: false, idempotencyState: 'not_started', conflicts: [] },
  };
  assert.equal(decodeEnterpriseIntelligenceProjection(baseProjection).authorizationVersion, 7);
  assert.throws(
    () => decodeEnterpriseIntelligenceProjection({ ...baseProjection, providers: [{ secretReference: 'server-only' }] }),
    /ENTERPRISE_PROJECTION_SENSITIVE_FIELD/,
  );
  assert.throws(
    () => decodeEnterpriseIntelligenceProjection({ ...baseProjection, studioDocuments: [{ contentHash: 'a'.repeat(64) }] }),
    /ENTERPRISE_PROJECTION_SENSITIVE_FIELD/,
  );
  assert.throws(() => decodeEnterpriseIntelligenceProjection({ ...baseProjection, extraAuthority: true }), /ENTERPRISE_PROJECTION_INVALID/);
});
