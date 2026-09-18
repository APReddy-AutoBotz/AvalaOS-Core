import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  ENTERPRISE_PROJECTION_SITE_COUNT,
  RELATIONSHIP_REVIEW_TABLE,
  assertEnterpriseProjectionOwnerContract,
  assertEnterpriseProjectionInventory,
  assertProjectionColumnsExist,
  extractEnterpriseProjectionSchemaContract,
} from './enterpriseProjectionSchemaContract.mjs';

const sourcePath = new URL('../supabase/functions/_shared/enterpriseIntelligenceQuery.ts', import.meta.url);
const source = await readFile(sourcePath, 'utf8');
const relationshipNeedle = `${RELATIONSHIP_REVIEW_TABLE}?select=id,candidate_id,candidate_version,relationship,rationale,reviewer_id,created_at`;

const replaceOnce = (input, before, after) => {
  assert.equal(input.split(before).length - 1, 1, `expected exactly one mutation target: ${before}`);
  return input.replace(before, after);
};

test('production projection inventory is exact, nonempty, and relationship ownership is reviewer-backed', () => {
  const contract = extractEnterpriseProjectionSchemaContract(source);
  assert.equal(contract.siteCount, ENTERPRISE_PROJECTION_SITE_COUNT);
  assert.equal(contract.sites.length, ENTERPRISE_PROJECTION_SITE_COUNT);
  assertEnterpriseProjectionInventory(contract);
  const relationship = assertEnterpriseProjectionOwnerContract(contract);
  assert.equal(relationship.table, RELATIONSHIP_REVIEW_TABLE);
  assert.ok(relationship.columns.includes('reviewer_id'));
  assert.ok(!relationship.columns.includes('created_by'));
});

test('comments cannot fabricate a projection site', () => {
  const contract = extractEnterpriseProjectionSchemaContract(`${source}\n// fake?select=id,created_by&limit=1\nconst unrelatedProjectionMarker = 'fake2?select=id,reviewer_id';\n`);
  assert.equal(contract.siteCount, ENTERPRISE_PROJECTION_SITE_COUNT);
  assert.ok(!contract.sites.some(site => site.table === 'fake' || site.table === 'fake2'));
});

test('empty path is rejected', () => {
  const before = `\`${relationshipNeedle}&\${scope}&order=created_at.desc,id.desc&limit=1000\``;
  const mutated = replaceOnce(source, before, "''");
  assert.throws(() => extractEnterpriseProjectionSchemaContract(mutated), /ENTERPRISE_PROJECTION_SCHEMA_PATH_MALFORMED/u);
});

test('table identifiers containing digits are extracted without weakening selectors', () => {
  const mutated = replaceOnce(source, relationshipNeedle, relationshipNeedle.replace(RELATIONSHIP_REVIEW_TABLE, 'enterprise_evidence2_candidate_reviews'));
  const contract = extractEnterpriseProjectionSchemaContract(mutated);
  assert.ok(contract.sites.some(site => site.table === 'enterprise_evidence2_candidate_reviews'));
});

test('dynamic projection paths are rejected', () => {
  const before = `load('transcriptCandidateRelationships', \`${relationshipNeedle}&\${scope}&order=created_at.desc,id.desc&limit=1000\`);`;
  const mutated = replaceOnce(source, before, "load('transcriptCandidateRelationships', relationshipProjectionPath);");
  assert.throws(() => extractEnterpriseProjectionSchemaContract(mutated), /ENTERPRISE_PROJECTION_SCHEMA_DYNAMIC_PATH/u);
});

test('interpolation cannot contribute selected columns', () => {
  const before = `${relationshipNeedle}&\${scope}`;
  const after = `${relationshipNeedle.replace(',created_at', '\${dynamicColumn},created_at')}&\${scope}`;
  const mutated = replaceOnce(source, before, after);
  assert.throws(() => extractEnterpriseProjectionSchemaContract(mutated), /ENTERPRISE_PROJECTION_SCHEMA_DYNAMIC_SELECT/u);
});

test('shadowed or substituted load and query bindings are rejected', () => {
  const shadowedLoad = replaceOnce(source, 'const tasks: Array<Promise<void>> = [];',
    'const tasks: Array<Promise<void>> = []; const load = () => undefined;');
  assert.throws(() => extractEnterpriseProjectionSchemaContract(shadowedLoad), /ENTERPRISE_PROJECTION_SCHEMA_LOAD_BINDING_NOT_EXACT/u);
  const shadowedQuery = replaceOnce(source, 'const tasks: Array<Promise<void>> = [];',
    'const tasks: Array<Promise<void>> = []; const query = () => [];');
  assert.throws(() => extractEnterpriseProjectionSchemaContract(shadowedQuery), /ENTERPRISE_PROJECTION_SCHEMA_QUERY_SHADOWED/u);
  const substitutedQuery = replaceOnce(source, '  query: typeof postgrest = postgrest,', '  query2: typeof postgrest = postgrest,');
  assert.throws(() => extractEnterpriseProjectionSchemaContract(substitutedQuery), /ENTERPRISE_PROJECTION_SCHEMA_QUERY_BINDING_NOT_EXACT/u);
});

test('non-simple and duplicate selected columns are rejected', () => {
  const nonSimple = replaceOnce(source, relationshipNeedle, relationshipNeedle.replace('reviewer_id', 'reviewer:reviewer_id'));
  assert.throws(() => extractEnterpriseProjectionSchemaContract(nonSimple), /ENTERPRISE_PROJECTION_SCHEMA_SELECTOR_UNSUPPORTED/u);
  const duplicate = replaceOnce(source, relationshipNeedle, relationshipNeedle.replace('reviewer_id', 'reviewer_id,reviewer_id'));
  assert.throws(() => extractEnterpriseProjectionSchemaContract(duplicate), /ENTERPRISE_PROJECTION_SCHEMA_SELECTOR_DUPLICATE/u);
});

test('missing database columns reject even when all other extracted columns exist', () => {
  const contract = extractEnterpriseProjectionSchemaContract(source);
  const rows = [];
  for (const site of contract.sites) {
    for (const column of site.columns) rows.push({ table_name: site.table, column_name: column });
  }
  const withoutReviewer = rows.filter(row => !(row.table_name === RELATIONSHIP_REVIEW_TABLE && row.column_name === 'reviewer_id'));
  assert.throws(() => assertProjectionColumnsExist(contract, withoutReviewer),
    /ENTERPRISE_PROJECTION_SCHEMA_MISSING_COLUMN:enterprise_evidence_candidate_relationship_reviews\.reviewer_id/u);
});

test('created_by substitution cannot satisfy the reviewer ownership contract', () => {
  const mutated = replaceOnce(source, relationshipNeedle, relationshipNeedle.replace('reviewer_id', 'created_by'));
  const contract = extractEnterpriseProjectionSchemaContract(mutated);
  assert.throws(() => assertEnterpriseProjectionOwnerContract(contract), /ENTERPRISE_PROJECTION_SCHEMA_RELATIONSHIP_OWNER_MISMATCH/u);
});

test('reviewed inventory rejects dropping a column without changing the site count', () => {
  const changed = replaceOnce(source, 'assess_application_assets?select=id,name,created_at',
    'assess_application_assets?select=id,created_at');
  const contract = extractEnterpriseProjectionSchemaContract(changed);
  assert.equal(contract.siteCount, 51);
  assert.throws(() => assertEnterpriseProjectionInventory(contract), /ENTERPRISE_PROJECTION_SCHEMA_INVENTORY_MISMATCH/u);
});

test('reviewed inventory rejects another valid-schema table and columns at the same target', () => {
  const changed = replaceOnce(source, 'assess_application_assets?select=id,name,created_at',
    'enterprise_evidence_sources?select=id,display_name,mime_type,current_version,status,created_by,created_at');
  const contract = extractEnterpriseProjectionSchemaContract(changed);
  assert.equal(contract.siteCount, 51);
  assert.throws(() => assertEnterpriseProjectionInventory(contract), /ENTERPRISE_PROJECTION_SCHEMA_INVENTORY_MISMATCH/u);
});

test('reviewed inventory rejects a renamed target or reordered selection', () => {
  for (const changed of [
    replaceOnce(source, "load('applications',", "load('substitutedApplications',"),
    replaceOnce(source, 'assess_application_assets?select=id,name,created_at',
      'assess_application_assets?select=name,id,created_at'),
  ]) {
    const contract = extractEnterpriseProjectionSchemaContract(changed);
    assert.equal(contract.siteCount, 51);
    assert.throws(() => assertEnterpriseProjectionInventory(contract), /ENTERPRISE_PROJECTION_SCHEMA_INVENTORY_MISMATCH/u);
  }
});
