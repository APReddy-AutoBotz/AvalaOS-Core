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
 "'ok',true,'outcome','committed'", "'ok',false,'errorCode'", "jsonb_set(r.response,'{outcome}','\"replayed\"'::jsonb)",
]) assert.ok(sql.includes(contract), `Missing PR 1B contract: ${contract}`);
assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM/i);
assert.equal((sql.match(/\$\$/g) || []).length % 2, 0);
console.log(`PR 1B canonical migration contract passed across ${migrations.length} ordered migrations.`);
