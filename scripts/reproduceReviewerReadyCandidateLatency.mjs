import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { REQUIRED_PERSONA_CAPABILITIES, FORBIDDEN_PERSONA_CAPABILITIES } from './authenticatedHostedControllerAdapters.mjs';
import { createEnterpriseLifecycleFixture, enterpriseLifecycleSourcePaths } from './enterpriseLifecyclePostgresFixture.mjs';

const root = process.cwd();
const privateRoot = path.resolve(root, 'output/local-private');
const mode = process.env.REVIEWER_READY_MODE === 'after' ? 'after' : 'before';
const attemptPath = mode === 'after' ? process.env.REVIEWER_READY_AFTER_ATTEMPT : process.env.REVIEWER_READY_ATTEMPT;
const base = path.resolve(attemptPath ?? '');
if (!attemptPath || base === privateRoot || !base.startsWith(`${privateRoot}${path.sep}`)) {
  throw new Error('REVIEWER_READY_ATTEMPT_REQUIRED');
}
const build = path.join(base, 'build');
const playwrightOutput = path.join(base, 'pw');
await mkdir(base, { recursive: true });
if (await access(build).then(() => true).catch(() => false)
  || await access(playwrightOutput).then(() => true).catch(() => false)) {
  throw new Error('REVIEWER_READY_OWNED_OUTPUT_EXISTS');
}
const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const sourcePaths = [...new Set([
  ...enterpriseLifecycleSourcePaths,
  'components/assess-v2/AssessV2ReviewWorkspace.tsx',
  'components/assess-v2/AssessV2ReviewWorkspace.test.ts',
  'scripts/authenticatedHostedControllerAdapters.mjs',
  'scripts/playwright.reviewer-ready-candidate-latency.config.ts',
  'scripts/playwright.reviewer-ready-projection-loading-after.config.ts',
  'scripts/reproduceReviewerReadyCandidateLatency.mjs',
  'tests/browser/authenticatedLifecycleHarness.ts',
  'tests/browser/enterpriseLifecycleAcceptance/reviewerReadyCandidateLatency.spec.ts',
  'tests/browser/enterpriseLifecycleAcceptance/reviewerReadyProjectionLoadingAfter.spec.ts',
])].sort();
const sourceBindings = [];
for (const source of sourcePaths) sourceBindings.push({ source, digest: sha256(await readFile(path.join(root, source))) });
const sourceDigest = sha256(Buffer.from(JSON.stringify(sourceBindings)));
await writeFile(path.join(base, 'source-bindings.json'), `${JSON.stringify({
  schemaVersion: 'reviewer-ready-candidate-latency-source-bindings-v1',
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
const portServer = createServer();
await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
const previewPort = portServer.address().port;
await new Promise(resolve => portServer.close(resolve));

const fixture = await createEnterpriseLifecycleFixture({
  databaseUrl: process.env.ENTERPRISE_LIFECYCLE_DATABASE_URL,
  headSha: process.env.RELEASE_SHA,
  runId: 'local-reviewer-ready-candidate-latency',
  runAttempt: 1,
  hostedPersonaRoleParity: true,
  providersEnabled: false,
});
const readExactRoles = async () => {
  const result = {};
  for (const persona of ['author', 'reviewer', 'approver']) {
    const capabilities = (await fixture.db.query(`SELECT capability.capability_key
      FROM organization_members member
      JOIN role_capabilities capability ON capability.role_id=member.role_id
      WHERE member.org_id=$1 AND member.user_id=$2 AND member.status='active'
      ORDER BY capability.capability_key`, [fixture.ids.organization, fixture.ids[persona]])).rows.map(row => row.capability_key);
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
let exactRoles = {};
let exactRolesAfterRun = {};
let exactRolesStable = false;
let browserResults = [];
let buildProof = { status: 'not_run' };
let status = 'setup_failed';
let failureCode = null;
try {
  exactRoles = await readExactRoles();
  if (Object.values(exactRoles).some(role => !role.exact)
    || exactRoles.author.actualCount !== 28 || exactRoles.reviewer.actualCount !== 16 || exactRoles.approver.actualCount !== 22) {
    throw new Error('REVIEWER_READY_ROLE_PARITY_REJECTED');
  }
  if (await run(['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.enterprise-lifecycle-acceptance.config.ts', '--outDir', build], env) !== 0) {
    throw new Error('REVIEWER_READY_BUILD_FAILED');
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
    schemaVersion: 'reviewer-ready-candidate-latency-build-proof-v1',
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
  if (!ready) throw new Error('REVIEWER_READY_PREVIEW_NOT_READY');

  const browserConfig = mode === 'after'
    ? 'scripts/playwright.reviewer-ready-projection-loading-after.config.ts'
    : 'scripts/playwright.reviewer-ready-candidate-latency.config.ts';
  browserExit = await run(['node_modules/@playwright/test/cli.js', 'test', `--config=${browserConfig}`], {
    ...env,
    ENTERPRISE_LIFECYCLE_APP_BASE_URL: `http://127.0.0.1:${previewPort}`,
    ENTERPRISE_LIFECYCLE_API_BASE_URL: fixture.baseUrl,
    ENTERPRISE_LIFECYCLE_CONTROL_TOKEN: fixture.controlToken,
    ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY: fixture.authStorageKey,
    ENTERPRISE_LIFECYCLE_AUTHENTICATED: 'true',
    ENTERPRISE_LIFECYCLE_HOSTED_PERSONA_ROLE_PARITY: 'true',
    REVIEWER_READY_RESULT_DIRECTORY: base,
    REVIEWER_READY_PLAYWRIGHT_OUTPUT_DIRECTORY: playwrightOutput,
    REVIEWER_READY_AFTER_RESULT_DIRECTORY: base,
    REVIEWER_READY_AFTER_PLAYWRIGHT_OUTPUT_DIRECTORY: playwrightOutput,
    AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH: path.join(base, 'browser-failure.json'),
  });
  const browserFiles = mode === 'after'
    ? ['after-browser-desktop-chromium.json', 'after-commands-desktop-chromium.json',
      'after-browser-pixel-7-chromium.json', 'after-commands-pixel-7-chromium.json']
    : ['before-browser-desktop-chromium.json'];
  browserResults = await Promise.all(browserFiles.map(async file => JSON.parse(await readFile(path.join(base, file), 'utf8'))));
  exactRolesAfterRun = await readExactRoles();
  exactRolesStable = JSON.stringify(exactRolesAfterRun) === JSON.stringify(exactRoles);
  if (!exactRolesStable || Object.values(exactRolesAfterRun).some(role => !role.exact)) {
    throw new Error('REVIEWER_READY_ROLE_PARITY_CHANGED');
  }
  const expectedBrowserStatus = mode === 'after' ? 'passed' : 'reproduced';
  status = browserExit === 0 && browserResults.every(result => result.status === expectedBrowserStatus)
    ? expectedBrowserStatus : 'failed';
} catch (error) {
  const code = error instanceof Error ? error.message : '';
  failureCode = new Set([
    'REVIEWER_READY_ROLE_PARITY_REJECTED',
    'REVIEWER_READY_ROLE_PARITY_CHANGED',
    'REVIEWER_READY_BUILD_FAILED',
    'REVIEWER_READY_PREVIEW_NOT_READY',
  ]).has(code) ? code : 'REVIEWER_READY_RUNNER_FAILED';
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
  if (path.dirname(build) !== base) throw new Error('REVIEWER_READY_BUILD_PATH_REJECTED');
  await rm(build, { recursive: true, force: true });
  buildRemoved = !(await access(build).then(() => true).catch(() => false));
  if (path.dirname(playwrightOutput) !== base) throw new Error('REVIEWER_READY_PLAYWRIGHT_PATH_REJECTED');
  await rm(playwrightOutput, { recursive: true, force: true });
  playwrightOutputRemoved = !(await access(playwrightOutput).then(() => true).catch(() => false));
  const finalSourceBindings = [];
  for (const source of sourcePaths) finalSourceBindings.push({ source, digest: sha256(await readFile(path.join(root, source))) });
  sourceUnchanged = JSON.stringify(finalSourceBindings) === JSON.stringify(sourceBindings);
  const providersZero = providers.calls === 0 && providers.paidCalls === 0 && providers.egressAttempts === 0;
  const cleanupPassed = fixtureClosed && previewExited && buildRemoved && playwrightOutputRemoved;
  const expectedStatus = mode === 'after' ? 'passed' : 'reproduced';
  status = status === expectedStatus && sourceUnchanged && providersZero && cleanupPassed ? expectedStatus : 'failed';
  const result = {
    schemaVersion: mode === 'after'
      ? 'reviewer-ready-projection-loading-after-result-v1'
      : 'reviewer-ready-candidate-latency-before-result-v1',
    status,
    ...(failureCode ? { failureCode } : {}),
    releaseSha: process.env.RELEASE_SHA,
    exactRoles,
    exactRolesAfterRun,
    exactRolesStable,
    source: { count: sourceBindings.length, digest: sourceDigest, unchangedAfterRun: sourceUnchanged },
    build: buildProof,
    browserExit,
    mode,
    browsers: browserResults,
    providers,
    cleanup: { fixtureClosed, previewExited, buildRemoved, playwrightOutputRemoved },
    constraints: { actorLimitMs: 15_000, providersEnabled: false, hostedRun: false, fullAcceptance: false, tokenRead: false },
  };
  await writeFile(path.join(base, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status, browserExit, providers, cleanup: result.cleanup })}\n`);
}

if (status !== (mode === 'after' ? 'passed' : 'reproduced')) process.exitCode = 1;
