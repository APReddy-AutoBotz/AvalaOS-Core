import React, { useState } from 'react';
import { Task, Project, Epic, TaskStatus, TaskPriority } from '../../types';
import { ClockIcon, ArrowPathIcon, BanIcon, SparklesIcon, CheckCircleIcon, ArrowUpIcon, MinusIcon, ArrowDownIcon, GripVerticalIcon, TrashIcon, FireIcon, EyeIcon, CodeBracketIcon, CircleIcon } from '../shared/icons';
import InlineTaskCreator from './InlineTaskCreator';

interface BacklogViewProps {
    project: Project;
    tasks: Task[];
    epics: Epic[];
    onSelectTask: (task: Task) => void;
    onReorderTask: (taskIdToMove: string, referenceTaskId: string | null, newEpicId: string) => void;
    onAddTask: (taskDetails: Pick<Task, 'title' | 'projectId'> & Partial<Omit<Task, 'title' | 'projectId'>>) => void;
    onDeleteTask: (taskId: string) => void;
}

const statusMap: Record<TaskStatus, { icon: React.FC<{ className?: string }>, color: string, animate?: boolean }> = {
    "To Do": { icon: CircleIcon, color: "text-slate-400" },
    "In Progress": { icon: CodeBracketIcon, color: "text-abz-azure-500", animate: false },
    "In Review": { icon: EyeIcon, color: "text-abz-violet-500" },
    "Testing": { icon: SparklesIcon, color: "text-abz-indigo-500" },
    "Ready for Release": { icon: FireIcon, color: "text-abz-teal-500" },
    "Done": { icon: CheckCircleIcon, color: "text-abz-emerald-500" },
    "Blocked": { icon: BanIcon, color: "text-abz-red-500" },
    "On Hold": { icon: ClockIcon, color: "text-abz-amber-500" },
};

const priorityMap: Record<TaskPriority, { icon: React.FC<{ className?: string }>, color: string }> = {
    "High": { icon: ArrowUpIcon, color: "text-abz-danger" },
    "Medium": { icon: MinusIcon, color: "text-abz-warn" },
    "Low": { icon: ArrowDownIcon, color: "text-slate-400" },
};

interface TaskRowProps {
    task: Task;
    isBeingDragged: boolean;
    onSelectTask: (task: Task) => void;
    onDeleteTask: (taskId: string) => void;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
}

const TaskRow: React.FC<TaskRowProps> = ({ task, isBeingDragged, onSelectTask, onDeleteTask, onDragStart, onDragEnd }) => {
    const statusConfig = statusMap[task.status];
    const priorityConfig = priorityMap[task.priority];
    const priorityTone = task.priority === 'High'
        ? 'bg-red-50 text-red-700 border-red-100 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900/60'
        : task.priority === 'Medium'
            ? 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900/60'
            : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700';
    
    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm('Are you sure you want to delete this task? This action is permanent.')) {
            onDeleteTask(task.id);
        }
    };

    return (
        <div 
            draggable="true"
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            className={`grid grid-cols-[1fr_9rem_7rem_5rem_3rem] items-center gap-4 rounded-xl px-4 py-3 group transition-all hover:bg-white dark:hover:bg-slate-900/80 ${isBeingDragged ? 'opacity-30' : 'opacity-100'}`}
        >
            <div className="flex items-center gap-3 min-w-0">
                <GripVerticalIcon className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 cursor-grab flex-shrink-0" />
                <span title={task.status} className="flex-shrink-0 cursor-pointer" onClick={() => onSelectTask(task)}>
                    <statusConfig.icon className={`w-5 h-5 ${statusConfig.color} ${statusConfig.animate ? 'animate-spin' : ''}`} />
                </span>
                <div className="min-w-0 cursor-pointer" onClick={() => onSelectTask(task)}>
                    <p className="font-black truncate text-sm text-slate-950 dark:text-white group-hover:text-abz-primary transition-colors">{task.title}</p>
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">{task.type}</p>
                </div>
            </div>
             <div className="text-sm font-black text-slate-600 dark:text-slate-300 cursor-pointer" onClick={() => onSelectTask(task)}>{task.status}</div>
             <div className="cursor-pointer" onClick={() => onSelectTask(task)}>
                <span title={task.priority} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-black ${priorityTone}`}>
                    <priorityConfig.icon className={`w-3.5 h-3.5 ${priorityConfig.color}`} />
                    {task.priority}
                </span>
             </div>
             <div className="text-right">
                <span className="inline-flex min-w-8 justify-center rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300 cursor-pointer" onClick={() => onSelectTask(task)}>
                    {task.storyPoints || '-'}
                </span>
             </div>
             <div className="flex justify-end">
                <button onClick={handleDelete} className="p-2 rounded-full text-slate-400 hover:text-abz-danger hover:bg-red-100 dark:hover:bg-red-900/50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                    <TrashIcon className="w-4 h-4" />
                </button>
             </div>
        </div>
    );
}

const EpicGroup: React.FC<{
    epic: Epic | { id: 'unassigned', name: string, color: string };
    tasks: Task[];
    dropTarget: { epicId: string, referenceTaskId: string | null } | null;
    draggedTaskId: string | null;
    onSelectTask: (task: Task) => void;
    onDeleteTask: (taskId: string) => void;
    onDragStart: (e: React.DragEvent, taskId: string) => void;
    onDragEnd: () => void;
    onReorderTask: (taskIdToMove: string, referenceTaskId: string | null, newEpicId: string) => void;
    onAddTask: (taskDetails: Pick<Task, 'title' | 'projectId'> & Partial<Omit<Task, 'title' | 'projectId'>>) => void;
    setDropTarget: (target: { epicId: string, referenceTaskId: string | null } | null) => void;
}> = (props) => {
    const { epic, tasks, dropTarget, draggedTaskId, onSelectTask, onDeleteTask, onDragStart, onDragEnd, onReorderTask, onAddTask, setDropTarget } = props;
    const epicTasks = tasks.filter(t => !t.parentId);

    const DropZone = ({ epicId, referenceTaskId }: { epicId: string, referenceTaskId: string | null }) => {
        const isDropTarget = dropTarget?.epicId === epicId && dropTarget.referenceTaskId === referenceTaskId;
        const handleDragEnter = (e: React.DragEvent) => {
            e.preventDefault();
            setDropTarget({ epicId, referenceTaskId });
        };
        const handleDragOver = (e: React.DragEvent) => e.preventDefault();
        const handleDrop = (e: React.DragEvent) => {
            e.preventDefault();
            const taskIdToMove = e.dataTransfer.getData("taskId");
            if (taskIdToMove && taskIdToMove !== referenceTaskId) {
                onReorderTask(taskIdToMove, referenceTaskId, epicId);
            }
            onDragEnd(); // Use the passed onDragEnd
        };
        if (!draggedTaskId) return null;
        return (
            <div onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDrop={handleDrop} className="h-2">
                <div className={`w-full rounded-full transition-all duration-150 ${isDropTarget ? 'h-1 bg-abz-primary' : 'h-0'}`}></div>
            </div>
        );
    };

    return (
        <div className="border-b border-slate-200/70 p-3 last:border-b-0 dark:border-slate-800/70">
            <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50/80 px-4 py-3 dark:bg-slate-900/70">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="h-3 w-3 rounded-full ring-4 ring-white dark:ring-slate-800" style={{ backgroundColor: epic.color }}></div>
                    <div className="min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Epic</span>
                        <h3 className="truncate text-sm font-black text-slate-950 dark:text-white">{epic.name}</h3>
                    </div>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-500 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">{epicTasks.length}</span>
            </div>
            <div className="min-h-[8px] pt-2" onDragEnter={() => setDropTarget({ epicId: epic.id, referenceTaskId: epicTasks[0]?.id || null })} onDragOver={(e) => e.preventDefault()}>
                <DropZone epicId={epic.id} referenceTaskId={epicTasks[0]?.id || null} />
                {epicTasks.map((task, index) => (
                    <div key={task.id}>
                        <TaskRow task={task} onSelectTask={onSelectTask} onDeleteTask={onDeleteTask} isBeingDragged={draggedTaskId === task.id} onDragStart={(e) => onDragStart(e, task.id)} onDragEnd={onDragEnd} />
                        <DropZone epicId={epic.id} referenceTaskId={epicTasks[index + 1]?.id || null} />
                    </div>
                ))}
                {epicTasks.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-4 text-sm font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-500">
                        No backlog items in this epic.
                        <DropZone epicId={epic.id} referenceTaskId={null} />
                    </div>
                )}
                <InlineTaskCreator
                    onAddTask={(title) => onAddTask({
                        title,
                        projectId: (epic as Epic).projectId, // This works because 'unassigned' is not passed here
                        epicId: epic.id !== 'unassigned' ? epic.id : undefined,
                    })}
                    buttonText="Add a task"
                    className="pl-4 pr-2 pt-2 pb-1"
                />
            </div>
        </div>
    );
};


const BacklogView: React.FC<BacklogViewProps> = ({ project, tasks, epics, onSelectTask, onReorderTask, onAddTask, onDeleteTask }) => {
    const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{ epicId: string, referenceTaskId: string | null } | null>(null);

    const handleDragStart = (e: React.DragEvent, taskId: string) => {
        e.dataTransfer.setData("taskId", taskId);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => setDraggedTaskId(taskId), 0);
    };

    const handleDragEnd = () => {
        setDraggedTaskId(null);
        setDropTarget(null);
    };

    const unassignedTasks = tasks.filter(t => !t.epicId);

    return (
        <div className="premium-surface overflow-hidden rounded-2xl">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/80 px-5 py-4 dark:border-slate-800/80">
                <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Prioritized backlog</p>
                    <h2 className="mt-1 text-lg font-black text-slate-950 dark:text-white">{project.name}</h2>
                </div>
                <div className="flex gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">{tasks.length} items</span>
                    <span className="rounded-full bg-[#ffbc03]/15 px-3 py-1 text-xs font-black text-[#002C4B] dark:bg-[#ffbc03]/10 dark:text-[#ffcf45]">{epics.length} epics</span>
                </div>
            </div>
            <div className="grid grid-cols-[1fr_9rem_7rem_5rem_3rem] gap-4 border-b border-slate-200/80 px-7 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400 dark:border-slate-800/80 dark:text-slate-500">
                <span>Work item</span>
                <span>Status</span>
                <span>Priority</span>
                <span className="text-right">Points</span>
                <span></span>
            </div>
            <div>
                {epics.map(epic => (
                    <EpicGroup
                        key={epic.id}
                        epic={epic}
                        tasks={tasks.filter(t => t.epicId === epic.id)}
                        dropTarget={dropTarget}
                        draggedTaskId={draggedTaskId}
                        onSelectTask={onSelectTask}
                        onDeleteTask={onDeleteTask}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onReorderTask={onReorderTask}
                        onAddTask={onAddTask}
                        setDropTarget={setDropTarget}
                    />
                ))}
                {unassignedTasks.length > 0 && (
                    <EpicGroup
                        epic={{ id: 'unassigned', name: 'Tasks without Epic', color: '#94a3b8' }}
                        tasks={unassignedTasks}
                        dropTarget={dropTarget}
                        draggedTaskId={draggedTaskId}
                        onSelectTask={onSelectTask}
                        onDeleteTask={onDeleteTask}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onReorderTask={onReorderTask}
                        onAddTask={onAddTask}
                        setDropTarget={setDropTarget}
                    />
                )}
            </div>
        </div>
    );
};

export default BacklogView;
