import assert from 'node:assert/strict';
import { checkWorkflowYaml, parseWorkflowYaml } from './checkWorkflowYaml.mjs';

const files = await checkWorkflowYaml();
assert.ok(files.includes('v1-release-candidate.yml'));

assert.throws(
  () => parseWorkflowYaml(`jobs:\n  evidence:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n        ref: candidate-sha\n          fetch-depth: 0\n`, 'malformed-checkout.yml'),
  /malformed-checkout\.yml is not valid YAML/u,
);

console.log('Workflow YAML regression checks passed.');
