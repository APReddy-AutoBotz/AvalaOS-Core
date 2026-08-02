import React from 'react';
import { MoonIcon, SunIcon, UserCircleIcon } from './icons';
import { AvalaLifecycleLockup, AvalaLogo } from './brand';
import { Project, Scope, Team, User, View } from '../../types';
import ScopeSwitcher from './ScopeSwitcher';
import { useAuth } from '../auth/AuthProvider';

interface HeaderProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  currentScope: Scope;
  currentView: View;
  currentContextLabel?: string;
  onScopeChange: (scope: Scope) => void;
  currentUser: User;
  teams: Team[];
  projects: Project[];
  mobileNavigationOpen: boolean;
  onToggleNavigation: () => void;
}

const viewLabel: Partial<Record<View, string>> = {
  [View.DASHBOARD]: 'Home',
  [View.PROCESS_CATALOG]: 'Avala Assess',
  [View.DOCS_FORGE]: 'Avala Studio',
  [View.DOCS]: 'Document Vault',
  [View.TEMPLATE_STUDIO]: 'Studio Templates',
  [View.BOARDS]: 'Avala Delivery',
  [View.PORTFOLIO]: 'Avala Monitor',
};

// Buyer-demo copy contract: the Monitor page action remains readiness/blocker-oriented.
const monitorHeaderActionCopy = 'Open readiness and blocker signals';

const Header: React.FC<HeaderProps> = ({ theme, toggleTheme, currentView, currentContextLabel, currentScope, onScopeChange, currentUser, teams, projects, mobileNavigationOpen, onToggleNavigation }) => {
  const { signOut } = useAuth();

  return (
    <header data-monitor-action-copy={monitorHeaderActionCopy} className="header glass sticky top-0 z-10 flex h-16 items-center justify-between px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onToggleNavigation}
          aria-controls="primary-navigation"
          aria-expanded={mobileNavigationOpen}
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm lg:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <span className="sr-only">{mobileNavigationOpen ? 'Close navigation' : 'Open navigation'}</span>
          <span aria-hidden="true" className="flex flex-col gap-1">
            <span className="h-0.5 w-4 rounded-full bg-current" />
            <span className="h-0.5 w-4 rounded-full bg-current" />
            <span className="h-0.5 w-4 rounded-full bg-current" />
          </span>
        </button>
        <div className="brand-lockup flex items-center text-left lg:hidden">
          <AvalaLogo className="h-9 w-9 flex-shrink-0 sm:hidden" />
          <AvalaLifecycleLockup className="hidden h-11 w-[205px] sm:block" />
        </div>
        <div className="hidden h-6 w-px bg-[var(--av-color-border)] lg:block" />
        <ScopeSwitcher
          currentScope={currentScope}
          onScopeChange={onScopeChange}
          currentUser={currentUser}
          teams={teams}
          projects={projects}
        />
        <div className="hidden min-w-0 xl:block">
          <p className="av-eyebrow">Current module</p>
          <p className="truncate text-sm font-bold text-[var(--av-color-text)]">{currentContextLabel || viewLabel[currentView] || 'AvalaOS Core'}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          className="av-icon-button"
          aria-label="Toggle theme"
        >
          {theme === 'light' ? <MoonIcon className="h-5 w-5" /> : <SunIcon className="h-5 w-5" />}
        </button>

        <div className="hidden items-center gap-2 rounded-xl border border-[var(--av-color-border)] bg-[var(--av-color-surface)] px-2.5 py-1.5 md:flex">
          <UserCircleIcon className="h-7 w-7 text-[var(--av-color-text-subtle)]" />
          <div className="min-w-0">
            <div className="max-w-[132px] truncate text-xs font-bold text-[var(--av-color-text)]">{currentUser.name}</div>
            <div className="max-w-[132px] truncate text-[10px] font-semibold text-[var(--av-color-text-muted)]">{currentUser.roleTitle || currentUser.orgRole || 'Demo user'}</div>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg px-2 py-1 text-xs font-bold text-[var(--av-color-brand-primary)] transition-colors hover:bg-[var(--av-color-bg-subtle)]"
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
