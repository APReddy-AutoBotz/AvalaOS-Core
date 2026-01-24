import React, { useState, useMemo } from 'react';
import { Project, Task, User, ProjectLifecycleStage, Scope, ScopeType, View } from '../types';
import ProjectCard from './ProjectCard';
import { ChartPieIcon } from './icons';

interface PortfolioViewProps {
    projects: Project[];
    tasks: Task[];
    users: User[];
    onUpdateProjectStage: (projectId: string, newStage: ProjectLifecycleStage) => void;
    onScopeChange: (scope: Scope) => void;
    onViewChange: (view: View) => void;
}

const DEFAULT_LIFECYCLE_STAGES: ProjectLifecycleStage[] = [
    'Planning',
    'Analysis & Design',
    'Development',
    'Testing',
    'Deployment',
    'Maintenance',
];

const dataColMap: Record<ProjectLifecycleStage, string> = {
    'Planning': 'todo',
    'Analysis & Design': 'doing',
    'Development': 'review',
    'Testing': 'test',
    'Deployment': 'ready',
    'Maintenance': 'done',
};

const PortfolioView: React.FC<PortfolioViewProps> = ({ projects, tasks, users, onUpdateProjectStage, onScopeChange, onViewChange }) => {
    const [draggedOverColumn, setDraggedOverColumn] = useState<ProjectLifecycleStage | null>(null);

    const tasksByProject = useMemo(() => {
        return tasks.reduce((acc, task) => {
            if (!acc[task.projectId]) {
                acc[task.projectId] = [];
            }
            acc[task.projectId].push(task);
            return acc;
        }, {} as Record<string, Task[]>);
    }, [tasks]);

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, projectId: string) => {
        e.dataTransfer.setData("projectId", projectId);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };
    
    const handleDrop = (e: React.DragEvent<HTMLDivElement>, newStage: ProjectLifecycleStage) => {
        const projectId = e.dataTransfer.getData("projectId");
        onUpdateProjectStage(projectId, newStage);
        setDraggedOverColumn(null);
    };
    
    const handleDragEnter = (stage: ProjectLifecycleStage) => {
        setDraggedOverColumn(stage);
    };

    const handleNavigate = (projectId: string, projectName: string, view: View) => {
        onScopeChange({ type: ScopeType.PROJECT, id: projectId, name: projectName });
        onViewChange(view);
    };

    return (
        <div style={{height: 'calc(100vh - 120px)'}} className="flex flex-col">
            <div className="flex-shrink-0 mb-6">
                <h2 className="text-3xl font-bold text-text-light dark:text-text-dark">Portfolio Board</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-1">A high-level view of all projects across the development lifecycle.</p>
            </div>
            <div className="flex-1 overflow-x-auto">
                 <div className="grid grid-cols-6 gap-6 min-w-max">
                    {DEFAULT_LIFECYCLE_STAGES.map(stage => {
                        const stageProjects = projects.filter(p => p.lifecycleStage === stage);
                        return (
                            <div 
                                key={stage} 
                                data-col={dataColMap[stage]}
                                className={`flex flex-col transition-colors duration-200 relative board-column w-[320px] ${draggedOverColumn === stage ? 'bg-abz-indigo-100/50 dark:bg-abz-indigo-500/10' : ''}`}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, stage)}
                                onDragEnter={() => handleDragEnter(stage)}
                                onDragLeave={() => setDraggedOverColumn(null)}
                            >
                                <div className="rail"></div>
                                <div className="p-4 flex-shrink-0">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold text-md">{stage}</h3>
                                        <span className="text-sm font-bold rounded-full px-2.5 py-0.5 text-slate-400 bg-slate-200 dark:bg-surface-dark dark:text-slate-300">
                                            {stageProjects.length}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex-1 space-y-4 p-4 min-h-[150px] overflow-y-auto">
                                    {stageProjects.map(project => (
                                        <ProjectCard
                                            key={project.id}
                                            project={project}
                                            tasks={tasksByProject[project.id] || []}
                                            owner={users.find(u => u.id === project.ownerId)}
                                            onDragStart={(e) => handleDragStart(e, project.id)}
                                            onNavigate={handleNavigate}
                                        />
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
};

export default PortfolioView;