import React, { useMemo } from 'react';
import { Project, Task, User, ProjectLifecycleStage, Scope, ScopeType, View } from '../../types';
import { ChartPieIcon, ChevronRightIcon, ExclamationTriangleIcon } from './icons';
import PageHeader from './ui/PageHeader';
import StatusBadge, { type StatusBadgeTone } from './ui/StatusBadge';

interface PortfolioViewProps {
  projects: Project[];
  tasks: Task[];
  users: User[];
  // Retained for compatibility with the operational portfolio handler. Monitor itself is read-only.
  onUpdateProjectStage: (projectId: string, newStage: ProjectLifecycleStage) => void;
  onScopeChange: (scope: Scope) => void;
  onViewChange: (view: View) => void;
  captureMode?: boolean;
  outcomeSignal?: {
    label: string;
    detail: string;
    status: string;
    lineageGapCount: number;
  };
}

const healthTone: Record<Project['healthStatus'], StatusBadgeTone> = {
  'On Track': 'success',
  'At Risk': 'warning',
  'Off Track': 'danger',
};

const PortfolioView: React.FC<PortfolioViewProps> = ({ projects, tasks, users, onScopeChange, onViewChange, captureMode = false, outcomeSignal }) => {
  const blockedTasks = useMemo(() => tasks.filter(task => task.status === 'Blocked'), [tasks]);
  const openTasks = useMemo(() => tasks.filter(task => task.status !== 'Done'), [tasks]);
  const atRiskProjects = projects.filter(project => project.healthStatus !== 'On Track');

  const openProject = (project: Project) => {
    onScopeChange({ type: ScopeType.PROJECT, id: project.id, name: project.name });
    onViewChange(View.BOARDS);
  };

  return <div data-testid="monitor-overview" data-capture-state={captureMode ? 'synthetic-read-only' : undefined} className="mx-auto max-w-7xl space-y-6">
    <PageHeader eyebrow="Avala Monitor · portfolio intelligence" title="Monitor" description="A read-only view of disposition, readiness, risk, blockers, and delivery lineage from the records available in this workspace." primaryAction={{ label: 'Open Delivery', onClick: () => onViewChange(View.BOARDS) }} meta={<StatusBadge tone="info">{captureMode ? 'Synthetic · read-only' : 'Recorded data only'}</StatusBadge>} />

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Monitor summary">
      {[['Initiatives', projects.length, 'active project records', 'neutral'], ['At risk', atRiskProjects.length, 'records requiring attention', atRiskProjects.length ? 'warning' : 'success'], ['Open work', openTasks.length, 'authorized delivery records', 'info'], ['Blocked work', blockedTasks.length, 'delivery blockers recorded', blockedTasks.length ? 'danger' : 'success']].map(([label, value, detail, tone]) => <div key={String(label)} className="av-stat-strip"><div className="flex items-start justify-between gap-3"><div><p className="av-eyebrow">{label}</p><p className="mt-2 text-3xl font-bold tabular-nums text-[var(--av-color-text)]">{value as number}</p><p className="mt-1 text-xs text-[var(--av-color-text-muted)]">{detail}</p></div>{label === 'Blocked work' ? <ExclamationTriangleIcon className={`h-5 w-5 ${tone === 'danger' ? 'text-red-600' : 'text-emerald-600'}`} /> : <ChartPieIcon className="h-5 w-5 text-[var(--av-color-accent)]" />}</div></div>)}
    </section>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
      <section className="av-surface overflow-hidden" aria-labelledby="monitor-projects-title"><div className="flex items-center justify-between gap-3 border-b border-[var(--av-color-border)] px-5 py-4"><div><h2 id="monitor-projects-title" className="text-lg font-bold text-[var(--av-color-text)]">Initiative disposition</h2><p className="mt-1 text-sm text-[var(--av-color-text-muted)]">Open a project to continue in its authorized Delivery workspace.</p></div><span className="text-xs font-bold text-[var(--av-color-text-subtle)]">{projects.length} records</span></div>{projects.length ? <div className="divide-y divide-[var(--av-color-border)]">{projects.map(project => { const projectTasks = tasks.filter(task => task.projectId === project.id); const owner = users.find(user => user.id === project.ownerId); const blocked = projectTasks.filter(task => task.status === 'Blocked').length; return <button type="button" key={project.id} onClick={() => openProject(project)} className="flex w-full flex-col gap-3 px-5 py-4 text-left transition hover:bg-[var(--av-color-bg-subtle)] sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-bold text-[var(--av-color-text)]">{project.name}</p><StatusBadge tone={healthTone[project.healthStatus]}>{project.healthStatus}</StatusBadge></div><p className="mt-1 truncate text-xs text-[var(--av-color-text-muted)]">{project.lifecycleStage} · Owner: {owner?.name || 'Unassigned'}</p></div><div className="flex items-center gap-4 text-xs font-semibold text-[var(--av-color-text-muted)]"><span>{projectTasks.length} work items</span>{blocked > 0 && <StatusBadge tone="danger">{blocked} blocked</StatusBadge>}<ChevronRightIcon className="h-4 w-4 text-[var(--av-color-text-subtle)]" /></div></button>; })}</div> : <div className="px-5 py-12 text-center"><p className="font-bold text-[var(--av-color-text)]">No initiative records are available.</p><p className="mt-1 text-sm text-[var(--av-color-text-muted)]">Monitor does not create or invent portfolio values.</p></div>}</section>

      <section className="av-surface p-5" aria-labelledby="monitor-readiness-title"><div className="flex items-center justify-between gap-3"><div><h2 id="monitor-readiness-title" className="text-lg font-bold text-[var(--av-color-text)]">Readiness signals</h2><p className="mt-1 text-sm text-[var(--av-color-text-muted)]">Only signals backed by loaded records appear.</p></div><ChartPieIcon className="h-5 w-5 text-[var(--av-color-accent)]" /></div><div className="mt-6 space-y-4"><div className="flex items-start justify-between gap-4 border-b border-[var(--av-color-border)] pb-4"><div><p className="text-sm font-bold text-[var(--av-color-text)]">Delivery blockers</p><p className="mt-1 text-xs leading-5 text-[var(--av-color-text-muted)]">{blockedTasks.length ? 'Open the relevant Delivery workspace to resolve the recorded blocker.' : 'No blocked delivery record is present in this view.'}</p></div><StatusBadge tone={blockedTasks.length ? 'danger' : 'success'}>{blockedTasks.length ? `${blockedTasks.length} open` : 'Clear'}</StatusBadge></div><div className="flex items-start justify-between gap-4 border-b border-[var(--av-color-border)] pb-4"><div><p className="text-sm font-bold text-[var(--av-color-text)]">{outcomeSignal?.label ?? 'Recorded outcome'}</p><p className="mt-1 text-xs leading-5 text-[var(--av-color-text-muted)]">{outcomeSignal?.detail ?? 'No realized outcome field is available in the current Monitor projection.'}</p></div><StatusBadge tone={outcomeSignal ? 'success' : 'neutral'}>{outcomeSignal?.status ?? 'Not recorded'}</StatusBadge></div><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold text-[var(--av-color-text)]">Handoff lineage</p><p className="mt-1 text-xs leading-5 text-[var(--av-color-text-muted)]">{outcomeSignal?.lineageGapCount ? `${outcomeSignal.lineageGapCount} synthetic initiative still requires a source handoff reference.` : 'Follow approved source context from Assess and Studio into Delivery.'}</p></div><StatusBadge tone={outcomeSignal?.lineageGapCount ? 'warning' : 'info'}>{outcomeSignal?.lineageGapCount ? `${outcomeSignal.lineageGapCount} gap` : 'Use source records'}</StatusBadge></div></div></section>
    </div>
  </div>;
};

export default PortfolioView;
