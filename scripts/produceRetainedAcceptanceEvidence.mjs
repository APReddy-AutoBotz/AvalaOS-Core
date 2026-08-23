import fs from 'node:fs';
import { canonicalCommand } from './exhaustiveAcceptanceModel.mjs';

export const produceRetainedAcceptanceEvidence = ({ suite, identity, assertionResults }) => {
  if (!Array.isArray(assertionResults)) throw new Error('RETAINED_ASSERTION_RESULTS_REQUIRED');
  return {
    schemaVersion: 2,
    suiteId: suite.suiteId,
    results: assertionResults.map(result => ({
      ...result,
      suiteId: suite.suiteId,
      jobId: suite.suiteId,
      command: canonicalCommand(suite.command),
      ...identity,
    })),
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const suite = JSON.parse(process.env.RETAINED_SUITE_CONTRACT || 'null');
  if (!suite || !process.env.RETAINED_TEST_ID_RESULTS || !process.env.RETAINED_ASSERTION_RESULTS_SOURCE) throw new Error('RETAINED_PRODUCER_CONTRACT_REQUIRED');
  const identity = {
    releaseSha: process.env.RELEASE_SHA,
    workflowRunId: String(process.env.GITHUB_RUN_ID),
    workflowAttempt: String(process.env.GITHUB_RUN_ATTEMPT),
    environment: process.env.ACCEPTANCE_EVIDENCE_ENVIRONMENT,
    workflowPath: process.env.ACCEPTANCE_WORKFLOW_PATH,
  };
  const assertionResults = JSON.parse(fs.readFileSync(process.env.RETAINED_ASSERTION_RESULTS_SOURCE, 'utf8')).results;
  const produced = produceRetainedAcceptanceEvidence({ suite, identity, assertionResults });
  fs.writeFileSync(process.env.RETAINED_TEST_ID_RESULTS, `${JSON.stringify(produced, null, 2)}\n`, { mode: 0o600 });
}
