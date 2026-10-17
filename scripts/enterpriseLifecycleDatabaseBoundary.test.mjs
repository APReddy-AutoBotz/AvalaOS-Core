import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import {
  readEnterpriseLifecycleRequestBody,
  responseToEnterpriseLifecycleNode,
  scheduleEnterpriseLifecycleRequest,
  validateEnterpriseLifecycleDatabaseUrl,
} from './enterpriseLifecyclePostgresFixture.mjs';

const responseSink = () => {
  const sink = new PassThrough();
  sink.status = null;
  sink.headers = null;
  sink.headersFlushed = false;
  sink.writeHead = (status, headers) => { sink.status = status; sink.headers = headers; };
  sink.flushHeaders = () => { sink.headersFlushed = true; sink.emit('headers-flushed'); };
  return sink;
};

test('disposable database runner rejects remote targets and connection overrides before connecting', () => {
  for (const value of [
    'postgresql://fixture:fixture@database.example.invalid/postgres',
    'postgresql://fixture:fixture@localhost/postgres',
    'postgresql://fixture:fixture@127.0.0.1/postgres?host=database.example.invalid',
    'postgresql://fixture:fixture@127.0.0.1/postgres?options=-csearch_path=other',
    'postgresql://fixture:fixture@127.0.0.1/postgres#override',
    'postgresql://fixture:fixture@127.0.0.1/customer_database',
    'https://127.0.0.1/postgres',
    'invalid',
  ]) {
    assert.throws(() => validateEnterpriseLifecycleDatabaseUrl(value), /ENTERPRISE_LIFECYCLE_DATABASE_URL_REJECTED/u);
  }
});

test('disposable database runner accepts only explicit loopback with the declared local or CI admin database', () => {
  for (const value of [
    'postgresql://fixture:fixture@127.0.0.1:55471/postgres',
    'postgres://fixture:fixture@127.0.0.1:5432/avalaos_pilot_synthetic',
    'postgresql://fixture:fixture@[::1]:55471/postgres',
  ]) assert.equal(validateEnterpriseLifecycleDatabaseUrl(value), value);
});

test('aborted fixture request bodies release the serialized request tail', async () => {
  let releasePrevious;
  let requestTail = new Promise(resolve => { releasePrevious = resolve; });
  const aborted = new PassThrough();
  const bodyResult = readEnterpriseLifecycleRequestBody(aborted).then(
    body => ({ body, error: null }),
    error => ({ body: null, error }),
  );
  const abortedRun = requestTail.then(async () => {
    const result = await bodyResult;
    if (result.error) throw result.error;
    return result.body;
  });
  requestTail = abortedRun.catch(() => {});
  aborted.write('{"partial":');
  aborted.emit('aborted');
  aborted.emit('error', new Error('ECONNRESET'));
  releasePrevious();
  await assert.rejects(abortedRun, /ENTERPRISE_LIFECYCLE_REQUEST_ABORTED/u);
  await requestTail;

  const next = new PassThrough();
  const nextRead = readEnterpriseLifecycleRequestBody(next);
  next.end('{"next":true}');
  assert.equal((await nextRead).toString('utf8'), '{"next":true}');
});

test('node response serialization flushes headers and forwards body chunks without buffering', async () => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let first = true;
  const body = new ReadableStream({
    async pull(controller) {
      if (first) {
        first = false;
        controller.enqueue(new TextEncoder().encode('{"first":'));
      } else {
        await held;
        controller.enqueue(new TextEncoder().encode('true}'));
        controller.close();
      }
    },
  });
  const sink = responseSink();
  const chunks = [];
  sink.on('data', chunk => chunks.push(chunk));
  const writing = responseToEnterpriseLifecycleNode(new Response(body, {
    status: 200, headers: { 'content-type': 'application/json' },
  }), sink);
  try {
    if (!sink.headersFlushed) await once(sink, 'headers-flushed');
    await once(sink, 'data');
    assert.equal(sink.status, 200);
    assert.equal(sink.headersFlushed, true);
    assert.equal(Buffer.concat(chunks).toString('utf8'), '{"first":');
  } finally {
    release();
  }
  await writing;
  assert.equal(Buffer.concat(chunks).toString('utf8'), '{"first":true}');
});

test('node response serialization cancels a held upstream body when the client disconnects', async () => {
  let release;
  let cancelled = false;
  const held = new Promise(resolve => { release = resolve; });
  const body = new ReadableStream({
    async pull() { await held; },
    cancel() { cancelled = true; },
  });
  const sink = responseSink();
  const writing = responseToEnterpriseLifecycleNode(new Response(body, { status: 200 }), sink);
  try {
    if (!sink.headersFlushed) await once(sink, 'headers-flushed');
    sink.destroy(new Error('TEST_CLIENT_CANCELLED'));
    await assert.rejects(writing, /TEST_CLIENT_CANCELLED|Premature close/u);
    assert.equal(cancelled, true);
  } finally {
    release();
  }
});

test('node response serialization propagates upstream stream errors', async () => {
  const body = new ReadableStream({
    start(controller) { controller.error(new Error('TEST_UPSTREAM_STREAM_FAILED')); },
  });
  const sink = responseSink();
  await assert.rejects(
    responseToEnterpriseLifecycleNode(new Response(body, { status: 200 }), sink),
    /TEST_UPSTREAM_STREAM_FAILED/u,
  );
});

test('a held Delivery body does not block its queued release control after the handler finishes', { timeout: 2000 }, async () => {
  let finishHandler;
  let releaseBody;
  const handlerGate = new Promise(resolve => { finishHandler = resolve; });
  const bodyGate = new Promise(resolve => { releaseBody = resolve; });
  const sink = responseSink();
  const chunks = [];
  sink.on('data', chunk => chunks.push(chunk));
  let handlerCommitted = false;
  let releaseControlRan = false;
  let bodyCompleted = false;
  const first = scheduleEnterpriseLifecycleRequest(Promise.resolve(), async routeFinished => {
    await handlerGate;
    handlerCommitted = true;
    const body = new ReadableStream({ async start(controller) {
      await bodyGate;
      controller.enqueue(new TextEncoder().encode('[]'));
      controller.close();
    } });
    routeFinished();
    await responseToEnterpriseLifecycleNode(new Response(body), sink);
    bodyCompleted = true;
  }, true);
  const second = scheduleEnterpriseLifecycleRequest(first.serialized, async () => {
    assert.equal(handlerCommitted, true);
    assert.equal(bodyCompleted, false);
    releaseControlRan = true;
    releaseBody();
  });
  try {
    await Promise.resolve();
    assert.equal(releaseControlRan, false, 'later controls cannot overtake handler/database work');
    finishHandler();
    await second.completed;
    await first.completed;
    assert.equal(bodyCompleted, true);
    assert.equal(Buffer.concat(chunks).toString(), '[]');
  } finally { finishHandler(); releaseBody(); }
});

test('failed detached handlers release the queue and retain their failure', async () => {
  const first = scheduleEnterpriseLifecycleRequest(Promise.resolve(), async () => {
    throw new Error('TEST_HANDLER_FAILED');
  }, true);
  await assert.rejects(first.completed, /TEST_HANDLER_FAILED/u);
  let nextRan = false;
  await scheduleEnterpriseLifecycleRequest(first.serialized, async () => { nextRan = true; }).completed;
  assert.equal(nextRan, true);
});
