import React, { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  TRANSCRIPT_ASSESS_APPLICATION_INTENTS,
  type TranscriptAssessApplicationIntent,
  type TranscriptBoundAssessCandidateProjection,
  type TranscriptFlowProjection,
} from '../../services/transcriptFlow/contracts';

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005ea8]';
const fieldClass = `mt-1 min-h-10 w-full rounded-xl border border-[var(--av-color-border-strong)] bg-[var(--av-color-bg)] px-3 text-sm text-[var(--av-color-text)] ${focusRing}`;
const primaryClass = `inline-flex min-h-10 items-center justify-center rounded-xl bg-[#ffbc03] px-4 text-sm font-black text-[#002C4B] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
const secondaryClass = `inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--av-color-border-strong)] px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

type Selection = { candidateId: string; candidateVersion: number; intent: TranscriptAssessApplicationIntent; target: string };
type SourceSetLineage = { sourceSetId: string; sourceSetVersionSelector: string; expectedVersion: number; ordinal: number };
type ExactCandidateLineage = {
  inputBundleId: string; inputBundleVersionSelector: string; expectedInputBundleVersion: number;
  sourceSetId: string; sourceSetVersionSelector: string; expectedSourceSetVersion: number; sourceVersionSelector: string;
};

const numericVersion = (label: string) => Number(label.match(/(?:version|v)\s*(\d+)/i)?.[1] || 0);

export const AssessTranscriptCandidateReview = memo(function AssessTranscriptCandidateReview({
  projection, assessDrafts, locked, onExtract, onReview, onPreview, onResolveConflict, onApply,
}: {
  projection: TranscriptFlowProjection;
  assessDrafts: Array<{ id: string; label: string; versionLabel: string }>;
  locked: boolean;
  onExtract(input: { inputBundleId: string; inputBundleVersionSelector: string; expectedInputBundleVersion: number; selections: Array<SourceSetLineage & { sourceVersionSelector: string }> }): Promise<unknown> | unknown;
  onReview(input: ExactCandidateLineage & { candidateId: string; candidateVersion: number; status: 'accepted' | 'rejected' | 'edited'; value?: string; reason?: string; relationship?: 'neutral' | 'supporting' | 'contradictory'; applicationIntent?: TranscriptAssessApplicationIntent; applyTarget?: string }): Promise<unknown> | unknown;
  onPreview(input: { assessDraftId: string; expectedDraftVersion: number; inputBundleId: string; inputBundleVersionSelector: string; expectedInputBundleVersion: number; sourceSetVersions: SourceSetLineage[]; selections: Selection[] }): Promise<unknown> | unknown;
  onResolveConflict(input: { conflictId: string; resolutionVersion: number; resolution: 'choose_candidate' | 'retain_manual' | 'authored_resolution'; candidateId?: string; authoredValue?: string; rationale: string }): Promise<unknown> | unknown;
  onApply(input: { previewBatchId: string; assessDraftId: string; expectedDraftVersion: number; inputBundleId: string; inputBundleVersionSelector: string; expectedInputBundleVersion: number; sourceSetVersions: SourceSetLineage[] }): Promise<unknown> | unknown;
}) {
  const [bundleToken, setBundleToken] = useState('');
  const [assessDraftId, setAssessDraftId] = useState('');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [editingId, setEditingId] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editReason, setEditReason] = useState('');
  const [restoreEditFocusId, setRestoreEditFocusId] = useState('');
  const [conflictRationales, setConflictRationales] = useState<Record<string, string>>({});
  const [authoredResolutions, setAuthoredResolutions] = useState<Record<string, string>>({});
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => { if (editingId) editInputRef.current?.focus(); }, [editingId]);
  useEffect(() => {
    if (!restoreEditFocusId || editingId || locked) return;
    const button = editButtonRefs.current.get(restoreEditFocusId);
    if (!button || button.disabled) return;
    button.focus({ preventScroll: true });
    if (document.activeElement === button) setRestoreEditFocusId('');
  }, [editingId, locked, projection.assessCandidates, restoreEditFocusId]);

  const lockedBundles = useMemo(() => projection.inputBundles.filter(bundle => bundle.status === 'locked'), [projection.inputBundles]);
  const selectedBundle = useMemo(() => lockedBundles.find(bundle => `${bundle.id}:${bundle.versionSelector}` === bundleToken), [bundleToken, lockedBundles]);
  const sourceSetLineage = useMemo<SourceSetLineage[]>(() => selectedBundle?.sourceSetVersions.map(lineage => ({
    sourceSetId: lineage.sourceSetId, sourceSetVersionSelector: lineage.sourceSetVersionSelector,
    expectedVersion: lineage.sourceSetVersion, ordinal: lineage.ordinal,
  })) || [], [selectedBundle]);
  const exactRun = useMemo(() => selectedBundle ? projection.assessRuns.find(run => run.inputBundleId === selectedBundle.id
    && run.inputBundleVersionSelector === selectedBundle.versionSelector
    && JSON.stringify(run.sourceSetVersions) === JSON.stringify(selectedBundle.sourceSetVersions)) : undefined, [projection.assessRuns, selectedBundle]);
  const exactCandidates = useMemo(() => !selectedBundle || !exactRun ? [] : projection.assessCandidates.filter(candidate =>
    candidate.inputBundleId === selectedBundle.id && candidate.inputBundleVersionSelector === selectedBundle.versionSelector
    && exactRun.extractionBindings.some(binding => binding.extractionBindingId === candidate.extractionBindingId
      && binding.extractionJobId === candidate.extractionJobId && binding.sourceSetId === candidate.sourceSetId
      && binding.sourceSetVersionSelector === candidate.sourceSetVersionSelector
      && binding.sourceSetVersion === candidate.sourceSetVersion
      && binding.sourceVersionSelector === candidate.sourceVersionSelector)), [exactRun, projection.assessCandidates, selectedBundle]);
  const matchingCandidates = useMemo(() => exactCandidates.filter(candidate => !deferredQuery
    || `${candidate.field} ${candidate.value} ${candidate.sourceLabel} ${candidate.sourceLocator}`.toLocaleLowerCase().includes(deferredQuery)), [deferredQuery, exactCandidates]);
  const visibleCandidates = useMemo(() => matchingCandidates.slice(0, 50), [matchingCandidates]);
  const selected = useMemo(() => (Object.values(selections) as Selection[]).filter(selection => exactCandidates.some(candidate =>
    candidate.id === selection.candidateId && candidate.candidateVersion === selection.candidateVersion
    && ['accepted', 'edited'].includes(candidate.status) && candidate.provenanceState === 'anchored')),
  [exactCandidates, selections]);
  const selectedDraft = assessDrafts.find(draft => draft.id === assessDraftId);
  const expectedDraftVersion = selectedDraft ? numericVersion(selectedDraft.versionLabel) : 0;
  const lineageComplete = Boolean(selectedBundle && sourceSetLineage.length === selectedBundle.sourceSetIds.length
    && sourceSetLineage.every((lineage, index) => lineage.sourceSetId === selectedBundle.sourceSetIds[index] && lineage.ordinal === index + 1));
  const extractionSelections = useMemo(() => selectedBundle?.sourceVersionSelectors.flatMap(sourceVersionSelector => {
    const matches = exactRun?.extractionBindings.filter(binding => binding.sourceVersionSelector === sourceVersionSelector) || [];
    return matches.length === 1 ? [{
      sourceSetId: matches[0].sourceSetId, sourceSetVersionSelector: matches[0].sourceSetVersionSelector,
      expectedVersion: matches[0].sourceSetVersion,
      ordinal: sourceSetLineage.find(lineage => lineage.sourceSetId === matches[0].sourceSetId
        && lineage.sourceSetVersionSelector === matches[0].sourceSetVersionSelector)?.ordinal || 0,
      sourceVersionSelector,
    }] : [];
  }) || [], [exactRun, selectedBundle, sourceSetLineage]);
  const exactExtractionReady = Boolean(selectedBundle && lineageComplete && extractionSelections.length === selectedBundle.sourceVersionSelectors.length);
  const latestPreview = projection.assessApplyPreviews.find(preview => preview.assessDraftId === assessDraftId
    && preview.inputBundleId === selectedBundle?.id && preview.inputBundleVersionSelector === selectedBundle?.versionSelector);
  const unresolvedMaterialConflict = latestPreview?.conflicts.some(conflict => conflict.material && conflict.resolution === 'unresolved') || false;

  const candidateLineage = (candidate: TranscriptBoundAssessCandidateProjection): ExactCandidateLineage | null => {
    if (!selectedBundle || candidate.inputBundleId !== selectedBundle.id || candidate.inputBundleVersionSelector !== selectedBundle.versionSelector) return null;
    const lineage = sourceSetLineage.find(item => item.sourceSetId === candidate.sourceSetId
      && item.sourceSetVersionSelector === candidate.sourceSetVersionSelector && item.expectedVersion === candidate.sourceSetVersion);
    const binding = exactRun?.extractionBindings.find(item => item.extractionBindingId === candidate.extractionBindingId
      && item.extractionJobId === candidate.extractionJobId && item.sourceSetId === candidate.sourceSetId
      && item.sourceSetVersionSelector === candidate.sourceSetVersionSelector && item.sourceSetVersion === candidate.sourceSetVersion
      && item.sourceVersionSelector === candidate.sourceVersionSelector);
    if (!lineage || !binding) return null;
    return {
      inputBundleId: selectedBundle.id, inputBundleVersionSelector: selectedBundle.versionSelector,
      expectedInputBundleVersion: selectedBundle.version, sourceSetId: lineage.sourceSetId,
      sourceSetVersionSelector: lineage.sourceSetVersionSelector, expectedSourceSetVersion: lineage.expectedVersion,
      sourceVersionSelector: candidate.sourceVersionSelector,
    };
  };
  const resetScopedState = () => { setSelections({}); setEditingId(''); setRestoreEditFocusId(''); setConflictRationales({}); setAuthoredResolutions({}); };
  const closeEditor = (candidateId: string) => { setRestoreEditFocusId(candidateId); setEditingId(''); };

  if (!projection.features.assessMultisourceApplyEnabled) {
    return <section aria-labelledby="transcript-candidate-review-title" className="premium-surface rounded-3xl border border-[var(--av-color-border)] p-5 shadow-sm"><p className="av-eyebrow">Assess candidate review</p><h2 id="transcript-candidate-review-title" className="mt-2 text-xl font-black">Multi-source candidate review</h2><p role="status" className="mt-3 rounded-xl bg-[var(--av-color-bg-subtle)] p-4 text-sm font-bold">{projection.features.disabledReason || 'Transcript-assisted Assess is disabled for this workspace.'}</p></section>;
  }

  const toggle = (candidate: TranscriptBoundAssessCandidateProjection) => setSelections(current => {
    if (current[candidate.id]) { const next = { ...current }; delete next[candidate.id]; return next; }
    return { ...current, [candidate.id]: { candidateId: candidate.id, candidateVersion: candidate.candidateVersion, intent: candidate.applicationIntent, target: candidate.applyTarget || 'evidence.unresolved' } };
  });

  return <section aria-labelledby="transcript-candidate-review-title" className="premium-surface rounded-3xl border border-[var(--av-color-border)] p-5 shadow-sm">
    <p className="av-eyebrow">Transcript-assisted Assess</p>
    <h2 id="transcript-candidate-review-title" className="mt-2 text-xl font-black">Review one exact input-bundle version</h2>
    <p id="candidate-lineage-help" className="mt-2 text-sm font-semibold text-[var(--av-color-text-muted)]">Candidates appear only when their projected AI job and extraction binding belong to the selected immutable bundle version. Changing bundle or draft clears every local selection.</p>
    <div className="mt-5 grid gap-4 md:grid-cols-3">
      <label className="text-xs font-black uppercase tracking-[0.12em] text-[var(--av-color-text-muted)]">Locked input bundle<select className={fieldClass} value={bundleToken} aria-describedby="candidate-lineage-help candidate-scope-status" onChange={event => { setBundleToken(event.target.value); resetScopedState(); }}><option value="">Select a locked bundle</option>{lockedBundles.map(bundle => <option key={bundle.versionSelector} value={`${bundle.id}:${bundle.versionSelector}`}>{bundle.label} · {bundle.versionLabel} · {bundle.sourceCount} sources</option>)}</select></label>
      <label className="text-xs font-black uppercase tracking-[0.12em] text-[var(--av-color-text-muted)]">Editable Assess draft<select className={fieldClass} value={assessDraftId} aria-describedby="candidate-scope-status" onChange={event => { setAssessDraftId(event.target.value); resetScopedState(); }}><option value="">Select a draft</option>{assessDrafts.map(draft => <option key={draft.id} value={draft.id}>{draft.label} · {draft.versionLabel}</option>)}</select></label>
      <label className="text-xs font-black uppercase tracking-[0.12em] text-[var(--av-color-text-muted)]">Filter candidates<input type="search" className={fieldClass} value={query} aria-describedby="transcript-candidate-result-count" onChange={event => setQuery(event.target.value)} /></label>
    </div>
    <p id="candidate-scope-status" role="status" className="mt-3 text-xs font-bold">{selectedBundle ? `${selectedBundle.versionLabel}; ${exactRun ? `${exactRun.extractionJobIds.length} exact extraction jobs` : 'no exact extraction run projected'}; ${exactCandidates.length} bound candidates.` : 'Select one immutable input-bundle version.'}</p>
    {!lineageComplete && selectedBundle ? <p role="alert" className="mt-2 text-sm font-bold text-rose-700">Exact source-set lineage is unavailable. Reload committed state; no mutation is allowed.</p> : null}
    <button type="button" className={`${primaryClass} mt-4`} disabled={locked || !selectedBundle || !exactExtractionReady} onClick={() => selectedBundle && void onExtract({ inputBundleId: selectedBundle.id, inputBundleVersionSelector: selectedBundle.versionSelector, expectedInputBundleVersion: selectedBundle.version, selections: extractionSelections })}>Run governed multi-source extraction</button>
    <p id="transcript-candidate-result-count" className="mt-4 text-xs font-bold text-[var(--av-color-text-muted)]" aria-live="polite">Showing {visibleCandidates.length} of {matchingCandidates.length} matching candidates from this exact bundle version. Filter to reach candidates outside this bounded page.</p>
    <div className="mt-3 grid gap-3">{visibleCandidates.map(candidate => {
      const exactLineage = candidateLineage(candidate);
      const applicable = Boolean(exactLineage) && ['accepted', 'edited'].includes(candidate.status) && candidate.provenanceState === 'anchored';
      const selection = selections[candidate.id];
      const citationId = `candidate-citation-${candidate.id}`;
      return <article key={candidate.id} className="rounded-2xl border border-[var(--av-color-border)] p-4 [content-visibility:auto] [contain-intrinsic-size:0_240px]" aria-labelledby={`candidate-${candidate.id}`} aria-describedby={citationId}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id={`candidate-${candidate.id}`} className="font-black">{candidate.field.replaceAll('_', ' ')}</h3><p className="text-xs font-semibold text-[var(--av-color-text-muted)]">{candidate.sourceLabel} · {candidate.sourceVersionLabel} · job {candidate.extractionJobId.slice(0, 8)} · binding {candidate.extractionBindingId.slice(0, 8)}</p></div><div className="flex flex-wrap gap-2 text-[10px] font-black uppercase"><span className="rounded-full border px-2 py-1">{candidate.status}</span><span className="rounded-full border px-2 py-1">{candidate.relationship}</span><span className="rounded-full border px-2 py-1">{candidate.provenanceState}</span></div></div>
        {editingId === candidate.id ? <div role="dialog" aria-modal="true" aria-labelledby={`edit-title-${candidate.id}`} aria-describedby={citationId} className="mt-3 grid gap-3 rounded-xl border border-[var(--av-color-border-strong)] p-3"><h4 id={`edit-title-${candidate.id}`} className="font-black">Edit candidate as immutable review history</h4><label className="text-xs font-black uppercase tracking-[0.12em] text-[var(--av-color-text-muted)]">Edited value<textarea ref={editInputRef} className={`${fieldClass} min-h-24 py-2`} value={editValue} onChange={event => setEditValue(event.target.value)} /></label><label className="text-xs font-black uppercase tracking-[0.12em] text-[var(--av-color-text-muted)]">Required rationale<input className={fieldClass} value={editReason} onChange={event => setEditReason(event.target.value)} /></label><div className="flex gap-2"><button type="button" className={primaryClass} disabled={locked || !exactLineage || !editValue.trim() || editReason.trim().length < 4} onClick={async () => { if (!exactLineage) return; await onReview({ ...exactLineage, candidateId: candidate.id, candidateVersion: candidate.candidateVersion, status: 'edited', value: editValue.trim(), reason: editReason.trim() }); closeEditor(candidate.id); }}>Save immutable edit</button><button type="button" className={secondaryClass} onClick={() => closeEditor(candidate.id)}>Cancel</button></div></div> : <p className="mt-3 whitespace-pre-wrap text-sm font-bold">{candidate.value}</p>}
        <blockquote id={citationId} aria-label={`Citation for ${candidate.sourceLabel}`} className="mt-2 border-l-2 border-[var(--av-color-border-strong)] pl-3 text-xs font-semibold text-[var(--av-color-text-muted)]">{candidate.safeExcerpt ? `Source excerpt: ${candidate.safeExcerpt}` : 'No browser-safe excerpt supplied.'} Locator: {candidate.sourceLocator}</blockquote>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={primaryClass} disabled={locked || !exactLineage || candidate.status === 'accepted'} onClick={() => exactLineage && void onReview({ ...exactLineage, candidateId: candidate.id, candidateVersion: candidate.candidateVersion, status: 'accepted' })}>Accept</button><button ref={node => { if (node) editButtonRefs.current.set(candidate.id, node); else editButtonRefs.current.delete(candidate.id); }} type="button" className={secondaryClass} disabled={locked || !exactLineage} onClick={() => { setRestoreEditFocusId(''); setEditingId(candidate.id); setEditValue(candidate.value); setEditReason(''); }}>Edit</button><button type="button" className={secondaryClass} disabled={locked || !exactLineage || candidate.status === 'rejected'} onClick={() => exactLineage && void onReview({ ...exactLineage, candidateId: candidate.id, candidateVersion: candidate.candidateVersion, status: 'rejected' })}>Reject</button></div>
        {applicable ? <fieldset className="mt-4 rounded-xl bg-[var(--av-color-bg-subtle)] p-3"><legend className="px-1 text-xs font-black uppercase tracking-[0.12em]">Apply selection</legend><label className="flex min-h-10 items-center gap-2 text-sm font-black"><input type="checkbox" checked={Boolean(selection)} onChange={() => toggle(candidate)} />Include in preview</label>{selection ? <div className="mt-2 grid gap-3 sm:grid-cols-2"><label className="text-xs font-black uppercase tracking-[0.12em] text-[var(--av-color-text-muted)]">Application intent<select className={fieldClass} value={selection.intent} onChange={event => setSelections(current => ({ ...current, [candidate.id]: { ...selection, intent: event.target.value as TranscriptAssessApplicationIntent } }))}>{TRANSCRIPT_ASSESS_APPLICATION_INTENTS.map(intent => <option key={intent} value={intent}>{intent.replaceAll('_', ' ')}</option>)}</select></label><label className="text-xs font-black uppercase tracking-[0.12em] text-[var(--av-color-text-muted)]">Allowlisted target<input className={fieldClass} value={selection.target} onChange={event => setSelections(current => ({ ...current, [candidate.id]: { ...selection, target: event.target.value } }))} /></label></div> : null}</fieldset> : <p role="status" className="mt-3 text-xs font-bold text-amber-800">This candidate remains evidence-only until exact lineage, acceptance, and provenance are complete.</p>}
      </article>;
    })}</div>
    <div className="mt-5 rounded-2xl bg-[var(--av-color-bg-subtle)] p-4"><p className="font-black">Selected for preview: {selected.length}/100</p><button type="button" className={`${primaryClass} mt-3`} disabled={locked || !selectedBundle || !lineageComplete || !assessDraftId || expectedDraftVersion < 1 || selected.length === 0 || selected.length > 100} onClick={() => selectedBundle && void onPreview({ assessDraftId, expectedDraftVersion, inputBundleId: selectedBundle.id, inputBundleVersionSelector: selectedBundle.versionSelector, expectedInputBundleVersion: selectedBundle.version, sourceSetVersions: sourceSetLineage, selections: selected })}>Preview exact Assess changes</button></div>
    {latestPreview ? <div className="mt-5 rounded-2xl border border-[var(--av-color-border-strong)] p-4" aria-labelledby="assess-apply-preview-title"><h3 id="assess-apply-preview-title" className="font-black">Apply preview · {latestPreview.status}</h3><p id="assess-preview-status" role="status" className="mt-1 text-xs font-semibold">Batch {latestPreview.id}; draft version {latestPreview.expectedDraftVersion}; bundle version {latestPreview.inputBundleVersion}; {latestPreview.changes.length} changes; {latestPreview.conflicts.length} conflicts.</p><ul className="mt-3 list-disc space-y-1 pl-5 text-sm font-semibold">{latestPreview.changes.map(change => <li key={`${change.candidateId}-${change.target}`}>{change.summary} → {change.target} ({change.conflictState.replaceAll('_', ' ')})</li>)}</ul>
      <div className="mt-4 grid gap-3">{latestPreview.conflicts.map(conflict => <article key={conflict.id} className="rounded-xl border border-amber-300 p-3" aria-labelledby={`conflict-${conflict.id}`} aria-describedby={`conflict-status-${conflict.id}`}><h4 id={`conflict-${conflict.id}`} className="font-black">Conflict: {conflict.field}</h4><p id={`conflict-status-${conflict.id}`} role="status" className="mt-1 text-sm font-semibold">{conflict.resolution.replaceAll('_', ' ')}. {conflict.candidateSummaries.join(' versus ')}{conflict.manualValue ? `; manual value: ${conflict.manualValue}` : ''}</p>{conflict.resolution === 'unresolved' ? <div className="mt-3 grid gap-3"><label className="text-xs font-black uppercase tracking-[0.12em] text-[var(--av-color-text-muted)]">Resolution rationale<input className={fieldClass} aria-describedby={`conflict-status-${conflict.id}`} value={conflictRationales[conflict.id] || ''} onChange={event => setConflictRationales(current => ({ ...current, [conflict.id]: event.target.value }))} /></label><label className="text-xs font-black uppercase tracking-[0.12em] text-[var(--av-color-text-muted)]">Authored resolution (when selected)<input className={fieldClass} value={authoredResolutions[conflict.id] || ''} onChange={event => setAuthoredResolutions(current => ({ ...current, [conflict.id]: event.target.value }))} /></label><div className="flex flex-wrap gap-2"><button type="button" className={secondaryClass} disabled={locked || (conflictRationales[conflict.id] || '').trim().length < 4 || !conflict.candidateIds[0]} onClick={() => void onResolveConflict({ conflictId: conflict.id, resolutionVersion: conflict.resolutionVersion, resolution: 'choose_candidate', candidateId: conflict.candidateIds[0], rationale: conflictRationales[conflict.id].trim() })}>Choose first candidate</button><button type="button" className={secondaryClass} disabled={locked || !conflict.manualValue || (conflictRationales[conflict.id] || '').trim().length < 4} onClick={() => void onResolveConflict({ conflictId: conflict.id, resolutionVersion: conflict.resolutionVersion, resolution: 'retain_manual', rationale: conflictRationales[conflict.id].trim() })}>Retain manual value</button><button type="button" className={secondaryClass} disabled={locked || !(authoredResolutions[conflict.id] || '').trim() || (conflictRationales[conflict.id] || '').trim().length < 4} onClick={() => void onResolveConflict({ conflictId: conflict.id, resolutionVersion: conflict.resolutionVersion, resolution: 'authored_resolution', authoredValue: authoredResolutions[conflict.id].trim(), rationale: conflictRationales[conflict.id].trim() })}>Use authored resolution</button></div></div> : <p className="mt-2 text-xs font-bold">Resolution v{conflict.resolutionVersion}: {conflict.rationale}</p>}</article>)}</div>
      <button type="button" className={`${primaryClass} mt-4`} disabled={locked || !selectedBundle || latestPreview.status !== 'ready' || unresolvedMaterialConflict || !lineageComplete} aria-describedby="assess-preview-status" onClick={() => selectedBundle && void onApply({ previewBatchId: latestPreview.id, assessDraftId: latestPreview.assessDraftId, expectedDraftVersion: latestPreview.expectedDraftVersion, inputBundleId: latestPreview.inputBundleId, inputBundleVersionSelector: latestPreview.inputBundleVersionSelector, expectedInputBundleVersion: latestPreview.inputBundleVersion, sourceSetVersions: sourceSetLineage })}>Apply batch as one Assess draft version</button>{unresolvedMaterialConflict ? <p role="alert" className="mt-2 text-sm font-bold text-rose-700">Resolve every material conflict before applying or finalizing the Assess draft.</p> : null}
    </div> : null}
  </section>;
});
