import React, { createContext, useContext, useState, useEffect } from 'react';
import { orgAdapter } from '../../services/adapters/orgAdapter';
import { supabase, isSupabaseConfigured } from '../../services/supabaseClient';
import { Organization, ProductModuleKey, User } from '../../types';
import { useAuth } from './AuthProvider';
import { DEFAULT_ENABLED_MODULES } from '../../constants/moduleConfig';

interface OrganizationContextType {
  organizations: Organization[];
  currentOrganization: Organization | null;
  loading: boolean;
  createOrg: (name: string) => Promise<Organization>;
  updateProfile: (orgId: string, profile: any) => Promise<void>;
  updateEnabledModules: (orgId: string, enabledModules: ProductModuleKey[]) => Promise<void>;
  refreshOrgs: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export const OrganizationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);

  const fetchOrgs = async () => {
    if (!user) {
      setOrganizations([]);
      setCurrentOrganization(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await orgAdapter.getOrganizations(user.id);
      
      // Map database schema to our Organization type if needed
      const mappedOrgs: Organization[] = data.map((o: any) => ({
        id: o.id,
        name: o.name,
        profile: o.settings?.profile || { industry: '', size: '', geography: '', strategicGoals: '' },
        subscriptionTier: o.is_trial ? 'Free_Trial' : 'Enterprise',
        members: o.members || [],
        enabledModules: o.settings?.enabledModules || DEFAULT_ENABLED_MODULES,
      }));

      setOrganizations(mappedOrgs);
      if (mappedOrgs.length > 0) {
        setCurrentOrganization(mappedOrgs[0]);
      }
    } catch (err) {
      console.error('Failed to fetch organizations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, [user]);

  const createOrg = async (name: string) => {
    if (!user) throw new Error('Authentication required');
    const newOrg = await orgAdapter.createOrganization(name, user.id);
    await fetchOrgs();
    return newOrg as unknown as Organization;
  };

  const updateProfile = async (orgId: string, profile: any) => {
    if (!isSupabaseConfigured()) {
      // Mock update
      setCurrentOrganization(prev => prev ? { ...prev, profile } : prev);
      setOrganizations(prev => prev.map(org => org.id === orgId ? { ...org, profile } : org));
      return;
    }

    const { error } = await supabase
      .from('organizations')
      .update({ settings: { profile } })
      .eq('id', orgId);

    if (error) throw error;
    await fetchOrgs();
  };

  const updateEnabledModules = async (orgId: string, enabledModules: ProductModuleKey[]) => {
    const normalizedModules = enabledModules.length > 0 ? enabledModules : DEFAULT_ENABLED_MODULES;
    await orgAdapter.updateEnabledModules(orgId, normalizedModules);
    setCurrentOrganization(prev => prev ? { ...prev, enabledModules: normalizedModules } : prev);
    setOrganizations(prev => prev.map(org => org.id === orgId ? { ...org, enabledModules: normalizedModules } : org));
  };

  return (
    <OrganizationContext.Provider value={{ 
      organizations, 
      currentOrganization, 
      loading, 
      createOrg, 
      updateProfile,
      updateEnabledModules,
      refreshOrgs: fetchOrgs 
    }}>
      {children}
    </OrganizationContext.Provider>
  );
};

export const useOrganizationContext = () => {
  const context = useContext(OrganizationContext);
  if (!context) throw new Error('useOrganizationContext must be used within OrganizationProvider');
  return context;
};
