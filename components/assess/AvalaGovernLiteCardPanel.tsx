import React from 'react';
import { AvalaGovernLiteCard } from '../../types';
import {
  BanIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
} from '../shared/icons';

interface AvalaGovernLiteCardPanelProps {
  governCard: AvalaGovernLiteCard;
}

const DetailList: React.FC<{ items: string[]; emptyLabel?: string }> = ({ items, emptyLabel = 'None recorded' }) => (
  <ul className="mt-3 space-y-2">
    {(items.length ? items : [emptyLabel]).map(item => (
      <li key={item} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold leading-5 text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
        {item}
      </li>
    ))}
  </ul>
);

const AvalaGovernLiteCardPanel: React.FC<AvalaGovernLiteCardPanelProps> = ({ governCard }) => {
  const statusTone = governCard.governanceStatus === 'Blocked'
    ? 'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-100'
    : governCard.governanceStatus === 'Approval Required'
      ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100'
      : 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100';

  return (
    <section className="premium-surface overflow-hidden rounded-3xl border border-[#002C4B]/10">
      <div className="grid gap-0 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="bg-[#002C4B] p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-[#ffbc03]">
              <ClipboardDocumentListIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#ffbc03]">Avala Govern</p>
              <h2 className="text-xl font-black">{governCard.agentOrAutomationName}</h2>
            </div>
          </div>
          <p className="mt-4 text-sm font-semibold leading-6 text-white/72">
            Control-card step between Assess and Studio: deterministic Decision Pack context, human review, evidence, assumptions, and governed handoff readiness. It does not run bots, execute RPA jobs or agents, update external systems, or change deterministic Assess scoring.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/50">Autonomy</p>
              <p className="mt-2 text-sm font-black leading-5 text-[#ffdf77]">{governCard.autonomyLevel}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/50">Risk</p>
              <p className="mt-2 text-sm font-black leading-5">{governCard.riskLevel}</p>
            </div>
          </div>
          <div className={`mt-5 rounded-2xl border p-4 ${statusTone}`}>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-70">Governance status</p>
            <p className="mt-1 text-sm font-black">{governCard.governanceStatus}</p>
            {governCard.blockedReason && <p className="mt-2 text-xs font-semibold leading-5">{governCard.blockedReason}</p>}
          </div>
        </div>

        <div className="p-6">
          <div className="grid gap-4 md:grid-cols-4">
            {[
              ['Approval required', governCard.humanApprovalRequired ? 'Yes' : 'No'],
              ['Evidence required', governCard.evidenceRequired ? 'Yes' : 'No'],
              ['Data sensitivity', governCard.dataSensitivity],
              ['Review frequency', governCard.reviewFrequency],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/80 dark:bg-slate-900/60 dark:ring-slate-800">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
                <p className="mt-2 text-sm font-black text-slate-900 dark:text-white">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Registry summary</p>
            <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
              {[
                ['Business owner', governCard.businessOwner],
                ['Technical owner', governCard.technicalOwner],
                ['Mapped process', governCard.mappedProcessId],
                ['Technology pattern', governCard.technologyPattern],
                ['Systems', governCard.systemsAccessed.join(', ')],
                ['Tools', governCard.toolsUsed.length ? governCard.toolsUsed.join(', ') : 'Tools not documented'],
                ['Audit status', governCard.auditStatus],
                ['Next action', governCard.nextGovernanceAction],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</span>
                  <span className="font-black text-slate-900 dark:text-white">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Autonomy rationale</p>
              <DetailList items={governCard.autonomyRationale} />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Risk rationale</p>
              <DetailList items={governCard.riskRationale} />
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Approval policy</p>
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
                <p className="text-sm font-black text-amber-950 dark:text-amber-100">{governCard.approvalPolicy}</p>
                <DetailList items={governCard.approvalRationale} />
              </div>
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Evidence policy</p>
              <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900/60 dark:bg-sky-950/20">
                <p className="text-sm font-black text-sky-950 dark:text-sky-100">{governCard.evidencePolicy}</p>
                <ul className="mt-3 space-y-2">
                  {(governCard.evidenceGaps.length ? governCard.evidenceGaps : [{ label: 'No evidence gaps recorded.', severity: 'Low', nextAction: 'Keep evidence linked through handoff.' }]).map(gap => (
                    <li key={`${gap.label}-${gap.nextAction}`} className="rounded-xl bg-white/70 p-3 text-sm font-semibold leading-5 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-950/30 dark:text-slate-200 dark:ring-slate-800">
                      <span className="font-black">{gap.severity}:</span> {gap.label}
                      <span className="block text-xs font-bold text-slate-500 dark:text-slate-400">{gap.nextAction}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
                <CheckCircleIcon className="h-4 w-4" /> Allowed actions
              </p>
              <DetailList items={governCard.allowedActions} />
            </div>
            <div>
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
                <BanIcon className="h-4 w-4" /> Blocked actions
              </p>
              <ul className="mt-3 space-y-2">
                {governCard.blockedActions.map(action => (
                  <li key={action} className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm font-semibold leading-5 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-100">
                    <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AvalaGovernLiteCardPanel;
