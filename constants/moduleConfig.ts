import { ProductModuleKey, View } from '../types';

export const ALL_PRODUCT_MODULES: {
    key: ProductModuleKey;
    label: string;
    shortLabel: string;
    description: string;
}[] = [
    {
        key: 'assess',
        label: 'Avala Assess',
        shortLabel: 'Avala Assess',
        description: 'Process intake, deterministic scoring, automation/AI/RPA/workflow/HITL/agentic fitment, and decision packs.',
    },
    {
        key: 'docs',
        label: 'Avala Studio',
        shortLabel: 'Avala Studio',
        description: 'Draft editable review documents, diagrams, work items, and governed templates for human sign-off.',
    },
    {
        key: 'delivery',
        label: 'Avala Delivery',
        shortLabel: 'Avala Delivery',
        description: 'Approved work items, board, owners, status, blockers, and handoff lineage without replacing delivery systems.',
    },
    {
        key: 'monitor',
        label: 'Avala Monitor',
        shortLabel: 'Avala Monitor',
        description: 'Readiness, lineage, blockers, value signals, and executive-ready handoff visibility.',
    },
];

export const DEFAULT_ENABLED_MODULES: ProductModuleKey[] = ['assess', 'docs', 'delivery', 'monitor'];

export const MODULE_HOME_VIEW: Record<ProductModuleKey, View> = {
    assess: View.PROCESS_CATALOG,
    docs: View.DOCS_FORGE,
    delivery: View.BOARDS,
    monitor: View.DASHBOARD,
};

export const VIEW_MODULE_MAP: Partial<Record<View, ProductModuleKey>> = {
    [View.PROCESS_CATALOG]: 'assess',
    [View.TEMPLATE_LIBRARY]: 'assess',
    [View.PROCESS_DETAIL]: 'assess',
    [View.GUIDED_ASSESSMENT]: 'assess',

    [View.DOCS_FORGE]: 'docs',
    [View.DOCS]: 'docs',
    [View.TEMPLATE_STUDIO]: 'docs',
    [View.WORKSPACE]: 'docs',

    [View.BOARDS]: 'delivery',
    [View.TEAMS]: 'delivery',
    [View.LIST]: 'delivery',
    [View.CALENDAR]: 'delivery',
    [View.GANTT]: 'delivery',
    [View.WORKLOAD]: 'delivery',
    [View.ROADMAP]: 'delivery',
    [View.BACKLOG]: 'delivery',
    [View.SPRINT_PLANNING]: 'delivery',
    [View.AUTOMATIONS]: 'delivery',
    [View.DELIVERY_PACK]: 'delivery',
    [View.TIMESHEETS]: 'delivery',

    [View.DASHBOARD]: 'monitor',
    [View.REPORTS]: 'monitor',
    [View.PORTFOLIO]: 'monitor',
};

export function getEnabledModules(enabledModules?: ProductModuleKey[]) {
    return enabledModules && enabledModules.length > 0 ? enabledModules : DEFAULT_ENABLED_MODULES;
}

export function isModuleEnabled(module: ProductModuleKey | undefined, enabledModules?: ProductModuleKey[]) {
    if (!module) return true;
    return getEnabledModules(enabledModules).includes(module);
}

export function isViewEnabled(view: View, enabledModules?: ProductModuleKey[]) {
    return isModuleEnabled(VIEW_MODULE_MAP[view], enabledModules);
}

export function firstEnabledView(enabledModules?: ProductModuleKey[]) {
    const enabled = getEnabledModules(enabledModules);
    return MODULE_HOME_VIEW[enabled[0] || 'assess'];
}
