import React from 'react';
import { ProductModuleKey, View } from '../../types';
import {
    CheckCircleIcon,
    ClipboardListIcon,
    DocumentTextIcon,
    ViewBoardsIcon,
    ChartPieIcon,
} from './icons';
import { ALL_PRODUCT_MODULES, getEnabledModules, MODULE_HOME_VIEW, VIEW_MODULE_MAP } from '../../constants/moduleConfig';

interface ModuleJourneyProps {
    enabledModules?: ProductModuleKey[];
    currentView: View;
    onNavigate: (view: View) => void;
}

const moduleIcon: Record<ProductModuleKey, React.FC<{ className?: string }>> = {
    assess: ClipboardListIcon,
    docs: DocumentTextIcon,
    delivery: ViewBoardsIcon,
    monitor: ChartPieIcon,
};

const moduleOutcome: Record<ProductModuleKey, string> = {
    assess: 'Decision pack',
    docs: 'Governed docs',
    delivery: 'Evidence-backed handoff',
    monitor: 'Value insights',
};

const ModuleJourney: React.FC<ModuleJourneyProps> = ({ enabledModules, currentView, onNavigate }) => {
    const enabled = getEnabledModules(enabledModules);
    const activeModule = VIEW_MODULE_MAP[currentView];
    const visibleModules = ALL_PRODUCT_MODULES.filter(module => enabled.includes(module.key));
    const isSingleModule = visibleModules.length === 1;

    if (visibleModules.length === 0) return null;

    return (
        <div className="border-b border-slate-200/70 bg-white/56 px-4 py-3 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/42 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1480px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                        {isSingleModule ? 'Configured workspace' : 'Operating lifecycle'}
                    </p>
                    <p className="mt-1 text-sm font-black text-[#002C4B] dark:text-white">
                        {isSingleModule
                            ? `${visibleModules[0].label} module enabled`
                            : 'Avala Assess -> Avala Studio -> Avala Delivery Lite -> Avala Monitor'}
                    </p>
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto xl:justify-end">
                    {visibleModules.map((module, index) => {
                        const Icon = moduleIcon[module.key];
                        const isActive = activeModule === module.key;
                        return (
                            <React.Fragment key={module.key}>
                                {index > 0 && (
                                    <div className="hidden h-px min-w-6 flex-1 bg-slate-200 dark:bg-slate-800 md:block" />
                                )}
                                <button
                                    type="button"
                                    onClick={() => onNavigate(MODULE_HOME_VIEW[module.key])}
                                    className={`group flex min-w-[190px] items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${isActive
                                        ? 'border-[#ffbc03]/70 bg-[#ffbc03]/12 shadow-lg shadow-[#ffbc03]/10'
                                        : 'border-slate-200/80 bg-white/72 hover:border-[#ffbc03]/40 hover:bg-[#ffbc03]/8 dark:border-slate-800 dark:bg-slate-900/54'
                                        }`}
                                >
                                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${isActive ? 'bg-[#ffbc03] text-[#002C4B]' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>
                                        {isActive ? <CheckCircleIcon className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-black text-slate-950 dark:text-white">{module.shortLabel}</p>
                                        <p className="truncate text-xs font-bold text-slate-500 dark:text-slate-400">{moduleOutcome[module.key]}</p>
                                    </div>
                                </button>
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default ModuleJourney;
