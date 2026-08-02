import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { TenantContextProjection } from '../../types';
import {
  STUDIO_ARTIFACT_TYPES,
  type StudioArtifactProjectionDto,
  type StudioArtifactType,
  type StudioCommandResponse,
  type StudioCommandType,
} from '../../services/studioArtifacts/contracts';
import {
  executeStudioArtifactCommand,
  readStudioArtifact,
  readStudioEligibleReviewers,
  readStudioHandoffs,
  StudioArtifactBoundaryError,
  type StudioArtifactTransport,
  type StudioEligibleReviewer,
  type StudioHandoffOption,
} from '../../services/studioArtifacts/client';
import StudioArtifactRenditions from './StudioArtifactRenditions';
import StatusBadge from '../shared/ui/StatusBadge';
import { validateStudioDraftContent } from '../../services/studioArtifacts/draftValidation';

interface Props {
  /** React remount key used when the tenant/workspace scope changes. */
  key?: React.Key;
  context: TenantContextProjection;
  capabilities?: readonly string[];
  online?: boolean;
  captureMode?: boolean;
  transport?: StudioArtifactTransport;
}

type ViewState =
  | 'loading'
  | 'empty'
  | 'generating'
  | 'generation_failed'
  | 'draft'
  | 'reviewer_ready'
  | 'in_review'
  | 'changes_requested'
  | 'review_rejected'
  | 'approval_ready'
  | 'approved'
  | 'approval_rejected'
  | 'superseded'
  | 'offline'
  | 'stale'
  | 'version_conflict'
  | 'authorization_revoked'
  | 'read_only'
  | 'command_failed'
  | 'committed_reload_failed';

const labels: Record<StudioArtifactProjectionDto['lifecycle'], string> = {
  draft: 'Draft',
  reviewer_ready: 'Reviewer ready',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  review_rejected: 'Review rejected',
  approval_ready: 'Approval ready',
  approved: 'Approved',
  approval_rejected: 'Approval rejected',
  superseded: 'Superseded',
};

const capability: Record<StudioCommandType, string> = {
  'studio.artifact.generation.request': 'studio.artifacts.generate',
  'studio.artifact.draft.revise': 'studio.artifacts.edit',
  'studio.artifact.review.submit': 'studio.artifacts.edit',
  'studio.artifact.review.assign': 'studio.artifacts.review',
  'studio.artifact.review.resolve': 'studio.artifacts.review',
  'studio.artifact.approval.resolve': 'studio.artifacts.approve',
};

const stateForError = (error: unknown, generation = false): { state: ViewState; message: string } => {
  if (!navigator.onLine) return { state: 'offline', message: 'Offline. No command was submitted.' };
  if (error instanceof StudioArtifactBoundaryError) {
    if (error.code === 'VERSION_CONFLICT') return { state: 'version_conflict', message: 'Version conflict. Reload the current committed state.' };
    if (error.code === 'AUTHORITY_STALE' || error.code === 'PERMISSION_DENIED') return { state: 'authorization_revoked', message: 'Authorization was revoked or became stale. Mutations are blocked.' };
    if (error.code === 'READ_ONLY' || error.code === 'FEATURE_DISABLED') return { state: 'read_only', message: 'Read-only maintenance. Committed canonical artifacts remain available.' };
    if (error.code === 'GENERATION_FAILED') return { state: 'generation_failed', message: 'The committed generation attempt failed. No artifact version was created.' };
  }
  return { state: generation ? 'generation_failed' : 'command_failed', message: 'Command failed before commit. No success was recorded.' };
};

const sequence: StudioArtifactProjectionDto['lifecycle'][] = ['draft', 'reviewer_ready', 'in_review', 'approval_ready', 'approved'];

export default function StudioArtifactWorkspace({ context, capabilities = context.capabilities, online = true, captureMode = false, transport }: Props) {
  const [handoffs, setHandoffs] = useState<StudioHandoffOption[]>([]);
  const [handoffId, setHandoffId] = useState('');
  const [artifactType, setArtifactType] = useState<StudioArtifactType>('brd');
  const [artifact, setArtifact] = useState<StudioArtifactProjectionDto | null>(null);
  const [state, setState] = useState<ViewState>('loading');
  const [message, setMessage] = useState('Loading committed Studio sources.');
  const [receipt, setReceipt] = useState<StudioCommandResponse | null>(null);
  const [draft, setDraft] = useState('');
  const [draftValidationError, setDraftValidationError] = useState<string | null>(null);
  const [reviewers, setReviewers] = useState<StudioEligibleReviewer[]>([]);
  const [reviewerId, setReviewerId] = useState('');
  const [rationale, setRationale] = useState('');
  const [conditionsText, setConditionsText] = useState('');
  const offline = !online || !navigator.onLine;
  const blockedByReload = state==='committed_reload_failed';
  const blocked = offline || blockedByReload || ['loading', 'generating', 'stale', 'version_conflict', 'authorization_revoked', 'read_only', 'command_failed', 'generation_failed'].includes(state) || artifact?.readOnly === true;
  const conditions = useMemo(() => conditionsText.split('\n').map(item => item.trim()).filter(Boolean), [conditionsText]);

  const clearProjection = useCallback(() => {
    setArtifact(null);
    setReceipt(null);
    setReviewers([]);
    setReviewerId('');
  }, []);

  const load = useCallback(async (selected = '', type = artifactType, preserveProjection = true) => {
    if (offline) {
      setState('offline');
      setMessage('Offline. Committed content remains visible; mutations are blocked.');
      return;
    }
    if (!preserveProjection) {
      clearProjection();
      setHandoffs([]);
    }
    setState('loading');
    try {
      const sources = await readStudioHandoffs(context, transport);
      setHandoffs(sources);
      const id = selected || sources[0]?.id || '';
      setHandoffId(id);
      if (!id) {
        setState('empty');
        setMessage('No accepted governed Studio handoffs are available.');
        return;
      }
      try {
        const value = await readStudioArtifact(context, id, type, transport);
        setArtifact(value);
        setState(value.readOnly ? 'read_only' : value.lifecycle);
        setMessage(captureMode ? 'Synthetic capture fixture · AP Invoice Exception Handling control brief. No persisted artifact state is changed.' : value.readOnly ? 'Read-only maintenance. Committed canonical artifacts remain available.' : 'Current committed artifact loaded.');
        if (['reviewer_ready', 'in_review'].includes(value.lifecycle)) {
          const eligible = await readStudioEligibleReviewers(context, value.id, value.currentVersion.id, transport);
          setReviewers(eligible);
          setReviewerId(current => eligible.some(item => item.actorId === current) ? current : (eligible[0]?.actorId ?? ''));
        }
      } catch (error) {
        if (error instanceof StudioArtifactBoundaryError && error.code === 'RESOURCE_NOT_AVAILABLE') {
          setState('empty');
          setMessage('No canonical artifact exists for this source and type.');
        } else {
          throw error;
        }
      }
    } catch (error) {
      const next = stateForError(error);
      setState(next.state === 'command_failed' ? 'stale' : next.state);
      setMessage(next.state === 'command_failed' ? 'Studio authority is unavailable. Reload the current committed state.' : next.message);
    }
  }, [artifactType, captureMode, clearProjection, context.organizationId, context.workspaceId, offline, transport]);

  useEffect(() => {
    void load('', artifactType, false);
  }, [artifactType, context.organizationId, context.workspaceId, load]);

  const run = async (commandType: StudioCommandType, payload: Record<string, unknown>) => {
    if (blocked) return;
    if (offline) {
      setState('offline');
      setMessage('Offline. No command was submitted.');
      return;
    }
    setState(commandType === 'studio.artifact.generation.request' ? 'generating' : 'loading');
    setMessage('Submitting. Success appears only after commit and projection reload.');
    try {
      const result = await executeStudioArtifactCommand(context, commandType, artifact, payload, crypto.randomUUID(), transport);
      setReceipt(result);
      if (result.outcome === 'generation_failed') {
        setState('generation_failed');
        setMessage(`Generation attempt committed (receipt ${result.receiptId}) and later failed. No artifact version was created.`);
        return;
      }
      try {
        const value = await readStudioArtifact(context, handoffId, artifactType, transport);
        setArtifact(value);
        setState(value.readOnly ? 'read_only' : value.lifecycle);
        setMessage(`${labels[value.lifecycle]} committed.`);
      } catch {
        setState('committed_reload_failed');
        setMessage(`Command committed (receipt ${result.receiptId}), but projection reload failed. Mutations are blocked.`);
      }
    } catch (error) {
      const next = stateForError(error, commandType === 'studio.artifact.generation.request');
      setState(next.state);
      setMessage(next.message);
    }
  };

  const revise = () => {
    const validation = validateStudioDraftContent(draft);
    if (!validation.valid) {
      setDraftValidationError(validation.error);
      return;
    }
    setDraftValidationError(null);
    void run('studio.artifact.draft.revise', {artifactId: artifact!.id,parentVersionId:artifact!.currentVersion.id,content:validation.content});
  };

  const handleDraftChange = (value: string) => {
    setDraft(value);
    if (draftValidationError && validateStudioDraftContent(value).valid) {
      setDraftValidationError(null);
    }
  };

  const can = (command: StudioCommandType) => !blocked && capabilities.includes(capability[command]);
  const exact = (...states: StudioArtifactProjectionDto['lifecycle'][]) => Boolean(artifact && states.includes(artifact.lifecycle));

  return (
    <section data-testid="studio-artifact-workspace" aria-labelledby="studio-artifact-title" className="av-surface mt-6 overflow-hidden">
      <header className="border-b border-[var(--av-color-border)] bg-[var(--av-color-bg-subtle)]/70 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="av-eyebrow">Avala Studio · governed artifact</p><h2 id="studio-artifact-title" className="mt-1 text-2xl font-bold text-[var(--av-color-text)]">Artifact workspace</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--av-color-text-muted)]">Structured content is committed by server authority. Business users see the governed artifact first; exact JSON, hashes, ancestry, and receipts remain available under advanced details.</p></div><StatusBadge tone="info">{captureMode ? 'Synthetic fixture' : 'Committed source'}</StatusBadge></div>
      </header>

      {['generation_failed', 'command_failed', 'version_conflict', 'authorization_revoked', 'stale'].includes(state) && (
        <div role="alert" className="mx-4 mt-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 sm:mx-5 sm:flex-row sm:items-center sm:justify-between">
          <span>{message} The last committed artifact remains visible.</span>
          {state !== 'authorization_revoked' && <button type="button" onClick={() => void load(handoffId, artifactType, true)} className="btn-ghost min-h-10 shrink-0 px-3 text-xs font-bold">Reload current committed state</button>}
        </div>
      )}

      <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[240px_minmax(0,1fr)_280px]">
        <aside className="space-y-4" aria-label="Studio source context"><div className="av-surface p-4"><p className="av-eyebrow">Source context</p><label className="av-form-label mt-4">Committed Studio handoff<select aria-label="Committed Studio handoff" value={handoffId} onChange={event => { setHandoffId(event.target.value); void load(event.target.value, artifactType, false); }} className="av-input mt-2">{handoffs.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="av-form-label mt-4">Artifact type<select aria-label="Artifact type" value={artifactType} onChange={event => setArtifactType(event.target.value as StudioArtifactType)} className="av-input mt-2">{STUDIO_ARTIFACT_TYPES.map(type => <option key={type} value={type}>{type.toUpperCase()}</option>)}</select></label></div>{artifact && <div className="av-surface p-4"><p className="av-eyebrow">Version history</p><ol className="mt-3 space-y-2">{[...artifact.versions].reverse().map(version => <li key={version.id} className={`rounded-lg border px-3 py-2 text-xs ${version.id === artifact.currentVersion.id ? 'border-[var(--av-color-brand-primary)] bg-[var(--av-color-bg-subtle)]' : 'border-[var(--av-color-border)]'}`}><p className="font-bold text-[var(--av-color-text)]">v{version.version} · {labels[version.lifecycle]}</p><p className="mt-1 truncate text-[10px] text-[var(--av-color-text-subtle)]" title={version.contentHash}>{version.contentHash}</p></li>)}</ol></div>}</aside>

        <article className="min-w-0" aria-label="Artifact preview"><div className="min-h-[360px] rounded-[var(--av-radius-panel)] border border-[var(--av-color-border)] bg-[var(--av-color-bg)] p-5 sm:p-7">{offline && <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">Offline. Committed content remains visible; mutations are blocked.</p>}{(artifact?.readOnly || state === 'read_only') && <p role="status" className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200">Read-only maintenance. Committed canonical artifacts remain available.</p>}<p role="status" aria-live="polite" className="text-sm font-semibold text-[var(--av-color-text-muted)]">{message}</p>{state === 'loading' && <div aria-label="Loading Studio artifact" className="mt-6 h-48 animate-pulse rounded-xl bg-[var(--av-color-bg-subtle)]" />}{state === 'committed_reload_failed' && <button type="button" onClick={() => void load()} className="btn-primary mt-4 min-h-10 px-3 text-sm font-bold">Reload explicitly committed state</button>}{artifact ? <><div className="mt-6 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--av-color-border)] pb-5"><div><p className="av-eyebrow">Current committed preview</p><h3 className="mt-2 text-2xl font-bold text-[var(--av-color-text)]">{artifact.artifactType.toUpperCase()} artifact</h3><p className="mt-1 text-sm text-[var(--av-color-text-muted)]">Aggregate v{artifact.aggregateVersion} · Content v{artifact.currentVersion.version}</p></div><StatusBadge tone={artifact.lifecycle === 'approved' ? 'success' : artifact.lifecycle.includes('reject') ? 'danger' : 'warning'}>{labels[artifact.lifecycle]}</StatusBadge></div><div className="mt-6 grid gap-4 sm:grid-cols-3"><div><p className="av-eyebrow">Lifecycle</p><p className="mt-1 text-sm font-bold text-[var(--av-color-text)]">{labels[artifact.lifecycle]}</p></div><div><p className="av-eyebrow">Current version</p><p className="mt-1 text-sm font-bold text-[var(--av-color-text)]">v{artifact.currentVersion.version}</p></div><div><p className="av-eyebrow">Approved version</p><p className="mt-1 text-sm font-bold text-[var(--av-color-text)]">{artifact.currentApprovedVersion ? `v${artifact.currentApprovedVersion.version}` : 'Not recorded'}</p></div></div><div className="mt-8 rounded-xl border border-[var(--av-color-border)] bg-[var(--av-color-surface)] p-4"><p className="text-sm font-bold text-[var(--av-color-text)]">Human-readable artifact preview</p><p className="mt-2 text-sm leading-6 text-[var(--av-color-text-muted)]">This committed version is available for review. Use Advanced structured content when exact JSON inspection or a strict revision is required.</p><details className="mt-4"><summary className="cursor-pointer text-sm font-bold text-[var(--av-color-brand-primary)]">Advanced structured content</summary><pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">{JSON.stringify(artifact.currentVersion.content, null, 2)}</pre></details></div></> : state === 'empty' ? <div className="grid min-h-[280px] place-items-center text-center"><div><p className="av-eyebrow">No committed artifact</p><h3 className="mt-2 text-xl font-bold text-[var(--av-color-text)]">Select a governed handoff to begin.</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--av-color-text-muted)]">Generation and revision actions appear only when the current authority and lifecycle allow them.</p></div></div> : null}</div></article>

        <aside className="space-y-4" aria-label="Artifact governance context"><div className="av-surface p-4"><div className="flex items-start justify-between gap-3"><div><p className="av-eyebrow">Lifecycle status</p><h3 className="mt-2 text-lg font-bold text-[var(--av-color-text)]">{artifact ? labels[artifact.lifecycle] : 'Awaiting source'}</h3></div><span className={`mt-1 h-3 w-3 rounded-full ${artifact?.lifecycle === 'approved' ? 'bg-emerald-500' : artifact ? 'bg-amber-500' : 'bg-slate-300'}`} aria-hidden="true" /></div><div className="mt-5 space-y-3 border-l border-[var(--av-color-border-strong)] pl-4 text-xs font-semibold text-[var(--av-color-text-muted)]">{sequence.map(item => <div key={item} className={artifact && artifact.lifecycle === item ? 'font-bold text-[var(--av-color-brand-primary)]' : ''}>{labels[item]}</div>)}</div></div>{reviewers.length > 0 && <div className="av-surface p-4"><p className="av-eyebrow">Review assignment</p><label className="av-form-label mt-3">Eligible independent reviewer<select aria-label="Eligible independent reviewer" value={reviewerId} onChange={event => setReviewerId(event.target.value)} className="av-input mt-2">{reviewers.map(person => <option key={person.actorId} value={person.actorId}>{person.displayName}</option>)}</select></label></div>}<div className="av-surface p-4"><p className="av-eyebrow">Authority context</p><p className="mt-2 text-sm leading-6 text-[var(--av-color-text-muted)]">{blocked ? 'Mutations are blocked. Existing committed records remain available.' : 'Commands require the current capability, exact version, and a committed projection reload.'}</p></div></aside>
      </div>

      <div className="sticky bottom-0 border-t border-[var(--av-color-border)] bg-[var(--av-color-surface)]/95 p-4 backdrop-blur sm:p-5">
        <div className="mx-auto grid max-w-7xl gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="av-form-label">
              Draft revision (strict structured JSON)
              <textarea
                value={draft}
                onChange={event => handleDraftChange(event.target.value)}
                aria-invalid={Boolean(draftValidationError)}
                aria-describedby={draftValidationError ? 'studio-draft-validation-error' : undefined}
                rows={3}
                className="av-input mt-2 min-h-[86px] resize-y font-mono text-xs"
              />
              {draftValidationError && <span id="studio-draft-validation-error" role="alert" className="mt-2 block text-xs font-semibold text-red-700 dark:text-red-300">{draftValidationError} No command was submitted; the committed artifact remains unchanged.</span>}
            </label>
            <div className="space-y-3">
              <label className="av-form-label">Rationale<textarea value={rationale} onChange={event => setRationale(event.target.value)} rows={2} className="av-input mt-2 min-h-[68px] resize-y" /></label>
              <label className="av-form-label">Conditions<textarea value={conditionsText} onChange={event => setConditionsText(event.target.value)} maxLength={10000} rows={2} className="av-input mt-2 min-h-[68px] resize-y" placeholder="One bounded condition per line" /></label>
            </div>
          </div>
          <div className="flex flex-wrap content-start items-start gap-2">
            <button type="button" disabled={!can('studio.artifact.generation.request') || state === 'generating' || Boolean(artifact && !['draft', 'changes_requested', 'review_rejected', 'approval_rejected', 'approved'].includes(artifact.lifecycle))} onClick={() => void run('studio.artifact.generation.request', { studioHandoffId: handoffId, artifactType })} className="btn-primary min-h-10 px-3 text-xs font-bold disabled:opacity-50">Generate draft</button>
            <button type="button" disabled={!can('studio.artifact.draft.revise') || !artifact || !draft || !exact('draft', 'changes_requested', 'review_rejected', 'approval_rejected')} onClick={revise} className="btn-ghost min-h-10 px-3 text-xs font-bold disabled:opacity-50">Commit revision</button>
            <button type="button" disabled={!can('studio.artifact.review.submit') || !exact('draft')} onClick={() => void run('studio.artifact.review.submit', { artifactId: artifact!.id, artifactVersionId: artifact!.currentVersion.id })} className="btn-ghost min-h-10 px-3 text-xs font-bold disabled:opacity-50">Submit for review</button>
            <button type="button" disabled={!can('studio.artifact.review.assign') || !exact('reviewer_ready') || !reviewerId} onClick={() => void run('studio.artifact.review.assign', { artifactId: artifact!.id, artifactVersionId: artifact!.currentVersion.id, reviewerId })} className="btn-ghost min-h-10 px-3 text-xs font-bold disabled:opacity-50">Assign reviewer</button>
            <button type="button" disabled={!can('studio.artifact.review.resolve') || !exact('in_review') || !rationale} onClick={() => void run('studio.artifact.review.resolve', {artifactId: artifact!.id,artifactVersionId: artifact!.currentVersion.id,outcome:'approve',rationale,conditions})} className="btn-ghost min-h-10 px-3 text-xs font-bold disabled:opacity-50">Approve review</button>
            <button type="button" disabled={!can('studio.artifact.review.resolve') || !exact('in_review') || !rationale} onClick={() => void run('studio.artifact.review.resolve', {artifactId: artifact!.id,artifactVersionId: artifact!.currentVersion.id,outcome:'changes_requested',rationale,conditions})} className="btn-ghost min-h-10 px-3 text-xs font-bold disabled:opacity-50">Request changes</button>
            <button type="button" disabled={!can('studio.artifact.review.resolve') || !exact('in_review') || !rationale} onClick={() => void run('studio.artifact.review.resolve', {artifactId: artifact!.id,artifactVersionId: artifact!.currentVersion.id,outcome:'reject',rationale,conditions})} className="btn-ghost min-h-10 px-3 text-xs font-bold disabled:opacity-50">Reject review</button>
            <button type="button" disabled={!can('studio.artifact.approval.resolve') || !exact('approval_ready') || !rationale} onClick={() => void run('studio.artifact.approval.resolve', {artifactId: artifact!.id,artifactVersionId: artifact!.currentVersion.id,outcome:'approve',rationale,conditions})} className="btn-primary min-h-10 px-3 text-xs font-bold disabled:opacity-50">Final approve</button>
            <button type="button" disabled={!can('studio.artifact.approval.resolve') || !exact('approval_ready') || !rationale} onClick={() => void run('studio.artifact.approval.resolve', {artifactId: artifact!.id,artifactVersionId: artifact!.currentVersion.id,outcome:'reject',rationale,conditions})} className="btn-ghost min-h-10 px-3 text-xs font-bold disabled:opacity-50">Final reject</button>
          </div>
        </div>
      </div>
      {artifact?.currentApprovedVersion ? <StudioArtifactRenditions context={context} artifact={artifact} capabilities={capabilities} online={online} /> : <p className="mx-4 mb-4 rounded-xl border border-[var(--av-color-border)] bg-[var(--av-color-bg-subtle)] p-3 text-sm font-semibold text-[var(--av-color-text-muted)] sm:mx-5">Private export and governed download require an approved canonical artifact version. The restriction applies only to non-approved versions.</p>}
      {receipt && <p className="sr-only">Last committed receipt {receipt.receiptId}; resource {receipt.resourceId}</p>}
    </section>
  );
}
