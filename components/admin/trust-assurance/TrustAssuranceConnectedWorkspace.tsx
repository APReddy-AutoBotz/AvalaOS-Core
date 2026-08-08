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
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [unresolved, setUnresolved] = useState<TrustCommandRequest | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const unresolvedByScope = useRef(new Map<string, TrustCommandRequest>());

  const loadSelected = useCallback(async (selected: TenantContextProjection, requestGeneration: number) => {
    if (generation.current !== requestGeneration) return;
    setState({ kind: 'loading' });
    setBuyer(null);
    try {
      const scope = { organizationId: selected.organizationId, workspaceId: selected.workspaceId, authorizationVersion: selected.authorizationVersion };
      const projection = await queryProjection(scope, 'internal') as InternalAssuranceProjection;
      if (generation.current !== requestGeneration) return;
      setState({ kind: 'ready', projection });
      if (!projection.currentPublication) return;
      const buyerProjection = await queryProjection(scope, 'buyer') as BuyerSafeProjection;
      if (generation.current === requestGeneration) setBuyer(buyerProjection);
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
    setNotice('');
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
    if (!tenantContext || !selectedScopeKey || inFlight.current || unresolvedByScope.current.has(selectedScopeKey) || state.kind !== 'ready' || state.projection.readOnly) return;
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
    if (!tenantContext || !selectedScopeKey || inFlight.current) return;
    const request = unresolvedByScope.current.get(selectedScopeKey);
    if (!request) return;
    await submitAttempt(request, tenantContext, generation.current);
  };

  return <div className="space-y-4">
    <TrustAssuranceWorkspace state={state} buyerProjection={buyer} />
    {state.kind === 'ready' && state.projection.readOnly && state.projection.claims.length === 0 && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold">Read-only mode: history and projections remain available; mutations are disabled.</p>}
    {state.kind === 'ready' && unresolved && <section role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold">
      <p>Outcome unknown for {unresolved.operation}. Retry the same governed command.</p>
      <button type="button" disabled={pending} onClick={() => void retryUnresolved()} className="mt-2 rounded-lg bg-[#002C4B] px-3 py-2 text-xs font-black text-white disabled:opacity-50">Retry unresolved command</button>
    </section>}
    {state.kind === 'ready' && <CommandBar projection={state.projection} pending={pending} unresolved={Boolean(unresolved)} execute={execute} />}
    <div aria-live="polite" className="text-sm font-bold text-slate-600">{notice}</div>
    {!buyer && state.kind === 'ready' && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold">No publication: buyer-safe preview remains unavailable.</p>}
  </div>;
};

const CommandBar: React.FC<{
  projection: InternalAssuranceProjection;
  pending: boolean;
  unresolved: boolean;
  execute: (operation: TrustOperation, payload: Record<string, unknown>, expectedVersion?: number) => Promise<void>;
}> = ({ projection, pending, unresolved, execute }) => {
  const claim = projection.claims[0], evidence = projection.evidence[0], snapshot = projection.snapshotHistory[0];
  const disabled = pending || unresolved || projection.readOnly;
  return <section aria-label="Trust Assurance commands" className="rounded-2xl border bg-white p-4">
    <h3 className="font-black">Governed actions</h3>
    <p className="mt-1 text-xs text-slate-500">Actions refresh only after a durable server response. The first current item is used for bounded review/build actions.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <Action label="Create claim" disabled={disabled} onClick={() => execute('claim.create', { readinessDomain: 'evidence', claimText: 'Source evidence is available for independent review.', proposedProofStatus: 'configured', proofBoundary: 'docs_only', buyerSafeWording: 'Source evidence is available for independent review.', limitationDisclosure: 'Source-only evidence; hosted behavior is not proven.', doesNotProve: ['Hosted or production behavior'] })} />
      {claim && <Action label="Revise claim" disabled={disabled} onClick={() => execute('claim.revise', { claimId: claim.claimId, claimText: claim.claimText, proposedProofStatus: claim.proposedProofStatus, proofBoundary: claim.proofBoundary, buyerSafeWording: claim.buyerSafeWording, limitationDisclosure: claim.limitationDisclosure, doesNotProve: claim.doesNotProve }, claim.version)} />}
      <Action label="Register evidence" disabled={disabled} onClick={() => execute('evidence.register', { evidenceType: 'test_report', referenceType: 'test_report', referenceValue: 'tests/trust-assurance', digest: null, summary: 'Focused source evidence awaiting independent review.', evidenceBoundary: 'docs_only', result: 'performed', observedAt: new Date().toISOString(), reviewDueAt: null, expiresAt: null })} />
      {claim && <Action label="Review claim" disabled={disabled} onClick={() => execute('resource.review', { resourceType: 'claim_version', resourceId: claim.claimVersionId, decision: 'reviewed', rationale: 'Reviewed exact current claim version.' })} />}
      {evidence && <Action label="Review evidence" disabled={disabled} onClick={() => execute('resource.review', { resourceType: 'evidence_version', resourceId: evidence.evidenceVersionId, decision: 'reviewed', rationale: 'Reviewed exact current evidence version.' })} />}
      {claim && evidence && <Action label="Link support" disabled={disabled} onClick={() => execute('evidence.link', { claimVersionId: claim.claimVersionId, evidenceVersionId: evidence.evidenceVersionId, relationship: 'supports', rationale: 'Evidence supports the exact claim version.' })} />}
      {claim && <Action label="Build snapshot" disabled={disabled} onClick={() => execute('snapshot.create', { claimIds: [claim.claimId] })} />}
      {evidence && <Action label="Supersede evidence" disabled={disabled} onClick={() => execute('evidence.supersede', { evidenceId: evidence.evidenceId }, evidence.version)} />}
      {evidence && <Action label="Withdraw evidence" disabled={disabled} onClick={() => execute('evidence.withdraw', { evidenceId: evidence.evidenceId }, evidence.version)} />}
      {snapshot?.lifecycle === 'draft' && <Action label="Review snapshot" disabled={disabled} onClick={() => execute('snapshot.review', { snapshotId: snapshot.snapshotId, decision: 'reviewed', rationale: 'Reviewed exact snapshot.' }, snapshot.version)} />}
      {snapshot?.lifecycle === 'reviewed' && <Action label="Publish snapshot" disabled={disabled} onClick={() => execute('snapshot.publish', { snapshotId: snapshot.snapshotId }, snapshot.version)} />}
      {snapshot?.lifecycle === 'published' && <Action label="Withdraw publication" disabled={disabled} onClick={() => execute('snapshot.withdraw', { snapshotId: snapshot.snapshotId, rationale: 'Publication withdrawn with history preserved.' }, snapshot.version)} />}
    </div>
  </section>;
};

const Action: React.FC<{ label: string; disabled: boolean; onClick: () => void }> = ({ label, disabled, onClick }) =>
  <button type="button" disabled={disabled} onClick={onClick} className="rounded-lg bg-[#002C4B] px-3 py-2 text-xs font-black text-white disabled:opacity-50">{label}</button>;
