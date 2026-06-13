import React from 'react';
import { AvalaLogo, AvalaWordmark, MoonIcon, SunIcon, SparklesIcon, UserCircleIcon } from './icons';
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
}

const Header: React.FC<HeaderProps> = ({ theme, toggleTheme, onStartNew, currentScope, onScopeChange, currentUser, teams, projects }) => {
  const { signOut } = useAuth();
  const { currentOrganization } = useOrganizationContext();
  const enabledModules = currentOrganization?.enabledModules;
  const primaryAction = isModuleEnabled('assess', enabledModules)
    ? { title: 'Avala Assess', subtitle: 'Start with process evaluation' }
    : isModuleEnabled('docs', enabledModules)
      ? { title: 'Avala Studio', subtitle: 'Draft governed documents' }
      : isModuleEnabled('delivery', enabledModules)
        ? { title: 'Avala Delivery Lite', subtitle: 'Open approved work' }
        : { title: 'Avala Monitor', subtitle: 'Open portfolio signals' };

  return (
    <header className="header glass flex items-center justify-between h-[72px] sticky top-0 z-10 px-5">
      <div className="flex items-center gap-4">
        <div className="brand-lockup flex items-center gap-3 text-left lg:hidden">
          <AvalaLogo className="h-9 w-9 flex-shrink-0" />
          <div className="hidden sm:block">
            <AvalaWordmark className="h-8 w-[142px]" />
            <p className="brand-subline mt-1">Govern before you execute</p>
          </div>
        </div>
        <div className="h-6 w-px bg-slate-200 dark:bg-gray-700 hidden lg:block"></div>
        <ScopeSwitcher
          currentScope={currentScope}
          onScopeChange={onScopeChange}
          currentUser={currentUser}
          teams={teams}
          projects={projects}
        />
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={onStartNew}
          className="flex items-center gap-3 btn-primary px-4 py-2.5"
        >
          <SparklesIcon className="h-5 w-5 flex-shrink-0" />
          <div className="text-left hidden sm:block">
            <span className="font-bold text-sm block leading-tight">{primaryAction.title}</span>
            <span className="text-xs opacity-85 block leading-tight">{primaryAction.subtitle}</span>
          </div>
        </button>
        <button
          onClick={toggleTheme}
          className="btn-ghost p-2.5 rounded-xl text-slate-500 dark:text-slate-300 focus:outline-none focus:ring-3 focus:ring-abz-primary"
          aria-label="Toggle theme"
        >
          {theme === 'light' ? <MoonIcon className="h-6 w-6" /> : <SunIcon className="h-6 w-6" />}
        </button>
        <div className="hidden items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/60 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/50 md:flex">
          <UserCircleIcon className="h-8 w-8 text-slate-400" />
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-slate-900 dark:text-white">{currentUser.name}</div>
            <div className="truncate text-[11px] font-bold text-slate-500 dark:text-slate-400">{currentUser.roleTitle || currentUser.orgRole || 'Demo user'}</div>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="rounded-xl px-2.5 py-1.5 text-xs font-black text-[#002C4B] transition-colors hover:bg-[#ffbc03]/15 dark:text-[#ffcf45] dark:hover:bg-[#ffbc03]/10"
          >
            Switch
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
