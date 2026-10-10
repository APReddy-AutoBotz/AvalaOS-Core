import React, { useEffect, useRef, useState } from 'react';
import {
  executeStudioDeliveryCommand,
  queryLatestDeliveryPackSnapshot,
  retryStudioDeliveryCommand,
  StudioDeliveryBoundaryError,
  type StudioDeliveryScope,
  type StudioDeliveryTransport,
} from '../../services/productAcceptanceBridge/client';
import type { DeliveryPackSnapshot } from '../../services/productAcceptanceBridge/contracts';

export type DeliveryPackSnapshotActionProps = {
  key?: React.Key;
  scope: StudioDeliveryScope;
  projectId: string;
  disabled?: boolean;
  transport?: StudioDeliveryTransport;
  onSaved?: (snapshot: DeliveryPackSnapshot) => void | Promise<void>;
};

const buttonClass = 'inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--av-color-border-strong)] bg-[#ffbc03] px-3 py-2 text-sm font-black text-[#002C4B] disabled:cursor-not-allowed disabled:opacity-50';

export default function DeliveryPackSnapshotAction({ scope, projectId, disabled = false, transport, onSaved }: DeliveryPackSnapshotActionProps) {
  const [latest, setLatest] = useState<DeliveryPackSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [reconciliationRequired, setReconciliationRequired] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const identity = `${scope.actorId}:${scope.organizationId}:${scope.workspaceId}:${scope.authorizationVersion}:${projectId}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;

  const load = async () => {
    const result = await queryLatestDeliveryPackSnapshot(scope, projectId, transport);
    setLatest(result.latestSnapshot);
    return result.latestSnapshot;
  };

  useEffect(() => {
    let current = true;
    setLoading(true); setLatest(null); setPendingKey(null); setReconciliationRequired(false); setError(''); setMessage('');
    queryLatestDeliveryPackSnapshot(scope, projectId, transport).then(result => {
      if (current) setLatest(result.latestSnapshot);
    }).catch(caught => {
      if (current) setError(caught instanceof Error ? caught.message : 'Saved Delivery Pack state could not be loaded.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [identity, transport]);

  const save = async () => {
    if (busy || disabled) return;
    const submittedIdentity = identity;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = pendingKey
        ? await retryStudioDeliveryCommand(scope, pendingKey, transport)
        : await executeStudioDeliveryCommand(scope, 'delivery.pack.snapshot', { projectId }, {}, transport);
      const snapshot = result.resource as DeliveryPackSnapshot;
      if (currentIdentity.current !== submittedIdentity) return;
      setPendingKey(null); setLatest(snapshot);
      try { await onSaved?.(snapshot); }
      catch {
        setReconciliationRequired(true);
        setMessage(`Delivery Pack version ${snapshot.version} was saved, but the surrounding view did not reload. Refresh before saving another version.`);
        return;
      }
      try {
        const reloaded = await load();
        if (currentIdentity.current !== submittedIdentity) return;
        if (!reloaded || reloaded.snapshotId !== snapshot.snapshotId || reloaded.version !== snapshot.version) {
          throw new Error('DELIVERY_PACK_SNAPSHOT_RELOAD_MISMATCH');
        }
        setReconciliationRequired(false);
        setMessage(`Saved point-in-time Delivery Pack version ${snapshot.version} with ${snapshot.taskCount} authoritative work item${snapshot.taskCount === 1 ? '' : 's'}.`);
      } catch {
        if (currentIdentity.current !== submittedIdentity) return;
        setReconciliationRequired(true);
        setMessage(`Delivery Pack version ${snapshot.version} was saved, but the saved state could not be reloaded. Refresh before saving another version.`);
      }
    } catch (caught) {
      if (currentIdentity.current !== submittedIdentity) return;
      if (caught instanceof StudioDeliveryBoundaryError && caught.pendingKey) setPendingKey(caught.pendingKey);
      setError(caught instanceof Error ? caught.message : 'The Delivery Pack snapshot was not confirmed.');
    } finally { if (currentIdentity.current === submittedIdentity) { setBusy(false); setLoading(false); } }
  };

  return <section data-testid="delivery-pack-snapshot-action" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-surface-dark" aria-labelledby="delivery-pack-snapshot-title">
    <h2 id="delivery-pack-snapshot-title" className="text-lg font-black text-[#002C4B] dark:text-white">Saved Delivery Pack state</h2>
    <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">Save an immutable point-in-time record of the current authoritative project work items and their exact imported Studio ancestry.</p>
    {loading && <p role="status" className="mt-3 text-sm font-semibold">Loading the latest saved state…</p>}
    {latest && <p data-testid="latest-delivery-pack-snapshot" className="mt-3 rounded-lg border border-slate-200 p-3 text-sm font-bold dark:border-slate-700">
      Version {latest.version} · {latest.taskCount} work item{latest.taskCount === 1 ? '' : 's'} · {latest.boundTaskCount} Studio-bound · saved {new Date(latest.createdAt).toLocaleString()}
    </p>}
    {error && <p role="alert" className="mt-3 rounded-lg border border-red-500 p-3 text-sm font-bold">{error}</p>}
    {message && <p role="status" className="mt-3 rounded-lg border border-emerald-500 p-3 text-sm font-bold">{message}</p>}
    <button type="button" data-testid="save-delivery-pack-snapshot" className={`${buttonClass} mt-4`} disabled={disabled || busy || loading || reconciliationRequired}
      onClick={() => void save()}>{busy ? (pendingKey ? 'Confirming saved state…' : 'Saving…') : pendingKey ? 'Confirm saved state' : latest ? 'Save new point-in-time state' : 'Save point-in-time state'}</button>
  </section>;
}
