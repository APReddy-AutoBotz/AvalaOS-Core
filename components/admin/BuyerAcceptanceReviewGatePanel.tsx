import React, { useMemo } from 'react';
import {
  CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT,
  type BuyerAcceptanceReviewFindingSeverity,
  type BuyerAcceptanceReviewFindingStatus,
  type BuyerAcceptanceReviewGateChecklistStatus,
  type BuyerAcceptanceReviewGateStatus,
} from '../../services/buyerAcceptanceReviewGate';
import {
  getBlockingReviewFindings,
  getRequiredBeforeExportChecklist,
  getReviewChecklistStatusLabel,
  getReviewFindingSeverityLabel,
  getReviewFindingStatusLabel,
  getReviewGateExportBlockers,
  getReviewGateReadinessBlockers,
  getReviewGateStatusLabel,
  groupReviewGateQuestionsByRole,
  summarizeReviewGateStatus,
} from '../../services/buyerAcceptanceReviewGatePresentation';
import { getBuyerAcceptancePackStatusLabel } from '../../services/buyerAcceptancePackPresentation';

const gateStatusStyles: Record<BuyerAcceptanceReviewGateStatus, string> = {
  evidence_required: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100',
  rehearsal_required: 'border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-100',
  blocked: 'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100',
  review_ready: 'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100',
};

const findingSeverityStyles: Record<BuyerAcceptanceReviewFindingSeverity, string> = {
  medium: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200',
  high: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200',
  blocker: 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200',
};

const findingStatusStyles: Record<BuyerAcceptanceReviewFindingStatus, string> = {
  rehearsal_required: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200',
  evidence_required: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200',
  blocked: 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200',
};

const checklistStatusStyles: Record<BuyerAcceptanceReviewGateChecklistStatus, string> = {
  rehearsal_required: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200',
  evidence_required: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200',
  blocked: 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200',
};

const StatusPill: React.FC<{ status: BuyerAcceptanceReviewGateStatus }> = ({ status }) => (
  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.11em] ${gateStatusStyles[status]}`}>
    {getReviewGateStatusLabel(status)}
  </span>
);

const FindingSeverityPill: React.FC<{ severity: BuyerAcceptanceReviewFindingSeverity }> = ({ severity }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.11em] ${findingSeverityStyles[severity]}`}>
    {getReviewFindingSeverityLabel(severity)}
  </span>
);

const FindingStatusPill: React.FC<{ status: BuyerAcceptanceReviewFindingStatus }> = ({ status }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.11em] ${findingStatusStyles[status]}`}>
    {getReviewFindingStatusLabel(status)}
  </span>
);

const ChecklistStatusPill: React.FC<{ status: BuyerAcceptanceReviewGateChecklistStatus }> = ({ status }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.11em] ${checklistStatusStyles[status]}`}>
    {getReviewChecklistStatusLabel(status)}
  </span>
);

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
    {label}
  </div>
);

const SectionHeader: React.FC<{ eyebrow: string; title: string; description: string }> = ({ eyebrow, title, description }) => (
  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{eyebrow}</p>
      <h3 className="mt-1 text-lg font-black text-[#002C4B] dark:text-white">{title}</h3>
      <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  </div>
);

const ListBlock: React.FC<{ items: readonly string[]; emptyLabel: string; tone?: 'neutral' | 'amber' | 'rose' }> = ({
  items,
  emptyLabel,
  tone = 'neutral',
}) => {
  if (items.length === 0) {
    return <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{emptyLabel}</p>;
  }

  const toneClass = tone === 'rose'
    ? 'bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-100'
    : tone === 'amber'
      ? 'bg-amber-50 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100'
      : 'bg-slate-50 text-slate-600 dark:bg-slate-950 dark:text-slate-300';

  return (
    <ul className="space-y-1.5">
      {items.map(item => (
        <li key={item} className={`rounded-xl px-3 py-2 text-xs font-semibold leading-5 ${toneClass}`}>
          {item}
        </li>
      ))}
    </ul>
  );
};

const BuyerAcceptanceReviewGatePanel: React.FC = () => {
  const gate = CURRENT_BUYER_ACCEPTANCE_REVIEW_GATE_SNAPSHOT;
  const roleGroups = useMemo(() => groupReviewGateQuestionsByRole(gate), [gate]);
  const exportBlockers = useMemo(() => getReviewGateExportBlockers(gate), [gate]);
  const readinessBlockers = useMemo(() => getReviewGateReadinessBlockers(gate), [gate]);
  const blockingFindings = useMemo(() => getBlockingReviewFindings(gate), [gate]);
  const requiredBeforeExportChecklist = useMemo(() => getRequiredBeforeExportChecklist(gate), [gate]);
  const statusSummary = useMemo(() => summarizeReviewGateStatus(gate), [gate]);

  return (
    <section className="premium-surface overflow-hidden rounded-3xl border border-[#002C4B]/10">
      <div className="border-b border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#ffbc03]">Buyer and AP rehearsal</p>
            <h2 className="mt-2 text-2xl font-black text-[#002C4B] dark:text-white">Review Rehearsal Gate</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
              {gate.summary}
            </p>
          </div>
          <div className={`rounded-2xl border px-4 py-3 text-right ${gateStatusStyles[gate.gateStatus]}`}>
            <p className="text-[10px] font-black uppercase tracking-[0.14em]">Gate status</p>
            <p className="mt-1 text-sm font-black">{getReviewGateStatusLabel(gate.gateStatus)}</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          {statusSummary}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-2xl font-black text-amber-950 dark:text-amber-100">{getReviewGateStatusLabel(gate.gateStatus)}</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700 dark:text-amber-200">Gate state</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-2xl font-black text-amber-950 dark:text-amber-100">{getBuyerAcceptancePackStatusLabel(gate.sourcePackStatus)}</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700 dark:text-amber-200">Source pack status</p>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
            <p className="text-2xl font-black text-rose-900 dark:text-rose-100">{exportBlockers.length}</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-rose-700 dark:text-rose-200">Export blockers</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-2xl font-black text-amber-950 dark:text-amber-100">{readinessBlockers.length}</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700 dark:text-amber-200">Readiness blockers</p>
          </div>
        </div>
      </div>

      <div className="space-y-8 p-6">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
          <SectionHeader
            eyebrow="Boundary disclosure"
            title="Read-only rehearsal boundary"
            description="The panel shows a deterministic review rehearsal state and does not create new operational authority."
          />
          <p className="text-sm font-semibold leading-6 text-amber-950 dark:text-amber-100">
            This is a read-only rehearsal gate. It is not an approval, not an export, not readiness evidence, not compliance evidence, and no PDF/download generated. Export/PDF/download remains blocked until a future AP-approved slice defines that scope.
          </p>
        </section>

        <section>
          <SectionHeader
            eyebrow="Blocked scope"
            title="Export blockers"
            description="These blockers prevent export, PDF, download, buyer signoff, and status-change language from appearing as available actions."
          />
          {exportBlockers.length === 0 ? (
            <EmptyState label="No export blockers available." />
          ) : (
            <ListBlock items={exportBlockers} emptyLabel="No export blockers available." tone="rose" />
          )}
        </section>

        <section>
          <SectionHeader
            eyebrow="Readiness boundaries"
            title="Readiness blockers"
            description="These maturity areas remain evidence-required and must not be converted into buyer claims by this UI."
          />
          {readinessBlockers.length === 0 ? (
            <EmptyState label="No readiness blockers available." />
          ) : (
            <ListBlock items={readinessBlockers} emptyLabel="No readiness blockers available." tone="amber" />
          )}
        </section>

        <section>
          <SectionHeader
            eyebrow="Reviewer rehearsal"
            title="Questions and expected safe answers"
            description="Questions are grouped by reviewer role. Safe answers and evidence references preserve the current proof boundary."
          />
          {roleGroups.length === 0 ? (
            <EmptyState label="No reviewer question groups available." />
          ) : (
            <div className="space-y-4">
              {roleGroups.map(group => (
                <article key={group.role} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h4 className="text-sm font-black uppercase tracking-[0.12em] text-[#002C4B] dark:text-white">{group.label}</h4>
                    <span className="text-xs font-black text-slate-400">{group.questions.length} questions</span>
                  </div>
                  {group.questions.length === 0 ? (
                    <EmptyState label="No reviewer questions available for this role." />
                  ) : (
                    <div className="grid gap-4">
                      {group.questions.map(question => (
                        <section key={question.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Question</p>
                              <h5 className="mt-1 text-sm font-black text-slate-950 dark:text-white">{question.question}</h5>
                            </div>
                            {question.requiredBeforeExport && (
                              <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.11em] text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                                Required before export
                              </span>
                            )}
                          </div>
                          <div className="mt-4 grid gap-4 lg:grid-cols-2">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Expected safe answer</p>
                              <p className="mt-1 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">{question.expectedSafeAnswer}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Expected evidence reference</p>
                              <p className="mt-1 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">{question.expectedEvidenceReference}</p>
                            </div>
                          </div>
                          <div className="mt-4 grid gap-4 lg:grid-cols-2">
                            <div>
                              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Must not claim</p>
                              <ListBlock items={question.mustNotClaim} emptyLabel="No must-not-claim entries." tone="rose" />
                            </div>
                            <div>
                              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Related open gaps</p>
                              <ListBlock items={question.relatedOpenGapIds} emptyLabel="No related open gaps." />
                            </div>
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHeader
            eyebrow="Findings"
            title="Blocking and evidence-required findings"
            description="Findings are read-only review blockers and do not change the Buyer Acceptance Pack status."
          />
          {gate.findings.length === 0 ? (
            <EmptyState label="No review findings available." />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {gate.findings.map(finding => (
                <article key={finding.id} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-black text-[#002C4B] dark:text-white">{finding.label}</h4>
                      <p className="mt-2 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">{finding.rationale}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <FindingSeverityPill severity={finding.severity} />
                      <FindingStatusPill status={finding.status} />
                    </div>
                  </div>
                  <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                    {finding.requiredAction}
                  </p>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div>
                      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Related claims</p>
                      <ListBlock items={finding.relatedClaimIds} emptyLabel="No related claim IDs." />
                    </div>
                    <div>
                      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Related open gaps</p>
                      <ListBlock items={finding.relatedOpenGapIds} emptyLabel="No related open gaps." />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold leading-6 text-rose-950 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
            Blocking findings: {blockingFindings.length}
          </div>
        </section>

        <section>
          <SectionHeader
            eyebrow="Checklist"
            title="Rehearsal checklist items"
            description="Checklist items are display-only review prerequisites and do not create approval workflow."
          />
          {gate.checklist.length === 0 ? (
            <EmptyState label="No checklist items available." />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {gate.checklist.map(item => (
                <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h4 className="text-sm font-black text-[#002C4B] dark:text-white">{item.label}</h4>
                    <ChecklistStatusPill status={item.status} />
                  </div>
                  <p className="mt-3 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">{item.rationale}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.requiredBeforeExport && (
                      <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.11em] text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                        Required before export
                      </span>
                    )}
                    {item.requiredBeforeBuyerReview && (
                      <span className="rounded-full border border-sky-300 bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.11em] text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200">
                        Required before buyer review
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            Required-before-export checklist entries: {requiredBeforeExportChecklist.length}
          </div>
        </section>

        <section>
          <SectionHeader
            eyebrow="Non-claims"
            title="Prohibited claims and safe alternatives"
            description="These phrases are shown only as blocked/non-claim guidance and must not be used as positive buyer proof."
          />
          {gate.prohibitedClaims.length === 0 ? (
            <EmptyState label="No prohibited claim entries available." />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {gate.prohibitedClaims.map(nonClaim => (
                <article key={nonClaim.id} className="rounded-2xl border border-rose-200 bg-white p-5 dark:border-rose-500/30 dark:bg-slate-900/70">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-rose-700 dark:text-rose-300">Do not claim</p>
                  <h4 className="mt-1 text-sm font-black text-slate-950 dark:text-white">{nonClaim.prohibitedClaim}</h4>
                  <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                    {nonClaim.safeAlternative}
                  </p>
                  <p className="mt-3 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{nonClaim.reason}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
};

export default BuyerAcceptanceReviewGatePanel;
