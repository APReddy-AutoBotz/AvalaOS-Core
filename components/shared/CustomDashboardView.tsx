import React, { useState, useEffect } from 'react';
import { User, Task, Project, Sprint, Filters, WidgetType, WidgetDefinition, WidgetConfigs, WidgetConfig, HandoffLedgerEntry } from '../../types';
import HandoffLedgerPanel from './HandoffLedgerPanel';

import WelcomeWidget from './widgets/WelcomeWidget';
import StatsWidget from './widgets/StatsWidget';
import MyTasksWidget from './widgets/MyTasksWidget';
import ProjectHealthWidget from './widgets/ProjectHealthWidget';
import BurndownChartWidget from './widgets/BurndownChartWidget';
import TasksByStatusWidget from './widgets/TasksByStatusWidget';
import AiInsightsWidget from './widgets/AiInsightsWidget';
import CustomizeDashboardModal from './CustomizeDashboardModal';
import PageHeader from './ui/PageHeader';
import StatusBadge from './ui/StatusBadge';

interface CustomDashboardViewProps {
    currentUser: User;
    tasks: Task[];
    projects: Project[];
    sprints: Sprint[];
    onSelectTask: (task: Task) => void;
    onStatClick: (filter: Filters) => void;
    handoffEntries?: HandoffLedgerEntry[];
}

const WIDGET_DEFINITIONS: WidgetDefinition[] = [
    { id: WidgetType.WELCOME, title: 'Welcome Banner', description: 'A personalized greeting for the user.', gridArea: 'welcome' },
    { id: WidgetType.STATS, title: 'Quick Stats', description: 'High-level counts of your active, due soon, and overdue tasks.', gridArea: 'stats' },
    { id: WidgetType.MY_TASKS, title: 'My Tasks', description: 'A focused list of your most important upcoming and overdue tasks.', gridArea: 'mytasks' },
    { id: WidgetType.AI_INSIGHTS, title: 'Monitor Insights', description: 'Reviewable signals from governed delivery and handoff activity.', gridArea: 'aiinsights' },
    { id: WidgetType.PROJECT_HEALTH, title: 'Project Health', description: 'An at-a-glance overview of the status of all your projects.', gridArea: 'phealth' },
    { id: WidgetType.BURNDOWN_CHART, title: 'Sprint Burndown', description: 'Chart showing the progress of the current active sprint.', gridArea: 'burndown' },
    { id: WidgetType.TASKS_BY_STATUS, title: 'Tasks by Status', description: 'A bar chart showing how your tasks are distributed across different statuses.', gridArea: 'status' },
];

const widgetComponentMap: Record<WidgetType, React.FC<any>> = {
    [WidgetType.WELCOME]: WelcomeWidget,
    [WidgetType.STATS]: StatsWidget,
    [WidgetType.MY_TASKS]: MyTasksWidget,
    [WidgetType.PROJECT_HEALTH]: ProjectHealthWidget,
    [WidgetType.BURNDOWN_CHART]: BurndownChartWidget,
    [WidgetType.TASKS_BY_STATUS]: TasksByStatusWidget,
    [WidgetType.AI_INSIGHTS]: AiInsightsWidget,
};

const DEFAULT_WIDGETS: WidgetType[] = [
    WidgetType.WELCOME,
    WidgetType.STATS,
    WidgetType.MY_TASKS,
    WidgetType.AI_INSIGHTS,
    WidgetType.BURNDOWN_CHART,
    WidgetType.TASKS_BY_STATUS,
];

const CustomDashboardView: React.FC<CustomDashboardViewProps> = (props) => {
    const [isCustomizeModalOpen, setCustomizeModalOpen] = useState(false);
    const [visibleWidgets, setVisibleWidgets] = useState<WidgetType[]>([]);
    const [widgetConfigs, setWidgetConfigs] = useState<WidgetConfigs>({});
    const [configuringWidget, setConfiguringWidget] = useState<WidgetType | null>(null);


    useEffect(() => {
        try {
            const savedLayout = localStorage.getItem('dashboardLayout');
            setVisibleWidgets(savedLayout ? JSON.parse(savedLayout) : DEFAULT_WIDGETS);

            const savedConfigs = localStorage.getItem('dashboardConfigs');
            setWidgetConfigs(savedConfigs ? JSON.parse(savedConfigs) : {});
        } catch (error) {
            console.error("Failed to parse dashboard settings from localStorage", error);
            setVisibleWidgets(DEFAULT_WIDGETS);
            setWidgetConfigs({});
        }
    }, []);

    const handleSaveLayout = (newLayout: WidgetType[]) => {
        setVisibleWidgets(newLayout);
        localStorage.setItem('dashboardLayout', JSON.stringify(newLayout));
        setCustomizeModalOpen(false);
    };

    const handleUpdateWidgetConfig = (widgetId: WidgetType, newConfig: WidgetConfig) => {
        const newConfigs = { ...widgetConfigs, [widgetId]: newConfig };
        setWidgetConfigs(newConfigs);
        localStorage.setItem('dashboardConfigs', JSON.stringify(newConfigs));
    };


    const renderWidget = (widgetId: WidgetType) => {
        const WidgetComponent = widgetComponentMap[widgetId];
        const definition = WIDGET_DEFINITIONS.find(def => def.id === widgetId);
        if (!WidgetComponent || !definition) return null;

        const widgetProps: any = {
            ...props,
            config: widgetConfigs[widgetId] || {},
            onUpdateConfig: (newConfig: WidgetConfig) => handleUpdateWidgetConfig(widgetId, newConfig),
            isConfiguring: configuringWidget === widgetId,
            onToggleConfigure: () => setConfiguringWidget(prev => prev === widgetId ? null : widgetId),
        };

        // WelcomeWidget has a different structure and doesn't use the wrapper
        if (widgetId === WidgetType.WELCOME) {
            return <div key={widgetId} style={{ gridArea: definition.gridArea }}><WelcomeWidget {...props} /></div>;
        }

        // StatsWidget also has a different structure
        if (widgetId === WidgetType.STATS) {
            return <div key={widgetId} style={{ gridArea: definition.gridArea }}><StatsWidget {...props} /></div>;
        }

        return (
            <div key={widgetId} style={{ gridArea: definition.gridArea }} className="card-hover-effect">
                <WidgetComponent {...widgetProps} />
            </div>
        );
    }

    const openTaskCount = props.tasks.filter(task => task.status !== 'Done').length;
    const blockedTaskCount = props.tasks.filter(task => task.status === 'Blocked').length;
    const reviewTaskCount = props.tasks.filter(task => ['In Review', 'Testing', 'Ready for Release'].includes(task.status)).length;

    return (
        <div className="mx-auto max-w-7xl space-y-6">
            <PageHeader
                eyebrow="Home · role-based command center"
                title="Home"
                description="See what requires attention, what changed, what is blocked, and which governed action comes next."
                secondaryActions={[{ label: 'Customize Home', onClick: () => setCustomizeModalOpen(true) }]}
                meta={<StatusBadge tone={blockedTaskCount ? 'warning' : 'success'}>{blockedTaskCount ? `${blockedTaskCount} blocked` : 'No blockers recorded'}</StatusBadge>}
            />
            <section className="grid gap-3 sm:grid-cols-3" aria-label="Home attention summary">
                <div className="av-stat-strip"><p className="av-eyebrow">Open work</p><p className="mt-2 text-2xl font-bold text-[var(--av-color-text)]">{openTaskCount}</p><p className="mt-1 text-xs text-[var(--av-color-text-muted)]">Authorized delivery records</p></div>
                <div className="av-stat-strip"><p className="av-eyebrow">Needs review</p><p className="mt-2 text-2xl font-bold text-[var(--av-color-text)]">{reviewTaskCount}</p><p className="mt-1 text-xs text-[var(--av-color-text-muted)]">Review or test states</p></div>
                <div className="av-stat-strip"><p className="av-eyebrow">Handoffs</p><p className="mt-2 text-2xl font-bold text-[var(--av-color-text)]">{props.handoffEntries?.length || 0}</p><p className="mt-1 text-xs text-[var(--av-color-text-muted)]">Recorded lifecycle transfers</p></div>
            </section>
            <div className="dashboard-grid">
                {visibleWidgets.map(widgetId => renderWidget(widgetId))}
            </div>

            <div className="mt-8">
                <HandoffLedgerPanel entries={props.handoffEntries || []} title="Lifecycle Handoff Ledger" compact />
            </div>

            <CustomizeDashboardModal
                isOpen={isCustomizeModalOpen}
                onClose={() => setCustomizeModalOpen(false)}
                allWidgets={WIDGET_DEFINITIONS}
                visibleWidgets={visibleWidgets}
                onSave={handleSaveLayout}
            />
        </div>
    );
};

export default CustomDashboardView;
