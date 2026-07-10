import { ExportAuthoritySnapshot, ParsedExportRequest, exportError } from './exportPolicy.ts';
import { postgrest } from './supabase.ts';

type NullableDate = string | null;
type ActiveRow = { status: string; deleted_at: NullableDate };

type MembershipRow = ActiveRow & {
  org_id: string;
  role_id: string | null;
};

type WorkspaceMembershipRow = MembershipRow & { workspace_id: string };

type RoleRow = ActiveRow & {
  id: string;
  org_id: string | null;
  workspace_id: string | null;
  scope: string;
  permissions: unknown;
};

type WorkspaceRow = ActiveRow & { id: string; org_id: string };

export type DocumentExportRow = Record<string, unknown> & {
  id: string;
  org_id: string;
  workspace_id: string | null;
  status: string;
  deleted_at: NullableDate;
  updated_at: string;
};

export type DecisionPackExportRow = Record<string, unknown> & {
  id: string;
  org_id: string;
  workspace_id: string | null;
  status: string;
  deleted_at: NullableDate;
  scores: unknown;
};

const activeRow = (row: ActiveRow | undefined) => (
  !!row && row.status === 'active' && row.deleted_at === null
);

const permissionsFromRole = (
  role: RoleRow | undefined,
  expected: { orgId: string; workspaceId?: string },
) => {
  if (!activeRow(role) || !Array.isArray(role?.permissions)) return [];
  if (!role.permissions.every((permission) => typeof permission === 'string')) return [];

  if (expected.workspaceId) {
    if (
      role.scope !== 'workspace' ||
      role.org_id !== expected.orgId ||
      role.workspace_id !== expected.workspaceId
    ) return [];
  } else if (
    role.scope !== 'organization' ||
    role.org_id !== expected.orgId ||
    role.workspace_id !== null
  ) return [];

  return role.permissions as string[];
};

const loadRole = async (roleId: string | null) => {
  if (!roleId) return undefined;
  const rows = await postgrest<RoleRow[]>(
    `roles?select=id,org_id,workspace_id,scope,permissions,status,deleted_at&id=eq.${encodeURIComponent(roleId)}&limit=1`,
    { method: 'GET' },
  );
  return rows[0];
};

const loadBaseAuthority = async (userId: string, request: ParsedExportRequest) => {
  const requestedFilter = request.organizationId
    ? `&org_id=eq.${encodeURIComponent(request.organizationId)}`
    : '';
  const memberships = await postgrest<MembershipRow[]>(
    `organization_members?select=org_id,role_id,status,deleted_at&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&deleted_at=is.null${requestedFilter}`,
    { method: 'GET' },
  );

  if (memberships.length !== 1) exportError('EXPORT_NOT_AVAILABLE');
  const membership = memberships[0];
  const orgId = membership.org_id;

  const [profiles, organizations, organizationRole] = await Promise.all([
    postgrest<ActiveRow[]>(
      `profiles?select=id,status,deleted_at&id=eq.${encodeURIComponent(userId)}&limit=1`,
      { method: 'GET' },
    ),
    postgrest<ActiveRow[]>(
      `organizations?select=id,status,deleted_at&id=eq.${encodeURIComponent(orgId)}&limit=1`,
      { method: 'GET' },
    ),
    loadRole(membership.role_id),
  ]);

  return {
    orgId,
    profileActive: activeRow(profiles[0]),
    organizationActive: activeRow(organizations[0]),
    organizationMembershipActive: activeRow(membership),
    organizationRolePermissions: permissionsFromRole(organizationRole, { orgId }),
  };
};

const loadWorkspaceAuthority = async (userId: string, orgId: string, workspaceId: string) => {
  const [workspaces, memberships] = await Promise.all([
    postgrest<WorkspaceRow[]>(
      `workspaces?select=id,org_id,status,deleted_at&id=eq.${encodeURIComponent(workspaceId)}&org_id=eq.${encodeURIComponent(orgId)}&limit=1`,
      { method: 'GET' },
    ),
    postgrest<WorkspaceMembershipRow[]>(
      `workspace_memberships?select=org_id,workspace_id,role_id,status,deleted_at&org_id=eq.${encodeURIComponent(orgId)}&workspace_id=eq.${encodeURIComponent(workspaceId)}&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&deleted_at=is.null&limit=2`,
      { method: 'GET' },
    ),
  ]);

  const membership = memberships.length === 1 ? memberships[0] : undefined;
  const workspaceRole = await loadRole(membership?.role_id || null);
  const workspace = workspaces[0];

  return {
    workspaceActive: activeRow(workspace) && workspace?.org_id === orgId,
    workspaceMembershipActive: activeRow(membership) &&
      membership?.org_id === orgId &&
      membership.workspace_id === workspaceId,
    workspaceRolePermissions: permissionsFromRole(workspaceRole, { orgId, workspaceId }),
  };
};

const unavailableWorkspace = {
  workspaceActive: false,
  workspaceMembershipActive: false,
  workspaceRolePermissions: [] as string[],
};

export const loadDocumentExportAuthority = async (
  userId: string,
  request: ParsedExportRequest,
): Promise<ExportAuthoritySnapshot<DocumentExportRow>> => {
  const base = await loadBaseAuthority(userId, request);
  const rows = await postgrest<DocumentExportRow[]>(
    `document_generations?select=*&id=eq.${encodeURIComponent(request.resourceId)}&org_id=eq.${encodeURIComponent(base.orgId)}&limit=1`,
    { method: 'GET' },
  );
  const row = rows[0];
  const workspace = row?.workspace_id
    ? await loadWorkspaceAuthority(userId, base.orgId, row.workspace_id)
    : unavailableWorkspace;

  return {
    requestedOrganizationId: base.orgId,
    profileActive: base.profileActive,
    organizationActive: base.organizationActive,
    organizationMembershipActive: base.organizationMembershipActive,
    organizationRolePermissions: base.organizationRolePermissions,
    ...workspace,
    resource: row ? {
      id: row.id,
      orgId: row.org_id,
      workspaceId: row.workspace_id,
      status: row.status,
      deletedAt: row.deleted_at,
      version: row.updated_at,
      payload: row,
    } : null,
  };
};

const scoreVersion = (scores: unknown) => {
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) return '';
  const value = (scores as Record<string, unknown>).scoreVersion;
  return typeof value === 'string' ? value : '';
};

export const loadDecisionPackExportAuthority = async (
  userId: string,
  request: ParsedExportRequest,
): Promise<ExportAuthoritySnapshot<DecisionPackExportRow>> => {
  const base = await loadBaseAuthority(userId, request);
  const rows = await postgrest<DecisionPackExportRow[]>(
    `assessments?select=*&id=eq.${encodeURIComponent(request.resourceId)}&org_id=eq.${encodeURIComponent(base.orgId)}&limit=1`,
    { method: 'GET' },
  );
  const row = rows[0];
  const workspace = row?.workspace_id
    ? await loadWorkspaceAuthority(userId, base.orgId, row.workspace_id)
    : unavailableWorkspace;

  return {
    requestedOrganizationId: base.orgId,
    profileActive: base.profileActive,
    organizationActive: base.organizationActive,
    organizationMembershipActive: base.organizationMembershipActive,
    organizationRolePermissions: base.organizationRolePermissions,
    ...workspace,
    resource: row ? {
      id: row.id,
      orgId: row.org_id,
      workspaceId: row.workspace_id,
      status: row.status,
      deletedAt: row.deleted_at,
      version: scoreVersion(row.scores),
      payload: row,
    } : null,
  };
};
