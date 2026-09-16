import assert from 'node:assert/strict';

export const PROJECTION_POSTGREST_IMAGE = 'public.ecr.aws/supabase/postgrest@sha256:bca3f86f69d8ef7aa1e5ee65e66ce9a20c6c147be637517a7be8399e102901d1';
export const PROJECTION_POSTGRES_IMAGE = 'postgres@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685';
export const PROJECTION_RPC_NAMES = Object.freeze(['enterprise_delivery_workspace_projection', 'enterprise_monitor_approved_baselines_projection']);
export const PROJECTION_RPC_CORRECTION = '20260916203406_projection_rpc_volatility_authority.sql';
export const PROJECTION_MIGRATION_REJECTION_CASES = Object.freeze([
  'projection-missing-marker','projection-duplicate-marker','projection-missing-predecessor-constraint',
  'projection-stale-marker','projection-ahead-marker','projection-unsafe-production_authorized',
  'projection-unsafe-customer_data_authorized','projection-unsafe-real_provider_calls_authorized',
  'projection-delivery-body-drift','projection-monitor-owner-drift','projection-delivery-acl-drift',
  'projection-monitor-config-drift','projection-delivery-security-drift','projection-monitor-volatility-drift',
  'projection-retained-recovery-history','projection-retained-exercise-history',
]);
export const PROJECTION_INTENTIONAL_IDENTITY_ADVANCE = 'hosted_pilot_environment_identity';
const CORE_AUTHORITY_TABLES = Object.freeze([
  'profiles','organizations','workspaces','organization_members','workspace_memberships',
  'roles','capabilities','role_capabilities','authorization_versions',
  'process_creation_workspace_controls','process_creation_template_registry',
]);
export function selectProjectionNoSideEffectTables(tableNames) {
  assert.ok(Array.isArray(tableNames));
  const unique = [...new Set(tableNames)];
  assert.equal(unique.length, tableNames.length);
  for (const name of unique) assert.match(name, /^[a-z][a-z0-9_]*$/);
  const selected = unique.filter(name => name.startsWith('enterprise_') || name.startsWith('assess')
    || name.startsWith('studio_') || name.startsWith('synthetic_') || name.startsWith('process_creation_')
    || ['audit_events','privileged_audit_events',...CORE_AUTHORITY_TABLES].includes(name)).sort();
  for (const name of CORE_AUTHORITY_TABLES) assert.ok(selected.includes(name), `Missing authority table ${name}`);
  assert.ok(!selected.includes(PROJECTION_INTENTIONAL_IDENTITY_ADVANCE));
  return selected;
}
export function selectProjectionRpcSubnet(occupiedPrefixes) {
  assert.ok(Array.isArray(occupiedPrefixes));
  const range = prefix => {
    assert.equal(typeof prefix, 'string');
    const match = /^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/.exec(prefix);
    assert.ok(match, 'Invalid IPv4 allocation');
    const octets = match.slice(1, 5).map(Number), bits = Number(match[5]);
    assert.ok(octets.every(n => n >= 0 && n <= 255) && bits >= 0 && bits <= 32);
    const address = octets.reduce((n, octet) => n * 256 + octet, 0), size = 2 ** (32 - bits);
    const start = Math.floor(address / size) * size;
    return {start, end: start + size - 1, bits};
  };
  // A default route is not an address allocation. All more-specific host and
  // Docker routes are excluded; never prune a network to make room.
  const occupied = occupiedPrefixes.map(range).filter(r => r.bits !== 0);
  for (let octet = 240; octet < 256; octet++) {
    const cidr = `10.249.${octet}.0/28`, candidate = range(cidr);
    if (occupied.every(r => candidate.end < r.start || candidate.start > r.end)) return cidr;
  }
  throw new Error('No non-overlapping isolated projection subnet is available');
}
export function projectionRpcHttpUrl(origin, name, method, args) {
  const base = new URL(origin);
  assert.equal(base.protocol, 'http:'); assert.equal(base.hostname, '127.0.0.1');
  assert.ok(base.port && base.pathname === '/' && !base.search && !base.hash && !base.username && !base.password);
  assert.ok(PROJECTION_RPC_NAMES.includes(name)); assert.ok(['POST', 'GET', 'HEAD'].includes(method));
  const url = new URL(`/rpc/${name}`, base);
  if (method !== 'POST') for (const [key, value] of Object.entries(args)) url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : value);
  return url;
}
export function assertProjectionRpcResult(value, name, scope) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  assert.equal(value.organizationId, scope.organizationId); assert.equal(value.workspaceId, scope.workspaceId);
  assert.equal(value.contractVersion, name === PROJECTION_RPC_NAMES[0] ? 'enterprise-delivery-workspace-2' : 'enterprise-monitor-approved-baselines-2');
  if (name === PROJECTION_RPC_NAMES[1]) { assert.equal(value.readOnly, true); assert.equal(value.liveTelemetryConnected, false); assert.deepEqual(value.actions, []); }
}
