import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import spec from '../config/pilot-acceptance-spec.json' with { type: 'json' };

const authoritative = process.argv.includes('--authoritative');
const checkedOutHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const head = process.env.PILOT_ACCEPTANCE_HEAD || checkedOutHead;
const run = {
  id: process.env.GITHUB_RUN_ID || null,
  attempt: process.env.GITHUB_RUN_ATTEMPT || null,
  workflow: process.env.GITHUB_WORKFLOW || 'local',
};

let supplied = {};
let parseError = null;
try {
  supplied = JSON.parse(process.env.PILOT_ACCEPTANCE_GATE_RESULTS || '{}');
  if (!supplied || Array.isArray(supplied) || typeof supplied !== 'object') {
    parseError = 'PILOT_ACCEPTANCE_GATE_RESULTS must be a JSON object';
    supplied = {};
  }
} catch {
  parseError = 'PILOT_ACCEPTANCE_GATE_RESULTS must be valid JSON';
}

const candidateMatches = head === checkedOutHead;
const hasAuthoritativeRun = typeof run.id === 'string' && /^\d+$/u.test(run.id);
const gates = spec.requiredGates.map(id => {
  const evidence = supplied[id];
  const wellFormed = evidence !== null
    && !Array.isArray(evidence)
    && typeof evidence === 'object'
    && ['passed', 'failed'].includes(evidence.result)
    && typeof evidence.command === 'string'
    && evidence.command.trim().length > 0
    && typeof evidence.runId === 'string'
    && evidence.runId.length > 0;
  const provenanceMatches = wellFormed && evidence.runId === run.id;
  const accepted = evidence?.result === 'passed'
    && (!authoritative || (candidateMatches && hasAuthoritativeRun && provenanceMatches && !parseError));

  if (accepted) {
    return { id, classification: 'proven_disposable_pilot_evidence', result: 'passed', command: evidence.command, runId: evidence.runId };
  }

  return {
    id,
    classification: authoritative ? 'failed' : 'configured_not_live_verified',
    result: authoritative ? 'failed' : 'pending',
    command: wellFormed ? evidence.command : null,
    runId: wellFormed ? evidence.runId : null,
  };
});
const passed = gates.every(gate => gate.result === 'passed');
const report = {
  schemaVersion: spec.schemaVersion,
  candidate: { head, checkedOutHead, requiredBaseline: spec.requiredBaseline },
  run,
  scope: spec.scope,
  result: passed ? 'passed' : authoritative ? 'failed' : 'pending',
  gates,
  hostedLive: { classification: 'not_proven_hosted_live', result: 'not_proven' },
  limitations: spec.limitations,
};
fs.mkdirSync('artifacts/pilot-acceptance', { recursive: true });
fs.writeFileSync('artifacts/pilot-acceptance/manifest.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`Pilot acceptance manifest: ${report.result}; ${gates.filter(gate => gate.result === 'passed').length}/${gates.length} required gates passed.`);
if (parseError) console.error(parseError);
if (authoritative && !candidateMatches) console.error('PILOT_ACCEPTANCE_HEAD must match the exact checked-out candidate.');
if (authoritative && !hasAuthoritativeRun) console.error('GITHUB_RUN_ID must identify the current authoritative workflow run.');
if (authoritative && !passed) process.exitCode = 1;
