import React, { memo, useMemo, useState } from 'react';
import {
  TRANSCRIPT_SOURCE_ROLES,
  TRANSCRIPT_SOURCE_SET_MAX_MEMBERS,
  type TranscriptFlowProjection,
  type TranscriptSourceRole,
} from '../../services/transcriptFlow/contracts';
import { validateTranscriptSourceSetSelection } from '../../services/transcriptFlow/sourceSets';

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005ea8]';
const fieldClass = `mt-1 min-h-10 w-full rounded-xl border border-[var(--av-color-border-strong)] bg-[var(--av-color-bg)] px-3 text-sm text-[var(--av-color-text)] ${focusRing}`;
const primaryClass = `inline-flex min-h-10 items-center justify-center rounded-xl bg-[#ffbc03] px-4 text-sm font-black text-[#002C4B] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
const secondaryClass = `inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--av-color-border-strong)] px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

type DraftMember = { sourceId: string; versionSelector: string; role: TranscriptSourceRole; note: string };

export type TranscriptSourceSetCommitInput = {
  sourceSetId?: string;
  expectedVersion: number;
  label: string;
  description?: string;
  members: Array<{ sourceId: string; versionSelector: string; role: TranscriptSourceRole; ordinal: number; note?: string }>;
};

export const TranscriptSourceLibrary = memo(function TranscriptSourceLibrary({
  projection,
  locked,
  onCommitSourceSet,
  onLockInputBundle,
  onSetJourneyState,
}: {
  projection: TranscriptFlowProjection;
  locked: boolean;
  onCommitSourceSet(input: TranscriptSourceSetCommitInput): Promise<unknown> | unknown;
  onLockInputBundle(input: { sourceSetVersionSelectors: string[]; label: string }): Promise<unknown> | unknown;
  onSetJourneyState(input: { journeyId?: string; desiredExitModule: 'assess' | 'studio' | 'delivery' | 'monitor'; status: 'active' | 'stopped' }): Promise<unknown> | unknown;
}) {
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [members, setMembers] = useState<DraftMember[]>([]);
  const [selectedSetVersionSelectors, setSelectedSetVersionSelectors] = useState<string[]>([]);
  const [bundleLabel, setBundleLabel] = useState('Assess transcript bundle');
  const [desiredExitModule, setDesiredExitModule] = useState<'assess' | 'studio' | 'delivery' | 'monitor'>('assess');
  const [validationError, setValidationError] = useState('');
  const [editingSourceSetId, setEditingSourceSetId] = useState('');

  const selectedVersions = useMemo(() => new Set(members.map(member => member.versionSelector)), [members]);
  const totalCharacters = useMemo(() => members.reduce((total, member) => total
    + (projection.sourceVersions.find(source => source.versionSelector === member.versionSelector)?.extractedCharacterCount || 0), 0), [members, projection.sourceVersions]);
  const currentJourney = projection.journeys.find(journey => journey.status === 'active' || journey.status === 'stopped');

  if (!projection.features.sourceSetsEnabled) {
    return <section aria-labelledby="transcript-source-library-title" className="premium-surface rounded-3xl border border-[var(--av-color-border)] p-5 shadow-sm">
      <p className="av-eyebrow">Assess source authority</p>
      <h2 id="transcript-source-library-title" className="mt-2 text-xl font-black">Source Library</h2>
      <p role="status" className="mt-3 rounded-xl bg-[var(--av-color-bg-subtle)] p-4 text-sm font-bold">{projection.features.disabledReason || 'Governed source sets are disabled for this workspace.'}</p>
    </section>;
  }

  const addSource = (sourceId: string) => {
    const source = projection.sourceVersions.find(item => item.sourceId === sourceId && !selectedVersions.has(item.versionSelector));
    if (!source || !source.selectable || members.length >= TRANSCRIPT_SOURCE_SET_MAX_MEMBERS) return;
    setMembers(current => [...current, { sourceId: source.sourceId, versionSelector: source.versionSelector, role: current.length ? 'supporting' : 'primary', note: '' }]);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= members.length) return;
    setMembers(current => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const commit = async () => {
    setValidationError('');
    try {
      const normalized = validateTranscriptSourceSetSelection(members);
      if (!label.trim()) throw new Error('A source-set label is required.');
      const existing = projection.sourceSets.find(sourceSet => sourceSet.id === editingSourceSetId);
      if (editingSourceSetId && !existing) throw new Error('The selected source set changed. Reload committed state before editing.');
      await onCommitSourceSet({
        ...(existing ? { sourceSetId: existing.id } : {}),
        expectedVersion: existing?.version || 0,
        label: label.trim(), ...(description.trim() ? { description: description.trim() } : {}), members: normalized,
      });
      setMembers([]);
      setLabel('');
      setDescription('');
      setEditingSourceSetId('');
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'The source set is invalid.');
    }
  };

  const editExisting = (sourceSetId: string) => {
    const sourceSet = projection.sourceSets.find(item => item.id === sourceSetId);
    if (!sourceSet) return;
    setEditingSourceSetId(sourceSet.id);
    setLabel(sourceSet.label);
    setDescription(sourceSet.description || '');
    setMembers(sourceSet.members.map(member => ({
      sourceId: member.sourceId, versionSelector: member.versionSelector, role: member.role, note: member.note || '',
    })));
    setValidationError('');
  };

  return <section aria-labelledby="transcript-source-library-title" className="premium-surface rounded-3xl border border-[var(--av-color-border)] p-5 shadow-sm">
    <p className="av-eyebrow">Assess source authority</p>
    <h2 id="transcript-source-library-title" className="mt-2 text-xl font-black">Source Library and ordered source sets</h2>
    <p id="transcript-source-set-help" className="mt-2 text-sm font-semibold text-[var(--av-color-text-muted)]">Reuse exact committed versions, declare source meaning, and lock an immutable Assess input bundle. Order is meaningful.</p>

    <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div>
        <h3 className="font-black">Committed source versions</h3>
        <div className="mt-3 grid gap-3">{projection.sourceVersions.map(source => <article key={source.versionSelector} className="rounded-2xl border border-[var(--av-color-border)] p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="font-black">{source.displayName}</p><p className="text-xs font-semibold text-[var(--av-color-text-muted)]">{source.versionLabel} · {source.mimeType} · {source.extractedCharacterCount.toLocaleString()} characters</p></div>
            <button type="button" className={secondaryClass} disabled={locked || !source.selectable || selectedVersions.has(source.versionSelector) || members.length >= TRANSCRIPT_SOURCE_SET_MAX_MEMBERS} onClick={() => addSource(source.sourceId)}>{selectedVersions.has(source.versionSelector) ? 'Selected' : source.reuseState === 'already_selected_elsewhere' ? 'Reuse version' : 'Add'}</button>
          </div>
          {source.state !== 'ready' ? <p role="status" className="mt-2 text-xs font-bold text-rose-700">{source.state} sources cannot be locked.</p> : null}
        </article>)}</div>
      </div>

      <div>
        <h3 className="font-black">{editingSourceSetId ? 'Create a new immutable version' : 'Compose source-set version'}</h3>
        {editingSourceSetId ? <p id="source-set-edit-status" role="status" className="mt-2 text-sm font-bold">Editing the committed set with expected version {projection.sourceSets.find(item => item.id === editingSourceSetId)?.version}. Saving appends a version; it never mutates history.</p> : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-black uppercase tracking-[0.12em] text-[var(--av-color-text-muted)]">Label<input className={fieldClass} aria-describedby={`transcript-source-set-help${editingSourceSetId ? ' source-set-edit-status' : ''}${validationError ? ' source-set-validation-error' : ''}`} value={label} onChange={event => setLabel(event.target.value)} /></label>
          <label className="text-xs font-black uppercase tracking-[0.12em] text-[var(--av-color-text-muted)]">Description<input className={fieldClass} aria-describedby={`transcript-source-set-help${editingSourceSetId ? ' source-set-edit-status' : ''}`} value={description} onChange={event => setDescription(event.target.value)} /></label>
        </div>
        <ol className="mt-4 grid gap-3">{members.map((member, index) => {
          const source = projection.sourceVersions.find(item => item.versionSelector === member.versionSelector);
          return <li key={member.versionSelector} className="rounded-2xl border border-[var(--av-color-border)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-black">{index + 1}. {source?.displayName || 'Selected source'} · {source?.versionLabel}</p><div className="flex gap-2"><button type="button" className={secondaryClass} aria-label={`Move ${source?.displayName || 'source'} earlier`} disabled={locked || index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" className={secondaryClass} aria-label={`Move ${source?.displayName || 'source'} later`} disabled={locked || index === members.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" className={secondaryClass} disabled={locked} onClick={() => setMembers(current => current.filter(item => item.versionSelector !== member.versionSelector))}>Remove</button></div></div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-black uppercase tracking-[0.12em] text-[var(--av-color-text-muted)]">Semantic role<select className={fieldClass} value={member.role} onChange={event => setMembers(current => current.map(item => item.versionSelector === member.versionSelector ? { ...item, role: event.target.value as TranscriptSourceRole } : item))}>{TRANSCRIPT_SOURCE_ROLES.map(role => <option key={role} value={role}>{role}</option>)}</select></label><label className="text-xs font-black uppercase tracking-[0.12em] text-[var(--av-color-text-muted)]">Optional note<input className={fieldClass} value={member.note} onChange={event => setMembers(current => current.map(item => item.versionSelector === member.versionSelector ? { ...item, note: event.target.value } : item))} /></label></div>
          </li>;
        })}</ol>
        <p className="mt-3 text-xs font-bold" aria-live="polite">{members.length}/{TRANSCRIPT_SOURCE_SET_MAX_MEMBERS} sources · {totalCharacters.toLocaleString()}/2,000,000 extracted characters</p>
        {validationError ? <p id="source-set-validation-error" role="alert" className="mt-3 rounded-xl border border-rose-300 p-3 text-sm font-bold text-rose-800">{validationError}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={primaryClass} aria-describedby={`transcript-source-set-help${editingSourceSetId ? ' source-set-edit-status' : ''}${validationError ? ' source-set-validation-error' : ''}`} disabled={locked || members.length === 0 || !label.trim()} onClick={() => void commit()}>Commit source-set version</button>{editingSourceSetId ? <button type="button" className={secondaryClass} onClick={() => { setEditingSourceSetId(''); setMembers([]); setLabel(''); setDescription(''); setValidationError(''); }}>Cancel version edit</button> : null}</div>
      </div>
    </div>

    <div className="mt-6 border-t border-[var(--av-color-border)] pt-5">
      <h3 className="font-black">Committed Assess source sets</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">{projection.sourceSets.map(sourceSet => <article key={sourceSet.id} className="rounded-2xl border border-[var(--av-color-border)] p-4">
        <label className="flex items-start gap-3"><input type="checkbox" className="mt-1" checked={selectedSetVersionSelectors.includes(sourceSet.versionSelector)} disabled={locked || sourceSet.lockState === 'blocked'} onChange={() => setSelectedSetVersionSelectors(current => current.includes(sourceSet.versionSelector) ? current.filter(id => id !== sourceSet.versionSelector) : [...current, sourceSet.versionSelector])} /><span><span className="block font-black">{sourceSet.label} · {sourceSet.versionLabel}</span><span className="block text-xs font-semibold text-[var(--av-color-text-muted)]">Expected version {sourceSet.version} · {sourceSet.sourceCount} sources · {sourceSet.extractedCharacterCount.toLocaleString()} characters · {sourceSet.lockState}</span>{sourceSet.blockers.length ? <span className="mt-1 block text-xs font-bold text-rose-700">{sourceSet.blockers.join('; ')}</span> : null}</span></label>
        <button type="button" className={`${secondaryClass} mt-3`} disabled={locked} onClick={() => editExisting(sourceSet.id)}>Edit as new version</button>
      </article>)}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="text-xs font-black uppercase tracking-[0.12em] text-[var(--av-color-text-muted)]">Input-bundle label<input className={fieldClass} value={bundleLabel} onChange={event => setBundleLabel(event.target.value)} /></label><button type="button" className={`${primaryClass} self-end`} disabled={locked || selectedSetVersionSelectors.length === 0 || !bundleLabel.trim()} onClick={() => void onLockInputBundle({ sourceSetVersionSelectors: selectedSetVersionSelectors, label: bundleLabel.trim() })}>Lock Assess input bundle</button></div>
    </div>

    <div className="mt-6 border-t border-[var(--av-color-border)] pt-5">
      <h3 className="font-black">Assess journey entry and stop point</h3>
      <p className="mt-2 text-sm font-semibold text-[var(--av-color-text-muted)]">Changing the desired exit controls navigation intent only. It does not create downstream records.</p>
      <div className="mt-3 flex flex-wrap items-end gap-3"><label className="min-w-56 text-xs font-black uppercase tracking-[0.12em] text-[var(--av-color-text-muted)]">Desired exit<select className={fieldClass} value={desiredExitModule} onChange={event => setDesiredExitModule(event.target.value as typeof desiredExitModule)}><option value="assess">Assess</option><option value="studio">Studio</option><option value="delivery">Delivery</option><option value="monitor">Monitor</option></select></label><button type="button" className={primaryClass} disabled={locked} onClick={() => void onSetJourneyState({ journeyId: currentJourney?.id, desiredExitModule, status: 'active' })}>{currentJourney?.status === 'stopped' ? 'Resume Assess journey' : 'Start Assess journey'}</button><button type="button" className={secondaryClass} disabled={locked || !currentJourney || currentJourney.status !== 'active'} onClick={() => void onSetJourneyState({ journeyId: currentJourney?.id, desiredExitModule, status: 'stopped' })}>Stop after committed Assess state</button></div>
      {currentJourney ? <p role="status" className="mt-3 text-sm font-bold">Journey {currentJourney.status}; current module Assess; desired exit {currentJourney.desiredExitModule}; no downstream resource is implied.</p> : null}
    </div>
  </section>;
});
