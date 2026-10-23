import { readFile } from 'node:fs/promises';

const SHA = /^[0-9a-f]{40}$/u;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/u;
const REPOSITORY = 'APReddy-AutoBotz/AvalaOS-Core';
const reject = () => { throw new Error('GOVERN_PREPARATION_IDENTITY_REJECTED'); };

export function governPreparationIdentityMetadata(value) {
  if (!SHA.test(value.releaseSha ?? '')
    || !POSITIVE_INTEGER.test(value.runId ?? '') || !POSITIVE_INTEGER.test(value.attempt ?? '')
    || value.workflow !== 'Authenticated Product Acceptance Preparation'
    || value.job !== 'connected-browser') reject();
  return Object.freeze({ releaseSha: value.releaseSha, runId: value.runId, attempt: value.attempt,
    workflow: value.workflow, job: value.job });
}

// A pull_request runner uses the synthetic merge SHA while checkout deliberately
// uses the event's PR head. Bind that head to both the event and actual checkout.
export function governPreparationIdentity(environment, gitHead, event) {
  const value = governPreparationIdentityMetadata({
    releaseSha: environment.RELEASE_SHA,
    runId: environment.GITHUB_RUN_ID,
    attempt: environment.GITHUB_RUN_ATTEMPT,
    workflow: environment.GITHUB_WORKFLOW,
    job: environment.GITHUB_JOB,
  });
  if (value.releaseSha !== gitHead
    || !SHA.test(environment.GITHUB_SHA ?? '')
    || environment.GITHUB_REPOSITORY !== REPOSITORY || event?.repository?.full_name !== REPOSITORY) reject();
  if (environment.GITHUB_EVENT_NAME === 'pull_request') {
    const pr = event?.pull_request;
    if (!Number.isSafeInteger(event?.number) || event.number < 1
      || environment.GITHUB_REF !== `refs/pull/${event.number}/merge`
      || pr?.head?.sha !== value.releaseSha || pr?.base?.ref !== 'main'
      || pr?.head?.repo?.full_name !== REPOSITORY || pr?.base?.repo?.full_name !== REPOSITORY) reject();
  } else if (environment.GITHUB_EVENT_NAME === 'push') {
    if (environment.GITHUB_REF !== 'refs/heads/main' || event?.ref !== 'refs/heads/main'
      || event?.deleted !== false || event?.after !== value.releaseSha
      || environment.GITHUB_SHA !== value.releaseSha) reject();
  } else reject();
  return Object.freeze(value);
}

export async function readGovernPreparationIdentity(environment, gitHead) {
  let event;
  try {
    if (!environment.GITHUB_EVENT_PATH) reject();
    event = JSON.parse(await readFile(environment.GITHUB_EVENT_PATH, 'utf8'));
  } catch { reject(); }
  return governPreparationIdentity(environment, gitHead, event);
}
