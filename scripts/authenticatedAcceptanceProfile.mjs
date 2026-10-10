import { isDeepStrictEqual } from 'node:util';
import { AUTHENTICATED_ACCEPTANCE_PROJECTS, AUTHENTICATED_ACCEPTANCE_WORKFLOW } from './authenticatedAcceptanceCases.mjs';

const SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const fail = code => { throw new Error(`AUTHENTICATED_ACCEPTANCE_${code}`); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, expected, code) => {
  if (!record(value) || !isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort())) fail(code);
};
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;
export const AUTHENTICATED_HOSTED_PROFILE_SCHEMA = 'hosted-authenticated-synthetic-profile-v1';
export const AUTHENTICATED_HOSTED_BINDING_KEYS = Object.freeze([
  'schemaVersion', 'executionKind', 'authKind', 'releaseSha', 'checkoutSha',
  'origin', 'deploymentId', 'backendDigest', 'migrationVersion', 'migrationDigest',
  'exerciseDigest', 'catalogDigest', 'sourceDigest', 'baselineDigest', 'policy', 'workflow', 'window', 'actors',
]);

// This profile is deliberately separate from acceptanceExecutionProfile's
// public Sandbox profile. Its expected binding comes from the controller,
// never from a browser attachment or a local fixture's claimed origin.
export function validateAuthenticatedHostedProfile(value) {
  keys(value, AUTHENTICATED_HOSTED_BINDING_KEYS, 'PROFILE_SHAPE');
  if (value.schemaVersion !== AUTHENTICATED_HOSTED_PROFILE_SCHEMA
    || value.executionKind !== 'hosted_authenticated_synthetic'
    || value.authKind !== 'supabase_auth') fail('REAL_AUTH_PROFILE_REQUIRED');
  if (!SHA.test(value.releaseSha) || value.checkoutSha !== value.releaseSha) fail('EXACT_HEAD_REQUIRED');
  let origin;
  try { origin = new URL(value.origin); } catch { fail('ORIGIN_INVALID'); }
  if (origin.protocol !== 'https:' || origin.origin !== value.origin || origin.username || origin.password
    || origin.hostname !== 'avalaos-pilot.netlify.app') fail('ORIGIN_INVALID');
  if (!/^[0-9a-f]{24}$/u.test(value.deploymentId)) fail('DEPLOYMENT_INVALID');
  for (const key of ['backendDigest', 'migrationDigest', 'exerciseDigest', 'catalogDigest', 'sourceDigest', 'baselineDigest']) {
    if (!DIGEST.test(value[key])) fail('DIGEST_INVALID');
  }
  if (!/^20\d{12}$/u.test(value.migrationVersion)) fail('MIGRATION_INVALID');
  keys(value.policy, ['syntheticOnly', 'production', 'customerDataAllowed', 'providersEnabled', 'paidCallsAllowed'], 'POLICY_SHAPE');
  if (!isDeepStrictEqual(value.policy, {
    syntheticOnly: true, production: false, customerDataAllowed: false, providersEnabled: false, paidCallsAllowed: false,
  })) fail('POLICY_REJECTED');
  keys(value.workflow, ['repository', 'path', 'ref', 'event', 'runId', 'attempt', 'job'], 'WORKFLOW_SHAPE');
  const w = value.workflow;
  if (w.repository !== 'APReddy-AutoBotz/AvalaOS-Core' || w.path !== AUTHENTICATED_ACCEPTANCE_WORKFLOW
    || w.ref !== `${w.repository}/${w.path}@refs/heads/main` || w.event !== 'workflow_dispatch'
    || !/^[1-9][0-9]*$/u.test(w.runId) || !/^[1-9][0-9]*$/u.test(w.attempt)
    || w.job !== 'hosted-authenticated') fail('WORKFLOW_REJECTED');
  keys(value.window, ['startedAt', 'completedAt'], 'WINDOW_SHAPE');
  if (!timestamp(value.window.startedAt) || !timestamp(value.window.completedAt)
    || Date.parse(value.window.completedAt) <= Date.parse(value.window.startedAt)) fail('WINDOW_INVALID');
  if (!Array.isArray(value.actors) || !value.actors.length || value.actors.length > 32) fail('ACTORS_INVALID');
  const seen = new Set();
  for (const actor of value.actors) {
    keys(actor, ['persona', 'project', 'actorHash', 'sessionHash', 'organizationHash', 'workspaceHash'], 'ACTOR_SHAPE');
    const key = `${actor.persona}:${actor.project}`;
    if (!/^[a-z][a-z0-9-]{1,63}$/u.test(actor.persona) || !AUTHENTICATED_ACCEPTANCE_PROJECTS.includes(actor.project)
      || seen.has(key) || ['actorHash', 'sessionHash', 'organizationHash', 'workspaceHash'].some(name => !DIGEST.test(actor[name]))) fail('ACTORS_INVALID');
    seen.add(key);
  }
  if (AUTHENTICATED_ACCEPTANCE_PROJECTS.some(project => !value.actors.some(actor => actor.project === project))) fail('ACTOR_PROJECT_MISSING');
  return value;
}

export function requireAuthenticatedHostedBinding(actual, expected) {
  validateAuthenticatedHostedProfile(expected);
  validateAuthenticatedHostedProfile(actual);
  if (!isDeepStrictEqual(actual, expected)) fail('BINDING_MISMATCH');
  return actual;
}

export function authenticatedProfileFromEnvironment(environment, executionWindow) {
  if (environment.GITHUB_ACTIONS !== 'true') fail('WORKFLOW_RUNTIME_REQUIRED');
  let actors;
  try { actors = JSON.parse(environment.AUTHENTICATED_ACCEPTANCE_ACTOR_BINDINGS ?? 'null'); }
  catch { fail('ACTORS_INVALID'); }
  const p = {
    schemaVersion: AUTHENTICATED_HOSTED_PROFILE_SCHEMA,
    executionKind: environment.AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND,
    authKind: environment.AUTHENTICATED_ACCEPTANCE_AUTH_KIND,
    releaseSha: environment.RELEASE_SHA,
    checkoutSha: environment.GITHUB_SHA,
    origin: environment.HOSTED_PILOT_URL,
    deploymentId: environment.NETLIFY_DEPLOY_ID,
    backendDigest: environment.AUTHENTICATED_ACCEPTANCE_BACKEND_DIGEST,
    migrationVersion: environment.AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION,
    migrationDigest: environment.AUTHENTICATED_ACCEPTANCE_MIGRATION_DIGEST,
    exerciseDigest: environment.AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST,
    catalogDigest: environment.AUTHENTICATED_ACCEPTANCE_CATALOG_DIGEST,
    sourceDigest: environment.AUTHENTICATED_ACCEPTANCE_SOURCE_DIGEST,
    baselineDigest: environment.AUTHENTICATED_ACCEPTANCE_BASELINE_DIGEST,
    policy: {
      syntheticOnly: environment.AUTHENTICATED_ACCEPTANCE_SYNTHETIC_ONLY === 'true',
      production: environment.AUTHENTICATED_ACCEPTANCE_PRODUCTION !== 'false',
      customerDataAllowed: environment.AUTHENTICATED_ACCEPTANCE_CUSTOMER_DATA !== 'false',
      providersEnabled: environment.AUTHENTICATED_ACCEPTANCE_PROVIDERS_ENABLED !== 'false',
      paidCallsAllowed: environment.AUTHENTICATED_ACCEPTANCE_PAID_CALLS !== 'false',
    },
    workflow: {
      repository: environment.GITHUB_REPOSITORY, path: AUTHENTICATED_ACCEPTANCE_WORKFLOW,
      ref: environment.GITHUB_WORKFLOW_REF, event: environment.GITHUB_EVENT_NAME,
      runId: environment.GITHUB_RUN_ID, attempt: environment.GITHUB_RUN_ATTEMPT, job: environment.GITHUB_JOB,
    },
    window: executionWindow,
    actors,
  };
  return validateAuthenticatedHostedProfile(p);
}
