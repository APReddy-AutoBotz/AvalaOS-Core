import React, { useMemo } from 'react';
import {
  CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT,
  type BuyerAcceptanceWalkthroughStatus,
} from '../../services/buyerAcceptanceAdminWalkthrough';
import {
  getWalkthroughDeferredTracks,
  getWalkthroughExportBlockers,
  getWalkthroughFindingStatusLabel,
  getWalkthroughFindingsRequiredBeforeBuyerSignoff,
  getWalkthroughFindingsRequiredBeforeExport,
  getWalkthroughReadinessBlockers,
  getWalkthroughStatusLabel,
  getWalkthroughStepLabel,
  groupWalkthroughStepsByAdminSection,
  summarizeAdminWalkthroughStatus,
} from '../../services/buyerAcceptanceAdminWalkthroughPresentation';
import { getAdminSectionByKey } from '../../services/adminWorkbenchModel';
import { getBuyerAcceptancePackStatusLabel } from '../../services/buyerAcceptancePackPresentation';
import { getReviewGateStatusLabel } from '../../services/buyerAcceptanceReviewGatePresentation';

const walkthroughStatusStyles: Record<BuyerAcceptanceWalkthroughStatus, string> = {
  evidence_required: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100',
  rehearsal_required: 'border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-100',
  blocked: 'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100',
};

const StatusPill: React.FC<{ status: BuyerAcceptanceWalkthroughStatus }> = ({ status }) => (
  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.11em] ${walkthroughStatusStyles[status]}`}>
    {getWalkthroughStatusLabel(status)}
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

const ListBlock: React.FC<{ items: readonly string[]; emptyLabel: string; tone?: 'neutral' | 'amber' | 'rose' | 'sky' }> = ({
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
      : tone === 'sky'
        ? 'bg-sky-50 text-sky-900 dark:bg-sky-500/10 dark:text-sky-100'
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

const BuyerAcceptanceAdminWalkthroughPanel: React.FC = () => {
  const walkthrough = CURRENT_BUYER_ACCEPTANCE_ADMIN_WALKTHROUGH_SNAPSHOT;
  const statusSummary = useMemo(() => summarizeAdminWalkthroughStatus(walkthrough), [walkthrough]);
  const stepGroups = useMemo(() => groupWalkthroughStepsByAdminSection(walkthrough), [walkthrough]);
  const exportBlockers = useMemo(() => getWalkthroughExportBlockers(walkthrough), [walkthrough]);
  const readinessBlockers = useMemo(() => getWalkthroughReadinessBlockers(walkthrough), [walkthrough]);
  const deferredTracks = useMemo(() => getWalkthroughDeferredTracks(walkthrough), [walkthrough]);
  const requiredBeforeExportFindings = useMemo(() => getWalkthroughFindingsRequiredBeforeExport(walkthrough), [walkthrough]);
  const requiredBeforeBuyerSignoffFindings = useMemo(() => getWalkthroughFindingsRequiredBeforeBuyerSignoff(walkthrough), [walkthrough]);

  return (
    <section className="premium-surface overflow-hidden rounded-3xl border border-[#002C4B]/10">
      <div className="border-b border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#ffbc03]">Internal buyer-review rehearsal</p>
            <h2 className="mt-2 text-2xl font-black text-[#002C4B] dark:text-white">Admin Walkthrough</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
              {walkthrough.summary}
            </p>
          </div>
          <div className={`rounded-2xl border px-4 py-3 text-right ${walkthroughStatusStyles[walkthrough.walkthroughStatus]}`}>
            <p className="text-[10px] font-black uppercase tracking-[0.14em]">Walkthrough status</p>
            <p className="mt-1 text-sm font-black">{getWalkthroughStatusLabel(walkthrough.walkthroughStatus)}</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          {statusSummary}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-xl font-black text-amber-950 dark:text-amber-100">{getBuyerAcceptancePackStatusLabel(walkthrough.sourcePackStatus)}</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700 dark:text-amber-200">Source pack status</p>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-500/30 dark:bg-sky-500/10">
            <p className="text-xl font-black text-sky-950 dark:text-sky-100">{getReviewGateStatusLabel(walkthrough.sourceReviewGateStatus)}</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-sky-700 dark:text-sky-200">Source Review Gate status</p>
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
            title="Read-only internal rehearsal"
            description="This surface renders existing deterministic walkthrough data without creating evidence, actions, or status changes."
          />
          <p className="text-sm font-semibold leading-6 text-amber-950 dark:text-amber-100">
            Admin Walkthrough is read-only internal rehearsal only. It is not browser automation, not screenshot evidence, not an approval, not an export, not readiness evidence, not compliance evidence, and no PDF/download generated. Export/PDF/download remains blocked until a future AP-approved slice defines that scope.
          </p>
        </section>

        <section>
          <SectionHeader
            eyebrow="Admin sequence"
            title="Admin section order"
            description="The walkthrough uses the Admin Workbench section model as the internal rehearsal path."
          />
          {walkthrough.adminSectionOrder.length === 0 ? (
            <EmptyState label="No Admin section order available." />
          ) : (
            <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {walkthrough.adminSectionOrder.map((sectionKey, index) => {
                const section = getAdminSectionByKey(sectionKey);
                return (
                  <li key={sectionKey} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Step {index + 1}</p>
                    <p className="mt-1 text-sm font-black text-[#002C4B] dark:text-white">{section?.label || sectionKey}</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{sectionKey}</p>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section>
          <SectionHeader
            eyebrow="Walkthrough steps"
            title="Steps grouped by Admin section"
            description="Each step shows expected observation, evidence reference, must-confirm items, must-not-claim items, and blocked actions."
          />
          {stepGroups.length === 0 ? (
            <EmptyState label="No walkthrough step groups available." />
          ) : (
            <div className="space-y-4">
              {stepGroups.map(group => (
                <article key={group.adminSectionKey} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{group.adminSectionKey}</p>
                      <h4 className="mt-1 text-base font-black text-[#002C4B] dark:text-white">{group.label}</h4>
                    </div>
                    <span className="text-xs font-black text-slate-400">{group.steps.length} steps</span>
                  </div>
                  {group.steps.length === 0 ? (
                    <EmptyState label="No walkthrough steps available for this section." />
                  ) : (
                    <div className="grid gap-4">
                      {group.steps.map(step => (
                        <section key={step.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{step.key}</p>
                              <h5 className="mt-1 text-sm font-black text-slate-950 dark:text-white">{getWalkthroughStepLabel(step)}</h5>
                            </div>
                            <StatusPill status={step.status} />
                          </div>
                          <p className="mt-3 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">{step.instruction}</p>
                          <div className="mt-4 grid gap-4 lg:grid-cols-2">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Expected observation</p>
                              <p className="mt-1 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">{step.expectedObservation}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Evidence reference</p>
                              <p className="mt-1 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">{step.evidenceReference}</p>
                            </div>
                          </div>
                          <div className="mt-4 grid gap-4 xl:grid-cols-3">
                            <div>
                              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Must confirm</p>
                              <ListBlock items={step.mustConfirm} emptyLabel="No must-confirm entries." tone="sky" />
                            </div>
                            <div>
                              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Must not claim</p>
                              <ListBlock items={step.mustNotClaim} emptyLabel="No must-not-claim entries." tone="rose" />
                            </div>
                            <div>
                              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Blocked actions</p>
                              <ListBlock items={step.blockedActions} emptyLabel="No blocked actions listed." tone="amber" />
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
            title="Walkthrough findings"
            description="Findings are display-only blockers and prerequisites; they do not start approval workflow."
          />
          {walkthrough.findings.length === 0 ? (
            <EmptyState label="No walkthrough findings available." />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {walkthrough.findings.map(finding => (
                <article key={finding.id} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-black text-[#002C4B] dark:text-white">{finding.label}</h4>
                      <p className="mt-2 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">{finding.rationale}</p>
                    </div>
                    <StatusPill status={finding.status} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {finding.requiredBeforeExport && (
                      <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.11em] text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                        Required before export scope
                      </span>
                    )}
                    {finding.requiredBeforeBuyerSignoff && (
                      <span className="rounded-full border border-sky-300 bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.11em] text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200">
                        Required before buyer signoff
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold leading-6 text-rose-950 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
              Required-before-export findings: {requiredBeforeExportFindings.length}
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm font-semibold leading-6 text-sky-950 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100">
              Required-before-buyer-signoff findings: {requiredBeforeBuyerSignoffFindings.length}
            </div>
          </div>
        </section>

        <section>
          <SectionHeader
            eyebrow="Blocked scope"
            title="Export blockers"
            description="Export, PDF, and download language is shown only as blocked scope, not as an available action."
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
            description="These maturity domains remain evidence-required and are not changed by this read-only panel."
          />
          {readinessBlockers.length === 0 ? (
            <EmptyState label="No readiness blockers available." />
          ) : (
            <ListBlock items={readinessBlockers} emptyLabel="No readiness blockers available." tone="amber" />
          )}
        </section>

        <section>
          <SectionHeader
            eyebrow="Deferred tracks"
            title="Deferred proof and artifact tracks"
            description="Future tracks remain deferred until separately approved, implemented, and verified."
          />
          {deferredTracks.length === 0 ? (
            <EmptyState label="No deferred tracks available." />
          ) : (
            <ListBlock items={deferredTracks} emptyLabel="No deferred tracks available." tone="sky" />
          )}
        </section>
      </div>
    </section>
  );
};

export default BuyerAcceptanceAdminWalkthroughPanel;
