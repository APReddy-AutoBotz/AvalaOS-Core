import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertPrCCanonicalEvidenceDirectory,
  derivePrCExecutionIdentity,
  prCExecutionProof,
  resolvePrCCanonicalEvidenceDirectory,
} from './transcriptFlowPrCExecutionIdentity.mjs';
import { PR_C_BASE_SHA, PR_C_WORKFLOW_PATH } from './transcriptFlowPrCEvidenceScope.mjs';

const head = 'a'.repeat(40);
const tree = 'b'.repeat(64);
const github = () => ({
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'APReddy-AutoBotz/AvalaOS-Core',
  GITHUB_RUN_ID: '31000001234',
  GITHUB_RUN_ATTEMPT: '2',
  GITHUB_WORKFLOW_REF: `APReddy-AutoBotz/AvalaOS-Core/${PR_C_WORKFLOW_PATH}@refs/pull/264/merge`,
  PR_C_EXECUTION_CLASSIFICATION: 'github_candidate',
  PR_C_BASE_SHA: PR_C_BASE_SHA,
  PR_C_EXACT_HEAD_SHA: head,
  PR_C_WORKFLOW_PATH: PR_C_WORKFLOW_PATH,
  PR_C_WORKFLOW_RUN_ID: '31000001234',
  PR_C_RUN_ATTEMPT: '2',
});
const local = () => ({
  GITHUB_ACTIONS: 'false',
  PR_C_EXECUTION_CLASSIFICATION: 'local_candidate',
  PR_C_BASE_SHA: PR_C_BASE_SHA,
  PR_C_EXACT_HEAD_SHA: head,
  PR_C_WORKFLOW_PATH: PR_C_WORKFLOW_PATH,
  PR_C_LOCAL_RUN_ID: 'local-precommit',
  PR_C_LOCAL_RUN_ATTEMPT: '30',
});

test('derives one canonical GitHub identity from independent Actions values', () => {
  const identity = derivePrCExecutionIdentity({ env: github(), exactHead: head, workingTreeDigest: tree });
  assert.equal(identity.workflowRunId, '31000001234');
  assert.equal(identity.runAttempt, '2');
  assert.equal(identity.canonicalEvidencePath.endsWith('github_candidate-run-31000001234-attempt-2'), true);
  assert.equal(identity.artifactName, 'governed-delivery-monitor-pr-c-31000001234-2');
  assert.deepEqual(prCExecutionProof(identity), { exactHeadGitHubCi: 'executed', netlifyHostedPreview: 'not_run' });
});

test('workflow supplies the cross-check inputs and run-bound artifact name', () => {
  const workflow = readFileSync('.github/workflows/transcript-flow-pr-c.yml', 'utf8');
  assert.match(workflow, /PR_C_EXECUTION_CLASSIFICATION: github_candidate/u);
  assert.match(workflow, /PR_C_WORKFLOW_PATH: \.github\/workflows\/transcript-flow-pr-c\.yml/u);
  assert.match(workflow, /PR_C_WORKFLOW_RUN_ID: \$\{\{ github\.run_id \}\}/u);
  assert.match(workflow, /PR_C_RUN_ATTEMPT: \$\{\{ github\.run_attempt \}\}/u);
  assert.match(workflow, /name: governed-delivery-monitor-pr-c-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/u);
});

test('rejects missing, non-numeric, or manifest-style substituted GitHub run IDs', () => {
  const missing = github();
  delete missing.GITHUB_RUN_ID;
  assert.throws(() => derivePrCExecutionIdentity({ env: missing, exactHead: head, workingTreeDigest: tree }), /PR_C_GITHUB_RUN_ID/u);
  const nonNumeric = github();
  nonNumeric.GITHUB_RUN_ID = 'run-31000001234';
  assert.throws(() => derivePrCExecutionIdentity({ env: nonNumeric, exactHead: head, workingTreeDigest: tree }), /PR_C_GITHUB_RUN_ID/u);
  const substituted = github();
  substituted.PR_C_WORKFLOW_RUN_ID = '31000009999';
  assert.throws(() => derivePrCExecutionIdentity({ env: substituted, exactHead: head, workingTreeDigest: tree }), /PR_C_GITHUB_RUN_ID_INPUT/u);
});

test('rejects stale or non-positive GitHub attempts', () => {
  const stale = github();
  stale.PR_C_RUN_ATTEMPT = '1';
  assert.throws(() => derivePrCExecutionIdentity({ env: stale, exactHead: head, workingTreeDigest: tree }), /PR_C_GITHUB_RUN_ATTEMPT_INPUT/u);
  const zero = github();
  zero.GITHUB_RUN_ATTEMPT = '0';
  assert.throws(() => derivePrCExecutionIdentity({ env: zero, exactHead: head, workingTreeDigest: tree }), /PR_C_GITHUB_RUN_ATTEMPT/u);
});

test('rejects wrong workflow, base, and exact head inputs', () => {
  const workflow = github();
  workflow.GITHUB_WORKFLOW_REF = 'APReddy-AutoBotz/AvalaOS-Core/.github/workflows/other.yml@refs/heads/main';
  assert.throws(() => derivePrCExecutionIdentity({ env: workflow, exactHead: head, workingTreeDigest: tree }), /PR_C_GITHUB_WORKFLOW_PATH/u);
  const base = github();
  base.PR_C_BASE_SHA = 'c'.repeat(40);
  assert.throws(() => derivePrCExecutionIdentity({ env: base, exactHead: head, workingTreeDigest: tree }), /PR_C_EXECUTION_BASE_INPUT/u);
  const wrongHead = github();
  wrongHead.PR_C_EXACT_HEAD_SHA = 'd'.repeat(40);
  assert.throws(() => derivePrCExecutionIdentity({ env: wrongHead, exactHead: head, workingTreeDigest: tree }), /PR_C_EXECUTION_HEAD_INPUT/u);
});

test('requires explicit local identity and never promotes it to GitHub or preview proof', () => {
  const identity = derivePrCExecutionIdentity({ env: local(), exactHead: head, workingTreeDigest: tree });
  assert.equal(identity.workflowRunId, null);
  assert.equal(identity.localRunId, 'local-precommit');
  assert.deepEqual(prCExecutionProof(identity), { exactHeadGitHubCi: 'not_run', netlifyHostedPreview: 'not_run' });
  const implicit = local();
  delete implicit.PR_C_LOCAL_RUN_ID;
  assert.throws(() => derivePrCExecutionIdentity({ env: implicit, exactHead: head, workingTreeDigest: tree }), /PR_C_LOCAL_RUN_ID/u);
  const contaminated = local();
  contaminated.PR_C_WORKFLOW_RUN_ID = '31000001234';
  assert.throws(() => derivePrCExecutionIdentity({ env: contaminated, exactHead: head, workingTreeDigest: tree }), /PR_C_LOCAL_GITHUB_IDENTITY_FORBIDDEN/u);
});

test('rejects arbitrary canonical paths and copied attempts', () => {
  const root = 'D:\\synthetic-root';
  const first = derivePrCExecutionIdentity({ env: github(), exactHead: head, workingTreeDigest: tree });
  const copiedEnv = github();
  copiedEnv.GITHUB_RUN_ATTEMPT = '3';
  copiedEnv.PR_C_RUN_ATTEMPT = '3';
  const copied = derivePrCExecutionIdentity({ env: copiedEnv, exactHead: head, workingTreeDigest: tree });
  const firstDirectory = resolvePrCCanonicalEvidenceDirectory(root, first);
  assert.throws(() => assertPrCCanonicalEvidenceDirectory(root, copied, firstDirectory), /PR_C_EVIDENCE_CANONICAL_PATH/u);
  assert.throws(() => assertPrCCanonicalEvidenceDirectory(root, first, `${firstDirectory}-substituted`), /PR_C_EVIDENCE_CANONICAL_PATH/u);
});
