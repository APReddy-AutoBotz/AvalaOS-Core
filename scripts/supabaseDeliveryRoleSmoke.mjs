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

async function signIn(url, anonKey, email, password) {
  const client = createClient(url, anonKey);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.user?.id) throw new Error(`Auth succeeded without user id for ${email}`);
  return { client, userId: data.user.id };
}

async function expectDenied(label, operation) {
  const { error } = await operation();
  if (!error) {
    throw new Error(`${label} was allowed but should have been denied.`);
  }
  return error.message;
}

async function expectNoRowsChanged(label, operation, verify) {
  const { error } = await operation();
  if (error) return error.message;
  const changed = await verify();
  if (changed) {
    throw new Error(`${label} changed data but should have been denied.`);
  }
  return 'no rows changed by RLS';
}

const env = loadEnvLocal();
const url = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const password = process.env.SUPABASE_SMOKE_PASSWORD || 'demo123';
const orgId = process.env.SUPABASE_SMOKE_ORG_ID || '11111111-1111-4111-8111-111111111111';

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
}

const pm = await signIn(url, anonKey, 'alicia.morgan@acmeoperations.com', password);
const ba = await signIn(url, anonKey, 'maya.patel@acmeoperations.com', password);
const dev = await signIn(url, anonKey, 'frank.miller@acmeoperations.com', password);
const executive = await signIn(url, anonKey, 'sarah.chen@acmeoperations.com', password);

const { data: project, error: projectError } = await pm.client
  .from('projects')
  .select('id, app_id, name')
  .eq('org_id', orgId)
  .eq('app_id', 'proj-1')
  .single();
if (projectError) throw projectError;

const smokeAppId = `task-role-smoke-${Date.now()}`;
let insertedTaskId = null;

try {
  const { data: inserted, error: insertError } = await pm.client
    .from('tasks')
    .insert({
      org_id: orgId,
      app_id: smokeAppId,
      project_id: project.id,
      title: 'Role smoke delivery task',
      description: 'Temporary row created by the delivery role smoke test.',
      status: 'To Do',
      priority: 'Low',
      type: 'Task',
      owner_id: pm.userId,
      story_points: 1,
      metadata: { assigneeIds: [pm.userId], smoke: true },
    })
    .select('id, app_id')
    .single();
  if (insertError) throw insertError;
  insertedTaskId = inserted.id;

  const { error: pmUpdateError } = await pm.client
    .from('tasks')
    .update({ status: 'Done' })
    .eq('org_id', orgId)
    .eq('app_id', smokeAppId);
  if (pmUpdateError) throw pmUpdateError;

  const baTaskUpdateDenied = await expectNoRowsChanged(
    'Business Analyst task update',
    () =>
    ba.client
      .from('tasks')
      .update({ status: 'In Review' })
      .eq('org_id', orgId)
        .eq('app_id', smokeAppId),
    async () => {
      const { data, error } = await pm.client
        .from('tasks')
        .select('status')
        .eq('org_id', orgId)
        .eq('app_id', smokeAppId)
        .single();
      if (error) throw error;
      return data.status === 'In Review';
    }
  );

  const executiveUpdateDenied = await expectNoRowsChanged(
    'Executive task update',
    () =>
    executive.client
      .from('tasks')
      .update({ status: 'In Review' })
      .eq('org_id', orgId)
        .eq('app_id', smokeAppId),
    async () => {
      const { data, error } = await pm.client
        .from('tasks')
        .select('status')
        .eq('org_id', orgId)
        .eq('app_id', smokeAppId)
        .single();
      if (error) throw error;
      return data.status === 'In Review';
    }
  );

  const { error: commentError } = await ba.client
    .from('task_comments')
    .insert({
      org_id: orgId,
      task_id: insertedTaskId,
      app_id: `${smokeAppId}-ba-comment`,
      user_id: ba.userId,
      content: 'BA smoke comment',
    });
  if (commentError) throw commentError;

  const { data: devTask, error: devTaskError } = await dev.client
    .from('tasks')
    .select('id, app_id, description, metadata')
    .eq('org_id', orgId)
    .eq('app_id', 'task-102')
    .single();
  if (devTaskError) throw devTaskError;

  const devDescription = `${devTask.description} `;
  const { error: devOwnUpdateError } = await dev.client
    .from('tasks')
    .update({ description: devDescription.trimEnd() })
    .eq('org_id', orgId)
    .eq('app_id', 'task-102');
  if (devOwnUpdateError) throw devOwnUpdateError;

  const devAssignmentDenied = await expectNoRowsChanged(
    'Developer assignment update',
    () =>
    dev.client
      .from('tasks')
      .update({ metadata: { ...devTask.metadata, assigneeIds: [...(devTask.metadata?.assigneeIds || []), ba.userId] } })
      .eq('org_id', orgId)
        .eq('app_id', 'task-102'),
    async () => {
      const { data, error } = await pm.client
        .from('tasks')
        .select('metadata')
        .eq('org_id', orgId)
        .eq('app_id', 'task-102')
        .single();
      if (error) throw error;
      return (data.metadata?.assigneeIds || []).includes(ba.userId);
    }
  );

  console.log(JSON.stringify({
    project: project.app_id,
    pmTaskInsert: smokeAppId,
    pmTaskUpdate: 'allowed',
    baTaskUpdateDenied,
    executiveUpdateDenied,
    baCommentInsert: 'allowed',
    devOwnTaskUpdate: 'allowed',
    devAssignmentDenied,
  }, null, 2));
} finally {
  if (insertedTaskId) {
    await pm.client
      .from('tasks')
      .delete()
      .eq('org_id', orgId)
      .eq('id', insertedTaskId);
  }
}
