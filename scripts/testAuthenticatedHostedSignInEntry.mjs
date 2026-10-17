import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  AuthenticatedHostedController,
  authenticatedHostedDigest,
  startAuthenticatedHostedControllerServer,
} from './authenticatedHostedController.mjs';
import { AUTHENTICATED_HOSTED_SYNTHETIC_PROCESS_METADATA,
  authenticatedHostedFixtureIdentity } from './authenticatedHostedFixtureIdentity.mjs';
import { loadEnterpriseLifecycleProductionModule } from './enterpriseLifecyclePostgresFixture.mjs';

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
const processRouter = loadEnterpriseLifecycleProductionModule(
  path.join(process.cwd(), 'supabase', 'functions', '_shared', 'processCommandRouter.ts'),
);
const assessRouter = loadEnterpriseLifecycleProductionModule(
  path.join(process.cwd(), 'supabase', 'functions', '_shared', 'assessRouter.ts'),
);
const { AssessCommandError } = loadEnterpriseLifecycleProductionModule(
  path.join(process.cwd(), 'supabase', 'functions', '_shared', 'assessCommand.ts'),
);
const ORGANIZATION_ID = '20000000-0000-4000-8000-000000000001';
const WORKSPACE_ID = '30000000-0000-4000-8000-000000000001';
export const AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_SCOPE = Object.freeze({
  organizationId: ORGANIZATION_ID,
  workspaceId: WORKSPACE_ID,
});
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
const capabilitiesForIdentity = identity => identity.persona === 'author'
  ? ['assess.read', 'assess.process.update', 'assess.create', 'assess.response.write', 'assess.finalize'] : ['assess.read'];
const validDeniedProcessUpdate = (body, identity, process) => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !process) return false;
  const keys = Object.keys(body).sort();
  const payload = body.payload;
  return JSON.stringify(keys) === JSON.stringify([
    'authorizationVersion', 'commandType', 'expectedVersion', 'idempotencyKey', 'organizationId', 'payload',
    'requestId', 'workspaceId',
  ])
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(body.requestId)
    && body.idempotencyKey === `process.update.${body.requestId}`
    && body.commandType === 'process.update'
    && body.organizationId === ORGANIZATION_ID && body.workspaceId === WORKSPACE_ID
    && body.authorizationVersion === 1 && body.expectedVersion === process.authority_version
    && payload && typeof payload === 'object' && !Array.isArray(payload)
    && Object.keys(payload).sort().join(',') === 'criticality,department,description,name,processId'
    && payload.processId === process.id && payload.name === 'Unauthorized process rename'
    && payload.description === process.description && payload.department === process.department
    && payload.criticality === process.criticality && identity.persona === 'reviewer';
};

const PROCESS_SEED_MODES = new Set(['valid', 'nullable-reproduction']);

export const startAuthenticatedHostedSignInEntryFixture = async ({ processSeedMode = 'valid' } = {}) => {
  if (!PROCESS_SEED_MODES.has(processSeedMode)) {
    throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROCESS_SEED_MODE_REJECTED');
  }
  let anonymousProcessCommandRequests = 0;
  let processAtomicCalls = 0;
  const processFaultPermits = new Map();
  const processReadFaults = new Map(AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS.map(projectName => [projectName, {
    outcome: null,
    skip: 0,
    remaining: 0,
    consumed: 0,
    completed: 0,
  }]));
  const observeGates = new Map(AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS.map(projectName => [projectName, {
    mode: 'open',
    waiters: [],
  }]));
  const armGates = new Map(AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS.map(projectName => [projectName, {
    mode: 'open',
    waiters: [],
  }]));
  const deliveryTaskGates = new Map(AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS.map(projectName => [projectName, {
    mode: 'open',
    rejectRemaining: 0,
    waiters: [],
    requests: 0,
    completed: 0,
    held: 0,
    actors: [],
    authorityVersions: [],
  }]));
  const authorityVersions = new Map(AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS.map(projectName => [projectName, {
    current: 1,
    priorRead: null,
  }]));
  const releaseGate = (gates, projectName, code) => {
    const gate = gates.get(projectName);
    if (!gate) throw new Error(code);
    gate.mode = 'open';
    for (const resolve of gate.waiters.splice(0)) resolve();
  };
  const releaseObserveGate = projectName => releaseGate(
    observeGates, projectName, 'AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_OBSERVE_GATE_REJECTED',
  );
  const releaseArmGate = projectName => releaseGate(
    armGates, projectName, 'AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_ARM_GATE_REJECTED',
  );
  const releaseDeliveryTaskGate = projectName => releaseGate(
    deliveryTaskGates, projectName, 'AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_DELIVERY_TASK_GATE_REJECTED',
  );
  const observations = new Map(AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS.map(projectName => [projectName, {
    passwordRequests: [],
    bindings: [],
    attestationRequests: 0,
    processCommandRequests: 0,
    tenantSessionRequests: 0,
    tenantSessionCompleted: 0,
    processReadRequests: 0,
    processReadCompleted: 0,
    projectIndexRequests: 0,
    projectIndexCompleted: 0,
    verifySessionCalls: [],
    controlSequence: [],
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
    description: processSeedMode === 'nullable-reproduction'
      ? null : AUTHENTICATED_HOSTED_SYNTHETIC_PROCESS_METADATA.description,
    owner_id: identityRows[`author.${projectName}@local.invalid`].user.id,
    department: processSeedMode === 'nullable-reproduction'
      ? null : AUTHENTICATED_HOSTED_SYNTHETIC_PROCESS_METADATA.department,
    criticality: AUTHENTICATED_HOSTED_SYNTHETIC_PROCESS_METADATA.criticality,
    status: 'Draft',
    template_id: null,
    created_at: '2026-10-13T00:00:00.000Z',
    updated_at: '2026-10-13T00:00:00.000Z',
  }]));
  const deliveryProjects = new Map();
  const assessmentRows = new Map(AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS.map(projectName => [projectName, null]));
  const assessmentControls = new Map(AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS.map(projectName => [projectName, {
    mode: 'single-readback',
    finalizedReadbacks: 0,
    waiters: [],
    commands: [],
  }]));
  const releaseAssessmentGate = (projectName, nextMode = 'reject-finalize') => {
    const control = assessmentControls.get(projectName);
    if (!control) throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_ASSESSMENT_CONTROL_REJECTED');
    control.mode = nextMode;
    for (const resolve of control.waiters.splice(0)) resolve();
  };
  const resetAssessment = (projectName, { mode, seedDraft }) => {
    const projectIndex = AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS.indexOf(projectName);
    const process = processRows.get(projectName);
    const control = assessmentControls.get(projectName);
    if (projectIndex < 0 || !process || !control
      || !['single-readback', 'reject-finalize', 'stall-finalize', 'missing-readback'].includes(mode)
      || typeof seedDraft !== 'boolean') {
      throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_ASSESSMENT_CONTROL_REJECTED');
    }
    releaseAssessmentGate(projectName, mode);
    control.mode = mode;
    control.finalizedReadbacks = 0;
    control.commands.length = 0;
    assessmentRows.set(projectName, seedDraft ? {
      id: `60000000-0000-4000-8000-${String(projectIndex + 1).padStart(12, '0')}`,
      process_id: process.id,
      org_id: ORGANIZATION_ID,
      workspace_id: WORKSPACE_ID,
      version: 1,
      score_version: null,
      status: 'Draft',
      metadata: {
        completionQuality: 0, templateFit: false, lastSavedAt: '2026-10-15T00:00:00.000Z',
        stakeholderCoverage: 1, evidenceQuality: 1, assumptionQuality: 1,
      },
      responses: {
        processStructure: {}, workPattern: {}, dataProfile: {}, judgment: {}, systems: {}, risk: {},
      },
      evidence_items: [], assumptions: [], completion_by_section: {
        processStructure: 0, workPattern: 0, dataProfile: 0, judgment: 0, systems: 0, risk: 0,
        evidenceAndAssumptions: 0,
      },
      scores: null,
    } : null);
  };
  const catalogRows = new Map();
  const exactDuplicateProjects = new Set();
  const projectForIdentity = identity => {
    const rows = catalogRows.get(identity.projectName) ?? [];
    if (!exactDuplicateProjects.has(identity.projectName) || rows.length === 0) return rows;
    const projectIndex = AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS.indexOf(identity.projectName);
    return [...rows, {
      ...rows[0],
      id: `43000000-0000-4000-8000-${String(projectIndex + 1).padStart(12, '0')}`,
      description: 'Intentional exact duplicate used to prove fail-closed catalog selection',
    }];
  };
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
        const observation = observations.get(identity.projectName);
        const authority = authorityVersions.get(identity.projectName);
        if (!authority) return sendJson(outgoing, 409, { error: { code: 'SESSION_CONTEXT_UNAVAILABLE' } });
        observation.tenantSessionRequests += 1;
        outgoing.once('finish', () => { observation.tenantSessionCompleted += 1; });
        return sendJson(outgoing, 200, { contexts: [{
          userId: identity.user.id,
          organizationId: ORGANIZATION_ID,
          organizationName: 'Loopback organization',
          workspaceId: WORKSPACE_ID,
          workspaceName: 'Loopback workspace',
          authorizationVersion: authority.current,
          capabilities: capabilitiesForIdentity(identity),
        }] });
      }

      if (incoming.method === 'GET' && url.pathname === '/rest/v1/assess_processes') {
        const identity = identitiesByToken.get(bearerToken(incoming));
        if (incoming.headers.apikey !== PUBLIC_ANON_KEY) return sendJson(outgoing, 401, { code: 'API_KEY_REQUIRED' });
        const observation = identity ? observations.get(identity.projectName) : null;
        if (observation) {
          observation.processReadRequests += 1;
          outgoing.once('finish', () => { observation.processReadCompleted += 1; });
        }
        const exactScope = url.searchParams.get('org_id') === `eq.${ORGANIZATION_ID}`
          && url.searchParams.get('workspace_id') === `eq.${WORKSPACE_ID}`;
        const readFault = identity ? processReadFaults.get(identity.projectName) : null;
        if (readFault?.remaining === 1 && readFault.skip > 0) readFault.skip -= 1;
        else if (readFault?.remaining === 1) {
          readFault.remaining = 0;
          readFault.consumed += 1;
          outgoing.once('finish', () => { readFault.completed += 1; });
          return readFault.outcome === 'empty'
            ? sendJson(outgoing, 200, [])
            : sendJson(outgoing, 403, { code: 'PERMISSION_DENIED' });
        }
        return identity ? sendJson(outgoing, 200, exactScope ? projectForIdentity(identity) : []) : sendJson(outgoing, 401, {
          code: 'AUTHENTICATION_REQUIRED',
        });
      }

      if (incoming.method === 'GET' && url.pathname === '/rest/v1/projects') {
        const identity = identitiesByToken.get(bearerToken(incoming));
        if (!identity) return sendJson(outgoing, 401, { code: 'AUTHENTICATION_REQUIRED' });
        const observation = observations.get(identity.projectName);
        observation.projectIndexRequests += 1;
        outgoing.once('finish', () => { observation.projectIndexCompleted += 1; });
        const project = deliveryProjects.get(identity.projectName);
        const exactScope = url.searchParams.get('org_id') === `eq.${ORGANIZATION_ID}`
          && url.searchParams.get('workspace_id') === `eq.${WORKSPACE_ID}`
          && url.searchParams.get('status') === 'eq.active'
          && url.searchParams.get('archived_at') === 'is.null'
          && url.searchParams.get('deleted_at') === 'is.null';
        return sendJson(outgoing, 200, exactScope && project ? [project] : []);
      }

      if (incoming.method === 'POST' && url.pathname === '/functions/v1/legacy-delivery-query') {
        const identity = identitiesByToken.get(bearerToken(incoming));
        const project = identity ? deliveryProjects.get(identity.projectName) : null;
        const gate = identity ? deliveryTaskGates.get(identity.projectName) : null;
        const authority = identity ? authorityVersions.get(identity.projectName) : null;
        if (!identity || !project || !gate || !authority) {
          return sendJson(outgoing, 401, { ok: false, error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' } });
        }
        const exactQuery = body?.schemaVersion === 'legacy-delivery-query.v1'
          && body.organizationId === ORGANIZATION_ID
          && body.workspaceId === WORKSPACE_ID
          && (body.expectedAuthorizationVersion === authority.current
            || (authority.priorRead !== null && body.expectedAuthorizationVersion === authority.priorRead))
          && body.projectId === project.id
          && body.limit === 100
          && body.cursor === null
          && body.sourceGenerationId === null
          && body.includeRetained === true;
        if (!exactQuery) {
          return sendJson(outgoing, 400, { ok: false, error: { code: 'INVALID_COMMAND', message: 'Request is invalid.' } });
        }
        gate.requests += 1;
        gate.actors.push(identity.persona);
        gate.authorityVersions.push(body.expectedAuthorizationVersion);
        if (gate.mode === 'hold-next') {
          gate.mode = 'held';
          gate.held += 1;
          await new Promise(resolve => gate.waiters.push(resolve));
        }
        outgoing.once('finish', () => { gate.completed += 1; });
        if (gate.rejectRemaining > 0) {
          gate.rejectRemaining -= 1;
          return sendJson(outgoing, 503, { ok: false, error: {
            code: 'QUERY_UNAVAILABLE', message: 'Delivery data could not be loaded.',
          } });
        }
        return sendJson(outgoing, 200, {
          ok: true,
          schemaVersion: 'legacy-delivery-query.v1',
          projectId: project.id,
          items: [],
          page: { limit: 100, nextCursor: null, hasMore: false },
          source: null,
        });
      }

      if (incoming.method === 'GET' && url.pathname === '/rest/v1/assessments') {
        const identity = identitiesByToken.get(bearerToken(incoming));
        if (!identity) return sendJson(outgoing, 401, { code: 'AUTHENTICATION_REQUIRED' });
        const row = assessmentRows.get(identity.projectName);
        const control = assessmentControls.get(identity.projectName);
        const exactScope = url.searchParams.get('org_id') === `eq.${ORGANIZATION_ID}`
          && url.searchParams.get('workspace_id') === `eq.${WORKSPACE_ID}`
          && url.searchParams.get('process_id') === `eq.${processRows.get(identity.projectName)?.id}`;
        if (!exactScope || !row) return sendJson(outgoing, 200, null);
        if (row.status === 'Ready for Review') {
          control.finalizedReadbacks += 1;
          if (control.mode === 'missing-readback' || (control.mode === 'single-readback' && control.finalizedReadbacks > 1)) {
            return sendJson(outgoing, 200, null);
          }
        }
        return sendJson(outgoing, 200, row);
      }

      if (incoming.method === 'POST' && url.pathname === '/functions/v1/assess-command') {
        const identity = identitiesByToken.get(bearerToken(incoming));
        if (!identity) return sendJson(outgoing, 401, { error: { code: 'AUTHENTICATION_REQUIRED' } });
        if (incoming.headers.apikey !== PUBLIC_ANON_KEY) {
          return sendJson(outgoing, 401, { error: { code: 'API_KEY_REQUIRED' } });
        }
        const control = assessmentControls.get(identity.projectName);
        const response = await assessRouter.handleAssessRequest(new Request(
          `${BACKEND_ORIGIN}/functions/v1/assess-command`, {
            method: 'POST',
            headers: { authorization: `Bearer ${identity.token}`, 'content-type': 'application/json' },
            body: JSON.stringify(body),
          },
        ), {
          authenticate: async () => ({ id: identity.user.id }),
          loadFreshAuthority: async input => ({
            actorId: input.actorId,
            organizationId: input.organizationId,
            workspaceId: input.workspaceId,
            authorizationVersion: 1,
            permissions: capabilitiesForIdentity(identity),
          }),
          loadAssessmentForFinalize: async input => {
            const row = assessmentRows.get(identity.projectName);
            if (!row || row.id !== input.assessmentId || row.org_id !== input.organizationId
              || row.workspace_id !== input.workspaceId || row.version !== input.expectedVersion) return null;
            return {
              assessmentId: row.id,
              processId: row.process_id,
              version: row.version,
              responses: row.responses,
              metadata: row.metadata,
              evidenceItems: row.evidence_items,
              assumptions: row.assumptions,
            };
          },
          executeAtomicCommand: async command => {
            control.commands.push({ commandType: command.commandType, actorId: command.actorId,
              organizationId: command.organizationId, workspaceId: command.workspaceId,
              resourceId: command.resourceId, expectedVersion: command.expectedVersion ?? null });
            let row = assessmentRows.get(identity.projectName);
            if (command.commandType === 'assessment.create') {
              if (row || command.actorId !== identity.user.id || command.organizationId !== ORGANIZATION_ID
                || command.workspaceId !== WORKSPACE_ID || command.payload.processId !== processRows.get(identity.projectName)?.id) {
                throw new AssessCommandError('VERSION_CONFLICT');
              }
              row = {
                id: command.resourceId,
                process_id: command.payload.processId,
                org_id: command.organizationId,
                workspace_id: command.workspaceId,
                version: 1,
                score_version: null,
                status: 'Draft',
                metadata: {}, responses: {}, evidence_items: [], assumptions: [], completion_by_section: {}, scores: null,
              };
              assessmentRows.set(identity.projectName, row);
            } else if (command.commandType === 'assessment.response.upsert') {
              if (!row || row.id !== command.resourceId || row.version !== command.expectedVersion) {
                throw new AssessCommandError('VERSION_CONFLICT');
              }
              row = { ...row, version: row.version + 1, status: 'Draft', responses: command.payload.responses,
                metadata: command.payload.metadata, evidence_items: command.payload.evidenceItems,
                assumptions: command.payload.assumptions };
              assessmentRows.set(identity.projectName, row);
            } else if (command.commandType === 'assessment.finalize') {
              if (control.mode === 'stall-finalize') await new Promise(resolve => control.waiters.push(resolve));
              if (control.mode === 'reject-finalize') throw new AssessCommandError('COMMAND_UNAVAILABLE');
              row = assessmentRows.get(identity.projectName);
              if (!row || row.id !== command.resourceId || row.version !== command.expectedVersion) {
                throw new AssessCommandError('VERSION_CONFLICT');
              }
              row = { ...row, version: row.version + 1, status: 'Ready for Review', scores: command.payload.scores,
                score_version: command.payload.scores?.scoreVersion ?? null };
              assessmentRows.set(identity.projectName, row);
              control.finalizedReadbacks = 0;
            } else {
              throw new AssessCommandError('COMMAND_NOT_SUPPORTED');
            }
            return { outcome: 'committed', resource: {
              assessmentId: row.id, version: row.version, status: row.status,
              ...(row.score_version ? { scoreVersion: row.score_version } : {}),
            } };
          },
        });
        return sendJson(outgoing, response.status, await response.json());
      }

      if (incoming.method === 'POST' && url.pathname === '/functions/v1/process-command') {
        const identity = identitiesByToken.get(bearerToken(incoming));
        if (identity) observations.get(identity.projectName).processCommandRequests += 1;
        else anonymousProcessCommandRequests += 1;
        if (!identity) return sendJson(outgoing, 401, { error: { code: 'AUTHENTICATION_REQUIRED' } });
        if (incoming.headers.apikey !== PUBLIC_ANON_KEY) {
          return sendJson(outgoing, 401, { error: { code: 'API_KEY_REQUIRED' } });
        }
        if (identity.persona === 'author') {
          const projectObservation = observations.get(identity.projectName);
          projectObservation.controlSequence.push('backend-arrival');
          const response = await processRouter.handleProcessCommandRequest(new Request(
            `${BACKEND_ORIGIN}/functions/v1/process-command`, {
              method: 'POST',
              headers: { authorization: `Bearer ${identity.token}`, 'content-type': 'application/json' },
              body: JSON.stringify(body),
            },
          ), {
            creation: {
              authenticate: async () => { throw new Error('UNEXPECTED_CREATION_ROUTE'); },
              authority: async () => null,
              atomic: async () => { throw new Error('UNEXPECTED_CREATION_ATOMIC'); },
            },
            update: {
              authenticate: async () => ({ id: identity.user.id }),
              authority: async (_request, actorId, envelope) => ({
                userId: actorId,
                organizationId: envelope.organizationId,
                workspaceId: envelope.workspaceId,
                authorizationVersion: 1,
                capabilities: capabilitiesForIdentity(identity),
              }),
              consumePrecommitFault: async (_request, requestBody, actorId, envelope) => {
                const permit = processFaultPermits.get(identity.projectName);
                const payloadHash = authenticatedHostedDigest(requestBody).slice('sha256:'.length);
                if (!permit || permit.state !== 'armed' || permit.actorId !== actorId
                  || permit.sessionId !== identity.sessionId || permit.commandType !== envelope.commandType
                  || permit.requestId !== envelope.requestId || permit.payloadHash !== payloadHash
                  || permit.expectedVersion !== envelope.expectedVersion) return false;
                permit.state = 'consumed';
                permit.consumed += 1;
                projectObservation.controlSequence.push('permit-consume');
                return true;
              },
              atomic: async () => {
                processAtomicCalls += 1;
                throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_UNEXPECTED_PROCESS_ATOMIC');
              },
            },
          });
          return sendJson(outgoing, response.status, await response.json());
        }
        if (!validDeniedProcessUpdate(body, identity, processRows.get(identity.projectName))) {
          return sendJson(outgoing, 400, { error: { code: 'INVALID_COMMAND' } });
        }
        return sendJson(outgoing, 403, { ok: false, error: { code: 'PERMISSION_DENIED', message: 'Process update could not be completed.' } });
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
    workflow: Object.freeze({ runId: '12345', attempt: '1' }),
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
      observationStartedAt: nextTime().toISOString(),
    }),
    activate: async () => ({ activated: true }),
    setupProject: async ({ projectName, exerciseId }) => {
      const projectIndex = AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS.indexOf(projectName);
      const baseProcess = processRows.get(projectName);
      const labels = authenticatedHostedFixtureIdentity({
        runId: config.workflow.runId,
        attempt: config.workflow.attempt,
        exerciseId,
        projectName,
      });
      const process = { ...baseProcess, name: labels.processName };
      processRows.set(projectName, process);
      catalogRows.set(projectName, [
        process,
        {
          ...baseProcess,
          id: `41000000-0000-4000-8000-${String(projectIndex + 1).padStart(12, '0')}`,
          description: 'Retained history with the former synthetic fixture name',
          created_at: '2026-10-12T00:00:00.000Z',
          updated_at: '2026-10-12T00:00:00.000Z',
        },
        {
          ...baseProcess,
          id: `42000000-0000-4000-8000-${String(projectIndex + 1).padStart(12, '0')}`,
          name: `${labels.processName} prefix decoy`,
          description: 'Retained history whose name contains the current fixture label as a prefix',
          created_at: '2026-10-11T00:00:00.000Z',
          updated_at: '2026-10-11T00:00:00.000Z',
        },
      ]);
      const deliveryProject = {
        id: `50000000-0000-4000-8000-${String(projectIndex + 1).padStart(12, '0')}`,
        org_id: ORGANIZATION_ID,
        workspace_id: WORKSPACE_ID,
        name: labels.deliveryProjectName,
        description: 'Registered same-workspace project unrelated to the Assess process route.',
        owner_id: identityRows[`author.${projectName}@local.invalid`].user.id,
        lifecycle_stage: 'Planning',
        health_status: 'On Track',
        status: 'active',
        archived_at: null,
        deleted_at: null,
        created_at: '2026-10-13T00:00:00.000Z',
      };
      deliveryProjects.set(projectName, deliveryProject);
      return {
        projectName,
        processId: process.id,
        projectId: deliveryProject.id,
        deliveryProject: { id: deliveryProject.id, name: deliveryProject.name },
        aliases: { case: 'primary-case-1', review: 'primary-review-1', handoff: 'primary-handoff-1', artifact: 'primary-artifact-1', process: process.name },
      };
    },
    bindSession: async input => {
      const identity = Object.values(identityRows).find(candidate => candidate.user.id === input.actorId);
      observations.get(identity.projectName).bindings.push({ actor: identity.actor, persona: identity.persona, sessionHash: authenticatedHostedDigest(input.sessionId) });
    },
    observe: async ({ project }) => {
      const gate = observeGates.get(project.projectName);
      if (!gate) throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_OBSERVE_GATE_REJECTED');
      if (gate.mode !== 'open') {
        observations.get(project.projectName).controlSequence.push('observe-held');
        await new Promise(resolve => gate.waiters.push(resolve));
        observations.get(project.projectName).controlSequence.push('observe-released');
      }
      const permit = processFaultPermits.get(project.projectName);
      const records = permit ? [{
        source: 'authenticated_synthetic_permits',
        recordHash: authenticatedHostedDigest(permit.permitId),
        rowHash: authenticatedHostedDigest(permit),
        businessRowHash: authenticatedHostedDigest(permit),
        occurredAt: permit.armedAt,
        classification: permit.state === 'armed' ? 'transient_control' : 'immutable_history',
        active: permit.state === 'armed',
        actorHash: authenticatedHostedDigest(permit.actorId),
        sessionHash: authenticatedHostedDigest(permit.sessionId),
        requestIdHash: authenticatedHostedDigest(permit.requestId),
        persistedRequestHash: null,
        persistedPayloadHash: `sha256:${permit.payloadHash}`,
        commandBindingHash: authenticatedHostedDigest({
          requestIdHash: authenticatedHostedDigest(permit.requestId),
          actorHash: authenticatedHostedDigest(permit.actorId),
          commandType: permit.commandType,
        }),
        commandIdHash: null,
        receiptIdHash: null,
        auditIdHash: null,
        effectKind: 'control',
        organizationHash: authenticatedHostedDigest(ORGANIZATION_ID),
        workspaceHash: authenticatedHostedDigest(WORKSPACE_ID),
      }] : [];
      return { capturedAt: nextTime().toISOString(), records };
    },
    recordBrowserAction: async ({ projectName }) => {
      observations.get(projectName).controlSequence.push('action-finish');
    },
    armPermit: async input => {
      const identity = Object.values(identityRows).find(candidate => candidate.user.id === input.actorId);
      if (!identity || processFaultPermits.get(identity.projectName)?.state === 'armed') {
        throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PERMIT_REJECTED');
      }
      const permit = {
        permitId: input.permitId,
        actorId: input.actorId,
        sessionId: input.sessionId,
        commandType: input.commandType,
        requestId: input.requestId,
        payloadHash: input.payloadHash,
        expectedVersion: input.expectedVersion,
        armedAt: nextTime().toISOString(),
        state: 'armed',
        consumed: 0,
      };
      processFaultPermits.set(identity.projectName, permit);
      observations.get(identity.projectName).controlSequence.push('permit-arm');
      const gate = armGates.get(identity.projectName);
      if (gate.mode !== 'open') {
        observations.get(identity.projectName).controlSequence.push('permit-arm-held');
        await new Promise(resolve => gate.waiters.push(resolve));
        observations.get(identity.projectName).controlSequence.push('permit-arm-released');
      }
      return { permitId: permit.permitId, state: permit.state };
    },
    frame: async (pathname, { project }) => {
      if (pathname !== '/control/process-frame') throw new Error('AUTHENTICATED_HOSTED_CONTROL_UNSUPPORTED');
      const process = processRows.get(project.projectName);
      return {
        targetHash: authenticatedHostedDigest(process),
        receipts: 0,
        audits: 0,
        processVersion: process.authority_version,
      };
    },
    control: async (pathname, input) => {
      if (pathname === '/control/sign-in-entry-observe-gate') {
        const gate = observeGates.get(input.projectName);
        if (!gate || !['hold-next','stall-next','release'].includes(input.mode)) {
          throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_OBSERVE_GATE_REJECTED');
        }
        if (input.mode === 'release') releaseObserveGate(input.projectName);
        else {
          if (gate.mode !== 'open' || gate.waiters.length !== 0) {
            throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_OBSERVE_GATE_REJECTED');
          }
          gate.mode = input.mode;
        }
        return { mode: gate.mode, waiting: gate.waiters.length };
      }
      if (pathname === '/control/sign-in-entry-arm-gate') {
        const gate = armGates.get(input.projectName);
        if (!gate || !['stall-next','release'].includes(input.mode)) {
          throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_ARM_GATE_REJECTED');
        }
        if (input.mode === 'release') releaseArmGate(input.projectName);
        else {
          if (gate.mode !== 'open' || gate.waiters.length !== 0) {
            throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_ARM_GATE_REJECTED');
          }
          gate.mode = input.mode;
        }
        return { mode: gate.mode, waiting: gate.waiters.length };
      }
      if (pathname === '/control/sign-in-entry-delivery-task-gate') {
        const gate = deliveryTaskGates.get(input.projectName);
        if (!gate || !['hold-next','release','reject','inspect'].includes(input.action)) {
          throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_DELIVERY_TASK_GATE_REJECTED');
        }
        if (input.action === 'hold-next') {
          if (gate.mode !== 'open' || gate.waiters.length !== 0) {
            throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_DELIVERY_TASK_GATE_REJECTED');
          }
          gate.mode = 'hold-next';
        } else if (input.action === 'release' || input.action === 'reject') {
          if (input.action === 'reject') gate.rejectRemaining = 2;
          releaseDeliveryTaskGate(input.projectName);
        }
        return {
          mode: gate.mode,
          waiting: gate.waiters.length,
          requests: gate.requests,
          completed: gate.completed,
          held: gate.held,
          actors: [...gate.actors],
          authorityVersions: [...gate.authorityVersions],
        };
      }
      if (pathname === '/control/sign-in-entry-authority-version') {
        const authority = authorityVersions.get(input.projectName);
        if (!authority || !['advance','inspect'].includes(input.action)) {
          throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_AUTHORITY_VERSION_REJECTED');
        }
        if (input.action === 'advance') {
          if (authority.current !== 1 || authority.priorRead !== null) {
            throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_AUTHORITY_VERSION_REJECTED');
          }
          authority.priorRead = authority.current;
          authority.current = 2;
        }
        return { current: authority.current, priorRead: authority.priorRead };
      }
      if (pathname === '/control/sign-in-entry-process-duplicate') {
        if (!AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS.includes(input.projectName)
          || typeof input.enabled !== 'boolean') throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_DUPLICATE_CONTROL_REJECTED');
        if (input.enabled) exactDuplicateProjects.add(input.projectName);
        else exactDuplicateProjects.delete(input.projectName);
        return { enabled: exactDuplicateProjects.has(input.projectName) };
      }
      if (pathname === '/control/sign-in-entry-process-read') {
        const state = processReadFaults.get(input.projectName);
        if (!state || !['arm','inspect'].includes(input.action)) {
          throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROCESS_READ_CONTROL_REJECTED');
        }
        if (input.action === 'arm') {
          if (!['empty','denied'].includes(input.outcome) || ![0,1].includes(input.skip)
            || state.remaining !== 0) {
            throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROCESS_READ_CONTROL_REJECTED');
          }
          state.outcome = input.outcome;
          state.skip = input.skip;
          state.remaining = 1;
        }
        return {
          outcome: state.outcome, skip: state.skip, remaining: state.remaining,
          consumed: state.consumed, completed: state.completed,
        };
      }
      if (pathname === '/control/sign-in-entry-assessment') {
        if (!AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS.includes(input.projectName)) {
          throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_ASSESSMENT_CONTROL_REJECTED');
        }
        if (input.action === 'reset') {
          resetAssessment(input.projectName, { mode: input.mode, seedDraft: input.seedDraft });
        } else if (input.action === 'release-stall') {
          releaseAssessmentGate(input.projectName, 'reject-finalize');
        } else if (input.action !== 'inspect') {
          throw new Error('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_ASSESSMENT_CONTROL_REJECTED');
        }
        const control = assessmentControls.get(input.projectName);
        const row = assessmentRows.get(input.projectName);
        return { mode: control.mode, status: row?.status ?? null, version: row?.version ?? null,
          commandTypes: control.commands.map(command => command.commandType),
          finalizedReadbacks: control.finalizedReadbacks, waiting: control.waiters.length };
      }
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
        processAtomicCalls,
        assessment: (() => {
          const control = assessmentControls.get(input.projectName);
          const row = assessmentRows.get(input.projectName);
          return { mode: control.mode, status: row?.status ?? null, version: row?.version ?? null,
            commandTypes: control.commands.map(command => command.commandType),
            finalizedReadbacks: control.finalizedReadbacks, waiting: control.waiters.length };
        })(),
        permits: [...processFaultPermits.values()].filter(permit => {
          const identity = Object.values(identityRows).find(candidate => candidate.user.id === permit.actorId);
          return identity?.projectName === input.projectName;
        }).map(permit => ({ state: permit.state, consumed: permit.consumed,
          requestIdHash: authenticatedHostedDigest(permit.requestId), payloadHash: `sha256:${permit.payloadHash}` })),
        diagnostic: controller.failureDiagnostic(),
        actions,
        browserCases: controller.browserCases.length,
        serverCases: controller.serverCases.length,
      };
    },
    quiesce: async () => {
      for (const projectName of AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS) {
        releaseObserveGate(projectName);
        releaseArmGate(projectName);
        releaseDeliveryTaskGate(projectName);
        releaseAssessmentGate(projectName, 'reject-finalize');
      }
      return { quiesced: true };
    },
    cleanup: async () => {
      for (const permit of processFaultPermits.values()) if (permit.state === 'armed') permit.state = 'revoked';
      return { cleaned: true };
    },
    verifyCleanup: async () => ({
      capturedAt: nextTime().toISOString(),
      activeSessions: 0,
      activeIdentities: 0,
      activeMemberships: 0,
      armedPermits: [...processFaultPermits.values()].filter(permit => permit.state === 'armed').length,
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

export const runAuthenticatedHostedSignInEntry = async ({
  processSeedMode = 'valid', processReadStateOnly = false, scopedNavigationOnly = false,
} = {}) => {
  const stateBefore = await checkoutState();
  const scopedNavigationEvidencePath = scopedNavigationOnly
    ? path.resolve('output/local-private/authenticated-product-acceptance/scoped-navigation-corrected.jsonl')
    : '';
  if (scopedNavigationEvidencePath) {
    await mkdir(path.dirname(scopedNavigationEvidencePath), { recursive: true });
    await rm(scopedNavigationEvidencePath, { force: true });
  }
  let temporaryRoot;
  let fixture;
  let preview;
  let cleanupSucceeded = false;
  try {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'avalaos-sign-in-entry-'));
    const buildDirectory = path.join(temporaryRoot, 'build');
    const playwrightOutputDirectory = path.join(temporaryRoot, 'playwright');
    fixture = await startAuthenticatedHostedSignInEntryFixture({ processSeedMode });
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
      AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROCESS_SEED_MODE: processSeedMode,
      AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROCESS_READ_STATE_ONLY: String(processReadStateOnly),
      AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_SCOPED_NAVIGATION_ONLY: String(scopedNavigationOnly),
      AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_SCOPED_NAVIGATION_EVIDENCE_PATH: scopedNavigationEvidencePath,
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
const invokedProcessSeedMode = process.argv.length === 2
  || (process.argv.length === 3 && ['--process-read-state', '--scoped-navigation'].includes(process.argv[2])) ? 'valid'
  : process.argv.length === 3 && process.argv[2] === '--nullable-process-reproduction'
    ? 'nullable-reproduction' : 'rejected';
if (invoked) runAuthenticatedHostedSignInEntry({
  processSeedMode: invokedProcessSeedMode,
  processReadStateOnly: process.argv.length === 3 && process.argv[2] === '--process-read-state',
  scopedNavigationOnly: process.argv.length === 3 && process.argv[2] === '--scoped-navigation',
}).then(() => {
  console.log('AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PASS');
}).catch(error => {
  console.error(error instanceof Error ? error.message : 'AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_FAILED');
  process.exitCode = 1;
});
