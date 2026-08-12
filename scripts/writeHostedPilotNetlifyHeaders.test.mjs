import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const scriptPath = fileURLToPath(new URL('./writeHostedPilotNetlifyHeaders.mjs', import.meta.url));
const release = 'a'.repeat(40);
const exactStableTuple = {
  COMMIT_REF: release,
  CONTEXT: 'production',
  SITE_NAME: 'avalaos-pilot',
  BRANCH: 'main',
  URL: 'https://avalaos-pilot.netlify.app',
  AVALAOS_HOSTED_NONPRODUCTION_STABLE_TESTING: 'authorized',
};

async function runCase(overrides = {}, { base = exactStableTuple } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'avalaos-hosted-pilot-netlify-'));
  const env = { ...process.env, ...base, ...overrides };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd,
    env,
    encoding: 'utf8',
  });
  const headersPath = join(cwd, 'dist', '_headers');
  let headers = null;
  try {
    headers = await readFile(headersPath, 'utf8');
  } catch {
    // Expected for fail-closed cases.
  }
  return {
    ...result,
    cwd,
    headersPath,
    headers,
    cleanup: () => rm(cwd, { recursive: true, force: true }),
  };
}

async function expectAccepted(overrides = {}, options = {}) {
  const result = await runCase(overrides, options);
  try {
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.ok(result.headers, 'accepted build must emit dist/_headers');
    assert.match(result.headers, new RegExp(`X-AvalaOS-Release: ${release}`));
    assert.match(result.headers, /X-AvalaOS-Environment: hosted_nonproduction_pilot/);
  } finally {
    await result.cleanup();
  }
}

async function expectRejected(overrides = {}, options = {}) {
  const result = await runCase(overrides, options);
  try {
    assert.notEqual(result.status, 0, 'malformed release tuple must fail closed');
    await assert.rejects(access(result.headersPath));
    assert.equal(result.headers, null, 'rejected build must not emit _headers');
  } finally {
    await result.cleanup();
  }
}

test('accepts the exact stable hosted-nonproduction tuple', async () => {
  await expectAccepted();
});

test('emits truthful exact release and environment headers', async () => {
  const result = await runCase();
  try {
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(
      result.headers,
      `/*\n  X-AvalaOS-Release: ${release}\n  X-AvalaOS-Environment: hosted_nonproduction_pilot\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  X-Frame-Options: DENY\n`,
    );
  } finally {
    await result.cleanup();
  }
});

test('accepts deploy-preview without stable-site authorization tuple', async () => {
  await expectAccepted(
    {},
    { base: { COMMIT_REF: release, CONTEXT: 'deploy-preview' } },
  );
});

test('accepts branch-deploy without stable-site authorization tuple', async () => {
  await expectAccepted(
    {},
    { base: { COMMIT_REF: release, CONTEXT: 'branch-deploy' } },
  );
});

test('rejects padded COMMIT_REF', async () => {
  await expectRejected({ COMMIT_REF: `${release} ` });
});

test('rejects leading whitespace in COMMIT_REF', async () => {
  await expectRejected({ COMMIT_REF: ` ${release}` });
});

test('rejects malformed short COMMIT_REF', async () => {
  await expectRejected({ COMMIT_REF: 'a'.repeat(39) });
});

test('rejects uppercase COMMIT_REF', async () => {
  await expectRejected({ COMMIT_REF: 'A'.repeat(40) });
});

test('rejects missing COMMIT_REF', async () => {
  await expectRejected({ COMMIT_REF: undefined });
});

test('rejects padded production CONTEXT', async () => {
  await expectRejected({ CONTEXT: 'production ' });
});

test('rejects wrong CONTEXT', async () => {
  await expectRejected({ CONTEXT: 'dev' });
});

test('rejects missing CONTEXT', async () => {
  await expectRejected({ CONTEXT: undefined });
});

test('rejects padded SITE_NAME', async () => {
  await expectRejected({ SITE_NAME: 'avalaos-pilot ' });
});

test('rejects leading whitespace in SITE_NAME', async () => {
  await expectRejected({ SITE_NAME: ' avalaos-pilot' });
});

test('rejects wrong SITE_NAME', async () => {
  await expectRejected({ SITE_NAME: 'avalaos-production' });
});

test('rejects missing SITE_NAME', async () => {
  await expectRejected({ SITE_NAME: undefined });
});

test('rejects padded BRANCH', async () => {
  await expectRejected({ BRANCH: 'main ' });
});

test('rejects wrong BRANCH', async () => {
  await expectRejected({ BRANCH: 'release' });
});

test('rejects missing BRANCH', async () => {
  await expectRejected({ BRANCH: undefined });
});

test('rejects trailing slash URL', async () => {
  await expectRejected({ URL: 'https://avalaos-pilot.netlify.app/' });
});

test('rejects padded URL', async () => {
  await expectRejected({ URL: 'https://avalaos-pilot.netlify.app ' });
});

test('rejects alternate scheme URL', async () => {
  await expectRejected({ URL: 'http://avalaos-pilot.netlify.app' });
});

test('rejects custom production domain URL', async () => {
  await expectRejected({ URL: 'https://avalaos.com' });
});

test('rejects missing URL', async () => {
  await expectRejected({ URL: undefined });
});

test('rejects padded stable-testing authorization', async () => {
  await expectRejected({ AVALAOS_HOSTED_NONPRODUCTION_STABLE_TESTING: 'authorized ' });
});

test('rejects wrong stable-testing authorization', async () => {
  await expectRejected({ AVALAOS_HOSTED_NONPRODUCTION_STABLE_TESTING: 'true' });
});

test('rejects missing stable-testing authorization', async () => {
  await expectRejected({ AVALAOS_HOSTED_NONPRODUCTION_STABLE_TESTING: undefined });
});
