import fs from 'node:fs';

const required = [
  ['supabase/functions/_shared/tenantAuthorityDb.ts', 'Authorization: `Bearer ${callerToken}`'],
  ['supabase/functions/_shared/tenantAuthorityDb.ts', 'apikey: anonKey'],
  ['supabase/functions/_shared/tenantAuthorityDb.ts', "p_org_id: input.organizationId"],
  ['supabase/functions/_shared/assessDb.ts', 'Authorization: `Bearer ${serviceRoleKey}`'],
  ['supabase/functions/_shared/assessDb.ts', 'apikey: serviceRoleKey'],
  ['supabase/functions/_shared/assessDb.ts', 'p_actor_id: command.actorId'],
  ['supabase/functions/_shared/assessDb.ts', "'pr1b_finalize_assessment'"],
  ['supabase/functions/_shared/assessHandlers.ts', "'assess.finalize'"],
  ['supabase/functions/_shared/assessHandlers.ts', 'loadAssessmentForFinalize'],
  ['supabase/functions/_shared/assessHandlers.ts', "requireExactKeys(envelope.payload, ['assessmentId'])"],
  ['supabase/functions/_shared/assessHandlers.ts', 'payload: { processId: persisted.processId, scores }'],
];

const forbidden = [
  ['supabase/functions/_shared/tenantAuthorityDb.ts', 'serviceRoleKey'],
  ['supabase/functions/_shared/assessDb.ts', 'command.accessToken'],
  ['supabase/functions/_shared/assessDb.ts', 'callerToken'],
  ['supabase/functions/_shared/assessHandlers.ts', 'payload.scores'],
  ['supabase/functions/_shared/assessHandlers.ts', 'payload.scoreVersion'],
  ['supabase/functions/_shared/assessHandlers.ts', 'payload.actorId'],
  ['supabase/functions/_shared/assessHandlers.ts', 'payload.organizationId'],
  ['supabase/functions/_shared/assessHandlers.ts', 'payload.workspaceId'],
];

const failures = [];
for (const [file, pattern] of required) {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes(pattern)) failures.push(`${file}: missing required boundary ${pattern}`);
}
for (const [file, pattern] of forbidden) {
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes(pattern)) failures.push(`${file}: forbidden authority pattern ${pattern}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('PR 1B server-authority source boundaries passed.');
