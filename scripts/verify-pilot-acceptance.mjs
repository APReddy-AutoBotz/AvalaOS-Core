import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import spec from '../config/pilot-acceptance-spec.json' with { type: 'json' };

const authoritative = process.argv.includes('--authoritative');
const head = process.env.PILOT_ACCEPTANCE_HEAD || execFileSync('git', ['rev-parse','HEAD'], { encoding: 'utf8' }).trim();
const run = { id: process.env.GITHUB_RUN_ID || null, attempt: process.env.GITHUB_RUN_ATTEMPT || null, workflow: process.env.GITHUB_WORKFLOW || 'local' };
let supplied = {};
try { supplied = JSON.parse(process.env.PILOT_ACCEPTANCE_GATE_RESULTS || '{}'); } catch { throw new Error('PILOT_ACCEPTANCE_GATE_RESULTS must be valid JSON'); }
const gates = spec.requiredGates.map(id => {
  const evidence = supplied[id];
  if (evidence?.result === 'passed') return { id, classification: 'proven_disposable_pilot_evidence', result: 'passed', command: evidence.command, runId: evidence.runId || run.id };
  return { id, classification: authoritative ? 'failed' : 'configured_not_live_verified', result: authoritative ? 'failed' : 'pending', command: evidence?.command || null, runId: evidence?.runId || run.id };
});
const passed = gates.every(g => g.result === 'passed');
const report = { schemaVersion: spec.schemaVersion, candidate: { head, requiredBaseline: spec.requiredBaseline }, run, scope: spec.scope, result: passed ? 'passed' : authoritative ? 'failed' : 'pending', gates, hostedLive: { classification: 'not_proven_hosted_live', result: 'not_proven' }, limitations: spec.limitations };
fs.mkdirSync('artifacts/pilot-acceptance', { recursive: true });
fs.writeFileSync('artifacts/pilot-acceptance/manifest.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`Pilot acceptance manifest: ${report.result}; ${gates.filter(g => g.result === 'passed').length}/${gates.length} required gates passed.`);
if (authoritative && !passed) process.exitCode = 1;
