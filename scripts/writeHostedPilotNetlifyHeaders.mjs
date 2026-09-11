import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { canonicalSupabasePublicOrigin, isSafePublicSupabaseCredential } from '../services/supabasePublicCredential.mjs';

const release = process.env.COMMIT_REF;
const deployId = process.env.DEPLOY_ID;
const context = process.env.CONTEXT;
const siteName = process.env.SITE_NAME;
const branch = process.env.BRANCH;
const headBranch = process.env.HEAD;
const pullRequest = process.env.PULL_REQUEST;
const reviewId = process.env.REVIEW_ID;
const siteUrl = process.env.URL;
const deployUrl = process.env.DEPLOY_URL;
const deployOrigin = process.env.DEPLOY_PRIME_URL;
const exerciseDigest = process.env.PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST;
const targetFingerprint = process.env.PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT;
const stableTestingAuthorization = process.env.AVALAOS_HOSTED_NONPRODUCTION_STABLE_TESTING;
const publicSupabaseUrl = process.env.VITE_SUPABASE_URL;
const publicSupabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const expectedPublicTargetDigest = process.env.PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST;

const EXPECTED_SITE = 'avalaos-pilot';
const EXPECTED_BRANCH = 'controller/governed-delivery-monitor-pr-c-20260831';
const EXPECTED_REVIEW_ID = '264';
const EXPECTED_SITE_URL = 'https://avalaos-pilot.netlify.app';
const EXPECTED_PREVIEW_ORIGIN = 'https://deploy-preview-264--avalaos-pilot.netlify.app';
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ALLOWED_BROWSER_ENVIRONMENT = new Set([
  'VITE_AVALA_RUNTIME_MODE',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_PR_C_CONTROLLED_HUMAN_PUBLIC_TARGET_DIGEST',
]);
const FORBIDDEN_PRIVATE_ENVIRONMENT = [
  'OPENAI_API_KEY',
  'GROQ_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'DATABASE_URL',
  'HOSTED_PILOT_DATABASE_URL',
];
const INTERNAL_BROWSER_TEST_BUILD_ENVIRONMENT = new Set([
  'DELIVERY_MONITOR_PR_C_BROWSER_TEST_BUILD',
  'ENTERPRISE_INTELLIGENCE_BROWSER_TEST_BUILD',
  'STUDIO_ARTIFACT_BROWSER_TEST_BUILD',
  'PILOT_OPERATIONS_BROWSER_TEST_BUILD',
  'PR1A_BROWSER_TEST_BUILD',
  'STUDIO_PRIVATE_ARTIFACT_BROWSER_TEST_BUILD',
]);

const unexpectedBrowserEnvironment = Object.keys(process.env)
  .filter(key => key.startsWith('VITE_') && !ALLOWED_BROWSER_ENVIRONMENT.has(key));
const forbiddenPrivateEnvironmentPresent = FORBIDDEN_PRIVATE_ENVIRONMENT
  .some(key => typeof process.env[key] === 'string' && process.env[key].length > 0);
const publicOrigin = canonicalSupabasePublicOrigin(publicSupabaseUrl);
const actualPublicTargetDigest = publicOrigin
  ? `sha256:${createHash('sha256').update(`pr-c-controlled-human-public-target\0${publicOrigin}`).digest('hex')}`
  : null;
const publicBackendConfigurationValid = publicOrigin !== null
  && isSafePublicSupabaseCredential(publicSupabaseAnonKey)
  && DIGEST_PATTERN.test(expectedPublicTargetDigest ?? '')
  && actualPublicTargetDigest === expectedPublicTargetDigest;

const controlledHumanCandidateClaimed = (
  context === 'deploy-preview'
  && (
    reviewId === EXPECTED_REVIEW_ID
    || headBranch === EXPECTED_BRANCH
    || deployOrigin === EXPECTED_PREVIEW_ORIGIN
  )
) || (reviewId === EXPECTED_REVIEW_ID && headBranch === EXPECTED_BRANCH);

const exactControlledHumanPreview = /^[0-9a-f]{40}$/.test(release ?? '')
  && /^[0-9a-f]{24}$/.test(deployId ?? '')
  && context === 'deploy-preview'
  && siteName === EXPECTED_SITE
  && headBranch === EXPECTED_BRANCH
  && pullRequest === 'true'
  && reviewId === EXPECTED_REVIEW_ID
  && siteUrl === EXPECTED_SITE_URL
  && deployOrigin === EXPECTED_PREVIEW_ORIGIN
  && deployUrl === `https://${deployId}--${EXPECTED_SITE}.netlify.app`
  && [undefined, 'pilot'].includes(process.env.VITE_AVALA_RUNTIME_MODE)
  && DIGEST_PATTERN.test(exerciseDigest ?? '')
  && DIGEST_PATTERN.test(targetFingerprint ?? '')
  && publicBackendConfigurationValid
  && unexpectedBrowserEnvironment.length === 0
  && !forbiddenPrivateEnvironmentPresent;

// Preserve the permanent stable-host guard that predates PR #264. Netlify's
// `production` context is a dedicated non-production pilot URL only when every
// field in this tuple and the controller-managed authorization are exact. This
// is not AvalaOS production/custom-domain authorization, and it never enables
// controlled-human browser variables.
const authorizedStablePilotTestingContext = /^[0-9a-f]{40}$/.test(release ?? '')
  && /^[0-9a-f]{24}$/.test(deployId ?? '')
  && context === 'production'
  && siteName === EXPECTED_SITE
  && branch === 'main'
  && siteUrl === EXPECTED_SITE_URL
  && stableTestingAuthorization === 'authorized';

if (controlledHumanCandidateClaimed && !exactControlledHumanPreview) {
  throw new Error('NETLIFY_PR_C_CONTROLLED_HUMAN_PREVIEW_REQUIRED');
}

if (context === 'production' && !authorizedStablePilotTestingContext) {
  throw new Error('NETLIFY_HOSTED_PILOT_NONPRODUCTION_CONTEXT_REQUIRED');
}

const runBuild = async (environment) => {
  const windows = process.platform === 'win32';
  const command = windows ? process.env.ComSpec ?? 'cmd.exe' : 'npm';
  const args = windows ? ['/d', '/s', '/c', 'npm.cmd run build'] : ['run', 'build'];
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: environment,
      stdio: 'inherit',
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`NETLIFY_BUILD_FAILED:${code ?? signal ?? 'unknown'}`));
    });
  });
};

const ordinaryBuildEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => (
    !key.startsWith('VITE_PR_C_CONTROLLED_HUMAN_')
    && !key.startsWith('PR_C_CONTROLLED_HUMAN_')
    && !INTERNAL_BROWSER_TEST_BUILD_ENVIRONMENT.has(key)
  )),
);
const controlledHumanBuildEnvironment = {
  ...ordinaryBuildEnvironment,
  VITE_AVALA_RUNTIME_MODE: 'pilot',
  VITE_PR_C_CONTROLLED_HUMAN_ENABLED: 'authorized',
  PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST: exerciseDigest,
  PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT: targetFingerprint,
  VITE_PR_C_CONTROLLED_HUMAN_PUBLIC_TARGET_DIGEST: actualPublicTargetDigest,
};

if (process.argv.includes('--build')) {
  await runBuild(exactControlledHumanPreview ? controlledHumanBuildEnvironment : ordinaryBuildEnvironment);
}

if (!exactControlledHumanPreview && !authorizedStablePilotTestingContext) {
  console.log('Ordinary Netlify build completed without controlled-human mode or response identity headers.');
  process.exit(0);
}

await mkdir('dist', { recursive: true });
await writeFile(
  'dist/_headers',
  `/*\n  X-AvalaOS-Release: ${release}\n  X-AvalaOS-Environment: hosted_nonproduction_pilot\n  X-AvalaOS-Netlify-Deploy-ID: ${deployId}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  X-Frame-Options: DENY\n`,
  'utf8',
);

console.log(exactControlledHumanPreview
  ? 'Controlled-human response identity headers generated for exact PR #264 Deploy Preview commit.'
  : 'Hosted non-production response identity headers generated for exact authorized stable pilot commit.');
