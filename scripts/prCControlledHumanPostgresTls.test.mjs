import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { checkServerIdentity, rootCertificates } from 'node:tls';
import {
  SUPABASE_ROOT_CA_DER_SHA256, SUPABASE_ROOT_CA_FINGERPRINT_256, SUPABASE_ROOT_CA_RAW_SHA256,
  SUPABASE_ROOT_CA_RELATIVE_PATH, SUPABASE_ROOT_CA_SOURCE, createControlledHumanPostgresClientConfig,
  loadPinnedSupabaseRootCa, parseControlledHumanPostgresConnectionString, validatePinnedSupabaseRootCa,
  validatePrivilegedPostgresConnectionString,
} from './prCControlledHumanPostgresTls.mjs';

const exactPem = await readFile(SUPABASE_ROOT_CA_RELATIVE_PATH);
const remoteUrl = 'postgresql://postgres.abcdefghijklmnopqrst:p%40ss@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=verify-full';

test('one official Supabase Root 2021 CA is byte, DER, identity, authority, and lifetime pinned', () => {
  const authority = validatePinnedSupabaseRootCa(exactPem, { now: Date.parse('2026-09-05T00:00:00Z') });
  assert.equal(authority.rawSha256, SUPABASE_ROOT_CA_RAW_SHA256);
  assert.equal(authority.derSha256, SUPABASE_ROOT_CA_DER_SHA256);
  assert.equal(authority.fingerprint256, SUPABASE_ROOT_CA_FINGERPRINT_256);
  assert.equal(authority.subject, authority.issuer);
  assert.equal(authority.source, SUPABASE_ROOT_CA_SOURCE);
  assert.equal(loadPinnedSupabaseRootCa({ now: Date.parse('2026-09-05T00:00:00Z') }).rawSha256, SUPABASE_ROOT_CA_RAW_SHA256);
});

test('CA substitution, truncation, concatenation, private key material, invalid time, and near expiry fail closed', () => {
  const changed = Buffer.from(exactPem); changed[100] = changed[100] === 65 ? 66 : 65;
  for (const candidate of [changed, exactPem.subarray(0, -1), Buffer.concat([exactPem, exactPem]), Buffer.alloc(4097, 65), Buffer.from(rootCertificates[0]), Buffer.from(`${exactPem}-----BEGIN PRIVATE KEY-----\nAA==\n-----END PRIVATE KEY-----\n`)]) {
    assert.throws(() => validatePinnedSupabaseRootCa(candidate, { now: Date.parse('2026-09-05T00:00:00Z') }), /PR_C_CONTROLLED_HUMAN_DATABASE_CA_/u);
  }
  assert.throws(() => validatePinnedSupabaseRootCa(exactPem, { now: Date.parse('2020-01-01T00:00:00Z') }), /CA_CURRENT_TIME_REJECTED/u);
  assert.throws(() => validatePinnedSupabaseRootCa(exactPem, { now: Date.parse('2030-09-05T00:00:00Z') }), /CA_NEAR_EXPIRY_REJECTED/u);
  assert.throws(() => validatePinnedSupabaseRootCa(exactPem, { now: Number.NaN }), /CA_CURRENT_TIME_REJECTED/u);
});

test('remote configuration uses only discrete fields, the canonical hostname, and strict pinned TLS', () => {
  const parsed = parseControlledHumanPostgresConnectionString(remoteUrl, { allowLoopback: false });
  assert.deepEqual(parsed, { host: 'aws-0-ap-south-1.pooler.supabase.com', port: 6543, database: 'postgres', user: 'postgres.abcdefghijklmnopqrst', password: 'p@ss', loopback: false });
  const config = createControlledHumanPostgresClientConfig(remoteUrl, { allowLoopback: false, applicationName: 'avalaos_pr_c_test', now: Date.parse('2026-09-05T00:00:00Z'), connectionTimeoutMillis: 5000 });
  assert.equal(config.connectionString, undefined);
  assert.equal(config.host, parsed.host);
  assert.equal(config.ssl.servername, parsed.host);
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.ssl.checkServerIdentity, undefined, 'Node must retain its built-in hostname verifier');
  assert.equal(config.ssl.ca, exactPem.toString('utf8'));
  assert.equal(config.connectionTimeoutMillis, 5000);
  assert.equal(validatePrivilegedPostgresConnectionString(remoteUrl, { allowLoopback: false }), true);
  assert.ok(checkServerIdentity('example.invalid', new X509Certificate(exactPem)) instanceof Error);
  const direct = createControlledHumanPostgresClientConfig('postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full', {
    allowLoopback: false, applicationName: 'avalaos_pr_c_direct', now: Date.parse('2026-09-05T00:00:00Z'),
  });
  assert.equal(direct.host, 'db.abcdefghijklmnopqrst.supabase.co');
  assert.equal(direct.ssl.servername, direct.host);
});

test('loopback remains parameter-free and does not require or configure a CA', () => {
  const url = 'postgresql://postgres:postgres@127.0.0.1:55464/postgres';
  const config = createControlledHumanPostgresClientConfig(url, { applicationName: 'avalaos_pr_c_test', root: 'missing-root' });
  assert.equal(config.ssl, undefined);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(validatePrivilegedPostgresConnectionString(url), true);
});

test('ambiguous TLS, parameters, remote hosts, ports, fragments, credentials, and application names are rejected', () => {
  for (const url of [
    'postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres',
    'postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=require',
    'postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full&sslmode=verify-full',
    'postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=ca.pem',
    'postgresql://postgres:secret@example.invalid:5432/postgres?sslmode=verify-full',
    'postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:4444/postgres?sslmode=verify-full',
    'postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full#fragment',
    'postgresql://postgres@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full',
    'postgresql://postgres:secret@127.0.0.1:55464/postgres?sslmode=verify-full',
  ]) assert.throws(() => validatePrivilegedPostgresConnectionString(url), /PR_C_CONTROLLED_HUMAN_DATABASE_/u, url);
  assert.throws(() => createControlledHumanPostgresClientConfig(remoteUrl, { applicationName: 'avalaos_pr_c_test', root: 'missing-root' }), /CA_REQUIRED/u);
  assert.throws(() => createControlledHumanPostgresClientConfig(remoteUrl, { applicationName: 'bad-name' }), /APPLICATION_NAME_REJECTED/u);
  assert.throws(() => createControlledHumanPostgresClientConfig(remoteUrl, { applicationName: 'avalaos_pr_c_test', connectionTimeoutMillis: 120001 }), /TIMEOUT_REJECTED/u);
});
