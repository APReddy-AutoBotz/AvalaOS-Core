import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { EnterpriseSessionState, TenantContextProjection } from '../../../types';
import { commandTrustAssurance, queryTrustAssurance } from '../../../services/trustAssurance/client';
import type { BuyerSafeProjection, InternalAssuranceProjection, TrustCommandRequest, TrustOperation } from '../../../services/trustAssurance/contracts';
import { TrustAssuranceWorkspace, type TrustAssuranceState } from './TrustAssuranceWorkspace';

const errorState = (error: unknown): TrustAssuranceState => ({
  kind: error instanceof Error && error.message === 'AUTHORIZATION_STALE'
    ? 'stale_authorization'
    : error instanceof Error && error.message === 'ACCESS_DENIED'
      ? 'revoked'
      : typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error',
});

const attemptScopeKey = (tenant: TenantContextProjection): string =>
  `${tenant.userId}:${tenant.organizationId}:${tenant.workspaceId}`;

export const TrustAssuranceConnectedWorkspace: React.FC<{
  tenantContext: TenantContextProjection | null;
  selectionState?: EnterpriseSessionState;
  query?: typeof queryTrustAssurance;
  command?: typeof commandTrustAssurance;
}> = ({ tenantContext, selectionState = 'ready', query: queryProjection = queryTrustAssurance, command: sendCommand = commandTrustAssurance }) => {
  const [state, setState] = useState<TrustAssuranceState>({ kind: 'loading' });
  const [buyer, setBuyer] = useState<BuyerSafeProjection | null>(null);
  const [buyerWarning, setBuyerWarning] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [unresolved, setUnresolved] = useState<TrustCommandRequest | null>(null);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const unresolvedByScope = useRef(new Map<string, TrustCommandRequest>());
  const mutationBlocked = useRef(false);
  const globalReadOnly = selectionState === 'read_only';

  const loadSelected = useCallback(async (selected: TenantContextProjection, requestGeneration: number) => {
    if (generation.current !== requestGeneration) return;
    setState({ kind: 'loading' });
    setBuyer(null);
    setBuyerWarning('');
    try {
      const scope = { organizationId: selected.organizationId, workspaceId: selected.workspaceId, authorizationVersion: selected.authorizationVersion };
      const projection = await queryProjection(scope, 'internal') as InternalAssuranceProjection;
      if (generation.current !== requestGeneration) return;
      setState({ kind: 'ready', projection });
      if (!projection.currentPublication) return;
      try {
        const buyerProjection = await queryProjection(scope, 'buyer') as BuyerSafeProjection;
        if (generation.current === requestGeneration) setBuyer(buyerProjection);
      } catch (error) {
        if (generation.current !== requestGeneration) return;
        if (error instanceof Error && (error.message === 'AUTHORIZATION_STALE' || error.message === 'ACCESS_DENIED')) {
          setBuyer(null);
          setState(errorState(error));
        } else {
          setBuyerWarning('Buyer-safe preview is temporarily unavailable. Internal assurance data remains available.');
        }
      }
    } catch (error) {
      if (generation.current === requestGeneration) setState(errorState(error));
    }
  }, [queryProjection]);

  const contextKey = tenantContext
    ? `${tenantContext.userId}:${tenantContext.organizationId}:${tenantContext.workspaceId}:${tenantContext.authorizationVersion}:${tenantContext.capabilities.join(',')}`
    : 'none';
  const selectedScopeKey = tenantContext ? attemptScopeKey(tenantContext) : null;
  useLayoutEffect(() => {
    const requestGeneration = ++generation.current;
    setBuyer(null);
    setBuyerWarning('');
    setNotice('');
    setSelectedClaimId(null);
    setSelectedEvidenceId(null);
    mutationBlocked.current = false;
    setPending(inFlight.current);
    setUnresolved(tenantContext ? unresolvedByScope.current.get(attemptScopeKey(tenantContext)) ?? null : null);
    if (selectionState === 'loading') setState({ kind: 'loading' });
    else if (selectionState === 'offline') setState({ kind: 'offline' });
    else if (selectionState === 'stale') setState({ kind: 'stale_authorization' });
    else if (selectionState === 'revoked' || selectionState === 'expired_session') setState({ kind: 'revoked' });
    else if (selectionState === 'error' || selectionState === 'blocked') setState({ kind: 'blocked' });
    else if (!tenantContext) setState({ kind: selectionState === 'empty' ? 'empty' : 'revoked' });
    else if (!tenantContext.capabilities.includes('trust.read')) setState({ kind: 'revoked' });
    else void loadSelected(tenantContext, requestGeneration);
    return () => { if (generation.current === requestGeneration) generation.current += 1; };
  }, [contextKey, selectionState, loadSelected]);

  const submitAttempt = async (storedRequest: TrustCommandRequest, selected: TenantContextProjection, requestGeneration: number) => {
    if (inFlight.current) return;
    const scopeKey = attemptScopeKey(selected);
    inFlight.current = true;
    setPending(true);
    setNotice('');
    const request = { ...storedRequest, expectedAuthorizationVersion: selected.authorizationVersion };
    try {
      const result = await sendCommand(request);
      if ('code' in result && result.code === 'PERSISTENCE_UNAVAILABLE') {
        unresolvedByScope.current.set(scopeKey, storedRequest);
        if (generation.current === requestGeneration) {
          setUnresolved(storedRequest);
          setNotice('Outcome unknown. Retry the same governed command.');
        }
        return;
      }
      unresolvedByScope.current.delete(scopeKey);
      if (generation.current !== requestGeneration) return;
      setUnresolved(null);
      if ('code' in result) {
        setNotice(result.code);
        if (result.code === 'AUTHORIZATION_STALE') {
          setBuyer(null);
          setState({ kind: 'stale_authorization' });
        } else if (result.code === 'ACCESS_DENIED' || result.code === 'PERMISSION_DENIED') {
          setBuyer(null);
          setState({ kind: 'revoked' });
        } else if (result.code === 'FEATURE_DISABLED') {
          mutationBlocked.current = true;
        }
        return;
      }
      await loadSelected(selected, requestGeneration);
      if (generation.current === requestGeneration) setNotice(result.replayed ? 'Durable result replayed.' : 'Durable change committed.');
    } catch {
      unresolvedByScope.current.set(scopeKey, storedRequest);
      if (generation.current === requestGeneration) {
        setUnresolved(storedRequest);
        setNotice('Outcome unknown. Retry the same governed command.');
      }
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const execute = async (operation: TrustOperation, payload: Record<string, unknown>, expectedVersion?: number) => {
    if (globalReadOnly || mutationBlocked.current || !tenantContext || !selectedScopeKey || inFlight.current || unresolvedByScope.current.has(selectedScopeKey) || state.kind !== 'ready' || state.projection.readOnly) return;
    const requestGeneration = generation.current;
    const selected = tenantContext;
    const request: TrustCommandRequest = {
      requestId: crypto.randomUUID(), idempotencyKey: `trust-ui-${operation}-${crypto.randomUUID()}`, operation,
      organizationId: selected.organizationId, workspaceId: selected.workspaceId,
      expectedAuthorizationVersion: selected.authorizationVersion, expectedVersion, payload,
    };
    unresolvedByScope.current.set(selectedScopeKey, request);
    await submitAttempt(request, selected, requestGeneration);
  };

  const retryUnresolved = async () => {
    if (globalReadOnly || mutationBlocked.current || state.kind !== 'ready' || state.projection.readOnly || !tenantContext || !selectedScopeKey || inFlight.current) return;
    const request = unresolvedByScope.current.get(selectedScopeKey);
    if (!request) return;
    await submitAttempt(request, tenantContext, generation.current);
  };

  return <div className="space-y-4">
    <TrustAssuranceWorkspace state={state} buyerProjection={buyer} />
    {state.kind === 'ready' && (globalReadOnly || mutationBlocked.current) && !state.projection.readOnly && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold">Read-only mode: history and projections remain available; mutations are disabled.</p>}
    {state.kind === 'ready' && unresolved && <section role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold">
      <p>Outcome unknown for {unresolved.operation}. Retry the same governed command.</p>
      <button type="button" disabled={pending || globalReadOnly || mutationBlocked.current || state.projection.readOnly} onClick={() => void retryUnresolved()} className="mt-2 rounded-lg bg-[#002C4B] px-3 py-2 text-xs font-black text-white disabled:opacity-50">Retry unresolved command</button>
    </section>}
    {state.kind === 'ready' && <CommandBar projection={state.projection} pending={pending} unresolved={Boolean(unresolved)} readOnly={globalReadOnly || mutationBlocked.current || state.projection.readOnly} selectedClaimId={selectedClaimId} onSelectClaim={setSelectedClaimId} selectedEvidenceId={selectedEvidenceId} onSelectEvidence={setSelectedEvidenceId} execute={execute} />}
    <div aria-live="polite" className="text-sm font-bold text-slate-600">{notice}</div>
    {buyerWarning && state.kind === 'ready' && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold">{buyerWarning}</p>}
    {!buyer && !buyerWarning && state.kind === 'ready' && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold">No publication: buyer-safe preview remains unavailable.</p>}
  </div>;
};

const CommandBar: React.FC<{
  projection: InternalAssuranceProjection;
  pending: boolean;
  unresolved: boolean;
  readOnly: boolean;
  selectedClaimId: string | null;
  onSelectClaim: (claimId: string | null) => void;
  selectedEvidenceId: string | null;
  onSelectEvidence: (evidenceId: string | null) => void;
  execute: (operation: TrustOperation, payload: Record<string, unknown>, expectedVersion?: number) => Promise<void>;
}> = ({ projection, pending, unresolved, readOnly, selectedClaimId, onSelectClaim, selectedEvidenceId, onSelectEvidence, execute }) => {
  const claim = projection.claims.find(item => item.claimId === selectedClaimId)
    ?? (selectedClaimId === null && projection.claims.length === 1 ? projection.claims[0] : undefined);
  const activeEvidence = projection.evidence.filter(item => item.lifecycle === 'active');
  const transitionEvidence = projection.evidence.filter(item => ['active','blocked','not_run'].includes(item.lifecycle));
  const selectedEvidence = projection.evidence.find(item => item.evidenceId === selectedEvidenceId);
  const reviewEvidence = selectedEvidenceId !== null
    ? (selectedEvidence?.lifecycle === 'active' ? selectedEvidence : undefined)
    : activeEvidence.length === 1 ? activeEvidence[0] : undefined;
  const mutableEvidence = selectedEvidenceId !== null
    ? (selectedEvidence && ['active','blocked','not_run'].includes(selectedEvidence.lifecycle) ? selectedEvidence : undefined)
    : transitionEvidence.length === 1 ? transitionEvidence[0] : undefined;
  const reviewSnapshot = projection.snapshotHistory.find(item => ['draft','under_review','changes_requested'].includes(item.lifecycle));
  const publishSnapshot = projection.snapshotHistory.find(item => item.lifecycle === 'reviewed');
  const publishedSnapshot = projection.currentPublication ? projection.snapshotHistory.find(item => item.snapshotId === projection.currentPublication?.snapshotId) : undefined;
  const disabled = pending || unresolved || readOnly;
  return <section aria-label="Trust Assurance commands" className="rounded-2xl border bg-white p-4">
    <h3 className="font-black">Governed actions</h3>
    <p className="mt-1 text-xs text-slate-500">Actions refresh only after a durable server response. Historical evidence remains visible but is never an implicit mutation target.</p>
    {projection.claims.length > 1 && <label className="mt-3 block text-xs font-bold">Claim target<select aria-label="Claim target" value={selectedClaimId ?? ''} onChange={event => onSelectClaim(event.target.value || null)} className="ml-2 rounded border px-2 py-1"><option value="">Select claim</option>{projection.claims.map(item=><option key={item.claimId} value={item.claimId}>{item.buyerSafeWording}</option>)}</select></label>}
    {projection.evidence.length > 1 && <label className="mt-3 block text-xs font-bold">Evidence target<select aria-label="Evidence target" value={selectedEvidenceId ?? ''} onChange={event => onSelectEvidence(event.target.value || null)} className="ml-2 rounded border px-2 py-1"><option value="">Select actionable evidence</option>{projection.evidence.map(item=><option key={item.evidenceId} value={item.evidenceId}>{item.summary} · {item.lifecycle}</option>)}</select></label>}
    <div className="mt-3 flex flex-wrap gap-2">
      <Action label="Create claim" disabled={disabled} onClick={() => execute('claim.create', { readinessDomain: 'evidence', claimText: 'Source evidence is available for independent review.', proposedProofStatus: 'configured', proofBoundary: 'docs_only', buyerSafeWording: 'Source evidence is available for independent review.', limitationDisclosure: 'Source-only evidence; hosted behavior is not proven.', doesNotProve: ['Hosted or production behavior'] })} />
      {projection.claims.length > 0 && <Action label="Revise claim" disabled={disabled || !claim} onClick={() => claim && execute('claim.revise', { claimId: claim.claimId, claimText: claim.claimText, proposedProofStatus: claim.proposedProofStatus, proofBoundary: claim.proofBoundary, buyerSafeWording: claim.buyerSafeWording, limitationDisclosure: claim.limitationDisclosure, doesNotProve: claim.doesNotProve }, claim.version)} />}
      <Action label="Register evidence" disabled={disabled} onClick={() => execute('evidence.register', { evidenceType: 'test_report', referenceType: 'test_report', referenceValue: 'tests/trust-assurance', digest: null, summary: 'Focused source evidence awaiting independent review.', evidenceBoundary: 'docs_only', result: 'performed', observedAt: new Date().toISOString(), reviewDueAt: null, expiresAt: null })} />
      {projection.claims.length > 0 && <Action label="Review claim" disabled={disabled || !claim} onClick={() => claim && execute('resource.review', { resourceType: 'claim_version', resourceId: claim.claimVersionId, decision: 'reviewed', rationale: 'Reviewed exact current claim version.' })} />}
      {projection.evidence.length > 0 && <Action label="Review evidence" disabled={disabled || !reviewEvidence} onClick={() => reviewEvidence && execute('resource.review', { resourceType: 'evidence_version', resourceId: reviewEvidence.evidenceVersionId, decision: 'reviewed', rationale: 'Reviewed exact current evidence version.' })} />}
      {projection.claims.length > 0 && projection.evidence.length > 0 && <Action label="Link support" disabled={disabled || !claim || !reviewEvidence} onClick={() => claim && reviewEvidence && execute('evidence.link', { claimVersionId: claim.claimVersionId, evidenceVersionId: reviewEvidence.evidenceVersionId, relationship: 'supports', rationale: 'Evidence supports the exact claim version.' })} />}
      {projection.claims.length > 0 && <Action label="Build snapshot" disabled={disabled || !claim} onClick={() => claim && execute('snapshot.create', { claimIds: [claim.claimId] })} />}
      {projection.evidence.length > 0 && <Action label="Supersede evidence" disabled={disabled || !mutableEvidence} onClick={() => mutableEvidence && execute('evidence.supersede', { evidenceId: mutableEvidence.evidenceId }, mutableEvidence.version)} />}
      {projection.evidence.length > 0 && <Action label="Withdraw evidence" disabled={disabled || !mutableEvidence} onClick={() => mutableEvidence && execute('evidence.withdraw', { evidenceId: mutableEvidence.evidenceId }, mutableEvidence.version)} />}
      {reviewSnapshot && <Action label="Review snapshot" disabled={disabled} onClick={() => execute('snapshot.review', { snapshotId: reviewSnapshot.snapshotId, decision: 'reviewed', rationale: 'Reviewed exact snapshot.' }, reviewSnapshot.version)} />}
      {publishSnapshot && <Action label="Publish snapshot" disabled={disabled} onClick={() => execute('snapshot.publish', { snapshotId: publishSnapshot.snapshotId }, publishSnapshot.version)} />}
      {publishedSnapshot && <Action label="Withdraw publication" disabled={disabled} onClick={() => execute('snapshot.withdraw', { snapshotId: publishedSnapshot.snapshotId, rationale: 'Publication withdrawn with history preserved.' }, publishedSnapshot.version)} />}
    </div>
  </section>;
};

const Action: React.FC<{ label: string; disabled: boolean; onClick: () => void }> = ({ label, disabled, onClick }) =>
  <button type="button" disabled={disabled} onClick={onClick} className="rounded-lg bg-[#002C4B] px-3 py-2 text-xs font-black text-white disabled:opacity-50">{label}</button>;
