import React, { useEffect, useMemo, useState } from 'react';
import {
  AssessProcess,
  Assessment,
  DocTemplate,
  DocumentGeneration,
  HandoffLedgerEntry,
  Project,
  Task,
  User,
} from '../../types';
import {
  buildDeliveryPack,
  inferDeliveryPackProcessId,
} from '../../services/deliveryPackService';
import { downloadDeliveryPackExport } from '../../services/deliveryPackExportService';
import { useProcessService } from '../../services/processService';
import { useAssessmentService } from '../../services/assessmentService';
import {
  ArrowDownIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '../shared/icons';

interface DeliveryPackViewProps {
  project: Project;
  tasks: Task[];
  users: User[];
  docTemplates: DocTemplate[];
  documentGenerations: DocumentGeneration[];
  handoffEntries: HandoffLedgerEntry[];
}

const statusClass = (status: string) => {
  if (status === 'Ready for Review' || status === 'Complete' || status === 'Linked') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/30';
  }
  if (status === 'Blocked' || status === 'Missing' || status === 'Action Required') {
    return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:border-rose-500/30';
  }
  if (status === 'Lineage Incomplete' || status === 'Partial' || status === 'Evidence Review Required' || status === 'Approval Required') {
    return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-100 dark:border-amber-500/30';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700';
};

const StatCard: React.FC<{ label: string; value: string | number; detail: string }> = ({ label, value, detail }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-surface-dark">
    <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{label}</div>
    <div className="mt-2 text-2xl font-black text-[#002C4B] dark:text-white">{value}</div>
    <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{detail}</div>
  </div>
);

const Section: React.FC<{ title: string; icon: React.FC<{ className?: string }>; children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
  <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-surface-dark">
    <div className="mb-4 flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#002C4B] text-white">
        <Icon className="h-5 w-5" />
      </div>
      <h2 className="text-lg font-black text-[#002C4B] dark:text-white">{title}</h2>
    </div>
    {children}
  </section>
);

const DeliveryPackView: React.FC<DeliveryPackViewProps> = ({
  project,
  tasks,
  users,
  docTemplates,
  documentGenerations,
  handoffEntries,
}) => {
  const { processes } = useProcessService();
  const { getAssessmentForProcess } = useAssessmentService();
  const [assessment, setAssessment] = useState<Assessment | null>(null);

  const processId = useMemo(() => inferDeliveryPackProcessId(tasks), [tasks]);
  const process = useMemo<AssessProcess | null>(() => {
    if (!processId) return null;
    return processes.find(item => item.id === processId) || null;
  }, [processes, processId]);

  useEffect(() => {
    let cancelled = false;
    if (!processId) {
      setAssessment(null);
      return;
    }

    getAssessmentForProcess(processId).then(result => {
      if (!cancelled) setAssessment(result);
    });

    return () => {
      cancelled = true;
    };
  }, [getAssessmentForProcess, processId]);

  const pack = useMemo(() => buildDeliveryPack({
    project,
    tasks,
    users,
    docTemplates,
    documentGenerations,
    handoffEntries,
    process,
    assessment,
  }), [project, tasks, users, docTemplates, documentGenerations, handoffEntries, process, assessment]);

  const missingLineageCount = pack.workItems.filter(item => item.lineageStatus !== 'Linked').length;
  const blockedWorkItems = pack.workItems.filter(item => item.status === 'Blocked');

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-surface-dark">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-lg bg-[#ffbc03]/20 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-[#7a5200] dark:text-[#ffdc75]">Governed Delivery Pack</span>
              <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(pack.status)}`}>{pack.status}</span>
            </div>
            <h1 className="mt-4 text-3xl font-black text-[#002C4B] dark:text-white">{pack.title}</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
              Project handoff snapshot for {project.name}, assembled from existing Assess, Studio, Delivery, and handoff metadata references.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <button
              type="button"
              onClick={() => downloadDeliveryPackExport(pack, 'markdown')}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-black text-[#002C4B] shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
              title="Download Markdown export"
            >
              <ArrowDownIcon className="h-4 w-4" />
              Markdown
            </button>
            <button
              type="button"
              onClick={() => downloadDeliveryPackExport(pack, 'json')}
              className="inline-flex items-center gap-2 rounded-lg bg-[#002C4B] px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-[#003F6B]"
              title="Download JSON export"
            >
              <ArrowDownIcon className="h-4 w-4" />
              JSON
            </button>
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:ring-slate-800">
          Delivery Pack exports are review artifacts that require human sign-off. Review incomplete lineage or missing evidence refs before external sharing.
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Sources" value={pack.sources.length} detail="Assess, Studio, Delivery, and handoff references" />
          <StatCard label="Documents" value={pack.documents.length} detail="Referenced generated document sets" />
          <StatCard label="Work Items" value={pack.workItems.length} detail={`${blockedWorkItems.length} blocked, ${missingLineageCount} lineage gaps`} />
          <StatCard label="Audit Events" value={pack.auditSummary.length} detail="Read-only handoff metadata entries" />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Section title="Decision And Avala Govern" icon={ClipboardDocumentListIcon}>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Assess Decision</div>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Gate</dt><dd className="font-bold text-slate-900 dark:text-white">{pack.decisionSummary?.gateDecision || 'Not linked'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Risk</dt><dd className="font-bold text-slate-900 dark:text-white">{pack.decisionSummary?.riskTier || 'Not linked'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Technology</dt><dd className="font-bold text-slate-900 dark:text-white">{pack.decisionSummary?.primaryTechnology || 'Not linked'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Score Version</dt><dd className="font-bold text-slate-900 dark:text-white">{pack.decisionSummary?.scoreVersion || 'Not linked'}</dd></div>
              </dl>
            </div>
            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Avala Govern Snapshot</div>
              {pack.governLite ? (
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Status</dt><dd className="font-bold text-slate-900 dark:text-white">{pack.governLite.governanceStatus}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Autonomy</dt><dd className="font-bold text-slate-900 dark:text-white">{pack.governLite.autonomyLevel}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Risk</dt><dd className="font-bold text-slate-900 dark:text-white">{pack.governLite.riskLevel}</dd></div>
                  <div className="pt-2 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">{pack.governLite.nextGovernanceAction}</div>
                </dl>
              ) : (
                <p className="mt-3 text-sm font-semibold text-slate-500">No Avala Govern snapshot is linked for this project.</p>
              )}
            </div>
          </div>
        </Section>

        <Section title="Approval And Evidence" icon={CheckCircleIcon}>
          <div className="space-y-4">
            {[...pack.approvalChecklist, ...pack.evidenceChecklist].map(item => (
              <div key={item.id} className="flex gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <span className={`mt-0.5 h-fit rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusClass(item.status)}`}>{item.status}</span>
                <div>
                  <div className="text-sm font-black text-slate-900 dark:text-white">{item.label}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{item.source} · {item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title="Document References" icon={DocumentTextIcon}>
        <div className="grid gap-4 lg:grid-cols-2">
          {pack.documents.map(document => (
            <div key={document.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-black text-slate-900 dark:text-white">{document.title}</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{document.id} · {document.generatedAt}</p>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusClass(document.approvalStatus)}`}>{document.approvalStatus}</span>
              </div>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{document.summary}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                <span>{document.sectionCount} sections</span>
                <span>{document.workItemCount} generated work items</span>
                <span>{document.artifactKeys.join(', ')}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Work Item Lineage" icon={InformationCircleIcon}>
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[1fr_140px_140px_120px] bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-900/60">
              <div>Work Item</div>
              <div>Status</div>
              <div>Owners</div>
              <div>Lineage</div>
            </div>
            {pack.workItems.map(item => (
              <div key={item.id} className="grid grid-cols-[1fr_140px_140px_120px] border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
                <div>
                  <div className="font-black text-slate-900 dark:text-white">{item.title}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">{item.type} · {item.priority} · evidence refs: {item.evidenceRefs.join(', ') || 'none'}</div>
                </div>
                <div className="font-bold text-slate-700 dark:text-slate-200">{item.status}</div>
                <div className="font-semibold text-slate-600 dark:text-slate-300">{item.ownerNames.join(', ')}</div>
                <div><span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusClass(item.lineageStatus)}`}>{item.lineageStatus}</span></div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Blockers And Audit Summary" icon={ExclamationTriangleIcon}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            {pack.blockers.length === 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">No blockers are recorded in this pack.</div>
            ) : pack.blockers.map(blocker => (
              <div key={blocker.id} className="rounded-lg border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
                <div className="text-sm font-black text-rose-900 dark:text-rose-100">{blocker.severity}: {blocker.label}</div>
                <div className="mt-1 text-xs font-semibold text-rose-700 dark:text-rose-200">{blocker.source} · {blocker.detail}</div>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {pack.auditSummary.length === 0 ? (
              <div className="rounded-lg border border-slate-200 p-4 text-sm font-bold text-slate-500 dark:border-slate-800">No handoff audit metadata is linked.</div>
            ) : pack.auditSummary.map(event => (
              <div key={event.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <div className="text-sm font-black text-slate-900 dark:text-white">{event.label}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">{event.sourceType}:{event.sourceId} · {event.status} · {event.evidenceRefs.join(', ') || 'no evidence refs'}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
};

export default DeliveryPackView;
