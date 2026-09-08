import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTROL_SCRIPT_COVERAGE_COMMAND,
  CONTROL_SCRIPT_COVERAGE_ENTRY,
  CONTROL_SCRIPT_SCENARIOS,
  CONTROL_SCRIPT_SOURCES,
  CONTROL_SCRIPT_TESTS,
  buildControlScriptTestEnvironment,
  createExclusiveControlScriptOutputDirectory,
  parseControlScriptLcov,
  parseControlScriptTap,
  readControlScriptScenarios,
  validateExclusiveControlScriptAttempt,
  verifyControlScriptCoverageMeasurement,
} from './runPrCControlledHumanScriptCoverage.mjs';
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
  scenarioReports: [
    { file: 'credential-preflight-entry-scenarios.json', producer: 'scripts/prCControlledHumanCredentialPreflightEntry.test.mjs', sha256: `sha256:${'c'.repeat(64)}` },
    { file: 'credential-preflight-unit-scenarios.json', producer: 'scripts/prCControlledHumanCredentialPreflight.test.mjs', sha256: `sha256:${'d'.repeat(64)}` },
  ],
  scenarios: [...CONTROL_SCRIPT_SCENARIOS].sort(), sources: parseControlScriptLcov(lcov, inventory),
});

test('coverage parser reports every exact expected source and discloses zero-covered paths', () => {
  const sources = parseControlScriptLcov(lcov, inventory);
  assert.equal(sources.length, 10);
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

test('scenario report reader rejects missing empty and producer-substituted output boundaries', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pr-c-control-script-scenarios-'));
  const missing = path.join(directory, 'missing');
  try {
    assert.throws(() => readControlScriptScenarios(missing));
    assert.throws(() => readControlScriptScenarios(directory), /scenario-file-set/u);
    const entry = { contractVersion: 'pr-c-control-script-scenarios-1', producer: 'scripts/substituted.test.mjs', scenarios: [{ name: 'production-entry-source-identity-happy-path', status: 'passed' }] };
    const unit = { contractVersion: 'pr-c-control-script-scenarios-1', producer: 'scripts/prCControlledHumanCredentialPreflight.test.mjs', scenarios: [{ name: 'artifact-over-16-kib', status: 'passed' }] };
    await writeFile(path.join(directory, 'credential-preflight-entry-scenarios.json'), JSON.stringify(entry));
    await writeFile(path.join(directory, 'credential-preflight-unit-scenarios.json'), JSON.stringify(unit));
    assert.throws(() => readControlScriptScenarios(directory), /scenario-identity/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
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
