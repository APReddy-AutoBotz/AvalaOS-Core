const assert = require('node:assert/strict');
const { resolveWorkflowEvidence } = require('./resolve-v1-rc-workflow-evidence.cjs');

const candidateSha = 'a'.repeat(40);
const wrongSha = 'b'.repeat(40);
const checks = Array.from({ length: 6 }, (_, index) => [
  `check-${index}`,
  `Workflow ${index}`,
  `workflow-${index}.yml`,
]);
const completedRun = (index, conclusion = 'success', headSha = candidateSha) => ({
  id: 2000 + index,
  workflow_id: 1000 + index,
  head_sha: headSha,
  status: 'completed',
  conclusion,
});

async function concurrentStartWaitsForCompletion() {
  let clock = 0;
  let poll = 0;
  const evidence = await resolveWorkflowEvidence({
    candidateSha,
    checks,
    waitForCompletion: true,
    timeoutMs: 100,
    pollIntervalMs: 10,
    now: () => clock,
    pause: async milliseconds => { clock += milliseconds; poll += 1; },
    listWorkflowRuns: async ({ workflowFile }) => {
      const index = Number(workflowFile.match(/\d+/)[0]);
      return { workflow_runs: poll < 2 ? [] : [completedRun(index)] };
    },
  });
  assert.equal(poll, 2);
  assert.equal(evidence.length, 6);
  assert.ok(evidence.every(run => run.conclusion === 'success' && run.headSha === candidateSha));
}

async function wrongShaIsIgnoredAndTimesOutFailClosed() {
  let clock = 0;
  const evidence = await resolveWorkflowEvidence({
    candidateSha,
    checks,
    waitForCompletion: true,
    timeoutMs: 20,
    pollIntervalMs: 10,
    now: () => clock,
    pause: async milliseconds => { clock += milliseconds; },
    listWorkflowRuns: async ({ workflowFile }) => {
      const index = Number(workflowFile.match(/\d+/)[0]);
      return { workflow_runs: [completedRun(index, 'success', wrongSha)] };
    },
  });
  assert.deepEqual(evidence, []);
}

async function completedFailureIsReturnedAsNonProvenEvidence() {
  const evidence = await resolveWorkflowEvidence({
    candidateSha,
    checks,
    waitForCompletion: true,
    listWorkflowRuns: async ({ workflowFile }) => {
      const index = Number(workflowFile.match(/\d+/)[0]);
      return { workflow_runs: [completedRun(index, index === 3 ? 'failure' : 'success')] };
    },
  });
  assert.equal(evidence.length, 6);
  assert.equal(evidence[3].conclusion, 'failure');
}

async function missingEvidenceTimesOut() {
  let clock = 0;
  const evidence = await resolveWorkflowEvidence({
    candidateSha,
    checks,
    waitForCompletion: true,
    timeoutMs: 20,
    pollIntervalMs: 10,
    now: () => clock,
    pause: async milliseconds => { clock += milliseconds; },
    listWorkflowRuns: async ({ workflowFile }) => {
      const index = Number(workflowFile.match(/\d+/)[0]);
      return { workflow_runs: index === 5 ? [] : [completedRun(index)] };
    },
  });
  assert.equal(evidence.length, 5);
  assert.ok(!evidence.some(run => run.id === 'check-5'));
}

Promise.resolve()
  .then(concurrentStartWaitsForCompletion)
  .then(wrongShaIsIgnoredAndTimesOutFailClosed)
  .then(completedFailureIsReturnedAsNonProvenEvidence)
  .then(missingEvidenceTimesOut)
  .then(() => console.log('V1 RC workflow evidence resolver tests passed'));
