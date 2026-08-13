import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { loadExecutionBindings } from './exhaustiveAcceptanceModel.mjs';

const releaseSha = process.env.RELEASE_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const workflowRunId = String(process.env.GITHUB_RUN_ID || 'local');
const workflowAttempt = String(process.env.GITHUB_RUN_ATTEMPT || 'local');
const manifestPath = path.resolve(process.env.RETAINED_RESULTS_MANIFEST || 'acceptance-results/retained-suite-results.json');
const bindings = loadExecutionBindings();

if (!/^[0-9a-f]{40}$/u.test(releaseSha)) throw new Error('RETAINED_RELEASE_SHA_REQUIRED');
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });

const manifest = {
  schemaVersion: 1,
  releaseSha,
  workflowRunId,
  workflowAttempt,
  generatedAt: new Date().toISOString(),
  suites: [],
};

const writeAtomic = () => {
  const temp = `${manifestPath}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.renameSync(temp, manifestPath);
};

for (const suite of bindings.retainedSuites ?? []) {
  const [executable, ...args] = suite.command;
  const started = Date.now();
  console.log(`\n[acceptance-retained] ${suite.suiteId}: ${suite.command.join(' ')}`);
  const result = spawnSync(executable, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });
  const status = result.status === 0 ? 'PASS' : 'FAIL';
  manifest.suites.push({
    suiteId: suite.suiteId,
    status,
    exitCode: Number.isInteger(result.status) ? result.status : null,
    signal: result.signal ?? null,
    durationMs: Date.now() - started,
    testIds: suite.testIds ?? [],
    requiredGate: suite.requiredGate === true,
  });
  writeAtomic();
}

const failed = manifest.suites.filter(item => item.status !== 'PASS');
console.log(JSON.stringify({
  retainedSuites: manifest.suites.length,
  passed: manifest.suites.length - failed.length,
  failed: failed.map(item => item.suiteId),
  manifest: manifestPath,
}));
if (failed.length) process.exitCode = 1;
