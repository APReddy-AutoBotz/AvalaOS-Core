import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { classifyHostedTarget, createPreflightToken } from './hostedPilotActivation.mjs';
import { runHostedPilotApply } from './hostedPilotApply.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');

test('canonical apply entrypoint reaches locked live re-inventory without a missing classifier binding', async () => {
  const canonical = { digest: 'd'.repeat(64), tip: '20260811150000_entrypoint.sql', migrations: [], count: 0 };
  const inventory = { schemas: ['public', 'auth'], tables: [], appliedMigrations: [], authUserCount: 0 };
  const classification = classifyHostedTarget(inventory, canonical);
  const identity = { system_identifier: 'system-1', database_name: 'pilot', database_role: 'service_role' };
  const environmentFingerprint = sha256(`${identity.system_identifier}\0${identity.database_name}\0${identity.database_role}`);
  const args = { classification, canonical, expectedReleaseSha: 'a'.repeat(40), environmentFingerprint, nonce: 'entrypoint-lock-test', signingKey: 'test-signing-key' };
  const token = createPreflightToken(args);
  const calls = [];
  const client = { query: async (sql) => {
    calls.push(String(sql));
    if (String(sql).includes('pg_control_system')) return { rows: [identity] };
    if (String(sql).includes('select count(*) from pg_namespace')) return { rows: [{schemas:2,relations:0,routines:0}] };
    if (String(sql).includes('from pg_namespace')) return { rows: [{ nspname: 'auth' }, { nspname: 'public' }] };
    if (String(sql).includes('from pg_class')) return { rows: [] };
    if (String(sql).includes('p.prokind as kind')) return { rows: [] };
    if (String(sql).includes('from pg_proc p')) return { rows: ['bytea, text','text, text'].map(identity_arguments=>({schema_name:'public',identity_arguments,language_name:'c',source:'digest',provolatile:'i',proisstrict:true,proparallel:'s',configuration:[],owner_name:'postgres',current_user_name:'postgres',extension_name:'pgcrypto',extension_owner:'postgres',public_execute:false,anon_execute:false,authenticated_execute:false,service_execute:true})) };
    if (String(sql).includes("to_regclass('auth.users')")) return { rows: [{ count: 0 }] };
    if (String(sql).includes("to_regclass('avalaos_migrations.applied')")) return { rows: [{ present: false }] };
    if (String(sql).includes('to_regprocedure')) return { rows: [{ public_text_digest: false, public_bytea_digest: false, extensions_text_digest: false, extensions_bytea_digest: false }] };
    return { rows: [] };
  } };
  const result = await runHostedPilotApply({ client, inventory, token, expectedReleaseSha: args.expectedReleaseSha, environmentFingerprint, nonce: args.nonce, signingKey: args.signingKey, canonical, resolveCheckoutSha: () => args.expectedReleaseSha });
  assert.equal(result.appliedCount, 0);
  assert.ok(calls[0].includes('pg_advisory_lock'));
  assert.ok(calls.some(sql => sql.includes('pg_control_system')), 'locked connected-target inventory must execute');
});
