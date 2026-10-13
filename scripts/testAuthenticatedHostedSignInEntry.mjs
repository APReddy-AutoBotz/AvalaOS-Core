import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const LOOPBACK_HOST = '127.0.0.1';
const MAX_REQUEST_BYTES = 16 * 1024;
const CONTROL_TOKEN = 'local-sign-in-entry-control';
const PUBLIC_ANON_KEY = 'sb_publishable_authenticated_hosted_sign_in_entry';
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
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-enterprise-lifecycle-control',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
});

const sendJson = (outgoing, status, value) => {
  outgoing.writeHead(status, responseHeaders);
  outgoing.end(value === undefined ? '' : JSON.stringify(value));
};

const identityRows = Object.freeze(Object.fromEntries(AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS.flatMap((projectName, projectIndex) => [
  [`author.${projectName}@local.invalid`, {
    projectName,
    actor: 'A',
    persona: 'author',
    password: 'synthetic-author-password',
    token: `loopback-${projectName}-token-a`,
    user: {
      id: `10000000-0000-4000-8000-00000000000${projectIndex * 2 + 1}`,
      email: `author.${projectName}@local.invalid`,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: { provider: 'loopback' },
      user_metadata: { full_name: 'Synthetic Author' },
    },
  }],
  [`reviewer.${projectName}@local.invalid`, {
    projectName,
    actor: 'B',
    persona: 'reviewer',
    password: 'synthetic-reviewer-password',
    token: `loopback-${projectName}-token-b`,
    user: {
      id: `10000000-0000-4000-8000-00000000000${projectIndex * 2 + 2}`,
      email: `reviewer.${projectName}@local.invalid`,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: { provider: 'loopback' },
      user_metadata: { full_name: 'Synthetic Reviewer' },
    },
  }],
])));
const identitiesByToken = new Map(Object.values(identityRows).map(identity => [identity.token, identity]));

const bearerToken = incoming => String(incoming.headers.authorization ?? '').replace(/^Bearer\s+/iu, '');
const projectFromRejectedEmail = email => {
  const match = /^rejected\.(desktop-chromium|pixel-7-chromium)@local[.]invalid$/u.exec(email);
  return match?.[1] ?? null;
};

export const startAuthenticatedHostedSignInEntryFixture = async () => {
  const observations = new Map(AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_PROJECTS.map(projectName => [projectName, {
    passwordRequests: [],
    diagnostics: [],
    bindings: [],
  }]));
  const server = createServer(async (incoming, outgoing) => {
    try {
      const address = server.address();
      const url = new URL(incoming.url ?? '/', `http://${LOOPBACK_HOST}:${address.port}`);
      if (incoming.method === 'OPTIONS') return sendJson(outgoing, 204);
      const rawBody = ['GET', 'HEAD'].includes(incoming.method ?? 'GET') ? '' : await readBody(incoming);
      const body = rawBody ? JSON.parse(rawBody) : {};

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
          organizationId: '20000000-0000-4000-8000-000000000001',
          organizationName: 'Loopback organization',
          workspaceId: '30000000-0000-4000-8000-000000000001',
          workspaceName: 'Loopback workspace',
          authorizationVersion: 1,
          capabilities: ['assess.read'],
        }] });
      }

      const controlAuthorized = incoming.headers['x-enterprise-lifecycle-control'] === CONTROL_TOKEN;
      if (incoming.method === 'POST' && url.pathname === '/control/browser-diagnostic') {
        if (!controlAuthorized) return sendJson(outgoing, 403, { error: 'CONTROL_DENIED' });
        const projectObservation = observations.get(body.projectName);
        const diagnostic = body.diagnostic;
        if (!projectObservation || !diagnostic || diagnostic.operation !== 'SIGN_IN'
          || diagnostic.category !== 'CREDENTIAL_REJECTED' || diagnostic.upstreamCode !== 'invalid_credentials'
          || Object.keys(diagnostic).some(key => !['operation', 'category', 'upstreamCode'].includes(key))) {
          return sendJson(outgoing, 400, { error: 'DIAGNOSTIC_REJECTED' });
        }
        projectObservation.diagnostics.push({ ...diagnostic });
        return sendJson(outgoing, 200, { accepted: true });
      }

      if (incoming.method === 'POST' && url.pathname === '/control/bind-browser-session') {
        if (!controlAuthorized) return sendJson(outgoing, 403, { error: 'CONTROL_DENIED' });
        const projectObservation = observations.get(body.projectName);
        const identity = identitiesByToken.get(body.accessToken);
        if (!projectObservation || !identity || identity.projectName !== body.projectName
          || identity.persona !== body.persona) return sendJson(outgoing, 400, { error: 'BINDING_REJECTED' });
        projectObservation.bindings.push({ actor: identity.actor, persona: body.persona, token: body.accessToken });
        return sendJson(outgoing, 200, { accepted: true });
      }

      if (incoming.method === 'GET' && url.pathname === '/control/sign-in-entry-observation') {
        if (!controlAuthorized) return sendJson(outgoing, 403, { error: 'CONTROL_DENIED' });
        const projectObservation = observations.get(url.searchParams.get('projectName'));
        return projectObservation
          ? sendJson(outgoing, 200, projectObservation)
          : sendJson(outgoing, 404, { error: 'PROJECT_NOT_FOUND' });
      }

      return sendJson(outgoing, 404, { error: 'NOT_FOUND' });
    } catch {
      return sendJson(outgoing, 500, { error: 'FIXTURE_FAILURE' });
    }
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen({ host: LOOPBACK_HOST, port: 0, exclusive: true }, resolve);
    });
  } catch (error) {
    server.close();
    throw error;
  }
  const address = server.address();
  const baseUrl = assertAuthenticatedHostedSignInEntryLoopbackUrl(`http://${LOOPBACK_HOST}:${address.port}`);
  let closed = false;
  return {
    baseUrl,
    controlToken: CONTROL_TOKEN,
    publicAnonKey: PUBLIC_ANON_KEY,
    async close() {
      if (closed) return true;
      closed = true;
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
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
      VITE_SUPABASE_URL: fixture.baseUrl,
      VITE_SUPABASE_ANON_KEY: fixture.publicAnonKey,
      VITE_AI_EDGE_FUNCTIONS_ENABLED: 'false',
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
      AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_APP_URL: appBaseUrl,
      AUTHENTICATED_HOSTED_SIGN_IN_ENTRY_OUTPUT_DIR: playwrightOutputDirectory,
      ENTERPRISE_LIFECYCLE_API_BASE_URL: fixture.baseUrl,
      ENTERPRISE_LIFECYCLE_CONTROL_URL: fixture.baseUrl,
      ENTERPRISE_LIFECYCLE_CONTROL_TOKEN: fixture.controlToken,
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
