import type { Page, Request } from '@playwright/test';
import type { EnterpriseIntelligenceProjection } from '../../services/enterpriseIntelligence';
import type { DeliveryWorkspaceProjection, MonitorApprovedBaselinesProjection } from '../../services/deliveryMonitor/contracts';
import { createDeliveryWorkspaceFixture, createMonitorBaselinesFixture } from '../../services/deliveryMonitor/fixtures';

export const ENTERPRISE_API = 'https://127.0.0.1:59999';
export const IDS = {
  actor: '10000000-0000-4000-8000-000000000001',
  organization: '20000000-0000-4000-8000-000000000002',
  workspace: '30000000-0000-4000-8000-000000000003',
  provider: '40000000-0000-4000-8000-000000000004',
  route: '50000000-0000-4000-8000-000000000005',
  routeRole: '51000000-0000-4000-8000-000000000015',
  source: '60000000-0000-4000-8000-000000000006',
  sourceVersion: '70000000-0000-4000-8000-000000000007',
  sourceTwo: '61000000-0000-4000-8000-000000000016',
  sourceVersionTwo: '71000000-0000-4000-8000-000000000017',
  candidate: '80000000-0000-4000-8000-000000000008',
  assessDraft: '81000000-0000-4000-8000-000000000018',
  application: '90000000-0000-4000-8000-000000000009',
  studio: 'b0000000-0000-4000-8000-00000000000b',
  package: 'd0000000-0000-4000-8000-00000000000d',
  packageDraft: 'd1000000-0000-4000-8000-00000000001d',
  monitor: 'f0000000-0000-4000-8000-00000000000f',
  decision: '12000000-0000-4000-8000-000000000012',
  blueprint: '13000000-0000-4000-8000-000000000013',
  sourceSet: '14000000-0000-4000-8000-000000000014',
  sourceSetVersion: '15000000-0000-4000-8000-000000000015',
  sourceSetTwo: '24000000-0000-4000-8000-000000000024',
  sourceSetVersionTwo: '25000000-0000-4000-8000-000000000025',
  sourceSetVersionNext: '35000000-0000-4000-8000-000000000035',
  inputBundle: '16000000-0000-4000-8000-000000000016',
  inputBundleVersion: '1c000000-0000-4000-8000-00000000001c',
  inputBundleTwo: '26000000-0000-4000-8000-000000000026',
  inputBundleVersionTwo: '27000000-0000-4000-8000-000000000027',
  journey: '17000000-0000-4000-8000-000000000017',
  transcriptCandidateTwo: '18000000-0000-4000-8000-000000000018',
  applyPreview: '19000000-0000-4000-8000-000000000019',
  conflict: '1a000000-0000-4000-8000-00000000001a',
  assessRun: '1b000000-0000-4000-8000-00000000001b',
  assessRunTwo: '28000000-0000-4000-8000-000000000028',
  extractionJobOne: '29000000-0000-4000-8000-000000000029',
  extractionJobTwo: '2a000000-0000-4000-8000-00000000002a',
  extractionJobOtherBundle: '2b000000-0000-4000-8000-00000000002b',
  extractionBindingOne: '2c000000-0000-4000-8000-00000000002c',
  extractionBindingTwo: '2d000000-0000-4000-8000-00000000002d',
  extractionBindingOtherBundle: '2e000000-0000-4000-8000-00000000002e',
  unrelatedCandidate: '2f000000-0000-4000-8000-00000000002f',
  incompleteCandidate: '3f000000-0000-4000-8000-00000000003f',
  deliveryActor: '30000006-0000-4000-8000-000000000006',
  deliveryOrganization: '00000001-0000-4000-8000-000000000001',
  deliveryOrganizationSecondary: '00000004-0000-4000-8000-000000000004',
  deliveryWorkspace: '00000002-0000-4000-8000-000000000002',
  deliveryWorkspaceSecondary: '00000003-0000-4000-8000-000000000003',
  deliveryOrganizationWorkspace: '00000005-0000-4000-8000-000000000005',
  deliverySecondaryPackage: '41000000-0000-4000-8000-000000000041',
  deliverySecondaryPackageVersion: '42000000-0000-4000-8000-000000000042',
  deliverySecondaryItem: '43000000-0000-4000-8000-000000000043',
  deliverySecondaryItemVersion: '44000000-0000-4000-8000-000000000044',
  deliveryManualPackage: '45000000-0000-4000-8000-000000000045',
  deliveryManualPackageVersion: '46000000-0000-4000-8000-000000000046',
  deliveryManualItem: '47000000-0000-4000-8000-000000000047',
  deliveryManualItemVersion: '48000000-0000-4000-8000-000000000048',
} as const;

type ProjectionFailure = 'stale' | 'denied' | 'unavailable';
type FixtureOptions = {
  noByok?: boolean;
  providerUnavailable?: boolean;
  projectionFailure?: ProjectionFailure;
  transcriptFlow?: boolean;
  transcriptCandidateCount?: number;
  deliveryMonitor?: boolean;
};

type EvidenceLineage = {
  sourceVersionSelectors: string[];
  sourceSets: Array<{ id: string; version: number; versionSelector: string }>;
  inputBundles: Array<{ id: string; version: number; versionSelector: string }>;
  extractionJobIds: string[];
  extractionBindingIds: string[];
  candidates: Array<{ id: string; version: number }>;
  previewBatchIds: string[];
  assessDrafts: Array<{ id: string; version: number }>;
};

const emptyEvidenceLineage = (): EvidenceLineage => ({
  sourceVersionSelectors: [], sourceSets: [], inputBundles: [], extractionJobIds: [], extractionBindingIds: [],
  candidates: [], previewBatchIds: [], assessDrafts: [],
});
const sortedUnique = (values: string[]) => [...new Set(values)].sort();

const transcriptCandidateId = (index: number) => `8f000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;

const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
  'cache-control': 'no-store',
  'content-type': 'application/json',
};

const allowedOperations = new Set([
  'provider.register', 'provider.secret.bind', 'provider.validate', 'provider.activate', 'provider.secret.rotate', 'provider.route.toggle', 'provider.revoke',
  'evidence.source.create', 'evidence.extract', 'evidence.candidate.review', 'evidence.assess.promote',
  'transcript.source-set.create-version', 'transcript.input-bundle.lock', 'transcript.journey.set-state', 'transcript.assess.extract',
  'transcript.assess.candidate.review', 'transcript.assess.apply.preview', 'transcript.assess.conflict.resolve', 'transcript.assess.apply.commit',
  'modernization.evaluate', 'approval.review.record', 'approval.record', 'assemble.blueprint.create',
  'delivery.package.create.manual',
]);

const deliveryWorkspaceFor = (workspaceId: string, secondary = false, organizationId: string = IDS.deliveryOrganization): DeliveryWorkspaceProjection => {
  const raw = structuredClone(createDeliveryWorkspaceFixture()) as unknown as Record<string, unknown>;
  raw.organizationId = organizationId;
  raw.workspaceId = workspaceId;
  if (secondary) {
    const sourcePackage = structuredClone((raw.packages as Array<Record<string, unknown>>)[0]);
    const sourceItem = structuredClone((sourcePackage.items as Array<Record<string, unknown>>)[0]);
    sourcePackage.id = IDS.deliverySecondaryPackage;
    sourcePackage.currentVersionId = IDS.deliverySecondaryPackageVersion;
    sourceItem.itemAggregateId = IDS.deliverySecondaryItem;
    sourceItem.itemVersionId = IDS.deliverySecondaryItemVersion;
    sourceItem.title = 'Secondary workspace canonical item';
    sourceItem.history = (sourceItem.history as Array<Record<string, unknown>>).map(item => ({ ...item, title: 'Secondary workspace canonical item' }));
    sourcePackage.items = [sourceItem];
    raw.eligibleStudioArtifacts = [];
    raw.handoffs = [];
    raw.packages = [sourcePackage];
    raw.baselineEligibility = [];
  }
  return raw as unknown as DeliveryWorkspaceProjection;
};

const monitorProjectionFor = (workspaceId: string, secondary = false, organizationId: string = IDS.deliveryOrganization): MonitorApprovedBaselinesProjection => {
  const raw = structuredClone(createMonitorBaselinesFixture()) as unknown as Record<string, unknown>;
  raw.organizationId = organizationId;
  raw.workspaceId = workspaceId;
  if (secondary) raw.baselines = [];
  return raw as unknown as MonitorApprovedBaselinesProjection;
};

const baseProjection = (options: FixtureOptions): EnterpriseIntelligenceProjection => ({
  schemaVersion: 'enterprise-intelligence-projection-2',
  organizationId: options.deliveryMonitor ? IDS.deliveryOrganization : IDS.organization,
  workspaceId: options.deliveryMonitor ? IDS.deliveryWorkspace : IDS.workspace,
  authorizationVersion: 9,
  generatedAt: '2026-08-04T09:00:00.000Z',
  capabilities: options.deliveryMonitor ? ['delivery.handoff.request', 'delivery.package.manage', 'project.read'] : [
    'approvals.review', 'assemble.manage', ...(options.transcriptFlow ? ['assess.v2.read'] : []), 'byok.manage', 'evidence.review', 'evidence.write',
    'monitor.manage', 'monitor.read', 'portfolio.manage', 'project.manage', 'project.read',
    'security.manage', 'studio.artifacts.read',
    ...(options.transcriptFlow ? ['transcript.assess.apply', 'transcript.journeys.manage', 'transcript.sources.manage', 'transcript.sources.read'] : []),
  ],
  availability: 'ready',
  providers: options.noByok ? [] : [{
    id: IDS.provider,
    provider: 'openai',
    displayName: 'Synthetic drafting provider',
    defaultModel: 'approved-test-model',
    status: options.providerUnavailable ? 'disabled' : 'pending_review',
    credentialState: 'server_reference_present',
    endpointState: 'first_party',
    validationState: 'validation_required',
    budgetState: 'configured',
    eligibleRouteRoles: [{ id: IDS.routeRole, label: 'Workspace reviewer', scope: 'workspace' }],
    routes: [{
      id: IDS.route,
      capability: 'assess.evidence.extract',
      modelLabel: 'Approved test model',
      enabled: false,
      availability: options.providerUnavailable ? 'provider_unavailable' : 'validation_required',
      allowedRoleCount: 1,
      allowedRoleIds: [IDS.routeRole],
    }],
  }],
  evidenceSources: [],
  evidenceCandidates: [],
  assessDrafts: [{
    id: IDS.assessDraft,
    label: 'Governed synthetic Assess draft',
    versionLabel: 'Draft version 1',
    status: 'draft',
    updatedAt: '2026-08-04T08:30:00.000Z',
  }],
  applications: [{
    id: IDS.application,
    name: 'Synthetic claims application',
    approvedAssessmentLabel: 'Approved assessment 3',
    decisionModelLabel: 'Application portfolio model',
    approvedAt: '2026-08-04T08:00:00.000Z',
    modernizationState: 'already_assessed',
  }],
  studioDocuments: [{
    id: IDS.studio,
    label: 'Approved synthetic requirements',
    artifactType: 'brd',
    approvedVersionLabel: 'Current approved version',
    lifecycle: 'approved',
    handoffState: 'available',
  }],
  deliveryPackages: [{
    id: IDS.package,
    label: 'Approved synthetic delivery package',
    status: 'approved',
    currentVersionLabel: 'Current committed package',
    sourceLabel: 'Previously approved synthetic requirements',
    lineageState: 'complete',
    items: [{ itemType: 'Epic', title: 'Approved governed intake', acceptanceCriteriaCount: 1, sourceLocator: 'requirements section 1' }],
    createdByCurrentActor: false,
  }],
  monitorBaselines: [],
  ...(options.deliveryMonitor ? {
    deliveryWorkspace: deliveryWorkspaceFor(IDS.deliveryWorkspace),
    monitorApprovedBaselines: monitorProjectionFor(IDS.deliveryWorkspace),
  } : {}),
  modernizationDecisions: [{
    id: IDS.decision,
    applicationName: 'Synthetic claims application',
    status: 'approved',
    primaryDisposition: 'assemble',
    blockers: [],
    conflicts: [],
    assembleEligible: true,
    createdByCurrentActor: false,
  }],
  blueprints: [],
  approvalResources: [],
  commandActivity: [],
  transcriptFlow: {
    schemaVersion: 'transcript-flow-pr-a-1',
    features: options.transcriptFlow
      ? { sourceSetsEnabled: true, assessMultisourceApplyEnabled: true }
      : { sourceSetsEnabled: false, assessMultisourceApplyEnabled: false, disabledReason: 'Governed multi-source transcript processing is disabled for this workspace.' },
    sourceVersions: options.transcriptFlow ? [{
      sourceId: IDS.source,
      versionSelector: IDS.sourceVersion,
      displayName: 'ASSESS-INTERVIEW-01.vtt',
      versionLabel: 'Source version 1',
      mimeType: 'text/vtt',
      extractedCharacterCount: 120,
      state: 'ready',
      selectable: true,
      reuseState: 'unused',
    }, {
      sourceId: IDS.sourceTwo,
      versionSelector: IDS.sourceVersionTwo,
      displayName: 'ASSESS-INTERVIEW-02.srt',
      versionLabel: 'Source version 1',
      mimeType: 'application/x-subrip',
      extractedCharacterCount: 140,
      state: 'ready',
      selectable: true,
      reuseState: 'already_selected_elsewhere',
    }] : [],
    sourceSets: options.transcriptFlow ? [{
      id: IDS.sourceSet, versionSelector: IDS.sourceSetVersion, version: 1, ownerModule: 'assess',
      label: 'Primary interview set', description: 'Exact two-source Assess evidence', versionLabel: 'Source-set version 1',
      status: 'locked', sourceCount: 2, extractedCharacterCount: 260, lockState: 'locked', blockers: [],
      updatedAt: '2026-08-04T08:10:00.000Z',
      members: [{ sourceId: IDS.source, versionSelector: IDS.sourceVersion, displayName: 'ASSESS-INTERVIEW-01.vtt', versionLabel: 'Source version 1', ordinal: 1, role: 'primary', extractedCharacterCount: 120, state: 'ready' },
        { sourceId: IDS.sourceTwo, versionSelector: IDS.sourceVersionTwo, displayName: 'ASSESS-INTERVIEW-02.srt', versionLabel: 'Source version 1', ordinal: 2, role: 'supporting', extractedCharacterCount: 140, state: 'ready' }],
    }, {
      id: IDS.sourceSetTwo, versionSelector: IDS.sourceSetVersionTwo, version: 1, ownerModule: 'assess',
      label: 'Overlapping reference set', versionLabel: 'Source-set version 1', status: 'locked', sourceCount: 1,
      extractedCharacterCount: 120, lockState: 'locked', blockers: [], updatedAt: '2026-08-04T08:11:00.000Z',
      members: [{ sourceId: IDS.source, versionSelector: IDS.sourceVersion, displayName: 'ASSESS-INTERVIEW-01.vtt', versionLabel: 'Source version 1', ordinal: 1, role: 'reference', extractedCharacterCount: 120, state: 'ready' }],
    }] : [],
    inputBundles: options.transcriptFlow ? [{
      id: IDS.inputBundle, versionSelector: IDS.inputBundleVersion, version: 1, ownerModule: 'assess', label: 'Primary claims bundle',
      versionLabel: 'Input-bundle version 1', status: 'locked', sourceSetIds: [IDS.sourceSet],
      sourceSetVersions: [{ sourceSetId: IDS.sourceSet, sourceSetVersionSelector: IDS.sourceSetVersion, sourceSetVersion: 1, ordinal: 1 }],
      sourceVersionSelectors: [IDS.sourceVersion, IDS.sourceVersionTwo], sourceCount: 2, extractedCharacterCount: 260,
      lockedAt: '2026-08-04T08:20:00.000Z',
    }, {
      id: IDS.inputBundleTwo, versionSelector: IDS.inputBundleVersionTwo, version: 1, ownerModule: 'assess', label: 'Overlapping reference bundle',
      versionLabel: 'Input-bundle version 1', status: 'locked', sourceSetIds: [IDS.sourceSetTwo],
      sourceSetVersions: [{ sourceSetId: IDS.sourceSetTwo, sourceSetVersionSelector: IDS.sourceSetVersionTwo, sourceSetVersion: 1, ordinal: 1 }],
      sourceVersionSelectors: [IDS.sourceVersion], sourceCount: 1, extractedCharacterCount: 120,
      lockedAt: '2026-08-04T08:21:00.000Z',
    }] : [],
    journeys: [],
    assessCandidates: options.transcriptFlow && options.transcriptCandidateCount
      ? Array.from({ length: Math.min(200, Math.max(0, options.transcriptCandidateCount)) }, (_, index) => ({
        id: transcriptCandidateId(index), candidateVersion: 1, inputBundleId: IDS.inputBundle,
        inputBundleVersionSelector: IDS.inputBundleVersion,
        extractionBindingId: index % 2 ? IDS.extractionBindingTwo : IDS.extractionBindingOne,
        extractionJobId: index % 2 ? IDS.extractionJobTwo : IDS.extractionJobOne,
        sourceSetId: IDS.sourceSet, sourceSetVersionSelector: IDS.sourceSetVersion, sourceSetVersion: 1,
        sourceId: index % 2 ? IDS.sourceTwo : IDS.source, sourceVersionSelector: index % 2 ? IDS.sourceVersionTwo : IDS.sourceVersion,
        sourceLabel: index % 2 ? 'ASSESS-INTERVIEW-02.srt' : 'ASSESS-INTERVIEW-01.vtt', sourceVersionLabel: 'Source version 1',
        field: 'process_objective', value: `Synthetic candidate ${index + 1}`, safeExcerpt: `Bounded synthetic excerpt ${index + 1}`,
        sourceLocator: `normalized-text:v1:chars:${index * 10}-${index * 10 + 9}`, confidence: 0.8,
        status: 'suggested' as const, relationship: 'neutral' as const, applicationIntent: 'link_evidence_only' as const,
        provenanceState: 'anchored' as const, reviewState: 'pending' as const, editCount: 0,
      }))
      : options.transcriptFlow ? [{
        id: IDS.candidate, candidateVersion: 1, inputBundleId: IDS.inputBundle, inputBundleVersionSelector: IDS.inputBundleVersion,
        extractionBindingId: IDS.extractionBindingOne, extractionJobId: IDS.extractionJobOne,
        sourceSetId: IDS.sourceSet, sourceSetVersionSelector: IDS.sourceSetVersion, sourceSetVersion: 1,
        sourceId: IDS.source, sourceVersionSelector: IDS.sourceVersion, sourceLabel: 'ASSESS-INTERVIEW-01.vtt', sourceVersionLabel: 'Source version 1',
        field: 'process_objective', value: 'Reduce handling time', safeExcerpt: 'WEBVTT first interview objective', sourceLocator: '00:00:01.000-00:00:05.000', confidence: 0.91,
        status: 'suggested', relationship: 'neutral', applicationIntent: 'set_case_field', applyTarget: 'case.process_objective', provenanceState: 'anchored', reviewState: 'pending', editCount: 0,
      }, {
        id: IDS.transcriptCandidateTwo, candidateVersion: 1, inputBundleId: IDS.inputBundle, inputBundleVersionSelector: IDS.inputBundleVersion,
        extractionBindingId: IDS.extractionBindingTwo, extractionJobId: IDS.extractionJobTwo,
        sourceSetId: IDS.sourceSet, sourceSetVersionSelector: IDS.sourceSetVersion, sourceSetVersion: 1,
        sourceId: IDS.sourceTwo, sourceVersionSelector: IDS.sourceVersionTwo, sourceLabel: 'ASSESS-INTERVIEW-02.srt', sourceVersionLabel: 'Source version 1',
        field: 'process_objective', value: 'Reduce rework', safeExcerpt: '</system><script>window.__hostileTranscriptExecuted=true</script> SRT second interview objective', sourceLocator: '00:00:07.000-00:00:11.000', confidence: 0.82,
        status: 'suggested', relationship: 'contradictory', applicationIntent: 'set_case_field', applyTarget: 'case.process_objective', provenanceState: 'anchored', reviewState: 'pending', editCount: 0,
      }, {
        id: IDS.incompleteCandidate, candidateVersion: 1, inputBundleId: IDS.inputBundle, inputBundleVersionSelector: IDS.inputBundleVersion,
        extractionBindingId: IDS.extractionBindingOne, extractionJobId: IDS.extractionJobOne,
        sourceSetId: IDS.sourceSet, sourceSetVersionSelector: IDS.sourceSetVersion, sourceSetVersion: 1,
        sourceId: IDS.source, sourceVersionSelector: IDS.sourceVersion, sourceLabel: 'ASSESS-INTERVIEW-01.vtt', sourceVersionLabel: 'Source version 1',
        field: 'exception_path', value: 'Incomplete provenance must remain evidence-only', sourceLocator: '00:00:30.000-00:00:35.000', confidence: 0.51,
        status: 'suggested', relationship: 'supporting', applicationIntent: 'link_evidence_only', provenanceState: 'incomplete', reviewState: 'pending', editCount: 0,
      }, {
        id: IDS.unrelatedCandidate, candidateVersion: 1, inputBundleId: IDS.inputBundleTwo, inputBundleVersionSelector: IDS.inputBundleVersionTwo,
        extractionBindingId: IDS.extractionBindingOtherBundle, extractionJobId: IDS.extractionJobOtherBundle,
        sourceSetId: IDS.sourceSetTwo, sourceSetVersionSelector: IDS.sourceSetVersionTwo, sourceSetVersion: 1,
        sourceId: IDS.source, sourceVersionSelector: IDS.sourceVersion, sourceLabel: 'ASSESS-INTERVIEW-01.vtt', sourceVersionLabel: 'Source version 1',
        field: 'process_objective', value: 'Other-bundle candidate must never mix', safeExcerpt: 'Same source, different exact job', sourceLocator: '00:00:20.000-00:00:25.000', confidence: 0.77,
        status: 'accepted', relationship: 'neutral', applicationIntent: 'link_evidence_only', provenanceState: 'anchored', reviewState: 'reviewed_by_another', editCount: 0,
      }] : [],
    assessConflicts: [],
    assessApplyPreviews: [],
    assessRuns: options.transcriptFlow ? [{
      id: IDS.assessRun, inputBundleId: IDS.inputBundle, inputBundleVersionSelector: IDS.inputBundleVersion,
      extractionBindingIds: [IDS.extractionBindingOne, IDS.extractionBindingTwo], extractionJobIds: [IDS.extractionJobOne, IDS.extractionJobTwo],
      extractionBindings: [
        { extractionBindingId: IDS.extractionBindingOne, extractionJobId: IDS.extractionJobOne, sourceSetId: IDS.sourceSet, sourceSetVersionSelector: IDS.sourceSetVersion, sourceSetVersion: 1, sourceVersionSelector: IDS.sourceVersion },
        { extractionBindingId: IDS.extractionBindingTwo, extractionJobId: IDS.extractionJobTwo, sourceSetId: IDS.sourceSet, sourceSetVersionSelector: IDS.sourceSetVersion, sourceSetVersion: 1, sourceVersionSelector: IDS.sourceVersionTwo },
      ],
      sourceSetVersions: [{ sourceSetId: IDS.sourceSet, sourceSetVersionSelector: IDS.sourceSetVersion, sourceSetVersion: 1, ordinal: 1 }],
      sourceVersionSelectors: [IDS.sourceVersion, IDS.sourceVersionTwo], state: 'review_required', selectedSourceCount: 2,
      completedSourceCount: 2, candidateCount: options.transcriptCandidateCount || 3, updatedAt: '2026-08-04T08:25:00.000Z',
    }, {
      id: IDS.assessRunTwo, inputBundleId: IDS.inputBundleTwo, inputBundleVersionSelector: IDS.inputBundleVersionTwo,
      extractionBindingIds: [IDS.extractionBindingOtherBundle], extractionJobIds: [IDS.extractionJobOtherBundle],
      extractionBindings: [{ extractionBindingId: IDS.extractionBindingOtherBundle, extractionJobId: IDS.extractionJobOtherBundle, sourceSetId: IDS.sourceSetTwo, sourceSetVersionSelector: IDS.sourceSetVersionTwo, sourceSetVersion: 1, sourceVersionSelector: IDS.sourceVersion }],
      sourceSetVersions: [{ sourceSetId: IDS.sourceSetTwo, sourceSetVersionSelector: IDS.sourceSetVersionTwo, sourceSetVersion: 1, ordinal: 1 }],
      sourceVersionSelectors: [IDS.sourceVersion], state: 'review_required', selectedSourceCount: 1,
      completedSourceCount: 1, candidateCount: 1, updatedAt: '2026-08-04T08:26:00.000Z',
    }] : [],
  },
  assessPromotion: {
    state: 'contract_pending',
    acceptedCandidateCount: 0,
    provenanceComplete: false,
    idempotencyState: 'not_started',
    conflicts: [],
  },
});

const operationFrom = (request: Request) => {
  const body = request.postDataJSON() as Record<string, unknown>;
  return String(body.operation || body.commandType || 'unknown');
};

export const installEnterpriseIntelligenceFixture = async (page: Page, options: FixtureOptions = {}) => {
  const projection = baseProjection(options);
  const secondaryProjection = options.deliveryMonitor ? {
    ...baseProjection(options),
    workspaceId: IDS.deliveryWorkspaceSecondary,
    deliveryWorkspace: deliveryWorkspaceFor(IDS.deliveryWorkspaceSecondary, true),
    monitorApprovedBaselines: monitorProjectionFor(IDS.deliveryWorkspaceSecondary, true),
  } : undefined;
  const alternateOrganizationProjection = options.deliveryMonitor ? {
    ...baseProjection(options),
    organizationId: IDS.deliveryOrganizationSecondary,
    workspaceId: IDS.deliveryOrganizationWorkspace,
    deliveryWorkspace: deliveryWorkspaceFor(IDS.deliveryOrganizationWorkspace, true, IDS.deliveryOrganizationSecondary),
    monitorApprovedBaselines: monitorProjectionFor(IDS.deliveryOrganizationWorkspace, true, IDS.deliveryOrganizationSecondary),
  } : undefined;
  const operations: string[] = [];
  const commandPayloads: Array<Record<string, unknown>> = [];
  const authorityRecheckPayloads: Array<Record<string, unknown>> = [];
  const recoveryPayloads: Array<Record<string, unknown>> = [];
  const unexpectedRequests: string[] = [];
  let projectionFailure = options.projectionFailure;
  let nextCommandFailure: { operation: string; code: string } | undefined;
  let nextTransportFailure: string | undefined;
  let responseLossAfterCommit: { operation: string; remaining: number } | undefined;
  let postCommitOutcomeUnknown: { operation: string; code: 'COMMAND_OUTCOME_UNKNOWN' | 'RECEIPT_FINALIZATION_FAILED' } | undefined;
  let delayedCommand: {
    operation: string;
    observed: Promise<void>;
    markObserved: () => void;
    release: Promise<void>;
    releaseNow: () => void;
    settled: Promise<void>;
    markSettled: () => void;
  } | undefined;
  let nextProviderStale: { operation: string; revokeAuthority: boolean; managedWrite: boolean } | undefined;
  let providerAuthorityRevoked = false;
  let authorityRecheckTransportFailures = 0;
  let recoveryTransportFailures = 0;
  let successfulProjectionResponses = 0;
  const evidenceTouchedBundleIds = new Set<string>();
  const evidenceTouchedSourceSetIds = new Set<string>();
  const managedSecretPlans = new Set<string>();
  const terminalizedSecretPlans = new Set<string>();
  const committedCommandKeys = new Set<string>();
  const domainEffectCounts = new Map<string, number>();
  let managedSecretWrites = 0;
  let managedSecretCleanups = 0;
  let providerValidations = 0;
  let providerEffects = 0;
  const queryWorkspaceIds: string[] = [];

  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>(next => { resolve = next; });
    return { promise, resolve };
  };
  const shouldLoseCommittedResponse = (operation: string) => {
    if (responseLossAfterCommit?.operation !== operation || responseLossAfterCommit.remaining < 1) return false;
    responseLossAfterCommit.remaining -= 1;
    if (responseLossAfterCommit.remaining === 0) responseLossAfterCommit = undefined;
    return true;
  };

  page.on('request', request => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
      unexpectedRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
    }
  });

  await page.route(`${ENTERPRISE_API}/**`, async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/enterprise-provider-lifecycle-recovery')) {
      const body = request.postDataJSON() as Record<string, unknown>;
      recoveryPayloads.push(body);
      const key = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
      if (managedSecretPlans.delete(key)) {
        managedSecretCleanups += 1;
        terminalizedSecretPlans.add(key);
      }
      if (recoveryTransportFailures > 0) {
        recoveryTransportFailures -= 1;
        return route.abort('failed');
      }
      return route.fulfill({
        status: terminalizedSecretPlans.has(key) ? 200 : 403,
        headers,
        body: JSON.stringify(terminalizedSecretPlans.has(key)
          ? { ok: true, terminal: true }
          : { ok: false, error: { code: 'PERMISSION_DENIED' } }),
      });
    }
    if (pathname.endsWith('/enterprise-provider-lifecycle-authority')) {
      authorityRecheckPayloads.push(request.postDataJSON() as Record<string, unknown>);
      if (authorityRecheckTransportFailures > 0) {
        authorityRecheckTransportFailures -= 1;
        return route.abort('failed');
      }
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          authorized: !providerAuthorityRevoked,
          authorizationVersion: projection.authorizationVersion,
        }),
      });
    }
    if (pathname.endsWith('/enterprise-intelligence-query')) {
      if (projectionFailure) {
        const failures = {
          stale: { status: 409, code: 'AUTHORIZATION_STALE' },
          denied: { status: 403, code: 'TENANT_ACCESS_DENIED' },
          unavailable: { status: 503, code: 'ENTERPRISE_PROJECTION_UNAVAILABLE' },
        } as const;
        const failure = failures[projectionFailure];
        return route.fulfill({ status: failure.status, headers, body: JSON.stringify({ code: failure.code }) });
      }
      const body = request.postDataJSON() as { organizationId?: string; workspaceId?: string };
      queryWorkspaceIds.push(body.workspaceId || '');
      const selectedProjection = body.organizationId === projection.organizationId && body.workspaceId === projection.workspaceId
        ? projection
        : body.organizationId === secondaryProjection?.organizationId && body.workspaceId === secondaryProjection.workspaceId
          ? secondaryProjection
          : body.organizationId === alternateOrganizationProjection?.organizationId && body.workspaceId === alternateOrganizationProjection.workspaceId
            ? alternateOrganizationProjection
            : undefined;
      if (!selectedProjection) return route.fulfill({ status: 403, headers, body: JSON.stringify({ code: 'TENANT_ACCESS_DENIED' }) });
      selectedProjection.generatedAt = new Date(Date.parse(selectedProjection.generatedAt) + 1_000).toISOString();
      successfulProjectionResponses += 1;
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ projection: selectedProjection }) });
    }
    if (pathname.endsWith('/enterprise-intelligence-command') || pathname.endsWith('/enterprise-provider-lifecycle')) {
      const operation = operationFrom(request);
      if (!allowedOperations.has(operation)) {
        unexpectedRequests.push(`${request.method()} ${pathname} operation=${operation}`);
        return route.fulfill({ status: 404, headers, body: JSON.stringify({ code: 'FIXTURE_OPERATION_NOT_ALLOWED' }) });
      }
      const requestBody = request.postDataJSON() as Record<string, unknown>;
      const commandKey = typeof requestBody.idempotencyKey === 'string' ? requestBody.idempotencyKey : '';
      operations.push(operation);
      commandPayloads.push(requestBody);
      if (nextTransportFailure === operation) {
        nextTransportFailure = undefined;
        return route.abort('failed');
      }
      if (nextCommandFailure?.operation === operation) {
        const failure = nextCommandFailure;
        nextCommandFailure = undefined;
        return route.fulfill({ status: 409, headers, body: JSON.stringify({ ok: false, error: { code: failure.code } }) });
      }
      const activeDelay = delayedCommand?.operation === operation ? delayedCommand : undefined;
      if (activeDelay) {
        activeDelay.markObserved();
        await activeDelay.release;
      }
      if (nextProviderStale?.operation === operation) {
        const stale = nextProviderStale;
        nextProviderStale = undefined;
        const body = request.postDataJSON() as { idempotencyKey?: string };
        if (stale.managedWrite
          && (operation === 'provider.secret.bind' || operation === 'provider.secret.rotate')
          && body.idempotencyKey) {
          managedSecretPlans.add(body.idempotencyKey);
          managedSecretWrites += 1;
        }
        projection.authorizationVersion += 1;
        providerAuthorityRevoked = stale.revokeAuthority;
        return route.fulfill({ status: 409, headers, body: JSON.stringify({ ok: false, error: { code: 'AUTHORIZATION_STALE' } }) });
      }

      if (commandKey && committedCommandKeys.has(commandKey)) {
        if (shouldLoseCommittedResponse(operation)) return route.abort('failed');
        return route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({ ok: true, replay: true, status: 'committed' }),
        });
      }

      if (operation === 'provider.secret.bind' || operation === 'provider.secret.rotate') {
        const body = request.postDataJSON() as { idempotencyKey?: string };
        if (body.idempotencyKey && managedSecretPlans.delete(body.idempotencyKey)) {
          providerValidations += 1;
          providerEffects += 1;
        } else {
          managedSecretWrites += 1;
          providerValidations += 1;
          providerEffects += 1;
        }
      }

      if (operation === 'provider.validate' && projection.providers[0]) {
        projection.providers[0].validationState = 'validated';
        projection.providers[0].lastValidatedAt = '2026-08-04T09:00:00.000Z';
        projection.providers[0].routes.forEach(item => { item.availability = 'disabled'; });
      }
      if (operation === 'provider.activate' && projection.providers[0]) projection.providers[0].status = 'active';
      if (operation === 'provider.route.toggle' && projection.providers[0]) {
        const payload = request.postDataJSON() as { payload?: { enabled?: boolean } };
        const enabled = payload.payload?.enabled === true;
        projection.providers[0].routes.forEach(item => {
          item.enabled = enabled;
          item.availability = enabled ? 'ready' : 'disabled';
        });
      }
      if (operation === 'evidence.source.create') {
        projection.evidenceSources = [{
          id: IDS.source,
          displayName: 'Synthetic compressed evidence',
          mimeType: 'application/pdf',
          status: 'uploaded',
          versionLabel: 'Committed source version',
          extractedCharacterCount: 0,
          extractionState: 'pending',
          sourceBytesAnchored: true,
          extractedTextAnchored: false,
          createdAt: '2026-08-04T09:00:00.000Z',
        }];
      }
      if (operation === 'evidence.extract') {
        projection.evidenceSources[0].status = 'review';
        projection.evidenceSources[0].extractionState = 'ready';
        projection.evidenceSources[0].extractedCharacterCount = 56;
        projection.evidenceSources[0].extractedTextAnchored = true;
        projection.evidenceCandidates = [{
          id: IDS.candidate,
          sourceId: IDS.source,
          field: 'process_objective',
          value: 'Synthetic review objective',
          safeExcerpt: 'Synthetic review objective',
          sourceLocator: 'page 1',
          confidence: 0.91,
          status: 'suggested',
          promptVersionLabel: 'Governed extraction prompt',
          provenanceState: 'anchored',
          reviewState: 'pending',
        }];
      }
      if (operation === 'evidence.candidate.review' && projection.evidenceCandidates[0]) {
        projection.evidenceCandidates[0].status = 'accepted';
        projection.evidenceCandidates[0].reviewState = 'reviewed_by_you';
        projection.evidenceCandidates[0].reviewedAt = '2026-08-04T09:01:00.000Z';
        projection.assessPromotion = { ...projection.assessPromotion, state: 'ready', acceptedCandidateCount: 1, provenanceComplete: true };
      }
      if (operation === 'evidence.assess.promote') {
        projection.assessPromotion = { ...projection.assessPromotion, state: 'promoted', draftVersionLabel: 'Assess governed draft', idempotencyState: 'committed' };
      }
      if (operation === 'transcript.source-set.create-version') {
        const body = request.postDataJSON() as { payload?: { sourceSetId?: string; expectedVersion?: number; displayLabel?: string; description?: string; items?: Array<{ sourceVersionId: string; role: 'primary' | 'supporting' | 'contradictory' | 'reference'; ordinal: number; note?: string }> } };
        const members = body.payload?.items || [];
        const existingIndex = projection.transcriptFlow.sourceSets.findIndex(item => item.id === body.payload?.sourceSetId);
        const existing = existingIndex >= 0 ? projection.transcriptFlow.sourceSets[existingIndex] : undefined;
        if ((body.payload?.expectedVersion || 0) !== (existing?.version || 0)) {
          return route.fulfill({ status: 409, headers, body: JSON.stringify({ ok: false, error: { code: 'RESOURCE_STALE' } }) });
        }
        const nextSet: typeof projection.transcriptFlow.sourceSets[number] = {
          id: existing?.id || IDS.sourceSet,
          versionSelector: existing ? IDS.sourceSetVersionNext : IDS.sourceSetVersion,
          version: (existing?.version || 0) + 1,
          ownerModule: 'assess',
          label: body.payload?.displayLabel || 'Synthetic Assess interviews',
          description: body.payload?.description,
          versionLabel: `Source-set version ${(existing?.version || 0) + 1}`,
          status: 'locked',
          sourceCount: members.length,
          extractedCharacterCount: members.reduce((total, member) => total + (projection.transcriptFlow.sourceVersions.find(source => source.versionSelector === member.sourceVersionId)?.extractedCharacterCount || 0), 0),
          members: members.map(member => {
            const source = projection.transcriptFlow.sourceVersions.find(item => item.versionSelector === member.sourceVersionId)!;
            return { sourceId: source.sourceId, versionSelector: member.sourceVersionId, role: member.role, ordinal: member.ordinal, ...(member.note ? { note: member.note } : {}), displayName: source.displayName, versionLabel: source.versionLabel, extractedCharacterCount: source.extractedCharacterCount, state: 'ready' as const };
          }),
          lockState: 'locked',
          blockers: [],
          updatedAt: '2026-08-04T09:01:00.000Z',
        };
        projection.transcriptFlow.sourceSets = existing
          ? projection.transcriptFlow.sourceSets.map((item, index) => index === existingIndex ? nextSet : item)
          : [...projection.transcriptFlow.sourceSets, nextSet];
        if (existing) {
          projection.transcriptFlow.inputBundles = projection.transcriptFlow.inputBundles.map(bundle => bundle.sourceSetIds.includes(existing.id)
            ? { ...bundle, status: 'superseded' as const }
            : bundle);
        }
        projection.transcriptFlow.sourceVersions.forEach(source => { source.reuseState = 'already_selected_elsewhere'; });
      }
      if (operation === 'transcript.input-bundle.lock') {
        const body = request.postDataJSON() as { payload?: { sourceSets?: Array<{ sourceSetVersionId: string }> } };
        const selectedSourceSets = (body.payload?.sourceSets || []).flatMap(item => {
          const sourceSet = projection.transcriptFlow.sourceSets.find(candidate => candidate.versionSelector === item.sourceSetVersionId);
          return sourceSet ? [sourceSet] : [];
        });
        if (!selectedSourceSets.length || selectedSourceSets.length !== body.payload?.sourceSets?.length) {
          return route.fulfill({ status: 409, headers, body: JSON.stringify({ ok: false, error: { code: 'RESOURCE_STALE' } }) });
        }
        projection.transcriptFlow.inputBundles = [{
          id: IDS.inputBundle,
          versionSelector: IDS.inputBundleVersion,
          version: 1,
          ownerModule: 'assess',
          label: 'Assess transcript bundle',
          versionLabel: 'Input-bundle version 1',
          status: 'locked',
          sourceSetIds: selectedSourceSets.map(sourceSet => sourceSet.id),
          sourceSetVersions: selectedSourceSets.map((sourceSet, index) => ({ sourceSetId: sourceSet.id, sourceSetVersionSelector: sourceSet.versionSelector, sourceSetVersion: sourceSet.version, ordinal: index + 1 })),
          sourceVersionSelectors: selectedSourceSets.flatMap(sourceSet => sourceSet.members.map(member => member.versionSelector)),
          sourceCount: selectedSourceSets.reduce((total, item) => total + item.sourceCount, 0),
          extractedCharacterCount: selectedSourceSets.reduce((total, item) => total + item.extractedCharacterCount, 0),
          lockedAt: '2026-08-04T09:02:00.000Z',
        }];
      }
      if (operation === 'transcript.journey.set-state') {
        const body = request.postDataJSON() as { payload?: { desiredExitModule?: 'assess' | 'studio' | 'delivery' | 'monitor'; status?: 'active' | 'stopped' } };
        projection.transcriptFlow.journeys = [{
          id: IDS.journey,
          entryModule: 'assess',
          desiredExitModule: body.payload?.desiredExitModule || 'assess',
          currentModule: 'assess',
          lineage: 'assessed',
          planningOnly: false,
          status: body.payload?.status || 'active',
          version: (projection.transcriptFlow.journeys[0]?.version || 0) + 1,
          updatedAt: '2026-08-04T09:03:00.000Z',
        }];
      }
      if (operation === 'transcript.assess.extract') {
        const body = request.postDataJSON() as { payload?: { inputBundleId?: string; inputBundleVersionSelector?: string; sourceSetId?: string; sourceSetVersionSelector?: string; expectedSourceSetVersion?: number; sourceVersionSelector?: string } };
        const exactRun = projection.transcriptFlow.assessRuns.find(run => run.inputBundleId === body.payload?.inputBundleId
          && run.inputBundleVersionSelector === body.payload?.inputBundleVersionSelector);
        const exactBinding = exactRun?.extractionBindings.find(binding => binding.sourceSetId === body.payload?.sourceSetId
          && binding.sourceSetVersionSelector === body.payload?.sourceSetVersionSelector
          && binding.sourceSetVersion === body.payload?.expectedSourceSetVersion
          && binding.sourceVersionSelector === body.payload?.sourceVersionSelector);
        if (!exactRun || !exactBinding) return route.fulfill({ status: 409, headers, body: JSON.stringify({ ok: false, error: { code: 'RESOURCE_STALE' } }) });
      }
      if (operation === 'transcript.assess.candidate.review') {
        const body = request.postDataJSON() as { payload?: { candidateId?: string; candidateVersion?: number; inputBundleId?: string; inputBundleVersionSelector?: string; sourceSetId?: string; sourceSetVersionSelector?: string; expectedSourceSetVersion?: number; sourceVersionSelector?: string; status?: 'accepted' | 'rejected' | 'edited'; value?: string; relationship?: 'neutral' | 'supporting' | 'contradictory' } };
        const candidate = projection.transcriptFlow.assessCandidates.find(item => item.id === body.payload?.candidateId);
        if (!candidate || candidate.candidateVersion !== body.payload?.candidateVersion
          || candidate.inputBundleId !== body.payload?.inputBundleId || candidate.inputBundleVersionSelector !== body.payload?.inputBundleVersionSelector
          || candidate.sourceSetId !== body.payload?.sourceSetId || candidate.sourceSetVersionSelector !== body.payload?.sourceSetVersionSelector
          || candidate.sourceSetVersion !== body.payload?.expectedSourceSetVersion || candidate.sourceVersionSelector !== body.payload?.sourceVersionSelector) {
          return route.fulfill({ status: 409, headers, body: JSON.stringify({ ok: false, error: { code: 'RESOURCE_STALE' } }) });
        }
        if (candidate && body.payload?.status) {
          candidate.status = body.payload.status;
          candidate.reviewState = 'reviewed_by_you';
          candidate.reviewedAt = '2026-08-04T09:05:00.000Z';
          if (body.payload.value) { candidate.value = body.payload.value; candidate.editCount += 1; candidate.candidateVersion += 1; }
          if (body.payload.relationship) candidate.relationship = body.payload.relationship;
        }
      }
      if (operation === 'transcript.assess.apply.preview') {
        const body = request.postDataJSON() as { payload?: { assessDraftId?: string; expectedDraftVersion?: number; inputBundleId?: string; inputBundleVersionSelector?: string; expectedInputBundleVersion?: number; sourceSetVersions?: Array<{ sourceSetId: string; sourceSetVersionSelector: string; expectedVersion: number; ordinal: number }>; selections?: Array<{ candidateId: string; intent: 'set_case_field'; target: string }> } };
        const bundle = projection.transcriptFlow.inputBundles.find(item => item.id === body.payload?.inputBundleId
          && item.versionSelector === body.payload?.inputBundleVersionSelector && item.version === body.payload?.expectedInputBundleVersion);
        const submittedLineage = body.payload?.sourceSetVersions || [];
        if (!bundle || JSON.stringify(submittedLineage) !== JSON.stringify(bundle.sourceSetVersions.map(lineage => ({
          sourceSetId: lineage.sourceSetId, sourceSetVersionSelector: lineage.sourceSetVersionSelector,
          expectedVersion: lineage.sourceSetVersion, ordinal: lineage.ordinal,
        })))) return route.fulfill({ status: 409, headers, body: JSON.stringify({ ok: false, error: { code: 'RESOURCE_STALE' } }) });
        const selections = body.payload?.selections || [];
        const conflict = {
          id: IDS.conflict, field: 'case.process_objective', candidateIds: selections.map(selection => selection.candidateId),
          candidateSummaries: selections.map(selection => projection.transcriptFlow.assessCandidates.find(candidate => candidate.id === selection.candidateId)?.value || 'Selected candidate'),
          manualValue: 'Preserve the manually authored objective', material: true, resolution: 'unresolved' as const, resolutionVersion: 1,
        };
        projection.transcriptFlow.assessConflicts = [conflict];
        projection.transcriptFlow.assessApplyPreviews = [{
          id: IDS.applyPreview, previewIds: [IDS.applyPreview], assessDraftId: body.payload?.assessDraftId || IDS.assessDraft,
          inputBundleId: body.payload?.inputBundleId || IDS.inputBundle,
          inputBundleVersionSelector: body.payload?.inputBundleVersionSelector || IDS.inputBundleVersion,
          inputBundleVersion: body.payload?.expectedInputBundleVersion || 1,
          sourceSetVersionSelectors: body.payload?.sourceSetVersions?.map(item => item.sourceSetVersionSelector) || [IDS.sourceSetVersion],
          expectedDraftVersion: body.payload?.expectedDraftVersion || 1,
          candidateIds: selections.map(selection => selection.candidateId),
          changes: selections.map(selection => ({ candidateId: selection.candidateId, intent: selection.intent, target: selection.target, summary: projection.transcriptFlow.assessCandidates.find(candidate => candidate.id === selection.candidateId)?.value || 'Selected candidate', conflictState: 'manual_conflict' as const })),
          conflicts: [conflict], status: 'ready', expiresAt: '2026-08-04T10:00:00.000Z',
        }];
      }
      if (operation === 'transcript.assess.conflict.resolve') {
        const body = request.postDataJSON() as { payload?: { resolution?: 'choose_candidate' | 'retain_manual' | 'authored_resolution'; authoredValue?: string; rationale?: string } };
        const conflict = projection.transcriptFlow.assessConflicts[0];
        if (conflict && body.payload?.resolution) {
          conflict.resolution = body.payload.resolution;
          conflict.resolvedValue = body.payload.authoredValue || (body.payload.resolution === 'retain_manual' ? conflict.manualValue : conflict.candidateSummaries[0]);
          conflict.rationale = body.payload.rationale;
          conflict.resolutionVersion += 1;
          if (projection.transcriptFlow.assessApplyPreviews[0]) projection.transcriptFlow.assessApplyPreviews[0].conflicts = [{ ...conflict }];
        }
      }
      if (operation === 'transcript.assess.apply.commit') {
        const body = request.postDataJSON() as { payload?: { previewBatchId?: string; inputBundleId?: string; inputBundleVersionSelector?: string; expectedInputBundleVersion?: number; sourceSetVersions?: Array<{ sourceSetId: string; sourceSetVersionSelector: string; expectedVersion: number; ordinal: number }> } };
        const preview = projection.transcriptFlow.assessApplyPreviews.find(item => item.id === body.payload?.previewBatchId);
        const bundle = projection.transcriptFlow.inputBundles.find(item => item.id === body.payload?.inputBundleId
          && item.versionSelector === body.payload?.inputBundleVersionSelector && item.version === body.payload?.expectedInputBundleVersion);
        const expectedLineage = bundle?.sourceSetVersions.map(lineage => ({ sourceSetId: lineage.sourceSetId, sourceSetVersionSelector: lineage.sourceSetVersionSelector, expectedVersion: lineage.sourceSetVersion, ordinal: lineage.ordinal })) || [];
        if (!preview || !bundle || JSON.stringify(body.payload?.sourceSetVersions || []) !== JSON.stringify(expectedLineage)) {
          return route.fulfill({ status: 409, headers, body: JSON.stringify({ ok: false, error: { code: 'RESOURCE_STALE' } }) });
        }
        if (projection.transcriptFlow.assessApplyPreviews[0]) projection.transcriptFlow.assessApplyPreviews[0].status = 'applied';
        projection.assessDrafts[0].versionLabel = 'Draft version 2';
      }
      if (operation === 'assemble.blueprint.create') {
        projection.blueprints = [{
          id: IDS.blueprint,
          name: 'Synthetic governed blueprint',
          status: 'draft',
          versionLabel: 'Draft blueprint version',
          disposition: 'assemble',
          components: [{ type: 'Forms', name: 'Synthetic intake form', enabled: true }, { type: 'Agent Tools', name: 'Agent Tools', enabled: false }],
          safety: { codeGeneration: false, deployment: false, infrastructureChanges: false, credentialAccess: false, sourceSystemCalls: false, runtimeAgents: false },
          createdByCurrentActor: true,
        }];
      }
      if (operation === 'delivery.package.create.manual' && projection.deliveryWorkspace) {
        const body = request.postDataJSON() as { payload?: { manualBrief?: string; items?: Array<{ itemType?: string; title?: string; description?: string; acceptanceCriteria?: string[]; nonFunctionalRequirements?: string[] }> } };
        const authored = body.payload?.items?.[0];
        const deliveryWorkspace = projection.deliveryWorkspace as unknown as Record<string, unknown>;
        const packages = deliveryWorkspace.packages as Array<Record<string, unknown>>;
        const templatePackage = structuredClone(packages[0]);
        const templateItem = structuredClone((templatePackage.items as Array<Record<string, unknown>>)[0]);
        const manualPackage: Record<string, unknown> = {
          ...templatePackage,
          id: IDS.deliveryManualPackage,
          currentVersionId: IDS.deliveryManualPackageVersion,
          currentVersion: 1,
          aggregateVersion: 1,
          status: 'draft',
          sourcePackage: { version: 1, sourceMode: 'manual', lineageClassification: 'not_assessed', planningOnly: true },
          items: [{
            ...templateItem,
            itemAggregateId: IDS.deliveryManualItem,
            itemVersionId: IDS.deliveryManualItemVersion,
            aggregateVersion: 1,
            version: 1,
            status: 'proposed',
            itemType: authored?.itemType || 'Task',
            title: authored?.title || 'Manual planning item',
            description: authored?.description || 'Manual planning description',
            acceptanceCriteria: authored?.acceptanceCriteria || [],
            nonFunctionalRequirements: authored?.nonFunctionalRequirements || [],
            sourceCitation: undefined,
            decision: undefined,
            rationale: undefined,
            history: [{
              version: 1,
              status: 'proposed',
              itemType: authored?.itemType || 'Task',
              title: authored?.title || 'Manual planning item',
              description: authored?.description || 'Manual planning description',
              acceptanceCriteria: authored?.acceptanceCriteria || [],
              nonFunctionalRequirements: authored?.nonFunctionalRequirements || [],
              createdAt: '2026-08-31T06:40:00.000Z',
            }],
          }],
          itemPage: { limit: 50, hasMore: false, cursorApplied: false, isComplete: true },
          acceptedItemCount: null,
          historyPage: { limit: 50, reviewHasMore: false, approvalHasMore: false },
          blockers: ['1 work item decision unresolved.'],
          blockerCount: 1,
          reviewHistory: [],
          approvalHistory: [],
          actions: ['delivery.item.review', 'delivery.package.revision.commit'],
        };
        deliveryWorkspace.packages = [...packages.filter(item => item.id !== IDS.deliveryManualPackage), manualPackage];
      }
      projection.commandActivity = [{ commandType: operation, status: 'committed', completedAt: '2026-08-04T09:01:00.000Z', idempotencyState: 'committed' }];
      if (commandKey) committedCommandKeys.add(commandKey);
      domainEffectCounts.set(operation, (domainEffectCounts.get(operation) || 0) + 1);
      if (postCommitOutcomeUnknown?.operation === operation) {
        const failure = postCommitOutcomeUnknown;
        postCommitOutcomeUnknown = undefined;
        return route.fulfill({ status: 503, headers, body: JSON.stringify({ ok: false, error: { code: failure.code } }) });
      }
      if (shouldLoseCommittedResponse(operation)) {
        return route.abort('failed');
      }
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          sourceId: IDS.source,
          sourceVersionId: IDS.sourceVersion,
          decisionId: IDS.decision,
          workPackageId: IDS.packageDraft,
          packageVersionId: IDS.packageDraft,
          candidates: projection.evidenceCandidates,
          status: 'committed',
        }),
      });
      if (activeDelay) {
        activeDelay.markSettled();
        if (delayedCommand === activeDelay) delayedCommand = undefined;
      }
      return;
    }
    unexpectedRequests.push(`${request.method()} ${pathname}`);
    return route.fulfill({ status: 404, headers, body: JSON.stringify({ code: 'FIXTURE_ROUTE_NOT_FOUND' }) });
  });

  const bundleLineage = (bundleIds: string[], candidateIds: string[], previewBatchIds: string[] = [], includeDraft = false): EvidenceLineage => {
    const bundles = projection.transcriptFlow.inputBundles.filter(bundle => bundleIds.includes(bundle.id));
    const runs = projection.transcriptFlow.assessRuns.filter(run => bundleIds.includes(run.inputBundleId));
    const candidates = projection.transcriptFlow.assessCandidates.filter(candidate => candidateIds.includes(candidate.id));
    const sourceSets = bundles.flatMap(bundle => bundle.sourceSetVersions.map(item => ({
      id: item.sourceSetId, version: item.sourceSetVersion, versionSelector: item.sourceSetVersionSelector,
    })));
    const draftVersionLabel = projection.assessDrafts.find(draft => draft.id === IDS.assessDraft)?.versionLabel || '';
    const draftVersion = Number(draftVersionLabel.match(/(\d+)$/u)?.[1] || 1);
    return {
      sourceVersionSelectors: sortedUnique([
        ...bundles.flatMap(bundle => bundle.sourceVersionSelectors),
        ...runs.flatMap(run => run.sourceVersionSelectors),
        ...candidates.map(candidate => candidate.sourceVersionSelector),
      ]),
      sourceSets: [...new Map(sourceSets.map(item => [`${item.id}|${item.versionSelector}`, item])).values()]
        .sort((left, right) => left.id.localeCompare(right.id)),
      inputBundles: bundles.map(bundle => ({ id: bundle.id, version: bundle.version, versionSelector: bundle.versionSelector }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      extractionJobIds: sortedUnique(runs.flatMap(run => run.extractionJobIds)),
      extractionBindingIds: sortedUnique(runs.flatMap(run => run.extractionBindingIds)),
      candidates: candidates.map(candidate => ({ id: candidate.id, version: candidate.candidateVersion }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      previewBatchIds: sortedUnique(previewBatchIds),
      assessDrafts: includeDraft ? [{ id: IDS.assessDraft, version: draftVersion }] : [],
    };
  };

  const runtimeEvidenceLineage = (assertion: string): EvidenceLineage => {
    if (assertion === 'default-off-boundary') return emptyEvidenceLineage();
    if (assertion === 'source-set-version-concurrency') {
      const requests = commandPayloads.filter(body => body.commandType === 'transcript.source-set.create-version') as Array<{
        payload?: { sourceSetId?: string; items?: Array<{ sourceVersionId?: string }> };
      }>;
      const sourceSetIds = sortedUnique(requests.flatMap(body => body.payload?.sourceSetId ? [body.payload.sourceSetId] : []));
      const sourceSets = projection.transcriptFlow.sourceSets.filter(item => sourceSetIds.includes(item.id));
      return {
        ...emptyEvidenceLineage(),
        sourceVersionSelectors: sortedUnique(requests.flatMap(body => body.payload?.items?.flatMap(item => item.sourceVersionId ? [item.sourceVersionId] : []) || [])),
        sourceSets: sourceSets.map(item => ({ id: item.id, version: item.version, versionSelector: item.versionSelector })),
      };
    }

    const transcriptCommands = commandPayloads.filter(body => String(body.commandType || '').startsWith('transcript.')) as Array<{
      commandType?: string;
      payload?: { inputBundleId?: string; candidateId?: string; previewBatchId?: string; selections?: Array<{ candidateId?: string }> };
    }>;
    if (assertion === 'exact-lineage-conflict-replay') {
      const bundleIds = sortedUnique(transcriptCommands.flatMap(body => body.payload?.inputBundleId ? [body.payload.inputBundleId] : []));
      const candidateIds = sortedUnique(transcriptCommands.flatMap(body => [
        ...(body.payload?.candidateId ? [body.payload.candidateId] : []),
        ...(body.payload?.selections?.flatMap(item => item.candidateId ? [item.candidateId] : []) || []),
      ]));
      const previewIds = sortedUnique(transcriptCommands.flatMap(body => body.payload?.previewBatchId ? [body.payload.previewBatchId] : []));
      return bundleLineage(bundleIds, candidateIds, previewIds, true);
    }
    if (assertion === 'stale-and-authority-loss') {
      const candidateIds = sortedUnique(transcriptCommands.flatMap(body => body.payload?.candidateId ? [body.payload.candidateId] : []));
      const bundleIds = sortedUnique(projection.transcriptFlow.assessCandidates
        .filter(candidate => candidateIds.includes(candidate.id)).map(candidate => candidate.inputBundleId));
      return bundleLineage(bundleIds, candidateIds);
    }
    if (assertion === 'bounded-candidate-filter') {
      const candidateIds = projection.transcriptFlow.assessCandidates.map(candidate => candidate.id);
      const bundleIds = sortedUnique(projection.transcriptFlow.assessCandidates.map(candidate => candidate.inputBundleId));
      return bundleLineage(bundleIds, candidateIds);
    }
    if (assertion === 'current-root-substitution-rejected') {
      const bundleIds = sortedUnique([...evidenceTouchedBundleIds]);
      const candidates = projection.transcriptFlow.assessCandidates.filter(candidate => bundleIds.includes(candidate.inputBundleId));
      const lineage = bundleLineage(bundleIds, candidates.map(candidate => candidate.id));
      const substitutedSets = candidates.filter(candidate => evidenceTouchedSourceSetIds.has(candidate.sourceSetId)).map(candidate => ({
        id: candidate.sourceSetId, version: candidate.sourceSetVersion, versionSelector: candidate.sourceSetVersionSelector,
      }));
      lineage.sourceSets = [...new Map(substitutedSets.map(item => [`${item.id}|${item.versionSelector}`, item])).values()];
      return lineage;
    }
    throw new Error(`BROWSER_EVIDENCE_ASSERTION_UNKNOWN:${assertion}`);
  };

  return {
    operations,
    commandPayloads,
    authorityRecheckPayloads,
    recoveryPayloads,
    unexpectedRequests,
    failNext(operation: string, code: string) { nextCommandFailure = { operation, code }; },
    transportFailNext(operation: string) { nextTransportFailure = operation; },
    loseResponseAfterCommitNext(operation: string) { responseLossAfterCommit = { operation, remaining: 1 }; },
    loseResponsesAfterCommitNext(operation: string, count = 2) {
      if (!Number.isSafeInteger(count) || count < 1) throw new Error('FIXTURE_RESPONSE_LOSS_COUNT_INVALID');
      responseLossAfterCommit = { operation, remaining: count };
    },
    reportPostCommitOutcomeUnknownNext(operation: string, code: 'COMMAND_OUTCOME_UNKNOWN' | 'RECEIPT_FINALIZATION_FAILED' = 'COMMAND_OUTCOME_UNKNOWN') {
      postCommitOutcomeUnknown = { operation, code };
    },
    delayNext(operation: string) {
      if (delayedCommand) throw new Error('FIXTURE_DELAY_ALREADY_ACTIVE');
      const observed = deferred();
      const release = deferred();
      const settled = deferred();
      delayedCommand = { operation, observed: observed.promise, markObserved: observed.resolve, release: release.promise, releaseNow: release.resolve, settled: settled.promise, markSettled: settled.resolve };
    },
    waitForDelayedCommand(operation: string) {
      if (delayedCommand?.operation !== operation) throw new Error('FIXTURE_DELAY_NOT_ACTIVE');
      return delayedCommand.observed;
    },
    releaseDelayedCommand(operation: string) {
      if (delayedCommand?.operation !== operation) throw new Error('FIXTURE_DELAY_NOT_ACTIVE');
      delayedCommand.releaseNow();
    },
    waitForDelayedCommandCompletion(operation: string) {
      if (delayedCommand?.operation !== operation) throw new Error('FIXTURE_DELAY_NOT_ACTIVE');
      return delayedCommand.settled;
    },
    staleProviderAfterManagedWriteNext(operation: 'provider.secret.bind' | 'provider.secret.rotate') {
      nextProviderStale = { operation, revokeAuthority: false, managedWrite: true };
    },
    revokeProviderAuthorityOnStaleNext(operation: string) {
      nextProviderStale = { operation, revokeAuthority: true, managedWrite: true };
    },
    revokeProviderAuthorityBeforeReceiptNext(operation: 'provider.secret.bind' | 'provider.secret.rotate') {
      nextProviderStale = { operation, revokeAuthority: true, managedWrite: false };
    },
    transportFailProviderAuthorityRecheckNext(count = 1) {
      authorityRecheckTransportFailures = count;
    },
    transportFailProviderRecoveryNext(count = 1) {
      recoveryTransportFailures = count;
    },
    restoreProviderAuthority() { providerAuthorityRevoked = false; },
    providerRecoveryCounts() {
      return {
        managedSecretWrites,
        managedSecretCleanups,
        providerValidations,
        providerEffects,
        strandedManagedSecrets: managedSecretPlans.size,
        claimedReceipts: managedSecretPlans.size,
      };
    },
    domainEffectCount(operation: string) { return domainEffectCounts.get(operation) || 0; },
    queryWorkspaceIds() { return [...queryWorkspaceIds]; },
    manualPackageCount() {
      const packages = (projection.deliveryWorkspace as unknown as { packages?: Array<{ sourcePackage?: { sourceMode?: string } }> } | undefined)?.packages || [];
      return packages.filter(item => item.sourcePackage?.sourceMode === 'manual').length;
    },
    runtimeEvidenceContext(assertion: string, fixtureId: string) {
      if (successfulProjectionResponses === 0) throw new Error(`BROWSER_EVIDENCE_WITHOUT_PROJECTION:${assertion}`);
      return {
        persona: { id: IDS.actor, state: 'active' as const, capabilities: [...projection.capabilities].sort() },
        organizationId: projection.organizationId,
        workspaceId: projection.workspaceId,
        fixtureIds: [fixtureId],
        lineage: runtimeEvidenceLineage(assertion),
      };
    },
    setProjectionFailure(failure?: ProjectionFailure) { projectionFailure = failure; },
    staleBundle(bundleId: string) {
      evidenceTouchedBundleIds.add(bundleId);
      projection.transcriptFlow.inputBundles = projection.transcriptFlow.inputBundles.map(bundle => bundle.id === bundleId
        ? { ...bundle, status: 'superseded' as const }
        : bundle);
    },
    advanceCurrentSourceSetWithoutStalingBundle(sourceSetId: string) {
      evidenceTouchedSourceSetIds.add(sourceSetId);
      projection.transcriptFlow.sourceSets = projection.transcriptFlow.sourceSets.map(sourceSet => sourceSet.id === sourceSetId
        ? { ...sourceSet, versionSelector: IDS.sourceSetVersionNext, version: sourceSet.version + 1, versionLabel: `Source-set version ${sourceSet.version + 1}`, updatedAt: '2026-08-04T09:30:00.000Z' }
        : sourceSet);
    },
    driftExactBindingToCurrentSourceSet(bundleId: string) {
      evidenceTouchedBundleIds.add(bundleId);
      const bundle = projection.transcriptFlow.inputBundles.find(item => item.id === bundleId);
      const currentSourceSet = projection.transcriptFlow.sourceSets.find(item => bundle?.sourceSetIds.includes(item.id));
      if (!bundle || !currentSourceSet) return;
      projection.transcriptFlow.assessCandidates = projection.transcriptFlow.assessCandidates.map(candidate => candidate.inputBundleId === bundleId
        ? { ...candidate, sourceSetId: currentSourceSet.id, sourceSetVersionSelector: currentSourceSet.versionSelector, sourceSetVersion: currentSourceSet.version }
        : candidate);
      projection.transcriptFlow.assessRuns = projection.transcriptFlow.assessRuns.map(run => run.inputBundleId === bundleId
        ? { ...run, extractionBindings: run.extractionBindings.map(binding => ({
          ...binding, sourceSetId: currentSourceSet.id, sourceSetVersionSelector: currentSourceSet.versionSelector, sourceSetVersion: currentSourceSet.version,
        })) }
        : run);
    },
    revokeTranscriptAuthority() {
      projection.authorizationVersion += 1;
      projection.transcriptFlow.features = {
        sourceSetsEnabled: false,
        assessMultisourceApplyEnabled: false,
        disabledReason: 'Transcript authority is no longer available for this workspace.',
      };
    },
    advanceAssessDraft() { projection.assessDrafts[0].versionLabel = 'Draft version 2'; },
    recoverProjection() { projectionFailure = undefined; },
  };
};
