import React, { useState } from 'react';
import { Task, Project, Epic, TaskStatus, TaskPriority } from '../types';
import { ClockIcon, ArrowPathIcon, BanIcon, SparklesIcon, CheckCircleIcon, ArrowUpIcon, MinusIcon, ArrowDownIcon, GripVerticalIcon, TrashIcon, FireIcon, EyeIcon, CodeBracketIcon, CircleIcon } from './icons';
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
            className={`flex items-center py-3 px-2 border-b border-slate-200/80 dark:border-gray-800/60 group transition-opacity ${isBeingDragged ? 'opacity-30' : 'opacity-100'}`}
        >
            <div className="flex items-center gap-3 w-2/5 min-w-0">
                <GripVerticalIcon className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 cursor-grab flex-shrink-0" />
                <span title={task.status} className="flex-shrink-0 cursor-pointer" onClick={() => onSelectTask(task)}>
                    <statusConfig.icon className={`w-5 h-5 ${statusConfig.color} ${statusConfig.animate ? 'animate-spin' : ''}`} />
                </span>
                <p className="font-medium truncate text-sm cursor-pointer group-hover:text-abz-primary transition-colors" onClick={() => onSelectTask(task)}>{task.title}</p>
            </div>
             <div className="w-1/5 text-sm text-slate-500 dark:text-slate-400 cursor-pointer" onClick={() => onSelectTask(task)}>{task.status}</div>
             <div className="w-1/5 cursor-pointer" onClick={() => onSelectTask(task)}>
                <span title={task.priority} className="flex-shrink-0">
                    <priorityConfig.icon className={`w-5 h-5 ${priorityConfig.color}`} />
                </span>
             </div>
             <div className="w-1/5 flex items-center justify-end pr-4">
                <span className="text-sm font-bold text-slate-500 dark:text-slate-400 cursor-pointer" onClick={() => onSelectTask(task)}>
                    {task.storyPoints || '-'}
                </span>
                <button onClick={handleDelete} className="ml-4 p-2 rounded-full text-slate-400 hover:text-abz-danger hover:bg-red-100 dark:hover:bg-red-900/50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
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
        <div>
            <div className="flex items-center gap-3 p-3 border-b border-slate-200/80 dark:border-gray-800/60">
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: epic.color }}></div>
                <span className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">Epic</span>
                <h3 className="font-bold text-md text-text-light dark:text-text-dark">{epic.name}</h3>
            </div>
            <div className="min-h-[8px]" onDragEnter={() => setDropTarget({ epicId: epic.id, referenceTaskId: epicTasks[0]?.id || null })} onDragOver={(e) => e.preventDefault()}>
                <DropZone epicId={epic.id} referenceTaskId={epicTasks[0]?.id || null} />
                {epicTasks.map((task, index) => (
                    <div key={task.id}>
                        <TaskRow task={task} onSelectTask={onSelectTask} onDeleteTask={onDeleteTask} isBeingDragged={draggedTaskId === task.id} onDragStart={(e) => onDragStart(e, task.id)} onDragEnd={onDragEnd} />
                        <DropZone epicId={epic.id} referenceTaskId={epicTasks[index + 1]?.id || null} />
                    </div>
                ))}
                {epicTasks.length === 0 && <DropZone epicId={epic.id} referenceTaskId={null} />}
                <InlineTaskCreator
                    onAddTask={(title) => onAddTask({
                        title,
                        projectId: (epic as Epic).projectId, // This works because 'unassigned' is not passed here
                        epicId: epic.id !== 'unassigned' ? epic.id : undefined,
                    })}
                    buttonText="Add a task"
                    className="pl-4 pr-2 pt-1 pb-2"
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
        <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-soft border border-slate-200 dark:border-gray-700">
            <div className="flex items-center py-3 px-2 border-b-2 border-slate-200 dark:border-gray-700 font-semibold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <div className="w-2/5 pl-3 flex items-center gap-3">
                    <div className="w-5 h-5" /> {/* Spacer for grip */}
                    <div className="w-5 h-5" /> {/* Spacer for icon */}
                    <span>Title</span>
                </div>
                <div className="w-1/5">Status</div>
                <div className="w-1/5">Priority</div>
                <div className="w-1/5 text-right pr-12">Points</div>
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