
import React from 'react';
import { Scope, User, Team, Project, ScopeType } from '../types';
import { Dropdown, DropdownTrigger, DropdownContent, DropdownItem, DropdownSeparator, DropdownGroupLabel } from './ui/dropdown';
import { UserCircleIcon, UsersIcon, CubeIcon, BuildingOfficeIcon, ChevronDownIcon } from './icons';

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
                <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-text-light dark:text-text-dark bg-slate-100 dark:bg-abz-ink rounded-2xl hover:bg-slate-200 dark:hover:bg-gray-800 focus:outline-none focus:ring-3 focus:ring-abz-primary transition-colors">
                    <ScopeIcon scopeType={currentScope.type} />
                    <span className="font-bold hidden md:inline">{renderScopeName()}</span>
                    <ChevronDownIcon className="h-4 w-4 text-slate-500" />
                </button>
            </DropdownTrigger>
            <DropdownContent>
                <DropdownItem onSelect={() => onScopeChange({ type: ScopeType.MY_WORK })}>
                    <UserCircleIcon className="h-5 w-5 text-slate-500" />
                    <span>My Work</span>
                </DropdownItem>
                <DropdownSeparator />
                <DropdownGroupLabel>Teams</DropdownGroupLabel>
                {teams.map(team => (
                    <DropdownItem key={team.id} onSelect={() => onScopeChange({ type: ScopeType.TEAM, id: team.id, name: team.name })}>
                        <UsersIcon className="h-5 w-5 text-slate-500" />
                        <span>{team.name}</span>
                    </DropdownItem>
                ))}
                <DropdownSeparator />
                <DropdownGroupLabel>Projects</DropdownGroupLabel>
                 {projects.map(project => (
                    <DropdownItem key={project.id} onSelect={() => onScopeChange({ type: ScopeType.PROJECT, id: project.id, name: project.name })}>
                        <CubeIcon className="h-5 w-5 text-slate-500" />
                        <span>{project.name}</span>
                    </DropdownItem>
                ))}
            </DropdownContent>
        </Dropdown>
    );
};

export default ScopeSwitcher;