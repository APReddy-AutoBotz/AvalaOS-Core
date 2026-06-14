import React from 'react';
import { View, Scope, ScopeType } from '../../types';
import { useAuth } from '../auth/AuthProvider';
import { useOrganizationContext } from '../auth/OrganizationProvider';
import { resolveViewAccess, type ViewAccessReason } from '../../services/viewAccessGuard';
import { Tooltip } from './ui/Tooltip';
import {
    HomeIcon,
    ViewBoardsIcon,
    MapIcon,
    DocumentTextIcon,
    ChartBarIcon,
    CogIcon,
    DocumentDuplicateIcon,
    ClipboardDocumentListIcon,
    ClipboardListIcon,
    CalendarDaysIcon,
    FireIcon,
    UsersIcon,
    CodeBracketIcon,
    BoltIcon,
    ClockIcon,
    ChartPieIcon,
    AvalaLogo,
    AvalaWordmark,
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
    icon: React.FC<{ className?: string }>;
    label: string;
}

const sidebarItems: NavItem[] = [
    { view: View.DASHBOARD, icon: HomeIcon, label: 'Avala Monitor' },
    { view: View.PROCESS_CATALOG, icon: ClipboardListIcon, label: 'Avala Assess' },
    { view: View.DOCS_FORGE, icon: DocumentTextIcon, label: 'Avala Studio' },
    { view: View.PORTFOLIO, icon: ChartPieIcon, label: 'Portfolio' },
    { view: View.BOARDS, icon: ViewBoardsIcon, label: 'Avala Delivery' },
];

const advancedItems: NavItem[] = [
    { view: View.LIST, icon: ClipboardListIcon, label: 'Work List' },
    { view: View.BACKLOG, icon: DocumentDuplicateIcon, label: 'Backlog' },
    { view: View.ROADMAP, icon: MapIcon, label: 'Roadmap' },
    { view: View.CALENDAR, icon: CalendarDaysIcon, label: 'Calendar' },
    { view: View.GANTT, icon: ChartBarIcon, label: 'Timeline' },
    { view: View.WORKLOAD, icon: UsersIcon, label: 'Capacity' },
    { view: View.SPRINT_PLANNING, icon: FireIcon, label: 'Sprints' },
    { view: View.DELIVERY_PACK, icon: ClipboardDocumentListIcon, label: 'Delivery Pack' },
    { view: View.TIMESHEETS, icon: ClockIcon, label: 'Timesheets' },
    { view: View.AUTOMATIONS, icon: BoltIcon, label: 'Automations' },
    { view: View.DOCS, icon: DocumentTextIcon, label: 'Document Vault' },
];

const settingsItems: NavItem[] = [
    { view: View.TEMPLATE_LIBRARY, icon: DocumentDuplicateIcon, label: 'Assessment Templates' },
    { view: View.TEMPLATE_STUDIO, icon: CodeBracketIcon, label: 'Avala Studio Templates' },
]

const hiddenGuardReasons: ViewAccessReason[] = [
    'auth_loading',
    'unauthenticated',
    'no_organization',
    'setup_required',
    'disabled_module',
    'missing_permission',
    'stale_persisted_view',
    'deferred_view',
    'admin_decision_pending',
];

const formatScopeLabel = (scope: ScopeType) => {
    if (scope === ScopeType.MY_WORK) return 'My Work';
    return scope.charAt(0).toUpperCase() + scope.slice(1);
};

const Sidebar: React.FC<SidebarProps> = ({ currentScope, currentView, onViewChange, onScopeChange, collapsed }) => {
    const { user, loading: authLoading } = useAuth();
    const { currentOrganization, loading: orgLoading } = useOrganizationContext();
    const userPermissions = user?.permissions || [];
    const isAdmin = user?.orgRole === 'Admin';
    const guardLoading = authLoading || orgLoading;

    const getItemAccess = (view: View) => {
        return resolveViewAccess({
            user,
            authLoading: guardLoading,
            organization: currentOrganization,
            enabledModules: currentOrganization?.enabledModules,
            view,
            scope: currentScope,
        });
    };

    const renderNavItem = (item: NavItem) => {
        const access = getItemAccess(item.view);
        if (!access.allowed && hiddenGuardReasons.includes(access.reason)) return null;

        const isEnabled = access.allowed;

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

        const availableIn = access.requiredScope
            .map(formatScopeLabel)
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
                    <AvalaLogo className="h-10 w-10 shrink-0 drop-shadow-sm" />
                    {!collapsed && (
                        <div className="min-w-0">
                            <AvalaWordmark className="h-9 w-[156px]" />
                            <div className="brand-subline mt-1">Evaluate before you automate</div>
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
                    title="Avala Admin"
                >
                    <CogIcon className="h-6 w-6 flex-shrink-0" />
                    {!collapsed && <span>Avala Admin</span>}
                </button>}
            </div>
        </aside>
    );
};

export default Sidebar;
