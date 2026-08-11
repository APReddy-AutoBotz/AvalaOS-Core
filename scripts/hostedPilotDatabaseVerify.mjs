import process from 'node:process';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { loadCanonicalMigrationInventory } from './hostedPilotActivation.mjs';
const { Client } = pg;

// Service-only hosted closure routines are derived from the repository contract,
// not from the live ACL (which may itself be the drift under investigation).
export const SERVICE_ONLY_HOSTED_RPCS = Object.freeze([
  'hosted_pilot_bootstrap_synthetic(uuid,uuid,uuid,bigint,text)',
  'hosted_pilot_simulate_provider(uuid,uuid,uuid,bigint,text,text,text)',
  'hosted_pilot_provision_recovery_operator(uuid,uuid,uuid,bigint,uuid)',
  'pilot_operations_command(uuid,uuid,uuid,text,uuid,text,text,bigint,bigint,jsonb)',
  'pilot_operations_ingest_recovery_evidence(uuid,uuid,uuid,text,text,text,text,text,text,uuid)',
  'pilot_operations_projection(uuid,uuid,uuid,bigint)',
]);

export function assertExactMigrationLedger(rows, canonical) {
  if (rows.length !== canonical.migrations.length) throw new Error('HOSTED_PILOT_MIGRATION_LEDGER_MISMATCH');
  rows.forEach((row, index) => {
    const expected = canonical.migrations[index];
    if (row.filename !== expected.name || row.content_sha256 !== expected.sha256) throw new Error('HOSTED_PILOT_MIGRATION_LEDGER_MISMATCH');
  });
}

export function assertServiceOnlyRoutineCatalog(rows, expected = SERVICE_ONLY_HOSTED_RPCS) {
  if (rows.length !== expected.length) throw new Error('HOSTED_PILOT_RPC_ACL_MISMATCH');
  const byIdentity = new Map(rows.map(row => [row.identity, row]));
  for (const identity of expected) {
    const row = byIdentity.get(identity);
    if (!row || row.owner !== 'postgres' || row.security_definer !== true
      || row.safe_search_path !== true || row.public_execute || row.anon_execute
      || row.authenticated_execute || !row.service_role_execute) throw new Error('HOSTED_PILOT_RPC_ACL_MISMATCH');
  }
}

export async function verifyHostedPilotDatabase(client, canonical, expectedTargetFingerprint, expectedReleaseSha) {
  canonical ??= await loadCanonicalMigrationInventory();
  if (!/^[0-9a-f]{40}$/.test(expectedReleaseSha ?? '')) throw new Error('HOSTED_PILOT_RELEASE_SHA_REQUIRED');
  if (!/^sha256:[0-9a-f]{64}$/.test(expectedTargetFingerprint ?? '')) throw new Error('HOSTED_PILOT_TARGET_FINGERPRINT_REQUIRED');
  const identity=(await client.query(`SELECT (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier,
    current_database() AS database_name,current_user AS database_role`)).rows[0];
  const actualTargetFingerprint=`sha256:${createHash('sha256').update(`${identity.system_identifier}\0${identity.database_name}\0${identity.database_role}`).digest('hex')}`;
  if (actualTargetFingerprint!==expectedTargetFingerprint) throw new Error('HOSTED_PILOT_TARGET_FINGERPRINT_MISMATCH');
  const expectedMigrationTip = canonical.tip.slice(0, 14);
  const marker = (await client.query(`SELECT product_key,environment_class,migration_tip,production_authorized,
    customer_data_authorized,real_provider_calls_authorized FROM public.hosted_pilot_environment_identity WHERE singleton`)).rows[0];
  if (!marker || marker.product_key !== 'avalaos-core' || marker.environment_class !== 'hosted_nonproduction_pilot'
    || marker.migration_tip !== expectedMigrationTip || marker.production_authorized || marker.customer_data_authorized
    || marker.real_provider_calls_authorized) throw new Error('HOSTED_PILOT_IDENTITY_MISMATCH');

  const ledgerPresent = (await client.query(`SELECT to_regclass('avalaos_migrations.applied') IS NOT NULL AS present`)).rows[0]?.present;
  if (!ledgerPresent) throw new Error('HOSTED_PILOT_MIGRATION_LEDGER_MISMATCH');
  const ledger = (await client.query(`SELECT filename,content_sha256 FROM avalaos_migrations.applied ORDER BY applied_at,filename`)).rows;
  assertExactMigrationLedger(ledger, canonical);

  const names=['hosted_pilot_environment_identity','hosted_pilot_synthetic_subjects','hosted_pilot_provider_simulations'];
  const security=(await client.query(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
    WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[])`,[names])).rows;
  if (security.length!==names.length || security.some(row=>!row.relrowsecurity||!row.relforcerowsecurity)) throw new Error('HOSTED_PILOT_RLS_MISMATCH');
  for (const role of ['anon','authenticated']) for (const name of names) {
    const allowed=(await client.query(`SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') allowed`,[role,`public.${name}`])).rows[0].allowed;
    if (allowed) throw new Error('HOSTED_PILOT_GRANT_MISMATCH');
  }

  const subjectRows=(await client.query(`SELECT test_role,lifecycle,synthetic_only
    FROM public.hosted_pilot_synthetic_subjects ORDER BY test_role`)).rows;
  const requiredSubjectRoles=['cross_tenant','operator','owner','reviewer','revoked'];
  if (!requiredSubjectRoles.every(role=>subjectRows.some(row=>row.test_role===role&&row.synthetic_only===true))
    || subjectRows.some(row=>row.test_role==='revoked'&&row.lifecycle!=='revoked')) throw new Error('HOSTED_PILOT_TENANT_EVIDENCE_MISMATCH');
  const providerRows=(await client.query(`SELECT scenario,bool_and(zero_egress) AS zero_egress
    FROM public.hosted_pilot_provider_simulations GROUP BY scenario ORDER BY scenario`)).rows;
  for (const scenario of ['success','failure','timeout','revoked','rotated'])
    if (!providerRows.some(row=>row.scenario===scenario&&row.zero_egress===true)) throw new Error('HOSTED_PILOT_PROVIDER_EVIDENCE_MISMATCH');
  const operations=(await client.query(`SELECT
    (SELECT count(*)::integer FROM public.pilot_operations_recovery_evidence_ingestions
      WHERE workflow_name='Pilot Operations' AND workflow_head_sha=$1) AS recovery_evidence_count,
    (SELECT count(*)::integer FROM public.pilot_operations_rollback_events rollback
      JOIN public.pilot_operations_release_candidates candidate ON candidate.id=rollback.from_candidate_id
        AND candidate.org_id=rollback.org_id AND candidate.workspace_id=rollback.workspace_id
      WHERE candidate.git_sha=$1) AS rollback_event_count`,[expectedReleaseSha])).rows[0];
  if (Number(operations?.recovery_evidence_count)<1 || Number(operations?.rollback_event_count)<1)
    throw new Error('HOSTED_PILOT_RECOVERY_EVIDENCE_MISMATCH');

  const routines = (await client.query(`SELECT p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS identity,owner.rolname AS owner,
      p.prosecdef AS security_definer,
      coalesce(p.proconfig @> ARRAY['search_path=pg_catalog']::text[],false) AS safe_search_path,
      EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
        WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS public_execute,
      has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
      has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
      has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role_execute
    FROM unnest($1::regprocedure[]) wanted(oid)
    JOIN pg_proc p ON p.oid=wanted.oid JOIN pg_roles owner ON owner.oid=p.proowner
    ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)`, [SERVICE_ONLY_HOSTED_RPCS.map(name => `public.${name}`)])).rows;
  assertServiceOnlyRoutineCatalog(routines);
  return {status:'passed',migrationTip:marker.migration_tip,migrationCount:ledger.length,forcedRls:true,
    browserTableAuthority:false,browserServiceRpcAuthority:false,tenantAdversarial:true,
    providerSimulationZeroEgress:true,recoveryVerified:true,productionAuthorized:false};
}

async function main() {
  const url = process.env.HOSTED_PILOT_DATABASE_URL;
  if (!url) throw new Error('HOSTED_PILOT_DATABASE_URL is required (value is never logged)');
  const client = new Client({ connectionString: url, application_name: 'avalaos_hosted_pilot_verify' });
  await client.connect();
  try { process.stdout.write(`${JSON.stringify(await verifyHostedPilotDatabase(client,undefined,
    process.env.HOSTED_PILOT_TARGET_FINGERPRINT,process.env.EXPECTED_RELEASE_SHA))}\n`); }
  finally { await client.end(); }
}
if (import.meta.url === new URL(`file://${process.argv[1] ?? ''}`).href) await main();
