import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import spec from '../config/pilot-acceptance-spec.json' with { type: 'json' };

const run = (args, results) => spawnSync(process.execPath, ['scripts/verify-pilot-acceptance.mjs', ...args], { encoding: 'utf8', env: { ...process.env, PILOT_ACCEPTANCE_HEAD: 'a'.repeat(40), PILOT_ACCEPTANCE_GATE_RESULTS: JSON.stringify(results) } });
const pending = run([], {});
assert.equal(pending.status, 0);
assert.equal(JSON.parse(fs.readFileSync('artifacts/pilot-acceptance/manifest.json')).result, 'pending');
const failed = run(['--authoritative'], {});
assert.equal(failed.status, 1);
const evidence = Object.fromEntries(spec.requiredGates.map(id => [id, { result: 'passed', command: `synthetic:${id}`, runId: 'test-run' }]));
const passed = run(['--authoritative'], evidence);
assert.equal(passed.status, 0, passed.stderr);
const manifest = JSON.parse(fs.readFileSync('artifacts/pilot-acceptance/manifest.json'));
assert.equal(manifest.result, 'passed');
assert.equal(manifest.hostedLive.classification, 'not_proven_hosted_live');
console.log('Pilot acceptance verifier: pending, fail-closed, complete, and hosted/live classification passed.');
