import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Task, Project } from '../types';
import { Tooltip } from './ui/Tooltip';
import { FireIcon } from './icons';

interface GanttChartViewProps {
    tasks: Task[];
    projects: Project[];
    onSelectTask: (task: Task) => void;
    onUpdateTask: (task: Task) => void;
}

const DAY_WIDTH = 40;
const ROW_HEIGHT = 48;
const SIDEBAR_WIDTH = 300;

// Parses a 'YYYY-MM-DD' string into a local Date object at midnight
const parseLocalDate = (dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
};

const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

// Formats a Date object back to a 'YYYY-MM-DD' string
const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getDaysBetween = (startDate: Date, endDate: Date): number => {
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};

const statusColors: Record<Task['status'], string> = {
    'Done': 'bg-gradient-to-r from-abz-emerald-500 to-green-400',
    'In Progress': 'bg-gradient-to-r from-abz-azure-500 to-sky-400',
    'In Review': 'bg-gradient-to-r from-abz-violet-500 to-purple-400',
    'Testing': 'bg-gradient-to-r from-abz-indigo-500 to-indigo-400',
    'Ready for Release': 'bg-gradient-to-r from-abz-teal-500 to-teal-400',
    'Blocked': 'bg-gradient-to-r from-abz-red-500 to-red-400',
    'On Hold': 'bg-gradient-to-r from-abz-amber-500 to-amber-400',
    'To Do': 'bg-gradient-to-r from-abz-slate-500 to-slate-400',
};


const GanttChartView: React.FC<GanttChartViewProps> = ({ tasks, projects, onSelectTask, onUpdateTask }) => {
    const [taskPositions, setTaskPositions] = useState<Map<string, { y: number }>>(new Map());
    const [showCriticalPath, setShowCriticalPath] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const dragInfo = useRef<{ taskId: string, initialX: number, initialStartDate: string, initialDueDate: string } | null>(null);
    
    const sortedTasks = useMemo(() => [...tasks].sort((a, b) => parseLocalDate(a.startDate).getTime() - parseLocalDate(b.startDate).getTime()), [tasks]);

    useEffect(() => {
        const positions = new Map<string, { y: number }>();
        sortedTasks.forEach((task, index) => {
            positions.set(task.id, { y: index * ROW_HEIGHT + ROW_HEIGHT / 2 });
        });
        setTaskPositions(positions);
    }, [sortedTasks]);

    const { criticalPathTaskIds, slackTimes } = useMemo(() => {
        if (tasks.length === 0) return { criticalPathTaskIds: new Set<string>(), slackTimes: new Map<string, number>()};
    
        const tasksById = new Map(tasks.map(t => [t.id, t]));
        const successors = new Map<string, string[]>();
        const predecessors = new Map<string, string[]>();
    
        for (const task of tasks) {
            successors.set(task.id, []);
            predecessors.set(task.id, []);
        }
    
        for (const task of tasks) {
            if (task.dependencyIds) {
                for (const depId of task.dependencyIds) {
                    if (successors.has(depId) && tasksById.has(task.id)) successors.get(depId)!.push(task.id);
                    if (predecessors.has(task.id) && tasksById.has(depId)) predecessors.get(task.id)!.push(depId);
                }
            }
        }
        
        const durations = new Map<string, number>();
        tasks.forEach(task => {
            const start = parseLocalDate(task.startDate);
            const end = parseLocalDate(task.dueDate);
            durations.set(task.id, getDaysBetween(start, end) + 1);
        });
    
        const earlyStart = new Map<string, number>();
        const earlyFinish = new Map<string, number>();
    
        const taskOrder = [...tasks].sort((a,b) => parseLocalDate(a.startDate).getTime() - parseLocalDate(b.startDate).getTime());
    
        for (const task of taskOrder) {
            const predIds = predecessors.get(task.id) || [];
            const maxEF = Math.max(0, ...predIds.map(id => earlyFinish.get(id) || 0));
            earlyStart.set(task.id, maxEF);
            earlyFinish.set(task.id, maxEF + (durations.get(task.id) || 0));
        }
    
        const projectDuration = Math.max(0, ...Array.from(earlyFinish.values()));
    
        const lateStart = new Map<string, number>();
        const lateFinish = new Map<string, number>();
    
        for (const task of [...taskOrder].reverse()) {
            const succIds = successors.get(task.id) || [];
            const minLS = succIds.length === 0 ? projectDuration : Math.min(...succIds.map(id => lateStart.get(id) || projectDuration));
            lateFinish.set(task.id, minLS);
            lateStart.set(task.id, minLS - (durations.get(task.id) || 0));
        }
        
        const criticalPathTaskIds = new Set<string>();
        const slackTimes = new Map<string, number>();
        for (const task of tasks) {
            const es = earlyStart.get(task.id) || 0;
            const ls = lateStart.get(task.id) || 0;
            const slack = ls - es;
            slackTimes.set(task.id, slack);
            if (Math.abs(slack) < 0.01) {
                criticalPathTaskIds.add(task.id);
            }
        }
        
        return { criticalPathTaskIds, slackTimes };
    }, [tasks]);

    const { chartStartDate, chartEndDate, totalDays, totalWidth } = useMemo(() => {
        if (sortedTasks.length === 0) {
            const today = new Date();
            return {
                chartStartDate: addDays(today, -15),
                chartEndDate: addDays(today, 15),
                totalDays: 30,
                totalWidth: 30 * DAY_WIDTH,
            };
        }
        const startDates = sortedTasks.map(t => parseLocalDate(t.startDate));
        const endDates = sortedTasks.map(t => parseLocalDate(t.dueDate));
        const minDate = new Date(Math.min(...startDates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...endDates.map(d => d.getTime())));

        const chartStartDate = addDays(minDate, -5);
        const chartEndDate = addDays(maxDate, 5);
        const totalDays = getDaysBetween(chartStartDate, chartEndDate);

        return { chartStartDate, chartEndDate, totalDays, totalWidth: totalDays * DAY_WIDTH };
    }, [sortedTasks]);
    
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, task: Task) => {
        e.dataTransfer.setData('taskId', task.id);
        e.dataTransfer.effectAllowed = 'move';
        dragInfo.current = {
            taskId: task.id,
            initialX: e.clientX,
            initialStartDate: task.startDate,
            initialDueDate: task.dueDate
        };
        (e.target as HTMLDivElement).closest('.task-bar-wrapper')?.classList.add('is-dragging');
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (!dragInfo.current) return;
        
        const { taskId, initialX, initialStartDate, initialDueDate } = dragInfo.current;
        const task = sortedTasks.find(t => t.id === taskId);
        if (!task) return;

        const deltaX = e.clientX - initialX;
        const daysMoved = Math.round(deltaX / DAY_WIDTH);
        
        const originalStart = parseLocalDate(initialStartDate);
        const originalEnd = parseLocalDate(initialDueDate);

        const newStartDate = addDays(originalStart, daysMoved);
        const newEndDate = addDays(originalEnd, daysMoved);
        
        const updatedTask: Task = {
            ...task,
            startDate: formatDate(newStartDate),
            dueDate: formatDate(newEndDate)
        };
        
        onUpdateTask(updatedTask);
        dragInfo.current = null;
    };

    const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
        document.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
        dragInfo.current = null;
    };


    const getTaskStyle = (task: Task) => {
        const startDate = parseLocalDate(task.startDate);
        const dueDate = parseLocalDate(task.dueDate);
        const left = getDaysBetween(chartStartDate, startDate) * DAY_WIDTH;
        const width = (getDaysBetween(startDate, dueDate) + 1) * DAY_WIDTH;
        return {
            left: `${left}px`,
            width: `${width}px`,
        };
    };

    const renderTimelineHeader = () => {
        const months = [];
        let currentDate = new Date(chartStartDate);
        while (currentDate <= chartEndDate) {
            const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
            const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            const daysInMonth = getDaysBetween(
                new Date(Math.max(startOfMonth.getTime(), chartStartDate.getTime())),
                new Date(Math.min(endOfMonth.getTime(), chartEndDate.getTime()))
            ) + 1;

            if (daysInMonth > 0) {
                 months.push(
                    <div key={monthName} style={{ width: `${daysInMonth * DAY_WIDTH}px` }} className="flex-shrink-0 text-center border-r border-slate-200 dark:border-gray-700">
                        <span className="font-semibold text-sm">{monthName}</span>
                    </div>
                );
            }
            currentDate.setMonth(currentDate.getMonth() + 1);
            currentDate.setDate(1);
        }
        
        const days = [];
        for (let i = 0; i <= totalDays; i++) {
            const dayDate = addDays(chartStartDate, i);
            const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
            days.push(
                <div key={i} style={{ minWidth: `${DAY_WIDTH}px` }} className={`text-center text-xs border-r border-slate-200 dark:border-gray-700 ${isWeekend ? 'bg-slate-50 dark:bg-abz-ink/70' : ''}`}>
                    {dayDate.getDate()}
                </div>
            );
        }
        
        return (
             <div className="sticky top-0 bg-white dark:bg-surface-dark z-10 border-b-2 border-slate-300 dark:border-gray-600">
                <div className="flex" style={{ width: `${totalWidth}px` }}>
                    {months}
                </div>
                 <div className="flex" style={{ width: `${totalWidth}px` }}>
                    {days}
                </div>
            </div>
        )
    };

    const renderDependencyLines = () => {
        return (
            <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ height: sortedTasks.length * ROW_HEIGHT }}>
                {sortedTasks.map(task => {
                    const toPos = taskPositions.get(task.id);
                    if (!toPos || !task.dependencyIds) return null;
                    
                    const toTaskStartDate = parseLocalDate(task.startDate);
                    const toLeft = getDaysBetween(chartStartDate, toTaskStartDate) * DAY_WIDTH;

                    return task.dependencyIds.map(fromId => {
                        const fromTask = sortedTasks.find(t => t.id === fromId);
                        const fromPos = taskPositions.get(fromId);
                        if (!fromTask || !fromPos) return null;
                        
                        const isCritical = showCriticalPath && criticalPathTaskIds.has(task.id) && criticalPathTaskIds.has(fromId);

                        const fromTaskEndDate = parseLocalDate(fromTask.dueDate);
                        const fromLeft = (getDaysBetween(chartStartDate, fromTaskEndDate) + 1) * DAY_WIDTH;
                        
                        const y1 = fromPos.y;
                        const x1 = fromLeft;
                        const y2 = toPos.y;
                        const x2 = toLeft;

                        return (
                           <g key={`${fromId}-${task.id}`}>
                            <path 
                                d={`M ${x1} ${y1} L ${x1 + 10} ${y1} L ${x1 + 10} ${y2} L ${x2} ${y2}`}
                                strokeWidth={isCritical ? "2.5" : "1.5"}
                                className={`stroke-current ${isCritical ? 'text-abz-red-500' : 'text-slate-400 dark:text-slate-500'} opacity-80`}
                                style={isCritical ? { filter: 'drop-shadow(0 0 3px #EF4444)'} : {}}
                                fill="none"
                                markerEnd={`url(#arrow${isCritical ? '-critical' : ''})`}
                            />
                           </g>
                        );
                    })
                })}
                 <defs>
                    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" className="fill-current text-slate-400 dark:text-slate-500" />
                    </marker>
                    <marker id="arrow-critical" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" className="fill-current text-abz-red-500" />
                    </marker>
                </defs>
            </svg>
        );
    };

    return (
        <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-soft border border-slate-200 dark:border-gray-700 overflow-hidden flex flex-col" style={{height: 'calc(100vh - 160px)'}}>
            <div className="p-2 border-b border-slate-200 dark:border-gray-700 flex-shrink-0">
                 <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-abz-ink-900 w-fit">
                    <input
                        type="checkbox"
                        checked={showCriticalPath}
                        onChange={() => setShowCriticalPath(!showCriticalPath)}
                        className="h-4 w-4 rounded border-gray-300 text-abz-indigo-500 focus:ring-abz-indigo-500"
                    />
                    <FireIcon className={`w-5 h-5 transition-colors ${showCriticalPath ? 'text-abz-red-500' : 'text-slate-400'}`} />
                    <span className={`text-sm font-medium transition-colors ${showCriticalPath ? 'text-abz-red-500' : 'text-slate-600 dark:text-slate-300'}`}>Highlight Critical Path</span>
                </label>
            </div>
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <div className="flex-shrink-0 border-r border-slate-200 dark:border-gray-700 bg-slate-50/50 dark:bg-abz-ink/50" style={{ width: `${SIDEBAR_WIDTH}px`}}>
                    <div className="h-[61px] flex items-center p-4 border-b-2 border-slate-300 dark:border-gray-600">
                        <h3 className="font-semibold">Tasks</h3>
                    </div>
                    <div className="overflow-y-auto" style={{ height: `calc(100% - 61px)`}}>
                        {sortedTasks.map(task => (
                            <div key={task.id} style={{ height: `${ROW_HEIGHT}px` }} className="flex items-center p-4 border-b border-slate-200 dark:border-gray-700 hover:bg-slate-100 dark:hover:bg-abz-ink-900 cursor-pointer" onClick={() => onSelectTask(task)}>
                                <p className="text-sm font-medium truncate">{task.title}</p>
                            </div>
                        ))}
                    </div>
                </div>
                {/* Chart */}
                <div className="flex-1 overflow-auto" ref={containerRef} onDragOver={handleDragOver} onDrop={handleDrop}>
                    <div className="relative" style={{ minWidth: `${totalWidth}px`}}>
                        {renderTimelineHeader()}
                        <div className="relative">
                            {/* Grid Lines */}
                            <div className="absolute top-0 left-0 w-full h-full">
                                {Array.from({ length: sortedTasks.length }).map((_, i) => (
                                    <div key={i} style={{ top: `${i * ROW_HEIGHT}px`, height: `${ROW_HEIGHT}px` }} className="absolute w-full border-b border-slate-200 dark:border-gray-700"></div>
                                ))}
                                {Array.from({ length: totalDays + 1 }).map((_, i) => {
                                    const dayDate = addDays(chartStartDate, i);
                                    const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
                                    return (<div key={i} style={{ left: `${i * DAY_WIDTH}px`, width: `${DAY_WIDTH}px` }} className={`absolute top-0 h-full border-r border-slate-200 dark:border-gray-700 ${isWeekend ? 'bg-slate-50/50 dark:bg-abz-ink/70' : ''}`}></div>)
                                })}
                            </div>
                            {/* Task Bars */}
                            <div className="relative" style={{ height: sortedTasks.length * ROW_HEIGHT }}>
                                {sortedTasks.map((task, index) => {
                                    const isCritical = showCriticalPath && criticalPathTaskIds.has(task.id);
                                    const slack = slackTimes.get(task.id) || 0;
                                    const taskStyle = getTaskStyle(task);
                                    
                                    const slackStyle = {
                                        left: `${parseFloat(taskStyle.left) + parseFloat(taskStyle.width)}px`,
                                        width: `${slack * DAY_WIDTH}px`,
                                    };

                                    return (
                                        <div 
                                            key={task.id}
                                            style={{ top: `${index * ROW_HEIGHT + 8}px`, height: `${ROW_HEIGHT - 16}px`, left: taskStyle.left, width: taskStyle.width }}
                                            className="absolute flex items-center rounded-lg cursor-grab transition-all hover:ring-2 hover:ring-abz-indigo-500 task-bar-wrapper"
                                            draggable="true"
                                            onDragStart={(e) => handleDragStart(e, task)}
                                            onDragEnd={handleDragEnd}
                                            onClick={() => onSelectTask(task)}
                                        >
                                            <Tooltip content={`${task.title} (${task.startDate} to ${task.dueDate}) | Slack: ${slack.toFixed(0)} days`}>
                                                <div className="w-full h-full flex items-center">
                                                     <div className={`w-full h-full rounded-md ${statusColors[task.status]}`} style={isCritical ? {boxShadow: '0 0 8px 1px #EF4444'} : {}}></div>
                                                    {!isCritical && slack > 0 && (
                                                        <div style={{width: slackStyle.width}} className={`h-1/2 ${statusColors[task.status]} opacity-30 rounded-r-md`}></div>
                                                    )}
                                                </div>
                                            </Tooltip>
                                        </div>
                                    )
                                })}
                                {renderDependencyLines()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GanttChartView;