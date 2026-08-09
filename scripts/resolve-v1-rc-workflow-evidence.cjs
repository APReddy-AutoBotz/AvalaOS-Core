const DEFAULT_POLL_INTERVAL_MS = 15_000;
const DEFAULT_TIMEOUT_MS = 20 * 60_000;

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function resolveWorkflowEvidence({
  candidateSha,
  checks,
  listWorkflowRuns,
  waitForCompletion,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = Date.now,
  pause = sleep,
}) {
  const deadline = now() + timeoutMs;

  while (true) {
    const evidence = [];
    for (const [id, workflowName, workflowFile] of checks) {
      const response = await listWorkflowRuns({ workflowFile, candidateSha });
      const run = response.workflow_runs.find(candidate =>
        candidate.head_sha === candidateSha && candidate.status === 'completed'
      );
      if (run) evidence.push({
        id,
        workflowName,
        workflowId: run.workflow_id,
        runId: run.id,
        headSha: run.head_sha,
        conclusion: run.conclusion,
        provenance: 'github_actions_api',
      });
    }

    if (evidence.length === checks.length || !waitForCompletion || now() >= deadline) {
      return evidence;
    }
    await pause(Math.min(pollIntervalMs, Math.max(0, deadline - now())));
  }
}

module.exports = {
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_TIMEOUT_MS,
  resolveWorkflowEvidence,
};
