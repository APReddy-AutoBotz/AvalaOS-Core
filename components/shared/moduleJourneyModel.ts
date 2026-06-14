import { ProductModuleKey } from '../../types';
import { ALL_PRODUCT_MODULES } from '../../constants/moduleConfig';

export const GOVERN_LITE_LIFECYCLE_STEP_KEY = 'govern-lite';

type GovernLiteLifecycleStepKey = typeof GOVERN_LITE_LIFECYCLE_STEP_KEY;

export interface ModuleLifecycleStep {
    kind: 'module';
    key: ProductModuleKey;
    label: string;
    shortLabel: string;
    outcome: string;
}

export interface GovernLiteLifecycleStep {
    kind: 'govern-lite';
    key: GovernLiteLifecycleStepKey;
    label: 'Avala Govern';
    shortLabel: 'Avala Govern';
    outcome: 'Decision controls';
    detail: string;
    visualOnly: true;
}

export type OperatingLifecycleStep = ModuleLifecycleStep | GovernLiteLifecycleStep;

const moduleOutcome: Record<ProductModuleKey, string> = {
    assess: 'Decision Pack',
    docs: 'Governed docs',
    delivery: 'Evidence-backed handoff',
    monitor: 'Value insights',
};

const moduleLabelByKey = new Map(ALL_PRODUCT_MODULES.map(module => [module.key, module]));

export const GOVERN_LITE_LIFECYCLE_STEP: GovernLiteLifecycleStep = {
    kind: 'govern-lite',
    key: GOVERN_LITE_LIFECYCLE_STEP_KEY,
    label: 'Avala Govern',
    shortLabel: 'Avala Govern',
    outcome: 'Decision controls',
    detail: 'Deterministic Decision Pack, control card, human review, evidence, assumptions, and governed handoff to Studio.',
    visualOnly: true,
};

export function buildOperatingLifecycleSteps(moduleKeys: ProductModuleKey[]): OperatingLifecycleStep[] {
    const shouldShowGovernLite = moduleKeys.includes('assess') && moduleKeys.includes('docs');
    const steps: OperatingLifecycleStep[] = [];

    moduleKeys.forEach(key => {
        const module = moduleLabelByKey.get(key);
        if (!module) return;

        steps.push({
            kind: 'module',
            key,
            label: module.label,
            shortLabel: module.shortLabel,
            outcome: moduleOutcome[key],
        });

        if (key === 'assess' && shouldShowGovernLite) {
            steps.push(GOVERN_LITE_LIFECYCLE_STEP);
        }
    });

    return steps;
}

export function formatOperatingLifecycleLabel(steps: OperatingLifecycleStep[]) {
    return steps.map(step => step.label).join(' -> ');
}
