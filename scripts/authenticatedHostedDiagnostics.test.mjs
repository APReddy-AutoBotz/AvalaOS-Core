import assert from 'node:assert/strict';
import test from 'node:test';

import { withAuthenticatedHostedDiagnostic } from './authenticatedHostedDiagnostics.mjs';

const classified = async (stage, error, options) => {
  try {
    await withAuthenticatedHostedDiagnostic(stage, async () => { throw error; }, options);
  } catch (caught) {
    return caught;
  }
  assert.fail('expected diagnostic failure');
};

test('diagnostics emit only fixed stage and SQLSTATE categories', async () => {
  const secret = 'postgresql://service-role:do-not-emit@example.invalid/postgres';
  const error = Object.assign(new Error(`connection failed ${secret}`), { code: '28P01', detail: secret });
  const caught = await classified('DATABASE_CONNECT', error);
  assert.equal(caught.message,
    'AUTHENTICATED_HOSTED_RUNNER_DIAGNOSTIC_DATABASE_CONNECT_SQL_AUTHENTICATION');
  assert.equal(JSON.stringify(caught).includes(secret), false);
  assert.equal(caught.cause, undefined);
  for (const [code,category] of [['P0001','SQL_REJECTION'],['22P02','SQL_INPUT'],['22023','SQL_INPUT'],
    ['23503','SQL_CONSTRAINT'],['23505','SQL_CONSTRAINT'],['23514','SQL_CONSTRAINT']]) {
    const mapped=await classified('ACTIVATION',Object.assign(new Error('sensitive'),{code}));
    assert.equal(mapped.message,`AUTHENTICATED_HOSTED_RUNNER_DIAGNOSTIC_ACTIVATION_${category}`);
  }
});

test('diagnostics map bounded network codes without exposing raw messages or stacks', async () => {
  const secret = 'fixture-sensitive-value-must-never-appear';
  const caught = await classified('DEPLOYMENT_INVENTORY',
    Object.assign(new Error(`request ${secret}`), { code: 'ENOTFOUND', stack: secret }));
  assert.equal(caught.message, 'AUTHENTICATED_HOSTED_RUNNER_DIAGNOSTIC_DEPLOYMENT_INVENTORY_DNS');
  assert.equal(caught.message.includes(secret), false);
  assert.equal(caught.stack.includes(secret), false);
});

test('source download recognizes allowlisted CLI signatures and sanitizes unknown stderr', async () => {
  const docker = Object.assign(new Error('raw child failure'), {
    stderr: 'Cannot connect to the Docker daemon fixture-sensitive-value-must-never-appear',
  });
  assert.equal((await classified('SOURCE_DOWNLOAD', docker, { source: 'cli' })).message,
    'AUTHENTICATED_HOSTED_RUNNER_DIAGNOSTIC_SOURCE_DOWNLOAD_CLI_DOCKER_UNAVAILABLE');
  const unknown = Object.assign(new Error('raw child failure'), {
    stderr: 'an unrecognized CLI failure fixture-sensitive-value-must-never-appear',
  });
  assert.equal((await classified('SOURCE_DOWNLOAD', unknown, { source: 'cli' })).message,
    'AUTHENTICATED_HOSTED_RUNNER_DIAGNOSTIC_SOURCE_DOWNLOAD_CLI_FAILURE');
});

test('known authenticated hosted failures keep their exact identity', async () => {
  const expected = new Error('AUTHENTICATED_HOSTED_RUNNER_BACKEND_SOURCE_FILE_MISMATCH:fixture-sensitive-value');
  const caught=await classified('SOURCE_DOWNLOAD', expected, { source: 'cli' });
  assert.equal(caught.message,'AUTHENTICATED_HOSTED_RUNNER_BACKEND_SOURCE_FILE_MISMATCH');
  assert.notEqual(caught,expected);
});

test('diagnostic stage and source identifiers are closed allowlists', async () => {
  await assert.rejects(withAuthenticatedHostedDiagnostic('RAW_STAGE', async () => undefined),
    /^Error: AUTHENTICATED_HOSTED_RUNNER_DIAGNOSTIC_INPUT_REJECTED$/u);
  await assert.rejects(withAuthenticatedHostedDiagnostic('ACTIVATION', async () => undefined, { source: 'raw' }),
    /^Error: AUTHENTICATED_HOSTED_RUNNER_DIAGNOSTIC_INPUT_REJECTED$/u);
});

test('every preactivation stage has a fixed unknown-error fallback', async () => {
  for (const stage of ['DATABASE_CONNECT','DEPLOYMENT_INVENTORY','SOURCE_DOWNLOAD','NATIVE_VAULT',
    'DATABASE_SCOPE_BASELINE','ACTIVATION']) {
    const caught=await classified(stage,new Error('fixture-sensitive-value-must-never-appear'));
    assert.equal(caught.message,`AUTHENTICATED_HOSTED_RUNNER_DIAGNOSTIC_${stage}_UNCLASSIFIED`);
  }
});
