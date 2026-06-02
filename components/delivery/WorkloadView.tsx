import React, { useMemo } from 'react';
import { Task, User } from '../../types';
import { Tooltip } from '../shared/ui/Tooltip';

interface WorkloadViewProps {
    tasks: Task[];
    users: User[];
}

const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

const getDaysBetween = (startDate: Date, endDate: Date): number => {
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};

const getLoadColor = (load: number): string => {
    if (load === 0) return 'bg-slate-100 dark:bg-surface-dark';
    if (load <= 3) return 'bg-green-200 dark:bg-green-800/50';
    if (load <= 5) return 'bg-yellow-200 dark:bg-yellow-800/50';
    if (load <= 8) return 'bg-orange-300 dark:bg-orange-700/50';
    return 'bg-red-400 dark:bg-red-600/50';
};

const WorkloadView: React.FC<WorkloadViewProps> = ({ tasks, users }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { timeRange, workloadData } = useMemo(() => {
        const startDate = addDays(today, -today.getDay()); // Start from the beginning of the current week (Sunday)
        const timeRange: Date[] = [];
        for (let i = 0; i < 28; i++) { // 4 weeks
            timeRange.push(addDays(startDate, i));
        }

        const workloadData = new Map<string, { dailyLoad: Map<string, number>, tasks: Map<string, Task[]> }>();

        users.forEach(user => {
            const dailyLoad = new Map<string, number>();
            const tasksByUser = new Map<string, Task[]>();
            timeRange.forEach(date => {
                dailyLoad.set(date.toISOString().split('T')[0], 0);
                tasksByUser.set(date.toISOString().split('T')[0], []);
            });

            tasks.forEach(task => {
                if (task.assigneeIds.includes(user.id) && task.storyPoints) {
                    const taskStart = new Date(task.startDate);
                    const taskEnd = new Date(task.dueDate);
                    const duration = getDaysBetween(taskStart, taskEnd) + 1;
                    const dailyPoints = task.storyPoints / duration;

                    for (let d = new Date(taskStart); d <= taskEnd; d.setDate(d.getDate() + 1)) {
                        const dateKey = d.toISOString().split('T')[0];
                        if (dailyLoad.has(dateKey)) {
                            dailyLoad.set(dateKey, (dailyLoad.get(dateKey) || 0) + dailyPoints);
                            tasksByUser.get(dateKey)?.push(task);
                        }
                    }
                }
            });
            workloadData.set(user.id, { dailyLoad, tasks: tasksByUser });
        });

        return { timeRange, workloadData };
    }, [tasks, users, today]);

    return (
        <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-soft border border-slate-200 dark:border-gray-700 overflow-hidden" style={{ height: 'calc(100vh - 160px)' }}>
            <div className="overflow-x-auto h-full">
                <div className="inline-block min-w-full align-middle">
                    <table className="min-w-full border-separate" style={{ borderSpacing: 0 }}>
                        <thead className="bg-slate-50 dark:bg-abz-ink sticky top-0 z-10">
                            <tr>
                                <th scope="col" className="sticky left-0 bg-slate-50 dark:bg-abz-ink z-20 p-2 w-48 text-left text-sm font-semibold border-b border-r border-slate-200 dark:border-gray-700">
                                    Team Member
                                </th>
                                {timeRange.map((date, i) => (
                                    <th key={i} scope="col" className="p-2 text-center text-sm font-semibold border-b border-r border-slate-200 dark:border-gray-700 min-w-[60px]">
                                        <div>{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                                        <div className="text-xs font-normal">{date.getDate()}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-surface-dark">
                            {users.map((user, userIndex) => (
                                <tr key={user.id} className={userIndex % 2 === 0 ? undefined : 'bg-slate-50/50 dark:bg-abz-ink/50'}>
                                    <td className="sticky left-0 bg-white dark:bg-surface-dark p-2 w-48 font-medium text-sm border-b border-r border-slate-200 dark:border-gray-700">
                                        {user.name}
                                    </td>
                                    {timeRange.map((date, dayIndex) => {
                                        const dateKey = date.toISOString().split('T')[0];
                                        const load = workloadData.get(user.id)?.dailyLoad.get(dateKey) || 0;
                                        const tasksForDay = workloadData.get(user.id)?.tasks.get(dateKey) || [];
                                        const tooltipContent = tasksForDay.length > 0 ? tasksForDay.map(t => t.title).join(', ') : 'No tasks';
                                        return (
                                            <td key={dayIndex} className={`border-b border-r border-slate-200 dark:border-gray-700`}>
                                                <Tooltip content={`${Math.round(load * 10) / 10} points: ${tooltipContent}`}>
                                                    <div className={`w-full h-full p-2 text-center text-sm font-bold text-slate-700 dark:text-slate-200 ${getLoadColor(load)}`}>
                                                        {load > 0 ? Math.round(load * 10) / 10 : ''}
                                                    </div>
                                                </Tooltip>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default WorkloadView;
