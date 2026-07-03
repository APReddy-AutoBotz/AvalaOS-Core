import React, { useMemo } from 'react';
import {
  buildCurrentTrustCenterSnapshot,
  type BuyerAcceptanceArtifactType,
  type ModuleEnabledState,
  type ProofStatus,
} from '../../services/trustCenterModel';
import {
  getEvidenceRequiredOrBlockedClaims,
  getProofBoundaryLabel,
  getProofStatusLabel,
  groupClaimControlsByDomain,
  summarizeProofStatuses,
} from '../../services/trustCenterPresentation';

const statusStyles: Record<ProofStatus, string> = {
  demo: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200',
  planned: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
  configured: 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200',
  evidence_required: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200',
  verified: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200',
  blocked: 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200',
};

const enabledStateLabels: Record<ModuleEnabledState, string> = {
  available: 'Available',
  demo_available: 'Demo Available',
  planned: 'Planned',
  evidence_blocked: 'Evidence Blocked',
};

const artifactTypeLabels: Record<BuyerAcceptanceArtifactType, string> = {
  claim_map: 'Claim Map',
  evidence_index: 'Evidence Index',
  limitation_disclosure: 'Limitation Disclosure',
  acceptance_pack: 'Acceptance Pack',
  control_summary: 'Control Summary',
};

const StatusPill: React.FC<{ status: ProofStatus }> = ({ status }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.11em] ${statusStyles[status]}`}>
    {getProofStatusLabel(status)}
  </span>
);

const BoundaryPill: React.FC<{ boundary: Parameters<typeof getProofBoundaryLabel>[0] }> = ({ boundary }) => (
  <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.11em] text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
    {getProofBoundaryLabel(boundary)}
  </span>
);

const TrustCenterPanel: React.FC = () => {
  const snapshot = useMemo(() => buildCurrentTrustCenterSnapshot(), []);
  const statusSummary = useMemo(() => summarizeProofStatuses(snapshot), [snapshot]);
  const claimGroups = useMemo(() => groupClaimControlsByDomain(snapshot), [snapshot]);
  const blockedClaims = useMemo(() => getEvidenceRequiredOrBlockedClaims(snapshot), [snapshot]);

  return (
    <section className="premium-surface overflow-hidden rounded-3xl border border-[#002C4B]/10">
      <div className="border-b border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#ffbc03]">Avala Admin</p>
            <h2 className="mt-2 text-2xl font-black text-[#002C4B] dark:text-white">Trust Center</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
              Read-only proof-status view for current claim controls, module capability states, evidence references, buyer artifacts, blocked claims, and limitation disclosures.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Snapshot</p>
            <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">Current baseline</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          Trust Center proof states do not imply production readiness, hosted readiness, deployment readiness, RLS readiness, tenant-isolation proof, security readiness, buyer readiness, product readiness, release-candidate readiness, or compliance certification unless the exact claim is marked verified with accepted evidence.
        </div>
      </div>

      <div className="space-y-8 p-6">
        <div>
          <div className="mb-3 flex items-center justify-between gap-4">
            <h3 className="text-lg font-black text-slate-950 dark:text-white">Proof-status legend</h3>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Visual states are claim controls, not operational states.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {statusSummary.map(summary => (
              <div key={summary.status} className={`rounded-2xl border p-4 ${statusStyles[summary.status]}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black">{summary.label}</p>
                  <p className="text-xl font-black">{summary.count}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-black text-slate-950 dark:text-white">Module capability states</h3>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {snapshot.moduleCapabilityStates.map(moduleState => (
              <article key={moduleState.moduleKey} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-black text-[#002C4B] dark:text-white">{moduleState.moduleName}</h4>
                    <p className="mt-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{enabledStateLabels[moduleState.enabledState]}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill status={moduleState.proofStatus} />
                    <BoundaryPill boundary={moduleState.proofBoundary} />
                  </div>
                </div>
                <p className="mt-4 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{moduleState.buyerSafeDescription}</p>
                <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  {moduleState.limitationDisclosure}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Evidence reference</p>
                    <p className="mt-1 break-words text-xs font-semibold text-slate-600 dark:text-slate-300">{moduleState.evidenceReference}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Blocked claims</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {moduleState.blockedClaims.map(claim => (
                        <span key={claim} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {claim}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-slate-950 dark:text-white">Claim controls by readiness domain</h3>
              <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">Configured and verified evidence claims are separated from evidence-required readiness domains.</p>
            </div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-rose-700 dark:text-rose-300">
              {blockedClaims.length} blocked or evidence-required claims
            </p>
          </div>

          {snapshot.claimControls.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              No claim controls available.
            </div>
          ) : (
            <div className="space-y-4">
              {claimGroups.map(group => (
                <section key={group.domain} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-black uppercase tracking-[0.12em] text-[#002C4B] dark:text-white">{group.label}</h4>
                    <span className="text-xs font-black text-slate-400">{group.controls.length} controls</span>
                  </div>
                  {group.controls.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-500 dark:bg-slate-950 dark:text-slate-400">No claim controls available.</p>
                  ) : (
                    <div className="grid gap-3">
                      {group.controls.map(control => (
                        <article key={control.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h5 className="text-sm font-black text-slate-950 dark:text-white">{control.label}</h5>
                              <p className="mt-1 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">{control.claimText}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <StatusPill status={control.proofStatus} />
                              <BoundaryPill boundary={control.proofBoundary} />
                            </div>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr]">
                            <p className="text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                              <span className="font-black text-slate-700 dark:text-slate-200">Evidence:</span> {control.evidenceReference}
                            </p>
                            <p className="text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                              <span className="font-black text-slate-700 dark:text-slate-200">Blocked wording:</span> {control.blockedWording}
                            </p>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-lg font-black text-slate-950 dark:text-white">Evidence records</h3>
          {snapshot.evidence.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              No evidence records available.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/70">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Milestone</th>
                    <th className="px-4 py-3">Evidence document</th>
                    <th className="px-4 py-3">Accepted status</th>
                    <th className="px-4 py-3">Proof boundary</th>
                    <th className="px-4 py-3">Does not prove</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.evidence.map(entry => (
                    <tr key={entry.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-4 align-top font-black text-slate-900 dark:text-white">{entry.milestone}</td>
                      <td className="px-4 py-4 align-top text-xs font-semibold text-slate-600 dark:text-slate-300">{entry.evidenceDoc}</td>
                      <td className="px-4 py-4 align-top"><StatusPill status={entry.acceptedStatus} /></td>
                      <td className="px-4 py-4 align-top"><BoundaryPill boundary={entry.proofBoundary} /></td>
                      <td className="px-4 py-4 align-top text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{entry.doesNotProve.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-lg font-black text-slate-950 dark:text-white">Buyer acceptance artifacts</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {snapshot.buyerAcceptanceArtifacts.map(artifact => (
              <article key={artifact.id} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-black text-[#002C4B] dark:text-white">{artifact.label}</h4>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{artifactTypeLabels[artifact.artifactType]}</p>
                  </div>
                  <StatusPill status={artifact.proofStatus} />
                </div>
                <p className="mt-4 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">{artifact.limitationDisclosure}</p>
                <p className="mt-3 break-words text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span className="font-black text-slate-700 dark:text-slate-200">Evidence:</span> {artifact.evidenceReference}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default TrustCenterPanel;
