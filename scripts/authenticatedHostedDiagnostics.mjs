import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

const STAGES = new Set([
  'DATABASE_CONNECT',
  'DEPLOYMENT_INVENTORY',
  'SOURCE_PREPARE',
  'SOURCE_DOWNLOAD',
  'SOURCE_COMPARE',
  'NATIVE_VAULT',
  'DATABASE_SCOPE_BASELINE',
  'ACTIVATION',
]);

export const AUTHENTICATED_HOSTED_DIAGNOSTIC_SCHEMA = 'authenticated-hosted-run-diagnostic-v1';
export const AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_SCHEMA = 'authenticated-hosted-playwright-diagnostic-v1';

const RUN_PHASES = new Set([
  'PREFLIGHT',
  'ACTIVATION',
  'CONTROLLER_START',
  'BROWSER_EXECUTION',
  'FINALIZATION',
  'CLEANUP',
]);
const RUN_CATEGORIES = new Set([
  'RUNNER_REJECTED',
  'START_FAILED',
  'EXIT_NONZERO',
  'TIMEOUT',
  'CANCELLED',
  'FINALIZATION_REJECTED',
  'CLEANUP_INCOMPLETE',
  'UNCLASSIFIED',
]);
const PLAYWRIGHT_PROJECTS = new Set(['desktop-chromium', 'pixel-7-chromium', 'unknown']);
const PLAYWRIGHT_TEST_CATEGORIES = new Set([
  'project-bootstrap',
  'primary-lifecycle',
  'govern-studio-lifecycle',
  'independent-rejection',
  'delivery-monitor',
  'scoring-policy',
  'authenticated-controls',
  'project-teardown',
  'runner',
  'unknown',
]);
const PLAYWRIGHT_CATEGORIES = new Set(['unexpected-failure', 'timeout', 'interrupted', 'configuration', 'no-tests']);
const PLAYWRIGHT_OPERATIONS = new Set([
  'ACTION_START',
  'PERMIT_ARM',
  'ACTION_FINISH',
  'CASE_SUBMIT',
  'SESSION_BIND',
  'SETUP',
  'OBSERVE',
  'OTHER_CONTROL',
  'NETWORK_DRAIN',
  'CASE_DRAIN',
  'QUEUE_TEARDOWN',
  'SAFETY_OFFLINE',
  'SAFETY_SERVER',
  'SAFETY_TIMEOUT',
  'V1_ASSESSMENT_COMPLETION',
  'PRIMARY_JOURNEY',
  'PRIMARY_PROCESS_DENIAL',
  'PRIMARY_SAFETY_AND_RUNTIME',
  'PRIMARY_V2_AUTHORING_AND_REVIEW',
  'PRIMARY_V2_FINALIZATION_AND_REVIEW',
]);
const PLAYWRIGHT_LOCATION_SOURCES = Object.freeze([
  'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts',
  'tests/browser/enterpriseLifecycleAcceptance/assessmentScenarioJourneys.ts',
  'tests/browser/enterpriseLifecycleAcceptance/studioDeliveryMonitorJourney.ts',
  'tests/browser/enterpriseLifecycleAcceptance/v1AssessmentCompletion.ts',
  'tests/browser/authenticatedLifecycleHarness.ts',
  'tests/browser/authenticatedHostedNetwork.ts',
  'tests/browser/authenticatedControlsAcceptance.ts',
  'tests/browser/productNavigationReadiness.ts',
]);
const PLAYWRIGHT_FAILURE_DESCRIPTORS = new Map([
  ['ENTERPRISE_LIFECYCLE_BROWSER_IDENTITY_CREDENTIAL_REJECTED', ['IDENTITY_ENTRY', 'CREDENTIAL_REJECTED']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_IDENTITY_ACCESS_DENIED', ['IDENTITY_ENTRY', 'ACCESS_DENIED']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_IDENTITY_ENDPOINT_MISSING', ['IDENTITY_ENTRY', 'ENDPOINT_MISSING']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_IDENTITY_CONFLICT', ['IDENTITY_ENTRY', 'IDENTITY_CONFLICT']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_IDENTITY_INPUT_REJECTED', ['IDENTITY_ENTRY', 'INPUT_REJECTED']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_IDENTITY_RATE_LIMITED', ['IDENTITY_ENTRY', 'RATE_LIMITED']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_IDENTITY_UPSTREAM_UNAVAILABLE', ['IDENTITY_ENTRY', 'UPSTREAM_UNAVAILABLE']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_IDENTITY_TRANSPORT_FAILURE', ['IDENTITY_ENTRY', 'TRANSPORT_FAILURE']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_REAL_AUTH_SESSION_REQUIRED', ['IDENTITY_ENTRY', 'SESSION_MISSING']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_SESSION_REJECTED', ['CONTROL_CHANNEL', 'SESSION_REJECTED']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_PERMIT_REJECTED', ['CONTROL_CHANNEL', 'PERMIT_REJECTED']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_ACTION_REJECTED', ['CONTROL_CHANNEL', 'ACTION_REJECTED']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_REJECTED', ['CONTROL_CHANNEL', 'CONTROL_REJECTED']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TRANSPORT_REJECTED', ['CONTROL_CHANNEL', 'TRANSPORT_REJECTED']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_RESPONSE_REJECTED', ['CONTROL_CHANNEL', 'RESPONSE_REJECTED']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_TIMEOUT', ['CONTROL_CHANNEL', 'CONTROL_REQUEST_TIMEOUT']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_CONTROL_CLEANUP_INCOMPLETE', ['CONTROL_CHANNEL', 'CONTROL_CLEANUP_INCOMPLETE']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_NOT_FOUND', ['PROCESS_CATALOG', 'PROCESS_NOT_FOUND']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_AMBIGUOUS', ['PROCESS_CATALOG', 'PROCESS_AMBIGUOUS']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_AUTHORITY_REJECTED', ['PROCESS_CATALOG', 'PROCESS_AUTHORITY_REJECTED']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_NAVIGATION_REJECTED', ['PRODUCT_NAVIGATION', 'PROCESS_NAVIGATION_REJECTED']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_AUTHORITY_READ_REJECTED', ['PROCESS_RELOAD', 'AUTHORITY_READ_REJECTED']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_DETAIL_MISSING', ['PROCESS_RELOAD', 'PROCESS_DETAIL_MISSING']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_DETAIL_HIDDEN', ['PROCESS_RELOAD', 'PROCESS_DETAIL_HIDDEN']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_PROCESS_DETAIL_AMBIGUOUS', ['PROCESS_RELOAD', 'PROCESS_DETAIL_AMBIGUOUS']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_SESSION_BINDING_REJECTED', ['IDENTITY_ENTRY', 'SESSION_BINDING_REJECTED']],
  ['PRODUCT_NAVIGATION_SHELL_NOT_READY', ['PRODUCT_NAVIGATION', 'SHELL_NOT_READY']],
  ['AUTHENTICATED_BROWSER_ACTION_TRACKER_MISSING', ['NETWORK_TRACKER', 'TRACKER_MISSING']],
  ['AUTHENTICATED_BROWSER_PRODUCT_ORIGIN_REJECTED', ['NETWORK_TRACKER', 'PRODUCT_ORIGIN_REJECTED']],
  ['AUTHENTICATED_BROWSER_ACTION_START_REJECTED', ['NETWORK_TRACKER', 'ACTION_START_REJECTED']],
  ['AUTHENTICATED_BROWSER_ACTION_START_MISSING', ['NETWORK_TRACKER', 'ACTION_START_MISSING']],
  ['AUTHENTICATED_BROWSER_RESPONSE_BODY_INVALID_JSON', ['NETWORK_TRACKER', 'RESPONSE_BODY_INVALID_JSON']],
  ['AUTHENTICATED_BROWSER_RESPONSE_BODY_READ_FAILED', ['NETWORK_TRACKER', 'RESPONSE_BODY_READ_FAILED']],
  ['AUTHENTICATED_BROWSER_RESPONSE_BODY_TIMEOUT', ['NETWORK_TRACKER', 'RESPONSE_BODY_TIMEOUT']],
  ['AUTHENTICATED_BROWSER_RESPONSE_BODY_CLEANUP_INCOMPLETE', ['NETWORK_TRACKER', 'RESPONSE_BODY_CLEANUP_INCOMPLETE']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_SAFETY_001_HTTP_STATUS_REJECTED', ['SAFETY_BOUNDARY', 'SAFETY_001_HTTP_STATUS_REJECTED']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_SAFETY_002_HTTP_STATUS_REJECTED', ['SAFETY_BOUNDARY', 'SAFETY_002_HTTP_STATUS_REJECTED']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_SAFETY_003_HTTP_STATUS_REJECTED', ['SAFETY_BOUNDARY', 'SAFETY_003_HTTP_STATUS_REJECTED']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_SAFETY_002_RESPONSE_CODE_REJECTED', ['SAFETY_BOUNDARY', 'SAFETY_002_RESPONSE_CODE_REJECTED']],
  ['ENTERPRISE_LIFECYCLE_BROWSER_V1_COMPLETION_TIMEOUT', ['ASSESSMENT_COMPLETION', 'V1_COMPLETION_TIMEOUT']],
]);
const PLAYWRIGHT_FAILURE_PAIRS = new Set([...PLAYWRIGHT_FAILURE_DESCRIPTORS.values()]
  .map(([phase, code]) => `${phase}:${code}`));
export const AUTHENTICATED_HOSTED_IDENTITY_CATEGORIES = Object.freeze([
  'PROVISION_FAILED',
  'CREDENTIAL_REJECTED',
  'ACCESS_DENIED',
  'IDENTITY_ENDPOINT_MISSING',
  'IDENTITY_CONFLICT',
  'IDENTITY_INPUT_REJECTED',
  'RATE_LIMITED',
  'UPSTREAM_UNAVAILABLE',
  'TRANSPORT_FAILURE',
  'SESSION_MISSING',
  'SESSION_VERIFICATION_FAILED',
]);
export const AUTHENTICATED_HOSTED_IDENTITY_UPSTREAM_CODES = Object.freeze([
  'bad_jwt',
  'email_address_invalid',
  'email_address_not_authorized',
  'email_not_confirmed',
  'invalid_credentials',
  'not_admin',
  'over_email_send_rate_limit',
  'over_request_rate_limit',
  'signup_disabled',
  'user_already_exists',
  'user_banned',
  'validation_failed',
]);
const IDENTITY_OPERATIONS = new Set(['PROVISION', 'SIGN_IN', 'VERIFY_SESSION']);
const IDENTITY_SOURCES = new Set(['parent', 'browser']);
const IDENTITY_CATEGORIES = new Set(AUTHENTICATED_HOSTED_IDENTITY_CATEGORIES);
const IDENTITY_UPSTREAM_CODES = new Set(AUTHENTICATED_HOSTED_IDENTITY_UPSTREAM_CODES);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, expected) => record(value)
  && Object.keys(value).length === expected.length
  && expected.every(key => Object.hasOwn(value, key));

export function validateAuthenticatedHostedIdentityDiagnostic(value) {
  if (!record(value) || !exactKeys(value, value.upstreamCode === undefined
    ? ['operation', 'category'] : ['operation', 'category', 'upstreamCode'])
    || !IDENTITY_OPERATIONS.has(value.operation) || !IDENTITY_CATEGORIES.has(value.category)
    || (value.upstreamCode !== undefined && !IDENTITY_UPSTREAM_CODES.has(value.upstreamCode))) return null;
  return Object.freeze({ operation: value.operation, category: value.category,
    ...(value.upstreamCode === undefined ? {} : { upstreamCode: value.upstreamCode }) });
}
function validateRunIdentityDiagnostic(value) {
  if (!record(value) || !IDENTITY_SOURCES.has(value.source)) return null;
  const { source, ...diagnostic } = value;
  const safe = validateAuthenticatedHostedIdentityDiagnostic(diagnostic);
  return safe ? Object.freeze({ source, ...safe }) : null;
}

export function validateAuthenticatedHostedPlaywrightDiagnostic(value) {
  const hasPhase = record(value) && Object.hasOwn(value, 'phase');
  const hasCode = record(value) && Object.hasOwn(value, 'code');
  if (hasPhase !== hasCode) return null;
  const keys = ['schemaVersion', 'project', 'testCategory', 'category',
    ...(value?.operation === undefined ? [] : ['operation']),
    ...(hasPhase ? ['phase', 'code'] : []),
    ...(value?.location === undefined ? [] : ['location'])];
  if (!exactKeys(value, keys)
    || value.schemaVersion !== AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_SCHEMA
    || !PLAYWRIGHT_PROJECTS.has(value.project) || !PLAYWRIGHT_TEST_CATEGORIES.has(value.testCategory)
    || !PLAYWRIGHT_CATEGORIES.has(value.category)
    || (value.operation !== undefined && !PLAYWRIGHT_OPERATIONS.has(value.operation))
    || (hasPhase && !PLAYWRIGHT_FAILURE_PAIRS.has(`${value.phase}:${value.code}`))) return null;
  const location = value.location === undefined ? null : validateAuthenticatedHostedPlaywrightFailureLocation(value.location);
  return Object.freeze({ schemaVersion: value.schemaVersion, project: value.project,
    testCategory: value.testCategory, category: value.category,
    ...(value.operation === undefined ? {} : { operation: value.operation }),
    ...(hasPhase ? { phase: value.phase, code: value.code } : {}),
    ...(location ? { location } : {}) });
}

export function authenticatedHostedPlaywrightFailureDescriptor(error) {
  const serialized = typeof error?.message === 'string' ? error.message : '';
  const withoutAnsi = serialized.replace(/\u001b\[[0-9;]*m/gu, '');
  const message = withoutAnsi.startsWith('Error: ') ? withoutAnsi.slice('Error: '.length) : withoutAnsi;
  const descriptor = PLAYWRIGHT_FAILURE_DESCRIPTORS.get(message);
  return descriptor ? Object.freeze({ phase: descriptor[0], code: descriptor[1] }) : null;
}

export function validateAuthenticatedHostedPlaywrightFailureLocation(value, { root = process.cwd() } = {}) {
  if (!exactKeys(value, ['source', 'line']) || typeof value.source !== 'string'
    || !Number.isSafeInteger(value.line) || value.line < 1) return null;
  const normalizedSource = value.source.replaceAll('\\', '/');
  if (!PLAYWRIGHT_LOCATION_SOURCES.includes(normalizedSource)) return null;
  try {
    const source = realpathSync(path.resolve(root, normalizedSource));
    const allowlisted = new Map(PLAYWRIGHT_LOCATION_SOURCES.map(relative => [
      realpathSync(path.resolve(root, relative)), relative,
    ]));
    const relative = allowlisted.get(source);
    if (!relative) return null;
    const lineCount = readFileSync(source, 'utf8').split(/\r?\n/u).length;
    if (value.line > lineCount) return null;
    return Object.freeze({ source: relative, line: value.line });
  } catch { return null; }
}

const runFailure = value => exactKeys(value, ['phase', 'category'])
  && RUN_PHASES.has(value.phase) && RUN_CATEGORIES.has(value.category)
  ? Object.freeze({ phase: value.phase, category: value.category }) : null;

export function createAuthenticatedHostedRunDiagnostic({ failure, primary, child = null, identity = null, cleanup }) {
  const safeFailure = runFailure(failure);
  const safePrimary = runFailure(primary);
  const safeChild = child === null ? null : validateAuthenticatedHostedPlaywrightDiagnostic(child);
  const safeIdentity = identity === null ? null : validateRunIdentityDiagnostic(identity);
  if (!safeFailure || !safePrimary || (child !== null && !safeChild) || (identity !== null && !safeIdentity)
    || !['verified', 'failed', 'not-required'].includes(cleanup)) {
    throw new Error('AUTHENTICATED_HOSTED_RUNNER_DIAGNOSTIC_ENVELOPE_REJECTED');
  }
  return Object.freeze({
    schemaVersion: AUTHENTICATED_HOSTED_DIAGNOSTIC_SCHEMA,
    status: 'failed',
    failure: safeFailure,
    primary: safePrimary,
    child: safeChild,
    identity: safeIdentity,
    cleanup: Object.freeze({ status: cleanup }),
  });
}

export function validateAuthenticatedHostedRunDiagnostic(value) {
  if (!exactKeys(value, ['schemaVersion', 'status', 'failure', 'primary', 'child', 'identity', 'cleanup'])
    || value.schemaVersion !== AUTHENTICATED_HOSTED_DIAGNOSTIC_SCHEMA || value.status !== 'failed'
    || !exactKeys(value.cleanup, ['status'])) return null;
  try {
    return createAuthenticatedHostedRunDiagnostic({ failure: value.failure, primary: value.primary,
      child: value.child, identity: value.identity, cleanup: value.cleanup.status });
  } catch { return null; }
}

export function authenticatedHostedIdentityCategoryForStatus(status) {
  if (status === 400) return 'IDENTITY_INPUT_REJECTED';
  if (status === 401) return 'CREDENTIAL_REJECTED';
  if (status === 403) return 'ACCESS_DENIED';
  if (status === 404) return 'IDENTITY_ENDPOINT_MISSING';
  if (status === 409) return 'IDENTITY_CONFLICT';
  if (status === 422) return 'IDENTITY_INPUT_REJECTED';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500 && status <= 599) return 'UPSTREAM_UNAVAILABLE';
  return 'TRANSPORT_FAILURE';
}

export function authenticatedHostedIdentityUpstreamCode(value) {
  return typeof value === 'string' && IDENTITY_UPSTREAM_CODES.has(value) ? value : undefined;
}

const SQLSTATE_CATEGORIES = new Map([
  ['28P01', 'SQL_AUTHENTICATION'],
  ['28000', 'SQL_AUTHENTICATION'],
  ['42501', 'SQL_PERMISSION'],
  ['3D000', 'SQL_DATABASE_MISSING'],
  ['42P01', 'SQL_OBJECT_MISSING'],
  ['42883', 'SQL_OBJECT_MISSING'],
  ['53300', 'SQL_CAPACITY'],
  ['53400', 'SQL_CAPACITY'],
  ['57P01', 'SQL_UNAVAILABLE'],
  ['57P02', 'SQL_UNAVAILABLE'],
  ['57P03', 'SQL_UNAVAILABLE'],
  ['57014', 'TIMEOUT'],
  ['08000', 'SQL_CONNECTION'],
  ['08001', 'SQL_CONNECTION'],
  ['08003', 'SQL_CONNECTION'],
  ['08004', 'SQL_CONNECTION'],
  ['08006', 'SQL_CONNECTION'],
  ['08007', 'SQL_CONNECTION'],
  ['08P01', 'SQL_CONNECTION'],
  ['40001', 'SQL_CONCURRENCY'],
  ['40P01', 'SQL_CONCURRENCY'],
  ['P0001', 'SQL_REJECTION'],
  ['22P02', 'SQL_INPUT'],
  ['22023', 'SQL_INPUT'],
  ['23503', 'SQL_CONSTRAINT'],
  ['23505', 'SQL_CONSTRAINT'],
  ['23514', 'SQL_CONSTRAINT'],
]);

const NODE_CATEGORIES = new Map([
  ['ETIMEDOUT', 'TIMEOUT'],
  ['ESOCKETTIMEDOUT', 'TIMEOUT'],
  ['UND_ERR_CONNECT_TIMEOUT', 'TIMEOUT'],
  ['ABORT_ERR', 'TIMEOUT'],
  ['ENOTFOUND', 'DNS'],
  ['EAI_AGAIN', 'DNS'],
  ['ECONNREFUSED', 'CONNECTION_REFUSED'],
  ['ECONNRESET', 'CONNECTION_RESET'],
  ['EPIPE', 'CONNECTION_RESET'],
  ['ERR_TLS_CERT_ALTNAME_INVALID', 'TLS'],
  ['DEPTH_ZERO_SELF_SIGNED_CERT', 'TLS'],
  ['SELF_SIGNED_CERT_IN_CHAIN', 'TLS'],
  ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'TLS'],
  ['CERT_HAS_EXPIRED', 'TLS'],
  ['ENOENT', 'EXECUTABLE_NOT_FOUND'],
  ['EACCES', 'FILESYSTEM_PERMISSION'],
  ['EPERM', 'FILESYSTEM_PERMISSION'],
  ['ERR_CHILD_PROCESS_STDIO_MAXBUFFER', 'OUTPUT_BUFFER'],
  ['ENOMEM', 'RESOURCE_EXHAUSTED'],
]);

const knownCode = error => {
  const match = String(error?.message ?? '').match(/^(AUTHENTICATED_HOSTED_[A-Z0-9_]{1,120})/u);
  return match?.[1] ?? null;
};

export const authenticatedHostedFailureCode = error =>
  knownCode(error) ?? 'AUTHENTICATED_HOSTED_RUNNER_FAILED';

const errorChain = error => {
  const chain = [];
  let current = error;
  while (current && chain.length < 3) {
    chain.push(current);
    current = current.cause;
  }
  return chain;
};

const categoryFor = (error, source) => {
  const chain = errorChain(error);
  for (const item of chain) {
    const code = typeof item?.code === 'string' ? item.code.toUpperCase() : '';
    if (SQLSTATE_CATEGORIES.has(code)) return SQLSTATE_CATEGORIES.get(code);
    if (NODE_CATEGORIES.has(code)) return NODE_CATEGORIES.get(code);
    if (item?.name === 'AbortError' || item?.name === 'TimeoutError') return 'TIMEOUT';
  }
  return 'UNCLASSIFIED';
};

export async function withAuthenticatedHostedDiagnostic(stage, operation, { source = 'runtime' } = {}) {
  if (!STAGES.has(stage) || source !== 'runtime' || typeof operation !== 'function') {
    throw new Error('AUTHENTICATED_HOSTED_RUNNER_DIAGNOSTIC_INPUT_REJECTED');
  }
  try {
    return await operation();
  } catch (error) {
    const preserved = knownCode(error);
    if (preserved) throw new Error(preserved);
    throw new Error(`AUTHENTICATED_HOSTED_RUNNER_DIAGNOSTIC_${stage}_${categoryFor(error, source)}`);
  }
}
