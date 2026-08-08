import React, { useCallback, useEffect, useState } from 'react';
import type { TenantContextProjection } from '../../../types';
import { loadEnterpriseSessionContexts } from '../../../services/enterpriseAssess';
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

export const TrustAssuranceConnectedWorkspace: React.FC<{
  loadContexts?: typeof loadEnterpriseSessionContexts;
  query?: typeof queryTrustAssurance;
  command?: typeof commandTrustAssurance;
}> = ({ loadContexts = loadEnterpriseSessionContexts, query: queryProjection = queryTrustAssurance, command: sendCommand = commandTrustAssurance }) => {
  const [context, setContext] = useState<TenantContextProjection | null>(null);
  const [state, setState] = useState<TrustAssuranceState>({ kind: 'loading' });
  const [buyer, setBuyer] = useState<BuyerSafeProjection | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const contexts = await loadContexts();
      const next = contexts.find(item => item.capabilities.includes('trust.read'));
      if (!next) {
        setState({ kind: 'revoked' });
        return;
      }
      setContext(next);
      const projection = await queryProjection({ organizationId: next.organizationId, workspaceId: next.workspaceId, authorizationVersion: next.authorizationVersion }, 'internal') as InternalAssuranceProjection;
      setState({ kind: 'ready', projection });
      setBuyer(projection.currentPublication
        ? await queryProjection({ organizationId: next.organizationId, workspaceId: next.workspaceId, authorizationVersion: next.authorizationVersion }, 'buyer') as BuyerSafeProjection
        : null);
    } catch (error) {
      setState(errorState(error));
    }
  }, [loadContexts, queryProjection]);

  useEffect(() => { void load(); }, [load]);

  const execute = async (operation: TrustOperation, payload: Record<string, unknown>, expectedVersion?: number) => {
    if (!context || pending || state.kind !== 'ready' || state.projection.readOnly) return;
    setPending(true);
    setNotice('');
    const request: TrustCommandRequest = {
      requestId: crypto.randomUUID(), idempotencyKey: `trust-ui-${operation}-${crypto.randomUUID()}`, operation,
      organizationId: context.organizationId, workspaceId: context.workspaceId,
      expectedAuthorizationVersion: context.authorizationVersion, expectedVersion, payload,
    };
    try {
      const result = await sendCommand(request);
      if ('code' in result) {
        setNotice(result.code);
        return;
      }
      await load();
      setNotice(result.replayed ? 'Durable result replayed.' : 'Durable change committed.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'PERSISTENCE_UNAVAILABLE');
    } finally {
      setPending(false);
    }
  };

  return <div className="space-y-4">
    <TrustAssuranceWorkspace state={state} buyerProjection={buyer} />
    {state.kind === 'ready' && state.projection.readOnly && state.projection.claims.length === 0 && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold">Read-only mode: history and projections remain available; mutations are disabled.</p>}
    {state.kind === 'ready' && <CommandBar projection={state.projection} pending={pending} execute={execute} />}
    <div aria-live="polite" className="text-sm font-bold text-slate-600">{notice}</div>
    {!buyer && state.kind === 'ready' && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold">No publication: buyer-safe preview remains unavailable.</p>}
  </div>;
};

const CommandBar: React.FC<{
  projection: InternalAssuranceProjection;
  pending: boolean;
  execute: (operation: TrustOperation, payload: Record<string, unknown>, expectedVersion?: number) => Promise<void>;
}> = ({ projection, pending, execute }) => {
  const claim = projection.claims[0], evidence = projection.evidence[0], snapshot = projection.snapshotHistory[0];
  const disabled = pending || projection.readOnly;
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
