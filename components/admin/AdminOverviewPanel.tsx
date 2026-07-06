import React, { useMemo } from 'react';
import { buildEvidenceControlSnapshot } from '../../services/evidenceControlModel';
import { buildExportArtifactControlSnapshot } from '../../services/exportArtifactControlModel';
import { getExportArtifactReadOnlySummary } from '../../services/exportArtifactControlPresentation';
import { getAdminEvidenceControlSummary } from '../../services/evidenceControlPresentation';
import { buildCurrentTrustCenterSnapshot } from '../../services/trustCenterModel';
import {
  getEvidenceRequiredOrBlockedClaims,
  summarizeProofStatuses,
} from '../../services/trustCenterPresentation';

interface AdminOverviewPanelProps {
  organizationName: string;
  planLabel: string;
  enabledModuleCount: number;
  totalModuleCount: number;
  maxProcesses?: number;
  maxTemplates?: number;
}

const nextAdminDecisions = [
  'Review Trust Center blocked/evidence-required claims',
  'Confirm module access',
  'Keep evidence policy aligned with approval requirements',
  'Review users/roles',
];

const AdminOverviewPanel: React.FC<AdminOverviewPanelProps> = ({
  organizationName,
  planLabel,
  enabledModuleCount,
  totalModuleCount,
  maxProcesses,
  maxTemplates,
}) => {
  const snapshot = useMemo(() => buildCurrentTrustCenterSnapshot(), []);
  const proofSummary = useMemo(() => summarizeProofStatuses(snapshot), [snapshot]);
  const blockedOrEvidenceRequiredClaims = useMemo(() => getEvidenceRequiredOrBlockedClaims(snapshot), [snapshot]);
  const evidenceControlSnapshot = useMemo(() => buildEvidenceControlSnapshot(), []);
  const evidenceControlSummary = useMemo(
    () => getAdminEvidenceControlSummary(evidenceControlSnapshot),
    [evidenceControlSnapshot],
  );
  const exportArtifactControlSnapshot = useMemo(() => buildExportArtifactControlSnapshot(), []);
  const exportArtifactSummary = useMemo(
    () => getExportArtifactReadOnlySummary(exportArtifactControlSnapshot),
    [exportArtifactControlSnapshot],
  );

  return (
    <section className="premium-surface rounded-3xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#ffbc03]">Admin overview</p>
          <h2 className="mt-2 text-2xl font-black text-[#002C4B] dark:text-white">{organizationName}</h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
            Calm workspace summary for module access, evidence-gated proof posture, and the next admin decisions.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right dark:border-slate-800 dark:bg-slate-950">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Plan</p>
          <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">{planLabel}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Enabled modules</p>
          <p className="mt-2 text-3xl font-black text-[#002C4B] dark:text-white">{enabledModuleCount} / {totalModuleCount}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-700 dark:text-amber-200">Evidence-gated claims</p>
          <p className="mt-2 text-3xl font-black text-amber-900 dark:text-amber-100">{blockedOrEvidenceRequiredClaims.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Workspace limits</p>
          <p className="mt-2 text-sm font-black leading-6 text-slate-700 dark:text-slate-200">
            Processes: 0 / {maxProcesses ?? 'Not set'}
            <br />
            Templates: 0 / {maxTemplates ?? 'Not set'}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Control contracts</p>
          <p className="mt-2 text-3xl font-black text-[#002C4B] dark:text-white">{evidenceControlSummary.surfaceCount}</p>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">
            {evidenceControlSummary.executionApprovalGranted ? 'Execution approval recorded' : 'AP approval remains ungranted'}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Export contracts</p>
          <p className="mt-2 text-3xl font-black text-[#002C4B] dark:text-white">{exportArtifactSummary.artifactContractCount}</p>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">
            {exportArtifactSummary.generatedArtifactsAllowed ? 'Artifact generation represented' : 'No artifacts generated'}
          </p>
        </div></div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Trust Center status summary</h3>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {proofSummary.map(summary => (
              <div key={summary.status} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-lg font-black text-[#002C4B] dark:text-white">{summary.count}</p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.11em] text-slate-500 dark:text-slate-400">{summary.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            Trust Center proof states are evidence-gated and do not expand runtime, hosted, deployment, RLS, tenant-isolation, security, buyer, product, release-candidate, or compliance scope.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Next admin decision</h3>
          <div className="mt-4 space-y-3">
            {nextAdminDecisions.map((decision, index) => (
              <div key={decision} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#002C4B] text-xs font-black text-white">{index + 1}</span>
                <p className="text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200">{decision}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{evidenceControlSummary.headline}</h3>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
              {evidenceControlSummary.summary}
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-right dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-700 dark:text-amber-200">Blocked claims</p>
            <p className="mt-1 text-lg font-black text-amber-900 dark:text-amber-100">{evidenceControlSummary.blockedClaimCount}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {evidenceControlSummary.approvalStateSummary
            .filter(summary => summary.count > 0)
            .map(summary => (
              <div key={summary.state} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-lg font-black text-[#002C4B] dark:text-white">{summary.count}</p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.11em] text-slate-500 dark:text-slate-400">{summary.label}</p>
              </div>
            ))}
        </div>
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          {evidenceControlSummary.readOnlyNotice}
        </p>
        <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
          {exportArtifactSummary.readOnlyNotice}
        </p></div>
    </section>
  );
};

export default AdminOverviewPanel;
