
import React from 'react';
import { Task, Project, TaskPriority, TaskStatus, Epic, User } from '../../types';
import { ClockIcon, ArrowUpIcon, MinusIcon, ArrowDownIcon, ClipboardDocumentListIcon, TrashIcon, BanIcon, CheckCircleIcon } from '../shared/icons';

interface TaskCardProps {
    task: Task;
    project: Project | undefined;
    epic: Epic | undefined;
    users?: User[];
    subtasks: Task[];
    showProjectLabel?: boolean;
    canDrag?: boolean;
    canDelete?: boolean;
    onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
    onSelectTask: () => void;
    onDeleteTask: (taskId: string) => void;
}

const priorityMap: Record<TaskPriority, { icon: React.FC<{ className?: string }>, color: string, badge: string, label: string }> = {
    "High": { icon: ArrowUpIcon, color: "text-red-500", badge: 'bg-red-50 text-red-700 border-red-100 dark:bg-red-500/10 dark:text-red-200 dark:border-red-500/20', label: 'High' },
    "Medium": { icon: MinusIcon, color: "text-amber-500", badge: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/20', label: 'Medium' },
    "Low": { icon: ArrowDownIcon, color: "text-slate-400", badge: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', label: 'Low' },
};

const statusBadgeMap: Partial<Record<TaskStatus, string>> = {
    'Blocked': 'bg-red-50 text-red-700 border-red-100 dark:bg-red-500/10 dark:text-red-200 dark:border-red-500/20',
    'On Hold': 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/20',
    'Done': 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/20',
};

const statusKebabCase = (status: TaskStatus) => status.toLowerCase().replace(/ /g, '-');


const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const adjustedDate = new Date(date.valueOf() + date.getTimezoneOffset() * 60 * 1000);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(adjustedDate);
};

const isOverdue = (task: Task) => {
    if (task.status === 'Done') return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDate = new Date(task.dueDate);
    taskDate.setHours(0, 0, 0, 0);
    return taskDate < today;
}

const getInitials = (name: string) => name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();

const TaskCard: React.FC<TaskCardProps> = ({ task, project, epic, users = [], subtasks, showProjectLabel = false, canDrag = true, canDelete = true, onDragStart, onSelectTask, onDeleteTask }) => {
    const priorityConfig = priorityMap[task.priority];
    const overdue = isOverdue(task);
    const completedSubtasks = subtasks.filter(st => st.status === 'Done').length;
    const assignees = users.filter(user => task.assigneeIds.includes(user.id));
    const visibleAssignees = assignees.slice(0, 3);
    const statusBadge = statusBadgeMap[task.status];

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm('Are you sure you want to delete this task? This action is permanent.')) {
            onDeleteTask(task.id);
        }
    };

    return (
        <div 
            data-status={statusKebabCase(task.status)}
            className={`task-card p-4 rounded-2xl cursor-pointer flex flex-col gap-3 group relative card border border-slate-200/80 bg-white/90 shadow-[0_10px_28px_rgba(15,23,42,0.07)] hover:shadow-[0_18px_42px_rgba(15,23,42,0.12)] dark:border-slate-700/70 dark:bg-slate-900/80 ${canDrag ? '' : 'cursor-default'}`}
            draggable={canDrag}
            onDragStart={onDragStart}
            onClick={onSelectTask}
        >
             {canDelete && <div className="absolute top-2 right-2 z-10">
                <button 
                    onClick={handleDelete}
                    className="p-1.5 rounded-full text-slate-400 bg-white/50 dark:bg-surface-dark/50 backdrop-blur-sm hover:text-abz-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    title="Delete task"
                >
                    <TrashIcon className="w-4 h-4" />
                </button>
            </div>}
            <div className="flex items-center gap-2 flex-wrap pr-7">
                {showProjectLabel && project && (
                     <span className="text-[11px] font-black inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {project.name}
                    </span>
                )}
                {epic && (
                    <span className="text-[11px] font-black inline-flex items-center px-2.5 py-1 rounded-full" style={{backgroundColor: `${epic.color}18`, color: epic.color}}>
                        {epic.name}
                    </span>
                )}
                {statusBadge && (
                    <span className={`text-[11px] font-black inline-flex items-center gap-1 px-2.5 py-1 rounded-full border ${statusBadge}`}>
                        {task.status === 'Blocked' && <BanIcon className="w-3.5 h-3.5" />}
                        {task.status === 'Done' && <CheckCircleIcon className="w-3.5 h-3.5" />}
                        {task.status}
                    </span>
                )}
            </div>
            <div>
                <p className="font-black text-sm leading-6 text-slate-950 dark:text-white">{task.title}</p>
                {task.description && (
                    <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">{task.description}</p>
                )}
            </div>

            <div className="flex items-center justify-between gap-3">
                <div className="flex -space-x-2">
                    {visibleAssignees.map(user => (
                        <span key={user.id} title={user.name} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-slate-800 to-slate-600 text-[10px] font-black text-white shadow-sm dark:border-slate-900">
                            {getInitials(user.name)}
                        </span>
                    ))}
                    {assignees.length > visibleAssignees.length && (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-[10px] font-black text-slate-500 dark:border-slate-900 dark:bg-slate-800 dark:text-slate-300">
                            +{assignees.length - visibleAssignees.length}
                        </span>
                    )}
                    {assignees.length === 0 && (
                        <span className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-400 dark:border-slate-700">Unassigned</span>
                    )}
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {task.type}
                </span>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-gray-800/70">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <span title={`${priorityConfig.label} priority`} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-black ${priorityConfig.badge}`}>
                        <priorityConfig.icon className={`w-3.5 h-3.5 ${priorityConfig.color}`} />
                        {priorityConfig.label}
                    </span>
                    {subtasks.length > 0 && (
                        <div className="flex items-center gap-1 text-[11px] font-bold" title={`${completedSubtasks}/${subtasks.length} subtasks completed`}>
                            <ClipboardDocumentListIcon className="w-3.5 h-3.5" />
                            <span>{completedSubtasks}/{subtasks.length}</span>
                        </div>
                    )}
                     {task.storyPoints && (
                         <div className="text-[11px] font-black bg-slate-100 dark:bg-gray-700 rounded-full px-2 py-1 flex items-center justify-center" title={`${task.storyPoints} Story Points`}>
                            {task.storyPoints} pts
                        </div>
                    )}
                </div>
                <div className={`flex items-center gap-1 text-[11px] font-black ${overdue ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>
                    <ClockIcon className="w-3 h-3" />
                    <span>{formatDate(task.dueDate)}</span>
                </div>
            </div>
        </div>
    );
};

export default TaskCard;
