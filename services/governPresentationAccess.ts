import type {
  EnterpriseSessionState,
  EnterpriseWorkspace,
  Organization,
  TenantContextProjection,
  User,
} from '../types';

export type GovernPresentationAccessReason =
  | 'allowed'
  | 'loading'
  | 'unauthenticated'
  | 'missing_context'
  | 'context_mismatch'
  | 'missing_assess_read'
  | 'authority_unavailable';

export interface GovernPresentationAccessInput {
  user: User | null;
  organization: Organization | null;
  workspace: EnterpriseWorkspace | null;
  tenantContext: TenantContextProjection | null;
  sessionState: EnterpriseSessionState;
  authLoading?: boolean;
  localRuntime?: boolean;
}

export interface GovernPresentationAccessDecision {
  allowed: boolean;
  readOnly: true;
  reason: GovernPresentationAccessReason;
  contextKey: string | null;
  hasReviewAuthority: boolean;
  hasApprovalAuthority: boolean;
}

const localAssessPermissions = new Set([
  'assessment.create',
  'assessment.edit',
  'assessment.review',
  'process.approve',
]);

const hasActualPermission = (user: User, permission: string) =>
  user.orgRole === 'Admin' || Boolean(user.permissions?.includes(permission));

const denied = (
  reason: GovernPresentationAccessReason,
  user: User | null,
): GovernPresentationAccessDecision => ({
  allowed: false,
  readOnly: true,
  reason,
  contextKey: null,
  hasReviewAuthority: Boolean(user && hasActualPermission(user, 'assessment.review')),
  hasApprovalAuthority: Boolean(user && hasActualPermission(user, 'process.approve')),
});

/**
 * Resolves visibility for the read-only Govern composition only. It never
 * projects, augments, or substitutes mutation permissions on the user.
 */
export function resolveGovernPresentationAccess(
  input: GovernPresentationAccessInput,
): GovernPresentationAccessDecision {
  const { user, organization, workspace, tenantContext } = input;
  if (input.authLoading || input.sessionState === 'loading') return denied('loading', user);
  if (!user) return denied('unauthenticated', null);
  if (!['ready', 'read_only'].includes(input.sessionState)) {
    return denied('authority_unavailable', user);
  }
  if (!organization || !workspace) return denied('missing_context', user);

  const contextKey = `${organization.id}:${workspace.id}`;
  const hasReviewAuthority = hasActualPermission(user, 'assessment.review');
  const hasApprovalAuthority = hasActualPermission(user, 'process.approve');

  if (tenantContext) {
    const exactContext = tenantContext.userId === user.id
      && tenantContext.organizationId === organization.id
      && tenantContext.workspaceId === workspace.id;
    if (!exactContext) return denied('context_mismatch', user);
    if (!tenantContext.capabilities.includes('assess.read')) {
      return denied('missing_assess_read', user);
    }
    return {
      allowed: true,
      readOnly: true,
      reason: 'allowed',
      contextKey,
      hasReviewAuthority,
      hasApprovalAuthority,
    };
  }

  const hasLocalAssessRead = input.localRuntime && (
    user.orgRole === 'Admin'
    || Boolean(user.permissions?.some(permission => localAssessPermissions.has(permission)))
  );
  if (!hasLocalAssessRead) return denied('missing_assess_read', user);

  return {
    allowed: true,
    readOnly: true,
    reason: 'allowed',
    contextKey,
    hasReviewAuthority,
    hasApprovalAuthority,
  };
}
