import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EnterpriseSessionState, Organization, Scope, ScopeType, TenantContextProjection, User, View } from '../types';
import { resolveProductActionPolicy } from './productActionPolicy';
import { resolveGovernedCreationSurface } from './governedCreationNavigation';

const organization: Organization = {
  id: 'org-1',
  name: 'Avala Test Org',
  profile: {
    industry: 'Technology',
    size: '201-1000',
    geography: 'US',
    strategicGoals: 'Governed automation delivery',
  },
  subscriptionTier: 'Enterprise',
  members: [],
  enabledModules: ['assess', 'docs', 'delivery', 'monitor'],
};

const projectScope: Scope = { type: ScopeType.PROJECT, id: 'project-1', name: 'Finance Ops' };
const myWorkScope: Scope = { type: ScopeType.MY_WORK };

const user = (overrides: Partial<User>): User => ({
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  avatarUrl: '',
  roleTitle: 'Analyst',
  orgRole: 'Contributor',
  permissions: [],
  ...overrides,
});

describe('productActionPolicy', () => {
  const tenantContext: TenantContextProjection = {
    userId: 'user-1', organizationId: 'org-1', organizationName: 'Synthetic',
    workspaceId: 'workspace-1', workspaceName: 'Exploration', authorizationVersion: 3,
    capabilities: ['assess.read', 'assess.process.create'],
  };
  const serverInput = () => ({
    user: user({}), organization, scope: myWorkScope, action: 'process.create',
    dataAccess: 'server' as const,
    serverContext: { workspaceId: 'workspace-1', sessionState: 'ready' as EnterpriseSessionState, tenantContext },
  });
  it('allows a hosted author without legacy permissions through the bound process command only', () => {
    const decision = resolveProductActionPolicy(serverInput());
    assert.equal(decision.allowed, true);
    assert.deepEqual(decision.requiredPermissions, ['assess.read', 'assess.process.create']);
  });
  it('rejects wrong actor, organization, workspace and unusable authorization versions', () => {
    for (const patch of [
      { userId: 'foreign' }, { organizationId: 'foreign' }, { workspaceId: 'foreign' },
      { authorizationVersion: 0 }, { authorizationVersion: NaN }, { authorizationVersion: 1.5 },
    ]) {
      const input = serverInput();
      input.serverContext.tenantContext = { ...tenantContext, ...patch };
      assert.equal(resolveProductActionPolicy(input).reason, 'server_context_unavailable');
    }
  });
  it('blocks read-only/loading/revoked context, even when legacy identity claims Admin', () => {
    for (const sessionState of ['loading', 'read_only', 'revoked'] as EnterpriseSessionState[]) {
      const input = serverInput();
      input.user = user({ orgRole: 'Admin', permissions: ['process.create'] });
      input.serverContext.sessionState = sessionState;
      assert.equal(resolveProductActionPolicy(input).allowed, false);
    }
    assert.equal(resolveProductActionPolicy({ ...serverInput(), serverContext: undefined }).allowed, false);
    assert.equal(resolveProductActionPolicy({ ...serverInput(), dataAccess: 'disabled' }).allowed, false);
  });
  it('requires BOTH current read and process-create capabilities and never grants via Admin labels', () => {
    for (const capabilities of [[], ['assess.read'], ['assess.process.create'], ['org.admin'], ['process.create']]) {
      const input = serverInput();
      input.user = user({ orgRole: 'Admin', permissions: ['process.create'] });
      input.serverContext.tenantContext = { ...tenantContext, capabilities };
      assert.equal(resolveProductActionPolicy(input).allowed, false);
    }
  });
  it('does not unlock legacy Studio/Delivery writers with canonical capabilities', () => {
    for (const action of ['docs.generate', 'docs.refine', 'project.task.create', 'delivery.import', 'automation.create']) {
      const input = serverInput();
      input.user = user({ orgRole: 'Admin', permissions: ['docs.generate', 'task.create'] });
      input.serverContext.tenantContext = { ...tenantContext, capabilities: ['studio.artifacts.generate', 'delivery.package.manage'] };
      assert.equal(resolveProductActionPolicy({ ...input, action, scope: projectScope }).reason, 'governed_workflow_required');
    }
  });
  it('routes hosted creation entries to canonical workspaces without changing demo routes', () => {
    for (const view of [View.DOCS_FORGE, View.DOCS, View.WORKSPACE, View.TEMPLATE_STUDIO]) {
      assert.equal(resolveGovernedCreationSurface('server', view), 'studio');
      assert.equal(resolveGovernedCreationSurface('local', view), null);
      assert.equal(resolveGovernedCreationSurface('disabled', view), null);
    }
    for (const view of [View.BOARDS, View.LIST, View.DELIVERY_PACK]) assert.equal(resolveGovernedCreationSurface('server', view), 'delivery');
    assert.equal(resolveGovernedCreationSurface('server', View.PROCESS_CATALOG), null);
  });
  it('fails closed for unknown actions, unauthenticated users, and missing org context', () => {
    assert.equal(resolveProductActionPolicy({
      user: user({}),
      organization,
      scope: myWorkScope,
      action: 'not.registered',
    }).reason, 'unknown_action');

    assert.equal(resolveProductActionPolicy({
      user: null,
      organization,
      scope: myWorkScope,
      action: 'docs.generate',
    }).reason, 'unauthenticated');

    assert.equal(resolveProductActionPolicy({
      user: user({ permissions: ['docs.generate'] }),
      organization: null,
      scope: myWorkScope,
      action: 'docs.generate',
    }).reason, 'no_organization');
  });

  it('blocks viewer personas from mutation, generation, import, export, and download actions', () => {
    const viewer = user({
      orgRole: 'Reviewer',
      permissions: ['portfolio.read', 'reports.read', 'approvals.review', 'strategy.read'],
    });

    for (const action of ['process.create', 'docs.generate', 'project.task.create', 'delivery.import', 'docs.export', 'artifact.download']) {
      const decision = resolveProductActionPolicy({
        user: viewer,
        organization,
        scope: projectScope,
        projectId: 'project-1',
        hasDocumentContext: true,
        action,
      });
      assert.equal(decision.allowed, false, action);
    }
  });

  it('does not let docs review permission generate or refine draft artifacts', () => {
    const reviewer = user({ permissions: ['docs.review'] });

    assert.equal(resolveProductActionPolicy({
      user: reviewer,
      organization,
      scope: projectScope,
      action: 'docs.generate',
    }).allowed, false);

    assert.equal(resolveProductActionPolicy({
      user: reviewer,
      organization,
      scope: projectScope,
      action: 'docs.refine',
      hasDocumentContext: true,
    }).allowed, false);
  });

  it('allows explicit document generation permission and respects module enablement', () => {
    const generator = user({ permissions: ['docs.generate'] });

    assert.equal(resolveProductActionPolicy({
      user: generator,
      organization,
      scope: myWorkScope,
      action: 'docs.generate',
    }).allowed, true);

    assert.equal(resolveProductActionPolicy({
      user: generator,
      organization: { ...organization, enabledModules: ['assess', 'delivery', 'monitor'] },
      scope: myWorkScope,
      action: 'docs.generate',
    }).reason, 'disabled_module');
  });

  it('uses organization module enablement for delivery actions when no explicit override is supplied', () => {
    const deliveryUser = user({ permissions: ['task.create'] });

    assert.equal(resolveProductActionPolicy({
      user: deliveryUser,
      organization: { ...organization, enabledModules: ['assess', 'docs', 'monitor'] },
      scope: projectScope,
      projectId: 'project-1',
      action: 'project.task.create',
    }).reason, 'disabled_module');
  });

  it('lets explicit enabledModules override organization enabledModules', () => {
    const generator = user({ permissions: ['docs.generate'] });

    assert.equal(resolveProductActionPolicy({
      user: generator,
      organization: { ...organization, enabledModules: ['assess', 'delivery', 'monitor'] },
      enabledModules: ['docs'],
      scope: myWorkScope,
      action: 'docs.generate',
    }).allowed, true);
  });

  it('treats an explicit empty enabledModules override as no modules enabled', () => {
    const admin = user({ orgRole: 'Admin', permissions: [] });

    assert.equal(resolveProductActionPolicy({
      user: admin,
      organization,
      enabledModules: [],
      scope: myWorkScope,
      action: 'process.create',
    }).reason, 'disabled_module');
  });

  it('uses default modules only when no explicit or organization modules are available', () => {
    const generator = user({ permissions: ['docs.generate'] });
    const organizationWithoutModules = {
      ...organization,
      enabledModules: undefined,
    } as unknown as Organization;

    assert.equal(resolveProductActionPolicy({
      user: generator,
      organization: organizationWithoutModules,
      scope: myWorkScope,
      action: 'docs.generate',
    }).allowed, true);
  });
  it('requires process, project, document, and target-user context for high-risk mutations', () => {
    const admin = user({ orgRole: 'Admin', permissions: [] });

    assert.equal(resolveProductActionPolicy({
      user: admin,
      organization,
      scope: myWorkScope,
      action: 'assessment.approve',
    }).reason, 'missing_process_context');

    assert.equal(resolveProductActionPolicy({
      user: admin,
      organization,
      scope: myWorkScope,
      action: 'project.task.create',
    }).reason, 'missing_project_context');

    assert.equal(resolveProductActionPolicy({
      user: admin,
      organization,
      scope: projectScope,
      projectId: 'project-1',
      action: 'approval.execute',
    }).reason, 'missing_document_context');

    assert.equal(resolveProductActionPolicy({
      user: admin,
      organization,
      scope: projectScope,
      projectId: 'project-1',
      action: 'timesheet.update',
    }).reason, 'missing_target_user_context');
  });

  it('keeps export and download unavailable without explicit source-policy permissions, including admins', () => {
    const admin = user({ orgRole: 'Admin', permissions: [] });
    const exporter = user({ permissions: ['docs.export', 'artifact.download'] });

    assert.equal(resolveProductActionPolicy({
      user: admin,
      organization,
      scope: projectScope,
      action: 'docs.export',
      hasDocumentContext: true,
    }).allowed, false);

    assert.equal(resolveProductActionPolicy({
      user: exporter,
      organization,
      scope: projectScope,
      action: 'docs.export',
      hasDocumentContext: true,
    }).allowed, true);

    assert.equal(resolveProductActionPolicy({
      user: exporter,
      organization,
      scope: projectScope,
      action: 'artifact.download',
      hasDocumentContext: true,
    }).allowed, true);
  });

  it('separates own timesheet logging from manager approval authority', () => {
    const contributor = user({ id: 'u-own', permissions: ['timesheets.log'] });
    const manager = user({ permissions: ['timesheets.approve'] });

    assert.equal(resolveProductActionPolicy({
      user: contributor,
      organization,
      scope: projectScope,
      projectId: 'project-1',
      targetUserId: 'u-own',
      action: 'timesheet.update',
    }).allowed, true);

    assert.equal(resolveProductActionPolicy({
      user: contributor,
      organization,
      scope: projectScope,
      projectId: 'project-1',
      targetUserId: 'someone-else',
      action: 'timesheet.update',
    }).allowed, false);

    assert.equal(resolveProductActionPolicy({
      user: manager,
      organization,
      scope: projectScope,
      projectId: 'project-1',
      targetUserId: 'someone-else',
      action: 'timesheet.update',
    }).allowed, true);
  });

  it('treats task.update.own as delivery attempt authority while keeping comments out of workflow status changes', () => {
    const assignedContributor = user({ permissions: ['task.update.own'] });
    const commentReviewer = user({ permissions: ['comments.manage'] });

    assert.equal(resolveProductActionPolicy({
      user: assignedContributor,
      organization,
      scope: projectScope,
      projectId: 'project-1',
      action: 'project.task.update',
    }).allowed, true);

    assert.equal(resolveProductActionPolicy({
      user: assignedContributor,
      organization,
      scope: projectScope,
      projectId: 'project-1',
      action: 'workflow.status.change',
    }).allowed, true);

    assert.equal(resolveProductActionPolicy({
      user: commentReviewer,
      organization,
      scope: projectScope,
      projectId: 'project-1',
      action: 'project.task.update',
    }).allowed, true);

    assert.equal(resolveProductActionPolicy({
      user: commentReviewer,
      organization,
      scope: projectScope,
      projectId: 'project-1',
      action: 'workflow.status.change',
    }).allowed, false);
  });
  it('requires explicit automation edit authority in project scope', () => {
    const viewer = user({ permissions: ['automation.view'] });
    const editor = user({ permissions: ['automation.edit'] });

    assert.equal(resolveProductActionPolicy({
      user: viewer,
      organization,
      scope: projectScope,
      projectId: 'project-1',
      action: 'automation.toggle',
    }).allowed, false);

    assert.equal(resolveProductActionPolicy({
      user: editor,
      organization,
      scope: projectScope,
      projectId: 'project-1',
      action: 'automation.toggle',
    }).allowed, true);
  });
});
