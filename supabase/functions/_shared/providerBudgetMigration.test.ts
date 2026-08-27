import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20260825165401_unified_provider_budget_authority.sql', 'utf8');
const forwardSql = readFileSync('supabase/migrations/20260826151538_governed_transcript_authority_forward_fix.sql', 'utf8');
const requireSource = (value: string, id: string) => assert.equal(sql.includes(value), true, id);
const requireForwardSource = (value: string, id: string) => assert.equal(forwardSql.includes(value), true, id);

for (const value of [
  'ALTER TABLE public.enterprise_ai_budget_reservations FORCE ROW LEVEL SECURITY',
  'REVOKE ALL ON TABLE public.enterprise_ai_budget_reservations FROM PUBLIC,anon,authenticated,service_role',
  'UNIQUE (receipt_id), UNIQUE (job_id)',
  "state IN ('reserved','settled','uncertain','released')",
  "state IN ('reserved','settled','uncertain')",
  'pg_advisory_xact_lock',
  "concat_ws(':','enterprise-ai-budget',p_org,p_workspace,p_provider,p_capability)",
  'public.pr1b_assert_command_authority',
  "key_ref.status='active'",
  'cardinality(route.allowed_roles)=0',
  "e.effect_key='command'",
  "TO service_role",
]) requireSource(value, `budget migration missing ${value}`);
assert.equal(sql.indexOf('public.pr1b_assert_command_authority') < sql.indexOf('pg_advisory_xact_lock'), true, 'fresh authority precedes locked reservation');
assert.equal(sql.indexOf('pg_advisory_xact_lock') < sql.indexOf('INSERT INTO public.enterprise_ai_budget_reservations'), true, 'scope lock precedes reservation insert');
assert.equal(sql.includes('workspace_id=p_workspace AND provider=p_provider'), true, 'budget aggregation is tenant/workspace/provider/capability scoped');
assert.equal(/GRANT[^;]+(?:authenticated|anon)[^;]+enterprise_ai_(?:reserve|settle|mark|release)_provider_budget/is.test(sql), false);

for (const value of [
  'CREATE TABLE public.enterprise_provider_secret_cleanup_jobs',
  'FOR UPDATE SKIP LOCKED',
  "OR (state='claimed' AND lease_expires_at<=statement_timestamp())",
  "'openai','azure_openai','anthropic','gemini','groq','openai_compatible'",
  'enterprise_ai_claim_provider_secret_cleanup_v3',
  "IF receipt.id IS NULL THEN RAISE EXCEPTION 'ENTERPRISE_AI_RECEIPT_NOT_FOUND'",
  "'_SERVER_PLAN_[A-Z0-9_]+$'",
]) requireSource(value, `cleanup migration missing ${value}`);

const cleanupTable = sql.slice(sql.indexOf('CREATE TABLE public.enterprise_provider_secret_cleanup_jobs'), sql.indexOf('ALTER TABLE public.enterprise_provider_secret_cleanup_jobs'));
assert.equal(/\n\s*(?:secret_ref|raw_key|provider_key|api_key|authorization)\s+/i.test(cleanupTable), false, 'cleanup queue must not contain secret-bearing columns');

for (const value of [
  'enterprise_ai_assert_budget_transition_identity',
  "receipt.status<>'claimed'",
  "job.status<>'running'",
  'receipt.execution_token IS DISTINCT FROM p_execution_token',
  'receipt.execution_fence IS DISTINCT FROM p_execution_fence',
  'p_row.execution_token IS DISTINCT FROM p_execution_token',
  'p_row.execution_fence IS DISTINCT FROM p_execution_fence',
  'enterprise_ai_settle_provider_budget_v2',
  'enterprise_ai_mark_provider_budget_uncertain_v2',
  'enterprise_ai_release_provider_budget_v2',
  "reservation.state IN('settled','uncertain')",
  "p_release_reason NOT IN('before_provider_effect','reconciled_no_effect')",
  'TO service_role',
]) requireForwardSource(value, `forward budget remediation missing ${value}`);
assert.equal(forwardSql.includes('PERFORM public.pr1b_assert_command_authority'), false,
  'post-provider-effect transitions must use the exact reserved execution fence, never mutable current authority');
assert.equal(/GRANT[^;]+(?:authenticated|anon)[^;]+enterprise_ai_(?:settle|mark|release)_provider_budget_v2/is.test(forwardSql), false,
  'fenced post-effect transition RPCs remain service-only');
assert.equal(forwardSql.includes('SET search_path=pg_catalog'), true, 'forward transition helpers use a fixed search path');
console.log('ok - BUDGET-001/002 and provider cleanup migration source authority is atomic, service-only, RLS-forced, and secret-free');
