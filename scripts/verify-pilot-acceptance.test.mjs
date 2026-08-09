import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import spec from '../config/pilot-acceptance-spec.json' with { type: 'json' };

const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const currentRunId = '31312215114';
const run = (args, results, overrides = {}) => spawnSync(
  process.execPath,
  ['scripts/verify-pilot-acceptance.mjs', ...args],
  {
    encoding: 'utf8',
    env: {
      ...process.env,
      PILOT_ACCEPTANCE_HEAD: head,
      GITHUB_RUN_ID: currentRunId,
      GITHUB_ACTIONS: 'true',
      GITHUB_WORKFLOW: 'Pilot Acceptance',
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_REF: 'refs/pull/226/merge',
      GITHUB_HEAD_REF: 'codex/v1-pilot-acceptance-exercise',
      GITHUB_BASE_REF: 'main',
      PILOT_ACCEPTANCE_GATE_RESULTS: JSON.stringify(results),
      ...overrides,
    },
  },
);
const manifest = () => JSON.parse(fs.readFileSync('artifacts/pilot-acceptance/manifest.json'));
const evidence = () => Object.fromEntries(spec.requiredGates.map(id => [id, {
  result: 'passed',
  command: `synthetic:${id}`,
  runId: currentRunId,
}]));

const pending = run([], {});
assert.equal(pending.status, 0);
assert.equal(manifest().result, 'pending');

const missing = run(['--authoritative'], {});
assert.equal(missing.status, 1);
assert.equal(manifest().result, 'failed');

const passed = run(['--authoritative'], evidence());
assert.equal(passed.status, 0, passed.stderr);
assert.equal(manifest().result, 'passed');
assert.equal(manifest().candidate.head, head);
assert.equal(manifest().candidate.checkedOutHead, head);
assert.ok(manifest().gates.every(gate => gate.runId === currentRunId));
assert.equal(manifest().hostedLive.classification, 'not_proven_hosted_live');

for (const unrelatedContext of [
  { GITHUB_ACTIONS: 'false' },
  { GITHUB_WORKFLOW: 'Unrelated Local Workflow' },
  { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main' },
  { GITHUB_REF: 'refs/heads/unrelated' },
  { GITHUB_BASE_REF: 'release' },
]) {
  const result = run(['--authoritative'], evidence(), unrelatedContext);
  assert.equal(result.status, 1);
  assert.equal(manifest().result, 'failed');
  assert.ok(manifest().gates.every(gate => gate.classification === 'failed'));
}

const dispatched = run(['--authoritative'], evidence(), {
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/codex/v1-pilot-acceptance-exercise',
  GITHUB_HEAD_REF: '',
  GITHUB_BASE_REF: '',
});
assert.equal(dispatched.status, 0, dispatched.stderr);
assert.equal(manifest().result, 'passed');

const mismatchedCandidate = run(['--authoritative'], evidence(), { PILOT_ACCEPTANCE_HEAD: 'a'.repeat(40) });
assert.equal(mismatchedCandidate.status, 1);
assert.equal(manifest().result, 'failed');

for (const invalidRunId of [undefined, 'different-run']) {
  const invalid = evidence();
  invalid[spec.requiredGates[0]].runId = invalidRunId;
  const result = run(['--authoritative'], invalid);
  assert.equal(result.status, 1);
  assert.equal(manifest().result, 'failed');
}

const staleEvidence = evidence();
for (const gate of Object.values(staleEvidence)) gate.runId = '31311268740';
assert.equal(run(['--authoritative'], staleEvidence).status, 1);
assert.equal(manifest().result, 'failed');

const malformed = evidence();
malformed[spec.requiredGates[0]] = { result: 'passed', runId: currentRunId };
assert.equal(run(['--authoritative'], malformed).status, 1);
assert.equal(manifest().result, 'failed');

const absent = evidence();
delete absent[spec.requiredGates[0]];
assert.equal(run(['--authoritative'], absent).status, 1);
assert.equal(manifest().result, 'failed');

const nonPassed = evidence();
nonPassed[spec.requiredGates[0]].result = 'failed';
assert.equal(run(['--authoritative'], nonPassed).status, 1);
assert.equal(manifest().result, 'failed');

console.log('Pilot acceptance verifier: local pending, exact SHA/run 9/9, provenance rejection, malformed/missing gates, fail-closed, and hosted/live classification passed.');
