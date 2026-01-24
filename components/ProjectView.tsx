import React from 'react';
import { View, Project, Task, Epic, Sprint, User, Automation, TimesheetEntry, TaskStatus, DocumentGeneration, DocTemplate, AiProviderType } from '../types';
import BoardsView from './BoardsView';
import TaskListView from './TaskListView';
import GanttChartView from './GanttChartView';
import CalendarView from './CalendarView';
import RoadmapView from './RoadmapView';
import BacklogView from './BacklogView';
import SprintPlanningView from './SprintPlanningView';
import WorkloadView from './WorkloadView';
import AutomationsView from './AutomationsView';
import TimesheetsView from './TimesheetsView';
import ReportsView from './ReportsView';
import DocsView from './DocsView';

interface ProjectViewProps {
    view: View;
    project: Project;
    tasks: Task[];
    epics: Epic[];
    sprints: Sprint[];
    users: User[];
    currentUser: User;
    automations: Automation[];
    timesheetEntries: TimesheetEntry[];
    docTemplates: DocTemplate[];
    documentGenerations: DocumentGeneration[];
    userApiKey: string | null;
    aiProviderType: AiProviderType;
    onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
    onUpdateTask: (updatedTask: Task) => void;
    onSelectTask: (task: Task) => void;
    onUpdateTaskSprint: (taskId: string, sprintId: string | null) => void;
    onReorderTask: (taskIdToMove: string, referenceTaskId: string | null, newEpicId: string) => void;
    onAddTask: (taskDetails: Pick<Task, 'title' | 'projectId'> & Partial<Omit<Task, 'title' | 'projectId'>>) => void;
    onDeleteTask: (taskId: string) => void;
    onCreateAutomation: (automation: Omit<Automation, 'id'>) => void;
    onUpdateAutomation: (automation: Automation) => void;
    onDeleteAutomation: (automationId: string) => void;
    onToggleAutomation: (automationId: string, isEnabled: boolean) => void;
    onUpdateTimesheet: (userId: string, taskId: string, date: string, hours: number) => void;
    onViewGeneration: (generationId: string) => void;
}

const ProjectView: React.FC<ProjectViewProps> = (props) => {
    const { 
        view, project, tasks, epics, sprints, users, currentUser, automations, timesheetEntries, 
        docTemplates, documentGenerations, userApiKey, aiProviderType,
        onUpdateTaskStatus, onUpdateTask, onSelectTask, onUpdateTaskSprint, onReorderTask, onAddTask, onDeleteTask,
        onCreateAutomation, onUpdateAutomation, onDeleteAutomation, onToggleAutomation, onUpdateTimesheet,
        onViewGeneration
    } = props;

    const renderCurrentView = () => {
        switch (view) {
            case View.BOARDS:
                return <BoardsView tasks={tasks} projects={[project]} epics={epics} onUpdateTaskStatus={onUpdateTaskStatus} onSelectTask={onSelectTask} onAddTask={onAddTask} onDeleteTask={onDeleteTask} />;
            case View.LIST:
                return <TaskListView tasks={tasks} projects={[project]} onSelectTask={onSelectTask} onDeleteTask={onDeleteTask} />;
            case View.GANTT:
                return <GanttChartView tasks={tasks} projects={[project]} onSelectTask={onSelectTask} onUpdateTask={onUpdateTask} />;
            case View.CALENDAR:
                return <CalendarView tasks={tasks} projects={[project]} onSelectTask={onSelectTask} />;
            case View.ROADMAP:
                return <RoadmapView tasks={tasks} epics={epics} />;
            case View.BACKLOG:
                return <BacklogView project={project} tasks={tasks} epics={epics} onSelectTask={onSelectTask} onReorderTask={onReorderTask} onAddTask={onAddTask} onDeleteTask={onDeleteTask} />;
            case View.SPRINT_PLANNING:
                return <SprintPlanningView 
                            project={project} 
                            tasks={tasks} 
                            sprints={sprints} 
                            users={users}
                            onSelectTask={onSelectTask} 
                            onUpdateTaskSprint={onUpdateTaskSprint} 
                            onAddTask={onAddTask} 
                            onDeleteTask={onDeleteTask} 
                            onUpdateTask={onUpdateTask}
                            userApiKey={userApiKey}
                            aiProviderType={aiProviderType}
                        />;
            case View.WORKLOAD:
                return <WorkloadView tasks={tasks} users={users.filter(u => tasks.some(t => t.assigneeIds.includes(u.id)))} />;
            case View.AUTOMATIONS:
                return <AutomationsView project={project} automations={automations} users={users} onCreate={onCreateAutomation} onUpdate={onUpdateAutomation} onDelete={onDeleteAutomation} onToggle={onToggleAutomation} />;
            case View.TIMESHEETS:
                return <TimesheetsView project={project} tasks={tasks} currentUser={currentUser} timesheetEntries={timesheetEntries} onUpdateTimesheet={onUpdateTimesheet} />;
            case View.REPORTS:
                return <ReportsView />;
            case View.DOCS:
                 return <DocsView generations={documentGenerations} templates={docTemplates} onViewGeneration={onViewGeneration} />;
            default:
                return <div className="p-8 bg-white dark:bg-surface-dark rounded-2xl shadow-soft border border-slate-200 dark:border-gray-700">View "{view}" is not yet implemented for this scope.</div>;
        }
    };
    
    return (
        <div>
            {renderCurrentView()}
        </div>
    );
};

export default ProjectView;