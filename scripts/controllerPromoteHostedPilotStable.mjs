import { execFileSync, spawnSync } from 'node:child_process';

const acceptedMain = '4a324422d7b8180940422e1f602a9aec52415a41';
const allowedPreviewFiles = new Set([
  'docs/operations/hosted-pilot-testing-preview.md',
  'netlify.toml',
  'scripts/controllerPromoteHostedPilotStable.mjs',
]);

function fail(code) {
  throw new Error(code);
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

if (process.env.AVALAOS_CONTROLLER_STABLE_PROMOTION !== 'authorized') {
  fail('CONTROLLER_STABLE_PROMOTION_NOT_AUTHORIZED');
}
if (process.env.CONTEXT !== 'deploy-preview') {
  fail('CONTROLLER_STABLE_PROMOTION_PREVIEW_CONTEXT_REQUIRED');
}
if (process.env.SITE_NAME !== 'avalaos-pilot') {
  fail('CONTROLLER_STABLE_PROMOTION_SITE_MISMATCH');
}
if (process.env.REVIEW_ID !== '230') {
  fail('CONTROLLER_STABLE_PROMOTION_REVIEW_MISMATCH');
}
if (process.env.DEPLOY_PRIME_URL !== 'https://deploy-preview-230--avalaos-pilot.netlify.app') {
  fail('CONTROLLER_STABLE_PROMOTION_ORIGIN_MISMATCH');
}
if (!/^[0-9a-f]{40}$/.test(process.env.COMMIT_REF ?? '')) {
  fail('CONTROLLER_STABLE_PROMOTION_RELEASE_REQUIRED');
}

const currentHead = git('rev-parse', 'HEAD');
if (currentHead !== process.env.COMMIT_REF) {
  fail('CONTROLLER_STABLE_PROMOTION_CHECKOUT_MISMATCH');
}

execFileSync('git', ['fetch', 'origin', 'main', '--depth=1'], { stdio: 'inherit' });
const remoteMain = git('rev-parse', 'origin/main');
if (remoteMain !== acceptedMain) {
  fail('CONTROLLER_STABLE_PROMOTION_MAIN_MOVED');
}
const mergeBase = git('merge-base', currentHead, remoteMain);
if (mergeBase !== acceptedMain) {
  fail('CONTROLLER_STABLE_PROMOTION_BASE_MISMATCH');
}

const changedFiles = git('diff', '--name-only', `${acceptedMain}..${currentHead}`)
  .split('\n')
  .filter(Boolean);
if (changedFiles.length === 0 || changedFiles.some((file) => !allowedPreviewFiles.has(file))) {
  fail('CONTROLLER_STABLE_PROMOTION_SCOPE_MISMATCH');
}

const proxyPath = process.env.AVALAOS_CONTROLLER_NETLIFY_MCP_PROXY_PATH;
if (!proxyPath?.startsWith('https://netlify-mcp.netlify.app/proxy/')) {
  fail('CONTROLLER_STABLE_PROMOTION_PROXY_REQUIRED');
}

// The preview is only a trusted transport runner. Publish the accepted main tree,
// never the controller-only preview files.
execFileSync('git', ['checkout', '-B', 'main', acceptedMain], { stdio: 'inherit' });
if (git('rev-parse', 'HEAD') !== acceptedMain) {
  fail('CONTROLLER_STABLE_PROMOTION_MAIN_CHECKOUT_FAILED');
}

const result = spawnSync(
  'npx',
  [
    '-y',
    '@netlify/mcp@latest',
    '--site-id',
    'ecd4ce28-d46a-45b8-88ab-d7e3a8ec2b8f',
    '--proxy-path',
    proxyPath,
  ],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 12 * 60 * 1000,
    maxBuffer: 16 * 1024 * 1024,
  },
);

const redact = (value) => String(value ?? '').split(proxyPath).join('[REDACTED_NETLIFY_PROXY]');
if (result.stdout) process.stdout.write(redact(result.stdout));
if (result.stderr) process.stderr.write(redact(result.stderr));
if (result.error) throw result.error;
if (result.status !== 0) fail(`CONTROLLER_STABLE_PROMOTION_DEPLOY_FAILED_${result.status}`);

console.log(`Hosted pilot stable deployment transport completed for accepted main ${acceptedMain}.`);
