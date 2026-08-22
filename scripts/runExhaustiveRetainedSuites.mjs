import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { validateRetainedProducerResults } from './exhaustiveAcceptanceEvidence.mjs';
import { loadExecutionBindings } from './exhaustiveAcceptanceModel.mjs';

const releaseSha = process.env.RELEASE_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const workflowRunId = String(process.env.GITHUB_RUN_ID || 'local');
const workflowAttempt = String(process.env.GITHUB_RUN_ATTEMPT || 'local');
const environment = process.env.ACCEPTANCE_EVIDENCE_ENVIRONMENT || 'pull-request';
const workflowPath = process.env.GITHUB_WORKFLOW_REF?.split('@')[0]?.replace(`${process.env.GITHUB_REPOSITORY}/`, '') || '.github/workflows/exhaustive-acceptance.yml';
const manifestPath = path.resolve(process.env.RETAINED_RESULTS_MANIFEST || 'acceptance-results/retained-suite-results.json');
const bindings = loadExecutionBindings();

if (!/^[0-9a-f]{40}$/u.test(releaseSha)) throw new Error('RETAINED_RELEASE_SHA_REQUIRED');
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });

const manifest = {
  schemaVersion: 3,
  manifestKind: 'retained',
  releaseSha,
  workflowRunId,
  workflowAttempt,
  environment,
  workflowPath,
  generatedAt: new Date().toISOString(),
  suites: [],
  results: [],
};

const writeAtomic = () => {
  const temp = `${manifestPath}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.renameSync(temp, manifestPath);
};

for (const suite of bindings.retainedSuites ?? []) {
  const [executable, ...args] = suite.command;
  const started = Date.now();
  const resultPath = path.join(path.dirname(manifestPath), `.retained-${suite.suiteId}-${process.pid}.json`);
  fs.rmSync(resultPath, { force: true });
  console.log(`\n[acceptance-retained] ${suite.suiteId}: ${suite.command.join(' ')}`);
  const result = spawnSync(executable, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RELEASE_SHA: releaseSha,
      GITHUB_RUN_ID: workflowRunId,
      GITHUB_RUN_ATTEMPT: workflowAttempt,
      ACCEPTANCE_EVIDENCE_ENVIRONMENT: environment,
      ACCEPTANCE_WORKFLOW_PATH: workflowPath,
      RETAINED_SUITE_ID: suite.suiteId,
      RETAINED_TEST_ID_RESULTS: resultPath,
    },
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
    command: suite.command.join(' '),
  });
  if (status === 'PASS' && (suite.testIds ?? []).length) {
    const producer = spawnSync(process.execPath, ['scripts/produceRetainedAcceptanceEvidence.mjs'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RELEASE_SHA: releaseSha,
        GITHUB_RUN_ID: workflowRunId,
        GITHUB_RUN_ATTEMPT: workflowAttempt,
        ACCEPTANCE_EVIDENCE_ENVIRONMENT: environment,
        ACCEPTANCE_WORKFLOW_PATH: workflowPath,
        RETAINED_SUITE_CONTRACT: JSON.stringify(suite),
        RETAINED_TEST_ID_RESULTS: resultPath,
      },
      stdio: 'inherit',
    });
    if (producer.status !== 0) throw new Error(`RETAINED_TEST_ID_PRODUCER_FAILED:${suite.suiteId}`);
  }
  if (fs.existsSync(resultPath)) {
    const emitted = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    const producerErrors = validateRetainedProducerResults({ suite, emitted });
    fs.rmSync(resultPath, { force: true });
    if (producerErrors.length) throw new Error(`RETAINED_TEST_ID_PRODUCER_INVALID:${suite.suiteId}:${producerErrors.join(',')}`);
    manifest.results.push(...emitted.results);
  }
  writeAtomic();
}

const failed = manifest.suites.filter(item => item.status !== 'PASS');
console.log(JSON.stringify({
  retainedSuites: manifest.suites.length,
  passed: manifest.suites.length - failed.length,
  failed: failed.map(item => item.suiteId),
  exactTestIdResults: manifest.results.length,
  manifest: manifestPath,
}));
if (failed.length) process.exitCode = 1;
