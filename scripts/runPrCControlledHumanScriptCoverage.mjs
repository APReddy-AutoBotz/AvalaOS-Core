import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { calculatePrCWorkingTreeDigest, collectChangedPrCFiles, PR_C_BASE_SHA } from './transcriptFlowPrCEvidenceScope.mjs';

export const CONTROL_SCRIPT_COVERAGE_COMMAND = 'node scripts/runPrCControlledHumanScriptCoverage.mjs';
export const CONTROL_SCRIPT_COVERAGE_ENTRY = 'scripts/runPrCControlledHumanScriptCoverage.mjs';
export const CONTROL_SCRIPT_SOURCES = Object.freeze([
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
export const CONTROL_SCRIPT_TESTS = Object.freeze([
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
export const CONTROL_SCRIPT_SCENARIOS = Object.freeze([
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

const OUTPUT_PARENT = 'output/pr-c-controlled-human-script-coverage';
const SUMMARY_FILE = 'pr-c-control-script-coverage.json';
export const CONTROL_SCRIPT_SCENARIO_PRODUCERS = Object.freeze({
  'acceptance-execution-profile-scenarios.json': 'scripts/acceptanceExecutionProfile.test.mjs',
  'acceptance-playwright-metadata-scenarios.json': 'scripts/acceptancePlaywrightMetadata.test.mjs',
  'control-script-coverage-runner-scenarios.json': 'scripts/runPrCControlledHumanScriptCoverage.test.mjs',
  'credential-preflight-entry-scenarios.json': 'scripts/prCControlledHumanCredentialPreflightEntry.test.mjs',
  'credential-preflight-unit-scenarios.json': 'scripts/prCControlledHumanCredentialPreflight.test.mjs',
  'exhaustive-acceptance-evidence-scenarios.json': 'scripts/exhaustiveAcceptanceEvidence.test.mjs',
  'exhaustive-acceptance-report-scenarios.json': 'scripts/runExhaustiveAcceptanceReport.test.mjs',
  'transcript-flow-browser-scenarios.json': 'scripts/runTranscriptFlowBrowser.test.mjs',
});
export const CONTROL_SCRIPT_SCENARIOS_BY_REPORT = Object.freeze({
  'acceptance-execution-profile-scenarios.json': Object.freeze(['acceptance-execution-profile-direct-import']),
  'acceptance-playwright-metadata-scenarios.json': Object.freeze(['acceptance-playwright-metadata-installed-synthetic-config']),
  'control-script-coverage-runner-scenarios.json': Object.freeze(['control-script-coverage-runner-self-test']),
  'credential-preflight-entry-scenarios.json': Object.freeze([
    'production-entry-bootstrap-binding-failure',
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
  ]),
  'credential-preflight-unit-scenarios.json': Object.freeze([
    'artifact-over-16-kib',
    'password-non-string',
    'password-over-128',
    'signing-key-leading-trailing-whitespace',
    'signing-key-under-32-over-4096',
  ]),
  'exhaustive-acceptance-evidence-scenarios.json': Object.freeze(['exhaustive-acceptance-evidence-direct-import']),
  'exhaustive-acceptance-report-scenarios.json': Object.freeze([
    'exhaustive-report-hostile-provenance-blocked',
    'exhaustive-report-local-hosted-substitution-blocked',
    'exhaustive-report-malformed-declaration-fails-closed',
    'exhaustive-report-planned-scope-blocked',
  ]),
  'transcript-flow-browser-scenarios.json': Object.freeze(['transcript-flow-browser-exported-local-consumer']),
});
const MANDATORY_NONEMPTY_MEASURED_SOURCES = Object.freeze([
  'scripts/acceptanceExecutionProfile.mjs',
  'scripts/exhaustiveAcceptanceEvidence.mjs',
  'scripts/runPrCControlledHumanScriptCoverage.mjs',
]);
const normalize = value => value.replaceAll('\\', '/');
const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const fail = code => { throw new Error(`PR_C_CONTROL_SCRIPT_COVERAGE_REJECTED:${code}`); };
const exactKeys = (value, expected, code) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) fail(code);
};
const metric = (hit, found) => ({ hit, found, percent: found === 0 ? 0 : Number(((hit / found) * 100).toFixed(2)) });

export function buildControlScriptSourceInventory(root = process.cwd()) {
  return CONTROL_SCRIPT_SOURCES.map(relative => {
    const absolute = path.resolve(root, relative);
    const actual = realpathSync(absolute);
    const rootReal = realpathSync(root);
    const inside = path.relative(rootReal, actual);
    if (!inside || inside.startsWith('..') || path.isAbsolute(inside) || normalize(inside) !== relative) fail('source-path');
    return Object.freeze({ path: relative, sha256: digest(readFileSync(actual)) });
  });
}

export function parseControlScriptTap(tap) {
  const read = name => {
    const matches = [...tap.matchAll(new RegExp(`^# ${name} ([0-9]+)$`, 'gmu'))];
    if (matches.length !== 1) fail(`tap-${name}`);
    return Number(matches[0][1]);
  };
  const summary = { tests: read('tests'), pass: read('pass'), fail: read('fail'), cancelled: read('cancelled'), skipped: read('skipped'), todo: read('todo') };
  if (summary.tests < 1 || summary.pass !== summary.tests || summary.fail !== 0 || summary.cancelled !== 0 || summary.skipped !== 0 || summary.todo !== 0) {
    fail(`tap-status-${summary.tests}-${summary.pass}-${summary.fail}-${summary.cancelled}-${summary.skipped}-${summary.todo}`);
  }
  return Object.freeze(summary);
}

export function parseControlScriptLcov(lcov, inventory, root = process.cwd()) {
  if (typeof lcov !== 'string' || lcov.trim() === '') fail('lcov-empty');
  const records = new Map();
  for (const block of lcov.split('end_of_record')) {
    const lines = block.split(/\r?\n/gu).filter(Boolean);
    if (lines.length === 0) continue;
    const sourceLine = lines.find(line => line.startsWith('SF:'));
    if (!sourceLine) fail('lcov-source');
    const absolute = path.resolve(root, sourceLine.slice(3));
    const relative = normalize(path.relative(root, absolute));
    if (records.has(relative)) fail('lcov-duplicate-source');
    const lineRows = lines.filter(line => line.startsWith('DA:')).map(line => {
      const [lineNumber, count] = line.slice(3).split(',');
      return { line: Number(lineNumber), count: Number(count) };
    });
    const branchRows = lines.filter(line => line.startsWith('BRDA:')).map(line => {
      const [lineNumber, blockNumber, branchNumber, taken] = line.slice(5).split(',');
      return { line: Number(lineNumber), block: Number(blockNumber), branch: Number(branchNumber), taken: taken === '-' ? 0 : Number(taken) };
    });
    const functionRows = lines.filter(line => line.startsWith('FNDA:')).map(line => {
      const comma = line.indexOf(',');
      return { name: line.slice(comma + 1), count: Number(line.slice(5, comma)) };
    });
    if (lineRows.some(row => !Number.isSafeInteger(row.line) || row.line < 1 || !Number.isFinite(row.count) || row.count < 0)
      || branchRows.some(row => !Number.isSafeInteger(row.line) || row.line < 1 || !Number.isFinite(row.taken) || row.taken < 0)
      || functionRows.some(row => !row.name || !Number.isFinite(row.count) || row.count < 0)) fail('lcov-value');
    records.set(relative, {
      loaded: true,
      lines: metric(lineRows.filter(row => row.count > 0).length, lineRows.length),
      branches: metric(branchRows.filter(row => row.taken > 0).length, branchRows.length),
      functions: metric(functionRows.filter(row => row.count > 0).length, functionRows.length),
      uncoveredLines: lineRows.filter(row => row.count === 0).map(row => row.line),
      uncoveredBranches: branchRows.filter(row => row.taken === 0).map(row => `${row.line}:${row.block}:${row.branch}`),
      uncoveredFunctions: functionRows.filter(row => row.count === 0).map(row => row.name),
    });
  }
  if (records.size === 0) fail('lcov-empty');
  const expected = new Set(inventory.map(item => item.path));
  if ([...records.keys()].some(relative => !expected.has(relative))) fail('lcov-unexpected-source');
  return inventory.map(source => ({
    ...source,
    ...(records.get(source.path) ?? {
      loaded: false,
      lines: metric(0, 0), branches: metric(0, 0), functions: metric(0, 0),
      uncoveredLines: [], uncoveredBranches: [], uncoveredFunctions: [],
    }),
  }));
}

export function readControlScriptScenarios(directory) {
  const entries = readdirSync(directory).sort();
  if (JSON.stringify(entries) !== JSON.stringify(Object.keys(CONTROL_SCRIPT_SCENARIO_PRODUCERS).sort())) fail('scenario-file-set');
  const scenarios = [];
  const reports = entries.map(name => {
    const bytes = readFileSync(path.join(directory, name));
    if (bytes.length < 2 || bytes.length > 16_384) fail('scenario-size');
    let report;
    try { report = JSON.parse(bytes.toString('utf8')); } catch { fail('scenario-json'); }
    exactKeys(report, ['contractVersion', 'producer', 'scenarios'], 'scenario-shape');
    if (report.contractVersion !== 'pr-c-control-script-scenarios-1' || report.producer !== CONTROL_SCRIPT_SCENARIO_PRODUCERS[name]
      || !Array.isArray(report.scenarios) || report.scenarios.length === 0) fail('scenario-identity');
    for (const scenario of report.scenarios) {
      exactKeys(scenario, ['name', 'status'], 'scenario-result-shape');
      if (typeof scenario.name !== 'string' || scenario.status !== 'passed') fail('scenario-result');
      scenarios.push(scenario.name);
    }
    const actualNames = report.scenarios.map(scenario => scenario.name).sort();
    if (JSON.stringify(actualNames) !== JSON.stringify([...CONTROL_SCRIPT_SCENARIOS_BY_REPORT[name]].sort())) fail('scenario-producer-inventory');
    return { file: name, producer: report.producer, sha256: digest(bytes) };
  });
  if (new Set(scenarios).size !== scenarios.length || JSON.stringify(scenarios.sort()) !== JSON.stringify([...CONTROL_SCRIPT_SCENARIOS].sort())) fail('scenario-inventory');
  return { reports, scenarios: scenarios.sort() };
}

export function verifyControlScriptCoverageMeasurement(report, expectedInventory, expectedBinding) {
  exactKeys(report, ['contractVersion', 'status', 'command', 'entryPath', 'arguments', 'nodeMajor', 'acceptedBase', 'head', 'governedFiles', 'governedWorkingTreeDigest', 'entryExecutionMeasurementBoundary', 'tests', 'testSummary', 'scenarioReports', 'scenarios', 'sources'], 'report-shape');
  if (report.contractVersion !== 'pr-c-control-script-coverage-1' || report.status !== 'passed'
    || report.command !== CONTROL_SCRIPT_COVERAGE_COMMAND || report.entryPath !== CONTROL_SCRIPT_COVERAGE_ENTRY
    || !Array.isArray(report.arguments) || report.arguments.length !== 0
    || report.nodeMajor !== 22 || report.acceptedBase !== PR_C_BASE_SHA
    || !/^[0-9a-f]{40}$/u.test(report.head) || !/^[0-9a-f]{64}$/u.test(report.governedWorkingTreeDigest)
    || !Array.isArray(report.governedFiles) || report.governedFiles.some(file => typeof file !== 'string')
    || report.entryExecutionMeasurementBoundary !== 'separate-mandatory-production-entry-scenarios-not-counted-in-parent-lcov'
    || JSON.stringify(report.tests) !== JSON.stringify(CONTROL_SCRIPT_TESTS)
    || JSON.stringify(report.scenarios) !== JSON.stringify([...CONTROL_SCRIPT_SCENARIOS].sort())) fail('report-identity');
  if (!expectedBinding) fail('expected-binding');
  {
    exactKeys(expectedBinding, ['head', 'governedFiles', 'governedWorkingTreeDigest', 'command', 'entryPath', 'arguments', 'nodeMajor'], 'expected-binding');
    if (report.head !== expectedBinding.head || report.governedWorkingTreeDigest !== expectedBinding.governedWorkingTreeDigest
      || report.command !== expectedBinding.command || report.entryPath !== expectedBinding.entryPath
      || report.nodeMajor !== expectedBinding.nodeMajor
      || JSON.stringify(report.arguments) !== JSON.stringify(expectedBinding.arguments)
      || JSON.stringify(report.governedFiles) !== JSON.stringify(expectedBinding.governedFiles)) fail('expected-binding');
  }
  parseControlScriptTap(Object.entries(report.testSummary).map(([name, value]) => `# ${name} ${value}`).join('\n'));
  if (!Array.isArray(report.scenarioReports) || report.scenarioReports.length !== Object.keys(CONTROL_SCRIPT_SCENARIO_PRODUCERS).length) fail('scenario-report-binding');
  for (let index = 0; index < Object.keys(CONTROL_SCRIPT_SCENARIO_PRODUCERS).sort().length; index += 1) {
    const file = Object.keys(CONTROL_SCRIPT_SCENARIO_PRODUCERS).sort()[index];
    const item = report.scenarioReports[index];
    exactKeys(item, ['file', 'producer', 'sha256'], 'scenario-report-shape');
    if (item.file !== file || item.producer !== CONTROL_SCRIPT_SCENARIO_PRODUCERS[file] || !/^sha256:[0-9a-f]{64}$/u.test(item.sha256)) fail('scenario-report-binding');
  }
  if (!Array.isArray(report.sources) || report.sources.length !== expectedInventory.length) fail('source-inventory');
  for (let index = 0; index < expectedInventory.length; index += 1) {
    const source = report.sources[index];
    const expected = expectedInventory[index];
    exactKeys(source, ['path', 'sha256', 'loaded', 'lines', 'branches', 'functions', 'uncoveredLines', 'uncoveredBranches', 'uncoveredFunctions'], 'source-shape');
    if (source.path !== expected.path || source.sha256 !== expected.sha256 || typeof source.loaded !== 'boolean') fail('source-binding');
    for (const name of ['lines', 'branches', 'functions']) {
      const value = source[name];
      exactKeys(value, ['hit', 'found', 'percent'], 'metric-shape');
      if (!Number.isSafeInteger(value.hit) || !Number.isSafeInteger(value.found) || value.hit < 0 || value.found < (source.loaded ? 1 : 0) || value.hit > value.found
        || value.percent !== metric(value.hit, value.found).percent) fail('metric');
    }
    if (![source.uncoveredLines, source.uncoveredBranches, source.uncoveredFunctions].every(Array.isArray)) fail('uncovered-shape');
    if (!source.loaded && (source.lines.found !== 0 || source.branches.found !== 0 || source.functions.found !== 0
      || source.uncoveredLines.length !== 0 || source.uncoveredBranches.length !== 0 || source.uncoveredFunctions.length !== 0)) fail('unloaded-source');
    if (MANDATORY_NONEMPTY_MEASURED_SOURCES.includes(source.path)
      && (!source.loaded || source.lines.found === 0 || source.lines.hit === 0)) fail('mandatory-source-unmeasured');
  }
  return report;
}

export const validateExclusiveControlScriptAttempt = (parent, attempt) => {
  if (lstatSync(parent).isSymbolicLink() || lstatSync(attempt).isSymbolicLink() || !lstatSync(attempt).isDirectory()
    || path.dirname(realpathSync(attempt)) !== realpathSync(parent)) fail('output-attempt');
  return realpathSync(attempt);
};

export const createExclusiveControlScriptOutputDirectory = root => {
  mkdirSync(path.resolve(root, 'output'), { recursive: true });
  const outputRoot = path.resolve(root, 'output');
  const outputRootReal = realpathSync(outputRoot);
  if (!lstatSync(outputRootReal).isDirectory()) fail('output-path');
  const parent = path.join(outputRootReal, path.basename(OUTPUT_PARENT));
  mkdirSync(parent, { recursive: true });
  if (lstatSync(parent).isSymbolicLink() || path.dirname(realpathSync(parent)) !== outputRootReal) fail('output-symlink');
  const attempt = mkdtempSync(path.join(parent, 'attempt-'));
  return validateExclusiveControlScriptAttempt(parent, attempt);
};

export const buildControlScriptTestEnvironment = (scenarioDirectory, root, emptyGitConfigPath) => {
  const infrastructureNames = [
    'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC',
    'TMP', 'TEMP', 'TMPDIR', 'LANG', 'LC_ALL',
    'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
  ];
  const result = Object.fromEntries(infrastructureNames.filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]));
  result.PR_C_CONTROL_SCRIPT_SCENARIO_REPORT_DIRECTORY = scenarioDirectory;
  result.GIT_CONFIG_NOSYSTEM = '1';
  result.GIT_CONFIG_GLOBAL = emptyGitConfigPath;
  result.GIT_CONFIG_COUNT = '1';
  result.GIT_CONFIG_KEY_0 = 'safe.directory';
  result.GIT_CONFIG_VALUE_0 = realpathSync(root);
  return result;
};

export function runControlScriptCoverage(root = process.cwd()) {
  const entryPath = normalize(path.relative(realpathSync(root), realpathSync(path.resolve(process.argv[1] ?? ''))));
  if (process.argv.length !== 2 || entryPath !== CONTROL_SCRIPT_COVERAGE_ENTRY
    || realpathSync(path.resolve(process.argv[1] ?? '')) !== realpathSync(fileURLToPath(import.meta.url))) fail('arguments');
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor !== 22) fail('runtime');
  const git = argsValue => execFileSync('git', argsValue, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (git(['merge-base', PR_C_BASE_SHA, 'HEAD']) !== PR_C_BASE_SHA) fail('accepted-base');
  const governedFiles = collectChangedPrCFiles(root);
  const executionBinding = Object.freeze({
    head: git(['rev-parse', 'HEAD']),
    governedFiles: [...governedFiles],
    governedWorkingTreeDigest: calculatePrCWorkingTreeDigest(root, governedFiles),
    command: CONTROL_SCRIPT_COVERAGE_COMMAND,
    entryPath,
    arguments: [],
    nodeMajor,
  });
  const outputDirectory = createExclusiveControlScriptOutputDirectory(root);
  const scenarioDirectory = path.join(outputDirectory, 'scenarios');
  mkdirSync(scenarioDirectory);
  const emptyGitConfigPath = path.join(outputDirectory, 'empty.gitconfig');
  writeFileSync(emptyGitConfigPath, '', { flag: 'wx', mode: 0o600 });
  const tapPath = path.join(outputDirectory, 'node-test.tap');
  const lcovPath = path.join(outputDirectory, 'node-test.lcov');
  const inventory = buildControlScriptSourceInventory(root);
  const startedInventory = JSON.stringify(inventory);
  const args = [
    '--experimental-test-coverage',
    '--test-reporter=tap', `--test-reporter-destination=${tapPath}`,
    '--test-reporter=lcov', `--test-reporter-destination=${lcovPath}`,
    ...CONTROL_SCRIPT_SOURCES.map(source => `--test-coverage-include=${source}`),
    '--test', ...CONTROL_SCRIPT_TESTS,
  ];
  try {
    const child = spawnSync(process.execPath, args, {
      cwd: root, env: buildControlScriptTestEnvironment(scenarioDirectory, root, emptyGitConfigPath), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
      timeout: 180_000, windowsHide: true,
    });
    const tap = readFileSync(tapPath, 'utf8');
    const lcov = readFileSync(lcovPath, 'utf8');
    if (child.error && child.error.code === 'ETIMEDOUT') fail('test-process-timeout');
    const failedTestTitles = [...tap.matchAll(/^not ok [0-9]+ - (.+)$/gmu)].map(match => match[1]);
    if (failedTestTitles.length > 0) {
      const safeTitles = failedTestTitles.map(title => /^[\x20-\x7e]{1,200}$/u.test(title) ? title : 'redacted-test-title');
      process.stderr.write(`PR_C_CONTROL_SCRIPT_COVERAGE_TEST_FAILURES ${JSON.stringify(safeTitles)}\n`);
    }
    const testSummary = parseControlScriptTap(tap);
    if (child.status !== 0 || child.signal !== null || child.error || child.stdout !== '' || child.stderr !== '') fail('test-process');
    const scenario = readControlScriptScenarios(scenarioDirectory);
    const sources = parseControlScriptLcov(lcov, inventory, root);
    if (JSON.stringify(buildControlScriptSourceInventory(root)) !== startedInventory) fail('source-changed');
    const changedAfter = collectChangedPrCFiles(root);
    const after = {
      head: git(['rev-parse', 'HEAD']), governedFiles: changedAfter,
      governedWorkingTreeDigest: calculatePrCWorkingTreeDigest(root, changedAfter),
      command: CONTROL_SCRIPT_COVERAGE_COMMAND, entryPath, arguments: [],
      nodeMajor: Number(process.versions.node.split('.')[0]),
    };
    if (JSON.stringify(after) !== JSON.stringify(executionBinding)) fail('execution-binding-changed');
    const report = {
      contractVersion: 'pr-c-control-script-coverage-1', status: 'passed', command: CONTROL_SCRIPT_COVERAGE_COMMAND,
      entryPath: executionBinding.entryPath, arguments: executionBinding.arguments,
      nodeMajor: executionBinding.nodeMajor, acceptedBase: PR_C_BASE_SHA, head: executionBinding.head,
      governedFiles: executionBinding.governedFiles,
      governedWorkingTreeDigest: executionBinding.governedWorkingTreeDigest,
      entryExecutionMeasurementBoundary: 'separate-mandatory-production-entry-scenarios-not-counted-in-parent-lcov',
      tests: [...CONTROL_SCRIPT_TESTS], testSummary, scenarioReports: scenario.reports, scenarios: scenario.scenarios, sources,
    };
    verifyControlScriptCoverageMeasurement(report, inventory, {
      head: executionBinding.head, governedFiles: executionBinding.governedFiles,
      governedWorkingTreeDigest: executionBinding.governedWorkingTreeDigest,
      command: executionBinding.command, entryPath: executionBinding.entryPath,
      arguments: executionBinding.arguments, nodeMajor: executionBinding.nodeMajor,
    });
    const reportPath = path.join(outputDirectory, SUMMARY_FILE);
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    const reportSha256 = digest(readFileSync(reportPath));
    process.stdout.write(`PR_C_CONTROL_SCRIPT_COVERAGE_MEASUREMENT ${JSON.stringify(report)}\n`);
    const logicalReportPath = `${OUTPUT_PARENT}/${path.basename(outputDirectory)}/${SUMMARY_FILE}`;
    process.stdout.write(`PR_C_CONTROL_SCRIPT_COVERAGE ${JSON.stringify({ status: report.status, sourceCount: report.sources.length, scenarioCount: report.scenarios.length, report: logicalReportPath, reportSha256 })}\n`);
    return report;
  } finally {
    validateExclusiveControlScriptAttempt(path.dirname(outputDirectory), outputDirectory);
    rmSync(tapPath, { force: true });
    rmSync(lcovPath, { force: true });
    rmSync(emptyGitConfigPath, { force: true });
    rmSync(scenarioDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runControlScriptCoverage(); }
  catch (error) {
    const code = error instanceof Error && /^PR_C_CONTROL_SCRIPT_COVERAGE_REJECTED:[a-z0-9-]+$/u.test(error.message)
      ? error.message.slice('PR_C_CONTROL_SCRIPT_COVERAGE_REJECTED:'.length)
      : 'internal';
    process.stderr.write(`PR_C_CONTROL_SCRIPT_COVERAGE_FAILED:${code}\n`);
    process.exitCode = 1;
  }
}
