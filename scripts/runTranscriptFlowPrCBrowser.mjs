import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const root = process.cwd();
const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
const browserEnvironment = {
  ...process.env,
  VITE_AVALA_RUNTIME_MODE: 'pilot',
  VITE_SUPABASE_URL: 'https://127.0.0.1:59999',
  VITE_SUPABASE_ANON_KEY: 'browser-test-placeholder',
  VITE_AI_EDGE_FUNCTIONS_ENABLED: 'false',
};
const server = spawn(process.execPath, ['tests/browser/deliveryMonitorPrC/server.mjs'], { cwd: root, env: browserEnvironment, stdio: 'inherit', windowsHide: true });
const deadline = Date.now() + 120_000;
while (true) {
  try {
    const harnessResponse = await fetch('http://127.0.0.1:4198/tests/browser/deliveryMonitorPrC/harness.html');
    const moduleResponse = harnessResponse.ok
      ? await fetch('http://127.0.0.1:4198/tests/browser/deliveryMonitorPrC/harness.tsx')
      : null;
    if (harnessResponse.ok && moduleResponse?.ok) break;
  } catch {
    if (server.exitCode !== null) throw new Error(`PR C synthetic browser server exited with ${server.exitCode}.`);
  }
  if (Date.now() >= deadline) throw new Error('PR C synthetic browser server did not become ready within 120 seconds.');
  await new Promise(resolve => setTimeout(resolve, 100));
}

const result = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [cli, 'test', '--config=playwright.delivery-monitor-pr-c.config.ts', ...process.argv.slice(2)], {
    cwd: root, env: process.env, stdio: 'inherit', windowsHide: true,
  });
  child.once('error', reject);
  child.once('exit', (status, signal) => resolve({ status, signal }));
});

try { await fetch('http://127.0.0.1:4198/__delivery_monitor_pr_c_shutdown', { method: 'POST' }); } catch { /* already stopped */ }
server.kill('SIGTERM');

process.exitCode = result.status ?? (result.signal ? 1 : 0);
