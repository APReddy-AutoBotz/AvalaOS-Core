
import React from 'react';
import { Scope, User, Team, Project, ScopeType } from '../../types';
import { Dropdown, DropdownTrigger, DropdownContent, DropdownItem, DropdownSeparator, DropdownGroupLabel } from './ui/dropdown';
import { UserCircleIcon, UsersIcon, CubeIcon, BuildingOfficeIcon, ChevronDownIcon } from './icons';
import { useOrganizationContext } from '../auth/OrganizationProvider';
import { isModuleEnabled } from '../../constants/moduleConfig';

interface ScopeSwitcherProps {
  currentScope: Scope;
  onScopeChange: (scope: Scope) => void;
  currentUser: User;
  teams: Team[];
  projects: Project[];
}

const ScopeIcon: React.FC<{ scopeType: ScopeType; className?: string }> = ({ scopeType, className = 'h-5 w-5' }) => {
    switch (scopeType) {
        case ScopeType.MY_WORK:
            return <UserCircleIcon className={className} />;
        case ScopeType.TEAM:
            return <UsersIcon className={className} />;
        case ScopeType.PROJECT:
            return <CubeIcon className={className} />;
        case ScopeType.ORGANIZATION:
            return <BuildingOfficeIcon className={className} />;
        default:
            return null;
    }
};

const ScopeSwitcher: React.FC<ScopeSwitcherProps> = ({ currentScope, onScopeChange, currentUser, teams, projects }) => {
    const { currentOrganization } = useOrganizationContext();
    const enabledModules = currentOrganization?.enabledModules;
    const showTeams = isModuleEnabled('delivery', enabledModules);
    const showProjects = isModuleEnabled('docs', enabledModules) || isModuleEnabled('delivery', enabledModules) || isModuleEnabled('monitor', enabledModules);
    const visibleTeams = currentUser.orgRole === 'Admin'
        ? teams
        : teams.filter(team => team.memberIds.includes(currentUser.id));

    const renderScopeName = () => {
        if (currentScope.type === ScopeType.MY_WORK) return 'My Work';
        if (currentScope.type === ScopeType.ORGANIZATION) return 'Organization';
        return currentScope.name;
    };

    return (
        <Dropdown>
            <DropdownTrigger>
                <button
                    type="button"
                    className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-left text-[#002C4B] shadow-sm transition hover:border-[#0b4f7d]/55 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#0b4f7d]/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white md:min-w-[210px] md:gap-2.5 md:px-2.5"
                    aria-label="Switch workspace context"
                >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#002C4B]/8 text-[#002C4B] dark:bg-sky-300/10 dark:text-sky-200">
                        <ScopeIcon scopeType={currentScope.type} className="h-4 w-4" />
                    </span>
                    <span className="hidden min-w-0 flex-1 md:block">
                        <span className="block text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Workspace</span>
                        <span className="block max-w-[150px] truncate text-xs font-extrabold">{renderScopeName()}</span>
                    </span>
                    <ChevronDownIcon className="h-4 w-4 text-slate-500" />
                </button>
            </DropdownTrigger>

            <DropdownContent className="max-h-[70vh] w-[340px] overflow-hidden">
                <div className="border-b border-slate-200 px-4 pb-3 pt-2 dark:border-slate-800">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#0b4f7d] dark:text-sky-200">Switch workspace</p>
                    <p className="mt-1 text-sm font-medium leading-5 text-slate-500 dark:text-slate-400">
                        Choose the work context. Navigation and boards update immediately.
                    </p>
                </div>
                <div className="max-h-[56vh] overflow-y-auto py-2">
                    <DropdownItem onSelect={() => onScopeChange({ type: ScopeType.MY_WORK })}>
                        <UserCircleIcon className="h-5 w-5 text-slate-500" />
                        <span className="min-w-0">
                            <span className="block font-extrabold">My Work</span>
                            <span className="block text-xs font-medium text-slate-400">Tasks and decisions assigned to you</span>
                        </span>
                    </DropdownItem>
                    {showTeams && visibleTeams.length > 0 && (
                        <>
                            <DropdownSeparator />
                            <DropdownGroupLabel>Teams</DropdownGroupLabel>
                            {visibleTeams.map(team => (
                                <DropdownItem key={team.id} onSelect={() => onScopeChange({ type: ScopeType.TEAM, id: team.id, name: team.name })}>
                                    <UsersIcon className="h-5 w-5 text-slate-500" />
                                    <span>{team.name}</span>
                                </DropdownItem>
                            ))}
                        </>
                    )}
                    {showProjects && projects.length > 0 && (
                        <>
                            <DropdownSeparator />
                            <DropdownGroupLabel>Projects</DropdownGroupLabel>
                            {projects.map(project => (
                                <DropdownItem key={project.id} onSelect={() => onScopeChange({ type: ScopeType.PROJECT, id: project.id, name: project.name })}>
                                    <CubeIcon className="h-5 w-5 text-slate-500" />
                                    <span>{project.name}</span>
                                </DropdownItem>
                            ))}
                        </>
                    )}
                </div>
            </DropdownContent>
        </Dropdown>
    );
};

export default ScopeSwitcher;
