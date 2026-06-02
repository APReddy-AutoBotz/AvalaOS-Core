import React, { useState, useMemo, useEffect } from 'react';
import { View, Task, Project, User, TaskStatus, Epic, Filters } from '../../types';
import TaskListView from './TaskListView';
import BoardsView from './BoardsView';
import GanttChartView from './GanttChartView';
import CalendarView from './CalendarView';
import FilterBar from '../shared/FilterBar';
import { SparklesIcon } from '../shared/icons';

interface MyWorkViewProps {
    view: View;
    allTasks: Task[];
    allProjects: Project[];
    allEpics: Epic[];
    currentUser: User;
    onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
    onUpdateTask: (task: Task) => void;
    onSelectTask: (task: Task) => void;
    onAddTask: (taskDetails: Pick<Task, 'title' | 'projectId'> & Partial<Omit<Task, 'title' | 'projectId'>>) => void;
    onDeleteTask: (taskId: string) => void;
    quickFilter: Filters | null;
    setQuickFilter: (filter: Filters | null) => void;
}

const MyWorkView: React.FC<MyWorkViewProps> = ({ view, allTasks, allProjects, allEpics, currentUser, onUpdateTaskStatus, onUpdateTask, onSelectTask, onAddTask, onDeleteTask, quickFilter, setQuickFilter }) => {
    const [filters, setFilters] = useState<Filters>({});

    useEffect(() => {
        if (quickFilter) {
            setFilters(quickFilter);
            setQuickFilter(null);
        }
    }, [quickFilter, setQuickFilter]);

    const myTasks = useMemo(() => allTasks.filter(task => task.assigneeIds.includes(currentUser.id)), [allTasks, currentUser.id]);

    const { filteredTasks, visibleProjects, visibleEpics } = useMemo(() => {
        const hasActiveFilters = Object.values(filters).some(val => val && (Array.isArray(val) ? val.length > 0 : true));

        if (!hasActiveFilters) {
            const visibleProjectIds = new Set(myTasks.map(t => t.projectId));
            const visibleEpicIds = new Set(myTasks.map(t => t.epicId).filter(Boolean));
            return {
                filteredTasks: myTasks,
                visibleProjects: allProjects.filter(p => visibleProjectIds.has(p.id)),
                visibleEpics: allEpics.filter(e => visibleEpicIds.has(e.id))
            };
        }

        const newFilteredTasks = myTasks.filter(task => {
            const projectMatch = !filters.projectIds || filters.projectIds.length === 0 || filters.projectIds.includes(task.projectId);
            const epicMatch = !filters.epicIds || filters.epicIds.length === 0 || (filters.epicIds.includes('unassigned') && !task.epicId) || (task.epicId && filters.epicIds.includes(task.epicId));
            const priorityMatch = !filters.priorities || filters.priorities.length === 0 || filters.priorities.includes(task.priority);
            const typeMatch = !filters.types || filters.types.length === 0 || filters.types.includes(task.type);
            const statusMatch = !filters.statuses || filters.statuses.length === 0 || filters.statuses.includes(task.status);

            const dateRangeMatch = (): boolean => {
                if (!filters.dateRange) return true;
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const taskDueDate = new Date(task.dueDate);
                // Correct for timezone issues with YYYY-MM-DD strings by aligning to local midnight
                const correctedTaskDueDate = new Date(taskDueDate.valueOf() + taskDueDate.getTimezoneOffset() * 60000);

                if (filters.dateRange === 'overdue') {
                    return correctedTaskDueDate < today && task.status !== 'Done';
                }
                if (filters.dateRange === 'dueSoon') {
                    const endOfWeek = new Date(today);
                    endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
                    return correctedTaskDueDate >= today && correctedTaskDueDate <= endOfWeek && task.status !== 'Done';
                }
                return true;
            };
            
            return projectMatch && epicMatch && priorityMatch && typeMatch && statusMatch && dateRangeMatch();
        });

        const visibleProjectIds = new Set(newFilteredTasks.map(t => t.projectId));
        const visibleEpicIds = new Set(newFilteredTasks.map(t => t.epicId).filter(Boolean));

        return {
            filteredTasks: newFilteredTasks,
            visibleProjects: allProjects.filter(p => visibleProjectIds.has(p.id)),
            visibleEpics: allEpics.filter(e => visibleEpicIds.has(e.id))
        };
    }, [myTasks, allProjects, allEpics, filters]);
    

    const renderView = () => {
        if (filteredTasks.length === 0) {
             return (
                <div className="text-center py-16 bg-white/50 dark:bg-surface-dark/50 rounded-2xl shadow-soft border border-slate-200 dark:border-gray-700">
                    <SparklesIcon className="w-20 h-20 mx-auto text-abz-primary/20 animate-pulse-glow" />
                    <h3 className="mt-4 text-lg font-semibold">All Clear!</h3>
                    <p className="text-slate-500 dark:text-slate-400">No tasks match your current filters.</p>
                </div>
            )
        }
        
        switch(view) {
            case View.LIST:
                return <TaskListView tasks={filteredTasks} projects={visibleProjects} onSelectTask={onSelectTask} onDeleteTask={onDeleteTask} />;
            case View.BOARDS:
                return <BoardsView tasks={filteredTasks} projects={visibleProjects} epics={visibleEpics} users={[currentUser]} currentUser={currentUser} onUpdateTaskStatus={onUpdateTaskStatus} onSelectTask={onSelectTask} onAddTask={onAddTask} onDeleteTask={onDeleteTask} showProjectLabel={true} />;
            case View.GANTT:
                return <GanttChartView tasks={filteredTasks} projects={visibleProjects} onSelectTask={onSelectTask} onUpdateTask={onUpdateTask} />;
            case View.CALENDAR:
                return <CalendarView tasks={filteredTasks} projects={visibleProjects} onSelectTask={onSelectTask} />;
            // Add other views later
            default:
                return (
                    <div className="p-8 bg-white dark:bg-surface-dark rounded-2xl shadow-soft border border-slate-200 dark:border-gray-700">
                        View "{view}" not implemented for My Work.
                    </div>
                );
        }
    };
    
    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-text-light dark:text-text-dark">My Work</h2>
                <FilterBar
                    filters={filters}
                    onFiltersChange={setFilters}
                    availableProjects={allProjects}
                    availableEpics={allEpics}
                />
            </div>
            {renderView()}
        </div>
    );
};

export default MyWorkView;
