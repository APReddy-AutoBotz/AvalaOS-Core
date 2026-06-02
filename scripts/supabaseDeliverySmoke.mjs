import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

const env = loadEnvLocal();
const url = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const email = process.env.SUPABASE_SMOKE_EMAIL || 'alicia.morgan@acmeoperations.com';
const password = process.env.SUPABASE_SMOKE_PASSWORD || 'demo123';
const orgId = process.env.SUPABASE_SMOKE_ORG_ID || '11111111-1111-4111-8111-111111111111';

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
}

const supabase = createClient(url, anonKey);

const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
if (authError) throw authError;

const userId = authData.user?.id;
if (!userId) throw new Error('Supabase auth succeeded without a user id.');

const { data: projects, error: projectsError } = await supabase
  .from('projects')
  .select('id, app_id, name')
  .eq('org_id', orgId)
  .order('app_id');
if (projectsError) throw projectsError;

const { data: tasks, error: tasksError } = await supabase
  .from('tasks')
  .select('id, app_id, title, project_id, projects(app_id)')
  .eq('org_id', orgId)
  .order('app_id');
if (tasksError) throw tasksError;

const project = projects?.find(item => item.app_id === 'proj-1');
if (!project) throw new Error('Expected demo project proj-1 was not visible through RLS.');

const { data: projectBefore, error: projectBeforeError } = await supabase
  .from('projects')
  .select('id, app_id, lifecycle_stage')
  .eq('id', project.id)
  .single();
if (projectBeforeError) throw projectBeforeError;

const temporaryLifecycleStage = projectBefore.lifecycle_stage === 'Testing' ? 'Development' : 'Testing';
const { data: projectUpdated, error: projectUpdateError } = await supabase
  .from('projects')
  .update({ lifecycle_stage: temporaryLifecycleStage })
  .eq('id', project.id)
  .select('app_id, lifecycle_stage')
  .single();
if (projectUpdateError) throw projectUpdateError;

const { error: projectRestoreError } = await supabase
  .from('projects')
  .update({ lifecycle_stage: projectBefore.lifecycle_stage })
  .eq('id', project.id);
if (projectRestoreError) throw projectRestoreError;

const { data: docInserted, error: docInsertError } = await supabase
  .from('document_generations')
  .insert({
    org_id: orgId,
    project_id: project.id,
    template_id: 'smoke-doc.v1',
    artifacts: {
      brd: { title: 'Smoke BRD', sections: [] },
      workItems: [],
      approvals: [],
    },
  })
  .select('id, template_id')
  .single();
if (docInsertError) throw docInsertError;

const { data: docUpdated, error: docUpdateError } = await supabase
  .from('document_generations')
  .update({
    artifacts: {
      brd: { title: 'Smoke BRD Updated', sections: [] },
      workItems: [],
      approvals: [{ userId, role: 'Accountable', status: 'Pending', approvedAt: null }],
    },
  })
  .eq('id', docInserted.id)
  .select('id, artifacts')
  .single();
if (docUpdateError) throw docUpdateError;

const { error: docDeleteError } = await supabase
  .from('document_generations')
  .delete()
  .eq('id', docInserted.id);
if (docDeleteError) throw docDeleteError;

const sprintSmoke = { status: 'skipped', capacity: null, reason: '' };
const smokeSprintAppId = `sprint-smoke-${Date.now()}`;
const { data: sprintInserted, error: sprintInsertError } = await supabase
  .from('sprints')
  .insert({
    org_id: orgId,
    app_id: smokeSprintAppId,
    project_id: project.id,
    name: 'Smoke Sprint',
    start_date: '2026-05-04',
    end_date: '2026-05-15',
    status: 'Upcoming',
    goal: 'Validate persisted sprint planning',
    capacity: 12,
  })
  .select('id, app_id')
  .single();
if (sprintInsertError?.code === '42501') {
  sprintSmoke.reason = 'Sprint mutation RLS migration not applied yet.';
} else if (sprintInsertError) {
  throw sprintInsertError;
} else {
  const { data: sprintUpdated, error: sprintUpdateError } = await supabase
    .from('sprints')
    .update({ status: 'Active', capacity: 16 })
    .eq('id', sprintInserted.id)
    .select('app_id, status, capacity')
    .single();
  if (sprintUpdateError) throw sprintUpdateError;

  const { error: sprintDeleteError } = await supabase
    .from('sprints')
    .delete()
    .eq('id', sprintInserted.id);
  if (sprintDeleteError) throw sprintDeleteError;

  sprintSmoke.status = sprintUpdated.status;
  sprintSmoke.capacity = sprintUpdated.capacity;
}

const smokeAppId = `task-smoke-${Date.now()}`;
const { data: inserted, error: insertError } = await supabase
  .from('tasks')
  .insert({
    org_id: orgId,
    app_id: smokeAppId,
    project_id: project.id,
    title: 'Smoke test delivery write',
    description: 'Temporary row created by the Supabase delivery smoke test.',
    status: 'To Do',
    priority: 'Low',
    type: 'Task',
    owner_id: userId,
    story_points: 1,
    metadata: { assigneeIds: [userId], smoke: true, orderRank: 9000 },
  })
  .select('id, app_id')
  .single();
if (insertError) throw insertError;

const { error: commentError } = await supabase
  .from('task_comments')
  .insert({
    org_id: orgId,
    task_id: inserted.id,
    app_id: `${smokeAppId}-comment`,
    user_id: userId,
    content: 'Smoke test comment',
  });
if (commentError) throw commentError;

const { error: activityError } = await supabase
  .from('task_activity_events')
  .insert({
    org_id: orgId,
    task_id: inserted.id,
    app_id: `${smokeAppId}-activity`,
    user_id: userId,
    change: 'created this task',
  });
if (activityError) throw activityError;

const smokeDate = new Date().toISOString().split('T')[0];
const { data: timesheetInserted, error: timesheetInsertError } = await supabase
  .from('timesheet_entries')
  .insert({
    org_id: orgId,
    user_id: userId,
    task_id: inserted.id,
    date: smokeDate,
    hours: 1.25,
  })
  .select('id,hours')
  .single();
if (timesheetInsertError) throw timesheetInsertError;

const { data: timesheetUpdated, error: timesheetUpdateError } = await supabase
  .from('timesheet_entries')
  .update({ hours: 2.5 })
  .eq('id', timesheetInserted.id)
  .select('id,hours')
  .single();
if (timesheetUpdateError) throw timesheetUpdateError;

const { data: updated, error: updateError } = await supabase
  .from('tasks')
  .update({ status: 'Done', metadata: { assigneeIds: [userId], smoke: true, orderRank: 1000 } })
  .eq('org_id', orgId)
  .eq('app_id', smokeAppId)
  .select('app_id, status, metadata')
  .single();
if (updateError) throw updateError;

const { data: sidecars, error: sidecarError } = await supabase
  .from('tasks')
  .select('app_id, task_comments(app_id,content), task_activity_events(app_id,change)')
  .eq('org_id', orgId)
  .eq('app_id', smokeAppId)
  .single();
if (sidecarError) throw sidecarError;

const { error: deleteError } = await supabase
  .from('tasks')
  .delete()
  .eq('org_id', orgId)
  .eq('app_id', smokeAppId);
if (deleteError) throw deleteError;

console.log(
  JSON.stringify(
    {
      authUser: userId,
      projectsVisible: projects?.length || 0,
      projectLifecycleUpdate: projectUpdated.lifecycle_stage,
      docSmokeTemplate: docInserted.template_id,
      docSmokeApprovals: docUpdated.artifacts?.approvals?.length || 0,
      sprintSmoke,
      tasksVisible: tasks?.length || 0,
      insertedTask: inserted.app_id,
      updatedStatus: updated.status,
      updatedOrderRank: updated.metadata?.orderRank,
      commentsVisible: sidecars.task_comments?.length || 0,
      activityVisible: sidecars.task_activity_events?.length || 0,
      timesheetHours: Number(timesheetUpdated.hours),
      deletedTask: smokeAppId,
    },
    null,
    2
  )
);
