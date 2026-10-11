import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
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

export const AUTHENTICATED_HOSTED_CONTROLLER_SCHEMA = 'authenticated-hosted-controller-v1';
export const AUTHENTICATED_HOSTED_AUTHORITY_SCHEMA = 'authenticated-synthetic-authority-observation-v1';
export const AUTHENTICATED_HOSTED_OUTPUT_PATHS = Object.freeze({
  browser: '/tmp/authenticated-browser-correlations.json',
  server: '/tmp/authenticated-server-observations.json',
  binding: '/tmp/authenticated-controller-binding.json',
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
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = code => { throw new Error(`AUTHENTICATED_HOSTED_CONTROLLER_${code}`); };
const timestamp = value => typeof value === 'string'
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;
const exactKeys = (value, expected, code) => {
  if (!record(value) || !isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort())) fail(code);
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

const safeOrigin = value => {
  let parsed;
  try { parsed = new URL(value); } catch { fail('ORIGIN_REJECTED'); }
  if (parsed.protocol !== 'https:' || parsed.origin !== value || parsed.username || parsed.password
    || parsed.hostname !== 'avalaos-pilot.netlify.app') fail('ORIGIN_REJECTED');
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
  if (environment.GITHUB_ACTIONS !== 'true' || environment.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    fail('WORKFLOW_RUNTIME_REQUIRED');
  }
  if (!SHA.test(environment.RELEASE_SHA ?? '') || environment.GITHUB_SHA !== environment.RELEASE_SHA) {
    fail('EXACT_RELEASE_REQUIRED');
  }
  if (environment.AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND !== 'hosted_authenticated_synthetic'
    || environment.AUTHENTICATED_ACCEPTANCE_AUTH_KIND !== 'supabase_auth') fail('EXECUTION_PROFILE_REJECTED');
  const secretBackendKind = environment.AUTHENTICATED_ACCEPTANCE_SECRET_BACKEND;
  if (!['hashicorp_vault', 'supabase_vault'].includes(secretBackendKind)
    || environment.AVALA_PROVIDER_SECRET_BACKEND !== secretBackendKind) fail('SECRET_BACKEND_SELECTOR_REJECTED');
  const origin = safeOrigin(environment.HOSTED_PILOT_URL);
  const target = supabaseTarget(environment.AUTHENTICATED_ACCEPTANCE_SUPABASE_URL);
  if (environment.AUTHENTICATED_ACCEPTANCE_EXPECTED_PROJECT_REF !== target.projectRef
    || !DIGEST.test(environment.AUTHENTICATED_ACCEPTANCE_TARGET_PUBLIC_DIGEST ?? '')) fail('SUPABASE_TARGET_REJECTED');
  if (!/^[0-9a-f]{24}$/u.test(environment.NETLIFY_DEPLOY_ID ?? '')) fail('DEPLOYMENT_REJECTED');
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
    origin,
    deploymentId: environment.NETLIFY_DEPLOY_ID,
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
  return {
    schemaVersion: 'hosted-authenticated-synthetic-profile-v3',
    executionKind: 'hosted_authenticated_synthetic',
    authKind: 'supabase_auth',
    releaseSha: config.releaseSha,
    checkoutSha: config.releaseSha,
    origin: config.origin,
    deploymentId: config.deploymentId,
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

const safeJson = async request => {
  const raw = await request.text();
  if (raw.length > 2_000_000) fail('REQUEST_TOO_LARGE');
  try { return raw ? JSON.parse(raw) : {}; } catch { fail('REQUEST_JSON_REJECTED'); }
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
    this.controlToken = randomBytes(32).toString('base64url');
    this.projects = new Map();
    this.projectIdentitySets = new Map();
    this.boundSessions = new Map();
    this.browserActions = new Map();
    this.browserCases = [];
    this.serverCases = [];
    this.active = false;
    this.quiesced = false;
  }

  async preflightAndActivate() {
    const preflight = await this.adapter.preflight({ config: this.config, exerciseId: this.exerciseId });
    if (!record(preflight) || preflight.syntheticTarget !== true || preflight.production === true
      || preflight.releaseSha !== this.config.releaseSha || preflight.deploymentId !== this.config.deploymentId
      || preflight.migrationVersion !== this.config.migrationVersion || preflight.backendDigest !== this.config.backendDigest
      || preflight.providersEnabled !== false || preflight.runtimeReady!==true
      || preflight.secretBackendKind !== this.config.secretBackendKind || preflight.secretBackendWritable !== true
      || preflight.publicTargetDigest !== this.config.targetPublicDigest
      || preflight.baselineDigest !== this.config.baselineDigest
      || preflight.customerRows !== 0 || preflight.unapprovedActiveResidue !== 0
      || preflight.scopeReady!==true) fail('PREFLIGHT_REJECTED');
    await this.adapter.activate({
      exerciseId: this.exerciseId,
      releaseSha: this.config.releaseSha,
      deploymentId: this.config.deploymentId,
      origin: this.config.origin,
      backendDigest: this.config.backendDigest,
      migrationVersion: this.config.migrationVersion,
      migrationDigest: this.config.migrationDigest,
      exerciseDigest: this.config.exerciseDigest,
      profileVersion: 'hosted-authenticated-synthetic-profile-v3',
      catalogDigest: this.config.catalogDigest,
      sourceDigest: this.config.sourceDigest,
      organizationId: this.config.scope.organizationId,
      workspaceId: this.config.scope.workspaceId,
      expiresAt: new Date(this.now().getTime() + 45 * 60_000).toISOString(),
    });
    this.active = true;
    return { ok: true, schemaVersion: AUTHENTICATED_HOSTED_CONTROLLER_SCHEMA };
  }

  async setupProject(projectName) {
    if (!this.active || this.quiesced) fail('EXERCISE_NOT_ACTIVE');
    if (!SAFE_NAME.test(projectName) && !/^(desktop-chromium|pixel-7-chromium)(?:-[a-z0-9-]{1,63})?$/u.test(projectName)) {
      fail('PROJECT_NAME_REJECTED');
    }
    if (this.projects.has(projectName)) return this.projects.get(projectName).browserSetup;
    const browserProject = projectName.startsWith('desktop-chromium') ? 'desktop-chromium'
      : projectName.startsWith('pixel-7-chromium') ? 'pixel-7-chromium' : null;
    if (!browserProject) fail('PROJECT_NAME_REJECTED');
    let identities = this.projectIdentitySets.get(browserProject);
    if (!identities) {
      identities = await this.identity.provisionProject({
        projectName: browserProject,
        exerciseId: this.exerciseId,
        exerciseDigest: this.config.exerciseDigest,
        scope: this.config.scope,
        personas: AUTHENTICATED_HOSTED_PERSONAS,
      });
      this.projectIdentitySets.set(browserProject, identities);
    }
    const project = await this.adapter.setupProject({
      projectName,
      exerciseId: this.exerciseId,
      exerciseDigest: this.config.exerciseDigest,
      scope: this.config.scope,
      identities,
    });
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
    this.projects.set(projectName, { ...project, identities, browserSetup, lastBoundaryAt: this.now().toISOString() });
    return browserSetup;
  }

  async bindBrowserSession({ projectName, persona, accessToken }) {
    const project = this.projects.get(projectName);
    if (!project || !AUTHENTICATED_HOSTED_PERSONAS.includes(persona)) fail('SESSION_SCOPE_REJECTED');
    const claims = decodeJwtClaims(accessToken);
    if (claims.actorId !== project.identities[persona].id) fail('SESSION_ACTOR_REJECTED');
    const verified = await this.identity.verifySession({ accessToken, ...claims });
    if (!verified || verified.actorId !== claims.actorId || verified.sessionId !== claims.sessionId) fail('SESSION_VERIFY_REJECTED');
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
        persona: `${persona}_${browserProject}` });
      this.boundSessions.set(key, { ...binding, actorId: claims.actorId, sessionId: claims.sessionId });
    }
    return { bound: true, actorHash: binding.actorHash, sessionHash: binding.sessionHash };
  }

  async captureFrame(pathname, input) {
    const project = this.projects.get(input.projectName);
    if (!project) fail('PROJECT_NOT_FOUND');
    return this.adapter.frame(pathname, { ...input, project, scope: this.config.scope });
  }

  async recordBrowserCase({ projectName, row, actionIds }) {
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
    const firstAction = ordered[0];
    const lastAction = ordered.toSorted((a, b) => Date.parse(b.after.capturedAt) - Date.parse(a.after.capturedAt))[0];
    const scope = this.projects.get(projectName);
    if (row.testId === 'AI-004' && this.config.secretBackendKind === 'supabase_vault') {
      const physical = await this.adapter.verifySecretMaterialCase?.({
        exerciseId: this.exerciseId,
        projectName,
        project: scope,
        testId: row.testId,
      });
      if (!record(physical) || physical.backendKind !== this.config.secretBackendKind
        || physical.exists !== true || physical.fingerprintMatches !== true) fail('SECRET_MATERIAL_EVIDENCE_REJECTED');
    }
    const independent = { before: firstAction.before, after: lastAction.after };
    const startedAt = independent.before.capturedAt;
    const completedAt = independent.after.capturedAt;
    scope.lastBoundaryAt = completedAt;
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
    this.browserCases.push({
      testId: row.testId,
      project,
      scenario: authenticatedAcceptanceScenario(row.testId),
      window: { startedAt, completedAt },
      participants,
      actions: actions.map(({ persona, before, after, complete, route, status, rawRequestBody, ...action }) => action),
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

  async resolveBrowserActionBinding({ projectName, accessToken }) {
    const claims = decodeJwtClaims(accessToken);
    const browserProject = projectName.startsWith('desktop-chromium') ? 'desktop-chromium' : 'pixel-7-chromium';
    let binding = [...this.boundSessions.values()].find(item => item.project === browserProject
      && item.actorId === claims.actorId && item.sessionId === claims.sessionId);
    if (!binding) {
      const project = this.projects.get(projectName);
      const persona = AUTHENTICATED_HOSTED_PERSONAS.find(candidate => project.identities[candidate]?.id === claims.actorId);
      if (!persona) fail('BROWSER_ACTION_SESSION_REJECTED');
      await this.bindBrowserSession({ projectName, persona, accessToken });
      binding = this.boundSessions.get(`${browserProject}:${persona}`);
    }
    if (!binding) fail('BROWSER_ACTION_SESSION_REJECTED');
    return binding;
  }

  async beginBrowserAction({ projectName, accessToken, requestBody, route }) {
    if (!this.projects.has(projectName) || !record(requestBody) || typeof route !== 'string'
      || !/^\/(?:functions\/v1\/[a-z0-9-]+|rest\/v1\/rpc\/[a-z0-9_]+)$/u.test(route)) fail('BROWSER_ACTION_REJECTED');
    const binding = await this.resolveBrowserActionBinding({ projectName, accessToken });
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
    const boundaryAt = this.now().toISOString();
    const before = await this.adapter.observe({ exerciseId: this.exerciseId, from: this.startedAt,
      to: boundaryAt, project });
    if (!record(before) || !timestamp(before.capturedAt) || !Array.isArray(before.records)) fail('AUTHORITY_FRAME_REJECTED');
    const actionId = authenticatedHostedDigest(this.randomId());
    const action = { actionId, occurredAt: before.capturedAt, actorHash: binding.actorHash,
      sessionHash: binding.sessionHash, ...hashes, response: null, persona: binding.persona,
      before, after: null, complete: false, route, rawRequestBody: requestBody };
    const actions = this.browserActions.get(projectName) ?? [];
    actions.push(action);
    this.browserActions.set(projectName, actions);
    return { actionId };
  }

  async finishBrowserAction({ projectName, actionId, responseBody, status }) {
    if (!this.projects.has(projectName) || !DIGEST.test(actionId ?? '') || !Number.isInteger(status)
      || status < 0 || status > 599) fail('BROWSER_ACTION_REJECTED');
    const action = (this.browserActions.get(projectName) ?? []).find(item => item.actionId === actionId);
    if (!action || action.complete) fail('BROWSER_ACTION_BINDING_REJECTED');
    const response = record(responseBody) ? responseBody : {};
    const first = (...values) => values.find(value => typeof value === 'string' && value.length > 0) ?? null;
    const resource = record(response.resource) ? response.resource : {};
    const commandId = first(response.commandId, response.resourceId, response.result?.commandId, response.data?.commandId,
      resource.id, resource.resourceId, resource.artifactId, resource.caseId, resource.taskId, resource.publicationId,
      resource.outcomeId);
    const receiptId = first(response.receiptId, response.result?.receiptId, response.data?.receiptId, resource.receiptId);
    const classification = String(response.error?.code ?? response.errorCode ?? response.outcome
      ?? response.status ?? (status >= 200 && status < 300 ? 'COMMAND_ACCEPTED' : 'COMMAND_REJECTED'))
      .toUpperCase().replace(/[^A-Z0-9_]/gu, '_').slice(0, 80);
    const capturedAt = this.now().toISOString();
    const project = this.projects.get(projectName);
    const after = await this.adapter.observe({ exerciseId: this.exerciseId, from: action.before.capturedAt,
      to: capturedAt, project });
    if (!record(after) || !timestamp(after.capturedAt) || !Array.isArray(after.records)
      || Date.parse(after.capturedAt) <= Date.parse(action.before.capturedAt)) fail('AUTHORITY_FRAME_REJECTED');
    action.response = {
        status,
        classification: /^[A-Z][A-Z0-9_]{1,80}$/u.test(classification) ? classification : 'COMMAND_OBSERVED',
        commandIdHash: commandId ? authenticatedHostedDigest(commandId) : null,
        receiptIdHash: receiptId ? authenticatedHostedDigest(receiptId) : null,
    };
    action.after = after;
    action.complete = true;
    action.status = status;
    try{
      await this.adapter.recordBrowserAction?.({ exerciseId: this.exerciseId, projectName, persona: action.persona,
        route: action.route, status, requestBody: action.rawRequestBody, responseBody: response });
    }finally{delete action.rawRequestBody;}
    return { recorded: true, actionId: action.actionId };
  }

  async armPermit(input) {
    if (!this.active || this.quiesced || !AUTHENTICATED_HOSTED_FAULT_KINDS.includes(input.kind)
      || !UUID.test(input.actorId) || !UUID.test(input.sessionId) || !UUID.test(input.requestId)
      || !HEX_DIGEST.test(input.payloadHash) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
      fail('PERMIT_REJECTED');
    }
    return this.adapter.armPermit({
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
    });
  }

  async armBrowserFault({ projectName, persona, kind, commandType, requestBody, accessToken }) {
    if (!this.projects.has(projectName) || !AUTHENTICATED_HOSTED_PERSONAS.includes(persona)
      || !record(requestBody) || typeof commandType !== 'string') fail('PERMIT_REJECTED');
    const claims = decodeJwtClaims(accessToken);
    const browserProject = projectName.startsWith('desktop-chromium') ? 'desktop-chromium' : 'pixel-7-chromium';
    const bound = this.boundSessions.get(`${browserProject}:${persona}`);
    if (!bound || bound.actorId !== claims.actorId) fail('SESSION_VERIFY_REJECTED');
    const requestId = requestBody.requestId;
    const expectedVersion = commandType === 'studio.generation.request'
      ? requestBody.expectedAggregateVersion : commandType === 'process.update' ? requestBody.expectedVersion : null;
    if (!UUID.test(requestId) || !Number.isSafeInteger(expectedVersion)) fail('PERMIT_REJECTED');
    return this.armPermit({
      kind,
      commandType,
      actorId: claims.actorId,
      sessionId: claims.sessionId,
      requestId,
      payloadHash: authenticatedHostedDigest(requestBody).slice('sha256:'.length),
      expectedVersion,
    });
  }

  async control(pathname, input) {
    if (pathname === '/control/setup') return this.setupProject(input.projectName);
    if (pathname === '/control/bind-browser-session') return this.bindBrowserSession(input);
    if (pathname === '/control/browser-case') return this.recordBrowserCase(input);
    if (pathname === '/control/browser-action-start') return this.beginBrowserAction(input);
    if (pathname === '/control/browser-action') return this.finishBrowserAction(input);
    if (pathname === '/control/arm-permit') return this.armPermit(input);
    if (pathname === '/control/arm-browser-fault') return this.armBrowserFault(input);
    const framePaths = new Set([
      '/control/process-frame', '/control/assess-v2-frame', '/control/lifecycle-frame',
      '/control/studio-failure-frame', '/control/downstream-frame', '/control/scenario-decision',
      '/control/authenticated-controls/frame', '/control/snapshot',
    ]);
    if (framePaths.has(pathname)) return this.captureFrame(pathname, input);
    if (pathname === '/control/fail-next-studio-provider') fail('LEGACY_FAULT_CONTROL_REJECTED');
    return this.adapter.control(pathname, {
      ...input,
      exerciseId: this.exerciseId,
      project: this.projects.get(input.projectName),
      scope: this.config.scope,
    });
  }

  async finalize() {
    if (this.quiesced) fail('ALREADY_QUIESCED');
    const expected = AUTHENTICATED_ACCEPTANCE_TEST_IDS.length * AUTHENTICATED_ACCEPTANCE_PROJECTS.length;
    if (this.browserCases.length !== expected || this.serverCases.length !== expected) fail('CASE_INVENTORY_INCOMPLETE');
    for (const testId of AUTHENTICATED_ACCEPTANCE_TEST_IDS) for (const project of AUTHENTICATED_ACCEPTANCE_PROJECTS) {
      if (!this.browserCases.some(item => item.testId === testId && item.project === project)) fail('CASE_INVENTORY_INCOMPLETE');
    }
    const completedAt = this.now().toISOString();
    const quiesce = await this.adapter.quiesce({ exerciseId: this.exerciseId });
    await this.identity.revokeAll({ sessions: [...this.boundSessions.values()], projects: [...this.projects.values()] });
    const cleanup = await this.adapter.cleanup({
      exerciseId: this.exerciseId,
      projects: [...this.projects.values()],
      sessions: [...this.boundSessions.values()],
    });
    const verified = await this.adapter.verifyCleanup({ exerciseId: this.exerciseId,
      actorIds: [...(this.identity.created?.keys?.() ?? [])], projects: [...this.projects.values()] });
    if (!verified || verified.activeSessions !== 0 || verified.activeIdentities !== 0 || verified.activeMemberships !== 0
      || verified.armedPermits !== 0 || verified.activeSecretMaterial !== 0
      || verified.unapprovedActiveResidue !== 0 || verified.nonExerciseChanged !== false
      || verified.immutableHistoryPreserved !== true) fail('CLEANUP_REJECTED');
    this.quiesced = true;
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
    if (!this.active || this.quiesced) return { quiesced: this.quiesced };
    const errors=[];const attempt=async operation=>{try{return await operation();}catch(error){errors.push(error);return null;}};
    await attempt(()=>this.adapter.quiesce({ exerciseId: this.exerciseId }));
    await attempt(()=>this.identity.revokeAll({ sessions: [...this.boundSessions.values()], projects: [...this.projects.values()] }));
    await attempt(()=>this.adapter.cleanup({exerciseId:this.exerciseId,projects:[...this.projects.values()],
      sessions:[...this.boundSessions.values()]}));
    const verified=await attempt(()=>this.adapter.verifyCleanup({exerciseId:this.exerciseId,
      actorIds:[...(this.identity.created?.keys?.()??[])],projects:[...this.projects.values()]}));
    if (!verified || verified.activeSessions !== 0 || verified.activeIdentities !== 0 || verified.activeMemberships !== 0
      || verified.armedPermits !== 0 || verified.activeSecretMaterial !== 0
      || verified.unapprovedActiveResidue !== 0 || verified.nonExerciseChanged !== false
      || verified.immutableHistoryPreserved !== true) errors.push(new Error('AUTHENTICATED_HOSTED_CONTROLLER_ABORT_CLEANUP_REJECTED'));
    if(errors.length)throw new AggregateError(errors,'AUTHENTICATED_HOSTED_CONTROLLER_ABORT_CLEANUP_REJECTED');
    this.quiesced = true;
    return { quiesced: true };
  }
}

export async function startAuthenticatedHostedControllerServer(controller, { host = '127.0.0.1', port = 0 } = {}) {
  if (host !== '127.0.0.1') fail('NON_LOOPBACK_BIND_REJECTED');
  const server = createServer(async (request, response) => {
    const send = (status, body) => {
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify(body));
    };
    try {
      const url = new URL(request.url, `http://${host}`);
      if (request.method === 'GET' && url.pathname === '/health') return send(200, { ok: true, schemaVersion: AUTHENTICATED_HOSTED_CONTROLLER_SCHEMA });
      if (request.method !== 'POST' || !url.pathname.startsWith('/control/')) return send(404, { error: 'NOT_FOUND' });
      if (request.headers['x-enterprise-lifecycle-control'] !== controller.controlToken) return send(403, { error: 'CONTROL_DENIED' });
      const result = await controller.control(url.pathname, await safeJson(request));
      return send(200, result);
    } catch (error) {
      const code = String(error?.message ?? error).match(/AUTHENTICATED_HOSTED_CONTROLLER_[A-Z0-9_]+/u)?.[0]
        ?? 'AUTHENTICATED_HOSTED_CONTROLLER_FAILED';
      return send(code.endsWith('_NOT_FOUND') ? 404 : 409, { error: code });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') fail('SERVER_BIND_REJECTED');
  return {
    baseUrl: `http://${host}:${address.port}`,
    controlToken: controller.controlToken,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}
