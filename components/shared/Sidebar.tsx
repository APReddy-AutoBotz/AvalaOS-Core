import React, { useEffect, useState } from 'react';
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
    ClipboardDocumentIcon,
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
    ChevronDownIcon,
} from './icons';
import { AvalaLogo, AvalaWordmark } from './brand';

interface SidebarProps {
    currentScope: Scope;
    currentView: View;
    onViewChange: (view: View) => void;
    onScopeChange: (scope: Scope) => void;
    collapsed: boolean;
    mobileOpen?: boolean;
    onMobileClose?: () => void;
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
    { view: View.PORTFOLIO, icon: ChartPieIcon, label: 'Avala Portfolio' },
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
    { view: View.DOCS, icon: ClipboardDocumentIcon, label: 'Document Vault' },
];

const settingsItems: NavItem[] = [
    { view: View.TEMPLATE_LIBRARY, icon: DocumentDuplicateIcon, label: 'Assessment Templates' },
    { view: View.TEMPLATE_STUDIO, icon: CodeBracketIcon, label: 'Avala Studio Templates' },
];

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

const Sidebar: React.FC<SidebarProps> = ({ currentScope, currentView, onViewChange, onScopeChange, collapsed, mobileOpen = false, onMobileClose }) => {
    const { user, loading: authLoading } = useAuth();
    const { currentOrganization, loading: orgLoading } = useOrganizationContext();
    const userPermissions = user?.permissions || [];
    const isAdmin = user?.orgRole === 'Admin';
    const guardLoading = authLoading || orgLoading;
    const advancedViewActive = advancedItems.some(item => item.view === currentView);
    const [advancedOpen, setAdvancedOpen] = useState(advancedViewActive);

    useEffect(() => {
        if (advancedViewActive) setAdvancedOpen(true);
    }, [advancedViewActive]);

    const navigateTo = (view: View) => {
        onViewChange(view);
        onMobileClose?.();
    };

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
        const isActive = (currentView === item.view)
            && (item.view === View.DASHBOARD ? currentScope.type === ScopeType.MY_WORK : true)
            && (item.view === View.TEAMS ? currentScope.type === ScopeType.TEAM : true);

        const buttonClasses = `nav-item flex w-full shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${isActive
            ? 'is-active font-bold'
            : isEnabled
                ? 'text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-surface-dark'
                : 'cursor-not-allowed text-slate-400 dark:text-slate-600'
        } ${collapsed ? 'justify-center' : ''}`;

        const buttonElement = (
            <button
                key={item.view}
                onClick={() => isEnabled && navigateTo(item.view)}
                className={buttonClasses}
                title={collapsed ? item.label : ''}
                disabled={!isEnabled}
            >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
            </button>
        );

        if (isEnabled || collapsed) return buttonElement;

        const availableIn = access.requiredScope.map(formatScopeLabel).join(', ');

        return (
            <Tooltip key={item.view} content={`Available in ${availableIn} scope`} position="right">
                <div>{buttonElement}</div>
            </Tooltip>
        );
    };

    return (
        <>
            {mobileOpen && (
                <button
                    type="button"
                    aria-label="Close primary navigation"
                    onClick={onMobileClose}
                    className="fixed inset-y-0 left-64 right-0 z-40 bg-slate-950/35 backdrop-blur-[1px] lg:hidden"
                />
            )}
            <aside id="primary-navigation" className={`premium-sidebar fixed inset-y-0 left-0 z-50 flex h-screen flex-col shadow-2xl transition-transform duration-300 lg:static lg:z-30 lg:h-auto lg:translate-x-0 lg:shadow-none ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'w-20' : 'w-64'}`}>
            <div className={`border-b border-slate-200/70 px-4 py-4 dark:border-slate-700/60 ${collapsed ? 'flex justify-center' : ''}`}>
                <div className="brand-lockup flex items-center">
                    {collapsed ? (
                        <AvalaLogo className="h-10 w-10 shrink-0 drop-shadow-sm" />
                    ) : (
                        <div className="min-w-0">
                            <AvalaWordmark className="h-9 w-[174px]" />
                            <div className="brand-subline mt-0.5 pl-1">Evaluate before you automate</div>
                        </div>
                    )}
                </div>
            </div>

            <nav className="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-3">
                <span className={`nav-section-label px-3 pb-1 ${collapsed ? 'hidden' : 'block'}`}>Core flow</span>
                {sidebarItems.map(renderNavItem)}

                <div className={`pt-4 ${collapsed ? 'hidden' : 'block'}`}>
                    <span className="nav-section-label px-3">Delivery views</span>
                    <button
                        type="button"
                        onClick={() => setAdvancedOpen(open => !open)}
                        aria-expanded={advancedOpen}
                        className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-500 transition hover:bg-slate-200/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                        <span className="flex-1">Workspace tools</span>
                        <span className="rounded-md bg-slate-200/70 px-1.5 py-0.5 text-[10px] tabular-nums dark:bg-slate-800">{advancedItems.length}</span>
                        <ChevronDownIcon className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                    </button>
                </div>

                {(collapsed || advancedOpen) && (
                    <div className="space-y-1">
                        {advancedItems.map(renderNavItem)}
                    </div>
                )}
            </nav>

            <div className="space-y-1 border-t border-slate-200/80 px-3 py-3 dark:border-gray-800/80">
                <span className={`nav-section-label px-3 ${collapsed ? 'hidden' : 'block'}`}>Customization</span>
                {settingsItems.map(renderNavItem)}
                {(isAdmin || userPermissions.some(permission => ['org.admin', 'security.manage', 'byok.manage'].includes(permission))) && (
                    <button
                        onClick={() => {
                            onScopeChange({ type: ScopeType.ORGANIZATION });
                            onViewChange(View.WORKSPACE);
                            onMobileClose?.();
                        }}
                        className={`nav-item flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${currentScope.type === ScopeType.ORGANIZATION ? 'is-active font-bold' : 'text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-surface-dark'} ${collapsed ? 'justify-center' : ''}`}
                        title="Avala Admin"
                    >
                        <CogIcon className="h-5 w-5 flex-shrink-0" />
                        {!collapsed && <span>Avala Admin</span>}
                    </button>
                )}
            </div>
            </aside>
        </>
    );
};

export default Sidebar;
