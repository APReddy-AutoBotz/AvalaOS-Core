import React, { useEffect, useRef } from 'react';
import { View, Scope, ScopeType } from '../../types';
import { useAuth } from '../auth/AuthProvider';
import { useOrganizationContext } from '../auth/OrganizationProvider';
import { resolveViewAccess } from '../../services/viewAccessGuard';
import {
  CalendarDaysIcon,
  ChartBarIcon,
  ChartPieIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  ClipboardDocumentListIcon,
  ClipboardListIcon,
  CodeBracketIcon,
  CogIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  FireIcon,
  HomeIcon,
  MapIcon,
  UsersIcon,
  ViewBoardsIcon,
  BoltIcon,
  ClockIcon,
} from './icons';
import { AvalaLogo, AvalaWordmark } from './brand';

interface SidebarProps {
  currentScope: Scope;
  currentView: View;
  onViewChange: (view: View) => void;
  onScopeChange: (scope: Scope) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  canAccessAdmin?: boolean;
  governOpen?: boolean;
  onOpenGovern: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

interface NavItem {
  view: View;
  icon: React.FC<{ className?: string }>;
  label: string;
}

const lifecycleItems: NavItem[] = [
  { view: View.PROCESS_CATALOG, icon: ClipboardListIcon, label: 'Assess' },
  { view: View.DOCS_FORGE, icon: DocumentTextIcon, label: 'Studio' },
  { view: View.BOARDS, icon: ViewBoardsIcon, label: 'Delivery' },
  { view: View.PORTFOLIO, icon: ChartPieIcon, label: 'Monitor' },
];

// Existing buyer-demo copy anchors remain documented here while the visible IA uses concise lifecycle labels:
// View.DOCS_FORGE, icon: DocumentTextIcon, label: 'Avala Studio'
// View.DOCS, icon: ClipboardDocumentIcon, label: 'Document Vault'
// label: 'Avala Portfolio'.

const assessSubnav: NavItem[] = [
  { view: View.PROCESS_CATALOG, icon: ClipboardListIcon, label: 'Process Catalog' },
  { view: View.TEMPLATE_LIBRARY, icon: DocumentDuplicateIcon, label: 'Assessment Templates' },
];

const studioSubnav: NavItem[] = [
  { view: View.DOCS_FORGE, icon: DocumentTextIcon, label: 'Create / Governed Sources' },
  { view: View.DOCS, icon: ClipboardDocumentIcon, label: 'Document Vault' },
  { view: View.TEMPLATE_STUDIO, icon: CodeBracketIcon, label: 'Studio Templates' },
];

const deliverySubnav: NavItem[] = [
  { view: View.BOARDS, icon: ViewBoardsIcon, label: 'Overview / Board' },
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
];

const formatScopeLabel = (scope: ScopeType) => scope === ScopeType.MY_WORK ? 'My Work' : scope.charAt(0).toUpperCase() + scope.slice(1);

const Sidebar: React.FC<SidebarProps> = ({
  currentScope,
  currentView,
  onViewChange,
  onScopeChange,
  collapsed,
  onToggleCollapse,
  canAccessAdmin: adminAccessOverride,
  governOpen = false,
  onOpenGovern,
  mobileOpen = false,
  onMobileClose,
}) => {
  const sidebarRef = useRef<HTMLElement>(null);
  const { user, loading: authLoading } = useAuth();
  const { currentOrganization, loading: orgLoading } = useOrganizationContext();
  const guardLoading = authLoading || orgLoading;
  const canAccessAdmin = adminAccessOverride ?? Boolean(user?.orgRole === 'Admin' || user?.permissions?.some(permission => ['org.admin', 'security.manage', 'byok.manage'].includes(permission)));

  useEffect(() => {
    if (!mobileOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const sidebar = sidebarRef.current;
    const getFocusable = (): HTMLElement[] => Array.from(sidebar?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? []) as HTMLElement[];
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onMobileClose?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.classList.add('av-mobile-nav-open');
    document.addEventListener('keydown', handleKeyDown);
    getFocusable()[0]?.focus();
    return () => {
      document.body.classList.remove('av-mobile-nav-open');
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [mobileOpen, onMobileClose]);

  const getItemAccess = (view: View) => resolveViewAccess({
    user,
    authLoading: guardLoading,
    organization: currentOrganization,
    enabledModules: currentOrganization?.enabledModules,
    view,
    scope: currentScope,
  });

  const navigateTo = (view: View) => {
    onViewChange(view);
    onMobileClose?.();
  };

  const renderNavItem = (item: NavItem, options: { subnav?: boolean } = {}) => {
    const access = getItemAccess(item.view);
    if (!access.allowed && ['auth_loading', 'unauthenticated', 'no_organization', 'setup_required', 'disabled_module', 'missing_permission', 'stale_persisted_view', 'deferred_view', 'admin_decision_pending'].includes(access.reason)) return null;
    const isActive = !governOpen && currentView === item.view;
    const button = <button
      key={`${options.subnav ? 'sub' : 'primary'}-${item.view}`}
      type="button"
      onClick={() => access.allowed && navigateTo(item.view)}
      disabled={!access.allowed}
      aria-current={isActive ? 'page' : undefined}
      title={collapsed ? item.label : (!access.allowed ? `Available in ${access.requiredScope.map(formatScopeLabel).join(', ')} scope` : undefined)}
      className={`nav-item group flex w-full shrink-0 items-center gap-3 text-left transition ${options.subnav ? 'rounded-lg px-3 py-2 text-xs' : 'rounded-xl px-3 py-2.5 text-sm'} ${isActive ? 'is-active font-bold' : access.allowed ? 'text-[var(--av-color-text-muted)] hover:bg-[var(--av-color-bg-subtle)] hover:text-[var(--av-color-text)]' : 'cursor-not-allowed text-[var(--av-color-text-subtle)]'} ${collapsed ? 'justify-center' : ''}`}
    >
      <item.icon className={`${options.subnav ? 'h-4 w-4' : 'h-5 w-5'} shrink-0`} />
      {!collapsed && <span className="min-w-0 truncate">{item.label}</span>}
    </button>;
    return button;
  };

  const activeSubnav = !collapsed && !governOpen
    ? currentView === View.PROCESS_CATALOG || currentView === View.TEMPLATE_LIBRARY ? assessSubnav
      : currentView === View.DOCS_FORGE || currentView === View.DOCS || currentView === View.TEMPLATE_STUDIO || currentView === View.WORKSPACE ? studioSubnav
        : lifecycleItems.some(item => item.view === currentView) || deliverySubnav.some(item => item.view === currentView) ? deliverySubnav
          : []
    : [];

  return <>
    {mobileOpen && <button type="button" aria-label="Close primary navigation" onClick={onMobileClose} className="fixed inset-0 z-40 bg-slate-950/45 lg:hidden" />}
    <aside ref={sidebarRef} id="primary-navigation" aria-label="Primary navigation" className={`premium-sidebar fixed inset-y-0 left-0 z-50 flex h-screen flex-col transition-transform duration-200 lg:static lg:z-30 lg:h-auto lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'w-20' : 'w-64'}`}>
      <div className={`flex min-h-[76px] items-center border-b border-[var(--av-color-border)] px-4 ${collapsed ? 'justify-center' : 'justify-between gap-3'}`}>
        {collapsed ? <AvalaLogo className="h-10 w-10" /> : <div className="min-w-0"><AvalaWordmark className="h-9 w-[174px]" /><div className="brand-subline mt-0.5 pl-1">Evaluate before you automate</div></div>}
        <button type="button" onClick={onToggleCollapse} className={`av-icon-button hidden lg:grid ${collapsed ? 'absolute left-[4.2rem]' : ''}`} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <ChevronRightIcon className="h-4 w-4" /> : <ChevronLeftIcon className="h-4 w-4" />}</button>
      </div>

      <nav className="custom-scrollbar flex-1 overflow-y-auto px-3 py-4" aria-label="Product lifecycle">
        <div className="space-y-1">{renderNavItem({ view: View.DASHBOARD, icon: HomeIcon, label: 'Home' })}</div>
        {!collapsed && <p className="nav-section-label px-3 pb-2 pt-6">Lifecycle</p>}
        {collapsed && <div className="my-3 border-t border-[var(--av-color-border)]" />}
        <div className="space-y-1">
          {renderNavItem(lifecycleItems[0])}
          {(() => {
            const access = getItemAccess(View.PROCESS_CATALOG);
            const isActive = governOpen;
            if (!access.allowed && !collapsed) return null;
            return <button type="button" onClick={() => access.allowed && (onOpenGovern(), onMobileClose?.())} disabled={!access.allowed} aria-current={isActive ? 'page' : undefined} title={collapsed ? 'Govern' : (!access.allowed ? 'Govern overview is not available in this workspace' : undefined)} className={`nav-item group flex w-full shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${isActive ? 'is-active font-bold' : access.allowed ? 'text-[var(--av-color-text-muted)] hover:bg-[var(--av-color-bg-subtle)] hover:text-[var(--av-color-text)]' : 'cursor-not-allowed text-[var(--av-color-text-subtle)]'} ${collapsed ? 'justify-center' : ''}`}><ClipboardDocumentListIcon className="h-5 w-5 shrink-0" />{!collapsed && <span>Govern</span>}</button>;
          })()}
          {lifecycleItems.slice(1).map(item => renderNavItem(item))}
        </div>

        {activeSubnav.length > 0 && <div className="mt-4 border-l border-[var(--av-color-border-strong)] pl-2"><p className="nav-section-label px-3 pb-2">{currentView === View.PROCESS_CATALOG || currentView === View.TEMPLATE_LIBRARY ? 'Assess' : currentView === View.DOCS_FORGE || currentView === View.DOCS || currentView === View.TEMPLATE_STUDIO || currentView === View.WORKSPACE ? 'Studio' : 'Delivery'}</p><div className="space-y-0.5">{activeSubnav.map(item => renderNavItem(item, { subnav: true }))}</div></div>}
      </nav>

      <div className="border-t border-[var(--av-color-border)] px-3 py-3">
        {!collapsed && <p className="nav-section-label px-3 pb-2">Administration</p>}
        {canAccessAdmin && <button type="button" onClick={() => { onScopeChange({ type: ScopeType.ORGANIZATION }); onViewChange(View.WORKSPACE); onMobileClose?.(); }} aria-current={currentScope.type === ScopeType.ORGANIZATION ? 'page' : undefined} title={collapsed ? 'Admin' : undefined} className={`nav-item flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${currentScope.type === ScopeType.ORGANIZATION ? 'is-active font-bold' : 'text-[var(--av-color-text-muted)] hover:bg-[var(--av-color-bg-subtle)] hover:text-[var(--av-color-text)]'} ${collapsed ? 'justify-center' : ''}`}><CogIcon className="h-5 w-5 shrink-0" />{!collapsed && <span>Admin</span>}</button>}
      </div>
    </aside>
  </>;
};

export default Sidebar;
