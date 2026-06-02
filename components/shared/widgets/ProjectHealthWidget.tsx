import React from 'react';
import { Project, ProjectHealthStatus, ALL_HEALTH_STATUSES } from '../../../types';
import WidgetWrapper from './WidgetWrapper';
import { CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon, CubeIcon } from '../icons';
import { Tooltip } from '../ui/Tooltip';

interface ProjectHealthWidgetProps {
    projects: Project[];
    config: { selectedStatuses?: ProjectHealthStatus[] };
    onUpdateConfig: (config: { selectedStatuses: ProjectHealthStatus[] }) => void;
    isConfiguring?: boolean;
    onToggleConfigure?: () => void;
}

const healthStatusMap: Record<ProjectHealthStatus, { icon: React.FC<{className: string}>, color: string, label: string }> = {
    'On Track': { icon: CheckCircleIcon, color: 'text-abz-emerald-500', label: 'On Track' },
    'At Risk': { icon: ExclamationTriangleIcon, color: 'text-abz-amber-500', label: 'At Risk' },
    'Off Track': { icon: XCircleIcon, color: 'text-abz-red-500', label: 'Off Track' },
};

const ProjectHealthWidget: React.FC<ProjectHealthWidgetProps> = ({ projects, config, onUpdateConfig, isConfiguring, onToggleConfigure }) => {
    
    const selectedStatuses = config.selectedStatuses || ALL_HEALTH_STATUSES;

    const handleStatusToggle = (status: ProjectHealthStatus) => {
        const newSelection = selectedStatuses.includes(status)
            ? selectedStatuses.filter(s => s !== status)
            : [...selectedStatuses, status];
        onUpdateConfig({ selectedStatuses: newSelection });
    };

    const renderConfigUI = () => (
        <div>
            <label className="block text-sm font-semibold mb-2">Filter by Health Status:</label>
            <div className="flex items-center gap-4">
                {ALL_HEALTH_STATUSES.map(status => (
                    <label key={status} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                            type="checkbox"
                            checked={selectedStatuses.includes(status)}
                            onChange={() => handleStatusToggle(status)}
                            className="h-4 w-4 rounded border-gray-300 text-abz-primary focus:ring-abz-primary"
                        />
                        {status}
                    </label>
                ))}
            </div>
        </div>
    );
    
    const filteredProjects = projects.filter(p => selectedStatuses.includes(p.healthStatus));
    
    const healthCounts = filteredProjects.reduce((acc, project) => {
        acc[project.healthStatus] = (acc[project.healthStatus] || 0) + 1;
        return acc;
    }, {} as Record<ProjectHealthStatus, number>);

    return (
        <WidgetWrapper 
            icon={CubeIcon} 
            title="Project Health"
            isConfigurable={true}
            isConfiguring={isConfiguring}
            onToggleConfigure={onToggleConfigure}
            childrenConfig={renderConfigUI()}
        >
             <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                    {ALL_HEALTH_STATUSES.map(status => {
                        const key = status as ProjectHealthStatus;
                        const config = healthStatusMap[key];
                        return (
                             <div key={key} className={`p-2 rounded-lg ${config.color.replace('text-', 'bg-')}/10`}>
                                <p className={`font-bold text-2xl ${config.color}`}>{healthCounts[key] || 0}</p>
                                <p className="text-xs font-semibold">{config.label}</p>
                            </div>
                        )
                    })}
                </div>
                <div className="space-y-3 pt-2">
                    <h4 className="font-semibold text-sm">Filtered Projects ({filteredProjects.length})</h4>
                    {filteredProjects.length > 0 ? filteredProjects.map(project => {
                        const health = healthStatusMap[project.healthStatus];
                        return (
                            <div key={project.id} className="flex items-center gap-3">
                                <Tooltip content={health.label} position="top">
                                    <health.icon className={`w-5 h-5 flex-shrink-0 ${health.color}`} />
                                </Tooltip>
                                <p className="text-sm font-medium truncate flex-1">{project.name}</p>
                            </div>
                        )
                    }) : (
                        <p className="text-sm text-center text-slate-500 pt-4">No projects match the current filter.</p>
                    )}
                </div>
            </div>
        </WidgetWrapper>
    );
};

export default ProjectHealthWidget;
