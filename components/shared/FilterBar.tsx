
import React from 'react';
import { Filters, Project, Epic, ALL_PRIORITIES, ALL_TASK_TYPES, ALL_STATUSES } from '../../types';
import { Dropdown, DropdownTrigger, DropdownContent, DropdownGroupLabel, DropdownItem, DropdownSeparator } from './ui/dropdown';
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
    const activeFilterCount = (Object.values(filters) as unknown[]).reduce<number>((acc, val) => {
        if (Array.isArray(val) && val.length > 0) return acc + val.length;
        if (typeof val === 'string' && val) return acc + 1;
        return acc;
    }, 0);

    return (
        <div className="flex items-center gap-2">
            <Dropdown>
                <DropdownTrigger>
                    <button
                        type="button"
                        className="relative flex items-center gap-2 rounded-2xl border border-[#002C4B]/15 bg-white px-3 py-2 text-sm font-black text-[#002C4B] shadow-sm transition-all hover:border-[#ffbc03] hover:shadow-md focus:outline-none focus:ring-3 focus:ring-[#ffbc03]/40 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    >
                        <FilterIcon className="w-5 h-5" />
                        <span>Filter work</span>
                        {activeFilterCount > 0 && (
                            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#ffbc03] text-[11px] font-black text-[#002C4B] shadow-sm">
                                {activeFilterCount}
                            </span>
                        )}
                    </button>
                </DropdownTrigger>
                <DropdownContent className="w-[360px] max-h-[74vh] overflow-hidden" align="end">
                    <div className="border-b border-slate-200 px-4 pb-3 pt-2 dark:border-slate-800">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ffbc03]">Refine work view</p>
                        <p className="mt-1 text-sm font-semibold leading-5 text-slate-500 dark:text-slate-400">
                            Select one or more filters. The work list updates instantly.
                        </p>
                    </div>
                    <div className="max-h-[58vh] overflow-y-auto py-2">
                    {availableProjects.length > 1 && (
                        <div className="px-2">
                            <DropdownGroupLabel>Project</DropdownGroupLabel>
                            {availableProjects.map(project => (
                                <DropdownItem key={project.id} closeOnSelect={false} onSelect={() => handleMultiSelectChange('projectIds', project.id)}>
                                     <input type="checkbox" checked={filters.projectIds?.includes(project.id)} readOnly className="h-4 w-4 rounded border-gray-300 text-abz-primary focus:ring-abz-primary" />
                                     <span>{project.name}</span>
                                </DropdownItem>
                            ))}
                        </div>
                    )}

                    <DropdownSeparator />
                    <div className="px-2">
                        <DropdownGroupLabel>Epic</DropdownGroupLabel>
                        {availableEpics.length > 0 ? (
                            availableEpics.map(epic => (
                                <DropdownItem key={epic.id} closeOnSelect={false} onSelect={() => handleMultiSelectChange('epicIds', epic.id)}>
                                    <input type="checkbox" checked={filters.epicIds?.includes(epic.id)} readOnly className="h-4 w-4 rounded border-gray-300 text-abz-primary focus:ring-abz-primary" />
                                    <span>{epic.name}</span>
                                </DropdownItem>
                            ))
                        ) : (
                            <div className="px-4 py-2 text-xs font-semibold text-slate-400">No epics available in this view.</div>
                        )}
                             <DropdownItem closeOnSelect={false} onSelect={() => handleMultiSelectChange('epicIds', 'unassigned')}>
                                <input type="checkbox" checked={filters.epicIds?.includes('unassigned')} readOnly className="h-4 w-4 rounded border-gray-300 text-abz-primary focus:ring-abz-primary" />
                                <span>Unassigned</span>
                            </DropdownItem>
                    </div>
                    
                    <DropdownSeparator />
                    <div className="px-2">
                         <DropdownGroupLabel>Status</DropdownGroupLabel>
                         {ALL_STATUSES.map(status => (
                            <DropdownItem key={status} closeOnSelect={false} onSelect={() => handleMultiSelectChange('statuses', status)}>
                                <input type="checkbox" checked={filters.statuses?.includes(status)} readOnly className="h-4 w-4 rounded border-gray-300 text-abz-primary focus:ring-abz-primary" />
                                <span>{status}</span>
                            </DropdownItem>
                         ))}
                    </div>

                    <DropdownSeparator />
                    <div className="grid grid-cols-2 gap-2 px-4 py-2">
                        <div>
                            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Priority</p>
                            <div className="space-y-1">
                                {ALL_PRIORITIES.map(priority => (
                                    <label key={priority} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold text-slate-700 hover:bg-[#ffbc03]/10 dark:text-slate-200">
                                        <input type="checkbox" checked={filters.priorities?.includes(priority)} onChange={() => handleMultiSelectChange('priorities', priority)} className="h-4 w-4 rounded border-gray-300 text-abz-primary focus:ring-abz-primary" />
                                        {priority}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Type</p>
                            <div className="space-y-1">
                                {ALL_TASK_TYPES.map(type => (
                                    <label key={type} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold text-slate-700 hover:bg-[#ffbc03]/10 dark:text-slate-200">
                                        <input type="checkbox" checked={filters.types?.includes(type)} onChange={() => handleMultiSelectChange('types', type)} className="h-4 w-4 rounded border-gray-300 text-abz-primary focus:ring-abz-primary" />
                                        {type}
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    <DropdownSeparator />
                    <div className="px-2">
                         <DropdownGroupLabel>Due date</DropdownGroupLabel>
                         <DropdownItem closeOnSelect={false} onSelect={() => handleSingleSelectChange('dateRange', 'overdue')}>
                            <input type="radio" name="date-range" checked={filters.dateRange === 'overdue'} readOnly className="h-4 w-4 border-gray-300 text-abz-primary focus:ring-abz-primary" />
                            <span>Overdue</span>
                         </DropdownItem>
                         <DropdownItem closeOnSelect={false} onSelect={() => handleSingleSelectChange('dateRange', 'dueSoon')}>
                             <input type="radio" name="date-range" checked={filters.dateRange === 'dueSoon'} readOnly className="h-4 w-4 border-gray-300 text-abz-primary focus:ring-abz-primary" />
                            <span>Due This Week</span>
                         </DropdownItem>
                    </div>

                     <div className="mt-2 border-t border-slate-200 p-2 dark:border-gray-800">
                        <DropdownItem onSelect={() => onFiltersChange({})}>
                            <span className="font-black text-red-600">Clear all filters</span>
                        </DropdownItem>
                     </div>
                     </div>
                </DropdownContent>
            </Dropdown>
        </div>
    );
};

export default FilterBar;
