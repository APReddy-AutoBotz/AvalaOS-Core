import fs from 'node:fs';
import { calculateAssessmentScores, ScoringValidationError } from '../../../services/scoringEngine';

const bindings = JSON.parse(fs.readFileSync('tests/acceptance/execution-bindings.json', 'utf8'));
const fixtures = JSON.parse(fs.readFileSync('tests/acceptance/fixtures/process-discovery-transcripts.json', 'utf8')).fixtures;
const base = fixtures.find((item: any) => item.slug === 'clean-straight-through')?.oracleInputs;
if (!base) throw new Error('SUT_BASE_FIXTURE_MISSING');

const score = (flat: any) => calculateAssessmentScores({
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

const evaluate = (scenario: string) => {
  if (scenario === 'missing-input') {
    try { score({ ...base, completionQuality: undefined }); return { rejected: false }; }
    catch (error) { return { rejected: error instanceof ScoringValidationError }; }
  }
  if (scenario === 'invalid-input') {
    try { score({ ...base, standardization: 0 }); return { rejected: false }; }
    catch (error) { return { rejected: error instanceof ScoringValidationError }; }
  }
  if (scenario === 'governance-min') {
    const actual = score({ ...base, riskCriticality: 1, governanceSensitivity: 1, dataSensitivity: 1, errorReversibility: 5, goalAmbiguity: 1 });
    return { riskTier: actual.riskTier, gateDecision: actual.gateDecision };
  }
  if (scenario === 'governance-max') {
    const actual = score({ ...base, riskCriticality: 5, governanceSensitivity: 5, dataSensitivity: 5, errorReversibility: 1, goalAmbiguity: 5 });
    return { riskTier: actual.riskTier, gateDecision: actual.gateDecision };
  }
  const overrides: Record<string, any> = {
    'needs-discovery': { completionQuality: 49.9 },
    'completion-below': { completionQuality: 49.9 },
    'completion-exact': { completionQuality: 50 },
    'completion-above': { completionQuality: 50.1 },
    'process-redesign': { processMaturity: 1, standardization: 1 },
    'low-value': { volume: 10, manualEffort: 1, cycleTimePain: 2, reworkPain: 2 },
    'human-led': { goalAmbiguity: 5, riskCriticality: 5 },
    'governance-review': { dataSensitivity: 4 },
    'no-go': { riskCriticality: 5, errorReversibility: 2, governanceSensitivity: 4 },
  };
  if (!overrides[scenario]) throw new Error(`UNKNOWN_SUT_SCENARIO:${scenario}`);
  return { primaryGatingOutcome: score({ ...base, ...overrides[scenario] }).primaryGatingOutcome };
};

const results = (bindings.oracleTests ?? []).map((binding: any) => {
  try { return { testId: binding.testId, scenario: binding.scenario, status: 'PASS', actual: evaluate(binding.scenario) }; }
  catch (error) { return { testId: binding.testId, scenario: binding.scenario, status: 'FAIL', actual: error instanceof Error ? error.message : String(error) }; }
});
const manifestPath = process.env.SUT_RESULTS_MANIFEST || 'acceptance-results/sut-oracle-results.json';
fs.mkdirSync(manifestPath.split('/').slice(0, -1).join('/') || '.', { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify({ schemaVersion: 1, results }, null, 2)}\n`);
if (results.some((item: any) => item.status !== 'PASS')) process.exitCode = 1;
