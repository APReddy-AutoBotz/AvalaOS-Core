import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isolatedEnvironment, stopOwnedChild, verifiedExitCode } from './runLocalControlledBoundaryBrowser.mjs';

test('synthetic runner discards inherited credentials, hosted authority, and remote URLs', () => {
  const child = isolatedEnvironment({
    Path: 'C:\\Windows\\System32',
    VITE_SUPABASE_URL: 'https://real-target.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'sb_secret_do_not_inherit',
    NETLIFY_AUTH_TOKEN: 'do-not-inherit',
    GITHUB_TOKEN: 'do-not-inherit',
    COMMIT_REF: 'real-head',
    DEPLOY_ID: 'real-deploy',
    HTTPS_PROXY: 'remote-proxy',
  });
  assert.equal(child.Path, 'C:\\Windows\\System32');
  assert.equal(child.VITE_SUPABASE_URL, 'https://127.0.0.1:59999');
  assert.equal(child.VITE_SUPABASE_ANON_KEY, 'sb_publishable_synthetic_public_key_264');
  assert.equal(child.VITE_PR_C_CONTROLLED_HUMAN_ENABLED, 'authorized');
  assert.equal(child.LOCAL_CONTROLLED_BOUNDARY_EXECUTION, 'isolated');
  for (const name of ['NETLIFY_AUTH_TOKEN', 'GITHUB_TOKEN', 'HTTPS_PROXY']) {
    assert.equal(Object.hasOwn(child, name), false);
  }
  assert.equal(child.COMMIT_REF, 'a'.repeat(40));
  assert.equal(child.DEPLOY_ID, 'c'.repeat(24));
});

test('signaled or missing Playwright exit cannot report success', () => {
  assert.equal(verifiedExitCode({ code: 0, signal: null }), 0);
  assert.equal(verifiedExitCode({ code: 2, signal: null }), 2);
  assert.throws(() => verifiedExitCode({ code: null, signal: 'SIGTERM' }), /TEST_EXIT_UNCONFIRMED/u);
  assert.throws(() => verifiedExitCode({ code: null, signal: null }), /TEST_EXIT_UNCONFIRMED/u);
});

test('server stop requires observed closure after exact child termination', async () => {
  class SyntheticChild extends EventEmitter {
    exitCode = null;
    signalCode = null;
    signals = [];
    kill(signal) {
      this.signals.push(signal);
      if (signal === 'SIGTERM') {
        this.signalCode = signal;
        this.emit('exit', null, signal);
      }
      return true;
    }
  }
  const confirmed = new SyntheticChild();
  await stopOwnedChild(confirmed, { graceMs: 5, forceMs: 5 });
  assert.deepEqual(confirmed.signals, ['SIGTERM']);

  const unconfirmed = new SyntheticChild();
  unconfirmed.kill = signal => { unconfirmed.signals.push(signal); return true; };
  await assert.rejects(stopOwnedChild(unconfirmed, { graceMs: 5, forceMs: 5 }), /SERVER_CLEANUP_UNCONFIRMED/u);
  assert.deepEqual(unconfirmed.signals, ['SIGTERM', 'SIGKILL']);
});

test('the real-App local spec runs only through its env-isolated config', () => {
  const runner = readFileSync(new URL('./runLocalControlledBoundaryBrowser.mjs', import.meta.url), 'utf8');
  const viteConfig = readFileSync(new URL('../vite.local-controlled-boundary.config.ts', import.meta.url), 'utf8');
  const localConfig = readFileSync(new URL('../playwright.local-controlled-boundary.config.ts', import.meta.url), 'utf8');
  const defaultConfig = readFileSync(new URL('../playwright.config.ts', import.meta.url), 'utf8');
  assert.match(runner, /vite[.]local-controlled-boundary[.]config[.]ts/u);
  assert.match(viteConfig, /createAvalaViteConfig\(\{ syntheticBrowserTestBuild: true \}\)/u);
  assert.match(viteConfig, /envDir: false/u);
  assert.match(localConfig, /testMatch: 'localControlledBoundary[.]spec[.]ts'/u);
  assert.match(defaultConfig, /testIgnore: \[[^\]]*'localControlledBoundary[.]spec[.]ts'/u);
});
