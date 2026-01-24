import React, { useState, useMemo } from 'react';
import { Project, Task, User, TimesheetEntry } from '../types';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';

interface TimesheetsViewProps {
    project: Project;
    tasks: Task[];
    currentUser: User;
    timesheetEntries: TimesheetEntry[];
    onUpdateTimesheet: (userId: string, taskId: string, date: string, hours: number) => void;
}

const getStartOfWeek = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day; // adjust when day is Sunday
    return new Date(d.setDate(diff));
};

const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0];
};

const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

const TimesheetsView: React.FC<TimesheetsViewProps> = ({ project, tasks, currentUser, timesheetEntries, onUpdateTimesheet }) => {
    const [currentWeekStart, setCurrentWeekStart] = useState(getStartOfWeek(new Date()));

    const myTasks = useMemo(() => {
        return tasks.filter(task => task.assigneeIds.includes(currentUser.id));
    }, [tasks, currentUser.id]);

    const weekDays = useMemo(() => {
        return Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));
    }, [currentWeekStart]);

    const weekEntries = useMemo(() => {
        const entriesMap = new Map<string, number>(); // key: "taskId-date"
        timesheetEntries.forEach(entry => {
            if (entry.userId === currentUser.id) {
                entriesMap.set(`${entry.taskId}-${entry.date}`, entry.hours);
            }
        });
        return entriesMap;
    }, [timesheetEntries, currentUser.id]);

    const handleHoursChange = (taskId: string, date: Date, hoursStr: string) => {
        const hours = parseFloat(hoursStr);
        if (!isNaN(hours) && hours >= 0) {
            onUpdateTimesheet(currentUser.id, taskId, formatDate(date), hours);
        } else if (hoursStr === '') {
            onUpdateTimesheet(currentUser.id, taskId, formatDate(date), 0);
        }
    };

    const dailyTotals = useMemo(() => {
        const totals = new Array(7).fill(0);
        myTasks.forEach(task => {
            weekDays.forEach((day, index) => {
                const hours = weekEntries.get(`${task.id}-${formatDate(day)}`) || 0;
                totals[index] += hours;
            });
        });
        return totals;
    }, [myTasks, weekDays, weekEntries]);

    const taskTotals = useMemo(() => {
        const totals = new Map<string, number>();
        myTasks.forEach(task => {
            let total = 0;
            weekDays.forEach(day => {
                total += weekEntries.get(`${task.id}-${formatDate(day)}`) || 0;
            });
            totals.set(task.id, total);
        });
        return totals;
    }, [myTasks, weekDays, weekEntries]);
    
    const weeklyTotal = dailyTotals.reduce((sum, current) => sum + current, 0);

    return (
        <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-soft border border-slate-200 dark:border-gray-700 overflow-hidden">
            <div className="p-4 flex items-center justify-between border-b border-slate-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                    <button onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-abz-ink-900">
                        <ChevronLeftIcon className="w-5 h-5" />
                    </button>
                    <button onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-abz-ink-900">
                        <ChevronRightIcon className="w-5 h-5" />
                    </button>
                    <h3 className="text-md font-semibold">
                        {weekDays[0].toLocaleDateString('default', { month: 'short', day: 'numeric' })}
                        {' - '}
                        {weekDays[6].toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </h3>
                </div>
                 <div className="text-right">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Weekly Total</p>
                    <p className="font-bold text-lg">{weeklyTotal.toFixed(2)} hours</p>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-gray-700">
                    <thead className="bg-slate-50 dark:bg-abz-ink-900">
                        <tr>
                            <th scope="col" className="sticky left-0 bg-slate-50 dark:bg-abz-ink-900 px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-1/3">Task</th>
                            {weekDays.map(day => (
                                <th key={day.toISOString()} scope="col" className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                                    {day.toLocaleDateString('default', { weekday: 'short' })}
                                    <span className="block font-normal text-slate-400">{day.getDate()}</span>
                                </th>
                            ))}
                             <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Total</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-surface-dark divide-y divide-slate-200 dark:divide-gray-700">
                        {myTasks.map(task => (
                            <tr key={task.id}>
                                <td className="sticky left-0 bg-white dark:bg-surface-dark px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-slate-100">{task.title}</td>
                                {weekDays.map(day => {
                                    const value = weekEntries.get(`${task.id}-${formatDate(day)}`) || '';
                                    return (
                                        <td key={day.toISOString()} className="px-2 py-1 whitespace-nowrap text-sm">
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.25"
                                                value={value}
                                                onChange={(e) => handleHoursChange(task.id, day, e.target.value)}
                                                className="w-full h-10 text-center bg-transparent rounded-md border-transparent focus:bg-white dark:focus:bg-abz-ink-900 focus:border-abz-primary focus:ring-abz-primary transition"
                                            />
                                        </td>
                                    )
                                })}
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-slate-600 dark:text-slate-300 text-right">{taskTotals.get(task.id)?.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-50 dark:bg-abz-ink-900">
                        <tr>
                            <td className="sticky left-0 bg-slate-50 dark:bg-abz-ink-900 px-4 py-3 text-sm font-bold">Daily Total</td>
                             {dailyTotals.map((total, index) => (
                                <td key={index} className="px-4 py-3 text-center text-sm font-bold">
                                    {total.toFixed(2)}
                                </td>
                            ))}
                            <td className="px-4 py-3 text-right text-sm font-bold">{weeklyTotal.toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

export default TimesheetsView;