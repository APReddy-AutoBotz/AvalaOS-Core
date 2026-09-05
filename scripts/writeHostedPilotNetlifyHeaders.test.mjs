import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';

const scriptPath = fileURLToPath(new URL('./writeHostedPilotNetlifyHeaders.mjs', import.meta.url));
const viteConfigPath = fileURLToPath(new URL('../vite.config.ts', import.meta.url));
const release = 'a'.repeat(40);
const deployId = 'b'.repeat(24);
const publicOrigin=`https://${'abcdefghijklmnopqrst'}.supabase.co`;
const publicTargetDigest=`sha256:${createHash('sha256').update(`pr-c-controlled-human-public-target\0${publicOrigin}`).digest('hex')}`;
const exactPreviewTuple = {
  COMMIT_REF: release,
  DEPLOY_ID: deployId,
  CONTEXT: 'deploy-preview',
  SITE_NAME: 'avalaos-pilot',
  HEAD: 'controller/governed-delivery-monitor-pr-c-20260831',
  PULL_REQUEST: 'true',
  REVIEW_ID: '264',
  URL: 'https://avalaos-pilot.netlify.app',
  DEPLOY_URL: `https://${deployId}--avalaos-pilot.netlify.app`,
  DEPLOY_PRIME_URL: 'https://deploy-preview-264--avalaos-pilot.netlify.app',
  PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST: `sha256:${'c'.repeat(64)}`,
  PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT: `sha256:${'d'.repeat(64)}`,
  PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST: publicTargetDigest,
  VITE_SUPABASE_URL: publicOrigin,
  VITE_SUPABASE_ANON_KEY: 'sb_publishable_synthetic_public_key_264',
};
const exactStableTuple = {
  COMMIT_REF: release,
  DEPLOY_ID: deployId,
  CONTEXT: 'production',
  SITE_NAME: 'avalaos-pilot',
  BRANCH: 'main',
  HEAD: 'main',
  PULL_REQUEST: undefined,
  REVIEW_ID: undefined,
  URL: 'https://avalaos-pilot.netlify.app',
  DEPLOY_URL: `https://${deployId}--avalaos-pilot.netlify.app`,
  DEPLOY_PRIME_URL: 'https://avalaos-pilot.netlify.app',
  AVALAOS_HOSTED_NONPRODUCTION_STABLE_TESTING: 'authorized',
  PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST: undefined,
  PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT: undefined,
  PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST: undefined,
  VITE_SUPABASE_URL: undefined,
  VITE_SUPABASE_ANON_KEY: undefined,
};

async function runCase(overrides = {}, { base = exactPreviewTuple } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'avalaos-pr-c-controlled-human-netlify-'));
  const inherited = { ...process.env };
  for (const key of Object.keys(inherited)) {
    if (key.startsWith('VITE_') || [
      'OPENAI_API_KEY',
      'GROQ_API_KEY',
      'ANTHROPIC_API_KEY',
      'GEMINI_API_KEY',
      'GOOGLE_API_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_SECRET_KEY',
      'DATABASE_URL',
      'HOSTED_PILOT_DATABASE_URL',
      'AVALAOS_HOSTED_NONPRODUCTION_STABLE_TESTING',
      'BRANCH',
    ].includes(key)) delete inherited[key];
  }
  const env = { ...inherited, ...base, ...overrides };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }
  const result = spawnSync(process.execPath, [scriptPath], { cwd, env, encoding: 'utf8' });
  const headersPath = join(cwd, 'dist', '_headers');
  let headers = null;
  try { headers = await readFile(headersPath, 'utf8'); } catch { /* fail-closed case */ }
  return { ...result, cwd, headersPath, headers, cleanup: () => rm(cwd, { recursive: true, force: true }) };
}

async function expectAccepted(overrides = {}) {
  const result = await runCase(overrides);
  try {
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.headers ?? '', new RegExp(`X-AvalaOS-Release: ${release}`));
    assert.match(result.headers ?? '', /X-AvalaOS-Environment: hosted_nonproduction_pilot/);
    assert.match(result.headers ?? '', new RegExp(`X-AvalaOS-Netlify-Deploy-ID: ${deployId}`));
  } finally { await result.cleanup(); }
}

async function expectRejected(overrides = {}) {
  const result = await runCase(overrides);
  try {
    assert.notEqual(result.status, 0, 'substituted preview tuple must fail closed');
    await assert.rejects(access(result.headersPath));
    assert.equal(result.headers, null);
  } finally { await result.cleanup(); }
}

async function expectOrdinary(overrides = {}) {
  const result = await runCase(overrides);
  try {
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.headers, null, 'ordinary builds must not receive controlled-human headers');
    await assert.rejects(access(result.headersPath));
    assert.match(result.stdout, /Ordinary Netlify build completed without controlled-human mode/);
  } finally { await result.cleanup(); }
}

async function expectStableAccepted(overrides = {}) {
  const result = await runCase(overrides, { base: exactStableTuple });
  try {
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.headers ?? '', new RegExp(`X-AvalaOS-Release: ${release}`));
    assert.match(result.headers ?? '', /X-AvalaOS-Environment: hosted_nonproduction_pilot/);
    assert.doesNotMatch(result.stdout, /Controlled-human response identity headers/);
    assert.match(result.stdout, /authorized stable pilot commit/);
  } finally { await result.cleanup(); }
}

async function expectStableRejected(overrides = {}) {
  const result = await runCase(overrides, { base: exactStableTuple });
  try {
    assert.notEqual(result.status, 0, 'substituted stable pilot tuple must fail closed');
    assert.match(result.stderr, /NETLIFY_HOSTED_PILOT_NONPRODUCTION_CONTEXT_REQUIRED/);
    assert.equal(result.headers, null);
  } finally { await result.cleanup(); }
}

test('accepts only the exact PR #264 controlled-human Deploy Preview tuple', async () => {
  await expectAccepted();
});

test('emits only public-safe exact release and deployment identity headers', async () => {
  const result = await runCase();
  try {
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(
      result.headers,
      `/*\n  X-AvalaOS-Release: ${release}\n  X-AvalaOS-Environment: hosted_nonproduction_pilot\n  X-AvalaOS-Netlify-Deploy-ID: ${deployId}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  X-Frame-Options: DENY\n`,
    );
    assert.doesNotMatch(result.headers ?? '', /fingerprint|exercise|credential|password|key/i);
  } finally { await result.cleanup(); }
});

test('Netlify configuration delegates all contexts to the permanent-safe build router without broad preview activation', async () => {
  const [config,router,viteConfig,internalConfig,runner] = await Promise.all([
    readFile(netlifyConfigPath, 'utf8'),readFile(scriptPath,'utf8'),readFile(viteConfigPath,'utf8'),readFile(syntheticViteConfigPath,'utf8'),readFile(browserRunnerPath,'utf8'),
  ]);
  assert.match(config, /command = "node scripts\/writeHostedPilotNetlifyHeaders\.mjs --build"/);
  assert.doesNotMatch(config, /\[context\.deploy-preview\.environment\]/);
  assert.doesNotMatch(config, /VITE_PR_C_CONTROLLED_HUMAN_ENABLED\s*=/);
  assert.match(config, /fails closed for production context/);
  for(const name of oldBrowserTestEnvironmentNames)assert.match(router,new RegExp(`'${name}'`));
  assert.match(router,/!INTERNAL_BROWSER_TEST_BUILD_ENVIRONMENT[.]has\(key\)/u);
  assert.match(viteConfig,/syntheticBrowserTestBuild = false/u);
  assert.doesNotMatch(viteConfig,/\.some\(name => process[.]env\[name\] === 'true'\)/u);
  for(const name of oldBrowserTestEnvironmentNames)assert.doesNotMatch(viteConfig,new RegExp(`${name}[^\\n]{0,120}syntheticBrowserTestBuild`));
  assert.match(internalConfig,/createAvalaViteConfig\(\{ syntheticBrowserTestBuild: true \}\)/u);
  assert.match(runner,/vite[.]synthetic-browser-test[.]config[.]ts/u);
  assert.doesNotMatch(config,/vite[.]synthetic-browser-test[.]config[.]ts/u);
  assert.doesNotMatch(router,/--config[^\n]*vite[.]synthetic-browser-test/u);
  await expectAccepted(Object.fromEntries(oldBrowserTestEnvironmentNames.map(name=>[name,'true'])));
});

test('preserves the exact authorized stable non-production pilot gate without controlled-human activation', async () => {
  await expectStableAccepted();
});

for (const [label, override] of [
  ['missing stable authorization', { AVALAOS_HOSTED_NONPRODUCTION_STABLE_TESTING: undefined }],
  ['padded stable authorization', { AVALAOS_HOSTED_NONPRODUCTION_STABLE_TESTING: 'authorized ' }],
  ['wrong stable site', { SITE_NAME: 'avalaos-production' }],
  ['wrong stable branch', { BRANCH: 'release' }],
  ['AvalaOS.com production URL', { URL: 'https://avalaos.com' }],
  ['custom production URL', { URL: 'https://test.avalaos.com' }],
]) {
  test(`stable production context rejects ${label}`, async () => {
    await expectStableRejected(override);
  });
}

for (const [label, override] of [
  ['branch deploy', {
    CONTEXT: 'branch-deploy',
    HEAD: 'feature/ordinary-preview',
    PULL_REQUEST: undefined,
    REVIEW_ID: undefined,
    DEPLOY_PRIME_URL: 'https://feature-ordinary-preview--avalaos-pilot.netlify.app',
    PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST: undefined,
    PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT: undefined,
    VITE_PR_C_CONTROLLED_HUMAN_ENABLED: 'authorized',
  }],
  ['another pull request preview', {
    HEAD: 'feature/pr-265',
    REVIEW_ID: '265',
    DEPLOY_PRIME_URL: 'https://deploy-preview-265--avalaos-pilot.netlify.app',
    PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST: undefined,
    PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT: undefined,
    VITE_PR_C_CONTROLLED_HUMAN_ENABLED: 'authorized',
  }],
]) {
  test(`${label} remains an ordinary build with no controlled-human headers`, async () => {
    await expectOrdinary(override);
  });
}

for (const [label, override] of [
  ['candidate identity with production context', { CONTEXT: 'production' }],
  ['candidate identity with branch deploy context', { CONTEXT: 'branch-deploy' }],
  ['wrong site', { SITE_NAME: 'avalaos-production' }],
  ['padded site', { SITE_NAME: 'avalaos-pilot ' }],
  ['wrong PR', { REVIEW_ID: '265', DEPLOY_PRIME_URL: 'https://deploy-preview-265--avalaos-pilot.netlify.app' }],
  ['padded PR', { REVIEW_ID: '264 ' }],
  ['wrong branch', { HEAD: 'main' }],
  ['padded branch', { HEAD: 'controller/governed-delivery-monitor-pr-c-20260831 ' }],
  ['non-PR build', { PULL_REQUEST: 'false' }],
  ['stable hostname', { DEPLOY_PRIME_URL: 'https://avalaos-pilot.netlify.app' }],
  ['custom domain', { DEPLOY_PRIME_URL: 'https://preview.avalaos.com' }],
  ['AvalaOS.com', { URL: 'https://avalaos.com' }],
  ['subdomain of AvalaOS.com', { URL: 'https://test.avalaos.com' }],
  ['alternate scheme', { DEPLOY_PRIME_URL: 'http://deploy-preview-264--avalaos-pilot.netlify.app' }],
  ['trailing-slash preview', { DEPLOY_PRIME_URL: 'https://deploy-preview-264--avalaos-pilot.netlify.app/' }],
  ['wrong immutable deploy URL', { DEPLOY_URL: 'https://wrong--avalaos-pilot.netlify.app' }],
  ['uppercase head SHA', { COMMIT_REF: 'A'.repeat(40) }],
  ['padded head SHA', { COMMIT_REF: `${release} ` }],
  ['uppercase deploy ID', { DEPLOY_ID: 'B'.repeat(24), DEPLOY_URL: `https://${'B'.repeat(24)}--avalaos-pilot.netlify.app` }],
  ['missing exercise binding', { PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST: undefined }],
  ['browser provider key', { VITE_GEMINI_API_KEY: 'not-a-real-key' }],
  ['malformed exercise binding', { PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST: `sha256:${'c'.repeat(63)}` }],
  ['missing backend binding', { PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT: undefined }],
  ['malformed backend binding', { PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT: `sha256:${'D'.repeat(64)}` }],
  ['non-pilot browser runtime', { VITE_AVALA_RUNTIME_MODE: 'production' }],
  ['ambient controlled-human browser activation', { VITE_PR_C_CONTROLLED_HUMAN_ENABLED: 'authorized' }],
  ['non-Supabase public backend URL', { VITE_SUPABASE_URL: 'https://example.com' }],
  ['public backend URL with a path', { VITE_SUPABASE_URL: 'https://synthetic-pr-c.supabase.co/rest/v1' }],
  ['missing public anon key', { VITE_SUPABASE_ANON_KEY: undefined }],
  ['mislabeled Supabase secret key', { VITE_SUPABASE_ANON_KEY: ['sb','_secret_privileged_key_264'].join('') }],
  ['mislabeled legacy service-role JWT', { VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature' }],
  ['mislabeled private key', { VITE_SUPABASE_ANON_KEY: ['-----BEGIN',' PRIVATE KEY-----synthetic'].join('') }],
  ['malformed legacy JWT', { VITE_SUPABASE_ANON_KEY: 'malformed.jwt.value' }],
  ['server provider key', { OPENAI_API_KEY: 'not-a-real-key' }],
  ['service role credential', { SUPABASE_SERVICE_ROLE_KEY: 'not-a-real-key' }],
  ['database credential', { DATABASE_URL: 'postgres://synthetic.invalid/db' }],
]) {
  test(`rejects ${label}`, async () => { await expectRejected(override); });
}

for (const key of [
  'COMMIT_REF',
  'DEPLOY_ID',
  'CONTEXT',
  'SITE_NAME',
  'HEAD',
  'PULL_REQUEST',
  'REVIEW_ID',
  'URL',
  'DEPLOY_URL',
  'DEPLOY_PRIME_URL',
  'VITE_SUPABASE_URL',
]) {
  test(`rejects missing ${key}`, async () => { await expectRejected({ [key]: undefined }); });
}

const netlifyConfigPath = fileURLToPath(new URL('../netlify.toml', import.meta.url));
const syntheticViteConfigPath = fileURLToPath(new URL('../vite.synthetic-browser-test.config.ts', import.meta.url));
const browserRunnerPath = fileURLToPath(new URL('./runTranscriptFlowBrowser.mjs', import.meta.url));
const oldBrowserTestEnvironmentNames = [
  'DELIVERY_MONITOR_PR_C_BROWSER_TEST_BUILD',
  'ENTERPRISE_INTELLIGENCE_BROWSER_TEST_BUILD',
  'STUDIO_ARTIFACT_BROWSER_TEST_BUILD',
  'PILOT_OPERATIONS_BROWSER_TEST_BUILD',
  'PR1A_BROWSER_TEST_BUILD',
  'STUDIO_PRIVATE_ARTIFACT_BROWSER_TEST_BUILD',
];
