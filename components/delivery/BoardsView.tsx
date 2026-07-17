
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
    title?: string;
    contextLabel?: string;
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
};

const WIP_LIMITS: Partial<Record<TaskStatus, number>> = {
    'In Progress': 3,
    'In Review': 2,
};

const BoardsView: React.FC<BoardsViewProps> = ({
    tasks,
    projects,
    epics,
    title = 'Delivery control board',
    contextLabel = 'Authorized workspace',
    users = [],
    currentUser,
    showProjectLabel = false,
    onUpdateTaskStatus,
    onSelectTask,
    onAddTask,
    onDeleteTask,
}) => {
    const [draggedOverColumn, setDraggedOverColumn] = useState<string | null>(null);
    const [swimlaneBy, setSwimlaneBy] = useState<'epic' | null>('epic');
    const [searchQuery, setSearchQuery] = useState('');

    const isGrouped = swimlaneBy === 'epic';

    const getProjectForTask = (projectId: string) => projects.find(project => project.id === projectId);
    const getEpicForTask = (epicId: string | undefined) => epicId ? epics.find(epic => epic.id === epicId) : undefined;
    const getSubtasks = (subtaskIds: string[] | undefined) => subtaskIds ? tasks.filter(task => subtaskIds.includes(task.id)) : [];

    const handleDragStart = (event: React.DragEvent<HTMLDivElement>, taskId: string) => {
        const task = tasks.find(item => item.id === taskId);
        if (currentUser && task && !canEditDeliveryTask(currentUser, task)) {
            event.preventDefault();
            return;
        }
        event.dataTransfer.setData('taskId', taskId);
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>, newStatus: TaskStatus) => {
        const taskId = event.dataTransfer.getData('taskId');
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
            return [{ id: 'all', title: 'All tasks', tasks: topLevelTasks }];
        }

        const epicMap = new Map<string, { id: string; title: string; tasks: Task[]; color: string }>();
        epics.forEach(epic => epicMap.set(epic.id, { id: epic.id, title: epic.name, tasks: [], color: epic.color }));

        const unassignedTasks: Task[] = [];

        topLevelTasks.forEach(task => {
            if (task.epicId && epicMap.has(task.epicId)) {
                epicMap.get(task.epicId)!.tasks.push(task);
            } else {
                unassignedTasks.push(task);
            }
        });

        const epicSwimlanes = Array.from(epicMap.values()).filter(swimlane => swimlane.tasks.length > 0);

        if (unassignedTasks.length > 0) {
            epicSwimlanes.push({ id: 'unassigned', title: 'Tasks without epic', tasks: unassignedTasks, color: '#94a3b8' });
        }

        return epicSwimlanes;
    }, [isGrouped, epics, topLevelTasks]);

    const visibleSwimlanes = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();
        if (!normalizedQuery) return swimlanes;

        return swimlanes
            .map(swimlane => ({
                ...swimlane,
                tasks: swimlane.tasks.filter(task => {
                    const project = projects.find(item => item.id === task.projectId);
                    const epic = task.epicId ? epics.find(item => item.id === task.epicId) : undefined;
                    return [task.title, task.description, task.type, task.status, project?.name, epic?.name]
                        .filter(Boolean)
                        .some(value => String(value).toLowerCase().includes(normalizedQuery));
                }),
            }))
            .filter(swimlane => swimlane.tasks.length > 0);
    }, [epics, projects, searchQuery, swimlanes]);

    const boardStats = useMemo(() => {
        const openTasks = topLevelTasks.filter(task => task.status !== 'Done');
        const blocked = topLevelTasks.filter(task => task.status === 'Blocked').length;
        const review = topLevelTasks.filter(task => ['In Review', 'Testing', 'Ready for Release'].includes(task.status)).length;
        const done = topLevelTasks.filter(task => task.status === 'Done').length;
        return { open: openTasks.length, blocked, review, done, total: topLevelTasks.length };
    }, [topLevelTasks]);

    const statCards: { label: string; value: number; color: string }[] = [
        { label: 'Open', value: boardStats.open, color: 'text-slate-700 dark:text-slate-200' },
        { label: 'Blocked', value: boardStats.blocked, color: 'text-red-600 dark:text-red-400' },
        { label: 'Review', value: boardStats.review, color: 'text-violet-600 dark:text-violet-400' },
        { label: 'Done', value: boardStats.done, color: 'text-emerald-600 dark:text-emerald-400' },
    ];
    const visibleTaskCount = visibleSwimlanes.reduce((total, swimlane) => total + swimlane.tasks.length, 0);

    return (
        <div className="flex h-[calc(100vh-132px)] min-h-[560px] flex-col">
            <section className="mb-4 flex-shrink-0 border-b border-slate-200/90 pb-4 dark:border-slate-700/70">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div className="min-w-0">
                        <p className="text-xs font-bold text-[#0b4f7d] dark:text-sky-300">Avala Delivery - {contextLabel}</p>
                        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950 dark:text-white">{title}</h1>
                        <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500 dark:text-slate-400">
                            Approved work, ownership, review gates, and evidence-backed progress.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-4 dark:border-slate-700 dark:bg-slate-900">
                        {statCards.map(({ label, value, color }, index) => (
                            <div
                                key={label}
                                className={`flex min-w-[92px] items-center justify-between gap-3 px-3 py-2.5 ${index > 0 ? 'border-l border-slate-200 dark:border-slate-700' : ''}`}
                            >
                                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</span>
                                <span className={`text-base font-extrabold tabular-nums ${color}`}>{value}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <label className="min-w-[240px] flex-1 sm:max-w-sm">
                        <span className="sr-only">Search delivery work</span>
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={event => setSearchQuery(event.target.value)}
                            placeholder="Search work, epic, or project"
                            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition focus:border-[#0b4f7d] focus:ring-2 focus:ring-[#0b4f7d]/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={() => setSwimlaneBy(isGrouped ? null : 'epic')}
                        className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-[#0b4f7d]/20 ${
                            isGrouped
                                ? 'border-[#0b4f7d]/30 bg-[#0b4f7d]/8 text-[#0b4f7d] dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200'
                                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                        }`}
                    >
                        <ViewBoardsIcon className="h-4 w-4" />
                        <span>Group: {isGrouped ? 'Epic' : 'None'}</span>
                    </button>
                    <span className="ml-auto text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Showing {visibleTaskCount} of {boardStats.total} records
                    </span>
                </div>
            </section>

            <div className="flex-1 overflow-auto">
                <div className="space-y-4 pb-4">
                    {visibleSwimlanes.length === 0 && (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center dark:border-slate-700 dark:bg-slate-900/70">
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">No work matches this view</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Clear the search to restore all authorized delivery records.</p>
                        </div>
                    )}

                    {visibleSwimlanes.map(swimlane => (
                        <section key={swimlane.id} className="rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-950/30">
                            {isGrouped && (
                                <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-200 px-1 pb-3 dark:border-slate-700">
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: swimlane.color || '#94a3b8' }} />
                                        <h2 className="truncate text-sm font-extrabold text-slate-950 dark:text-white">{swimlane.title}</h2>
                                    </div>
                                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                                        {swimlane.tasks.length}
                                    </span>
                                </div>
                            )}

                            <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-4">
                                {statusColumns.map(status => {
                                    const columnTasks = swimlane.tasks.filter(task => statusColumnMap[task.status] === status);
                                    if (status === 'To Do') {
                                        columnTasks.sort((first, second) => {
                                            const firstIsPaused = first.status === 'Blocked' || first.status === 'On Hold';
                                            const secondIsPaused = second.status === 'Blocked' || second.status === 'On Hold';
                                            if (firstIsPaused && !secondIsPaused) return -1;
                                            if (!firstIsPaused && secondIsPaused) return 1;
                                            return new Date(first.dueDate).getTime() - new Date(second.dueDate).getTime();
                                        });
                                    }

                                    const wipLimit = WIP_LIMITS[status];
                                    const isOverLimit = wipLimit !== undefined && columnTasks.length > wipLimit;
                                    const columnAccent = dataColMap[status] === 'todo'
                                        ? 'bg-slate-400'
                                        : dataColMap[status] === 'doing'
                                            ? 'bg-blue-600'
                                            : dataColMap[status] === 'review'
                                                ? 'bg-violet-600'
                                                : 'bg-emerald-600';

                                    return (
                                        <div
                                            key={`${status}-${swimlane.id}`}
                                            data-col={dataColMap[status]}
                                            className={`relative overflow-hidden rounded-xl border bg-slate-50/80 transition dark:bg-slate-900/55 ${
                                                isOverLimit ? 'border-amber-400/80' : 'border-slate-200 dark:border-slate-700'
                                            } ${draggedOverColumn === `${status}-${swimlane.id}` ? 'ring-2 ring-[#0b4f7d]/35' : ''}`}
                                            onDragOver={handleDragOver}
                                            onDrop={event => handleDrop(event, status)}
                                            onDragEnter={() => handleDragEnter(status, swimlane.id)}
                                            onDragLeave={handleDragLeave}
                                        >
                                            <div className={`absolute inset-x-0 top-0 h-0.5 ${columnAccent}`} />
                                            <div className={`flex items-center justify-between border-b px-3 py-2.5 ${isOverLimit ? 'border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10' : 'border-slate-200 dark:border-slate-700'}`}>
                                                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{status}</h3>
                                                <span className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${isOverLimit ? 'bg-amber-500 text-white' : 'bg-white text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>
                                                    {columnTasks.length}{wipLimit !== undefined ? `/${wipLimit}` : ''}
                                                </span>
                                            </div>

                                            <div className="max-h-[400px] min-h-[76px] space-y-2.5 overflow-y-auto p-2.5">
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
                                                        onDragStart={event => handleDragStart(event, task.id)}
                                                        onSelectTask={() => onSelectTask(task)}
                                                        onDeleteTask={onDeleteTask}
                                                    />
                                                ))}

                                                {columnTasks.length === 0 && (
                                                    <div className="rounded-lg border border-dashed border-slate-300 bg-white/60 px-3 py-3 text-center text-xs font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-950/20">
                                                        No work in this step
                                                    </div>
                                                )}

                                                {(!currentUser || canCreateDeliveryTask(currentUser)) && (
                                                    <InlineTaskCreator
                                                        onAddTask={taskTitle => onAddTask({
                                                            title: taskTitle,
                                                            projectId: projects[0]?.id,
                                                            status,
                                                            epicId: swimlane.id !== 'unassigned' ? swimlane.id : undefined,
                                                        })}
                                                        buttonText="Add task"
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default BoardsView;
