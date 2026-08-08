import {
  ConfigLookupInput,
  EnterpriseProviderRouteResolverDeps,
  EnterpriseProviderRouteRow,
  EnterpriseProviderResolverProvider,
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
    `ai_provider_configs?select=id,org_id,provider,key_ref_id,allowed_modes,allowed_operations,status,endpoint_url,deployment_name,default_model,model_allowlist,budget_policy,last_validated_at,deleted_at&id=eq.${encode(input.providerConfigId)}&org_id=eq.${encode(input.orgId)}&limit=1`,
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

const queryEnterpriseProviderRoutes: EnterpriseProviderRouteResolverDeps['queryRoutes'] = async input => {
  const configFilter = input.requestedProviderConfigId
    ? `&provider_config_id=eq.${encode(input.requestedProviderConfigId)}`
    : '';
  const routeFilter = input.requestedRouteId
    ? `&id=eq.${encode(input.requestedRouteId)}`
    : '';
  const enabledFilter = input.includeDisabled ? '' : '&enabled=is.true';
  return postgrest<EnterpriseProviderRouteRow[]>(
    `enterprise_ai_capability_routes?select=id,org_id,workspace_id,provider_config_id,capability,model,enabled,allowed_roles,deleted_at&org_id=eq.${encode(input.orgId)}&workspace_id=eq.${encode(input.workspaceId)}&capability=eq.${encode(input.capability)}&deleted_at=is.null${configFilter}${routeFilter}${enabledFilter}`,
    { method: 'GET' },
  );
};

const queryEnterpriseProviderUsage: EnterpriseProviderRouteResolverDeps['queryUsage'] = async input => {
  const dayStart = new Date(Date.UTC(
    input.now.getUTCFullYear(),
    input.now.getUTCMonth(),
    input.now.getUTCDate(),
  )).toISOString();
  const monthStart = new Date(Date.UTC(
    input.now.getUTCFullYear(),
    input.now.getUTCMonth(),
    1,
  )).toISOString();
  const base = `org_id=eq.${encode(input.orgId)}&workspace_id=eq.${encode(input.workspaceId)}&provider_config_id=eq.${encode(input.providerConfigId)}`;
  const [daily, monthly] = await Promise.all([
    postgrest<Array<{ request_count: number }>>(
      `enterprise_ai_usage_ledger?select=request_count&${base}&recorded_at=gte.${encode(dayStart)}`,
      { method: 'GET' },
    ),
    postgrest<Array<{ input_tokens: number; output_tokens: number }>>(
      `enterprise_ai_usage_ledger?select=input_tokens,output_tokens&${base}&recorded_at=gte.${encode(monthStart)}`,
      { method: 'GET' },
    ),
  ]);
  return {
    dailyRequests: daily.reduce((sum, row) => sum + Number(row.request_count || 0), 0),
    monthlyTokens: monthly.reduce(
      (sum, row) => sum + Number(row.input_tokens || 0) + Number(row.output_tokens || 0),
      0,
    ),
  };
};

export const buildEnterpriseProviderRouteDbDeps = (
  isEndpointAllowed: (provider: EnterpriseProviderResolverProvider, endpoint: string) => boolean,
): EnterpriseProviderRouteResolverDeps => ({
  now: () => new Date(),
  createCorrelationId,
  queryRoutes: queryEnterpriseProviderRoutes,
  queryProviderConfig,
  queryProviderKeyRef,
  queryUsage: queryEnterpriseProviderUsage,
  isEndpointAllowed,
});
