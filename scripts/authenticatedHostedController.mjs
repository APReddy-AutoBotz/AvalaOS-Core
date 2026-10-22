import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';

import {
  AUTHENTICATED_ACCEPTANCE_PROJECTS,
  AUTHENTICATED_ACCEPTANCE_TEST_IDS,
  AUTHENTICATED_CASE_ASSERTIONS,
  authenticatedAcceptanceScenario,
} from './authenticatedAcceptanceCases.mjs';
import {
  AUTHENTICATED_BROWSER_CORRELATION_SCHEMA,
  authenticatedRawIdentity,
  validateAuthenticatedBrowserCorrelations,
} from './authenticatedBrowserCorrelation.mjs';
import {
  AUTHENTICATED_SERVER_OBSERVATION_SCHEMA,
  validateAuthenticatedServerObservations,
} from './authenticatedHostedObserver.mjs';
import { authenticatedHostedRequestBinding } from './authenticatedHostedObservationAdapter.mjs';
import { validateAuthenticatedHostedIdentityDiagnostic } from './authenticatedHostedDiagnostics.mjs';
import {
  deriveLocalAcceptanceExerciseDigest,
  LOCAL_ACCEPTANCE_ORIGIN,
  LOCAL_AUTHENTICATED_EXECUTION_KIND,
} from './localAcceptanceBuild.mjs';
import {
  authenticatedAcceptanceMode,
  authenticatedV2ReloadProjectionCounts,
  buildAuthenticatedV2ReloadDiagnostic,
  validateAuthenticatedV2ReloadCheckpoint,
} from './authenticatedV2ReloadDiagnostic.mjs';
import { buildAuthenticatedReviewerSelectionDiagnostic } from './authenticatedReviewerSelectionDiagnostic.mjs';

export const AUTHENTICATED_HOSTED_CONTROLLER_SCHEMA = 'authenticated-hosted-controller-v1';
export const AUTHENTICATED_HOSTED_AUTHORITY_SCHEMA = 'authenticated-synthetic-authority-observation-v1';
export const AUTHENTICATED_HOSTED_OPERATION_TIMEOUT_MS = 30_000;
export const AUTHENTICATED_HOSTED_PREPARATION_MAX = 4;
const HOSTED_TEMP_ROOT = process.platform === 'win32' ? os.tmpdir() : '/tmp';
export const AUTHENTICATED_HOSTED_OUTPUT_PATHS = Object.freeze({
  browser: path.join(HOSTED_TEMP_ROOT, 'authenticated-browser-correlations.json'),
  server: path.join(HOSTED_TEMP_ROOT, 'authenticated-server-observations.json'),
  binding: path.join(HOSTED_TEMP_ROOT, 'authenticated-controller-binding.json'),
  diagnostic: path.join(HOSTED_TEMP_ROOT, 'authenticated-hosted-diagnostic.json'),
  v2ReloadDiagnostic: path.join(HOSTED_TEMP_ROOT, 'authenticated-v2-primary-prefix-diagnostic.json'),
  reviewerSelectionDiagnostic: path.join(HOSTED_TEMP_ROOT, 'authenticated-reviewer-selection-diagnostic.json'),
});
export const AUTHENTICATED_HOSTED_PERSONAS = Object.freeze(['author', 'reviewer', 'approver', 'outsider']);
export const AUTHENTICATED_HOSTED_FAULT_KINDS = Object.freeze([
  'studio_deterministic_success',
  'studio_failure_after_claim',
  'process_server_error_precommit',
]);

const SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const HEX_DIGEST = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SAFE_NAME = /^[a-z][a-z0-9-]{1,63}$/u;
const ASSESS_FINALIZE_ROUTE = '/functions/v1/assess-command';
const ASSESS_FINALIZE_COMMAND = 'assessment.finalize';
const ASSESS_FINALIZE_PROOF_SCHEMA = 'authenticated-assessment-finalize-proof-v1';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = code => { throw new Error(`AUTHENTICATED_HOSTED_CONTROLLER_${code}`); };
const timestamp = value => typeof value === 'string'
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;
const exactKeys = (value, expected, code) => {
  if (!record(value) || !isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort())) fail(code);
};

const changedRecordHashes = (before, after) => {
  const prior = new Map(before.records.map(item => [item.recordHash, item]));
  const current = new Map(after.records.map(item => [item.recordHash, item]));
  return [...new Set([...prior.keys(), ...current.keys()])].filter(recordHash => {
    const left = prior.get(recordHash);
    const right = current.get(recordHash);
    return !left || !right || left.rowHash !== right.rowHash || left.active !== right.active;
  }).sort();
};

const assertAssessmentFinalizeProof = action => {
  const proof = action.assessmentFinalizeProof;
  exactKeys(proof, [
    'schemaVersion', 'verified', 'requestIdHash', 'commandBindingHash', 'actorHash', 'sessionHash',
    'assessmentRecordHash', 'assessmentBeforeRowHash', 'assessmentAfterRowHash',
    'receiptRecordHash', 'receiptRowHash', 'receiptIdHash', 'auditRecordHash', 'auditRowHash',
    'commandIdHash', 'expectedVersion', 'committedVersion', 'scoreVersion',
    'beforeCapturedAt', 'afterCapturedAt',
  ], 'ASSESSMENT_FINALIZE_PROOF_REJECTED');
  if (proof.schemaVersion !== ASSESS_FINALIZE_PROOF_SCHEMA || proof.verified !== true
    || action.route !== ASSESS_FINALIZE_ROUTE || action.commandType !== ASSESS_FINALIZE_COMMAND
    || action.status < 200 || action.status >= 300 || action.response.classification !== 'COMMITTED'
    || ![proof.requestIdHash, proof.commandBindingHash, proof.actorHash, proof.sessionHash,
      proof.assessmentRecordHash, proof.assessmentBeforeRowHash, proof.assessmentAfterRowHash,
      proof.receiptRecordHash, proof.receiptRowHash, proof.receiptIdHash,
      proof.auditRecordHash, proof.auditRowHash, proof.commandIdHash].every(value => DIGEST.test(value ?? ''))
    || proof.requestIdHash !== action.requestIdHash || proof.commandBindingHash !== action.commandBindingHash
    || proof.actorHash !== action.actorHash || proof.sessionHash !== action.sessionHash
    || proof.commandIdHash !== action.response.commandIdHash || proof.receiptIdHash !== action.response.receiptIdHash
    || !Number.isSafeInteger(proof.expectedVersion) || proof.expectedVersion < 1
    || proof.committedVersion !== proof.expectedVersion + 1 || proof.scoreVersion !== 'assess-core-2026-05'
    || proof.beforeCapturedAt !== action.before.capturedAt || proof.afterCapturedAt !== action.after.capturedAt) {
    fail('ASSESSMENT_FINALIZE_PROOF_REJECTED');
  }
  const beforeAssessment = action.before.records.find(item => item.recordHash === proof.assessmentRecordHash);
  const afterAssessment = action.after.records.find(item => item.recordHash === proof.assessmentRecordHash);
  const receipt = action.after.records.find(item => item.recordHash === proof.receiptRecordHash);
  const audit = action.after.records.find(item => item.recordHash === proof.auditRecordHash);
  if (!beforeAssessment || beforeAssessment.source !== 'assessments'
    || beforeAssessment.rowHash !== proof.assessmentBeforeRowHash
    || !afterAssessment || afterAssessment.source !== 'assessments'
    || afterAssessment.rowHash !== proof.assessmentAfterRowHash
    || proof.assessmentBeforeRowHash === proof.assessmentAfterRowHash
    || !receipt || receipt.source !== 'assess_command_receipts' || receipt.rowHash !== proof.receiptRowHash
    || !audit || audit.source !== 'privileged_audit_events' || audit.rowHash !== proof.auditRowHash) {
    fail('ASSESSMENT_FINALIZE_PROOF_REJECTED');
  }
  for (const row of [afterAssessment, receipt, audit]) {
    if (row.effectKind !== ({ assessments: 'domain', assess_command_receipts: 'receipt',
      privileged_audit_events: 'audit' })[row.source]
      || row.actorHash !== action.actorHash || row.sessionHash !== action.sessionHash
      || row.requestIdHash !== action.requestIdHash || row.commandBindingHash !== action.commandBindingHash
      || row.commandIdHash !== proof.commandIdHash) fail('ASSESSMENT_FINALIZE_PROOF_REJECTED');
  }
  if (receipt.receiptIdHash !== proof.receiptIdHash || audit.receiptIdHash !== proof.receiptIdHash
    || audit.auditIdHash === null || action.before.records.some(item => [proof.receiptRecordHash, proof.auditRecordHash].includes(item.recordHash))
    || !isDeepStrictEqual(changedRecordHashes(action.before, action.after), [
      proof.assessmentRecordHash, proof.auditRecordHash, proof.receiptRecordHash,
    ].sort())) fail('ASSESSMENT_FINALIZE_PROOF_REJECTED');
};

export const canonicalJson = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
export const authenticatedHostedDigest = value => `sha256:${createHash('sha256').update(
  typeof value === 'string' ? value : canonicalJson(value),
).digest('hex')}`;

const decodeJwtClaims = token => {
  if (typeof token !== 'string' || token.length < 32 || token.length > 16_384) fail('SESSION_TOKEN_REJECTED');
  const parts = token.split('.');
  if (parts.length !== 3) fail('SESSION_TOKEN_REJECTED');
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!record(claims) || !UUID.test(claims.sub) || !UUID.test(claims.session_id)) fail('SESSION_CLAIMS_REJECTED');
    return { actorId: claims.sub, sessionId: claims.session_id };
  } catch (error) {
    if (String(error?.message ?? error).startsWith('AUTHENTICATED_HOSTED_CONTROLLER_')) throw error;
    fail('SESSION_CLAIMS_REJECTED');
  }
};

const safeOrigin = (value, executionKind) => {
  let parsed;
  try { parsed = new URL(value); } catch { fail('ORIGIN_REJECTED'); }
  const local = executionKind === LOCAL_AUTHENTICATED_EXECUTION_KIND;
  if (parsed.origin !== value || parsed.username || parsed.password
    || (local ? value !== LOCAL_ACCEPTANCE_ORIGIN
      : parsed.protocol !== 'https:' || parsed.hostname !== 'avalaos-pilot.netlify.app')) fail('ORIGIN_REJECTED');
  return parsed.origin;
};

const supabaseTarget = value => {
  let parsed;
  try { parsed = new URL(value); } catch { fail('SUPABASE_TARGET_REJECTED'); }
  const match = /^([a-z0-9]{20})[.]supabase[.]co$/u.exec(parsed.hostname);
  if (parsed.protocol !== 'https:' || parsed.origin !== value || !match || parsed.username || parsed.password) {
    fail('SUPABASE_TARGET_REJECTED');
  }
  return { origin: parsed.origin, projectRef: match[1] };
};

export function validateAuthenticatedHostedControllerEnvironment(environment) {
  const acceptanceMode = authenticatedAcceptanceMode(environment);
  if (environment.GITHUB_ACTIONS !== 'true' || environment.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    fail('WORKFLOW_RUNTIME_REQUIRED');
  }
  if (!SHA.test(environment.RELEASE_SHA ?? '') || environment.GITHUB_SHA !== environment.RELEASE_SHA) {
    fail('EXACT_RELEASE_REQUIRED');
  }
  const executionKind = environment.AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND;
  const localBuild = executionKind === LOCAL_AUTHENTICATED_EXECUTION_KIND;
  if (!['hosted_authenticated_synthetic', LOCAL_AUTHENTICATED_EXECUTION_KIND].includes(executionKind)
    || environment.AUTHENTICATED_ACCEPTANCE_AUTH_KIND !== 'supabase_auth'
    || (localBuild && environment.ACCEPTANCE_EXECUTION_KIND !== 'local_real_backend')) {
    fail('EXECUTION_PROFILE_REJECTED');
  }
  if (acceptanceMode === 'reviewer_selection_diagnostic' && !localBuild) {
    fail('REVIEWER_SELECTION_DIAGNOSTIC_EXECUTION_REJECTED');
  }
  const secretBackendKind = environment.AUTHENTICATED_ACCEPTANCE_SECRET_BACKEND;
  if (!['hashicorp_vault', 'supabase_vault'].includes(secretBackendKind)
    || environment.AVALA_PROVIDER_SECRET_BACKEND !== secretBackendKind) fail('SECRET_BACKEND_SELECTOR_REJECTED');
  const origin = safeOrigin(environment.HOSTED_PILOT_URL, executionKind);
  const target = supabaseTarget(environment.AUTHENTICATED_ACCEPTANCE_SUPABASE_URL);
  if (environment.AUTHENTICATED_ACCEPTANCE_EXPECTED_PROJECT_REF !== target.projectRef
    || !DIGEST.test(environment.AUTHENTICATED_ACCEPTANCE_TARGET_PUBLIC_DIGEST ?? '')) fail('SUPABASE_TARGET_REJECTED');
  let deploymentId = environment.NETLIFY_DEPLOY_ID;
  let buildDigest = null;
  let approvedExerciseDigest = null;
  let localBuildWorkspace = null;
  if (localBuild) {
    if (deploymentId !== '' || !DIGEST.test(environment.AUTHENTICATED_ACCEPTANCE_BUILD_DIGEST ?? '')
      || !DIGEST.test(environment.AUTHENTICATED_ACCEPTANCE_APPROVED_EXERCISE_DIGEST ?? '')) fail('DEPLOYMENT_REJECTED');
    deploymentId = null;
    buildDigest = environment.AUTHENTICATED_ACCEPTANCE_BUILD_DIGEST;
    approvedExerciseDigest = environment.AUTHENTICATED_ACCEPTANCE_APPROVED_EXERCISE_DIGEST;
    localBuildWorkspace = path.resolve(environment.LOCAL_ACCEPTANCE_BUILD_ROOT ?? '');
    if (path.dirname(localBuildWorkspace) !== path.resolve(os.tmpdir())
      || !path.basename(localBuildWorkspace).startsWith('avalaos-local-acceptance-')) fail('DEPLOYMENT_REJECTED');
    const expectedExerciseDigest = deriveLocalAcceptanceExerciseDigest({ approvedExerciseDigest, buildDigest,
      releaseSha: environment.RELEASE_SHA });
    if (environment.AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST !== expectedExerciseDigest) fail('DIGEST_REJECTED');
  } else if (!/^[0-9a-f]{24}$/u.test(deploymentId ?? '')) fail('DEPLOYMENT_REJECTED');
  if (!/^20[0-9]{12}$/u.test(environment.AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION ?? '')) fail('MIGRATION_REJECTED');
  for (const key of [
    'AUTHENTICATED_ACCEPTANCE_BACKEND_DIGEST', 'AUTHENTICATED_ACCEPTANCE_MIGRATION_DIGEST',
    'AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST', 'AUTHENTICATED_ACCEPTANCE_CATALOG_DIGEST',
    'AUTHENTICATED_ACCEPTANCE_SOURCE_DIGEST', 'AUTHENTICATED_ACCEPTANCE_BASELINE_DIGEST',
  ]) if (!DIGEST.test(environment[key] ?? '')) fail('DIGEST_REJECTED');
  if (environment.AUTHENTICATED_ACCEPTANCE_SYNTHETIC_ONLY !== 'true'
    || environment.AUTHENTICATED_ACCEPTANCE_PRODUCTION !== 'false'
    || environment.AUTHENTICATED_ACCEPTANCE_CUSTOMER_DATA !== 'false'
    || environment.AUTHENTICATED_ACCEPTANCE_PROVIDERS_ENABLED !== 'false'
    || environment.AUTHENTICATED_ACCEPTANCE_PAID_CALLS !== 'false') fail('POLICY_REJECTED');
  if (environment.GITHUB_REPOSITORY !== 'APReddy-AutoBotz/AvalaOS-Core'
    || environment.GITHUB_WORKFLOW_REF !== 'APReddy-AutoBotz/AvalaOS-Core/.github/workflows/authenticated-product-acceptance.yml@refs/heads/main'
    || environment.GITHUB_JOB !== 'hosted-authenticated'
    || !/^[1-9][0-9]*$/u.test(environment.GITHUB_RUN_ID ?? '')
    || !/^[1-9][0-9]*$/u.test(environment.GITHUB_RUN_ATTEMPT ?? '')) fail('WORKFLOW_IDENTITY_REJECTED');
  if (typeof environment.AUTHENTICATED_ACCEPTANCE_SUPABASE_SERVICE_ROLE_KEY !== 'string'
    || environment.AUTHENTICATED_ACCEPTANCE_SUPABASE_SERVICE_ROLE_KEY.length < 32
    || typeof environment.AUTHENTICATED_ACCEPTANCE_DATABASE_URL !== 'string') fail('CONTROLLER_CREDENTIALS_REQUIRED');
  let scope;
  try { scope = JSON.parse(environment.AUTHENTICATED_ACCEPTANCE_SCOPE ?? 'null'); } catch { fail('SCOPE_REJECTED'); }
  exactKeys(scope, ['organizationId', 'workspaceId', 'roleIds'], 'SCOPE_REJECTED');
  if (!UUID.test(scope.organizationId) || !UUID.test(scope.workspaceId)) fail('SCOPE_REJECTED');
  exactKeys(scope.roleIds, AUTHENTICATED_HOSTED_PERSONAS, 'SCOPE_REJECTED');
  const roleIds=AUTHENTICATED_HOSTED_PERSONAS.map(persona=>scope.roleIds[persona]);
  if (roleIds.some(roleId => !UUID.test(roleId))||new Set(roleIds).size!==roleIds.length) fail('SCOPE_REJECTED');
  return Object.freeze({
    releaseSha: environment.RELEASE_SHA,
    executionKind,
    origin,
    deploymentId,
    buildDigest,
    approvedExerciseDigest,
    localBuildWorkspace,
    supabaseUrl: target.origin,
    projectRef: target.projectRef,
    targetPublicDigest: environment.AUTHENTICATED_ACCEPTANCE_TARGET_PUBLIC_DIGEST,
    serviceRoleKey: environment.AUTHENTICATED_ACCEPTANCE_SUPABASE_SERVICE_ROLE_KEY,
    databaseUrl: environment.AUTHENTICATED_ACCEPTANCE_DATABASE_URL,
    backendDigest: environment.AUTHENTICATED_ACCEPTANCE_BACKEND_DIGEST,
    migrationVersion: environment.AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION,
    migrationDigest: environment.AUTHENTICATED_ACCEPTANCE_MIGRATION_DIGEST,
    exerciseDigest: environment.AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST,
    catalogDigest: environment.AUTHENTICATED_ACCEPTANCE_CATALOG_DIGEST,
    sourceDigest: environment.AUTHENTICATED_ACCEPTANCE_SOURCE_DIGEST,
    baselineDigest: environment.AUTHENTICATED_ACCEPTANCE_BASELINE_DIGEST,
    secretBackendKind,
    acceptanceMode,
    workflow: Object.freeze({
      repository: environment.GITHUB_REPOSITORY,
      producer: Object.freeze({ path: '.github/workflows/exhaustive-acceptance.yml',
        ref: `${environment.GITHUB_REPOSITORY}/.github/workflows/exhaustive-acceptance.yml@refs/heads/main`, job: 'acceptance' }),
      caller: Object.freeze({ path: '.github/workflows/authenticated-product-acceptance.yml',
        ref: environment.GITHUB_WORKFLOW_REF,
        event: environment.GITHUB_EVENT_NAME, job: environment.GITHUB_JOB }),
      runId: environment.GITHUB_RUN_ID,
      attempt: environment.GITHUB_RUN_ATTEMPT,
    }),
    scope: Object.freeze(scope),
  });
}

export function controllerProfile(config, window, actors) {
  if (!timestamp(window?.startedAt) || !timestamp(window?.completedAt)
    || Date.parse(window.completedAt) <= Date.parse(window.startedAt)) fail('WINDOW_REJECTED');
  const safeActors = actors.map(actor => ({
    persona: actor.persona,
    project: actor.project,
    actorHash: actor.actorHash,
    sessionHash: actor.sessionHash,
    organizationHash: authenticatedHostedDigest(config.scope.organizationId),
    workspaceHash: authenticatedHostedDigest(config.scope.workspaceId),
  }));
  if (!safeActors.length || safeActors.some(actor => !AUTHENTICATED_HOSTED_PERSONAS.includes(actor.persona)
    || !AUTHENTICATED_ACCEPTANCE_PROJECTS.includes(actor.project)
    || [actor.actorHash, actor.sessionHash, actor.organizationHash, actor.workspaceHash].some(value => !DIGEST.test(value)))) {
    fail('ACTOR_BINDING_REJECTED');
  }
  const localBuild = config.executionKind === LOCAL_AUTHENTICATED_EXECUTION_KIND;
  return {
    schemaVersion: localBuild ? 'local-real-backend-authenticated-profile-v1'
      : 'hosted-authenticated-synthetic-profile-v3',
    executionKind: config.executionKind,
    authKind: 'supabase_auth',
    releaseSha: config.releaseSha,
    checkoutSha: config.releaseSha,
    origin: config.origin,
    deploymentId: config.deploymentId,
    ...(localBuild ? { buildDigest: config.buildDigest } : {}),
    backendDigest: config.backendDigest,
    migrationVersion: config.migrationVersion,
    migrationDigest: config.migrationDigest,
    exerciseDigest: config.exerciseDigest,
    catalogDigest: config.catalogDigest,
    sourceDigest: config.sourceDigest,
    baselineDigest: config.baselineDigest,
    secretBackendKind: config.secretBackendKind,
    policy: { syntheticOnly: true, production: false, customerDataAllowed: false, providersEnabled: false, paidCallsAllowed: false },
    workflow: structuredClone(config.workflow),
    window: { ...window },
    actors: safeActors.sort((a, b) => `${a.project}:${a.persona}:${a.sessionHash}`.localeCompare(`${b.project}:${b.persona}:${b.sessionHash}`)),
  };
}

const waitForAuthenticatedHostedSettlement = async (operations, timeoutMs, code) => {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > AUTHENTICATED_HOSTED_OPERATION_TIMEOUT_MS) {
    fail('SETTLEMENT_TIMEOUT_REJECTED');
  }
  const startedAt = Date.now();
  while (operations.size > 0) {
    const remaining = timeoutMs - (Date.now() - startedAt);
    if (remaining <= 0) fail(code);
    let timeout;
    const expired = new Promise(resolve => { timeout = setTimeout(() => resolve(false), remaining); });
    const settled = Promise.allSettled([...operations]).then(() => true);
    const completed = await Promise.race([settled, expired]);
    clearTimeout(timeout);
    if (!completed && operations.size > 0) fail(code);
  }
};

const safeJson = async (request, { signal } = {}) => {
  const maximumBytes = 2_000_000;
  const abortRequest = () => request.destroy(new Error('AUTHENTICATED_HOSTED_CONTROLLER_REQUEST_ABORTED'));
  if (signal?.aborted) abortRequest();
  else signal?.addEventListener('abort', abortRequest, { once: true });
  const declaredLength = request.headers?.['content-length'];
  try {
    if (typeof declaredLength === 'string' && /^\d+$/u.test(declaredLength)
      && Number(declaredLength) > maximumBytes) {
      request.resume();
      fail('REQUEST_TOO_LARGE');
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.byteLength;
      if (bytes > maximumBytes) {
        request.resume();
        fail('REQUEST_TOO_LARGE');
      }
      chunks.push(buffer);
    }
    if (signal?.aborted) fail('REQUEST_ABORTED');
    const raw = Buffer.concat(chunks, bytes).toString('utf8');
    try { return raw ? JSON.parse(raw) : {}; } catch { fail('REQUEST_JSON_REJECTED'); }
  } finally {
    signal?.removeEventListener('abort', abortRequest);
  }
};

const assertSecretFree = value => {
  const serialized = JSON.stringify(value);
  if (/access[_-]?token|refresh[_-]?token|service[_-]?role|password|providerKey|rawSecret|secret(?:Ref|Value)/iu.test(serialized)) {
    fail('EVIDENCE_SECRET_REJECTED');
  }
};

export class AuthenticatedHostedController {
  constructor({ config, adapter, identity, now = () => new Date(), randomId = randomUUID }) {
    this.config = config;
    this.adapter = adapter;
    this.identity = identity;
    this.now = now;
    this.randomId = randomId;
    this.exerciseId = randomId();
    this.startedAt = now().toISOString();
    this.observationStartedAt = null;
    this.controlToken = randomBytes(32).toString('base64url');
    this.projects = new Map();
    this.ownedProjects = new Map();
    this.projectIdentitySets = new Map();
    this.boundSessions = new Map();
    this.browserActions = new Map();
    this.browserActionPreparations = new Map();
    this.browserActionPreparationWaiters = [];
    this.browserActionPreparationMetrics = {
      count: 0, failed: 0, inFlight: 0, maxInFlight: 0, queued: 0, maxQueued: 0,
      queueTotalMs: 0, queueMaxMs: 0, serviceTotalMs: 0, serviceMaxMs: 0,
    };
    this.browserCases = [];
    this.serverCases = [];
    this.parentIdentityDiagnostic = null;
    this.browserIdentityDiagnostic = null;
    this.v2ReloadCheckpoints = [];
    this.v2ReloadTargetHashes = [];
    this.reviewerSelectionCandidates = null;
    this.reviewerSelectionCommands = null;
    this.reviewerSelectionServerActionFrames = null;
    this.active = false;
    this.activationAttempted = false;
    this.quiesced = false;
    this.controlIntake = 'inactive';
    this.controlAbort = new AbortController();
    this.controlOperations = new Set();
  }

  assertControlCommitAllowed(signal) {
    if (this.controlIntake === 'inactive' && this.active && !this.quiesced) this.controlIntake = 'accepting';
    if (signal?.aborted || this.controlIntake !== 'accepting' || !this.active || this.quiesced) {
      fail('INTAKE_CLOSED');
    }
  }

  stopControlIntake() {
    if (this.controlIntake === 'stopped' || this.controlIntake === 'stopping') return;
    this.controlIntake = 'stopping';
    this.controlAbort.abort('CONTROL_INTAKE_STOPPED');
  }

  async joinControlOperations({ timeoutMs = AUTHENTICATED_HOSTED_OPERATION_TIMEOUT_MS } = {}) {
    if (this.controlIntake === 'accepting') fail('INTAKE_STILL_OPEN');
    await waitForAuthenticatedHostedSettlement(this.controlOperations, timeoutMs, 'CONTROL_WORK_INCOMPLETE');
    this.controlIntake = 'stopped';
    return { settled: true };
  }

  async stopControlIntakeAndJoin(options) {
    this.stopControlIntake();
    return this.joinControlOperations(options);
  }

  cleanupProjects() {
    return [...new Map([...this.projects, ...this.ownedProjects]).values()];
  }

  runControlOperation(operation, externalSignal) {
    if (this.controlIntake === 'inactive' && this.active && !this.quiesced) this.controlIntake = 'accepting';
    if (this.controlIntake !== 'accepting' || !this.active || this.quiesced) fail('INTAKE_CLOSED');
    const ownedAbort = new AbortController();
    const abortOwned = () => ownedAbort.abort('CONTROL_OPERATION_ABORTED');
    if (this.controlAbort.signal.aborted || externalSignal?.aborted) abortOwned();
    else {
      this.controlAbort.signal.addEventListener('abort', abortOwned, { once: true });
      externalSignal?.addEventListener('abort', abortOwned, { once: true });
    }
    const running = Promise.resolve().then(() => operation(ownedAbort.signal));
    this.controlOperations.add(running);
    const release = () => {
      this.controlOperations.delete(running);
      this.controlAbort.signal.removeEventListener('abort', abortOwned);
      externalSignal?.removeEventListener('abort', abortOwned);
    };
    running.then(release, release);
    return running;
  }

  async preflightAndActivate() {
    const preflight = await this.adapter.preflight({ config: this.config, exerciseId: this.exerciseId });
    const localBuild = this.config.executionKind === LOCAL_AUTHENTICATED_EXECUTION_KIND;
    if (!record(preflight) || preflight.syntheticTarget !== true || preflight.production === true
      || preflight.releaseSha !== this.config.releaseSha || preflight.deploymentId !== this.config.deploymentId
      || (localBuild && (preflight.executionKind !== this.config.executionKind
        || preflight.buildDigest !== this.config.buildDigest))
      || preflight.migrationVersion !== this.config.migrationVersion || preflight.backendDigest !== this.config.backendDigest
      || preflight.providersEnabled !== false || preflight.runtimeReady!==true
      || preflight.secretBackendKind !== this.config.secretBackendKind || preflight.secretBackendWritable !== true
      || preflight.publicTargetDigest !== this.config.targetPublicDigest
      || preflight.baselineDigest !== this.config.baselineDigest
      || preflight.customerRows !== 0 || preflight.unapprovedActiveResidue !== 0
      || preflight.scopeReady!==true || !timestamp(preflight.observationStartedAt)) fail('PREFLIGHT_REJECTED');
    this.observationStartedAt = preflight.observationStartedAt;
    this.startedAt = preflight.observationStartedAt;
    // Activation is a mutating authority call. Record ownership before dispatch
    // so a transport or client timeout cannot turn an unknown commit outcome into
    // a false "cleanup not required" result.
    this.activationAttempted = true;
    await this.adapter.activate({
      exerciseId: this.exerciseId,
      releaseSha: this.config.releaseSha,
      deploymentId: this.config.deploymentId,
      executionKind: this.config.executionKind,
      buildDigest: this.config.buildDigest,
      origin: this.config.origin,
      backendDigest: this.config.backendDigest,
      migrationVersion: this.config.migrationVersion,
      migrationDigest: this.config.migrationDigest,
      exerciseDigest: this.config.exerciseDigest,
      profileVersion: localBuild ? 'local-real-backend-authenticated-profile-v1'
        : 'hosted-authenticated-synthetic-profile-v3',
      catalogDigest: this.config.catalogDigest,
      sourceDigest: this.config.sourceDigest,
      organizationId: this.config.scope.organizationId,
      workspaceId: this.config.scope.workspaceId,
      expiresAt: new Date(this.now().getTime() + 45 * 60_000).toISOString(),
    });
    this.active = true;
    this.controlIntake = 'accepting';
    return { ok: true, schemaVersion: AUTHENTICATED_HOSTED_CONTROLLER_SCHEMA };
  }

  async setupProject(projectName, signal) {
    this.assertControlCommitAllowed(signal);
    if (this.config.acceptanceMode !== 'full_acceptance' && projectName !== 'desktop-chromium') {
      fail('FOCUSED_DIAGNOSTIC_PROJECT_REJECTED');
    }
    if (!SAFE_NAME.test(projectName) && !/^(desktop-chromium|pixel-7-chromium)(?:-[a-z0-9-]{1,63})?$/u.test(projectName)) {
      fail('PROJECT_NAME_REJECTED');
    }
    if (this.projects.has(projectName)) return this.projects.get(projectName).browserSetup;
    const browserProject = projectName.startsWith('desktop-chromium') ? 'desktop-chromium'
      : projectName.startsWith('pixel-7-chromium') ? 'pixel-7-chromium' : null;
    if (!browserProject) fail('PROJECT_NAME_REJECTED');
    let identities = this.projectIdentitySets.get(browserProject);
    if (!identities) {
      try {
        identities = await this.identity.provisionProject({
          projectName: browserProject,
          exerciseId: this.exerciseId,
          exerciseDigest: this.config.exerciseDigest,
          scope: this.config.scope,
          personas: AUTHENTICATED_HOSTED_PERSONAS,
          signal,
        });
      } catch (error) {
        this.recordIdentityDiagnostic({ projectName: browserProject,
          diagnostic: error?.authenticatedHostedIdentityDiagnostic ?? { operation: 'PROVISION', category: 'PROVISION_FAILED' } }, 'parent');
        throw error;
      }
      this.assertControlCommitAllowed(signal);
      this.projectIdentitySets.set(browserProject, identities);
    }
    const project = await this.adapter.setupProject({
      projectName,
      exerciseId: this.exerciseId,
      exerciseDigest: this.config.exerciseDigest,
      scope: this.config.scope,
      identities,
      signal,
    });
    // setupProject commits its transaction before returning. Retain that ownership
    // before observing cancellation so cleanup cannot lose a successfully created
    // project whose response arrived while intake was stopping.
    this.ownedProjects.set(projectName, { ...project, identities });
    this.assertControlCommitAllowed(signal);
    const actors = Object.fromEntries(AUTHENTICATED_HOSTED_PERSONAS.map(persona => {
      const actor = identities[persona];
      if (!actor || !UUID.test(actor.id) || typeof actor.email !== 'string' || typeof actor.password !== 'string') {
        fail('IDENTITY_PROVISION_REJECTED');
      }
      return [persona, {
        token: '',
        authKind: 'supabase_auth',
        persona,
        projectName,
        password: actor.password,
        user: { id: actor.id, email: actor.email },
      }];
    }));
    const browserSetup = {
      executionId: authenticatedHostedDigest(`${this.exerciseId}\u0000${projectName}`),
      journeyBinding: authenticatedHostedDigest({ exerciseId: this.exerciseId, projectName, releaseSha: this.config.releaseSha }),
      projectName,
      deliveryProject: project.deliveryProject,
      aliases: project.aliases,
      actors,
    };
    if (!timestamp(this.observationStartedAt)) fail('OBSERVATION_CUTOFF_REJECTED');
    const ownedProject = { ...project, identities, browserSetup, lastBoundaryAt: this.observationStartedAt };
    this.projects.set(projectName, ownedProject);
    this.ownedProjects.set(projectName, ownedProject);
    return browserSetup;
  }

  async verifyPresentedBrowserSession({ projectName, persona = null, accessToken }, { recordFailure = true, signal } = {}) {
    const project = this.projects.get(projectName);
    if (!project) fail('PROJECT_NOT_FOUND');
    const claims = decodeJwtClaims(accessToken);
    const resolvedPersona = persona ?? AUTHENTICATED_HOSTED_PERSONAS
      .find(candidate => project.identities[candidate]?.id === claims.actorId);
    if (!resolvedPersona || project.identities[resolvedPersona]?.id !== claims.actorId) fail('SESSION_ACTOR_REJECTED');
    let verified;
    try { verified = await this.identity.verifySession({ accessToken, ...claims, signal }); }
    catch (error) {
      if (recordFailure) this.recordIdentityDiagnostic({ projectName, diagnostic:
        error?.authenticatedHostedIdentityDiagnostic ?? { operation: 'VERIFY_SESSION', category: 'SESSION_VERIFICATION_FAILED' } }, 'parent');
      throw error;
    }
    this.assertControlCommitAllowed(signal);
    if (!verified || verified.actorId !== claims.actorId || verified.sessionId !== claims.sessionId) fail('SESSION_VERIFY_REJECTED');
    return { project, persona: resolvedPersona, claims };
  }

  async bindVerifiedBrowserSession({ projectName, persona, claims }, signal) {
    const browserProject = projectName.startsWith('desktop-chromium') ? 'desktop-chromium' : 'pixel-7-chromium';
    const key = `${browserProject}:${persona}`;
    const binding = {
      project: browserProject,
      persona,
      actorHash: authenticatedHostedDigest(claims.actorId),
      sessionHash: authenticatedHostedDigest(claims.sessionId),
    };
    const prior = this.boundSessions.get(key);
    if (prior && (prior.actorId !== claims.actorId || prior.sessionId !== claims.sessionId)) fail('SESSION_ROTATION_REJECTED');
    if (!prior) {
      await this.adapter.bindSession({ exerciseId: this.exerciseId, actorId: claims.actorId, sessionId: claims.sessionId,
        persona: `${persona}_${browserProject}`, signal });
      this.assertControlCommitAllowed(signal);
      this.boundSessions.set(key, { ...binding, actorId: claims.actorId, sessionId: claims.sessionId });
    }
    return { bound: true, actorHash: binding.actorHash, sessionHash: binding.sessionHash };
  }

  async bindBrowserSession({ projectName, persona, accessToken }, signal) {
    if (!this.projects.has(projectName) || !AUTHENTICATED_HOSTED_PERSONAS.includes(persona)) fail('SESSION_SCOPE_REJECTED');
    const verified = await this.verifyPresentedBrowserSession({ projectName, persona, accessToken }, { signal });
    return this.bindVerifiedBrowserSession({ projectName, persona, claims: verified.claims }, signal);
  }

  async captureFrame(pathname, input, signal) {
    const project = this.projects.get(input.projectName);
    if (!project) fail('PROJECT_NOT_FOUND');
    const frame = await this.adapter.frame(pathname, { ...input, project, scope: this.config.scope, signal });
    this.assertControlCommitAllowed(signal);
    return frame;
  }

  async recordV2ReloadDiagnosticCheckpoint(input, signal) {
    if (this.config.acceptanceMode !== 'v2_primary_prefix_diagnostic' || !this.active || this.quiesced) {
      fail('V2_RELOAD_DIAGNOSTIC_NOT_ACTIVE');
    }
    const checkpoint = validateAuthenticatedV2ReloadCheckpoint(input);
    const expectedPhase = ['before-create', 'before-reload', 'after-reload'][this.v2ReloadCheckpoints.length];
    if (checkpoint.phase !== expectedPhase) fail('V2_RELOAD_DIAGNOSTIC_PHASE_REJECTED');
    const project = this.projects.get(checkpoint.projectName);
    if (!project) fail('PROJECT_NOT_FOUND');
    const bound = this.boundSessions.get('desktop-chromium:author');
    let sessionContinuity = checkpoint.accessToken === null ? 'missing' : 'invalid';
    if (checkpoint.accessToken !== null && bound) {
      try {
        const verified = await this.verifyPresentedBrowserSession(checkpoint, { recordFailure: false, signal });
        if (bound.actorId === verified.claims.actorId && bound.sessionId === verified.claims.sessionId) {
          sessionContinuity = 'verified';
        }
      } catch {
        sessionContinuity = 'invalid';
      }
    }
    if (checkpoint.phase !== 'after-reload') {
      if (sessionContinuity !== 'verified'
        || !checkpoint.browser.sessionObserved || !checkpoint.browser.selectedScopeObserved
        || !checkpoint.browser.selectedProcessObserved || !checkpoint.browser.serverContextObserved) {
        fail('V2_RELOAD_DIAGNOSTIC_CONTINUITY_REJECTED');
      }
    }
    const frame = await this.captureFrame('/control/lifecycle-frame', { projectName: checkpoint.projectName }, signal);
    if (!DIGEST.test(frame?.targetHash ?? '')) fail('V2_RELOAD_DIAGNOSTIC_FRAME_REJECTED');
    if (checkpoint.phase !== ['before-create', 'before-reload', 'after-reload'][this.v2ReloadCheckpoints.length]) {
      fail('V2_RELOAD_DIAGNOSTIC_PHASE_REJECTED');
    }
    this.assertControlCommitAllowed(signal);
    this.v2ReloadCheckpoints.push(Object.freeze({
      phase: checkpoint.phase,
      sessionContinuity,
      browser: checkpoint.browser,
      projectionCounts: authenticatedV2ReloadProjectionCounts(frame),
    }));
    this.v2ReloadTargetHashes.push(frame.targetHash);
    return Object.freeze({
      recorded: true,
      phase: checkpoint.phase,
      sessionContinuity,
      continue: checkpoint.phase !== 'after-reload' && sessionContinuity === 'verified',
    });
  }

  v2ReloadDiagnosticResult() {
    if (this.config.acceptanceMode !== 'v2_primary_prefix_diagnostic' || !this.quiesced) {
      fail('V2_RELOAD_DIAGNOSTIC_RESULT_REJECTED');
    }
    return buildAuthenticatedV2ReloadDiagnostic({
      source: {
        releaseSha: this.config.releaseSha,
        runId: this.config.workflow.runId,
        attempt: this.config.workflow.attempt,
        producer: 'protected-hosted-controller',
        sourceDigest: this.config.sourceDigest,
      },
      checkpoints: this.v2ReloadCheckpoints,
      cleanup: { status: 'verified' },
      reloadTargetUnchanged: this.v2ReloadTargetHashes.length === 3
        ? this.v2ReloadTargetHashes[1] === this.v2ReloadTargetHashes[2] : null,
    });
  }

  reviewerSelectionDiagnosticResult() {
    if (this.config.acceptanceMode !== 'reviewer_selection_diagnostic' || !this.quiesced
      || this.browserCases.length !== 1 || this.serverCases.length !== 1
      || this.browserCases[0].testId !== 'E2E-004' || this.serverCases[0].testId !== 'E2E-004'
      || !this.reviewerSelectionCandidates || !this.reviewerSelectionCommands) {
      fail('REVIEWER_SELECTION_DIAGNOSTIC_RESULT_REJECTED');
    }
    return buildAuthenticatedReviewerSelectionDiagnostic({
      source: { releaseSha: this.config.releaseSha, runId: this.config.workflow.runId,
        attempt: this.config.workflow.attempt, sourceDigest: this.config.sourceDigest },
      browser: this.browserCases[0],
      server: this.serverCases[0],
      trustedActionFrames: this.reviewerSelectionServerActionFrames,
      candidates: this.reviewerSelectionCandidates,
      commands: this.reviewerSelectionCommands,
      cleanup: { status: 'verified' },
    });
  }

  async recordReviewerSelectionCandidates({ projectName, accessToken }, signal) {
    if (this.config.acceptanceMode !== 'reviewer_selection_diagnostic' || projectName !== 'desktop-chromium'
      || this.reviewerSelectionCandidates !== null) fail('REVIEWER_SELECTION_CANDIDATES_REJECTED');
    const verified = await this.verifyPresentedBrowserSession({ projectName, persona: 'reviewer', accessToken }, { signal });
    const project = this.projects.get(projectName);
    const candidates = await this.adapter.verifyReviewerSelectionCandidates?.({ project,
      reviewerAccessToken: accessToken, reviewerActorId: verified.claims.actorId, signal });
    exactKeys(candidates, ['count', 'reviewerIncluded', 'ownerExcluded', 'approverExcluded', 'outsiderExcluded'],
      'REVIEWER_SELECTION_CANDIDATES_REJECTED');
    if (candidates.count !== 1 || candidates.reviewerIncluded !== true || candidates.ownerExcluded !== true
      || candidates.approverExcluded !== true || candidates.outsiderExcluded !== true) {
      fail('REVIEWER_SELECTION_CANDIDATES_REJECTED');
    }
    this.assertControlCommitAllowed(signal);
    this.reviewerSelectionCandidates = Object.freeze({ ...candidates });
    return { recorded: true, candidateCount: 1 };
  }

  async recordBrowserCase({ projectName, row, actionIds }, signal) {
    if (!this.projects.has(projectName) || !record(row) || !AUTHENTICATED_ACCEPTANCE_TEST_IDS.includes(row.testId)) {
      fail('BROWSER_CASE_REJECTED');
    }
    const project = projectName.startsWith('desktop-chromium') ? 'desktop-chromium' : 'pixel-7-chromium';
    const key = `${row.testId}:${project}`;
    if (this.browserCases.some(item => item.testId === row.testId && item.project === project)) fail('BROWSER_CASE_DUPLICATE');
    assertSecretFree(row);
    if (!Array.isArray(actionIds) || actionIds.length === 0 || new Set(actionIds).size !== actionIds.length
      || actionIds.some(value => !DIGEST.test(value))) fail('BROWSER_ACTION_BINDING_REJECTED');
    const available = this.browserActions.get(projectName) ?? [];
    const boundActions = actionIds.map(actionId => available.find(item => item.actionId === actionId));
    if (boundActions.some(item => !item || !item.complete)) fail('BROWSER_ACTION_BINDING_REJECTED');
    const ordered = boundActions.toSorted((a, b) => Date.parse(a.before.capturedAt) - Date.parse(b.before.capturedAt));
    if (this.config.acceptanceMode === 'reviewer_selection_diagnostic') {
      if (projectName !== 'desktop-chromium' || row.testId !== 'E2E-004' || ordered.length !== 3
        || this.browserCases.length !== 0 || !this.reviewerSelectionCandidates
        || !isDeepStrictEqual(ordered.map(action => action.commandType), [
          'assessment_v2.review.assign', 'assessment_v2.review.assign', 'assessment_v2.review.resolve',
        ]) || !ordered.every(action => action.persona === 'reviewer')) {
        fail('REVIEWER_SELECTION_DIAGNOSTIC_CASE_REJECTED');
      }
    }
    if (row.testId === 'ASSESS-003') {
      if (ordered.length !== 1) fail('ASSESSMENT_FINALIZE_PROOF_REJECTED');
      assertAssessmentFinalizeProof(ordered[0]);
    }
    const firstAction = ordered[0];
    const lastAction = ordered.toSorted((a, b) => Date.parse(b.after.capturedAt) - Date.parse(a.after.capturedAt))[0];
    const scope = this.projects.get(projectName);
    if (row.testId === 'AI-004' && this.config.secretBackendKind === 'supabase_vault') {
      const physical = await this.adapter.verifySecretMaterialCase?.({
        exerciseId: this.exerciseId,
        projectName,
        project: scope,
        testId: row.testId,
        signal,
      });
      if (!record(physical) || physical.backendKind !== this.config.secretBackendKind
        || physical.exists !== true || physical.fingerprintMatches !== true) fail('SECRET_MATERIAL_EVIDENCE_REJECTED');
    }
    this.assertControlCommitAllowed(signal);
    const independent = { before: firstAction.before, after: lastAction.after };
    const startedAt = independent.before.capturedAt;
    const completedAt = independent.after.capturedAt;
    // Case submission consumes retained action frames. It must not move the
    // live observation cutoff, especially when queued behind newer actions.
    const actions = ordered;
    if (!actions.length) fail('BROWSER_ACTION_MISSING');
    const participants = [...new Map(actions.map(item => [
      `${item.actorHash}:${item.sessionHash}`,
      { persona: item.persona, actorHash: item.actorHash, sessionHash: item.sessionHash },
    ])).values()];
    const browserAssertions = row.controls?.assertions ?? [];
    if (browserAssertions.some(item => !record(item) || typeof item.id !== 'string'
      || !['passed', 'failed'].includes(item.status))) fail('BROWSER_ASSERTIONS_REJECTED');
    const assertionIds = browserAssertions.map(item => item.id);
    if (!isDeepStrictEqual([...assertionIds].sort(), [...AUTHENTICATED_CASE_ASSERTIONS[row.testId]].sort())) {
      fail('BROWSER_ASSERTIONS_REJECTED');
    }
    if (this.config.acceptanceMode === 'reviewer_selection_diagnostic') {
      this.reviewerSelectionCommands = Object.freeze(ordered.map(action => action.commandType));
      this.reviewerSelectionServerActionFrames = Object.freeze(ordered.map(action => Object.freeze({
        before: structuredClone(action.before), after: structuredClone(action.after),
      })));
    }
    this.browserCases.push({
      testId: row.testId,
      project,
      scenario: authenticatedAcceptanceScenario(row.testId),
      window: { startedAt, completedAt },
      participants,
      actions: actions.map(({ persona, before, after, complete, route, status, rawRequestBody,
        commandType, actorId, sessionId, assessmentFinalizeProof, ...action }) => action),
      assertions: browserAssertions.map(item => ({
        id: item.id,
        comparator: 'equals',
        expected: true,
        actual: item.status === 'passed',
        observedAt: completedAt,
        source: 'actual-product-browser',
      })),
      source: 'actual-product-browser',
    });
    this.serverCases.push({
      testId: row.testId,
      project,
      scenario: authenticatedAcceptanceScenario(row.testId),
      window: { startedAt, completedAt },
      participants,
      before: independent.before,
      after: independent.after,
    });
    return { recorded: true, key };
  }

  async resolveBrowserActionBinding({ projectName, accessToken }, signal) {
    const verified = await this.verifyPresentedBrowserSession({ projectName, accessToken }, { signal });
    const { claims, persona } = verified;
    const browserProject = projectName.startsWith('desktop-chromium') ? 'desktop-chromium' : 'pixel-7-chromium';
    const key = `${browserProject}:${persona}`;
    let binding = this.boundSessions.get(key);
    if (binding && (binding.actorId !== claims.actorId || binding.sessionId !== claims.sessionId)) {
      fail('SESSION_ROTATION_REJECTED');
    }
    if (!binding) {
      await this.bindVerifiedBrowserSession({ projectName, persona, claims }, signal);
      binding = this.boundSessions.get(key);
    }
    if (!binding) fail('BROWSER_ACTION_SESSION_REJECTED');
    return binding;
  }

  async beginBrowserAction({ projectName, accessToken, requestBody, route }, signal) {
    if (!this.projects.has(projectName) || !record(requestBody) || typeof route !== 'string'
      || !/^\/(?:functions\/v1\/[a-z0-9-]+|rest\/v1\/rpc\/[a-z0-9_]+)$/u.test(route)) fail('BROWSER_ACTION_REJECTED');
    const binding = await this.resolveBrowserActionBinding({ projectName, accessToken }, signal);
    const project = this.projects.get(projectName);
    const method = typeof requestBody.method === 'string' && /^(?:GET|POST|PATCH|PUT|DELETE)$/u.test(requestBody.method)
      ? requestBody.method : 'POST';
    const requestId = typeof requestBody.requestId === 'string' ? requestBody.requestId : `${method} ${route}`;
    const suppliedCommandType = [requestBody.commandType,requestBody.action,requestBody.operation]
      .find(value=>typeof value==='string');
    const commandType = typeof suppliedCommandType === 'string' ? suppliedCommandType
      : `http.${method.toLowerCase()}.${route.slice(1).replaceAll('/', '.').replaceAll('_', '-')}`;
    const mutationBinding = Object.hasOwn(requestBody, 'requestId') || suppliedCommandType!==undefined;
    if (mutationBinding && (!UUID.test(requestBody.requestId ?? '') || typeof suppliedCommandType !== 'string')) {
      fail('BROWSER_ACTION_COMMAND_REJECTED');
    }
    const hashes = authenticatedHostedRequestBinding({ requestId, actorHash: binding.actorHash,
      commandType, payload: requestBody, requireUuid: mutationBinding });
    if (!timestamp(project.lastBoundaryAt)) fail('OBSERVATION_CUTOFF_REJECTED');
    const before = await this.adapter.observe({ exerciseId: this.exerciseId, from: project.lastBoundaryAt, project, signal });
    if (!record(before) || !timestamp(before.capturedAt) || !Array.isArray(before.records)) fail('AUTHORITY_FRAME_REJECTED');
    this.assertControlCommitAllowed(signal);
    if (Date.parse(before.capturedAt) > Date.parse(project.lastBoundaryAt)) {
      project.lastBoundaryAt = before.capturedAt;
    }
    const actionId = authenticatedHostedDigest(this.randomId());
    const action = { actionId, occurredAt: before.capturedAt, actorHash: binding.actorHash,
      sessionHash: binding.sessionHash, ...hashes, response: null, persona: binding.persona,
      actorId: binding.actorId, sessionId: binding.sessionId, commandType,
      before, after: null, complete: false, finishClaimed: false, route,
      rawRequestBody: requestBody, assessmentFinalizeProof: null };
    const actions = this.browserActions.get(projectName) ?? [];
    actions.push(action);
    this.browserActions.set(projectName, actions);
    return { actionId };
  }

  async acquireBrowserActionPreparation(signal) {
    const metrics = this.browserActionPreparationMetrics;
    const startedAt = performance.now();
    const signals = [...new Set([signal, this.controlAbort.signal].filter(Boolean))];
    const recordQueue = () => {
      const elapsed = performance.now() - startedAt;
      metrics.queueTotalMs += elapsed;
      metrics.queueMaxMs = Math.max(metrics.queueMaxMs, elapsed);
      return elapsed;
    };
    if (signals.some(item => item.aborted)) fail('INTAKE_CLOSED');
    if (metrics.inFlight < AUTHENTICATED_HOSTED_PREPARATION_MAX) {
      metrics.inFlight += 1;
      metrics.maxInFlight = Math.max(metrics.maxInFlight, metrics.inFlight);
      recordQueue();
      return { release: () => this.releaseBrowserActionPreparation() };
    }
    metrics.queued += 1;
    metrics.maxQueued = Math.max(metrics.maxQueued, metrics.queued);
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, signals, startedAt, aborted: false, onAbort: null };
      waiter.onAbort = () => {
        if (waiter.aborted) return;
        waiter.aborted = true;
        const index = this.browserActionPreparationWaiters.indexOf(waiter);
        if (index >= 0) {
          this.browserActionPreparationWaiters.splice(index, 1);
          metrics.queued = Math.max(0, metrics.queued - 1);
        }
        for (const item of signals) item.removeEventListener('abort', waiter.onAbort);
        recordQueue();
        reject(new Error('AUTHENTICATED_HOSTED_CONTROLLER_INTAKE_CLOSED'));
      };
      for (const item of signals) item.addEventListener('abort', waiter.onAbort, { once: true });
      this.browserActionPreparationWaiters.push(waiter);
    });
  }

  releaseBrowserActionPreparation() {
    const metrics = this.browserActionPreparationMetrics;
    metrics.inFlight = Math.max(0, metrics.inFlight - 1);
    for (;;) {
      const waiter = this.browserActionPreparationWaiters.shift();
      if (!waiter) return;
      metrics.queued = Math.max(0, metrics.queued - 1);
      for (const item of waiter.signals) item.removeEventListener('abort', waiter.onAbort);
      if (waiter.aborted || waiter.signals.some(item => item.aborted)) continue;
      metrics.inFlight += 1;
      metrics.maxInFlight = Math.max(metrics.maxInFlight, metrics.inFlight);
      const elapsed = performance.now() - waiter.startedAt;
      metrics.queueTotalMs += elapsed;
      metrics.queueMaxMs = Math.max(metrics.queueMaxMs, elapsed);
      waiter.resolve({ release: () => this.releaseBrowserActionPreparation() });
      return;
    }
  }

  browserActionPreparationSnapshot() {
    const bounded = value => Number.isFinite(value)
      ? Math.min(2_147_483_647, Math.max(0, Math.round(value))) : 0;
    const metrics = this.browserActionPreparationMetrics;
    return Object.freeze({
      count: bounded(metrics.count), failed: bounded(metrics.failed),
      inFlight: bounded(metrics.inFlight), maxInFlight: bounded(metrics.maxInFlight),
      queued: bounded(metrics.queued), maxQueued: bounded(metrics.maxQueued),
      ready: bounded([...this.browserActionPreparations.values()].filter(item => item.state === 'ready').length),
      queueTotalMs: bounded(metrics.queueTotalMs), queueMaxMs: bounded(metrics.queueMaxMs),
      serviceTotalMs: bounded(metrics.serviceTotalMs), serviceMaxMs: bounded(metrics.serviceMaxMs),
    });
  }

  async prepareBrowserAction({ projectName, actionId, responseBody, status }, signal) {
    exactKeys(arguments[0], ['projectName', 'actionId', 'responseBody', 'status'],
      'BROWSER_ACTION_PREPARATION_REJECTED');
    this.assertControlCommitAllowed(signal);
    if (!this.projects.has(projectName) || !DIGEST.test(actionId ?? '') || !Number.isInteger(status)
      || status < 0 || status > 599) fail('BROWSER_ACTION_PREPARATION_REJECTED');
    const action = (this.browserActions.get(projectName) ?? []).find(item => item.actionId === actionId);
    if (!action || action.complete || action.finishClaimed || this.browserActionPreparations.has(actionId)) {
      fail('BROWSER_ACTION_PREPARATION_BINDING_REJECTED');
    }
    const response = record(responseBody) ? responseBody : {};
    const responseDigest = authenticatedHostedDigest(response);
    const preparationId = authenticatedHostedDigest(this.randomId());
    const preparation = { state: 'claimed', projectName, actionId, status, responseDigest, preparationId };
    this.browserActionPreparations.set(actionId, preparation);
    const metrics = this.browserActionPreparationMetrics;
    metrics.count += 1;
    let lease;
    try {
      lease = await this.acquireBrowserActionPreparation(signal);
      this.assertControlCommitAllowed(signal);
      const serviceStartedAt = performance.now();
      const project = this.projects.get(projectName);
      let after;
      try {
        after = await this.adapter.observe({
          exerciseId: this.exerciseId, from: action.before.capturedAt, project, signal,
        });
      } finally {
        const serviceMs = performance.now() - serviceStartedAt;
        metrics.serviceTotalMs += serviceMs;
        metrics.serviceMaxMs = Math.max(metrics.serviceMaxMs, serviceMs);
      }
      if (!record(after) || !timestamp(after.capturedAt) || !Array.isArray(after.records)
        || Date.parse(after.capturedAt) <= Date.parse(action.before.capturedAt)) fail('AUTHORITY_FRAME_REJECTED');
      this.assertControlCommitAllowed(signal);
      Object.assign(preparation, { state: 'ready', response, after });
      return Object.freeze({ preparationId, responseDigest });
    } catch (error) {
      metrics.failed += 1;
      preparation.state = 'failed';
      delete preparation.response;
      delete preparation.after;
      throw error;
    } finally {
      lease?.release();
    }
  }

  async finishBrowserAction({ projectName, actionId, responseBody, status, preparationMode,
    preparationId, responseDigest }, signal) {
    exactKeys(arguments[0], preparationMode === 'server-owned'
      ? ['projectName', 'actionId', 'status', 'preparationMode', 'preparationId', 'responseDigest']
      : ['projectName', 'actionId', 'responseBody', 'status'], 'BROWSER_ACTION_REJECTED');
    this.assertControlCommitAllowed(signal);
    if (!this.projects.has(projectName) || !DIGEST.test(actionId ?? '') || !Number.isInteger(status)
      || status < 0 || status > 599) fail('BROWSER_ACTION_REJECTED');
    const action = (this.browserActions.get(projectName) ?? []).find(item => item.actionId === actionId);
    if (!action || action.complete || action.finishClaimed) fail('BROWSER_ACTION_BINDING_REJECTED');
    const prepared = preparationMode === 'server-owned';
    if (preparationMode !== undefined && !prepared) fail('BROWSER_ACTION_PREPARATION_REJECTED');
    const preparation = prepared ? this.browserActionPreparations.get(actionId) : null;
    if (prepared && (responseBody !== undefined || !DIGEST.test(preparationId ?? '') || !DIGEST.test(responseDigest ?? '')
      || !preparation || preparation.state !== 'ready' || preparation.projectName !== projectName
      || preparation.status !== status || preparation.preparationId !== preparationId
      || preparation.responseDigest !== responseDigest)) fail('BROWSER_ACTION_PREPARATION_BINDING_REJECTED');
    if (!prepared && (preparationId !== undefined || responseDigest !== undefined
      || this.browserActionPreparations.has(actionId))) {
      fail('BROWSER_ACTION_PREPARATION_REJECTED');
    }
    action.finishClaimed = true;
    if (preparation) preparation.state = 'consuming';
    try {
      const response = prepared ? preparation.response : record(responseBody) ? responseBody : {};
      const first = (...values) => values.find(value => typeof value === 'string' && value.length > 0) ?? null;
      const resource = record(response.resource) ? response.resource : {};
      const commandId = first(response.commandId, response.resourceId, response.result?.commandId, response.data?.commandId,
        resource.id, resource.resourceId, resource.artifactId, resource.caseId, resource.taskId, resource.publicationId,
        resource.outcomeId, resource.assessmentId);
      const receiptId = first(response.receiptId, response.result?.receiptId, response.data?.receiptId, resource.receiptId);
      const classification = String(response.error?.code ?? response.errorCode ?? response.outcome
        ?? response.status ?? (status >= 200 && status < 300 ? 'COMMAND_ACCEPTED' : 'COMMAND_REJECTED'))
        .toUpperCase().replace(/[^A-Z0-9_]/gu, '_').slice(0, 80);
      const project = this.projects.get(projectName);
      const after = prepared ? preparation.after
        : await this.adapter.observe({ exerciseId: this.exerciseId, from: action.before.capturedAt, project, signal });
      if (!record(after) || !timestamp(after.capturedAt) || !Array.isArray(after.records)
        || Date.parse(after.capturedAt) <= Date.parse(action.before.capturedAt)) fail('AUTHORITY_FRAME_REJECTED');
      const responseObservation = {
        status,
        classification: /^[A-Z][A-Z0-9_]{1,80}$/u.test(classification) ? classification : 'COMMAND_OBSERVED',
        commandIdHash: commandId ? authenticatedHostedDigest(commandId) : null,
        receiptIdHash: receiptId ? authenticatedHostedDigest(receiptId) : null,
      };
      if (this.config.acceptanceMode === 'reviewer_selection_diagnostic'
        && ['assessment_v2.review.assign', 'assessment_v2.review.resolve'].includes(action.commandType)) {
        const trusted = await this.adapter.verifyReviewerSelectionAction?.({
          project, actorId: action.actorId, requestBody: action.rawRequestBody,
          responseBody: response, status, signal,
        });
        exactKeys(trusted, ['commandIdHash', 'receiptIdHash'], 'REVIEWER_SELECTION_ACTION_REJECTED');
        if (![trusted.commandIdHash, trusted.receiptIdHash].every(value => value === null || DIGEST.test(value))) {
          fail('REVIEWER_SELECTION_ACTION_REJECTED');
        }
        responseObservation.commandIdHash = trusted.commandIdHash;
        responseObservation.receiptIdHash = trusted.receiptIdHash;
      }
      this.assertControlCommitAllowed(signal);
      let assessmentFinalizeProof = null;
      if (action.route === ASSESS_FINALIZE_ROUTE && action.commandType === ASSESS_FINALIZE_COMMAND) {
        assessmentFinalizeProof = typeof this.adapter.verifyAssessmentFinalizeCase === 'function'
          ? await this.adapter.verifyAssessmentFinalizeCase({
            exerciseId: this.exerciseId,
            projectName,
            project,
            scope: this.config.scope,
            persona: action.persona,
            actorId: action.actorId,
            sessionId: action.sessionId,
            actorHash: action.actorHash,
            sessionHash: action.sessionHash,
            route: action.route,
            status,
            requestBody: action.rawRequestBody,
            responseBody: response,
            before: action.before,
            after,
            requestIdHash: action.requestIdHash,
            commandBindingHash: action.commandBindingHash,
            commandIdHash: responseObservation.commandIdHash,
            signal,
          }) : null;
        if (record(assessmentFinalizeProof) && DIGEST.test(assessmentFinalizeProof.receiptIdHash ?? '')) {
          responseObservation.receiptIdHash = assessmentFinalizeProof.receiptIdHash;
        }
      }
      this.assertControlCommitAllowed(signal);
      await this.adapter.recordBrowserAction?.({ exerciseId: this.exerciseId, projectName, persona: action.persona,
        route: action.route, status, requestBody: action.rawRequestBody, responseBody: response, signal });
      this.assertControlCommitAllowed(signal);
      action.response = responseObservation;
      action.after = after;
      action.assessmentFinalizeProof = assessmentFinalizeProof;
      action.complete = true;
      action.status = status;
      if (Date.parse(after.capturedAt) > Date.parse(project.lastBoundaryAt)) {
        project.lastBoundaryAt = after.capturedAt;
      }
      return { recorded: true, actionId: action.actionId };
    } finally {
      delete action.rawRequestBody;
      if (prepared) {
        delete preparation.response;
        delete preparation.after;
        this.browserActionPreparations.delete(actionId);
      }
    }
  }

  async armPermit(input, signal) {
    if (!this.active || this.quiesced || !AUTHENTICATED_HOSTED_FAULT_KINDS.includes(input.kind)
      || !UUID.test(input.actorId) || !UUID.test(input.sessionId) || !UUID.test(input.requestId)
      || !HEX_DIGEST.test(input.payloadHash) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
      fail('PERMIT_REJECTED');
    }
    const permit = await this.adapter.armPermit({
      exerciseId: this.exerciseId,
      permitId: this.randomId(),
      kind: input.kind,
      commandType: input.commandType,
      actorId: input.actorId,
      sessionId: input.sessionId,
      requestId: input.requestId,
      payloadHash: input.payloadHash,
      expectedVersion: input.expectedVersion,
      expiresAt: new Date(this.now().getTime() + 5 * 60_000).toISOString(),
      signal,
    });
    this.assertControlCommitAllowed(signal);
    return permit;
  }

  async armBrowserFault({ projectName, persona, kind, commandType, requestBody, accessToken }, signal) {
    if (!this.projects.has(projectName) || !AUTHENTICATED_HOSTED_PERSONAS.includes(persona)
      || !record(requestBody) || typeof commandType !== 'string') fail('PERMIT_REJECTED');
    const verified = await this.verifyPresentedBrowserSession({ projectName, persona, accessToken }, { signal });
    const browserProject = projectName.startsWith('desktop-chromium') ? 'desktop-chromium' : 'pixel-7-chromium';
    const bound = this.boundSessions.get(`${browserProject}:${persona}`);
    if (!bound || bound.actorId !== verified.claims.actorId || bound.sessionId !== verified.claims.sessionId) {
      fail('SESSION_VERIFY_REJECTED');
    }
    const requestId = requestBody.requestId;
    const expectedVersion = commandType === 'studio.generation.request'
      ? requestBody.expectedAggregateVersion : commandType === 'process.update' ? requestBody.expectedVersion : null;
    if (!UUID.test(requestId) || !Number.isSafeInteger(expectedVersion)) fail('PERMIT_REJECTED');
    return this.armPermit({
      kind,
      commandType,
      actorId: bound.actorId,
      sessionId: bound.sessionId,
      requestId,
      payloadHash: authenticatedHostedDigest(requestBody).slice('sha256:'.length),
      expectedVersion,
    }, signal);
  }

  async control(pathname, input, { signal } = {}) {
    return this.runControlOperation(
      ownedSignal => this.controlAccepted(pathname, input, ownedSignal),
      signal,
    );
  }

  async controlAccepted(pathname, input, signal) {
    this.assertControlCommitAllowed(signal);
    if (this.config.acceptanceMode === 'v2_primary_prefix_diagnostic' && this.v2ReloadCheckpoints.length === 3) {
      const terminalAllowed = new Set([
        '/control/browser-action-prepare', '/control/browser-action', '/control/browser-case',
        '/control/process-frame', '/control/assess-v2-frame', '/control/lifecycle-frame',
        '/control/studio-failure-frame', '/control/downstream-frame', '/control/scenario-decision',
        '/control/authenticated-controls/frame', '/control/snapshot',
      ]);
      if (!terminalAllowed.has(pathname)) fail('V2_RELOAD_DIAGNOSTIC_TERMINAL');
    }
    if (this.config.acceptanceMode === 'reviewer_selection_diagnostic' && this.browserCases.length === 1) {
      const drainAllowed = new Set([
        '/control/browser-action-prepare', '/control/browser-action',
        '/control/process-frame', '/control/assess-v2-frame', '/control/lifecycle-frame',
        '/control/studio-failure-frame', '/control/downstream-frame', '/control/scenario-decision',
        '/control/authenticated-controls/frame', '/control/snapshot',
      ]);
      if (!drainAllowed.has(pathname)) fail('REVIEWER_SELECTION_DIAGNOSTIC_TERMINAL');
    }
    if (pathname === '/control/setup') return this.setupProject(input.projectName, signal);
    if (pathname === '/control/bind-browser-session') return this.bindBrowserSession(input, signal);
    if (pathname === '/control/browser-case') return this.recordBrowserCase(input, signal);
    if (pathname === '/control/browser-action-start') return this.beginBrowserAction(input, signal);
    if (pathname === '/control/browser-action-prepare') return this.prepareBrowserAction(input, signal);
    if (pathname === '/control/browser-action') return this.finishBrowserAction(input, signal);
    if (pathname === '/control/arm-permit') return this.armPermit(input, signal);
    if (pathname === '/control/arm-browser-fault') return this.armBrowserFault(input, signal);
    if (pathname === '/control/browser-diagnostic') return this.recordIdentityDiagnostic(input, 'browser');
    if (pathname === '/control/v2-reload-diagnostic') return this.recordV2ReloadDiagnosticCheckpoint(input, signal);
    if (pathname === '/control/reviewer-selection-candidates') return this.recordReviewerSelectionCandidates(input, signal);
    const framePaths = new Set([
      '/control/process-frame', '/control/assess-v2-frame', '/control/lifecycle-frame',
      '/control/studio-failure-frame', '/control/downstream-frame', '/control/scenario-decision',
      '/control/authenticated-controls/frame', '/control/snapshot',
    ]);
    if (framePaths.has(pathname)) return this.captureFrame(pathname, input, signal);
    if (pathname === '/control/fail-next-studio-provider') fail('LEGACY_FAULT_CONTROL_REJECTED');
    return this.adapter.control(pathname, {
      ...input,
      exerciseId: this.exerciseId,
      project: this.projects.get(input.projectName),
      scope: this.config.scope,
      signal,
    });
  }

  recordIdentityDiagnostic({ projectName, diagnostic }, source = 'browser') {
    const project = projectName?.startsWith('desktop-chromium') ? 'desktop-chromium'
      : projectName?.startsWith('pixel-7-chromium') ? 'pixel-7-chromium' : null;
    const safe = validateAuthenticatedHostedIdentityDiagnostic(diagnostic);
    if (!project || !safe) fail('BROWSER_DIAGNOSTIC_REJECTED');
    if (!['parent','browser'].includes(source)) fail('BROWSER_DIAGNOSTIC_REJECTED');
    const key=source==='parent'?'parentIdentityDiagnostic':'browserIdentityDiagnostic';
    if (!this[key]) this[key] = Object.freeze({ source, project, ...safe });
    return { recorded: true };
  }

  failureDiagnostic() {
    const value=this.parentIdentityDiagnostic??this.browserIdentityDiagnostic;
    return value ? Object.freeze({ ...value }) : null;
  }

  async finalize() {
    if (this.quiesced) fail('ALREADY_QUIESCED');
    await this.stopControlIntakeAndJoin();
    if (this.browserActionPreparations.size !== 0) fail('BROWSER_ACTION_PREPARATION_INCOMPLETE');
    const expected = AUTHENTICATED_ACCEPTANCE_TEST_IDS.length * AUTHENTICATED_ACCEPTANCE_PROJECTS.length;
    if (this.browserCases.length !== expected || this.serverCases.length !== expected) fail('CASE_INVENTORY_INCOMPLETE');
    for (const testId of AUTHENTICATED_ACCEPTANCE_TEST_IDS) for (const project of AUTHENTICATED_ACCEPTANCE_PROJECTS) {
      if (!this.browserCases.some(item => item.testId === testId && item.project === project)) fail('CASE_INVENTORY_INCOMPLETE');
    }
    const quiesce = await this.adapter.quiesce({ exerciseId: this.exerciseId });
    const ownedProjects = this.cleanupProjects();
    await this.identity.revokeAll({ sessions: [...this.boundSessions.values()], projects: ownedProjects });
    const cleanup = await this.adapter.cleanup({
      exerciseId: this.exerciseId,
      projects: ownedProjects,
      sessions: [...this.boundSessions.values()],
    });
    const verified = await this.adapter.verifyCleanup({ exerciseId: this.exerciseId,
      actorIds: [...(this.identity.created?.keys?.() ?? [])], projects: ownedProjects });
    if (!verified || verified.activeSessions !== 0 || verified.activeIdentities !== 0 || verified.activeMemberships !== 0
      || verified.armedPermits !== 0 || verified.activeSecretMaterial !== 0
      || verified.unapprovedActiveResidue !== 0 || verified.nonExerciseChanged !== false
      || verified.immutableHistoryPreserved !== true || !timestamp(verified.capturedAt)
      || Date.parse(verified.capturedAt) < Date.parse(this.startedAt)
      || (this.identity.unknownMutationOutcomes?.size ?? 0) > 0) fail('CLEANUP_REJECTED');
    this.quiesced = true;
    const completedAt = verified.capturedAt;
    const profile = controllerProfile(this.config, { startedAt: this.startedAt, completedAt }, [...this.boundSessions.values()]);
    const identity = authenticatedRawIdentity(profile);
    const browser = { schemaVersion: AUTHENTICATED_BROWSER_CORRELATION_SCHEMA, identity, cases: this.browserCases };
    const server = {
      schemaVersion: AUTHENTICATED_SERVER_OBSERVATION_SCHEMA,
      identity,
      cases: this.serverCases,
      cleanup: {
        capturedAt: verified.capturedAt,
        resources: verified.resources,
        nonExerciseStateBeforeHash: verified.nonExerciseStateBeforeHash,
        nonExerciseStateAfterHash: verified.nonExerciseStateAfterHash,
      },
    };
    void quiesce; void cleanup;
    assertSecretFree(profile); assertSecretFree(browser); assertSecretFree(server);
    const browserErrors = validateAuthenticatedBrowserCorrelations(browser, profile);
    const serverErrors = validateAuthenticatedServerObservations(server, profile);
    if (browserErrors.length || serverErrors.length) {
      throw new Error(`AUTHENTICATED_HOSTED_CONTROLLER_OUTPUT_REJECTED:${[...browserErrors, ...serverErrors].join(',')}`);
    }
    return { profile, browser, server };
  }

  async abortAndQuiesce() {
    if ((!this.active && !this.activationAttempted) || this.quiesced) return { quiesced: this.quiesced };
    const errors=[];const attempt=async operation=>{try{return await operation();}catch(error){errors.push(error);return null;}};
    await attempt(()=>this.stopControlIntakeAndJoin());
    if (this.controlOperations.size > 0 || this.controlIntake !== 'stopped') {
      throw new AggregateError(errors.length ? errors : [new Error('AUTHENTICATED_HOSTED_CONTROLLER_CONTROL_WORK_INCOMPLETE')],
        'AUTHENTICATED_HOSTED_CONTROLLER_ABORT_CLEANUP_REJECTED');
    }
    this.browserActionPreparations.clear();
    const ownedProjects=this.cleanupProjects();
    await attempt(()=>this.adapter.quiesce({ exerciseId: this.exerciseId }));
    await attempt(()=>this.identity.revokeAll({ sessions: [...this.boundSessions.values()], projects: ownedProjects }));
    await attempt(()=>this.adapter.cleanup({exerciseId:this.exerciseId,projects:ownedProjects,
      sessions:[...this.boundSessions.values()]}));
    const verified=await attempt(()=>this.adapter.verifyCleanup({exerciseId:this.exerciseId,
      actorIds:[...(this.identity.created?.keys?.()??[])],projects:ownedProjects}));
    if (!verified || verified.activeSessions !== 0 || verified.activeIdentities !== 0 || verified.activeMemberships !== 0
      || verified.armedPermits !== 0 || verified.activeSecretMaterial !== 0
      || verified.unapprovedActiveResidue !== 0 || verified.nonExerciseChanged !== false
      || verified.immutableHistoryPreserved !== true || (this.identity.unknownMutationOutcomes?.size ?? 0) > 0) {
      errors.push(new Error('AUTHENTICATED_HOSTED_CONTROLLER_ABORT_CLEANUP_REJECTED'));
    }
    if(errors.length)throw new AggregateError(errors,'AUTHENTICATED_HOSTED_CONTROLLER_ABORT_CLEANUP_REJECTED');
    this.quiesced = true;
    return { quiesced: true };
  }
}

export async function startAuthenticatedHostedControllerServer(controller, { host = '127.0.0.1', port = 0,
  requestTimeoutMs = AUTHENTICATED_HOSTED_OPERATION_TIMEOUT_MS,
  settlementTimeoutMs = AUTHENTICATED_HOSTED_OPERATION_TIMEOUT_MS } = {}) {
  if (host !== '127.0.0.1') fail('NON_LOOPBACK_BIND_REJECTED');
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1
    || requestTimeoutMs > AUTHENTICATED_HOSTED_OPERATION_TIMEOUT_MS) fail('REQUEST_TIMEOUT_REJECTED');
  const handlers = new Set();
  const active = new Set();
  let accepting = true;
  let stopping = null;
  const send = (response, status, body) => new Promise((resolve, reject) => {
    if (response.destroyed || response.writableEnded) { reject(new Error('AUTHENTICATED_HOSTED_CONTROLLER_RESPONSE_ABORTED')); return; }
    const cleanup = () => {
      response.removeListener('finish', onFinish);
      response.removeListener('close', onClose);
      response.removeListener('error', onError);
    };
    const onFinish = () => { cleanup(); resolve(); };
    const onClose = () => {
      if (response.writableFinished) onFinish();
      else { cleanup(); reject(new Error('AUTHENTICATED_HOSTED_CONTROLLER_RESPONSE_ABORTED')); }
    };
    const onError = () => { cleanup(); reject(new Error('AUTHENTICATED_HOSTED_CONTROLLER_RESPONSE_ABORTED')); };
    response.once('finish', onFinish);
    response.once('close', onClose);
    response.once('error', onError);
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify(body));
  });
  const server = createServer((request, response) => {
    const abort = new AbortController();
    const abortRequest = () => {
      abort.abort('REQUEST_ABORTED');
      if (!request.complete && !request.destroyed) request.destroy();
      if (!response.writableEnded && !response.destroyed) response.destroy();
    };
    const onRequestAborted = () => abortRequest();
    const onRequestClose = () => { if (!request.complete) abortRequest(); };
    const onResponseClose = () => { if (!response.writableEnded) abortRequest(); };
    request.once('aborted', onRequestAborted);
    request.once('close', onRequestClose);
    response.once('close', onResponseClose);
    const timer = setTimeout(abortRequest, requestTimeoutMs);
    timer.unref?.();
    const entry = { abort: abortRequest };
    active.add(entry);
    const running = (async () => {
      if (!accepting) return send(response, 503, { error: 'AUTHENTICATED_HOSTED_CONTROLLER_INTAKE_CLOSED' });
      try {
        const url = new URL(request.url, `http://${host}`);
        if (request.method === 'GET' && url.pathname === '/health') {
          return await send(response, 200, { ok: true, schemaVersion: AUTHENTICATED_HOSTED_CONTROLLER_SCHEMA });
        }
        if (request.method !== 'POST' || !url.pathname.startsWith('/control/')) {
          return await send(response, 404, { error: 'NOT_FOUND' });
        }
        if (request.headers['x-enterprise-lifecycle-control'] !== controller.controlToken) {
          return await send(response, 403, { error: 'CONTROL_DENIED' });
        }
        const result = await controller.control(url.pathname, await safeJson(request, { signal: abort.signal }),
          { signal: abort.signal });
        return await send(response, 200, result);
      } catch (error) {
        const code = String(error?.message ?? error).match(/AUTHENTICATED_HOSTED_CONTROLLER_[A-Z0-9_]+/u)?.[0]
          ?? 'AUTHENTICATED_HOSTED_CONTROLLER_FAILED';
        if (!response.destroyed && !response.writableEnded) {
          await send(response, code.endsWith('_NOT_FOUND') ? 404 : 409, { error: code }).catch(() => undefined);
        }
      }
    })().finally(() => {
      clearTimeout(timer);
      request.removeListener('aborted', onRequestAborted);
      request.removeListener('close', onRequestClose);
      response.removeListener('close', onResponseClose);
      active.delete(entry);
      handlers.delete(running);
    });
    handlers.add(running);
    running.catch(() => undefined);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') fail('SERVER_BIND_REJECTED');
  const stopAndDrain = () => {
    if (stopping) return stopping;
    accepting = false;
    controller.stopControlIntake?.();
    const closeResult = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    closeResult.catch(() => undefined);
    for (const entry of active) entry.abort();
    server.closeIdleConnections?.();
    stopping = (async () => {
      await waitForAuthenticatedHostedSettlement(handlers, settlementTimeoutMs, 'SERVER_WORK_INCOMPLETE');
      await controller.joinControlOperations?.({ timeoutMs: settlementTimeoutMs });
      server.closeAllConnections?.();
      const closing = new Set([closeResult]);
      closeResult.then(() => closing.delete(closeResult), () => closing.delete(closeResult));
      await waitForAuthenticatedHostedSettlement(closing, settlementTimeoutMs, 'SERVER_CLOSE_INCOMPLETE');
      return { settled: true };
    })();
    stopping.catch(() => undefined);
    return stopping;
  };
  return {
    baseUrl: `http://${host}:${address.port}`,
    controlToken: controller.controlToken,
    stopAndDrain,
    close: stopAndDrain,
  };
}
