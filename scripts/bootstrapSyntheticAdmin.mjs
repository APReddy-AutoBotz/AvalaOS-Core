import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields = ['AVALA_EXPLORATORY_ORGANIZATION_ID', 'AVALA_EXPLORATORY_WORKSPACE_ID', 'AVALA_EXPLORATORY_OPERATOR_ID'];

/** Private operator tool. No .env auto-loading, provisioning, or implicit target. */
export function readBootstrapBinding(env) {
  if (env.AVALA_EXPLORATORY_BOOTSTRAP_AUTHORIZATION !== 'approved-dedicated-synthetic-target') throw new Error('SYNTHETIC_TARGET_APPROVAL_REQUIRED');
  const origin = env.AVALA_EXPLORATORY_SUPABASE_URL;
  if (typeof origin !== 'string' || !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(origin)) throw new Error('SYNTHETIC_TARGET_INVALID');
  const values = fields.map(field => env[field]);
  if (values.some(value => typeof value !== 'string' || !UUID.test(value))) throw new Error('SYNTHETIC_BINDING_INVALID');
  const [organizationId, workspaceId, operatorId] = values;
  if (new Set(values).size !== 3) throw new Error('SYNTHETIC_BINDING_INVALID');
  const fingerprint = `sha256:${createHash('sha256').update(JSON.stringify([origin, organizationId, workspaceId, operatorId])).digest('hex')}`;
  if (env.AVALA_EXPLORATORY_EXPECTED_TARGET_FINGERPRINT !== fingerprint) throw new Error('SYNTHETIC_TARGET_FINGERPRINT_MISMATCH');
  return { origin, organizationId, workspaceId, operatorId, fingerprint };
}

export async function bootstrapSyntheticAdmin({ env, apply = false, fetchImpl = fetch }) {
  const binding = readBootstrapBinding(env);
  if (!apply) return { status: 'SYNTHETIC_BOOTSTRAP_CONFIGURATION_VALID', databaseChecked: false, applied: false };
  const serviceKey = env.AVALA_EXPLORATORY_SERVICE_ROLE_KEY;
  if (typeof serviceKey !== 'string' || serviceKey.length < 30 || /\s/.test(serviceKey)) throw new Error('SYNTHETIC_OPERATOR_CREDENTIAL_REQUIRED');
  // SQL requires exactly the one approved Auth UUID and an empty application
  // backend. Existing fixed-exercise, provider, customer or organization data
  // cannot be adopted. The initial Auth user is a separate approved operator step.
  try {
    const response = await fetchImpl(`${binding.origin}/rest/v1/rpc/synthetic_admin_bootstrap_operator`, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30_000),
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_actor: binding.operatorId, p_org: binding.organizationId,
        p_workspace: binding.workspaceId, p_fingerprint: binding.fingerprint }),
    });
    if (!response.ok) throw new Error('unconfirmed');
    const result = await response.json();
    if (!result || typeof result !== 'object' || Array.isArray(result)
      || Object.keys(result).some(key => !['status', 'targetId'].includes(key))
      || result.status !== 'configured' || typeof result.targetId !== 'string' || !UUID.test(result.targetId)) throw new Error('unconfirmed');
    return { status: 'SYNTHETIC_ADMIN_BOOTSTRAPPED', applied: true, refreshAuthorizationRequired: true };
  } catch {
    // Never print backend bodies, Auth selectors, credentials, or transport logs.
    // A lost response may have committed; do not repeat an unconfirmed mutation.
    throw new Error('SYNTHETIC_BOOTSTRAP_OUTCOME_UNCONFIRMED_RECONCILE_BEFORE_RETRY');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 1 || !['--check', '--apply'].includes(args[0])) throw new Error('USAGE_BOOTSTRAP_SYNTHETIC_ADMIN_CHECK_OR_APPLY');
    console.log(JSON.stringify(await bootstrapSyntheticAdmin({ env: process.env, apply: args[0] === '--apply' })));
  } catch (error) {
    console.error(error instanceof Error && /^(SYNTHETIC_|USAGE_)[A-Z_]+$/.test(error.message) ? error.message : 'SYNTHETIC_BOOTSTRAP_FAILED');
    process.exitCode = 1;
  }
}
