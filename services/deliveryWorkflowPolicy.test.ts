import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Organization, Project, Scope, ScopeType, Sprint, Task, User } from '../types';
import { resolveProductActionPolicy } from './productActionPolicy';
import {
  buildTaskDeletionAuditEnvelope,
  buildTaskMutationAuditActivity,
  createDeliveryMutationAuditEnvelope,
  resolveDeliveryImportGuard,
  resolveProjectLifecycleMutationGuard,
  resolveSprintMutationGuard,
  resolveTaskDeletionGuard,
  resolveTaskReorderGuard,
  resolveTaskSprintAssignmentGuard,
  resolveTaskMutationGuard,
  resolveTaskStatusTransition,
} from './deliveryWorkflowPolicy';

const actor: User = {
  id: 'pm-1',
  name: 'Project Manager',
  email: 'pm@example.com',
  avatarUrl: '',
  roleTitle: 'PM',
  orgRole: 'Admin',
  permissions: ['project.manage', 'task.update', 'task.update.own', 'task.delete', 'workitems.import'],
};

const contributor: User = {
  ...actor,
  id: 'dev-1',
  orgRole: 'Contributor',
  permissions: ['task.update.own'],
};

const organization: Organization = {
  id: 'org-1',
  name: 'Avala Test Org',
  profile: {
    industry: 'Technology',
    size: '201-1000',
    geography: 'US',
    strategicGoals: 'Governed delivery',
  },
  subscriptionTier: 'Enterprise',
  members: [],
  enabledModules: ['assess', 'docs', 'delivery', 'monitor'],
};

const projectScope: Scope = { type: ScopeType.PROJECT, id: 'project-1', name: 'Finance Ops' };

const project: Project = {
  id: 'project-1',
  name: 'Finance Ops',
  description: 'Workflow hardening',
  ownerId: 'pm-1',
  lifecycleStage: 'Planning',
  healthStatus: 'On Track',
};

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Harden workflow',
  description: 'Add deterministic state controls',
  status: 'To Do',
  priority: 'High',
  type: 'Task',
  projectId: 'project-1',
  assigneeIds: ['dev-1'],
  startDate: '2026-07-01',
  dueDate: '2026-07-15',
  comments: [],
  activityLog: [],
  ...overrides,
});

describe('deliveryWorkflowPolicy', () => {
  it('allows declared task transitions and fails closed for skips or unknown status values', () => {
    assert.equal(resolveTaskStatusTransition('To Do', 'In Progress').allowed, true);
    assert.equal(resolveTaskStatusTransition('To Do', 'Done').reason, 'transition_not_registered');
    assert.equal(resolveTaskStatusTransition('QA Ready', 'Done').reason, 'unknown_status');
    assert.equal(resolveTaskStatusTransition('Done', 'In Progress').status, 'decision_pending');
  });

  it('blocks dependency-gated active transitions after transition matrix allow', () => {
    const dependency = task({ id: 'dependency-1', title: 'Approve controls', status: 'In Review' });
    const dependent = task({ id: 'dependent-1', dependencyIds: ['dependency-1'] });

    const decision = resolveTaskMutationGuard({
      actor,
      organizationId: 'org-1',
      previousTask: dependent,
      nextTask: { ...dependent, status: 'In Progress' },
      allTasks: [dependency, dependent],
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, 'dependency_not_complete');
  });

  it('enforces project and sprint lifecycle matrices', () => {
    assert.equal(resolveProjectLifecycleMutationGuard({
      actor,
      organizationId: 'org-1',
      previousProject: project,
      nextProject: { ...project, lifecycleStage: 'Analysis & Design' },
    }).allowed, true);

    assert.equal(resolveProjectLifecycleMutationGuard({
      actor,
      organizationId: 'org-1',
      previousProject: project,
      nextProject: { ...project, lifecycleStage: 'Deployment' },
    }).reason, 'transition_not_registered');

    const upcomingSprint: Sprint = {
      id: 'sprint-1',
      name: 'Sprint 1',
      projectId: 'project-1',
      startDate: '2026-07-01',
      endDate: '2026-07-14',
      status: 'Upcoming',
    };
    const activeSprint: Sprint = { ...upcomingSprint, id: 'sprint-2', name: 'Sprint 2', status: 'Active' };

    assert.equal(resolveSprintMutationGuard({
      actor,
      organizationId: 'org-1',
      previousSprint: upcomingSprint,
      nextSprint: { ...upcomingSprint, status: 'Active' },
      allSprints: [upcomingSprint],
    }).allowed, true);

    assert.equal(resolveSprintMutationGuard({
      actor,
      organizationId: 'org-1',
      previousSprint: upcomingSprint,
      nextSprint: { ...upcomingSprint, status: 'Active' },
      allSprints: [upcomingSprint, activeSprint],
    }).reason, 'active_sprint_exists');
  });

  it('blocks reorder and sprint assignment for active or terminal work without a separate decision', () => {
    assert.equal(resolveTaskReorderGuard({
      actor,
      organizationId: 'org-1',
      task: task({ status: 'To Do' }),
      projectId: 'project-1',
    }).allowed, true);

    assert.equal(resolveTaskReorderGuard({
      actor,
      organizationId: 'org-1',
      task: task({ status: 'In Progress' }),
      projectId: 'project-1',
    }).status, 'blocked');

    assert.equal(resolveTaskSprintAssignmentGuard({
      actor,
      organizationId: 'org-1',
      task: task({ status: 'In Review' }),
      projectId: 'project-1',
    }).allowed, true);

    assert.equal(resolveTaskSprintAssignmentGuard({
      actor,
      organizationId: 'org-1',
      task: task({ status: 'Done' }),
      projectId: 'project-1',
    }).reason, 'terminal_state_retention_required');
  });
  it('blocks hard delete for dependencies, subtasks, lineage, and terminal states', () => {
    const parent = task({ id: 'parent-1' });
    const child = task({ id: 'child-1', parentId: 'parent-1' });
    assert.equal(resolveTaskDeletionGuard({ actor, organizationId: 'org-1', task: parent, allTasks: [parent, child] }).reason, 'dependent_entity_exists');

    const lineageTask = task({
      id: 'lineage-1',
      sourceLineage: {
        documentGenerationId: 'docgen-1',
        handoffLedgerEntryIds: ['handoff-1'],
        evidenceRefs: ['ev-1'],
        lineageCompleteness: 'partial',
      },
    });
    assert.equal(resolveTaskDeletionGuard({ actor, organizationId: 'org-1', task: lineageTask, allTasks: [lineageTask] }).reason, 'lineage_retention_required');

    const doneTask = task({ id: 'done-1', status: 'Done' });
    assert.equal(resolveTaskDeletionGuard({ actor, organizationId: 'org-1', task: doneTask, allTasks: [doneTask] }).reason, 'terminal_state_retention_required');
  });

  it('requires import project, document context, actor, and non-empty item batch', () => {
    assert.equal(resolveDeliveryImportGuard({
      actor,
      organizationId: 'org-1',
      projectId: 'project-1',
      documentGenerationId: 'docgen-1',
      itemsToImport: [{ type: 'Task', title: 'Imported task', description: 'from docs', acceptanceCriteria: [] }],
    }).allowed, true);

    assert.equal(resolveDeliveryImportGuard({
      actor,
      organizationId: 'org-1',
      projectId: 'project-1',
      documentGenerationId: null,
      itemsToImport: [{ type: 'Task', title: 'Imported task', description: 'from docs', acceptanceCriteria: [] }],
    }).reason, 'missing_document_context');

    assert.equal(resolveDeliveryImportGuard({
      actor,
      organizationId: 'org-1',
      projectId: 'project-1',
      documentGenerationId: 'docgen-1',
      itemsToImport: [],
    }).reason, 'empty_import_batch');
  });

  it('builds sanitized audit envelopes without provider payloads or document bodies', () => {
    const previousTask = task();
    const nextTask = task({ status: 'In Progress', sourceLineage: { evidenceRefs: ['ev-1'], handoffLedgerEntryIds: ['handoff-1'], lineageCompleteness: 'complete' } });
    const decision = resolveTaskMutationGuard({ actor, organizationId: 'org-1', previousTask, nextTask, allTasks: [previousTask] });
    const activity = buildTaskMutationAuditActivity({ actor, organizationId: 'org-1', previousTask, nextTask, decision, occurredAt: '2026-07-08T00:00:00.000Z' });

    assert.match(activity.change, /source workflow guard/);
    assert.match(activity.newValue || '', /hasSourceLineage/);
    assert.doesNotMatch(activity.newValue || '', /provider|raw|prompt|secret|document body/i);

    const deleteDecision = resolveTaskDeletionGuard({ actor, organizationId: 'org-1', task: nextTask, allTasks: [nextTask] });
    const envelope = buildTaskDeletionAuditEnvelope({ actor, organizationId: 'org-1', task: nextTask, decision: deleteDecision, occurredAt: '2026-07-08T00:00:00.000Z' });
    assert.equal(envelope.result.status, 'blocked');
    assert.equal(envelope.retention?.deletionMode, 'hard_delete_denied');
    assert.deepEqual(envelope.lineage?.evidenceRefs, ['ev-1']);
  });

  it('composes product action policy attempt authority with domain transition denial', () => {
    const productDecision = resolveProductActionPolicy({
      user: contributor,
      organization,
      scope: projectScope,
      projectId: 'project-1',
      action: 'workflow.status.change',
    });
    assert.equal(productDecision.allowed, true);

    const doneTask = task({ status: 'Done', assigneeIds: ['dev-1'] });
    const transitionDecision = resolveTaskMutationGuard({
      actor: contributor,
      organizationId: 'org-1',
      previousTask: doneTask,
      nextTask: { ...doneTask, status: 'In Progress' },
      allTasks: [doneTask],
    });
    assert.equal(transitionDecision.status, 'decision_pending');

    const envelope = createDeliveryMutationAuditEnvelope({
      actor: contributor,
      organizationId: 'org-1',
      projectId: 'project-1',
      action: 'workflow.status.change',
      category: 'workflow',
      risk: 'critical',
      entityType: 'task',
      entityId: doneTask.id,
      operation: 'status_change',
      decision: transitionDecision,
      productActionDecision: productDecision,
      fromStatus: 'Done',
      toStatus: 'In Progress',
      retention: { deletionMode: 'not_applicable' },
    });

    assert.equal(envelope.action.productActionDecision?.allowed, true);
    assert.equal(envelope.result.status, 'blocked');
    assert.equal(envelope.transition?.matrixRuleId, 'task.done.reopen.progress');
  });
});