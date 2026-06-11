import {
  ConfigLookupInput,
  KeyRefLookupInput,
  MembershipRoleContext,
  PolicyLookupInput,
  ProviderConfigRow,
  ProviderKeyRefRow,
  ProviderPolicyRow,
  ProviderResolverDeps,
} from './providerResolver.ts';
import { postgrest } from './supabase.ts';

type MembershipRow = {
  status: string;
  role_id?: string | null;
  roles?: {
    id?: string | null;
    name?: string | null;
  } | null;
};

const createCorrelationId = () => {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  return cryptoApi?.randomUUID?.() || `corr-${Date.now().toString(36)}`;
};

const encode = (value: string) => encodeURIComponent(value);

export const queryMembershipAndRoles = async (input: {
  orgId: string;
  actorId: string;
}): Promise<MembershipRoleContext | null> => {
  const rows = await postgrest<MembershipRow[]>(
    `organization_members?select=status,role_id,roles(id,name)&org_id=eq.${encode(input.orgId)}&user_id=eq.${encode(input.actorId)}&limit=1`,
    { method: 'GET' },
  );
  const row = rows[0];
  if (!row) return null;

  return {
    status: row.status,
    roleIds: [row.role_id, row.roles?.id].filter(Boolean) as string[],
    roleNames: [row.roles?.name].filter(Boolean) as string[],
  };
};

export const queryProviderPolicy = async (
  input: PolicyLookupInput,
): Promise<ProviderPolicyRow[]> => {
  const configFilter = input.requestedProviderConfigId
    ? `&provider_config_id=eq.${encode(input.requestedProviderConfigId)}`
    : '';
  return postgrest<ProviderPolicyRow[]>(
    `ai_workspace_provider_policies?select=id,org_id,provider_config_id,operation,mode,allowed_roles,is_default,status,deleted_at&org_id=eq.${encode(input.orgId)}&operation=eq.${encode(input.operation)}&mode=eq.${encode(input.mode)}&status=eq.active&deleted_at=is.null${configFilter}`,
    { method: 'GET' },
  );
};

export const queryProviderConfig = async (
  input: ConfigLookupInput,
): Promise<ProviderConfigRow | null> => {
  const rows = await postgrest<ProviderConfigRow[]>(
    `ai_provider_configs?select=id,org_id,provider,key_ref_id,allowed_modes,allowed_operations,status,deleted_at&id=eq.${encode(input.providerConfigId)}&org_id=eq.${encode(input.orgId)}&limit=1`,
    { method: 'GET' },
  );
  return rows[0] || null;
};

export const queryProviderKeyRef = async (
  input: KeyRefLookupInput,
): Promise<ProviderKeyRefRow | null> => {
  const rows = await postgrest<ProviderKeyRefRow[]>(
    `ai_provider_key_refs?select=id,org_id,provider,resolver_type,status,expires_at,deleted_at&id=eq.${encode(input.keyRefId)}&org_id=eq.${encode(input.orgId)}&provider=eq.${encode(input.provider)}&limit=1`,
    { method: 'GET' },
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    referenceSafety: 'reference_only',
  };
};

export const buildProviderResolverDbDeps = (): ProviderResolverDeps => ({
  now: () => new Date(),
  createCorrelationId,
  queryMembershipAndRoles,
  queryProviderPolicy,
  queryProviderConfig,
  queryProviderKeyRef,
});
