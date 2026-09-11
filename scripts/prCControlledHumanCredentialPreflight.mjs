import { createHmac, timingSafeEqual } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bootstrapCheckoutIdentity, buildControlledHumanBootstrapBindings } from './derivePrCControlledHumanBootstrap.mjs';
import { canonicalJson, loadFixture, sha256, validateSupabaseTargetTuple } from './prCControlledHumanEnvironment.mjs';
import { loadMigration, PostgresEnvironmentMigrationAdapter } from './prCControlledHumanEnvironmentMigration.mjs';
import { loadPinnedSupabaseRootCa } from './prCControlledHumanPostgresTls.mjs';
import { CONTROLLED_HUMAN_PHASE_SECRETS, validateControlledHumanWorkflowSecrets } from './prCControlledHumanWorkflowSecrets.mjs';
import { calculatePrCWorkingTreeDigest, collectChangedPrCFiles, PR_C_BASE_SHA, PR_C_WORKFLOW_PATH } from './transcriptFlowPrCEvidenceScope.mjs';

export const PREFLIGHT_SCHEMA = 'pr264-controlled-human-credential-preflight-1';
export const PREFLIGHT_JOB = 'controlled_human_credentials_preflight';
export const PREFLIGHT_LABEL = 'pr264-controlled-human-credentials-preflight';
export const PREFLIGHT_OUTPUT = 'output/pr-c-controlled-human-credential-preflight';
export const PREFLIGHT_FILE = 'credential-preflight.json';
export const PREFLIGHT_COMMAND = 'node scripts/prCControlledHumanCredentialPreflight.mjs';
export const PREFLIGHT_FAILURE_PHASES = Object.freeze({
  entryArguments: 'ENTRY_ARGUMENTS',
  outputPath: 'OUTPUT_PATH',
  sourceIdentity: 'SOURCE_IDENTITY',
  eventAuthority: 'EVENT_AUTHORITY',
  fixture: 'FIXTURE',
  nonPatRequiredFields: 'NONPAT_REQUIRED_FIELDS',
  nonPatForbiddenCredential: 'NONPAT_FORBIDDEN_CREDENTIAL',
  nonPatSigningAuthority: 'NONPAT_SIGNING_AUTHORITY',
  nonPatTargetTuple: 'NONPAT_TARGET_TUPLE',
  nonPatPasswordJson: 'NONPAT_PASSWORD_JSON',
  nonPatPasswordPersonaSet: 'NONPAT_PASSWORD_PERSONA_SET',
  nonPatPasswordValues: 'NONPAT_PASSWORD_VALUES',
  migration: 'MIGRATION',
  pinnedCa: 'PINNED_CA',
  databaseConfiguration: 'DATABASE_CONFIGURATION',
  databaseConnect: 'DATABASE_CONNECT',
  databaseBeginReadOnly: 'DATABASE_BEGIN_READ_ONLY',
  databaseVerifyReadOnly: 'DATABASE_VERIFY_READ_ONLY',
  databaseTimeouts: 'DATABASE_TIMEOUTS',
  databaseInventory: 'DATABASE_INVENTORY',
  databaseRollback: 'DATABASE_ROLLBACK',
  databaseClose: 'DATABASE_CLOSE',
  bootstrapBinding: 'BOOTSTRAP_BINDING',
  preview: 'PREVIEW',
  sourceRecheck: 'SOURCE_RECHECK',
  report: 'REPORT',
  artifactWrite: 'ARTIFACT_WRITE',
});
const REPOSITORY = 'APReddy-AutoBotz/AvalaOS-Core';
const BRANCH = 'controller/governed-delivery-monitor-pr-c-20260831';
const PREVIEW = 'https://deploy-preview-264--avalaos-pilot.netlify.app';
const ENVIRONMENT = 'hosted-nonproduction-pilot';
const REF = 'refs/pull/264/merge';
const SHA = /^[0-9a-f]{40}$/u;
const HEX_DIGEST = /^[0-9a-f]{64}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const HMAC = /^hmac-sha256:[0-9a-f]{64}$/u;
const RUN = /^[1-9][0-9]{0,19}$/u;
const DEPLOY = /^[0-9a-f]{24}$/u;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.]\d{3}Z$/u;
const DOMAIN = 'avalaos/pr264/credential-transport/preflight/v1\0';
const IDENTITY_KEYS = ['repository', 'workflowPath', 'workflowRef', 'jobKey', 'event', 'command', 'nodeMajor', 'exactHead', 'baseSha', 'runId', 'runAttempt', 'ciRunId', 'ciRunAttempt', 'ciArtifactName', 'ciArtifactDigest', 'deployId', 'previewOrigin', 'environmentName', 'environmentClass', 'exerciseDigest', 'targetFingerprint', 'publicTargetDigest', 'governedFileCount', 'governedWorkingTreeDigest'];
const CHECKS = Object.freeze({ requiredNonPatFieldsPresent: true, passwordBundleStructureValid: true, sourceUnchanged: true, pinnedTls: true, exactTargetAndExercise: true, priorTipAndEmptySyntheticState: true, databaseTransactionReadOnly: true, databaseTransactionRolledBack: true, previewIdentityValid: true });
const NOT_RUN = Object.freeze(['deployment', 'human-testing', 'service-credential-authentication', 'temporary-token-authentication', 'real-provider-verification']);
const ZERO_MUTATIONS = Object.freeze({ migrations: 0, databaseWrites: 0, authMutations: 0, functionDeployments: 0, providerCalls: 0 });
const fail = code => { throw new Error(`PR264_CREDENTIAL_PREFLIGHT_REJECTED:${code}`); };
const PREFLIGHT_FAILURE_PHASE_ALLOWLIST = Object.freeze(Object.values(PREFLIGHT_FAILURE_PHASES));
let activeFailurePhase = PREFLIGHT_FAILURE_PHASES.entryArguments;
export const validatePreflightFailurePhase = phase => {
  if (typeof phase !== 'string' || !PREFLIGHT_FAILURE_PHASE_ALLOWLIST.includes(phase)) fail('failure-phase');
  return phase;
};
const enterFailurePhase = phase => { activeFailurePhase = validatePreflightFailurePhase(phase); };
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const exactKeys = (value, keys, code) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !same(Object.keys(value).sort(), [...keys].sort())) fail(code);
};
const positive = value => Number.isSafeInteger(value) && value > 0;
const trusted = value => typeof value === 'string' && value.toLowerCase() === 'apreddy-autobotz';

export function validatePreflightIdentity(identity) {
  exactKeys(identity, IDENTITY_KEYS, 'identity-shape');
  if (identity.repository !== REPOSITORY || identity.workflowPath !== PR_C_WORKFLOW_PATH
    || identity.workflowRef !== `${REPOSITORY}/${PR_C_WORKFLOW_PATH}@${REF}` || identity.jobKey !== PREFLIGHT_JOB
    || identity.event !== 'pull_request' || identity.command !== PREFLIGHT_COMMAND || identity.nodeMajor !== 22
    || !SHA.test(identity.exactHead) || identity.baseSha !== PR_C_BASE_SHA
    || !RUN.test(identity.runId) || !positive(identity.runAttempt) || !RUN.test(identity.ciRunId)
    || identity.runId === identity.ciRunId || !positive(identity.ciRunAttempt)
    || identity.ciArtifactName !== `governed-delivery-monitor-pr-c-${identity.ciRunId}-${identity.ciRunAttempt}`
    || !DIGEST.test(identity.ciArtifactDigest) || !DEPLOY.test(identity.deployId)
    || identity.previewOrigin !== PREVIEW || identity.environmentName !== ENVIRONMENT
    || identity.environmentClass !== 'hosted_nonproduction_pilot' || !DIGEST.test(identity.exerciseDigest)
    || !DIGEST.test(identity.targetFingerprint) || !DIGEST.test(identity.publicTargetDigest)
    || !positive(identity.governedFileCount) || !HEX_DIGEST.test(identity.governedWorkingTreeDigest)) fail('identity');
  return identity;
}

export function derivePreflightIdentity(env, event, source) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'pull_request' || env.GITHUB_REPOSITORY !== REPOSITORY
    || env.GITHUB_REF !== REF || env.GITHUB_HEAD_REF !== BRANCH || env.GITHUB_BASE_REF !== 'main'
    || env.GITHUB_WORKFLOW_REF !== `${REPOSITORY}/${PR_C_WORKFLOW_PATH}@${REF}` || env.GITHUB_JOB !== PREFLIGHT_JOB
    || !trusted(env.GITHUB_ACTOR) || !trusted(env.GITHUB_TRIGGERING_ACTOR) || !trusted(event?.sender?.login)
    || event?.action !== 'labeled' || event?.label?.name !== PREFLIGHT_LABEL || event?.pull_request?.number !== 264
    || event.pull_request.head?.repo?.full_name !== REPOSITORY || event.pull_request.head?.ref !== BRANCH
    || event.pull_request.base?.repo?.full_name !== REPOSITORY || event.pull_request.base?.ref !== 'main'
    || event.pull_request.state !== 'open' || event.pull_request.head?.sha !== env.PR_C_CONTROLLED_HUMAN_RELEASE_SHA
    || env.PR_C_CONTROLLED_HUMAN_RELEASE_SHA !== env.PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA
    || source?.head !== env.PR_C_CONTROLLED_HUMAN_RELEASE_SHA || source?.dirty !== ''
    || env.PR_C_CONTROLLED_HUMAN_PR_NUMBER !== '264') fail('runtime-authority');
  return Object.freeze(validatePreflightIdentity({
    repository: env.GITHUB_REPOSITORY, workflowPath: PR_C_WORKFLOW_PATH, workflowRef: env.GITHUB_WORKFLOW_REF,
    jobKey: env.GITHUB_JOB, event: env.GITHUB_EVENT_NAME, command: source.command, nodeMajor: source.nodeMajor, exactHead: source.head, baseSha: PR_C_BASE_SHA,
    runId: env.GITHUB_RUN_ID, runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
    ciRunId: env.PR_C_CONTROLLED_HUMAN_CI_RUN_ID, ciRunAttempt: Number(env.PR_C_CONTROLLED_HUMAN_CI_RUN_ATTEMPT),
    ciArtifactName: env.PR_C_CONTROLLED_HUMAN_CI_ARTIFACT_NAME, ciArtifactDigest: env.PR_C_CONTROLLED_HUMAN_CI_ARTIFACT_DIGEST,
    deployId: env.PR_C_CONTROLLED_HUMAN_DEPLOY_ID, previewOrigin: env.PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN,
    environmentName: ENVIRONMENT, environmentClass: env.PR_C_CONTROLLED_HUMAN_ENVIRONMENT_CLASS,
    exerciseDigest: env.PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST, targetFingerprint: env.PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT,
    publicTargetDigest: env.PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST,
    governedFileCount: source.governedFileCount, governedWorkingTreeDigest: source.governedWorkingTreeDigest,
  }));
}

export function validateNonPatPreflightInputs(env, fixtureState) {
  const values = Object.fromEntries(CONTROLLED_HUMAN_PHASE_SECRETS.preflight.map(name => [name, env[name]]));
  enterFailurePhase(PREFLIGHT_FAILURE_PHASES.nonPatRequiredFields);
  validateControlledHumanWorkflowSecrets('preflight', values, { exact: true });
  // Never load a deployment PAT or a provider credential into this phase.
  const forbidden = /^(?:(?:PR_C_CONTROLLED_HUMAN_)?SUPABASE_ACCESS_TOKEN|(?:VITE_)?(?:OPENAI|GROQ|ANTHROPIC|GOOGLE|GEMINI|MISTRAL|COHERE|DEEPSEEK|XAI)_API_KEY)$/u;
  enterFailurePhase(PREFLIGHT_FAILURE_PHASES.nonPatForbiddenCredential);
  if (Object.keys(env).some(name => forbidden.test(name) && typeof env[name] === 'string' && env[name].trim() !== '')) fail('forbidden-credential');
  enterFailurePhase(PREFLIGHT_FAILURE_PHASES.nonPatSigningAuthority);
  const key = env.PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY;
  if (key.trim() !== key || key.length < 32 || key.length > 4096) fail('signing-authority');
  enterFailurePhase(PREFLIGHT_FAILURE_PHASES.nonPatTargetTuple);
  validateSupabaseTargetTuple(env.PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF, env.PR_C_CONTROLLED_HUMAN_SUPABASE_URL,
    env.PR_C_CONTROLLED_HUMAN_DATABASE_URL, env.PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST);
  let bundle;
  enterFailurePhase(PREFLIGHT_FAILURE_PHASES.nonPatPasswordJson);
  try { bundle = JSON.parse(env.PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_JSON); } catch { fail('bundle-structure'); }
  enterFailurePhase(PREFLIGHT_FAILURE_PHASES.nonPatPasswordPersonaSet);
  exactKeys(bundle, fixtureState.personas.map(persona => persona.key), 'bundle-structure');
  enterFailurePhase(PREFLIGHT_FAILURE_PHASES.nonPatPasswordValues);
  const passwords = Object.values(bundle);
  if (new Set(passwords).size !== passwords.length || passwords.some(value => typeof value !== 'string' || value.length < 16 || value.length > 128)) fail('bundle-structure');
  // Presence is the only service-credential claim here. Its actual Admin API
  // authentication is a separate prepare gate and explicitly remains not run.
  return Object.freeze({ requiredNonPatFieldsPresent: true, passwordBundleStructureValid: true });
}

export async function inspectPreflightTargetReadOnly(adapter) {
  let transactionStarted = false;
  let inventory;
  let hasPrimaryFailure = false;
  let primaryError;
  try {
    enterFailurePhase(PREFLIGHT_FAILURE_PHASES.databaseConnect);
    await adapter.connect();
    enterFailurePhase(PREFLIGHT_FAILURE_PHASES.databaseBeginReadOnly);
    await adapter.client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transactionStarted = true;
    enterFailurePhase(PREFLIGHT_FAILURE_PHASES.databaseVerifyReadOnly);
    const result = await adapter.client.query('SHOW transaction_read_only');
    if (result.rows?.length !== 1 || result.rows[0]?.transaction_read_only !== 'on') fail('read-only-transaction');
    enterFailurePhase(PREFLIGHT_FAILURE_PHASES.databaseTimeouts);
    await adapter.client.query("SET LOCAL statement_timeout = '15000ms'");
    await adapter.client.query("SET LOCAL idle_in_transaction_session_timeout = '20000ms'");
    enterFailurePhase(PREFLIGHT_FAILURE_PHASES.databaseInventory);
    inventory = await adapter.inspect();
  } catch (error) {
    hasPrimaryFailure = true;
    primaryError = error;
  }
  if (transactionStarted) {
    if (!hasPrimaryFailure) enterFailurePhase(PREFLIGHT_FAILURE_PHASES.databaseRollback);
    try { await adapter.client.query('ROLLBACK'); }
    catch (error) {
      if (!hasPrimaryFailure) {
        hasPrimaryFailure = true;
        primaryError = error;
      }
    }
    transactionStarted = false;
  }
  if (!hasPrimaryFailure) enterFailurePhase(PREFLIGHT_FAILURE_PHASES.databaseClose);
  try { await adapter.close(); }
  catch (error) {
    if (!hasPrimaryFailure) {
      hasPrimaryFailure = true;
      primaryError = error;
    }
  }
  if (hasPrimaryFailure) throw primaryError;
  return { inventory, databaseTransactionReadOnly: true, databaseTransactionRolledBack: true };
}

export async function observePreflightPreview(identity, fetchImpl = fetch) {
  validatePreflightIdentity(identity);
  const response = await fetchImpl(PREVIEW, { redirect: 'error', headers: { Accept: 'text/html', 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15_000) });
  try {
    if (response.status !== 200 || response.headers.get('x-avalaos-release') !== identity.exactHead
      || response.headers.get('x-avalaos-environment') !== identity.environmentClass
      || response.headers.get('x-avalaos-netlify-deploy-id') !== identity.deployId) fail('preview-identity');
    return Object.freeze({ previewIdentityValid: true });
  } finally { await response.body?.cancel(); }
}

const validateUnsigned = unsigned => {
  exactKeys(unsigned, ['schemaVersion', 'status', 'identity', 'bootstrapDigest', 'priorMigrationTip', 'checks', 'zeroMutations', 'notRun', 'observedAt'], 'report-shape');
  validatePreflightIdentity(unsigned.identity);
  if (unsigned.schemaVersion !== PREFLIGHT_SCHEMA || unsigned.status !== 'credential_transport_passed'
    || !DIGEST.test(unsigned.bootstrapDigest) || unsigned.priorMigrationTip !== '20260831062024'
    || !same(unsigned.checks, CHECKS) || !same(unsigned.zeroMutations, ZERO_MUTATIONS) || !same(unsigned.notRun, NOT_RUN)
    || !TIMESTAMP.test(unsigned.observedAt) || !Number.isFinite(Date.parse(unsigned.observedAt))) fail('report');
};
const signatureFor = (unsigned, key) => {
  if (typeof key !== 'string' || key.trim() !== key || key.length < 32 || key.length > 4096) fail('signing-authority');
  return `hmac-sha256:${createHmac('sha256', key).update(DOMAIN).update(canonicalJson(unsigned)).digest('hex')}`;
};

export function createCredentialPreflightReport({ identity, bootstrap, inputChecks, databaseChecks, previewChecks, sourceUnchanged, pinnedTls, observedAt, signingKey }) {
  const { bootstrapDigest, ...bootstrapPayload } = bootstrap ?? {};
  if (bootstrapDigest !== sha256(bootstrapPayload) || bootstrap.exactHead !== identity.exactHead
    || bootstrap.reviewHeadSha !== identity.exactHead || bootstrap.exerciseDigest !== identity.exerciseDigest
    || bootstrap.targetFingerprint !== identity.targetFingerprint || bootstrap.publicTargetDigest !== identity.publicTargetDigest
    || bootstrap.status !== 'bindings_derived' || bootstrap.productionAuthorized !== false
    || bootstrap.customerDataAuthorized !== false || bootstrap.realProviderCallsAuthorized !== false) fail('bootstrap-binding');
  const unsigned = {
    schemaVersion: PREFLIGHT_SCHEMA, status: 'credential_transport_passed', identity,
    bootstrapDigest, priorMigrationTip: bootstrap.priorMigrationTip,
    checks: { ...inputChecks, ...databaseChecks, ...previewChecks, sourceUnchanged, pinnedTls,
      exactTargetAndExercise: true, priorTipAndEmptySyntheticState: true },
    zeroMutations: ZERO_MUTATIONS, notRun: NOT_RUN, observedAt,
  };
  validateUnsigned(unsigned);
  return Object.freeze({ ...unsigned, signature: signatureFor(unsigned, signingKey) });
}

export function verifyCredentialPreflightReport(report, expected, signingKey) {
  exactKeys(report, ['schemaVersion', 'status', 'identity', 'bootstrapDigest', 'priorMigrationTip', 'checks', 'zeroMutations', 'notRun', 'observedAt', 'signature'], 'signed-report-shape');
  const { signature, ...unsigned } = report;
  validateUnsigned(unsigned);
  exactKeys(expected, ['identity', 'bootstrapDigest', 'runStartedAt', 'runCompletedAt'], 'independent-binding');
  validatePreflightIdentity(expected.identity);
  if (!same(expected.identity, report.identity) || !DIGEST.test(expected.bootstrapDigest) || expected.bootstrapDigest !== report.bootstrapDigest
    || !Number.isFinite(Date.parse(expected.runStartedAt)) || !Number.isFinite(Date.parse(expected.runCompletedAt))
    || Date.parse(expected.runStartedAt) > Date.parse(expected.runCompletedAt)
    || Date.parse(report.observedAt) < Date.parse(expected.runStartedAt) || Date.parse(report.observedAt) > Date.parse(expected.runCompletedAt)) fail('independent-binding');
  if (!HMAC.test(signature) || !timingSafeEqual(Buffer.from(signature.slice(12), 'hex'), Buffer.from(signatureFor(unsigned, signingKey).slice(12), 'hex'))) fail('signature');
  return Object.freeze({ status: 'verified_credential_transport_only', exactHead: report.identity.exactHead, runId: report.identity.runId, runAttempt: report.identity.runAttempt, reportDigest: sha256(report) });
}

export async function verifyCredentialPreflightBundle(directory, expected, signingKey) {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length !== 1 || entries[0].name !== PREFLIGHT_FILE || !entries[0].isFile()) fail('artifact-file-set');
  const bytes = await readFile(path.join(directory, PREFLIGHT_FILE));
  if (bytes.length > 16384) fail('artifact-size');
  return verifyCredentialPreflightReport(JSON.parse(bytes.toString('utf8')), expected, signingKey);
}

const sourceIdentity = () => {
  if (process.argv.length !== 2 || path.resolve(process.argv[1]) !== fileURLToPath(import.meta.url)) fail('execution-command');
  const command = `node ${path.relative(process.cwd(), process.argv[1]).replaceAll('\\', '/')}`;
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (command !== PREFLIGHT_COMMAND || nodeMajor !== 22) fail('execution-command');
  const checkout = bootstrapCheckoutIdentity();
  if (checkout.dirty !== '') fail('dirty-source');
  const files = collectChangedPrCFiles(process.cwd());
  const base = execFileSync('git', ['merge-base', PR_C_BASE_SHA, 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (base !== PR_C_BASE_SHA) fail('base');
  return { ...checkout, command, nodeMajor, governedFileCount: files.length, governedWorkingTreeDigest: calculatePrCWorkingTreeDigest(process.cwd(), files) };
};

export async function runCredentialPreflight(env = process.env) {
  // No injectable inventory, adapter, event, source, signing payload or output
  // filename is accepted by the production entrypoint.
  enterFailurePhase(PREFLIGHT_FAILURE_PHASES.outputPath);
  if (env.PR_C_CONTROLLED_HUMAN_PREFLIGHT_OUTPUT !== PREFLIGHT_OUTPUT) fail('output-path');
  enterFailurePhase(PREFLIGHT_FAILURE_PHASES.sourceIdentity);
  const sourceBefore = sourceIdentity();
  enterFailurePhase(PREFLIGHT_FAILURE_PHASES.eventAuthority);
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
  const identity = derivePreflightIdentity(env, event, sourceBefore);
  enterFailurePhase(PREFLIGHT_FAILURE_PHASES.fixture);
  const fixtureState = await loadFixture();
  const inputChecks = validateNonPatPreflightInputs(env, fixtureState);
  enterFailurePhase(PREFLIGHT_FAILURE_PHASES.migration);
  const migration = await loadMigration();
  enterFailurePhase(PREFLIGHT_FAILURE_PHASES.pinnedCa);
  loadPinnedSupabaseRootCa();
  enterFailurePhase(PREFLIGHT_FAILURE_PHASES.databaseConfiguration);
  const adapter = new PostgresEnvironmentMigrationAdapter(env.PR_C_CONTROLLED_HUMAN_DATABASE_URL, migration.sql, { readOnly: true });
  const { inventory, ...databaseChecks } = await inspectPreflightTargetReadOnly(adapter);
  enterFailurePhase(PREFLIGHT_FAILURE_PHASES.bootstrapBinding);
  const bootstrap = buildControlledHumanBootstrapBindings({ env: { ...env, PR_C_CONTROLLED_HUMAN_EXPECTED_EXERCISE_DIGEST: identity.exerciseDigest }, fixtureState, migration, inventory, checkout: sourceBefore });
  enterFailurePhase(PREFLIGHT_FAILURE_PHASES.preview);
  const previewChecks = await observePreflightPreview(identity);
  enterFailurePhase(PREFLIGHT_FAILURE_PHASES.sourceRecheck);
  const sourceUnchanged = same(sourceBefore, sourceIdentity());
  if (!sourceUnchanged) fail('source-changed');
  enterFailurePhase(PREFLIGHT_FAILURE_PHASES.report);
  const report = createCredentialPreflightReport({ identity, bootstrap, inputChecks, databaseChecks, previewChecks, sourceUnchanged,
    pinnedTls: true, observedAt: new Date().toISOString(), signingKey: env.PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY });
  enterFailurePhase(PREFLIGHT_FAILURE_PHASES.artifactWrite);
  const output = path.resolve(PREFLIGHT_OUTPUT);
  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(output, { recursive: false });
  await writeFile(path.join(output, PREFLIGHT_FILE), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    enterFailurePhase(PREFLIGHT_FAILURE_PHASES.entryArguments);
    if (process.argv.length !== 2) fail('arguments');
    const report = await runCredentialPreflight();
    process.stdout.write(`${JSON.stringify({ status: report.status, runId: report.identity.runId, runAttempt: report.identity.runAttempt })}\n`);
  } catch {
    // Never relay Git, JSON, URL, PostgreSQL, fetch or filesystem diagnostics.
    process.stderr.write(`PR264_CREDENTIAL_PREFLIGHT_FAILED:${activeFailurePhase}\n`);
    process.exitCode = 1;
  }
}
