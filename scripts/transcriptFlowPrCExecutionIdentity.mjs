import path from 'node:path';

import { PR_C_BASE_SHA, PR_C_WORKFLOW_PATH } from './transcriptFlowPrCEvidenceScope.mjs';

export const PR_C_EXECUTION_IDENTITY_VERSION = 'governed-delivery-monitor-pr-c-execution-identity-1';
export const PR_C_GITHUB_CLASSIFICATION = 'github_candidate';
export const PR_C_LOCAL_CLASSIFICATION = 'local_candidate';
export const PR_C_EXECUTION_CLASSIFICATIONS = [PR_C_GITHUB_CLASSIFICATION, PR_C_LOCAL_CLASSIFICATION];

const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};

const normalizePath = value => value.replaceAll('\\', '/');

const requireCanonicalPositiveDecimal = (value, code) => {
  assert(typeof value === 'string' && /^[1-9][0-9]*$/u.test(value), code);
  return value;
};

const requireSha = (value, code) => {
  assert(typeof value === 'string' && /^[0-9a-f]{40}$/u.test(value), code);
  return value;
};

const requireDigest = (value, code) => {
  assert(typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value), code);
  return value;
};

export const parsePrCWorkflowRef = workflowRef => {
  assert(typeof workflowRef === 'string' && workflowRef.length > 0, 'PR_C_GITHUB_WORKFLOW_REF_MISSING');
  const separator = workflowRef.indexOf('@');
  assert(separator > 0 && separator < workflowRef.length - 1, 'PR_C_GITHUB_WORKFLOW_REF_INVALID');
  const repositoryAndPath = workflowRef.slice(0, separator);
  const segments = repositoryAndPath.split('/');
  assert(segments.length >= 4 && segments[0] && segments[1], 'PR_C_GITHUB_WORKFLOW_REF_INVALID');
  const repository = `${segments[0]}/${segments[1]}`;
  const workflowPath = normalizePath(segments.slice(2).join('/'));
  assert(workflowPath === PR_C_WORKFLOW_PATH, 'PR_C_GITHUB_WORKFLOW_PATH');
  return { repository, workflowPath, ref: workflowRef.slice(separator + 1) };
};

const canonicalEvidencePath = ({ workingTreeDigest, executionClassification, runId, runAttempt }) => normalizePath(path.join(
  'output',
  'process-lifecycle-pr-c',
  PR_C_BASE_SHA,
  workingTreeDigest,
  `${executionClassification}-run-${runId}-attempt-${runAttempt}`,
));

export const derivePrCExecutionIdentity = ({ env = process.env, exactHead, workingTreeDigest }) => {
  requireSha(exactHead, 'PR_C_EXECUTION_HEAD_INVALID');
  requireDigest(workingTreeDigest, 'PR_C_EXECUTION_TREE_INVALID');
  assert(env.PR_C_BASE_SHA === PR_C_BASE_SHA, 'PR_C_EXECUTION_BASE_INPUT');
  assert(env.PR_C_EXACT_HEAD_SHA === exactHead, 'PR_C_EXECUTION_HEAD_INPUT');
  assert(env.PR_C_WORKFLOW_PATH === PR_C_WORKFLOW_PATH, 'PR_C_EXECUTION_WORKFLOW_INPUT');

  const githubActions = env.GITHUB_ACTIONS === 'true';
  assert(!env.GITHUB_ACTIONS || env.GITHUB_ACTIONS === 'true' || env.GITHUB_ACTIONS === 'false', 'PR_C_GITHUB_ACTIONS_INVALID');

  let executionClassification;
  let runId;
  let runAttempt;
  let workflowRunId;
  let localRunId;

  if (githubActions) {
    executionClassification = PR_C_GITHUB_CLASSIFICATION;
    assert(env.PR_C_EXECUTION_CLASSIFICATION === executionClassification, 'PR_C_GITHUB_CLASSIFICATION');
    workflowRunId = requireCanonicalPositiveDecimal(env.GITHUB_RUN_ID, 'PR_C_GITHUB_RUN_ID');
    runAttempt = requireCanonicalPositiveDecimal(env.GITHUB_RUN_ATTEMPT, 'PR_C_GITHUB_RUN_ATTEMPT');
    const parsed = parsePrCWorkflowRef(env.GITHUB_WORKFLOW_REF);
    assert(typeof env.GITHUB_REPOSITORY === 'string' && env.GITHUB_REPOSITORY === parsed.repository, 'PR_C_GITHUB_REPOSITORY');
    assert(env.PR_C_WORKFLOW_RUN_ID === workflowRunId, 'PR_C_GITHUB_RUN_ID_INPUT');
    assert(env.PR_C_RUN_ATTEMPT === runAttempt, 'PR_C_GITHUB_RUN_ATTEMPT_INPUT');
    assert(!env.PR_C_LOCAL_RUN_ID && !env.PR_C_LOCAL_RUN_ATTEMPT, 'PR_C_GITHUB_LOCAL_IDENTITY_FORBIDDEN');
    runId = workflowRunId;
    localRunId = null;
  } else {
    executionClassification = PR_C_LOCAL_CLASSIFICATION;
    assert(env.PR_C_EXECUTION_CLASSIFICATION === executionClassification, 'PR_C_LOCAL_CLASSIFICATION');
    assert(typeof env.PR_C_LOCAL_RUN_ID === 'string' && /^local-[a-z0-9][a-z0-9._-]{2,63}$/u.test(env.PR_C_LOCAL_RUN_ID), 'PR_C_LOCAL_RUN_ID');
    runAttempt = requireCanonicalPositiveDecimal(env.PR_C_LOCAL_RUN_ATTEMPT, 'PR_C_LOCAL_RUN_ATTEMPT');
    assert(!env.PR_C_WORKFLOW_RUN_ID && !env.PR_C_RUN_ATTEMPT, 'PR_C_LOCAL_GITHUB_IDENTITY_FORBIDDEN');
    runId = env.PR_C_LOCAL_RUN_ID;
    localRunId = runId;
    workflowRunId = null;
  }

  const identity = {
    contractVersion: PR_C_EXECUTION_IDENTITY_VERSION,
    executionClassification,
    acceptedMainBaseline: PR_C_BASE_SHA,
    exactHead,
    workingTreeDigest,
    workflowPath: PR_C_WORKFLOW_PATH,
    workflowRunId,
    localRunId,
    runId,
    runAttempt,
    canonicalEvidencePath: canonicalEvidencePath({ workingTreeDigest, executionClassification, runId, runAttempt }),
    artifactName: `governed-delivery-monitor-pr-c-${runId}-${runAttempt}`,
  };
  return Object.freeze(identity);
};

export const resolvePrCCanonicalEvidenceDirectory = (root, identity) => path.resolve(root, identity.canonicalEvidencePath);

export const assertPrCCanonicalEvidenceDirectory = (root, identity, evidenceDir) => {
  const expected = resolvePrCCanonicalEvidenceDirectory(root, identity);
  assert(path.resolve(evidenceDir) === expected, 'PR_C_EVIDENCE_CANONICAL_PATH');
  return expected;
};

export const prCExecutionProof = identity => ({
  exactHeadGitHubCi: identity.executionClassification === PR_C_GITHUB_CLASSIFICATION ? 'executed' : 'not_run',
  netlifyHostedPreview: 'not_run',
});
