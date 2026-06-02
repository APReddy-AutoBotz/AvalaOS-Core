import React, { useState, useMemo } from 'react';
import { Task, Project, TaskStatus } from '../../types';
import { ChevronLeftIcon, ChevronRightIcon } from '../shared/icons';

interface CalendarViewProps {
    tasks: Task[];
    projects: Project[];
    onSelectTask: (task: Task) => void;
}

const statusColorClasses: Record<TaskStatus, { bg: string, text: string, border: string }> = {
    'To Do': { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-800 dark:text-slate-200', border: 'border-slate-300 dark:border-slate-600' },
    'In Progress': { bg: 'bg-abz-azure-500/10', text: 'text-abz-azure-500', border: 'border-abz-azure-500/30' },
    'In Review': { bg: 'bg-abz-violet-500/10', text: 'text-abz-violet-500', border: 'border-abz-violet-500/30' },
    'Testing': { bg: 'bg-abz-indigo-500/10', text: 'text-abz-indigo-500', border: 'border-abz-indigo-500/30' },
    'Ready for Release': { bg: 'bg-abz-teal-500/10', text: 'text-abz-teal-500', border: 'border-abz-teal-500/30' },
    'Done': { bg: 'bg-abz-emerald-500/10', text: 'text-abz-emerald-500', border: 'border-abz-emerald-500/30' },
    'Blocked': { bg: 'bg-abz-red-500/10', text: 'text-abz-red-500', border: 'border-abz-red-500/30' },
    'On Hold': { bg: 'bg-abz-amber-500/10', text: 'text-abz-amber-500', border: 'border-abz-amber-500/30' },
};


const CalendarView: React.FC<CalendarViewProps> = ({ tasks, projects, onSelectTask }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const tasksByDueDate = useMemo(() => {
        return tasks.reduce((acc, task) => {
            const dueDate = task.dueDate;
            if (!acc[dueDate]) {
                acc[dueDate] = [];
            }
            acc[dueDate].push(task);
            return acc;
        }, {} as Record<string, Task[]>);
    }, [tasks]);

    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    const calendarGrid = useMemo(() => {
        const grid: { date: Date, isCurrentMonth: boolean }[][] = [];
        const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 for Sunday
        const lastDayOfPrevMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0).getDate();
        const lastDayOfThisMonth = lastDayOfMonth.getDate();
        
        let currentDay = 1;
        let nextMonthDay = 1;
        
        for (let i = 0; i < 6; i++) { // 6 weeks for full coverage
            const week: { date: Date, isCurrentMonth: boolean }[] = [];
            for (let j = 0; j < 7; j++) {
                if (i === 0 && j < startingDayOfWeek) {
                    // Previous month's days
                    const day = lastDayOfPrevMonth - startingDayOfWeek + j + 1;
                    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, day);
                    week.push({ date, isCurrentMonth: false });
                } else if (currentDay > lastDayOfThisMonth) {
                    // Next month's days
                    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, nextMonthDay++);
                    week.push({ date, isCurrentMonth: false });
                } else {
                    // Current month's days
                    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDay);
                    week.push({ date, isCurrentMonth: true });
                    currentDay++;
                }
            }
            grid.push(week);
            if (currentDay > lastDayOfThisMonth) break;
        }
        return grid;
    }, [currentDate, firstDayOfMonth, lastDayOfMonth]);


    const goToPreviousMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const goToNextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };
    
    const isToday = (date: Date) => {
      const today = new Date();
      return date.getDate() === today.getDate() &&
             date.getMonth() === today.getMonth() &&
             date.getFullYear() === today.getFullYear();
    };

    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
        <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-soft border border-slate-200 dark:border-gray-700 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 200px)' }}>
            <div className="p-4 flex items-center justify-between border-b border-slate-200 dark:border-gray-700 flex-shrink-0">
                <h2 className="text-lg font-bold">
                    {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </h2>
                <div className="flex items-center gap-2">
                    <button onClick={goToPreviousMonth} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-abz-ink-900">
                        <ChevronLeftIcon className="w-5 h-5" />
                    </button>
                    <button onClick={goToNextMonth} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-abz-ink-900">
                        <ChevronRightIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>
            <div className="flex-grow flex flex-col">
                <div className="grid grid-cols-7">
                    {weekdays.map((day, index) => (
                        <div key={day} className={`text-center font-semibold text-xs text-slate-500 py-2 border-b border-r border-slate-200 dark:border-gray-700 ${index === 0 || index === 6 ? 'bg-slate-50/70 dark:bg-abz-ink/70' : ''}`}>{day}</div>
                    ))}
                </div>
                 <div className="grid grid-cols-7 grid-rows-6 flex-grow">
                    {calendarGrid.flat().map(({ date, isCurrentMonth }, index) => {
                        const dateKey = date.toISOString().split('T')[0];
                        const dayTasks = tasksByDueDate[dateKey] || [];
                        const dayOfWeek = date.getDay();
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                        
                        return (
                            <div key={index} className={`border-r border-b border-slate-200 dark:border-gray-700 p-2 relative flex flex-col ${!isCurrentMonth ? 'bg-slate-50/50 dark:bg-abz-ink/50' : ''} ${isWeekend && isCurrentMonth ? 'bg-slate-50/70 dark:bg-abz-ink/70' : ''}`}>
                                <span className={`font-semibold text-sm ${isToday(date) ? 'bg-abz-primary text-white rounded-full h-6 w-6 flex items-center justify-center' : ''} ${!isCurrentMonth ? 'text-slate-400 dark:text-slate-600' : ''}`}>
                                    {date.getDate()}
                                </span>
                                <div className="mt-2 space-y-1 overflow-y-auto">
                                    {dayTasks.map(task => {
                                        const colors = statusColorClasses[task.status];
                                        return (
                                            <button key={task.id} onClick={() => onSelectTask(task)} className={`w-full text-left p-1.5 rounded-md text-xs font-medium border ${colors.bg} ${colors.text} ${colors.border} hover:opacity-80`}>
                                                <p className="truncate">{task.title}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default CalendarView;
