import {
  ActivityLogItem,
  ALL_STATUSES,
  Project,
  ProjectLifecycleStage,
  Sprint,
  Task,
  TaskStatus,
  User,
  WorkItem,
} from '../types';
import type { ProductAction, ProductActionDecision } from './productActionPolicy';

export type DeliveryWorkflowDecisionStatus = 'allowed' | 'blocked' | 'decision_pending';
export type DeliveryWorkflowReason =
  | 'allowed'
  | 'missing_actor_context'
  | 'missing_organization_context'
  | 'missing_project_context'
  | 'missing_entity_context'
  | 'missing_document_context'
  | 'unknown_status'
  | 'transition_not_registered'
  | 'transition_requires_approved_decision'
  | 'dependency_not_complete'
  | 'active_sprint_exists'
  | 'lineage_retention_required'
  | 'dependent_entity_exists'
  | 'terminal_state_retention_required'
  | 'empty_import_batch';

export interface DeliveryWorkflowDecision {
  allowed: boolean;
  status: DeliveryWorkflowDecisionStatus;
  reason: DeliveryWorkflowReason;
  ruleId: string;
  message: string;
  requiredEvidenceRefs?: string[];
}

interface TransitionRule {
  status: DeliveryWorkflowDecisionStatus;
  ruleId: string;
  message: string;
  requiredEvidenceRefs?: string[];
}

export type DeliveryMutationOperation =
  | 'create'
  | 'update'
  | 'status_change'
  | 'sprint_assignment'
  | 'sprint_status_change'
  | 'project_lifecycle_change'
  | 'reorder'
  | 'import'
  | 'delete'
  | 'delete_denied';

export interface DeliveryMutationAuditEnvelope {
  schemaVersion: 'delivery-mutation-audit.v1';
  correlationId: string;
  occurredAt: string;
  actor: {
    userId: string;
    orgRole?: string;
    permissionSnapshot: string[];
  };
  scope: {
    orgId: string;
    projectId?: string;
  };
  action: {
    name: ProductAction | 'delivery.task.delete_denied' | 'delivery.workflow.transition';
    category: 'delivery' | 'workflow' | 'automation' | 'timesheet' | 'import';
    risk: 'low' | 'medium' | 'high' | 'critical';
    productActionDecision?: Pick<ProductActionDecision, 'action' | 'allowed' | 'reason' | 'risk' | 'status'>;
  };
  entity: {
    type: 'task' | 'sprint' | 'project' | 'import_batch';
    id?: string;
  };
  mutation: {
    operation: DeliveryMutationOperation;
    beforeSummary?: Record<string, unknown>;
    afterSummary?: Record<string, unknown>;
    changedFields?: string[];
  };
  transition?: {
    fromStatus?: string;
    toStatus?: string;
    matrixRuleId: string;
    allowed: boolean;
    denialReason?: DeliveryWorkflowReason;
    requiredEvidenceRefs?: string[];
  };
  lineage?: {
    sourceProcessId?: string;
    sourceAssessmentId?: string;
    documentGenerationId?: string;
    handoffLedgerEntryIds?: string[];
    evidenceRefs?: string[];
    lineageCompleteness?: string;
  };
  retention?: {
    deletionMode: 'not_applicable' | 'hard_delete_allowed' | 'hard_delete_denied';
    retentionClass?: 'delivery_work_item' | 'audit' | 'handoff';
    denialReason?: DeliveryWorkflowReason;
  };
  result: {
    status: 'allowed' | 'blocked';
    errorCode?: DeliveryWorkflowReason;
  };
}

export class DeliveryWorkflowPolicyError extends Error {
  readonly decision: DeliveryWorkflowDecision;

  constructor(decision: DeliveryWorkflowDecision) {
    super(decision.message);
    this.name = 'DeliveryWorkflowPolicyError';
    this.decision = decision;
  }
}

const BLOCKED_DECISION_COPY = 'This delivery mutation is blocked by the source workflow policy before persistence.';
const ACTIVE_TASK_STATUSES: TaskStatus[] = ['In Progress', 'In Review', 'Testing', 'Ready for Release', 'Done'];
const TERMINAL_DELETE_STATUSES: TaskStatus[] = ['Ready for Release', 'Done'];

const taskStatusSet = new Set<string>(ALL_STATUSES);
const projectStages: ProjectLifecycleStage[] = ['Planning', 'Analysis & Design', 'Development', 'Testing', 'Deployment', 'Maintenance'];
const projectStageSet = new Set<string>(projectStages);
const sprintStatuses = ['Upcoming', 'Active', 'Completed'] as const;
const sprintStatusSet = new Set<string>(sprintStatuses);

const allow = (ruleId: string, message = 'Delivery workflow transition allowed.'): TransitionRule => ({
  status: 'allowed',
  ruleId,
  message,
});

const pending = (ruleId: string, message: string, requiredEvidenceRefs: string[] = ['approved-decision-record']): TransitionRule => ({
  status: 'decision_pending',
  ruleId,
  message,
  requiredEvidenceRefs,
});

const TASK_STATUS_TRANSITIONS: Record<TaskStatus, Partial<Record<TaskStatus, TransitionRule>>> = {
  'To Do': {
    'To Do': allow('task.noop.to_do'),
    'In Progress': allow('task.todo.start'),
    'On Hold': allow('task.todo.hold'),
    'Blocked': allow('task.todo.block'),
    'In Review': pending('task.todo.review.skip', 'Skipping delivery work directly into review requires an approved triage decision.'),
  },
  'In Progress': {
    'In Progress': allow('task.noop.in_progress'),
    'In Review': allow('task.progress.review'),
    'On Hold': allow('task.progress.hold'),
    'Blocked': allow('task.progress.block'),
    'To Do': pending('task.progress.todo.rollback', 'Moving active work back to backlog requires a re-scope decision.'),
  },
  'In Review': {
    'In Review': allow('task.noop.in_review'),
    'Testing': allow('task.review.testing'),
    'In Progress': allow('task.review.rework'),
    'On Hold': allow('task.review.hold'),
    'Blocked': allow('task.review.block'),
    'Ready for Release': pending('task.review.release.skip', 'Skipping testing before release requires an approved review-bypass decision.'),
  },
  Testing: {
    Testing: allow('task.noop.testing'),
    'Ready for Release': allow('task.testing.ready_for_release'),
    'In Review': allow('task.testing.review_rework'),
    Blocked: allow('task.testing.block'),
    'In Progress': pending('task.testing.progress.rollback', 'Returning tested work to active development requires a defect or rework decision.'),
  },
  'Ready for Release': {
    'Ready for Release': allow('task.noop.ready_for_release'),
    Done: allow('task.ready.done'),
    Testing: allow('task.ready.testing_rollback'),
    Blocked: allow('task.ready.block'),
    'In Review': pending('task.ready.review.rollback', 'Rolling release-ready work back to review requires a release rollback decision.'),
  },
  Done: {
    Done: allow('task.noop.done'),
    'In Progress': pending('task.done.reopen.progress', 'Reopening completed work requires an approved reopen decision.'),
    'In Review': pending('task.done.reopen.review', 'Reopening completed work requires an approved reopen decision.'),
    Testing: pending('task.done.reopen.testing', 'Reopening completed work requires an approved reopen decision.'),
  },
  Blocked: {
    Blocked: allow('task.noop.blocked'),
    'In Progress': pending('task.blocked.resume.progress', 'Resuming blocked work requires blocker-resolution context.'),
    'In Review': pending('task.blocked.resume.review', 'Resuming blocked work requires blocker-resolution context.'),
    Testing: pending('task.blocked.resume.testing', 'Resuming blocked work requires blocker-resolution context.'),
    'On Hold': allow('task.blocked.hold'),
  },
  'On Hold': {
    'On Hold': allow('task.noop.on_hold'),
    'To Do': allow('task.hold.backlog'),
    'In Progress': pending('task.hold.resume.progress', 'Resuming held work requires resume context.'),
    'In Review': pending('task.hold.resume.review', 'Resuming held work requires resume context.'),
    Testing: pending('task.hold.resume.testing', 'Resuming held work requires resume context.'),
    Blocked: allow('task.hold.block'),
  },
};

const PROJECT_STAGE_TRANSITIONS: Record<ProjectLifecycleStage, Partial<Record<ProjectLifecycleStage, TransitionRule>>> = {
  Planning: {
    Planning: allow('project.noop.planning'),
    'Analysis & Design': allow('project.planning.analysis'),
    Development: pending('project.planning.development.skip', 'Skipping analysis requires an approved lifecycle decision.'),
  },
  'Analysis & Design': {
    'Analysis & Design': allow('project.noop.analysis'),
    Development: allow('project.analysis.development'),
    Planning: pending('project.analysis.planning.rollback', 'Returning to planning requires a scope rollback decision.'),
    Testing: pending('project.analysis.testing.skip', 'Skipping development requires an approved lifecycle decision.'),
  },
  Development: {
    Development: allow('project.noop.development'),
    Testing: allow('project.development.testing'),
    'Analysis & Design': pending('project.development.analysis.rollback', 'Returning to analysis requires a rework decision.'),
    Deployment: pending('project.development.deployment.skip', 'Skipping testing requires an approved release decision.'),
  },
  Testing: {
    Testing: allow('project.noop.testing'),
    Deployment: allow('project.testing.deployment'),
    Development: pending('project.testing.development.rollback', 'Returning to development requires a defect or rework decision.'),
    Maintenance: pending('project.testing.maintenance.skip', 'Skipping deployment requires an approved lifecycle decision.'),
  },
  Deployment: {
    Deployment: allow('project.noop.deployment'),
    Maintenance: allow('project.deployment.maintenance'),
    Testing: pending('project.deployment.testing.rollback', 'Deployment rollback requires an approved rollback decision.'),
  },
  Maintenance: {
    Maintenance: allow('project.noop.maintenance'),
    Planning: pending('project.maintenance.planning.new_phase', 'Starting a new lifecycle phase requires an approved scope decision.'),
  },
};

const SPRINT_STATUS_TRANSITIONS: Record<Sprint['status'], Partial<Record<Sprint['status'], TransitionRule>>> = {
  Upcoming: {
    Upcoming: allow('sprint.noop.upcoming'),
    Active: allow('sprint.upcoming.active'),
    Completed: pending('sprint.upcoming.completed.cancel', 'Completing a sprint before it starts requires a cancellation/closure decision.'),
  },
  Active: {
    Active: allow('sprint.noop.active'),
    Completed: allow('sprint.active.completed'),
    Upcoming: pending('sprint.active.upcoming.rollback', 'Rolling back an active sprint requires an approved sprint rollback decision.'),
  },
  Completed: {
    Completed: allow('sprint.noop.completed'),
    Active: pending('sprint.completed.active.reopen', 'Reopening a completed sprint requires an approved reopen decision.'),
  },
};

const buildDecision = (
  status: DeliveryWorkflowDecisionStatus,
  reason: DeliveryWorkflowReason,
  ruleId: string,
  message: string,
  requiredEvidenceRefs?: string[],
): DeliveryWorkflowDecision => ({
  allowed: status === 'allowed',
  status,
  reason,
  ruleId,
  message,
  requiredEvidenceRefs,
});

const decisionFromRule = (rule: TransitionRule | undefined): DeliveryWorkflowDecision => {
  if (!rule) {
    return buildDecision('blocked', 'transition_not_registered', 'transition.not_registered', BLOCKED_DECISION_COPY);
  }
  if (rule.status === 'decision_pending') {
    return buildDecision('decision_pending', 'transition_requires_approved_decision', rule.ruleId, rule.message, rule.requiredEvidenceRefs);
  }
  return buildDecision('allowed', 'allowed', rule.ruleId, rule.message, rule.requiredEvidenceRefs);
};

const assertDecision = (decision: DeliveryWorkflowDecision) => {
  if (!decision.allowed) throw new DeliveryWorkflowPolicyError(decision);
  return decision;
};

const hasActorContext = (actor: User | null | undefined) => Boolean(actor?.id);
const hasOrgContext = (organizationId: string | null | undefined) => Boolean(organizationId);
const hasProjectContext = (projectId: string | null | undefined) => Boolean(projectId);

const changedFields = (previousTask: Task, nextTask: Task) => {
  const fields: Array<keyof Task> = [
    'title',
    'description',
    'status',
    'priority',
    'projectId',
    'epicId',
    'sprintId',
    'assigneeIds',
    'storyPoints',
    'startDate',
    'dueDate',
    'parentId',
    'dependencyIds',
    'orderRank',
  ];
  return fields.filter(field => JSON.stringify(previousTask[field]) !== JSON.stringify(nextTask[field])).map(String);
};

const summarizeTask = (task: Task | undefined): Record<string, unknown> | undefined => task ? {
  id: task.id,
  projectId: task.projectId,
  status: task.status,
  sprintId: task.sprintId,
  epicId: task.epicId,
  orderRank: task.orderRank,
  assigneeCount: task.assigneeIds?.length || 0,
  dependencyCount: task.dependencyIds?.length || 0,
  hasSourceLineage: Boolean(task.sourceLineage),
} : undefined;

const summarizeProject = (project: Project | undefined): Record<string, unknown> | undefined => project ? {
  id: project.id,
  lifecycleStage: project.lifecycleStage,
  healthStatus: project.healthStatus,
} : undefined;

const summarizeSprint = (sprint: Sprint | undefined): Record<string, unknown> | undefined => sprint ? {
  id: sprint.id,
  projectId: sprint.projectId,
  status: sprint.status,
  startDate: sprint.startDate,
  endDate: sprint.endDate,
  capacity: sprint.capacity,
} : undefined;

const lineageFromTask = (task: Task | undefined) => task?.sourceLineage ? {
  sourceProcessId: task.sourceLineage.processId,
  sourceAssessmentId: task.sourceLineage.assessmentId,
  documentGenerationId: task.sourceLineage.documentGenerationId || task.sourceLineage.sourceGenerationId,
  handoffLedgerEntryIds: task.sourceLineage.handoffLedgerEntryIds,
  evidenceRefs: task.sourceLineage.evidenceRefs,
  lineageCompleteness: task.sourceLineage.lineageCompleteness,
} : undefined;

const mutationOperationForTask = (previousTask: Task, nextTask: Task): DeliveryMutationOperation => {
  if (previousTask.status !== nextTask.status) return 'status_change';
  if (previousTask.sprintId !== nextTask.sprintId) return 'sprint_assignment';
  if (previousTask.orderRank !== nextTask.orderRank || previousTask.epicId !== nextTask.epicId) return 'reorder';
  return 'update';
};

export const resolveTaskStatusTransition = (
  fromStatus: TaskStatus | string | undefined,
  toStatus: TaskStatus | string | undefined,
) => {
  if (!fromStatus || !toStatus || !taskStatusSet.has(fromStatus) || !taskStatusSet.has(toStatus)) {
    return buildDecision('blocked', 'unknown_status', 'task.status.unknown', 'Unknown task status blocked before persistence.');
  }
  return decisionFromRule(TASK_STATUS_TRANSITIONS[fromStatus as TaskStatus][toStatus as TaskStatus]);
};

export const resolveProjectLifecycleTransition = (
  fromStage: ProjectLifecycleStage | string | undefined,
  toStage: ProjectLifecycleStage | string | undefined,
) => {
  if (!fromStage || !toStage || !projectStageSet.has(fromStage) || !projectStageSet.has(toStage)) {
    return buildDecision('blocked', 'unknown_status', 'project.lifecycle.unknown', 'Unknown project lifecycle stage blocked before persistence.');
  }
  return decisionFromRule(PROJECT_STAGE_TRANSITIONS[fromStage as ProjectLifecycleStage][toStage as ProjectLifecycleStage]);
};

export const resolveSprintStatusTransition = (
  fromStatus: Sprint['status'] | string | undefined,
  toStatus: Sprint['status'] | string | undefined,
) => {
  if (!fromStatus || !toStatus || !sprintStatusSet.has(fromStatus as Sprint['status']) || !sprintStatusSet.has(toStatus as Sprint['status'])) {
    return buildDecision('blocked', 'unknown_status', 'sprint.status.unknown', 'Unknown sprint status blocked before persistence.');
  }
  return decisionFromRule(SPRINT_STATUS_TRANSITIONS[fromStatus as Sprint['status']][toStatus as Sprint['status']]);
};

export const resolveTaskMutationGuard = (input: {
  actor: User | null | undefined;
  organizationId: string | null | undefined;
  previousTask: Task | undefined;
  nextTask: Task | undefined;
  allTasks: Task[];
}) => {
  if (!hasActorContext(input.actor)) return buildDecision('blocked', 'missing_actor_context', 'task.actor.missing', 'Sign in before mutating delivery work items.');
  if (!hasOrgContext(input.organizationId)) return buildDecision('blocked', 'missing_organization_context', 'task.org.missing', 'Select an organization before mutating delivery work items.');
  if (!input.previousTask || !input.nextTask) return buildDecision('blocked', 'missing_entity_context', 'task.entity.missing', 'Open a delivery work item before mutating it.');
  if (!hasProjectContext(input.nextTask.projectId)) return buildDecision('blocked', 'missing_project_context', 'task.project.missing', 'Select a project before mutating delivery work items.');

  const transition = resolveTaskStatusTransition(input.previousTask.status, input.nextTask.status);
  if (!transition.allowed) return transition;

  if (ACTIVE_TASK_STATUSES.includes(input.nextTask.status)) {
    const dependencies = input.allTasks.filter(task => input.nextTask.dependencyIds?.includes(task.id));
    const incomplete = dependencies.filter(task => task.status !== 'Done');
    if (incomplete.length > 0) {
      return buildDecision('blocked', 'dependency_not_complete', 'task.dependency.incomplete', `Complete dependencies first: ${incomplete.map(task => task.title).join(', ')}.`);
    }
  }

  return buildDecision('allowed', 'allowed', transition.ruleId, transition.message, transition.requiredEvidenceRefs);
};

export const assertTaskMutationAllowed = (input: Parameters<typeof resolveTaskMutationGuard>[0]) =>
  assertDecision(resolveTaskMutationGuard(input));

export const resolveProjectLifecycleMutationGuard = (input: {
  actor: User | null | undefined;
  organizationId: string | null | undefined;
  previousProject: Project | undefined;
  nextProject: Project | undefined;
}) => {
  if (!hasActorContext(input.actor)) return buildDecision('blocked', 'missing_actor_context', 'project.actor.missing', 'Sign in before mutating project lifecycle.');
  if (!hasOrgContext(input.organizationId)) return buildDecision('blocked', 'missing_organization_context', 'project.org.missing', 'Select an organization before mutating project lifecycle.');
  if (!input.previousProject || !input.nextProject) return buildDecision('blocked', 'missing_entity_context', 'project.entity.missing', 'Open a project before mutating lifecycle state.');
  if (!hasProjectContext(input.nextProject.id)) return buildDecision('blocked', 'missing_project_context', 'project.id.missing', 'Select a project before mutating lifecycle state.');
  return resolveProjectLifecycleTransition(input.previousProject.lifecycleStage, input.nextProject.lifecycleStage);
};

export const assertProjectLifecycleMutationAllowed = (input: Parameters<typeof resolveProjectLifecycleMutationGuard>[0]) =>
  assertDecision(resolveProjectLifecycleMutationGuard(input));

export const resolveSprintMutationGuard = (input: {
  actor: User | null | undefined;
  organizationId: string | null | undefined;
  previousSprint: Sprint | undefined;
  nextSprint: Sprint | undefined;
  allSprints: Sprint[];
}) => {
  if (!hasActorContext(input.actor)) return buildDecision('blocked', 'missing_actor_context', 'sprint.actor.missing', 'Sign in before mutating sprint state.');
  if (!hasOrgContext(input.organizationId)) return buildDecision('blocked', 'missing_organization_context', 'sprint.org.missing', 'Select an organization before mutating sprint state.');
  if (!input.previousSprint || !input.nextSprint) return buildDecision('blocked', 'missing_entity_context', 'sprint.entity.missing', 'Open a sprint before mutating sprint state.');
  if (!hasProjectContext(input.nextSprint.projectId)) return buildDecision('blocked', 'missing_project_context', 'sprint.project.missing', 'Select a project before mutating sprint state.');

  const transition = resolveSprintStatusTransition(input.previousSprint.status, input.nextSprint.status);
  if (!transition.allowed) return transition;

  if (input.previousSprint.status !== 'Active' && input.nextSprint.status === 'Active') {
    const activeSprint = input.allSprints.find(sprint =>
      sprint.projectId === input.nextSprint!.projectId &&
      sprint.id !== input.nextSprint!.id &&
      sprint.status === 'Active'
    );
    if (activeSprint) {
      return buildDecision('blocked', 'active_sprint_exists', 'sprint.active.single', `Complete or close ${activeSprint.name} before starting another active sprint.`);
    }
  }

  return buildDecision('allowed', 'allowed', transition.ruleId, transition.message, transition.requiredEvidenceRefs);
};

export const assertSprintMutationAllowed = (input: Parameters<typeof resolveSprintMutationGuard>[0]) =>
  assertDecision(resolveSprintMutationGuard(input));

export const resolveTaskReorderGuard = (input: {
  actor: User | null | undefined;
  organizationId: string | null | undefined;
  task: Task | undefined;
  projectId?: string | null;
}) => {
  if (!hasActorContext(input.actor)) return buildDecision('blocked', 'missing_actor_context', 'task.reorder.actor.missing', 'Sign in before reordering delivery work items.');
  if (!hasOrgContext(input.organizationId)) return buildDecision('blocked', 'missing_organization_context', 'task.reorder.org.missing', 'Select an organization before reordering delivery work items.');
  if (!input.task) return buildDecision('blocked', 'missing_entity_context', 'task.reorder.entity.missing', 'Open a delivery work item before reordering it.');
  if (!hasProjectContext(input.projectId || input.task.projectId)) return buildDecision('blocked', 'missing_project_context', 'task.reorder.project.missing', 'Select a project before reordering delivery work items.');
  if (!['To Do', 'Blocked', 'On Hold'].includes(input.task.status)) {
    return buildDecision('blocked', 'transition_requires_approved_decision', 'task.reorder.active_or_terminal', 'Only backlog, blocked, or held work can be reordered without a separate planning decision.');
  }
  return buildDecision('allowed', 'allowed', 'task.reorder.backlog_allowed', 'Delivery backlog reorder accepted by source guard.');
};

export const assertTaskReorderAllowed = (input: Parameters<typeof resolveTaskReorderGuard>[0]) =>
  assertDecision(resolveTaskReorderGuard(input));

export const resolveTaskSprintAssignmentGuard = (input: {
  actor: User | null | undefined;
  organizationId: string | null | undefined;
  task: Task | undefined;
  projectId?: string | null;
}) => {
  if (!hasActorContext(input.actor)) return buildDecision('blocked', 'missing_actor_context', 'task.sprint.actor.missing', 'Sign in before moving delivery work items between sprints.');
  if (!hasOrgContext(input.organizationId)) return buildDecision('blocked', 'missing_organization_context', 'task.sprint.org.missing', 'Select an organization before moving delivery work items between sprints.');
  if (!input.task) return buildDecision('blocked', 'missing_entity_context', 'task.sprint.entity.missing', 'Open a delivery work item before moving it between sprints.');
  if (!hasProjectContext(input.projectId || input.task.projectId)) return buildDecision('blocked', 'missing_project_context', 'task.sprint.project.missing', 'Select a project before moving delivery work items between sprints.');
  if (TERMINAL_DELETE_STATUSES.includes(input.task.status)) {
    return buildDecision('blocked', 'terminal_state_retention_required', 'task.sprint.terminal_retention', 'Release-ready or completed work requires a separate reopen or retention decision before sprint movement.');
  }
  return buildDecision('allowed', 'allowed', 'task.sprint.assignment_allowed', 'Delivery sprint assignment accepted by source guard.');
};

export const assertTaskSprintAssignmentAllowed = (input: Parameters<typeof resolveTaskSprintAssignmentGuard>[0]) =>
  assertDecision(resolveTaskSprintAssignmentGuard(input));
export const resolveTaskDeletionGuard = (input: {
  actor: User | null | undefined;
  organizationId: string | null | undefined;
  task: Task | undefined;
  allTasks: Task[];
}) => {
  if (!hasActorContext(input.actor)) return buildDecision('blocked', 'missing_actor_context', 'task.delete.actor.missing', 'Sign in before deleting delivery work items.');
  if (!hasOrgContext(input.organizationId)) return buildDecision('blocked', 'missing_organization_context', 'task.delete.org.missing', 'Select an organization before deleting delivery work items.');
  if (!input.task) return buildDecision('blocked', 'missing_entity_context', 'task.delete.entity.missing', 'Open a delivery work item before deleting it.');
  if (!hasProjectContext(input.task.projectId)) return buildDecision('blocked', 'missing_project_context', 'task.delete.project.missing', 'Select a project before deleting delivery work items.');

  const dependentTasks = input.allTasks.filter(candidate => candidate.dependencyIds?.includes(input.task!.id));
  if (dependentTasks.length > 0) {
    return buildDecision('blocked', 'dependent_entity_exists', 'task.delete.dependency_retention', `This work item is a dependency for: ${dependentTasks.map(task => task.title).join(', ')}.`);
  }

  const childTasks = input.allTasks.filter(candidate => candidate.parentId === input.task!.id);
  if (childTasks.length > 0) {
    return buildDecision('blocked', 'dependent_entity_exists', 'task.delete.child_retention', `This work item has retained subtasks: ${childTasks.map(task => task.title).join(', ')}.`);
  }

  const lineage = input.task.sourceLineage;
  const hasLineageDependency = Boolean(
    lineage?.processId ||
    lineage?.assessmentId ||
    lineage?.documentGenerationId ||
    lineage?.sourceGenerationId ||
    lineage?.handoffLedgerEntryIds?.length ||
    lineage?.evidenceRefs?.length ||
    lineage?.deliveryPackId
  );
  if (hasLineageDependency) {
    return buildDecision('blocked', 'lineage_retention_required', 'task.delete.lineage_retention', 'This work item carries source lineage, handoff, or evidence references and cannot be hard-deleted.');
  }

  if (TERMINAL_DELETE_STATUSES.includes(input.task.status)) {
    return buildDecision('blocked', 'terminal_state_retention_required', 'task.delete.terminal_retention', 'Completed or release-ready work requires retention review before deletion.');
  }

  return buildDecision('allowed', 'allowed', 'task.delete.clean_work_item', 'Delivery work item delete allowed by workflow retention guard.');
};

export const assertTaskDeletionAllowed = (input: Parameters<typeof resolveTaskDeletionGuard>[0]) =>
  assertDecision(resolveTaskDeletionGuard(input));

export const resolveDeliveryImportGuard = (input: {
  actor: User | null | undefined;
  organizationId: string | null | undefined;
  projectId: string | null | undefined;
  documentGenerationId?: string | null;
  hasDocumentContext?: boolean;
  itemsToImport: WorkItem[];
}) => {
  if (!hasActorContext(input.actor)) return buildDecision('blocked', 'missing_actor_context', 'delivery.import.actor.missing', 'Sign in before importing delivery work items.');
  if (!hasOrgContext(input.organizationId)) return buildDecision('blocked', 'missing_organization_context', 'delivery.import.org.missing', 'Select an organization before importing delivery work items.');
  if (!hasProjectContext(input.projectId)) return buildDecision('blocked', 'missing_project_context', 'delivery.import.project.missing', 'Select a project before importing delivery work items.');
  if (!input.documentGenerationId && !input.hasDocumentContext) return buildDecision('blocked', 'missing_document_context', 'delivery.import.document.missing', 'Open generated document context before importing work items.');
  if (input.itemsToImport.length === 0) return buildDecision('blocked', 'empty_import_batch', 'delivery.import.empty_batch', 'Select generated work items before importing.');
  return buildDecision('allowed', 'allowed', 'delivery.import.context_ready', 'Delivery import context accepted by source guard.');
};

export const assertDeliveryImportAllowed = (input: Parameters<typeof resolveDeliveryImportGuard>[0]) =>
  assertDecision(resolveDeliveryImportGuard(input));

export const createDeliveryMutationAuditEnvelope = (input: {
  actor: User;
  organizationId: string;
  projectId?: string;
  action: DeliveryMutationAuditEnvelope['action']['name'];
  category: DeliveryMutationAuditEnvelope['action']['category'];
  risk: DeliveryMutationAuditEnvelope['action']['risk'];
  entityType: DeliveryMutationAuditEnvelope['entity']['type'];
  entityId?: string;
  operation: DeliveryMutationOperation;
  beforeSummary?: Record<string, unknown>;
  afterSummary?: Record<string, unknown>;
  changedFields?: string[];
  decision: DeliveryWorkflowDecision;
  productActionDecision?: ProductActionDecision;
  fromStatus?: string;
  toStatus?: string;
  lineage?: DeliveryMutationAuditEnvelope['lineage'];
  retention?: DeliveryMutationAuditEnvelope['retention'];
  occurredAt?: string;
  correlationId?: string;
}): DeliveryMutationAuditEnvelope => {
  const occurredAt = input.occurredAt || new Date().toISOString();
  return {
    schemaVersion: 'delivery-mutation-audit.v1',
    correlationId: input.correlationId || `delivery-mutation-${occurredAt}-${input.entityId || input.entityType}`,
    occurredAt,
    actor: {
      userId: input.actor.id,
      orgRole: input.actor.orgRole,
      permissionSnapshot: [...(input.actor.permissions || [])].sort(),
    },
    scope: {
      orgId: input.organizationId,
      projectId: input.projectId,
    },
    action: {
      name: input.action,
      category: input.category,
      risk: input.risk,
      productActionDecision: input.productActionDecision ? {
        action: input.productActionDecision.action,
        allowed: input.productActionDecision.allowed,
        reason: input.productActionDecision.reason,
        risk: input.productActionDecision.risk,
        status: input.productActionDecision.status,
      } : undefined,
    },
    entity: {
      type: input.entityType,
      id: input.entityId,
    },
    mutation: {
      operation: input.operation,
      beforeSummary: input.beforeSummary,
      afterSummary: input.afterSummary,
      changedFields: input.changedFields,
    },
    transition: input.fromStatus || input.toStatus ? {
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      matrixRuleId: input.decision.ruleId,
      allowed: input.decision.allowed,
      denialReason: input.decision.allowed ? undefined : input.decision.reason,
      requiredEvidenceRefs: input.decision.requiredEvidenceRefs,
    } : undefined,
    lineage: input.lineage,
    retention: input.retention,
    result: {
      status: input.decision.allowed ? 'allowed' : 'blocked',
      errorCode: input.decision.allowed ? undefined : input.decision.reason,
    },
  };
};

export const buildTaskMutationAuditActivity = (input: {
  actor: User;
  organizationId: string;
  previousTask?: Task;
  nextTask?: Task;
  decision: DeliveryWorkflowDecision;
  operation?: DeliveryMutationOperation;
  occurredAt?: string;
}): ActivityLogItem => {
  const operation = input.operation || (input.previousTask && input.nextTask ? mutationOperationForTask(input.previousTask, input.nextTask) : 'update');
  const envelope = createDeliveryMutationAuditEnvelope({
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: input.nextTask?.projectId || input.previousTask?.projectId,
    action: operation === 'status_change' ? 'workflow.status.change' : 'project.task.update',
    category: operation === 'status_change' ? 'workflow' : 'delivery',
    risk: operation === 'status_change' || operation === 'reorder' || operation === 'sprint_assignment' ? 'critical' : 'high',
    entityType: 'task',
    entityId: input.nextTask?.id || input.previousTask?.id,
    operation,
    beforeSummary: summarizeTask(input.previousTask),
    afterSummary: summarizeTask(input.nextTask),
    changedFields: input.previousTask && input.nextTask ? changedFields(input.previousTask, input.nextTask) : undefined,
    decision: input.decision,
    fromStatus: input.previousTask?.status,
    toStatus: input.nextTask?.status,
    lineage: lineageFromTask(input.nextTask || input.previousTask),
    retention: { deletionMode: 'not_applicable' },
    occurredAt: input.occurredAt,
  });

  return {
    id: `act-${envelope.correlationId}`,
    userId: input.actor.id,
    change: `recorded source workflow guard ${envelope.transition?.matrixRuleId || input.decision.ruleId}`,
    previousValue: input.previousTask ? JSON.stringify(envelope.mutation.beforeSummary) : undefined,
    newValue: input.nextTask ? JSON.stringify(envelope.mutation.afterSummary) : undefined,
    createdAt: envelope.occurredAt,
  };
};

export const buildTaskDeletionAuditEnvelope = (input: {
  actor: User;
  organizationId: string;
  task: Task;
  decision: DeliveryWorkflowDecision;
  occurredAt?: string;
}) => createDeliveryMutationAuditEnvelope({
  actor: input.actor,
  organizationId: input.organizationId,
  projectId: input.task.projectId,
  action: input.decision.allowed ? 'project.task.delete' : 'delivery.task.delete_denied',
  category: 'delivery',
  risk: 'critical',
  entityType: 'task',
  entityId: input.task.id,
  operation: input.decision.allowed ? 'delete' : 'delete_denied',
  beforeSummary: summarizeTask(input.task),
  changedFields: ['deleted'],
  decision: input.decision,
  fromStatus: input.task.status,
  lineage: lineageFromTask(input.task),
  retention: {
    deletionMode: input.decision.allowed ? 'hard_delete_allowed' : 'hard_delete_denied',
    retentionClass: 'delivery_work_item',
    denialReason: input.decision.allowed ? undefined : input.decision.reason,
  },
  occurredAt: input.occurredAt,
});

export const buildProjectLifecycleAuditEnvelope = (input: {
  actor: User;
  organizationId: string;
  previousProject: Project;
  nextProject: Project;
  decision: DeliveryWorkflowDecision;
  occurredAt?: string;
}) => createDeliveryMutationAuditEnvelope({
  actor: input.actor,
  organizationId: input.organizationId,
  projectId: input.nextProject.id,
  action: 'workflow.status.change',
  category: 'workflow',
  risk: 'critical',
  entityType: 'project',
  entityId: input.nextProject.id,
  operation: 'project_lifecycle_change',
  beforeSummary: summarizeProject(input.previousProject),
  afterSummary: summarizeProject(input.nextProject),
  changedFields: input.previousProject.lifecycleStage !== input.nextProject.lifecycleStage ? ['lifecycleStage'] : [],
  decision: input.decision,
  fromStatus: input.previousProject.lifecycleStage,
  toStatus: input.nextProject.lifecycleStage,
  retention: { deletionMode: 'not_applicable' },
  occurredAt: input.occurredAt,
});

export const buildSprintAuditEnvelope = (input: {
  actor: User;
  organizationId: string;
  previousSprint: Sprint;
  nextSprint: Sprint;
  decision: DeliveryWorkflowDecision;
  occurredAt?: string;
}) => createDeliveryMutationAuditEnvelope({
  actor: input.actor,
  organizationId: input.organizationId,
  projectId: input.nextSprint.projectId,
  action: 'workflow.status.change',
  category: 'workflow',
  risk: 'critical',
  entityType: 'sprint',
  entityId: input.nextSprint.id,
  operation: 'sprint_status_change',
  beforeSummary: summarizeSprint(input.previousSprint),
  afterSummary: summarizeSprint(input.nextSprint),
  changedFields: input.previousSprint.status !== input.nextSprint.status ? ['status'] : [],
  decision: input.decision,
  fromStatus: input.previousSprint.status,
  toStatus: input.nextSprint.status,
  retention: { deletionMode: 'not_applicable' },
  occurredAt: input.occurredAt,
});