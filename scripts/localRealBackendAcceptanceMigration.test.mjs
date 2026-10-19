import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { createAuthenticatedHostedPostgresAdapter } from './authenticatedHostedControllerAdapters.mjs';

const migrationPath = 'supabase/migrations/20261019161723_local_real_backend_authenticated_acceptance.sql';
const sql = readFileSync(migrationPath, 'utf8').replaceAll('\r\n', '\n');
const digest = value => `sha256:${value.repeat(64)}`;

const requiredIdentityForwardFunctions = Object.freeze([
  'synthetic_ai_campaign_activate_final_continuation',
  'synthetic_ai_campaign_bootstrap',
  'pr_c_controlled_human_assert_marker',
  'synthetic_ai_campaign_activate_brd_v3_quality_validation',
  'authenticated_synthetic_exercise_activate',
  'enterprise_provider_secret_write',
  'enterprise_provider_secret_resolve',
  'enterprise_provider_secret_resolve_for_receipt',
  'enterprise_provider_secret_observe',
  'enterprise_provider_secret_inventory',
  'enterprise_provider_secret_delete_for_receipt',
  'enterprise_provider_secret_delete_for_cleanup',
]);

test('local real-backend migration binds exact identity without weakening hosted authority', () => {
  for (const marker of [
    "marker.migration_tip <> '20261011053000'",
    "SET migration_tip='20261019161723'",
    "CHECK(migration_tip='20261019161723')",
    "execution_kind text NOT NULL DEFAULT 'hosted_authenticated_synthetic'",
    "execution_kind='local_real_backend_authenticated'",
    "deployment_id IS NULL",
    "origin='http://127.0.0.1:4173'",
    'AND build_digest IS NOT NULL',
    "build_digest~'^sha256:[0-9a-f]{64}$'",
    "profile_version='local-real-backend-authenticated-profile-v1'",
    "execution_kind='hosted_authenticated_synthetic'",
    'AND deployment_id IS NOT NULL',
    "deployment_id~'^[0-9a-f]{24}$'",
    "origin='https://avalaos-pilot.netlify.app'",
    'AND build_digest IS NULL',
    'authenticated_synthetic_local_exercise_activate',
    'p_release_sha IS NULL',
    'p_build_digest IS NULL',
    'p_source_digest IS NULL',
    "p_migration_tip<>'20261019161723'",
    'OR marker.production_authorized',
    'OR marker.customer_data_authorized',
    'OR marker.real_provider_calls_authorized',
    'OR studio.provider_enabled',
    'OR enterprise.provider_enabled',
    "'executionKind',exercise.execution_kind",
    "'buildDigest',exercise.build_digest",
  ]) assert.ok(sql.includes(marker), `missing local acceptance identity contract: ${marker}`);

  for (const functionName of requiredIdentityForwardFunctions) {
    assert.ok(sql.includes(`public.${functionName}`), `missing exact-tip forward function: ${functionName}`);
  }
  assert.equal((sql.match(/::regprocedure,/gu) ?? []).length + (sql.match(/::regprocedure\n/gu) ?? []).length, 12);
  assert.match(sql, /old_count<>1 OR new_count<>0/u);
  assert.match(sql, /CHECK\(migration_tip IN\('20261010144356','20261011053000','20261019161723'\)\)/u);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION[\s\S]*authenticated_synthetic_local_exercise_activate[\s\S]*FROM PUBLIC,anon,authenticated;/u);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION[\s\S]*authenticated_synthetic_local_exercise_activate[\s\S]*TO service_role;/u);
  assert.doesNotMatch(sql, /GRANT EXECUTE[^;]+TO (?:PUBLIC|anon|authenticated)/iu);
  assert.doesNotMatch(sql, /UPDATE public\.(?:enterprise_intelligence|studio_artifact)_runtime_control/iu);
  assert.doesNotMatch(sql, /provider_enabled\s*=\s*true/iu);
});

test('local observation uses stored build identity while hosted observation keeps deployment identity', () => {
  const localBranch = sql.slice(sql.indexOf("CASE WHEN exercise.execution_kind='local_real_backend_authenticated'"),
    sql.indexOf('ELSE', sql.indexOf("CASE WHEN exercise.execution_kind='local_real_backend_authenticated'")));
  const hostedBranch = sql.slice(sql.indexOf('ELSE', sql.indexOf("CASE WHEN exercise.execution_kind='local_real_backend_authenticated'")),
    sql.indexOf('END,', sql.indexOf('ELSE', sql.indexOf("CASE WHEN exercise.execution_kind='local_real_backend_authenticated'"))));
  assert.match(localBranch, /'executionKind',exercise\.execution_kind/u);
  assert.match(localBranch, /'buildDigest',exercise\.build_digest/u);
  assert.doesNotMatch(localBranch, /deploymentIdHash/u);
  assert.match(hostedBranch, /deploymentIdHash/u);
  assert.doesNotMatch(hostedBranch, /'buildDigest'/u);
  assert.doesNotMatch(hostedBranch, /'executionKind'/u);
});

const adapterConfig = overrides => ({
  executionKind: 'local_real_backend_authenticated',
  buildDigest: digest('a'),
  scope: {
    organizationId: '10000000-0000-4000-8000-000000000001',
    workspaceId: '10000000-0000-4000-8000-000000000002',
  },
  ...overrides,
});
const activation = overrides => ({
  exerciseId: '10000000-0000-4000-8000-000000000003',
  releaseSha: 'b'.repeat(40),
  deploymentId: null,
  origin: 'http://127.0.0.1:4173',
  backendDigest: digest('c'),
  migrationVersion: '20261019161723',
  migrationDigest: digest('d'),
  exerciseDigest: digest('e'),
  profileVersion: 'local-real-backend-authenticated-profile-v1',
  catalogDigest: digest('f'),
  sourceDigest: digest('1'),
  organizationId: '10000000-0000-4000-8000-000000000001',
  workspaceId: '10000000-0000-4000-8000-000000000002',
  expiresAt: '2026-10-19T18:00:00.000Z',
  ...overrides,
});

test('PostgreSQL adapter selects only the strict local activation RPC for local config', async () => {
  const calls = [];
  const db = { query: async (statement, parameters = []) => {
    calls.push({ statement, parameters });
    return { rows: [{ value: { lifecycle: 'active' } }] };
  } };
  const adapter = createAuthenticatedHostedPostgresAdapter({
    config: adapterConfig(),
    db,
    verifyDeployment: async () => ({}),
    verifySecretBackend: async () => ({}),
  });
  await adapter.activate(activation());
  assert.equal(calls.length, 1);
  assert.match(calls[0].statement, /public\.authenticated_synthetic_local_exercise_activate\(/u);
  assert.equal(calls[0].parameters.length, 14);
  assert.equal(calls[0].parameters[2], digest('a'));
  assert.equal(calls[0].parameters[3], 'http://127.0.0.1:4173');

  await assert.rejects(() => createAuthenticatedHostedPostgresAdapter({
    config: adapterConfig({ buildDigest: null }), db,
    verifyDeployment: async () => ({}), verifySecretBackend: async () => ({}),
  }).activate(activation()), /AUTHENTICATED_HOSTED_LOCAL_REAL_BACKEND_ACTIVATION_IDENTITY_REJECTED/u);
  await assert.rejects(() => adapter.activate(activation({ deploymentId: 'a'.repeat(24) })),
    /AUTHENTICATED_HOSTED_LOCAL_REAL_BACKEND_ACTIVATION_IDENTITY_REJECTED/u);
});

test('PostgreSQL adapter preserves the hosted activation RPC', async () => {
  const calls = [];
  const db = { query: async (statement, parameters = []) => {
    calls.push({ statement, parameters });
    return { rows: [{ value: { lifecycle: 'active' } }] };
  } };
  const adapter = createAuthenticatedHostedPostgresAdapter({
    config: adapterConfig({ executionKind: 'hosted_authenticated_synthetic', buildDigest: null }),
    db,
    verifyDeployment: async () => ({}),
    verifySecretBackend: async () => ({}),
  });
  await adapter.activate(activation({
    deploymentId: '2'.repeat(24),
    origin: 'https://avalaos-pilot.netlify.app',
    migrationVersion: '20261019161723',
    profileVersion: 'hosted-authenticated-synthetic-profile-v3',
  }));
  assert.match(calls[0].statement, /public\.authenticated_synthetic_exercise_activate\(/u);
  assert.doesNotMatch(calls[0].statement, /local_exercise_activate/u);
  assert.equal(calls[0].parameters[2], '2'.repeat(24));
});
