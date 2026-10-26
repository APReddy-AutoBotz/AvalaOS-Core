import { createHash, randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';

export const CONNECTED_BROWSER_DIAGNOSTIC_SCHEMA = 'connected-browser-diagnostic-v1';
export const CONNECTED_BROWSER_CHILD_SCHEMA = 'connected-browser-playwright-diagnostic-v1';
export const CONNECTED_BROWSER_DIAGNOSTIC_RELATIVE_PATH =
  'output/acceptance/authenticated-product/connected-browser-diagnostic.json';
export const CONNECTED_BROWSER_PRIVATE_RELATIVE_DIRECTORY =
  'output/acceptance/authenticated-product/connected-browser-diagnostics';
export const CONNECTED_BROWSER_CHILD_RELATIVE_PATH =
  `${CONNECTED_BROWSER_PRIVATE_RELATIVE_DIRECTORY}/playwright-child.json`;
export const CONNECTED_BROWSER_CHILD_BYTE_CAP = 2_048;
export const CONNECTED_BROWSER_PARENT_BYTE_CAP = 32_768;

export const CONNECTED_BROWSER_PHASES = Object.freeze([
  'initialized', 'fixture', 'build', 'preview', 'browser', 'inventory', 'cleanup',
  'aggregation', 'manifest', 'complete',
]);
export const CONNECTED_BROWSER_OPERATION_PHASES = Object.freeze([
  'fixture', 'build', 'preview', 'browser', 'inventory', 'aggregation', 'manifest',
]);
export const CONNECTED_BROWSER_PROJECTS = Object.freeze(['chromium-desktop', 'chromium-mobile']);
export const CONNECTED_BROWSER_TEST_CATEGORIES = Object.freeze([
  'primary-lifecycle', 'govern-studio-lifecycle', 'independent-rejection',
  'delivery-monitor', 'scoring-policy', 'authenticated-controls',
]);
export const CONNECTED_BROWSER_TEST_TITLES = Object.freeze(new Map([
  ['authors, replays, rejects stale work, requests changes and resubmits through the production UI',
    'primary-lifecycle'],
  ['independent approval, Govern separation and synthetic Studio generation retain exact lineage',
    'govern-studio-lifecycle'],
  ['independent reviewer rejects a separate current decision without mutating the approved primary chain',
    'independent-rejection'],
  ['approved Studio work publishes through legacy Docs and Delivery into read-only Monitor',
    'delivery-monitor'],
  ['production scoring preserves low-suitability and strong-automation decisions through governed publication',
    'scoring-policy'],
  ['authenticated Admin, AI and private Studio controls use server authority and measured storage boundaries',
    'authenticated-controls'],
]));

export const CONNECTED_BROWSER_SOURCE_PATHS = Object.freeze([
  'scripts/runEnterpriseLifecycleAcceptanceBrowser.mjs',
  'playwright.enterprise-lifecycle-acceptance.config.ts',
  'scripts/connectedBrowserDiagnostics.mjs',
  'scripts/connectedBrowserPlaywrightReporter.mjs',
  'scripts/verifyConnectedBrowserDiagnostics.mjs',
  '.github/workflows/authenticated-product-acceptance.yml',
  'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts',
  'tests/browser/authenticatedLifecycleHarness.ts',
  'scripts/enterpriseLifecyclePostgresFixture.mjs',
]);

const identityKeys = Object.freeze([
  'headSha', 'runId', 'runAttempt', 'workflow', 'logicalJob', 'command', 'environment', 'nonce',
]);
const parentKeys = Object.freeze([
  'schemaVersion', 'identity', 'status', 'phase', 'checkpoints', 'failure', 'diagnostic', 'cleanup',
  'sourceBindings',
]);
const childKeys = Object.freeze(['schemaVersion', 'identity', 'project', 'testCategory', 'status', 'failure']);
const checkpointStates = new Set(['pending', 'active', 'passed', 'failed', 'not-attempted']);
const cleanupStates = new Set(['unknown', 'not-attempted', 'passed', 'failed']);
const diagnosticStates = new Set(['available', 'unavailable', 'invalid']);
const diagnosticReasons = new Set([
  'CAPTURED', 'NOT_APPLICABLE', 'MISSING', 'MALFORMED', 'OVERSIZE', 'SYMLINK', 'SCHEMA',
  'IDENTITY', 'NONCE',
]);
const childFailureCodes = new Set([
  'TEST_TIMEOUT', 'CONTROL_TIMEOUT', 'SESSION_REQUIRED', 'IDENTITY_TRANSPORT',
  'V1_COMPLETION_TIMEOUT', 'SHELL_NOT_READY', 'REDACTED',
]);
const parentFailureCodes = new Set([
  'DATABASE_URL_REQUIRED', 'FIXTURE_FAILED', 'BUILD_FAILED', 'PREVIEW_FAILED', 'BROWSER_FAILED',
  'INVENTORY_FAILED', 'AGGREGATION_FAILED', 'MANIFEST_FAILED', 'CLEANUP_FAILED', 'UNKNOWN_FAILURE',
]);
const locationSources = new Set([
  'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts',
  'tests/browser/authenticatedLifecycleHarness.ts',
  'scripts/enterpriseLifecyclePostgresFixture.mjs',
]);
const sha256Pattern = /^sha256:[a-f0-9]{64}$/u;
const noncePattern = /^[a-f0-9]{64}$/u;
const ciShaPattern = /^[a-f0-9]{40}$/u;
const positiveIntegerPattern = /^[1-9][0-9]*$/u;

const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const normalizeText = value => value.replace(/\r\n?/gu, '\n');

export const connectedBrowserDiagnosticPaths = (workspaceRoot = process.cwd()) => {
  const root = path.resolve(workspaceRoot);
  return Object.freeze({
    workspaceRoot: root,
    finalPath: path.resolve(root, CONNECTED_BROWSER_DIAGNOSTIC_RELATIVE_PATH),
    privateRoot: path.resolve(root, CONNECTED_BROWSER_PRIVATE_RELATIVE_DIRECTORY),
    childPath: path.resolve(root, CONNECTED_BROWSER_CHILD_RELATIVE_PATH),
  });
};

const isWithin = (root, candidate) => candidate === root || candidate.startsWith(`${root}${path.sep}`);
const ensureOwnedDirectory = async directory => {
  await mkdir(directory, { recursive: true });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(directory) !== path.resolve(directory)) {
    throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_DIRECTORY_REJECTED');
  }
};

export const atomicWriteConnectedBrowserJson = async (destination, value, ownedDirectory, options = {}) => {
  const target = path.resolve(destination);
  const root = path.resolve(ownedDirectory);
  if (!isWithin(root, target)) throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_PATH_REJECTED');
  await ensureOwnedDirectory(root);
  const serialized = options.compact ? `${JSON.stringify(value)}\n` : `${JSON.stringify(value, null, 2)}\n`;
  if (options.maxBytes !== undefined && Buffer.byteLength(serialized, 'utf8') > options.maxBytes) {
    throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_OVERSIZE');
  }
  const temporary = path.join(root, `.connected-browser-${process.pid}-${randomBytes(8).toString('hex')}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(serialized, 'utf8');
    await handle.sync();
  } finally { await handle.close(); }
  try { await rename(temporary, target); } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
};

export const resolveConnectedBrowserDiagnosticIdentity = (environment = process.env,
  nonce = randomBytes(32).toString('hex')) => {
  const ci = environment.GITHUB_ACTIONS === 'true';
  if (!noncePattern.test(nonce)) throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_NONCE_REJECTED');
  if (ci) {
    const headSha = environment.PILOT_ACCEPTANCE_HEAD ?? environment.GITHUB_SHA ?? '';
    if (!ciShaPattern.test(headSha) || !positiveIntegerPattern.test(environment.GITHUB_RUN_ID ?? '')
      || !positiveIntegerPattern.test(environment.GITHUB_RUN_ATTEMPT ?? '')) {
      throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_CI_IDENTITY_REJECTED');
    }
    const expectedWorkflow = environment.GITHUB_WORKFLOW === 'Authenticated Product Acceptance Preparation';
    const expectedJob = environment.GITHUB_JOB === 'connected-browser';
    return Object.freeze({ headSha, runId: environment.GITHUB_RUN_ID,
      runAttempt: environment.GITHUB_RUN_ATTEMPT,
      workflow: expectedWorkflow ? 'authenticated-product-acceptance' : 'other-ci',
      logicalJob: expectedJob ? 'connected-browser' : 'other-ci',
      command: 'node scripts/runEnterpriseLifecycleAcceptanceBrowser.mjs --authenticated',
      environment: 'ci', nonce });
  }
  const headSha = ciShaPattern.test(environment.PILOT_ACCEPTANCE_HEAD ?? '')
    ? environment.PILOT_ACCEPTANCE_HEAD : 'local-working-tree';
  return Object.freeze({ headSha, runId: `local-${process.pid}`, runAttempt: '1', workflow: 'local',
    logicalJob: 'local', command: 'node scripts/runEnterpriseLifecycleAcceptanceBrowser.mjs --authenticated',
    environment: 'local', nonce });
};

export const validateConnectedBrowserIdentity = identity => exactKeys(identity, identityKeys)
  && identityKeys.every(key => typeof identity[key] === 'string')
  && ['ci', 'local'].includes(identity.environment)
  && (identity.environment === 'ci' ? ciShaPattern.test(identity.headSha) : identity.headSha === 'local-working-tree'
    || ciShaPattern.test(identity.headSha))
  && (identity.environment === 'ci' ? positiveIntegerPattern.test(identity.runId)
    : /^local-[1-9][0-9]*$/u.test(identity.runId))
  && positiveIntegerPattern.test(identity.runAttempt)
  && (identity.environment === 'ci' ? ['authenticated-product-acceptance', 'other-ci'].includes(identity.workflow)
    && ['connected-browser', 'other-ci'].includes(identity.logicalJob)
    : identity.workflow === 'local' && identity.logicalJob === 'local')
  && identity.command === 'node scripts/runEnterpriseLifecycleAcceptanceBrowser.mjs --authenticated'
  && noncePattern.test(identity.nonce);

export const connectedBrowserSourceBindings = async (workspaceRoot = process.cwd()) => Promise.all(
  CONNECTED_BROWSER_SOURCE_PATHS.map(async sourcePath => ({
    path: sourcePath,
    sha256: sha256(normalizeText(await readFile(path.resolve(workspaceRoot, sourcePath), 'utf8'))),
  })),
);
const validateSourceBindings = bindings => Array.isArray(bindings)
  && bindings.length === CONNECTED_BROWSER_SOURCE_PATHS.length
  && bindings.every((binding, index) => exactKeys(binding, ['path', 'sha256'])
    && binding.path === CONNECTED_BROWSER_SOURCE_PATHS[index] && sha256Pattern.test(binding.sha256));

export const validateConnectedBrowserChildDiagnostic = value => {
  if (!exactKeys(value, childKeys) || value.schemaVersion !== CONNECTED_BROWSER_CHILD_SCHEMA
    || !validateConnectedBrowserIdentity(value.identity)
    || !CONNECTED_BROWSER_PROJECTS.includes(value.project)
    || !CONNECTED_BROWSER_TEST_CATEGORIES.includes(value.testCategory)
    || value.status !== 'failed' || !exactKeys(value.failure,
      value.failure?.location === undefined ? ['code'] : ['code', 'location'])
    || !childFailureCodes.has(value.failure.code)) return null;
  if (value.failure.location !== undefined && (!exactKeys(value.failure.location, ['source', 'line'])
    || !locationSources.has(value.failure.location.source)
    || !Number.isInteger(value.failure.location.line) || value.failure.location.line < 1
    || value.failure.location.line > 200_000)) return null;
  return value;
};

export const writeConnectedBrowserChildDiagnostic = async (value, options = {}) => {
  const validated = validateConnectedBrowserChildDiagnostic(value);
  if (!validated) throw new Error('CONNECTED_BROWSER_CHILD_DIAGNOSTIC_REJECTED');
  const paths = connectedBrowserDiagnosticPaths(options.workspaceRoot);
  await atomicWriteConnectedBrowserJson(paths.childPath, validated, paths.privateRoot,
    { compact: true, maxBytes: CONNECTED_BROWSER_CHILD_BYTE_CAP });
};

export const readConnectedBrowserChildDiagnostic = async (expectedIdentity, options = {}) => {
  const paths = connectedBrowserDiagnosticPaths(options.workspaceRoot);
  let before;
  try { before = await lstat(paths.childPath, { bigint: true }); } catch (error) {
    if (error?.code === 'ENOENT') return { state: 'unavailable', reason: 'MISSING' };
    return { state: 'invalid', reason: 'MALFORMED' };
  }
  if (before.isSymbolicLink() || !before.isFile()) return { state: 'invalid', reason: 'SYMLINK' };
  if (before.size > BigInt(CONNECTED_BROWSER_CHILD_BYTE_CAP)) return { state: 'invalid', reason: 'OVERSIZE' };
  let handle;
  try { handle = await open(paths.childPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)); } catch {
    return { state: 'invalid', reason: 'SYMLINK' };
  }
  let value;
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || opened.size > BigInt(CONNECTED_BROWSER_CHILD_BYTE_CAP)) {
      return { state: 'invalid', reason: 'OVERSIZE' };
    }
    const buffer = Buffer.alloc(CONNECTED_BROWSER_CHILD_BYTE_CAP + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > CONNECTED_BROWSER_CHILD_BYTE_CAP) return { state: 'invalid', reason: 'OVERSIZE' };
    const serialized = buffer.subarray(0, bytesRead).toString('utf8');
    const after = await lstat(paths.childPath, { bigint: true });
    const same = !after.isSymbolicLink() && opened.dev === before.dev && opened.ino === before.ino
      && after.dev === before.dev && after.ino === before.ino && opened.size === before.size
      && after.size === before.size && opened.mtimeNs === before.mtimeNs && after.mtimeNs === before.mtimeNs;
    if (!same || Buffer.byteLength(serialized, 'utf8') > CONNECTED_BROWSER_CHILD_BYTE_CAP) {
      return { state: 'invalid', reason: 'MALFORMED' };
    }
    value = JSON.parse(serialized);
  } catch {
    return { state: 'invalid', reason: 'MALFORMED' };
  } finally { await handle.close(); }
  const child = validateConnectedBrowserChildDiagnostic(value);
  if (!child) return { state: 'invalid', reason: 'SCHEMA' };
  if (child.identity.nonce !== expectedIdentity.nonce) return { state: 'invalid', reason: 'NONCE' };
  if (identityKeys.some(key => child.identity[key] !== expectedIdentity[key])) {
    return { state: 'invalid', reason: 'IDENTITY' };
  }
  return { state: 'available', reason: 'CAPTURED', child };
};

const validateCheckpoints = checkpoints => exactKeys(checkpoints, CONNECTED_BROWSER_PHASES)
  && CONNECTED_BROWSER_PHASES.every(phase => checkpointStates.has(checkpoints[phase]));

export const validateConnectedBrowserDiagnostic = value => {
  if (!exactKeys(value, parentKeys) || value.schemaVersion !== CONNECTED_BROWSER_DIAGNOSTIC_SCHEMA
    || !validateConnectedBrowserIdentity(value.identity)
    || !['passed', 'failed', 'incomplete'].includes(value.status)
    || !CONNECTED_BROWSER_PHASES.includes(value.phase) || !validateCheckpoints(value.checkpoints)
    || !exactKeys(value.cleanup, ['preview', 'fixture'])
    || !cleanupStates.has(value.cleanup.preview) || !cleanupStates.has(value.cleanup.fixture)
    || !validateSourceBindings(value.sourceBindings)) return null;
  if (value.failure !== null && (!exactKeys(value.failure, ['phase', 'code'])
    || !CONNECTED_BROWSER_PHASES.includes(value.failure.phase) || !parentFailureCodes.has(value.failure.code))) return null;
  if (value.failure !== null) {
    const expectedCodes = value.failure.phase === 'fixture' ? new Set(['DATABASE_URL_REQUIRED', 'FIXTURE_FAILED'])
      : new Set([phaseFailureCode(value.failure.phase)]);
    if (!expectedCodes.has(value.failure.code) || value.checkpoints[value.failure.phase] !== 'failed') return null;
  }
  const diagnosticChild = value?.diagnostic?.child;
  if (!exactKeys(value.diagnostic, diagnosticChild === undefined
    ? ['state', 'reason'] : ['state', 'reason', 'child'])
    || !diagnosticStates.has(value.diagnostic.state) || !diagnosticReasons.has(value.diagnostic.reason)) return null;
  if (value.diagnostic.state === 'available') {
    if (value.diagnostic.reason !== 'CAPTURED' || !validateConnectedBrowserChildDiagnostic(value.diagnostic.child)) return null;
    if (identityKeys.some(key => value.diagnostic.child.identity[key] !== value.identity[key])) return null;
  } else if (value.diagnostic.child !== undefined || value.diagnostic.reason === 'CAPTURED') return null;
  if (value.phase === 'complete' && value.checkpoints.complete !== 'passed') return null;
  if (value.status === 'passed' && (value.failure !== null
    || value.cleanup.preview !== 'passed' || value.cleanup.fixture !== 'passed'
    || value.diagnostic.state !== 'unavailable' || value.diagnostic.reason !== 'NOT_APPLICABLE'
    || CONNECTED_BROWSER_PHASES.some(phase => value.checkpoints[phase] !== 'passed'))) return null;
  if (value.status !== 'passed' && value.phase === 'complete' && value.failure === null) return null;
  if (value.status === 'failed' && (value.failure === null
    || [value.cleanup.preview, value.cleanup.fixture]
    .some(state => !['passed', 'not-attempted'].includes(state))
    || (value.failure?.phase === 'browser' && value.diagnostic.state !== 'available')
    || (value.failure?.phase !== 'browser' && value.diagnostic.state === 'invalid'))) return null;
  return value;
};

const phaseFailureCode = phase => ({
  fixture: 'FIXTURE_FAILED', build: 'BUILD_FAILED', preview: 'PREVIEW_FAILED', browser: 'BROWSER_FAILED',
  inventory: 'INVENTORY_FAILED', aggregation: 'AGGREGATION_FAILED', manifest: 'MANIFEST_FAILED',
  cleanup: 'CLEANUP_FAILED',
}[phase] ?? 'UNKNOWN_FAILURE');

export class ConnectedBrowserDiagnosticSession {
  constructor({ identity, paths, sourceBindings }) {
    this.identity = identity;
    this.paths = paths;
    this.value = { schemaVersion: CONNECTED_BROWSER_DIAGNOSTIC_SCHEMA, identity, status: 'incomplete',
      phase: 'initialized', checkpoints: Object.fromEntries(CONNECTED_BROWSER_PHASES.map(phase =>
        [phase, phase === 'initialized' ? 'passed' : 'pending'])), failure: null,
      diagnostic: { state: 'unavailable', reason: 'MISSING' },
      cleanup: { preview: 'unknown', fixture: 'unknown' }, sourceBindings };
  }
  async write() {
    if (!validateConnectedBrowserDiagnostic(this.value)) throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_STATE_REJECTED');
    await atomicWriteConnectedBrowserJson(this.paths.finalPath, this.value, path.dirname(this.paths.finalPath),
      { maxBytes: CONNECTED_BROWSER_PARENT_BYTE_CAP });
  }
  async start(phase) {
    if (!CONNECTED_BROWSER_PHASES.includes(phase) || this.value.checkpoints[phase] !== 'pending') {
      throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_PHASE_REJECTED');
    }
    this.value.phase = phase; this.value.checkpoints[phase] = 'active'; await this.write();
  }
  async pass(phase) {
    if (this.value.phase !== phase || this.value.checkpoints[phase] !== 'active') {
      throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_PHASE_REJECTED');
    }
    this.value.checkpoints[phase] = 'passed'; await this.write();
  }
  async fail(phase, code = phaseFailureCode(phase)) {
    if (this.value.checkpoints[phase] === 'active') this.value.checkpoints[phase] = 'failed';
    this.value.phase = phase;
    if (!this.value.failure) this.value.failure = { phase, code };
    await this.write();
  }
  async setCleanup(cleanup) {
    if (!exactKeys(cleanup, ['preview', 'fixture'])
      || !cleanupStates.has(cleanup.preview) || !cleanupStates.has(cleanup.fixture)) {
      throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_CLEANUP_REJECTED');
    }
    this.value.cleanup = cleanup; await this.write();
  }
  async finalize(status) {
    const captured = await readConnectedBrowserChildDiagnostic(this.identity,
      { workspaceRoot: this.paths.workspaceRoot });
    if (status === 'passed' && (captured.state !== 'unavailable' || captured.reason !== 'MISSING')) {
      throw new Error('CONNECTED_BROWSER_UNEXPECTED_CHILD_DIAGNOSTIC');
    }
    this.value.diagnostic = status === 'passed'
      ? { state: 'unavailable', reason: 'NOT_APPLICABLE' } : captured;
    let terminalStatus = status;
    if (status === 'failed' && (captured.state === 'invalid'
      || (this.value.failure?.phase === 'browser' && captured.state !== 'available')
      || [this.value.cleanup.preview, this.value.cleanup.fixture]
        .some(state => !['passed', 'not-attempted'].includes(state)))) terminalStatus = 'incomplete';
    for (const phase of CONNECTED_BROWSER_PHASES) if (['pending', 'active'].includes(this.value.checkpoints[phase])) {
      this.value.checkpoints[phase] = 'not-attempted';
    }
    this.value.phase = 'complete'; this.value.checkpoints.complete = 'passed'; this.value.status = terminalStatus;
    if (!this.value.failure && terminalStatus !== 'passed') {
      this.value.failure = { phase: 'complete', code: 'UNKNOWN_FAILURE' };
    }
    if (!validateConnectedBrowserDiagnostic(this.value)) throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_FINAL_REJECTED');
    await this.write();
    return this.value;
  }
}

export const createConnectedBrowserDiagnosticSession = async (options = {}) => {
  const paths = connectedBrowserDiagnosticPaths(options.workspaceRoot);
  await ensureOwnedDirectory(path.dirname(paths.finalPath));
  await ensureOwnedDirectory(paths.privateRoot);
  for (const candidate of [paths.finalPath, paths.childPath]) {
    if (await lstat(candidate).then(() => true).catch(error => error?.code === 'ENOENT' ? false : Promise.reject(error))) {
      throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_STALE_OUTPUT_REJECTED');
    }
  }
  const identity = options.identity ?? resolveConnectedBrowserDiagnosticIdentity(options.environment);
  if (!validateConnectedBrowserIdentity(identity)) throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_IDENTITY_REJECTED');
  const sourceBindings = options.sourceBindings ?? await connectedBrowserSourceBindings(paths.workspaceRoot);
  const session = new ConnectedBrowserDiagnosticSession({ identity, paths, sourceBindings });
  await session.write();
  return session;
};

export const connectedBrowserParentFailureCode = phaseFailureCode;
