import assert from 'node:assert/strict';

export const PROJECTION_RPC_VOLATILITY_MIGRATION_PATH =
  'supabase/migrations/20260916203406_projection_rpc_volatility_authority.sql';
export const PROJECTION_RPC_VOLATILITY_PREDECESSOR_TIP = '20260916181916';
export const PROJECTION_RPC_VOLATILITY_CURRENT_TIP = '20260916203406';

const deliverySignature = 'public.enterprise_delivery_workspace_projection(uuid,uuid,jsonb)';
const monitorSignature = 'public.enterprise_monitor_approved_baselines_projection(uuid,uuid,jsonb)';
const deliveryHash = '5e5f103ab825a120fb97b22a31f06d99323d735fc99b26053a91098a99076068';
const monitorHash = '16d0e6206cacff577253c75f8d0b3f1d43ba05d4030e81c6bcde66a127580a80';

const count = (value, needle) => value.split(needle).length - 1;
const stripped = sql => sql.replace(/^\s*--.*$/gmu, '');

export function assertProjectionRpcVolatilityMigration(sql) {
  assert.equal(typeof sql, 'string');
  assert.ok(sql.length > 0);
  const source = stripped(sql);
  const functionAlterations = source.match(/\bALTER\s+FUNCTION\b[^;]*;/giu) || [];
  assert.deepEqual(functionAlterations, [
    `ALTER FUNCTION ${deliverySignature} VOLATILE;`,
    `ALTER FUNCTION ${monitorSignature} VOLATILE;`,
  ], 'only the two exact approved function alterations are permitted');
  assert.equal((source.match(/\bDO\s+\$/gu) || []).length, 1, 'migration must contain one atomic DO block');
  assert.ok(source.trim().startsWith('DO $projection_rpc_volatility_authority$'));
  assert.ok(source.trim().endsWith('$projection_rpc_volatility_authority$;'));
  const requiredOnce = [
    `pg_catalog.to_regprocedure(\n    '${deliverySignature}'\n  )`,
    `pg_catalog.to_regprocedure(\n    '${monitorSignature}'\n  )`,
    `ALTER FUNCTION ${deliverySignature} VOLATILE;`,
    `ALTER FUNCTION ${monitorSignature} VOLATILE;`,
    `delivery_body_hash IS DISTINCT FROM '${deliveryHash}'`,
    `monitor_body_hash IS DISTINCT FROM '${monitorHash}'`,
    "LOCK TABLE public.hosted_pilot_environment_identity IN SHARE ROW EXCLUSIVE MODE;",
    "LOCK TABLE public.pr_c_controlled_human_exercises,\n    public.pr_c_controlled_human_recovery_authorities IN SHARE MODE;",
    'SELECT count(*) INTO exercise_count FROM public.pr_c_controlled_human_exercises;',
    'SELECT count(*) INTO recovery_count FROM public.pr_c_controlled_human_recovery_authorities;',
    'IF exercise_count <> 0 OR recovery_count <> 0 THEN',
    `(pg_catalog.to_jsonb(delivery_after) - 'provolatile')`,
    `(pg_catalog.to_jsonb(delivery_before) - 'provolatile')`,
    `(pg_catalog.to_jsonb(monitor_after) - 'provolatile')`,
    `(pg_catalog.to_jsonb(monitor_before) - 'provolatile')`,
    "delivery_after.provolatile <> 'v'",
    "monitor_after.provolatile <> 'v'",
    `marker.migration_tip <> '${PROJECTION_RPC_VOLATILITY_PREDECESSOR_TIP}'`,
    `old_constraint_expression IS DISTINCT FROM '(migration_tip = ''${PROJECTION_RPC_VOLATILITY_PREDECESSOR_TIP}''::text)'`,
    `SET migration_tip = '${PROJECTION_RPC_VOLATILITY_CURRENT_TIP}'`,
    `AND migration_tip = '${PROJECTION_RPC_VOLATILITY_PREDECESSOR_TIP}'`,
    `CHECK (migration_tip = '${PROJECTION_RPC_VOLATILITY_CURRENT_TIP}')`,
    `old_constraint_expression IS DISTINCT FROM '(migration_tip = ''${PROJECTION_RPC_VOLATILITY_CURRENT_TIP}''::text)'`,
    'GET DIAGNOSTICS changed_count = ROW_COUNT;',
    'IF changed_count <> 1 THEN',
    'delivery_before.proacl IS NULL',
    'monitor_before.proacl IS NULL',
    'delivery_acl_count <> 3',
    'monitor_acl_count <> 3',
    'pg_catalog.cardinality(delivery_before.proacl) <> 3',
    'pg_catalog.cardinality(monitor_before.proacl) <> 3',
    'delivery_before.oid IS DISTINCT FROM delivery_oid',
    'monitor_before.oid IS DISTINCT FROM monitor_oid',
  ];
  for (const marker of requiredOnce) assert.equal(count(source, marker), 1, `migration marker not exact: ${marker}`);

  for (const marker of [
    "proowner <> 'postgres'::regrole",
    "prokind <> 'f'",
    "prorettype <> 'pg_catalog.jsonb'::regtype",
    'pronargs <> 3',
    "proargtypes <> '2950 2950 3802'::pg_catalog.oidvector",
    "proargnames IS DISTINCT FROM ARRAY['p_org','p_workspace','p_query']::text[]",
    'prosecdef IS FALSE',
    'proleakproof',
    'proisstrict',
    "provolatile <> 's'",
    "proparallel <> 'u'",
    "proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]",
  ]) assert.equal(count(source, marker), 2, `two-function metadata marker not exact: ${marker}`);

  for (const flag of ['production_authorized', 'customer_data_authorized', 'real_provider_calls_authorized']) {
    assert.equal(count(source, `marker.${flag}`), 1);
    assert.equal(count(source, `NOT ${flag}`), 1);
  }
  assert.equal(count(source, 'FROM pg_catalog.pg_proc function_row\n  WHERE function_row.oid = delivery_oid;'), 2);
  assert.equal(count(source, 'FROM pg_catalog.pg_proc function_row\n  WHERE function_row.oid = monitor_oid;'), 2);

  const firstAlter = source.indexOf(`ALTER FUNCTION ${deliverySignature} VOLATILE;`);
  const secondAlter = source.indexOf(`ALTER FUNCTION ${monitorSignature} VOLATILE;`);
  const postcheck = source.indexOf("(pg_catalog.to_jsonb(delivery_after) - 'provolatile')");
  const markerAdvance = source.indexOf(`SET migration_tip = '${PROJECTION_RPC_VOLATILITY_CURRENT_TIP}'`);
  assert.ok(firstAlter > 0 && secondAlter > firstAlter && postcheck > secondAlter && markerAdvance > postcheck,
    'function corrections and whole-row postcheck must precede the marker advance');

  assert.doesNotMatch(source, /\b(?:GRANT|REVOKE|CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|DROP\s+FUNCTION|CREATE\s+ROLE|ALTER\s+ROLE)\b/iu);
  return {
    predecessorTip: PROJECTION_RPC_VOLATILITY_PREDECESSOR_TIP,
    currentTip: PROJECTION_RPC_VOLATILITY_CURRENT_TIP,
    functionCount: functionAlterations.length,
  };
}

const mutateOnce = (sql, before, after) => {
  assert.equal(count(sql, before), 1, `adversary target not exact: ${before}`);
  return sql.replace(before, after);
};

export function buildProjectionRpcVolatilityAdversaries(sql) {
  const metadata = [
    ['owner', "delivery_before.proowner <> 'postgres'::regrole", "delivery_before.proowner <> 'changed_owner'::regrole"],
    ['acl', 'delivery_acl_count <> 3', 'delivery_acl_count < 3'],
    ['config', "delivery_before.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]", "delivery_before.proconfig IS NULL"],
    ['oid', 'delivery_before.oid IS DISTINCT FROM delivery_oid', 'delivery_before.oid IS NULL'],
    ['signature', "delivery_before.proargtypes <> '2950 2950 3802'::pg_catalog.oidvector", "delivery_before.proargtypes IS NULL"],
    ['security', 'delivery_before.prosecdef IS FALSE', 'delivery_before.prosecdef IS NULL'],
    ['volatility', "delivery_before.provolatile <> 's'", "delivery_before.provolatile <> 'v'"],
  ];
  return [
    { name: 'unrelated-function-added', sql: mutateOnce(sql,
      `  ALTER FUNCTION ${deliverySignature} VOLATILE;`,
      `  ALTER FUNCTION public.unrelated_projection() VOLATILE;\n  ALTER FUNCTION ${deliverySignature} VOLATILE;`) },
    { name: 'unrelated-function-added-with-mixed-case', sql: mutateOnce(sql,
      `  ALTER FUNCTION ${deliverySignature} VOLATILE;`,
      `  alter  function public.unrelated_projection() VOLATILE;\n  ALTER FUNCTION ${deliverySignature} VOLATILE;`) },
    { name: 'delivery-function-omitted', sql: mutateOnce(sql, `  ALTER FUNCTION ${deliverySignature} VOLATILE;\n`, '') },
    { name: 'monitor-function-omitted', sql: mutateOnce(sql, `  ALTER FUNCTION ${monitorSignature} VOLATILE;\n`, '') },
    { name: 'delivery-body-substituted', sql: mutateOnce(sql, deliveryHash, `0${deliveryHash.slice(1)}`) },
    { name: 'monitor-body-substituted', sql: mutateOnce(sql, monitorHash, `0${monitorHash.slice(1)}`) },
    ...metadata.map(([name, before, after]) => ({ name: `${name}-drift`, sql: mutateOnce(sql, before, after) })),
    { name: 'old-tip-substituted', sql: mutateOnce(sql, `marker.migration_tip <> '${PROJECTION_RPC_VOLATILITY_PREDECESSOR_TIP}'`, "marker.migration_tip <> '20260916151050'") },
    { name: 'unsafe-environment-check-removed', sql: mutateOnce(sql, 'marker.production_authorized', 'FALSE') },
    { name: 'exercise-history-check-removed', sql: mutateOnce(sql, 'exercise_count <> 0 OR recovery_count <> 0', 'recovery_count <> 0') },
    { name: 'identity-lock-removed', sql: mutateOnce(sql, '  LOCK TABLE public.hosted_pilot_environment_identity IN SHARE ROW EXCLUSIVE MODE;\n', '') },
    { name: 'history-locks-removed', sql: mutateOnce(sql, '  LOCK TABLE public.pr_c_controlled_human_exercises,\n    public.pr_c_controlled_human_recovery_authorities IN SHARE MODE;\n', '') },
    { name: 'second-transaction-block-added', sql: `${sql}\nDO $unapproved$ BEGIN NULL; END $unapproved$;\n` },
    { name: 'marker-advanced-first', sql: mutateOnce(sql,
      `  ALTER FUNCTION ${deliverySignature} VOLATILE;`,
      `  SET migration_tip = '${PROJECTION_RPC_VOLATILITY_CURRENT_TIP}';\n  ALTER FUNCTION ${deliverySignature} VOLATILE;`)
      .replace(`  SET migration_tip = '${PROJECTION_RPC_VOLATILITY_CURRENT_TIP}'\n  WHERE`, "  SET migration_tip = 'removed_marker'\n  WHERE") },
  ];
}
