import assert from 'node:assert/strict';

import {
  bindAuthoritativePresentationCapabilities,
  hasViewPermission,
  resolveViewAccess,
  VIEW_ACCESS_METADATA,
} from './viewAccessGuard';
import { Organization, ProductModuleKey, Scope, ScopeType, User, View } from '../types';

const myWorkScope: Scope = { type: ScopeType.MY_WORK };
const projectScope: Scope = { type: ScopeType.PROJECT, id: 'project-1', name: 'AP Invoice Automation' };
const teamScope: Scope = { type: ScopeType.TEAM, id: 'team-1', name: 'Transformation Office' };
const organizationScope: Scope = { type: ScopeType.ORGANIZATION };

const makeOrganization = (enabledModules: ProductModuleKey[] = ['assess', 'docs', 'delivery', 'monitor']): Organization => ({
  id: 'org-1',
  name: 'Acme Operations',
  profile: {
    industry: 'Manufacturing',
    size: '1000+',
    geography: 'Global',
    strategicGoals: 'Governed automation readiness',
  },
  subscriptionTier: 'Enterprise',
  members: [],
  enabledModules,
});

const makeUser = (permissions: string[], orgRole: User['orgRole'] = 'Contributor'): User => ({
  id: `user-${orgRole ?? 'contributor'}`,
  name: `${orgRole ?? 'Contributor'} User`,
  email: `${orgRole ?? 'contributor'}@example.com`,
  orgRole,
  permissions,
});

const contributor = makeUser(['docs.review']);
const admin = makeUser([], 'Admin');

const authLoadingResult = resolveViewAccess({
  user: null,
  authLoading: true,
  organization: null,
  enabledModules: ['docs'],
  view: View.DOCS_FORGE,
  scope: projectScope,
});

assert.equal(authLoadingResult.allowed, false);
assert.equal(authLoadingResult.reason, 'auth_loading');
assert.equal(authLoadingResult.guardSeverity, 'wait');
assert.equal(authLoadingResult.fallbackView, View.DOCS_FORGE);
assert.deepEqual(authLoadingResult.fallbackScope, projectScope);

const unauthenticatedResult = resolveViewAccess({
  user: null,
  authLoading: false,
  organization: makeOrganization(),
  view: View.DASHBOARD,
  scope: myWorkScope,
});

assert.equal(unauthenticatedResult.allowed, false);
assert.equal(unauthenticatedResult.reason, 'unauthenticated');
assert.equal(unauthenticatedResult.guardSeverity, 'redirect');

const noOrganizationResult = resolveViewAccess({
  user: contributor,
  authLoading: false,
  organization: null,
  view: View.DASHBOARD,
  scope: myWorkScope,
});

assert.equal(noOrganizationResult.allowed, false);
assert.equal(noOrganizationResult.reason, 'no_organization');
assert.equal(noOrganizationResult.fallbackView, View.WORKSPACE);
assert.deepEqual(noOrganizationResult.fallbackScope, organizationScope);

const noEnabledModulesResult = resolveViewAccess({
  user: contributor,
  authLoading: false,
  organization: makeOrganization([]),
  enabledModules: [],
  view: View.DASHBOARD,
  scope: myWorkScope,
});

assert.equal(noEnabledModulesResult.allowed, false);
assert.equal(noEnabledModulesResult.reason, 'setup_required');
assert.equal(noEnabledModulesResult.fallbackView, View.WORKSPACE);
assert.deepEqual(noEnabledModulesResult.fallbackScope, organizationScope);

const disabledModuleResult = resolveViewAccess({
  user: makeUser(['process.create', 'project.read']),
  authLoading: false,
  organization: makeOrganization(['assess']),
  enabledModules: ['assess'],
  view: View.BOARDS,
  scope: projectScope,
});

assert.equal(disabledModuleResult.allowed, false);
assert.equal(disabledModuleResult.reason, 'disabled_module');
assert.equal(disabledModuleResult.module, 'delivery');
assert.equal(disabledModuleResult.fallbackView, View.PROCESS_CATALOG);

const stalePersistedViewResult = resolveViewAccess({
  user: contributor,
  authLoading: false,
  organization: makeOrganization(),
  view: 'legacy_reports' as View,
  scope: myWorkScope,
});

assert.equal(stalePersistedViewResult.allowed, false);
assert.equal(stalePersistedViewResult.reason, 'stale_persisted_view');
assert.equal(stalePersistedViewResult.fallbackView, View.DOCS_FORGE);

const invalidScopeResult = resolveViewAccess({
  user: makeUser(['backlog.manage', 'project.read']),
  authLoading: false,
  organization: makeOrganization(['delivery']),
  enabledModules: ['delivery'],
  view: View.BACKLOG,
  scope: myWorkScope,
});

assert.equal(invalidScopeResult.allowed, false);
assert.equal(invalidScopeResult.reason, 'invalid_scope');
assert.equal(invalidScopeResult.fallbackView, View.BOARDS);
assert.deepEqual(invalidScopeResult.fallbackScope, myWorkScope);

const missingPermissionResult = resolveViewAccess({
  user: makeUser([]),
  authLoading: false,
  organization: makeOrganization(),
  view: View.DOCS_FORGE,
  scope: myWorkScope,
});

assert.equal(missingPermissionResult.allowed, false);
assert.equal(missingPermissionResult.reason, 'missing_permission');
assert.equal(missingPermissionResult.guardSeverity, 'hide');
assert.equal(missingPermissionResult.fallbackView, View.DASHBOARD);

const capabilityOnlyUser = makeUser([]);
const assessReadPresentationResult = resolveViewAccess({
  user: capabilityOnlyUser,
  authLoading: false,
  organization: makeOrganization(['assess']),
  enabledModules: ['assess'],
  authoritativeCapabilities: ['assess.read'],
  view: View.PROCESS_CATALOG,
  scope: myWorkScope,
});

assert.equal(assessReadPresentationResult.allowed, true);
assert.equal(assessReadPresentationResult.reason, 'allowed');
assert.deepEqual(capabilityOnlyUser.permissions, []);

const unrelatedCapabilityResult = resolveViewAccess({
  user: capabilityOnlyUser,
  authLoading: false,
  organization: makeOrganization(['assess']),
  enabledModules: ['assess'],
  authoritativeCapabilities: ['assess.v2.mutate'],
  view: View.PROCESS_CATALOG,
  scope: myWorkScope,
});

assert.equal(unrelatedCapabilityResult.allowed, false);
assert.equal(unrelatedCapabilityResult.reason, 'missing_permission');

const anyPermissionResult = resolveViewAccess({
  user: contributor,
  authLoading: false,
  organization: makeOrganization(['docs']),
  enabledModules: ['docs'],
  view: View.DOCS_FORGE,
  scope: myWorkScope,
});

assert.equal(anyPermissionResult.allowed, true);
assert.equal(anyPermissionResult.reason, 'allowed');
assert.equal(anyPermissionResult.requiredPermissions.includes('docs.review'), true);

assert.equal(hasViewPermission(contributor, ['docs.generate', 'docs.review', 'ai.configure']), true);
assert.equal(hasViewPermission(makeUser(['docs.read']), ['docs.generate', 'docs.review', 'ai.configure']), false);

const adminBypassResult = resolveViewAccess({
  user: admin,
  authLoading: false,
  organization: makeOrganization(['docs']),
  enabledModules: ['docs'],
  view: View.DOCS_FORGE,
  scope: myWorkScope,
});

assert.equal(adminBypassResult.allowed, true);
assert.equal(adminBypassResult.reason, 'allowed');

const reportsDeferredResult = resolveViewAccess({
  user: makeUser([]),
  authLoading: false,
  organization: makeOrganization(['monitor']),
  enabledModules: ['monitor'],
  view: View.REPORTS,
  scope: myWorkScope,
});

assert.equal(VIEW_ACCESS_METADATA[View.REPORTS].status, 'deferred');
assert.equal(reportsDeferredResult.allowed, false);
assert.equal(reportsDeferredResult.reason, 'deferred_view');
assert.equal(reportsDeferredResult.guardSeverity, 'hide');
assert.equal(reportsDeferredResult.fallbackView, View.DASHBOARD);

const teamsDecisionResult = resolveViewAccess({
  user: makeUser(['project.read']),
  authLoading: false,
  organization: makeOrganization(['delivery']),
  enabledModules: ['delivery'],
  view: View.TEAMS,
  scope: teamScope,
});

assert.equal(VIEW_ACCESS_METADATA[View.TEAMS].status, 'decision_pending');
assert.equal(teamsDecisionResult.allowed, false);
assert.equal(teamsDecisionResult.reason, 'deferred_view');
assert.equal(teamsDecisionResult.guardSeverity, 'warn');
assert.equal(teamsDecisionResult.fallbackView, View.BOARDS);

const workspaceAdminDecisionResult = resolveViewAccess({
  user: admin,
  authLoading: false,
  organization: makeOrganization(['docs']),
  enabledModules: ['docs'],
  view: View.WORKSPACE,
  scope: organizationScope,
});

assert.equal(workspaceAdminDecisionResult.allowed, false);
assert.equal(workspaceAdminDecisionResult.reason, 'admin_decision_pending');
assert.equal(workspaceAdminDecisionResult.guardSeverity, 'warn');

const existingModuleEnabledViewResult = resolveViewAccess({
  user: makeUser(['task.read']),
  authLoading: false,
  organization: makeOrganization(['delivery']),
  enabledModules: ['delivery'],
  view: View.BOARDS,
  scope: projectScope,
});

assert.equal(existingModuleEnabledViewResult.allowed, true);
assert.equal(existingModuleEnabledViewResult.reason, 'allowed');
assert.equal(existingModuleEnabledViewResult.module, 'delivery');

const handoffReadRouteResult = resolveViewAccess({
  user: makeUser(['studio.handoff.read']),
  authLoading: false,
  organization: makeOrganization(['docs']),
  enabledModules: ['docs'],
  view: View.DOCS_FORGE,
  scope: myWorkScope,
});

assert.equal(handoffReadRouteResult.allowed, true);
assert.equal(hasViewPermission(makeUser(['studio.handoff.read']), ['docs.generate']), false);

const serverContext = {
  userId: capabilityOnlyUser.id,
  organizationId: 'org-1',
  organizationName: 'Synthetic Organization',
  workspaceId: 'workspace-1',
  workspaceName: 'Governed Delivery',
  authorizationVersion: 7,
  capabilities: ['assess.read', 'studio.artifacts.review', 'project.read', 'monitor.read'],
};
const boundCapabilities = bindAuthoritativePresentationCapabilities({
  userId: capabilityOnlyUser.id,
  organizationId: 'org-1',
  workspaceId: 'workspace-1',
  sessionState: 'ready',
  tenantContext: serverContext,
});

for (const [view, scope, capability] of [
  [View.PROCESS_CATALOG, myWorkScope, 'assess.read'],
  [View.DOCS, projectScope, 'studio.artifacts.review'],
  [View.BOARDS, projectScope, 'project.read'],
  [View.PORTFOLIO, myWorkScope, 'monitor.read'],
] as const) {
  const result = resolveViewAccess({
    user: capabilityOnlyUser,
    authLoading: false,
    organization: makeOrganization(),
    authoritativeCapabilities: [capability],
    view,
    scope,
  });
  assert.equal(result.allowed, true, `${capability} grants ${view} presentation`);
}

const monitorCannotOpenDelivery = resolveViewAccess({
  user: capabilityOnlyUser,
  authLoading: false,
  organization: makeOrganization(),
  authoritativeCapabilities: ['monitor.read'],
  view: View.BOARDS,
  scope: projectScope,
});
assert.equal(monitorCannotOpenDelivery.allowed, false);
assert.equal(monitorCannotOpenDelivery.reason, 'missing_permission');

const studioApprovalPresentationOnly = resolveViewAccess({
  user: capabilityOnlyUser,
  authLoading: false,
  organization: makeOrganization(),
  authoritativeCapabilities: ['studio.artifacts.approve'],
  view: View.DOCS,
  scope: projectScope,
});
assert.equal(studioApprovalPresentationOnly.allowed, true);
assert.equal(hasViewPermission(capabilityOnlyUser, ['docs.approve']), false);

assert.deepEqual(boundCapabilities, serverContext.capabilities);
assert.deepEqual(capabilityOnlyUser.permissions, [], 'presentation binding must not add mutation permissions');
assert.equal(
  hasViewPermission(capabilityOnlyUser, ['docs.review', 'project.manage', 'portfolio.read']),
  false,
  'server capabilities remain separate from legacy mutation permissions',
);

for (const invalidBinding of [
  { userId: 'different-user', organizationId: 'org-1', workspaceId: 'workspace-1', sessionState: 'ready' as const },
  { userId: capabilityOnlyUser.id, organizationId: 'different-org', workspaceId: 'workspace-1', sessionState: 'ready' as const },
  { userId: capabilityOnlyUser.id, organizationId: 'org-1', workspaceId: 'different-workspace', sessionState: 'ready' as const },
  { userId: capabilityOnlyUser.id, organizationId: 'org-1', workspaceId: 'workspace-1', sessionState: 'stale' as const },
  { userId: capabilityOnlyUser.id, organizationId: 'org-1', workspaceId: 'workspace-1', sessionState: 'revoked' as const },
]) {
  assert.deepEqual(bindAuthoritativePresentationCapabilities({
    ...invalidBinding,
    tenantContext: serverContext,
  }), []);
}

assert.deepEqual(bindAuthoritativePresentationCapabilities({
  userId: capabilityOnlyUser.id,
  organizationId: 'org-1',
  workspaceId: 'workspace-1',
  sessionState: 'ready',
  tenantContext: { ...serverContext, authorizationVersion: 0 },
}), []);
assert.deepEqual(bindAuthoritativePresentationCapabilities({
  userId: capabilityOnlyUser.id,
  organizationId: 'org-1',
  workspaceId: 'workspace-1',
  sessionState: 'ready',
  tenantContext: { ...serverContext, capabilities: ['monitor.read '] },
}), []);

console.log('View access guard regression passed.');
