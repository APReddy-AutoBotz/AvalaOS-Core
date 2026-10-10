import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createLegacyDeliveryBrowserFixture,
  legacyDeliveryBrowserFixtureSources,
} from './legacyDeliveryBrowserFixture.mjs';

export const LEGACY_DELIVERY_BROWSER_PROJECTS = Object.freeze(['chromium-desktop', 'chromium-mobile']);
export const LEGACY_DELIVERY_BROWSER_SOURCES = Object.freeze([
  ...legacyDeliveryBrowserFixtureSources,
  'scripts/runLegacyDeliveryAuthorityBrowser.mjs',
  'vite.legacy-delivery.config.ts',
  'playwright.legacy-delivery.config.ts',
  'tests/browser/legacyDeliveryAuthority.spec.ts',
  'App.tsx',
  'components/delivery/DeliveryProvider.tsx',
  'components/delivery/ImportWorkItemsModal.tsx',
  'components/delivery/WorkspaceView.tsx',
  'components/delivery/BacklogView.tsx',
  'components/delivery/InlineTaskCreator.tsx',
  'components/delivery/TaskDetailModal.tsx',
  'components/docs/DocsProvider.tsx',
  'components/docs/DocsView.tsx',
  'services/adapters/deliveryAdapter.ts',
  'services/adapters/docsAdapter.ts',
  'services/governedCreationNavigation.ts',
  'services/legacyDelivery/client.ts',
  'services/productActionPolicy.ts',
  'types.ts',
]);
const outputDirectory = path.join('output', 'acceptance', 'legacy-delivery');
const playwrightDirectory = path.join('.agent', 'legacy-delivery-authority-playwright');
const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const canonicalSource = value => Buffer.from(value.toString('utf8').replace(/\r\n/gu, '\n'), 'utf8');
const repositoryRoot = path.resolve(process.cwd());
const safeGeneratedDirectory = target => {
  const resolved = path.resolve(target);
  const relative = path.relative(repositoryRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('LEGACY_DELIVERY_OUTPUT_PATH_REJECTED');
  }
  return resolved;
};

const loopback = value => {
  const parsed = new URL(value);
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    throw new Error('LEGACY_DELIVERY_NON_LOOPBACK_URL_REJECTED');
  }
  return parsed.toString().replace(/\/$/u, '');
};
const availablePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : null;
    server.close(error => error ? reject(error) : resolve(port));
  });
});
const waitForHttp = async (url, timeoutMs = 120_000) => {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
      lastError = new Error(`HTTP_${response.status}`);
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`LEGACY_DELIVERY_HTTP_NOT_READY:${String(lastError)}`);
};
const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: process.cwd(), stdio: 'inherit', ...options });
  child.once('error', reject);
  child.once('exit', (code, signal) => code === 0
    ? resolve()
    : reject(new Error(`LEGACY_DELIVERY_COMMAND_FAILED:${command}:${code ?? signal}`)));
});
const stop = async child => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return true;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  if (child.exitCode === null && child.signalCode === null) {
    await Promise.race([
      new Promise(resolve => child.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 5_000)),
    ]);
  }
  return child.exitCode !== null || child.signalCode !== null;
};
const readFragment = async project => JSON.parse(await readFile(path.join(outputDirectory, `${project}.json`), 'utf8'));

export const aggregateLegacyDeliveryBrowserEvidence = ({ fragments, startedAt, completedAt, cleanup }) => {
  const byProject = new Map(fragments.map(fragment => [fragment.project, fragment]));
  const projects = LEGACY_DELIVERY_BROWSER_PROJECTS.map(project => {
    const fragment = byProject.get(project);
    if (!fragment || fragment.schemaVersion !== 'legacy-delivery-browser-evidence.v1' || fragment.status !== 'passed'
      || fragment.exactProductUi !== true || fragment.loopbackOnly !== true || fragment.unknownResponseReplayedOnce !== true) {
      throw new Error(`LEGACY_DELIVERY_BROWSER_FRAGMENT_INVALID:${project}`);
    }
    for (const operation of ['import', 'task.create', 'task.update', 'task.delete', 'reload']) {
      if (!fragment.operations?.includes(operation)) throw new Error(`LEGACY_DELIVERY_BROWSER_OPERATION_MISSING:${project}:${operation}`);
    }
    const snapshot = fragment.snapshot;
    if (snapshot?.tasks !== 3 || snapshot?.imports !== 1 || snapshot?.receipts !== 4 || snapshot?.audits !== 4
      || snapshot?.active !== 2 || snapshot?.retained !== 1 || snapshot?.max_version < 2) {
      throw new Error(`LEGACY_DELIVERY_BROWSER_SNAPSHOT_INVALID:${project}`);
    }
    return fragment;
  });
  if (cleanup?.database !== true || cleanup?.fixtureServer !== true || cleanup?.preview !== true) {
    throw new Error('LEGACY_DELIVERY_BROWSER_CLEANUP_INVALID');
  }
  return {
    schemaVersion: 'legacy-delivery-browser-evidence.v1',
    status: 'passed',
    execution: {
      headSha: process.env.RELEASE_SHA ?? process.env.PILOT_ACCEPTANCE_HEAD ?? process.env.GITHUB_SHA ?? 'local-working-tree',
      runId: process.env.GITHUB_RUN_ID ?? `local-${process.pid}`,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? '1',
      startedAt,
      completedAt,
    },
    boundaries: { disposablePostgres: true, actualProductUi: true, actualEdgeHandlers: true, loopbackOnly: true, paidAiCalls: 0 },
    projects,
    cleanup,
    sourceDigests: [],
  };
};

const main = async () => {
  const databaseUrl = process.env.LEGACY_DELIVERY_ACCEPTANCE_DATABASE_URL;
  if (!databaseUrl) throw new Error('LEGACY_DELIVERY_ACCEPTANCE_DATABASE_URL_REQUIRED');
  const startedAt = new Date().toISOString();
  await rm(safeGeneratedDirectory(outputDirectory), { recursive: true, force: true });
  await rm(safeGeneratedDirectory(playwrightDirectory), { recursive: true, force: true });
  await mkdir(safeGeneratedDirectory(outputDirectory), { recursive: true });
  const fixture = await createLegacyDeliveryBrowserFixture({ databaseUrl });
  const apiBaseUrl = loopback(fixture.baseUrl);
  const appBaseUrl = `http://127.0.0.1:${await availablePort()}`;
  let preview;
  let playwrightPassed = false;
  let fixtureClosed = false;
  let previewStopped = false;
  try {
    const buildEnvironment = {
      ...process.env,
      VITE_AVALA_RUNTIME_MODE: 'pilot',
      VITE_SUPABASE_URL: apiBaseUrl,
      VITE_SUPABASE_ANON_KEY: fixture.publicAnonKey,
      VITE_AI_EDGE_FUNCTIONS_ENABLED: 'false',
    };
    await run(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.legacy-delivery.config.ts'], { env: buildEnvironment });
    preview = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', new URL(appBaseUrl).port], {
      cwd: process.cwd(), env: buildEnvironment, stdio: 'inherit',
    });
    await waitForHttp(`${appBaseUrl}/`);
    await run(process.execPath, [path.resolve('node_modules/@playwright/test/cli.js'), 'test', '--config=playwright.legacy-delivery.config.ts'], {
      env: {
        ...process.env,
        LEGACY_DELIVERY_APP_BASE_URL: appBaseUrl,
        LEGACY_DELIVERY_API_BASE_URL: apiBaseUrl,
        LEGACY_DELIVERY_CONTROL_TOKEN: fixture.controlToken,
        LEGACY_DELIVERY_AUTH_STORAGE_KEY: fixture.authStorageKey,
        LEGACY_DELIVERY_OUTPUT_DIR: outputDirectory,
      },
    });
    playwrightPassed = true;
  } finally {
    previewStopped = await stop(preview);
    fixtureClosed = await fixture.close();
  }
  if (!playwrightPassed) throw new Error('LEGACY_DELIVERY_BROWSER_FAILED');
  const evidence = aggregateLegacyDeliveryBrowserEvidence({
    fragments: await Promise.all(LEGACY_DELIVERY_BROWSER_PROJECTS.map(readFragment)),
    startedAt,
    completedAt: new Date().toISOString(),
    cleanup: { database: fixtureClosed, fixtureServer: fixtureClosed, preview: previewStopped },
  });
  evidence.sourceDigests = await Promise.all(LEGACY_DELIVERY_BROWSER_SOURCES.map(async source => ({
    path: source,
    sha256: sha256(canonicalSource(await readFile(path.resolve(source)))),
  })));
  await writeFile(path.join(outputDirectory, 'browser-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log('LEGACY_DELIVERY_BROWSER_ACCEPTANCE_PASS');
};

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
