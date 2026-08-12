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
  'hosted_pilot_record_verification_result(uuid,uuid,uuid,text,text,text,bigint,text,text,uuid,bigint)',
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

export function assertAuthorityTableCatalog(rows) {
  if (!rows.length || rows.some(row => row.owner !== 'postgres' || !row.rls_enabled || !row.force_rls
    || row.public_mutation || row.anon_mutation || row.authenticated_mutation)) throw new Error('HOSTED_PILOT_AUTHORITY_TABLE_MISMATCH');
}

export function assertOwnerOnlyEvidenceTableCatalog(rows) {
  const expected = ['hosted_pilot_exercise_evidence_families','hosted_pilot_verification_run_results'];
  if (rows.length !== expected.length) throw new Error('HOSTED_PILOT_EVIDENCE_TABLE_ACL_MISMATCH');
  const byName = new Map(rows.map(row => [row.relname,row]));
  for (const relname of expected) {
    const row = byName.get(relname);
    if (!row || row.owner !== 'postgres' || !row.rls_enabled || !row.force_rls
      || row.public_mutation || row.anon_mutation || row.authenticated_mutation || row.service_role_mutation)
      throw new Error('HOSTED_PILOT_EVIDENCE_TABLE_ACL_MISMATCH');
  }
}

export function assertSecurityDefinerCatalog(rows) {
  if (!rows.length || rows.some(row => row.owner !== 'postgres' || !['pg_catalog','pg_catalog,public'].includes(row.search_path)
    || row.public_execute || row.anon_execute
    || (/^pilot_operations_command_v\d+\(/.test(row.identity) && (row.authenticated_execute||row.service_role_execute))))
    throw new Error('HOSTED_PILOT_SECURITY_DEFINER_MISMATCH');
}

export async function verifyHostedPilotDatabase(client, canonical, expectedTargetFingerprint, expectedReleaseSha, scope = {}) {
  canonical ??= await loadCanonicalMigrationInventory();
  if (!/^[0-9a-f]{40}$/.test(expectedReleaseSha ?? '')) throw new Error('HOSTED_PILOT_RELEASE_SHA_REQUIRED');
  if (!/^sha256:[0-9a-f]{64}$/.test(expectedTargetFingerprint ?? '')) throw new Error('HOSTED_PILOT_TARGET_FINGERPRINT_REQUIRED');
  for (const [name,value] of Object.entries({organizationId:scope.organizationId,workspaceId:scope.workspaceId,exerciseRunId:scope.exerciseRunId}))
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(value ?? '')) throw new Error(`HOSTED_PILOT_${name.replace(/[A-Z]/g,c=>`_${c}`).toUpperCase()}_REQUIRED`);
  if(!/^[1-9][0-9]{0,19}$/.test(scope.producerRunId??'') || !Number.isSafeInteger(Number(scope.producerRunAttempt)) || Number(scope.producerRunAttempt)<1
    || !/^sha256:[0-9a-f]{64}$/.test(scope.deploymentFingerprint??'')) throw new Error('HOSTED_PILOT_EXECUTED_RUN_BINDING_REQUIRED');
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

  const authorityTables=(await client.query(`SELECT c.relname,owner.rolname owner,c.relrowsecurity rls_enabled,c.relforcerowsecurity force_rls,
      EXISTS (SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
        WHERE acl.grantee=0 AND acl.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')) public_mutation,
      has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') anon_mutation,
      has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') authenticated_mutation,
      has_table_privilege('service_role',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') service_role_mutation
    FROM pg_class c JOIN pg_roles owner ON owner.oid=c.relowner
    WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p') ORDER BY c.relname`)).rows;
  assertAuthorityTableCatalog(authorityTables);
  assertOwnerOnlyEvidenceTableCatalog(authorityTables.filter(row=>
    row.relname==='hosted_pilot_exercise_evidence_families'||row.relname==='hosted_pilot_verification_run_results'));

  const subjectRows=(await client.query(`SELECT test_role,lifecycle,synthetic_only
    FROM public.hosted_pilot_synthetic_subjects WHERE org_id=$1 AND workspace_id=$2 ORDER BY test_role`,[scope.organizationId,scope.workspaceId])).rows;
  const requiredSubjectRoles=['cross_tenant','operator','owner','reviewer','revoked'];
  if (!requiredSubjectRoles.every(role=>subjectRows.some(row=>row.test_role===role&&row.synthetic_only===true))
    || subjectRows.some(row=>row.test_role==='revoked'&&row.lifecycle!=='revoked')) throw new Error('HOSTED_PILOT_TENANT_EVIDENCE_MISMATCH');
  const providerRows=(await client.query(`SELECT scenario,bool_and(zero_egress) AS zero_egress
    FROM public.hosted_pilot_provider_simulations WHERE org_id=$1 AND workspace_id=$2 GROUP BY scenario ORDER BY scenario`,[scope.organizationId,scope.workspaceId])).rows;
  for (const scenario of ['success','failure','timeout','revoked','rotated'])
    if (!providerRows.some(row=>row.scenario===scenario&&row.zero_egress===true)) throw new Error('HOSTED_PILOT_PROVIDER_EVIDENCE_MISMATCH');
  const operations=(await client.query(`SELECT
    (SELECT count(*)::integer FROM public.pilot_operations_recovery_evidence_ingestions
      WHERE org_id=$2 AND workspace_id=$3 AND workflow_name='Pilot Operations' AND workflow_head_sha=$1) AS recovery_evidence_count,
    (SELECT count(*)::integer FROM public.pilot_operations_rollback_events rollback
      JOIN public.pilot_operations_release_candidates candidate ON candidate.id=rollback.from_candidate_id
        AND candidate.org_id=rollback.org_id AND candidate.workspace_id=rollback.workspace_id
      WHERE candidate.git_sha=$1 AND rollback.org_id=$2 AND rollback.workspace_id=$3) AS rollback_event_count,
    (SELECT count(*)::integer FROM public.hosted_pilot_recovery_operators operator
      JOIN public.profiles profile ON profile.id=operator.actor_id AND profile.status='active' AND profile.deleted_at IS NULL
      JOIN public.organization_members organization_member ON organization_member.org_id=operator.org_id AND organization_member.user_id=operator.actor_id
        AND organization_member.status='active' AND organization_member.disabled_at IS NULL AND organization_member.deleted_at IS NULL
      JOIN public.workspace_memberships membership ON membership.org_id=operator.org_id AND membership.workspace_id=operator.workspace_id
        AND membership.user_id=operator.actor_id AND membership.role_id=operator.role_id AND membership.status='active'
        AND membership.disabled_at IS NULL AND membership.deleted_at IS NULL
      JOIN public.roles role ON role.id=operator.role_id AND role.id=membership.role_id AND role.org_id=operator.org_id
        AND role.workspace_id=operator.workspace_id AND role.scope='workspace' AND role.status='active' AND role.deleted_at IS NULL
      JOIN public.authorization_versions version ON version.org_id=operator.org_id AND version.user_id=operator.actor_id
      WHERE operator.org_id=$2 AND operator.workspace_id=$3 AND operator.lifecycle='active' AND operator.synthetic_only
        AND NOT operator.production_authorized AND NOT operator.customer_data_authorized AND NOT operator.real_provider_calls_authorized) AS current_recovery_operator_count,
    (SELECT count(*)::integer FROM public.hosted_pilot_verification_run_results result
      JOIN public.hosted_pilot_recovery_operators operator ON operator.org_id=result.org_id AND operator.workspace_id=result.workspace_id
        AND operator.actor_id=result.recovery_actor_id AND operator.lifecycle='active'
      JOIN public.authorization_versions version ON version.org_id=operator.org_id AND version.user_id=operator.actor_id
        AND version.version=result.recovery_authorization_version
      WHERE result.org_id=$2 AND result.workspace_id=$3 AND result.exercise_run_id=$4 AND result.release_sha=$1
        AND result.producer_workflow_path='.github/workflows/hosted-pilot-activation-evidence-producer.yml'
        AND result.producer_run_id=$5 AND result.producer_run_attempt=$6 AND result.target_fingerprint=$7 AND result.deployment_fingerprint=$8
        AND result.tenant_adversarial AND result.provider_zero_egress AND result.canonical_journey
        AND result.backup_restore AND result.recovery_rollback AND result.production_authorized=false
        AND result.customer_data_used=false AND result.real_provider_calls_used=false) AS exact_run_evidence_count,
    (SELECT count(DISTINCT family.evidence_family)::integer FROM public.hosted_pilot_exercise_evidence_families family
      WHERE family.org_id=$2 AND family.workspace_id=$3 AND family.exercise_run_id=$4 AND family.release_sha=$1
        AND family.producer_workflow_path='.github/workflows/hosted-pilot-activation-evidence-producer.yml'
        AND family.producer_run_id=$5 AND family.producer_run_attempt=$6 AND family.target_fingerprint=$7
        AND family.deployment_fingerprint=$8 AND family.hosted_target='hosted_nonproduction_pilot'
        AND family.disposition='executed_hosted_evidence') AS exact_exercise_family_count`,
    [expectedReleaseSha,scope.organizationId,scope.workspaceId,scope.exerciseRunId,scope.producerRunId,Number(scope.producerRunAttempt),expectedTargetFingerprint,scope.deploymentFingerprint])).rows[0];
  if (Number(operations?.recovery_evidence_count)<1 || Number(operations?.rollback_event_count)<1)
    throw new Error('HOSTED_PILOT_RECOVERY_EVIDENCE_MISMATCH');
  const recoveryCapabilities=(await client.query(`SELECT array_agg(capability_key ORDER BY capability_key) capabilities
    FROM public.role_capabilities WHERE role_id=(SELECT role_id FROM public.hosted_pilot_recovery_operators
      WHERE org_id=$1 AND workspace_id=$2 AND lifecycle='active')`,[scope.organizationId,scope.workspaceId])).rows[0]?.capabilities??[];
  if (Number(operations?.current_recovery_operator_count)!==1 || Number(operations?.exact_run_evidence_count)!==1
    || Number(operations?.exact_exercise_family_count)!==5
    || JSON.stringify(recoveryCapabilities)!==JSON.stringify(['operations.read','release.promote']))
    throw new Error('HOSTED_PILOT_CURRENT_RECOVERY_OR_RUN_EVIDENCE_MISMATCH');

  const definers=(await client.query(`SELECT p.oid::regprocedure::text identity,owner.rolname owner,
      replace(coalesce((SELECT substring(config from 13) FROM unnest(p.proconfig) config WHERE config LIKE 'search_path=%'),'') ,' ','') search_path,
      has_function_privilege('PUBLIC',p.oid,'EXECUTE') public_execute,
      has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
      has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
      has_function_privilege('service_role',p.oid,'EXECUTE') service_role_execute
    FROM pg_proc p JOIN pg_roles owner ON owner.oid=p.proowner
    WHERE p.pronamespace='public'::regnamespace AND p.prosecdef ORDER BY p.oid::regprocedure::text`)).rows;
  assertSecurityDefinerCatalog(definers);

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
  return {status:'passed',migrationTip:marker.migration_tip,migrationCount:ledger.length,authorityTableCount:authorityTables.length,
    securityDefinerCount:definers.length,forcedRls:true,
    browserTableAuthority:false,browserServiceRpcAuthority:false,serviceRoleEvidenceMutationAuthority:false,tenantAdversarial:true,
    providerSimulationZeroEgress:true,recoveryVerified:true,productionAuthorized:false};
}

async function main() {
  const url = process.env.HOSTED_PILOT_DATABASE_URL;
  if (!url) throw new Error('HOSTED_PILOT_DATABASE_URL is required (value is never logged)');
  const client = new Client({ connectionString: url, application_name: 'avalaos_hosted_pilot_verify' });
  await client.connect();
  try { process.stdout.write(`${JSON.stringify(await verifyHostedPilotDatabase(client,undefined,
    process.env.HOSTED_PILOT_TARGET_FINGERPRINT,process.env.EXPECTED_RELEASE_SHA,{organizationId:process.env.HOSTED_PILOT_ORGANIZATION_ID,
      workspaceId:process.env.HOSTED_PILOT_WORKSPACE_ID,exerciseRunId:process.env.HOSTED_PILOT_EXERCISE_RUN_ID,
      producerRunId:process.env.GITHUB_RUN_ID,producerRunAttempt:process.env.GITHUB_RUN_ATTEMPT,
      deploymentFingerprint:process.env.HOSTED_PILOT_DEPLOYMENT_FINGERPRINT}))}\n`); }
  finally { await client.end(); }
}
if (import.meta.url === new URL(`file://${process.argv[1] ?? ''}`).href) await main();
