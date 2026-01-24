import React, { useMemo } from 'react';
import { Project, Task, User, ProjectHealthStatus, View } from '../types';
import { 
    CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon, UserCircleIcon, 
    ViewBoardsIcon, DocumentDuplicateIcon, MapIcon 
} from './icons';
import { Tooltip } from './ui/Tooltip';

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
    
    const { progress, openTasks, overdueTasks } = useMemo(() => {
        if (tasks.length === 0) {
            return { progress: 0, openTasks: 0, overdueTasks: 0 };
        }
        const doneCount = tasks.filter(t => t.status === 'Done').length;
        const progress = (doneCount / tasks.length) * 100;
        
        const today = new Date();
        today.setHours(0,0,0,0);

        const open = tasks.filter(t => t.status !== 'Done');

        return {
            progress,
            openTasks: open.length,
            overdueTasks: open.filter(t => new Date(t.dueDate) < today).length
        };
    }, [tasks]);

    const health = healthStatusMap[project.healthStatus];

    const handleQuickActionClick = (e: React.MouseEvent, view: View) => {
        e.stopPropagation(); // Prevent card's main onClick from firing
        onNavigate(project.id, project.name, view);
    }

    return (
        <div 
            className="card p-4 flex flex-col gap-3 group cursor-pointer"
            draggable="true"
            onDragStart={onDragStart}
            onClick={() => onNavigate(project.id, project.name, View.BOARDS)}
        >
            <div className="flex justify-between items-start">
                <h4 className="font-bold text-md flex-1 pr-2">{project.name}</h4>
                <div className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full ${health.color.replace('text-', 'bg-')}/10 ${health.color}`}>
                    <health.icon className="w-4 h-4" />
                    <span>{health.label}</span>
                </div>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                 <UserCircleIcon className="w-5 h-5 text-slate-400" />
                 <span>{owner?.name || 'Unassigned'}</span>
            </div>

            <div>
                 <div className="flex justify-between items-baseline mb-1">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Progress</p>
                    <p className="text-sm font-bold">{progress.toFixed(0)}%</p>
                </div>
                <div className="w-full bg-slate-200 dark:bg-abz-ink rounded-full h-2.5">
                    <div className="bg-abz-primary h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center mt-1">
                <div className="bg-slate-50 dark:bg-abz-ink p-2 rounded-lg">
                    <p className="font-bold text-lg">{openTasks}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Open Tasks</p>
                </div>
                 <div className={`p-2 rounded-lg ${overdueTasks > 0 ? 'bg-abz-red-500/10' : 'bg-slate-50 dark:bg-abz-ink'}`}>
                    <p className={`font-bold text-lg ${overdueTasks > 0 ? 'text-abz-red-500' : ''}`}>{overdueTasks}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Overdue</p>
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