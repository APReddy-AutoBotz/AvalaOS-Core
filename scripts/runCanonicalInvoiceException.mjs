import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PROJECTION_POSTGRES_IMAGE, PROJECTION_POSTGREST_IMAGE } from './projectionRpcPostgrestContract.mjs';

// Reuse the existing production-UI/native-PostgREST fixture and controller.
// This entry point neither starts hosted acceptance nor writes acceptance catalog rows.
const root = process.cwd();
const project = process.argv[2] ?? 'desktop-chromium';
assert.ok(['desktop-chromium', 'pixel-7-chromium'].includes(project), 'CANONICAL_PROJECT_REJECTED');
const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const git = (...args) => execFileSync('git', ['-c', 'core.fsmonitor=false', ...args], { encoding: 'utf8', windowsHide: true }).trim();
const sources = async () => {
  const names = git('ls-files', '--cached', '--others', '--exclude-standard').split('\n')
    .filter(name => /^(scripts\/|services\/|components\/|config\/|constants\/|data\/|public\/|supabase\/(functions|migrations)\/|tests\/|testing\/process-lifecycle\/contracts\/|\.github\/workflows\/|[^/]+\.(?:tsx?|m?js|json|css|html)$)/u.test(name));
  return Promise.all([...new Set(names)].sort().map(async name => ({ path: name, sha256: digest(await readFile(name)) })));
};
const output = path.resolve('output/local-private/primary-lifecycle-timeout-local',
  `canonical-${project}-${new Date().toISOString().replace(/[:.]/gu, '-')}`);
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output, { recursive: false });
const before = await sources();
const head = git('rev-parse', 'HEAD');
const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|APPDATA|LOCALAPPDATA|USERPROFILE|COMSPEC|PATHEXT|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|NUMBER_OF_PROCESSORS)$/iu.test(name)));
Object.assign(environment, {
  ENTERPRISE_LIFECYCLE_CANONICAL_AP_INVOICE_EXCEPTION: '1',
  CANONICAL_AP_BROWSER_PROJECT: project,
  AUTHENTICATED_PRIMARY_LOCAL_PROOF_DIRECTORY: output,
  RELEASE_SHA: head,
});
if (process.env.PLAYWRIGHT_BROWSERS_PATH) environment.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH;
else if (existsSync('.agent/playwright-browsers')) environment.PLAYWRIGHT_BROWSERS_PATH = path.resolve('.agent/playwright-browsers');
let exitCode = null;
let errorCode = null;
try {
  // The native runner deliberately uses --pull=never. Populate only its two
  // digest-pinned public images when a clean checkout has no local cache.
  for (const image of [PROJECTION_POSTGRES_IMAGE, PROJECTION_POSTGREST_IMAGE]) {
    try { execFileSync('docker', ['image', 'inspect', image], { stdio: 'ignore', windowsHide: true }); }
    catch { execFileSync('docker', ['pull', image], { stdio: 'inherit', windowsHide: true }); }
  }
  exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/testAssessV2NativePostgrest.mjs'], {
      cwd: root, env: environment, stdio: 'inherit', windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(signal ? null : code));
  });
} catch { errorCode = 'CANONICAL_CHILD_UNAVAILABLE'; }
const after = await sources();
const unchanged = digest(JSON.stringify(before)) === digest(JSON.stringify(after));
const result = await readFile(path.join(output, 'result.json'), 'utf8').then(JSON.parse).catch(() => null);
const cleanup = await readFile(path.join(output, 'cleanup.json'), 'utf8').then(JSON.parse).catch(() => null);
const artifacts = [];
for (const relative of result?.canonical?.outputs ?? []) {
  const resolved = path.resolve(output, relative);
  assert.ok(typeof relative === 'string' && resolved.startsWith(`${output}${path.sep}`), 'CANONICAL_ARTIFACT_PATH_REJECTED');
  artifacts.push({ path: relative, sha256: digest(await readFile(resolved)) });
}
const passed = exitCode === 0 && unchanged && result?.status === 'passed'
  && cleanup && ['preview', 'fixture', 'containers', 'network'].every(key => cleanup[key] === true)
  && artifacts.length > 0;
const manifest = {
  schemaVersion: 'canonical-ap-invoice-exception-review-v1', status: passed ? 'passed' : 'failed',
  head, project, sourceDigest: digest(JSON.stringify(before)), sourceFiles: before,
  sourcesUnchangedDuringExecution: unchanged, exitCode, errorCode, cleanup, artifacts,
  proofBoundary: {
    application: 'production UI and application handlers', database: 'disposable PostgreSQL 16 and native PostgREST',
    authentication: 'synthetic disposable Supabase-compatible sessions', providerOutput: 'synthetic; providers OFF',
    actorBoundaryMs: 15000, hostedAcceptance: 'not_run', deployment: 'not_run', completeProductAcceptance: 'not_run',
  },
};
await writeFile(path.join(output, 'review-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ status: manifest.status, output: path.relative(root, output), project, exitCode, cleanup }));
process.exitCode = passed ? 0 : 1;
