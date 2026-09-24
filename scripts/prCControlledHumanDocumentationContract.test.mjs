import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseWorkflowYaml } from './checkWorkflowYaml.mjs';
import { CONTROLLED_HUMAN_PHASE_SECRETS } from './prCControlledHumanWorkflowSecrets.mjs';
import { PREFLIGHT_FAILURE_PHASES } from './prCControlledHumanCredentialPreflight.mjs';
import {
  CONTROL_SCRIPT_SCENARIOS,
  CONTROL_SCRIPT_SCENARIOS_BY_REPORT,
  CONTROL_SCRIPT_SCENARIO_PRODUCERS,
  CONTROL_SCRIPT_SOURCES,
  CONTROL_SCRIPT_TEST_TIMEOUT_MS,
  CONTROL_SCRIPT_TESTS,
} from './runPrCControlledHumanScriptCoverage.mjs';

const PRIMARY = '.github/workflows/transcript-flow-pr-c.yml';
const RECOVERY = '.github/workflows/pr264-controlled-human-recover.yml';
const DOCUMENTS = {
  evidence: 'docs/quality/governed-delivery-monitor-pr-c-evidence.md',
  matrix: 'docs/quality/verification-command-matrix.md',
  plan: 'docs/planning/governed-multisource-transcript-module-handoff-plan.md',
  walkthrough: 'docs/quality/governed-delivery-monitor-pr-c-controlled-human-walkthrough.md',
  coverage: 'testing/process-lifecycle/contracts/pr-c-control-script-coverage.md',
  architecture: 'docs/architecture/current-to-target-enterprise-architecture.md',
  risk: 'docs/quality/gpt-5.6-sol-enterprise-risk-and-evidence-register.md',
  ledger: 'docs/task-ledger.md',
};
const CA = 'node scripts/prCControlledHumanPostgresTls.mjs verify-ca';
const countCa = workflow => Object.values(workflow.jobs).flatMap(job => job.steps ?? []).filter(step => step.run === CA).length;
const paragraph = (document, prefix) => {
  const matches = document.split(/\r?\n/u).filter(line => line.startsWith(prefix));
  assert.equal(matches.length, 1, `one active paragraph: ${prefix}`);
  return matches[0];
};
const words = new Map([[1, 'one'], [14, 'fourteen']]);

async function snapshot() {
  const documents = Object.fromEntries(await Promise.all(Object.entries(DOCUMENTS).map(async ([key, file]) => [key, await readFile(file, 'utf8')])));
  return {
    documents,
    primary: parseWorkflowYaml(await readFile(PRIMARY, 'utf8'), PRIMARY),
    recovery: parseWorkflowYaml(await readFile(RECOVERY, 'utf8'), RECOVERY),
    registry: JSON.parse(await readFile('testing/process-lifecycle/contracts/pr-c-assertion-registry.json', 'utf8')),
    diagnosticTopology: {
      phases: Object.values(PREFLIGHT_FAILURE_PHASES),
      scenarioCount: CONTROL_SCRIPT_SCENARIOS.length,
      entryScenarioCount: CONTROL_SCRIPT_SCENARIOS_BY_REPORT['credential-preflight-entry-scenarios.json'].length,
      reportCount: Object.keys(CONTROL_SCRIPT_SCENARIO_PRODUCERS).length,
      sourceCount: CONTROL_SCRIPT_SOURCES.length,
      testCount: CONTROL_SCRIPT_TESTS.length,
      timeoutMs: CONTROL_SCRIPT_TEST_TIMEOUT_MS,
    },
  };
}

function validate({ documents, primary, recovery, registry, diagnosticTopology }) {
  const definitions = paragraph(documents.evidence, 'No current complete candidate result is claimed');
  assert.match(definitions, new RegExp(`defines ${registry.commands.length} exact commands, ${registry.assertions.length} assertion records, and ten explicit`, 'u'));
  assert.equal(registry.notRun.length, 10);
  const ordinal = registry.commands.findIndex(command => command.id === 'scoring-drift') + 1;
  assert.equal(ordinal, registry.commands.length, 'scoring law remains the final canonical command');
  assert.equal(registry.commands[ordinal - 1].command, 'node scripts/checkPrCScoringLawDrift.mjs');
  for (const [key, prefix, phrase] of [
    ['walkthrough', 'The expanded control-script gate', `exact command ${ordinal}`],
    ['walkthrough', 'SANDBOX-009 ownership', `full ${registry.commands.length}-command canonical matrix`],
    ['plan', 'PR C execution boundary:', `Canonical command ${ordinal}`],
    ['matrix', '| `node scripts/checkPrCScoringLawDrift.mjs`', `standalone command ${ordinal}`],
    ['matrix', '| `node scripts/checkPrCScoringLawDrift.mjs`', `synthesize command ${ordinal}.`],
    ['coverage', '- Command ', `Command ${ordinal} is`],
    ['architecture', 'Scoring authority remains', `Canonical command ${ordinal}`],
    ['risk', '| A green canonical matrix omits', `command ${ordinal} binds`],
    ['ledger', '| Governed Delivery and Monitor PR C', `refreshed ${registry.commands.length}-command platform matrix`],
  ]) assert.ok(paragraph(documents[key], prefix).includes(phrase), `active registry binding: ${key}: ${phrase}`);
  const phases = paragraph(documents.evidence, '- six ordered normal trusted PR phase labels');
  assert.match(phases, /protected direct jobs in the primary workflow/u);
  assert.match(phases, /credential preflight, Edge, preparation, quiesce, checkpoints, and final verification/u);
  assert.match(phases, /five protected prior-run bindings/u);
  for (const phase of ['credentials-preflight', 'edge', 'prepare', 'quiesce', 'checkpoints', 'final']) {
    assert.match(primary.jobs.controlled_human_authority.steps[0].with.script, new RegExp(`pr264-controlled-human-${phase}`, 'u'));
  }
  assert.equal(primary.jobs.controlled_human_credentials_preflight.environment, 'hosted-nonproduction-pilot');
  assert.equal(recovery.on.workflow_call, undefined);
  assert.ok(recovery.on.workflow_dispatch);
  const primaryCa = words.get(countCa(primary)), recoveryCa = words.get(countCa(recovery));
  assert.ok(primaryCa && recoveryCa, 'a changed CA topology requires an explicit contract/document update');
  assert.match(paragraph(documents.evidence, '- the public Supabase Root 2021 CA'), new RegExp(`All ${primaryCa} direct PostgreSQL steps in the primary workflow and the ${recoveryCa} separate manual-recovery step`, 'u'));
  assert.match(paragraph(documents.plan, 'Every controlled-human PostgreSQL connection'), new RegExp(`Each of the ${primaryCa} direct PostgreSQL steps in the primary workflow and the ${recoveryCa} separate manual-recovery step`, 'u'));
  assert.match(paragraph(documents.plan, 'Six normal label phases'), /protected direct jobs/u);
  assert.match(paragraph(documents.evidence, 'After all corrective source and stable documentation edits settle'), /AP-approved direct credential-preflight job/u);
  const secretBoundary = paragraph(documents.walkthrough, 'The protected ');
  assert.match(secretBoundary, /Only the access token is exclusive to the Edge deployment job/u);
  assert.match(secretBoundary, /project reference also supports exact tuple checks in credential preflight, preparation, quiesce, final verification, and both recovery entrypoints/u);
  assert.deepEqual(Object.entries(CONTROLLED_HUMAN_PHASE_SECRETS).filter(([, names]) => names.includes('PR_C_CONTROLLED_HUMAN_SUPABASE_ACCESS_TOKEN')).map(([phase]) => phase), ['edge']);
  assert.equal(CONTROLLED_HUMAN_PHASE_SECRETS.preflight.length, 7);
  assert.doesNotMatch(documents.matrix, /All (?:44|29) focused|five ordered phase workflows|five ordered phase labels/u);
  assert.match(documents.matrix, /six ordered normal phase labels/u);
  assert.match(documents.matrix, /primary workflow's direct protected jobs and the separate protected manual-recovery workflow/u);
  const semanticPhases = [
    'NONPAT_REQUIRED_FIELDS', 'NONPAT_FORBIDDEN_CREDENTIAL', 'NONPAT_SIGNING_AUTHORITY',
    'NONPAT_TARGET_TUPLE', 'NONPAT_PASSWORD_JSON', 'NONPAT_PASSWORD_PERSONA_SET', 'NONPAT_PASSWORD_VALUES',
  ];
  assert.equal(diagnosticTopology.phases.length, 27);
  assert.equal(new Set(diagnosticTopology.phases).size, 27);
  assert.deepEqual(diagnosticTopology.phases.filter(value => value.startsWith('NONPAT_')), semanticPhases);
  assert.equal(diagnosticTopology.scenarioCount, 46);
  assert.equal(diagnosticTopology.entryScenarioCount, 32);
  assert.equal(diagnosticTopology.reportCount, 8);
  assert.equal(diagnosticTopology.sourceCount, 17);
  assert.equal(diagnosticTopology.testCount, 19);
  assert.equal(diagnosticTopology.timeoutMs, 900_000);
  const diagnosticContract = paragraph(documents.walkthrough, 'The diagnostic continuation replaces');
  for (const token of semanticPhases) assert.ok(diagnosticContract.includes(`\`${token}\``));
  assert.match(diagnosticContract, /exact 27-token phase allowlist/u);
  assert.match(diagnosticContract, /requires 46 scenarios, including 32 entry scenarios/u);
  assert.match(paragraph(documents.plan, 'Non-PAT diagnostics must separately'), /46-scenario control inventory, including 32 entry scenarios/u);
  assert.match(documents.matrix, /46 actual scenarios, including 32 entry scenarios, across eight reports, seventeen sources and nineteen tests/u);
  const coverageBoundary = paragraph(documents.coverage, 'This feature-owned gate measures');
  assert.match(coverageBoundary, /exactly seventeen governed production JavaScript control sources/u);
  assert.match(coverageBoundary, /exactly nineteen test files/u);
  assert.match(paragraph(documents.coverage, '- The inventory contains'), /exactly the seventeen source paths/u);
  assert.match(paragraph(documents.coverage, '- The independently pinned inventory'), /exactly 46 owned scenarios across eight reports, including 32 production-entrypoint scenarios/u);
  const coverageTimeout = paragraph(documents.coverage, 'The whole nineteen-file measured child');
  assert.match(coverageTimeout, /independently pinned 900,000 ms harness-containment timeout/u);
  assert.match(coverageTimeout, /does not alter a product, provider, database, browser, or deployment performance threshold/u);
  const coverageRollback = paragraph(documents.coverage, 'If this corrective gate must be rolled back');
  assert.match(coverageRollback, /forward-fix the seventeen-source contract or its 900,000 ms whole-child containment/u);
  assert.match(coverageRollback, /180,000 ms whole-child timeout are known insufficient/u);
}

test('active controlled-human documentation binds actual registry, direct-job, secret and CA topology', async () => {
  validate(await snapshot());
});

test('active documentation rejects stale counts, reusable topology and false Edge-only project authority', async () => {
  const source = await snapshot();
  for (const [key, before, after] of [
    ['evidence', `defines ${source.registry.commands.length} exact commands`, 'defines 74 exact commands'],
    ['evidence', `${source.registry.assertions.length} assertion records`, '218 assertion records'],
    ['walkthrough', `exact command ${source.registry.commands.length}`, 'exact command 80'],
    ['walkthrough', `full ${source.registry.commands.length}-command canonical matrix`, 'full 80-command canonical matrix'],
    ['plan', `Canonical command ${source.registry.commands.length}`, 'Canonical command 80'],
    ['matrix', `standalone command ${source.registry.commands.length}`, 'standalone command 80'],
    ['matrix', `synthesize command ${source.registry.commands.length}.`, 'synthesize command 80.'],
    ['coverage', `Command ${source.registry.commands.length} is`, 'Command 80 is'],
    ['architecture', `Canonical command ${source.registry.commands.length}`, 'Canonical command 80'],
    ['risk', `command ${source.registry.commands.length} binds`, 'command 80 binds'],
    ['ledger', `refreshed ${source.registry.commands.length}-command platform matrix`, 'refreshed 74-command platform matrix'],
    ['evidence', 'protected direct jobs in the primary workflow', 'protected reusable phase workflows'],
    ['evidence', 'five protected prior-run bindings', 'four protected prior-run bindings'],
    ['evidence', 'All fourteen direct PostgreSQL steps', 'All eleven direct PostgreSQL steps'],
    ['plan', 'Each of the fourteen direct PostgreSQL steps', 'Each of the eleven direct PostgreSQL steps'],
    ['walkthrough', 'Only the access token is exclusive to the Edge deployment job', 'Project reference and access token are Edge-only'],
    ['matrix', 'six ordered normal phase labels', 'five ordered phase labels'],
    ['walkthrough', 'exact 27-token phase allowlist', 'exact 21-token phase allowlist'],
    ['walkthrough', 'requires 46 scenarios, including 32 entry scenarios', 'requires 35 scenarios, including 21 entry scenarios'],
    ['plan', '46-scenario control inventory, including 32 entry scenarios', '35-scenario control inventory, including 21 entry scenarios'],
    ['matrix', 'across eight reports, seventeen sources and nineteen tests', 'across eight reports, sixteen sources and eighteen tests'],
    ['coverage', 'exactly seventeen governed production JavaScript control sources', 'exactly sixteen governed production JavaScript control sources'],
    ['coverage', 'exactly nineteen test files', 'exactly eighteen test files'],
    ['coverage', 'exactly 46 owned scenarios across eight reports, including 32 production-entrypoint scenarios', 'exactly 41 owned scenarios across eight reports, including 27 production-entrypoint scenarios'],
    ['coverage', 'independently pinned 900,000 ms harness-containment timeout', 'independently pinned 180,000 ms harness-containment timeout'],
    ['coverage', 'forward-fix the seventeen-source contract or its 900,000 ms whole-child containment', 'forward-fix the sixteen-source contract or its 900,000 ms whole-child containment'],
  ]) {
    const changed = structuredClone(source);
    assert.ok(changed.documents[key].includes(before), `${key}: ${before}`);
    changed.documents[key] = changed.documents[key].replace(before, after);
    assert.throws(() => validate(changed), assert.AssertionError, `${key}: ${before}`);
  }
});

test('documentation contract detects executable registry or CA topology drift independently', async () => {
  const source = await snapshot();
  for (const mutate of [
    value => { value.registry.commands.pop(); },
    value => { value.registry.assertions.pop(); },
    value => { value.registry.notRun.pop(); },
    value => { value.primary.jobs.controlled_human_credentials_preflight.steps = value.primary.jobs.controlled_human_credentials_preflight.steps.filter(step => step.run !== CA); },
    value => { value.recovery.on.workflow_call = {}; },
    value => { value.diagnosticTopology.phases.pop(); },
    value => { value.diagnosticTopology.phases[0] = value.diagnosticTopology.phases[1]; },
    value => { value.diagnosticTopology.phases[value.diagnosticTopology.phases.indexOf('NONPAT_PASSWORD_JSON')] = 'NONPAT_INPUTS'; },
    value => { value.diagnosticTopology.scenarioCount -= 1; },
    value => { value.diagnosticTopology.entryScenarioCount -= 1; },
    value => { value.diagnosticTopology.reportCount -= 1; },
    value => { value.diagnosticTopology.sourceCount -= 1; },
    value => { value.diagnosticTopology.testCount -= 1; },
    value => { value.diagnosticTopology.timeoutMs = 180_000; },
  ]) {
    const changed = structuredClone(source);
    mutate(changed);
    assert.throws(() => validate(changed), assert.AssertionError);
  }
});
