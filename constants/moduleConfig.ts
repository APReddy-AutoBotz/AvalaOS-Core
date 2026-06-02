import { ProductModuleKey, View } from '../types';

export const ALL_PRODUCT_MODULES: {
    key: ProductModuleKey;
    label: string;
    shortLabel: string;
    description: string;
}[] = [
    {
        key: 'assess',
        label: 'Assess',
        shortLabel: 'Assess',
        description: 'Process intake, automation fit, AI/RPA/HITL decisions, governance review, and decision packs.',
    },
    {
        key: 'docs',
        label: 'Docs',
        shortLabel: 'Docs',
        description: 'Generate and review BRD, PRD, PDD, diagrams, approval artifacts, and document templates.',
    },
    {
        key: 'delivery',
        label: 'Delivery',
        shortLabel: 'Delivery',
        description: 'Backlog, sprint planning, delivery boards, resource capacity, automations, and execution tracking.',
    },
    {
        key: 'monitor',
        label: 'Monitor',
        shortLabel: 'Monitor',
        description: 'Executive portfolio visibility, reports, insights, health, risks, and value realization.',
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
