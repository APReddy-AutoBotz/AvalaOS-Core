import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTROL_SCRIPT_COVERAGE_COMMAND,
  CONTROL_SCRIPT_COVERAGE_ENTRY,
  CONTROL_SCRIPT_SCENARIO_PRODUCERS,
  CONTROL_SCRIPT_SCENARIOS,
  CONTROL_SCRIPT_SCENARIOS_BY_REPORT,
  CONTROL_SCRIPT_SOURCES,
  CONTROL_SCRIPT_TEST_TIMEOUT_MS,
  CONTROL_SCRIPT_TESTS,
  buildControlScriptTestEnvironment,
  buildControlScriptTestArguments,
  createExclusiveControlScriptOutputDirectory,
  parseControlScriptLcov,
  parseControlScriptTap,
  projectControlScriptTapFailures,
  readControlScriptScenarios,
  sanitizeControlScriptStartupFailure,
  validateControlScriptFailureProjection,
  validateControlScriptTestCompletion,
  validateControlScriptTestScheduling,
  validateExclusiveControlScriptAttempt,
  verifyControlScriptCoverageMeasurement,
  PR_C_GIT_255_FSCK_MSG_IDS,
  classifyCredentialPreflightFsckFailureForTest,
  isCredentialPreflightFsckFailureCode,
} from './runPrCControlledHumanScriptCoverage.mjs';
import {
  assertCredentialPreflightFixtureGitResultForTest,
} from './prCControlledHumanCredentialPreflightEntryFixture.mjs';
import { PR_C_BASE_SHA } from './transcriptFlowPrCEvidenceScope.mjs';

const inventory = CONTROL_SCRIPT_SOURCES.map((source, index) => ({ path: source, sha256: `sha256:${String(index).padStart(64, '0')}` }));
const lcov = inventory.map((source, index) => `TN:\nSF:${source.path}\nFN:1,function${index}\nFNDA:${index === 0 ? 0 : 1},function${index}\nFNF:1\nFNH:${index === 0 ? 0 : 1}\nBRDA:1,0,0,${index === 0 ? 0 : 1}\nBRF:1\nBRH:${index === 0 ? 0 : 1}\nDA:1,${index === 0 ? 0 : 1}\nLF:1\nLH:${index === 0 ? 0 : 1}\nend_of_record\n`).join('');
const tap = '# tests 7\n# pass 7\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
const makeReport = () => ({
  contractVersion: 'pr-c-control-script-coverage-1', status: 'passed', command: CONTROL_SCRIPT_COVERAGE_COMMAND,
  entryPath: CONTROL_SCRIPT_COVERAGE_ENTRY, arguments: [],
  nodeMajor: 22, acceptedBase: PR_C_BASE_SHA, head: 'a'.repeat(40),
  governedFiles: [...CONTROL_SCRIPT_SOURCES], governedWorkingTreeDigest: 'b'.repeat(64),
  entryExecutionMeasurementBoundary: 'separate-mandatory-production-entry-scenarios-not-counted-in-parent-lcov',
  tests: [...CONTROL_SCRIPT_TESTS], testSummary: parseControlScriptTap(tap),
  scenarioReports: Object.entries(CONTROL_SCRIPT_SCENARIO_PRODUCERS).sort(([left], [right]) => left.localeCompare(right))
    .map(([file, producer], index) => ({ file, producer, sha256: `sha256:${String(index + 10).padStart(64, '0')}` })),
  scenarios: [...CONTROL_SCRIPT_SCENARIOS].sort(), sources: parseControlScriptLcov(lcov, inventory),
});
const expectedScenarioOwnership = {
  'acceptance-execution-profile-scenarios.json': ['acceptance-execution-profile-direct-import'],
  'acceptance-playwright-metadata-scenarios.json': ['acceptance-playwright-metadata-installed-synthetic-config'],
  'control-script-coverage-runner-scenarios.json': ['control-script-coverage-runner-self-test'],
  'credential-preflight-entry-scenarios.json': [
    'production-entry-bootstrap-binding-failure',
    'production-entry-current-empty-happy-path',
    'production-entry-current-empty-null-installed-digest',
    'production-entry-current-empty-orphan-mutable-row',
    'production-entry-current-empty-statement-count-failure',
    'production-entry-current-empty-wrong-installed-digest',
    'production-entry-database-begin-failure',
    'production-entry-database-close-failure',
    'production-entry-database-configuration-failure',
    'production-entry-database-connect-failure',
    'production-entry-database-idle-timeout-failure',
    'production-entry-database-inventory-cleanup-failure',
    'production-entry-database-inventory-failure',
    'production-entry-database-rollback-failure',
    'production-entry-database-rollback-falsy-failure',
    'production-entry-database-show-failure',
    'production-entry-database-statement-timeout-failure',
    'production-entry-dirty-source',
    'production-entry-event-authority-failure',
    'production-entry-existing-output-collision',
    'production-entry-nonancestor-base',
    'production-entry-nonpat-forbidden-credential-failure',
    'production-entry-nonpat-password-json-failure',
    'production-entry-nonpat-password-persona-set-failure',
    'production-entry-nonpat-password-values-failure',
    'production-entry-nonpat-required-fields-failure',
    'production-entry-nonpat-signing-authority-failure',
    'production-entry-nonpat-target-tuple-failure',
    'production-entry-preview-failure',
    'production-entry-source-change-during-execution',
    'production-entry-source-identity-happy-path',
    'production-entry-wrong-output-path',
  ],
  'credential-preflight-unit-scenarios.json': [
    'artifact-over-16-kib',
    'password-non-string',
    'password-over-128',
    'signing-key-leading-trailing-whitespace',
    'signing-key-under-32-over-4096',
  ],
  'exhaustive-acceptance-evidence-scenarios.json': ['exhaustive-acceptance-evidence-direct-import'],
  'exhaustive-acceptance-report-scenarios.json': [
    'exhaustive-report-hostile-provenance-blocked',
    'exhaustive-report-local-hosted-substitution-blocked',
    'exhaustive-report-malformed-declaration-fails-closed',
    'exhaustive-report-planned-scope-blocked',
  ],
  'transcript-flow-browser-scenarios.json': ['transcript-flow-browser-exported-local-consumer'],
};
const expectedScenarioProducers = {
  'acceptance-execution-profile-scenarios.json': 'scripts/acceptanceExecutionProfile.test.mjs',
  'acceptance-playwright-metadata-scenarios.json': 'scripts/acceptancePlaywrightMetadata.test.mjs',
  'control-script-coverage-runner-scenarios.json': 'scripts/runPrCControlledHumanScriptCoverage.test.mjs',
  'credential-preflight-entry-scenarios.json': 'scripts/prCControlledHumanCredentialPreflightEntry.test.mjs',
  'credential-preflight-unit-scenarios.json': 'scripts/prCControlledHumanCredentialPreflight.test.mjs',
  'exhaustive-acceptance-evidence-scenarios.json': 'scripts/exhaustiveAcceptanceEvidence.test.mjs',
  'exhaustive-acceptance-report-scenarios.json': 'scripts/runExhaustiveAcceptanceReport.test.mjs',
  'transcript-flow-browser-scenarios.json': 'scripts/runTranscriptFlowBrowser.test.mjs',
};

const writeScenarioFixture = async (mutate = () => {}) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pr-c-control-script-scenarios-'));
  const reports = Object.fromEntries(Object.entries(expectedScenarioOwnership).map(([file, names]) => [file, {
    contractVersion: 'pr-c-control-script-scenarios-1',
    producer: expectedScenarioProducers[file],
    scenarios: names.map(name => ({ name, status: 'passed' })),
  }]));
  mutate(reports);
  for (const [file, report] of Object.entries(reports)) await writeFile(path.join(directory, file), JSON.stringify(report));
  return directory;
};

test('coverage parser reports every exact expected source and discloses zero-covered paths', () => {
  const sources = parseControlScriptLcov(lcov, inventory);
  assert.equal(sources.length, 17);
  assert.deepEqual(sources[0].lines, { hit: 0, found: 1, percent: 0 });
  assert.deepEqual(sources[0].uncoveredLines, [1]);
  assert.deepEqual(sources[0].uncoveredBranches, ['1:0:0']);
  assert.deepEqual(sources[0].uncoveredFunctions, ['function0']);
  const absent = parseControlScriptLcov(lcov.replace(/TN:[\s\S]*?end_of_record\n/u, ''), inventory);
  assert.equal(absent[0].loaded, false);
  assert.deepEqual(absent[0].lines, { hit: 0, found: 0, percent: 0 });
  assert.throws(() => parseControlScriptLcov(`${lcov}${lcov.split('end_of_record')[0]}end_of_record\n`, inventory), /duplicate-source/u);
  assert.throws(() => parseControlScriptLcov(`${lcov}TN:\nSF:scripts/substituted.mjs\nDA:1,1\nend_of_record\n`, inventory), /unexpected-source/u);
  assert.throws(() => parseControlScriptLcov('', inventory), /lcov-empty/u);
  assert.throws(() => parseControlScriptLcov('  \n', inventory), /lcov-empty/u);
});

test('coverage verifier rejects substitutions and mutations while retaining truthful unloaded zero rows', () => {
  const binding = {
    head: 'a'.repeat(40), governedFiles: [...CONTROL_SCRIPT_SOURCES], governedWorkingTreeDigest: 'b'.repeat(64),
    command: CONTROL_SCRIPT_COVERAGE_COMMAND, entryPath: CONTROL_SCRIPT_COVERAGE_ENTRY, arguments: [], nodeMajor: 22,
  };
  assert.equal(verifyControlScriptCoverageMeasurement(makeReport(), inventory, binding).status, 'passed');
  for (const mutate of [
    report => { report.command = 'node substituted.mjs'; },
    report => { report.entryPath = 'scripts/substituted.mjs'; },
    report => { report.arguments = ['--substituted']; },
    report => { report.governedFiles = report.governedFiles.slice(1); },
    report => { report.tests = report.tests.slice(1); },
    report => { report.testSummary.skipped = 1; report.testSummary.pass -= 1; },
    report => { report.scenarios = report.scenarios.slice(1); },
    report => { report.scenarioReports = []; },
    report => { report.scenarioReports[0].producer = 'scripts/substituted.test.mjs'; },
    report => { report.scenarioReports[0].file = 'substituted.json'; },
    report => { report.sources[0].sha256 = `sha256:${'f'.repeat(64)}`; },
    report => { report.sources[0].loaded = false; report.sources[0].lines = { hit: 0, found: 0, percent: 0 }; report.sources[0].branches = { hit: 0, found: 0, percent: 0 }; report.sources[0].functions = { hit: 0, found: 0, percent: 0 }; report.sources[0].uncoveredLines = []; report.sources[0].uncoveredBranches = []; report.sources[0].uncoveredFunctions = []; },
    report => { report.sources[0].lines.percent = 100; },
    report => { report.sources.pop(); },
  ]) {
    const report = structuredClone(makeReport());
    mutate(report);
    if (report.sources[0]?.loaded === false) assert.equal(verifyControlScriptCoverageMeasurement(report, inventory, binding).status, 'passed');
    else assert.throws(() => verifyControlScriptCoverageMeasurement(report, inventory, binding));
  }
  const wrongBinding = { ...binding, head: 'f'.repeat(40) };
  assert.throws(() => verifyControlScriptCoverageMeasurement(makeReport(), inventory, wrongBinding));
  assert.throws(() => verifyControlScriptCoverageMeasurement(makeReport(), inventory, { ...binding, governedWorkingTreeDigest: 'f'.repeat(64) }));
  assert.throws(() => verifyControlScriptCoverageMeasurement(makeReport(), inventory, { ...binding, command: 'node substituted.mjs' }));
  assert.throws(() => verifyControlScriptCoverageMeasurement(makeReport(), inventory, { ...binding, entryPath: 'scripts/substituted.mjs' }));
  assert.throws(() => verifyControlScriptCoverageMeasurement(makeReport(), inventory, { ...binding, arguments: ['--substituted'] }));
  assert.throws(() => verifyControlScriptCoverageMeasurement(makeReport(), inventory, { ...binding, governedFiles: binding.governedFiles.slice(1) }));
  for (const pathValue of [
    'scripts/acceptanceExecutionProfile.mjs',
    'scripts/exhaustiveAcceptanceEvidence.mjs',
    'scripts/runPrCControlledHumanScriptCoverage.mjs',
  ]) {
    const missingMandatory = structuredClone(makeReport());
    const mandatory = missingMandatory.sources.find(source => source.path === pathValue);
    mandatory.loaded = false;
    mandatory.lines = { hit: 0, found: 0, percent: 0 };
    mandatory.branches = { hit: 0, found: 0, percent: 0 };
    mandatory.functions = { hit: 0, found: 0, percent: 0 };
    mandatory.uncoveredLines = [];
    mandatory.uncoveredBranches = [];
    mandatory.uncoveredFunctions = [];
    assert.throws(() => verifyControlScriptCoverageMeasurement(missingMandatory, inventory, binding), /mandatory-source-unmeasured/u, pathValue);
  }
});

test('TAP verifier rejects green exits with skipped missing or incomplete test reports', () => {
  assert.deepEqual(parseControlScriptTap(tap), { tests: 7, pass: 7, fail: 0, cancelled: 0, skipped: 0, todo: 0 });
  for (const changed of [
    tap.replace('# skipped 0', '# skipped 1').replace('# pass 7', '# pass 6'),
    tap.replace('# fail 0', '# fail 1').replace('# pass 7', '# pass 6'),
    tap.replace('# todo 0\n', ''),
    `${tap}# tests 7\n`,
  ]) assert.throws(() => parseControlScriptTap(changed));
});

test('failure projection retains only fixed classifications and exact source-owned coordinates', async () => {
  const exactLocation = path.join(process.cwd(), 'scripts', 'prCControlledHumanCredentialPreflightEntry.test.mjs');
  const failedTap = `TAP version 13
not ok 1 - hostile title must not be retained
  ---
  failureType: 'testCodeFailure'
  error: 'PR_C_PREFLIGHT_FIXTURE_IDENTITY_CLAIMS_REJECTED'
  stack: |-
    TestContext.<anonymous> (${exactLocation}:472:16)
  ...
not ok 2 - ${exactLocation}
  ---
  failureType: 'hookFailed'
  stack: |-
    at ${exactLocation}:39:3
  ...
1..2
# tests 2
# pass 0
# fail 2
# cancelled 0
# skipped 0
# todo 0
`;
  const projection = projectControlScriptTapFailures(failedTap, process.cwd(), 1);
  assert.deepEqual(projection, {
    classification: 'controlled-human-source-test-failure',
    summary: { tests: 2, pass: 0, fail: 2, cancelled: 0, skipped: 0, todo: 0 },
    failures: [
      { classification: 'test', code: 'fixture-identity-claims-rejected',
        locations: [{ file: 'scripts/prCControlledHumanCredentialPreflightEntry.test.mjs', line: 472, column: 16 }] },
      { classification: 'hook', code: 'hook-failure',
        locations: [{ file: 'scripts/prCControlledHumanCredentialPreflightEntry.test.mjs', line: 39, column: 3 }] },
    ],
  });
  assert.equal(JSON.stringify(projection).includes('hostile title'), false);
  const titleInjection = failedTap.replace('hostile title must not be retained', 'PR_C_PREFLIGHT_FIXTURE_IDENTITY_CLAIMS_REJECTED')
    .replace("  error: 'PR_C_PREFLIGHT_FIXTURE_IDENTITY_CLAIMS_REJECTED'\n", '');
  assert.equal(projectControlScriptTapFailures(titleInjection, process.cwd(), 1).failures[0].code, 'assertion-failure');
  const fixtureUnderStack = failedTap.replace("  error: 'PR_C_PREFLIGHT_FIXTURE_IDENTITY_CLAIMS_REJECTED'\n", '')
    .replace('  stack: |-\n', "  stack: |-\n    error: 'PR_C_PREFLIGHT_FIXTURE_IDENTITY_CLAIMS_REJECTED'\n");
  assert.equal(projectControlScriptTapFailures(fixtureUnderStack, process.cwd(), 1).failures[0].code, 'assertion-failure');
  assert.equal(projectControlScriptTapFailures(fixtureUnderStack.replace('    error:', '    code:'), process.cwd(), 1).failures[0].code,
    'assertion-failure');
  assert.equal(projectControlScriptTapFailures(failedTap.replace("  error: 'PR_C_PREFLIGHT_FIXTURE_IDENTITY_CLAIMS_REJECTED'",
    "  code: 'PR_C_PREFLIGHT_FIXTURE_IDENTITY_CLAIMS_REJECTED'"), process.cwd(), 1).failures[0].code,
  'fixture-identity-claims-rejected');
  const fileWrapperTap = `TAP version 13
not ok 1 - ${exactLocation}
  ---
  failureType: 'testCodeFailure'
  error: 'test failed'
  ...
1..1
# tests 1
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
`;
  assert.deepEqual(projectControlScriptTapFailures(fileWrapperTap, process.cwd(), 1).failures, [
    { classification: 'file-wrapper', code: 'file-wrapper-failure', locations: [] },
  ]);
  assert.throws(() => projectControlScriptTapFailures(fileWrapperTap.replace(exactLocation, path.join(os.tmpdir(), 'foreign', 'scripts', 'prCControlledHumanCredentialPreflightEntry.test.mjs')), process.cwd(), 1), /tap-failure-file-wrapper/u);
  const nestedWrapperTap = `TAP version 13
    not ok 1 - nested assertion
      ---
      failureType: 'testCodeFailure'
      stack: |-
        at ${exactLocation}:472:16
      ...
not ok 1 - ${exactLocation}
  ---
  failureType: 'subtestsFailed'
  error: '1 subtest failed'
  ...
1..1
# tests 1
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
`;
  assert.deepEqual(projectControlScriptTapFailures(nestedWrapperTap, process.cwd(), 1).failures, [
    { classification: 'test', code: 'assertion-failure',
      locations: [{ file: 'scripts/prCControlledHumanCredentialPreflightEntry.test.mjs', line: 472, column: 16 }] },
    { classification: 'file-wrapper', code: 'file-wrapper-failure', locations: [] },
  ]);
  const hookTap = `TAP version 13
not ok 1 - before hook
  ---
  failureType: 'hookFailed'
  stack: |-
    at ${exactLocation}:30:1
  ...
not ok 2 - after hook
  ---
  failureType: 'hookFailed'
  stack: |-
    at ${exactLocation}:31:1
  ...
1..2
# tests 2
# pass 0
# fail 2
# cancelled 0
# skipped 0
# todo 0
`;
  assert.deepEqual(projectControlScriptTapFailures(hookTap, process.cwd(), 1).failures.map(item => item.classification), ['hook', 'hook']);
  const failureTypeUnderStack = hookTap.replace("  failureType: 'hookFailed'\n  stack: |-",
    "  stack: |-\n    failureType: 'hookFailed'");
  assert.notEqual(projectControlScriptTapFailures(failureTypeUnderStack, process.cwd(), 1).failures[0].classification, 'hook');
  assert.equal(sanitizeControlScriptStartupFailure(new Error('PR_C_PREFLIGHT_FIXTURE_SOURCE_REJECTED')),
    'PR_C_PREFLIGHT_FIXTURE_SOURCE_REJECTED');
  assert.equal(sanitizeControlScriptStartupFailure(new Error('PR_C_PREFLIGHT_FIXTURE_GIT_REJECTED:bundle:STATUS')),
    'PR_C_PREFLIGHT_FIXTURE_GIT_REJECTED:bundle:STATUS');
  assert.equal(sanitizeControlScriptStartupFailure(new Error('PR_C_PREFLIGHT_FIXTURE_SOURCE_REJECTED:bundle:STATUS')), 'UNKNOWN');
  assert.equal(sanitizeControlScriptStartupFailure(new Error('raw startup detail')), 'UNKNOWN');
  assert.equal(sanitizeControlScriptStartupFailure(Object.create(Error.prototype,
    { message: { get() { throw new Error('raw getter detail'); } } })), 'UNKNOWN');
  assert.equal(PR_C_GIT_255_FSCK_MSG_IDS.length, 76);
  assert.equal(new Set(PR_C_GIT_255_FSCK_MSG_IDS).size, 76);
  const objectId = 'a'.repeat(40);
  const fsckArgs = ['fsck', '--full', '--strict'];
  const failureMessage = callback => {
    try { callback(); assert.fail('expected failure'); } catch (error) { return error.message; }
  };
  for (const [index, identifier] of PR_C_GIT_255_FSCK_MSG_IDS.entries()) {
    const camel = identifier.toLowerCase().replace(/_([a-z0-9])/gu, (_match, character) => character.toUpperCase());
    const stderr = index % 3 === 0
      ? `error in tree ${objectId}: ${camel}: fixed detail\n`
      : index % 3 === 1
        ? `error: object ${objectId}: ${camel}: fixed detail\n`
        : `error: refs/heads/fixture-${index}: ${camel}: fixed detail\n`;
    const category = `MSG_${identifier}`;
    assert.equal(classifyCredentialPreflightFsckFailureForTest(stderr), category);
    const token = `PR_C_PREFLIGHT_FIXTURE_FSCK_STATUS:1:${category}`;
    assert.equal(failureMessage(() => assertCredentialPreflightFixtureGitResultForTest(fsckArgs,
      { status: 1, stdout: '', stderr, error: null, signal: null })), token);
    assert.equal(isCredentialPreflightFsckFailureCode(token), true);
    assert.equal(sanitizeControlScriptStartupFailure(new Error(token)), token);
  }
  const badTree = `error in tree ${objectId}: badTree: fixed detail\n`;
  assert.equal(classifyCredentialPreflightFsckFailureForTest(`${badTree}error: object ${objectId}: badType: fixed detail\n`),
    'MULTIPLE_MSG_IDS');
  assert.equal(classifyCredentialPreflightFsckFailureForTest(`${badTree}${badTree}`), 'MSG_BAD_TREE');
  assert.equal(classifyCredentialPreflightFsckFailureForTest('fatal: fixed failure\n'), 'FATAL');
  assert.equal(classifyCredentialPreflightFsckFailureForTest('error: fixed failure without message id\n'), 'ERROR_WITHOUT_MSG_ID');
  for (const [stderr, category] of [
    ['error: packed-refs.header: badPackedRefHeader: fixed detail\n', 'MSG_BAD_PACKED_REF_HEADER'],
    ['error: packed-refs line 17: badPackedRefEntry: fixed detail\n', 'MSG_BAD_PACKED_REF_ENTRY'],
    ['error: packed-refs: emptyPackedRefsFile: fixed detail\n', 'MSG_EMPTY_PACKED_REFS_FILE'],
  ]) assert.equal(classifyCredentialPreflightFsckFailureForTest(stderr), category);
  for (const stderr of [
    '', Buffer.from([0xff]), 'unstructured badTree text\n', `error in tree ${objectId}: notKnown: badTree detail\n`,
    `error: object ${objectId}: notKnown: badTree detail\n`, `error: refs/heads/badTree: fixed detail\n`,
    'error: fixed badTree detail without message id\n', 'fatal: fixed badTree detail\n',
    'error: packed-refs.badTree: fixed detail\n', 'error: packed-refs line 0: badPackedRefEntry: fixed detail\n',
    'error: packed-refs line 17: notKnown: badPackedRefEntry detail\n',
    `warning in tree ${objectId}: badTree: warning only\n`, `${badTree}fatal: fixed failure\n`,
    `error in tree ${objectId}: badTree: fixed\u0000detail\n`, `error: fixed\u0085detail\n`,
  ]) assert.equal(classifyCredentialPreflightFsckFailureForTest(stderr), 'UNKNOWN');
  assert.deepEqual(assertCredentialPreflightFixtureGitResultForTest(fsckArgs,
    { status: 0, stdout: '', stderr: '', error: null, signal: null }), { status: 0, stdout: '' });
  assert.equal(assertCredentialPreflightFixtureGitResultForTest(fsckArgs,
    { status: 1, stdout: '', stderr: badTree, error: null, signal: null }, [0, 1]).status, 1);
  for (const [result, expected] of [
    [{ status: 1, stdout: '', stderr: badTree, error: { code: 'ETIMEDOUT' }, signal: null }, 'PR_C_PREFLIGHT_FIXTURE_GIT_REJECTED:fsck:TIMEOUT'],
    [{ status: 1, stdout: '', stderr: badTree, error: new Error('canary'), signal: null }, 'PR_C_PREFLIGHT_FIXTURE_GIT_REJECTED:fsck:EXECUTION'],
    [{ status: 1, stdout: '', stderr: badTree, error: null, signal: 'SIGTERM' }, 'PR_C_PREFLIGHT_FIXTURE_GIT_REJECTED:fsck:SIGNAL'],
    [{ status: 1, stdout: 'x'.repeat(4 * 1024 * 1024 + 1), stderr: badTree, error: null, signal: null }, 'PR_C_PREFLIGHT_FIXTURE_GIT_REJECTED:fsck:OUTPUT_LIMIT'],
    [{ status: 1.5, stdout: '', stderr: badTree, error: null, signal: null }, 'PR_C_PREFLIGHT_FIXTURE_GIT_REJECTED:fsck:STATUS'],
    [{ status: '1', stdout: '', stderr: badTree, error: null, signal: null }, 'PR_C_PREFLIGHT_FIXTURE_GIT_REJECTED:fsck:STATUS'],
    [{ status: 256, stdout: '', stderr: badTree, error: null, signal: null }, 'PR_C_PREFLIGHT_FIXTURE_GIT_REJECTED:fsck:STATUS'],
  ]) assert.equal(failureMessage(() => assertCredentialPreflightFixtureGitResultForTest(fsckArgs, result)), expected);
  assert.equal(failureMessage(() => assertCredentialPreflightFixtureGitResultForTest(['status', '--short'],
    { status: 1, stdout: '', stderr: badTree, error: null, signal: null })), 'PR_C_PREFLIGHT_FIXTURE_GIT_REJECTED:status:STATUS');
  assert.equal(isCredentialPreflightFsckFailureCode('PR_C_PREFLIGHT_FIXTURE_FSCK_STATUS:1:MSG_NOT_IN_GIT_255'), false);
  assert.equal(isCredentialPreflightFsckFailureCode('PR_C_PREFLIGHT_FIXTURE_FSCK_STATUS:0:UNKNOWN'), false);
  assert.equal(isCredentialPreflightFsckFailureCode('PR_C_PREFLIGHT_FIXTURE_FSCK_STATUS:256:UNKNOWN'), false);
  assert(!failureMessage(() => assertCredentialPreflightFixtureGitResultForTest(fsckArgs,
    { status: 7, stdout: '', stderr: 'private-canary', error: null, signal: null })).includes('private-canary'));
  const startupHookTap = hookTap.replace('before hook', 'owned startup hook')
    .replace(`  stack: |-\n    at ${exactLocation}:30:1`, `  error: 'PR_C_CONTROL_SCRIPT_STARTUP_FAILED:PR_C_PREFLIGHT_FIXTURE_SOURCE_REJECTED'\n  stack: |-\n    at ${exactLocation}:30:1`)
    .replace(/not ok 2 - after hook[\s\S]*?# todo 0\n/u, '# tests 1\n# pass 0\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n');
  assert.deepEqual(projectControlScriptTapFailures(startupHookTap, process.cwd(), 1).failures, [
    { classification: 'hook', code: 'PR_C_CONTROL_SCRIPT_STARTUP_FAILED:PR_C_PREFLIGHT_FIXTURE_SOURCE_REJECTED',
      locations: [{ file: 'scripts/prCControlledHumanCredentialPreflightEntry.test.mjs', line: 30, column: 1 }] },
  ]);
  const gitStartupHookTap = startupHookTap.replace('PR_C_PREFLIGHT_FIXTURE_SOURCE_REJECTED',
    'PR_C_PREFLIGHT_FIXTURE_GIT_REJECTED:bundle:STATUS');
  assert.equal(projectControlScriptTapFailures(gitStartupHookTap, process.cwd(), 1).failures[0].code,
    'PR_C_CONTROL_SCRIPT_STARTUP_FAILED:PR_C_PREFLIGHT_FIXTURE_GIT_REJECTED:bundle:STATUS');
  const fsckStartupToken = 'PR_C_PREFLIGHT_FIXTURE_FSCK_STATUS:1:MSG_BAD_TREE';
  const fsckStartupHookTap = startupHookTap.replace('PR_C_PREFLIGHT_FIXTURE_SOURCE_REJECTED', fsckStartupToken);
  assert.equal(projectControlScriptTapFailures(fsckStartupHookTap, process.cwd(), 1).failures[0].code,
    `PR_C_CONTROL_SCRIPT_STARTUP_FAILED:${fsckStartupToken}`);
  const unknownStartupHookTap = startupHookTap.replace('PR_C_PREFLIGHT_FIXTURE_SOURCE_REJECTED', 'UNKNOWN');
  assert.equal(projectControlScriptTapFailures(unknownStartupHookTap, process.cwd(), 1).failures[0].code, 'hook-failure');
  const startupWithWrapperTap = startupHookTap.replace('# tests 1\n# pass 0\n# fail 1', `not ok 2 - ${exactLocation}
  ---
  failureType: 'subtestsFailed'
  error: '1 subtest failed'
  ...
# tests 2
# pass 0
# fail 2`);
  assert.deepEqual(projectControlScriptTapFailures(startupWithWrapperTap, process.cwd(), 1).failures.map(item => item.classification),
    ['hook', 'file-wrapper']);
  assert.equal(projectControlScriptTapFailures(startupWithWrapperTap, process.cwd(), 1).failures[1].code, 'file-wrapper-failure');
  const duplicatedStartupTap = startupWithWrapperTap.replace("failureType: 'subtestsFailed'", "failureType: 'hookFailed'")
    .replace("  error: '1 subtest failed'", `  error: 'PR_C_CONTROL_SCRIPT_STARTUP_FAILED:PR_C_PREFLIGHT_FIXTURE_SOURCE_REJECTED'
  stack: |-
    at ${exactLocation}:30:1`);
  assert.equal(projectControlScriptTapFailures(duplicatedStartupTap, process.cwd(), 1).failures.length, 1);
  assert.throws(() => projectControlScriptTapFailures(duplicatedStartupTap.replace('not ok 2 -', 'not ok 1 -'), process.cwd(), 1),
    /tap-startup-hook/u);
  assert.throws(() => projectControlScriptTapFailures(duplicatedStartupTap.replace(
    "PR_C_CONTROL_SCRIPT_STARTUP_FAILED:PR_C_PREFLIGHT_FIXTURE_SOURCE_REJECTED'\n  stack: |-\n    at", "PR_C_CONTROL_SCRIPT_STARTUP_FAILED:UNKNOWN'\n  stack: |-\n    at"),
  process.cwd(), 1), /tap-startup-hook/u);
  for (const hostile of [
    startupHookTap.replace('owned startup hook', 'PR_C_CONTROL_SCRIPT_STARTUP_FAILED:UNKNOWN'),
    startupHookTap.replace("  error: 'PR_C_CONTROL_SCRIPT_STARTUP_FAILED:PR_C_PREFLIGHT_FIXTURE_SOURCE_REJECTED'\n", '')
      .replace('  stack: |-\n', "  stack: |-\n    error: 'PR_C_CONTROL_SCRIPT_STARTUP_FAILED:PR_C_PREFLIGHT_FIXTURE_SOURCE_REJECTED'\n"),
    startupHookTap.replace("  error: 'PR_C_CONTROL_SCRIPT_STARTUP_FAILED:PR_C_PREFLIGHT_FIXTURE_SOURCE_REJECTED'",
      "   error: 'PR_C_CONTROL_SCRIPT_STARTUP_FAILED:PR_C_PREFLIGHT_FIXTURE_SOURCE_REJECTED'"),
    startupHookTap.replace("'PR_C_CONTROL_SCRIPT_STARTUP_FAILED:PR_C_PREFLIGHT_FIXTURE_SOURCE_REJECTED'",
      "'PR_C_CONTROL_SCRIPT_STARTUP_FAILED:PR_C_PREFLIGHT_FIXTURE_SOURCE_REJECTED\""),
    startupHookTap.replace("  stack: |-", "  error: 'PR_C_CONTROL_SCRIPT_STARTUP_FAILED:UNKNOWN'\n  stack: |-"),
    startupHookTap.replace('  ...', "  ...\n  ---\n  code: 'ERR_TEST_FAILURE'\n  ..."),
    startupHookTap.replace('PR_C_CONTROL_SCRIPT_STARTUP_FAILED:PR_C_PREFLIGHT_FIXTURE_SOURCE_REJECTED',
      'PR_C_CONTROL_SCRIPT_STARTUP_FAILED:'),
    startupHookTap.replace('PR_C_PREFLIGHT_FIXTURE_SOURCE_REJECTED', 'PR_C_PREFLIGHT_FIXTURE_NOT_ALLOWLISTED'),
    startupHookTap.replace("failureType: 'hookFailed'", "failureType: 'testCodeFailure'"),
    startupHookTap.replace(exactLocation, path.join(process.cwd(), 'scripts', 'runPrCControlledHumanScriptCoverage.test.mjs')),
  ]) assert.throws(() => projectControlScriptTapFailures(hostile, process.cwd(), 1), /tap-(?:startup-hook|failure-diagnostic)/u);
  assert.throws(() => validateControlScriptFailureProjection({ ...projection, failures: [{ classification: 'hook',
    code: 'PR_C_CONTROL_SCRIPT_STARTUP_FAILED:PR_C_PREFLIGHT_FIXTURE_SOURCE_REJECTED', locations: [] }] }, 1),
  /tap-failure-item/u);

  const nativeRoot = await mkdtemp(path.join(os.tmpdir(), 'pr-c-control-script-native-before-'));
  try {
    const runnerImport = spawnSync(process.execPath, ['--input-type=module', '--eval',
      `await import(${JSON.stringify(new URL('./runPrCControlledHumanScriptCoverage.mjs', import.meta.url).href)})`], {
      cwd: nativeRoot, env: {}, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000, maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    assert.equal(runnerImport.status, 0); assert.equal(runnerImport.signal, null);
    assert.equal(runnerImport.stdout, ''); assert.equal(runnerImport.stderr, '');
    const nativeScripts = path.join(nativeRoot, 'scripts'); await mkdir(nativeScripts);
    const nativeTest = path.join(nativeScripts, 'prCControlledHumanCredentialPreflightEntry.test.mjs');
    for (const [index, detail] of ['UNKNOWN', 'PR_C_PREFLIGHT_FIXTURE_GIT_REJECTED:bundle:STATUS',
      'PR_C_PREFLIGHT_FIXTURE_FSCK_STATUS:1:MSG_BAD_TREE'].entries()) {
      await writeFile(nativeTest, `import test, { before } from 'node:test';\nbefore(() => { throw new Error('PR_C_CONTROL_SCRIPT_STARTUP_FAILED:${detail}'); });\ntest('unreached one', () => {});\ntest('unreached two', () => {});\n`, { flag: index === 0 ? 'wx' : 'w' });
      const native = spawnSync(process.execPath, ['--test', '--test-reporter=tap', nativeTest], {
        cwd: nativeRoot, env: {}, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000, maxBuffer: 1024 * 1024,
        windowsHide: true,
      });
      assert(Number.isInteger(native.status) && native.status > 0); assert.equal(native.signal, null); assert.equal(native.stderr, '');
      const nativeProjection = projectControlScriptTapFailures(native.stdout, nativeRoot, native.status);
      assert.deepEqual(nativeProjection.summary, { tests: 2, pass: 0, fail: 2, cancelled: 0, skipped: 0, todo: 0 });
      assert.equal(nativeProjection.failures.length, 1);
      assert(nativeProjection.failures.every(item => item.classification === 'hook'
        && item.code === (detail === 'UNKNOWN' ? 'hook-failure' : `PR_C_CONTROL_SCRIPT_STARTUP_FAILED:${detail}`)
        && item.locations.length > 0
        && item.locations.every(location => location.file === 'scripts/prCControlledHumanCredentialPreflightEntry.test.mjs')));
    }
  } finally {
    const resolved = await realpath(nativeRoot), temporary = await realpath(os.tmpdir());
    assert.equal(resolved, path.resolve(nativeRoot)); assert.equal(path.dirname(resolved), temporary);
    assert(/^pr-c-control-script-native-before-.+$/u.test(path.basename(resolved)));
    const nativeStat = await lstat(resolved); assert(nativeStat.isDirectory() && !nativeStat.isSymbolicLink());
    await rm(resolved, { recursive: true, force: true });
  }
  assert.throws(() => validateControlScriptFailureProjection({ ...projection, failures: [
    { classification: 'module', code: 'module-failure', locations: [] },
  ] }, 1), /tap-failure-item/u);
  assert.throws(() => projectControlScriptTapFailures(failedTap.replace(exactLocation, path.join(os.tmpdir(), 'foreign', 'scripts', 'prCControlledHumanCredentialPreflightEntry.test.mjs')), process.cwd(), 1), /tap-failure-location/u);
  assert.throws(() => projectControlScriptTapFailures(failedTap.replace('IDENTITY_CLAIMS_REJECTED', 'HOSTILE_UNKNOWN_PAYLOAD'), process.cwd(), 1), /tap-failure-code/u);
  assert.throws(() => projectControlScriptTapFailures(`${failedTap}${'x'.repeat(8 * 1024 * 1024)}`, process.cwd(), 1), /tap-failure-input/u);
  for (const status of [0, -1, '1', undefined, null]) assert.throws(() => validateControlScriptFailureProjection(projection, status), /tap-failure-child/u);
  for (const summary of [
    { ...projection.summary, fail: '2' }, { ...projection.summary, fail: -1 }, { ...projection.summary, tests: 3 },
  ]) assert.throws(() => validateControlScriptFailureProjection({ ...projection, summary }, 1), /tap-failure-summary/u);
  assert.throws(() => validateControlScriptFailureProjection({ ...projection, failures: [projection.failures[0], projection.failures[0]] }, 1), /tap-failure-duplicate/u);
  assert.throws(() => validateControlScriptFailureProjection({ ...projection, failures: [{ ...projection.failures[0], locations: [
    projection.failures[0].locations[0], projection.failures[0].locations[0],
  ] }] }, 1), /tap-failure-duplicate/u);
  assert.throws(() => projectControlScriptTapFailures(failedTap.replace('hostile title must not be retained', `hostile\u001btitle`), process.cwd(), 1), /tap-failure-title/u);
  assert.throws(() => projectControlScriptTapFailures(failedTap.replace('hostile title must not be retained', 'x'.repeat(201)), process.cwd(), 1), /tap-failure-title/u);
  const repeatedLocation = Array.from({ length: 9 }, () => `    at ${exactLocation}:472:16`).join('\n');
  assert.throws(() => projectControlScriptTapFailures(failedTap.replace(`    TestContext.<anonymous> (${exactLocation}:472:16)`, repeatedLocation), process.cwd(), 1), /tap-failure-(?:location|duplicate)/u);
  assert.throws(() => validateControlScriptFailureProjection({ ...projection, rawError: 'forbidden' }, 1), /tap-failure-projection/u);
});

test('measured child containment is pinned to 900 seconds and every incomplete outcome fails closed', async () => {
  const successfulChild = { status: 0, signal: null, error: undefined, stdout: '', stderr: '' };
  assert.equal(CONTROL_SCRIPT_TEST_TIMEOUT_MS, 900_000);
  assert.deepEqual(validateControlScriptTestCompletion(successfulChild, tap), {
    tests: 7, pass: 7, fail: 0, cancelled: 0, skipped: 0, todo: 0,
  });

  const timeoutError = new Error('hostile timeout detail');
  timeoutError.code = 'ETIMEDOUT';
  for (const [child, expected] of [
    [{ ...successfulChild, status: null, signal: 'SIGTERM', error: timeoutError }, /test-process-timeout/u],
    [{ ...successfulChild, error: Object.assign(new Error('hostile spawn detail'), { code: 'EACCES' }) }, /test-process$/u],
    [{ ...successfulChild, status: 1 }, /test-process$/u],
    [{ ...successfulChild, signal: 'SIGTERM' }, /test-process$/u],
    [{ ...successfulChild, stdout: 'unexpected output' }, /test-process$/u],
    [{ ...successfulChild, stderr: 'unexpected error output' }, /test-process$/u],
  ]) assert.throws(() => validateControlScriptTestCompletion(child, tap), expected);
  assert.throws(
    () => validateControlScriptTestCompletion(successfulChild, tap.replace('# todo 0\n', '')),
    /tap-todo/u,
  );

  const runnerSource = await readFile(new URL('./runPrCControlledHumanScriptCoverage.mjs', import.meta.url), 'utf8');
  assert.match(runnerSource, /timeout:\s*CONTROL_SCRIPT_TEST_TIMEOUT_MS/u);
  assert.equal([...runnerSource.matchAll(/\btimeout:\s*/gu)].length, 1);
  assert.doesNotMatch(runnerSource, /180_000/u);
});

test('scenario report reader binds every scenario to its exact producer and rejects incomplete or substituted proof', async () => {
  const emptyDirectory = await mkdtemp(path.join(os.tmpdir(), 'pr-c-control-script-scenarios-'));
  const directories = [emptyDirectory];
  try {
    assert.throws(() => readControlScriptScenarios(path.join(emptyDirectory, 'missing')));
    assert.throws(() => readControlScriptScenarios(emptyDirectory), /scenario-file-set/u);

    const valid = await writeScenarioFixture();
    directories.push(valid);
    assert.equal(readControlScriptScenarios(valid).scenarios.length, 46);

    const producerSubstitution = await writeScenarioFixture(reports => {
      reports['credential-preflight-entry-scenarios.json'].producer = 'scripts/substituted.test.mjs';
    });
    directories.push(producerSubstitution);
    assert.throws(() => readControlScriptScenarios(producerSubstitution), /scenario-identity/u);

    const crossProducerSwap = await writeScenarioFixture(reports => {
      const left = reports['acceptance-execution-profile-scenarios.json'].scenarios[0].name;
      reports['acceptance-execution-profile-scenarios.json'].scenarios[0].name = reports['acceptance-playwright-metadata-scenarios.json'].scenarios[0].name;
      reports['acceptance-playwright-metadata-scenarios.json'].scenarios[0].name = left;
    });
    directories.push(crossProducerSwap);
    assert.throws(() => readControlScriptScenarios(crossProducerSwap), /scenario-producer-inventory/u);

    for (const mutate of [
      reports => { reports['acceptance-execution-profile-scenarios.json'].scenarios = []; },
      reports => { reports['acceptance-execution-profile-scenarios.json'].scenarios.push({ name: 'acceptance-execution-profile-direct-import', status: 'passed' }); },
      reports => { reports['acceptance-execution-profile-scenarios.json'].scenarios[0].status = 'skipped'; },
    ]) {
      const adverse = await writeScenarioFixture(mutate);
      directories.push(adverse);
      assert.throws(() => readControlScriptScenarios(adverse), /scenario-identity|scenario-result|scenario-producer-inventory/u);
    }
  } finally {
    for (const directory of directories) await rm(directory, { recursive: true, force: true });
  }
});

test('coverage output accepts one resolved output-root link and rejects descendant link substitution', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pr-c-control-script-output-'));
  try {
    const root = path.join(directory, 'root');
    const target = path.join(directory, 'target');
    await mkdir(root);
    await mkdir(target);
    try { await symlink(target, path.join(root, 'output'), process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) { t.skip(`filesystem link unavailable: ${error.code ?? 'unknown'}`); return; }
    const attempt = createExclusiveControlScriptOutputDirectory(root);
    assert.equal(path.dirname(path.dirname(attempt)), target);
    const parent = path.dirname(attempt);
    const substitutedAttempt = path.join(parent, 'attempt-substituted');
    await symlink(target, substitutedAttempt, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => validateExclusiveControlScriptAttempt(parent, substitutedAttempt), /output-attempt/u);
    await rm(substitutedAttempt);
    await rm(attempt, { recursive: true });
    await rm(parent, { recursive: true });
    await symlink(target, parent, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => createExclusiveControlScriptOutputDirectory(root), /output-symlink/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('measured child environment binds only the resolved root as safe Git directory and omits ambient authority', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pr-c-control-script-env-'));
  const injected = {
    NODE_OPTIONS: '--inspect', NODE_V8_COVERAGE: 'substituted', GIT_CONFIG_SYSTEM: 'substituted',
    GIT_ASKPASS: 'substituted', SUPABASE_ACCESS_TOKEN: 'substituted', GENERIC_API_KEY: 'substituted',
  };
  const prior = Object.fromEntries(Object.keys(injected).map(name => [name, process.env[name]]));
  try {
    Object.assign(process.env, injected);
    const emptyGitConfig = path.join(directory, 'empty.gitconfig');
    await writeFile(emptyGitConfig, '');
    const env = buildControlScriptTestEnvironment(path.join(directory, 'scenarios'), directory, emptyGitConfig);
    assert.deepEqual(Object.keys(env).filter(name => name.startsWith('GIT_')).sort(), [
      'GIT_CONFIG_COUNT', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_VALUE_0',
    ]);
    assert.equal(env.GIT_CONFIG_COUNT, '1');
    assert.equal(env.GIT_CONFIG_GLOBAL, emptyGitConfig);
    assert.equal(env.GIT_CONFIG_NOSYSTEM, '1');
    assert.equal(env.GIT_CONFIG_KEY_0, 'safe.directory');
    assert.equal(env.GIT_CONFIG_VALUE_0, await realpath(directory));
    assert.notEqual(env.GIT_CONFIG_VALUE_0, '*');
    for (const name of Object.keys(injected)) assert.equal(Object.hasOwn(env, name), false, name);
  } finally {
    for (const [name, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test('measured test scheduling is exactly serial and rejects missing duplicated or substituted concurrency', async () => {
  const args = buildControlScriptTestArguments('synthetic.tap', 'synthetic.lcov');
  assert.deepEqual(args.filter(arg => arg.startsWith('--test-concurrency')), ['--test-concurrency=1']);
  assert.deepEqual(args.slice(args.indexOf('--test') + 1), [...CONTROL_SCRIPT_TESTS]);
  assert.equal(args.filter(arg => arg === '--test').length, 1);
  assert.equal(validateControlScriptTestScheduling(args), true);
  const without = args.filter(arg => !arg.startsWith('--test-concurrency'));
  for (const mutation of [without, [...args, '--test-concurrency=1'], [...without, '--test-concurrency=2'],
    [...without, '--test-concurrency=0'], [...without, '--test-concurrency', '1'], [...without, '--test-concurrency=auto']]) {
    assert.throws(() => validateControlScriptTestScheduling(mutation), /test-scheduling/u);
  }
  const source = await readFile(new URL('./runPrCControlledHumanScriptCoverage.mjs', import.meta.url), 'utf8');
  assert.match(source, /const args = buildControlScriptTestArguments\(tapPath, lcovPath\);/u);
  assert.match(source, /validateControlScriptTestScheduling\(args\);\s*return args;/u);
});

test('Edge import safety uses an isolated canonical module identity without parent coverage aliases', async () => {
  const source = await readFile(new URL('./prCControlledHumanEdgeDeploy.test.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /prCControlledHumanEdgeDeploy\.mjs[?#]/u);
  assert.match(source, /new URL\('\.\/prCControlledHumanEdgeDeploy\.mjs', import\.meta\.url\)/u);
  assert.match(source, /assert\.equal\(moduleUrl\.search, ''\)/u);
  assert.match(source, /assert\.equal\(moduleUrl\.hash, ''\)/u);
  assert.match(source, /const childEnvironment = Object\.fromEntries\(\s*\['SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'TMP', 'TEMP', 'TMPDIR'\]/u);
  assert.match(source, /spawnSync\(process\.execPath, \['--input-type=module'\],/u);
  assert.match(source, /cwd: directory, env: childEnvironment, input: probe/u);
  assert.match(source, /timeout: 10_000, maxBuffer: 64 \* 1024/u);
  assert.match(source, /syncBuiltinESMExports\(\)/u);
  assert.match(source, /assert\.equal\(blocked, before\)/u);
  assert.match(source, /assert\.deepEqual\(await snapshot\(\), before\)/u);
});

test('coverage runner inventory is independently pinned and its import guard permits measured self-testing', async () => {
  assert.deepEqual([...CONTROL_SCRIPT_SOURCES], [
    'scripts/checkPrCControlledHumanEdgeImports.mjs',
    'scripts/checkPrCScoringLawDrift.mjs',
    'scripts/prCControlledHumanEdgeDeploy.mjs',
    'scripts/derivePrCControlledHumanBootstrap.mjs',
    'scripts/buildPrCControlledHumanPreparation.mjs',
    'scripts/capturePrCControlledHumanCheckpoint.mjs',
    'scripts/prCControlledHumanCredentialPreflight.mjs',
    'scripts/prCControlledHumanEnvironmentMigration.mjs',
    'scripts/prCControlledHumanEvidenceContract.mjs',
    'scripts/prCControlledHumanWorkflowSecrets.mjs',
    'scripts/producePrCControlledHumanEdgeDeploymentManifest.mjs',
    'scripts/transcriptFlowPrCEvidenceScope.mjs',
    'scripts/verifyPrCControlledHumanEdgeDeployment.mjs',
    'scripts/verifyPrCControlledHumanSession.mjs',
    'scripts/acceptanceExecutionProfile.mjs',
    'scripts/exhaustiveAcceptanceEvidence.mjs',
    'scripts/runPrCControlledHumanScriptCoverage.mjs',
  ]);
  assert.deepEqual([...CONTROL_SCRIPT_TESTS], [
    'scripts/checkPrCControlledHumanEdgeImports.test.mjs',
    'scripts/checkPrCScoringLawDrift.test.mjs',
    'scripts/prCControlledHumanEdgeDeploy.test.mjs',
    'scripts/prCControlledHumanPostgresTls.test.mjs',
    'scripts/prCControlledHumanEnvironment.test.mjs',
    'scripts/prCControlledHumanEnvironmentMigration.test.mjs',
    'scripts/prCControlledHumanEvidenceContract.test.mjs',
    'scripts/prCControlledHumanWorkflowContract.test.mjs',
    'scripts/prCControlledHumanSecurityContract.test.mjs',
    'scripts/prCControlledHumanCredentialPreflight.test.mjs',
    'scripts/prCControlledHumanCredentialPreflightEntry.test.mjs',
    'scripts/prCControlledHumanControlScriptCoverageSupport.test.mjs',
    'scripts/transcriptFlowPrCEvidenceScope.test.mjs',
    'scripts/runPrCControlledHumanScriptCoverage.test.mjs',
    'scripts/acceptanceExecutionProfile.test.mjs',
    'scripts/exhaustiveAcceptanceEvidence.test.mjs',
    'scripts/runExhaustiveAcceptanceReport.test.mjs',
    'scripts/acceptancePlaywrightMetadata.test.mjs',
    'scripts/runTranscriptFlowBrowser.test.mjs',
  ]);
  assert.deepEqual([...CONTROL_SCRIPT_SCENARIOS].sort(), [
    'acceptance-execution-profile-direct-import',
    'acceptance-playwright-metadata-installed-synthetic-config',
    'artifact-over-16-kib',
    'control-script-coverage-runner-self-test',
    'exhaustive-acceptance-evidence-direct-import',
    'exhaustive-report-hostile-provenance-blocked',
    'exhaustive-report-local-hosted-substitution-blocked',
    'exhaustive-report-malformed-declaration-fails-closed',
    'exhaustive-report-planned-scope-blocked',
    'password-non-string',
    'password-over-128',
    'production-entry-bootstrap-binding-failure',
    'production-entry-current-empty-happy-path',
    'production-entry-current-empty-null-installed-digest',
    'production-entry-current-empty-orphan-mutable-row',
    'production-entry-current-empty-statement-count-failure',
    'production-entry-current-empty-wrong-installed-digest',
    'production-entry-database-begin-failure',
    'production-entry-database-close-failure',
    'production-entry-database-configuration-failure',
    'production-entry-database-connect-failure',
    'production-entry-database-idle-timeout-failure',
    'production-entry-database-inventory-cleanup-failure',
    'production-entry-database-inventory-failure',
    'production-entry-database-rollback-failure',
    'production-entry-database-rollback-falsy-failure',
    'production-entry-database-show-failure',
    'production-entry-database-statement-timeout-failure',
    'production-entry-dirty-source',
    'production-entry-event-authority-failure',
    'production-entry-existing-output-collision',
    'production-entry-nonancestor-base',
    'production-entry-nonpat-forbidden-credential-failure',
    'production-entry-nonpat-password-json-failure',
    'production-entry-nonpat-password-persona-set-failure',
    'production-entry-nonpat-password-values-failure',
    'production-entry-nonpat-required-fields-failure',
    'production-entry-nonpat-signing-authority-failure',
    'production-entry-nonpat-target-tuple-failure',
    'production-entry-preview-failure',
    'production-entry-source-change-during-execution',
    'production-entry-source-identity-happy-path',
    'production-entry-wrong-output-path',
    'signing-key-leading-trailing-whitespace',
    'signing-key-under-32-over-4096',
    'transcript-flow-browser-exported-local-consumer',
  ]);
  assert.deepEqual(CONTROL_SCRIPT_SCENARIO_PRODUCERS, {
    'acceptance-execution-profile-scenarios.json': 'scripts/acceptanceExecutionProfile.test.mjs',
    'acceptance-playwright-metadata-scenarios.json': 'scripts/acceptancePlaywrightMetadata.test.mjs',
    'control-script-coverage-runner-scenarios.json': 'scripts/runPrCControlledHumanScriptCoverage.test.mjs',
    'credential-preflight-entry-scenarios.json': 'scripts/prCControlledHumanCredentialPreflightEntry.test.mjs',
    'credential-preflight-unit-scenarios.json': 'scripts/prCControlledHumanCredentialPreflight.test.mjs',
    'exhaustive-acceptance-evidence-scenarios.json': 'scripts/exhaustiveAcceptanceEvidence.test.mjs',
    'exhaustive-acceptance-report-scenarios.json': 'scripts/runExhaustiveAcceptanceReport.test.mjs',
    'transcript-flow-browser-scenarios.json': 'scripts/runTranscriptFlowBrowser.test.mjs',
  });
  assert.deepEqual(CONTROL_SCRIPT_SCENARIOS_BY_REPORT, expectedScenarioOwnership);

  const directory = process.env.PR_C_CONTROL_SCRIPT_SCENARIO_REPORT_DIRECTORY;
  if (directory) {
    await writeFile(path.join(directory, 'control-script-coverage-runner-scenarios.json'), JSON.stringify({
      contractVersion: 'pr-c-control-script-scenarios-1',
      producer: 'scripts/runPrCControlledHumanScriptCoverage.test.mjs',
      scenarios: [{ name: 'control-script-coverage-runner-self-test', status: 'passed' }],
    }), { flag: 'wx' });
  }
});
