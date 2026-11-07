import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { createEnterpriseLifecycleFixture } from './enterpriseLifecyclePostgresFixture.mjs';

const databaseUrl = process.env.ENTERPRISE_LIFECYCLE_DATABASE_URL;
if (!databaseUrl) throw new Error('ENTERPRISE_LIFECYCLE_DATABASE_URL_REQUIRED');
process.env.CURRENT_ASSESSMENT_DELIVERY_FOCUSED = 'true';

const availablePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') return reject(new Error('CURRENT_ASSESSMENT_BROWSER_PORT_UNAVAILABLE'));
    server.close(error => error ? reject(error) : resolve(address.port));
  });
});
const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: process.cwd(), stdio: 'inherit', windowsHide: true, ...options });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`CURRENT_ASSESSMENT_BROWSER_COMMAND_FAILED:${code}`)));
});
const waitForHttp = async url => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* preview is starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('CURRENT_ASSESSMENT_BROWSER_PREVIEW_UNAVAILABLE');
};

const fixture = await createEnterpriseLifecycleFixture({ databaseUrl, headSha: 'local-working-tree' });
const appPort = await availablePort();
const appBaseUrl = `http://127.0.0.1:${appPort}`;
const outputDirectory = path.join('output', 'current-assessment-delivery-browser');
const buildEnvironment = {
  ...process.env,
  VITE_AVALA_RUNTIME_MODE: 'pilot',
  VITE_SUPABASE_URL: fixture.baseUrl,
  VITE_SUPABASE_ANON_KEY: fixture.publicAnonKey,
  VITE_AI_EDGE_FUNCTIONS_ENABLED: 'false',
};
let preview;
try {
  await mkdir(outputDirectory, { recursive: true });
  if (process.env.CURRENT_ASSESSMENT_DELIVERY_SKIP_BUILD !== 'true') {
    await run(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.enterprise-lifecycle-acceptance.config.ts'], { env: buildEnvironment });
  }
  preview = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), '--config',
    'vite.enterprise-lifecycle-acceptance.config.ts', '--host', '127.0.0.1', '--port', String(appPort)], {
    cwd: process.cwd(), env: buildEnvironment, stdio: 'inherit', windowsHide: true,
  });
  await waitForHttp(appBaseUrl);
  await run(process.execPath, [path.resolve('node_modules/@playwright/test/cli.js'), 'test',
    '--config=playwright.enterprise-lifecycle-acceptance.config.ts', '--project=chromium-desktop',
    '--grep', 'production scoring preserves low-suitability and strong-automation decisions through governed publication'], {
    env: {
      ...process.env,
      ENTERPRISE_LIFECYCLE_APP_BASE_URL: appBaseUrl,
      ENTERPRISE_LIFECYCLE_API_BASE_URL: fixture.baseUrl,
      ENTERPRISE_LIFECYCLE_CONTROL_TOKEN: fixture.controlToken,
      ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY: fixture.authStorageKey,
      ENTERPRISE_LIFECYCLE_OUTPUT_DIR: outputDirectory,
      ENTERPRISE_LIFECYCLE_AUTHENTICATED: 'true',
      CURRENT_ASSESSMENT_DELIVERY_FOCUSED: 'true',
    },
  });
  console.log('Current assessment connected browser: fresh V2 source reached generated Studio output and governed publication without V1 or a pre-seeded project.');
} finally {
  preview?.kill('SIGTERM');
  await fixture.close();
}
