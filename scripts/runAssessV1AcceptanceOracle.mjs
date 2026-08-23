import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { gateOracle, governanceOracle, validateOracleInputs } from '../tests/acceptance/oracles/assess-v1-oracle.mjs';
import { canonicalCommand, loadCatalog, loadExecutionBindings, loadSourceProvenance, validateSourceProvenance } from './exhaustiveAcceptanceModel.mjs';

const releaseSha = process.env.RELEASE_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const workflowRunId = String(process.env.GITHUB_RUN_ID || 'local');
const workflowAttempt = String(process.env.GITHUB_RUN_ATTEMPT || 'local');
const workflowPath = process.env.ACCEPTANCE_WORKFLOW_PATH || '.github/workflows/exhaustive-acceptance.yml';
const environment = process.env.ACCEPTANCE_EVIDENCE_ENVIRONMENT || 'stable-release';
const manifestPath = path.resolve(process.env.ORACLE_RESULTS_MANIFEST || 'acceptance-results/oracle-results.json');
const sutManifestPath = path.resolve(process.env.SUT_RESULTS_MANIFEST || 'acceptance-results/sut-oracle-results.json');
const governanceManifestPath = path.resolve(process.env.GOVERNANCE_SUT_RESULTS_MANIFEST || 'acceptance-results/governance-sut-results.json');
const fixtures = JSON.parse(fs.readFileSync('tests/acceptance/fixtures/process-discovery-transcripts.json', 'utf8')).fixtures;
const base = fixtures.find(item => item.slug === 'clean-straight-through')?.oracleInputs;
const bindings = loadExecutionBindings();
const provenanceDocument = loadSourceProvenance();
const catalog = loadCatalog();
const provenanceErrors = validateSourceProvenance(catalog, bindings, provenanceDocument);
if (provenanceErrors.length) throw new Error(`ORACLE_PROVENANCE_INVALID:${provenanceErrors.join(',')}`);
const provenanceByTestId = new Map(provenanceDocument.contracts.map(item => [item.testId, item]));
const catalogByTestId = new Map(catalog.cases.map(item => [item.testId, item]));
const oracleContext = bindings.oracleExecution;
const command = canonicalCommand(oracleContext?.command ?? []);
if (!base) throw new Error('ORACLE_BASE_FIXTURE_MISSING');
if (!/^[0-9a-f]{40}$/u.test(releaseSha)) throw new Error('ORACLE_RELEASE_SHA_REQUIRED');
if (!oracleContext || !oracleContext.environments?.includes(environment) || oracleContext.workflowPath !== workflowPath || !command) throw new Error('ORACLE_CANONICAL_EXECUTION_CONTEXT_REQUIRED');

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
const exactIndex = (items, field, errorCode) => {
  const index = new Map();
  for (const item of items ?? []) {
    const key = item?.[field];
    if (!key || index.has(key)) throw new Error(errorCode);
    index.set(key, item);
  }
  return index;
};
const sutIndex = exactIndex(sutManifest.results, 'testId', 'PRODUCTION_SCORING_COMPARATOR_DUPLICATE_RESULT');

fs.mkdirSync(path.dirname(governanceManifestPath), { recursive: true });
const governanceRun = spawnSync(process.execPath, [
  'scripts/runTypeScriptTest.mjs',
  'types.ts',
  'services/scoringEngine.ts',
  'services/scoringEngine.test.ts',
], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: {
    ...process.env,
    RELEASE_SHA: releaseSha,
    GITHUB_RUN_ID: workflowRunId,
    GITHUB_RUN_ATTEMPT: workflowAttempt,
    SCORING_GOVERNANCE_RESULTS_MANIFEST: governanceManifestPath,
  },
});
if (governanceRun.status !== 0) throw new Error('PRODUCTION_GOVERNANCE_SCORE_COMPARATOR_FAILED');
const governanceManifest = JSON.parse(fs.readFileSync(governanceManifestPath, 'utf8'));
if (governanceManifest?.schemaVersion !== 1
  || governanceManifest?.releaseSha !== releaseSha
  || String(governanceManifest?.workflowRunId) !== workflowRunId
  || String(governanceManifest?.workflowAttempt) !== workflowAttempt
  || !Array.isArray(governanceManifest?.results)) {
  throw new Error('PRODUCTION_GOVERNANCE_SCORE_EVIDENCE_INVALID');
}
const governanceIndex = exactIndex(governanceManifest.results, 'scenario', 'PRODUCTION_GOVERNANCE_SCORE_DUPLICATE_RESULT');

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
      return { pass: actual.score === 20 && actual.riskTier === 'Minimal' && actual.gateDecision === 'Go', actual: { governanceRisk: actual.score, riskTier: actual.riskTier, gateDecision: actual.gateDecision } };
    }
    case 'governance-max': {
      const actual = governanceOracle({ ...base, riskCriticality: 5, governanceSensitivity: 5, dataSensitivity: 5, errorReversibility: 1, goalAmbiguity: 5 });
      return { pass: actual.score === 100 && actual.riskTier === 'Unacceptable' && actual.gateDecision === 'No-Go', actual: { governanceRisk: actual.score, riskTier: actual.riskTier, gateDecision: actual.gateDecision } };
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
  const provenance = provenanceByTestId.get(binding.testId);
  const testCase = catalogByTestId.get(binding.testId);
  const owner = provenance?.ownership?.find(item => item.kind === 'oracle-scenario' && item.ownerId === binding.scenario);
  try {
    if (!provenance || !testCase || !owner || owner.assertionIds?.length !== 1 || owner.scenarioIds?.length !== 1) throw new Error('ORACLE_PROOF_OWNER_MISSING');
    const evaluated = runScenario(binding.scenario);
    const sut = sutIndex.get(binding.testId);
    let sutMatches = sut?.status === 'PASS';
    let productionActual = sut?.actual ?? 'missing';

    if (binding.scenario === 'governance-min' || binding.scenario === 'governance-max') {
      const exactGovernance = governanceIndex.get(binding.scenario)?.actual;
      const bandExpected = { riskTier: evaluated.actual.riskTier, gateDecision: evaluated.actual.gateDecision };
      sutMatches = sutMatches && same(sut?.actual, bandExpected) && same(exactGovernance, evaluated.actual);
      productionActual = { band: sut?.actual ?? 'missing', exactGovernance: exactGovernance ?? 'missing' };
    } else {
      sutMatches = sutMatches && same(sut?.actual, evaluated.actual);
    }

    const assertionOutcomes = [{ assertionId: owner.assertionIds[0], status: evaluated.pass && sutMatches ? 'PASS' : 'FAIL' }];
    const status = assertionOutcomes[0].status === 'FAIL'
      ? 'FAIL'
      : provenance.scope?.evidenceScope === 'executed-fixture' && provenance.scope.organizationId && provenance.scope.workspaceId
        ? 'PASS'
        : 'BLOCKED';
    results.push({
      testId: binding.testId,
      scenario: binding.scenario,
      status,
      releaseSha,
      workflowRunId,
      workflowAttempt,
      environment,
      workflowPath,
      command,
      assertionIds: [...owner.assertionIds],
      assertionOutcomes,
      scenarioIds: [...owner.scenarioIds],
      branchIds: [...testCase.branchIds],
      sourceReferences: [...testCase.sourceReference],
      scope: { ...provenance.scope },
      actual: { oracle: evaluated.actual, production: productionActual, matched: sutMatches },
    });
  } catch (error) {
    results.push({
      testId: binding.testId,
      scenario: binding.scenario,
      status: 'FAIL',
      releaseSha,
      workflowRunId,
      workflowAttempt,
      environment,
      workflowPath,
      command,
      assertionIds: owner?.assertionIds ?? ['missing-owner'],
      assertionOutcomes: [{ assertionId: owner?.assertionIds?.[0] ?? 'missing-owner', status: 'FAIL' }],
      scenarioIds: owner?.scenarioIds ?? [binding.scenario],
      branchIds: testCase?.branchIds ?? ['missing-branch'],
      sourceReferences: testCase?.sourceReference ?? ['missing-source'],
      scope: provenance?.scope ?? { evidenceScope: 'planned-fixture', fixtureId: testCase?.fixture ?? 'missing-fixture', organizationId: null, workspaceId: null },
      actual: error instanceof Error ? error.message : String(error),
    });
  }
}

const manifest = { schemaVersion: 2, releaseSha, workflowRunId, workflowAttempt, environment, workflowPath, command, generatedAt: new Date().toISOString(), results };
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
const temp = `${manifestPath}.tmp`;
fs.writeFileSync(temp, `${JSON.stringify(manifest, null, 2)}\n`);
fs.renameSync(temp, manifestPath);
const failures = results.filter(item => item.status === 'FAIL');
const blocked = results.filter(item => item.status === 'BLOCKED');
console.log(JSON.stringify({ oracleTests: results.length, passed: results.length - failures.length - blocked.length, blocked: blocked.map(item => item.testId), failed: failures.map(item => item.testId), manifest: manifestPath }));
if (failures.length) process.exitCode = 1;
