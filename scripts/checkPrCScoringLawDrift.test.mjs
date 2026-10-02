import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ACCEPTED_BASE,
  BASELINE_SHA256,
  checkScoringLawDrift,
  CURRENT_SCORER_CANONICAL_SHA256,
  inspectScoringImportAst,
  readPinnedRegularFile,
  SCORING_PATHS,
  TYPE_SYMBOLS,
  validateCompilerAuthority,
  validateDirectEnvironment,
  validateScoringTransformation,
  validateStableRead,
} from './checkPrCScoringLawDrift.mjs';

const root = process.cwd();
const script = 'scripts/checkPrCScoringLawDrift.mjs';
const git = args => execFileSync('git', ['--no-replace-objects', '-c', 'core.fsmonitor=false', ...args], {
  cwd: root, encoding: 'buffer', windowsHide: true, timeout: 30_000, maxBuffer: 4 * 1024 ** 2,
  env: process.env,
});
const baseline = Object.fromEntries(SCORING_PATHS.map(relative => [relative, git(['show', `${ACCEPTED_BASE}:${relative}`])]));
const current = Object.fromEntries(SCORING_PATHS.map(relative => [relative, readFileSync(path.join(root, relative))]));
const input = (overrides = {}) => ({
  baselineScorer: baseline[SCORING_PATHS[0]], currentScorer: current[SCORING_PATHS[0]],
  baselineTest: baseline[SCORING_PATHS[1]], currentTest: current[SCORING_PATHS[1]],
  baselineRegression: baseline[SCORING_PATHS[2]], currentRegression: current[SCORING_PATHS[2]],
  ...overrides,
});
const replace = (bytes, from, to) => {
  const text = bytes.toString('utf8');
  assert.equal(text.split(from).length - 1, 1, `fixture substitution must be unique: ${from}`);
  return Buffer.from(text.replace(from, to));
};
const mutateByte = bytes => { const changed = Buffer.from(bytes); changed[10] ^= 1; return changed; };
const closedEnvironment = (extra = {}) => ({
  ...Object.fromEntries(['SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'ComSpec', 'PATH', 'Path', 'PATHEXT', 'TEMP', 'TMP']
    .filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]])),
  ...extra,
});
const runCli = (extraEnvironment = {}, args = []) => spawnSync(process.execPath, [script, ...args], {
  cwd: root, env: closedEnvironment(extraEnvironment), encoding: 'utf8', windowsHide: true,
  timeout: 90_000, maxBuffer: 64 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
});

test('the accepted base, ordered paths, raw blobs, TypeScript symbols, and exact source transformation are pinned', () => {
  assert.equal(ACCEPTED_BASE, '5433cad41721355e3ec5a29bc2f87772540c77b5');
  assert.deepEqual([...SCORING_PATHS], ['services/scoringEngine.ts', 'services/scoringEngine.test.ts', 'scripts/runScoringRegression.mjs']);
  assert.deepEqual(BASELINE_SHA256, {
    'services/scoringEngine.ts': '5361966c91e6492ac69b3f79841365decc6de96472d345ed0472c24f9bd27f04',
    'services/scoringEngine.test.ts': '293810f36aa98367e479e36af2dba886af666b02e894022dd5b5523352f7e147',
    'scripts/runScoringRegression.mjs': '8c834d551b50d1e70b23f6af40c48703b6126ec0fb4e3d144809a989c836985b',
  });
  assert.deepEqual([...TYPE_SYMBOLS], ['AssessmentResponses','AssessmentScoreResult','BusinessValueSummary','ConfidenceBand','DecisionPack','EngineOutput','GateDecision','GatingOutcome','GovernanceSummary','HandoffEligibility','HandoffPack','OperatingModelRecommendation','PriorityTier','RiskTier','TechnologyFitScores']);
  assert.equal(validateScoringTransformation(input()).currentCanonicalSha256, CURRENT_SCORER_CANONICAL_SHA256);
  const crlf = Buffer.from(current[SCORING_PATHS[0]].toString('utf8').replace(/\n/gu, '\r\n'));
  assert.equal(validateScoringTransformation(input({ currentScorer: crlf })).lineEndings, 'crlf');
  assert.equal(checkScoringLawDrift(root, closedEnvironment(), []).currentCanonicalSha256, CURRENT_SCORER_CANONICAL_SHA256);
});

test('formula, operator, weight, threshold, hard-stop, recommendation, version, test, and regression drift fail closed', () => {
  for (const [from, to] of [
    ["export const CURRENT_SCORE_VERSION = 'assess-core-2026-05';", "export const CURRENT_SCORE_VERSION = 'assess-core-2026-06';"],
    ['score >= 85', 'score > 85'],
    ['input.inputStructure * 0.55', 'input.inputStructure * 0.56'],
    ['mandatory HITL triggers above 65', 'mandatory HITL triggers above 66'],
    ["gatesTriggered.push('No-Go')", "gatesTriggered.push('Go')"],
    ["'Workflow-first Orchestration'", "'Workflow-only Orchestration'"],
  ]) assert.throws(() => validateScoringTransformation(input({ currentScorer: replace(current[SCORING_PATHS[0]], from, to) })), /SCORING_BODY_DRIFT_REJECTED|CURRENT_CANONICAL_REJECTED/u);
  assert.throws(() => validateScoringTransformation(input({ currentTest: mutateByte(current[SCORING_PATHS[1]]) })), /SCORING_TEST_DRIFT_REJECTED/u);
  assert.throws(() => validateScoringTransformation(input({ currentRegression: mutateByte(current[SCORING_PATHS[2]]) })), /SCORING_REGRESSION_DRIFT_REJECTED/u);
  assert.throws(() => validateScoringTransformation(input({ baselineTest: Buffer.concat([baseline[SCORING_PATHS[1]], Buffer.from(' ')]) })), /BASELINE_BLOB_REJECTED/u);
});

test('import authority rejects missing extra reordered aliased runtime wrong-path second and attributed imports', () => {
  const scorer = current[SCORING_PATHS[0]];
  const changedImports = [
    replace(scorer, '    AssessmentResponses,\n', ''),
    replace(scorer, '    AssessmentResponses,\n', '    AssessmentResponses,\n    UnknownScoringSymbol,\n'),
    replace(scorer, '    AssessmentResponses,\n    AssessmentScoreResult,\n', '    AssessmentScoreResult,\n    AssessmentResponses,\n'),
    replace(scorer, '    AssessmentResponses,\n', '    AssessmentResponses as Responses,\n'),
    replace(scorer, 'import type {\n', 'import {\n'),
    replace(scorer, "} from '../types.ts';\n", "} from '../types';\n"),
    Buffer.concat([Buffer.from("import type {} from '../types.ts';\n"), scorer]),
    replace(scorer, '    AssessmentResponses,\n', '    type AssessmentResponses,\n'),
    replace(scorer, "} from '../types.ts';\n", "} from '../types.ts' with { type: 'json' };\n"),
  ];
  for (const changed of changedImports) {
    assert.throws(() => validateScoringTransformation(input({ currentScorer: changed })), /REJECTED/u);
    assert.throws(() => inspectScoringImportAst(changed.toString('utf8'), '../types.ts', true), /REJECTED/u);
  }
});

test('raw source decoding rejects BOM NUL invalid UTF-8 bare CR mixed EOL and newline substitution', () => {
  const scorer = current[SCORING_PATHS[0]];
  const text = scorer.toString('utf8');
  const firstLf = text.indexOf('\n');
  for (const changed of [
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), scorer]),
    Buffer.concat([scorer.subarray(0, 10), Buffer.from([0]), scorer.subarray(10)]),
    Buffer.from([0xc3, 0x28, 0x0a]),
    Buffer.from(`${text.slice(0, firstLf)}\r${text.slice(firstLf + 1)}`),
    Buffer.from(`${text.slice(0, firstLf)}\r\n${text.slice(firstLf + 1)}`),
    Buffer.from(text.replace('import type {\n', 'import type { \n')),
  ]) assert.throws(() => validateScoringTransformation(input({ currentScorer: changed })), /REJECTED/u);
});

test('direct environment is closed to Git Node and CLI authority substitution', () => {
  assert.equal(validateDirectEnvironment({}), true);
  assert.equal(validateDirectEnvironment({ GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.fsmonitor', GIT_CONFIG_VALUE_0: 'false' }), true);
  for (const environment of [
    { NODE_OPTIONS: '--inspect' }, { node_path: 'substituted' }, { git_dir: 'foreign' },
    { GIT_CONFIG_COUNT: '1' },
    { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.fsmonitor', GIT_CONFIG_VALUE_0: 'true' },
    { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.fsmonitor', GIT_CONFIG_VALUE_0: 'false', GIT_CONFIG_KEY_1: 'safe.directory' },
    { git_config_count: '1', GIT_CONFIG_KEY_0: 'core.fsmonitor', GIT_CONFIG_VALUE_0: 'false' },
  ]) assert.throws(() => validateDirectEnvironment(environment));
  assert.throws(() => checkScoringLawDrift(root, closedEnvironment(), ['substituted']), /ARGUMENTS_REJECTED/u);
});

test('canonical CLI uses its exact repository authority, succeeds with both approved Git environments, and rejects arguments with fixed diagnostics', () => {
  const ownershipProbe = spawnSync('git', ['--no-replace-objects', '-c', 'core.fsmonitor=false', '-c', `safe.directory=${root}`, 'rev-parse', '--show-toplevel'], {
    cwd: root, env: { ...closedEnvironment(), GIT_ASKPASS: '', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }, encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 64 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (ownershipProbe.status === 0) {
    for (const environment of [{}, { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.fsmonitor', GIT_CONFIG_VALUE_0: 'false' }]) {
      const child = runCli(environment);
      assert.equal(child.error, undefined); assert.equal(child.signal, null); assert.equal(child.status, 0);
      assert.equal(child.stderr, ''); assert.match(child.stdout, /^PR_C_SCORING_LAW_DRIFT \{"status":"passed","acceptedBase":"[0-9a-f]{40}","paths":\[[^\n]+\],"currentCanonicalSha256":"[0-9a-f]{64}"\}\r?\n$/u);
      assert.doesNotMatch(child.stdout, /PR_C_ASSERTION/u);
    }
  } else assert.fail('the internally derived exact safe.directory must make the current checkout available without global Git authority');
  const rejected = runCli({}, ['substituted']);
  assert.equal(rejected.status, 1); assert.equal(rejected.stdout, ''); assert.equal(rejected.stderr, 'PR_C_SCORING_LAW_DRIFT_REJECTED\n');
});

test('pinned source reader rejects missing unpinned and symbolic-link paths without following them', () => {
  const parent = realpathSync(tmpdir());
  const prefix = 'pr-c-scoring-law-path-';
  const directory = mkdtempSync(path.join(parent, prefix));
  const assertOwnedDirectory = () => {
    assert.equal(path.dirname(directory), parent);
    assert.match(path.basename(directory), /^pr-c-scoring-law-path-[A-Za-z0-9_-]{6}$/u);
    assert.equal(realpathSync(directory), directory);
  };
  try {
    assertOwnedDirectory();
    mkdirSync(path.join(directory, 'services'), { recursive: true });
    mkdirSync(path.join(directory, 'scripts'), { recursive: true });
    writeFileSync(path.join(directory, SCORING_PATHS[1]), 'fixture\n');
    assert.equal(readPinnedRegularFile(directory, SCORING_PATHS[1]).bytes.toString(), 'fixture\n');
    assert.throws(() => readPinnedRegularFile(directory, SCORING_PATHS[0]));
    assert.throws(() => readPinnedRegularFile(directory, '../outside'), /SOURCE_PATH_NOT_PINNED/u);
    symlinkSync(path.join(directory, SCORING_PATHS[1]), path.join(directory, SCORING_PATHS[0]), 'file');
    assert.throws(() => readPinnedRegularFile(directory, SCORING_PATHS[0]), /SOURCE_PATH_REJECTED/u);
    const actualTypeScriptRoot = path.dirname(path.dirname(realpathSync(createRequire(import.meta.url).resolve('typescript'))));
    mkdirSync(path.join(directory, 'node_modules'), { recursive: true });
    symlinkSync(actualTypeScriptRoot, path.join(directory, 'node_modules', 'typescript'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(validateCompilerAuthority(directory), true, 'a private candidate dependency link must resolve to the exact loaded TypeScript package');
    assert.throws(() => checkScoringLawDrift(directory, closedEnvironment(), []));
  } finally {
    assertOwnedDirectory();
    rmSync(directory, { recursive: true, force: false });
  }
});

test('post-check identity and raw-byte races cannot be reported as unchanged', () => {
  const identity = { dev: 1n, ino: 2n, size: 3n, mtimeNs: 4n };
  assert.equal(validateStableRead(identity, { ...identity }, Buffer.from('same'), Buffer.from('same')), true);
  assert.throws(() => validateStableRead(identity, { ...identity, mtimeNs: 5n }, Buffer.from('same'), Buffer.from('same')), /SOURCE_IDENTITY_RACE/u);
  assert.throws(() => validateStableRead(identity, { ...identity }, Buffer.from('same'), Buffer.from('sAme')), /SOURCE_BYTES_RACE/u);
});

test('standalone gate source has no assertion markers and cannot accept a synthetic green-suite artifact', () => {
  const source = readFileSync(path.join(root, script), 'utf8');
  assert.doesNotMatch(source, /PR_C_ASSERTION/u);
  assert.doesNotMatch(source, /process\.env\.(?:RESULT|PASS|SUITE)|artifact|manifest/iu);
  assert.match(source, /checkScoringLawDrift\(process\.cwd\(\), process\.env, process\.argv\.slice\(2\)\)/u);
});
