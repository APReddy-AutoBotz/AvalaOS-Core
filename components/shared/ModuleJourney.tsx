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
        <div className="border-b border-slate-200/80 bg-white/70 px-4 py-2 backdrop-blur-lg dark:border-slate-800 dark:bg-slate-950/55 sm:px-5 lg:px-6">
            <div className="mx-auto flex max-w-[1540px] items-center gap-4">
                <div className="hidden min-w-[200px] xl:block">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                        {isSingleModule ? 'Configured workspace' : 'Operating lifecycle'}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-bold text-[#002C4B] dark:text-slate-200">
                        {isSingleModule
                            ? `${visibleModules[0].module.label} module enabled`
                            : formatOperatingLifecycleLabel(journeySteps)}
                    </p>
                </div>

                <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
                    {journeySteps.map((step, index) => {
                        const connector = index > 0 && (
                            <div className="hidden h-px w-4 flex-none bg-slate-200 dark:bg-slate-700 md:block" />
                        );

                        if (step.kind === 'govern-lite') {
                            return (
                                <React.Fragment key={step.key}>
                                    {connector}
                                    <div
                                        role="listitem"
                                        aria-label={`${step.label}: ${step.detail}`}
                                        title={step.detail}
                                        className="flex min-w-[164px] items-center gap-2 rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-left dark:border-amber-400/25 dark:bg-amber-400/8"
                                    >
                                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#002C4B] text-[#ffbc03] dark:bg-amber-300 dark:text-[#002C4B]">
                                            <ClipboardDocumentListIcon className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-xs font-extrabold text-[#002C4B] dark:text-amber-100">{step.shortLabel}</p>
                                            <p className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">{step.outcome}</p>
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
                                {connector}
                                <button
                                    type="button"
                                    onClick={() => isClickable && onNavigate(homeView)}
                                    disabled={!isClickable}
                                    aria-disabled={!isClickable}
                                    title={isClickable ? module.label : blockedJourneyTitle(access)}
                                    className={`group flex min-w-[154px] items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${isActive
                                        ? 'border-[#0b4f7d]/45 bg-[#0b4f7d]/8'
                                        : isClickable
                                            ? 'border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-800'
                                            : 'cursor-not-allowed border-slate-200 bg-white/50 opacity-55 dark:border-slate-800 dark:bg-slate-900/40'
                                    }`}
                                >
                                    <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${isActive ? 'bg-[#0b4f7d] text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>
                                        {isActive ? <CheckCircleIcon className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate text-xs font-extrabold text-slate-950 dark:text-white">{module.shortLabel}</p>
                                        <p className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">{step.outcome}</p>
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
