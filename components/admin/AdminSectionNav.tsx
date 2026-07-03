import React from 'react';
import {
  ADMIN_WORKBENCH_SECTIONS,
  type AdminSectionDefinition,
  type AdminSectionKey,
} from '../../services/adminWorkbenchModel';

interface AdminSectionNavProps {
  activeSection: AdminSectionKey;
  onSelectSection: (section: AdminSectionKey) => void;
  sections?: readonly AdminSectionDefinition[];
}

const AdminSectionNav: React.FC<AdminSectionNavProps> = ({
  activeSection,
  onSelectSection,
  sections = ADMIN_WORKBENCH_SECTIONS,
}) => (
  <nav className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-950">
    <div className="grid gap-1 sm:grid-cols-4 lg:grid-cols-1">
      {sections.map(section => {
        const active = activeSection === section.key;
        return (
          <button
            key={section.key}
            type="button"
            onClick={() => onSelectSection(section.key)}
            className={`rounded-xl px-3 py-3 text-left transition-colors ${active
              ? 'bg-[#002C4B] text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="block text-sm font-black">{section.label}</span>
            <span className={`mt-1 block text-[11px] font-semibold leading-4 ${active ? 'text-white/70' : 'text-slate-400'}`}>
              {section.shortLabel}
            </span>
          </button>
        );
      })}
    </div>
  </nav>
);

export default AdminSectionNav;
