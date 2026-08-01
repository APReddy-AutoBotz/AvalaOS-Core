import React, { useMemo } from 'react';
import { View } from '../../types';
import type { AssessProcess, HandoffLedgerEntry } from '../../types';
import { CheckCircleIcon, ClipboardDocumentListIcon, DocumentTextIcon, ExclamationTriangleIcon } from '../shared/icons';
import PageHeader from '../shared/ui/PageHeader';
import StatusBadge, { type StatusBadgeTone } from '../shared/ui/StatusBadge';

interface GovernViewProps {
  processes: AssessProcess[];
  handoffEntries: HandoffLedgerEntry[];
  onNavigate: (view: View) => void;
}

type SummaryTone = 'violet' | 'warning' | 'success' | 'info';
type SummaryCard = {
  label: string;
  value: number;
  detail: string;
  Icon: React.FC<{ className?: string }>;
  tone: SummaryTone;
};

const toneForStatus = (status: string): StatusBadgeTone => {
  const normalized = status.toLowerCase();
  if (normalized.includes('approved') || normalized.includes('completed') || normalized.includes('handed off')) return 'success';
  if (normalized.includes('review')) return 'violet';
  if (normalized.includes('change') || normalized.includes('ready')) return 'warning';
  if (normalized.includes('reject')) return 'danger';
  return 'neutral';
};

const summaryIconClass: Record<SummaryTone, string> = {
  violet: 'bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
  success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200',
};

const GovernView: React.FC<GovernViewProps> = ({ processes, handoffEntries, onNavigate }) => {
  const reviewQueue = useMemo(
    () => processes.filter(process => ['Ready for Review', 'In Review', 'Changes Requested'].includes(process.status)),
    [processes],
  );
  const materialRisk = useMemo(
    () => processes.filter(process => process.criticality === 'Critical' || process.criticality === 'High'),
    [processes],
  );
  const evidenceRefs = useMemo(() => new Set(handoffEntries.flatMap(entry => entry.evidenceRefs)), [handoffEntries]);
  const readyHandoffs = useMemo(
    () => handoffEntries.filter(entry => ['Submitted', 'Accepted', 'Completed'].includes(entry.status)),
    [handoffEntries],
  );
  const summaryCards: SummaryCard[] = [
    { label: 'Review queue', value: reviewQueue.length, detail: 'processes requiring attention', Icon: ClipboardDocumentListIcon, tone: 'violet' },
    { label: 'Material risk', value: materialRisk.length, detail: 'high or critical records', Icon: ExclamationTriangleIcon, tone: 'warning' },
    { label: 'Recorded references', value: evidenceRefs.size, detail: 'references in the current source ledger', Icon: CheckCircleIcon, tone: 'success' },
    { label: 'Handoffs', value: readyHandoffs.length, detail: 'submitted, accepted, or completed', Icon: DocumentTextIcon, tone: 'info' },
  ];

  return (
    <div data-testid="govern-overview" className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Avala Govern · read-only overview"
        title="Governance workbench"
        description="Review source-linked references, assumptions, material risk, and handoff readiness before a permitted action is taken. Actions remain on their existing Assess and Studio surfaces."
        primaryAction={{ label: 'Open Process Catalog', onClick: () => onNavigate(View.PROCESS_CATALOG) }}
        secondaryActions={[{ label: 'Open Studio', onClick: () => onNavigate(View.DOCS_FORGE) }]}
        meta={<StatusBadge tone="info">Read-only composition</StatusBadge>}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Governance summary">
        {summaryCards.map(({ label, value, detail, Icon, tone }) => (
          <div key={label} className="av-stat-strip">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="av-eyebrow">{label}</p>
                <p className="mt-2 text-3xl font-bold tabular-nums text-[var(--av-color-text)]">{value}</p>
                <p className="mt-1 text-xs text-[var(--av-color-text-muted)]">{detail}</p>
              </div>
              <span className={`grid h-10 w-10 place-items-center rounded-xl ${summaryIconClass[tone]}`} aria-hidden="true">
                <Icon className="h-5 w-5" />
              </span>
            </div>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <section className="av-surface overflow-hidden" aria-labelledby="review-queue-title">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--av-color-border)] px-5 py-4">
            <div>
              <h2 id="review-queue-title" className="text-lg font-bold text-[var(--av-color-text)]">Review queue</h2>
              <p className="mt-1 text-sm text-[var(--av-color-text-muted)]">Source-derived process states that need a human decision.</p>
            </div>
            <StatusBadge tone={reviewQueue.length ? 'warning' : 'success'}>{reviewQueue.length ? `${reviewQueue.length} needs attention` : 'No open review'}</StatusBadge>
          </div>
          {reviewQueue.length ? (
            <div className="divide-y divide-[var(--av-color-border)]">
              {reviewQueue.map(process => (
                <button type="button" key={process.id} onClick={() => onNavigate(View.PROCESS_CATALOG)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[var(--av-color-bg-subtle)]">
                  <div className="min-w-0"><p className="truncate text-sm font-bold text-[var(--av-color-text)]">{process.name}</p><p className="mt-1 text-xs text-[var(--av-color-text-muted)]">{process.department || 'Unassigned department'} · {process.criticality} criticality</p></div>
                  <StatusBadge tone={toneForStatus(process.status)}>{process.status}</StatusBadge>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-5 py-12 text-center"><p className="font-bold text-[var(--av-color-text)]">No process is currently in review.</p><p className="mt-1 text-sm text-[var(--av-color-text-muted)]">New review states will appear here when source data is available.</p></div>
          )}
        </section>

        <section className="av-surface p-5" aria-labelledby="control-summary-title">
          <div className="flex items-center justify-between gap-3"><div><h2 id="control-summary-title" className="text-lg font-bold text-[var(--av-color-text)]">Control summary</h2><p className="mt-1 text-sm text-[var(--av-color-text-muted)]">Boundaries that shape the next action.</p></div><ClipboardDocumentListIcon className="h-5 w-5 text-[var(--av-color-accent)]" aria-hidden="true" /></div>
          <dl className="mt-6 space-y-4">
            {[
              ['References', evidenceRefs.size ? `${evidenceRefs.size} linked reference${evidenceRefs.size === 1 ? '' : 's'} in the current ledger` : 'No source references recorded'],
              ['Assumptions', 'Review source assumptions on the assessment record'],
              ['Handoff state', readyHandoffs.length ? `${readyHandoffs.length} submitted or accepted record${readyHandoffs.length === 1 ? '' : 's'}` : 'No submitted or accepted handoff recorded'],
              ['Authority', 'Existing source surfaces retain their access and version checks'],
            ].map(([label, detail]) => <div key={label} className="border-b border-[var(--av-color-border)] pb-3 last:border-0 last:pb-0"><dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--av-color-text-subtle)]">{label}</dt><dd className="mt-1 text-sm font-semibold leading-6 text-[var(--av-color-text)]">{detail}</dd></div>)}
          </dl>
        </section>
      </div>

      <section className="av-surface flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="av-eyebrow">Next source action</p><h2 className="mt-2 text-lg font-bold text-[var(--av-color-text)]">Open the source record to review or resolve it.</h2><p className="mt-1 text-sm text-[var(--av-color-text-muted)]">Govern is a visibility layer; existing source surfaces remain responsible for permitted changes.</p></div>
        <button type="button" onClick={() => onNavigate(View.PROCESS_CATALOG)} className="btn-primary inline-flex min-h-10 shrink-0 items-center justify-center px-4 text-sm font-bold">Open source record</button>
      </section>
    </div>
  );
};

export default GovernView;
