import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Project, Task, Epic, Sprint, User, TaskStatus, ProjectLifecycleStage, TimesheetEntry, ApprovalStatus, WorkItem, TaskType, ActivityLogItem } from '../../types';
import { useOrganizationContext } from '../auth/OrganizationProvider';
import { deliveryAdapter, LegacyDeliveryPendingReconciledError } from '../../services/adapters/deliveryAdapter';
import { useAuth } from '../auth/AuthProvider';
import { getRuntimeDataAccess } from '../../services/supabaseClient';
import { assertCanCreateDeliveryTask, assertCanUpdateDeliveryTask, canDeleteDeliveryTask, canManageProjectDelivery, DeliveryPolicyError, hasDeliveryPermission } from '../../services/deliveryPolicy';
import {
  assertProjectLifecycleMutationAllowed,
  assertSprintMutationAllowed,
  applyTaskDeletionPersistenceState,
  assertTaskMutationAllowed,
  assertTaskReorderAllowed,
  assertTaskSprintAssignmentAllowed,
  buildTaskDeletionPersistenceActivity,
  buildTaskMutationAuditActivity,
  resolveTaskDeletionPersistenceGuard,
} from '../../services/deliveryWorkflowPolicy';

interface DeliveryContextType {
  projects: Project[];
  tasks: Task[];
  epics: Epic[];
  sprints: Sprint[];
  loading: boolean;
  error: string | null;
  addTask: (task: Partial<Task>) => Promise<Task | undefined>;
  addTasks: (tasks: Task[]) => Promise<Task[]>;
  addEpics: (epics: Epic[]) => Promise<Epic[]>;
  importGeneratedWorkItems: (input: {
    projectId: string;
    sourceGenerationId: string;
    displayedItems: WorkItem[];
    selectedItems: WorkItem[];
  }) => Promise<{ epicCount: number; taskCount: number }>;
  updateProject: (project: Project) => Promise<void>;
  updateSprint: (sprint: Sprint) => Promise<void>;
  updateTask: (task: Task) => Promise<void>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  updateTaskSprint: (taskId: string, sprintId: string | null) => Promise<void>;
  reorderTask: (taskIdToMove: string, referenceTaskId: string | null, newEpicId: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const DeliveryContext = createContext<DeliveryContextType | undefined>(undefined);

const formatValue = (value: unknown) => {
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None';
  if (value === undefined || value === null || value === '') return 'None';
  return String(value);
};

const buildTaskActivity = (previousTask: Task | undefined, nextTask: Task, actorId: string): ActivityLogItem[] => {
  const createdAt = new Date().toISOString();
  const events: ActivityLogItem[] = [];
  const addEvent = (change: string, previousValue?: unknown, newValue?: unknown) => {
    events.push({
      id: `act-${Date.now()}-${events.length}`,
      userId: actorId,
      change,
      previousValue: previousValue !== undefined ? formatValue(previousValue) : undefined,
      newValue: newValue !== undefined ? formatValue(newValue) : undefined,
      createdAt,
    });
  };

  if (!previousTask) {
    addEvent('created this task');
    return events;
  }

  const fieldChecks: Array<{ key: keyof Task; label: string }> = [
    { key: 'title', label: 'updated the title' },
    { key: 'description', label: 'updated the description' },
    { key: 'status', label: 'changed the status' },
    { key: 'priority', label: 'changed the priority' },
    { key: 'dueDate', label: 'changed the due date' },
    { key: 'storyPoints', label: 'changed the story points' },
    { key: 'epicId', label: 'changed the epic' },
    { key: 'sprintId', label: 'changed the sprint' },
    { key: 'orderRank', label: 'changed backlog order' },
  ];

  fieldChecks.forEach(({ key, label }) => {
    if (previousTask[key] !== nextTask[key]) {
      addEvent(label, previousTask[key], nextTask[key]);
    }
  });

  const previousAssignees = [...(previousTask.assigneeIds || [])].sort().join('|');
  const nextAssignees = [...(nextTask.assigneeIds || [])].sort().join('|');
  if (previousAssignees !== nextAssignees) {
    addEvent('changed the assignees', previousTask.assigneeIds, nextTask.assigneeIds);
  }

  const previousCommentIds = new Set((previousTask.comments || []).map(comment => comment.id));
  const addedComments = (nextTask.comments || []).filter(comment => !previousCommentIds.has(comment.id));
  if (addedComments.length > 0) {
    addEvent(addedComments.length === 1 ? 'commented on this task' : `added ${addedComments.length} comments`);
  }

  return events;
};

const epicBucketId = (task: Pick<Task, 'epicId'>) => task.epicId || 'unassigned';

const sortTasksForDisplay = (taskList: Task[]) =>
  taskList
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      if (a.task.projectId !== b.task.projectId) {
        return a.task.projectId.localeCompare(b.task.projectId);
      }
      if (epicBucketId(a.task) !== epicBucketId(b.task)) {
        return epicBucketId(a.task).localeCompare(epicBucketId(b.task));
      }
      const rankA = Number.isFinite(a.task.orderRank) ? a.task.orderRank! : Number.MAX_SAFE_INTEGER;
      const rankB = Number.isFinite(b.task.orderRank) ? b.task.orderRank! : Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      return a.index - b.index;
    })
    .map(({ task }) => task);

export const DeliveryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentOrganization, tenantContext } = useOrganizationContext();
  const { user } = useAuth();
  let runtimeDataAccess: ReturnType<typeof getRuntimeDataAccess> | null = null;
  try { runtimeDataAccess = getRuntimeDataAccess(); }
  catch { /* A blocked runtime must still render the public/sign-in boundary with no Delivery data. */ }
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(runtimeDataAccess === 'server');
  const [error, setError] = useState<string | null>(null);
  const [loadedAuthorityKey, setLoadedAuthorityKey] = useState<string | null>(null);
  const fetchSequence = useRef(0);
  const authorityKey = tenantContext
    ? `${tenantContext.userId}:${tenantContext.organizationId}:${tenantContext.workspaceId}:${tenantContext.authorizationVersion}`
    : 'no-server-authority';
  const activeAuthorityKey = useRef(authorityKey);
  activeAuthorityKey.current = authorityKey;

  const requireCurrentAuthority = (startedWith: string) => {
    if (activeAuthorityKey.current !== startedWith) {
      throw new DeliveryPolicyError('The Delivery workspace changed while the request was running. Refresh the current workspace before retrying.');
    }
  };

  const fetchAllData = async () => {
    if (!currentOrganization || runtimeDataAccess === null) {
      fetchSequence.current += 1;
      setProjects([]);
      setTasks([]);
      setEpics([]);
      setSprints([]);
      setLoadedAuthorityKey(null);
      // Keep project navigation waiting while a server session is being established.
      setLoading(runtimeDataAccess === 'server');
      setError(null);
      return;
    }
    const requestSequence = ++fetchSequence.current;
    const requestAuthorityKey = authorityKey;
    setLoading(true);
    setError(null);
    try {
      if (getRuntimeDataAccess() === 'server') {
        setLoadedAuthorityKey(null);
        setProjects([]);
        setTasks([]);
        setEpics([]);
        setSprints([]);
        if (!tenantContext) {
          setError('A current server workspace is required before Delivery data can be loaded.');
          return;
        }
        const workspace = await deliveryAdapter.getAuthoritativeWorkspace(tenantContext);
        if (fetchSequence.current !== requestSequence || activeAuthorityKey.current !== requestAuthorityKey) return;
        setProjects(workspace.projects);
        setTasks(sortTasksForDisplay(workspace.tasks));
        setEpics(workspace.epics);
        setSprints([]);
        setLoadedAuthorityKey(requestAuthorityKey);
        return;
      }
      const [projData, taskData, epicData, sprintData] = await Promise.all([
        deliveryAdapter.getProjects(currentOrganization.id),
        deliveryAdapter.getTasks(currentOrganization.id),
        deliveryAdapter.getEpics(currentOrganization.id),
        deliveryAdapter.getSprints(currentOrganization.id)
      ]);
      if (fetchSequence.current !== requestSequence) return;
      setProjects(projData);
      setTasks(sortTasksForDisplay(taskData));
      setEpics(epicData);
      setSprints(sprintData);
      setLoadedAuthorityKey('local');
    } catch (err) {
      console.error('Failed to fetch delivery data:', err);
      if (fetchSequence.current === requestSequence && activeAuthorityKey.current === requestAuthorityKey) {
        setProjects([]);
        setTasks([]);
        setEpics([]);
        setSprints([]);
        setLoadedAuthorityKey(null);
        setError(err instanceof Error ? err.message : 'Delivery data could not be loaded.');
      }
    } finally {
      if (fetchSequence.current === requestSequence) setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [currentOrganization, authorityKey, runtimeDataAccess]);

  const addTask = async (task: Partial<Task>) => {
    if (!currentOrganization || !user) return;
    if (getRuntimeDataAccess() === 'server') {
      if (!tenantContext) throw new DeliveryPolicyError('A current server workspace is required before creating Delivery work.');
      const requestAuthorityKey = authorityKey;
      let saved: Task;
      try { saved = await deliveryAdapter.createAuthoritativeTask(tenantContext, task); }
      catch (error) {
        if (error instanceof LegacyDeliveryPendingReconciledError) await fetchAllData();
        throw error;
      }
      requireCurrentAuthority(requestAuthorityKey);
      setTasks(prev => sortTasksForDisplay([...prev, saved]));
      return saved;
    }
    assertCanCreateDeliveryTask(user);
    const newTask = {
      ...task,
      status: task.status || 'To Do',
    };
    const activityLog = buildTaskActivity(undefined, newTask as Task, user.id);
    const saved = await deliveryAdapter.saveTask({ ...newTask, activityLog }, currentOrganization.id, user.id);
    setTasks(prev => sortTasksForDisplay([...prev, saved]));
    return saved;
  };

  const addTasks = async (newTasks: Task[]) => {
    if (!currentOrganization || !user) return [];
    if (getRuntimeDataAccess() === 'server') {
      throw new DeliveryPolicyError('Bulk task creation is read only in the connected Delivery workspace. Use the governed document import command.');
    }
    newTasks.forEach(() => assertCanCreateDeliveryTask(user));
    const savedTasks: Task[] = await Promise.all(
      newTasks.map(task => {
        const activityLog = buildTaskActivity(undefined, task, user.id);
        return deliveryAdapter.saveTask({ ...task, activityLog: [...(task.activityLog || []), ...activityLog] }, currentOrganization.id, user.id);
      })
    );
    setTasks(prev => {
      const byId = new Map<string, Task>(prev.map(task => [task.id, task]));
      savedTasks.forEach(task => byId.set(task.id, task));
      return sortTasksForDisplay(Array.from(byId.values()));
    });
    return savedTasks;
  };

  const addEpics = async (newEpics: Epic[]) => {
    if (!currentOrganization || !user) return [];
    if (getRuntimeDataAccess() === 'server') {
      throw new DeliveryPolicyError('Epic creation is read only in the connected Delivery workspace. Source grouping is projected from the governed import.');
    }
    newEpics.forEach(() => assertCanCreateDeliveryTask(user));
    const savedEpics = await Promise.all(
      newEpics.map(epic => deliveryAdapter.saveEpic(epic, currentOrganization.id))
    );
    setEpics(prev => {
      const byId = new Map(prev.map(epic => [epic.id, epic]));
      savedEpics.forEach(epic => byId.set(epic.id, epic));
      return Array.from(byId.values());
    });
    return savedEpics;
  };

  const updateProject = async (project: Project) => {
    if (!currentOrganization || !user) return;
    if (getRuntimeDataAccess() === 'server') {
      throw new DeliveryPolicyError('Project lifecycle editing remains read only in the connected Delivery workspace.');
    }
    if (!canManageProjectDelivery(user)) {
      throw new DeliveryPolicyError('Only project managers or admins can update project lifecycle and health.');
    }
    const previousProject = projects.find(item => item.id === project.id);
    assertProjectLifecycleMutationAllowed({
      actor: user,
      organizationId: currentOrganization.id,
      previousProject,
      nextProject: project,
    });
    const saved = await deliveryAdapter.saveProject(project, currentOrganization.id);
    setProjects(prev => prev.map(item => item.id === project.id ? saved : item));
  };

  const updateSprint = async (sprint: Sprint) => {
    if (!currentOrganization || !user) return;
    if (getRuntimeDataAccess() === 'server') {
      throw new DeliveryPolicyError('Sprint editing remains read only in the connected Delivery workspace.');
    }
    if (!canManageProjectDelivery(user) && !hasDeliveryPermission(user, 'sprint.manage')) {
      throw new DeliveryPolicyError('Only project managers can update sprint planning.');
    }
    const previousSprint = sprints.find(item => item.id === sprint.id);
    assertSprintMutationAllowed({
      actor: user,
      organizationId: currentOrganization.id,
      previousSprint,
      nextSprint: sprint,
      allSprints: sprints,
    });
    const saved = await deliveryAdapter.saveSprint(sprint, currentOrganization.id);
    setSprints(prev => prev.map(item => item.id === sprint.id ? saved : item));
  };

  const updateTask = async (task: Task) => {
    if (!currentOrganization || !user) return;
    const existingTask = tasks.find(t => t.id === task.id);
    if (!existingTask) return;
    if (getRuntimeDataAccess() === 'server') {
      if (!tenantContext) throw new DeliveryPolicyError('A current server workspace is required before updating Delivery work.');
      const requestAuthorityKey = authorityKey;
      let saved: Task;
      try { saved = await deliveryAdapter.updateAuthoritativeTask(tenantContext, existingTask, task); }
      catch (error) {
        if (error instanceof LegacyDeliveryPendingReconciledError) await fetchAllData();
        throw error;
      }
      requireCurrentAuthority(requestAuthorityKey);
      setTasks(prev => sortTasksForDisplay(prev.map(item => item.id === saved.id ? saved : item)));
      return;
    }
    const workflowDecision = assertTaskMutationAllowed({
      actor: user,
      organizationId: currentOrganization.id,
      previousTask: existingTask,
      nextTask: task,
      allTasks: tasks,
    });
    assertCanUpdateDeliveryTask(user, existingTask, task, tasks);
    const activityLog = [
      ...(task.activityLog || existingTask?.activityLog || []),
      ...buildTaskActivity(existingTask, task, user.id),
      buildTaskMutationAuditActivity({
        actor: user,
        organizationId: currentOrganization.id,
        previousTask: existingTask,
        nextTask: task,
        decision: workflowDecision,
      }),
    ];
    const saved = await deliveryAdapter.saveTask({ ...task, activityLog }, currentOrganization.id, user.id);
    setTasks(prev => sortTasksForDisplay(prev.map(t => t.id === task.id ? saved : t)));
  };

  const updateTaskStatus = async (taskId: string, status: TaskStatus) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      await updateTask({ ...task, status });
    }
  };

  const updateTaskSprint = async (taskId: string, sprintId: string | null) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      assertTaskSprintAssignmentAllowed({
        actor: user,
        organizationId: currentOrganization?.id,
        task,
        projectId: task.projectId,
      });
      await updateTask({ ...task, sprintId: sprintId || undefined });
    }
  };

  const reorderTask = async (taskIdToMove: string, referenceTaskId: string | null, newEpicId: string) => {
    if (!currentOrganization || !user) return;
    if (getRuntimeDataAccess() === 'server') {
      throw new DeliveryPolicyError('Backlog reordering remains read only in the connected Delivery workspace.');
    }
    if (!canManageProjectDelivery(user) && !hasDeliveryPermission(user, 'backlog.manage')) {
      throw new DeliveryPolicyError('Only project managers or backlog managers can reorder backlog items.');
    }

    const taskToMove = tasks.find(t => t.id === taskIdToMove);
    if (!taskToMove) return;
    const reorderDecision = assertTaskReorderAllowed({
      actor: user,
      organizationId: currentOrganization.id,
      task: taskToMove,
      projectId: taskToMove.projectId,
    });

    const targetEpicId = newEpicId !== 'unassigned' ? newEpicId : undefined;
    const targetBucketId = targetEpicId || 'unassigned';
    const orderedBucket = sortTasksForDisplay(tasks).filter(task =>
      task.projectId === taskToMove.projectId &&
      !task.parentId &&
      task.id !== taskIdToMove &&
      epicBucketId(task) === targetBucketId
    );
    const insertIndex = referenceTaskId ? orderedBucket.findIndex(task => task.id === referenceTaskId) : orderedBucket.length;
    const normalizedInsertIndex = insertIndex < 0 ? orderedBucket.length : insertIndex;
    const movedTask: Task = { ...taskToMove, epicId: targetEpicId };
    orderedBucket.splice(normalizedInsertIndex, 0, movedTask);

    const rankedTasks = orderedBucket.map((task, index) => ({ ...task, orderRank: (index + 1) * 1000 }));
    const changedTasks = rankedTasks.filter(nextTask => {
      const previousTask = tasks.find(task => task.id === nextTask.id);
      return previousTask && (previousTask.epicId !== nextTask.epicId || previousTask.orderRank !== nextTask.orderRank);
    });
    if (changedTasks.length === 0) return;

    const savedTasks: Task[] = await Promise.all(
      changedTasks.map(nextTask => {
        const previousTask = tasks.find(task => task.id === nextTask.id);
        const activityLog = nextTask.id === taskToMove.id
          ? [
              ...(nextTask.activityLog || previousTask?.activityLog || []),
              ...buildTaskActivity(previousTask, nextTask, user.id),
              buildTaskMutationAuditActivity({
                actor: user,
                organizationId: currentOrganization.id,
                previousTask,
                nextTask,
                decision: reorderDecision,
                operation: 'reorder',
              }),
            ]
          : nextTask.activityLog;
        return deliveryAdapter.saveTask({ ...nextTask, activityLog }, currentOrganization.id, user.id);
      })
    );

    setTasks(prev => {
      const byId = new Map<string, Task>(prev.map(task => [task.id, task]));
      savedTasks.forEach(task => byId.set(task.id, task));
      return sortTasksForDisplay(Array.from(byId.values()));
    });
  };

  const deleteTask = async (taskId: string) => {
    if (!currentOrganization || !user) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      throw new DeliveryPolicyError('Open a delivery work item before deleting it.');
    }
    if (getRuntimeDataAccess() === 'server') {
      if (!tenantContext) throw new DeliveryPolicyError('A current server workspace is required before deleting Delivery work.');
      const requestAuthorityKey = authorityKey;
      let saved: Task;
      try { saved = await deliveryAdapter.deleteAuthoritativeTask(tenantContext, task); }
      catch (error) {
        if (error instanceof LegacyDeliveryPendingReconciledError) await fetchAllData();
        throw error;
      }
      requireCurrentAuthority(requestAuthorityKey);
      setTasks(prev => sortTasksForDisplay(prev.map(item => item.id === saved.id ? saved : item)));
      return;
    }
    if (!canDeleteDeliveryTask(user)) {
      throw new DeliveryPolicyError('You do not have permission to delete delivery tasks.');
    }

    const deletionDecision = resolveTaskDeletionPersistenceGuard({
      actor: user,
      organizationId: currentOrganization.id,
      task,
      allTasks: tasks,
    });
    if (!deletionDecision.allowed) {
      throw new DeliveryPolicyError(deletionDecision.message);
    }

    const occurredAt = new Date().toISOString();
    const nextTask = applyTaskDeletionPersistenceState({
      task,
      actor: user,
      decision: deletionDecision,
      occurredAt,
    });
    const activityLog = [
      ...(task.activityLog || []),
      buildTaskDeletionPersistenceActivity({
        actor: user,
        organizationId: currentOrganization.id,
        previousTask: task,
        nextTask,
        decision: deletionDecision,
        occurredAt,
      }),
    ];

    const saved = await deliveryAdapter.saveTask({ ...nextTask, activityLog }, currentOrganization.id, user.id);
    setTasks(prev => sortTasksForDisplay(prev.map(t => t.id === taskId ? saved : t)));
  };

  const importGeneratedWorkItems = async (input: {
    projectId: string;
    sourceGenerationId: string;
    displayedItems: WorkItem[];
    selectedItems: WorkItem[];
  }) => {
    if (!currentOrganization || !user) throw new DeliveryPolicyError('Sign in before importing Delivery work.');
    if (getRuntimeDataAccess() !== 'server') {
      throw new DeliveryPolicyError('The governed import command is available only in a connected server workspace.');
    }
    if (!tenantContext) throw new DeliveryPolicyError('A current server workspace is required before importing Delivery work.');
    const requestAuthorityKey = authorityKey;
    let committed: { epicCount: number; taskCount: number };
    try { committed = await deliveryAdapter.importAuthoritativeWorkItems(tenantContext, input); }
    catch (error) {
      if (error instanceof LegacyDeliveryPendingReconciledError) await fetchAllData();
      throw error;
    }
    requireCurrentAuthority(requestAuthorityKey);
    await fetchAllData();
    requireCurrentAuthority(requestAuthorityKey);
    return committed;
  };

  return (
    <DeliveryContext.Provider value={{ 
      projects: runtimeDataAccess === 'local' || (runtimeDataAccess === 'server' && loadedAuthorityKey === authorityKey) ? projects : [],
      tasks: runtimeDataAccess === 'local' || (runtimeDataAccess === 'server' && loadedAuthorityKey === authorityKey) ? tasks : [],
      epics: runtimeDataAccess === 'local' || (runtimeDataAccess === 'server' && loadedAuthorityKey === authorityKey) ? epics : [],
      sprints: runtimeDataAccess === 'local' || (runtimeDataAccess === 'server' && loadedAuthorityKey === authorityKey) ? sprints : [],
      loading, error,
      addTask, addTasks, addEpics, importGeneratedWorkItems, updateProject, updateSprint, updateTask, updateTaskStatus, updateTaskSprint, reorderTask, deleteTask, refresh: fetchAllData
    }}>
      {children}
    </DeliveryContext.Provider>
  );
};

export const useDelivery = () => {
  const context = useContext(DeliveryContext);
  if (!context) throw new Error('useDelivery must be used within DeliveryProvider');
  return context;
};
