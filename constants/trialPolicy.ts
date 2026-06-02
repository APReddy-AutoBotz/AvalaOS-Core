import { SubscriptionPolicy } from '../types';

export const FREE_TRIAL_POLICY: SubscriptionPolicy = {
    maxOrgs: 1,
    maxProcesses: 5,
    maxTemplates: 2,
    reportVisibility: 'Truncated',
    hasExport: false,
};

export const PREMIUM_POLICY: SubscriptionPolicy = {
    maxOrgs: 1,
    maxProcesses: 50,
    maxTemplates: 10,
    reportVisibility: 'Full',
    hasExport: true,
};

export const ENTERPRISE_POLICY: SubscriptionPolicy = {
    maxOrgs: 999, // Practically unlimited
    maxProcesses: 9999,
    maxTemplates: 999,
    reportVisibility: 'Full',
    hasExport: true,
};

export function getSubscriptionLimits(tier: 'Free_Trial' | 'Premium' | 'Enterprise'): SubscriptionPolicy {
    switch (tier) {
        case 'Free_Trial': return FREE_TRIAL_POLICY;
        case 'Premium': return PREMIUM_POLICY;
        case 'Enterprise': return ENTERPRISE_POLICY;
        default: return FREE_TRIAL_POLICY;
    }
}
