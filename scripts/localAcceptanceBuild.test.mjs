import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { request as httpRequest } from 'node:http';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildLocalAcceptanceFrontend,
  cleanupLocalAcceptanceWorkspace,
  createLocalAcceptanceManifest,
  deriveLocalAcceptanceExerciseDigest,
  LOCAL_ACCEPTANCE_ORIGIN,
  startLocalAcceptanceServer,
  stopLocalAcceptanceServer,
  verifyLocalAcceptanceManifest,
  verifyLocalAcceptanceServer,
} from './localAcceptanceBuild.mjs';

const release = 'a'.repeat(40);
const digest = character => `sha256:${character.repeat(64)}`;
const workspace = async () => mkdtemp(path.join(os.tmpdir(), 'avalaos-local-acceptance-'));

async function siteFixture(t) {
  const root = await workspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  const site = path.join(root, 'site');
  await mkdir(path.join(site, 'assets'), { recursive: true });
  await writeFile(path.join(site, 'index.html'), '<!doctype html><script src="/assets/app.js"></script>');
  await writeFile(path.join(site, 'assets', 'app.js'), 'globalThis.fixture=true;');
  const manifest = await createLocalAcceptanceManifest(site, release);
  await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, site, manifest };
}

test('manifest is sorted, byte-bound and rejects any post-build change', async t => {
  const fixture = await siteFixture(t);
  assert.deepEqual(fixture.manifest.files.map(file => file.path), ['assets/app.js', 'index.html']);
  assert.match(fixture.manifest.buildDigest, /^sha256:[0-9a-f]{64}$/u);
  await verifyLocalAcceptanceManifest({ workspace: fixture.root, expectedReleaseSha: release,
    expectedBuildDigest: fixture.manifest.buildDigest });
  await writeFile(path.join(fixture.site, 'assets', 'app.js'), 'globalThis.fixture=false;');
  await assert.rejects(verifyLocalAcceptanceManifest({ workspace: fixture.root, expectedReleaseSha: release,
    expectedBuildDigest: fixture.manifest.buildDigest }), /MANIFEST_MISMATCH/u);
});

test('exercise digest binds approved input, exact build and exact release', () => {
  const actual = deriveLocalAcceptanceExerciseDigest({ approvedExerciseDigest: digest('1'),
    buildDigest: digest('2'), releaseSha: release });
  assert.match(actual, /^sha256:[0-9a-f]{64}$/u);
  assert.notEqual(actual, deriveLocalAcceptanceExerciseDigest({ approvedExerciseDigest: digest('1'),
    buildDigest: digest('3'), releaseSha: release }));
  assert.throws(() => deriveLocalAcceptanceExerciseDigest({ approvedExerciseDigest: 'bad',
    buildDigest: digest('2'), releaseSha: release }), /EXERCISE_BINDING_REJECTED/u);
});

test('loopback server verifies every response byte, SPA fallback and secure-context browser state', async t => {
  const fixture = await siteFixture(t);
  const server = await startLocalAcceptanceServer({ workspace: fixture.root, releaseSha: release,
    buildDigest: fixture.manifest.buildDigest });
  t.after(() => server.close());
  const browser = {
    newPage: async () => ({
      goto: async url => assert.equal(url, `${LOCAL_ACCEPTANCE_ORIGIN}/sign-in`),
      evaluate: async (_callback, url) => url === undefined
        ? { secureContext: true, subtleCrypto: true, randomUuid: true }
        : assert.equal(url, `${LOCAL_ACCEPTANCE_ORIGIN}/sign-in?view=process_catalog&scope=my_work`),
      reload: async () => {
        const url = `${LOCAL_ACCEPTANCE_ORIGIN}/sign-in?view=process_catalog&scope=my_work`;
        const response = await fetch(url);
        return { status: () => response.status, url: () => response.url,
          body: async () => Buffer.from(await response.arrayBuffer()) };
      },
      close: async () => undefined,
    }),
  };
  const result = await verifyLocalAcceptanceServer({ workspace: fixture.root, releaseSha: release,
    buildDigest: fixture.manifest.buildDigest, launchBrowser: async () => browser });
  assert.equal(result.verified, true);
  assert.equal(result.origin, LOCAL_ACCEPTANCE_ORIGIN);
  assert.equal(result.buildDigest, fixture.manifest.buildDigest);
  assert.equal(result.releaseSha, release);
  assert.equal(result.servedFiles, fixture.manifest.files.length);
  assert.equal(result.manifestVerifiedBefore, true);
  assert.equal(result.manifestVerifiedAfter, true);
  assert.equal(result.secureContext, true);
  assert.equal(result.subtleCrypto, true);
  assert.equal(result.randomUuid, true);
  assert.equal(result.externalNetworkBlocked, true);
  assert.equal(result.headerIdentityUsed, false);
  assert.deepEqual(result.manifest, fixture.manifest);
  const response = await fetch(`${LOCAL_ACCEPTANCE_ORIGIN}/unknown-route`);
  assert.equal(await response.text(), await readFile(path.join(fixture.site, 'index.html'), 'utf8'));
  assert.equal(response.headers.get('x-avalaos-release'), null);
  assert.equal(response.headers.get('x-avalaos-netlify-deploy-id'), null);
});

test('query-bearing reloads serve manifest bytes without changing request authority', async t => {
  const fixture = await siteFixture(t);
  const server = await startLocalAcceptanceServer({ workspace: fixture.root, releaseSha: release,
    buildDigest: fixture.manifest.buildDigest });
  t.after(() => server.close());
  for (const [route, file] of [
    ['/sign-in?view=process_catalog&scope=my_work', 'index.html'],
    ['/sandbox?view=boards&scope=project&scopeId=fixture&scopeName=Example', 'index.html'],
    ['/assets/app.js?v=fixture&path=../../outside', 'assets/app.js'],
  ]) {
    const expected = await readFile(path.join(fixture.site, file));
    const response = await fetch(`${LOCAL_ACCEPTANCE_ORIGIN}${route}`);
    assert.equal(response.status, 200, route);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const head = await fetch(`${LOCAL_ACCEPTANCE_ORIGIN}${route}`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(Number(head.headers.get('content-length')), expected.length);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
  }
  assert.equal((await fetch(`${LOCAL_ACCEPTANCE_ORIGIN}/?view=boards`, { method: 'POST' })).status, 404);
  const foreignHostStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(`${LOCAL_ACCEPTANCE_ORIGIN}/?view=boards`, {
      headers: { host: 'localhost:4173' },
    }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject);
    request.end();
  });
  assert.equal(foreignHostStatus, 404);
  assert.equal((await fetch(`${LOCAL_ACCEPTANCE_ORIGIN}/%ZZ?view=boards`)).status, 404);
  await writeFile(path.join(fixture.site, 'index.html'), 'changed');
  assert.equal((await fetch(`${LOCAL_ACCEPTANCE_ORIGIN}/?view=boards`)).status, 404);
});

test('ordinary pilot build receives only allowlisted public Vite inputs and cleans rejected output', async t => {
  const roots = [];
  t.after(async () => Promise.all(roots.map(root => rm(root, { recursive: true, force: true }))));
  const environment = {
    ...process.env,
    RELEASE_SHA: release,
    GITHUB_SHA: release,
    AUTHENTICATED_ACCEPTANCE_SUPABASE_URL: `https://${'a'.repeat(20)}.supabase.co`,
    AUTHENTICATED_ACCEPTANCE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture_key_1234567890',
    AUTHENTICATED_ACCEPTANCE_DATABASE_URL: 'postgresql://protected-value-that-must-not-be-inherited',
    AUTHENTICATED_ACCEPTANCE_SUPABASE_SERVICE_ROLE_KEY: 'service-role-protected-value',
    VITE_UNAPPROVED_VALUE: 'must-not-be-inherited',
  };
  let checkoutChecks = 0;
  const makeWorkspace = async () => { const root = await workspace(); roots.push(root); return root; };
  const spawnImpl = (_command, args, options) => {
    const child = new EventEmitter();
    assert.equal(options.env.VITE_AVALA_RUNTIME_MODE, 'pilot');
    assert.equal(options.env.AVALAOS_HOSTED_NONPRODUCTION_STABLE_TESTING, 'authorized');
    assert.equal(options.env.SITE_NAME, 'avalaos-pilot');
    assert.equal(options.env.VITE_SUPABASE_URL, environment.AUTHENTICATED_ACCEPTANCE_SUPABASE_URL);
    assert.equal(options.env.VITE_SUPABASE_ANON_KEY, environment.AUTHENTICATED_ACCEPTANCE_SUPABASE_PUBLISHABLE_KEY);
    assert.equal(options.env.AUTHENTICATED_ACCEPTANCE_DATABASE_URL, undefined);
    assert.equal(options.env.AUTHENTICATED_ACCEPTANCE_SUPABASE_SERVICE_ROLE_KEY, undefined);
    assert.equal(options.env.VITE_UNAPPROVED_VALUE, undefined);
    assert.equal(path.basename(args[0]), 'build.mjs');
    assert.equal(path.basename(args[2]), 'empty-env');
    assert.match(readFileSync(args[0], 'utf8'), /envDir: process[.]argv\[3\]/u);
    setImmediate(async () => {
      const output = args[1];
      await mkdir(output, { recursive: true });
      await writeFile(path.join(output, 'index.html'), '<!doctype html>fixture');
      child.emit('exit', 0);
    });
    return child;
  };
  const result = await buildLocalAcceptanceFrontend(environment, {
    verifyCheckout: async () => { checkoutChecks += 1; }, spawnImpl, makeWorkspace,
  });
  assert.equal(checkoutChecks, 2);
  assert.equal(result.origin, LOCAL_ACCEPTANCE_ORIGIN);
  await verifyLocalAcceptanceManifest({ workspace: result.workspace, expectedReleaseSha: release,
    expectedBuildDigest: result.manifest.buildDigest });
  await cleanupLocalAcceptanceWorkspace(result.workspace);
  assert.rejects(readFile(path.join(result.workspace, 'manifest.json')), /ENOENT/u);
});

test('build rejects a protected value embedded in emitted bytes', async t => {
  const roots = [];
  t.after(async () => Promise.all(roots.map(root => rm(root, { recursive: true, force: true }))));
  const secret = 'protected-database-value-1234567890';
  const environment = {
    ...process.env,
    RELEASE_SHA: release,
    GITHUB_SHA: release,
    AUTHENTICATED_ACCEPTANCE_SUPABASE_URL: `https://${'a'.repeat(20)}.supabase.co`,
    AUTHENTICATED_ACCEPTANCE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture_key_1234567890',
    AUTHENTICATED_ACCEPTANCE_DATABASE_URL: secret,
  };
  const makeWorkspace = async () => { const root = await workspace(); roots.push(root); return root; };
  const spawnImpl = (_command, args) => {
    const child = new EventEmitter();
    setImmediate(async () => {
      const output = args[1];
      await mkdir(output, { recursive: true });
      await writeFile(path.join(output, 'index.html'), `<!doctype html>${secret}`);
      child.emit('exit', 0);
    });
    return child;
  };
  await assert.rejects(buildLocalAcceptanceFrontend(environment, { verifyCheckout: async () => undefined,
    spawnImpl, makeWorkspace }), /PROTECTED_VALUE_EMBEDDED/u);
});

test('opaque or service-role JWT values cannot be mislabeled as browser publishable keys', async () => {
  const claims = role => `${Buffer.from('{}').toString('base64url')}.${
    Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  const base = {
    ...process.env,
    RELEASE_SHA: release,
    GITHUB_SHA: release,
    AUTHENTICATED_ACCEPTANCE_SUPABASE_URL: `https://${'a'.repeat(20)}.supabase.co`,
  };
  for (const value of ['opaque-browser-key-value-1234567890', claims('service_role'), claims('authenticated')]) {
    await assert.rejects(buildLocalAcceptanceFrontend({ ...base,
      AUTHENTICATED_ACCEPTANCE_SUPABASE_PUBLISHABLE_KEY: value }, {
      verifyCheckout: async () => undefined,
    }), /PUBLISHABLE_KEY_REJECTED/u);
  }
});

test('cleanup refuses a live owned server marker and stop rejects an unbound mutable pid', async t => {
  const root = await workspace();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'server.json'), `${JSON.stringify({
    schemaVersion: 'local-acceptance-server-state-v1', pid: process.pid, releaseSha: release,
    buildDigest: digest('4'),
  })}\n`);
  await assert.rejects(cleanupLocalAcceptanceWorkspace(root), /ACTIVE_SERVER_REJECTED/u);
  await assert.rejects(stopLocalAcceptanceServer({ workspace: root, releaseSha: release,
    buildDigest: digest('5') }), /SERVER_STATE_REJECTED/u);
});
