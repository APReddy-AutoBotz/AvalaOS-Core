import { useMemo } from 'react';
import { TemplatePack } from '../types';
import { ALL_TEMPLATE_PACKS } from '../constants/starterPacks';
import { useOrganization } from './organizationService';

export function useTemplateService() {
    const { currentOrganization } = useOrganization();

    const availablePacks = useMemo(() => {
        if (!currentOrganization) return [];

        const isPremiumOrg = currentOrganization.subscriptionTier === 'Premium' || currentOrganization.subscriptionTier === 'Enterprise';

        return ALL_TEMPLATE_PACKS.map(pack => ({
            ...pack,
            // If it's a premium pack and the org is not premium, lock it.
            isLocked: pack.isPremium && !isPremiumOrg
        }));
    }, [currentOrganization]);

    const getTemplateById = (templateId: string) => {
        for (const pack of ALL_TEMPLATE_PACKS) {
            const tmpl = pack.templates.find(t => t.id === templateId);
            if (tmpl) return tmpl;
        }
        return null;
    };

    return {
        availablePacks,
        getTemplateById
    };
}
