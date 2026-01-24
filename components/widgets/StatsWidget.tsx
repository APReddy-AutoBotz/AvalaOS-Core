import React from 'react';
import { Task, Filters } from '../../types';
import { FireIcon, ClockIcon, BanIcon, SparklesIcon } from '../icons';

interface StatsWidgetProps {
    tasks: Task[];
    onStatClick: (filter: Filters) => void;
}

const StatCard: React.FC<{ icon: React.FC<{className: string}>, label: string, value: number, color: string, onClick: () => void }> = ({ icon: Icon, label, value, color, onClick }) => (
    <button onClick={onClick} className="card p-4 flex items-center gap-4 text-left w-full h-full">
        <div className={`p-3 rounded-full bg-opacity-10 ${color.replace('text-', 'bg-')}`}>
            <Icon className={`w-6 h-6 ${color}`} />
        </div>
        <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
        </div>
    </button>
);


const StatsWidget: React.FC<StatsWidgetProps> = ({ tasks, onStatClick }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (7 - today.getDay()));

    const openTasks = tasks.filter(t => t.status !== 'Done');

    const activeTasks = tasks.filter(t => t.status === 'In Progress').length;
    const overdueTasks = openTasks.filter(t => new Date(t.dueDate) < today).length;
    const dueSoonTasks = openTasks.filter(t => {
        const dueDate = new Date(t.dueDate);
        return dueDate >= today && dueDate <= endOfWeek;
    }).length;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard icon={FireIcon} label="Active Tasks" value={activeTasks} color="text-abz-azure-500" onClick={() => onStatClick({ statuses: ['In Progress'] })} />
            <StatCard icon={ClockIcon} label="Due This Week" value={dueSoonTasks} color="text-abz-amber-500" onClick={() => onStatClick({ dateRange: 'dueSoon' })} />
            <StatCard icon={BanIcon} label="Overdue Tasks" value={overdueTasks} color="text-abz-red-500" onClick={() => onStatClick({ dateRange: 'overdue' })} />
            <StatCard icon={SparklesIcon} label="Total Open" value={openTasks.length} color="text-abz-indigo-500" onClick={() => onStatClick({ statuses: ['To Do', 'In Progress', 'In Review', 'Testing', 'Ready for Release', 'Blocked', 'On Hold'] })}/>
        </div>
    );
};

export default StatsWidget;