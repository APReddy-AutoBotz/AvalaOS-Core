import React, { useState } from 'react';
import {
  executeStudioDeliveryCommand,
  retryStudioDeliveryCommand,
  StudioDeliveryBoundaryError,
  type StudioDeliveryScope,
  type StudioDeliveryTransport,
} from '../../services/productAcceptanceBridge/client';
import type { DeliveryOutcome, StudioDeliveryCommandSuccess, StudioDeliveryOutcomeStatus } from '../../services/productAcceptanceBridge/contracts';

export type DeliveryOutcomeEditorProps = {
  key?: React.Key;
  scope: StudioDeliveryScope;
  task: { taskId: string; taskVersion: number; title: string; projectId: string };
  currentOutcome?: DeliveryOutcome | null;
  disabled?: boolean;
  transport?: StudioDeliveryTransport;
  onRecorded?: (result: StudioDeliveryCommandSuccess<'delivery.outcome.record'>) => void | Promise<void>;
};

const field = 'mt-1 min-h-10 w-full rounded-xl border border-[var(--av-color-border-strong)] bg-[var(--av-color-bg)] px-3 py-2 text-sm';
const button = 'inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--av-color-border-strong)] bg-[#ffbc03] px-3 py-2 text-sm font-black text-[#002C4B] disabled:cursor-not-allowed disabled:opacity-50';

export default function DeliveryOutcomeEditor({ scope, task, currentOutcome, disabled = false, transport, onRecorded }: DeliveryOutcomeEditorProps) {
  const [status, setStatus] = useState<StudioDeliveryOutcomeStatus>(currentOutcome?.status ?? 'achieved');
  const [label, setLabel] = useState(currentOutcome?.label ?? '');
  const [detail, setDetail] = useState(currentOutcome?.detail ?? '');
  const [busy, setBusy] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [committed, setCommitted] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(currentOutcome
    ? `Recorded outcome version ${currentOutcome.version}. Monitor can now read this exact task/import lineage.` : '');
  const valid = Boolean(label.trim()) && label.length <= 200 && Boolean(detail.trim()) && detail.length <= 4_000;
  const submit = async () => {
    if ((!valid && !pendingKey) || busy || disabled || committed) { setError('Add a concise outcome label and recorded human detail.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const result = pendingKey
        ? await retryStudioDeliveryCommand(scope, pendingKey, transport) as StudioDeliveryCommandSuccess<'delivery.outcome.record'>
        : await executeStudioDeliveryCommand(scope, 'delivery.outcome.record', {
          taskId: task.taskId, expectedTaskVersion: task.taskVersion, expectedOutcomeVersion: currentOutcome?.version ?? null,
          status, label: label.trim(), detail: detail.trim(),
        }, {}, transport);
      setPendingKey(null); setCommitted(true);
      setMessage(`Recorded outcome version ${result.resource.version}. Monitor can now read this exact task/import lineage.`);
      try { await onRecorded?.(result); }
      catch { setMessage(`Outcome version ${result.resource.version} was recorded, but the surrounding view did not reload. Refresh before recording another version.`); }
    } catch (caught) {
      if (caught instanceof StudioDeliveryBoundaryError && caught.pendingKey) setPendingKey(caught.pendingKey);
      setError(caught instanceof Error ? caught.message : 'Outcome was not confirmed. Reload current task authority before retrying.');
    }
    finally { setBusy(false); }
  };
  return <section data-testid="delivery-outcome-editor" className="rounded-2xl border border-[var(--av-color-border)] p-4" aria-labelledby="delivery-outcome-title">
    <h3 id="delivery-outcome-title" className="text-lg font-black">Record human Delivery outcome</h3>
    <p className="mt-1 text-sm font-semibold text-[var(--av-color-text-muted)]">This records an explicit human outcome against the exact authoritative imported task. It does not infer completion from task status or activity.</p>
    <p className="mt-3 text-sm font-bold">{task.title} · task version {task.taskVersion}{currentOutcome ? ` · outcome version ${currentOutcome.version}` : ''}</p>
    {error && <p role="alert" className="mt-3 rounded-xl border border-red-500 p-3 font-bold">{error}</p>}
    {message && <p role="status" className="mt-3 rounded-xl border border-emerald-500 p-3 font-bold">{message}</p>}
    <label className="mt-3 block text-sm font-black">Outcome status<select className={field} value={status} disabled={busy || Boolean(pendingKey) || committed} onChange={event => setStatus(event.target.value as StudioDeliveryOutcomeStatus)}><option value="achieved">Achieved</option><option value="partial">Partially achieved</option><option value="not_achieved">Not achieved</option></select></label>
    <label className="mt-3 block text-sm font-black">Outcome label<input className={field} maxLength={200} value={label} disabled={busy || Boolean(pendingKey) || committed} onChange={event => setLabel(event.target.value)}/></label>
    <label className="mt-3 block text-sm font-black">Recorded outcome detail<textarea className={field} rows={4} maxLength={4_000} value={detail} disabled={busy || Boolean(pendingKey) || committed} onChange={event => setDetail(event.target.value)}/></label>
    <button type="button" data-testid="record-delivery-outcome" className={`${button} mt-4`} disabled={disabled || busy || committed || (!valid && !pendingKey)} onClick={() => void submit()}>{busy ? (pendingKey ? 'Confirming outcome…' : 'Recording…') : pendingKey ? 'Confirm recorded outcome' : currentOutcome ? 'Record new outcome version' : 'Record outcome'}</button>
  </section>;
}
