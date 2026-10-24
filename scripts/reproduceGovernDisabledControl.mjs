import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { createEnterpriseLifecycleFixture } from './enterpriseLifecyclePostgresFixture.mjs';
import {
  GOVERN_REVIEWER_DENIAL_SOURCE_PATHS,
  governReviewerDenialSource,
  validateGovernReviewerDenialPreparationEvidence,
} from './governDisabledControlEvidence.mjs';
import { canonicalDigest } from './assessV1OracleEvidence.mjs';
import { readGovernPreparationIdentity } from './governPreparationIdentity.mjs';

const root = process.cwd();
const evidenceRoot = path.resolve('output/local-private/govern-disabled-control-repro');
const privateOutputRoot = path.resolve('output/local-private');
const databaseUrl = process.env.ENTERPRISE_LIFECYCLE_DATABASE_URL;
if (!databaseUrl) throw new Error('GOVERN_DISABLED_REPRO_DATABASE_URL_REQUIRED');
const parsedDatabaseUrl = new URL(databaseUrl);
if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)
  || !['127.0.0.1', 'localhost'].includes(parsedDatabaseUrl.hostname)) {
  throw new Error('GOVERN_DISABLED_REPRO_LOOPBACK_DATABASE_REQUIRED');
}
await mkdir(evidenceRoot, { recursive: true });
const attemptRoot = await mkdtemp(path.join(evidenceRoot, 'after-attempt-'));
const buildDirectory = path.join(attemptRoot, 'build');
const requestedEvidencePath = process.env.GOVERN_REVIEWER_DENIAL_PROOF_PATH;
const evidencePath = requestedEvidencePath ? path.resolve(requestedEvidencePath)
  : path.join(attemptRoot, 'govern-reviewer-denial-after.json');
const evidenceRelative = path.relative(privateOutputRoot, evidencePath);
if (!evidenceRelative || evidenceRelative.startsWith('..') || path.isAbsolute(evidenceRelative)
  || path.extname(evidencePath) !== '.json') throw new Error('GOVERN_REVIEWER_DENIAL_PROOF_PATH_REJECTED');
const screenshotDirectory = path.join(attemptRoot, 'screenshots');
const browserResultDirectory = path.join(attemptRoot, 'browser-results');
const playwrightOutputDirectory = path.join(attemptRoot, 'playwright');

const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const sourceDigests = async () => Promise.all(GOVERN_REVIEWER_DENIAL_SOURCE_PATHS.map(async source => ({
  path: source,
  sha256: sha256((await readFile(path.resolve(source), 'utf8')).replace(/\r\n/gu, '\n')),
})));
const execFileAsync = promisify(execFile);
const gitHead = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })).stdout.trim();
const runIdentity = await readGovernPreparationIdentity(process.env, gitHead);
const buildIdentity = async directory => {
  const files = [];
  const visit = async (current, relative = '') => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(child, childRelative);
      else if (entry.isFile()) {
        const bytes = await readFile(child);
        files.push({ path: childRelative, bytes: bytes.byteLength, sha256: sha256(bytes) });
      } else throw new Error('GOVERN_REVIEWER_DENIAL_BUILD_ENTRY_REJECTED');
    }
  };
  await visit(directory);
  if (files.length === 0) throw new Error('GOVERN_REVIEWER_DENIAL_BUILD_EMPTY');
  return {
    digest: canonicalDigest(files),
    fileCount: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    manifest: files,
  };
};
const sourceSlice = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error('GOVERN_DISABLED_REPRO_SOURCE_SLICE_MISSING');
  return source.slice(from, to + end.length);
};

const availablePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(error => error ? reject(error) : resolve(address.port));
  });
});

const waitForHttp = async url => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1_000) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('GOVERN_DISABLED_REPRO_HTTP_NOT_READY');
};

const run = (command, args, { env = process.env, expectedFailure = false } = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let tail = '';
  const retain = chunk => { tail = `${tail}${chunk}`.slice(-32_000); };
  child.stdout.on('data', retain);
  child.stderr.on('data', retain);
  child.once('error', reject);
  child.once('exit', code => {
    if ((code === 0) === !expectedFailure) resolve({ code, tail });
    else reject(new Error(`GOVERN_DISABLED_REPRO_COMMAND_OUTCOME:${path.basename(command)}:${code}`));
  });
});

const stop = async child => {
  if (!child) return { existed: false, exited: true, exitCode: null, signalCode: null };
  if (child.exitCode !== null || child.signalCode !== null) {
    return { existed: true, exited: true, exitCode: child.exitCode, signalCode: child.signalCode };
  }
  child.kill('SIGTERM');
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5_000))]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5_000))]);
  }
  return { existed: true, exited: child.exitCode !== null || child.signalCode !== null,
    exitCode: child.exitCode, signalCode: child.signalCode };
};

const beforeDigests = await sourceDigests();
const source = governReviewerDenialSource(beforeDigests);
const scenarioSource = await readFile(path.resolve(
  'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts'), 'utf8');
const sourceBindings = {
  observeApiResponse: sha256(sourceSlice(scenarioSource,
    'const observeApiResponse = async (',
    '};\n\nconst observeFailedApiRequest')),
  reviewerGovernDenial: sha256(sourceSlice(scenarioSource,
    "const beforeFinalReviewerDenial = await control<MutationSnapshot>('/control/snapshot', { projectName });",
    "observe('govern-separation-denial', 'ui.final-reviewer-govern-denied');")),
};
const fixture = await createEnterpriseLifecycleFixture({
  databaseUrl,
  headSha: runIdentity.releaseSha,
  runId: `govern-reviewer-denial-${runIdentity.runId}`,
  runAttempt: runIdentity.attempt,
  hostedPersonaRoleParity: true,
  providersEnabled: false,
});
const apiBaseUrl = fixture.baseUrl;
const appPort = await availablePort();
const appBaseUrl = `http://127.0.0.1:${appPort}`;
const buildEnvironment = {
  ...process.env,
  VITE_AVALA_RUNTIME_MODE: 'pilot',
  VITE_SUPABASE_URL: apiBaseUrl,
  VITE_SUPABASE_ANON_KEY: fixture.publicAnonKey,
  VITE_AI_EDGE_FUNCTIONS_ENABLED: 'false',
};
let preview;
let cleanupVerified = false;
let previewStop = { existed: false, exited: true, exitCode: null, signalCode: null };
let buildRemoved = false;
let reproductionEvidence;
let build;
try {
  await run(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'build', '--config',
    'vite.enterprise-lifecycle-acceptance.config.ts', '--outDir', buildDirectory], { env: buildEnvironment });
  build = await buildIdentity(buildDirectory);
  preview = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'preview', '--config',
    'vite.enterprise-lifecycle-acceptance.config.ts', '--host', '127.0.0.1', '--port', String(appPort), '--outDir', buildDirectory],
  { cwd: root, env: buildEnvironment, stdio: 'ignore', windowsHide: true });
  await waitForHttp(`${appBaseUrl}/`);
  await run(process.execPath, [path.resolve('node_modules/@playwright/test/cli.js'), 'test',
    '--config=scripts/playwright.govern-disabled-control-repro.config.ts'], { env: {
    ...process.env,
    ENTERPRISE_LIFECYCLE_APP_BASE_URL: appBaseUrl,
    ENTERPRISE_LIFECYCLE_API_BASE_URL: apiBaseUrl,
    ENTERPRISE_LIFECYCLE_CONTROL_TOKEN: fixture.controlToken,
    ENTERPRISE_LIFECYCLE_AUTH_STORAGE_KEY: fixture.authStorageKey,
    ENTERPRISE_LIFECYCLE_AUTHENTICATED: 'true',
    ENTERPRISE_LIFECYCLE_HOSTED_PERSONA_ROLE_PARITY: 'true',
    GOVERN_DISABLED_REPRO_BROWSER_RESULT_DIRECTORY: browserResultDirectory,
    GOVERN_DISABLED_REPRO_SCREENSHOT_DIRECTORY: screenshotDirectory,
    GOVERN_DISABLED_REPRO_PLAYWRIGHT_OUTPUT_DIRECTORY: playwrightOutputDirectory,
  } });
  const projectNames = ['chromium-desktop', 'pixel-7'];
  const browserResults = await Promise.all(projectNames.map(async projectName => JSON.parse(await readFile(
    path.join(browserResultDirectory, `browser-${projectName}.json`), 'utf8'))));
  const readCapabilities = async actor => {
    const response = await fetch(`${apiBaseUrl}/functions/v1/tenant-session`, {
      method: 'POST',
      headers: { authorization: `Bearer ${actor.token}`, apikey: fixture.publicAnonKey, 'content-type': 'application/json' },
      body: '{}', signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 200) throw new Error('GOVERN_REVIEWER_DENIAL_AUTHORITY_READ_FAILED');
    return (await response.json()).contexts?.[0]?.capabilities ?? [];
  };
  const reviewerCapabilities = await readCapabilities(fixture.actors.reviewer);
  const approverCapabilities = await readCapabilities(fixture.actors.approver);
  // Exercise the fixture's actual HTTP boundary: a permissive context stub must
  // never mask a malformed caller again. These rejected reads cannot mutate state.
  for (const [method, body, authenticated, status, code] of [
    ['GET', undefined, true, 405, 'METHOD_NOT_ALLOWED'],
    ['POST', undefined, true, 400, 'INVALID_REQUEST'],
    ['POST', '{"workspaceId":"client-claim"}', true, 400, 'INVALID_REQUEST'],
    ['POST', '{}', false, 401, 'AUTHENTICATION_REQUIRED'],
  ]) {
    const response = await fetch(`${apiBaseUrl}/functions/v1/tenant-session`, {
      method, body, signal: AbortSignal.timeout(15_000),
      headers: { 'content-type': 'application/json', apikey: fixture.publicAnonKey,
        ...(authenticated ? { authorization: `Bearer ${fixture.actors.reviewer.token}` } : {}) },
    });
    if (response.status !== status || (await response.json()).code !== code) {
      throw new Error('GOVERN_REVIEWER_DENIAL_TENANT_CONTRACT_REJECTED');
    }
  }

  const persisted = (await fixture.db.query(`SELECT
    (SELECT count(*)::int FROM assess_v2_govern_resolutions) govern_resolutions,
    (SELECT count(*)::int FROM assess_command_receipts WHERE command_type='assessment_v2.govern.resolve') govern_receipts,
    (SELECT count(*)::int FROM privileged_audit_events WHERE action='assessment_v2.govern.resolve') govern_audits`)).rows[0];
  reproductionEvidence = {
    schemaVersion: 'govern-reviewer-denial-preparation-v1',
    status: 'pending_cleanup',
    source: { ...runIdentity, sourceDigest: source.sourceDigest, files: source.files },
    build,
    fixture: { hostedPersonaRoleParity: true, providersEnabled: false, syntheticOnly: true, loopbackOnly: true },
    correctedTarget: {
      execution: 'shared-canonical-helper-using-actual-production-ui-and-handlers',
      prerequisite: 'actual-production-ui-author-finalize-reviewer-assign-attest-approve',
      canonicalScenarioSharedHelperExecuted: true,
      sourceBindings,
      helperTimeoutMs: 15000,
      desktopAndPixelPassed: browserResults.every(result => result.status === 'passed'),
    },
    reviewerAuthority: {
      required: ['assess.v2.read', 'assess.v2.review', 'assess.v2.evidence.attest', 'assess.v2.approve'],
      requiredPresent: ['assess.v2.read', 'assess.v2.review', 'assess.v2.evidence.attest', 'assess.v2.approve']
        .every(item => reviewerCapabilities.includes(item)),
      forbidden: 'assess.v2.govern.resolve',
      forbiddenAbsent: !reviewerCapabilities.includes('assess.v2.govern.resolve'),
    },
    approverAuthority: {
      required: 'assess.v2.govern.resolve',
      requiredPresent: approverCapabilities.includes('assess.v2.govern.resolve'),
    },
    browsers: browserResults.map((result, index) => ({
      project: projectNames[index],
      status: result.status,
      prerequisite: result.prerequisite,
      reviewerDenial: result.reviewerDenial,
      independentResolution: result.independentResolution,
      mutation: result.mutation,
    })),
    persisted: {
      governResolutions: Number(persisted.govern_resolutions),
      governReceipts: Number(persisted.govern_receipts),
      governAudits: Number(persisted.govern_audits),
    },
    providers: { enabled: false, calls: fixture.evidence.providerEffects.calls, paidCalls: fixture.evidence.providerEffects.paidCalls },
    scope: { fullAcceptanceRun: false, studioProviderGenerationRun: false },
    acceptancePromoted: false,
  };
} finally {
  previewStop = await stop(preview);
  cleanupVerified = await fixture.close();
  const buildRelative = path.relative(attemptRoot, buildDirectory);
  if (!buildRelative || buildRelative.startsWith('..') || path.isAbsolute(buildRelative)) {
    throw new Error('GOVERN_REVIEWER_DENIAL_BUILD_PATH_REJECTED');
  }
  await rm(buildDirectory, { recursive: true, force: true });
  buildRemoved = !(await access(buildDirectory).then(() => true).catch(() => false));
  if (!cleanupVerified) throw new Error('GOVERN_DISABLED_REPRO_CLEANUP_FAILED');
}

const sourceDigestsAfter = await sourceDigests();
const sourcesUnchanged = JSON.stringify(sourceDigestsAfter) === JSON.stringify(beforeDigests);
reproductionEvidence.cleanup = {
  fixtureListenerClosedAndDatabaseRemoved: cleanupVerified,
  previewProcessExited: previewStop.exited,
  ownedBuildRemoved: buildRemoved,
  sourcesUnchanged,
};
const browserCount = reproductionEvidence.browsers.length;
reproductionEvidence.status = reproductionEvidence.correctedTarget.desktopAndPixelPassed
  && reproductionEvidence.browsers.every(result => result.reviewerDenial.uiDisabled
    && result.reviewerDenial.status === 403
    && result.reviewerDenial.errorCode === 'PERMISSION_DENIED'
    && result.reviewerDenial.requestCount === 1
    && result.reviewerDenial.zeroEffects
    && result.independentResolution.status === 200
    && result.independentResolution.resolutionDelta.reviewAssignments === 0
    && result.independentResolution.resolutionDelta.governResolutions === 1
    && result.independentResolution.resolutionDelta.commandReceipts === 1
    && result.independentResolution.resolutionDelta.privilegedAudits === 1)
  && reproductionEvidence.persisted.governResolutions === browserCount
  && reproductionEvidence.persisted.governReceipts === browserCount
  && reproductionEvidence.persisted.governAudits === browserCount
  && reproductionEvidence.reviewerAuthority.requiredPresent
  && reproductionEvidence.reviewerAuthority.forbiddenAbsent
  && reproductionEvidence.approverAuthority.requiredPresent
  && reproductionEvidence.providers.enabled === false
  && reproductionEvidence.providers.calls === 0
  && reproductionEvidence.providers.paidCalls === 0
  && sourcesUnchanged
  && cleanupVerified
  && previewStop.exited
  && buildRemoved
  ? 'passed' : 'failed';
await mkdir(path.dirname(evidencePath), { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(reproductionEvidence, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
if (reproductionEvidence.status !== 'passed') throw new Error('GOVERN_REVIEWER_DENIAL_AFTER_ASSERTION_FAILED');
validateGovernReviewerDenialPreparationEvidence(reproductionEvidence);
process.stdout.write(`GOVERN_REVIEWER_DENIAL_AFTER_PASSED ${evidencePath}\n`);
