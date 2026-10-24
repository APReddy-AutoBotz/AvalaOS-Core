import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { REQUIRED_PERSONA_CAPABILITIES, FORBIDDEN_PERSONA_CAPABILITIES } from './authenticatedHostedControllerAdapters.mjs';
import { createEnterpriseLifecycleFixture, enterpriseLifecycleSourcePaths } from './enterpriseLifecyclePostgresFixture.mjs';

const root = process.cwd();
const privateRoot = path.resolve(root, 'output/local-private');
const base = path.resolve(process.env.STUDIO_HANDOFF_PERSONA_ATTEMPT ?? '');
if (!process.env.STUDIO_HANDOFF_PERSONA_ATTEMPT || base === privateRoot
  || !base.startsWith(`${privateRoot}${path.sep}`)) {
  throw new Error('STUDIO_HANDOFF_PERSONA_ATTEMPT_REQUIRED');
}
const build = path.join(base, 'build');
const playwrightOutput = path.join(base, 'pw');
await mkdir(base, { recursive: true });
if (await access(build).then(() => true).catch(() => false)
  || await access(playwrightOutput).then(() => true).catch(() => false)) {
  throw new Error('STUDIO_HANDOFF_PERSONA_OWNED_OUTPUT_EXISTS');
}
const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const sourcePaths = [...new Set([
  ...enterpriseLifecycleSourcePaths,
  'scripts/authenticatedHostedControllerAdapters.mjs',
  'scripts/playwright.studio-handoff-persona-contract.config.ts',
  'scripts/reproduceStudioHandoffPersonaContract.mjs',
  'tests/browser/authenticatedLifecycleHarness.ts',
  'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts',
  'tests/browser/enterpriseLifecycleAcceptance/studioHandoffPersonaContract.spec.ts',
  'components/docs/StudioArtifactWorkspace.tsx',
  'services/studioArtifacts/client.ts',
  'supabase/functions/_shared/studioArtifactCommand.ts',
  'supabase/functions/_shared/studioArtifactHandler.ts',
  'supabase/migrations/20260828120000_governed_multisource_studio_pr_b.sql',
])].sort();
const sourceBindings = [];
for (const source of sourcePaths) sourceBindings.push({ source, digest: sha256(await readFile(path.join(root, source))) });
const sourceDigest = sha256(Buffer.from(JSON.stringify(sourceBindings)));
await writeFile(path.join(base, 'source-bindings.json'), `${JSON.stringify({
  schemaVersion: 'studio-handoff-persona-source-bindings-v1',
  releaseSha: process.env.RELEASE_SHA,
  sourceCount: sourceBindings.length,
  sourceDigest,
  sourceBindings,
}, null, 2)}\n`);

const run = (args, env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
  child.on('error', reject);
  child.on('exit', code => resolve(code));
});
const freePort = createServer();
await new Promise(resolve => freePort.listen(0, '127.0.0.1', resolve));
const previewPort = freePort.address().port;
await new Promise(resolve => freePort.close(resolve));

const fixture = await createEnterpriseLifecycleFixture({
  databaseUrl: process.env.ENTERPRISE_LIFECYCLE_DATABASE_URL,
  headSha: process.env.RELEASE_SHA,
  runId: 'local-studio-handoff-persona',
  runAttempt: 1,
  hostedPersonaRoleParity: true,
  providersEnabled: false,
});
const exactRoles = {};
let exactRolesAfterRun = {};
let exactRolesStable = false;
const readExactRoles = async () => {
  const result = {};
  for (const persona of ['author', 'reviewer', 'approver']) {
    const actorId = fixture.ids[persona];
    const capabilities = (await fixture.db.query(`SELECT capability.capability_key
      FROM organization_members member
      JOIN role_capabilities capability ON capability.role_id=member.role_id
      WHERE member.org_id=$1 AND member.user_id=$2 AND member.status='active'
      ORDER BY capability.capability_key`, [fixture.ids.organization, actorId])).rows.map(row => row.capability_key);
    const required = REQUIRED_PERSONA_CAPABILITIES[persona];
    const forbidden = FORBIDDEN_PERSONA_CAPABILITIES[persona];
    result[persona] = {
      actualCount: capabilities.length,
      requiredCount: required.length,
      requiredComplete: required.every(capability => capabilities.includes(capability)),
      forbiddenAbsent: forbidden.every(capability => !capabilities.includes(capability)),
      exact: capabilities.length === required.length
        && required.every(capability => capabilities.includes(capability))
        && forbidden.every(capability => !capabilities.includes(capability)),
    };
  }
  return result;
};
const sanitizedFailureCode = error => {
  const code = error instanceof Error ? error.message : '';
  return new Set([
    'STUDIO_HANDOFF_PERSONA_ROLE_PARITY_REJECTED',
    'STUDIO_HANDOFF_PERSONA_ROLE_PARITY_CHANGED',
    'STUDIO_HANDOFF_PERSONA_BUILD_FAILED',
    'STUDIO_HANDOFF_PERSONA_PREVIEW_NOT_READY',
  ]).has(code) ? code : 'STUDIO_HANDOFF_PERSONA_RUNNER_FAILED';
};
const env = {
  ...process.env,
  VITE_AVALA_RUNTIME_MODE: 'pilot',
  VITE_SUPABASE_URL: fixture.baseUrl,
  VITE_SUPABASE_ANON_KEY: fixture.publicAnonKey,
  VITE_AI_EDGE_FUNCTIONS_ENABLED: 'false',
};
let preview;
let browserExit = null;
let fixtureClosed = false;
let previewExited = false;
let buildRemoved = false;
let playwrightOutputRemoved = false;
let sourceUnchanged = false;
let browserResults = [];
let buildProof = { status: 'not_run' };
let status = 'setup_failed';
let failureCode = null;
try {
  Object.assign(exactRoles, await readExactRoles());
  if (Object.values(exactRoles).some(role => !role.exact)) throw new Error('STUDIO_HANDOFF_PERSONA_ROLE_PARITY_REJECTED');
  if (await run(['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.enterprise-lifecycle-acceptance.config.ts', '--outDir', build], env) !== 0) {
    throw new Error('STUDIO_HANDOFF_PERSONA_BUILD_FAILED');
  }
  const files = [];
  const visit = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else files.push({ path: path.relative(build, absolute).replaceAll('\\', '/'), digest: sha256(await readFile(absolute)) });
    }
  };
  await visit(build);
  files.sort((left, right) => left.path.localeCompare(right.path));
  buildProof = { status: 'passed', fileCount: files.length, digest: sha256(Buffer.from(JSON.stringify(files))) };
  await writeFile(path.join(base, 'build-proof.json'), `${JSON.stringify({
    schemaVersion: 'studio-handoff-persona-build-proof-v1',
    releaseSha: process.env.RELEASE_SHA,
    ...buildProof,
  }, null, 2)}\n`);

  preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--config', 'vite.enterprise-lifecycle-acceptance.config.ts', '--host', '127.0.0.1', '--port', String(previewPort), '--outDir', build], { cwd: root, env, windowsHide: true, stdio: 'ignore' });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { ready = (await fetch(`http://127.0.0.1:${previewPort}`, { signal: AbortSignal.timeout(1_000) })).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('STUDIO_HANDOFF_PERSONA_PREVIEW_NOT_READY');

  browserExit = await run(['node_modules/@playwright/test/cli.js', 'test', '--config=scripts/playwright.studio-handoff-persona-contract.config.ts'], {
    ...env,
    ENTERPRISE_LIFECYCLE_APP_BASE_URL: `http://127.0.0.1:${previewPort}`,
    ENTERPRISE_LIFECYCLE_API_BASE_URL: fixture.baseUrl,
    ENTERPRISE_LIFECYCLE_CONTROL_TOKEN: fixture.controlToken,
    ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY: fixture.authStorageKey,
    ENTERPRISE_LIFECYCLE_AUTHENTICATED: 'true',
    ENTERPRISE_LIFECYCLE_HOSTED_PERSONA_ROLE_PARITY: 'true',
    STUDIO_HANDOFF_PERSONA_RESULT_DIRECTORY: base,
    STUDIO_HANDOFF_PERSONA_PLAYWRIGHT_OUTPUT_DIRECTORY: playwrightOutput,
    AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH: path.join(base, 'browser-failure.json'),
  });
  browserResults = await Promise.all(['desktop-chromium', 'pixel-7-chromium'].map(async project =>
    JSON.parse(await readFile(path.join(base, `browser-${project}.json`), 'utf8'))));
  exactRolesAfterRun = await readExactRoles();
  exactRolesStable = JSON.stringify(exactRolesAfterRun) === JSON.stringify(exactRoles);
  if (!exactRolesStable || Object.values(exactRolesAfterRun).some(role => !role.exact)) {
    throw new Error('STUDIO_HANDOFF_PERSONA_ROLE_PARITY_CHANGED');
  }
  status = browserExit === 0 && browserResults.every(result => result.status === 'passed') ? 'passed' : 'failed';
} catch (error) {
  failureCode = sanitizedFailureCode(error);
  status = 'failed';
} finally {
  if (preview) {
    preview.kill('SIGTERM');
    await Promise.race([new Promise(resolve => preview.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5_000))]);
    previewExited = preview.exitCode !== null || preview.signalCode !== null;
  }
  const providers = {
    calls: fixture.evidence.providerEffects.calls,
    paidCalls: fixture.evidence.providerEffects.paidCalls,
    egressAttempts: fixture.evidence.providerEffects.egressAttempts,
  };
  fixtureClosed = await fixture.close();
  if (path.dirname(build) !== base) throw new Error('STUDIO_HANDOFF_PERSONA_BUILD_PATH_REJECTED');
  await rm(build, { recursive: true, force: true });
  buildRemoved = !(await access(build).then(() => true).catch(() => false));
  if (path.dirname(playwrightOutput) !== base) throw new Error('STUDIO_HANDOFF_PERSONA_PLAYWRIGHT_PATH_REJECTED');
  await rm(playwrightOutput, { recursive: true, force: true });
  playwrightOutputRemoved = !(await access(playwrightOutput).then(() => true).catch(() => false));
  const finalSourceBindings = [];
  for (const source of sourcePaths) finalSourceBindings.push({ source, digest: sha256(await readFile(path.join(root, source))) });
  sourceUnchanged = JSON.stringify(finalSourceBindings) === JSON.stringify(sourceBindings);
  const providersZero = providers.calls === 0 && providers.paidCalls === 0 && providers.egressAttempts === 0;
  const cleanupPassed = fixtureClosed && previewExited && buildRemoved && playwrightOutputRemoved;
  status = status === 'passed' && sourceUnchanged && providersZero && cleanupPassed ? 'passed' : 'failed';
  const result = {
    schemaVersion: 'studio-handoff-persona-result-v1',
    status,
    ...(failureCode ? { failureCode } : {}),
    releaseSha: process.env.RELEASE_SHA,
    exactRoles,
    exactRolesAfterRun,
    exactRolesStable,
    source: { count: sourceBindings.length, digest: sourceDigest, unchangedAfterRun: sourceUnchanged },
    build: buildProof,
    browserExit,
    browsers: browserResults,
    providers,
    cleanup: { fixtureClosed, previewExited, buildRemoved, playwrightOutputRemoved },
    constraints: { actorLimitMs: 15_000, providersEnabled: false, hostedRun: false, fullAcceptance: false, tokenRead: false },
  };
  await writeFile(path.join(base, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status, browserExit, providers, cleanup: result.cleanup })}\n`);
}

if (status !== 'passed') process.exitCode = 1;
