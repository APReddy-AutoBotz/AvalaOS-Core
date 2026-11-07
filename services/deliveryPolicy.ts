import { Task, TaskStatus, User } from '../types';
import type { StudioDeliveryDiscoveryDisposition } from './productAcceptanceBridge/contracts';

export class DeliveryPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeliveryPolicyError';
  }
}

const ADMIN_PERMISSIONS = new Set(['org.admin', 'security.manage', 'roles.manage']);
const MANAGER_PERMISSIONS = new Set(['project.manage']);
const ACTIVE_STATUSES: TaskStatus[] = ['In Progress', 'In Review', 'Testing', 'Ready for Release', 'Done'];
export const LEGACY_DELIVERY_STATUS_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  'To Do': ['To Do', 'In Progress', 'On Hold', 'Blocked'],
  'In Progress': ['In Progress', 'In Review', 'On Hold', 'Blocked'],
  'In Review': ['In Review', 'Testing', 'In Progress', 'On Hold', 'Blocked'],
  'Testing': ['Testing', 'Ready for Release', 'In Review', 'Blocked'],
  'Ready for Release': ['Ready for Release', 'Done', 'Testing', 'Blocked'],
  'Done': ['Done'],
  'Blocked': ['Blocked', 'On Hold'],
  'On Hold': ['On Hold', 'To Do', 'Blocked'],
};
const RELEASED_DISCOVERY_DISPOSITIONS = new Set<StudioDeliveryDiscoveryDisposition>([
  'source_backed_answer_accepted',
  'approved_nonblocking_scope',
]);

export type DeliveryDiscoveryDispositionByTask = ReadonlyMap<string, StudioDeliveryDiscoveryDisposition | null>;
export type DeliveryDependencyViolation = Pick<Task, 'id' | 'title' | 'status' | 'sourceLineage'>;

const normalized = (values: string[] | undefined) => [...(values || [])].sort().join('|');

export const hasDeliveryPermission = (user: User | null | undefined, permission: string) =>
  Boolean(user?.permissions?.includes(permission));

export const isDeliveryAdmin = (user: User | null | undefined) =>
  Boolean(user?.permissions?.some(permission => ADMIN_PERMISSIONS.has(permission)));

export const canManageProjectDelivery = (user: User | null | undefined) =>
  isDeliveryAdmin(user) || Boolean(user?.permissions?.some(permission => MANAGER_PERMISSIONS.has(permission)));

export const isAssignedToTask = (user: User | null | undefined, task: Pick<Task, 'assigneeIds'>) =>
  Boolean(user && task.assigneeIds?.includes(user.id));

export const canCreateDeliveryTask = (user: User | null | undefined) =>
  canManageProjectDelivery(user) ||
  hasDeliveryPermission(user, 'task.create') ||
  hasDeliveryPermission(user, 'backlog.manage') ||
  hasDeliveryPermission(user, 'workitems.import');

export const canEditDeliveryTask = (user: User | null | undefined, task: Pick<Task, 'assigneeIds'>) =>
  canManageProjectDelivery(user) ||
  hasDeliveryPermission(user, 'task.update') ||
  (hasDeliveryPermission(user, 'task.update.own') && isAssignedToTask(user, task));

export const canDeleteDeliveryTask = (user: User | null | undefined) =>
  canManageProjectDelivery(user) || hasDeliveryPermission(user, 'task.delete');

export const canAssignDeliveryTask = (user: User | null | undefined) =>
  canManageProjectDelivery(user) || hasDeliveryPermission(user, 'task.assign');

export const canPlanDeliverySprint = (user: User | null | undefined) =>
  canManageProjectDelivery(user) || hasDeliveryPermission(user, 'sprint.manage');

const stripSidecars = (task: Task) => {
  const { comments, activityLog, ...core } = task;
  return core;
};

const isOnlyCommentChange = (previousTask: Task, nextTask: Task) =>
  JSON.stringify(stripSidecars(previousTask)) === JSON.stringify(stripSidecars(nextTask)) &&
  normalized((previousTask.activityLog || []).map(item => item.id)) === normalized((nextTask.activityLog || []).map(item => item.id)) &&
  (nextTask.comments || []).length >= (previousTask.comments || []).length;

const hasProtectedFieldChange = (previousTask: Task, nextTask: Task) =>
  previousTask.projectId !== nextTask.projectId ||
  previousTask.epicId !== nextTask.epicId ||
  previousTask.sprintId !== nextTask.sprintId ||
  previousTask.orderRank !== nextTask.orderRank ||
  normalized(previousTask.assigneeIds) !== normalized(nextTask.assigneeIds) ||
  normalized(previousTask.dependencyIds) !== normalized(nextTask.dependencyIds);

export const discoveryDispositionReleasesWork = (disposition: StudioDeliveryDiscoveryDisposition | null | undefined) =>
  Boolean(disposition && RELEASED_DISCOVERY_DISPOSITIONS.has(disposition));

export const isLegacyDeliveryStatusTransitionAllowed = (from: TaskStatus, to: TaskStatus) =>
  LEGACY_DELIVERY_STATUS_TRANSITIONS[from].includes(to);

export const getLegacyDeliveryStatusTargets = (from: TaskStatus) =>
  LEGACY_DELIVERY_STATUS_TRANSITIONS[from].filter(status => status !== from);

export const getDependencyViolations = (
  task: Task,
  allTasks: Task[],
  nextStatus: TaskStatus = task.status,
  discoveryDispositions?: DeliveryDiscoveryDispositionByTask,
): DeliveryDependencyViolation[] => {
  if (!ACTIVE_STATUSES.includes(nextStatus)) return [];
  const tasksById = new Map(allTasks.map(candidate => [candidate.id, candidate]));
  const dependencies: DeliveryDependencyViolation[] = (task.dependencyIds || []).map(dependencyId =>
    tasksById.get(dependencyId) ?? {
      id: dependencyId,
      title: 'A referenced prerequisite is unavailable in this view',
      status: 'Blocked',
      sourceLineage: undefined,
    });
  return dependencies.filter(dependency => dependency.status !== 'Done'
    || discoveryDispositions !== undefined
      && dependency.sourceLineage?.proposalRole === 'discovery'
      && !discoveryDispositionReleasesWork(discoveryDispositions.get(dependency.id)));
};

export const getStatusTransitionViolations = (
  task: Task,
  allTasks: Task[],
  nextStatus: TaskStatus,
  discoveryDispositions?: DeliveryDiscoveryDispositionByTask,
) => {
  const violations = getDependencyViolations(task, allTasks, nextStatus, discoveryDispositions);
  if (nextStatus === 'Done' && discoveryDispositions !== undefined
    && task.sourceLineage?.proposalRole === 'discovery'
    && !discoveryDispositionReleasesWork(discoveryDispositions.get(task.id))) {
    return [...violations, task];
  }
  return violations;
};

export const canUpdateDeliveryTask = (user: User | null | undefined, previousTask: Task, nextTask: Task, allTasks: Task[]) => {
  if (!user) return false;
  if (isOnlyCommentChange(previousTask, nextTask)) {
    return hasDeliveryPermission(user, 'comments.manage') ||
      hasDeliveryPermission(user, 'task.update') ||
      isAssignedToTask(user, previousTask) ||
      canManageProjectDelivery(user);
  }

  if (canManageProjectDelivery(user) || hasDeliveryPermission(user, 'task.update')) return true;

  if (hasDeliveryPermission(user, 'task.update.own') && isAssignedToTask(user, previousTask)) {
    return !hasProtectedFieldChange(previousTask, nextTask);
  }

  return false;
};

export const assertCanCreateDeliveryTask = (user: User | null | undefined) => {
  if (!canCreateDeliveryTask(user)) {
    throw new DeliveryPolicyError('You do not have permission to create delivery tasks.');
  }
};

export const assertCanUpdateDeliveryTask = (user: User | null | undefined, previousTask: Task, nextTask: Task, allTasks: Task[]) => {
  if (!canUpdateDeliveryTask(user, previousTask, nextTask, allTasks)) {
    throw new DeliveryPolicyError('You do not have permission to update this task.');
  }

  if (normalized(previousTask.assigneeIds) !== normalized(nextTask.assigneeIds) && !canAssignDeliveryTask(user)) {
    throw new DeliveryPolicyError('Only project managers can change task assignees.');
  }

  if (previousTask.sprintId !== nextTask.sprintId && !canPlanDeliverySprint(user)) {
    throw new DeliveryPolicyError('Only project managers can move tasks between sprints.');
  }

  const statusChanged = previousTask.status !== nextTask.status;
  const dependenciesChanged = normalized(previousTask.dependencyIds) !== normalized(nextTask.dependencyIds);
  const dependencyViolations = statusChanged || dependenciesChanged ? getDependencyViolations(nextTask, allTasks, nextTask.status) : [];
  if (dependencyViolations.length > 0) {
    throw new DeliveryPolicyError(`Complete dependencies first: ${dependencyViolations.map(task => task.title).join(', ')}.`);
  }
};

export const assertCanDeleteDeliveryTask = (user: User | null | undefined, task: Task, allTasks: Task[]) => {
  if (!canDeleteDeliveryTask(user)) {
    throw new DeliveryPolicyError('You do not have permission to delete delivery tasks.');
  }

  const dependentTasks = allTasks.filter(candidate => candidate.dependencyIds?.includes(task.id));
  if (dependentTasks.length > 0) {
    throw new DeliveryPolicyError(`This task is a dependency for: ${dependentTasks.map(item => item.title).join(', ')}.`);
  }
};
