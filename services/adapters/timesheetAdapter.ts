import { TimesheetEntry } from '../../types';
import { MOCK_TIMESHEET_ENTRIES } from '../../data/mockData';
import { toSupabaseDemoUserId } from '../demoIdentity';
import { isSupabaseConfigured, supabase } from '../supabaseClient';

const isUuid = (value?: string) => Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));

const relationAppId = (relation: any) => {
  const row = Array.isArray(relation) ? relation[0] : relation;
  return row?.app_id;
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

const fromTimesheetRow = (row: any): TimesheetEntry => ({
  id: row.id,
  userId: row.user_id,
  taskId: relationAppId(row.tasks) || row.task_app_id || row.task_id,
  date: row.date,
  hours: Number(row.hours || 0),
});

export const timesheetAdapter = {
  async getEntries(orgId: string, projectId?: string) {
    if (!isSupabaseConfigured()) {
      if (!projectId) return MOCK_TIMESHEET_ENTRIES;
      return MOCK_TIMESHEET_ENTRIES;
    }

    let query = supabase
      .from('timesheet_entries')
      .select('id,user_id,task_id,date,hours,tasks(app_id,projects(app_id))')
      .eq('org_id', orgId)
      .order('date', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    const entries = (data || []).map(fromTimesheetRow);
    if (!projectId) return entries;
    return entries.filter((entry, index) => {
      const row = data?.[index] as any;
      return relationAppId(row?.tasks?.projects) === projectId;
    });
  },

  async saveEntry(entry: Omit<TimesheetEntry, 'id'> & { id?: string }, orgId: string) {
    if (!isSupabaseConfigured()) {
      return {
        id: entry.id || `ts-${Date.now()}`,
        ...entry,
      } as TimesheetEntry;
    }

    const taskUuid = await getEntityUuid('tasks', orgId, entry.taskId);
    if (!taskUuid) throw new Error('Task not found for timesheet entry.');

    const userId = toSupabaseDemoUserId(entry.userId);
    if (!userId) throw new Error('User not found for timesheet entry.');

    const { data: existing, error: existingError } = await supabase
      .from('timesheet_entries')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .eq('task_id', taskUuid)
      .eq('date', entry.date)
      .maybeSingle();
    if (existingError) throw existingError;

    const row = {
      org_id: orgId,
      user_id: userId,
      task_id: taskUuid,
      date: entry.date,
      hours: entry.hours,
    };

    const query = existing?.id
      ? supabase.from('timesheet_entries').update(row).eq('id', existing.id)
      : supabase.from('timesheet_entries').insert(row);

    const { data, error } = await query
      .select('id,user_id,task_id,date,hours,tasks(app_id,projects(app_id))')
      .single();
    if (error) throw error;
    return fromTimesheetRow(data);
  },

  async deleteEntry(orgId: string, userId: string, taskId: string, date: string) {
    if (!isSupabaseConfigured()) return;

    const taskUuid = await getEntityUuid('tasks', orgId, taskId);
    const normalizedUserId = toSupabaseDemoUserId(userId);
    if (!taskUuid || !normalizedUserId) return;

    const { error } = await supabase
      .from('timesheet_entries')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', normalizedUserId)
      .eq('task_id', taskUuid)
      .eq('date', date);
    if (error) throw error;
  },
};
