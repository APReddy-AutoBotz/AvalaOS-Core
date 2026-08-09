import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const run = (env = {}, args = []) => spawnSync(process.execPath, ['scripts/verify-v1-rc-evidence.mjs', ...args], {
  encoding: 'utf8',
  env: { ...process.env, V1_RC_WORKFLOW_EVIDENCE_JSON: '', ...env },
});

let result = run();
assert.equal(result.status, 0, result.stderr);
let manifest = JSON.parse(readFileSync('artifacts/v1-rc/evidence-manifest.json', 'utf8'));
assert.equal(manifest.aggregateProofState, 'incomplete_exact_sha_evidence');
assert.ok(manifest.composedChecks.every(check => check.state === 'missing' && check.result === 'not_run'));
assert.equal(manifest.composedChecks.find(check => check.id === 'trust-assurance').state, 'missing');

result = run({}, ['--authoritative']);
assert.notEqual(result.status, 0);
assert.match(result.stderr, /requires every composed workflow/);
manifest = JSON.parse(readFileSync('artifacts/v1-rc/evidence-manifest.json', 'utf8'));
assert.equal(manifest.aggregateProofState, 'incomplete_exact_sha_evidence');

result = run({ V1_RC_EXPECTED_HEAD: 'f'.repeat(40) });
assert.notEqual(result.status, 0);
assert.match(result.stderr, /does not match expected candidate head/);

const plan = JSON.parse(readFileSync('release/v1-rc-evidence-plan.json', 'utf8'));
for (const check of plan.authoritativeChecks) {
  const workflow = readFileSync(check.workflow, 'utf8');
  const checkoutCount = (workflow.match(/uses: actions\/checkout@/g) ?? []).length;
  const exactRefCount = (workflow.match(/ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/g) ?? []).length;
  assert.ok(checkoutCount > 0, `${check.workflow} must check out source`);
  assert.equal(exactRefCount, checkoutCount, `${check.workflow} must pin every checkout to the candidate SHA`);
}
const exactRuns = plan.authoritativeChecks.map((check, index) => ({
  id: check.id,
  workflowName: check.workflowName,
  workflowId: 1000 + index,
  runId: 2000 + index,
  headSha: head,
  conclusion: 'success',
  provenance: 'github_actions_api',
}));
result = run({ V1_RC_WORKFLOW_EVIDENCE_JSON: JSON.stringify(exactRuns), V1_RC_EXPECTED_HEAD: head });
assert.equal(result.status, 0, result.stderr);
manifest = JSON.parse(readFileSync('artifacts/v1-rc/evidence-manifest.json', 'utf8'));
assert.equal(manifest.aggregateProofState, 'proven_exact_sha_ci');
assert.ok(manifest.composedChecks.every(check => check.headSha === head && check.runId && check.workflowId && check.result === 'success'));

result = run({ V1_RC_WORKFLOW_EVIDENCE_JSON: JSON.stringify(exactRuns), V1_RC_EXPECTED_HEAD: head }, ['--authoritative']);
assert.equal(result.status, 0, result.stderr);

const failedRuns = exactRuns.map(run => ({ ...run }));
failedRuns[2].conclusion = 'failure';
result = run({ V1_RC_WORKFLOW_EVIDENCE_JSON: JSON.stringify(failedRuns), V1_RC_EXPECTED_HEAD: head });
assert.equal(result.status, 0, result.stderr);
manifest = JSON.parse(readFileSync('artifacts/v1-rc/evidence-manifest.json', 'utf8'));
assert.equal(manifest.aggregateProofState, 'incomplete_exact_sha_evidence');
assert.equal(manifest.composedChecks[2].state, 'not_proven');
assert.equal(manifest.composedChecks[2].result, 'failure');

result = run({ V1_RC_WORKFLOW_EVIDENCE_JSON: JSON.stringify(failedRuns), V1_RC_EXPECTED_HEAD: head }, ['--authoritative']);
assert.notEqual(result.status, 0);
assert.match(result.stderr, /requires every composed workflow/);

const missingRuns = exactRuns.slice(0, -1);
result = run({ V1_RC_WORKFLOW_EVIDENCE_JSON: JSON.stringify(missingRuns), V1_RC_EXPECTED_HEAD: head }, ['--authoritative']);
assert.notEqual(result.status, 0);
manifest = JSON.parse(readFileSync('artifacts/v1-rc/evidence-manifest.json', 'utf8'));
assert.equal(manifest.aggregateProofState, 'incomplete_exact_sha_evidence');
assert.equal(manifest.composedChecks.at(-1).state, 'missing');

exactRuns[0].headSha = 'e'.repeat(40);
result = run({ V1_RC_WORKFLOW_EVIDENCE_JSON: JSON.stringify(exactRuns) }, ['--authoritative']);
assert.notEqual(result.status, 0);
assert.match(result.stderr, /does not match candidate/);

run(); // Leave the local artifact fail-closed rather than populated by test-only synthetic run metadata.
console.log('V1 RC evidence provenance tests passed');
