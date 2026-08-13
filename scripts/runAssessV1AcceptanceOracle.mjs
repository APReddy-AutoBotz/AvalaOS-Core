import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  gateOracle,
  governanceOracle,
  validateOracleInputs,
} from '../tests/acceptance/oracles/assess-v1-oracle.mjs';
import { loadExecutionBindings } from './exhaustiveAcceptanceModel.mjs';

const releaseSha = process.env.RELEASE_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const workflowRunId = String(process.env.GITHUB_RUN_ID || 'local');
const workflowAttempt = String(process.env.GITHUB_RUN_ATTEMPT || 'local');
const manifestPath = path.resolve(process.env.ORACLE_RESULTS_MANIFEST || 'acceptance-results/oracle-results.json');
const fixtures = JSON.parse(fs.readFileSync('tests/acceptance/fixtures/process-discovery-transcripts.json', 'utf8')).fixtures;
const base = fixtures.find(item => item.slug === 'clean-straight-through')?.oracleInputs;
const bindings = loadExecutionBindings();
if (!base) throw new Error('ORACLE_BASE_FIXTURE_MISSING');
if (!/^[0-9a-f]{40}$/u.test(releaseSha)) throw new Error('ORACLE_RELEASE_SHA_REQUIRED');

const fixtureBySlug = new Map(fixtures.map(item => [item.slug, item]));
const results = [];

const runScenario = scenario => {
  switch (scenario) {
    case 'missing-input':
      try { validateOracleInputs({ ...base, completionQuality: undefined }); return { pass: false, actual: 'accepted missing input' }; }
      catch (error) { return { pass: error instanceof RangeError, actual: error.constructor.name }; }
    case 'invalid-input':
      try { validateOracleInputs({ ...base, standardization: 0 }); return { pass: false, actual: 'accepted invalid input' }; }
      catch (error) { return { pass: error instanceof RangeError, actual: error.constructor.name }; }
    case 'governance-min': {
      const actual = governanceOracle({ ...base, riskCriticality: 1, governanceSensitivity: 1, dataSensitivity: 1, errorReversibility: 5, goalAmbiguity: 1 });
      return { pass: actual.score === 20 && actual.riskTier === 'Minimal' && actual.gateDecision === 'Go', actual };
    }
    case 'governance-max': {
      const actual = governanceOracle({ ...base, riskCriticality: 5, governanceSensitivity: 5, dataSensitivity: 5, errorReversibility: 1, goalAmbiguity: 5 });
      return { pass: actual.score === 100 && actual.riskTier === 'Unacceptable' && actual.gateDecision === 'No-Go', actual };
    }
    case 'needs-discovery':
    case 'completion-below': {
      const actual = gateOracle({ ...base, completionQuality: 49.9 }).primaryGatingOutcome;
      return { pass: actual === 'Needs Discovery', actual };
    }
    case 'completion-exact': {
      const actual = gateOracle({ ...base, completionQuality: 50 }).primaryGatingOutcome;
      return { pass: actual === 'Passed', actual };
    }
    case 'completion-above': {
      const actual = gateOracle({ ...base, completionQuality: 50.1 }).primaryGatingOutcome;
      return { pass: actual === 'Passed', actual };
    }
    case 'process-redesign': {
      const actual = gateOracle({ ...base, processMaturity: 1, standardization: 1 }).primaryGatingOutcome;
      return { pass: actual === 'Process Redesign First', actual };
    }
    case 'low-value': {
      const actual = gateOracle({ ...base, volume: 10, manualEffort: 1, cycleTimePain: 2, reworkPain: 2 }).primaryGatingOutcome;
      return { pass: actual === 'Monitor / Deprioritize', actual };
    }
    case 'human-led': {
      const actual = gateOracle({ ...base, goalAmbiguity: 5, riskCriticality: 5 }).primaryGatingOutcome;
      return { pass: actual === 'Human-Led / Do Not Automate', actual };
    }
    case 'governance-review': {
      const actual = gateOracle({ ...base, dataSensitivity: 4 }).primaryGatingOutcome;
      return { pass: actual === 'Governance Review Required', actual };
    }
    case 'no-go': {
      const actual = gateOracle({ ...base, riskCriticality: 5, errorReversibility: 2, governanceSensitivity: 4 }).primaryGatingOutcome;
      return { pass: actual === 'No-Go', actual };
    }
    case 'fixture-low-suitability':
    case 'fixture-strong-automation':
    case 'fixture-hitl-compliance': {
      const slug = scenario === 'fixture-low-suitability'
        ? 'poor-automation-candidate'
        : scenario === 'fixture-strong-automation'
          ? 'clean-straight-through'
          : 'compliance-heavy';
      const fixture = fixtureBySlug.get(slug);
      if (!fixture) return { pass: false, actual: `missing fixture ${slug}` };
      const actualGate = gateOracle(fixture.oracleInputs).primaryGatingOutcome;
      const safe = fixture.synthetic === true &&
        fixture.knownExpectedOutcome?.realProviderCallCount === 0 &&
        fixture.knownExpectedOutcome?.customerRecordCount === 0;
      return {
        pass: safe && actualGate === fixture.knownExpectedOutcome?.primaryGate,
        actual: {
          fixture: slug,
          primaryGate: actualGate,
          expectedClassification: fixture.knownExpectedOutcome?.classification,
          synthetic: fixture.synthetic,
        },
      };
    }
    default:
      return { pass: false, actual: `unknown oracle scenario ${scenario}` };
  }
};

for (const binding of bindings.oracleTests ?? []) {
  try {
    const evaluated = runScenario(binding.scenario);
    results.push({
      testId: binding.testId,
      scenario: binding.scenario,
      status: evaluated.pass ? 'PASS' : 'FAIL',
      actual: evaluated.actual,
    });
  } catch (error) {
    results.push({
      testId: binding.testId,
      scenario: binding.scenario,
      status: 'FAIL',
      actual: error instanceof Error ? error.message : String(error),
    });
  }
}

const manifest = {
  schemaVersion: 1,
  releaseSha,
  workflowRunId,
  workflowAttempt,
  generatedAt: new Date().toISOString(),
  results,
};
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
const temp = `${manifestPath}.tmp`;
fs.writeFileSync(temp, `${JSON.stringify(manifest, null, 2)}\n`);
fs.renameSync(temp, manifestPath);

const failures = results.filter(item => item.status !== 'PASS');
console.log(JSON.stringify({ oracleTests: results.length, passed: results.length - failures.length, failed: failures.map(item => item.testId), manifest: manifestPath }));
if (failures.length) process.exitCode = 1;
