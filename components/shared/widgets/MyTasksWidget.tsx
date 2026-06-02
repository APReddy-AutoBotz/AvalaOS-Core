import React from 'react';
import { Task, Project, TaskStatus, TaskPriority, ALL_PRIORITIES } from '../../../types';
import WidgetWrapper from './WidgetWrapper';
import { ClipboardListIcon, CircleIcon, ArrowPathIcon, EyeIcon, SparklesIcon, FireIcon, CheckCircleIcon, BanIcon, ClockIcon, ArrowUpIcon, MinusIcon, ArrowDownIcon } from '../icons';

interface MyTasksWidgetProps {
    tasks: Task[];
    projects: Project[];
    onSelectTask: (task: Task) => void;
    config: { selectedPriorities?: TaskPriority[] };
    onUpdateConfig: (config: { selectedPriorities: TaskPriority[] }) => void;
    isConfiguring?: boolean;
    onToggleConfigure?: () => void;
}

const statusMap: Record<TaskStatus, { icon: React.FC<{ className?: string }> }> = {
    "To Do": { icon: CircleIcon }, "In Progress": { icon: ArrowPathIcon }, "In Review": { icon: EyeIcon },
    "Testing": { icon: SparklesIcon }, "Ready for Release": { icon: FireIcon }, "Done": { icon: CheckCircleIcon },
    "Blocked": { icon: BanIcon }, "On Hold": { icon: ClockIcon },
};

const priorityMap: Record<TaskPriority, { icon: React.FC<{ className?: string }>, color: string }> = {
    "High": { icon: ArrowUpIcon, color: "text-abz-red-500" },
    "Medium": { icon: MinusIcon, color: "text-abz-amber-500" },
    "Low": { icon: ArrowDownIcon, color: "text-slate-400" },
};

const TaskItem: React.FC<{ task: Task, project?: Project, onSelectTask: (task: Task) => void }> = ({ task, project, onSelectTask }) => {
    const StatusIcon = statusMap[task.status].icon;
    const PriorityIcon = priorityMap[task.priority].icon;

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const correctedDate = new Date(date.valueOf() + date.getTimezoneOffset() * 60000);
        return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(correctedDate);
    };

    return (
        <div onClick={() => onSelectTask(task)} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-abz-ink cursor-pointer">
            <div className="flex items-center gap-3 min-w-0">
                <StatusIcon className="w-5 h-5 flex-shrink-0 text-slate-500" />
                <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{task.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{project?.name}</p>
                </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{formatDate(task.dueDate)}</span>
                <PriorityIcon className={`w-5 h-5 ${priorityMap[task.priority].color}`} />
            </div>
        </div>
    );
}

const MyTasksWidget: React.FC<MyTasksWidgetProps> = ({ tasks, projects, onSelectTask, config, onUpdateConfig, isConfiguring, onToggleConfigure }) => {
    const selectedPriorities = config.selectedPriorities || ALL_PRIORITIES;

    const handlePriorityToggle = (priority: TaskPriority) => {
        const newSelection = selectedPriorities.includes(priority)
            ? selectedPriorities.filter(p => p !== priority)
            : [...selectedPriorities, priority];
        onUpdateConfig({ selectedPriorities: newSelection });
    };

    const renderConfigUI = () => (
        <div>
            <label className="block text-sm font-semibold mb-2">Filter by Priority:</label>
            <div className="flex items-center gap-4">
                {ALL_PRIORITIES.map(priority => (
                    <label key={priority} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                            type="checkbox"
                            checked={selectedPriorities.includes(priority)}
                            onChange={() => handlePriorityToggle(priority)}
                            className="h-4 w-4 rounded border-gray-300 text-abz-primary focus:ring-abz-primary"
                        />
                        {priority}
                    </label>
                ))}
            </div>
        </div>
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const openTasks = tasks.filter(t => t.status !== 'Done' && selectedPriorities.includes(t.priority));

    const upcomingTasks = openTasks
        .filter(t => new Date(t.dueDate) >= today)
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .slice(0, 5);

    const overdueTasks = openTasks
        .filter(t => new Date(t.dueDate) < today)
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .slice(0, 5);

    return (
        <WidgetWrapper 
            icon={ClipboardListIcon} 
            title="My Tasks" 
            contentClassName="p-0"
            isConfigurable={true}
            isConfiguring={isConfiguring}
            onToggleConfigure={onToggleConfigure}
            childrenConfig={renderConfigUI()}
        >
            <div className="h-full flex flex-col">
                {overdueTasks.length > 0 && (
                    <div className="p-4">
                        <h4 className="font-semibold text-sm mb-1 text-abz-red-500">Overdue</h4>
                        <div className="space-y-1">
                            {overdueTasks.map(task => (
                                <TaskItem key={task.id} task={task} project={projects.find(p => p.id === task.projectId)} onSelectTask={onSelectTask} />
                            ))}
                        </div>
                    </div>
                )}
                 <div className="p-4 flex-1">
                    <h4 className="font-semibold text-sm mb-1">Upcoming</h4>
                    {upcomingTasks.length > 0 ? (
                        <div className="space-y-1">
                            {upcomingTasks.map(task => (
                                <TaskItem key={task.id} task={task} project={projects.find(p => p.id === task.projectId)} onSelectTask={onSelectTask} />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <SparklesIcon className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
                            <h4 className="mt-4 font-semibold">All caught up!</h4>
                            <p className="text-sm text-slate-500">No upcoming tasks match your filters.</p>
                        </div>
                    )}
                </div>
            </div>
        </WidgetWrapper>
    );
};

export default MyTasksWidget;
