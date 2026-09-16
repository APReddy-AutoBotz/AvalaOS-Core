import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const XLSX_INGESTION_MIGRATION_PATH =
  'supabase/migrations/20260916181916_assess_document_xlsx_ingestion_authority.sql';
export const XLSX_INGESTION_FROZEN_AUTHORITY_PATH =
  'supabase/migrations/20260804120000_enterprise_intelligence_authority.sql';
export const XLSX_INGESTION_FROZEN_CLASSIFIER_PATH =
  'supabase/migrations/20260808160000_enterprise_assess_evidence_submission_contract.sql';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PREDECESSOR_TIP = '20260916151050';
const CURRENT_TIP = '20260916181916';
const OLD_FUNCTION_BODY_SHA256 = '7307ee85772674a28a47f2ca0a9fe099a596e864e5c4b28996a287bc04fdebc1';
const FUNCTION_SIGNATURE = 'CREATE OR REPLACE FUNCTION public.enterprise_source_version_derive()';
const DOCX_CASE = "    WHEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' THEN 'docx'\n";
const XLSX_CASE = `    WHEN '${XLSX_MIME}' THEN 'xlsx'\n`;

const retainedParserCases = Object.freeze([
  "WHEN 'text/plain' THEN 'text_native'",
  "WHEN 'text/markdown' THEN 'text_native'",
  "WHEN 'text/meeting-notes' THEN 'text_native'",
  "WHEN 'text/csv' THEN 'csv'",
  "WHEN 'text/vtt' THEN 'vtt'",
  "WHEN 'application/x-subrip' THEN 'srt'",
  "WHEN 'text/x-srt' THEN 'srt'",
  "WHEN 'application/pdf' THEN 'pdf_text'",
  "WHEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' THEN 'docx'",
]);

const requiredMarkers = Object.freeze([
  'LOCK TABLE public.hosted_pilot_environment_identity IN SHARE ROW EXCLUSIVE MODE',
  'public.pr_c_controlled_human_recovery_authorities IN SHARE MODE',
  'public.enterprise_evidence_source_versions IN SHARE ROW EXCLUSIVE MODE',
  'singleton_count <> 1',
  'FOR UPDATE',
  "marker.product_key <> 'avalaos-core'",
  "marker.environment_class <> 'hosted_nonproduction_pilot'",
  "marker.schema_contract <> 'hosted-pilot-2026-08'",
  `marker.migration_tip <> '${PREDECESSOR_TIP}'`,
  'marker.production_authorized',
  'marker.customer_data_authorized',
  'marker.real_provider_calls_authorized',
  `old_constraint_expression IS DISTINCT FROM '(migration_tip = ''${PREDECESSOR_TIP}''::text)'`,
  'exercise_count <> 0 OR recovery_count <> 0',
  "constraint_row.conname = 'enterprise_evidence_sources_mime_type_check'",
  "constraint_row.conname = 'enterprise_evidence_source_versions_parser_kind_check'",
  `'${XLSX_MIME}''::text`,
  "''xlsx''::text",
  "pg_catalog.to_regprocedure('public.enterprise_source_version_derive()')",
  "function_row.prorettype = 'pg_catalog.trigger'::regtype",
  "function_row.proconfig = ARRAY['search_path=pg_catalog']::text[]",
  "language_row.lanname = 'plpgsql'",
  "function_row.prosecdef IS FALSE",
  "function_row.provolatile = 'v'",
  "function_row.proparallel = 'u'",
  "trigger_row.tgname = 'enterprise_source_version_derive_before_insert'",
  "trigger_row.tgrelid = 'public.enterprise_evidence_source_versions'::regclass",
  "trigger_row.tgenabled = 'O'",
  'trigger_row.tgtype = 7',
  'trigger_row.tgfoid = source_function_oid',
  'replacement_function_oid IS DISTINCT FROM source_function_oid',
  'replacement_function_owner IS DISTINCT FROM old_function_owner',
  'replacement_function_acl IS DISTINCT FROM old_function_acl',
  'replacement_function_config IS DISTINCT FROM old_function_config',
  `old_function_source_hash <> '${OLD_FUNCTION_BODY_SHA256}'`,
  'normalized_replacement_function_source IS DISTINCT FROM expected_replacement_function_source',
  `WHEN '${XLSX_MIME}' THEN 'xlsx'`,
  "NEW.parser_version := COALESCE(NULLIF(btrim(NEW.parser_version), ''), 'enterprise-parser-1')",
  "RAISE EXCEPTION 'ENTERPRISE_EVIDENCE_STORAGE_BINDING_INVALID'",
  "RAISE EXCEPTION 'ENTERPRISE_EVIDENCE_EXTRACTION_STATE_INVALID'",
  'NEW.provenance_hash := public.enterprise_sha256_jsonb',
  `SET migration_tip = '${CURRENT_TIP}'`,
  `AND migration_tip = '${PREDECESSOR_TIP}'`,
  `CHECK (migration_tip = '${CURRENT_TIP}')`,
  'GET DIAGNOSTICS changed_count = ROW_COUNT',
  'changed_count <> 1',
  `old_constraint_expression IS DISTINCT FROM '(migration_tip = ''${CURRENT_TIP}''::text)'`,
]);

const countMatches = (source, pattern) => source.match(pattern)?.length ?? 0;

const normalizeNewlines = source => source.replace(/\r\n/gu, '\n');

export const extractEnterpriseSourceVersionDeriveBody = source => {
  const normalized = normalizeNewlines(source);
  const signatureIndex = normalized.indexOf(FUNCTION_SIGNATURE);
  assert.notEqual(signatureIndex, -1, 'canonical source-version trigger function is missing');
  assert.equal(normalized.indexOf(FUNCTION_SIGNATURE, signatureIndex + 1), -1,
    'canonical source-version trigger function is duplicated');
  const bodyStartMarker = 'AS $$';
  const bodyStart = normalized.indexOf(bodyStartMarker, signatureIndex);
  assert.notEqual(bodyStart, -1, 'canonical source-version trigger function body is missing');
  const bodyEnd = normalized.indexOf('$$;', bodyStart + bodyStartMarker.length);
  assert.notEqual(bodyEnd, -1, 'canonical source-version trigger function body is unterminated');
  return normalized.slice(bodyStart + bodyStartMarker.length, bodyEnd);
};

const CLASSIFIER_SIGNATURE = 'CREATE OR REPLACE FUNCTION public.enterprise_assess_v2_source_type(';
const CLASSIFIER_BODY_HASH = '6cbb1ff74fb00854063571ff52a4d53c0c14d3ef25a348d9a75f651a0a8f8a21';
const CLASSIFIER_DOCX = "       'application/vnd.openxmlformats-officedocument.wordprocessingml.document'\n";
const CLASSIFIER_XLSX = "       'application/vnd.openxmlformats-officedocument.wordprocessingml.document',\n       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'\n";
const classifierDefinition = sql => {
  assert.equal(typeof sql, 'string', 'frozen Assess classifier authority is required');
  const value=sql.replace(/\r\n/g,'\n'), start=value.indexOf(CLASSIFIER_SIGNATURE);
  assert.ok(start>=0, 'Assess classifier function is required');
  const bodyStart=value.indexOf('AS $$',start)+5, end=value.indexOf('$$;',bodyStart);
  assert.ok(bodyStart>start&&end>bodyStart, 'Assess classifier body is required');
  return {definition:value.slice(start,end+3),body:value.slice(bodyStart,end)};
};

export const assertAssessDocumentXlsxIngestionMigration = (sql, frozenAuthoritySql, frozenClassifierSql) => {
  assert.equal(typeof sql, 'string', 'XLSX ingestion migration must be text');
  assert.equal(typeof frozenAuthoritySql, 'string', 'frozen Enterprise authority migration must be text');
  const uncommented = sql.replace(/^--.*$/gmu, '').trim();
  assert.doesNotMatch(sql, /\/\*/u, 'block comments are not accepted as executable migration proof');
  assert.match(
    uncommented,
    /^DO \$assess_document_xlsx_ingestion\$[\s\S]*\$assess_document_xlsx_ingestion\$;$/u,
    'XLSX correction must be one transaction-scoped DO statement',
  );
  assert.equal(
    countMatches(uncommented, /\bDO \$assess_document_xlsx_ingestion\$/gu),
    1,
    'XLSX correction must declare one DO statement',
  );
  assert.equal(
    countMatches(sql, /CREATE OR REPLACE FUNCTION public\.enterprise_source_version_derive\(\)/gu),
    1,
    'only the canonical source-version trigger function may be replaced',
  );
  assert.deepEqual([...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)\(/gu)].map(m=>m[1]),
    ['enterprise_source_version_derive','enterprise_assess_v2_source_type'],
    'only the exact ingestion and Assess classifier functions may be replaced');
  assert.doesNotMatch(sql, /\b(?:CREATE|DROP|ALTER)\s+(?:TRIGGER|ROLE)\b/iu);
  assert.doesNotMatch(sql, /\b(?:GRANT|REVOKE|DROP\s+TABLE|TRUNCATE)\b/iu);
  assert.doesNotMatch(sql, /\bSECURITY\s+DEFINER\b/iu);
  assert.doesNotMatch(sql, /assess_document_mapping_enabled\s*=\s*true/iu);
  assert.doesNotMatch(sql, /spreadsheet-grid-v1/iu,
    'source creation retains enterprise-parser-1; mapping re-extraction owns spreadsheet-grid-v1');

  for (const marker of requiredMarkers) {
    assert.ok(uncommented.includes(marker), `missing XLSX ingestion authority marker: ${marker}`);
  }
  for (const parserCase of retainedParserCases) {
    assert.equal(countMatches(sql, new RegExp(parserCase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'gu')), 1,
      `retained parser case changed or duplicated: ${parserCase}`);
  }
  assert.equal(countMatches(sql, new RegExp(`WHEN '${XLSX_MIME.replaceAll('.', '\\.')}' THEN 'xlsx'`, 'gu')), 1,
    'XLSX MIME must map to parser_kind xlsx exactly once');
  assert.equal(countMatches(sql, /UPDATE public\.hosted_pilot_environment_identity/gu), 1,
    'identity convergence must update only one marker statement');
  assert.match(sql, /Rollback disables[\s\S]*retaining immutable source, receipt, and Assess history/u);

  const oldFunctionBody = extractEnterpriseSourceVersionDeriveBody(frozenAuthoritySql);
  assert.equal(createHash('sha256').update(oldFunctionBody).digest('hex'), OLD_FUNCTION_BODY_SHA256,
    'frozen Enterprise authority function body changed');
  assert.equal(countMatches(oldFunctionBody, new RegExp(DOCX_CASE.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'gu')), 1,
    'frozen function must contain one canonical DOCX parser case');
  assert.equal(oldFunctionBody.includes(XLSX_CASE.trim()), false,
    'frozen function unexpectedly already contains XLSX authority');
  const replacementFunctionBody = extractEnterpriseSourceVersionDeriveBody(sql);
  const expectedReplacementBody = oldFunctionBody.replace(DOCX_CASE, `${DOCX_CASE}${XLSX_CASE}`);
  assert.notEqual(expectedReplacementBody, oldFunctionBody, 'XLSX parser case was not inserted');
  assert.equal(replacementFunctionBody, expectedReplacementBody,
    'replacement function must equal the frozen body plus exactly one XLSX parser case');

  const classifier=classifierDefinition(frozenClassifierSql);
  assert.equal(createHash('sha256').update(classifier.body).digest('hex'),CLASSIFIER_BODY_HASH,
    'frozen Assess classifier body changed');
  assert.ok(classifier.definition.includes('RETURNS TEXT\nLANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog AS $$'));
  const expectedClassifier=classifier.definition.replace(CLASSIFIER_DOCX,CLASSIFIER_XLSX);
  assert.notEqual(expectedClassifier,classifier.definition);
  assert.equal(classifierDefinition(sql).definition,expectedClassifier,
    'replacement classifier must be exactly the frozen document-only classifier plus XLSX');
  for(const marker of [
    "pg_catalog.to_regprocedure('public.enterprise_assess_v2_source_type(text,text)')",
    "classifier_before.prorettype <> 'pg_catalog.text'::regtype",
    "classifier_before.proargtypes <> '25 25'::pg_catalog.oidvector",
    'classifier_before.prosecdef','classifier_before.proleakproof',
    'NOT classifier_before.proisstrict',"classifier_before.provolatile <> 'i'",
    "classifier_before.proparallel <> 'u'",
    "classifier_before.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]",
    CLASSIFIER_BODY_HASH,
    "(to_jsonb(classifier_after)-'prosrc') IS DISTINCT FROM (to_jsonb(classifier_before)-'prosrc')",
    "pg_catalog.replace(classifier_after.prosrc,E'\\r\\n',E'\\n') IS DISTINCT FROM classifier_expected_body",
  ])assert.ok(uncommented.includes(marker), 'missing exact classifier guard: '+marker);

  return Object.freeze({
    predecessorTip: PREDECESSOR_TIP,
    currentTip: CURRENT_TIP,
    retainedParserCaseCount: retainedParserCases.length,
  });
};

const replaceRequired = (source, expected, replacement) => {
  assert.ok(source.includes(expected), `mutation source marker missing: ${expected}`);
  return source.replace(expected, replacement);
};

export const buildAssessDocumentXlsxIngestionAdversaries = sql => Object.freeze([
  Object.freeze({name:'classifier-body-hash',sql:replaceRequired(sql,CLASSIFIER_BODY_HASH,'0'.repeat(64))}),
  Object.freeze({name:'classifier-wrong-evidence-kind',sql:replaceRequired(sql,"RETURN 'document';","RETURN 'test';")}),
  Object.freeze({name:'classifier-loses-strictness',sql:replaceRequired(sql,'LANGUAGE plpgsql IMMUTABLE STRICT','LANGUAGE plpgsql IMMUTABLE')}),
  Object.freeze({name:'classifier-replacement-as-comment',sql:replaceRequired(sql,
    "       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'\n",
    "       'text/not-xlsx' -- application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\n")}),
  Object.freeze({name:'classifier-properties-unchecked',sql:replaceRequired(sql,
    "(to_jsonb(classifier_after)-'prosrc') IS DISTINCT FROM (to_jsonb(classifier_before)-'prosrc')",
    "classifier_after.oid IS NULL")}),
  Object.freeze({name:'third-function',sql:sql.replace('  EXECUTE $replacement_classifier$',
    '  -- CREATE OR REPLACE FUNCTION public.unapproved()\n  EXECUTE $replacement_classifier$')}),
  Object.freeze({name: 'missing-xlsx-case', sql: replaceRequired(
    sql,
    `    WHEN '${XLSX_MIME}' THEN 'xlsx'`,
    '',
  )}),
  Object.freeze({name: 'retained-format-substitution', sql: replaceRequired(
    sql,
    "WHEN 'text/csv' THEN 'csv'",
    "WHEN 'text/csv' THEN 'text_native'",
  )}),
  Object.freeze({name: 'stale-predecessor', sql: replaceRequired(
    sql,
    `marker.migration_tip <> '${PREDECESSOR_TIP}'`,
    "marker.migration_tip <> '20260916003000'",
  )}),
  Object.freeze({name: 'wrong-trigger-shape', sql: replaceRequired(
    sql,
    'trigger_row.tgtype = 7',
    'trigger_row.tgtype = 5',
  )}),
  Object.freeze({name: 'history-not-fail-closed', sql: replaceRequired(
    sql,
    'exercise_count <> 0 OR recovery_count <> 0',
    'exercise_count <> 0',
  )}),
  Object.freeze({name: 'owner-preservation-removed', sql: replaceRequired(
    sql,
    'replacement_function_owner IS DISTINCT FROM old_function_owner',
    'replacement_function_owner IS NULL',
  )}),
  Object.freeze({name: 'unsafe-function-authority', sql: replaceRequired(
    sql,
    'RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog',
    'RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog',
  )}),
  Object.freeze({name: 'parser-version-invented', sql: replaceRequired(
    sql,
    "'enterprise-parser-1'",
    "'spreadsheet-grid-v1'",
  )}),
  Object.freeze({name: 'old-body-hash-substitution', sql: replaceRequired(
    sql,
    OLD_FUNCTION_BODY_SHA256,
    '0000000000000000000000000000000000000000000000000000000000000000',
  )}),
  Object.freeze({name: 'storage-predicate-replaced-by-comment', sql: replaceRequired(
    sql,
    "OR NEW.storage_path <> format('%s/%s/enterprise-evidence/%s.bin', NEW.org_id, NEW.workspace_id, NEW.source_id)",
    "OR FALSE -- OR NEW.storage_path <> format('%s/%s/enterprise-evidence/%s.bin', NEW.org_id, NEW.workspace_id, NEW.source_id)",
  )}),
  Object.freeze({name: 'wrong-new-identity', sql: replaceRequired(
    sql,
    `SET migration_tip = '${CURRENT_TIP}'`,
    `SET migration_tip = '${PREDECESSOR_TIP}'`,
  )}),
  Object.freeze({name: 'extra-grant', sql: `${sql}\nGRANT EXECUTE ON FUNCTION public.enterprise_source_version_derive() TO authenticated;\n`}),
  Object.freeze({name: 'extra-statement', sql: `${sql}\nSELECT 1;\n`}),
]);

export const buildFrozenEnterpriseSourceVersionAdversaries = frozenAuthoritySql => Object.freeze([
  Object.freeze({name: 'frozen-storage-predicate-changed', sql: replaceRequired(
    frozenAuthoritySql,
    "NEW.storage_bucket <> 'source-uploads'",
    "NEW.storage_bucket <> 'substituted-bucket'",
  )}),
  Object.freeze({name: 'frozen-retained-parser-changed', sql: replaceRequired(
    frozenAuthoritySql,
    "WHEN 'text/csv' THEN 'csv'",
    "WHEN 'text/csv' THEN 'text_native'",
  )}),
]);

export const buildFrozenAssessClassifierAdversaries = frozenClassifierSql => Object.freeze([
  Object.freeze({name: 'frozen-classifier-body-changed', sql: replaceRequired(
    frozenClassifierSql, "RETURN 'document';", "RETURN 'interview';",
  )}),
  Object.freeze({name: 'frozen-classifier-strictness-changed', sql: replaceRequired(
    frozenClassifierSql, 'LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog',
    'LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog',
  )}),
]);
