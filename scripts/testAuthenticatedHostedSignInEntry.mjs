import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  AuthenticatedHostedController,
  authenticatedHostedDigest,
  startAuthenticatedHostedControllerServer,
} from './authenticatedHostedController.mjs';

const execFileAsync = promisify(execFile);
const LOOPBACK_HOST = '127.0.0.1';
const MAX_REQUEST_BYTES = 16 * 1024;
const PUBLIC_ANON_KEY = 'sb_publishable_authenticated_hosted_sign_in_entry';
const PREVIEW_ORIGIN = 'https://deploy-preview-264--avalaos-pilot.netlify.app';
// Inert canonical project reference, shared with the controller's synthetic fixtures.
const SYNTHETIC_PROJECT_REF = 'abcdefghijklmnopqrst';
const BACKEND_ORIGIN = `https://${SYNTHETIC_PROJECT_REF}.supabase.co`;
const RELEASE_SHA = 'a'.repeat(40);
const DEPLOY_ID = 'b'.repeat(24);
const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const EXERCISE_DIGEST = digest('authenticated-hosted-composed-exercise');
const TARGET_FINGERPRINT = digest('authenticated-hosted-composed-target');
const PUBLIC_TARGET_DIGEST = digest(`${BACKEND_ORIGIN}\n${PUBLIC_ANON_KEY}`);
const ORGANIZATION_ID = '20000000-0000-4000-8000-000000000001';
const WORKSPACE_ID = '30000000-0000-4000-8000-000000000001';
const PASSTHROUGH_ENVIRONMENT = Object.freeze([
  'ComSpec', 'PATH', 'PATHEXT', 'PLAYWRIGHT_BROWSERS_PATH', 'SystemRoot', 'TEMP', 'TMP', 'WINDIR',
]);

export const AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS = Object.freeze([
  'desktop-chromium',
  'pixel-7-chromium',
]);

export const authenticatedHostedSignInEntryChildEnvironment = (source = process.env, overrides = {}) => {
  const selected = {};
  for (const name of PASSTHROUGH_ENVIRONMENT) {
    if (typeof source[name] === 'string' && source[name] !== '') selected[name] = source[name];
  }
  return { ...selected, ...overrides };
};

export const assertAuthenticatedHostedSignInEntryLoopbackUrl = value => {
  const parsed = new URL(value);
  if (parsed.protocol !== 'http:' || parsed.hostname !== LOOPBACK_HOST || !/^\d+$/u.test(parsed.port)
    || parsed.username !== '' || parsed.password !== '' || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_NON_LOOPBACK_URL_REJECTED');
  }
  return parsed.origin;
};

const availablePort = () => new Promise((resolve, reject) => {
  const probe = createNetServer();
  probe.once('error', reject);
  probe.listen({ host: LOOPBACK_HOST, port: 0, exclusive: true }, () => {
    const address = probe.address();
    const port = typeof address === 'object' && address ? address.port : null;
    probe.close(error => error ? reject(error) : resolve(port));
  });
});

const readBody = incoming => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  incoming.on('data', chunk => {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      reject(new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_REQUEST_TOO_LARGE'));
      incoming.destroy();
      return;
    }
    chunks.push(chunk);
  });
  incoming.once('error', reject);
  incoming.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
});

const responseHeaders = Object.freeze({
  'access-control-allow-headers': 'accept-profile, apikey, authorization, content-profile, content-type, prefer, range, x-client-info',
  'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
});

const sendJson = (outgoing, status, value) => {
  outgoing.writeHead(status, responseHeaders);
  outgoing.end(value === undefined ? '' : JSON.stringify(value));
};

const tokenFor = (actorId, sessionId) => `${Buffer.from('{}').toString('base64url')}.${
  Buffer.from(JSON.stringify({ sub: actorId, session_id: sessionId })).toString('base64url')}.${'x'.repeat(48)}`;
const personaDefinition = Object.freeze({
  author: { actor: 'A', password: 'synthetic-author-password' },
  reviewer: { actor: 'B', password: 'synthetic-reviewer-password' },
  approver: { actor: 'C', password: 'synthetic-approver-password' },
  outsider: { actor: 'D', password: 'synthetic-outsider-password' },
});
const identityRows = Object.freeze(Object.fromEntries(AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS.flatMap((projectName, projectIndex) =>
  Object.entries(personaDefinition).map(([persona, definition], personaIndex) => {
    const ordinal = personaIndex < 2 ? projectIndex * 2 + personaIndex + 1 : 5 + projectIndex * 2 + (personaIndex - 2);
    const actorId = `10000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;
    const sessionId = `11000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;
    const email = `${persona}.${projectName}@local.invalid`;
    return [email, {
      projectName,
      actor: definition.actor,
      persona,
      password: definition.password,
      sessionId,
      token: tokenFor(actorId, sessionId),
      user: {
        id: actorId,
        email,
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: { provider: 'loopback' },
        user_metadata: { full_name: `Synthetic ${persona}` },
      },
    }];
  }))));
const identitiesByToken = new Map(Object.values(identityRows).map(identity => [identity.token, identity]));
const identitiesByProject = new Map(AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS.map(projectName => [projectName,
  Object.fromEntries(Object.values(identityRows).filter(identity => identity.projectName === projectName)
    .map(identity => [identity.persona, { id: identity.user.id, email: identity.user.email, password: identity.password }]))]));

const bearerToken = incoming => String(incoming.headers.authorization ?? '').replace(/^Bearer\s+/iu, '');
const projectFromRejectedEmail = email => {
  const match = /^rejected\.(desktop-chromium|pixel-7-chromium)@local[.]invalid$/u.exec(email);
  return match?.[1] ?? null;
};

export const startAuthenticatedHostedSignInEntryFixture = async () => {
  let anonymousProcessCommandRequests = 0;
  const observations = new Map(AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS.map(projectName => [projectName, {
    passwordRequests: [],
    bindings: [],
    attestationRequests: 0,
    processCommandRequests: 0,
    verifySessionCalls: [],
  }]));
  const attestation = Object.freeze({
    attested: true,
    contractVersion: 'pr-c-controlled-human-attestation-1',
    environmentClass: 'hosted_nonproduction_pilot',
    prNumber: 264,
    releaseSha: RELEASE_SHA,
    reviewHeadSha: RELEASE_SHA,
    deployId: DEPLOY_ID,
    deployOrigin: PREVIEW_ORIGIN,
    exerciseDigest: EXERCISE_DIGEST,
    targetFingerprint: TARGET_FINGERPRINT,
    publicTargetDigest: PUBLIC_TARGET_DIGEST,
    personaManifestDigest: digest('authenticated-hosted-composed-personas'),
    fixtureManifestDigest: digest('authenticated-hosted-composed-fixtures'),
    migrationTip: '20260928060000',
    productionAuthorized: false,
    customerDataAuthorized: false,
    realProviderCallsAuthorized: false,
  });
  const processRows = new Map(AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS.map((projectName, index) => [projectName, {
    id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    authority_version: 1,
    org_id: ORGANIZATION_ID,
    workspace_id: WORKSPACE_ID,
    name: `${projectName} connected lifecycle`,
    description: 'Synthetic composed authentication process',
    owner_id: identityRows[`author.${projectName}@local.invalid`].user.id,
    department: 'Operations',
    criticality: 'High',
    status: 'Draft',
    template_id: null,
    created_at: '2026-10-13T00:00:00.000Z',
    updated_at: '2026-10-13T00:00:00.000Z',
  }]));
  const projectForIdentity = identity => processRows.get(identity.projectName);
  const apiServer = createServer(async (incoming, outgoing) => {
    try {
      const address = apiServer.address();
      const url = new URL(incoming.url ?? '/', `http://${LOOPBACK_HOST}:${address.port}`);
      if (incoming.method === 'OPTIONS') return sendJson(outgoing, 204);
      const rawBody = ['GET', 'HEAD'].includes(incoming.method ?? 'GET') ? '' : await readBody(incoming);
      const body = rawBody ? JSON.parse(rawBody) : {};

      if (incoming.method === 'POST' && url.pathname === '/rest/v1/rpc/pr_c_controlled_human_public_attestation') {
        for (const value of observations.values()) value.attestationRequests += 1;
        return sendJson(outgoing, 200, attestation);
      }

      if (incoming.method === 'POST' && url.pathname === '/auth/v1/token'
        && url.searchParams.get('grant_type') === 'password') {
        const email = typeof body.email === 'string' ? body.email : '';
        const identity = identityRows[email];
        const projectName = identity?.projectName ?? projectFromRejectedEmail(email);
        if (!projectName) return sendJson(outgoing, 400, { error_code: 'validation_failed', message: 'Invalid credentials' });
        const outcome = identity && body.password === identity.password ? 'accepted' : 'rejected';
        observations.get(projectName).passwordRequests.push({ actor: identity?.actor ?? 'rejected', outcome });
        if (outcome === 'rejected') {
          return sendJson(outgoing, 401, { error_code: 'invalid_credentials', message: 'Invalid credentials' });
        }
        return sendJson(outgoing, 200, {
          access_token: identity.token,
          refresh_token: `refresh-${identity.actor.toLowerCase()}`,
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: identity.user,
        });
      }

      if (incoming.method === 'GET' && url.pathname === '/auth/v1/user') {
        const identity = identitiesByToken.get(bearerToken(incoming));
        return identity
          ? sendJson(outgoing, 200, identity.user)
          : sendJson(outgoing, 401, { error_code: 'bad_jwt', message: 'Invalid session' });
      }

      if (incoming.method === 'POST' && url.pathname === '/functions/v1/tenant-session') {
        const identity = identitiesByToken.get(bearerToken(incoming));
        if (!identity) return sendJson(outgoing, 401, { error: { code: 'AUTHENTICATION_REQUIRED' } });
        return sendJson(outgoing, 200, { contexts: [{
          userId: identity.user.id,
          organizationId: ORGANIZATION_ID,
          organizationName: 'Loopback organization',
          workspaceId: WORKSPACE_ID,
          workspaceName: 'Loopback workspace',
          authorizationVersion: 1,
          capabilities: ['assess.read', 'assess.process.update'],
        }] });
      }

      if (incoming.method === 'GET' && url.pathname === '/rest/v1/assess_processes') {
        const identity = identitiesByToken.get(bearerToken(incoming));
        return identity ? sendJson(outgoing, 200, [projectForIdentity(identity)]) : sendJson(outgoing, 401, {
          code: 'AUTHENTICATION_REQUIRED',
        });
      }

      if (incoming.method === 'GET' && url.pathname === '/rest/v1/assessments') {
        const identity = identitiesByToken.get(bearerToken(incoming));
        return identity ? sendJson(outgoing, 200, null) : sendJson(outgoing, 401, { code: 'AUTHENTICATION_REQUIRED' });
      }

      if (incoming.method === 'POST' && url.pathname === '/functions/v1/process-command') {
        const identity = identitiesByToken.get(bearerToken(incoming));
        if (identity) observations.get(identity.projectName).processCommandRequests += 1;
        else anonymousProcessCommandRequests += 1;
        if (!identity) return sendJson(outgoing, 401, { error: { code: 'AUTHENTICATION_REQUIRED' } });
        return sendJson(outgoing, 403, { error: { code: 'PERMISSION_DENIED' } });
      }

      return sendJson(outgoing, 404, { error: 'NOT_FOUND' });
    } catch {
      return sendJson(outgoing, 500, { error: 'FIXTURE_FAILURE' });
    }
  });
  try {
    await new Promise((resolve, reject) => {
      apiServer.once('error', reject);
      apiServer.listen({ host: LOOPBACK_HOST, port: 0, exclusive: true }, resolve);
    });
  } catch (error) {
    apiServer.close();
    throw error;
  }
  const address = apiServer.address();
  const baseUrl = assertAuthenticatedHostedSignInEntryLoopbackUrl(`http://${LOOPBACK_HOST}:${address.port}`);
  const config = Object.freeze({
    releaseSha: RELEASE_SHA,
    origin: PREVIEW_ORIGIN,
    deploymentId: DEPLOY_ID,
    backendDigest: digest('authenticated-hosted-composed-backend'),
    migrationVersion: '20261011053000',
    migrationDigest: digest('authenticated-hosted-composed-migration'),
    exerciseDigest: EXERCISE_DIGEST,
    catalogDigest: digest('authenticated-hosted-composed-catalog'),
    sourceDigest: digest('authenticated-hosted-composed-source'),
    baselineDigest: digest('authenticated-hosted-composed-baseline'),
    targetPublicDigest: PUBLIC_TARGET_DIGEST,
    secretBackendKind: 'supabase_vault',
    scope: Object.freeze({
      organizationId: ORGANIZATION_ID,
      workspaceId: WORKSPACE_ID,
      roleIds: Object.freeze({
        author: '21000000-0000-4000-8000-000000000001',
        reviewer: '21000000-0000-4000-8000-000000000002',
        approver: '21000000-0000-4000-8000-000000000003',
        outsider: '21000000-0000-4000-8000-000000000004',
      }),
    }),
  });
  let clock = 0;
  const nextTime = () => new Date(Date.UTC(2026, 9, 13, 0, 0, clock++));
  let controller;
  const adapter = {
    preflight: async () => ({
      syntheticTarget: true,
      production: false,
      releaseSha: config.releaseSha,
      deploymentId: config.deploymentId,
      migrationVersion: config.migrationVersion,
      backendDigest: config.backendDigest,
      providersEnabled: false,
      runtimeReady: true,
      secretBackendKind: config.secretBackendKind,
      secretBackendWritable: true,
      publicTargetDigest: config.targetPublicDigest,
      baselineDigest: config.baselineDigest,
      customerRows: 0,
      unapprovedActiveResidue: 0,
      scopeReady: true,
    }),
    activate: async () => ({ activated: true }),
    setupProject: async ({ projectName }) => {
      const process = processRows.get(projectName);
      return {
        projectName,
        processId: process.id,
        projectId: `50000000-0000-4000-8000-${String(AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS.indexOf(projectName) + 1).padStart(12, '0')}`,
        deliveryProject: { id: `50000000-0000-4000-8000-${String(AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS.indexOf(projectName) + 1).padStart(12, '0')}`, name: `${projectName} delivery project` },
        aliases: { case: 'primary-case-1', review: 'primary-review-1', handoff: 'primary-handoff-1', artifact: 'primary-artifact-1', process: process.name },
      };
    },
    bindSession: async input => {
      const identity = Object.values(identityRows).find(candidate => candidate.user.id === input.actorId);
      observations.get(identity.projectName).bindings.push({ actor: identity.actor, persona: identity.persona, sessionHash: authenticatedHostedDigest(input.sessionId) });
    },
    observe: async () => ({ capturedAt: nextTime().toISOString(), records: [] }),
    recordBrowserAction: async () => undefined,
    armPermit: async () => ({ armed: true }),
    control: async (pathname, input) => {
      if (pathname !== '/control/sign-in-entry-observation') throw new Error('AUTHENTICATED_HOSTED_CONTROL_UNSUPPORTED');
      const projectObservation = observations.get(input.projectName);
      if (!projectObservation) throw new Error('AUTHENTICATED_HOSTED_CONTROLLER_PROJECT_NOT_FOUND');
      const actions = (controller.browserActions.get(input.projectName) ?? []).map(action => ({
        route: action.route,
        persona: action.persona,
        complete: action.complete,
        status: action.status ?? null,
        actorHash: action.actorHash,
        sessionHash: action.sessionHash,
      }));
      return {
        ...projectObservation,
        anonymousProcessCommandRequests,
        diagnostic: controller.failureDiagnostic(),
        actions,
        browserCases: controller.browserCases.length,
        serverCases: controller.serverCases.length,
      };
    },
    quiesce: async () => ({ quiesced: true }),
    cleanup: async () => ({ cleaned: true }),
    verifyCleanup: async () => ({
      activeSessions: 0,
      activeIdentities: 0,
      activeMemberships: 0,
      armedPermits: 0,
      activeSecretMaterial: 0,
      unapprovedActiveResidue: 0,
      nonExerciseChanged: false,
      immutableHistoryPreserved: true,
    }),
  };
  const identity = {
    created: new Map(),
    provisionProject: async ({ projectName }) => identitiesByProject.get(projectName),
    verifySession: async ({ accessToken, actorId, sessionId }) => {
      const candidate = identitiesByToken.get(accessToken);
      const observation = observations.get(candidate?.projectName);
      if (observation) observation.verifySessionCalls.push({ actor: candidate.actor, outcome: candidate.user.id === actorId && candidate.sessionId === sessionId ? 'verified' : 'rejected' });
      if (!candidate || candidate.user.id !== actorId || candidate.sessionId !== sessionId) throw new Error('AUTHENTICATED_HOSTED_IDENTITY_SESSION_VERIFICATION_FAILED');
      return { actorId, sessionId };
    },
    revokeAll: async () => ({ revoked: true }),
  };
  controller = new AuthenticatedHostedController({ config, adapter, identity, now: nextTime });
  let controlServer;
  try {
    await controller.preflightAndActivate();
    controlServer = await startAuthenticatedHostedControllerServer(controller);
  } catch (error) {
    await new Promise(resolve => apiServer.close(() => resolve()));
    throw error;
  }
  let closed = false;
  return {
    baseUrl,
    backendOrigin: BACKEND_ORIGIN,
    previewOrigin: PREVIEW_ORIGIN,
    controlBaseUrl: controlServer.baseUrl,
    controlToken: controlServer.controlToken,
    publicAnonKey: PUBLIC_ANON_KEY,
    releaseSha: RELEASE_SHA,
    deployId: DEPLOY_ID,
    exerciseDigest: EXERCISE_DIGEST,
    targetFingerprint: TARGET_FINGERPRINT,
    publicTargetDigest: PUBLIC_TARGET_DIGEST,
    async close() {
      if (closed) return true;
      closed = true;
      await controller.abortAndQuiesce();
      await controlServer.close();
      await new Promise((resolve, reject) => apiServer.close(error => error ? reject(error) : resolve()));
      return true;
    },
  };
};

const run = (command, args, environment) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: process.cwd(), env: environment, stdio: 'inherit' });
  child.once('error', reject);
  child.once('exit', (code, signal) => code === 0
    ? resolve()
    : reject(new Error(`AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_CHILD_FAILED:${path.basename(command)}:${code ?? signal}`)));
});

const stop = async child => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return true;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 5_000)),
  ]);
  return child.exitCode !== null || child.signalCode !== null;
};

const waitForHttp = async url => {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch { /* bounded readiness polling */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_APP_NOT_READY');
};

const checkoutState = async () => (await execFileAsync('git', ['status', '--porcelain=v1', '-z'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  maxBuffer: 1024 * 1024,
})).stdout;

export const runAuthenticatedHostedSignInEntry = async () => {
  const stateBefore = await checkoutState();
  let temporaryRoot;
  let fixture;
  let preview;
  let cleanupSucceeded = false;
  try {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'avalaos-sign-in-entry-'));
    const buildDirectory = path.join(temporaryRoot, 'build');
    const playwrightOutputDirectory = path.join(temporaryRoot, 'playwright');
    fixture = await startAuthenticatedHostedSignInEntryFixture();
    const appPort = await availablePort();
    const appBaseUrl = assertAuthenticatedHostedSignInEntryLoopbackUrl(`http://${LOOPBACK_HOST}:${appPort}`);
    const baseEnvironment = authenticatedHostedSignInEntryChildEnvironment(process.env);
    const buildEnvironment = {
      ...baseEnvironment,
      VITE_AVALA_RUNTIME_MODE: 'pilot',
      VITE_SUPABASE_URL: fixture.backendOrigin,
      VITE_SUPABASE_ANON_KEY: fixture.publicAnonKey,
      VITE_AI_EDGE_FUNCTIONS_ENABLED: 'false',
      VITE_PR_C_CONTROLLED_HUMAN_ENABLED: 'authorized',
      VITE_PR_C_CONTROLLED_HUMAN_PUBLIC_TARGET_DIGEST: fixture.publicTargetDigest,
      COMMIT_REF: fixture.releaseSha,
      DEPLOY_ID: fixture.deployId,
      DEPLOY_PRIME_URL: fixture.previewOrigin,
      PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST: fixture.exerciseDigest,
      PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT: fixture.targetFingerprint,
    };
    await run(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'build',
      '--config', 'vite.authenticated-hosted-sign-in-entry.config.ts', '--outDir', buildDirectory, '--emptyOutDir'], buildEnvironment);
    preview = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'preview',
      '--config', 'vite.authenticated-hosted-sign-in-entry.config.ts', '--host', LOOPBACK_HOST,
      '--port', String(appPort), '--outDir', buildDirectory], {
      cwd: process.cwd(),
      env: buildEnvironment,
      stdio: 'inherit',
    });
    await waitForHttp(`${appBaseUrl}/`);
    await run(process.execPath, [path.resolve('node_modules/@playwright/test/cli.js'), 'test',
      '--config=playwright.authenticated-hosted-sign-in-entry.config.ts', '--workers=1'], {
      ...baseEnvironment,
      AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_APP_URL: fixture.previewOrigin,
      AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_LOCAL_APP_URL: appBaseUrl,
      AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_BACKEND_URL: fixture.backendOrigin,
      AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_LOCAL_BACKEND_URL: fixture.baseUrl,
      AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_OUTPUT_DIR: playwrightOutputDirectory,
      ENTERPRISE_LIFECYCLE_APP_BASE_URL: fixture.previewOrigin,
      ENTERPRISE_LIFECYCLE_API_BASE_URL: fixture.backendOrigin,
      ENTERPRISE_LIFECYCLE_CONTROL_URL: fixture.controlBaseUrl,
      ENTERPRISE_LIFECYCLE_CONTROL_TOKEN: fixture.controlToken,
      AUTHENTICATED_ACCEPTANCE_SUPABASE_URL: fixture.backendOrigin,
      ENTERPRISE_LIFECYCLE_HOSTED_REAL_AUTH: 'true',
    });
  } finally {
    const previewStopped = await stop(preview).catch(() => false);
    const fixtureClosed = fixture ? await fixture.close().catch(() => false) : true;
    const temporaryRemoved = temporaryRoot
      ? await rm(temporaryRoot, { recursive: true, force: true }).then(() => true, () => false)
      : true;
    cleanupSucceeded = previewStopped && fixtureClosed && temporaryRemoved;
    if (!cleanupSucceeded) throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_CLEANUP_FAILED');
  }
  if (await checkoutState() !== stateBefore) {
    throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_CHECKOUT_CHANGED');
  }
  return true;
};

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) runAuthenticatedHostedSignInEntry().then(() => {
  console.log('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PASS');
}).catch(error => {
  console.error(error instanceof Error ? error.message : 'AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_FAILED');
  process.exitCode = 1;
});
