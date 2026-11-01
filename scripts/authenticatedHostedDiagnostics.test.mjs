import assert from 'node:assert/strict';
import test from 'node:test';

import { authenticatedHostedFailureCode, authenticatedHostedPlaywrightFailureDescriptor,
  createAuthenticatedHostedRunDiagnostic,
  validateAuthenticatedHostedIdentityDiagnostic, validateAuthenticatedHostedPlaywrightDiagnostic,
  validateAuthenticatedHostedPlaywrightFailureLocation,
  validateAuthenticatedHostedRunDiagnostic, withAuthenticatedHostedDiagnostic } from './authenticatedHostedDiagnostics.mjs';

const classified = async (stage, error, options) => {
  try {
    await withAuthenticatedHostedDiagnostic(stage, async () => { throw error; }, options);
  } catch (caught) {
    return caught;
  }
  assert.fail('expected diagnostic failure');
};

test('owned-work failures retain only fixed safe descriptors', () => {
  for (const [message, phase, code] of [
    ['CANONICAL_PROCESS_CREATE_RESPONSE_TIMEOUT', 'PROCESS_CREATE_OBSERVATION', 'RESPONSE_TIMEOUT'],
    ['CANONICAL_PROCESS_CREATE_ACTION_TIMEOUT', 'PROCESS_CREATE_OBSERVATION', 'ACTION_TIMEOUT'],
    ['AUTHENTICATED_BROWSER_ACTOR_TRANSITION_NOT_QUIESCENT', 'ACTOR_TRANSITION', 'NOT_QUIESCENT'],
    ['AUTHENTICATED_BROWSER_ACTOR_TRANSITION_EMPTY_AFTER_DEADLINE', 'ACTOR_TRANSITION', 'EMPTY_AFTER_DEADLINE'],
    ['AUTHENTICATED_BROWSER_ACTOR_TRANSITION_STABILITY_AFTER_DEADLINE', 'ACTOR_TRANSITION', 'STABILITY_AFTER_DEADLINE'],
    ['ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_CLEANUP_INCOMPLETE', 'CONTROL_CHANNEL', 'CONTROL_CLEANUP_INCOMPLETE'],
    ['AUTHENTICATED_BROWSER_RESPONSE_BODY_INVALID_JSON', 'NETWORK_TRACKER', 'RESPONSE_BODY_INVALID_JSON'],
    ['AUTHENTICATED_BROWSER_RESPONSE_BODY_READ_FAILED', 'NETWORK_TRACKER', 'RESPONSE_BODY_READ_FAILED'],
    ['AUTHENTICATED_BROWSER_RESPONSE_BODY_TIMEOUT', 'NETWORK_TRACKER', 'RESPONSE_BODY_TIMEOUT'],
    ['AUTHENTICATED_BROWSER_RESPONSE_BODY_CLEANUP_INCOMPLETE', 'NETWORK_TRACKER', 'RESPONSE_BODY_CLEANUP_INCOMPLETE'],
  ]) {
    assert.deepEqual(authenticatedHostedPlaywrightFailureDescriptor(new Error(message)), { phase, code });
    assert.equal(authenticatedHostedPlaywrightFailureDescriptor(new Error(`${message}:private-detail`)), null);
  }
});

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

test('known authenticated hosted failures keep their exact identity', async () => {
  const expected = new Error('AUTHENTICATED_HOSTED_RUNNER_BACKEND_SOURCE_FILE_MISMATCH:fixture-sensitive-value');
  const caught=await classified('SOURCE_DOWNLOAD', expected);
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
  for (const stage of ['DATABASE_CONNECT','DEPLOYMENT_INVENTORY','SOURCE_PREPARE','SOURCE_DOWNLOAD','SOURCE_COMPARE','NATIVE_VAULT',
    'DATABASE_SCOPE_BASELINE','ACTIVATION']) {
    const caught=await classified(stage,new Error('fixture-sensitive-value-must-never-appear'));
    assert.equal(caught.message,`AUTHENTICATED_HOSTED_RUNNER_DIAGNOSTIC_${stage}_UNCLASSIFIED`);
  }
});

test('terminal reporting preserves specific Vault and scope codes without raw suffixes', () => {
  for (const code of ['AUTHENTICATED_HOSTED_SECRET_MATERIAL_BINDING_REJECTED',
    'AUTHENTICATED_HOSTED_CUTOFF_REJECTED', 'AUTHENTICATED_HOSTED_RUNNER_CLEANUP_INCOMPLETE']) {
    assert.equal(authenticatedHostedFailureCode(new Error(code + ':fixture-sensitive-value')), code);
  }
  assert.equal(authenticatedHostedFailureCode(new Error('raw fixture-sensitive-value')),
    'AUTHENTICATED_HOSTED_RUNNER_FAILED');
  assert.equal(authenticatedHostedFailureCode(new Error('raw AUTHENTICATED_HOSTED_FAKE_SUFFIX')),
    'AUTHENTICATED_HOSTED_RUNNER_FAILED');
});

test('run diagnostic envelope is closed, preserves primary failure and lets cleanup dominate', () => {
  const child = { schemaVersion: 'authenticated-hosted-playwright-diagnostic-v1', project: 'desktop-chromium',
    testCategory: 'primary-lifecycle', category: 'unexpected-failure' };
  const value = createAuthenticatedHostedRunDiagnostic({
    failure: { phase: 'CLEANUP', category: 'CLEANUP_INCOMPLETE' },
    primary: { phase: 'BROWSER_EXECUTION', category: 'EXIT_NONZERO' },
    child,
    identity: { source: 'browser', operation: 'SIGN_IN', category: 'CREDENTIAL_REJECTED', upstreamCode: 'invalid_credentials' },
    cleanup: 'failed',
  });
  assert.deepEqual(validateAuthenticatedHostedRunDiagnostic(value), value);
  assert.equal(JSON.stringify(value).includes('raw'), false);
  assert.equal(validateAuthenticatedHostedRunDiagnostic({ ...value, raw: 'secret' }), null);
  assert.equal(validateAuthenticatedHostedPlaywrightDiagnostic({ ...child, project: 'arbitrary-project' }), null);
  assert.equal(validateAuthenticatedHostedIdentityDiagnostic({ operation: 'SIGN_IN', category: 'CREDENTIAL_REJECTED', upstreamCode: 'raw-code' }), null);
  assert.throws(() => createAuthenticatedHostedRunDiagnostic({ ...value, cleanup: 'best-effort' }),
    /DIAGNOSTIC_ENVELOPE_REJECTED/u);
});

test('playwright locations retain only an exact allowlisted source and bounded positive line', () => {
  const source = 'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts';
  const location = validateAuthenticatedHostedPlaywrightFailureLocation({ source, line: 1 });
  assert.deepEqual(location, { source, line: 1 });
  const base = { schemaVersion: 'authenticated-hosted-playwright-diagnostic-v1', project: 'desktop-chromium',
    testCategory: 'primary-lifecycle', category: 'unexpected-failure' };
  assert.deepEqual(validateAuthenticatedHostedPlaywrightDiagnostic({ ...base, location }), { ...base, location });
  for (const invalid of [
    { source: '../../sensitive.env', line: 1 },
    { source, line: 0 },
    { source, line: 9_999_999 },
    { source, line: 1, column: 7 },
    { source: process.cwd(), line: 1 },
  ]) assert.deepEqual(validateAuthenticatedHostedPlaywrightDiagnostic({ ...base, location: invalid }), base);
  assert.equal(validateAuthenticatedHostedPlaywrightDiagnostic({ ...base, rawTitle: 'sensitive' }), null);
  const navigationSource = 'tests/browser/productNavigationReadiness.ts';
  assert.deepEqual(validateAuthenticatedHostedPlaywrightFailureLocation({ source: navigationSource, line: 1 }),
    { source: navigationSource, line: 1 });
  const canonicalSource = 'tests/browser/enterpriseLifecycleAcceptance/canonicalInvoiceExceptionJourney.ts';
  assert.deepEqual(validateAuthenticatedHostedPlaywrightFailureLocation({ source: canonicalSource, line: 1 }),
    { source: canonicalSource, line: 1 });
  assert.equal(validateAuthenticatedHostedPlaywrightFailureLocation({
    source: canonicalSource.replace('canonicalInvoiceExceptionJourney', 'canonicalBusinessOutputEvidence'), line: 1,
  }), null);
});

test('playwright failure descriptors retain only closed phase and code pairs', () => {
  for (const [message, code] of [
    ['CANONICAL_PROCESS_CREATE_RESPONSE_TIMEOUT', 'RESPONSE_TIMEOUT'],
    ['CANONICAL_PROCESS_CREATE_ACTION_TIMEOUT', 'ACTION_TIMEOUT'],
  ]) {
    assert.deepEqual(authenticatedHostedPlaywrightFailureDescriptor(new Error(message)),
      { phase: 'PROCESS_CREATE_OBSERVATION', code });
    assert.equal(authenticatedHostedPlaywrightFailureDescriptor(
      new Error(`${message}:private-detail`)), null);
  }
  assert.deepEqual(authenticatedHostedPlaywrightFailureDescriptor(
    new Error('AUTHENTICATED_BROWSER_ACTION_START_REJECTED')),
  { phase: 'NETWORK_TRACKER', code: 'ACTION_START_REJECTED' });
  assert.deepEqual(authenticatedHostedPlaywrightFailureDescriptor(
    new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_SESSION_REJECTED')),
  { phase: 'CONTROL_CHANNEL', code: 'SESSION_REJECTED' });
  assert.deepEqual(authenticatedHostedPlaywrightFailureDescriptor(
    new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TRANSPORT_REJECTED')),
  { phase: 'CONTROL_CHANNEL', code: 'TRANSPORT_REJECTED' });
  assert.deepEqual(authenticatedHostedPlaywrightFailureDescriptor(
    new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_RESPONSE_REJECTED')),
  { phase: 'CONTROL_CHANNEL', code: 'RESPONSE_REJECTED' });
  assert.deepEqual(authenticatedHostedPlaywrightFailureDescriptor(
    new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TIMEOUT')),
  { phase: 'CONTROL_CHANNEL', code: 'CONTROL_REQUEST_TIMEOUT' });
  assert.equal(authenticatedHostedPlaywrightFailureDescriptor(
    new Error('ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TIMEOUT:raw-sensitive-suffix')), null);
  assert.deepEqual(authenticatedHostedPlaywrightFailureDescriptor(
    new Error('ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_NOT_FOUND')),
  { phase: 'PROCESS_CATALOG', code: 'PROCESS_NOT_FOUND' });
  assert.deepEqual(authenticatedHostedPlaywrightFailureDescriptor(
    new Error('ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_AMBIGUOUS')),
  { phase: 'PROCESS_CATALOG', code: 'PROCESS_AMBIGUOUS' });
  assert.deepEqual(authenticatedHostedPlaywrightFailureDescriptor(
    new Error('ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_AUTHORITY_REJECTED')),
  { phase: 'PROCESS_CATALOG', code: 'PROCESS_AUTHORITY_REJECTED' });
  assert.equal(authenticatedHostedPlaywrightFailureDescriptor(
    new Error('ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_AUTHORITY_REJECTED:sensitive-value')), null);
  for (const [message, phase, code] of [
    ['ENTERPRISE_LIFECYCLE_BROWSER_AUTHORITY_READ_REJECTED', 'PROCESS_RELOAD', 'AUTHORITY_READ_REJECTED'],
    ['ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_DETAIL_MISSING', 'PROCESS_RELOAD', 'PROCESS_DETAIL_MISSING'],
    ['ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_DETAIL_HIDDEN', 'PROCESS_RELOAD', 'PROCESS_DETAIL_HIDDEN'],
    ['ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_DETAIL_AMBIGUOUS', 'PROCESS_RELOAD', 'PROCESS_DETAIL_AMBIGUOUS'],
    ['ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_NAVIGATION_REJECTED', 'PRODUCT_NAVIGATION', 'PROCESS_NAVIGATION_REJECTED'],
    ['ENTERPRISE_LIFECYCLE_BROWSER_SESSION_BINDING_REJECTED', 'IDENTITY_ENTRY', 'SESSION_BINDING_REJECTED'],
  ]) {
    assert.deepEqual(authenticatedHostedPlaywrightFailureDescriptor(new Error(message)), { phase, code });
    assert.equal(authenticatedHostedPlaywrightFailureDescriptor(new Error(`${message}:sensitive-value`)), null);
  }
  assert.deepEqual(authenticatedHostedPlaywrightFailureDescriptor(
    new Error('PRODUCT_NAVIGATION_SHELL_NOT_READY')),
  { phase: 'PRODUCT_NAVIGATION', code: 'SHELL_NOT_READY' });
  assert.deepEqual(authenticatedHostedPlaywrightFailureDescriptor(
    { message: '\u001b[31mError: AUTHENTICATED_BROWSER_ACTION_TRACKER_MISSING\u001b[39m' }),
  { phase: 'NETWORK_TRACKER', code: 'TRACKER_MISSING' });
  for (const [message, code] of [
    ['ENTERPRISE_LIFECYCLE_BROWSER_SAFETY_001_HTTP_STATUS_REJECTED', 'SAFETY_001_HTTP_STATUS_REJECTED'],
    ['ENTERPRISE_LIFECYCLE_BROWSER_SAFETY_002_HTTP_STATUS_REJECTED', 'SAFETY_002_HTTP_STATUS_REJECTED'],
    ['ENTERPRISE_LIFECYCLE_BROWSER_SAFETY_003_HTTP_STATUS_REJECTED', 'SAFETY_003_HTTP_STATUS_REJECTED'],
    ['ENTERPRISE_LIFECYCLE_BROWSER_SAFETY_002_RESPONSE_CODE_REJECTED', 'SAFETY_002_RESPONSE_CODE_REJECTED'],
  ]) {
    assert.deepEqual(authenticatedHostedPlaywrightFailureDescriptor(new Error(message)),
      { phase: 'SAFETY_BOUNDARY', code });
    assert.equal(authenticatedHostedPlaywrightFailureDescriptor(new Error(`${message}:raw-sensitive-suffix`)), null);
  }
  assert.equal(authenticatedHostedPlaywrightFailureDescriptor(
    new Error('AUTHENTICATED_BROWSER_ACTION_START_REJECTED:raw-sensitive-suffix')), null);
  const base = { schemaVersion: 'authenticated-hosted-playwright-diagnostic-v1', project: 'desktop-chromium',
    testCategory: 'primary-lifecycle', category: 'unexpected-failure' };
  for (const operation of ['ACTION_START','PERMIT_ARM','ACTION_FINISH','CASE_SUBMIT','SESSION_BIND','SETUP','OBSERVE',
    'OTHER_CONTROL','NETWORK_DRAIN','CASE_DRAIN','SAFETY_OFFLINE','SAFETY_SERVER','SAFETY_TIMEOUT',
    'V1_ASSESSMENT_COMPLETION','PRIMARY_CANONICAL_PROCESS_CREATE']) {
    assert.deepEqual(validateAuthenticatedHostedPlaywrightDiagnostic({ ...base, operation }), { ...base, operation });
  }
  assert.deepEqual(authenticatedHostedPlaywrightFailureDescriptor(
    new Error('ENTERPRISE_LIFECYCLE_BROWSER_V1_COMPLETION_TIMEOUT')),
  { phase: 'ASSESSMENT_COMPLETION', code: 'V1_COMPLETION_TIMEOUT' });
  assert.equal(authenticatedHostedPlaywrightFailureDescriptor(
    new Error('ENTERPRISE_LIFECYCLE_BROWSER_V1_COMPLETION_TIMEOUT:raw-sensitive-suffix')), null);
  assert.equal(validateAuthenticatedHostedPlaywrightDiagnostic({ ...base, operation: 'raw-sensitive-operation' }), null);
  assert.deepEqual(validateAuthenticatedHostedPlaywrightDiagnostic({ ...base,
    phase: 'IDENTITY_ENTRY', code: 'CREDENTIAL_REJECTED' }), { ...base,
    phase: 'IDENTITY_ENTRY', code: 'CREDENTIAL_REJECTED' });
  assert.equal(validateAuthenticatedHostedPlaywrightDiagnostic({ ...base,
    phase: 'IDENTITY_ENTRY', code: 'TRACKER_MISSING' }), null);
  assert.equal(validateAuthenticatedHostedPlaywrightDiagnostic({ ...base,
    phase: 'RAW_PHASE', code: 'CREDENTIAL_REJECTED' }), null);
  assert.equal(validateAuthenticatedHostedPlaywrightDiagnostic({ ...base,
    phase: undefined, code: 'CREDENTIAL_REJECTED' }), null);
  assert.equal(validateAuthenticatedHostedPlaywrightDiagnostic({ ...base,
    phase: 'IDENTITY_ENTRY', code: 'CREDENTIAL_REJECTED', raw: 'secret' }), null);
});
