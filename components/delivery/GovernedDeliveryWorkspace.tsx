import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  DeliveryAction,
  DeliveryHandoffProjection,
  DeliveryItemProjection,
  DeliveryMonitorCommandInput,
  DeliveryPackageProjection,
  DeliveryWorkspaceProjection,
  EligibleStudioHandoffCandidateProjection,
  MonitorApprovedBaselinesProjection,
  MonitorBaselineEligibilityProjection,
} from '../../services/deliveryMonitor';

interface Props {
  projection: DeliveryWorkspaceProjection;
  monitorProjection?: MonitorApprovedBaselinesProjection;
  busy?: boolean;
  error?: string;
  status?: string;
  onAction: (input: DeliveryMonitorCommandInput) => Promise<boolean | void> | boolean | void;
  onLoadNextPage?: (deliveryPackage: DeliveryPackageProjection) => Promise<void> | void;
  onLoadNextBaselineEligibilityPage?: () => Promise<void> | void;
}

const button = 'inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--av-color-border-strong)] px-3 py-2 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50';
const primary = `${button} bg-[#ffbc03] text-[#002C4B]`;
const input = 'mt-1 min-h-10 w-full rounded-xl border border-[var(--av-color-border-strong)] bg-[var(--av-color-bg)] px-3 py-2 text-sm text-[var(--av-color-text)]';
const panel = 'rounded-2xl border border-[var(--av-color-border)] bg-[var(--av-color-bg)] p-4';
const human = (value: string) => value.replaceAll('_', ' ').replaceAll('.', ' ');
const classification = (lineage: string, planningOnly: boolean) => planningOnly || lineage === 'not_assessed'
  ? 'Not assessed · Planning only'
  : lineage === 'mixed' ? 'Mixed assessed lineage' : 'Assessed lineage';

interface RecoveryDraft {
  title: string;
  description: string;
  acceptanceCriteria: string;
  nonFunctionalRequirements: string;
  rationale: string;
}

const recoveryDraft = (item: DeliveryItemProjection): RecoveryDraft => ({
  title: item.title,
  description: item.description,
  acceptanceCriteria: item.acceptanceCriteria.join('\n'),
  nonFunctionalRequirements: item.nonFunctionalRequirements.join('\n'),
  rationale: '',
});
const recoveryLines = (value: string) => value.split('\n').map(entry => entry.trim()).filter(Boolean);
const recoveryChanged = (item: DeliveryItemProjection, draft: RecoveryDraft) => (
  draft.title.trim() !== item.title
  || draft.description.trim() !== item.description
  || JSON.stringify(recoveryLines(draft.acceptanceCriteria)) !== JSON.stringify(item.acceptanceCriteria)
  || JSON.stringify(recoveryLines(draft.nonFunctionalRequirements)) !== JSON.stringify(item.nonFunctionalRequirements)
);

type Pending =
  | { kind: 'handoff'; handoff: DeliveryHandoffProjection; action: 'delivery.handoff.review.resolve' | 'delivery.handoff.approval.resolve' | 'delivery.handoff.withdraw' | 'delivery.handoff.consume'; outcome?: 'approved' | 'changes_requested' | 'rejected' }
  | { kind: 'item'; deliveryPackage: DeliveryPackageProjection; item: DeliveryItemProjection; outcome: 'edited' | 'accepted' | 'rejected' }
  | { kind: 'package'; deliveryPackage: DeliveryPackageProjection; action: 'delivery.package.review.resolve' | 'delivery.package.approval.resolve'; outcome?: 'approved' | 'changes_requested' | 'rejected' }
  | { kind: 'baseline'; selector: MonitorBaselineEligibilityProjection };

const StatusPill = ({ children }: { children: React.ReactNode }) => <span className="inline-flex rounded-full border border-current px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em]">{children}</span>;

export function MonitorApprovedBaselinePanel({ projection, heading = 'Canonical approved baselines' }: { projection: MonitorApprovedBaselinesProjection; heading?: string }) {
  const [selectedId, setSelectedId] = useState(projection.baselines[0]?.id ?? '');
  const selected = projection.baselines.find(item => item.id === selectedId) ?? projection.baselines[0];
  const acceptedTypeCounts = selected ? (['epic', 'story', 'task', 'milestone', 'dependency', 'risk'] as const).map(type => ({ type, count: selected.acceptedItems.filter(item => item.type === type).length })).filter(item => item.count > 0) : [];
  const acceptedTypeCountLabel = acceptedTypeCounts.map(item => `${item.type}:${item.count}`).join(',');
  useEffect(() => { if (!projection.baselines.some(item => item.id === selectedId)) setSelectedId(projection.baselines[0]?.id ?? ''); }, [projection.baselines, selectedId]);
  return <section data-testid="canonical-monitor-baselines" data-monitor-usable="true" className="av-surface p-5" aria-labelledby="canonical-monitor-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="av-eyebrow">Avala Monitor · governed baseline</p><h2 id="canonical-monitor-title" className="mt-2 text-xl font-black text-[var(--av-color-text)]">{heading}</h2><p className="mt-2 max-w-3xl text-sm font-semibold text-[var(--av-color-text-muted)]">Presentation only. Live telemetry is disabled; this projection cannot edit work, infer completion, execute tasks, or change due dates.</p></div>
      <StatusPill>Read only · telemetry disabled</StatusPill>
    </div>
    {!projection.featureFlags.monitorApprovedBaselineEnabled && <p role="status" className="mt-4 rounded-xl bg-[var(--av-color-bg-subtle)] p-3 font-bold">Approved-baseline creation is disabled. Previously committed baselines remain readable.</p>}
    {projection.baselines.length === 0 ? <p className="mt-5 rounded-xl bg-[var(--av-color-bg-subtle)] p-5 font-bold">No approved canonical baseline is available. Monitor does not synthesize one from draft or legacy task data.</p> : <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(240px,0.65fr)_minmax(0,1.35fr)]">
      <ul aria-label="Approved Monitor baselines" className="space-y-2">{projection.baselines.map(item => <li key={item.id}><button type="button" onClick={() => setSelectedId(item.id)} aria-pressed={selected?.id === item.id} className={`${button} w-full flex-col items-start text-left`}><span>Baseline v{item.version} · {item.status}</span><span className="mt-1 text-xs font-semibold">{item.acceptedItemCount} accepted · {classification(item.lineageClassification, item.planningOnly)}</span></button></li>)}</ul>
      {selected && <article data-testid={`monitor-baseline-${selected.id}`} data-baseline-id={selected.id} data-baseline-version={selected.version} data-package-id={selected.workPackageId} data-package-version={selected.workPackageVersion} data-accepted-item-count={selected.acceptedItemCount} data-accepted-type-counts={acceptedTypeCountLabel} className={panel}>
        <div className="flex flex-wrap gap-2"><StatusPill>{selected.status}</StatusPill><StatusPill>{selected.readiness}</StatusPill><StatusPill>{classification(selected.lineageClassification, selected.planningOnly)}</StatusPill></div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-black">Baseline identity</dt><dd className="break-all">{selected.id} · v{selected.version}</dd></div>
          <div><dt className="font-black">Exact package</dt><dd className="break-all">{selected.workPackageId} · v{selected.workPackageVersion}</dd></div>
          <div><dt className="font-black">Canonical accepted set</dt><dd>{selected.acceptedItemCount} server-counted items; integrity remains server-side.</dd></div>
          <div><dt className="font-black">Lineage</dt><dd>{classification(selected.lineageClassification, selected.planningOnly)}</dd></div>
        </dl>
        <section className="mt-4" aria-label="Accepted item counts by type"><h3 className="font-black">Accepted item counts by type</h3><ul className="mt-2 flex flex-wrap gap-2">{acceptedTypeCounts.map(item => <li key={item.type}><StatusPill>{human(item.type)} {item.count}</StatusPill></li>)}</ul></section>
        <div className="mt-5 grid gap-4 sm:grid-cols-2"><BaselineList label="Milestones" values={selected.milestones}/><BaselineList label="Dependencies" values={selected.dependencies}/><BaselineList label="Blockers" values={selected.blockers}/><BaselineList label="Risks" values={selected.risks}/></div>
      </article>}
    </div>}
  </section>;
}

const BaselineList = ({ label, values }: { label: string; values: string[] }) => <section aria-label={label}><h3 className="font-black">{label}</h3>{values.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{values.map((value, index) => <li key={`${label}-${index}`}>{value}</li>)}</ul> : <p className="mt-2 text-sm text-[var(--av-color-text-muted)]">None in the exact approved baseline.</p>}</section>;

const CandidatePreview = ({ candidate }: { candidate?: EligibleStudioHandoffCandidateProjection }) => candidate ? <details className="mt-3 rounded-xl bg-[var(--av-color-bg-subtle)] p-3">
  <summary className="cursor-pointer font-black">Server-derived handoff preview · {candidate.proposalItems.length} items</summary>
  <p className="mt-2 text-xs font-bold">Server-bound proposal integrity verified.</p>
  <ol className="mt-2 max-h-72 list-decimal space-y-1 overflow-y-auto pl-5 text-sm">{candidate.proposalItems.map(item => <li key={item.clientKey}><span className="font-bold">{item.type}: {item.title}</span> · citation {item.sourceSectionLocator}</li>)}</ol>
  <p className="mt-2 text-xs font-semibold">Preview evidence is server-authored. The request sends only immutable selectors and never echoes proposal items or their digest as authority.</p>
</details> : null;

export default function GovernedDeliveryWorkspace({ projection, monitorProjection, busy = false, error = '', status = '', onAction, onLoadNextPage, onLoadNextBaselineEligibilityPage }: Props) {
  const eligibleStudioArtifacts = projection.eligibleStudioArtifacts;
  const [activeHandoffs, setActiveHandoffs] = useState<'inbox' | 'outbox'>('inbox');
  const [selectedPackageId, setSelectedPackageId] = useState(projection.packages[0]?.id ?? '');
  const [pending, setPending] = useState<Pending | null>(null);
  const [rationale, setRationale] = useState('');
  const [edit, setEdit] = useState({ title: '', description: '', acceptanceCriteria: '', nonFunctionalRequirements: '' });
  const [manual, setManual] = useState({ title: '', itemTitle: '', description: '' });
  const [candidateId, setCandidateId] = useState(eligibleStudioArtifacts[0]?.studioArtifactVersionId ?? '');
  const [localError, setLocalError] = useState('');
  const [commandError, setCommandError] = useState('');
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const errorSummary = useRef<HTMLDivElement | null>(null);
  const handoffs = projection[activeHandoffs];
  const selectedPackage = projection.packages.find(item => item.id === selectedPackageId) ?? projection.packages[0];
  const loadedPageCount = selectedPackage ? Math.max(1, Math.ceil(selectedPackage.items.length / selectedPackage.itemPage.limit)) : 0;
  const locked = busy || projection.readOnly;
  const scopeKey = `${projection.organizationId}:${projection.workspaceId}`;

  useEffect(() => {
    setActiveHandoffs('inbox'); setSelectedPackageId(projection.packages[0]?.id ?? ''); setPending(null);
    setRationale(''); setLocalError(''); setCommandError(''); setManual({ title: '', itemTitle: '', description: '' });
    setCandidateId(eligibleStudioArtifacts[0]?.studioArtifactVersionId ?? '');
  }, [scopeKey]);
  useEffect(() => {
    if (!projection.packages.some(item => item.id === selectedPackageId)) setSelectedPackageId(projection.packages[0]?.id ?? '');
  }, [projection.packages, selectedPackageId]);
  useEffect(() => {
    if (!eligibleStudioArtifacts.some(item => item.studioArtifactVersionId === candidateId)) setCandidateId(eligibleStudioArtifacts[0]?.studioArtifactVersionId ?? '');
  }, [candidateId, eligibleStudioArtifacts]);

  const begin = (event: React.MouseEvent<HTMLButtonElement>, value: Pending) => {
    returnFocus.current = event.currentTarget;
    setRationale(''); setLocalError(''); setPending(value);
    if (value.kind === 'item') setEdit({ title: value.item.title, description: value.item.description, acceptanceCriteria: value.item.acceptanceCriteria.join('\n'), nonFunctionalRequirements: value.item.nonFunctionalRequirements.join('\n') });
  };
  const close = () => { setPending(null); setLocalError(''); requestAnimationFrame(() => returnFocus.current?.focus()); };
  const requireRationale = pending && !(pending.kind === 'handoff' && pending.action === 'delivery.handoff.consume') && pending.kind !== 'baseline';
  const submit = async () => {
    if (!pending) return;
    if (requireRationale && rationale.trim().length < 4) { setLocalError('Enter at least four characters of decision rationale. Your draft has been preserved.'); requestAnimationFrame(() => errorSummary.current?.focus()); return; }
    let command: DeliveryMonitorCommandInput;
    if (pending.kind === 'handoff') {
      command = pending.action === 'delivery.handoff.consume' ? { action: pending.action, handoffId: pending.handoff.id, expectedVersion: pending.handoff.version }
        : pending.action === 'delivery.handoff.withdraw' ? { action: pending.action, handoffId: pending.handoff.id, expectedVersion: pending.handoff.version, rationale }
        : pending.action === 'delivery.handoff.review.resolve' ? { action: pending.action, handoffId: pending.handoff.id, expectedVersion: pending.handoff.version, outcome: pending.outcome ?? 'approved', rationale }
        : { action: 'delivery.handoff.approval.resolve', handoffId: pending.handoff.id, expectedVersion: pending.handoff.version, outcome: pending.outcome === 'rejected' ? 'rejected' : 'approved', rationale };
    } else if (pending.kind === 'item') {
      command = pending.outcome === 'edited' ? { action: 'delivery.item.review', itemAggregateId: pending.item.aggregateId, expectedAggregateVersion: pending.item.aggregateVersion, expectedItemVersionId: pending.item.currentVersionId, outcome: 'edited', rationale, authored: { type: pending.item.type, title: edit.title, description: edit.description, acceptanceCriteria: edit.acceptanceCriteria.split('\n').map(value => value.trim()).filter(Boolean), nonFunctionalRequirements: edit.nonFunctionalRequirements.split('\n').map(value => value.trim()).filter(Boolean) } }
        : { action: 'delivery.item.review', itemAggregateId: pending.item.aggregateId, expectedAggregateVersion: pending.item.aggregateVersion, expectedItemVersionId: pending.item.currentVersionId, outcome: pending.outcome, rationale };
    } else if (pending.kind === 'package') {
      if (pending.action === 'delivery.package.review.resolve') {
        command = { action: 'delivery.package.review.resolve', workPackageId: pending.deliveryPackage.id, expectedPackageVersion: pending.deliveryPackage.currentVersion, expectedPackageVersionId: pending.deliveryPackage.currentVersionId, expectedPackageAggregateVersion: pending.deliveryPackage.aggregateVersion, outcome: pending.outcome ?? 'approved', rationale };
      } else {
        command = { action: 'delivery.package.approval.resolve', workPackageId: pending.deliveryPackage.id, expectedPackageVersion: pending.deliveryPackage.currentVersion, expectedPackageVersionId: pending.deliveryPackage.currentVersionId, expectedPackageAggregateVersion: pending.deliveryPackage.aggregateVersion, outcome: pending.outcome === 'rejected' ? 'rejected' : 'approved', rationale };
      }
    } else {
      command = { action: 'monitor.baseline.create', workPackageId: pending.selector.workPackageId, expectedPackageVersion: pending.selector.workPackageVersion, expectedPackageVersionId: pending.selector.workPackageVersionId };
    }
    try {
      const committed = await onAction(command);
      if (committed === false) { setLocalError('The command was not confirmed. Your input is preserved; reload committed state before retrying.'); requestAnimationFrame(() => errorSummary.current?.focus()); return; }
      close();
    } catch {
      setLocalError('The command failed before confirmation. Your input is preserved; no success state is shown.');
      requestAnimationFrame(() => errorSummary.current?.focus());
    }
  };

  const requestHandoff = async () => { const candidate = eligibleStudioArtifacts.find(item => item.studioArtifactVersionId === candidateId); if (!candidate) return; setCommandError(''); try { const committed = await onAction({ action: 'delivery.handoff.request', studioArtifactId: candidate.studioArtifactId, studioArtifactVersionId: candidate.studioArtifactVersionId, targetWorkspaceId: projection.workspaceId, expectedAggregateVersion: candidate.aggregateVersion, expectedCurrentVersionId: candidate.studioArtifactVersionId, expectedApprovedVersionId: candidate.studioArtifactVersionId }); if (committed === false) setCommandError('Handoff request was not confirmed. The exact selection is preserved.'); } catch { setCommandError('Handoff request failed before confirmation. The exact selection is preserved.'); } };
  const createManual = async () => { if (manual.title.trim().length < 1 || manual.itemTitle.trim().length < 1 || manual.description.trim().length < 1) return; setCommandError(''); try { const committed = await onAction({ action: 'delivery.package.create.manual', manualBrief: manual.title, items: [{ type: 'task', title: manual.itemTitle, description: manual.description, acceptanceCriteria: ['Authorized reviewer confirms the planned outcome.'], nonFunctionalRequirements: ['Planning-only; no execution or telemetry authority.'] }] }); if (committed === false) setCommandError('Manual package was not confirmed. Authored input is preserved.'); } catch { setCommandError('Manual package failed before confirmation. Authored input is preserved.'); } };

  return <div data-testid="governed-delivery-workspace" data-delivery-usable="true" className="space-y-6">
    <section className="av-surface p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="av-eyebrow">Avala Delivery · governed workbench</p><h2 className="mt-2 text-2xl font-black">Canonical Delivery proposals</h2><p className="mt-2 max-w-3xl text-sm font-semibold text-[var(--av-color-text-muted)]">Explicit handoff acceptance, immutable item versions, human decisions, and exact citations. Delivery plans work; it does not execute it.</p></div><StatusPill>{projection.readOnly ? 'Read only' : 'Server-authorized actions'}</StatusPill></div>{status && <p role="status" className="mt-4 rounded-xl bg-[var(--av-color-bg-subtle)] p-3 font-bold">{status}</p>}{error && <p role="alert" className="mt-4 rounded-xl border border-red-500 p-3 font-bold">{error}</p>}{commandError && <p role="alert" className="mt-4 rounded-xl border border-red-500 p-3 font-bold">{commandError}</p>}</section>

    <section aria-labelledby="delivery-handoffs-title" className="av-surface p-5"><h3 id="delivery-handoffs-title" className="text-xl font-black">Studio → Delivery handoffs</h3><p className="mt-1 text-sm text-[var(--av-color-text-muted)]">Eligibility never creates a Delivery package. Target review, approval, and explicit consumption are separate.</p>
      {eligibleStudioArtifacts.length > 0 && projection.featureFlags.moduleHandoffsEnabled && <><div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]"><label className="text-sm font-black">Eligible exact Studio artifact<select className={input} value={candidateId} onChange={event => setCandidateId(event.target.value)}>{eligibleStudioArtifacts.map(item => <option key={item.studioArtifactVersionId} value={item.studioArtifactVersionId}>{item.artifactType.toUpperCase()} v{item.studioArtifactVersion} · {item.proposalItems.length} server proposals · {classification(item.lineageClassification, item.planningOnly)}</option>)}</select></label><button type="button" className={`${primary} self-end`} disabled={locked || !candidateId} onClick={() => void requestHandoff()}>Request handoff</button></div><CandidatePreview candidate={eligibleStudioArtifacts.find(item => item.studioArtifactVersionId === candidateId)}/></>}
      <div className="mt-5 flex gap-2" role="tablist" aria-label="Delivery handoff direction"><button type="button" role="tab" aria-selected={activeHandoffs === 'inbox'} className={button} onClick={() => setActiveHandoffs('inbox')}>Inbox ({projection.inbox.length})</button><button type="button" role="tab" aria-selected={activeHandoffs === 'outbox'} className={button} onClick={() => setActiveHandoffs('outbox')}>Outbox ({projection.outbox.length})</button></div>
      <div className="mt-4 grid gap-3">{handoffs.length === 0 ? <p className="rounded-xl bg-[var(--av-color-bg-subtle)] p-4 font-bold">No {activeHandoffs} records are present in this server-authorized projection; no broader workspace state is inferred.</p> : handoffs.map(item => <article key={item.id} className={panel}><div className="flex flex-wrap gap-2"><StatusPill>{human(item.status)}</StatusPill><StatusPill>{classification(item.lineageClassification, item.planningOnly)}</StatusPill><StatusPill>{item.preview.artifactType.toUpperCase()} v{item.sourceArtifactVersion}</StatusPill></div><p className="mt-3 font-black">{item.preview.proposedItemCount} deterministic proposed items · {item.preview.sourceCoverageLabel}</p><p className="mt-1 text-xs">Current authorized Delivery workspace · handoff v{item.version}</p>{item.preview.blockers.length > 0 && <p className="mt-2 text-sm font-bold">Blockers: {item.preview.blockers.join('; ')}</p>}<details className="mt-3 rounded-xl bg-[var(--av-color-bg-subtle)] p-3"><summary className="cursor-pointer font-black">Exact preview and immutable handoff history</summary><p className="mt-2 text-sm">{item.targetItems.length} target items with server-verified integrity and exact source locators.</p><ol className="mt-2 list-decimal pl-5 text-sm">{item.history.map(entry => <li key={`${entry.version}:${entry.createdAt}`}>v{entry.version} · {human(entry.status)}{entry.rationale ? ` · ${entry.rationale}` : ''}</li>)}</ol>{(item.historyPage.historyHasMore || item.historyPage.reviewHasMore || item.historyPage.approvalHasMore) && <p className="mt-2 text-sm font-bold">History is a bounded server page; additional events are not shown.</p>}{item.reviewHistory.length > 0 && <p className="mt-2 text-sm font-bold">Review: {item.reviewHistory.map(entry => `${entry.outcome} — ${entry.rationale}`).join('; ')}</p>}{item.approvalHistory.length > 0 && <p className="mt-2 text-sm font-bold">Approval: {item.approvalHistory.map(entry => `${entry.outcome} — ${entry.rationale}`).join('; ')}</p>}</details><div className="mt-3 flex flex-wrap gap-2">{item.actions.includes('delivery.handoff.review.resolve') && <><button type="button" className={button} disabled={locked} onClick={event => begin(event, { kind: 'handoff', handoff: item, action: 'delivery.handoff.review.resolve', outcome: 'approved' })}>Approve review</button><button type="button" className={button} disabled={locked} onClick={event => begin(event, { kind: 'handoff', handoff: item, action: 'delivery.handoff.review.resolve', outcome: 'changes_requested' })}>Request changes</button><button type="button" className={button} disabled={locked} onClick={event => begin(event, { kind: 'handoff', handoff: item, action: 'delivery.handoff.review.resolve', outcome: 'rejected' })}>Reject handoff</button></>}{item.actions.includes('delivery.handoff.approval.resolve') && <><button type="button" className={button} disabled={locked} onClick={event => begin(event, { kind: 'handoff', handoff: item, action: 'delivery.handoff.approval.resolve', outcome: 'approved' })}>Final handoff approval</button><button type="button" className={button} disabled={locked} onClick={event => begin(event, { kind: 'handoff', handoff: item, action: 'delivery.handoff.approval.resolve', outcome: 'rejected' })}>Final handoff rejection</button></>}{item.actions.includes('delivery.handoff.consume') && <button type="button" className={primary} disabled={locked} onClick={event => begin(event, { kind: 'handoff', handoff: item, action: 'delivery.handoff.consume' })}>Start Delivery draft</button>}{item.actions.includes('delivery.handoff.withdraw') && <button type="button" className={button} disabled={locked} onClick={event => begin(event, { kind: 'handoff', handoff: item, action: 'delivery.handoff.withdraw' })}>Withdraw request</button>}</div></article>)}</div>
      {projection.page.handoffHasMore && <p className="mt-3 text-sm font-bold">Additional handoff records exist beyond this bounded server page.</p>}
    </section>

    {projection.featureFlags.directDeliveryPlanningEnabled && <section aria-labelledby="manual-delivery-title" className="av-surface p-5"><h3 id="manual-delivery-title" className="text-xl font-black">Direct Delivery planning</h3><p className="mt-1 font-bold">Not assessed · Planning only · No Assess or Studio ancestry</p><div className="mt-4 grid gap-3 md:grid-cols-3"><label className="text-sm font-black">Package title<input className={input} value={manual.title} onChange={event => setManual(current => ({ ...current, title: event.target.value }))}/></label><label className="text-sm font-black">First item title<input className={input} value={manual.itemTitle} onChange={event => setManual(current => ({ ...current, itemTitle: event.target.value }))}/></label><label className="text-sm font-black">Description<input className={input} value={manual.description} onChange={event => setManual(current => ({ ...current, description: event.target.value }))}/></label></div><button type="button" className={`${primary} mt-3`} disabled={locked || !manual.title.trim() || !manual.itemTitle.trim() || !manual.description.trim()} onClick={() => void createManual()}>Create manual planning package</button></section>}

    {(projection.baselineEligibility.length > 0 || projection.page.baselineEligibilityCursorApplied) && <section aria-labelledby="baseline-eligibility-title" className="av-surface p-5" data-testid="baseline-eligibility-selectors"><h3 id="baseline-eligibility-title" className="text-xl font-black">Approved packages eligible for Monitor</h3><p className="mt-1 text-sm">This minimized selector does not disclose package content, item history, rationale, actors, sources, or integrity hashes. At most {projection.page.baselineEligibilityLimit} selectors are shown per server page.</p>{projection.baselineEligibility.length ? <ul className="mt-4 space-y-2">{projection.baselineEligibility.map(selector => <li key={selector.workPackageVersionId} className={panel}><p className="font-bold">Approved package v{selector.workPackageVersion} · {selector.acceptedItemCount} accepted · {classification(selector.lineageClassification, selector.planningOnly)}</p><button type="button" className={`${primary} mt-2`} disabled={locked || !monitorProjection?.featureFlags.monitorApprovedBaselineEnabled} onClick={event => begin(event, { kind: 'baseline', selector })}>Create read-only Monitor baseline</button></li>)}</ul> : <p className="mt-4 text-sm font-bold">No selectors remain on this bounded page.</p>}{projection.page.baselineEligibilityHasMore && onLoadNextBaselineEligibilityPage && <button type="button" className={`${button} mt-4`} disabled={busy} onClick={() => void onLoadNextBaselineEligibilityPage()}>{busy ? 'Loading next eligible package page…' : 'Load next eligible package page'}</button>}</section>}

    <section aria-labelledby="delivery-packages-title" className="av-surface p-5"><h3 id="delivery-packages-title" className="text-xl font-black">Canonical package list</h3><div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)]"><ul aria-label="Delivery packages" className="min-w-0 space-y-2">{projection.packages.map(item => <li key={item.id}><button type="button" aria-pressed={selectedPackage?.id === item.id} className={`${button} w-full flex-col items-start text-left`} onClick={() => setSelectedPackageId(item.id)}><span>{item.label} · v{item.currentVersion}</span><span className="mt-1 text-xs">{human(item.status)} · {classification(item.sourcePackage.lineageClassification, item.sourcePackage.planningOnly)}</span></button></li>)}</ul>
      {selectedPackage ? <article data-testid={`delivery-package-${selectedPackage.id}`} data-package-id={selectedPackage.id} data-package-version={selectedPackage.currentVersion} className={`${panel} min-w-0`}><div className="flex flex-wrap gap-2"><StatusPill>{human(selectedPackage.status)}</StatusPill><StatusPill>{selectedPackage.sourcePackage.sourceMode === 'manual' ? 'Manual Delivery entry' : 'Studio handoff'}</StatusPill><StatusPill>{classification(selectedPackage.sourcePackage.lineageClassification, selectedPackage.sourcePackage.planningOnly)}</StatusPill><StatusPill>Review {human(selectedPackage.reviewState)}</StatusPill><StatusPill>Approval {human(selectedPackage.approvalState)}</StatusPill></div><p className="mt-3 text-sm font-bold">Source package v{selectedPackage.sourcePackage.version}; integrity remains server-side.</p>{selectedPackage.acceptedItemCount !== undefined && <p className="mt-2 text-sm font-bold">Approved identity: {selectedPackage.acceptedItemCount} server-counted items.</p>}{selectedPackage.blockerCount > 0 && <div className="mt-3" role="status"><p className="font-black">Package blockers · {selectedPackage.blockerCount} server-counted</p><ul className="list-disc pl-5 text-sm">{selectedPackage.blockers.map(value => <li key={value}>{value}</li>)}</ul>{selectedPackage.blockerCount > selectedPackage.blockers.length && <p className="mt-1 text-sm font-bold">Only the bounded blocker preview is shown.</p>}</div>}<details className="mt-3 rounded-xl bg-[var(--av-color-bg-subtle)] p-3"><summary className="cursor-pointer font-black">Package review and approval history</summary><p className="mt-2 text-sm">Review events: {selectedPackage.reviewHistory.length}. Approval events: {selectedPackage.approvalHistory.length}.</p>{(selectedPackage.historyPage.reviewHasMore || selectedPackage.historyPage.approvalHasMore) && <p className="mt-1 text-sm font-bold">History is a bounded server page; additional decisions are not shown.</p>}{selectedPackage.reviewHistory.map(entry => <p key={`review:${entry.packageVersion}:${entry.createdAt}`} className="mt-1 text-sm">Review v{entry.packageVersion}: {entry.outcome} · {entry.acceptedItemCount} accepted · {entry.rationale}</p>)}{selectedPackage.approvalHistory.map(entry => <p key={`approval:${entry.packageVersion}:${entry.createdAt}`} className="mt-1 text-sm">Approval v{entry.packageVersion}: {entry.outcome} · {entry.acceptedItemCount} accepted · {entry.rationale}</p>)}</details>
        <DeliveryItemFilter key={`${scopeKey}:${selectedPackage.id}`} deliveryPackage={selectedPackage} locked={locked || !projection.featureFlags.deliveryItemReviewEnabled} onBegin={begin}/>{!selectedPackage.itemPage.isComplete ? <div className="mt-4 rounded-xl border border-[var(--av-color-border)] p-3" data-testid="delivery-item-pagination"><p className="text-sm font-bold">{selectedPackage.items.length} canonical items are loaded from {loadedPageCount} bounded server {loadedPageCount === 1 ? 'page' : 'pages'}; package completeness is not inferred.</p>{selectedPackage.itemPage.hasMore && onLoadNextPage ? <button type="button" className={`${button} mt-2`} disabled={busy} onClick={() => void onLoadNextPage(selectedPackage)}>{busy ? 'Loading next bounded page…' : 'Load next bounded page'}</button> : <p className="mt-2 text-sm">{selectedPackage.itemPage.hasMore ? 'Additional canonical pages are unavailable in this projection. Reload through a server-authorized page loader.' : 'A cursor-selected page is shown; return to the first server page before judging completeness.'}</p>}</div> : <p className="mt-4 rounded-xl bg-[var(--av-color-bg-subtle)] p-3 text-sm font-bold" data-testid="delivery-item-pagination-complete">All {selectedPackage.items.length} canonical items are loaded from {loadedPageCount} bounded server {loadedPageCount === 1 ? 'page' : 'pages'}.</p>}
        {selectedPackage.status === 'blocked' && selectedPackage.actions.includes('delivery.package.revision.commit') && <BlockedPackageRecovery key={`${selectedPackage.id}:${selectedPackage.currentVersionId}:${selectedPackage.aggregateVersion}`} deliveryPackage={selectedPackage} locked={locked || !projection.featureFlags.deliveryItemReviewEnabled} onAction={onAction}/>}
        <div className="mt-5 flex flex-wrap gap-2">{selectedPackage.actions.includes('delivery.package.review.resolve') && <><button type="button" className={button} disabled={locked || !selectedPackage.itemPage.isComplete} onClick={event => begin(event, { kind: 'package', deliveryPackage: selectedPackage, action: 'delivery.package.review.resolve', outcome: 'approved' })}>Approve package review</button><button type="button" className={button} disabled={locked || !selectedPackage.itemPage.isComplete} onClick={event => begin(event, { kind: 'package', deliveryPackage: selectedPackage, action: 'delivery.package.review.resolve', outcome: 'changes_requested' })}>Request package changes</button><button type="button" className={button} disabled={locked || !selectedPackage.itemPage.isComplete} onClick={event => begin(event, { kind: 'package', deliveryPackage: selectedPackage, action: 'delivery.package.review.resolve', outcome: 'rejected' })}>Reject package review</button></>}{selectedPackage.actions.includes('delivery.package.approval.resolve') && <><button type="button" className={primary} disabled={locked || !selectedPackage.itemPage.isComplete} onClick={event => begin(event, { kind: 'package', deliveryPackage: selectedPackage, action: 'delivery.package.approval.resolve', outcome: 'approved' })}>Final package approval</button><button type="button" className={button} disabled={locked || !selectedPackage.itemPage.isComplete} onClick={event => begin(event, { kind: 'package', deliveryPackage: selectedPackage, action: 'delivery.package.approval.resolve', outcome: 'rejected' })}>Final package rejection</button></>}</div>
      </article> : <p className="rounded-xl bg-[var(--av-color-bg-subtle)] p-5 font-bold">No canonical package is present in this server-authorized projection. Delivery does not infer broader workspace state or invent work from legacy task state.</p>}</div>{projection.page.packageHasMore && <p className="mt-3 text-sm font-bold">Additional packages exist beyond this bounded server page.</p>}</section>
    {monitorProjection ? <MonitorApprovedBaselinePanel projection={monitorProjection}/> : <section className="av-surface p-5" aria-label="Monitor unavailable"><p className="font-black">Canonical Monitor projection unavailable</p><p className="mt-1 text-sm">Delivery remains usable under project authority. No empty, complete, or legacy Monitor state is inferred.</p></section>}

    {pending && <div role="dialog" aria-modal="true" aria-labelledby="delivery-decision-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[var(--av-color-bg)] p-5 shadow-2xl"><h3 id="delivery-decision-title" className="text-xl font-black">Confirm governed decision</h3><p className="mt-2 text-sm font-semibold">Only a confirmed server response may update the committed projection. No automatic future handoff, execution, completion, or telemetry follows.</p>{localError && <div ref={errorSummary} tabIndex={-1} role="alert" className="mt-4 rounded-xl border border-red-500 p-3 font-bold">{localError}</div>}{pending.kind === 'item' && pending.outcome === 'edited' && <div className="mt-4 grid gap-3"><label className="font-black">Item title<input className={input} value={edit.title} onChange={event => setEdit(current => ({ ...current, title: event.target.value }))}/></label><label className="font-black">Description<textarea className={input} rows={4} value={edit.description} onChange={event => setEdit(current => ({ ...current, description: event.target.value }))}/></label><label className="font-black">Acceptance criteria · one per line<textarea className={input} rows={3} value={edit.acceptanceCriteria} onChange={event => setEdit(current => ({ ...current, acceptanceCriteria: event.target.value }))}/></label><label className="font-black">Non-functional requirements · one per line<textarea className={input} rows={3} value={edit.nonFunctionalRequirements} onChange={event => setEdit(current => ({ ...current, nonFunctionalRequirements: event.target.value }))}/></label></div>}{requireRationale && <label className="mt-4 block font-black">Decision rationale<textarea aria-describedby="delivery-rationale-help" className={input} rows={3} value={rationale} onChange={event => setRationale(event.target.value)}/><span id="delivery-rationale-help" className="mt-1 block text-xs font-semibold">Required; minimum four characters. Input is preserved if validation fails.</span></label>}<div className="mt-5 flex justify-end gap-2"><button type="button" className={button} onClick={close}>Cancel</button><button type="button" className={primary} disabled={busy} onClick={() => void submit()}>{busy ? 'Committing…' : 'Confirm'}</button></div></div></div>}
  </div>;
}

const DeliveryItemFilter = ({ deliveryPackage, locked, onBegin }: {
  key?: React.Key;
  deliveryPackage: DeliveryPackageProjection;
  locked: boolean;
  onBegin: (event: React.MouseEvent<HTMLButtonElement>, value: Pending) => void;
}) => {
  const [filter, setFilter] = useState('');
  const filteredItems = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return deliveryPackage.items.filter(item => `${item.type} ${item.title} ${item.status} ${item.sourceCitation?.sectionLocator ?? ''}`.toLowerCase().includes(query));
  }, [deliveryPackage.items, filter]);
  const visibleItems = filteredItems.slice(0, 25);

  return <>
    <label className="mt-4 block text-sm font-black">Filter loaded canonical items (maximum 250)<input aria-label="Filter canonical work items" className={input} value={filter} onChange={event => setFilter(event.target.value)} placeholder="Title, type, status, or citation"/></label>
    <p data-testid="delivery-item-filter-result" className="mt-2 text-sm font-bold">{filteredItems.length} matching items across {deliveryPackage.items.length} loaded</p>
    {filteredItems.length > visibleItems.length && <p className="mt-1 text-xs font-semibold">Showing the first {visibleItems.length} matches. Refine the filter to inspect another loaded item.</p>}
    <div className="mt-4 space-y-3">{visibleItems.map(item => <React.Fragment key={item.aggregateId}><DeliveryItemCard item={item} deliveryPackage={deliveryPackage} locked={locked} onBegin={onBegin}/></React.Fragment>)}</div>
  </>;
};

function DeliveryItemCard({ item, deliveryPackage, locked, onBegin }: { item: DeliveryItemProjection; deliveryPackage: DeliveryPackageProjection; locked: boolean; onBegin: (event: React.MouseEvent<HTMLButtonElement>, value: Pending) => void }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  return <article data-testid={`delivery-item-${item.aggregateId}`} data-item-title={item.title} data-item-status={item.status} data-item-citation={item.sourceCitation?.sectionLocator ?? 'manual'} className={panel}><div className="flex flex-wrap gap-2"><StatusPill>{item.type}</StatusPill><StatusPill>{human(item.status)}</StatusPill><StatusPill>Version {item.version}</StatusPill></div><h4 className="mt-3 text-lg font-black">{item.title}</h4><p className="mt-2 text-sm">{item.description}</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><BaselineList label="Acceptance criteria" values={item.acceptanceCriteria}/><BaselineList label="Non-functional requirements" values={item.nonFunctionalRequirements}/></div>{item.sourceCitation ? <p className="mt-3 break-all rounded-xl bg-[var(--av-color-bg-subtle)] p-3 text-xs font-bold" aria-label="Exact source citation">Source citation: {item.sourceCitation.artifactType.toUpperCase()} artifact v{item.sourceCitation.artifactVersion} · {item.sourceCitation.sectionLocator}</p> : <p className="mt-3 rounded-xl bg-[var(--av-color-bg-subtle)] p-3 text-xs font-bold">Manual item · no fabricated Studio or Assess citation</p>}{item.decision && <p className="mt-3 text-sm font-bold">Decision: {item.decision.outcome} · {item.decision.rationale}</p>}<div className="mt-3 flex flex-wrap gap-2">{item.actions.includes('delivery.item.review') && <><button type="button" className={button} disabled={locked} onClick={event => onBegin(event, { kind: 'item', deliveryPackage, item, outcome: 'edited' })}>Edit immutable descendant</button><button type="button" className={button} disabled={locked} onClick={event => onBegin(event, { kind: 'item', deliveryPackage, item, outcome: 'accepted' })}>Accept proposal</button><button type="button" className={button} disabled={locked} onClick={event => onBegin(event, { kind: 'item', deliveryPackage, item, outcome: 'rejected' })}>Reject proposal</button></>}<button type="button" className={button} aria-expanded={historyOpen} onClick={() => setHistoryOpen(value => !value)}>Version diff and history</button></div>{historyOpen && <div className="mt-3 rounded-xl bg-[var(--av-color-bg-subtle)] p-3"><p className="font-black">Immutable history</p>{item.history.length ? <ol className="mt-2 list-decimal pl-5 text-sm">{item.history.map(version => <li key={`${version.version}:${version.createdAt}`}>v{version.version} · {human(version.status)} · {version.title}</li>)}</ol> : <p className="mt-2 text-sm">No prior descendant version.</p>}<p className="mt-2 text-sm font-bold">Changed fields: {item.diffs.flatMap(diff => diff.changedFields).join(', ') || 'none'}</p></div>}</article>;
}

function BlockedPackageRecovery({ deliveryPackage, locked, onAction }: {
  key?: React.Key;
  deliveryPackage: DeliveryPackageProjection;
  locked: boolean;
  onAction: Props['onAction'];
}) {
  const [active, setActive] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, RecoveryDraft>>({});
  const [error, setError] = useState('');
  const selected = deliveryPackage.items.filter(item => drafts[item.aggregateId]);
  const valid = deliveryPackage.status === 'blocked'
    && deliveryPackage.itemPage.isComplete
    && selected.length > 0
    && selected.every(item => recoveryChanged(item, drafts[item.aggregateId]) && drafts[item.aggregateId].rationale.trim().length >= 4);
  const toggle = (item: DeliveryItemProjection, checked: boolean) => setDrafts(current => {
    if (checked) return { ...current, [item.aggregateId]: recoveryDraft(item) };
    const next = { ...current }; delete next[item.aggregateId]; return next;
  });
  const update = (itemId: string, field: keyof RecoveryDraft, value: string) => setDrafts(current => ({ ...current, [itemId]: { ...current[itemId], [field]: value } }));
  const submitRecovery = async () => {
    if (!valid) { setError('Select at least one descendant, make a material change, and provide rationale. The complete canonical set remains bound.'); return; }
    setError('');
    const expectedItems = deliveryPackage.items.map(item => ({ itemAggregateId: item.aggregateId, expectedAggregateVersion: item.aggregateVersion, expectedItemVersionId: item.currentVersionId }));
    const itemRevisions = selected.map(item => {
      const draft = drafts[item.aggregateId];
      return { itemAggregateId: item.aggregateId, expectedAggregateVersion: item.aggregateVersion, expectedItemVersionId: item.currentVersionId,
        rationale: draft.rationale, authored: { type: item.type, title: draft.title, description: draft.description,
          acceptanceCriteria: recoveryLines(draft.acceptanceCriteria), nonFunctionalRequirements: recoveryLines(draft.nonFunctionalRequirements) } };
    });
    try {
      const committed = await onAction({ action: 'delivery.package.revision.commit', workPackageId: deliveryPackage.id,
        expectedPackageVersion: deliveryPackage.currentVersion, expectedPackageVersionId: deliveryPackage.currentVersionId,
        expectedPackageAggregateVersion: deliveryPackage.aggregateVersion, expectedItems, itemRevisions });
      if (committed === false) { setError('Recovery was not confirmed. Selected descendants and authored input are preserved; reload authoritative state before retrying.'); return; }
      setActive(false); setDrafts({});
    } catch {
      setError('Recovery failed before confirmation. Selected descendants and authored input are preserved; no success state is shown.');
    }
  };
  return <section className="mt-4 rounded-xl border border-[var(--av-color-border-strong)] p-4" aria-labelledby="blocked-package-recovery-title" data-testid="blocked-package-recovery">
    <h4 id="blocked-package-recovery-title" className="font-black">Blocked package recovery</h4>
    <p className="mt-1 text-sm">Only explicitly selected, materially changed descendants are authored. Submission also binds every current descendant identity and fails closed if any page, item, package generation, or version is stale.</p>
    {!deliveryPackage.itemPage.isComplete && <p role="status" className="mt-2 text-sm font-bold">Load every canonical descendant page before recovery can begin.</p>}
    {!active ? <button type="button" className={`${primary} mt-3`} disabled={locked || !deliveryPackage.itemPage.isComplete} onClick={() => setActive(true)}>Prepare blocked package recovery</button> : <>
      <p className="mt-3 text-sm font-bold" data-testid="recovery-complete-set">Complete canonical descendant set loaded: {deliveryPackage.items.length}. Selected changes: {selected.length}.</p>
      {error && <p role="alert" className="mt-3 rounded-xl border border-red-500 p-3 font-bold">{error}</p>}
      <div className="mt-3 max-h-[32rem] space-y-3 overflow-y-auto" aria-label="Canonical descendants available for recovery">{deliveryPackage.items.map((item, index) => {
        const draft = drafts[item.aggregateId];
        const label = `Select ${item.title} for recovery`;
        return <div key={item.aggregateId} className="rounded-xl bg-[var(--av-color-bg-subtle)] p-3">
          <label className="flex min-h-10 items-center gap-2 font-bold"><input type="checkbox" aria-label={label} checked={Boolean(draft)} onChange={event => toggle(item, event.target.checked)}/><span>{index + 1}. {item.title} · v{item.version}</span></label>
          {draft && <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="text-sm font-black">Recovery title for {item.title}<input className={input} value={draft.title} onChange={event => update(item.aggregateId, 'title', event.target.value)}/></label>
            <label className="text-sm font-black">Recovery rationale for {item.title}<textarea className={input} rows={2} value={draft.rationale} onChange={event => update(item.aggregateId, 'rationale', event.target.value)}/></label>
            <label className="text-sm font-black sm:col-span-2">Recovery description for {item.title}<textarea className={input} rows={3} value={draft.description} onChange={event => update(item.aggregateId, 'description', event.target.value)}/></label>
            <label className="text-sm font-black">Recovery acceptance criteria for {item.title}<textarea className={input} rows={3} value={draft.acceptanceCriteria} onChange={event => update(item.aggregateId, 'acceptanceCriteria', event.target.value)}/></label>
            <label className="text-sm font-black">Recovery non-functional requirements for {item.title}<textarea className={input} rows={3} value={draft.nonFunctionalRequirements} onChange={event => update(item.aggregateId, 'nonFunctionalRequirements', event.target.value)}/></label>
            {!recoveryChanged(item, draft) && <p className="text-sm font-bold sm:col-span-2">Make a material change to this selected descendant.</p>}
          </div>}
        </div>;
      })}</div>
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={button} disabled={locked} onClick={() => { setActive(false); setDrafts({}); setError(''); }}>Cancel recovery</button><button type="button" className={primary} disabled={locked || !valid} onClick={() => void submitRecovery()}>Submit resolved package</button></div>
    </>}
  </section>;
}
