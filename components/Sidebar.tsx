import React from 'react';
import { View, Scope, ScopeType } from '../types';
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
} from './icons';

interface SidebarProps {
    currentScope: Scope;
    currentView: View;
    onViewChange: (view: View) => void;
    collapsed: boolean;
}

const sidebarItems = [
    { view: View.DASHBOARD, icon: HomeIcon, label: 'Dashboard', scopes: [ScopeType.MY_WORK] },
    { view: View.PORTFOLIO, icon: ChartPieIcon, label: 'Portfolio', scopes: [ScopeType.MY_WORK] },
    { view: View.TEAMS, icon: UsersIcon, label: 'Team Home', scopes: [ScopeType.TEAM] },
    { view: View.BOARDS, icon: ViewBoardsIcon, label: 'Boards', scopes: [ScopeType.MY_WORK, ScopeType.PROJECT, ScopeType.TEAM] },
    { view: View.LIST, icon: ClipboardListIcon, label: 'List', scopes: [ScopeType.MY_WORK, ScopeType.PROJECT, ScopeType.TEAM] },
    { view: View.CALENDAR, icon: CalendarDaysIcon, label: 'Calendar', scopes: [ScopeType.MY_WORK, ScopeType.PROJECT] },
    { view: View.GANTT, icon: ChartBarIcon, label: 'Gantt', scopes: [ScopeType.PROJECT] },
    { view: View.WORKLOAD, icon: UsersIcon, label: 'Workload', scopes: [ScopeType.PROJECT] },
    { view: View.ROADMAP, icon: MapIcon, label: 'Roadmap', scopes: [ScopeType.PROJECT] },
    { view: View.BACKLOG, icon: DocumentDuplicateIcon, label: 'Backlog', scopes: [ScopeType.PROJECT] },
    { view: View.SPRINT_PLANNING, icon: FireIcon, label: 'Sprints', scopes: [ScopeType.PROJECT] },
    { view: View.TIMESHEETS, icon: ClockIcon, label: 'Timesheets', scopes: [ScopeType.PROJECT] },
    { view: View.AUTOMATIONS, icon: BoltIcon, label: 'Automations', scopes: [ScopeType.PROJECT] },
    { view: View.REPORTS, icon: ChartBarIcon, label: 'Reports', scopes: [ScopeType.PROJECT] },
    { view: View.DOCS, icon: DocumentTextIcon, label: 'Docs', scopes: [ScopeType.PROJECT] },
];

const settingsItems = [
    { view: View.TEMPLATE_STUDIO, icon: CodeBracketIcon, label: 'Template Studio', scopes: [ScopeType.MY_WORK, ScopeType.TEAM, ScopeType.PROJECT] },
    // Add other settings items here in the future
]

const Sidebar: React.FC<SidebarProps> = ({ currentScope, currentView, onViewChange, collapsed }) => {
    
    const renderNavItem = (item: typeof sidebarItems[0]) => {
        const isEnabled = item.scopes.includes(currentScope.type);
            
        // Special handling for dashboard/team views to not be active in other scopes
        const isActive = (currentView === item.view) && 
            (item.view === View.DASHBOARD ? currentScope.type === ScopeType.MY_WORK : true) &&
            (item.view === View.TEAMS ? currentScope.type === ScopeType.TEAM : true);

        const buttonClasses = `w-full flex items-center gap-4 p-3 rounded-2xl text-sm font-semibold transition-colors nav-item ${
            isActive
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
    <aside className={`flex flex-col bg-slate-50/50 dark:bg-abz-ink/50 border-r border-slate-200/80 dark:border-gray-800/80 transition-all duration-300 ${collapsed ? 'w-20' : 'w-64'}`}>
      <nav className="flex-1 px-4 py-4 space-y-2">
        {sidebarItems.map(renderNavItem)}
      </nav>
      <div className="px-4 py-4 space-y-2 border-t border-slate-200/80 dark:border-gray-800/80">
        <span className={`px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider ${collapsed ? 'hidden' : 'block'}`}>
            Customization
        </span>
        {settingsItems.map(renderNavItem)}
         <button
            className={`w-full flex items-center gap-4 p-3 rounded-2xl text-sm font-semibold text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-surface-dark ${collapsed ? 'justify-center' : ''}`}
            title="Settings"
          >
            <CogIcon className="h-6 w-6 flex-shrink-0" />
            {!collapsed && <span>Settings</span>}
          </button>
      </div>
    </aside>
  );
};

export default Sidebar;
