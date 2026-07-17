import React from 'react';
import { MoonIcon, SunIcon, SparklesIcon, UserCircleIcon } from './icons';
import { AvalaLogo, AvalaWordmark } from './brand';
import { Project, Scope, Team, User } from '../../types';
import ScopeSwitcher from './ScopeSwitcher';
import { useAuth } from '../auth/AuthProvider';
import { useOrganizationContext } from '../auth/OrganizationProvider';
import { isModuleEnabled } from '../../constants/moduleConfig';

interface HeaderProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  onStartNew: () => void;
  currentScope: Scope;
  onScopeChange: (scope: Scope) => void;
  currentUser: User;
  teams: Team[];
  projects: Project[];
  mobileNavigationOpen: boolean;
  onToggleNavigation: () => void;
}

const Header: React.FC<HeaderProps> = ({ theme, toggleTheme, onStartNew, currentScope, onScopeChange, currentUser, teams, projects, mobileNavigationOpen, onToggleNavigation }) => {
  const { signOut } = useAuth();
  const { currentOrganization } = useOrganizationContext();
  const enabledModules = currentOrganization?.enabledModules;
  const primaryAction = isModuleEnabled('assess', enabledModules)
    ? { title: 'New assessment', subtitle: 'Evaluate a process' }
    : isModuleEnabled('docs', enabledModules)
      ? { title: 'New document', subtitle: 'Draft with governance' }
      : isModuleEnabled('delivery', enabledModules)
        ? { title: 'Open delivery', subtitle: 'Review approved work' }
        : { title: 'Open monitor', subtitle: 'Open readiness and blocker signals' };

  return (
    <header className="header glass sticky top-0 z-10 flex h-16 items-center justify-between px-3 sm:px-5">
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
          <div className="hidden sm:block">
            <AvalaWordmark className="h-8 w-[156px]" />
            <p className="brand-subline mt-0.5">Govern before you execute</p>
          </div>
        </div>
        <div className="hidden h-6 w-px bg-slate-200 dark:bg-gray-700 lg:block" />
        <ScopeSwitcher
          currentScope={currentScope}
          onScopeChange={onScopeChange}
          currentUser={currentUser}
          teams={teams}
          projects={projects}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onStartNew}
          aria-label={primaryAction.title}
          className="flex h-10 items-center gap-2 rounded-lg border border-[#002C4B] bg-[#002C4B] px-3 text-white shadow-sm transition hover:bg-[#0b4f7d] focus:outline-none focus:ring-2 focus:ring-[#0b4f7d]/30 dark:border-sky-300/25"
        >
          <SparklesIcon className="h-4 w-4 flex-shrink-0 text-[#ffcf45]" />
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-bold leading-tight">{primaryAction.title}</span>
            <span className="hidden text-[10px] font-medium leading-tight text-slate-300 xl:block">{primaryAction.subtitle}</span>
          </span>
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          className="btn-ghost rounded-lg p-2 text-slate-500 focus:outline-none focus:ring-2 focus:ring-abz-primary dark:text-slate-300"
          aria-label="Toggle theme"
        >
          {theme === 'light' ? <MoonIcon className="h-5 w-5" /> : <SunIcon className="h-5 w-5" />}
        </button>

        <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900/60 md:flex">
          <UserCircleIcon className="h-7 w-7 text-slate-400" />
          <div className="min-w-0">
            <div className="max-w-[132px] truncate text-xs font-extrabold text-slate-900 dark:text-white">{currentUser.name}</div>
            <div className="max-w-[132px] truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">{currentUser.roleTitle || currentUser.orgRole || 'Demo user'}</div>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg px-2 py-1 text-xs font-bold text-[#002C4B] transition-colors hover:bg-slate-100 dark:text-sky-200 dark:hover:bg-slate-800"
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
