import { createHash, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const SUPABASE_ROOT_CA_RELATIVE_PATH = 'testing/process-lifecycle/trust/supabase-prod-ca-2021.crt';
export const SUPABASE_ROOT_CA_SOURCE = 'https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt';
export const SUPABASE_ROOT_CA_RAW_SHA256 = '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7';
export const SUPABASE_ROOT_CA_DER_SHA256 = '807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa';
export const SUPABASE_ROOT_CA_FINGERPRINT_256 = '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA';
export const SUPABASE_ROOT_CA_SUBJECT = 'C=US\nST=Delware\nL=New Castle\nO=Supabase Inc\nCN=Supabase Root 2021 CA';
export const SUPABASE_ROOT_CA_MINIMUM_REMAINING_MS = 365 * 24 * 60 * 60 * 1000;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const REMOTE_SUPABASE_HOST = /^(?:db[.][a-z0-9]{20}[.]supabase[.]co|[a-z0-9]+(?:-[a-z0-9]+)*[.]pooler[.]supabase[.]com)$/u;
const PEM_CERTIFICATE = /^-----BEGIN CERTIFICATE-----\n(?:[A-Za-z0-9+/]{1,64}\n)+[A-Za-z0-9+/]{1,64}={0,2}\n-----END CERTIFICATE-----\n$/u;
const CERTIFICATE_SIGNING_KEY_USAGE_DER = Buffer.from('300b0603551d0f040403020106', 'hex');

function fail(code) { throw new Error(code); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function decode(value) {
  try { return decodeURIComponent(value); } catch { fail('PR_C_CONTROLLED_HUMAN_DATABASE_URL_REJECTED'); }
}

export function validatePinnedSupabaseRootCa(pemBytes, { now = Date.now() } = {}) {
  const bytes = Buffer.isBuffer(pemBytes) ? pemBytes : Buffer.from(pemBytes ?? '');
  if (bytes.length < 1024 || bytes.length > 4096 || bytes.includes(0)
    || bytes.toString('utf8').includes('PRIVATE KEY') || !PEM_CERTIFICATE.test(bytes.toString('utf8'))
    || (bytes.toString('utf8').match(/-----BEGIN CERTIFICATE-----/gu) ?? []).length !== 1
    || (bytes.toString('utf8').match(/-----END CERTIFICATE-----/gu) ?? []).length !== 1) {
    fail('PR_C_CONTROLLED_HUMAN_DATABASE_CA_FORMAT_REJECTED');
  }
  if (bytes.length !== 1367 || sha256(bytes) !== SUPABASE_ROOT_CA_RAW_SHA256) {
    fail('PR_C_CONTROLLED_HUMAN_DATABASE_CA_RAW_DIGEST_REJECTED');
  }
  let certificate;
  try { certificate = new X509Certificate(bytes); } catch { fail('PR_C_CONTROLLED_HUMAN_DATABASE_CA_X509_REJECTED'); }
  if (sha256(certificate.raw) !== SUPABASE_ROOT_CA_DER_SHA256
    || certificate.fingerprint256 !== SUPABASE_ROOT_CA_FINGERPRINT_256
    || certificate.subject !== SUPABASE_ROOT_CA_SUBJECT || certificate.issuer !== SUPABASE_ROOT_CA_SUBJECT) {
    fail('PR_C_CONTROLLED_HUMAN_DATABASE_CA_IDENTITY_REJECTED');
  }
  if (!certificate.ca || !certificate.verify(certificate.publicKey)
    || !certificate.raw.includes(CERTIFICATE_SIGNING_KEY_USAGE_DER)) {
    fail('PR_C_CONTROLLED_HUMAN_DATABASE_CA_AUTHORITY_REJECTED');
  }
  const current = Number(now); const validFrom = Date.parse(certificate.validFrom); const validTo = Date.parse(certificate.validTo);
  if (!Number.isFinite(current) || current < validFrom || current > validTo) {
    fail('PR_C_CONTROLLED_HUMAN_DATABASE_CA_CURRENT_TIME_REJECTED');
  }
  if (validTo - current < SUPABASE_ROOT_CA_MINIMUM_REMAINING_MS) {
    fail('PR_C_CONTROLLED_HUMAN_DATABASE_CA_NEAR_EXPIRY_REJECTED');
  }
  return Object.freeze({ pem: bytes.toString('utf8'), rawSha256: SUPABASE_ROOT_CA_RAW_SHA256,
    derSha256: SUPABASE_ROOT_CA_DER_SHA256, fingerprint256: certificate.fingerprint256,
    subject: certificate.subject, issuer: certificate.issuer, validFrom, validTo, source: SUPABASE_ROOT_CA_SOURCE });
}

export function loadPinnedSupabaseRootCa({ root = process.cwd(), now = Date.now() } = {}) {
  let bytes;
  try { bytes = readFileSync(join(root, SUPABASE_ROOT_CA_RELATIVE_PATH)); }
  catch { fail('PR_C_CONTROLLED_HUMAN_DATABASE_CA_REQUIRED'); }
  return validatePinnedSupabaseRootCa(bytes, { now });
}

export function parseControlledHumanPostgresConnectionString(connectionString, { allowLoopback = true } = {}) {
  let parsed;
  try { parsed = new URL(connectionString); } catch { fail('PR_C_CONTROLLED_HUMAN_DATABASE_URL_REJECTED'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || parsed.hash !== '') fail('PR_C_CONTROLLED_HUMAN_DATABASE_URL_REJECTED');
  const host = parsed.hostname;
  const loopback = LOOPBACK_HOSTS.has(host);
  const rawEntries = [...parsed.searchParams.entries()];
  if (rawEntries.some(([key]) => key !== key.toLowerCase())) fail('PR_C_CONTROLLED_HUMAN_DATABASE_TLS_REJECTED');
  const entries = rawEntries.map(([key, value]) => [key, value.toLowerCase()]);
  const forbidden = new Set(['uselibpqcompat', 'ssl', 'rejectunauthorized', 'sslcert', 'sslkey', 'sslrootcert']);
  if (entries.some(([key]) => forbidden.has(key))) fail('PR_C_CONTROLLED_HUMAN_DATABASE_TLS_REJECTED');
  const modes = entries.filter(([key]) => key === 'sslmode').map(([, value]) => value);
  if (loopback) {
    if (!allowLoopback || entries.length !== 0) fail('PR_C_CONTROLLED_HUMAN_DATABASE_TLS_REJECTED');
  } else {
    if (modes.length !== 1 || modes[0] !== 'verify-full' || entries.some(([key]) => key !== 'sslmode')) fail('PR_C_CONTROLLED_HUMAN_DATABASE_TLS_REQUIRED');
    if (!REMOTE_SUPABASE_HOST.test(host) || !['', '5432', '6543'].includes(parsed.port)) fail('PR_C_CONTROLLED_HUMAN_DATABASE_HOST_REJECTED');
  }
  const database = decode(parsed.pathname.slice(1)); const user = decode(parsed.username); const password = decode(parsed.password);
  if (!host || !database || database.includes('/') || !user || !password) fail('PR_C_CONTROLLED_HUMAN_DATABASE_URL_REJECTED');
  return Object.freeze({ host, port: parsed.port === '' ? 5432 : Number(parsed.port), database, user, password, loopback });
}

export function validatePrivilegedPostgresConnectionString(connectionString, options) {
  parseControlledHumanPostgresConnectionString(connectionString, options);
  return true;
}

export function createControlledHumanPostgresClientConfig(connectionString, {
  allowLoopback = true, applicationName, root = process.cwd(), now = Date.now(), connectionTimeoutMillis,
} = {}) {
  if (typeof applicationName !== 'string' || !/^[a-z][a-z0-9_]{0,62}$/u.test(applicationName)) {
    fail('PR_C_CONTROLLED_HUMAN_DATABASE_APPLICATION_NAME_REJECTED');
  }
  const connection = parseControlledHumanPostgresConnectionString(connectionString, { allowLoopback });
  if (connectionTimeoutMillis !== undefined
    && (!Number.isSafeInteger(connectionTimeoutMillis) || connectionTimeoutMillis < 1 || connectionTimeoutMillis > 120000)) {
    fail('PR_C_CONTROLLED_HUMAN_DATABASE_TIMEOUT_REJECTED');
  }
  const config = { host: connection.host, port: connection.port, database: connection.database,
    user: connection.user, password: connection.password, application_name: applicationName,
    ...(connectionTimeoutMillis === undefined ? {} : { connectionTimeoutMillis }) };
  if (connection.loopback) return Object.freeze(config);
  const authority = loadPinnedSupabaseRootCa({ root, now });
  return Object.freeze({ ...config, ssl: Object.freeze({ ca: authority.pem, rejectUnauthorized: true, servername: connection.host }) });
}

export const buildControlledHumanPostgresClientConfig = createControlledHumanPostgresClientConfig;

function main() {
  if (process.argv[2] !== 'verify-ca' || process.argv.length !== 3) fail('usage: prCControlledHumanPostgresTls.mjs verify-ca');
  const authority = loadPinnedSupabaseRootCa();
  process.stdout.write(`${JSON.stringify({ status: 'passed', certificatePath: SUPABASE_ROOT_CA_RELATIVE_PATH,
    source: authority.source, rawSha256: authority.rawSha256, derSha256: authority.derSha256,
    fingerprint256: authority.fingerprint256, validFrom: new Date(authority.validFrom).toISOString(),
    validTo: new Date(authority.validTo).toISOString(), minimumRemainingDays: SUPABASE_ROOT_CA_MINIMUM_REMAINING_MS / 86400000 })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'PR_C_CONTROLLED_HUMAN_DATABASE_CA_VERIFY_FAILED'}\n`);
    process.exitCode = 1;
  }
}
