
import React from 'react';
import { View, Team, User, Task, Project, Epic, TaskStatus } from '../../types';
import BoardsView from './BoardsView';
import TaskListView from './TaskListView';
import { filterActiveDeliveryTasks } from '../../services/deliveryWorkflowPolicy';

interface TeamViewProps {
    view: View;
    team: Team;
    members: User[];
    currentUser?: User;
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
        view, team, members, currentUser, tasks, projects, epics, 
        onUpdateTaskStatus, onSelectTask, onAddTask, onDeleteTask 
    } = props;
    
    const activeTasks = filterActiveDeliveryTasks(tasks);

    const renderCurrentView = () => {
        switch (view) {
            case View.TEAMS:
                return <BoardsView tasks={activeTasks} projects={projects} epics={epics} users={members} currentUser={currentUser} onUpdateTaskStatus={onUpdateTaskStatus} onSelectTask={onSelectTask} onAddTask={onAddTask} onDeleteTask={onDeleteTask} showProjectLabel={true} />;
            case View.BOARDS:
                return <BoardsView tasks={activeTasks} projects={projects} epics={epics} users={members} currentUser={currentUser} onUpdateTaskStatus={onUpdateTaskStatus} onSelectTask={onSelectTask} onAddTask={onAddTask} onDeleteTask={onDeleteTask} showProjectLabel={true} />;
            case View.LIST:
                return <TaskListView tasks={activeTasks} projects={projects} onSelectTask={onSelectTask} onDeleteTask={onDeleteTask} />;
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
