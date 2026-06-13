import React from 'react';
import { ProductModuleKey, Scope, ScopeType, View } from '../../types';
import {
    CheckCircleIcon,
    ClipboardListIcon,
    ClipboardDocumentListIcon,
    DocumentTextIcon,
    ViewBoardsIcon,
    ChartPieIcon,
} from './icons';
import { ALL_PRODUCT_MODULES, getEnabledModules, MODULE_HOME_VIEW } from '../../constants/moduleConfig';
import { useAuth } from '../auth/AuthProvider';
import { useOrganizationContext } from '../auth/OrganizationProvider';
import { resolveViewAccess, VIEW_ACCESS_METADATA, type ViewAccessReason, type ViewAccessResult } from '../../services/viewAccessGuard';
import { buildOperatingLifecycleSteps, formatOperatingLifecycleLabel } from './moduleJourneyModel';

interface ModuleJourneyProps {
    enabledModules?: ProductModuleKey[];
    currentScope: Scope;
    currentView: View;
    onNavigate: (view: View) => void;
}

const moduleIcon: Record<ProductModuleKey, React.FC<{ className?: string }>> = {
    assess: ClipboardListIcon,
    docs: DocumentTextIcon,
    delivery: ViewBoardsIcon,
    monitor: ChartPieIcon,
};

const hiddenJourneyReasons: ViewAccessReason[] = [
    'auth_loading',
    'unauthenticated',
    'no_organization',
    'setup_required',
    'disabled_module',
    'missing_permission',
    'stale_persisted_view',
    'deferred_view',
    'admin_decision_pending',
];

const formatScopeLabel = (scope: ScopeType) => {
    if (scope === ScopeType.MY_WORK) return 'My Work';
    return scope.charAt(0).toUpperCase() + scope.slice(1);
};

const blockedJourneyTitle = (access: ViewAccessResult) => {
    if (access.reason === 'invalid_scope' && access.requiredScope.length > 0) {
        return `Available in ${access.requiredScope.map(formatScopeLabel).join(', ')} scope`;
    }
    return 'Not available in the current workspace';
};

const ModuleJourney: React.FC<ModuleJourneyProps> = ({ enabledModules, currentScope, currentView, onNavigate }) => {
    const { user, loading: authLoading } = useAuth();
    const { currentOrganization, loading: orgLoading } = useOrganizationContext();
    const enabled = getEnabledModules(enabledModules);
    const activeModule = VIEW_ACCESS_METADATA[currentView]?.module;
    const guardLoading = authLoading || orgLoading;
    const visibleModules = ALL_PRODUCT_MODULES
        .filter(module => enabled.includes(module.key))
        .map(module => {
            const homeView = MODULE_HOME_VIEW[module.key];
            const access = resolveViewAccess({
                user,
                authLoading: guardLoading,
                organization: currentOrganization,
                enabledModules: enabled,
                view: homeView,
                scope: currentScope,
            });
            return { module, homeView, access };
        })
        .filter(item => item.access.allowed || !hiddenJourneyReasons.includes(item.access.reason));
    const visibleModuleByKey = new Map(visibleModules.map(item => [item.module.key, item]));
    const journeySteps = buildOperatingLifecycleSteps(visibleModules.map(item => item.module.key));
    const isSingleModule = visibleModules.length === 1 && journeySteps.length === 1;

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
                            ? `${visibleModules[0].module.label} module enabled`
                            : formatOperatingLifecycleLabel(journeySteps)}
                    </p>
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto xl:justify-end">
                    {journeySteps.map((step, index) => {
                        if (step.kind === 'govern-lite') {
                            return (
                                <React.Fragment key={step.key}>
                                    {index > 0 && (
                                        <div className="hidden h-px min-w-6 flex-1 bg-slate-200 dark:bg-slate-800 md:block" />
                                    )}
                                    <div
                                        role="listitem"
                                        aria-label={`${step.label}: ${step.detail}`}
                                        title={step.detail}
                                        className="flex min-w-[210px] items-center gap-3 rounded-2xl border border-[#ffbc03]/45 bg-[#ffbc03]/10 px-4 py-3 text-left shadow-sm shadow-[#ffbc03]/5 dark:border-[#ffbc03]/30 dark:bg-[#ffbc03]/8"
                                    >
                                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#002C4B] text-[#ffbc03] dark:bg-[#ffbc03] dark:text-[#002C4B]">
                                            <ClipboardDocumentListIcon className="h-5 w-5" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-black text-[#002C4B] dark:text-[#ffefb0]">{step.shortLabel}</p>
                                            <p className="truncate text-xs font-bold text-slate-600 dark:text-slate-300">{step.outcome}</p>
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        }

                        const journeyItem = visibleModuleByKey.get(step.key);
                        if (!journeyItem) return null;

                        const { module, homeView, access } = journeyItem;
                        const Icon = moduleIcon[module.key];
                        const isActive = activeModule === module.key;
                        const isClickable = access.allowed;
                        return (
                            <React.Fragment key={module.key}>
                                {index > 0 && (
                                    <div className="hidden h-px min-w-6 flex-1 bg-slate-200 dark:bg-slate-800 md:block" />
                                )}
                                <button
                                    type="button"
                                    onClick={() => isClickable && onNavigate(homeView)}
                                    disabled={!isClickable}
                                    aria-disabled={!isClickable}
                                    title={isClickable ? module.label : blockedJourneyTitle(access)}
                                    className={`group flex min-w-[190px] items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${isActive
                                        ? 'border-[#ffbc03]/70 bg-[#ffbc03]/12 shadow-lg shadow-[#ffbc03]/10'
                                        : isClickable
                                            ? 'border-slate-200/80 bg-white/72 hover:border-[#ffbc03]/40 hover:bg-[#ffbc03]/8 dark:border-slate-800 dark:bg-slate-900/54'
                                            : 'cursor-not-allowed border-slate-200/70 bg-white/50 opacity-60 dark:border-slate-800 dark:bg-slate-900/40'
                                        }`}
                                >
                                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${isActive ? 'bg-[#ffbc03] text-[#002C4B]' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>
                                        {isActive ? <CheckCircleIcon className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-black text-slate-950 dark:text-white">{module.shortLabel}</p>
                                        <p className="truncate text-xs font-bold text-slate-500 dark:text-slate-400">{step.outcome}</p>
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
