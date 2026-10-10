import React, { useMemo, useState } from 'react';
import {
  executeStudioDeliveryCommand,
  retryStudioDeliveryCommand,
  StudioDeliveryBoundaryError,
  type StudioDeliveryScope,
  type StudioDeliveryTransport,
} from '../../services/productAcceptanceBridge/client';
import type {
  StudioDeliveryApprovedWorkItem,
  StudioDeliveryCommandSuccess,
} from '../../services/productAcceptanceBridge/contracts';

export type ApprovedStudioArtifactSelector = {
  artifactId: string;
  artifactVersionId: string;
  aggregateVersion: number;
  title: string;
  lifecycle: 'approved';
};

export type StudioApprovedArtifactPublishProps = {
  key?: React.Key;
  scope: StudioDeliveryScope;
  artifact: ApprovedStudioArtifactSelector;
  projectId: string;
  disabled?: boolean;
  transport?: StudioDeliveryTransport;
  initialWorkItems?: StudioDeliveryApprovedWorkItem[];
  onPublished?: (result: StudioDeliveryCommandSuccess<'studio.approved-artifact.publish'>) => void | Promise<void>;
};

export type StudioDeliveryApprovedWorkItemDraft = Omit<StudioDeliveryApprovedWorkItem, 'acceptanceCriteria'> & { acceptanceCriteriaText: string };
export const createApprovedWorkItemDraft = (item: StudioDeliveryApprovedWorkItem): StudioDeliveryApprovedWorkItemDraft => ({
  type: item.type, title: item.title, description: item.description, acceptanceCriteriaText: item.acceptanceCriteria.join('\n'),
});
export const normalizeApprovedWorkItemDraft = (item: StudioDeliveryApprovedWorkItemDraft): StudioDeliveryApprovedWorkItem => ({
  type: item.type, title: item.title, description: item.description,
  acceptanceCriteria: splitApprovedAcceptanceCriteria(item.acceptanceCriteriaText),
});
const blankItem = (): StudioDeliveryApprovedWorkItemDraft => createApprovedWorkItemDraft({ type: 'Task', title: '', description: '', acceptanceCriteria: [] });
const field = 'mt-1 min-h-10 w-full rounded-xl border border-[var(--av-color-border-strong)] bg-[var(--av-color-bg)] px-3 py-2 text-sm';
const button = 'inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--av-color-border-strong)] px-3 py-2 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50';

export const splitApprovedAcceptanceCriteria = (value: string) => value.split('\n').map(line => line.trim()).filter(Boolean);
export const isApprovedWorkItemComplete = (item: StudioDeliveryApprovedWorkItem) => Boolean(item.title.trim())
  && item.title.length <= 300 && item.description.length <= 20_000
  && item.acceptanceCriteria.length <= 100 && item.acceptanceCriteria.every(value => value.length > 0 && value.length <= 2_000);

export default function StudioApprovedArtifactPublish({
  scope, artifact, projectId, disabled = false, transport,
  initialWorkItems = [{ type: 'Task', title: '', description: '', acceptanceCriteria: [] }], onPublished,
}: StudioApprovedArtifactPublishProps) {
  const [items, setItems] = useState(() => initialWorkItems.map(createApprovedWorkItemDraft));
  const [busy, setBusy] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const normalizedItems = useMemo(() => items.map(normalizeApprovedWorkItemDraft), [items]);
  const valid = useMemo(() => normalizedItems.length > 0 && normalizedItems.length <= 100 && normalizedItems.every(isApprovedWorkItemComplete), [normalizedItems]);
  const change = (index: number, value: StudioDeliveryApprovedWorkItemDraft) => setItems(current => current.map((item, position) => position === index ? value : item));
  const editingLocked = disabled || busy || committed || Boolean(pendingKey);
  const submit = async () => {
    if ((!valid && !pendingKey) || disabled || busy || committed) { setError('Complete each human-authored work item before publishing.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const result = pendingKey
        ? await retryStudioDeliveryCommand(scope, pendingKey, transport)
        : await executeStudioDeliveryCommand(scope, 'studio.approved-artifact.publish', {
          artifactId: artifact.artifactId,
          expectedArtifactVersionId: artifact.artifactVersionId,
          expectedAggregateVersion: artifact.aggregateVersion,
          projectId,
          workItems: normalizedItems,
        }, {}, transport);
      if (result.action !== 'studio.approved-artifact.publish') throw new StudioDeliveryBoundaryError('INVALID_COMMAND');
      const publicationResult = result as StudioDeliveryCommandSuccess<'studio.approved-artifact.publish'>;
      setPendingKey(null); setCommitted(true);
      setMessage(`Published ${publicationResult.resource.workItemCount} approved work items to a new immutable Delivery document generation.`);
      try { await onPublished?.(publicationResult); }
      catch { setError('Publication committed, but the authoritative archive reload failed. Reload Studio before taking another action.'); }
    } catch (caught) {
      setPendingKey(caught instanceof StudioDeliveryBoundaryError && caught.pendingKey ? caught.pendingKey : null);
      setError(caught instanceof Error ? caught.message : 'Publication was not confirmed. Reload current authority before retrying.');
    } finally { setBusy(false); }
  };
  return <section data-testid="studio-approved-artifact-publish" className="av-surface p-5" aria-labelledby="studio-publish-title">
    <h2 id="studio-publish-title" className="text-xl font-black">Publish approved Studio artifact to Delivery</h2>
    <p className="mt-2 text-sm font-semibold text-[var(--av-color-text-muted)]">
      A human must author and approve this structured work-item list. Publication binds it to the exact approved artifact version; it does not parse BRD prose or generate tasks with AI.
    </p>
    <p className="mt-3 break-all rounded-xl bg-[var(--av-color-bg-subtle)] p-3 text-xs font-bold">{artifact.title} · approved version {artifact.artifactVersionId}</p>
    {error && <p role="alert" className="mt-3 rounded-xl border border-red-500 p-3 font-bold">{error}</p>}
    {message && <p role="status" className="mt-3 rounded-xl border border-emerald-500 p-3 font-bold">{message}</p>}
    <div className="mt-4 space-y-4" data-testid="studio-approved-work-items">{items.map((item, index) => <fieldset key={index} className="rounded-xl border border-[var(--av-color-border)] p-4">
      <legend className="px-2 font-black">Human-approved work item {index + 1}</legend>
      <label className="block text-sm font-black">Type<select disabled={editingLocked} className={field} value={item.type} onChange={event => change(index, { ...item, type: event.target.value as StudioDeliveryApprovedWorkItem['type'] })}><option>Epic</option><option>Story</option><option>Task</option></select></label>
      <label className="mt-3 block text-sm font-black">Title<input disabled={editingLocked} className={field} maxLength={300} value={item.title} onChange={event => change(index, { ...item, title: event.target.value })}/></label>
      <label className="mt-3 block text-sm font-black">Description<textarea disabled={editingLocked} className={field} rows={3} maxLength={20_000} value={item.description} onChange={event => change(index, { ...item, description: event.target.value })}/></label>
      <label className="mt-3 block text-sm font-black">Acceptance criteria · one per line<textarea disabled={editingLocked} className={field} rows={3} value={item.acceptanceCriteriaText} onChange={event => change(index, { ...item, acceptanceCriteriaText: event.target.value })}/></label>
      {items.length > 1 && <button type="button" disabled={editingLocked} className={`${button} mt-3`} onClick={() => setItems(current => current.filter((_, position) => position !== index))}>Remove work item {index + 1}</button>}
    </fieldset>)}</div>
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" className={button} disabled={editingLocked || items.length >= 100} onClick={() => setItems(current => [...current, blankItem()])}>Add human-authored work item</button>
      <button type="button" data-testid="publish-approved-studio-artifact" className={`${button} bg-[#ffbc03] text-[#002C4B]`} disabled={busy || disabled || committed || (!pendingKey && !valid)} onClick={() => void submit()}>{busy ? 'Publishing…' : committed ? 'Published' : pendingKey ? 'Retry same publication' : 'Publish approved work items'}</button>
    </div>
  </section>;
}
