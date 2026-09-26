import assert from 'node:assert/strict';
import { spawn as spawnProcess, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import {
  buildRequiredEdgeSourceManifest,
  canonicalDigest,
  CONTROLLED_HUMAN_MIGRATION_PATH,
  CONTROLLED_HUMAN_MIGRATION_TIP,
  CONTROLLED_HUMAN_PRIOR_MIGRATION_TIP,
  REQUIRED_EDGE_FUNCTIONS,
  sha256Digest,
  validateEdgeDeploymentManifest,
} from './prCControlledHumanEvidenceContract.mjs';
import {
  deriveContext,
  deriveControlledHumanExerciseBinding,
  loadFixture,
  safeResult,
} from './prCControlledHumanEnvironment.mjs';
import {
  classifyEdgeDeployFailure,
  EDGE_DEPLOY_FAILURE_OUTPUT,
  runBoundedSupabaseDeploy,
  runControlledHumanEdgeDeploy,
  validateEdgeDeployFailureDiagnostic,
  writeEdgeDeployFailureArtifact,
} from './prCControlledHumanEdgeDeploy.mjs';

const root = process.cwd();
const releaseSha = '1'.repeat(40);
const deployId = '2'.repeat(24);
const targetFingerprint = `sha256:${'3'.repeat(64)}`;
const exerciseId = '00000000-0000-4000-8000-000000000264';
const projectRef = 'abcdefghijklmnopqrst';
const publicTargetDigest = sha256Digest(`pr-c-controlled-human-public-target\0https://${projectRef}.supabase.co`);
const accessToken = 'synthetic-access-token-value';

const fixtureState = await loadFixture();
const exerciseBinding = deriveControlledHumanExerciseBinding({
  environmentClass: 'hosted_nonproduction_pilot',
  prNumber: 264,
  releaseSha,
  reviewHeadSha: releaseSha,
  exerciseId,
  targetFingerprint,
  publicTargetDigest,
}, fixtureState);

const baseEnv = Object.freeze({
  GITHUB_EVENT_NAME: 'pull_request',
  GITHUB_REPOSITORY: 'APReddy-AutoBotz/AvalaOS-Core',
  GITHUB_WORKFLOW_REF: 'APReddy-AutoBotz/AvalaOS-Core/.github/workflows/transcript-flow-pr-c.yml@refs/pull/264/merge',
  GITHUB_JOB: 'controlled_human_edge',
  GITHUB_RUN_ID: '34664000673',
  GITHUB_RUN_ATTEMPT: '1',
  PR_C_CONTROLLED_HUMAN_ENVIRONMENT_CLASS: 'hosted_nonproduction_pilot',
  PR_C_CONTROLLED_HUMAN_PR_NUMBER: '264',
  PR_C_CONTROLLED_HUMAN_RELEASE_SHA: releaseSha,
  PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA: releaseSha,
  PR_C_CONTROLLED_HUMAN_DEPLOY_ID: deployId,
  PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN: 'https://deploy-preview-264--avalaos-pilot.netlify.app',
  PR_C_CONTROLLED_HUMAN_EXERCISE_ID: exerciseId,
  PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST: exerciseBinding.exerciseDigest,
  PR_C_CONTROLLED_HUMAN_EXPECTED_EXERCISE_DIGEST: exerciseBinding.exerciseDigest,
  PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT: targetFingerprint,
  PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST: publicTargetDigest,
  PR_C_CONTROLLED_HUMAN_SITE_NAME: 'avalaos-pilot',
  PR_C_CONTROLLED_HUMAN_NETLIFY_CONTEXT: 'deploy-preview',
  PR_C_CONTROLLED_HUMAN_EDGE_WORKFLOW_PATH: '.github/workflows/transcript-flow-pr-c.yml',
  PR_C_CONTROLLED_HUMAN_SUPABASE_URL: `https://${projectRef}.supabase.co`,
  SUPABASE_PROJECT_REF: projectRef,
  SUPABASE_ACCESS_TOKEN: accessToken,
});

const context = deriveContext(baseEnv, fixtureState, { head: releaseSha, dirty: '' });
const migrationDigest = sha256Digest(await readFile(CONTROLLED_HUMAN_MIGRATION_PATH));

const migrationRecord = phase => safeResult(phase, 'passed', context, {
  migrationDigest,
  priorMigrationTip: CONTROLLED_HUMAN_PRIOR_MIGRATION_TIP,
  ...(phase === 'migration-preflight' ? { disposition: 'exact_replay' } : {}),
  ...(phase === 'migration-apply' ? { replayed: true } : {}),
  unexpectedDataCount: 0,
  providerRowCount: 0,
});

const providerBaseline = () => ({
  schemaVersion: 'pr-c-controlled-human-edge-provider-baseline-1',
  observedAt: '2026-09-12T00:00:00.000Z',
  functions: REQUIRED_EDGE_FUNCTIONS.map((name, index) => ({
    name,
    version: index,
    identityDigest: sha256Digest(`identity:${name}`),
    bundleDigest: sha256Digest(`bundle:${name}`),
    updatedAtDigest: sha256Digest(`updated:${name}`),
  })),
});

const setupInputs = async directory => {
  const records = [migrationRecord('migration-preflight'), migrationRecord('migration-apply'), migrationRecord('migration-verify')];
  const paths = [];
  for (const [index, record] of records.entries()) {
    const file = path.join(directory, `${record.phase}.json`);
    await writeFile(file, `${JSON.stringify(record, null, 2)}\n`);
    paths[index] = file;
  }
  const baseline = path.join(directory, 'provider-baseline.json');
  await writeFile(baseline, `${JSON.stringify(providerBaseline(), null, 2)}\n`);
  return {
    records,
    baseline,
    argv: [
      '--migration-preflight', paths[0],
      '--migration-apply', paths[1],
      '--migration-verify', paths[2],
      '--provider-baseline', baseline,
      '--failure-output', EDGE_DEPLOY_FAILURE_OUTPUT,
    ],
  };
};

const expectedDiagnosticContext = value => ({
  releaseSha: value.releaseSha,
  reviewHeadSha: value.reviewHeadSha,
  deployId: value.deployId,
  exerciseDigest: value.exerciseDigest,
  targetFingerprint: value.targetFingerprint,
  publicTargetDigest: value.publicTargetDigest,
  personaManifestDigest: value.personaManifestDigest,
  fixtureManifestDigest: value.fixtureManifestDigest,
  migrationTip: value.migrationTip,
  edgeSourceManifestDigest: value.edgeSourceManifestDigest,
  failedFunction: value.failedFunction,
  classification: value.classification,
  deploymentOutcome: value.deploymentOutcome,
  retryAttempted: value.retryAttempted,
  'inputDigests.migrationPreflight': value.inputDigests.migrationPreflight,
  'inputDigests.migrationApply': value.inputDigests.migrationApply,
  'inputDigests.migrationVerify': value.inputDigests.migrationVerify,
  'inputDigests.providerBaseline': value.inputDigests.providerBaseline,
  'producer.workflowPath': value.producer.workflowPath,
  'producer.job': value.producer.job,
  'producer.event': value.producer.event,
  'producer.runId': value.producer.runId,
  'producer.runAttempt': value.producer.runAttempt,
  'producer.artifactName': value.producer.artifactName,
});

const withInputs = async callback => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pr264-edge-deploy-'));
  try { return await callback(await setupInputs(directory), directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
};

test('sequential wrapper deploys all nine exact functions once with no auth-weakening flags', async () => withInputs(async ({ argv }) => {
  const calls = [];
  let writes = 0;
  const result = await runControlledHumanEdgeDeploy({
    argv,
    env: baseEnv,
    root,
    checkout: { head: releaseSha, dirty: '' },
    runner: async input => { calls.push(input); return { ok: true, classification: null }; },
    writeFailureArtifact: async () => { writes += 1; },
  });
  assert.deepEqual(calls.map(call => call.functionName), REQUIRED_EDGE_FUNCTIONS);
  assert.equal(new Set(calls.map(call => call.functionName)).size, 9);
  assert.ok(calls.every(call => call.projectRef === projectRef && call.env.SUPABASE_ACCESS_TOKEN === accessToken));
  assert.equal(writes, 0);
  assert.deepEqual(result, { status: 'commands_completed_unattested', functionCount: 9 });
}));

test('first failure stops without retry and produces only a strict failure diagnostic', async () => withInputs(async ({ argv }) => {
  const calls = [];
  const writes = [];
  await assert.rejects(runControlledHumanEdgeDeploy({
    argv,
    env: baseEnv,
    root,
    checkout: { head: releaseSha, dirty: '' },
    runner: async input => {
      calls.push(input.functionName);
      return input.functionName === REQUIRED_EDGE_FUNCTIONS[1]
        ? { ok: false, classification: 'timeout' }
        : { ok: true, classification: null };
    },
    writeFailureArtifact: async (file, value) => { writes.push({ file, value }); },
  }), /PR_C_CH_EDGE_DEPLOY_FAILED/u);
  assert.deepEqual(calls, REQUIRED_EDGE_FUNCTIONS.slice(0, 2));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].file, EDGE_DEPLOY_FAILURE_OUTPUT);
  const diagnostic = writes[0].value;
  validateEdgeDeployFailureDiagnostic(diagnostic, expectedDiagnosticContext(diagnostic));
  assert.equal(diagnostic.edgeSourceManifestDigest, canonicalDigest(buildRequiredEdgeSourceManifest(root)));
  assert.equal(diagnostic.failedFunction, REQUIRED_EDGE_FUNCTIONS[1]);
  assert.equal(diagnostic.classification, 'timeout');
  assert.equal(diagnostic.deploymentOutcome, 'unknown_after_timeout');
  assert.equal(diagnostic.retryAttempted, false);
  assert.equal(JSON.stringify(diagnostic).includes(accessToken), false);
  assert.equal(JSON.stringify(diagnostic).includes('error'), false);
  assert.throws(() => validateEdgeDeploymentManifest(diagnostic, {
    root,
    exactHead: releaseSha,
    targetFingerprint,
    exerciseDigest: exerciseBinding.exerciseDigest,
    producer: diagnostic.producer,
    signingKey: 'synthetic-signing-key-value-at-least-32-bytes',
  }));
}));

test('unconfirmed termination stops the sequence and remains an unknown deployment outcome', async () => withInputs(async ({ argv }) => {
  const calls = [];
  const writes = [];
  await assert.rejects(runControlledHumanEdgeDeploy({
    argv,
    env: baseEnv,
    root,
    checkout: { head: releaseSha, dirty: '' },
    runner: async input => {
      calls.push(input.functionName);
      return input.functionName === REQUIRED_EDGE_FUNCTIONS[1]
        ? { ok: false, classification: 'termination_unconfirmed' }
        : { ok: true, classification: null };
    },
    writeFailureArtifact: async (file, value) => { writes.push({ file, value }); },
  }), /PR_C_CH_EDGE_DEPLOY_FAILED/u);
  assert.deepEqual(calls, REQUIRED_EDGE_FUNCTIONS.slice(0, 2));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].value.classification, 'termination_unconfirmed');
  assert.equal(writes[0].value.deploymentOutcome, 'unknown_after_unconfirmed_termination');
  assert.equal(writes[0].value.retryAttempted, false);
  validateEdgeDeployFailureDiagnostic(writes[0].value, expectedDiagnosticContext(writes[0].value));
}));

test('invalid context and completed-input substitutions reject before deploy and create no artifact', async () => withInputs(async ({ argv, records }, directory) => {
  const cases = [];
  cases.push({ env: { ...baseEnv, GITHUB_RUN_ID: '0' }, argv });
  cases.push({ env: baseEnv, argv, checkout: { head: '9'.repeat(40), dirty: '' } });
  cases.push({ env: { ...baseEnv, PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT: `sha256:${'8'.repeat(64)}` }, argv });
  cases.push({ env: { ...baseEnv, PR_C_CONTROLLED_HUMAN_SUPABASE_URL: `https://${'f'.repeat(20)}.supabase.co` }, argv });
  cases.push({ env: { ...baseEnv, SUPABASE_API_URL: 'https://example.invalid' }, argv });
  const wrongPhase = structuredClone(records[0]);
  wrongPhase.phase = 'migration-verify';
  const wrongPhaseFile = path.join(directory, 'wrong-phase.json');
  await writeFile(wrongPhaseFile, JSON.stringify(wrongPhase));
  cases.push({ env: baseEnv, argv: [...argv.slice(0, 1), wrongPhaseFile, ...argv.slice(2)] });
  const wrongDigest = structuredClone(records[2]);
  wrongDigest.migrationDigest = `sha256:${'7'.repeat(64)}`;
  const wrongDigestFile = path.join(directory, 'wrong-digest.json');
  await writeFile(wrongDigestFile, JSON.stringify(wrongDigest));
  cases.push({ env: baseEnv, argv: [...argv.slice(0, 5), wrongDigestFile, ...argv.slice(6)] });
  const oversizedFile = path.join(directory, 'oversized.json');
  await writeFile(oversizedFile, 'x'.repeat(1024 * 1024 + 1));
  cases.push({ env: baseEnv, argv: [...argv.slice(0, 1), oversizedFile, ...argv.slice(2)] });
  for (const candidate of cases) {
    let runs = 0;
    let writes = 0;
    await assert.rejects(runControlledHumanEdgeDeploy({
      argv: candidate.argv,
      env: candidate.env,
      root,
      checkout: candidate.checkout ?? { head: releaseSha, dirty: '' },
      runner: async () => { runs += 1; return { ok: true, classification: null }; },
      writeFailureArtifact: async () => { writes += 1; },
    }));
    assert.equal(runs, 0);
    assert.equal(writes, 0);
  }
}));

test('independent failure consumer rejects wrong run, head, target, function, phase digest, and unknown fields', async () => withInputs(async ({ argv }) => {
  let diagnostic;
  await assert.rejects(runControlledHumanEdgeDeploy({
    argv,
    env: baseEnv,
    root,
    checkout: { head: releaseSha, dirty: '' },
    runner: async () => ({ ok: false, classification: 'unknown' }),
    writeFailureArtifact: async (_file, value) => { diagnostic = value; },
  }));
  const mutations = [
    value => { value.producer.runId = '0'; },
    value => { value.releaseSha = '9'.repeat(40); },
    value => { value.targetFingerprint = `sha256:${'8'.repeat(64)}`; },
    value => { value.failedFunction = 'foreign-function'; },
    value => { value.inputDigests.migrationPreflight = `sha256:${'7'.repeat(64)}`; },
    value => { value.unexpected = true; },
  ];
  const expected = expectedDiagnosticContext(diagnostic);
  for (const mutate of mutations) {
    const changed = structuredClone(diagnostic);
    mutate(changed);
    assert.throws(() => validateEdgeDeployFailureDiagnostic(changed, expected));
  }
}));

test('bounded spawn uses exact CLI arguments and discards hostile output', async () => {
  const calls = [];
  const secret = 'synthetic-secret-that-must-never-survive';
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => { setImmediate(() => child.emit('close', null, 'SIGKILL')); return true; };
    setImmediate(() => child.stderr.write(`${secret}:${'x'.repeat(400_000)}`));
    return child;
  };
  const outcome = await runBoundedSupabaseDeploy({ functionName: REQUIRED_EDGE_FUNCTIONS[0], projectRef, env: baseEnv, spawnImpl });
  assert.deepEqual(outcome, { ok: false, classification: 'output_limit' });
  assert.equal(JSON.stringify(outcome).includes(secret), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'supabase');
  assert.deepEqual(calls[0].args, ['functions', 'deploy', REQUIRED_EDGE_FUNCTIONS[0], '--project-ref', projectRef]);
  assert.equal(calls[0].args.some(value => /jwt|prune|token|debug|retry/iu.test(value)), false);
  assert.deepEqual(calls[0].options.stdio, ['ignore', 'pipe', 'pipe']);
  assert.equal(calls[0].options.env.SUPABASE_ACCESS_TOKEN, accessToken);
  assert.equal(calls[0].options.env.PR_C_CONTROLLED_HUMAN_EXERCISE_ID, undefined);
  assert.equal(calls[0].options.env.PR_C_CONTROLLED_HUMAN_SUPABASE_URL, undefined);
});

test('bounded spawn classifies timeout and spawn errors without retaining messages', async () => {
  const timeoutSecret = 'timeout-secret-value';
  const timeoutSpawn = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.pid = 1001;
    child.kill = () => {
      setTimeout(() => child.emit('close', null, 'SIGKILL'), 10);
      return true;
    };
    child.stderr.write(timeoutSecret);
    return child;
  };
  const timeout = await runBoundedSupabaseDeploy({ functionName: REQUIRED_EDGE_FUNCTIONS[0], projectRef, env: baseEnv, spawnImpl: timeoutSpawn, timeoutMs: 20 });
  assert.deepEqual(timeout, { ok: false, classification: 'timeout' });
  assert.equal(JSON.stringify(timeout).includes(timeoutSecret), false);

  const errorSecret = 'spawn-error-secret-value';
  const errorSpawn = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => true;
    setImmediate(() => child.emit('error', Object.assign(new Error(`network ${errorSecret}`), { code: 'ENOTFOUND' })));
    return child;
  };
  const failed = await runBoundedSupabaseDeploy({ functionName: REQUIRED_EDGE_FUNCTIONS[0], projectRef, env: baseEnv, spawnImpl: errorSpawn });
  assert.deepEqual(failed, { ok: false, classification: 'provider_transport' });
  assert.equal(JSON.stringify(failed).includes(errorSecret), false);
});

test('failed or unconfirmed kill fails closed and never reports the triggering classification', async () => {
  for (const kill of [() => false, () => { throw new Error('synthetic-kill-failure'); }]) {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.pid = 1002;
    child.kill = kill;
    const outcome = await runBoundedSupabaseDeploy({
      functionName: REQUIRED_EDGE_FUNCTIONS[0],
      projectRef,
      env: baseEnv,
      spawnImpl: () => child,
      timeoutMs: 5,
    });
    assert.deepEqual(outcome, { ok: false, classification: 'termination_unconfirmed' });
  }
});

test('a delayed close confirms termination even when kill reports false', async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 1006;
  child.kill = () => {
    setTimeout(() => child.emit('close', null, 'SIGKILL'), 10);
    return false;
  };
  const outcome = await runBoundedSupabaseDeploy({
    functionName: REQUIRED_EDGE_FUNCTIONS[0],
    projectRef,
    env: baseEnv,
    spawnImpl: () => child,
    timeoutMs: 20,
  });
  assert.deepEqual(outcome, { ok: false, classification: 'timeout' });
});

test('output overflow with no close is termination-unconfirmed, not a false output-limit completion', async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 1003;
  child.kill = () => true;
  setImmediate(() => child.stdout.write('x'.repeat(400_000)));
  const outcome = await runBoundedSupabaseDeploy({
    functionName: REQUIRED_EDGE_FUNCTIONS[0],
    projectRef,
    env: baseEnv,
    spawnImpl: () => child,
    timeoutMs: 5,
  });
  assert.deepEqual(outcome, { ok: false, classification: 'termination_unconfirmed' });
});

test('a close after the confirmation boundary cannot replace termination-unconfirmed', async () => {
  let closeEmitted = false;
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 1008;
  child.kill = () => {
    setTimeout(() => {
      closeEmitted = true;
      child.emit('close', null, 'SIGKILL');
    }, 500);
    return true;
  };
  const outcome = await runBoundedSupabaseDeploy({
    functionName: REQUIRED_EDGE_FUNCTIONS[0],
    projectRef,
    env: baseEnv,
    spawnImpl: () => child,
    timeoutMs: 20,
  });
  assert.deepEqual(outcome, { ok: false, classification: 'termination_unconfirmed' });
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.equal(closeEmitted, true);
  assert.deepEqual(outcome, { ok: false, classification: 'termination_unconfirmed' });
});

test('a running child error cannot settle until direct-child close is observed', async () => {
  let killCount = 0;
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 1004;
  child.kill = () => {
    killCount += 1;
    setTimeout(() => child.emit('close', null, 'SIGKILL'), 10);
    return true;
  };
  setImmediate(() => child.emit('error', Object.assign(new Error('network synthetic-private-detail'), { code: 'ENOTFOUND' })));
  const outcome = await runBoundedSupabaseDeploy({
    functionName: REQUIRED_EDGE_FUNCTIONS[0],
    projectRef,
    env: baseEnv,
    spawnImpl: () => child,
    timeoutMs: 100,
  });
  assert.deepEqual(outcome, { ok: false, classification: 'provider_transport' });
  assert.equal(killCount, 1);
  assert.equal(JSON.stringify(outcome).includes('synthetic-private-detail'), false);
});

test('a running child error without close is termination-unconfirmed', async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 1007;
  child.kill = () => true;
  setImmediate(() => child.emit('error', Object.assign(new Error('network synthetic-private-detail'), { code: 'ENOTFOUND' })));
  const outcome = await runBoundedSupabaseDeploy({
    functionName: REQUIRED_EDGE_FUNCTIONS[0],
    projectRef,
    env: baseEnv,
    spawnImpl: () => child,
    timeoutMs: 5,
  });
  assert.deepEqual(outcome, { ok: false, classification: 'termination_unconfirmed' });
});

test('timeout wins a close-zero race and cannot become success', async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 1005;
  child.kill = () => {
    setImmediate(() => child.emit('close', 0, null));
    return true;
  };
  const outcome = await runBoundedSupabaseDeploy({
    functionName: REQUIRED_EDGE_FUNCTIONS[0],
    projectRef,
    env: baseEnv,
    spawnImpl: () => child,
    timeoutMs: 5,
  });
  assert.deepEqual(outcome, { ok: false, classification: 'timeout' });
});

test('actual local synthetic direct children are closed after timeout and output overflow', async () => {
  const processes = [];
  const closeOwnedChild = child => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    const fallback = setTimeout(resolve, 2_500);
    child.once('close', () => { clearTimeout(fallback); resolve(); });
    try { child.kill('SIGKILL'); } catch { clearTimeout(fallback); resolve(); }
  });
  try {
    const actualSpawn = (_command, _args, options) => {
      const child = spawnProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], options);
      processes.push(child);
      return child;
    };
    const timeout = await runBoundedSupabaseDeploy({
      functionName: REQUIRED_EDGE_FUNCTIONS[0],
      projectRef,
      env: baseEnv,
      spawnImpl: actualSpawn,
      timeoutMs: 1_000,
    });
    assert.deepEqual(timeout, { ok: false, classification: 'timeout' });
    assert.equal(processes[0].exitCode !== null || processes[0].signalCode !== null, true);

    const actualOverflowSpawn = (_command, _args, options) => {
      const child = spawnProcess(process.execPath, ['-e', "process.stdout.write('x'.repeat(4096)); setInterval(() => {}, 1000)"], options);
      processes.push(child);
      return child;
    };
    const overflow = await runBoundedSupabaseDeploy({
      functionName: REQUIRED_EDGE_FUNCTIONS[0],
      projectRef,
      env: baseEnv,
      spawnImpl: actualOverflowSpawn,
      timeoutMs: 10_000,
      outputLimitBytes: 64,
    });
    assert.deepEqual(overflow, { ok: false, classification: 'output_limit' });
    assert.equal(processes[1].exitCode !== null || processes[1].signalCode !== null, true);
  } finally {
    await Promise.all(processes.map(closeOwnedChild));
  }
});

test('classification is fixed to the allowlisted in-memory taxonomy', () => {
  assert.equal(classifyEdgeDeployFailure({ stderr: 'Module not found during resolution' }), 'dependency_resolution');
  assert.equal(classifyEdgeDeployFailure({ stderr: 'Bundling failed with SyntaxError' }), 'bundle_validation');
  assert.equal(classifyEdgeDeployFailure({ stderr: 'Unauthorized: invalid access token' }), 'cli_auth');
  assert.equal(classifyEdgeDeployFailure({ stderr: 'TLS network connection failure' }), 'provider_transport');
  assert.equal(classifyEdgeDeployFailure({ stderr: 'opaque provider response' }), 'unknown');
  assert.equal(classifyEdgeDeployFailure({ stderr: 'Unauthorized', outputLimited: true }), 'output_limit');
  assert.equal(classifyEdgeDeployFailure({ stderr: 'Unauthorized', timedOut: true }), 'timeout');
});

test('failure artifact writer is exclusive and never overwrites prior evidence', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pr264-edge-exclusive-'));
  const file = path.join(directory, 'edge-deploy-failure.json');
  try {
    await writeEdgeDeployFailureArtifact(file, { schemaVersion: 'synthetic-first' });
    await assert.rejects(writeEdgeDeployFailureArtifact(file, { schemaVersion: 'synthetic-overwrite' }), error => error?.code === 'EEXIST');
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { schemaVersion: 'synthetic-first' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('module import performs no deployment or artifact write', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pr264-edge-import-'));
  const moduleUrl = new URL('./prCControlledHumanEdgeDeploy.mjs', import.meta.url);
  assert.equal(moduleUrl.search, '');
  assert.equal(moduleUrl.hash, '');
  const snapshot = async (relative = '') => {
    const rows = [];
    for (const name of (await readdir(path.join(directory, relative))).sort()) {
      const entry = path.posix.join(relative, name);
      const absolute = path.join(directory, entry);
      const status = await lstat(absolute);
      assert.equal(status.isSymbolicLink(), false);
      if (status.isDirectory()) {
        rows.push({ path: entry, type: 'directory' }, ...await snapshot(entry));
      } else {
        assert.equal(status.isFile(), true);
        const bytes = await readFile(absolute);
        rows.push({ path: entry, type: 'file', size: bytes.length, sha256: sha256Digest(bytes) });
      }
    }
    return rows;
  };
  try {
    // Import reads both server-owned catalog migrations eagerly. Supply only
    // their exact canonical bytes, never a parallel action definition.
    const catalogMigrationPaths = [
      CONTROLLED_HUMAN_MIGRATION_PATH,
      'supabase/migrations/20260926053818_pr_c_synthetic_studio_provider_free_fixture.sql',
    ];
    for (const migrationPath of catalogMigrationPaths) {
      const migration = await readFile(path.join(root, migrationPath));
      const migrationFile = path.join(directory, migrationPath);
      await mkdir(path.dirname(migrationFile), { recursive: true });
      await writeFile(migrationFile, migration, { flag: 'wx' });
    }
    const before = await snapshot();
    assert.deepEqual(before.map(row => row.path), ['supabase', 'supabase/migrations', ...catalogMigrationPaths]);
    const childEnvironment = Object.fromEntries(
      ['SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'TMP', 'TEMP', 'TMPDIR']
        .filter(name => process.env[name] !== undefined)
        .map(name => [name, process.env[name]]),
    );
    for (const name of Object.keys(childEnvironment)) {
      assert.doesNotMatch(name, /NODE_|COVERAGE|SUPABASE|PROVIDER|TOKEN|SECRET|GITHUB|NETLIFY/iu);
    }
    const probe = `
      import assert from 'node:assert/strict';
      import childProcess from 'node:child_process';
      import fs from 'node:fs';
      import fsPromises from 'node:fs/promises';
      import http from 'node:http';
      import https from 'node:https';
      import net from 'node:net';
      import tls from 'node:tls';
      import { syncBuiltinESMExports } from 'node:module';
      let blocked = 0;
      const deny = () => { blocked += 1; throw new Error('IMPORT_SIDE_EFFECT_DENIED'); };
      for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) childProcess[name] = deny;
      const mutations = ['write', 'writeFile', 'appendFile', 'mkdir', 'mkdtemp', 'rm', 'rmdir', 'unlink', 'rename', 'copyFile', 'cp', 'truncate', 'chmod', 'chown', 'link', 'symlink', 'createWriteStream'];
      for (const name of mutations) {
        if (name in fs) fs[name] = deny;
        if ((name + 'Sync') in fs) fs[name + 'Sync'] = deny;
        if (name in fsPromises) fsPromises[name] = deny;
      }
      // Node's ESM loader also opens source files. Permit only exact read-only
      // opens; write/create/truncate and unknown flag combinations still fail.
      for (const [owner, name] of [[fs, 'open'], [fs, 'openSync'], [fsPromises, 'open']]) {
        const original = owner[name];
        owner[name] = function (file, flags, ...rest) {
          if (flags !== 'r' && flags !== 0) return deny();
          return original.call(this, file, flags, ...rest);
        };
      }
      for (const transport of [http, https]) { transport.request = deny; transport.get = deny; }
      net.connect = deny; net.createConnection = deny; net.Socket.prototype.connect = deny; tls.connect = deny;
      globalThis.fetch = deny;
      syncBuiltinESMExports();
      // Prove that the target's named ESM APIs see the traps, then require no
      // further attempts even if an imported module were to swallow an error.
      const { spawn } = await import('node:child_process');
      const { open, writeFile } = await import('node:fs/promises');
      assert.throws(() => spawn('forbidden'), /IMPORT_SIDE_EFFECT_DENIED/);
      assert.throws(() => open('forbidden', 'w'), /IMPORT_SIDE_EFFECT_DENIED/);
      assert.throws(() => writeFile('forbidden', ''), /IMPORT_SIDE_EFFECT_DENIED/);
      assert.throws(() => fetch('https://invalid.invalid'), /IMPORT_SIDE_EFFECT_DENIED/);
      assert.throws(() => net.Socket.prototype.connect(), /IMPORT_SIDE_EFFECT_DENIED/);
      const before = blocked;
      const imported = await import(${JSON.stringify(moduleUrl.href)});
      assert.equal(typeof imported.runControlledHumanEdgeDeploy, 'function');
      assert.equal(blocked, before);
      process.stdout.write('PR264_EDGE_IMPORT_NO_SIDE_EFFECTS\\n');
    `;
    // A fresh process tests real module evaluation without a query-string module
    // alias producing duplicate LCOV source records in the measured parent.
    const child = spawnSync(process.execPath, ['--input-type=module'], {
      cwd: directory, env: childEnvironment, input: probe, encoding: 'utf8', windowsHide: true,
      timeout: 10_000, maxBuffer: 64 * 1024,
    });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.signal, null);
    assert.equal(child.stdout, 'PR264_EDGE_IMPORT_NO_SIDE_EFFECTS\n');
    assert.equal(child.stderr, '');
    assert.deepEqual(await snapshot(), before);
    assert.equal(CONTROLLED_HUMAN_MIGRATION_TIP, '20260904120000');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
