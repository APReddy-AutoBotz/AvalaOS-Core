import React from 'react';
import type { PilotOperationsProjection } from '../../services/pilotOperations/operationsModel';

export interface PilotOperationRequest {
  action: 'validate' | 'approve' | 'simulate_promotion' | 'maintenance' | 'read_only' | 'rollback';
  expectedVersion: number;
}

interface Props {
  projection: PilotOperationsProjection | null;
  loading?: boolean;
  error?: string | null;
  pendingAction?: PilotOperationRequest['action'] | null;
  actionResult?: { kind: 'success' | 'error' | 'stale' | 'revoked' | 'blocked'; message: string } | null;
  onRequest?: (request: PilotOperationRequest) => void;
}

const State = ({ value }: { value: string }) => <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{value.replaceAll('_', ' ')}</span>;

const PilotOperationsPanel: React.FC<Props> = ({ projection, loading, error, pendingAction, actionResult, onRequest }) => {
  if (loading) return <section aria-busy="true" aria-label="Pilot Operations"><p>Loading authoritative pilot operations state…</p></section>;
  if (error || !projection) return <section role="alert" aria-label="Pilot Operations"><h3 className="font-black">Pilot Operations unavailable</h3><p>{error || 'The server projection was not available. No operation was performed.'}</p></section>;
  const blocked = projection.promotion.blockers;
  const request = (action: PilotOperationRequest['action']) => onRequest?.({ action, expectedVersion: ['validate','approve','simulate_promotion','rollback'].includes(action) ? (projection.authority?.releaseVersion ?? projection.environment.version) : projection.environment.version });
  return (
    <section aria-labelledby="pilot-operations-title" className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <header>
        <p className="text-xs font-black uppercase tracking-widest text-amber-700">Non-live control plane</p>
        <h3 id="pilot-operations-title" className="mt-1 text-2xl font-black text-[#002C4B] dark:text-white">Pilot Operations</h3>
        <p className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">Hosted/live activation is not authorized or proven. This surface cannot deploy to hosted infrastructure.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <article><h4 className="font-black">Release candidate</h4><p className="mt-2">{projection.release.candidateLabel} <State value={projection.release.lifecycle} /></p><p className="mt-1 break-all font-mono text-xs">{projection.release.commitSha}</p>{projection.release.promotedHistoryLabel && <p className="mt-1 text-xs">Promoted history: {projection.release.promotedHistoryLabel}</p>}</article>
        <article><h4 className="font-black">Environment</h4><p className="mt-2">{projection.environment.label} <State value={projection.environment.lifecycle} /></p><p className="mt-1 text-sm">Schema {projection.health.schemaCompatible ? 'compatible' : 'blocked'} · Maintenance {projection.controls.maintenance ? 'on' : 'off'} · Read-only {projection.controls.readOnly ? 'on' : 'off'}</p></article>
      </div>
      <article><h4 className="font-black">Promotion gates</h4>{blocked.length === 0 ? <p>All configured non-live gates passed.</p> : <ul className="mt-2 space-y-2">{blocked.map(reason => <li key={reason}>Blocked: {reason}</li>)}</ul>}</article>
      <article><h4 className="font-black">Hosted/live stop gates</h4><ul className="mt-2 space-y-2">{projection.promotion.liveStopGates.map(reason => <li key={reason}>Blocked: {reason}</li>)}</ul></article>
      <div className="grid gap-4 md:grid-cols-3">
        <article><h4 className="font-black">Provider controls</h4><p className="text-sm">Enterprise Intelligence: {projection.provider.status ?? (projection.provider.configured ? (projection.provider.enabled ? 'enabled' : 'disabled') : 'not configured')}</p></article>
        <article><h4 className="font-black">Health</h4><p className="text-sm">Queue: {projection.health.queueState}</p><p className="text-sm">Reconciliation: {projection.health.reconciliationState}</p></article>
        <article><h4 className="font-black">Recovery</h4><p className="text-sm">Backup: {projection.recovery.backupState}</p><p className="text-sm">Restore: {projection.recovery.restoreState}</p></article>
      </div>
      <div><h4 className="font-black">Rollback</h4><p className="text-sm">{projection.promotion.rollbackEligible ? `Eligible to the exact prior candidate ${projection.promotion.rollbackTargetLabel || 'recorded by the server'}.` : `Not eligible: ${projection.promotion.rollbackReason}.`} History is never rewritten.</p></div>
      <div className="flex flex-wrap gap-2" aria-label="Controlled pilot operations">
        {(['validate','approve','simulate_promotion','maintenance','read_only','rollback'] as const).map(action => <button key={action} type="button" disabled={Boolean(pendingAction) || !onRequest || (action === 'rollback' && !projection.promotion.rollbackEligible) || (action === 'simulate_promotion' && blocked.length > 0)} onClick={() => request(action)} className="rounded-lg border px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50">{pendingAction === action ? 'Pending…' : action.replaceAll('_', ' ')}</button>)}
      </div>
      <p aria-live="polite" role={actionResult?.kind === 'error' ? 'alert' : 'status'}>{actionResult?.message}</p>
      <footer className="text-xs font-semibold text-slate-600">Truth classification: {projection.truth.replaceAll('_', ' ')} · Projection version {projection.environment.version}</footer>
    </section>
  );
};

export default PilotOperationsPanel;
