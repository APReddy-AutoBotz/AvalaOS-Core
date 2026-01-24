
import React from 'react';
import { Filters, Project, Epic, TaskPriority, TaskType, TaskStatus, ALL_PRIORITIES, ALL_TASK_TYPES, ALL_STATUSES } from '../types';
import { Dropdown, DropdownTrigger, DropdownContent, DropdownItem } from './ui/dropdown';
import { FilterIcon } from './icons';

interface FilterBarProps {
    filters: Filters;
    onFiltersChange: (filters: Filters | ((prev: Filters) => Filters)) => void;
    availableProjects: Project[];
    availableEpics: Epic[];
}

const FilterBar: React.FC<FilterBarProps> = ({ filters, onFiltersChange, availableProjects, availableEpics }) => {
    
    const handleMultiSelectChange = (field: keyof Filters, value: string) => {
        onFiltersChange(prev => {
            const currentValues = (prev[field] as string[] | undefined) || [];
            const newValues = currentValues.includes(value)
                ? currentValues.filter(v => v !== value)
                : [...currentValues, value];
            return { ...prev, [field]: newValues };
        });
    };

    const handleSingleSelectChange = (field: keyof Filters, value: string | undefined) => {
        onFiltersChange(prev => {
            const currentVal = prev[field];
            return { ...prev, [field]: currentVal === value ? undefined : value }
        })
    };

    // Fix: Explicitly type the accumulator `acc` as a number to resolve the type error.
    const activeFilterCount = Object.values(filters).reduce((acc: number, val) => {
        if (Array.isArray(val) && val.length > 0) return acc + val.length;
        if (typeof val === 'string' && val) return acc + 1;
        return acc;
    }, 0);

    return (
        <div className="flex items-center gap-2">
            <Dropdown>
                <DropdownTrigger>
                    <button className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-abz-ink-900 focus:outline-none focus:ring-3 focus:ring-abz-primary relative">
                        <FilterIcon className="w-5 h-5" />
                        <span>Filters</span>
                        {activeFilterCount > 0 && (
                            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-abz-primary text-white text-xs font-bold">
                                {activeFilterCount}
                            </span>
                        )}
                    </button>
                </DropdownTrigger>
                <DropdownContent className="w-80" align="end">
                    <div className="p-2">
                        <h4 className="text-sm font-semibold px-2 pb-1">Filter by Project</h4>
                        <div className="max-h-40 overflow-y-auto">
                            {availableProjects.map(project => (
                                <DropdownItem key={project.id} onSelect={() => handleMultiSelectChange('projectIds', project.id)}>
                                     <input type="checkbox" checked={filters.projectIds?.includes(project.id)} readOnly className="h-4 w-4 rounded border-gray-300 text-abz-primary focus:ring-abz-primary" />
                                     <span>{project.name}</span>
                                </DropdownItem>
                            ))}
                        </div>
                    </div>

                    <div className="p-2">
                        <h4 className="text-sm font-semibold px-2 pb-1">Filter by Epic</h4>
                        <div className="max-h-40 overflow-y-auto">
                            {availableEpics.map(epic => (
                                <DropdownItem key={epic.id} onSelect={() => handleMultiSelectChange('epicIds', epic.id)}>
                                    <input type="checkbox" checked={filters.epicIds?.includes(epic.id)} readOnly className="h-4 w-4 rounded border-gray-300 text-abz-primary focus:ring-abz-primary" />
                                    <span>{epic.name}</span>
                                </DropdownItem>
                            ))}
                             <DropdownItem onSelect={() => handleMultiSelectChange('epicIds', 'unassigned')}>
                                <input type="checkbox" checked={filters.epicIds?.includes('unassigned')} readOnly className="h-4 w-4 rounded border-gray-300 text-abz-primary focus:ring-abz-primary" />
                                <span>Unassigned</span>
                            </DropdownItem>
                        </div>
                    </div>
                    
                    <div className="p-2">
                         <h4 className="text-sm font-semibold px-2 pb-1">Filter by Status</h4>
                         {ALL_STATUSES.map(status => (
                            <DropdownItem key={status} onSelect={() => handleMultiSelectChange('statuses', status)}>
                                <input type="checkbox" checked={filters.statuses?.includes(status)} readOnly className="h-4 w-4 rounded border-gray-300 text-abz-primary focus:ring-abz-primary" />
                                <span>{status}</span>
                            </DropdownItem>
                         ))}
                    </div>

                    <div className="p-2">
                         <h4 className="text-sm font-semibold px-2 pb-1">Filter by Date</h4>
                         <DropdownItem onSelect={() => handleSingleSelectChange('dateRange', 'overdue')}>
                            <input type="radio" name="date-range" checked={filters.dateRange === 'overdue'} readOnly className="h-4 w-4 border-gray-300 text-abz-primary focus:ring-abz-primary" />
                            <span>Overdue</span>
                         </DropdownItem>
                         <DropdownItem onSelect={() => handleSingleSelectChange('dateRange', 'dueSoon')}>
                             <input type="radio" name="date-range" checked={filters.dateRange === 'dueSoon'} readOnly className="h-4 w-4 border-gray-300 text-abz-primary focus:ring-abz-primary" />
                            <span>Due This Week</span>
                         </DropdownItem>
                    </div>

                     <div className="p-2 mt-2 border-t border-slate-200 dark:border-gray-700">
                        <DropdownItem onSelect={() => onFiltersChange({})}>
                            <span className="text-abz-danger font-semibold">Clear all filters</span>
                        </DropdownItem>
                     </div>
                </DropdownContent>
            </Dropdown>
        </div>
    );
};

export default FilterBar;