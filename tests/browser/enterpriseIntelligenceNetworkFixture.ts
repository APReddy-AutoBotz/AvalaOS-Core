import type { Page, Request } from '@playwright/test';
import type { EnterpriseIntelligenceProjection } from '../../services/enterpriseIntelligence';

export const ENTERPRISE_API = 'http://127.0.0.1:59999';
export const IDS = {
  actor: '10000000-0000-4000-8000-000000000001',
  organization: '20000000-0000-4000-8000-000000000002',
  workspace: '30000000-0000-4000-8000-000000000003',
  provider: '40000000-0000-4000-8000-000000000004',
  route: '50000000-0000-4000-8000-000000000005',
  routeRole: '51000000-0000-4000-8000-000000000015',
  source: '60000000-0000-4000-8000-000000000006',
  sourceVersion: '70000000-0000-4000-8000-000000000007',
  candidate: '80000000-0000-4000-8000-000000000008',
  assessDraft: '81000000-0000-4000-8000-000000000018',
  application: '90000000-0000-4000-8000-000000000009',
  studio: 'b0000000-0000-4000-8000-00000000000b',
  package: 'd0000000-0000-4000-8000-00000000000d',
  packageDraft: 'd1000000-0000-4000-8000-00000000001d',
  monitor: 'f0000000-0000-4000-8000-00000000000f',
  decision: '12000000-0000-4000-8000-000000000012',
  blueprint: '13000000-0000-4000-8000-000000000013',
} as const;

type ProjectionFailure = 'stale' | 'denied' | 'unavailable';
type FixtureOptions = {
  noByok?: boolean;
  providerUnavailable?: boolean;
  projectionFailure?: ProjectionFailure;
};

const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
  'cache-control': 'no-store',
  'content-type': 'application/json',
};

const baseProjection = (options: FixtureOptions): EnterpriseIntelligenceProjection => ({
  schemaVersion: 'enterprise-intelligence-projection-1',
  organizationId: IDS.organization,
  workspaceId: IDS.workspace,
  authorizationVersion: 9,
  generatedAt: '2026-08-04T09:00:00.000Z',
  capabilities: [
    'approvals.review', 'assemble.manage', 'byok.manage', 'evidence.review', 'evidence.write',
    'monitor.manage', 'monitor.read', 'portfolio.manage', 'project.manage', 'project.read',
    'security.manage', 'studio.artifacts.read',
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
    versionLabel: 'Editable draft version',
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
  const operations: string[] = [];
  const commandPayloads: Array<Record<string, unknown>> = [];
  const authorityRecheckPayloads: Array<Record<string, unknown>> = [];
  const recoveryPayloads: Array<Record<string, unknown>> = [];
  const unexpectedRequests: string[] = [];
  let projectionFailure = options.projectionFailure;
  let nextCommandFailure: { operation: string; code: string } | undefined;
  let nextTransportFailure: string | undefined;
  let nextProviderStale: { operation: string; revokeAuthority: boolean } | undefined;
  let providerAuthorityRevoked = false;
  let authorityRecheckTransportFailures = 0;
  let recoveryTransportFailures = 0;
  const managedSecretPlans = new Set<string>();
  const terminalizedSecretPlans = new Set<string>();
  let managedSecretWrites = 0;
  let managedSecretCleanups = 0;
  let providerValidations = 0;
  let providerEffects = 0;

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
        status: terminalizedSecretPlans.has(key) ? 200 : 503,
        headers,
        body: JSON.stringify(terminalizedSecretPlans.has(key)
          ? { ok: true, terminal: true }
          : { ok: false, error: { code: 'COMMAND_IN_PROGRESS' } }),
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
      projection.generatedAt = new Date(Date.parse(projection.generatedAt) + 1_000).toISOString();
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ projection }) });
    }
    if (pathname.endsWith('/enterprise-intelligence-command') || pathname.endsWith('/enterprise-provider-lifecycle')) {
      const operation = operationFrom(request);
      operations.push(operation);
      commandPayloads.push(request.postDataJSON() as Record<string, unknown>);
      if (nextTransportFailure === operation) {
        nextTransportFailure = undefined;
        return route.abort('failed');
      }
      if (nextCommandFailure?.operation === operation) {
        const failure = nextCommandFailure;
        nextCommandFailure = undefined;
        return route.fulfill({ status: 409, headers, body: JSON.stringify({ ok: false, error: { code: failure.code } }) });
      }
      if (nextProviderStale?.operation === operation) {
        const stale = nextProviderStale;
        nextProviderStale = undefined;
        const body = request.postDataJSON() as { idempotencyKey?: string };
        if ((operation === 'provider.secret.bind' || operation === 'provider.secret.rotate') && body.idempotencyKey) {
          managedSecretPlans.add(body.idempotencyKey);
          managedSecretWrites += 1;
        }
        projection.authorizationVersion += 1;
        providerAuthorityRevoked = stale.revokeAuthority;
        return route.fulfill({ status: 409, headers, body: JSON.stringify({ ok: false, error: { code: 'AUTHORIZATION_STALE' } }) });
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
      if (operation === 'studio.delivery.handoff') {
        projection.studioDocuments[0].handoffState = 'already_handed_off';
        projection.deliveryPackages = [...projection.deliveryPackages, {
          id: IDS.packageDraft,
          label: 'New synthetic Delivery draft',
          status: 'draft',
          currentVersionLabel: 'Committed package version',
          sourceLabel: 'Approved synthetic requirements',
          lineageState: 'complete',
          items: [{ itemType: 'Epic', title: 'Governed intake', acceptanceCriteriaCount: 1, sourceLocator: 'requirements section 1' }],
          createdByCurrentActor: true,
        }];
      }
      if (operation === 'monitor.baseline.create') {
        projection.monitorBaselines = [{
          id: IDS.monitor,
          label: 'Synthetic read-only baseline',
          workPackageId: IDS.package,
          status: 'approval_required',
          readiness: 'review_required',
          approvedItemCount: 1,
          lineageComplete: true,
          liveTelemetryConnected: false,
          createdByCurrentActor: true,
        }];
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
      projection.commandActivity = [{ commandType: operation, status: 'committed', completedAt: '2026-08-04T09:01:00.000Z', idempotencyState: 'committed' }];
      return route.fulfill({
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
    }
    return route.fulfill({ status: 404, headers, body: JSON.stringify({ code: 'FIXTURE_ROUTE_NOT_FOUND' }) });
  });

  return {
    operations,
    commandPayloads,
    authorityRecheckPayloads,
    recoveryPayloads,
    unexpectedRequests,
    failNext(operation: string, code: string) { nextCommandFailure = { operation, code }; },
    transportFailNext(operation: string) { nextTransportFailure = operation; },
    staleProviderAfterManagedWriteNext(operation: 'provider.secret.bind' | 'provider.secret.rotate') {
      nextProviderStale = { operation, revokeAuthority: false };
    },
    revokeProviderAuthorityOnStaleNext(operation: string) {
      nextProviderStale = { operation, revokeAuthority: true };
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
    recoverProjection() { projectionFailure = undefined; },
  };
};
