import React from 'react';
import { CANONICAL_RC_JOURNEY, RC_MODULE_EVIDENCE, releaseCandidateIdentity } from '../../services/releaseCandidateReadinessModel';

const proofLabel = {
  proven_exact_sha_ci: 'Proven by an exact-SHA CI run',
  configured_not_live_verified: 'Configured, not live-verified',
  not_run_on_candidate: 'Not run on this candidate',
  not_proven_hosted_or_live: 'Not proven / hosted / live',
} as const;

const ReleaseCandidateReadinessPanel: React.FC = () => {
  const identity = releaseCandidateIdentity(import.meta.env.VITE_RC_COMMIT_SHA);
  return <section aria-labelledby="rc-readiness-title" className="space-y-5">
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-600/40 dark:bg-amber-950/20">
      <h3 id="rc-readiness-title" className="text-lg font-black text-[#002C4B] dark:text-white">V1 release-candidate proof workspace</h3>
      <p className="mt-2 text-sm font-semibold leading-6 text-amber-950 dark:text-amber-100">Draft candidate only. This surface does not prove deployment, hosted readiness, production readiness, security certification, compliance certification, or live-provider validation.</p>
      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div><dt className="font-black uppercase tracking-wide">Main-derived seed</dt><dd className="mt-1 break-all font-mono">{identity.seedHead}</dd></div>
        <div><dt className="font-black uppercase tracking-wide">Exact build head</dt><dd className="mt-1 break-all font-mono">{identity.buildHead}</dd></div>
      </dl>
      {!identity.buildIdentityProven && <p role="status" className="mt-3 text-xs font-bold">Build SHA was not injected; consult the generated manifest before accepting evidence.</p>}
    </div>
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <table className="w-full min-w-[640px] text-left text-sm"><caption className="p-4 text-left font-black">Synthetic AP Invoice Exception presentation lineage (not server authority)</caption>
        <thead><tr className="border-y border-slate-200 dark:border-slate-800"><th className="p-3">Stage</th><th className="p-3">Resource / version</th><th className="p-3">Evidence handoff</th><th className="p-3">Authority</th></tr></thead>
        <tbody>{CANONICAL_RC_JOURNEY.map(item => <tr key={item.stage} className="border-b border-slate-100 align-top dark:border-slate-900"><th scope="row" className="p-3 font-black">{item.stage}</th><td className="p-3 font-mono text-xs">{item.fixtureId}<br />{item.fixtureVersionRef}</td><td className="p-3 font-mono text-xs">{item.fixtureEvidenceRef}</td><td className="p-3">{item.authorityBoundary}</td></tr>)}</tbody>
      </table>
    </div>
    <div className="grid gap-3 md:grid-cols-2">{RC_MODULE_EVIDENCE.map(([module, state, detail]) => <article key={module} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"><h4 className="font-black">{module}</h4><p className="mt-2 text-xs font-black uppercase tracking-wide text-[#8a6500]">{proofLabel[state]}</p><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{detail}</p></article>)}</div>
    <div className="rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-800"><h4 className="font-black">Safe operational posture</h4><p className="mt-2">Rollback is feature disablement or global maintenance/read-only. Preserve immutable records and readable evidence; do not mutate, replay side effects, expose provider secrets, or rewrite accepted migrations.</p></div>
  </section>;
};

export default ReleaseCandidateReadinessPanel;
