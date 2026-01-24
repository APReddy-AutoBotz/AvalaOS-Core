
import React from 'react';
import { Task, Project, TaskPriority, TaskStatus, Epic } from '../types';
import { ClockIcon, ArrowUpIcon, MinusIcon, ArrowDownIcon, ClipboardDocumentListIcon, TrashIcon } from './icons';

interface TaskCardProps {
    task: Task;
    project: Project | undefined;
    epic: Epic | undefined;
    subtasks: Task[];
    showProjectLabel?: boolean;
    onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
    onSelectTask: () => void;
    onDeleteTask: (taskId: string) => void;
}

const priorityMap: Record<TaskPriority, { icon: React.FC<{ className?: string }>, color: string }> = {
    "High": { icon: ArrowUpIcon, color: "text-abz-red-500" },
    "Medium": { icon: MinusIcon, color: "text-abz-amber-500" },
    "Low": { icon: ArrowDownIcon, color: "text-slate-400" },
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

const TaskCard: React.FC<TaskCardProps> = ({ task, project, epic, subtasks, showProjectLabel = false, onDragStart, onSelectTask, onDeleteTask }) => {
    const priorityConfig = priorityMap[task.priority];
    const overdue = isOverdue(task);

    const completedSubtasks = subtasks.filter(st => st.status === 'Done').length;

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm('Are you sure you want to delete this task? This action is permanent.')) {
            onDeleteTask(task.id);
        }
    };

    return (
        <div 
            data-status={statusKebabCase(task.status)}
            className="p-4 rounded-2xl cursor-pointer flex flex-col gap-2 group relative card"
            draggable="true"
            onDragStart={onDragStart}
            onClick={onSelectTask}
        >
             <div className="absolute top-2 right-2 z-10">
                <button 
                    onClick={handleDelete}
                    className="p-1.5 rounded-full text-slate-400 bg-white/50 dark:bg-surface-dark/50 backdrop-blur-sm hover:text-abz-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    title="Delete task"
                >
                    <TrashIcon className="w-4 h-4" />
                </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
                {showProjectLabel && project && (
                     <span className="text-xs font-semibold inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200">
                        {project.name}
                    </span>
                )}
                {epic && (
                    <span className="text-xs font-semibold inline-flex items-center px-2 py-0.5 rounded-full" style={{backgroundColor: `${epic.color}20`, color: epic.color}}>
                        {epic.name}
                    </span>
                )}
            </div>
            <p className="font-semibold text-sm text-text-light dark:text-text-dark">{task.title}</p>
            
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-gray-800/50">
                <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                    <span title={task.priority}>
                        <priorityConfig.icon className={`w-4 h-4 ${priorityConfig.color}`} />
                    </span>
                    {subtasks.length > 0 && (
                        <div className="flex items-center gap-1 text-xs" title={`${completedSubtasks}/${subtasks.length} subtasks completed`}>
                            <ClipboardDocumentListIcon className="w-4 h-4" />
                            <span>{completedSubtasks}/{subtasks.length}</span>
                        </div>
                    )}
                     {task.storyPoints && (
                         <div className="text-xs font-bold bg-slate-100 dark:bg-gray-700 rounded-full h-5 w-5 flex items-center justify-center" title={`${task.storyPoints} Story Points`}>
                            {task.storyPoints}
                        </div>
                    )}
                </div>
                <div className={`flex items-center gap-1 text-xs font-medium ${overdue ? 'text-abz-red-500' : 'text-slate-500 dark:text-slate-400'}`}>
                    <ClockIcon className="w-3 h-3" />
                    <span>{formatDate(task.dueDate)}</span>
                </div>
            </div>
        </div>
    );
};

export default TaskCard;