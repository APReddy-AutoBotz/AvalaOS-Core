import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { gateOracle, governanceOracle, validateOracleInputs } from '../tests/acceptance/oracles/assess-v1-oracle.mjs';
import { loadExecutionBindings } from './exhaustiveAcceptanceModel.mjs';

const releaseSha = process.env.RELEASE_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const workflowRunId = String(process.env.GITHUB_RUN_ID || 'local');
const workflowAttempt = String(process.env.GITHUB_RUN_ATTEMPT || 'local');
const manifestPath = path.resolve(process.env.ORACLE_RESULTS_MANIFEST || 'acceptance-results/oracle-results.json');
const sutManifestPath = path.resolve(process.env.SUT_RESULTS_MANIFEST || 'acceptance-results/sut-oracle-results.json');
const fixtures = JSON.parse(fs.readFileSync('tests/acceptance/fixtures/process-discovery-transcripts.json', 'utf8')).fixtures;
const base = fixtures.find(item => item.slug === 'clean-straight-through')?.oracleInputs;
const bindings = loadExecutionBindings();
if (!base) throw new Error('ORACLE_BASE_FIXTURE_MISSING');
if (!/^[0-9a-f]{40}$/u.test(releaseSha)) throw new Error('ORACLE_RELEASE_SHA_REQUIRED');

fs.mkdirSync(path.dirname(sutManifestPath), { recursive: true });
const sutRun = spawnSync(process.execPath, [
  'scripts/runTypeScriptTest.mjs',
  'types.ts',
  'services/scoringEngine.ts',
  'tests/acceptance/oracles/assess-v1-sut.test.ts',
], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: { ...process.env, SUT_RESULTS_MANIFEST: sutManifestPath },
});
if (sutRun.status !== 0) throw new Error('PRODUCTION_SCORING_COMPARATOR_FAILED');
const sutManifest = JSON.parse(fs.readFileSync(sutManifestPath, 'utf8'));
const sutIndex = new Map((sutManifest.results ?? []).map(item => [item.testId, item]));

const gateResult = (inputs, expected) => {
  const actual = gateOracle(inputs).primaryGatingOutcome;
  return { pass: actual === expected, actual: { primaryGatingOutcome: actual } };
};

const runScenario = scenario => {
  switch (scenario) {
    case 'missing-input':
      try { validateOracleInputs({ ...base, completionQuality: undefined }); return { pass: false, actual: { rejected: false } }; }
      catch (error) { return { pass: error instanceof RangeError, actual: { rejected: true } }; }
    case 'invalid-input':
      try { validateOracleInputs({ ...base, standardization: 0 }); return { pass: false, actual: { rejected: false } }; }
      catch (error) { return { pass: error instanceof RangeError, actual: { rejected: true } }; }
    case 'governance-min': {
      const actual = governanceOracle({ ...base, riskCriticality: 1, governanceSensitivity: 1, dataSensitivity: 1, errorReversibility: 5, goalAmbiguity: 1 });
      return { pass: actual.score === 20 && actual.riskTier === 'Minimal' && actual.gateDecision === 'Go', actual: { riskTier: actual.riskTier, gateDecision: actual.gateDecision } };
    }
    case 'governance-max': {
      const actual = governanceOracle({ ...base, riskCriticality: 5, governanceSensitivity: 5, dataSensitivity: 5, errorReversibility: 1, goalAmbiguity: 5 });
      return { pass: actual.score === 100 && actual.riskTier === 'Unacceptable' && actual.gateDecision === 'No-Go', actual: { riskTier: actual.riskTier, gateDecision: actual.gateDecision } };
    }
    case 'needs-discovery':
    case 'completion-below': return gateResult({ ...base, completionQuality: 49.9 }, 'Needs Discovery');
    case 'completion-exact': return gateResult({ ...base, completionQuality: 50 }, 'Passed');
    case 'completion-above': return gateResult({ ...base, completionQuality: 50.1 }, 'Passed');
    case 'process-redesign': return gateResult({ ...base, processMaturity: 1, standardization: 1 }, 'Process Redesign First');
    case 'low-value': return gateResult({ ...base, volume: 10, manualEffort: 1, cycleTimePain: 2, reworkPain: 2 }, 'Monitor / Deprioritize');
    case 'human-led': return gateResult({ ...base, goalAmbiguity: 5, riskCriticality: 5 }, 'Human-Led / Do Not Automate');
    case 'governance-review': return gateResult({ ...base, dataSensitivity: 4 }, 'Governance Review Required');
    case 'no-go': return gateResult({ ...base, riskCriticality: 5, errorReversibility: 2, governanceSensitivity: 4 }, 'No-Go');
    default: return { pass: false, actual: { error: `unknown oracle scenario ${scenario}` } };
  }
};

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const results = [];
for (const binding of bindings.oracleTests ?? []) {
  try {
    const evaluated = runScenario(binding.scenario);
    const sut = sutIndex.get(binding.testId);
    const sutMatches = sut?.status === 'PASS' && same(sut.actual, evaluated.actual);
    results.push({
      testId: binding.testId,
      scenario: binding.scenario,
      status: evaluated.pass && sutMatches ? 'PASS' : 'FAIL',
      actual: { oracle: evaluated.actual, production: sut?.actual ?? 'missing', matched: sutMatches },
    });
  } catch (error) {
    results.push({ testId: binding.testId, scenario: binding.scenario, status: 'FAIL', actual: error instanceof Error ? error.message : String(error) });
  }
}

const manifest = { schemaVersion: 1, releaseSha, workflowRunId, workflowAttempt, generatedAt: new Date().toISOString(), results };
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
const temp = `${manifestPath}.tmp`;
fs.writeFileSync(temp, `${JSON.stringify(manifest, null, 2)}\n`);
fs.renameSync(temp, manifestPath);
const failures = results.filter(item => item.status !== 'PASS');
console.log(JSON.stringify({ oracleTests: results.length, passed: results.length - failures.length, failed: failures.map(item => item.testId), manifest: manifestPath }));
if (failures.length) process.exitCode = 1;
