import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ASSESS_V1_ORACLE_PATHS = Object.freeze({
  productionSource: 'services/scoringEngine.ts',
  independentOracle: 'tests/acceptance/oracles/assess-v1-oracle.mjs',
  comparatorSource: 'tests/acceptance/oracles/assess-v1-sut.test.ts',
  fixtureSource: 'tests/acceptance/fixtures/process-discovery-transcripts.json',
  scenarioSource: 'tests/acceptance/oracles/assess-v1-scenarios.json',
});

export const ASSESS_V1_EXPECTED_OUTPUTS = Object.freeze({
  'missing-input': Object.freeze({ rejected: true }),
  'invalid-input': Object.freeze({ rejected: true }),
  'governance-min': Object.freeze({ governanceRisk: 20, riskTier: 'Minimal', gateDecision: 'Go' }),
  'governance-max': Object.freeze({ governanceRisk: 100, riskTier: 'Unacceptable', gateDecision: 'No-Go' }),
  'needs-discovery': Object.freeze({ primaryGatingOutcome: 'Needs Discovery' }),
  'process-redesign': Object.freeze({ primaryGatingOutcome: 'Process Redesign First' }),
  'low-value': Object.freeze({ primaryGatingOutcome: 'Monitor / Deprioritize' }),
  'human-led': Object.freeze({ primaryGatingOutcome: 'Human-Led / Do Not Automate' }),
  'governance-review': Object.freeze({ primaryGatingOutcome: 'Governance Review Required' }),
  'no-go': Object.freeze({ primaryGatingOutcome: 'No-Go' }),
  'completion-below': Object.freeze({ primaryGatingOutcome: 'Needs Discovery' }),
  'completion-exact': Object.freeze({ primaryGatingOutcome: 'Passed' }),
  'completion-above': Object.freeze({ primaryGatingOutcome: 'Passed' }),
});

const normalize = value => Array.isArray(value)
  ? value.map(normalize)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]))
    : value;

export const canonicalJson = value => JSON.stringify(normalize(value));
export const canonicalDigest = value => `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
export const canonicalFileDigest = file => `sha256:${createHash('sha256').update(fs.readFileSync(file, 'utf8').replace(/\r\n/gu, '\n'), 'utf8').digest('hex')}`;

export const applyAssessV1Scenario = (base, definition) => {
  const input = { ...base, ...(definition.overrides ?? {}) };
  for (const key of definition.omit ?? []) delete input[key];
  return input;
};

export const loadAssessV1OracleEvidence = ({ root = process.cwd(), bindings } = {}) => {
  const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  const fixtureDocument = readJson(ASSESS_V1_ORACLE_PATHS.fixtureSource);
  const scenarioDocument = readJson(ASSESS_V1_ORACLE_PATHS.scenarioSource);
  if (scenarioDocument?.schemaVersion !== 1 || !Array.isArray(scenarioDocument?.scenarios) || scenarioDocument.scenarios.length !== 13) {
    throw new Error('ASSESS_V1_ORACLE_SCENARIO_CONTRACT_INVALID');
  }
  const fixture = fixtureDocument.fixtures?.find(item => item.fixtureId === scenarioDocument.fixtureId && item.slug === scenarioDocument.fixtureSlug);
  if (!fixture?.oracleInputs) throw new Error('ASSESS_V1_ORACLE_FIXTURE_INVALID');
  const bindingByTestId = new Map((bindings?.oracleTests ?? []).map(item => [item.testId, item]));
  const seenTests = new Set();
  const seenScenarios = new Set();
  const scenarios = scenarioDocument.scenarios.map(definition => {
    if (!/^ASSESS-0(?:0[5-9]|1[0-7])$/u.test(definition?.testId ?? '')
      || seenTests.has(definition.testId)
      || typeof definition?.scenario !== 'string'
      || seenScenarios.has(definition.scenario)
      || !Array.isArray(definition.omit)
      || definition.omit.some(key => typeof key !== 'string')
      || !definition.overrides
      || typeof definition.overrides !== 'object'
      || Array.isArray(definition.overrides)) throw new Error('ASSESS_V1_ORACLE_SCENARIO_CONTRACT_INVALID');
    const binding = bindingByTestId.get(definition.testId);
    if (!binding || binding.scenario !== definition.scenario) throw new Error('ASSESS_V1_ORACLE_BINDING_MISMATCH');
    seenTests.add(definition.testId);
    seenScenarios.add(definition.scenario);
    const input = applyAssessV1Scenario(fixture.oracleInputs, definition);
    return { ...definition, input, inputDigest: canonicalDigest(input) };
  });
  if (bindingByTestId.size !== 13 || seenTests.size !== bindingByTestId.size) throw new Error('ASSESS_V1_ORACLE_BINDING_SET_MISMATCH');
  const identity = {
    sourceDigests: {
      production: canonicalFileDigest(path.join(root, ASSESS_V1_ORACLE_PATHS.productionSource)),
      independentOracle: canonicalFileDigest(path.join(root, ASSESS_V1_ORACLE_PATHS.independentOracle)),
      comparator: canonicalFileDigest(path.join(root, ASSESS_V1_ORACLE_PATHS.comparatorSource)),
    },
    fixture: {
      fixtureId: fixture.fixtureId,
      slug: fixture.slug,
      digest: canonicalDigest(fixture),
    },
    scenarioContractDigest: canonicalDigest(scenarioDocument),
  };
  return {
    fixture,
    scenarios,
    scenarioByTestId: new Map(scenarios.map(item => [item.testId, item])),
    identity,
    scope: { evidenceScope: 'executed-deterministic-oracle', fixtureId: fixture.fixtureId, persistentMutationCount: 0 },
  };
};
