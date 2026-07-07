import assert from 'node:assert/strict';

import { AssessProcess, DocumentGeneration, Organization, ProductModuleKey, Project, Scope, ScopeType, User, View } from '../types';
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
import {
  buildProductNavigationSearch,
  hasProductNavigationSearch,
  parseProductNavigationSearch,
  resolveProductNavigationState,
} from './productNavigationState';

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

const nonAdminOrganizationWorkspaceResolution = resolvePersistedViewScopeState({
  view: View.WORKSPACE,
  scope: { type: ScopeType.ORGANIZATION, stale: true },
  user: docsReviewer,
  authLoading: false,
  organization,
});

assert.equal(nonAdminOrganizationWorkspaceResolution.access.reason, 'admin_decision_pending');
assert.equal(nonAdminOrganizationWorkspaceResolution.fallbackApplied, true);
assert.equal(nonAdminOrganizationWorkspaceResolution.view, View.DOCS_FORGE);
assert.deepEqual(nonAdminOrganizationWorkspaceResolution.scope, { type: ScopeType.MY_WORK });

const navigationProcess: AssessProcess = {
  id: 'proc-ap-invoice-exception',
  orgId: organization.id,
  name: 'AP Invoice Exception Handling',
  description: 'Canonical process fixture used by tests as ordinary product data.',
  ownerId: 'user-process-owner',
  department: 'Finance Operations',
  criticality: 'High',
  status: 'Completed',
  templateId: 'ap.exception.v1',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z',
};

const navigationProject: Project = {
  id: 'proj-ap-invoice-exception',
  name: 'AP Invoice Exception Workflow',
  description: 'Canonical project fixture used by tests as ordinary product data.',
  ownerId: 'user-delivery-owner',
  lifecycleStage: 'Analysis & Design',
  healthStatus: 'On Track',
};

const otherNavigationProject: Project = {
  id: 'proj-other',
  name: 'Other Workflow',
  description: 'Separate project fixture.',
  ownerId: 'user-delivery-owner',
  lifecycleStage: 'Planning',
  healthStatus: 'At Risk',
};

const navigationGeneration: DocumentGeneration = {
  id: 'docgen-ap-invoice-exception',
  projectId: navigationProject.id,
  generatedAt: '2026-06-03T00:00:00.000Z',
  templateId: 'brd.v1',
  artifacts: {} as DocumentGeneration['artifacts'],
};

const otherNavigationGeneration: DocumentGeneration = {
  id: 'docgen-other',
  projectId: otherNavigationProject.id,
  generatedAt: '2026-06-04T00:00:00.000Z',
  templateId: 'brd.v1',
  artifacts: {} as DocumentGeneration['artifacts'],
};

const processAnalyst = makeUser(['process.create', 'assessment.create', 'assessment.edit', 'project.read', 'docs.review', 'task.read']);
const buyerViewer = makeUser(['portfolio.read', 'reports.read', 'approvals.review', 'strategy.read'], 'Buyer');
const platformAdmin = makeUser([], 'Admin');
const navigationContext = {
  authLoading: false,
  organization,
  enabledModules: organization.enabledModules,
  processes: [navigationProcess],
  projects: [navigationProject, otherNavigationProject],
  documentGenerations: [navigationGeneration, otherNavigationGeneration],
  preserveOrganizationWorkspace: true,
};

const processSearch = buildProductNavigationSearch({
  view: View.PROCESS_DETAIL,
  scope: { type: ScopeType.MY_WORK },
  selectedProcessId: navigationProcess.id,
});
assert.equal(hasProductNavigationSearch(processSearch), true);
assert.deepEqual(parseProductNavigationSearch(processSearch), {
  view: View.PROCESS_DETAIL,
  scope: { type: ScopeType.MY_WORK },
  processId: navigationProcess.id,
  projectId: null,
  assessmentId: null,
  documentGenerationId: null,
  deliveryPackId: null,
});

const workspaceSearch = buildProductNavigationSearch({
  view: View.WORKSPACE,
  scope: { type: ScopeType.PROJECT, id: navigationProject.id, name: navigationProject.name },
  activeGenerationId: navigationGeneration.id,
});
const parsedWorkspaceSearch = parseProductNavigationSearch(workspaceSearch);
assert.deepEqual(parsedWorkspaceSearch.scope, { type: ScopeType.PROJECT, id: navigationProject.id, name: navigationProject.name });
assert.equal(parsedWorkspaceSearch.projectId, navigationProject.id);
assert.equal(parsedWorkspaceSearch.documentGenerationId, navigationGeneration.id);

const buyerPortfolioNavigation = resolveProductNavigationState({
  ...navigationContext,
  user: buyerViewer,
  view: View.PORTFOLIO,
  scope: { type: ScopeType.MY_WORK },
});
assert.equal(buyerPortfolioNavigation.view, View.PORTFOLIO);
assert.deepEqual(buyerPortfolioNavigation.scope, { type: ScopeType.MY_WORK });
assert.equal(buyerPortfolioNavigation.access.allowed, true);

const adminWorkspaceNavigation = resolveProductNavigationState({
  ...navigationContext,
  user: platformAdmin,
  view: View.WORKSPACE,
  scope: { type: ScopeType.ORGANIZATION },
});
assert.equal(adminWorkspaceNavigation.view, View.WORKSPACE);
assert.deepEqual(adminWorkspaceNavigation.scope, { type: ScopeType.ORGANIZATION });
assert.equal(adminWorkspaceNavigation.access.reason, 'admin_decision_pending');

const validProcessNavigation = resolveProductNavigationState({
  ...navigationContext,
  user: processAnalyst,
  view: View.PROCESS_DETAIL,
  scope: { type: ScopeType.MY_WORK },
  processId: navigationProcess.id,
});
assert.equal(validProcessNavigation.view, View.PROCESS_DETAIL);
assert.equal(validProcessNavigation.selectedProcessId, navigationProcess.id);
assert.deepEqual(validProcessNavigation.issues, []);

const missingProcessNavigation = resolveProductNavigationState({
  ...navigationContext,
  user: processAnalyst,
  view: View.PROCESS_DETAIL,
  scope: { type: ScopeType.MY_WORK },
});
assert.equal(missingProcessNavigation.view, View.PROCESS_CATALOG);
assert.equal(missingProcessNavigation.selectedProcessId, null);
assert.deepEqual(missingProcessNavigation.issues, ['missing_process_id']);

const invalidProcessNavigation = resolveProductNavigationState({
  ...navigationContext,
  user: processAnalyst,
  view: View.GUIDED_ASSESSMENT,
  scope: { type: ScopeType.MY_WORK },
  processId: 'missing-process',
});
assert.equal(invalidProcessNavigation.view, View.PROCESS_CATALOG);
assert.equal(invalidProcessNavigation.selectedProcessId, null);
assert.deepEqual(invalidProcessNavigation.issues, ['invalid_process_id']);

const guidedOrganizationNavigation = resolveProductNavigationState({
  ...navigationContext,
  user: processAnalyst,
  view: View.GUIDED_ASSESSMENT,
  scope: { type: ScopeType.ORGANIZATION },
  processId: navigationProcess.id,
});
assert.equal(guidedOrganizationNavigation.view, View.GUIDED_ASSESSMENT);
assert.deepEqual(guidedOrganizationNavigation.scope, { type: ScopeType.MY_WORK });
assert.equal(guidedOrganizationNavigation.selectedProcessId, navigationProcess.id);
assert.deepEqual(guidedOrganizationNavigation.issues, ['invalid_guided_assessment_scope']);

const projectDocsNavigation = resolveProductNavigationState({
  ...navigationContext,
  user: docsReviewer,
  view: View.DOCS,
  scope: { type: ScopeType.MY_WORK },
  projectId: navigationProject.id,
});
assert.equal(projectDocsNavigation.view, View.DOCS);
assert.deepEqual(projectDocsNavigation.scope, { type: ScopeType.PROJECT, id: navigationProject.id, name: navigationProject.name });

const invalidProjectNavigation = resolveProductNavigationState({
  ...navigationContext,
  user: deliveryUser,
  view: View.DELIVERY_PACK,
  scope: { type: ScopeType.PROJECT, id: 'missing-project', name: 'Missing Project' },
});
assert.equal(invalidProjectNavigation.view, View.BOARDS);
assert.deepEqual(invalidProjectNavigation.scope, { type: ScopeType.MY_WORK });
assert.deepEqual(invalidProjectNavigation.issues, ['invalid_project_id']);

const validWorkspaceNavigation = resolveProductNavigationState({
  ...navigationContext,
  user: docsReviewer,
  view: View.WORKSPACE,
  scope: { type: ScopeType.PROJECT, id: navigationProject.id, name: navigationProject.name },
  documentGenerationId: navigationGeneration.id,
});
assert.equal(validWorkspaceNavigation.view, View.WORKSPACE);
assert.equal(validWorkspaceNavigation.activeGenerationId, navigationGeneration.id);
assert.deepEqual(validWorkspaceNavigation.issues, []);

const derivedWorkspaceNavigation = resolveProductNavigationState({
  ...navigationContext,
  user: docsReviewer,
  view: View.WORKSPACE,
  scope: { type: ScopeType.MY_WORK },
  documentGenerationId: navigationGeneration.id,
});
assert.equal(derivedWorkspaceNavigation.view, View.WORKSPACE);
assert.deepEqual(derivedWorkspaceNavigation.scope, { type: ScopeType.PROJECT, id: navigationProject.id, name: navigationProject.name });
assert.equal(derivedWorkspaceNavigation.activeGenerationId, navigationGeneration.id);

const mismatchedWorkspaceNavigation = resolveProductNavigationState({
  ...navigationContext,
  user: docsReviewer,
  view: View.WORKSPACE,
  scope: { type: ScopeType.PROJECT, id: navigationProject.id, name: navigationProject.name },
  documentGenerationId: otherNavigationGeneration.id,
});
assert.equal(mismatchedWorkspaceNavigation.view, View.DOCS);
assert.equal(mismatchedWorkspaceNavigation.activeGenerationId, null);
assert.deepEqual(mismatchedWorkspaceNavigation.issues, ['document_generation_project_mismatch']);

const missingGenerationNavigation = resolveProductNavigationState({
  ...navigationContext,
  user: docsReviewer,
  view: View.WORKSPACE,
  scope: { type: ScopeType.PROJECT, id: navigationProject.id, name: navigationProject.name },
});
assert.equal(missingGenerationNavigation.view, View.DOCS);
assert.equal(missingGenerationNavigation.activeGenerationId, null);
assert.deepEqual(missingGenerationNavigation.issues, ['missing_document_generation_id']);

console.log('View state persistence regression passed.');
