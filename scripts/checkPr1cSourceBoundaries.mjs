import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const requireText = (source, fragment, label) => {
  if (!source.includes(fragment)) throw new Error(`PR1C_SOURCE_BOUNDARY_MISSING: ${label}`);
};
const forbidText = (source, fragment, label) => {
  if (source.includes(fragment)) throw new Error(`PR1C_SOURCE_BOUNDARY_FORBIDDEN: ${label}`);
};

const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter(name => name.includes('pr1c'));
if (migrations.length !== 1) throw new Error(`PR1C_MIGRATION_COUNT: expected 1, received ${migrations.length}`);
const migration = read(`supabase/migrations/${migrations[0]}`);
const command = read('supabase/functions/_shared/assessCommand.ts');
const handlers = read('supabase/functions/_shared/assessHandlers.ts');
const database = read('supabase/functions/_shared/assessDb.ts');
const service = read('services/assessmentService.ts');
const adapter = read('services/adapters/assessAdapter.ts');
const provider = read('components/auth/OrganizationProvider.tsx');
const app = read('App.tsx');
const processDetail = read('components/assess/ProcessDetailStubView.tsx');
const studioHandoff = read('services/assessToStudioHandoff.ts');

for (const type of ["'govern.resolve'", "'studio_handoff.create'"]) requireText(command, type, `typed command ${type}`);
for (const handler of ['handleGovernResolve', 'handleStudioHandoff']) requireText(handlers, handler, `separate handler ${handler}`);
for (const rpc of ["'pr1c_govern_resolve'", "'pr1c_create_studio_handoff'"]) requireText(database, rpc, `RPC routing ${rpc}`);
for (const fn of ['pr1c_list_tenant_contexts', 'pr1c_govern_resolve', 'pr1c_create_studio_handoff']) {
  requireText(migration, `GRANT EXECUTE ON FUNCTION public.${fn}`, `service grant ${fn}`);
}
forbidText(migration, 'GRANT EXECUTE ON FUNCTION public.pr1c_govern_resolve(uuid,uuid,uuid,uuid,text,text,bigint,uuid,text,bigint) TO authenticated', 'authenticated Govern RPC');
forbidText(migration, 'GRANT EXECUTE ON FUNCTION public.pr1c_create_studio_handoff(uuid,uuid,uuid,uuid,text,bigint,uuid,text,bigint) TO authenticated', 'authenticated Studio RPC');
requireText(migration, "a.status<>'Approved'", 'Govern approval before Studio handoff');
requireText(migration, 'pr1b_assert_command_authority', 'fresh server reauthorization');
requireText(migration, 'pr1b_claim_command', 'actor-scoped idempotency');
requireText(migration, 'assessment_studio_handoffs', 'durable handoff record');
requireText(migration, 'privileged_audit_events', 'atomic privileged audit');
requireText(service, 'persistEnterpriseAssessment', 'enterprise draft persistence');
requireText(service, 'finalizeEnterpriseAssessment', 'enterprise finalize');
requireText(service, 'resolveEnterpriseGovern', 'enterprise Govern');
requireText(service, 'createEnterpriseStudioHandoff', 'enterprise Studio handoff');
requireText(adapter, 'Enterprise assessment mutations must use the typed assess-command boundary.', 'direct assessment mutation denial');
requireText(provider, 'loadEnterpriseSessionContexts', 'server-issued session projection');
requireText(app, 'EnterpriseSessionStateView', 'explicit enterprise session states');
requireText(app, 'EnterpriseSessionToolbar', 'organization/workspace selection');
requireText(adapter, 'Enterprise assessment review events must use the typed assess-command boundary.', 'direct review event denial');
requireText(processDetail, "assessment?.status === 'Handed Off to Docs'", 'process detail handoff gate');
requireText(studioHandoff, "assessment.status !== 'Handed Off to Docs'", 'handoff payload gate');

console.log('PR 1C source, migration, authority, and UI cutover boundaries passed.');
