import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkWorkflowYaml, parseWorkflowYaml } from './checkWorkflowYaml.mjs';

const files = await checkWorkflowYaml();
assert.ok(files.includes('v1-release-candidate.yml'));

assert.throws(
  () => parseWorkflowYaml(`jobs:\n  evidence:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n        ref: candidate-sha\n          fetch-depth: 0\n`, 'malformed-checkout.yml'),
  /malformed-checkout\.yml is not valid YAML/u,
);

const rcWorkflow = parseWorkflowYaml(
  await readFile('.github/workflows/v1-release-candidate.yml', 'utf8'),
  'v1-release-candidate.yml',
);
const rcSteps = rcWorkflow.jobs['compose-source-evidence'].steps;
const authoritativeGate = rcSteps.find(step => step.name === 'Enforce authoritative exact-candidate evidence gate');
assert.equal(
  authoritativeGate?.if,
  "github.event_name == 'workflow_dispatch' || (github.event_name == 'pull_request' && github.event.pull_request.number == 225)",
  'the fail-closed authoritative gate must be scoped to PR #225 or an explicit manual RC invocation',
);
assert.equal(authoritativeGate?.run, 'npm run verify:v1-rc-evidence:authoritative');

const isAuthoritativeRcContext = ({ eventName, pullRequestNumber }) => (
  eventName === 'workflow_dispatch' || (eventName === 'pull_request' && pullRequestNumber === 225)
);
assert.equal(isAuthoritativeRcContext({ eventName: 'pull_request', pullRequestNumber: 225 }), true);
assert.equal(isAuthoritativeRcContext({ eventName: 'workflow_dispatch' }), true);
assert.equal(isAuthoritativeRcContext({ eventName: 'pull_request', pullRequestNumber: 226 }), false);

console.log('Workflow YAML regression checks passed.');
