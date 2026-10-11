import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const { Client } = pg;
const source = process.env.SUPABASE_PROVIDER_SECRET_BACKEND_DATABASE_URL;
if (!source) {
  if (process.argv.includes('--allow-not-run')) {
    console.log('supabase provider-secret PostgreSQL: not run (SUPABASE_PROVIDER_SECRET_BACKEND_DATABASE_URL is unset)');
    process.exit(0);
  }
  throw new Error('SUPABASE_PROVIDER_SECRET_BACKEND_DATABASE_URL_REQUIRED');
}
const parsed = new URL(source);
if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
  || !['127.0.0.1', '[::1]', 'localhost'].includes(parsed.hostname.toLowerCase())
  || parsed.search || parsed.hash) throw new Error('SUPABASE_PROVIDER_SECRET_BACKEND_LOCAL_DATABASE_URL_REJECTED');
const database = `supabase_provider_secret_${process.pid}_${Date.now()}`.toLowerCase();
assert.match(database, /^[a-z0-9_]+$/u);
const urlFor = name => { const value = new URL(source); value.pathname = `/${name}`; return value.toString(); };
const migration = readFileSync('supabase/migrations/20261011053000_supabase_provider_secret_backend.sql', 'utf8').replaceAll('\r\n', '\n');
const ids = {
  org: '91000000-0000-4000-8000-000000000001', workspace: '91000000-0000-4000-8000-000000000002',
  actor: '91000000-0000-4000-8000-000000000003', session: '91000000-0000-4000-8000-000000000004',
  exercise: '91000000-0000-4000-8000-000000000005', receipt: '91000000-0000-4000-8000-000000000006',
  token: '91000000-0000-4000-8000-000000000007', key: '91000000-0000-4000-8000-000000000008',
  legacyKey: '91000000-0000-4000-8000-000000000009', foreignOrg: '91000000-0000-4000-8000-000000000010',
  takeoverToken: '91000000-0000-4000-8000-000000000011',
};
const provider = 'groq';
const secretRef = `AVALA_PROVIDER_SECRET_GROQ_${ids.org.replaceAll('-', '').toUpperCase()}_NATIVE`;
const legacyRef = `AVALA_PROVIDER_SECRET_GROQ_${ids.org.replaceAll('-', '').toUpperCase()}_LEGACY`;
const secretValue = 'synthetic-native-provider-secret';
const fingerprint = value => `sha256:${createHash('sha256').update(value).digest('hex').slice(0, 24)}`;
const safeFingerprint = fingerprint(secretValue);
const hash64 = value => createHash('sha256').update(value).digest('hex');
const authority = async (client, sql, parameters = []) => {
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE service_role');
    const result = await client.query(sql, parameters);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
};
const expectRejected = async operation => {
  let rejected = false;
  try { await operation(); } catch { rejected = true; }
  assert.equal(rejected, true);
};

const bootstrap = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS supabase_vault CASCADE;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),not_after timestamptz);
CREATE TABLE public.organizations(id uuid PRIMARY KEY);
CREATE TABLE public.workspaces(id uuid NOT NULL,org_id uuid NOT NULL REFERENCES public.organizations(id),PRIMARY KEY(id,org_id));
CREATE TABLE public.profiles(id uuid PRIMARY KEY);
CREATE TABLE public.hosted_pilot_environment_identity(
 singleton boolean PRIMARY KEY DEFAULT true,product_key text NOT NULL,environment_class text NOT NULL,
 schema_contract text NOT NULL,migration_tip text NOT NULL,production_authorized boolean NOT NULL,
 customer_data_authorized boolean NOT NULL,real_provider_calls_authorized boolean NOT NULL,
 CONSTRAINT hosted_pilot_environment_identity_migration_tip_check CHECK(migration_tip='20261010144356'));
CREATE TABLE public.enterprise_intelligence_runtime_control(singleton boolean PRIMARY KEY DEFAULT true,enabled boolean NOT NULL,read_only boolean NOT NULL,provider_enabled boolean NOT NULL);
CREATE TABLE public.studio_artifact_runtime_control(singleton boolean PRIMARY KEY DEFAULT true,enabled boolean NOT NULL,read_only boolean NOT NULL,provider_enabled boolean NOT NULL);
CREATE TABLE public.enterprise_ai_command_receipts(
 id uuid PRIMARY KEY,org_id uuid NOT NULL,workspace_id uuid NOT NULL,actor_id uuid NOT NULL,runtime_area text NOT NULL,
 command_type text NOT NULL,status text NOT NULL,execution_token uuid,execution_fence bigint NOT NULL DEFAULT 0,
 lease_expires_at timestamptz,execution_plan jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE public.ai_provider_key_refs(
 id uuid PRIMARY KEY,org_id uuid NOT NULL,provider text NOT NULL,resolver_type text NOT NULL,secret_ref text NOT NULL,
 safe_fingerprint text,status text NOT NULL,deleted_at timestamptz,UNIQUE(id,org_id));
CREATE TABLE public.enterprise_provider_secret_cleanup_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),key_ref_id uuid NOT NULL,org_id uuid NOT NULL,provider text NOT NULL,
 state text NOT NULL DEFAULT 'pending',execution_token uuid,lease_expires_at timestamptz,attempt_count integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT statement_timestamp(),last_failure_class text,completed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),UNIQUE(key_ref_id,org_id));
CREATE TABLE public.authenticated_synthetic_exercises(
 id uuid PRIMARY KEY,environment_class text NOT NULL,release_sha text NOT NULL,deployment_id text NOT NULL,origin text NOT NULL,
 backend_fingerprint text NOT NULL,migration_tip text NOT NULL,migration_digest text NOT NULL,exercise_digest text NOT NULL,
 profile_version text NOT NULL,catalog_digest text NOT NULL,source_digest text NOT NULL,org_id uuid NOT NULL,workspace_id uuid NOT NULL,
 lifecycle text NOT NULL,expires_at timestamptz NOT NULL,activated_at timestamptz NOT NULL DEFAULT statement_timestamp(),quiesced_at timestamptz,
 CONSTRAINT authenticated_synthetic_exercises_migration_tip_check CHECK(migration_tip='20261010144356'),
 CONSTRAINT authenticated_synthetic_exercises_profile_version_check CHECK(profile_version='hosted-authenticated-synthetic-profile-v2'));
CREATE TABLE public.authenticated_synthetic_actor_sessions(exercise_id uuid NOT NULL,actor_id uuid NOT NULL,session_id uuid NOT NULL,persona text NOT NULL,actor_hash text NOT NULL,session_hash text NOT NULL,state text NOT NULL,PRIMARY KEY(exercise_id,actor_id,session_id));
CREATE TABLE public.pr_c_controlled_human_exercises(migration_tip text NOT NULL CONSTRAINT pr_c_controlled_human_exercises_migration_tip_check CHECK(migration_tip IN('20261010144356')));
CREATE FUNCTION public.enterprise_ai_enqueue_retired_provider_secret_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$;
CREATE TRIGGER enterprise_ai_enqueue_retired_provider_secret_cleanup AFTER UPDATE ON public.ai_provider_key_refs FOR EACH ROW EXECUTE FUNCTION public.enterprise_ai_enqueue_retired_provider_secret_cleanup();
CREATE FUNCTION public.enterprise_ai_complete_provider_secret_cleanup_job(uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;
CREATE FUNCTION public.enterprise_ai_fail_provider_secret_cleanup_job(uuid,uuid,text) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;
CREATE FUNCTION public.synthetic_ai_campaign_activate_final_continuation(uuid,uuid,uuid,bigint,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,integer) RETURNS jsonb LANGUAGE plpgsql AS $$DECLARE marker public.hosted_pilot_environment_identity;BEGIN IF marker.migration_tip<>'20261010144356' THEN NULL;END IF;RETURN '{}'::jsonb;END$$;
CREATE FUNCTION public.synthetic_ai_campaign_bootstrap(uuid,uuid,uuid,bigint,text,text,text,text,uuid,uuid,uuid,uuid,timestamptz) RETURNS jsonb LANGUAGE plpgsql AS $$DECLARE marker public.hosted_pilot_environment_identity;BEGIN IF marker.migration_tip='20261010144356' THEN NULL;END IF;RETURN '{}'::jsonb;END$$;
CREATE FUNCTION public.pr_c_controlled_human_assert_marker() RETURNS void LANGUAGE plpgsql AS $$DECLARE marker public.hosted_pilot_environment_identity;BEGIN IF marker.migration_tip = '20261010144356' THEN NULL;END IF;END$$;
CREATE FUNCTION public.synthetic_ai_campaign_activate_brd_v3_quality_validation(uuid,uuid,uuid,bigint,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,uuid,uuid,uuid,uuid,text,text,integer) RETURNS jsonb LANGUAGE plpgsql AS $$DECLARE marker public.hosted_pilot_environment_identity;BEGIN IF marker.migration_tip<>'20261010144356' THEN NULL;END IF;RETURN '{}'::jsonb;END$$;
CREATE FUNCTION public.authenticated_synthetic_exercise_activate(
 p_exercise_id uuid,p_release_sha text,p_deployment_id text,p_origin text,p_backend_fingerprint text,p_migration_tip text,
 p_migration_digest text,p_exercise_digest text,p_profile_version text,p_catalog_digest text,p_source_digest text,
 p_org uuid,p_workspace uuid,p_expires_at timestamptz) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN IF p_migration_tip<>'20261010144356' OR p_profile_version<>'hosted-authenticated-synthetic-profile-v2' THEN RAISE EXCEPTION 'rejected';END IF;RETURN '{}'::jsonb;END$$;
INSERT INTO public.hosted_pilot_environment_identity VALUES(true,'avalaos-core','hosted_nonproduction_pilot','hosted-pilot-2026-08','20261010144356',false,false,false);
INSERT INTO public.enterprise_intelligence_runtime_control VALUES(true,true,false,false);
INSERT INTO public.studio_artifact_runtime_control VALUES(true,true,false,false);
`;

const admin = new Client({ connectionString: source });
let db;
let concurrentDb;
let created = false;
let stage = 'connect';
try {
  await admin.connect();
  for (const role of ['anon', 'authenticated', 'service_role']) {
    if (!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rowCount) {
      await admin.query(`CREATE ROLE ${role} NOLOGIN${role === 'service_role' ? ' BYPASSRLS' : ''}`);
    }
  }
  await admin.query(`CREATE DATABASE ${database}`);
  created = true;
  db = new Client({ connectionString: urlFor(database) });
  await db.connect();
  stage = 'bootstrap';
  await db.query(bootstrap);
  stage = 'migration';
  await db.query(migration);
  stage = 'authority';
  concurrentDb = new Client({ connectionString: urlFor(database) });
  await concurrentDb.connect();
  await db.query('GRANT USAGE ON SCHEMA public TO service_role,authenticated');
  assert.equal((await db.query(`SELECT has_table_privilege('service_role',
    'public.enterprise_provider_secret_backend_ownerships','SELECT') value`)).rows[0].value, false);
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query("SELECT has_schema_privilege($1,'vault','USAGE') value", [role])).rows[0].value, false);
    assert.equal((await db.query("SELECT has_table_privilege($1,'vault.secrets','SELECT') value", [role])).rows[0].value, false);
    assert.equal((await db.query("SELECT has_table_privilege($1,'vault.decrypted_secrets','SELECT') value", [role])).rows[0].value, false);
  }
  assert.equal((await authority(db, 'SELECT public.enterprise_provider_secret_backend_capability() value')).rows[0].value.available, true);
  assert.deepEqual((await db.query(`SELECT profile_version FROM public.authenticated_synthetic_exercises`)).rows, []);

  await db.query('INSERT INTO public.organizations(id) VALUES($1),($2)', [ids.org, ids.foreignOrg]);
  await db.query('INSERT INTO public.workspaces(id,org_id) VALUES($1,$2)', [ids.workspace, ids.org]);
  await db.query('INSERT INTO public.profiles(id) VALUES($1)', [ids.actor]);
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [ids.actor]);
  await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [ids.session, ids.actor]);
  await db.query(`INSERT INTO public.authenticated_synthetic_exercises(
    id,environment_class,release_sha,deployment_id,origin,backend_fingerprint,migration_tip,migration_digest,
    exercise_digest,profile_version,catalog_digest,source_digest,org_id,workspace_id,lifecycle,expires_at)
    VALUES($1,'hosted_nonproduction_pilot',$2,$3,'https://avalaos-pilot.netlify.app',$4,'20261011053000',$5,$6,
      'hosted-authenticated-synthetic-profile-v3',$7,$8,$9,$10,'active',statement_timestamp()+interval '1 hour')`,
  [ids.exercise, 'a'.repeat(40), 'b'.repeat(24), `sha256:${hash64('backend')}`, `sha256:${hash64('migration')}`,
    `sha256:${hash64('exercise')}`, `sha256:${hash64('catalog')}`, `sha256:${hash64('source')}`, ids.org, ids.workspace]);
  await db.query(`INSERT INTO public.authenticated_synthetic_actor_sessions VALUES($1,$2,$3,'author',$4,$5,'active')`,
    [ids.exercise, ids.actor, ids.session, `sha256:${hash64('actor')}`, `sha256:${hash64('session')}`]);
  const plan = { secretOwnership: 'managed_write', secretBackendKind: 'supabase_vault', secretPlanReceiptId: ids.receipt,
    keyRefId: ids.key, provider, secretReference: secretRef, safeFingerprint, writeState: 'planned' };
  await db.query(`INSERT INTO public.enterprise_ai_command_receipts(
    id,org_id,workspace_id,actor_id,runtime_area,command_type,status,execution_token,execution_fence,lease_expires_at,execution_plan)
    VALUES($1,$2,$3,$4,'provider','provider.secret.bind','claimed',$5,3,statement_timestamp()+interval '10 minutes',$6::jsonb)`,
  [ids.receipt, ids.org, ids.workspace, ids.actor, ids.token, JSON.stringify(plan)]);

  const absent = (await authority(db, `SELECT public.enterprise_provider_secret_resolve_for_receipt(
    $1,$2,3,$3,$4,$5,$6,$7) value`, [ids.receipt, ids.token, ids.key, ids.org, provider, secretRef, safeFingerprint])).rows[0].value;
  assert.equal(absent, null);
  await db.query("UPDATE public.enterprise_ai_command_receipts SET execution_plan=execution_plan-'secretBackendKind' WHERE id=$1", [ids.receipt]);
  await expectRejected(() => authority(db, `SELECT public.enterprise_provider_secret_write(
    $1,$2,3,$3,$4,$5,$6,$7,$8)`, [ids.receipt, ids.token, ids.key, ids.org, provider, secretRef, safeFingerprint, secretValue]));
  await db.query("UPDATE public.enterprise_ai_command_receipts SET execution_plan=jsonb_set(execution_plan,'{secretBackendKind}','\"supabase_vault\"'::jsonb)-'writeState' WHERE id=$1", [ids.receipt]);
  await expectRejected(() => authority(db, `SELECT public.enterprise_provider_secret_write(
    $1,$2,3,$3,$4,$5,$6,$7,$8)`, [ids.receipt, ids.token, ids.key, ids.org, provider, secretRef, safeFingerprint, secretValue]));
  await db.query("UPDATE public.enterprise_ai_command_receipts SET execution_plan=jsonb_set(execution_plan,'{writeState}','\"planned\"'::jsonb) WHERE id=$1", [ids.receipt]);
  const writeSql = `SELECT public.enterprise_provider_secret_write($1,$2,3,$3,$4,$5,$6,$7,$8) value`;
  stage = 'write_replay';
  const duplicateResults = await Promise.all([
    authority(db, writeSql, [ids.receipt, ids.token, ids.key, ids.org, provider, secretRef, safeFingerprint, secretValue]),
    authority(concurrentDb, writeSql, [ids.receipt, ids.token, ids.key, ids.org, provider, secretRef, safeFingerprint, secretValue]),
  ]);
  assert.deepEqual(duplicateResults.map(result => result.rows[0].value.outcome).sort(), ['created', 'replayed']);
  assert.equal((await db.query('SELECT count(*)::int count FROM vault.secrets WHERE name=$1', [secretRef])).rows[0].count, 1);
  assert.equal((await authority(db, `SELECT public.enterprise_provider_secret_resolve_for_receipt(
    $1,$2,3,$3,$4,$5,$6,$7) value`, [ids.receipt, ids.token, ids.key, ids.org, provider, secretRef, safeFingerprint])).rows[0].value, secretValue);
  await expectRejected(() => authority(db, `SELECT public.enterprise_provider_secret_write(
    $1,$2,2,$3,$4,$5,$6,$7,$8)`, [ids.receipt, ids.token, ids.key, ids.org, provider, secretRef, safeFingerprint, secretValue]));
  await expectRejected(() => authority(db, `SELECT public.enterprise_provider_secret_write(
    $1,$2,3,$3,$4,$5,$6,$7,$8)`, [ids.receipt, ids.token, ids.key, ids.foreignOrg, provider, secretRef, safeFingerprint, secretValue]));
  await expectRejected(() => authority(db, `SELECT public.enterprise_provider_secret_write(
    $1,$2,3,$3,$4,$5,$6,$7,$8)`, [ids.receipt, ids.token, ids.key, ids.org, provider, secretRef, safeFingerprint, 'different-synthetic-secret']));

  await db.query(`INSERT INTO public.ai_provider_key_refs(id,org_id,provider,resolver_type,secret_ref,safe_fingerprint,status)
    VALUES($1,$2,$3,'server_reference',$4,$5,'active')`, [ids.key, ids.org, provider, secretRef, safeFingerprint]);
  assert.equal((await db.query('SELECT secret_backend_kind FROM public.ai_provider_key_refs WHERE id=$1', [ids.key])).rows[0].secret_backend_kind, 'supabase_vault');
  assert.equal((await authority(db, 'SELECT public.enterprise_provider_secret_resolve($1,$2,$3,$4,$5) value',
    [ids.key, ids.org, provider, secretRef, safeFingerprint])).rows[0].value, secretValue);
  await db.query(`INSERT INTO public.ai_provider_key_refs(id,org_id,provider,resolver_type,secret_ref,safe_fingerprint,status)
    VALUES($1,$2,$3,'server_reference',$4,$5,'active')`, [ids.legacyKey, ids.org, provider, legacyRef, fingerprint('legacy')]);
  assert.equal((await db.query('SELECT secret_backend_kind FROM public.ai_provider_key_refs WHERE id=$1', [ids.legacyKey])).rows[0].secret_backend_kind, null);

  const inventory = (await authority(db, 'SELECT public.enterprise_provider_secret_inventory($1,$2) value', [ids.exercise, ids.org])).rows[0].value;
  stage = 'observation';
  assert.deepEqual(inventory, [{ keyRefId: ids.key, provider, backendKind: 'supabase_vault', safeFingerprint, state: 'written' }]);
  assert.equal(JSON.stringify(inventory).includes(secretRef), false);
  const observed = (await authority(db, 'SELECT public.enterprise_provider_secret_observe($1,$2,$3,$4,$5) value',
    [ids.exercise, ids.key, ids.org, provider, safeFingerprint])).rows[0].value;
  assert.deepEqual(observed, { backendKind: 'supabase_vault', exists: true, fingerprintMatches: true, state: 'written' });
  assert.equal((await db.query(`SELECT has_function_privilege('authenticated','public.enterprise_provider_secret_resolve(uuid,uuid,text,text,text)','EXECUTE') value`)).rows[0].value, false);
  for (const role of ['anon', 'authenticated']) await expectRejected(async () => {
    await db.query('BEGIN');
    try {
      await db.query(`SET LOCAL ROLE ${role}`);
      await db.query('SELECT public.enterprise_provider_secret_resolve($1,$2,$3,$4,$5)', [ids.key, ids.org, provider, secretRef, safeFingerprint]);
    } finally { await db.query('ROLLBACK'); }
  });
  await db.query("UPDATE public.enterprise_ai_command_receipts SET execution_plan=jsonb_set(execution_plan,'{cleanupRequired}','true'::jsonb) WHERE id=$1", [ids.receipt]);
  await expectRejected(() => authority(db, `SELECT public.enterprise_provider_secret_delete_for_receipt(
    $1,$2,3,$3,$4,$5,$6,$7)`, [ids.receipt, ids.token, ids.key, ids.org, provider, secretRef, safeFingerprint]));

  await db.query("UPDATE public.authenticated_synthetic_exercises SET lifecycle='quiesced',quiesced_at=statement_timestamp() WHERE id=$1", [ids.exercise]);
  stage = 'cleanup';
  await db.query("UPDATE public.ai_provider_key_refs SET status='retired' WHERE id=$1", [ids.key]);
  const staleClaim = (await authority(db, 'SELECT public.enterprise_ai_claim_provider_secret_cleanup_job($1) value', [ids.token])).rows[0].value;
  assert.equal(staleClaim.backendKind, 'supabase_vault'); assert.equal(staleClaim.safeFingerprint, safeFingerprint);
  await concurrentDb.query('BEGIN');
  let activeRefRejected = false;
  try {
    await concurrentDb.query("UPDATE public.ai_provider_key_refs SET status='active' WHERE id=$1", [ids.key]);
    await concurrentDb.query('SET LOCAL ROLE service_role');
    await concurrentDb.query(`SELECT public.enterprise_provider_secret_delete_for_cleanup(
      $1,$2,$3,$4,$5,$6,$7,$8)`, [staleClaim.jobId, ids.token, staleClaim.executionFence, ids.key, ids.org, provider, secretRef, safeFingerprint]);
  } catch { activeRefRejected = true; }
  finally { await concurrentDb.query('ROLLBACK'); }
  assert.equal(activeRefRejected, true);
  await db.query("UPDATE public.enterprise_provider_secret_cleanup_jobs SET lease_expires_at=statement_timestamp()-interval '1 second' WHERE id=$1", [staleClaim.jobId]);
  const claim = (await authority(db, 'SELECT public.enterprise_ai_claim_provider_secret_cleanup_job($1) value', [ids.takeoverToken])).rows[0].value;
  assert.equal(Number(claim.executionFence), Number(staleClaim.executionFence) + 1);
  await expectRejected(() => authority(db, `SELECT public.enterprise_provider_secret_delete_for_cleanup(
    $1,$2,$3,$4,$5,$6,$7,$8)`, [staleClaim.jobId, ids.token, staleClaim.executionFence, ids.key, ids.org, provider, secretRef, safeFingerprint]));
  await expectRejected(() => authority(db, `SELECT public.enterprise_provider_secret_delete_for_cleanup(
    $1,$2,$3,$4,$5,$6,$7,$8)`, [claim.jobId, ids.takeoverToken, Number(claim.executionFence) + 1, ids.key, ids.org, provider, secretRef, safeFingerprint]));
  const deleted = (await authority(db, `SELECT public.enterprise_provider_secret_delete_for_cleanup(
    $1,$2,$3,$4,$5,$6,$7,$8) value`, [claim.jobId, ids.takeoverToken, claim.executionFence, ids.key, ids.org, provider, secretRef, safeFingerprint])).rows[0].value;
  assert.equal(deleted.outcome, 'deleted');
  const absentDelete = (await authority(db, `SELECT public.enterprise_provider_secret_delete_for_cleanup(
    $1,$2,$3,$4,$5,$6,$7,$8) value`, [claim.jobId, ids.takeoverToken, claim.executionFence, ids.key, ids.org, provider, secretRef, safeFingerprint])).rows[0].value;
  assert.equal(absentDelete.outcome, 'absent');
  const finalObserved = (await authority(db, 'SELECT public.enterprise_provider_secret_observe($1,$2,$3,$4,$5) value',
    [ids.exercise, ids.key, ids.org, provider, safeFingerprint])).rows[0].value;
  assert.deepEqual(finalObserved, { backendKind: 'supabase_vault', exists: false, fingerprintMatches: false, state: 'deleted' });
  await authority(db, 'SELECT public.enterprise_ai_complete_provider_secret_cleanup_job($1,$2,$3)', [claim.jobId, ids.takeoverToken, claim.executionFence]);
  assert.equal((await db.query('SELECT count(*)::int count FROM vault.secrets')).rows[0].count, 0);
  assert.equal((await db.query('SELECT secret_backend_kind FROM public.ai_provider_key_refs WHERE id=$1', [ids.legacyKey])).rows[0].secret_backend_kind, null);
  console.log('supabase provider-secret PostgreSQL: actual Vault write/replay, exact recovery, tenant/fence denial, value-free observation, and quiesced cleanup passed');
} catch (error) {
  const code = /^[0-9A-Z]{5}$/.test(error?.code ?? '') ? error.code
    : error?.code === 'ERR_ASSERTION' ? 'ASSERTION' : 'UNAVAILABLE';
  throw new Error(`SUPABASE_PROVIDER_SECRET_BACKEND_POSTGRES_FAILED:${stage}:${code}`);
} finally {
  if (concurrentDb) await concurrentDb.end().catch(() => {});
  if (db) await db.end().catch(() => {});
  if (created) await admin.query(`DROP DATABASE ${database} WITH (FORCE)`).catch(() => {});
  await admin.end().catch(() => {});
}
