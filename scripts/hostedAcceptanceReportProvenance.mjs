const SHA = /^[0-9a-f]{40}$/u;
const DEPLOY_ID = /^[0-9a-f]{24}$/u;
const RUN_ID = /^[1-9][0-9]*$/u;
const RUN_ATTEMPT = /^[1-9][0-9]*$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
export const EXHAUSTIVE_ACCEPTANCE_WORKFLOW = '.github/workflows/exhaustive-acceptance.yml';
export const PREVIEW_EXHAUSTIVE_BROWSER_WORKFLOW = '.github/workflows/preview-exhaustive-browser-qa.yml';

const requiredString = (value, code) => {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) throw new Error(code);
  return value;
};

const exactOrigin = value => {
  let parsed;
  try {
    parsed = new URL(requiredString(value, 'HOSTED_ACCEPTANCE_ORIGIN_REJECTED'));
  } catch {
    throw new Error('HOSTED_ACCEPTANCE_ORIGIN_REJECTED');
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || (parsed.pathname !== '' && parsed.pathname !== '/')
    || ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  ) {
    throw new Error('HOSTED_ACCEPTANCE_ORIGIN_REJECTED');
  }
  return parsed.origin;
};

export const createHostedAcceptanceWorkflowRuntime = ({ environment, workflowPath, releaseSha }) => {
  if (environment.GITHUB_ACTIONS !== 'true') return null;
  const repository = requiredString(environment.GITHUB_REPOSITORY, 'HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
  const workflowRef = requiredString(environment.GITHUB_WORKFLOW_REF, 'HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
  const eventName = requiredString(environment.GITHUB_EVENT_NAME, 'HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
  const runId = requiredString(environment.GITHUB_RUN_ID, 'HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
  const runAttempt = requiredString(environment.GITHUB_RUN_ATTEMPT, 'HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
  const workflowSha = requiredString(environment.GITHUB_SHA, 'HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
  if (
    !REPOSITORY.test(repository)
    || !workflowRef.startsWith(`${repository}/${workflowPath}@refs/`)
    || !RUN_ID.test(runId)
    || !RUN_ATTEMPT.test(runAttempt)
    || !SHA.test(workflowSha)
    || !SHA.test(releaseSha)
  ) {
    throw new Error('HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
  }
  return Object.freeze({
    authority: 'github-actions',
    workflowPath,
    workflowRef,
    repository,
    eventName,
    runId,
    runAttempt,
    workflowSha,
    releaseSha,
  });
};

export const resolveHostedAcceptanceWorkflowPath = ({ environment, allowedWorkflowPaths }) => {
  if (!Array.isArray(allowedWorkflowPaths) || allowedWorkflowPaths.length === 0) {
    throw new Error('HOSTED_ACCEPTANCE_WORKFLOW_ALLOWLIST_REJECTED');
  }
  if (environment.GITHUB_ACTIONS !== 'true') return allowedWorkflowPaths[0];
  const repository = requiredString(environment.GITHUB_REPOSITORY, 'HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
  const workflowRef = requiredString(environment.GITHUB_WORKFLOW_REF, 'HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
  if (!REPOSITORY.test(repository)) throw new Error('HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
  const matches = allowedWorkflowPaths.filter(path => workflowRef.startsWith(`${repository}/${path}@refs/`));
  if (matches.length !== 1) throw new Error('HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
  return matches[0];
};

export const deriveExpectedHostedAcceptanceMetadata = ({
  environment,
  exactCommand,
  configPath,
  sourcePaths,
  workflowPath,
}) => {
  if (environment.ACCEPTANCE_EXECUTION_KIND !== 'hosted_preview') {
    throw new Error('HOSTED_ACCEPTANCE_EXECUTION_KIND_REJECTED');
  }
  const releaseSha = requiredString(environment.RELEASE_SHA, 'HOSTED_ACCEPTANCE_RELEASE_SHA_REJECTED');
  const deployId = requiredString(environment.NETLIFY_DEPLOY_ID, 'HOSTED_ACCEPTANCE_DEPLOY_ID_REJECTED');
  if (!SHA.test(releaseSha)) throw new Error('HOSTED_ACCEPTANCE_RELEASE_SHA_REJECTED');
  if (!DEPLOY_ID.test(deployId)) throw new Error('HOSTED_ACCEPTANCE_DEPLOY_ID_REJECTED');
  if (!Array.isArray(exactCommand) || exactCommand.length < 2 || exactCommand.some(value => typeof value !== 'string' || !value)) {
    throw new Error('HOSTED_ACCEPTANCE_COMMAND_REJECTED');
  }
  if (!Array.isArray(sourcePaths) || sourcePaths.length === 0 || sourcePaths.some(value => typeof value !== 'string' || !value)) {
    throw new Error('HOSTED_ACCEPTANCE_SOURCE_REJECTED');
  }
  const runtime = createHostedAcceptanceWorkflowRuntime({ environment, workflowPath, releaseSha });
  if (!runtime) throw new Error('HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REQUIRED');
  return Object.freeze({
    schemaVersion: 'acceptance-report-profile-v1',
    evidenceKind: 'hosted-preview-acceptance',
    executionKind: 'hosted_preview',
    exactCommand: [...exactCommand],
    configPath: requiredString(configPath, 'HOSTED_ACCEPTANCE_CONFIG_REJECTED'),
    sourcePaths: [...sourcePaths],
    exactHead: releaseSha,
    targetOrigin: exactOrigin(environment.HOSTED_PILOT_URL),
    deployId,
    workflowRuntime: runtime,
  });
};
