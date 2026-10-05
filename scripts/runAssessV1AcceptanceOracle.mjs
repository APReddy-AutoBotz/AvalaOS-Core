import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { gateOracle, governanceOracle, validateOracleInputs } from '../tests/acceptance/oracles/assess-v1-oracle.mjs';
import {
  canonicalDigest,
  canonicalJson,
  loadAssessV1OracleEvidence,
} from './assessV1OracleEvidence.mjs';
import { canonicalCommand, loadCatalog, loadExecutionBindings, loadSourceProvenance, validateSourceProvenance } from './exhaustiveAcceptanceModel.mjs';

const releaseSha = process.env.RELEASE_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const workflowRunId = String(process.env.GITHUB_RUN_ID || 'local');
const workflowAttempt = String(process.env.GITHUB_RUN_ATTEMPT || 'local');
const workflowPath = process.env.ACCEPTANCE_WORKFLOW_PATH || '.github/workflows/exhaustive-acceptance.yml';
const environment = process.env.ACCEPTANCE_EVIDENCE_ENVIRONMENT || 'stable-release';
const manifestPath = path.resolve(process.env.ORACLE_RESULTS_MANIFEST || 'acceptance-results/oracle-results.json');
const sutManifestPath = path.resolve(process.env.SUT_RESULTS_MANIFEST || 'acceptance-results/sut-oracle-results.json');
const bindings = loadExecutionBindings();
const provenanceDocument = loadSourceProvenance();
const catalog = loadCatalog();
const provenanceErrors = validateSourceProvenance(catalog, bindings, provenanceDocument);
if (provenanceErrors.length) throw new Error(`ORACLE_PROVENANCE_INVALID:${provenanceErrors.join(',')}`);
const provenanceByTestId = new Map(provenanceDocument.contracts.map(item => [item.testId, item]));
const catalogByTestId = new Map(catalog.cases.map(item => [item.testId, item]));
const oracleContext = bindings.oracleExecution;
const command = canonicalCommand(oracleContext?.command ?? []);
if (!/^[0-9a-f]{40}$/u.test(releaseSha)) throw new Error('ORACLE_RELEASE_SHA_REQUIRED');
if (!oracleContext || !oracleContext.environments?.includes(environment) || oracleContext.workflowPath !== workflowPath || !command) throw new Error('ORACLE_CANONICAL_EXECUTION_CONTEXT_REQUIRED');

const evidence = loadAssessV1OracleEvidence({ bindings });
fs.mkdirSync(path.dirname(sutManifestPath), { recursive: true });
const sutRun = spawnSync(process.execPath, [
  'scripts/runTypeScriptTest.mjs',
  'types.ts',
  'services/scoringEngine.ts',
  'tests/acceptance/oracles/assess-v1-sut.test.ts',
], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: {
    ...process.env,
    RELEASE_SHA: releaseSha,
    GITHUB_RUN_ID: workflowRunId,
    GITHUB_RUN_ATTEMPT: workflowAttempt,
    ACCEPTANCE_WORKFLOW_PATH: workflowPath,
    SUT_RESULTS_MANIFEST: sutManifestPath,
  },
});
if (sutRun.status !== 0) throw new Error('PRODUCTION_SCORING_COMPARATOR_FAILED');
const sutManifest = JSON.parse(fs.readFileSync(sutManifestPath, 'utf8'));

const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const exactIndex = (items, errorCode) => {
  if (!Array.isArray(items) || items.length !== 13) throw new Error(errorCode);
  const index = new Map();
  for (const item of items) {
    if (!item?.testId || index.has(item.testId)) throw new Error(errorCode);
    index.set(item.testId, item);
  }
  return index;
};
if (sutManifest?.schemaVersion !== 2
  || sutManifest?.releaseSha !== releaseSha
  || String(sutManifest?.workflowRunId) !== workflowRunId
  || String(sutManifest?.workflowAttempt) !== workflowAttempt
  || sutManifest?.workflowPath !== workflowPath
  || sutManifest?.command !== command
  || !same(sutManifest?.evidenceIdentity, evidence.identity)) {
  throw new Error('PRODUCTION_SCORING_COMPARATOR_IDENTITY_INVALID');
}
const sutIndex = exactIndex(sutManifest.results, 'PRODUCTION_SCORING_COMPARATOR_RESULT_SET_INVALID');
for (const scenario of evidence.scenarios) {
  const result = sutIndex.get(scenario.testId);
  if (!result
    || result.scenario !== scenario.scenario
    || result.status !== 'PASS'
    || result.inputDigest !== scenario.inputDigest
    || result.persistentMutationCount !== 0
    || result.outputDigest !== canonicalDigest(result.actual)) {
    throw new Error(`PRODUCTION_SCORING_COMPARATOR_RESULT_INVALID:${scenario.testId}`);
  }
}

const expectedByScenario = new Map([
  ['missing-input', { rejected: true }],
  ['invalid-input', { rejected: true }],
  ['governance-min', { governanceRisk: 20, riskTier: 'Minimal', gateDecision: 'Go' }],
  ['governance-max', { governanceRisk: 100, riskTier: 'Unacceptable', gateDecision: 'No-Go' }],
  ['needs-discovery', { primaryGatingOutcome: 'Needs Discovery' }],
  ['process-redesign', { primaryGatingOutcome: 'Process Redesign First' }],
  ['low-value', { primaryGatingOutcome: 'Monitor / Deprioritize' }],
  ['human-led', { primaryGatingOutcome: 'Human-Led / Do Not Automate' }],
  ['governance-review', { primaryGatingOutcome: 'Governance Review Required' }],
  ['no-go', { primaryGatingOutcome: 'No-Go' }],
  ['completion-below', { primaryGatingOutcome: 'Needs Discovery' }],
  ['completion-exact', { primaryGatingOutcome: 'Passed' }],
  ['completion-above', { primaryGatingOutcome: 'Passed' }],
]);

const runIndependentOracle = definition => {
  if (definition.scenario === 'missing-input' || definition.scenario === 'invalid-input') {
    try { validateOracleInputs(definition.input); return { rejected: false }; }
    catch (error) { return { rejected: error instanceof RangeError }; }
  }
  if (definition.scenario === 'governance-min' || definition.scenario === 'governance-max') {
    const actual = governanceOracle(definition.input);
    return { governanceRisk: actual.score, riskTier: actual.riskTier, gateDecision: actual.gateDecision };
  }
  return { primaryGatingOutcome: gateOracle(definition.input).primaryGatingOutcome };
};

const results = [];
for (const definition of evidence.scenarios) {
  const binding = bindings.oracleTests.find(item => item.testId === definition.testId);
  const provenance = provenanceByTestId.get(definition.testId);
  const testCase = catalogByTestId.get(definition.testId);
  const owner = provenance?.ownership?.find(item => item.kind === 'oracle-scenario' && item.ownerId === definition.scenario);
  try {
    if (!binding || binding.scenario !== definition.scenario || !provenance || !testCase || !owner
      || owner.assertionIds?.length !== 1 || owner.scenarioIds?.length !== 1
      || testCase.fixture !== evidence.scope.fixtureId
      || testCase.expectedMutation !== 'none'
      || testCase.expectedMutationCount !== 0) throw new Error('ORACLE_PROOF_OWNER_OR_CATALOG_INVALID');
    const oracleActual = runIndependentOracle(definition);
    const production = sutIndex.get(definition.testId);
    const expected = expectedByScenario.get(definition.scenario);
    const matched = Boolean(expected) && same(oracleActual, expected) && same(production.actual, oracleActual);
    const scopeMatches = same(provenance.scope, evidence.scope);
    const assertionOutcomes = [{ assertionId: owner.assertionIds[0], status: matched ? 'PASS' : 'FAIL' }];
    results.push({
      testId: definition.testId,
      scenario: definition.scenario,
      status: matched ? scopeMatches ? 'PASS' : 'BLOCKED' : 'FAIL',
      releaseSha,
      workflowRunId,
      workflowAttempt,
      environment,
      workflowPath,
      command,
      inputDigest: definition.inputDigest,
      oracleOutputDigest: canonicalDigest(oracleActual),
      productionOutputDigest: production.outputDigest,
      persistentMutationCount: 0,
      assertionIds: [...owner.assertionIds],
      assertionOutcomes,
      scenarioIds: [...owner.scenarioIds],
      branchIds: [...testCase.branchIds],
      sourceReferences: [...testCase.sourceReference],
      scope: { ...provenance.scope },
      actual: { oracle: oracleActual, production: production.actual, matched },
    });
  } catch (error) {
    const actual = error instanceof Error ? error.message : String(error);
    results.push({
      testId: definition.testId,
      scenario: definition.scenario,
      status: 'FAIL',
      releaseSha,
      workflowRunId,
      workflowAttempt,
      environment,
      workflowPath,
      command,
      inputDigest: definition.inputDigest,
      oracleOutputDigest: canonicalDigest(actual),
      productionOutputDigest: sutIndex.get(definition.testId)?.outputDigest ?? 'missing',
      persistentMutationCount: 0,
      assertionIds: owner?.assertionIds ?? ['missing-owner'],
      assertionOutcomes: [{ assertionId: owner?.assertionIds?.[0] ?? 'missing-owner', status: 'FAIL' }],
      scenarioIds: owner?.scenarioIds ?? [definition.scenario],
      branchIds: testCase?.branchIds ?? ['missing-branch'],
      sourceReferences: testCase?.sourceReference ?? ['missing-source'],
      scope: provenance?.scope ? { ...provenance.scope } : { ...evidence.scope },
      actual,
    });
  }
}

if (results.length !== 13 || new Set(results.map(item => item.testId)).size !== 13) throw new Error('ORACLE_RESULT_SET_INVALID');
const manifest = {
  schemaVersion: 3,
  releaseSha,
  workflowRunId,
  workflowAttempt,
  environment,
  workflowPath,
  command,
  evidenceIdentity: evidence.identity,
  generatedAt: new Date().toISOString(),
  results,
};
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
const temp = `${manifestPath}.tmp`;
fs.writeFileSync(temp, `${JSON.stringify(manifest, null, 2)}\n`);
fs.renameSync(temp, manifestPath);
const failures = results.filter(item => item.status === 'FAIL');
const blocked = results.filter(item => item.status === 'BLOCKED');
console.log(JSON.stringify({ oracleTests: results.length, passed: results.length - failures.length - blocked.length, blocked: blocked.map(item => item.testId), failed: failures.map(item => item.testId), manifest: manifestPath }));
if (failures.length) process.exitCode = 1;
