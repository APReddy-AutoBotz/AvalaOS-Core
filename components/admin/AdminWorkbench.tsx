import React, { useMemo, useState } from 'react';
import {
  ADMIN_WORKBENCH_SECTIONS,
  getDefaultAdminSection,
  type AdminSectionKey,
} from '../../services/adminWorkbenchModel';
import AdminSectionNav from './AdminSectionNav';

interface AdminWorkbenchProps {
  organizationName: string;
  planLabel: string;
  overview: React.ReactNode;
  organization: React.ReactNode;
  modules: React.ReactNode;
  trustCenter: React.ReactNode;
  buyerAcceptancePack: React.ReactNode;
  buyerAcceptanceReviewGate: React.ReactNode;
  buyerAcceptanceAdminWalkthrough: React.ReactNode;
  evidencePolicy: React.ReactNode;
  usersRoles: React.ReactNode;
  auditSecurity: React.ReactNode;
  aiControls: React.ReactNode;
}

const AdminWorkbench: React.FC<AdminWorkbenchProps> = ({
  organizationName,
  planLabel,
  overview,
  organization,
  modules,
  trustCenter,
  buyerAcceptancePack,
  buyerAcceptanceReviewGate,
  buyerAcceptanceAdminWalkthrough,
  evidencePolicy,
  usersRoles,
  auditSecurity,
  aiControls,
}) => {
  const [activeSection, setActiveSection] = useState<AdminSectionKey>(getDefaultAdminSection().key);
  const activeSectionDefinition = useMemo(
    () => ADMIN_WORKBENCH_SECTIONS.find(section => section.key === activeSection) || getDefaultAdminSection(),
    [activeSection],
  );

  const sectionContent: Record<AdminSectionKey, React.ReactNode> = {
    overview,
    organization,
    modules,
    trust_center: trustCenter,
    buyer_acceptance_pack: buyerAcceptancePack,
    buyer_acceptance_review_gate: buyerAcceptanceReviewGate,
    buyer_acceptance_admin_walkthrough: buyerAcceptanceAdminWalkthrough,
    evidence_policy: evidencePolicy,
    users_roles: usersRoles,
    audit_security: auditSecurity,
    ai_controls: aiControls,
  };

  return (
    <div className="mx-auto max-w-7xl p-4 pb-20 sm:p-6">
      <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#ffbc03]">Avala Admin</p>
            <h1 className="mt-2 text-3xl font-black text-[#002C4B] dark:text-white">Admin Workbench</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
              Focused admin navigation for organization setup, module access, Trust Center review, Buyer Acceptance Pack review, Admin walkthrough rehearsal, evidence policy, users, audit signals, and AI control direction.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{organizationName}</p>
            <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">{planLabel}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <AdminSectionNav activeSection={activeSection} onSelectSection={setActiveSection} />
        </div>

        <main className="min-w-0 space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-[#002C4B] dark:text-white">{activeSectionDefinition.label}</h2>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{activeSectionDefinition.description}</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                Sectioned admin structure
              </span>
            </div>
            {activeSectionDefinition.proofSafeDisclosure && (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                {activeSectionDefinition.proofSafeDisclosure}
              </p>
            )}
          </div>

          {sectionContent[activeSection]}
        </main>
      </div>
    </div>
  );
};

export default AdminWorkbench;
