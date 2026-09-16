import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assessImportCommands, assessImportScripts, assessImportGroups, validateAssessImportDatabaseUrl, isAssessImportSnapshotPath, observedAssessImportResults } from './assessImportValidationContract.mjs';

test('observed assertion output cannot be synthesized from green exit or a skipped assertion', () => {
  assert.deepEqual(observedAssessImportResults('exitCode: 0\nall good'), []);
  const results = observedAssessImportResults('ok 1 - real check\nok 2 - unavailable # SKIP\nnot ok 3 - failed\n# pass 1\n# skipped 1\n');
  assert.deepEqual(results.slice(0, 3).map(item => item.status), ['passed', 'not_run', 'failed']);
  assert.deepEqual(results[3], { kind: 'tap-summary', metric: 'pass', count: 1 });
  assert.deepEqual(observedAssessImportResults('ASSESS_DOCUMENT_MAPPING_PG_ASSERTION {"testId":"MAP-PG-001-scope","result":"passed","detail":"not retained"}\n'), [{ kind: 'postgres-assertion', testId: 'MAP-PG-001-scope', status: 'passed' }]);
  assert.deepEqual(observedAssessImportResults('ASSESS_DOCUMENT_MAPPING_PG_ASSERTION invalid\nASSESS_DOCUMENT_MAPPING_PG_ASSERTION {"testId":"foreign","result":"passed"}'), []);
});

test('source identity includes exact synthetic documents and static scanner authority', () => {
  for (const path of ['testing/assess-import/fixtures/meeting-transcript.txt', 'testing/assess-import/fixtures/process-sop.md', 'testing/assess-import/fixtures/process-information.csv', 'testing/assess-import/fixtures/workbook.xlsx', 'tests/fixtures/assessImportSpreadsheets.ts', 'docs/quality/ai-boundary-static-scan-allowlist.json']) assert.equal(isAssessImportSnapshotPath(path), true);
  for (const path of ['output/local-private/secret.txt', '.env.openai.local', 'tools/user.txt', 'docs/marketing/user.md']) assert.equal(isAssessImportSnapshotPath(path), false);
});

test('every feature command binds independent canonical execution source', () => {
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
  for (const group of Object.keys(assessImportGroups)) assert.equal(assessImportCommands(group, scripts).length, assessImportGroups[group].length);
});
test('substituted command cannot validate by copying its own manifest', () => {
  const changed = { ...assessImportScripts, 'test:assess-import:parser': 'node -e "process.exit(0)"' };
  assert.throws(() => assessImportCommands('feature', changed), /SUBSTITUTED/);
});
test('unreviewed hooks, missing scripts and unknown groups reject', () => {
  for (const prefix of ['pre', 'post']) assert.throws(() => assessImportCommands('browser', { ...assessImportScripts, [`${prefix}test:assess-import:browser`]: 'echo pass' }), /SUBSTITUTED/);
  assert.throws(() => assessImportCommands('feature', {}), /SUBSTITUTED/);
  assert.throws(() => assessImportCommands('other', assessImportScripts), /GROUP_INVALID/);
});
test('database verification never treats a missing environment as a passing skip', () => {
  assert.throws(() => validateAssessImportDatabaseUrl(undefined), /NOT_RUN/);
  assert.equal(validateAssessImportDatabaseUrl('postgres://postgres@127.0.0.1:6543/postgres'), 'postgres://postgres@127.0.0.1:6543/postgres');
});
test('database scope rejects remote targets, other databases, query routing and missing ports', () => {
  for (const value of ['postgres://postgres@example.invalid:5432/postgres', 'postgres://postgres@127.0.0.1:5432/customer', 'postgres://postgres@127.0.0.1:5432/postgres?host=example.invalid', 'postgres://postgres@127.0.0.1/postgres', 'https://127.0.0.1:5432/postgres']) assert.throws(() => validateAssessImportDatabaseUrl(value), /SCOPE_INVALID/);
});
