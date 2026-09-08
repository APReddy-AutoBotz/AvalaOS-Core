import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseWorkflowYaml } from './checkWorkflowYaml.mjs';
import { CONTROLLED_HUMAN_PHASE_SECRETS } from './prCControlledHumanWorkflowSecrets.mjs';

const PRIMARY = '.github/workflows/transcript-flow-pr-c.yml';
const RECOVERY = '.github/workflows/pr264-controlled-human-recover.yml';
const DOCUMENTS = {
  evidence: 'docs/quality/governed-delivery-monitor-pr-c-evidence.md',
  matrix: 'docs/quality/verification-command-matrix.md',
  plan: 'docs/planning/governed-multisource-transcript-module-handoff-plan.md',
  walkthrough: 'docs/quality/governed-delivery-monitor-pr-c-controlled-human-walkthrough.md',
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
  };
}

function validate({ documents, primary, recovery, registry }) {
  const definitions = paragraph(documents.evidence, 'No current candidate result is claimed');
  assert.match(definitions, new RegExp(`defines ${registry.commands.length} exact commands, ${registry.assertions.length} assertion records, and nine explicit`, 'u'));
  assert.equal(registry.notRun.length, 9);
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
}

test('active controlled-human documentation binds actual registry, direct-job, secret and CA topology', async () => {
  validate(await snapshot());
});

test('active documentation rejects stale counts, reusable topology and false Edge-only project authority', async () => {
  const source = await snapshot();
  for (const [key, before, after] of [
    ['evidence', 'defines 80 exact commands', 'defines 74 exact commands'],
    ['evidence', 'protected direct jobs in the primary workflow', 'protected reusable phase workflows'],
    ['evidence', 'five protected prior-run bindings', 'four protected prior-run bindings'],
    ['evidence', 'All fourteen direct PostgreSQL steps', 'All eleven direct PostgreSQL steps'],
    ['plan', 'Each of the fourteen direct PostgreSQL steps', 'Each of the eleven direct PostgreSQL steps'],
    ['walkthrough', 'Only the access token is exclusive to the Edge deployment job', 'Project reference and access token are Edge-only'],
    ['matrix', 'six ordered normal phase labels', 'five ordered phase labels'],
  ]) {
    const changed = structuredClone(source);
    assert.ok(changed.documents[key].includes(before));
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
  ]) {
    const changed = structuredClone(source);
    mutate(changed);
    assert.throws(() => validate(changed), assert.AssertionError);
  }
});
