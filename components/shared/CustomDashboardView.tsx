import React, { useState, useEffect } from 'react';
import { User, Task, Project, Sprint, Filters, WidgetType, WidgetDefinition, WidgetConfigs, WidgetConfig, HandoffLedgerEntry } from '../../types';
import { CogIcon } from './icons';
import HandoffLedgerPanel from './HandoffLedgerPanel';

import WelcomeWidget from './widgets/WelcomeWidget';
import StatsWidget from './widgets/StatsWidget';
import MyTasksWidget from './widgets/MyTasksWidget';
import ProjectHealthWidget from './widgets/ProjectHealthWidget';
import BurndownChartWidget from './widgets/BurndownChartWidget';
import TasksByStatusWidget from './widgets/TasksByStatusWidget';
import AiInsightsWidget from './widgets/AiInsightsWidget';
import CustomizeDashboardModal from './CustomizeDashboardModal';

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

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-text-light dark:text-text-dark">Dashboard</h2>
                <button
                    onClick={() => setCustomizeModalOpen(true)}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-2xl btn-ghost"
                >
                    <CogIcon className="w-5 h-5" />
                    <span>Customize</span>
                </button>
            </div>
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
