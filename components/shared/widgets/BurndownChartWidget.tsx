import React from 'react';
import { Sprint, Task } from '../../../types';
import WidgetWrapper from './WidgetWrapper';
import { ChartBarIcon } from '../icons';
import { Tooltip } from '../ui/Tooltip';
import { buildBurndownChartModel } from './burndownChartModel';

interface BurndownChartWidgetProps {
    sprints: Sprint[];
    tasks: Task[];
}

const BurndownChartWidget: React.FC<BurndownChartWidgetProps> = ({ sprints, tasks }) => {
    const activeSprint = sprints.find(s => s.status === 'Active');

    if (!activeSprint) {
        return (
            <WidgetWrapper icon={ChartBarIcon} title="Sprint Burndown">
                <div className="flex items-center justify-center h-full text-center">
                    <div>
                        <ChartBarIcon className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
                        <h4 className="mt-4 font-semibold">No Active Sprint</h4>
                        <p className="text-sm text-slate-500">Start a sprint to see the burndown chart.</p>
                    </div>
                </div>
            </WidgetWrapper>
        );
    }
    
    const sprintTasks = tasks.filter(t => t.sprintId === activeSprint.id);
    const chartModel = buildBurndownChartModel(activeSprint, sprintTasks);

    if (!chartModel) {
        return (
            <WidgetWrapper icon={ChartBarIcon} title={`Burndown: ${activeSprint.name}`}>
                <div className="flex items-center justify-center h-full text-center">
                    <div>
                        <ChartBarIcon className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
                        <h4 className="mt-4 font-semibold">No sprint estimates</h4>
                        <p className="text-sm text-slate-500">Add finite story-point estimates to see the burndown chart.</p>
                    </div>
                </div>
            </WidgetWrapper>
        );
    }

    const { width, height, padding, points, yAxisTicks, idealPath, actualPath } = chartModel;
    
    return (
        <WidgetWrapper icon={ChartBarIcon} title={`Burndown: ${activeSprint.name}`}>
            <div className="w-full h-full">
                 <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
                    {/* Y Axis */}
                    <line x1={padding} y1={padding / 2} x2={padding} y2={height - padding} className="stroke-slate-300 dark:stroke-gray-600" strokeWidth="1" />
                    {yAxisTicks.map(tick => (
                        <g key={tick.value}>
                            <text x={padding - 8} y={tick.y} textAnchor="end" alignmentBaseline="middle" className="text-xs fill-slate-500">{tick.value}</text>
                            <line x1={padding} y1={tick.y} x2={width - padding} y2={tick.y} className="stroke-slate-200 dark:stroke-gray-700" strokeWidth="1" strokeDasharray="2,2"/>
                        </g>
                    ))}

                    {/* X Axis */}
                    <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="stroke-slate-300 dark:stroke-gray-600" strokeWidth="1" />
                     {points.map(d => (
                        <text key={d.day} x={d.x} y={height - padding + 15} textAnchor="middle" className="text-xs fill-slate-500">{d.date}</text>
                    ))}

                    {/* Ideal Line */}
                    <path d={`M ${idealPath}`} fill="none" className="stroke-slate-400" strokeWidth="2" strokeDasharray="4,4" />

                    {/* Actual Line */}
                    <path d={`M ${actualPath}`} fill="none" className="stroke-abz-primary" strokeWidth="2.5" />
                    {points.map(d => (
                        <Tooltip key={d.day} content={`Day ${d.day + 1}: ${d.actual.toFixed(1)} points remaining`} position="top">
                             <circle cx={d.x} cy={d.actualY} r="4" className="fill-abz-primary" />
                        </Tooltip>
                    ))}
                 </svg>
            </div>
        </WidgetWrapper>
    );
};

export default BurndownChartWidget;
