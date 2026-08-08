import '../../../index.css';
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TrustCenterPanel from '../../../components/admin/TrustCenterPanel';
import { TrustAssuranceConnectedWorkspace } from '../../../components/admin/trust-assurance/TrustAssuranceConnectedWorkspace';
import type { BuyerSafeProjection, InternalAssuranceProjection, TrustCommandRequest, TrustQueryView } from '../../../services/trustAssurance/contracts';
import type { TenantContextProjection } from '../../../types';

const params = new URLSearchParams(location.search);
const matrix = params.has('tenant-context');
const responseLoss = params.has('response-loss');
const featureDisabled = params.has('feature-disabled');
const featureMismatch = params.has('feature-mismatch');
const evidenceHistory = params.has('evidence-history');
const evidenceWithdrawn = params.has('evidence-withdrawn');
const snapshotMixed = params.has('snapshot-mixed');
const multipleClaims = params.has('multiple-claims');
const contextA: TenantContextProjection = {
  userId: '10000000-0000-4000-8000-000000000001',
  organizationId: '20000000-0000-4000-8000-000000000002',
  organizationName: 'Fixture',
  workspaceId: '30000000-0000-4000-8000-000000000003',
  workspaceName: 'Workspace A',
  authorizationVersion: 2,
  capabilities: ['trust.read', 'trust.manage', 'trust.review', 'trust.publish'],
};
const contextB: TenantContextProjection = {
  ...contextA,
  workspaceId: '30000000-0000-4000-8000-000000000013',
  workspaceName: 'Workspace B',
  authorizationVersion: 3,
};
const deniedA: TenantContextProjection = { ...contextA, capabilities: ['assess.read'] };

const projectionFor = (context: TenantContextProjection, published: boolean): InternalAssuranceProjection => ({
  mode: 'server_authoritative',
  organizationId: context.organizationId,
  workspaceId: context.workspaceId,
  authorizationVersion: context.authorizationVersion,
  readOnly: params.has('readonly') || featureDisabled,
  claims: [{
    claimVersionId: '40000000-0000-4000-8000-000000000004', claimId: '50000000-0000-4000-8000-000000000005', version: 1,
    readinessDomain: 'security', claimText: `${context.workspaceName} assurance`, buyerSafeWording: `${context.workspaceName} assurance`,
    proposedProofStatus: 'verified', effectiveProofStatus: 'evidence_required', proofBoundary: 'verified_with_evidence',
    limitationDisclosure: 'Source only.', doesNotProve: ['Hosted behavior'], canonicalHash: 'a'.repeat(64),
    ownerDisplayName: 'Assigned owner', lifecycle: 'under_review', blockedReasons: ['CURRENT_CONTRADICTION'],
  }, ...(multipleClaims ? [{
    claimVersionId: '40000000-0000-4000-8000-000000000014', claimId: '50000000-0000-4000-8000-000000000015', version: 3,
    readinessDomain: 'evidence' as const, claimText: `${context.workspaceName} second claim`, buyerSafeWording: `${context.workspaceName} second claim`,
    proposedProofStatus: 'configured' as const, effectiveProofStatus: 'configured' as const, proofBoundary: 'docs_only' as const,
    limitationDisclosure: 'Second source-only claim.', doesNotProve: ['Hosted behavior'], canonicalHash: 'd'.repeat(64),
    ownerDisplayName: 'Assigned owner', lifecycle: 'under_review' as const, blockedReasons: [],
  }] : [])],
  evidence: [{
    evidenceVersionId: '60000000-0000-4000-8000-000000000006', evidenceId: '70000000-0000-4000-8000-000000000007', version: 1,
    evidenceType: 'test_report', referenceType: 'test_report', referenceValue: 'tests/trust-assurance', summary: 'Expired focused evidence.',
    evidenceBoundary: 'verified_with_evidence', freshness: 'expired', observedAt: '2026-08-01T00:00:00Z',
    reviewDueAt: null, expiresAt: '2026-08-02T00:00:00Z', canonicalHash: 'b'.repeat(64), approved: true, ownerDisplayName: 'Assigned owner',
    lifecycle: evidenceHistory ? 'superseded' : 'active',
  }, ...(evidenceHistory ? [{evidenceVersionId:'60000000-0000-4000-8000-000000000016',evidenceId:'70000000-0000-4000-8000-000000000017',version:1,evidenceType:'test_report',referenceType:'test_report' as const,referenceValue:'tests/trust-new',summary:'New actionable evidence.',evidenceBoundary:'docs_only' as const,lifecycle:evidenceWithdrawn?'withdrawn' as const:'active' as const,freshness:'current' as const,observedAt:'2026-08-08T00:00:00Z',reviewDueAt:null,expiresAt:null,canonicalHash:'e'.repeat(64),approved:true,ownerDisplayName:'Assigned owner'}] : [])],
  relationships: [{
    claimVersionId: '40000000-0000-4000-8000-000000000004', evidenceVersionId: '60000000-0000-4000-8000-000000000006',
    relationship: 'contradicts', rationale: 'Current contradiction.',
  }],
  reviewQueueCount: 1,
  snapshotHistory: snapshotMixed ? [{snapshotId:'80000000-0000-4000-8000-000000000018',snapshotHash:'f'.repeat(64),version:2,lifecycle:'changes_requested',createdAt:'2026-08-08T00:00:00Z'},{snapshotId:'80000000-0000-4000-8000-000000000008',snapshotHash:'c'.repeat(64),version:3,lifecycle:'published',createdAt:'2026-08-07T00:00:00Z'}] : featureDisabled ? [{
    snapshotId: '80000000-0000-4000-8000-000000000008', snapshotHash: 'c'.repeat(64), version: 3,
    lifecycle: 'published', createdAt: '2026-08-07T00:00:00Z',
  }] : [],
  currentPublication: (published || snapshotMixed) ? {
    publicationId: '81000000-0000-4000-8000-000000000008', snapshotId: '80000000-0000-4000-8000-000000000008',
    snapshotHash: 'c'.repeat(64), publishedAt: '2026-08-07T00:00:00Z',
  } : null,
});
const buyerFor = (context: TenantContextProjection): BuyerSafeProjection => ({
  mode: 'published_snapshot',
  publication: { publicId: '81000000-0000-4000-8000-000000000008', snapshotHash: 'c'.repeat(64), publishedAt: '2026-08-07T00:00:00Z' },
  claims: [{
    wording: `${context.workspaceName} assurance`, effectiveProofStatus: 'verified', proofBoundary: 'verified_with_evidence',
    lastReviewedAt: '2026-08-07T00:00:00Z', evidence: [], limitationDisclosure: 'Source only.', doesNotProve: ['Hosted behavior'],
  }],
});
const projections = new Map<string, InternalAssuranceProjection>([
  [contextA.workspaceId, projectionFor(contextA, featureDisabled)],
  [contextB.workspaceId, projectionFor(contextB, true)],
]);
const receipts = new Map<string, { fingerprint: string; result: { ok: true; replayed: false; resourceId: string; version: number; body: Record<string, unknown> } }>();
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let releaseWorkspaceAQuery: (() => void) | null = null;
let releaseWorkspaceBCommand: (() => void) | null = null;
const waitForWorkspaceAQuery = () => new Promise<void>(resolve => { releaseWorkspaceAQuery = resolve; });
const waitForWorkspaceBCommand = () => new Promise<void>(resolve => { releaseWorkspaceBCommand = resolve; });

const Harness: React.FC = () => {
  const [selected, setSelected] = useState<TenantContextProjection | null>(params.has('revoked') ? null : matrix ? contextB : contextA);
  const [selectionState, setSelectionState] = useState(params.has('global-readonly') ? 'read_only' as const : selected ? 'ready' as const : 'revoked' as const);
  const [calls, setCalls] = useState<string[]>([]);
  const [effectCounts, setEffectCounts] = useState<Record<'claim.create' | 'evidence.register' | 'snapshot.create', number>>({ 'claim.create': 0, 'evidence.register': 0, 'snapshot.create': 0 });
  const log = (value: string) => setCalls(previous => [...previous, value]);
  const query = async (scope: { workspaceId: string; authorizationVersion?: number }, view: TrustQueryView) => {
    log(`query:${view}:${scope.workspaceId}:auth=${scope.authorizationVersion ?? 'unknown'}`);
    if (matrix && !responseLoss && view === 'internal' && scope.workspaceId === contextA.workspaceId) await waitForWorkspaceAQuery();
    const context = scope.workspaceId === contextB.workspaceId ? contextB : contextA;
    if (view === 'buyer' && params.has('buyer-transient')) throw new Error('PERSISTENCE_UNAVAILABLE');
    if (view === 'buyer' && params.has('buyer-stale')) throw new Error('AUTHORIZATION_STALE');
    if (view === 'buyer' && params.has('buyer-denied')) throw new Error('ACCESS_DENIED');
    return view === 'buyer' ? buyerFor(context) : projections.get(scope.workspaceId)!;
  };
  const command = async (request: TrustCommandRequest) => {
    log(`command:${request.operation}:${request.workspaceId}:request=${request.requestId}:key=${request.idempotencyKey}:auth=${request.expectedAuthorizationVersion}`);
    log(`target:${request.operation}:${JSON.stringify(request.payload)}`);
    if (matrix && !responseLoss && request.workspaceId === contextB.workspaceId) await waitForWorkspaceBCommand();
    else await delay(500);
    log(`command-complete:${request.operation}:${request.workspaceId}`);
    if (params.has('conflict')) return { ok: false as const, code: 'VERSION_CONFLICT' as const, message: 'Conflict' };
    if (featureDisabled || featureMismatch) return { ok: false as const, code: 'FEATURE_DISABLED' as const, message: 'Disabled' };
    const createOperations = ['claim.create', 'evidence.register', 'snapshot.create'] as const;
    if (responseLoss && createOperations.includes(request.operation as typeof createOperations[number])) {
      const operation = request.operation as typeof createOperations[number];
      const fingerprint = JSON.stringify({
        operation: request.operation, organizationId: request.organizationId, workspaceId: request.workspaceId,
        expectedVersion: request.expectedVersion ?? null, payload: request.payload,
      });
      const existing = receipts.get(request.idempotencyKey);
      if (existing) {
        if (existing.fingerprint !== fingerprint) return { ok: false as const, code: 'IDEMPOTENCY_CONFLICT' as const, message: 'Conflict' };
        log(`replay:${operation}:request=${request.requestId}:key=${request.idempotencyKey}:auth=${request.expectedAuthorizationVersion}:expected=${request.expectedVersion ?? 'null'}:payload=${JSON.stringify(request.payload)}`);
        return { ...existing.result, replayed: true as const };
      }
      const resourceId = operation === 'claim.create'
        ? '90000000-0000-4000-8000-000000000001'
        : operation === 'evidence.register' ? '90000000-0000-4000-8000-000000000002' : '80000000-0000-4000-8000-000000000008';
      const result = { ok: true as const, replayed: false as const, resourceId, version: 1, body: {} };
      receipts.set(request.idempotencyKey, { fingerprint, result });
      setEffectCounts(previous => ({ ...previous, [operation]: previous[operation] + 1 }));
      log(`commit-response-lost:${operation}:request=${request.requestId}:key=${request.idempotencyKey}:auth=${request.expectedAuthorizationVersion}:expected=${request.expectedVersion ?? 'null'}:payload=${JSON.stringify(request.payload)}`);
      if (operation === 'snapshot.create' && request.workspaceId) {
        const projection = projections.get(request.workspaceId)!;
        projections.set(request.workspaceId, { ...projection, snapshotHistory: [{
          snapshotId: resourceId, snapshotHash: 'c'.repeat(64), version: 1, lifecycle: 'draft', createdAt: '2026-08-07T00:00:00Z',
        }] });
      }
      return { ok: false as const, code: 'PERSISTENCE_UNAVAILABLE' as const, message: 'Response lost' };
    }
    if (request.operation === 'snapshot.create' && request.workspaceId) {
      const projection = projections.get(request.workspaceId)!;
      projections.set(request.workspaceId, { ...projection, snapshotHistory: [{
        snapshotId: '80000000-0000-4000-8000-000000000008', snapshotHash: 'c'.repeat(64), version: 1,
        lifecycle: 'draft', createdAt: '2026-08-07T00:00:00Z',
      }] });
    }
    return { ok: true as const, replayed: false, resourceId: '80000000-0000-4000-8000-000000000008', version: 1, body: {} };
  };
  const connected = useMemo(() => <TrustAssuranceConnectedWorkspace
    tenantContext={selected}
    selectionState={selectionState}
    query={query as never}
    command={command}
  />, [selected, selectionState]);
  return <>
    {matrix && <section aria-label="Tenant context controls" className="m-4 flex flex-wrap gap-2">
      <button type="button" onClick={() => setSelected(contextB)}>Select workspace B</button>
      <button type="button" onClick={() => setSelected(contextA)}>Select workspace A</button>
      <button type="button" onClick={() => setSelected({ ...contextB, authorizationVersion: 4 })}>Refresh workspace B authority</button>
      <button type="button" onClick={() => setSelected(deniedA)}>Select workspace A without Trust</button>
      <button type="button" onClick={() => { releaseWorkspaceAQuery?.(); releaseWorkspaceAQuery = null; }}>Release workspace A query</button>
      <button type="button" onClick={() => { releaseWorkspaceBCommand?.(); releaseWorkspaceBCommand = null; }}>Release workspace B command</button>
      <button type="button" onClick={() => setCalls([])}>Clear call log</button>
      <button type="button" onClick={() => setSelectionState('read_only')}>Enter global read-only</button>
    </section>}
    {(matrix || responseLoss || featureDisabled || featureMismatch || params.has('conflict') || params.has('global-readonly')) && <section aria-label="Harness evidence" hidden>
      <output data-testid="trust-call-log">{calls.join('\n')}</output>
      <output data-testid="trust-effect-counts">{JSON.stringify(effectCounts)}</output>
    </section>}
    <TrustCenterPanel connectedWorkspace={connected} />
  </>;
};

createRoot(document.getElementById('root')!).render(<Harness />);
