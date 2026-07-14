import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { orgAdapter } from '../../services/adapters/orgAdapter';
import { EnterpriseBoundaryError, loadEnterpriseSessionContexts } from '../../services/enterpriseAssess';
import { getRuntimeDataAccess, isLocalRuntimeEnabled, supabase } from '../../services/supabaseClient';
import { RuntimeBoundaryError } from '../../services/runtimeMode';
import {
  EnterpriseMutationCapability,
  presentEnterpriseBoundary,
} from '../../services/enterpriseSessionPolicy';
import {
  EnterpriseSessionState,
  EnterpriseWorkspace,
  Organization,
  ProductModuleKey,
  TenantContextProjection,
} from '../../types';
import { useAuth } from './AuthProvider';
import { DEFAULT_ENABLED_MODULES } from '../../constants/moduleConfig';

interface OrganizationContextType {
  organizations: Organization[];
  currentOrganization: Organization | null;
  workspaces: EnterpriseWorkspace[];
  currentWorkspace: EnterpriseWorkspace | null;
  tenantContext: TenantContextProjection | null;
  sessionState: EnterpriseSessionState;
  sessionMessage: string | null;
  loading: boolean;
  selectOrganization: (organizationId: string) => void;
  selectWorkspace: (workspaceId: string) => void;
  createOrg: (name: string) => Promise<Organization>;
  updateProfile: (orgId: string, profile: any) => Promise<void>;
  updateEnabledModules: (orgId: string, enabledModules: ProductModuleKey[]) => Promise<void>;
  refreshOrgs: () => Promise<void>;
  hasCapability: (capability: EnterpriseMutationCapability) => boolean;
  handleEnterpriseBoundary: (error: unknown) => boolean;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);
const SESSION_SELECTION_KEY = 'avala.enterprise.session.selection';
const stateForError = (error: unknown): { state: EnterpriseSessionState; message: string } => {
  if (error instanceof RuntimeBoundaryError) {
    return { state: 'blocked', message: 'AvalaOS runtime authority is not configured. Enterprise actions remain blocked.' };
  }
  if (error instanceof EnterpriseBoundaryError) {
    const presentation = presentEnterpriseBoundary(error.code);
    return { state: presentation.state, message: presentation.message };
  }
  return { state: 'error', message: 'AvalaOS could not load the server-issued workspace context.' };
};

const asOrganization = (context: TenantContextProjection): Organization => ({
  id: context.organizationId,
  name: context.organizationName,
  profile: { industry: '', size: '', geography: '', strategicGoals: '' },
  subscriptionTier: 'Enterprise',
  members: [],
  enabledModules: DEFAULT_ENABLED_MODULES,
});

export const OrganizationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [contexts, setContexts] = useState<TenantContextProjection[]>([]);
  const [currentContext, setCurrentContext] = useState<TenantContextProjection | null>(null);
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [sessionState, setSessionState] = useState<EnterpriseSessionState>('loading');
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    if (!user) {
      setOrganizations([]);
      setContexts([]);
      setCurrentContext(null);
      setCurrentOrganization(null);
      setSessionState('empty');
      setSessionMessage(null);
      return;
    }
    setSessionState('loading');
    setSessionMessage(null);
    try {
      if (getRuntimeDataAccess() === 'local') {
        const data = await orgAdapter.getOrganizations(user.id);
        const mapped = data.map((item: any): Organization => ({
          id: item.id,
          name: item.name,
          profile: item.settings?.profile || { industry: '', size: '', geography: '', strategicGoals: '' },
          subscriptionTier: item.is_trial ? 'Free_Trial' : 'Enterprise',
          members: item.members || [],
          enabledModules: item.settings?.enabledModules || DEFAULT_ENABLED_MODULES,
        }));
        setOrganizations(mapped);
        setContexts([]);
        setCurrentContext(null);
        setCurrentOrganization(mapped[0] || null);
        setSessionState(mapped.length ? 'ready' : 'empty');
        return;
      }

      const loaded = await loadEnterpriseSessionContexts();
      if (!loaded.length) {
        setOrganizations([]);
        setContexts([]);
        setCurrentContext(null);
        setCurrentOrganization(null);
        setSessionState('empty');
        setSessionMessage('No active organization and workspace membership is available.');
        return;
      }
      const uniqueOrganizations = [...new Map(loaded.map(item => [item.organizationId, asOrganization(item)])).values()];
      let selected = loaded[0];
      try {
        const saved = JSON.parse(sessionStorage.getItem(SESSION_SELECTION_KEY) || '{}');
        selected = loaded.find(item => item.organizationId === saved.organizationId && item.workspaceId === saved.workspaceId) || selected;
      } catch {
        sessionStorage.removeItem(SESSION_SELECTION_KEY);
      }
      setOrganizations(uniqueOrganizations);
      setContexts(loaded);
      setCurrentContext(selected);
      setCurrentOrganization(uniqueOrganizations.find(item => item.id === selected.organizationId) || null);
      const readOnly = import.meta.env.VITE_AVALA_READ_ONLY_MAINTENANCE === 'true';
      setSessionState(readOnly ? 'read_only' : 'ready');
      setSessionMessage(readOnly ? 'AvalaOS is in read-only maintenance. Privileged actions are blocked.' : null);
    } catch (error) {
      const next = stateForError(error);
      setOrganizations([]);
      setContexts([]);
      setCurrentContext(null);
      setCurrentOrganization(null);
      setSessionState(next.state);
      setSessionMessage(next.message);
    }
  }, [user]);

  useEffect(() => { loadSession(); }, [loadSession]);
  useEffect(() => {
    const offline = () => { setSessionState('offline'); setSessionMessage('AvalaOS is offline. Changes remain blocked until the server is reachable.'); };
    const online = () => { loadSession(); };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => { window.removeEventListener('offline', offline); window.removeEventListener('online', online); };
  }, [loadSession]);

  const hasCapability = useCallback((capability: EnterpriseMutationCapability) =>
    isLocalRuntimeEnabled() || Boolean(currentContext?.capabilities.includes(capability)),
  [currentContext]);

  const handleEnterpriseBoundary = useCallback((error: unknown) => {
    if (!(error instanceof EnterpriseBoundaryError)) return false;
    const presentation = presentEnterpriseBoundary(error.code);
    if (presentation.clearAuthority) {
      setCurrentContext(null);
      setCurrentOrganization(null);
      sessionStorage.removeItem(SESSION_SELECTION_KEY);
      if (error.code === 'AUTHENTICATION_REQUIRED') {
        setContexts([]);
        setOrganizations([]);
      }
    }
    setSessionState(presentation.state);
    setSessionMessage(presentation.message);
    return true;
  }, []);
  const selectContext = useCallback((next: TenantContextProjection) => {
    const organization = organizations.find(item => item.id === next.organizationId) || null;
    setCurrentContext(next);
    setCurrentOrganization(organization);
    sessionStorage.setItem(SESSION_SELECTION_KEY, JSON.stringify({
      organizationId: next.organizationId,
      workspaceId: next.workspaceId,
    }));
  }, [organizations]);

  const selectOrganization = useCallback((organizationId: string) => {
    const next = contexts.find(item => item.organizationId === organizationId);
    if (next) selectContext(next);
  }, [contexts, selectContext]);

  const selectWorkspace = useCallback((workspaceId: string) => {
    const next = contexts.find(item => item.organizationId === currentOrganization?.id && item.workspaceId === workspaceId);
    if (next) selectContext(next);
  }, [contexts, currentOrganization, selectContext]);

  const workspaces = useMemo(() => contexts
    .filter(item => item.organizationId === currentOrganization?.id)
    .map(item => ({ id: item.workspaceId, organizationId: item.organizationId, name: item.workspaceName })),
  [contexts, currentOrganization]);

  const currentWorkspace = currentContext
    ? { id: currentContext.workspaceId, organizationId: currentContext.organizationId, name: currentContext.workspaceName }
    : isLocalRuntimeEnabled() && currentOrganization
      ? { id: 'local-demo-workspace', organizationId: currentOrganization.id, name: 'Local demo workspace' }
      : null;

  const createOrg = async (name: string) => {
    if (getRuntimeDataAccess() !== 'local') throw new Error('Enterprise organization creation is outside the PR 1C Assess cutover.');
    if (!user) throw new Error('Authentication required');
    const created = await orgAdapter.createOrganization(name, user.id);
    await loadSession();
    return created as unknown as Organization;
  };

  const updateProfile = async (orgId: string, profile: any) => {
    if (getRuntimeDataAccess() === 'local') {
      setCurrentOrganization(previous => previous ? { ...previous, profile } : previous);
      setOrganizations(previous => previous.map(org => org.id === orgId ? { ...org, profile } : org));
      return;
    }
    const { error } = await supabase.from('organizations').update({ settings: { profile } }).eq('id', orgId);
    if (error) throw error;
    await loadSession();
  };

  const updateEnabledModules = async (orgId: string, enabledModules: ProductModuleKey[]) => {
    const normalized = enabledModules.length ? enabledModules : DEFAULT_ENABLED_MODULES;
    await orgAdapter.updateEnabledModules(orgId, normalized);
    setCurrentOrganization(previous => previous ? { ...previous, enabledModules: normalized } : previous);
    setOrganizations(previous => previous.map(org => org.id === orgId ? { ...org, enabledModules: normalized } : org));
  };

  return <OrganizationContext.Provider value={{
    organizations,
    currentOrganization,
    workspaces,
    currentWorkspace,
    tenantContext: currentContext,
    sessionState,
    sessionMessage,
    loading: sessionState === 'loading',
    selectOrganization,
    selectWorkspace,
    createOrg,
    updateProfile,
    updateEnabledModules,
    refreshOrgs: loadSession,
    hasCapability,
    handleEnterpriseBoundary,
  }}>{children}</OrganizationContext.Provider>;
};

export const useOrganizationContext = () => {
  const context = useContext(OrganizationContext);
  if (!context) throw new Error('useOrganizationContext must be used within OrganizationProvider');
  return context;
};
