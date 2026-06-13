import { supabase, isSupabaseConfigured } from '../supabaseClient';
import {
  CANONICAL_DEMO_ENABLED_MODULES,
  CANONICAL_DEMO_ORG_ID,
  CANONICAL_DEMO_ORG_NAME,
  CANONICAL_DEMO_ORG_PROFILE,
  CANONICAL_DEMO_ORG_SLUG,
  MOCK_USERS,
} from '../../data/mockData';
import { OrgRole, ProductModuleKey } from '../../types';
import { StorageKeys, StorageService } from '../storage';

const mockOrgModulesKey = `${StorageKeys.ORGANIZATION}-enabled-modules`;

export const orgAdapter = {
  async getOrganizations(userId: string) {
    if (!isSupabaseConfigured()) {
      return [{
        id: CANONICAL_DEMO_ORG_ID,
        name: CANONICAL_DEMO_ORG_NAME,
        slug: CANONICAL_DEMO_ORG_SLUG,
        is_trial: false,
        settings: {
          profile: CANONICAL_DEMO_ORG_PROFILE,
          enabledModules: StorageService.load<ProductModuleKey[]>(mockOrgModulesKey, CANONICAL_DEMO_ENABLED_MODULES),
        },
        members: MOCK_USERS.map(user => ({ userId: user.id, role: user.orgRole || 'Contributor' })),
      }];
    }

    const { data, error } = await supabase
      .from('organizations')
      .select('*, organization_members!inner(user_id, roles(name))')
      .eq('organization_members.user_id', userId);

    if (error) throw error;
    return (data || []).map((org: any) => ({
      ...org,
      members: (org.organization_members || []).map((member: any) => ({
        userId: member.user_id,
        role: (member.roles?.name || 'Contributor') as OrgRole,
      })),
    }));
  },

  async createOrganization(name: string, userId: string) {
    if (!isSupabaseConfigured()) {
      return { id: `org-${Date.now()}`, name, slug: name.toLowerCase().replace(/\s+/g, '-') };
    }

    // 1. Create Org
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert([{ name, slug: name.toLowerCase().replace(/\s+/g, '-') }])
      .select()
      .single();

    if (orgError) throw orgError;

    // 2. Add creator as Admin member
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert([{ org_id: org.id, user_id: userId, status: 'active' }]);

    if (memberError) throw memberError;

    return org;
  },

  async updateEnabledModules(orgId: string, enabledModules: ProductModuleKey[]) {
    if (!isSupabaseConfigured()) {
      StorageService.save(mockOrgModulesKey, enabledModules);
      return { success: true };
    }

    const { data: existing, error: fetchError } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', orgId)
      .single();

    if (fetchError) throw fetchError;

    const settings = {
      ...(existing?.settings || {}),
      enabledModules,
    };

    const { error } = await supabase
      .from('organizations')
      .update({ settings })
      .eq('id', orgId);

    if (error) throw error;
    return { success: true };
  }
};
