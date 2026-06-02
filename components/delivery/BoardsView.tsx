
import React, { useState, useMemo } from 'react';
import { Task, Project, TaskStatus, Epic, User } from '../../types';
import TaskCard from './TaskCard';
import InlineTaskCreator from './InlineTaskCreator';
import { ViewBoardsIcon } from '../shared/icons';
import { canCreateDeliveryTask, canDeleteDeliveryTask, canEditDeliveryTask } from '../../services/deliveryPolicy';

interface BoardsViewProps {
    tasks: Task[];
    projects: Project[];
    epics: Epic[];
    users?: User[];
    currentUser?: User;
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


const BoardsView: React.FC<BoardsViewProps> = ({ tasks, projects, epics, users = [], currentUser, showProjectLabel = false, onUpdateTaskStatus, onSelectTask, onAddTask, onDeleteTask }) => {
    const [draggedOverColumn, setDraggedOverColumn] = useState<string | null>(null); // format: "status-swimlaneId"
    const [swimlaneBy, setSwimlaneBy] = useState<'epic' | null>('epic');
    
    const isGrouped = swimlaneBy === 'epic';
    
    const getProjectForTask = (projectId: string) => projects.find(p => p.id === projectId);
    const getEpicForTask = (epicId: string | undefined) => epicId ? epics.find(e => e.id === epicId) : undefined;
    const getSubtasks = (subtaskIds: string[] | undefined) => subtaskIds ? tasks.filter(t => subtaskIds.includes(t.id)) : [];

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
        const task = tasks.find(item => item.id === taskId);
        if (currentUser && task && !canEditDeliveryTask(currentUser, task)) {
            e.preventDefault();
            return;
        }
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

    const boardStats = useMemo(() => {
        const openTasks = topLevelTasks.filter(task => task.status !== 'Done');
        const blocked = topLevelTasks.filter(task => task.status === 'Blocked').length;
        const review = topLevelTasks.filter(task => ['In Review', 'Testing', 'Ready for Release'].includes(task.status)).length;
        const done = topLevelTasks.filter(task => task.status === 'Done').length;
        return { open: openTasks.length, blocked, review, done, total: topLevelTasks.length };
    }, [topLevelTasks]);
    const statCards: { label: string; value: number; color: string }[] = [
        { label: 'Open', value: boardStats.open, color: 'text-slate-600 dark:text-slate-300' },
        { label: 'Blocked', value: boardStats.blocked, color: 'text-red-500' },
        { label: 'Review', value: boardStats.review, color: 'text-violet-500' },
        { label: 'Done', value: boardStats.done, color: 'text-emerald-500' },
    ];

    return (
        <div style={{height: 'calc(100vh - 150px)'}} className="flex flex-col">
            <div className="flex-shrink-0 mb-5 flex flex-wrap items-center justify-between gap-3">
                <button 
                    onClick={() => setSwimlaneBy(isGrouped ? null : 'epic')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-black rounded-2xl transition-colors duration-200 focus:outline-none focus:ring-3 focus:ring-abz-indigo-500
                        ${isGrouped 
                            ? 'bg-abz-indigo-100 text-abz-indigo-600 dark:bg-abz-indigo-500/20 dark:text-abz-indigo-100' 
                            : 'bg-white dark:bg-surface-dark border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-abz-ink-900'
                        }`
                    }
                >
                    <ViewBoardsIcon className="w-5 h-5" />
                    <span>Group by Epic: {isGrouped ? 'On' : 'Off'}</span>
                </button>
                <div className="grid grid-cols-4 gap-2">
                    {statCards.map(({ label, value, color }) => (
                        <div key={label} className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2 text-center shadow-sm dark:border-slate-700/70 dark:bg-slate-900/60">
                            <div className={`text-lg font-black ${color}`}>{value}</div>
                            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex-1 overflow-auto">
                <div className="space-y-5 pb-4">
                    {swimlanes.map(swimlane => (
                        <div key={swimlane.id} className="rounded-[22px] border border-slate-200/80 bg-white/45 p-3 shadow-sm dark:border-slate-700/60 dark:bg-slate-950/25">
                            {isGrouped && (
                                <div className="flex items-center justify-between gap-3 mb-3 px-1">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm" style={{ backgroundColor: swimlane.color || '#94a3b8' }}></div>
                                        <h3 className="font-black text-sm text-slate-950 dark:text-white truncate">{swimlane.title}</h3>
                                    </div>
                                    <span className="text-xs font-black text-slate-500 bg-slate-100 dark:bg-surface-dark dark:text-slate-300 rounded-full px-2.5 py-1">
                                        {swimlane.tasks.length}
                                    </span>
                                </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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
                                            className={`flex flex-col transition-colors duration-200 relative rounded-2xl border border-slate-200/80 bg-slate-50/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-slate-700/60 dark:bg-slate-900/45 ${draggedOverColumn === `${status}-${swimlane.id}` ? 'ring-2 ring-[#ffbc03]/70 dark:ring-[#ffbc03]/50' : ''}`}
                                            onDragOver={handleDragOver}
                                            onDrop={(e) => handleDrop(e, status)}
                                            onDragEnter={() => handleDragEnter(status, swimlane.id)}
                                            onDragLeave={handleDragLeave}
                                        >
                                            <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-full ${dataColMap[status] === 'todo' ? 'bg-slate-400' : dataColMap[status] === 'doing' ? 'bg-blue-500' : dataColMap[status] === 'review' ? 'bg-violet-500' : 'bg-emerald-500'}`}></div>
                                            <div className={`px-4 py-3 flex-shrink-0 ${isOverLimit ? 'bg-amber-500/10' : ''}`}>
                                                <div className="flex items-center justify-between">
                                                    <h3 className="font-black text-sm text-slate-900 dark:text-white">{status}</h3>
                                                    <span className={`text-xs font-black rounded-full px-2.5 py-1 ${isOverLimit ? 'text-white bg-amber-500' : 'text-slate-500 bg-white dark:bg-slate-800 dark:text-slate-300'}`}>
                                                        {columnTasks.length}{wipLimit !== undefined ? `/${wipLimit}` : ''}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex-1 space-y-3 px-4 pb-4 min-h-[88px] max-h-[360px] overflow-y-auto">
                                                {columnTasks.map(task => (
                                                    <TaskCard 
                                                        key={task.id} 
                                                        task={task} 
                                                        project={getProjectForTask(task.projectId)} 
                                                        epic={getEpicForTask(task.epicId)}
                                                        users={users}
                                                        subtasks={getSubtasks(task.subtaskIds)}
                                                        showProjectLabel={showProjectLabel}
                                                        canDrag={!currentUser || canEditDeliveryTask(currentUser, task)}
                                                        canDelete={!currentUser || canDeleteDeliveryTask(currentUser)}
                                                        onDragStart={(e) => handleDragStart(e, task.id)}
                                                        onSelectTask={() => onSelectTask(task)}
                                                        onDeleteTask={onDeleteTask}
                                                    />
                                                ))}
                                                {columnTasks.length === 0 && (
                                                    <div className="rounded-xl border border-dashed border-slate-200 bg-white/45 px-3 py-4 text-center text-xs font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-950/20">
                                                        No work in this step
                                                    </div>
                                                )}
                                                {(!currentUser || canCreateDeliveryTask(currentUser)) && (
                                                    <InlineTaskCreator
                                                        onAddTask={(title) => onAddTask({
                                                            title,
                                                            projectId: projects[0]?.id,
                                                            status: status,
                                                            epicId: swimlane.id !== 'unassigned' ? swimlane.id : undefined,
                                                        })}
                                                        buttonText="Add task"
                                                    />
                                                )}
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
