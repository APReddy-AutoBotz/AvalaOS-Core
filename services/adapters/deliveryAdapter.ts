import { getRuntimeDataAccess, supabase } from '../supabaseClient';
import { Project, Task, Epic, Sprint, Comment, ActivityLogItem, TenantContextProjection, WorkItem } from '../../types';
import { MOCK_PROJECTS, MOCK_TASKS, MOCK_EPICS, MOCK_SPRINTS } from '../../data/mockData';
import { toSupabaseDemoUserId } from '../demoIdentity';
import {
  buildLegacyDeliveryCommand,
  executeLegacyDeliveryEnvelope,
  getLegacyDeliveryPendingKey,
  getPendingLegacyDeliveryCommand,
  queryLegacyDelivery,
  retryPendingLegacyDeliveryCommand,
} from '../legacyDelivery/client';
import type {
  LegacyDeliveryAction,
  LegacyDeliveryCommandSuccess,
  LegacyDeliveryPayloadByAction,
  LegacyDeliverySourceItem,
  LegacyDeliveryTaskPatch,
  LegacyDeliveryTaskProjection,
} from '../legacyDelivery/contracts';

const isUuid = (value?: string) => Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
const relationAppId = (relation: any) => {
  const row = Array.isArray(relation) ? relation[0] : relation;
  return row?.app_id;
};
const normalizeUserId = (userId?: string) => {
  const mapped = toSupabaseDemoUserId(userId);
  if (mapped) return mapped;
  return isUuid(userId) ? userId! : null;
};

const fromCommentRow = (row: any): Comment => ({
  id: row.app_id || row.id,
  userId: row.user_id || '',
  content: row.content || '',
  createdAt: row.created_at || new Date().toISOString(),
});

const fromActivityRow = (row: any): ActivityLogItem => ({
  id: row.app_id || row.id,
  userId: row.user_id || '',
  change: row.change || '',
  previousValue: row.previous_value || undefined,
  newValue: row.new_value || undefined,
  createdAt: row.created_at || new Date().toISOString(),
});

const fromProjectRow = (row: any): Project => ({
  id: row.app_id || row.id,
  name: row.name,
  description: row.description || '',
  ownerId: row.owner_id || '',
  lifecycleStage: row.lifecycle_stage || 'Planning',
  healthStatus: row.health_status || 'On Track',
});

const fromAuthoritativeProjectRow = (row: any): Project => ({
  ...fromProjectRow(row),
  id: row.id,
});

const fromEpicRow = (row: any): Epic => ({
  id: row.app_id || row.id,
  name: row.name,
  projectId: relationAppId(row.projects) || row.project_app_id || row.project_id,
  color: row.color || '#2563EB',
});

const fromSprintRow = (row: any): Sprint => ({
  id: row.app_id || row.id,
  name: row.name,
  projectId: relationAppId(row.projects) || row.project_app_id || row.project_id,
  startDate: row.start_date || '',
  endDate: row.end_date || '',
  status: row.status || 'Upcoming',
  goal: row.goal || undefined,
  capacity: row.capacity || undefined,
});

const fromTaskRow = (row: any): Task => ({
  id: row.app_id || row.id,
  title: row.title,
  description: row.description || '',
  status: row.status || 'To Do',
  priority: row.priority || 'Medium',
  type: row.type || 'Task',
  projectId: relationAppId(row.projects) || row.project_app_id || row.project_id,
  epicId: relationAppId(row.epics) || row.epic_app_id || row.epic_id || undefined,
  sprintId: relationAppId(row.sprints) || row.sprint_app_id || row.sprint_id || undefined,
  assigneeIds: row.metadata?.assigneeIds || [],
  reporterId: row.metadata?.reporterId,
  storyPoints: row.story_points || undefined,
  startDate: row.start_date || '',
  dueDate: row.due_date || '',
  parentId: row.metadata?.parentId || row.parent_id || undefined,
  subtaskIds: row.metadata?.subtaskIds,
  dependencyIds: row.metadata?.dependencyIds,
  orderRank: row.metadata?.orderRank ?? row.metadata?.backlogOrder,
  comments: (row.task_comments || []).map(fromCommentRow).sort((a: Comment, b: Comment) => a.createdAt.localeCompare(b.createdAt)) || row.metadata?.comments,
  userStories: row.metadata?.userStories,
  activityLog: (row.task_activity_events || []).map(fromActivityRow).sort((a: ActivityLogItem, b: ActivityLogItem) => a.createdAt.localeCompare(b.createdAt)) || row.metadata?.activityLog,
  sourceLineage: row.metadata?.sourceLineage,
  deletionState: row.metadata?.deletionState,
  deletionMode: row.metadata?.deletionMode,
  deletionRequestedAt: row.metadata?.deletionRequestedAt,
  deletionRequestedBy: row.metadata?.deletionRequestedBy,
  deletedAt: row.metadata?.deletedAt,
  deletedBy: row.metadata?.deletedBy,
  deletionReason: row.metadata?.deletionReason,
  retentionReason: row.metadata?.retentionReason,
  retentionClass: row.metadata?.retentionClass,
  restoreEligible: row.metadata?.restoreEligible,
});

export class LegacyDeliveryProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegacyDeliveryProjectionError';
  }
}

export class LegacyDeliveryPendingReconciledError extends LegacyDeliveryProjectionError {
  readonly pendingReconciled = true;

  constructor() {
    super('A previous Delivery command was reconciled first. The workspace has been refreshed; review the committed result before submitting another change.');
    this.name = 'LegacyDeliveryPendingReconciledError';
  }
}

const legacyScope = (context: TenantContextProjection) => ({
  actorId: context.userId,
  organizationId: context.organizationId,
  workspaceId: context.workspaceId,
  authorizationVersion: context.authorizationVersion,
});

const executeAuthoritativeCommand = async <A extends LegacyDeliveryAction>(
  context: TenantContextProjection,
  action: A,
  payload: LegacyDeliveryPayloadByAction[A],
): Promise<LegacyDeliveryCommandSuccess<A>> => {
  const scope = legacyScope(context);
  const proposed = buildLegacyDeliveryCommand(scope, action, payload);
  const pendingKey = getLegacyDeliveryPendingKey(scope, proposed);
  const pending = getPendingLegacyDeliveryCommand(scope, pendingKey);
  if (!pending) return executeLegacyDeliveryEnvelope(scope, proposed);
  const sameIntent = pending.action === proposed.action
    && JSON.stringify(pending.payload) === JSON.stringify(proposed.payload);
  const reconciled = await retryPendingLegacyDeliveryCommand(scope, pendingKey);
  if (!sameIntent) throw new LegacyDeliveryPendingReconciledError();
  return reconciled as LegacyDeliveryCommandSuccess<A>;
};

const lineageGenerationId = (task: LegacyDeliveryTaskProjection) => {
  const value = task.sourceLineage?.documentGenerationId;
  return typeof value === 'string' ? value : null;
};

const authoritativeEpicId = (task: LegacyDeliveryTaskProjection) => {
  if (task.sourceEpicIndex === null) return undefined;
  return `legacy-source-epic:${lineageGenerationId(task) || task.projectId}:${task.sourceEpicIndex}`;
};

export const mapLegacyDeliveryTask = (projection: LegacyDeliveryTaskProjection): Task => ({
  id: projection.id,
  version: projection.version ?? undefined,
  readOnlyHistorical: !projection.mutable,
  title: projection.title,
  description: projection.description,
  status: projection.status,
  priority: projection.priority,
  type: projection.type,
  projectId: projection.projectId,
  epicId: authoritativeEpicId(projection),
  assigneeIds: projection.assigneeIds,
  ownerId: projection.ownerId ?? undefined,
  reporterId: projection.reporterId ?? undefined,
  startDate: '',
  dueDate: '',
  dependencyIds: projection.dependencyIds,
  sourceLineage: projection.sourceLineage as Task['sourceLineage'],
  deletionState: projection.retentionState === 'active' ? 'active' : projection.retentionState,
  deletionMode: projection.retentionState === 'active' ? undefined : projection.retentionState === 'retained' ? 'retained_lineage' : 'soft_delete',
  deletionRequestedAt: projection.deletionRequestedAt ?? undefined,
  deletionRequestedBy: projection.deletionRequestedBy ?? undefined,
  retentionReason: projection.retentionReason ?? undefined,
  retentionClass: projection.retentionClass,
  restoreEligible: false,
});

const mapAuthoritativeEpics = (items: LegacyDeliveryTaskProjection[]): Epic[] => {
  const byId = new Map<string, Epic>();
  for (const task of items) {
    const id = authoritativeEpicId(task);
    if (!id || task.sourceEpicIndex === null || !task.sourceEpicTitle) continue;
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name: task.sourceEpicTitle,
        projectId: task.projectId,
        color: ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'][task.sourceEpicIndex % 6],
      });
    }
  }
  return [...byId.values()];
};

const sameSourceItem = (displayed: WorkItem, source: LegacyDeliverySourceItem) =>
  displayed.type === source.type
  && displayed.title === source.title
  && displayed.description === source.description
  && displayed.acceptanceCriteria.length === source.acceptanceCriteria.length
  && displayed.acceptanceCriteria.every((criterion, index) => criterion === source.acceptanceCriteria[index]);

/**
 * Resolves the modal's selection against the current server source projection.
 * The browser never supplies titles or lineage to the write command.
 */
export const resolveLegacyDeliveryImportSelection = (
  displayedItems: WorkItem[],
  selectedItems: WorkItem[],
  sourceItems: LegacyDeliverySourceItem[],
) => {
  if (displayedItems.length !== sourceItems.length
    || displayedItems.some((item, index) => !sameSourceItem(item, sourceItems[index]))) {
    throw new LegacyDeliveryProjectionError('The generated document changed after it was opened. Refresh it before importing Delivery work.');
  }
  const indices = selectedItems.map(selected => {
    const byIdentity = displayedItems.findIndex(item => item === selected);
    if (byIdentity >= 0) return byIdentity;
    const matches = displayedItems.flatMap((item, index) => sameSourceItem(selected, { ...sourceItems[index], sourceIndex: index }) ? [index] : []);
    if (matches.length !== 1) {
      throw new LegacyDeliveryProjectionError('The selected work items could not be matched to the governed document. Reopen the import dialog and try again.');
    }
    return matches[0];
  });
  const unique = [...new Set(indices)].sort((left, right) => left - right);
  if (unique.length !== selectedItems.length || unique.length === 0) {
    throw new LegacyDeliveryProjectionError('Select at least one distinct governed work item to import.');
  }
  if (!unique.some(index => sourceItems[index].type !== 'Epic')) {
    throw new LegacyDeliveryProjectionError('Select at least one Story or Task with the source epic grouping.');
  }
  return unique.map(index => sourceItems[index].sourceIndex);
};

const queryAllAuthoritativeTasks = async (context: TenantContextProjection, projectId: string) => {
  const items: LegacyDeliveryTaskProjection[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const result = await queryLegacyDelivery(legacyScope(context), { projectId, limit: 100, cursor, includeRetained: true });
    items.push(...result.items);
    cursor = result.page.nextCursor;
    if (cursor && seen.has(cursor)) throw new LegacyDeliveryProjectionError('Delivery returned an invalid paging cursor. Refresh the workspace before retrying.');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return items;
};

const taskUpdatePatch = (previous: Task, next: Task): LegacyDeliveryTaskPatch => {
  const patch: LegacyDeliveryTaskPatch = {};
  if (previous.title !== next.title) patch.title = next.title;
  if (previous.description !== next.description) patch.description = next.description;
  if (previous.priority !== next.priority) patch.priority = next.priority;
  if (previous.status !== next.status) patch.status = next.status;
  if (JSON.stringify(previous.assigneeIds) !== JSON.stringify(next.assigneeIds)) patch.assigneeIds = next.assigneeIds;
  if (JSON.stringify(previous.dependencyIds || []) !== JSON.stringify(next.dependencyIds || [])) patch.dependencyIds = next.dependencyIds || [];
  return patch;
};

const changed = (left: unknown, right: unknown) => JSON.stringify(left ?? null) !== JSON.stringify(right ?? null);
const unsupportedUpdateFields: Array<keyof Task> = [
  'type', 'projectId', 'epicId', 'sprintId', 'storyPoints', 'startDate', 'dueDate', 'parentId', 'subtaskIds',
  'reporterId', 'ownerId', 'orderRank', 'comments', 'userStories', 'activityLog', 'sourceLineage',
];
export const assertLegacyDeliveryCreateProjectionSupported = (task: Partial<Task>) => {
  const unsupported = [
    task.status && task.status !== 'To Do' ? 'status' : null,
    task.epicId ? 'epic' : null,
    task.sprintId ? 'sprint' : null,
    task.storyPoints !== undefined ? 'story points' : null,
    task.startDate ? 'start date' : null,
    task.dueDate ? 'due date' : null,
    task.parentId ? 'parent task' : null,
    task.reporterId ? 'reporter' : null,
    task.ownerId ? 'owner' : null,
    task.orderRank !== undefined ? 'backlog rank' : null,
  ].filter(Boolean);
  if (unsupported.length) {
    throw new LegacyDeliveryProjectionError(`Connected Delivery task creation does not yet govern ${unsupported.join(', ')}. Create the task without those read-only planning fields.`);
  }
};
export const assertLegacyDeliveryUpdateProjectionSupported = (previous: Task, next: Task) => {
  const unsupported = unsupportedUpdateFields.filter(field => changed(previous[field], next[field]));
  if (unsupported.length) {
    throw new LegacyDeliveryProjectionError(`Connected Delivery keeps these fields read only until server authority is available: ${unsupported.join(', ')}.`);
  }
};

async function getEntityUuid(table: string, orgId: string, appId?: string) {
  if (!appId) return null;
  if (isUuid(appId)) return appId;
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('org_id', orgId)
    .eq('app_id', appId)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

async function syncTaskComments(orgId: string, taskId: string, comments?: Comment[]) {
  if (!comments?.length) return;
  const rows = comments
    .filter(comment => comment.content?.trim())
    .map(comment => ({
      org_id: orgId,
      task_id: taskId,
      app_id: comment.id,
      user_id: normalizeUserId(comment.userId),
      content: comment.content,
      created_at: comment.createdAt,
    }));
  if (!rows.length) return;
  const { error } = await supabase
    .from('task_comments')
    .upsert(rows, { onConflict: 'task_id,app_id' });
  if (error) throw error;
}

async function syncTaskActivity(orgId: string, taskId: string, activityLog?: ActivityLogItem[]) {
  if (!activityLog?.length) return;
  const { data: existing, error: existingError } = await supabase
    .from('task_activity_events')
    .select('app_id')
    .eq('org_id', orgId)
    .eq('task_id', taskId);
  if (existingError) throw existingError;
  const existingIds = new Set((existing || []).map(row => row.app_id));
  const rows = activityLog
    .filter(activity => activity.change?.trim())
    .filter(activity => !existingIds.has(activity.id))
    .map(activity => ({
      org_id: orgId,
      task_id: taskId,
      app_id: activity.id,
      user_id: normalizeUserId(activity.userId),
      change: activity.change,
      previous_value: activity.previousValue || null,
      new_value: activity.newValue || null,
      created_at: activity.createdAt,
    }));
  if (!rows.length) return;
  const { error } = await supabase
    .from('task_activity_events')
    .insert(rows);
  if (error) throw error;
}

export const deliveryAdapter = {
  async getProjects(orgId: string) {
    if (getRuntimeDataAccess() === 'local') return MOCK_PROJECTS;
    const { data, error } = await supabase.from('projects').select('*').eq('org_id', orgId).order('created_at');
    if (error) throw error;
    return (data || []).map(fromAuthoritativeProjectRow);
  },

  async getAuthoritativeProjects(context: TenantContextProjection) {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('org_id', context.organizationId)
      .eq('workspace_id', context.workspaceId)
      .eq('status', 'active')
      .is('archived_at', null)
      .is('deleted_at', null)
      .order('created_at');
    if (error) throw error;
    return (data || []).map(fromAuthoritativeProjectRow);
  },

  async getAuthoritativeWorkspace(context: TenantContextProjection) {
    const projects = await this.getAuthoritativeProjects(context);
    const projections = (await Promise.all(
      projects.map(project => queryAllAuthoritativeTasks(context, project.id)),
    )).flat();
    return {
      projects,
      tasks: projections.map(mapLegacyDeliveryTask),
      epics: mapAuthoritativeEpics(projections),
    };
  },

  async createAuthoritativeTask(context: TenantContextProjection, task: Partial<Task>) {
    if (!task.projectId) throw new LegacyDeliveryProjectionError('Choose a project before creating Delivery work.');
    assertLegacyDeliveryCreateProjectionSupported(task);
    const result = await executeAuthoritativeCommand(context, 'task.create', {
      projectId: task.projectId,
      task: {
        title: task.title || 'Untitled Task',
        description: task.description || '',
        priority: task.priority || 'Medium',
        type: task.type || 'Task',
        assigneeIds: task.assigneeIds || [],
        dependencyIds: task.dependencyIds || [],
      },
    });
    return mapLegacyDeliveryTask(result.resource);
  },

  async updateAuthoritativeTask(context: TenantContextProjection, previous: Task, next: Task) {
    if (previous.readOnlyHistorical || !Number.isSafeInteger(previous.version) || (previous.version || 0) < 1) {
      throw new LegacyDeliveryProjectionError('This historical Delivery item is read only because it has no server authority version.');
    }
    assertLegacyDeliveryUpdateProjectionSupported(previous, next);
    const patch = taskUpdatePatch(previous, next);
    if (Object.keys(patch).length === 0) return previous;
    const result = await executeAuthoritativeCommand(context, 'task.update', {
      taskId: previous.id,
      expectedVersion: previous.version!,
      patch,
    });
    return mapLegacyDeliveryTask(result.resource);
  },

  async deleteAuthoritativeTask(context: TenantContextProjection, task: Task) {
    if (task.readOnlyHistorical || !Number.isSafeInteger(task.version) || (task.version || 0) < 1) {
      throw new LegacyDeliveryProjectionError('This historical Delivery item is read only because it has no server authority version.');
    }
    const result = await executeAuthoritativeCommand(context, 'task.delete', {
      taskId: task.id,
      expectedVersion: task.version!,
      deletionReason: 'Deleted from the Delivery workspace.',
    });
    return mapLegacyDeliveryTask(result.resource);
  },

  async importAuthoritativeWorkItems(context: TenantContextProjection, input: {
    projectId: string;
    sourceGenerationId: string;
    displayedItems: WorkItem[];
    selectedItems: WorkItem[];
  }) {
    const query = await queryLegacyDelivery(legacyScope(context), {
      projectId: input.projectId,
      sourceGenerationId: input.sourceGenerationId,
      includeRetained: true,
    });
    if (!query.source) {
      throw new LegacyDeliveryProjectionError('The governed source document is unavailable. Refresh the document before importing Delivery work.');
    }
    const sourceItemIndices = resolveLegacyDeliveryImportSelection(input.displayedItems, input.selectedItems, query.source.items);
    const result = await executeAuthoritativeCommand(context, 'import', {
      projectId: input.projectId,
      sourceGenerationId: input.sourceGenerationId,
      expectedSourceDigest: query.source.digest,
      sourceItemIndices,
    });
    return {
      epicCount: sourceItemIndices.filter(index => query.source!.items.find(item => item.sourceIndex === index)?.type === 'Epic').length,
      taskCount: result.resource.itemCount,
    };
  },

  async saveProject(project: Partial<Project>, orgId: string) {
    if (getRuntimeDataAccess() === 'local') return project as Project;
    const row: any = {
      org_id: orgId,
      app_id: project.id || `project-${Date.now()}`,
      name: project.name || 'Untitled Project',
      description: project.description || '',
      owner_id: normalizeUserId(project.ownerId) || null,
      lifecycle_stage: project.lifecycleStage || 'Planning',
      health_status: project.healthStatus || 'On Track',
      updated_at: new Date().toISOString(),
    };
    if (isUuid(project.id)) row.id = project.id;

    const { data, error } = await supabase
      .from('projects')
      .upsert([row], { onConflict: 'org_id,app_id' })
      .select('*')
      .single();
    if (error) throw error;
    return fromProjectRow(data);
  },

  async getTasks(orgId: string, projectId?: string) {
    if (getRuntimeDataAccess() === 'local') {
      return projectId ? MOCK_TASKS.filter(task => task.projectId === projectId) : MOCK_TASKS;
    }
    let query = supabase
      .from('tasks')
      .select('*, projects(app_id), epics(app_id), sprints(app_id), task_comments(app_id,user_id,content,created_at), task_activity_events(app_id,user_id,change,previous_value,new_value,created_at)')
      .eq('org_id', orgId)
      .order('created_at');
    if (projectId) {
      const projectUuid = await getEntityUuid('projects', orgId, projectId);
      if (!projectUuid) return [];
      query = query.eq('project_id', projectUuid);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(fromTaskRow);
  },

  async getEpics(orgId: string, projectId?: string) {
    if (getRuntimeDataAccess() === 'local') {
      return projectId ? MOCK_EPICS.filter(epic => epic.projectId === projectId) : MOCK_EPICS;
    }
    let query = supabase.from('epics').select('*, projects(app_id)').eq('org_id', orgId).order('created_at');
    if (projectId) {
      const projectUuid = await getEntityUuid('projects', orgId, projectId);
      if (!projectUuid) return [];
      query = query.eq('project_id', projectUuid);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(fromEpicRow);
  },

  async saveEpic(epic: Partial<Epic>, orgId: string) {
    if (getRuntimeDataAccess() === 'local') return epic as Epic;
    const projectUuid = await getEntityUuid('projects', orgId, epic.projectId);
    if (!projectUuid) throw new Error('Project not found for epic save.');
    const row: any = {
      org_id: orgId,
      app_id: epic.id || `epic-${Date.now()}`,
      project_id: projectUuid,
      name: epic.name || 'Untitled Epic',
      color: epic.color || '#2563EB',
    };
    if (isUuid(epic.id)) row.id = epic.id;

    const { data, error } = await supabase
      .from('epics')
      .upsert([row], { onConflict: 'org_id,app_id' })
      .select('*, projects(app_id)')
      .single();
    if (error) throw error;
    return fromEpicRow(data);
  },

  async getSprints(orgId: string, projectId?: string) {
    if (getRuntimeDataAccess() === 'local') {
      return projectId ? MOCK_SPRINTS.filter(sprint => sprint.projectId === projectId) : MOCK_SPRINTS;
    }
    let query = supabase.from('sprints').select('*, projects(app_id)').eq('org_id', orgId).order('start_date');
    if (projectId) {
      const projectUuid = await getEntityUuid('projects', orgId, projectId);
      if (!projectUuid) return [];
      query = query.eq('project_id', projectUuid);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(fromSprintRow);
  },

  async saveSprint(sprint: Partial<Sprint>, orgId: string) {
    if (getRuntimeDataAccess() === 'local') return sprint as Sprint;
    const projectUuid = await getEntityUuid('projects', orgId, sprint.projectId);
    if (!projectUuid) throw new Error('Project not found for sprint save.');

    const row: any = {
      org_id: orgId,
      app_id: sprint.id || `sprint-${Date.now()}`,
      project_id: projectUuid,
      name: sprint.name || 'Untitled Sprint',
      start_date: sprint.startDate || null,
      end_date: sprint.endDate || null,
      status: sprint.status || 'Upcoming',
      goal: sprint.goal || null,
      capacity: sprint.capacity || null,
    };
    if (isUuid(sprint.id)) row.id = sprint.id;

    const { data, error } = await supabase
      .from('sprints')
      .upsert([row], { onConflict: 'org_id,app_id' })
      .select('*, projects(app_id)')
      .single();
    if (error) throw error;
    return fromSprintRow(data);
  },

  async saveTask(task: Partial<Task>, orgId: string, actorId?: string) {
    if (getRuntimeDataAccess() === 'local') return task as Task;
    const projectUuid = await getEntityUuid('projects', orgId, task.projectId);
    if (!projectUuid) throw new Error('Project not found for task save.');
    const epicUuid = await getEntityUuid('epics', orgId, task.epicId);
    const sprintUuid = await getEntityUuid('sprints', orgId, task.sprintId);
    const row: any = {
      org_id: orgId,
      app_id: task.id || `task-${Date.now()}`,
      project_id: projectUuid,
      epic_id: epicUuid,
      sprint_id: sprintUuid,
      title: task.title || 'Untitled Task',
      description: task.description || '',
      status: task.status || 'To Do',
      priority: task.priority || 'Medium',
      type: task.type || 'Task',
      owner_id: actorId || null,
      story_points: task.storyPoints || 0,
      start_date: task.startDate || null,
      due_date: task.dueDate || null,
      parent_id: isUuid(task.parentId) ? task.parentId : null,
      metadata: {
        assigneeIds: (task.assigneeIds || []).map(id => toSupabaseDemoUserId(id) || id),
        reporterId: toSupabaseDemoUserId(task.reporterId) || task.reporterId,
        subtaskIds: task.subtaskIds,
        dependencyIds: task.dependencyIds,
        orderRank: task.orderRank,
        userStories: task.userStories,
        sourceLineage: task.sourceLineage,
        deletionState: task.deletionState,
        deletionMode: task.deletionMode,
        deletionRequestedAt: task.deletionRequestedAt,
        deletionRequestedBy: task.deletionRequestedBy,
        deletedAt: task.deletedAt,
        deletedBy: task.deletedBy,
        deletionReason: task.deletionReason,
        retentionReason: task.retentionReason,
        retentionClass: task.retentionClass,
        restoreEligible: task.restoreEligible,
      },
    };

    if (isUuid(task.id)) row.id = task.id;

    const { data, error } = await supabase
      .from('tasks')
      .upsert([row], { onConflict: 'org_id,app_id' })
      .select('*, projects(app_id), epics(app_id), sprints(app_id), task_comments(app_id,user_id,content,created_at), task_activity_events(app_id,user_id,change,previous_value,new_value,created_at)')
      .single();
    if (error) throw error;
    await syncTaskComments(orgId, data.id, task.comments);
    await syncTaskActivity(orgId, data.id, task.activityLog);

    const { data: refreshed, error: refreshError } = await supabase
      .from('tasks')
      .select('*, projects(app_id), epics(app_id), sprints(app_id), task_comments(app_id,user_id,content,created_at), task_activity_events(app_id,user_id,change,previous_value,new_value,created_at)')
      .eq('id', data.id)
      .single();
    if (refreshError) throw refreshError;
    return fromTaskRow(refreshed);
  },

  async deleteTask(orgId: string, taskId: string) {
    if (getRuntimeDataAccess() === 'local') return;
    let query = supabase.from('tasks').delete().eq('org_id', orgId);
    query = isUuid(taskId) ? query.eq('id', taskId) : query.eq('app_id', taskId);
    const { error } = await query;
    if (error) throw error;
  }
};
