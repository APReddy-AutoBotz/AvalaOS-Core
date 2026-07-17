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
    onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
    onSelectTask: () => void;
    onDeleteTask: (taskId: string) => void;
}

const priorityMap: Record<TaskPriority, { icon: React.FC<{ className?: string }>; color: string; badge: string; label: string }> = {
    High: { icon: ArrowUpIcon, color: 'text-red-500', badge: 'bg-red-50 text-red-700 border-red-100 dark:bg-red-500/10 dark:text-red-200 dark:border-red-500/20', label: 'High' },
    Medium: { icon: MinusIcon, color: 'text-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/20', label: 'Medium' },
    Low: { icon: ArrowDownIcon, color: 'text-slate-400', badge: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', label: 'Low' },
};

const statusBadgeMap: Partial<Record<TaskStatus, string>> = {
    Blocked: 'bg-red-50 text-red-700 border-red-100 dark:bg-red-500/10 dark:text-red-200 dark:border-red-500/20',
    'On Hold': 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/20',
    Done: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/20',
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
};

const getInitials = (name: string) => name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();

const TaskCard: React.FC<TaskCardProps> = ({
    task,
    project,
    epic,
    users = [],
    subtasks,
    showProjectLabel = false,
    canDrag = true,
    canDelete = true,
    onDragStart,
    onSelectTask,
    onDeleteTask,
}) => {
    const priorityConfig = priorityMap[task.priority];
    const overdue = isOverdue(task);
    const completedSubtasks = subtasks.filter(subtask => subtask.status === 'Done').length;
    const assignees = users.filter(user => task.assigneeIds.includes(user.id));
    const visibleAssignees = assignees.slice(0, 3);
    const primaryAssignee = visibleAssignees[0];
    const statusBadge = statusBadgeMap[task.status];
    const hasLineage = Boolean(task.sourceLineage);

    const handleDelete = (event: React.MouseEvent) => {
        event.stopPropagation();
        if (window.confirm('Remove this task from active delivery views? Retained lineage and audit metadata stay in source state.')) {
            onDeleteTask(task.id);
        }
    };

    return (
        <div
            data-status={statusKebabCase(task.status)}
            className={`task-card group relative flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_2px_8px_rgba(15,23,42,0.05)] transition hover:border-slate-300 hover:shadow-[0_6px_18px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-900/90 dark:hover:border-slate-600 ${canDrag ? 'cursor-pointer' : 'cursor-default'}`}
            draggable={canDrag}
            onDragStart={onDragStart}
            onClick={onSelectTask}
        >
            {canDelete && (
                <div className="absolute right-1.5 top-1.5 z-10">
                    <button
                        type="button"
                        onClick={handleDelete}
                        className="rounded-md bg-white/90 p-1.5 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:bg-slate-900/90 dark:hover:bg-red-500/10"
                        title="Remove from active delivery"
                    >
                        <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5 pr-6">
                {showProjectLabel && project && (
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {project.name}
                    </span>
                )}
                {epic && (
                    <span className="inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold" style={{ backgroundColor: `${epic.color}18`, color: epic.color }}>
                        {epic.name}
                    </span>
                )}
                {statusBadge && (
                    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold ${statusBadge}`}>
                        {task.status === 'Blocked' && <BanIcon className="h-3 w-3" />}
                        {task.status === 'Done' && <CheckCircleIcon className="h-3 w-3" />}
                        {task.status}
                    </span>
                )}
            </div>

            <div>
                <p className="text-sm font-extrabold leading-5 text-slate-950 dark:text-white">{task.title}</p>
                {task.description && (
                    <p className="mt-1 line-clamp-2 text-xs font-medium leading-[1.15rem] text-slate-500 dark:text-slate-400">{task.description}</p>
                )}
            </div>

            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    {primaryAssignee ? (
                        <>
                            <div className="flex -space-x-1.5">
                                {visibleAssignees.map(user => (
                                    <span key={user.id} title={user.name} className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-700 text-[9px] font-extrabold text-white dark:border-slate-900">
                                        {getInitials(user.name)}
                                    </span>
                                ))}
                            </div>
                            <span className="truncate text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                {primaryAssignee.name}{assignees.length > 1 ? ` +${assignees.length - 1}` : ''}
                            </span>
                        </>
                    ) : (
                        <span className="text-[11px] font-semibold text-slate-400">Unassigned</span>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    {hasLineage && (
                        <span className="rounded-md bg-emerald-50 px-1.5 py-1 text-[9px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" title="Source lineage retained">
                            Lineage
                        </span>
                    )}
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {task.type}
                    </span>
                </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                <div className="flex min-w-0 items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <span title={`${priorityConfig.label} priority`} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-bold ${priorityConfig.badge}`}>
                        <priorityConfig.icon className={`h-3 w-3 ${priorityConfig.color}`} />
                        {priorityConfig.label}
                    </span>
                    {subtasks.length > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold" title={`${completedSubtasks}/${subtasks.length} subtasks completed`}>
                            <ClipboardDocumentListIcon className="h-3.5 w-3.5" />
                            {completedSubtasks}/{subtasks.length}
                        </span>
                    )}
                    {task.storyPoints && (
                        <span className="rounded-md bg-slate-100 px-1.5 py-1 text-[10px] font-bold dark:bg-slate-800" title={`${task.storyPoints} story points`}>
                            {task.storyPoints} pts
                        </span>
                    )}
                </div>
                <div className={`flex shrink-0 items-center gap-1 text-[10px] font-bold ${overdue ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                    <ClockIcon className="h-3 w-3" />
                    <span>{overdue ? 'Overdue' : 'Due'} {formatDate(task.dueDate)}</span>
                </div>
            </div>
        </div>
    );
};

export default TaskCard;
