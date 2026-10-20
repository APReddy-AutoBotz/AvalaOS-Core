import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalSupabasePublicOrigin, isSafePublicSupabaseCredential } from '../services/supabasePublicCredential.mjs';

export const LOCAL_ACCEPTANCE_ORIGIN = 'http://127.0.0.1:4173';
export const LOCAL_ACCEPTANCE_EXECUTION_KIND = 'local_real_backend';
export const LOCAL_AUTHENTICATED_EXECUTION_KIND = 'local_real_backend_authenticated';
export const LOCAL_ACCEPTANCE_MANIFEST_SCHEMA = 'local-acceptance-build-manifest-v1';

const SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const OWNED_PREFIX = 'avalaos-local-acceptance-';
const PROTECTED_NAME = /(?:DATABASE_URL|SERVICE_ROLE|MANAGEMENT_TOKEN|SECRET|PASSWORD|PRIVATE_KEY|OPENAI_API_KEY|GITHUB_TOKEN|AVALA_VAULT_TOKEN)/u;
const PUBLIC_BUILD_KEYS = new Set(['VITE_AVALA_RUNTIME_MODE', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']);
const RUNTIME_KEYS = Object.freeze([
  'PATH', 'Path', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'SystemRoot', 'SYSTEMROOT',
  'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL',
]);

const fail = code => { throw new Error(`LOCAL_ACCEPTANCE_BUILD_${code}`); };
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const canonicalJson = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const assertOwnedWorkspace = workspace => {
  const resolved = path.resolve(workspace);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith(OWNED_PREFIX)) {
    fail('WORKSPACE_REJECTED');
  }
  return resolved;
};

const normalizeRelative = relative => {
  const normalized = relative.split(path.sep).join('/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('..') || normalized.includes('\\')) {
    fail('PATH_REJECTED');
  }
  return normalized;
};

const collectFiles = async (root, current = root) => {
  const rows = [];
  for (const item of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, item.name);
    if (item.isSymbolicLink()) fail('SYMLINK_REJECTED');
    if (item.isDirectory()) rows.push(...await collectFiles(root, absolute));
    else if (item.isFile()) {
      const bytes = await readFile(absolute);
      rows.push({ path: normalizeRelative(path.relative(root, absolute)), length: bytes.byteLength, sha256: sha(bytes) });
    } else fail('FILE_TYPE_REJECTED');
  }
  return rows.sort((left, right) => left.path.localeCompare(right.path));
};

const manifestPayload = ({ releaseSha, files }) => ({
  schemaVersion: LOCAL_ACCEPTANCE_MANIFEST_SCHEMA,
  releaseSha,
  files,
});

export async function createLocalAcceptanceManifest(siteDirectory, releaseSha) {
  if (!SHA.test(releaseSha ?? '')) fail('RELEASE_REJECTED');
  const files = await collectFiles(path.resolve(siteDirectory));
  if (!files.length || !files.some(file => file.path === 'index.html')) fail('SITE_REJECTED');
  const payload = manifestPayload({ releaseSha, files });
  return Object.freeze({ ...payload, buildDigest: sha(canonicalJson(payload)) });
}

export function deriveLocalAcceptanceExerciseDigest({ approvedExerciseDigest, buildDigest, releaseSha }) {
  if (!DIGEST.test(approvedExerciseDigest ?? '') || !DIGEST.test(buildDigest ?? '') || !SHA.test(releaseSha ?? '')) {
    fail('EXERCISE_BINDING_REJECTED');
  }
  return sha(canonicalJson({ approvedExerciseDigest, buildDigest, releaseSha }));
}

export async function verifyLocalAcceptanceManifest({ workspace, expectedReleaseSha, expectedBuildDigest }) {
  const root = assertOwnedWorkspace(workspace);
  const manifestPath = path.join(root, 'manifest.json');
  const siteDirectory = path.join(root, 'site');
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch { fail('MANIFEST_REJECTED'); }
  const actual = await createLocalAcceptanceManifest(siteDirectory, expectedReleaseSha);
  if (manifest?.schemaVersion !== LOCAL_ACCEPTANCE_MANIFEST_SCHEMA
    || manifest.releaseSha !== expectedReleaseSha || manifest.buildDigest !== expectedBuildDigest
    || canonicalJson(manifest) !== canonicalJson(actual)) fail('MANIFEST_MISMATCH');
  return Object.freeze({ workspace: root, siteDirectory, manifestPath, manifest: actual });
}

const runChild = (command, args, options, spawnImpl = spawn) => new Promise((resolve, reject) => {
  const child = spawnImpl(command, args, { ...options, stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
  child.once('error', () => reject(new Error('LOCAL_ACCEPTANCE_BUILD_CHILD_START_FAILED')));
  child.once('exit', code => code === 0 ? resolve() : reject(new Error('LOCAL_ACCEPTANCE_BUILD_CHILD_FAILED')));
});

const defaultVerifyCheckout = async environment => {
  if (!SHA.test(environment.RELEASE_SHA ?? '') || environment.GITHUB_SHA !== environment.RELEASE_SHA) {
    fail('RELEASE_REJECTED');
  }
  await runChild(process.execPath, ['scripts/authenticatedHostedCheckout.mjs'], { cwd: process.cwd(), env: environment });
};

const validatePublicBackend = environment => {
  const backendOrigin = canonicalSupabasePublicOrigin(environment.AUTHENTICATED_ACCEPTANCE_SUPABASE_URL);
  if (!backendOrigin || backendOrigin !== environment.AUTHENTICATED_ACCEPTANCE_SUPABASE_URL) fail('PUBLIC_BACKEND_REJECTED');
  const publishableKey = environment.AUTHENTICATED_ACCEPTANCE_SUPABASE_PUBLISHABLE_KEY;
  if (!isSafePublicSupabaseCredential(publishableKey) || publishableKey.length > 2048) {
    fail('PUBLISHABLE_KEY_REJECTED');
  }
  return { backendOrigin, publishableKey };
};

const buildEnvironment = (environment, publicBackend) => {
  const child = {};
  for (const key of RUNTIME_KEYS) if (typeof environment[key] === 'string' && environment[key]) child[key] = environment[key];
  return Object.freeze({
    ...child,
    NODE_ENV: 'production',
    AVALAOS_HOSTED_NONPRODUCTION_STABLE_TESTING: 'authorized',
    SITE_NAME: 'avalaos-pilot',
    VITE_AVALA_RUNTIME_MODE: 'pilot',
    VITE_SUPABASE_URL: publicBackend.backendOrigin,
    VITE_SUPABASE_ANON_KEY: publicBackend.publishableKey,
  });
};

const scanBuild = async (siteDirectory, environment, publicBackend) => {
  const forbiddenNames = Object.keys(environment).filter(name => PROTECTED_NAME.test(name) && !PUBLIC_BUILD_KEYS.has(name));
  const forbiddenValues = Object.entries(environment)
    .filter(([name, value]) => PROTECTED_NAME.test(name) && typeof value === 'string' && value.length >= 12)
    .map(([, value]) => value)
    .filter(value => value !== publicBackend.publishableKey);
  for (const file of await collectFiles(siteDirectory)) {
    const bytes = await readFile(path.join(siteDirectory, ...file.path.split('/')));
    const text = bytes.toString('utf8');
    if (forbiddenNames.some(name => text.includes(name)) || forbiddenValues.some(value => text.includes(value))) {
      fail('PROTECTED_VALUE_EMBEDDED');
    }
  }
};

export async function buildLocalAcceptanceFrontend(environment, {
  verifyCheckout = defaultVerifyCheckout,
  spawnImpl = spawn,
  makeWorkspace = () => mkdtemp(path.join(os.tmpdir(), OWNED_PREFIX)),
} = {}) {
  const releaseSha = environment.RELEASE_SHA;
  if (!SHA.test(releaseSha ?? '') || environment.GITHUB_SHA !== releaseSha) fail('RELEASE_REJECTED');
  const publicBackend = validatePublicBackend(environment);
  await verifyCheckout(environment);
  const workspace = assertOwnedWorkspace(await makeWorkspace());
  const siteDirectory = path.join(workspace, 'site');
  await mkdir(siteDirectory, { recursive: true });
  try {
    const emptyEnvDirectory = path.join(workspace, 'empty-env');
    const buildRunner = path.join(workspace, 'build.mjs');
    await mkdir(emptyEnvDirectory, { recursive: true });
    const viteModule = pathToFileURL(path.resolve('node_modules/vite/dist/node/index.js')).href;
    const viteConfig = path.resolve('vite.config.ts');
    await writeFile(buildRunner, [
      `import { build } from ${JSON.stringify(viteModule)};`,
      `await build({ configFile: ${JSON.stringify(viteConfig)}, envDir: process.argv[3],`,
      "  build: { outDir: process.argv[2], emptyOutDir: true } });",
      '',
    ].join('\n'), { encoding: 'utf8', mode: 0o600 });
    await runChild(process.execPath, [buildRunner, siteDirectory, emptyEnvDirectory], {
      cwd: process.cwd(), env: buildEnvironment(environment, publicBackend),
    }, spawnImpl);
    await unlink(buildRunner);
    await rm(emptyEnvDirectory, { recursive: true, force: true });
    await verifyCheckout(environment);
    await scanBuild(siteDirectory, environment, publicBackend);
    const manifest = await createLocalAcceptanceManifest(siteDirectory, releaseSha);
    await writeFile(path.join(workspace, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return Object.freeze({ workspace, siteDirectory, manifest, origin: LOCAL_ACCEPTANCE_ORIGIN });
  } catch (error) {
    await rm(workspace, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

const contentType = file => ({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
})[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

export async function startLocalAcceptanceServer({ workspace, releaseSha, buildDigest, port = 4173 }) {
  if (port !== 4173) fail('PORT_REJECTED');
  const verified = await verifyLocalAcceptanceManifest({ workspace, expectedReleaseSha: releaseSha,
    expectedBuildDigest: buildDigest });
  const entries = new Map(verified.manifest.files.map(file => [file.path, file]));
  const sockets = new Set();
  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method ?? '')) fail('METHOD_REJECTED');
      if (request.headers.host !== '127.0.0.1:4173') fail('HOST_REJECTED');
      const url = new URL(request.url ?? '/', LOCAL_ACCEPTANCE_ORIGIN);
      if (url.origin !== LOCAL_ACCEPTANCE_ORIGIN || url.hash) fail('REQUEST_REJECTED');
      // Navigation state lives in the query; only the pathname selects manifest bytes.
      let requested = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      if (!requested || !entries.has(requested)) requested = 'index.html';
      const expected = entries.get(requested);
      if (!expected) fail('FILE_REJECTED');
      const file = path.join(verified.siteDirectory, ...requested.split('/'));
      const linked = await lstat(file);
      if (!linked.isFile() || linked.isSymbolicLink()) fail('FILE_REJECTED');
      const bytes = await readFile(file);
      if (bytes.byteLength !== expected.length || sha(bytes) !== expected.sha256) fail('SERVED_BYTES_MISMATCH');
      response.writeHead(200, { 'content-type': contentType(file), 'content-length': String(bytes.byteLength),
        'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      response.end('Not found');
    }
  });
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  return Object.freeze({ origin: LOCAL_ACCEPTANCE_ORIGIN, close: async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('LOCAL_ACCEPTANCE_BUILD_SERVER_CLEANUP_TIMEOUT')), 5_000);
      server.close(error => { clearTimeout(timer); if (error) reject(error); else resolve(); });
    });
  } });
}

export async function verifyLocalAcceptanceServer({ workspace, releaseSha, buildDigest, fetchImpl = fetch,
  launchBrowser } = {}) {
  const verified = await verifyLocalAcceptanceManifest({ workspace, expectedReleaseSha: releaseSha,
    expectedBuildDigest: buildDigest });
  for (const file of verified.manifest.files) {
    const response = await fetchImpl(`${LOCAL_ACCEPTANCE_ORIGIN}/${file.path}`, { redirect: 'error',
      signal: AbortSignal.timeout(15_000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (response.status !== 200 || bytes.byteLength !== file.length || sha(bytes) !== file.sha256) {
      fail('SERVED_BYTES_MISMATCH');
    }
    if (response.headers.get('x-avalaos-release') || response.headers.get('x-avalaos-netlify-deploy-id')) {
      fail('HEADER_IDENTITY_REJECTED');
    }
  }
  const spa = await fetchImpl(`${LOCAL_ACCEPTANCE_ORIGIN}/sign-in`, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
  const spaBytes = Buffer.from(await spa.arrayBuffer());
  const index = verified.manifest.files.find(file => file.path === 'index.html');
  if (!index || spa.status !== 200 || spaBytes.byteLength !== index.length || sha(spaBytes) !== index.sha256) {
    fail('SPA_FALLBACK_REJECTED');
  }
  let ownedBrowser;
  let browserContext;
  try {
    if (!launchBrowser) {
      const { chromium } = await import('@playwright/test');
      ownedBrowser = await chromium.launch({ headless: true });
    }
    const browser = ownedBrowser ?? await launchBrowser();
    if (typeof browser.newContext === 'function') {
      browserContext = await browser.newContext();
      await browserContext.route('**/*', route => {
        let requestOrigin;
        try { requestOrigin = new URL(route.request().url()).origin; } catch { return route.abort('blockedbyclient'); }
        return requestOrigin === LOCAL_ACCEPTANCE_ORIGIN ? route.continue() : route.abort('blockedbyclient');
      });
    }
    const page = browserContext ? await browserContext.newPage() : await browser.newPage();
    await page.goto(`${LOCAL_ACCEPTANCE_ORIGIN}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const secure = await page.evaluate(() => ({ secureContext: globalThis.isSecureContext,
      subtleCrypto: typeof globalThis.crypto?.subtle?.digest === 'function',
      randomUuid: typeof globalThis.crypto?.randomUUID === 'function' }));
    const reloadUrl = `${LOCAL_ACCEPTANCE_ORIGIN}/sign-in?view=process_catalog&scope=my_work`;
    await page.evaluate(url => globalThis.history.replaceState(null, '', url), reloadUrl);
    const reloaded = await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (!reloaded || reloaded.status() !== 200 || reloaded.url() !== reloadUrl
      || sha(await reloaded.body()) !== index.sha256) fail('SPA_QUERY_RELOAD_REJECTED');
    await page.close();
    if (secure.secureContext !== true || secure.subtleCrypto !== true || secure.randomUuid !== true) {
      fail('SECURE_CONTEXT_REJECTED');
    }
  } finally {
    await browserContext?.close();
    await ownedBrowser?.close();
  }
  await verifyLocalAcceptanceManifest({ workspace, expectedReleaseSha: releaseSha, expectedBuildDigest: buildDigest });
  const totalBytes = verified.manifest.files.reduce((total, file) => total + file.length, 0);
  return Object.freeze({ verified: true, origin: LOCAL_ACCEPTANCE_ORIGIN, buildDigest,
    releaseSha, fileCount: verified.manifest.files.length, totalBytes, servedFiles: verified.manifest.files.length,
    servedBytes: totalBytes, manifestVerifiedBefore: true, manifestVerifiedAfter: true,
    secureContext: true, subtleCrypto: true, randomUuid: true, externalNetworkBlocked: true,
    headerIdentityUsed: false, manifest: verified.manifest });
}

export async function cleanupLocalAcceptanceWorkspace(workspace) {
  const root = assertOwnedWorkspace(workspace);
  try {
    const state = JSON.parse(await readFile(path.join(root, 'server.json'), 'utf8'));
    if (Number.isSafeInteger(state?.pid) && state.pid > 0) {
      try { process.kill(state.pid, 0); fail('ACTIVE_SERVER_REJECTED'); }
      catch (error) { if (error?.code !== 'ESRCH') throw error; }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await rm(root, { recursive: true, force: true });
}

const serverStatePath = workspace => path.join(assertOwnedWorkspace(workspace), 'server.json');

const writeServerState = async ({ workspace, releaseSha, buildDigest }) => {
  const destination = serverStatePath(workspace);
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ schemaVersion: 'local-acceptance-server-state-v1', pid: process.pid,
    releaseSha, buildDigest })}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, destination);
};

export async function stopLocalAcceptanceServer({ workspace, releaseSha, buildDigest }) {
  const statePath = serverStatePath(workspace);
  let state;
  try { state = JSON.parse(await readFile(statePath, 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return { stopped: false }; fail('SERVER_STATE_REJECTED'); }
  if (state?.schemaVersion !== 'local-acceptance-server-state-v1' || !Number.isSafeInteger(state.pid) || state.pid < 1
    || state.releaseSha !== releaseSha || state.buildDigest !== buildDigest) fail('SERVER_STATE_REJECTED');
  let running = true;
  try { process.kill(state.pid, 0); } catch (error) { if (error?.code === 'ESRCH') running = false; else throw error; }
  if (running) {
    if (process.platform !== 'linux') fail('SERVER_OWNERSHIP_REJECTED');
    const command = (await readFile(`/proc/${state.pid}/cmdline`)).toString('utf8').split('\0').filter(Boolean);
    if (!command.some(value => value.endsWith('localAcceptanceBuild.mjs')) || !command.includes('serve')
      || !command.includes(assertOwnedWorkspace(workspace))) fail('SERVER_OWNERSHIP_REJECTED');
    process.kill(state.pid, 'SIGTERM');
    const startedAt = Date.now();
    while (Date.now() - startedAt < 10_000) {
      try { process.kill(state.pid, 0); await new Promise(resolve => setTimeout(resolve, 100)); }
      catch (error) { if (error?.code === 'ESRCH') { running = false; break; } throw error; }
    }
    if (running) fail('SERVER_CLEANUP_TIMEOUT');
  }
  await unlink(statePath).catch(error => { if (error?.code !== 'ENOENT') throw error; });
  return { stopped: true };
}

const writeVerificationEvidence = async (destination, phase, result) => {
  if (!['before', 'after'].includes(phase)) fail('EVIDENCE_PHASE_REJECTED');
  const resolved = path.resolve(destination);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir())
    || path.basename(resolved) !== 'local-acceptance-build-proof.json') fail('EVIDENCE_PATH_REJECTED');
  let document = { schemaVersion: 'local-acceptance-build-proof-v1', before: null, after: null };
  try { document = JSON.parse(await readFile(resolved, 'utf8')); }
  catch (error) { if (error?.code !== 'ENOENT') fail('EVIDENCE_REJECTED'); }
  if (document?.schemaVersion !== 'local-acceptance-build-proof-v1'
    || !Object.hasOwn(document, 'before') || !Object.hasOwn(document, 'after')) fail('EVIDENCE_REJECTED');
  if ((phase === 'before' && (document.before !== null || document.after !== null))
    || (phase === 'after' && (document.before?.releaseSha !== result.releaseSha
      || document.before?.buildDigest !== result.buildDigest || document.after !== null))) fail('EVIDENCE_REJECTED');
  document[phase] = result;
  const temporary = `${resolved}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, resolved);
};

const argument = name => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

async function cli() {
  const command = process.argv[2];
  if (command === 'smoke') {
    const fixtureEnvironment = {
      ...process.env,
      GITHUB_SHA: process.env.RELEASE_SHA,
      AUTHENTICATED_ACCEPTANCE_SUPABASE_URL: `https://${'a'.repeat(20)}.supabase.co`,
      AUTHENTICATED_ACCEPTANCE_SUPABASE_PUBLISHABLE_KEY:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.fixture',
    };
    const built = await buildLocalAcceptanceFrontend(fixtureEnvironment);
    let running;
    try {
      // Exercise the protected declaration step after a real build has exported its identity.
      const { parseWorkflowYaml } = await import('./checkWorkflowYaml.mjs');
      const workflow = parseWorkflowYaml(await readFile('.github/workflows/authenticated-product-acceptance.yml', 'utf8'));
      const declaration = workflow.jobs['hosted-authenticated'].steps
        .find(step => step.name === 'Validate deterministic public hosted declarations');
      if (declaration?.run !== 'npx playwright test --config=playwright.exhaustive-acceptance.config.ts --list --reporter=list') {
        fail('DECLARATION_COMMAND_CHANGED');
      }
      const declarationEnvironment = Object.fromEntries(Object.entries(declaration.env).map(([key, value]) =>
        [key, String(value).replace('${{ inputs.release_sha }}', process.env.RELEASE_SHA)]));
      await runChild(process.execPath, ['node_modules/playwright/cli.js', 'test',
        '--config=playwright.exhaustive-acceptance.config.ts', '--list', '--reporter=list'], {
        cwd: process.cwd(), env: { ...fixtureEnvironment,
          ACCEPTANCE_EXECUTION_KIND: LOCAL_ACCEPTANCE_EXECUTION_KIND,
          AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND: LOCAL_AUTHENTICATED_EXECUTION_KIND,
          HOSTED_PILOT_URL: LOCAL_ACCEPTANCE_ORIGIN, NETLIFY_DEPLOY_ID: '',
          AUTHENTICATED_ACCEPTANCE_BUILD_DIGEST: built.manifest.buildDigest,
          ...declarationEnvironment },
      });
      running = await startLocalAcceptanceServer({ workspace: built.workspace, releaseSha: process.env.RELEASE_SHA,
        buildDigest: built.manifest.buildDigest });
      await verifyLocalAcceptanceServer({ workspace: built.workspace, releaseSha: process.env.RELEASE_SHA,
        buildDigest: built.manifest.buildDigest });
      console.log('LOCAL_ACCEPTANCE_BUILD_SMOKE_VERIFIED');
    } finally {
      await running?.close();
      await cleanupLocalAcceptanceWorkspace(built.workspace);
    }
    return;
  }
  if (command === 'build') {
    const result = await buildLocalAcceptanceFrontend(process.env);
    console.log([
      `LOCAL_ACCEPTANCE_BUILD_ROOT=${result.workspace}`,
      `AUTHENTICATED_ACCEPTANCE_BUILD_DIGEST=${result.manifest.buildDigest}`,
      `HOSTED_PILOT_URL=${LOCAL_ACCEPTANCE_ORIGIN}`,
      'NETLIFY_DEPLOY_ID=',
      `ACCEPTANCE_EXECUTION_KIND=${LOCAL_ACCEPTANCE_EXECUTION_KIND}`,
      `AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND=${LOCAL_AUTHENTICATED_EXECUTION_KIND}`,
    ].join('\n'));
    return;
  }
  const workspace = argument('--workspace');
  const releaseSha = process.env.RELEASE_SHA;
  const buildDigest = process.env.AUTHENTICATED_ACCEPTANCE_BUILD_DIGEST;
  if (command === 'serve') {
    const running = await startLocalAcceptanceServer({ workspace, releaseSha, buildDigest });
    await writeServerState({ workspace, releaseSha, buildDigest });
    const close = async () => { await running.close(); process.exit(0); };
    process.once('SIGTERM', close); process.once('SIGINT', close);
    await new Promise(() => {});
  } else if (command === 'verify') {
    const result = await verifyLocalAcceptanceServer({ workspace, releaseSha, buildDigest });
    const evidence = argument('--evidence');
    if (evidence) await writeVerificationEvidence(evidence, argument('--phase'), result);
  } else if (command === 'stop') {
    await stopLocalAcceptanceServer({ workspace, releaseSha, buildDigest });
  } else if (command === 'cleanup') {
    await cleanupLocalAcceptanceWorkspace(workspace);
  } else fail('COMMAND_REJECTED');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  cli().catch(error => {
    console.error(/^LOCAL_ACCEPTANCE_BUILD_[A-Z0-9_]+$/u.test(error?.message ?? '')
      ? error.message : 'LOCAL_ACCEPTANCE_BUILD_REJECTED');
    process.exitCode = 1;
  });
}
