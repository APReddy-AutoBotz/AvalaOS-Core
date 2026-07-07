import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Organization, Scope, ScopeType, User } from '../types';
import { resolveProductActionPolicy } from './productActionPolicy';

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
