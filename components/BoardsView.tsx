
import React, { useState, useMemo } from 'react';
import { Task, Project, TaskStatus, Epic } from '../types';
import TaskCard from './TaskCard';
import InlineTaskCreator from './InlineTaskCreator';
import { ViewBoardsIcon } from './icons';

interface BoardsViewProps {
    tasks: Task[];
    projects: Project[];
    epics: Epic[];
    showProjectLabel?: boolean;
    onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
    onSelectTask: (task: Task) => void;
    onAddTask: (taskDetails: Pick<Task, 'title' | 'projectId'> & Partial<Omit<Task, 'title' | 'projectId'>>) => void;
    onDeleteTask: (taskId: string) => void;
}

const statusColumns: TaskStatus[] = ['To Do', 'In Progress', 'In Review', 'Done'];

const statusColumnMap: Record<TaskStatus, TaskStatus | null> = {
    'To Do': 'To Do',
    'In Progress': 'In Progress',
    'In Review': 'In Review',
    'Testing': 'In Review',
    'Ready for Release': 'In Review',
    'Done': 'Done',
    'Blocked': 'In Progress',
    'On Hold': 'To Do',
};

const dataColMap: Record<TaskStatus, string> = {
    'To Do': 'todo',
    'In Progress': 'doing',
    'In Review': 'review',
    'Testing': 'test',
    'Ready for Release': 'ready',
    'Done': 'done',
    'Blocked': 'blocked',
    'On Hold': 'hold',
}

const WIP_LIMITS: Partial<Record<TaskStatus, number>> = {
    'In Progress': 3,
    'In Review': 2,
};


const BoardsView: React.FC<BoardsViewProps> = ({ tasks, projects, epics, showProjectLabel = false, onUpdateTaskStatus, onSelectTask, onAddTask, onDeleteTask }) => {
    const [draggedOverColumn, setDraggedOverColumn] = useState<string | null>(null); // format: "status-swimlaneId"
    const [swimlaneBy, setSwimlaneBy] = useState<'epic' | null>('epic');
    
    const isGrouped = swimlaneBy === 'epic';
    
    const getProjectForTask = (projectId: string) => projects.find(p => p.id === projectId);
    const getEpicForTask = (epicId: string | undefined) => epicId ? epics.find(e => e.id === epicId) : undefined;
    const getSubtasks = (subtaskIds: string[] | undefined) => subtaskIds ? tasks.filter(t => subtaskIds.includes(t.id)) : [];

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
        e.dataTransfer.setData("taskId", taskId);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };
    
    const handleDrop = (e: React.DragEvent<HTMLDivElement>, newStatus: TaskStatus) => {
        const taskId = e.dataTransfer.getData("taskId");
        onUpdateTaskStatus(taskId, newStatus);
        setDraggedOverColumn(null);
    };
    
    const handleDragEnter = (status: TaskStatus, swimlaneId: string) => {
        setDraggedOverColumn(`${status}-${swimlaneId}`);
    };

    const handleDragLeave = () => {
        setDraggedOverColumn(null);
    };
    
    const topLevelTasks = tasks.filter(task => !task.parentId);

    const swimlanes = useMemo(() => {
        if (!isGrouped) {
            return [{ id: 'all', title: 'All Tasks', tasks: topLevelTasks }];
        }

        const epicMap = new Map<string, { id: string, title: string, tasks: Task[], color: string }>();
        epics.forEach(e => epicMap.set(e.id, { id: e.id, title: e.name, tasks: [], color: e.color }));
        
        const unassignedTasks: Task[] = [];
        
        topLevelTasks.forEach(task => {
            if (task.epicId && epicMap.has(task.epicId)) {
                epicMap.get(task.epicId)!.tasks.push(task);
            } else {
                unassignedTasks.push(task);
            }
        });
        
        const epicSwimlanes = Array.from(epicMap.values()).filter(s => s.tasks.length > 0);
        
        if (unassignedTasks.length > 0) {
            epicSwimlanes.push({ id: 'unassigned', title: 'Tasks without Epic', tasks: unassignedTasks, color: '#94a3b8' });
        }

        return epicSwimlanes;

    }, [isGrouped, epics, topLevelTasks]);

    return (
        <div style={{height: 'calc(100vh - 160px)'}} className="flex flex-col">
            <div className="flex-shrink-0 mb-4">
                <button 
                    onClick={() => setSwimlaneBy(isGrouped ? null : 'epic')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-2xl transition-colors duration-200 focus:outline-none focus:ring-3 focus:ring-abz-indigo-500
                        ${isGrouped 
                            ? 'bg-abz-indigo-100 text-abz-indigo-600 dark:bg-abz-indigo-500/20 dark:text-abz-indigo-100' 
                            : 'bg-white dark:bg-surface-dark border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-abz-ink-900'
                        }`
                    }
                >
                    <ViewBoardsIcon className="w-5 h-5" />
                    <span>Group by Epic: {isGrouped ? 'On' : 'Off'}</span>
                </button>
            </div>
            <div className="flex-1 overflow-auto">
                <div className="space-y-6">
                    {swimlanes.map(swimlane => (
                        <div key={swimlane.id}>
                            {isGrouped && (
                                <div className="flex items-center gap-3 mb-2 px-2">
                                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: swimlane.color || '#94a3b8' }}></div>
                                    <h3 className="font-semibold text-md">{swimlane.title}</h3>
                                    <span className="text-sm font-bold text-slate-400 bg-slate-200 dark:bg-surface-dark dark:text-slate-300 rounded-full px-2 py-0.5">
                                        {swimlane.tasks.length}
                                    </span>
                                </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                {statusColumns.map(status => {
                                    const columnTasks = swimlane.tasks.filter(t => statusColumnMap[t.status] === status);
                                    if (status === 'To Do') {
                                        columnTasks.sort((a, b) => {
                                            const aIsOverdue = a.status === 'Blocked' || a.status === 'On Hold';
                                            const bIsOverdue = b.status === 'Blocked' || b.status === 'On Hold';
                                            if (aIsOverdue && !bIsOverdue) return -1;
                                            if (!aIsOverdue && bIsOverdue) return 1;
                                            return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
                                        });
                                    }
                                    const wipLimit = WIP_LIMITS[status];
                                    const isOverLimit = wipLimit !== undefined && columnTasks.length > wipLimit;

                                    return (
                                        <div 
                                            key={`${status}-${swimlane.id}`} 
                                            data-col={dataColMap[status]}
                                            className={`flex flex-col transition-colors duration-200 relative board-column ${draggedOverColumn === `${status}-${swimlane.id}` ? 'bg-abz-indigo-100/50 dark:bg-abz-indigo-500/10' : ''}`}
                                            onDragOver={handleDragOver}
                                            onDrop={(e) => handleDrop(e, status)}
                                            onDragEnter={() => handleDragEnter(status, swimlane.id)}
                                            onDragLeave={handleDragLeave}
                                        >
                                            <div className="rail"></div>
                                            <div className={`p-4 flex-shrink-0 ${isOverLimit ? 'bg-abz-amber-500/20' : ''}`}>
                                                <div className="flex items-center justify-between">
                                                    <h3 className="font-semibold text-md">{status}</h3>
                                                    <span className={`text-sm font-bold rounded-full px-2.5 py-0.5 ${isOverLimit ? 'text-white bg-abz-amber-500' : 'text-slate-400 bg-slate-200 dark:bg-surface-dark dark:text-slate-300'}`}>
                                                        {columnTasks.length}{wipLimit !== undefined ? `/${wipLimit}` : ''}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex-1 space-y-4 p-4 min-h-[150px] overflow-y-auto">
                                                {columnTasks.map(task => (
                                                    <TaskCard 
                                                        key={task.id} 
                                                        task={task} 
                                                        project={getProjectForTask(task.projectId)} 
                                                        epic={getEpicForTask(task.epicId)}
                                                        subtasks={getSubtasks(task.subtaskIds)}
                                                        showProjectLabel={showProjectLabel}
                                                        onDragStart={(e) => handleDragStart(e, task.id)}
                                                        onSelectTask={() => onSelectTask(task)}
                                                        onDeleteTask={onDeleteTask}
                                                    />
                                                ))}
                                                <InlineTaskCreator
                                                    onAddTask={(title) => onAddTask({
                                                        title,
                                                        projectId: projects[0]?.id, // Assumes a project context
                                                        status: status,
                                                        epicId: swimlane.id !== 'unassigned' ? swimlane.id : undefined,
                                                    })}
                                                    buttonText="Add a card"
                                                />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default BoardsView;