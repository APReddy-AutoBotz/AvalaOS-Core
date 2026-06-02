import { useCallback } from 'react';
import { CompanyProfile, SubscriptionPolicy, AuditLogEntry, ProductModuleKey } from '../types';
import { getSubscriptionLimits } from '../constants/trialPolicy';
import { useOrganizationContext } from '../components/auth/OrganizationProvider';

export function useOrganization() {
    const { currentOrganization, organizations, updateProfile, updateEnabledModules } = useOrganizationContext();
    
    // Audit logs will be handled by a separate service in production
    const auditLogs: AuditLogEntry[] = [];

    const createOrganization = useCallback(async (name: string) => {
        // This is now handled by the context/provider
    }, []);

    const updateCompanyProfile = useCallback(async (orgId: string, profileUpdates: Partial<CompanyProfile>, userId: string) => {
        if (!currentOrganization) return;
        const newProfile = { ...currentOrganization.profile, ...profileUpdates };
        await updateProfile(orgId, newProfile);
    }, [currentOrganization, updateProfile]);

    const getLimitsForCurrentOrg = useCallback((): SubscriptionPolicy | null => {
        if (!currentOrganization) return null;
        return getSubscriptionLimits(currentOrganization.subscriptionTier);
    }, [currentOrganization]);

    const getAuditLogsForOrg = useCallback((orgId: string) => {
        return auditLogs.filter(log => log.orgId === orgId);
    }, [auditLogs]);

    const updateOrganizationModules = useCallback(async (orgId: string, enabledModules: ProductModuleKey[]) => {
        await updateEnabledModules(orgId, enabledModules);
    }, [updateEnabledModules]);

    return {
        organizations,
        currentOrganization,
        createOrganization,
        updateCompanyProfile,
        updateOrganizationModules,
        getLimitsForCurrentOrg,
        getAuditLogsForOrg,
    };
}
