import { execFileSync, spawnSync } from 'node:child_process';

const acceptedMain = '4a324422d7b8180940422e1f602a9aec52415a41';

function fail(code) {
  throw new Error(code);
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

if (process.env.CONTEXT !== 'deploy-preview') {
  fail('CONTROLLER_STABLE_PROMOTION_PREVIEW_CONTEXT_REQUIRED');
}
if (process.env.SITE_NAME !== 'avalaos-pilot') {
  fail('CONTROLLER_STABLE_PROMOTION_SITE_MISMATCH');
}
if (process.env.BRANCH !== 'controller/hosted-pilot-testing-preview') {
  fail('CONTROLLER_STABLE_PROMOTION_BRANCH_MISMATCH');
}
if (!/^[0-9a-f]{40}$/.test(process.env.COMMIT_REF ?? '')) {
  fail('CONTROLLER_STABLE_PROMOTION_RELEASE_REQUIRED');
}

const currentHead = git('rev-parse', 'HEAD');
if (currentHead !== process.env.COMMIT_REF) {
  fail('CONTROLLER_STABLE_PROMOTION_CHECKOUT_MISMATCH');
}

const proxyPath = process.env.AVALAOS_CONTROLLER_NETLIFY_MCP_PROXY_PATH;
if (!proxyPath?.startsWith('https://netlify-mcp.netlify.app/proxy/')) {
  fail('CONTROLLER_STABLE_PROMOTION_PROXY_REQUIRED');
}

// Refresh only the accepted production-like pilot source. The controller branch
// is merely the credential-free transport runner and is never the stable source.
execFileSync('git', ['fetch', 'origin', 'main', '--depth=1'], { stdio: 'inherit' });
const remoteMain = git('rev-parse', 'origin/main');
if (remoteMain !== acceptedMain) {
  fail('CONTROLLER_STABLE_PROMOTION_MAIN_MOVED');
}

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
