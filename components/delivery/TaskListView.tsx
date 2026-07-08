
import React from 'react';
import { Task, Project, TaskStatus, TaskPriority } from '../../types';
import { ClockIcon, ArrowPathIcon, BanIcon, SparklesIcon, CheckCircleIcon, ArrowUpIcon, MinusIcon, ArrowDownIcon, TrashIcon, FireIcon, EyeIcon } from '../shared/icons';

interface TaskListViewProps {
    tasks: Task[];
    projects: Project[];
    onSelectTask: (task: Task) => void;
    onDeleteTask: (taskId: string) => void;
}

const statusMap: Record<TaskStatus, { icon: React.FC<{ className?: string }>, color: string, animate?: boolean }> = {
    "To Do": { icon: SparklesIcon, color: "text-abz-slate-500" },
    "In Progress": { icon: ArrowPathIcon, color: "text-abz-azure-500", animate: true },
    "In Review": { icon: EyeIcon, color: "text-abz-violet-500" },
    "Testing": { icon: SparklesIcon, color: "text-abz-indigo-500" },
    "Ready for Release": { icon: FireIcon, color: "text-abz-teal-500" },
    "Done": { icon: CheckCircleIcon, color: "text-abz-emerald-500" },
    "Blocked": { icon: BanIcon, color: "text-abz-red-500" },
    "On Hold": { icon: ClockIcon, color: "text-abz-amber-500" },
};

const statusKebabCase = (status: TaskStatus) => status.toLowerCase().replace(/ /g, '-');

const priorityMap: Record<TaskPriority, { icon: React.FC<{ className?: string }>, color: string }> = {
    "High": { icon: ArrowUpIcon, color: "text-abz-red-500" },
    "Medium": { icon: MinusIcon, color: "text-abz-amber-500" },
    "Low": { icon: ArrowDownIcon, color: "text-slate-400" },
};

const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
};

const isOverdue = (task: Task) => {
    if (task.status === 'Done') return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(task.dueDate) < today;
}

const TaskListView: React.FC<TaskListViewProps> = ({ tasks, projects, onSelectTask, onDeleteTask }) => {
    const getProjectName = (projectId: string) => {
        return projects.find(p => p.id === projectId)?.name || 'Unknown Project';
    }
    
    const handleDelete = (e: React.MouseEvent, taskId: string) => {
        e.stopPropagation();
        if (window.confirm('Remove this task from active delivery views? Retained lineage and audit metadata stay in source state.')) {
            onDeleteTask(taskId);
        }
    };


    if (tasks.length === 0) {
        return (
            <div className="text-center py-16 premium-surface rounded-2xl">
                <SparklesIcon className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
                <h3 className="mt-4 text-lg font-semibold">All Clear!</h3>
                <p className="text-slate-500 dark:text-slate-400">There are no tasks in this view.</p>
            </div>
        )
    }

    return (
        <div className="premium-surface rounded-2xl overflow-hidden">
            <div className="grid grid-cols-[1fr_9rem_6rem_6rem_3rem] gap-4 px-5 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400 border-b border-slate-200/80 dark:border-slate-700/70">
                <span>Work item</span>
                <span>Status</span>
                <span>Priority</span>
                <span>Due</span>
                <span></span>
            </div>
            <div className="space-y-1 p-2">
                {tasks.map(task => {
                    const statusConfig = statusMap[task.status];
                    const priorityConfig = priorityMap[task.priority];
                    const overdue = isOverdue(task);

                    return (
                        <div 
                            key={task.id} 
                            data-status={statusKebabCase(task.status)}
                            className="grid grid-cols-[1fr_9rem_6rem_6rem_3rem] gap-4 items-center rounded-xl px-3 py-3 transition-colors cursor-pointer group hover:bg-white dark:hover:bg-slate-900/80"
                            onClick={() => onSelectTask(task)}
                        >
                            <div className="flex items-center gap-4 min-w-0">
                                <span title={task.status} className="flex-shrink-0">
                                    <statusConfig.icon className={`w-5 h-5 ${statusConfig.color} ${statusConfig.animate ? 'animate-spin' : ''}`} />
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="font-black truncate text-slate-950 dark:text-white">{task.title}</p>
                                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{getProjectName(task.projectId)} / {task.type}</p>
                                </div>
                            </div>
                            <span className={`text-sm font-black ${statusConfig.color}`}>{task.status}</span>
                            <span title={task.priority} className="flex items-center gap-1 text-sm font-bold text-slate-600 dark:text-slate-300">
                                <priorityConfig.icon className={`w-4 h-4 ${priorityConfig.color}`} />
                                {task.priority}
                            </span>
                            <span className={`text-sm font-black ${overdue ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>
                                {formatDate(task.dueDate)}
                            </span>
                            <button onClick={(e) => handleDelete(e, task.id)} className="p-2 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default TaskListView;
