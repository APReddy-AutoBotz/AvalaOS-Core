import React, { useState, useMemo } from 'react';
import { Project, Task, Sprint, User, AiSprintPlan } from '../../types';
import TaskCard from './TaskCard';
import InlineTaskCreator from './InlineTaskCreator';
import { MOCK_EPICS } from '../../data/mockData'; // temp import
import { SparklesIcon } from '../shared/icons';
import AiSprintPlanModal from './AiSprintPlanModal';

interface SprintPlanningViewProps {
    project: Project;
    tasks: Task[];
    sprints: Sprint[];
    users: User[];
    showProjectLabel?: boolean;
    onSelectTask: (task: Task) => void;
    onUpdateTaskSprint: (taskId: string, sprintId: string | null) => void;
    onUpdateSprint: (sprint: Sprint) => void;
    onAddTask: (taskDetails: Pick<Task, 'title' | 'projectId'> & Partial<Omit<Task, 'title' | 'projectId'>>) => void;
    onDeleteTask: (taskId: string) => void;
    onUpdateTask: (updatedTask: Task) => void;
}

const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const correctedDate = new Date(date.valueOf() + date.getTimezoneOffset() * 60000);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(correctedDate);
};

const getDaysBetween = (startDate: string, endDate: string): number => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
};

const SprintPlanningView: React.FC<SprintPlanningViewProps> = ({ project, tasks, sprints, users, showProjectLabel = false, onSelectTask, onUpdateTaskSprint, onUpdateSprint, onAddTask, onDeleteTask, onUpdateTask }) => {
    const [draggedOverId, setDraggedOverId] = useState<string | null>(null);
    const [isPlanning, setIsPlanning] = useState(false);
    const [sprintPlan, setSprintPlan] = useState<AiSprintPlan | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [targetSprintForAI, setTargetSprintForAI] = useState<Sprint | null>(null);

    const backlogTasks = useMemo(() => {
        return tasks.filter(task => !task.sprintId && !task.parentId)
                    .sort((a,b) => (b.storyPoints || 0) - (a.storyPoints || 0));
    }, [tasks]);

    const sprintsWithTasks = useMemo(() => {
        return sprints.map(sprint => ({
            ...sprint,
            tasks: tasks.filter(task => task.sprintId === sprint.id && !task.parentId),
            totalStoryPoints: tasks
                .filter(task => task.sprintId === sprint.id)
                .reduce((sum, task) => sum + (task.storyPoints || 0), 0)
        })).sort((a,b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    }, [sprints, tasks]);

    const activeOrNextSprint = useMemo(() => {
        return sprintsWithTasks.find(s => s.status === 'Active') || sprintsWithTasks.find(s => s.status === 'Upcoming');
    }, [sprintsWithTasks]);
    
    const allEpics = MOCK_EPICS; // temp
    const getEpicForTask = (epicId: string | undefined) => epicId ? allEpics.find(e => e.id === epicId) : undefined;
    const getSubtasks = (subtaskIds: string[] | undefined) => subtaskIds ? tasks.filter(t => subtaskIds.includes(t.id)) : [];


    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
        e.dataTransfer.setData("taskId", taskId);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetId: string | null) => {
        const taskId = e.dataTransfer.getData("taskId");
        if (taskId) {
            onUpdateTaskSprint(taskId, targetId);
        }
        setDraggedOverId(null);
    };

    const handlePlanSprint = async (sprint: Sprint) => {
        setIsPlanning(true);
        setTargetSprintForAI(sprint);
        try {
            throw new Error('AI sprint planning is disabled until the server-side AI workflow is implemented. Use manual sprint planning for this pilot-safe path.');
        } catch (error: any) {
            console.error("Failed to generate sprint plan:", error);
            alert(`Sorry, the AI could not generate a sprint plan: ${error.message}`);
        } finally {
            setIsPlanning(false);
        }
    };

     const handleAcceptPlan = () => {
        if (!sprintPlan || !targetSprintForAI) return;

        const taskUpdates = new Map<string, Partial<Task>>();

        sprintPlan.sprintTaskIds.forEach(taskId => {
            taskUpdates.set(taskId, { ...taskUpdates.get(taskId), sprintId: targetSprintForAI.id });
        });

        sprintPlan.taskAssignments.forEach(assignment => {
            taskUpdates.set(assignment.taskId, { ...taskUpdates.get(assignment.taskId), assigneeIds: [assignment.assigneeId] });
        });

        taskUpdates.forEach((updates, taskId) => {
            const originalTask = tasks.find(t => t.id === taskId);
            if (originalTask) {
                onUpdateTask({ ...originalTask, ...updates });
            }
        });

        setIsModalOpen(false);
        setSprintPlan(null);
        setTargetSprintForAI(null);
    };

    return (
        <>
            <div className="flex gap-6 h-full" style={{height: 'calc(100vh - 200px)'}}>
                {/* Sprints Panel */}
                <div className="w-2/3 flex flex-col gap-6 overflow-y-auto pr-2">
                    {sprintsWithTasks.map(sprint => {
                        const progress = sprint.capacity ? Math.min((sprint.totalStoryPoints / sprint.capacity) * 100, 100) : 0;
                        const isTargetForAI = sprint.id === activeOrNextSprint?.id;
                        return (
                            <div 
                                key={sprint.id} 
                                className={`p-4 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-gray-700 flex-shrink-0 transition-colors duration-200 ${draggedOverId === sprint.id ? 'bg-abz-primary/10' : ''}`}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, sprint.id)}
                                onDragEnter={() => setDraggedOverId(sprint.id)}
                                onDragLeave={() => setDraggedOverId(null)}
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="font-bold text-lg">{sprint.name}</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">
                                            {formatDate(sprint.startDate)} - {formatDate(sprint.endDate)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {sprint.status === 'Upcoming' && (
                                            <button
                                                onClick={() => onUpdateSprint({ ...sprint, status: 'Active' })}
                                                className="px-3 py-1.5 text-sm font-semibold text-white bg-abz-primary rounded-xl hover:bg-opacity-90"
                                            >
                                                Start Sprint
                                            </button>
                                        )}
                                        {sprint.status === 'Active' && (
                                            <button
                                                onClick={() => onUpdateSprint({ ...sprint, status: 'Completed' })}
                                                className="px-3 py-1.5 text-sm font-semibold text-abz-emerald-500 bg-abz-emerald-500/10 rounded-xl hover:bg-abz-emerald-500/15"
                                            >
                                                Complete Sprint
                                            </button>
                                        )}
                                        {isTargetForAI && (
                                            <button 
                                                onClick={() => handlePlanSprint(sprint)}
                                                disabled={isPlanning || backlogTasks.length === 0}
                                                className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold btn-primary disabled:opacity-50"
                                            >
                                                <SparklesIcon className={`w-5 h-5 ${isPlanning ? 'animate-spin' : ''}`} />
                                                <span>{isPlanning ? 'Thinking...' : 'Plan with AI'}</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="mb-4">
                                    <div className="flex justify-between items-baseline mb-1 text-sm">
                                        <span className="font-semibold">Capacity</span>
                                        <span>
                                            <span className="font-bold">{sprint.totalStoryPoints}</span> / {sprint.capacity || '∞'} Story Points
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-200 dark:bg-abz-ink rounded-full h-2">
                                        <div className={`h-2 rounded-full transition-all ${sprint.totalStoryPoints > (sprint.capacity || Infinity) ? 'bg-abz-red-500' : 'bg-abz-primary'}`} style={{ width: `${progress}%` }}></div>
                                    </div>
                                </div>
                                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-h-[60px]">
                                    {sprint.tasks.map(task => (
                                        <TaskCard 
                                            key={task.id} 
                                            task={task} 
                                            project={project} 
                                            epic={getEpicForTask(task.epicId)}
                                            subtasks={getSubtasks(task.subtaskIds)}
                                            showProjectLabel={showProjectLabel}
                                            onDragStart={(e) => handleDragStart(e, task.id)}
                                            onSelectTask={() => onSelectTask(task)}
                                            onDeleteTask={onDeleteTask}
                                        />
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Backlog Panel */}
                <div 
                    className={`w-1/3 bg-slate-50 dark:bg-abz-ink rounded-2xl flex flex-col transition-colors duration-200 ${draggedOverId === 'backlog' ? 'bg-abz-primary/10' : ''}`}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, null)}
                    onDragEnter={() => setDraggedOverId('backlog')}
                    onDragLeave={() => setDraggedOverId(null)}
                >
                    <div className="p-4 border-b border-slate-200 dark:border-gray-700 flex-shrink-0">
                        <h3 className="font-semibold text-md">Backlog</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{backlogTasks.length} items</p>
                    </div>
                    <div className="flex-1 space-y-4 p-4 overflow-y-auto">
                        {backlogTasks.map(task => (
                            <TaskCard 
                                key={task.id} 
                                task={task} 
                                project={project} 
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
                                projectId: project.id,
                            })}
                            buttonText="Add a task to backlog"
                        />
                    </div>
                </div>
            </div>
            {sprintPlan && (
                <AiSprintPlanModal 
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    plan={sprintPlan}
                    tasks={tasks}
                    users={users}
                    onAccept={handleAcceptPlan}
                />
            )}
        </>
    );
};

export default SprintPlanningView;
