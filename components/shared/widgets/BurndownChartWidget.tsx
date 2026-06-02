import React from 'react';
import { Sprint, Task } from '../../../types';
import WidgetWrapper from './WidgetWrapper';
import { ChartBarIcon } from '../icons';
import { Tooltip } from '../ui/Tooltip';

interface BurndownChartWidgetProps {
    sprints: Sprint[];
    tasks: Task[];
}

const getDaysBetween = (startDate: string, endDate: string): number => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};

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
    const totalStoryPoints = sprintTasks.reduce((sum, task) => sum + (task.storyPoints || 0), 0);
    
    const sprintDuration = getDaysBetween(activeSprint.startDate, activeSprint.endDate) + 1;
    const idealPointsPerDay = totalStoryPoints / (sprintDuration - 1);

    const data = Array.from({ length: sprintDuration }, (_, i) => {
        const date = new Date(activeSprint.startDate);
        date.setDate(date.getDate() + i);
        const dateString = date.toISOString().split('T')[0];
        
        const ideal = Math.max(0, totalStoryPoints - (idealPointsPerDay * i));
        
        const completedPoints = sprintTasks
            .filter(t => t.status === 'Done' && t.dueDate <= dateString)
            .reduce((sum, task) => sum + (task.storyPoints || 0), 0);
        
        const actual = totalStoryPoints - completedPoints;

        return { day: i, date: date.getDate(), ideal, actual };
    });

    // SVG dimensions
    const width = 500;
    const height = 250;
    const padding = 40;
    
    const maxX = data.length - 1;
    const maxY = totalStoryPoints;

    const getX = (day: number) => padding + (day / maxX) * (width - padding * 2);
    const getY = (points: number) => height - padding - (points / maxY) * (height - padding * 2);

    const idealPath = data.map(d => `${getX(d.day)},${getY(d.ideal)}`).join(' L ');
    const actualPath = data.map(d => `${getX(d.day)},${getY(d.actual)}`).join(' L ');
    
    return (
        <WidgetWrapper icon={ChartBarIcon} title={`Burndown: ${activeSprint.name}`}>
            <div className="w-full h-full">
                 <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
                    {/* Y Axis */}
                    <line x1={padding} y1={padding / 2} x2={padding} y2={height - padding} className="stroke-slate-300 dark:stroke-gray-600" strokeWidth="1" />
                    {Array.from({length: 5}).map((_, i) => (
                        <g key={i}>
                            <text x={padding - 8} y={getY(i * maxY / 4)} textAnchor="end" alignmentBaseline="middle" className="text-xs fill-slate-500">{i * maxY / 4}</text>
                            <line x1={padding} y1={getY(i * maxY / 4)} x2={width - padding} y2={getY(i * maxY / 4)} className="stroke-slate-200 dark:stroke-gray-700" strokeWidth="1" strokeDasharray="2,2"/>
                        </g>
                    ))}

                    {/* X Axis */}
                    <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="stroke-slate-300 dark:stroke-gray-600" strokeWidth="1" />
                     {data.map(d => (
                        <text key={d.day} x={getX(d.day)} y={height - padding + 15} textAnchor="middle" className="text-xs fill-slate-500">{d.date}</text>
                    ))}

                    {/* Ideal Line */}
                    <path d={`M ${idealPath}`} fill="none" className="stroke-slate-400" strokeWidth="2" strokeDasharray="4,4" />

                    {/* Actual Line */}
                    <path d={`M ${actualPath}`} fill="none" className="stroke-abz-primary" strokeWidth="2.5" />
                    {data.map(d => (
                        <Tooltip key={d.day} content={`Day ${d.day + 1}: ${d.actual.toFixed(1)} points remaining`} position="top">
                             <circle cx={getX(d.day)} cy={getY(d.actual)} r="4" className="fill-abz-primary" />
                        </Tooltip>
                    ))}
                 </svg>
            </div>
        </WidgetWrapper>
    );
};

export default BurndownChartWidget;
