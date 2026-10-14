import { createHash } from 'node:crypto';

const RUN_ID = /^[1-9][0-9]{0,19}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SAFE_PROJECT = /^[a-z][a-z0-9-]{1,63}$/u;
const BROWSER_PROJECT = /^(?:desktop-chromium|pixel-7-chromium)(?:-[a-z0-9-]{1,63})?$/u;

export const AUTHENTICATED_HOSTED_FIXTURE_IDENTITY_SCHEMA = 'authenticated-hosted-fixture-identity-v1';

export const authenticatedHostedFixtureIdentity = ({ runId, attempt, exerciseId, projectName }) => {
  const canonicalRunId = String(runId ?? '');
  const canonicalAttempt = Number(attempt);
  const canonicalExerciseId = String(exerciseId ?? '').toLowerCase();
  if (!RUN_ID.test(canonicalRunId)
    || !Number.isSafeInteger(canonicalAttempt) || canonicalAttempt < 1
    || String(canonicalAttempt) !== String(attempt)
    || !UUID.test(canonicalExerciseId)
    || typeof projectName !== 'string' || (!SAFE_PROJECT.test(projectName) && !BROWSER_PROJECT.test(projectName))) {
    throw new Error('AUTHENTICATED_HOSTED_FIXTURE_IDENTITY_REJECTED');
  }
  const binding = createHash('sha256').update(JSON.stringify({
    schema: AUTHENTICATED_HOSTED_FIXTURE_IDENTITY_SCHEMA,
    runId: canonicalRunId,
    attempt: canonicalAttempt,
    exerciseId: canonicalExerciseId,
    projectName,
  })).digest('hex').slice(0, 12);
  const suffix = `[run ${canonicalRunId}.${canonicalAttempt} ${binding}]`;
  return Object.freeze({
    binding,
    suffix,
    processName: `${projectName} connected lifecycle ${suffix}`,
    deliveryProjectName: `${projectName} delivery project ${suffix}`,
  });
};
