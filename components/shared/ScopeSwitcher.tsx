
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

const ScopeIcon: React.FC<{ scopeType: ScopeType, className?: string }> = ({ scopeType, className = "h-5 w-5" }) => {
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
}

const ScopeSwitcher: React.FC<ScopeSwitcherProps> = ({ currentScope, onScopeChange, currentUser, teams, projects }) => {
    const { currentOrganization } = useOrganizationContext();
    const enabledModules = currentOrganization?.enabledModules;
    const showTeams = isModuleEnabled('delivery', enabledModules);
    const showProjects = isModuleEnabled('docs', enabledModules) || isModuleEnabled('delivery', enabledModules) || isModuleEnabled('monitor', enabledModules);
    const visibleTeams = currentUser.orgRole === 'Admin'
        ? teams
        : teams.filter(team => team.memberIds.includes(currentUser.id));

    const renderScopeName = () => {
        // Handle all variants of the `Scope` type to prevent a TypeScript error.
        // The `ORGANIZATION` scope type does not have a `name` property.
        if (currentScope.type === ScopeType.MY_WORK) return "My Work";
        if (currentScope.type === ScopeType.ORGANIZATION) return "Organization";
        return currentScope.name;
    };

    return (
        <Dropdown>
            <DropdownTrigger>
                <button
                    type="button"
                    className="flex min-w-[238px] items-center gap-3 rounded-2xl border border-[#002C4B]/25 bg-white px-3 py-2 text-left text-[#002C4B] shadow-sm transition-all hover:border-[#ffbc03] hover:shadow-md focus:outline-none focus:ring-3 focus:ring-[#ffbc03]/40 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    aria-label="Switch workspace context"
                >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#002C4B]/8 text-[#002C4B] dark:bg-[#ffbc03]/12 dark:text-[#ffcf45]">
                        <ScopeIcon scopeType={currentScope.type} className="h-5 w-5" />
                    </span>
                    <span className="hidden min-w-0 md:block">
                        <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Workspace</span>
                        <span className="block truncate text-sm font-black">{renderScopeName()}</span>
                    </span>
                    <ChevronDownIcon className="h-4 w-4 text-slate-500" />
                </button>
            </DropdownTrigger>
            <DropdownContent className="w-[360px] max-h-[70vh] overflow-hidden">
                <div className="border-b border-slate-200 px-4 pb-3 pt-2 dark:border-slate-800">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ffbc03]">Switch workspace</p>
                    <p className="mt-1 text-sm font-semibold leading-5 text-slate-500 dark:text-slate-400">
                        Choose the work context. Navigation and boards update immediately.
                    </p>
                </div>
                <div className="max-h-[56vh] overflow-y-auto py-2">
                <DropdownItem onSelect={() => onScopeChange({ type: ScopeType.MY_WORK })}>
                    <UserCircleIcon className="h-5 w-5 text-slate-500" />
                    <span className="min-w-0">
                        <span className="block font-black">My Work</span>
                        <span className="block text-xs font-semibold text-slate-400">Tasks and decisions assigned to you</span>
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
