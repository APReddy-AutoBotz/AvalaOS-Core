import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CRITICAL_SOURCES, FOCUSED_TESTS, THRESHOLDS,
  assertCoverageFilesReported, validateCoverageInventory } from './runCreationAccessCoverage.mjs';

test('critical creation and synthetic Admin coverage inventory is complete and thresholded', () => {
  assert.equal(validateCoverageInventory(), true);
  assert.equal(CRITICAL_SOURCES.length, 11);
  assert.equal(FOCUSED_TESTS.length, 12);
  assert.deepEqual(THRESHOLDS, { lines: 90, branches: 80, functions: 85 });
  assert.ok(CRITICAL_SOURCES.includes('supabase/functions/_shared/processCreationDb.ts'));
  assert.ok(CRITICAL_SOURCES.includes('supabase/functions/_shared/syntheticAdminDb.ts'));
});

test('removing difficult adapter or focused test cannot produce an inventory PASS', () => {
  assert.throws(() => validateCoverageInventory(CRITICAL_SOURCES.filter(file => !file.endsWith('syntheticAdminDb.ts'))),
    /CREATION_ACCESS_COVERAGE_SOURCE_DRIFT/u);
  assert.throws(() => validateCoverageInventory([...CRITICAL_SOURCES, CRITICAL_SOURCES[0]]),
    /CREATION_ACCESS_COVERAGE_SOURCE_DRIFT/u);
  assert.throws(() => validateCoverageInventory(CRITICAL_SOURCES, FOCUSED_TESTS.slice(1)),
    /CREATION_ACCESS_COVERAGE_TEST_DRIFT/u);
});

test('green suite without a real V8 report or any selected file fails closed', () => {
  assert.throws(() => assertCoverageFilesReported('# tests 8\n# pass 8\n', ['processCreationDb.js']),
    /CREATION_ACCESS_COVERAGE_REPORT_MISSING/u);
  assert.throws(() => assertCoverageFilesReported('# start of coverage report\n# processCreationCommand.js | 100 | 100 | 100\n# end of coverage report',
    ['processCreationCommand.js', 'processCreationDb.js']), /CREATION_ACCESS_COVERAGE_SOURCE_NOT_REPORTED:processCreationDb.js/u);
  assert.equal(assertCoverageFilesReported('# start of coverage report\n# processCreationDb.js | 91 | 80 | 85\n# end of coverage report',
    ['processCreationDb.js']), true);
});
