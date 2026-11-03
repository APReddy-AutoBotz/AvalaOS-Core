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
import { deriveRequirementProposals } from '../../services/productAcceptanceBridge/requirementProposals';

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
  approvedContent: Record<string, unknown>;
  projectId: string;
  disabled?: boolean;
  transport?: StudioDeliveryTransport;
  initialWorkItems?: StudioDeliveryApprovedWorkItem[];
  onPublished?: (result: StudioDeliveryCommandSuccess<'studio.approved-artifact.publish'>) => void | Promise<void>;
};

export type StudioDeliveryApprovedWorkItemDraft = Omit<StudioDeliveryApprovedWorkItem, 'acceptanceCriteria'> & { acceptanceCriteriaText: string };
export const createApprovedWorkItemDraft = (item: StudioDeliveryApprovedWorkItem): StudioDeliveryApprovedWorkItemDraft => ({
  type: item.type, title: item.title, description: item.description, acceptanceCriteriaText: item.acceptanceCriteria.join('\n'),
  requirementLinks: item.requirementLinks,
});
export const normalizeApprovedWorkItemDraft = (item: StudioDeliveryApprovedWorkItemDraft): StudioDeliveryApprovedWorkItem => ({
  type: item.type, title: item.title, description: item.description,
  acceptanceCriteria: splitApprovedAcceptanceCriteria(item.acceptanceCriteriaText),
  requirementLinks: item.requirementLinks,
});
const field = 'mt-1 min-h-10 w-full rounded-xl border border-[var(--av-color-border-strong)] bg-[var(--av-color-bg)] px-3 py-2 text-sm';
const button = 'inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--av-color-border-strong)] px-3 py-2 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50';

export const splitApprovedAcceptanceCriteria = (value: string) => value.split('\n').map(line => line.trim()).filter(Boolean);
export const isApprovedWorkItemComplete = (item: StudioDeliveryApprovedWorkItem) => Boolean(item.title.trim())
  && item.title.length <= 300 && item.description.length <= 20_000
  && item.acceptanceCriteria.length <= 100 && item.acceptanceCriteria.every(value => value.length > 0 && value.length <= 2_000)
  && item.requirementLinks.length > 0 && item.requirementLinks.length <= 100;

export default function StudioApprovedArtifactPublish({
  scope, artifact, approvedContent, projectId, disabled = false, transport, initialWorkItems, onPublished,
}: StudioApprovedArtifactPublishProps) {
  const derivation = useMemo(() => deriveRequirementProposals(approvedContent), [approvedContent]);
  const [items, setItems] = useState(() => (initialWorkItems ?? derivation.proposals).map(createApprovedWorkItemDraft));
  const [selected, setSelected] = useState(() => new Set((initialWorkItems ?? derivation.proposals).map((_, index) => index)));
  const [busy, setBusy] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const normalizedItems = useMemo(() => items.map(normalizeApprovedWorkItemDraft), [items]);
  const selectedItems = useMemo(() => normalizedItems.filter((_, index) => selected.has(index)), [normalizedItems, selected]);
  const valid = useMemo(() => !derivation.blockedReason && selectedItems.length > 0 && selectedItems.length <= 100
    && selectedItems.every(isApprovedWorkItemComplete), [derivation.blockedReason, selectedItems]);
  const change = (index: number, value: StudioDeliveryApprovedWorkItemDraft) => setItems(current => current.map((item, position) => position === index ? value : item));
  const editingLocked = disabled || busy || committed || Boolean(pendingKey);
  const submit = async () => {
    if ((!valid && !pendingKey) || disabled || busy || committed) { setError('Select at least one complete requirement-bound proposal before publishing.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const result = pendingKey
        ? await retryStudioDeliveryCommand(scope, pendingKey, transport)
        : await executeStudioDeliveryCommand(scope, 'studio.approved-artifact.publish', {
          artifactId: artifact.artifactId,
          expectedArtifactVersionId: artifact.artifactVersionId,
          expectedAggregateVersion: artifact.aggregateVersion,
          projectId,
          workItems: selectedItems,
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
      Avala deterministically proposes work only from explicit requirements in the exact approved artifact. Review, edit, and select proposals before publication; no provider call is used.
    </p>
    <p className="mt-3 break-all rounded-xl bg-[var(--av-color-bg-subtle)] p-3 text-xs font-bold">{artifact.title} · approved version {artifact.artifactVersionId}</p>
    {derivation.blockedReason && <p role="alert" className="mt-3 rounded-xl border border-amber-500 p-3 font-bold">{derivation.blockedReason} No Delivery materialization is available.</p>}
    {error && <p role="alert" className="mt-3 rounded-xl border border-red-500 p-3 font-bold">{error}</p>}
    {message && <p role="status" className="mt-3 rounded-xl border border-emerald-500 p-3 font-bold">{message}</p>}
    <div className="mt-4 flex items-center justify-between rounded-xl bg-[var(--av-color-bg-subtle)] p-3 text-sm font-bold"><span>{derivation.requirementCount} approved requirement{derivation.requirementCount === 1 ? '' : 's'} produced {items.length} proposal{items.length === 1 ? '' : 's'}.</span><span>{selected.size} selected</span></div>
    <div className="mt-4 space-y-4" data-testid="studio-approved-work-items">{items.map((item, index) => <fieldset key={index} data-testid="studio-approved-work-item" className="rounded-xl border border-[var(--av-color-border)] p-4">
      <legend className="px-2 font-black">Proposal {index + 1}</legend>
      <label className="mb-3 flex items-center gap-2 text-sm font-black"><input type="checkbox" disabled={editingLocked} checked={selected.has(index)} onChange={() => setSelected(current => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })}/>Select for publication</label>
      <label className="block text-sm font-black">Type<select data-testid="studio-approved-work-item-type" disabled={editingLocked} className={field} value={item.type} onChange={event => change(index, { ...item, type: event.target.value as StudioDeliveryApprovedWorkItem['type'] })}><option>Epic</option><option>Story</option><option>Task</option></select></label>
      <label className="mt-3 block text-sm font-black">Title<input data-testid="studio-approved-work-item-title" disabled={editingLocked} className={field} maxLength={300} value={item.title} onChange={event => change(index, { ...item, title: event.target.value })}/></label>
      <label className="mt-3 block text-sm font-black">Description<textarea data-testid="studio-approved-work-item-description" disabled={editingLocked} className={field} rows={3} maxLength={20_000} value={item.description} onChange={event => change(index, { ...item, description: event.target.value })}/></label>
      <label className="mt-3 block text-sm font-black">Acceptance criteria · one per line<textarea data-testid="studio-approved-work-item-acceptance" disabled={editingLocked} className={field} rows={3} value={item.acceptanceCriteriaText} onChange={event => change(index, { ...item, acceptanceCriteriaText: event.target.value })}/></label>
      <details className="mt-3 rounded-xl bg-[var(--av-color-bg-subtle)] p-3"><summary className="cursor-pointer text-sm font-black">Approved requirement links · {item.requirementLinks.length}</summary><ul className="mt-2 space-y-2 text-xs">{item.requirementLinks.map(link => <li key={`${link.sectionId}:${link.requirementText}`}><span className="font-black">{link.sectionTitle} · {link.sectionId}</span><br/>{link.requirementText}</li>)}</ul></details>
    </fieldset>)}</div>
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" data-testid="publish-approved-studio-artifact" className={`${button} bg-[#ffbc03] text-[#002C4B]`} disabled={busy || disabled || committed || (!pendingKey && !valid)} onClick={() => void submit()}>{busy ? 'Publishing…' : committed ? 'Published' : pendingKey ? 'Retry same publication' : `Publish ${selected.size} selected proposal${selected.size === 1 ? '' : 's'}`}</button>
    </div>
  </section>;
}
