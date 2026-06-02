
import React from 'react';
import { Task, TaskStatus, ALL_STATUSES } from '../../../types';
import WidgetWrapper from './WidgetWrapper';
import { ChartPieIcon } from '../icons';
import { Tooltip } from '../ui/Tooltip';

interface TasksByStatusWidgetProps {
    tasks: Task[];
    config: { selectedStatuses?: TaskStatus[] };
    onUpdateConfig: (config: { selectedStatuses: TaskStatus[] }) => void;
    isConfiguring?: boolean;
    onToggleConfigure?: () => void;
}

const statusColors: Record<TaskStatus, string> = {
    'To Do': 'bg-slate-400',
    'In Progress': 'bg-abz-azure-500',
    'In Review': 'bg-abz-violet-500',
    'Testing': 'bg-abz-indigo-500',
    'Ready for Release': 'bg-abz-teal-500',
    'Done': 'bg-abz-emerald-500',
    'Blocked': 'bg-abz-red-500',
    'On Hold': 'bg-abz-amber-500',
};

const TasksByStatusWidget: React.FC<TasksByStatusWidgetProps> = ({ tasks, config, onUpdateConfig, isConfiguring, onToggleConfigure }) => {
    
    const selectedStatuses = config.selectedStatuses || ALL_STATUSES;

    const handleStatusToggle = (status: TaskStatus) => {
        const newSelection = selectedStatuses.includes(status)
            ? selectedStatuses.filter(s => s !== status)
            : [...selectedStatuses, status];
        onUpdateConfig({ selectedStatuses: newSelection });
    };

    const renderConfigUI = () => (
         <div>
            <label className="block text-sm font-semibold mb-2">Show Statuses:</label>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                {ALL_STATUSES.map(status => (
                    <label key={status} className="flex items-center gap-2 text-sm cursor-pointer p-1 rounded hover:bg-slate-200 dark:hover:bg-abz-ink-900">
                        <input
                            type="checkbox"
                            checked={selectedStatuses.includes(status)}
                            onChange={() => handleStatusToggle(status)}
                            className="h-4 w-4 rounded border-gray-300 text-abz-primary focus:ring-abz-primary"
                        />
                        {status}
                    </label>
                ))}
            </div>
        </div>
    );
    
    // Fix: Use the generic parameter for `reduce` to ensure `statusCounts` is correctly typed, preventing downstream errors with `Object.values`.
    const statusCounts = tasks.reduce((acc, task) => {
        if (selectedStatuses.includes(task.status)) {
            acc[task.status] = (acc[task.status] || 0) + 1;
        }
        return acc;
    }, {} as Record<TaskStatus, number>);

    const maxCount = Math.max(...(Object.values(statusCounts) as number[]), 1);

    return (
        <WidgetWrapper 
            icon={ChartPieIcon} 
            title="Tasks by Status"
            isConfigurable={true}
            isConfiguring={isConfiguring}
            onToggleConfigure={onToggleConfigure}
            childrenConfig={renderConfigUI()}
        >
            <div className="space-y-3 h-full flex flex-col justify-around">
                {selectedStatuses.map(status => {
                    const count = statusCounts[status] || 0;
                    const widthPercentage = (count / maxCount) * 100;
                    return (
                        <div key={status} className="flex items-center gap-3">
                            <span className="text-xs font-medium w-28 text-slate-600 dark:text-slate-300 truncate">{status}</span>
                            <div className="flex-1">
                                <Tooltip content={`${count} task${count !== 1 ? 's' : ''}`}>
                                    <div className="w-full bg-slate-100 dark:bg-abz-ink rounded-full h-5">
                                        <div 
                                            className={`${statusColors[status]} h-5 rounded-full flex items-center justify-end pr-2 text-white font-bold text-xs`}
                                            style={{ width: `${widthPercentage}%` }}
                                        >
                                           {count > 0 ? count : ''}
                                        </div>
                                    </div>
                                </Tooltip>
                            </div>
                        </div>
                    );
                })}
            </div>
        </WidgetWrapper>
    );
};

export default TasksByStatusWidget;
