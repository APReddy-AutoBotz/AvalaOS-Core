const SHA = /^[0-9a-f]{40}$/u;
const DEPLOY_ID = /^[0-9a-f]{24}$/u;
const RUN_ID = /^[1-9][0-9]*$/u;
const RUN_ATTEMPT = /^[1-9][0-9]*$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
export const EXHAUSTIVE_ACCEPTANCE_WORKFLOW = '.github/workflows/exhaustive-acceptance.yml';
export const PREVIEW_EXHAUSTIVE_BROWSER_WORKFLOW = '.github/workflows/preview-exhaustive-browser-qa.yml';
export const EXHAUSTIVE_ACCEPTANCE_DISPATCH_BRIDGE_WORKFLOW = '.github/workflows/exhaustive-acceptance-dispatch-bridge.yml';

const STABLE_REPOSITORY = 'APReddy-AutoBotz/AvalaOS-Core';
const STABLE_ACTOR = 'APReddy-AutoBotz';
const STABLE_ORIGIN = 'https://avalaos-pilot.netlify.app';
const DISPATCH_BRANCH_PREFIX = 'exhaustive-acceptance-dispatch--';

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

const workflowRefParts = ({ repository, workflowRef }) => {
  const prefix = `${repository}/`;
  const separator = workflowRef.indexOf('@refs/', prefix.length);
  if (!workflowRef.startsWith(prefix) || separator < 0) {
    throw new Error('HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
  }
  const workflowPath = workflowRef.slice(prefix.length, separator);
  const ref = workflowRef.slice(separator + 1);
  if (!workflowPath || !ref) throw new Error('HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
  return Object.freeze({ workflowPath, ref });
};

const releaseShaFromEnvironment = environment => {
  const supplied = [
    environment.RELEASE_SHA,
    environment.EXPECTED_RELEASE_SHA,
    environment.ACCEPTANCE_RELEASE_SHA,
  ].filter(value => value !== undefined && value !== '');
  if (supplied.length === 0 || supplied.some(value => !SHA.test(value)) || new Set(supplied).size !== 1) {
    throw new Error('HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
  }
  return supplied[0];
};

const validateDispatchBridgeRuntime = ({ environment, repository, workflowRef, releaseSha }) => {
  const deployId = workflowRef.slice(workflowRef.lastIndexOf(DISPATCH_BRANCH_PREFIX) + DISPATCH_BRANCH_PREFIX.length);
  const branch = `${DISPATCH_BRANCH_PREFIX}${deployId}`;
  const declarationOnly = environment.ACCEPTANCE_EXECUTION_KIND === 'declaration_only';
  if (
    repository !== STABLE_REPOSITORY
    || environment.ACCEPTANCE_WORKFLOW_PATH !== EXHAUSTIVE_ACCEPTANCE_WORKFLOW
    || environment.ACCEPTANCE_EVIDENCE_ENVIRONMENT !== 'stable-release'
    || environment.GITHUB_EVENT_NAME !== 'create'
    || environment.GITHUB_REF_TYPE !== 'branch'
    || environment.GITHUB_ACTOR !== STABLE_ACTOR
    || environment.GITHUB_TRIGGERING_ACTOR !== STABLE_ACTOR
    || !DEPLOY_ID.test(deployId)
    || workflowRef !== `${repository}/${EXHAUSTIVE_ACCEPTANCE_DISPATCH_BRIDGE_WORKFLOW}@refs/heads/${branch}`
    || environment.GITHUB_REF !== `refs/heads/${branch}`
    || environment.GITHUB_SHA !== releaseSha
    || releaseShaFromEnvironment(environment) !== releaseSha
    || (!declarationOnly && environment.NETLIFY_DEPLOY_ID !== deployId)
    || (!declarationOnly && environment.HOSTED_PILOT_URL !== STABLE_ORIGIN)
    || (declarationOnly && (environment.NETLIFY_DEPLOY_ID || environment.HOSTED_PILOT_URL))
  ) {
    throw new Error('HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
  }
  return Object.freeze({ callerWorkflowPath: EXHAUSTIVE_ACCEPTANCE_DISPATCH_BRIDGE_WORKFLOW, deployId });
};

export const createHostedAcceptanceWorkflowRuntime = ({ environment, workflowPath, releaseSha }) => {
  if (environment.GITHUB_ACTIONS !== 'true') return null;
  const repository = requiredString(environment.GITHUB_REPOSITORY, 'HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
  const workflowRef = requiredString(environment.GITHUB_WORKFLOW_REF, 'HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
  const eventName = requiredString(environment.GITHUB_EVENT_NAME, 'HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
  const runId = requiredString(environment.GITHUB_RUN_ID, 'HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
  const runAttempt = requiredString(environment.GITHUB_RUN_ATTEMPT, 'HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
  const workflowSha = requiredString(environment.GITHUB_SHA, 'HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
  const caller = workflowRefParts({ repository, workflowRef });
  const bridge = caller.workflowPath === EXHAUSTIVE_ACCEPTANCE_DISPATCH_BRIDGE_WORKFLOW
    ? validateDispatchBridgeRuntime({ environment, repository, workflowRef, releaseSha })
    : null;
  if (
    !REPOSITORY.test(repository)
    || (bridge !== null && workflowPath !== EXHAUSTIVE_ACCEPTANCE_WORKFLOW)
    || (bridge === null && caller.workflowPath !== workflowPath)
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
    ...(bridge ? { callerWorkflowPath: bridge.callerWorkflowPath } : {}),
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
  const caller = workflowRefParts({ repository, workflowRef });
  const matches = allowedWorkflowPaths.filter(path => caller.workflowPath === path);
  if (matches.length === 1) {
    const declaredWorkflowPath = environment.ACCEPTANCE_WORKFLOW_PATH;
    if (declaredWorkflowPath !== undefined && declaredWorkflowPath !== matches[0]) {
      throw new Error('HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED');
    }
    return matches[0];
  }
  if (
    caller.workflowPath === EXHAUSTIVE_ACCEPTANCE_DISPATCH_BRIDGE_WORKFLOW
    && allowedWorkflowPaths.includes(EXHAUSTIVE_ACCEPTANCE_WORKFLOW)
  ) {
    const releaseSha = releaseShaFromEnvironment(environment);
    validateDispatchBridgeRuntime({ environment, repository, workflowRef, releaseSha });
    return EXHAUSTIVE_ACCEPTANCE_WORKFLOW;
  }
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
    ci: {},
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
