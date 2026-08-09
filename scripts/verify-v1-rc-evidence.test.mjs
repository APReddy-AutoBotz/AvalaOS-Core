import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const run = (env = {}) => spawnSync(process.execPath, ['scripts/verify-v1-rc-evidence.mjs'], {
  encoding: 'utf8',
  env: { ...process.env, V1_RC_WORKFLOW_EVIDENCE_JSON: '', ...env },
});

let result = run();
assert.equal(result.status, 0, result.stderr);
let manifest = JSON.parse(readFileSync('artifacts/v1-rc/evidence-manifest.json', 'utf8'));
assert.equal(manifest.aggregateProofState, 'incomplete_exact_sha_evidence');
assert.ok(manifest.composedChecks.every(check => check.state === 'missing' && check.result === 'not_run'));
assert.equal(manifest.composedChecks.find(check => check.id === 'trust-assurance').state, 'missing');

result = run({ V1_RC_EXPECTED_HEAD: 'f'.repeat(40) });
assert.notEqual(result.status, 0);
assert.match(result.stderr, /does not match expected candidate head/);

const plan = JSON.parse(readFileSync('release/v1-rc-evidence-plan.json', 'utf8'));
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

exactRuns[0].headSha = 'e'.repeat(40);
result = run({ V1_RC_WORKFLOW_EVIDENCE_JSON: JSON.stringify(exactRuns) });
assert.notEqual(result.status, 0);
assert.match(result.stderr, /does not match candidate/);

run(); // Leave the local artifact fail-closed rather than populated by test-only synthetic run metadata.
console.log('V1 RC evidence provenance tests passed');
