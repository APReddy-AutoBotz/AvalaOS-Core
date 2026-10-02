import { spawn } from 'node:child_process';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  buildRequiredEdgeSourceManifest,
  canonicalDigest,
  CONTROLLED_HUMAN_MIGRATION_PATH,
  CONTROLLED_HUMAN_MIGRATION_TIP,
  CONTROLLED_HUMAN_PRIOR_MIGRATION_TIP,
  CONTROLLER_SCHEMA_VERSION,
  deriveControlledHumanPullRequestRuntime,
  EDGE_DEPLOY_JOB,
  ENVIRONMENT,
  REQUIRED_EDGE_FUNCTIONS,
  sha256Digest,
} from './prCControlledHumanEvidenceContract.mjs';
import { deriveContext, FIXTURE_PATH, loadFixture } from './prCControlledHumanEnvironment.mjs';

export const EDGE_DEPLOY_FAILURE_SCHEMA_VERSION = 'pr-c-controlled-human-edge-deploy-failure-1';
export const EDGE_DEPLOY_FAILURE_OUTPUT = 'output/controlled-human/edge-deploy-failure.json';
export const EDGE_DEPLOY_TIMEOUT_MS = 90_000;
export const EDGE_DEPLOY_OUTPUT_LIMIT_BYTES = 256 * 1024;
export const EDGE_DEPLOY_INPUT_LIMIT_BYTES = 1024 * 1024;
export const EDGE_DEPLOY_TERMINATION_CONFIRM_MS = 2_000;
export const EDGE_DEPLOY_FAILURE_CLASSIFICATIONS = Object.freeze([
  'dependency_resolution',
  'bundle_validation',
  'cli_auth',
  'provider_transport',
  'unknown',
  'output_limit',
  'timeout',
  'termination_unconfirmed',
]);

const SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const RUN_ID = /^[1-9][0-9]{0,19}$/u;
const DEPLOY_ID = /^[0-9a-f]{24}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const MIGRATION_PHASES = Object.freeze(['migration-preflight', 'migration-apply', 'migration-verify']);
const FORBIDDEN_SUPABASE_ENDPOINT_OVERRIDES = Object.freeze([
  'SUPABASE_API_URL', 'SUPABASE_URL', 'SUPABASE_DB_URL', 'SUPABASE_INTERNAL_API_URL',
  'SUPABASE_PROJECT_ID',
]);
const CHILD_RUNTIME_ENV = new Set([
  'PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT',
  'LANG', 'LC_ALL', 'CI', 'NO_COLOR', 'TERM',
]);

const fail = code => {
  const error = new Error(code);
  error.publicCode = 'PR_C_CONTROLLED_HUMAN_EDGE_DEPLOYMENT_REJECTED';
  throw error;
};

const exactKeys = (value, required, code) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...required].sort())) fail(code);
};

const exactContextKeys = Object.freeze([
  'contractVersion', 'phase', 'status', 'environmentClass', 'prNumber', 'releaseSha', 'reviewHeadSha',
  'deployId', 'deployOrigin', 'exerciseDigest', 'targetFingerprint', 'publicTargetDigest',
  'personaManifestDigest', 'fixtureManifestDigest', 'migrationTip', 'productionAuthorized',
  'customerDataAuthorized', 'realProviderCallsAuthorized',
]);

const migrationExtraKeys = Object.freeze({
  'migration-preflight': ['migrationDigest', 'priorMigrationTip', 'disposition', 'unexpectedDataCount', 'providerRowCount'],
  'migration-apply': ['replayed', 'migrationDigest', 'priorMigrationTip', 'unexpectedDataCount', 'providerRowCount'],
  'migration-verify': ['migrationDigest', 'priorMigrationTip', 'unexpectedDataCount', 'providerRowCount'],
});

const validateMigrationRecord = (record, phase, context, migrationDigest) => {
  exactKeys(record, [...exactContextKeys, ...migrationExtraKeys[phase]], `PR_C_CH_EDGE_DEPLOY_INPUT_${phase}`);
  if (record.contractVersion !== CONTROLLER_SCHEMA_VERSION || record.phase !== phase || record.status !== 'passed'
    || record.environmentClass !== ENVIRONMENT || record.prNumber !== 264
    || record.releaseSha !== context.releaseSha || record.reviewHeadSha !== context.reviewHeadSha
    || record.deployId !== context.deployId || record.deployOrigin !== context.deployOrigin
    || record.exerciseDigest !== context.exerciseDigest || record.targetFingerprint !== context.targetFingerprint
    || record.publicTargetDigest !== context.publicTargetDigest
    || record.personaManifestDigest !== context.personaManifestDigest || record.fixtureManifestDigest !== context.fixtureManifestDigest
    || record.migrationDigest !== migrationDigest || record.priorMigrationTip !== CONTROLLED_HUMAN_PRIOR_MIGRATION_TIP
    || record.migrationTip !== CONTROLLED_HUMAN_MIGRATION_TIP || record.unexpectedDataCount !== 0 || record.providerRowCount !== 0
    || record.productionAuthorized !== false || record.customerDataAuthorized !== false || record.realProviderCallsAuthorized !== false) {
    fail(`PR_C_CH_EDGE_DEPLOY_INPUT_${phase}`);
  }
  if (phase === 'migration-preflight' && !['exact_additive_apply', 'exact_replay'].includes(record.disposition)) fail('PR_C_CH_EDGE_DEPLOY_INPUT_PREFLIGHT');
  if (phase === 'migration-apply' && typeof record.replayed !== 'boolean') fail('PR_C_CH_EDGE_DEPLOY_INPUT_APPLY');
};

const validateProviderBaseline = baseline => {
  exactKeys(baseline, ['schemaVersion', 'observedAt', 'functions'], 'PR_C_CH_EDGE_DEPLOY_PROVIDER_BASELINE');
  if (baseline.schemaVersion !== 'pr-c-controlled-human-edge-provider-baseline-1'
    || !ISO_TIMESTAMP.test(baseline.observedAt) || !Number.isFinite(Date.parse(baseline.observedAt))
    || !Array.isArray(baseline.functions) || baseline.functions.length !== REQUIRED_EDGE_FUNCTIONS.length) {
    fail('PR_C_CH_EDGE_DEPLOY_PROVIDER_BASELINE');
  }
  baseline.functions.forEach((record, index) => {
    exactKeys(record, ['name', 'version', 'identityDigest', 'bundleDigest', 'updatedAtDigest'], 'PR_C_CH_EDGE_DEPLOY_PROVIDER_RECORD');
    if (record.name !== REQUIRED_EDGE_FUNCTIONS[index] || !Number.isSafeInteger(record.version) || record.version < 0
      || !DIGEST.test(record.identityDigest) || !DIGEST.test(record.bundleDigest) || !DIGEST.test(record.updatedAtDigest)) {
      fail('PR_C_CH_EDGE_DEPLOY_PROVIDER_RECORD');
    }
  });
  const digests = baseline.functions.flatMap(record => [record.identityDigest, record.bundleDigest, record.updatedAtDigest]);
  if (new Set(digests).size !== digests.length) fail('PR_C_CH_EDGE_DEPLOY_PROVIDER_DIGEST_REUSE');
};

const readBoundJson = async file => {
  let handle;
  let bytes;
  try {
    handle = await open(file, 'r');
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size <= 0 || stats.size > EDGE_DEPLOY_INPUT_LIMIT_BYTES) fail('PR_C_CH_EDGE_DEPLOY_INPUT_SIZE');
    const bounded = Buffer.alloc(EDGE_DEPLOY_INPUT_LIMIT_BYTES + 1);
    let length = 0;
    while (length < bounded.length) {
      const { bytesRead } = await handle.read(bounded, length, bounded.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length === 0 || length > EDGE_DEPLOY_INPUT_LIMIT_BYTES) fail('PR_C_CH_EDGE_DEPLOY_INPUT_SIZE');
    bytes = bounded.subarray(0, length);
  } finally { await handle?.close().catch(() => undefined); }
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { fail('PR_C_CH_EDGE_DEPLOY_INPUT_JSON'); }
  return Object.freeze({ value, digest: sha256Digest(bytes) });
};

export const writeEdgeDeployFailureArtifact = async (file, value) => {
  const output = path.resolve(file);
  await mkdir(path.dirname(output), { recursive: true });
  const handle = await open(output, 'wx', 0o600);
  let complete = false;
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    complete = true;
  } finally {
    if (!complete) {
      await handle.close().catch(() => undefined);
      await unlink(output).catch(() => undefined);
    }
  }
};

export function classifyEdgeDeployFailure({ stdout = '', stderr = '', errorMessage = '', errorCode = '', timedOut = false, outputLimited = false } = {}) {
  if (outputLimited) return 'output_limit';
  if (timedOut) return 'timeout';
  const sample = `${stdout}\n${stderr}\n${errorMessage}\n${errorCode}`.slice(0, EDGE_DEPLOY_OUTPUT_LIMIT_BYTES).toLowerCase();
  if (/(?:not logged in|unauthori[sz]ed|forbidden|access token|authentication|invalid token|status(?: code)?[: ]+(?:401|403)|http (?:401|403))/u.test(sample)) return 'cli_auth';
  if (/(?:module not found|cannot find module|failed to resolve|could not resolve|relative import path|import map|npm package|jsr package|dependency)/u.test(sample)) return 'dependency_resolution';
  if (/(?:bundle|bundling|compile|syntaxerror|typeerror:.*(?:parse|compile)|eszip|invalid typescript|unexpected token)/u.test(sample)) return 'bundle_validation';
  if (/(?:network|dns|econn|enotfound|socket|tls|certificate|connection|transport|fetch failed|bad gateway|service unavailable|gateway timeout|status(?: code)?[: ]+5\d\d|http 5\d\d)/u.test(sample)) return 'provider_transport';
  return 'unknown';
}

const validateDeploymentTarget = (env, context) => {
  if (FORBIDDEN_SUPABASE_ENDPOINT_OVERRIDES.some(name => env[name] !== undefined)) fail('PR_C_CH_EDGE_DEPLOY_ENDPOINT_OVERRIDE');
  const projectRef = env.SUPABASE_PROJECT_REF;
  let endpoint;
  try { endpoint = new URL(env.PR_C_CONTROLLED_HUMAN_SUPABASE_URL); } catch { fail('PR_C_CH_EDGE_DEPLOY_TARGET'); }
  const origin = `https://${projectRef}.supabase.co`;
  if (!/^[a-z0-9]{20}$/u.test(projectRef ?? '') || endpoint.origin !== origin || endpoint.protocol !== 'https:'
    || endpoint.hostname !== `${projectRef}.supabase.co` || endpoint.port || endpoint.username || endpoint.password
    || endpoint.pathname !== '/' || endpoint.search || endpoint.hash
    || sha256Digest(`pr-c-controlled-human-public-target\0${origin}`) !== context.publicTargetDigest) {
    fail('PR_C_CH_EDGE_DEPLOY_TARGET');
  }
  return projectRef;
};

export function runBoundedSupabaseDeploy({
  functionName,
  projectRef,
  env,
  spawnImpl = spawn,
  timeoutMs = EDGE_DEPLOY_TIMEOUT_MS,
  outputLimitBytes = EDGE_DEPLOY_OUTPUT_LIMIT_BYTES,
} = {}) {
  if (!REQUIRED_EDGE_FUNCTIONS.includes(functionName) || !/^[a-z0-9]{20}$/u.test(projectRef ?? '')
    || typeof env?.SUPABASE_ACCESS_TOKEN !== 'string' || env.SUPABASE_ACCESS_TOKEN.length < 20
    || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || !Number.isSafeInteger(outputLimitBytes) || outputLimitBytes <= 0) {
    fail('PR_C_CH_EDGE_DEPLOY_RUNNER_INPUT');
  }
  return new Promise(resolve => {
    let child;
    let finished = false;
    let terminationCause = null;
    let childError = null;
    let operationTimer;
    let terminationTimer;
    let capturedBytes = 0;
    const chunks = [];
    const finish = ({ code = null, signal = null, errorCode = '', errorMessage = '', classification } = {}) => {
      if (finished) return;
      finished = true;
      clearTimeout(operationTimer);
      clearTimeout(terminationTimer);
      const output = Buffer.concat(chunks).toString('utf8');
      const resolvedClassification = classification ?? (code === 0 && !signal && !errorCode && !terminationCause
        ? null
        : classifyEdgeDeployFailure({
          stdout: output,
          errorMessage,
          errorCode,
          timedOut: terminationCause === 'timeout',
          outputLimited: terminationCause === 'output_limit',
        }));
      resolve({
        ok: resolvedClassification === null,
        classification: resolvedClassification,
      });
    };
    const finishFromClose = (code, signal) => {
      if (terminationCause === 'child_error') {
        finish({ code, signal, errorCode: childError?.code, errorMessage: childError?.message });
        return;
      }
      finish({ code, signal });
    };
    const requestTermination = cause => {
      if (finished || terminationCause !== null) return;
      terminationCause = cause;
      clearTimeout(operationTimer);
      let killAccepted = false;
      try { killAccepted = child?.kill('SIGKILL') === true; } catch { /* close remains the only confirmation */ }
      if (finished) return;
      terminationTimer = setTimeout(() => {
        finish({ classification: 'termination_unconfirmed' });
      }, Math.max(100, Math.min(EDGE_DEPLOY_TERMINATION_CONFIRM_MS, timeoutMs)));
      if (!killAccepted) {
        // A false/throwing kill result is not proof that the process stopped. The
        // bounded close-confirmation interval still permits a concurrent close.
      }
    };
    const capture = chunk => {
      if (finished || terminationCause !== null) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = outputLimitBytes - capturedBytes;
      if (buffer.length > remaining) {
        if (remaining > 0) chunks.push(buffer.subarray(0, remaining));
        capturedBytes = outputLimitBytes;
        requestTermination('output_limit');
        return;
      }
      chunks.push(buffer);
      capturedBytes += buffer.length;
    };
    operationTimer = setTimeout(() => requestTermination('timeout'), timeoutMs);
    try {
      if (FORBIDDEN_SUPABASE_ENDPOINT_OVERRIDES.some(name => env[name] !== undefined)) fail('PR_C_CH_EDGE_DEPLOY_ENDPOINT_OVERRIDE');
      const childEnv = Object.fromEntries(Object.entries(env).filter(([name]) => CHILD_RUNTIME_ENV.has(name.toUpperCase())));
      childEnv.SUPABASE_ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN;
      childEnv.SUPABASE_PROJECT_REF = projectRef;
      child = spawnImpl('supabase', ['functions', 'deploy', functionName, '--project-ref', projectRef], {
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      child.stdout?.on('data', capture);
      child.stderr?.on('data', capture);
      child.on('error', error => {
        childError = { code: String(error?.code ?? ''), message: String(error?.message ?? '') };
        if (terminationCause !== null) return;
        if (Number.isSafeInteger(child?.pid) && child.pid > 0) {
          requestTermination('child_error');
          return;
        }
        // A failed spawn has no child process whose close must be confirmed.
        finish({ errorCode: childError.code, errorMessage: childError.message });
      });
      child.once('close', finishFromClose);
    } catch (error) {
      finish({ errorCode: String(error?.code ?? ''), errorMessage: String(error?.message ?? '') });
    }
  });
}

const expectedFailureKeys = Object.freeze([
  'schemaVersion', 'status', 'environmentClass', 'prNumber', 'releaseSha', 'reviewHeadSha', 'deployId',
  'exerciseDigest', 'targetFingerprint', 'publicTargetDigest', 'personaManifestDigest', 'fixtureManifestDigest',
  'migrationTip', 'edgeSourceManifestDigest', 'failedFunction', 'classification', 'deploymentOutcome', 'retryAttempted', 'inputDigests', 'producer',
  'productionAuthorized', 'customerDataAuthorized', 'realProviderCallsAuthorized',
]);
const expectedContextKeys = Object.freeze([
  'releaseSha', 'reviewHeadSha', 'deployId', 'exerciseDigest', 'targetFingerprint', 'publicTargetDigest',
  'personaManifestDigest', 'fixtureManifestDigest', 'migrationTip', 'edgeSourceManifestDigest',
  'failedFunction', 'classification', 'deploymentOutcome', 'retryAttempted', 'inputDigests.migrationPreflight', 'inputDigests.migrationApply',
  'inputDigests.migrationVerify', 'inputDigests.providerBaseline', 'producer.workflowPath', 'producer.job',
  'producer.event', 'producer.runId', 'producer.runAttempt', 'producer.artifactName',
]);

export function validateEdgeDeployFailureDiagnostic(value, expected) {
  exactKeys(value, expectedFailureKeys, 'PR_C_CH_EDGE_DEPLOY_FAILURE_ARTIFACT');
  exactKeys(value.inputDigests, ['migrationPreflight', 'migrationApply', 'migrationVerify', 'providerBaseline'], 'PR_C_CH_EDGE_DEPLOY_FAILURE_DIGESTS');
  exactKeys(value.producer, ['workflowPath', 'job', 'event', 'runId', 'runAttempt', 'conclusion', 'artifactName'], 'PR_C_CH_EDGE_DEPLOY_FAILURE_PRODUCER');
  if (value.schemaVersion !== EDGE_DEPLOY_FAILURE_SCHEMA_VERSION || value.status !== 'failed' || value.environmentClass !== ENVIRONMENT || value.prNumber !== 264
    || !SHA.test(value.releaseSha) || value.reviewHeadSha !== value.releaseSha || !DEPLOY_ID.test(value.deployId)
    || !DIGEST.test(value.exerciseDigest) || !DIGEST.test(value.targetFingerprint) || !DIGEST.test(value.publicTargetDigest)
    || !DIGEST.test(value.personaManifestDigest) || !DIGEST.test(value.fixtureManifestDigest) || value.migrationTip !== CONTROLLED_HUMAN_MIGRATION_TIP
    || !DIGEST.test(value.edgeSourceManifestDigest) || !REQUIRED_EDGE_FUNCTIONS.includes(value.failedFunction)
    || !EDGE_DEPLOY_FAILURE_CLASSIFICATIONS.includes(value.classification) || Object.values(value.inputDigests).some(digest => !DIGEST.test(digest))
    || !['unknown_unattested', 'unknown_after_timeout', 'unknown_after_output_limit', 'unknown_after_unconfirmed_termination'].includes(value.deploymentOutcome) || value.retryAttempted !== false
    || value.producer.workflowPath !== '.github/workflows/transcript-flow-pr-c.yml' || value.producer.job !== EDGE_DEPLOY_JOB
    || value.producer.event !== 'pull_request' || !RUN_ID.test(value.producer.runId) || !Number.isSafeInteger(value.producer.runAttempt) || value.producer.runAttempt <= 0
    || value.producer.conclusion !== 'failure'
    || value.producer.artifactName !== `pr264-controlled-human-edge-deploy-failure-${value.releaseSha}-${value.producer.runId}-${value.producer.runAttempt}`
    || value.productionAuthorized !== false || value.customerDataAuthorized !== false || value.realProviderCallsAuthorized !== false) {
    fail('PR_C_CH_EDGE_DEPLOY_FAILURE_ARTIFACT');
  }
  exactKeys(expected, expectedContextKeys, 'PR_C_CH_EDGE_DEPLOY_FAILURE_EXPECTED_CONTEXT');
  if (Object.entries(expected).some(([key, wanted]) => {
    const actual = key.startsWith('producer.') ? value.producer[key.slice('producer.'.length)]
      : key.startsWith('inputDigests.') ? value.inputDigests[key.slice('inputDigests.'.length)] : value[key];
    return actual !== wanted;
  })) fail('PR_C_CH_EDGE_DEPLOY_FAILURE_EXPECTED_CONTEXT');
  return value;
}

export async function runControlledHumanEdgeDeploy({
  argv = process.argv.slice(2),
  env = process.env,
  root = process.cwd(),
  checkout,
  runner = runBoundedSupabaseDeploy,
  writeFailureArtifact = writeEdgeDeployFailureArtifact,
} = {}) {
  const expectedArguments = ['--migration-preflight', '--migration-apply', '--migration-verify', '--provider-baseline', '--failure-output'];
  if (argv.length !== 10 || expectedArguments.some((flag, index) => argv[index * 2] !== flag)
    || argv[9] !== EDGE_DEPLOY_FAILURE_OUTPUT) fail('PR_C_CH_EDGE_DEPLOY_ARGUMENTS');
  const runtime = deriveControlledHumanPullRequestRuntime(env, EDGE_DEPLOY_JOB);
  if (env.PR_C_CONTROLLED_HUMAN_EDGE_WORKFLOW_PATH !== runtime.workflowPath) fail('PR_C_CH_EDGE_DEPLOY_WORKFLOW');
  const fixtureState = await loadFixture(path.join(root, FIXTURE_PATH), root);
  const context = deriveContext(env, fixtureState, checkout);
  const migrationDigest = sha256Digest(await readFile(path.join(root, CONTROLLED_HUMAN_MIGRATION_PATH)));
  const inputs = {};
  for (let index = 0; index < MIGRATION_PHASES.length; index += 1) {
    const phase = MIGRATION_PHASES[index];
    const input = await readBoundJson(argv[index * 2 + 1]);
    validateMigrationRecord(input.value, phase, context, migrationDigest);
    inputs[phase] = input;
  }
  const baseline = await readBoundJson(argv[7]);
  validateProviderBaseline(baseline.value);
  const inputDigests = Object.freeze({
    migrationPreflight: inputs['migration-preflight'].digest,
    migrationApply: inputs['migration-apply'].digest,
    migrationVerify: inputs['migration-verify'].digest,
    providerBaseline: baseline.digest,
  });
  const edgeSourceManifestDigest = canonicalDigest(buildRequiredEdgeSourceManifest(root));
  const projectRef = validateDeploymentTarget(env, context);
  if (typeof env.SUPABASE_ACCESS_TOKEN !== 'string' || env.SUPABASE_ACCESS_TOKEN.length < 20) fail('PR_C_CH_EDGE_DEPLOY_AUTHORITY');
  for (const functionName of REQUIRED_EDGE_FUNCTIONS) {
    const outcome = await runner({ functionName, projectRef, env });
    if (!outcome || typeof outcome.ok !== 'boolean' || (outcome.ok ? outcome.classification !== null : !EDGE_DEPLOY_FAILURE_CLASSIFICATIONS.includes(outcome.classification))) {
      fail('PR_C_CH_EDGE_DEPLOY_RUNNER_RESULT');
    }
    if (outcome.ok) continue;
    const artifact = {
      schemaVersion: EDGE_DEPLOY_FAILURE_SCHEMA_VERSION,
      status: 'failed',
      environmentClass: context.environmentClass,
      prNumber: context.prNumber,
      releaseSha: context.releaseSha,
      reviewHeadSha: context.reviewHeadSha,
      deployId: context.deployId,
      exerciseDigest: context.exerciseDigest,
      targetFingerprint: context.targetFingerprint,
      publicTargetDigest: context.publicTargetDigest,
      personaManifestDigest: context.personaManifestDigest,
      fixtureManifestDigest: context.fixtureManifestDigest,
      migrationTip: context.migrationTip,
      edgeSourceManifestDigest,
      failedFunction: functionName,
      classification: outcome.classification,
      deploymentOutcome: outcome.classification === 'timeout' ? 'unknown_after_timeout'
        : outcome.classification === 'output_limit' ? 'unknown_after_output_limit'
          : outcome.classification === 'termination_unconfirmed' ? 'unknown_after_unconfirmed_termination' : 'unknown_unattested',
      retryAttempted: false,
      inputDigests,
      producer: {
        ...runtime,
        conclusion: 'failure',
        artifactName: `pr264-controlled-human-edge-deploy-failure-${context.releaseSha}-${runtime.runId}-${runtime.runAttempt}`,
      },
      productionAuthorized: false,
      customerDataAuthorized: false,
      realProviderCallsAuthorized: false,
    };
    validateEdgeDeployFailureDiagnostic(artifact, {
      releaseSha: context.releaseSha,
      reviewHeadSha: context.reviewHeadSha,
      deployId: context.deployId,
      exerciseDigest: context.exerciseDigest,
      targetFingerprint: context.targetFingerprint,
      publicTargetDigest: context.publicTargetDigest,
      edgeSourceManifestDigest,
      failedFunction: functionName,
      classification: outcome.classification,
      deploymentOutcome: artifact.deploymentOutcome,
      retryAttempted: false,
      personaManifestDigest: context.personaManifestDigest,
      fixtureManifestDigest: context.fixtureManifestDigest,
      migrationTip: context.migrationTip,
      'producer.workflowPath': runtime.workflowPath,
      'producer.job': runtime.job,
      'producer.event': runtime.event,
      'producer.runId': runtime.runId,
      'producer.runAttempt': runtime.runAttempt,
      'producer.artifactName': artifact.producer.artifactName,
      ...Object.fromEntries(Object.entries(inputDigests).map(([key, value]) => [`inputDigests.${key}`, value])),
    });
    await writeFailureArtifact(argv[9], artifact);
    const error = new Error('PR_C_CH_EDGE_DEPLOY_FAILED');
    error.publicCode = 'PR_C_CONTROLLED_HUMAN_EDGE_DEPLOYMENT_FAILED';
    throw error;
  }
  return Object.freeze({ status: 'commands_completed_unattested', functionCount: REQUIRED_EDGE_FUNCTIONS.length });
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  try {
    const result = await runControlledHumanEdgeDeploy({ argv, env });
    process.stdout.write('PR_C_CONTROLLED_HUMAN_EDGE_COMMANDS_COMPLETED_UNATTESTED\n');
    return result;
  } catch (error) {
    process.stderr.write(`${error?.publicCode ?? 'PR_C_CONTROLLED_HUMAN_EDGE_DEPLOYMENT_REJECTED'}\n`);
    process.exitCode = 1;
    return null;
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) await main();
