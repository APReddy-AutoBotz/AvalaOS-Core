import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
  assertBrowserPortAvailable,
  browserModeByFlag,
  createCappedOutputCapture,
  createOwnedListeningState,
  defaultBrowserMode,
  runBrowserHarness,
} from './runTranscriptFlowBrowser.mjs';

class FakeChild extends EventEmitter {
  constructor({ pid = 71_001 } = {}) {
    super();
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.exitCode = null;
    this.signalCode = null;
    this.pid = pid;
    this.wasKilled = false;
  }

  kill() {
    this.wasKilled = true;
    this.signalCode = 'SIGTERM';
    queueMicrotask(() => this.emit('close', null, 'SIGTERM'));
    return true;
  }
}

const testMode = {
  label: 'Lifecycle test',
  port: '65534',
  config: 'unused.config.ts',
  readinessPath: '/never-ready',
  serverCommand: 'serve',
};

const connectionRefusedError = () => Object.assign(new TypeError('fetch failed'), {
  cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
});

test('port preflight accepts an exact free loopback bind and releases it', async () => {
  const state = { options: null, closed: false };
  class FreePortProbe extends EventEmitter {
    listen(options) {
      state.options = options;
      queueMicrotask(() => this.emit('listening'));
    }

    close(callback) {
      state.closed = true;
      queueMicrotask(() => callback());
    }
  }

  await assertBrowserPortAvailable({
    host: '127.0.0.1',
    port: '4193',
    label: 'Free-port test',
    createServerImpl: () => new FreePortProbe(),
  });

  assert.deepEqual(state.options, { host: '127.0.0.1', port: 4193, exclusive: true });
  assert.equal(state.closed, true);
});

test('native port preflight does not misclassify a free loopback port', async () => {
  const allocator = http.createServer();
  allocator.listen(0, '127.0.0.1');
  await once(allocator, 'listening');
  const address = allocator.address();
  assert.ok(address && typeof address === 'object');
  const freePort = address.port;
  await new Promise((resolve, reject) => allocator.close(error => error ? reject(error) : resolve()));

  await assertBrowserPortAvailable({ host: '127.0.0.1', port: String(freePort), label: 'Native free-port test' });

  const successor = http.createServer();
  successor.listen(freePort, '127.0.0.1');
  await once(successor, 'listening');
  await new Promise((resolve, reject) => successor.close(error => error ? reject(error) : resolve()));
});

test('live server child that never listens emits bounded diagnostics and is stopped', async () => {
  const child = new FakeChild();
  const spawnImpl = () => {
    queueMicrotask(() => {
      child.stdout.write('\u001b[31mserver boot output\u001b[0m\n');
      child.stderr.write(`diagnostic-${'x'.repeat(8_000)}`);
    });
    return child;
  };

  await assert.rejects(
    runBrowserHarness({
      mode: testMode,
      spawnImpl,
      fetchImpl: async () => { throw connectionRefusedError(); },
      readinessTimeoutMs: 15,
      readinessRequestTimeoutMs: 5,
      readinessPollIntervalMs: 1,
      portPreflightImpl: async () => {},
    }),
    error => {
      assert.match(error.message, /phase: server readiness timeout/);
      assert.match(error.message, /last readiness observation: connection refused/);
      assert.match(error.message, /server stdout \(sanitized tail\):\nserver boot output/);
      assert.match(error.message, /server stderr \(sanitized tail\):/);
      assert.doesNotMatch(error.message, /\u001b/);
      assert.ok(error.message.length < 8_500, `diagnostic was not bounded: ${error.message.length}`);
      return true;
    },
  );
  assert.equal(child.wasKilled, true);
});

test('server spawn errors are observed and classified without an unhandled error event', async () => {
  const child = new FakeChild({ pid: undefined });
  child.pid = undefined;
  const spawnError = Object.assign(new Error('spawn executable failed'), { code: 'ENOENT' });
  const spawnImpl = () => {
    queueMicrotask(() => child.emit('error', spawnError));
    return child;
  };

  await assert.rejects(
    runBrowserHarness({
      mode: testMode,
      spawnImpl,
      fetchImpl: async () => { throw connectionRefusedError(); },
      readinessTimeoutMs: 100,
      readinessRequestTimeoutMs: 5,
      readinessPollIntervalMs: 1,
      portPreflightImpl: async () => {},
    }),
    error => {
      assert.match(error.message, /phase: server spawn/);
      assert.match(error.message, /server spawn error \(ENOENT\): spawn executable failed/);
      return true;
    },
  );
  assert.equal(child.wasKilled, false, 'a process that never spawned must not be killed');
});

test('captured stdout and stderr are ANSI-sanitized and independently capped', () => {
  const capture = createCappedOutputCapture(32);
  capture.append('stdout', `prefix-\u001b[32m${'a'.repeat(64)}\u001b[0m`);
  capture.append('stderr', `prefix-\u001b[31m${'b'.repeat(64)}\u001b[0m`);
  const snapshot = capture.snapshot();
  assert.equal(snapshot.stdout, 'a'.repeat(32));
  assert.equal(snapshot.stderr, 'b'.repeat(32));
  assert.doesNotMatch(`${snapshot.stdout}${snapshot.stderr}`, /\u001b/);
});

test('owned Vite binding is recognized only for the exact host and port across split chunks', () => {
  const state = createOwnedListeningState({ host: '127.0.0.1', port: '4191', limit: 96 });
  state.consume(`\u001b[31m${'noise-'.repeat(30)}\u001b[0m\n  ➜  Local:   http://127.0.`);
  assert.equal(state.snapshot().observed, false);
  state.consume('0.1:4192/\n  ➜  Local:   http://127.0.0.1:41');
  assert.equal(state.snapshot().observed, false, 'a foreign port must not satisfy ownership');
  state.consume('91/\n');
  const snapshot = state.snapshot();
  assert.equal(snapshot.observed, true);
  assert.ok(snapshot.boundedStdout.length <= 96);
  assert.doesNotMatch(snapshot.boundedStdout, /\u001b/);
});

test('Enterprise mode builds its dedicated harness then previews before propagating Playwright exit', async () => {
  const calls = [];
  const server = new FakeChild();
  const spawnImpl = (_command, arguments_, options) => {
    calls.push({ arguments_, options });
    if (arguments_.includes('build')) {
      const build = new FakeChild();
      queueMicrotask(() => {
        build.exitCode = 0;
        build.emit('close', 0, null);
      });
      return build;
    }
    if (arguments_.includes('preview')) {
      queueMicrotask(() => {
        server.stdout.write('\u001b[32m  ➜  Local:   http://127.0.0.1:41');
        server.stdout.write('91/\u001b[0m\n');
      });
      return server;
    }
    const playwright = new FakeChild();
    queueMicrotask(() => {
      playwright.exitCode = 7;
      playwright.emit('close', 7, null);
    });
    return playwright;
  };

  const exitCode = await runBrowserHarness({
    mode: browserModeByFlag.get('--enterprise-intelligence'),
    spawnImpl,
    fetchImpl: async () => ({ ok: true, status: 200, statusText: 'OK' }),
    readinessTimeoutMs: 100,
    readinessPollIntervalMs: 1,
    portPreflightImpl: async () => {},
  });

  assert.equal(exitCode, 7);
  assert.equal(calls.length, 3);
  assert.ok(calls[0].arguments_.includes('build'));
  assert.equal(calls[0].options.env.ENTERPRISE_INTELLIGENCE_BROWSER_TEST_BUILD, 'true');
  assert.ok(calls[1].arguments_.includes('preview'));
  assert.ok(calls[1].arguments_.includes('--strictPort'));
  assert.ok(calls[1].arguments_.includes('4191'));
  assert.ok(calls[2].arguments_.includes('--config=playwright.enterprise-intelligence.config.ts'));
  assert.equal(server.wasKilled, true);
});

test('default transcript mode builds its dedicated harness then previews before Playwright', async () => {
  const calls = [];
  const server = new FakeChild();
  const spawnImpl = (_command, arguments_, options) => {
    calls.push({ arguments_, options });
    if (arguments_.includes('build')) {
      const build = new FakeChild();
      queueMicrotask(() => {
        build.exitCode = 0;
        build.emit('close', 0, null);
      });
      return build;
    }
    if (arguments_.includes('preview')) {
      queueMicrotask(() => {
        server.stdout.write('\u001b[32m  ➜  Local:   http://127.0.0.1:41');
        server.stdout.write('93/\u001b[0m\n');
      });
      return server;
    }
    const playwright = new FakeChild();
    queueMicrotask(() => {
      playwright.exitCode = 0;
      playwright.emit('close', 0, null);
    });
    return playwright;
  };

  const exitCode = await runBrowserHarness({
    mode: defaultBrowserMode,
    spawnImpl,
    fetchImpl: async () => ({ ok: true, status: 200, statusText: 'OK' }),
    readinessTimeoutMs: 100,
    readinessPollIntervalMs: 1,
    portPreflightImpl: async () => {},
  });

  assert.equal(exitCode, 0);
  assert.equal(calls.length, 3);
  assert.ok(calls[0].arguments_.includes('build'));
  assert.equal(calls[0].options.env.ENTERPRISE_INTELLIGENCE_BROWSER_TEST_BUILD, 'true');
  assert.ok(calls[1].arguments_.includes('preview'));
  assert.ok(calls[1].arguments_.includes('--strictPort'));
  assert.ok(calls[1].arguments_.includes('4193'));
  assert.ok(calls[2].arguments_.includes('--config=playwright.transcript-flow-pr-a.config.ts'));
  assert.equal(server.wasKilled, true);
});

test('foreign HTTP 200 on the Enterprise port is rejected and preserved without Playwright launch', async () => {
  const foreignServer = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('foreign-listener-token');
  });
  foreignServer.listen(4191, '127.0.0.1');
  await once(foreignServer, 'listening');

  try {
    const startedAt = Date.now();
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [
        'scripts/runTranscriptFlowBrowser.mjs', '--enterprise-intelligence',
      ], {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('occupied-port runner did not fail within 15 seconds'));
      }, 15_000);
      child.once('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('close', (code, signal) => {
        clearTimeout(timeout);
        resolve({ code, signal, stdout, stderr });
      });
    });

    assert.notEqual(result.code, 0, `runner unexpectedly passed:\n${result.stdout}\n${result.stderr}`);
    assert.equal(result.signal, null);
    assert.ok(Date.now() - startedAt < 5_000, 'occupied-port preflight did not fail before build');
    assert.match(result.stderr, /browser port preflight rejected 127\.0\.0\.1:4191 \(EADDRINUSE\): address already in use/);
    assert.match(result.stderr, /No build or Playwright process was started/);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /building client environment for production/i);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Running \d+ tests? using/);

    const response = await fetch('http://127.0.0.1:4191/foreign-check');
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'foreign-listener-token');
    assert.equal(foreignServer.listening, true);
  } finally {
    await new Promise((resolve, reject) => foreignServer.close(error => error ? reject(error) : resolve()));
  }
});
