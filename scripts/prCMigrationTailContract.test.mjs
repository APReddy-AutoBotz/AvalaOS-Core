import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync, readdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {
  PR_C_APPROVED_SUCCESSOR_TAIL,
  PR_C_CONTROLLED_HUMAN_FROZEN_TIP,
  assertPrCMigrationTail,
  approvedFullChainTip,
} from './prCMigrationTailContract.mjs';
import {
  XLSX_INGESTION_MIGRATION_PATH,
  XLSX_INGESTION_FROZEN_AUTHORITY_PATH,
  XLSX_INGESTION_FROZEN_CLASSIFIER_PATH,
  assertAssessDocumentXlsxIngestionMigration,
  buildAssessDocumentXlsxIngestionAdversaries,
  buildFrozenEnterpriseSourceVersionAdversaries,
  buildFrozenAssessClassifierAdversaries,
} from './assessDocumentXlsxIngestionMigrationContract.mjs';
import {
  PROJECTION_RPC_VOLATILITY_MIGRATION_PATH,
  assertProjectionRpcVolatilityMigration,
  buildProjectionRpcVolatilityAdversaries,
} from './projectionRpcVolatilityMigrationContract.mjs';

const frozenPrefix = ['20260831062024_governed_delivery_monitor_pr_c.sql', PR_C_CONTROLLED_HUMAN_FROZEN_TIP];

test('creation PostgreSQL runner executes the real migration-order preflight with the deferred-binding successor last', () => {
  const source = readFileSync('scripts/runCreationAccessPostgres.mjs', 'utf8');
  const start = source.indexOf('  const creationStart =');
  const end = source.indexOf('  const apply =', start);
  assert.ok(start >= 0 && end > start, 'Actual runner preflight must be present');
  const preflight = source.slice(start, end);
  const migrations = readdirSync('supabase/migrations').filter(file => file.endsWith('.sql')).sort();
  const execute = (files, code = preflight) => runInNewContext(`(() => {${code}})()`,
    {migrations: files, assert}, {timeout: 1000});
  assert.doesNotThrow(() => execute(migrations));
  for (const files of [migrations.slice(0, -1), [...migrations, '20990101000000_unapproved.sql'],
    [...migrations.slice(0, -2), migrations.at(-1), migrations.at(-2)]]) {
    assert.throws(() => execute(files), {code: 'ERR_ASSERTION'});
  }
  // Reintroducing the exact CI defect must fail even when count/tip markers pass.
  assert.throws(() => execute(migrations,
    preflight + '\nassert.equal(domainBudgetIndex, migrations.length - 1);'), {code: 'ERR_ASSERTION'});
});

test('domain-budget RPC identifiers fit PostgreSQL without silent API-name truncation', () => {
  const assertNames = source => {
    const names = [...source.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z0-9_]+)/giu)].map(match => match[1]);
    assert.ok(names.length >= 7, 'Expected the complete domain-budget function inventory');
    for (const name of names) assert.ok(Buffer.byteLength(name, 'utf8') <= 63, `PostgreSQL would truncate RPC identifier: ${name}`);
  };
  const source = readFileSync('supabase/migrations/20260918082307_synthetic_ai_mapping_studio_budget_authority.sql', 'utf8');
  assertNames(source);
  assert.throws(() => assertNames(`${source}\nCREATE FUNCTION public.${'x'.repeat(64)}()`), /truncate RPC identifier/u);
});

test('only the exact approved creation-access successor tail is accepted', () => {
  assert.doesNotThrow(() => assertPrCMigrationTail([...frozenPrefix, ...PR_C_APPROVED_SUCCESSOR_TAIL]));
  for (const hostileTail of [
    [],
    PR_C_APPROVED_SUCCESSOR_TAIL.slice(0, 1),
    PR_C_APPROVED_SUCCESSOR_TAIL.slice(0, 2),
    ...PR_C_APPROVED_SUCCESSOR_TAIL.map((_, omitted) => PR_C_APPROVED_SUCCESSOR_TAIL.filter((__, index) => index !== omitted)),
    [...PR_C_APPROVED_SUCCESSOR_TAIL].reverse(),
    [PR_C_APPROVED_SUCCESSOR_TAIL[1], PR_C_APPROVED_SUCCESSOR_TAIL[0], ...PR_C_APPROVED_SUCCESSOR_TAIL.slice(2)],
    [...PR_C_APPROVED_SUCCESSOR_TAIL, PR_C_APPROVED_SUCCESSOR_TAIL[2]],
    [...PR_C_APPROVED_SUCCESSOR_TAIL, '20990101000000_unapproved.sql'],
  ]) {
    assert.throws(() => assertPrCMigrationTail([...frozenPrefix, ...hostileTail]));
  }
  assert.throws(() => assertPrCMigrationTail([frozenPrefix[0], ...PR_C_APPROVED_SUCCESSOR_TAIL]));
  assert.throws(() => assertPrCMigrationTail([...frozenPrefix, PR_C_CONTROLLED_HUMAN_FROZEN_TIP,
    ...PR_C_APPROVED_SUCCESSOR_TAIL]));
});

test('fresh-chain identity derives only from the validated approved successor tail', () => {
  assert.equal(approvedFullChainTip([...frozenPrefix, ...PR_C_APPROVED_SUCCESSOR_TAIL]), '20260923190853');
  for (const tail of [[], PR_C_APPROVED_SUCCESSOR_TAIL.slice(0, 2),
    ...PR_C_APPROVED_SUCCESSOR_TAIL.map((_, omitted) => PR_C_APPROVED_SUCCESSOR_TAIL.filter((__, index) => index !== omitted)),
    [...PR_C_APPROVED_SUCCESSOR_TAIL].reverse(),
    [...PR_C_APPROVED_SUCCESSOR_TAIL, '20990101000000_unapproved.sql']]) {
    assert.throws(() => approvedFullChainTip([...frozenPrefix, ...tail]));
  }
  const runner = readFileSync('scripts/testTranscriptFlowPrCPostgres.mjs', 'utf8');
  assert.match(runner, /approvedFullChainTip\(migrations\)/u);
  assert.match(runner, /assert\.equal\(tip,expectedFreshTip\)/u);
  assert.match(runner, /upgrade\.query\([^\n]+migration_tip[^\n]+,'20260831062024'\)/u);
  assert.match(readFileSync('scripts/runCreationAccessPostgres.mjs', 'utf8'),
    /child\('scripts\/testTranscriptFlowPrCPostgres\.mjs',\s*\{\s*TRANSCRIPT_FLOW_PR_C_MIGRATION_DATABASE_URL:/u);
  const creationRunner = readFileSync('scripts/runCreationAccessPostgres.mjs', 'utf8');
  assert.ok(creationRunner.includes("assert.equal(approvedFullChainTip(migrations), '20260923190853')"));
  assert.ok(creationRunner.includes('assert.equal(migrations.length, 89)'));
  const mappingRunner = readFileSync('scripts/testAssessSupportingDocumentMappingPostgres.mjs', 'utf8');
  assert.match(mappingRunner, /expectedFullChainTip=approvedFullChainTip\(migrations\)/u);
  assert.match(mappingRunner, /assert\.equal\(expectedFullChainTip,'20260923190853'/u);
  assert.doesNotMatch(mappingRunner, /assert\.equal\(migrations\.at\(-1\),PROJECTION_RPC_CORRECTION/u);
});

test('projection RPC volatility successor is exact and adversarially bound', () => {
  const sql = readFileSync(PROJECTION_RPC_VOLATILITY_MIGRATION_PATH, 'utf8');
  assert.deepEqual(assertProjectionRpcVolatilityMigration(sql), {
    predecessorTip: '20260916181916',
    currentTip: '20260916203406',
    functionCount: 2,
  });
  const adversaries = buildProjectionRpcVolatilityAdversaries(sql);
  assert.equal(adversaries.length, 20);
  for (const adversary of adversaries) {
    assert.throws(() => assertProjectionRpcVolatilityMigration(adversary.sql), undefined, adversary.name);
  }
});

test('XLSX ingestion successor preserves exact function and environment authority', () => {
  const sql = readFileSync(XLSX_INGESTION_MIGRATION_PATH, 'utf8');
  const frozenAuthoritySql = readFileSync(XLSX_INGESTION_FROZEN_AUTHORITY_PATH, 'utf8');
  const frozenClassifierSql = readFileSync(XLSX_INGESTION_FROZEN_CLASSIFIER_PATH, 'utf8');
  assert.deepEqual(assertAssessDocumentXlsxIngestionMigration(sql, frozenAuthoritySql, frozenClassifierSql), {
    predecessorTip: '20260916151050',
    currentTip: '20260916181916',
    retainedParserCaseCount: 9,
  });
  for (const adversary of buildAssessDocumentXlsxIngestionAdversaries(sql)) {
    assert.throws(() => assertAssessDocumentXlsxIngestionMigration(adversary.sql, frozenAuthoritySql, frozenClassifierSql), undefined, adversary.name);
  }
  for (const adversary of buildFrozenEnterpriseSourceVersionAdversaries(frozenAuthoritySql)) {
    assert.throws(() => assertAssessDocumentXlsxIngestionMigration(sql, adversary.sql, frozenClassifierSql), undefined, adversary.name);
  }
  for (const adversary of buildFrozenAssessClassifierAdversaries(frozenClassifierSql)) {
    assert.throws(() => assertAssessDocumentXlsxIngestionMigration(sql, frozenAuthoritySql, adversary.sql), undefined, adversary.name);
  }
});

test('forward identity convergence requires exact frozen marker, predecessors, and non-production flags', () => {
  const sql = readFileSync('supabase/migrations/20260916003000_creation_access_migration_identity_convergence.sql', 'utf8');
  assert.match(sql, /to_regclass\('public\.process_creation_workspace_controls'\)/u);
  assert.match(sql, /to_regclass\('public\.synthetic_admin_accounts'\)/u);
  assert.match(sql, /singleton_count <> 1/u);
  assert.match(sql, /migration_tip <> '20260904120000'/u);
  for (const flag of ['production_authorized', 'customer_data_authorized', 'real_provider_calls_authorized']) {
    assert.match(sql, new RegExp(`marker\\.${flag}`, 'u'));
  }
  assert.match(sql, /SET migration_tip = '20260916003000'/u);
  assert.match(sql, /CHECK \(migration_tip = ''20260916003000''\)/u);
  assert.doesNotMatch(sql.replace(/^--.*$/gmu, ''), /(?:GRANT|CREATE ROLE|ALTER ROLE|DROP TABLE)/iu);
});

test('mapping identity convergence is exact, atomic, and rejects adversarial contract mutations', () => {
  const path = 'supabase/migrations/20260916151050_assess_document_mapping_identity_convergence.sql';
  const sql = readFileSync(path, 'utf8');
  const required = [
    'LOCK TABLE public.hosted_pilot_environment_identity IN SHARE ROW EXCLUSIVE MODE',
    'public.pr_c_controlled_human_recovery_authorities IN SHARE MODE',
    'singleton_count <> 1',
    'FOR UPDATE',
    "marker.product_key <> 'avalaos-core'",
    "marker.environment_class <> 'hosted_nonproduction_pilot'",
    "marker.schema_contract <> 'hosted-pilot-2026-08'",
    'marker.production_authorized',
    'marker.customer_data_authorized',
    'marker.real_provider_calls_authorized',
    "attribute_row.attname = 'assess_document_mapping_enabled'",
    "marker.migration_tip <> '20260916003000'",
    "old_constraint_expression IS DISTINCT FROM '(migration_tip = ''20260916003000''::text)'",
    "SET migration_tip = '20260916151050'",
    "CHECK (migration_tip = '20260916151050')",
    'GET DIAGNOSTICS changed_count = ROW_COUNT',
    'changed_count <> 1',
    'exercise_count <> 0 OR recovery_count <> 0',
    "to_regprocedure('public.enterprise_commit_assess_document_mapping_preview_v1(uuid,uuid,text,uuid,bigint,uuid,uuid,jsonb,uuid,uuid,uuid,bigint,uuid,uuid,bigint)')",
  ];
  for (const marker of required) assert.ok(sql.includes(marker), `missing identity contract: ${marker}`);
  for (const relation of [
    'catalogs','targets','runs','run_sources','proposals','reviews','preview_batches','preview_items',
    'conflicts','conflict_resolutions','preview_manifests','applications',
  ]) assert.ok(sql.includes(`public.enterprise_assess_document_mapping_${relation}`));
  for (const flag of ['production_authorized','customer_data_authorized','real_provider_calls_authorized']) {
    assert.ok(sql.includes(`marker.${flag}`));
    assert.ok(sql.includes(`NOT ${flag}`));
  }
  assert.doesNotMatch(sql.replace(/^--.*$/gmu, ''), /(?:GRANT|CREATE ROLE|ALTER ROLE|DROP TABLE)/iu);

  const validates = candidate => required.every(marker => candidate.includes(marker))
    && ['catalogs','targets','runs','run_sources','proposals','reviews','preview_batches','preview_items',
      'conflicts','conflict_resolutions','preview_manifests','applications']
      .every(relation => candidate.includes(`public.enterprise_assess_document_mapping_${relation}`));
  assert.equal(validates(sql), true);
  for (const hostile of [
    ...required.map(marker => sql.replace(marker, 'removed_precondition')),
    sql.replace("marker.migration_tip <> '20260916003000'", "marker.migration_tip <> '20260904120000'"),
    sql.replace("SET migration_tip = '20260916151050'", "SET migration_tip = '20260916003000'"),
    sql.replace("CHECK (migration_tip = '20260916151050')", "CHECK (migration_tip = '20260916003000')"),
    sql.replace('changed_count <> 1', 'changed_count < 1'),
    sql.replace('exercise_count <> 0 OR recovery_count <> 0', 'exercise_count <> 0'),
    sql.replace('public.enterprise_assess_document_mapping_applications', 'public.removed_mapping_authority'),
  ]) assert.equal(validates(hostile), false);
});
