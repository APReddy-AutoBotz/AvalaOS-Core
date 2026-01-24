
import React from 'react';
import { View, Team, User, Task, Project, Epic, TaskStatus } from '../types';
import BoardsView from './BoardsView';
import TaskListView from './TaskListView';

interface TeamViewProps {
    view: View;
    team: Team;
    members: User[];
    tasks: Task[];
    projects: Project[];
    epics: Epic[];
    onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
    onSelectTask: (task: Task) => void;
    onAddTask: (taskDetails: Pick<Task, 'title' | 'projectId'> & Partial<Omit<Task, 'title' | 'projectId'>>) => void;
    onDeleteTask: (taskId: string) => void;
}

const TeamView: React.FC<TeamViewProps> = (props) => {
    const { 
        view, team, members, tasks, projects, epics, 
        onUpdateTaskStatus, onSelectTask, onAddTask, onDeleteTask 
    } = props;
    
    // A simple team home view for the TEAMS view enum.
    const TeamHome = () => (
        <div className="bg-white dark:bg-surface-dark p-6 rounded-2xl shadow-soft border border-slate-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold">Team: {team.name}</h2>
            <p className="mt-2 text-slate-500">Members:</p>
            <ul className="mt-2 list-disc list-inside">
                {members.map(member => <li key={member.id}>{member.name}</li>)}
            </ul>
        </div>
    );

    const renderCurrentView = () => {
        switch (view) {
            case View.TEAMS:
                return <TeamHome />;
            case View.BOARDS:
                return <BoardsView tasks={tasks} projects={projects} epics={epics} onUpdateTaskStatus={onUpdateTaskStatus} onSelectTask={onSelectTask} onAddTask={onAddTask} onDeleteTask={onDeleteTask} showProjectLabel={true} />;
            case View.LIST:
                return <TaskListView tasks={tasks} projects={projects} onSelectTask={onSelectTask} onDeleteTask={onDeleteTask} />;
            default:
                 return <div className="p-8">View "{view}" is not available for this team.</div>;
        }
    };
    
    return (
        <div>
            {renderCurrentView()}
        </div>
    );
};

export default TeamView;
