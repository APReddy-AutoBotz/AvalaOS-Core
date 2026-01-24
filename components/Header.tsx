import React from 'react';
import { KlarityLogo, MoonIcon, SunIcon, SparklesIcon } from './icons';
import { Scope, User } from '../types';
import ScopeSwitcher from './ScopeSwitcher';
import { MOCK_TEAMS, MOCK_PROJECTS } from '../data/mockData';

interface HeaderProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  onStartNew: () => void;
  currentScope: Scope;
  onScopeChange: (scope: Scope) => void;
  currentUser: User;
}

const Header: React.FC<HeaderProps> = ({ theme, toggleTheme, onStartNew, currentScope, onScopeChange, currentUser }) => {
  return (
    <header className="flex items-center justify-between p-4 h-[65px] sticky top-0 z-10 glass">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 text-left">
          <KlarityLogo className="h-8 w-8 text-abz-primary flex-shrink-0" />
          <div className='hidden sm:block'>
            <h1 className="text-xl font-bold text-text-light dark:text-text-dark">Klarity PM</h1>
          </div>
        </div>
        <div className="h-6 w-px bg-slate-200 dark:bg-gray-700 hidden lg:block"></div>
        <ScopeSwitcher
          currentScope={currentScope}
          onScopeChange={onScopeChange}
          currentUser={currentUser}
          teams={MOCK_TEAMS}
          projects={MOCK_PROJECTS}
        />
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={onStartNew}
          className="flex items-center gap-3 btn-primary"
        >
          <SparklesIcon className="h-6 w-6 flex-shrink-0" />
          <div className="text-left hidden sm:block">
            <span className="font-bold text-sm block leading-tight">AI Assistant</span>
            <span className="text-xs opacity-80 block leading-tight">Generate a new document</span>
          </div>
        </button>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-surface-dark focus:outline-none focus:ring-3 focus:ring-abz-primary"
          aria-label="Toggle theme"
        >
          {theme === 'light' ? <MoonIcon className="h-6 w-6" /> : <SunIcon className="h-6 w-6" />}
        </button>
      </div>
    </header>
  );
};

export default Header;
