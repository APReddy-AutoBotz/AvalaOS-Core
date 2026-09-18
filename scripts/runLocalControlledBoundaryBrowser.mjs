import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA = 'a'.repeat(40);
const DIGEST = `sha256:${'b'.repeat(64)}`;

// No inherited VITE, credential, CI, deployment, or proxy variables enter the
// synthetic Vite process. Its public credential is a deliberately inert string.
export const isolatedEnvironment = (parent = process.env) => {
  const environment = {};
  for (const name of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA']) {
    if (typeof parent[name] === 'string') environment[name] = parent[name];
  }
  return {
    ...environment,
    VITE_AVALA_RUNTIME_MODE: 'pilot',
    VITE_PR_C_CONTROLLED_HUMAN_ENABLED: 'authorized',
    VITE_SUPABASE_URL: 'https://127.0.0.1:59999',
    VITE_SUPABASE_ANON_KEY: 'sb_publishable_synthetic_public_key_264',
    VITE_AI_EDGE_FUNCTIONS_ENABLED: 'false',
    COMMIT_REF: SHA,
    DEPLOY_ID: 'c'.repeat(24),
    DEPLOY_PRIME_URL: 'https://deploy-preview-264--avalaos-pilot.netlify.app',
    PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST: DIGEST,
    PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT: DIGEST,
    VITE_PR_C_CONTROLLED_HUMAN_PUBLIC_TARGET_DIGEST: DIGEST,
    LOCAL_CONTROLLED_BOUNDARY_EXECUTION: 'isolated',
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

const waitForServer = async (url, child) => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500), redirect: 'error' });
      if (response.ok) return;
    } catch { /* bounded local readiness probe only */ }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('LOCAL_CONTROLLED_BOUNDARY_SERVER_UNAVAILABLE');
};

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

export const verifiedExitCode = ({ code, signal }) => {
  if (signal !== null || !Number.isInteger(code) || code < 0) {
    throw new Error('LOCAL_CONTROLLED_BOUNDARY_TEST_EXIT_UNCONFIRMED');
  }
  return code;
};

export const stopOwnedChild = async (child, { graceMs = 5000, forceMs = 5000 } = {}) => {
  if (observedExit(child)) return;
  child.kill('SIGTERM');
  let result = await waitForExit(child, graceMs);
  if (result.signal === 'timeout') {
    child.kill('SIGKILL');
    result = await waitForExit(child, forceMs);
  }
  if (result.signal === 'timeout' || result.signal === 'error') {
    throw new Error('LOCAL_CONTROLLED_BOUNDARY_SERVER_CLEANUP_UNCONFIRMED');
  }
};

export const runLocalControlledBoundaryBrowser = async () => {
  const port = await reservePort();
  const baseURL = `http://127.0.0.1:${port}`;
  const environment = {
    ...isolatedEnvironment(),
    LOCAL_CONTROLLED_BOUNDARY_BASE_URL: baseURL,
    LOCAL_CONTROLLED_BOUNDARY_INVOCATION_ID: randomUUID(),
  };
  const vite = spawn(process.execPath, [
    path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--config', 'vite.local-controlled-boundary.config.ts',
    '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], { cwd: root, env: environment, stdio: 'ignore', windowsHide: true });
  try {
    await waitForServer(baseURL, vite);
    const playwright = spawn(process.execPath, [
      path.join(root, 'node_modules', '@playwright', 'test', 'cli.js'),
      'test', '--config=playwright.local-controlled-boundary.config.ts', '--workers=1',
    ], { cwd: root, env: environment, stdio: 'inherit', windowsHide: true });
    const result = await waitForExit(playwright, 300_000);
    if (result.signal === 'timeout') {
      await stopOwnedChild(playwright);
    }
    const code = verifiedExitCode(result);
    console.log(`Local controlled-boundary browser result: output/playwright/local-controlled-boundary/${environment.LOCAL_CONTROLLED_BOUNDARY_INVOCATION_ID}/results.json`);
    return code;
  } finally {
    await stopOwnedChild(vite);
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await runLocalControlledBoundaryBrowser();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'LOCAL_CONTROLLED_BOUNDARY_FAILURE');
    process.exitCode = 1;
  }
}
