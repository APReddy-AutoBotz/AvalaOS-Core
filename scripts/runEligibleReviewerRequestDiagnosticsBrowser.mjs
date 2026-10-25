import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateAuthenticatedHostedPlaywrightDiagnostic } from './authenticatedHostedDiagnostics.mjs';
import { createEligibleReviewerRequestDiagnosticsSourceBindings } from './eligibleReviewerRequestDiagnosticsArtifact.mjs';

const allowedBases = [
  path.resolve('output/local-private/eligible-reviewer-request-diagnostics'),
  path.resolve('output/local-private/authenticated-product-acceptance/eligible-reviewer-request-diagnostics'),
];
const exists = async value => stat(value).then(() => true, () => false);
let requested = process.env.ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTICS_EVIDENCE_DIR;
if (!requested) {
  const base = allowedBases[0];
  await mkdir(base, { recursive: true });
  for (let index = 1; index <= 99; index += 1) {
    const candidate = path.join(base, `attempt-${index}`);
    if (!await exists(candidate)) { requested = candidate; break; }
  }
}
if (!requested) throw new Error('ELIGIBLE_REVIEWER_DIAGNOSTICS_ATTEMPT_LIMIT');
const root = path.resolve(requested);
const base = allowedBases.find(candidate => {
  const relative = path.relative(candidate, root);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    && /^attempt-[1-9][0-9]?$/u.test(relative.replaceAll('\\', '/'));
});
if (!base) {
  throw new Error('ELIGIBLE_REVIEWER_DIAGNOSTICS_EVIDENCE_PATH_REJECTED');
}
await mkdir(base, { recursive: true });
await mkdir(root, { recursive: false });
const diagnosticPath = path.join(root, 'diagnostic.json');
const cleanupPath = path.join(root, 'cleanup.json');
const playwrightOutput = path.join(root, 'playwright-output');
const env = { ...process.env, AUTHENTICATED_HOSTED_PLAYWRIGHT_DIAGNOSTIC_PATH: diagnosticPath,
  ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTICS_CLEANUP_PATH: cleanupPath,
  ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTICS_PLAYWRIGHT_OUTPUT: playwrightOutput,
  ALLOW_EXTERNAL_AI_PROVIDERS: 'false' };
for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY']) delete env[key];
let exitCode = null, timedOut = false, launchSucceeded = false, childExited = false;
try {
  const child = spawn(process.execPath, [path.resolve('node_modules/@playwright/test/cli.js'), 'test',
    '--config', 'playwright.eligible-reviewer-request-diagnostics.config.ts'],
    { cwd: process.cwd(), env, stdio: 'ignore', windowsHide: true });
  exitCode = await new Promise(resolve => {
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 60_000);
    child.once('error', () => { clearTimeout(timer); resolve(null); });
    child.once('spawn', () => { launchSucceeded = true; });
    child.once('exit', code => { clearTimeout(timer); childExited = true; resolve(code); });
  });
} finally {
  await rm(playwrightOutput, { recursive: true, force: true });
}
const readJson = async source => { try { return JSON.parse(await readFile(source, 'utf8')); } catch { return null; } };
const rawDiagnostic = await readJson(diagnosticPath);
const diagnostic = rawDiagnostic ? validateAuthenticatedHostedPlaywrightDiagnostic(rawDiagnostic) : null;
const cleanup = await readJson(cleanupPath);
const exactCleanup = cleanup && Object.keys(cleanup).sort().join(',')
  === ['actionsDrained', 'apiClosed', 'appClosed', 'eligibleReleased', 'networkSettled', 'providersEnabled'].sort().join(',')
  && cleanup.eligibleReleased === true && cleanup.networkSettled === true && cleanup.actionsDrained === true
  && cleanup.appClosed === true && cleanup.apiClosed === true && cleanup.providersEnabled === false;
const context = diagnostic?.requestContext;
const pass = exitCode === 1 && launchSucceeded && childExited && !timedOut
  && diagnostic?.operation === 'GOVERN_STUDIO_ELIGIBLE_REVIEWER_VISIBLE'
  && diagnostic.category === 'unexpected-failure' && context?.project === 'desktop-chromium'
  && context?.requests?.[2]?.state === 'pending' && context.requests[2].outcome === 'pending'
  && context.requests[2].elapsedMs === 15_000 && context.requests[2].elapsedSaturated === true
  && context.candidateCount === null && context.decisionBinding === 'unavailable'
  && context.ui?.workspace === 'unknown' && context.ui?.candidates === 'unknown' && exactCleanup;
const result = { schemaVersion: 'eligible-reviewer-request-diagnostics-browser-v1', status: pass ? 'PASS' : 'FAIL',
  expectedAssertionFailure: exitCode === 1, launchSucceeded, childExited, timedOut,
  diagnosticAccepted: Boolean(diagnostic), pendingEligibleObserved: context?.requests?.[2]?.state === 'pending',
  elapsedCapped: context?.requests?.[2]?.elapsedMs === 15_000, cleanupVerified: Boolean(exactCleanup),
  playwrightOutputRemoved: !await exists(playwrightOutput), providersEnabled: false };
await writeFile(path.join(root, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
if (!pass) throw new Error('ELIGIBLE_REVIEWER_DIAGNOSTICS_BROWSER_PROOF_FAILED');

const bindingInput = {
  releaseSha: process.env.ELIGIBLE_REVIEWER_DIAGNOSTICS_RELEASE_SHA ?? process.env.GITHUB_SHA,
  runId: process.env.ELIGIBLE_REVIEWER_DIAGNOSTICS_RUN_ID ?? process.env.GITHUB_RUN_ID,
  runAttempt: Number(process.env.ELIGIBLE_REVIEWER_DIAGNOSTICS_RUN_ATTEMPT ?? process.env.GITHUB_RUN_ATTEMPT),
  workflowPath: '.github/workflows/authenticated-product-acceptance.yml',
  job: process.env.ELIGIBLE_REVIEWER_DIAGNOSTICS_JOB ?? process.env.GITHUB_JOB,
};
const bindingRequested = process.env.GITHUB_ACTIONS === 'true'
  || ['ELIGIBLE_REVIEWER_DIAGNOSTICS_RELEASE_SHA', 'ELIGIBLE_REVIEWER_DIAGNOSTICS_RUN_ID',
    'ELIGIBLE_REVIEWER_DIAGNOSTICS_RUN_ATTEMPT', 'ELIGIBLE_REVIEWER_DIAGNOSTICS_JOB']
    .some(key => process.env[key] !== undefined);
if (bindingRequested) {
  const bindings = await createEligibleReviewerRequestDiagnosticsSourceBindings({
    repositoryRoot: process.cwd(), ...bindingInput,
  });
  await writeFile(path.join(root, 'source-bindings.json'), `${JSON.stringify(bindings, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 });
}
