import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { AUTHENTICATED_HOSTED_SESSION_QUERY } from './authenticatedHostedControllerAdapters.mjs';
import { AUTHENTICATED_HOSTED_CAPTURE_QUERY } from './authenticatedHostedObservationAdapter.mjs';
import { createAuthenticatedObservationReadPool, READ_POOL_MAX } from './authenticatedObservationReadPool.mjs';

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

class FakePool extends EventEmitter {
  constructor(config, query = async () => ({ rows: [] })) {
    super();
    this.config = config;
    this.queryImpl = query;
    this.active = 0;
    this.maxActive = 0;
    this.connectCount = 0;
    this.releaseCount = 0;
    this.releaseErrors = [];
    this.waiters = [];
    this.ended = 0;
  }

  connect() {
    this.connectCount++;
    if (this.active >= this.config.max) {
      const waiter = deferred();
      this.waiters.push(waiter);
      return waiter.promise;
    }
    return Promise.resolve(this.#client());
  }

  #client() {
    this.active++;
    this.maxActive = Math.max(this.maxActive, this.active);
    let released = false;
    return {
      query: (sql, values) => this.queryImpl(sql, values),
      release: error => {
        if (released) throw new Error('double release');
        released = true;
        this.releaseCount++;
        this.releaseErrors.push(error ?? null);
        this.active--;
        const waiter = this.waiters.shift();
        if (waiter) waiter.resolve(this.#client());
      },
    };
  }

  async end() { this.ended++; }
}

const clientConfig = Object.freeze({ connectionString: 'postgresql://redacted', query_timeout: 30_000,
  statement_timeout: 29_000, ssl: { rejectUnauthorized: true } });

test('read pool preserves connection defenses, warms four connections, and routes only exact reads', async () => {
  const calls = []; let pool;
  const readPool = createAuthenticatedObservationReadPool({
    clientConfig,
    createPool: config => (pool = new FakePool(config, async (sql, values) => {
      calls.push([sql, values]);
      return { rows: [{ ok: true }] };
    })),
    now: (() => { let value = 0; return () => value += 2; })(),
  });
  assert.equal(pool.config.max, READ_POOL_MAX);
  assert.equal(pool.config.min, READ_POOL_MAX);
  assert.equal(pool.config.query_timeout, clientConfig.query_timeout);
  assert.equal(pool.config.statement_timeout, clientConfig.statement_timeout);
  assert.equal(pool.config.ssl, clientConfig.ssl);
  assert.match(pool.config.options, /default_transaction_read_only=on/u);
  await readPool.start();
  assert.equal(pool.connectCount, READ_POOL_MAX);
  assert.equal(pool.releaseCount, READ_POOL_MAX);
  assert.deepEqual(await readPool.query(AUTHENTICATED_HOSTED_SESSION_QUERY, ['session', 'actor']),
    { rows: [{ ok: true }] });
  assert.deepEqual(await readPool.query(AUTHENTICATED_HOSTED_CAPTURE_QUERY, ['capture']),
    { rows: [{ ok: true }] });
  await assert.rejects(readPool.query('SELECT 1', []), /QUERY_REJECTED/u);
  assert.deepEqual(calls, [
    [AUTHENTICATED_HOSTED_SESSION_QUERY, ['session', 'actor']],
    [AUTHENTICATED_HOSTED_CAPTURE_QUERY, ['capture']],
  ]);
  const snapshot = readPool.snapshot();
  assert.deepEqual(snapshot.session.queue, { count: 1, failed: 0, totalMs: 2, maxMs: 2, inFlight: 0, maxInFlight: 1 });
  assert.deepEqual(snapshot.session.service, { count: 1, failed: 0, totalMs: 2, maxMs: 2, inFlight: 0, maxInFlight: 1 });
  assert.deepEqual(snapshot.capture.queue, { count: 1, failed: 0, totalMs: 2, maxMs: 2, inFlight: 0, maxInFlight: 1 });
  assert.deepEqual(snapshot.capture.service, { count: 1, failed: 0, totalMs: 2, maxMs: 2, inFlight: 0, maxInFlight: 1 });
  assert.equal(JSON.stringify(snapshot).includes('session'), true);
  assert.equal(JSON.stringify(snapshot).includes('capture'), true);
  assert.equal(JSON.stringify(snapshot).includes('postgresql'), false);
  readPool.resetMetrics();
  assert.equal(readPool.snapshot().session.queue.count, 0);
  assert.equal(readPool.snapshot().capture.service.totalMs, 0);
  await readPool.end();
  await readPool.end();
  assert.equal(pool.ended, 1);
});

test('read pool caps four concurrent checked-out clients and separates queue from service time', async () => {
  const blockers = Array.from({ length: 5 }, deferred); let queryIndex = 0; let clock = 0; let pool;
  const readPool = createAuthenticatedObservationReadPool({
    clientConfig,
    createPool: config => (pool = new FakePool(config, () => blockers[queryIndex++].promise)),
    now: () => clock,
  });
  await readPool.start();
  const running = Array.from({ length: 5 }, () => readPool.query(AUTHENTICATED_HOSTED_CAPTURE_QUERY, []));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pool.maxActive, READ_POOL_MAX);
  assert.equal(queryIndex, READ_POOL_MAX);
  clock = 10;
  blockers[0].resolve({ rows: [] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(queryIndex, 5);
  clock = 20;
  for (const blocker of blockers.slice(1)) blocker.resolve({ rows: [] });
  await Promise.all(running);
  const snapshot = readPool.snapshot().capture;
  assert.equal(snapshot.queue.count, 5);
  assert.equal(snapshot.queue.maxInFlight, 5);
  assert.equal(snapshot.service.count, 5);
  assert.equal(snapshot.service.maxInFlight, READ_POOL_MAX);
  assert.equal(snapshot.queue.maxMs, 10);
  assert.equal(snapshot.service.maxMs, 20);
  await readPool.end();
});

test('query failures are counted, clients are released, and idle failures close admission', async () => {
  let pool;
  const readPool = createAuthenticatedObservationReadPool({
    clientConfig,
    createPool: config => (pool = new FakePool(config, async () => { throw new Error('private query error'); })),
  });
  await readPool.start();
  const releasedBefore = pool.releaseCount;
  await assert.rejects(readPool.query(AUTHENTICATED_HOSTED_SESSION_QUERY, []), /private query error/u);
  assert.equal(pool.releaseCount, releasedBefore + 1);
  assert.match(pool.releaseErrors.at(-1).message, /private query error/u);
  assert.equal(readPool.snapshot().session.service.failed, 1);
  pool.emit('error', new Error('private idle error'));
  await assert.rejects(readPool.query(AUTHENTICATED_HOSTED_SESSION_QUERY, []), /UNAVAILABLE/u);
  assert.equal(JSON.stringify(readPool.snapshot()).includes('private'), false);
  await assert.rejects(readPool.end(), /IDLE_FAILURE/u);
});

test('partial warmup failure releases acquired clients and destroys the pool', async () => {
  const pool = new EventEmitter(); let connects = 0; let releases = 0; let ended = 0;
  pool.connect = async () => {
    connects++;
    if (connects === 3) throw new Error('private warmup failure');
    return { release: () => { releases++; } };
  };
  pool.end = async () => { ended++; };
  const readPool = createAuthenticatedObservationReadPool({ clientConfig, createPool: () => pool });
  await assert.rejects(readPool.start(), /WARMUP_FAILED/u);
  assert.equal(releases, READ_POOL_MAX - 1);
  assert.equal(ended, 1);
  await readPool.end();
  assert.equal(ended, 1);
});
