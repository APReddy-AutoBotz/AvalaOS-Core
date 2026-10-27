import { createHash, randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { validatePreactivationSignInRequestCorrelation } from './preactivationSignInRequestCorrelation.mjs';

export const PREACTIVATION_SIGN_IN_SCHEMA = 'preactivation-sign-in-diagnostic-v2';
export const PREACTIVATION_SIGN_IN_CHILD_SCHEMA = 'preactivation-sign-in-playwright-diagnostic-v2';
export const PREACTIVATION_SIGN_IN_SUMMARY_SCHEMA = 'preactivation-sign-in-playwright-summary-v1';
export const PREACTIVATION_SIGN_IN_RELATIVE_PATH =
  'output/acceptance/authenticated-product/preactivation-sign-in-diagnostic.json';
export const PREACTIVATION_SIGN_IN_PRIVATE_DIRECTORY =
  'output/acceptance/authenticated-product/preactivation-sign-in-diagnostics';
export const PREACTIVATION_SIGN_IN_PARENT_BYTE_CAP = 65_536;
export const PREACTIVATION_SIGN_IN_CHILD_BYTE_CAP = 4_096;
export const PREACTIVATION_SIGN_IN_COMMAND = 'node scripts/testAuthenticatedHostedSignInEntry.mjs';

export const PREACTIVATION_SIGN_IN_PHASES = Object.freeze([
  'session-persistence', 'entry', 'assessment-negatives', 'assessment-positives', 'safety',
]);
export const PREACTIVATION_SIGN_IN_STAGES = Object.freeze([
  'setup', 'build', 'preview', 'tls', 'browser', 'cleanup',
]);
export const PREACTIVATION_SIGN_IN_PROJECTS = Object.freeze([
  'desktop-chromium', 'pixel-7-chromium', 'unknown',
]);
export const PREACTIVATION_SIGN_IN_TEST_CATEGORIES = Object.freeze([
  'anonymous-admission', 'authenticated-sign-in', 'unknown',
]);
export const PREACTIVATION_SIGN_IN_TEST_TITLES = Object.freeze(new Map([
  ['anonymous business actions retain their rejected admission inside an isolated network lifecycle',
    'anonymous-admission'],
  ['actual application uses the shared real-auth helper for rejected, cold and cached sign-in',
    'authenticated-sign-in'],
]));

const baselineSources = [
  'scripts/testAuthenticatedHostedSignInEntry.mjs',
  'tests/browser/authenticatedHostedSignInEntry.spec.ts',
  'playwright.authenticated-hosted-sign-in-entry.config.ts',
  'vite.authenticated-hosted-sign-in-entry.config.ts',
  'tests/browser/authenticatedLifecycleHarness.ts',
  'tests/browser/authenticatedHostedNetwork.ts',
  'tests/browser/enterpriseLifecycleAcceptance/v1AssessmentCompletion.ts',
  'scripts/authenticatedHostedController.mjs',
  'scripts/authenticatedHostedBrowserRequestClassifier.mjs',
  'scripts/authenticatedHostedFixtureIdentity.mjs',
  'scripts/enterpriseLifecyclePostgresFixture.mjs',
  'components/auth/EnterpriseAccessView.tsx',
  'components/auth/AuthProvider.tsx',
  'services/adapters/authAdapter.ts',
  'services/supabaseClient.ts',
  'package.json',
  'package-lock.json',
  '.github/workflows/authenticated-product-acceptance.yml',
];
export const PREACTIVATION_SIGN_IN_SOURCE_PATHS = Object.freeze([
  ...baselineSources,
  'scripts/preactivationSignInDiagnostics.mjs',
  'scripts/preactivationSignInPlaywrightReporter.mjs',
  'scripts/preactivationSignInRequestCorrelation.mjs',
  'scripts/verifyPreactivationSignInDiagnostics.mjs',
]);

const identityKeys = ['headSha', 'runId', 'runAttempt', 'workflow', 'logicalJob', 'command', 'environment', 'nonce'];
const parentKeys = ['schemaVersion', 'identity', 'status', 'currentPhase', 'firstOperationalFailure',
  'phases', 'sourceBindings'];
const phaseKeys = ['phase', 'status', 'childNonce', 'stages', 'cleanup', 'browserDiagnostic',
  'terminalCases', 'durationMs'];
const childKeys = ['schemaVersion', 'identity', 'phase', 'phaseNonce', 'project', 'testCategory',
  'status', 'durationMs', 'failure', 'requestCorrelation'];
const childDetailKeys = ['project', 'testCategory', 'status', 'durationMs', 'failure', 'requestCorrelation'];
const summaryKeys = ['schemaVersion', 'identity', 'phase', 'phaseNonce', 'terminalCases'];
const phaseStates = new Set(['pending', 'running', 'passed', 'failed', 'incomplete']);
const stageStates = new Set(['pending', 'running', 'passed', 'failed', 'not-attempted']);
const cleanupStates = new Set(['unknown', 'not-attempted', 'passed', 'failed']);
const diagnosticStates = new Set(['pending', 'not-applicable', 'available', 'unavailable', 'invalid']);
const diagnosticReasons = new Set([
  'PENDING', 'NOT_APPLICABLE', 'CAPTURED', 'MISSING', 'MALFORMED', 'OVERSIZE', 'SYMLINK',
  'SCHEMA', 'IDENTITY', 'NONCE', 'PHASE', 'UNEXPECTED',
]);
const failureCodes = new Set([
  'SETUP_FAILED', 'BUILD_FAILED', 'PREVIEW_FAILED', 'TLS_FAILED', 'BROWSER_FAILED',
  'CLEANUP_FAILED', 'CHECKOUT_CHANGED', 'DIAGNOSTIC_WRITE_FAILED', 'UNKNOWN_FAILURE',
]);
const childFailureCodes = new Set([
  'TEST_TIMEOUT', 'CONTROL_TIMEOUT', 'SESSION_REQUIRED', 'SESSION_REJECTED',
  'IDENTITY_TRANSPORT', 'IDENTITY_REJECTED', 'V1_COMPLETION_TIMEOUT', 'PROCESS_AMBIGUOUS',
  'PROCESS_AUTHORITY_REJECTED', 'CONTROL_REJECTED', 'REDACTED',
]);
const requestCorrelationStates = new Set(['not-applicable', 'available', 'unavailable', 'invalid']);
const requestCorrelationReasons = new Set([
  'NOT_APPLICABLE', 'CAPTURED', 'MISSING', 'DUPLICATE', 'SCHEMA', 'AMBIGUOUS',
]);
const locationSources = new Set([
  'tests/browser/authenticatedHostedSignInEntry.spec.ts',
  'tests/browser/authenticatedLifecycleHarness.ts',
  'tests/browser/authenticatedHostedNetwork.ts',
  'tests/browser/enterpriseLifecycleAcceptance/v1AssessmentCompletion.ts',
]);
const noncePattern = /^[a-f0-9]{64}$/u;
const shaPattern = /^sha256:[a-f0-9]{64}$/u;
const headPattern = /^[a-f0-9]{40}$/u;
const positiveIntegerPattern = /^[1-9][0-9]{0,19}$/u;

const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
const normalizeText = value => value.replace(/\r\n?/gu, '\n');
const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const boundedDuration = value => Number.isInteger(value) && value >= 0 && value <= 3_600_000;
const clone = value => structuredClone(value);

export const preactivationSignInDiagnosticPaths = (workspaceRoot = process.cwd(), phase = null) => {
  const root = path.resolve(workspaceRoot);
  const privateRoot = path.resolve(root, PREACTIVATION_SIGN_IN_PRIVATE_DIRECTORY);
  const phaseRoot = phase && PREACTIVATION_SIGN_IN_PHASES.includes(phase)
    ? path.resolve(privateRoot, phase) : null;
  return Object.freeze({
    workspaceRoot: root,
    parentPath: path.resolve(root, PREACTIVATION_SIGN_IN_RELATIVE_PATH),
    privateRoot,
    phaseRoot,
    childPath: phaseRoot ? path.resolve(phaseRoot, 'playwright-child.json') : null,
    summaryPath: phaseRoot ? path.resolve(phaseRoot, 'playwright-summary.json') : null,
  });
};

const isWithin = (root, candidate) => candidate === root || candidate.startsWith(`${root}${path.sep}`);
const ensureOwnedDirectory = async directory => {
  await mkdir(directory, { recursive: true });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(directory) !== path.resolve(directory)) {
    throw new Error('PREACTIVATION_SIGN_IN_DIAGNOSTIC_DIRECTORY_REJECTED');
  }
};

export const atomicWritePreactivationSignInJson = async (destination, value, ownedDirectory,
  { compact = false, maxBytes = PREACTIVATION_SIGN_IN_PARENT_BYTE_CAP, replace = true } = {}) => {
  const target = path.resolve(destination);
  const root = path.resolve(ownedDirectory);
  if (!isWithin(root, target)) throw new Error('PREACTIVATION_SIGN_IN_DIAGNOSTIC_PATH_REJECTED');
  await ensureOwnedDirectory(root);
  let existing = null;
  try { existing = await lstat(target); } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (existing?.isSymbolicLink() || (existing && !existing.isFile())) {
    throw new Error('PREACTIVATION_SIGN_IN_DIAGNOSTIC_PATH_REJECTED');
  }
  if (existing && !replace) throw new Error('PREACTIVATION_SIGN_IN_DIAGNOSTIC_STALE_OUTPUT');
  const serialized = compact ? `${JSON.stringify(value)}\n` : `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw new Error('PREACTIVATION_SIGN_IN_DIAGNOSTIC_OVERSIZE');
  }
  const temporary = path.join(root,
    `.preactivation-sign-in-${process.pid}-${randomBytes(8).toString('hex')}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(serialized, 'utf8'); await handle.sync(); } finally { await handle.close(); }
  try { await rename(temporary, target); } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
};

export const resolvePreactivationSignInIdentity = (environment = process.env,
  nonce = randomBytes(32).toString('hex')) => {
  if (!noncePattern.test(nonce)) throw new Error('PREACTIVATION_SIGN_IN_DIAGNOSTIC_NONCE_REJECTED');
  if (environment.GITHUB_ACTIONS === 'true') {
    const headSha = environment.RELEASE_SHA ?? '';
    if (!headPattern.test(headSha) || !positiveIntegerPattern.test(environment.GITHUB_RUN_ID ?? '')
      || !positiveIntegerPattern.test(environment.GITHUB_RUN_ATTEMPT ?? '')
      || environment.GITHUB_WORKFLOW !== 'Authenticated Product Acceptance Preparation'
      || environment.GITHUB_JOB !== 'preactivation-checkout') {
      throw new Error('PREACTIVATION_SIGN_IN_DIAGNOSTIC_CI_IDENTITY_REJECTED');
    }
    return Object.freeze({ headSha, runId: environment.GITHUB_RUN_ID,
      runAttempt: environment.GITHUB_RUN_ATTEMPT, workflow: 'authenticated-product-acceptance',
      logicalJob: 'preactivation-checkout', command: PREACTIVATION_SIGN_IN_COMMAND, environment: 'ci', nonce });
  }
  return Object.freeze({ headSha: 'local-working-tree', runId: `local-${process.pid}`, runAttempt: '1',
    workflow: 'local', logicalJob: 'local', command: PREACTIVATION_SIGN_IN_COMMAND,
    environment: 'local', nonce });
};

export const validatePreactivationSignInIdentity = identity => exactKeys(identity, identityKeys)
  && identityKeys.every(key => typeof identity[key] === 'string')
  && ['ci', 'local'].includes(identity.environment)
  && (identity.environment === 'ci' ? headPattern.test(identity.headSha)
    && positiveIntegerPattern.test(identity.runId) && positiveIntegerPattern.test(identity.runAttempt)
    && identity.workflow === 'authenticated-product-acceptance'
    && identity.logicalJob === 'preactivation-checkout'
    : identity.headSha === 'local-working-tree' && /^local-[1-9][0-9]*$/u.test(identity.runId)
      && identity.runAttempt === '1' && identity.workflow === 'local' && identity.logicalJob === 'local')
  && identity.command === PREACTIVATION_SIGN_IN_COMMAND && noncePattern.test(identity.nonce);

export const preactivationSignInSourceBindings = async (workspaceRoot = process.cwd()) => Promise.all(
  PREACTIVATION_SIGN_IN_SOURCE_PATHS.map(async source => ({ source,
    sha256: sha256(normalizeText(await readFile(path.resolve(workspaceRoot, source), 'utf8'))) })),
);
const validateSourceBindings = value => Array.isArray(value)
  && value.length === PREACTIVATION_SIGN_IN_SOURCE_PATHS.length
  && value.every((item, index) => exactKeys(item, ['source', 'sha256'])
    && item.source === PREACTIVATION_SIGN_IN_SOURCE_PATHS[index] && shaPattern.test(item.sha256));

const validateLocation = value => exactKeys(value, ['source', 'line'])
  && locationSources.has(value.source) && Number.isInteger(value.line)
  && value.line >= 1 && value.line <= 200_000;
const validateRequestCorrelation = value => exactKeys(value, ['state', 'reason', 'detail'])
  && requestCorrelationStates.has(value.state) && requestCorrelationReasons.has(value.reason)
  && (value.state === 'available'
    ? value.reason === 'CAPTURED' && validatePreactivationSignInRequestCorrelation(value.detail) !== null
    : value.detail === null)
  && (value.state === 'not-applicable') === (value.reason === 'NOT_APPLICABLE')
  && (value.state === 'unavailable') === (value.reason === 'MISSING')
  && (value.state === 'invalid') === ['DUPLICATE', 'SCHEMA', 'AMBIGUOUS'].includes(value.reason);
const validateRequestCorrelationContext = (phase, project, testCategory, requestCorrelation) => {
  const targeted = phase === 'entry' && testCategory === 'authenticated-sign-in';
  if (!targeted) return requestCorrelation.state === 'not-applicable';
  if (project === 'unknown') {
    return requestCorrelation.state === 'invalid' && requestCorrelation.reason === 'AMBIGUOUS';
  }
  return requestCorrelation.state !== 'not-applicable';
};
export const validatePreactivationSignInChild = value => {
  if (!exactKeys(value, childKeys) || value.schemaVersion !== PREACTIVATION_SIGN_IN_CHILD_SCHEMA
    || !validatePreactivationSignInIdentity(value.identity)
    || !PREACTIVATION_SIGN_IN_PHASES.includes(value.phase) || !noncePattern.test(value.phaseNonce)
    || !PREACTIVATION_SIGN_IN_PROJECTS.includes(value.project)
    || !PREACTIVATION_SIGN_IN_TEST_CATEGORIES.includes(value.testCategory)
    || !['failed', 'timedOut'].includes(value.status) || !boundedDuration(value.durationMs)
    || !exactKeys(value.failure, value.failure?.location === undefined ? ['code'] : ['code', 'location'])
    || !childFailureCodes.has(value.failure.code)
    || (value.failure.location !== undefined && !validateLocation(value.failure.location))
    || !validateRequestCorrelation(value.requestCorrelation)
    || !validateRequestCorrelationContext(value.phase, value.project, value.testCategory,
      value.requestCorrelation)) return null;
  return value;
};

const validateChildDetail = (value, phase) => exactKeys(value, childDetailKeys)
  && PREACTIVATION_SIGN_IN_PROJECTS.includes(value.project)
  && PREACTIVATION_SIGN_IN_TEST_CATEGORIES.includes(value.testCategory)
  && ['failed', 'timedOut'].includes(value.status) && boundedDuration(value.durationMs)
  && exactKeys(value.failure, value.failure?.location === undefined ? ['code'] : ['code', 'location'])
  && childFailureCodes.has(value.failure.code)
  && (value.failure.location === undefined || validateLocation(value.failure.location))
  && validateRequestCorrelation(value.requestCorrelation)
  && validateRequestCorrelationContext(phase, value.project, value.testCategory, value.requestCorrelation);

const terminalCaseKeys = ['total', 'passed', 'failed', 'timedOut', 'skipped', 'interrupted'];
const validateTerminalCases = value => exactKeys(value, terminalCaseKeys)
  && terminalCaseKeys.every(key => Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= 16)
  && value.total === value.passed + value.failed + value.timedOut + value.skipped + value.interrupted;
export const validatePreactivationSignInSummary = value => exactKeys(value, summaryKeys)
  && value.schemaVersion === PREACTIVATION_SIGN_IN_SUMMARY_SCHEMA
  && validatePreactivationSignInIdentity(value.identity)
  && PREACTIVATION_SIGN_IN_PHASES.includes(value.phase) && noncePattern.test(value.phaseNonce)
  && validateTerminalCases(value.terminalCases) ? value : null;

const validateFailure = value => value === null || (exactKeys(value, ['phase', 'stage', 'code'])
  && [...PREACTIVATION_SIGN_IN_PHASES, 'run'].includes(value.phase)
  && [...PREACTIVATION_SIGN_IN_STAGES, 'checkout'].includes(value.stage)
  && failureCodes.has(value.code));
const validateStage = value => exactKeys(value, ['state', 'durationMs'])
  && stageStates.has(value.state) && boundedDuration(value.durationMs);
const validatePhase = value => {
  if (!exactKeys(value, phaseKeys) || !PREACTIVATION_SIGN_IN_PHASES.includes(value.phase)
    || !phaseStates.has(value.status) || !(value.childNonce === null || noncePattern.test(value.childNonce))
    || !exactKeys(value.stages, PREACTIVATION_SIGN_IN_STAGES)
    || !PREACTIVATION_SIGN_IN_STAGES.every(stage => validateStage(value.stages[stage]))
    || !exactKeys(value.cleanup, ['preview', 'fixture', 'tls', 'temporary'])
    || !Object.values(value.cleanup).every(state => cleanupStates.has(state))
    || !exactKeys(value.browserDiagnostic, ['state', 'reason', 'detail'])
    || !diagnosticStates.has(value.browserDiagnostic.state)
    || !diagnosticReasons.has(value.browserDiagnostic.reason)
    || (value.browserDiagnostic.state === 'available'
      ? !validateChildDetail(value.browserDiagnostic.detail, value.phase) : value.browserDiagnostic.detail !== null)
    || !validateTerminalCases(value.terminalCases)
    || !boundedDuration(value.durationMs)) return false;
  if (value.status === 'pending') return value.childNonce === null && value.durationMs === 0
    && Object.values(value.stages).every(stage => stage.state === 'pending' && stage.durationMs === 0)
    && Object.values(value.cleanup).every(state => state === 'not-attempted')
    && value.browserDiagnostic.state === 'pending' && value.terminalCases.total === 0;
  if (value.status === 'passed') return value.childNonce !== null
    && Object.values(value.stages).every(stage => stage.state === 'passed')
    && Object.values(value.cleanup).every(state => state === 'passed')
    && value.browserDiagnostic.state === 'not-applicable'
    && value.terminalCases.total === 4 && value.terminalCases.passed === 4;
  if (['failed', 'incomplete'].includes(value.status)) return value.childNonce !== null;
  return true;
};

const validateTerminalPhase = value => {
  if (['pending', 'passed'].includes(value.status)) return true;
  const cleanupSafe = Object.values(value.cleanup).every(state => ['passed', 'not-attempted'].includes(state));
  if (value.status === 'failed') return cleanupSafe && value.stages.cleanup.state === 'passed'
    && (value.stages.browser.state !== 'failed' || value.browserDiagnostic.state === 'available');
  return !cleanupSafe || value.browserDiagnostic.state === 'invalid'
    || (value.stages.browser.state === 'failed' && value.browserDiagnostic.state !== 'available')
    || (value.browserDiagnostic.state === 'available'
      && value.phase === 'entry'
      && value.browserDiagnostic.detail.testCategory === 'authenticated-sign-in'
      && (value.browserDiagnostic.detail.requestCorrelation.state !== 'available'
        || value.browserDiagnostic.detail.requestCorrelation.detail.state !== 'captured'))
    || (['passed', 'failed'].includes(value.stages.browser.state) && value.terminalCases.total === 0);
};

export const validatePreactivationSignInParent = value => {
  if (!exactKeys(value, parentKeys) || value.schemaVersion !== PREACTIVATION_SIGN_IN_SCHEMA
    || !validatePreactivationSignInIdentity(value.identity)
    || !['running', 'passed', 'failed', 'incomplete'].includes(value.status)
    || !(value.currentPhase === null || PREACTIVATION_SIGN_IN_PHASES.includes(value.currentPhase))
    || !validateFailure(value.firstOperationalFailure)
    || !Array.isArray(value.phases) || value.phases.length !== PREACTIVATION_SIGN_IN_PHASES.length
    || !value.phases.every((phase, index) => phase.phase === PREACTIVATION_SIGN_IN_PHASES[index]
      && validatePhase(phase))
    || !validateSourceBindings(value.sourceBindings)) return null;
  if (value.status === 'passed' && (value.firstOperationalFailure !== null
    || value.currentPhase !== null || value.phases.some(phase => phase.status !== 'passed'))) return null;
  if (['failed', 'incomplete'].includes(value.status) && value.firstOperationalFailure === null) return null;
  if (value.status === 'failed' && value.phases.some(phase => phase.status === 'incomplete')) return null;
  if (value.status !== 'running' && (value.currentPhase !== null
    || !value.phases.every(validateTerminalPhase))) return null;
  return value;
};

const readBoundedJson = async (filePath, byteCap) => {
  let before;
  try { before = await lstat(filePath, { bigint: true }); } catch (error) {
    return error?.code === 'ENOENT' ? { state: 'unavailable', reason: 'MISSING' }
      : { state: 'invalid', reason: 'MALFORMED' };
  }
  if (before.isSymbolicLink() || !before.isFile()) return { state: 'invalid', reason: 'SYMLINK' };
  if (before.size > BigInt(byteCap)) return { state: 'invalid', reason: 'OVERSIZE' };
  let handle;
  try { handle = await open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)); } catch {
    return { state: 'invalid', reason: 'SYMLINK' };
  }
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || opened.size > BigInt(byteCap)) return { state: 'invalid', reason: 'OVERSIZE' };
    const buffer = Buffer.alloc(byteCap + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > byteCap) return { state: 'invalid', reason: 'OVERSIZE' };
    const after = await lstat(filePath, { bigint: true });
    if (after.isSymbolicLink() || opened.dev !== before.dev || opened.ino !== before.ino
      || after.dev !== before.dev || after.ino !== before.ino || opened.size !== before.size
      || after.size !== before.size || opened.mtimeNs !== before.mtimeNs || after.mtimeNs !== before.mtimeNs) {
      return { state: 'invalid', reason: 'MALFORMED' };
    }
    return { state: 'available', reason: 'CAPTURED', value: JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')) };
  } catch { return { state: 'invalid', reason: 'MALFORMED' }; } finally { await handle.close(); }
};

export const writePreactivationSignInChild = async (value, options = {}) => {
  const child = validatePreactivationSignInChild(value);
  if (!child) throw new Error('PREACTIVATION_SIGN_IN_CHILD_REJECTED');
  const paths = preactivationSignInDiagnosticPaths(options.workspaceRoot, child.phase);
  await atomicWritePreactivationSignInJson(paths.childPath, child, paths.phaseRoot,
    { compact: true, maxBytes: PREACTIVATION_SIGN_IN_CHILD_BYTE_CAP, replace: false });
};

export const writePreactivationSignInSummary = async (value, options = {}) => {
  const summary = validatePreactivationSignInSummary(value);
  if (!summary) throw new Error('PREACTIVATION_SIGN_IN_SUMMARY_REJECTED');
  const paths = preactivationSignInDiagnosticPaths(options.workspaceRoot, summary.phase);
  await atomicWritePreactivationSignInJson(paths.summaryPath, summary, paths.phaseRoot,
    { compact: true, maxBytes: PREACTIVATION_SIGN_IN_CHILD_BYTE_CAP, replace: false });
};

export const readPreactivationSignInChild = async (expectedIdentity, phase, phaseNonce, options = {}) => {
  const paths = preactivationSignInDiagnosticPaths(options.workspaceRoot, phase);
  const result = await readBoundedJson(paths.childPath, PREACTIVATION_SIGN_IN_CHILD_BYTE_CAP);
  if (result.state !== 'available') return result;
  const child = validatePreactivationSignInChild(result.value);
  if (!child) return { state: 'invalid', reason: 'SCHEMA' };
  if (identityKeys.some(key => child.identity[key] !== expectedIdentity[key])) {
    return { state: 'invalid', reason: 'IDENTITY' };
  }
  if (child.phase !== phase) return { state: 'invalid', reason: 'PHASE' };
  if (child.phaseNonce !== phaseNonce) return { state: 'invalid', reason: 'NONCE' };
  return { state: 'available', reason: 'CAPTURED', child };
};

export const readPreactivationSignInSummary = async (expectedIdentity, phase, phaseNonce, options = {}) => {
  const paths = preactivationSignInDiagnosticPaths(options.workspaceRoot, phase);
  const result = await readBoundedJson(paths.summaryPath, PREACTIVATION_SIGN_IN_CHILD_BYTE_CAP);
  if (result.state !== 'available') return result;
  const summary = validatePreactivationSignInSummary(result.value);
  if (!summary) return { state: 'invalid', reason: 'SCHEMA' };
  if (identityKeys.some(key => summary.identity[key] !== expectedIdentity[key])) {
    return { state: 'invalid', reason: 'IDENTITY' };
  }
  if (summary.phase !== phase) return { state: 'invalid', reason: 'PHASE' };
  if (summary.phaseNonce !== phaseNonce) return { state: 'invalid', reason: 'NONCE' };
  return { state: 'available', reason: 'CAPTURED', summary };
};

const initialStage = () => ({ state: 'pending', durationMs: 0 });
const initialPhase = phase => ({ phase, status: 'pending', childNonce: null,
  stages: Object.fromEntries(PREACTIVATION_SIGN_IN_STAGES.map(stage => [stage, initialStage()])),
  cleanup: { preview: 'not-attempted', fixture: 'not-attempted', tls: 'not-attempted', temporary: 'not-attempted' },
  browserDiagnostic: { state: 'pending', reason: 'PENDING', detail: null },
  terminalCases: { total: 0, passed: 0, failed: 0, timedOut: 0, skipped: 0, interrupted: 0 },
  durationMs: 0 });

export const preactivationSignInParentFailureCode = stage => ({
  setup: 'SETUP_FAILED', build: 'BUILD_FAILED', preview: 'PREVIEW_FAILED', tls: 'TLS_FAILED',
  browser: 'BROWSER_FAILED', cleanup: 'CLEANUP_FAILED', checkout: 'CHECKOUT_CHANGED',
}[stage] ?? 'UNKNOWN_FAILURE');

export const createPreactivationSignInDiagnosticSession = async (options = {}) => {
  const workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd());
  const identity = options.identity ?? resolvePreactivationSignInIdentity(options.environment ?? process.env);
  if (!validatePreactivationSignInIdentity(identity)) throw new Error('PREACTIVATION_SIGN_IN_IDENTITY_REJECTED');
  const paths = preactivationSignInDiagnosticPaths(workspaceRoot);
  for (const stale of [paths.parentPath, paths.privateRoot]) {
    const exists = await lstat(stale).then(() => true, error => error?.code === 'ENOENT' ? false : Promise.reject(error));
    if (exists) throw new Error('PREACTIVATION_SIGN_IN_DIAGNOSTIC_STALE_OUTPUT');
  }
  const parent = { schemaVersion: PREACTIVATION_SIGN_IN_SCHEMA, identity, status: 'running', currentPhase: null,
    firstOperationalFailure: null, phases: PREACTIVATION_SIGN_IN_PHASES.map(initialPhase),
    sourceBindings: options.sourceBindings ?? await preactivationSignInSourceBindings(workspaceRoot) };
  const parentDirectory = path.dirname(paths.parentPath);
  const write = async (replace = true) => {
    if (!validatePreactivationSignInParent(parent)) throw new Error('PREACTIVATION_SIGN_IN_PARENT_REJECTED');
    await atomicWritePreactivationSignInJson(paths.parentPath, parent, parentDirectory,
      { maxBytes: PREACTIVATION_SIGN_IN_PARENT_BYTE_CAP, replace });
  };
  await write(false);
  const phaseEntry = phase => {
    const entry = parent.phases.find(candidate => candidate.phase === phase);
    if (!entry) throw new Error('PREACTIVATION_SIGN_IN_PHASE_REJECTED');
    return entry;
  };
  const started = new Map();
  const stageStarted = new Map();
  return Object.freeze({
    identity,
    workspaceRoot,
    snapshot: () => clone(parent),
    async startPhase(phase) {
      const entry = phaseEntry(phase);
      if (entry.status !== 'pending') throw new Error('PREACTIVATION_SIGN_IN_PHASE_STATE_REJECTED');
      parent.currentPhase = phase; entry.status = 'running'; entry.childNonce = randomBytes(32).toString('hex');
      started.set(phase, Date.now()); await write(); return entry.childNonce;
    },
    async startStage(phase, stage) {
      const entry = phaseEntry(phase);
      if (!['running', 'failed', 'incomplete'].includes(entry.status)
        || !PREACTIVATION_SIGN_IN_STAGES.includes(stage)
        || entry.stages[stage].state !== 'pending') throw new Error('PREACTIVATION_SIGN_IN_STAGE_STATE_REJECTED');
      entry.stages[stage].state = 'running'; stageStarted.set(`${phase}:${stage}`, Date.now()); await write();
    },
    async finishStage(phase, stage, state = 'passed') {
      const entry = phaseEntry(phase);
      if (!['passed', 'failed', 'not-attempted'].includes(state)
        || !['running', 'pending'].includes(entry.stages[stage]?.state)) {
        throw new Error('PREACTIVATION_SIGN_IN_STAGE_STATE_REJECTED');
      }
      entry.stages[stage] = { state,
        durationMs: Math.min(3_600_000, Math.max(0, Date.now() - (stageStarted.get(`${phase}:${stage}`) ?? Date.now()))) };
      await write();
    },
    async recordFailure(phase, stage, code = preactivationSignInParentFailureCode(stage)) {
      if (!parent.firstOperationalFailure) parent.firstOperationalFailure = { phase, stage, code };
      const entry = phase === 'run' ? null : phaseEntry(phase);
      if (entry) {
        entry.status = 'failed';
        if (entry.stages[stage]?.state === 'running') entry.stages[stage].state = 'failed';
      }
      await write();
    },
    async observeBrowserChild(phase, expected) {
      const entry = phaseEntry(phase);
      const [result, summaryResult] = await Promise.all([
        readPreactivationSignInChild(identity, phase, entry.childNonce, { workspaceRoot }),
        readPreactivationSignInSummary(identity, phase, entry.childNonce, { workspaceRoot }),
      ]);
      const browserAttempted = ['passed', 'failed'].includes(entry.stages.browser.state);
      if (summaryResult.state === 'available') {
        entry.terminalCases = summaryResult.summary.terminalCases;
        if (!browserAttempted) entry.status = 'incomplete';
      } else if (browserAttempted) entry.status = 'incomplete';
      if (!expected && result.state === 'unavailable') {
        entry.browserDiagnostic = { state: 'not-applicable', reason: 'NOT_APPLICABLE', detail: null };
      } else if (!expected) {
        entry.browserDiagnostic = { state: 'invalid', reason: 'UNEXPECTED', detail: null };
        entry.status = 'incomplete';
      } else {
        entry.browserDiagnostic = { state: result.state, reason: result.reason,
          detail: result.state === 'available' ? {
            project: result.child.project, testCategory: result.child.testCategory,
            status: result.child.status, durationMs: result.child.durationMs,
            failure: clone(result.child.failure),
            requestCorrelation: clone(result.child.requestCorrelation),
          } : null };
        if (result.state !== 'available'
          || (phase === 'entry' && result.child.testCategory === 'authenticated-sign-in'
            && (result.child.requestCorrelation.state !== 'available'
              || result.child.requestCorrelation.detail.state !== 'captured'))) entry.status = 'incomplete';
      }
      if (entry.stages.browser.state === 'passed'
        && (entry.terminalCases.total !== 4 || entry.terminalCases.passed !== 4)) entry.status = 'incomplete';
      await write(); return result;
    },
    async setCleanup(phase, resource, state) {
      const entry = phaseEntry(phase);
      if (!Object.hasOwn(entry.cleanup, resource) || !cleanupStates.has(state)) {
        throw new Error('PREACTIVATION_SIGN_IN_CLEANUP_STATE_REJECTED');
      }
      entry.cleanup[resource] = state; await write();
    },
    async finishPhase(phase) {
      const entry = phaseEntry(phase);
      entry.durationMs = Math.min(3_600_000, Math.max(0, Date.now() - (started.get(phase) ?? Date.now())));
      const cleanupSafe = Object.values(entry.cleanup).every(state => ['passed', 'not-attempted'].includes(state));
      if (!cleanupSafe || entry.browserDiagnostic.state === 'invalid'
        || (entry.stages.browser.state === 'failed' && entry.browserDiagnostic.state !== 'available')) {
        entry.status = 'incomplete';
      } else if (entry.status === 'running') entry.status = 'passed';
      parent.currentPhase = null; await write(); return clone(entry);
    },
    async finalize() {
      const incomplete = parent.phases.some(phase => phase.status === 'incomplete');
      if (parent.firstOperationalFailure) parent.status = incomplete ? 'incomplete' : 'failed';
      else if (parent.phases.every(phase => phase.status === 'passed')) parent.status = 'passed';
      else {
        parent.firstOperationalFailure = { phase: 'run', stage: 'checkout', code: 'DIAGNOSTIC_WRITE_FAILED' };
        parent.status = 'incomplete';
      }
      parent.currentPhase = null; await write(); return clone(parent);
    },
  });
};

export const readPreactivationSignInParent = async (workspaceRoot = process.cwd()) => {
  const paths = preactivationSignInDiagnosticPaths(workspaceRoot);
  const result = await readBoundedJson(paths.parentPath, PREACTIVATION_SIGN_IN_PARENT_BYTE_CAP);
  if (result.state !== 'available') return result;
  const parent = validatePreactivationSignInParent(result.value);
  return parent ? { state: 'available', reason: 'CAPTURED', parent }
    : { state: 'invalid', reason: 'SCHEMA' };
};
