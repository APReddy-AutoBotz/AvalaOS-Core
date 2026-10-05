import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { calculateAssessmentScores, ScoringValidationError } from '../../../services/scoringEngine';

const paths = {
  production: 'services/scoringEngine.ts',
  independentOracle: 'tests/acceptance/oracles/assess-v1-oracle.mjs',
  comparator: 'tests/acceptance/oracles/assess-v1-sut.test.ts',
  fixtures: 'tests/acceptance/fixtures/process-discovery-transcripts.json',
  scenarios: 'tests/acceptance/oracles/assess-v1-scenarios.json',
};
const normalize = (value:any):any => Array.isArray(value)
  ? value.map(normalize)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]))
    : value;
const digest = (value:any) => `sha256:${createHash('sha256').update(JSON.stringify(normalize(value)), 'utf8').digest('hex')}`;
const fileDigest = (file:string) => `sha256:${createHash('sha256').update(fs.readFileSync(file, 'utf8').replace(/\r\n/gu, '\n'), 'utf8').digest('hex')}`;
const applyScenario = (base:any, definition:any) => {
  const input = { ...base, ...(definition.overrides ?? {}) };
  for (const key of definition.omit ?? []) delete input[key];
  return input;
};

const releaseSha = process.env.RELEASE_SHA ?? '';
const workflowRunId = String(process.env.GITHUB_RUN_ID ?? '');
const workflowAttempt = String(process.env.GITHUB_RUN_ATTEMPT ?? '');
const workflowPath = process.env.ACCEPTANCE_WORKFLOW_PATH ?? '';
const command = 'node scripts/runAssessV1AcceptanceOracle.mjs';
if (!/^[0-9a-f]{40}$/u.test(releaseSha) || !workflowRunId || !workflowAttempt || workflowPath !== '.github/workflows/exhaustive-acceptance.yml') {
  throw new Error('SUT_EXECUTION_IDENTITY_INVALID');
}

const bindings = JSON.parse(fs.readFileSync('tests/acceptance/execution-bindings.json', 'utf8'));
const fixtureDocument = JSON.parse(fs.readFileSync(paths.fixtures, 'utf8'));
const scenarioDocument = JSON.parse(fs.readFileSync(paths.scenarios, 'utf8'));
const fixture = fixtureDocument.fixtures.find((item:any) => item.fixtureId === scenarioDocument.fixtureId && item.slug === scenarioDocument.fixtureSlug);
if (!fixture?.oracleInputs || scenarioDocument?.schemaVersion !== 1 || scenarioDocument.scenarios?.length !== 13) throw new Error('SUT_INPUT_CONTRACT_INVALID');
const bindingByTestId = new Map((bindings.oracleTests ?? []).map((item:any) => [item.testId, item]));
const seen = new Set<string>();

const score = (flat:any) => calculateAssessmentScores({
  processStructure: {
    standardization: flat.standardization,
    ruleDeterminism: flat.ruleDeterminism,
    exceptionPredictability: flat.exceptionPredictability,
    processMaturity: flat.processMaturity,
  },
  dataProfile: {
    inputStructure: flat.inputStructure,
    unstructuredLoad: flat.unstructuredLoad,
    dataSensitivity: flat.dataSensitivity,
  },
  systems: {
    systemReadiness: flat.systemReadiness,
    orchestrationComplexity: flat.orchestrationComplexity,
  },
  judgment: {
    judgmentIntensity: flat.judgmentIntensity,
    goalAmbiguity: flat.goalAmbiguity,
  },
  risk: {
    riskCriticality: flat.riskCriticality,
    governanceSensitivity: flat.governanceSensitivity,
    errorReversibility: flat.errorReversibility,
  },
  workPattern: {
    volume: flat.volume,
    manualEffort: flat.manualEffort,
    reworkPain: flat.reworkPain,
    cycleTimePain: flat.cycleTimePain,
  },
} as any, {
  completionQuality: flat.completionQuality,
  templateFit: false,
  stakeholderCoverage: flat.stakeholderCoverage,
  evidenceQuality: flat.evidenceQuality,
  assumptionQuality: flat.assumptionQuality,
});

const evaluate = (scenario:string, input:any) => {
  if (scenario === 'missing-input' || scenario === 'invalid-input') {
    try { score(input); return { rejected: false }; }
    catch (error) { return { rejected: error instanceof ScoringValidationError }; }
  }
  const actual = score(input);
  if (scenario === 'governance-min' || scenario === 'governance-max') {
    return { governanceRisk: actual.supportingScores.governanceRisk, riskTier: actual.riskTier, gateDecision: actual.gateDecision };
  }
  return { primaryGatingOutcome: actual.primaryGatingOutcome };
};

const results = scenarioDocument.scenarios.map((definition:any) => {
  const binding:any = bindingByTestId.get(definition.testId);
  if (!binding || binding.scenario !== definition.scenario || seen.has(definition.testId)) throw new Error('SUT_SCENARIO_SET_INVALID');
  seen.add(definition.testId);
  const input = applyScenario(fixture.oracleInputs, definition);
  try {
    const actual = evaluate(definition.scenario, input);
    return {
      testId: definition.testId,
      scenario: definition.scenario,
      status: 'PASS',
      inputDigest: digest(input),
      outputDigest: digest(actual),
      persistentMutationCount: 0,
      actual,
    };
  } catch (error) {
    const actual = error instanceof Error ? error.message : String(error);
    return { testId: definition.testId, scenario: definition.scenario, status: 'FAIL', inputDigest: digest(input), outputDigest: digest(actual), persistentMutationCount: 0, actual };
  }
});
if (seen.size !== 13 || bindingByTestId.size !== 13) throw new Error('SUT_SCENARIO_SET_INVALID');

const evidenceIdentity = {
  sourceDigests: {
    production: fileDigest(paths.production),
    independentOracle: fileDigest(paths.independentOracle),
    comparator: fileDigest(paths.comparator),
  },
  fixture: { fixtureId: fixture.fixtureId, slug: fixture.slug, digest: digest(fixture) },
  scenarioContractDigest: digest(scenarioDocument),
};
const manifestPath = process.env.SUT_RESULTS_MANIFEST || 'acceptance-results/sut-oracle-results.json';
fs.mkdirSync(manifestPath.split(/[\\/]/u).slice(0, -1).join('/') || '.', { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify({
  schemaVersion: 2,
  releaseSha,
  workflowRunId,
  workflowAttempt,
  workflowPath,
  command,
  evidenceIdentity,
  results,
}, null, 2)}\n`);
if (results.some((item:any) => item.status !== 'PASS')) process.exitCode = 1;
