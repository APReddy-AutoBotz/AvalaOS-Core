import React from 'react';
import { ProductModuleKey, View, Scope, ScopeType } from '../../types';
import { useAuth } from '../auth/AuthProvider';
import { useOrganizationContext } from '../auth/OrganizationProvider';
import { isModuleEnabled } from '../../constants/moduleConfig';
import { Tooltip } from './ui/Tooltip';
import {
    HomeIcon,
    ViewBoardsIcon,
    MapIcon,
    DocumentTextIcon,
    ChartBarIcon,
    CogIcon,
    DocumentDuplicateIcon,
    ClipboardListIcon,
    CalendarDaysIcon,
    FireIcon,
    UsersIcon,
    CodeBracketIcon,
    BoltIcon,
    ClockIcon,
    ChartPieIcon,
    KlarityLogo,
    KlarityWordmark,
} from './icons';

interface SidebarProps {
    currentScope: Scope;
    currentView: View;
    onViewChange: (view: View) => void;
    onScopeChange: (scope: Scope) => void;
    collapsed: boolean;
}

interface NavItem {
    view: View;
    module: ProductModuleKey;
    icon: React.FC<{ className?: string }>;
    label: string;
    scopes: ScopeType[];
    permissions: string[];
}

const sidebarItems: NavItem[] = [
    { view: View.DASHBOARD, module: 'monitor', icon: HomeIcon, label: 'Command Center', scopes: [ScopeType.MY_WORK], permissions: [] },
    { view: View.PROCESS_CATALOG, module: 'assess', icon: ClipboardListIcon, label: 'Assess Processes', scopes: [ScopeType.MY_WORK, ScopeType.TEAM, ScopeType.PROJECT, ScopeType.ORGANIZATION], permissions: ['process.create', 'assessment.create', 'assessment.edit', 'assessment.review', 'process.approve', 'strategy.read'] },
    { view: View.DOCS_FORGE, module: 'docs', icon: DocumentTextIcon, label: 'Generate Docs', scopes: [ScopeType.MY_WORK, ScopeType.TEAM, ScopeType.PROJECT], permissions: ['docs.generate', 'docs.review', 'ai.configure'] },
    { view: View.PORTFOLIO, module: 'monitor', icon: ChartPieIcon, label: 'Portfolio', scopes: [ScopeType.MY_WORK], permissions: ['portfolio.read', 'strategy.read'] },
    { view: View.BOARDS, module: 'delivery', icon: ViewBoardsIcon, label: 'Delivery Board', scopes: [ScopeType.MY_WORK, ScopeType.PROJECT, ScopeType.TEAM], permissions: ['project.read', 'project.manage', 'task.read', 'task.update', 'task.update.own', 'defects.manage', 'uat.execute'] },
];

const advancedItems: NavItem[] = [
    { view: View.LIST, module: 'delivery', icon: ClipboardListIcon, label: 'Work List', scopes: [ScopeType.MY_WORK, ScopeType.PROJECT, ScopeType.TEAM], permissions: ['task.read', 'task.update', 'task.update.own', 'project.read', 'project.manage'] },
    { view: View.BACKLOG, module: 'delivery', icon: DocumentDuplicateIcon, label: 'Backlog', scopes: [ScopeType.PROJECT], permissions: ['backlog.read', 'backlog.manage', 'project.manage'] },
    { view: View.ROADMAP, module: 'delivery', icon: MapIcon, label: 'Roadmap', scopes: [ScopeType.PROJECT], permissions: ['roadmap.read', 'roadmap.manage', 'portfolio.read', 'project.manage'] },
    { view: View.CALENDAR, module: 'delivery', icon: CalendarDaysIcon, label: 'Calendar', scopes: [ScopeType.MY_WORK, ScopeType.PROJECT], permissions: ['task.read', 'project.read', 'project.manage', 'uat.execute', 'training.review'] },
    { view: View.GANTT, module: 'delivery', icon: ChartBarIcon, label: 'Timeline', scopes: [ScopeType.PROJECT], permissions: ['roadmap.read', 'roadmap.manage', 'project.manage', 'portfolio.read'] },
    { view: View.WORKLOAD, module: 'delivery', icon: UsersIcon, label: 'Capacity', scopes: [ScopeType.PROJECT], permissions: ['capacity.read', 'project.manage'] },
    { view: View.SPRINT_PLANNING, module: 'delivery', icon: FireIcon, label: 'Sprints', scopes: [ScopeType.PROJECT], permissions: ['sprint.manage', 'backlog.manage', 'project.manage'] },
    { view: View.TIMESHEETS, module: 'delivery', icon: ClockIcon, label: 'Timesheets', scopes: [ScopeType.PROJECT], permissions: ['timesheets.log', 'timesheets.read', 'timesheets.approve'] },
    { view: View.AUTOMATIONS, module: 'delivery', icon: BoltIcon, label: 'Automations', scopes: [ScopeType.PROJECT], permissions: ['automation.view', 'automation.execute', 'automation.edit'] },
    { view: View.DOCS, module: 'docs', icon: DocumentTextIcon, label: 'Document Vault', scopes: [ScopeType.PROJECT], permissions: ['docs.read', 'docs.review', 'docs.generate', 'docs.approve'] },
];

const settingsItems: NavItem[] = [
    { view: View.TEMPLATE_LIBRARY, module: 'assess', icon: DocumentDuplicateIcon, label: 'Assessment Templates', scopes: [ScopeType.MY_WORK, ScopeType.TEAM, ScopeType.PROJECT, ScopeType.ORGANIZATION], permissions: ['process.create', 'assessment.create', 'assessment.edit', 'org.admin'] },
    { view: View.TEMPLATE_STUDIO, module: 'docs', icon: CodeBracketIcon, label: 'Doc Template Studio', scopes: [ScopeType.MY_WORK, ScopeType.TEAM, ScopeType.PROJECT], permissions: ['docs.generate', 'docs.review', 'org.admin'] },
]

const Sidebar: React.FC<SidebarProps> = ({ currentScope, currentView, onViewChange, onScopeChange, collapsed }) => {
    const { user } = useAuth();
    const { currentOrganization } = useOrganizationContext();
    const userPermissions = user?.permissions || [];
    const isAdmin = user?.orgRole === 'Admin';

    const hasAccess = (item: { permissions?: string[] }) => {
        if (isAdmin) return true;
        if (!item.permissions || item.permissions.length === 0) return true;
        return item.permissions.some(permission => userPermissions.includes(permission));
    };

    const renderNavItem = (item: NavItem) => {
        if (!isModuleEnabled(item.module, currentOrganization?.enabledModules)) return null;
        if (!hasAccess(item)) return null;
        const isEnabled = item.scopes.includes(currentScope.type);

        // Special handling for dashboard/team views to not be active in other scopes
        const isActive = (currentView === item.view) &&
            (item.view === View.DASHBOARD ? currentScope.type === ScopeType.MY_WORK : true) &&
            (item.view === View.TEAMS ? currentScope.type === ScopeType.TEAM : true);

        const buttonClasses = `w-full flex shrink-0 items-center gap-4 p-3 rounded-2xl text-sm font-semibold transition-colors nav-item ${isActive
            ? 'is-active font-bold'
            : isEnabled
                ? 'text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-surface-dark'
                : 'text-slate-400 dark:text-slate-600 cursor-not-allowed'
            } ${collapsed ? 'justify-center' : ''}`;

        const buttonElement = (
            <button
                key={item.view}
                onClick={() => isEnabled && onViewChange(item.view)}
                className={buttonClasses}
                title={collapsed ? item.label : ''}
                disabled={!isEnabled}
            >
                <item.icon className="h-6 w-6 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
            </button>
        );

        if (isEnabled || collapsed) {
            return buttonElement;
        }

        const availableIn = item.scopes
            .map(s => {
                if (s === 'my_work') return 'My Work';
                return s.charAt(0).toUpperCase() + s.slice(1);
            })
            .join(', ');

        return (
            <Tooltip key={item.view} content={`Available in ${availableIn} scope`} position="right">
                <div>{buttonElement}</div>
            </Tooltip>
        );
    }

    return (
        <aside className={`premium-sidebar flex flex-col transition-all duration-300 z-30 ${collapsed ? 'w-20' : 'w-72'}`}>
            <div className={`px-4 py-5 border-b border-slate-200/70 dark:border-slate-700/60 ${collapsed ? 'flex justify-center' : ''}`}>
                <div className="brand-lockup flex items-center gap-3">
                    <KlarityLogo className="h-10 w-10 shrink-0 drop-shadow-sm" />
                    {!collapsed && (
                        <div className="min-w-0">
                            <KlarityWordmark className="h-9 w-[142px]" />
                            <div className="brand-subline mt-1">Process Intelligence OS</div>
                        </div>
                    )}
                </div>
            </div>
            <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto custom-scrollbar">
                <span className={`nav-section-label px-3 pb-1 ${collapsed ? 'hidden' : 'block'}`}>
                    Core Flow
                </span>
                {sidebarItems.map(renderNavItem)}
                <span className={`nav-section-label px-3 pt-5 pb-1 ${collapsed ? 'hidden' : 'block'}`}>
                    Advanced Tools
                </span>
                {advancedItems.map(renderNavItem)}
            </nav>
            <div className="px-4 py-4 space-y-2 border-t border-slate-200/80 dark:border-gray-800/80">
                <span className={`nav-section-label px-3 ${collapsed ? 'hidden' : 'block'}`}>
                    Customization
                </span>
                {settingsItems.map(renderNavItem)}
                {(isAdmin || userPermissions.some(permission => ['org.admin', 'security.manage', 'byok.manage'].includes(permission))) && <button
                    onClick={() => {
                        onScopeChange({ type: ScopeType.ORGANIZATION });
                        onViewChange(View.WORKSPACE);
                    }}
                    className={`w-full flex items-center gap-4 p-3 rounded-2xl text-sm font-semibold transition-colors nav-item ${currentScope.type === ScopeType.ORGANIZATION ? 'is-active font-bold' : 'text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-surface-dark'} ${collapsed ? 'justify-center' : ''}`}
                    title="Settings"
                >
                    <CogIcon className="h-6 w-6 flex-shrink-0" />
                    {!collapsed && <span>Settings</span>}
                </button>}
            </div>
        </aside>
    );
};

export default Sidebar;
