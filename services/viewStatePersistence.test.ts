import assert from 'node:assert/strict';

import { Organization, ProductModuleKey, Scope, ScopeType, User, View } from '../types';
import {
  areScopesEqual,
  DEFAULT_PERSISTED_SCOPE,
  DEFAULT_PERSISTED_VIEW,
  isValidScope,
  isValidView,
  normalizePersistedScope,
  normalizePersistedView,
  resolvePersistedViewScopeState,
} from './viewStatePersistence';

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

const docsReviewer = makeUser(['docs.review']);
const deliveryUser = makeUser(['project.read']);
const organization = makeOrganization();

assert.equal(isValidView(View.DASHBOARD), true);
assert.equal(normalizePersistedView(View.DOCS_FORGE), View.DOCS_FORGE);

assert.equal(isValidView('legacy_dashboard'), false);
assert.equal(normalizePersistedView('legacy_dashboard'), DEFAULT_PERSISTED_VIEW);

assert.deepEqual(
  normalizePersistedScope({ type: ScopeType.MY_WORK, stale: true }),
  { type: ScopeType.MY_WORK },
);

assert.deepEqual(
  normalizePersistedScope({ type: ScopeType.ORGANIZATION, stale: true }),
  { type: ScopeType.ORGANIZATION },
);

assert.deepEqual(
  normalizePersistedScope({ type: ScopeType.PROJECT, id: 'project-1', name: 'Revenue Close' }),
  { type: ScopeType.PROJECT, id: 'project-1', name: 'Revenue Close' },
);

assert.deepEqual(
  normalizePersistedScope({ type: ScopeType.TEAM, id: 'team-1', name: 'Transformation Office' }),
  { type: ScopeType.TEAM, id: 'team-1', name: 'Transformation Office' },
);

assert.equal(isValidScope({ type: ScopeType.PROJECT, id: 'project-1' }), false);
assert.deepEqual(
  normalizePersistedScope({ type: ScopeType.PROJECT, id: 'project-1' }),
  DEFAULT_PERSISTED_SCOPE,
);

assert.equal(isValidScope({ type: ScopeType.TEAM, name: 'Transformation Office' }), false);
assert.deepEqual(
  normalizePersistedScope({ type: ScopeType.TEAM, name: 'Transformation Office' }),
  DEFAULT_PERSISTED_SCOPE,
);

assert.deepEqual(
  normalizePersistedScope({ type: 'legacy_scope', id: 'legacy' }),
  DEFAULT_PERSISTED_SCOPE,
);

const invalidScopeResolution = resolvePersistedViewScopeState({
  view: View.DOCS_FORGE,
  scope: { type: 'legacy_scope' },
  user: docsReviewer,
  authLoading: false,
  organization,
});

assert.equal(invalidScopeResolution.view, View.DOCS_FORGE);
assert.deepEqual(invalidScopeResolution.scope, { type: ScopeType.MY_WORK });
assert.equal(invalidScopeResolution.scopeChanged, true);
assert.equal(invalidScopeResolution.fallbackApplied, false);

const guardDeniedResolution = resolvePersistedViewScopeState({
  view: View.DOCS,
  scope: { type: ScopeType.MY_WORK },
  user: docsReviewer,
  authLoading: false,
  organization: makeOrganization(['docs']),
  enabledModules: ['docs'],
});

assert.equal(guardDeniedResolution.access.reason, 'invalid_scope');
assert.equal(guardDeniedResolution.fallbackApplied, true);
assert.equal(guardDeniedResolution.view, View.DOCS_FORGE);
assert.deepEqual(guardDeniedResolution.scope, { type: ScopeType.MY_WORK });

const disabledModuleResolution = resolvePersistedViewScopeState({
  view: View.DOCS_FORGE,
  scope: { type: ScopeType.MY_WORK },
  user: deliveryUser,
  authLoading: false,
  organization: makeOrganization(['delivery']),
  enabledModules: ['delivery'],
});

assert.equal(disabledModuleResolution.access.reason, 'disabled_module');
assert.equal(disabledModuleResolution.fallbackApplied, true);
assert.equal(disabledModuleResolution.view, View.BOARDS);
assert.deepEqual(disabledModuleResolution.scope, { type: ScopeType.MY_WORK });

const organizationWorkspaceResolution = resolvePersistedViewScopeState({
  view: View.WORKSPACE,
  scope: { type: ScopeType.ORGANIZATION, stale: true },
  user: makeUser([], 'Admin'),
  authLoading: false,
  organization,
});

assert.equal(organizationWorkspaceResolution.access.reason, 'admin_decision_pending');
assert.equal(organizationWorkspaceResolution.fallbackApplied, false);
assert.equal(organizationWorkspaceResolution.view, View.WORKSPACE);
assert.deepEqual(organizationWorkspaceResolution.scope, { type: ScopeType.ORGANIZATION });
assert.equal(organizationWorkspaceResolution.scopeChanged, true);

const inputScope = { type: ScopeType.PROJECT, id: 'project-2', name: 'Procurement', stale: true };
const inputSnapshot = { ...inputScope };
const normalizedInputScope = normalizePersistedScope(inputScope);

assert.deepEqual(inputScope, inputSnapshot);
assert.deepEqual(normalizedInputScope, { type: ScopeType.PROJECT, id: 'project-2', name: 'Procurement' });

const projectScope: Scope = { type: ScopeType.PROJECT, id: 'project-2', name: 'Procurement' };
assert.equal(areScopesEqual(projectScope, normalizedInputScope), true);
assert.equal(areScopesEqual(projectScope, { type: ScopeType.PROJECT, id: 'project-2', name: 'Different' }), false);

console.log('View state persistence regression passed.');
