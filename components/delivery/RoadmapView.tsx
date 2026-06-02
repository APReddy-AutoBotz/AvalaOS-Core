
import React, { useMemo } from 'react';
import { Task, Epic } from '../../types';
import { Tooltip } from '../shared/ui/Tooltip';

interface RoadmapViewProps {
    tasks: Task[];
    epics: Epic[];
}

const addDays = (date: Date, days: number): number => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result.getTime();
};

const getDaysBetween = (startDate: Date, endDate: Date): number => {
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};

const getQuarter = (date: Date) => {
    return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
};

const RoadmapView: React.FC<RoadmapViewProps> = ({ tasks, epics }) => {
    const { timelineStart, timelineEnd, epicsWithDates } = useMemo(() => {
        if (tasks.length === 0) {
            const now = new Date();
            return {
                timelineStart: new Date(now.getFullYear(), 0, 1).getTime(),
                timelineEnd: new Date(now.getFullYear(), 11, 31).getTime(),
                epicsWithDates: [],
            };
        }

        const epicTasks = tasks.reduce((acc, task) => {
            if (task.epicId) {
                if (!acc[task.epicId]) acc[task.epicId] = [];
                acc[task.epicId].push(task);
            }
            return acc;
        }, {} as Record<string, Task[]>);

        const epicsWithDates = epics.map(epic => {
            const tasksForEpic = epicTasks[epic.id];
            if (!tasksForEpic || tasksForEpic.length === 0) return null;
            const startDates = tasksForEpic.map(t => new Date(t.startDate).getTime());
            const endDates = tasksForEpic.map(t => new Date(t.dueDate).getTime());
            return {
                ...epic,
                startDate: new Date(Math.min(...startDates)),
                endDate: new Date(Math.max(...endDates)),
            };
        }).filter(Boolean) as (Epic & { startDate: Date, endDate: Date })[];

        if (epicsWithDates.length === 0) {
            const now = new Date();
            return {
                timelineStart: new Date(now.getFullYear(), 0, 1).getTime(),
                timelineEnd: new Date(now.getFullYear(), 11, 31).getTime(),
                epicsWithDates: [],
            };
        }

        const minDate = Math.min(...epicsWithDates.map(e => e.startDate.getTime()));
        const maxDate = Math.max(...epicsWithDates.map(e => e.endDate.getTime()));
        
        const timelineStart = new Date(new Date(minDate).getFullYear(), 0, 1).getTime();
        const timelineEnd = new Date(new Date(maxDate).getFullYear(), 11, 31).getTime();

        return { timelineStart, timelineEnd, epicsWithDates };

    }, [tasks, epics]);

    const totalDays = getDaysBetween(new Date(timelineStart), new Date(timelineEnd));

    const renderTimelineHeader = () => {
        const quarters = [];
        let currentDate = new Date(timelineStart);
        while (currentDate.getTime() <= timelineEnd) {
            const quarter = getQuarter(currentDate);
            if (!quarters.includes(quarter)) {
                quarters.push(quarter);
            }
            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        return (
            <div className="flex sticky top-0 bg-slate-50 dark:bg-abz-ink z-10 border-b-2 border-slate-300 dark:border-gray-600">
                {quarters.map(q => (
                    <div key={q} className="flex-1 text-center font-semibold p-2 border-r border-slate-200 dark:border-gray-700">
                        {q}
                    </div>
                ))}
            </div>
        );
    };
    
    const getEpicPosition = (epic: Epic & { startDate: Date, endDate: Date }) => {
        const leftOffset = getDaysBetween(new Date(timelineStart), epic.startDate);
        const duration = getDaysBetween(epic.startDate, epic.endDate) + 1;
        
        const left = (leftOffset / totalDays) * 100;
        const width = (duration / totalDays) * 100;
        
        return { left: `${left}%`, width: `${width}%` };
    };

    return (
         <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-soft border border-slate-200 dark:border-gray-700 overflow-hidden" style={{height: 'calc(100vh - 160px)'}}>
            <div className="flex h-full">
                <div className="w-64 border-r border-slate-200 dark:border-gray-700 flex-shrink-0">
                    <div className="h-[53px] flex items-center p-4 border-b-2 border-slate-300 dark:border-gray-600">
                        <h3 className="font-bold">Epics</h3>
                    </div>
                    <div className="overflow-y-auto" style={{ height: 'calc(100% - 53px)'}}>
                        {epicsWithDates.map(epic => (
                            <div key={epic.id} className="h-16 flex items-center p-4 border-b border-slate-200 dark:border-gray-700">
                                <p className="font-medium text-sm truncate">{epic.name}</p>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex-1 overflow-x-auto">
                    {renderTimelineHeader()}
                    <div className="relative">
                        {epicsWithDates.map((epic, index) => (
                            <div key={epic.id} className="h-16 relative border-b border-slate-200 dark:border-gray-700">
                                <Tooltip content={`${epic.name}: ${epic.startDate.toLocaleDateString()} - ${epic.endDate.toLocaleDateString()}`}>
                                <div 
                                    style={getEpicPosition(epic)}
                                    className="absolute top-1/2 -translate-y-1/2 h-8 rounded-lg flex items-center px-3"
                                >
                                    <div className="w-full h-full rounded-md flex items-center" style={{backgroundColor: epic.color}}>
                                        <p className="text-white text-sm font-semibold truncate px-2">{epic.name}</p>
                                    </div>
                                </div>
                                </Tooltip>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RoadmapView;
