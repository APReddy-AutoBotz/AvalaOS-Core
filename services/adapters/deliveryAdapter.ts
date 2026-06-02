import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { Project, Task, Epic, Sprint, Comment, ActivityLogItem } from '../../types';
import { MOCK_PROJECTS, MOCK_TASKS, MOCK_EPICS, MOCK_SPRINTS } from '../../data/mockData';
import { toSupabaseDemoUserId } from '../demoIdentity';

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
});

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
    if (!isSupabaseConfigured()) return MOCK_PROJECTS;
    const { data, error } = await supabase.from('projects').select('*').eq('org_id', orgId).order('created_at');
    if (error) throw error;
    return (data || []).map(fromProjectRow);
  },

  async saveProject(project: Partial<Project>, orgId: string) {
    if (!isSupabaseConfigured()) return project as Project;
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
    if (!isSupabaseConfigured()) {
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
    if (!isSupabaseConfigured()) {
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
    if (!isSupabaseConfigured()) return epic as Epic;
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
    if (!isSupabaseConfigured()) {
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
    if (!isSupabaseConfigured()) return sprint as Sprint;
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
    if (!isSupabaseConfigured()) return task as Task;
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
    if (!isSupabaseConfigured()) return;
    let query = supabase.from('tasks').delete().eq('org_id', orgId);
    query = isUuid(taskId) ? query.eq('id', taskId) : query.eq('app_id', taskId);
    const { error } = await query;
    if (error) throw error;
  }
};
