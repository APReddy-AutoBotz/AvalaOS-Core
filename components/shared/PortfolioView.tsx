import React, { useState, useMemo } from 'react';
import { Project, Task, User, ProjectLifecycleStage, Scope, ScopeType, View } from '../../types';
import ProjectCard from '../delivery/ProjectCard';
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
            <div className="flex-shrink-0 mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#ffbc03]/30 bg-[#ffbc03]/15 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#002C4B] dark:border-[#ffbc03]/20 dark:bg-[#ffbc03]/10 dark:text-[#ffcf45]">
                        <ChartPieIcon className="h-4 w-4" />
                        Executive portfolio
                    </div>
                    <h2 className="text-3xl font-black text-text-light dark:text-text-dark">Portfolio Board</h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">Portfolio value, risk, blockers, and evidence-backed handoff status across active programs.</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-2 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                        <div className="text-lg font-black">{projects.length}</div>
                        <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Projects</div>
                    </div>
                    <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-2 text-center shadow-sm dark:border-amber-500/20 dark:bg-amber-500/10">
                        <div className="text-lg font-black text-amber-600 dark:text-amber-200">{projects.filter(p => p.healthStatus === 'At Risk').length}</div>
                        <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">At risk</div>
                    </div>
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-center shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10">
                        <div className="text-lg font-black text-emerald-600 dark:text-emerald-200">{projects.filter(p => p.healthStatus === 'On Track').length}</div>
                        <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">On track</div>
                    </div>
                </div>
            </div>
            <div className="flex-1 overflow-x-auto">
                 <div className="grid grid-cols-6 gap-4 min-w-max pb-4">
                    {DEFAULT_LIFECYCLE_STAGES.map(stage => {
                        const stageProjects = projects.filter(p => p.lifecycleStage === stage);
                        return (
                            <div 
                                key={stage} 
                                data-col={dataColMap[stage]}
                                className={`flex flex-col transition-colors duration-200 relative rounded-2xl border border-slate-200/80 bg-slate-50/70 w-[340px] shadow-sm dark:border-slate-700/60 dark:bg-slate-900/45 ${draggedOverColumn === stage ? 'ring-2 ring-[#ffbc03]/70 dark:ring-[#ffbc03]/50' : ''}`}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, stage)}
                                onDragEnter={() => handleDragEnter(stage)}
                                onDragLeave={() => setDraggedOverColumn(null)}
                            >
                                <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-full ${dataColMap[stage] === 'todo' ? 'bg-slate-400' : dataColMap[stage] === 'doing' ? 'bg-blue-500' : dataColMap[stage] === 'review' ? 'bg-violet-500' : dataColMap[stage] === 'test' ? 'bg-indigo-500' : dataColMap[stage] === 'ready' ? 'bg-teal-500' : 'bg-emerald-500'}`}></div>
                                <div className="px-4 py-3 flex-shrink-0">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-black text-sm text-slate-900 dark:text-white">{stage}</h3>
                                        <span className="text-xs font-black rounded-full px-2.5 py-1 text-slate-500 bg-white dark:bg-slate-800 dark:text-slate-300">
                                            {stageProjects.length}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex-1 space-y-3 px-4 pb-4 min-h-[96px] max-h-[calc(100vh-260px)] overflow-y-auto">
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
                                    {stageProjects.length === 0 && (
                                        <div className="rounded-xl border border-dashed border-slate-200 bg-white/45 px-3 py-5 text-center text-xs font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-950/20">
                                            No projects in this stage
                                        </div>
                                    )}
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
