import {
  DeliveryPolicyError,
  assertCanDeleteDeliveryTask,
  assertCanUpdateDeliveryTask,
  canCreateDeliveryTask,
  canDeleteDeliveryTask,
  canEditDeliveryTask,
  getDependencyViolations,
} from './deliveryPolicy';
import { Task, User } from '../types';

console.log('Starting Delivery Policy Regression Suite...');

const makeUser = (id: string, permissions: string[]): User => ({
  id,
  name: id,
  email: `${id}@example.com`,
  permissions,
});

const pm = makeUser('pm-1', ['project.manage', 'task.create', 'task.update', 'task.assign', 'task.delete', 'sprint.manage']);
const ba = makeUser('ba-1', ['project.read', 'task.read', 'comments.manage']);
const developer = makeUser('dev-1', ['project.read', 'task.read', 'task.update.own']);
const executive = makeUser('exec-1', ['portfolio.read', 'reports.read']);

const baseTask: Task = {
  id: 'task-1',
  title: 'Build rules',
  description: 'Implement deterministic routing rules',
  status: 'To Do',
  priority: 'High',
  type: 'Task',
  projectId: 'project-1',
  epicId: 'epic-1',
  assigneeIds: ['dev-1'],
  storyPoints: 3,
  startDate: '2026-04-01',
  dueDate: '2026-04-20',
  comments: [],
  activityLog: [],
};

const dependencyTask: Task = {
  ...baseTask,
  id: 'dependency-1',
  title: 'Approve controls',
  status: 'In Review',
  assigneeIds: ['pm-1'],
};

const dependentTask: Task = {
  ...baseTask,
  id: 'dependent-1',
  title: 'Release workflow',
  dependencyIds: ['dependency-1'],
};

if (!canCreateDeliveryTask(pm) || canCreateDeliveryTask(executive)) {
  throw new Error('Task creation permissions are incorrect.');
}

if (!canEditDeliveryTask(developer, baseTask) || canEditDeliveryTask(executive, baseTask)) {
  throw new Error('Task edit permissions are incorrect.');
}

assertCanUpdateDeliveryTask(developer, baseTask, { ...baseTask, status: 'In Progress' }, [baseTask]);

try {
  assertCanUpdateDeliveryTask(developer, baseTask, { ...baseTask, assigneeIds: ['dev-1', 'ba-1'] }, [baseTask]);
  throw new Error('Developer assignment change was incorrectly allowed.');
} catch (error) {
  if (!(error instanceof DeliveryPolicyError)) throw error;
}

try {
  assertCanUpdateDeliveryTask(developer, baseTask, { ...baseTask, orderRank: 1000 }, [baseTask]);
  throw new Error('Developer backlog reorder was incorrectly allowed.');
} catch (error) {
  if (!(error instanceof DeliveryPolicyError)) throw error;
}

assertCanUpdateDeliveryTask(ba, baseTask, {
  ...baseTask,
  comments: [{ id: 'comment-1', userId: 'ba-1', content: 'Please clarify acceptance criteria.', createdAt: '2026-04-29T00:00:00.000Z' }],
}, [baseTask]);

const blockedDependencies = getDependencyViolations(dependentTask, [dependencyTask, dependentTask], 'In Progress');
if (blockedDependencies.length !== 1 || blockedDependencies[0].id !== dependencyTask.id) {
  throw new Error('Dependency gate did not identify unfinished predecessor task.');
}

try {
  assertCanUpdateDeliveryTask(pm, dependentTask, { ...dependentTask, status: 'In Progress' }, [dependencyTask, dependentTask]);
  throw new Error('Dependency-gated status move was incorrectly allowed.');
} catch (error) {
  if (!(error instanceof DeliveryPolicyError)) throw error;
}

if (!canDeleteDeliveryTask(pm) || canDeleteDeliveryTask(ba)) {
  throw new Error('Delete permissions are incorrect.');
}

try {
  assertCanDeleteDeliveryTask(pm, dependencyTask, [dependencyTask, dependentTask]);
  throw new Error('Dependency delete guard was incorrectly bypassed.');
} catch (error) {
  if (!(error instanceof DeliveryPolicyError)) throw error;
}

console.log('Delivery Policy Regression Suite passed.');
