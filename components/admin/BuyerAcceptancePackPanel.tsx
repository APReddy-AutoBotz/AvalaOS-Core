import React, { useMemo } from 'react';
import {
  CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT,
  type BuyerAcceptanceChecklistStatus,
} from '../../services/buyerAcceptancePackModel';
import {
  getBlockedOrEvidenceRequiredClaims,
  getBuyerAcceptanceChecklistStatusLabel,
  getBuyerAcceptancePackStatusLabel,
  groupBuyerAcceptanceClaimsByDomain,
  summarizeBuyerPackStatus,
} from '../../services/buyerAcceptancePackPresentation';
import {
  type ProofBoundary,
  type ProofStatus,
  type ReadinessDomain,
} from '../../services/trustCenterModel';
import {
  getProofBoundaryLabel,
  getProofStatusLabel,
  getReadinessDomainLabel,
} from '../../services/trustCenterPresentation';

const proofStatusStyles: Record<ProofStatus, string> = {
  demo: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200',
  planned: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
  configured: 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200',
  evidence_required: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200',
  verified: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200',
  blocked: 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200',
};

const checklistStatusStyles: Record<BuyerAcceptanceChecklistStatus, string> = {
  draft_foundation: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
  review_required: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200',
  evidence_required: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200',
  blocked: 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200',
};

const ProofStatusPill: React.FC<{ status: ProofStatus }> = ({ status }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.11em] ${proofStatusStyles[status]}`}>
    {getProofStatusLabel(status)}
  </span>
);

const BoundaryPill: React.FC<{ boundary: ProofBoundary }> = ({ boundary }) => (
  <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.11em] text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
    {getProofBoundaryLabel(boundary)}
  </span>
);

const DomainPill: React.FC<{ domain: ReadinessDomain }> = ({ domain }) => (
  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.11em] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
    {getReadinessDomainLabel(domain)}
  </span>
);

const ChecklistStatusPill: React.FC<{ status: BuyerAcceptanceChecklistStatus }> = ({ status }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.11em] ${checklistStatusStyles[status]}`}>
    {getBuyerAcceptanceChecklistStatusLabel(status)}
  </span>
);

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
    {label}
  </div>
);

const ListBlock: React.FC<{ items: readonly string[]; emptyLabel: string }> = ({ items, emptyLabel }) => {
  if (items.length === 0) {
    return <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-1.5">
      {items.map(item => (
        <li key={item} className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-600 dark:bg-slate-950 dark:text-slate-300">
          {item}
        </li>
      ))}
    </ul>
  );
};

const SectionHeader: React.FC<{ eyebrow: string; title: string; description: string }> = ({ eyebrow, title, description }) => (
  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{eyebrow}</p>
      <h3 className="mt-1 text-lg font-black text-[#002C4B] dark:text-white">{title}</h3>
      <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  </div>
);

const BuyerAcceptancePackPanel: React.FC = () => {
  const pack = CURRENT_BUYER_ACCEPTANCE_PACK_SNAPSHOT;
  const claimGroups = useMemo(() => groupBuyerAcceptanceClaimsByDomain(pack), [pack]);
  const blockedClaimCount = useMemo(() => getBlockedOrEvidenceRequiredClaims(pack).length, [pack]);
  const statusSummary = useMemo(() => summarizeBuyerPackStatus(pack), [pack]);

  return (
    <section className="premium-surface overflow-hidden rounded-3xl border border-[#002C4B]/10">
      <div className="border-b border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#ffbc03]">Buyer review foundation</p>
            <h2 className="mt-2 text-2xl font-black text-[#002C4B] dark:text-white">Buyer Acceptance Pack</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
              {pack.executiveSummary}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-right dark:border-amber-500/40 dark:bg-amber-500/10">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-700 dark:text-amber-200">Pack status</p>
            <p className="mt-1 text-sm font-black text-amber-950 dark:text-amber-100">{getBuyerAcceptancePackStatusLabel(pack.packStatus)}</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          {statusSummary}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-2xl font-black text-[#002C4B] dark:text-white">{pack.claims.length}</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Claims</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-2xl font-black text-amber-900 dark:text-amber-100">{pack.openProofGaps.length}</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700 dark:text-amber-200">Open proof gaps</p>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
            <p className="text-2xl font-black text-rose-900 dark:text-rose-100">{blockedClaimCount}</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-rose-700 dark:text-rose-200">Blocked/evidence-required claims</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-2xl font-black text-[#002C4B] dark:text-white">{pack.evidenceIndex.length}</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Evidence references</p>
          </div>
        </div>
      </div>

      <div className="space-y-8 p-6">
        <section>
          <SectionHeader
            eyebrow="Claim map"
            title="Buyer-safe claims by readiness domain"
            description="Claims inherit proof status, proof boundary, evidence reference, and limitation disclosures from the foundation model."
          />
          {pack.claims.length === 0 ? (
            <EmptyState label="No buyer-safe claims available." />
          ) : (
            <div className="space-y-4">
              {claimGroups.map(group => (
                <div key={group.domain} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-black uppercase tracking-[0.12em] text-[#002C4B] dark:text-white">{group.label}</h4>
                    <span className="text-xs font-black text-slate-400">{group.claims.length} claims</span>
                  </div>
                  {group.claims.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-500 dark:bg-slate-950 dark:text-slate-400">No claims in this domain.</p>
                  ) : (
                    <div className="grid gap-3">
                      {group.claims.map(claim => (
                        <article key={claim.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h5 className="text-sm font-black text-slate-950 dark:text-white">{claim.label}</h5>
                              <p className="mt-1 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">{claim.buyerSafeClaim}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <ProofStatusPill status={claim.proofStatus} />
                              <BoundaryPill boundary={claim.proofBoundary} />
                              <DomainPill domain={claim.readinessDomain} />
                            </div>
                          </div>
                          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Evidence reference</p>
                              <p className="mt-1 break-words text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">{claim.evidenceReference}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Limitation disclosure</p>
                              <p className="mt-1 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">{claim.limitationDisclosure}</p>
                            </div>
                          </div>
                          <div className="mt-4">
                            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Does not prove</p>
                            <ListBlock items={claim.doesNotProve} emptyLabel="No does-not-prove entries." />
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHeader
            eyebrow="Module summary"
            title="Module capability summaries"
            description="Module summaries preserve current buyer-safe descriptions, limitation disclosures, and blocked claims."
          />
          {pack.moduleSummaries.length === 0 ? (
            <EmptyState label="No module capability summaries available." />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {pack.moduleSummaries.map(moduleSummary => (
                <article key={moduleSummary.moduleKey} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-base font-black text-[#002C4B] dark:text-white">{moduleSummary.moduleName}</h4>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{moduleSummary.buyerSafeDescription}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ProofStatusPill status={moduleSummary.proofStatus} />
                      <BoundaryPill boundary={moduleSummary.proofBoundary} />
                    </div>
                  </div>
                  <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                    {moduleSummary.limitationDisclosure}
                  </p>
                  <div className="mt-4">
                    <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Blocked claims</p>
                    <ListBlock items={moduleSummary.blockedClaims} emptyLabel="No blocked claims listed." />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHeader
            eyebrow="Evidence index"
            title="Evidence references"
            description="Evidence records are references only and do not create new readiness evidence in this UI slice."
          />
          {pack.evidenceIndex.length === 0 ? (
            <EmptyState label="No evidence index entries available." />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/70">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Milestone</th>
                    <th className="px-4 py-3">Evidence document</th>
                    <th className="px-4 py-3">Accepted status</th>
                    <th className="px-4 py-3">Proof boundary</th>
                    <th className="px-4 py-3">Summary</th>
                    <th className="px-4 py-3">Does not prove</th>
                  </tr>
                </thead>
                <tbody>
                  {pack.evidenceIndex.map(entry => (
                    <tr key={entry.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-4 align-top font-black text-slate-900 dark:text-white">{entry.milestone}</td>
                      <td className="px-4 py-4 align-top text-xs font-semibold text-slate-600 dark:text-slate-300">{entry.evidenceDoc}</td>
                      <td className="px-4 py-4 align-top"><ProofStatusPill status={entry.acceptedStatus} /></td>
                      <td className="px-4 py-4 align-top"><BoundaryPill boundary={entry.proofBoundary} /></td>
                      <td className="px-4 py-4 align-top text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{entry.summary}</td>
                      <td className="px-4 py-4 align-top text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{entry.doesNotProve.join(', ') || 'No does-not-prove entries.'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <SectionHeader
            eyebrow="Open gaps"
            title="Open proof gaps"
            description="Open gaps stay evidence-required or blocked until a future AP-approved proof track changes them."
          />
          {pack.openProofGaps.length === 0 ? (
            <EmptyState label="No open proof gaps available." />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {pack.openProofGaps.map(gap => (
                <article key={gap.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-black text-amber-950 dark:text-amber-100">{gap.label}</h4>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700 dark:text-amber-200">{getReadinessDomainLabel(gap.readinessDomain)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ProofStatusPill status={gap.proofStatus} />
                      <BoundaryPill boundary={gap.proofBoundary} />
                    </div>
                  </div>
                  <p className="mt-4 text-xs font-semibold leading-5 text-amber-950 dark:text-amber-100">{gap.blockedWording}</p>
                  <p className="mt-3 rounded-xl border border-amber-200 bg-white/60 p-3 text-xs font-semibold leading-5 text-amber-950 dark:border-amber-500/30 dark:bg-slate-950/40 dark:text-amber-100">
                    {gap.requiredFutureEvidence}
                  </p>
                  <p className="mt-3 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700 dark:text-amber-200">Owner: {gap.owner}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHeader
            eyebrow="Non-claims"
            title="Prohibited wording and safe alternatives"
            description="These entries identify buyer wording that must remain blocked and the safer alternative to use instead."
          />
          {pack.nonClaims.length === 0 ? (
            <EmptyState label="No non-claim entries available." />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {pack.nonClaims.map(nonClaim => (
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

        <section>
          <SectionHeader
            eyebrow="Review controls"
            title="Buyer and AP checklists"
            description="Checklist items are read-only review controls and do not start approval workflow."
          />
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/70">
              <h4 className="text-base font-black text-[#002C4B] dark:text-white">Buyer review checklist</h4>
              {pack.buyerReviewChecklist.length === 0 ? (
                <div className="mt-4"><EmptyState label="No buyer review checklist items available." /></div>
              ) : (
                <div className="mt-4 space-y-3">
                  {pack.buyerReviewChecklist.map(item => (
                    <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <h5 className="text-sm font-black text-slate-950 dark:text-white">{item.label}</h5>
                        <ChecklistStatusPill status={item.status} />
                      </div>
                      <p className="mt-2 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">{item.rationale}</p>
                      <p className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                        Required before buyer signoff: {item.requiredBeforeBuyerSignoff ? 'Yes' : 'No'}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/70">
              <h4 className="text-base font-black text-[#002C4B] dark:text-white">AP approval checklist</h4>
              {pack.apApprovalChecklist.length === 0 ? (
                <div className="mt-4"><EmptyState label="No AP approval checklist items available." /></div>
              ) : (
                <div className="mt-4 space-y-3">
                  {pack.apApprovalChecklist.map(item => (
                    <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <h5 className="text-sm font-black text-slate-950 dark:text-white">{item.label}</h5>
                        <ChecklistStatusPill status={item.status} />
                      </div>
                      <p className="mt-2 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">{item.rationale}</p>
                      <p className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                        Required before status change: {item.requiredBeforeStatusChange ? 'Yes' : 'No'}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section>
          <SectionHeader
            eyebrow="Limitations"
            title="Limitation disclosures"
            description="Unique disclosures are shown as review boundaries, not as proof upgrades."
          />
          {pack.limitationDisclosures.length === 0 ? (
            <EmptyState label="No limitation disclosures available." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {pack.limitationDisclosures.map(disclosure => (
                <p key={disclosure} className="rounded-2xl border border-slate-200 bg-white p-4 text-xs font-semibold leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                  {disclosure}
                </p>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
};

export default BuyerAcceptancePackPanel;
