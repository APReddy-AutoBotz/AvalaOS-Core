import assert from 'node:assert/strict';
import fs from 'node:fs';

const dir = 'supabase/migrations';
const name = '20260712120000_pr1b_identity_rbac_rls_assess.sql';
const migrations = fs.readdirSync(dir).filter(x => x.endsWith('.sql')).sort();
assert.equal(migrations.at(-1), name);
assert.equal(new Set(migrations.map(x => x.slice(0, 14))).size, migrations.length);
const sql = fs.readFileSync(`${dir}/${name}`, 'utf8');
for (const contract of [
 'CREATE TABLE IF NOT EXISTS public.capabilities','CREATE TABLE IF NOT EXISTS public.role_capabilities',
 'CREATE TABLE IF NOT EXISTS public.authorization_versions','CREATE OR REPLACE FUNCTION public.pr1b_enforce_membership_role_scope',
 'CREATE OR REPLACE FUNCTION public.is_active_workspace_member','CREATE TABLE IF NOT EXISTS public.assess_command_receipts',
 'CREATE TABLE IF NOT EXISTS public.privileged_audit_events','CREATE OR REPLACE FUNCTION public.has_workspace_capability',
 'CREATE OR REPLACE FUNCTION public.get_tenant_context','CREATE OR REPLACE FUNCTION public.pr1b_create_assessment',
 'CREATE OR REPLACE FUNCTION public.pr1b_upsert_assessment_responses','CREATE OR REPLACE FUNCTION public.pr1b_finalize_assessment',
 'PR1B_PREFLIGHT_ASSESS_WORKSPACE_REQUIRED','FORCE ROW LEVEL SECURITY','PR1B_AUTHORIZATION_STALE',
 'PR1B_PREFLIGHT_ORGANIZATION_MEMBERSHIP_ROLE_INVALID','PR1B_PREFLIGHT_WORKSPACE_MEMBERSHIP_ROLE_INVALID',
 'p_actor_id uuid','PR1B_SCORE_VERSION_INVALID','PR1B_INVALID_COMMAND',"ELSE 'COMMAND_UNAVAILABLE' END",
 'TO service_role','FROM PUBLIC,anon,authenticated',
 "'ok',true,'outcome','committed'", "'ok',false,'errorCode'", "IF r.status='succeeded' THEN RETURN r.response",
]) assert.ok(sql.includes(contract), `Missing PR 1B contract: ${contract}`);
for (const forbiddenGrant of [
 /GRANT EXECUTE ON FUNCTION public\.pr1b_create_assessment\([^;]+ TO authenticated/i,
 /GRANT EXECUTE ON FUNCTION public\.pr1b_upsert_assessment_responses\([^;]+ TO authenticated/i,
 /GRANT EXECUTE ON FUNCTION public\.pr1b_finalize_assessment\([^;]+ TO authenticated/i,
]) assert.doesNotMatch(sql, forbiddenGrant);
assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM/i);
assert.equal((sql.match(/\$\$/g) || []).length % 2, 0);
console.log(`PR 1B canonical migration contract passed across ${migrations.length} ordered migrations.`);
