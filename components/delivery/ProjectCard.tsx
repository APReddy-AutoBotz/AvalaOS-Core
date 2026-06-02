import React, { useMemo } from 'react';
import { Project, Task, User, ProjectHealthStatus, View } from '../../types';
import { 
    CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon, UserCircleIcon, 
    ViewBoardsIcon, DocumentDuplicateIcon, MapIcon 
} from '../shared/icons';
import { Tooltip } from '../shared/ui/Tooltip';

interface ProjectCardProps {
    project: Project;
    tasks: Task[];
    owner: User | undefined;
    onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
    onNavigate: (projectId: string, projectName: string, view: View) => void;
}

const healthStatusMap: Record<ProjectHealthStatus, { icon: React.FC<{className: string}>, color: string, label: string }> = {
    'On Track': { icon: CheckCircleIcon, color: 'text-abz-emerald-500', label: 'On Track' },
    'At Risk': { icon: ExclamationTriangleIcon, color: 'text-abz-amber-500', label: 'At Risk' },
    'Off Track': { icon: XCircleIcon, color: 'text-abz-red-500', label: 'Off Track' },
};

const ProjectCard: React.FC<ProjectCardProps> = ({ project, tasks, owner, onDragStart, onNavigate }) => {
    
    const { progress, openTasks, overdueTasks, blockedTasks, reviewTasks } = useMemo(() => {
        if (tasks.length === 0) {
            return { progress: 0, openTasks: 0, overdueTasks: 0, blockedTasks: 0, reviewTasks: 0 };
        }
        const doneCount = tasks.filter(t => t.status === 'Done').length;
        const progress = (doneCount / tasks.length) * 100;
        
        const today = new Date();
        today.setHours(0,0,0,0);

        const open = tasks.filter(t => t.status !== 'Done');

        return {
            progress,
            openTasks: open.length,
            overdueTasks: open.filter(t => new Date(t.dueDate) < today).length,
            blockedTasks: open.filter(t => t.status === 'Blocked').length,
            reviewTasks: open.filter(t => ['In Review', 'Testing', 'Ready for Release'].includes(t.status)).length,
        };
    }, [tasks]);

    const health = healthStatusMap[project.healthStatus];

    const handleQuickActionClick = (e: React.MouseEvent, view: View) => {
        e.stopPropagation(); // Prevent card's main onClick from firing
        onNavigate(project.id, project.name, view);
    }

    return (
        <div 
            className="card p-5 flex flex-col gap-4 group cursor-pointer border border-slate-200/80 bg-white/90 shadow-[0_14px_36px_rgba(15,23,42,0.08)] dark:border-slate-700/70 dark:bg-slate-900/80"
            draggable="true"
            onDragStart={onDragStart}
            onClick={() => onNavigate(project.id, project.name, View.BOARDS)}
        >
            <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                    <h4 className="font-black text-md leading-6 text-slate-950 dark:text-white">{project.name}</h4>
                    <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">{project.description}</p>
                </div>
                <div className={`flex shrink-0 items-center gap-1.5 text-[11px] font-black px-2.5 py-1 rounded-full border ${project.healthStatus === 'On Track' ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/20' : project.healthStatus === 'At Risk' ? 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/20' : 'bg-red-50 text-red-700 border-red-100 dark:bg-red-500/10 dark:text-red-200 dark:border-red-500/20'}`}>
                    <health.icon className="w-4 h-4" />
                    <span>{health.label}</span>
                </div>
            </div>
            
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <UserCircleIcon className="w-5 h-5 text-slate-400" />
                    <span className="font-bold truncate">{owner?.name || 'Unassigned'}</span>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {project.lifecycleStage}
                </span>
            </div>

            <div>
                 <div className="flex justify-between items-baseline mb-1">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Progress</p>
                    <p className="text-sm font-bold">{progress.toFixed(0)}%</p>
                </div>
                <div className="w-full bg-slate-100 dark:bg-abz-ink rounded-full h-2 overflow-hidden">
                    <div className="h-2 rounded-full bg-gradient-to-r from-[#002C4B] via-[#073B60] to-[#ffbc03]" style={{ width: `${progress}%` }}></div>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center mt-1">
                <div className="bg-slate-50 dark:bg-abz-ink p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                    <p className="font-black text-lg">{openTasks}</p>
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Open</p>
                </div>
                <div className={`p-2 rounded-xl border ${blockedTasks > 0 ? 'bg-red-50 border-red-100 dark:bg-red-500/10 dark:border-red-500/20' : 'bg-slate-50 dark:bg-abz-ink border-slate-100 dark:border-slate-800'}`}>
                    <p className={`font-black text-lg ${blockedTasks > 0 ? 'text-red-500' : ''}`}>{blockedTasks}</p>
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Blocked</p>
                </div>
                <div className="bg-violet-50 dark:bg-violet-500/10 p-2 rounded-xl border border-violet-100 dark:border-violet-500/20">
                    <p className="font-black text-lg text-violet-600 dark:text-violet-200">{reviewTasks}</p>
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Review</p>
                </div>
                 <div className={`p-2 rounded-xl border ${overdueTasks > 0 ? 'bg-red-50 border-red-100 dark:bg-red-500/10 dark:border-red-500/20' : 'bg-slate-50 dark:bg-abz-ink border-slate-100 dark:border-slate-800'}`}>
                    <p className={`font-black text-lg ${overdueTasks > 0 ? 'text-red-500' : ''}`}>{overdueTasks}</p>
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Late</p>
                </div>
            </div>

             <div className="mt-2 pt-3 border-t border-slate-100 dark:border-gray-800 quick-actions">
                <div className="flex items-center justify-around">
                    <Tooltip content="Go to Board">
                        <button onClick={(e) => handleQuickActionClick(e, View.BOARDS)} className="p-2 rounded-full text-slate-500 hover:text-abz-primary hover:bg-abz-primary/10 transition-colors">
                            <ViewBoardsIcon className="w-5 h-5" />
                        </button>
                    </Tooltip>
                    <Tooltip content="Go to Backlog">
                        <button onClick={(e) => handleQuickActionClick(e, View.BACKLOG)} className="p-2 rounded-full text-slate-500 hover:text-abz-primary hover:bg-abz-primary/10 transition-colors">
                            <DocumentDuplicateIcon className="w-5 h-5" />
                        </button>
                    </Tooltip>
                    <Tooltip content="Go to Roadmap">
                        <button onClick={(e) => handleQuickActionClick(e, View.ROADMAP)} className="p-2 rounded-full text-slate-500 hover:text-abz-primary hover:bg-abz-primary/10 transition-colors">
                            <MapIcon className="w-5 h-5" />
                        </button>
                    </Tooltip>
                </div>
            </div>
        </div>
    );
};

export default ProjectCard;
