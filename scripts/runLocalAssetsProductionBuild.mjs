import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildRoot = 'output/local-private/authenticated-product-acceptance/local-assets-production-build';
const forbiddenDotEnvFiles = ['.env', '.env.local', '.env.production', '.env.production.local'];

// Do not let developer or CI credentials and VITE values enter this proof.
export const isolatedLocalAssetsEnvironment = (parent = process.env) => {
  const environment = {};
  for (const name of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'PLAYWRIGHT_BROWSERS_PATH']) {
    if (typeof parent[name] === 'string') environment[name] = parent[name];
  }
  return {
    ...environment,
    ...(existsSync(path.join(root, '.agent', 'playwright-browsers'))
      ? { PLAYWRIGHT_BROWSERS_PATH: path.join(root, '.agent', 'playwright-browsers') }
      : {}),
    VITE_AVALA_RUNTIME_MODE: 'local_demo',
    VITE_AI_EDGE_FUNCTIONS_ENABLED: 'false',
    LOCAL_ASSETS_EXECUTION: 'isolated-production-build',
  };
};

const reservePort = async () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    const port = typeof address === 'object' && address ? address.port : null;
    probe.close(error => error ? reject(error) : resolve(port));
  });
});

const observedExit = child => child.exitCode !== null || child.signalCode !== null;
const waitForExit = (child, timeoutMs) => new Promise(resolve => {
  if (observedExit(child)) return resolve({ code: child.exitCode, signal: child.signalCode });
  const complete = (code, signal) => {
    clearTimeout(timer);
    child.off('exit', onExit);
    child.off('error', onError);
    resolve({ code, signal });
  };
  const onExit = (code, signal) => complete(code, signal);
  const onError = () => complete(null, 'error');
  const timer = setTimeout(() => complete(null, 'timeout'), timeoutMs);
  child.once('exit', onExit);
  child.once('error', onError);
});

const confirmedExitCode = ({ code, signal }, failure) => {
  if (signal !== null || !Number.isInteger(code) || code < 0) throw new Error(failure);
  return code;
};

export const stopLocalAssetsChild = async (child, timeoutMs = 5_000) => {
  if (observedExit(child)) return;
  child.kill('SIGTERM');
  let result = await waitForExit(child, timeoutMs);
  if (result.signal === 'timeout') {
    child.kill('SIGKILL');
    result = await waitForExit(child, timeoutMs);
  }
  if (result.signal === 'timeout' || result.signal === 'error') throw new Error('LOCAL_ASSETS_CHILD_CLEANUP_UNCONFIRMED');
};

const waitForServer = async (url, child) => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !observedExit(child)) {
    try {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(1_500) });
      if (response.ok) return;
    } catch { /* loopback readiness only */ }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('LOCAL_ASSETS_PREVIEW_UNAVAILABLE');
};

const runChild = async (args, options, timeoutMs, failure) => {
  const child = spawn(process.execPath, args, options);
  const result = await waitForExit(child, timeoutMs);
  if (result.signal === 'timeout') await stopLocalAssetsChild(child);
  return confirmedExitCode(result, failure);
};

export const runLocalAssetsProductionBuild = async () => {
  const presentDotEnvFiles = forbiddenDotEnvFiles.filter(file => existsSync(path.join(root, file)));
  if (presentDotEnvFiles.length) {
    throw new Error(`LOCAL_ASSETS_DOTENV_FILES_FORBIDDEN:${presentDotEnvFiles.join(',')}`);
  }
  const invocationId = randomUUID();
  const outDir = `${buildRoot}/${invocationId}`;
  const environment = isolatedLocalAssetsEnvironment();
  const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const playwrightCli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');
  const buildCode = await runChild(
    [viteCli, 'build', '--outDir', outDir],
    { cwd: root, env: environment, stdio: 'inherit', windowsHide: true },
    300_000,
    'LOCAL_ASSETS_BUILD_EXIT_UNCONFIRMED',
  );
  if (buildCode !== 0) return buildCode;

  const port = await reservePort();
  const baseURL = `http://127.0.0.1:${port}`;
  const browserEnvironment = {
    ...environment,
    LOCAL_ASSETS_BASE_URL: baseURL,
    LOCAL_ASSETS_INVOCATION_ID: invocationId,
  };
  const preview = spawn(process.execPath, [
    viteCli, 'preview', '--outDir', outDir,
    '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], { cwd: root, env: browserEnvironment, stdio: 'ignore', windowsHide: true });
  try {
    await waitForServer(baseURL, preview);
    const browserCode = await runChild(
      [playwrightCli, 'test', '--config=playwright.local-assets.config.ts', '--workers=1'],
      { cwd: root, env: browserEnvironment, stdio: 'inherit', windowsHide: true },
      300_000,
      'LOCAL_ASSETS_BROWSER_EXIT_UNCONFIRMED',
    );
    console.log(`Local assets browser result: output/playwright/local-assets/${invocationId}/results.json`);
    return browserCode;
  } finally {
    await stopLocalAssetsChild(preview);
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await runLocalAssetsProductionBuild();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'LOCAL_ASSETS_PRODUCTION_BUILD_FAILURE');
    process.exitCode = 1;
  }
}
